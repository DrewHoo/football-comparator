// The corrections layer, applied last over the merged rows (data/corrections/intl.json).
// Kinds:
//   reassign_lineup_entry  a source lineup entry belongs to another player (FIFA's Murphy = Gerrard):
//                          the entry's start/minutes move to the target player's row, `set` overrides
//                          fields, and the row the entry created for the wrong player is removed (or
//                          loses that source, if another source also gives him the cap).
// Every receipt with a `cache` path is string-checked against the cached page (tags stripped,
// entities and whitespace collapsed); an RSSSF receipt is checked against the cap row's line_quote.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson } from './io.mjs'

const pageText = (file) =>
  fs.readFileSync(path.join(ROOT, file), 'latin1')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ')

// A Wikidata receipt names a cached SPARQL result (data/raw/wikidata/sparql/..json, the query is stored with it)
// and one binding in it: the statement id, and optionally the qualifier and value (P1390 "33") or the main value.
function verifyWikidata(r) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, r.cache), 'utf8'))
    const want = r.binding ?? {}
    const hit = (j.result?.results?.bindings ?? []).find((b) => b.st?.value?.endsWith('/' + r.statement) && Object.entries(want).every(([k, v]) => String(b[k]?.value ?? '').replace(/^http:\/\/www\.wikidata\.org\/entity\//, '') === String(v)))
    return { verified: !!hit, how: hit ? `statement ${r.statement} with ${JSON.stringify(want)} found in the cached SPARQL result` : 'statement/binding NOT found in the cached SPARQL result' }
  } catch (e) { return { verified: false, how: `cache unreadable: ${e.message}` } }
}

export function verifyReceipt(r, rows) {
  if (r.cache && r.statement) return verifyWikidata(r)
  if (r.cache) {
    try {
      const ok = pageText(r.cache).includes(r.quote.replace(/\s+/g, ' '))
      return { verified: ok, how: ok ? 'quote found in cached page' : 'quote NOT found in cached page' }
    } catch (e) { return { verified: false, how: `cache unreadable: ${e.message}` } }
  }
  if (/rsssf\.org/.test(r.url ?? '') && r.quote) {
    const ok = rows.some((x) => x.receipts.some((q) => q.source === 'rsssf' && q.url === r.url && q.quote === r.quote))
    return { verified: ok, how: ok ? 'equals the RSSSF cap row line_quote' : 'no RSSSF cap row has this line_quote' }
  }
  return { verified: false, how: r.quote == null ? 'no quote on disk' : 'no cached copy to check against' }
}

// goal_minute: one source has a goal at the wrong minute. {player_key, wrong_source, wrong_value, right_value}:
// the row's goal_minutes gets right_value in place of the wrong one (or keeps it, if a rule already chose it),
// and the player's goal_minutes conflict in that match is resolved. Only applied when a receipt verifies.
function applyGoalMinute(c, rows, conflicts, rep) {
  const mid = c.match.match_id
  const row = rows.find((r) => r.match_id === mid && r.player_key === c.player_key)
  if (!row) { rep.changes.push(`no row for ${c.player_key} in ${mid}`); return }
  if (!rep.receipts.some((r) => r.verified)) { rep.changes.push('no receipt verified: not applied'); return }
  const gm = [...(row.goal_minutes ?? [])]
  const i = gm.indexOf(String(c.wrong_value)), k = gm.indexOf(String(c.right_value))
  if (i >= 0) gm[i] = String(c.right_value)
  else if (k < 0) gm.push(String(c.right_value))
  row.goal_minutes = gm
  row.field_source.goal_minutes = `correction ${c.id}`
  row.flags.push(`corrected:${c.id}`)
  row.receipts.push(...c.receipts.map((r) => ({ source: `correction ${c.id}: ${r.source}`, url: r.url, quote: r.quote ?? undefined, statement: r.statement ?? undefined })))
  rep.changes.push(`${c.player_key} ${mid}: goal at ${c.right_value}' (${c.wrong_source} has ${c.wrong_value}')${i < 0 && k >= 0 ? ' (already chosen by rule)' : ''}`)
  for (const k2 of conflicts) if (k2.match_id === mid && k2.player_key === c.player_key && k2.kind === 'goal_minutes') { k2.resolved_by = c.id; rep.changes.push(`conflict goal_minutes for ${c.player_key} resolved`) }
  rep.applied = true
}

// cap_goals: a source has the wrong goal count for one cap. {player_key, wrong_source, wrong_value, right_value}:
// the row's goals become right_value and the player's goals / goals_vs_martj42 conflicts in that match are resolved.
// Only applied when a receipt verifies.
function applyCapGoals(c, rows, conflicts, rep) {
  const mid = c.match.match_id
  const row = rows.find((r) => r.match_id === mid && r.player_key === c.player_key)
  if (!row) { rep.changes.push(`no row for ${c.player_key} in ${mid}`); return }
  if (!rep.receipts.some((r) => r.verified)) { rep.changes.push('no receipt verified: not applied'); return }
  const was = row.goals
  row.goals = c.right_value
  row.field_source.goals = `correction ${c.id}`
  row.flags.push(`corrected:${c.id}`)
  row.receipts.push(...c.receipts.map((r) => ({ source: `correction ${c.id}: ${r.source}`, url: r.url, quote: r.quote ?? undefined, statement: r.statement ?? undefined })))
  rep.changes.push(`${c.player_key} ${mid}: goals ${was} -> ${c.right_value} (${c.wrong_source} has ${c.wrong_value})`)
  for (const k of conflicts) if (k.match_id === mid && k.player_key === c.player_key && (k.kind === 'goals' || k.kind === 'goals_vs_martj42')) { k.resolved_by = c.id; rep.changes.push(`conflict ${k.kind} for ${c.player_key} resolved`) }
  rep.applied = true
}

export function applyCorrections(file, rows, conflicts) {
  const doc = readJson(file, { corrections: [] })
  const report = []
  for (const c of doc.corrections ?? []) {
    const rep = { id: c.id, kind: c.kind, applied: false, changes: [], receipts: (c.receipts ?? []).map((r) => ({ url: r.url, ...verifyReceipt(r, rows) })) }
    report.push(rep)
    if (c.kind === 'goal_minute') { applyGoalMinute(c, rows, conflicts, rep); continue }
    if (c.kind === 'cap_goals') { applyCapGoals(c, rows, conflicts, rep); continue }
    if (c.kind !== 'reassign_lineup_entry') { rep.changes.push(`unknown kind ${c.kind}`); continue }
    const mid = c.match.match_id
    const wrong = rows.filter((r) => r.match_id === mid && r.sources.archive?.family === c.source.family && r.sources.archive?.id === c.source.source_id &&
      r.sources.archive?.name === c.from.name_as_written && (c.from.shirt == null || r.sources.archive?.shirt === c.from.shirt))
    const target = rows.find((r) => r.match_id === mid && r.player_key === c.to.player_key)
    // the entry may already sit on the right row (the identity matched it there): keep it, document and resolve
    if (target && wrong.includes(target)) {
      wrong.splice(wrong.indexOf(target), 1)
      if (!wrong.length) {
        target.sources.archive = { ...target.sources.archive, corrected_from: c.from.name_as_written, correction: c.id }
        target.receipts.push(...c.receipts.map((r) => ({ source: `correction ${c.id}: ${r.source}`, url: r.url, quote: r.quote ?? undefined, statement: r.statement ?? undefined })))
        target.flags.push(`corrected:${c.id}`)
        rep.changes.push(`${c.to.player_key} ${mid}: the ${c.source.family} entry "${c.from.name_as_written}" already sits on this row; recorded as his`)
        for (const k of conflicts) if (k.match_id === mid && k.player_key === c.to.player_key) { k.resolved_by = c.id; rep.changes.push(`conflict ${k.kind} for ${k.player_key} resolved`) }
        rep.applied = true
        continue
      }
    }
    if (!wrong.length) rep.changes.push('source entry not found in the rows (archive record not harvested yet?)')
    if (!target) rep.changes.push(`no row for ${c.to.player_key} in ${mid}`)
    if (!wrong.length || !target) continue
    const entry = wrong[0].sources.archive
    // move the entry to the target row
    target.sources.archive = { ...entry, corrected_from: c.from.name_as_written, correction: c.id }
    Object.assign(target, { started: entry.started, on_min: entry.on, off_min: entry.off, off_reason: entry.off_reason, minutes: entry.minutes })
    target.field_source.started = target.field_source.minutes = `archive via correction ${c.id}`
    for (const [k, v] of Object.entries(c.set ?? {})) {
      if (k === 'goal_minutes') target.sources.archive.goal_minutes = v
      else if (k === 'goals') { target.goals = v; target.sources.archive.goals = v; target.field_source.goals = `correction ${c.id}` }
    }
    target.receipts.push(...c.receipts.map((r) => ({ source: `correction ${c.id}: ${r.source}`, url: r.url, quote: r.quote ?? undefined })))
    target.flags.push(`corrected:${c.id}`)
    rep.changes.push(`${c.to.player_key} ${mid}: started ${entry.started}, ${entry.on}'-${entry.off ?? 'end'}, ${entry.minutes} min, goals ${target.goals} (from FIFA's ${c.from.name_as_written} line)`)
    // remove what the entry gave the wrong player
    for (const w of wrong) {
      if (w.cap_source === 'archive') {
        rows.splice(rows.indexOf(w), 1)
        rep.changes.push(`removed ${w.player_key} ${mid} (an appearance only FIFA's misattributed line gave him)`)
      } else {
        delete w.sources.archive
        w.flags.push(`corrected:${c.id}`)
        rep.changes.push(`${w.player_key} ${mid}: dropped the misattributed archive entry`)
      }
    }
    const keys = new Set([c.to.player_key, ...wrong.map((w) => w.player_key)])
    for (const k of conflicts) if (k.match_id === mid && keys.has(k.player_key)) { k.resolved_by = c.id; rep.changes.push(`conflict ${k.kind} for ${k.player_key} resolved`) }
    rep.applied = true
  }
  return report
}
