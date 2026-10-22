// Read a response from espn.mjs's disk cache without ever fetching (safe to run beside a sweep).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'
export function cached(pathAndQuery) {
  const key = crypto.createHash('sha1').update(BASE + pathAndQuery).digest('hex')
  try { const t = fs.readFileSync(path.join(HERE, 'cache', key.slice(0, 2), key + '.json'), 'utf8'); return t === 'null' ? null : JSON.parse(t) }
  catch { return undefined }
}
export const cachedSummary = (slug, id) => cached(`${slug}/summary?event=${id}`)
