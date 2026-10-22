// Parser for UEFA.com's 2001-03 live-era "Match Specific" pages (XSLT-rendered tables), e.g.
//   www.uefa.com/competitions/EURO/FixturesResults/Round=1579/Match=68964/Report=MS.html
// (also Round=1478 WC 2002 qualifiers). Layout:
//   header   td.MatchBoxWTeams (two team links), span.MatchBoxResult "3 - 0", td.MatchBoxInfo scorers
//            ("37' Debono (own)"), then a td.FixturesBody colspan=7: "Qualifying Round - 07 September 2002
//            20:15 (local time)<br />Central - Ljubljana"
//   #Tbl1    two side-by-side tables: td.FixturesTitle team name, rows (shirt | name), "Substitutes",
//            bench rows, "Coach", coach; then an officials table (Referee / Assistant Referee /
//            Fourth Official / Assistant Referee, titles row then values row)
//   #Tbl2    event rows: minute | icon | shirt(s) | name(s) | team. Icons: goals.gif, goals_O.gif (own goal,
//            listed under the scorer's own team), goals_P.gif (penalty), yells.gif, reds.gif, substs.gif
//            (two shirts and "X (out)<br />Y (in)").
// A capture taken before kick-off says "Lineups not yet available": parseUefaMs returns {preMatch: true}.
//
//   parseUefaMs(html) -> {preMatch, home, away, score, headerScorers, stageLine, dateText, kickoff, venueText,
//                         teams: [{name, starters:[{shirt,name}], bench:[...], coach}], officials, events, unknownIcons}

const ent = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
const clean = (s) => ent(String(s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/** Text of the element whose opening tag starts at `start` (matching nested tags of the same name). */
function element(html, start, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'gi')
  re.lastIndex = start
  let depth = 0
  for (let m; (m = re.exec(html)); ) {
    if (m[2] === '/') continue // self-closing
    depth += m[1] ? -1 : 1
    if (depth === 0) return html.slice(start, m.index + m[0].length)
  }
  return html.slice(start)
}

function divById(html, id) {
  const i = html.search(new RegExp(`<div id="${id}"`))
  return i < 0 ? '' : element(html, i, 'div')
}

const rowsOf = (tableHtml) => [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>|<td([^>]*)\/>/gi)].map((c) => ({ attrs: c[1] ?? c[3] ?? '', html: c[2] ?? '' })))

function parseTeamTable(tbl) {
  const t = { name: '', starters: [], bench: [], coach: '' }
  let section = 'starters'
  for (const cells of rowsOf(tbl)) {
    if (cells.length === 1 && /FixturesTitle/.test(cells[0].attrs)) {
      const txt = clean(cells[0].html)
      if (!t.name) t.name = txt
      else if (/^Substitutes/i.test(txt)) section = 'bench'
      else if (/^Coach/i.test(txt)) section = 'coach'
      continue
    }
    if (section === 'coach') {
      if (cells.length) t.coach = clean(cells.map((c) => c.html).join(' '))
      continue
    }
    if (cells.length >= 2 && /FixturesBody/.test(cells[0].attrs)) {
      const shirt = Number(clean(cells[0].html))
      const name = clean(cells[1].html)
      if (name) t[section].push({ shirt: Number.isFinite(shirt) && shirt > 0 ? shirt : null, name })
    }
  }
  return t
}

function iconType(src) {
  const f = (src.match(/icons\/([\w-]+)\.gif/i)?.[1] ?? '').toLowerCase()
  if (/^goals?_o$/.test(f)) return 'og'
  if (/^goals?_p$/.test(f)) return 'pen'
  if (/^goals?$/.test(f)) return 'goal'
  if (/^(yellred|yellowred|yells?_?r|redyell|y2r|2yell)/.test(f)) return 'yellow-red'
  if (/^yell/.test(f)) return 'yellow'
  if (/^red/.test(f)) return 'red'
  if (/^subst/.test(f)) return 'sub'
  return 'unknown:' + f
}

function parseMinute(s) {
  const m = clean(s).match(/(\d+)\s*(?:\+\s*(\d+))?/)
  return m ? { min: Number(m[1]), added: m[2] ? Number(m[2]) : undefined, raw: clean(s) } : { min: null, raw: clean(s) }
}

export function parseUefaMs(html) {
  const out = { preMatch: false, teams: [], events: [], officials: {}, unknownIcons: [] }
  const names = [...html.matchAll(/class="MatchBoxWTeams"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => clean(m[1]))
  ;[out.home, out.away] = names
  out.score = clean(html.match(/<span class="MatchBoxResult">([\s\S]*?)<\/span>/)?.[1] ?? '')
  const info = [...html.matchAll(/<td align="(left|right)" class="MatchBoxInfo"[^>]*>([\s\S]*?)<\/td>/g)]
  out.headerScorers = { home: [], away: [] }
  for (const [, side, cell] of info) {
    for (const part of cell.split(/<br\s*\/?>/i)) {
      const t = clean(part)
      if (t) out.headerScorers[side === 'left' ? 'home' : 'away'].push(t)
    }
  }
  // stage / date / venue line
  const dl = [...html.matchAll(/<td class="FixturesBody"[^>]*colspan="7"[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]).find((x) => /\d{4}/.test(x))
  if (dl) {
    const [a, b] = dl.split(/<br\s*\/?>/i)
    const t = clean(a)
    const m = t.match(/^(.*?)\s*-?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*(.*)$/)
    if (m) {
      out.stageLine = m[1].replace(/\s*-\s*$/, '').trim()
      out.dateText = `${m[2]} ${m[3]} ${m[4]}`
      out.kickoff = m[5].trim() || null
    } else out.stageLine = t
    out.venueText = clean(b ?? '') || null
  }
  // pre-match template (e.g. Georgia v Russia 2002-10-12, abandoned): the stage, date, kick-off and venue sit in a
  // centred MatchBoxInfo cell, and the result box holds the kick-off time ("20:00")
  if (!out.dateText) {
    const c = html.match(/<td class="MatchBoxInfo"[^>]*align="center"[^>]*>([\s\S]*?)<\/td>/)?.[1]
    const parts = (c ?? '').split(/<br\s*\/?>/i).map(clean)
    const di = parts.findIndex((x) => /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(x))
    if (di >= 0) {
      out.stageLine ??= parts.slice(0, di).join(' - ') || undefined
      out.dateText = parts[di]
      out.kickoff ??= parts[di + 1] || null
      out.venueText ??= parts[di + 2] || null
    }
  }
  out.noResult = /^\d{1,2}:\d{2}$/.test(out.score)
  if (/Lineups not yet available/i.test(html)) {
    out.preMatch = true
    return out
  }
  const t1 = divById(html, 'Tbl1')
  if (t1) {
    // the two team tables are the first two inner <table width="17x"> blocks
    const starts = [...t1.matchAll(/<table width="17\d"/g)].map((m) => m.index)
    out.teams = starts.slice(0, 2).map((s) => parseTeamTable(element(t1, s, 'table')))
    // officials table: alternating title rows and value rows
    const offStart = t1.search(/<td class="FixturesTitle"[^>]*>\s*Referee/)
    if (offStart >= 0) {
      const tblStart = t1.lastIndexOf('<table', offStart)
      let titles = null
      for (const cells of rowsOf(element(t1, tblStart, 'table'))) {
        const txt = cells.map((c) => clean(c.html))
        if (cells.every((c) => /FixturesTitle/.test(c.attrs)) && txt.some(Boolean)) titles = txt
        else if (titles && cells.some((c) => /FixturesBody/.test(c.attrs))) {
          txt.forEach((v, i) => {
            const k = (titles[i] || '').toLowerCase()
            if (!k || !v) return
            ;(out.officials[k] ??= []).push(v)
          })
          titles = null
        }
      }
    }
  }
  const t2 = divById(html, 'Tbl2')
  for (const cells of rowsOf(t2)) {
    if (cells.length < 5) continue
    const img = cells[1].html.match(/<img[^>]*src="([^"]+)"/i)?.[1] ?? ''
    const type = iconType(img)
    if (type.startsWith('unknown')) out.unknownIcons.push(img)
    const shirts = cells[2].html.split(/<br\s*\/?>/i).map((x) => Number(clean(x))).filter((x) => Number.isFinite(x) && x > 0)
    const people = cells[3].html.split(/<br\s*\/?>/i).map((x) => clean(x)).filter(Boolean)
    const team = clean(cells[4].html)
    const ev = { ...parseMinute(cells[0].html), type, team }
    if (type === 'sub') {
      const outP = people.find((p) => /\(out\)/.test(p)) ?? people[0]
      const inP = people.find((p) => /\(in\)/.test(p)) ?? people[1]
      ev.out = { shirt: shirts[0] ?? null, name: (outP ?? '').replace(/\s*\(out\)\s*/, '').trim() }
      ev.in = { shirt: shirts[1] ?? null, name: (inP ?? '').replace(/\s*\(in\)\s*/, '').trim() }
    } else {
      ev.shirt = shirts[0] ?? null
      ev.name = people[0] ?? ''
    }
    out.events.push(ev)
  }
  out.events.reverse() // page lists latest first
  return out
}
