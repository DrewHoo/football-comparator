// Scan every cached summary (no network) and count data-quality anomalies by league slug and season.
import fs from 'node:fs/promises'
import path from 'node:path'
const CACHE = new URL('./cache/', import.meta.url).pathname
const rows = []
for (const d of await fs.readdir(CACHE)) {
  for (const f of await fs.readdir(path.join(CACHE, d))) {
    let j
    try { j = JSON.parse(await fs.readFile(path.join(CACHE, d, f), 'utf8')) } catch { continue }
    if (!j?.header?.competitions || !('rosters' in j || 'keyEvents' in j)) continue
    const slug = j.header.league?.slug ?? '?'
    const season = j.header.season?.name?.split(',')[0] ?? '?'
    const comp = j.header.competitions[0]
    const scoreSum = comp.competitors.reduce((t, c) => t + Number(c.score ?? 0), 0)
    const goals = (j.keyEvents ?? []).filter((k) => k.scoringPlay && !k.shootout).length
    let dupRoster = 0, squadList = 0, empty = 0
    for (const r of j.rosters ?? []) {
      const ro = r.roster ?? []
      if (!ro.length) { empty++; continue }
      if (ro.length - new Set(ro.map((p) => p.athlete?.id)).size > 2) dupRoster++
      if (ro.filter((p) => p.starter).length > 11) squadList++
    }
    rows.push({ slug, season, id: j.header.id, dupRoster, squadList, empty, goalsDup: goals > scoreSum, goalsShort: goals < scoreSum })
  }
}
const by = {}
for (const r of rows) {
  const k = `${r.slug} ${r.season}`
  by[k] ??= { n: 0, dupRoster: 0, squadList: 0, emptyRoster: 0, goalsDup: 0, goalsShort: 0, ids: [] }
  const b = by[k]; b.n++
  if (r.dupRoster) { b.dupRoster++; b.ids.push('dup:' + r.id) }
  if (r.squadList) { b.squadList++; b.ids.push('squad:' + r.id) }
  if (r.empty) b.emptyRoster++
  if (r.goalsDup) { b.goalsDup++; b.ids.push('gdup:' + r.id) }
  if (r.goalsShort) { b.goalsShort++; b.ids.push('gshort:' + r.id) }
}
for (const [k, b] of Object.entries(by).sort()) console.log(k.padEnd(40), JSON.stringify({ ...b, ids: b.ids.slice(0, 8).join(' ') }))
