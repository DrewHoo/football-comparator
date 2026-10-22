// The team side of the ledger: one row per team per match, the team-season tables, positions,
// clinch moments and runs, all from matches.jsonl (the index scores every match, cached or not, so
// this is full-scope even while the summaries are still being harvested). Pure functions: the
// build (pipeline/build-teams.mjs), the compact encoder and the gate evaluator all call these, and
// the site's TypeScript port should be a line-by-line copy. See pipeline/docs/compact.md §Teams.
//
// Definitions (data/gates/team-factoids.json `team_ledger`):
//   result      W/D/L from the score after 90/120 minutes; a shootout is a draw (the winner is in
//               the match's `shootout`). AET counts as played.
//   points      on the pitch 3-1-0; table points = pitch points less deductions (data/corrections/teams.json)
//   position    after a matchday where every team in the league-season has played the same number
//               of matches (else null), ranked by table points then the league's tie-break
//   runs        over a team's matches in one competition in date order, crossing seasons and
//               skipping seasons spent outside it (Sunderland 2003-05)
import { compOf } from './ordinals.mjs'

export const POINTS = { W: 3, D: 1, L: 0 }

// Tie-breaks after table points. eng.1 is the gated one (PL rule: GD, then GF). The others are
// the leagues' published orders as far as they matter for a points table; head-to-head is a
// mini-league over the tied teams' matches so far. Not gated outside eng.1.
export const TIEBREAK = {
  'eng.1': ['gd', 'gf'],
  'ger.1': ['gd', 'gf'],
  'fra.1': ['gd', 'gf'],
  'esp.1': ['h2h', 'gd', 'gf'],
  'ita.1': ['h2h', 'gd', 'gf'],
}

// Automatic relegation places, for the relegation clinch. Only the Premier League is gated (3 every
// season since 1995-96); the others vary by season (play-offs, 18- and 20-team years) and are left
// out rather than guessed.
export const RELEGATION_SLOTS = { 'eng.1': () => 3 }

export const isLeague = (comp) => !comp.startsWith('uefa.')

// The run tests. `filter` restricts the sequence (home games only) before the streak is counted.
export const RUN_TESTS = {
  unbeaten: { label: 'unbeaten (W or D)', test: (r) => r.result !== 'L' },
  winless: { label: 'without a win (D or L)', test: (r) => r.result !== 'W' },
  losing: { label: 'losses', test: (r) => r.result === 'L' },
  winning: { label: 'wins', test: (r) => r.result === 'W' },
  scoring: { label: 'scored in', test: (r) => r.GF > 0 },
  scoreless: { label: 'failed to score in', test: (r) => r.GF === 0 },
  'home-lost-scoreless': { label: 'home defeats without scoring', filter: (r) => r.home, test: (r) => r.result === 'L' && r.GF === 0 },
}

const ymd = (iso) => iso.slice(0, 10)
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id))
export const resultOf = (gf, ga) => (gf > ga ? 'W' : gf < ga ? 'L' : 'D')

/** data/corrections/teams.json -> { deductions, results } (an absent file is empty) */
export function teamCorrections(json) {
  const j = json || {}
  return { deductions: j.deductions || [], results: j.results || [] }
}

/**
 * Build the team ledger.
 * @param matches long match rows (matches.jsonl), any summary state
 * @param opts.corrections teamCorrections(...)
 * @param opts.asOf 'YYYY-MM-DD': drop matches after it (gates cut the ledger at the claim's date)
 * @returns { rows, seasons, runs } rows: one per team per match; seasons: one per team per
 *   competition-season; runs: every maximal run (length >= opts.minRun, default 1)
 */
export function buildTeamLedger(matches, { corrections = teamCorrections(), asOf = null, minRun = 1 } = {}) {
  const resultFix = new Map(corrections.results.map((c) => [String(c.matchId), c]))
  const groups = new Map()
  for (const m0 of matches) {
    if (m0.homeScore == null || m0.awayScore == null) continue
    if (asOf && ymd(m0.date) > asOf) continue
    const fix = resultFix.get(String(m0.id))
    const m = fix ? { ...m0, homeScore: fix.homeScore, awayScore: fix.awayScore } : m0
    const comp = compOf(m)
    const k = `${comp}|${m.season}`
    const g = groups.get(k) || { comp, season: m.season, seasonLabel: m.seasonLabel, matches: [] }
    g.matches.push(m)
    groups.set(k, g)
  }
  const rows = [], seasons = []
  for (const g of [...groups.values()].sort((a, b) => (a.comp < b.comp ? -1 : a.comp > b.comp ? 1 : a.season - b.season))) {
    const out = seasonTable(g, corrections.deductions)
    for (const r of out.rows) rows.push(r)
    for (const s of out.seasons) seasons.push(s)
  }
  const runs = computeRuns(rows, minRun)
  return { rows, seasons, runs }
}

function seasonTable(g, deductions) {
  const { comp, season, seasonLabel } = g
  const ms = g.matches.sort(byDate)
  const league = isLeague(comp)
  const label = seasonLabel || `${season}-${String(season + 1).slice(2)}`
  const teams = new Map() // teamId -> state
  const st = (id, name) => {
    let s = teams.get(id)
    if (!s) teams.set(id, (s = { teamId: id, team: name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, pitch: 0, ded: 0, rows: [], h2h: [] }))
    if (name) s.team = name
    return s
  }
  for (const m of ms) { st(m.homeId, m.homeName); st(m.awayId, m.awayName) }
  const myDeds = deductions.filter((d) => d.slug === comp && (d.season === label || d.season === season) && teams.has(String(d.teamId)))
  const pending = myDeds.map((d) => ({ ...d, applied: false }))
  const applyDeds = (date) => {
    for (const d of pending) if (!d.applied && (!d.from || d.from <= date)) { teams.get(String(d.teamId)).ded += d.points; d.applied = true }
  }
  applyDeds('0000-00-00')
  const nTeams = teams.size
  const totalOf = new Map() // teamId -> matches in the season
  for (const m of ms) for (const t of [m.homeId, m.awayId]) totalOf.set(t, (totalOf.get(t) || 0) + 1)
  const recordedK = new Set()
  const slots = league && RELEGATION_SLOTS[comp] ? RELEGATION_SLOTS[comp](season, nTeams) : null
  const clinch = new Map() // teamId -> { title, relegation }
  const rows = []

  for (let i = 0; i < ms.length; i++) {
    const m = ms[i]
    applyDeds(ymd(m.date))
    for (const [side, own, opp, gf, ga] of [['home', m.homeId, m.awayId, m.homeScore, m.awayScore], ['away', m.awayId, m.homeId, m.awayScore, m.homeScore]]) {
      const s = teams.get(own)
      const result = resultOf(gf, ga)
      s.P++; s[result]++; s.GF += gf; s.GA += ga; s.pitch += POINTS[result]
      const r = {
        comp, slug: m.slug, season, seasonLabel: label, teamId: own, team: s.team, matchId: m.id, date: m.date, tgn: s.P,
        home: side === 'home', oppId: opp, opp: teams.get(opp).team, GF: gf, GA: ga, result, pts: POINTS[result],
        cum: { P: s.P, W: s.W, D: s.D, L: s.L, GF: s.GF, GA: s.GA, pts: s.pitch - s.ded },
        pos: null, tied: false, stage: m.stage ?? null, qualifier: !!m.qualifier,
      }
      s.rows.push(r)
      rows.push(r)
    }
    teams.get(m.homeId).h2h.push(m); teams.get(m.awayId).h2h.push(m)
    if (!league) continue
    // a matchday boundary: every team has played the same number
    const k = teams.get(m.homeId).P
    if (!recordedK.has(k)) {
      let all = true
      for (const s of teams.values()) if (s.P !== k) { all = false; break }
      if (all) {
        recordedK.add(k)
        const table = standings([...teams.values()], comp, ms.slice(0, i + 1))
        for (const t of table) { const r = teams.get(t.teamId).rows[k - 1]; r.pos = t.pos; r.tied = t.tied }
      }
    }
    // clinch checks after the last match of this kickoff time
    const next = ms[i + 1]
    if (next && next.date === m.date) continue
    const all = [...teams.values()]
    for (const s of all) {
      const c = clinch.get(s.teamId) || {}
      const left = totalOf.get(s.teamId) - s.P
      const pts = s.pitch - s.ded
      if (!c.title) {
        const rivals = all.filter((o) => o !== s)
        if (rivals.every((o) => o.pitch - o.ded + 3 * (totalOf.get(o.teamId) - o.P) < pts)) c.title = { gamesLeft: left, date: ymd(m.date), matchId: m.id }
      }
      if (slots && !c.relegation) {
        const max = pts + 3 * left
        const above = all.filter((o) => o !== s && o.pitch - o.ded > max).length
        if (above >= nTeams - slots) c.relegation = { gamesLeft: left, date: ymd(m.date), matchId: m.id }
      }
      clinch.set(s.teamId, c)
    }
  }
  applyDeds('9999-99-99')
  const finalTable = league ? standings([...teams.values()], comp, ms) : []
  const finalPos = new Map(finalTable.map((t) => [t.teamId, t]))
  const complete = [...teams.values()].every((s) => s.P === totalOf.get(s.teamId))
  const seasons = []
  for (const s of teams.values()) {
    const f = finalPos.get(s.teamId)
    const firstWin = s.rows.find((r) => r.result === 'W')
    seasons.push({
      comp, season, seasonLabel: label, teamId: s.teamId, team: s.team, teams: nTeams,
      P: s.P, W: s.W, D: s.D, L: s.L, GF: s.GF, GA: s.GA, GD: s.GF - s.GA,
      pointsOnPitch: s.pitch, deduction: s.ded, points: s.pitch - s.ded,
      pos: f ? f.pos : null, tied: f ? f.tied : false,
      margin: f && f.pos === 1 && finalTable.length > 1 ? (s.pitch - s.ded) - finalTable.find((t) => t.teamId !== s.teamId).points : null,
      winlessStart: firstWin ? firstWin.tgn - 1 : s.P,
      titleClinch: clinch.get(s.teamId)?.title ?? null,
      relegationClinch: clinch.get(s.teamId)?.relegation ?? null,
      complete,
    })
  }
  return { rows, seasons }
}

// rank teams by table points, then the league's tie-break; equal on everything = the same position
export function standings(states, comp, matchesSoFar) {
  const order = TIEBREAK[comp] || ['gd', 'gf']
  const t = states.map((s) => ({ teamId: s.teamId, points: s.pitch - s.ded, gd: s.GF - s.GA, gf: s.GF, h2h: 0, h2hgd: 0 }))
  if (order.includes('h2h')) {
    const byPts = new Map()
    for (const x of t) byPts.set(x.points, [...(byPts.get(x.points) || []), x])
    for (const tied of byPts.values()) {
      if (tied.length < 2) continue
      const ids = new Map(tied.map((x) => [x.teamId, x]))
      for (const m of matchesSoFar) {
        const h = ids.get(m.homeId), a = ids.get(m.awayId)
        if (!h || !a) continue
        const r = resultOf(m.homeScore, m.awayScore)
        h.h2h += POINTS[r]; a.h2h += POINTS[r === 'W' ? 'L' : r === 'L' ? 'W' : 'D']
        h.h2hgd += m.homeScore - m.awayScore; a.h2hgd += m.awayScore - m.homeScore
      }
    }
  }
  const key = (x) => [x.points, ...order.flatMap((k) => (k === 'h2h' ? [x.h2h, x.h2hgd] : [x[k]]))]
  const cmp = (a, b) => { const ka = key(a), kb = key(b); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]; return 0 }
  t.sort(cmp)
  for (let i = 0; i < t.length; i++) {
    t[i].pos = i > 0 && cmp(t[i - 1], t[i]) === 0 ? t[i - 1].pos : i + 1
  }
  for (let i = 0; i < t.length; i++) t[i].tied = (i > 0 && t[i - 1].pos === t[i].pos) || (i + 1 < t.length && t[i + 1].pos === t[i].pos)
  return t
}

/**
 * Every maximal run for every test, per team per competition, crossing seasons.
 * `truncated`: the run starts at the team's first match in the competition in the ledger's first
 * season for it, so it may have begun earlier. `ongoing`: it includes the team's last match.
 */
export function computeRuns(rows, minRun = 1) {
  const firstSeason = new Map()
  for (const r of rows) if (!firstSeason.has(r.comp) || r.season < firstSeason.get(r.comp)) firstSeason.set(r.comp, r.season)
  const seqs = new Map()
  for (const r of rows) { const k = `${r.comp}|${r.teamId}`; const l = seqs.get(k) || []; l.push(r); seqs.set(k, l) }
  const runs = []
  for (const [k, all] of seqs) {
    all.sort(byDate2)
    for (const [test, def] of Object.entries(RUN_TESTS)) {
      const seq = def.filter ? all.filter(def.filter) : all
      let start = -1
      for (let i = 0; i <= seq.length; i++) {
        const ok = i < seq.length && def.test(seq[i])
        if (ok && start < 0) start = i
        if (!ok && start >= 0) {
          const len = i - start
          if (len >= minRun) runs.push(runRecord(seq, start, i - 1, test, firstSeason, all))
          start = -1
        }
      }
    }
  }
  return runs
}
const byDate2 = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.matchId) - Number(b.matchId))

function runRecord(seq, a, b, test, firstSeason, all) { // all: the unfiltered sequence
  const from = seq[a], to = seq[b]
  const part = seq.slice(a, b + 1)
  const seasonParts = []
  for (const r of part) { const last = seasonParts[seasonParts.length - 1]; if (last && last.season === r.seasonLabel) last.n++; else seasonParts.push({ season: r.seasonLabel, n: 1 }) }
  return {
    comp: from.comp, teamId: from.teamId, team: to.team, test, len: b - a + 1,
    from: { matchId: from.matchId, date: ymd(from.date), season: from.seasonLabel, tgn: from.tgn },
    to: { matchId: to.matchId, date: ymd(to.date), season: to.seasonLabel, tgn: to.tgn },
    seasons: seasonParts,
    W: part.filter((r) => r.result === 'W').length, D: part.filter((r) => r.result === 'D').length, L: part.filter((r) => r.result === 'L').length,
    GF: part.reduce((n, r) => n + r.GF, 0), GA: part.reduce((n, r) => n + r.GA, 0),
    ongoing: to === seq[seq.length - 1],
    truncated: from === all[0] && from.season === firstSeason.get(from.comp) && from.tgn === 1,
  }
}

/** sums over a team's first n matches of a season (tgn <= n) */
export function firstN(rows, n) {
  const r = rows.filter((x) => x.tgn <= n).sort((a, b) => a.tgn - b.tgn)
  if (r.length < n) return null
  const c = r[r.length - 1].cum
  return { P: c.P, W: c.W, D: c.D, L: c.L, GF: c.GF, GA: c.GA, GD: c.GF - c.GA, points: c.pts }
}
