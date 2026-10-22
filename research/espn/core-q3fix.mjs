// Q3 fix-up: qualifiers filed under later campaign seasons (WCQ 2006 for 2004-05 games, euroq 2008 for 2006-07, WCQ 2010 for 2007-09),
// plus core rosters for the two 2004 UEFA qualifiers the earlier agent found without rosters.
import fs from 'node:fs'
import { getUrl, summary, safe, SITEWEB, coreRoster, siteRosterInfo, competitorsOf } from './core-lib.mjs'
import { stats } from './espn.mjs'
import { logRun } from './ledger.mjs'
const hasRoster = (r) => r && r.n >= 11 && r.distinct >= 11 && r.starters >= 10
const q = JSON.parse(fs.readFileSync('core-q345.json', 'utf8'))
const extra = [['482', 'Portugal', 2004, 'fifa.worldq.uefa', [2006]], ['482', 'Portugal', 2006, 'uefa.euroq', [2007, 2008]], ['482', 'Portugal', 2008, 'fifa.worldq.uefa', [2009, 2010]],
  ['202', 'Argentina', 2005, 'fifa.worldq.conmebol', [2006]], ['202', 'Argentina', 2007, 'fifa.worldq.conmebol', [2008, 2009, 2010]]]
for (const [tid, tname, Y, slug, seasons] of extra) {
  const rows = q.q3[`${tname} ${Y}`]
  for (const s of seasons) {
    const j = await safe(getUrl(`${SITEWEB}${slug}/teams/${tid}/schedule?season=${s}`))
    for (const e of j?.events ?? []) {
      if (!e.date?.startsWith(String(Y)) || rows.some((r) => r.id === e.id)) continue
      const sm = await safe(summary(slug, e.id)); const site = siteRosterInfo(sm, tid).rosters?.[0]; const core = await coreRoster(slug, e.id, tid)
      rows.push({ id: e.id, slug, date: e.date.slice(0, 10), name: e.name, via: [`sched:${slug}:${s}`], site: site ? { n: site.n, distinct: site.distinct, starters: site.starters } : null, siteOK: hasRoster(site), core: core.exists ? { n: core.n, distinct: core.distinct, starters: core.starters } : null, coreOK: hasRoster(core) })
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  console.log('Q3', tname, Y, rows.length, rows.map((r) => `${r.date} ${r.slug} ${r.siteOK ? 'S' : '-'}${r.coreOK ? 'C' : '-'}`).join(' | '))
}
for (const id of ['152439', '152448']) {
  const s = await safe(summary('fifa.worldq.uefa', id)); const comps = competitorsOf(s); const si = siteRosterInfo(s); const core = {}
  for (const c of comps) { const r = await coreRoster('fifa.worldq.uefa', id, c.id); core[c.id] = r.exists ? { n: r.n, distinct: r.distinct, starters: r.starters, ok: hasRoster(r) } : null }
  q.q1intl.push({ set: 'uefaQual', slug: 'fifa.worldq.uefa', id, date: s?.header?.competitions?.[0]?.date, name: comps.map((c) => c.name).join(' v '), site: si.rosters?.map(({ ids, ...x }) => x), core })
  console.log('Q1intl', id, JSON.stringify(si.rosters?.map((r) => r.n)), JSON.stringify(core))
}
fs.writeFileSync('core-q345.json', JSON.stringify(q, null, 1))
logRun('core-q3fix'); console.error(JSON.stringify(stats))
