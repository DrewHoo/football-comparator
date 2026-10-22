#!/usr/bin/env node
// The compact ledger the site ships: data/ledger/compact/<comp>.json for eng.1, esp.1, ita.1,
// ger.1, fra.1, uefa.champions (with its qualifiers) and intl.json, from the long ledger files as
// they are on disk. Never fetches. Layout and rules: pipeline/docs/compact.md.
//
//   node pipeline/encode-ledger.mjs             # encode every file, round-trip check, sizes -> manifest.json
//   node pipeline/encode-ledger.mjs --no-intl   # club files only (the intl read is ~470 MB)
//   node pipeline/encode-ledger.mjs --gate      # decode the files on disk and run the gates through them; exit 1 on a FAIL
//   node pipeline/encode-ledger.mjs --project   # also a synthetic full-scope club file, to measure the projection
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { encodeClub, encodeIntl, CLUB_FILES, fileOf } from './lib/ledger/encode.mjs'
import { decodeCompact } from './lib/ledger/decode.mjs'
import { buildTeamLedger, teamCorrections } from './lib/ledger/team.mjs'
import { compareClub, compareMatches, compareIntl, stratifiedSample, intlKey } from './lib/ledger/roundtrip.mjs'
import { clubView, runClubSeasonGates, runFactoidGates } from './lib/ledger/evaluate.mjs'
import { runTeamGates } from './lib/ledger/team-gates.mjs'
import { computeOrdinals } from './lib/ledger/ordinals.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER = path.join(ROOT, 'data/ledger')
const OUT = path.join(LEDGER, 'compact')
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)

const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const gz = (s) => zlib.gzipSync(s, { level: 9 }).length
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`
const corrFile = path.join(ROOT, 'data/corrections/teams.json')
const corrections = teamCorrections(fs.existsSync(corrFile) ? readJson(corrFile) : null)

// the intl rows without receipts and sources (the compact file links the player's RSSSF page instead)
async function readIntl() {
  const KEEP = ['player_key', 'player', 'team', 'opponent', 'date', 'match_id', 'match_type', 'tournament', 'competition_rsssf', 'competitive', 'venue', 'score',
    'cap_no', 'app_no', 'started', 'on_min', 'off_min', 'off_reason', 'minutes', 'goals', 'goal_minutes', 'cap_source', 'flags']
  const rows = []
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(LEDGER, 'intl/player-matches.jsonl')), crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    const r = JSON.parse(line)
    const o = {}
    for (const k of KEEP) if (r[k] !== undefined) o[k] = r[k]
    rows.push(o)
  }
  const people = new Map(readJson(path.join(LEDGER, 'intl/players.json')).players.map((p) => [p.player_key, p]))
  return { rows, people }
}

function sizes(file) {
  const parts = {}
  for (const k of ['rows', 'matches', 'entities', 'teamMatches', 'teamSeasons', 'runs', 'strings', 'alias', 'nameAlt']) if (file[k]) { const s = JSON.stringify(file[k]); parts[k] = { raw: s.length, gz: gz(s) } }
  const s = JSON.stringify(file)
  return { raw: s.length, gz: gz(s), parts, text: s }
}

if (has('--gate')) { await gate(); process.exit(process.exitCode ?? 0) }

// ---- encode
const t0 = Date.now()
const matches = readJsonl(path.join(LEDGER, 'matches.jsonl'))
const players = readJsonl(path.join(LEDGER, 'player-matches.jsonl'))
const ordinals = readJsonl(path.join(LEDGER, 'ordinals.jsonl'))
const build = readJson(path.join(LEDGER, 'build.json'))
const merge = readJson(path.join(LEDGER, 'id-merge.json'))
const ordMap = new Map(ordinals.map((o) => [`${o.id}|${o.athleteId}`, o]))
const ordOf = (id, a) => ordMap.get(`${id}|${a}`)
const team = buildTeamLedger(matches, { corrections })
const builtAt = new Date().toISOString()
const source = { ledgerBuiltAt: build.builtAt, rulesVersion: build.rulesVersion, mergeBuiltAt: merge.builtAt, mergedIds: merge.stats.merged, summaries: build.counts.ok, teamCorrections: corrections.deductions.length + corrections.results.length }
fs.mkdirSync(OUT, { recursive: true })
const manifest = { builtAt, source, files: {} }
const matchById = new Map(matches.map((m) => [m.id, m]))
const longMap = new Map(players.map((p) => [`${p.id}|${p.athleteId}`, p]))
const longOf = (id, a) => { const row = longMap.get(`${id}|${a}`); return row && { row, ord: ordOf(id, a), match: matchById.get(id) } }
const sampleRT = { checked: 0, bad: [] }, fullRT = { checked: 0, bad: [] }, matchRT = { checked: 0, bad: [] }
const decodedClub = []

for (const comp of CLUB_FILES) {
  const ms = matches.filter((m) => fileOf(m.slug) === comp)
  const ids = new Set(ms.map((m) => m.id))
  const ps = players.filter((p) => ids.has(p.id))
  const compKeys = new Set(ms.map((m) => (m.slug === 'uefa.champions_qual' || (m.slug === 'uefa.champions' && m.qualifier) ? 'uefa.champions:qual' : m.slug)))
  const t = { rows: team.rows.filter((r) => compKeys.has(r.comp)), seasons: team.seasons.filter((s) => compKeys.has(s.comp)), runs: team.runs.filter((r) => compKeys.has(r.comp)) }
  const file = encodeClub({ comp, matches: ms, players: ps, ordOf, team: t, builtAt, source })
  const sz = sizes(file)
  fs.writeFileSync(path.join(OUT, `${comp}.json`), sz.text)
  // round trip through the text, as the site will read it
  const d = decodeCompact(JSON.parse(sz.text))
  decodedClub.push(d)
  const full = compareClub(d, longOf)
  fullRT.checked += full.checked; fullRT.bad.push(...full.bad)
  const mt = compareMatches(d, matchById)
  matchRT.checked += mt.checked; matchRT.bad.push(...mt.bad)
  manifest.files[`${comp}.json`] = { raw: sz.raw, gz: sz.gz, counts: file.counts, parts: Object.fromEntries(Object.entries(sz.parts).map(([k, v]) => [k, v])) }
  console.log(`${comp.padEnd(15)} ${String(file.counts.rows).padStart(7)} rows ${String(file.counts.entities).padStart(6)} entities ${String(file.counts.matches).padStart(6)} matches (${file.counts.cachedMatches} cached)  ${mb(sz.raw).padStart(9)} raw ${mb(sz.gz).padStart(9)} gz`)
}

// the 2,000-row sample across competitions and seasons (the full check above covers every row too)
{
  const all = decodedClub.flatMap((d, fi) => d.rows.map((r, i) => ({ fi, i, key: `${r.slug}|${r.season}` })))
  const pick = stratifiedSample(all, (x) => x.key, 2000)
  const byFile = new Map()
  for (const p of pick) { const l = byFile.get(all[p].fi) || []; l.push(all[p].i); byFile.set(all[p].fi, l) }
  for (const [fi, idx] of byFile) { const r = compareClub(decodedClub[fi], longOf, idx); sampleRT.checked += r.checked; sampleRT.bad.push(...r.bad) }
  sampleRT.strata = new Set(pick.map((p) => all[p].key)).size
}
console.log(`round trip (club): sample ${sampleRT.checked} rows over ${sampleRT.strata} competition-seasons, ${sampleRT.bad.length} differences; every row ${fullRT.checked}, ${fullRT.bad.length} differences; matches ${matchRT.checked}, ${matchRT.bad.length} differences`)
for (const b of [...sampleRT.bad, ...fullRT.bad, ...matchRT.bad].slice(0, 10)) console.log('  ', JSON.stringify(b))
manifest.roundTrip = { club: { sample: { checked: sampleRT.checked, strata: sampleRT.strata, differences: sampleRT.bad.length }, all: { checked: fullRT.checked, differences: fullRT.bad.length }, matches: { checked: matchRT.checked, differences: matchRT.bad.length } } }

// ---- internationals
if (!has('--no-intl')) {
  const ti = Date.now()
  const { rows, people } = await readIntl()
  const file = encodeIntl({ rows, people, builtAt, source: { intlBuiltAt: readJson(path.join(LEDGER, 'intl/build-summary.json')).built_at ?? null, rows: rows.length } })
  const sz = sizes(file)
  fs.writeFileSync(path.join(OUT, 'intl.json'), sz.text)
  const d = decodeCompact(JSON.parse(sz.text))
  const byKey = new Map(rows.map((r) => [intlKey(r), r]))
  const dupKeys = rows.length - byKey.size
  const all = compareIntl(d, byKey)
  const pick = stratifiedSample(d.rows, (r) => `${r.match_type}|${(r.date ?? '????').slice(0, 3)}`, 2000)
  const smp = compareIntl(d, byKey, pick)
  manifest.files['intl.json'] = { raw: sz.raw, gz: sz.gz, counts: file.counts, parts: sz.parts }
  manifest.roundTrip.intl = { sample: { checked: smp.checked, differences: smp.bad.length }, all: { checked: all.checked, differences: all.bad.length }, duplicateKeys: dupKeys }
  console.log(`${'intl'.padEnd(15)} ${String(file.counts.rows).padStart(7)} rows ${String(file.counts.entities).padStart(6)} entities  ${mb(sz.raw).padStart(9)} raw ${mb(sz.gz).padStart(9)} gz  (${((Date.now() - ti) / 1000).toFixed(1)} s)`)
  console.log(`round trip (intl): sample ${smp.checked} rows, ${smp.bad.length} differences; every row ${all.checked}, ${all.bad.length} differences${dupKeys ? ` (${dupKeys} duplicate row keys)` : ''}`)
  for (const b of [...smp.bad, ...all.bad].slice(0, 10)) console.log('  ', JSON.stringify(b))
}

// ---- projection to full scope
manifest.projection = projectFull(manifest, matches, players)
if (has('--project')) manifest.projection.synthetic = synthetic(matches, players)
for (const [f, p] of Object.entries(manifest.projection.files)) console.log(`projected ${f.padEnd(20)} ${String(p.rows).padStart(8)} rows  ${mb(p.raw).padStart(9)} raw ${mb(p.gz).padStart(9)} gz${p.gz > 10 * 1048576 ? '  OVER 10 MB gz: split' : ''}`)
if (manifest.projection.synthetic) { const s = manifest.projection.synthetic; console.log(`synthetic full-scope ${s.comp}: ${s.rows} rows, ${s.entities} entities: ${mb(s.raw)} raw, ${mb(s.gz)} gz (the bytes-per-row projection said ${mb(s.projectedGz)} gz)`) }
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n')
console.log(`compact: ${((Date.now() - t0) / 1000).toFixed(1)} s; data/ledger/compact/manifest.json`)
if ((manifest.roundTrip.club.all.differences || manifest.roundTrip.club.matches.differences || manifest.roundTrip.intl?.all.differences)) { console.error('ROUND TRIP FAILED'); process.exitCode = 1 }

/**
 * Full-scope sizes from what's cached: every match is already in each file (the index lists them
 * all), so only the rows and entities grow. Rows per comp = all played matches x the cached
 * matches' rows per match; entities = rows / the rows-per-entity of a complete league (measured on
 * the 306-match seasons that are fully cached, scaled by career length; see compact.md). Bytes per
 * row and per entity are the cached file's own gz bytes, which is close because the layout is
 * columnar and gzip is near-linear in rows.
 */
function projectFull(manifest, matches, players) {
  const files = {}
  for (const comp of CLUB_FILES) {
    const f = manifest.files[`${comp}.json`]
    const ms = matches.filter((m) => fileOf(m.slug) === comp)
    const played = ms.filter((m) => m.homeScore != null).length
    const perMatch = f.counts.rows / Math.max(1, f.counts.cachedMatches)
    const rows = Math.round(played * perMatch)
    // distinct players per row at full scope: a 24-season top flight has ~2,800 players for ~250k
    // rows (0.011); the Champions League churns more (qualifier sides, short runs), say 0.06
    const entities = Math.round(rows * (comp === 'uefa.champions' ? 0.06 : 0.011))
    const p = f.parts
    const other = f.gz - p.rows.gz - p.entities.gz - (p.alias?.gz ?? 0) - (p.nameAlt?.gz ?? 0)
    const otherRaw = f.raw - p.rows.raw - p.entities.raw - (p.alias?.raw ?? 0) - (p.nameAlt?.raw ?? 0)
    const gzv = other + (p.rows.gz / f.counts.rows) * rows + (p.entities.gz / f.counts.entities) * entities
    const rawv = otherRaw + (p.rows.raw / f.counts.rows) * rows + (p.entities.raw / f.counts.entities) * entities
    files[`${comp}.json`] = { rows, entities, raw: Math.round(rawv), gz: Math.round(gzv), perMatch: Number(perMatch.toFixed(2)) }
  }
  if (manifest.files['intl.json']) files['intl.json'] = { rows: manifest.files['intl.json'].counts.rows, entities: manifest.files['intl.json'].counts.entities, raw: manifest.files['intl.json'].raw, gz: manifest.files['intl.json'].gz, note: 'already full scope' }
  const total = Object.values(files).reduce((a, f) => ({ rows: a.rows + f.rows, raw: a.raw + f.raw, gz: a.gz + f.gz }), { rows: 0, raw: 0, gz: 0 })
  return { files, total, method: 'bytes per row of the cached file x (played matches x cached rows per match); entities at 0.011 per row (0.06 UCL)' }
}

/**
 * A synthetic full-scope Premier League file: the fully cached Bundesliga 2002-03 season (306
 * matches, every summary) tiled into each eng.1 season's real fixtures, with players rotated so a
 * career lasts about five seasons. Measures what bytes-per-row extrapolation can miss (deltas over
 * a dense schedule, entity counts).
 */
function synthetic(matches, players) {
  const tmplM = matches.filter((m) => m.slug === 'ger.1' && m.season === 2002).sort((a, b) => (a.date < b.date ? -1 : 1))
  const tmplIds = new Set(tmplM.map((m) => m.id))
  const tmplP = players.filter((p) => tmplIds.has(p.id))
  const byMatch = new Map()
  for (const p of tmplP) { const l = byMatch.get(p.id) || []; l.push(p); byMatch.set(p.id, l) }
  const target = matches.filter((m) => m.slug === 'eng.1' && m.homeScore != null).sort((a, b) => (a.date < b.date ? -1 : 1))
  const seasons = [...new Set(target.map((m) => m.season))]
  const synthM = [], synthP = []
  // a seeded random template match for each real fixture, so no season repeats another's byte
  // sequence (plain tiling hands gzip the same 8,000-row runs 24 times and reads 3x too small)
  let x = 7
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (const s of seasons) {
    const tm = target.filter((m) => m.season === s)
    tm.forEach((m) => {
      const src = tmplM[Math.floor(rnd() * tmplM.length)]
      const nm = { ...m, summary: 'ok', stats: true, assistsReliable: true }
      synthM.push(nm)
      for (const p of byMatch.get(src.id) || []) {
        const home = p.home
        // player identity: the template id plus a five-season career slot, offset per template
        // match so the same template row doesn't always map to the same synthetic player
        const career = Math.floor((s + (Number(p.athleteId) % 5)) / 5)
        const aid = String(Number(p.athleteId) + career * 10000000)
        synthP.push({ ...p, id: m.id, slug: 'eng.1', season: s, date: m.date, athleteId: aid, espnId: aid, teamId: home ? m.homeId : m.awayId, oppId: home ? m.awayId : m.homeId })
      }
    })
  }
  const ords = computeOrdinals(synthP, synthM)
  const om = new Map(ords.map((o) => [`${o.id}|${o.athleteId}`, o]))
  const t = buildTeamLedger(synthM, {})
  const file = encodeClub({ comp: 'eng.1', matches: synthM, players: synthP, ordOf: (id, a) => om.get(`${id}|${a}`), team: t, builtAt: 'synthetic', source: {} })
  const s = JSON.stringify(file)
  const f = manifest.files['eng.1.json']
  const projectedGz = f.gz - f.parts.rows.gz - f.parts.entities.gz + (f.parts.rows.gz / f.counts.rows) * synthP.length + (f.parts.entities.gz / f.counts.entities) * file.counts.entities
  return { comp: 'eng.1 (Bundesliga 2002-03 matches drawn at random into every eng.1 fixture)', rows: synthP.length, entities: file.counts.entities, raw: s.length, gz: gz(s), projectedGz: Math.round(projectedGz) }
}

// ---- gates through the decoded compact files on disk
async function gate() {
  const files = CLUB_FILES.map((c) => path.join(OUT, `${c}.json`))
  for (const f of files) if (!fs.existsSync(f)) { console.error(`missing ${f}: run node pipeline/encode-ledger.mjs first`); process.exit(2) }
  const decoded = files.map((f) => decodeCompact(readJson(f)))
  const view = clubView(decoded)
  const clubRows = readJson(path.join(ROOT, 'data/gates/club-seasons.json')).rows
  const cs = runClubSeasonGates(clubRows, view)
  console.log('club-season gates (data/gates/club-seasons.json), compact vs expected_after_repair:')
  for (const r of cs) console.log(`${r.status.padEnd(5)} ${r.gate}${r.got ? `: compact ${JSON.stringify(r.got)} | expected ${JSON.stringify(r.expected)} | known ${JSON.stringify(r.known)}` : ''}${r.diffs?.length ? ` | ${r.diffs.join('; ')}` : ''}${r.why ? ` | ${r.why}` : ''}`)
  const n = (rs, s) => rs.filter((r) => r.status === s).length
  console.log(`club-season gates: ${n(cs, 'PASS')} pass, ${n(cs, 'FAIL')} fail, ${n(cs, 'SKIP')} skipped (club's matches not all cached), ${n(cs, 'ERROR')} error`)

  const fg = runFactoidGates(readJson(path.join(ROOT, 'data/gates/factoids.json')).gates, view)
  console.log('\nfactoid gates (status reproducible-in-full):')
  for (const r of fg) console.log(`${r.status.padEnd(5)} ${r.gate}${r.variant ? ` [${r.variant}]` : ''}${r.subject ? ` · ${r.subject}` : ''}${r.kind ? ` ${r.kind}` : ''}${r.status === 'SKIP' ? `: ${r.why}` : `: compact ${JSON.stringify(r.got)}${r.rank != null ? ` rank ${r.rank}` : ''}${r.apps != null ? ` (${r.apps} apps, ${r.starts} starts)` : ''} | expected ${JSON.stringify(r.expected)}${r.diffs.length ? ` | ${r.diffs.join('; ')}` : ''}`}`)
  console.log(`factoid gates: ${n(fg, 'PASS')} pass, ${n(fg, 'FAIL')} fail, ${n(fg, 'SKIP')} skipped (seasons not cached)`)

  // the team gates over the decoded matches tables (the same team.mjs the build used)
  const tg = runTeamGates(readJson(path.join(ROOT, 'data/gates/team-factoids.json')).gates, view.matches, { corrections })
  // and the shipped team-season table must equal a rebuild from the shipped matches
  const rebuilt = buildTeamLedger(view.matches, { corrections })
  const key = (s) => `${s.comp}|${s.season}|${s.teamId}`
  const shipped = new Map(decoded.flatMap((d) => d.teamSeasons).map((s) => [key(s), s]))
  let tsDiff = 0
  for (const s of rebuilt.seasons) { const t = shipped.get(key(s)); if (!t || t.points !== s.points || t.pos !== s.pos || t.GF !== s.GF || JSON.stringify(t.relegationClinch) !== JSON.stringify(s.relegationClinch)) tsDiff++ }
  console.log(`\nteam gates (data/gates/team-factoids.json) through the decoded matches tables:`)
  for (const r of tg) if (r.status !== 'SKIP') console.log(`${r.status.padEnd(6)} ${r.gate} · ${r.subject ?? ''} ${r.season ?? ''} ${r.kind}: ${JSON.stringify(r.got)}${r.rank != null ? ` rank ${r.rank}` : ''}${r.diffs?.length ? ` | ${r.diffs.join('; ')}` : ''}`)
  console.log(`team gates: ${n(tg, 'PASS')} pass, ${n(tg, 'FAIL')} fail, ${n(tg, 'RECORD')} recorded, ${n(tg, 'SKIP')} not checkable in full; shipped team-seasons vs rebuild: ${shipped.size} rows, ${tsDiff} differ`)
  fs.writeFileSync(path.join(OUT, 'gates.json'), JSON.stringify({ builtAt: new Date().toISOString(), clubSeasons: cs, factoids: fg, teams: tg, teamSeasonRebuildDiffs: tsDiff }, null, 1) + '\n')
  if ([...cs, ...fg, ...tg].some((r) => r.status === 'FAIL' || r.status === 'ERROR') || tsDiff) process.exitCode = 1
}
