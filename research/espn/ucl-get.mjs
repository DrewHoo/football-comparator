// Fetch arbitrary paths (relative to the soccer base; '../' allowed) through the helper and print
// either the full JSON (FULL=1) or a shallow shape.  node ucl-get.mjs <path> [<path>...]
import { get, stats } from './espn.mjs'
const shape = (v, d = 0) => {
  if (Array.isArray(v)) return v.length ? [`len ${v.length}`, d < 3 ? shape(v[0], d + 1) : '…'] : []
  if (v && typeof v === 'object') {
    if (d >= 3) return Object.keys(v).join(',')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x, d + 1)]))
  }
  return typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : v
}
for (const p of process.argv.slice(2)) {
  const j = await get(p)
  console.log('### ' + p)
  console.log(JSON.stringify(process.env.FULL ? j : shape(j), null, 1).slice(0, Number(process.env.MAX ?? 6000)))
}
console.error(JSON.stringify(stats))
