// Harvests the raw ESPN cache the ledger builder reads: enumerates every played match for the five
// leagues and the Champions League from 2002-03, then fetches every match summary not yet cached.
// It builds no ledger. Every request goes through research/espn/espn.mjs (throttle, backoff, cache).
//
//   ESPN_GAP_MS=1500 node pipeline/harvest-espn.mjs [--dry-run] [--limit N] [--leagues a,b]
//                                                  [--seasons 2002-2005] [--refresh-season 2026]
//
// Outputs: data/index/espn-events.json, data/index/espn/{slug}/{season}.csv,
// data/index/espn-anomalies.jsonl, and progress in data/raw/logs/harvest-espn.log.
// See pipeline/README.md for the schema, flags and log format.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { summary, isCached, stats } from '../research/espn/espn.mjs'
import { ALL_SLUGS, UCL, UCL_QUAL, FIRST_SEASON, RULES_VERSION, label } from './lib/espn-scope.mjs'
import { enumerateSlug, completeness, yearsFor } from './lib/espn-index.mjs'
import { checkSummary } from './lib/espn-check.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INDEX_DIR = path.join(ROOT, 'data/index')
const INDEX = path.join(INDEX_DIR, 'espn-events.json')
const CSV_DIR = path.join(INDEX_DIR, 'espn')
const ANOMALIES = path.join(INDEX_DIR, 'espn-anomalies.jsonl')
const LOG = path.join(ROOT, 'data/raw/logs/harvest-espn.log')
const GAP_MS = Number(process.env.ESPN_GAP_MS ?? 1100)
const SETTLE_HOURS = 48 // skip summaries of matches younger than this: ESPN still edits them
const MAX_CONSECUTIVE_ERRORS = 15 // stop instead of hammering a blocked or broken endpoint
const SUMMARY_SLUG = { [UCL_QUAL]: UCL_QUAL } // summaries are fetched under the event's own slug

// ---------- flags ----------
function parseArgs(argv) {
  const a = { dryRun: false, limit: Infinity, slugs: ALL_SLUGS, seasons: null, refresh: [] }
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i], v = () => argv[++i]
    if (f === '--dry-run') a.dryRun = true
    else if (f === '--limit') a.limit = Number(v())
    else if (f === '--leagues') a.slugs = v().split(',').map((s) => s.trim()).filter(Boolean)
    else if (f === '--seasons') a.seasons = parseSeasons(v())
    else if (f === '--refresh-season') a.refresh.push(...v().split(',').map(Number))
    else if (f === '--help' || f === '-h') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 11).join('\n')); process.exit(0) }
    else throw new Error(`unknown flag ${f}`)
  }
  for (const s of a.slugs) if (!ALL_SLUGS.includes(s)) throw new Error(`unknown league ${s}; known: ${ALL_SLUGS.join(',')}`)
  if (!(a.limit >= 0)) throw new Error('--limit needs a number')
  if (a.refresh.some((y) => !Number.isInteger(y))) throw new Error('--refresh-season needs a start year, e.g. 2026')
  return a
}
/** "2002-2005" = start years 2002..2005; "2004" or "2004-05" = that one season. */
function parseSeasons(s) {
  let m = /^(\d{4})$/.exec(s)
  if (m) return [+m[1], +m[1]]
  m = /^(\d{4})-(\d{2})$/.exec(s)
  if (m) return [+m[1], +m[1]]
  m = /^(\d{4})-(\d{4})$/.exec(s)
  if (m && +m[2] >= +m[1]) return [+m[1], +m[2]]
  throw new Error(`--seasons wants YYYY, YYYY-YY or YYYY-YYYY, got ${s}`)
}

// ---------- log ----------
fs.mkdirSync(path.dirname(LOG), { recursive: true })
const log = (msg) => {
  const line = `${new Date().toISOString()} ${msg}`
  console.log(line)
  fs.appendFileSync(LOG, line + '\n')
}
const dur = (sec) => {
  if (!Number.isFinite(sec)) return '?'
  sec = Math.round(sec)
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60)
  return h ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m${String(sec % 60).padStart(2, '0')}s`
}

// ---------- index io ----------
function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')) } catch { return null }
}
function writeIndex(ix) {
  fs.mkdirSync(INDEX_DIR, { recursive: true })
  ix.events.sort((a, b) => a.slug.localeCompare(b.slug) || a.season - b.season || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const head = { ...ix, events: undefined, excluded: undefined }
  const body = [
    '{',
    Object.entries(head).filter(([, v]) => v !== undefined).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)},`).join('\n'),
    '"excluded":[', ix.excluded.map((e) => JSON.stringify(e)).join(',\n'), '],',
    '"events":[', ix.events.map((e) => JSON.stringify(e)).join(',\n'), ']',
    '}',
  ].join('\n')
  const tmp = INDEX + '.tmp'
  fs.writeFileSync(tmp, body + '\n')
  fs.renameSync(tmp, INDEX)
}
const CSV_COLS = ['slug', 'seasonLabel', 'date', 'id', 'homeId', 'homeName', 'awayId', 'awayName', 'homeScore', 'awayScore',
  'status', 'seasonSlug', 'round', 'qualifier', 'fetched', 'checked', 'rosterHome', 'rosterAway', 'anomalies']
const csvCell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v))
function writeCsvs(events) {
  const groups = new Map()
  for (const e of events) {
    const k = `${e.slug}/${e.seasonLabel}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(e)
  }
  for (const [k, evs] of groups) {
    const file = path.join(CSV_DIR, `${k}.csv`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const rows = evs.map((e) => CSV_COLS.map((c) =>
      csvCell(c === 'rosterHome' ? e.rosters?.[0] : c === 'rosterAway' ? e.rosters?.[1] : c === 'anomalies' ? e.anomalies?.join(' ') : e[c])).join(','))
    fs.writeFileSync(file, [CSV_COLS.join(','), ...rows].join('\n') + '\n')
  }
}

// ---------- main ----------
const args = parseArgs(process.argv.slice(2))
const now = new Date()
const currentYear = now.getUTCFullYear()
const runningSeason = now.getUTCMonth() + 1 >= 7 ? currentYear : currentYear - 1
const seasons = args.seasons ?? [FIRST_SEASON, runningSeason]
const t0 = Date.now()
log(`start ${args.dryRun ? 'DRY-RUN ' : ''}leagues=${args.slugs.join(',')} seasons=${label(seasons[0])}..${label(seasons[1])}` +
  `${Number.isFinite(args.limit) ? ` limit=${args.limit}` : ''}${args.refresh.length ? ` refresh=${args.refresh.join(',')}` : ''} gapMs=${GAP_MS}`)

// 1. Enumerate. The index remembers which year scoreboards it was built from (sources). A slug is
//    re-derived only when the requested scope needs a year it lacks, or a refresh touches it; the
//    re-derivation reads every year from the cache, so only missing or refreshed years cost requests.
const old = loadIndex()
const ix = old ?? { schema: 1, sources: {}, unplayed: {}, excluded: [], events: [] }
const refreshYears = new Set(args.refresh.flatMap((y) => [y, y + 1]).filter((y) => y <= currentYear))
let enumRequests = 0
const enumMissBefore = stats.misses
for (const slug of args.slugs) {
  const need = yearsFor(slug, seasons[0], seasons[1], currentYear)
  const have = new Set(ix.sources[slug] ?? [])
  const missing = need.filter((y) => !have.has(y))
  const refresh = need.filter((y) => refreshYears.has(y))
  const stale = (ix.rules?.[slug] ?? 0) !== RULES_VERSION
  if (!missing.length && !refresh.length && !stale) continue
  const years = [...new Set([...have, ...need])].sort((a, b) => a - b)
  const prev = new Map(ix.events.filter((e) => e.slug === slug).map((e) => [e.id, e]))
  const { kept, excluded, unplayed, warnings } = await enumerateSlug(slug, years, {
    refreshYears: new Set(refresh), onRequest: () => enumRequests++, runningSeason,
    stuckBefore: new Date(Date.now() - 7 * 86400e3).toISOString(),
  })
  for (const w of warnings) log(`WARN ${w}`)
  // Carry over what earlier runs learned about each event (check results), keyed by id.
  for (const e of kept) {
    const p = prev.get(e.id)
    if (p?.checked) Object.assign(e, { checked: p.checked, rosters: p.rosters, anomalies: p.anomalies })
  }
  ix.events = ix.events.filter((e) => e.slug !== slug).concat(kept)
  ix.excluded = ix.excluded.filter((e) => e.slug !== slug).concat(excluded)
  ix.unplayed[slug] = unplayed
  ix.sources[slug] = years
  ;(ix.rules ||= {})[slug] = RULES_VERSION
  if (refresh.length) (ix.refreshed ||= {})[slug] = { years: refresh, at: now.toISOString() }
  log(`enumerated ${slug} years ${years[0]}-${years.at(-1)} (${missing.length} new, ${refresh.length} refreshed${stale ? ', rules changed' : ''}): ${kept.length} played, ${excluded.length} excluded`)
}
// An event ESPN files under both UCL slugs is kept once, under uefa.champions.
{
  const ucl = new Set(ix.events.filter((e) => e.slug === UCL).map((e) => e.id))
  ix.events = ix.events.filter((e) => !(e.slug === UCL_QUAL && ucl.has(e.id)))
}
const enumMisses = stats.misses - enumMissBefore
ix.updatedAt = now.toISOString()

// Completeness for the requested scope.
const { lines, failures } = completeness(ix.events, ix.unplayed, { seasons, slugs: args.slugs, runningSeason })
console.log('\ncompleteness (KNOWN = shortfall explained in research/espn-coverage-leagues.md §1; RUNNING = season in progress)')
for (const l of lines) console.log('  ' + l)
log(`completeness: ${lines.length} league-seasons, ${failures.length} unexplained${failures.length ? ': ' + failures.join(', ') : ''}`)
if (ix.excluded.length) {
  const why = {}
  for (const e of ix.excluded) if (args.slugs.includes(e.slug)) why[e.excludedBecause] = (why[e.excludedBecause] || 0) + 1
  console.log('excluded by rule: ' + Object.entries(why).map(([k, v]) => `${k} ${v}`).join('; '))
}

// 2. Work list: events in scope, season-ascending, interleaved across slugs within a season.
const inScope = (e) => args.slugs.includes(e.slug) && e.season >= seasons[0] && e.season <= seasons[1]
const summaryPath = (e) => `${SUMMARY_SLUG[e.slug] ?? e.slug}/summary?event=${e.id}`
for (const e of ix.events) e.fetched = isCached(summaryPath(e))
const settleCut = new Date(Date.now() - SETTLE_HOURS * 3600e3).toISOString()
const scope = ix.events.filter(inScope)
const unsettled = scope.filter((e) => !e.fetched && e.date > settleCut)
const order = []
{
  const bySeason = new Map()
  for (const e of scope) {
    if (e.date > settleCut && !e.fetched) continue
    if (!bySeason.has(e.season)) bySeason.set(e.season, new Map())
    const m = bySeason.get(e.season)
    if (!m.has(e.slug)) m.set(e.slug, [])
    m.get(e.slug).push(e)
  }
  for (const s of [...bySeason.keys()].sort((a, b) => a - b)) {
    const lists = ALL_SLUGS.map((sl) => bySeason.get(s).get(sl) ?? []).filter((l) => l.length)
    for (const l of lists) l.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) order.push(l[i])
  }
}
const toFetch = order.filter((e) => !e.fetched)
const toCheck = order.filter((e) => e.fetched && !e.checked)
const planned = Math.min(toFetch.length, args.limit)
log(`plan: ${scope.length} events in scope, ${scope.length - toFetch.length - unsettled.length} cached, ${toFetch.length} to fetch` +
  `${unsettled.length ? `, ${unsettled.length} deferred (< ${SETTLE_HOURS}h old)` : ''}, ${toCheck.length} cached awaiting check; ` +
  `enumeration used ${enumMisses} requests; ${planned} summary requests this run, ETA ${dur((planned * GAP_MS) / 1000)} at ${GAP_MS} ms`)
if (args.dryRun) {
  const per = {}
  for (const e of toFetch) { const k = e.slug; per[k] = (per[k] || 0) + 1 }
  console.log('to fetch by slug: ' + Object.entries(per).map(([k, v]) => `${k} ${v}`).join(', '))
  writeIndex(ix)
  writeCsvs(ix.events)
  log(`end DRY-RUN requests=${stats.misses} (enumeration) wrote ${path.relative(ROOT, INDEX)}`)
  process.exit(0)
}

// 3. Fetch and check. Unchecked cached summaries (probe leftovers) are checked first; free.
const known = new Set()
fs.mkdirSync(INDEX_DIR, { recursive: true })
fs.appendFileSync(ANOMALIES, '') // exists even when nothing is wrong
try {
  for (const l of fs.readFileSync(ANOMALIES, 'utf8').split('\n')) if (l) { const a = JSON.parse(l); known.add(`${a.id} ${a.reason}`) }
} catch {}
let anomalyCount = 0, errors = 0, consecutiveErrors = 0, fetchedNow = 0, cur = null
const runStats = { hits0: stats.hits, misses0: stats.misses, retries0: stats.retries }
const tFetch = Date.now()
function record(e, sum) {
  const { rosters, problems } = checkSummary(e, sum)
  e.checked = now.toISOString().slice(0, 10)
  e.rosters = rosters
  if (problems.length) e.anomalies = problems.map((p) => p.reason)
  else delete e.anomalies
  for (const p of problems) {
    const k = `${e.id} ${p.reason}`
    if (known.has(k)) continue
    known.add(k)
    anomalyCount++
    fs.appendFileSync(ANOMALIES, JSON.stringify({ id: e.id, slug: e.slug, season: e.seasonLabel, date: e.date.slice(0, 10),
      match: `${e.homeName} v ${e.awayName}`, reason: p.reason, detail: p.detail, at: new Date().toISOString() }) + '\n')
  }
}
function progress(tag = 'progress') {
  const net = stats.misses - runStats.misses0
  const elapsed = (Date.now() - tFetch) / 1000
  const perReq = net > 5 ? elapsed / net : GAP_MS / 1000
  const left = planned - fetchedNow
  log(`${tag} done=${fetchedNow}/${planned} (${planned ? ((100 * fetchedNow) / planned).toFixed(1) : '100.0'}%) ` +
    `hits=${stats.hits - runStats.hits0} misses=${net} retries=${stats.retries - runStats.retries0} errors=${errors} ` +
    `anomalies=${anomalyCount} rate=${(net / Math.max(elapsed, 1) * 60).toFixed(1)}/min eta=${dur(left * perReq)} ` +
    `at=${cur ? `${cur.slug} ${cur.seasonLabel}` : '-'}`)
}
let stopping = false
process.on('SIGINT', () => { if (stopping) process.exit(130); stopping = true; log('SIGINT: finishing the current request, then saving') })

for (const e of toCheck) {
  try { record(e, await summary(SUMMARY_SLUG[e.slug] ?? e.slug, e.id)) } catch (err) { log(`WARN cached summary ${e.id} unreadable: ${err.message}`) }
}
if (toCheck.length) log(`checked ${toCheck.length} summaries already in the cache`)

let lastLogAt = 0
for (const e of toFetch) {
  if (stopping || fetchedNow >= args.limit) break
  cur = e
  let sum, ok = false
  for (let attempt = 0; attempt < 2 && !ok; attempt++) {
    try {
      sum = await summary(SUMMARY_SLUG[e.slug] ?? e.slug, e.id)
      ok = true
    } catch (err) {
      // The helper already backed off on 429/5xx; this catches exhausted retries and network errors.
      log(`ERROR ${e.slug} ${e.id} attempt ${attempt + 1}: ${err.message}`)
      if (attempt === 0) await new Promise((r) => setTimeout(r, 30_000))
    }
  }
  fetchedNow++
  if (ok) {
    consecutiveErrors = 0
    e.fetched = true
    if (sum == null) e.empty = true
    record(e, sum)
  } else {
    errors++
    consecutiveErrors++
    fs.appendFileSync(ANOMALIES, JSON.stringify({ id: e.id, slug: e.slug, season: e.seasonLabel, date: e.date.slice(0, 10),
      match: `${e.homeName} v ${e.awayName}`, reason: 'fetch-error', detail: 'not cached; a rerun retries it', at: new Date().toISOString() }) + '\n')
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) { log(`STOP: ${consecutiveErrors} consecutive fetch errors; ESPN may be blocking. Rerun later to resume.`); break }
  }
  const net = stats.misses - runStats.misses0
  if (net - lastLogAt >= 100) { lastLogAt = net - (net % 100); progress() }
  if (fetchedNow % 500 === 0) writeIndex(ix)
}

for (const e of ix.events) e.fetched = isCached(summaryPath(e))
writeIndex(ix)
writeCsvs(ix.events)
const scopeNow = ix.events.filter(inScope)
const cachedNow = scopeNow.filter((e) => e.fetched).length
progress('end')
log(`summary: ${fetchedNow} summaries attempted, ${stats.misses - runStats.misses0} requests, ${errors} errors, ` +
  `${anomalyCount} new anomalies; scope now ${cachedNow}/${scopeNow.length} cached; elapsed ${dur((Date.now() - t0) / 1000)}; ` +
  `index ${path.relative(ROOT, INDEX)}`)
