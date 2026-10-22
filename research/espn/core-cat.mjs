// Cache-only: print a cached absolute URL's JSON (optionally a dotted subpath). Never fetches.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export function cachedUrl(u) { const k = crypto.createHash('sha1').update(u).digest('hex'); try { const t = fs.readFileSync(path.join(HERE, 'cache', k.slice(0, 2), k + '.json'), 'utf8'); return t === 'null' ? null : JSON.parse(t) } catch { return undefined } }
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let j = cachedUrl(process.argv[2]); for (const p of (process.argv[3] || '').split('.').filter(Boolean)) j = j?.[p]
  console.log(JSON.stringify(j, null, 1).slice(0, +(process.argv[4] || 4000)))
}
