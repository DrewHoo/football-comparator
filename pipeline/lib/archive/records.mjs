// Turn parser output (fifa.mjs, uefa.mjs, uefa-ms.mjs) into the archive record schema:
//   {source, source_id, status, competition, stage, date, home, away, score, venue, attendance, referee,
//    lineups: [{team, side, coach, players: [{name, shirt, gk, captain, role, on_min, off_min, off_reason,
//                                             goals: [{min, added, type}], cards: [{type, min, added}]}]}],
//    goals: [{side, team, player, min, added, type, raw}], receipts: [{url, timestamp, original}], warnings}
// role is starter|sub; on_min 0 for starters, null for an unused (or, FIFA 1998, unrecorded) sub;
// off_min null when the player finished the match; off_reason sub|red. Goal type goal|pen|og; an own
// goal sits on the scorer's player row and is credited to the other side in `goals`.
// Nothing is corrected here: source errors known from two-source checks become warnings only.

export const normName = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
export function isoDate(s) {
  if (!s) return null
  let m = String(s).match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/)
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? m[0] : null
}

export function parseScore(s) {
  const t = String(s ?? '')
  const m = t.match(/(\d+)\s*[:-]\s*(\d+)/)
  if (!m) return null
  const out = { home: Number(m[1]), away: Number(m[2]), raw: t.trim() }
  const ht = t.match(/\((\d+)\s*[:-]\s*(\d+)/)
  if (ht) out.ht = `${ht[1]}-${ht[2]}`
  if (/a\.?e\.?t|extra|golden/i.test(t)) out.aet = true
  const p = t.match(/(\d+)\s*[:-]\s*(\d+)\s*(?:PSO|pens?|p\.)/i)
  if (p) out.pens = { home: Number(p[1]), away: Number(p[2]) }
  return out
}

/** "45'+1", "48+'", "117 ET", "90+2" -> {min, added} */
export function parseMin(s) {
  const t = String(s ?? '')
  const m = t.match(/(\d+)\s*'?\s*(\+\s*(\d+)?)?/)
  if (!m) return { min: null }
  const r = { min: Number(m[1]) }
  if (m[3]) r.added = Number(m[3])
  else if (m[2]) r.added = 0 // "48+'" : stoppage time, amount not given
  return r
}

const player = (o) => ({ name: String(o.name ?? '').replace(/\s*\((?:G|GK)\)\s*/g, ' ').trim(), shirt: o.shirt ?? null, gk: !!o.gk || /\((?:G|GK)\)/.test(o.name ?? ''), captain: !!o.captain, role: o.role, on_min: o.on_min ?? null, off_min: o.off_min ?? null, off_reason: o.off_reason ?? null, goals: [], cards: [] })

function findPlayer(lineups, name, sideHint) {
  const n = normName(name)
  if (!n) return null
  const all = lineups.flatMap((l) => l.players.map((p) => ({ lineup: l, p, pn: normName(p.name) })))
  const pick = (c) => (c.length === 1 ? c[0] : sideHint && c.filter((x) => x.lineup.side === sideHint).length === 1 ? c.find((x) => x.lineup.side === sideHint) : null)
  const exact = pick(all.filter((x) => x.pn === n))
  if (exact) return exact
  // fuzzy: shares a word of 3+ letters; accepted only when unique
  const words = n.split(' ').filter((w) => w.length > 2)
  return pick(all.filter((x) => x.pn.split(' ').some((w) => words.includes(w))))
}
const other = (side) => (side === 'home' ? 'away' : 'home')

// Source errors confirmed by a second source during the probe (research/wayback-internationals.md §2).
// Recorded as warnings; the corrections layer, not the harvester, fixes them.
export const SOURCE_NOTES = {
  'fifa1998:8656': [
    "source defect, not recoverable: FIFA's report for Gabon 0-4 Morocco (1997-04-06) has no Gabon block and only the four Morocco players " +
      'who scored or were booked. The Wayback Machine holds one capture of it ever (2012-09-09; CDX checked with no date limit, both URL forms). ' +
      'Header, scorers, cards and referee are kept; martj42 agrees on 0-4.',
  ],
  'euro2000:55097': [
    "captures disagree: the 2011-12 root pages (kept: full XIs) omit Gheorghe Popescu's 18' goal for Romania, which the " +
      '2019 lineups capture (https://web.archive.org/web/20191015084549/https://www.uefa.com/uefaeuro/season=2000/matches/round=1165/match=55097/postmatch/lineups/index.html) ' +
      'lists; that capture drops Dan Petrescu and one Liechtenstein starter. martj42 has 7-0. The corrections layer should add the goal.',
  ],
  'euro2004q:68978': ["known source defect: every history-page capture lists only 3 of France's 5 goals (Wiltord 20', Henry 60', Trezeguet 81')"],
  'euro2004q:69270': [
    "source defect: Azerbaijan shows four substitutions in the three-sub era: Agaev off 11' (Musayev on) and again 'Substitution 58'', Musayev off 58'. " +
      'One of the 58\' events is spurious; nobody is listed coming on at 58\'.',
  ],
  'euro2004q:69047': [
    'abandoned match: Georgia v Russia, Tbilisi, 2002-10-12, was abandoned (floodlight failure) and replayed on 2003-04-30 ' +
      '(Georgia 1-0 Russia, record euro2004q:70391). This page has the team sheets and a 25\' substitution but no result; ' +
      'it is not a played match for the ledger, and martj42 rightly has no row for it.',
  ],
  'fifa2002:19743': [
    "known source error: FIFA credits MURPHY Danny (#4) with England's second goal (48+') and a start; " +
      'BBC clockwatch (http://news.bbc.co.uk:80/sport/hi/english/football/world_cup_2002/newsid_1520000/1520626.stm @20010904192843) ' +
      "and 11v11 show Steven Gerrard started and scored at 45'. Left as FIFA has it; the corrections layer will fix it.",
  ],
}

// Matches that were not played out (abandoned, awarded). The record is kept with its receipts, but `void` takes it
// out of the gates and the ledger.
export const VOID = {
  'euro2004q:69047': 'abandoned (floodlight failure), replayed 2003-04-30 as euro2004q:70391',
  'fifa2010:300033480': 'awarded 3-0 to Singapore: Palestine did not travel for the second leg (2007-10-28); never played, so no lineups exist',
}

// Matches martj42 has no row for although they were played and FIFA reported them. Two groups: results FIFA later
// annulled when it expelled or suspended the association (martj42 keeps every other match of the group), and plain
// gaps. Recorded so the ledger knows the second source is missing for these.
const ANNULLED = (team, why) =>
  `martj42 has no row: it lists every other match of this group but none of ${team}'s, consistent with FIFA annulling ${team}'s results (${why}). ` +
  'Played and reported by FIFA, so the appearances are real; whether they count is a ledger decision.'
const GAP = 'martj42 has no row for this match (checked +-31 days, both orders, alias map applied): a candidate addition upstream.'
const GUINEA = ANNULLED('Guinea', 'Guinea was disqualified from 2002 qualifying for government interference')
const ETHIOPIA = ANNULLED('Ethiopia', 'FIFA suspended the Ethiopian federation in 2008 and removed Ethiopia from the 2010 qualifiers')
for (const id of ['20130', '20133', '20134']) (SOURCE_NOTES[`fifa2002:${id}`] ??= []).push(GUINEA)
for (const id of ['300036693', '300036695', '300036697', '300036699']) (SOURCE_NOTES[`fifa2010:${id}`] ??= []).push(ETHIOPIA)
;(SOURCE_NOTES['fifa1998:8392'] ??= []).push(GAP + ' martj42 has the other five matches of the Jeddah leg (1997-03-27 to 03-31) but not this one; its 1997-03-20 Malaysia 2-0 Taiwan is the Kuala Lumpur leg.')

/** Apply VOID and SOURCE_NOTES to a finished record (idempotent; called by the harvester on every record). */
export function annotateRecord(rec) {
  const key = `${rec.source}:${rec.source_id}`
  if (VOID[key]) rec.void = VOID[key]
  for (const w of SOURCE_NOTES[key] ?? []) if (!rec.warnings.includes(w)) rec.warnings.push(w)
  return rec
}

const receipt = (ts, original, finalUrl) => {
  const t = finalUrl?.match(/\/web\/(\d{14})id_\//)?.[1] ?? ts
  return { url: `https://web.archive.org/web/${t}/${original}`, timestamp: t, original }
}

// ---------- FIFA ----------
export function fifaRecord(rep, { source, sourceId, competition, ts, original, finalUrl, stage }) {
  const warnings = []
  // FIFA 1998: a starter marked "(+68')(-68')" was substituted at 68' and the replacement is not named (the bench
  // often lists "UNKNOWN"); the parse keeps the off-minute and this warning says why no sub has the on-minute
  for (const t of rep.teams ?? []) {
    const self = t.starters.filter((p) => p.on != null)
    const unknown = t.bench.filter((p) => /^UNKNOWN$/i.test(p.name)).length
    if (self.length)
      warnings.push(`source defect: ${t.name}: ${self.length} starter(s) marked substituted with the replacement unnamed (${self.map((p) => `${p.name} (+${p.on}')(-${p.off ?? '?'}')`).join(', ')})${unknown ? `; bench lists ${unknown} "UNKNOWN"` : ''}`)
  }
  for (const s of rep.strayTeams ?? [])
    warnings.push(`source defect: page carries a stray third lineup block "${s.name}" (${s.players.length} players: ${s.players.join(', ')}); ignored, the two header teams kept`)
  const score = parseScore(rep.result)
  const sideOf = (t, i) => (normName(t.name) === normName(rep.away) ? 'away' : normName(t.name) === normName(rep.home) ? 'home' : i === 0 ? 'home' : 'away')
  const lineups = (rep.teams ?? []).map((t, i) => ({
    team: t.name,
    side: sideOf(t, i),
    coach: t.coach || null,
    players: [
      ...t.starters.map((p) => player({ ...p, role: 'starter', on_min: 0, off_min: p.off, off_reason: p.off != null ? 'sub' : null })),
      ...t.bench.map((p) => player({ ...p, role: 'sub', on_min: p.on, off_min: p.off, off_reason: p.off != null ? 'sub' : null })),
    ],
  }))
  // team code -> side, learned from goals/cards whose player is found in a lineup
  const codeSide = {}
  const goals = []
  for (const g of rep.goals ?? []) {
    const m = String(g.raw ?? '').match(/^(.*?)\s*\((\w{3})\)\s*(\d+.*?)$/)
    if (!m) {
      warnings.push(`unparsed goal "${g.raw}"`)
      continue
    }
    const [, name, code, rest] = m
    const note = rest.replace(/^\d+\s*'?\s*(\+\s*\d*)?\s*'?/, '').trim()
    const type = /own|o\.\s*g|\bog\b/i.test(note) ? 'og' : /pen|\bp\b|\(p\)/i.test(note) ? 'pen' : 'goal'
    const mm = parseMin(rest)
    const hit = findPlayer(lineups, name)
    let side = hit?.lineup.side ?? null
    if (hit) codeSide[code] = type === 'og' ? hit.lineup.side : hit.lineup.side
    const credited = side ? (type === 'og' ? other(side) : side) : null
    goals.push({ side: credited, team: code, player: name, ...mm, type, raw: g.raw })
    if (hit) hit.p.goals.push({ ...mm, type })
    else warnings.push(`goal scorer "${name}" (${code}) not found in either lineup`)
  }
  for (const g of goals) if (!g.side && codeSide[g.team]) g.side = g.type === 'og' ? other(codeSide[g.team]) : codeSide[g.team]
  // cards
  const cardList = (s, type) =>
    [...String(s ?? '').matchAll(/([^,]+?)\s*\((\w{3})\)\s*(\d+\s*'?\s*(?:\+\s*\d*)?'?)/g)].map((m) => ({ name: m[1].trim(), code: m[2], ...parseMin(m[3]), type }))
  for (const c of [...cardList(rep.cautions, 'yellow'), ...cardList(rep.sentOff, 'red')]) {
    const hit = findPlayer(lineups, c.name, codeSide[c.code])
    if (!hit) {
      warnings.push(`${c.type} card for "${c.name}" (${c.code}) not matched to a player`)
      continue
    }
    hit.p.cards.push({ type: c.type, min: c.min, ...(c.added != null ? { added: c.added } : {}) })
    if (c.type === 'red' && hit.p.off_min == null && hit.p.on_min != null) Object.assign(hit.p, { off_min: c.min, off_reason: 'red' })
  }
  if (rep.sentOff && !cardList(rep.sentOff, 'red').length) warnings.push(`sent-off text not parsed: "${rep.sentOff}"`)
  const att = Number(String(rep.attendance ?? '').replace(/\D/g, ''))
  return {
    source,
    source_id: sourceId,
    status: 'parsed',
    competition,
    stage: stage ?? (rep.competition || null),
    date: isoDate(rep.date),
    home: rep.home ?? null,
    away: rep.away ?? null,
    score,
    venue: rep.venue || null,
    kickoff: rep.kickoff || null,
    attendance: att > 0 ? att : null,
    referee: rep.referee || null,
    lineups,
    goals,
    receipts: [receipt(ts, original, finalUrl)],
    warnings: [...warnings, ...(SOURCE_NOTES[`${source}:${sourceId}`] ?? [])],
  }
}

// ---------- UEFA history pages (Euro 2000; Euro 2004 fallback) ----------
const cardType = (t) => (/yellow.?red|second/i.test(t) ? 'yellow-red' : /red/i.test(t) ? 'red' : /yellow/i.test(t) ? 'yellow' : null)

export function uefaHistoryRecord(x, { source, sourceId, competition, ts, original, finalUrl }) {
  const warnings = []
  const h = x.header
  // "Preliminary round ( Group 7 ) - 09/10/1999 - 19:30CET (...) - Rheinpark - Vaduz"; finals add a segment
  // ("Final tournament - Group A - 20/06/2000 - ..."), so locate the date by pattern
  const segs = (h.venueLine || '').split(/\s+-\s+/)
  const di = segs.findIndex((x) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(x))
  const parts = di >= 1 ? [segs.slice(0, di).join(' - '), ...segs.slice(di)] : segs
  const score = parseScore(h.score)
  // header scorers carry the markers: "Zidane 117 ET ( P )", "Debono 37 ( o.g. )"
  const marks = []
  for (const [side, list] of [['home', h.homeScorers], ['away', h.awayScorers]])
    for (const s of list ?? []) {
      const m = s.match(/^(.*?)\s+(\d+)/)
      marks.push({ side, name: normName(m?.[1] ?? s), min: m ? Number(m[2]) : null, og: /o\.\s*g/i.test(s), pen: /\(\s*P\s*\)/.test(s), raw: s })
    }
  const lineups = []
  const goals = []
  for (const side of ['home', 'away']) {
    const team = side === 'home' ? h.home : h.away
    const players = []
    for (const [role, list] of [['starter', x[side].starters], ['sub', x[side].subs]]) {
      for (const q of list) {
        const p = player({ ...q, role, on_min: role === 'starter' ? 0 : null })
        const subs = q.events.filter((e) => e.type === 'Substitution').map((e) => parseMin(e.minute).min)
        if (role === 'starter' && subs.length) Object.assign(p, { off_min: subs[0], off_reason: 'sub' })
        if (role === 'sub' && subs.length) {
          p.on_min = subs[0]
          if (subs[1] != null) Object.assign(p, { off_min: subs[1], off_reason: 'sub' })
        }
        for (const e of q.events) {
          const mm = parseMin(e.minute)
          if (/goal/i.test(e.type)) {
            const surname = normName(p.name).split(' ')
            const mk = marks.find((k) => k.min === mm.min && surname.some((w) => w.length > 2 && k.name.includes(w)))
            const type = /own/i.test(e.type) || mk?.og ? 'og' : /pen/i.test(e.type) || mk?.pen ? 'pen' : 'goal'
            p.goals.push({ ...mm, type })
            goals.push({ side: type === 'og' ? other(side) : side, team, player: p.name, ...mm, type, raw: mk?.raw ?? `${p.name} ${e.minute}` })
          } else if (cardType(e.type)) {
            p.cards.push({ type: cardType(e.type), ...mm })
            if (cardType(e.type) !== 'yellow' && p.off_min == null) Object.assign(p, { off_min: mm.min, off_reason: 'red' })
          } else if (e.type !== 'Substitution') warnings.push(`unknown event "${e.type}" for ${p.name}`)
        }
        players.push(p)
      }
    }
    lineups.push({ team, side, coach: null, players })
  }
  const coaches = (x.officials.coach?.[0] ?? '').replace(/^class="people">\s*/, '').split(/(?<=\))\s+/)
  if (coaches.length === 2) [lineups[0].coach, lineups[1].coach] = coaches
  const ref = (x.officials.referee?.[0] ?? '').replace(/^class="people">\s*/, '').trim()
  return {
    source,
    source_id: sourceId,
    status: 'parsed',
    competition,
    stage: parts[0] || null,
    date: isoDate(parts[1]),
    home: h.home || null,
    away: h.away || null,
    score,
    venue: parts.length > 3 ? parts.slice(3).join(', ') : null,
    kickoff: parts[2] || null,
    attendance: null,
    referee: ref || null,
    lineups,
    goals,
    receipts: [receipt(ts, original, finalUrl)],
    warnings: [...warnings, ...(SOURCE_NOTES[`${source}:${sourceId}`] ?? [])],
  }
}

// ---------- UEFA live-era Match Specific pages (Euro 2004 qualifiers) ----------
export function uefaMsRecord(x, { source, sourceId, competition, ts, original, finalUrl }) {
  const warnings = []
  if (x.unknownIcons.length) warnings.push(`unknown event icons: ${[...new Set(x.unknownIcons)].join(', ')}`)
  const lineups = x.teams.map((t, i) => ({
    team: t.name,
    side: i === 0 ? 'home' : 'away',
    coach: t.coach || null,
    players: [...t.starters.map((p) => player({ ...p, role: 'starter', on_min: 0 })), ...t.bench.map((p) => player({ ...p, role: 'sub' }))],
  }))
  const lineupFor = (team) => lineups.find((l) => normName(l.team) === normName(team)) ?? null
  const find = (l, who) => (who.shirt != null && l.players.find((p) => p.shirt === who.shirt)) || l.players.find((p) => normName(p.name) === normName(who.name)) || null
  const goals = []
  const evs = [...x.events].sort((a, b) => (a.min ?? 0) - (b.min ?? 0) || (a.added ?? 0) - (b.added ?? 0))
  for (const e of evs) {
    const l = lineupFor(e.team)
    if (!l) {
      warnings.push(`event team "${e.team}" matches neither lineup`)
      continue
    }
    const mm = { min: e.min, ...(e.added != null ? { added: e.added } : {}) }
    if (e.type === 'sub') {
      const o = find(l, e.out)
      const n = find(l, e.in)
      if (o) Object.assign(o, { off_min: e.min, off_reason: 'sub' })
      else warnings.push(`sub-off "${e.out.name}" #${e.out.shirt} not in ${l.team} lineup`)
      if (n) n.on_min = e.min
      else warnings.push(`sub-on "${e.in.name}" #${e.in.shirt} not in ${l.team} lineup`)
      continue
    }
    const p = find(l, e)
    if (['goal', 'pen', 'og'].includes(e.type)) {
      goals.push({ side: e.type === 'og' ? other(l.side) : l.side, team: l.team, player: e.name, ...mm, type: e.type, raw: `${e.raw} ${e.name}` })
      if (p) p.goals.push({ ...mm, type: e.type })
      else warnings.push(`scorer "${e.name}" #${e.shirt} not in ${l.team} lineup`)
    } else if (['yellow', 'red', 'yellow-red'].includes(e.type)) {
      if (!p) {
        warnings.push(`${e.type} card "${e.name}" #${e.shirt} not in ${l.team} lineup`)
        continue
      }
      p.cards.push({ type: e.type, ...mm })
      if (e.type !== 'yellow' && p.off_min == null) Object.assign(p, { off_min: e.min, off_reason: 'red' })
    }
  }
  const score = x.noResult ? null : parseScore(x.score)
  if (x.noResult) warnings.push(`result box shows "${x.score}" (the kick-off time): no result posted on this page`)
  return {
    source,
    source_id: sourceId,
    status: 'parsed',
    competition,
    stage: x.stageLine || null,
    date: isoDate(x.dateText),
    home: x.home || lineups[0]?.team || null,
    away: x.away || lineups[1]?.team || null,
    score,
    venue: x.venueText || null,
    kickoff: /\d/.test(x.kickoff ?? '') ? x.kickoff : null,
    attendance: null,
    referee: x.officials.referee?.[0] ?? null,
    lineups,
    goals,
    receipts: [receipt(ts, original, finalUrl)],
    warnings: [...warnings, ...(SOURCE_NOTES[`${source}:${sourceId}`] ?? [])],
  }
}

/** Record for a match whose pages were found but none parsed (or none archived). */
export function missingRecord({ source, sourceId, competition, tried, index }) {
  return {
    source,
    source_id: sourceId,
    status: tried.length ? 'unparsed' : 'not-archived',
    competition,
    stage: null,
    date: null,
    home: index?.home ?? null,
    away: index?.away ?? null,
    score: index ? parseScore(index.score) : null,
    venue: null,
    attendance: null,
    referee: null,
    lineups: [],
    goals: [],
    receipts: tried.map((t) => ({ url: `https://web.archive.org/web/${t.timestamp}/${t.original}`, timestamp: t.timestamp, original: t.original, failed: t.why })),
    warnings: [tried.length ? `no capture parsed (${tried.map((t) => t.why).join('; ')})` : 'no capture found'],
  }
}
