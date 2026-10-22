// Recover FIFA archive prelim reports. node recover-fifa.mjs [edition=germany2006|edition=4395|...]:preliminary:match ...
// e.g. germany2006:8071:36543  edition=4395:3835:19743
import { cdx, raw } from './wb.mjs'
import { parseFifaReport } from './fifa.mjs'
import fs from 'node:fs/promises'
await fs.mkdir(new URL('./out/', import.meta.url), { recursive: true })
for (const a of process.argv.slice(2)) {
  const parts = a.split(':')
  const [ed, p, id] = parts.length === 3 ? parts : ['germany2006', ...parts]
  const url = `www.fifa.com/worldcup/archive/${ed}/preliminaries/preliminary=${p}/matches/match=${id}/report.html`
  const snaps = await cdx(url, { matchType: 'exact', collapse: null, limit: 5, fl: 'original,timestamp' })
  if (!snaps.length) { console.log(a, 'no snapshot'); continue }
  const s = snaps[0]
  const page = await raw(s.timestamp, s.original)
  const rep = { source: `https://web.archive.org/web/${s.timestamp}/${s.original}`, ...parseFifaReport(page.text) }
  await fs.writeFile(new URL(`./out/fifa-${id}.json`, import.meta.url), JSON.stringify(rep, null, 1))
  console.log(JSON.stringify(rep))
}
