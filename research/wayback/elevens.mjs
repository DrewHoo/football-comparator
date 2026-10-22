// Parser for 11v11.com match pages (2012-2016 markup, read from Wayback):
//   www.11v11.com/matches/<home>-v-<away>-<dd>-<month>-<yyyy>-<id>/
// Blocks: div.headers (teams, score), div.goals, div.lineup (Starting lineup), div.substitutions,
// div.cards, div.lineup (On the bench). Each block has div.home and div.away.
//   node elevens.mjs <timestamp> <url>
import { raw, stats } from './wb.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim()
const sides = (blk) => {
  const a = blk.indexOf('<div class="away">')
  return [blk.slice(0, a), blk.slice(a)]
}
function block(html, cls, nth = 0) {
  let at = -1
  for (let k = 0; k <= nth; k++) at = html.indexOf(`<div class="${cls}">`, at + 1)
  if (at < 0) return null
  const end = html.indexOf('<!-- end .', at)
  return html.slice(at, end > 0 ? end : at + 20000)
}
export function parseElevens(html) {
  const r = { home: {}, away: {} }
  const hd = block(html, 'headers') ?? ''
  const [hh, ha] = sides(hd)
  r.home.team = clean(hh.match(/<a [^>]*>([^<]+)<\/a>/)?.[1] ?? '')
  r.away.team = clean(ha.match(/<a [^>]*>([^<]+)<\/a>/)?.[1] ?? '')
  r.home.score = Number(hh.match(/class="score">(\d+)/)?.[1])
  r.away.score = Number(ha.match(/class="score">(\d+)/)?.[1])
  const goals = block(html, 'goals')
  const subs = block(html, 'substitutions')
  const cards = block(html, 'cards')
  const xi = block(html, 'lineup', 0)
  const bench = block(html, 'lineup', 1)
  const players = (s) => [...(s ?? '').matchAll(/<div class="player[^"]*"[^>]*>\s*(?:<span class="position">([^<]*)<\/span>)?\s*<a href="\/players\/([^"]+)\/">([^<]+)<\/a>/g)].map((m) => ({ name: clean(m[3]), position: m[1] ?? null, slug: m[2] }))
  for (const [i, side] of [[0, 'home'], [1, 'away']]) {
    r[side].goals = goals ? [...sides(goals)[i].matchAll(/<tr>\s*<td>([^<]*)<\/td>\s*<td class="goal-qualifiers">([\s\S]*?)<\/td>\s*<td class="time">([^<]*)<\/td>/g)].map((m) => ({ player: clean(m[1]), minute: clean(m[3]), qualifiers: clean(m[2]) || undefined })) : []
    r[side].starters = xi ? players(sides(xi)[i]) : []
    r[side].bench = bench ? players(sides(bench)[i]) : []
    r[side].subs = subs ? [...sides(subs)[i].matchAll(/<span class="substitute">([^<]*)<\/span>\s*for\s*<span class="substituted">([^<]*)<\/span><\/td>\s*<td class="time">([^<]*)<\/td>/g)].map((m) => ({ on: clean(m[1]), off: clean(m[2]) || null, minute: clean(m[3]) })) : []
    r[side].cards = cards ? [...sides(cards)[i].matchAll(/<td>([^<]*)<\/td>\s*<td class="time">([^<]*)<\/td>\s*<td class="type"><span class="card (\w+)/g)].map((m) => ({ player: clean(m[1]), minute: clean(m[2]), card: m[3] })) : []
  }
  // self-checks a harvester should log, not trust
  r.warnings = []
  for (const s of ['home', 'away']) {
    if (r[s].starters.length !== 11) r.warnings.push(`${s}: ${r[s].starters.length} starters`)
    if (!r[s].starters.some((p) => /Goalkeeper/.test(p.position ?? ''))) r.warnings.push(`${s}: no goalkeeper in XI`)
    if (r[s].subs.some((x) => !x.off)) r.warnings.push(`${s}: substitution with blank 'off' player`)
    if (r[s].goals.length !== r[s].score && !Number.isNaN(r[s].score)) r.warnings.push(`${s}: ${r[s].goals.length} goal rows vs score ${r[s].score}`)
  }
  return r
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [ts, url] = process.argv.slice(2)
  const p = await raw(ts, url)
  console.log(JSON.stringify(parseElevens(p.text), null, 1))
  console.error(JSON.stringify(stats))
}
