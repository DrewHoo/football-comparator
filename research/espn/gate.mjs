// Known-answer gates: every league match of a club-season, then a player's apps/starts/goals/assists/minutes.
//   ESPN_GAP_MS=1500 node gate.mjs fetch   (fetches the summaries, budget-guarded)
//   node gate.mjs report                    (cache-only; prints the gate table + per-match discrepancies)
import fs from 'node:fs'
import { summary, stats } from './espn.mjs'
import { cachedSummary } from './cache-read.mjs'
import { logRun, totalMisses } from './ledger.mjs'
import { loadIndex, label } from './season-index.mjs'
import { clockMin } from './inspect.mjs'

// Wikipedia/secondary known answers (league only), gathered 2026-10-21; see the report for sources.
export const GATES = [
  { player: 'Lionel Messi', club: 'Barcelona', slug: 'esp.1', season: 2004, apps: 7, starts: 0, goals: 1 },
  { player: 'Lionel Messi', club: 'Barcelona', slug: 'esp.1', season: 2005, apps: 17, starts: 11, goals: 6 },
  { player: 'Lionel Messi', club: 'Barcelona', slug: 'esp.1', season: 2006, apps: 26, starts: 23, goals: 14 },
  { player: 'Lionel Messi', club: 'Barcelona', slug: 'esp.1', season: 2008, apps: 31, starts: 27, goals: 23, minutes: 2516 },
  { player: 'Cristiano Ronaldo', club: 'Manchester United', slug: 'eng.1', season: 2003, apps: 29, starts: 15, goals: 4 },
  { player: 'Cristiano Ronaldo', club: 'Manchester United', slug: 'eng.1', season: 2006, apps: 34, starts: 31, goals: 17, assists: '8?' },
  { player: 'Cristiano Ronaldo', club: 'Manchester United', slug: 'eng.1', season: 2007, apps: 34, starts: 31, goals: 31, pens: 4 },
  { player: 'Thierry Henry', club: 'Arsenal', slug: 'eng.1', season: 2002, apps: 37, starts: 37, goals: 24, pens: '3?', assists: 20 },
  { player: 'Thierry Henry', club: 'Arsenal', slug: 'eng.1', season: 2003, apps: 37, starts: 37, goals: 30, pens: '7?' },
  { player: 'Francesco Totti', club: 'AS Roma', slug: 'ita.1', season: 2003, apps: 31, goals: 20 },
  { player: 'Francesco Totti', club: 'AS Roma', slug: 'ita.1', season: 2006, apps: 35, starts: 35, goals: 26, pens: 5 },
  { player: 'Miroslav Klose', club: 'Werder Bremen', slug: 'ger.1', season: 2005, apps: 26, starts: '25?', goals: 25, assists: '11/14/16' },
  { player: 'Franck Ribéry', club: 'Marseille', slug: 'fra.1', season: 2006, apps: 25, starts: '25?', goals: 5, assists: '8?' },
]
const ix = loadIndex()
const clubMatches = (g) => ix[g.slug][g.season].played.filter((e) => [e.homeName, e.awayName].some((n) => n && (n === g.club || n.includes(g.club.replace('AS ', '')))))
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

if (process.argv[2] === 'fetch') {
  const rows = []
  for (const g of GATES) { const m = clubMatches(g); console.log(g.player, label(g.season), g.club, 'matches', m.length); rows.push(...m.map((e) => ({ ...e, kind: 'gate' }))) }
  fs.writeFileSync('out/gate-matches.json', JSON.stringify(rows))
  for (const e of rows) {
    if (cachedSummary(e.slug, e.id) === undefined && totalMisses() + stats.misses >= 1480) { console.error('budget stop'); break }
    await summary(e.slug, e.id)
  }
  logRun('gate fetch')
  console.log('misses', stats.misses)
}

export function playerSeason(g) {
  const m = clubMatches(g)
  const tot = { matches: m.length, noSummary: 0, noRoster: 0, apps: 0, starts: 0, subIns: 0, goalsKE: 0, pensKE: 0, goalsStat: 0, assistsStat: 0, assistsKE: 0, statAPP: 0, minutes: 0, ids: new Set(), missingFrom: [], notes: [], benchOnly: 0 }
  for (const e of m) {
    const s = cachedSummary(g.slug, e.id)
    if (!s) { tot.noSummary++; continue }
    const side = (s.rosters || []).find((r) => norm(r.team?.displayName).includes(norm(g.club.replace('AS ', ''))))
    if (!side?.roster?.length) { tot.noRoster++; tot.notes.push(`${e.date.slice(0, 10)} ${e.name}: no roster`); continue }
    if (side.roster.length > 5 && new Set(side.roster.map((q) => q.athlete?.id)).size <= 2) { tot.noRoster++; tot.notes.push(`${e.date.slice(0, 10)} ${e.name}: collapsed roster (every entry one athlete)`); continue }
    const hit = (q) => norm(q.athlete?.displayName) === norm(g.player)
    let entries = side.roster.filter(hit)
    if (!entries.length) entries = side.roster.filter((q) => norm(q.athlete?.displayName).endsWith(norm(g.player.split(' ').at(-1))))
    if (!entries.length) { tot.missingFrom.push(e.date.slice(0, 10) + ' ' + e.name); continue }
    const matchHasApp = (s.rosters || []).some((r) => (r.roster || []).some((q) => (q.stats || []).some((x) => x.abbreviation === 'APP')))
    const withStats = entries.find((q) => q.stats?.length) || entries[0]
    const p = { ...withStats, starter: entries.some((q) => q.starter), subbedIn: entries.some((q) => q.subbedIn), subbedOut: entries.some((q) => q.subbedOut) }
    const app0 = Number((p.stats || []).find((x) => x.abbreviation === 'APP')?.value || 0)
    if (p.starter && (p.subbedIn || (matchHasApp && !app0))) tot.notes.push(`${e.date.slice(0, 10)} ${e.name}: raw starter flag repaired (in=${p.subbedIn} APP=${app0})`)
    p.starter = p.starter && !p.subbedIn && (!matchHasApp || app0 === 1)
    if (entries.length > 1) tot.dupEntries = (tot.dupEntries || 0) + 1
    tot.ids.add(p.athlete.id + ':' + p.athlete.displayName)
    const sv = (k) => Number((p.stats || []).find((x) => x.abbreviation === k)?.value || 0)
    if (sv('APP')) tot.statAPP++
    tot.goalsStat += sv('G'); tot.assistsStat += sv('A')
    const played = p.starter || p.subbedIn
    if (!played) { tot.benchOnly++; if (sv('APP')) tot.notes.push(`${e.date.slice(0, 10)} ${e.name}: APP=1 but not starter/subbedIn`); continue }
    tot.apps++
    if (p.starter) tot.starts++; else tot.subIns++
    const ke = s.keyEvents || []
    const subs = ke.filter((k) => /substitution/.test(k.type?.type || ''))
    const inK = subs.find((k) => k.participants?.[0]?.athlete?.id === p.athlete.id)
    const outK = subs.find((k) => k.participants?.[1]?.athlete?.id === p.athlete.id)
    const start = p.starter ? 0 : clockMin(inK) ?? null
    const end = p.subbedOut ? clockMin(outK) ?? null : 90
    if (start == null || end == null) tot.notes.push(`${e.date.slice(0, 10)} ${e.name}: sub clock missing`)
    else tot.minutes += Math.max(0, Math.min(90, Math.floor(end)) - Math.floor(start))
    for (const k of ke) {
      if (!(k.scoringPlay || /goal/.test(k.type?.type || ''))) continue
      const own = /own/i.test(k.type?.type + ' ' + k.type?.text)
      if (k.participants?.[0]?.athlete?.id === p.athlete.id && !own) { tot.goalsKE++; if (/penalty/i.test(k.type?.type + ' ' + k.type?.text)) tot.pensKE++ }
      if (k.participants?.[1]?.athlete?.id === p.athlete.id) tot.assistsKE++
    }
    if (sv('G') !== ke.filter((k) => (k.scoringPlay || /goal/.test(k.type?.type || '')) && !/own/i.test(k.type?.type + ' ' + k.type?.text) && k.participants?.[0]?.athlete?.id === p.athlete.id).length)
      tot.notes.push(`${e.date.slice(0, 10)} ${e.name}: stat G=${sv('G')} vs keyEvents goals differ`)
  }
  tot.ids = [...tot.ids]
  return tot
}

if (process.argv[2] === 'report') {
  const rows = []
  for (const g of GATES) {
    const t = playerSeason(g)
    rows.push(`| ${g.player} | ${g.club} ${label(g.season)} | ${t.matches} (${t.noSummary + t.noRoster} no roster) | ${t.apps} / ${g.apps} | ${t.starts} / ${g.starts ?? '-'} | ${t.goalsKE} / ${t.goalsStat} / ${g.goals} | ${t.pensKE} / ${g.pens ?? '-'} | ${t.assistsStat} / ${t.assistsKE} / ${g.assists ?? '-'} | ${t.minutes}${g.minutes ? ' / ' + g.minutes : ''} | ${t.ids.join('; ')} |`)
    t.notes.push(`not in matchday squad: ${t.missingFrom.length}; on bench unused: ${t.benchOnly}; duplicate entries: ${t.dupEntries || 0}`)
    if (t.notes.length) console.error(g.player, label(g.season), '\n  ' + t.notes.join('\n  '))
  }
  console.log('| Player | Club-season | ESPN matches | Apps ESPN / known | Starts ESPN / known | Goals keyEvents / stats[] / known | Pens KE / known | Assists stats[] / keyEvents / known | Minutes ESPN / known | athlete id |')
  console.log('|---|---|---|---|---|---|---|---|---|---|')
  console.log(rows.join('\n'))
}
