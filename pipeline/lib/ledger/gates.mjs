// Known-answer gates over the built ledger. `expect` is the probe's ESPN-derived number
// (research/espn-coverage-leagues.md §3, espn-coverage-ucl-intl.md §2) adjusted only where a
// documented repair is meant to move it (the athlete-store fill moved Totti 2003-04 and Messi UCL 2005-06); `known` is the publisher's figure (null = none solid).
// A gate fails when the ledger differs from `expect`, except a move toward `known`, and except
// minutes lost to a red card (the probe ran minutes to the sub clock or 90 regardless).
import { nameKey } from './rules.mjs'

const F = ['apps', 'starts', 'goals', 'pens', 'assists', 'minutes']

export const LEAGUE_GATES = [
  { player: 'Lionel Messi', athlete: '45843', club: 'Barcelona', slug: 'esp.1', season: 2004, expect: { apps: 7, starts: 0, goals: 1, pens: 0, assists: null, minutes: 72 }, known: { apps: 7, starts: 0, goals: 1 } },
  { player: 'Lionel Messi', athlete: '45843', club: 'Barcelona', slug: 'esp.1', season: 2005, expect: { apps: 17, starts: 11, goals: 6, pens: 0, assists: 2, minutes: 915 }, known: { apps: 17, starts: 11, goals: 6 } },
  { player: 'Lionel Messi', athlete: '45843', club: 'Barcelona', slug: 'esp.1', season: 2006, expect: { apps: 26, starts: 23, goals: 14, pens: 0, assists: 2, minutes: 2005 }, known: { apps: 26, starts: 23, goals: 14 }, note: 'probe keyEvents gave 15 (Sevilla 2006-10-15 duplicate at 80/81); goal-reconcile gives 14' },
  { player: 'Lionel Messi', athlete: '45843', club: 'Barcelona', slug: 'esp.1', season: 2008, expect: { apps: 31, starts: 27, goals: 23, pens: 3, assists: 11, minutes: 2517 }, known: { apps: 31, starts: 27, goals: 23, minutes: 2516 } },
  { player: 'Cristiano Ronaldo', athlete: '22774', club: 'Manchester United', slug: 'eng.1', season: 2003, expect: { apps: 28, starts: 14, goals: 4, pens: 0, assists: 4, minutes: 1463 }, known: { apps: 29, starts: 15, goals: 4 }, note: 'one of five Man Utd rosters silently omits him; corrections layer' },
  { player: 'Cristiano Ronaldo', athlete: '22774', club: 'Manchester United', slug: 'eng.1', season: 2006, expect: { apps: 34, starts: 31, goals: 17, pens: 3, assists: 14, minutes: 2788 }, known: { apps: 34, starts: 31, goals: 17 } },
  { player: 'Cristiano Ronaldo', athlete: '22774', club: 'Manchester United', slug: 'eng.1', season: 2007, expect: { apps: 34, starts: 31, goals: 31, pens: 4, assists: 7, minutes: 2753 }, known: { apps: 34, starts: 31, goals: 31, pens: 4 } },
  { player: 'Thierry Henry', athlete: '8039', club: 'Arsenal', slug: 'eng.1', season: 2002, expect: { apps: 37, starts: 37, goals: 24, pens: null, assists: 23, minutes: 3301 }, known: { apps: 37, starts: 37, goals: 24, assists: 20 }, note: 'EPL 2002-03 has no penalty typing: pens null; assists 23 v 20 is ESPN' },
  { player: 'Thierry Henry', athlete: '8039', club: 'Arsenal', slug: 'eng.1', season: 2003, expect: { apps: 37, starts: 37, goals: 30, pens: 7, assists: 9, minutes: 3330 }, known: { apps: 37, starts: 37, goals: 30 } },
  { player: 'Francesco Totti', athlete: '10293', club: 'AS Roma', slug: 'ita.1', season: 2003, expect: { apps: 31, starts: 31, goals: 20, pens: 6, assists: null, minutes: 2769 }, known: { apps: 31, goals: 20 }, note: 'probe 30/30/19/2679: Bologna v Roma 2003-11-23 (131335) has a collapsed roster; the athlete-store fill adds his row (started, 90 min, 1 goal, not a penalty)' },
  { player: 'Francesco Totti', athlete: '10293', club: 'AS Roma', slug: 'ita.1', season: 2006, expect: { apps: 35, starts: 35, goals: 26, pens: 5, assists: 9, minutes: 3026 }, known: { apps: 35, starts: 35, goals: 26, pens: 5 } },
  { player: 'Miroslav Klose', athlete: '10955', club: 'Werder Bremen', slug: 'ger.1', season: 2005, expect: { apps: 26, starts: 23, goals: 25, pens: 2, assists: null, minutes: 2059 }, known: { apps: 26, goals: 25 }, note: 'no stats arrays in the 2005-06 Bundesliga: assists null' },
  { player: 'Franck Ribéry', athlete: '42968', club: 'Marseille', slug: 'fra.1', season: 2006, expect: { apps: 25, starts: 25, goals: 5, pens: 0, assists: 8, minutes: 2167 }, known: { apps: 25, goals: 5 } },
]

// UCL: proper stages and qualifiers separately (the qualifier flag must split them)
export const UCL_GATES = [
  { player: 'Ruud van Nistelrooy', athlete: null, club: 'Manchester United', slug: 'uefa.champions', season: 2002, expect: { apps: 9, starts: 8, goals: 12 }, known: { goals: 12 }, qual: { expect: { apps: 2, goals: 2 }, known: { goals: 2 } }, note: 'Wikipedia "Europe" 14 goals = 12 proper + 2 Q3' },
  { player: 'Lionel Messi', athlete: '45843', club: 'Barcelona', slug: 'uefa.champions', season: 2005, expect: { apps: 6, goals: 1 }, known: { apps: 6, goals: 1 }, mustHaveAnomaly: { id: '188764', rule: 'roster-collapsed' }, mustNotAppear: '197123', note: 'Udinese 188764 collapsed (recorded, no phantom; the athlete-store fill adds his row: started, off 70\'); 2006 final 197123 squad list (APP 0, no row). 5 + the Udinese fill = 6' },
  { player: 'Cristiano Ronaldo', athlete: '22774', club: 'Manchester United', slug: 'uefa.champions', season: 2007, expect: { apps: 11, starts: 11, goals: 8, assists: 1 }, known: { apps: 11, starts: 11, goals: 8 } },
  { player: 'Lionel Messi', athlete: '45843', club: 'Barcelona', slug: 'uefa.champions', season: 2008, expect: { apps: 12, starts: 10, goals: 9, assists: 5 }, known: { apps: 12, goals: 9 } },
  { player: 'Cristiano Ronaldo', athlete: '22774', club: 'Real Madrid', slug: 'uefa.champions', season: 2013, expect: { apps: 11, starts: 11, goals: 17, assists: 4 }, known: { goals: 17 } },
]

const clubTeamId = (matches, slug, season, club) => {
  const want = nameKey(club.replace(/^AS /, ''))
  const counts = new Map()
  for (const m of matches) {
    if (m.slug !== slug || m.season !== season) continue
    for (const [id, name] of [[m.homeId, m.homeName], [m.awayId, m.awayName]]) if (nameKey(name) === nameKey(club) || nameKey(name).includes(want)) counts.set(id, (counts.get(id) || 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function totals(rows) {
  const t = { apps: rows.length, starts: 0, goals: 0, pens: 0, assists: 0, minutes: 0, redLoss: 0 }
  let pensNull = false, assistsNull = false, goalsNull = false, minutesNull = false
  for (const r of rows) {
    if (r.started) t.starts++
    if (r.goals == null) goalsNull = true; else t.goals += r.goals
    if (r.pens == null) pensNull = true; else t.pens += r.pens
    if (r.assists == null) assistsNull = true; else t.assists += r.assists
    if (r.minutes == null) minutesNull = true; else t.minutes += r.minutes
    if (r.sentOff != null && r.subOff == null) t.redLoss += Math.max(0, (r.cap ?? 90) - r.sentOff)
  }
  if (pensNull && t.pens === 0) t.pens = null
  if (assistsNull && t.assists === 0) t.assists = null
  if (goalsNull && t.goals === 0) t.goals = null
  if (minutesNull) t.minutesPartial = true
  return t
}

function judge(field, got, exp, known, redLoss) {
  if (exp === undefined) return { ok: true }
  if (got === exp) return { ok: true }
  if (field === 'minutes' && got != null && exp != null && got + redLoss === exp) return { ok: true, why: `red card -${redLoss}` }
  const k = known?.[field]
  if (typeof k === 'number' && got != null && exp != null && Math.abs(got - k) < Math.abs(exp - k)) return { ok: true, why: 'closer to known' }
  return { ok: false }
}

/** Runs every gate whose matches are all present in `matches` with a cached summary. */
export function runGates({ matches, players, anomalies, mergeMap }) {
  const lines = [], results = []
  const canon = (id) => mergeMap[id] ?? id
  const fmt = (v) => (v == null ? '-' : String(v))
  const check = (g, scopeRows, exp, known, label) => {
    const t = totals(scopeRows)
    const parts = [], fails = []
    for (const f of F) {
      if (exp[f] === undefined && known?.[f] === undefined && f !== 'minutes' && f !== 'assists') continue
      const j = judge(f, t[f], exp[f], known, t.redLoss)
      parts.push(`${f} ${fmt(t[f])}/${fmt(exp[f])}/${fmt(known?.[f])}${j.why ? ` (${j.why})` : ''}${j.ok ? '' : ' FAIL'}`)
      if (!j.ok) fails.push(f)
    }
    return { label, t, parts, fails }
  }
  for (const g of [...LEAGUE_GATES, ...UCL_GATES]) {
    const isUcl = g.slug === 'uefa.champions'
    const team = clubTeamId(matches, g.slug, g.season, g.club)
    const scope = matches.filter((m) => (m.slug === g.slug || (isUcl && m.slug === 'uefa.champions_qual')) && m.season === g.season && team && (m.homeId === team || m.awayId === team))
    const pending = scope.filter((m) => m.summary === 'pending').length
    const tag = `${g.player}, ${g.club} ${g.season}-${String(g.season + 1).slice(2)} ${g.slug}`
    if (!team || !scope.length || pending) { lines.push(`SKIP ${tag}: ${!team ? "outside this run's --leagues/--seasons scope" : `${pending}/${scope.length} summaries not cached yet`}`); results.push({ gate: tag, status: 'skip', pending }); continue }
    let athlete = g.athlete
    if (!athlete) {
      const ids = new Map()
      for (const p of players) if (p.slug === g.slug && p.season === g.season && p.teamId === team && nameKey(p.name) === nameKey(g.player)) ids.set(p.athleteId, (ids.get(p.athleteId) || 0) + 1)
      athlete = [...ids].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    }
    const aid = canon(athlete)
    const rows = players.filter((p) => p.athleteId === aid && p.teamId === team && p.season === g.season && (p.slug === g.slug || (isUcl && p.slug === 'uefa.champions_qual')))
    const proper = isUcl ? rows.filter((r) => !r.qualifier) : rows
    const checks = [check(g, proper, g.expect, g.known, isUcl ? 'proper' : 'league')]
    if (g.qual) checks.push(check(g, rows.filter((r) => r.qualifier), g.qual.expect, g.qual.known, 'qualifiers'))
    const extra = []
    if (g.mustHaveAnomaly) {
      const has = anomalies.some((a) => a.id === g.mustHaveAnomaly.id && a.rule === g.mustHaveAnomaly.rule)
      extra.push(has ? `anomaly ${g.mustHaveAnomaly.rule} on ${g.mustHaveAnomaly.id} recorded` : `MISSING anomaly ${g.mustHaveAnomaly.rule} on ${g.mustHaveAnomaly.id} FAIL`)
      if (!has) checks[0].fails.push('anomaly')
    }
    if (g.mustNotAppear) {
      const phantom = rows.some((r) => r.id === g.mustNotAppear)
      extra.push(phantom ? `phantom row in ${g.mustNotAppear} FAIL` : `no row in ${g.mustNotAppear}`)
      if (phantom) checks[0].fails.push('phantom')
    }
    const failed = checks.some((c) => c.fails.length)
    lines.push(`${failed ? 'FAIL' : 'PASS'} ${tag} [athlete ${aid}${aid !== athlete ? ` <- ${athlete}` : ''}, team ${team}, ${scope.length} matches]`)
    for (const c of checks) lines.push(`     ${c.label}: ${c.parts.join(' · ')}`)
    if (extra.length) lines.push(`     ${extra.join('; ')}`)
    if (g.note) lines.push(`     note: ${g.note}`)
    results.push({ gate: tag, status: failed ? 'fail' : 'pass', athlete: aid, team, checks: checks.map((c) => ({ label: c.label, totals: c.t, fails: c.fails })) })
  }
  lines.unshift('gate: field got/expect(probe)/known')
  return { lines, results, failed: results.filter((r) => r.status === 'fail').length, skipped: results.filter((r) => r.status === 'skip').length, passed: results.filter((r) => r.status === 'pass').length }
}
