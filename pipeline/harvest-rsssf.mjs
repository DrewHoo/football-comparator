#!/usr/bin/env node
// Harvest RSSSF's per-player international cap logs into the raw cache (data/raw/rsssf/).
//
//   node pipeline/harvest-rsssf.mjs                      # indexes (depth 1) + every log in the TSV
//   node pipeline/harvest-rsssf.mjs --limit 30           # first 30 logs only
//   node pipeline/harvest-rsssf.mjs --only cronaldo-intlg.html,messi-intlg.html --index-depth 0
//   node pipeline/harvest-rsssf.mjs --include-discovered # also fetch log links found in the indexes but not in the TSV
//   node pipeline/harvest-rsssf.mjs --refresh-seeded     # re-fetch pages whose cache entry was seeded, not fetched here (resumable)
//   node pipeline/harvest-rsssf.mjs --refresh            # re-fetch everything, cached or not (not resumable: restarts from zero)
//   node pipeline/harvest-rsssf.mjs --seed <dir> --seed-note "..."  # import already-fetched pages by basename, no network
//
// Resumable: every response is cached by URL, so a killed run picks up where it stopped.
// One RSSSF process at a time (PID lock in rsssf.mjs). Progress every 100 pages to data/raw/logs/harvest-rsssf.log.
//
// Discovery (how the 4,697 logs were found; rerun to pick up new ones):
//   https://www.rsssf.org/intlp-countrywise.html            -> ~190 per-country pages miscellaneous/<cc>-recintlp.html
//   https://www.rsssf.org/miscellaneous/century.html        (century of caps / goals lists)
//   https://www.rsssf.org/miscellaneous/intl-app-trivia.html
//   https://www.rsssf.org/miscellaneous/intl-goals-trivia.html
// A log is any linked page whose name matches /-intlg?\.html$/ or /^isra-intlp-/. The old /players/ tree is a
// 2008 club archive with no cap logs (research/intl-gap.md §4), so it is not crawled.

import fs from 'node:fs'
import path from 'node:path'
import { get, seed, lockProcess, stats, decode, canon, cachedMeta, ROOT } from './lib/rsssf.mjs'

const args = process.argv.slice(2)
const flag = (k) => args.includes(k)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)

const TSV = opt('--tsv', path.join(ROOT, 'research/intl/rsssf-player-logs.tsv'))
const LIMIT = Number(opt('--limit', Infinity))
const ONLY = opt('--only', null)?.split(',').map((s) => s.trim())
const DEPTH = Number(opt('--index-depth', 1))
const REFRESH = flag('--refresh')
const REFRESH_SEEDED = flag('--refresh-seeded')
const getOpts = { refresh: REFRESH, refreshIf: REFRESH_SEEDED ? (m) => String(m.via ?? '').startsWith('seed') : undefined }
const SEED = opt('--seed', null)
const SEED_NOTE = opt('--seed-note', 'seed: pre-fetched copy')
const LOGF = path.join(ROOT, 'data/raw/logs/harvest-rsssf.log')
const DISC = path.join(ROOT, 'data/raw/rsssf/discovered-logs.tsv')

fs.mkdirSync(path.dirname(LOGF), { recursive: true })
const log = (s) => {
  const line = `${new Date().toISOString()} ${s}`
  console.log(line)
  fs.appendFileSync(LOGF, line + '\n')
}

export const INDEX_ROOTS = [
  'https://www.rsssf.org/intlp-countrywise.html',
  'https://www.rsssf.org/miscellaneous/century.html',
  'https://www.rsssf.org/miscellaneous/intl-app-trivia.html',
  'https://www.rsssf.org/miscellaneous/intl-goals-trivia.html',
]
export const isLogName = (b) => /-intlg?\.html$/i.test(b) || /^isra-intlp-/i.test(b)

function readTsv(file) {
  const [head, ...rows] = fs.readFileSync(file, 'utf8').trim().split('\n')
  const cols = head.split('\t')
  return rows.map((r) => Object.fromEntries(r.split('\t').map((v, i) => [cols[i], v])))
}

function links(html, base) {
  const out = []
  for (const m of html.matchAll(/href\s*=\s*["']?([^"'\s>]+)/gi)) {
    const h = m[1]
    if (/^(mailto:|javascript:)/i.test(h)) continue
    try {
      out.push(canon(new URL(h, base).href))
    } catch {}
  }
  return out
}

const release = SEED ? null : lockProcess('harvest-rsssf')
const started = Date.now()
const tsv = readTsv(TSV)
let targets = tsv.map((r) => canon(r.url))
if (ONLY) targets = targets.filter((u) => ONLY.includes(u.split('/').pop()))
targets = targets.slice(0, LIMIT)

// ---- seeding: import pages another process already fetched (no network) -------------------
if (SEED) {
  let n = 0
  for (const u of tsv.map((r) => canon(r.url))) {
    const f = path.join(SEED, u.split('/').pop())
    if (!fs.existsSync(f)) continue
    const st = fs.statSync(f)
    if (await seed(u, fs.readFileSync(f), SEED_NOTE, st.mtime.toISOString())) n++
  }
  log(`seed: imported ${n} pages from ${SEED} (${SEED_NOTE}); ${tsv.length - n} not imported (already cached or absent)`)
  process.exit(0)
}

log(`start: ${targets.length} logs from ${path.relative(ROOT, TSV)}, index depth ${DEPTH}, refresh=${REFRESH} refresh-seeded=${REFRESH_SEEDED}`)

// ---- 1. index pages (discovery) ---------------------------------------------------------
const discovered = new Map() // url -> Set(linked_from)
const indexUrls = [...INDEX_ROOTS]
const seenIdx = new Set()
if (DEPTH >= 0 && !flag('--no-indexes')) {
  for (let i = 0; i < indexUrls.length; i++) {
    const u = indexUrls[i]
    if (seenIdx.has(u)) continue
    seenIdx.add(u)
    const r = await get(u, getOpts)
    if (!r.body) {
      log(`index ${r.status} ${u}`)
      continue
    }
    for (const l of links(decode(r.body), u)) {
      if (!/^https:\/\/www\.rsssf\.org\/miscellaneous\/[^/]+\.html$/i.test(l) && !/^https:\/\/www\.rsssf\.org\/[^/]+\.html$/i.test(l)) continue
      const b = l.split('/').pop()
      if (isLogName(b)) {
        if (!discovered.has(l)) discovered.set(l, new Set())
        discovered.get(l).add(u.replace('https://www.rsssf.org/', ''))
      } else if (DEPTH >= 1 && u === INDEX_ROOTS[0] && /\/miscellaneous\//.test(l)) {
        indexUrls.push(l) // per-country record pages and the other listings hanging off intlp-countrywise
      }
    }
  }
  const inTsv = new Set(tsv.map((r) => canon(r.url)))
  const lines = ['url\tin_tsv\tlinked_from']
  for (const [u, from] of [...discovered].sort()) lines.push(`${u}\t${inTsv.has(u) ? 1 : 0}\t${[...from].join(' ')}`)
  const missingFromIdx = [...inTsv].filter((u) => !discovered.has(u)).length
  fs.writeFileSync(DISC, lines.join('\n') + '\n')
  log(
    `indexes: ${seenIdx.size} pages, ${discovered.size} log links (${[...discovered.keys()].filter((u) => !inTsv.has(u)).length} not in TSV; ` +
      `${missingFromIdx} TSV logs not linked from these indexes${DEPTH < 1 ? ' — expected at depth 0' : ''}) -> ${path.relative(ROOT, DISC)}`,
  )
  if (flag('--include-discovered')) for (const u of discovered.keys()) if (!inTsv.has(u)) targets.push(u)
}

// ---- 2. the logs ------------------------------------------------------------------------
let done = 0,
  fetched = 0,
  bad = []
for (const u of targets) {
  let r
  try {
    r = await get(u, getOpts)
  } catch (e) {
    bad.push(`${u} ERR ${e.message}`)
    log(`error ${u}: ${e.message}`)
    continue
  }
  done++
  if (!r.cached) fetched++
  if (r.status !== 200) bad.push(`${u} ${r.status}`)
  if (done % 100 === 0 || done === targets.length) {
    const el = (Date.now() - started) / 1000
    log(`progress ${done}/${targets.length} (fetched ${fetched}, cached ${done - fetched}, non-200 ${bad.length}) ${Math.round(el)}s elapsed; ${JSON.stringify(stats)}`)
  }
}
log(`done: ${done} logs, ${fetched} fetched this run, ${bad.length} problems${bad.length ? ': ' + bad.slice(0, 20).join('; ') : ''}`)
release?.()
