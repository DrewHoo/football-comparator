// Copied from research/wayback/wb.mjs for the pipeline (same cache dir and lock, so the 2 s gap is shared).
// Adds WB_OFFLINE=1: throw instead of fetching on a cache miss, and isCached(url).
// Rate-limited, disk-cached client for the Internet Archive's Wayback Machine.
// Every request in research/wayback/ goes through this file so the total rate stays polite.
//
//   import { cdx, raw, available, get } from './wb.mjs'
//   node wb.mjs cdx 'news.bbc.co.uk/sport1/hi/football/internationals/' 50
//   node wb.mjs raw 20041014000000 'http://news.bbc.co.uk/sport1/hi/football/internationals/3739170.stm'
//
// Rules: one request at a time per process, WB_GAP_MS between requests (default 2000 ms),
// exponential backoff on 429 / 5xx / network errors, every response cached under
// research/wayback/cache/ so a re-run costs nothing. 404 is cached as a miss.
// The gap is enforced across processes (lock + timestamp file), so parallel scripts share one budget.

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RAW = process.env.FC_RAW ?? path.resolve(HERE, '../../../data/raw')
const CACHE = path.join(RAW, 'wayback')
const GAP_MS = Number(process.env.WB_GAP_MS ?? 2000)
const UA = 'football-comparator-research/0.2 (wb.mjs; drewhoover.com; agent: claude-opus-5-5; cached, 1 req/2s)'

let last = 0
let chain = Promise.resolve()
export const stats = { hits: 0, misses: 0, retries: 0, notFound: 0 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Cross-process throttle: several scripts may run at once, but together they never start more
// than one request per GAP_MS. A mkdir lock guards a shared timestamp file in the cache dir.
const LOCK = path.join(CACHE, '.lock')
const STAMP = path.join(CACHE, '.last-request')
async function acquireSlot() {
  await fs.mkdir(CACHE, { recursive: true })
  for (let i = 0; ; i++) {
    try {
      await fs.mkdir(LOCK)
      break
    } catch {
      // stale lock (holder crashed) after 30 s
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

async function fetchThrottled(url) {
  await acquireSlot()
  return fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(120_000) })
}

async function fetchWithBackoff(url) {
  const delays = [10_000, 30_000, 90_000, 180_000]
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetchThrottled(url)
    } catch (e) {
      if (attempt < delays.length) {
        stats.retries++
        console.error(`wb network error ${e.message} on ${url}; backing off ${delays[attempt] / 1000}s`)
        await sleep(delays[attempt])
        continue
      }
      throw e
    }
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      return { status: res.status, finalUrl: res.url, body: buf }
    }
    if (res.status === 404 || res.status === 403 || res.status === 410) {
      stats.notFound++
      return { status: res.status, finalUrl: res.url, body: null }
    }
    if ((res.status === 429 || res.status >= 500) && attempt < delays.length) {
      stats.retries++
      const ra = Number(res.headers.get('retry-after'))
      const d = Math.max(delays[attempt], Number.isFinite(ra) ? ra * 1000 : 0)
      console.error(`wb ${res.status} on ${url}; backing off ${d / 1000}s`)
      await sleep(d)
      continue
    }
    throw new Error(`wb ${res.status} ${url}`)
  }
}

function cachePaths(url) {
  const key = crypto.createHash('sha1').update(url).digest('hex')
  const dir = path.join(CACHE, key.slice(0, 2))
  return { meta: path.join(dir, key + '.json'), body: path.join(dir, key + '.bin') }
}

/** True when url is already in the disk cache (no request). */
export async function isCached(url) {
  try { await fs.access(cachePaths(url).meta); return true } catch { return false }
}

/** URL that cdx(pattern, opts) would request (for cache checks and dry-run counting). */
export function cdxUrl(pattern, opts = {}) {
  const q = new URLSearchParams({ url: pattern, output: 'json' })
  const o = { matchType: 'prefix', collapse: 'urlkey', filter: 'statuscode:200', ...opts }
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === false) continue
    for (const x of [].concat(v)) q.append(k, String(x))
  }
  return 'http://web.archive.org/cdx/search/cdx?' + q.toString()
}
export const rawUrl = (timestamp, url) => `https://web.archive.org/web/${timestamp}id_/${url}`

/** GET any URL through the throttle + cache. Returns {status, finalUrl, text, cached} (text null on 404). */
export function get(url) {
  const { meta, body } = cachePaths(url)
  const run = async () => {
    try {
      const m = JSON.parse(await fs.readFile(meta, 'utf8'))
      stats.hits++
      const buf = m.status < 300 ? await fs.readFile(body) : null
      return { ...m, text: buf ? decode(buf, m.charset) : null, cached: true }
    } catch {}
    stats.misses++
    if (process.env.WB_OFFLINE === '1') { const e = new Error('offline: not cached ' + url); e.offline = true; throw e }
    const r = await fetchWithBackoff(url)
    await fs.mkdir(path.dirname(meta), { recursive: true })
    const charset = r.body ? sniffCharset(r.body) : null
    const m = { url, status: r.status, finalUrl: r.finalUrl, charset, fetchedAt: new Date().toISOString() }
    if (r.body) await fs.writeFile(body, r.body)
    await fs.writeFile(meta, JSON.stringify(m))
    return { ...m, text: r.body ? decode(r.body, charset) : null, cached: false }
  }
  const p = chain.then(run, run)
  chain = p.catch(() => {})
  return p
}

function sniffCharset(buf) {
  const head = buf.subarray(0, 4096).toString('latin1')
  const m = head.match(/charset=["']?([\w-]+)/i)
  return m ? m[1].toLowerCase() : 'utf-8'
}
function decode(buf, charset) {
  let out
  try {
    out = new TextDecoder(charset || 'utf-8').decode(buf)
  } catch {
    out = new TextDecoder('utf-8').decode(buf)
  }
  // Many 2000s pages declare (or are sniffed as) UTF-8 but are really Latin-1 / Windows-1252.
  // If strict UTF-8 decoding produced replacement characters, fall back to windows-1252.
  if (out.includes('\uFFFD')) {
    const bad = out.split('\uFFFD').length - 1
    if (bad > 2) return new TextDecoder('windows-1252').decode(buf)
  }
  return out
}

/**
 * CDX query. pattern is a URL or prefix (no scheme needed). opts: matchType (prefix|exact|host|domain),
 * from, to (YYYY[MMDD...]), limit, filter (string or array), collapse, fl, page, showResumeKey, resumeKey.
 * Returns an array of row objects keyed by the header row.
 */
export async function cdx(pattern, opts = {}) {
  const r = await get(cdxUrl(pattern, opts))
  if (!r.text || !r.text.trim()) return []
  let rows
  try {
    rows = JSON.parse(r.text)
  } catch {
    throw new Error('cdx non-JSON: ' + r.text.slice(0, 200))
  }
  if (!rows.length) return []
  const [head, ...rest] = rows
  return rest.filter((x) => x.length === head.length).map((x) => Object.fromEntries(head.map((h, i) => [h, x[i]])))
}

/** Number of CDX pages for a pattern (pagination API). */
export async function cdxPages(pattern, opts = {}) {
  const q = new URLSearchParams({ url: pattern, showNumPages: 'true', matchType: opts.matchType ?? 'prefix' })
  const r = await get('http://web.archive.org/cdx/search/cdx?' + q.toString())
  return Number((r.text || '').trim())
}

/** Raw archived bytes (no Wayback toolbar / URL rewriting) of url at or near timestamp. */
export const raw = (timestamp, url) => get(rawUrl(timestamp, url))

/** Wayback Availability API: closest snapshot to timestamp. */
export async function available(url, timestamp) {
  const q = new URLSearchParams({ url })
  if (timestamp) q.set('timestamp', timestamp)
  const r = await get('https://archive.org/wayback/available?' + q.toString())
  return r.text ? JSON.parse(r.text) : null
}

/** Strip tags to text, collapsing whitespace. */
export function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [kind, a, b, c] = process.argv.slice(2)
  let out
  if (kind === 'cdx') out = await cdx(a, { limit: b ?? 50, ...(c ? JSON.parse(c) : {}) })
  else if (kind === 'pages') out = await cdxPages(a)
  else if (kind === 'raw') out = (await raw(a, b)).text
  else if (kind === 'text') out = text((await raw(a, b)).text ?? '')
  else if (kind === 'avail') out = await available(a, b)
  else {
    console.error('usage: node wb.mjs cdx <pattern> [limit] [optsJSON] | pages <pattern> | raw|text <ts> <url> | avail <url> [ts]')
    process.exit(2)
  }
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1))
  console.error(JSON.stringify(stats))
}
