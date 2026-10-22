// Identity checks over cached summaries: one displayName with several athlete ids, one id with several names.
import fs from 'node:fs'
import { cachedSummary } from './cache-read.mjs'
const rows = [...JSON.parse(fs.readFileSync('out/sweep-sample.json', 'utf8')), ...(fs.existsSync('out/gate-matches.json') ? JSON.parse(fs.readFileSync('out/gate-matches.json', 'utf8')) : [])]
const byName = new Map(), byId = new Map()
let n = 0
for (const r of rows) {
  const s = cachedSummary(r.slug, r.id)
  if (!s) continue
  for (const t of s.rosters || []) {
    const ros = t.roster || []
    if (ros.length > 5 && new Set(ros.map((p) => p.athlete?.id)).size <= 2) continue // collapsed-id rosters
    for (const p of ros) {
      const id = p.athlete?.id, nm = p.athlete?.displayName
      if (!id) continue
      n++
      if (!byName.has(nm)) byName.set(nm, new Map())
      byName.get(nm).set(id, `${r.slug} ${r.season} ${t.team?.displayName}`)
      if (!byId.has(id)) byId.set(id, new Set())
      byId.get(id).add(nm)
    }
  }
}
const col = [...byName].filter(([, m]) => m.size > 1)
console.log('roster entries', n, 'distinct names', byName.size, 'names with >1 id', col.length)
for (const [nm, m] of col.slice(0, 30)) console.log('  ', nm, ':', [...m].map(([id, w]) => `${id} (${w})`).join(' | '))
const multi = [...byId].filter(([, s]) => s.size > 1)
console.log('ids with >1 name', multi.length)
for (const [id, s] of multi.slice(0, 15)) console.log('  ', id, ':', [...s].join(' / '))
// Same name + same club under 2+ ids = almost certainly one person split across ids.
const clubIds = new Map()
for (const r of rows) {
  const s = cachedSummary(r.slug, r.id)
  if (!s) continue
  for (const t of s.rosters || []) {
    const ros = t.roster || []
    if (ros.length > 5 && new Set(ros.map((p) => p.athlete?.id)).size <= 2) continue
    for (const p of ros) {
      const k = p.athlete?.displayName + ' @ ' + t.team?.displayName
      if (!clubIds.has(k)) clubIds.set(k, new Map())
      const m = clubIds.get(k)
      if (!m.has(p.athlete?.id)) m.set(p.athlete?.id, new Set())
      m.get(p.athlete?.id).add(r.season)
    }
  }
}
const splits = [...clubIds].filter(([, m]) => m.size > 1)
console.log('same name + same club with >1 id:', splits.length)
const sameSeason = splits.filter(([, m]) => { const ss = [...m.values()]; return ss.some((a, i) => ss.some((b, j) => i !== j && [...a].some((y) => b.has(y)))) })
console.log('  ...of which the two ids overlap in the same season:', sameSeason.length)
const yrs = {}
for (const [, m] of splits) { const ids = [...m.keys()].map(Number).sort((a, b) => a - b); const hi = ids.at(-1); const b = hi < 50000 ? '<50k' : hi < 100000 ? '50-100k' : '>100k'; yrs[b] = (yrs[b] || 0) + 1 }
console.log('  higher id bucket', JSON.stringify(yrs))
for (const [k, m] of sameSeason.slice(0, 8)) console.log('   ', k, [...m].map(([id, s]) => id + ':' + [...s].join('/')).join(' | '))
