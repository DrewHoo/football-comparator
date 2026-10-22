// Fetch per-event athlete statistics refs (one per line in a file) and print appearances/starts/minutes/goals.
import fs from 'node:fs'
import { getUrl, safe } from './core-lib.mjs'
import { stats } from './espn.mjs'
import { logRun } from './ledger.mjs'
for (const u of fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean)) {
  const j = await safe(getUrl(u)); const f = {}
  for (const c of j?.splits?.categories ?? []) for (const s of c.stats ?? []) f[s.name] = s.value
  console.log(u.replace(/.*events\//, ''), j === null ? '404' : JSON.stringify({ app: f.appearances, st: f.starts, in: f.subIns, min: f.minutes, g: f.totalGoals, a: f.goalAssists, dnp: f.dnp }))
}
logRun('core-evstat'); console.error(JSON.stringify(stats))
