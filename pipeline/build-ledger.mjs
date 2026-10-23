#!/usr/bin/env node
// The ledger builder: ESPN match summaries (cache only, never the network) in, one row per player
// per match out, with the repairs the probes proved necessary. See pipeline/docs/ledger.md.
//
//   node pipeline/build-ledger.mjs                         # everything in the index; pending summaries listed as pending
//   node pipeline/build-ledger.mjs --only-cached           # skip matches whose summary isn't cached yet
//   node pipeline/build-ledger.mjs --leagues eng.1,esp.1 --seasons 2002-2005   # partial: writes *.partial.* files
//   node pipeline/build-ledger.mjs --gate                  # gate seasons only, nothing written, exit 1 on a regression
//   node pipeline/build-ledger.mjs --merge-review          # print the id-merge candidates by confidence
//   node pipeline/build-ledger.mjs --no-fill               # leave out the athlete-store fill (data/ledger/fills/athlete-matches.jsonl)
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, loadIndex, readSummary, recordCompetitor } from './lib/ledger/cache.mjs'
import { buildMatch } from './lib/ledger/match.mjs'
import { RULES_VERSION } from './lib/ledger/rules.mjs'
import { buildMergeTable, STAR_IDS, MERGE_THRESHOLD } from './lib/ledger/merge.mjs'
import { computeOrdinals } from './lib/ledger/ordinals.mjs'
import { runGates, LEAGUE_GATES, UCL_GATES } from './lib/ledger/gates.mjs'
import { loadFillRows, mergeFill, FILL_FILE } from './lib/ledger/fill.mjs'

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
// One ESPN id listed for both sides of a match is a misidentification on one side: Inter's goalkeeper
// Júlio César (#12) carries Julio César De León's id (Reggina #27) in 205790 and 224342. Keep the row on
// the side of the club he plays for in his other matches that competition-season; drop the other, whose
// real player the summary can't name (full-scope build, 2026-10-22: 4 rows in 4 matches).
{
  const clubCount = new Map() // espnId|slug|season -> Map(teamId -> n)
  for (const p of players) { const k = `${p.espnId}|${p.slug}|${p.season}`; const m = clubCount.get(k) || new Map(); m.set(p.teamId, (m.get(p.teamId) || 0) + 1); clubCount.set(k, m) }
  const byKey = new Map()
  for (const p of players) { const k = `${p.id}|${p.espnId}`; const l = byKey.get(k) || []; l.push(p); byKey.set(k, l) }
  const drop = new Set()
  for (const l of byKey.values()) {
    if (l.length < 2) continue
    const counts = clubCount.get(`${l[0].espnId}|${l[0].slug}|${l[0].season}`)
    const score = (p) => (counts.get(p.teamId) || 0) - 1 // other matches for that club
    const keep = [...l].sort((a, b) => score(b) - score(a))[0]
    for (const p of l) if (p !== keep) {
      drop.add(p)
      anomalies.push({ id: p.id, slug: p.slug, season: p.season, date: p.date, rule: 'athlete-id-both-sides', athlete: p.espnId, team: p.teamId, detail: `${p.name} (${p.espnId}) listed for both sides; kept on team ${keep.teamId} (${score(keep)} other matches that season), dropped on team ${p.teamId} (${score(p)}); that side's real player is unnamed` })
    }
  }
  if (drop.size) for (let i = players.length - 1; i >= 0; i--) if (drop.has(players[i])) players.splice(i, 1)
}
const bySeason = new Map()
for (const m of matches) { if (m.summary !== 'ok') continue; const k = `${m.slug}|${m.season}`; const v = bySeason.get(k) || { matches: 0, stats: 0, goals: 0, pens: 0 }; v.matches++; if (m.stats) v.stats++; bySeason.set(k, v) }
for (const p of players) { const v = bySeason.get(`${p.slug}|${p.season}`); if (p.goals) v.goals += p.goals; if (p.pens) v.pens += p.pens }
const untypedPens = new Set()
for (const [k, v] of bySeason) {
  const [slug, season] = k.split('|')
  // penalty typing is judged by share, not presence: penalties are 6-10% of goals in a typed season, and
  // EPL 2002-03 has 11 typed in 963 goals (1.1%), i.e. typing in a handful of matches only (full-scope build,
  // 2026-10-22). Under 3%: untyped, pens null. 3-5%: partial (La Liga and Bundesliga 2004-05), kept and flagged.
  const penShare = v.goals ? v.pens / v.goals : 0
  if (v.goals >= 300 && penShare < 0.03) { untypedPens.add(k); anomalies.push({ id: null, slug, season: Number(season), rule: 'penalty-typing-absent', detail: `${v.goals} goals, ${v.pens} typed penalties (${(100 * penShare).toFixed(1)}%) in ${v.matches} cached matches; pens null for the season` }) }
  else if (v.goals >= 300 && penShare < 0.05) anomalies.push({ id: null, slug, season: Number(season), rule: 'penalty-typing-partial', detail: `${v.goals} goals, ${v.pens} typed penalties (${(100 * penShare).toFixed(1)}%) in ${v.matches} cached matches; pens kept but likely undercounted` })
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
{ // a canonical player can have at most one row per match; two means a false merge
  const seenRow = new Map()
  for (const p of players) { const k = `${p.id}|${p.athleteId}`; if (seenRow.has(k)) throw new Error(`false merge: ${p.athleteId} has two rows in match ${p.id} (${seenRow.get(k)} and ${p.espnId}, ${p.name})`); seenRow.set(k, p.espnId) }
}
for (const c of merge.candidates) if (c.merged) anomalies.push({ id: null, rule: 'athlete-id-merged', athlete: c.ids.find((x) => merge.map[x]) ?? c.ids[1], detail: `${c.name}: ${c.ids.join(' + ')} -> ${merge.map[c.ids[0]] ?? c.ids[0]} (${c.level} ${c.confidence})` })

// ---- the athlete-store fill (lib/ledger/fill.mjs, pipeline/docs/ledger.md): rows from ESPN's athlete-scoped
// store for the sides the summary withheld (collapsed, missing, hollow) or left without starters. Added only
// where the summary has no row for that player in that match; the merge table is built from summary rows only.
let fill = null
if (!has('--no-fill')) {
  const fillRows = loadFillRows(ROOT)
  if (!fillRows) console.log(`fill: ${FILL_FILE} not on disk; withheld sides stay empty`)
  else {
    fill = mergeFill({ fillRows, players, matches, anomalies, mergeMap: merge.map, untypedPens, competitorOf: recordCompetitor })
    players.push(...fill.added)
    anomalies.push(...fill.notes)
    const order = new Map(matches.map((m, i) => [m.id, i]))
    players.sort((a, b) => order.get(a.id) - order.get(b.id)) // stable: a match's fill rows follow its summary rows
    const seenRow = new Set()
    for (const p of players) { const k = `${p.id}|${p.athleteId}`; if (seenRow.has(k)) throw new Error(`fill: ${p.athleteId} has two rows in match ${p.id}`); seenRow.add(k) }
  }
}

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
  fs.writeFileSync(path.join(OUT, `build${suffix}.json`), JSON.stringify({ builtAt: new Date().toISOString(), rulesVersion: RULES_VERSION, scope: { leagues: leagues && [...leagues], seasons: seasons && [...seasons], onlyCached }, counts: { ...counts, matches: matches.length, playerRows: players.length, fillRows: fill?.stats.added ?? 0, anomalies: anomalies.length, ordinals: ordinals.length }, anomaliesByRule: byRule, fill: fill && { file: FILL_FILE, ...fill.stats, unfilled: fill.unfilled, notWithheld: fill.notWithheld }, ms: { read: tRead - t0, total: tDone - t0 } }, null, 1) + '\n')
}

console.log(`ledger${suffix}: ${counts.events} index events, ${counts.ok} summaries built, ${counts.pending} pending${onlyCached ? ' (skipped)' : ''}, ${counts.empty} empty`)
console.log(`  ${matches.length} match rows, ${players.length} player rows, ${ordinals.length} ordinals, ${anomalies.length} anomalies; ${merge.stats.athletes} athletes, ${merge.stats.namesWithSeveralIds} names with several ids, ${merge.stats.candidates} merge candidates, ${merge.stats.merged} ids merged`)
console.log(`  read+build ${((tRead - t0) / 1000).toFixed(1)} s, total ${((tDone - t0) / 1000).toFixed(1)} s (${counts.ok ? ((tRead - t0) / counts.ok).toFixed(2) : '-'} ms per summary)`)
console.log('  anomalies by rule: ' + Object.entries(byRule).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '))
if (fill) {
  const f = fill.stats
  console.log(`  fill: ${f.added} athlete-store rows added on ${f.sidesFilled} sides (${Object.entries(f.byRule).map(([k, v]) => `${k} ${v}`).join(', ')}); ${f.sidesUnfilled} withheld sides with nothing added; skipped ${f.otherSlug} other slugs, ${f.notWithheld} on sides the summary built, ${f.summaryHasAthlete + f.summaryHasName} already in the summary, ${f.otherSide} on the other side, ${f.duplicate} duplicates, ${f.outOfScope} outside this run`)
  console.log(`  fill sides: ${f.recordChecked} records read for their $ref competitor (${f.recordUnreadable} unreadable), ${f.recordOtherSide} on the other side of the URL asked, ${f.bothSidesDropped} both-sides rows dropped`)
  console.log(`  fill clocks: ${f.clocks.fromKeyEvents} rows with a keyEvent clock, ${f.clocks.unknown} with a clock unknown (${f.clocks.minutesFromRecord} minutes from the record, ${f.clocks.minutesNull} null), ${f.clocks.recordDisagrees} where the record's minutes differ from the clocks by more than 2`)
}

const g = runGates({ matches, players, anomalies, mergeMap: merge.map })
console.log(g.lines.join('\n'))
console.log(`gates: ${g.passed} pass, ${g.failed} fail, ${g.skipped} skipped (summaries not cached yet, or outside the run's scope)`)
if (!gateMode) fs.writeFileSync(path.join(OUT, `gates${suffix}.json`), JSON.stringify({ builtAt: new Date().toISOString(), results: g.results }, null, 1) + '\n')
if (g.failed) { console.error(`GATE REGRESSION: ${g.failed} gate(s) failed`); if (gateMode || has('--strict')) process.exit(1) }
