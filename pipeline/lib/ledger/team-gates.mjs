// The team gates (data/gates/team-factoids.json) over a team ledger. Takes match rows in the long
// shape (matches.jsonl, or the compact file decoded by decode.mjs), rebuilds the team ledger cut at
// each gate's `as_of`, and checks every `checkable: "full"` assertion. Prints ledger vs expected.
import { buildTeamLedger, firstN } from './team.mjs'
import { nameKey } from './rules.mjs'

const label = (s) => `${s}-${String(s + 1).slice(2)}`
const FLOOR = { 'eng.1': 2002 }

function testOf(gate, a) {
  if (a.test === 'loss') return 'losing'
  if (a.test === 'win') return 'winning'
  const t = gate.query?.stat?.test?.[0]
  if (!t) return null
  if (t.venue === 'home' && t.GF === 0) return 'home-lost-scoreless'
  const r = (t.result || []).slice().sort().join('')
  return { DL: 'winless', L: 'losing', DW: 'unbeaten', W: 'winning' }[r] ?? null
}

// competition rank with ties: "T4" when shared
function rankOf(list, value, dir) {
  const better = list.filter((v) => (dir === 'fewest' ? v < value : v > value)).length
  const same = list.filter((v) => v === value).length
  return same > 1 ? `T${better + 1}` : better + 1
}

export function runTeamGates(gates, matches, { corrections } = {}) {
  const cache = new Map()
  const ledgerAt = (asOf) => {
    if (!cache.has(asOf)) cache.set(asOf, buildTeamLedger(matches, { corrections, asOf }))
    return cache.get(asOf)
  }
  const results = []
  for (const gate of gates) {
    const comp = gate.scope?.competitions?.[0] ?? 'eng.1'
    const L = ledgerAt(gate.as_of)
    const seasons = L.seasons.filter((s) => s.comp === comp && s.season >= (FLOOR[comp] ?? 2002))
    const teamIds = new Map()
    for (const s of seasons) teamIds.set(nameKey(s.team), s.teamId)
    const idOf = (name) => teamIds.get(nameKey(name)) ?? [...teamIds].find(([k]) => k.startsWith(nameKey(name)) || nameKey(name).startsWith(k))?.[1]
    const seasonOf = (name, lab) => seasons.find((s) => s.teamId === idOf(name) && s.seasonLabel === lab)
    const rowsOf = (teamId, lab) => L.rows.filter((r) => r.comp === comp && r.teamId === teamId && r.seasonLabel === lab)
    for (const a of gate.assertions) {
      const base = { gate: gate.id, role: a.role, subject: a.subject ?? null, kind: a.kind, season: a.season ?? null, expected: a.expected }
      if (a.checkable !== 'full') { results.push({ ...base, status: 'SKIP', why: `checkable ${a.checkable}: ${a.why ?? ''}`.trim() }); continue }
      try {
        const r = evalAssertion(gate, a, { comp, L, seasons, idOf, seasonOf, rowsOf })
        results.push({ ...base, ...r })
      } catch (e) {
        results.push({ ...base, status: 'ERROR', got: null, why: e.message })
      }
    }
  }
  return results
}

function cmpFields(expected, got) {
  const diffs = []
  for (const [k, v] of Object.entries(expected)) {
    if (k === 'position_min') { if (!(got.position >= v)) diffs.push(`position ${got.position} < ${v}`); continue }
    if (got[k] === undefined) { diffs.push(`${k}: not computed`); continue }
    if (got[k] !== v) diffs.push(`${k} ${got[k]} vs ${v}`)
  }
  return diffs
}

function seasonFields(s) {
  return { points: s.points, W: s.W, D: s.D, L: s.L, GF: s.GF, GA: s.GA, GD: s.GD, P: s.P, GA_per_game: Math.round((s.GA / s.P) * 100) / 100, position: s.pos, margin: s.margin }
}

function evalAssertion(gate, a, ctx) {
  const { comp, L, seasons, idOf, seasonOf, rowsOf } = ctx
  const stat = gate.query?.stat?.stat
  const dir = gate.query?.how?.dir
  switch (a.kind) {
    case 'team-season': {
      const s = seasonOf(a.subject, a.season)
      if (!s) throw new Error(`no ${a.subject} ${a.season} in ${comp}`)
      const got = seasonFields(s)
      const diffs = cmpFields(a.expected, got)
      let rank = null
      if (a.rank != null && ['points', 'GA', 'L'].includes(stat)) {
        const field = seasons.filter((x) => x.complete).map((x) => (stat === 'points' ? x.points : x[stat]))
        rank = rankOf(field, stat === 'points' ? s.points : s[stat], dir)
        if (String(rank) !== String(a.rank)) diffs.push(`rank ${rank} vs ${a.rank}`)
      }
      return { status: diffs.length ? 'FAIL' : 'PASS', got: pick(got, a.expected), rank, diffs }
    }
    case 'first-n': {
      const s = seasonOf(a.subject, a.season)
      const got = firstN(rowsOf(s.teamId, a.season), a.n)
      const diffs = cmpFields(a.expected, got)
      return { status: diffs.length ? 'FAIL' : 'PASS', got: pick(got, a.expected), diffs }
    }
    case 'winless-start': {
      const s = seasonOf(a.subject, a.season)
      const rows = rowsOf(s.teamId, a.season).sort((x, y) => x.tgn - y.tgn)
      const fw = rows.find((r) => r.result === 'W')
      const diffs = []
      if (s.winlessStart !== a.expected) diffs.push(`winless start ${s.winlessStart} vs ${a.expected}`)
      if (a.first_win?.tgn && fw?.tgn !== a.first_win.tgn) diffs.push(`first win tgn ${fw?.tgn} vs ${a.first_win.tgn}`)
      if (a.first_win?.date && fw?.date.slice(0, 10) !== a.first_win.date) diffs.push(`first win ${fw?.date.slice(0, 10)} vs ${a.first_win.date}`)
      return { status: diffs.length ? 'FAIL' : 'PASS', got: { winlessStart: s.winlessStart, firstWin: fw ? `${fw.date.slice(0, 10)} tgn ${fw.tgn} v ${fw.opp} ${fw.GF}-${fw.GA}` : null }, diffs }
    }
    case 'run': {
      if (gate.query?.window?.seq === 'seasons') return seasonRun(a, seasons, idOf)
      const test = testOf(gate, a)
      const id = idOf(a.subject)
      let runs = L.runs.filter((r) => r.comp === comp && r.test === test && r.teamId === id)
      if (a.season) runs = runs.filter((r) => r.seasons.some((p) => p.season === a.season))
      if (a.date) runs = runs.filter((r) => r.from.date.slice(0, 7) <= a.date && r.to.date.slice(0, 7) >= a.date)
      if (a.span?.from) runs = runs.filter((r) => r.from.date <= a.span.from && r.to.date >= a.span.from)
      const run = runs.sort((x, y) => y.len - x.len)[0]
      if (!run) throw new Error(`no ${test} run for ${a.subject}`)
      const diffs = []
      // a season-scoped run that doesn't say it crosses seasons is the part inside that season
      // (Sunderland "lost their last 15" of 2002-03, the first 15 of the 20)
      const inSeason = a.season && !a.crosses_seasons ? run.seasons.find((p) => p.season === a.season).n : null
      if (inSeason != null && inSeason !== run.len) { if (inSeason !== a.expected) diffs.push(`length in ${a.season} ${inSeason} vs ${a.expected}`) }
      else if (run.len !== a.expected) diffs.push(`length ${run.len} vs ${a.expected}`)
      if (a.span?.from && run.from.date !== a.span.from) diffs.push(`from ${run.from.date} vs ${a.span.from}`)
      if (a.span?.to && run.to.date !== a.span.to) diffs.push(`to ${run.to.date} vs ${a.span.to}`)
      if (a.ongoing != null && run.ongoing !== a.ongoing) diffs.push(`ongoing ${run.ongoing} vs ${a.ongoing}`)
      if (a.GA_in_run != null && run.GA !== a.GA_in_run) diffs.push(`GA in run ${run.GA} vs ${a.GA_in_run}`)
      if (a.parts) {
        for (const [k, v] of Object.entries(a.parts)) {
          const m = /^(end|start)_of_(\d{4}-\d{2})$/.exec(k)
          const p = m && run.seasons.find((x) => x.season === m[2])
          if (!p || p.n !== v) diffs.push(`${k} ${p?.n} vs ${v}`)
        }
      }
      if (a.seasons_spanned && run.seasons.map((p) => p.season).join(',') !== a.seasons_spanned.join(',')) diffs.push(`seasons ${run.seasons.map((p) => p.season)} vs ${a.seasons_spanned}`)
      let rank = null
      if (a.rank != null) {
        const field = L.runs.filter((r) => r.comp === comp && r.test === test && !r.truncated).map((r) => r.len)
        rank = rankOf(field, run.len, 'most')
        if (String(rank) !== String(a.rank)) diffs.push(`rank ${rank} vs ${a.rank}`)
      }
      return { status: diffs.length ? 'FAIL' : 'PASS', got: { len: run.len, from: run.from.date, to: run.to.date, seasons: run.seasons, W: run.W, D: run.D, L: run.L, GA: run.GA, ongoing: run.ongoing, truncated: run.truncated }, rank, diffs }
    }
    case 'clinch': {
      const s = seasonOf(a.subject, a.season)
      const which = s.pos === 1 ? 'titleClinch' : 'relegationClinch'
      const c = s[which]
      const diffs = []
      if (!c) diffs.push(`no ${which} computed`)
      else {
        if (a.expected.games_left != null && c.gamesLeft !== a.expected.games_left) diffs.push(`games left ${c.gamesLeft} vs ${a.expected.games_left}`)
        if (a.expected.date && c.date !== a.expected.date) diffs.push(`date ${c.date} vs ${a.expected.date}`)
      }
      let rank = null
      if (a.rank != null && c) {
        if (a.variant === 'by calendar date') {
          // calendar month and day within the season (July = 0; 2019-20 ran into July 2020 = 12),
          // so 29 March beats 30 March whatever the leap years
          const day = (x) => { const [y, m, d] = x[which].date.split('-').map(Number); return ((y - x.season) * 12 + m - 7) * 100 + d }
          const field = seasons.filter((x) => x[which]).map(day)
          rank = rankOf(field, day(s), 'fewest')
        } else {
          const field = seasons.map((x) => x[which]).filter(Boolean).map((x) => x.gamesLeft)
          rank = rankOf(field, c.gamesLeft, 'most')
        }
        if (String(rank) !== String(a.rank)) diffs.push(`rank ${rank} vs ${a.rank}`)
      }
      return { status: diffs.length ? 'FAIL' : 'PASS', got: c ? { which, ...c } : null, rank, diffs }
    }
    case 'visible-bottom-5': {
      const field = seasons.filter((x) => x.complete).sort((x, y) => x.points - y.points)
      const got = field.slice(0, 5).map((x) => `${x.team} ${x.seasonLabel} ${x.points}`)
      const want = a.expected.map((e) => { const m = /^(.*) (\d{4}-\d{2}) (\d+)$/.exec(e); return { name: m[1], season: m[2], pts: Number(m[3]) } })
      const diffs = []
      // order inside a points tie is the publisher's choice: compare as a set, and the points in order
      const top = field.slice(0, 5)
      want.forEach((w, i) => {
        if (top[i]?.points !== w.pts) diffs.push(`#${i + 1} ${got[i]} vs ${w.name} ${w.season} ${w.pts}`)
        if (!top.some((g) => nameKey(g.team).startsWith(nameKey(w.name)) && g.seasonLabel === w.season && g.points === w.pts)) diffs.push(`${w.name} ${w.season} ${w.pts} not in the bottom five`)
      })
      const sixth = field[5] ? `${field[5].team} ${field[5].seasonLabel} ${field[5].points}` : null
      return { status: diffs.length ? 'FAIL' : 'PASS', got: { bottom5: got, sixth }, diffs }
    }
    case 'visible-count': {
      const ms = L.rows.filter((r) => r.comp === comp && r.GF === 9 && r.GA === 0)
      const got = ms.map((r) => `${r.home ? r.team : r.opp} ${r.home ? r.GF : r.GA}-${r.home ? r.GA : r.GF} ${r.home ? r.opp : r.team} (${r.date.slice(0, 10)})`)
      const diffs = ms.length !== a.expected ? [`count ${ms.length} vs ${a.expected}`] : []
      return { status: diffs.length ? 'FAIL' : 'PASS', got, diffs }
    }
    case 'run-split': {
      return { status: 'RECORD', got: 'see the run assertion (W/D in got)', diffs: [] }
    }
    default:
      return { status: 'SKIP', why: `kind ${a.kind} has no evaluator`, diffs: [] }
  }
}

function seasonRun(a, seasons, idOf) {
  const id = idOf(a.subject)
  const mine = seasons.filter((s) => s.teamId === id && s.complete).sort((x, y) => x.season - y.season)
  let best = [], cur = []
  for (const s of mine) {
    if (s.pos === 1 && (!cur.length || cur[cur.length - 1].season === s.season - 1)) cur.push(s)
    else cur = s.pos === 1 ? [s] : []
    if (cur.length > best.length) best = cur.slice()
  }
  const got = best.map((s) => s.seasonLabel)
  const diffs = []
  if (best.length !== a.expected) diffs.push(`length ${best.length} vs ${a.expected}`)
  if (a.seasons && got.join(',') !== a.seasons.join(',')) diffs.push(`seasons ${got} vs ${a.seasons}`)
  return { status: diffs.length ? 'FAIL' : 'PASS', got, diffs }
}

const pick = (got, expected) => (got ? Object.fromEntries(Object.keys(expected).map((k) => [k, k === 'position_min' ? got.position : got[k]])) : got)
