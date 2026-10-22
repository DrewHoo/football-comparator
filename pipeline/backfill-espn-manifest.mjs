// Rebuild data/raw/espn/manifest.jsonl for cache files written before the helper kept one.
// Each cache file is sha1(url) with only the body inside, so the URL is recovered from the body:
//   summary  -> header.league.slug + header.id        -> {BASE}{slug}/summary?event={id}
//   scoreboard -> leagues[0].slug + the dates param    -> {BASE}{slug}/scoreboard?dates={YYYY|YYYYMMDD}&limit={200|1000}
// A candidate URL counts only when sha1(candidate) equals the file name. Unresolved files are listed.
// Safe to run while a harvester is writing: it reads files, appends to the manifest, never deletes.
//
//   node pipeline/backfill-espn-manifest.mjs            # append entries for files not yet in the manifest
//   node pipeline/backfill-espn-manifest.mjs --check    # report only

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RAW = process.env.FC_RAW ?? path.resolve(HERE, '../data/raw')
const CACHE = path.join(RAW, 'espn')
const MANIFEST = path.join(CACHE, 'manifest.jsonl')
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'
const CORE = 'https://sports.core.api.espn.com/'
const check = process.argv.includes('--check')

const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex')

const known = new Set()
try {
  for (const line of (await fs.readFile(MANIFEST, 'utf8')).split('\n')) {
    if (line) known.add(JSON.parse(line).sha1)
  }
} catch {}

function candidates(body) {
  const out = []
  if (body && body.header && body.header.id) {
    const slug = body.header.league?.slug
    if (slug) out.push(`${BASE}${slug}/summary?event=${body.header.id}`)
    // Summaries fetched by absolute URL under other hosts are rebuilt the same way; add forms as they appear.
  }
  if (body && Array.isArray(body.leagues) && body.leagues[0]?.slug && Array.isArray(body.events)) {
    const slug = body.leagues[0].slug
    const years = new Set(), days = new Set()
    for (const e of body.events) {
      const d = String(e.date || '').slice(0, 10).replaceAll('-', '')
      if (d.length === 8) { days.add(d); years.add(d.slice(0, 4)) }
      if (e.season?.year) years.add(String(e.season.year)), years.add(String(e.season.year + 1))
    }
    if (body.day?.date) days.add(String(body.day.date).replaceAll('-', ''))
    for (const y of years) for (const lim of ['1000', '200']) {
      out.push(`${BASE}${slug}/scoreboard?dates=${y}&limit=${lim}`)
      for (const m of ['01','02','03','04','05','06','07','08','09','10','11','12']) out.push(`${BASE}${slug}/scoreboard?dates=${y}${m}&limit=${lim}`)
    }
    for (const d of days) for (const lim of ['200', '1000', '']) {
      out.push(`${BASE}${slug}/scoreboard?dates=${d}${lim ? '&limit=' + lim : ''}`)
    }
  }
  // Core API responses carry their own $ref.
  if (body && typeof body.$ref === 'string') out.push(body.$ref, body.$ref.replace(/\?.*$/, ''), body.$ref + '?limit=1000', body.$ref + '?limit=300', body.$ref + '?limit=400')
  return out
}

let files = 0, resolved = 0, already = 0, nulls = 0
const unresolved = []
const lines = []
for (const dir of await fs.readdir(CACHE)) {
  if (dir.length !== 2) continue
  for (const name of await fs.readdir(path.join(CACHE, dir))) {
    if (!name.endsWith('.json')) continue
    const key = name.slice(0, -5)
    files++
    if (known.has(key)) { already++; continue }
    const file = path.join(CACHE, dir, name)
    const text = await fs.readFile(file, 'utf8')
    const st = await fs.stat(file)
    if (text === 'null') { nulls++; unresolved.push({ key, why: '404 body, url unrecoverable' }); continue }
    let body
    try { body = JSON.parse(text) } catch { unresolved.push({ key, why: 'not JSON' }); continue }
    const hit = candidates(body).find((u) => sha1(u) === key)
    if (!hit) { unresolved.push({ key, why: 'no candidate url matched', keys: Object.keys(body).slice(0, 6) }); continue }
    resolved++
    lines.push(JSON.stringify({ sha1: key, url: hit, status: 200, bytes: Buffer.byteLength(text), fetchedAt: st.mtime.toISOString(), backfilled: true }))
  }
}
if (!check && lines.length) await fs.appendFile(MANIFEST, lines.join('\n') + '\n')
console.log(JSON.stringify({ files, alreadyInManifest: already, resolvedNow: resolved, nulls, unresolved: unresolved.length, written: check ? 0 : lines.length }))
if (unresolved.length) {
  const byWhy = {}
  for (const u of unresolved) byWhy[u.why] = (byWhy[u.why] || 0) + 1
  console.log('unresolved by reason:', JSON.stringify(byWhy))
  console.log('first few:', JSON.stringify(unresolved.slice(0, 5)))
}
