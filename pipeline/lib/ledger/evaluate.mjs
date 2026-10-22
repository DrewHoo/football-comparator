// A minimal query evaluator over decoded compact rows (decode.mjs), enough to run the club-season
// gates (data/gates/club-seasons.json) and the reproducible factoid gates (data/gates/factoids.json)
// for the shapes sum / first-N / fastest-to (reach) / youngest-to. It is a gate harness, not the
// site's engine: the engine's `evaluate(query)` will be a port with the board, ties and gapping.
//
// A gate runs only when every match it depends on is cached: the competition-seasons in its field
// up to `as_of` (a board), or the subject's team-season (a club-season row). Anything else SKIPs
// with the coverage it saw.
import { nameKey } from './rules.mjs'

const label = (s) => `${s}-${String(s + 1).slice(2)}`
const startYear = (lab) => Number(String(lab).slice(0, 4))
const ymd = (d) => d.slice(0, 10)

/** decoded club files -> one view: rows (with ord), matches, coverage by comp-season */
export function clubView(decodedFiles) {
  const rows = [], matches = []
  for (const d of decodedFiles) { rows.push(...d.rows); matches.push(...d.matches) }
  const cov = new Map() // `${slug}|${season}` -> { n, ok }
  for (const m of matches) { const k = `${m.slug}|${m.season}`; const c = cov.get(k) || { n: 0, ok: 0 }; c.n++; if (m.summary === 'ok') c.ok++; cov.set(k, c) }
  const names = new Map()
  for (const r of rows) names.set(r.athleteId, r.name)
  return { rows, matches, cov, names }
}

const slugsFor = (comps, qualifiers) => {
  const out = new Set()
  for (const c of comps) { out.add(c); if (c === 'uefa.champions' && qualifiers) out.add('uefa.champions_qual') }
  return out
}
const inField = (r, comps, qualifiers) => comps.has(r.slug) && (qualifiers || !r.qualifier)

function athleteOf(view, { espn_id, name }) {
  if (espn_id) return String(espn_id)
  const want = nameKey(name)
  const hits = new Map()
  for (const r of view.rows) if (nameKey(r.name) === want) hits.set(r.athleteId, (hits.get(r.athleteId) || 0) + 1)
  return [...hits].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

function teamOf(view, slug, season, club) {
  const want = nameKey(club.replace(/^AS /, ''))
  const c = new Map()
  for (const m of view.matches) {
    if (m.season !== season || (m.slug !== slug && !(slug === 'uefa.champions' && m.slug === 'uefa.champions_qual'))) continue
    for (const [id, n] of [[m.homeId, m.homeName], [m.awayId, m.awayName]]) if (nameKey(n) === nameKey(club) || nameKey(n).includes(want)) c.set(id, (c.get(id) || 0) + 1)
  }
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

const sumRows = (rs) => ({
  apps: rs.length, starts: rs.filter((r) => r.started).length, goals: sum(rs, 'goals'), pens: sum(rs, 'pens'), assists: sum(rs, 'assists'), minutes: sum(rs, 'minutes'),
})
// a sum over a stat with a null anywhere is null (the stat isn't known for the whole window)
function sum(rs, k) { let n = 0; for (const r of rs) { if (r[k] == null) return null; n += r[k] } return n }

/** data/gates/club-seasons.json rows */
export function runClubSeasonGates(rowsJson, view) {
  const out = []
  for (const g of rowsJson) {
    const season = startYear(g.season)
    const slug = g.competition
    const athlete = athleteOf(view, { espn_id: g.espn_id, name: g.player })
    const teamId = teamOf(view, slug, season, g.club)
    const base = { gate: `${g.player} ${g.club} ${slug} ${g.season}`, fields: g.gate_fields }
    const tm = view.matches.filter((m) => m.season === season && (m.slug === slug || (slug === 'uefa.champions' && m.slug === 'uefa.champions_qual')) && (m.homeId === teamId || m.awayId === teamId))
    const ok = tm.filter((m) => m.summary === 'ok').length
    if (!teamId || !athlete) { out.push({ ...base, status: 'ERROR', why: `team ${teamId} athlete ${athlete}` }); continue }
    if (ok < tm.length) { out.push({ ...base, status: 'SKIP', why: `${ok}/${tm.length} of the club's matches cached` }); continue }
    const mine = view.rows.filter((r) => r.athleteId === athlete && r.teamId === teamId && r.season === season && (r.slug === slug || (slug === 'uefa.champions' && r.slug === 'uefa.champions_qual')))
    const proper = mine.filter((r) => !r.qualifier), qual = mine.filter((r) => r.qualifier)
    const got = { ...sumRows(proper), qualifiers: { apps: qual.length, goals: sum(qual, 'goals') } }
    const exp = g.expected_after_repair
    const diffs = []
    for (const f of g.gate_fields) {
      const [a, b] = f.split('.')
      const want = b ? exp[a]?.[b] : exp[a]
      const have = b ? got[a][b] : got[a]
      const tol = g.tolerance?.[f] ?? 0
      if (want == null || have == null || Math.abs(have - want) > tol) diffs.push(`${f} ${have} vs ${want}`)
    }
    out.push({ ...base, status: diffs.length ? 'FAIL' : 'PASS', got: Object.fromEntries(g.gate_fields.map((f) => [f, f.includes('.') ? got[f.split('.')[0]][f.split('.')[1]] : got[f]])), expected: Object.fromEntries(g.gate_fields.map((f) => [f, f.includes('.') ? exp[f.split('.')[0]]?.[f.split('.')[1]] : exp[f]])), known: g.known, diffs, why: diffs.length ? g.repair ?? g.note ?? null : null, matches: `${ok}/${tm.length} cached` })
  }
  return out
}

// ---- factoid gates

/** the comp-seasons a board needs: every season of each field competition from the ledger floor to as_of */
function boardScope(gate, view, comps) {
  const asOf = gate.as_of
  const need = [...view.cov.keys()].filter((k) => { const [slug, s] = k.split('|'); return comps.has(slug) && Number(s) >= 2002 && `${s}-07-01` <= asOf })
  if (gate.query.window?.season) return need.filter((k) => Number(k.split('|')[1]) === startYear(gate.query.window.season))
  return need
}

function ageAt(dob, date) {
  const [by, bm, bd] = dob.split('-').map(Number), [y, m, d] = ymd(date).split('-').map(Number)
  let years = y - by
  if (m < bm || (m === bm && d < bd)) years--
  const last = Date.UTC(by + years, bm - 1, bd)
  const days = Math.round((Date.UTC(y, m - 1, d) - last) / 864e5)
  return `${years}y ${days}d`
}

export function runFactoidGates(gates, view) {
  const out = []
  for (const gate of gates) {
    if (gate.status !== 'reproducible-in-full') continue
    const q = gate.query
    for (const [vi, variant] of [[null, null], ...(q.variants || []).map((v) => [v.label, v])]) {
      const field = { ...q.field, ...(variant?.field || {}) }
      const comps = slugsFor(field.competitions, !!field.qualifiers)
      const scope = boardScope(gate, view, comps)
      const missing = scope.filter((k) => view.cov.get(k).ok < view.cov.get(k).n)
      const asserts = gate.assertions.filter((a) => (a.variant ?? null) === vi && a.checkable === 'full')
      if (!asserts.length) continue
      const head = { gate: gate.id, variant: vi }
      if (missing.length) {
        const ok = scope.reduce((n, k) => n + view.cov.get(k).ok, 0), n = scope.reduce((n, k) => n + view.cov.get(k).n, 0)
        out.push({ ...head, status: 'SKIP', why: `needs ${scope.length} comp-seasons to ${gate.as_of}; ${missing.length} not fully cached (${ok}/${n} matches)`, assertions: asserts.length })
        continue
      }
      const rs = view.rows.filter((r) => inField(r, comps, !!field.qualifiers) && ymd(r.date) <= gate.as_of)
      const byA = new Map()
      for (const r of rs) { const l = byA.get(r.athleteId) || []; l.push(r); byA.set(r.athleteId, l) }
      for (const l of byA.values()) l.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      const stat = q.stat.stat
      const board = (fn) => [...byA].map(([id, l]) => ({ id, name: view.names.get(id), v: fn(l) })).filter((x) => x.v != null)
      for (const a of asserts) {
        const ent = gate.entities?.find((e) => e.name === a.subject)
        const id = a.subject ? athleteOf(view, { espn_id: ent?.espn_id, name: a.subject }) : null
        const mine = id ? byA.get(id) || [] : []
        let got = null, rank = null, extra = {}
        const how = q.how.agg
        // the value a sum board ranks: a season's total, the first n appearances, or the whole window
        const fn = how !== 'sum' ? null : q.window.n ? (l) => (l.length >= q.window.n ? sum(l.slice(0, q.window.n), stat) : null) : (l) => sum(l, stat)
        if (a.kind === 'visible-top' && fn) {
          const top = board(fn).sort((x, y) => y.v - x.v).slice(0, a.expected.length)
          got = top.map((x) => ({ subject: x.name, value: x.v }))
          const bad = a.expected.filter((w, i) => !top[i] || top[i].v !== w.value || nameKey(top[i].name) !== nameKey(w.subject))
          out.push({ ...head, status: bad.length ? 'FAIL' : 'PASS', kind: a.kind, got, expected: a.expected, diffs: bad.map((w) => `${w.subject} ${w.value} not at its place`) })
          continue
        }
        if (fn) {
          got = fn(mine)
          if (q.window.seq === 'season') extra = { apps: mine.length, starts: mine.filter((r) => r.started).length }
          const b = board(fn).map((x) => x.v)
          rank = got == null ? null : 1 + b.filter((v) => v > got).length
        } else if (how === 'reach' || how === 'youngest-reach') {
          let c = 0, at = null
          for (let i = 0; i < mine.length; i++) { c += mine[i][stat] ?? 0; if (c >= q.how.target) { at = i; break } }
          got = at == null ? null : a.kind === 'age' ? (ent?.dob ? ageAt(ent.dob, mine[at].date) : 'no DOB') : at + 1
          extra = { date: at == null ? null : ymd(mine[at].date) }
        }
        const diffs = []
        {
          if (got !== a.expected) diffs.push(`${got} vs ${a.expected}`)
          if (a.rank != null && rank != null && rank !== a.rank) diffs.push(`rank ${rank} vs ${a.rank}`)
          if (a.apps != null && extra.apps !== a.apps) diffs.push(`apps ${extra.apps} vs ${a.apps}`)
          if (a.starts != null && extra.starts !== a.starts) diffs.push(`starts ${extra.starts} vs ${a.starts}`)
          if (a.date && extra.date && extra.date !== a.date) diffs.push(`date ${extra.date} vs ${a.date}`)
        }
        out.push({ ...head, status: diffs.length ? 'FAIL' : 'PASS', subject: a.subject, kind: a.kind, got, rank, ...extra, expected: a.expected, diffs })
      }
    }
  }
  return out
}
