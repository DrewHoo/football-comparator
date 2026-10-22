// Rate-limited, disk-cached client for rsssf.org. Every RSSSF request in this project goes through
// this file (AGENTS.md). rsssf.org is a static site run by volunteers: be gentle.
//
//   import { get, lockProcess, stats, cachedPaths } from './lib/rsssf.mjs'
//   node pipeline/lib/rsssf.mjs get https://www.rsssf.org/miscellaneous/cronaldo-intlg.html
//
// Rules (modelled on research/wayback/wb.mjs):
// - one request at a time, at most one request per RSSSF_GAP_MS (default 2000 ms), enforced across
//   processes by a mkdir lock + shared timestamp file in the cache dir;
// - lockProcess() takes an exclusive PID lock so only ONE RSSSF process runs at a time
//   (a second harvester refuses to start while the first is alive);
// - exponential backoff on 429 / 5xx / network errors, honouring Retry-After (seconds or HTTP date);
// - every response cached under data/raw/rsssf/<sha1[0:2]>/<sha1(url)>.{json,bin}, keyed by the exact URL,
//   so reruns cost nothing; 404/403/410 are cached as misses. Raw bytes are stored untouched.
// Node 22, built-ins only. Never call fetch() on rsssf.org outside this file.

import fs from 'node:fs/promises'
import fss from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '../..')
const RAW = process.env.FC_RAW ?? path.join(ROOT, 'data/raw')
export const CACHE = path.join(RAW, 'rsssf')
const GAP_MS = Math.max(2000, Number(process.env.RSSSF_GAP_MS ?? 2000)) // never faster than 1 per 2 s
export const UA =
  'football-comparator/0.3 (pipeline/lib/rsssf.mjs; non-commercial football stats site drewhoover.com; ' +
  'RSSSF acknowledged as source; cached, 1 req/2s; contact via drewhoover.com)'

export const stats = { hits: 0, misses: 0, retries: 0, notFound: 0, seeded: 0 }
let last = 0
let chain = Promise.resolve()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- single-process lock -------------------------------------------------------------------
const PIDLOCK = path.join(CACHE, '.process.lock')
/** Take the exclusive "one RSSSF process at a time" lock. Throws if another live process holds it. */
export function lockProcess(label = path.basename(process.argv[1] ?? 'node')) {
  fss.mkdirSync(CACHE, { recursive: true })
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fss.openSync(PIDLOCK, 'wx')
      fss.writeSync(fd, JSON.stringify({ pid: process.pid, label, started: new Date().toISOString() }))
      fss.closeSync(fd)
      const release = () => {
        try {
          const cur = JSON.parse(fss.readFileSync(PIDLOCK, 'utf8'))
          if (cur.pid === process.pid) fss.unlinkSync(PIDLOCK)
        } catch {}
      }
      process.on('exit', release)
      for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'])
        process.on(sig, () => {
          release()
          process.exit(130)
        })
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
      if (alive) throw new Error(`another RSSSF process is running: ${JSON.stringify(holder)} (lock ${PIDLOCK})`)
      fss.rmSync(PIDLOCK, { force: true }) // stale lock from a crashed process
    }
  }
  throw new Error('could not take RSSSF process lock ' + PIDLOCK)
}

// ---- cross-process throttle (belt and braces; the PID lock should already make it single) ----
const LOCK = path.join(CACHE, '.lock')
const STAMP = path.join(CACHE, '.last-request')
async function acquireSlot() {
  await fs.mkdir(CACHE, { recursive: true })
  for (;;) {
    try {
      await fs.mkdir(LOCK)
      break
    } catch {
      try {
        const st = await fs.stat(LOCK)
        if (Date.now() - st.mtimeMs > 30_000) await fs.rmdir(LOCK).catch(() => {})
      } catch {}
      await sleep(100 + Math.random() * 200)
    }
  }
  try {
    let prev = last
    try {
      prev = Math.max(prev, Number(await fs.readFile(STAMP, 'utf8')) || 0)
    } catch {}
    const wait = prev + GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    last = Date.now()
    await fs.writeFile(STAMP, String(last))
  } finally {
    await fs.rmdir(LOCK).catch(() => {})
  }
}

function retryAfterMs(h) {
  if (!h) return 0
  const n = Number(h)
  if (Number.isFinite(n)) return n * 1000
  const t = Date.parse(h)
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : 0
}

async function fetchWithBackoff(url) {
  if (!/^https?:\/\/(www\.)?rsssf\.(org|com)\//i.test(url)) throw new Error('rsssf.mjs only fetches rsssf.org: ' + url)
  const delays = [10_000, 30_000, 90_000, 180_000, 300_000]
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      await acquireSlot()
      res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(60_000) })
    } catch (e) {
      if (attempt < delays.length) {
        stats.retries++
        console.error(`rsssf network error ${e.message} on ${url}; backing off ${delays[attempt] / 1000}s`)
        await sleep(delays[attempt])
        continue
      }
      throw e
    }
    if (res.ok) return { status: res.status, finalUrl: res.url, body: Buffer.from(await res.arrayBuffer()), headers: res.headers }
    if (res.status === 404 || res.status === 403 || res.status === 410) {
      stats.notFound++
      await res.arrayBuffer().catch(() => {})
      return { status: res.status, finalUrl: res.url, body: null, headers: res.headers }
    }
    if ((res.status === 429 || res.status >= 500) && attempt < delays.length) {
      stats.retries++
      const d = Math.max(delays[attempt], retryAfterMs(res.headers.get('retry-after')))
      console.error(`rsssf ${res.status} on ${url}; backing off ${Math.round(d / 1000)}s`)
      await res.arrayBuffer().catch(() => {})
      await sleep(d)
      continue
    }
    throw new Error(`rsssf ${res.status} ${url}`)
  }
}

/** Normalise an RSSSF URL so http/https and rsssf.com/rsssf.org map to one cache key. */
export function canon(url) {
  return url.trim().replace(/^http:\/\//i, 'https://').replace(/^https:\/\/(www\.)?rsssf\.(org|com)\//i, 'https://www.rsssf.org/').split('#')[0]
}

export function cachedPaths(url) {
  const key = crypto.createHash('sha1').update(canon(url)).digest('hex')
  const dir = path.join(CACHE, key.slice(0, 2))
  return { dir, meta: path.join(dir, key + '.json'), body: path.join(dir, key + '.bin') }
}

/** Cached metadata for url, or null if never fetched. */
export async function cachedMeta(url) {
  try {
    return JSON.parse(await fs.readFile(cachedPaths(url).meta, 'utf8'))
  } catch {
    return null
  }
}

/** Raw cached bytes for url (Buffer) or null. Never touches the network. */
export async function cachedBody(url) {
  const m = await cachedMeta(url)
  if (!m || m.status >= 300) return null
  return fs.readFile(cachedPaths(url).body)
}

/**
 * GET url through the throttle + cache. opts.refresh re-fetches even if cached;
 * opts.refreshIf(meta) re-fetches only cached entries the predicate picks (e.g. seeded copies).
 * Returns {url, status, finalUrl, fetchedAt, bytes, sha1, cached, body (Buffer|null)}.
 */
export function get(url, opts = {}) {
  url = canon(url)
  const p = cachedPaths(url)
  const run = async () => {
    if (!opts.refresh) {
      try {
        const m = JSON.parse(await fs.readFile(p.meta, 'utf8'))
        if (opts.refreshIf?.(m)) throw new Error('refresh')
        stats.hits++
        const body = m.status < 300 ? await fs.readFile(p.body) : null
        return { ...m, body, cached: true }
      } catch {}
    }
    stats.misses++
    const r = await fetchWithBackoff(url)
    await fs.mkdir(p.dir, { recursive: true })
    const m = {
      url,
      status: r.status,
      finalUrl: r.finalUrl,
      fetchedAt: new Date().toISOString(),
      lastModified: r.headers.get('last-modified'),
      contentType: r.headers.get('content-type'),
      bytes: r.body?.length ?? 0,
      sha1: r.body ? crypto.createHash('sha1').update(r.body).digest('hex') : null,
      via: 'rsssf.mjs',
    }
    if (r.body) await fs.writeFile(p.body, r.body)
    await fs.writeFile(p.meta, JSON.stringify(m))
    return { ...m, body: r.body, cached: false }
  }
  const out = chain.then(run, run)
  chain = out.catch(() => {})
  return out
}

/**
 * Import bytes fetched earlier by someone else (no network). Only writes if url is not cached yet.
 * meta.via records provenance, e.g. 'seed: gap-agent scratch fetch 2026-10-21'.
 */
export async function seed(url, buf, provenance, fetchedAt) {
  url = canon(url)
  const p = cachedPaths(url)
  try {
    await fs.access(p.meta)
    return false
  } catch {}
  await fs.mkdir(p.dir, { recursive: true })
  await fs.writeFile(p.body, buf)
  await fs.writeFile(
    p.meta,
    JSON.stringify({
      url,
      status: 200,
      finalUrl: url,
      fetchedAt,
      bytes: buf.length,
      sha1: crypto.createHash('sha1').update(buf).digest('hex'),
      via: provenance,
    }),
  )
  stats.seeded++
  return true
}

/** Decode RSSSF bytes: BOM-aware, meta charset if declared, UTF-8 if valid, else windows-1252. */
export function decode(buf) {
  if (!buf) return null
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf)
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf)
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder('utf-8').decode(buf.subarray(3))
  // A batch of German logs is UTF-16LE without a BOM: NUL in most odd bytes.
  let zOdd = 0,
    zEven = 0
  const n = Math.min(buf.length, 4000)
  for (let i = 0; i < n; i++) if (buf[i] === 0) i % 2 ? zOdd++ : zEven++
  if (zOdd > n / 4) return new TextDecoder('utf-16le').decode(buf)
  if (zEven > n / 4) return new TextDecoder('utf-16be').decode(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, url] = process.argv.slice(2)
  if (cmd !== 'get' || !url) {
    console.error('usage: node pipeline/lib/rsssf.mjs get <rsssf url>')
    process.exit(2)
  }
  lockProcess('rsssf.mjs get')
  const r = await get(url)
  console.log(r.status, r.cached ? 'cached' : 'fetched', r.bytes, r.finalUrl)
  console.error(JSON.stringify(stats))
}
