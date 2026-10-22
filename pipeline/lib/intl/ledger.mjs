// Builds the international ledger: spine joins, slots, identity, per-player rows, conflicts.
// Precedence (pipeline/docs/intl.md §Precedence):
//   caps (did he appear?)      RSSSF > archive > ESPN (> martj42 scorer row, for players with no log)
//   started / on / off / mins  archive = ESPN (archive taken when both; a disagreement is a conflict) > RSSSF (Czech logs)
//   goals                      RSSSF > archive > ESPN > martj42; any disagreement between sources is a
//                              conflict, and in competitive matches the pick must equal martj42 where
//                              martj42's scorer list for that side is complete, or it is a conflict.
import { P, readJsonl, readCsv, rel, ARCHIVE_SOURCES } from './io.mjs'
import { loadSpine, matchId, canonTeam } from './spine.mjs'
import { loadArchive, loadEspn } from './sources.mjs'
import { loadWikidata, attachWikidata, wdClock, clockStr } from './wikidata.mjs'
import { slotTeamMatch, Identity, nodeOf, unloggedKey } from './identity.mjs'
import { tokenKey, prettyName, normKey, significant, tokens, slugify } from './names.mjs'

// Campaign windows for undated archive records (FIFA 1998 CONCACAF pages have no date).
const WINDOWS = { fifa1998: ['1996-01-01', '1997-12-31'], fifa2002: ['2000-01-01', '2001-12-31'], fifa2006: ['2003-09-01', '2005-12-31'], fifa2010: ['2007-06-01', '2009-12-31'], euro2000: ['1998-08-01', '2000-07-31'], euro2004q: ['2002-08-01', '2003-12-31'] }

const RSSSF_TYPE = (comp, competitive) => {
  const c = String(comp ?? '')
  if (!competitive || /friendl/i.test(c)) return 'friendly'
  if (/qualif/i.test(c)) return 'qualifier'
  if (/nations league/i.test(c)) return 'nations_league'
  if (/world cup|european ch|euro\b|copa am|african (cup|nations)|asian cup|gold cup|confed/i.test(c)) return 'finals'
  return 'minor'
}

export async function build({ log = () => {} } = {}) {
  const t0 = Date.now()
  const spine = loadSpine()
  log(`spine: ${spine.matches.length} martj42 matches (${spine.file})`)
  const archive = loadArchive()
  const espn = loadEspn()
  const wd = loadWikidata()
  const wikidata = wd.matches
  log(`archive: ${archive.matches.length} records; espn: ${espn.matches.length} A-international summaries (${espn.excluded.length} youth/Olympic excluded, ${espn.files} cache files scanned); wikidata: ${wikidata.length} match items with ${wd.players.size} players (data/index/wikidata)`)

  const joinMisses = []
  const dateDisagreements = []
  const joinStats = {}
  const bump = (src, k) => ((joinStats[src] ??= { total: 0, joined: 0, exact_date: 0, offset_date: 0, undated: 0, missed: 0 })[k]++)

  // ------------------------------------------------ join archive + ESPN + Wikidata to the spine
  const srcByTm = new Map() // tm -> {archive: [m, side], espn: [m, side]}
  const joinSource = (m, srcName) => {
    bump(srcName, 'total')
    let j = m.date ? spine.lookup(m.date, m.home, m.away) : null
    if (!j && m.src === 'archive' && WINDOWS[m.family] && m.score?.home != null)
      j = spine.lookupUndated(m.home, m.away, m.score.home, m.score.away, ...WINDOWS[m.family])
    if (!j) {
      bump(srcName, 'missed')
      joinMisses.push({ kind: `${srcName}_no_match`, source: m.family, source_id: m.source_id, date: m.date, home: m.home, away: m.away, score: m.score, status: m.status, receipt: m.receipt?.url })
      return null
    }
    bump(srcName, 'joined')
    if (j.undated && m.date) j = { ...j, offset: Math.round((Date.parse(j.match.date) - Date.parse(m.date)) / 86400000), byScore: true }
    if (j.undated && !m.date) bump(srcName, 'undated')
    else if (j.offset === 0) bump(srcName, 'exact_date')
    else {
      bump(srcName, 'offset_date')
      const utc = m.src === 'espn' && j.offset === -1 && /T0\d:|T1[01]:/.test(m.kickoff_utc ?? '')
      const cause = utc ? 'ESPN stores the kickoff in UTC (after midnight UTC for an evening match in the Americas)'
        : j.byScore ? `more than 2 days apart; joined by the two teams and the score inside the ${m.family} campaign (unique)` : null
      dateDisagreements.push({ kind: 'date_disagreement', source: m.family, source_id: m.source_id, source_date: m.date, martj42_date: j.match.date, offset_days: j.offset, match_id: j.match.match_id, home: m.home, away: m.away, score: m.score, cause, receipt: m.receipt?.url })
    }
    const sm = j.match
    // source home/away -> spine side (archive and ESPN sometimes list the teams the other way round)
    const homeSide = spine.sideOf(sm, m.home) ?? (spine.sideOf(sm, m.away) === 'home' ? 'away' : spine.sideOf(sm, m.away) === 'away' ? 'home' : null)
    return { sm, map: homeSide === 'away' ? { home: 'away', away: 'home' } : { home: 'home', away: 'away' }, undated: !!j.undated }
  }
  for (const [list, name] of [[archive.matches, 'archive'], [espn.matches, 'espn']]) {
    for (const m of list) {
      const j = joinSource(m, name)
      if (!j) continue
      m._spine = j.sm.match_id
      const idObj = name === 'archive' ? { source: m.family, source_id: m.source_id, status: m.status, receipt: m.receipt.url } : { slug: m.family, event: m.source_id, receipt: m.receipt.page }
      j.sm.ids[name].push(idObj)
      for (const s of ['home', 'away']) {
        if (!m.sides[s]) continue
        const tm = `${j.sm.match_id}|${j.map[s]}`
        const slot = srcByTm.get(tm) ?? srcByTm.set(tm, {}).get(tm)
        const prev = slot[name]
        const n = m.sides[s].players.length
        if (!prev || n > prev.m.sides[prev.side].players.length) slot[name] = { m, side: s }
      }
    }
  }
  // Wikidata: the harvester's own martj42 join (date +-2, teams either order through the alias maps) first,
  // else the spine lookup. Sides map through the team names.
  for (const w of wikidata) {
    bump('wikidata', 'total')
    let sm = w.martj42 ? spine.byId.get(matchId(w.martj42.date, w.martj42.home, w.martj42.away)) : null
    if (!sm) sm = spine.lookup(w.date, w.home, w.away)?.match ?? null
    const homeSide = sm ? spine.sideOf(sm, w.home) ?? (spine.sideOf(sm, w.away) === 'home' ? 'away' : spine.sideOf(sm, w.away) === 'away' ? 'home' : w.martj42 ? (w.martj42.home === sm.home ? 'home' : 'away') : null) : null
    if (!sm || !homeSide) {
      bump('wikidata', 'missed')
      joinMisses.push({ kind: 'wikidata_no_match', source: 'wikidata', source_id: w.qid, date: w.date, home: w.home, away: w.away, score: w.score, receipt: w.receipt.url })
      continue
    }
    bump('wikidata', 'joined')
    const off = Math.round((Date.parse(sm.date) - Date.parse(w.date)) / 86400000)
    if (off === 0) bump('wikidata', 'exact_date')
    else {
      bump('wikidata', 'offset_date')
      dateDisagreements.push({ kind: 'date_disagreement', source: 'wikidata', source_id: w.qid, source_date: w.date, martj42_date: sm.date, offset_days: off, match_id: sm.match_id, home: w.home, away: w.away, score: w.score, cause: null, receipt: w.receipt.url })
    }
    w._spine = sm.match_id
    sm.ids.wikidata.push(w.qid)
    const map = homeSide === 'away' ? { home: 'away', away: 'home' } : { home: 'home', away: 'away' }
    for (const s of ['home', 'away']) {
      const tm = `${sm.match_id}|${map[s]}`
      const slot = srcByTm.get(tm) ?? srcByTm.set(tm, {}).get(tm)
      if (!slot.wikidata || w.sides[s].players.length > slot.wikidata.m.sides[slot.wikidata.side].players.length) slot.wikidata = { m: w, side: s }
    }
  }

  // ------------------------------------------------ RSSSF caps
  const coverage = new Map()
  for (const c of readCsv(P.rsssfCoverage)) coverage.set(c.url.split('/').pop().replace(/\.html$/, ''), c)
  const caps = []
  const capsByTm = new Map()
  const logs = new Map() // slug -> {player, country, team, first, last, n}
  for await (const r of readJsonl(P.rsssfCaps)) {
    bump('rsssf', 'total')
    let sm = r.join ? spine.byId.get(matchId(r.join.date, r.join.home_team, r.join.away_team)) : null
    let how = sm ? `parser:${r.join.opponent_match}` : null
    if (!sm) {
      const j = spine.lookup(r.date, r.team, r.opponent)
      if (j) (sm = j.match), (how = `build:offset${j.offset}`)
    }
    const side = sm ? spine.sideOf(sm, r.team) ?? (spine.sideOf(sm, r.opponent) === 'home' ? 'away' : spine.sideOf(sm, r.opponent) === 'away' ? 'home' : null) : null
    const cap = {
      slug: r.slug, player: r.player, team: r.team, country: r.country, cap_no: r.cap_no, date: r.date, opponent: r.opponent,
      han: r.home_away_neutral, score: r.score, player_goals: r.player_goals, competition: r.competition, competitive: r.competitive,
      minutes: r.minutes ?? null, url: r.source_url, quote: r.line_quote, match_id: sm && side ? sm.match_id : null, side, how,
    }
    if (cap.match_id) {
      bump('rsssf', 'joined')
      if (sm.date === r.date) bump('rsssf', 'exact_date')
      else bump('rsssf', 'offset_date')
      const tm = `${cap.match_id}|${side}`
      ;(capsByTm.get(tm) ?? capsByTm.set(tm, []).get(tm)).push(cap)
    } else {
      bump('rsssf', 'missed')
      joinMisses.push({ kind: 'rsssf_cap_no_match', slug: r.slug, player: r.player, team: r.team, cap_no: r.cap_no, date: r.date, opponent: r.opponent, competition: r.competition, receipt: r.source_url, quote: r.line_quote })
    }
    caps.push(cap)
    const L = logs.get(r.slug) ?? logs.set(r.slug, { slug: r.slug, player: r.player, country: r.country, team: r.team, teams: new Set(), first: r.date, last: r.date, n: 0, url: r.source_url }).get(r.slug)
    L.n++
    L.teams.add(r.team)
    if (r.date < L.first) L.first = r.date
    if (r.date > L.last) L.last = r.date
  }
  log(`rsssf: ${caps.length} caps from ${logs.size} logs, ${joinStats.rsssf.joined} joined`)

  // ------------------------------------------------ martj42 scorers per team-match
  const g42ByTm = new Map()
  const sideComplete = new Map() // tm -> bool (martj42 lists every goal for that side)
  for (const [mid, list] of spine.scorers) {
    const sm = spine.byId.get(mid)
    for (const side of ['home', 'away']) {
      const team = side === 'home' ? sm.home : sm.away
      const credited = list.filter((g) => g.team === team)
      const score = side === 'home' ? sm.home_score : sm.away_score
      sideComplete.set(`${mid}|${side}`, credited.length === score)
      const agg = new Map()
      for (const g of credited) {
        if (g.own_goal) continue
        const a = agg.get(g.scorer) ?? agg.set(g.scorer, { name: g.scorer, goals: 0, minutes: [], lines: [] }).get(g.scorer)
        a.goals++, a.minutes.push(g.minute), a.lines.push(g.line)
      }
      if (agg.size) g42ByTm.set(`${mid}|${side}`, [...agg.values()])
    }
  }
  for (const sm of spine.matches) if (sm.played && spine.scorerTournaments.has(sm.tournament)) {
    for (const side of ['home', 'away']) if ((side === 'home' ? sm.home_score : sm.away_score) === 0) sideComplete.set(`${sm.match_id}|${side}`, true)
  }

  // ------------------------------------------------ slots per team-match + identity edges
  const id = new Identity()
  const allTms = new Set([...capsByTm.keys(), ...srcByTm.keys(), ...g42ByTm.keys()])
  const slots = []
  const ties = []
  const wdTms = new Set() // team-matches with a Wikidata lineup attached
  const wHow = new Map() // w node -> {exact, fuzzy, 'family+shirt', loose, unpaired}
  const W_SCORE = { exact: 1, fuzzy: 0.9, 'family+shirt': 0.8, loose: 0.6 } // loose = probable: one vote never merges
  const teamOfTm = (tm) => { const [mid, side] = tm.split('|'); const sm = spine.byId.get(mid); return side === 'home' ? sm.home : sm.away }
  for (const tm of allTms) {
    const R = (capsByTm.get(tm) ?? []).map((c) => ({ slug: c.slug, name: c.player, row: c }))
    const S = srcByTm.get(tm) ?? {}
    const A = S.archive ? S.archive.m.sides[S.archive.side].players.map((p) => ({ family: S.archive.m.family, P: p, m: S.archive.m, side: S.archive.side })) : []
    const E = S.espn ? S.espn.m.sides[S.espn.side].players.map((p) => ({ family: S.espn.m.family, P: p, m: S.espn.m, side: S.espn.side })) : []
    const G = g42ByTm.get(tm) ?? []
    const team = teamOfTm(tm)
    const res = slotTeamMatch(R, A, E, G)
    if (S.wikidata && S.wikidata.m.sides[S.wikidata.side].players.length) {
      res.slots.push(...attachWikidata(res.slots, S.wikidata.m.sides[S.wikidata.side], S.wikidata.m, S.wikidata.side, wd.N))
      wdTms.add(tm)
    }
    for (const t of res.ties) ties.push({ tm, ...t })
    for (const s of res.slots) {
      s.tm = tm
      s.team = team
      s.n = {
        r: s.r && nodeOf.r(s.r.slug), a: s.a && nodeOf.a(s.a.family, team, s.a.P.name),
        e: s.e && nodeOf.e(s.e.P.ext_id), g: s.g && nodeOf.g(team, s.g.name), w: s.w && nodeOf.w(s.w.P.qid),
      }
      for (const n of Object.values(s.n)) if (n) id.touch(n, tm)
      const pairs = [['r', 'a', s.aScore], ['r', 'e', s.eScore], ['a', 'e', s.aeScore ?? s.eScore], ['r', 'g', s.gScore], ['a', 'g', s.gScore], ['e', 'g', s.gScore]]
      for (const [x, y, sc] of pairs) if (s.n[x] && s.n[y]) id.edge(s.n[x], s.n[y], sc ?? 0.75, tm)
      if (s.n.w) {
        const h = wHow.get(s.n.w) ?? wHow.set(s.n.w, {}).get(s.n.w)
        h[s.w.how] = (h[s.w.how] ?? 0) + 1
        for (const k of ['r', 'a', 'e', 'g']) if (s.n[k]) id.edge(s.n.w, s.n[k], W_SCORE[s.w.how] ?? 0.6, tm)
      }
      slots.push(s)
    }
  }
  // the same spelling across sources and cycles: archive, ESPN and martj42 forms of one team whose
  // 2+-token spelling is identical and whose matches lie within 12 years of each other (a form that
  // never shared a team-match with another form of the same person: a scorer in a match no lineup
  // source covers, an ESPN id in a match the archive lacks). The union constraints still apply.
  const formInfo = new Map() // node -> {team, keys:Set, first, last}
  for (const s of slots) {
    const date = s.tm.slice(0, 10)
    for (const [k, name] of [['a', s.a?.P.name], ['e', s.e?.P.name], ['e', s.e?.P.full_name], ['g', s.g?.name]]) {
      const node = s.n[k]
      if (!node || !name) continue
      const f = formInfo.get(node) ?? formInfo.set(node, { team: slugify(s.team), keys: new Set(), first: date, last: date }).get(node)
      const key = tokenKey(name)
      if (key.split(' ').length >= 2) f.keys.add(key)
      if (date < f.first) f.first = date
      if (date > f.last) f.last = date
    }
  }
  const formsByKey = new Map()
  for (const [node, f] of formInfo) for (const key of f.keys) {
    const k = `${f.team}:${key}`
    ;(formsByKey.get(k) ?? formsByKey.set(k, []).get(k)).push(node)
  }
  const years = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 31557600000
  for (const list of formsByKey.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = formInfo.get(list[i]), B = formInfo.get(list[j])
    const gap = Math.max(0, years(A.first, B.last) * (A.first > B.last ? 1 : 0), years(B.first, A.last) * (B.first > A.last ? 1 : 0))
    if (gap <= 12) id.edge(list[i], list[j], 0.9, 'same spelling, same team')
  }
  id.solve()
  log(`identity: ${id.parent.size} source nodes, ${id.edges.size} edges, ${id.rejected.length} refused`)

  // ------------------------------------------------ people
  const rootOfSlot = (s) => {
    for (const k of ['r', 'a', 'e', 'w', 'g']) if (s.n[k]) return id.find(s.n[k])
  }
  const people = new Map() // root -> person
  const person = (root) => people.get(root) ?? people.set(root, { root, slots: [], rsssf: id.rsssfOf(root) }).get(root)
  const splitSlots = []
  for (const s of slots) {
    const roots = new Set(Object.values(s.n).filter(Boolean).map((n) => id.find(n)))
    const root = rootOfSlot(s)
    if (roots.size > 1) splitSlots.push({ tm: s.tm, nodes: s.n, kept: root })
    person(root).slots.push(s)
  }
  // unjoined RSSSF caps belong to their log's person
  const rootOfLog = new Map()
  for (const slug of logs.keys()) { id.touch(nodeOf.r(slug)); rootOfLog.set(slug, id.find(nodeOf.r(slug))) }
  for (const c of caps) if (!c.match_id) person(rootOfLog.get(c.slug)).slots.push({ r: { slug: c.slug, name: c.player, row: c }, n: { r: nodeOf.r(c.slug) }, tm: null, team: c.team })

  // ------------------------------------------------ rows
  const rows = []
  const conflicts = []
  const players = []
  const usedKeys = new Set(), keyCollisions = []
  for (const p of people.values()) {
    const L = p.rsssf ? logs.get(p.rsssf) : null
    const live = (x) => x && x.P.appeared === true
    // name / key
    if (L) { p.key = `ip:${L.slug}`; p.name = L.player; p.team = L.team }
    else {
      const espnFull = p.slots.map((s) => s.e?.P.name).find(Boolean)
      const uefaFull = p.slots.map((s) => s.a?.family === 'euro2000' && s.a.P.name).find(Boolean)
      const wdName = p.slots.map((s) => s.w?.P.name).find((n) => n && !/^Q\d+$/.test(n))
      const freq = new Map()
      for (const s of p.slots) { const n = s.g?.name ?? (s.a && prettyName(s.a.P.name)); if (n) freq.set(n, (freq.get(n) ?? 0) + 1) }
      const any = [...freq].sort((x, y) => y[1] - x[1])[0]?.[0]
      const first = p.slots.map((s) => s.tm?.slice(0, 10)).filter(Boolean).sort()[0]
      p.team = p.slots[0]?.team
      Object.assign(p, unloggedKey(p.team, { espnFull, uefaFull, wikidata: wdName, any: any ?? wdName }, first))
      if (usedKeys.has(p.key)) {
        // same team, name and first year as another person the identity kept apart: a homonym, or one
        // person split by a refused merge. Suffix the key and list it for review.
        let n = 2
        while (usedKeys.has(`${p.key}~${n}`)) n++
        keyCollisions.push({ key: p.key, suffixed: `${p.key}~${n}` })
        p.key = `${p.key}~${n}`
      }
    }
    usedKeys.add(p.key)
    const prow = []
    for (const s of p.slots) {
      const sm = s.tm ? spine.byId.get(s.tm.split('|')[0]) : null
      const side = s.tm?.split('|')[1]
      let capSource = null
      if (s.r) capSource = 'rsssf'
      else if (live(s.a)) capSource = 'archive'
      else if (live(s.e)) capSource = 'espn'
      else if (s.w && !(s.a && s.a.P.appeared === false) && !(s.e && s.e.P.appeared === false)) capSource = 'wikidata'
      else if (s.g && !L && p.slots.some((x) => x.a || x.e || x.w)) capSource = 'martj42-scorer'
      // Wikidata lists a player the archive or ESPN lineup has as an unused substitute (the gate's 4% class)
      if (s.w && !s.r && ((s.a && s.a.P.appeared === false) || (s.e && s.e.P.appeared === false)) && sm) conflicts.push({
        kind: 'wikidata_lists_unused_sub', player_key: p.key, player: p.name, match_id: sm.match_id, date: sm.date, team: s.team,
        values: { archive: s.a ? describe(s.a.P) : null, espn: s.e ? describe(s.e.P) : null, wikidata: `P710 participant ${s.w.P.qid} (${s.w.P.name})` },
        chosen: 'no cap (archive/ESPN lineup > Wikidata P710 for caps)', receipts: receiptsOf(s, sm, spine) })
      if (L && !s.r) {
        // a source puts this logged player in a match his RSSSF log doesn't list
        if (capSource && capSource !== 'martj42-scorer' && sm && sm.date > L.last) { /* beyond the log: tail fill, below */ }
        else {
          if (capSource || s.g) conflicts.push({
            kind: capSource ? 'appearance_not_in_rsssf' : 'martj42_goal_without_rsssf_cap', player_key: p.key, player: p.name, match_id: sm?.match_id, date: sm?.date, team: s.team,
            values: { rsssf: 'no cap', archive: s.a ? describe(s.a.P) : null, espn: s.e ? describe(s.e.P) : null, wikidata: s.w ? describe(s.w.P) : null, martj42: s.g ? `${s.g.goals} goal(s)` : null },
            chosen: 'no cap (RSSSF > archive > ESPN for caps)', receipts: receiptsOf(s, sm, spine),
          })
          continue
        }
      }
      if (!capSource) continue
      const row = makeRow(p, s, sm, side, capSource, L, spine, sideComplete, conflicts, srcByTm)
      if (L && !s.r) row.flags.push('beyond_rsssf_log')
      prow.push(row)
    }
    if (!prow.length && !L) continue
    prow.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.cap_no ?? 0) - (b.cap_no ?? 0)))
    let n = 0
    for (const r of prow) r.app_no = ++n
    rows.push(...prow)
    const cnt = (f) => prow.filter(f).length
    const cov = L ? coverage.get(L.slug) : null
    const espnIds = [...new Set(p.slots.map((s) => s.e?.P.ext_id).filter(Boolean))]
    const qids = [...new Set(p.slots.map((s) => s.w && id.find(s.n.w) === p.root && s.w.P.qid).filter(Boolean))]
    const wp = qids.length === 1 ? wd.players.get(qids[0]) : null
    const wdEspn = (wp?.ids?.espn ?? []).filter((x) => !espnIds.includes(x))
    players.push({
      player_key: p.key, name: p.name, team: p.team, teams: L ? [...L.teams] : [p.team], rsssf_slug: L?.slug ?? null, rsssf_url: L?.url ?? null,
      intl_coverage: L ? 'complete' : 'partial',
      counts: {
        rows: prow.length, rsssf_caps: cnt((r) => r.cap_source === 'rsssf'), archive_only: cnt((r) => r.cap_source === 'archive'), espn_only: cnt((r) => r.cap_source === 'espn'),
        martj42_scorer_only: cnt((r) => r.cap_source === 'martj42-scorer'), with_archive: cnt((r) => r.sources.archive), with_espn: cnt((r) => r.sources.espn),
        with_minutes: cnt((r) => r.minutes != null), goals: prow.reduce((t, r) => t + (r.goals ?? 0), 0), goals_unknown: cnt((r) => r.goals == null),
        beyond_log: cnt((r) => r.flags.includes('beyond_rsssf_log')),
      },
      caps_stated: cov ? Number(cov.caps_stated) || null : null, goals_stated: cov ? Number(cov.goals_stated) || null : null,
      first: prow[0]?.date ?? null, last: prow.at(-1)?.date ?? null,
      espn_athlete_ids: espnIds,
      wikidata_qid: qids.length === 1 ? qids[0] : null, wikidata_qids_split: qids.length > 1 ? qids : undefined,
      club_join: { espn_athlete_ids: espnIds, espn_athlete_ids_wikidata: wdEspn, name: p.name, country: p.team, birth_year: wp?.born ? Number(wp.born.slice(0, 4)) : null, born: wp?.born ?? null, transfermarkt: wp?.ids?.transfermarkt ?? [], fbref: wp?.ids?.fbref ?? [],
        note: espnIds.length ? 'join on ESPN athlete id' : wdEspn.length ? 'join on the ESPN id Wikidata gives (P3681, the same id space as the club summaries)' : wp?.born ? 'join on name + country + birth year (birth date from Wikidata P569)' : 'no ESPN id and no Wikidata item: join on name + country + birth year once a birth year source is attached' },
    })
  }
  log(`rows: ${rows.length} for ${players.length} players; conflicts so far ${conflicts.length}`)

  // ------------------------------------------------ spine output: teams any player appears for, plus the 42
  const tracked = new Set(readCsv(P.population).map((r) => r.team))
  for (const r of rows) tracked.add(r.team)
  const matchesOut = []
  for (const sm of spine.matches) {
    if (!tracked.has(sm.home) && !tracked.has(sm.away)) continue
    const { _H, _A, _day, ...m } = sm
    matchesOut.push(m)
  }

  return {
    spine, archive, espn, wikidata, rows, conflicts, players, matches: matchesOut, joinMisses, dateDisagreements, joinStats,
    identity: { id, people, slots, ties, splitSlots, logs, keyCollisions, wHow }, srcByTm, wd, wdTms, ms: Date.now() - t0,
  }
}

function describe(P) {
  if (!P) return null
  return { started: P.started, appeared: P.appeared, on: P.on_min, off: P.off_min, minutes: P.minutes, goals: P.goals, name: P.name }
}

function receiptsOf(s, sm, spine) {
  const out = []
  if (s.r) out.push({ source: 'rsssf', url: s.r.row.url, quote: s.r.row.quote })
  if (s.a) out.push({ source: s.a.family, url: s.a.m.receipt.url, name_as_written: s.a.P.name, shirt: s.a.P.shirt })
  if (s.e) out.push({ source: 'espn', url: s.e.m.receipt.url, page: s.e.m.receipt.page, athlete_id: s.e.P.ext_id, name_as_written: s.e.P.name })
  if (s.g) out.push({ source: 'martj42', file: spine.goalscorersFile, lines: s.g.lines, name_as_written: s.g.name })
  if (s.w) out.push({ source: 'wikidata', url: s.w.m.receipt.url, item: s.w.m.qid, player: s.w.P.qid, name_as_written: s.w.P.name, paired: s.w.how, license: 'CC0' })
  if (s.wNamesake) out.push({ source: 'wikidata (namesake, not linked)', url: s.wNamesake.m.receipt.url, item: s.wNamesake.m.qid, player: s.wNamesake.P.qid, name_as_written: s.wNamesake.P.name })
  if (sm) out.push({ source: 'martj42', file: spine.file, line: sm.receipt.line })
  return out
}

// ---------------------------------------------------------------- goal clocks (docs/intl.md §Wikidata, rules)
const parseClock = (x) => {
  if (x == null) return null
  const m = String(x).match(/^(\d+)(?:\+(\d+))?$/)
  return m ? { min: Number(m[1]), added: Number(m[2] ?? 0), s: String(x) } : null
}
/** Pair two goal-clock lists (one player, one match) nearest first. A pair agrees when the capped minute is the same
 *  (rule STOP: stoppage written two ways, 90 v 90+3, 45+2 v 45) or within one minute (rule TOL: the +1 convention
 *  of counting the running minute). Returns {pairs:[{a, w, agree, rule}], extra:{a:[], w:[]}}. */
export function pairClocks(A, W) {
  const a = A.map(parseClock).filter(Boolean), w = W.map(parseClock).filter(Boolean)
  const cand = []
  a.forEach((x, i) => w.forEach((y, j) => cand.push({ i, j, d: Math.abs(x.min - y.min) + Math.abs(x.added - y.added) / 100 })))
  cand.sort((x, y) => x.d - y.d)
  const ui = new Set(), uj = new Set(), pairs = []
  for (const c of cand) {
    if (ui.has(c.i) || uj.has(c.j)) continue
    ui.add(c.i), uj.add(c.j)
    const x = a[c.i], y = w[c.j]
    const rule = x.min === y.min ? (x.added === y.added ? 'same' : 'STOP') : Math.abs(x.min - y.min) <= 1 ? 'TOL' : null
    pairs.push({ a: x, w: y, agree: !!rule, rule })
  }
  return { pairs, extra: { a: a.filter((_, i) => !ui.has(i)).map((x) => x.s), w: w.filter((_, j) => !uj.has(j)).map((y) => y.s) } }
}

function makeRow(p, s, sm, side, capSource, L, spine, sideComplete, conflicts, srcByTm) {
  const c = s.r?.row
  const a = s.a?.P.appeared === true ? s.a : null
  const e = s.e?.P.appeared === true || (s.e && s.e.P.appeared == null && s.e.m.sides[s.e.side].scorers_only) ? s.e : null
  const w = s.w ?? null
  const wSide = w ? w.m.sides[w.side] : null
  const team = sm ? (side === 'home' ? sm.home : sm.away) : c.team
  const opp = sm ? (side === 'home' ? sm.away : sm.home) : c.opponent
  const tm = s.tm
  const flags = []
  const row = {
    player_key: p.key, player: p.name, team, opponent: opp, date: sm?.date ?? c.date, match_id: sm?.match_id ?? null,
    match_type: sm ? sm.type : RSSSF_TYPE(c.competition, c.competitive), tournament: sm?.tournament ?? null,
    competition_rsssf: c?.competition ?? null, competitive: sm ? sm.competitive : !!c?.competitive,
    venue: sm ? (sm.neutral ? 'N' : side === 'home' ? 'H' : 'A') : c.han ?? null,
    score: sm?.played ? (side === 'home' ? `${sm.home_score}-${sm.away_score}` : `${sm.away_score}-${sm.home_score}`) : c?.score ?? null,
    cap_no: c?.cap_no ?? null, app_no: null,
    started: null, on_min: null, off_min: null, off_reason: null, minutes: null, goals: null,
    cap_source: capSource, field_source: { cap: capSource, started: null, minutes: null, goals: null },
    sources: {}, receipts: receiptsOf(s, sm, spine), flags,
  }
  if (c && c.date !== row.date) flags.push(`rsssf_date ${c.date}`)
  if (c) row.sources.rsssf = { cap_no: c.cap_no, goals: c.player_goals, minutes: c.minutes, join: c.how }
  if (s.a) row.sources.archive = { family: s.a.family, id: s.a.m.source_id, name: s.a.P.name, shirt: s.a.P.shirt, appeared: s.a.P.appeared, started: s.a.P.started, on: s.a.P.on_min, off: s.a.P.off_min, off_reason: s.a.P.off_reason, minutes: s.a.P.minutes, goals: s.a.P.goals, goal_minutes: s.a.P.goal_minutes }
  if (s.e) row.sources.espn = { slug: s.e.family, event: s.e.m.source_id, athlete_id: s.e.P.ext_id, name: s.e.P.name, appeared: s.e.P.appeared, started: s.e.P.started, on: s.e.P.on_min, off: s.e.P.off_min, off_reason: s.e.P.off_reason, minutes: s.e.P.minutes, goals: s.e.P.goals, goal_minutes: s.e.P.goal_minutes, season: s.e.m.season_year }
  // Wikidata goals count only where the side's P1363 list adds up to its score (or he has a goal statement)
  const wGoals = w ? (w.P.goals > 0 || wSide.goals_complete ? w.P.goals : null) : null
  if (w) row.sources.wikidata = { item: w.m.qid, qid: w.P.qid, name: w.P.name, shirt: w.P.shirt, paired: w.how, probable: w.how === 'loose' || undefined, appeared: true, started: w.P.started, on: w.P.on_min, off: w.P.off_min, off_reason: w.P.off_reason, minutes: w.P.minutes, goals: wGoals, goal_minutes: w.P.goal_clock, goal_raw: w.P.goal_raw.length ? w.P.goal_raw : undefined, side_goals_complete: wSide.goals_complete, sub_events: wSide.events }
  if (s.a && s.a.P.appeared == null && w) flags.push('appeared_from_wikidata') // FIFA 1998 sub with no minute: Wikidata lists him
  const complete = tm ? sideComplete.get(tm) === true : false
  const m42 = s.g ? s.g.goals : complete && !s.gUnknown ? 0 : null
  if (s.g || complete) row.sources.martj42 = { goals: m42, side_complete: complete, name: s.g?.name ?? null }

  // started / minutes: archive = ESPN > Wikidata (P793 events, 660 matches) > RSSSF
  const lineup = [a && ['archive', a.P], e && ['espn', e.P], w && ['wikidata', w.P]].filter(Boolean)
  const firstWith = (f) => lineup.find(([, P]) => P[f] != null)
  const st = firstWith('started')
  if (st) (row.started = st[1].started), (row.field_source.started = st[0])
  const mn = firstWith('minutes')
  if (mn) {
    Object.assign(row, { on_min: mn[1].on_min, off_min: mn[1].off_min, off_reason: mn[1].off_reason, minutes: mn[1].minutes })
    row.field_source.minutes = mn[0]
  } else if (c?.minutes != null) (row.minutes = c.minutes), (row.field_source.minutes = 'rsssf')
  if (a && e) {
    if (a.P.started != null && e.P.started != null && a.P.started !== e.P.started)
      conflicts.push({ kind: 'started', player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team, values: { archive: a.P.started, espn: e.P.started }, chosen: `archive (${a.P.started})`, receipts: row.receipts })
    if (a.P.minutes != null && e.P.minutes != null && Math.abs(a.P.minutes - e.P.minutes) > 2)
      conflicts.push({ kind: 'minutes', player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team, values: { archive: a.P.minutes, espn: e.P.minutes }, chosen: `archive (${a.P.minutes})`, receipts: row.receipts })
  }
  if (w && lineup[0] && lineup[0][0] !== 'wikidata') {
    const [k0, P0] = lineup[0]
    if (P0.started != null && w.P.started != null && P0.started !== w.P.started)
      conflicts.push({ kind: 'started', player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team, values: { [k0]: P0.started, wikidata: w.P.started }, chosen: `${k0} (${P0.started})`, receipts: row.receipts })
    if (P0.minutes != null && w.P.minutes != null && Math.abs(P0.minutes - w.P.minutes) > 2)
      conflicts.push({ kind: 'minutes', player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team, values: { [k0]: P0.minutes, wikidata: w.P.minutes }, chosen: `${k0} (${P0.minutes})`, receipts: row.receipts })
  }
  // goals: RSSSF > archive > ESPN > Wikidata > martj42
  const aGoals = a ? (a.P.goals > 0 || a.m.sides[a.side]?.goals_complete !== false ? a.P.goals : null) : null
  const gv = [['rsssf', c?.player_goals], ['archive', aGoals], ['espn', e ? e.P.goals : null], ['wikidata', wGoals], ['martj42', m42]].filter(([, v]) => v != null)
  if (gv.length) (row.goals = gv[0][1]), (row.field_source.goals = gv[0][0])
  const distinct = new Set(gv.filter(([k]) => k !== 'martj42').map(([, v]) => v))
  if (distinct.size > 1)
    conflicts.push({ kind: 'goals', player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team, values: Object.fromEntries(gv), chosen: `${gv[0][0]} (${gv[0][1]})`, rule: 'RSSSF > archive > ESPN > Wikidata > martj42', receipts: row.receipts })
  if (row.competitive && complete && m42 != null && row.goals != null && row.goals !== m42)
    conflicts.push({ kind: 'goals_vs_martj42', player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team, values: Object.fromEntries(gv), chosen: `${gv[0][0]} (${gv[0][1]})`, rule: 'competitive goals must equal martj42 where its scorer list for the side is complete', receipts: row.receipts })
  if (row.goals == null) flags.push('goals_unknown')
  // goal minutes: archive > ESPN > Wikidata, after rules STOP / TOL / WD-CLOCK / ARCH-STOP; where archive (or
  // ESPN) and Wikidata still differ, martj42's minute decides when it equals exactly one of them (rule M42-VOTE),
  // else the archive stands. Every remaining difference is a goal_minutes conflict with all three values.
  {
    const lc = a ? ['archive', a.P.goal_clock ?? a.P.goal_minutes.map(String)] : e ? ['espn', e.P.goal_minutes.filter((x) => x != null).map(String)] : null
    const wc = w && w.P.goal_clock.length ? w.P.goal_clock.filter((x) => x != null) : null
    let gm = lc && lc[1].length ? [...lc[1]] : wc ? [...wc] : null
    let gmSrc = lc && lc[1].length ? lc[0] : wc ? 'wikidata' : null
    if (lc && lc[1].length && wc) {
      const res = pairClocks(lc[1], wc)
      const m42min = (s.g?.minutes ?? []).filter((x) => x != null)
      gm = []
      const bad = []
      for (const q of res.pairs) {
        if (q.agree) { gm.push(q.rule === 'STOP' && !q.a.added && q.w.added ? q.w.s : q.a.s); continue } // the form that states the stoppage
        const mA = m42min.includes(Math.min(q.a.min, 120)), mW = m42min.includes(Math.min(q.w.min, 120))
        const pick = mW && !mA ? 'wikidata' : 'archive'
        gm.push(pick === 'wikidata' ? q.w.s : q.a.s)
        bad.push({ [lc[0]]: q.a.s, wikidata: q.w.s, martj42: m42min.length ? m42min : null, chosen: pick === 'wikidata' ? 'wikidata (M42-VOTE: martj42 has the same minute)' : mA ? `${lc[0]} (M42-VOTE: martj42 has the same minute)` : `${lc[0]} (precedence; martj42 matches neither)` })
      }
      gm.push(...res.extra.a)
      if (bad.length) conflicts.push({ kind: 'goal_minutes', player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team, values: { [lc[0]]: lc[1], wikidata: wc, wikidata_raw: w.P.goal_raw, martj42: s.g?.minutes ?? null }, pairs: bad, chosen: bad.map((b) => b.chosen).join('; '), rule: 'archive > ESPN > Wikidata after STOP/TOL/WD-CLOCK; M42-VOTE where martj42 equals exactly one', receipts: row.receipts })
      gmSrc = lc[0] + (bad.some((b) => b.chosen.startsWith('wikidata')) ? '+wikidata' : '')
    }
    if (gm && gm.length) (row.goal_minutes = gm), (row.field_source.goal_minutes = gmSrc)
  }
  // RSSSF cap the lineup source doesn't show (only where that source has this side's full lineup)
  if (c && tm) {
    const S = srcByTm.get(tm) ?? {}
    for (const [name, x] of [['archive', s.a], ['espn', s.e], ['wikidata', s.w ?? s.wNamesake]]) {
      const src = S[name]
      if (!src || !src.m.sides[src.side]?.lineup) continue
      if (x && x.P.appeared !== false) continue
      if (x == null && name === 'archive' && src.m.family === 'fifa1998' && src.m.sides[src.side].players.some((q) => q.appeared === null)) continue
      conflicts.push({ kind: x ? 'rsssf_cap_listed_unused' : 'rsssf_cap_not_in_lineup', source: name, family: src.m.family, player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team,
        values: { rsssf: `cap ${c.cap_no}`, [name]: x ? `unused substitute (${x.P.name})` : 'no lineup entry matched by name', ...(name === 'wikidata' ? { role: row.started == null ? null : row.started ? 'starter' : 'sub' } : {}) }, chosen: 'cap (RSSSF > archive > ESPN > Wikidata for caps)', receipts: [...row.receipts, { source: name, url: src.m.receipt.url }] })
    }
  }
  // an archive or ESPN appearance (no RSSSF cap) that Wikidata's full lineup for the side doesn't list
  if (!c && tm && (capSource === 'archive' || capSource === 'espn') && !s.w && !s.wNamesake) {
    const src = (srcByTm.get(tm) ?? {}).wikidata
    if (src && src.m.sides[src.side].lineup)
      conflicts.push({ kind: 'appearance_not_in_wikidata', source: 'wikidata', player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team,
        values: { [capSource]: `${row.started ? 'starter' : row.started === false ? `sub${row.on_min != null ? ' on ' + row.on_min + "'" : ''}` : 'appeared'} (${(capSource === 'archive' ? s.a : s.e).P.name})`, wikidata: 'no P710 participant matched by name' }, chosen: `cap (${capSource} > Wikidata for caps)`, receipts: [...row.receipts, { source: 'wikidata', url: src.m.receipt.url, item: src.m.qid }] })
  }
  // Wikidata's leftover participant shares this player's surname with another given name: it linked a namesake
  if (s.wNamesake && tm) conflicts.push({ kind: 'wikidata_namesake', player_key: p.key, player: p.name, match_id: row.match_id, date: row.date, team,
    values: { [c ? 'rsssf' : capSource]: c ? c.player : (s.a ?? s.e).P.name, archive: s.a?.P.name ?? null, wikidata: `${s.wNamesake.P.name} (${s.wNamesake.P.qid})` }, chosen: `${c ? 'rsssf' : capSource} (Wikidata's item not linked to this player)`, receipts: row.receipts })
  return row
}

export { ARCHIVE_SOURCES, rel, tokenKey, prettyName, normKey, significant, tokens, canonTeam }
