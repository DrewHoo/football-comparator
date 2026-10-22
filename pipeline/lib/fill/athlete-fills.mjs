// --job athlete-fills: per-player per-match records from ESPN's athlete store for the team-matches
// the club ledger could not build (roster-collapsed, roster-missing), the pending international
// cases, and the full eventlog pull for Vardy and Lacazette (no RSSSF log).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, statUrl, eventlogUrl, summaryUrl, CORE, readCached, fetchedAt, etaHours } from './espn-cache.mjs'
import { parseStatRecord, parseEventlog, parseCompetition, summaryHeader } from './parse.mjs'
import { ClubSquads, IntlSquads } from './squads.mjs'

export const OUT_DIR = path.join(ROOT, 'data/ledger/fills')
const LEDGER = path.join(ROOT, 'data/ledger')
const competitionUrl = (league, event) => `${CORE}leagues/${league}/events/${event}/competitions/${event}`

/** Cases the anomalies file may not carry (internationals are outside the club index) or that a
 *  gate is waiting on. Team ids: Argentina 202, Barcelona 83, Udinese 118. Header fields come from
 *  the cached site summary when it has one; `fallback` is used only when it does not. */
export const SPECIAL = [
  { event: '184000', slug: 'fifa.friendly', teams: ['202'], must: [['202', '45843']], why: 'Messi debut v Hungary 2005-08-17: summary lists only the scorers (intl gate messi_debut)', fallback: { date: '2005-08-17T18:00Z', season: 2005 } },
  { event: '264119', slug: 'fifa.world', why: 'WC 2010 QF Argentina 0-4 Germany: summary empty', fallback: { date: '2010-07-03T14:00Z', season: 2010, homeId: '202', awayId: '481' } },
  { event: '383241', slug: 'fifa.world', why: 'WC 2014 SF Netherlands 0-0 Argentina: summary empty', fallback: { date: '2014-07-09T20:00Z', season: 2014, homeId: '449', awayId: '202' } },
  { event: '264123', slug: 'fifa.world', why: 'WC 2010 final Netherlands 0-1 Spain: summary empty (probe Q1); not a gate, cheap while the squads are known', fallback: { date: '2010-07-11T18:30Z', season: 2010, homeId: '449', awayId: '164' }, optional: true },
  { event: '188764', slug: 'uefa.champions', teams: ['83', '118'], why: 'Barcelona-Udinese 2005-09-27: collapsed roster (Messi UCL 2005-06 gate)' },
  { event: '188837', slug: 'uefa.champions', teams: ['83', '118'], why: 'Udinese-Barcelona 2005-12-07: collapsed roster' },
]
export const PLAYERS = [
  { id: '165648', name: 'Jamie Vardy', nation: 'England', from: 2010, to: 2026 },
  { id: '131752', name: 'Alexandre Lacazette', nation: 'France', from: 2009, to: 2026 },
]
// Senior A-international competitions (club continentals like fifa.cwc are not; youth/olympic apart).
export const INTL_SLUG = /^(fifa\.(world$|worldq|wcq|friendly$|confederations)|uefa\.(euro$|euroq|nations)|conmebol\.america|caf\.nations|concacaf\.(gold|nations|confederations)|afc\.(asian\.cup|cupq)|global\.finalissima)/
export const YOUTH_SLUG = /olympic|u-?2[013]|u-?1\d|youth|_u2|\.u\d/i

const readJsonl = (f) => { try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) } catch { return [] } }
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }

/** Every broken team-match to fill: ledger anomalies (read now; the list grows with the harvest) + SPECIAL. */
export function loadTargets({ includeQualifiers = true, includeOptional = true } = {}) {
  const anomalies = readJsonl(path.join(LEDGER, 'anomalies.jsonl')).filter((a) => a.rule === 'roster-collapsed' || a.rule === 'roster-missing')
  const matches = new Map()
  const want = new Set(anomalies.map((a) => String(a.id)))
  for (const l of fs.readFileSync(path.join(LEDGER, 'matches.jsonl'), 'utf8').split('\n')) {
    if (!l) continue
    const id = /"id":"(\d+)"/.exec(l)?.[1]
    if (want.has(id) || SPECIAL.some((s) => s.event === id)) matches.set(id, JSON.parse(l))
  }
  const targets = new Map()
  const put = (t) => { const k = `${t.event}|${t.team}`; if (!targets.has(k)) targets.set(k, t); else Object.assign(targets.get(k), { why: targets.get(k).why ?? t.why, must: t.must ?? targets.get(k).must }) }
  for (const a of anomalies) {
    const m = matches.get(String(a.id))
    if (!m) continue
    if (!includeQualifiers && m.qualifier) continue
    put(fromMatch(m, String(a.team), { rule: a.rule, evidence: a.evidence ?? [], intl: false }))
  }
  for (const s of SPECIAL) {
    if (s.optional && !includeOptional) continue
    const m = matches.get(s.event)
    if (m) { for (const team of s.teams ?? [m.homeId, m.awayId]) put(fromMatch(m, team, { rule: 'special', why: s.why, intl: false, must: s.must })); continue }
    // International: header from the cached site summary, else the fallback.
    const c = readCached(summaryUrl(s.slug, s.event))
    const h = c.state === 'ok' ? summaryHeader(c.body) : null
    const season = c.body?.header?.season?.year ?? s.fallback?.season
    const base = {
      id: s.event, slug: s.slug, season, date: h?.date ?? s.fallback?.date, qualifier: false, stage: s.slug === 'fifa.world' ? 'finals' : 'friendly',
      homeId: h?.homeId ?? s.fallback?.homeId, awayId: h?.awayId ?? s.fallback?.awayId, homeScore: h?.homeScore ?? null, awayScore: h?.awayScore ?? null,
      extraTime: null, assistsReliable: null, headerFrom: h ? 'summary' : 'fallback',
    }
    for (const team of s.teams ?? [base.homeId, base.awayId]) put(fromMatch(base, team, { rule: 'special', why: s.why, intl: true, must: s.must }))
  }
  return [...targets.values()]
}

function fromMatch(m, team, extra) {
  const home = String(m.homeId) === String(team)
  return {
    event: String(m.id), slug: m.slug, season: m.season, date: m.date, team: String(team), opp: String(home ? m.awayId : m.homeId), home,
    qualifier: !!m.qualifier, stage: m.stage ?? null, extraTime: m.extraTime ?? null, assistsReliable: m.assistsReliable ?? null,
    homeScore: m.homeScore ?? null, awayScore: m.awayScore ?? null, ...extra,
  }
}

const SQUAD = 18 // a matchday squad; the most stat records one side can hold

/** Plan and run. dryRun: nothing fetched; returns the plan. */
export async function run({ fetcher, includeQualifiers = true, players = true, log = console.log, athleteEvents = 'all' }) {
  const merge = readJson(path.join(LEDGER, 'id-merge.json'), { map: {} }).map ?? {}
  const canon = (id) => merge[id] ?? id
  const targets = loadTargets({ includeQualifiers })
  const club = new ClubSquads()
  const intl = new IntlSquads()

  // 1. Candidates per side (zero requests).
  for (const t of targets) {
    const sq = t.intl ? await intl.candidates({ event: t.event, teamId: t.team, date: t.date, slug: t.slug, evidence: t.evidence, fetcher })
      : club.candidates({ event: t.event, teamId: t.team, season: t.season, date: t.date, evidence: t.evidence })
    for (const [, a] of t.must ?? []) if (!sq.candidates.has(a)) sq.candidates.set(a, { id: a, name: null, seen: 1, from: new Set(['must']) })
    t.sq = sq
  }

  // 2. Strategy per (team, eventlog year): direct statistics/0 per candidate per match, or one
  //    eventlog per candidate then statistics/0 only for the matches the eventlog lists.
  const groups = new Map()
  for (const t of targets) {
    const year = t.season // club: season start year; internationals: ESPN's season year for the competition
    const k = `${t.team}|${year}`
    if (!groups.has(k)) groups.set(k, { team: t.team, year, targets: [], union: new Set() })
    const g = groups.get(k)
    g.targets.push(t)
    for (const id of t.sq.candidates.keys()) g.union.add(id)
  }
  for (const g of groups.values()) {
    const uncachedStat = (t, a) => readCached(statUrl(t.slug, t.event, t.team, a)).state === 'pending'
    g.directCost = g.targets.reduce((s, t) => s + [...t.sq.candidates.keys()].filter((a) => uncachedStat(t, a)).length, 0)
    const elUncached = [...g.union].filter((a) => readCached(eventlogUrl(g.year, a)).state === 'pending').length
    g.eventlogCost = elUncached + g.targets.reduce((s, t) => s + Math.min(SQUAD, [...t.sq.candidates.keys()].filter((a) => uncachedStat(t, a)).length), 0)
    g.forced = g.targets.some((t) => t.sq.widened)
    g.strategy = g.forced || g.eventlogCost < g.directCost ? 'eventlog' : 'direct'
  }

  // 3. Execute (dry run: every fetcher.get on an uncached URL is recorded, not fetched).
  const rows = []
  const sides = []
  for (const g of groups.values()) {
    const listed = new Map() // `${event}|${athlete}` -> statUrl, or null (listed, no stat record)
    const known = new Set() // candidates whose eventlog is on disk (or was just fetched)
    if (g.strategy === 'eventlog') {
      for (const a of g.union) {
        const items = await eventlogItems(fetcher, g.year, a)
        if (items === undefined) continue
        known.add(a)
        for (const it of items) if (it.team === g.team && g.targets.some((t) => t.event === it.event)) listed.set(`${it.event}|${a}`, it.statUrl)
      }
    }
    for (const t of g.targets) {
      const side = { event: t.event, slug: t.slug, season: t.season, date: t.date, team: t.team, rule: t.rule, why: t.why ?? null, qualifier: t.qualifier, intl: !!t.intl,
        strategy: g.strategy, candidates: t.sq.candidates.size, sources: t.sq.sources, widened: t.sq.widened, pendingNear: t.sq.pendingNear,
        records: 0, notFound: 0, apps: 0, starters: 0, subsOn: 0, unknownEventlog: 0, uncachedStat: 0, checks: [] }
      const must = new Set((t.must ?? []).map(([, a]) => a))
      for (const [a, c] of t.sq.candidates) {
        let url = statUrl(t.slug, t.event, t.team, a)
        if (g.strategy === 'eventlog' && !must.has(a)) {
          if (!known.has(a)) { side.unknownEventlog++; continue } // dry run: estimated below
          const k = `${t.event}|${a}`
          if (!listed.has(k)) continue // not in that squad
          if (!listed.get(k)) { side.checks.push({ athlete: a, name: c.name, note: 'eventlog lists the match, no stat record' }); continue }
          url = listed.get(k)
        }
        const body = await fetcher.get(url, 'stat')
        if (body === undefined) { side.uncachedStat++; continue }
        if (body === null) { side.notFound++; continue }
        side.records++
        const rec = parseStatRecord(body)
        if (!rec || !(rec.appearances >= 1)) continue
        const row = toRow(t, a, c.name, rec, url, canon)
        side.apps++; if (row.started) side.starters++; else side.subsOn++
        side.checks.push(...checkEvidence(t, a, row))
        rows.push(row)
      }
      // Stat requests that wait on an eventlog not yet on disk: at most a matchday squad per side.
      side.estimatedStat = Math.min(SQUAD, side.unknownEventlog) + (t.sq.fallbackPending ? 3 + 23 : 0) // fallback pending: 3 squad summaries + a 23-man squad of stat records
      side.fallback = t.sq.fallback ?? null
      side.complete = side.starters === 11
      sides.push(side)
    }
  }

  // 4. Vardy and Lacazette: every season's eventlog, then each listed event's record and context.
  const players_ = []
  if (players) for (const p of PLAYERS) players_.push(await playerPull(fetcher, p, { rows, canon, athleteEvents }))

  return { targets, groups: [...groups.values()], sides, rows, players: players_ }
}

async function eventlogItems(fetcher, year, athlete) {
  const first = await fetcher.get(eventlogUrl(year, athlete), 'eventlog')
  if (first === undefined) return undefined
  if (first === null) return []
  const p = parseEventlog(first)
  const items = [...p.items]
  for (let page = 2; page <= (p.pageCount ?? 1); page++) {
    const more = await fetcher.get(`${eventlogUrl(year, athlete)}&page=${page}`, 'eventlog')
    if (more) items.push(...parseEventlog(more).items)
  }
  return items
}

export function toRow(t, athlete, name, rec, url, canon) {
  const cap = t.extraTime === false ? 90 : t.extraTime ? 120 : (rec.minutes > 90 ? 120 : 90) // unknown (internationals): trust the record up to 120
  const started = rec.starts >= 1
  const subIn = !started && rec.subIns >= 1 ? rec.onMin : null
  const sentOff = rec.rc >= 1 ? rec.offMin : null
  const subOff = rec.subOuts >= 1 && sentOff == null ? rec.offMin : null
  let minutes = rec.minutes > 0 ? Math.min(rec.minutes, cap) : null
  if (minutes == null && rec.timeEnded > 0) minutes = Math.max(0, Math.min(rec.offMin, cap) - (started ? 0 : (rec.onMin ?? 0)))
  const my = t.home ? t.homeScore : t.awayScore, their = t.home ? t.awayScore : t.homeScore
  const result = my == null || their == null ? null : my > their ? 'W' : my < their ? 'L' : 'D'
  return {
    id: t.event, slug: t.slug, season: t.season, date: t.date, qualifier: t.qualifier, stage: t.stage,
    athleteId: canon(athlete), espnId: athlete, name: name ?? null, teamId: t.team, oppId: t.opp, home: t.home,
    started, subIn, subOff, sentOff, minutes, goals: rec.goals, pens: rec.pens, ownGoals: rec.ownGoals,
    assists: rec.assists, yc: rec.yc, rc: rec.rc, result,
    source: 'athlete-store', intl: !!t.intl, fill: t.rule,
    receipt: { url, fetchedAt: fetchedAt(url) },
  }
}

/** Compare the record with the anomaly's keyEvent evidence ("goal 27'", "on 62'", "off 81'"). */
export function checkEvidence(t, athlete, row) {
  const ev = (t.evidence ?? []).find((e) => String(e.id) === String(athlete))
  if (!ev) return []
  const out = []
  const goals = ev.roles.filter((r) => /^goal/.test(r)).length
  const on = ev.roles.map((r) => /^on (\d+)/.exec(r)?.[1]).find(Boolean)
  const off = ev.roles.map((r) => /^off (\d+)/.exec(r)?.[1]).find(Boolean)
  if (goals && row.goals !== goals) out.push({ athlete, name: row.name, field: 'goals', keyEvents: goals, record: row.goals })
  if (on && (row.subIn == null || Math.abs(row.subIn - Number(on)) > 2)) out.push({ athlete, name: row.name, field: 'subIn', keyEvents: Number(on), record: row.subIn })
  if (off && ((row.subOff ?? row.sentOff) == null || Math.abs((row.subOff ?? row.sentOff) - Number(off)) > 2)) out.push({ athlete, name: row.name, field: 'subOff', keyEvents: Number(off), record: row.subOff ?? row.sentOff })
  return out
}

/** Mean listed-with-stat items per season in the eventlogs already cached (the probe's 5 players):
 *  the estimate for a player whose eventlogs are not on disk. */
export function eventlogDensity() {
  const per = []
  let outsideIndex = 0, total = 0
  const club = new ClubSquads()
  for (const id of ['22774', '45843', '8039', '10293', '253989']) {
    for (let y = 2001; y <= 2026; y++) {
      const c = readCached(eventlogUrl(y, id))
      if (c.state !== 'ok' || !c.body) continue
      const it = parseEventlog(c.body).items.filter((i) => i.statUrl)
      if (!it.length) continue
      per.push(it.length)
      for (const i of it) { total++; if (!club.byId.has(i.event) && readCached(summaryUrl(i.league, i.event)).state !== 'ok') outsideIndex++ }
    }
  }
  return { seasons: per.length, perSeason: per.length ? Math.round(per.reduce((a, b) => a + b, 0) / per.length) : 50, outsideIndexShare: total ? outsideIndex / total : 0.5 }
}

async function playerPull(fetcher, p, { rows, canon, athleteEvents }) {
  const club = new ClubSquads()
  const out = { ...p, seasons: 0, eventlogsKnown: 0, listed: 0, withStat: 0, intlListed: 0, apps: 0, intlApps: 0, unknownSeasons: 0 }
  for (let y = p.from; y <= p.to; y++) {
    const items = await eventlogItems(fetcher, y, p.id)
    out.seasons++
    if (items === undefined) { out.unknownSeasons++; continue }
    out.eventlogsKnown++
    for (const it of items) {
      out.listed++
      const isIntl = INTL_SLUG.test(it.league ?? '')
      if (isIntl) out.intlListed++
      if (!it.statUrl) continue
      if (athleteEvents === 'intl' && !isIntl) continue
      out.withStat++
      const body = await fetcher.get(it.statUrl, 'stat')
      if (!body) continue
      const rec = parseStatRecord(body)
      if (!rec || !(rec.appearances >= 1)) continue
      // Match context: the club index, a cached summary, else the core competition (1 request).
      let t = null
      const ie = club.byId.get(it.event)
      if (ie) t = { event: ie.id, slug: ie.slug, season: ie.season, date: ie.date, home: String(ie.homeId) === it.team, opp: String(String(ie.homeId) === it.team ? ie.awayId : ie.homeId), homeScore: ie.homeScore, awayScore: ie.awayScore }
      if (!t) {
        const s = readCached(summaryUrl(it.league, it.event))
        const h = s.state === 'ok' ? summaryHeader(s.body) : null
        if (h) t = { event: it.event, slug: it.league, season: s.body.header?.season?.year ?? y, date: h.date, home: h.homeId === it.team, opp: h.homeId === it.team ? h.awayId : h.homeId, homeScore: h.homeScore, awayScore: h.awayScore }
      }
      if (!t) {
        const cb = parseCompetition(await fetcher.get(competitionUrl(it.league, it.event), 'competition'))
        const me = cb?.sides.find((x) => x.team === it.team), them = cb?.sides.find((x) => x.team !== it.team)
        t = { event: it.event, slug: it.league, season: y, date: cb?.date ?? null, home: me?.homeAway === 'home', opp: them?.team ?? null, homeScore: null, awayScore: null,
          resultFromWinner: me ? (me.winner ? 'W' : them?.winner ? 'L' : 'D') : null }
      }
      const row = toRow({ ...t, team: it.team, qualifier: null, stage: null, extraTime: null, intl: isIntl, rule: 'player-pull' }, p.id, p.name, rec, it.statUrl, canon)
      if (row.result == null && t.resultFromWinner) { row.result = t.resultFromWinner; row.resultFrom = 'winner-flag' }
      row.youth = YOUTH_SLUG.test(it.league ?? '')
      rows.push(row)
      out.apps++; if (isIntl) out.intlApps++
    }
  }
  return out
}

export { competitionUrl, etaHours }
