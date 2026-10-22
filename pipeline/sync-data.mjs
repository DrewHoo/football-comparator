// Sync the project's data/ with the private data repo (DrewHoo/football-comparator-data).
//
// The data repo holds raw third-party responses and the long-form derived outputs, packed so they fit
// GitHub without LFS: per source and per unit, gzipped JSONL, every part under 90 MB.
// Layout, record format and the CI story are in pipeline/docs/data-store.md.
//
//   node pipeline/sync-data.mjs status                      # what's packed, what's changed locally, what's pending
//   node pipeline/sync-data.mjs pack [--only g,..] [--dry-run] [--commit] [--partial] [--force]
//   node pipeline/sync-data.mjs unpack [--only g,..] [--unit id,..] [--to DIR] [--force]
//
//   groups: espn wayback rsssf wikidata martj42 index ledger   (ledger also carries corrections/ and gates/)
//
// pack is idempotent. A unit whose inputs (names, sizes, mtimes) match MANIFEST.json is skipped without
// reading; one whose inputs changed is rebuilt and only rewritten when the sha256 of its uncompressed
// content differs. ESPN league-seasons are packed only when every indexed event is marked fetched and its
// summary is on disk (--partial packs incomplete ones too, flagged complete:false: the running season).
// --commit commits and pushes in the data repo with an explicit file list, in batches under 1 GB.
//
// unpack rebuilds data/raw/<host>/... and the index/ledger files under --to (default: this project's
// data/). Every packed file is checked against MANIFEST's sha256, every body against its recorded sha1,
// and every cache file name against the sha1 of the URL (or query, or QID) its host keys it by.
// An existing file with different content is reported as a conflict and left alone unless --force.
// Built-ins only. Never touches the network except `git push` under --commit.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const DATA = path.resolve(process.env.FC_DATA ?? path.join(ROOT, 'data'))
const REPO = path.resolve(process.env.FC_DATA_REPO ?? path.join(ROOT, '..', 'football-comparator-data'))
const MANIFEST_FILE = path.join(REPO, 'MANIFEST.json')

const PART_LIMIT = 90 * 1024 * 1024 // the 90 MB rule: no packed file reaches this
const PART_TARGET = Number(process.env.FC_PART_TARGET) || 80 * 1024 * 1024 // start a new part past this (env override for testing splits)
const PUSH_BATCH = 1024 * 1024 * 1024 // GitHub refuses pushes over 2 GB; stay well under
const GZIP = { level: 9 }
const GROUPS = ['espn', 'wayback', 'rsssf', 'wikidata', 'martj42', 'index', 'ledger']

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/'
const WAYBACK_FAMILIES = ['fifa1998', 'fifa2002', 'fifa2006', 'fifa2010', 'euro2000', 'euro2004q']
const WAYBACK_RULES = [
  ['fifa1998', /edition=1013/i],
  ['fifa2002', /edition=4395/i],
  ['fifa2006', /germany2006/i],
  ['fifa2010', /southafrica2010/i],
  ['euro2000', /season=2000\b/i],
  ['euro2004q', /round=15(79|80)\b/i], // qualifying groups (1579) and play-offs (1580), live-era or history URL
]

// ---------- args

const argv = process.argv.slice(2)
const cmd = argv[0]
const flag = (n) => argv.includes(n)
const opt = (n) => {
  const i = argv.indexOf(n)
  return i >= 0 ? argv[i + 1] : undefined
}
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null
const UNITS = opt('--unit') ? opt('--unit').split(',') : null
const DRY = flag('--dry-run')
const FORCE = flag('--force')
const PARTIAL = flag('--partial')
if (ONLY) for (const g of ONLY) if (!GROUPS.includes(g)) die(`unknown group ${g} (one of ${GROUPS.join(' ')})`)

function die(msg) {
  console.error(msg)
  process.exit(1)
}

// ---------- small helpers

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex')
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex')
const rel = (p) => path.relative(DATA, p).split(path.sep).join('/')
const exists = (p) => fs.existsSync(p)
const mb = (n) => (n / 1048576).toFixed(1) + ' MB'
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Body as a JSON-safe string: UTF-8 text when the bytes round-trip exactly, base64 otherwise. */
function encodeBody(buf) {
  try {
    const s = UTF8.decode(buf)
    if (Buffer.from(s, 'utf8').equals(buf)) return { body: s }
  } catch {}
  return { body: buf.toString('base64'), enc: 'base64' }
}
const decodeBody = (r) => (r.body == null ? null : Buffer.from(r.body, r.enc === 'base64' ? 'base64' : 'utf8'))

/** RSSSF cache key normalisation; must match canon() in pipeline/lib/rsssf.mjs. */
const rsssfCanon = (url) =>
  url.trim().replace(/^http:\/\//i, 'https://').replace(/^https:\/\/(www\.)?rsssf\.(org|com)\//i, 'https://www.rsssf.org/').split('#')[0]

/** Two-level cache dirs (<xx>/<sha1>.<ext>) under dir; returns stems with the extensions present. */
function cacheEntries(dir) {
  const out = new Map()
  if (!exists(dir)) return out
  for (const d of fs.readdirSync(dir).sort()) {
    if (d.length !== 2 || !fs.statSync(path.join(dir, d)).isDirectory()) continue
    for (const f of fs.readdirSync(path.join(dir, d)).sort()) {
      const m = f.match(/^([0-9a-f]{40})\.(json|bin)$/)
      if (!m) continue
      const e = out.get(m[1]) ?? { stem: m[1], dir: path.join(dir, d) }
      e[m[2]] = path.join(dir, d, f)
      out.set(m[1], e)
    }
  }
  return out
}

function walk(dir) {
  const out = []
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.startsWith('.')) continue
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

/** Cheap identity of a unit's inputs: names, sizes, mtimes, plus any extra metadata string. */
function fingerprint(files, extra = '') {
  const h = crypto.createHash('sha256')
  for (const f of [...files].sort()) {
    const st = fs.statSync(f)
    h.update(`${rel(f)}\t${st.size}\t${Math.floor(st.mtimeMs)}\n`)
  }
  h.update(extra)
  return h.digest('hex')
}

const span = () => ({ from: null, to: null })
function widen(s, t) {
  if (!t) return
  if (!s.from || t < s.from) s.from = t
  if (!s.to || t > s.to) s.to = t
}

// ---------- unit planning
//
// A unit: { id, group, kind, target, inputs, extra, records? (async generator), src? }
//   kind 'records'  raw cache entries, one JSON record per line   -> <id>.jsonl.gz  | <id>.partNN.jsonl.gz
//   kind 'bundle'   many small derived files, one record per file -> <id>.jsonl.gz  | parts
//   kind 'file'     one derived file gzipped byte-for-byte        -> <id>.gz        | <id>.partNN.gz
//   kind 'copy'     one file stored as-is (martj42 CSVs)          -> <id>

function planEspn() {
  const units = []
  const dir = path.join(DATA, 'raw/espn')
  const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index/espn-events.json'), 'utf8'))
  const manifest = new Map()
  for (const line of fs.readFileSync(path.join(dir, 'manifest.jsonl'), 'utf8').split('\n')) {
    if (!line) continue
    const m = JSON.parse(line)
    if (!manifest.has(m.sha1)) manifest.set(m.sha1, [])
    manifest.get(m.sha1).push(line)
  }
  const file = (h) => path.join(dir, h.slice(0, 2), h + '.json')
  const seasons = new Map()
  const add = (e, excluded) => {
    const k = `${e.slug}/${e.seasonLabel}`
    if (!seasons.has(k)) seasons.set(k, { slug: e.slug, label: e.seasonLabel, events: 0, fetched: 0, onDisk: 0, urls: [] })
    const s = seasons.get(k)
    const url = `${ESPN_BASE}${e.slug}/summary?event=${e.id}`
    const h = sha1(url)
    const there = exists(file(h))
    if (!excluded) {
      s.events++
      if (e.fetched) s.fetched++
      if (there) s.onDisk++
    }
    if (there) s.urls.push(url) // excluded events' summaries ride along when they were fetched
  }
  for (const e of index.events) add(e, false)
  for (const e of index.excluded ?? []) add(e, true)

  const pending = []
  const mk = (id, slug, urls, extraMeta) => {
    urls = [...new Set(urls)].sort()
    const hashes = urls.map(sha1)
    const meta = hashes.map((h) => (manifest.get(h) ?? []).join('|')).join('\n')
    return {
      id,
      group: 'espn',
      kind: 'records',
      target: 'raw/espn',
      layout: 'espn',
      inputs: hashes.map(file),
      extra: meta + JSON.stringify(extraMeta),
      info: extraMeta,
      async *records() {
        for (let i = 0; i < urls.length; i++) {
          const h = hashes[i]
          const p = file(h)
          const buf = await fsp.readFile(p)
          const lines = manifest.get(h) ?? []
          const last = lines.length ? JSON.parse(lines[lines.length - 1]) : null
          const text = buf.toString('utf8')
          yield {
            sha1: h,
            url: urls[i],
            status: last?.status ?? (text === 'null' ? 404 : 200),
            bytes: buf.length,
            fetchedAt: last?.fetchedAt ?? new Date(fs.statSync(p).mtimeMs).toISOString(),
            ...(last ? {} : { fetchedAtFrom: 'mtime', urlFrom: 'index' }),
            bodySha1: sha1(buf),
            ...encodeBody(buf),
            ...(lines.length ? { meta: lines } : {}),
          }
        }
      },
    }
  }
  for (const s of [...seasons.values()].sort((a, b) => (a.slug + a.label).localeCompare(b.slug + b.label))) {
    const complete = s.events > 0 && s.fetched === s.events && s.onDisk === s.events
    if (!complete && !(PARTIAL && s.onDisk > 0)) {
      pending.push(`${s.slug}/${s.label} (${s.onDisk}/${s.events} on disk)`)
      continue
    }
    units.push(mk(`raw/espn/${s.slug}/${s.label}`, s.slug, s.urls, { complete, events: s.events, onDisk: s.onDisk }))
  }
  // Year scoreboards: one unit per slug, every cached form of the year/month URL the harvesters use.
  for (const slug of Object.keys(index.sources).sort()) {
    const urls = []
    for (let y = 1995; y <= new Date().getUTCFullYear() + 1; y++) {
      for (const lim of ['1000', '200', '']) {
        const q = lim ? `&limit=${lim}` : ''
        for (const d of [String(y), ...['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => `${y}${m}`)]) {
          const u = `${ESPN_BASE}${slug}/scoreboard?dates=${d}${q}`
          if (exists(file(sha1(u)))) urls.push(u)
        }
      }
    }
    if (urls.length) units.push(mk(`raw/espn/${slug}/scoreboards`, slug, urls, { complete: true, scoreboards: urls.length }))
  }
  return { units, pending }
}

function sidecarUnit(id, group, target, entries, keyOf) {
  return {
    id,
    group,
    kind: 'records',
    target,
    layout: 'sidecar',
    inputs: entries.flatMap((e) => [e.json, e.bin].filter(Boolean)),
    async *records() {
      for (const e of entries) {
        const metaText = await fsp.readFile(e.json, 'utf8')
        const m = JSON.parse(metaText)
        const buf = e.bin ? await fsp.readFile(e.bin) : null
        if (sha1(keyOf(m.url)) !== e.stem) console.warn(`WARN ${id}: ${e.stem} is not sha1 of its url ${m.url}`)
        yield {
          sha1: e.stem,
          url: m.url,
          status: m.status ?? null,
          bytes: buf ? buf.length : 0,
          fetchedAt: m.fetchedAt ?? null,
          bodySha1: buf ? sha1(buf) : null,
          ...(buf ? encodeBody(buf) : { body: null }),
          meta: metaText,
        }
      }
    },
  }
}

function planWayback() {
  const dir = path.join(DATA, 'raw/wayback')
  // Index membership first (the archive index cites the capture it parsed), URL pattern second, else probe.
  const cited = new Map()
  for (const f of WAYBACK_FAMILIES) {
    const p = path.join(DATA, 'index/archive', f + '.json')
    if (!exists(p)) continue
    for (const u of fs.readFileSync(p, 'utf8').match(/https?:\/\/web\.archive\.org\/web\/\d+\/[^"]*/g) ?? []) {
      const m = u.match(/web\/(\d+)\/(.*)$/)
      cited.set(m[1] + ' ' + m[2], f)
    }
  }
  const fam = new Map([...WAYBACK_FAMILIES, 'probe'].map((f) => [f, []]))
  for (const e of cacheEntries(dir).values()) {
    if (!e.json) {
      console.warn(`WARN wayback ${e.stem}.bin has no sidecar; skipped`)
      continue
    }
    const { url } = JSON.parse(fs.readFileSync(e.json, 'utf8'))
    const w = url.match(/web\/(\d+)id_\/(.*)$/)
    let f = w && cited.get(w[1] + ' ' + w[2])
    if (!f) {
      let u = url
      try {
        u = decodeURIComponent(url)
      } catch {}
      f = (WAYBACK_RULES.find(([, re]) => re.test(u)) ?? ['probe'])[0]
    }
    fam.get(f).push(e)
  }
  return [...fam].filter(([, es]) => es.length).map(([f, es]) => sidecarUnit(`raw/wayback/${f}`, 'wayback', 'raw/wayback', es, (u) => u))
}

function planRsssf() {
  const entries = [...cacheEntries(path.join(DATA, 'raw/rsssf')).values()].filter((e) => {
    if (!e.json) console.warn(`WARN rsssf ${e.stem}.bin has no sidecar; skipped`)
    return e.json
  })
  return [sidecarUnit('raw/rsssf/rsssf', 'rsssf', 'raw/rsssf', entries, rsssfCanon)]
}

function planWikidata() {
  const units = []
  for (const kind of ['sparql', 'entity']) {
    const entries = [...cacheEntries(path.join(DATA, 'raw/wikidata', kind)).values()].filter((e) => e.json)
    if (!entries.length) continue
    units.push({
      id: `raw/wikidata/${kind}`,
      group: 'wikidata',
      kind: 'records',
      target: `raw/wikidata/${kind}`,
      layout: 'plain',
      inputs: entries.map((e) => e.json),
      async *records() {
        for (const e of entries) {
          const buf = await fsp.readFile(e.json)
          const j = JSON.parse(buf.toString('utf8'))
          // The file is self-describing: a SPARQL entry embeds its query; an entity file names its QID.
          const key = kind === 'sparql' ? j.query : Object.keys(j.entities ?? {}).find((q) => sha1(q) === e.stem) ?? null
          if (key == null || sha1(key) !== e.stem) console.warn(`WARN wikidata ${kind} ${e.stem}: key not recovered from body`)
          yield {
            sha1: e.stem,
            url: kind === 'sparql' ? 'https://query.wikidata.org/sparql' : `https://www.wikidata.org/wiki/Special:EntityData/${key}.json`,
            key,
            status: 200,
            bytes: buf.length,
            fetchedAt: j.fetched ?? new Date(fs.statSync(e.json).mtimeMs).toISOString(),
            ...(j.fetched ? {} : { fetchedAtFrom: 'mtime' }),
            bodySha1: sha1(buf),
            ...encodeBody(buf),
          }
        }
      },
    })
  }
  return units
}

function planMartj42() {
  const dir = path.join(DATA, 'raw/martj42')
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.csv'))
    .sort()
    .map((f) => ({ id: `raw/martj42/${f}`, group: 'martj42', kind: 'copy', target: `raw/martj42/${f}`, src: path.join(dir, f), inputs: [path.join(dir, f)] }))
}

/** Derived outputs: top-level files gzip one-to-one; a subdirectory becomes a bundle unless it holds a
 *  file over 50 MB, in which case its files go one-to-one too. */
function planDerived(group, top) {
  const units = []
  const base = path.join(DATA, top)
  if (!exists(base)) return units
  const fileUnit = (p) => ({ id: rel(p), group, kind: 'file', target: rel(p), src: p, inputs: [p] })
  for (const f of fs.readdirSync(base).sort()) {
    if (f.startsWith('.')) continue
    const p = path.join(base, f)
    if (!fs.statSync(p).isDirectory()) {
      units.push(fileUnit(p))
      continue
    }
    const files = walk(p)
    if (files.some((x) => fs.statSync(x).size > 50 * 1024 * 1024)) {
      units.push(...files.map(fileUnit))
      continue
    }
    units.push({
      id: rel(p),
      group,
      kind: 'bundle',
      target: rel(p),
      inputs: files,
      async *records() {
        for (const x of files) {
          const buf = await fsp.readFile(x)
          yield { path: rel(x), bytes: buf.length, sha256: sha256(buf), ...encodeBody(buf) }
        }
      },
    })
  }
  return units
}

function plan() {
  const want = (g) => !ONLY || ONLY.has(g)
  const units = []
  let pending = []
  if (want('espn')) {
    const e = planEspn()
    units.push(...e.units)
    pending = e.pending
  }
  if (want('wayback')) units.push(...planWayback())
  if (want('rsssf')) units.push(...planRsssf())
  if (want('wikidata')) units.push(...planWikidata())
  if (want('martj42')) units.push(...planMartj42())
  if (want('index')) units.push(...planDerived('index', 'index'))
  if (want('ledger')) for (const t of ['ledger', 'corrections', 'gates']) units.push(...planDerived('ledger', t))
  for (const u of units) u.fingerprint = fingerprint(u.inputs, u.extra ?? '')
  return { units: UNITS ? units.filter((u) => UNITS.some((x) => u.id === x || u.id.startsWith(x + '/'))) : units, pending }
}

// ---------- MANIFEST

function readManifest() {
  if (!exists(MANIFEST_FILE)) return { schema: 1, units: {} }
  return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))
}
function writeManifest(m) {
  const sorted = Object.fromEntries(Object.entries(m.units).sort(([a], [b]) => a.localeCompare(b)))
  const out = {
    schema: 1,
    about: 'Private store for football-comparator. See README.md. Not licensed for reuse; nothing here is sublicensed.',
    updatedAt: m.updatedAt,
    totals: {
      units: Object.keys(sorted).length,
      files: Object.values(sorted).reduce((n, u) => n + u.files.length, 0),
      bytes: Object.values(sorted).reduce((n, u) => n + u.bytes, 0),
      records: Object.values(sorted).reduce((n, u) => n + u.records, 0),
    },
    pending: m.pending ?? {},
    units: sorted,
  }
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(out, null, 1) + '\n')
}

// ---------- pack

/** Stream chunks into gzip parts. cut(chunk) returns the offset after which a part may end (or -1). */
async function writeParts(unit, chunks, cut) {
  const tmpBase = path.join(REPO, unit.id + `.tmp-${process.pid}`)
  await fsp.mkdir(path.dirname(tmpBase), { recursive: true })
  const content = crypto.createHash('sha256')
  const parts = []
  let gz, out, compressed, done
  const open = () => {
    const p = `${tmpBase}.${parts.length}`
    parts.push(p)
    compressed = 0
    gz = zlib.createGzip(GZIP)
    out = fs.createWriteStream(p)
    gz.on('data', (d) => (compressed += d.length))
    gz.pipe(out)
    done = new Promise((res, rej) => {
      out.on('finish', res)
      out.on('error', rej)
      gz.on('error', rej)
    })
  }
  const close = async () => {
    gz.end()
    await done
  }
  const write = async (b) => {
    if (!b.length) return
    content.update(b)
    if (!gz.write(b)) await new Promise((r) => gz.once('drain', r))
  }
  let raw = 0
  open()
  for await (let chunk of chunks) {
    raw += chunk.length
    while (chunk.length) {
      if (compressed < PART_TARGET) {
        await write(chunk)
        break
      }
      const at = cut(chunk)
      if (at < 0) {
        await write(chunk)
        break
      }
      await write(chunk.subarray(0, at))
      await close()
      open()
      chunk = chunk.subarray(at)
    }
  }
  await close()
  return { parts, raw, contentSha256: content.digest('hex') }
}

async function packUnit(unit, prev) {
  const stats = { records: 0, span: span() }
  let res
  if (unit.kind === 'copy') {
    const buf = await fsp.readFile(unit.src)
    const tmp = path.join(REPO, unit.id + `.tmp-${process.pid}.0`)
    await fsp.mkdir(path.dirname(tmp), { recursive: true })
    await fsp.writeFile(tmp, buf)
    stats.records = buf.toString('utf8').split('\n').filter(Boolean).length - 1
    const d = path.basename(unit.src).match(/(\d{4}-\d{2}-\d{2})/)
    if (d) widen(stats.span, d[1])
    res = { parts: [tmp], raw: buf.length, contentSha256: sha256(buf) }
  } else if (unit.kind === 'file') {
    let lines = 0
    async function* chunks() {
      for await (const c of fs.createReadStream(unit.src, { highWaterMark: 1 << 20 })) {
        for (let i = 0; i < c.length; i++) if (c[i] === 10) lines++
        yield c
      }
    }
    res = await writeParts(unit, chunks(), (c) => {
      const i = c.indexOf(10)
      return i < 0 ? -1 : i + 1
    })
    stats.records = lines
    const t = new Date(fs.statSync(unit.src).mtimeMs).toISOString()
    widen(stats.span, t)
  } else {
    async function* chunks() {
      for await (const r of unit.records()) {
        stats.records++
        widen(stats.span, r.fetchedAt ?? null)
        yield Buffer.from(JSON.stringify(r) + '\n')
      }
    }
    res = await writeParts(unit, chunks(), () => 0) // every record is a line: a part can end before any of them
    if (unit.kind === 'bundle') for (const f of unit.inputs) widen(stats.span, new Date(fs.statSync(f).mtimeMs).toISOString())
  }

  // Name the parts. One part: <id>.jsonl.gz / <id>.gz / <id>. Several: <id>.partNN.<ext>.
  const ext = unit.kind === 'copy' ? '' : unit.kind === 'file' ? '.gz' : '.jsonl.gz'
  const names = res.parts.length === 1 ? [unit.id + ext] : res.parts.map((_, i) => `${unit.id}.part${String(i).padStart(2, '0')}${ext}`)
  const unchanged =
    prev && prev.contentSha256 === res.contentSha256 && prev.files.every((f) => exists(path.join(REPO, f.path)) && fs.statSync(path.join(REPO, f.path)).size === f.bytes)
  if (unchanged) {
    for (const p of res.parts) await fsp.rm(p)
    return { entry: { ...prev, fingerprint: unit.fingerprint }, changed: [], removed: [] }
  }
  const files = []
  for (let i = 0; i < names.length; i++) {
    const dest = path.join(REPO, names[i])
    await fsp.rename(res.parts[i], dest)
    const buf = await fsp.readFile(dest)
    if (buf.length >= PART_LIMIT) die(`${names[i]} is ${mb(buf.length)}, over the 90 MB rule`)
    files.push({ path: names[i], bytes: buf.length, sha256: sha256(buf) })
  }
  const removed = (prev?.files ?? []).map((f) => f.path).filter((p) => !names.includes(p))
  for (const p of removed) await fsp.rm(path.join(REPO, p), { force: true })
  const entry = {
    group: unit.group,
    kind: unit.kind,
    layout: unit.layout,
    target: unit.target,
    files,
    bytes: files.reduce((n, f) => n + f.bytes, 0),
    rawBytes: res.raw,
    records: stats.records,
    span: stats.span,
    contentSha256: res.contentSha256,
    fingerprint: unit.fingerprint,
    packedAt: new Date().toISOString(),
    ...(unit.info ? { info: unit.info } : {}),
  }
  return { entry, changed: names, removed }
}

async function pack() {
  if (!exists(path.join(REPO, '.git'))) die(`no data repo at ${REPO} (clone DrewHoo/football-comparator-data there, or set FC_DATA_REPO)`)
  if (exists(path.join(ROOT, '.git'))) console.warn('NOTE: the project directory is a git repo; sync-data never commits there.')
  const { units, pending } = plan()
  const man = readManifest()
  const changed = []
  const removed = []
  let skipped = 0
  const todo = units.filter((u) => {
    const prev = man.units[u.id]
    if (!FORCE && prev && prev.fingerprint === u.fingerprint && prev.files.every((f) => exists(path.join(REPO, f.path)))) {
      skipped++
      return false
    }
    return true
  })
  console.log(`pack: ${units.length} units planned, ${skipped} unchanged (fingerprint), ${todo.length} to build${DRY ? ' [dry run]' : ''}`)
  if (DRY) {
    for (const u of todo) console.log(`  would build ${u.id} (${u.inputs.length} inputs${man.units[u.id] ? ', inputs changed' : ', new'})`)
    if (pending.length) console.log(`  ESPN pending (not complete): ${pending.length} league-seasons`)
    return
  }
  let i = 0
  const worker = async () => {
    while (i < todo.length) {
      const u = todo[i++]
      const t0 = Date.now()
      const r = await packUnit(u, man.units[u.id])
      man.units[u.id] = r.entry
      changed.push(...r.changed)
      removed.push(...r.removed)
      const e = r.entry
      console.log(`  ${r.changed.length ? 'wrote' : 'same '} ${u.id}: ${e.records} records, ${mb(e.rawBytes)} -> ${mb(e.bytes)} in ${e.files.length} file(s) ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  if (!ONLY || ONLY.has('espn')) man.pending = { ...(man.pending ?? {}), espn: pending }
  if (changed.length || removed.length || !exists(MANIFEST_FILE)) man.updatedAt = new Date().toISOString()
  writeManifest(man)
  console.log(`pack: ${changed.length} files written, ${removed.length} removed, ${todo.length - new Set(changed.map((c) => c.replace(/\.part\d\d/, ''))).size} rebuilt but identical`)
  if (pending.length) console.log(`ESPN: ${pending.length} league-seasons not complete yet, left for a later pack`)
  if (flag('--commit')) commit(readManifest())
}

function git(...args) {
  return execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28 })
}

/** Commit and push with explicit paths only, batched so no push nears GitHub's 2 GB limit.
 *  Stages every file MANIFEST lists that git sees as new or modified (so packs from earlier runs that
 *  were never committed go too), and removes tracked data files MANIFEST no longer lists. */
function commit(man) {
  const listed = new Set(Object.values(man.units).flatMap((u) => u.files.map((f) => f.path)))
  const dirty = new Set(
    git('status', '--porcelain=v1', '-uall', '-z')
      .split('\0')
      .filter(Boolean)
      .map((l) => l.slice(3)),
  )
  const all = [...listed].filter((p) => dirty.has(p)).sort()
  const removed = git('ls-files', '-z', '--', 'raw', 'index', 'ledger', 'corrections', 'gates')
    .split('\0')
    .filter((p) => p && !listed.has(p))
  const batches = [[]]
  let size = 0
  for (const p of all) {
    const s = fs.statSync(path.join(REPO, p)).size
    if (size + s > PUSH_BATCH && batches.at(-1).length) {
      batches.push([])
      size = 0
    }
    batches.at(-1).push(p)
    size += s
  }
  batches.at(-1).push('MANIFEST.json')
  for (const p of removed) git('rm', '--quiet', '--cached', '--ignore-unmatch', '--', p)
  const label = ONLY ? [...ONLY].join(',') : 'all'
  batches.forEach((b, n) => {
    for (let k = 0; k < b.length; k += 200) git('add', '--', ...b.slice(k, k + 200))
    const staged = git('diff', '--cached', '--name-only').trim()
    if (!staged) return
    const msg = `pack ${label}${batches.length > 1 ? ` (${n + 1}/${batches.length})` : ''}: ${b.length} files`
    git('commit', '--quiet', '-m', msg + (process.env.FC_COMMIT_TRAILER ? `\n\n${process.env.FC_COMMIT_TRAILER}` : ''))
    console.log(`commit: ${msg}`)
    execFileSync('git', ['-C', REPO, 'push', '--quiet', 'origin', 'HEAD'], { stdio: 'inherit' })
  })
}

// ---------- unpack

async function* readParts(entry) {
  for (const f of entry.files) {
    const p = path.join(REPO, f.path)
    const buf = await fsp.readFile(p)
    if (sha256(buf) !== f.sha256) throw new Error(`${f.path}: sha256 does not match MANIFEST`)
    yield entry.kind === 'copy' ? buf : zlib.gunzipSync(buf)
  }
}
async function* lines(entry) {
  let rest = ''
  for await (const buf of readParts(entry)) {
    const s = rest + buf.toString('utf8')
    const parts = s.split('\n')
    rest = parts.pop()
    for (const l of parts) if (l) yield JSON.parse(l)
  }
  if (rest) yield JSON.parse(rest)
}

async function unpack() {
  const to = path.resolve(opt('--to') ?? DATA)
  const man = readManifest()
  const ids = Object.keys(man.units).filter((id) => {
    const u = man.units[id]
    if (ONLY && !ONLY.has(u.group)) return false
    if (UNITS && !UNITS.some((x) => id === x || id.startsWith(x + '/'))) return false
    return true
  })
  if (!ids.length) die('nothing to unpack (check --only/--unit against MANIFEST.json)')
  const tally = { files: 0, written: 0, same: 0, conflicts: 0, bad: 0 }
  const espnManifest = []
  async function put(p, buf) {
    tally.files++
    if (exists(p)) {
      const cur = await fsp.readFile(p)
      if (cur.equals(buf)) return tally.same++
      if (!FORCE) {
        tally.conflicts++
        return console.warn(`CONFLICT ${path.relative(to, p)} differs on disk; kept (use --force to overwrite)`)
      }
    }
    await fsp.mkdir(path.dirname(p), { recursive: true })
    const tmp = `${p}.${process.pid}.tmp`
    await fsp.writeFile(tmp, buf)
    await fsp.rename(tmp, p)
    tally.written++
  }
  const bad = (msg) => {
    tally.bad++
    console.error(`BAD ${msg}`)
  }
  for (const id of ids.sort()) {
    const u = man.units[id]
    let n = 0
    if (u.kind === 'copy' || u.kind === 'file') {
      const bufs = []
      for await (const b of readParts(u)) bufs.push(b)
      const buf = Buffer.concat(bufs)
      if (sha256(buf) !== u.contentSha256) bad(`${id}: content sha256 mismatch`)
      else await put(path.join(to, u.target), buf)
      n = 1
    } else {
      for await (const r of lines(u)) {
        n++
        const body = decodeBody(r)
        if (u.kind === 'bundle') {
          if (sha256(body) !== r.sha256) bad(`${id} ${r.path}: sha256 mismatch`)
          else await put(path.join(to, r.path), body)
          continue
        }
        if (body && sha1(body) !== r.bodySha1) {
          bad(`${id} ${r.sha1}: body sha1 mismatch`)
          continue
        }
        const key = u.layout === 'plain' ? r.key : r.url
        const keyOf = id.startsWith('raw/rsssf') ? rsssfCanon : (x) => x
        if (key == null || sha1(keyOf(key)) !== r.sha1) bad(`${id} ${r.sha1}: file name is not sha1 of ${key}`)
        const dir = path.join(to, u.target, r.sha1.slice(0, 2))
        if (u.layout === 'sidecar') {
          if (body) await put(path.join(dir, r.sha1 + '.bin'), body)
          await put(path.join(dir, r.sha1 + '.json'), Buffer.from(r.meta, 'utf8'))
        } else {
          await put(path.join(dir, r.sha1 + '.json'), body)
          if (u.layout === 'espn' && r.meta) espnManifest.push(...r.meta)
        }
      }
    }
    console.log(`  ${id}: ${n} ${u.kind === 'file' || u.kind === 'copy' ? 'file' : 'records'}`)
  }
  if (espnManifest.length) {
    // Append the manifest lines the target doesn't have yet; never rewrite existing lines.
    const mp = path.join(to, 'raw/espn/manifest.jsonl')
    const have = new Set(exists(mp) ? fs.readFileSync(mp, 'utf8').split('\n') : [])
    const add = [...new Set(espnManifest)].filter((l) => !have.has(l))
    if (add.length) {
      await fsp.mkdir(path.dirname(mp), { recursive: true })
      await fsp.appendFile(mp, add.join('\n') + '\n')
    }
    console.log(`  raw/espn/manifest.jsonl: ${add.length} lines appended`)
  }
  console.log(`unpack -> ${to}: ${tally.files} files, ${tally.written} written, ${tally.same} already identical, ${tally.conflicts} conflicts, ${tally.bad} failed verification`)
  if (tally.bad || tally.conflicts) process.exit(2)
}

// ---------- status

function status() {
  const man = readManifest()
  const { units, pending } = plan()
  const rows = { unchanged: [], changed: [], new: [] }
  for (const u of units) {
    const prev = man.units[u.id]
    rows[!prev ? 'new' : prev.fingerprint === u.fingerprint ? 'unchanged' : 'changed'].push(u.id)
  }
  const by = {}
  for (const [id, e] of Object.entries(man.units)) {
    if (ONLY && !ONLY.has(e.group)) continue
    const g = (by[e.group] ??= { units: 0, files: 0, bytes: 0, rawBytes: 0, records: 0 })
    g.units++
    g.files += e.files.length
    g.bytes += e.bytes
    g.rawBytes += e.rawBytes
    g.records += e.records
  }
  console.log(`data repo: ${REPO}${man.updatedAt ? ` (MANIFEST updated ${man.updatedAt})` : ' (no MANIFEST yet)'}`)
  for (const [g, s] of Object.entries(by).sort()) console.log(`  ${g.padEnd(9)} ${String(s.units).padStart(4)} units ${String(s.files).padStart(4)} files ${mb(s.bytes).padStart(10)} (raw ${mb(s.rawBytes)}) ${s.records} records`)
  console.log(`local vs MANIFEST: ${rows.unchanged.length} unchanged, ${rows.changed.length} changed, ${rows.new.length} not packed`)
  for (const id of rows.changed) console.log(`  changed  ${id}`)
  for (const id of rows.new) console.log(`  new      ${id}`)
  if (pending.length) console.log(`ESPN pending (not fully fetched): ${pending.length} league-seasons, e.g. ${pending.slice(0, 3).join(', ')}`)
  if (exists(path.join(REPO, '.git'))) {
    const dirty = git('status', '--porcelain').trim()
    console.log(`git: ${dirty ? dirty.split('\n').length + ' uncommitted paths' : 'clean'}; ${git('count-objects', '-vH').match(/size-pack: (.*)/)?.[1] ?? '?'} packed`)
  }
}

// ---------- main

if (cmd === 'pack') await pack()
else if (cmd === 'unpack') await unpack()
else if (cmd === 'status') status()
else die('usage: node pipeline/sync-data.mjs status|pack|unpack [--only espn,wayback,rsssf,wikidata,martj42,index,ledger] [--unit id] [--to DIR] [--dry-run] [--commit] [--partial] [--force]')
