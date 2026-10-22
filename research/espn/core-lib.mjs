// Shared helpers for the core-API probe (core-*.mjs). All fetches go through espn.mjs getUrl/get.
import { getUrl, get, summary } from './espn.mjs'
export const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/'
export const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/soccer/'
export const SITEWEB = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer/'
export const safe = async (p) => { try { return await p } catch (e) { return { __error: e.message.slice(0, 160) } } }
export const refPath = (r) => (r?.$ref ?? r ?? '').replace(/^https?:\/\/sports\.core\.api\.espn\.com\/v2\/sports\/soccer\//, '').replace(/\?.*/, '')
export const leagueOfRef = (r) => /leagues\/([^/]+)/.exec(refPath(r))?.[1]

/** Core competitor roster, condensed. */
export async function coreRoster(slug, eid, teamId) {
  const j = await safe(getUrl(`${CORE}leagues/${slug}/events/${eid}/competitions/${eid}/competitors/${teamId}/roster`))
  if (!j) return { exists: false }
  if (j.__error) return { exists: false, error: j.__error }
  const es = j.entries ?? []
  const ids = es.map((e) => String(e.playerId))
  return {
    exists: true, n: es.length, distinct: new Set(ids).size,
    starters: es.filter((e) => e.starter).length,
    subIn: es.filter((e) => e.subbedIn?.didSub).length,
    subOut: es.filter((e) => e.subbedOut?.didSub).length,
    formation: j.formation?.summary ?? null, ids,
    entries: es.map((e) => ({ id: String(e.playerId), st: !!e.starter, in: !!e.subbedIn?.didSub, out: !!e.subbedOut?.didSub, j: e.jersey })),
  }
}

/** Site summary roster info for one team (or all). */
export function siteRosterInfo(s, teamId) {
  if (!s || s.__error) return { exists: false }
  const rs = (s.rosters ?? []).filter((r) => !teamId || String(r.team?.id) === String(teamId))
  const out = rs.map((r) => {
    const es = r.roster ?? []
    const ids = es.map((e) => String(e.athlete?.id))
    return { team: String(r.team?.id), n: es.length, distinct: new Set(ids).size, starters: es.filter((e) => e.starter).length, ids }
  })
  return { exists: true, teams: out.length, rosters: out }
}
export const competitorsOf = (s) => (s?.header?.competitions?.[0]?.competitors ?? []).map((c) => ({ id: String(c.id ?? c.team?.id), name: c.team?.displayName, homeAway: c.homeAway, score: c.score }))
export { getUrl, get, summary }
