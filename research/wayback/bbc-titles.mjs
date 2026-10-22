// Print <title>/headline of BBC article snapshots for a CDX prefix within an id range; stop at first title match.
// node bbc-titles.mjs <prefix> <minId> <maxId> <stopRegex>
import { cdx, raw } from './wb.mjs'
const [pre, lo, hi, stop] = process.argv.slice(2)
const rows = await cdx(pre, { from: '2000', to: '2014', limit: 3000, fl: 'original,timestamp' })
const cand = rows.map((r) => ({ ...r, id: Number(r.original.match(/(\d+)\.stm/)?.[1]) })).filter((r) => r.id >= +lo && r.id <= +hi).sort((a, b) => a.id - b.id)
console.error(cand.length, 'candidates')
for (const c of cand) {
  const p = await raw(c.timestamp, c.original)
  const t = (p.text ?? '').match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim()
  const h = (p.text ?? '').match(/<meta name="Headline" content="([^"]*)"/i)?.[1]
  console.log(c.id, c.timestamp, '|', h ?? t)
  if (stop && new RegExp(stop, 'i').test((h ?? '') + ' ' + (t ?? ''))) break
}
