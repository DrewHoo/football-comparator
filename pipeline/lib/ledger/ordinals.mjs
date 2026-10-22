// The second pass: ordinals over the per-match truth. Kept out of player-matches.jsonl because they
// depend on everything else being present (a match harvested later shifts every later ordinal).
//
// Two sequences per player, each with appearance, start and season numbers:
//   comp  within one competition: the league slug, `uefa.champions` (proper stages only) or
//         `uefa.champions:qual` (qualifiers; both UCL slugs feed it). "Fastest to M" counts these.
//   all   across every league + UCL proper match in the ledger (qualifiers excluded).
// tgn is the team's match number that competition-season (from matches.jsonl, every played match
// in the index whether or not its summary is cached yet), so a missed match is a gap.
// Every number starts at the ledger's first season (2002-03): a career begun earlier is offset.

export const compOf = (row) => (row.slug === 'uefa.champions_qual' || (row.slug === 'uefa.champions' && row.qualifier) ? 'uefa.champions:qual' : row.slug)

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : Number(a.id) - Number(b.id))

export function teamGameNumbers(matches) {
  const lists = new Map()
  for (const m of matches) {
    const comp = compOf(m)
    for (const t of [m.homeId, m.awayId]) {
      const k = `${comp}|${m.season}|${t}`
      const l = lists.get(k) || []
      l.push(m)
      lists.set(k, l)
    }
  }
  const tgn = new Map()
  for (const [k, l] of lists) {
    const [, , t] = k.split('|')
    l.sort(byDate).forEach((m, i) => tgn.set(`${m.id}|${t}`, i + 1))
  }
  return tgn
}

export function computeOrdinals(players, matches) {
  const tgn = teamGameNumbers(matches)
  const byAthlete = new Map()
  for (const p of players) { const l = byAthlete.get(p.athleteId) || []; l.push(p); byAthlete.set(p.athleteId, l) }
  const out = []
  for (const [athleteId, rows] of byAthlete) {
    rows.sort(byDate)
    const all = { app: 0, start: 0, seasons: new Set() }
    const comp = new Map()
    for (const r of rows) {
      const c = compOf(r)
      const s = comp.get(c) || { app: 0, start: 0, seasons: new Set() }
      comp.set(c, s)
      s.app++; if (r.started) s.start++; s.seasons.add(r.season)
      const o = { id: r.id, athleteId, comp: c, compApp: s.app, compStart: r.started ? s.start : null, compSeason: s.seasons.size, tgn: tgn.get(`${r.id}|${r.teamId}`) ?? null }
      if (c !== 'uefa.champions:qual') {
        all.app++; if (r.started) all.start++; all.seasons.add(r.season)
        Object.assign(o, { app: all.app, start: r.started ? all.start : null, season: all.seasons.size })
      } else Object.assign(o, { app: null, start: null, season: null })
      out.push(o)
    }
  }
  return out
}
