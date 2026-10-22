// Rate-limited, disk-cached client for Wikidata. Every Wikidata request in this project goes through
// this file (AGENTS.md). Hosts: query.wikidata.org (SPARQL) and www.wikidata.org (Special:EntityData).
//
//   import { sparql, entity, lockProcess, stats } from './lib/wikidata.mjs'
//   node pipeline/lib/wikidata.mjs sparql 'SELECT ?x WHERE { wd:Q42 wdt:P31 ?x }'
//   node pipeline/lib/wikidata.mjs entity Q42
//
// Rules (Wikimedia User-Agent policy + Wikidata Query Service usage policy):
// - one request at a time, at most one per WD_GAP_MS (default 1000 ms, never less), across processes
//   via a shared timestamp file guarded by a mkdir lock;
// - lockProcess() takes an exclusive PID lock: one Wikidata harvester process at a time;
// - descriptive User-Agent naming the project, the site and a contact;
// - backoff on 429 / 5xx / network errors, honouring Retry-After (seconds or HTTP date);
// - SPARQL queries run under the service's 60 s limit; a query that times out at the server is NOT retried
//   (it would time out again) but thrown as WikidataTimeout so the caller can split the batch;
// - responses cached under data/raw/wikidata/<kind>/<sha1[0:2]>/<sha1>.json keyed by the exact query or QID,
//   so reruns cost nothing. The query text is stored alongside the result.
// WD_OFFLINE=1 makes a cache miss throw instead of fetching.
// Node 22, built-ins only. Never call fetch() on Wikidata outside this file.

import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '../..')
const RAW = process.env.FC_RAW ?? path.join(ROOT, 'data/raw')
export const CACHE = path.join(RAW, 'wikidata')
const GAP_MS = Math.max(1000, Number(process.env.WD_GAP_MS ?? 1000))
const CLIENT_TIMEOUT_MS = 75_000 // server kills queries at 60 s; allow transfer time on top
export const UA =
  'football-comparator/0.3 (https://drewhoover.com; non-commercial football stats site; ' +
  'pipeline/lib/wikidata.mjs; cached, 1 req/s, one process) node/' + process.versions.node
export const SPARQL_URL = 'https://query.wikidata.org/sparql'
export const ENTITY_URL = (q) => `https://www.wikidata.org/wiki/Special:EntityData/${q}.json`

export const stats = { hits: 0, requests: 0, retries: 0, timeouts: 0, errors: 0, bytes: 0, ms: 0 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex')
export class WikidataTimeout extends Error {}

// ---- single-process lock -------------------------------------------------------------------
const PIDLOCK = path.join(CACHE, '.process.lock')
export function lockProcess(label = path.basename(process.argv[1] ?? 'node')) {
  fss.mkdirSync(CACHE, { recursive: true })
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fss.openSync(PIDLOCK, 'wx')
      fss.writeSync(fd, JSON.stringify({ pid: process.pid, label, started: new Date().toISOString() }))
      fss.closeSync(fd)
      const release = () => {
        try {
          if (JSON.parse(fss.readFileSync(PIDLOCK, 'utf8')).pid === process.pid) fss.unlinkSync(PIDLOCK)
        } catch {}
      }
      process.on('exit', release)
      for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => (release(), process.exit(130)))
      return release
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let holder = null
      try {
        holder = JSON.parse(fss.readFileSync(PIDLOCK, 'utf8'))
      } catch {}
      let alive = false
      if (holder?.pid) {
        try {
          process.kill(holder.pid, 0)
          alive = true
        } catch (err) {
          alive = err.code === 'EPERM'
        }
      }
      if (alive) throw new Error(`another Wikidata process is running: ${JSON.stringify(holder)} (lock ${PIDLOCK})`)
      fss.rmSync(PIDLOCK, { force: true })
    }
  }
  throw new Error('could not take Wikidata process lock ' + PIDLOCK)
}

// ---- cross-process throttle ----------------------------------------------------------------
const STAMP = path.join(CACHE, '.last-request')
const MUTEX = path.join(CACHE, '.throttle.lock')
let chain = Promise.resolve()
async function slot() {
  // serialise within the process, then across processes
  const p = chain.then(async () => {
    await fs.mkdir(CACHE, { recursive: true })
    for (let t = 0; ; t++) {
      try {
        await fs.mkdir(MUTEX)
        break
      } catch (e) {
        if (e.code !== 'EEXIST') throw e
        try {
          const st = await fs.stat(MUTEX)
          if (Date.now() - st.mtimeMs > 120_000) await fs.rm(MUTEX, { recursive: true, force: true })
        } catch {}
        await sleep(100)
      }
    }
    try {
      let last = 0
      try {
        last = Number(await fs.readFile(STAMP, 'utf8')) || 0
      } catch {}
      const wait = last + GAP_MS - Date.now()
      if (wait > 0) await sleep(wait)
      await fs.writeFile(STAMP, String(Date.now()))
    } finally {
      await fs.rm(MUTEX, { recursive: true, force: true })
    }
  })
  chain = p.catch(() => {})
  return p
}
// A long query occupies the host for its duration: stamp its end too, so the next request waits GAP after it.
async function stampEnd() {
  try {
    await fs.writeFile(STAMP, String(Date.now()))
  } catch {}
}

function retryAfterMs(res, attempt) {
  const h = res?.headers?.get?.('retry-after')
  if (h) {
    const s = Number(h)
    if (Number.isFinite(s)) return Math.max(1000, s * 1000)
    const d = Date.parse(h)
    if (Number.isFinite(d)) return Math.max(1000, d - Date.now())
  }
  return Math.min(300_000, 5000 * 2 ** attempt)
}

// ---- request log -----------------------------------------------------------------------------
const LOG = path.join(RAW, 'logs', 'wikidata-requests.log')
async function logLine(s) {
  try {
    await fs.mkdir(path.dirname(LOG), { recursive: true })
    await fs.appendFile(LOG, `${new Date().toISOString()} ${s}\n`)
  } catch {}
}

async function request(url, init, label) {
  if (process.env.WD_OFFLINE === '1') throw new Error(`WD_OFFLINE=1 and not cached: ${label}`)
  for (let attempt = 0; attempt < 7; attempt++) {
    await slot()
    const t0 = Date.now()
    let res
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS) })
    } catch (e) {
      await stampEnd()
      stats.requests++
      stats.retries++
      await logLine(`ERR ${label} ${e.name}: ${e.message}`)
      if (e.name === 'TimeoutError') {
        stats.timeouts++
        throw new WikidataTimeout(`client timeout after ${CLIENT_TIMEOUT_MS} ms: ${label}`)
      }
      await sleep(Math.min(120_000, 5000 * 2 ** attempt))
      continue
    }
    const text = await res.text()
    await stampEnd()
    const ms = Date.now() - t0
    stats.requests++
    stats.ms += ms
    stats.bytes += text.length
    await logLine(`${res.status} ${ms}ms ${text.length}B ${label}`)
    if (res.ok) return { status: res.status, text }
    if (
      res.status === 504 ||
      (res.status >= 500 && ms > 55_000) ||
      (/TimeoutException|timeout/i.test(text) && (res.status === 500 || res.status === 503))
    ) {
      stats.timeouts++
      throw new WikidataTimeout(`server timeout (${res.status}): ${label}`)
    }
    if (res.status === 429 || res.status >= 500) {
      stats.retries++
      const w = retryAfterMs(res, attempt)
      await logLine(`BACKOFF ${w}ms after ${res.status}`)
      await sleep(w)
      continue
    }
    stats.errors++
    const err = new Error(`HTTP ${res.status} for ${label}: ${text.slice(0, 300)}`)
    err.status = res.status
    throw err
  }
  stats.errors++
  throw new Error(`gave up after retries: ${label}`)
}

function cachePath(kind, key) {
  const h = sha1(key)
  return path.join(CACHE, kind, h.slice(0, 2), h + '.json')
}

/** Run a SPARQL SELECT; returns the bindings array, flattened to {var: value}. Cached by exact query text. */
export async function sparql(query, { label = 'sparql', raw = false } = {}) {
  const file = cachePath('sparql', query)
  let body
  try {
    body = JSON.parse(await fs.readFile(file, 'utf8'))
    stats.hits++
  } catch {
    const { text } = await request(
      SPARQL_URL,
      {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ query }).toString(),
      },
      label,
    )
    const result = JSON.parse(text)
    body = { query, label, fetched: new Date().toISOString(), result }
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(body))
  }
  if (raw) return body.result
  return body.result.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])))
}

/** Fetch one entity's JSON from Special:EntityData. Cached by QID. */
export async function entity(qid) {
  const file = cachePath('entity', qid)
  try {
    const j = JSON.parse(await fs.readFile(file, 'utf8'))
    stats.hits++
    return j
  } catch {}
  const { text } = await request(ENTITY_URL(qid), { headers: { 'User-Agent': UA, Accept: 'application/json' } }, 'entity ' + qid)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, text)
  return JSON.parse(text)
}

export const qid = (uri) => (uri ? String(uri).replace(/^.*\/entity\//, '') : uri)

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, arg] = process.argv.slice(2)
  const out = cmd === 'entity' ? await entity(arg) : await sparql(arg, { label: 'cli' })
  console.log(JSON.stringify(out, null, 1).slice(0, 4000))
  console.error(JSON.stringify(stats))
}
