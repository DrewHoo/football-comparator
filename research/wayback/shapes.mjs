// URL-shape histogram for a CDX prefix: node shapes.mjs <prefix> [limit] [from] [to] [regexFilterOnOriginal]
import { cdx, stats } from './wb.mjs'
const [pat, limit = 3000, from = '2000', to = '2016', re] = process.argv.slice(2)
const opts = { from, to, limit, fl: 'original,timestamp' }
if (re) opts.filter = ['statuscode:200', 'original:' + re]
const rows = await cdx(pat, opts)
const shapes = {}
for (const x of rows) {
  const k = x.original.replace(/^https?:\/\/[^/]+/, '').replace(/\d+/g, 'N').slice(0, 90)
  ;(shapes[k] ??= []).push(x)
}
console.log(`${pat}: ${rows.length} urls${rows.length >= limit ? ' (capped)' : ''}`)
for (const [k, v] of Object.entries(shapes).sort((a, b) => b[1].length - a[1].length).slice(0, 15))
  console.log(String(v.length).padStart(6), k, '|', v[0].timestamp, v[0].original.slice(0, 140))
console.error(JSON.stringify(stats))
