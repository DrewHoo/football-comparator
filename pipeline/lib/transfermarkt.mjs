// transfermarkt-datasets (dcaribou, CC0 compilation) helpers.
//
// The only host this module touches is the R2 bucket below, one GET per table,
// cached under data/raw/transfermarkt/<table>.<YYYY-MM-DD>.csv.gz with a sidecar
// <same>.json {url, bytes, sha256, fetchedAt, status, lastModified}. A cached
// table is never refetched; pass {refresh:true} to force a new dated copy.
//
// Everything else here is local: CSV parsing (via `gunzip -c`), name folding,
// the club map and the player map. No ESPN, no other host.

import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAW_DIR = join(ROOT, 'data', 'raw', 'transfermarkt');
export const BASE_URL = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/';
export const TABLES = ['appearances', 'games', 'clubs', 'players', 'competitions', 'game_lineups'];
export const LINEUPS_MAX_BYTES = 200 * 1024 * 1024;

// transfermarkt competition id <-> ESPN slug
export const COMPS = { GB1: 'eng.1', ES1: 'esp.1', IT1: 'ita.1', L1: 'ger.1', FR1: 'fra.1', CL: 'uefa.champions' };
export const SLUG_TO_COMP = Object.fromEntries(Object.entries(COMPS).map(([k, v]) => [v, k]));

// ---------- download / cache ----------

/** Newest cached copy of a table, or null. Returns {file, meta}. */
export function cached(table) {
  if (!existsSync(RAW_DIR)) return null;
  const re = new RegExp(`^${table}\\.(\\d{4}-\\d{2}-\\d{2})\\.csv\\.gz$`);
  const hits = readdirSync(RAW_DIR).filter(f => re.test(f)).sort();
  if (!hits.length) return null;
  const file = join(RAW_DIR, hits.at(-1));
  const side = file.replace(/\.csv\.gz$/, '.json');
  return { file, meta: existsSync(side) ? JSON.parse(readFileSync(side, 'utf8')) : null };
}

/** HEAD a table (one request). Used only to size game_lineups before downloading it. */
export async function headTable(table) {
  const url = BASE_URL + table + '.csv.gz';
  const r = await fetch(url, { method: 'HEAD' });
  return { url, status: r.status, bytes: Number(r.headers.get('content-length')), lastModified: r.headers.get('last-modified') };
}

/** Download one table unless a cached copy exists. One GET, body kept verbatim. */
export async function downloadTable(table, { refresh = false, log = console.error } = {}) {
  const have = cached(table);
  if (have && !refresh) return { ...have, fromCache: true };
  mkdirSync(RAW_DIR, { recursive: true });
  const url = BASE_URL + table + '.csv.gz';
  const fetchedAt = new Date().toISOString();
  const r = await fetch(url);
  if (r.status !== 200) throw new Error(`${url}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const file = join(RAW_DIR, `${table}.${fetchedAt.slice(0, 10)}.csv.gz`);
  writeFileSync(file + '.tmp', buf);
  renameSync(file + '.tmp', file);
  const meta = { url, status: r.status, bytes: buf.length, sha256, fetchedAt, lastModified: r.headers.get('last-modified'), etag: r.headers.get('etag') };
  writeFileSync(file.replace(/\.csv\.gz$/, '.json'), JSON.stringify(meta, null, 1) + '\n');
  log(`  ${table}: ${(buf.length / 1e6).toFixed(1)} MB  sha256 ${sha256.slice(0, 12)}`);
  return { file, meta, fromCache: false };
}

// ---------- CSV ----------

/** RFC 4180 line splitter for one record (fields may hold quotes and commas, not newlines-in-progress). */
function splitCsv(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return { fields: out, open: q };
}

/** Stream a cached .csv.gz as objects. Handles quoted fields that span lines. */
export async function* readCsv(file) {
  const child = spawn('gunzip', ['-c', file], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let header = null; let pending = '';
  for await (const raw of rl) {
    const line = pending ? pending + '\n' + raw : raw;
    const { fields, open } = splitCsv(line);
    if (open) { pending = line; continue; }
    pending = '';
    if (!header) { header = fields; continue; }
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = fields[i] ?? '';
    yield o;
  }
}

/** Read a whole table into an array (small tables only), optionally filtered/mapped. */
export async function loadTable(table, filter = null) {
  const c = cached(table);
  if (!c) throw new Error(`${table} not downloaded; run with --download`);
  const rows = [];
  for await (const r of readCsv(c.file)) if (!filter || filter(r)) rows.push(r);
  return rows;
}

/** Row count and date span of a cached table (one streaming pass). */
export async function profileTable(table, dateCol = 'date') {
  const c = cached(table);
  let n = 0, min = null, max = null, cols = null;
  for await (const r of readCsv(c.file)) {
    if (!cols) cols = Object.keys(r);
    n++;
    const d = r[dateCol];
    if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) { if (!min || d < min) min = d; if (!max || d > max) max = d; }
  }
  return { table, rows: n, columns: cols, span: min ? [min.slice(0, 10), max.slice(0, 10)] : null, bytes: c.meta?.bytes, sha256: c.meta?.sha256, fetchedAt: c.meta?.fetchedAt };
}

// ---------- seasons / dates ----------

/** Season start year by match date, July to June (the ledger's rule). */
export const seasonOf = d => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m >= 7 ? y : y - 1; };
export const seasonLabel = y => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;

/** Shift an ISO date by n days (date part only). */
export function addDays(d, n) {
  const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}

// ---------- names ----------

const SPECIAL = { 'ß': 'ss', 'ø': 'o', 'Ø': 'o', 'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'Œ': 'oe', 'đ': 'd', 'Đ': 'd', 'ł': 'l', 'Ł': 'l', 'ı': 'i', 'þ': 'th', 'ð': 'd' };

/** Fold a person name: NFKD (splits ĳ), strip marks, special letters, lowercase, letters only. */
export function foldName(s) {
  if (!s) return '';
  return s.replace(/[ßøØæÆœŒđĐłŁıþð]/g, c => SPECIAL[c]).normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['\u2019`]/g, '').replace(/[^a-z\s-]/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}
export const nameTokens = s => foldName(s).split(' ').filter(Boolean);

/** Name similarity 0..1 for two people (token-based, tolerant of middle names and order). */
export function nameScore(a, b) {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.length || !B.length) return 0;
  const ja = A.join(' '), jb = B.join(' ');
  if (ja === jb) return 1;
  if (A.join('') === B.join('')) return 0.97; // "de jong" vs "dejong"
  const setB = new Set(B);
  const shared = A.filter(t => setB.has(t));
  const lastA = A.at(-1), lastB = B.at(-1);
  // one name's tokens contained in the other's ("Neymar" / "Neymar da Silva Santos Junior")
  const small = A.length <= B.length ? A : B, big = A.length <= B.length ? setB : new Set(A);
  if (small.every(t => big.has(t))) return small.length >= 2 ? 0.92 : (lastA === lastB ? 0.85 : 0.75);
  if (lastA === lastB) {
    // same surname, first names compatible by initial
    if (A[0][0] === B[0][0]) return 0.82;
    return 0.6;
  }
  // surname transliterations (Holebas/Cholevas, Zyrianov/Zyryanov, Obaddi/Obbadi, Radosevic/Rados):
  // edit distance <= 2 on surnames of 5+ letters, or one a 5+ letter prefix of the other
  const near = (x, y) => x.length >= 5 && y.length >= 5 && (lev(x, y) <= 2 || x.startsWith(y) || y.startsWith(x));
  if (near(lastA, lastB)) {
    if (A.length > 1 && B.length > 1 && (A[0] === B[0] || lev(A[0], B[0]) <= 1)) return 0.78;
    if (A.length > 1 && B.length > 1 && A[0][0] === B[0][0]) return 0.7;
    return 0.6;
  }
  if (shared.length) return 0.45 + 0.1 * Math.min(shared.length, 3);
  // surname typo / transliteration: edit distance on the joined form
  const d = lev(ja, jb), L = Math.max(ja.length, jb.length);
  const r = 1 - d / L;
  return r >= 0.85 ? 0.7 * r : 0;
}

export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

// Club names: drop legal forms and filler so "FC Bayern München" ~ "Bayern Munich".
const CLUB_STOP = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'as', 'ss', 'ssc', 'us', 'sv', 'vfl', 'vfb', 'tsg', 'fk', 'sk', 'rc', 'cd', 'ud', 'sd', 'ca', 'rcd', 'og', 'club', 'de', 'del', 'la', 'le', 'calcio', 'football', 'futbol', 'futebol', 'fussball', 'sport', 'sporting', 'association', 'societe', 'sportiva', 'olympique', 'stade', 'real', 'athletic', 'atletico', 'borussia', 'eintracht', 'hotspur', 'united', 'city', 'town', 'albion', 'wanderers', 'rovers', 'and', 'e', 'v', 'ev', 'gmbh', 'co', 'kgaa', 'spa', 'sad', 'balompie', '1', '04', '05', '1899', '1846', '1860', '1848', '1907', '1913', '1919', 'aj', 'ogc', 'ea', 'sco', 'esta', 'fcsb', 'ssd']);
const CLUB_ALIASES = [
  [/\bmunchen\b/g, 'munich'], [/\bmuenchen\b/g, 'munich'], [/\bkoln\b/g, 'cologne'], [/\bkoeln\b/g, 'cologne'],
  [/\binternazionale\b/g, 'inter'], [/\bmilano\b/g, 'milan'], [/\btorino\b/g, 'torino'], [/\bnapoli\b/g, 'napoli'],
  [/\bpsg\b/g, 'paris saint germain'], [/\bst\b/g, 'saint'], [/\bmonchengladbach\b/g, 'gladbach'], [/\bmoenchengladbach\b/g, 'gladbach'],
  [/\bwolverhampton\b/g, 'wolves'], [/\bbrighton\b/g, 'brighton'], [/\bspurs\b/g, 'tottenham'],
  [/\bsevilla\b/g, 'sevilla'], [/\bseville\b/g, 'sevilla'], [/\bbetis\b/g, 'betis'], [/\bespanyol\b/g, 'espanyol'], [/\bespanol\b/g, 'espanyol'],
  [/\bdeportivo alaves\b/g, 'alaves'], [/\bdeportivo la coruna\b/g, 'deportivo'], [/\brc deportivo\b/g, 'deportivo'],
  [/\bhertha bsc\b/g, 'hertha'], [/\bhertha berlin\b/g, 'hertha'], [/\bhamburger\b/g, 'hamburg'], [/\bnurnberg\b/g, 'nurnberg'], [/\bnuremberg\b/g, 'nurnberg'],
  [/\bfortuna dusseldorf\b/g, 'dusseldorf'], [/\bspvgg greuther furth\b/g, 'furth'], [/\bgreuther furth\b/g, 'furth'],
  [/\bsaint etienne\b/g, 'saint etienne'], [/\bparis sg\b/g, 'paris saint germain'],
  [/\bolympiakos syndesmos filathlon peiraios\b/g, 'olympiacos'], [/\bolympiakos\b/g, 'olympiacos'], [/\bkobenhavn\b/g, 'copenhagen'],
  [/\bathlitiki enosi konstantinoupoleos\b/g, 'aek athens'], [/\bathletic club\b/g, 'athletic bilbao'],
  [/\bpanathinaikos athlitikos omilos\b/g, 'panathinaikos'], [/\bpaok thessalonikis\b/g, 'paok'],
];
export function foldClub(s) {
  let f = foldName(s.replace(/\./g, ' '));
  for (const [re, to] of CLUB_ALIASES) f = f.replace(re, to);
  return f;
}
export function clubTokens(s) {
  const t = foldClub(s).split(' ').filter(x => x && !CLUB_STOP.has(x));
  return t.length ? t : foldClub(s).split(' ').filter(Boolean);
}
/** Club name similarity 0..1. */
export function clubScore(a, b) {
  const fa = foldClub(a), fb = foldClub(b);
  if (fa === fb) return 1;
  // tie-break on the full folded tokens (stop words included), so "Manchester United" beats
  // "Manchester City" for "Manchester United" although both reduce to "manchester"
  const FA = new Set(fa.split(' ')), FB = new Set(fb.split(' '));
  const full = [...FA].filter(t => FB.has(t)).length / new Set([...FA, ...FB]).size;
  return Math.min(0.99, coreClubScore(a, b) * 0.9 + 0.1 * full);
}
function coreClubScore(a, b) {
  const A = clubTokens(a), B = clubTokens(b);
  if (!A.length || !B.length) return 0;
  if (A.join(' ') === B.join(' ')) return 1;
  const sb = new Set(B), sa = new Set(A);
  const inter = A.filter(t => sb.has(t)).length;
  if (inter) return 0.5 + 0.5 * inter / Math.min(A.length, B.length) * (inter / Math.max(A.length, B.length)) ** 0.25;
  // prefix tokens ("leverkusen" vs "bayer leverkusen" handled above; "gladbach" vs "monchengladbach")
  for (const x of A) for (const y of B) if (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x) || x.endsWith(y) || y.endsWith(x))) return 0.6;
  const ja = A.join(''), jb = B.join('');
  const r = 1 - lev(ja, jb) / Math.max(ja.length, jb.length);
  return r >= 0.7 ? 0.5 * r : 0;
}

// ---------- club map ----------
//
// Per competition-season: (1) name anchors: a TM club whose best ESPN name is >= 0.8 and clear of
// the runner-up by 0.15; (2) fixture votes: for every TM game whose opponent is anchored, the ESPN
// event on d-1..d+1 with the anchored team in the same home/away role names the other side; (3) a
// decision per club combining both. The fixture shape is the tie-breaker the brief asks for, and it
// is also the check on every name match.

const day = iso => iso.slice(0, 10);

export function buildClubMap({ tmGames, espnEvents }) {
  const groups = new Map(); // `${comp}|${season}` -> {tm:[], espn:[]}
  const g = k => groups.get(k) ?? (groups.set(k, { tm: [], espn: [] }), groups.get(k));
  for (const x of tmGames) g(`${x.comp}|${x.season}`).tm.push(x);
  for (const e of espnEvents) { const c = SLUG_TO_COMP[e.slug]; if (c) g(`${c}|${e.season}`).espn.push(e); }

  const decisions = []; // one per tm club per comp-season
  const espnUnmatched = [];
  for (const [key, { tm, espn }] of groups) {
    const [comp, season] = [key.split('|')[0], +key.split('|')[1]];
    if (!tm.length || !espn.length) continue;
    const tmClubs = new Map(), espnTeams = new Map();
    for (const x of tm) { tmClubs.set(x.homeId, x.homeName || tmClubs.get(x.homeId)); tmClubs.set(x.awayId, x.awayName || tmClubs.get(x.awayId)); }
    for (const e of espn) { espnTeams.set(e.homeId, e.homeName); espnTeams.set(e.awayId, e.awayName); }
    const byDate = new Map();
    for (const e of espn) { const d = day(e.date); (byDate.get(d) ?? byDate.set(d, []).get(d)).push(e); }
    const near = d => [addDays(d, -1), d, addDays(d, 1)].flatMap(x => byDate.get(x) ?? []);

    // name scores
    const names = new Map();
    for (const [tid, tn] of tmClubs) {
      const s = [...espnTeams].map(([eid, en]) => ({ eid, en, s: clubScore(tn, en) })).sort((a, b) => b.s - a.s);
      names.set(tid, s);
    }
    const anchor = new Map();
    for (const [tid, s] of names) if (s[0] && s[0].s >= 0.8 && (!s[1] || s[0].s - s[1].s >= 0.15)) anchor.set(tid, s[0].eid);

    // fixture votes against anchored opponents
    const votes = new Map(); // tid -> Map eid -> n ; tid -> evidence games
    const evid = new Map();
    const vote = (tid, eid) => { const m = votes.get(tid) ?? votes.set(tid, new Map()).get(tid); if (eid) m.set(eid, (m.get(eid) ?? 0) + 1); evid.set(tid, (evid.get(tid) ?? 0) + 1); };
    for (const x of tm) {
      const c = near(x.date);
      if (anchor.has(x.awayId)) { const hit = c.filter(e => e.awayId === anchor.get(x.awayId)); vote(x.homeId, hit.length === 1 ? hit[0].homeId : null); }
      if (anchor.has(x.homeId)) { const hit = c.filter(e => e.homeId === anchor.get(x.homeId)); vote(x.awayId, hit.length === 1 ? hit[0].awayId : null); }
    }
    const used = new Map();
    for (const [tid, tn] of tmClubs) {
      const s = names.get(tid);
      const v = [...(votes.get(tid) ?? new Map())].sort((a, b) => b[1] - a[1]);
      const n = evid.get(tid) ?? 0;
      const fBest = v[0]?.[0] ?? null, fShare = n ? (v[0]?.[1] ?? 0) / n : 0;
      const nBest = s[0]?.eid ?? null, nScore = s[0]?.s ?? 0, nSecond = s[1]?.s ?? 0;
      let espnId = null, method = null, review = null;
      if (fBest && fBest === nBest && fShare >= 0.6) { espnId = fBest; method = nScore >= 0.5 ? 'name+fixtures' : 'fixtures'; if (nScore < 0.3) review = 'name-weak'; }
      else if (fBest && ((fShare >= 0.8 && n >= 3) || (fShare === 1 && n >= 2))) { espnId = fBest; method = 'fixtures-over-name'; review = `name prefers ${s[0]?.en} (${nScore.toFixed(2)})`; }
      else if (nScore >= 0.8 && nScore - nSecond >= 0.15) { espnId = nBest; method = 'name-only'; if (n >= 3) review = `fixtures disagree (share ${fShare.toFixed(2)} over ${n})`; }
      else review = `unresolved: name ${s[0]?.en ?? '-'} ${nScore.toFixed(2)} / ${s[1]?.en ?? '-'} ${nSecond.toFixed(2)}, fixtures ${fShare.toFixed(2)} over ${n}`;
      const d = { comp, slug: COMPS[comp], season, tmClubId: tid, tmName: tn, espnTeamId: espnId, espnName: espnId ? espnTeams.get(espnId) : null,
        method, nameScore: +nScore.toFixed(3), nameSecond: +nSecond.toFixed(3), fixtureShare: +fShare.toFixed(3), fixtureGames: n, review };
      decisions.push(d);
      if (espnId) { if (used.has(espnId)) { d.review = (d.review ? d.review + '; ' : '') + `espn team also claimed by tm ${used.get(espnId).tmClubId}`; used.get(espnId).review ??= `espn team also claimed by tm ${tid}`; } else used.set(espnId, d); }
    }
    for (const [eid, en] of espnTeams) if (!used.has(eid)) espnUnmatched.push({ comp, slug: COMPS[comp], season, espnTeamId: eid, espnName: en });
  }

  // one entry per (comp, tm club, espn team), seasons aggregated
  const agg = new Map();
  for (const d of decisions) {
    const k = `${d.comp}|${d.tmClubId}|${d.espnTeamId}`;
    const a = agg.get(k) ?? agg.set(k, { comp: d.comp, slug: d.slug, tmClubId: d.tmClubId, tmName: d.tmName, espnTeamId: d.espnTeamId, espnName: d.espnName, seasons: [], methods: {}, minNameScore: 1, minFixtureShare: 1, fixtureGames: 0, reviews: [] }).get(k);
    a.seasons.push(d.season); a.methods[d.method ?? 'none'] = (a.methods[d.method ?? 'none'] ?? 0) + 1;
    a.minNameScore = Math.min(a.minNameScore, d.nameScore); if (d.fixtureGames) a.minFixtureShare = Math.min(a.minFixtureShare, d.fixtureShare);
    a.fixtureGames += d.fixtureGames; if (d.review) a.reviews.push(`${seasonLabel(d.season)}: ${d.review}`);
  }
  const entries = [...agg.values()].map(a => ({ ...a, seasons: a.seasons.sort((x, y) => x - y) }));
  // a tm club mapped to two espn teams in one comp, or across comps, is a review item
  const byTm = new Map();
  for (const e of entries) if (e.espnTeamId) (byTm.get(e.tmClubId) ?? byTm.set(e.tmClubId, new Set()).get(e.tmClubId)).add(e.espnTeamId);
  for (const e of entries) if (e.espnTeamId && byTm.get(e.tmClubId).size > 1) e.reviews.push(`tm club maps to several espn teams: ${[...byTm.get(e.tmClubId)].join(',')}`);

  // per comp-season lookup: tm club -> espn team, and the reverse
  const lookup = new Map();
  for (const d of decisions) if (d.espnTeamId) lookup.set(`${d.comp}|${d.season}|${d.tmClubId}`, d.espnTeamId);
  return { decisions, entries, espnUnmatched, lookup };
}

/** Pair TM games with ESPN events via the club map: same ordered pairing within +-3 days (then swapped, for neutral finals). */
export function pairGames({ tmGames, espnEvents, lookup }) {
  const idx = new Map();
  for (const e of espnEvents) { const c = SLUG_TO_COMP[e.slug]; if (!c) continue; const k = `${c}|${e.season}|${e.homeId}|${e.awayId}`; (idx.get(k) ?? idx.set(k, []).get(k)).push(e); }
  const pairs = [], tmOnly = [], usedEspn = new Set();
  const dist = (a, b) => Math.abs(Date.parse(day(a)) - Date.parse(day(b))) / 864e5;
  for (const x of tmGames) {
    const h = lookup.get(`${x.comp}|${x.season}|${x.homeId}`), a = lookup.get(`${x.comp}|${x.season}|${x.awayId}`);
    if (!h || !a) { tmOnly.push({ ...x, why: 'club-unmapped' }); continue; }
    let swapped = false;
    let c = (idx.get(`${x.comp}|${x.season}|${h}|${a}`) ?? []).filter(e => !usedEspn.has(e.id) && dist(e.date, x.date) <= 3);
    if (!c.length) { c = (idx.get(`${x.comp}|${x.season}|${a}|${h}`) ?? []).filter(e => !usedEspn.has(e.id) && dist(e.date, x.date) <= 3); swapped = c.length > 0; }
    if (!c.length) { tmOnly.push({ ...x, why: 'no-espn-event' }); continue; }
    c.sort((p, q) => dist(p.date, x.date) - dist(q.date, x.date));
    const e = c[0]; usedEspn.add(e.id);
    pairs.push({ tmGameId: x.gameId, espnId: e.id, comp: x.comp, slug: e.slug, season: x.season, tmDate: x.date, espnDate: e.date, dayDiff: dist(e.date, x.date), swapped,
      tmHome: x.homeId, tmAway: x.awayId, espnHome: swapped ? a : h, espnAway: swapped ? h : a, tmScore: `${x.homeGoals}-${x.awayGoals}`, espnScore: `${e.homeScore}-${e.awayScore}` });
  }
  const espnOnly = espnEvents.filter(e => SLUG_TO_COMP[e.slug] && !usedEspn.has(e.id));
  return { pairs, tmOnly, espnOnly };
}

// ---------- player map ----------
//
// Within one club-season (ESPN team id + season, every in-scope competition together): candidates
// need a name score >= 0.6. Confidence = 0.6 x name + 0.4 x co-appearance Jaccard over the paired
// games (name x 0.9 when no paired game holds either player), +0.2 for an equal DOB, -0.5 for a
// different one. One-to-one, greedy by confidence, accepted at >= 0.55. Left-overs that co-appear in
// >= 5 paired games with Jaccard >= 0.9 are proposed as `review` (name too different) and kept out
// of the gate: matching on co-appearance alone would make the appearance check circular.

export const PLAYER_ACCEPT = 0.55;
// high needs a name score >= 0.8 too: a mononym contained in a full name (Adrián / Adrián López) is medium at best
export function levelOf(conf, ns = 1) { return conf >= 0.85 && ns >= 0.8 ? 'high' : conf >= 0.7 ? 'medium' : 'low'; }

export function matchClubSeason({ espnPlayers, tmPlayers, dobEspn = new Map(), dobTm = new Map() }) {
  // espnPlayers / tmPlayers: Map id -> {name, names:[...], games:Set(pairKey)}
  const cands = [];
  for (const [eid, e] of espnPlayers) for (const [tid, t] of tmPlayers) {
    let ns = 0;
    for (const a of e.names) for (const b of t.names) ns = Math.max(ns, nameScore(a, b));
    let both = 0; for (const g of e.games) if (t.games.has(g)) both++;
    const either = e.games.size + t.games.size - both;
    const jac = either ? both / either : null;
    if (ns < 0.6) { if (jac !== null && jac >= 0.9 && both >= 1) cands.push({ eid, tid, ns, jac, both, conf: 0.5, coappOnly: true }); continue; }
    let conf = jac === null ? ns * 0.9 : 0.6 * ns + 0.4 * jac;
    const de = dobEspn.get(eid), dt = dobTm.get(tid);
    let dob = null;
    if (de && dt) { dob = de === dt; conf += dob ? 0.2 : -0.5; }
    cands.push({ eid, tid, ns, jac, both, conf: Math.min(1, conf), dob, coappOnly: false });
  }
  cands.sort((a, b) => (a.coappOnly - b.coappOnly) || b.conf - a.conf || b.ns - a.ns);
  const takenE = new Set(), takenT = new Set(), matched = [], review = [];
  for (const c of cands) {
    if (takenE.has(c.eid) || takenT.has(c.tid)) continue;
    if (c.coappOnly) { review.push(c); takenE.add(c.eid); takenT.add(c.tid); continue; }
    if (c.conf < PLAYER_ACCEPT) continue;
    // ambiguity: a second candidate for either side within 0.05
    const rival = cands.find(o => o !== c && !o.coappOnly && ((o.eid === c.eid && !takenT.has(o.tid)) || (o.tid === c.tid && !takenE.has(o.eid))) && c.conf - o.conf < 0.05);
    matched.push({ ...c, level: levelOf(c.conf, c.ns), ambiguous: rival ? (rival.eid === c.eid ? `tm ${rival.tid}` : `espn ${rival.eid}`) : null });
    takenE.add(c.eid); takenT.add(c.tid);
  }
  return { matched, review, espnLeft: [...espnPlayers.keys()].filter(k => !takenE.has(k)), tmLeft: [...tmPlayers.keys()].filter(k => !takenT.has(k)) };
}

// ---------- gate tolerances and per-match diagnosis ----------

// Season-level tolerances, per stat (see pipeline/docs/transfermarkt-gate.md):
//   apps    0  both count a sub appearance; ESPN rows are starters plus subs who came on
//   goals   0  own goals excluded on both sides
//   assists 1 + floor(max/10)  Transfermarkt's own assist rules (second assists, won penalties)
//   minutes 3 per common appearance, floor 5   ESPN drops stoppage from sub clocks (a 90+2 sub is 0'),
//           Transfermarkt rounds a stoppage sub to 1' and both cap at 90/120
export const TOL = {
  apps: () => 0,
  goals: () => 0,
  assists: (e, t) => 1 + Math.floor(Math.max(e ?? 0, t ?? 0) / 10),
  minutes: apps => Math.max(5, 3 * apps),
};
export const MATCH_MINUTES_STOPPAGE = 3; // per-match |delta| treated as a stoppage/clock artefact

/** Diagnose one paired game for one player. e/t are the per-match rows (or null). side: ESPN lineup of his team. */
export function diagnoseGame(e, t, side, tmLineupType) {
  const out = [];
  if (t && !e) {
    if (side?.collapsed) out.push('espn-roster-collapsed');
    else if (side?.missing) out.push('espn-roster-missing');
    else out.push('espn-player-absent');
    return out;
  }
  if (e && !t) { out.push(tmLineupType === 'substitutes' ? 'tm-unused-sub' : tmLineupType ? 'tm-no-appearance' : 'tm-player-absent'); return out; }
  if (!e || !t) return out;
  if (e.goals !== null && e.goals !== t.goals) out.push('goal-credit');
  if (e.assists !== null && e.assists !== t.assists) out.push('assist-credit');
  if (e.minutes === null) out.push('espn-minutes-null');
  else if (e.minutes !== t.minutes) {
    // small deltas: 'minutes-stoppage' when a clock involved is 90+ or 120+ (ESPN drops stoppage, so a
    // 90+2 sub has 0'; TM gives him 1'), else 'minutes-clock' (TM puts a substitution a minute earlier
    // than ESPN's clock: starter off 70 in ESPN is 69' in TM, his replacement 20' vs 21')
    const late = [e.subIn, e.subOff, e.sentOff].some(m => m != null && (m >= 90 && m < 91 || m >= 120)) || (e.subIn != null && e.minutes === 0);
    out.push(Math.abs(e.minutes - t.minutes) > MATCH_MINUTES_STOPPAGE ? 'minutes-other' : late ? 'minutes-stoppage' : 'minutes-clock');
  }
  return out;
}
