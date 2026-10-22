// Rate-limited, disk-cached client for ESPN's undocumented soccer JSON API.
// Every probe in research/ goes through this file so the total request rate stays polite.
//
//   import { scoreboard, summary, get } from './espn.mjs'
//   node espn.mjs esp.1 scoreboard 20041016
//   node espn.mjs esp.1 summary 166495
//
// Rules: one request at a time per process, ESPN_GAP_MS between requests (default 1100 ms),
// exponential backoff on 429 and 5xx, every response cached under research/espn/cache/ so a
// re-run costs nothing. Set ESPN_GAP_MS higher if two processes run at once.

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RAW = process.env.FC_RAW ?? path.resolve(HERE, '../../data/raw')
const CACHE = path.join(RAW, 'espn')
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'
const GAP_MS = Number(process.env.ESPN_GAP_MS ?? 1100)
const UA = 'football-comparator research (drewhoover.com; polite, cached, ~1 req/s)'

let last = 0
let chain = Promise.resolve()
export const stats = { hits: 0, misses: 0, retries: 0 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchThrottled(url) {
  const wait = last + GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  last = Date.now()
  return fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
}

async function fetchWithBackoff(url) {
  const delays = [5_000, 15_000, 45_000, 120_000]
  for (let attempt = 0; ; attempt++) {
    const res = await fetchThrottled(url)
    if (res.ok) return res.text()
    if (res.status === 404) return null
    if ((res.status === 429 || res.status >= 500) && attempt < delays.length) {
      stats.retries++
      console.error(`espn ${res.status} on ${url}; backing off ${delays[attempt] / 1000}s`)
      await sleep(delays[attempt])
      continue
    }
    throw new Error(`espn ${res.status} ${url}`)
  }
}

/** Cache file for an absolute ESPN URL (the key is the sha1 of the exact URL). */
export function cacheFile(url) {
  const key = crypto.createHash('sha1').update(url).digest('hex')
  return path.join(CACHE, key.slice(0, 2), key + '.json')
}

/** The cache is keyed by sha1(url) and each file holds only the response body, so without this
 *  manifest the files are opaque. One line per fetch: {sha1, url, status, bytes, fetchedAt}.
 *  pipeline/backfill-espn-manifest.mjs rebuilds it from the bodies for files fetched before it existed. */
export const MANIFEST = path.join(CACHE, 'manifest.jsonl')
async function manifest(url, file, status, bytes) {
  const sha1 = path.basename(file, '.json')
  const line = JSON.stringify({ sha1, url, status, bytes, fetchedAt: new Date().toISOString() }) + '\n'
  await fs.appendFile(MANIFEST, line).catch(() => {})
}

/** True when the response for this path (under the soccer base) is already on disk. No request. */
export const isCached = (pathAndQuery) => existsSync(cacheFile(BASE + pathAndQuery))

/** GET an absolute ESPN URL. Returns parsed JSON, or null on 404. Cached forever.
 *  Shares the per-process throttle chain and the disk cache with get().
 *  opts.nocache: skip the cache read, fetch, and overwrite the cached copy (for a running
 *  season's scoreboards, whose URL never changes but whose content does). */
export function getUrl(url, opts = {}) {
  const file = cacheFile(url)
  const run = async () => {
    if (!opts.nocache) {
      try {
        const cached = await fs.readFile(file, 'utf8')
        stats.hits++
        return cached === 'null' ? null : JSON.parse(cached)
      } catch {}
    }
    stats.misses++
    const text = await fetchWithBackoff(url)
    await fs.mkdir(path.dirname(file), { recursive: true })
    // Write to a temp file and rename, so a killed process never leaves a truncated cache entry.
    const write = async (body) => {
      const tmp = `${file}.${process.pid}.tmp`
      await fs.writeFile(tmp, body)
      await fs.rename(tmp, file)
    }
    if (text === null) {
      await write('null')
      await manifest(url, file, 404, 4)
      return null
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(`espn non-JSON response for ${url}: ${text.slice(0, 120)}`)
    }
    await write(text)
    await manifest(url, file, 200, Buffer.byteLength(text))
    return parsed
  }
  // Serialize all requests in this process so the gap is honoured.
  const p = chain.then(run, run)
  chain = p.catch(() => {})
  return p
}

/** GET a path under the soccer site API. Returns parsed JSON, or null on 404. Cached forever. */
export const get = (pathAndQuery, opts) => getUrl(BASE + pathAndQuery, opts)

/** All events on one calendar day for a league slug (YYYYMMDD). */
export const scoreboard = (slug, yyyymmdd) => get(`${slug}/scoreboard?dates=${yyyymmdd}&limit=200`)

/** Full match summary (rosters with starter/sub flags, stats, keyEvents). */
export const summary = (slug, eventId) => get(`${slug}/summary?event=${eventId}`)

/** Days from a (inclusive) to b (inclusive), as YYYYMMDD strings. */
export function days(from, to) {
  const out = []
  const d = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10).replaceAll('-', ''))
  }
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [slug, kind, arg] = process.argv.slice(2)
  if (!slug || !kind || !arg) {
    console.error('usage: node espn.mjs <slug> scoreboard <YYYYMMDD> | summary <eventId>')
    process.exit(2)
  }
  const data = kind === 'scoreboard' ? await scoreboard(slug, arg) : await summary(slug, arg)
  console.log(JSON.stringify(data, null, 2))
  console.error(JSON.stringify(stats))
}
