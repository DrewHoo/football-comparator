// ESPN's athlete-scoped store as an international source (pipeline/docs/intl.md §Athlete store).
// The fill job (pipeline/fill-espn.mjs --job athlete-fills) wrote one row per appearance to
// data/ledger/fills/athlete-matches.jsonl, in the club ledger's row shape. Rows with `intl: true` are senior
// "A" internationals: the special sides (Messi's debut 184000, the empty WC 2010 QF/final and WC 2014 SF
// summaries) and the whole national-team careers of Vardy (165648) and Lacazette (131752), the two marquee
// players without an RSSSF log. Rows flagged `youth` (U-20, Olympics) and club rows are left out.
//
// Precedence (docs/intl.md §Precedence):
//   caps     RSSSF > archive > ESPN summary > athlete store > Wikidata > martj42 scorer row
//   started, on/off, minutes: the athlete store only where no other source has them (a disagreement of more
//            than 2 minutes, or on started, is a conflict, the other source kept)
//   goals    RSSSF > archive > ESPN summary > athlete store > Wikidata > martj42
//
// Identity: one ESPN athlete id is one person. A person is found by the id (players.json espn_athlete_ids, or the
// Wikidata P3681 id in club_join), else by name inside each team-match the store and the ledger share (unique
// nameScore >= 0.99, or a unique single known-as token at 0.75), voting across the athlete's matches. With
// neither, the athlete becomes a person of his own (key ip:<team>:<name>:<year>, coverage partial).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './io.mjs'
import { canonTeam } from './spine.mjs'
import { nameScore } from './names.mjs'
import { unloggedKey } from './identity.mjs'
import { fillClocks } from '../ledger/fill.mjs'

export const ATHLETE_STORE = {
  rows: path.join(ROOT, 'data/ledger/fills/athlete-matches.jsonl'),
  sides: path.join(ROOT, 'data/ledger/fills/athlete-fills.json'),
}

// Stated career totals for marquee players without an RSSSF log: research/intl-gap.md, marquee table
// (Wikipedia's figures, 2026-10). With no cap-by-cap log, coverage is `complete` only when the ledger's rows
// equal both stated totals.
export const STATED = [
  { team: 'England', name: 'Jamie Vardy', espn: '165648', caps: 26, goals: 7, source: 'research/intl-gap.md marquee table (Wikipedia, 2026-10): 26 caps / 7 goals' },
  { team: 'France', name: 'Alexandre Lacazette', espn: '131752', caps: 16, goals: 3, source: 'research/intl-gap.md marquee table (Wikipedia, 2026-10): 16 caps / 3 goals' },
]

export function loadAthleteStore() {
  if (!fs.existsSync(ATHLETE_STORE.rows)) return null
  const all = fs.readFileSync(ATHLETE_STORE.rows, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const senior = all.filter((r) => r.intl === true && r.youth !== true)
  const nations = new Map()
  if (fs.existsSync(ATHLETE_STORE.sides)) for (const p of JSON.parse(fs.readFileSync(ATHLETE_STORE.sides, 'utf8')).players ?? []) if (p.nation) nations.set(String(p.id), p.nation)
  return { senior, youth: all.filter((r) => r.youth === true).length, club: all.filter((r) => r.intl !== true && r.youth !== true).length, nations }
}

const day = (d) => Math.round(Date.parse(String(d).slice(0, 10)) / 864e5)

/**
 * Attach the store's senior rows to B (the result of ledger.mjs build): new rows into B.rows, detail onto
 * existing rows, new conflicts into B.conflicts, new people into B.players. Returns a report.
 */
export function attachAthleteStore(B, store, { log = () => {} } = {}) {
  const { spine } = B
  const rep = { rows: store.senior.length, youth_excluded: store.youth, club_rows_ignored: store.club, joined: 0, join_missed: [], attached: 0, added: 0, beyond_log: 0, not_in_rsssf: 0,
    filled: { started: 0, minutes: 0, goals: 0 }, conflicts: {}, people: {}, new_people: 0 }
  // ESPN national-team id -> name, from the cached A-international summaries (both sides' headers)
  const teamName = new Map()
  for (const m of B.espn.matches) for (const s of ['home', 'away']) { const x = m.sides?.[s]; if (x?.teamId && x.team && !teamName.has(x.teamId)) teamName.set(x.teamId, x.team) }
  const byTeam = new Map()
  for (const sm of spine.matches) for (const t of [sm._H, sm._A]) (byTeam.get(t) ?? byTeam.set(t, []).get(t)).push(sm)
  const scorersOf = (mid, team) => (spine.scorers.get(mid) ?? []).filter((g) => g.team === team)

  // ---- join every row to the spine
  const joined = []
  for (const r of store.senior) {
    const team = teamName.get(String(r.teamId)) ?? store.nations.get(String(r.espnId)) ?? null
    const opp = teamName.get(String(r.oppId)) ?? null
    const date = r.date.slice(0, 10)
    let sm = null, how = null
    if (team && opp) { const j = spine.lookup(date, team, opp); if (j) (sm = j.match), (how = `teams+date offset ${j.offset}`) }
    if (!sm && team) {
      const near = (byTeam.get(canonTeam(team)) ?? []).filter((m) => Math.abs(m._day - day(date)) <= 1)
      if (near.length === 1) (sm = near[0]), (how = `team+date (opponent ${r.oppId} not named in the cache)`)
    }
    const side = sm ? spine.sideOf(sm, team) : null
    if (!sm || !side) { rep.join_missed.push({ event: r.id, date, team: team ?? r.teamId, opponent: opp ?? r.oppId, athlete: r.espnId, name: r.name }); continue }
    joined.push({ r, sm, side, team: side === 'home' ? sm.home : sm.away, how })
  }
  rep.joined = joined.length

  // ---- the ledger's rows by team-match, and people by ESPN id
  const rowsByTm = new Map()
  for (const row of B.rows) {
    if (!row.match_id) continue
    const k = `${row.match_id}|${row.team}`
    ;(rowsByTm.get(k) ?? rowsByTm.set(k, []).get(k)).push(row)
  }
  const playerByKey = new Map(B.players.map((p) => [p.player_key, p]))
  const byEspn = new Map()
  for (const p of B.players) for (const id of [...(p.espn_athlete_ids ?? []), ...(p.club_join?.espn_athlete_ids_wikidata ?? [])]) if (!byEspn.has(String(id))) byEspn.set(String(id), p.player_key)

  // ---- one person per athlete id
  const byAthlete = new Map()
  for (const j of joined) (byAthlete.get(String(j.r.espnId)) ?? byAthlete.set(String(j.r.espnId), []).get(String(j.r.espnId))).push(j)
  const personOf = new Map()
  for (const [aid, js] of byAthlete) {
    const exact = byEspn.get(aid)
    const votes = new Map()
    for (const j of js) {
      const cands = (rowsByTm.get(`${j.sm.match_id}|${j.team}`) ?? []).map((row) => ({ row, s: row.sources.espn?.athlete_id === aid ? 2 : nameScore(j.r.name, row.player) })).filter((c) => c.s >= 0.75).sort((a, b) => b.s - a.s)
      if (!cands.length || (cands[1] && cands[1].s === cands[0].s && cands[1].row.player_key !== cands[0].row.player_key)) continue
      votes.set(cands[0].row.player_key, (votes.get(cands[0].row.player_key) ?? 0) + 1)
    }
    const ranked = [...votes].sort((a, b) => b[1] - a[1])
    let key = exact ?? ranked[0]?.[0] ?? null, method
    if (exact) method = `ESPN athlete id ${aid} (players.json espn_athlete_ids or Wikidata P3681)${ranked.length ? `; name votes ${ranked.map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}`
    else if (key) method = `name inside ${ranked[0][1]} of ${js.length} shared team-matches${ranked.length > 1 ? ` (also ${ranked.slice(1).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`
    if (!key) {
      const first = js.map((j) => j.sm.date).sort()[0]
      const u = unloggedKey(js[0].team, { espnFull: js[0].r.name }, first)
      key = playerByKey.has(u.key) ? `${u.key}~as` : u.key
      const p = { player_key: key, name: u.name, team: js[0].team, teams: [js[0].team], rsssf_slug: null, rsssf_url: null, intl_coverage: 'partial', counts: {}, caps_stated: null, goals_stated: null,
        first: null, last: null, espn_athlete_ids: [aid], wikidata_qid: null, club_join: { espn_athlete_ids: [aid], espn_athlete_ids_wikidata: [], name: u.name, country: js[0].team, birth_year: null, born: null, transfermarkt: [], fbref: [], note: 'join on ESPN athlete id' } }
      B.players.push(p)
      playerByKey.set(key, p)
      rep.new_people++
      method = 'no ledger person: a person of his own from the athlete store'
    }
    personOf.set(aid, key)
    rep.people[aid] = { player_key: key, name: js[0].r.name, rows: js.length, method }
    const p = playerByKey.get(key)
    if (!p.espn_athlete_ids.includes(aid)) p.espn_athlete_ids.push(aid)
    if (p.club_join && !p.club_join.espn_athlete_ids.includes(aid)) { p.club_join.espn_athlete_ids.push(aid); p.club_join.note = 'join on ESPN athlete id' }
  }

  // ---- rows
  const aetEvents = new Set(B.espn.matches.filter((m) => m.aet).map((m) => String(m.source_id)))
  for (const r of store.senior) if (r.minutes > 90) aetEvents.add(String(r.id))
  const conflict = (c) => { B.conflicts.push(c); rep.conflicts[c.kind] = (rep.conflicts[c.kind] ?? 0) + 1 }
  const rowsOfKey = new Map()
  for (const row of B.rows) (rowsOfKey.get(row.player_key) ?? rowsOfKey.set(row.player_key, []).get(row.player_key)).push(row)
  for (const j of joined) {
    const { r, sm, side, team } = j
    const key = personOf.get(String(r.espnId))
    const p = playerByKey.get(key)
    // extra time: the ESPN header says so (AET/PEN status), or any record of the event has more than 90 minutes
    const cap = aetEvents.has(String(r.id)) ? 120 : 90
    const c = fillClocks(r, cap, null)
    const A = { event: r.id, slug: r.slug, athlete_id: String(r.espnId), name: r.name, appeared: true, started: c.started, on: c.subIn, off: c.sentOff ?? c.subOff, off_reason: c.sentOff != null ? 'red' : c.subOff != null ? 'sub' : null,
      minutes: c.minutes, minutes_from: c.minutesFrom, clock_unknown: c.clockUnknown.length ? c.clockUnknown : undefined, goals: r.goals ?? null, join: j.how, receipt: r.receipt?.url ?? null }
    const receipt = { source: 'espn-athlete-store', url: r.receipt?.url ?? null, fetched_at: r.receipt?.fetchedAt ?? null, athlete_id: String(r.espnId), name_as_written: r.name }
    const mine = (rowsOfKey.get(key) ?? []).find((x) => x.match_id === sm.match_id)
    const opp = side === 'home' ? sm.away : sm.home
    if (mine) {
      rep.attached++
      mine.sources.athlete_store = A
      mine.receipts.push(receipt)
      if (mine.started == null && A.started != null) { mine.started = A.started; mine.field_source.started = 'athlete-store'; rep.filled.started++ }
      else if (mine.started != null && A.started != null && mine.started !== A.started) conflict({ kind: 'started', player_key: key, player: p.name, match_id: sm.match_id, date: sm.date, team, values: { [mine.field_source.started]: mine.started, athlete_store: A.started }, chosen: `${mine.field_source.started} (${mine.started})`, receipts: mine.receipts })
      if (mine.minutes == null && A.minutes != null) { Object.assign(mine, { on_min: A.on, off_min: A.off, off_reason: A.off_reason, minutes: A.minutes }); mine.field_source.minutes = 'athlete-store'; rep.filled.minutes++ }
      else if (mine.minutes != null && A.minutes != null && Math.abs(mine.minutes - A.minutes) > 2) conflict({ kind: 'minutes', player_key: key, player: p.name, match_id: sm.match_id, date: sm.date, team, values: { [mine.field_source.minutes]: mine.minutes, athlete_store: A.minutes }, chosen: `${mine.field_source.minutes} (${mine.minutes})`, receipts: mine.receipts })
      if (A.goals != null) {
        const lower = mine.goals == null || ['wikidata', 'martj42'].includes(mine.field_source.goals)
        if (lower) {
          if (mine.goals != null && mine.goals !== A.goals) conflict({ kind: 'goals', player_key: key, player: p.name, match_id: sm.match_id, date: sm.date, team, values: { [mine.field_source.goals]: mine.goals, athlete_store: A.goals }, chosen: `athlete-store (${A.goals})`, rule: 'RSSSF > archive > ESPN > athlete store > Wikidata > martj42', receipts: mine.receipts })
          if (mine.goals == null) rep.filled.goals++
          mine.goals = A.goals
          mine.field_source.goals = 'athlete-store'
          mine.flags = mine.flags.filter((f) => f !== 'goals_unknown')
          const m42 = mine.sources.martj42
          if (mine.competitive && m42?.side_complete && m42.goals != null && m42.goals !== mine.goals) conflict({ kind: 'goals_vs_martj42', player_key: key, player: p.name, match_id: sm.match_id, date: sm.date, team, values: { athlete_store: A.goals, martj42: m42.goals }, chosen: `athlete-store (${A.goals})`, rule: 'competitive goals must equal martj42 where its scorer list for the side is complete', receipts: mine.receipts })
        } else if (mine.goals !== A.goals) conflict({ kind: 'goals', player_key: key, player: p.name, match_id: sm.match_id, date: sm.date, team, values: { [mine.field_source.goals]: mine.goals, athlete_store: A.goals }, chosen: `${mine.field_source.goals} (${mine.goals})`, rule: 'RSSSF > archive > ESPN > athlete store > Wikidata > martj42', receipts: mine.receipts })
      }
      continue
    }
    // no row for this person in this match
    const logged = !!p.rsssf_slug
    const lastCap = logged ? (rowsOfKey.get(key) ?? []).filter((x) => x.cap_source === 'rsssf').map((x) => x.date).sort().at(-1) : null
    if (logged && lastCap && sm.date <= lastCap) {
      rep.not_in_rsssf++
      conflict({ kind: 'appearance_not_in_rsssf', player_key: key, player: p.name, match_id: sm.match_id, date: sm.date, team, values: { rsssf: 'no cap', athlete_store: A }, chosen: 'no cap (RSSSF > archive > ESPN > athlete store for caps)', receipts: [receipt] })
      continue
    }
    // martj42's view of his goals, for the competitive-goals gate
    const credited = scorersOf(sm.match_id, team)
    const score = side === 'home' ? sm.home_score : sm.away_score
    const complete = credited.length === score && (score === 0 ? spine.scorerTournaments.has(sm.tournament) : true)
    const mineG = credited.filter((g) => !g.own_goal && nameScore(r.name, g.scorer) >= 0.75)
    const m42 = mineG.length ? mineG.length : complete ? 0 : null
    const row = {
      player_key: key, player: p.name, team, opponent: opp, date: sm.date, match_id: sm.match_id, match_type: sm.type, tournament: sm.tournament,
      competition_rsssf: null, competitive: sm.competitive, venue: sm.neutral ? 'N' : side === 'home' ? 'H' : 'A',
      score: sm.played ? (side === 'home' ? `${sm.home_score}-${sm.away_score}` : `${sm.away_score}-${sm.home_score}`) : null,
      cap_no: null, app_no: null, started: A.started, on_min: A.on, off_min: A.off, off_reason: A.off_reason, minutes: A.minutes, goals: A.goals,
      cap_source: 'athlete-store', field_source: { cap: 'athlete-store', started: 'athlete-store', minutes: A.minutes != null ? 'athlete-store' : null, goals: A.goals != null ? 'athlete-store' : null },
      sources: { athlete_store: A, ...(mineG.length || complete ? { martj42: { goals: m42, side_complete: complete, name: mineG[0]?.scorer ?? null } } : {}) },
      receipts: [receipt, ...(mineG.length ? [{ source: 'martj42', file: spine.goalscorersFile, lines: mineG.map((g) => g.line), name_as_written: mineG[0].scorer }] : []), { source: 'martj42', file: spine.file, line: sm.receipt.line }],
      flags: [],
    }
    if (logged) { row.flags.push('beyond_rsssf_log'); rep.beyond_log++ }
    if (row.goals == null) row.flags.push('goals_unknown')
    if (row.competitive && complete && m42 != null && row.goals != null && row.goals !== m42) conflict({ kind: 'goals_vs_martj42', player_key: key, player: p.name, match_id: sm.match_id, date: sm.date, team, values: { athlete_store: row.goals, martj42: m42 }, chosen: `athlete-store (${row.goals})`, rule: 'competitive goals must equal martj42 where its scorer list for the side is complete', receipts: row.receipts })
    B.rows.push(row)
    ;(rowsOfKey.get(key) ?? rowsOfKey.set(key, []).get(key)).push(row)
    rep.added++
  }
  log(`athlete store: ${rep.rows} senior rows (${rep.youth_excluded} youth excluded), ${rep.joined} joined to martj42, ${rep.attached} attached to existing caps, ${rep.added} new caps (${rep.beyond_log} beyond an RSSSF log), ${rep.not_in_rsssf} not in the RSSSF log (conflicts); filled started ${rep.filled.started}, minutes ${rep.filled.minutes}, goals ${rep.filled.goals}; ${rep.new_people} new people`)
  return rep
}

/** Stated totals for unlogged marquee players: coverage `complete` only when rows and goals both equal them. */
export function applyStated(players) {
  const out = []
  for (const s of STATED) {
    const p = players.find((x) => !x.rsssf_slug && (x.espn_athlete_ids ?? []).includes(s.espn)) ?? players.find((x) => !x.rsssf_slug && x.team === s.team && nameScore(x.name, s.name) >= 0.99)
    if (!p) { out.push({ ...s, found: false }); continue }
    const rows = p.counts.rows ?? 0, goals = p.counts.goals ?? 0, unknown = p.counts.goals_unknown ?? 0
    Object.assign(p, { caps_stated: s.caps, goals_stated: s.goals, stated_source: s.source })
    const complete = rows === s.caps && goals === s.goals && !unknown
    if (complete) {
      p.intl_coverage = 'complete'
      p.coverage_basis = `no RSSSF log; ${rows} caps and ${goals} goals (rows per source: ${coverageSources(p)}) equal the stated totals (${s.source})`
      delete p.badge
    } else {
      p.intl_coverage = 'partial'
      p.badge = `internationals partly covered: ${rows} of ${s.caps} caps and ${goals} of ${s.goals} goals known (rows per source: ${coverageSources(p)}); no cap-by-cap log`
    }
    out.push({ ...s, found: true, player_key: p.player_key, ledger_rows: rows, ledger_goals: goals, goals_unknown: unknown, coverage: p.intl_coverage })
  }
  return out
}
// the sources behind an unlogged player's rows, by the number of rows each one appears in
const coverageSources = (p) => [p.counts.with_athlete_store && `ESPN athlete store ${p.counts.with_athlete_store}`, p.counts.with_wikidata && `Wikidata ${p.counts.with_wikidata}`, p.counts.with_archive && `FIFA/UEFA reports ${p.counts.with_archive}`, p.counts.with_espn && `ESPN summaries ${p.counts.with_espn}`, p.counts.martj42_scorer_only && `martj42 scorers ${p.counts.martj42_scorer_only}`].filter(Boolean).join(', ')
