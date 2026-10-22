// node --test pipeline/lib/ledger/compact.test.mjs
// The team ledger on a toy league, the delta coding, and the round trip encode -> JSON text ->
// decode against the real long ledger (a 2,000-row sample across competitions and seasons, exact).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { buildTeamLedger, standings } from './team.mjs'
import { encodeClub, encodeIntl, applyDeltas, CLUB_FILES, fileOf, parseScore } from './encode.mjs'
import { decodeCompact } from './decode.mjs'
import { compareClub, compareMatches, compareIntl, stratifiedSample, intlKey } from './roundtrip.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const LEDGER = path.join(ROOT, 'data/ledger')

// a four-team league: every pair home and away, one round per week
function toyLeague(season, teams, scores, slug = 'eng.1') {
  const out = []
  let id = season * 1000, day = 0
  const rounds = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]], [[1, 0], [3, 2]], [[2, 0], [3, 1]], [[3, 0], [2, 1]]]
  rounds.forEach((r, ri) => r.forEach(([h, a], k) => {
    const [hs, as] = scores[ri * 2 + k]
    const d = new Date(Date.UTC(season, 7, 10 + ri * 7 + (k ? 0 : 0)))
    out.push({ id: String(++id), slug, season, seasonLabel: `${season}-${String(season + 1).slice(2)}`, date: d.toISOString().slice(0, 16) + 'Z', homeId: teams[h][0], homeName: teams[h][1], awayId: teams[a][0], awayName: teams[a][1], homeScore: hs, awayScore: as, qualifier: false, stage: 'league' }); day++
  }))
  return out
}
const T = [['1', 'Alpha'], ['2', 'Bravo'], ['3', 'Charlie'], ['4', 'Delta']]

test('team ledger: points, cumulative, positions after complete matchdays', () => {
  // Alpha wins everything, Delta loses everything
  const scores = [[2, 0], [1, 1], [3, 0], [0, 2], [1, 0], [2, 2], [0, 1], [0, 4], [0, 2], [1, 1], [0, 3], [0, 0]]
  const L = buildTeamLedger(toyLeague(2010, T, scores))
  const a = L.seasons.find((s) => s.team === 'Alpha')
  assert.deepEqual([a.P, a.W, a.D, a.L, a.GF, a.GA, a.points, a.pos], [6, 6, 0, 0, 12, 0, 18, 1])
  // final positions follow table points (then GD, GF)
  const byPos = L.seasons.slice().sort((x, y) => x.pos - y.pos)
  for (let i = 1; i < byPos.length; i++) assert.ok(byPos[i - 1].points >= byPos[i].points)
  const rows = L.rows.filter((r) => r.team === 'Alpha')
  assert.deepEqual(rows.map((r) => r.cum.pts), [3, 6, 9, 12, 15, 18])
  assert.ok(rows.every((r) => r.pos === 1))
  assert.equal(a.titleClinch.gamesLeft, 2) // after round 4 Alpha has 12, nobody else can reach it
})

test('team ledger: an unequal matchday has no position; a deduction moves the table', () => {
  const ms = toyLeague(2011, T, [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0], [1, 0]])
  ms[1].date = '2011-12-30T15:00Z' // round 1's second match postponed to the end
  const L = buildTeamLedger(ms, { corrections: { deductions: [{ slug: 'eng.1', season: '2011-12', teamId: '1', points: 10, from: null }], results: [] } })
  const alpha = L.rows.filter((r) => r.team === 'Alpha').sort((x, y) => x.tgn - y.tgn)
  assert.equal(alpha[0].pos, null, 'after round 1 Charlie and Delta have played 0')
  const s = L.seasons.find((x) => x.team === 'Alpha')
  assert.equal(s.deduction, 10)
  assert.equal(s.points, s.pointsOnPitch - 10)
})

test('runs cross seasons and skip seasons outside the competition; truncation and ongoing flags', () => {
  const lose = Array(12).fill([0, 1]) // home side always loses
  const s1 = toyLeague(2002, T, lose)
  const others = [['1', 'Alpha'], ['2', 'Bravo'], ['3', 'Charlie'], ['5', 'Echo']]
  const s3 = toyLeague(2004, T, lose) // Delta back after a season away
  const s2 = toyLeague(2003, others, lose)
  const L = buildTeamLedger([...s1, ...s2, ...s3])
  const delta = L.runs.filter((r) => r.team === 'Delta' && r.test === 'losing')
  // Delta (index 3) loses its home games and wins its away games
  assert.ok(delta.every((r) => r.len >= 1))
  const homeOnly = L.runs.filter((r) => r.team === 'Delta' && r.test === 'home-lost-scoreless')
  assert.equal(homeOnly.length, 1)
  assert.equal(homeOnly[0].len, 6, 'three home defeats in 2002-03 and three in 2004-05, 2003-04 skipped')
  assert.deepEqual(homeOnly[0].seasons.map((p) => p.season), ['2002-03', '2004-05'])
  assert.equal(homeOnly[0].ongoing, true)
})

test('standings: head-to-head tie-break where the league uses it', () => {
  const st = (id, pitch, GF, GA) => ({ teamId: id, pitch, ded: 0, GF, GA })
  const ms = [{ homeId: 'a', awayId: 'b', homeScore: 0, awayScore: 1 }]
  const eng = standings([st('a', 10, 20, 5), st('b', 10, 10, 5)], 'eng.1', ms)
  assert.equal(eng[0].teamId, 'a') // GD
  const esp = standings([st('a', 10, 20, 5), st('b', 10, 10, 5)], 'esp.1', ms)
  assert.equal(esp[0].teamId, 'b') // head-to-head first
})

test('delta coding: per entity, negative steps allowed, nulls refused', () => {
  const t = { cols: ['e', 'x'], data: [[0, 0, 0, 1, 1], [5, 7, 3, 2, 9]] }
  applyDeltas(t, ['x'])
  assert.deepEqual(t.data[1], [5, 2, -4, 2, 7])
  assert.throws(() => applyDeltas({ cols: ['e', 'x'], data: [[0, 0], [1, -1]] }, ['x']), /null/)
  assert.deepEqual(parseScore('2- 1'), [2, 1])
  assert.deepEqual(parseScore('3-3 aet'), [3, 3])
  assert.equal(parseScore('awd'), null)
})

const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const haveLedger = fs.existsSync(path.join(LEDGER, 'player-matches.jsonl'))

test('round trip: club files, a 2,000-row sample across competitions and seasons, exact', { skip: !haveLedger && 'no data/ledger' }, () => {
  const matches = readJsonl(path.join(LEDGER, 'matches.jsonl'))
  const players = readJsonl(path.join(LEDGER, 'player-matches.jsonl'))
  const ords = new Map(readJsonl(path.join(LEDGER, 'ordinals.jsonl')).map((o) => [`${o.id}|${o.athleteId}`, o]))
  const team = buildTeamLedger(matches)
  const byId = new Map(matches.map((m) => [m.id, m]))
  const long = new Map(players.map((p) => [`${p.id}|${p.athleteId}`, p]))
  const longOf = (id, a) => { const row = long.get(`${id}|${a}`); return row && { row, ord: ords.get(`${id}|${a}`), match: byId.get(id) } }
  const decoded = []
  for (const comp of CLUB_FILES) {
    const ms = matches.filter((m) => fileOf(m.slug) === comp)
    const ids = new Set(ms.map((m) => m.id))
    const comps = new Set(ms.map((m) => (m.slug === 'uefa.champions_qual' || (m.slug === 'uefa.champions' && m.qualifier) ? 'uefa.champions:qual' : m.slug)))
    const t = { rows: team.rows.filter((r) => comps.has(r.comp)), seasons: team.seasons.filter((s) => comps.has(s.comp)), runs: team.runs.filter((r) => comps.has(r.comp)) }
    const f = encodeClub({ comp, matches: ms, players: players.filter((p) => ids.has(p.id)), ordOf: (id, a) => ords.get(`${id}|${a}`), team: t, builtAt: 'test', source: {} })
    const d = decodeCompact(JSON.parse(JSON.stringify(f)))
    assert.equal(compareMatches(d, byId).bad.length, 0, `${comp} matches`)
    decoded.push(d)
  }
  const all = decoded.flatMap((d, fi) => d.rows.map((r, i) => ({ fi, i, key: `${r.slug}|${r.season}` })))
  const pick = stratifiedSample(all, (x) => x.key, 2000)
  assert.ok(pick.length >= 1900, `sample ${pick.length}`)
  const strata = new Set(pick.map((p) => all[p].key))
  assert.ok(strata.size >= 70, `strata ${strata.size}`)
  let bad = []
  for (let fi = 0; fi < decoded.length; fi++) bad.push(...compareClub(decoded[fi], longOf, pick.filter((p) => all[p].fi === fi).map((p) => all[p].i)).bad)
  assert.deepEqual(bad.slice(0, 5), [])
})

test('round trip: internationals, 2,000 rows from the first 60k lines, exact', { skip: !fs.existsSync(path.join(LEDGER, 'intl/player-matches.jsonl')) && 'no intl ledger' }, async () => {
  const rows = []
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(LEDGER, 'intl/player-matches.jsonl')), crlfDelay: Infinity })
  for await (const line of rl) { if (!line) continue; const { receipts, sources, field_source, ...r } = JSON.parse(line); rows.push(r); if (rows.length >= 60000) break }
  rl.close()
  const f = encodeIntl({ rows, people: new Map(), builtAt: 'test', source: {} })
  const d = decodeCompact(JSON.parse(JSON.stringify(f)))
  const byKey = new Map(rows.map((r) => [intlKey(r), r]))
  const pick = stratifiedSample(d.rows, (r) => `${r.match_type}|${(r.date ?? '????').slice(0, 3)}`, 2000)
  assert.deepEqual(compareIntl(d, byKey, pick).bad.slice(0, 5), [])
})
