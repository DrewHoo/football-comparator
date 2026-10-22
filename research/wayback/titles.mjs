// Print title + first matching snippet for each CDX hit under a prefix. node titles.mjs <prefix> <snippetRegex> [limit]
import { cdx, raw, text } from './wb.mjs'
const [pre, re, limit = 40] = process.argv.slice(2)
const rows = (await cdx(pre, { limit: 300, fl: 'original,timestamp' })).filter((r) => /\.(s?html?|stm|asp)/.test(r.original) && !/index\.html$/.test(r.original)).slice(0, +limit)
for (const r of rows) {
  const p = await raw(r.timestamp, r.original)
  const h = p.text ?? ''
  const t = (h.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()
  const tx = text(h)
  const i = tx.search(new RegExp(re, 'i'))
  console.log(r.timestamp, r.original.replace(/.*\//, ''), '|', t.slice(0, 80), '|', i >= 0 ? tx.slice(i, i + 160).replace(/\s+/g, ' ') : '-')
}
