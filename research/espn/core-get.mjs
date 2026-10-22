// Fetch one or more absolute ESPN URLs through espn.mjs (throttled, cached) and print a compact shape.
//   ESPN_GAP_MS=1500 node core-get.mjs <url> [url...]
import { getUrl, stats } from './espn.mjs'
import { logRun } from './ledger.mjs'
const shape = (v, d = 0) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)?.slice(0, 80)
  if (Array.isArray(v)) return `[${v.length}] ` + (v.length && d < 2 ? shape(v[0], d + 1) : '')
  if (d >= 2) return '{' + Object.keys(v).slice(0, 12).join(',') + '}'
  return '{ ' + Object.entries(v).slice(0, 25).map(([k, x]) => `${k}: ${shape(x, d + 1)}`).join(' | ') + ' }'
}
for (const u of process.argv.slice(2)) {
  try { const j = await getUrl(u); console.log('\n##', u, '\n', j === null ? 'NULL (404)' : shape(j)) }
  catch (e) { console.log('\n##', u, '\n ERROR', e.message.slice(0, 200)) }
}
logRun('core-get ' + process.argv.length)
console.error(JSON.stringify(stats))
