// Enumerates played events from year scoreboards (scoreboard?dates=YYYY&limit=1000 returns a whole
// calendar year, so a season costs two requests) and checks each league-season for completeness.
import { get } from '../../research/espn/espn.mjs'
import {
  LEAGUES, UCL, UCL_QUAL, SLUG_FIRST, FIRST_SEASON, PLAYED, STUCK, label, seasonOf, exclusionReason,
  isQualifier, teamCount, uclProperCount, KNOWN_EXCEPTIONS,
} from './espn-scope.mjs'

export const yearUrl = (slug, year) => `${slug}/scoreboard?dates=${year}&limit=1000`

/** Calendar years a slug needs for seasons [from..to], never past the current year. */
export function yearsFor(slug, from, to, currentYear) {
  const first = Math.max(from, SLUG_FIRST[slug] ?? FIRST_SEASON)
  const out = []
  for (let y = first; y <= Math.min(to + 1, currentYear); y++) out.push(y)
  return out
}

function rowFrom(slug, e) {
  const c = e.competitions?.[0] ?? {}
  const home = c.competitors?.find((x) => x.homeAway === 'home')
  const away = c.competitors?.find((x) => x.homeAway === 'away')
  const { season, seasonBy } = seasonOf(e.date, e.season?.year)
  const seasonSlug = e.season?.slug ?? null
  const notes = (c.notes ?? []).map((n) => n.headline).filter(Boolean)
  const row = {
    slug, season, seasonLabel: label(season), date: e.date, id: String(e.id),
    homeId: home?.team?.id ?? null, homeName: home?.team?.displayName ?? null,
    awayId: away?.team?.id ?? null, awayName: away?.team?.displayName ?? null,
    homeScore: home?.score != null ? Number(home.score) : null,
    awayScore: away?.score != null ? Number(away.score) : null,
    status: e.status?.type?.name ?? null,
    seasonSlug, seasonYear: e.season?.year ?? null, seasonType: e.season?.type ?? null,
    round: (c.altGameNote || notes.join('; ')).trim() || null,
  }
  if (seasonBy !== 'date') row.seasonBy = seasonBy
  if (slug === UCL || slug === UCL_QUAL) row.qualifier = isQualifier(slug, seasonSlug)
  return row
}

/** Read one slug's year scoreboards (cache hits unless refresh lists the year) and split them into
 *  kept played rows, rule-excluded rows, and a tally of unplayed statuses per season.
 *  stuckBefore: ISO date; stuck rows (see STUCK) are only considered for seasons that have ended
 *  (season < runningSeason) and dates before this cut. */
export async function enumerateSlug(slug, years, { refreshYears = new Set(), onRequest, runningSeason, stuckBefore } = {}) {
  const seen = new Map()
  const warnings = []
  for (const y of years) {
    const r = await get(yearUrl(slug, y), refreshYears.has(y) ? { nocache: true } : undefined)
    onRequest?.()
    const ev = r?.events ?? []
    if (ev.length >= 1000) warnings.push(`${slug} ${y}: ${ev.length} events, the year query may be truncated`)
    for (const e of ev) {
      if (!e?.id || !e.date) continue
      const row = rowFrom(slug, e)
      if ((SLUG_FIRST[slug] ?? FIRST_SEASON) > row.season) continue
      if (!seen.has(row.id)) seen.set(row.id, row)
    }
  }
  const kept = [], excluded = [], candidates = []
  for (const row of seen.values()) {
    if (!PLAYED.has(row.status)) { candidates.push(row); continue }
    const why = exclusionReason(row)
    if (why) excluded.push({ ...row, excludedBecause: why })
    else kept.push(row)
  }
  const unplayed = {} // season -> { status: n }, after stuck rows are taken out
  const pairs = new Set(kept.map((e) => `${e.season} ${e.homeId}-${e.awayId}`))
  candidates.sort((a, b) => b.date.localeCompare(a.date)) // latest row wins a missing pairing
  for (const row of candidates) {
    const k = `${row.season} ${row.homeId}-${row.awayId}`
    if (LEAGUES.includes(slug) && STUCK.has(row.status) && row.season < runningSeason && row.date < stuckBefore &&
        !pairs.has(k) && !exclusionReason(row)) {
      pairs.add(k)
      kept.push({ ...row, stuck: true })
      continue
    }
    const t = (unplayed[row.season] ||= {})
    t[row.status] = (t[row.status] || 0) + 1
  }
  return { kept, excluded, unplayed, warnings }
}

/** Completeness lines per league-season. Returns { lines, failures }. */
export function completeness(events, unplayedBySlug, { seasons, slugs, runningSeason }) {
  const lines = [], failures = []
  const by = new Map()
  for (const e of events) {
    const k = `${e.slug} ${e.season}`
    if (!by.has(k)) by.set(k, [])
    by.get(k).push(e)
  }
  for (const slug of slugs) {
    for (let s = seasons[0]; s <= seasons[1]; s++) {
      if ((SLUG_FIRST[slug] ?? FIRST_SEASON) > s) continue
      const evs = by.get(`${slug} ${s}`) ?? []
      const running = s === runningSeason
      const un = unplayedBySlug[slug]?.[s] ?? {}
      const unTxt = Object.keys(un).length ? ' unplayed ' + Object.entries(un).map(([k, n]) => `${k.replace('STATUS_', '')}=${n}`).join(',') : ''
      if (LEAGUES.includes(slug)) {
        const n = teamCount(slug, s)
        const expected = n * (n - 1)
        const teams = new Set(evs.flatMap((e) => [e.homeId, e.awayId]))
        const pairs = new Map()
        for (const e of evs) { const k = `${e.homeId}-${e.awayId}`; pairs.set(k, (pairs.get(k) || 0) + 1) }
        const repeats = [...pairs.values()].filter((v) => v > 1).length
        const known = KNOWN_EXCEPTIONS[`${slug} ${s}`]
        const stuck = evs.filter((e) => e.stuck)
        let verdict
        const clean = evs.length === expected && teams.size === n && repeats === 0
        if (clean) verdict = stuck.length ? `OK (incl. ${stuck.length} stuck: ${stuck.map((e) => `${e.id} ${e.status.replace('STATUS_', '')} ${e.homeName} v ${e.awayName}`).join('; ')})` : 'OK'
        else if (running) verdict = 'RUNNING'
        else if (known && evs.length === known.played && teams.size === n && repeats === 0) verdict = `KNOWN (${known.why})`
        else { verdict = 'FAIL'; failures.push(`${slug} ${label(s)}`) }
        lines.push(`${slug.padEnd(20)} ${label(s)}  played ${String(evs.length).padStart(3)}/${expected}  teams ${teams.size}/${n}  repeatPairs ${repeats}  ${verdict}${unTxt}`)
      } else {
        const proper = evs.filter((e) => !e.qualifier)
        const qual = evs.filter((e) => e.qualifier)
        const rounds = {}
        for (const e of evs) rounds[e.seasonSlug] = (rounds[e.seasonSlug] || 0) + 1
        const rTxt = Object.entries(rounds).map(([k, v]) => `${k}=${v}`).join(' ')
        let verdict = ''
        if (slug === UCL) {
          const exp = uclProperCount(s)
          if (proper.length === exp) verdict = 'OK'
          else if (running) verdict = 'RUNNING'
          else { verdict = 'FAIL'; failures.push(`${slug} ${label(s)}`) }
          lines.push(`${slug.padEnd(20)} ${label(s)}  proper ${String(proper.length).padStart(3)}/${exp}  qualifiers ${qual.length}  ${verdict}  [${rTxt}]${unTxt}`)
        } else {
          lines.push(`${slug.padEnd(20)} ${label(s)}  qualifiers ${qual.length}  [${rTxt}]${unTxt}`)
        }
      }
    }
  }
  return { lines, failures }
}
