// Q1 part A: do core competitor rosters exist where site summaries are empty or corrupt?
// EPL 2009-10 23 missing, Serie A collapsed (10), UCL Barca-Udinese (188764/188837), Messi WC 2010 QF / 2014 SF (+2010 final).
import fs from 'node:fs'
import { coreRoster, siteRosterInfo, competitorsOf, summary, safe, getUrl, CORE } from './core-lib.mjs'
import { stats } from './espn.mjs'
import { logRun } from './ledger.mjs'
const T = JSON.parse(fs.readFileSync('out/core-test-ids.json', 'utf8'))
const cases = []
for (const e of T.eplMissing) cases.push({ set: 'epl2009', slug: 'eng.1', id: e.id, date: e.date, name: e.name })
for (const id of [...new Set(T.itaCollapsed.map((c) => c.id))]) { const c = T.itaCollapsed.find((x) => x.id === id); cases.push({ set: 'itaCollapsed', slug: 'ita.1', id, date: c.date }) }
for (const id of ['188764', '188837']) cases.push({ set: 'uclUdinese', slug: 'uefa.champions', id })
for (const id of ['264119', '383241', '264123']) cases.push({ set: 'wcEmpty', slug: 'fifa.world', id })
const out = []
for (const c of cases) {
  const s = await safe(summary(c.slug, c.id))
  const comps = competitorsOf(s)
  const site = siteRosterInfo(s)
  const ke = (s?.keyEvents ?? []); const keTeams = new Set(ke.map((k) => String(k.team?.id)).filter((x) => x !== 'undefined'))
  const keForeign = [...keTeams].filter((t) => !comps.some((k) => k.id === t)).length
  const core = {}
  for (const k of comps) core[k.id] = await coreRoster(c.slug, c.id, k.id)
  const r = { ...c, name: c.name ?? comps.map((k) => k.name).join(' v '), comps, site: { teams: site.teams, rosters: site.rosters?.map(({ ids, ...x }) => x) }, keyEvents: ke.length, keForeignTeams: keForeign, core }
  // Udinese/WC: is the key player present?
  for (const pid of ['45843']) for (const k of comps) if (core[k.id]?.ids?.includes(pid)) r.messi = core[k.id].entries.find((e) => e.id === pid)
  out.push(r)
  const cr = Object.values(core).map((x) => x.exists ? `${x.n}/${x.distinct}d/${x.starters}st/${x.subIn}in` : 'none').join(' | ')
  console.log(c.set, c.id, r.name, 'site', (site.rosters ?? []).map((x) => `${x.n}/${x.distinct}d/${x.starters}st`).join(' | ') || 'none', 'core', cr, r.messi ? 'MESSI ' + JSON.stringify(r.messi) : '')
}
// Plays check on 5 EPL matches: right teams?
for (const c of out.filter((o) => o.set === 'epl2009').slice(0, 5)) {
  const p = await safe(getUrl(`${CORE}leagues/eng.1/events/${c.id}/competitions/${c.id}/plays?limit=400`))
  const teams = new Set((p?.items ?? []).map((i) => /teams\/(\d+)/.exec(i.team?.$ref ?? '')?.[1]).filter(Boolean))
  c.plays = { n: p?.items?.length ?? 0, teams: [...teams], subs: (p?.items ?? []).filter((i) => /substitution/i.test(i.type?.text ?? '')).length, goals: (p?.items ?? []).filter((i) => i.scoringPlay).length }
  console.log('plays', c.id, JSON.stringify(c.plays), 'comps', c.comps.map((k) => k.id + ':' + k.score).join(','))
}
fs.writeFileSync('core-q1.json', JSON.stringify(out, null, 1))
logRun('core-q1'); console.error(JSON.stringify(stats))
