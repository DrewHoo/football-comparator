// First season per league where each field is >=95% in the sweep sample and stays >=95% in every later season.
// Also prints a compact per league-season table for the report.  node floors.mjs  (run analyze.mjs first)
import fs from 'node:fs'
import { SLUGS, label } from './season-index.mjs'
const recs = JSON.parse(fs.readFileSync('out/records.json', 'utf8')).filter((r) => r.kind === 'sweep')
const F = {
  'rosters both sides': (r) => r.rosterBoth,
  'clean lineup (repaired)': (r) => r.rosterBoth && !r.collapsedIds && r.elevenFixed && r.keSubsMatchRoster,
  'starter flags present': (r) => r.rosterBoth && !r.noStarterFlags,
  'sub clocks for every sub': (r) => r.rosterBoth && r.subClockForAll && r.subsInFixed[0] + r.subsInFixed[1] > 0,
  'keyEvent goals = score': (r) => r.keGoalsMatchScore,
  'stats[] for every used player': (r) => r.statsAllUsed,
  'stats[] G = score': (r) => r.statGMatchScore,
  'unused bench listed': (r) => r.unusedBench[0] > 0 && r.unusedBench[1] > 0,
  'venue': (r) => r.venue,
  'attendance > 0': (r) => r.attendance > 0,
}
const pct = (xs, f) => Math.round((100 * xs.filter(f).length) / xs.length)
const lines = ['| Field | ' + SLUGS.join(' | ') + ' |', '|---|' + SLUGS.map(() => '---|').join('')]
for (const [name, f] of Object.entries(F)) {
  const cells = SLUGS.map((slug) => {
    const ys = []
    for (let y = 2000; y <= 2013; y++) { const xs = recs.filter((r) => r.slug === slug && r.season === y); if (xs.length) ys.push([y, pct(xs, f)]) }
    // allow EPL 2009-10 to be judged on the legacy copy separately (noted in report)
    const ok = ys.filter(([y, p]) => !(slug === 'eng.1' && y === 2009))
    for (let i = 0; i < ok.length; i++) if (ok.slice(i).every(([, p]) => p >= 95)) return label(ok[i][0])
    return 'never'
  })
  lines.push(`| ${name} | ${cells.join(' | ')} |`)
}
console.log(lines.join('\n'))
console.log()
const T = ['| League | Season | n | rosters | clean lineup | starter flags | dup-entry rosters | collapsed-id rosters | sub clocks | KE goals = score | dup sub events | stats[] all used | stats G = score | A per goal | venue | attendance |', '|' + '---|'.repeat(16)]
for (const slug of SLUGS) for (let y = 2000; y <= 2013; y++) for (const leg of [false, true]) {
  const xs = JSON.parse(fs.readFileSync('out/records.json', 'utf8')).filter((r) => r.slug === slug && r.season === y && (leg ? r.kind === 'legacy' : r.kind === 'sweep'))
  if (!xs.length) continue
  const g = xs.reduce((a, r) => a + r.score[0] + r.score[1], 0), a = xs.reduce((s, r) => s + r.statA[0] + r.statA[1], 0)
  T.push(`| ${slug} | ${label(y)}${leg ? ' legacy ids' : ''} | ${xs.length} | ${pct(xs, F['rosters both sides'])} | ${pct(xs, F['clean lineup (repaired)'])} | ${pct(xs, F['starter flags present'])} | ${pct(xs, (r) => r.dupEntries[0] + r.dupEntries[1] > 0)} | ${pct(xs, (r) => r.collapsedIds)} | ${pct(xs, F['sub clocks for every sub'])} | ${pct(xs, F['keyEvent goals = score'])} | ${pct(xs, (r) => r.keSubsDup)} | ${pct(xs, F['stats[] for every used player'])} | ${pct(xs, F['stats[] G = score'])} | ${xs.some((r) => r.statsAny) ? (a / g).toFixed(2) : '-'} | ${pct(xs, F.venue)} | ${pct(xs, F['attendance > 0'])} |`)
}
fs.writeFileSync('out/coverage-table.md', T.join('\n') + '\n')
console.log(T.join('\n'))
