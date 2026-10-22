#!/usr/bin/env node
// The ledger builder: ESPN match summaries (cache only, never the network) in, one row per player
// per match out, with the repairs the probes proved necessary. See pipeline/docs/ledger.md.
//
//   node pipeline/build-ledger.mjs                         # everything in the index; pending summaries listed as pending
//   node pipeline/build-ledger.mjs --only-cached           # skip matches whose summary isn't cached yet
//   node pipeline/build-ledger.mjs --leagues eng.1,esp.1 --seasons 2002-2005   # partial: writes *.partial.* files
//   node pipeline/build-ledger.mjs --gate                  # gate seasons only, nothing written, exit 1 on a regression
//   node pipeline/build-ledger.mjs --merge-review          # print the id-merge candidates by confidence
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, loadIndex, readSummary } from './lib/ledger/cache.mjs'
import { buildMatch } from './lib/ledger/match.mjs'
import { RULES_VERSION } from './lib/ledger/rules.mjs'
import { buildMergeTable, STAR_IDS, MERGE_THRESHOLD } from './lib/ledger/merge.mjs'
import { computeOrdinals } from './lib/ledger/ordinals.mjs'
import { runGates, LEAGUE_GATES, UCL_GATES } from './lib/ledger/gates.mjs'

const OUT = path.join(ROOT, 'data/ledger')
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }

function parseSeasons(s) {
  if (!s) return null
  const out = new Set()
  for (const part of s.split(',')) {
    const m = /^(\d{4})(?:-(\d{2,4}))?$/.exec(part.trim())
    if (!m) throw new Error(`bad --seasons ${part}`)
    const a = Number(m[1])
    let b = a
    if (m[2]) b = m[2].length === 4 ? Number(m[2]) : (m[2] === String(a + 1).slice(2) ? a : Number(String(a).slice(0, 2) + m[2]))
    for (let y = a; y <= b; y++) out.add(y)
  }
  return out
}

const gateMode = has('--gate')
const onlyCached = has('--only-cached')
let leagues = arg('--leagues') ? new Set(arg('--leagues').split(',')) : null
let seasons = parseSeasons(arg('--seasons'))
if (gateMode && !leagues && !seasons) {
  // the gate scope: each gate's league-season (both UCL slugs for UCL gates)
  const scope = new Set([...LEAGUE_GATES, ...UCL_GATES].flatMap((g) => g.slug === 'uefa.champions' ? [`${g.slug}|${g.season}`, `uefa.champions_qual|${g.season}`] : [`${g.slug}|${g.season}`]))
  leagues = null; seasons = null
  var gateScope = scope
}
const partial = !!(leagues || seasons)
const suffix = partial ? '.partial' : ''

const t0 = Date.now()
const ix = loadIndex()
const events = ix.events.filter((e) => (!leagues || leagues.has(e.slug)) && (!seasons || seasons.has(e.season)) && (!gateScope || gateScope.has(`${e.slug}|${e.season}`)))
events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id)))

const matches = [], players = [], anomalies = [], splitPairs = []
const counts = { events: events.length, ok: 0, pending: 0, empty: 0 }
for (const ev of events) {
  const r = readSummary(ev.slug, ev.id)
  if (r.state === 'pending') {
    counts.pending++
    if (onlyCached) continue
    matches.push(stubMatch(ev, 'pending'))
    continue
  }
  if (r.state === 'empty') {
    counts.empty++
    matches.push(stubMatch(ev, 'empty'))
    anomalies.push({ id: ev.id, slug: ev.slug, season: ev.season, date: ev.date, rule: 'summary-empty', detail: 'ESPN returned 404 for the summary' })
    continue
  }
  counts.ok++
  const b = buildMatch(ev, r.summary)
  matches.push(b.match)
  players.push(...b.players)
  anomalies.push(...b.anomalies)
  splitPairs.push(...b.splitPairs)
}
const tRead = Date.now()

function stubMatch(ev, summary) {
  return { id: ev.id, slug: ev.slug, season: ev.season, seasonLabel: ev.seasonLabel, date: ev.date, homeId: String(ev.homeId), homeName: ev.homeName, awayId: String(ev.awayId), awayName: ev.awayName, homeScore: ev.homeScore, awayScore: ev.awayScore, shootout: null, status: ev.status, stage: null, round: ev.round ?? null, seasonSlug: ev.seasonSlug ?? null, qualifier: !!ev.qualifier, stuck: !!ev.stuck, summary, quality: summary === 'empty' ? 'defective' : 'pending' }
}

// ---- season-level passes over the cached part of each league-season
const bySeason = new Map()
for (const m of matches) { if (m.summary !== 'ok') continue; const k = `${m.slug}|${m.season}`; const v = bySeason.get(k) || { matches: 0, stats: 0, goals: 0, pens: 0 }; v.matches++; if (m.stats) v.stats++; bySeason.set(k, v) }
for (const p of players) { const v = bySeason.get(`${p.slug}|${p.season}`); if (p.goals) v.goals += p.goals; if (p.pens) v.pens += p.pens }
const untypedPens = new Set()
for (const [k, v] of bySeason) {
  const [slug, season] = k.split('|')
  // penalty typing: a league-season with 40+ goals and not one `penalty---scored` event has no typing at all
  if (v.goals >= 40 && v.pens === 0) { untypedPens.add(k); anomalies.push({ id: null, slug, season: Number(season), rule: 'penalty-typing-absent', detail: `${v.goals} goals, 0 typed penalties in ${v.matches} cached matches; pens null for the season` }) }
  // assists: stats A exist only where stats arrays do
  if (v.stats === 0) anomalies.push({ id: null, slug, season: Number(season), rule: 'assists-null-season', detail: `no stats arrays in ${v.matches} cached matches; assists null` })
  else if (v.stats < v.matches) anomalies.push({ id: null, slug, season: Number(season), rule: 'assists-partial-season', detail: `stats arrays in ${v.stats} of ${v.matches} cached matches; assists null in the rest` })
}
for (const p of players) if (untypedPens.has(`${p.slug}|${p.season}`)) p.pens = null
// assists floors (AGENTS.md): stats A exists before these but undercounts
const ASSIST_FLOOR = { 'eng.1': 2005, 'esp.1': 2005, 'ger.1': 2006, 'fra.1': 2007, 'ita.1': 2008, 'uefa.champions': 2006, 'uefa.champions_qual': 2020 }
for (const m of matches) if (m.summary === 'ok') m.assistsReliable = m.stats && m.season >= (ASSIST_FLOOR[m.slug] ?? 2002)
for (const k of bySeason.keys()) { const [slug, season] = k.split('|'); if (Number(season) < (ASSIST_FLOOR[slug] ?? 0) && bySeason.get(k).stats) anomalies.push({ id: null, slug, season: Number(season), rule: 'assists-below-floor', detail: `stats A present but undercounts before ${ASSIST_FLOOR[slug]}-${String(ASSIST_FLOOR[slug] + 1).slice(2)}; matches carry assistsReliable:false` }) }

// ---- id merge
const merge = buildMergeTable(players, splitPairs)
for (const p of players) p.athleteId = merge.map[p.espnId] ?? p.espnId
for (const [id, name] of Object.entries(STAR_IDS)) if (merge.map[id]) throw new Error(`star id ${id} (${name}) was merged into ${merge.map[id]}; star ids must stay canonical`)
for (const c of merge.candidates) if (c.merged) anomalies.push({ id: null, rule: 'athlete-id-merged', athlete: c.ids.find((x) => merge.map[x]) ?? c.ids[1], detail: `${c.name}: ${c.ids.join(' + ')} -> ${merge.map[c.ids[0]] ?? c.ids[0]} (${c.level} ${c.confidence})` })

// ---- ordinals (second pass)
const ordinals = computeOrdinals(players, matches)
const tDone = Date.now()

if (has('--merge-review')) {
  console.log(`merge candidates (${merge.candidates.length}; merged at >= ${MERGE_THRESHOLD}):`)
  for (const c of merge.candidates) console.log(`${c.confidence.toFixed(2)} ${c.level.padEnd(6)} ${c.merged ? 'MERGE' : '     '} ${c.name} ${c.ids.join('/')} apps ${c.apps.join('/')} team ${c.evidence.team} ${c.evidence.seasonsA.join(',')} | ${c.evidence.seasonsB.join(',')} ${Object.entries(c.evidence).filter(([k]) => !['team', 'seasonsA', 'seasonsB', 'gap'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' ')}${c.veto ? ' VETO ' + c.veto : ''}`)
}

// ---- write
const byRule = {}
for (const a of anomalies) byRule[a.rule] = (byRule[a.rule] || 0) + 1
if (!gateMode) {
  fs.mkdirSync(OUT, { recursive: true })
  // chunked: the full-scope player file is ~1.3M rows (~430 MB), too close to V8's string limit for one join
  const writeJsonl = (name, rows, map = (r) => r) => {
    const f = path.join(OUT, name + suffix + '.jsonl'), tmp = f + '.tmp'
    const fd = fs.openSync(tmp, 'w')
    for (let i = 0; i < rows.length; i += 20000) fs.writeSync(fd, rows.slice(i, i + 20000).map((r) => JSON.stringify(map(r)) + '\n').join(''))
    fs.closeSync(fd)
    fs.renameSync(tmp, f)
  }
  writeJsonl('matches', matches)
  writeJsonl('player-matches', players, ({ jersey, pos, ...p }) => p)
  writeJsonl('anomalies', anomalies)
  writeJsonl('ordinals', ordinals)
  fs.writeFileSync(path.join(OUT, `id-merge${suffix}.json`), JSON.stringify({ builtAt: new Date().toISOString(), rulesVersion: RULES_VERSION, threshold: MERGE_THRESHOLD, stats: merge.stats, map: merge.map, candidates: merge.candidates }, null, 1) + '\n')
  fs.writeFileSync(path.join(OUT, `build${suffix}.json`), JSON.stringify({ builtAt: new Date().toISOString(), rulesVersion: RULES_VERSION, scope: { leagues: leagues && [...leagues], seasons: seasons && [...seasons], onlyCached }, counts: { ...counts, matches: matches.length, playerRows: players.length, anomalies: anomalies.length, ordinals: ordinals.length }, anomaliesByRule: byRule, ms: { read: tRead - t0, total: tDone - t0 } }, null, 1) + '\n')
}

console.log(`ledger${suffix}: ${counts.events} index events, ${counts.ok} summaries built, ${counts.pending} pending${onlyCached ? ' (skipped)' : ''}, ${counts.empty} empty`)
console.log(`  ${matches.length} match rows, ${players.length} player rows, ${ordinals.length} ordinals, ${anomalies.length} anomalies; ${merge.stats.athletes} athletes, ${merge.stats.namesWithSeveralIds} names with several ids, ${merge.stats.candidates} merge candidates, ${merge.stats.merged} ids merged`)
console.log(`  read+build ${((tRead - t0) / 1000).toFixed(1)} s, total ${((tDone - t0) / 1000).toFixed(1)} s (${counts.ok ? ((tRead - t0) / counts.ok).toFixed(2) : '-'} ms per summary)`)
console.log('  anomalies by rule: ' + Object.entries(byRule).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '))

const g = runGates({ matches, players, anomalies, mergeMap: merge.map })
console.log(g.lines.join('\n'))
console.log(`gates: ${g.passed} pass, ${g.failed} fail, ${g.skipped} skipped (summaries not cached yet, or outside the run's scope)`)
if (!gateMode) fs.writeFileSync(path.join(OUT, `gates${suffix}.json`), JSON.stringify({ builtAt: new Date().toISOString(), results: g.results }, null, 1) + '\n')
if (g.failed) { console.error(`GATE REGRESSION: ${g.failed} gate(s) failed`); if (gateMode || has('--strict')) process.exit(1) }
