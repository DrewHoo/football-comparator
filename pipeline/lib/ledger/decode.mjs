// The reference decoder for the compact ledger (encode.mjs writes it; pipeline/docs/compact.md is
// the layout). It turns a file back into the long shapes of data/ledger/*.jsonl, field for field,
// so the round-trip test can compare them exactly. The site's src/lib/ledger.ts should be a port:
// plain loops, no dependencies, columns looked up by name (a reordered or added column is fine, a
// missing one throws).
import { compOf } from './ordinals.mjs'

const RESULT = ['L', 'D', 'W']
const VENUE = ['H', 'A', 'N']

/** { cols, data } -> a column getter by name; throws on a missing column */
export function columns(t, need) {
  const ix = Object.fromEntries(t.cols.map((c, i) => [c, i]))
  for (const k of need) if (!(k in ix)) throw new Error(`compact: column ${k} missing`)
  const col = (k) => t.data[ix[k]]
  return { col, n: t.data[0]?.length ?? 0 }
}

/** undo the per-entity deltas (encode.mjs applyDeltas), returning fresh arrays */
function undelta(e, col) {
  const out = new Array(col.length)
  for (let i = 0; i < col.length; i++) out[i] = i > 0 && e[i] === e[i - 1] ? out[i - 1] + col[i] : col[i]
  return out
}

const nul = (v) => (v === -1 ? null : v)
const bool = (v) => (v === -1 ? null : v === 1)
const str = (S, i) => (i === -1 ? null : S[i])
const iso = (ymd, hm) => {
  const d = `${String(ymd).slice(0, 4)}-${String(ymd).slice(4, 6)}-${String(ymd).slice(6, 8)}`
  return hm === -1 ? d : `${d}T${String(hm).padStart(4, '0').slice(0, 2)}:${String(hm).padStart(4, '0').slice(2)}Z`
}
const label = (s) => `${s}-${String(s + 1).slice(2)}`

export function decodeCompact(file) {
  if (file.v !== 1) throw new Error(`compact: format v${file.v}, decoder knows v1`)
  return file.kind === 'intl' ? decodeIntl(file) : decodeClub(file)
}

function decodeClub(f) {
  const S = f.strings
  const T = columns(f.teams, ['id', 'name'])
  const teams = []
  for (let i = 0; i < T.n; i++) teams.push({ id: String(T.col('id')[i]), name: S[T.col('name')[i]] })

  const E = columns(f.entities, ['id', 'name', 'born', 'nat', 'pos', 'rows'])
  const entities = []
  for (let i = 0; i < E.n; i++) entities.push({ id: String(E.col('id')[i]), name: S[E.col('name')[i]], born: nul(E.col('born')[i]), nat: str(S, E.col('nat')[i]), pos: str(S, E.col('pos')[i]), rows: E.col('rows')[i] })

  const SE = columns(f.seasons, ['slug', 'season', 'matches', 'cached', 'stats', 'assists', 'pens'])
  const ASSISTS = { '-1': 'uncached', 0: 'none', 1: 'below-floor', 2: 'partial', 3: 'reliable' }
  const seasons = []
  for (let i = 0; i < SE.n; i++) {
    const p = SE.col('pens')[i]
    seasons.push({ slug: S[SE.col('slug')[i]], season: SE.col('season')[i], seasonLabel: label(SE.col('season')[i]), matches: SE.col('matches')[i], cached: SE.col('cached')[i], stats: SE.col('stats')[i], assists: ASSISTS[SE.col('assists')[i]], pens: p === -1 ? null : p === 1 ? 'typed' : 'untyped' })
  }

  const M = columns(f.matches, ['id', 'slug', 'season', 'ymd', 'hm', 'home', 'away', 'hs', 'as', 'shH', 'shA', 'status', 'stage', 'round', 'seasonSlug', 'qualifier', 'stuck', 'summary', 'extraTime', 'stats', 'keyEvents', 'goalsReconciled', 'quality', 'assistsReliable', 'tgnH', 'tgnA'])
  const matches = []
  for (let i = 0; i < M.n; i++) {
    const g = (k) => M.col(k)[i]
    const h = teams[g('home')], a = teams[g('away')]
    const summary = S[g('summary')]
    const m = {
      id: String(g('id')), slug: S[g('slug')], season: g('season'), seasonLabel: label(g('season')), date: iso(g('ymd'), g('hm')),
      homeId: h.id, homeName: h.name, awayId: a.id, awayName: a.name, homeScore: nul(g('hs')), awayScore: nul(g('as')),
      shootout: g('shH') === -1 ? null : { home: g('shH'), away: g('shA') },
      status: S[g('status')], stage: str(S, g('stage')), round: str(S, g('round')), seasonSlug: str(S, g('seasonSlug')),
      qualifier: bool(g('qualifier')), stuck: bool(g('stuck')), summary,
      extraTime: bool(g('extraTime')), stats: bool(g('stats')), keyEvents: str(S, g('keyEvents')), goalsReconciled: bool(g('goalsReconciled')),
      quality: str(S, g('quality')), assistsReliable: bool(g('assistsReliable')),
      tgnHome: nul(g('tgnH')), tgnAway: nul(g('tgnA')),
    }
    matches.push(m)
  }

  const R = columns(f.rows, ['e', 'm', 'home', 'started', 'subIn', 'subOff', 'sentOff', 'min', 'goals', 'pens', 'og', 'ast', 'yc', 'rc', 'result', 'cApp', 'cStart', 'cSeason', 'app', 'start', 'aSeason'])
  const e = R.col('e')
  const cols = {}
  for (const k of f.rows.cols) cols[k] = f.deltas.includes(k) ? undelta(e, R.col(k)) : R.col(k)
  const alias = new Map(f.alias), nameAlt = new Map(f.nameAlt)
  const rows = new Array(R.n)
  for (let i = 0; i < R.n; i++) {
    const g = (k) => cols[k][i]
    const ent = entities[g('e')]
    const m = matches[g('m')]
    const home = g('home') === 1
    const row = {
      id: m.id, slug: m.slug, season: m.season, date: m.date, qualifier: m.qualifier, stage: m.stage,
      athleteId: ent.id, espnId: alias.has(i) ? String(alias.get(i)) : ent.id, name: nameAlt.has(i) ? S[nameAlt.get(i)] : ent.name,
      teamId: home ? m.homeId : m.awayId, oppId: home ? m.awayId : m.homeId, home,
      started: bool(g('started')), subIn: nul(g('subIn')), subOff: nul(g('subOff')), sentOff: nul(g('sentOff')), minutes: nul(g('min')),
      goals: nul(g('goals')), pens: nul(g('pens')), ownGoals: nul(g('og')), assists: nul(g('ast')), yc: nul(g('yc')), rc: nul(g('rc')),
      result: RESULT[g('result')],
    }
    row.ord = {
      id: m.id, athleteId: ent.id, comp: compOf(row), compApp: g('cApp'), compStart: nul(g('cStart')), compSeason: g('cSeason'),
      tgn: home ? m.tgnHome : m.tgnAway, app: nul(g('app')), start: nul(g('start')), season: nul(g('aSeason')),
    }
    rows[i] = row
  }

  // team layers; the cumulative columns are recomputed here (a running sum per team-competition-season)
  const TM = columns(f.teamMatches, ['m', 'side', 'tgn', 'pos', 'tied'])
  const teamMatches = new Array(TM.n)
  const run = new Map()
  for (let i = 0; i < TM.n; i++) {
    const m = matches[TM.col('m')[i]]
    const away = TM.col('side')[i] === 1
    const teamId = away ? m.awayId : m.homeId
    const GF = away ? m.awayScore : m.homeScore, GA = away ? m.homeScore : m.awayScore
    const result = GF > GA ? 'W' : GF < GA ? 'L' : 'D'
    const comp = compOf(m)
    const k = `${comp}|${m.season}|${teamId}`
    const c = run.get(k) || { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, pts: 0 }
    c.P++; c[result]++; c.GF += GF; c.GA += GA; c.pts += result === 'W' ? 3 : result === 'D' ? 1 : 0
    run.set(k, c)
    teamMatches[i] = { comp, season: m.season, matchId: m.id, date: m.date, teamId, team: away ? m.awayName : m.homeName, home: !away, oppId: away ? m.homeId : m.awayId,
      GF, GA, result, tgn: TM.col('tgn')[i], pos: nul(TM.col('pos')[i]), tied: TM.col('tied')[i] === 1, cumPitch: { ...c } }
  }
  const TS = columns(f.teamSeasons, ['t', 'comp', 'season', 'P', 'W', 'D', 'L', 'GF', 'GA', 'pitch', 'ded', 'pts', 'pos', 'tied', 'margin', 'winlessStart', 'titleLeft', 'titleM', 'relLeft', 'relM', 'complete'])
  const teamSeasons = []
  for (let i = 0; i < TS.n; i++) {
    const g = (k) => TS.col(k)[i]
    const clinch = (left, mi) => (left === -1 ? null : { gamesLeft: left, date: matches[mi].date.slice(0, 10), matchId: matches[mi].id })
    teamSeasons.push({ comp: S[g('comp')], season: g('season'), seasonLabel: label(g('season')), teamId: teams[g('t')].id, team: teams[g('t')].name,
      P: g('P'), W: g('W'), D: g('D'), L: g('L'), GF: g('GF'), GA: g('GA'), GD: g('GF') - g('GA'), pointsOnPitch: g('pitch'), deduction: g('ded'), points: g('pts'),
      pos: nul(g('pos')), tied: g('tied') === 1, margin: nul(g('margin')), winlessStart: g('winlessStart'),
      titleClinch: clinch(g('titleLeft'), g('titleM')), relegationClinch: clinch(g('relLeft'), g('relM')), complete: g('complete') === 1 })
  }
  const RU = columns(f.runs, ['t', 'comp', 'test', 'len', 'from', 'to', 'W', 'D', 'L', 'GF', 'GA', 'ongoing', 'truncated'])
  const runs = []
  for (let i = 0; i < RU.n; i++) {
    const g = (k) => RU.col(k)[i]
    const a = matches[g('from')], b = matches[g('to')]
    runs.push({ comp: S[g('comp')], teamId: teams[g('t')].id, team: teams[g('t')].name, test: S[g('test')], len: g('len'),
      from: { matchId: a.id, date: a.date.slice(0, 10), season: a.seasonLabel }, to: { matchId: b.id, date: b.date.slice(0, 10), season: b.seasonLabel },
      W: g('W'), D: g('D'), L: g('L'), GF: g('GF'), GA: g('GA'), ongoing: g('ongoing') === 1, truncated: g('truncated') === 1 })
  }
  const { strings, entities: _e, teams: _t, matches: _m, rows: _r, alias: _a, nameAlt: _n, teamMatches: _tm, teamSeasons: _ts, runs: _ru, seasons: _s, ...header } = f
  return { header, seasons, entities, teams, matches, rows, teamMatches, teamSeasons, runs }
}

function decodeIntl(f) {
  const S = f.strings
  const E = columns(f.entities, ['key', 'name', 'team', 'born', 'coverage', 'badge', 'rsssf', 'wikidata', 'espn', 'capsStated', 'goalsStated', 'rows'])
  const entities = []
  for (let i = 0; i < E.n; i++) {
    const g = (k) => E.col(k)[i]
    const b = g('born')
    entities.push({ key: S[g('key')], name: S[g('name')], team: str(S, g('team')), born: b === -1 ? null : iso(b, -1), coverage: str(S, g('coverage')), badge: str(S, g('badge')),
      rsssf: str(S, g('rsssf')), wikidata: str(S, g('wikidata')), espn: g('espn') === -1 ? [] : S[g('espn')].split(','), capsStated: nul(g('capsStated')), goalsStated: nul(g('goalsStated')), rows: g('rows') })
  }
  const R = columns(f.rows, ['e', 'match', 'ymd', 'team', 'opp', 'type', 'tournament', 'compRsssf', 'competitive', 'venue', 'score', 'result', 'cap', 'app', 'started', 'on', 'off', 'offReason', 'min', 'goals', 'goalMin', 'src', 'flags'])
  const e = R.col('e')
  const cols = {}
  for (const k of f.rows.cols) cols[k] = f.deltas.includes(k) ? undelta(e, R.col(k)) : R.col(k)
  const nameAlt = new Map(f.nameAlt)
  const rows = new Array(R.n)
  for (let i = 0; i < R.n; i++) {
    const g = (k) => cols[k][i]
    const ent = entities[g('e')]
    const row = {
      player_key: ent.key, player: nameAlt.has(i) ? S[nameAlt.get(i)] : ent.name, team: str(S, g('team')), opponent: str(S, g('opp')), date: g('ymd') === -1 ? null : iso(g('ymd'), -1),
      match_id: str(S, g('match')), match_type: str(S, g('type')), tournament: str(S, g('tournament')), competition_rsssf: str(S, g('compRsssf')),
      competitive: bool(g('competitive')), venue: g('venue') === -1 ? null : VENUE[g('venue')], score: str(S, g('score')),
      cap_no: nul(g('cap')), app_no: nul(g('app')), started: bool(g('started')), on_min: nul(g('on')), off_min: nul(g('off')), off_reason: str(S, g('offReason')),
      minutes: nul(g('min')), goals: nul(g('goals')), goal_minutes: g('goalMin') === -1 ? null : S[g('goalMin')].split(','),
      cap_source: str(S, g('src')), flags: g('flags') === -1 ? [] : S[g('flags')].split('|'),
      result: g('result') === -1 ? null : RESULT[g('result')],
    }
    rows[i] = row
  }
  const { strings, entities: _e, rows: _r, nameAlt: _n, ...header } = f
  return { header, entities, rows }
}

/** one entity's rows (club or intl): they're contiguous, in order */
export function entityRows(decoded, ei) {
  let start = 0
  for (let i = 0; i < ei; i++) start += decoded.entities[i].rows
  return decoded.rows.slice(start, start + decoded.entities[ei].rows)
}
