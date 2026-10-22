// --job intl-slugs: the probe pass over the international slugs research/internationals.md left
// unprobed (4,324 team-matches): enumerate each slug by year scoreboard, then sample summaries per
// slug-season (4, stratified by date, preferring a tracked team) with the presence checks of
// research/espn-coverage-ucl-intl.md (rosters, starter flags, stats arrays, keyEvents).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, yearScoreboardUrl, summaryUrl } from './espn-cache.mjs'
import { parseScoreboard, presence } from './parse.mjs'
import { canonTeam } from '../archive/gates.mjs'

export const OUT = path.join(ROOT, 'data/index/espn-intl-probe.json')
export const PER_SEASON = 4
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

/** Slug ids from research/espn-core-probe.md "Slug list". `years` are calendar years to enumerate
 *  (a qualifier slug is scanned every year: an empty year costs one request and proves absence);
 *  `seasonsEst` is the expected number of slug-seasons, used only for the dry-run summary count. */
export const SLUGS = [
  { slug: 'uefa.nations', id: 2395, label: 'UEFA Nations League', years: range(2018, 2026), seasonsEst: 5 },
  { slug: 'caf.nations', id: 3908, label: 'Africa Cup of Nations', years: [2004, 2006, 2008, 2010, 2012, 2013, 2015, 2017, 2019, 2022, 2024, 2025, 2026], seasonsEst: 12 },
  { slug: 'caf.nations_qual', id: 8315, label: 'AFCON qualifiers', years: range(2003, 2026), seasonsEst: 11 },
  { slug: 'afc.asian.cup', id: 20219, label: 'AFC Asian Cup', years: [2004, 2007, 2011, 2015, 2019, 2024], seasonsEst: 6 },
  { slug: 'afc.cupq', id: 5662, label: 'Asian Cup qualifiers', years: range(2004, 2026), seasonsEst: 6 },
  { slug: 'concacaf.gold', id: 4004, label: 'Gold Cup', years: range(2003, 2025).filter((y) => y % 2 === 1), seasonsEst: 12 },
  { slug: 'concacaf.gold_qual', id: 19778, label: 'Gold Cup qualifiers', years: range(2003, 2026), seasonsEst: 4 },
  { slug: 'concacaf.nations.league', id: 19267, label: 'CONCACAF Nations League', years: range(2018, 2026), seasonsEst: 4 },
  { slug: 'concacaf.confederations_playoff', id: 8360, label: 'CONCACAF Cup (Confederations Cup play-off)', years: [2015], seasonsEst: 1 },
  { slug: 'conmebol.america', id: 780, label: 'Copa América', years: [2001, 2004, 2007, 2011, 2015, 2016, 2019, 2021, 2024], seasonsEst: 9 },
  { slug: 'fifa.confederations', id: 4006, label: 'Confederations Cup (hidden slug)', years: [2003, 2005, 2009, 2013, 2017], seasonsEst: 5 },
  { slug: 'fifa.worldq.concacaf', id: 788, label: 'WC qualifiers CONCACAF', years: range(2003, 2026), seasonsEst: 6 },
  { slug: 'fifa.worldq.afc', id: 789, label: 'WC qualifiers AFC', years: range(2003, 2026), seasonsEst: 6 },
  { slug: 'fifa.worldq.caf', id: 790, label: 'WC qualifiers CAF', years: range(2003, 2026), seasonsEst: 6 },
  { slug: 'fifa.worldq.ofc', id: 792, label: 'WC qualifiers OFC', years: range(2003, 2026), seasonsEst: 6 },
  { slug: 'fifa.wcq.ply', id: 23449, label: 'WC intercontinental play-offs', years: range(2005, 2026), seasonsEst: 6 },
]

/** The 42 tracked national teams (research/intl-match-population.csv), canonicalised. */
export function trackedTeams() {
  const t = fs.readFileSync(path.join(ROOT, 'research/intl-match-population.csv'), 'utf8').split('\n').slice(1).map((l) => l.split(',')[0]).filter(Boolean)
  return new Set(t.map(canonTeam))
}

const DONE = /FULL_TIME|FINAL|AET|PEN|ABANDONED/
/** 4 events per slug-season: the date range cut into 4 strata, a tracked-team match first in each. */
export function sample(events, tracked, n = PER_SEASON) {
  const ev = [...events].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  if (ev.length <= n) return ev
  const out = []
  for (let i = 0; i < n; i++) {
    const chunk = ev.slice(Math.floor((i * ev.length) / n), Math.floor(((i + 1) * ev.length) / n))
    out.push(chunk.find((e) => tracked.has(canonTeam(e.homeName)) || tracked.has(canonTeam(e.awayName))) ?? chunk[Math.floor(chunk.length / 2)])
  }
  return out
}

export async function run({ fetcher, slugs = SLUGS, log = console.log }) {
  const tracked = trackedTeams()
  const out = { builtAt: new Date().toISOString(), perSeason: PER_SEASON, trackedTeams: tracked.size, slugs: [] }
  for (const s of slugs) {
    const rec = { slug: s.slug, id: s.id, label: s.label, years: {}, seasons: [], events: 0, trackedTeamMatches: 0, yearsUnknown: 0 }
    const seen = new Map()
    for (const y of s.years) {
      const body = await fetcher.get(yearScoreboardUrl(s.slug, y), 'scoreboard')
      if (body === undefined) { rec.yearsUnknown++; rec.years[y] = null; continue }
      const evs = body === null ? [] : parseScoreboard(body).filter((e) => e.completed || DONE.test(e.status ?? ''))
      rec.years[y] = evs.length
      for (const e of evs) seen.set(e.id, e)
    }
    const bySeason = new Map()
    for (const e of seen.values()) {
      const k = e.seasonYear ?? Number(e.date.slice(0, 4))
      if (!bySeason.has(k)) bySeason.set(k, [])
      bySeason.get(k).push(e)
    }
    rec.events = seen.size
    for (const [season, evs] of [...bySeason].sort((a, b) => a[0] - b[0])) {
      const trackedN = evs.filter((e) => tracked.has(canonTeam(e.homeName)) || tracked.has(canonTeam(e.awayName))).length
      const trackedSides = evs.reduce((n, e) => n + (tracked.has(canonTeam(e.homeName)) ? 1 : 0) + (tracked.has(canonTeam(e.awayName)) ? 1 : 0), 0)
      rec.trackedTeamMatches += trackedSides
      const picks = sample(evs, tracked)
      const matches = []
      for (const e of picks) {
        const body = await fetcher.get(summaryUrl(s.slug, e.id), 'summary')
        if (body === undefined) { matches.push({ id: e.id, date: e.date.slice(0, 10), name: `${e.homeName} v ${e.awayName}`, pending: true }); continue }
        matches.push({ id: e.id, date: e.date.slice(0, 10), name: `${e.homeName} v ${e.awayName}`, round: e.round, ...presence(body) })
      }
      rec.seasons.push({ season, events: evs.length, trackedMatches: trackedN, trackedTeamMatches: trackedSides, first: evs.map((e) => e.date).sort()[0]?.slice(0, 10), last: evs.map((e) => e.date).sort().at(-1)?.slice(0, 10), sampled: matches.length, ...tallies(matches), matches })
    }
    out.slugs.push(rec)
    log(`${s.slug}: ${rec.events} events, ${rec.seasons.length} seasons${rec.yearsUnknown ? `, ${rec.yearsUnknown} year scoreboards not on disk` : ''}`)
  }
  return out
}

export function tallies(ms) {
  const got = ms.filter((m) => m.summary === 'ok')
  const c = (f) => got.filter(f).length
  return { fetched: got.length, empty: ms.filter((m) => m.summary === 'empty').length, rosters: c((m) => m.rosters), anyRoster: c((m) => m.anyRoster), starters: c((m) => m.starters),
    stats: c((m) => m.stats), keyEvents: c((m) => m.keyEvents), goalsReconciled: c((m) => m.goalsReconciled),
    scorerOnlySides: got.reduce((n, m) => n + (m.sides?.home?.scorerOnly ? 1 : 0) + (m.sides?.away?.scorerOnly ? 1 : 0), 0) }
}

/** Markdown rows in the espn-coverage-ucl-intl.md §3 style: rosters / starters / stats / keyEvents of N. */
export function markdown(out) {
  const lines = ['| Slug | Season | Events | Tracked team-matches | Sampled | Rosters full | Starters | Stats | KeyEvents | Goals reconcile | Scorer-only sides |', '|---|---|---|---|---|---|---|---|---|---|---|']
  for (const s of out.slugs) for (const x of s.seasons) lines.push(`| \`${s.slug}\` | ${x.season} | ${x.events} | ${x.trackedTeamMatches} | ${x.fetched}/${x.sampled} | ${x.rosters} | ${x.starters} | ${x.stats} | ${x.keyEvents} | ${x.goalsReconciled} | ${x.scorerOnlySides} |`)
  return lines.join('\n')
}

/** Dry-run estimate of summaries for slug-seasons whose scoreboards are not on disk yet. */
export const estimateSummaries = (slugs = SLUGS) => slugs.reduce((n, s) => n + s.seasonsEst * PER_SEASON, 0)
