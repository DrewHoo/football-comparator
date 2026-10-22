// Name normalisation and matching across RSSSF, FIFA/UEFA archive, ESPN and martj42 spellings.
//
// Rules (documented in pipeline/docs/intl.md §Identity):
// 1. Fold to ASCII: NFD, strip combining marks, then the letters NFD leaves alone (ø ß æ œ đ ł ı þ ð).
// 2. Lowercase; apostrophes inside a word are dropped (O'Shea -> oshea); every other non-letter is a space.
// 3. Quoted nicknames on RSSSF pages ("Steven 'Steve' McManaman", "Pedro Resendes 'Pauleta'") are kept
//    as extra tokens, so a FIFA "PAULETA" or ESPN "Steve McManaman" can match.
// 4. Particles (de, da, dos, van, der, von, di, del, ...) never count as a match on their own.
// 5. Token order is ignored (FIFA writes "OWEN Michael", UEFA "Michael Owen").
// 6. Two tokens are equal if identical, or one is a prefix of the other with 4+ letters, or their
//    transliteration keys (ks/x, y/i, h/g, w/v, ph/f, kh/h, c/k, z/s, doubled letters) are within one
//    edit counting a transposition as one (5+ letters; 2 edits from 9 letters): Husyn / GUSIN,
//    Georgalides / GIORGALLIDES, Aleksei / Alexei, Georgios / Georgois, Manuel / Manel.
// 7. Ties between equally good candidates are broken by fewer unmatched extra tokens.

const EXTRA = { ø: 'o', Ø: 'o', ß: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe', đ: 'd', Đ: 'd', ł: 'l', Ł: 'l', ı: 'i', þ: 'th', Þ: 'th', ð: 'd', Ð: 'd', ʼ: "'", '’': "'", '‘': "'", '`': "'" }
export const PARTICLES = new Set(['de', 'da', 'das', 'do', 'dos', 'du', 'van', 'der', 'den', 'von', 'di', 'del', 'della', 'la', 'le', 'el', 'al', 'bin', 'ibn', 'y', 'e', 'ter', 'ten', 'mac', 'st', 'jr', 'junior', 'filho', 'neto'])

export function fold(s) {
  return String(s ?? '')
    .replace(/[øØßæÆœŒđĐłŁıþÞðÐʼ’‘`]/g, (c) => EXTRA[c])
    .normalize('NFKD') // NFKD, not NFD: RSSSF writes the Dutch ligature U+0133 (van Hooijdonk)
    .replace(/[̀-ͯ]/g, '')
}

/** Normalised display key: folded, lowercase, single-spaced, quotes removed (nicknames kept inline). */
export function normKey(s) {
  return fold(s).toLowerCase().replace(/(\w)'(\w)/g, '$1$2').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Tokens of a name (rule 1-3), nicknames included. */
export function tokens(s) {
  return normKey(s).split(' ').filter(Boolean)
}
export const significant = (toks) => toks.filter((t) => !PARTICLES.has(t) && t.length > 1)

/** Sorted significant tokens: the cross-source key for "same spelling, different order". */
export const tokenKey = (s) => [...new Set(significant(tokens(s)))].sort().join(' ')

/** Optimal-string-alignment distance (a transposition counts as one edit), capped at max+1. */
function osa(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      rowMin = Math.min(rowMin, d[i][j])
    }
    if (rowMin > max) return max + 1
  }
  return d[a.length][b.length]
}
const PHON = [[/ks|cs|x/g, 'x'], [/tch|tsch|ch/g, 'c'], [/ph/g, 'f'], [/kh/g, 'h'], [/dj|dzh|dz/g, 'j'], [/ck|q|c/g, 'k'], [/y/g, 'i'], [/w/g, 'v'], [/z/g, 's'], [/h/g, 'g'], [/ou|oo/g, 'u']]
export function phon(t) {
  let s = t
  for (const [re, r] of PHON) s = s.replace(re, r)
  return s.replace(/(.)\1+/g, '$1')
}
export function tokEq(a, b) {
  if (a === b) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  if (s.length >= 4 && l.startsWith(s)) return true
  const pa = phon(a), pb = phon(b)
  if (pa === pb) return true // Joo / ju, Husyn / Gusin
  if (s.length < 5) return false
  return osa(pa, pb, s.length >= 9 ? 2 : 1) <= (s.length >= 9 ? 2 : 1)
}

/**
 * Score how well a short source name (archive, ESPN, martj42) fits a long name (RSSSF's full name,
 * or another short name). 1 = every significant token of the shorter form is in the longer one and
 * there are 2+ of them; 0.75 = a single-token form found in the other (known-as names: DECO, RONALDO);
 * below 0.5 = partial. Symmetric in the sense that the shorter token set is tested against the longer.
 */
export function nameScore(a, b) {
  let A = [...new Set(significant(tokens(a)))], B = [...new Set(significant(tokens(b)))]
  if (!A.length || !B.length) return 0
  if (A.length > B.length) [A, B] = [B, A]
  // one-to-one: each token of the longer name answers at most one token of the shorter, exact first
  // ("Gurban Gurbanov" must not match "Makhmud Gurbanov" through gurban~gurbanov and gurbanov=gurbanov)
  const used = new Set()
  let hit = 0
  const done = new Array(A.length).fill(false)
  for (const eq of [(t, u) => t === u, tokEq]) A.forEach((t, i) => {
    if (done[i]) return
    const k = B.findIndex((u, j) => !used.has(j) && eq(t, u))
    if (k >= 0) { used.add(k); done[i] = true; hit++ }
  })
  const extra = 0.001 * Math.min(9, B.length - hit) // rule 7: fewer unmatched tokens wins a tie
  // rule 8: a short form that is exactly the other's quoted nickname wins (ESPN "Ronaldinho" takes RSSSF
  // "Ronaldo de Assis Moreira 'Ronaldinho'" before ESPN "Ronaldo" can compete for it)
  const nick = [nickTokens(a), nickTokens(b)].find((n) => n.length)
  const bonus = nick && A.length === nick.length && A.every((t) => nick.includes(t)) ? 0.02 : 0
  if (hit === A.length) return (A.length >= 2 ? 1 : 0.75) - extra + bonus
  return 0.6 * (hit / A.length) - extra
}

/** Tokens inside quotes ('Kaká', "Pauleta") on an RSSSF name. */
export function nickTokens(s) {
  const m = [...String(s ?? '').matchAll(/['"‘’“”]([^'"‘’“”]{2,})['"‘’“”]/g)].map((x) => x[1]).join(' ')
  return m ? significant(tokens(m)) : []
}

/** Score for the weak pass: 0 if the names share no 4+-letter token, else 0.55, plus 0.05 when a shared
 *  token is a surname (the last token of the long form, or written in capitals in a FIFA form), so
 *  "Jay Jay OKOCHA" beats "Augustine EGUAVOEN" for "Augustine Okocha". */
export function sharedScore(short, long) {
  const A = significant(tokens(short)).filter((t) => t.length >= 4), B = significant(tokens(long))
  const hits = A.filter((t) => B.some((u) => tokEq(t, u)))
  if (!hits.length) return 0
  const upper = new Set(String(short).split(/\s+/).filter((w) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(fold(w))).flatMap((w) => tokens(w)))
  const last = B.at(-1)
  const surname = hits.some((t) => upper.has(t) || tokEq(t, last))
  return 0.55 + (surname ? 0.05 : 0) + 0.001 * Math.min(5, hits.length)
}

/** Significant tokens (4+ letters) two names share, by rule 6. */
export function sharedTokens(a, b) {
  const A = significant(tokens(a)).filter((t) => t.length >= 4), B = significant(tokens(b))
  return A.filter((t) => B.some((u) => tokEq(t, u))).length
}

/** "OWEN Michael" -> "Michael Owen"; "CRISTIANO RONALDO" -> "Cristiano Ronaldo"; UEFA forms unchanged. */
export function prettyName(s) {
  const raw = String(s ?? '').trim()
  const parts = raw.split(/\s+/)
  const isUp = (w) => w === w.toUpperCase() && /[A-Z]/.test(fold(w))
  const cap = (w) => w.toLowerCase().replace(/(^|[-' ])(\p{L})/gu, (m, p, c) => p + c.toUpperCase())
  const up = parts.filter(isUp)
  if (up.length && up.length < parts.length) {
    // FIFA: SURNAME(S) Given(s)
    const given = parts.filter((w) => !isUp(w))
    return [...given, ...up.map(cap)].join(' ')
  }
  if (up.length === parts.length) return parts.map(cap).join(' ')
  return raw
}

export const slugify = (s) => normKey(s).replace(/ /g, '-')
