// node --test pipeline/lib/ledger/   (one test per repair rule, synthetic fixtures shaped like the
// ESPN summaries that motivated each rule; event ids in the test names)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseClock, detectCollapsedRoster, dedupeRosterEntries, repairStarter, appearance, checkKeyEventTeams,
  dedupeSubstitutions, goalEvents, reconcileGoals, minuteCap, minutesPlayed, cardsOf, subClocks,
  isQualifier, stageOf, resultFor, nameKey, foldSplitIdListings,
} from './rules.mjs'
import { buildMergeTable } from './merge.mjs'
import { computeOrdinals } from './ordinals.mjs'
import { buildMatch } from './match.mjs'
import { fillClocks, evidenceClocks, mergeFill } from './fill.mjs'
import { personFields } from './encode.mjs'

const ath = (id, name = `P${id}`) => ({ id: String(id), displayName: name })
const stats = (o) => Object.entries(o).map(([abbreviation, value]) => ({ abbreviation, value }))
const entry = (id, o = {}) => ({ athlete: ath(id, o.name), starter: false, subbedIn: false, subbedOut: false, ...o })
const ke = (type, team, parts, clock, o = {}) => ({ type: { type }, team: { id: String(team) }, participants: parts.map((p) => ({ athlete: ath(p) })), clock: { displayValue: clock }, scoringPlay: /goal|penalty---scored/.test(type), period: { number: 2 }, ...o })

test('parseClock: base minute and stoppage', () => {
  assert.deepEqual(parseClock({ displayValue: "67'" }), { min: 67, added: 0 })
  assert.deepEqual(parseClock({ displayValue: "90'+6'" }), { min: 90, added: 6 })
  assert.deepEqual(parseClock({ displayValue: '', value: 1854 }), { min: 30, added: 0 })
  assert.equal(parseClock({ displayValue: '' }), null)
})

test('roster-collapsed: Barca-Udinese 188764 (18 rows of 196222) yes; doubled subs (La Liga 2008-09) no', () => {
  const collapsed = Array.from({ length: 18 }, () => entry(196222))
  assert.equal(detectCollapsedRoster(collapsed).collapsed, true)
  assert.equal(detectCollapsedRoster(collapsed).repeatedId, '196222')
  const doubled = [...Array.from({ length: 18 }, (_, i) => entry(i + 1)), entry(12), entry(13), entry(14), entry(15)]
  assert.equal(detectCollapsedRoster(doubled).collapsed, false, 'rows-unique=4 but each id at most twice')
  assert.equal(detectCollapsedRoster([entry(1), entry(2)]).collapsed, false)
})

test('roster-duplicate-entries: a sub listed twice merges flags and keeps the stats', () => {
  const r = dedupeRosterEntries([
    entry(7, { starter: true, plays: [{ clock: { displayValue: "60'" }, substitution: true }] }),
    entry(7, { subbedIn: true, stats: stats({ APP: 1, G: 0, A: 1 }) }),
    entry(8, { starter: true }),
  ])
  assert.equal(r.duplicates, 1)
  assert.equal(r.entries.length, 2)
  const e = r.entries.find((x) => x.athlete.id === '7')
  assert.equal(e.starter, true); assert.equal(e.subbedIn, true); assert.equal(e.stats.length, 3); assert.equal(e.plays.length, 1)
})

test('split-id-double-listing: Nantes 203760 lists Fae as 31673 and 84869, both #6', () => {
  const { entries } = dedupeRosterEntries([
    entry(84869, { name: 'Emmers Fae', jersey: '6', starter: true }), entry(31673, { name: 'Emerse Fae', jersey: '6', starter: true }),
    entry(46859, { name: 'Mamadou Diallo', jersey: '13', starter: true }), entry(99, { name: 'Other Diallo', jersey: '14' }),
  ])
  const r = foldSplitIdListings(entries)
  assert.equal(r.entries.length, 3)
  assert.deepEqual(r.pairs.map((p) => p.ids), [['31673', '84869']])
  assert.equal(r.entries.find((e) => e.jersey === '6').athlete.id, '31673', 'kept under the older id')
})

test('starter-repair: starter && !subbedIn, and APP = 1 where stats exist (Pique/Toure at Sporting 2008-09)', () => {
  assert.equal(repairStarter(entry(1, { starter: true }), false), true)
  assert.equal(repairStarter(entry(1, { starter: true, subbedIn: true }), false), false)
  assert.equal(repairStarter(entry(1, { starter: true, stats: stats({ APP: 0 }) }), true), false, 'bench flagged starter')
  assert.equal(repairStarter(entry(1, { starter: true, stats: stats({ APP: 1 }) }), true), true)
})

test('appearance: 2006 final squad list 197123 (injured Messi starter, APP 0) is no appearance', () => {
  assert.equal(appearance(entry(45843, { starter: true, stats: stats({ APP: 0 }) }), true).appeared, false)
  assert.equal(appearance(entry(2, { subbedIn: true, stats: stats({ APP: 1 }) }), true).appeared, true)
  assert.equal(appearance(entry(3, { starter: true }), false).started, true, 'no stats era: flags only')
  assert.equal(appearance(entry(4, { stats: stats({ APP: 1 }) }), true).reason, 'app-without-flags')
})

test('keyevents-foreign: Rangers v Hearts events on Hull v Chelsea (678280)', () => {
  const r = checkKeyEventTeams([ke('goal', 999, [1], "10'"), ke('goal', 363, [2], "20'")], ['363', '306'])
  assert.equal(r.foreign, true); assert.deepEqual(r.badTeams, ['999'])
  assert.equal(checkKeyEventTeams([ke('goal', 363, [2], "20'"), { type: { type: 'kickoff' } }], ['363', '306']).foreign, false)
})

test('substitution-dedupe: the same (in, out) pair twice, a minute apart', () => {
  const r = dedupeSubstitutions([ke('substitution', 1, [10, 11], "60'"), ke('substitution', 1, [10, 11], "61'"), ke('substitution', 1, [12, 13], "70'")])
  assert.equal(r.subs.length, 2); assert.equal(r.duplicates, 1)
  assert.equal(r.subs[0].clock.min, 60)
})

test('goal-events: scoringPlay, own goals apart (beneficiary team, defender first), shootout excluded', () => {
  const r = goalEvents([
    ke('goal---header', 1, [9], "12'"), ke('penalty---scored', 1, [9], "50'"),
    ke('own-goal', 1, [55], "70'"), // Gary Speed (Newcastle) on a Tottenham event
    ke('penalty---scored', 2, [77], "", { period: { number: 5 } }),
    ke('penalty---missed', 2, [78], "80'"),
  ])
  assert.equal(r.goals.length, 2); assert.equal(r.goals[1].penalty, true)
  assert.deepEqual(r.ownGoals.map((g) => [g.player, g.team]), [['55', '1']])
})

test('goal-reconcile: Shakhtar 254722 every goal twice; Sevilla 2006-10-15 Messi 80/81; stats tie-break; short fill', () => {
  const g = (scorer, min) => ({ scorer: String(scorer), clock: { min, added: 0 }, penalty: false })
  const twice = reconcileGoals([g(1, 59), g(1, 59), g(2, 83), g(2, 83)], 2, null)
  assert.equal(twice.goals.length, 2); assert.deepEqual(twice.steps, ['goal-dedupe-exact'])
  const near = reconcileGoals([g(45843, 80), g(45843, 81), g(3, 10)], 2, null)
  assert.equal(near.goals.length, 2); assert.deepEqual(near.steps, ['goal-dedupe-near'])
  const brace = reconcileGoals([g(9, 80), g(9, 81)], 2, null)
  assert.equal(brace.goals.length, 2, 'a real brace 80/81 is kept when the score agrees')
  const tie = reconcileGoals([g(5, 10), g(5, 40), g(6, 70)], 2, new Map([['5', 1], ['6', 1]]))
  assert.equal(tie.goals.length, 2); assert.deepEqual(tie.steps, ['goal-stats-tiebreak'])
  const totti = reconcileGoals([g(10293, 30)], 1, new Map([['10293', 0]]))
  assert.equal(totti.goals.length, 1, 'stats G=0 never removes a goal when the score agrees (Totti 2006-07)')
  const short = reconcileGoals([g(1, 10)], 2, new Map([['1', 1], ['2', 1]]))
  assert.equal(short.goals.length, 2); assert.equal(short.filled[0].scorer, '2')
  assert.equal(reconcileGoals([g(1, 10)], 2, null).deficit, 1)
})

test('minute-cap: 90; 120 for AET/shootout or extra-time events in UCL; never in a league (169642)', () => {
  assert.equal(minuteCap('STATUS_FULL_TIME', [], 'uefa.champions'), 90)
  assert.equal(minuteCap('STATUS_FINAL_PEN', [], 'uefa.champions'), 120)
  assert.equal(minuteCap('STATUS_FULL_TIME', [{ type: { type: 'start-extra-time' } }], 'uefa.champions'), 120)
  assert.equal(minuteCap('STATUS_FULL_TIME', [{ type: { type: 'goal' }, period: { number: 3 } }], 'esp.1'), 90)
})

test('minutes: sub clocks, stoppage dropped, red card, cap', () => {
  assert.equal(minutesPlayed({ started: true, onMin: null, offMin: null, redMin: null, cap: 90 }), 90)
  assert.equal(minutesPlayed({ started: false, onMin: 72, offMin: null, redMin: null, cap: 90 }), 18)
  assert.equal(minutesPlayed({ started: false, onMin: 92, offMin: null, redMin: null, cap: 90 }), 0)
  assert.equal(minutesPlayed({ started: true, onMin: null, offMin: 70, redMin: null, cap: 90 }), 70)
  assert.equal(minutesPlayed({ started: true, onMin: null, offMin: null, redMin: 85, cap: 90 }), 85, 'Ronaldo at Portsmouth 2007-08-15')
  assert.equal(minutesPlayed({ started: true, onMin: null, offMin: null, redMin: null, cap: 120 }), 120)
  assert.equal(minutesPlayed({ started: false, onMin: null, offMin: null, redMin: null, cap: 90 }), null)
})

test('cards: from roster plays deduped by minute; stats when no plays', () => {
  const c = cardsOf(entry(1, { plays: [{ clock: { displayValue: "47'" }, yellowCard: true }, { clock: { displayValue: "47'" }, yellowCard: true }, { clock: { displayValue: "85'" }, redCard: true }] }))
  assert.deepEqual(c, { yc: 1, rc: 1, redMin: 85, src: 'plays' })
  assert.equal(cardsOf(entry(2, { stats: stats({ YC: 1, RC: 0 }) })).yc, 1)
})

test('sub clocks: keyEvent first, then the entry plays', () => {
  const subs = dedupeSubstitutions([ke('substitution', 1, [10, 11], "77'")]).subs
  assert.equal(subClocks(entry(10, { subbedIn: true }), subs).onMin, 77)
  assert.equal(subClocks(entry(11, { subbedOut: true }), subs).offMin, 77)
  assert.equal(subClocks(entry(12, { subbedIn: true, plays: [{ substitution: true, clock: { displayValue: "64'" } }] }), subs).onMin, 64)
})

test('qualifier flag and stage: /qualif|play-?off/i, champions_qual, knockout play-offs are proper', () => {
  assert.equal(isQualifier({ slug: 'uefa.champions', seasonSlug: 'qualifying-third-round' }), true)
  assert.equal(isQualifier({ slug: 'uefa.champions', seasonSlug: 'play-off-round' }), true)
  assert.equal(isQualifier({ slug: 'uefa.champions', seasonSlug: 'playoff-round' }), true)
  assert.equal(isQualifier({ slug: 'uefa.champions', seasonSlug: 'knockout-round-playoffs' }), false)
  assert.equal(isQualifier({ slug: 'uefa.champions_qual', seasonSlug: 'x' }), true)
  assert.equal(isQualifier({ slug: 'eng.1', seasonSlug: 'qualifying' }), false)
  assert.equal(stageOf({ slug: 'uefa.champions', seasonSlug: 'quarterfinals' }), 'quarterfinal')
  assert.equal(stageOf({ slug: 'uefa.champions', seasonSlug: 'quarter-finals' }), 'quarterfinal')
  assert.equal(stageOf({ slug: 'uefa.champions', seasonSlug: '2002-second-phase' }), 'second-group')
  assert.equal(resultFor(2, 3), 'L'); assert.equal(nameKey('Ribéry  F.'), 'ribery f')
})

test('buildMatch: collapsed side withheld and recorded with event evidence; other side kept', () => {
  const ev = { id: '188764', slug: 'uefa.champions', season: 2005, date: '2005-09-27T18:45Z', homeId: '83', awayId: '300', homeScore: 4, awayScore: 1, status: 'STATUS_FULL_TIME', seasonSlug: 'group-stage' }
  const home = Array.from({ length: 18 }, () => entry(196222, { starter: true }))
  const away = [...Array.from({ length: 11 }, (_, i) => entry(500 + i, { starter: true })), entry(600, { subbedIn: true })]
  const s = {
    header: { competitions: [{ status: { type: { name: 'STATUS_FULL_TIME' } }, competitors: [{ id: '83', homeAway: 'home', score: '4' }, { id: '300', homeAway: 'away', score: '1' }] }] },
    rosters: [{ homeAway: 'home', team: { id: '83' }, roster: home }, { homeAway: 'away', team: { id: '300' }, roster: away }],
    keyEvents: [ke('goal', 300, [600], "80'"), ke('substitution', 83, [45850, 45843], "70'"), ke('substitution', 300, [600, 510], "60'"), ...[1, 2, 3, 4].map((m) => ke('goal', 83, [9000 + m], `${m}0'`))],
  }
  const b = buildMatch(ev, s)
  const col = b.anomalies.find((a) => a.rule === 'roster-collapsed')
  assert.ok(col); assert.equal(col.team, '83')
  assert.ok(col.evidence.some((x) => x.id === '45843' && x.roles[0].startsWith('off')))
  assert.equal(b.players.filter((p) => p.teamId === '83').length, 0, 'no phantom rows for the collapsed side')
  const scorer = b.players.find((p) => p.athleteId === '600')
  assert.equal(scorer.goals, 1); assert.equal(scorer.subIn, 60); assert.equal(scorer.minutes, 30); assert.equal(scorer.result, 'L')
  assert.equal(b.match.lineup.home.collapsed, true); assert.equal(b.match.quality, 'defective')
})

test('id merge: same name + club + adjacent seasons merges; a shared match vetoes; homonyms elsewhere stay apart', () => {
  const row = (espnId, name, teamId, season, id, date, o = {}) => ({ espnId, athleteId: espnId, name, teamId, season, id, date, jersey: '5', pos: 'D', ...o })
  const players = [
    row('13464', 'Michael Tarnat', '1', 2004, 'a', '2004-09-01'), row('13464', 'Michael Tarnat', '1', 2005, 'b', '2005-09-01'),
    row('85186', 'Michael Tarnat', '1', 2006, 'c', '2006-09-01'),
    row('100', 'Paul Robinson', '2', 2004, 'd', '2004-09-01'), row('200', 'Paul Robinson', '3', 2004, 'e', '2004-09-01'),
    row('300', 'Edu', '4', 2004, 'f', '2004-09-01'), row('400', 'Edu', '4', 2004, 'f', '2004-09-01'),
    row('45843', 'Lionel Messi', '83', 2004, 'g', '2004-10-16'), row('60001', 'Lionel Messi', '83', 2005, 'h', '2005-09-01'), row('60001', 'Lionel Messi', '83', 2005, 'i', '2005-09-08'),
  ]
  const m = buildMergeTable(players)
  assert.equal(m.map['85186'], '13464')
  assert.equal(m.map['100'], undefined); assert.equal(m.map['200'], undefined, 'different clubs: never on name alone')
  assert.equal(m.map['300'] ?? m.map['400'], undefined, 'both in match f: veto')
  assert.equal(m.map['60001'], '45843', 'a star id stays canonical even with fewer rows')
})

test('ordinals: competition and all sequences, qualifiers apart, tgn counts missed matches', () => {
  const matches = [
    { id: '1', slug: 'eng.1', season: 2002, date: '2002-08-17', homeId: 'A', awayId: 'B' },
    { id: '2', slug: 'eng.1', season: 2002, date: '2002-08-24', homeId: 'C', awayId: 'A' },
    { id: '3', slug: 'uefa.champions', season: 2002, date: '2002-08-14', homeId: 'A', awayId: 'Z', qualifier: true },
    { id: '4', slug: 'uefa.champions', season: 2002, date: '2002-09-17', homeId: 'A', awayId: 'Y', qualifier: false },
  ]
  const p = (id, slug, date, started, qualifier = false) => ({ id, slug, season: 2002, date, athleteId: '9', teamId: 'A', started, qualifier })
  const o = computeOrdinals([p('2', 'eng.1', '2002-08-24', true), p('3', 'uefa.champions', '2002-08-14', true, true), p('4', 'uefa.champions', '2002-09-17', false)], matches)
  const by = Object.fromEntries(o.map((x) => [x.id, x]))
  assert.equal(by['2'].tgn, 2, 'missed match 1 still counts'); assert.equal(by['2'].compApp, 1); assert.equal(by['2'].app, 1)
  assert.equal(by['3'].comp, 'uefa.champions:qual'); assert.equal(by['3'].app, null)
  assert.equal(by['4'].comp, 'uefa.champions'); assert.equal(by['4'].compApp, 1); assert.equal(by['4'].app, 2); assert.equal(by['4'].start, null)
})

test('fill clocks: keyEvents first, a 0 clock is unknown, minutes by rule 14 (188764, 205664)', () => {
  const ev = evidenceClocks([{ id: '45843', roles: ["off 70'"] }, { id: '9', roles: ["on 90'+3'"] }])
  assert.deepEqual(ev.get('9'), { on: 90 })
  // record says starter, subOuts 1 at 70' (4190 s): clocks give 70 whatever the record's own minutes
  const messi = fillClocks({ started: true, subIn: null, subOff: 70, sentOff: null, minutes: 71, rc: 0 }, 90, ev.get('45843'))
  assert.equal(messi.subOff, 70); assert.equal(messi.minutes, 70); assert.equal(messi.minutesFrom, 'clocks')
  // Juarez on 33': the record's 61 includes stoppage; the clocks say 57
  assert.equal(fillClocks({ started: false, subIn: 33, subOff: null, sentOff: null, minutes: 61 }, 90, null).minutes, 57)
  // Capone 205664: subbed on, timeStarted 0 (not recorded), no keyEvent: clock and minutes unknown
  const capone = fillClocks({ started: false, subIn: 0, subOff: null, sentOff: null, minutes: null }, 90, null)
  assert.equal(capone.subIn, null); assert.equal(capone.minutes, null); assert.deepEqual(capone.clockUnknown, ['subIn'])
  // a red card with no clock: minutes from the record when it has them
  const red = fillClocks({ started: true, subIn: null, subOff: null, sentOff: 0, rc: 1, minutes: 75 }, 90, null)
  assert.equal(red.sentOff, null); assert.equal(red.minutes, 75); assert.equal(red.minutesFrom, 'record')
})

test('fill merge: withheld sides only, never over a summary row, side from the record (131335, 118600)', () => {
  const matches = [{ id: '1', slug: 'ita.1', season: 2003, date: '2003-11-23T14:00Z', summary: 'ok', homeId: 'H', awayId: 'R', homeScore: 2, awayScore: 4, stage: 'league', lineup: { home: {}, away: {} } }]
  const anomalies = [{ id: '1', rule: 'roster-collapsed', team: 'H', evidence: [] }, { id: '1', rule: 'roster-starters-missing', team: 'R', evidence: [] }]
  const players = [{ id: '1', athleteId: '50', espnId: '50', name: 'Sub Kept', teamId: 'R', date: '2003-11-23T14:00Z' }]
  const row = (espnId, teamId, o = {}) => ({ id: '1', slug: 'ita.1', season: 2003, date: '2003-11-23T14:00Z', espnId, name: `P${espnId}`, teamId, started: true, subIn: null, subOff: null, sentOff: null, minutes: 90, goals: 0, pens: 0, ownGoals: 0, assists: 0, yc: 0, rc: 0, receipt: { url: `u${espnId}` }, fill: 'roster-collapsed', ...o })
  // 12: asked under R, the record's $ref is H. 20 and 21 (merged): one person on both sides, no readable record and
  // no summary row to choose by, so both are dropped
  const fillRows = [row('10', 'R', { goals: 1 }), row('50', 'R'), row('11', 'H'), row('12', 'R'), row('20', 'R'), row('21', 'H'), row('99', 'H', { slug: 'eng.2' })]
  const competitorOf = (u) => ({ u10: 'R', u50: 'R', u11: 'H', u12: 'H' })[u] ?? null
  const f = mergeFill({ fillRows, players, matches, anomalies, mergeMap: { 21: '20' }, untypedPens: new Set(), competitorOf })
  const got = f.added.map((r) => `${r.athleteId}@${r.teamId}`).sort()
  assert.deepEqual(got, ['10@R', '11@H', '12@H'], 'summary row 50 never overridden; 12 moved to H; 20/21 dropped; eng.2 ignored')
  assert.equal(f.added.find((r) => r.athleteId === '10').result, 'W')
  assert.equal(f.added.find((r) => r.athleteId === '10').source, 'athlete-store')
  assert.equal(anomalies[0].filled, 2); assert.equal(anomalies[1].filled, 1)
  assert.equal(f.stats.otherSlug, 1); assert.equal(f.stats.recordOtherSide, 1); assert.equal(f.stats.bothSidesDropped, 2); assert.equal(f.stats.summaryHasAthlete, 1)
})

test('person fields: an implausible ESPN DOB is a namesake record (Torres 24257, Sidibé 30302)', () => {
  const torres = { dob: '2004-08-17', nationality: 'Colombia', position: 'Midfielder', wikidata: { method: 'P3681', born: '1984-03-20' } }
  const t = personFields(torres, '2007-08-15')
  assert.equal(t.dob, '1984-03-20'); assert.equal(t.from, 'wikidata-P3681'); assert.equal(t.nat, null); assert.equal(t.pos, null)
  const sidibe = { dob: '1992-07-29', nationality: 'France', position: 'Defender', wikidata: { method: 'name+nationality+dob', born: '1992-07-29' } }
  const s = personFields(sidibe, '2004-08-07')
  assert.equal(s.dob, null, 'a name join found the namesake too: no DOB'); assert.equal(s.nat, null)
  const ok = personFields({ dob: '1987-06-24', nationality: 'Argentina', position: 'Forward' }, '2004-10-16')
  assert.equal(ok.dob, '1987-06-24'); assert.equal(ok.nat, 'Argentina'); assert.equal(ok.suspect, undefined)
  assert.equal(personFields({ dob: '2003-04-02' }, '2018-04-18').suspect, 15.04, 'under 16 at the first row: kept, listed for review')
  assert.equal(personFields({ dob: '1960-01-01' }, '2002-08-17', '2002-08-17').dob, '1960-01-01', '42 at first and last: kept')
  const old = personFields({ dob: '1960-01-01', nationality: 'Spain' }, '2002-08-17', '2012-05-01')
  assert.equal(old.dob, null, '52 at the last row: nulled'); assert.equal(old.dropped.rule, 'dob-implausible'); assert.equal(old.dropped.ageFirst, 42.63)
})
