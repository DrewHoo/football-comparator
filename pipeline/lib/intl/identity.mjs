// Identity: one international player key per person across RSSSF names, archive (FIFA / UEFA) names,
// ESPN athlete ids and martj42 scorer names.
//
// Stage 1, per team-match (same match, same side): assign each source's entries to the RSSSF caps in
// that team-match by name (names.mjs), greedily from the best score down, refusing ties. Archive and
// ESPN entries left over are assigned to each other (shirt number breaks ties); martj42 scorers are
// assigned to whoever is left that the sources say scored, else anyone left. Every assignment is a
// "slot": one person in one team-match, holding what each source says about them.
// Stage 2, union-find over source nodes (r:<rsssf slug>, a:<archive family>:<team>:<name key>,
// e:<espn athlete id>, g:<team>:<martj42 scorer key>) with the slot assignments as edges, strongest
// first. Two constraints: a person holds at most one RSSSF log, and two nodes of the same source that
// appear in the same team-match are different people. A refused edge goes to the review list.
import { nameScore, sharedTokens, sharedScore, tokenKey, prettyName, slugify } from './names.mjs'

export const nodeOf = {
  r: (slug) => `r:${slug}`,
  a: (family, team, name) => `a:${family}:${slugify(team)}:${tokenKey(name) || slugify(name)}`,
  e: (id) => `e:${id}`,
  g: (team, name) => `g:${slugify(team)}:${tokenKey(name) || slugify(name)}`,
  w: (qid) => `w:${qid}`, // a Wikidata player item (one QID is one person everywhere)
}
const kindOf = (node) => node[0]

/** Greedy unique assignment between lists X and Y. score(x, y) -> number; pairs below min are ignored.
 *  Equal-score competition for the same x or y is a tie and is refused (both stay unassigned). */
export function assign(X, Y, score, min = 0.5) {
  const pairs = []
  for (let i = 0; i < X.length; i++) for (let j = 0; j < Y.length; j++) {
    const s = score(X[i], Y[j])
    if (s >= min) pairs.push({ i, j, s })
  }
  pairs.sort((a, b) => b.s - a.s)
  const ux = new Set(), uy = new Set(), out = [], ties = []
  let k = 0
  while (k < pairs.length) {
    let e = k
    while (e < pairs.length && pairs[e].s === pairs[k].s) e++
    const group = pairs.slice(k, e).filter((p) => !ux.has(p.i) && !uy.has(p.j))
    const cx = new Map(), cy = new Map()
    for (const p of group) cx.set(p.i, (cx.get(p.i) ?? 0) + 1), cy.set(p.j, (cy.get(p.j) ?? 0) + 1)
    for (const p of group) {
      if (cx.get(p.i) === 1 && cy.get(p.j) === 1) { ux.add(p.i); uy.add(p.j); out.push(p) }
      else ties.push(p)
    }
    k = e
  }
  return { pairs: out, ties: ties.filter((p) => !ux.has(p.i) && !uy.has(p.j)) }
}

const fullName = (p) => p.full_name || p.name
const sScore = (a, b) => {
  let s = Math.max(nameScore(fullName(a), fullName(b)), nameScore(a.name, b.name))
  if (a.shirt != null && a.shirt === b.shirt) s = s >= 0.3 ? Math.min(1, s + 0.15) : s
  return s
}

/**
 * Build slots for one team-match.
 *   R: RSSSF caps [{slug, name, row}]; A: archive entries [{family, P, m}]; E: ESPN entries [{P, m}];
 *   G: martj42 scorers [{name, goals, minutes, lines}]
 * Returns {slots:[{r?, a?, e?, g?, score:{...}}], ties:[...]}
 */
export function slotTeamMatch(R, A, E, G) {
  const slots = R.map((r) => ({ r }))
  const ties = []
  const note = (what, t) => ties.push({ what, ...t })
  // appeared (true or unknown) first; an RSSSF cap left over may then match an unused substitute
  const attach = (list, key) => {
    const live = list.filter((x) => x.P.appeared !== false)
    const unused = list.filter((x) => x.P.appeared === false)
    const free = () => slots.filter((s) => s.r && !s[key])
    let f = free()
    let res = assign(live, f, (x, s) => nameScore(fullName(x.P), s.r.name))
    for (const p of res.pairs) Object.assign(f[p.j], { [key]: live[p.i], [key + 'Score']: p.s })
    for (const t of res.ties) note(key + '~rsssf', { source: fullName(live[t.i].P), rsssf: f[t.j].r.name, score: t.s })
    const usedLive = new Set(res.pairs.map((p) => live[p.i]))
    // pass 2: leftovers sharing a 4+-letter token, unique both ways (nickname vs full name: Tawan SRIPAN /
    // Totchtawan Sripan; FIFA's reversed Paul SUBRATA / Subrata Pal)
    {
      const L = live.filter((x) => !usedLive.has(x)), F = free()
      const r2 = assign(L, F, (x, s) => sharedScore(fullName(x.P), s.r.name), 0.55)
      for (const p of r2.pairs) { Object.assign(F[p.j], { [key]: L[p.i], [key + 'Score']: p.s, [key + 'Weak']: true }); usedLive.add(L[p.i]) }
    }
    f = free()
    res = assign(unused, f, (x, s) => nameScore(fullName(x.P), s.r.name), 0.75)
    for (const p of res.pairs) Object.assign(f[p.j], { [key]: unused[p.i], [key + 'Score']: p.s, [key + 'Unused']: true })
    const usedUnused = new Set(res.pairs.map((p) => unused[p.i]))
    return list.filter((x) => !usedLive.has(x) && !usedUnused.has(x))
  }
  const restA = attach(A, 'a')
  const restE = attach(E, 'e')
  // archive and ESPN entries with no RSSSF log: pair them with each other (the same match, both sources)
  const liveA = restA.filter((x) => x.P.appeared !== false), liveE = restE.filter((x) => x.P.appeared !== false)
  const ae = assign(liveA, liveE, (x, y) => sScore(x.P, y.P))
  const pairedA = new Set(), pairedE = new Set()
  for (const p of ae.pairs) { slots.push({ a: liveA[p.i], e: liveE[p.j], aeScore: p.s }); pairedA.add(liveA[p.i]); pairedE.add(liveE[p.j]) }
  for (const t of ae.ties) note('archive~espn', { archive: liveA[t.i].P.name, espn: liveE[t.j].P.name, score: t.s })
  // RSSSF slot with archive but no ESPN (or the reverse) may still pair with a leftover by shirt+name
  for (const s of slots) {
    if (s.r && s.a && !s.e) {
      const c = liveE.filter((y) => !pairedE.has(y) && sScore(s.a.P, y.P) >= 0.75)
      if (c.length === 1) { s.e = c[0]; s.eScore = sScore(s.a.P, c[0].P); pairedE.add(c[0]) }
    }
  }
  for (const x of restA) if (!pairedA.has(x)) slots.push({ a: x })
  for (const y of restE) if (!pairedE.has(y)) slots.push({ e: y })
  // martj42 scorers: to a slot whose sources say he scored, else any slot; then by elimination on the
  // goal count (martj42 "Tostão" vs RSSSF "Eduardo Gonçalves de Andrade")
  if (G.length) {
    const goalsOf = (s) => s.r?.row.player_goals ?? s.a?.P.goals ?? s.e?.P.goals ?? 0
    const scored = (s) => (s.r?.row.player_goals ?? 0) > 0 || (s.a?.P.goals ?? 0) > 0 || (s.e?.P.goals ?? 0) > 0
    const sname = (s) => [s.r?.name, s.a && fullName(s.a.P), s.e && fullName(s.e.P)].filter(Boolean)
    const best = (g, s) => Math.max(0, ...sname(s).map((n) => nameScore(g.name, n)))
    const done = new Set()
    const pass = (min, pick, scoreFn) => {
      const rest = G.filter((g) => !done.has(g))
      const free = slots.filter((s) => !s.g && pick(s))
      const res = assign(rest, free, scoreFn, min)
      for (const p of res.pairs) { free[p.j].g = rest[p.i]; free[p.j].gScore = Math.min(1, p.s); done.add(rest[p.i]) }
    }
    pass(0.5, scored, best)
    pass(0.75, () => true, best)
    pass(0.55, scored, (g, s) => Math.max(0, ...sname(s).map((n) => sharedScore(g.name, n))))
    pass(0.5, scored, (g, s) => (goalsOf(s) === g.goals ? 0.5 : 0)) // elimination: unique equal goal count
    const left = G.filter((g) => !done.has(g))
    for (const g of left) slots.push({ g })
    if (left.length) for (const s of slots) if (!s.g) s.gUnknown = true // martj42 can't say 0 for anyone left
  }
  return { slots, ties }
}

/** Union-find over nodes, edges strongest first, with the two constraints. */
export class Identity {
  constructor() {
    this.parent = new Map()
    this.info = new Map() // root -> {r:Set, tms:{kind:Set}}
    this.edges = new Map() // "n1|n2" -> {a, b, votes, sum, via:Set}
    this.nodeTms = new Map() // node -> Set(tm)
    this.rejected = []
  }
  touch(node, tm) {
    if (!this.parent.has(node)) {
      this.parent.set(node, node)
      this.info.set(node, { r: new Set(kindOf(node) === 'r' ? [node] : []), tms: {} })
    }
    if (tm) {
      ;(this.nodeTms.get(node) ?? this.nodeTms.set(node, new Set()).get(node)).add(tm)
      const inf = this.info.get(this.find(node))
      ;(inf.tms[kindOf(node)] ??= new Set()).add(tm)
    }
  }
  find(n) {
    let p = this.parent.get(n)
    if (p === undefined) return undefined
    while (p !== this.parent.get(p)) p = this.parent.get(p)
    let c = n
    while (this.parent.get(c) !== p) { const nx = this.parent.get(c); this.parent.set(c, p); c = nx }
    return p
  }
  edge(a, b, score, via) {
    if (!a || !b || a === b) return
    const k = a < b ? `${a}|${b}` : `${b}|${a}`
    const e = this.edges.get(k) ?? this.edges.set(k, { a, b, votes: 0, sum: 0, via: new Set() }).get(k)
    e.votes++
    e.sum += score
    e.via.add(via)
  }
  canMerge(ra, rb) {
    const A = this.info.get(ra), B = this.info.get(rb)
    if (A.r.size && B.r.size) return 'two RSSSF logs'
    for (const k of Object.keys(A.tms)) {
      const sa = A.tms[k], sb = B.tms[k]
      if (!sb) continue
      const [small, big] = sa.size < sb.size ? [sa, sb] : [sb, sa]
      for (const t of small) if (big.has(t)) return `both in ${t} (${k})`
    }
    return null
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b)
    if (ra === rb) return null
    const why = this.canMerge(ra, rb)
    if (why) return why
    const A = this.info.get(ra), B = this.info.get(rb)
    this.parent.set(rb, ra)
    for (const r of B.r) A.r.add(r)
    for (const [k, s] of Object.entries(B.tms)) { const t = (A.tms[k] ??= new Set()); for (const x of s) t.add(x) }
    this.info.delete(rb)
    return null
  }
  /** Union all edges, strongest first (votes, then mean score). Edges with a single vote below 0.75 mean
   *  score are too weak to merge on (kept for review). */
  solve() {
    const list = [...this.edges.values()].map((e) => ({ ...e, mean: e.sum / e.votes }))
    list.sort((x, y) => y.votes - x.votes || y.mean - x.mean)
    for (const e of list) {
      if (e.votes === 1 && e.mean < 0.75) { this.rejected.push({ a: e.a, b: e.b, votes: e.votes, mean: e.mean, why: 'single weak vote' }); continue }
      const why = this.union(e.a, e.b)
      if (why) this.rejected.push({ a: e.a, b: e.b, votes: e.votes, mean: +e.mean.toFixed(3), why })
    }
    this.solvedEdges = list
  }
  rsssfOf(node) {
    const inf = this.info.get(this.find(node))
    return inf ? [...inf.r][0]?.slice(2) ?? null : null
  }
}

/** Display name and key for a person with no RSSSF log. */
export function unloggedKey(team, names, firstDate) {
  const best = names.espnFull ?? names.uefaFull ?? names.wikidata ?? names.any
  return { key: `ip:${slugify(team)}:${slugify(prettyName(best))}:${String(firstDate ?? '').slice(0, 4)}`, name: prettyName(best) }
}
