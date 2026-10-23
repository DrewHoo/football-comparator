// Source adapters: FIFA/UEFA archive records and cached ESPN summaries, normalised to one shape,
//   {src, family, source_id, date, home, away, score:{home,away}, aet, receipt:{url,...}, status, warnings,
//    sides:{home:{team, lineup:bool, players:[P]}, away:{...}}}
//   P = {name, ext_id, shirt, started, appeared (true|false|null = unknown), on_min, off_min, off_reason,
//        minutes, goals, goal_minutes, own_goals, cards}
// Reads only files on disk: data/index/archive/*.json and the ESPN response cache (never fetches).
import fs from 'node:fs'
import path from 'node:path'
import { P, ARCHIVE_SOURCES, readJson } from './io.mjs'

const minutesPlayed = (on, off, end) => (on == null ? null : Math.max(0, Math.min(off ?? end, end) - Math.min(on, end)))

// ---------------------------------------------------------------- archive (FIFA / UEFA via Wayback)

// Goal clock in the archive's own notation, as a string: "68", "45+2", "90+3". FIFA 2002/2006 write first-half
// stoppage as the running minute with a plus ("47+'" = 45+2) and FIFA 1998/2010 and UEFA as "90'+2" (min 90,
// added 2). Rule ARCH-STOP (docs/intl.md §Wikidata): both are the same clock. Only 46+ to 50+ are stoppage: of 25
// FIFA "46+'".."49+'" goals martj42 has 45 for most (Nimni 46+', Riquelme 46+'), while "54+'" (Keane, Ireland v
// Cyprus 2004, martj42 54), "55+'" and "78+'" (Sneijder, martj42 78) are plain minutes.
export function archClock(g) {
  if (g.min == null) return null
  if (g.added) return `${g.min}+${g.added}`
  if (/\d\s*\+/.test(g.raw ?? '')) {
    if (g.min > 45 && g.min <= 50) return `45+${g.min - 45}`
    if (g.min > 90 && g.min <= 105) return `90+${g.min - 90}`
  }
  return String(g.min)
}

/** Rule ARCH-OG: UEFA's Euro 2000 pages list an own goal under the scorer's own team, typed as a goal ("Kovtun 87
 *  ( og )" for Russia in Iceland 1-0 Russia; "Modestus Haas 60" for Liechtenstein in Romania 7-0 Liechtenstein).
 *  A goal is an own goal when its raw text says "( og )", or when its side lists more goals than it scored while the
 *  other side lists fewer (the side's goals beyond its score, latest first, unless one says og). Returns a Set of
 *  goal objects to treat as own goals. */
export function misfiledOwnGoals(r) {
  const out = new Set()
  const gs = (r.goals ?? []).filter((g) => g.type !== 'og')
  for (const g of gs) if (/\(\s*og\s*\)/i.test(g.raw ?? '')) out.add(g)
  const sc = r.score ?? {}
  for (const [side, other] of [['home', 'away'], ['away', 'home']]) {
    if (sc[side] == null || sc[other] == null) continue
    const mine = gs.filter((g) => g.side === side && !out.has(g))
    const theirs = (r.goals ?? []).filter((g) => g.side === other && g.type !== 'og' && !out.has(g)).length + (r.goals ?? []).filter((g) => g.side === side && (g.type === 'og' || out.has(g))).length
    let excess = mine.length - sc[side]
    const short = sc[other] - theirs
    if (excess > 0 && short > 0) for (const g of [...mine].sort((a, b) => (b.min ?? 0) - (a.min ?? 0)).slice(0, Math.min(excess, short))) out.add(g)
  }
  return out
}

export function loadArchive() {
  const out = []
  const counts = {}
  for (const family of ARCHIVE_SOURCES) {
    const recs = readJson(path.join(P.archiveDir, `${family}.json`), [])
    counts[family] = { records: recs.length, parsed: 0, own_goals_refiled: 0 }
    for (const r of recs) {
      const og = misfiledOwnGoals(r)
      counts[family].own_goals_refiled += og.size
      // the lineup entry's goals are copies of the record's goal lines: refile the same (player, minute) ones
      const ogKey = new Set([...og].map((g) => `${g.player}|${g.min}`))
      const isOg = (p, g) => g.type === 'og' || ogKey.has(`${p.name}|${g.min}`)
      const clockOf = new Map((r.goals ?? []).map((g) => [`${g.player}|${g.min}`, archClock(g)]))
      const aet = !!r.score?.aet
      const end = aet ? 120 : 90
      const m = {
        src: 'archive', family, source_id: String(r.source_id), date: r.date, home: r.home, away: r.away,
        score: { home: r.score?.home ?? null, away: r.score?.away ?? null }, aet, status: r.status,
        competition: r.competition, stage: r.stage ?? null,
        receipt: { source: family, source_id: String(r.source_id), url: r.receipts?.at(-1)?.url ?? null },
        warnings: r.warnings ?? [], sides: {},
      }
      if (r.status === 'parsed') counts[family].parsed++
      for (const l of r.lineups ?? []) {
        const players = l.players.map((p) => {
          const red = p.cards?.find((c) => c.type === 'red' || c.type === 'yellow-red')
          const started = p.role === 'starter'
          let appeared = started || p.on_min != null
          // FIFA 1998 often omits substitutes' on-minutes: an unused-looking sub is "unknown", not absent,
          // unless nothing at all marks him (no goal, card or off-minute either way).
          if (!appeared && family === 'fifa1998') appeared = p.goals?.length || p.cards?.length || p.off_min != null ? true : null
          else if (!appeared && (p.goals?.length || p.off_min != null)) appeared = true
          const on = started ? 0 : p.on_min
          const off = p.off_min ?? (red ? red.min : null)
          return {
            name: p.name, ext_id: null, shirt: p.shirt ?? null, gk: !!p.gk, started, appeared,
            on_min: appeared ? on ?? null : null, off_min: appeared ? off ?? null : null,
            off_reason: p.off_reason ?? (red ? 'red' : null),
            minutes: appeared ? minutesPlayed(on, off, end) : null,
            goals: (p.goals ?? []).filter((g) => !isOg(p, g)).length,
            goal_minutes: (p.goals ?? []).filter((g) => !isOg(p, g)).map((g) => g.min),
            goal_clock: (p.goals ?? []).filter((g) => !isOg(p, g)).map((g) => clockOf.get(`${p.name}|${g.min}`) ?? archClock(g)),
            own_goals: (p.goals ?? []).filter((g) => isOg(p, g)).length,
            cards: p.cards ?? [],
          }
        })
        // Rule ARCH-COMPLETE: the record's goal lines (own goals are filed under the side credited) add up to the
        // side's score; where they don't (UEFA's Euro 2004 qualifying index pages list 2 of San Marino 0-5 Hungary's
        // goals), a player's 0 there is unknown, not 0
        const listed = (r.goals ?? []).filter((g) => g.side === l.side).length
        m.sides[l.side] = { team: l.team, lineup: players.length >= 7, players, goals_complete: r.score?.[l.side] != null && listed === r.score[l.side] }
      }
      out.push(m)
    }
  }
  return { matches: out, counts }
}

// ---------------------------------------------------------------- ESPN summaries from the cache

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'
const clockMin = (c) => {
  const m = String(c?.displayValue ?? '').match(/^(\d+)/)
  if (m) return Number(m[1])
  return c?.value != null ? Math.ceil(c.value / 60) : null
}
const isOwnGoal = (e) => /own/i.test(e.type?.type ?? '') || /own goal/i.test(e.type?.text ?? '') || e.ownGoal === true

/** Every international match summary in the ESPN cache (national-team logos, has header.competitions). */
export function scanEspn() {
  const seen = new Map()
  let files = 0
  for (const d of fs.readdirSync(P.espnCache)) {
    const dir = path.join(P.espnCache, d)
    let list
    try { list = fs.readdirSync(dir) } catch { continue }
    for (const f of list) {
      if (!f.endsWith('.json')) continue
      files++
      const t = fs.readFileSync(path.join(dir, f), 'utf8')
      if (!t.includes('teamlogos/countries/') || !t.includes('"header"')) continue
      let j
      try { j = JSON.parse(t) } catch { continue }
      const comp = j?.header?.competitions?.[0]
      if (!comp?.competitors) continue
      const id = String(j.header.id)
      const rosterN = (j.rosters ?? []).reduce((s, r) => s + (r.roster?.length ?? 0), 0)
      const prev = seen.get(id)
      if (!prev || rosterN > prev.rosterN) seen.set(id, { j, rosterN, file: path.join(d, f) })
    }
  }
  return { summaries: [...seen.values()], files }
}

export function normaliseEspn({ j, file }) {
  const comp = j.header.competitions[0]
  const slug = j.header.league?.slug ?? null
  const id = String(j.header.id)
  const status = comp.status?.type?.name ?? null
  const aet = /AET|PEN/i.test(status ?? '') || (j.keyEvents ?? []).some((e) => (e.period?.number ?? 0) > 2 && !e.shootout)
  const end = aet ? 120 : 90
  const bySide = {}
  for (const c of comp.competitors) bySide[c.homeAway] = { teamId: String(c.team?.id), team: c.team?.displayName, score: c.score != null ? Number(c.score) : null }
  const sideOfTeamId = (tid) => (bySide.home?.teamId === String(tid) ? 'home' : bySide.away?.teamId === String(tid) ? 'away' : null)

  // substitutions from keyEvents (participants[0] comes on, [1] goes off), deduped by the (in, out) pair
  const subOn = new Map(), subOff = new Map(), seenPair = new Set()
  for (const e of j.keyEvents ?? []) {
    if (e.type?.type !== 'substitution') continue
    const [a, b] = e.participants ?? []
    const k = `${a?.athlete?.id}|${b?.athlete?.id}`
    if (seenPair.has(k)) continue
    seenPair.add(k)
    const mn = clockMin(e.clock)
    if (a?.athlete?.id && !subOn.has(a.athlete.id)) subOn.set(a.athlete.id, mn)
    if (b?.athlete?.id && !subOff.has(b.athlete.id)) subOff.set(b.athlete.id, mn)
  }
  // goals from keyEvents (scoringPlay, not shootout), own goals apart, deduped (AGENTS.md: events repeat)
  const goals = []
  const seenGoal = new Set()
  for (const e of j.keyEvents ?? []) {
    if (!e.scoringPlay || e.shootout) continue
    const ath = e.participants?.[0]?.athlete
    const mn = clockMin(e.clock)
    const k = `${ath?.id}|${mn}`
    if (seenGoal.has(k)) continue
    seenGoal.add(k)
    goals.push({ athlete: ath?.id ? String(ath.id) : null, name: ath?.displayName ?? null, min: mn, og: isOwnGoal(e), side: sideOfTeamId(e.team?.id) })
  }
  // reconcile to the score: drop near-duplicate events (same scorer within 2') while a side is over
  for (const side of ['home', 'away']) {
    const credited = (g) => g.side === side // keyEvent team = the side credited, own goals included
    const want = bySide[side]?.score
    let list = goals.filter(credited)
    while (want != null && list.length > want) {
      const dup = list.find((g, i) => list.some((h, k) => k < i && h.athlete && h.athlete === g.athlete && Math.abs((h.min ?? 0) - (g.min ?? 0)) <= 2))
      if (!dup) break
      goals.splice(goals.indexOf(dup), 1)
      list = goals.filter(credited)
    }
  }
  const warnings = []
  const sides = {}
  for (const r of j.rosters ?? []) {
    const side = r.homeAway ?? sideOfTeamId(r.team?.id)
    if (!side) continue
    const byId = new Map()
    for (const e of r.roster ?? []) {
      const aid = e.athlete?.id ? String(e.athlete.id) : null
      if (!aid) continue
      const prev = byId.get(aid)
      if (!prev || (e.stats?.length ?? 0) > (prev.stats?.length ?? 0)) byId.set(aid, e)
    }
    const players = []
    for (const [aid, e] of byId) {
      const app = e.stats?.find((s) => s.abbreviation === 'APP')
      const started = !!e.starter && !e.subbedIn
      let appeared = started || !!e.subbedIn
      if (app && app.value != null) appeared = app.value >= 1
      const plays = e.plays ?? []
      const subPlays = plays.filter((p) => p.substitution).map((p) => clockMin(p.clock))
      const red = plays.find((p) => p.redCard)
      let on = started ? 0 : subOn.get(aid) ?? (e.subbedIn ? subPlays[0] ?? null : null)
      let off = subOff.get(aid) ?? (e.subbedOut ? subPlays.at(-1) ?? null : null)
      if (red) off = Math.min(off ?? 999, clockMin(red.clock) ?? 999)
      if (off === 999) off = null
      if (!appeared) on = off = null
      const mine = goals.filter((g) => g.athlete === aid)
      players.push({
        name: e.athlete.displayName ?? e.athlete.fullName, full_name: e.athlete.fullName ?? null, ext_id: aid,
        shirt: e.jersey ? Number(e.jersey) : null, gk: /goalkeeper/i.test(e.position?.name ?? ''), started: appeared ? started : false, appeared,
        on_min: on, off_min: off, off_reason: red ? 'red' : off != null ? 'sub' : null,
        minutes: appeared ? minutesPlayed(on, off, end) : null,
        goals: mine.filter((g) => !g.og).length, goal_minutes: mine.filter((g) => !g.og).map((g) => g.min), own_goals: mine.filter((g) => g.og).length,
        cards: plays.filter((p) => p.redCard || p.yellowCard).map((p) => ({ type: p.redCard ? 'red' : 'yellow', min: clockMin(p.clock) })),
      })
    }
    // a full lineup: 11+ listed, and every substitute the sub events bring on for this side is listed
    const teamId = bySide[side]?.teamId
    const subsIn = (j.keyEvents ?? []).filter((e) => e.type?.type === 'substitution' && String(e.team?.id) === teamId).map((e) => String(e.participants?.[0]?.athlete?.id))
    const full = players.length >= 11 && subsIn.every((x) => byId.has(x))
    if (players.length >= 11 && !full) warnings.push(`${side}: roster lacks ${subsIn.filter((x) => !byId.has(x)).length} substitute(s) named in the sub events`)
    sides[side] = { team: bySide[side]?.team ?? r.team?.displayName, teamId: bySide[side]?.teamId ?? (r.team?.id != null ? String(r.team.id) : null), lineup: full, players }
  }
  // short or missing rosters: the listed players and the scorers appeared; starts and minutes unknown
  for (const side of ['home', 'away']) {
    if (sides[side]?.lineup) continue
    const players = (sides[side]?.players ?? []).map((p) => ({ ...p, started: null, on_min: null, off_min: null, minutes: null, appeared: p.appeared || p.goals > 0 ? true : null }))
    const other = side === 'home' ? 'away' : 'home'
    for (const g of goals) {
      const mySide = g.og ? other : g.side // an own goal's team is the beneficiary; the scorer is on the other side
      if (mySide !== side || !g.athlete || players.some((x) => x.ext_id === g.athlete)) continue
      const mine = goals.filter((h) => h.athlete === g.athlete)
      players.push({ name: g.name, full_name: null, ext_id: g.athlete, shirt: null, gk: false, started: null, appeared: true, on_min: null, off_min: null, off_reason: null, minutes: null,
        goals: mine.filter((h) => !h.og).length, goal_minutes: mine.filter((h) => !h.og).map((h) => h.min), own_goals: mine.filter((h) => h.og).length, cards: [] })
    }
    sides[side] = { team: bySide[side]?.team, teamId: bySide[side]?.teamId ?? null, lineup: false, scorers_only: players.length > 0, players }
    if (players.length) warnings.push(`${side}: no full roster, ${players.length} players known (scorers or partial list)`)
  }
  return {
    src: 'espn', family: slug, source_id: id, date: String(comp.date ?? '').slice(0, 10), kickoff_utc: comp.date ?? null,
    home: bySide.home?.team, away: bySide.away?.team,
    score: { home: bySide.home?.score ?? null, away: bySide.away?.score ?? null }, aet, status,
    competition: j.header.season?.name ?? slug, season_year: j.header.season?.year ?? null,
    receipt: { source: 'espn', slug, event: id, url: `${ESPN_BASE}${slug}/summary?event=${id}`, page: `https://www.espn.com/soccer/match/_/gameId/${id}`, cache_file: `data/raw/espn/${file}` },
    warnings, sides,
  }
}

/** Youth and Olympic slugs are not senior "A" internationals. */
export const ESPN_NON_A = /olympic|u-?2[03]|u-?1\d|youth|women|wwc|\.w\./i
export function loadEspn() {
  const { summaries, files } = scanEspn()
  const all = summaries.map(normaliseEspn)
  return { matches: all.filter((m) => !ESPN_NON_A.test(m.family ?? '')), excluded: all.filter((m) => ESPN_NON_A.test(m.family ?? '')), files }
}

// ---------------------------------------------------------------- Wikidata match items (cached SPARQL only)

/** Match items found in cached SPARQL results: {qid, label, date, teams:[a,b]}. Tiny today (probe queries). */
export function loadWikidataMatches() {
  const out = new Map()
  let dirs = []
  try { dirs = fs.readdirSync(P.wikidataSparql) } catch { return [] }
  for (const d of dirs) {
    let files = []
    try { files = fs.readdirSync(path.join(P.wikidataSparql, d)) } catch { continue }
    for (const f of files) {
      const j = readJson(path.join(P.wikidataSparql, d, f), null)
      const b = j?.result?.results?.bindings ?? []
      const qd = String(j?.query ?? '').match(/FILTER\(\?d >= "(\d{4}-\d\d-\d\d)T00:00:00Z"\^\^xsd:dateTime && \?d < "(\d{4}-\d\d-\d\d)/)
      const oneDay = qd && Date.parse(qd[2]) - Date.parse(qd[1]) === 86400000 ? qd[1] : null
      for (const x of b) {
        const qid = x.m?.value?.split('/').pop()
        const label = x.mLabel?.value
        const date = x.d?.value?.slice(0, 10) ?? oneDay
        const t = label?.match(/^(.+?)\s+(?:v|vs\.?|–|-)\s+(.+)$/)
        if (!qid || !date || !t) continue
        out.set(qid, { qid, label, date, teams: [t[1], t[2]] })
      }
    }
  }
  return [...out.values()]
}
