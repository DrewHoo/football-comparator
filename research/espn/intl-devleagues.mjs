// Part 4: outer-ring / development leagues. 3 dates per league at the relevant seasons, 2 summaries per date.
import fs from 'node:fs/promises'
import { stats } from './espn.mjs'
import { analyse, summary, scoreboardNear } from './ucl-lib.mjs'

const L = {
  'por.1': ['20021006', '20030209', '20050925', '20060205'], // Ronaldo's Sporting 2002-03, then the 2005-06 floor
  'ned.1': ['20020210', '20031019', '20100131'], // Zlatan Ajax 2001-02, 2003-04; Suarez 2009-10
  'aut.1': ['20190810', '20191006', '20191130'], // Haaland Salzburg 2019-20
  'nor.1': ['20170521', '20180812', '20190630'], // Haaland Molde
  'usa.1': ['20230826', '20240302', '20250412'], // Messi Inter Miami
  'ksa.1': ['20230825', '20240302', '20250404'], // Ronaldo Al-Nassr
  'tur.1': ['20051023', '20150412', '20231105'],
  'bra.1': ['20090802', '20110911', '20121014'], // Neymar Santos
  'arg.1': ['20051023', '20120916', '20230805'],
  'sco.1': ['20051022', '20120915', '20231028'],
}
const out = []
for (const [slug, dates] of Object.entries(L)) {
  for (const d of dates) {
    const { date, sb } = await scoreboardNear(slug, d, [0, 1, -1])
    const matches = []
    for (const e of (sb?.events ?? []).slice(0, 2)) matches.push(analyse(await summary(slug, e.id), e))
    out.push({ slug, date, season: sb?.leagues?.[0]?.season?.displayName ?? null, eventsOnDate: sb?.events?.length ?? 0, matches })
    console.log(slug, date, `events=${sb?.events?.length ?? 0}`, matches.map((m) => `${m.name}: r${m.rosterN} s${m.starters} st${m.withStats} ke${m.keyEvents} g${m.goalKE}=${m.scoreSum}`).join(' | '), JSON.stringify(stats))
    await fs.writeFile(new URL('./intl-devleagues.json', import.meta.url), JSON.stringify(out, null, 1))
  }
}
console.log('done', JSON.stringify(stats))
