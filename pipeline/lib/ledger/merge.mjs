// The athlete id merge table. ESPN athlete ids never rename but often split: 185 name-plus-club
// pairs carry two or more ids in the probe sample (a re-ingest around 2006; second ids mostly
// 50-100k). 389 display names are real homonyms, so a name alone never merges.
//
// Candidate pair = two ids with the same name key that played for the same club in the same or
// adjacent seasons, or two ids one roster listed for the same player (same shirt and surname, the
// `split-id-double-listing` fold: Nantes 203760). Hard veto: the two ids both have a row in one
// match (two people; a folded listing never leaves both). Confidence from the evidence:
//   handoff     the club spells end for one id before they start for the other (+0.3)
//   jersey      the same shirt number at that club (+0.25); different shirts (-0.2)
//   position    the same roster position letter (+0.05), a different one (-0.1)
//   reingest    exactly one id in the 50k-100k re-ingest band (+0.1)
//   interleave  the ids alternate match by match at the club with no shared shirt (-0.3)
//   sameRoster  one roster listed both for one shirt (confidence 0.95, whatever the rest says)
// base 0.4; merged when >= 0.6 (high >= 0.8, medium 0.6-0.8); below that, review only.
import { nameKey } from './rules.mjs'

export const MERGE_THRESHOLD = 0.6
export const STAR_IDS = { '45843': 'Lionel Messi', '22774': 'Cristiano Ronaldo', '8039': 'Thierry Henry', '10293': 'Francesco Totti' }

function profiles(players) {
  const by = new Map()
  for (const p of players) {
    let a = by.get(p.espnId)
    if (!a) by.set(p.espnId, (a = { id: p.espnId, name: p.name, key: nameKey(p.name), apps: 0, clubs: new Map(), matches: new Set() }))
    a.apps++
    a.matches.add(p.id)
    let c = a.clubs.get(p.teamId)
    if (!c) a.clubs.set(p.teamId, (c = { seasons: new Set(), first: p.date, last: p.date, jerseys: new Map(), pos: new Map(), dates: [] }))
    c.seasons.add(p.season)
    if (p.date < c.first) c.first = p.date
    if (p.date > c.last) c.last = p.date
    c.dates.push(p.date)
    if (p.jersey) c.jerseys.set(p.jersey, (c.jerseys.get(p.jersey) || 0) + 1)
    if (p.pos && p.pos !== 'SUB') c.pos.set(p.pos, (c.pos.get(p.pos) || 0) + 1)
  }
  return by
}
const top = (m) => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
const inBand = (id) => Number(id) >= 50000 && Number(id) < 100000

/** Count how often the two ids' match dates at a club switch from one id to the other. */
function switches(da, db) {
  const all = [...da.map((d) => [d, 'a']), ...db.map((d) => [d, 'b'])].sort((x, y) => (x[0] < y[0] ? -1 : 1))
  let n = 0
  for (let i = 1; i < all.length; i++) if (all[i][1] !== all[i - 1][1]) n++
  return n
}

export function buildMergeTable(players, splitPairs = []) {
  const prof = profiles(players)
  const byName = new Map()
  for (const a of prof.values()) { if (!a.key) continue; const l = byName.get(a.key) || []; l.push(a); byName.set(a.key, l) }
  const candidates = []
  for (const [key, list] of byName) {
    if (list.length < 2) continue
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      let best = null
      for (const [team, ca] of a.clubs) {
        const cb = b.clubs.get(team)
        if (!cb) continue
        const gap = Math.min(...[...ca.seasons].flatMap((x) => [...cb.seasons].map((y) => Math.abs(x - y))))
        if (gap > 1) continue
        const ev = { team, seasonsA: [...ca.seasons].sort(), seasonsB: [...cb.seasons].sort(), gap }
        let score = 0.4
        const handoff = ca.last < cb.first || cb.last < ca.first
        if (handoff) { score += 0.3; ev.handoff = true }
        const ja = top(ca.jerseys), jb = top(cb.jerseys)
        if (ja && ja === jb) { score += 0.25; ev.jersey = ja } else if (ja && jb) { score -= 0.2; ev.jersey = `${ja}/${jb}` }
        const pa = top(ca.pos), pb = top(cb.pos)
        if (pa && pb) { if (pa === pb) { score += 0.05; ev.position = pa } else { score -= 0.1; ev.position = `${pa}/${pb}` } }
        if (inBand(a.id) !== inBand(b.id)) { score += 0.1; ev.reingest = true }
        const sw = switches(ca.dates, cb.dates)
        if (!handoff && sw > 3 && !(ja && ja === jb)) { score -= 0.3; ev.interleave = sw }
        if (!best || score > best.score) best = { score, ev }
      }
      if (!best) continue
      const shared = [...a.matches].filter((m) => b.matches.has(m))
      const veto = shared.length ? `both ids in match ${shared.slice(0, 3).join(',')}` : null
      const score = Math.round(Math.max(0, Math.min(1, best.score)) * 100) / 100
      candidates.push({
        name: a.name, nameKey: key, ids: [a.id, b.id], apps: [a.apps, b.apps], confidence: veto ? 0 : score,
        level: veto ? 'veto' : score >= 0.8 ? 'high' : score >= MERGE_THRESHOLD ? 'medium' : 'low',
        merged: !veto && score >= MERGE_THRESHOLD, veto, evidence: best.ev,
      })
    }
  }
  // pairs one roster listed for one shirt: strongest evidence there is
  const seen = new Map(candidates.map((c) => [[...c.ids].sort().join('|'), c]))
  for (const p of splitPairs) {
    const k = [...p.ids].sort().join('|')
    const c = seen.get(k)
    if (c) { c.evidence.sameRoster = (c.evidence.sameRoster || 0) + 1; if (!c.veto) Object.assign(c, { confidence: Math.max(c.confidence, 0.95), level: 'high', merged: true }); continue }
    const nc = { name: p.names[0], nameKey: nameKey(p.names[0]), ids: p.ids, apps: p.ids.map((id) => prof.get(id)?.apps || 0), confidence: 0.95, level: 'high', merged: true, veto: null, evidence: { team: p.team, seasonsA: [], seasonsB: [], jersey: p.jersey, sameRoster: 1, match: p.match, names: p.names.join(' / ') } }
    seen.set(k, nc); candidates.push(nc)
  }
  // union-find over merged pairs; the canonical id is a star id, else the id with most appearances, else the lower id
  const parent = new Map()
  const find = (x) => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x); return x }
  const appsOf = (id) => prof.get(id)?.apps || 0
  const better = (x, y) => (STAR_IDS[x] ? x : STAR_IDS[y] ? y : appsOf(x) !== appsOf(y) ? (appsOf(x) > appsOf(y) ? x : y) : Number(x) < Number(y) ? x : y)
  // The same-match veto has to hold for whole groups, not just pairs: merging is transitive, and
  // Jorge López (12194, Zaragoza) reached Pedro López (103012, Valladolid) through a second López id
  // although both started match 275895 on opposite sides (full-scope build, 2026-10-22). Strongest
  // candidates merge first; a merge that would put two ids from one match in a group is refused.
  const groupMatches = new Map()
  const matchesOfGroup = (r) => { if (!groupMatches.has(r)) groupMatches.set(r, new Set(prof.get(r)?.matches ?? [])); return groupMatches.get(r) }
  const order = candidates.filter((c) => c.merged).sort((x, y) => y.confidence - x.confidence)
  for (const c of order) {
    const ra = find(c.ids[0]), rb = find(c.ids[1])
    if (ra === rb) continue
    const ma = matchesOfGroup(ra), mb = matchesOfGroup(rb)
    const [small, large] = ma.size <= mb.size ? [ma, mb] : [mb, ma]
    let clash = null
    for (const m of small) if (large.has(m)) { clash = m; break }
    if (clash) { Object.assign(c, { merged: false, level: 'veto', veto: `groups share match ${clash} (transitive)` }); continue }
    const keep = better(ra, rb)
    const union = new Set([...ma, ...mb])
    parent.set(ra, keep); parent.set(rb, keep); parent.set(keep, keep)
    groupMatches.set(keep, union)
  }
  const map = {}
  for (const id of parent.keys()) { const r = find(id); if (r !== id) map[id] = r }
  candidates.sort((x, y) => y.confidence - x.confidence || x.name.localeCompare(y.name))
  const homonymNames = [...byName.values()].filter((l) => l.length > 1).length
  return { map, candidates, stats: { athletes: prof.size, namesWithSeveralIds: homonymNames, candidates: candidates.length, merged: Object.keys(map).length } }
}

export const canonical = (map, id) => map[id] ?? id
