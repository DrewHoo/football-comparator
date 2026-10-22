import { summary } from './espn.mjs'
import { logRun } from './ledger.mjs'
const [slug, id] = process.argv.slice(2)
const s = await summary(slug, id)
console.log('top keys', Object.keys(s))
console.log('header.competitions[0] keys', Object.keys(s.header?.competitions?.[0] || {}))
console.log('competitors', JSON.stringify(s.header?.competitions?.[0]?.competitors?.map((c) => [c.homeAway, c.team?.displayName, c.score, c.id])))
console.log('gameInfo', JSON.stringify(s.gameInfo))
console.log('rosters', s.rosters?.length, s.rosters?.map((r) => [r.homeAway, r.team?.displayName, r.roster?.length]))
const p = s.rosters?.[0]?.roster?.[0]
console.log('roster entry keys', Object.keys(p || {}))
console.log('entry', JSON.stringify({ ...p, athlete: { id: p?.athlete?.id, displayName: p?.athlete?.displayName, keys: Object.keys(p?.athlete || {}) } }).slice(0, 1500))
for (const r of s.rosters || []) for (const q of r.roster) if (q.subbedIn || q.subbedOut) console.log(' sub', r.homeAway, q.athlete?.displayName, q.starter, 'in', JSON.stringify(q.subbedIn), 'out', JSON.stringify(q.subbedOut), q.stats?.map((x) => x.abbreviation + '=' + x.value).join(' '))
console.log('keyEvents', s.keyEvents?.length)
for (const k of s.keyEvents || []) console.log(' ke', k.type?.type, k.type?.text, k.clock?.displayValue, k.scoringPlay, k.ownGoal, k.penaltyKick, JSON.stringify(k.participants?.map((x) => x.athlete?.displayName + '#' + x.athlete?.id)), k.team?.displayName, (k.text || '').slice(0, 80))
console.log('commentary', s.commentary?.length, 'boxscore keys', Object.keys(s.boxscore || {}))
logRun('probe-summary ' + id)
