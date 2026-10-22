// Dump the 220-league dropdown as a slug table.
import { get } from './espn.mjs'
const j = await get('../../leagues/dropdown?sport=soccer&limit=400')
for (const l of j.leagues) console.log([l.slug, l.id, l.name, l.season?.year ?? ''].join('\t'))
