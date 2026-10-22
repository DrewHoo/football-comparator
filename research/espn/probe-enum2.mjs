import { get } from './espn.mjs'
import { logRun } from './ledger.mjs'
for (const q of ['esp.1/scoreboard?dates=2004&limit=1000', 'esp.1/scoreboard?dates=200410&limit=200']) {
  try {
    const r = await get(q)
    const ev = r?.events || []
    const seasons = {}
    for (const e of ev) seasons[e.season?.slug] = (seasons[e.season?.slug] || 0) + 1
    const ids = new Set(ev.map((e) => e.id))
    console.log(q, 'events', ev.length, 'unique', ids.size, 'first', ev[0]?.date, 'last', ev.at(-1)?.date, JSON.stringify(seasons))
  } catch (err) { console.log(q, 'ERR', err.message.slice(0, 200)) }
}
logRun('probe-enum2')
