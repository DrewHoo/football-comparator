// Coverage sweep: fetch summaries for matches spread evenly across each league-season
// (first and last match always included). Writes out/sweep-sample.json; analyze.mjs reads the cache.
//   ESPN_GAP_MS=1500 node sweep.mjs [--dry]
import fs from 'node:fs'
import { summary } from './espn.mjs'
import { logRun, totalMisses } from './ledger.mjs'
import { loadIndex, SLUGS, label } from './season-index.mjs'

const BUDGET = 1500
const perSeason = (y) => (y === 2000 ? 4 : y <= 2008 ? 14 : 8)
const spread = (arr, k) => {
  if (arr.length <= k) return arr.slice()
  const out = []
  for (let i = 0; i < k; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (k - 1))])
  return [...new Map(out.map((e) => [e.id, e])).values()]
}
const ix = loadIndex()
const sample = []
for (const slug of SLUGS) for (let y = 2000; y <= 2013; y++) {
  const b = ix[slug][y]
  if (!b) continue
  for (const e of spread(b.played, perSeason(y))) sample.push({ ...e, kind: 'sweep' })
  for (const e of spread(b.legacy, 8)) sample.push({ ...e, kind: 'legacy' })
  // matches stuck at a not-played status although their date has passed
  for (const e of b.other.filter((e) => /SCHEDULED|TBD|ABANDONED/.test(e.status))) sample.push({ ...e, kind: 'stuck' })
}
fs.writeFileSync('out/sweep-sample.json', JSON.stringify(sample))
console.log('sample', sample.length, 'already used', totalMisses())
if (process.argv.includes('--dry')) process.exit(0)
let n = 0
for (const e of sample) {
  if (totalMisses() + (await import('./espn.mjs')).stats.misses >= BUDGET - 520) { console.error('budget stop'); break }
  try { await summary(e.slug, e.id) } catch (err) { console.error('ERR', e.slug, e.id, err.message) }
  if (++n % 50 === 0) console.log(new Date().toISOString(), n, '/', sample.length, 'misses', (await import('./espn.mjs')).stats.misses)
}
logRun('sweep')
console.log('done', n)
