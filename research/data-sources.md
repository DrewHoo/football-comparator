# Football comparator: data sources (2026-10-21)

[V] = verified today by fetch, API call or download. [R] = recalled or secondary, not checked today. [S] = official text seen only in a search snippet.

## Summary

1. No source is cleanly licensed, still maintained, and has big-5 + UCL player-match rows from before 2012. That source does not exist.
2. transfermarkt-datasets (CC0, 2012-07 to 2026-06-28) is frozen indefinitely. The maintainer's 2026-09-05 post says updates are paused with "no estimated date" [V]. The proposed fix (PR #382) routes the scraper through Bright Data's Web Unlocker to get past Transfermarkt's bot block [V]. That makes the license chain worse.
3. The new find is ESPN's undocumented soccer JSON API (`site.api.espn.com/.../soccer/{league}/summary`). It is keyless and reachable from a GitHub Action. For EPL, LaLiga, Serie A, Bundesliga, Ligue 1, the UCL and the Eredivisie it carries rosters with starter, subbedIn and subbedOut flags, plus timed goal and substitution events, from 2002-03 (UCL 2001-02). Per-player stat lines (G, A, APP, SUB) start between 2001-02 (EPL) and 2007-08 (Serie A) [V, sampled].
4. ESPN has Messi's debut (2004-10-16, on at 83') and first goal (2005-05-01: on at 88', scored at 90', stat line G 1) [V]. Ronaldo is covered from Man Utd 2003-04; his Sporting season is missing (no `por.1` before 2005) [V].
5. ESPN is the same upstream as Drew's WNBA precedent: sportsdataverse's CC BY releases are ESPN pulls. The difference is that nobody publishes a European soccer release, so Drew would be the compiler. Disney's terms bar automated extraction [V], exactly as they do for the WNBA data.
6. StatsBomb open data is worse than the skill notes say. The agreement bars distributing or reproducing the data to any third party, and bars commercial exploitation. It allows publishing analysis, with the logo [V, LICENSE.pdf]. It cannot feed a published ledger.
7. Commercial APIs (Sportmonks €29-99/mo, API-Football ~$19, football-data.org €29) display-license the data on your own site. None clearly allows public per-match JSON in a repo, and none reliably reaches 2002 at player grain [mixed V/S/R].
8. Internationals: martj42 `goalscorers.csv` (CC0) has no friendlies. It has 71 of Messi's 126 goals [V]. RSSSF per-cap logs exist for 100-cap players under an "acknowledge RSSSF" permission [V]. ESPN national-team rosters are good for tournaments and qualifiers, patchy for friendlies [V].
9. UCL before 2001: nothing open at player grain. UEFA's terms forbid systematic collection [V]. RSSSF has finals line-ups only [V].
10. A Wikipedia (CC BY-SA) per-goal spine works for Ronaldo, who has a ~981-row club-goal list. It doesn't work for Messi, Haaland or Mbappé (international goals only), and it has no appearances, so "first 100 games" can't be computed [V].

## Feasibility table

| Source | Leagues / comps | Seasons (player grain) | Grain | IDs | License | Hosting | Maintained? | Keyless from GH Action? |
|---|---|---|---|---|---|---|---|---|
| **ESPN soccer API** (`site.api.espn.com/apis/site/v2/sports/soccer/{eng.1,esp.1,ita.1,ger.1,fra.1,uefa.champions,ned.1,fifa.world,...}`) | Big-5, UCL, Eredivisie, World Cup, Euros, WC qualifiers, ~200 slugs [R] | Rosters + start flag + goal/sub key events: EPL 2001-02, other big-5 2002-03, UCL 2001-02. Stat lines (G/A/APP/SUB/YC/RC/shots): EPL 2001-02, LaLiga 2005-06, Bundesliga & Ligue 1 2006-07, Serie A 2007-08, UCL 2005-06 [V, 3 matches/season] | Player-match. Start flag yes. Subs with minute (from keyEvents), so minutes are derivable. Assists only where stat lines exist | ESPN athlete id, event id | None. Disney ToS bars automated extraction [V] | Undocumented JSON API | Live, current season | Yes [V] |
| **dcaribou/transfermarkt-datasets** | ~40 comps: big-5, UCL/UEL (+qualifiers), domestic cups, 2026 WC | 2012-07-03 → 2026-06-28; 1,894,350 rows [V] | `appearances`: goals, assists, cards, minutes. `game_lineups.type`: starting_lineup / substitutes [V] | Transfermarkt player/game ids | CC0 on compilation [V]; Transfermarkt ToS bars scraping [R] | R2 bucket + DuckDB (files re-uploaded 2026-09-05, 200 OK) [V]; Kaggle `davidcariboo/player-scores`; HF mirror `ngeorgea/transfermarkt-player-scores` [V] | **No.** Paused indefinitely [V] | Yes |
| ScoutAI fork `arnauddebrabant2/transfermarkt-datasets` | big-5 + 2nd tiers + JPL | 2024-01 → current (bot commits to 2026-10-19; ~33k rows after 2026-07-07) [V] | same appearances schema, mixed date formats | TM ids | Inherits CC0 file; no statement on new rows [V] | GitHub raw | Yes, by a third party's product bot | Yes, but not a history source |
| StatsBomb (now `hudl/open-data`) | LaLiga 2004-05→2020-21 (Messi's matches only: 7-38/season), full 2015-16 EPL/LaLiga/Serie A (380), Ligue 1 (377); Arsenal 2003-04 (38); one UCL final per season 1999-2019; WC 1958-2022 (partial early); Euros 2020, 2024 [V] | as listed | Event-level; lineups with sub times | StatsBomb ids | **Agreement bars distributing/reproducing the data and commercial use; analysis may be published with logo** [V] | GitHub raw JSON | Yes (pushed 2026-09) [V] | Yes |
| vaastav/Fantasy-Premier-League | EPL only | 2016-17 → 2026-27 (gw1 only; last commit 2026-08-28) [V] | Per-gameweek player rows: minutes, goals, assists; `starts` from 2022-23 [V] | FPL element id | Code MIT; data "property of fantasy.premierleague.com and understat.com" [V]; PL terms bar commercial use and building a database [V] | GitHub CSV | Lagging | Yes |
| FPL API itself | EPL | Current season only; past seasons as totals [V] | per-GW minutes/goals/assists/starts | FPL id | PL ToS, as above [V] | API | Live | Yes |
| Kaggle hugomathien/soccer | 11 European leagues, no UCL | 2008-09 → 2015-16 [V] | Starting XI per match + goal XML; no subs/minutes [V/R] | API-Football-ish ids | "Open Database, Contents © Original Authors"; author asks no commercial use [V] | Kaggle (auth); HF mirror `julien-c/kaggle-hugomathien-soccer` keyless [V] | Static 2016 | Via HF |
| Kaggle technika148/football-database | big-5 | 2014-15 → 2019-20 [V] | appearances with minutes, goals, assists [R] | Understat ids | CC0 stated; source is Understat [V] | Kaggle (auth) | Static 2021 | No |
| JaseZiv/worldfootballR_data | ENG/ESP/FRA/GER/ITA/USA | 2024-08 → 2025-09 only [V] | FBref player-match with Min/Gls/Ast [V] | FBref | None; FBref scrape [V] | GitHub release | Archived 2025-09 [V] | Yes, useless |
| American Soccer Analysis API | MLS 2013+, NWSL 2016+, USL | as listed | player-game minutes, goals, xG, assists | ASA ids | Wrapper MIT; no data license found [V] | API | Yes | Yes |
| martj42 `goalscorers.csv` | Internationals | 1916-07-02 → 2026-07-19, 47,914 goals [V] | One row per goal: date, teams, scorer, minute, own_goal, penalty (no appearances) [V] | names only | CC0 [V] | GitHub raw | Yes (pushed 2026-10-10) [V] | Yes |
| RSSSF per-cap logs | Internationals, mostly 100-cap players | full careers | One row per cap: cap, goals, date, opponent, competition [V] | none | "free to copy … provided proper acknowledgement is given to the RSSSF" [V] | static HTML | Lags (Messi 207 caps vs 208) [V] | Yes, HTML parse |
| Wikipedia goal lists | Per star | full careers | Per goal; Ronaldo club + intl; others intl only [V] | none | CC BY-SA 4.0 | API / HTML | Yes | Yes |
| Wikidata P54 | Per player per club stint | — | Stint totals (P1350 matches, P1351 goals), scope unmarked [V] | QIDs | CC0 | SPARQL | Yes | Yes |
| Sportmonks | big-5 + UCL on Growth (€99/mo) [V] | last 3 seasons; older as add-on "from €29" [V]; ~2005-06 [R] | lineups, player stats | own | "exclusively available per domain" [V] | API | Yes | Key needed |
| API-Football | all | player stats ~2015-16+ [R] | player-match stats | own | resale banned; display OK [S] | API | Yes | Key needed |
| football-data.org | 12 comps incl. big-5 + UCL | lineups recent [R] | lineups, scorers, subs; no assists [V] | own | terms page 404 today | API | Yes | Key needed |
| Sportradar | all | "as far back as 2007" [V] | full | own | no derivative works; destroy data 30 days after termination [V] | API | Yes | Key + contract |
| Opta / Stats Perform | all | deep | full | Opta | enterprise contract only [S] | feed | Yes | No |

Not usable at all: FBref (Sports Reference terms; Opta feed cut 2026-01-20), Understat, WhoScored, Sofascore, FotMob (ToS bars "systematic, regular, or bulk retrieval" [V]), Transfermarkt direct, national-football-teams.com ("Unauthorized publishing and copying … strictly prohibited" [V]), 11v11 and worldfootball.net (403 today; proprietary [R]), UEFA.com (see Q3), messivsronaldo.app/.net (all rights reserved, no reuse terms [V]).

## Q1. Big-5 + UCL player-match rows before 2012

### transfermarkt-datasets: status
- README banner [V]: "Updates are paused. The dataset is current to 6 July 2026." `games` ends 2026-07-06, `appearances` 2026-06-28, `player_valuations` 2026-06-12. No 2026/27 squads. https://github.com/dcaribou/transfermarkt-datasets
- Discussion #383 (2026-09-05) [V]: the pipeline "depends on pages from the upstream source that are no longer reliably reachable from GitHub Actions runners". No ETA, and the maintainer calls the constraint not "one I can resolve by spending an evening on it". https://github.com/dcaribou/transfermarkt-datasets/discussions/383
- Issue #381 / PR #382 [V]: the scraper has failed since 2026-07-17 (0 records, `Failed to scrape`). The PR's fix passes `BRIGHTDATA_API_KEY` so Transfermarkt's DataDome block is bypassed through Bright Data Web Unlocker. It was closed, not merged. https://github.com/dcaribou/transfermarkt-datasets/pull/382
- Files are still up [V]: `https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/transfermarkt-datasets.duckdb` (210.8 MB), `appearances.csv.gz` (45.3 MB), `game_lineups.csv.gz` (125.8 MB), `games.csv.gz` (5.0 MB), all Last-Modified 2026-09-05. That is a re-export with quoting fixes, not new data.
- Profile of `appearances` [V]: 1,894,350 rows, 2012-07-03 → 2026-06-28. Rows per year are ~125-153k for 2013-2025. The top competitions are IT1, ES1, GB1, FR1, TR1, L1, NL1, PO1, then CL with 49,536 rows. Messi (TM id 28003) has 529 rows. The only national-team competition is FIWC (2,251 rows).
- Forks: 100. The only actively updated one is `arnauddebrabant2` ("ScoutAI Bot", commits to 2026-10-19). It runs its own scrape from 2024-01, with big-5 and second tiers [V]. It is not a continuation of the 2012 history, and nothing says how it gets past the block.

### ESPN soccer API (the unlock for 2002-2012)
- Endpoints [V]: `https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard?dates=YYYYMMDD` (single dates only; ranges return non-JSON) and `.../summary?event={id}`. `rosters[].roster[]` carries `athlete`, `starter`, `subbedIn`, `subbedOut` and `stats[]` (APP, SUB, G, A, SHOT, SOG, YC, RC, FC, FA, OF, OG, GA, SV). `keyEvents[]` carries goals, penalties and substitutions with clock and participants.
- Coverage sweep [V]: 3 matches from the first November matchday each season, 2000-2012.

| Slug | Rosters + starter flag + timed goal/sub events | Per-player stat array |
|---|---|---|
| eng.1 | 2001-02 rosters (no starter flag in sample), 2002-03 full | 2001-02 |
| esp.1 | 2002-03 (2001-02 rosters without starters) | 2005-06 |
| ita.1 | 2002-03 | 2007-08 |
| ger.1 | 2002-03 | 2006-07 |
| fra.1 | 2002-03 | 2006-07 |
| uefa.champions | 2001-02 | 2005-06 |
| ned.1 | 2002-03 (2001-02 without starters) | not before 2005 |
| por.1 | none 2001-04 | — |

- Spot checks [V]:
  - **Messi's debut**: Espanyol-Barcelona, 2004-10-16, event 166495. Messi has `subbedIn: true`, and a keyEvent puts him on for Deco at 83'. Stats are empty, because LaLiga 2004-05 predates stat arrays.
  - **Messi's first goal**: Barcelona-Albacete, 2005-05-01, event 179089. Messi is on for Eto'o at 88' and scores at 90'. Stats: G 1, SUB 1.
  - **2005-11-02 UCL**: Barcelona-Panathinaikos. Messi started and scored (G 1); Eto'o has G 3.
  - **2003-04-12**: Man Utd 6-2 Newcastle. Scholes G 3, Giggs A 2.
- Where stat arrays are missing (LaLiga 2002-05, Serie A 2002-07, Bundesliga/Ligue 1 2002-06, UCL 2001-05), goals come from `keyEvents` and appearances from rosters. **Assists are unavailable there.** Minutes come from the sub clock: 90 for unsubbed starters, `subOut - 0` for starters taken off, `90 - subIn` for subs, ignoring stoppage time.
- Not verified: completeness at scale. Before trusting the source, run a gate. Sum ESPN goals per player-season and compare against a known answer (Messi LaLiga 2004-05: 7 apps/1 goal; Henry 2002-03 EPL: 24 goals) for every season and league. ESPN rosters before ~2008 sometimes list 16 players (starters plus used subs only, no unused bench), which is fine for appearances.
- License posture: Disney Terms of Use, last updated 2024-05-24 [V], https://disneytermsofuse.com/english/. Section 2.B(x) bars accessing or extracting "using a robot, spider, script, or other automated means", and use is "for your personal, noncommercial use only". This is the same upstream and the same terms as sportsdataverse's WNBA/NFL-adjacent ESPN releases. sportsdataverse publishes no European soccer release (only `usfootballR`, MLS/NWSL, "a scraping and aggregating interface for ESPN's MLS and NWSL statistics") [V]. Drew would be pulling ESPN himself.

### Kaggle / Hugging Face / GitHub dumps
See table. Highlights [V unless marked]:
- Mathien's European Soccer Database is starting XIs only (no subs, minutes, assists, or UCL), 2008-2016, with a non-commercial request. It could at best cross-check ESPN's starter flags.
- technika148 (CC0, Understat source, 2014-2020) is inside the transfermarkt window, so it adds nothing.
- Davide Salerno's Serie A set was not found by Kaggle API or search.
- azminetoushikwasi "Messi/CR7 all club goals": per-goal rows (season, competition, date, opponent, minute, type, assisted by). License "Open Database, Contents © Original Authors", source unstated, last updated 2023-09. No appearances.
- Hugging Face: nothing at player-match grain before 2012 except the Mathien mirror.
- GitHub: `probberechts/soccerdata` (Apache-2.0) is scraper-only and ships no data. `ScraperFC` (GPL-3.0) is scraper-only. `footballcsv`, `datasets/football-datasets` and `openfootball` are results only. No maintained repo publishes FBref, Sofascore, WhoScored or Flashscore player-match dumps.

### League-published open data
- DFL/Sportec: the open release is 7 matches of tracking + event data from 2022-23, CC BY 4.0 (Scientific Data 2025, figshare 10.6084/m9.figshare.28196177) [V]. It is not a ledger.
- No LaLiga, Serie A or Ligue 1 open player data was found [V search].
- Premier League: the FPL API has current-season per-GW rows only. The premierleague.com terms bar commercial use and "creating a database" without written approval [V]. https://www.premierleague.com/en/terms-and-conditions
- vaastav: the LICENSE file disclaims data ownership [V].

### Wikidata
- P54 carries per-stint (not per-season) qualifiers: P580/P582 dates, P1350 matches, P1351 goals, P585 as-of [V].
- Example: Messi at Barcelona is P1350=520, P1351=474. That is league-only, but the scope is unmarked.
- Per-match data is negligible: about 49 items have Messi as P710 participant, mostly internationals and finals [V].
- Haaland is **Q28967995**. Q28974776 is "cloud-init" [V].

### Commercial
Summarised in the table. Sources: https://www.sportmonks.com/football-api/plans-pricing/, https://www.sportmonks.com/terms-of-service/, https://www.football-data.org/pricing, https://developer.sportradar.com/terms-and-conditions, https://developer.sportradar.com/soccer/docs/soccer-ig-historical-data, https://goalserve.com/es/sport-data-feeds/soccer-api/prices (player stats from 2016, $200/mo), https://www.fotmob.com/tos.txt.
- api-football.com/api-sports.io, TheSportsDB, and the Stats Perform FAQ were 403/502 today.
- The common shape: you can display the data on your licensed domain. Redistribution of the data itself (a public repo of per-match JSON) is barred or unaddressed. History at player grain mostly starts 2005-2016.
- Sportmonks is the only one whose terms read as possibly OK ("distribution, transfer, and storage of data … is allowed" next to "exclusively available per domain" [V]). Ask in writing.

## Q2. National teams

- **martj42 `goalscorers.csv`** (CC0) [V], https://github.com/martj42/international_results
  - Columns: `date, home_team, away_team, team, scorer, minute, own_goal, penalty, assist`. 47,914 rows, 1916-07-02 → 2026-07-19.
  - It covers competitive tournaments and qualifiers only. **Zero goals in friendlies** (18,263 friendly results), and no AFCON or Asian Cup qualifiers.
  - Messi has 71 goals (WC qualifying 36, WC 21, Copa 14) of 126. Ronaldo has 124 of ~146.
  - The `assist` column exists but is sparsely filled [R].
  - No appearances. Usable for "fastest to N World Cup goals", not for caps.
- **RSSSF** [V]: footer says "You are free to copy this document in whole or part provided that proper acknowledgement is given to the RSSSF."
  - Per-cap logs for Messi (`/miscellaneous/messi-intlg.html`), Ronaldo and Haaland. No Mbappé page (404).
  - Each row has cap, goals, date, venue, opponent, score and competition, so it includes appearances without goals.
  - Some pages carry individual author copyrights (e.g. "(C) Copyright Karel Stokkermans and RSSSF").
  - Best appearance source for internationals. Ask before republishing as a dataset.
- **ESPN** [V]: rosters and stats for the World Cup (2002, 2006, 2014 sampled), Euro 2004, WC qualifiers 2009 (UEFA, CONMEBOL) and Copa 2007 (rosters, no stats). Friendlies are patchy: 2018 has rosters, 2011 and 2024 samples have none.
- eu-football.info (couldn't load), 11v11, national-football-teams.com, worldfootball.net: proprietary. Not usable.
- Wikipedia "List of international goals scored by X": CC BY-SA, one row per goal with the cap number [V].

## Q3. Champions League

- UEFA general terms §6.2 [V]: private non-commercial use only, and "You are not allowed to systematically collect, compile, or gather the Content". Automated robots, spiders and scripts are prohibited. https://www.uefa.com/news/0256-0dc91ad71f32-ce04913814f0-1000--general-terms-and-conditions/
- RSSSF European Cup pages 1955-56 → 2024-25 [V] are scores only, plus full line-ups for finals. https://www.rsssf.org/ec/ec199293.html
- StatsBomb has one final per season 1999-2019, plus 1970-73 finals [V]. It can't be redistributed anyway.
- ESPN `uefa.champions`: rosters and events from 2001-02, stat lines from 2005-06 [V].
- transfermarkt-datasets has CL from 2012-13.
- **No open per-player UCL rows exist before 2001-02.** Ronaldo's 2008 and Messi's 2006 UCL campaigns are reachable via ESPN. Raúl's 1995-2001 goals and Shevchenko's 1990s ones are not.

## Q4. Where a ledger could start, and who is missing

| Route | Big-5 league start | UCL start | Missing (career start before floor) |
|---|---|---|---|
| transfermarkt-datasets only | 2012-13 | 2012-13 | Messi 2004-12 (8 seasons, ~360 goals); Ronaldo 2002-12 (Sporting, all of Man Utd, first 3 Madrid seasons); Zlatan 2001-12; Henry, Zidane, Ronaldinho, Shearer entirely; Lewandowski 2010-12 |
| ESPN (rosters + key events) | 2002-03 (EPL 2001-02) | 2001-02 | Ronaldo's Sporting 2002-03 (no por.1) and most of his first Man Utd season's assists; Zlatan's Ajax 2001-02 (starters missing) + no Serie A assists until 2007-08; Henry's 1999-2002 Arsenal seasons (EPL slug starts 2001-02, so only 2001-02 onward); Zidane's Juventus years and his first Madrid season before 2002-03; Ronaldinho's PSG 2001-02; Shearer 1992-2001 (only his last 5 seasons); everyone pre-2001 |
| ESPN + Wikipedia star goal lists | same | same | Fills goal dates for Ronaldo's full club career (incl. Sporting); no appearances |
| Commercial (Sportmonks etc.) | ~2005-06 [R] | ~2005-06 [R] | Ronaldo's first 3 seasons, Henry's peak, Zidane, early Ronaldinho, Shearer |

Messi is fully covered by ESPN: debut, every LaLiga and UCL appearance, and goals 2004-05 onward. Assists exist from 2005-06 (LaLiga stat arrays). 2004-05 is a 7-app, 1-goal season, so the missing assists cost almost nothing. Haaland and Mbappé are fully covered by every route except their pre-2016 youth seasons (Salzburg/Molde in Austria/Norway: ESPN slugs `aut.1`, `nor.1` not checked).

**Recommended shape:** ESPN for 2002-03 → present as the single spine, with transfermarkt-datasets 2012-2026 as a cross-check gate (goal totals per player-season must agree within tolerance). A start of **2002-03 for leagues and 2001-02 for the UCL**, with assists from 2005-06 (LaLiga, UCL), 2006-07 (Bundesliga, Ligue 1), 2007-08 (Serie A) and 2001-02 (EPL). Print the floors per competition on the page, as the NFL site does.

## Q5. Credit lines and the license chain

| Source | Credit line to print |
|---|---|
| ESPN (self-compiled) | `Match data from ESPN, compiled by drewhoover.com.` (There's no license to cite. The sportsdataverse precedent cites "sportsdataverse, CC BY 4.0", and Drew can't borrow that here.) |
| transfermarkt-datasets | `Appearances 2012–2026: transfermarkt-datasets by dcaribou (CC0), compiled from Transfermarkt.` |
| martj42 | `International goalscorers: martj42 (Mart Jürisoo [R]), international_results (CC0).` |
| RSSSF | `International caps: RSSSF (Rec.Sport.Soccer Statistics Foundation), rsssf.org, used with acknowledgement.` |
| Wikipedia | `Goal lists adapted from Wikipedia ("List of senior career goals by Cristiano Ronaldo", etc.), CC BY-SA 4.0`, with links to the articles. Any published data file derived from it must also be CC BY-SA. |
| StatsBomb | `Data: StatsBomb` + logo, and only for published analysis. The agreement does not let the data ship in a public ledger. |
| American Soccer Analysis | `Data: American Soccer Analysis`, only after asking. |

**The chain, stated plainly:**
- **transfermarkt-datasets.** CC0 covers only the compiler's (dcaribou's) own contribution. The rows are Transfermarkt's, and Transfermarkt's terms forbid scraping. Transfermarkt now actively blocks the scraper, and the only fix on offer is a paid anti-bot service. Publishing that data means publishing data whose owner has said no, both on paper and technically.
- **ESPN / sportsdataverse (Drew's current WNBA precedent).** The same paper problem: Disney's terms bar automated extraction and non-personal use [V]. But ESPN serves the JSON openly to its own apps, without bot walls, and a CC BY community project (sportsdataverse) has published these pulls for years without challenge. For soccer there is no sportsdataverse in between. Drew would be the one running the pull, a step closer to the line than consuming someone else's release.
- **StatsBomb.** The cleanest provenance (they own it), but the most restrictive terms for a ledger. Redistribution is barred, and commercial exploitation of any derived analysis is barred too, which a Ko-fi link arguably touches.
- **ASA.** The provenance is unclear (no data license), and it only covers MLS/NWSL. It's not cleaner than ESPN, only smaller, and ASA is a reachable community org you could ask.
- **Ranking by defensibility:** Wikipedia CC BY-SA (actually licensed) > RSSSF (explicit copy permission) > martj42 CC0 (compiled from public reports) > ESPN (existing precedent, terms say no, no active blocking) > transfermarkt-datasets (terms say no, owner actively blocks) > StatsBomb for a ledger (licensor explicitly forbids redistribution).
- The facts themselves (who played, who scored) aren't copyrightable in the US. In the EU, database right covers substantial extraction from Transfermarkt (Germany) and UEFA [R]. Publishing only derived aggregates (cumulative curves) rather than raw rows reduces the exposure under every source.

## Q6. Hand-researched star goal logs

- **Ronaldo**: "List of senior career goals by Cristiano Ronaldo" exists (187 KB article) [V]. ~981 rows: No., Date, Venue, Team, Opponent, Score, Result, Competition. No Ref column [V via agent]. "List of international goals scored by Cristiano Ronaldo" also exists.
- **Messi**: "List of international goals scored by Lionel Messi" (126 goals, with cap numbers) [V]. "List of career achievements by Lionel Messi" (418 KB) is honours, records and hat-tricks, **not a per-match club goal log** [V]. No club-goal list exists.
- **Haaland, Mbappé**: international goal lists only [V].
- Hat-trick lists (UCL, LaLiga, EPL) add star rows but nothing complete.
- messivsronaldo.app: "© 2026 Messi vs Ronaldo", no reuse terms. It cites WhoScored, SofaScore and FotMob [V]. Contact hi@messivsronaldo.app; treat it as all rights reserved. messivsronaldo.net is the same.
- Kaggle azminetoushikwasi Messi/CR7 per-goal sets: unclear license, source unstated, stale since 2023-09.

**Verdict:** a CC BY-SA Wikipedia per-goal spine is viable only for date-based goal milestones ("fastest to 50 UCL goals by date or by age") and only for players with a club-goal list, which today means Ronaldo plus international goals for everyone. It cannot produce "through N games" because it has no appearances, minutes, starts or assists. Building club goal logs for ~50 stars by hand from match reports is a receipts-research project of thousands of rows. Even then the denominator (appearances) would come from ESPN. ESPN therefore has to be in the stack anyway for 2002+, and Wikipedia/RSSSF serve as receipts and as the pre-2002 extension for a handful of legends.

## Open decisions for Drew
1. Accept ESPN as the upstream (same posture as the WNBA site, but self-compiled), or don't build big-5 at all.
2. Ask Sportmonks in writing whether public derived JSON on GitHub Pages is allowed (Growth €99/mo + history add-on), as the licensed alternative.
3. Ask RSSSF and ASA for dataset permission if internationals or MLS/NWSL matter.
4. Run the ESPN gate (per-player-season goals vs transfermarkt 2012-2026 and vs Wikipedia for Ronaldo/Messi) before committing, since the coverage map above is a 3-matches-per-season sample.
