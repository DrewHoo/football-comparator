// Measure Wayback hit rate for 11v11 match pages of 2000-2012 friendlies, enumerated from martj42 results.csv.
// node friendly-hitrate.mjs [n=40]
import { get, cdx, stats } from './wb.mjs'
import fs from 'node:fs/promises'
const N = Number(process.argv[2] ?? 40)
const csv = (await get('https://raw.githubusercontent.com/martj42/international_results/master/results.csv')).text
const rows = csv.trim().split('\n').slice(1).map((l) => l.split(',')).map(([date, home, away, hs, as, tournament]) => ({ date, home, away, hs, as, tournament }))
const fr = rows.filter((r) => r.tournament === 'Friendly' && r.date >= '2000-01-01' && r.date <= '2012-12-31')
const MAJOR = new Set(['Argentina', 'Brazil', 'England', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Uruguay', 'Mexico', 'United States', 'Belgium', 'Croatia', 'Colombia', 'Chile', 'Sweden', 'Denmark', 'Switzerland', 'Japan', 'South Korea', 'Nigeria', 'Cameroon', 'Ghana', 'Ivory Coast', 'Russia', 'Czech Republic', 'Poland', 'Turkey', 'Greece', 'Scotland', 'Republic of Ireland', 'Wales', 'Northern Ireland', 'Australia'])
const major = fr.filter((r) => MAJOR.has(r.home) || MAJOR.has(r.away))
const pickEvery = (arr, n) => arr.filter((_, i) => i % Math.floor(arr.length / n) === 0).slice(0, n)
// 11v11 naming differs from martj42 for some teams [R]; map the common ones
const NAME = { 'South Korea': 'korea-republic', 'North Korea': 'korea-dpr', 'United States': 'usa', 'Ivory Coast': 'ivory-coast', 'Republic of Ireland': 'republic-of-ireland', 'China PR': 'china', 'DR Congo': 'congo-dr', 'Czech Republic': 'czech-republic', 'North Macedonia': 'macedonia', 'Bosnia and Herzegovina': 'bosnia-herzegovina' }
const MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const slug = (t) => NAME[t] ?? t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sample = [...pickEvery(major, N / 2), ...pickEvery(fr.filter((r) => !major.includes(r)), N / 2)]
const out = []
for (const r of sample) {
  const [y, m, d] = r.date.split('-')
  const s = `www.11v11.com/matches/${slug(r.home)}-v-${slug(r.away)}-${d}-${MON[+m - 1]}-${y}`
  let hits = []
  try { hits = await cdx(s, { limit: 5, fl: 'original,timestamp' }) } catch (e) { hits = null }
  const rec = { ...r, major: major.includes(r), slug: s, hit: hits === null ? 'error' : hits.length > 0, first: hits?.[0]?.timestamp }
  out.push(rec)
  console.log(rec.hit ? 'HIT ' : 'miss', rec.major ? 'M' : '-', r.date, r.home, 'v', r.away, rec.first ?? '')
}
const sum = (f) => out.filter(f).length
console.log(`major: ${sum((r) => r.major && r.hit === true)}/${sum((r) => r.major)}  other: ${sum((r) => !r.major && r.hit === true)}/${sum((r) => !r.major)}  errors: ${sum((r) => r.hit === 'error')}  friendlies 2000-2012 in martj42: ${fr.length} (major-team: ${major.length})`)
await fs.writeFile(new URL('./out/friendly-hitrate.json', import.meta.url), JSON.stringify(out, null, 1))
console.error(JSON.stringify(stats))
