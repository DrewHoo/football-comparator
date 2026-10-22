// Q2b: web gamelog (one call per season x team x league) totals vs Wikipedia, and intl caps by calendar year.
import fs from 'node:fs'
import { getUrl, safe, WEB, CORE } from './core-lib.mjs'
import { stats } from './espn.mjs'
import { logRun } from './ledger.mjs'
const q2 = JSON.parse(fs.readFileSync('core-q2.json', 'utf8'))
async function gamelog(id, season, team, league) {
  const j = await safe(getUrl(`${WEB}athletes/${id}/gamelog?season=${season}&team=${team}&league=${league}`))
  const gi = (j?.names ?? []).indexOf('totalGoals'), ai = (j?.names ?? []).indexOf('goalAssists')
  const rows = []
  for (const st of j?.seasonTypes ?? []) for (const c of st.categories ?? []) for (const e of c.events ?? []) {
    const ev = j.events?.[e.eventId]; rows.push({ id: e.eventId, date: ev?.gameDate?.slice(0, 10), opp: ev?.opponent?.displayName, league: ev?.leagueName, g: +e.stats[gi] || 0, a: +e.stats[ai] || 0 })
  }
  const okFilter = j?.filters?.find((f) => f.name === 'league')?.value === league && String(j?.filters?.find((f) => f.name === 'season')?.value) === String(season)
  return { apps: rows.length, g: rows.reduce((s, r) => s + r.g, 0), a: rows.reduce((s, r) => s + r.a, 0), rows, okFilter, seasonOpts: j?.filters?.find((f) => f.name === 'season')?.options?.map((o) => o.value) }
}
const out = { club: [], intl: [] }
// Club gates: every (league|team) the eventlog lists for that season, except club friendlies
const gates = { ronaldo: [2003, 2007, 2011], messi: [2005, 2008, 2011], henry: [2002, 2003, 2008], totti: [2003, 2006, 2010], haaland: [2019, 2022, 2024] }
for (const [p, ys] of Object.entries(gates)) {
  const P = q2.players[p]
  for (const y of ys) for (const [k, v] of Object.entries(P.seasons[y]?.by ?? {})) {
    const [league, team] = k.split('|')
    if (/friendly|gamper|champs_cup|world_football|world_challenge/.test(league)) continue
    if (/fifa|uefa\.euro|uefa\.nations|conmebol\.america/.test(league) && !/uefa\.champions|uefa\.uefa|uefa\.europa|uefa\.super|fifa\.cwc/.test(league)) continue // internationals handled below
    const r = await gamelog(P.id, y, team, league)
    out.club.push({ p, y, league, team, eventlogPlayed: v.played, eventlogAll: v.played + v.not, ...r, rows: undefined })
    console.log('club', p, y, league, team, 'eventlog', v.played + '/' + (v.played + v.not), 'gamelog apps', r.apps, 'G', r.g, 'A', r.a, r.okFilter ? '' : 'FILTER-MISMATCH')
  }
}
// Intl caps by year: every national-team (league|team) in eventlog seasons Y-1..Y+2, gamelog, then bucket by date
const nat = { ronaldo: ['482', 2003, 2012], messi: ['202', 2005, 2012], henry: ['478', 1997, 2010], totti: ['162', 1998, 2006], haaland: ['464', 2019, 2025] }
for (const [p, [team, a, b]] of Object.entries(nat)) {
  const P = q2.players[p]; const seen = new Set(); const byYear = {}
  for (let y = a - 1; y <= b + 2; y++) for (const [k] of Object.entries(P.seasons[y]?.by ?? {})) {
    const [league, t] = k.split('|'); if (t !== team || seen.has(k + y)) continue; seen.add(k + y)
    const r = await gamelog(P.id, y, team, league)
    for (const row of r.rows) { const Y = row.date?.slice(0, 4); const cat = /friendly/.test(league) ? 'friendly' : /q\b|q\.|euroq|worldq/.test(league) ? 'qualifier' : 'tournament'; (byYear[Y] ||= { apps: 0, g: 0, friendly: 0, qualifier: 0, tournament: 0, ids: [] }); if (byYear[Y].ids.includes(row.id)) continue; byYear[Y].ids.push(row.id); byYear[Y].apps++; byYear[Y].g += row.g; byYear[Y][cat]++ }
    out.intl.push({ p, y, league, apps: r.apps, g: r.g, okFilter: r.okFilter })
  }
  // youth teams seen in eventlog (other team ids that are not the club or senior nat team)
  out[`caps_${p}`] = Object.fromEntries(Object.entries(byYear).sort().map(([Y, v]) => [Y, { ...v, ids: undefined }]))
  console.log('caps', p, JSON.stringify(out[`caps_${p}`]))
}
// What does a per-event statistics ref hold (minutes?)
const st = await safe(getUrl(`${CORE}leagues/eng.1/events/221290/competitions/221290/competitors/360/roster/22774/statistics/0`))
out.statSample = st?.splits?.categories?.map((c) => [c.name, (c.stats ?? []).map((s) => s.name + '=' + s.value).join(',')])
console.log('statSample', JSON.stringify(out.statSample))
fs.writeFileSync('core-q2b.json', JSON.stringify(out, null, 1))
logRun('core-q2b'); console.error(JSON.stringify(stats))
