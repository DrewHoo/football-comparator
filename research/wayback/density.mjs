// Snapshot density per candidate source, 2000-2012. One bounded CDX query per pattern.
// node density.mjs [limit]
import { cdx, stats } from './wb.mjs'
const LIMIT = Number(process.argv[2] ?? 10000)
const P = [
  ['soccernet match', 'soccernet.espn.go.com/match', /id=\d+/],
  ['soccernet report', 'soccernet.espn.go.com/report', /id=\d+/],
  ['soccernet gamecast', 'soccernet.espn.go.com/gamecast', /id=\d+/],
  ['soccernet lineups', 'soccernet.espn.go.com/lineups', /id=\d+/],
  ['soccernet.com', 'www.soccernet.com/', /match|report|\d{4,}/],
  ['espn api (site.api)', 'site.api.espn.com/apis/site/v2/sports/soccer/', /summary/],
  ['espn api (site.web.api)', 'site.web.api.espn.com/apis/site/v2/sports/soccer/', /summary/],
  ['bbc sport1 internationals', 'news.bbc.co.uk/sport1/hi/football/internationals/', /\d+\.stm/],
  ['bbc sport2 internationals', 'news.bbc.co.uk/sport2/hi/football/internationals/', /\d+\.stm/],
  ['bbc sport1 euro_2000', 'news.bbc.co.uk/sport1/hi/football/euro_2000/', /\d+\.stm/],
  ['bbc sport1 world_cup_2002', 'news.bbc.co.uk/sport1/hi/football/world_cup_2002/', /\d+\.stm/],
  ['bbc sport1 teams', 'news.bbc.co.uk/sport1/hi/football/teams/', /\d+\.stm/],
  ['bbc sport new (/sport/football/)', 'www.bbc.co.uk/sport/football/', /\/\d{6,}/],
  ['bbc sport /sport/0/football/', 'www.bbc.co.uk/sport/0/football/', /\/\d{6,}/],
  ['uefa.com competitions/euro', 'www.uefa.com/competitions/euro/', /match/i],
  ['uefa.com uefaeuro', 'www.uefa.com/uefaeuro/', /match=\d+/],
  ['uefa.com worldcup', 'www.uefa.com/worldcup/', /match=\d+/],
  ['uefa.com nationalassociations', 'www.uefa.com/uefa/memberassociations/', /match/i],
  ['uefa.com competitions/worldcup', 'www.uefa.com/competitions/worldcup/', /match/i],
  ['euro2000.org', 'www.euro2000.org/', /match|\d{3,}/i],
  ['fifa.com worldcup', 'www.fifa.com/worldcup/', /match/i],
  ['fifa.com tournaments archive', 'www.fifa.com/tournaments/archive/', /match/i],
  ['fifa.com en/tournaments', 'www.fifa.com/en/tournaments/', /match/i],
  ['fifa.com associations', 'www.fifa.com/associations/', /match|result/i],
  ['fifa.com live/competitions', 'www.fifa.com/live/competitions/', /match/i],
  ['soccerway int matches', 'int.soccerway.com/matches/', /\/\d{5,}\/?$/],
  ['soccerway uk matches', 'uk.soccerway.com/matches/', /\/\d{5,}\/?$/],
  ['soccerway www matches', 'www.soccerway.com/matches/', /\/\d{5,}\/?$/],
  ['national-football-teams', 'www.national-football-teams.com/', /match/i],
  ['eu-football.info', 'eu-football.info/_match.php', /id=\d+/],
  ['11v11', 'www.11v11.com/matches/', /\d{4,}/],
  ['worldfootball.net report', 'www.worldfootball.net/report/', /report\//],
  ['skysports match_report', 'www.skysports.com/football/match_report/', /\d/],
  ['skysports story', 'www1.skysports.com/football/', /\d/],
  ['guardian football', 'football.guardian.co.uk/', /match|report|\d{4}/i],
  ['telegraph sport', 'www.telegraph.co.uk/sport/', /football/i],
  ['thefa.com', 'www.thefa.com/', /match|report|england/i],
  ['fpf.pt', 'www.fpf.pt/', /jogo|selecc|match|jogo/i],
  ['afa.org.ar', 'www.afa.org.ar/', /selecc|partido|\d/i],
  ['dfb.de', 'www.dfb.de/', /spiel|match|news/i],
]
const out = []
for (const [name, pat, re] of P) {
  const t0 = Date.now()
  let rows = []
  let err = null
  try {
    rows = await cdx(pat, { from: '2000', to: '2012', limit: LIMIT, fl: 'original,timestamp' })
  } catch (e) {
    err = e.message.slice(0, 80)
  }
  const matchLike = rows.filter((r) => re.test(r.original))
  const years = {}
  for (const r of matchLike) years[r.timestamp.slice(0, 4)] = (years[r.timestamp.slice(0, 4)] ?? 0) + 1
  const line = { name, pat, urls: rows.length, capped: rows.length >= LIMIT, matchLike: matchLike.length, years, sample: matchLike.slice(0, 3).map((r) => r.timestamp + ' ' + r.original), err, ms: Date.now() - t0 }
  out.push(line)
  console.log(JSON.stringify(line))
}
await (await import('node:fs/promises')).writeFile(new URL('./density.json', import.meta.url), JSON.stringify(out, null, 1))
console.error(JSON.stringify(stats))
