#!/usr/bin/env node
// The international side of the ledger: per-player senior "A" international appearances and goals,
// from RSSSF cap logs (the cap list), the FIFA/UEFA archive and ESPN (lineup detail, second source),
// martj42 (the match spine and competitive scorers), with identity, conflicts, corrections and gates.
// Reads only files on disk; never fetches. Docs: pipeline/docs/intl.md.
//
//   node pipeline/build-intl.mjs              build data/ledger/intl/*
//   node pipeline/build-intl.mjs --gate       build, then the known-answer gates (exit 1 on a fail)
//   node pipeline/build-intl.mjs --review     build, then print the identity review listing
import path from 'node:path'
import { P, writeJson, writeJsonl, rel } from './lib/intl/io.mjs'
import { build } from './lib/intl/ledger.mjs'
import { applyCorrections } from './lib/intl/corrections.mjs'
import { runGates } from './lib/intl/gates.mjs'
import { nameScore } from './lib/intl/names.mjs'
import { loadAthleteStore, attachAthleteStore, applyStated } from './lib/intl/athlete-store.mjs'

const args = new Set(process.argv.slice(2))
const log = (...a) => console.log(...a)
const out = (f) => path.join(P.out, f)

const B = await build({ log })

// ------------------------------------------------ ESPN's athlete-scoped store (data/ledger/fills/athlete-matches.jsonl), before corrections
const store = loadAthleteStore()
B.athleteStore = store ? attachAthleteStore(B, store, { log }) : null
if (!store) log('athlete store: data/ledger/fills/athlete-matches.jsonl not on disk')

// ------------------------------------------------ corrections, last
const corrReport = applyCorrections(P.corrections, B.rows, B.conflicts)
for (const c of corrReport) log(`correction ${c.id}: ${c.applied ? 'applied' : 'NOT applied'}; ${c.changes.join('; ')}; receipts verified ${c.receipts.filter((r) => r.verified).length}/${c.receipts.length}`)

// ------------------------------------------------ recount players after corrections
const rowsByKey = new Map()
for (const r of B.rows) (rowsByKey.get(r.player_key) ?? rowsByKey.set(r.player_key, []).get(r.player_key)).push(r)
B.players = B.players.filter((p) => p.rsssf_slug || rowsByKey.has(p.player_key))
for (const p of B.players) {
  const rs = (rowsByKey.get(p.player_key) ?? []).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.cap_no ?? 0) - (b.cap_no ?? 0)))
  rs.forEach((r, i) => (r.app_no = i + 1))
  const cnt = (f) => rs.filter(f).length
  Object.assign(p.counts, {
    rows: rs.length, rsssf_caps: cnt((r) => r.cap_source === 'rsssf'), archive_only: cnt((r) => r.cap_source === 'archive'), espn_only: cnt((r) => r.cap_source === 'espn'),
    martj42_scorer_only: cnt((r) => r.cap_source === 'martj42-scorer'), with_archive: cnt((r) => r.sources.archive), with_espn: cnt((r) => r.sources.espn),
    athlete_store_only: cnt((r) => r.cap_source === 'athlete-store'), wikidata_only: cnt((r) => r.cap_source === 'wikidata'), with_athlete_store: cnt((r) => r.sources.athlete_store), with_wikidata: cnt((r) => r.sources.wikidata),
    with_minutes: cnt((r) => r.minutes != null), goals: rs.reduce((t, r) => t + (r.goals ?? 0), 0), goals_unknown: cnt((r) => r.goals == null),
    beyond_log: cnt((r) => r.flags.includes('beyond_rsssf_log')),
  })
  p.first = rs[0]?.date ?? null
  p.last = rs.at(-1)?.date ?? null
  if (p.intl_coverage === 'partial') p.badge = `internationals not yet covered: ${rs.length} appearances known from ${[p.counts.archive_only && 'FIFA/UEFA reports', p.counts.espn_only && 'ESPN', p.counts.athlete_store_only && 'the ESPN athlete store', p.counts.wikidata_only && 'Wikidata', p.counts.martj42_scorer_only && 'martj42 scorers'].filter(Boolean).join(', ')}; no cap-by-cap log`
}
// marquee players without a log: complete only when the rows equal the stated totals (lib/intl/athlete-store.mjs STATED)
B.stated = applyStated(B.players)
for (const s of B.stated) log(`stated totals ${s.name}: ${s.found ? `${s.ledger_rows} caps / ${s.ledger_goals} goals in the ledger against ${s.caps} / ${s.goals} stated -> ${s.coverage}` : 'no person in the ledger'}`)

// marquee players with no RSSSF log and nothing in the cached sources: explicit stubs, so the site shows
// the "internationals not yet covered" badge instead of an empty curve
for (const [name, team] of [['Jamie Vardy', 'England'], ['Alexandre Lacazette', 'France']]) {
  const surname = name.split(' ').at(-1)
  if (B.players.some((p) => p.team === team && new RegExp(surname, 'i').test(p.name))) continue
  B.players.push({ player_key: `ip:${team.toLowerCase()}:${name.toLowerCase().replace(/ /g, '-')}:none`, name, team, teams: [team], rsssf_slug: null, rsssf_url: null, intl_coverage: 'none',
    counts: { rows: 0 }, espn_athlete_ids: [], club_join: { espn_athlete_ids: [], name, country: team, birth_year: null, note: 'join on name + country (+ birth year) to the club ledger' },
    badge: 'internationals not yet covered: no RSSSF log, and no cached ESPN or FIFA/UEFA lineup lists him', note: 'marquee player without a log (research/internationals.md); fill from an ESPN athlete-store pull' })
}

// ------------------------------------------------ identity
const { id, slots, ties, splitSlots, logs } = B.identity
const nodeNames = new Map(), nodeCount = new Map()
const addName = (n, name) => { if (!n) return; (nodeNames.get(n) ?? nodeNames.set(n, new Set()).get(n)).add(name); nodeCount.set(n, (nodeCount.get(n) ?? 0) + 1) }
for (const s of slots) { addName(s.n.r, s.r?.name); addName(s.n.a, s.a?.P.name); addName(s.n.e, s.e?.P.name); addName(s.n.g, s.g?.name); addName(s.n.w, s.w?.P.name) }
const keyOfRoot = new Map()
for (const p of B.identity.people.values()) keyOfRoot.set(p.root, p.key)
const edgeTo = new Map() // node -> best direct edge into an r node
for (const e of id.solvedEdges) {
  for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) if (y[0] === 'r' && x[0] !== 'r' && id.find(x) === id.find(y)) {
    const prev = edgeTo.get(x)
    if (!prev || e.votes > prev.votes) edgeTo.set(x, e)
  }
}
const method = (mean) => (mean >= 0.99 ? 'same team-match; every name token found (rules 1-7)' : mean >= 0.89 && mean < 0.91 ? 'same spelling (2+ tokens) in another archive cycle, same team' : mean >= 0.7 ? 'same team-match; single known-as token found (DECO, RONALDO) or full match with shirt bonus' : mean >= 0.55 ? 'same team-match; one shared 4+-letter token, unique both ways (weak)' : 'same team-match; unique equal goal count (elimination, weak)')
const players = {}
const kindName = { r: 'rsssf', a: 'archive', e: 'espn', g: 'martj42', w: 'wikidata' }
const { wHow } = B.identity
// a Wikidata form: how the archive gate's rules paired it, team-match by team-match. "probable" when only the loose
// surname pass (or elimination as a leftover) ever paired it with another source.
const wMethod = (node) => {
  const h = wHow.get(node) ?? {}
  const strong = (h.exact ?? 0) + (h.fuzzy ?? 0) + (h['family+shirt'] ?? 0)
  const parts = Object.entries(h).map(([k, v]) => `${k} ${v}`).join(', ')
  return { how: `Wikidata P710 participant; paired by the archive gate's rules (${parts})`, match: strong ? 'exact' : h.loose ? 'probable' : 'unpaired', counts: h }
}
for (const node of id.parent.keys()) {
  const root = id.find(node)
  const key = keyOfRoot.get(root)
  if (!key) continue
  const P0 = (players[key] ??= { player_key: key, forms: [] })
  const kind = node[0]
  const rNode = [...(id.info.get(root)?.r ?? [])][0]
  const e = edgeTo.get(node)
  let confidence = null, how = null
  let wInfo = null
  if (kind === 'w') wInfo = wMethod(node)
  if (kind === 'r') { confidence = 1; how = 'RSSSF log (the anchor)' }
  else if (e) {
    const co = [...(id.nodeTms.get(node) ?? [])].filter((t) => id.nodeTms.get(rNode)?.has(t)).length
    confidence = +(e.votes / Math.max(co, e.votes)).toFixed(3)
    how = `${method(e.sum / e.votes)}; ${e.votes} of ${co} shared team-matches`
  } else if (rNode) { how = 'linked through another form of the same player'; confidence = 0.8 }
  else { how = 'no RSSSF log: linked by same team-match between archive, ESPN and martj42'; confidence = null }
  const parts = node.split(':')
  if (wInfo) { how = `${wInfo.how}${how ? '; ' + how : ''}`; if (wInfo.match === 'probable') confidence = Math.min(confidence ?? 0.6, 0.6) }
  P0.forms.push({ node, source: kindName[kind], family: kind === 'a' ? parts[1] : undefined, team: kind === 'a' ? parts[2] : kind === 'g' ? parts[1] : undefined, espn_athlete_id: kind === 'e' ? parts[1] : undefined,
    wikidata_qid: kind === 'w' ? parts[1] : undefined, wikidata_match: wInfo?.match,
    names_as_written: [...(nodeNames.get(node) ?? [])].filter(Boolean), team_matches: nodeCount.get(node) ?? 0, confidence, method: how })
  if (wInfo && wInfo.match !== 'unpaired') {
    const q = (P0.wikidata ??= [])
    const wp = B.wd.players.get(parts[1])
    q.push({ qid: parts[1], label: wp?.label ?? null, born: wp?.born ?? null, match: wInfo.match, team_matches: nodeCount.get(node) ?? 0, url: `https://www.wikidata.org/wiki/${parts[1]}` })
  }
}
// athlete-store forms (one ESPN athlete id per person; lib/intl/athlete-store.mjs)
for (const [aid, a] of Object.entries(B.athleteStore?.people ?? {})) {
  const P0 = (players[a.player_key] ??= { player_key: a.player_key, forms: [] })
  P0.forms.push({ node: `s:${aid}`, source: 'espn-athlete-store', espn_athlete_id: aid, names_as_written: [a.name], team_matches: a.rows, confidence: /^ESPN athlete id/.test(a.method) ? 1 : null, method: a.method })
}
for (const p of B.players) if (players[p.player_key]) Object.assign(players[p.player_key], { name: p.name, team: p.team, rsssf_slug: p.rsssf_slug, intl_coverage: p.intl_coverage, espn_athlete_ids: p.espn_athlete_ids, wikidata_qid: p.wikidata_qid, club_join: p.club_join })
// QIDs added to people who have an RSSSF or archive form (the brief's "where a lineup player matches an archive/RSSSF player")
const qidStats = { people_with_qid: 0, rsssf_or_archive_people_with_qid: 0, exact: 0, probable: 0, people_with_two_qids: 0 }
for (const P0 of Object.values(players)) {
  if (!P0.wikidata?.length) continue
  qidStats.people_with_qid++
  if (P0.wikidata.length > 1) qidStats.people_with_two_qids++
  if (P0.forms.some((f) => f.source === 'rsssf' || f.source === 'archive')) {
    qidStats.rsssf_or_archive_people_with_qid++
    P0.wikidata.some((q) => q.match === 'exact') ? qidStats.exact++ : qidStats.probable++
  }
}
B.qidStats = qidStats
// review listing
const named = (n) => `${n} (${[...(nodeNames.get(n) ?? [])].join(' / ')})`
const dupLogs = new Map()
{
  const byTm = new Map()
  for (const s of slots) if (s.r && s.tm) (byTm.get(s.tm) ?? byTm.set(s.tm, []).get(s.tm)).push(s.r)
  for (const list of byTm.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (list[i].slug === list[j].slug || nameScore(list[i].name, list[j].name) < 0.99) continue
    const k = [list[i].slug, list[j].slug].sort().join(' + ')
    dupLogs.set(k, (dupLogs.get(k) ?? 0) + 1)
  }
}
const weak = Object.values(players).flatMap((p) => p.forms.filter((f) => f.confidence != null && f.confidence < 0.8 || /weak/.test(f.method ?? '')).map((f) => ({ player_key: p.player_key, ...f })))
const review = {
  refused_unions: id.rejected.filter((r) => r.why !== 'single weak vote').map((r) => ({ a: named(r.a), b: named(r.b), votes: r.votes, mean: r.mean, why: r.why })),
  single_weak_votes_not_merged: id.rejected.filter((r) => r.why === 'single weak vote').length,
  ambiguous_assignments: { count: ties.length, sample: ties.slice(0, 40) },
  weak_links: weak.sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1)),
  split_slots: splitSlots.map((s) => ({ tm: s.tm, nodes: Object.fromEntries(Object.entries(s.nodes).filter(([, v]) => v).map(([k, v]) => [k, named(v)])), kept: keyOfRoot.get(s.kept) })),
  key_collisions: B.identity.keyCollisions,
  possible_duplicate_rsssf_logs: [...dupLogs].map(([k, n]) => ({ logs: k, shared_team_matches: n })).sort((a, b) => b.shared_team_matches - a.shared_team_matches),
}
writeJson(out('identity.json'), {
  generated_at: new Date().toISOString(),
  method: {
    stage1: 'Per team-match (same martj42 match, same side): each source entry is assigned to an RSSSF cap by name, greedily from the best score, ties refused; leftovers by one unique shared 4+-letter token; archive and ESPN leftovers to each other (shirt number breaks ties); martj42 scorers to whoever the sources say scored, then by unique equal goal count.',
    stage2: 'Union-find over source forms, strongest edges first (votes, then mean score). A person holds at most one RSSSF log; two forms of the same source in the same team-match are different people. A single vote below 0.75 never merges.',
    name_rules: 'pipeline/lib/intl/names.mjs: ASCII fold (NFKD + ø ß æ œ đ ł ı þ ð), lowercase, apostrophes inside words dropped, quoted nicknames kept as tokens, particles ignored, token order ignored, prefix (4+), transliteration keys within one edit (transposition = 1), fewer unmatched tokens and exact nicknames win ties.',
    keys: 'ip:<rsssf slug> for a logged player; ip:<team>:<name>:<first year> for a player known only from the archive, ESPN or martj42.',
    club_join_proposal: 'The club ledger keys on ESPN athlete ids. Join on espn_athlete_ids where a cached ESPN international gives one (the same id space as the club summaries); otherwise on name + country + birth year, once a birth-year source is attached (none is on disk: RSSSF logs and the archive carry no birth dates). The join itself is left for the step after both ledgers exist.',
  },
  stats: { wikidata: qidStats, source_forms: id.parent.size, edges: id.edges.size, refused_unions: review.refused_unions.length, ambiguous_assignments: ties.length, weak_links: weak.length, players: Object.keys(players).length,
    logged_players_with_espn_id: B.players.filter((p) => p.rsssf_slug && p.espn_athlete_ids.length).length, players_with_espn_id: B.players.filter((p) => p.espn_athlete_ids.length).length },
  players,
})
writeJson(out('identity-review.json'), review)

// ------------------------------------------------ outputs
const strip = (c) => { const { _slotKey, ...x } = c; return x }
writeJsonl(out('player-matches.jsonl'), B.rows.sort((a, b) => (a.player_key < b.player_key ? -1 : a.player_key > b.player_key ? 1 : a.app_no - b.app_no)))
writeJsonl(out('matches.jsonl'), B.matches)
writeJsonl(out('conflicts.jsonl'), B.conflicts.map(strip))
writeJsonl(out('join-misses.jsonl'), [...B.joinMisses, ...B.dateDisagreements])
writeJson(out('players.json'), { generated_at: new Date().toISOString(), players: B.players })
const byKind = {}
for (const c of B.conflicts) { const k = c.kind + (c.resolved_by ? ' (resolved)' : ''); byKind[k] = (byKind[k] ?? 0) + 1 }
const missKinds = {}
for (const m of [...B.joinMisses, ...B.dateDisagreements]) missKinds[m.kind + (m.source ? ` ${m.source}` : '')] = (missKinds[m.kind + (m.source ? ` ${m.source}` : '')] ?? 0) + 1
const summary = {
  generated_at: new Date().toISOString(), build_ms: B.ms,
  inputs: { martj42: B.spine.file, goalscorers: B.spine.goalscorersFile, rsssf_caps: rel(P.rsssfCaps), archive: B.archive.counts, espn_summaries: B.espn.matches.length, espn_excluded_non_A: B.espn.excluded.length, wikidata_match_items: B.wikidata.length, corrections: rel(P.corrections) },
  rows: B.rows.length, players: B.players.length,
  players_by_coverage: B.players.reduce((o, p) => ((o[p.intl_coverage] = (o[p.intl_coverage] ?? 0) + 1), o), {}),
  rows_by_cap_source: B.rows.reduce((o, r) => ((o[r.cap_source] = (o[r.cap_source] ?? 0) + 1), o), {}),
  rows_with: { archive: B.rows.filter((r) => r.sources.archive).length, espn: B.rows.filter((r) => r.sources.espn).length, wikidata: B.rows.filter((r) => r.sources.wikidata).length, goal_minutes: B.rows.filter((r) => r.goal_minutes).length, minutes: B.rows.filter((r) => r.minutes != null).length, started_known: B.rows.filter((r) => r.started != null).length, goals_unknown: B.rows.filter((r) => r.goals == null).length },
  matches: B.matches.length, matches_with: { archive: B.matches.filter((m) => m.ids.archive.length).length, espn: B.matches.filter((m) => m.ids.espn.length).length, wikidata: B.matches.filter((m) => m.ids.wikidata.length).length, wikidata_lineup_sides: B.wdTms.size },
  wikidata: B.qidStats,
  join: Object.fromEntries(Object.entries(B.joinStats).map(([k, v]) => [k, { ...v, rate: +(v.joined / Math.max(1, v.total)).toFixed(4) }])),
  join_misses_by_kind: missKinds, conflicts_by_kind: byKind, corrections: corrReport,
  athlete_store: B.athleteStore && { ...B.athleteStore, people: Object.fromEntries(Object.entries(B.athleteStore.people).map(([k, v]) => [k, v])) },
  stated_totals: B.stated,
}
writeJson(out('build-summary.json'), summary)
log(`wrote ${rel(P.out)}/: player-matches.jsonl (${B.rows.length}), players.json (${B.players.length}), matches.jsonl (${B.matches.length}), conflicts.jsonl (${B.conflicts.length}), join-misses.jsonl (${B.joinMisses.length + B.dateDisagreements.length}), identity.json, identity-review.json, build-summary.json`)
log('join', JSON.stringify(summary.join))
log('conflicts', JSON.stringify(byKind))

if (args.has('--review')) {
  log('\n== identity review ==')
  log(`refused unions: ${review.refused_unions.length}`)
  for (const r of review.refused_unions.slice(0, 30)) log(`  ${r.a}  x  ${r.b}  [${r.votes} votes, ${r.why}]`)
  log(`ambiguous assignments (ties refused): ${ties.length}`)
  for (const t of ties.slice(0, 15)) log(`  ${t.tm} ${t.what}: ${JSON.stringify(t)}`)
  log(`weak links: ${weak.length}`)
  for (const w of weak.slice(0, 30)) log(`  ${w.player_key} <- ${w.node} ${JSON.stringify(w.names_as_written)} conf ${w.confidence} (${w.method})`)
  log(`split slots: ${review.split_slots.length}; key collisions: ${review.key_collisions.length}; possible duplicate RSSSF logs: ${review.possible_duplicate_rsssf_logs.length}`)
  for (const d of review.possible_duplicate_rsssf_logs.slice(0, 15)) log(`  ${d.logs}: ${d.shared_team_matches} shared team-matches`)
}

if (args.has('--gate')) {
  const gates = runGates(B, corrReport)
  writeJson(out('gates.json'), { generated_at: new Date().toISOString(), gates })
  log('\n== gates ==')
  for (const g of gates) log(`${g.status.toUpperCase().padEnd(7)} ${g.name}: ${typeof g.got === 'string' ? g.got : JSON.stringify(g.got)?.slice(0, 220)}${g.note ? `\n        note: ${g.note}` : ''}`)
  const fails = gates.filter((g) => g.status === 'fail')
  log(`${gates.filter((g) => g.status === 'pass').length} pass, ${fails.length} fail, ${gates.filter((g) => g.status === 'pending').length} pending -> ${rel(out('gates.json'))}`)
  if (fails.length) process.exitCode = 1
}
