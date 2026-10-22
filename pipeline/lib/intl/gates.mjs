// Known-answer gates for the international ledger (`build-intl.mjs --gate`).
// status: pass | fail | pending (the data the gate needs isn't on disk yet; never counted as a pass)
import { readCsv, P, ARCHIVE_EXPECTED } from './io.mjs'

const RONALDO = 'ip:cronaldo-intlg', MESSI = 'ip:messi-intlg'
const TOURN = (slug, from, to, label) => ({ slug, from, to, label })
const RONALDO_TOURNAMENTS = [
  [TOURN('uefa.euro', '2004-06-01', '2004-07-31', 'Euro 2004'), 2], [TOURN('fifa.world', '2006-06-01', '2006-07-31', 'WC 2006'), 1],
  [TOURN('uefa.euro', '2008-06-01', '2008-07-31', 'Euro 2008'), 1], [TOURN('fifa.world', '2010-06-01', '2010-07-31', 'WC 2010'), 1],
  [TOURN('uefa.euro', '2012-06-01', '2012-07-31', 'Euro 2012'), 3], [TOURN('fifa.world', '2014-06-01', '2014-07-31', 'WC 2014'), 1],
  [TOURN('uefa.euro', '2016-06-01', '2016-07-31', 'Euro 2016'), 3], [TOURN('fifa.world', '2018-06-01', '2018-07-31', 'WC 2018'), 4],
  [TOURN('uefa.euro', '2021-06-01', '2021-07-31', 'Euro 2020'), 5], [TOURN('fifa.world', '2022-11-01', '2022-12-31', 'WC 2022'), 1],
]
const MESSI_WC = [
  [TOURN('fifa.world', '2006-06-01', '2006-07-31', 'WC 2006'), 1], [TOURN('fifa.world', '2014-06-01', '2014-07-31', 'WC 2014'), 4],
  [TOURN('fifa.world', '2018-06-01', '2018-07-31', 'WC 2018'), 1], [TOURN('fifa.world', '2022-11-01', '2022-12-31', 'WC 2022'), 7],
]

function tournamentGoals(rows, list) {
  return list.map(([t, want]) => {
    const rs = rows.filter((r) => r.date >= t.from && r.date <= t.to && r.match_type === 'finals')
    const withEspn = rs.filter((r) => r.sources.espn?.slug === t.slug)
    const got = withEspn.reduce((s, r) => s + (r.sources.espn.goals ?? 0), 0)
    const ok = got === want && rs.length > 0 // apps without an ESPN summary are reported, not failed
    return { tournament: t.label, want, espn_goals: got, apps: rs.length, apps_with_espn: withEspn.length, ledger_goals: rs.reduce((s, r) => s + (r.goals ?? 0), 0), ok }
  })
}

export function runGates(B, corrReport) {
  const byKey = new Map()
  for (const r of B.rows) (byKey.get(r.player_key) ?? byKey.set(r.player_key, []).get(r.player_key)).push(r)
  const rowsOf = (k) => (byKey.get(k) ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const gates = []
  const gate = (name, status, detail) => gates.push({ name, status, ...detail })
  const sum = (rs, f) => rs.reduce((s, r) => s + (f(r) ?? 0), 0)

  // 1. Ronaldo
  {
    const rs = rowsOf(RONALDO)
    const goals = sum(rs, (r) => r.goals)
    // RSSSF's log stops at 233; Wikidata (Q138338265) adds the 24 Sep 2026 Wales cap Wikipedia counts as 234
    const logged = rs.filter((r) => r.cap_source === 'rsssf'), beyond = rs.filter((r) => r.cap_source !== 'rsssf')
    const beyondOk = beyond.every((r) => r.flags.includes('beyond_rsssf_log')) && (beyond.length === 0 || (beyond.length === 1 && beyond[0].date === '2026-09-24' && beyond[0].opponent === 'Wales'))
    gate('ronaldo_caps_goals', logged.length === 233 && goals === 146 && beyondOk ? 'pass' : 'fail', { want: '233 RSSSF caps, 146 goals; any further row is beyond the log with a source (Wikipedia 234 with the 24 Sep 2026 Wales cap RSSSF lacks)', got: `${rs.length} caps (${logged.length} RSSSF${beyond.length ? ', ' + beyond.map((r) => `${r.date} v ${r.opponent} from ${r.cap_source} ${r.sources.wikidata?.item ?? ''}`).join(', ') : ''}), ${goals} goals` })
    const d = rs[0]
    gate('ronaldo_debut', d?.date === '2003-08-20' && d?.opponent === 'Kazakhstan' ? 'pass' : 'fail', { want: '2003-08-20 v Kazakhstan', got: d ? `${d.date} v ${d.opponent} (cap ${d.cap_no}, ${d.cap_source})` : null })
    const r = rs.find((x) => x.date === '2004-10-13')
    const a = r?.sources.archive
    const st = !r ? 'fail' : !a ? 'pending' : r.goals === 2 && a.goals === 2 && a.started === true && a.off === 85 ? 'pass' : 'fail'
    gate('ronaldo_russia_2004_archive', st, { want: 'v Russia 2004-10-13: 2 goals (39, 69), started, off 85 in the FIFA archive', got: r ? { goals: r.goals, field_source: r.field_source, archive: a ?? null, espn_goals: r.sources.espn?.goals ?? null, martj42: r.sources.martj42?.goals ?? null } : null })
    const t = tournamentGoals(rs, RONALDO_TOURNAMENTS)
    gate('ronaldo_tournament_goals_espn', t.every((x) => x.ok) ? 'pass' : 'fail', { want: '2,1,1,1,3,1,3,4,5,1 (Euro 2004 .. WC 2022)', got: t.map((x) => x.espn_goals).join(','), by_tournament: t })
  }
  // 2. Messi
  {
    const rs = rowsOf(MESSI)
    const goals = sum(rs, (r) => r.goals)
    gate('messi_caps_goals', rs.length === 207 && goals === 125 ? 'pass' : 'fail', { want: '207 caps, 125 goals (RSSSF; Wikipedia 208/126 with the 6 Oct 2026 Benin friendly)', got: `${rs.length} caps, ${goals} goals` })
    const d = rs[0]
    const dateOk = d?.date === '2005-08-17' && d?.opponent === 'Hungary'
    const minsOk = d?.on_min === 64 && d?.off_min === 65 && d?.off_reason === 'red'
    gate('messi_debut', !dateOk ? 'fail' : minsOk ? 'pass' : d.on_min == null ? 'pending' : 'fail', {
      want: '2005-08-17 v Hungary, on 64\', off 65\' (red card)', got: d ? { date: d.date, opponent: d.opponent, on: d.on_min, off: d.off_min, off_reason: d.off_reason, sources: Object.keys(d.sources) } : null,
      note: dateOk && !minsOk ? 'date and opponent pass (RSSSF). Minutes are not on disk: ESPN summary 184000 lists only the scorers (Rodríguez, Heinze, Torghelle) and the cached core roster for Argentina lists the same two. One ESPN athlete-store request fills it: core .../events/184000/competitions/184000/competitors/202/roster/45843/statistics/0' : undefined,
    })
    const t = tournamentGoals(rs, MESSI_WC)
    gate('messi_world_cup_goals_espn', t.every((x) => x.ok) ? 'pass' : 'fail', { want: '1/4/1/7 (WC 2006/2014/2018/2022)', got: t.map((x) => x.espn_goals).join('/'), by_tournament: t, note: 'apps_with_espn < apps where ESPN\'s summary is empty (2014 SF v Netherlands); goals still come from the other rows' })
  }
  // 3. pre-2001 debutants: first 50 caps from RSSSF, archive lineups attached for WC 2002 qualifiers
  for (const [key, label] of [['ip:beckham-intl', 'Beckham'], ['ip:nistelrooij-intlg', 'Van Nistelrooy']]) {
    const rs = rowsOf(key).filter((r) => r.cap_source === 'rsssf').sort((a, b) => a.cap_no - b.cap_no).slice(0, 50)
    const wcq = rs.filter((r) => r.tournament === 'FIFA World Cup qualification' && r.date >= '2000-01-01' && r.date <= '2001-12-31')
    const harvested = wcq.filter((r) => (B.spine.byId.get(r.match_id)?.ids.archive ?? []).some((x) => x.source === 'fifa2002'))
    const attached = harvested.filter((r) => r.sources.archive?.family === 'fifa2002')
    const types = {}
    for (const r of rs) types[r.match_type] = (types[r.match_type] ?? 0) + 1
    const st = rs.length < 50 ? 'fail' : attached.length < harvested.length ? 'fail' : harvested.length < wcq.length ? 'pending' : 'pass'
    gate(`first50_${label.toLowerCase().replace(/ /g, '_')}`, st, {
      want: `first 50 caps from RSSSF; every WC 2002 qualifier among them with the FIFA lineup attached`,
      got: { first50: rs.length, span: rs.length ? `${rs[0].date} .. ${rs.at(-1).date}` : null, by_type: types, wc2002_qualifiers: wcq.length, in_archive_on_disk: harvested.length, archive_attached: attached.length,
        rows: wcq.map((r) => ({ cap: r.cap_no, date: r.date, opponent: r.opponent, archive: r.sources.archive ? `${r.sources.archive.name}: ${r.sources.archive.started ? 'started' : 'sub'} ${r.sources.archive.on}'-${r.sources.archive.off ?? 'end'}, ${r.sources.archive.minutes} min` : null })) },
    })
  }
  // 4. competitive goals v martj42 for the marquee players
  {
    const marquee = readCsv(P.marquee).map((r) => ({ key: `ip:${r.file}`, team: r.team }))
    marquee.push({ key: 'ip:bijtertje-intlg', team: 'Uruguay', note: 'Luis Suárez: RSSSF has a log after all (bijtertje-intlg, 143 caps)' })
    for (const n of [['Vardy', 'England'], ['Lacazette', 'France']]) {
      const p = B.players.find((x) => x.rsssf_slug == null && x.team === n[1] && new RegExp(n[0], 'i').test(x.name))
      marquee.push({ key: p?.player_key ?? `(no rows) ${n[0]}`, team: n[1], note: `${n[0]}: no RSSSF log; partial` })
    }
    const res = marquee.map((m) => {
      const rs = rowsOf(m.key)
      const cmp = rs.filter((r) => r.competitive && r.sources.martj42?.goals != null && r.sources.martj42.side_complete)
      const ledger = sum(cmp, (r) => r.goals), m42 = sum(cmp, (r) => r.sources.martj42.goals)
      const orphan = B.conflicts.filter((c) => c.player_key === m.key && c.kind === 'martj42_goal_without_rsssf_cap' && !c.resolved_by)
      const diffs = cmp.filter((r) => r.goals !== r.sources.martj42.goals).map((r) => `${r.date} v ${r.opponent}: ledger ${r.goals} (${r.field_source.goals}), martj42 ${r.sources.martj42.goals}`)
      return { player: m.key, rows: rs.length, competitive_compared: cmp.length, ledger_goals: ledger, martj42_goals: m42, martj42_goals_without_cap: orphan.length, ok: rs.length > 0 && ledger === m42 && !orphan.length, diffs, note: m.note }
    })
    const withRows = res.filter((r) => r.rows > 0)
    const ok = withRows.filter((r) => r.ok).length
    const noData = res.filter((r) => !r.rows).map((r) => r.note ?? r.player)
    gate('marquee_competitive_goals_v_martj42', ok < withRows.length ? 'fail' : noData.length ? 'pending' : 'pass', {
      want: `${res.length} players, ledger competitive goals = martj42 goalscorers (sides martj42 lists completely)`,
      got: `${ok} of ${withRows.length} players with rows equal; ${noData.length} with no rows on disk (${noData.join('; ')})`,
      mismatches: withRows.filter((r) => !r.ok).map((r) => ({ player: r.player, ledger: r.ledger_goals, martj42: r.martj42_goals, diffs: r.diffs })), players: res })
  }
  // 5. join rates
  {
    const js = B.joinStats
    const rate = (s) => (s ? +(s.joined / Math.max(1, s.total)).toFixed(4) : null)
    const th = { rsssf: 0.95, archive: 0.97, espn: 0.9 }
    const st = Object.entries(th).every(([k, v]) => rate(js[k]) >= v) ? 'pass' : 'fail'
    gate('join_rates', st, { thresholds: th, got: Object.fromEntries(Object.entries(js).map(([k, v]) => [k, { ...v, rate: rate(v) }])) })
  }
  // 6. archive harvest progress (informational, pending until complete)
  {
    const c = B.archive.counts
    const done = Object.entries(ARCHIVE_EXPECTED).every(([k, n]) => (c[k]?.records ?? 0) >= n)
    gate('archive_harvest_complete', done ? 'pass' : 'pending', { got: Object.fromEntries(Object.entries(ARCHIVE_EXPECTED).map(([k, n]) => [k, `${c[k]?.records ?? 0}/${n}`])) })
  }
  // 7. Wikidata lineups (data/index/wikidata/matches.json, P710 participants) attached as a source
  {
    const js = B.joinStats.wikidata ?? { total: 0, joined: 0 }
    const matchesWithLineup = new Set([...B.wdTms].map((tm) => tm.split('|')[0])).size
    let slotsPaired = 0, slotsProbable = 0, wdOnly = 0
    for (const s of B.identity.slots) if (s.w) { if (s.w.how === 'unpaired') wdOnly++; else { slotsPaired++; if (s.w.how === 'loose') slotsProbable++ } }
    // archive appearances in team-matches where Wikidata lists the side's lineup: how many carry the Wikidata entry
    let den = 0, num = 0
    for (const r of B.rows) {
      if (r.sources.archive?.appeared !== true || !r.match_id) continue
      const sm = B.spine.byId.get(r.match_id)
      const tm = `${r.match_id}|${sm.home === r.team ? 'home' : 'away'}`
      const src = B.srcByTm.get(tm)?.wikidata
      if (!src || !src.m.sides[src.side].lineup) continue
      den++
      if (r.sources.wikidata) num++
    }
    const q = B.qidStats ?? {}
    const known = [['ip:cronaldo-intlg', 'Q11571'], ['ip:messi-intlg', 'Q615'], ['ip:gerrard-intlg', 'Q459830']].map(([k, want]) => ({ player: k, want, got: B.players.find((p) => p.player_key === k)?.wikidata_qid ?? null }))
    const munich = rowsOf('ip:gerrard-intlg').find((r) => r.match_id === '2001-09-01_germany_england')
    const munichOk = munich?.sources.wikidata?.qid === 'Q459830' && munich.sources.archive?.correction === 'intl-0001'
    const rate = den ? num / den : 0
    const ok = js.joined >= 6700 && rate >= 0.97 && known.every((k) => k.got === k.want) && munichOk
    gate('wikidata_lineups', ok ? 'pass' : 'fail', {
      want: '>= 6,700 of 6,790 Wikidata matches joined; >= 97% of archive appearances in sides Wikidata lists carry the Wikidata entry; QIDs Q11571 / Q615 / Q459830 on Ronaldo / Messi / Gerrard; Gerrard\'s Munich row (FIFA\'s "MURPHY Danny" line, intl-0001) carries Wikidata\'s Gerrard',
      got: `${js.joined} of ${js.total} Wikidata matches joined; ${matchesWithLineup} matches (${B.wdTms.size} sides) with Wikidata lineups attached; ${slotsPaired} lineup players matched to an RSSSF/archive/ESPN/martj42 form (${slotsPaired - slotsProbable} exact, ${slotsProbable} probable) and ${wdOnly} Wikidata-only; archive appearances confirmed ${num}/${den} (${(100 * rate).toFixed(1)}%); QIDs added to ${q.rsssf_or_archive_people_with_qid ?? 0} RSSSF/archive people (${q.exact ?? 0} exact, ${q.probable ?? 0} probable; ${q.people_with_qid ?? 0} people in all)`,
      counts: { joined: js.joined, total: js.total, matches_with_lineups: matchesWithLineup, sides_with_lineups: B.wdTms.size, players_matched: slotsPaired, players_matched_probable: slotsProbable, wikidata_only_entries: wdOnly, archive_appearances_confirmed: num, archive_appearances_in_wd_sides: den, qids_added: q },
      known, munich: munich ? { wikidata: munich.sources.wikidata ?? null, archive_correction: munich.sources.archive?.correction ?? null } : null,
    })
  }
  // 8. corrections applied, receipts verified
  {
    const ok = corrReport.every((c) => c.applied && c.receipts.some((r) => r.verified))
    gate('corrections_applied', ok ? 'pass' : 'fail', { got: corrReport })
  }
  return gates
}
