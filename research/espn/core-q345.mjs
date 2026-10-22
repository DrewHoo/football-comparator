// Q3 national-team season enumeration + roster coverage; Q4 hidden slugs; Q5 scoreboards on two dates;
// Q1 intl: friendlies and UEFA qualifiers 2002-08 with no site roster -> core roster.
import fs from 'node:fs'
import { getUrl, get, summary, safe, CORE, SITEWEB, refPath, coreRoster, siteRosterInfo, competitorsOf } from './core-lib.mjs'
import { stats } from './espn.mjs'
import { logRun } from './ledger.mjs'
import { cached } from './cache-read.mjs'
const out = { q3: {}, q4: {}, q5: {}, q1intl: [] }
const hasRoster = (r) => r && r.n >= 11 && r.distinct >= 11 && r.starters >= 10
// ---------- Q4: hidden slugs + season ranges
const dd = cached('../../leagues/dropdown?sport=soccer&limit=400').leagues
const guesses = ['fifa.confederations', 'global.champs_cup', 'global.world_football_challenge', 'club.friendly', 'fifa.worldq', 'fifa.worldq.playoff', 'fifa.worldq.uefa.playoff', 'uefa.euroq.playoff', 'uefa.euro.qual', 'uefa.euro_qual', 'fifa.friendlies', 'intl.friendly', 'global.friendly', 'fifa.world.qual', 'conmebol.americaq', 'concacaf.goldq', 'caf.nationsq', 'afc.asian', 'afc.asianq', 'fifa.olympicsq', 'fifa.worldq.intercontinental', 'uefa.nations_qual', 'fifa.worldq.uefa.ply', 'afc.asian.cupq']
for (const g of guesses) { const j = await safe(getUrl(`${CORE}leagues/${g}`)); out.q4[g] = j && !j.__error ? { id: j.id, name: j.name, abbr: j.abbreviation } : null; console.log('slug?', g, JSON.stringify(out.q4[g])) }
out.q4seasons = {}
for (const s of ['fifa.friendly', 'fifa.worldq.uefa', 'fifa.worldq.conmebol', 'fifa.worldq.concacaf', 'fifa.worldq.caf', 'fifa.worldq.afc', 'uefa.euroq', 'uefa.nations', 'conmebol.america', 'caf.nations', 'caf.nations_qual', 'concacaf.gold', 'afc.asian.cup', 'afc.cupq', 'fifa.confederations', 'fifa.world']) {
  const j = await safe(getUrl(`${CORE}leagues/${s}/seasons?limit=200`))
  const ys = (j?.items ?? []).map((i) => +/seasons\/(\d+)/.exec(i.$ref)?.[1]).filter(Boolean).sort((a, b) => a - b)
  out.q4seasons[s] = { n: ys.length, first: ys[0], last: ys.at(-1), years: ys }
  console.log('seasons', s, ys.length, ys[0], ys.at(-1))
}
// ---------- Q5: scoreboards on two dates across every international slug
const intl = [...new Set([...dd.filter((l) => /^(fifa|uefa|conmebol|concacaf|caf|afc|ofc|global)\b/.test(l.slug) && !/wwc|women|femenina|shebelieves|pinatar|arnold/i.test(l.slug + l.name)).map((l) => l.slug), ...Object.keys(out.q4).filter((k) => out.q4[k])])]
for (const d of ['20041013', '20010901']) {
  out.q5[d] = {}
  for (const s of intl) {
    const j = await safe(get(`${s}/scoreboard?dates=${d}&limit=200`))
    const ev = (j?.events ?? []).map((e) => ({ id: e.id, name: e.name, season: e.season?.slug, status: e.status?.type?.name }))
    if (ev.length) { out.q5[d][s] = ev; console.log('sb', d, s, ev.length, ev.slice(0, 4).map((e) => e.name).join('; ')) }
  }
}
// ---------- Q3: team-year schedules
const TY = [['482', 'Portugal', 2004, ['fifa.friendly', 'fifa.worldq.uefa', 'uefa.euro']], ['482', 'Portugal', 2006, ['fifa.friendly', 'uefa.euroq', 'fifa.world']], ['482', 'Portugal', 2008, ['fifa.friendly', 'fifa.worldq.uefa', 'uefa.euro']],
  ['202', 'Argentina', 2005, ['fifa.friendly', 'fifa.worldq.conmebol', 'fifa.confederations']], ['202', 'Argentina', 2007, ['fifa.friendly', 'fifa.worldq.conmebol', 'conmebol.america']]]
for (const [tid, tname, Y, slugs] of TY) {
  const ev = new Map()
  const add = (id, slug, date, name, via) => { if (!date?.startsWith(String(Y))) return; const e = ev.get(id) ?? { id, slug, date: date.slice(0, 10), name, via: [] }; e.via.push(via); ev.set(id, e) }
  for (const y of [Y, Y + 1]) {
    const j = await safe(getUrl(`${CORE}leagues/all/seasons/${y}/teams/${tid}/events?limit=200`))
    for (const i of j?.items ?? []) { const p = refPath(i); const [, slug, id] = /leagues\/([^/]+)\/events\/(\d+)/.exec(p) ?? []; ev.has(id) ? ev.get(id).via.push('coreAll' + y) : ev.set(id, { id, slug, date: null, name: null, via: ['coreAll' + y] }) }
  }
  for (const s of slugs) for (const y of (/worldq|euroq/.test(s) ? [Y - 1, Y, Y + 1] : [Y])) {
    const j = await safe(getUrl(`${SITEWEB}${s}/teams/${tid}/schedule?season=${y}`))
    for (const e of j?.events ?? []) add(e.id, e.league?.slug ?? s, e.date, e.name, `sched:${s}:${y}`)
    // also learn dates for core-only ids
    for (const e of j?.events ?? []) if (ev.has(e.id) && !ev.get(e.id).date) Object.assign(ev.get(e.id), { date: e.date.slice(0, 10), name: e.name })
  }
  const rows = []
  for (const e of ev.values()) {
    const s = await safe(summary(e.slug, e.id))
    if (!e.date) { e.date = s?.header?.competitions?.[0]?.date?.slice(0, 10) ?? null; e.name = competitorsOf(s).map((c) => c.name).join(' v ') }
    if (e.date && !e.date.startsWith(String(Y))) continue
    const site = siteRosterInfo(s, tid).rosters?.[0]
    const core = await coreRoster(e.slug, e.id, tid)
    rows.push({ ...e, site: site ? { n: site.n, distinct: site.distinct, starters: site.starters } : null, siteOK: hasRoster(site), core: core.exists ? { n: core.n, distinct: core.distinct, starters: core.starters } : null, coreOK: hasRoster(core) })
  }
  rows.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  out.q3[`${tname} ${Y}`] = rows
  console.log('Q3', tname, Y, rows.length, rows.map((r) => `${r.date} ${r.slug} ${r.siteOK ? 'S' : '-'}${r.coreOK ? 'C' : '-'}`).join(' | '))
}
// ---------- Q1 intl: friendlies + UEFA qualifiers 2002-08 lacking site rosters
const pools = { friendly: [], uefaQual: [] }
for (const y of [2002, 2003, 2004, 2005, 2006, 2007, 2008]) {
  const f = await safe(get(`fifa.friendly/scoreboard?dates=${y}&limit=1000`)); pools.friendly.push(...(f?.events ?? []).filter((e) => e.status?.type?.completed).map((e) => ({ slug: 'fifa.friendly', id: e.id, date: e.date, name: e.name })))
  for (const s of ['fifa.worldq.uefa', 'uefa.euroq']) { const q = await safe(get(`${s}/scoreboard?dates=${y}&limit=1000`)); pools.uefaQual.push(...(q?.events ?? []).filter((e) => e.status?.type?.completed).map((e) => ({ slug: s, id: e.id, date: e.date, name: e.name }))) }
}
console.log('pools', pools.friendly.length, pools.uefaQual.length)
for (const [k, pool] of Object.entries(pools)) {
  pool.sort((a, b) => a.date.localeCompare(b.date)); const step = Math.max(1, Math.floor(pool.length / 45))
  let found = 0, tried = 0
  for (let i = 0; i < pool.length && found < 10 && tried < 45; i += step) {
    const e = pool[i]; tried++
    const s = await safe(summary(e.slug, e.id)); const comps = competitorsOf(s); const si = siteRosterInfo(s)
    const bad = comps.filter((c) => !hasRoster(si.rosters?.find((r) => r.team === c.id)))
    if (!bad.length) continue
    found++
    const core = {}; for (const c of comps) { const r = await coreRoster(e.slug, e.id, c.id); core[c.id] = r.exists ? { n: r.n, distinct: r.distinct, starters: r.starters, ok: hasRoster(r) } : null }
    out.q1intl.push({ set: k, ...e, site: si.rosters?.map(({ ids, ...x }) => x), badTeams: bad.map((c) => c.id), core })
    console.log('Q1intl', k, e.id, e.date.slice(0, 10), e.name, 'site', JSON.stringify(si.rosters?.map((r) => r.n)), 'core', JSON.stringify(core))
  }
  out[`q1intl_tried_${k}`] = tried
}
fs.writeFileSync('core-q345.json', JSON.stringify(out, null, 1))
logRun('core-q345'); console.error(JSON.stringify(stats))
