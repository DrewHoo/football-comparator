// Per-match coverage record from one ESPN summary + its scoreboard row.
export const clockMin = (k) => {
  const v = k?.clock?.displayValue || ''
  const m = /(\d+)'(?:\+(\d+))?/.exec(v)
  return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0) : (k?.clock?.value ? k.clock.value / 60 : null)
}
const isGoal = (k) => k.scoringPlay === true || /goal|penalty---scored/i.test(k.type?.type || '')
const isSub = (k) => /substitution/i.test(k.type?.type || '')
const isOG = (k) => /own/i.test(k.type?.type || '') || /own goal/i.test(k.type?.text || '') || k.ownGoal === true
export function inspect(s, row) {
  const r = { id: row.id, slug: row.slug, season: row.season, kind: row.kind, date: row.date, name: row.name }
  if (!s) return { ...r, missing: true }
  const ros = s.rosters || []
  const sides = ['home', 'away'].map((h) => ros.find((x) => x.homeAway === h))
  r.rosterBoth = sides.every((x) => x?.roster?.length > 0)
  r.rosterSize = sides.map((x) => x?.roster?.length || 0)
  r.starters = sides.map((x) => (x?.roster || []).filter((p) => p.starter === true).length)
  r.starterFlag = sides.every((x) => (x?.roster || []).some((p) => 'starter' in p))
  r.eleven = r.starters.every((n) => n === 11)
  // Repaired view: one entry per athlete id; starter only if flagged starter and never subbedIn.
  const matchHasApp = sides.some((x) => (x?.roster || []).some((p) => (p.stats || []).some((q) => q.abbreviation === 'APP')))
  r.collapsedIds = sides.some((x) => x?.roster?.length > 5 && new Set(x.roster.map((p) => p.athlete?.id)).size <= 2)
  const fixed = sides.map((x) => {
    const m = new Map()
    for (const p of x?.roster || []) {
      const id = p.athlete?.id; const q = m.get(id)
      if (!q) m.set(id, { ...p, _n: 1 })
      else m.set(id, { ...q, _n: q._n + 1, starter: q.starter || p.starter, subbedIn: q.subbedIn || p.subbedIn, subbedOut: q.subbedOut || p.subbedOut, stats: q.stats?.length ? q.stats : p.stats })
    }
    const app = (p) => Number((p.stats || []).find((x) => x.abbreviation === 'APP')?.value || 0)
    return [...m.values()].map((p) => ({ ...p, starter: p.starter && !p.subbedIn && (!matchHasApp || app(p) === 1) }))
  })
  r.dupEntries = sides.map((x, i) => (x?.roster?.length || 0) - fixed[i].length)
  r.startersFixed = fixed.map((ps) => ps.filter((p) => p.starter).length)
  r.elevenFixed = r.startersFixed.every((n) => n === 11)
  r.noStarterFlags = r.starters.every((n) => n === 0)
  r.subsInFixed = fixed.map((ps) => ps.filter((p) => p.subbedIn).length)
  const used = fixed.map((ps) => ps.filter((p) => p.starter || p.subbedIn))
  r.unusedBench = sides.map((x, i) => (x?.roster?.length || 0) - used[i].length)
  r.subsIn = sides.map((x) => (x?.roster || []).filter((p) => p.subbedIn === true).length)
  r.subsOut = sides.map((x) => (x?.roster || []).filter((p) => p.subbedOut === true).length)
  const all = sides.flatMap((x) => x?.roster || [])
  r.statsAny = all.some((p) => p.stats?.length)
  r.statsAllUsed = used.flat().length > 0 && used.flat().every((p) => p.stats?.length)
  r.statKeys = [...new Set(all.flatMap((p) => (p.stats || []).map((x) => x.abbreviation)))].sort()
  const sv = (p, k) => Number((p.stats || []).find((x) => x.abbreviation === k)?.value || 0)
  r.statG = sides.map((x) => (x?.roster || []).reduce((a, p) => a + sv(p, 'G'), 0))
  r.statA = sides.map((x) => (x?.roster || []).reduce((a, p) => a + sv(p, 'A'), 0))
  r.statOG = sides.map((x) => (x?.roster || []).reduce((a, p) => a + sv(p, 'OG'), 0))
  r.statAPP = used.flat().filter((p) => sv(p, 'APP') === 1).length + '/' + used.flat().length
  const ke = s.keyEvents || []
  r.keyEvents = ke.length
  r.keTypes = [...new Set(ke.map((k) => k.type?.type))]
  const teamIdx = (k) => { const id = k.team?.id; return sides.findIndex((x) => x?.team?.id === id) }
  const goals = ke.filter(isGoal)
  r.keGoals = [0, 1].map((i) => goals.filter((k) => teamIdx(k) === i).length)
  r.keGoalsClock = goals.every((k) => clockMin(k) != null)
  r.keGoalScorer = goals.every((k) => k.participants?.[0]?.athlete?.id)
  r.keGoalAssister = goals.filter((k) => (k.participants?.length || 0) >= 2).length
  r.keOG = goals.filter(isOG).length
  r.kePen = goals.filter((k) => /penalty/i.test(k.type?.type || '') || /penalty/i.test(k.type?.text || '')).length
  const subs = ke.filter(isSub)
  r.keSubsRaw = [0, 1].map((i) => subs.filter((k) => teamIdx(k) === i).length)
  const uniqSubs = [...new Map(subs.map((k) => [k.participants?.map((p) => p.athlete?.id).join('>'), k])).values()]
  r.keSubs = [0, 1].map((i) => uniqSubs.filter((k) => teamIdx(k) === i).length)
  r.keSubsClock = subs.every((k) => clockMin(k) != null)
  r.keSubsMatchRoster = r.keSubs[0] === r.subsInFixed[0] && r.keSubs[1] === r.subsInFixed[1]
  r.keSubsDup = r.keSubsRaw[0] + r.keSubsRaw[1] > r.keSubs[0] + r.keSubs[1]
  // every sub-on player has an event with a clock (what minutes need)
  r.subClockForAll = fixed.every((ps) => ps.filter((p) => p.subbedIn).every((p) => uniqSubs.some((k) => k.participants?.[0]?.athlete?.id === p.athlete?.id && clockMin(k) != null)))
  const comp = s.header?.competitions?.[0]
  const sc = ['home', 'away'].map((h) => Number(comp?.competitors?.find((c) => c.homeAway === h)?.score))
  r.score = sc
  r.scoreMatchesBoard = sc[0] === Number(row.hs) && sc[1] === Number(row.as)
  r.keGoalsMatchScore = r.keGoals[0] === sc[0] && r.keGoals[1] === sc[1]
  // stats G counts goals by a team's own players; opponents' own goals are added from the other side's OG
  r.statGMatchScore = r.statsAny && r.statG[0] + r.statOG[1] === sc[0] && r.statG[1] + r.statOG[0] === sc[1]
  r.attendance = s.gameInfo?.attendance || 0
  r.venue = !!s.gameInfo?.venue?.fullName
  r.headerStatus = comp?.status?.type?.name
  return r
}
