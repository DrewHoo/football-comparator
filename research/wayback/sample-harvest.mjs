// Gated sample harvest: evenly spaced pages per source, parse, and check invariants.
// node sample-harvest.mjs [perSource=12]
import { cdx, raw, stats } from './wb.mjs'
import { parseFifaReport } from './fifa.mjs'
import { parseUefaLineups } from './uefa.mjs'
import fs from 'node:fs/promises'
const N = Number(process.argv[2] ?? 12)
const SOURCES = [
  { name: 'FIFA 1998 prelims', pre: 'www.fifa.com/worldcup/archive/edition=1013/preliminaries/', re: /match=\d+\/report\.html$/, kind: 'fifa' },
  { name: 'FIFA 2002 prelims', pre: 'www.fifa.com/worldcup/archive/edition=4395/preliminaries/', re: /match=\d+\/report\.html$/, kind: 'fifa' },
  { name: 'FIFA 2006 prelims', pre: 'www.fifa.com/worldcup/archive/germany2006/preliminaries/', re: /match=\d+\/report\.html$/, kind: 'fifa' },
  { name: 'FIFA 2010 prelims', pre: 'www.fifa.com/worldcup/archive/southafrica2010/preliminaries/', re: /match=\d+\/report(\.html)?$/, kind: 'fifa' },
  { name: 'UEFA Euro 2000 (incl. qualifiers)', pre: 'www.uefa.com/uefaeuro/season=2000/matches/', re: /postmatch\/lineups\/index\.html$/, kind: 'uefa' },
]
const goalsFromScore = (s) => (s?.match(/^(\d+)[:-](\d+)/) ?? []).slice(1).map(Number)
const results = []
for (const src of SOURCES) {
  const rows = (await cdx(src.pre, { from: '2005', to: '2022', limit: 20000, fl: 'original,timestamp' })).filter((r) => src.re.test(r.original))
  const byId = new Map()
  for (const r of rows) { const id = r.original.match(/match=(\d+)/)[1]; if (!byId.has(id)) byId.set(id, r) }
  const list = [...byId.values()]
  const step = Math.max(1, Math.floor(list.length / N))
  const pick = list.filter((_, i) => i % step === 0).slice(0, N)
  let ok = 0
  for (const r of pick) {
    const p = await raw(r.timestamp, r.original)
    const rec = { source: src.name, ts: r.timestamp, url: r.original, status: p.status, problems: [] }
    if (!p.text || /requires your browser to support JavaScript/.test(p.text)) { rec.problems.push('no page / wayback shell'); results.push(rec); continue }
    try {
      if (src.kind === 'fifa') {
        const x = parseFifaReport(p.text)
        rec.match = `${x.home} ${x.result} ${x.away} (${x.date})`
        if (x.teams.length !== 2) rec.problems.push(`${x.teams.length} team blocks`)
        for (const t of x.teams) {
          if (t.starters.length !== 11) rec.problems.push(`${t.name}: ${t.starters.length} starters`)
          const offs = t.starters.filter((q) => q.off).length + t.bench.filter((q) => q.off).length
          const ons = t.bench.filter((q) => q.on).length
          if (offs !== ons) rec.problems.push(`${t.name}: ${offs} off vs ${ons} on`)
        }
        const [hg, ag] = goalsFromScore(x.result)
        if (hg + ag !== x.goals.length) rec.problems.push(`goals listed ${x.goals.length} vs score ${x.result}`)
        rec.hasAttendance = !!x.attendance && x.attendance !== '0'
        rec.hasReferee = !!x.referee
      } else {
        const x = parseUefaLineups(p.text)
        if (!x) { rec.problems.push('no lineup box'); results.push(rec); continue }
        rec.match = `${x.header.home} ${x.header.score} ${x.header.away} | ${x.header.venueLine}`
        for (const s of ['home', 'away']) {
          if (x[s].starters.length !== 11) rec.problems.push(`${s}: ${x[s].starters.length} starters`)
          const offs = x[s].starters.filter((q) => q.events.some((e) => e.type === 'Substitution')).length
          const ons = x[s].subs.filter((q) => q.events.some((e) => e.type === 'Substitution')).length
          if (offs !== ons) rec.problems.push(`${s}: ${offs} off vs ${ons} on`)
        }
        const [hg, ag] = goalsFromScore(x.header.score)
        const g = ['home', 'away'].flatMap((s) => [...x[s].starters, ...x[s].subs]).flatMap((q) => q.events).filter((e) => e.type === 'Goal').length
        if (g !== hg + ag) rec.problems.push(`goal icons ${g} vs score ${x.header.score} (own goals?)`)
        rec.hasReferee = !!x.officials.referee
      }
    } catch (e) { rec.problems.push('parse error ' + e.message) }
    if (!rec.problems.length) ok++
    results.push(rec)
    console.log(src.name, rec.ts, rec.match?.slice(0, 70), rec.problems.join('; ') || 'OK')
  }
  console.log(`== ${src.name}: ${byId.size} distinct matches archived; sample ${pick.length}, clean ${ok}`)
}
await fs.writeFile(new URL('./out/sample-harvest.json', import.meta.url), JSON.stringify(results, null, 1))
console.error(JSON.stringify(stats))
