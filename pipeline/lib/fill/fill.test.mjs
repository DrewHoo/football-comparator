// Every parsing path of pipeline/fill-espn.mjs, tested against responses already in the cache.
// fetch is trapped: any network attempt fails the test.  node --test pipeline/lib/fill/fill.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
globalThis.fetch = () => { throw new Error('network call in a test') }
process.env.ESPN_GAP_MS ??= '1500'
const C = await import('./espn-cache.mjs')
const P = await import('./parse.mjs')
const A = await import('./athlete-fills.mjs')
const D = await import('./dob.mjs')
const I = await import('./intl-probe.mjs')
const { ClubSquads } = await import('./squads.mjs')
const body = (u) => { const c = C.readCached(u); assert.ok(c.state === 'ok', `not cached: ${u}`); return c.body }

test('stat record: Messi in collapsed Barca-Udinese 188764 started, off 70\' (keyEvent agrees)', () => {
  const r = P.parseStatRecord(body(C.statUrl('uefa.champions', '188764', '83', '45843')))
  assert.equal(r.appearances, 1); assert.equal(r.starts, 1); assert.equal(r.minutes, 70); assert.equal(r.offMin, 70); assert.equal(r.subOuts, 1); assert.equal(r.goals, 0)
})
test('stat record: Messi 188837 is a DNP, no row', () => {
  const r = P.parseStatRecord(body(C.statUrl('uefa.champions', '188837', '83', '45843')))
  assert.equal(r.appearances, 0)
})
test('stat record: Totti in collapsed Bologna v Roma 131335, 90 min and a goal', () => {
  const r = P.parseStatRecord(body(C.statUrl('ita.1', '131335', '104', '10293')))
  assert.equal(r.appearances, 1); assert.equal(r.minutes, 90); assert.equal(r.goals, 1)
})
test('toRow: WC 2014 SF 383241 (AET, unknown extraTime flag) keeps 120 minutes; shootout is a draw', () => {
  const t = { event: '383241', slug: 'fifa.world', season: 2014, date: '2014-07-09T20:00Z', team: '202', opp: '449', home: false, qualifier: false, stage: 'finals', extraTime: null, homeScore: 0, awayScore: 0, rule: 'special', intl: true }
  const url = C.statUrl('fifa.world', '383241', '202', '45843')
  const row = A.toRow(t, '45843', 'Lionel Messi', P.parseStatRecord(body(url)), url, (x) => x)
  assert.equal(row.minutes, 120); assert.equal(row.result, 'D'); assert.equal(row.started, true); assert.equal(row.source, 'athlete-store')
  for (const k of ['id', 'slug', 'season', 'date', 'qualifier', 'stage', 'athleteId', 'espnId', 'name', 'teamId', 'oppId', 'home', 'started', 'subIn', 'subOff', 'sentOff', 'minutes', 'goals', 'pens', 'ownGoals', 'assists', 'yc', 'rc', 'result']) assert.ok(k in row, k)
})
test('toRow: WC 2010 QF 264119 Messi 90 min, L', () => {
  const t = { event: '264119', slug: 'fifa.world', season: 2010, date: '2010-07-03T14:00Z', team: '202', opp: '481', home: true, extraTime: null, homeScore: 0, awayScore: 4 }
  const url = C.statUrl('fifa.world', '264119', '202', '45843')
  const row = A.toRow(t, '45843', 'Lionel Messi', P.parseStatRecord(body(url)), url, (x) => x)
  assert.equal(row.minutes, 90); assert.equal(row.result, 'L')
})
test('evidence check: Messi off 70\' in 188764 agrees with the record', () => {
  const url = C.statUrl('uefa.champions', '188764', '83', '45843')
  const t = { event: '188764', team: '83', opp: '118', home: true, extraTime: false, homeScore: 4, awayScore: 1, evidence: [{ id: '45843', name: 'Lionel Messi', roles: ["off 70'"] }] }
  const row = A.toRow(t, '45843', 'Lionel Messi', P.parseStatRecord(body(url)), url, (x) => x)
  assert.deepEqual(A.checkEvidence(t, '45843', row), [])
  assert.equal(A.checkEvidence({ ...t, evidence: [{ id: '45843', roles: ["off 55'"] }] }, '45843', row).length, 1)
})
test('eventlog: Messi 2005 lists 188764 with the canonical stat URL; played:false items have none', () => {
  const e = P.parseEventlog(body(C.eventlogUrl(2005, '45843')))
  assert.equal(e.count, 51)
  const it = e.items.find((i) => i.event === '188764')
  assert.equal(it.team, '83'); assert.equal(it.league, 'uefa.champions'); assert.equal(it.statUrl, C.statUrl('uefa.champions', '188764', '83', '45843'))
  assert.ok(C.isCachedUrl(it.statUrl))
  assert.ok(e.items.filter((i) => !i.played).every((i) => i.statUrl === null))
})
test('core athlete 22774: ISO dob (date part, not shifted), cm, kg, citizenship, position', () => {
  const a = P.parseAthlete(body(C.athleteUrl('22774')))
  assert.equal(a.dob, '1985-02-05'); assert.equal(a.height, 188); assert.equal(a.nationality, 'Portugal'); assert.equal(a.position, 'Forward'); assert.equal(a.weight, 79)
})
test('site team roster carries the same bio fields (roster strategy parser)', () => {
  const r = P.parseTeamRoster(body(`${C.SITE}eng.1/teams/382/roster`))
  assert.ok(r.length >= 20); assert.ok(r.filter((a) => a.dob).length >= 20)
  assert.ok(r.every((a) => !a.dob || /^\d{4}-\d{2}-\d{2}$/.test(a.dob)))
})
test('dobOf never goes through Date (UTC-midnight pitfall)', () => {
  assert.equal(P.dobOf('1987-06-24T07:00Z'), '1987-06-24'); assert.equal(P.dobOf('5/2/1985'), null)
})
test('Wikidata cross-check: P3681 join for Ronaldo agrees on DOB; a name join needs the ESPN record', () => {
  const wd = D.loadWikidata()
  assert.ok(wd && wd.byEspn.size > 1000)
  const a = P.parseAthlete(body(C.athleteUrl('22774')))
  const w = D.wikidataCheck(wd, '22774', a.name, a)
  assert.equal(w.method, 'P3681'); assert.equal(w.dobAgree, true); assert.equal(w.confidence, 1)
  const n = D.wikidataCheck(wd, 'no-such-id', 'Cristiano Ronaldo', null)
  assert.equal(n?.method, 'name-only')
  const m = D.wikidataCheck(wd, 'no-such-id', 'Cristiano Ronaldo', a)
  assert.equal(m.method, 'name+nationality+dob'); assert.equal(m.qid, 'Q11571')
})
test('year scoreboard parser: eng.1 2003 completed events', () => {
  const evs = P.parseScoreboard(body(C.yearScoreboardUrl('eng.1', 2003)))
  assert.ok(evs.length > 300); assert.ok(evs.every((e) => e.id && e.date && e.homeId && e.awayId))
})
test('presence: 188764 collapsed (not full, 1 distinct starter), 264119 empty, 184000 scorer-only', () => {
  const p1 = P.presence(body(C.summaryUrl('uefa.champions', '188764')))
  assert.equal(p1.sides.home.collapsed, true); assert.equal(p1.rosters, false); assert.equal(p1.starters, false); assert.equal(p1.keyEvents, true)
  const p2 = P.presence(body(C.summaryUrl('fifa.world', '264119')))
  assert.equal(p2.anyRoster, false); assert.equal(p2.keyEvents, false)
  const p3 = P.presence(body(C.summaryUrl('fifa.friendly', '184000')))
  assert.equal(p3.rosters, false); assert.ok(p3.sides.away.scorerOnly)
  assert.equal(P.presence(null).summary, 'empty')
})
test('summarySide: collapsed detection matches the ledger rule', () => {
  const s = body(C.summaryUrl('uefa.champions', '188764'))
  const side = P.summarySide(s, '83')
  assert.equal(side.collapsed, true); assert.equal(side.usable, false); assert.equal(side.entries.length, 0)
})
test('club candidate squad for 131335 (Roma, collapsed) holds Totti, from usable adjacent rosters', () => {
  const sq = new ClubSquads().candidates({ event: '131335', teamId: '104', season: 2003, date: '2003-11-23T14:00Z', evidence: [] })
  assert.ok(sq.candidates.has('10293')); assert.ok(sq.sources.length >= 2); assert.ok(sq.candidates.size >= 18)
})
test('intl probe sampling: 4 strata, tracked team preferred', () => {
  const tracked = new Set(['ARGENTINA'].map((x) => x))
  const evs = Array.from({ length: 20 }, (_, i) => ({ id: String(i), date: `2010-01-${String(i + 1).padStart(2, '0')}T00:00Z`, homeName: i === 1 ? 'Argentina' : 'Togo', awayName: 'Mali' }))
  const s = I.sample(evs, I.trackedTeams())
  assert.equal(s.length, 4); assert.equal(s[0].id, '1')
  void tracked
})
test('Fetcher dry run plans an uncached URL and never fetches', async () => {
  const f = new C.Fetcher({ dryRun: true })
  const url = C.athleteUrl('999999999')
  assert.equal(await f.get(url, 'athlete'), undefined)
  assert.equal(f.planned.get(url), 'athlete')
  assert.ok((await f.get(C.athleteUrl('22774'), 'athlete')).dateOfBirth)
})
test('intl-slugs dry run end to end: exact scoreboards planned, nothing fetched', async () => {
  const f = new C.Fetcher({ dryRun: true })
  const out = await I.run({ fetcher: f, log: () => {} })
  assert.equal(out.slugs.length, I.SLUGS.length)
  assert.equal(f.plannedByKind().scoreboard + (f.hits.get('scoreboard') ?? 0), I.SLUGS.reduce((n, s) => n + s.years.length, 0))
})
test('core competition (match context for player-pull rows outside the index): 269969', () => {
  const c = P.parseCompetition(body(A.competitionUrl('eng.1', '269969')))
  assert.equal(c.date, '2009-08-15T14:00Z'); assert.equal(c.sides.length, 2)
  assert.deepEqual(c.sides.map((s) => [s.team, s.homeAway, s.winner]), [['336', 'home', true], ['379', 'away', false]])
})
test('athlete-fills dry run end to end: targets from the ledger + specials, rows from cached records, nothing fetched', async () => {
  const f = new C.Fetcher({ dryRun: true })
  const res = await A.run({ fetcher: f, players: true })
  assert.ok(res.sides.length >= 7)
  for (const e of ['184000', '264119', '383241', '188764', '188837']) assert.ok(res.sides.some((s) => s.event === e), e)
  const messi = res.rows.filter((r) => r.espnId === '45843').map((r) => r.id).sort()
  assert.deepEqual(messi, ['188764', '264119', '383241'])
  assert.ok(res.rows.some((r) => r.id === '131335' && r.espnId === '10293' && r.goals === 1))
  assert.equal(res.players.length, 2)
  assert.ok(f.plannedByKind().stat > 0 && f.fetched === 0)
  assert.ok(f.planned.has(C.statUrl('fifa.friendly', '184000', '202', '45843')), 'Messi debut record planned')
})
