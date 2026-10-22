#!/usr/bin/env node
// Harvest national-team competitive match reports from the Wayback Machine (deleted FIFA.com / UEFA.com pages).
//
//   node pipeline/harvest-archive.mjs --dry-run                 # request counts per source, no network
//   node pipeline/harvest-archive.mjs --limit 60                # up to 60 pending matches per source (spread evenly)
//   node pipeline/harvest-archive.mjs --source fifa2006,euro2000
//   node pipeline/harvest-archive.mjs                           # the full run (all six sources)
//   node pipeline/harvest-archive.mjs --gates-only              # recompute gates + known answers from disk, no network
//   node pipeline/harvest-archive.mjs --rebuild                 # re-parse harvested matches from the cache (no network)
//
// Sources: fifa1998 fifa2002 fifa2006 fifa2010 (or "fifa"), euro2000, euro2004q (or "uefa"); default all.
// Every request goes through lib/archive/wb.mjs: one request per WB_GAP_MS (2000) shared across processes by a
// lock in data/raw/wayback/, disk-cached, backoff on 429/5xx. One harvester process at a time (lock dir below).
// Resumable: records are keyed by source match id in data/index/archive/<source>.json and skipped on rerun;
// every response is cached, so a killed run loses nothing. Progress every 50 requests to
// data/raw/logs/harvest-archive.log. Friendlies are out of scope (no FIFA/UEFA reports exist for them).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cdx, raw, stats, isCached, cdxUrl, rawUrl } from './lib/archive/wb.mjs'
import { parseFifaIndex, parseFifaReport } from './lib/archive/fifa.mjs'
import { parseUefaLineups, parseUefaStatsPages } from './lib/archive/uefa.mjs'
import { parseUefaMs } from './lib/archive/uefa-ms.mjs'
import { fifaRecord, uefaHistoryRecord, uefaMsRecord, missingRecord, isoDate, annotateRecord } from './lib/archive/records.mjs'
import { loadMartj42, gateRecord, gatesCsv, summarize, runKnownAnswers, KNOWN_ANSWERS, lineupChecks, defectWarnings } from './lib/archive/gates.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'data/index/archive')
const LOG = path.join(ROOT, 'data/raw/logs/harvest-archive.log')
const MARTJ42 = path.join(ROOT, 'data/raw/martj42/results-2026-10-21.csv')
const LOCK = path.join(OUT, '.harvest.lock')

// ---------- args ----------
const argv = process.argv.slice(2)
const flag = (f) => argv.includes(f)
const opt = (f) => {
  const i = argv.indexOf(f)
  return i >= 0 ? argv[i + 1] : undefined
}
const DRY = flag('--dry-run')
const GATES_ONLY = flag('--gates-only')
const REBUILD = flag('--rebuild') // re-parse already-harvested matches from the cache only (after a parser fix)
// --redo id,id: re-harvest these already-harvested matches with the network on (to try captures the first pass
// never fetched); the new record replaces the old one
const REDO = opt('--redo') ? new Set(opt('--redo').split(',')) : null
const LIMIT = opt('--limit') ? Number(opt('--limit')) : Infinity
const SOURCES = {
  fifa1998: { kind: 'fifa', edition: 'edition=1013', competition: '1998 FIFA World Cup qualification', warn: 'fifa1998: FIFA\'s 1998 qualifier reports often omit the on-minute of substitutes (source incomplete); subs gate unreliable for this source' },
  fifa2002: { kind: 'fifa', edition: 'edition=4395', competition: '2002 FIFA World Cup qualification' },
  fifa2006: { kind: 'fifa', edition: 'germany2006', competition: '2006 FIFA World Cup qualification' },
  fifa2010: { kind: 'fifa', edition: 'southafrica2010', competition: '2010 FIFA World Cup qualification' },
  euro2000: { kind: 'euro2000' },
  euro2004q: { kind: 'euro2004q', competition: 'UEFA Euro 2004 qualifying' },
}
const GROUPS = { fifa: ['fifa1998', 'fifa2002', 'fifa2006', 'fifa2010'], uefa: ['euro2000', 'euro2004q'], all: Object.keys(SOURCES) }
const chosen = [...new Set((opt('--source') ?? 'all').split(',').flatMap((s) => GROUPS[s] ?? [s]))]
for (const s of chosen) if (!SOURCES[s]) (console.error(`unknown source ${s}; use ${Object.keys(SOURCES).join(' ')} fifa uefa all`), process.exit(2))
if (DRY || REBUILD) process.env.WB_OFFLINE = '1' // wb.mjs throws instead of fetching on a cache miss

// ---------- logging ----------
fs.mkdirSync(path.dirname(LOG), { recursive: true })
fs.mkdirSync(OUT, { recursive: true })
const t0 = Date.now()
const log = (msg, quiet = false) => {
  const line = `${new Date().toISOString()} ${msg}`
  if (!DRY && !GATES_ONLY) fs.appendFileSync(LOG, line + '\n')
  if (!quiet) console.log(line)
}
let lastLogged = 0
let progress = { source: '', done: 0, total: 0 }
function tick() {
  if (stats.misses - lastLogged >= 50) {
    lastLogged = stats.misses - (stats.misses % 50)
    const el = (Date.now() - t0) / 1000
    log(`[${progress.source}] ${progress.done}/${progress.total} matches; ${stats.misses} requests (${stats.hits} cache hits, ${stats.retries} retries, ${stats.notFound} 404s) in ${Math.round(el / 60)} min, ${(el / Math.max(1, stats.misses)).toFixed(1)} s/request`)
  }
}

// ---------- process lock ----------
function lock() {
  try {
    fs.mkdirSync(LOCK)
  } catch {
    const pid = Number(fs.readFileSync(path.join(LOCK, 'pid'), 'utf8').trim() || 0)
    let alive = false
    try {
      process.kill(pid, 0)
      alive = true
    } catch {}
    if (alive) (console.error(`another harvest-archive process (pid ${pid}) holds ${LOCK}`), process.exit(1))
    fs.rmSync(LOCK, { recursive: true, force: true })
    fs.mkdirSync(LOCK)
  }
  fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid))
  process.on('exit', () => fs.rmSync(LOCK, { recursive: true, force: true }))
}

// ---------- output store ----------
const fileOf = (s) => path.join(OUT, `${s}.json`)
function loadRecords(s) {
  try {
    return JSON.parse(fs.readFileSync(fileOf(s), 'utf8'))
  } catch {
    return []
  }
}
function saveRecords(s, recs) {
  const sorted = [...recs].sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || String(a.source_id).localeCompare(String(b.source_id)))
  fs.writeFileSync(fileOf(s) + '.tmp', JSON.stringify(sorted, null, 1))
  fs.renameSync(fileOf(s) + '.tmp', fileOf(s))
}

// ---------- helpers ----------
const bare = (u) => u.replace(/^https?:\/\//, '').replace(/:80\//, '/')
const isShell = (t) => /requires your browser to support JavaScript/i.test(t ?? '')
const planned = [] // dry-run: {source, url, cached, kind}
async function want(source, kind, url) {
  planned.push({ source, kind, url, cached: await isCached(url) })
}
/** Fetch a snapshot; in dry-run only record the planned request. */
async function snap(source, ts, original) {
  if (DRY) {
    await want(source, 'raw', rawUrl(ts, original))
    return null
  }
  let p
  try {
    p = await raw(ts, original)
  } catch (e) {
    // --rebuild: a capture the harvest never fetched is skipped, not fatal (the rebuild only re-parses the cache)
    if (REBUILD && e.offline) return { status: 'not cached', text: null, offlineMiss: true }
    throw e
  }
  tick()
  return p
}
async function query(source, pattern, opts) {
  if (DRY) {
    const url = cdxUrl(pattern, opts)
    const cached = await isCached(url)
    planned.push({ source, kind: 'cdx', url, cached })
    if (!cached) return null
  }
  let r
  try {
    r = await cdx(pattern, opts)
  } catch (e) {
    if (REBUILD && e.offline) return []
    throw e
  }
  tick()
  return r
}

// ---------- FIFA ----------
async function planFifa(name) {
  const src = SOURCES[name]
  const rows = await query(name, `www.fifa.com/worldcup/archive/${src.edition}/preliminaries/`, { from: '2005', to: '2022', limit: 20000, fl: 'original,timestamp' })
  if (!rows) return { tasks: null, est: { fifa1998: 643, fifa2002: 777, fifa2006: 847, fifa2010: 853 }[name] }
  const byId = new Map()
  const indexes = []
  for (const r of rows) {
    if (/\/preliminaries\/(preliminary=\d+\/|\w+\/matches\/)index\.html$/.test(r.original)) indexes.push(r)
    const m = r.original.match(/\/preliminaries\/(.*?)\/?matches\/(?:round=\d+\/)?match=(\d+)\/(report\.html|report\/?)$/)
    if (!m) continue
    const t = byId.get(m[2]) ?? byId.set(m[2], { id: m[2], zone: m[1].replace(/\/$/, ''), html: null, bare: null }).get(m[2])
    if (m[3] === 'report.html') t.html ??= r
    else t.bare ??= r
  }
  return { tasks: [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id)), indexes }
}

async function fifaIndexes(name, indexes) {
  const map = new Map()
  for (const r of indexes) {
    let rows = []
    const p = await snap(name, r.timestamp, r.original)
    if (DRY) continue
    if (p?.text && !isShell(p.text)) rows = parseFifaIndex(p.text)
    if (!rows.length) {
      // first capture can be a broken render; try other digests (the probe's exact query shape, so it may be cached)
      const alts = (await query(name, bare(r.original), { matchType: 'exact', collapse: 'digest', limit: 10, fl: 'original,timestamp,length' })) ?? []
      for (const a of alts.filter((a) => a.timestamp !== r.timestamp).slice(0, 3)) {
        const q = await snap(name, a.timestamp, a.original)
        if (q?.text && !isShell(q.text)) rows = parseFifaIndex(q.text)
        if (rows.length) break
      }
    }
    log(`[${name}] index ${bare(r.original).replace(/^.*preliminaries\//, '')}: ${rows.length} matches`, true)
    for (const x of rows) map.set(x.matchId, x)
  }
  return map
}

function tryFifaPage(p) {
  if (!p?.text) return { why: `HTTP ${p?.status}` }
  if (isShell(p.text)) return { why: 'wayback JS shell' }
  let rep
  try {
    rep = parseFifaReport(p.text)
  } catch (e) {
    return { why: 'parse error ' + e.message }
  }
  if (rep.teams?.length !== 2 || !rep.teams.every((t) => t.starters.length) || !rep.home) return { why: `no lineups (${rep.teams?.length ?? 0} team blocks)`, partial: rep.home && rep.away && rep.result ? rep : null }
  return { rep }
}

async function harvestFifa(name, task, index) {
  const src = SOURCES[name]
  const tried = []
  let partial = null // a capture whose header parsed but whose lineups did not
  const cands = [task.html, task.bare].filter(Boolean)
  const attempt = async (c) => {
    const p = await snap(name, c.timestamp, c.original)
    if (DRY) return null
    const r = tryFifaPage(p)
    if (r.rep) return { ...r, c, p }
    tried.push({ ...c, why: r.why })
    if (r.partial && !partial) partial = { rep: r.partial, c, p }
    return null
  }
  if (DRY) return cands.length ? void (await snap(name, cands[0].timestamp, cands[0].original)) : null
  let got = null
  for (const c of cands) if ((got = await attempt(c))) break
  if (!got && task.html) {
    const alts = (await query(name, bare(task.html.original), { matchType: 'exact', collapse: 'digest', limit: 6, fl: 'original,timestamp' })) ?? []
    for (const a of alts.filter((a) => !cands.some((c) => c.timestamp === a.timestamp)).slice(0, 2)) if ((got = await attempt(a))) break
  }
  if (DRY) return null
  const ix = index.get(task.id)
  if (!got && partial) {
    // keep what the page does have (date, teams, score, scorers, referee, any partial team block) as an unparsed record
    const rec = fifaRecord(partial.rep, { source: name, sourceId: task.id, competition: src.competition, ts: partial.c.timestamp, original: partial.c.original, finalUrl: partial.p.finalUrl, stage: name === 'fifa2010' ? zoneName(task.zone) : null })
    rec.status = 'unparsed'
    rec.zone_path = task.zone
    rec.receipts = tried.map((t) => ({ url: `https://web.archive.org/web/${t.timestamp}/${t.original}`, timestamp: t.timestamp, original: t.original, failed: t.why }))
    rec.warnings.unshift(`no capture has both lineups (${tried.map((t) => t.why).join('; ')}); header fields kept from ${partial.c.timestamp}`)
    if (ix) rec.index = { home: ix.home, away: ix.away, score: ix.score }
    return rec
  }
  if (!got) return missingRecord({ source: name, sourceId: task.id, competition: src.competition, tried, index: ix })
  const stage = name === 'fifa2010' ? zoneName(task.zone) : null
  const rec = fifaRecord(got.rep, { source: name, sourceId: task.id, competition: src.competition, ts: got.c.timestamp, original: got.c.original, finalUrl: got.p.finalUrl, stage })
  rec.zone_path = task.zone
  if (src.warn) rec.warnings.push(src.warn)
  if (ix) {
    const s = String(ix.score).match(/^(\d+):(\d+)/)
    if (s && rec.score && (Number(s[1]) !== rec.score.home || Number(s[2]) !== rec.score.away)) rec.warnings.push(`zone index score ${ix.score} differs from report ${rec.score.raw}`)
    rec.index = { home: ix.home, away: ix.away, score: ix.score }
  }
  if (tried.length) rec.warnings.push(`earlier captures failed: ${tried.map((t) => `${t.timestamp} ${t.why}`).join('; ')}`)
  return rec
}
const zoneName = (z) => ({ europe: 'European Zone', africa: 'African Zone', asia: 'Asian Zone', nccamerica: 'North, Central American and Caribbean Zone', southamerica: 'South American Zone', oceania: 'Oceania Zone' })[z.split('/')[0]] ?? z

// ---------- UEFA Euro 2000 ----------
const EURO2000_ROUNDS = { 1165: ['UEFA Euro 2000 qualifying', 'Qualifying group'], 1318: ['UEFA Euro 2000 qualifying', 'Play-off'], 1458: ['UEFA Euro 2000', 'Group stage'], 1459: ['UEFA Euro 2000', 'Quarter-final'], 1460: ['UEFA Euro 2000', 'Semi-final'], 1461: ['UEFA Euro 2000', 'Final'] }

function historyTasks(rows, rounds) {
  const byId = new Map()
  for (const r of rows) {
    const any = r.original.match(/^(.*\/round=(\d+)\/match=(\d+)\/)/)
    if (!any || !rounds.includes(Number(any[2]))) continue
    // keep every id seen (some have only commentary/statistics captures); rootUrl lets harvestHistory ask CDX for it
    const t = byId.get(any[3]) ?? byId.set(any[3], { id: any[3], round: Number(any[2]), lineups: null, root: null, rootUrl: bare(any[1]) + 'index.html' }).get(any[3])
    const sc = r.original.match(/\/match=\d+\/postmatch\/(statistics|commentary)\/(?:index\.html)?$/)
    if (sc) t[sc[1]] ??= r // last-resort fallback (parseUefaStatsPages) when no lineups or root page parses
    const m = r.original.match(/\/round=(\d+)\/match=(\d+)\/(postmatch\/lineups\/(?:index\.html)?|index\.html|)$/)
    if (!m) continue
    if (m[3].startsWith('postmatch')) t.lineups = !t.lineups || m[3].endsWith('index.html') ? r : t.lineups
    else t.root = !t.root || m[3] === 'index.html' ? r : t.root
  }
  return byId
}

async function planEuro2000(name) {
  const rows = await query(name, 'www.uefa.com/uefaeuro/season=2000/matches/', { from: '2005', to: '2022', limit: 20000, fl: 'original,timestamp' })
  if (!rows) return { tasks: null, est: 259 }
  return { tasks: [...historyTasks(rows, Object.keys(EURO2000_ROUNDS).map(Number)).values()].sort((a, b) => Number(a.id) - Number(b.id)) }
}

function tryUefaPage(p) {
  if (!p?.text) return { why: `HTTP ${p?.status}` }
  if (isShell(p.text)) return { why: 'wayback JS shell' }
  let x
  try {
    x = parseUefaLineups(p.text)
  } catch (e) {
    return { why: 'parse error ' + e.message }
  }
  if (!x) return { why: 'no lineup box' }
  if (!x.home.starters.length || !x.away.starters.length || !x.header.home) return { why: 'empty lineup box' }
  return { x }
}

async function harvestHistory(name, task, { competition, extraTried = [] }) {
  const tried = [...extraTried]
  const cands = [task.lineups, task.root].filter(Boolean)
  let got = null
  const attempt = async (c) => {
    const p = await snap(name, c.timestamp, c.original)
    if (DRY) return null
    const r = tryUefaPage(p)
    if (r.x) return { ...r, c, p }
    tried.push({ ...c, why: r.why })
    return null
  }
  if (DRY) return cands.length ? void (await snap(name, cands[0].timestamp, cands[0].original)) : task.rootUrl ? void (await query(name, task.rootUrl, { matchType: 'exact', collapse: 'digest', limit: 6, fl: 'original,timestamp' })) : null
  // Captures of one match differ: UEFA's 2018-19 captures sometimes drop a starter that the 2011-15 root pages still
  // list (Romania v Liechtenstein 1998, FYROM v Yugoslavia 1999, Netherlands v Yugoslavia 2000), and some pages drop
  // a goal or a substitute's on-event. So each capture is ranked by the three lineup gates; a capture passing all
  // three is taken at once, otherwise the other candidates and up to two other digests of the root page are tried
  // and the best is kept (the first tried wins a tie), with the others' failures in its warnings.
  let best = null
  const rank = (g) => {
    const rec = uefaHistoryRecord(g.x, { source: name, sourceId: task.id, competition, ts: g.c.timestamp, original: g.c.original, finalUrl: g.p.finalUrl })
    const lc = lineupChecks(rec)
    return { n: [lc.starters_ok, lc.subs_ok, lc.goals_ok].filter(Boolean).length, detail: lc.detail }
  }
  const consider = (g) => {
    if (!g) return false
    g.q = rank(g)
    if (!best || g.q.n > best.q.n) best = g
    if (g.q.n === 3) return true
    tried.push({ ...g.c, why: `parsed, but ${g.q.detail}` })
    return false
  }
  for (const c of cands) if (consider(await attempt(c))) break
  if ((!best || best.q.n < 3) && (task.root || task.rootUrl)) {
    const alts = (await query(name, task.root ? bare(task.root.original) : task.rootUrl, { matchType: 'exact', collapse: 'digest', limit: 6, fl: 'original,timestamp' })) ?? []
    for (const a of alts.filter((a) => !cands.some((c) => c.timestamp === a.timestamp)).slice(0, 2)) if (consider(await attempt(a))) break
  }
  got = best
  if (got && got.q.n < 3) tried.splice(tried.findIndex((t) => t.timestamp === got.c.timestamp && t.original === got.c.original), 1) // the kept capture is not a failure
  for (let i = tried.length - 1; i >= 0; i--) if (tried[i].why === 'HTTP not cached') tried.splice(i, 1)
  if (DRY) return null
  if (!got && task.statistics && task.commentary) {
    // no lineups/root capture parses: rebuild from the statistics (squads) and commentary (events) subpages
    const a = await snap(name, task.statistics.timestamp, task.statistics.original)
    const b = await snap(name, task.commentary.timestamp, task.commentary.original)
    let x = null
    try {
      x = a?.text && b?.text && !isShell(a.text) && !isShell(b.text) ? parseUefaStatsPages(a.text, b.text) : null
    } catch (e) {
      x = null
    }
    if (x && x.header.home && !x.problems.length) {
      const rec = uefaHistoryRecord(x, { source: name, sourceId: task.id, competition, ts: task.statistics.timestamp, original: task.statistics.original, finalUrl: a.finalUrl })
      rec.receipts.push({ url: `https://web.archive.org/web/${task.commentary.timestamp}/${task.commentary.original}`, timestamp: task.commentary.timestamp, original: task.commentary.original })
      rec.round = task.round
      rec.warnings.push(...x.inferred.map((w) => `inferred: ${w}`))
      rec.warnings.push(tried.length ? `lineups/root captures failed: ${tried.map((t) => `${t.timestamp} ${t.why}`).join('; ')}` : 'lineups and root pages never archived (only 2021-22 redirects)')
      return rec
    }
    tried.push({ ...task.statistics, why: x ? `statistics+commentary fallback inconsistent: ${x.problems.join('; ')}` : 'statistics+commentary fallback did not parse' })
  }
  if (!got) return missingRecord({ source: name, sourceId: task.id, competition, tried })
  const rec = uefaHistoryRecord(got.x, { source: name, sourceId: task.id, competition, ts: got.c.timestamp, original: got.c.original, finalUrl: got.p.finalUrl })
  rec.round = task.round
  if (tried.length) rec.warnings.push(`earlier captures failed: ${tried.map((t) => `${t.timestamp} ${t.why}`).join('; ')}`)
  return rec
}

// ---------- UEFA Euro 2004 qualifiers ----------
async function planEuro2004q(name) {
  const hist = await query(name, 'www.uefa.com/uefaeuro/season=2004/matches/', { limit: 5000, fl: 'original,timestamp' })
  const live = await query(name, 'www.uefa.com/competitions/EURO/FixturesResults/Round=1579/', { from: '200312', to: '2008', limit: 3000, fl: 'original,timestamp' })
  if (!hist) return { tasks: null, est: 210 }
  const byId = historyTasks(hist, [1579, 1580])
  for (const r of live ?? []) {
    const id = r.original.match(/match=(\d+)/i)?.[1]
    if (id && !byId.has(id)) byId.set(id, { id, round: 1579, lineups: null, root: null })
  }
  return { tasks: [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id)) }
}

function tryMsPage(p) {
  if (!p?.text) return { why: `HTTP ${p?.status}` }
  if (isShell(p.text)) return { why: 'wayback JS shell' }
  let x
  try {
    x = parseUefaMs(p.text)
  } catch (e) {
    return { why: 'parse error ' + e.message }
  }
  if (x.preMatch) return { why: 'pre-match capture (lineups not yet available)' }
  if (x.teams.length !== 2 || !x.teams.every((t) => t.starters.length)) return { why: `no lineups (${x.teams.length} team tables)` }
  return { x }
}

async function harvestEuro2004q(name, task) {
  const competition = task.round === 1580 ? 'UEFA Euro 2004 qualifying play-offs' : SOURCES[name].competition
  const msUrl = `www.uefa.com/competitions/EURO/FixturesResults/Round=${task.round}/Match=${task.id}/Report=MS.html`
  const caps = await query(name, msUrl, { matchType: 'exact', collapse: 'timestamp:8', limit: 200, fl: 'original,timestamp' })
  const tried = []
  if (DRY) {
    // planned: newest MS capture, then the history fallback for a share of matches (estimated in the summary)
    planned.push({ source: name, kind: 'raw', url: 'ms:' + task.id, cached: false, estimate: true })
    return null
  }
  // Captures before kick-off say "Lineups not yet available", and so do late ones: UEFA blanked these pages after
  // the campaign. So read the match date from the newest capture (the blank template still carries it), then try
  // the earliest captures dated after the match.
  const sorted = [...(caps ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const order = []
  if (sorted.length) order.push(sorted.at(-1))
  let matchDate = null
  for (let k = 0; k < order.length && k < 4; k++) {
    const c = order[k]
    const p = await snap(name, c.timestamp, c.original)
    const r = tryMsPage(p)
    if (r.x) {
      const rec = uefaMsRecord(r.x, { source: name, sourceId: task.id, competition, ts: c.timestamp, original: c.original, finalUrl: p.finalUrl })
      rec.round = task.round
      if (tried.length) rec.warnings.push(`other captures unusable: ${tried.map((t) => `${t.timestamp} ${t.why}`).join('; ')}`)
      return rec
    }
    tried.push({ ...c, why: r.why })
    if (k === 0 && !matchDate) {
      try {
        matchDate = isoDate(parseUefaMs(p?.text ?? '').dateText)
      } catch {}
      const after = matchDate ? matchDate.replace(/-/g, '') + '235959' : null
      if (after) order.push(...sorted.filter((x) => x.timestamp > after && x !== c).slice(0, 3))
    }
  }
  if (!caps?.length) tried.push({ timestamp: '-', original: msUrl, why: 'MS page not archived' })
  const rec = await harvestHistory(name, task, { competition, extraTried: tried.filter((t) => t.timestamp !== '-') })
  rec.round = task.round
  if (rec.status === 'parsed') rec.warnings.push(`Report=MS page unusable (${tried.map((t) => t.why).join('; ')}); used the uefaeuro/season=2004 history page`)
  return rec
}

// ---------- gates ----------
let M42
function writeGates(name, recs) {
  M42 ??= loadMartj42(MARTJ42)
  const gates = recs.map((r) => ({ ...gateRecord(r, M42), receipt: r.receipts[0]?.url ?? '' }))
  fs.writeFileSync(path.join(OUT, `${name}-gates.csv`), gatesCsv(gates))
  return summarize(gates)
}

// ---------- main ----------
const KA_IDS = Object.fromEntries(Object.keys(SOURCES).map((s) => [s, KNOWN_ANSWERS.filter((k) => k.source === s).map((k) => k.id)]))
function pickPending(tasks, done) {
  const pending = tasks.filter((t) => !done.has(t.id))
  if (!Number.isFinite(LIMIT) || pending.length <= LIMIT) return pending
  const ka = pending.filter((t) => KA_IDS[progress.source]?.includes(t.id))
  const rest = pending.filter((t) => !ka.includes(t))
  const n = Math.max(0, LIMIT - ka.length)
  const step = rest.length / Math.max(1, n)
  return [...ka, ...Array.from({ length: n }, (_, i) => rest[Math.floor(i * step)])]
}

if (!DRY && !GATES_ONLY) lock()
const summary = {}
const dryRows = []
let interrupted = false
process.on('SIGINT', () => {
  interrupted = true
  console.error('\nSIGINT: finishing the current match, then saving')
})

for (const name of chosen) {
  progress = { source: name, done: 0, total: 0 }
  const recs = loadRecords(name)
  if (GATES_ONLY) {
    summary[name] = writeGates(name, recs)
    continue
  }
  const byId = new Map(recs.map((r) => [r.source_id, r]))
  // a record whose fetch was cut short by a network failure is never stored, so it is retried
  const done = new Set([...byId.keys()])
  const kind = SOURCES[name].kind
  const plan = kind === 'fifa' ? await planFifa(name) : kind === 'euro2000' ? await planEuro2000(name) : await planEuro2004q(name)
  if (!plan.tasks) {
    dryRows.push({ source: name, matches: `~${plan.est} (listing not cached)`, done: 0 })
    continue
  }
  // 1998 zone index pages list results without match links (no ids), so they are skipped
  if (name === 'fifa1998') plan.indexes = []
  const index = kind === 'fifa' && plan.indexes ? (DRY || !plan.indexes.length ? new Map() : await fifaIndexes(name, plan.indexes)) : new Map()
  if (DRY && kind === 'fifa') for (const r of plan.indexes) await want(name, 'raw', rawUrl(r.timestamp, r.original))
  const todo = REDO ? plan.tasks.filter((t) => REDO.has(t.id) && done.has(t.id)) : REBUILD ? plan.tasks.filter((t) => done.has(t.id)) : pickPending(plan.tasks, done)
  progress.total = todo.length
  if (!DRY) log(`[${name}] ${plan.tasks.length} matches archived, ${done.size} already harvested, ${todo.length} to do now`)
  let sinceSave = 0
  for (const task of todo) {
    if (interrupted) break
    let rec
    try {
      rec =
        kind === 'fifa'
          ? await harvestFifa(name, task, index)
          : kind === 'euro2000'
            ? await harvestHistory(name, task, { competition: EURO2000_ROUNDS[task.round][0] }).then((r) => (!r || r.status === 'parsed' ? r : Object.assign(r, { stage: EURO2000_ROUNDS[task.round][1] })))
            : await harvestEuro2004q(name, task)
    } catch (e) {
      log(`[${name}] match ${task.id}: ${e.message} (${REBUILD ? 'kept the previous record' : 'not stored; will retry next run'})`, REBUILD)
      continue
    }
    progress.done++
    if (DRY || !rec) continue
    annotateRecord(rec)
    for (const w of defectWarnings(rec)) if (!rec.warnings.includes(w)) rec.warnings.push(w)
    byId.set(task.id, rec)
    if (rec.status !== 'parsed') log(`[${name}] match ${task.id}: ${rec.status}: ${rec.warnings[0]}`, true)
    if (++sinceSave >= 10) {
      saveRecords(name, [...byId.values()])
      sinceSave = 0
    }
  }
  if (DRY) {
    const mine = planned.filter((p) => p.source === name)
    dryRows.push({ source: name, matches: plan.tasks.length, done: done.size, to_fetch: todo.length, cached: mine.filter((p) => p.cached).length, uncached: mine.filter((p) => !p.cached).length })
    continue
  }
  saveRecords(name, [...byId.values()])
  summary[name] = writeGates(name, [...byId.values()])
  log(`[${name}] saved ${byId.size} records; gates: ${JSON.stringify(summary[name])}`)
  if (interrupted) break
}

if (DRY) {
  // estimates for requests that depend on responses (alternate captures, Euro 2004 history fallbacks)
  // calibrated on the --limit 60 smoke run: no FIFA or Euro 2000 match needed an alternate capture; 42 of 60 Euro
  // 2004 qualifiers had only pre-match MS captures and used the history page (1-2 requests)
  const extra = { fifa1998: 0.03, fifa2002: 0.03, fifa2006: 0.03, fifa2010: 0.03, euro2000: 0.03, euro2004q: 0 }
  let tot = 0
  console.log('source      matches  harvested  to_fetch  planned_cached  planned_uncached  est_alternates  est_total_requests')
  for (const r of dryRows) {
    const todo = typeof r.matches === 'number' ? r.to_fetch : Number(String(r.matches).replace(/\D/g, ''))
    const alt = r.source === 'euro2004q' ? Math.round(todo * 0.7 * 1.3) : Math.round(todo * (extra[r.source] ?? 0.1) * 3)
    const base = r.source === 'euro2004q' ? (r.uncached ?? 0) : (r.uncached ?? todo + 1)
    const est = base + alt
    tot += est
    console.log([r.source.padEnd(10), String(r.matches).padStart(8), String(r.done).padStart(10), String(r.to_fetch ?? '?').padStart(9), String(r.cached ?? '?').padStart(15), String(r.uncached ?? '?').padStart(17), String(alt).padStart(15), String(est).padStart(19)].join(' '))
  }
  console.log(`total ≈ ${tot} requests ≈ ${(tot * 2.0 / 3600).toFixed(1)} h of throttle at 2 s (plus CDX latency, ~10-90 s per prefix query; exact queries are fast)`)
} else {
  M42 ??= loadMartj42(MARTJ42)
  const all = Object.fromEntries(Object.keys(SOURCES).map((s) => [s, loadRecords(s)]))
  const ka = runKnownAnswers(all, M42)
  fs.writeFileSync(path.join(OUT, 'known-answers.json'), JSON.stringify(ka, null, 1))
  const fullSummary = Object.fromEntries(Object.keys(SOURCES).filter((s) => all[s].length).map((s) => [s, summary[s] ?? writeGates(s, all[s])]))
  fs.writeFileSync(path.join(OUT, 'gates-summary.json'), JSON.stringify({ generated_at: new Date().toISOString(), martj42: path.relative(ROOT, MARTJ42), sources: fullSummary }, null, 1))
  console.log('\ngate pass rates (of parsed records):')
  for (const [s, g] of Object.entries(fullSummary)) {
    const pct = (k) => (g.parsed ? `${Math.round((100 * g[k]) / g.parsed)}%` : '-')
    console.log(`  ${s.padEnd(10)} records ${g.records}, parsed ${g.parsed} (unparsed ${g.unparsed}, not archived ${g.not_archived}, void ${g.void}); starters ${pct('starters_ok')}, subs ${pct('subs_ok')}, goals ${pct('goals_ok')}, martj42 ${pct('join_ok')} (${g.join_ok}/${g.parsed}, ${g.date_conflicts} on a date conflict), all four ${pct('all_ok')}`)
    // teams in matches with no martj42 row at all: an alias missing from gates.mjs, or a match martj42 lacks (see warnings)
    if (g.unmatched_teams.length) console.log(`             teams in matches with no martj42 row: ${g.unmatched_teams.join(' | ')}`)
  }
  console.log('\nknown answers:')
  for (const k of ka) {
    console.log(`  ${k.ok === null ? 'SKIP' : k.ok ? 'PASS' : 'FAIL'} ${k.name}${k.receipt ? ' <' + k.receipt + '>' : ''}`)
    for (const c of k.checks ?? []) if (!c.ok) console.log(`       ${c.label}: got ${JSON.stringify(c.got)}, want ${JSON.stringify(c.want)}`)
  }
  if (!GATES_ONLY) log(`done: ${stats.misses} requests, ${stats.hits} cache hits, ${Math.round((Date.now() - t0) / 60000)} min`)
}
