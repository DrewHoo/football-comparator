// Cache reads and the one guarded fetch path for pipeline/fill-espn.mjs.
//
// Reads use cacheFile()/MANIFEST from research/espn/espn.mjs (sha1 of the exact URL, body only).
// The only way to reach the network is Fetcher.get() with dryRun false, and even then getUrl() is
// loaded by a dynamic import inside that branch, so a dry run never touches it. ESPN_GAP_MS must be
// set before espn.mjs is first imported (it reads the env at module load): fill-espn.mjs does that.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { cacheFile, MANIFEST } from '../../../research/espn/espn.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'
export const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer/'
export const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/soccer/'

// ---- URL builders. Core URLs are cached as https with the query stripped, which is how the probe
// fetched them (an eventlog's $refs are http and carry ?lang=en&region=us: canonCore() fixes both).
export const canonCore = (ref) => String(ref?.$ref ?? ref ?? '').replace(/^http:/, 'https:').replace(/\?.*$/, '')
export const statUrl = (league, event, team, athlete) =>
  `${CORE}leagues/${league}/events/${event}/competitions/${event}/competitors/${team}/roster/${athlete}/statistics/0`
export const eventlogUrl = (year, athlete) => `${CORE}leagues/all/seasons/${year}/athletes/${athlete}/eventlog?limit=300`
export const athleteUrl = (athlete) => `${CORE}athletes/${athlete}`
export const summaryUrl = (slug, event) => `${SITE}${slug}/summary?event=${event}`
export const yearScoreboardUrl = (slug, year) => `${SITE}${slug}/scoreboard?dates=${year}&limit=1000` // = pipeline/lib/espn-index.mjs yearUrl
export const teamRosterUrl = (slug, team, season) => `${SITE}${slug}/teams/${team}/roster?season=${season}`

/** {state:'ok', body} | {state:'empty'} (cached 404) | {state:'pending'} (not on disk) | {state:'corrupt'} */
export function readCached(url) {
  let text
  try { text = fs.readFileSync(cacheFile(url), 'utf8') } catch { return { state: 'pending' } }
  if (text === 'null') return { state: 'empty', body: null }
  try { return { state: 'ok', body: JSON.parse(text) } } catch { return { state: 'corrupt' } }
}
export const isCachedUrl = (url) => fs.existsSync(cacheFile(url))

let manifestIdx = null
/** fetchedAt for a cached URL: the manifest line if there is one, else the cache file's mtime. */
export function fetchedAt(url) {
  if (!manifestIdx) {
    manifestIdx = new Map()
    try {
      for (const l of fs.readFileSync(MANIFEST, 'utf8').split('\n')) {
        if (!l) continue
        try { const m = JSON.parse(l); manifestIdx.set(m.sha1, m.fetchedAt) } catch {}
      }
    } catch {}
  }
  const f = cacheFile(url)
  const hit = manifestIdx.get(path.basename(f, '.json'))
  if (hit) return hit
  try { return fs.statSync(f).mtime.toISOString() } catch { return null }
}

/** Is another ESPN process alive? One process per host (AGENTS.md). */
export function espnHostBusy() {
  try {
    const out = execFileSync('pgrep', ['-fl', 'harvest-espn.mjs|espn.mjs|core-[a-z0-9]+\\.mjs'], { encoding: 'utf8' })
    return out.split('\n').filter((l) => l && !l.includes(String(process.pid)) && !/pgrep/.test(l))
  } catch { return [] } // pgrep exits 1 when nothing matches
}

/** The single gate between plan and network.
 *  dryRun: never fetch, record every URL that would be fetched (pending in the cache) by kind.
 *  live:   cache first; a miss goes through research/espn/espn.mjs getUrl (1 per ESPN_GAP_MS). */
export class Fetcher {
  constructor({ dryRun, budget = Infinity, log = () => {} }) {
    this.dryRun = dryRun
    this.budget = budget
    this.log = log
    this.planned = new Map() // url -> kind (uncached, would fetch)
    this.hits = new Map() // kind -> cache hits
    this.fetched = 0
  }
  /** undefined = not available (dry run, uncached, or over budget); null = ESPN 404; else the body. */
  async get(url, kind) {
    const c = readCached(url)
    if (c.state === 'ok' || c.state === 'empty') {
      this.hits.set(kind, (this.hits.get(kind) ?? 0) + 1)
      return c.body
    }
    if (this.dryRun || this.fetched >= this.budget) {
      this.planned.set(url, kind)
      return undefined
    }
    const { getUrl } = await import('../../../research/espn/espn.mjs')
    this.fetched++
    this.log(`GET ${kind} ${url}`)
    return getUrl(url)
  }
  /** Peek without planning (used by cost estimates). */
  peek(url) { return readCached(url) }
  plannedByKind() {
    const out = {}
    for (const k of this.planned.values()) out[k] = (out[k] ?? 0) + 1
    return out
  }
}

export const etaHours = (n, gapMs = Number(process.env.ESPN_GAP_MS ?? 1500)) => Math.round((n * gapMs) / 36e5 * 10) / 10
