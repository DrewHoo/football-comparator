// Enumerate every event for a league by calendar year (dates=YYYY&limit=1000 = one request per year),
// then group by season slug. Writes out/index.json: { slug: { seasonSlug: [event rows] } }.
//   ESPN_GAP_MS=1500 node enumerate.mjs [fromYear] [toYear]
import fs from 'node:fs'
import { get } from './espn.mjs'
import { logRun } from './ledger.mjs'

export const SLUGS = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1']
const [from = 2000, to = 2014] = process.argv.slice(2).map(Number)
fs.mkdirSync('out', { recursive: true })
const index = {}
const yearCounts = {}
for (const slug of SLUGS) {
  index[slug] = {}
  for (let y = from; y <= to; y++) {
    const r = await get(`${slug}/scoreboard?dates=${y}&limit=1000`)
    const ev = r?.events || []
    yearCounts[`${slug} ${y}`] = ev.length
    if (ev.length >= 1000) console.error('WARNING truncated', slug, y)
    for (const e of ev) {
      const c = e.competitions?.[0] || {}
      const home = c.competitors?.find((x) => x.homeAway === 'home')
      const away = c.competitors?.find((x) => x.homeAway === 'away')
      const s = e.season?.slug || 'none'
      ;(index[slug][s] ||= []).push({
        id: e.id, date: e.date, name: e.name, seasonYear: e.season?.year, seasonType: e.season?.type,
        status: e.status?.type?.name, completed: e.status?.type?.completed,
        home: home?.team?.id, homeName: home?.team?.displayName, away: away?.team?.id, awayName: away?.team?.displayName,
        hs: home?.score, as: away?.score, venue: c.venue?.fullName ?? e.venue?.displayName ?? null,
        attendance: c.attendance ?? null, wasSuspended: c.wasSuspended ?? null,
        notes: (c.notes || []).map((n) => n.headline).filter(Boolean),
      })
    }
  }
}
for (const slug of SLUGS) for (const s in index[slug]) {
  const seen = new Map()
  index[slug][s] = index[slug][s].filter((e) => (seen.has(e.id) ? false : seen.set(e.id, 1)))
  index[slug][s].sort((a, b) => a.date.localeCompare(b.date))
}
fs.writeFileSync('out/index.json', JSON.stringify(index))
for (const slug of SLUGS) for (const s of Object.keys(index[slug]).sort()) {
  const ev = index[slug][s]
  const st = {}
  for (const e of ev) st[e.status] = (st[e.status] || 0) + 1
  const teams = new Set(ev.flatMap((e) => [e.home, e.away]))
  const pairs = {}
  for (const e of ev) { const k = e.home + '-' + e.away; pairs[k] = (pairs[k] || 0) + 1 }
  const dupPairs = Object.values(pairs).filter((n) => n > 1).length
  console.log(slug, s, 'events', ev.length, 'teams', teams.size, 'dupPairs', dupPairs, JSON.stringify(st))
}
logRun('enumerate')
