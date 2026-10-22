// Condensed scoreboard view: node ucl-sbsum.mjs slug:YYYYMMDD ...
import { scoreboard, stats } from './espn.mjs'
for (const a of process.argv.slice(2)) {
  const [slug, d] = a.split(':')
  const j = await scoreboard(slug, d)
  if (!j) { console.log(a, 'NULL'); continue }
  const L = j.leagues?.[0]
  console.log(`## ${a} season=${L?.season?.displayName} type=${L?.season?.type?.name} cal=${L?.calendarType} n=${j.events?.length}`)
  for (const e of j.events ?? []) {
    const c = e.competitions[0]
    console.log(`  ${e.id} ${e.date} ${e.name} | slug=${e.season?.slug} type=${e.season?.type} group=${c.group?.name ?? ''} note=${c.altGameNote ?? ''} notes=${(c.notes || []).map((n) => n.headline).join('/')}`)
  }
}
console.error(JSON.stringify(stats))
