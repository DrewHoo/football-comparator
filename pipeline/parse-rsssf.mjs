#!/usr/bin/env node
// Parse cached RSSSF per-player international cap logs into rows, join each cap to martj42's results,
// and report coverage. Reads only the cache (data/raw/rsssf/, filled by harvest-rsssf.mjs); never fetches RSSSF.
//
//   node pipeline/parse-rsssf.mjs                    # every log in the TSV that is cached
//   node pipeline/parse-rsssf.mjs --only cronaldo-intlg.html,messi-intlg.html
//   node pipeline/parse-rsssf.mjs --limit 50
//   node pipeline/parse-rsssf.mjs --gate             # also run the Ronaldo/Messi gates (exit 1 on failure)
//   node pipeline/parse-rsssf.mjs --gate --gate-only # gates on the already-written index, no reparse
//
// Writes data/index/rsssf/<slug>.json, data/index/rsssf-caps.jsonl, data/index/rsssf-coverage.csv,
// data/index/rsssf-formats.csv (unparsed/short logs by format, with example URLs) and data/index/rsssf-gates.json.
//
// line_quote is the row's line verbatim from the page text as this script extracts it: bytes decoded
// (rsssf.mjs decode), comments/scripts dropped, <br>/<p>/<tr> as newlines, other tags removed, entities decoded.

import fs from 'node:fs'
import path from 'node:path'
import { cachedBody, cachedMeta, decode, canon, ROOT } from './lib/rsssf.mjs'

const args = process.argv.slice(2)
const flag = (k) => args.includes(k)
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d)
const TSV = opt('--tsv', path.join(ROOT, 'research/intl/rsssf-player-logs.tsv'))
const MJ = path.join(ROOT, 'data/raw/martj42')
const OUT = path.join(ROOT, 'data/index')
const ONLY = opt('--only', null)?.split(',').map((s) => s.trim().replace(/\.html$/, '') + '.html')
const LIMIT = Number(opt('--limit', Infinity))
// partial runs (--only / --limit) never overwrite the combined outputs of a full run
const SUFFIX = ONLY || LIMIT !== Infinity ? '.partial' : ''

// ------------------------------------------------------------------------------------------
// martj42 results + team names
// ------------------------------------------------------------------------------------------
function latest(prefix) {
  const f = fs.readdirSync(MJ).filter((x) => x.startsWith(prefix + '-') && x.endsWith('.csv')).sort().pop()
  if (!f) throw new Error(`no ${prefix}-YYYY-MM-DD.csv in ${MJ}`)
  return path.join(MJ, f)
}
function csv(file) {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').trim().split('\n')
  const cols = head.split(',')
  return lines.map((l) => {
    const v = []
    let cur = '',
      q = false
    for (const ch of l) {
      if (ch === '"') q = !q
      else if (ch === ',' && !q) {
        v.push(cur)
        cur = ''
      } else cur += ch
    }
    v.push(cur)
    return Object.fromEntries(cols.map((c, i) => [c, v[i]]))
  })
}
const RESULTS_FILE = latest('results')
const RESULTS = csv(RESULTS_FILE)
const BYDATE = new Map()
for (const r of RESULTS) {
  if (!BYDATE.has(r.date)) BYDATE.set(r.date, [])
  BYDATE.get(r.date).push(r)
}
const TEAMS = new Set(RESULTS.flatMap((r) => [r.home_team, r.away_team]))
const TEAM_MATCHES = new Map()
for (const r of RESULTS) for (const t of [r.home_team, r.away_team]) (TEAM_MATCHES.get(t) ?? TEAM_MATCHES.set(t, []).get(t)).push(r)

const strip = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ø/gi, 'o')
    .replace(/æ/gi, 'ae')
    .replace(/ı/g, 'i')
    .toLowerCase()
const norm = (s) =>
  strip(s)
    .replace(/&/g, ' and ')
    .replace(/\[[^\]]*\]|\([^)]*\)|\*/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// RSSSF spelling -> martj42 team(s). Keys are norm()'d.
const ALIAS = {}
const al = (to, ...from) => {
  for (const f of from) (ALIAS[norm(f)] ??= new Set()).add(to)
}
al('Northern Ireland', 'N. Ireland', 'N Ireland', 'North. Ireland', 'Northern Ireland', 'Ireland', 'Irland', 'Nordirland', 'Irlande du Nord', 'Irlanda del Norte')
al('Republic of Ireland', 'Ireland', 'Rep. of Ireland', 'Rep. Ireland', 'Republic of Ireland', 'Eire', 'Éire', 'Irish Free State', 'Irish F.S.', 'Irland', 'Irlanda', 'Irlande', 'Ierland', 'Ireland Rep.')
al('United States', 'USA', 'U.S.A.', 'US', 'United States of America', 'U.S.', 'Estados Unidos', 'Vereinigte Staaten')
al('South Korea', 'Korea', 'Korea Republic', 'Korea Rep.', 'Korea (South)', 'Rep. of Korea', 'S. Korea', 'South-Korea', 'Korea, South', 'Corea del Sur', 'Südkorea')
al('North Korea', 'Korea DPR', 'Korea D.P.R.', 'DPR Korea', 'Korea (North)', 'N. Korea', 'North-Korea', 'Korea, North', 'Nordkorea')
al('Russia', 'Soviet Union', 'USSR', 'U.S.S.R.', 'CIS', 'C.I.S.', 'Sowjetunion', 'UdSSR', 'URSS', 'Rusia', 'Russland', 'Unión Soviética')
al('Germany', 'West Germany', 'W. Germany', 'FRG', 'BRD', 'Germany FR', 'Deutschland', 'Alemania', 'Allemagne', 'Germania', 'Duitsland', 'Saarland')
al('German DR', 'East Germany', 'E. Germany', 'GDR', 'DDR', 'Germany DR', 'German D.R.')
al('Saarland', 'Saar', 'Saarland')
al('Czechoslovakia', 'CSSR', 'ČSSR', 'Czecho-Slovakia', 'Tschechoslowakei', 'Checoslovaquia', 'Bohemia', 'Bohemia-Moravia', 'Bohemia and Moravia', 'RCS')
al('Czech Republic', 'Czech Rep.', 'Czechia', 'Tschechien', 'Czech Republic')
al('Slovakia', 'Slovak Republic', 'Slowakei')
al('Yugoslavia', 'Yugoslavia', 'Jugoslawien', 'Jugoslavia', 'SFR Yugoslavia', 'Kingdom of SCS')
al('Serbia', 'Yugoslavia', 'FR Yugoslavia', 'Serbia-Monten.', 'Serbia-Montenegro', 'Serbia & Montenegro', 'Serbia and Montenegro', 'Serbia-Mont.', 'Serbien', 'Serbia/Montenegro', 'Serb.-Monten.', 'Serbia-Mont')
al('DR Congo', 'Zaire', 'Zaïre', 'Congo-Kinshasa', 'Congo DR', 'Congo (DR)', 'D.R. Congo', 'Congo-Kin.', 'Congo Kinshasa', 'Congo-Léopoldville', 'DR Kongo')
al('Congo', 'Congo-Brazzaville', 'Congo Brazzaville', 'Congo-Brazza.', 'Congo (Brazzaville)', 'Congo-Br.')
al('Netherlands', 'Holland', 'Niederlande', 'Holanda', 'Pays-Bas', 'Olanda', 'Nederland')
al('Brazil', 'Brasil', 'Brasilien', 'Brésil')
al('United Arab Emirates', 'UAE', 'U.A.E.', 'Utd. Arab Emirates', 'Utd Arab Emirates', 'United Arab Emir.', 'U.A. Emirates', 'Arab Emirates', 'Emirates')
al('Ivory Coast', "Côte d'Ivoire", 'Cote d Ivoire', 'Ivory Coast', 'Elfenbeinküste')
al('Bosnia and Herzegovina', 'Bosnia-Herzegovina', 'Bosnia-Herz.', 'Bosnia', 'Bosnia & Herzegovina', 'Bosnia-H.', 'Bosnia-Herzegov.', 'Bosnia and Herz.')
al('North Macedonia', 'Macedonia', 'FYR Macedonia', 'F.Y.R. Macedonia', 'FYROM', 'Mazedonien', '(North) Macedonia')
al('Eswatini', 'Swaziland')
al('Myanmar', 'Burma')
al('China', 'China PR', 'P.R. China', 'PR China', 'China P.R.', "China People's Rep.")
al('Taiwan', 'Chinese Taipei', 'Formosa', 'Taiwan', 'China Taipei', 'Rep. of China')
al('Turkey', 'Türkiye', 'Turkiye', 'Türkei', 'Turquía')
al('Cape Verde', 'Cape Verde Islands', 'Cabo Verde', 'Cape Verde Isl.')
al('Iran', 'IR Iran', 'Iran')
al('England', 'Inglaterra', 'Angleterre', 'Inghilterra', 'Engeland')
al('Scotland', 'Schottland', 'Escocia', 'Écosse')
al('Wales', 'Gales', 'Pays de Galles')
al('Spain', 'España', 'Spanien', 'Espagne', 'Spagna')
al('Italy', 'Italia', 'Italien', 'Italie')
al('France', 'Frankreich', 'Francia')
al('Austria', 'Österreich', 'Oesterreich', 'Autriche')
al('Switzerland', 'Schweiz', 'Suiza', 'Suisse', 'Svizzera')
al('Hungary', 'Ungarn', 'Hungría', 'Hongrie', 'Ungheria')
al('Sweden', 'Schweden', 'Suecia', 'Suède')
al('Denmark', 'Dänemark', 'Dinamarca', 'Danemark')
al('Norway', 'Norwegen', 'Noruega', 'Norvège')
al('Finland', 'Finnland', 'Finlandia')
al('Poland', 'Polen', 'Polonia', 'Pologne')
al('Belgium', 'Belgien', 'Bélgica', 'Belgique', 'Belgio')
al('Portugal', 'Portogallo')
al('Greece', 'Griechenland', 'Grecia', 'Grèce')
al('Romania', 'Rumänien', 'Rumania', 'Roumanie', 'Rumanía')
al('Bulgaria', 'Bulgarien', 'Bulgarie')
al('Argentina', 'Argentinien', 'Argentine')
al('Uruguay', 'Uruguay')
al('Mexico', 'México', 'Mexiko')
al('Peru', 'Perú')
al('Japan', 'Japón', 'Japon')
al('Saudi Arabia', 'Saudi-Arabia', 'Saudi Arab.', 'Saudi-Arabien', 'KSA')
al('Trinidad and Tobago', 'Trinidad & Tobago', 'Trinidad', 'Trinidad-Tobago', 'T&T')
al('Antigua and Barbuda', 'Antigua & Barbuda', 'Antigua')
al('Saint Kitts and Nevis', 'St. Kitts & Nevis', 'St. Kitts and Nevis', 'St Kitts & Nevis', 'St. Kitts', 'St Kitts and Nevis', 'St.Kitts & Nevis')
al('Saint Lucia', 'St. Lucia', 'St Lucia')
al('Saint Vincent and the Grenadines', 'St. Vincent & Gren.', 'St. Vincent', 'St. Vincent & Grenadines', 'St Vincent', 'St. Vincent and the Grenadines', 'St.Vincent & Gren.')
al('United States Virgin Islands', 'US Virgin Islands', 'U.S. Virgin Islands', 'US Virgin Isl.')
al('British Virgin Islands', 'Br. Virgin Islands', 'BVI', 'British Virgin Isl.')
al('Central African Republic', 'Central Afr. Rep.', 'C.A.R.', 'CAR', 'Centr. Afr. Rep.', 'Central African Rep.')
al('Equatorial Guinea', 'Eq. Guinea', 'Equat. Guinea')
al('Guinea-Bissau', 'Guinea Bissau')
al('São Tomé and Príncipe', 'Sao Tome & Principe', 'São Tomé e Príncipe', 'Sao Tome', 'São Tomé & Príncipe')
al('Papua New Guinea', 'Papua N. Guinea', 'PNG', 'Papua New Guin.')
al('New Zealand', 'N. Zealand', 'NZ')
al('South Africa', 'S. Africa', 'RSA')
al('Kyrgyzstan', 'Kyrgyz Republic', 'Kirgizstan', 'Kyrgyzia')
al('Hong Kong', 'Hongkong', 'Hong Kong China')
al('Macau', 'Macao')
al('Brunei', 'Brunei Darussalam')
al('Vietnam', 'Viet Nam')
al('Vietnam Republic', 'South Vietnam', 'S. Vietnam', 'Vietnam Rep.', 'Rep. of Vietnam')
al('North Vietnam', 'Vietnam DR', 'N. Vietnam', 'DR Vietnam')
al('Yemen', 'North Yemen', 'Yemen AR', 'N. Yemen')
al('Yemen DPR', 'South Yemen', 'Yemen DR', 'Yemen PDR', 'S. Yemen')
al('Curaçao', 'Dutch Antilles', 'Ned. Antilles', 'Netherl. Antilles')
al('Cambodia', 'Khmer Republic', 'Kampuchea', 'Khmer Rep.')
al('Iran', 'Islam. Rep. Iran', 'Islamic Rep. Iran', 'Iran IR')
al('Saint Pierre and Miquelon', "S.Pierre/M'lon", 'St. Pierre & Miquelon', 'St. Pierre/Miquelon')
al('Equatorial Guinea', 'Equi. Guinea')
al('Trinidad and Tobago', 'T.Tobago', 'T. Tobago')
al('United Arab Emirates', 'SAE')
al('Faroe Islands', 'Islas Feroe')
al('Palestine', 'Palestina')
al('Israel', 'Mandatory Palestine', 'Eretz Israel')
al('Egypt', 'United Arab Republic', 'U.A.R.', 'UAR', 'Egypte', 'Ägypten')
al('Timor-Leste', 'East Timor', 'Timor Leste')
al('Curaçao', 'Curacao', 'Netherlands Antilles', 'Neth. Antilles', 'Ned. Antillen', 'Neth Antilles')
al('Suriname', 'Surinam', 'Dutch Guyana')
al('Guyana', 'British Guiana', 'Br. Guiana')
al('Zimbabwe', 'Rhodesia', 'Southern Rhodesia')
al('Zambia', 'Northern Rhodesia')
al('Benin', 'Dahomey')
al('Burkina Faso', 'Upper Volta', 'Burkina')
al('Ghana', 'Gold Coast')
al('Sri Lanka', 'Ceylon')
al('Malaysia', 'Malaya')
al('Indonesia', 'Dutch East Indies')
al('Tanzania', 'Tanganyika')
al('Samoa', 'Western Samoa')
al('American Samoa', 'Am. Samoa')
al('Vanuatu', 'New Hebrides')
al('Djibouti', 'French Somaliland')
al('Malawi', 'Nyasaland')
al('Gambia', 'The Gambia')
al('Bahamas', 'The Bahamas')
al('Moldova', 'Moldavia')
al('Belarus', 'Byelorussia', 'Belorussia', 'Weißrussland')
al('Georgia', 'Georgien')
al('Liechtenstein', 'Liecht.')
al('Luxembourg', 'Luxemburg', 'Luxemburgo')
al('Faroe Islands', 'Faroes', 'Faroer', 'Färöer', 'Faroe Isl.', 'Faeroe Islands', 'Faeroes')
al('Iceland', 'Island')
al('Kosovo', 'Kosova')
al('Montenegro', 'Crna Gora')
al('Croatia', 'Kroatien', 'Croacia', 'Hrvatska')
al('Slovenia', 'Slowenien')
al('Ukraine', 'Ucrania')
al('Lithuania', 'Litauen')
al('Latvia', 'Lettland')
al('Estonia', 'Estland')
al('Cyprus', 'Zypern')
al('Turkmenistan', 'Turkmenia')
al('Kazakhstan', 'Kasachstan')
al('Dominican Republic', 'Dominican Rep.', 'Dom. Republic', 'Dom. Rep.')
al('Costa Rica', 'Costa-Rica')
al('El Salvador', 'Salvador')
al('Morocco', 'Marokko', 'Maroc', 'Marruecos')
al('Algeria', 'Algerien', 'Algérie')
al('Tunisia', 'Tunesien', 'Tunisie')
al('Cameroon', 'Kamerun', 'Cameroun')
al('Nigeria', 'Nigéria')
al('Mauritania', 'Mauretanien')
al('Comoros', 'Comoro Islands', 'Comores')
al('Réunion', 'Reunion')
al('Mauritius', 'Maurice')
al('Lebanon', 'Libanon', 'Liban')
al('Syria', 'Syrien')
al('Jordan', 'Jordanien')
al('Bahrain', 'Bahrein')
al('Qatar', 'Katar')
al('Kuwait', 'Kuweit')
al('Oman', 'Oman')
al('Iraq', 'Irak')
al('Afghanistan', 'Afganistan')
al('Mongolia', 'Mongolei')
al('Philippines', 'Phillipines', 'Philipines')
al('Thailand', 'Siam')
al('Ethiopia', 'Abyssinia')
al('Somalia', 'Somaliland')
al('Sudan', 'Soudan')
al('Guadeloupe', 'Guadeloupe')
al('Martinique', 'Martinique')
al('French Guiana', 'French Guyana', 'Guyane')
al('Saint Martin', 'St. Martin')
al('Sint Maarten', 'St. Maarten')
al('Northern Mariana Islands', 'N. Mariana Islands', 'Northern Marianas')
al('Turks and Caicos Islands', 'Turks & Caicos', 'Turks & Caicos Isl.', 'Turks and Caicos')
al('Cayman Islands', 'Cayman Isl.', 'Caymans')
al('Solomon Islands', 'Solomon Isl.', 'Solomons')
al('Cook Islands', 'Cook Isl.')
al('Kenya', 'Kenia')
al('United Arab Emirates', 'UA Emirates', 'U.A. Emirates', 'UA Emir.')
al('Trinidad and Tobago', 'Trinidad/Tobago', 'Trin. & Tobago')
al('Saint Vincent and the Grenadines', 'St. Vincent/Gr.', 'St.Vincent/Gr.', 'St. Vincent/Grenadines')
al('Saint Kitts and Nevis', 'St. Kitts/Nevis', 'St.Kitts/Nevis')
al('Bosnia and Herzegovina', 'Bosnia-Herzeg.', 'Bosnia/Herzegovina')
al('Dominican Republic', 'Dominican R.', 'Dominican Rep')
al('Antigua and Barbuda', 'Antigua/Barbuda')
al('Turks and Caicos Islands', 'Turks/Caicos')
al('Cayman Islands', 'Cayman Isl')
al('São Tomé and Príncipe', 'Sao Tome/Principe', 'São Tomé/Príncipe')
for (const r of fs.existsSync(path.join(MJ)) ? csv(latest('former_names')) : []) al(r.current, r.former)
for (const t of TEAMS) al(t, t)

function dice(a, b) {
  a = a.replace(/ /g, '')
  b = b.replace(/ /g, '')
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const g = (s) => {
    const m = new Map()
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1)
    return m
  }
  const A = g(a),
    B = g(b)
  let x = 0
  for (const [k, v] of A) x += Math.min(v, B.get(k) || 0)
  return (2 * x) / (a.length - 1 + (b.length - 1))
}
/** similarity in [0,1] between an RSSSF opponent spelling and a martj42 team name */
const simCache = new Map()
function sim(rs, team) {
  const key = rs + '|' + team
  if (simCache.has(key)) return simCache.get(key)
  const n = norm(rs)
  let s = 0
  if (!n) s = 0
  else if (ALIAS[n]?.has(team)) s = 1
  else {
    const t = norm(team)
    s = dice(n, t)
    if (n.length >= 4 && (t.startsWith(n) || n.startsWith(t))) s = Math.max(s, 0.85)
    // abbreviated forms: "Serbia-Monten." "Utd. Arab Emir."
    const nw = n.split(' '),
      tw = t.split(' ')
    if (nw.length > 1 && nw.length === tw.length && nw.every((w, i) => tw[i].startsWith(w))) s = Math.max(s, 0.9)
    for (const a of Object.keys(ALIAS)) if (a && n.startsWith(a) && a.length >= 5 && ALIAS[a].has(team)) s = Math.max(s, 0.8)
  }
  simCache.set(key, s)
  return s
}
const isKnownTeam = (s) => {
  const n = norm(s)
  return !!n && (!!ALIAS[n] || LEXICON.has(n))
}
const LEXICON = new Map() // learned opponent spellings (norm -> count) from cleanly split rows

// ------------------------------------------------------------------------------------------
// page text
// ------------------------------------------------------------------------------------------
const ENT = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", shy: '', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  hellip: '…', middot: '·', deg: '°', szlig: 'ß', laquo: '«', raquo: '»', copy: '©', reg: '®', frac12: '½', iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', euro: '€',
}
for (const [base, kinds] of Object.entries({ A: 'grave acute circ tilde uml ring', E: 'grave acute circ uml', I: 'grave acute circ uml', O: 'grave acute circ tilde uml', U: 'grave acute circ uml' }))
  for (const k of kinds.split(' '))
    for (const b of [base, base.toLowerCase()]) ENT[b + k] = (b + { grave: '\u0300', acute: '\u0301', circ: '\u0302', tilde: '\u0303', uml: '\u0308', ring: '\u030a' }[k]).normalize('NFC')
Object.assign(ENT, { Ntilde: 'Ñ', ntilde: 'ñ', Ccedil: 'Ç', ccedil: 'ç', Oslash: 'Ø', oslash: 'ø', AElig: 'Æ', aelig: 'æ', yacute: 'ý', Yacute: 'Ý', yuml: 'ÿ', eth: 'ð', ETH: 'Ð', thorn: 'þ', THORN: 'Þ', Scaron: 'Š', scaron: 'š', Zcaron: 'Ž', zcaron: 'ž' })
const unescape = (s) =>
  s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n] ?? m)

export function pageText(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
  // one tag at a time; a tag never spans a '<' (some pages have an unclosed "<A" before the table)
  const BLOCK = /^(br|p|div|tr|li|h\d|table|pre|ul|ol|menu|hr)$/i
  s = s.replace(/<(\/?)([a-zA-Z][\w]*)\b[^<>]*>/g, (_, close, tag) => (BLOCK.test(tag) ? '\n' : close && /^t[dh]$/i.test(tag) ? '\t' : ''))
  s = s.replace(/<[a-zA-Z]+\s*(?=\n)/g, '')
  return unescape(s).replace(/\r\n?/g, '\n').replace(/ /g, ' ')
}

// ------------------------------------------------------------------------------------------
// one page -> raw rows
// ------------------------------------------------------------------------------------------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, mrt: 3, mei: 5, okt: 10, dez: 12, mai: 5, ene: 1, abr: 4, ago: 8, dic: 12 }
const DATE_RES = [
  // 20- 8-03, 20.08.2003, 27/ 4/77, 1-3-1906 (same separator twice)
  { re: /(?<![\d])(\d{1,2})\s*([-./])\s*(\d{1,2})\s*\2\s*(\d{4}|\d{2})(?![\d])/, f: (m) => ({ d: +m[1], mo: +m[3], y: m[4] }) },
  { re: /(?<![\d])(\d{4})-(\d{2})-(\d{2})(?![\d])/, f: (m) => ({ d: +m[3], mo: +m[2], y: m[1] }) },
  { re: /(?<![\d])(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4}|\d{2})(?![\d])/, f: (m) => (MONTHS[m[2].toLowerCase()] ? { d: +m[1], mo: MONTHS[m[2].toLowerCase()], y: m[3] } : null) },
  { re: /\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(?![\d])/, f: (m) => (MONTHS[m[1].toLowerCase()] ? { d: +m[2], mo: MONTHS[m[1].toLowerCase()], y: m[3] } : null) },
]
// hand-typed slips: mixed separators ("29- 2/12", "05.09,2009", "17. 5 24", "18 2-04") and one-digit years ("29- 3- 0").
// Only tried when the strict patterns find nothing on the line, and at least one separator must be punctuation.
const LOOSE = /(?<![\d])(\d{1,2})(\s*[-./,\u2013\u2014]\s*| +)(\d{1,2})(\s*[-./,\u2013\u2014]\s*| +)(\d{4}|\d{1,2})(?![\d])(?=\s+[^\d\s])/
function findDateLoose(s) {
  const m = s.match(LOOSE)
  if (!m || (!m[2].trim() && !m[4].trim())) return null
  const d = +m[1],
    mo = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return { d, mo, y: m[5].length === 1 ? '0' + m[5] : m[5], index: m.index, length: m[0].length, raw: m[0], loose: true }
}
function findDate(s) {
  let best = null
  for (const { re, f } of DATE_RES) {
    const m = s.match(re)
    if (!m) continue
    const v = f(m)
    if (!v || v.mo < 1 || v.mo > 12 || v.d < 1 || v.d > 31) continue
    if (!best || m.index < best.index) best = { ...v, index: m.index, length: m[0].length, raw: m[0] }
  }
  return best
}
// a score: 2-1, 2 - 1, 2:1, plus awarded/abandoned markers. Must be preceded by whitespace or start.
const SCORE_RE = /(?:^|(?<=[\s\t]))(\d{1,2}\s?[-–:]\s?\d{1,2}|awd\.?|awarded|w\/o|abd\.?|aband\.?|abandoned|n\/p|\?-\?|[0-9?]-[0-9?])(?=$|[\s\t\[(*,;.†#+]|aet|a\.e\.t|pen)/i
const HDR_KEYS = {
  cap: /\b(caps?|no\.?|nr\.?|match|games?|#|apps?)\b/i,
  goals: /\b(goals?|gls?|tore|goles)\b/i,
  date: /\b(date|datum|fecha)\b/i,
  venue: /\b(venue|place|city|ground|stadium|location|where|ort|lugar|h\/a)\b/i,
  opp: /\b(opponents?|against|adversary|gegner|rival|opp\.?)\b/i,
  score: /\b(score|result|res\.?|ergebnis)\b/i,
  comp: /\b(competition|type|tournament|comp\.?|occasion|event)\b/i,
  min: /\b(minutes?|mins?\.?)\b/i,
}
function headerLayout(h) {
  const pos = {}
  for (const [k, re] of Object.entries(HDR_KEYS)) {
    const m = h.match(re)
    if (m) pos[k] = m.index
  }
  return pos
}

function splitCells(s) {
  return s
    .split(/\t+| {2,}/)
    .map((x) => x.trim())
    .filter(Boolean)
}
/** split "venue opponent" (or "opponent venue") text into its two parts */
function splitVenueOpp(s, oppFirst, hasVenue) {
  const cells = splitCells(s)
  if (!hasVenue) {
    // the header names no venue, but some editors still type one: "Los Angeles     Mexico"
    if (cells.length >= 2 && isKnownTeam(cells.at(-1)) && !isKnownTeam(cells.join(' '))) return { venue: cells.slice(0, -1).join(' '), opponent: cells.at(-1), how: 'no-venue-col-but-venue' }
    return { opponent: cells.join(' '), venue: null, how: 'no-venue-col' }
  }
  if (cells.length === 2) return oppFirst ? { opponent: cells[0], venue: cells[1], how: 'cells' } : { venue: cells[0], opponent: cells[1], how: 'cells' }
  if (cells.length > 2) {
    // pick the cell that is a known team, preferring the expected side
    const order = oppFirst ? cells.map((_, i) => i) : cells.map((_, i) => cells.length - 1 - i)
    for (const i of order)
      if (isKnownTeam(cells[i])) return { opponent: cells[i], venue: cells.filter((_, j) => j !== i).join(' '), how: 'cells-team' }
    return oppFirst ? { opponent: cells[0], venue: cells.slice(1).join(' '), how: 'cells-guess' } : { venue: cells.slice(0, -1).join(' '), opponent: cells.at(-1), how: 'cells-guess' }
  }
  if (!cells.length) return { venue: null, opponent: null, how: 'empty' }
  const w = cells[0].split(' ')
  if (w.length === 1) return { opponent: w[0], venue: null, how: 'single-word' }
  // single-space separated: longest known team at the expected end
  if (!oppFirst) {
    for (let k = 1; k < w.length; k++) {
      const opp = w.slice(k).join(' ')
      if (isKnownTeam(opp)) return { venue: w.slice(0, k).join(' '), opponent: opp, how: 'lexicon' }
    }
    return { venue: w.slice(0, -1).join(' '), opponent: w.at(-1), how: 'last-word-guess' }
  }
  for (let k = w.length - 1; k >= 1; k--) {
    const opp = w.slice(0, k).join(' ')
    if (isKnownTeam(opp)) return { opponent: opp, venue: w.slice(k).join(' '), how: 'lexicon' }
  }
  return { opponent: w[0], venue: w.slice(1).join(' '), how: 'first-word-guess' }
}

function statedTotals(t) {
  const one = t.replace(/\s+/g, ' ')
  let caps = null,
    goals = null
  let m
  // the table's own "Total Record" line: "Matches Won Draw Lost ..." then the numbers
  const recs = [...t.matchAll(/Total\s+Record[^\n]*\n(?:[^\n]*\n){0,2}?\s*(?:Matches|GP|Games|Played)\b[^\n]*\n\s*(\d+)\s+\d+\s+\d+\s+\d+/gi)]
  // two-team pages: one Total Record per team, sometimes plus a combined one (then the largest is the sum of the rest)
  const recN = recs.map((r) => +r[1])
  const recMax = recN.length ? Math.max(...recN) : null
  const recSum = recN.reduce((a, b) => a + b, 0)
  const record = !recN.length ? null : recN.length > 2 && recMax * 2 === recSum ? recMax : recSum
  if ((m = one.match(/Total\s+caps\s*\/\s*goals\s*:?\s*(\d+)\s+(\d+)/i))) return { caps: +m[1], goals: +m[2], how: 'total-line', record }
  if ((m = one.match(/Total\s+caps\s*:?\s*(\d+)/i) || one.match(/\bCaps\s*\(\s*total\s*\)\s*:?\s*(\d+)/i))) caps = +m[1]
  if (!caps) {
    // "Caps: 3 for Croatia" + "Caps: 33 for North Macedonia", or "Caps (Argentina): 6" + "Caps (Spain): 31"
    const per = [
      ...[...t.matchAll(/^\s*Caps\s*(?:\(([^)]+)\))?\s*:\s*(\d+)\s*(?:for\s+([^\n(\t]+))?/gim)].filter((x) => x[1] || x[3]),
      ...[...t.matchAll(/^\s*Caps\s+for\s+([^:\n]+?)\s*:\s*(\d+)/gim)].map((x) => [x[0], x[1], x[2], undefined]),
    ]
    const labels = new Set(per.map((x) => (x[1] || x[3]).trim().toLowerCase()))
    if (per.length >= 2 && labels.size === per.length) {
      caps = per.reduce((a, x) => a + +x[2], 0)
      return { caps, goals: null, how: 'sum-per-team', record }
    }
  }
  let how = caps ? 'total-caps' : null
  if (!caps && (m = one.match(/\bCaps\s*:\s*(\d+)/))) [caps, how] = [+m[1], 'caps-line']
  if (!caps && record) [caps, how] = [record, 'total-record']
  let intro = null
  if ((m = one.match(/obtained\s+(\d+)\s+(?:full\s+)?international\s+(?:caps|appearances|matches)/i) || one.match(/(\d+)\s+(?:international\s+)?(?:caps|matches|appearances)\s+(?:for|with)\s+his/i))) intro = +m[1]
  if (!caps && intro) [caps, how] = [intro, 'intro']
  if (!caps && (m = one.match(/\bGames\s*:\s*(\d+)\s+according to FIFA/i))) [caps, how] = [+m[1], 'games-fifa']
  if (!caps && (m = one.match(/(\d+)\s+international\s+(?:caps|appearances|matches)/i))) [caps, how] = [+m[1], 'text']
  if ((m = one.match(/scored\s+(\d+)\s+(?:international\s+)?goals/i))) goals = +m[1]
  else if ((m = one.match(/\bGoals\s*:\s*(\d+)\b/))) goals = +m[1]
  return { caps, goals, how: caps ? how : null, record, intro }
}

function parsePage(html, meta) {
  const text = pageText(html)
  const lines = text.split('\n')
  const warnings = []
  const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()
  if (/404|not found/i.test(title) && html.length < 3000) return { broken: true, title, rows: [], warnings: ['page is a 404 body'], text }
  const friendliesDefault = /friendl\w*\s+unless\s+(?:stated|otherwise|indicated|noted|mentioned)/i.test(text.replace(/\s+/g, ' '))

  // footnotes: "[1] Portugal won 6-5 on penalty kicks."  "[*] this match ..."  "(1) ..."
  const foot = {}
  for (const l of lines) {
    const m = l.match(/^\s*(\[[^\]]{1,4}\]|\(\d{1,2}\)|\*{1,3})\s+(\S.*)$/)
    if (m && !findDate(m[2].slice(0, 12))) foot[m[1]] = (foot[m[1]] ? foot[m[1]] + ' ' : '') + m[2].trim()
  }

  let layout = {},
    layoutLine = null,
    section = null,
    mode = 'caps'
  const raw = []
  const ROW = /^\s*(\d{1,3})\s*[.)´'`]?\*?(?=\s)/
  const recent = [] // non-row text lines since the last row (most recent last)
  const UNOFF = /not\s+(?:been\s+)?(?:by|recogni[sz]ed\s+by)\s+FIFA|but not by FIFA|unofficial|non-official|not\s+(?:considered\s+)?(?:as\s+)?official|not\s+full\s+(?:A|international)|not\s+recogni[sz]ed\s+as\s+full|\bamateurs?\b|\bB[- ]internationals?\b|\bB[- ]team\b|olympic\s+(?:team|selection)|\bU-?\s?2[0-3]\b|\bunder[- ]2[0-3]\b|war[- ]?time|victory\s+internationals?|not\s+full\s*:/i
  const GOALLIST = /^\s*(?:international\s+)?goals\s*:?\s*$|scored\s+the\s+following\s+goals|^\s*list\s+of\s+goals|^\s*goals\s+scored\s*:?\s*$/i
  const CAPSHEAD = /^\s*(?:international\s+(?:games|appearances|matches|caps)|full\s+internationals?|official\s+(?:matches|internationals))\s*:?\s*$/i
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    // header lines (re)set the layout and, from the few text lines just above, the table's kind and team
    if (HDR_KEYS.date.test(line) && (HDR_KEYS.opp.test(line) || HDR_KEYS.venue.test(line) || HDR_KEYS.score.test(line)) && !ROW.test(line)) {
      layout = headerLayout(line)
      layoutLine = line.trim()
      const near = recent.slice(-3)
      const nearTxt = near.join(' ')
      if (near.some((l) => GOALLIST.test(l))) mode = UNOFF.test(nearTxt) ? 'goals-unofficial' : 'goals'
      else if (raw.length === 0) mode = 'caps' // the first table on a page is the caps table
      else if (near.some((l) => UNOFF.test(l) && l.trim().split(/\s+/).length <= 25)) mode = 'unofficial'
      else if (near.some((l) => CAPSHEAD.test(l))) mode = 'caps'
      else if (/^goals/.test(mode) || mode === 'unofficial') mode = recent.length ? 'caps' : mode
      if (section && UNOFF.test(section)) mode = 'unofficial'
      recent.length = 0
      continue
    }
    const sec = line.match(/^\s*(?:matches\s+|caps\s+|games\s+|appearances\s+)?(?:for|with|playing for)\s+(?:the\s+)?([A-Z(][\w .&'()/-]{2,40}?)\s*:?\s*$/i)
    if (sec && !ROW.test(line)) {
      section = sec[1].trim()
      if (UNOFF.test(section)) mode = 'unofficial'
      else if (mode === 'unofficial') mode = 'caps'
      recent.length = 0
      continue
    }
    const m = /\d+\s*yr\s+\d+\s*d\b/i.test(line) ? null : line.match(ROW) // "19 yr 248 d according to IFA" is an age line
    if (!m) {
      // a bare team name on its own line heads a section on two-team pages ("France", "Spain", "Rest of Europe")
      const bare = line.trim().replace(/[:.]$/, '')
      if (bare.split(/\s+/).length <= 4 && !/\d/.test(bare) && (ALIAS[norm(bare)] || UNOFF.test(bare)) && /^[A-Z(]/.test(bare)) {
        section = bare
        mode = UNOFF.test(bare) ? 'unofficial' : mode === 'unofficial' ? 'caps' : mode
      }
      recent.push(line)
      continue
    }
    const cap = +m[1]
    const rest = line.slice(m[0].length)
    const d = findDate(rest) ?? findDateLoose(rest)
    if (!d) continue
    if (d.loose) warnings.push(`cap ${cap}: date typo "${d.raw.trim()}" read as ${d.d}-${d.mo}-${d.y}`)
    const pre = rest.slice(0, d.index)
    const post = rest.slice(d.index + d.length)
    // reject stat-summary lines: no letters after the date and no score
    if (!/[A-Za-zÀ-ÿ]/.test(pre + post)) continue
    recent.length = 0
    const row = { cap, d, pre, preAt: m[0].length, post, line, section, layout, layoutLine, mode }
    raw.push(row)
  }
  if (!raw.length) return { title, rows: [], warnings: ['no cap rows recognised'], text, friendliesDefault }

  // ---- fields --------------------------------------------------------------------------
  const expCol = (line, idx) => {
    let c = 0
    for (let i = 0; i < idx; i++) c = line[i] === '\t' ? (Math.floor(c / 8) + 1) * 8 : c + 1
    return c
  }
  let rows = []
  for (const r of raw) {
    const L = r.layout
    const hasVenue = L.venue !== undefined || L.opp === undefined // a header naming the opponent but no venue means no venue column
    const oppFirst = L.opp !== undefined && L.venue !== undefined && L.opp < L.venue
    let opponent = null,
      venue = null,
      score = null,
      comp = '',
      goalsTok = [],
      goalsEnd = null,
      goalsAfter = null,
      minutes = null,
      how = ''
    const refs = []
    let pre = r.pre,
      post = r.post
    if (/[A-Za-zÀ-ÿ]/.test(pre)) {
      // opponent (and score) before the date: "1  Netherlands  4-0  30.10.1960"
      const sm = pre.match(SCORE_RE)
      if (sm) {
        score = sm[0].trim()
        opponent = pre.slice(0, sm.index).trim()
      } else opponent = pre.trim()
      const g = opponent.match(/^((?:\d+|-)\s+)+/)
      if (g) {
        goalsTok = g[0].trim().split(/\s+/)
        opponent = opponent.slice(g[0].length).trim()
      }
      how = 'opp-before-date'
    } else {
      goalsTok = pre.trim() ? pre.trim().split(/\s+/) : []
      // where each goal token ends, in tab-expanded columns (a lone token is placed by it: goals or running total)
      goalsEnd = [...pre.matchAll(/\S+/g)].map((t) => expCol(r.line, r.preAt + t.index + t[0].length))
    }
    let after = post
    if (score === null) {
      const sm = post.match(SCORE_RE)
      if (sm) {
        score = sm[0].trim()
        const before = post.slice(0, sm.index)
        after = post.slice(sm.index + sm[0].length)
        const vo = splitVenueOpp(before, oppFirst, hasVenue)
        opponent = vo.opponent
        venue = vo.venue
        how = vo.how
      } else {
        // no score: keep cells as best we can
        const vo = splitVenueOpp(post, oppFirst, hasVenue)
        opponent = vo.opponent
        venue = vo.venue
        after = ''
        how = 'no-score'
      }
    }
    // after the score: [refs] aet/pen, competition, maybe minutes / goals
    for (const m of after.matchAll(/\[[^\]]{1,6}\]|\((?:\d{1,2}|[*a-z])\)|(?<=\S|^)\*{1,3}(?=\s|$)/gi)) refs.push(m[0])
    after = after.replace(/\[[^\]]{1,6}\]|\((?:\d{1,2}|[*a-z])\)/gi, ' ')
    const extra = after.match(/^\s*(a\.?e\.?t\.?|aet|asdet|pen\.?|p\.?|\(aet\)|\(pen\))\b/i)
    if (extra) {
      score += ' ' + extra[1]
      after = after.slice(extra[0].length)
    }
    const gm = after.match(/Goals?\s*:\s*(\d+)/i)
    if (gm) {
      goalsAfter = +gm[1]
      after = after.replace(gm[0], ' ')
    }
    if (L.min !== undefined) {
      const mm = after.match(/(?:^|\s)(\d{1,3})'?\s*(?:\S.*)?$/)
      const mm2 = after.match(/\s(\d{1,3})'?\s*$/) || after.match(/^\s*(\d{1,3})'?\s*$/)
      const hit = mm2 || null
      if (hit && +hit[1] <= 130) {
        minutes = +hit[1]
        after = after.slice(0, hit.index) + ' '
      } else if (mm && !mm2) {
        // minutes in the middle: "friendly  90  Prague"
        const m3 = after.match(/\s(\d{1,3})'?(\s{2,}|\t)(\S.*)$/)
        if (m3 && +m3[1] <= 130) {
          minutes = +m3[1]
          venue = venue ?? m3[3].trim()
          after = after.slice(0, m3.index)
        }
      }
    }
    if (L.goals !== undefined && L.score !== undefined && L.goals > L.score && (L.comp === undefined || L.goals < L.comp) && goalsAfter === null) {
      // "Score Goals Competition": the goals sit right after the score
      const tm = after.match(/^\s*(\d{1,2}|-)(?=\s|$)/)
      if (tm) {
        goalsAfter = tm[1] === '-' ? 0 : +tm[1]
        after = after.slice(tm[0].length)
      }
    }
    if (L.goals !== undefined && L.date !== undefined && L.goals > L.date && goalsAfter === null && !(L.score !== undefined && L.goals > L.score && L.comp !== undefined && L.goals < L.comp)) {
      const tm = after.match(/(?:^|\s)(\d{1,2}|-)\s*$/)
      if (tm) {
        goalsAfter = tm[1] === '-' ? 0 : +tm[1]
        after = after.slice(0, tm.index)
      }
    }
    // "Barranquilla   0-0   Paraguay   World Cup Qualifier": the opponent comes after the score
    const ac = splitCells(after)
    if (ac.length && opponent && !isKnownTeam(opponent) && isKnownTeam(ac[0]) && !venue) {
      venue = opponent
      opponent = ac[0]
      after = ac.slice(1).join('  ')
      how = 'opp-after-score'
    }
    comp = after.replace(/\s+/g, ' ').trim().replace(/^[,;:-]\s*/, '')
    // a venue column written as Home/Away/Neutral (Israeli logs, some others)
    let han = null
    if (venue && /^(home|h|away|a|neutral|n)$/i.test(venue.trim())) han = { h: 'H', a: 'A', n: 'N' }[venue.trim()[0].toLowerCase()]
    else if (venue && oppFirst && /^isra-/.test(meta.slug)) han = 'N' // Israeli logs: a country name in the venue column = neutral
    rows.push({ mode: r.mode, cap: r.cap, d: r.d, opponent, venue, score, comp, refs, goalsTok, goalsEnd, goalsAfter, minutes, han, how, line: r.line.replace(/\s+$/, ''), section: r.section, layoutLine: r.layoutLine })
  }

  // ---- goals ---------------------------------------------------------------------------
  const goalRows = rows.filter((r) => r.mode.startsWith('goals'))
  const otherRows = rows.filter((r) => r.mode === 'unofficial')
  const allRows = rows
  rows = rows.filter((r) => r.mode === 'caps')
  const tokNum = (x) => (x === '-' || x === '–' || x === '' ? 0 : /^\d+$/.test(x) ? +x : null)
  const anyPair = rows.some((r) => r.goalsTok.length === 2)
  const stated = statedTotals(text)
  if (rows.some((r) => r.goalsAfter !== null)) for (const r of rows) r.goals = r.goalsAfter ?? 0
  else if (anyPair) {
    // median end columns of the goals token and the running-total token over the two-token rows
    const med = (a) => a.sort((x, y) => x - y)[a.length >> 1]
    const pr = rows.filter((r) => r.goalsTok.length === 2 && r.goalsEnd?.length === 2)
    const pairCols = pr.length ? [med(pr.map((r) => r.goalsEnd[0])), med(pr.map((r) => r.goalsEnd[1]))] : null
    let cum = 0,
      prevCap = 0,
      prevSec
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      // running totals restart with each team's table on two-team pages
      if (i && (r.section !== prevSec || r.cap < prevCap)) cum = 0
      prevCap = r.cap
      prevSec = r.section
      const t = r.goalsTok.map(tokNum)
      // the match-goals column is authoritative whenever the row has one; the running total is only a consistency
      // check (cumulative_mismatch), never a source of goals. RSSSF's running totals slip (Mbappé caps 67-70:
      // "2 38", "38", "1 40", "1 40"), and deriving goals from them gave Mbappé 2 v Gibraltar 2023 for the page's 1.
      // After a mismatch the check resyncs to the page's total, so one slip warns once per row it touches.
      const mismatch = (c, g) => {
        r.parseWarning = 'cumulative_mismatch'
        warnings.push(`cumulative_mismatch: cap ${r.cap}: goals column ${g}, running total ${cum} -> ${c}`)
      }
      if (t.length >= 2 && t.every((x) => x !== null)) {
        const [g, c] = t.slice(-2)
        r.goals = g
        if (c && c !== cum + g) mismatch(c, g)
        cum = c || cum + g
      } else if (t.length === 1 && t[0] !== null) {
        // one token in a two-column log: which column is blank is read from where the token sits. Usually the goals
        // cell is blank (= 0) and the token is the running total (David Villa v Latvia 2007: "10" after "1  10");
        // some logs leave the running total blank instead (Kadir, Indonesia 1968: "  1   1       11- 8-68").
        const inGoals = r.goalsEnd && pairCols && Math.abs(r.goalsEnd[0] - pairCols[0]) < Math.abs(r.goalsEnd[0] - pairCols[1])
        if (inGoals) {
          r.goals = t[0]
          cum += t[0]
        } else {
          r.goals = 0
          if (t[0] !== cum) mismatch(t[0], 0)
          cum = t[0]
        }
      } else r.goals = 0
    }
  } else {
    const vals = rows.map((r) => (r.goalsTok.length ? tokNum(r.goalsTok[0]) : null))
    const present = vals.filter((v) => v !== null)
    const sum = present.reduce((a, b) => a + b, 0)
    const max = present.length ? Math.max(...present) : 0
    let nondec = true,
      repeats = 0,
      prev = -1
    for (const v of vals) {
      if (v === null) continue
      if (v < prev) nondec = false
      if (v === prev && v > 0) repeats++
      prev = v
    }
    const cumulative = present.length > 1 && nondec && (stated.goals != null ? max === stated.goals && sum !== stated.goals : repeats > 0)
    let cum = 0
    for (let i = 0; i < rows.length; i++) {
      const v = vals[i]
      if (cumulative) {
        // no per-match column: goals are the rise in the running total; a blank row is unknown (null), not 0
        rows[i].goals = v === null ? null : Math.max(0, v - cum)
        if (v !== null) cum = Math.max(cum, v)
      } else rows[i].goals = v ?? 0
    }
  }
  // goals known at all? a goals column in a header, any goal token, or a goal list
  const hasGoalData = rows.some((r) => r.goalsTok.length || r.goalsAfter !== null) || rows.some((r) => r.layout?.goals !== undefined) || allRows.some((r) => r.layoutLine && HDR_KEYS.goals.test(r.layoutLine))
  if (goalRows.some((g) => g.mode === 'goals')) {
    // a separate list of goals (Israeli logs): one line per goal; count onto the cap row with the same date text
    const byDate = new Map()
    for (const g of goalRows.filter((g) => g.mode === 'goals')) byDate.set(g.d.raw.replace(/\s/g, ''), (byDate.get(g.d.raw.replace(/\s/g, '')) || 0) + 1)
    let used = 0
    for (const r of rows) {
      const n = byDate.get(r.d.raw.replace(/\s/g, '')) || 0
      r.goals = n
      r.goalsFrom = 'goal-list'
      used += n
    }
    const listed = [...byDate.values()].reduce((a, b) => a + b, 0)
    if (used !== listed) warnings.push(`goal list has ${listed} goals, ${used} matched to cap rows by date`)
  } else if (!hasGoalData) for (const r of rows) r.goals = null
  // two-team pages: one Total Record per team is often only partly matched; prefer the intro / per-team sum
  const nSections = new Set(rows.map((r) => r.section ?? '')).size
  if (nSections > 1 && stated.how === 'total-record' && stated.intro) Object.assign(stated, { caps: stated.intro, how: 'intro (two-team page)' })
  return { title, rows, otherRows, goalRows, warnings, text, stated, friendliesDefault, foot }
}

// ------------------------------------------------------------------------------------------
// dates (two-digit years) + martj42 join
// ------------------------------------------------------------------------------------------
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
function shift(isoDate, k) {
  const dt = new Date(isoDate + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + k)
  return dt.toISOString().slice(0, 10)
}
function assignYears(rows, base, upper = 2026) {
  // two-digit years: the century nearest the previous row (rows are chronological, but not always strictly),
  // never above the page's last-updated year and never before 1872
  let prev = null
  return rows.map((r) => {
    let y
    if (r.d.y.length === 4) y = +r.d.y
    else {
      const yy = +r.d.y
      const cands = [1800, 1900, 2000].map((c) => c + yy).filter((v) => v >= 1872 && v <= upper)
      if (!cands.length) y = base + yy
      else if (prev === null) y = cands.includes(base + yy) ? base + yy : cands[0]
      else y = cands.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev) || b - a)[0]
    }
    prev = y
    return y
  })
}
function oppHits(rows, years) {
  let n = 0
  rows.forEach((r, i) => {
    const y = years[i]
    if (!validDate(y, r.d.mo, r.d.d)) return
    const day = iso(y, r.d.mo, r.d.d)
    for (const k of [0, -1, 1]) {
      const ms = BYDATE.get(shift(day, k))
      if (ms && ms.some((m) => sim(r.opponent ?? '', m.home_team) >= 0.75 || sim(r.opponent ?? '', m.away_team) >= 0.75)) {
        n++
        return
      }
    }
  })
  return n
}
function resolveDates(rows, lastUpdatedYear) {
  const cands = [1800, 1900, 2000]
  let best = null
  const nowY = 2026
  const upper = Math.max(nowY, lastUpdatedYear ?? nowY)
  for (const b of cands) {
    const ys = assignYears(rows, b, upper)
    if (Math.max(...ys) > Math.max(nowY, lastUpdatedYear ?? nowY) || Math.min(...ys) < 1872) continue
    const hits = oppHits(rows, ys)
    if (!best || hits > best.hits || (hits === best.hits && Math.abs(Math.max(...ys) - (lastUpdatedYear ?? nowY)) < Math.abs(Math.max(...best.ys) - (lastUpdatedYear ?? nowY)))) best = { b, ys, hits }
  }
  return best?.ys ?? assignYears(rows, 1900)
}

function joinRows(rows) {
  // team votes: the other side of the best opponent match on (date ±1)
  const votes = new Map()
  const per = rows.map((r) => {
    if (!r.date) return []
    const out = []
    for (const k of [0, -1, 1, -2, 2]) {
      for (const m of BYDATE.get(shift(r.date, k)) ?? []) {
        const sh = sim(r.opponent ?? '', m.home_team),
          sa = sim(r.opponent ?? '', m.away_team)
        if (sh >= sa) out.push({ m, k, team: m.away_team, opp: m.home_team, s: sh })
        else out.push({ m, k, team: m.home_team, opp: m.away_team, s: sa })
      }
    }
    const top = out.filter((c) => c.s >= 0.75).sort((a, b) => Math.abs(a.k) - Math.abs(b.k) || b.s - a.s)[0]
    if (top) votes.set(top.team, (votes.get(top.team) || 0) + 1)
    return out
  })
  const ranked = [...votes].sort((a, b) => b[1] - a[1])
  const T = ranked[0]?.[0] ?? null
  const teams = new Set(ranked.filter(([, v], i) => i === 0 || (v >= 3 && v >= 0.1 * rows.length)).map(([t]) => t))
  const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)
  const scoreOf = (r) => r.score?.match(/(\d+)\s*[-:–]\s*(\d+)/)?.slice(1).map(Number)
  const scoreAgrees = (r, m, team) => {
    const sc = scoreOf(r)
    if (!sc) return false
    const tf = m.home_team === team ? [+m.home_score, +m.away_score] : [+m.away_score, +m.home_score]
    return sc[0] === tf[0] && sc[1] === tf[1]
  }
  const mk = (r, m, team, k, how) => {
    r.team = team
    r.join = {
      date: m.date,
      home_team: m.home_team,
      away_team: m.away_team,
      home_score: +m.home_score,
      away_score: +m.away_score,
      tournament: m.tournament,
      city: m.city,
      neutral: m.neutral === 'TRUE',
      day_offset: k,
      opponent_match: how,
    }
  }
  const claimed = new Set()
  const pending = []
  // 1. opponent name matches within +-2 days
  rows.forEach((r, i) => {
    const c = per[i].filter((x) => teams.has(x.team) || teams.has(x.opp))
    const cc = c.map((x) => (teams.has(x.team) ? x : { ...x, team: x.opp, opp: x.team, s: sim(r.opponent ?? '', x.team) }))
    const strong = cc.filter((x) => x.s >= 0.6).sort((a, b) => Math.abs(a.k) - Math.abs(b.k) || b.s - a.s)[0]
    if (strong) {
      mk(r, strong.m, strong.team, strong.k, 'name')
      claimed.add(strong.m)
    } else pending.push([r, cc])
  })
  // 2. hand-typed date slips ("14-11-19" for 14-10-19): the team v that opponent within 62 days AND the same score
  //    (without the score check, 136 of 1,599 such joins went to the other leg or to a match martj42 lacks)
  const left = []
  for (const [r, cc] of pending) {
    if (!r.date || !r.opponent) {
      left.push([r, cc])
      continue
    }
    let best = null
    for (const t of teams)
      for (const m of TEAM_MATCHES.get(t) ?? []) {
        const k = days(m.date, r.date)
        if (Math.abs(k) > 62 || claimed.has(m)) continue
        const opp = m.home_team === t ? m.away_team : m.home_team
        if (sim(r.opponent, opp) < 0.75) continue
        const sc = scoreAgrees(r, m, t) ? 0 : 1
        const sameDM = m.date.slice(8) === r.date.slice(8) || m.date.slice(5, 7) === r.date.slice(5, 7) ? 0 : 1
        const key = [sc, sameDM, Math.abs(k)]
        if (!best || key < best.key || key.join() < best.key.join()) best = { m, t, k, key }
      }
    if (best && best.key[0] === 0) {
      mk(r, best.m, best.t, best.k, 'date-typo-suspected')
      claimed.add(best.m)
    } else left.push([r, cc])
  }
  // 3. weak: the only same-day (+-1) match of the player's team, if no other row holds it
  for (const [r, cc] of left) {
    const sameDay = cc.filter((x) => Math.abs(x.k) <= 1 && !claimed.has(x.m))
    if (sameDay.length === 1 && cc.filter((x) => Math.abs(x.k) <= 1).length === 1) {
      mk(r, sameDay[0].m, sameDay[0].team, sameDay[0].k, 'weak')
      claimed.add(sameDay[0].m)
    } else {
      r.team = T
      r.join = null
    }
  }
  return { team: T, teams: [...teams] }
}

// ------------------------------------------------------------------------------------------
// main
// ------------------------------------------------------------------------------------------
function readTsv(file) {
  const [head, ...rows] = fs.readFileSync(file, 'utf8').trim().split('\n')
  const cols = head.split('\t')
  return rows.map((r) => Object.fromEntries(r.split('\t').map((v, i) => [cols[i], v])))
}

function formatKey(p) {
  if (p.broken) return 'broken-404'
  const lay = p.rows[0]?.layoutLine
  if (!lay) return p.rows.length ? 'no-header' : 'no-rows'
  return lay.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

async function parseAll() {
  let tsv = readTsv(TSV)
  // logs found by harvest-rsssf.mjs's index crawl that the TSV lacks: parsed once cached, named from the page title
  const DISC = path.join(ROOT, 'data/raw/rsssf/discovered-logs.tsv')
  if (fs.existsSync(DISC) && !flag('--tsv-only')) {
    const have = new Set(tsv.map((r) => canon(r.url)))
    for (const d of readTsv(DISC)) if (d.in_tsv === '0' && !have.has(d.url) && (await cachedBody(d.url))) tsv.push({ name: '', country: '', url: d.url, last_updated: '', caps_stated: '', discovered: true })
  }
  if (ONLY) tsv = tsv.filter((r) => ONLY.includes(r.url.split('/').pop()))
  tsv = tsv.slice(0, LIMIT)
  // pass 1: parse; learn opponent spellings from cleanly split rows
  const pages = []
  for (const t of tsv) {
    const url = canon(t.url)
    const slug = url.split('/').pop().replace(/\.html$/, '')
    const body = await cachedBody(url)
    if (!body) {
      pages.push({ t, url, slug, missing: true })
      continue
    }
    const meta = await cachedMeta(url)
    pages.push({ t, url, slug, html: decode(body), meta })
  }
  if (pages.length > 50 || !ONLY) {
    for (const p of pages) {
      if (p.missing) continue
      const r = parsePage(p.html, { slug: p.slug })
      for (const x of r.rows) if (x.how === 'cells' && x.opponent) LEXICON.set(norm(x.opponent), (LEXICON.get(norm(x.opponent)) || 0) + 1)
    }
    for (const [k, v] of LEXICON) if (v < 3) LEXICON.delete(k)
  } else {
    // small runs: learn from the whole cache would be slow-free anyway; use a cheap learned lexicon file if present
    const lx = path.join(OUT, 'rsssf-lexicon.json')
    if (fs.existsSync(lx)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(lx, 'utf8')))) LEXICON.set(k, v)
  }
  if (!ONLY && LIMIT === Infinity) fs.writeFileSync(path.join(OUT, 'rsssf-lexicon.json'), JSON.stringify(Object.fromEntries(LEXICON)))

  fs.mkdirSync(path.join(OUT, 'rsssf'), { recursive: true })
  const jsonl = []
  const cov = []
  const formats = new Map()
  for (const p of pages) {
    const caps_stated_tsv = /^\d+$/.test(p.t.caps_stated) ? +p.t.caps_stated : null
    if (p.missing) {
      cov.push({ player: p.t.name, country: p.t.country, url: p.url, caps_stated: caps_stated_tsv, rows_parsed: 0, warnings: ['not in cache'], format: 'not-cached' })
      continue
    }
    const r = parsePage(p.html, { slug: p.slug })
    if (!p.t.name) p.t.name = r.title.replace(/\s+-\s+.*$/, '').trim() || p.slug
    if (!p.t.last_updated) p.t.last_updated = r.text.match(/Last updated:?\s*([^\n]*)/i)?.[1]?.trim() ?? ''
    const luY = +(p.t.last_updated?.match(/(18|19|20)\d\d/)?.[0] ?? 2026)
    const warnings = [...r.warnings]
    let rows = r.rows
    // drop exact duplicate rows (tables repeated on the page) and flag cap-number irregularities
    const seen = new Set()
    rows = rows.filter((x) => {
      const k = x.cap + '|' + x.d.raw + '|' + x.opponent
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (rows.length) {
      const ys = resolveDates(rows, luY)
      rows.forEach((x, i) => {
        x.date = validDate(ys[i], x.d.mo, x.d.d) ? iso(ys[i], x.d.mo, x.d.d) : null
        if (!x.date) warnings.push(`cap ${x.cap}: invalid date ${x.d.raw}`)
      })
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].date && rows[i - 1].date && rows[i].date < rows[i - 1].date && rows[i].section === rows[i - 1].section) warnings.push(`cap ${rows[i].cap}: date goes backwards`)
      }
      const nums = rows.map((x) => x.cap)
      const dup = nums.filter((n, i) => nums.indexOf(n) !== i)
      if (dup.length) warnings.push(`repeated cap numbers: ${[...new Set(dup)].slice(0, 8).join(',')}`)
      const maxCap = Math.max(...nums)
      if (maxCap !== rows.length && !dup.length) warnings.push(`max cap no. ${maxCap} but ${rows.length} rows`)
      const have = new Set(nums)
      const miss = []
      for (let k = 1; k <= maxCap && miss.length < 12; k++) if (!have.has(k)) miss.push(k)
      if (miss.length && !dup.length) {
        // does the page have a line starting with that number at all? if not, the gap is in the source
        const src = miss.filter((k) => !r.text.split('\n').some((l) => new RegExp('^\\s*' + k + '\\D').test(l) && /\d/.test(l.slice(4))))
        warnings.push(`missing cap numbers ${miss.join(',')}${src.length === miss.length ? ' (no such line on the page: source gap)' : ''}`)
      }
    }
    const J = joinRows(rows)
    const fd = r.friendliesDefault !== false
    const out = rows.map((x) => {
      const compRaw = x.comp || ''
      const competition = compRaw ? compRaw : fd ? 'Friendly' : ''
      const notes = x.refs.map((k) => (r.foot?.[k] ? `${k} ${r.foot[k]}` : k))
      let han = x.han,
        hanSrc = han ? 'page' : null
      if (!han && x.join) {
        han = x.join.neutral ? 'N' : x.join.home_team === x.team ? 'H' : 'A'
        hanSrc = 'martj42'
      }
      return {
        player: p.t.name,
        country: p.t.country,
        team: x.team,
        cap_no: x.cap,
        date: x.date,
        date_as_written: x.d.raw,
        opponent: x.opponent,
        venue_or_city: x.venue,
        home_away_neutral: han,
        home_away_source: hanSrc,
        score: x.score,
        player_goals: x.goals ?? null, // null: this log has no goals column
        competition,
        competition_as_written: compRaw,
        competitive: !!competition && !/friendl/i.test(competition),
        started_or_sub: null, // RSSSF logs do not encode it (only scattered footnotes)
        minutes: x.minutes,
        notes: notes.length ? notes : undefined,
        parse_warning: x.parseWarning ?? undefined, // 'cumulative_mismatch': the running total disagrees with the goals column (the column wins)
        section: x.section ?? undefined,
        join: x.join,
        source_url: p.url,
        line_quote: x.line,
      }
    })
    const goalsKnown = out.some((x) => x.player_goals !== null)
    const goals = goalsKnown ? out.reduce((a, x) => a + (x.player_goals ?? 0), 0) : null
    const unmatched = out.filter((x) => !x.join).length
    // target: the page's own statement first (the TSV took "Caps: 3 for Croatia" on two-team pages), else the TSV
    const caps_stated = r.stated?.caps ?? caps_stated_tsv ?? null
    if (!goalsKnown) warnings.push('no goals column: player_goals null')
    else if (r.stated?.goals != null && r.stated.goals !== goals) warnings.push(`goals parsed ${goals} != stated ${r.stated.goals}`)
    if (r.stated?.record != null && r.stated?.caps != null && r.stated.record !== r.stated.caps) warnings.push(`page states ${r.stated.caps} caps (${r.stated.how}) but its Total Record says ${r.stated.record}`)
    if (r.stated?.intro != null && r.stated?.caps != null && r.stated.intro !== r.stated.caps) warnings.push(`intro text says ${r.stated.intro} caps, ${r.stated.how} says ${r.stated.caps}`)
    if (r.otherRows?.length) warnings.push(`${r.otherRows.length} unofficial/amateur rows kept apart`)
    const fk = formatKey(r)
    const doc = {
      slug: p.slug,
      player: p.t.name,
      country: p.t.country,
      team: J.team,
      teams: J.teams,
      source_url: p.url,
      fetched_at: p.meta?.fetchedAt,
      fetched_via: p.meta?.via,
      page_title: r.title,
      last_updated: p.t.last_updated,
      caps_stated,
      caps_stated_source: r.stated?.caps != null ? 'page:' + r.stated.how : caps_stated_tsv != null ? 'tsv' : null,
      caps_stated_tsv,
      goals_stated: r.stated?.goals ?? null,
      rows_parsed: out.length,
      goals_parsed: goals,
      format: fk,
      warnings,
      acknowledgement: 'Source: RSSSF (Rec.Sport.Soccer Statistics Foundation), ' + p.url,
      rows: out,
      other_rows: (r.otherRows ?? []).map((x) => ({ cap_no: x.cap, date_as_written: x.d.raw, opponent: x.opponent, score: x.score, competition: x.comp, section: x.section, line_quote: x.line })),
    }
    fs.writeFileSync(path.join(OUT, 'rsssf', p.slug + '.json'), JSON.stringify(doc, null, 1))
    for (const x of out) jsonl.push(JSON.stringify({ slug: p.slug, ...x }))
    const exact = caps_stated != null && out.length === caps_stated
    const bySection = {}
    for (const x of out) bySection[x.section ?? ''] = (bySection[x.section ?? ''] || 0) + 1
    const exactSection = !exact && caps_stated != null && Object.keys(bySection).length > 1 && Object.values(bySection).includes(caps_stated)
    const W = warnings.join('; ')
    const miss_cause =
      caps_stated == null ? 'no stated total' : exact ? '' : exactSection ? 'two-team page: stated total is one team' :
      /source gap/.test(W) ? 'source: cap number missing from page' :
      /Total Record says|intro text says/.test(W) && (r.stated?.record === out.length || r.stated?.intro === out.length) ? 'source: page states two totals; rows match one' :
      /Total Record says|intro text says/.test(W) ? 'source: page states two totals' :
      /repeated cap numbers/.test(W) ? 'multi-table page (two teams or a second list) not separated' :
      /missing cap numbers/.test(W) ? 'parse: a numbered line not read' : 'unexplained'
    cov.push({
      player: p.t.name,
      country: p.t.country,
      team: J.team,
      url: p.url,
      caps_stated,
      caps_stated_tsv: caps_stated_tsv ?? '',
      rows_parsed: out.length,
      exact: caps_stated == null ? '' : exact ? 1 : 0,
      exact_one_section: exactSection ? 1 : '',
      miss_cause,
      sections: Object.keys(bySection).length > 1 ? Object.entries(bySection).map(([k, v]) => `${k || '?'}:${v}`).join(' ') : '',
      goals_stated: r.stated?.goals ?? '',
      goals_parsed: goals ?? '',
      first_date: out[0]?.date ?? '',
      last_date: out.at(-1)?.date ?? '',
      join_matched: out.length - unmatched,
      join_unmatched: unmatched,
      join_unmatched_rate: out.length ? (unmatched / out.length).toFixed(3) : '',
      format: fk,
      parse_warnings: warnings,
    })
    if (!formats.has(fk)) formats.set(fk, { n: 0, exact: 0, stated: 0, examples_bad: [] })
    const F = formats.get(fk)
    F.n++
    if (caps_stated != null) {
      F.stated++
      if (exact) F.exact++
      else if (F.examples_bad.length < 4) F.examples_bad.push(`${p.url} (${out.length}/${caps_stated})`)
    }
  }
  fs.writeFileSync(path.join(OUT, `rsssf-caps${SUFFIX}.jsonl`), jsonl.join('\n') + '\n')
  const q = (v) => {
    const s = Array.isArray(v) ? v.join('; ') : String(v ?? '')
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const cols = ['player', 'country', 'team', 'url', 'caps_stated', 'caps_stated_tsv', 'rows_parsed', 'exact', 'exact_one_section', 'miss_cause', 'sections', 'goals_stated', 'goals_parsed', 'first_date', 'last_date', 'join_matched', 'join_unmatched', 'join_unmatched_rate', 'format', 'parse_warnings']
  fs.writeFileSync(path.join(OUT, `rsssf-coverage${SUFFIX}.csv`), [cols.join(','), ...cov.map((c) => cols.map((k) => q(c[k])).join(','))].join('\n') + '\n')
  const fr = [['format', 'logs', 'with_stated', 'exact', 'exact_rate', 'examples_not_exact'].join(',')]
  for (const [k, v] of [...formats].sort((a, b) => b[1].n - a[1].n)) fr.push([q(k), v.n, v.stated, v.exact, v.stated ? (v.exact / v.stated).toFixed(3) : '', q(v.examples_bad)].join(','))
  fs.writeFileSync(path.join(OUT, `rsssf-formats${SUFFIX}.csv`), fr.join('\n') + '\n')

  // summary
  const withStated = cov.filter((c) => c.caps_stated != null && c.format !== 'not-cached')
  const exact = withStated.filter((c) => c.rows_parsed === c.caps_stated).length
  const tsvStated = cov.filter((c) => c.caps_stated_tsv !== '' && c.caps_stated_tsv != null && c.format !== 'not-cached')
  const exactTsv = tsvStated.filter((c) => c.rows_parsed === c.caps_stated_tsv).length
  const within2 = withStated.filter((c) => Math.abs(c.rows_parsed - c.caps_stated) <= 2).length
  const allRows = cov.reduce((a, c) => a + c.rows_parsed, 0)
  const matched = cov.reduce((a, c) => a + (c.join_matched || 0), 0)
  const summary = {
    logs: cov.length,
    not_cached: cov.filter((c) => c.format === 'not-cached').length,
    zero_rows: cov.filter((c) => c.rows_parsed === 0 && c.format !== 'not-cached').length,
    with_caps_stated: withStated.length,
    exact,
    exact_rate: +(exact / Math.max(1, withStated.length)).toFixed(4),
    within_2: within2,
    exact_or_one_section: exact + cov.filter((c) => c.exact_one_section === 1).length,
    tsv_caps_stated: tsvStated.length,
    exact_vs_tsv: exactTsv,
    exact_rate_vs_tsv: +(exactTsv / Math.max(1, tsvStated.length)).toFixed(4),
    official_rows_by_mode_note: 'rows = official caps only; unofficial/amateur rows are in each log JSON under other_rows',
    rows: allRows,
    rows_joined_martj42: matched,
    join_rate: +(matched / Math.max(1, allRows)).toFixed(4),
    martj42_results: path.relative(ROOT, RESULTS_FILE),
  }
  console.log(JSON.stringify(summary, null, 1))
  return summary
}

// ------------------------------------------------------------------------------------------
// gates
// ------------------------------------------------------------------------------------------
async function wikiWikitext(title) {
  const dir = path.join(ROOT, 'data/raw/wikipedia')
  fs.mkdirSync(dir, { recursive: true })
  const f = path.join(dir, title.replace(/\W+/g, '_') + '.json')
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'))
  const q = new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content|timestamp|ids', rvslots: 'main', titles: title, redirects: '1', format: 'json', formatversion: '2' })
  // Wikipedia API (not RSSSF): two requests per gate run at most, cached forever.
  const res = await fetch('https://en.wikipedia.org/w/api.php?' + q, { headers: { 'user-agent': 'football-comparator/0.3 (drewhoover.com; gate check, cached)' } })
  if (!res.ok) throw new Error('wikipedia ' + res.status)
  const j = await res.json()
  const pg = j.query.pages[0]
  const out = { title: pg.title, revid: pg.revisions[0].revid, timestamp: pg.revisions[0].timestamp, text: pg.revisions[0].slots.main.content, fetchedAt: new Date().toISOString() }
  fs.writeFileSync(f, JSON.stringify(out))
  return out
}
function infoboxSenior(text, team) {
  const v = {}
  for (const m of text.matchAll(/\|\s*national_?(team|caps|goals|years)(\d+)\s*=\s*([^\n]*)/g)) {
    ;(v[m[2]] ??= {})[m[1]] = m[3].replace(/<!--.*?-->|<ref[\s\S]*?(\/>|<\/ref>)/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{[^}]*\}\}/g, '').trim()
  }
  const hit = Object.values(v).find((x) => x.team === team)
  const upd = text.match(/\|\s*(?:ntupdate|nationalteam-update)\s*=\s*([^\n|]*)/)?.[1]?.trim()
  return hit ? { caps: +hit.caps, goals: +hit.goals, years: hit.years, ntupdate: upd } : null
}

async function gates() {
  const G = [
    { slug: 'cronaldo-intlg', wiki: 'Cristiano Ronaldo', team: 'Portugal', scorer: 'Cristiano Ronaldo', debut: '2003-08-20', debutOpp: 'Kazakhstan', debutWiki: /debut for Portugal[^.]{0,120}Kazakhstan[^.]{0,40}20 August 2003/, debutWikiNote: 'Wikipedia states the date and opponent', compGoals: 124 },
    { slug: 'messi-intlg', wiki: 'Lionel Messi', team: 'Argentina', scorer: 'Lionel Messi', debut: '2005-08-17', debutOpp: 'Hungary', debutWiki: /made his debut with the \[\[Argentina national football team\|senior national team\]\] in 2005/, debutWikiNote: 'Wikipedia (current revision) gives only the year 2005; the date and opponent are the brief\'s known answer', compGoals: 71 },
  ]
  const GS = csv(latest('goalscorers'))
  const results = []
  let ok = true
  for (const g of G) {
    const f = path.join(OUT, 'rsssf', g.slug + '.json')
    if (!fs.existsSync(f)) {
      results.push({ slug: g.slug, pass: false, error: 'not parsed' })
      ok = false
      continue
    }
    const d = JSON.parse(fs.readFileSync(f, 'utf8'))
    const rows = d.rows
    const checks = []
    const add = (name, pass, detail) => {
      checks.push({ name, pass, ...detail })
      if (!pass) ok = false
    }
    // 1. caps / goals / debut against Wikipedia
    const w = await wikiWikitext(g.wiki)
    const ib = infoboxSenior(w.text, g.team)
    const caps = rows.length,
      goals = rows.reduce((a, x) => a + x.player_goals, 0)
    const last = rows.at(-1).date
    // caps Wikipedia has after RSSSF's last row: martj42 matches for the team after that date
    const later = RESULTS.filter((m) => m.date > last && (m.home_team === g.team || m.away_team === g.team)).length
    add('caps vs Wikipedia (lag allowed for active players)', ib && caps <= ib.caps && ib.caps - caps <= 5 && ib.caps - caps <= later, {
      rsssf: caps,
      wikipedia: ib?.caps,
      lag: ib ? ib.caps - caps : null,
      team_matches_after_rsssf_last_row: later,
      rsssf_last_row: last,
      wikipedia_ntupdate: ib?.ntupdate,
      wikipedia_revid: w.revid,
    })
    add('goals vs Wikipedia (lag allowed)', ib && goals <= ib.goals && ib.goals - goals <= 5, { rsssf: goals, wikipedia: ib?.goals, lag: ib ? ib.goals - goals : null })
    add('debut date and opponent', rows[0].date === g.debut && sim(rows[0].opponent, g.debutOpp) >= 0.75 && g.debutWiki.test(w.text), {
      rsssf: `${rows[0].date} v ${rows[0].opponent}`,
      expected: `${g.debut} v ${g.debutOpp}`,
      wikipedia_check: g.debutWikiNote,
      wikipedia_text_matches: g.debutWiki.test(w.text),
      line_quote: rows[0].line_quote,
    })
    add('rows = stated total on the page', rows.length === d.caps_stated && (d.goals_stated == null || goals === d.goals_stated), { rows: rows.length, caps_stated: d.caps_stated, goals_parsed: goals, goals_stated: d.goals_stated })
    // 2. competitive goals vs martj42 goalscorers (own goals excluded)
    const mg = GS.filter((x) => x.scorer === g.scorer && x.team === g.team && x.own_goal !== 'TRUE')
    const byDate = new Map()
    for (const x of mg) byDate.set(x.date, (byDate.get(x.date) || 0) + 1)
    // "competitive" = RSSSF's own competition label (blank = friendly), which is also Wikipedia's split.
    const rsComp = rows.filter((x) => x.competitive)
    const rsCompGoals = rsComp.reduce((a, x) => a + (x.player_goals ?? 0), 0)
    const rsInMjComp = rows.filter((x) => x.join && x.join.tournament !== 'Friendly').reduce((a, x) => a + (x.player_goals ?? 0), 0)
    const diffs = []
    const rsByDate = new Map(rows.filter((x) => x.join).map((x) => [x.join.date, x]))
    for (const [dt, n] of byDate) {
      const r = rsByDate.get(dt)
      if (!r || r.player_goals !== n) diffs.push({ date: dt, martj42: n, rsssf: r ? r.player_goals : 'no cap row', line_quote: r?.line_quote })
    }
    for (const r of rsComp) if (r.player_goals && !byDate.has(r.join?.date)) diffs.push({ date: r.join?.date ?? r.date, martj42: 0, rsssf: r.player_goals, line_quote: r.line_quote })
    // matches martj42 files under a non-Friendly tournament but RSSSF calls friendlies (no goalscorer rows in martj42 either)
    const labelDiff = rows.filter((x) => x.join && x.join.tournament !== 'Friendly' && !x.competitive).map((x) => ({ date: x.join.date, tournament: x.join.tournament, player_goals: x.player_goals, martj42_goal_rows: byDate.get(x.join.date) ?? 0 }))
    add('competitive goals vs martj42 goalscorers.csv', mg.length === g.compGoals && rsCompGoals === mg.length && diffs.length === 0, {
      expected: g.compGoals,
      martj42: mg.length,
      rsssf_competitive: rsCompGoals,
      per_match_differences: diffs,
      info_rsssf_goals_in_matches_martj42_calls_competitive: rsInMjComp,
      info_martj42_non_friendly_but_rsssf_friendly: labelDiff,
    })
    // 3. date join
    const un = rows.filter((x) => !x.join)
    const weak = rows.filter((x) => x.join?.opponent_match === 'weak')
    const typo = rows.filter((x) => x.join?.opponent_match === 'date-typo-suspected')
    const off = rows.filter((x) => x.join && x.join.day_offset !== 0 && x.join.opponent_match !== 'date-typo-suspected')
    const explain = (x) => {
      const near = (TEAM_MATCHES.get(g.team) ?? []).filter((m) => Math.abs(Date.parse(m.date) - Date.parse(x.date)) <= 2 * 86400000)
      return near.length ? `martj42 has ${near.map((m) => m.date + ' ' + m.home_team + '-' + m.away_team).join(', ')} but no ${x.opponent}` : `martj42 has no ${g.team} match within 2 days of ${x.date}`
    }
    const unexplained = un.filter((x) => !explain(x).startsWith('martj42 has no '))
    add('every cap joins martj42 results (date ±2 + teams); unmatched only where martj42 lacks the match', unexplained.length === 0, {
      rows: rows.length,
      unmatched: un.length,
      unmatched_rate: +(un.length / rows.length).toFixed(4),
      unmatched_rows: un.map((x) => ({ line_quote: x.line_quote, why: explain(x) })),
      date_typos_joined: typo.map((x) => `${x.line_quote.trim().split(/\s+/).slice(0, 2).join(' ')}… ${x.date} -> ${x.join.date} (${x.join.home_team}-${x.join.away_team})`),
      weak_name_matches: weak.map((x) => `${x.opponent} -> ${x.join.home_team}-${x.join.away_team}`),
      off_by_one_or_two_days: off.map((x) => `${x.date} -> ${x.join.date}`),
    })
    results.push({ slug: g.slug, player: d.player, pass: checks.every((c) => c.pass), checks })
  }
  // join rate for every parsed log
  const covF = path.join(OUT, `rsssf-coverage${SUFFIX}.csv`)
  let joinSummary = null
  if (fs.existsSync(covF)) {
    const [head, ...lines] = fs.readFileSync(covF, 'utf8').trim().split('\n')
    const H = head.split(',')
    const rates = []
    for (const l of lines) {
      const v = []
      let c = '',
        q = false
      for (const ch of l) {
        if (ch === '"') q = !q
        else if (ch === ',' && !q) {
          v.push(c)
          c = ''
        } else c += ch
      }
      v.push(c)
      const o = Object.fromEntries(H.map((h, i) => [h, v[i]]))
      if (o.rows_parsed && +o.rows_parsed > 0) rates.push({ matched: +o.join_matched, un: +o.join_unmatched })
    }
    const tot = rates.reduce((a, r) => a + r.matched + r.un, 0)
    const un = rates.reduce((a, r) => a + r.un, 0)
    const buckets = { '0': 0, '<5%': 0, '5-10%': 0, '10-50%': 0, '>=50%': 0 }
    for (const r of rates) {
      const x = r.un / Math.max(1, r.matched + r.un)
      buckets[x === 0 ? '0' : x < 0.05 ? '<5%' : x < 0.1 ? '5-10%' : x < 0.5 ? '10-50%' : '>=50%']++
    }
    joinSummary = { logs: rates.length, rows: tot, unmatched: un, unmatched_rate: +(un / Math.max(1, tot)).toFixed(4), logs_by_unmatched_rate: buckets }
  }
  const out = { ran_at: new Date().toISOString(), pass: ok, results, join_all_logs: joinSummary }
  fs.writeFileSync(path.join(OUT, `rsssf-gates${SUFFIX}.json`), JSON.stringify(out, null, 1))
  for (const r of results) {
    console.log(`\n## gate ${r.slug} ${r.pass ? 'PASS' : 'FAIL'}`)
    for (const c of r.checks ?? []) {
      const { name, pass, ...rest } = c
      console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(rest).slice(0, 600)}`)
    }
  }
  console.log('\njoin, all parsed logs:', JSON.stringify(joinSummary))
  return ok
}

if (!flag('--gate-only')) await parseAll()
if (flag('--gate') || flag('--gate-only')) process.exitCode = (await gates()) ? 0 : 1
