// The compact ledger the site ships: one columnar JSON file per competition and one for
// internationals. Layout in pipeline/docs/compact.md; decode.mjs is the reference decoder and the
// site's src/lib/ledger.ts should be a port of it.
//
// Every table is { cols: [...], data: [column0[], column1[], ...] } (column-major: one integer
// array per column, which gzips far better than rows). Strings live once in `strings` and string
// columns hold their index. Null is -1 in every column (all real values are >= 0); booleans 0/1.
// Club rows are sorted by entity, then date, so a player's career is one contiguous slice.
import { compOf } from './ordinals.mjs'

export const FORMAT_VERSION = 1

// ---- the layouts (decode.mjs reads the same names; order is free, the decoder looks columns up)
export const SEASON_COLS = ['slug', 'season', 'matches', 'cached', 'stats', 'assists', 'pens']
export const ENTITY_COLS = ['id', 'name', 'born', 'nat', 'pos', 'rows']
export const TEAM_COLS = ['id', 'name']
export const MATCH_COLS = ['id', 'slug', 'season', 'ymd', 'hm', 'home', 'away', 'hs', 'as', 'shH', 'shA', 'status', 'stage', 'round', 'seasonSlug',
  'qualifier', 'stuck', 'summary', 'extraTime', 'stats', 'keyEvents', 'goalsReconciled', 'quality', 'assistsReliable', 'tgnH', 'tgnA']
export const COLS = ['e', 'm', 'home', 'started', 'subIn', 'subOff', 'sentOff', 'min', 'goals', 'pens', 'og', 'ast', 'yc', 'rc', 'result',
  'cApp', 'cStart', 'cSeason', 'app', 'start', 'aSeason']
export const TEAM_MATCH_COLS = ['m', 'side', 'tgn', 'pos', 'tied']
export const TEAM_SEASON_COLS = ['t', 'comp', 'season', 'P', 'W', 'D', 'L', 'GF', 'GA', 'pitch', 'ded', 'pts', 'pos', 'tied', 'margin', 'winlessStart',
  'titleLeft', 'titleM', 'relLeft', 'relM', 'complete']
export const RUN_COLS = ['t', 'comp', 'test', 'len', 'from', 'to', 'W', 'D', 'L', 'GF', 'GA', 'ongoing', 'truncated']
export const INTL_ENTITY_COLS = ['key', 'name', 'team', 'born', 'coverage', 'badge', 'rsssf', 'wikidata', 'espn', 'capsStated', 'goalsStated', 'rows']
export const INTL_COLS = ['e', 'match', 'ymd', 'team', 'opp', 'type', 'tournament', 'compRsssf', 'competitive', 'venue', 'score', 'result',
  'cap', 'app', 'started', 'on', 'off', 'offReason', 'min', 'goals', 'goalMin', 'src', 'flags']

// Columns written as deltas from the previous row of the same entity (the first row of an entity is
// absolute). Rows are in date order inside an entity, so match indexes and ordinals rise by small
// steps and gzip to almost nothing. decode.mjs undoes it from `deltas`. Only never-null columns.
export const CLUB_DELTAS = ['m', 'cApp']
export const INTL_DELTAS = ['app'] // ymd can be null (5 RSSSF caps with no date), so it isn't delta-coded

// The era floors (research/beachhead.md, AGENTS.md): the first season, by start year, where each
// stat is reliable in that competition. Assists below the floor are written as null; the other
// floors are carried for the engine to gap careers and print "since 2003-04".
export const FLOORS = {
  'eng.1': { apps: 2002, starts: 2002, minutes: 2002, goals: 2002, assists: 2005 },
  'esp.1': { apps: 2002, starts: 2002, minutes: 2002, goals: 2002, assists: 2005 },
  'ita.1': { apps: 2002, starts: 2002, minutes: 2002, goals: 2002, assists: 2008 },
  'ger.1': { apps: 2002, starts: 2002, minutes: 2002, goals: 2002, assists: 2006 },
  'fra.1': { apps: 2003, starts: 2003, minutes: 2003, goals: 2003, assists: 2007 },
  'uefa.champions': { apps: 2002, starts: 2002, minutes: 2002, goals: 2002, assists: 2006 },
}
export const COMP_LABEL = { 'eng.1': 'Premier League', 'esp.1': 'La Liga', 'ita.1': 'Serie A', 'ger.1': 'Bundesliga', 'fra.1': 'Ligue 1', 'uefa.champions': 'Champions League' }
export const CLUB_FILES = Object.keys(FLOORS)
export const fileOf = (slug) => (slug === 'uefa.champions_qual' ? 'uefa.champions' : slug)

export const seasonLabel = (s) => `${s}-${String(s + 1).slice(2)}`
const RESULT = { W: 2, D: 1, L: 0 }
const nul = (v) => (v == null ? -1 : v)
const bool = (v) => (v == null ? -1 : v ? 1 : 0)

export class Strings {
  constructor() { this.list = []; this.ix = new Map() }
  id(s) {
    if (s == null) return -1
    const k = String(s)
    let i = this.ix.get(k)
    if (i === undefined) { i = this.list.length; this.list.push(k); this.ix.set(k, i) }
    return i
  }
}

/** objects -> { cols, data }, each column through its getter */
export function table(cols, items, get) {
  const data = cols.map(() => new Array(items.length))
  for (let i = 0; i < items.length; i++) {
    const v = get(items[i], i)
    for (let c = 0; c < cols.length; c++) {
      const x = v[cols[c]]
      if (x === undefined) throw new Error(`column ${cols[c]} undefined`)
      data[c][i] = x
    }
  }
  return { cols, data }
}

/**
 * Delta-encode `names` columns in place, restarting at each change of the `e` column. A delta
 * column never holds a null (asserted), so a negative value is just a step down, not -1 = null.
 */
export function applyDeltas(t, names) {
  const e = t.data[t.cols.indexOf('e')]
  for (const n of names) {
    const col = t.data[t.cols.indexOf(n)]
    let prev = 0
    for (let i = 0; i < col.length; i++) {
      const v = col[i]
      if (v === -1) throw new Error(`delta column ${n} has a null at row ${i}`)
      col[i] = i > 0 && e[i] === e[i - 1] ? v - prev : v
      prev = v
    }
  }
  return t
}

const ymdOf = (iso) => Number(iso.slice(0, 10).replace(/-/g, ''))
const hmOf = (iso) => (iso.length > 10 ? Number(iso.slice(11, 13) + iso.slice(14, 16)) : -1)
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id))

/**
 * One club competition file.
 * @param comp a CLUB_FILES key
 * @param matches every long match row of this file's slugs (pending ones too)
 * @param players the long player rows of those matches
 * @param ordOf (matchId, athleteId) -> ordinals row
 * @param team the team ledger (team.mjs buildTeamLedger) restricted to this file's comps
 */
export function encodeClub({ comp, matches, players, ordOf, team, builtAt, source }) {
  const S = new Strings()
  const floors = FLOORS[comp]
  const ms = matches.slice().sort(byDate)
  const mIx = new Map(ms.map((m, i) => [m.id, i]))

  // teams
  const teamIds = [], teamName = new Map()
  for (const m of ms) for (const [id, name] of [[m.homeId, m.homeName], [m.awayId, m.awayName]]) { if (!teamName.has(id)) teamIds.push(id); teamName.set(id, name) }
  const tIx = new Map(teamIds.map((id, i) => [id, i]))
  const tgnOf = new Map()
  for (const r of team.rows) tgnOf.set(`${r.matchId}|${r.teamId}`, r.tgn)

  // entities: display name = the most frequent spelling, ties to the latest
  const byAth = new Map()
  for (const p of players) { const l = byAth.get(p.athleteId) || []; l.push(p); byAth.set(p.athleteId, l) }
  const ents = [...byAth.entries()].map(([id, rows]) => {
    rows.sort(byDate)
    const n = new Map()
    for (const r of rows) n.set(r.name, (n.get(r.name) || 0) + 1)
    let name = rows[rows.length - 1].name
    for (const [k, v] of n) if (v > n.get(name)) name = k
    return { id, name, rows }
  }).sort((a, b) => b.rows.length - a.rows.length || Number(a.id) - Number(b.id))

  // seasons: coverage and the stat floors per competition-season
  const seasonMap = new Map()
  for (const m of ms) {
    const k = `${m.slug}|${m.season}`
    const s = seasonMap.get(k) || { slug: m.slug, season: m.season, matches: 0, cached: 0, stats: 0, reliable: 0, pens: null }
    s.matches++
    if (m.summary === 'ok') { s.cached++; if (m.stats) s.stats++; if (m.assistsReliable) s.reliable++ }
    seasonMap.set(k, s)
  }
  for (const p of players) { const s = seasonMap.get(`${p.slug}|${p.season}`); if (p.goals > 0) s.pens = s.pens || (p.pens === null ? 'untyped' : 'typed') }
  const seasons = [...seasonMap.values()].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.season - b.season))
  const assistsState = (s) => (s.cached === 0 ? -1 : s.stats === 0 ? 0 : s.season < floors.assists ? 1 : s.stats < s.cached ? 2 : 3)

  const matchesT = table(MATCH_COLS, ms, (m) => ({
    id: Number(m.id), slug: S.id(m.slug), season: m.season, ymd: ymdOf(m.date), hm: hmOf(m.date),
    home: tIx.get(m.homeId), away: tIx.get(m.awayId), hs: nul(m.homeScore), as: nul(m.awayScore),
    shH: m.shootout ? m.shootout.home : -1, shA: m.shootout ? m.shootout.away : -1,
    status: S.id(m.status), stage: S.id(m.stage), round: S.id(m.round), seasonSlug: S.id(m.seasonSlug),
    qualifier: bool(m.qualifier), stuck: bool(m.stuck), summary: S.id(m.summary), extraTime: bool(m.extraTime), stats: bool(m.stats),
    keyEvents: S.id(m.keyEvents), goalsReconciled: bool(m.goalsReconciled), quality: S.id(m.quality), assistsReliable: bool(m.assistsReliable),
    tgnH: nul(tgnOf.get(`${m.id}|${m.homeId}`)), tgnA: nul(tgnOf.get(`${m.id}|${m.awayId}`)),
  }))

  // rows, grouped by entity
  const flat = []
  ents.forEach((e, ei) => { for (const r of e.rows) flat.push({ e: ei, r }) })
  const alias = [], nameAlt = []
  const mById = new Map(ms.map((m) => [m.id, m]))
  const rowsT = table(COLS, flat, ({ e, r }, i) => {
    const o = ordOf(r.id, r.athleteId)
    if (!o) throw new Error(`no ordinals for ${r.id}/${r.athleteId}`)
    if (r.espnId !== r.athleteId) alias.push([i, Number(r.espnId)])
    if (r.name !== ents[e].name) nameAlt.push([i, S.id(r.name)])
    const m = mById.get(r.id)
    const teamOk = (r.home ? m.homeId : m.awayId) === r.teamId && (r.home ? m.awayId : m.homeId) === r.oppId
    if (!teamOk) throw new Error(`row ${r.id}/${r.athleteId}: team ${r.teamId} home ${r.home} doesn't match the match header`)
    return {
      e, m: mIx.get(r.id), home: bool(r.home), started: bool(r.started), subIn: nul(r.subIn), subOff: nul(r.subOff), sentOff: nul(r.sentOff),
      min: nul(r.minutes), goals: nul(r.goals), pens: nul(r.pens), og: nul(r.ownGoals),
      ast: m.assistsReliable ? nul(r.assists) : -1, // below the floor (or no stats): null
      yc: nul(r.yc), rc: nul(r.rc), result: RESULT[r.result],
      cApp: o.compApp, cStart: nul(o.compStart), cSeason: o.compSeason, app: nul(o.app), start: nul(o.start), aSeason: nul(o.season),
    }
  })
  applyDeltas(rowsT, CLUB_DELTAS)

  const entitiesT = table(ENTITY_COLS, ents, (e) => ({ id: Number(e.id), name: S.id(e.name), born: -1, nat: -1, pos: -1, rows: e.rows.length }))
  const teamsT = table(TEAM_COLS, teamIds, (id) => ({ id: Number(id), name: S.id(teamName.get(id)) }))
  const seasonsT = table(SEASON_COLS, seasons, (s) => ({ slug: S.id(s.slug), season: s.season, matches: s.matches, cached: s.cached, stats: s.stats, assists: assistsState(s), pens: s.pens == null ? -1 : s.pens === 'typed' ? 1 : 0 }))

  // team layers
  const tmRows = team.rows.filter((r) => mIx.has(r.matchId))
  const teamMatchesT = table(TEAM_MATCH_COLS, tmRows, (r) => ({ m: mIx.get(r.matchId), side: r.home ? 0 : 1, tgn: r.tgn, pos: nul(r.pos), tied: bool(r.tied) }))
  const teamSeasonsT = table(TEAM_SEASON_COLS, team.seasons, (s) => ({
    t: tIx.get(s.teamId), comp: S.id(s.comp), season: s.season, P: s.P, W: s.W, D: s.D, L: s.L, GF: s.GF, GA: s.GA, pitch: s.pointsOnPitch, ded: s.deduction, pts: s.points,
    pos: nul(s.pos), tied: bool(s.tied), margin: nul(s.margin), winlessStart: s.winlessStart,
    titleLeft: s.titleClinch ? s.titleClinch.gamesLeft : -1, titleM: s.titleClinch ? mIx.get(s.titleClinch.matchId) : -1,
    relLeft: s.relegationClinch ? s.relegationClinch.gamesLeft : -1, relM: s.relegationClinch ? mIx.get(s.relegationClinch.matchId) : -1,
    complete: bool(s.complete),
  }))
  const runs = team.runs.filter((r) => r.len >= 3)
  const runsT = table(RUN_COLS, runs, (r) => ({
    t: tIx.get(r.teamId), comp: S.id(r.comp), test: S.id(r.test), len: r.len, from: mIx.get(r.from.matchId), to: mIx.get(r.to.matchId),
    W: r.W, D: r.D, L: r.L, GF: r.GF, GA: r.GA, ongoing: bool(r.ongoing), truncated: bool(r.truncated),
  }))

  const lastSeason = Math.max(...ms.map((m) => m.season))
  return {
    v: FORMAT_VERSION, kind: 'club', comp, label: COMP_LABEL[comp], builtAt, source,
    firstSeason: Math.min(...ms.map((m) => m.season)), lastSeason,
    floors: { ...floors, labels: Object.fromEntries(Object.entries(floors).map(([k, v]) => [k, seasonLabel(v)])) },
    deltas: CLUB_DELTAS, runMin: 3,
    counts: { entities: ents.length, teams: teamIds.length, matches: ms.length, cachedMatches: ms.filter((m) => m.summary === 'ok').length, rows: flat.length },
    strings: S.list,
    seasons: seasonsT, entities: entitiesT, teams: teamsT, matches: matchesT, rows: rowsT,
    alias, nameAlt,
    teamMatches: teamMatchesT, teamSeasons: teamSeasonsT, runs: runsT,
  }
}

const VENUE = { H: 0, A: 1, N: 2 }
/** "2-1", "2-1 aet", "2- 1" -> [2, 1] from the player's side; anything else (awd, abd) -> null */
export function parseScore(s) {
  const m = /^(\d+)\s*[-–]\s*(\d+)/.exec(s || '')
  return m ? [Number(m[1]), Number(m[2])] : null
}

/**
 * The internationals file.
 * @param rows intl player-matches rows (already in memory, stripped of receipts)
 * @param people players.json `players` keyed by player_key
 */
export function encodeIntl({ rows, people, builtAt, source }) {
  const S = new Strings()
  const byKey = new Map()
  for (const r of rows) { const l = byKey.get(r.player_key) || []; l.push(r); byKey.set(r.player_key, l) }
  const ents = [...byKey.entries()].map(([key, rs]) => {
    rs.sort((a, b) => a.app_no - b.app_no || ((a.date ?? '') < (b.date ?? '') ? -1 : (a.date ?? '') > (b.date ?? '') ? 1 : 0))
    const p = people.get(key) || {}
    const n = new Map()
    for (const r of rs) n.set(r.player, (n.get(r.player) || 0) + 1)
    let name = p.name ?? rs[rs.length - 1].player
    if (!n.has(name)) for (const [k, v] of n) if (!n.has(name) || v > n.get(name)) name = k
    return { key, name, rows: rs, p }
  }).sort((a, b) => b.rows.length - a.rows.length || (a.key < b.key ? -1 : 1))
  const flat = []
  ents.forEach((e, ei) => { for (const r of e.rows) flat.push({ e: ei, r }) })
  const nameAlt = []
  const rowsT = table(INTL_COLS, flat, ({ e, r }, i) => {
    if (r.player !== ents[e].name) nameAlt.push([i, S.id(r.player)])
    const sc = parseScore(r.score)
    return {
      e, match: S.id(r.match_id), ymd: r.date ? ymdOf(r.date) : -1, team: S.id(r.team), opp: S.id(r.opponent), type: S.id(r.match_type),
      tournament: S.id(r.tournament), compRsssf: S.id(r.competition_rsssf), competitive: bool(r.competitive), venue: r.venue == null ? -1 : VENUE[r.venue],
      score: S.id(r.score), result: sc ? (sc[0] > sc[1] ? 2 : sc[0] < sc[1] ? 0 : 1) : -1,
      cap: nul(r.cap_no), app: nul(r.app_no), started: bool(r.started), on: nul(r.on_min), off: nul(r.off_min), offReason: S.id(r.off_reason),
      min: nul(r.minutes), goals: nul(r.goals), goalMin: r.goal_minutes?.length ? S.id(r.goal_minutes.join(',')) : -1,
      src: S.id(r.cap_source), flags: r.flags?.length ? S.id(r.flags.join('|')) : -1,
    }
  })
  applyDeltas(rowsT, INTL_DELTAS)
  const entitiesT = table(INTL_ENTITY_COLS, ents, (e) => ({
    key: S.id(e.key), name: S.id(e.name), team: S.id(e.p.team ?? e.rows[0].team),
    born: e.p.club_join?.born ? ymdOf(e.p.club_join.born) : -1,
    coverage: S.id(e.p.intl_coverage ?? null), badge: S.id(e.p.badge ?? null), rsssf: S.id(e.p.rsssf_url ?? null), wikidata: S.id(e.p.wikidata_qid ?? null),
    espn: S.id([...new Set([...(e.p.espn_athlete_ids || []), ...(e.p.club_join?.espn_athlete_ids || []), ...(e.p.club_join?.espn_athlete_ids_wikidata || [])].map(String))].join(',') || null),
    capsStated: nul(e.p.caps_stated), goalsStated: nul(e.p.goals_stated), rows: e.rows.length,
  }))
  return {
    v: FORMAT_VERSION, kind: 'intl', comp: 'intl', label: 'Senior internationals', builtAt, source,
    deltas: INTL_DELTAS,
    counts: { entities: ents.length, rows: flat.length },
    strings: S.list, entities: entitiesT, rows: rowsT, nameAlt,
  }
}
