// Read-only access to the harvester's index and the ESPN disk cache. Never fetches: the cache key
// comes from research/espn/espn.mjs's exported cacheFile() (sha1 of the full URL), which has no
// side effects on import; nothing here calls get()/getUrl().
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cacheFile } from '../../../research/espn/espn.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const INDEX = path.join(ROOT, 'data/index/espn-events.json')
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'

export const summaryFile = (slug, id) => cacheFile(`${BASE}${slug}/summary?event=${id}`)

/** The harvester rewrites the index with tmp+rename, so a read is whole; retry anyway. */
export function loadIndex() {
  let err
  for (let i = 0; i < 5; i++) {
    try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')) } catch (e) { err = e }
  }
  throw err
}

/** {state: 'pending'} not cached yet, {state: 'empty'} ESPN 404, {state: 'ok', summary}. */
export function readSummary(slug, id) {
  let text
  try { text = fs.readFileSync(summaryFile(slug, id), 'utf8') } catch { return { state: 'pending' } }
  if (text === 'null') return { state: 'empty' }
  try { return { state: 'ok', summary: JSON.parse(text) } } catch { return { state: 'pending', corrupt: true } }
}
