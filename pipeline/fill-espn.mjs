#!/usr/bin/env node
// ESPN follow-up fills, run once the ESPN host is free (the club harvester owns it until it ends).
//
//   node pipeline/fill-espn.mjs --job athlete-fills --dry-run    # plan only: exact URLs + estimates, no request
//   node pipeline/fill-espn.mjs --job dob --dry-run [--strategy roster] [--dob-source wikidata-first]
//   node pipeline/fill-espn.mjs --job intl-slugs --dry-run
//   node pipeline/fill-espn.mjs --job <job> --cache-only           # build outputs from disk only (*.cache-only.*)
//   node pipeline/fill-espn.mjs --job <job> [--limit N]            # live: fetch through research/espn/espn.mjs
//
// Docs: pipeline/docs/fill.md. Every request goes through research/espn/espn.mjs (one per
// ESPN_GAP_MS, default here 1500, disk cache, backoff, manifest). A live run refuses to start while
// another ESPN process is running (one process per host); --force-host overrides that check only.
process.env.ESPN_GAP_MS ??= '1500' // espn.mjs reads it at import time: set before anything imports it

import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(`--${n}`)
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const job = opt('job')
const dryRun = flag('dry-run')
const cacheOnly = flag('cache-only')
const JOBS = ['athlete-fills', 'dob', 'intl-slugs']
if (!JOBS.includes(job)) {
  console.error(`usage: node pipeline/fill-espn.mjs --job ${JOBS.join('|')} [--dry-run | --cache-only] [--limit N] [--urls]\n` +
    '  athlete-fills: [--no-qualifiers] [--no-players] [--athlete-events all|intl]\n  dob: [--strategy athlete|roster] [--dob-source espn|wikidata-first]\n  intl-slugs: [--slugs a,b]')
  process.exit(2)
}

const { Fetcher, espnHostBusy, etaHours, ROOT } = await import('./lib/fill/espn-cache.mjs')
const offline = dryRun || cacheOnly
if (!offline) {
  const busy = espnHostBusy()
  if (busy.length && !flag('force-host')) {
    console.error(`ESPN host busy (one process per host):\n  ${busy.join('\n  ')}\nWait for it to finish, or run --dry-run.`)
    process.exit(3)
  }
}
const fetcher = new Fetcher({ dryRun: offline, budget: Number(opt('limit', Infinity)), log: flag('verbose') ? console.error : () => {} })
const FILLS = path.join(ROOT, 'data/ledger/fills')
fs.mkdirSync(FILLS, { recursive: true })
const writeAtomic = (file, text) => { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file) }
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')
const suffix = (file) => (cacheOnly ? file.replace(/(\.[a-z]+)$/, '.cache-only$1') : file)
const gapMs = Number(process.env.ESPN_GAP_MS)

let requestLog = () => {}
if (!offline) {
  const { logRun } = await import('../research/espn/ledger.mjs')
  requestLog = () => logRun(`fill-espn ${job}`)
  process.on('SIGINT', () => { requestLog(); process.exit(130) })
}

const plan = { job, generatedAt: new Date().toISOString(), gapMs, mode: dryRun ? 'dry-run' : cacheOnly ? 'cache-only' : 'live' }
const t0 = Date.now()

if (job === 'athlete-fills') {
  const lib = await import('./lib/fill/athlete-fills.mjs')
  const res = await lib.run({ fetcher, includeQualifiers: !flag('no-qualifiers'), players: !flag('no-players'), athleteEvents: opt('athlete-events', 'all') })
  const density = lib.eventlogDensity()
  const exact = fetcher.plannedByKind()
  const estStat = res.sides.reduce((n, s) => n + s.estimatedStat, 0)
  const playerEst = res.players.map((p) => {
    const share = opt('athlete-events', 'all') === 'intl' ? 0.12 : 1
    const stat = Math.round(p.unknownSeasons * density.perSeason * share)
    return { id: p.id, name: p.name, seasons: p.seasons, eventlogsOnDisk: p.eventlogsKnown, estStat: stat, estCompetition: Math.round(stat * density.outsideIndexShare), appsFromCache: p.apps }
  })
  const events = new Set(res.sides.map((s) => s.event))
  const byRule = {}
  for (const s of res.sides) { const k = `${s.rule}${s.qualifier ? ' (qualifier)' : ''}${s.intl ? ' (intl)' : ''}`; byRule[k] = (byRule[k] ?? 0) + 1 }
  const estimated = estStat + playerEst.reduce((n, p) => n + p.estStat + p.estCompetition, 0)
  const exactTotal = Object.values(exact).reduce((a, b) => a + b, 0)
  Object.assign(plan, {
    matches: events.size, sides: res.sides.length, sidesByRule: byRule,
    candidates: { total: res.sides.reduce((n, s) => n + s.candidates, 0), meanPerSide: Math.round(res.sides.reduce((n, s) => n + s.candidates, 0) / Math.max(1, res.sides.length) * 10) / 10,
      sidesWithFewSources: res.sides.filter((s) => s.sources.length < 2).length, widened: res.sides.filter((s) => s.widened).length },
    strategy: res.groups.reduce((o, g) => ((o[g.strategy] = (o[g.strategy] ?? 0) + 1), o), {}),
    groups: res.groups.map((g) => ({ team: g.team, year: g.year, matches: g.targets.length, candidates: g.union.size, direct: g.directCost, eventlog: g.eventlogCost, strategy: g.strategy, forced: g.forced })),
    requests: { exact, exactTotal, estimatedStatAfterEventlogs: estStat, players: playerEst, estimatedTotal: estimated, total: exactTotal + estimated },
    eventlogDensity: density,
    fromCacheAlready: { rows: res.rows.length, sidesComplete: res.sides.filter((s) => s.complete).length },
  })
  plan.etaHours = etaHours(plan.requests.total, gapMs)
  if (!dryRun) {
    writeAtomic(suffix(path.join(FILLS, 'athlete-matches.jsonl')), jsonl(res.rows))
    writeAtomic(suffix(path.join(FILLS, 'athlete-fills.json')), JSON.stringify({ builtAt: plan.generatedAt, mode: plan.mode, sides: res.sides, players: res.players, rows: res.rows.length }, null, 1))
  }
  console.log(`athlete-fills: ${events.size} matches, ${res.sides.length} sides (${JSON.stringify(byRule)}), ${plan.candidates.total} candidate slots (mean ${plan.candidates.meanPerSide}/side)`)
  console.log(`  strategy per team-season: ${JSON.stringify(plan.strategy)}; ${res.rows.length} rows already buildable from the cache`)
  for (const p of playerEst) console.log(`  ${p.name}: ${p.seasons} eventlogs, ~${p.estStat} stat + ~${p.estCompetition} competition requests (estimate, ${density.perSeason}/season from ${density.seasons} cached eventlog-seasons)`)
}

if (job === 'dob') {
  const lib = await import('./lib/fill/dob.mjs')
  const strategy = opt('strategy', 'athlete'), dobSource = opt('dob-source', 'espn')
  const res = await lib.run({ fetcher, strategy, dobSource })
  const proj = lib.projectIds()
  const exact = fetcher.plannedByKind()
  const exactTotal = Object.values(exact).reduce((a, b) => a + b, 0)
  Object.assign(plan, {
    strategy, dobSource, ids: res.stats.ids, aliasesFolded: res.stats.aliases, stats: res.stats,
    requests: { exact, exactTotal, projectedFullScope: proj.projected, projectedFullScopeWikidataFirst: Math.max(0, proj.projected - Math.round(res.stats.wikidataEspnJoin * proj.projected / Math.max(1, res.stats.ids))) },
    projection: proj,
  })
  plan.etaHours = etaHours(exactTotal, gapMs)
  plan.etaHoursFullScope = etaHours(proj.projected, gapMs)
  if (!dryRun) {
    const rows = res.rows.sort((a, b) => Number(a.id) - Number(b.id))
    writeAtomic(suffix(path.join(ROOT, 'data/index/athletes.jsonl')), jsonl(rows))
    writeAtomic(suffix(path.join(ROOT, 'data/index/athletes-build.json')), JSON.stringify({ builtAt: plan.generatedAt, mode: plan.mode, strategy, dobSource, stats: res.stats, rows: rows.length, withDob: rows.filter((r) => r.dob).length,
      wikidata: rows.reduce((o, r) => { const m = r.wikidata?.method ?? 'none'; o[m] = (o[m] ?? 0) + 1; return o }, {}), dobDisagree: rows.filter((r) => r.wikidata?.dobAgree === false).map((r) => ({ id: r.id, name: r.name, espn: r.dob, wikidata: r.wikidata.born, qid: r.wikidata.qid })) }, null, 1))
  }
  console.log(`dob: ${res.stats.ids} ids now (${res.stats.aliases} merged-away aliases folded in), ${exactTotal} requests planned (${JSON.stringify(exact)}); full scope projected ~${proj.projected} ids (${proj.perLeagueSeason}/league-season, ${proj.newShare} new per season)`)
  console.log(`  Wikidata P3681 joins ${res.stats.wikidataEspnJoin} of these ids with a DOB (wikidata-first would skip them)`)
}

if (job === 'intl-slugs') {
  const lib = await import('./lib/fill/intl-probe.mjs')
  const want = opt('slugs')?.split(',')
  const slugs = want ? lib.SLUGS.filter((s) => want.includes(s.slug)) : lib.SLUGS
  const out = await lib.run({ fetcher, slugs, log: () => {} })
  const exact = fetcher.plannedByKind()
  let estSummaries = 0
  for (const s of slugs) {
    const rec = out.slugs.find((r) => r.slug === s.slug)
    const known = rec.seasons.reduce((n, x) => n + x.sampled, 0)
    if (rec.yearsUnknown) estSummaries += Math.max(0, Math.round(s.seasonsEst * lib.PER_SEASON * rec.yearsUnknown / s.years.length))
    void known
  }
  const exactTotal = Object.values(exact).reduce((a, b) => a + b, 0)
  Object.assign(plan, {
    slugs: slugs.map((s) => ({ slug: s.slug, id: s.id, years: s.years.length, seasonsEst: s.seasonsEst })),
    requests: { exact, exactTotal, estimatedSummaries: estSummaries, total: exactTotal + estSummaries },
  })
  plan.etaHours = etaHours(plan.requests.total, gapMs)
  if (!dryRun) {
    writeAtomic(suffix(lib.OUT), JSON.stringify(out, null, 1))
    console.log(lib.markdown(out))
  }
  console.log(`intl-slugs: ${slugs.length} slugs, ${exact.scoreboard ?? 0} year scoreboards + ~${estSummaries} sampled summaries (${lib.PER_SEASON} per slug-season)`)
}

if (flag('urls') || dryRun) plan.urls = [...fetcher.planned].map(([url, kind]) => ({ kind, url }))
plan.cacheHits = Object.fromEntries(fetcher.hits)
plan.elapsedMs = Date.now() - t0
if (dryRun) {
  const f = path.join(FILLS, `plan-${job}.json`)
  writeAtomic(f, JSON.stringify(plan, null, 1))
  console.log(`  requests: ${JSON.stringify(plan.requests.exact)} exact${plan.requests.estimatedTotal != null ? ` + ${plan.requests.estimatedTotal} estimated` : plan.requests.estimatedSummaries != null ? ` + ${plan.requests.estimatedSummaries} estimated` : ''}; ETA ${plan.etaHours} h at ${gapMs} ms${plan.etaHoursFullScope != null ? ` (full scope ${plan.etaHoursFullScope} h)` : ''}`)
  console.log(`  plan: ${path.relative(ROOT, f)} (${plan.urls.length} exact URLs; nothing fetched)`)
} else {
  if (!cacheOnly) requestLog()
  console.log(`  fetched ${fetcher.fetched}, cache hits ${JSON.stringify(plan.cacheHits)}`)
}
