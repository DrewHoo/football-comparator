// Q2: per-athlete logs. statisticslog (all leagues) + eventlog per season (leagues/all) for 5 players,
// plus plays for the corrupt/empty matches (do plays carry athlete participants?).
import fs from 'node:fs'
import { getUrl, get, safe, CORE, refPath } from './core-lib.mjs'
import { stats } from './espn.mjs'
import { logRun } from './ledger.mjs'
const out = { plays: {}, players: {} }
for (const [slug, id] of [['ita.1', '131335'], ['uefa.champions', '188764'], ['fifa.world', '264119'], ['fifa.world', '383241']]) {
  const p = await safe(getUrl(`${CORE}leagues/${slug}/events/${id}/competitions/${id}/plays?limit=400`))
  const items = p?.items ?? []
  out.plays[id] = { n: items.length, withParticipants: items.filter((i) => i.participants?.length).length,
    subs: items.filter((i) => /substitution/i.test(i.type?.text ?? '')).length, goals: items.filter((i) => i.scoringPlay).length,
    sample: items.filter((i) => i.participants?.length).slice(0, 3).map((i) => ({ t: i.type?.text, clock: i.clock?.displayValue, parts: i.participants.map((x) => refPath(x.athlete)) })) }
  console.log('plays', id, JSON.stringify(out.plays[id]))
}
const ros = await safe(get('eng.1/teams/382/roster'))
const haal = (ros?.athletes ?? []).find((a) => /Haaland/.test(a.displayName))
console.log('haaland', haal?.id, haal?.displayName)
const P = { ronaldo: ['22774', 2002, 2026], messi: ['45843', 2003, 2026], henry: ['8039', 1994, 2014], totti: ['10293', 1992, 2016], haaland: [haal?.id ?? '253989', 2015, 2026] }
for (const [name, [id, a, b]] of Object.entries(P)) {
  const sl = await safe(getUrl(`${CORE}athletes/${id}/statisticslog`))
  const entries = (sl?.entries ?? []).map((e) => ({ ls: refPath(e.season).replace(/^leagues\//, ''), stat: refPath(e.statistics?.find((s) => s.type === 'total')?.statistics) }))
  const seasons = {}
  for (let y = a; y <= b; y++) {
    const j = await safe(getUrl(`${CORE}leagues/all/seasons/${y}/athletes/${id}/eventlog?limit=300`))
    const items = j?.events?.items ?? []
    const by = {}
    for (const i of items) { const L = /leagues\/([^/]+)/.exec(i.event?.$ref ?? '')?.[1]; const k = `${L}|${i.teamId}`; (by[k] ||= { played: 0, not: 0, events: [] }); i.played ? by[k].played++ : by[k].not++; by[k].events.push([/events\/(\d+)/.exec(i.event.$ref)[1], i.played ? 1 : 0, refPath(i.statistics)]) }
    seasons[y] = { count: j?.events?.count ?? null, pages: j?.events?.pageCount ?? null, teams: Object.keys(j?.teams ?? {}), by }
    console.log(name, y, 'count', seasons[y].count, Object.entries(by).map(([k, v]) => `${k}:${v.played}/${v.played + v.not}`).join(' '))
  }
  out.players[name] = { id, statlog: entries, seasons }
}
fs.writeFileSync('core-q2.json', JSON.stringify(out))
logRun('core-q2'); console.error(JSON.stringify(stats))
