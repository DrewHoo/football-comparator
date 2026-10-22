#!/usr/bin/env node
// The club-side gate at scale: the ESPN-derived ledger against dcaribou's transfermarkt-datasets
// (CC0 compilation, 2012-07 to 2026-06), per player-club-competition-season.
//
//   node pipeline/gate-transfermarkt.mjs                      # every season both cover (2012-13..2025-26)
//   node pipeline/gate-transfermarkt.mjs --download           # fetch any table not cached yet (R2 bucket only)
//   node pipeline/gate-transfermarkt.mjs --seasons 2008-2013  # partial run: *.partial.* outputs; seasons
//                                                              # without TM coverage report "no transfermarkt coverage"
//   node pipeline/gate-transfermarkt.mjs --leagues eng.1,uefa.champions
//   node pipeline/gate-transfermarkt.mjs --profile            # also write data/raw/transfermarkt/profile.json (row counts, spans)
//
// Reads data/index/espn-events.json, data/ledger/{matches,player-matches}.jsonl, data/ledger/id-merge.json,
// data/raw/transfermarkt/*.csv.gz, and (when present) data/index/athletes.jsonl (ESPN DOB) and
// data/index/wikidata/players.json (Wikidata's Transfermarkt and ESPN ids, a check on the player map).
// Never touches ESPN. Writes data/ledger/gates/transfermarkt-*.

import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import {
  ROOT, RAW_DIR, TABLES, COMPS, SLUG_TO_COMP, LINEUPS_MAX_BYTES, cached, downloadTable, headTable, readCsv, loadTable, profileTable,
  seasonOf, seasonLabel, buildClubMap, pairGames, matchClubSeason, foldName, TOL, diagnoseGame, levelOf,
} from './lib/transfermarkt.mjs';

const TM_FIRST = 2012, TM_LAST = 2025; // 2012-07-03 .. 2026-06-28
const GATES = join(ROOT, 'data', 'ledger', 'gates');
const t0 = Date.now();
const log = (...a) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
function parseSeasons(s) {
  if (!s) return null;
  const out = new Set();
  for (const part of s.split(',')) {
    let m;
    if ((m = part.match(/^(\d{4})-(\d{2})$/)) && +m[2] === (+m[1] + 1) % 100) out.add(+m[1]);
    else if ((m = part.match(/^(\d{4})-(\d{4})$/))) for (let y = +m[1]; y <= +m[2]; y++) out.add(y);
    else if ((m = part.match(/^(\d{4})$/))) out.add(+m[1]);
    else throw new Error(`bad --seasons ${part}`);
  }
  return out;
}
const seasonsArg = parseSeasons(opt('--seasons'));
const leaguesArg = opt('--leagues')?.split(',');
const SLUGS = leaguesArg ?? Object.values(COMPS);
for (const s of SLUGS) if (!SLUG_TO_COMP[s]) throw new Error(`unknown league ${s}; one of ${Object.values(COMPS).join(',')}`);
const SEASONS = seasonsArg ?? new Set(Array.from({ length: TM_LAST - TM_FIRST + 1 }, (_, i) => TM_FIRST + i));
const partial = !!(seasonsArg || leaguesArg);
const sfx = flag('--inject-faults') ? '.faults' : partial ? '.partial' : '';
const inScope = (slug, season) => SLUGS.includes(slug) && SEASONS.has(season);

// ---------- 1. downloads ----------
async function ensureDownloads() {
  for (const t of TABLES) {
    if (cached(t)) continue;
    if (!flag('--download')) throw new Error(`${t} not cached under ${RAW_DIR}; rerun with --download`);
    if (t === 'game_lineups') {
      const h = await headTable(t);
      if (h.bytes > LINEUPS_MAX_BYTES) { log(`game_lineups is ${(h.bytes / 1e6).toFixed(0)} MB, over the cap; skipped`); continue; }
    }
    await downloadTable(t, { log });
  }
  const pf = join(RAW_DIR, 'profile.json');
  if (flag('--profile') || !existsSync(pf)) {
    log('profiling tables');
    const prof = {};
    for (const [t, d] of [['appearances', 'date'], ['games', 'date'], ['clubs', '-'], ['players', 'date_of_birth'], ['competitions', '-'], ['game_lineups', 'date']])
      if (cached(t)) prof[t] = await profileTable(t, d);
    writeFileSync(pf, JSON.stringify({ builtAt: new Date().toISOString(), tables: prof }, null, 1) + '\n');
  }
  return JSON.parse(readFileSync(pf, 'utf8'));
}

// ---------- helpers ----------
async function* jsonl(file) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const l of rl) if (l) yield JSON.parse(l);
}
const csvCell = v => v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
function writeCsv(file, cols, rows) {
  const tmp = file + '.tmp';
  writeFileSync(tmp, cols.join(',') + '\n' + rows.map(r => cols.map(c => csvCell(r[c])).join(',')).join('\n') + (rows.length ? '\n' : ''));
  renameSync(tmp, file);
}
function writeJson(file, obj) { writeFileSync(file + '.tmp', JSON.stringify(obj, null, 1) + '\n'); renameSync(file + '.tmp', file); }
const day = iso => iso.slice(0, 10);
const nameScoreLoose = (a, b) => !!b && foldName(a).split(' ').at(-1) === foldName(b).split(' ').at(-1);
const isQual = e => e.qualifier === true || /qualif|play-?off/i.test(`${e.seasonSlug ?? ''} ${e.round ?? ''}`) && !/knockout/i.test(e.round ?? '');

// ---------- main ----------
const profile = await ensureDownloads();
mkdirSync(GATES, { recursive: true });

// ESPN index: every event, cached or not (team ids, names, dates)
log('reading ESPN index');
const index = JSON.parse(readFileSync(join(ROOT, 'data', 'index', 'espn-events.json'), 'utf8'));
const allEspn = index.events.filter(e => SLUG_TO_COMP[e.slug] && !(e.slug === 'uefa.champions' && isQual(e)));
const espnCover = allEspn.filter(e => e.season >= TM_FIRST && e.season <= TM_LAST);

// TM games in the six competitions
log('reading transfermarkt games');
// Season = TM's own season column (start year). It equals the July-June date rule except the COVID
// restart (July-August 2020 games are 2019-20), where it agrees with the ESPN index.
const tmGameSeason = new Map();
const tmGamesAll = (await loadTable('games', r => COMPS[r.competition_id])).map(r => (tmGameSeason.set(r.game_id, +r.season), {
  gameId: r.game_id, comp: r.competition_id, season: +r.season, dateSeason: seasonOf(r.date), date: r.date.slice(0, 10), round: r.round,
  homeId: r.home_club_id, awayId: r.away_club_id, homeName: r.home_club_name, awayName: r.away_club_name, homeGoals: +r.home_club_goals, awayGoals: +r.away_club_goals,
})).filter(g => g.season >= TM_FIRST && g.season <= TM_LAST);
const tmGameById = new Map(tmGamesAll.map(g => [g.gameId, g]));

// 2. club map (always over the full coverage window; it doesn't depend on --seasons)
log('building club map');
const clubs = buildClubMap({ tmGames: tmGamesAll, espnEvents: espnCover });
const { pairs, tmOnly, espnOnly } = pairGames({ tmGames: tmGamesAll, espnEvents: espnCover, lookup: clubs.lookup });
const pairByEspn = new Map(pairs.map(p => [p.espnId, p]));
const pairByTm = new Map(pairs.map(p => [p.tmGameId, p]));
// espn team + season -> tm club (any comp); and a global fallback for seasons TM doesn't cover
const tmClubOf = new Map(), globalTmClub = new Map();
for (const d of clubs.decisions) if (d.espnTeamId) {
  tmClubOf.set(`${d.season}|${d.espnTeamId}`, d.tmClubId);
  const m = globalTmClub.get(d.espnTeamId) ?? globalTmClub.set(d.espnTeamId, new Map()).get(d.espnTeamId);
  m.set(d.tmClubId, (m.get(d.tmClubId) ?? 0) + 1);
}
const globalClub = eid => { const m = globalTmClub.get(eid); return m ? [...m].sort((a, b) => b[1] - a[1])[0][0] : null; };

const clubCoverage = {};
for (const comp of Object.keys(COMPS)) {
  const ds = clubs.decisions.filter(d => d.comp === comp);
  const g = tmGamesAll.filter(x => x.comp === comp), e = espnCover.filter(x => SLUG_TO_COMP[x.slug] === comp);
  clubCoverage[comp] = {
    slug: COMPS[comp], clubSeasons: ds.length, matched: ds.filter(d => d.espnTeamId).length,
    byMethod: ds.reduce((a, d) => (a[d.method ?? 'unmatched'] = (a[d.method ?? 'unmatched'] ?? 0) + 1, a), {}),
    review: ds.filter(d => d.review).length, distinctTmClubs: new Set(ds.map(d => d.tmClubId)).size,
    distinctMatched: new Set(ds.filter(d => d.espnTeamId).map(d => d.tmClubId)).size,
    espnTeamSeasonsUnmatched: clubs.espnUnmatched.filter(u => u.comp === comp).length,
    tmGames: g.length, espnEvents: e.length, paired: pairs.filter(p => p.comp === comp).length,
    pairedSwapped: pairs.filter(p => p.comp === comp && p.swapped).length,
    pairedScoreDiffers: pairs.filter(p => p.comp === comp && p.tmScore !== p.espnScore).length,
  };
}
writeJson(join(GATES, 'transfermarkt-clubs.json'), {
  builtAt: new Date().toISOString(), coverage: clubCoverage,
  review: clubs.decisions.filter(d => d.review).sort((a, b) => a.comp.localeCompare(b.comp) || a.season - b.season),
  espnUnmatched: clubs.espnUnmatched, map: clubs.entries, decisions: clubs.decisions,
});
writeCsv(join(GATES, 'transfermarkt-games.csv'),
  ['status', 'comp', 'slug', 'season', 'tmGameId', 'espnId', 'tmDate', 'espnDate', 'dayDiff', 'swapped', 'tmScore', 'espnScore', 'tmHome', 'tmAway', 'espnHome', 'espnAway', 'why'],
  [...pairs.map(p => ({ status: 'paired', ...p })),
   ...tmOnly.map(x => ({ status: 'tm-only', comp: x.comp, slug: COMPS[x.comp], season: x.season, tmGameId: x.gameId, tmDate: x.date, tmScore: `${x.homeGoals}-${x.awayGoals}`, tmHome: x.homeId, tmAway: x.awayId, why: x.why })),
   ...espnOnly.map(e => ({ status: 'espn-only', comp: SLUG_TO_COMP[e.slug], slug: e.slug, season: e.season, espnId: e.id, espnDate: e.date, espnScore: `${e.homeScore}-${e.awayScore}`, espnHome: e.homeId, espnAway: e.awayId }))]);
log(`club map: ${pairs.length} games paired, ${tmOnly.length} tm-only, ${espnOnly.length} espn-only`);

// ledger: matches and player rows in scope
log('reading ledger');
const merge = JSON.parse(readFileSync(join(ROOT, 'data', 'ledger', 'id-merge.json'), 'utf8')).map;
const canon = id => merge[id] ?? id;
const matches = new Map();
for await (const m of jsonl(join(ROOT, 'data', 'ledger', 'matches.jsonl'))) {
  if (!inScope(m.slug, m.season) || m.qualifier) continue;
  matches.set(m.id, m);
}
const espnRows = []; // in-scope, from ok summaries
const ledgerIds = new Set(); // every post-merge id in the ledger (for the Wikidata check)
for await (const r of jsonl(join(ROOT, 'data', 'ledger', 'player-matches.jsonl'))) {
  ledgerIds.add(r.athleteId);
  if (!inScope(r.slug, r.season) || r.qualifier) continue;
  const m = matches.get(r.id); if (!m || m.summary !== 'ok') continue;
  r.athleteId = canon(r.athleteId);
  if (!m.assistsReliable) r.assists = null;
  espnRows.push(r);
}
// --inject-faults: a self-test of the diagnosis. Deterministically perturbs a copy of the ESPN rows
// (drop one appearance, move one goal to a team-mate, add 12 minutes to one row, 2 to another) and
// writes *.faults.* outputs; the printout must show each fault under its pattern.
const injected = [];
if (flag('--inject-faults')) {
  const paired = espnRows.filter(r => pairByEspn.has(r.id)).sort((a, b) => (a.id + a.athleteId).localeCompare(b.id + b.athleteId));
  const pick = i => paired[Math.floor(paired.length * i)];
  const drop = pick(0.1); espnRows.splice(espnRows.indexOf(drop), 1); injected.push({ fault: 'drop-appearance', id: drop.id, athleteId: drop.athleteId, name: drop.name, expect: 'espn-short-whole-match' });
  const scorer = paired.find(r => r.goals > 0 && r !== drop);
  const mate = paired.find(r => r.id === scorer.id && r.teamId === scorer.teamId && r.athleteId !== scorer.athleteId && r.goals === 0);
  scorer.goals--; mate.goals++; injected.push({ fault: 'goal-moved', id: scorer.id, from: scorer.name, to: mate.name, expect: 'goal-credited-differently (both players)' });
  const m12 = pick(0.5); m12.minutes = (m12.minutes ?? 0) + 12; injected.push({ fault: 'minutes+12', id: m12.id, name: m12.name, expect: 'minutes-off' });
  const m2 = pick(0.7); m2.minutes = (m2.minutes ?? 0) + 2; injected.push({ fault: 'minutes+2', id: m2.id, name: m2.name, expect: 'minutes-sub-clock (minutes-stoppage if a clock is 90+)' });
}
const okEvents = [...matches.values()].filter(m => m.summary === 'ok');
log(`ledger: ${matches.size} matches in scope, ${okEvents.length} ok, ${espnRows.length} player rows`);

// TM appearances: scope comps; every row for season totals, per-game rows for paired games
log('reading transfermarkt appearances');
const scopeComps = new Set(SLUGS.map(s => SLUG_TO_COMP[s]));
const tmApps = new Map();   // tmGameId -> [rows]
const tmSeasonTot = new Map(); // player|club|comp|season -> {apps, goals, assists, minutes}
const tmClubSeasonPlayers = new Map(); // season|club -> Map player -> {names:Set}
for await (const r of readCsv(cached('appearances').file)) {
  if (!scopeComps.has(r.competition_id)) continue;
  const season = tmGameSeason.get(r.game_id) ?? seasonOf(r.date); if (!SEASONS.has(season)) continue;
  const row = { gameId: r.game_id, playerId: r.player_id, clubId: r.player_club_id, comp: r.competition_id, season, name: r.player_name,
    goals: +r.goals, assists: +r.assists, minutes: +r.minutes_played, yc: +r.yellow_cards, rc: +r.red_cards };
  const k = `${row.playerId}|${row.clubId}|${row.comp}|${season}`;
  const t = tmSeasonTot.get(k) ?? tmSeasonTot.set(k, { apps: 0, goals: 0, assists: 0, minutes: 0 }).get(k);
  t.apps++; t.goals += row.goals; t.assists += row.assists; t.minutes += row.minutes;
  const cs = `${season}|${row.clubId}`;
  const pm = tmClubSeasonPlayers.get(cs) ?? tmClubSeasonPlayers.set(cs, new Map()).get(cs);
  (pm.get(row.playerId) ?? pm.set(row.playerId, { names: new Set() }).get(row.playerId)).names.add(row.name);
  if (pairByTm.has(row.gameId)) (tmApps.get(row.gameId) ?? tmApps.set(row.gameId, []).get(row.gameId)).push(row);
}
log(`tm: ${[...tmApps.values()].reduce((a, v) => a + v.length, 0)} rows in paired games`);

// TM players (names, DOB)
const tmPlayersInfo = new Map();
for (const r of await loadTable('players')) tmPlayersInfo.set(r.player_id, { name: r.name, first: r.first_name, last: r.last_name, dob: r.date_of_birth?.slice(0, 10) || null });
const dobTm = new Map([...tmPlayersInfo].filter(([, v]) => v.dob).map(([k, v]) => [k, v.dob]));
const dobEspn = new Map();
const athletesFile = join(ROOT, 'data', 'index', 'athletes.jsonl');
if (existsSync(athletesFile)) for await (const a of jsonl(athletesFile)) if (a.dob) dobEspn.set(canon(String(a.id)), a.dob.slice(0, 10));
log(`DOB: tm ${dobTm.size}, espn ${dobEspn.size}${existsSync(athletesFile) ? '' : ' (data/index/athletes.jsonl not built yet)'}`);

// "common" games: paired, ESPN summary ok, in scope; TM side covered = TM has appearances for that club in that game
const commonEvents = okEvents.filter(m => pairByEspn.has(m.id));
// A side is covered when TM lists at least 9 players for it. TM's CL rows for clubs whose league it
// didn't track that season hold only the few players it has profiles for (Dinamo Zagreb 2012-13: 6 of 14);
// 9-10 rows is a tracked side missing a player or two (Monreal, Malaga 2012-13), which the gate should see.
const TM_SIDE_MIN_ROWS = 9;
const tmSideCount = (p, tmClub) => (tmApps.get(p.tmGameId) ?? []).filter(r => r.clubId === tmClub).length;
const tmSideCovered = (p, tmClub) => tmSideCount(p, tmClub) >= TM_SIDE_MIN_ROWS;

// TM lineup types for the paired ok games (explains ESPN-only appearances: unused sub vs not in squad)
const lineupType = new Map(); // tmGameId|player -> type
if (cached('game_lineups') && commonEvents.length) {
  log('reading transfermarkt lineups for paired games');
  const want = new Set(commonEvents.map(m => pairByEspn.get(m.id).tmGameId));
  for await (const r of readCsv(cached('game_lineups').file)) if (want.has(r.game_id)) lineupType.set(`${r.game_id}|${r.player_id}`, r.type);
}

// 3. player map, per ESPN team-season
log('building player map');
const espnByTeamSeason = new Map();
for (const r of espnRows) {
  const k = `${r.season}|${r.teamId}`;
  const m = espnByTeamSeason.get(k) ?? espnByTeamSeason.set(k, new Map()).get(k);
  const p = m.get(r.athleteId) ?? m.set(r.athleteId, { names: new Set(), games: new Set() }).get(r.athleteId);
  p.names.add(r.name); if (pairByEspn.has(r.id)) p.games.add(r.id);
}
const tmGamesByClubSeason = new Map(); // season|tmClub -> Set espnId of paired ok games where TM side covered
for (const m of commonEvents) {
  const p = pairByEspn.get(m.id);
  for (const [tmClub] of [[p.tmHome], [p.tmAway]]) if (tmSideCovered(p, tmClub)) {
    const k = `${p.season}|${tmClub}`; (tmGamesByClubSeason.get(k) ?? tmGamesByClubSeason.set(k, new Set()).get(k)).add(m.id);
  }
}
const playerMatches = []; const playerReview = []; const espnUnmatchedP = []; const tmUnmatchedP = [];
const pairOf = new Map(); // `${season}|${espnTeam}|${athlete}` -> match
const pairOfTm = new Map(); // `${season}|${tmClub}|${tmPlayer}` -> match
for (const [k, eMap] of espnByTeamSeason) {
  const [season, espnTeam] = k.split('|');
  const tmClub = tmClubOf.get(k);
  if (!tmClub || !tmClubSeasonPlayers.has(`${season}|${tmClub}`)) continue; // no TM coverage for this team-season
  const tMapRaw = tmClubSeasonPlayers.get(`${season}|${tmClub}`);
  const tMap = new Map();
  for (const [pid, v] of tMapRaw) {
    const info = tmPlayersInfo.get(pid);
    const names = [...v.names, info?.name, info && `${info.first} ${info.last}`].filter(x => x && x.trim());
    const games = new Set();
    for (const eid of tmGamesByClubSeason.get(`${season}|${tmClub}`) ?? []) if ((tmApps.get(pairByEspn.get(eid).tmGameId) ?? []).some(r => r.playerId === pid && r.clubId === tmClub)) games.add(eid);
    tMap.set(pid, { names: [...new Set(names)], games });
  }
  const eMap2 = new Map([...eMap].map(([a, v]) => [a, { names: [...v.names], games: v.games }]));
  const res = matchClubSeason({ espnPlayers: eMap2, tmPlayers: tMap, dobEspn, dobTm });
  for (const m of res.matched) {
    const row = { season: +season, espnTeamId: espnTeam, tmClubId: tmClub, espnAthleteId: m.eid, tmPlayerId: m.tid, espnName: eMap2.get(m.eid).names[0], tmName: tMap.get(m.tid).names[0],
      nameScore: +m.ns.toFixed(3), jaccard: m.jac === null ? null : +m.jac.toFixed(3), coGames: m.both, dob: m.dob, conf: +m.conf.toFixed(3), level: m.level, ambiguous: m.ambiguous };
    playerMatches.push(row); pairOf.set(`${season}|${espnTeam}|${m.eid}`, row); pairOfTm.set(`${season}|${tmClub}|${m.tid}`, row);
  }
  for (const m of res.review) playerReview.push({ season: +season, espnTeamId: espnTeam, tmClubId: tmClub, espnAthleteId: m.eid, tmPlayerId: m.tid, espnName: eMap2.get(m.eid).names[0], tmName: tMap.get(m.tid).names[0], nameScore: +m.ns.toFixed(3), jaccard: +m.jac.toFixed(3), coGames: m.both, evidence: m.both >= 5 ? 'strong' : 'weak', why: 'co-appearance only; name too different (nickname or transliteration): hand-check, kept out of the gate' });
  const covered = tmGamesByClubSeason.get(`${season}|${tmClub}`) ?? new Set();
  for (const a of res.espnLeft) {
    const g = [...eMap2.get(a).games];
    espnUnmatchedP.push({ season: +season, espnTeamId: espnTeam, tmClubId: tmClub, espnAthleteId: a, name: eMap2.get(a).names.join(' / '), pairedGames: g.length, tmSideCoveredGames: g.filter(x => covered.has(x)).length,
      why: g.some(x => covered.has(x)) ? 'no TM player with a close name in this club-season' : 'TM has no appearances for this side in his games' });
  }
  for (const p of res.tmLeft) if (tMap.get(p).games.size) tmUnmatchedP.push({ season: +season, espnTeamId: espnTeam, tmClubId: tmClub, tmPlayerId: p, name: tMap.get(p).names[0], pairedGames: tMap.get(p).games.size });
}
// TM club-seasons with paired games but no ESPN rows at all (all their ESPN summaries are rosterless) also leave TM players unmatched
// (they surface in the gate as tm-unmatched units).

const reviewEspn = new Set(playerReview.map(r => `${r.season}|${r.espnTeamId}|${r.espnAthleteId}`));
const reviewTm = new Set(playerReview.map(r => `${r.season}|${r.tmClubId}|${r.tmPlayerId}`));
// global player map + conflicts + Wikidata check
const globalMap = new Map(); // tm -> Map espn -> clubSeasons
for (const m of playerMatches) { const g = globalMap.get(m.tmPlayerId) ?? globalMap.set(m.tmPlayerId, new Map()).get(m.tmPlayerId); g.set(m.espnAthleteId, (g.get(m.espnAthleteId) ?? 0) + 1); }
const reverseMap = new Map();
for (const m of playerMatches) { const g = reverseMap.get(m.espnAthleteId) ?? reverseMap.set(m.espnAthleteId, new Set()).get(m.espnAthleteId); g.add(m.tmPlayerId); }
const splitCandidates = [...globalMap].filter(([, g]) => g.size > 1).map(([tm, g]) => ({ tmPlayerId: tm, tmName: tmPlayersInfo.get(tm)?.name, espnIds: Object.fromEntries(g), note: 'one TM player, several post-merge ESPN ids: an unmerged ESPN split (id-merge candidate)' }));
const homonymCandidates = [...reverseMap].filter(([, g]) => g.size > 1).map(([e, g]) => ({ espnAthleteId: e, tmPlayerIds: [...g], tmNames: [...g].map(t => tmPlayersInfo.get(t)?.name), note: 'one ESPN id, several TM players: an over-merge or a wrong match' }));
const wd = { checked: 0, agree: 0, disagree: [], otherEspnId: [], missed: 0 };
const wdFile = join(ROOT, 'data', 'index', 'wikidata', 'players.json');
if (existsSync(wdFile)) {
  const espnInScope = new Set(espnRows.map(r => r.athleteId));
  for (const p of JSON.parse(readFileSync(wdFile, 'utf8'))) {
    const tms = p.ids?.transfermarkt ?? [], es = (p.ids?.espn ?? []).map(x => canon(String(x)));
    if (!tms.length || !es.length) continue;
    for (const t of tms) {
      const g = globalMap.get(t);
      if (g) {
        wd.checked++;
        if ([...g.keys()].some(e => es.includes(e))) wd.agree++;
        else if (es.some(e => ledgerIds.has(e))) wd.disagree.push({ qid: p.qid, label: p.label, tm: t, wikidataEspn: es, ourEspn: [...g.keys()] });
        else wd.otherEspnId.push({ qid: p.qid, label: p.label, tm: t, wikidataEspn: es, ourEspn: [...g.keys()], note: "Wikidata's ESPN id has no ledger row: a second ESPN id for the same person (athlete store or national team), not a wrong match" });
      }
      else if (es.some(e => espnInScope.has(e)) && [...tmClubSeasonPlayers.values()].some(m => m.has(t))) wd.missed++;
    }
  }
}
const levels = playerMatches.reduce((a, m) => (a[m.level] = (a[m.level] ?? 0) + 1, a), {});
const playerSummary = {
  clubSeasonsMatched: new Set(playerMatches.map(m => `${m.season}|${m.espnTeamId}`)).size,
  pairs: playerMatches.length, distinctTmPlayers: globalMap.size, distinctEspnAthletes: reverseMap.size, levels,
  espnAthleteSeasonsInCoveredTeams: playerMatches.length + espnUnmatchedP.length + playerReview.length,
  espnUnmatched: espnUnmatchedP.filter(u => u.tmSideCoveredGames).length, espnUnmatchedTmSideUncovered: espnUnmatchedP.filter(u => !u.tmSideCoveredGames).length, tmUnmatchedInPairedGames: tmUnmatchedP.length, review: playerReview.length,
  dobUsed: playerMatches.filter(m => m.dob !== null).length, dobDisagree: playerMatches.filter(m => m.dob === false).length,
  ambiguous: playerMatches.filter(m => m.ambiguous).length, splitCandidates: splitCandidates.length, homonymCandidates: homonymCandidates.length,
  wikidata: { checked: wd.checked, agree: wd.agree, disagree: wd.disagree.length, otherEspnId: wd.otherEspnId.length, missedByUs: wd.missed },
};
writeJson(join(GATES, `transfermarkt-players${sfx}.json`), { builtAt: new Date().toISOString(), scope: { slugs: SLUGS, seasons: [...SEASONS] }, summary: playerSummary,
  splitCandidates, homonymCandidates, wikidataDisagree: wd.disagree, wikidataOtherEspnId: wd.otherEspnId, review: playerReview, espnUnmatched: espnUnmatchedP, tmUnmatched: tmUnmatchedP, map: playerMatches });
log(`player map: ${playerMatches.length} club-season pairs (${JSON.stringify(levels)}), espn unmatched ${espnUnmatchedP.length}, tm unmatched ${tmUnmatchedP.length}, wikidata ${wd.agree}/${wd.checked}`);

// 4. the gate
log('gating');
const units = new Map();
const unitOf = (k, init) => units.get(k) ?? units.set(k, { ...init, games: new Map() }).get(k);
const espnSeasonTot = new Map();
for (const r of espnRows) { const k = `${r.athleteId}|${r.teamId}|${r.slug}|${r.season}`; espnSeasonTot.set(k, (espnSeasonTot.get(k) ?? 0) + 1); }
const teamEvents = new Map(); // slug|season|team -> index events (played)
for (const e of allEspn) if (inScope(e.slug, e.season)) for (const t of [e.homeId, e.awayId]) { const k = `${e.slug}|${e.season}|${t}`; teamEvents.set(k, (teamEvents.get(k) ?? 0) + 1); }
const tmTeamGames = new Map();
for (const g of tmGamesAll) for (const c of [g.homeId, g.awayId]) { const k = `${g.comp}|${g.season}|${c}`; tmTeamGames.set(k, (tmTeamGames.get(k) ?? 0) + 1); }

const tmHasComp = new Set(tmGamesAll.map(g => `${g.comp}|${g.season}`));
for (const r of espnRows) {
  const comp = SLUG_TO_COMP[r.slug];
  const p = pairByEspn.get(r.id);
  if (!tmHasComp.has(`${comp}|${r.season}`)) {
    const u = unitOf(`nocov|${r.athleteId}|${r.teamId}|${r.slug}|${r.season}`, { status: 'no-tm-coverage', slug: r.slug, comp, season: r.season, espnTeamId: r.teamId, tmClubId: globalClub(r.teamId), espnAthleteId: r.athleteId, name: r.name });
    u.games.set(r.id, { e: r, t: null });
    continue;
  }
  if (!p) { const u = unitOf(`unpaired|${r.athleteId}|${r.teamId}|${r.slug}|${r.season}`, { status: 'espn-game-unpaired', slug: r.slug, comp, season: r.season, espnTeamId: r.teamId, espnAthleteId: r.athleteId, name: r.name }); u.games.set(r.id, { e: r, t: null }); continue; }
  const tmClub = r.teamId === p.espnHome ? p.tmHome : p.tmAway;
  if (!tmSideCovered(p, tmClub)) { const u = unitOf(`tmside|${r.athleteId}|${r.teamId}|${r.slug}|${r.season}`, { status: 'tm-side-partial', slug: r.slug, comp, season: r.season, espnTeamId: r.teamId, tmClubId: tmClub, espnAthleteId: r.athleteId, name: r.name }); u.games.set(r.id, { e: r, t: null }); continue; }
  const pm = pairOf.get(`${r.season}|${r.teamId}|${r.athleteId}`);
  if (pm) { const u = unitOf(`cmp|${pm.tmPlayerId}|${r.athleteId}|${r.teamId}|${r.slug}|${r.season}`, { status: 'compared', slug: r.slug, comp, season: r.season, espnTeamId: r.teamId, tmClubId: tmClub, espnAthleteId: r.athleteId, tmPlayerId: pm.tmPlayerId, name: r.name, tmName: pm.tmName, mapConf: pm.conf, mapLevel: pm.level }); (u.games.get(r.id) ?? u.games.set(r.id, { e: null, t: null }).get(r.id)).e = r; }
  else { const u = unitOf(`eu|${r.athleteId}|${r.teamId}|${r.slug}|${r.season}`, { status: 'espn-unmatched', slug: r.slug, comp, season: r.season, espnTeamId: r.teamId, tmClubId: tmClub, espnAthleteId: r.athleteId, name: r.name }); u.games.set(r.id, { e: r, t: null }); }
}
for (const m of commonEvents) {
  const p = pairByEspn.get(m.id);
  for (const t of tmApps.get(p.tmGameId) ?? []) {
    const espnTeam = t.clubId === p.tmHome ? p.espnHome : t.clubId === p.tmAway ? p.espnAway : null;
    if (!espnTeam || !tmSideCovered(p, t.clubId)) continue;
    const pm = pairOfTm.get(`${p.season}|${t.clubId}|${t.playerId}`);
    if (pm) { const u = unitOf(`cmp|${t.playerId}|${pm.espnAthleteId}|${espnTeam}|${m.slug}|${p.season}`, { status: 'compared', slug: m.slug, comp: p.comp, season: p.season, espnTeamId: espnTeam, tmClubId: t.clubId, espnAthleteId: pm.espnAthleteId, tmPlayerId: t.playerId, name: pm.espnName, tmName: pm.tmName, mapConf: pm.conf, mapLevel: pm.level }); (u.games.get(m.id) ?? u.games.set(m.id, { e: null, t: null }).get(m.id)).t = t; }
    else { const u = unitOf(`tu|${t.playerId}|${t.clubId}|${m.slug}|${p.season}`, { status: 'tm-unmatched', slug: m.slug, comp: p.comp, season: p.season, espnTeamId: espnTeam, tmClubId: t.clubId, tmPlayerId: t.playerId, tmName: t.name }); u.games.set(m.id, { e: null, t }); }
  }
}

const sum = (xs, f) => { let s = 0; for (const x of xs) { const v = f(x); if (v === null || v === undefined) return null; s += v; } return s; };
for (const u of units.values()) {
  if (u.status === 'espn-unmatched' && reviewEspn.has(`${u.season}|${u.espnTeamId}|${u.espnAthleteId}`)) u.status = 'map-review';
  if (u.status === 'tm-unmatched' && reviewTm.has(`${u.season}|${u.tmClubId}|${u.tmPlayerId}`)) u.status = 'map-review';
}
const PRIORITY = ['espn-roster-collapsed', 'espn-roster-missing', 'espn-player-absent', 'tm-unused-sub', 'tm-no-appearance', 'tm-player-absent', 'goal-credit', 'minutes-other', 'espn-minutes-null', 'minutes-clock', 'minutes-stoppage', 'assist-credit'];
const PATTERN = { 'espn-roster-collapsed': 'espn-short-whole-match', 'espn-roster-missing': 'espn-short-whole-match', 'espn-player-absent': 'espn-short-whole-match',
  'tm-unused-sub': 'tm-short-whole-match', 'tm-no-appearance': 'tm-short-whole-match', 'tm-player-absent': 'tm-short-whole-match',
  'goal-credit': 'goal-credited-differently', 'minutes-other': 'minutes-off', 'espn-minutes-null': 'minutes-unknown', 'minutes-clock': 'minutes-sub-clock', 'minutes-stoppage': 'minutes-stoppage', 'assist-credit': 'assist-credited-differently' };
const out = [];
for (const u of units.values()) {
  const g = [...u.games.entries()];
  const E = g.map(([, x]) => x.e).filter(Boolean), T = g.map(([, x]) => x.t).filter(Boolean);
  const row = { status: u.status, season: u.season, seasonLabel: seasonLabel(u.season), slug: u.slug, comp: u.comp, espnTeamId: u.espnTeamId, tmClubId: u.tmClubId ?? '',
    espnAthleteId: u.espnAthleteId ?? '', tmPlayerId: u.tmPlayerId ?? '', name: u.name ?? '', tmName: u.tmName ?? '', mapConf: u.mapConf ?? '', mapLevel: u.mapLevel ?? '' };
  row.commonGames = u.status === 'compared' || u.status === 'tm-unmatched' || u.status === 'espn-unmatched' ? g.length : 0;
  row.espnApps = E.length; row.espnGoals = sum(E, r => r.goals); row.espnAssists = sum(E, r => r.assists); row.espnMinutes = sum(E, r => r.minutes);
  if (u.status === 'no-tm-coverage' || u.status === 'espn-game-unpaired' || u.status === 'tm-side-partial') {
    Object.assign(row, { tmApps: '', tmGoals: '', tmAssists: '', tmMinutes: '', note: u.status === 'no-tm-coverage' ? 'no transfermarkt coverage' : u.status });
  } else {
    row.tmApps = T.length; row.tmGoals = sum(T, r => r.goals); row.tmAssists = sum(T, r => r.assists); row.tmMinutes = sum(T, r => r.minutes);
  }
  const d = (a, b) => a === null || b === null || a === '' || b === '' ? null : a - b;
  row.dApps = d(row.espnApps, row.tmApps); row.dGoals = d(row.espnGoals, row.tmGoals); row.dAssists = d(row.espnAssists, row.tmAssists); row.dMinutes = d(row.espnMinutes, row.tmMinutes);
  const espnSeason = u.espnAthleteId ? espnSeasonTot.get(`${u.espnAthleteId}|${u.espnTeamId}|${u.slug}|${u.season}`) ?? 0 : '';
  const tmSeason = u.tmPlayerId ? tmSeasonTot.get(`${u.tmPlayerId}|${u.tmClubId}|${u.comp}|${u.season}`) : null;
  row.espnSeasonApps = espnSeason; row.tmSeasonApps = tmSeason?.apps ?? ''; row.tmSeasonGoals = tmSeason?.goals ?? ''; row.tmSeasonAssists = tmSeason?.assists ?? ''; row.tmSeasonMinutes = tmSeason?.minutes ?? '';
  const teamIdx = teamEvents.get(`${u.slug}|${u.season}|${u.espnTeamId}`) ?? 0, teamTm = u.tmClubId ? tmTeamGames.get(`${u.comp}|${u.season}|${u.tmClubId}`) ?? 0 : 0;
  row.teamEspnEvents = teamIdx; row.teamTmGames = teamTm;
  row.teamCommonGames = u.tmClubId ? (tmGamesByClubSeason.get(`${u.season}|${u.tmClubId}`) ? [...tmGamesByClubSeason.get(`${u.season}|${u.tmClubId}`)].filter(id => matches.get(id)?.slug === u.slug).length : 0) : 0;
  row.coverage = u.status === 'no-tm-coverage' ? 'none' : row.teamCommonGames && row.teamCommonGames === teamIdx && teamIdx === teamTm ? 'full-season' : 'partial';

  // tolerances and per-game diagnosis (compared units only)
  const tags = [], events = new Set(), tmGames = new Set(), details = [];
  if (u.status === 'compared' || u.status === 'tm-unmatched' || u.status === 'espn-unmatched') {
    for (const [eid, x] of g) {
      const m = matches.get(eid), p = pairByEspn.get(eid);
      const side = m?.lineup?.[u.espnTeamId === m.homeId ? 'home' : 'away'];
      // an espn-unmatched player has no TM id; any TM lineup entry for him is unknown, so 'tm-player-absent'
      const tg = diagnoseGame(x.e, x.t, side, u.tmPlayerId ? lineupType.get(`${p.tmGameId}|${u.tmPlayerId}`) : undefined);
      if (tg.length) {
        tags.push(...tg); events.add(eid); tmGames.add(p.tmGameId);
        const f = x => x ? `${x.goals ?? '-'}g ${x.assists ?? '-'}a ${x.minutes ?? '-'}'` : 'absent';
        details.push(`${eid}/${p.tmGameId} ${day(m.date)}: ${tg.join('+')}; espn ${f(x.e)}${x.e?.subIn != null ? ` on ${x.e.subIn}` : ''}${x.e?.subOff != null ? ` off ${x.e.subOff}` : ''}, tm ${f(x.t)}`);
      }
    }
  }
  if (u.status === 'tm-unmatched' || u.status === 'espn-unmatched') {
    // the player is in one source only for this club-season: every game is a whole-match disagreement,
    // unless the map missed him (nickname); map-review pairs are already split out
    const distinct = [...new Set(tags)];
    row.pattern = distinct.length ? PATTERN[distinct.sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b))[0]] : 'exact';
    row.tags = distinct.map(t => `${t}:${tags.filter(x => x === t).length}`).join('|');
    row.severity = 100 * Math.abs(row.dApps ?? 0) + 50 * Math.abs(row.dGoals ?? 0);
  }
  if (u.status === 'compared') {
    row.tolApps = TOL.apps(); row.tolGoals = TOL.goals(); row.tolAssists = TOL.assists(row.espnAssists, row.tmAssists); row.tolMinutes = TOL.minutes(Math.min(row.espnApps, row.tmApps));
    row.okApps = row.dApps === null ? '' : Math.abs(row.dApps) <= row.tolApps;
    row.okGoals = row.dGoals === null ? '' : Math.abs(row.dGoals) <= row.tolGoals;
    row.okAssists = row.dAssists === null ? '' : Math.abs(row.dAssists) <= row.tolAssists;
    row.okMinutes = row.dMinutes === null ? '' : Math.abs(row.dMinutes) <= row.tolMinutes;
    const distinct = [...new Set(tags)].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
    row.pattern = distinct.length ? PATTERN[distinct[0]] : 'exact';
    row.tags = distinct.map(t => `${t}:${tags.filter(x => x === t).length}`).join('|');
    row.severity = 100 * Math.abs(row.dApps ?? 0) + 50 * Math.abs(row.dGoals ?? 0) + 10 * Math.max(0, Math.abs(row.dAssists ?? 0) - row.tolAssists) + Math.max(0, Math.abs(row.dMinutes ?? 0) - row.tolMinutes);
  }
  row.espnEvents = [...events].join(' '); row.tmGames = [...tmGames].join(' ');
  Object.defineProperty(row, 'details', { value: details, enumerable: false });
  out.push(row);
}
out.sort((a, b) => a.slug.localeCompare(b.slug) || a.season - b.season || String(a.espnTeamId).localeCompare(String(b.espnTeamId)) || String(a.name || a.tmName).localeCompare(String(b.name || b.tmName)));
const COLS = ['status', 'season', 'seasonLabel', 'slug', 'comp', 'espnTeamId', 'tmClubId', 'espnAthleteId', 'tmPlayerId', 'name', 'tmName', 'mapConf', 'mapLevel', 'coverage', 'commonGames',
  'espnApps', 'tmApps', 'dApps', 'espnGoals', 'tmGoals', 'dGoals', 'espnAssists', 'tmAssists', 'dAssists', 'espnMinutes', 'tmMinutes', 'dMinutes',
  'tolApps', 'tolGoals', 'tolAssists', 'tolMinutes', 'okApps', 'okGoals', 'okAssists', 'okMinutes', 'pattern', 'tags', 'severity',
  'espnSeasonApps', 'tmSeasonApps', 'tmSeasonGoals', 'tmSeasonAssists', 'tmSeasonMinutes', 'teamEspnEvents', 'teamTmGames', 'teamCommonGames', 'espnEvents', 'tmGames', 'note'];
writeCsv(join(GATES, `transfermarkt-season${sfx}.csv`), COLS, out);

// summary by competition-season
const bucket = (v, edges) => { for (const [lab, lo, hi] of edges) if (v >= lo && v <= hi) return lab; return '?'; };
const SMALL = [['<=-3', -Infinity, -3], ['-2', -2, -2], ['-1', -1, -1], ['0', 0, 0], ['+1', 1, 1], ['+2', 2, 2], ['>=+3', 3, Infinity]];
const MINS = [['<-90', -Infinity, -91], ['-90..-31', -90, -31], ['-30..-6', -30, -6], ['-5..-1', -5, -1], ['0', 0, 0], ['+1..+5', 1, 5], ['+6..+30', 6, 30], ['+31..+90', 31, 90], ['>+90', 91, Infinity]];
const bySeason = {};
for (const r of out) {
  const k = `${r.slug} ${r.seasonLabel}`;
  const s = bySeason[k] ??= { slug: r.slug, season: r.season, seasonLabel: r.seasonLabel, units: {}, espnEvents: 0, espnOk: 0, paired: 0, common: 0, stats: {}, patterns: {}, gameTags: {} };
  s.units[r.status] = (s.units[r.status] ?? 0) + 1;
  if (r.status === 'no-tm-coverage') s.note = 'no transfermarkt coverage';
  if (r.status === 'tm-unmatched' || r.status === 'espn-unmatched') {
    s.unmatchedPatterns ??= {}; s.unmatchedPatterns[`${r.status}:${r.pattern}`] = (s.unmatchedPatterns[`${r.status}:${r.pattern}`] ?? 0) + 1;
    for (const t of r.tags ? r.tags.split('|') : []) { const [n, c] = t.split(':'); s.gameTags[n] = (s.gameTags[n] ?? 0) + +c; }
  }
  if (r.status !== 'compared') continue;
  for (const [stat, dk, ok, edges] of [['apps', 'dApps', 'okApps', SMALL], ['goals', 'dGoals', 'okGoals', SMALL], ['assists', 'dAssists', 'okAssists', SMALL], ['minutes', 'dMinutes', 'okMinutes', MINS]]) {
    const st = s.stats[stat] ??= { compared: 0, exact: 0, withinTol: 0, deltas: Object.fromEntries(edges.map(e => [e[0], 0])) };
    if (r[dk] === null) continue;
    st.compared++; if (r[dk] === 0) st.exact++; if (r[ok] === true) st.withinTol++;
    st.deltas[bucket(r[dk], edges)]++;
  }
  s.patterns[r.pattern] = (s.patterns[r.pattern] ?? 0) + 1;
  for (const t of r.tags ? r.tags.split('|') : []) { const [n, c] = t.split(':'); s.gameTags[n] = (s.gameTags[n] ?? 0) + +c; }
}
for (const m of matches.values()) {
  const k = `${m.slug} ${seasonLabel(m.season)}`; const s = bySeason[k] ??= { slug: m.slug, season: m.season, seasonLabel: seasonLabel(m.season), units: {}, espnEvents: 0, espnOk: 0, paired: 0, common: 0, stats: {}, patterns: {}, gameTags: {} };
  s.espnEvents++; if (m.summary === 'ok') s.espnOk++; if (pairByEspn.has(m.id)) { s.paired++; if (m.summary === 'ok') s.common++; }
  if (!tmHasComp.has(`${SLUG_TO_COMP[m.slug]}|${m.season}`)) s.note = 'no transfermarkt coverage';
}
for (const s of Object.values(bySeason)) for (const st of Object.values(s.stats)) { st.exactRate = st.compared ? +(st.exact / st.compared).toFixed(4) : null; st.withinTolRate = st.compared ? +(st.withinTol / st.compared).toFixed(4) : null; }
const compared = out.filter(r => r.status === 'compared');
const top = out.filter(r => ['compared', 'tm-unmatched', 'espn-unmatched'].includes(r.status) && r.severity > 0).sort((a, b) => b.severity - a.severity).slice(0, 50)
  .map(r => ({ severity: r.severity, status: r.status, slug: r.slug, season: r.seasonLabel, name: r.name, tmName: r.tmName, espnAthleteId: r.espnAthleteId, tmPlayerId: r.tmPlayerId, espnTeamId: r.espnTeamId, tmClubId: r.tmClubId,
    apps: [r.espnApps, r.tmApps], goals: [r.espnGoals, r.tmGoals], assists: [r.espnAssists, r.tmAssists], minutes: [r.espnMinutes, r.tmMinutes], pattern: r.pattern, tags: r.tags, espnEvents: r.espnEvents.split(' ').filter(Boolean), tmGames: r.tmGames.split(' ').filter(Boolean), games: r.details }));
const overall = {};
for (const stat of ['apps', 'goals', 'assists', 'minutes']) {
  const acc = { compared: 0, exact: 0, withinTol: 0 };
  for (const s of Object.values(bySeason)) if (s.stats[stat]) { acc.compared += s.stats[stat].compared; acc.exact += s.stats[stat].exact; acc.withinTol += s.stats[stat].withinTol; }
  acc.exactRate = acc.compared ? +(acc.exact / acc.compared).toFixed(4) : null; acc.withinTolRate = acc.compared ? +(acc.withinTol / acc.compared).toFixed(4) : null;
  overall[stat] = acc;
}
const statusCounts = out.reduce((a, r) => (a[r.status] = (a[r.status] ?? 0) + 1, a), {});
const patternCounts = out.filter(r => r.pattern).reduce((a, r) => { const k = r.status === 'compared' ? r.pattern : `${r.status}:${r.pattern}`; a[k] = (a[k] ?? 0) + 1; return a; }, {});
const gameTagCounts = {};
for (const s of Object.values(bySeason)) for (const [k, v] of Object.entries(s.gameTags)) gameTagCounts[k] = (gameTagCounts[k] ?? 0) + v;
const summary = {
  builtAt: new Date().toISOString(), scope: { slugs: SLUGS, seasons: [...SEASONS].sort(), partial },
  tolerances: { apps: 0, goals: 0, assists: '1 + floor(max/10)', minutes: 'max(5, 3 x common apps)', perMatchStoppage: 3 },
  downloads: Object.fromEntries(Object.entries(profile.tables).map(([k, v]) => [k, { rows: v.rows, span: v.span, bytes: v.bytes, sha256: v.sha256, fetchedAt: v.fetchedAt }])),
  clubMap: clubCoverage, players: playerSummary,
  units: statusCounts, overall, patterns: patternCounts, gameTags: gameTagCounts,
  byCompetitionSeason: Object.values(bySeason).sort((a, b) => a.slug.localeCompare(b.slug) || a.season - b.season),
  top50: top,
};
writeJson(join(GATES, `transfermarkt-summary${sfx}.json`), summary);

// printout
const pct = x => x === null ? '   -  ' : (100 * x).toFixed(1).padStart(5) + '%';
console.log(`\ntransfermarkt gate (${partial ? 'partial' : 'full scope'}; ${SLUGS.join(',')}; seasons ${[...SEASONS].sort()[0]}..${[...SEASONS].sort().at(-1)})`);
console.log('club map:', Object.entries(clubCoverage).map(([c, v]) => `${c} ${v.distinctMatched}/${v.distinctTmClubs} clubs, ${v.matched}/${v.clubSeasons} club-seasons, ${v.review} review, ${v.paired}/${v.tmGames} games paired`).join('\n          '));
console.log(`players:  ${playerSummary.pairs} club-season pairs (${JSON.stringify(levels)}); espn unmatched ${playerSummary.espnUnmatched}, tm unmatched ${playerSummary.tmUnmatchedInPairedGames}, review ${playerSummary.review}; wikidata ${wd.agree}/${wd.checked} agree, ${wd.disagree.length} disagree, ${wd.otherEspnId.length} name a second ESPN id`);
console.log('units:', JSON.stringify(statusCounts));
console.log('\ncomp-season          ok/events  common  compared  apps exact   goals exact  assists ok   minutes ok');
for (const s of summary.byCompetitionSeason) {
  const st = s.stats;
  console.log(`${(s.slug + ' ' + s.seasonLabel).padEnd(22)} ${String(s.espnOk).padStart(4)}/${String(s.espnEvents).padEnd(4)} ${String(s.common).padStart(6)}  ${String(s.units.compared ?? 0).padStart(8)}  ${pct(st.apps?.exactRate ?? null)}      ${pct(st.goals?.exactRate ?? null)}      ${pct(st.assists?.withinTolRate ?? null)}      ${pct(st.minutes?.withinTolRate ?? null)}${s.note ? '   ' + s.note : ''}`);
}
console.log('\noverall:', Object.entries(overall).map(([k, v]) => `${k} exact ${pct(v.exactRate)} within-tol ${pct(v.withinTolRate)} (n=${v.compared})`).join('; '));
console.log('patterns:', JSON.stringify(patternCounts), '\ngame tags:', JSON.stringify(gameTagCounts));
console.log('\ntop disagreements:');
for (const t of top.slice(0, 15)) console.log(`  ${String(t.severity).padStart(5)} ${t.status === 'compared' ? '' : t.status + ' '}${t.slug} ${t.season} ${t.name || t.tmName} (${t.espnAthleteId || '-'}/${t.tmPlayerId || '-'}) apps ${t.apps.join('/')} goals ${t.goals.join('/')} ast ${t.assists.join('/')} min ${t.minutes.join('/')} ${t.pattern} [${t.espnEvents.join(' ')}]`);
if (injected.length) {
  console.log('\ninjected faults:');
  for (const f of injected) {
    const hits = out.filter(r => r.espnEvents.split(' ').includes(f.id) && [f.name, f.from, f.to].some(n => n && (n === r.name || nameScoreLoose(n, r.tmName))));
    console.log(`  ${f.fault} (${f.name ?? f.from + ' -> ' + f.to}, ${f.id}): expect ${f.expect}; got ${hits.map(h => `${h.name}=${h.pattern} [${h.tags}]`).join(', ') || 'NOT FLAGGED'}`);
  }
}
for (const t of top.slice(0, 5)) console.log(`  ${t.name || t.tmName}: ${t.games.join(' | ')}`);
log(`wrote data/ledger/gates/transfermarkt-{season${sfx}.csv,summary${sfx}.json,players${sfx}.json,clubs.json,games.csv}`);
