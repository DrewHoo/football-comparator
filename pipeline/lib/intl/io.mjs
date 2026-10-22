// Paths and small readers/writers for the international ledger. Reads only files already on disk.
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(HERE, '../../..')
export const P = {
  rsssfCaps: path.join(ROOT, 'data/index/rsssf-caps.jsonl'),
  rsssfCoverage: path.join(ROOT, 'data/index/rsssf-coverage.csv'),
  archiveDir: path.join(ROOT, 'data/index/archive'),
  espnCache: path.join(ROOT, 'data/raw/espn'),
  wikidataSparql: path.join(ROOT, 'data/raw/wikidata/sparql'),
  martj42Dir: path.join(ROOT, 'data/raw/martj42'),
  population: path.join(ROOT, 'research/intl-match-population.csv'),
  marquee: path.join(ROOT, 'research/intl/marquee-caps-by-type.csv'),
  corrections: path.join(ROOT, 'data/corrections/intl.json'),
  out: path.join(ROOT, 'data/ledger/intl'),
}

export const ARCHIVE_SOURCES = ['fifa1998', 'fifa2002', 'fifa2006', 'fifa2010', 'euro2000', 'euro2004q']
/** Matches each archive source will hold when the harvest completes (pipeline/README.md). */
export const ARCHIVE_EXPECTED = { fifa1998: 643, fifa2002: 777, fifa2006: 847, fifa2010: 853, euro2000: 259, euro2004q: 211 }

/** Newest dated copy of a martj42 file (results, goalscorers, former_names). */
export function martj42File(kind) {
  const files = fs.readdirSync(P.martj42Dir).filter((f) => f.startsWith(kind + '-') && f.endsWith('.csv')).sort()
  if (!files.length) throw new Error(`no martj42 ${kind} file in ${P.martj42Dir}`)
  return path.join(P.martj42Dir, files.at(-1))
}

export function parseCsv(text) {
  const rows = []
  let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cur += '"'), i++
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') row.push(cur), (cur = '')
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur), rows.push(row), (row = []), (cur = '')
    } else cur += c
  }
  if (cur || row.length) row.push(cur), rows.push(row)
  const [head, ...rest] = rows.filter((r) => r.length > 1 || r[0])
  return rest.map((r, i) => Object.assign(Object.fromEntries(head.map((h, j) => [h, r[j] ?? ''])), { _line: i + 2 }))
}
export const readCsv = (file) => parseCsv(fs.readFileSync(file, 'utf8'))
export const readJson = (file, dflt) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { if (dflt !== undefined) return dflt; throw e }
}

export async function* readJsonl(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) if (line.trim()) yield JSON.parse(line)
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n')
  fs.renameSync(tmp, file)
}
export function writeJsonl(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  const fd = fs.openSync(tmp, 'w')
  let buf = ''
  for (const r of rows) {
    buf += JSON.stringify(r) + '\n'
    if (buf.length > 1 << 20) fs.writeSync(fd, buf), (buf = '')
  }
  fs.writeSync(fd, buf)
  fs.closeSync(fd)
  fs.renameSync(tmp, file)
}
export function writeCsv(file, rows, cols) {
  cols ??= Object.keys(rows[0] ?? {})
  const esc = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n')
}

export const rel = (f) => path.relative(ROOT, f)
