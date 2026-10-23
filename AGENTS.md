# AGENTS.md: football comparator

The running list of data surprises. Add to it whenever a gate or a reader's correction teaches us one. Decisions and their evidence live in `research/` (start with `research/README.md`, then `research/beachhead.md` and `research/internationals.md`).

## Ground rules

- This repo is public (DrewHoo/football-comparator, created 2026-10-22). `data/raw/`, `data/index/` and `data/ledger/` are gitignored and live in the private store DrewHoo/football-comparator-data (pipeline/sync-data.mjs), mirrored to the private R2 bucket `football-comparator-data` (pipeline/r2-sync.mjs; pipeline/docs/data-store.md). Stage with an explicit file list, never `git add -A`. Don't commit or push without Drew's go.
- The sport is "football" in every file name and page word.
- Every ESPN request goes through `research/espn/espn.mjs` (one per 1.5 s, disk cache, backoff). Every Wayback request goes through `research/wayback/wb.mjs` (one per 2 s, cross-process lock). Every RSSSF request goes through `pipeline/lib/rsssf.mjs`. Every Wikidata request (query.wikidata.org, Special:EntityData) goes through `pipeline/lib/wikidata.mjs` (1 per s, cache, splits a VALUES batch on a 60 s timeout). One process per host at a time. Never call `fetch` directly.
- Nothing StatsBomb-derived ships in the public repo or in the JSON the page downloads. StatsBomb's Messi La Liga set is a test gate, fetched into the private store.
- Incident, 2026-10-21: a research agent fetched all 4,697 RSSSF logs at about 13 requests per second with no throttle, against its brief. The pages were imported into the cache (30 throttled refetches were byte-identical) rather than re-downloaded. Any agent that fetches must be given the helper by path and told the budget, and its request log checked afterwards. "Research" is not a licence to crawl.

## How raw data is stored

- Every host's cache stores the full response body verbatim, never a parsed subset. An ESPN summary is the whole 130-315 KB object (boxscore, rosters with every flag, keyEvents, header, gameInfo, standings); we parse perhaps a tenth of it. Re-deriving anything is a local operation; nothing needs refetching.
- ESPN files are keyed by sha1(url) and hold only the body, so `data/raw/espn/manifest.jsonl` (sha1, url, status, bytes, fetchedAt) is what makes them findable without the index. `research/espn/espn.mjs` appends to it on every fetch since 2026-10-21 22:40Z; the harvester started at 21:57Z with the old module loaded, so after it finishes run `node pipeline/backfill-espn-manifest.mjs` (it recovers the URL from the body and proves it by sha1; every summary and year scoreboard resolves, only one-off probe requests don't).
- Wayback, RSSSF and Wikidata caches carry a sidecar per entry with the url, status, final URL, charset, bytes and fetch time; Wikidata also stores the query text. These are self-describing.
- Derived indexes (`data/index/`) and ledgers (`data/ledger/`) are rebuildable from the caches in about a minute. The caches are the asset; the rest is code.
- Size: about 240 KB per ESPN summary, so the full club harvest is roughly 12 GB raw (gzips about 10×). It goes to the private data store, not git.

## What the sport counts (from the discourse, 2026-10-21)

- Career goals = every official first-team club match plus senior "A" internationals including international friendlies. Excludes club friendlies, reserve/B teams and youth caps. That basis gives Ronaldo 981 and Messi 936 (Oct 2026), the Opta/ESPN/messivsronaldo.app numbers.
- The unit is appearances and age, never starts. "Fastest to M" counts appearances in that competition only. UCL figures exclude qualifiers.
- A club's league is a property of the season (promotion and relegation). "Premier League" records start 1992-93; "English top flight" records start 1888-89 and often name different holders.
- 23 of 35 viral factoids are scoped to one domestic league (17 Premier League only). Default a board to one league.
- Ronaldo's total swings by 6 (Arab Club Champions Cup, not FIFA-recognised) and by 18 (RSSSF adds youth internationals). Pelé's swings by about 500 (friendlies).

## ESPN site API (the club spine)

- `scoreboard?dates=YYYY&limit=1000` returns a whole calendar year; a league-season is 2 requests. `dates=YYYYMMDD-YYYYMMDD` is HTTP 400. `limit=200` silently truncates.
- Assign the season by match date (July to June), never by ESPN's `season.slug`: Bundesliga 2010-11 is filed under `group-stage`, Ligue 1 2002-03 as `20032003-french-ligue-1`, and EPL 2009-10 exists twice (357 legacy matches under the right slug plus the 23 Burnley fixtures under the 2013-14 slug with ~270k ids; merge them).
- Keep `STATUS_FULL_TIME`, `STATUS_FINAL_AET`, `STATUS_FINAL_ABANDONED`. EPL 2005-06 has 115 ghost "postponed" rows for matches that were also played; status filtering removes them. Serie A 2004-05 includes the Parma v Bologna relegation playoff (183904, 183905); exclude.
- 2000-01 has no rosters in any league. 2001-02 lacks starter flags in 14-29% of matches. Hence 2002-03.
- Rosters list the unused bench in every season (16 in the EPL to 2007-08, 18 elsewhere).
- Lineup repairs, in order: dedupe roster entries by athlete id (La Liga and Serie A list subs twice from 2007-08); a starter is `starter && !subbedIn`; where stats exist a starter must have `APP = 1` (drops bench players flagged as starters and 12th starters).
- Goals: count keyEvents with `scoringPlay`, excluding `own-goal` (its `team` is the beneficiary and `participants[0]` is the defender). Never count by type name: `penalty---scored` typing is absent for whole seasons (EPL 2002-03, 2009-10). Reconcile keyEvent goals to the final score; when they exceed it, events are duplicated (Sevilla v Barcelona 2006-10-15 lists Messi's goal at 80' and 81'). stats `G` is sometimes 0 against a real goal (Totti, two matches 2006-07), so keyEvents win on goals.
- Dedupe substitution events by the (in, out) pair. Minutes from sub clocks, capped at 90 (Messi 2008-09: 2,517 vs BDFutbol 2,516).
- Check keyEvent team ids against the header competitors (one re-ingested EPL match returned Rangers v Hearts events).
- Collapsed rosters (every entry one athlete) hit 7-29% of Serie A 2001-08 and two UCL Barcelona-Udinese matches (188764, 188837). KeyEvents in those matches are fine. Repair from the athlete-scoped store (below).
- Assists: stats `A` only; the keyEvent assister appears from 2011-12. Floors: EPL 2005-06 (stats from 2001-02 but `A` undercounts until then), La Liga 2005-06, Bundesliga 2006-07, Ligue 1 2007-08, Serie A 2008-09, UCL 2006-07. EPL 2011-12 stat arrays are half missing.
- Athlete ids never rename but often split: 185 name-plus-club pairs carry two or more ids (a re-ingest around 2006; second ids in the 50-100k range). 389 display names are real homonyms. Key on id plus a merge table, never on name. Messi is 45843 (2004-14 checked), Ronaldo 22774 (2003-11), Henry 8039, Totti 10293.
- Ronaldo 2003-04 is one appearance short in ESPN; one of five Man Utd rosters silently omits him and nothing in the summary can tell which. Corrections layer.
- No cup matches hide under league slugs. Relegation playoffs do (Bundesliga under its own slug, Serie A 2004-05 inside the league slug).

## ESPN core and athlete-scoped APIs

- `sports.core.api.espn.com/.../competitors/{team}/roster` is a mirror of the site summary, not a second source. Don't spend requests on it.
- `leagues/all/seasons/{Y}/athletes/{id}/eventlog?limit=300` lists every match a player was in a squad for from 2001 (club, country, youth, friendlies). Its `played` flag counts squad listings, not appearances. The per-event record `.../competitors/{t}/roster/{athlete}/statistics/0` has appearances, starts, subIns, minutes, goals, assists, dnp and is right where the match summary is corrupt or empty. Season totals at `leagues/{L}/seasons/{Y}/types/1/athletes/{id}/statistics/1` match Wikipedia in 15 of 21 checks, within 1 app otherwise.
- The athlete store has holes: nothing before 2001; friendlies whose match has no roster; Messi's whole 2007 (Copa América and friendlies); some cups missing from the statisticslog index.
- The web gamelog (`site.web.api.espn.com/apis/common/v3/.../athletes/{id}/gamelog`) has no minutes and returns 0 rows for some old seasons. Use the core eventlog.
- 220 slugs, same as the site dropdown. Hidden slugs that resolve: `fifa.confederations` 4006, `global.champs_cup` 8307, `club.friendly` 19834, `uefa.uefa` (old UEFA Cup). `fifa.friendly` (2001-26) is the only friendly slug. Confederation WC qualifier slugs start with the 2006 campaign (played 2004-05). `uefa.euroq` seasons are named by the finals year (2004 = the 2002-03 campaign).

## Transfermarkt cross-check (CC0 compilation, 2012-07 to 2026-06)

- Transfermarkt minutes are capped at 90 and exclude stoppage; its substitution clock runs one minute earlier than ESPN's. A sub on at 90+ is ESPN 0', TM 1'. Tolerance: minutes within max(5, 3 × apps) per player-season; apps and goals exact; assists 1 + floor(max/10).
- Transfermarkt's own season column is right; the COVID restart games of July-August 2020 belong to 2019-20, as ESPN's index files them.
- TM's Champions League rows are partial for clubs whose domestic league TM didn't track that season; a side needs at least 9 TM rows to count as covered. game_lineups starts 2013-07, so 2012-13 has no TM lineups.
- Every club-season in the six competitions maps by name or fixture shape (Espanyol and Lokomotiv, in Cyrillic, needed the fixture tie-break). Two ESPN id splits surfaced through the player map (Romaric, Mavuba) and belong on the merge review.

## Champions League

- Nothing before 2001-02. 2001-02 early group stage lacks starter flags; 2002-03 is the first clean season. Stats arrays from the 2004-05 knockouts, every match from 2005-06; assists usable from 2006-07.
- Qualifiers are flaggable in every season: `season.slug` is `qualifying-{first,second,third}-round`, `play-off-round` (2009-12) or `playoff-round` (2013-); match with `/qualif|play-?off/i`. From 2020-21 qualifiers live under `uefa.champions_qual`. Qualifier rosters are patchy (empty in 2009-12 Q3), which doesn't matter since they're excluded from the board.
- `uefa.champions/teams/{id}/schedule?season=YYYY` returns a club's whole UCL season in one call.
- The 2006 final (197123) is a 20-man squad list flagged as starters, with the injured Messi among them. Where stats exist, an appearance is `APP ≥ 1`, not `starter`.
- Barcelona 2-3 Shakhtar 2008-09 (254722) lists every goal event twice.
- Round names drift (`quarter-finals` vs `quarterfinals`). Regex, never equality.

## Internationals

- ESPN: World Cups from 1998 (Euro 2000 missing entirely), Euros from 2004, UEFA qualifiers from the Euro 2004 campaign, CONMEBOL from 2008. No 2002 World Cup qualifiers anywhere, under any slug. Friendlies about half rostered 2001-11, 78% from 2014. Two empty World Cup summaries for Argentina (2010 QF, 2014 SF); the athlete store has Messi's minutes.
- RSSSF has 4,697 cap-by-cap player logs (not only 100-cap players), 50 of 52 marquee players, lagging 1-5 caps for active players. Only Vardy and Lacazette lack a log: Luis Suárez's is `bijtertje-intlg.html` (143 caps, 69 goals, rows = stated total), and `lsuarez-intlg` is Spain's 1960s Luis Suárez. Look up a log by country and name, never by slug. Terms: a standing grant to copy with acknowledgement. Decision 2026-10-22: credit RSSSF in Method and footer and link every international row to its source page (naming the page's author where one is named); no permission email.
- martj42 `goalscorers.csv` (CC0) has zero friendly goals and no AFCON/Asian Cup/CONCACAF Nations League qualifier goals: Ronaldo 124 of 146, Messi 71 of 126. `results.csv` matches Wikipedia's results pages exactly for Portugal and England.
- Wikidata (CC0) has P710 lineups for 1,187 of 1,192 competitive matches of the 22 UEFA teams 1998-2008, almost no friendlies, and only 18 of 53 for Argentina.
- Wikidata, full pull 2026-10-21 (`pipeline/docs/wikidata.md`): 6,790 senior match items 1990-2026, 6,728 join martj42. It's a UEFA layer: 325 of 326 UEFA-zone archive qualifiers found, 2 of 223 from other confederations; friendlies 2% except France (every match from 1991). P710 lists starters and used subs together with no start/sub flag; P793 substitution events exist for only 660 matches. Goal minutes (P1363 + P1390) are minutes into the period: second half +24 is 69', +48 is 90+3. The Euro 2000 play-offs are missing. The 2002 WC semi-final Brazil 1-0 Turkey is wrong (Q115495755).
- The Wikidata gate catches FIFA's Munich error from the lineup side too: FIFA's #4 is "MURPHY Danny", Wikidata's #4 is Gerrard.
- Wayback: FIFA.com's deleted qualifier reports are archived for the complete 1998, 2002, 2006 and 2010 cycles (643/777/847/853). 1998's substitution data is incomplete at source; 2020 extensionless captures of 2010 pages fail to parse, the 2011-12 `.html` captures work. UEFA's history pages hold all 259 Euro 2000 matches. UEFA's 2004-09 live-era pages (WC 2006/2010 qualifiers) never had lineups. Euro 2004 qualifier pages: pick a capture dated after the match, the first is often pre-match. ESPN's JSON API was never archived; archived Soccernet pages are ESPN's own database and 98% missing for 2004-06.
- FIFA's own report credits Danny Murphy with Gerrard's 45' goal in Germany 1-5 England (2001-09-01); BBC's minute-by-minute proves it. It's the whole #4 line, not just the goal: FIFA has Murphy starting and off at 78', which is Gerrard's match (correction `intl-0001` in `data/corrections/intl.json`). Two-source gating is mandatory.
- ESPN summary dates are the UTC kickoff: evening matches in the Americas land a day after martj42 (23 of 339 joined summaries). FIFA and martj42 disagree on 8 dates in the archive so far, up to 3 days (Costa Rica 3-0 Trinidad: FIFA 2001-03-28, martj42 2001-03-25); join on the teams and the score inside the campaign when the date is off by more than 2.
- ESPN friendly summaries can list only the scorers (1-2 roster entries per side): Hungary 1-2 Argentina, 2005-08-17 (184000), Messi's debut, and its cached core roster are like that, so his 64'-65' red-card debut minutes aren't in the cache.
- RSSSF writes the Dutch ĳ ligature (U+0133) in names ("van Hooĳdonk"). NFD leaves it alone and NFKD splits it, so fold names with NFKD.
- Name forms across RSSSF, FIFA, UEFA, ESPN and martj42 differ by transliteration (Husyn / GUSIN, Seok-Joo / Seok-ju), nickname (Tostão = Eduardo Gonçalves de Andrade; FIFA's "Jay Jay OKOCHA"), order and truncation. Identity is only safe within one team-match (`pipeline/docs/intl.md` §Identity).
- 11v11 (the only archived friendly source before 2012) misidentified a goalkeeper in 2 of 7 pages and drifts sub minutes by 1-4. Every row needs a second source.
- Brief errors we made: "Portugal v Kazakhstan 2004-08-18" was 2003-08-20 (Ronaldo's debut); "England v Germany 2001-09-01" was Germany 1-5 England in Munich.
- UEFA history pages mark own goals only by the icon file name, not in the text; a text parser credits them to the scorer's team (all 8 Euro 2000 goal-gate failures).
- Later Wayback captures of the same UEFA page can silently drop starters or goals (Romania 7-0 Liechtenstein's 2011 capture omits Popescu's 18' goal; the 2019 one has it). Rank captures by the lineup gates, don't take the latest.
- FIFA archive pages sometimes carry a stray third lineup block (a club side, another nation); keep only the two teams the header names. FIFA 1998 lists replacements as "UNKNOWN" and some players twice under two name forms.
- Awarded or abandoned matches (Singapore v Palestine 2010, Georgia v Russia 2003 at "20:00" read as a 20-0 score) carry `void` and sit out the gates.
- RSSSF's running-goals column is hand-kept and slips: it gets bumped a row early (the next row then carries the goal with no rise), it repeats, and it restarts mid-page. Never derive per-match goals from it when the log has a match-goals column. The column wins, and the running total is a check (`cumulative_mismatch`). Deriving gave Mbappé 2 v Gibraltar 2023 for the page's 1. A blank goals cell is 0 only in a log that has a goals column. Which cell is blank is read from the token's column position, not its value.
- Villa v Latvia, 2007-06-02 (Latvia 0-2 Spain): Villa scored on 45'. UEFA's own events page, lineups page and match report (Wayback, `round=2241/match=83726`, captured 4-14 June 2007) all credit him. RSSSF's Villa log, Wikipedia's list of Villa's goals and Wikidata are all short, so a "three sources against two" vote would have got it wrong. Settle a scorer dispute with the contemporary match report, never by count (`intl-0048`). Euro 2008 qualifier ids: the round index `competitions/euro/fixturesresults/round=2241/` (capture 20071124073445) lists every match with its id; read the row, not the nearest `match=` link (Iceland v Liechtenstein, 83727, sits next to Latvia v Spain, 83726).
- martj42 name forms: Tadjikistan, Yemen Republic, Guam Island needed mapping; matches whose dates differ by more than 2 days (Cuba v Haiti, 13 days) join on teams and score with `date_conflict`. martj42 lacks Chinese Taipei 0-0 Malaysia 1997-03-27 and the annulled Guinea 2002 and Ethiopia 2008 results.

## Publishers' numbers (for gates and Method)

- Haaland fastest to 100 PL goals in 111 apps (Shearer 124; Kane 141, never the holder). Haaland fastest to 50 UCL goals in 49 (Van Nistelrooy 62). UEFA's "most UCL goals in first N games" table: Haaland leads at every N from 10 to 60.
- Ronaldo 140 UCL goals excluding qualifiers, 141 including (UEFA publishes both). Second man to 100 international goals (Ali Daei first).
- Messi 474 La Liga goals in 520 (Guinness); 91 in 2012 competitive only (5 friendly goals excluded).
- Transfermarkt showed Ronaldo 961 vs ESPN 967 in April 2026 (Arab Club Champions Cup). RSSSF 994 = 976 senior + 18 youth. No Guinness page exists for Ronaldo's 900.
- Derby 11 points (2007-08), Sheffield United 104 conceded (2023-24), Wolves 18-game winless start (2025-26), Arsenal 49 unbeaten, City 100 points. 1992-95 were 42-game seasons; publishers say so.

## Full-scope build (2026-10-22, after the 20-hour harvest)

- Penalty typing is judged by share, not presence. Penalties are 6-10% of goals in a typed season. EPL 2002-03 has 11 typed in 963 goals (1.1%), so it's untyped in all but a handful of matches; under 3% the season's pens are null. 3-5% is `penalty-typing-partial` (La Liga and Bundesliga 2004-05, UCL 2002-07): kept, flagged. Seasons under 300 goals (the running season) aren't judged. EPL 2009-10, "untyped" in the probe sample, is fully typed (8.5%).
- Zero starters on a side is two defects. All listed players flagged as subs on (the stuck La Liga round of 2023-02-11, 20-23 a side) is a hollow summary: `roster-invalid`, rows withheld (218 phantom rows). Only the 1-5 subs who came on listed (66 sides, 2002-11) means the starting XI is missing: `roster-starters-missing`, sub rows kept. Both go to the athlete-store fill.
- The id-merge veto must hold for groups, not pairs: merging is transitive, and Jorge López (12194, Zaragoza) reached Pedro López (103012, Valladolid) through a third id although both started match 275895. Strongest merges go first and a merge that would put two ids from one match in a group is refused (7 at full scope). The builder now throws if a canonical player has two rows in one match.
- One ESPN id on both sides of a match is a misidentification: Inter's goalkeeper Júlio César (#12) carries Reggina's Julio César De León's id in 205790 and 224342. Keep the row with the club he plays for that season; drop the other (`athlete-id-both-sides`, 4 rows).
- ESPN writes A = -1 in a few stat arrays (3 rows): null, `stat-negative`.
- Full-scope ledger: 48,994 matches, 1,366,150 player rows, 899 ids merged. With the athlete-store fill (2026-10-23): +4,421 rows on 332 withheld sides = 1,370,571. Compact files 0.9-1.2 MB gzipped per league; every row round-trips.
- Transfermarkt at scale (47,316 player-seasons, 2012-26): apps 98.6% exact, goals 99.7%, assists 97.5% within tolerance, minutes 99.4%. Short by a whole match: ESPN 558 player-seasons, Transfermarkt 788 (it has whole seasons missing for Benzema 2020-21, Müller 2014-15, Bacca 2014-15). Goal credited to a different player: 99.
- A gate cut at an old `as_of` reads a stale runner-up: `ronaldo-140-ucl` at 2022-06-30 gave Messi 125 for UEFA's 129 (his four 2022-23 goals came later). Cut gates at the claim date, again.
- The athlete store answers a per-event stat record under either competitor's URL. The record's own `$ref` (`competitors/{team}/roster/...`) names the real side: Nakata in Bologna v Parma 2003-08-31 (118600) came back for both clubs and was Parma's. Place a row by the `$ref`, never by the URL asked (3 rows moved).
- In an athlete-store record, a clock of 0 means not recorded; `subIns`/`subOuts` are still right. Its `minutes` includes stoppage (Juarez on 33' at Udinese, 188764: record 61, clocks 57) and is missing for whole Serie A seasons (2002-03, 2006-08). Take clocks from the keyEvents first and minutes from the clocks. Internationals need the AET flag, or WC 2010 final and 2014 SF subs cap at 90.
- The store mirrors the summary's holes; it doesn't repair them. All 66 `roster-starters-missing` sides have records only for the same 1-5 subs, and none for the starters. Every candidate's record is a 404 for La Liga 2004-05's 20 empty sides and for team 3747's twelve 2011-12 matches (420595-420607). Messi's record in 184000 (his debut) is a 404, confirmed live on 2026-10-23 under both competitors, so his debut minutes come from 11v11 and Clarín via correction `intl-0050`.
- Where the summary has the rows, the store agrees: Vardy's and Lacazette's 855 rows in the six competitions match the summary on starts and goals 855/855, and on minutes within 2 for 851.
- The eventlog isn't a whole career. Vardy's lists 24 of his 26 caps; the 2 missing (and 2 of his 7 goals) are most likely the March 2016 friendlies. Lacazette's lacks his first two caps (2013-06-05 Uruguay, 2013-06-09 Brazil), which Wikidata has, so the two sources together make 16 of 16.
- ESPN's core athlete record for an old id is sometimes a younger namesake's: Djibril Sidibé (30302) carries the 1992-born Frenchman's DOB, Fernando Torres (24257) is a Colombian born 2004, Luis Enrique (Barcelona 2002-04, ESPN "Luis Martínez", 12912) is a Mexican born 1987, and Keith Andrews (5358) is born 1908. 269 ledger players fail the rule "15-45 at the first ledger row, under 50 at the last" (`dob-implausible`, `data/ledger/compact/anomalies.jsonl`); nationality and position go with the DOB.
  - Wikidata's name joins (name+nationality+dob) found the same namesake, so only its exact ESPN-id join (P3681) may replace a DOB (4 players).
  - A DOB that passes can still be wrong: 12912's 1987 made him La Liga's youngest scorer at 15y 125d, ahead of Yamal. The `yamal-youngest-laliga-scorer` rank check caught it; `data/corrections/athletes.json` `ath-0001` fixes it from Wikidata Q222789 and his RSSSF log (caps from 1991).
  - Name + nationality joins to Wikidata disagree with ESPN by more than a year for 170 of 6,784 players (`data/ledger/compact/dob-disagreements.csv`). One-word names (Alemão, William) join retired namesakes, so treat the list as leads, never as corrections.
- One id can hold two people's rows: Bruno Fernandes (124091) has Wikidata P3681 agreeing on 1994-09-08, but the id's first ledger row is 2009-09-29. The early rows are another player's.

## Team ledger and compact files (2026-10-21)

- The index scores every match, cached or not, so team tables are full-scope before the summary harvest ends (`pipeline/build-teams.mjs`; `pipeline/docs/compact.md`). All 15 non-final status rows in `matches.jsonl` are played matches with `stuck: true` (La Liga's 2023-02-11 round is still `STATUS_SCHEDULED` with real scores). Count them; don't filter on status.
- Positions exist only after matchdays where every team has played the same number: about 57% of PL team-match rows have none, because postponements leave rounds uneven.
- "Earliest relegation by date" has to compare month and day within the season, not days since 1 July: 29 Mar 2008 and 30 Mar 2019 are both day 272 (leap year), and COVID put 2019-20's relegations in July 2020.
- A gate's `as_of` must be the claim date for a live run: Leicester's 8 home defeats without scoring became 9 on 2025-04-20, so `as_of` 2025-06-30 reads 9 (GA 22). Cut at 2025-04-19, it reads 8 (GA 21) exactly.
