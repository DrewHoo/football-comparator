// One Barcelona 2013-14 summary to confirm Messi's athlete id is unchanged since 2004.
import { summary } from './espn.mjs'
import { logRun } from './ledger.mjs'
import { loadIndex } from './season-index.mjs'
const e = loadIndex()['esp.1'][2013].played.find((e) => /Barcelona/.test(e.name) && e.date > (process.argv[2] || '2013-10'))
const s = await summary('esp.1', e.id)
for (const t of s.rosters) for (const p of t.roster) if (/Messi|Neymar/.test(p.athlete.displayName)) console.log(e.date.slice(0, 10), e.name, p.athlete.displayName, p.athlete.id)
logRun('probe-id')
