// Parsers for FIFA.com's 2007-era World Cup archive pages (deleted from fifa.com; read from Wayback).
//   parseFifaIndex(html)  -> [{date, home, score, away, matchId}]   (preliminary=N/index.html)
//   parseFifaReport(html) -> {competition, home, away, score, ht, date, venue, kickoff, attendance,
//                             goals:[{player, team, minute}], teams:[{name, starters:[...], bench:[...], coach}],
//                             cautions, sentOff, referee}
//   node fifa.mjs <timestamp> <url>   prints the parsed report as JSON
import { raw, stats } from './wb.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

export function parseFifaIndex(html) {
  const out = []
  for (const tr of html.split(/<tr[\s>]/i).slice(1)) {
    const id = tr.match(/match=(\d+)/)
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => clean(c[1]))
    if (!id || cells.length < 4) continue
    const si = cells.findIndex((c) => /^\d+:\d+/.test(c))
    if (si < 2) continue
    out.push({ date: cells[si - 2], home: cells[si - 1], score: cells[si], away: cells[si + 1], matchId: id[1] })
  }
  return out
}

function parsePlayers(ulHtml) {
  return [...ulHtml.matchAll(/<li>[\s\S]*?\[(\d+)\][\s\S]*?<span>([\s\S]*?)<\/span>/g)].map((m) => {
    const t = clean(m[2])
    const off = t.match(/\(-(\d+)'?\)/)
    const on = t.match(/\(\+(\d+)'?\)/)
    return {
      shirt: Number(m[1]),
      name: t.replace(/\((GK|C|[+-]\d+'?)\)/g, '').replace(/\s+/g, ' ').trim(),
      gk: /\(GK\)/.test(t),
      captain: /\(C\)/.test(t),
      off: off ? Number(off[1]) : null,
      on: on ? Number(on[1]) : null,
    }
  })
}

export function parseFifaReport(html) {
  // 2007-era archive pages wrap the report in div.mrep; the 2010-era ones in div.FASTReport / hdTeams.
  const anchors = ['class="mrep"', 'FASTReport', 'class="hdTeams"'].map((a) => html.indexOf(a)).filter((i) => i >= 0)
  const mrep = html.slice(anchors.length ? Math.min(...anchors) : 0)
  const r = {}
  r.competition = clean(html.match(/<div class=" ?title ?"><h1>([\s\S]*?)<\/h1>/)?.[1] ?? '')
  const teams = clean(mrep.match(/class="bold large teams">([\s\S]*?)<\/div>/)?.[1] ?? '')
  ;[r.home, r.away] = teams.split(' - ').map((s) => s.trim())
  const res = clean(mrep.match(/class="bold large result">([\s\S]*?)<\/div>/)?.[1] ?? '')
  r.result = res
  // info table: header labels (Match | Date | Venue / Stadium | Time | Attendance) vary by edition, so map by label
  const tbl = mrep.match(/<table>([\s\S]*?)<\/table>/)?.[1] ?? ''
  const heads = [...(tbl.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] ?? '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => clean(c[1]).toLowerCase())
  const tds = [...(tbl.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => clean(c[1]))
  const by = (re) => { const i = heads.findIndex((h) => re.test(h)); return i >= 0 ? tds[i] : undefined }
  r.matchNo = by(/^match/); r.date = by(/date/); r.venue = by(/venue|stadium/); r.kickoff = by(/time/); r.attendance = by(/attendance/)
  const goalsBlock = mrep.match(/Goals scored<\/div>([\s\S]*?)<\/ul>/)?.[1] ?? ''
  r.goals = [...goalsBlock.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((g) => {
    const t = clean(g[1]).replace(/,$/, '')
    const m = t.match(/^(.*?)\s*\((\w{3})\)\s*(\d+)'?(?:\s*\+(\d+))?(.*)$/)
    return m ? { player: m[1], team: m[2], minute: Number(m[3]), stoppage: m[4] ? Number(m[4]) : undefined, note: m[5].trim() || undefined, raw: t } : { raw: t }
  })
  r.teams = mrep.split(/class="lnupTeam( away)?"/).filter((x) => x && x !== ' away').slice(1).map((blk) => {
    const name = clean(blk.match(/class="bold medium">([\s\S]*?)<\/div>/)?.[1] ?? '')
    const uls = blk.split(/<ul>/).slice(1)
    const starters = parsePlayers(uls[0] ?? '')
    const bench = parsePlayers(uls[1] ?? '')
    const coach = clean(blk.match(/Coach\s*<\/div>\s*(?:<[^>]+>\s*)*([^<]+)/)?.[1] ?? '')
    return { name, starters, bench, coach }
  })
  // Some 2002/2006 pages carry a third, stray lineup block from another fixture or a club (Morocco v Gambia
  // 2000-04-22 lists "Raja Casablanca"; Sweden v Bulgaria 2005-09-03 lists Mexico). Keep the blocks named in the
  // header, in header order, and report the rest so the record can warn.
  if (r.teams.length > 2 && r.home && r.away) {
    const key = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
    const h = r.teams.find((t) => key(t.name) === key(r.home))
    const a = r.teams.find((t) => t !== h && key(t.name) === key(r.away))
    if (h && a) {
      r.strayTeams = r.teams.filter((t) => t !== h && t !== a).map((t) => ({ name: t.name, players: [...t.starters, ...t.bench].map((p) => p.name) }))
      r.teams = [h, a]
    }
  }
  const after = clean(mrep.slice(mrep.lastIndexOf('lnupTeam')))
  r.cautions = after.match(/Cautions (.*?) Sent off/)?.[1]?.trim() ?? null
  const all = clean(mrep)
  r.referee = (after.match(/Referee (.*?) Assistant/) ?? all.match(/Match Officials Referee (.*?) Assistant/))?.[1]?.trim() ?? null
  if (!r.cautions) r.cautions = after.match(/Cautions (.*?) (?:Expulsions|Sent off)/)?.[1]?.trim() ?? null
  const so = after.match(/(?:Expulsions|Sent off)\s*(.*?)\s*(?:a\.e\.t\.|Match Officials|$)/)?.[1]?.trim()
  r.sentOff = so || null
  return r
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [ts, url] = process.argv.slice(2)
  const p = await raw(ts, url)
  console.log(JSON.stringify(/index\.html$/.test(url) ? parseFifaIndex(p.text) : parseFifaReport(p.text), null, 1))
  console.error(JSON.stringify(stats))
}
