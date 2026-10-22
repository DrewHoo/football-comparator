// Shared analysis for the UCL / international coverage probes.
import { scoreboard, summary as rawSummary } from './espn.mjs'

/** Summary that never throws: persistent 5xx comes back as { fetchError }. */
export async function summary(slug, id) {
  try { return await rawSummary(slug, id) } catch (e) { console.error('SKIP', slug, id, e.message); return { fetchError: e.message } }
}

export const isGoalEvent = (k) => k.scoringPlay && !k.shootout
export const isOwnGoal = (k) => /own/i.test(k.type?.type ?? '') || /own goal/i.test(k.type?.text ?? '')

/** One-line coverage record for a match summary. */
export function analyse(sum, sbEvent) {
  const hdr = sum?.header ?? {}
  const comp = hdr.competitions?.[0] ?? {}
  const scores = (comp.competitors ?? []).map((c) => Number(c.score ?? 0))
  const scoreSum = scores.reduce((a, b) => a + b, 0)
  const rosters = sum?.rosters ?? []
  const players = rosters.flatMap((r) => r.roster ?? [])
  const statKeys = new Set()
  let withStats = 0, statG = 0, statA = 0
  for (const p of players) {
    if (p.stats?.length) withStats++
    for (const s of p.stats ?? []) {
      statKeys.add(s.abbreviation)
      if (s.abbreviation === 'G') statG += Number(s.value ?? 0)
      if (s.abbreviation === 'A') statA += Number(s.value ?? 0)
    }
  }
  const ke = sum?.keyEvents ?? []
  const goals = ke.filter(isGoalEvent)
  const ogs = goals.filter(isOwnGoal).length
  // Own goals: ESPN's "G" stat should not count them; reconcile score with stats G + own goals.
  return {
    id: hdr.id ?? sbEvent?.id,
    fetchError: sum?.fetchError ?? null,
    date: (comp.date ?? sbEvent?.date ?? '').slice(0, 10),
    name: sbEvent?.name ?? (comp.competitors ?? []).map((c) => c.team?.displayName).join(' v '),
    stageSlug: sbEvent?.season?.slug ?? '',
    stageNote: sbEvent?.competitions?.[0]?.altGameNote ?? '',
    group: sbEvent?.competitions?.[0]?.group?.name ?? '',
    headerSeason: hdr.season?.name ?? '',
    score: scores.join('-'),
    rosterTeams: rosters.filter((r) => r.roster?.length).length,
    rosterN: players.length,
    starters: players.filter((p) => p.starter).length,
    subIn: players.filter((p) => p.subbedIn).length,
    subOut: players.filter((p) => p.subbedOut).length,
    withStats,
    statKeys: [...statKeys].join(','),
    keyEvents: ke.length,
    keClock: ke.filter((k) => k.clock?.displayValue).length,
    goalKE: goals.length,
    goalKEwithAssist: goals.filter((k) => k.participants?.length > 1).length,
    ownGoals: ogs,
    subKE: ke.filter((k) => k.type?.type === 'substitution').length,
    scoreSum,
    statG,
    statA,
    goalsReconcileKE: goals.length === scoreSum,
    goalsReconcileStats: statKeys.has('G') ? statG + ogs === scoreSum : null,
  }
}

/** Scoreboard for d, else d+1, else d-1 (first non-empty). */
export async function scoreboardNear(slug, d, offsets = [0, 1, -1]) {
  for (const o of offsets) {
    const dt = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T00:00:00Z`)
    dt.setUTCDate(dt.getUTCDate() + o)
    const ds = dt.toISOString().slice(0, 10).replaceAll('-', '')
    const sb = await scoreboard(slug, ds)
    if (sb?.events?.length) return { date: ds, sb }
  }
  return { date: d, sb: null }
}

/** Per-player tallies from a set of summaries, filtered to one team id. */
export function tally(summaries, teamId) {
  const P = new Map()
  const row = (id, name) => {
    if (!P.has(id)) P.set(id, { id, name, rosterRows: 0, apps: 0, starts: 0, subApps: 0, keGoals: 0, keAssists: 0, statG: 0, statA: 0, statAPP: 0, hasStats: 0 })
    return P.get(id)
  }
  for (const s of summaries) {
    const r = (s.rosters ?? []).find((r) => String(r.team?.id) === String(teamId))
    for (const p of r?.roster ?? []) {
      const x = row(p.athlete.id, p.athlete.displayName)
      x.rosterRows++
      if (p.starter || p.subbedIn) x.apps++
      if (p.starter) x.starts++
      if (p.subbedIn && !p.starter) x.subApps++
      const st = Object.fromEntries((p.stats ?? []).map((q) => [q.abbreviation, Number(q.value ?? 0)]))
      if (p.stats?.length) x.hasStats++
      x.statG += st.G ?? 0
      x.statA += st.A ?? 0
      x.statAPP += st.APP ?? 0
    }
    for (const k of (s.keyEvents ?? []).filter(isGoalEvent)) {
      if (isOwnGoal(k)) continue
      if (String(k.team?.id) !== String(teamId)) continue
      const [sc, as] = k.participants ?? []
      if (sc) row(sc.athlete.id, sc.athlete.displayName).keGoals++
      if (as) row(as.athlete.id, as.athlete.displayName).keAssists++
    }
  }
  return [...P.values()]
}

export { scoreboard }
