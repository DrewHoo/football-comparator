# Football Comparator: factoid corpus and publisher conventions

Researched 2026-10-21. Every number traces to the URL beside it unless it is marked **UNVERIFIED** (seen only in search snippets or secondary press) or **derived** (our own arithmetic). BBC Sport and the Guardian blocked the crawler, so no claim here is sourced from them. FBref was behind a Cloudflare bot check and Transfermarkt's stats tables were behind a consent wall that we did not accept, so what this report says about those two sites comes partly from secondary sources.

## Summary (10 lines)

1. **Football factoids are overwhelmingly scoped to one competition, almost never to "everything".** Of the 35 factoids below, 23 are single-league, 7 are single-competition (Champions League, World Cup, Euros), 3 are club plus country, 1 is country only, and 1 is an award count.
2. Within the single-league group, the Premier League dominates: 17 of the 23. The rest are Bundesliga (3) and La Liga (2), plus 1 claim spanning England's top four tiers.
3. **"PL era" (since 1992-93) and "English top flight" (since 1888) are two separate record books, and they often name different holders.** Examples: most defeats in a season (Southampton 30 vs Stoke 31), longest winless start (Wolves 18 vs Bolton 22). Publishers say which one they mean, so the comparator has to as well.
4. **"Fastest to M" counts league appearances in that league only.** Haaland reached 100 PL goals in his 111th game and 50 UCL goals in his 49th; UEFA's own "first N games" table excludes qualifiers.
5. Only the GOAT-tier claims (Ronaldo 900/981, Messi 91 in 2012, Mbappé 300 before age 25) are club plus country. Those are also the claims where publishers disagree: Ronaldo's total is 961, 967, 981 or 994 depending on whether the count includes the Arab Club Champions Cup, B-team games and youth internationals.
6. **Glory and futility posts appear in roughly equal numbers, and futility posts are almost all team-level and PL-scoped.** Examples: Derby's 11 points, Sheffield United's 104 conceded, Southampton relegated with 7 games left, Wolves' 2025-26 run of 18 games without a win from the start.
7. The season length is a scope trap. 1992-93 to 1994-95 were 42-game seasons, so publishers write "in a 38-game season" or compare per-game rates.
8. **Implication: the default scope should be one league, with the Premier League as the first board.** The field defaults to "PL era", and "English top flight" is a toggle.
9. **Second board: Champions League, proper only.** No qualifiers, with appearances counted the way UEFA counts them.
10. **"All competitions, club plus country" should be an opt-in "career" view.** It uses the Opta/ESPN basis: senior first team and senior "A" internationals including friendlies. It excludes club friendlies, B teams and youth caps. The Method section states that basis and notes that the Arab Club Champions Cup swings Ronaldo's total by 6 goals.

---

## Part A: factoid corpus

The table has one column for each comparator slot:

- **Who:** player, team or manager
- **Stat:** the per-game stat, or a threshold test
- **Agg:** how the stat is combined: sum, count, streak, fastest-to-M, youngest-to-M
- **Window:** which games: first N apps, by age X, season, run
- **Field:** the comparison set: all time, PL era, and so on

**Scope** says which competitions count in the claim.

### A1. Player glory

| # | Claim (publisher's framing) | Publisher / URL | Numbers | Scope | Slots |
|---|---|---|---|---|---|
| 1 | Haaland fastest to 100 Premier League goals | Opta Analyst, https://theanalyst.com/articles/erling-haaland-fastest-100-premier-league-goals-stats ; https://theanalyst.com/articles/fastest-players-to-100-premier-league-goals | 100th goal in his 111th PL appearance (5-4 at Fulham, 2 Dec 2025). Previous record: Shearer, 124 games (Dec 1995). Next: Kane 141, Agüero 147, Henry 160, Salah 162. ESPN gives Henry 141 (https://africa.espn.com/football/story/_/id/47051666). | **PL only** | Who: player / Stat: goals / Agg: fastest-to-100 / Window: first N PL apps / Field: PL all-time |
| 2 | Haaland fastest to 50 PL goals | Opta Analyst (same pages) | 48 games; beat Andrew Cole by 17, so Cole 65 (derived). Shearer 66, Agüero 81, Henry 83, Kane 90. | **PL only** | Fastest-to-50 / first N PL apps / PL all-time |
| 3 | Haaland 36 PL goals in a season, the record | Opta Analyst, https://theanalyst.com/articles/who-has-scored-the-most-goals-in-a-premier-league-season | 36 in 2022-23, beating the 34 of Cole (1993-94) and Shearer (1994-95), both in 42-game seasons. Salah's 32 (2017-18) was the 38-game record. Fastest to 30 (27 apps). His appearance count for the season is UNVERIFIED. | **PL only, one season** | Sum / season / PL all-time (with a 38- vs 42-game caveat) |
| 4 | Shearer, record 260 PL goals | ESPN, https://africa.espn.com/football/story/_/id/47051666 | 260 for Blackburn and Newcastle, 1992-2006 | **PL only** | Career sum / PL all-time |
| 5 | Salah's 47 goal involvements equal the PL season record | premierleague.com, https://www.premierleague.com/news/4298728 | 29 goals + 18 assists in 38 games, 2024-25. Equals Cole (34+13) and Shearer (34+13), both over 42 games. | **PL only, one season** | Sum of goals + assists / season / PL all-time |
| 6 | Haaland fastest to 50 Champions League goals | Opta Analyst, https://theanalyst.com/articles/erling-haaland-fastest-to-50-champions-league-goals | 49 games (vs Napoli, 18 Sep 2025). Previous record: Van Nistelrooy, 62. Messi 66 and Mbappé 79 come from Analyst's Mbappé piece (#8). Lewandowski 77 is from secondary press, UNVERIFIED. | **UCL only.** Analyst does not say whether qualifiers count. | Fastest-to-50 / first N UCL apps / UCL all-time |
| 7 | UEFA: who has scored the most UCL goals in their first N games | UEFA.com, https://www.uefa.com/uefachampionsleague/news/02a1-1fa9bccb78e0-1fb14d5cb64f-1000--who-has-scored-the-most-champions-league-goals-in-their-fi/ (20 Oct 2026) | First 10 games: Haaland 12. 20: Haaland 25. 30: Haaland 35. 40: Haaland 41. 50: Haaland 52. 60: Haaland 61. 70: Van Nistelrooy 55. 80: Messi 62. 90: Messi 71. 100: Lewandowski 81. | **UCL proper** | **The comparator's exact shape:** sum through the first N apps / UCL all-time |
| 8 | Messi youngest to 50 UCL goals; Mbappé second | Opta Analyst, https://theanalyst.com/articles/kylian-mbappe-youngest-players-50-uefa-champions-league-goals | Messi 24y 284d (66 games, Apr 2012). Mbappé 25y 356d (79 games, 10 Dec 2024). Ronaldo 28y 78d. | **UCL, excluding qualifiers (stated)** | Youngest-to-50 / by age / UCL all-time |
| 9 | Ronaldo, record 140 UCL goals | UEFA.com, https://www.uefa.com/uefachampionsleague/news/0257-0e910cf2494a-5185150de9d4-1000--champions-league-all-time-top-scorers-cristiano-ronaldo-/ | 140 excluding qualifiers, 141 including them. Messi 129, Lewandowski 109 (Analyst, Sep 2025: 105), Mbappé 72. All UEFA club competitions: Ronaldo 145, Messi 132. | **UCL proper.** UEFA publishes a separate table that includes qualifiers. | Career sum / UCL all-time |
| 10 | Ronaldo scored in 11 consecutive UCL matches | GWR, https://www.guinnessworldrecords.com/world-records/most-consecutive-champions-league-matches-scored-in ; UEFA.com, https://www.uefa.com/uefachampionsleague/news/02aa-21cecb96be6b-415b1e767914-1000--kane-scores-nine-in-a-row-who-has-scored-in-the-most-cons/ | 11 matches, 17 goals, from the 2017 final to the 2017-18 quarter-final. **GWR's start date (29 Sep 2017) disagrees with UEFA's span** (the run starts at the 2017 final). Van Nistelrooy and Lewandowski 9. Kane 9 and live (2026-27). | **UCL only.** The run crosses seasons and includes a final. | Streak / scored in a game / any UCL span / UCL all-time |
| 11 | Lewandowski's 41 Bundesliga goals break Gerd Müller's 49-year record | TNT Sports, https://www.tntsports.co.uk/football/bundesliga/2020-2021/robert-lewandowski-breaks-gerd-mullers-49-year-record-with-41st-bundesliga-goal-of-season_sto8331331/story.shtml | 41 in 29 games (2020-21); the 41st came in the 90th minute of the last day. Müller had 40 in 1971-72 (the page names that season, not the number). | **Bundesliga only, one season** | Sum / season / Bundesliga all-time |
| 12 | Kane, 36 Bundesliga goals in his debut season | Bundesliga.com and Flashscore (search summaries; **UNVERIFIED** on a fetched page) | 36 in 32 apps (2023-24), beating Uwe Seeler's debut-season 30. | **Bundesliga only** | Sum / first season in the league / debut seasons |
| 13 | Kane fastest to 100 Bundesliga goals | Arab News (AFP), https://arabnews.pk/sport/bayern-star-kane-becomes-fastest-player-to-score-100-bundesliga-goals-3001671 | 98 games (7-0 vs Union Berlin, 18 Sep 2026). Previous record: Dieter Müller, 129. Another report says 99 and 123. | **Bundesliga only** | Fastest-to-100 / first N league apps |
| 14 | Messi, most goals in a La Liga career | GWR, https://www.guinnessworldrecords.com/world-records/382108-most-goals-scored-in-a-la-liga-career | 474 in 520 games, 2005-2021. Passed Zarra's 251 in Nov 2014. | **La Liga only** | Career sum / La Liga all-time |
| 15 | Lamine Yamal, youngest La Liga scorer | FC Barcelona, https://www.fcbarcelona.com/en/news/3731136 (search summary) | 16y 87d (at Granada, 8 Oct 2023). Previous record: Fabrice Olinga, 16y 98d. | **La Liga only** | Youngest-to-1 / by age |
| 16 | Messi, most goals in a calendar year | GWR, https://www.guinnessworldrecords.com/world-records/106274-most-football-goals-scored-in-a-calendar-year | 91 in 2012, in competitive games for club and country; 5 more in friendlies are **not counted**. Previous record: Gerd Müller, 85 (1972). | **Club + country, competitive only, calendar year** | Sum / calendar year / all-time |
| 17 | Mbappé, 300 career goals before turning 25; Messi was older | Flashscore, https://www.flashscore.com/news/mbappe-scores-300th-career-goal-but-focuses-on-france-s-record-win/W2MhuNmA | 300th goal on 18 Nov 2023 at 24y 10m 29d. AP says 24y 333d. Messi was 25y 4m 3d. Ronaldo 27y 90d and the game counts (412 / 418 / 554) come from a 90min table, **UNVERIFIED**. | **Club + country, senior official** (Flashscore's exact basis is unclear) | Fastest-to-300 / by age / "same point in career" |
| 18 | Messi wins a record eighth Ballon d'Or | GWR, https://www.guinnessworldrecords.com/news/2023/10/lionel-messi-proves-hes-worlds-greatest-footballer-with-eighth-ballon-dor-win-760420 | 8 wins (30 Oct 2023). Ronaldo has 5. | Award (no match scope) | Count / career |
| 19 | Ronaldo, first man to 900 official career goals; tracker now at 981 | CBS Sports, https://www.cbssports.com/soccer/news/cristiano-ronaldo-becomes-the-first-man-to-score-900-goals-after-scoring-for-portugal-in-nations-league/ ; Opta Analyst, https://theanalyst.com/articles/cristiano-ronaldo-900-goals-stats-opta ; ESPN tracker, https://www.espn.com/soccer/story/_/id/46751020/cristiano-ronaldo-goal-tracker-road-1000-career-goals | 900th goal on 5 Sep 2024 vs Croatia: 769 club + 131 Portugal. Opta notes that the 2 Sporting B appearances are excluded. 950th goal: Oct 2025 (ESPN). **981 goals in 1,338 games** as of 12 Oct 2026. | **Club + country, senior official matches** | Fastest-to-M / career sum / all-time |
| 20 | Ronaldo reaches 100 international goals, the second man to do so; breaks Daei's record with 111 | Jakarta Post (AFP), https://www.thejakartapost.com/news/2020/09/09/ronaldo-nets-100th-international-goal-as-portugal-down-sweden | 100th goal on 8 Sep 2020 vs Sweden. Ali Daei was first, with 109. Ronaldo passed 109 with goals 110 and 111 on 1 Sep 2021 vs Ireland (secondary source). | **Country only**, including friendlies | Fastest-to-M / career sum |
| 21 | Ronaldo, first player to score at six World Cups | Flashscore, https://www.flashscore.com/news/cristiano-ronaldo-becomes-first-player-to-score-at-six-different-world-cup-tournaments/EcmzTlTq/ | 23 Jun 2026 vs Uzbekistan, aged 41. 2006 through 2026. 10 World Cup goals. 145 international goals in 230 caps (Reuters: 144). | **World Cup finals only** | Count of tournaments scored in / career |
| 22 | Yamal, youngest Euros scorer; joint record of 4 assists | beIN, https://www.beinsports.com/en-us/soccer/uefa-european-championship-3/articles-video/lamine-yamal-equals-historic-euro-assist-record-2024-07-14 ; wire reports | Scored at 16y 362d vs France (9 Jul 2024). Previous record: Vonlanthen, 18y 141d. Youngest player in a Euro final, at 17y 1d. | **Euros finals only** | Youngest-to-1 / by age; sum / one tournament |

### A2. Team glory and futility, plus player futility

| # | Claim | Publisher / URL | Numbers | Scope | Slots |
|---|---|---|---|---|---|
| 23 | Derby's record-low 11 points | Opta Analyst, https://theanalyst.com/articles/lowest-points-totals-in-pl-history/ ; premierleague.com records, https://www.premierleague.com/en/stats/records | 2007-08: 1 win, 29 losses, 20 goals scored, 89 conceded, -69 goal difference. Next lowest: Southampton 12 (2024-25), Sunderland 15 (2005-06), Sheffield United 16 (2023-24), Huddersfield 16 (2018-19). | **PL only.** Also called a top-flight record (on 3-points-for-a-win terms). | Team / points / sum / season / PL all-time |
| 24 | Derby's 32-game winless run | Opta Analyst, https://theanalyst.com/articles/premier-league-winless-runs-southampton | 32 games (22 Sep 2007 to 11 May 2008). The article calls the run "technically ongoing". Sunderland 26 (across seasons), Southampton 22 (across seasons). | **PL league games only** | Streak / no win / any span / PL all-time |
| 25 | Sunderland's 20 consecutive defeats, a PL and top-flight record | Opta Analyst, https://theanalyst.com/articles/longest-premier-league-losing-runs | 15 straight defeats to end 2002-03, then 5 more to start 2005-06. Norwich 16, Wolves 11 (Dec 2025). | **PL.** The run crosses seasons and skips two seasons outside the PL. | Streak / losses / run / PL and top-flight all-time |
| 26 | Sheffield United concede a record 104 | Opta Analyst, https://theanalyst.com/articles/most-goals-conceded-premier-league-season/ | 104 in 38 games (2.74 per game), 2023-24. Previous record: Swindon 100 in 42 games (1993-94). Worst top-flight rate since Ipswich in 1963-64 (2.88). | **PL, with an explicit 38- vs 42-game caveat** | Sum (goals conceded) / season / PL; per-game rate across top-flight history |
| 27 | Sheffield United's worst start (2020-21): 2 points from 17 games | Opta Analyst (#23 and https://theanalyst.com/articles/wolves-worst-premier-league-team-records) | Won none of their first 17 games, finished with 23 points, scored 20 goals (joint fewest). | **PL** | Sum (points) / first N games of a season / PL all-time |
| 28 | Southampton relegated earliest by games remaining; first PL team to lose 30 | Opta Analyst, https://theanalyst.com/articles/premier-league-earliest-relegations | Relegated 6 Apr 2025 with 7 games left. 12 points, 30 losses. **"Earliest" by calendar date is still Derby's** (29 Mar 2008). The top-flight record for losses is Stoke's 31 (1984-85). | **PL** (with a top-flight caveat) | Fastest-to (relegation) / games remaining; count of losses / season |
| 29 | Wolves, worst start in PL history (2025-26) | Opta Analyst, https://theanalyst.com/articles/wolves-worst-premier-league-team-records ; https://theanalyst.com/articles/worst-starts-premier-league-season ; NBC table, https://www.nbcsports.com/premier-league-table-2025-26-season-standings | 2 points from 14 games (-22 goal difference), then 2 points from 18. 11 straight losses. 18 games without a win from the start, and 19 before their first win, which only Bolton (1902-03) had done before. Finished with 20 points (3W 11D 24L); relegated with 5 games left (the date is UNVERIFIED). | **PL; top-flight comparison for the winless start** | Sum (points) / first N games / PL and top-flight all-time |
| 30 | Sunderland 2005-06 (15 points) and 2002-03 (19 points) | Opta Analyst (#23, #28) | 2005-06: 3 wins, relegated with 5 games left. 2002-03: 4 wins, lost their last 15. | **PL** | Points sum / season |
| 31 | Leicester become the first team in the top four tiers to lose 8 straight home league games without scoring | Opta Analyst, https://theanalyst.com/articles/leicester-city-record-breaking-home-run | 2024-25: 8 games, 21 conceded. Later extended to 9 (UNVERIFIED). | **League games, English tiers 1-4** | Streak / home losses without scoring |
| 32 | Arsenal's Invincibles: 49 unbeaten | premierleague.com, https://www.premierleague.com/en/news/59016 ; Opta Analyst, https://theanalyst.com/articles/the-longest-unbeaten-runs-in-the-premier-league/ | 2003-04 season: 26W 12D 0L, 90 points. The run lasted from 7 May 2003 to 24 Oct 2004, across three seasons. The **Analyst page contradicts itself** on the W/D split. The pre-PL record was Forest's 42. | **PL league games only** | Streak / not losing / any span / PL all-time |
| 33 | Leicester win the title as 5000-1 outsiders | Sky Sports, https://www.skysports.com/football/news/30385/10283289/leicester-city-201516-premier-league-season-review | 81 points, a 10-point margin, title sealed with 2 games left (2015-16). 23W 12D 3L is UNVERIFIED. | **PL** | Points sum / season (the odds are a narrative hook) |
| 34 | Man City's Centurions: 100 points | premierleague.com, https://www.premierleague.com/en/news/666355 | 2017-18: 100 points, 32 wins, 106 goals, +79 goal difference, 19-point margin, 18 straight wins. The previous points record was Chelsea's 95. | **PL.** Points and wins are described as top-flight records. | Points sum / season / PL all-time |
| 35 | Liverpool win the title with 7 games to spare (2019-20); City win four in a row (2020-24) | premierleague.com, https://www.premierleague.com/news/1745296 ; ESPN, https://www.espn.com/soccer/story/_/id/40178380/manchester-city-make-history-fourth-straight-premier-league-title | Liverpool: 7 games left, a record by games remaining (not by date); 99 points (UNVERIFIED). City: 91 points in 2023-24 with Arsenal on 89; ESPN says no other team in English football history has won four top-flight titles in a row. | **Liverpool: PL. City: English top flight since 1888.** | Fastest-to (title) / games remaining; streak / seasons |

Other numbers in the record books worth using as test gates:

- **Four 9-0 wins, Southampton on the losing end twice:** https://theanalyst.com/articles/biggest-premier-league-wins
- **Spurs became the first club to lose 10 PL games after leading by 2 or more goals:** https://www.skysports.com/football/news/11675/13229943
- **Spurs finished 17th in both 2024-25 and 2025-26:** https://www.skysports.com/football/news/11095/13546772
- **West Ham were relegated in 2025-26 on 39 points:** ESPN, https://www.espn.com/soccer/story/_/id/48804476
- **Richard Dunne has 10 PL own goals and shares the record of 8 red cards:** premierleague.com records page

### Scope tally

The table counts the 35 numbered factoids by which competitions count:

| Scope | Count | Factoid numbers |
|---|---|---|
| Single domestic league | 23 | PL: 1-5, 23-30, 32-35. Bundesliga: 11-13. La Liga: 14-15. Tiers 1-4: 31 |
| Single competition (UCL, World Cup, Euros) | 7 | 6-10, 21, 22 |
| Club + country, all official matches | 3 | 16, 17, 19 |
| Country only | 1 | 20 |
| Award | 1 | 18 |

One factoid (#35) frames City's streak on English top-flight history rather than the PL era.

### Notes for building test gates

- **Corrections to the brief:**
  - Kane was never the fastest to 100 PL goals; he took 141 games. Shearer held that record at 124 until Haaland.
  - Ronaldo was the second man to 100 international goals, after Daei.
  - No Guinness page was found for Ronaldo's "900 official career goals". Do not attribute that number to Guinness.
- **Not found on a reliable page:**
  - Zlatan "scored in every league he played in". The nearest Guinness record is most clubs scored for in the UCL (6). Treat the claim as UNVERIFIED.
  - Messi's international assists record (secondary sources only).
- **Two meanings of "earliest":** by calendar date or by games remaining, and they name different holders (Derby vs Southampton; Liverpool's title). The comparator's "fastest to" should mean games, which is how every player factoid is framed.
- **Many runs cross seasons:** Arsenal 49, Sunderland 20, Ronaldo's 11-match UCL streak. Some even cross gap years spent outside the league. A streak engine must run over a club's PL games in order, ignoring season boundaries, and that is how publishers count them.
- **Futility is team-scoped, and glory is mostly player-scoped.** A football comparator needs a team entity from day one, as Drew found with the NFL site.
- **Strong live candidates for 2026-27 launch copy:**
  - Kane's UCL scoring streak (9 games and counting)
  - Ronaldo's countdown to 1,000 goals (981 as of 12 Oct 2026)
  - Haaland's place on the UEFA first-N-games table

---

## Part B: how publishers define a career

### Per publisher

**Transfermarkt.** Hard to read automatically: WebFetch is blocked, and the browser view hits a consent wall that offers only "accept" or a paid plan, which we did not accept.
- The player header shows national-team "Caps/Goals" (Ronaldo 234 / 146 as of 4 Jun 2026). It also tags each league with its tier ("League level: First Tier"), so a top-flight filter is possible.
- **It excludes the Arab Club Champions Cup**, a UAFA competition that FIFA does not recognise, so in April 2026 it showed Ronaldo on 961 against ESPN's 967 (Gulf News, https://gulfnews.com/sport/football/why-some-stats-show-cristiano-ronaldo-on-961-goals-instead-of-967-1.500500008). Sofascore later said it counts those goals and showed 967 (https://www.goal.com/en/news/official-clarification-did-ronaldo-actually-miss-six-goals-during-his-historic-run-in-the-2000s/bltbf45d7deb22070cd).
- Its caps match Wikipedia's senior figure, so it almost certainly counts international friendlies (inference).
- How it handles B teams, club friendlies, and starts or minutes on its detail tables: UNVERIFIED.

**FBref (Sports Reference).** Two blog posts matter.
- **In January 2026 the advanced-data provider terminated its feed and required the data to be deleted.** FBref keeps "deep historic basic data" for 100+ competitions; xG, progressive passes and similar were removed (https://www.sports-reference.com/blog/2026/01/fbref-stathead-data-update/). Secondary coverage names Opta / Stats Perform as the provider (https://www.theixsports.com/the-ix-soccer/fbrefs-loss-advanced-stats-womens-soccer-data-accessibility/).
- Senior national-team data sits on a separate tab, with men's friendlies from 2014 on (https://www.sports-reference.com/blog/2020/03/senior-national-team-data-now-on-fbref/).
- Career tables are split into Domestic Leagues, Domestic Cups, International Cups, National Team and All Competitions. Match logs carry Start (Y/N) and minutes. FBref warns that a career is "likely not complete" when the player spent time in leagues it doesn't cover. These details come from secondary docs (https://xgpy.readthedocs.io/en/latest/fbref.html) because FBref itself was blocked by a Cloudflare check.
- **This is the closest match to a US Sports Reference player page, and the natural model for Drew's tabs.** Whether it has B-team rows: UNVERIFIED; probably only where it covers that division.

**Soccerway (now on the Flashscore platform).** Read: https://www.soccerway.com/player/ronaldo-cristiano/WGOY4FSt/
- Tabs: League, Domestic Cups, International Cups, National Team. Columns: matches, goals, assists, cards, rating.
- Career tables have no minutes and no starts/sub split; the per-match list does show minutes.
- **The history is incomplete.** Ronaldo's Sporting 2002-03 season is missing, and his national-team tab shows 181 caps against 234 elsewhere. The page itself says older data may be incomplete.
- Its national-team rows include friendlies; there are no club friendlies.
- **Not usable for historical career totals.**

**Wikipedia (WikiProject Football).**
- **The infobox club figures are league-only and leave out playoffs** (https://en.wikipedia.org/wiki/Template:Infobox_football_biography). The infobox national-team figures include all competitions and friendlies. Each club spell gets its own row, including B teams and loans; youth national sides get rows too.
- **Career statistics tables** (https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Football/Players):
  - Columns: League (Division / Apps / Goals), National cup, League cup, Continental, Other, Total.
  - Loan rows sit under the parent club, and assists are "against consensus".
  - **The Division column puts a relegated club's second-tier season in the same club block.** Nothing separates top flight from other divisions; you filter on that column.
- Ronaldo's page (as of 20 Oct 2026):
  - The club table includes a Sporting B row (2 apps, 0 goals).
  - "Other" covers super cups, the Club World Cup and the Arab Club Champions Cup.
  - Club total: 1,109 apps / 835 goals. Senior international: 234 / 146.
  - **The international career-total row is 268 / 164 because it includes youth sides.**
- Messi's page: the club table includes Barcelona C (10 / 5) and Barcelona B (22 / 6), and the international total row includes U20 and U23 games.
- **No minutes in these tables.** A naive sum of a Wikipedia table includes B teams and youth caps.

**Opta / Opta Analyst / OptaJoe.**
- Ronaldo's 900 = 769 club + 131 Portugal "professional" goals. **His 2 Sporting B appearances are explicitly excluded** (https://theanalyst.com/articles/cristiano-ronaldo-900-goals-stats-opta).
- Player pages show appearances, minutes, goals, assists and goal involvements per competition, with no starts column (https://theanalyst.com/players/13574/cristiano-ronaldo).
- Every OptaJoe-style factoid in Part A states its competition (PL, UCL), and **UCL figures exclude qualifiers**. Opta is the de facto standard for this discourse.
- Formal definitions of an appearance or a start: UNVERIFIED.

**RSSSF.** The broadest and most transparent counter (https://rsssf.org/players/prolific.html, updated 19 Jul 2026).
- **"Official Matches" includes everything competitive:** all leagues "incl. regional-, reserve-, amateur-", cups, and all selections ("A, B, Ol, U, league, armee... regional, city"). It even includes wartime tournaments and all-star games.
- A separate "All Matches" list adds friendlies.
- Official list: Ronaldo 994 in 1,366, Helmchen 989+, Bican 950+, Messi 948 in 1,220, Puskás 802, Romário 785, Pelé 778 in 851.
- **Pelé's detail page splits his record into official 851 / 778, friendlies 562 / 546, and total 1,413 / 1,324** (https://www.rsssf.org/players/ppeledata.html).
- **RSSSF's Ronaldo figure reconciles exactly with the senior count:** 976 senior goals (2 Jul 2026) + 18 youth-international goals = 994 (derived).

**IFFHS.** No primary page found. Per Wikipedia (https://en.wikipedia.org/wiki/List_of_footballers_with_500_or_more_goals), IFFHS counts goals in "top-level professional football competitions".
- That gives 27 players with 500+ goals, against 82 under RSSSF's rules.
- Wikipedia's IFFHS-basis table: Ronaldo 981, Messi 936, Pelé 762, Romário 756, Bican 722.
- IFFHS has revised its numbers over time. It first excluded Bican's wartime goals, then recognised 229 of them. A circa-2021 list had Romário 689 and Pelé 684 (http://footystyle.com/iffhs-publishes-the-list-of-top-scorers-in-football-history-romario-first-ronaldo-third/, UNVERIFIED).
- It also runs a league-goals-only "Top Division Goal Scorer" award.

**Guinness World Records.**
- **Most career goals: Pelé, 1,279 in 1,363 games** (https://www.guinnessworldrecords.com/world-records/most-career-goals-football). The page does not say outright that friendlies are included, but the figure only works if they are. ESPN explains that GWR's 1,279 sits 2 below FIFA/CONMEBOL's 1,281 because GWR leaves out 2 "special appearance" goals.
- GWR does have pages for Ronaldo's men's international goals record and Messi's 91 (competitive only, friendlies excluded).
- **No Guinness record page was found for Ronaldo's 900 career goals. GWR is not the source for that number.**

**UEFA.com.** Covers UEFA competitions only.
- The UCL all-time table excludes qualifiers by default (Ronaldo 140); a separate table includes them (Ronaldo 141).
- The pre-1992 European Cup is ranked separately (Di Stéfano 49). An all-UEFA-club-competitions table also exists (Ronaldo 145, Messi 132): https://www.uefa.com/uefachampionsleague/news/0257-0e91daaa4ec8-19686ad1d08f-1000--uefa-club-competition-all-time-top-scorers-cristiano-ronaldo/
- **UEFA publishes minutes, and the "first N games" article (Part A #7) is the comparator's shape done by the governing body.**

**premierleague.com.** PL matches only.
- Ronaldo: 236 apps, 103 goals, 37 assists (https://www.premierleague.com/en/players/14937/cristiano-ronaldo/stats).
- **Sub appearances appear inside the appearance count, as "10 (6)"**, and minutes and Opta metrics (xG, xA) are shown.
- The records page (https://www.premierleague.com/en/stats/records) is the PL-era record book, and every team factoid in A2 checks against it.
- A relegated club's Championship season simply does not exist here.

**messivsronaldo.app** (https://www.messivsronaldo.app/, updated 20 Oct 2026).
- Ronaldo 981 goals / 261 assists / 1,341 apps / 109,632 minutes. Messi 936 / 427 / 1,181 / 97,197.
- It says it excludes club friendlies, excludes UCL qualifiers, and uses Opta assists. It offers an "excluding USA/Saudi" view and a separate "All Goals Including Youth" page.
- Minutes yes, starts no.
- **Its totals are exactly Wikipedia minus B teams and youth caps** (Ronaldo 835 + 146 = 981; Messi (821 - 11) + 126 = 936; derived). That is the same basis Opta and ESPN use.

### Answers by question

| Question | Answer |
|---|---|
| Club vs national team split? | Everyone splits them. FBref and Soccerway use separate tabs; Wikipedia uses separate tables. Career totals combine the two only in "career goals" headlines. |
| Friendlies? | **Club friendlies: excluded by everyone except RSSSF's "All Matches" list and GWR's Pelé figure.** International "A" friendlies: **included** in caps and goals by Wikipedia, Transfermarkt, FBref (from 2014), Soccerway and GWR. |
| Loans and B/reserve teams? | Loans count everywhere, as separate rows; Wikipedia keeps loan rows under the parent club. **B teams (Barcelona B, Castilla, Bayern II) count toward RSSSF totals and appear as rows on Wikipedia. Opta, ESPN and messivsronaldo.app exclude them.** |
| Top flight vs all divisions? | Transfermarkt tags league tier; Wikipedia has a Division column; FBref separates competitions. premierleague.com and UEFA.com are top-flight by definition. A relegated club's second-tier season stays in the career table (Wikipedia, FBref) but drops out of league-scoped records. |
| Apps vs starts vs minutes? | Starts: FBref match logs; premierleague.com shows sub appearances. Minutes: FBref, premierleague.com, UEFA.com, Opta Analyst, messivsronaldo.app. **Wikipedia and Soccerway career tables have no minutes.** |
| Super cups, Club World Cup, domestic cups? | Official for everyone (Wikipedia files them under "Other"). The edge cases are competitions FIFA doesn't recognise, such as the Arab Club Champions Cup, and US competitions (MLS playoffs, Leagues Cup), which ESPN counts for Messi. |

### Where the famous numbers disagree

- **Ronaldo career goals.** Same player, same date range, different bases:

  | Count | Basis | Source |
  |---|---|---|
  | 961 | Excludes the Arab Club Champions Cup, Apr 2026 | Transfermarkt |
  | 967 | Includes it, Apr 2026 | ESPN, Sofascore |
  | 981 | Senior, Oct 2026 | ESPN, messivsronaldo.app, IFFHS-basis table |
  | 994 | Adds youth internationals, Jul 2026 | RSSSF |
  | 268 / 164 | International career-total row, includes youth sides | Wikipedia |

  Opta also excludes his 2 Sporting B appearances.
- **Messi:**
  - ESPN put his 900th goal on 19 Mar 2026, from 1,142 games (https://global.espn.com/football/story/_/id/47220729/messi-score-900th-goal-2026-reach-1000-pass-ronaldo). That count includes MLS playoffs, the Leagues Cup and the Campeones Cup.
  - He is now at 936 on the senior basis and 948 on RSSSF's, which adds Barcelona B/C and U20/U23 goals.
- **Pelé:**

  | Count | Basis | Source |
  |---|---|---|
  | 1,279 | | GWR |
  | 1,281 | | FIFA / CONMEBOL |
  | 1,283 | | Pelé's own claim |
  | 1,091 | | Santos |
  | 1,324 | All matches | RSSSF |
  | **778** | Official | RSSSF |
  | 762 | | IFFHS (via Wikipedia) |
  | **757** | Official: 643 Santos + 37 Cosmos + 77 Brazil | ESPN 2021 (https://africa.espn.com/football/story/_/id/37613098/is-cristiano-ronaldo-soccer-all-top-scorer-pele-josef-bican-never-know-sure) |

  **The gap between 1,000+ and 700-something is almost entirely friendlies and exhibition tours.**
- **Bican:**
  - The Czech FA says 821. Older RSSSF/FIFA figures said about 805, including reserve-team goals and unofficial internationals.
  - RSSSF now says 950+; IFFHS says 722; UEFA counts 518 top-flight goals.
  - 759 is widely quoted but has no definitive source. Sources: https://www.goal.com/en/news/ronaldo-greatest-goalscorer-refuted-czech-fa-bican/1wejo446sl3w61qwi63u29asxr
- **Romário:**
  - His "1,000th goal" (20 May 2007) counted youth goals, friendlies and charity games.
  - FIFA recognises 760 official goals; RSSSF has 785, IFFHS 756, ESPN about 745 (https://www.goal.com/en/lists/hall-of-fame-romario-brazil-penalty-box-panther-over-1000-career-goals/blt7cd7afecead0ea2f).
- **FIFA keeps no official list of career goal totals.**

### What "official match" means, and the US analogy

**FIFA's Statutes** (2024 edition, https://digitalhub.fifa.com/m/16d1f7349fa19ade/original/FIFA-Statutes-2024.pdf) define an official competition as one "for representative teams organised by FIFA or any confederation". That wording covers national teams. For clubs, "official" means in practice a match in a competition run by a member association or confederation: league, cup, super cup, continental cup. A FIFA document that says this for clubs: UNVERIFIED.

**FIFA's Regulations Governing International Matches** (older edition, https://digitalhub.fifa.com/m/428d57940518eef/original/p0ppt4a5mrbb0zmvbl1g-pdf.pdf) define an "A" match as one where both members field their first representative team. **An authorised senior friendly is therefore a full "A" international and counts as a cap.** A match against a club or a lower representative side is Tier 2 and is not a cap. FIFA opened a working group to revise these regulations in May 2024.

**RSSSF publishes no definition of "official".** In practice it means any organised competitive match at any level, with only friendlies and training games set aside. That is far broader than the media consensus (Opta, ESPN, Transfermarkt): senior first team plus senior "A" internationals.

**US mapping** (our framing, not taken from a source):

| Football | US equivalent | Counted? |
|---|---|---|
| League match | Regular season | Yes; Wikipedia's infobox is league-only, like quoting regular-season stats |
| Domestic and continental cups, super cups, Club World Cup | Postseason, or an in-season tournament like the NBA Cup | Yes, but tracked in their own columns |
| Club friendly, preseason tour | Preseason, spring training | Never |
| **"A" international friendly** | No clean equivalent: an exhibition that counts | **Yes**, because FIFA classes it as a full international |
| B / reserve team | Minor leagues | RSSSF yes; Opta, ESPN no |
| Youth international | College or junior national team | RSSSF yes; senior counts no |
| Relegated season in the second tier | No US equivalent (closest: a demotion to AAA) | In the career table, but not in league-scoped records |

### Recommended Method basis

- **Default board: a single league, starting with the Premier League (1992-93 onward).** This matches premierleague.com and Opta. Appearances include sub appearances, and minutes are published. A top-flight-since-1888 toggle is a later addition.
- **UCL board:** UCL proper, excluding qualifiers, which matches UEFA and Opta. It runs from 1992-93, with the European Cup kept separate.
- **"Career" board (opt-in):**
  - Includes senior first-team official club matches (league, domestic cups, super cups, continental and intercontinental club competitions) plus senior "A" internationals including friendlies.
  - Excludes club friendlies, B/reserve teams and youth internationals.
  - This reproduces Opta, ESPN and messivsronaldo.app: 981 / 936 as of Oct 2026.
- **State the known swings in the Method section:**
  - Arab Club Champions Cup: 6 Ronaldo goals.
  - RSSSF includes youth and reserve games: +18 for Ronaldo (994 vs 976 senior, both at Jul 2026).
  - Pelé's friendlies: about 500 goals.
