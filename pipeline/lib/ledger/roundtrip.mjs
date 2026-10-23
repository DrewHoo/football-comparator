// Round-trip checks: decoded compact rows against the long rows they came from, exactly, after the
// one deliberate transform (assists below the floor, or in a match without reliable assists, are
// null). Used by encode-ledger.mjs --check and compact.test.mjs.

export const CLUB_ROW_FIELDS = ['id', 'slug', 'season', 'date', 'qualifier', 'stage', 'athleteId', 'espnId', 'name', 'teamId', 'oppId', 'home',
  'started', 'subIn', 'subOff', 'sentOff', 'minutes', 'goals', 'pens', 'ownGoals', 'assists', 'yc', 'rc', 'result', 'source']
export const ENTITY_FIELDS = ['born', 'nat', 'pos']
export const ORD_FIELDS = ['id', 'athleteId', 'comp', 'compApp', 'compStart', 'compSeason', 'tgn', 'app', 'start', 'season']
export const MATCH_FIELDS = ['id', 'slug', 'season', 'seasonLabel', 'date', 'homeId', 'homeName', 'awayId', 'awayName', 'homeScore', 'awayScore', 'shootout',
  'status', 'stage', 'round', 'seasonSlug', 'qualifier', 'stuck', 'summary', 'extraTime', 'stats', 'keyEvents', 'goalsReconciled', 'quality', 'assistsReliable']
export const INTL_ROW_FIELDS = ['player_key', 'player', 'team', 'opponent', 'date', 'match_id', 'match_type', 'tournament', 'competition_rsssf', 'competitive',
  'venue', 'score', 'cap_no', 'app_no', 'started', 'on_min', 'off_min', 'off_reason', 'minutes', 'goals', 'goal_minutes', 'cap_source', 'flags']

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** deterministic sample of k indexes from n, stratified by a key so every stratum is represented */
export function stratifiedSample(items, keyOf, k, seed = 20261021) {
  let x = seed
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648)
  const strata = new Map()
  items.forEach((it, i) => { const key = keyOf(it); const l = strata.get(key) || []; l.push(i); strata.set(key, l) })
  const out = []
  const keys = [...strata.keys()].sort()
  // one from each stratum first, then proportional
  for (const key of keys) { const l = strata.get(key); out.push(l[Math.floor(rnd() * l.length)]) }
  const rest = k - out.length
  const n = items.length
  for (const key of keys) {
    const l = strata.get(key)
    const take = Math.max(0, Math.round((rest * l.length) / n))
    for (let j = 0; j < take; j++) out.push(l[Math.floor(rnd() * l.length)])
  }
  // top up to exactly k distinct indexes (proportional draws can repeat)
  const set = new Set(out)
  while (set.size < Math.min(k, n)) set.add(Math.floor(rnd() * n))
  return [...set].slice(0, k)
}

/**
 * @param decoded decodeCompact(file) for one club file
 * @param longOf (matchId, athleteId) -> { row, ord, match }
 * @param idx row indexes to check (default all)
 */
export function compareClub(decoded, longOf, idx = null) {
  const bad = []
  const ix = idx ?? decoded.rows.map((_, i) => i)
  for (const i of ix) {
    const d = decoded.rows[i]
    const l = longOf(d.id, d.athleteId)
    if (!l) { bad.push({ i, why: 'no long row' }); continue }
    const want = { ...l.row, assists: l.match.assistsReliable ? l.row.assists : null }
    for (const f of CLUB_ROW_FIELDS) if (!same(d[f], want[f])) bad.push({ i, id: d.id, athleteId: d.athleteId, field: f, compact: d[f], long: want[f] })
    for (const f of ORD_FIELDS) if (!same(d.ord[f], l.ord[f])) bad.push({ i, id: d.id, athleteId: d.athleteId, field: `ord.${f}`, compact: d.ord[f], long: l.ord[f] })
  }
  return { checked: ix.length, bad }
}

/**
 * Entities against the person layer they were encoded from.
 * @param want (entityId, firstRowDate) -> { born, nat, pos } as the long side expects them (born 'YYYY-MM-DD' or null)
 */
export function compareEntities(decoded, want) {
  const bad = []
  let start = 0
  for (const e of decoded.entities) {
    const w = want(e.id, decoded.rows[start]?.date)
    for (const f of ENTITY_FIELDS) if (!same(e[f], w[f])) bad.push({ id: e.id, field: f, compact: e[f], long: w[f] })
    start += e.rows
  }
  return { checked: decoded.entities.length, bad }
}

export function compareMatches(decoded, matchById) {
  const bad = []
  for (const d of decoded.matches) {
    const l = matchById.get(d.id)
    for (const f of MATCH_FIELDS) if (!same(d[f], l[f])) bad.push({ id: d.id, field: f, compact: d[f], long: l[f] })
  }
  return { checked: decoded.matches.length, bad }
}

/** @param longRows the intl rows in the encoder's order is not required: keyed by (player_key, app_no, date, match_id) */
export function compareIntl(decoded, longByKey, idx = null) {
  const bad = []
  const ix = idx ?? decoded.rows.map((_, i) => i)
  for (const i of ix) {
    const d = decoded.rows[i]
    const l = longByKey.get(intlKey(d))
    if (!l) { bad.push({ i, why: 'no long row', key: intlKey(d) }); continue }
    for (const f of INTL_ROW_FIELDS) {
      const want = f === 'flags' ? l.flags ?? [] : l[f]
      if (!same(d[f], want)) bad.push({ i, key: intlKey(d), field: f, compact: d[f], long: want })
    }
  }
  return { checked: ix.length, bad }
}
export const intlKey = (r) => `${r.player_key}|${r.app_no}|${r.date}|${r.match_id}|${r.team}|${r.opponent}`
