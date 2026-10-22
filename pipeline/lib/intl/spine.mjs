// The match spine: every martj42 result (CC0), typed, keyed by date plus the two teams, with a pair
// index so other sources can join within a few days (FIFA and martj42 disagree on some dates).
import { canonTeam as archiveCanon } from '../archive/gates.mjs'
import { readCsv, martj42File, rel } from './io.mjs'
import { slugify } from './names.mjs'

// ESPN and RSSSF spellings the archive alias map lacks (it is the harvester's; we extend, never edit it).
const LOCAL = { Czechia: 'Czech Republic', 'Türkiye': 'Turkey', 'Cabo Verde': 'Cape Verde', 'Congo DR': 'DR Congo', 'Korea Republic': 'South Korea', 'Chinese Taipei': 'Taiwan', 'Ireland': 'Republic of Ireland', 'Rep. of Ireland': 'Republic of Ireland', 'Bosnia-Herzegovina': 'Bosnia and Herzegovina', 'USA': 'United States', 'Serbia and Montenegro': 'Serbia', 'Côte d\'Ivoire': 'Ivory Coast', 'IR Iran': 'Iran', 'China PR': 'China', 'FYR Macedonia': 'North Macedonia', 'Macedonia': 'North Macedonia' }
export const canonTeam = (t) => archiveCanon(LOCAL[t] ?? t)

const FINALS = new Set([
  'FIFA World Cup', 'UEFA Euro', 'Copa América', 'African Cup of Nations', 'AFC Asian Cup', 'Gold Cup',
  'Confederations Cup', 'CONCACAF Championship', 'Oceania Nations Cup',
])

/** friendly | qualifier | nations_league | finals | minor (the five intl-gap buckets). */
export function matchType(tournament) {
  if (tournament === 'Friendly') return 'friendly'
  if (/qualification/i.test(tournament)) return 'qualifier'
  if (/Nations League/i.test(tournament)) return 'nations_league'
  if (FINALS.has(tournament)) return 'finals'
  return 'minor'
}

export const matchId = (date, home, away) => `${date}_${slugify(home)}_${slugify(away)}`
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const dayNum = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / 86400000)

export function loadSpine() {
  const file = martj42File('results')
  const gfile = martj42File('goalscorers')
  const matches = []
  const byId = new Map()
  const byPair = new Map()
  for (const r of readCsv(file)) {
    const played = r.home_score !== 'NA' && r.home_score !== ''
    const m = {
      match_id: matchId(r.date, r.home_team, r.away_team),
      date: r.date, home: r.home_team, away: r.away_team,
      home_score: played ? Number(r.home_score) : null, away_score: played ? Number(r.away_score) : null,
      tournament: r.tournament, type: matchType(r.tournament), competitive: r.tournament !== 'Friendly',
      city: r.city, country: r.country, neutral: r.neutral === 'TRUE', played,
      receipt: { source: 'martj42', file: rel(file), line: r._line },
      ids: { archive: [], espn: [], wikidata: [] },
      _H: canonTeam(r.home_team), _A: canonTeam(r.away_team), _day: dayNum(r.date),
    }
    if (byId.has(m.match_id)) m.match_id += '_2' // same teams twice in a day (never seen; guard only)
    matches.push(m)
    byId.set(m.match_id, m)
    const k = pairKey(m._H, m._A)
    ;(byPair.get(k) ?? byPair.set(k, []).get(k)).push(m)
  }
  // goalscorers: keyed to the same match (same date, same home/away names as results.csv)
  const scorers = new Map()
  for (const g of readCsv(gfile)) {
    const id = matchId(g.date, g.home_team, g.away_team)
    if (!byId.has(id)) continue
    ;(scorers.get(id) ?? scorers.set(id, []).get(id)).push({
      team: g.team, scorer: g.scorer, minute: g.minute === 'NA' ? null : Number(g.minute),
      own_goal: g.own_goal === 'TRUE', penalty: g.penalty === 'TRUE', line: g._line,
    })
  }
  // tournaments that have any scorer rows in goalscorers.csv (martj42 has none for friendlies, AFCON and
  // Asian Cup qualifiers, CONCACAF Nations League...): only those can gate goals.
  const scorerTournaments = new Set()
  for (const id of scorers.keys()) scorerTournaments.add(byId.get(id).tournament)

  /** Join a (date, team, team) from another source. Returns {match, offset} or null. */
  function lookup(date, t1, t2, tol = 2) {
    const a = canonTeam(t1), b = canonTeam(t2)
    const list = byPair.get(pairKey(a, b))
    if (!list) return null
    const d = dayNum(date)
    let best = null
    for (const m of list) {
      const off = m._day - d
      if (Math.abs(off) <= tol && (!best || Math.abs(off) < Math.abs(best.offset))) best = { match: m, offset: off }
    }
    return best
  }
  /** Which side of a spine match a team name is on ('home' | 'away' | null). */
  function sideOf(m, team) {
    const t = canonTeam(team)
    return t === m._H ? 'home' : t === m._A ? 'away' : null
  }
  /** Undated source records (some FIFA 1998 CONCACAF reports): same pair and same score inside the
   *  campaign window, unique or nothing. */
  function lookupUndated(t1, t2, s1, s2, from, to) {
    const a = canonTeam(t1), b = canonTeam(t2)
    const hits = (byPair.get(pairKey(a, b)) ?? []).filter((m) => m.date >= from && m.date <= to && m.competitive &&
      ((m._H === a && m.home_score === s1 && m.away_score === s2) || (m._H === b && m.home_score === s2 && m.away_score === s1)))
    return hits.length === 1 ? { match: hits[0], offset: null, undated: true } : null
  }
  return { matches, byId, lookup, lookupUndated, sideOf, scorers, scorerTournaments, file: rel(file), goalscorersFile: rel(gfile) }
}
