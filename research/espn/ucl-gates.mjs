// Part 2: UCL known-answer gates. For each team-season, pull every uefa.champions event on the team's
// schedule, tally the named player, split UCL proper vs qualifying by the event's season type/slug.
import fs from 'node:fs/promises'
import { get } from './espn.mjs'
import { summary, tally, analyse } from './ucl-lib.mjs'
import { stats } from './espn.mjs'

const GATES = [
  { team: 360, season: 2002, player: /Nistelrooy/, label: 'Man Utd 2002-03 / Van Nistelrooy' },
  { team: 83, season: 2005, player: /Messi/, label: 'Barcelona 2005-06 / Messi' },
  { team: 360, season: 2007, player: /Ronaldo/, label: 'Man Utd 2007-08 / Cristiano Ronaldo' },
  { team: 83, season: 2008, player: /Messi/, label: 'Barcelona 2008-09 / Messi' },
  { team: 86, season: 2013, player: /Ronaldo/, label: 'Real Madrid 2013-14 / Cristiano Ronaldo' },
]
const res = []
for (const g of GATES) {
  const sch = await get(`uefa.champions/teams/${g.team}/schedule?season=${g.season}`)
  const evs = (sch?.events ?? []).filter((e) => !e.league?.slug || e.league.slug === 'uefa.champions')
  const matches = []
  for (const e of evs) {
    const s = await summary('uefa.champions', e.id)
    const a = analyse(s, null)
    const qual = /qualif|playoff/i.test(`${e.seasonType?.name} ${s?.header?.season?.name}`)
    const mine = tally([s], g.team).filter((p) => g.player.test(p.name))
    const m = mine[0] ?? {}
    matches.push({ id: e.id, date: e.date.slice(0, 10), name: e.name, stage: e.seasonType?.name, headerSeason: s?.header?.season?.name, qual, score: a.score, rosterN: a.rosterN, goalKE: a.goalKE, scoreSum: a.scoreSum, player: m.name ? { inRoster: true, app: m.apps, start: m.starts, keG: m.keGoals, keA: m.keAssists, statG: m.statG, statA: m.statA, statAPP: m.statAPP, hasStats: m.hasStats } : { inRoster: false } })
  }
  const sum = (arr, f) => arr.reduce((t, m) => t + (m.player[f] ?? 0), 0)
  const proper = matches.filter((m) => !m.qual), qual = matches.filter((m) => m.qual)
  const tot = (arr) => ({ matches: arr.length, apps: sum(arr, 'app'), starts: sum(arr, 'start'), keGoals: sum(arr, 'keG'), keAssists: sum(arr, 'keA'), statG: sum(arr, 'statG'), statA: sum(arr, 'statA'), teamGoalsReconcile: arr.filter((m) => m.goalKE === m.scoreSum).length })
  res.push({ ...g, player: String(g.player), scheduleEvents: sch?.events?.length, proper: tot(proper), qualifying: tot(qual), matches })
  console.log(g.label, JSON.stringify(tot(proper)), 'qual', JSON.stringify(tot(qual)), JSON.stringify(stats))
  await fs.writeFile(new URL('./ucl-gates.json', import.meta.url), JSON.stringify(res, null, 1))
}
