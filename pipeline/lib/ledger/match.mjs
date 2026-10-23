// One match summary in, one match row + its player rows + its anomalies out. Applies the rules in
// rules.mjs in the documented order. Player rows carry the raw ESPN athlete id; the id merge and
// the season-level passes (penalty typing, assists floors) run afterwards in build-ledger.mjs.
import {
  detectCollapsedRoster, dedupeRosterEntries, appearance, checkKeyEventTeams, dedupeSubstitutions,
  goalEvents, reconcileGoals, minuteCap, minutesPlayed, cardsOf, subClocks, isQualifier, stageOf,
  resultFor, statOf, hasStats, foldSplitIdListings,
} from './rules.mjs'

/** Sides of the header: [{id, homeAway, score, shootout, name}] home first. */
function headerSides(s) {
  const comp = s.header?.competitions?.[0]
  const cs = comp?.competitors || []
  return ['home', 'away'].map((h) => {
    const c = cs.find((x) => x.homeAway === h)
    return c && { id: String(c.id), score: c.score === '' || c.score == null ? null : Number(c.score), shootout: c.shootoutScore == null ? null : Number(c.shootoutScore), name: c.team?.displayName ?? null }
  })
}

export function buildMatch(ev, s) {
  const anomalies = []
  const flag = (rule, detail, extra = {}) => anomalies.push({ id: ev.id, slug: ev.slug, season: ev.season, date: ev.date, rule, ...extra, detail })
  const comp = s.header?.competitions?.[0]
  const status = comp?.status?.type?.name || ev.status
  const sides = headerSides(s)
  const headerSeasonName = s.header?.season?.name || ''
  const qualifier = isQualifier({ slug: ev.slug, seasonSlug: ev.seasonSlug, round: ev.round, headerSeasonName })
  if (ev.slug.startsWith('uefa.champions') && ev.qualifier != null && !!ev.qualifier !== qualifier) flag('qualifier-flag-disagrees', `index qualifier=${ev.qualifier}, regex says ${qualifier} (${ev.seasonSlug}; ${headerSeasonName})`)
  const stage = stageOf({ slug: ev.slug, seasonSlug: ev.seasonSlug, round: ev.round, headerSeasonName })

  const match = {
    id: ev.id, slug: ev.slug, season: ev.season, seasonLabel: ev.seasonLabel, date: ev.date,
    homeId: sides[0]?.id ?? ev.homeId, homeName: sides[0]?.name ?? ev.homeName, awayId: sides[1]?.id ?? ev.awayId, awayName: sides[1]?.name ?? ev.awayName,
    homeScore: sides[0]?.score ?? ev.homeScore, awayScore: sides[1]?.score ?? ev.awayScore,
    shootout: sides[0]?.shootout != null ? { home: sides[0].shootout, away: sides[1]?.shootout } : null,
    status, stage, round: ev.round ?? null, seasonSlug: ev.seasonSlug ?? null, qualifier, stuck: !!ev.stuck,
    summary: 'ok', extraTime: false, stats: false, keyEvents: 'ok', goalsReconciled: true,
    lineup: { home: null, away: null }, quality: 'clean',
  }
  if (!sides[0] || !sides[1]) { flag('header-competitors-missing', 'summary header lacks a home or away competitor'); match.quality = 'defective'; return { match, players: [], anomalies } }
  if (String(ev.homeId) !== sides[0].id || String(ev.awayId) !== sides[1].id) flag('header-teams-differ-from-index', `index ${ev.homeId}-${ev.awayId}, header ${sides[0].id}-${sides[1].id}`)
  if (ev.homeScore != null && (Number(ev.homeScore) !== sides[0].score || Number(ev.awayScore) !== sides[1].score)) flag('header-score-differs-from-index', `index ${ev.homeScore}-${ev.awayScore}, header ${sides[0].score}-${sides[1].score}`)

  // keyEvents: team check first, then subs and goals
  let ke = s.keyEvents || []
  const teamCheck = checkKeyEventTeams(ke, [sides[0].id, sides[1].id])
  if (teamCheck.foreign) { flag('keyevents-foreign', `keyEvent team ids ${teamCheck.badTeams.join(',')} not in header ${sides[0].id}/${sides[1].id}; keyEvents dropped`); ke = []; match.keyEvents = 'foreign' }
  else if (!ke.length) match.keyEvents = 'none'
  const cap = minuteCap(status, ke, ev.slug)
  match.extraTime = cap === 120
  const { subs, duplicates: dupSubs } = dedupeSubstitutions(ke)
  if (dupSubs) flag('substitution-dedupe', `${dupSubs} repeated (in, out) substitution events dropped`)
  const ge = goalEvents(ke)
  if (ge.unattributed) flag('goal-event-unattributed', `${ge.unattributed} scoring event(s) without a scorer`)

  // rosters
  const ros = s.rosters || []
  const sideRoster = sides.map((sd, i) => ros.find((r) => String(r.team?.id) === sd.id) || ros.find((r) => r.homeAway === (i ? 'away' : 'home')))
  const matchHasStats = ros.some((r) => (r.roster || []).some(hasStats))
  match.stats = matchHasStats
  const splitPairs = []
  const repaired = [] // per side: entries with appearance info, or null
  sides.forEach((sd, i) => {
    const side = i ? 'away' : 'home'
    const r = sideRoster[i]
    const raw = r?.roster || []
    const info = { rows: raw.length, unique: new Set(raw.map((p) => p.athlete?.id)).size, starters: 0, subsIn: 0, subEvents: subs.filter((x) => String(x.team) === sd.id).length, used: 0, bench: 0, collapsed: false, missing: false, duplicates: 0 }
    match.lineup[side] = info
    if (r && String(r.team?.id) !== sd.id) flag('roster-team-mismatch', `${side} roster team ${r.team?.id} vs header ${sd.id}`, { team: sd.id })
    if (!raw.length) { info.missing = true; flag('roster-missing', `${side} (${sd.name}) roster empty; no player rows for this side`, { team: sd.id, evidence: athletesInEvents(ke, sd.id, ge) }); repaired.push(null); return }
    const col = detectCollapsedRoster(raw)
    if (col.collapsed) {
      info.collapsed = true
      const evidence = athletesInEvents(ke, sd.id, ge)
      flag('roster-collapsed', `${side} (${sd.name}) ${col.rows} rows, ${col.unique} unique, athlete ${col.repeatedId} x${col.maxRepeat}; player rows withheld for the athlete-store fill`, { team: sd.id, evidence })
      repaired.push(null); return
    }
    const deduped = dedupeRosterEntries(raw)
    const { duplicates, anonymous } = deduped
    const folded = foldSplitIdListings(deduped.entries)
    const entries = folded.entries
    if (folded.pairs.length) { flag('split-id-double-listing', `${side} (${sd.name}) ${folded.pairs.length} players listed under two ids: ${folded.pairs.map((p) => `${p.ids.join('/')} #${p.jersey}`).join(', ')}; folded`, { team: sd.id, pairs: folded.pairs }); splitPairs.push(...folded.pairs.map((p) => ({ ...p, team: sd.id, match: ev.id }))) }
    const anonStarters = anonymous.filter((x) => x.starter && !x.subbedIn).length
    if (anonymous.length) flag('roster-entry-no-athlete', `${side} (${sd.name}) ${anonymous.length} entr${anonymous.length > 1 ? 'ies' : 'y'} with no athlete (${anonStarters} starter${anonStarters === 1 ? '' : 's'}${anonymous.map((x) => x.jersey ? ' #' + x.jersey : '').join('')}); unrecoverable from the summary`, { team: sd.id })
    info.duplicates = duplicates
    if (duplicates) flag('roster-duplicate-entries', `${side} (${sd.name}) ${duplicates} repeated athlete entries merged`, { team: sd.id })
    const out = []
    for (const e of entries) {
      const a = appearance(e, matchHasStats)
      if (e.starter && !a.started && a.appeared === false) flag('starter-flag-dropped', `${e.athlete?.displayName} flagged starter, ${e.subbedIn ? 'also subbedIn' : 'APP 0'}; not an appearance`, { athlete: e.athlete?.id, team: sd.id })
      else if (e.starter && !a.started) flag('starter-flag-dropped', `${e.athlete?.displayName} flagged starter, ${e.subbedIn ? 'also subbedIn' : 'APP ' + statOf(e, 'APP')}; counted as ${a.appeared ? 'sub' : 'unused'}`, { athlete: e.athlete?.id, team: sd.id })
      if (a.reason && a.reason !== 'starter-flag-app-zero') flag(a.reason, `${e.athlete?.displayName}: started=${a.started} subbedIn=${!!e.subbedIn} APP=${statOf(e, 'APP')}`, { athlete: e.athlete?.id, team: sd.id })
      out.push({ e, ...a })
    }
    info.starters = out.filter((x) => x.started).length + anonStarters
    info.anonymous = anonymous.length
    info.subsIn = out.filter((x) => x.appeared && !x.started).length
    info.used = out.filter((x) => x.appeared).length
    info.bench = out.length - info.used
    // No starters is two different defects (full-scope build, 2026-10-22):
    //  - every listed player flagged as having come on (the stuck La Liga round of 2023-02-11: 20-23 "subs" a side)
    //    is a hollow summary: withhold the rows, the athlete store fills the side;
    //  - only the 1-5 subs who came on are listed (49 matches, 2002-11): the sub rows are real, the starting XI
    //    is missing; keep the subs, the athlete store fills the starters.
    if (info.starters === 0 && info.used > 11) {
      info.invalid = true
      flag('roster-invalid', `${side} (${sd.name}) 0 starters and ${info.used} players flagged as subs on; hollow summary, player rows withheld for the athlete-store fill`, { team: sd.id, evidence: athletesInEvents(ke, sd.id, ge) })
      repaired.push(null); return
    }
    if (info.starters === 0 && info.used > 0) flag('roster-starters-missing', `${side} (${sd.name}) lists only the ${info.used} sub${info.used === 1 ? '' : 's'} who came on; the starting XI is missing; sub rows kept, starters for the athlete-store fill`, { team: sd.id, evidence: athletesInEvents(ke, sd.id, ge) })
    if (info.starters !== 11) flag('starters-not-eleven', `${side} (${sd.name}) ${info.starters} starters after repair`, { team: sd.id })
    if (match.keyEvents === 'ok' && info.subsIn !== info.subEvents) flag('subs-mismatch', `${side} (${sd.name}) ${info.subsIn} subs on in roster vs ${info.subEvents} substitution events`, { team: sd.id })
    repaired.push(out)
  })

  // goals per team, reconciled to the score
  const goalsBy = new Map(), pensBy = new Map(), ogBy = new Map()
  const goalsKnown = [true, true]
  sides.forEach((sd, i) => {
    const other = sides[1 - i]
    const ogFor = ge.ownGoals.filter((g) => String(g.team) === sd.id).length
    const expected = sd.score == null ? null : sd.score - ogFor
    let teamGoals = ge.goals.filter((g) => String(g.team) === sd.id)
    const out = repaired[i]
    const statsG = matchHasStats && out ? new Map(out.filter((x) => hasStats(x.e)).map((x) => [x.e.athlete.id, statOf(x.e, 'G') ?? 0])) : null
    if (match.keyEvents !== 'ok') {
      // no usable keyEvents: stats G if the side has stats, else unknown
      if (statsG) { teamGoals = [...statsG].flatMap(([id, g]) => Array.from({ length: g }, () => ({ scorer: id, clock: null, penalty: false, fromStats: true }))); flag('goals-from-stats', `${sd.name}: no usable keyEvents, goals from stats G (${teamGoals.length})`, { team: sd.id }) }
      else { goalsKnown[i] = false; match.goalsReconciled = false; flag('goals-unknown', `${sd.name}: no usable keyEvents and no stats; goals null`, { team: sd.id }); teamGoals = null }
    } else if (expected != null && expected >= 0) {
      const rec = reconcileGoals(teamGoals, expected, statsG)
      for (const st of rec.steps) flag(st, `${sd.name}: ${teamGoals.length} scoring events vs ${expected} expected (score ${sd.score}, ${ogFor} own goals for); ${rec.goals.length} after reconcile`, { team: sd.id })
      if (rec.excess || rec.deficit) { match.goalsReconciled = false; flag(rec.excess ? 'goal-events-exceed-score' : 'goal-events-short', `${sd.name}: ${rec.goals.length} goals after repair vs ${expected} expected; unrepaired`, { team: sd.id }) }
      teamGoals = rec.goals
    } else if (expected != null && expected < 0) {
      flag('own-goals-exceed-score', `${sd.name}: ${ogFor} own goals credited vs score ${sd.score}`, { team: sd.id })
    }
    if (teamGoals) for (const g of teamGoals) {
      if (g.scorer == null) continue
      goalsBy.set(g.scorer, (goalsBy.get(g.scorer) || 0) + 1)
      if (g.penalty) pensBy.set(g.scorer, (pensBy.get(g.scorer) || 0) + 1)
    }
    // stats G disagreeing with the reconciled keyEvent count: informational (keyEvents win)
    if (statsG && match.keyEvents === 'ok') for (const [id, g] of statsG) {
      const k = teamGoals?.filter((x) => x.scorer === id).length ?? 0
      if (g !== k) flag('stats-goals-disagree', `stats G=${g}, keyEvents ${k}; keyEvents kept`, { athlete: id, team: sd.id })
    }
  })
  for (const g of ge.ownGoals) if (g.player != null) ogBy.set(g.player, (ogBy.get(g.player) || 0) + 1)

  // player rows
  const players = []
  const known = new Set()
  sides.forEach((sd, i) => {
    const other = sides[1 - i]
    const out = repaired[i]
    if (!out) return
    for (const x of out) {
      const e = x.e, id = e.athlete.id
      known.add(id)
      if (!x.appeared) continue
      const clocks = subClocks(e, subs)
      const cards = cardsOf(e)
      const onMin = x.started ? 0 : clocks.onMin
      const offMin = e.subbedOut ? clocks.offMin : null
      if (!x.started && clocks.onMin == null) flag('sub-clock-missing', `${e.athlete.displayName} subbed in with no clock; minutes null`, { athlete: id, team: sd.id })
      if (e.subbedOut && clocks.offMin == null) flag('sub-clock-missing', `${e.athlete.displayName} subbed off with no clock; minutes null`, { athlete: id, team: sd.id })
      const minutes = e.subbedOut && clocks.offMin == null ? null : minutesPlayed({ started: x.started, onMin: clocks.onMin, offMin, redMin: cards.redMin, cap })
      players.push({
        id: ev.id, slug: ev.slug, season: ev.season, date: ev.date, qualifier, stage,
        athleteId: id, espnId: id, name: e.athlete.displayName, teamId: sd.id, oppId: other.id, home: i === 0,
        started: x.started, subIn: x.started ? null : clocks.onMin, subOff: offMin, sentOff: cards.rc ? cards.redMin : null, minutes,
        goals: goalsKnown[i] ? goalsBy.get(id) || 0 : null,
        pens: goalsKnown[i] ? pensBy.get(id) || 0 : null, ownGoals: match.keyEvents === 'ok' ? ogBy.get(id) || 0 : null,
        // ESPN occasionally writes A = -1 (3 rows at full scope): unknown, not a count
        assists: !hasStats(e) ? null : (statOf(e, 'A') ?? 0) < 0 ? (flag('stat-negative', `${e.athlete.displayName}: A=${statOf(e, 'A')}; assists null`, { athlete: id, team: sd.id }), null) : statOf(e, 'A') ?? 0,
        yc: cards.yc, rc: cards.rc,
        result: sd.score == null || other.score == null ? null : resultFor(sd.score, other.score),
        jersey: e.jersey ?? null, pos: e.position?.abbreviation ?? null,
      })
    }
  })
  // scorers who are in no roster entry (excluding collapsed or missing sides, already recorded)
  sides.forEach((sd, i) => {
    if (!repaired[i]) return
    for (const g of ge.goals) if (String(g.team) === sd.id && g.scorer != null && !known.has(g.scorer)) flag('scorer-not-in-roster', `scorer ${g.scorer} at ${g.clock?.min ?? '?'}' is not on ${sd.name}'s roster`, { athlete: g.scorer, team: sd.id })
  })

  const kinds = new Set(anomalies.map((a) => a.rule))
  const defects = ['roster-missing', 'roster-collapsed', 'keyevents-foreign', 'goal-events-exceed-score', 'goal-events-short', 'goals-unknown', 'starters-not-eleven', 'header-competitors-missing']
  match.quality = defects.some((k) => kinds.has(k)) ? 'defective' : anomalies.length ? 'repaired' : 'clean'
  return { match, players, anomalies, splitPairs }
}

/** Athletes the keyEvents place on a side, for the athlete-store fill of a collapsed roster:
 *  scorers and the on/off players of that team's substitutions. */
function athletesInEvents(ke, teamId, ge) {
  const ids = new Map()
  const add = (id, name, role) => { if (id == null) return; const r = ids.get(id) || { id, name, roles: [] }; r.roles.push(role); ids.set(id, r) }
  for (const k of ke) {
    if (String(k.team?.id) !== teamId) continue
    const p = k.participants || []
    if (/substitution/.test(k.type?.type || '')) { add(p[0]?.athlete?.id, p[0]?.athlete?.displayName, `on ${k.clock?.displayValue || '?'}`); add(p[1]?.athlete?.id, p[1]?.athlete?.displayName, `off ${k.clock?.displayValue || '?'}`) }
    else if (k.scoringPlay && k.type?.type !== 'own-goal') add(p[0]?.athlete?.id, p[0]?.athlete?.displayName, `goal ${k.clock?.displayValue || '?'}`)
    else if (/red-card/.test(k.type?.type || '')) add(p[0]?.athlete?.id, p[0]?.athlete?.displayName, `red ${k.clock?.displayValue || '?'}`)
  }
  void ge
  return [...ids.values()]
}
