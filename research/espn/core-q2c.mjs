// Q2c: league-season total statistics (statisticslog 'total' refs): do they give true appearances/starts/minutes/goals/assists?
import fs from 'node:fs'
import { getUrl, safe, CORE } from './core-lib.mjs'
import { stats } from './espn.mjs'
import { logRun } from './ledger.mjs'
const q2 = JSON.parse(fs.readFileSync('core-q2.json', 'utf8'))
const want = { ronaldo: ['eng.1/seasons/2003', 'eng.1/seasons/2007', 'uefa.champions/seasons/2007', 'esp.1/seasons/2011', 'uefa.euro/seasons/2004', 'fifa.friendly/seasons/2004'],
  messi: ['esp.1/seasons/2004', 'esp.1/seasons/2005', 'uefa.champions/seasons/2005', 'esp.1/seasons/2008', 'fifa.world/seasons/2010', 'fifa.world/seasons/2014'],
  henry: ['eng.1/seasons/2002', 'eng.1/seasons/2003', 'esp.1/seasons/2008', 'uefa.champions/seasons/2002'],
  totti: ['ita.1/seasons/2003', 'ita.1/seasons/2006', 'ita.1/seasons/2010'], haaland: ['eng.1/seasons/2022', 'uefa.champions/seasons/2022', 'eng.1/seasons/2024', 'aut.1/seasons/2019'] }
const out = []
for (const [p, ls] of Object.entries(want)) {
  const P = q2.players[p]
  for (const l of ls) {
    const e = P.statlog.find((x) => x.ls === l)
    if (!e) { out.push({ p, l, inStatlog: false }); console.log(p, l, 'NOT IN STATISTICSLOG'); continue }
    const j = await safe(getUrl(CORE + e.stat))
    const flat = {}; for (const c of j?.splits?.categories ?? []) for (const s of c.stats ?? []) flat[s.name] = s.value
    const r = { p, l, inStatlog: true, appearances: flat.appearances, starts: flat.starts, subIns: flat.subIns, minutes: flat.minutes, goals: flat.totalGoals, assists: flat.goalAssists }
    out.push(r); console.log(JSON.stringify(r))
  }
}
fs.writeFileSync('core-q2c.json', JSON.stringify(out, null, 1))
logRun('core-q2c'); console.error(JSON.stringify(stats))
