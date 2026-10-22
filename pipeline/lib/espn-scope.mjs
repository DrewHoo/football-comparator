// What the ESPN harvest covers and the rules that turn scoreboard rows into played league-season
// matches. Copied and extended from research/espn/enumerate.mjs and season-index.mjs; the
// evidence for each rule is in research/espn-coverage-leagues.md §1 and §4,
// research/espn-coverage-ucl-intl.md §1 and research/espn-core-probe.md (summary item 3).

export const LEAGUES = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1']
export const UCL = 'uefa.champions'
export const UCL_QUAL = 'uefa.champions_qual' // UCL qualifiers from 2020-21 on
export const ALL_SLUGS = [...LEAGUES, UCL, UCL_QUAL]
export const FIRST_SEASON = 2002
/** Bump when any rule below changes: the harvester then re-derives the index from cached scoreboards (no requests). */
export const RULES_VERSION = 3
/** First season each slug holds data for the harvest. */
export const SLUG_FIRST = { [UCL_QUAL]: 2020 }

/** Statuses that mean the match was played. STATUS_FINAL_PEN (shootout) and STATUS_FINAL_AGT
 *  (decided on away goals) appear only in the UCL. */
export const PLAYED = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN', 'STATUS_FINAL_AGT', 'STATUS_FINAL_ABANDONED'])

/** Statuses ESPN leaves on some played league matches it never closed (La Liga 2022-23 has five at
 *  SCHEDULED with real scores; Bastia v Lyon 2016-17 is ABANDONED with no replay row). A row with one
 *  of these is kept, flagged stuck: true, only in a finished league-season whose home/away pairing
 *  has no played row. Ghost POSTPONED rows are never kept (every one has a played twin). */
export const STUCK = new Set(['STATUS_SCHEDULED', 'STATUS_ABANDONED'])

export const label = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`

/** Season start year for a match, by date (July to June), the rule from the probes.
 *  Near the boundary (May-September) ESPN's own season.year (always the start year) wins when it is
 *  one off: a UCL first-round qualifier on 2009-06-30 belongs to 2009-10, and the COVID-extended
 *  2019-20 season ran into July and August 2020. Gross misfilings (EPL 2009-10 under the 2013-14
 *  slug, Bundesliga 2010-11 under "group-stage") carry the right season.year anyway. */
export function seasonOf(iso, espnYear) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7)
  const byDate = m >= 7 ? y : y - 1
  if (Number.isInteger(espnYear) && Math.abs(espnYear - byDate) === 1 && m >= 5 && m <= 9) {
    return { season: espnYear, seasonBy: 'espn-year' }
  }
  return { season: byDate, seasonBy: 'date' }
}

/** Why a played row in scope is not a league/UCL match we want, or null to keep it. */
export function exclusionReason(row) {
  const { slug, season, id, seasonSlug } = row
  if (LEAGUES.includes(slug) && /playoff/i.test(seasonSlug)) return 'relegation-playoff (own season slug)'
  if (slug === 'ita.1' && (id === '183904' || id === '183905')) return 'relegation-playoff (Parma v Bologna 2004-05, inside league slug)'
  // EPL 2009-10: keep the legacy ids (~270k: 357 under the 2009-10 slug plus 23 Burnley fixtures under
  // the 2013-14 slug, all with full rosters). Drop the ~678k re-ingest: no rosters, foreign keyEvents.
  if (slug === 'eng.1' && season === 2009 && Number(id) >= 600000) return 'epl-2009-10 re-ingest (ids ~678k, no rosters)'
  return null
}

/** UCL qualifying rounds. The knockout-phase play-offs of 2024-25 on are proper-stage matches. */
export function isQualifier(slug, seasonSlug) {
  if (slug === UCL_QUAL) return true
  if (slug !== UCL) return false
  if (/knockout/i.test(seasonSlug)) return false
  return /qualif|preliminary|play-?off/i.test(seasonSlug)
}

/** Number of teams in a league-season. */
export function teamCount(slug, season) {
  if (slug === 'ger.1') return 18
  if (slug === 'ita.1' && season <= 2003) return 18
  if (slug === 'fra.1' && season >= 2023) return 18
  return 20
}

/** UCL proper-stage (non-qualifier) match counts by format. */
export function uclProperCount(season) {
  if (season === 2002) return 157 // two group stages: 96 + 48, QF 8, SF 4, final 1
  if (season === 2019) return 119 // COVID: QF and SF single-leg in Lisbon
  if (season >= 2024) return 189 // league phase 144, KO play-offs 16, R16 16, QF 8, SF 4, final 1
  return 125 // 96 group, R16 16, QF 8, SF 4, final 1
}

/** League-season shortfalls that are real (not an ESPN gap); tolerated by the check.
 *  { played: expected played count, why }. The probe's three stuck-row exceptions (ita.1 2003-04
 *  Reggina v Sampdoria, fra.1 2003-04 Nantes v Bordeaux, esp.1 2007-08 Betis v Athletic) are now
 *  filled by the STUCK rule and show up as "stuck" in the completeness line instead. */
export const KNOWN_EXCEPTIONS = {
  'fra.1 2019': { played: 279, why: 'Ligue 1 2019-20 curtailed by COVID after 279 matches' },
}
