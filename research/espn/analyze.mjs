// Aggregate coverage per league-season from cached summaries (never fetches).
//   node analyze.mjs [--gates]  -> out/records.json + markdown table on stdout
import fs from 'node:fs'
import { cachedSummary } from './cache-read.mjs'
import { inspect } from './inspect.mjs'
import { SLUGS, label } from './season-index.mjs'
const sample = JSON.parse(fs.readFileSync('out/sweep-sample.json', 'utf8'))
const extra = fs.existsSync('out/gate-matches.json') && process.argv.includes('--gates') ? JSON.parse(fs.readFileSync('out/gate-matches.json', 'utf8')) : []
const recs = []
const seen = new Set()
for (const row of [...sample, ...extra]) {
  if (seen.has(row.id)) continue
  const s = cachedSummary(row.slug, row.id)
  if (s === undefined) continue
  seen.add(row.id)
  recs.push(inspect(s, row))
}
fs.writeFileSync('out/records.json', JSON.stringify(recs))
const pct = (xs, f) => (xs.length ? Math.round((100 * xs.filter(f).length) / xs.length) : NaN)
const cols = [
  ['rosters', (r) => r.rosterBoth],
  ['CLEAN lineup', (r) => r.rosterBoth && !r.collapsedIds && r.elevenFixed && r.keSubsMatchRoster],
  ['11+11 raw', (r) => r.eleven],
  ['11+11 fixed', (r) => r.elevenFixed],
  ['noStartFlags', (r) => r.noStarterFlags],
  ['collapsedIds', (r) => r.collapsedIds],
  ['dupRoster', (r) => r.dupEntries[0] + r.dupEntries[1] > 0],
  ['subFlags', (r) => r.subsIn[0] + r.subsIn[1] > 0],
  ['bench', (r) => r.unusedBench[0] > 0 && r.unusedBench[1] > 0],
  ['stats', (r) => r.statsAllUsed],
  ['statG=score', (r) => r.statGMatchScore],
  ['A>0', null],
  ['keGoals=score', (r) => r.keGoalsMatchScore],
  ['keSubs=roster', (r) => r.keSubsMatchRoster],
  ['subClock', (r) => r.subClockForAll],
  ['dupSubKE', (r) => r.keSubsDup],
  ['clocks', (r) => r.keGoalsClock && r.keSubsClock && r.keyEvents > 0],
  ['score=board', (r) => r.scoreMatchesBoard],
  ['venue', (r) => r.venue],
  ['attend', (r) => r.attendance > 0],
]
const out = ['| League | Season | n | ' + cols.map((c) => c[0]).join(' | ') + ' | roster size (median) | A per goal | stat keys |', '|' + '---|'.repeat(cols.length + 6)]
for (const slug of SLUGS) for (let y = 2000; y <= 2013; y++) for (const kind of ['sweep', 'legacy']) {
  const xs = recs.filter((r) => r.slug === slug && r.season === y && (kind === 'legacy' ? r.kind === 'legacy' : r.kind !== 'legacy' && r.kind !== 'stuck'))
  if (!xs.length) continue
  const sizes = xs.flatMap((r) => r.rosterSize).sort((a, b) => a - b)
  const goals = xs.reduce((a, r) => a + r.score[0] + r.score[1], 0)
  const ast = xs.reduce((a, r) => a + r.statA[0] + r.statA[1], 0)
  const keys = [...new Set(xs.flatMap((r) => r.statKeys))].join(',')
  const cells = cols.map(([n, f]) => (f ? pct(xs, f) : pct(xs, (r) => r.statA[0] + r.statA[1] > 0)))
  out.push(`| ${slug} | ${label(y)}${kind === 'legacy' ? ' (legacy ids)' : ''} | ${xs.length} | ${cells.join(' | ')} | ${sizes[sizes.length >> 1]} | ${goals ? (ast / goals).toFixed(2) : '-'} | ${keys.length > 40 ? keys.split(',').length + ' keys' : keys || '-'} |`)
}
console.log(out.join('\n'))
