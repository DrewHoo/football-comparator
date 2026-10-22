// Sanity check on one match summary against its scoreboard row. Returns { rosters, problems }, where
// rosters is [home players, away players] and problems is a list of { reason, detail }.
// Nothing here is fatal: the harvester writes problems to data/index/espn-anomalies.jsonl for the
// ledger builder. The keyEvent-team check catches the EPL 2009-10 re-ingest pattern (another match's
// events served under this id; research/espn-coverage-leagues.md §4 item 13).
export function checkSummary(row, sum) {
  if (sum == null) return { rosters: null, problems: [{ reason: 'summary-empty', detail: 'ESPN returned 404 / null' }] }
  const problems = []
  const comp = sum.header?.competitions?.[0] ?? {}
  const hdr = (comp.competitors ?? []).map((c) => ({ id: String(c.team?.id ?? c.id ?? ''), homeAway: c.homeAway, score: c.score }))
  const hdrIds = new Set(hdr.map((c) => c.id))
  const want = [String(row.homeId), String(row.awayId)]
  if (hdr.length !== 2 || !want.every((id) => hdrIds.has(id))) {
    problems.push({ reason: 'header-teams-mismatch', detail: { header: hdr.map((c) => c.id), event: want } })
  } else {
    const h = hdr.find((c) => c.id === want[0]), a = hdr.find((c) => c.id === want[1])
    if (h.homeAway && h.homeAway !== 'home') problems.push({ reason: 'header-home-away-swapped', detail: { header: hdr } })
    const hs = h.score != null ? Number(h.score) : null, as = a.score != null ? Number(a.score) : null
    if (row.homeScore != null && hs != null && (hs !== row.homeScore || as !== row.awayScore)) {
      problems.push({ reason: 'header-score-mismatch', detail: { header: [hs, as], event: [row.homeScore, row.awayScore] } })
    }
  }
  const rosterSets = sum.rosters ?? []
  const count = (teamId) => (rosterSets.find((r) => String(r.team?.id) === teamId)?.roster ?? []).length
  const rosters = [count(want[0]), count(want[1])]
  const foreign = rosterSets.filter((r) => (r.roster ?? []).length && !hdrIds.has(String(r.team?.id))).map((r) => String(r.team?.id))
  if (foreign.length) problems.push({ reason: 'roster-team-mismatch', detail: { rosterTeams: foreign } })
  if (rosters[0] === 0 || rosters[1] === 0) problems.push({ reason: 'rosters-missing', detail: { home: rosters[0], away: rosters[1] } })
  else if (rosters[0] < 11 || rosters[1] < 11) problems.push({ reason: 'rosters-short', detail: { home: rosters[0], away: rosters[1] } })
  const ke = sum.keyEvents ?? []
  const badKE = ke.filter((k) => k.team?.id != null && !hdrIds.has(String(k.team.id)))
  if (badKE.length) {
    problems.push({ reason: 'keyevent-team-mismatch', detail: { bad: badKE.length, of: ke.length, teams: [...new Set(badKE.map((k) => String(k.team.id)))] } })
  }
  return { rosters, problems }
}
