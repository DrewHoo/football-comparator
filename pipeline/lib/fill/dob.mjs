// --job dob: date of birth and basic bio for every athlete in the club ledger (post-merge ids)
// and the athlete-store fills.
//
// Primary source: core athletes/{id} (dateOfBirth ISO, citizenship, position, height in inches,
// weight in pounds; verified on 22774 in the cache). The web common/v3 athletes/{id} only has
// displayDOB "5/2/1985" (day-first, ambiguous) and bio has only teamHistory, so neither is used.
// Option: site team rosters ({slug}/teams/{t}/roster?season=Y) carry the same fields for a whole
// squad in one request; whether `season` is honoured for old seasons is unverified, so that
// strategy runs a 3-roster check first and falls back per id. Wikidata (CC0) is a cross-check:
// P3681 (ESPN id) joins 1,659 players exactly; others join by name key + citizenship, scored.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, athleteUrl, teamRosterUrl, readCached, fetchedAt } from './espn-cache.mjs'
import { parseAthlete, parseTeamRoster } from './parse.mjs'
import { tokenKey, normKey } from '../intl/names.mjs'

const LEDGER = path.join(ROOT, 'data/ledger')
export const OUT = path.join(ROOT, 'data/index/athletes.jsonl')
const WD_PLAYERS = path.join(ROOT, 'data/index/wikidata/players.json')

/** Roster checks for --strategy roster: a historic season must list the player who was there. */
export const ROSTER_CHECKS = [
  { slug: 'eng.1', team: '359', season: 2003, athlete: '8039', who: 'Henry, Arsenal 2003-04' },
  { slug: 'esp.1', team: '83', season: 2005, athlete: '45843', who: 'Messi, Barcelona 2005-06' },
  { slug: 'ita.1', team: '104', season: 2006, athlete: '10293', who: 'Totti, Roma 2006-07' },
]

/** Every id to describe: canonical athleteId from player-matches (+ fills), with names, aliases and club-seasons. */
export function collectIds({ withFills = true } = {}) {
  const ids = new Map()
  const merge = (() => { try { return JSON.parse(fs.readFileSync(path.join(LEDGER, 'id-merge.json'), 'utf8')).map ?? {} } catch { return {} } })()
  const take = (r) => {
    const id = String(r.athleteId ?? r.espnId)
    let e = ids.get(id)
    if (!e) ids.set(id, (e = { id, names: new Map(), aliases: new Set(), clubSeasons: new Set(), apps: 0 }))
    e.apps++
    if (r.name) e.names.set(r.name, (e.names.get(r.name) ?? 0) + 1)
    if (r.espnId && String(r.espnId) !== id) e.aliases.add(String(r.espnId))
    if (r.slug && r.teamId != null && !r.intl) e.clubSeasons.add(`${r.slug}|${r.season}|${r.teamId}`)
  }
  const scan = (f) => { try { for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l) take(JSON.parse(l)) } catch {} }
  scan(path.join(LEDGER, 'player-matches.jsonl'))
  if (withFills) scan(path.join(LEDGER, 'fills/athlete-matches.jsonl'))
  for (const [from, to] of Object.entries(merge)) { const e = ids.get(String(to)); if (e) e.aliases.add(String(from)) }
  for (const e of ids.values()) e.name = [...e.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return ids
}

/** Wikidata index: espn id -> player; name key -> [players]. */
export function loadWikidata() {
  let list = []
  try { list = JSON.parse(fs.readFileSync(WD_PLAYERS, 'utf8')) } catch { return null }
  const byEspn = new Map(), byName = new Map()
  for (const p of list) {
    for (const e of p.ids?.espn ?? []) byEspn.set(String(e), p)
    const keys = new Set([p.label, ...(p.labels ?? []), ...(p.aliases ?? [])].filter(Boolean).map(tokenKey).filter((k) => k.includes(' ') || k.length > 4))
    for (const k of keys) { if (!byName.has(k)) byName.set(k, []); byName.get(k).push(p) }
  }
  return { size: list.length, byEspn, byName }
}

const natKey = (s) => normKey(s).replace(/^(the )/, '')
const NAT_ALIAS = { 'korea republic': 'south korea', 'republic of korea': 'south korea', usa: 'united states', 'united states of america': 'united states', "cote d'ivoire": 'ivory coast', 'cote d ivoire': 'ivory coast', czechia: 'czech republic', turkiye: 'turkey', 'kingdom of the netherlands': 'netherlands', 'people s republic of china': 'china' }
const nat = (s) => { const k = natKey(s); return NAT_ALIAS[k] ?? k }

/** Cross-check one ESPN row against Wikidata. Never overrides ESPN; reports agreement and confidence. */
export function wikidataCheck(wd, id, name, espn) {
  if (!wd) return null
  const direct = wd.byEspn.get(String(id))
  if (direct) return { qid: direct.qid, born: direct.born ?? null, method: 'P3681', confidence: 1, dobAgree: espn?.dob && direct.born ? espn.dob === direct.born : null }
  const cands = wd.byName.get(tokenKey(name ?? '')) ?? []
  if (!cands.length) return null
  if (!espn) return { method: 'name-only', candidates: cands.length, confidence: 0, note: 'needs the ESPN record (nationality, dob) to score' }
  const natOk = (p) => espn.nationality && (p.citizenship ?? []).some((c) => nat(c.label) === nat(espn.nationality))
  const dobOk = (p) => espn.dob && p.born === espn.dob
  const both = cands.filter((p) => natOk(p) && dobOk(p))
  if (both.length === 1) return { qid: both[0].qid, born: both[0].born, method: 'name+nationality+dob', confidence: 0.95, dobAgree: true }
  const dobOnly = cands.filter(dobOk)
  if (dobOnly.length === 1) return { qid: dobOnly[0].qid, born: dobOnly[0].born, method: 'name+dob', confidence: 0.85, dobAgree: true }
  const natOnly = cands.filter(natOk)
  if (natOnly.length === 1) return { qid: natOnly[0].qid, born: natOnly[0].born ?? null, method: 'name+nationality', confidence: natOnly[0].born ? 0.3 : 0.5, dobAgree: natOnly[0].born ? false : null, note: natOnly[0].born ? 'DOB disagrees: review' : 'Wikidata has no DOB' }
  return { method: 'ambiguous', candidates: cands.length, confidence: 0 }
}

export async function run({ fetcher, strategy = 'athlete', dobSource = 'espn', log = console.log }) {
  const ids = collectIds()
  const wd = loadWikidata()
  const rows = new Map()
  const stats = { ids: ids.size, aliases: [...ids.values()].reduce((s, e) => s + e.aliases.size, 0), wikidataPlayers: wd?.size ?? 0, wikidataEspnJoin: 0, wikidataFirstSkips: 0, rosterCheck: null, fromRoster: 0, fromAthlete: 0, unknown: 0, notFound: 0 }
  for (const e of ids.values()) if (wd?.byEspn.get(e.id)?.born) stats.wikidataEspnJoin++

  const put = (e, a, source, url) => {
    rows.set(e.id, { id: e.id, name: a?.name ?? e.name, dob: a?.dob ?? null, nationality: a?.nationality ?? null, position: a?.position ?? null, height: a?.height ?? null,
      source, fetchedAt: url ? fetchedAt(url) : null, weight: a?.weight ?? null, birthCountry: a?.birthCountry ?? null, aliases: [...e.aliases],
      receipt: url ?? null, wikidata: wikidataCheck(wd, e.id, a?.name ?? e.name, a) })
  }

  // Wikidata-first: an exact P3681 join with a DOB skips the ESPN request (CC0, no request).
  if (dobSource === 'wikidata-first' && wd) {
    for (const e of ids.values()) {
      const p = wd.byEspn.get(e.id)
      if (!p?.born) continue
      const cached = readCached(athleteUrl(e.id))
      if (cached.state === 'ok') continue // the ESPN record is already here: use it, keep Wikidata as the check
      rows.set(e.id, { id: e.id, name: e.name, dob: p.born, nationality: p.citizenship?.[0]?.label ?? null, position: null, height: null, source: 'wikidata', fetchedAt: null,
        aliases: [...e.aliases], receipt: `https://www.wikidata.org/wiki/${p.qid}`, wikidata: { qid: p.qid, born: p.born, method: 'P3681', confidence: 1, dobAgree: null } })
      stats.wikidataFirstSkips++
    }
  }

  // Team rosters: verify first, then one request per club-season.
  if (strategy === 'roster') {
    const results = []
    for (const c of ROSTER_CHECKS) {
      const body = await fetcher.get(teamRosterUrl(c.slug, c.team, c.season), 'roster-check')
      results.push({ ...c, state: body === undefined ? 'unknown' : body === null ? '404' : parseTeamRoster(body).some((a) => a.id === c.athlete) ? 'pass' : 'fail' })
    }
    stats.rosterCheck = results
    const pass = results.every((r) => r.state === 'pass')
    const unknown = results.some((r) => r.state === 'unknown')
    // One roster per club-season: the league slug when the club has one that season, else the UCL slug.
    const bySeasonTeam = new Map()
    for (const e of ids.values()) for (const cs of e.clubSeasons) {
      const [slug, season, team] = cs.split('|')
      const k = `${season}|${team}`
      const prev = bySeasonTeam.get(k)
      if (!prev || (/^uefa\./.test(prev) && !/^uefa\./.test(slug))) bySeasonTeam.set(k, slug)
    }
    const clubSeasons = [...bySeasonTeam].map(([k, slug]) => { const [season, team] = k.split('|'); return `${slug}|${season}|${team}` })
    stats.clubSeasons = clubSeasons.length
    if (pass || (unknown && fetcher.dryRun)) {
      for (const cs of clubSeasons) {
        const [slug, season, team] = cs.split('|')
        const url = teamRosterUrl(slug, team, season)
        const body = await fetcher.get(url, 'roster')
        if (!body) continue
        for (const a of parseTeamRoster(body)) {
          const e = ids.get(a.id)
          if (e && !rows.has(e.id) && a.dob) { put(e, a, 'espn-team-roster', url); stats.fromRoster++ }
        }
      }
      if (fetcher.dryRun) { stats.rosterPlan = { requests: fetcher.plannedByKind().roster ?? 0, note: 'then core athletes/{id} for ids no roster covered' }; return { rows: [...rows.values()], stats, ids } }
    } else log(`roster strategy refused: ${JSON.stringify(results.map((r) => r.who + ' ' + r.state))}; falling back to one request per athlete`)
  }

  for (const e of ids.values()) {
    if (rows.has(e.id)) continue
    const url = athleteUrl(e.id)
    const body = await fetcher.get(url, 'athlete')
    if (body === undefined) { stats.unknown++; continue }
    if (body === null) { stats.notFound++; put(e, null, 'espn-404', url); continue }
    put(e, parseAthlete(body), 'espn-core-athlete', url); stats.fromAthlete++
  }
  return { rows: [...rows.values()], stats, ids }
}

/** Full-scope projection of distinct ids, from the near-complete 2002-03 seasons in the ledger.
 *  ids per full league-season, and the share of a later season's players not seen the season before. */
export function projectIds() {
  const by = new Map()
  for (const l of fs.readFileSync(path.join(LEDGER, 'player-matches.jsonl'), 'utf8').split('\n')) {
    if (!l) continue
    const r = JSON.parse(l)
    const k = `${r.slug}|${r.season}`
    if (!by.has(k)) by.set(k, new Set())
    by.get(k).add(r.athleteId)
  }
  const leagues = ['eng.1', 'esp.1', 'fra.1', 'ger.1', 'ita.1']
  const firstFull = leagues.map((L) => by.get(`${L}|2002`)?.size ?? 0)
  let seen = 0, fresh = 0
  for (const L of leagues) {
    const a = by.get(`${L}|2002`), b = by.get(`${L}|2003`)
    if (!a || !b) continue
    for (const id of b) { seen++; if (!a.has(id)) fresh++ }
  }
  const newShare = seen ? fresh / seen : 0.4
  const leagueIds = new Set(leagues.flatMap((L) => [...(by.get(`${L}|2002`) ?? [])]))
  const ucl = by.get('uefa.champions|2002') ?? new Set()
  const uclOnly = [...ucl].filter((id) => !leagueIds.has(id)).length
  const perLeagueSeason = Math.round(firstFull.reduce((a, b) => a + b, 0) / leagues.length)
  const seasons = 25
  const leaguesTotal = leagues.length * (perLeagueSeason + (seasons - 1) * perLeagueSeason * newShare)
  const uclTotal = uclOnly + (seasons - 1) * uclOnly * Math.max(newShare, 0.6) // qualifier clubs churn faster
  return { perLeagueSeason, newShare: Math.round(newShare * 1000) / 1000, uclOnly2002: uclOnly, projected: Math.round(leaguesTotal + uclTotal), assumptions: '25 seasons 2002-2026, 5 leagues, new share from 2003 v 2002, UCL-only churn >= 0.6; before id merges' }
}
