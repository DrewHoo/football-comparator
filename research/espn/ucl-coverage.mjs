// Part 1: UCL 1999-2000 .. 2013-14 coverage by stage. Writes ucl-coverage.json.
import fs from 'node:fs/promises'
import { analyse, scoreboardNear, summary } from './ucl-lib.mjs'
import { stats } from './espn.mjs'

// [season start year, qualifying (Q3 1st leg), group MD1, group-2 MD1 (pre-2003-04 only), QF 1st leg, final]
const SEASONS = [
  [1999, '19990811', '19990914', '19991123', '20000404', '20000524'],
  [2000, '20000809', '20000912', '20001121', '20010403', '20010523'],
  [2001, '20010808', '20010918', '20011120', '20020402', '20020515'],
  [2002, '20020814', '20020917', '20021126', '20030408', '20030528'],
  [2003, '20030813', '20030916', null, '20040323', '20040526'],
  [2004, '20040811', '20040914', null, '20050405', '20050525'],
  [2005, '20050810', '20050913', null, '20060328', '20060517'],
  [2006, '20060809', '20060912', null, '20070403', '20070523'],
  [2007, '20070815', '20070918', null, '20080401', '20080521'],
  [2008, '20080813', '20080916', null, '20090407', '20090527'],
  [2009, '20090729', '20090915', null, '20100330', '20100522'],
  [2010, '20100728', '20100914', null, '20110405', '20110528'],
  [2011, '20110727', '20110913', null, '20120327', '20120519'],
  [2012, '20120801', '20120918', null, '20130402', '20130525'],
  [2013, '20130730', '20130917', null, '20140401', '20140524'],
]
const QCAP = 8
const out = []
for (const [yr, ...dates] of SEASONS) {
  const labels = ['qualifying', 'group', 'group2', 'knockout', 'final']
  const season = { season: `${yr}-${String(yr + 1).slice(2)}`, calendar: null, dates: {} }
  for (let i = 0; i < dates.length; i++) {
    if (!dates[i]) continue
    const offs = labels[i] === 'final' ? [0] : [0, 1, -1]
    const { date, sb } = await scoreboardNear('uefa.champions', dates[i], offs)
    if (!season.calendar && sb) {
      const L = sb.leagues?.[0]
      season.calendar = { type: L?.calendarType, rounds: (L?.calendar?.[0]?.entries ?? []).map((e) => `${e.label} (${e.detail})`) }
    }
    let evs = sb?.events ?? []
    if (labels[i] === 'qualifying') evs = evs.slice(0, QCAP)
    const matches = []
    for (const e of evs) matches.push(analyse(await summary('uefa.champions', e.id), e))
    season.dates[labels[i]] = { date, eventsOnDate: sb?.events?.length ?? 0, matches }
    console.log(season.season, labels[i], date, `events=${sb?.events?.length ?? 0}`, JSON.stringify(stats))
  }
  out.push(season)
  await fs.writeFile(new URL('./ucl-coverage.json', import.meta.url), JSON.stringify(out, null, 1))
}
console.log('done', JSON.stringify(stats))
