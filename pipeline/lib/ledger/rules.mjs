// The repair rules, one named pure function each, in the order the builder applies them.
// Every rule here came out of a probe gate or a scan; AGENTS.md ("ESPN site API" and
// "Champions League") is the source, pipeline/docs/ledger.md lists the motivating event ids.
// Nothing here reads files or the network. rules.test.mjs has one test per rule.

export const RULES_VERSION = 1

// ---------------------------------------------------------------- small helpers

export const statOf = (entry, abbr) => {
  const s = (entry?.stats || []).find((x) => x.abbreviation === abbr)
  return s == null ? null : Number(s.value ?? 0)
}
export const hasStats = (entry) => (entry?.stats || []).length > 0
const typeOf = (k) => k?.type?.type || ''
const partId = (k, i) => k?.participants?.[i]?.athlete?.id ?? null

/** "67'" -> {min: 67, added: 0}; "90'+6'" -> {min: 90, added: 6}; empty -> from clock.value seconds; else null. */
export function parseClock(clock) {
  const v = clock?.displayValue || ''
  const m = /(\d+)'(?:\s*\+\s*(\d+))?/.exec(v)
  if (m) return { min: Number(m[1]), added: m[2] ? Number(m[2]) : 0 }
  if (typeof clock?.value === 'number' && clock.value > 0) return { min: Math.floor(clock.value / 60), added: 0 }
  return null
}

// ---------------------------------------------------------------- 1. rosters

/** Rule `roster-collapsed`. A roster whose rows have been overwritten by one athlete (Barca-Udinese
 *  188764/188837: 18 rows, all 196222; Bologna v Roma 131335). The brief's test is
 *  `rows - uniqueIds > 2`; La Liga and Serie A 2007-11 legitimately list up to 9 players twice
 *  (subs, bench flagged as starters), each id at most twice, so a collapse also needs one id
 *  repeated 3+ times. Returns {collapsed, rows, unique, maxRepeat, repeatedId}. */
export function detectCollapsedRoster(roster) {
  const ids = (roster || []).map((p) => p.athlete?.id)
  const counts = new Map()
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1)
  let maxRepeat = 0, repeatedId = null
  for (const [id, n] of counts) if (n > maxRepeat) { maxRepeat = n; repeatedId = id }
  const rows = ids.length, unique = counts.size
  return { collapsed: rows - unique > 2 && maxRepeat >= 3, rows, unique, maxRepeat, repeatedId }
}

/** Rule `roster-duplicate-entries`. One entry per athlete id: flags are OR-ed, stats come from
 *  the entry that has them (the larger APP if both do), plays are unioned. La Liga and Serie A
 *  list subs twice from 2007-08 (once in the starting block with starter:true, once as SUB).
 *  Entries with no athlete at all (La Liga 2002-03, Mallorca 60603) are returned as `anonymous`. */
export function dedupeRosterEntries(roster) {
  const byId = new Map()
  let duplicates = 0
  const anonymous = []
  for (const p of roster || []) {
    const id = p.athlete?.id
    if (id == null) { anonymous.push({ starter: !!p.starter, subbedIn: !!p.subbedIn, jersey: p.jersey ?? null, pos: p.position?.abbreviation ?? null }); continue }
    const q = byId.get(id)
    if (!q) { byId.set(id, { ...p, plays: [...(p.plays || [])] }); continue }
    duplicates++
    const pick = !hasStats(q) ? p : !hasStats(p) ? q : (statOf(p, 'APP') ?? 0) > (statOf(q, 'APP') ?? 0) ? p : q
    byId.set(id, {
      ...q,
      starter: !!(q.starter || p.starter),
      subbedIn: !!(q.subbedIn || p.subbedIn),
      subbedOut: !!(q.subbedOut || p.subbedOut),
      subbedInFor: q.subbedInFor || p.subbedInFor,
      subbedOutFor: q.subbedOutFor || p.subbedOutFor,
      stats: pick.stats,
      plays: [...q.plays, ...(p.plays || [])],
    })
  }
  return { entries: [...byId.values()], duplicates, anonymous }
}

/** Rule `split-id-double-listing`. After the id dedupe, one side can still list a player twice under
 *  two ids: the old id and the 2006 re-ingest id, same shirt, sometimes respelled (Nantes v Lyon
 *  203760: 34 Nantes rows, "Emerse Fae" 31673 and "Emmers Fae" 84869 both #6, both starters).
 *  Two entries with the same jersey and the same surname are one player: folded like a duplicate,
 *  kept under the lower (older) id, and the pair returned as merge evidence. */
export function foldSplitIdListings(entries) {
  const surname = (e) => nameKey(e.athlete?.displayName).split(' ').pop()
  const byJersey = new Map()
  const out = [], pairs = []
  for (const e of [...entries].sort((a, b) => Number(a.athlete.id) - Number(b.athlete.id))) {
    const j = e.jersey
    const k = j != null && j !== '' ? `${j}|${surname(e)}` : null
    const prev = k && byJersey.get(k)
    if (!prev) { if (k) byJersey.set(k, e); out.push(e); continue }
    pairs.push({ ids: [prev.athlete.id, e.athlete.id], names: [prev.athlete.displayName, e.athlete.displayName], jersey: j })
    const merged = dedupeRosterEntries([prev, e]).entries[0]
    merged.athlete = prev.athlete
    merged.foldedIds = [...(prev.foldedIds || []), e.athlete.id]
    out[out.indexOf(prev)] = merged
    byJersey.set(k, merged)
  }
  return { entries: out, pairs }
}

/** Rule `starter-repair`. A starter is `starter && !subbedIn`; where the match has stat arrays a
 *  starter must also have APP = 1 (drops bench players flagged as starters, the 12th starter, and
 *  the 2006 final's 20-man squad list, 197123). */
export function repairStarter(entry, matchHasStats) {
  if (!entry.starter || entry.subbedIn) return false
  if (matchHasStats && statOf(entry, 'APP') !== 1) return false
  return true
}

/** Rule `appearance`. Where the match has stat arrays an appearance is APP >= 1 (the 2006 final
 *  squad list flags the injured Messi `starter`, APP 0). A subbedIn flag with APP 0 still counts and
 *  is reported. Without stats: repaired starter or subbedIn. Returns {appeared, reason}. */
export function appearance(entry, matchHasStats) {
  const started = repairStarter(entry, matchHasStats)
  if (!matchHasStats) return { appeared: started || !!entry.subbedIn, started, reason: null }
  const app = statOf(entry, 'APP')
  if (app == null) return { appeared: started || !!entry.subbedIn, started, reason: entry.subbedIn || started ? 'no-stats-on-entry' : null }
  if (app >= 1) return { appeared: true, started, reason: !started && !entry.subbedIn ? 'app-without-flags' : null }
  if (entry.subbedIn) return { appeared: true, started: false, reason: 'subbed-in-app-zero' }
  return { appeared: false, started: false, reason: entry.starter ? 'starter-flag-app-zero' : null }
}

// ---------------------------------------------------------------- 2. keyEvents

/** Rule `keyevents-foreign`. Every keyEvent that names a team must name one of the header's two
 *  competitors (one re-ingested EPL 2009-10 match returned Rangers v Hearts events, 678280).
 *  Returns {foreign, badTeams: [id...], checked}. */
export function checkKeyEventTeams(keyEvents, competitorIds) {
  const ok = new Set(competitorIds.map(String))
  const bad = new Set()
  let checked = 0
  for (const k of keyEvents || []) {
    const t = k.team?.id
    if (t == null) continue
    checked++
    if (!ok.has(String(t))) bad.add(String(t))
  }
  return { foreign: bad.size > 0, badTeams: [...bad], checked }
}

/** Rule `substitution-dedupe`. Substitution events deduped by the (in, out) pair: 0-25% of matches
 *  list the same sub twice, sometimes a minute apart. participants[0] = on, participants[1] = off. */
export function dedupeSubstitutions(keyEvents) {
  const seen = new Map()
  let duplicates = 0
  for (const k of keyEvents || []) {
    if (!/substitution/.test(typeOf(k))) continue
    const key = `${partId(k, 0)}>${partId(k, 1)}`
    if (seen.has(key)) { duplicates++; continue }
    seen.set(key, { inId: partId(k, 0), outId: partId(k, 1), team: k.team?.id ?? null, clock: parseClock(k.clock) })
  }
  return { subs: [...seen.values()], duplicates }
}

/** Rule `goal-events`. Goals are keyEvents with scoringPlay, excluding `own-goal` (its team is the
 *  beneficiary and participants[0] the defender) and shootout kicks (period 5). Never by type name:
 *  `penalty---scored` typing is absent for whole seasons (EPL 2002-03, 2009-10).
 *  Returns {goals:[{scorer, assister, team, clock, penalty, key}], ownGoals:[{player, team(beneficiary), clock}], unattributed}. */
export function goalEvents(keyEvents) {
  const goals = [], ownGoals = []
  let unattributed = 0
  for (const k of keyEvents || []) {
    if (!k.scoringPlay) continue
    if ((k.period?.number ?? 0) === 5 || /shootout/.test(typeOf(k))) continue
    const clock = parseClock(k.clock)
    if (typeOf(k) === 'own-goal') { ownGoals.push({ player: partId(k, 0), team: k.team?.id ?? null, clock }); continue }
    const scorer = partId(k, 0)
    if (scorer == null) unattributed++
    goals.push({ scorer, assister: partId(k, 1), team: k.team?.id ?? null, clock, penalty: typeOf(k) === 'penalty---scored', id: k.id })
  }
  return { goals, ownGoals, unattributed }
}

/** Rule `goal-reconcile`. Per team, scoring events must equal score minus the own goals credited to
 *  that team. When they exceed it, events are duplicated: drop exact repeats (same scorer, same
 *  minute; Barcelona 2-3 Shakhtar 254722 lists every goal twice), then the same scorer within 2
 *  minutes (Sevilla v Barcelona 2006-10-15 has Messi at 80' and 81'), then let stats G break the tie
 *  (drop a player's events beyond his G). keyEvents win otherwise: stats G is sometimes 0 against a
 *  real goal (Totti 2006-07). When events fall short, the missing goals are filled from stats G
 *  (scorer with G above his events, up to the deficit), never invented.
 *  statsG: Map athleteId -> G for this team's players, or null when the match has no stats.
 *  Returns {goals, steps:[rule names], excess, deficit, filled:[{scorer}]} */
export function reconcileGoals(teamGoals, expected, statsG) {
  let goals = [...teamGoals]
  const steps = []
  if (goals.length > expected) {
    const seen = new Set()
    const next = goals.filter((g) => { const k = `${g.scorer}|${g.clock?.min}|${g.clock?.added}`; if (seen.has(k)) return false; seen.add(k); return true })
    if (next.length < goals.length) { steps.push('goal-dedupe-exact'); goals = next }
  }
  if (goals.length > expected) {
    let excess = goals.length - expected
    const next = []
    for (const g of goals) {
      const near = excess > 0 && g.scorer != null && g.clock && next.find((h) => h.scorer === g.scorer && h.clock && Math.abs(g.clock.min - h.clock.min) <= 2)
      if (near) { excess--; continue }
      next.push(g)
    }
    if (next.length < goals.length) { steps.push('goal-dedupe-near'); goals = next }
  }
  if (goals.length > expected && statsG) {
    let excess = goals.length - expected
    const byScorer = new Map()
    const next = []
    for (const g of goals) {
      const n = (byScorer.get(g.scorer) || 0) + 1
      byScorer.set(g.scorer, n)
      const cap = statsG.get(g.scorer)
      if (excess > 0 && cap != null && n > cap) { excess--; continue }
      next.push(g)
    }
    if (next.length < goals.length) { steps.push('goal-stats-tiebreak'); goals = next }
  }
  const filled = []
  if (goals.length < expected && statsG) {
    const have = new Map()
    for (const g of goals) have.set(g.scorer, (have.get(g.scorer) || 0) + 1)
    for (const [id, gStat] of statsG) {
      for (let i = have.get(id) || 0; i < gStat && goals.length + filled.length < expected; i++) filled.push({ scorer: id, assister: null, clock: null, penalty: false, filled: true })
    }
    if (filled.length) { steps.push('goal-fill-from-stats'); goals = [...goals, ...filled] }
  }
  return { goals, steps, excess: Math.max(0, goals.length - expected), deficit: Math.max(0, expected - goals.length), filled }
}

// ---------------------------------------------------------------- 3. minutes and cards

/** The minute cap: 90, or 120 when the match went to extra time. Extra time is the status (AET, a
 *  shootout) or explicit extra-time keyEvents (`start-extra-time`, `halftime-extra-time`...), and
 *  never in a league match: a period-3 keyEvent turns up in league matches (Barcelona 2004-12-11,
 *  169642, a sub at 92'), so periods alone are not evidence. */
export function minuteCap(statusName, keyEvents, slug = 'uefa.champions') {
  if (!/^uefa\./.test(slug)) return 90
  if (/AET|PEN/.test(statusName || '')) return 120
  if ((keyEvents || []).some((k) => /extra-time/.test(k.type?.type || ''))) return 120
  return 90
}

/** Rule `minutes`. Minutes from the sub clocks: on at 0 (starter) or the sub-on minute, off at the
 *  sub-off minute, a red card, or the cap; stoppage time is dropped ("90'+3'" is 90), and every
 *  value is capped (90, 120 with extra time). Messi 2008-09 gives 2,517 against BDFutbol's 2,516.
 *  Returns null when a needed clock is missing. */
export function minutesPlayed({ started, onMin, offMin, redMin, cap }) {
  const start = started ? 0 : onMin
  if (start == null) return null
  let end = offMin != null ? offMin : cap
  if (redMin != null && redMin >= start) end = Math.min(end, redMin)
  return Math.max(0, Math.min(cap, end) - Math.min(cap, start))
}

/** Rule `cards`. Yellow and red cards from the entry's roster plays (present in every season,
 *  unlike stats YC/RC), deduped by minute; stats YC/RC when the entry has no plays. */
export function cardsOf(entry) {
  const ys = new Set(), rs = new Set()
  for (const q of entry.plays || []) {
    const c = parseClock(q.clock)
    const k = c ? `${c.min}+${c.added}` : '?'
    if (q.yellowCard) ys.add(k)
    if (q.redCard) rs.add(k)
  }
  if (ys.size || rs.size || (entry.plays || []).length) {
    const red = [...rs].map((k) => Number(k.split('+')[0])).filter(Number.isFinite)
    return { yc: Math.min(2, ys.size), rc: rs.size ? 1 : 0, redMin: red.length ? Math.min(...red) : null, src: 'plays' }
  }
  if (hasStats(entry)) return { yc: statOf(entry, 'YC') ?? 0, rc: statOf(entry, 'RC') ? 1 : 0, redMin: null, src: 'stats' }
  return { yc: 0, rc: 0, redMin: null, src: 'none' }
}

/** The on/off minutes for one entry: substitution keyEvents (deduped) first, then the entry's own
 *  roster plays, then the partner's event via subbedInFor/subbedOutFor. */
export function subClocks(entry, subs) {
  const id = entry.athlete?.id
  const fromPlays = (entry.plays || []).filter((q) => q.substitution).map((q) => parseClock(q.clock)).filter(Boolean)
  let onMin = null, offMin = null, src = null
  if (entry.subbedIn) {
    const partner = entry.subbedInFor?.athlete?.id
    const k = subs.find((s) => s.inId === id && s.clock) || (partner != null ? subs.find((s) => s.outId === partner && s.inId == null && s.clock) : null)
    if (k) { onMin = k.clock.min; src = 'keyEvents' }
    else if (fromPlays.length) { onMin = fromPlays[0].min; src = 'plays' }
  }
  if (entry.subbedOut) {
    const k = subs.find((s) => s.outId === id && s.clock)
    if (k) offMin = k.clock.min
    else if (fromPlays.length) offMin = fromPlays[fromPlays.length - 1].min
  }
  return { onMin, offMin, src }
}

// ---------------------------------------------------------------- 4. the match

/** UCL qualifier flag: `/qualif|play-?off/i` on the season slug, round or header season name, or the
 *  `uefa.champions_qual` slug (2020-21 on). The 2024-25+ knockout play-offs are proper stage. */
export function isQualifier({ slug, seasonSlug, round, headerSeasonName }) {
  if (slug === 'uefa.champions_qual') return true
  if (slug !== 'uefa.champions') return false
  const text = [seasonSlug, round, headerSeasonName].filter(Boolean).join(' ')
  return /qualif|play-?off/i.test(text) && !/knockout/i.test(text)
}

/** Normalised stage: league, qualifying, group, second-group, league-phase, knockout-playoff,
 *  round-of-16, quarterfinal, semifinal, final (round names drift, so regexes). */
export function stageOf({ slug, seasonSlug, round, headerSeasonName }) {
  if (!/^uefa\.champions/.test(slug)) return 'league'
  if (isQualifier({ slug, seasonSlug, round, headerSeasonName })) return 'qualifying'
  const t = `${seasonSlug || ''} ${round || ''} ${headerSeasonName || ''}`.toLowerCase()
  if (/second-phase|second phase|second group/.test(t)) return 'second-group'
  if (/league-phase|league phase/.test(t)) return 'league-phase'
  if (/knockout/.test(t)) return 'knockout-playoff'
  if (/group/.test(t)) return 'group'
  if (/round-of-16|round of 16|last 16/.test(t)) return 'round-of-16'
  if (/quarter/.test(t)) return 'quarterfinal'
  if (/semi/.test(t)) return 'semifinal'
  if (/final/.test(t)) return 'final'
  return 'unknown'
}

export const resultFor = (own, theirs) => (own > theirs ? 'W' : own < theirs ? 'L' : 'D')

/** Name key for the merge table: accents stripped, lowercase, single spaces. Never a join key alone. */
export const nameKey = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
