// Normalizes out/index.json (from enumerate.mjs) into league-seasons keyed by match date (Jul-Jun),
// merging every season slug ESPN filed a league's matches under, and keeping only played matches.
// Why by date: ESPN files EPL 2009-10 twice (legacy ids ~270k under the right slug, a complete
// re-ingest ids ~678k under the 2013-14 slug), Bundesliga 2010-11 under "group-stage",
// three La Liga 2010-11 matches under "group-stage", and Ligue 1 2002-03 as "20032003".
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const SLUGS = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1']
export const PLAYED = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL_AET', 'STATUS_FINAL_ABANDONED'])
export const seasonOf = (iso) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 7 ? y : y - 1 }
export const label = (y) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`

export function loadIndex() {
  const ix = JSON.parse(fs.readFileSync(path.join(HERE, 'out/index.json'), 'utf8'))
  const out = {} // out[slug][startYear] = { played: [], other: [], legacy: [] }
  for (const slug of SLUGS) {
    out[slug] = {}
    for (const [sslug, evs] of Object.entries(ix[slug])) {
      for (const e of evs) {
        if (/playoff/.test(sslug)) continue // Bundesliga relegation playoffs: not league matches
        const y = seasonOf(e.date)
        const b = (out[slug][y] ||= { played: [], other: [], legacy: [] })
        const rec = { ...e, slug, sslug, season: y }
        // EPL 2009-10 legacy copy (filed under the right slug but incomplete and duplicated by the re-ingest)
        if (slug === 'eng.1' && y === 2009 && sslug.startsWith('2009-2010')) { b.legacy.push(rec); continue }
        ;(PLAYED.has(e.status) ? b.played : b.other).push(rec)
      }
    }
    for (const y in out[slug]) for (const k of ['played', 'other', 'legacy']) out[slug][y][k].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  }
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ix = loadIndex()
  for (const slug of SLUGS) for (const y of Object.keys(ix[slug]).sort()) {
    const b = ix[slug][y]
    const teams = new Set(b.played.flatMap((e) => [e.home, e.away]))
    const pairs = {}
    for (const e of b.played) pairs[e.home + '-' + e.away] = (pairs[e.home + '-' + e.away] || 0) + 1
    const dup = Object.entries(pairs).filter(([, n]) => n > 1)
    const days = new Set(b.played.map((e) => e.date.slice(0, 10))).size
    console.log(slug, label(+y), 'played', b.played.length, 'teams', teams.size, 'days', days, 'repeatPairs', dup.length,
      'notPlayed', b.other.length, b.legacy.length ? 'legacy ' + b.legacy.length : '', [...new Set(b.played.map((e) => e.sslug))].join(','))
  }
}
