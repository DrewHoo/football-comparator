// The athlete-store fill: rows from ESPN's athlete-scoped store (pipeline/fill-espn.mjs --job athlete-fills,
// data/ledger/fills/athlete-matches.jsonl) for the sides the summary builder withheld. build-ledger.mjs merges
// them after the summary rows, the season passes and the id merge, and before the ordinals.
//
// The rules (pipeline/docs/ledger.md "The athlete-store fill"):
//   - only the six ledger competitions (both UCL slugs), only a match whose summary is built in this run,
//     and only a side the builder withheld or left without starters (WITHHELD_RULES);
//   - never over a summary row: a fill row is dropped when the summary already has that canonical athlete
//     (or that name) on the side, or has him on the other side of the match;
//   - match context (slug, season, date, stage, qualifier, home/opp, result) comes from the ledger's match row;
//   - clocks: the summary's keyEvents first (the anomaly's `evidence`, as rule 14), then the record's own.
//     The record writes 0 for a clock it doesn't have (subIns/subOuts are still right), so 0 is unknown;
//   - minutes from the clocks by rule 14 (minutesPlayed: stoppage dropped, capped at 90, 120 with extra time).
//     The record's own `minutes` includes stoppage (Juarez on 33' at Udinese 188764: record 61, clocks 57) and is
//     missing for whole Serie A seasons (2002-03, 2006-08), so it is used only when a needed clock is unknown;
//   - pens null in a league-season the builder found untyped (as for every other row of that season).
import fs from 'node:fs'
import path from 'node:path'
import { minutesPlayed, nameKey } from './rules.mjs'

export const FILL_FILE = 'data/ledger/fills/athlete-matches.jsonl'
export const LEDGER_SLUGS = new Set(['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'uefa.champions', 'uefa.champions_qual'])
export const WITHHELD_RULES = new Set(['roster-collapsed', 'roster-missing', 'roster-invalid', 'roster-starters-missing'])

export function loadFillRows(root) {
  const f = path.join(root, FILL_FILE)
  if (!fs.existsSync(f)) return null
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
}

/** "54'" -> 54, "90'+3'" -> 90 (base minute, stoppage dropped, as the summary rows) */
const baseMin = (s) => { const m = /^(\d+)'?/.exec(String(s).trim()); return m ? Number(m[1]) : null }

/** keyEvent evidence for one side -> Map(espnId -> {on, off, red}) */
export function evidenceClocks(evidence) {
  const out = new Map()
  for (const e of evidence || []) {
    const c = out.get(String(e.id)) || {}
    for (const r of e.roles || []) {
      const [kind, ...rest] = r.split(' ')
      const v = baseMin(rest.join(' '))
      if (v == null) continue
      if ((kind === 'on' || kind === 'off' || kind === 'red') && c[kind] == null) c[kind] = v
    }
    out.set(String(e.id), c)
  }
  return out
}

/**
 * Clocks and minutes for one fill row.
 * @returns {{started, subIn, subOff, sentOff, minutes, minutesFrom, clockUnknown, recordMinutes}}
 */
export function fillClocks(r, cap, ev) {
  const known = (x) => (x == null || x <= 0 ? null : Math.min(x, cap))
  const started = !!r.started
  const subbedOn = !started
  const subbedOff = r.subOff != null || (ev?.off != null && r.sentOff == null)
  const red = r.sentOff != null || (r.rc ?? 0) >= 1
  const subIn = subbedOn ? (ev?.on ?? known(r.subIn)) : null
  const sentOff = red ? (ev?.red ?? known(r.sentOff)) : null
  const subOff = subbedOff && !red ? (ev?.off ?? known(r.subOff)) : null
  const unknown = []
  if (subbedOn && subIn == null) unknown.push('subIn')
  if (subbedOff && !red && subOff == null) unknown.push('subOff')
  if (red && sentOff == null) unknown.push('sentOff')
  let minutes = null, minutesFrom = null
  if (!unknown.length) { minutes = minutesPlayed({ started, onMin: subIn, offMin: subOff, redMin: sentOff, cap }); minutesFrom = 'clocks' }
  else if (r.minutes != null && r.minutes > 0) { minutes = Math.min(r.minutes, cap); minutesFrom = 'record' }
  return { started, subIn, subOff, sentOff, minutes, minutesFrom, clockUnknown: unknown, recordMinutes: r.minutes ?? null }
}

const resultOf = (m, home) => {
  if (m.homeScore == null || m.awayScore == null) return null
  const gf = home ? m.homeScore : m.awayScore, ga = home ? m.awayScore : m.homeScore
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D'
}

/**
 * Merge the fill rows into `players` (mutates `players`, the side anomalies and the match lineups).
 * @param fillRows rows of athlete-matches.jsonl
 * @param players summary rows of this run, athleteId already canonical
 * @param matches this run's match rows
 * @param anomalies this run's anomalies (the withheld sides are looked up here; `filled` is written on them)
 * @param mergeMap id-merge map (espnId -> canonical)
 * @param untypedPens Set of `${slug}|${season}` with no penalty typing
 * @returns {{ added: object[], stats, notes: object[] }} notes are new anomalies (one per side with a fill)
 */
export function mergeFill({ fillRows, players, matches, anomalies, mergeMap, untypedPens, competitorOf = () => null }) {
  const stats = { rows: fillRows.length, recordChecked: 0, recordUnreadable: 0, recordOtherSide: 0, bothSidesDropped: 0, otherSlug: 0, outOfScope: 0, notWithheld: 0, summaryHasAthlete: 0, summaryHasName: 0, otherSide: 0, duplicate: 0, added: 0, byRule: {}, byFill: {},
    clocks: { fromKeyEvents: 0, unknown: 0, minutesFromRecord: 0, minutesNull: 0, recordDisagrees: 0 } }
  const matchById = new Map(matches.map((m) => [m.id, m]))
  const sideAnom = new Map()
  for (const a of anomalies) if (a.id && WITHHELD_RULES.has(a.rule)) sideAnom.set(`${a.id}|${a.team}`, a)
  const have = new Set(), haveName = new Set(), sideOf = new Map()
  for (const p of players) {
    have.add(`${p.id}|${p.athleteId}`)
    haveName.add(`${p.id}|${p.teamId}|${nameKey(p.name)}`)
    sideOf.set(`${p.id}|${p.athleteId}`, p.teamId)
  }
  const canon = (id) => mergeMap[id] ?? id
  // The side comes from the record's own $ref (competitors/{team}), not from the URL the fill asked: the store
  // answers either competitor's URL with the same record. A row the record puts on the other side moves there.
  const sideMoves = []
  fillRows = fillRows.map((r) => {
    if (!LEDGER_SLUGS.has(r.slug)) return r
    const t = r.receipt?.url ? competitorOf(r.receipt.url) : null
    if (!t) { stats.recordUnreadable++; return r }
    stats.recordChecked++
    if (t === r.teamId) return r
    stats.recordOtherSide++
    const m = matchById.get(r.id)
    sideMoves.push({ id: r.id, slug: r.slug, season: r.season, date: r.date, rule: 'fill-record-other-side', athlete: String(r.espnId), team: t, detail: `${r.name}: asked under team ${r.teamId}, the record's $ref is team ${t}${m && m.homeId !== t && m.awayId !== t ? ' (neither side: dropped)' : ''}` })
    return { ...r, teamId: t, asked: r.teamId }
  })
  // Fallback when a record can't be read: the store a per-event record under either competitor's URL, so a player who moved between the two
  // clubs comes back on both sides (Nakata, Bologna v Parma 118600). Keep the side of the club of his nearest
  // summary row by date; drop the other (rule `fill-both-sides`).
  const bothSides = []
  {
    const byKey = new Map()
    for (const r of fillRows) { if (!LEDGER_SLUGS.has(r.slug)) continue; const k = `${r.id}|${canon(String(r.espnId))}`; const l = byKey.get(k) || []; l.push(r); byKey.set(k, l) }
    const split = [...byKey].filter(([, l]) => new Set(l.map((r) => r.teamId)).size > 1)
    if (split.length) {
      const want = new Set(split.map(([k]) => k.split('|')[1]))
      const seen = new Map()
      for (const p of players) if (want.has(p.athleteId)) { const l = seen.get(p.athleteId) || []; l.push(p); seen.set(p.athleteId, l) }
      const drop = new Set()
      for (const [k, l] of split) {
        const [id, aid] = k.split('|')
        const t = Date.parse(l[0].date)
        const near = (seen.get(aid) || []).filter((p) => p.id !== id && l.some((r) => r.teamId === p.teamId)).sort((a, b) => Math.abs(Date.parse(a.date) - t) - Math.abs(Date.parse(b.date) - t))[0]
        const keep = near ? near.teamId : null
        for (const r of l) if (r.teamId !== keep) drop.add(r)
        bothSides.push({ id, slug: l[0].slug, season: l[0].season, date: l[0].date, rule: 'fill-both-sides', athlete: aid, team: keep, detail: `${l[0].name} (${aid}): the athlete store returned his record for both sides (${l.map((r) => r.teamId).join(', ')}); ${keep ? `kept team ${keep}, the club of his nearest summary row (${near.date.slice(0, 10)}, match ${near.id})` : 'no summary row to decide; both dropped'}` })
      }
      fillRows = fillRows.filter((r) => !drop.has(r))
      stats.bothSidesDropped = drop.size
    }
  }
  const added = [], perSide = new Map()
  const notWithheldOther = new Map() // player-pull rows on sides the summary built: possible silent omissions
  for (const r of fillRows) {
    if (!LEDGER_SLUGS.has(r.slug)) { stats.otherSlug++; continue }
    const m = matchById.get(r.id)
    if (!m || m.summary !== 'ok') { stats.outOfScope++; continue }
    const a = sideAnom.get(`${r.id}|${r.teamId}`)
    const athleteId = canon(String(r.espnId))
    if (!a) {
      stats.notWithheld++
      if (!have.has(`${r.id}|${athleteId}`)) notWithheldOther.set(`${r.id}|${athleteId}`, { id: r.id, slug: r.slug, season: m.season, date: m.date, athlete: athleteId, team: r.teamId, name: r.name, fill: r.fill })
      continue
    }
    if (have.has(`${r.id}|${athleteId}`)) {
      if (sideOf.get(`${r.id}|${athleteId}`) !== r.teamId) stats.otherSide++
      else if (added.some((x) => x.id === r.id && x.athleteId === athleteId)) stats.duplicate++
      else stats.summaryHasAthlete++
      continue
    }
    if (haveName.has(`${r.id}|${r.teamId}|${nameKey(r.name)}`)) { stats.summaryHasName++; continue }
    const home = m.homeId === r.teamId
    if (!home && m.awayId !== r.teamId) { stats.outOfScope++; continue }
    const cap = m.extraTime ? 120 : 90
    const ev = evidenceClocks(a.evidence).get(String(r.espnId))
    const c = fillClocks(r, cap, ev)
    if (ev && (ev.on != null || ev.off != null || ev.red != null)) stats.clocks.fromKeyEvents++
    if (c.clockUnknown.length) stats.clocks.unknown++
    if (c.minutesFrom === 'record') stats.clocks.minutesFromRecord++
    if (c.minutes == null) stats.clocks.minutesNull++
    if (c.minutesFrom === 'clocks' && c.recordMinutes != null && c.recordMinutes > 0 && Math.abs(Math.min(c.recordMinutes, cap) - c.minutes) > 2) stats.clocks.recordDisagrees++
    const row = {
      id: m.id, slug: m.slug, season: m.season, date: m.date, qualifier: !!m.qualifier, stage: m.stage,
      athleteId, espnId: String(r.espnId), name: r.name, teamId: r.teamId, oppId: home ? m.awayId : m.homeId, home,
      started: c.started, subIn: c.subIn, subOff: c.subOff, sentOff: c.sentOff, minutes: c.minutes,
      goals: r.goals ?? null, pens: untypedPens.has(`${m.slug}|${m.season}`) ? null : r.pens ?? null, ownGoals: r.ownGoals ?? null,
      assists: r.assists ?? null, yc: r.yc ?? null, rc: r.rc ?? null, result: resultOf(m, home),
      source: 'athlete-store', fill: r.fill, receipt: r.receipt,
    }
    if (c.clockUnknown.length) row.clockUnknown = c.clockUnknown
    added.push(row)
    have.add(`${r.id}|${athleteId}`)
    sideOf.set(`${r.id}|${athleteId}`, r.teamId)
    const k = `${r.id}|${r.teamId}`
    const s = perSide.get(k) || { a, m, rows: 0, starters: 0, subs: 0, goals: 0, unknownClock: 0 }
    s.rows++; if (row.started) s.starters++; else s.subs++; s.goals += row.goals ?? 0; if (c.clockUnknown.length) s.unknownClock++
    perSide.set(k, s)
    stats.byRule[a.rule] = (stats.byRule[a.rule] || 0) + 1
    stats.byFill[r.fill] = (stats.byFill[r.fill] || 0) + 1
  }
  stats.added = added.length
  // stamp the side anomalies and the match lineups
  const notes = [...sideMoves, ...bothSides]
  for (const [k, s] of perSide) {
    const [id, team] = k.split('|')
    s.a.filled = s.rows
    s.a.filledStarters = s.starters
    s.a.filledSubs = s.subs
    const sideKey = s.m.homeId === team ? 'home' : 'away'
    if (s.m.lineup?.[sideKey]) s.m.lineup[sideKey].filled = s.rows
    if (s.unknownClock) notes.push({ id, slug: s.m.slug, season: s.m.season, date: s.m.date, rule: 'fill-clock-unknown', team, detail: `${s.unknownClock} athlete-store row(s) with a sub or red card but no clock in the record or the keyEvents; minutes from the record where it has them` })
  }
  // withheld sides the fill didn't reach or added nothing to
  const unfilled = []
  for (const [k, a] of sideAnom) {
    if (perSide.has(k)) continue
    const m = matchById.get(a.id)
    if (!m || m.summary !== 'ok') continue
    a.filled = 0
    unfilled.push({ id: a.id, team: a.team, rule: a.rule, slug: a.slug, season: a.season, qualifier: !!m.qualifier })
  }
  stats.sidesFilled = perSide.size
  stats.sidesUnfilled = unfilled.length
  stats.startersByRule = {}
  for (const s of perSide.values()) { const r = s.a.rule; const v = stats.startersByRule[r] || (stats.startersByRule[r] = { sides: 0, starters: 0, subs: 0, eleven: 0 }); v.sides++; v.starters += s.starters; v.subs += s.subs; if (s.starters === 11) v.eleven++ }
  return { added, stats, notes, unfilled, notWithheld: [...notWithheldOther.values()] }
}
