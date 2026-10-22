// Candidate squads for a broken team-match, from rosters already in the cache (zero requests).
//
// Club: the same team's matches in the same season, any slug in the harvester's index (league and
// UCL), nearest first by date, skipping sides that are themselves collapsed or missing. The union
// of their full roster entries (starters, subs and unused bench) plus the anomaly's keyEvent
// evidence is the candidate set. Internationals: the cached national-team summaries
// (pipeline/lib/intl/sources.mjs scanEspn) for the same team within a window.
import { loadIndex, readSummary } from '../ledger/cache.mjs'
import { summarySide, parseScoreboard } from './parse.mjs'
import { yearScoreboardUrl, summaryUrl } from './espn-cache.mjs'

const DAY = 864e5
const t = (d) => Date.parse(d)

export class ClubSquads {
  constructor({ perSide = 3 } = {}) {
    this.perSide = perSide
    this.index = loadIndex()
    this.byTeamSeason = new Map()
    this.byId = new Map()
    for (const e of this.index.events) {
      this.byId.set(String(e.id), e)
      for (const tid of [e.homeId, e.awayId]) {
        const k = `${tid}|${e.season}`
        if (!this.byTeamSeason.has(k)) this.byTeamSeason.set(k, [])
        this.byTeamSeason.get(k).push(e)
      }
    }
    this.sideCache = new Map()
  }
  side(e, teamId) {
    const k = `${e.slug}|${e.id}|${teamId}`
    if (!this.sideCache.has(k)) {
      const s = readSummary(e.slug, e.id)
      this.sideCache.set(k, s.state === 'ok' ? summarySide(s.summary, teamId) : { state: s.state, usable: false, entries: [] })
    }
    return this.sideCache.get(k)
  }
  /** {candidates: Map(id -> {id, name, seen, from}), sources: [event ids], before, after, widened} */
  candidates({ event, teamId, season, date, evidence = [] }) {
    const cand = new Map()
    const add = (id, name, from) => {
      const c = cand.get(id) ?? { id, name: name ?? null, seen: 0, from: new Set() }
      c.seen++; c.from.add(from); if (!c.name && name) c.name = name
      cand.set(id, c)
    }
    for (const ev of evidence) if (ev.id) add(String(ev.id), ev.name, 'evidence')
    const pool = (seasonDelta) => (this.byTeamSeason.get(`${teamId}|${season + seasonDelta}`) ?? []).filter((e) => String(e.id) !== String(event))
    const pick = (list) => {
      const before = list.filter((e) => t(e.date) < t(date)).sort((a, b) => t(b.date) - t(a.date))
      const after = list.filter((e) => t(e.date) >= t(date)).sort((a, b) => t(a.date) - t(b.date))
      const take = (arr) => { const out = []; for (const e of arr) { if (out.length >= this.perSide) break; const s = this.side(e, teamId); if (s.usable) out.push({ e, s }) } return out }
      return { before: take(before), after: take(after) }
    }
    let { before, after } = pick(pool(0))
    let widened = false
    if (before.length + after.length < 2) {
      // Thin season in the cache (or a qualifier club outside the five leagues): borrow the
      // neighbouring seasons. Looser, so the planner forces the eventlog route for these.
      const b2 = pick([...pool(-1), ...pool(1)])
      before = before.concat(b2.before); after = after.concat(b2.after); widened = true
    }
    const sources = []
    for (const { e, s } of [...before, ...after]) {
      sources.push(String(e.id))
      for (const p of s.entries) add(p.id, p.name, String(e.id))
    }
    // Pending summaries in the same season are a sign the set will grow when the harvest lands.
    const pendingNear = pool(0).filter((e) => Math.abs(t(e.date) - t(date)) < 45 * DAY && this.side(e, teamId).state === 'pending').length
    return { candidates: cand, sources, nBefore: before.length, nAfter: after.length, widened, pendingNear }
  }
}

export class IntlSquads {
  constructor() { this.loaded = null }
  async load() {
    if (this.loaded) return this.loaded
    const { scanEspn } = await import('../intl/sources.mjs')
    const { summaries } = scanEspn()
    const byTeam = new Map()
    for (const { j } of summaries) {
      const comp = j.header.competitions[0]
      for (const c of comp.competitors ?? []) {
        const tid = String(c.team?.id ?? c.id)
        if (!byTeam.has(tid)) byTeam.set(tid, [])
        byTeam.get(tid).push({ id: String(j.header.id), slug: j.header.league?.slug ?? null, date: comp.date, j })
      }
    }
    this.loaded = byTeam
    return byTeam
  }
  /** Same team, nearest usable rosters: same slug within 60 days first, then any slug within 400. */
  async candidates({ event, teamId, date, slug, evidence = [], fetcher = null }) {
    const byTeam = await this.load()
    const list = (byTeam.get(String(teamId)) ?? []).filter((m) => m.id !== String(event))
    const cand = new Map()
    const add = (id, name, from) => { const c = cand.get(id) ?? { id, name, seen: 0, from: new Set() }; c.seen++; c.from.add(from); cand.set(id, c) }
    for (const ev of evidence) if (ev.id) add(String(ev.id), ev.name, 'evidence')
    const near = (maxDays, sameSlug) => list.filter((m) => Math.abs(t(m.date) - t(date)) <= maxDays * DAY && (!sameSlug || m.slug === slug))
      .sort((a, b) => Math.abs(t(a.date) - t(date)) - Math.abs(t(b.date) - t(date)))
    const sources = []
    for (const [days, same] of [[60, true], [400, false]]) {
      for (const m of near(days, same)) {
        if (sources.length >= 6 || sources.includes(m.id)) continue
        const s = summarySide(m.j, teamId)
        if (!s.usable) continue
        sources.push(m.id)
        for (const p of s.entries) add(p.id, p.name, m.id)
      }
      if (sources.length >= 3) break
    }
    // Fallback (the opponent in a tournament whose summaries were never pulled): the slug's year
    // scoreboard, then up to 3 of this team's nearest summaries in it. Planned in a dry run.
    let fallback = null, fallbackPending = false
    if (sources.length < 2 && fetcher) {
      const year = new Date(date).getUTCFullYear()
      const sb = await fetcher.get(yearScoreboardUrl(slug, year), 'squad-scoreboard')
      fallback = { scoreboard: yearScoreboardUrl(slug, year), summaries: [] }
      if (sb === undefined) fallbackPending = true
      else {
        const evs = parseScoreboard(sb).filter((e) => e.id !== String(event) && (String(e.homeId) === String(teamId) || String(e.awayId) === String(teamId)))
          .sort((a, b) => Math.abs(t(a.date) - t(date)) - Math.abs(t(b.date) - t(date))).slice(0, 3)
        for (const e of evs) {
          if (sources.includes(e.id)) continue
          const j = await fetcher.get(summaryUrl(slug, e.id), 'squad-summary')
          fallback.summaries.push(e.id)
          if (j === undefined) { fallbackPending = true; continue }
          const s = summarySide(j, teamId)
          if (!s.usable) continue
          sources.push(e.id)
          for (const p of s.entries) add(p.id, p.name, e.id)
        }
      }
    }
    return { candidates: cand, sources, widened: false, pendingNear: 0, fallback, fallbackPending }
  }
}
