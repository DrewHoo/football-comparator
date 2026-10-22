// Cache-only: picks the test event ids for the core-API probe from earlier agents' outputs.
import fs from 'node:fs'
import { loadIndex } from './season-index.mjs'
import { cachedSummary } from './cache-read.mjs'
const ix = loadIndex()
const b = ix['eng.1'][2009]
const legacyPairs = new Set(b.legacy.filter(e=>/FULL|AET|ABAND/.test(e.status)).map(e => e.home + '|' + e.away))
const missing = b.played.filter(e => !legacyPairs.has(e.home + '|' + e.away))
console.log('EPL 2009-10 reingest', b.played.length, 'legacy', b.legacy.length, 'legacyPlayed', legacyPairs.size, 'missing', missing.length)
console.log(JSON.stringify(missing.slice(0,3)))
// Serie A collapsed rosters among cached summaries
const coll = []
for (const y of [2001,2002,2003,2004,2005,2006,2007]) for (const e of ix['ita.1'][y]?.played ?? []) {
  const s = cachedSummary('ita.1', e.id); if (!s) continue
  for (const r of s.rosters ?? []) { const ids = new Set((r.roster ?? []).map(x => x.athlete?.id)); if ((r.roster?.length ?? 0) > 3 && ids.size === 1) { coll.push({ id: e.id, date: e.date, name: e.home+' v '+e.away, team: r.team?.id, who: r.roster[0].athlete?.displayName }); } }
}
console.log('collapsed ita', coll.length); console.log(JSON.stringify(coll))
fs.writeFileSync('out/core-test-ids.json', JSON.stringify({ eplMissing: missing, itaCollapsed: coll }, null, 1))
