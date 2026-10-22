// Part 3: national teams. Tournament coverage + Ronaldo/Messi gates via team schedules; sampled
// presence for qualifiers and friendlies. Writes intl-coverage.json.
import fs from 'node:fs/promises'
import { get, stats } from './espn.mjs'
import { analyse, summary, tally, scoreboardNear } from './ucl-lib.mjs'

const out = { teamIds: {}, tournaments: [], samples: [] }
const save = () => fs.writeFile(new URL('./intl-coverage.json', import.meta.url), JSON.stringify(out, null, 1))

// Find team ids from a known final.
async function teamId(slug, date, re) {
  const { sb } = await scoreboardNear(slug, date, [0])
  for (const e of sb?.events ?? []) for (const c of e.competitions[0].competitors) if (re.test(c.team.displayName)) return c.team.id
}
const POR = await teamId('uefa.euro', '20160710', /Portugal/)
const ARG = await teamId('fifa.world', '20221218', /Argentina/)
out.teamIds = { Portugal: POR, Argentina: ARG }
console.log('ids', out.teamIds)

const T = [
  ['fifa.world', [1998], [['Argentina', ARG, /Messi/, null]], '19980712'],
  ['fifa.world', [2002], [['Portugal', POR, /Cristiano/, null], ['Argentina', ARG, /Messi/, null]], '20020630'],
  ['fifa.world', [2006], [['Portugal', POR, /Cristiano/, 1], ['Argentina', ARG, /Messi/, 1]], '20060709'],
  ['fifa.world', [2010], [['Portugal', POR, /Cristiano/, 1], ['Argentina', ARG, /Messi/, 0]], '20100711'],
  ['fifa.world', [2014], [['Portugal', POR, /Cristiano/, 1], ['Argentina', ARG, /Messi/, 4]], '20140713'],
  ['fifa.world', [2018], [['Portugal', POR, /Cristiano/, 4], ['Argentina', ARG, /Messi/, 1]], '20180715'],
  ['fifa.world', [2022], [['Portugal', POR, /Cristiano/, 1], ['Argentina', ARG, /Messi/, 7]], '20221218'],
  ['uefa.euro', [2000], [['Portugal', POR, /Cristiano/, null]], '20000702'],
  ['uefa.euro', [2004], [['Portugal', POR, /Cristiano/, 2]], '20040704'],
  ['uefa.euro', [2008], [['Portugal', POR, /Cristiano/, 1]], '20080629'],
  ['uefa.euro', [2012], [['Portugal', POR, /Cristiano/, 3]], '20120701'],
  ['uefa.euro', [2016], [['Portugal', POR, /Cristiano/, 3]], '20160710'],
  ['uefa.euro', [2020, 2021], [['Portugal', POR, /Cristiano/, 5]], '20210711'],
  ['uefa.euro', [2024], [['Portugal', POR, /Cristiano/, 0]], '20240714'],
]
for (const [slug, years, teams, finalDate] of T) {
  const rec = { slug, year: years[0], final: null, teams: [] }
  const { sb } = await scoreboardNear(slug, finalDate, [0])
  const fe = sb?.events?.[0]
  if (fe) rec.final = analyse(await summary(slug, fe.id), fe)
  for (const [tname, tid, re, expect] of teams) {
    let sch = null, usedYear = null
    for (const y of years) {
      sch = await get(`${slug}/teams/${tid}/schedule?season=${y}`)
      if (sch?.events?.length) { usedYear = y; break }
    }
    const evs = (sch?.events ?? []).filter((e) => !e.league?.slug || e.league.slug === slug)
    const matches = []
    for (const e of evs) {
      const s = await summary(slug, e.id)
      const a = analyse(s, null)
      const p = tally([s], tid).find((x) => re.test(x.name))
      matches.push({ id: e.id, date: e.date.slice(0, 10), name: e.name, score: a.score, rosterN: a.rosterN, starters: a.starters, statKeys: a.statKeys, keyEvents: a.keyEvents, goalKE: a.goalKE, scoreSum: a.scoreSum, player: p ? { app: p.apps, start: p.starts, keG: p.keGoals, keA: p.keAssists, statG: p.statG, statA: p.statA, hasStats: p.hasStats } : null })
    }
    const s = (f) => matches.reduce((t, m) => t + (m.player?.[f] ?? 0), 0)
    rec.teams.push({ team: tname, usedYear, matches: matches.length, expectGoals: expect, apps: s('app'), keGoals: s('keG'), statG: s('statG'), keAssists: s('keA'), statA: s('statA'), withRoster: matches.filter((m) => m.rosterN).length, withStats: matches.filter((m) => m.statKeys).length, reconciled: matches.filter((m) => m.goalKE === m.scoreSum).length, detail: matches })
    console.log(slug, years[0], tname, `matches=${matches.length} apps=${s('app')} keG=${s('keG')} statG=${s('statG')} expect=${expect}`, JSON.stringify(stats))
  }
  out.tournaments.push(rec)
  await save()
}

const SAMPLES = {
  'fifa.worldq.uefa': ['20040908', '20041009', '20050326', '20050903', '20080906', '20081011', '20090401', '20091014'],
  'fifa.worldq.conmebol': ['20040905', '20050326', '20051012', '20080907', '20090328', '20091014'],
  'uefa.euroq': ['20070328', '20110325', '20150329', '20191015'],
  'fifa.friendly': ['20040818', '20080820', '20110209', '20140305', '20180323', '20240326'],
}
for (const [slug, dates] of Object.entries(SAMPLES)) {
  for (const d of dates) {
    const { date, sb } = await scoreboardNear(slug, d, [0, 1, -1])
    const evs = (sb?.events ?? []).slice(0, 3)
    const matches = []
    for (const e of evs) matches.push(analyse(await summary(slug, e.id), e))
    out.samples.push({ slug, date, eventsOnDate: sb?.events?.length ?? 0, matches })
    console.log(slug, date, `events=${sb?.events?.length ?? 0}`, matches.map((m) => `${m.rosterN}/${m.withStats}/${m.goalKE}=${m.scoreSum}`).join(' '), JSON.stringify(stats))
    await save()
  }
}
console.log('done', JSON.stringify(stats))
