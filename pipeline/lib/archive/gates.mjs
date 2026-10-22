// Per-record gates for the archive harvest, the martj42 join, and the known-answer checks.
//   loadMartj42(file) -> index;  gateRecord(rec, idx) -> {starters_ok, subs_ok, goals_ok, join_ok, all_ok, ...}
import fs from 'node:fs'
import { normName } from './records.mjs'

// Archive spelling -> martj42 spelling (martj42 files matches under current names).
const ALIASES = {
  'MACEDONIA FYR': 'North Macedonia', 'FYR MACEDONIA': 'North Macedonia', 'F Y R MACEDONIA': 'North Macedonia', MACEDONIA: 'North Macedonia',
  'IRELAND REPUBLIC': 'Republic of Ireland', 'REP OF IRELAND': 'Republic of Ireland', 'REPUBLIC OF IRELAND': 'Republic of Ireland', IRELAND: 'Republic of Ireland',
  'KOREA REPUBLIC': 'South Korea', 'KOREA DPR': 'North Korea', USA: 'United States', 'COTE D IVOIRE': 'Ivory Coast', "COTE D'IVOIRE": 'Ivory Coast',
  'CHINA PR': 'China', 'IR IRAN': 'Iran', YUGOSLAVIA: 'Serbia', 'SERBIA AND MONTENEGRO': 'Serbia', 'SERBIA-MONTENEGRO': 'Serbia', 'SERBIA MONTENEGRO': 'Serbia',
  'FR YUGOSLAVIA': 'Serbia', 'CONGO DR': 'DR Congo', ZAIRE: 'DR Congo', SWAZILAND: 'Eswatini', BURMA: 'Myanmar', 'NETHERLANDS ANTILLES': 'Curaçao',
  'WESTERN SAMOA': 'Samoa', 'CHINESE TAIPEI': 'Taiwan', 'BOSNIA-HERZEGOVINA': 'Bosnia and Herzegovina', 'BOSNIA HERZEGOVINA': 'Bosnia and Herzegovina',
  'BOSNIA AND HERZEGOVINA': 'Bosnia and Herzegovina', 'BRUNEI DARUSSALAM': 'Brunei', 'KYRGYZ REPUBLIC': 'Kyrgyzstan', 'ST KITTS AND NEVIS': 'Saint Kitts and Nevis',
  'ST LUCIA': 'Saint Lucia', 'ST VINCENT AND THE GRENADINES': 'Saint Vincent and the Grenadines', 'ST VINCENT GRENADINES': 'Saint Vincent and the Grenadines',
  'CAPE VERDE ISLANDS': 'Cape Verde', 'EAST TIMOR': 'Timor-Leste', 'TRINIDAD TOBAGO': 'Trinidad and Tobago', HOLLAND: 'Netherlands', 'CZECH REP': 'Czech Republic',
  TURKIYE: 'Turkey', 'VIET NAM': 'Vietnam', LAO: 'Laos', 'LAO PDR': 'Laos', 'US VIRGIN ISLANDS': 'United States Virgin Islands', 'ANTIGUA BARBUDA': 'Antigua and Barbuda',
  'SAO TOME E PRINCIPE': 'São Tomé and Príncipe', 'SAO TOME AND PRINCIPE': 'São Tomé and Príncipe', 'CENTRAL AFRICAN REP': 'Central African Republic',
  'DOMINICAN REP': 'Dominican Republic', 'SYRIAN ARAB REPUBLIC': 'Syria', 'HONG KONG CHINA': 'Hong Kong', 'MACAO': 'Macau', 'GAMBIA THE': 'Gambia',
  'PALESTINIAN AUTHORITY': 'Palestine', 'TAHITI': 'Tahiti', 'NEW CALEDONIA': 'New Caledonia', 'GUINEA BISSAU': 'Guinea-Bissau', 'TIMOR LESTE': 'Timor-Leste',
  'SAMOA AMERICAN': 'American Samoa', 'COOK ISLAND': 'Cook Islands', FYROM: 'North Macedonia', 'DEM REP OF CONGO': 'DR Congo', 'DEM REP CONGO': 'DR Congo', 'CONGO DEM REP': 'DR Congo', KIRGHIZISTAN: 'Kyrgyzstan', KYRGYZSTAN: 'Kyrgyzstan', 'REPUBLIC OF GUINEA': 'Guinea', 'GUINEA REPUBLIC': 'Guinea', 'CAPE VERDE': 'Cape Verde', 'CAMEROUN': 'Cameroon', 'KAZAKSTAN': 'Kazakhstan',
  // residue pass, 2026-10-22: FIFA forms the full harvest turned up
  TADJIKISTAN: 'Tajikistan', 'YEMEN REPUBLIC': 'Yemen', 'GUAM ISLAND': 'Guam', 'KOREA D P R': 'North Korea', 'DPR KOREA': 'North Korea',
}
export const canonTeam = (s) => {
  const n = normName(s).replace(/\./g, ' ').replace(/&/g, 'AND').replace(/\s+/g, ' ').trim()
  return normName(ALIASES[n] ?? ALIASES[n.replace(/'/g, ' ').replace(/\s+/g, ' ')] ?? s)
}

function parseCsv(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue
    const cells = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) {
        if (c === '"' && line[i + 1] === '"') (cur += '"'), i++
        else if (c === '"') q = false
        else cur += c
      } else if (c === '"') q = true
      else if (c === ',') cells.push(cur), (cur = '')
      else cur += c
    }
    cells.push(cur)
    rows.push(cells)
  }
  const [head, ...rest] = rows
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

export function loadMartj42(file) {
  const byDate = new Map()
  for (const r of parseCsv(fs.readFileSync(file, 'utf8'))) {
    r.H = canonTeam(r.home_team)
    r.A = canonTeam(r.away_team)
    ;(byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)).push(r)
  }
  return { byDate, file }
}

const shiftDate = (iso, d) => new Date(Date.parse(iso + 'T12:00:00Z') + d * 86400e3).toISOString().slice(0, 10)

export function joinMartj42(rec, idx) {
  if (!rec.home || !rec.away) return { ok: false, detail: 'no teams in record' }
  const H = canonTeam(rec.home)
  const A = canonTeam(rec.away)
  if (!rec.date) {
    // a few source pages leave the date blank: accept a unique same-teams, same-score row in the cycle window
    const yr = Number(String(rec.competition ?? '').match(/(19|20)\d\d/)?.[0])
    if (!yr || !rec.score) return { ok: false, detail: 'no date in record' }
    const hits = []
    for (const [d, rows] of idx.byDate) {
      const y = Number(d.slice(0, 4))
      if (y < yr - 3 || y > yr) continue
      for (const r of rows) if (r.H === H && r.A === A && Number(r.home_score) === rec.score.home && Number(r.away_score) === rec.score.away) hits.push(r)
    }
    if (hits.length !== 1) return { ok: false, detail: `no date in record; ${hits.length} same-teams same-score martj42 rows in ${yr - 3}-${yr}` }
    const r = hits[0]
    return { ok: true, row: { date: r.date, home: r.home_team, away: r.away_team, score: `${r.home_score}-${r.away_score}`, tournament: r.tournament }, detail: `match on teams+score only (source has no date; martj42 date ${r.date}) ${r.tournament}` }
  }
  for (const off of [0, -1, 1, -2, 2]) {
    for (const r of idx.byDate.get(shiftDate(rec.date, off)) ?? []) {
      const swapped = r.H === A && r.A === H
      if (!(r.H === H && r.A === A) && !swapped) continue
      const mh = Number(swapped ? r.away_score : r.home_score)
      const ma = Number(swapped ? r.home_score : r.away_score)
      const notes = [off ? `date ${off > 0 ? '+' : ''}${off}d` : null, swapped ? 'home/away swapped' : null].filter(Boolean)
      const row = { date: r.date, home: r.home_team, away: r.away_team, score: `${r.home_score}-${r.away_score}`, tournament: r.tournament }
      const ok = rec.score && rec.score.home === mh && rec.score.away === ma
      return { ok: !!ok, row, detail: `${ok ? 'match' : `score differs (martj42 ${mh}-${ma})`}${notes.length ? ' [' + notes.join(', ') + ']' : ''} ${r.tournament}` }
    }
  }
  // Dates off by more than 2 days (AGENTS.md: FIFA and martj42 disagree by up to 13 days): join on the teams and the
  // score inside the campaign window (+-31 days) when exactly one row fits; the join holds but is flagged.
  const near = []
  for (let off = -31; off <= 31; off++) {
    if (Math.abs(off) <= 2) continue
    for (const r of idx.byDate.get(shiftDate(rec.date, off)) ?? []) {
      const swapped = r.H === A && r.A === H
      if ((r.H === H && r.A === A) || swapped) near.push({ r, off, swapped })
    }
  }
  near.sort((a, b) => Math.abs(a.off) - Math.abs(b.off))
  const fits = near.filter(({ r, swapped }) => rec.score && rec.score.home === Number(swapped ? r.away_score : r.home_score) && rec.score.away === Number(swapped ? r.home_score : r.away_score))
  const rowOf = (r) => ({ date: r.date, home: r.home_team, away: r.away_team, score: `${r.home_score}-${r.away_score}`, tournament: r.tournament })
  const sgn = (o) => `${o > 0 ? '+' : ''}${o}d`
  if (fits.length === 1) {
    const { r, off, swapped } = fits[0]
    return { ok: true, dateConflict: true, row: rowOf(r), detail: `match on teams+score; DATE CONFLICT: source ${rec.date}, martj42 ${r.date} (${sgn(off)})${swapped ? ' [home/away swapped]' : ''} ${r.tournament}` }
  }
  if (near.length) {
    const { r, off } = near[0]
    return { ok: false, row: rowOf(r), detail: `date disagrees: martj42 has ${r.home_team} ${r.home_score}-${r.away_score} ${r.away_team} on ${r.date} (${sgn(off)})${fits.length > 1 ? `; ${fits.length} same-score rows, ambiguous` : ''}` }
  }
  return { ok: false, detail: `no martj42 row within 7 days for "${rec.home}" v "${rec.away}" (canon ${H} / ${A})`, unmatched: [rec.home, rec.away] }
}

/** The three lineup gates alone (no martj42): {starters_ok, subs_ok, goals_ok, detail}. Also ranks captures. */
export function lineupChecks(rec) {
  const g = {}
  const L = rec.lineups ?? []
  const detail = []
  const starters = L.map((l) => l.players.filter((p) => p.role === 'starter').length)
  g.starters_ok = L.length === 2 && starters.every((n) => n === 11)
  if (!g.starters_ok) detail.push(`starters ${starters.join('/') || 'none'}`)
  const subCounts = L.map((l) => [l.players.filter((p) => p.off_reason === 'sub').length, l.players.filter((p) => p.role === 'sub' && p.on_min != null).length])
  g.subs_ok = L.length === 2 && subCounts.every(([off, on]) => off === on)
  if (L.length === 2 && !g.subs_ok) detail.push(`subs off/on ${subCounts.map((x) => x.join('/')).join(' ')}`)
  if (rec.score) {
    const h = rec.goals.filter((x) => x.side === 'home').length
    const a = rec.goals.filter((x) => x.side === 'away').length
    const unknown = rec.goals.filter((x) => !x.side).length
    g.goals_ok = h === rec.score.home && a === rec.score.away && unknown === 0
    if (!g.goals_ok) detail.push(`goals listed ${h}-${a}${unknown ? ` +${unknown} unattributed` : ''} vs score ${rec.score.home}-${rec.score.away}`)
  } else g.goals_ok = false
  g.detail = detail.join('; ')
  return g
}

/**
 * "source defect:" warnings for a parsed record that fails a lineup gate, one per failing side or score, so the
 * ledger can see why without re-running the gates. Derived from the record only; the harvester appends them.
 */
export function defectWarnings(rec) {
  if (rec.status !== 'parsed' || rec.void) return []
  const out = []
  const src = /^fifa/.test(rec.source) ? 'FIFA' : 'UEFA'
  for (const l of rec.lineups ?? []) {
    const st = l.players.filter((p) => p.role === 'starter')
    if (st.length > 11) {
      const key = (p) => normName(p.name).split(' ').sort((a, b) => b.length - a.length)[0]
      const pairs = []
      for (let i = 0; i < st.length; i++)
        for (let j = i + 1; j < st.length; j++)
          if ((st[i].shirt != null && st[i].shirt === st[j].shirt) || key(st[i]) === key(st[j])) pairs.push(`#${st[i].shirt} ${st[i].name} / #${st[j].shirt} ${st[j].name}`)
      out.push(pairs.length
        ? `source defect: ${src} lists ${st.length} starters for ${l.team}; likely the same player twice under two name forms or shirt numbers (${pairs.join('; ')})`
        : `source defect: ${src} lists ${st.length} starters for ${l.team} with no repeated name or shirt (a substitute filed in the line-up?)`)
    } else if (st.length < 11) out.push(`source defect: ${src} lists only ${st.length} starters for ${l.team}`)
    const off = l.players.filter((p) => p.off_reason === 'sub')
    const on = l.players.filter((p) => p.role === 'sub' && p.on_min != null)
    if (off.length > on.length)
      out.push(`source defect: ${l.team}: ${off.length} players marked substituted off (${off.map((p) => `${p.name} ${p.off_min}'`).join(', ')}) but only ${on.length} substitute(s) with an on-minute${on.length ? ` (${on.map((p) => `${p.name} ${p.on_min}'`).join(', ')})` : ''}: the source omits who came on, or when`)
    else if (on.length > off.length)
      out.push(`source defect: ${l.team}: ${on.length} substitutes came on (${on.map((p) => `${p.name} ${p.on_min}'`).join(', ')}) but only ${off.length} player(s) marked off: the source omits who went off`)
  }
  if (rec.score) {
    const h = rec.goals.filter((x) => x.side === 'home').length
    const a = rec.goals.filter((x) => x.side === 'away').length
    const u = rec.goals.filter((x) => !x.side).length
    if (h !== rec.score.home || a !== rec.score.away || u)
      out.push(`source defect: goals listed ${h}-${a}${u ? ` (+${u} unattributed)` : ''} against the score ${rec.score.home}-${rec.score.away}${h + a + u < rec.score.home + rec.score.away ? `: ${rec.score.home + rec.score.away - h - a - u} goal(s) missing from the page` : ''}`)
  }
  return out
}

export function gateRecord(rec, idx) {
  const g = { source: rec.source, source_id: rec.source_id, date: rec.date, home: rec.home, away: rec.away, score: rec.score ? `${rec.score.home}-${rec.score.away}` : '', status: rec.status }
  const lc = lineupChecks(rec)
  const detail = lc.detail ? [lc.detail] : []
  Object.assign(g, { starters_ok: lc.starters_ok, subs_ok: lc.subs_ok, goals_ok: lc.goals_ok })
  if (rec.void) {
    // abandoned or awarded: not a played match, so no gate applies (counted apart in the summary)
    Object.assign(g, { starters_ok: false, subs_ok: false, goals_ok: false, join_ok: false, all_ok: false, void: rec.void, detail: `void: ${rec.void}`, join_detail: 'void match, not joined', warnings: (rec.warnings ?? []).length })
    return g
  }
  const j = joinMartj42(rec, idx)
  g.join_ok = j.ok
  g.date_conflict = !!j.dateConflict
  g.join_detail = j.detail
  g.martj42 = j.row ?? null
  g.unmatched = j.unmatched
  g.all_ok = g.starters_ok && g.subs_ok && g.goals_ok && g.join_ok
  g.detail = detail.join('; ')
  g.warnings = (rec.warnings ?? []).length
  return g
}

const CSV_COLS = ['source', 'source_id', 'date', 'home', 'away', 'score', 'status', 'void', 'starters_ok', 'subs_ok', 'goals_ok', 'join_ok', 'date_conflict', 'all_ok', 'detail', 'join_detail', 'warnings', 'receipt']
const esc = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function gatesCsv(rows) {
  return [CSV_COLS.join(','), ...rows.map((r) => CSV_COLS.map((c) => esc(r[c])).join(','))].join('\n') + '\n'
}

export function summarize(gates) {
  // pass rates are over parsed, non-void records (a void match is abandoned or awarded, never played out)
  const parsed = gates.filter((g) => g.status === 'parsed' && !g.void)
  const n = (k, set = parsed) => set.filter((g) => g[k]).length
  return {
    records: gates.length,
    parsed: parsed.length,
    void: gates.filter((g) => g.void).length,
    date_conflicts: n('date_conflict'),
    unparsed: gates.filter((g) => g.status === 'unparsed').length,
    not_archived: gates.filter((g) => g.status === 'not-archived').length,
    starters_ok: n('starters_ok'),
    subs_ok: n('subs_ok'),
    goals_ok: n('goals_ok'),
    join_ok: n('join_ok'),
    join_ok_all_records: n('join_ok', gates),
    all_ok: n('all_ok'),
    unmatched_teams: [...new Set(gates.flatMap((g) => g.unmatched ?? []))].sort(),
  }
}

// ---------- known answers ----------
const findP = (rec, team, re) => rec?.lineups.find((l) => normName(l.team) === normName(team))?.players.find((p) => re.test(normName(p.name))) ?? null
const mins = (p) => (p?.goals ?? []).map((g) => g.min).join(',')

export const KNOWN_ANSWERS = [
  {
    name: 'Portugal 7-1 Russia, WC 2006 qualifier, 2004-10-13 (Ronaldo 2 goals: 39, 69)',
    source: 'fifa2006',
    id: '36543',
    checks: (r) => [
      ['date', r.date, '2004-10-13'],
      ['score', `${r.score?.home}-${r.score?.away}`, '7-1'],
      ['Ronaldo starts', findP(r, 'Portugal', /CRISTIANO RONALDO/)?.role, 'starter'],
      ['Ronaldo goal minutes', mins(findP(r, 'Portugal', /CRISTIANO RONALDO/)), '39,69'],
      ['Ronaldo off', findP(r, 'Portugal', /CRISTIANO RONALDO/)?.off_min, 85],
      ['Petit goal minutes', mins(findP(r, 'Portugal', /PETIT/)), '89,92'],
      ['Arshavin goal', mins(findP(r, 'Russia', /ARSHAVIN/)), '79'],
      ['attendance', r.attendance, 27258],
    ],
  },
  {
    name: 'Argentina 3-1 Brazil, WC 2006 qualifier, 2005-06-08',
    source: 'fifa2006',
    id: '33887',
    checks: (r) => [
      ['date', r.date, '2005-06-08'],
      ['score', `${r.score?.home}-${r.score?.away}`, '3-1'],
      ['Crespo goal minutes', mins(findP(r, 'Argentina', /CRESPO/)), '3,40'],
      ['Riquelme goal', mins(findP(r, 'Argentina', /RIQUELME/)), '18'],
      ['Roberto Carlos goal', mins(findP(r, 'Brazil', /ROBERTO CARLOS/)), '71'],
      ['Tevez on', findP(r, 'Argentina', /TEVEZ/)?.on_min, 82],
      ['Zanetti on', findP(r, 'Argentina', /ZANETTI/)?.on_min, 71],
      ['Renato on', findP(r, 'Brazil', /RENATO/)?.on_min, 61],
    ],
  },
  {
    name: "Germany 1-5 England, WC 2002 qualifier, 2001-09-01 (FIFA credits Murphy with Gerrard's goal; kept + warned)",
    source: 'fifa2002',
    id: '19743',
    checks: (r) => [
      ['date', r.date, '2001-09-01'],
      ['score', `${r.score?.home}-${r.score?.away}`, '1-5'],
      ['Owen goal minutes', mins(findP(r, 'England', /OWEN/)), '12,48,65'],
      ['Heskey goal', mins(findP(r, 'England', /HESKEY/)), '73'],
      ['Jancker goal', mins(findP(r, 'Germany', /JANCKER/)), '6'],
      ['source as-is: Murphy credited (not silently corrected)', mins(findP(r, 'England', /MURPHY/)), '48'],
      ['Gerrard discrepancy recorded in warnings', (r.warnings ?? []).some((w) => /Gerrard/.test(w) && /corrections layer/.test(w)), true],
      ['Hargreaves on', findP(r, 'England', /HARGREAVES/)?.on_min, 78],
    ],
  },
  {
    name: 'France 2-1 Portugal (golden goal), Euro 2000 semi-final, 2000-06-28',
    source: 'euro2000',
    id: '65183',
    checks: (r) => [
      ['date', r.date, '2000-06-28'],
      ['score', `${r.score?.home}-${r.score?.away}`, '2-1'],
      ['Zidane goal 117 pen', (findP(r, 'France', /ZIDANE/)?.goals ?? []).map((g) => `${g.min}${g.type}`).join(','), '117pen'],
      ['Henry goal', mins(findP(r, 'France', /HENRY/)), '51'],
      ['Nuno Gomes goal', mins(findP(r, 'Portugal', /NUNO GOMES/)), '19'],
      ['Wiltord on', findP(r, 'France', /WILTORD/)?.on_min, 72],
      ['Pires on', findP(r, 'France', /PIRES/)?.on_min, 87],
      ['Trezeguet on', findP(r, 'France', /TREZEGUET/)?.on_min, 105],
      ['Anelka off', findP(r, 'France', /ANELKA/)?.off_min, 72],
      ['referee', /Benk/.test(r.referee ?? ''), true],
    ],
  },
]

export function runKnownAnswers(recordsBySource, idx) {
  return KNOWN_ANSWERS.map((k) => {
    const r = (recordsBySource[k.source] ?? []).find((x) => x.source_id === k.id)
    if (!r) return { name: k.name, source: k.source, id: k.id, ok: null, detail: 'not harvested yet' }
    const res = k.checks(r).map(([label, got, want]) => ({ label, got, want, ok: got === want }))
    const j = joinMartj42(r, idx)
    res.push({ label: 'martj42 join', got: j.detail, want: 'match', ok: j.ok })
    return { name: k.name, source: k.source, id: k.id, ok: res.every((x) => x.ok), receipt: r.receipts[0]?.url, checks: res }
  })
}
