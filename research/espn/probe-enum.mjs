// One-off probe: what does a scoreboard carry for enumeration (calendar, season, week), and do range forms work?
import { get, scoreboard } from './espn.mjs'
import { logRun } from './ledger.mjs'
const sb = await scoreboard('esp.1', '20041016')
const L = sb.leagues?.[0]
console.log('league keys', Object.keys(L || {}))
console.log('season', JSON.stringify(L?.season))
console.log('calendarType', L?.calendarType, 'calendarIsWhitelist', L?.calendarIsWhitelist, 'calendar len', L?.calendar?.length, JSON.stringify(L?.calendar?.slice(0, 5)), JSON.stringify(L?.calendar?.slice(-3)))
console.log('events', sb.events?.length)
const e = sb.events?.[0]
console.log('event keys', Object.keys(e || {}))
console.log('event.season', JSON.stringify(e?.season), 'week', JSON.stringify(e?.week))
console.log('comp keys', Object.keys(e?.competitions?.[0] || {}))
for (const q of ['esp.1/scoreboard?dates=2004&limit=200', 'esp.1/scoreboard?dates=20041001-20041031&limit=200']) {
  try { const r = await get(q); console.log(q, 'events', r?.events?.length, 'first', r?.events?.[0]?.date, 'last', r?.events?.at(-1)?.date) }
  catch (err) { console.log(q, 'ERR', err.message.slice(0, 200)) }
}
logRun('probe-enum')
