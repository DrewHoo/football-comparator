// Wikidata lineups and goals (data/index/wikidata/matches.json + players.json, built offline by
// harvest-wikidata.mjs) as a source for the international ledger, plus the name rules the archive gate
// (pipeline/gate-wikidata.mjs) uses to pair a lineup entry with a Wikidata participant. The gate script runs
// on import and writes its CSV, so its rules are ported here, not imported; keep the two in step.
// Reads only files on disk. Docs: pipeline/docs/intl.md §Wikidata.
import path from 'node:path'
import { ROOT, readJson } from './io.mjs'

export const WD_DIR = path.join(ROOT, 'data/index/wikidata')

// ---------------------------------------------------------------- names (gate-wikidata.mjs, verbatim rules)
const FOLD = { ß: 'ss', ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', œ: 'oe', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', ı: 'i', þ: 'th', ð: 'd', ħ: 'h' }
export const norm = (s) =>
  String(s ?? '')
    .replace(/[ßøØæÆœłŁđĐıþðħ]/g, (c) => FOLD[c])
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const PARTICLES = new Set(['jr', 'junior', 'sr', 'da', 'de', 'do', 'dos', 'das', 'del', 'van', 'von', 'der', 'den', 'le', 'la', 'di', 'el', 'al', 'y', 'e'])
export const toks = (s) => norm(s).split(' ').filter((t) => t && !PARTICLES.has(t))
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9
  return levFull(a, b)
}
const tokEq = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= (Math.min(a.length, b.length) >= 8 ? 2 : 1))
function levFull(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}
// transliteration-tolerant fold: Kachuro~Kachura, Vergeichik~Vyarheychyk, Fratzeskos~Frantzeskos
const phon = (t) => t.replace(/ph/g, 'f').replace(/ou/g, 'u').replace(/[yj]/g, 'i').replace(/w/g, 'v').replace(/ck|q/g, 'k').replace(/c(?=[aou])/g, 'k').replace(/([kgszdt])h/g, '$1').replace(/tz|ts|z/g, 's').replace(/(.)\1+/g, '$1')
const joinPairs = (T) => [...T, ...T.slice(0, -1).map((t, i) => t + T[i + 1])] // "MC ATEER" -> "mcateer"
const sim = (a, b) => 1 - levFull(phon(a), phon(b)) / Math.max(phon(a).length, phon(b).length, 1)
// Surname and given-name tokens of a source name. FIFA writes the surname in capitals ("OWEN Michael");
// an all-capitals or all-mixed name falls back to its last token as surname.
function archParts(name) {
  const words = String(name ?? '').split(/\s+/).filter(Boolean)
  const caps = words.filter((w) => w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w))
  if (caps.length && caps.length < words.length) return { sur: toks(caps.join(' ')), given: toks(words.filter((w) => !caps.includes(w)).join(' ')) }
  const T = toks(name)
  return { sur: T.slice(-1), given: T.slice(0, -1) }
}

/** Name matcher over the Wikidata player table (players.json). */
export function wdNames(players) {
  const formsCache = new Map()
  const forms = (q) => {
    let f = formsCache.get(q)
    if (f) return f
    const p = players.get(q)
    f = p ? [...new Set([p.label, ...(p.labels ?? []), ...(p.aliases ?? [])].filter(Boolean))].map((s) => ({ s, T: toks(s) })).filter((x) => x.T.length) : []
    formsCache.set(q, f)
    return f
  }
  // 4 exact token set, 3 one side's tokens all in the other's, 2 the same with fuzzy tokens, 1 a family-name token. 0 none.
  function nameScore(name, q) {
    const A = toks(name)
    if (!A.length) return { s: 0 }
    let best = { s: 0 }
    for (const { s: f, T: F } of forms(q)) {
      if (A.length === F.length && A.every((t) => F.includes(t))) return { s: 4, form: f }
      if (A.every((t) => F.includes(t)) || F.every((t) => A.includes(t))) best = best.s >= 3 ? best : { s: 3, form: f }
      else if (best.s < 2 && (A.every((t) => F.some((u) => tokEq(t, u))) || F.every((u) => A.some((t) => tokEq(t, u))))) best = { s: 2, form: f }
    }
    if (best.s) return best
    const fam = (players.get(q)?.family ?? []).flatMap(toks)
    if (fam.length && A.some((t) => fam.some((u) => tokEq(t, u)))) return { s: 1, form: 'family:' + players.get(q).family.join('/') }
    return { s: 0 }
  }
  // The loose pass: transliteration-folded surname similarity, with a hard veto where both sides give a
  // given name and they clearly differ (Shota v Archil Arveladze). -1 = vetoed.
  function looseScore(name, q) {
    const A = archParts(name)
    const aSur = joinPairs(A.sur).filter((t) => t.length >= 3)
    const W = []
    for (const { T } of forms(q)) W.push({ sur: T.length > 1 ? [T.at(-1), T.slice(-2).join('')] : T, given: T.slice(0, -1) })
    for (const fam of players.get(q)?.family ?? []) W.push({ sur: joinPairs(toks(fam)), given: [] })
    let best = 0
    for (const w of W) for (const t of aSur) for (const u of w.sur) if (u.length >= 3) best = Math.max(best, sim(t, u))
    const wSur = W.flatMap((w) => w.sur)
    const wGiven = W.flatMap((w) => w.given).filter((u) => !wSur.some((v) => sim(u, v) >= 0.7))
    if (best && A.given.length && wGiven.length) {
      const g = Math.max(...A.given.flatMap((t) => wGiven.map((u) => { const x = sim(t, u); return t[0] === u[0] && x >= 0.3 ? Math.max(0.5, x) : x })))
      if (g < 0.5) return -1
    }
    return best
  }
  return { nameScore, looseScore, forms: (q) => forms(q).map((f) => f.s) }
}

/**
 * One side, the gate's two passes. X: source entries [{names:[...], shirt, live:bool}], W: Wikidata participants.
 * Pass 1: best name score (x10) plus 3 for the same shirt; needs a score of 2+, or 1 (family name) with the
 * same shirt. Pass 2 ("loose", probable): leftovers that appeared, surname similarity >= 0.7 (+0.15 same shirt).
 * Returns [{i, j, ns, shirt, loose, how}].
 */
export function pairSide(X, W, N) {
  const pairs = []
  X.forEach((x, i) => W.forEach((w, j) => {
    let ns = { s: 0 }
    for (const n of x.names) { const r = N.nameScore(n, w.qid); if (r.s > ns.s) ns = r }
    const shirt = x.shirt != null && w.shirt != null && String(x.shirt) === String(w.shirt)
    const s = ns.s * 10 + (shirt ? 3 : 0)
    if (ns.s >= 2 || (ns.s === 1 && shirt)) pairs.push({ i, j, s, ns, shirt })
  }))
  pairs.sort((a, b) => b.s - a.s)
  const ai = new Map(), wj = new Map()
  for (const p of pairs) if (!ai.has(p.i) && !wj.has(p.j)) ai.set(p.i, p), wj.set(p.j, p)
  const la = X.map((_, i) => i).filter((i) => !ai.has(i) && X[i].live !== false)
  const lw = W.map((_, j) => j).filter((j) => !wj.has(j))
  const sc = []
  for (const i of la) for (const j of lw) {
    const v = Math.max(...X[i].names.map((n) => N.looseScore(n, W[j].qid)))
    sc.push({ i, j, v: v + (X[i].shirt != null && String(X[i].shirt) === String(W[j].shirt) ? 0.15 : 0) })
  }
  sc.sort((a, b) => b.v - a.v)
  for (const c of sc) {
    if (c.v < 0.7 || ai.has(c.i) || wj.has(c.j)) continue
    const p = { i: c.i, j: c.j, ns: { s: 0.5, form: 'loose' }, loose: +c.v.toFixed(3) }
    ai.set(c.i, p), wj.set(c.j, p)
  }
  return [...ai.values()].map((p) => ({ ...p, how: p.loose != null ? 'loose' : p.ns.s >= 3 ? 'exact' : p.ns.s === 2 ? 'fuzzy' : 'family+shirt' }))
}

/**
 * Attach one side's Wikidata participants to the slots of a team-match (identity.mjs slotTeamMatch output).
 * Slots with an RSSSF cap, an archive or ESPN entry, or a martj42 scorer are candidates; their names are every
 * form the slot holds. Paired slots get s.w = {P, m, side, how}. Leftover participants that share a surname with a
 * leftover slot but carry another given name are namesakes (Wikidata linked the wrong item: UEFA's Michele Marani,
 * Wikidata's Mauro Marani): s.wNamesake, no identity edge, a `wikidata_namesake` conflict. The rest become
 * slots of their own ({w}).
 */
export function attachWikidata(slots, side, m, sideKey, N) {
  const cand = slots.filter((s) => s.r || s.a || s.e || s.g)
  const X = cand.map((s) => ({
    names: [...new Set([s.r?.name, s.a?.P.name, s.e?.P.name, s.e?.P.full_name, s.g?.name].filter(Boolean))],
    shirt: s.a?.P.shirt ?? s.e?.P.shirt ?? null,
    live: !!(s.r || s.g || (s.a && s.a.P.appeared !== false) || (s.e && s.e.P.appeared !== false)),
  }))
  const Wp = side.players
  const pairs = pairSide(X, Wp, N)
  const usedW = new Set()
  for (const p of pairs) { cand[p.i].w = { P: Wp[p.j], m, side: sideKey, how: p.how, form: p.ns.form, loose: p.loose ?? null }; usedW.add(p.j) }
  const leftSlots = cand.filter((s) => !s.w && (s.r || (s.a && s.a.P.appeared !== false) || (s.e && s.e.P.appeared !== false)))
  const out = []
  Wp.forEach((wp, j) => {
    if (usedW.has(j)) return
    const T = toks(wp.name)
    const sur = T.at(-1)
    const ns = sur && sur.length >= 3 ? leftSlots.filter((s) => !s.wNamesake && [s.r?.name, s.a?.P.name, s.e?.P.name].filter(Boolean).some((n) => toks(n).includes(sur))) : []
    if (ns.length === 1) ns[0].wNamesake = { P: wp, m, side: sideKey }
    else out.push({ w: { P: wp, m, side: sideKey, how: 'unpaired' } })
  })
  return out
}

// ---------------------------------------------------------------- minutes
// P1390 is minutes into the period (P6887). First half +N = N' (N > 45 is first-half stoppage: 45+(N-45));
// second half +N = 45+N' (N > 45 is stoppage: 90+(N-45)); first period of extra time +N = 90+N' (N > 15:
// 105+(N-15)); second period of extra time +N = 105+N' (N > 15: 120+). Returns {min, added, period} in the
// archive's own convention (min = clock minute capped at the period's end, added = stoppage minutes), or null.
export const PERIODS = { 'first half': [0, 45], 'second half': [45, 45], 'first period of overtime': [90, 15], 'first period of extra time': [90, 15], 'second half of overtime': [105, 15], 'second period of overtime': [105, 15], 'second period of extra time': [105, 15] }
export function wdClock(periodLabel, time) {
  if (time == null) return null
  const P = PERIODS[String(periodLabel ?? '').toLowerCase()]
  if (!P) return { min: time, added: 0, period: null } // no period stated: take the value as a match minute
  const [start, len] = P
  // Rule WD-CLOCK: a second-half value of 60 or more can't be minutes into a 45-minute half (the longest stoppage
  // on record is about 14); it is the match-clock minute entered in the wrong form (Füllkrug "second half +68" in
  // Germany 5-1 Scotland 2024, Q123597080, scored at 68'; De Bruyne "+80", Q123597103, at 80').
  if (start === 45 && time >= 60) return time > 90 ? { min: 90, added: time - 90, period: periodLabel, rule: 'WD-CLOCK' } : { min: time, added: 0, period: periodLabel, rule: 'WD-CLOCK' }
  return time > len ? { min: start + len, added: time - len, period: periodLabel } : { min: start + time, added: 0, period: periodLabel }
}
export const clockStr = (c) => (c == null ? null : c.added ? `${c.min}+${c.added}` : `${c.min}`)

// ---------------------------------------------------------------- loader
const isOwnGoal = (g) => (g.method ?? []).some((m) => /own goal/i.test(typeof m === 'string' ? m : m?.label ?? ''))

/** Wikidata matches normalised to the archive/ESPN source shape (sources.mjs), keyed by QID. */
export function loadWikidata() {
  const matches = readJson(path.join(WD_DIR, 'matches.json'), [])
  const players = new Map(readJson(path.join(WD_DIR, 'players.json'), []).map((p) => [p.qid, p]))
  const labels = readJson(path.join(WD_DIR, 'labels.json'), {})
  const out = []
  let dupGoals = 0
  for (const m0 of matches) {
    if (!m0.home?.qid || !m0.away?.qid) continue
    // Rule WD-DUP: a side whose P1363 statements outnumber its score may hold one goal twice, once per notation
    // (De Bruyne "second half +80" and "+34" in Belgium 2-0 Romania 2024, Q123597103: one goal, 79-80'). Drop a
    // player's later statement when two of his clocks are within 2 minutes, while the side is over its score.
    let goals = m0.goals ?? []
    for (const T of [m0.home, m0.away]) {
      let mine = goals.filter((g) => g.team === T.qid)
      while (T.score != null && mine.length > T.score) {
        const ck = (g) => { const c = wdClock(g.period_label, g.time); return c ? c.min + c.added : null }
        const dup = mine.find((g, i) => mine.some((h, k) => k !== i && h.player === g.player && ck(g) != null && ck(h) != null && Math.abs(ck(g) - ck(h)) <= 2 && (k < i)))
        if (!dup) break
        goals = goals.filter((g) => g !== dup)
        mine = goals.filter((g) => g.team === T.qid)
        dupGoals++
      }
    }
    const m = goals === m0.goals ? m0 : { ...m0, goals, goals_dropped_dup: (m0.goals ?? []).filter((g) => !goals.includes(g)) }
    const hasEvents = (m.events ?? []).some((e) => e.type === 'sub')
    const end = (m.goals ?? []).some((g) => /overtime|extra/i.test(g.period_label ?? '')) || (m.events ?? []).some((e) => /overtime|extra/i.test(e.period_label ?? '') || /shootout/.test(e.type)) ? 120 : 90
    const sides = {}
    for (const [side, T] of [['home', m.home], ['away', m.away]]) {
      const parts = (m.participants ?? []).filter((p) => p.team === T.qid)
      const subsOn = new Map(), subsOff = new Map(), red = new Map()
      for (const e of m.events ?? []) {
        const c = wdClock(e.period_label, e.time)
        const at = c ? c.min : null
        if (e.type === 'sub') {
          if (e.player && !subsOn.has(e.player)) subsOn.set(e.player, at)
          if (e.replaces && !subsOff.has(e.replaces)) subsOff.set(e.replaces, at)
        }
        if ((e.type === 'red' || e.type === 'yellow-red') && e.player && !red.has(e.player)) red.set(e.player, at)
      }
      const players_ = parts.map((p) => {
        const started = hasEvents ? (p.role === 'starter' ? true : p.role === 'sub' ? false : null) : null
        const on = started === true ? 0 : started === false ? subsOn.get(p.qid) ?? null : null
        let off = subsOff.get(p.qid) ?? null
        if (red.has(p.qid)) off = Math.min(off ?? 999, red.get(p.qid) ?? 999)
        if (off === 999) off = null
        const mine = (m.goals ?? []).filter((g) => g.player === p.qid)
        const own = mine.filter(isOwnGoal), real = mine.filter((g) => !isOwnGoal(g))
        const clocks = real.map((g) => wdClock(g.period_label, g.time))
        const knownMinutes = started != null && (started || on != null)
        return {
          name: players.get(p.qid)?.label ?? p.label ?? p.qid, qid: p.qid, ext_id: p.qid, shirt: p.shirt != null && p.shirt !== '' ? Number(p.shirt) : null,
          gk: (p.position ?? []).includes('Q201330'), started, appeared: true,
          on_min: knownMinutes ? on : null, off_min: knownMinutes ? off : null, off_reason: red.has(p.qid) ? 'red' : off != null ? 'sub' : null,
          minutes: knownMinutes ? Math.max(0, Math.min(off ?? end, end) - Math.min(on, end)) : null,
          // a goal whose own-goal flag names this player but credits the other side counts for nobody here
          goals: real.length, goal_minutes: clocks.map((c) => c?.min ?? null), goal_added: clocks.map((c) => c?.added ?? 0), goal_clock: clocks.map(clockStr),
          goal_raw: real.map((g) => `${g.period_label ?? '?'} +${g.time ?? '?'}`), own_goals: own.length,
        }
      })
      // P1363's P518 is the side credited (own goals included), so the side's goal list is complete when it
      // counts to the side's score
      const credited = (m.goals ?? []).filter((g) => g.team === T.qid).length
      sides[side] = { team: T.name, team_qid: T.qid, lineup: parts.length >= 11, events: hasEvents, players: players_, goals_complete: T.score != null && credited === T.score }
    }
    out.push({
      src: 'wikidata', family: 'wikidata', source_id: m.qid, qid: m.qid, date: m.date, home: m.home.name, away: m.away.name,
      score: { home: m.home.score ?? null, away: m.away.score ?? null }, aet: end === 120, status: 'parsed',
      martj42: m.martj42 ?? null, receipt: { source: 'wikidata', item: m.qid, url: `https://www.wikidata.org/wiki/${m.qid}`, license: 'CC0' },
      goals: m.goals ?? [], warnings: [], sides,
    })
  }
  return { matches: out, players, labels, N: wdNames(players), dupGoals }
}
