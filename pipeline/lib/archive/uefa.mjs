// Copied from research/wayback/uefa.mjs. Pipeline fix: a lineup row with an empty home half (away has more subs)
// was credited to home; it now goes to away.
// Parser for UEFA.com's 2011-2016 history match pages:
//   www.uefa.com/<comp>/season=YYYY/matches/round=R/match=M/postmatch/lineups/index.html
// The lineups box (div.box.Lineup) is static HTML: rows of tr.people, two players per row (home | away),
// each "shirt | name (GK) (C) | events" where events are icon+minute pairs (Goal, Yellow Card, Red Card,
// Substitution). Section headers: Substitutes, Coach, Referee, Assistant referees, Fourth official.
// The match header (div#matchbox) gives round, date, kickoff, stadium, city, score, scorers.
//   node uefa.mjs <timestamp> <url>
import { raw, stats } from './wb.mjs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

function cellPlayer(shirtTd, nameTd, evTd) {
  // 2013+ captures: <span>Name</span>; 2011-12 captures: <a class="pllinehe" href="#">Name</a>
  const name = clean(nameTd.match(/<span>([\s\S]*?)<\/span>/)?.[1] ?? nameTd.match(/<a class="pllinehe"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? '')
  if (!name) return null
  const tail = clean(nameTd)
  // the alt text says only "Goal" for own goals and penalties; the icon file tells them apart (goals_O.gif own goal,
  // goals_P.gif penalty), so own goals were credited to the scorer's team until 2026-10-22
  const events = [...(evTd ?? '').matchAll(/<img([^>]*?)alt="([^"]+)"\s*\/?>\s*<span class="minbymin">([^<]+)<\/span>/g)].map((e) => {
    const icon = e[1].match(/src="[^"]*\/([^"/]+)"/)?.[1] ?? ''
    const type = /^goals_O\./i.test(icon) ? 'Own goal' : /^goals_P\./i.test(icon) ? 'Goal (penalty)' : e[2]
    return { type, minute: e[3].trim(), icon }
  })
  const pid = (evTd ?? '').match(/id="p(\d+)"/)?.[1]
  return { shirt: Number(clean(shirtTd)) || null, name, gk: /\(GK\)/.test(tail), captain: /\(C\)/.test(tail), uefaId: pid ?? null, events }
}

export function parseUefaLineups(html) {
  const out = { header: {}, home: { starters: [], subs: [] }, away: { starters: [], subs: [] }, officials: {} }
  const mb = html.slice(html.indexOf('id="matchbox"'), html.indexOf('id="matchbox"') + 6000)
  out.header.venueLine = clean(mb.match(/id="VenueDetails">([\s\S]*?)<\/div>/)?.[1] ?? '')
  out.header.home = clean(mb.match(/id="teamHomeName">([\s\S]*?)<\/div>/)?.[1] ?? '')
  out.header.away = clean(mb.match(/id="teamAwayName">([\s\S]*?)<\/div>/)?.[1] ?? '')
  out.header.score = clean(mb.match(/id="resultsDetails">([\s\S]*?)<\/div>/)?.[1] ?? '')
  const scorers = (id) => [...(mb.match(new RegExp(`id="${id}">([\\s\\S]*?)</ul>`))?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => clean(x[1])).filter(Boolean)
  out.header.homeScorers = scorers('resultHome')
  out.header.awayScorers = scorers('resultAway')
  const s = html.indexOf('class="box Lineup')
  if (s < 0) return null
  const blk = html.slice(s, s + 80000)
  let section = 'starters'
  // Walk top-level rows of the lineup table in order. Inner name tables are <table class="pname ...">,
  // so split on '<tr' and re-join rows that belong to an inner table.
  const rows = blk.split(/<tr(?=[\s>])/).slice(1)
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const head = r.match(/^[^>]*>\s*<td colspan="\d+"[^>]*>([\s\S]*?)<\/td>/)
    if (head) {
      const t = clean(head[1])
      if (/^Substitutes/i.test(t)) section = 'subs'
      else if (/^Coach/i.test(t)) section = 'coach'
      else if (/^Referee/i.test(t)) section = 'referee'
      else if (/^Assistant/i.test(t)) section = 'assistants'
      else if (/^Fourth/i.test(t)) section = 'fourth'
      continue
    }
    if (!/^ class="people"/.test(r)) continue
    // a people row = this chunk + the inner-table chunks that follow (each name cell holds a 1-row table)
    let row = r
    while (i + 1 < rows.length && !/^ class="people"/.test(rows[i + 1]) && !/^[^>]*>\s*<td colspan/.test(rows[i + 1])) row += '<tr' + rows[++i]
    const tds = []
    // top-level cells: shirt (td.c.w18), name (td.l.w160 ... </table></td>), events (td.plev, self-closing or with content)
    const re = /<td class="c w18">([\s\S]*?)<\/td>|<td class="l w160">([\s\S]*?<\/table>)\s*<\/td>|<td class="l w155 plev" id="p\d+"\s*(?:\/>|>([\s\S]*?)<\/td>)|<td class="l[^"]*"(?: colspan="\d+")?>((?:(?!<td)[\s\S])*?)<\/td>/g
    for (const m of row.matchAll(re)) tds.push(m)
    if (section === 'starters' || section === 'subs') {
      const cells = tds.filter((m) => m[1] !== undefined || m[2] !== undefined || /plev/.test(m[0]))
      const triples = []
      for (let k = 0; k + 2 < cells.length + 1; k += 3) if (cells[k]) triples.push([cells[k], cells[k + 1], cells[k + 2]])
      // a row whose home half is empty starts with three self-closing cells (<td /><td /><td />): its only player is away
      const awayOnly = /^ class="people">\s*<td\s*\/>\s*<td\s*\/>\s*<td\s*\/>/.test(row)
      triples.forEach(([a, b, c], i) => {
        const side = awayOnly ? 1 : i
        if (!a || !b) return
        const pl = cellPlayer(a[1] ?? '', b[2] ?? '', c ? c[0] : '')
        if (pl) (side === 0 ? out.home : out.away)[section].push(pl)
      })
    } else {
      const txt = clean(row.replace(/<td class="c w18">[\s\S]*?<\/td>/g, ' | '))
      ;(out.officials[section] ??= []).push(txt)
    }
  }
  return out
}

// Fallback for a history match whose lineups and root pages were never archived but whose 2019 statistics and
// commentary subpages were (Euro 2000: Northern Ireland 2-2 Moldova, match 54924). Same output shape as
// parseUefaLineups, plus `inferred` notes:
//   statistics page  "Players Statistics": per team, 17 rows "n | Player Name | GS | YC | RC" (n is the row, not
//                    the shirt). Rows 1-11 are taken as the starters, 12+ as substitutes; the caller checks that
//                    every commentary sub-off is in rows 1-11 and every sub-on in 12+.
//   commentary page  "Minute By Minute Commentary Events": "88 McCarthy (in) - Gillespie (out) (Northern Ireland)",
//                    "87 Kennedy (Northern Ireland) is booked.", "65 Curtean (Moldova) is shown a second yellow card
//                    and is dismissed.", "63 Lennon (Northern Ireland) scores!"
export function parseUefaStatsPages(statsHtml, commentaryHtml) {
  const out = parseUefaHeader(statsHtml)
  out.inferred = []
  const box = statsHtml.slice(statsHtml.indexOf('Players Statistics'))
  const teams = [...box.matchAll(/<h3 class="medTitle t10">([\s\S]*?)<\/h3>\s*<table[^>]*>([\s\S]*?)<\/table>/g)].slice(0, 2).map((m) => ({
    team: clean(m[1]),
    rows: [...m[2].matchAll(/<tr[^>]*>\s*<td>(\d+)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>\s*<td>(\d+)<\/td>/g)].map((r) => ({ n: Number(r[1]), name: clean(r[2]), gs: Number(r[3]), yc: Number(r[4]), rc: Number(r[5]) })),
  }))
  if (teams.length !== 2 || teams.some((t) => t.rows.length < 11)) return null
  const sideOf = (team) => (clean(team) === out.header.home ? 'home' : clean(team) === out.header.away ? 'away' : null)
  const players = { home: [], away: [] }
  for (const t of teams) {
    const side = sideOf(t.team)
    if (!side) return null
    for (const r of t.rows) players[side].push({ shirt: null, name: r.name, gk: false, captain: false, uefaId: null, events: [], row: r })
  }
  const fold = (s) => clean(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const find = (side, surname) => {
    const k = fold(surname)
    const hits = players[side].filter((p) => fold(p.name) === k || fold(p.name).split(' ').slice(1).join(' ') === k || fold(p.name).endsWith(' ' + k))
    return hits.length === 1 ? hits[0] : null
  }
  const ev = commentaryHtml.slice(commentaryHtml.indexOf('Minute By Minute'))
  const items = [...ev.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => clean(m[1])).filter((t) => /^\d+/.test(t))
  const lines = items.length ? items : (clean(ev).match(/\d+\s+[^]*?(?=\s\d+\s+[A-Z]|\sLegend:|$)/g) ?? [])
  const problems = []
  for (const line of lines) {
    let m
    const add = (side, who, type, minute) => {
      const p = side && find(side, who)
      if (p) p.events.push({ type, minute })
      else problems.push(`commentary "${line}": ${who} not found in the ${side ?? '?'} squad`)
      return p
    }
    if ((m = line.match(/^(\d+(?:\+\d+)?)\s+(.+?) \(in\) - (.+?) \(out\) \((.+?)\)/))) {
      const side = sideOf(m[4])
      const pin = add(side, m[2], 'Substitution', m[1])
      const pout = add(side, m[3], 'Substitution', m[1])
      if (pin && pin.row.n <= 11) problems.push(`sub-on ${pin.name} is row ${pin.row.n}, inside the first 11`)
      if (pout && pout.row.n > 11) problems.push(`sub-off ${pout.name} is row ${pout.row.n}, outside the first 11`)
    } else if ((m = line.match(/^(\d+(?:\+\d+)?)\s+(.+?) \((.+?)\) (scores|is booked|is shown a yellow card|is shown a second yellow card|is shown a red card|is sent off)(.*)$/))) {
      const what = m[4] + m[5]
      const type = /scores/.test(what) ? (/own goal/i.test(what) ? 'Own goal' : /penalty/i.test(what) ? 'Goal (penalty)' : 'Goal') : /second yellow/.test(what) ? 'Yellow-Red card' : /red card|sent off/.test(what) ? 'Red card' : 'Yellow card'
      add(sideOf(m[3]), m[2], type, m[1])
    } else problems.push(`commentary line not understood: "${line}"`)
  }
  for (const side of ['home', 'away']) {
    for (const p of players[side]) {
      p.events.sort((a, b) => parseInt(a.minute) - parseInt(b.minute))
      const goals = p.events.filter((e) => /goal/i.test(e.type)).length
      const yc = p.events.filter((e) => /^yellow card/i.test(e.type)).length
      const rc = p.events.filter((e) => /red/i.test(e.type)).length
      if (goals !== p.row.gs) problems.push(`${p.name}: statistics GS ${p.row.gs}, commentary goals ${goals}`)
      if (rc !== p.row.rc) problems.push(`${p.name}: statistics RC ${p.row.rc}, commentary red ${rc}`)
      // a second-yellow dismissal shows as YC 1 + RC 1 in the statistics; the first booking may be missing from the commentary
      if (yc !== p.row.yc && !(rc === 1 && p.row.yc === 1 && yc === 0)) problems.push(`${p.name}: statistics YC ${p.row.yc}, commentary yellows ${yc}`)
      if (rc === 1 && p.row.yc === 1 && yc === 0 && p.events.some((e) => /yellow-red/i.test(e.type))) out.inferred.push(`${p.name}: first yellow card not in the commentary (minute unknown)`)
    }
    const rows = players[side]
    out[side] = { starters: rows.filter((p) => p.row.n <= 11).map(({ row, ...p }) => p), subs: rows.filter((p) => p.row.n > 11).map(({ row, ...p }) => p) }
  }
  out.problems = problems
  out.inferred.unshift('lineups rebuilt from the 2019 statistics page (squad rows 1-11 taken as starters, 12+ as substitutes; no shirt numbers, goalkeeper or captain flags) and the commentary page (substitutions, goals, cards)')
  return out
}

function parseUefaHeader(html) {
  const out = { header: {}, home: { starters: [], subs: [] }, away: { starters: [], subs: [] }, officials: {} }
  const mb = html.slice(html.indexOf('id="matchbox"'), html.indexOf('id="matchbox"') + 6000)
  out.header.venueLine = clean(mb.match(/id="VenueDetails">([\s\S]*?)<\/div>/)?.[1] ?? '')
  out.header.home = clean(mb.match(/id="teamHomeName">([\s\S]*?)<\/div>/)?.[1] ?? '')
  out.header.away = clean(mb.match(/id="teamAwayName">([\s\S]*?)<\/div>/)?.[1] ?? '')
  out.header.score = clean(mb.match(/id="resultsDetails">([\s\S]*?)<\/div>/)?.[1] ?? '')
  const scorers = (id) => [...(mb.match(new RegExp(`id="${id}">([\\s\\S]*?)</ul>`))?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => clean(x[1])).filter(Boolean)
  out.header.homeScorers = scorers('resultHome')
  out.header.awayScorers = scorers('resultAway')
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [ts, url] = process.argv.slice(2)
  const p = await raw(ts, url)
  console.log(JSON.stringify(parseUefaLineups(p.text), null, 1))
  console.error(JSON.stringify(stats))
}
