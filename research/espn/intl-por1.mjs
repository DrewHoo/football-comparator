// por.1 floor: Sporting CP schedule by season, plus scoreboards on a few dates.
import { get, stats } from './espn.mjs'
import { analyse, summary, scoreboardNear } from './ucl-lib.mjs'
for (const d of ['20101003', '20151004', '20190929']) {
  const { date, sb } = await scoreboardNear('por.1', d, [0, 1, -1])
  const e = sb?.events?.[0]
  const a = e ? analyse(await summary('por.1', e.id), e) : null
  console.log('sb', date, sb?.leagues?.[0]?.season?.displayName, sb?.events?.length ?? 0, a ? `${a.name} r${a.rosterN} s${a.starters} st${a.withStats} g${a.goalKE}/${a.scoreSum}` : '')
  if (e && !globalThis.sp) for (const ev of sb.events) for (const c of ev.competitions[0].competitors) if (/Sporting/.test(c.team.displayName)) globalThis.sp = c.team.id
}
console.log('sporting id', globalThis.sp)
for (const y of [2002, 2003, 2005, 2006, 2008]) {
  const s = await get(`por.1/teams/${globalThis.sp ?? 2250}/schedule?season=${y}`)
  const ev = s?.events ?? []
  console.log('sched', y, s?.requestedSeason?.displayName, ev.length, ev.slice(-1).map((e) => e.date.slice(0, 10) + ' ' + e.name).join())
}
console.error(JSON.stringify(stats))
