// Pure parsers for the athlete-scoped and site responses fill-espn.mjs reads. No I/O.
import { canonCore } from './espn-cache.mjs'

/** Flatten a core statistics record ({splits:{categories:[{stats:[{name,value}]}]}}) to {name: value}. */
export function flatStats(body) {
  const f = {}
  for (const c of body?.splits?.categories ?? []) for (const s of c.stats ?? []) f[s.name] = s.value
  return f
}

/** Per-event record (.../roster/{athlete}/statistics/0) -> the fields the ledger needs.
 *  timeStarted/timeEnded are seconds of match clock (188764: Messi 0 -> 4190 = off at 70'). */
export function parseStatRecord(body) {
  if (!body) return null
  const f = flatStats(body)
  if (!Object.keys(f).length) return null
  const num = (k) => (f[k] == null ? null : Number(f[k]))
  const min = (s) => (s == null ? null : Math.round(s / 60))
  return {
    appearances: num('appearances'), starts: num('starts'), subIns: num('subIns'), subOuts: num('subOuts'),
    dnp: num('dnp'), minutes: num('minutes'), timeStarted: num('timeStarted'), timeEnded: num('timeEnded'),
    onMin: min(num('timeStarted')), offMin: min(num('timeEnded')),
    goals: num('totalGoals'), pens: num('penaltyKickGoals'), ownGoals: num('ownGoals'), assists: num('goalAssists'),
    yc: num('yellowCards'), rc: num('redCards'),
    athleteRef: canonCore(body.athlete), competitionRef: canonCore(body.competition),
  }
}

/** leagues/all/seasons/{Y}/athletes/{id}/eventlog -> [{league, event, team, played, statUrl}]. */
export function parseEventlog(body) {
  if (!body) return null
  const items = (body.events?.items ?? []).map((i) => {
    const ev = canonCore(i.event)
    return {
      league: /leagues\/([^/]+)/.exec(ev)?.[1] ?? null,
      event: /events\/(\d+)/.exec(ev)?.[1] ?? null,
      team: i.teamId != null ? String(i.teamId) : null,
      played: !!i.played,
      statUrl: i.statistics ? canonCore(i.statistics) : null,
    }
  })
  return { count: body.events?.count ?? items.length, pageCount: body.events?.pageCount ?? 1, teams: Object.keys(body.teams ?? {}), items }
}

const inchToCm = (x) => (x == null || !Number.isFinite(Number(x)) || Number(x) <= 0 ? null : Math.round(Number(x) * 2.54))
const lbToKg = (x) => (x == null || !Number.isFinite(Number(x)) || Number(x) <= 0 ? null : Math.round(Number(x) * 0.4536))
/** ESPN writes DOB as local midnight Pacific ("1985-02-05T08:00Z"): the date part is the birth date.
 *  Never convert through Date (that's the UTC-midnight pitfall). */
export const dobOf = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s ?? '') ? s.slice(0, 10) : null)

/** Core athletes/{id}, or one entry of a site team roster's athletes[]: same field names. */
export function parseAthlete(a) {
  if (!a || !a.id) return null
  return {
    id: String(a.id),
    name: a.displayName ?? a.fullName ?? null,
    fullName: a.fullName ?? null,
    dob: dobOf(a.dateOfBirth),
    nationality: a.citizenship ?? a.flag?.alt ?? null,
    nationalityCode: a.citizenshipCountry?.abbreviation ?? null,
    birthCountry: a.birthPlace?.country ?? a.birthCountry?.abbreviation ?? null,
    position: a.position?.displayName ?? a.position?.name ?? null,
    positionAbbr: a.position?.abbreviation ?? null,
    height: inchToCm(a.height), // cm, from ESPN's inches
    weight: lbToKg(a.weight), // kg, from ESPN's pounds
    gender: a.gender ?? null,
  }
}

/** Site team roster -> parsed athletes. */
export const parseTeamRoster = (body) => (body?.athletes ?? []).flatMap((x) => (x?.items ? x.items : [x])).map(parseAthlete).filter(Boolean)

/** Year scoreboard -> completed events. */
export function parseScoreboard(body) {
  return (body?.events ?? []).map((e) => {
    const c = e.competitions?.[0] ?? {}
    const home = c.competitors?.find((x) => x.homeAway === 'home') ?? c.competitors?.[0]
    const away = c.competitors?.find((x) => x.homeAway === 'away') ?? c.competitors?.[1]
    return {
      id: String(e.id), date: e.date, status: e.status?.type?.name ?? null, completed: !!e.status?.type?.completed,
      seasonYear: e.season?.year ?? null, seasonSlug: e.season?.slug ?? null,
      homeId: home?.team?.id ?? null, homeName: home?.team?.displayName ?? null,
      awayId: away?.team?.id ?? null, awayName: away?.team?.displayName ?? null,
      round: (c.altGameNote || (c.notes ?? []).map((n) => n.headline).join('; ')).trim() || null,
    }
  })
}

/** Roster entries of one side of a site summary: [{id, name, starter, subbedIn, jersey}], deduped by id. */
export function summarySide(summary, teamId) {
  const r = (summary?.rosters ?? []).find((x) => String(x.team?.id) === String(teamId))
  const seen = new Map()
  for (const e of r?.roster ?? []) {
    const id = e.athlete?.id != null ? String(e.athlete.id) : null
    if (!id) continue
    const prev = seen.get(id)
    seen.set(id, { id, name: e.athlete.displayName ?? prev?.name ?? null, starter: !!e.starter || !!prev?.starter, subbedIn: !!e.subbedIn || !!prev?.subbedIn, jersey: e.jersey ?? prev?.jersey ?? null })
  }
  const rows = r?.roster?.length ?? 0
  const uniq = seen.size
  const counts = {}
  for (const e of r?.roster ?? []) { const id = e.athlete?.id; if (id != null) counts[id] = (counts[id] ?? 0) + 1 }
  const maxRepeat = Math.max(0, ...Object.values(counts))
  // Same test as the ledger's roster-collapsed rule (rows - unique > 2 and one id 3+ times).
  const collapsed = rows - uniq > 2 && maxRepeat >= 3
  return { rows, unique: uniq, collapsed, usable: !collapsed && uniq >= 11, entries: collapsed ? [] : [...seen.values()] }
}

/** Header competitors of a site summary. */
export function summaryHeader(summary) {
  const comp = summary?.header?.competitions?.[0]
  if (!comp) return null
  const side = (h) => comp.competitors?.find((c) => c.homeAway === h)
  const h = side('home'), a = side('away')
  return {
    id: String(summary.header.id), date: comp.date ?? null, slug: summary.header.league?.slug ?? null,
    homeId: h ? String(h.team?.id ?? h.id) : null, awayId: a ? String(a.team?.id ?? a.id) : null,
    homeName: h?.team?.displayName ?? null, awayName: a?.team?.displayName ?? null,
    homeScore: h?.score != null ? Number(h.score) : null, awayScore: a?.score != null ? Number(a.score) : null,
    status: comp.status?.type?.name ?? null,
  }
}

/** Per-match presence checks for the intl probe, per side (the espn-coverage-ucl-intl.md columns:
 *  rosters / starters / stats / keyEvents), plus a scorer-only test. */
export function presence(summary) {
  if (summary === null) return { summary: 'empty' }
  const hdr = summaryHeader(summary)
  if (!hdr) return { summary: 'no-header' }
  const ke = summary.keyEvents ?? []
  const goalsKE = ke.filter((k) => k.scoringPlay && !k.shootout).length
  const score = (hdr.homeScore ?? 0) + (hdr.awayScore ?? 0)
  const sides = {}
  for (const [k, tid] of [['home', hdr.homeId], ['away', hdr.awayId]]) {
    const r = (summary.rosters ?? []).find((x) => String(x.team?.id) === String(tid))
    const es = r?.roster ?? []
    const ids = new Set(es.map((e) => e.athlete?.id).filter((x) => x != null))
    const collapsed = es.length - ids.size > 2 && Math.max(0, ...[...ids].map((id) => es.filter((e) => e.athlete?.id === id).length)) >= 3
    const starters = new Set(es.filter((e) => e.starter && !e.subbedIn).map((e) => e.athlete?.id)).size // distinct: a collapsed side is 1
    const withStats = es.filter((e) => (e.stats ?? []).length).length
    sides[k] = { team: hdr[k + 'Name'], rows: es.length, unique: ids.size, starters, subsIn: es.filter((e) => e.subbedIn).length, withStats,
      full: !collapsed && ids.size >= 11 && starters >= 10, collapsed, scorerOnly: es.length > 0 && es.length <= 4 }
  }
  return {
    summary: 'ok', id: hdr.id, date: (hdr.date ?? '').slice(0, 10), home: hdr.homeName, away: hdr.awayName, score: `${hdr.homeScore}-${hdr.awayScore}`, status: hdr.status,
    rosters: sides.home.full && sides.away.full, anyRoster: sides.home.rows + sides.away.rows > 0,
    starters: sides.home.starters >= 10 && sides.away.starters >= 10,
    stats: sides.home.withStats > 0 && sides.away.withStats > 0,
    keyEvents: ke.length > 0, goalsReconciled: goalsKE === score,
    keyEventCount: ke.length, goalsKE, sides,
  }
}

/** Core leagues/{L}/events/{E}/competitions/{E}: date, sides and winner flags (the score sits behind
 *  another $ref, so a result here is W/L by the winner flag and D when neither side won). */
export function parseCompetition(body) {
  if (!body?.competitors) return null
  return {
    id: String(body.id), date: body.date ?? null,
    sides: body.competitors.map((c) => ({ team: String(c.id), homeAway: c.homeAway ?? null, winner: c.winner ?? null })),
  }
}
