// Harvest Wikidata's national-team match items (1990-01-01 .. 2026-10-21) with their lineups, goals and
// players, and join them to martj42's CC0 results. Docs: pipeline/docs/wikidata.md.
//
//   node pipeline/harvest-wikidata.mjs              # fetch (cached) + build every output
//   node pipeline/harvest-wikidata.mjs --offline    # rebuild outputs from the cache only (throws on a miss)
//
// Every request goes through pipeline/lib/wikidata.mjs (1 req/s, cache under data/raw/wikidata/).
// Outputs in data/index/wikidata/: matches.json, players.json, labels.json, survey.json,
// coverage.csv, martj42-join.csv, martj42-miss.csv.
import fs from 'node:fs'
import path from 'node:path'
import { sparql, stats, lockProcess, qid, WikidataTimeout, ROOT } from './lib/wikidata.mjs'
import { canonTeam, loadMartj42, joinMartj42 } from './lib/archive/gates.mjs'

const OUT = path.join(ROOT, 'data/index/wikidata')
const MARTJ42 = path.join(ROOT, 'data/raw/martj42/results-2026-10-21.csv')
const FROM = '1990-01-01'
const TO = '2026-10-21'
const OFFLINE = process.argv.includes('--offline')
fs.mkdirSync(OUT, { recursive: true })
if (OFFLINE) process.env.WD_OFFLINE = '1'
else lockProcess('harvest-wikidata')
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// Team classes: men's national team (current class) and the older generic class, which still holds
// some senior sides (and some others; the martj42 join screens those out).
const TEAM_CLASSES = ['Q135408445', 'Q6979593']
// P31 classes that mark an item as NOT a single match even when it has two teams and a date.
const NOT_MATCH = new Set([
  'Q13406463', 'Q53945096', 'Q27020041', 'Q1478437', 'Q40434727', 'Q63981919', 'Q13406554', 'Q114609228',
  'Q18608583', 'Q107540719', 'Q98650163', 'Q126700236', 'Q109657442', 'Q500834', 'Q51036091', 'Q17633526',
  'Q107009735', 'Q111072137',
])
const HOME = 'Q24633211'
const AWAY = 'Q24633216'
const PLAYER_IDS = {
  espn: 'P3681', transfermarkt: 'P2446', fbref: 'P5750', nft: 'P2574', soccerway: 'P2369', fifa: 'P1469',
  eufootball: 'P3726', '11v11': 'P12551', uefa: 'P2276', worldfootball: 'P2020',
}
const MATCH_IDS = {
  P7455: 'transfermarkt', P13284: 'espn', P7492: 'eufootball', P8319: 'nft', P10440: 'worldfootball',
  P13665: 'fbref', P7494: 'soccerway', P13218: 'footballdatabase',
}
const values = (qs) => qs.map((q) => 'wd:' + q).join(' ')

// Run a VALUES-batched query; on a server timeout split the batch in half and retry each half.
async function batched(ids, size, build, label) {
  const out = []
  const run = async (chunk, depth) => {
    try {
      out.push(...(await sparql(build(chunk), { label: `${label} n=${chunk.length}` })))
    } catch (e) {
      if (e instanceof WikidataTimeout && chunk.length > 1) {
        log(`timeout on ${label} (${chunk.length}); splitting`)
        const h = Math.ceil(chunk.length / 2)
        await run(chunk.slice(0, h), depth + 1)
        await run(chunk.slice(h), depth + 1)
      } else throw e
    }
  }
  for (let i = 0; i < ids.length; i += size) {
    await run(ids.slice(i, i + size), 0)
    if ((i / size) % 10 === 9) log(`${label}: ${Math.min(i + size, ids.length)}/${ids.length}`, JSON.stringify(stats))
  }
  return out
}

// ---- 1. enumerate candidate match items, in windows ------------------------------------------
const windows = []
for (let y = 1990; y <= 2026; y += 3) windows.push([`${y}-01-01`, y + 3 > 2026 ? `${TO}` : `${y + 2}-12-31`])
const cand = new Map()
for (const [a, b] of windows) {
  const q = `SELECT ?m ?mLabel ?d ?prec ?c ?t WHERE {
  ?m p:P585/psv:P585 [ wikibase:timeValue ?d; wikibase:timePrecision ?prec ] .
  FILTER(?d >= "${a}T00:00:00Z"^^xsd:dateTime && ?d <= "${b}T23:59:59Z"^^xsd:dateTime)
  ?m wdt:P1923 ?t . VALUES ?tc { ${values(TEAM_CLASSES)} } ?t wdt:P31 ?tc .
  OPTIONAL { ?m wdt:P31 ?c }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`
  for (const r of await sparql(q, { label: `enumerate ${a}..${b}` })) {
    const m = qid(r.m)
    const e = cand.get(m) ?? cand.set(m, { qid: m, label: r.mLabel, dates: new Set(), prec: new Set(), classes: new Set(), teams: new Set() }).get(m)
    e.dates.add(r.d.slice(0, 10))
    e.prec.add(Number(r.prec))
    if (r.c) e.classes.add(qid(r.c))
    e.teams.add(qid(r.t))
  }
  log(`enumerate ${a}..${b}: ${cand.size} candidates so far`)
}
const excluded = { not_day_precision: 0, not_two_teams: 0, non_match_class: 0 }
const matchIds = []
for (const e of cand.values()) {
  if (![...e.prec].includes(11)) excluded.not_day_precision++
  else if (e.teams.size !== 2) excluded.not_two_teams++
  else if ([...e.classes].some((c) => NOT_MATCH.has(c))) excluded.non_match_class++
  else matchIds.push(e.qid)
}
matchIds.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
log(`candidates ${cand.size}, matches ${matchIds.length}, excluded ${JSON.stringify(excluded)}`)

// ---- 2. every statement + qualifier of every match ------------------------------------------
const rows = await batched(matchIds, 50, (chunk) => `SELECT ?m ?st ?p ?v ?pq ?qv WHERE {
  VALUES ?m { ${values(chunk)} }
  ?m ?pc ?st . ?prop wikibase:claim ?pc; wikibase:statementProperty ?ps . ?st ?ps ?v .
  OPTIONAL { ?st ?pqv ?qv . ?pqp wikibase:qualifier ?pqv . BIND(STRAFTER(STR(?pqp), "entity/") AS ?pq) }
  BIND(STRAFTER(STR(?prop), "entity/") AS ?p)
}`, 'statements')
const stmts = new Map() // match -> Map(statementId -> {p, v, q: {pq: [vals]}})
for (const r of rows) {
  const m = qid(r.m)
  const sm = stmts.get(m) ?? stmts.set(m, new Map()).get(m)
  const s = sm.get(r.st) ?? sm.set(r.st, { p: r.p, v: qid(r.v), q: {} }).get(r.st)
  if (r.pq) {
    const arr = (s.q[r.pq] ??= [])
    const v = qid(r.qv)
    if (!arr.includes(v)) arr.push(v)
  }
}
log(`statements: ${rows.length} rows over ${stmts.size} matches`)

// ---- 3. labels for every referenced non-player item ------------------------------------------
const isQ = (v) => typeof v === 'string' && /^Q\d+$/.test(v)
const playerSet = new Set()
const otherSet = new Set()
for (const sm of stmts.values())
  for (const s of sm.values()) {
    if (s.p === 'P710' && isQ(s.v)) playerSet.add(s.v)
    else if (s.p === 'P1363' && isQ(s.v)) playerSet.add(s.v)
    else if (isQ(s.v)) otherSet.add(s.v)
    for (const [pq, vs] of Object.entries(s.q))
      for (const v of vs) if (isQ(v)) (pq === 'P710' || pq === 'P1363' ? playerSet : otherSet).add(v)
  }
// players named only in P793 event qualifiers (P710 player on, P1365 player replaced): fetched in a separate
// trailing batch so the cached player batches above stay byte-identical
const eventPlayers = new Set()
for (const sm of stmts.values())
  for (const s of sm.values()) if (s.p === 'P793') for (const pq of ['P710', 'P1365']) for (const v of s.q[pq] ?? []) if (isQ(v)) eventPlayers.add(v)
for (const q of playerSet) otherSet.delete(q)
for (const q of eventPlayers) otherSet.delete(q)
// team items are referenced by P54 qualifiers too; they are in otherSet already
// (event players were in this set when the labels cache was built; keep the batches identical)
const otherIds = [...new Set([...otherSet, ...[...eventPlayers].filter((q) => !playerSet.has(q))])].sort()
const labelRows = await batched(otherIds, 200, (chunk) => `SELECT ?x ?l WHERE {
  VALUES ?x { ${values(chunk)} } OPTIONAL { ?x rdfs:label ?l . FILTER(LANG(?l) = "en") }
}`, 'labels')
const labels = {}
for (const r of labelRows) labels[qid(r.x)] = r.l ?? null
fs.writeFileSync(path.join(OUT, 'labels.json'), JSON.stringify(labels))
log(`labels: ${otherIds.length} items`)

// ---- 4. players --------------------------------------------------------------------------------
const playerIds = [...playerSet].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
const idSel = Object.entries(PLAYER_IDS).map(([k, p]) => `(GROUP_CONCAT(DISTINCT ?${k.replace(/\W/g, '_')}; SEPARATOR="|") AS ?id_${k.replace(/\W/g, '_')})`).join(' ')
const idOpt = Object.entries(PLAYER_IDS).map(([k, p]) => `OPTIONAL { ?x wdt:${p} ?${k.replace(/\W/g, '_')} }`).join('\n  ')
const LANGS = ['en', 'mul', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'cs', 'hr', 'sv', 'da', 'tr', 'ro', 'hu']
const playerQuery = (chunk) => `SELECT ?x (SAMPLE(?en) AS ?label) (SAMPLE(?dob) AS ?born)
  (GROUP_CONCAT(DISTINCT ?l; SEPARATOR="|") AS ?labels) (GROUP_CONCAT(DISTINCT ?alias; SEPARATOR="|") AS ?aliases)
  (GROUP_CONCAT(DISTINCT ?fnl; SEPARATOR="|") AS ?family) (GROUP_CONCAT(DISTINCT ?cit; SEPARATOR="|") AS ?citizenship)
  ${idSel} WHERE {
  VALUES ?x { ${values(chunk)} }
  OPTIONAL { ?x rdfs:label ?en . FILTER(LANG(?en) = "en") }
  OPTIONAL { ?x rdfs:label ?l . FILTER(LANG(?l) IN (${LANGS.map((l) => `"${l}"`).join(',')})) }
  OPTIONAL { ?x skos:altLabel ?alias . FILTER(LANG(?alias) IN ("en","mul")) }
  OPTIONAL { ?x wdt:P734 ?fn . ?fn rdfs:label ?fnl . FILTER(LANG(?fnl) IN ("en","mul")) }
  OPTIONAL { ?x wdt:P569 ?dob }
  OPTIONAL { ?x wdt:P27 ?cit }
  ${idOpt}
} GROUP BY ?x`
const pRows = await batched(playerIds, 200, playerQuery, 'players')
const extraPlayers = [...eventPlayers].filter((q) => !playerSet.has(q)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
pRows.push(...(await batched(extraPlayers, 200, playerQuery, 'players-events')))
const split = (s) => (s ? s.split('|').filter(Boolean) : [])
const players = {}
for (const r of pRows) {
  const x = qid(r.x)
  players[x] = {
    qid: x,
    label: r.label ?? null,
    born: r.born ? r.born.slice(0, 10) : null,
    citizenship: split(r.citizenship).map(qid),
    labels: split(r.labels),
    aliases: split(r.aliases),
    family: split(r.family),
    ids: Object.fromEntries(Object.keys(PLAYER_IDS).map((k) => [k, split(r['id_' + k.replace(/\W/g, '_')])]).filter(([, v]) => v.length)),
  }
}
// citizenship labels
const citIds = [...new Set(Object.values(players).flatMap((p) => p.citizenship))].filter((q) => !(q in labels))
for (const r of await batched(citIds, 200, (chunk) => `SELECT ?x ?l WHERE { VALUES ?x { ${values(chunk)} } OPTIONAL { ?x rdfs:label ?l . FILTER(LANG(?l) = "en") } }`, 'labels-citizenship'))
  labels[qid(r.x)] = r.l ?? null
for (const p of Object.values(players)) p.citizenship = p.citizenship.map((q) => ({ qid: q, label: labels[q] ?? null }))
fs.writeFileSync(path.join(OUT, 'players.json'), JSON.stringify(Object.values(players)))
fs.writeFileSync(path.join(OUT, 'labels.json'), JSON.stringify(labels))
log(`players: ${playerIds.length} QIDs, ${Object.keys(players).length} rows`)

// ---- 5. assemble match records -----------------------------------------------------------------
// Wikidata label (minus "men's national football team") -> martj42 spelling, where canonTeam doesn't cover it
const WD_TEAM_ALIASES = { Czechia: 'Czech Republic', 'Soviet Union': 'Russia', Canadian: 'Canada', Emirates: 'United Arab Emirates', Türkiye: 'Turkey', 'Republic of Korea': 'South Korea', 'Korea Republic': 'South Korea' }
const teamLabel = (q) => labels[q] ?? players[q]?.label ?? q
const teamName = (q) => {
  const n = teamLabel(q).replace(/\s+(men's\s+)?national\s+(association\s+|under-\d+\s+)?(football|soccer)\s+team$/i, '').trim()
  return WD_TEAM_ALIASES[n] ?? n
}
const NON_SENIOR = /women|olympic|under-?\s?\d\d|\bu-?\d\d\b|youth|amateur|\bb team\b|futsal|beach/i
const plabel = (q) => players[q]?.label ?? null
const num = (v) => (v == null ? null : Number(v))
const census = { P710: {}, P1923: {}, P1363: {}, P793: {}, props: {} }
const matches = []
for (const m of matchIds) {
  const c = cand.get(m)
  const sm = stmts.get(m) ?? new Map()
  const S = [...sm.values()]
  const by = (p) => S.filter((s) => s.p === p)
  for (const s of S) {
    census.props[s.p] = (census.props[s.p] ?? 0) + 1
    if (census[s.p]) for (const pq of Object.keys(s.q)) census[s.p][pq] = (census[s.p][pq] ?? 0) + 1
  }
  if (by('P1923').some((s) => NON_SENIOR.test(teamLabel(s.v))) || NON_SENIOR.test(c.label ?? '')) {
    excluded.non_senior = (excluded.non_senior ?? 0) + 1
    continue
  }
  const teamQs = new Set(by('P1923').map((s) => s.v))
  const teams = by('P1923').map((s) => ({
    qid: s.v, name: teamName(s.v), label: teamLabel(s.v),
    role: s.q.P3831?.includes(HOME) ? 'home' : s.q.P3831?.includes(AWAY) ? 'away' : null,
    score: s.q.P1351 ? num(s.q.P1351[0]) : null,
    qualifiers: Object.fromEntries(Object.entries(s.q).filter(([k]) => !['P3831', 'P1351'].includes(k))),
  }))
  // order: explicit roles, else the label "A v B" order, else as found
  let [home, away] = [teams.find((t) => t.role === 'home'), teams.find((t) => t.role === 'away')]
  if (!home || !away) {
    const lab = (c.label ?? '').toLowerCase()
    const sorted = [...teams].sort((a, b) => {
      const ia = lab.indexOf(a.name.toLowerCase()), ib = lab.indexOf(b.name.toLowerCase())
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib)
    })
    ;[home, away] = sorted
  }
  const participants = by('P710').filter((s) => !teamQs.has(s.v)).map((s) => ({
    qid: s.v, label: plabel(s.v), team: s.q.P54?.[0] ?? null, shirt: s.q.P1618?.[0] ?? null, position: s.q.P413 ?? [],
    other: Object.fromEntries(Object.entries(s.q).filter(([k]) => !['P54', 'P1618', 'P413'].includes(k))),
  }))
  // alternate model: players as P710 qualifiers on the team statement
  for (const t of teams) for (const p of t.qualifiers.P710 ?? []) participants.push({ qid: p, label: plabel(p), team: t.qid, shirt: null, position: [], other: { via: 'P1923 qualifier' } })
  const goals = by('P1363').map((s) => {
    const half = s.q.P6887?.[0] ?? null
    const t = s.q.P1390 ? num(s.q.P1390[0]) : null
    return {
      player: s.v, label: plabel(s.v), team: s.q.P518?.[0] ?? null, period: half, period_label: half ? labels[half] ?? null : null, time: t,
      method: s.q.P1443?.map((q) => labels[q] ?? q) ?? [],
      other: Object.fromEntries(Object.entries(s.q).filter(([k]) => !['P518', 'P6887', 'P1390', 'P1443'].includes(k))),
    }
  })
  const EV = { Q784121: 'sub', Q1048067: 'yellow', Q847803: 'red', Q1146097: 'yellow-red', Q140175691: 'shootout-scored', Q140175805: 'shootout-missed' }
  const events = by('P793').map((s) => ({
    type: EV[s.v] ?? labels[s.v] ?? s.v, player: s.q.P710?.[0] ?? null, replaces: s.q.P1365?.[0] ?? null,
    team: s.q.P518?.[0] ?? s.q.P54?.[0] ?? null, period: s.q.P6887?.[0] ?? null, period_label: s.q.P6887 ? labels[s.q.P6887[0]] ?? null : null,
    time: s.q.P1390 ? num(s.q.P1390[0]) : null, order: s.q.P1545 ? num(s.q.P1545[0]) : null,
  }))
  const subsOn = new Set(events.filter((e) => e.type === 'sub' && e.player).map((e) => e.player))
  const hasSubs = subsOn.size > 0
  for (const p of participants) p.role = hasSubs ? (subsOn.has(p.qid) ? 'sub' : 'starter') : null
  // players who come on in an event but are missing from P710
  const listed = new Set(participants.map((p) => p.qid))
  const subsNotListed = [...subsOn].filter((q) => !listed.has(q))
  // 2026-era items list only the starters in P710 and the substitutes only in P793 events: add them
  for (const q of subsNotListed) {
    const e = events.find((x) => x.type === 'sub' && x.player === q)
    participants.push({ qid: q, label: plabel(q), team: e.team, shirt: null, position: [], role: 'sub', other: { via: 'P793' } })
  }
  const one = (p) => by(p)[0]?.v ?? null
  const ext = {}
  for (const [p, k] of Object.entries(MATCH_IDS)) if (by(p).length) ext[k] = by(p).map((s) => s.v)
  const per = (t) => participants.filter((x) => x.team === t?.qid).length
  matches.push({
    qid: m, label: c.label, date: [...c.dates].sort()[0], classes: [...c.classes].map((q) => ({ qid: q, label: labels[q] ?? null })),
    home: home ? { qid: home.qid, name: home.name, score: home.score, role_stated: !!home.role } : null,
    away: away ? { qid: away.qid, name: away.name, score: away.score, role_stated: !!away.role } : null,
    part_of: by('P361').map((s) => ({ qid: s.v, label: labels[s.v] ?? null })),
    season: by('P3450').map((s) => ({ qid: s.v, label: labels[s.v] ?? null })),
    series: by('P179').map((s) => ({ qid: s.v, label: labels[s.v] ?? null })),
    venue: one('P276') ? { qid: one('P276'), label: labels[one('P276')] ?? null } : null,
    attendance: num(one('P1110')), referee: one('P1652') ? { qid: one('P1652'), label: labels[one('P1652')] ?? null } : null,
    ext_ids: ext,
    participants, n_participants: participants.length, n_home: per(home), n_away: per(away),
    n_unassigned: participants.filter((x) => !x.team || (x.team !== home?.qid && x.team !== away?.qid)).length,
    goals, events, n_subs: events.filter((e) => e.type === 'sub').length, subs_not_in_P710: subsNotListed,
    n_starters_home: hasSubs ? participants.filter((x) => x.team === home?.qid && x.role === 'starter').length : null,
    n_starters_away: hasSubs ? participants.filter((x) => x.team === away?.qid && x.role === 'starter').length : null,
  })
}

// ---- 6. martj42 join ---------------------------------------------------------------------------
const idx = loadMartj42(MARTJ42)
const FRIENDLY = (t) => /^friendly$/i.test(t)
const joinRows = []
const joinedKeys = new Map() // martj42 key -> wikidata qid
for (const m of matches) {
  if (!m.home || !m.away) {
    joinRows.push({ m, ok: false, detail: 'fewer than two teams' })
    continue
  }
  const rec = { home: m.home.name, away: m.away.name, date: m.date, score: m.home.score != null && m.away.score != null ? { home: m.home.score, away: m.away.score } : null }
  const j = joinMartj42(rec, idx)
  const row = j.row && !/date disagrees/.test(j.detail) ? j.row : null
  if (row) {
    const key = `${row.date}|${row.home}|${row.away}`
    if (joinedKeys.has(key)) j.detail += ` [duplicate of ${joinedKeys.get(key)}]`
    else joinedKeys.set(key, m.qid)
  }
  m.martj42 = row ? { ...row, friendly: FRIENDLY(row.tournament), score_ok: j.ok } : null
  joinRows.push({ m, ok: !!row, score_ok: j.ok, detail: j.detail, row })
}
const csv = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
const writeCsv = (file, head, rs) => fs.writeFileSync(path.join(OUT, file), [head.join(','), ...rs.map((r) => head.map((h) => csv(r[h])).join(','))].join('\n') + '\n')
writeCsv('martj42-join.csv', ['wikidata', 'label', 'date', 'home', 'away', 'wd_score', 'n_home', 'n_away', 'n_goals', 'joined', 'score_ok', 'm_date', 'm_home', 'm_away', 'm_score', 'm_tournament', 'detail'],
  joinRows.map(({ m, ok, score_ok, detail, row }) => ({
    wikidata: m.qid, label: m.label, date: m.date, home: m.home?.name, away: m.away?.name,
    wd_score: m.home?.score != null ? `${m.home.score}-${m.away?.score}` : '', n_home: m.n_home, n_away: m.n_away, n_goals: m.goals.length,
    joined: ok ? 1 : 0, score_ok: score_ok ? 1 : 0, m_date: row?.date, m_home: row?.home, m_away: row?.away, m_score: row?.score, m_tournament: row?.tournament, detail,
  })))
// martj42 rows in range with no Wikidata item (the miss list), and Wikidata items with no martj42 row
const mrows = []
for (const [d, rs] of idx.byDate) if (d >= FROM && d <= TO) for (const r of rs) mrows.push(r)
mrows.sort((a, b) => a.date.localeCompare(b.date))
writeCsv('martj42-miss.csv', ['side', 'date', 'home', 'away', 'score', 'tournament', 'wikidata', 'detail'], [
  ...mrows.filter((r) => !joinedKeys.has(`${r.date}|${r.home_team}|${r.away_team}`)).map((r) => ({ side: 'martj42-only', date: r.date, home: r.home_team, away: r.away_team, score: `${r.home_score}-${r.away_score}`, tournament: r.tournament })),
  ...joinRows.filter((j) => !j.ok).map(({ m, detail }) => ({ side: 'wikidata-only', date: m.date, home: m.home?.name, away: m.away?.name, score: m.home?.score != null ? `${m.home.score}-${m.away?.score}` : '', wikidata: m.qid, detail })),
])

// ---- 7. coverage per team and year -------------------------------------------------------------
const byKey = new Map(matches.filter((m) => m.martj42).map((m) => [`${m.martj42.date}|${m.martj42.home}|${m.martj42.away}`, m]))
const cov = new Map()
for (const r of mrows) {
  const m = byKey.get(`${r.date}|${r.home_team}|${r.away_team}`)
  const f = FRIENDLY(r.tournament) ? 'friendly' : 'competitive'
  for (const side of ['home', 'away']) {
    const team = side === 'home' ? r.home_team : r.away_team
    const k = `${team}|${r.date.slice(0, 4)}`
    const c = cov.get(k) ?? cov.set(k, { team, year: r.date.slice(0, 4), friendly_m: 0, friendly_wd: 0, friendly_lineup: 0, competitive_m: 0, competitive_wd: 0, competitive_lineup: 0 }).get(k)
    c[f + '_m']++
    if (!m) continue
    c[f + '_wd']++
    // this team's lineup: at least 11 participants credited to its Wikidata team; home/away may be swapped
    const swapped = canonTeam(m.home.name) !== canonTeam(r.home_team)
    const n = (side === 'home') !== swapped ? m.n_home : m.n_away
    if (n >= 11) c[f + '_lineup']++
  }
}
const covRows = [...cov.values()].sort((a, b) => a.team.localeCompare(b.team) || a.year.localeCompare(b.year))
writeCsv('coverage.csv', ['team', 'year', 'competitive_m', 'competitive_wd', 'competitive_lineup', 'friendly_m', 'friendly_wd', 'friendly_lineup'], covRows)

// ---- 8. survey ---------------------------------------------------------------------------------
const joined = matches.filter((m) => m.martj42)
const count = (xs, f) => xs.filter(f).length
const subQual = Object.keys(census.P710).filter((k) => !['P54', 'P1618', 'P413'].includes(k))
const survey = {
  generated: new Date().toISOString(),
  window: [FROM, TO],
  candidates: cand.size, excluded, matches: matches.length,
  joined_martj42: joined.length, joined_friendly: count(joined, (m) => m.martj42.friendly), joined_score_ok: count(joined, (m) => m.martj42.score_ok),
  martj42_rows_in_window: mrows.length, martj42_friendly_in_window: count(mrows, (r) => FRIENDLY(r.tournament)),
  with_any_participants: count(matches, (m) => m.n_participants > 0),
  with_22_or_more: count(matches, (m) => m.n_participants >= 22),
  with_both_sides_11: count(matches, (m) => m.n_home >= 11 && m.n_away >= 11),
  with_goal_statements_P1363: count(matches, (m) => m.goals.length > 0),
  with_goal_minutes: count(matches, (m) => m.goals.some((g) => g.time != null)),
  goals_total: matches.reduce((a, m) => a + m.goals.length, 0),
  goal_statements_equal_score: count(matches, (m) => m.goals.length > 0 && m.home?.score != null && m.goals.length === m.home.score + m.away.score),
  with_substitution_events_P793: count(matches, (m) => m.n_subs > 0),
  with_substitution_minutes: count(matches, (m) => m.events.some((e) => e.type === 'sub' && e.time != null)),
  with_card_events: count(matches, (m) => m.events.some((e) => /yellow|red/.test(e.type))),
  substitution_events_total: matches.reduce((a, m) => a + m.n_subs, 0),
  with_subs_and_11_starters_each_side: count(matches, (m) => m.n_subs > 0 && m.n_starters_home === 11 && m.n_starters_away === 11),
  subs_on_not_listed_in_P710: matches.reduce((a, m) => a + m.subs_not_in_P710.length, 0),
  with_P1351_goal_qualifier_on_P710: count(matches, (m) => m.participants.some((p) => p.other.P1351)),
  with_substitution_like_qualifiers_on_P710: count(matches, (m) => m.participants.some((p) => Object.keys(p.other).some((k) => k !== 'via'))),
  with_P710_starters_only_subs_in_events: count(matches, (m) => m.subs_not_in_P710.length > 0),
  participant_qualifier_census: census.P710, team_qualifier_census: census.P1923, goal_qualifier_census: census.P1363, event_qualifier_census: census.P793,
  event_types: matches.reduce((h, m) => { for (const e of m.events) h[e.type] = (h[e.type] ?? 0) + 1; return h }, {}),
  property_census: census.props,
  participants_per_side_histogram: matches.reduce((h, m) => { for (const n of [m.n_home, m.n_away]) h[n] = (h[n] ?? 0) + 1; return h }, {}),
  by_decade: Object.fromEntries(['199', '200', '201', '202'].map((d) => {
    const xs = joined.filter((m) => m.date.startsWith(d))
    const ms = mrows.filter((r) => r.date.startsWith(d))
    return [d + '0s', {
      martj42: ms.length, martj42_friendly: count(ms, (r) => FRIENDLY(r.tournament)),
      wikidata_joined: xs.length, joined_friendly: count(xs, (m) => m.martj42.friendly),
      both_sides_11: count(xs, (m) => m.n_home >= 11 && m.n_away >= 11), friendly_both_sides_11: count(xs, (m) => m.martj42.friendly && m.n_home >= 11 && m.n_away >= 11),
      with_goals: count(xs, (m) => m.goals.length > 0), with_sub_events: count(xs, (m) => m.n_subs > 0),
    }]
  })),
  players: Object.keys(players).length,
  player_id_coverage: Object.fromEntries(Object.keys(PLAYER_IDS).map((k) => [k, count(Object.values(players), (p) => p.ids[k])])),
  player_with_dob: count(Object.values(players), (p) => p.born),
  substitution_qualifiers_seen: subQual,
  requests: { ...stats },
}
fs.writeFileSync(path.join(OUT, 'matches.json'), JSON.stringify(matches))
fs.writeFileSync(path.join(OUT, 'survey.json'), JSON.stringify(survey, null, 1))
log('done', JSON.stringify({ matches: matches.length, joined: joined.length, players: survey.players, requests: stats }))
