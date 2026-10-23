// Corrections to the club ledger's person layer (data/corrections/athletes.json), applied by the entity build
// before the DOB plausibility rule (encode.mjs personFields). Sources are never edited: the corrected fields
// replace ESPN's on a copy of the athletes.jsonl row, which keeps `corrected: {id, from}`.
//   kind `dob`: right_value {dob, nationality?, position?}; a key given as null removes ESPN's value.
// Applied only when every receipt verifies:
//   Wikidata  {cache: data/index/wikidata/players.json, item, field, value[, citizenship]}: the item's field equals value
//   RSSSF     {slug, cap_no, date, quote}: data/index/rsssf-caps.jsonl has that cap row with that line_quote
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

export async function loadAthleteCorrections(root) {
  const file = path.join(root, 'data/corrections/athletes.json')
  if (!fs.existsSync(file)) return { corrections: [], report: [] }
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  const cs = doc.corrections ?? []
  // what the receipts need, read once
  const wantWd = new Set(), wantRsssf = new Set()
  for (const c of cs) for (const r of c.receipts ?? []) { if (r.item) wantWd.add(r.item); if (r.slug) wantRsssf.add(r.slug) }
  const wd = new Map()
  if (wantWd.size) for (const p of JSON.parse(fs.readFileSync(path.join(root, 'data/index/wikidata/players.json'), 'utf8'))) if (wantWd.has(p.qid)) wd.set(p.qid, p)
  const caps = new Map()
  if (wantRsssf.size) {
    const rl = readline.createInterface({ input: fs.createReadStream(path.join(root, 'data/index/rsssf-caps.jsonl')), crlfDelay: Infinity })
    for await (const line of rl) {
      const m = /^\{"slug":"([^"]+)"/.exec(line)
      if (!m || !wantRsssf.has(m[1])) continue
      const r = JSON.parse(line)
      caps.set(`${r.slug}|${r.cap_no}`, r)
    }
  }
  const verify = (r) => {
    if (r.item) {
      const p = wd.get(r.item)
      if (!p) return { verified: false, how: `${r.item} not in ${r.cache}` }
      const ok = String(p[r.field] ?? '') === String(r.value) && (!r.citizenship || (p.citizenship ?? []).some((c) => c.label === r.citizenship))
      return { verified: ok, how: ok ? `${r.item} ${r.field} = ${r.value}${r.citizenship ? `, citizenship ${r.citizenship}` : ''} in ${r.cache}` : `${r.item} ${r.field} is ${p[r.field]} in ${r.cache}` }
    }
    if (r.slug) {
      const c = caps.get(`${r.slug}|${r.cap_no}`)
      const ok = !!c && c.line_quote === r.quote && (!r.date || c.date === r.date)
      return { verified: ok, how: ok ? `RSSSF ${r.slug} cap ${r.cap_no} (${c.date}) line_quote matches` : `no RSSSF cap row ${r.slug} #${r.cap_no} with this line_quote` }
    }
    return { verified: false, how: 'no checkable receipt' }
  }
  const report = []
  const applied = []
  for (const c of cs) {
    const receipts = (c.receipts ?? []).map((r) => ({ source: r.source, url: r.url, ...verify(r) }))
    const ok = c.kind === 'dob' && receipts.length > 0 && receipts.every((r) => r.verified)
    report.push({ id: c.id, kind: c.kind, target: c.target?.espn_id, applied: ok, receipts, why: c.kind !== 'dob' ? `unknown kind ${c.kind}` : ok ? null : 'a receipt did not verify: not applied' })
    if (ok) applied.push(c)
  }
  return { corrections: applied, report }
}

/** athletes.jsonl rows -> rows with the corrections applied (copies; untouched rows pass through) */
export function applyAthleteCorrections(rows, corrections) {
  const byId = new Map(corrections.map((c) => [String(c.target.espn_id), c]))
  return rows.map((r) => {
    const c = byId.get(String(r.id)) ?? (r.aliases ?? []).map((a) => byId.get(String(a))).find(Boolean)
    if (!c) return r
    const v = c.right_value ?? {}
    const out = { ...r, corrected: { id: c.id, from: { dob: r.dob, nationality: r.nationality, position: r.position } } }
    if ('dob' in v) out.dob = v.dob
    if ('nationality' in v) out.nationality = v.nationality
    if ('position' in v) out.position = v.position
    return out
  })
}
