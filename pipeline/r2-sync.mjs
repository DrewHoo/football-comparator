// Mirror the packed private store (the football-comparator-data clone that pipeline/sync-data.mjs writes)
// to the private R2 bucket, and back. The git clone stays the source of truth and holds MANIFEST.json;
// R2 holds the same files under the same relative keys, so a pull reproduces the clone's packed layout
// and `sync-data.mjs unpack` (with FC_DATA_REPO pointed at the pulled dir) rebuilds data/ from it.
//
//   node pipeline/r2-sync.mjs push   [--only espn,ledger,...] [--dry-run]   # upload files whose sha256 R2 doesn't have yet
//   node pipeline/r2-sync.mjs pull   [--only ...] --to DIR                 # download MANIFEST.json + files, verify sha256
//   node pipeline/r2-sync.mjs status                                       # what the bucket has vs the manifest
//   node pipeline/r2-sync.mjs verify [--sample N]                          # download N random objects, compare sha256
//
// Transport is `wrangler r2 object put|get`, which uses the wrangler OAuth login on this machine (no S3 keys
// on disk). One object per packed file; keys are the manifest paths. A sidecar `.r2-state.json` in the clone
// remembers what was uploaded (key -> sha256) so push is incremental and `status` needs no listing call.
// Every upload is confirmed by downloading it back once and comparing sha256 before it's recorded.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const REPO = path.resolve(process.env.FC_DATA_REPO ?? path.join(ROOT, '..', 'football-comparator-data'))
const BUCKET = process.env.FC_R2_BUCKET ?? 'football-comparator-data'
const STATE_FILE = path.join(REPO, '.r2-state.json')
const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (n) => argv.includes(n)
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null
const DRY = flag('--dry-run')

const sha256File = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const mb = (n) => (n / 1048576).toFixed(1) + ' MB'
const log = (s) => console.log(`${new Date().toISOString()} ${s}`)

function wrangler(args, { allowFail = false } = {}) {
  const r = spawnSync('npx', ['--yes', 'wrangler', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0 && !allowFail) throw new Error(`wrangler ${args.slice(0, 4).join(' ')} failed (${r.status}):\n${(r.stderr || r.stdout).slice(-800)}`)
  return r
}
const put = (key, file) => wrangler(['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--remote'])
const get = (key, file) => wrangler(['r2', 'object', 'get', `${BUCKET}/${key}`, '--file', file, '--remote'], { allowFail: true })

function readManifest(dir = REPO) {
  const f = path.join(dir, 'MANIFEST.json')
  if (!fs.existsSync(f)) throw new Error(`no MANIFEST.json in ${dir}`)
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}
const readState = () => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { bucket: BUCKET, objects: {} })
const writeState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify({ ...s, updatedAt: new Date().toISOString() }, null, 1) + '\n')

/** Every packed file the manifest lists, filtered by --only group. */
function files(manifest) {
  const out = []
  for (const [id, u] of Object.entries(manifest.units)) {
    if (ONLY && !ONLY.has(u.group)) continue
    for (const f of u.files) out.push({ unit: id, group: u.group, key: f.path, bytes: f.bytes, sha256: f.sha256 })
  }
  return out
}

/** Download a key to a temp file and return its sha256 (null when the object is missing). */
function fetchSha(key) {
  const tmp = path.join(os.tmpdir(), `r2-verify-${process.pid}-${crypto.randomBytes(4).toString('hex')}`)
  try {
    const r = get(key, tmp)
    if (r.status !== 0 || !fs.existsSync(tmp)) return null
    return sha256File(tmp)
  } finally { try { fs.unlinkSync(tmp) } catch {} }
}

async function push() {
  const manifest = readManifest()
  const state = readState()
  const todo = files(manifest).filter((f) => state.objects[f.key]?.sha256 !== f.sha256)
  const total = todo.reduce((n, f) => n + f.bytes, 0)
  log(`push: ${todo.length} of ${files(manifest).length} files to upload (${mb(total)}); ${Object.keys(state.objects).length} already recorded`)
  if (DRY) { for (const f of todo) console.log(`  would put ${f.key} (${mb(f.bytes)})`); return }
  let done = 0, bytes = 0, failed = 0
  for (const f of todo) {
    const local = path.join(REPO, f.key)
    if (!fs.existsSync(local)) { log(`  MISSING locally: ${f.key}`); failed++; continue }
    if (sha256File(local) !== f.sha256) { log(`  LOCAL MISMATCH: ${f.key} differs from MANIFEST; run sync-data pack first`); failed++; continue }
    try {
      put(f.key, local)
      const back = fetchSha(f.key)
      if (back !== f.sha256) { log(`  VERIFY FAILED after upload: ${f.key} (got ${back})`); failed++; continue }
      state.objects[f.key] = { sha256: f.sha256, bytes: f.bytes, unit: f.unit, uploadedAt: new Date().toISOString() }
      writeState(state)
      done++; bytes += f.bytes
      if (done % 10 === 0 || done === todo.length) log(`  ${done}/${todo.length} uploaded and verified (${mb(bytes)})`)
    } catch (e) { log(`  FAILED ${f.key}: ${e.message.split('\n')[0]}`); failed++ }
  }
  // MANIFEST.json itself, so a pull needs nothing from git
  put('MANIFEST.json', path.join(REPO, 'MANIFEST.json'))
  state.manifestSha256 = sha256File(path.join(REPO, 'MANIFEST.json'))
  writeState(state)
  log(`push done: ${done} uploaded, ${failed} failed, ${mb(bytes)}; MANIFEST.json uploaded`)
  if (failed) process.exitCode = 1
}

async function pull() {
  const to = opt('--to')
  if (!to) throw new Error('pull needs --to DIR')
  fs.mkdirSync(to, { recursive: true })
  const mf = path.join(to, 'MANIFEST.json')
  const r = get('MANIFEST.json', mf)
  if (r.status !== 0) throw new Error('could not fetch MANIFEST.json from the bucket')
  const manifest = readManifest(to)
  const todo = files(manifest)
  log(`pull: ${todo.length} files (${mb(todo.reduce((n, f) => n + f.bytes, 0))}) into ${to}`)
  let ok = 0, bad = 0
  for (const f of todo) {
    const dest = path.join(to, f.key)
    if (fs.existsSync(dest) && sha256File(dest) === f.sha256) { ok++; continue }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const g = get(f.key, dest)
    if (g.status !== 0 || sha256File(dest) !== f.sha256) { log(`  BAD ${f.key}`); bad++; try { fs.unlinkSync(dest) } catch {}; continue }
    ok++
    if (ok % 20 === 0) log(`  ${ok}/${todo.length}`)
  }
  log(`pull done: ${ok} verified, ${bad} bad. Unpack with: FC_DATA_REPO=${to} node pipeline/sync-data.mjs unpack`)
  if (bad) process.exitCode = 1
}

function status() {
  const manifest = readManifest()
  const state = readState()
  const all = files(manifest)
  const up = all.filter((f) => state.objects[f.key]?.sha256 === f.sha256)
  const stale = all.filter((f) => state.objects[f.key] && state.objects[f.key].sha256 !== f.sha256)
  const missing = all.filter((f) => !state.objects[f.key])
  const orphan = Object.keys(state.objects).filter((k) => !all.some((f) => f.key === k))
  const byGroup = {}
  for (const f of all) { const g = byGroup[f.group] ??= { files: 0, bytes: 0, up: 0 }; g.files++; g.bytes += f.bytes; if (state.objects[f.key]?.sha256 === f.sha256) g.up++ }
  console.log(`bucket ${BUCKET}: ${up.length}/${all.length} manifest files uploaded (${mb(up.reduce((n, f) => n + f.bytes, 0))} of ${mb(all.reduce((n, f) => n + f.bytes, 0))}), ${stale.length} stale, ${missing.length} not uploaded, ${orphan.length} recorded but no longer in the manifest`)
  for (const [g, v] of Object.entries(byGroup)) console.log(`  ${g.padEnd(9)} ${String(v.up).padStart(4)}/${String(v.files).padEnd(4)} ${mb(v.bytes)}`)
  if (state.manifestSha256) console.log(`  MANIFEST.json in bucket ${state.manifestSha256 === sha256File(path.join(REPO, 'MANIFEST.json')) ? 'matches' : 'is STALE vs'} the clone`)
}

function verify() {
  const manifest = readManifest()
  const state = readState()
  const n = Number(opt('--sample') ?? 5)
  const pool = files(manifest).filter((f) => state.objects[f.key])
  const pick = pool.sort(() => Math.random() - 0.5).slice(0, n)
  let bad = 0
  for (const f of pick) { const s = fetchSha(f.key); const ok = s === f.sha256; if (!ok) bad++; console.log(`${ok ? 'ok ' : 'BAD'} ${f.key} ${mb(f.bytes)}`) }
  console.log(`verify: ${pick.length - bad}/${pick.length} match`)
  if (bad) process.exitCode = 1
}

const run = { push, pull, status, verify }[cmd]
if (!run) { console.error('usage: node pipeline/r2-sync.mjs push|pull|status|verify [--only groups] [--to DIR] [--sample N] [--dry-run]'); process.exit(2) }
await run()
