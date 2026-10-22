// Appends this process's uncached request count to requests.log so the sweep budget is auditable.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stats } from './espn.mjs'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export function logRun(label) {
  fs.appendFileSync(path.join(HERE, 'requests.log'),
    `${new Date().toISOString()}\t${label}\tmisses=${stats.misses}\thits=${stats.hits}\tretries=${stats.retries}\n`)
}
export function totalMisses() {
  try {
    return fs.readFileSync(path.join(HERE, 'requests.log'), 'utf8').split('\n')
      .map((l) => /misses=(\d+)/.exec(l)?.[1]).filter(Boolean).map(Number).reduce((a, b) => a + b, 0)
  } catch { return 0 }
}
