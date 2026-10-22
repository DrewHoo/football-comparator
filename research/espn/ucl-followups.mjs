// Follow-ups: pre-2001 UCL absence, playoff/early qualifying rounds, where modern qualifiers live,
// and how complete one national team's non-tournament calendar is (Portugal qualifiers + friendlies).
import fs from 'node:fs/promises'
import { get, stats } from './espn.mjs'
import { analyse, summary, scoreboardNear, tally } from './ucl-lib.mjs'
const out = {}
const save = () => fs.writeFile(new URL('./ucl-followups.json', import.meta.url), JSON.stringify(out, null, 1))

// 1. pre-2001: team schedules for Real Madrid (86) and Man Utd (360), seasons 1999 and 2000.
out.pre2001 = []
for (const [t, y] of [[86, 1999], [360, 1999], [86, 2000], [86, 2001]]) {
  const s = await get(`uefa.champions/teams/${t}/schedule?season=${y}`)
  out.pre2001.push({ team: t, season: y, requested: s?.requestedSeason?.displayName, events: s?.events?.length ?? null, first: s?.events?.map((e) => e.date.slice(0, 10) + ' ' + e.name).slice(-2) })
  console.log('pre2001', t, y, s?.requestedSeason?.displayName, s?.events?.length)
}
// 2. qualifying rounds not yet sampled: playoff rounds 2009-11; Q1/Q2 in 2005, 2008, 2013.
out.qualRounds = []
for (const [slug, d] of [['uefa.champions', '20090818'], ['uefa.champions', '20100817'], ['uefa.champions', '20110816'], ['uefa.champions', '20050712'], ['uefa.champions', '20080729'], ['uefa.champions', '20130716'], ['uefa.champions', '20200818'], ['uefa.champions_qual', '20200818'], ['uefa.champions', '20230822'], ['uefa.champions_qual', '20230822']]) {
  const { date, sb } = await scoreboardNear(slug, d, [0, 1])
  const ms = []
  for (const e of (sb?.events ?? []).slice(0, 2)) ms.push(analyse(await summary(slug, e.id), e))
  out.qualRounds.push({ slug, date, season: sb?.leagues?.[0]?.season?.displayName, events: sb?.events?.length ?? 0, matches: ms })
  console.log('qual', slug, date, sb?.events?.length ?? 0, ms.map((m) => `${m.stageSlug} r${m.rosterN} st${m.withStats} g${m.goalKE}/${m.scoreSum}`).join(' | '), JSON.stringify(stats))
  await save()
}
// 3. Portugal (482): WC 2010 qualifying campaign (10 matches, 2008-09) and friendlies in 2014 and 2008.
out.portugal = []
for (const [slug, y] of [['fifa.worldq.uefa', 2009], ['fifa.worldq.uefa', 2008], ['fifa.friendly', 2014], ['fifa.friendly', 2008]]) {
  const s = await get(`${slug}/teams/482/schedule?season=${y}`)
  const evs = (s?.events ?? []).filter((e) => !e.league?.slug || e.league.slug === slug)
  const ms = []
  for (const e of evs) {
    const sum = await summary(slug, e.id)
    const a = analyse(sum, null)
    const p = tally([sum], 482).find((x) => /Cristiano/.test(x.name))
    ms.push({ date: e.date.slice(0, 10), name: e.name, score: a.score, rosterN: a.rosterN, withStats: a.withStats, goalKE: a.goalKE, scoreSum: a.scoreSum, ronaldo: p ? { app: p.apps, keG: p.keGoals, statG: p.statG } : null })
  }
  out.portugal.push({ slug, season: y, requested: s?.requestedSeason?.displayName, events: s?.events?.length ?? null, matches: ms })
  console.log('por', slug, y, s?.requestedSeason?.displayName, `events=${evs.length}`, ms.map((m) => `${m.date} r${m.rosterN} g${m.goalKE}/${m.scoreSum}${m.ronaldo ? ' CR' + m.ronaldo.keG : ''}`).join(' | '), JSON.stringify(stats))
  await save()
}
console.log('done', JSON.stringify(stats))
