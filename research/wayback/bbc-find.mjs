// Find BBC Sport match-report URLs via archived index pages captured just after a match.
// node bbc-find.mjs <YYYYMMDD> <regex for anchor text> [index urls...]
import { cdx, raw } from './wb.mjs'
const [day, reText, ...idx] = process.argv.slice(2)
const re = new RegExp(reText, 'i')
const d = new Date(day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6) + 'T00:00:00Z')
const plus = (n) => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10).replaceAll('-', '')
const indexes = idx.length ? idx : [
  'news.bbc.co.uk/sport1/hi/football/internationals/default.stm',
  'news.bbc.co.uk/sport1/hi/football/default.stm',
  'news.bbc.co.uk/sport/hi/english/football/internationals/default.stm',
  'news.bbc.co.uk/sport/hi/english/football/default.stm',
  'news.bbc.co.uk/sport2/hi/football/internationals/default.stm',
]
const found = new Map()
for (const u of indexes) {
  const snaps = await cdx(u, { matchType: 'exact', collapse: null, from: plus(0), to: plus(3), limit: 4, fl: 'original,timestamp' })
  console.error(u, snaps.length, 'snaps', snaps.map((s) => s.timestamp).join(','))
  for (const s of snaps.slice(0, 2)) {
    const p = await raw(s.timestamp, s.original)
    if (!p.text) continue
    for (const a of p.text.matchAll(/<a[^>]+href="([^"]+\.stm)"[^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
      const t = a[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (re.test(t) || re.test(a[1])) found.set(a[1], { text: t, via: s.timestamp + ' ' + s.original })
    }
  }
  if (found.size) break
}
for (const [h, v] of found) console.log(h, '|', v.text, '|', v.via)
