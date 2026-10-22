// Gate the FIFA/UEFA archive records (data/index/archive/<source>.json) against Wikidata's lineups and goals
// (data/index/wikidata/matches.json + players.json, built by harvest-wikidata.mjs). No network.
//
//   node pipeline/gate-wikidata.mjs                 # all archive sources on disk
//   node pipeline/gate-wikidata.mjs --source fifa2006,euro2000
//
// Writes data/index/wikidata/archive-gate.csv (one row per archive match) and archive-gate-summary.json.
// Docs: pipeline/docs/wikidata.md.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonTeam } from './lib/archive/gates.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WD = path.join(ROOT, 'data/index/wikidata')
const ARCH = path.join(ROOT, 'data/index/archive')
const arg = (k) => process.argv.find((a, i) => process.argv[i - 1] === k)
const wanted = arg('--source')?.split(',')
const sources = fs.readdirSync(ARCH).filter((f) => /^[a-z0-9]+\.json$/.test(f) && !/summary|known/.test(f)).map((f) => f.replace('.json', '')).filter((s) => !wanted || wanted.includes(s))

const matches = JSON.parse(fs.readFileSync(path.join(WD, 'matches.json'), 'utf8'))
const players = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(WD, 'players.json'), 'utf8')).map((p) => [p.qid, p]))

// ---- names ------------------------------------------------------------------------------------
const FOLD = { ß: 'ss', ø: 'o', Ø: 'o', æ: 'ae', Æ: 'ae', œ: 'oe', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd', ı: 'i', þ: 'th', ð: 'd', ħ: 'h' }
export const norm = (s) =>
  String(s ?? '')
    .replace(/[ßøØæÆœłŁđĐıþðħ]/g, (c) => FOLD[c])
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const toks = (s) => norm(s).split(' ').filter((t) => t && !['jr', 'junior', 'sr', 'da', 'de', 'do', 'dos', 'das', 'del', 'van', 'von', 'der', 'den', 'le', 'la', 'di', 'el', 'al', 'y', 'e'].includes(t))
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
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
// Archive surname and given-name tokens. FIFA writes the surname in capitals ("OWEN Michael", "Pep GUARDIOLA");
// an all-capitals or all-mixed name falls back to its last token as surname.
function archParts(name) {
  const words = String(name ?? '').split(/\s+/).filter(Boolean)
  const caps = words.filter((w) => w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w))
  if (caps.length && caps.length < words.length) return { sur: toks(caps.join(' ')), given: toks(words.filter((w) => !caps.includes(w)).join(' ')) }
  const T = toks(name)
  return { sur: T.slice(-1), given: T.slice(0, -1), all: T }
}
function wdParts(q) {
  const out = []
  for (const f of forms(q)) {
    const T = toks(f)
    if (T.length) out.push({ sur: T.length > 1 ? [T.at(-1), T.slice(-2).join('')] : T, given: T.slice(0, -1) })
  }
  for (const fam of players[q]?.family ?? []) out.push({ sur: joinPairs(toks(fam)), given: [] })
  return out
}
const sim = (a, b) => 1 - levFull(phon(a), phon(b)) / Math.max(phon(a).length, phon(b).length, 1)
function looseScore(archName, q) {
  const A = archParts(archName)
  const aSur = joinPairs(A.sur).filter((t) => t.length >= 3)
  const W = wdParts(q)
  let best = 0
  for (const w of W) for (const t of aSur) for (const u of w.sur) if (u.length >= 3) best = Math.max(best, sim(t, u))
  // given names, where both sides have one in any form, must not clearly differ (Shota v Archil Arveladze,
  // Bengt v Anders Andersson); a shared initial counts as compatible
  // (labels in surname-first languages put the surname among the given tokens: drop those)
  const wSur = W.flatMap((w) => w.sur)
  const wGiven = W.flatMap((w) => w.given).filter((u) => !wSur.some((v) => sim(u, v) >= 0.7))
  if (best && A.given.length && wGiven.length) {
    const g = Math.max(...A.given.flatMap((t) => wGiven.map((u) => { const x = sim(t, u); return t[0] === u[0] && x >= 0.3 ? Math.max(0.5, x) : x })))
    if (g < 0.5) return -1 // a hard veto: no shirt-number bonus can rescue it
  }
  return best
}
function forms(q) {
  const p = players[q]
  if (!p) return []
  return [...new Set([p.label, ...p.labels, ...p.aliases].filter(Boolean))]
}
// Score an archive name against a Wikidata player: 4 exact token set, 3 one side's tokens all in the other,
// 2 same with fuzzy tokens, 1 shares a family-name token. 0 none.
function nameScore(archName, q) {
  const A = toks(archName)
  if (!A.length) return { s: 0 }
  let best = { s: 0 }
  for (const f of forms(q)) {
    const F = toks(f)
    if (!F.length) continue
    const exact = A.length === F.length && A.every((t) => F.includes(t))
    if (exact) return { s: 4, form: f }
    if (A.every((t) => F.includes(t)) || F.every((t) => A.includes(t))) best = best.s >= 3 ? best : { s: 3, form: f }
    else if (best.s < 2 && (A.every((t) => F.some((u) => tokEq(t, u))) || F.every((u) => A.some((t) => tokEq(t, u))))) best = { s: 2, form: f }
  }
  if (best.s) return best
  const fam = (players[q]?.family ?? []).flatMap(toks)
  if (fam.length && A.some((t) => fam.some((u) => tokEq(t, u)))) return { s: 1, form: 'family:' + players[q].family.join('/') }
  return { s: 0 }
}

// ---- index Wikidata matches by date -----------------------------------------------------------
const byDate = new Map()
for (const m of matches) if (m.home && m.away) (byDate.get(m.date) ?? byDate.set(m.date, []).get(m.date)).push(m)
const shift = (iso, d) => new Date(Date.parse(iso + 'T12:00:00Z') + d * 86400e3).toISOString().slice(0, 10)
function findWd(rec) {
  if (!rec.date || !rec.home || !rec.away) return null
  const H = canonTeam(rec.home), A = canonTeam(rec.away)
  for (const off of [0, -1, 1, -2, 2])
    for (const m of byDate.get(shift(rec.date, off)) ?? []) {
      const h = canonTeam(m.home.name), a = canonTeam(m.away.name)
      if (h === H && a === A) return { m, swapped: false, off }
      if (h === A && a === H) return { m, swapped: true, off }
    }
  return null
}

// ---- per side matching -------------------------------------------------------------------------
const appeared = (p, source) => (p.role === 'starter' ? 'yes' : p.on_min != null ? 'yes' : source === 'fifa1998' && p.off_min != null ? 'yes' : source === 'fifa1998' ? 'unknown' : 'no')
function matchSide(archPlayers, wdParts, source) {
  // candidate pairs over ALL archive players (unused subs included, to detect Wikidata listing them)
  const pairs = []
  archPlayers.forEach((ap, i) =>
    wdParts.forEach((wp, j) => {
      const ns = nameScore(ap.name, wp.qid)
      const shirt = ap.shirt != null && wp.shirt != null && String(ap.shirt) === String(wp.shirt)
      let s = ns.s * 10 + (shirt ? 3 : 0)
      if (ns.s === 0 && shirt) s = 0 // shirt alone is not a match; it pairs leftovers as name-form suspects below
      if (s > 0 && (ns.s >= 2 || (ns.s === 1 && shirt))) pairs.push({ i, j, s, ns, shirt })
    }),
  )
  pairs.sort((a, b) => b.s - a.s)
  const ai = new Map(), wj = new Map()
  for (const p of pairs) if (!ai.has(p.i) && !wj.has(p.j)) ai.set(p.i, p), wj.set(p.j, p)
  // second pass: pair leftovers that are the same player under another transliteration (best first, surname similarity >= 0.7)
  const loose = new Set()
  const la = archPlayers.map((ap, i) => i).filter((i) => !ai.has(i) && appeared(archPlayers[i], source) !== 'no')
  const lw = wdParts.map((wp, j) => j).filter((j) => !wj.has(j))
  const sc = la.flatMap((i) => lw.map((j) => ({ i, j, v: looseScore(archPlayers[i].name, wdParts[j].qid) + (archPlayers[i].shirt != null && String(archPlayers[i].shirt) === String(wdParts[j].shirt) ? 0.15 : 0) })))
  sc.sort((a, b) => b.v - a.v)
  for (const c of sc) {
    if (c.v < 0.7 || ai.has(c.i) || wj.has(c.j)) continue
    const p = { i: c.i, j: c.j, s: 0, ns: { s: 0.5, form: 'loose' }, loose: c.v }
    ai.set(c.i, p), wj.set(c.j, p), loose.add(c.i)
  }
  const res = { matched: 0, exact: 0, fuzzy: 0, loose: 0, loose_pairs: [], to_unused: 0, to_unknown: 0, arch_only: [], wd_only: [], name_pairs: [], arch_appeared: 0, arch_unknown: 0, qidOf: new Map() }
  archPlayers.forEach((ap, i) => {
    const st = appeared(ap, source)
    if (st === 'yes') res.arch_appeared++
    if (st === 'unknown') res.arch_unknown++
    const p = ai.get(i)
    if (p) {
      res.qidOf.set(ap.name, wdParts[p.j].qid)
      if (loose.has(i)) res.loose_pairs.push(`${ap.name} = ${wdParts[p.j].label ?? players[wdParts[p.j].qid]?.label ?? wdParts[p.j].qid}`)
      if (st === 'yes') res.matched++, loose.has(i) ? res.loose++ : p.ns.s >= 3 ? res.exact++ : res.fuzzy++
      else if (st === 'unknown') res.to_unknown++
      else res.to_unused++
    } else if (st === 'yes') res.arch_only.push({ name: ap.name, role: ap.role, shirt: ap.shirt })
  })
  wdParts.forEach((wp, j) => {
    if (!wj.has(j)) res.wd_only.push({ qid: wp.qid, label: wp.label ?? players[wp.qid]?.label ?? wp.qid, shirt: wp.shirt })
  })
  // leftovers with the same shirt number: probably one player under two name forms
  for (const a of res.arch_only)
    for (const w of res.wd_only)
      if (a.shirt != null && w.shirt != null && String(a.shirt) === String(w.shirt)) res.name_pairs.push(`${a.name} = ${w.label} (#${a.shirt})`), (a.paired = w.paired = true)
  return res
}

// ---- goals -------------------------------------------------------------------------------------
const isOwnGoal = (g) => g.method.some((m) => /own goal/i.test(m))
function wdMinute(g) {
  if (g.time == null) return null
  const pl = (g.period_label ?? '').toLowerCase()
  // P1390 is minutes into the period: Ronaldo's 69' is "second half" +24, and a second-half value over 45 is
  // stoppage time (+48 = 90+3). 7.2% of second-half goals are over 45, about the share scored in stoppage time.
  if (/^second half$/.test(pl)) return 45 + g.time
  if (/first (half|period) of (extra|overtime)/.test(pl)) return 90 + g.time
  if (/second (half|period) of (extra|overtime)/.test(pl)) return 105 + g.time
  return g.time
}

// ---- run ---------------------------------------------------------------------------------------
const out = []
const summary = { generated: new Date().toISOString(), sources: {} }
const causes = {}
const minuteDiffs = []
for (const source of sources) {
  let recs
  try {
    recs = JSON.parse(fs.readFileSync(path.join(ARCH, source + '.json'), 'utf8')).filter((r) => r.status === 'parsed')
  } catch (e) {
    console.error(`skip ${source}: ${e.message} (the archive harvester may be mid-write; rerun)`)
    continue
  }
  const S = (summary.sources[source] = {
    parsed: recs.length, by_zone: {}, wd_found: 0, wd_with_lineups: 0, full_agree: 0, full_agree_strict: 0, players_appeared: 0, players_matched: 0, players_exact: 0, players_loose: 0,
    arch_only: 0, arch_only_subs: 0, arch_only_starters: 0, wd_only: 0, name_form_pairs: 0, wd_lists_unused_sub: 0, matches_wd_lists_unused_sub: 0,
    matches_wd_has_all_subs: 0, matches_with_subs_used: 0,
    scorer_checked: 0, scorer_agree: 0, scorer_disagree: 0, scorer_wd_no_goals: 0, goal_minutes_checked: 0, goal_minutes_agree: 0,
  })
  for (const rec of recs) {
    const zone = (rec.stage ?? rec.zone_path ?? rec.competition ?? '').match(/europe|uefa|south americ|conmebol|africa|caf\b|asia|afc\b|concacaf|north|central|oceania|ofc\b|intercontinental|play-?off/i)?.[0]?.toLowerCase() ?? (/^euro/.test(source) ? 'uefa' : 'other')
    const Z = (S.by_zone[zone] ??= { parsed: 0, wd_found: 0 })
    Z.parsed++
    const f = findWd(rec)
    if (f) Z.wd_found++
    const row = { source, source_id: rec.source_id, date: rec.date, home: rec.home, away: rec.away, score: rec.score ? `${rec.score.home}-${rec.score.away}` : '' }
    if (!f) {
      out.push({ ...row, wikidata: '', status: 'no-wikidata-item' })
      continue
    }
    S.wd_found++
    const { m, swapped } = f
    const wdTeam = { home: swapped ? m.away.qid : m.home.qid, away: swapped ? m.home.qid : m.away.qid }
    let tot = { appeared: 0, unknown: 0, matched: 0, exact: 0, loose: 0, loose_pairs: [], to_unused: 0, arch_only: [], wd_only: [], name_pairs: [], wdN: 0 }
    const qidOf = { home: new Map(), away: new Map() }
    let subsUsed = 0, subsFound = 0
    for (const L of rec.lineups) {
      const parts = m.participants.filter((p) => p.team === wdTeam[L.side])
      tot.wdN += parts.length
      const r = matchSide(L.players, parts, source)
      qidOf[L.side] = r.qidOf
      tot.appeared += r.arch_appeared, tot.unknown += r.arch_unknown, tot.matched += r.matched, tot.exact += r.exact, tot.loose += r.loose, tot.to_unused += r.to_unused
      tot.loose_pairs.push(...r.loose_pairs)
      tot.arch_only.push(...r.arch_only.map((a) => ({ ...a, side: L.side })))
      tot.wd_only.push(...r.wd_only)
      tot.name_pairs.push(...r.name_pairs)
      const usedSubs = L.players.filter((p) => p.role === 'sub' && appeared(p, source) === 'yes')
      subsUsed += usedSubs.length
      subsFound += usedSubs.filter((p) => r.qidOf.has(p.name)).length
    }
    if (tot.wdN) S.wd_with_lineups++
    // full agreement: every archive player who appeared is matched and Wikidata lists nobody unmatched
    const fullAgree = tot.wdN > 0 && tot.arch_only.length === 0 && tot.wd_only.length === 0
    if (fullAgree) S.full_agree++
    if (fullAgree && !tot.loose) S.full_agree_strict++
    if (tot.wdN) {
      S.players_appeared += tot.appeared, S.players_matched += tot.matched, S.players_exact += tot.exact, S.players_loose += tot.loose
      if (tot.loose) causes['name form (transliteration, paired loosely)'] = (causes['name form (transliteration, paired loosely)'] ?? 0) + tot.loose
      S.arch_only += tot.arch_only.length
      S.arch_only_subs += tot.arch_only.filter((a) => a.role === 'sub').length
      S.arch_only_starters += tot.arch_only.filter((a) => a.role === 'starter').length
      S.wd_only += tot.wd_only.length
      S.name_form_pairs += tot.name_pairs.length
      S.wd_lists_unused_sub += tot.to_unused
      if (tot.to_unused) S.matches_wd_lists_unused_sub++
      if (subsUsed) S.matches_with_subs_used++, subsFound === subsUsed && S.matches_wd_has_all_subs++
      for (const a of tot.arch_only) {
        const c = a.paired ? 'name form (same shirt, names differ)' : a.role === 'sub' ? 'Wikidata lacks a substitute' : 'Wikidata lacks a starter'
        causes[c] = (causes[c] ?? 0) + 1
      }
      for (const w of tot.wd_only) if (!w.paired) causes['Wikidata lists a player the archive does not (or name unmatched)'] = (causes['Wikidata lists a player the archive does not (or name unmatched)'] ?? 0) + 1
      if (tot.to_unused) causes['Wikidata lists an unused substitute'] = (causes['Wikidata lists an unused substitute'] ?? 0) + tot.to_unused
    }
    // scorers
    let scorers = 'na', scorerDetail = '', minAgree = ''
    const archGoals = (rec.goals ?? []).filter((g) => g.type !== 'og')
    const wdGoals = m.goals.filter((g) => !isOwnGoal(g))
    const total = rec.score ? rec.score.home + rec.score.away : null
    if (!m.goals.length && total > 0) scorers = 'wd-no-goals', S.scorer_wd_no_goals++
    else if (tot.wdN || m.goals.length) {
      S.scorer_checked++
      const archQ = archGoals.map((g) => {
        // the goal's player is on the credited side for normal goals
        const q = qidOf[g.side]?.get(g.player) ?? [...qidOf.home, ...qidOf.away].find(([n]) => n === g.player)?.[1]
        if (q) return { q, min: g.min == null ? null : g.min + (g.added ?? 0), name: g.player }
        // UEFA goal lines carry surnames; resolve against the side's Wikidata participants
        const parts = m.participants.filter((p) => p.team === wdTeam[g.side])
        const best = parts.map((p) => ({ p, s: nameScore(g.player, p.qid).s })).sort((a, b) => b.s - a.s)[0]
        return { q: best && best.s >= 2 ? best.p.qid : null, min: g.min == null ? null : g.min + (g.added ?? 0), name: g.player }
      })
      const ms = (xs) => xs.map((x) => x.q ?? '?' + x.name).sort().join('|')
      const a = ms(archQ), w = ms(wdGoals.map((g) => ({ q: g.player })))
      if (a === w) {
        scorers = 'agree', S.scorer_agree++
        // minutes: pair goals by player, in order
        const pool = wdGoals.map((g) => ({ q: g.player, min: wdMinute(g), raw: `${g.period_label} +${g.time}` })).sort((a, b) => (a.min ?? 999) - (b.min ?? 999))
        let ok = 0, n = 0
        for (const g of [...archQ].sort((a, b) => (a.min ?? 999) - (b.min ?? 999))) {
          const k = pool.findIndex((x) => x.q === g.q && x.min != null)
          if (k < 0 || g.min == null) continue
          n++
          if (Math.abs(pool[k].min - g.min) <= 1) ok++
          else minuteDiffs.push({ source, id: rec.source_id, wd: m.qid, player: g.name, archive: g.min, wikidata: pool[k].min, raw: pool[k].raw })
          pool.splice(k, 1)
        }
        if (n) (minAgree = `${ok}/${n}`), (S.goal_minutes_checked += n), (S.goal_minutes_agree += ok)
      } else {
        scorers = 'disagree', S.scorer_disagree++
        const lab = (q) => (q?.startsWith('?') ? q : players[q]?.label ?? q)
        scorerDetail = `archive: ${a.split('|').filter(Boolean).map(lab).join('; ')} / wikidata: ${w.split('|').filter(Boolean).map(lab).join('; ')}`
      }
    }
    out.push({
      ...row, wikidata: m.qid, status: tot.wdN ? 'compared' : 'wikidata-no-lineup', date_offset: f.off, swapped: swapped ? 1 : 0,
      arch_appeared: tot.appeared, arch_unknown_1998: tot.unknown, wd_listed: tot.wdN, matched: tot.matched, matched_exact: tot.exact, matched_loose: tot.loose, loose_pairs: tot.loose_pairs.join('; '),
      players_matched: `${tot.matched}/${tot.appeared}`, wd_unused_subs_listed: tot.to_unused, subs_used: subsUsed, subs_in_wd: subsFound,
      full_agree: fullAgree ? 1 : 0,
      archive_only: tot.arch_only.map((a) => `${a.name}${a.role === 'sub' ? ' (sub)' : ''}`).join('; '),
      wikidata_only: tot.wd_only.map((w) => w.label).join('; '),
      name_form_pairs: tot.name_pairs.join('; '),
      scorers, scorer_detail: scorerDetail, goal_minutes: minAgree,
    })
  }
  const p = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null)
  Object.assign(S, {
    pct_wd_found: p(S.wd_found, S.parsed), pct_full_agree_of_compared: p(S.full_agree, S.wd_with_lineups), pct_full_agree_strict: p(S.full_agree_strict, S.wd_with_lineups), pct_players_matched_strict: p(S.players_matched - S.players_loose, S.players_appeared), pct_players_matched: p(S.players_matched, S.players_appeared),
    pct_scorer_agree_of_checked: p(S.scorer_agree, S.scorer_checked), pct_goal_minutes_agree: p(S.goal_minutes_agree, S.goal_minutes_checked),
    pct_matches_wd_has_all_subs: p(S.matches_wd_has_all_subs, S.matches_with_subs_used),
  })
}
summary.mismatch_causes = causes
summary.goal_minute_disagreements_sample = minuteDiffs.slice(0, 40)
summary.goal_minute_disagreements = minuteDiffs.length
const head = ['source', 'source_id', 'date', 'home', 'away', 'score', 'wikidata', 'status', 'date_offset', 'swapped', 'arch_appeared', 'arch_unknown_1998', 'wd_listed', 'matched', 'matched_exact', 'matched_loose', 'players_matched', 'subs_used', 'subs_in_wd', 'wd_unused_subs_listed', 'full_agree', 'archive_only', 'wikidata_only', 'name_form_pairs', 'loose_pairs', 'scorers', 'scorer_detail', 'goal_minutes']
const csv = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
fs.writeFileSync(path.join(WD, 'archive-gate.csv'), [head.join(','), ...out.map((r) => head.map((h) => csv(r[h])).join(','))].join('\n') + '\n')
fs.writeFileSync(path.join(WD, 'archive-gate-summary.json'), JSON.stringify(summary, null, 1))
console.log(JSON.stringify(summary, null, 1))
