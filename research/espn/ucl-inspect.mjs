// Inspect specific cached UCL matches: node ucl-inspect.mjs <eventId>...
import { summary } from './ucl-lib.mjs'
for (const id of process.argv.slice(2)) {
  const s = await summary(process.env.SLUG ?? 'uefa.champions', id)
  console.log('##', id, s.header?.season?.name, s.header?.competitions?.[0]?.competitors?.map((c) => c.team.displayName + ' ' + c.score).join(' v '))
  for (const r of s.rosters ?? []) {
    const ro = r.roster ?? []
    console.log(' ', r.team?.displayName, 'n', ro.length, 'starters', ro.filter((p) => p.starter).length, 'subIn', ro.filter((p) => p.subbedIn).length, 'dupIds', ro.length - new Set(ro.map((p) => p.athlete.id)).size, 'pos', [...new Set(ro.map((p) => p.position?.abbreviation))].join(','))
  }
  for (const k of (s.keyEvents ?? []).filter((k) => k.scoringPlay)) console.log('   goal', k.clock?.displayValue, k.type?.type, k.shootout ? 'SO' : '', (k.participants ?? []).map((p) => p.athlete.displayName).join(' <- '))
  const ga = (s.rosters ?? []).flatMap((r) => r.roster ?? []).filter((p) => p.stats?.some((x) => (x.abbreviation === 'G' || x.abbreviation === 'A') && x.value))
  console.log('   statG/A:', ga.map((p) => p.athlete.displayName + ' ' + p.stats.filter((x) => ['G', 'A'].includes(x.abbreviation)).map((x) => x.abbreviation + x.value).join('')).join('; '))
  console.log('   KE types', [...new Set((s.keyEvents ?? []).map((k) => k.type?.type))].join(','), 'noClock', (s.keyEvents ?? []).filter((k) => !k.clock?.displayValue).map((k) => k.type?.type).join(','))
}
