# ESPN core and web APIs: do they fill the site-API holes?

Probe run 2026-10-21. **930 uncached requests** (budget 1,200), all through `research/espn/espn.mjs` at `ESPN_GAP_MS=1500`, one process at a time, 0 backoff retries. `espn.mjs` now exports `getUrl(absoluteUrl)`, which shares the throttle chain and disk cache with `get()`; `get()` is now a one-line wrapper, and every existing export still works. Scripts are `research/espn/core-*.mjs`; raw outputs are `core-*.json` and `core-*.log` beside them. Wikipedia known answers come from the raw wikitext of the live articles, fetched 2026-10-21.

## Summary

1. **The core match roster (`competitions/{id}/competitors/{team}/roster`) is a mirror of the site summary, not a second source.** In all 38 broken matches tested it reproduced the defect exactly: collapsed Serie A rosters, collapsed Barca-Udinese, empty WC 2010/2014 summaries, scorer-only friendlies and qualifiers.
2. **The athlete-scoped store is a second source, and it fills the corrupt-match holes.** `leagues/all/seasons/{Y}/athletes/{id}/eventlog` lists every match a player was in a squad for, across club, country, youth and friendlies. Each listed match has a per-event stats record (`.../roster/{athlete}/statistics/0`) with appearances, starts, subIns, minutes, goals, assists and dnp. That record gives the right line for Messi in Barca-Udinese 188764 (start, 70 min), Messi WC 2010 QF (90 min) and 2014 SF (120 min), and Totti in Bologna v Roma 131335 (90 min, 1 goal).
3. **The "23 EPL 2009-10 matches with no lineup" are not missing.** They are all Burnley fixtures, filed under the 2013-14 season slug with legacy ids (~270k). Their site summaries have full rosters: 18 distinct players and 11 starters per side, with plays from the right teams. Merge them with the 357 legacy matches and EPL 2009-10 is complete.
4. **Season-total records** (`leagues/{L}/seasons/{Y}/types/1/athletes/{id}/statistics/1`, one request per player-league-season) match Wikipedia apps and goals exactly in 15 of 21 checks and within 1 app in the other 6. They give Messi's 2010 and 2014 World Cups right (5 and 7 apps) even though the match summaries are empty.
5. **eventlog `played` and the web gamelog both count matchday-squad listings, not appearances**: 1 to 4 too many per competition-season. Use per-event `appearances`/`dnp` or the season totals.
6. **The web gamelog** (`site.web.api.espn.com/apis/common/v3/.../athletes/{id}/gamelog?season=&team=&league=`) needs one call per season, team and competition. It has per-match G and A but no minutes, and returns 0 rows for some old seasons (Henry EPL 2003-04, Totti Serie A 2003-04 and 2006-07). The core eventlog is the better spine.
7. **The athlete store has its own holes**:
   - **Not at all:** nothing before 2001 (Henry's France 1999-2001 and Totti's Italy 1998-2000 are absent).
   - **Squad-listed but no stat record:** friendlies whose match has no roster (Ronaldo 2004: 2 of 5), and Messi's whole 2007 (Copa América and friendlies) even though the Copa site summaries list him.
   - **Missing from the statisticslog index:** some cups (Messi Copa del Rey 2005-06; Henry and Ronaldo UCL before 2007, though the eventlog has the matches).
8. **National-team schedules enumerate a year completely** for Portugal 2004, 2006 and 2008 and for Argentina 2005 (all Wikipedia matches found). Argentina 2007 found 12 of 16; the four Oct-Nov 2007 qualifiers were not found. Rosters exist for tournaments and UEFA qualifiers, and for 9 of 14 Portugal friendlies but only 3 of 11 Argentina friendlies. 4 of 7 CONMEBOL 2005 qualifiers and 13 of 49 matches overall have no roster from either the site or the core endpoint.
9. **The leagues endpoint lists 220 slugs, the same as the site dropdown.** It reveals no better friendly or qualifier slug. Hidden historic slugs exist and resolve: `fifa.confederations` 4006, `global.champs_cup` 8307, `global.world_football_challenge` 8203, `club.friendly` 19834, and a bare `fifa.worldq` (no id). The confederation WC qualifier slugs start with season 2006, the campaign played in 2004-05.
10. **No old internationals hide under an unexpected slug.** 2004-10-13 sits under the expected qualifier slugs (21 UEFA, 6 CONCACAF, 3 CONMEBOL). On 2001-09-01 (Germany 1-5 England and others) every international slug, including the hidden ones, is empty: ESPN has no 2002 World Cup qualifiers.

## Endpoints verified

| Endpoint | Exists | Notes |
|---|---|---|
| core `leagues?limit=1000` | yes | 220 `$ref`s; ids/names via the site dropdown (same 220) |
| core `leagues/{slug}/seasons` | yes | eng.1: 26 seasons |
| core `leagues/{slug}/events/{id}/competitions/{id}` | yes | `lineupAvailable`, attendance |
| core `.../competitors/{team}/roster` | yes | entries: playerId, starter, subbedIn/Out.didSub, jersey, formation. **Same data as the site summary** |
| core `.../plays?limit=400` | yes | 103 items on 269969; participants are athlete refs. Exists where the roster collapsed (131335: 12 plays, 10 with participants; 188764: 108), but is **empty** where the summary is empty (264119, 383241) |
| core `.../details` | **404** | |
| core `.../seasons/{y}/types/1/events?limit=1000` | yes | fifa.friendly 2004: 187 events |
| core `leagues/all/seasons/{y}/teams/{t}/events` | yes | Portugal 2004: 11 (friendlies and Euro only; qualifiers are filed under the campaign season) |
| core `athletes/{id}/statisticslog` | yes | one entry per league-season with total and team stat refs. Ronaldo: 130 entries, 2003-2026 |
| core `leagues/all/seasons/{y}/athletes/{id}/eventlog?limit=300` | yes | all competitions, with teamId, `played`, a stats ref and a lineupEntry ref. A bare `athletes/{id}/eventlog?season=` ignores the season and redirects to the current one |
| core `.../competitors/{t}/roster/{athlete}/statistics/0` | yes | per-match appearances, starts, subIns, minutes, timeStarted/Ended, goals, assists, dnp |
| core `leagues/{L}/seasons/{y}/types/1/athletes/{id}/statistics/1` | yes | season totals, same keys |
| web `common/v3/.../athletes/{id}/gamelog?season=&team=&league=` | yes | without team and league it defaults to the current club and league, with 5 seasons of options. Per-match G, A, shots, cards; no minutes |
| web `.../athletes/{id}/stats`, `/bio`, `/overview`, `/athletes/{id}` | yes | bio `teamHistory` gives club/country spans (Portugal "2003-2006, 2007-2008, ..."); overview gives the last 5 matches |
| site-web `apis/site/v2/.../{slug}/teams/{id}/schedule?season=Y` | yes | honours `season` per competition slug; `all/...` ignores `season` |

## Slug list (international and hidden)

From `leagues/dropdown` (identical to the core 220), non-women international slugs, `slug id`:

`fifa.world 606`, `fifa.friendly 3922`, `fifa.worldq.uefa 786`, `fifa.worldq.conmebol 787`, `fifa.worldq.concacaf 788`, `fifa.worldq.afc 789`, `fifa.worldq.caf 790`, `fifa.worldq.ofc 792`, `fifa.wcq.ply 23449`, `uefa.euro 781`, `uefa.euroq 3947`, `uefa.nations 2395`, `conmebol.america 780`, `caf.nations 3908`, `caf.nations_qual 8315`, `concacaf.gold 4004`, `concacaf.gold_qual 19778`, `concacaf.nations.league 19267`, `concacaf.confederations_playoff 8360`, `afc.asian.cup 20219`, `afc.cupq 5662`, `fifa.olympics 3924`, `fifa.world.u20 5694`, `fifa.world.u17 5697`, `uefa.euro_u21 5693`, `uefa.euro_u21_qual 20114`, `uefa.euro.u19 5698`, `fifa.friendly_u21 20132`, `global.finalissima 20704`, `fifa.conmebol.olympicsq 19727`, `fifa.concacaf.olympicsq 19831`, `caf.championship 8365`, `caf.cosafa 20220`, `afc.saff.championship 18914`, `global.gulf_cup 23107`, `concacaf.central.american.cup 22947`, `concacaf.u23 3911`, plus club continentals (`uefa.champions 775`, `uefa.champions_qual 19874`, `uefa.europa 776`, `uefa.super_cup 5462`, `fifa.cwc 5501`, ...).

**Hidden (not in the 220, found in athlete statisticslogs, resolve in core):** `fifa.confederations 4006`, `global.champs_cup 8307`, `global.world_football_challenge 8203`, `club.friendly 19834`, `fifa.worldq` (resolves with no id). Also seen in eventlogs: `uefa.uefa` (pre-2009 UEFA Cup), `eng.charity`, `esp.joan_gamper`, `jpn.world_challenge`. Guesses that 404: `fifa.worldq.playoff`, `fifa.worldq.uefa.playoff`, `uefa.euroq.playoff`, `uefa.euro.qual`, `uefa.euro_qual`, `fifa.friendlies`, `intl.friendly`, `global.friendly`, `fifa.world.qual`, `conmebol.americaq`, `concacaf.goldq`, `caf.nationsq`, `afc.asian`, `afc.asianq`, `afc.asian.cupq`, `fifa.olympicsq`, `fifa.worldq.intercontinental`, `uefa.nations_qual`, `fifa.worldq.uefa.ply`.

Core season ranges: `fifa.friendly` 2001-2026 (26 seasons); `fifa.worldq.uefa` / `.conmebol` / `.caf` 2006-, `.concacaf` / `.afc` 2006-; `uefa.euroq` 2004-2023 (8 campaigns, so the Euro 2004 qualifiers played 2002-03 are season 2004); `conmebol.america` 2001-; `caf.nations` 2004-; `concacaf.gold` 2003-; `fifa.confederations` 2003-2017; `fifa.world` 1930-2026.

## Q1. Core competitor rosters on the broken matches

"OK" = at least 11 entries, at least 11 distinct ids, at least 10 starters.

| Set | Matches | Site summary OK | Core roster OK | Core differs from site? | Athlete store fills it? |
|---|---|---|---|---|---|
| EPL 2009-10 "no lineup" (all Burnley, ids ~270k under the 2013-14 slug) | 23 | **23** (18 distinct, 11 starters each side; 2 Wigan and Hull sides list 12 "starters") | 23 | no (sub-in counts present in core) | n/a: not a hole |
| Serie A collapsed (14151, 65203, 128110, 131335, 135842, 163133, 166504, 169640, 175377, 224457) | 10 | 0 (1 distinct id of 18) | 0 (1 distinct id, identical) | no | **yes**: Totti 131335 app 1, start, 90 min, 1 goal; plays carry 10 athlete-tagged events |
| UCL Barcelona-Udinese 188764 / 188837 | 2 | 0 | 0 | no | **yes**: Messi 188764 start, 70 min; 188837 dnp. The 2006 final 197123: `played:false` (phantom removed) |
| WC 2010 QF 264119, 2014 SF 383241, 2010 final 264123 | 3 | 0 (empty) | 0 (empty) | no | **yes** for Messi: 264119 90 min, 383241 120 min; plays empty |
| Friendlies 2002-04 without a site roster (10 found in 16 sampled) | 10 | 0 | 0 | no (same scorer-only lists, e.g. 2/2, 1/0) | for players, only if a stat record exists; the Ronaldo 2004 Sweden friendly 150170 returns 404 |
| UEFA qualifiers 2002-08 without a site roster | 3 found in 47 sampled (60630, 152439, 152448) | 0 | 0 | no | not tested per player |

Only 3 of 47 sampled UEFA qualifiers from 2002-08 lacked a roster, so 10 such matches were not available at that density. UEFA qualifiers aren't really a hole.

## Q2. Athlete logs vs Wikipedia

**Range of the eventlog:** Ronaldo 2002- (Sporting UCL qualifiers only in 2002-03), Messi 2004-, Henry 2001- (plus WC 1998), Totti 2001-, Haaland 2017- (nor.1 Molde; Bryne 2016 absent). Seasons before 2001 return null for every player.

**What the eventlog includes:**
- **Club and country, yes:** the same call returns club, national team, club friendlies, super cups and the CWC.
- **Friendlies and qualifiers, yes:** squad-listed in the eventlog, but no stat record where the match had no roster.
- **Youth, partly:** Haaland's U19 (Euro U19 2018, 4) and U20 (WC 2019, 3) appear under separate team ids (19232, 19966). His U15-U18 and U21 matches don't. Messi's 2008 Olympics sit under the senior Argentina id (202). Ronaldo shows no youth matches.

**Season totals (core statistics/1) vs Wikipedia, apps/goals:**

| Player | League-season | ESPN total | Wikipedia | Match |
|---|---|---|---|---|
| Ronaldo | EPL 2003-04 | 28/4 (14 st) | 29/4 | apps -1 (same miss as the site summaries) |
| Ronaldo | EPL 2007-08 | 34/31, 1,854 min | 34/31 | yes |
| Ronaldo | UCL 2007-08 | 11/8 | 11/8 | yes |
| Ronaldo | La Liga 2011-12 | 38/46, 12 A | 38/46 | yes (gamelog says 45) |
| Ronaldo | Euro 2004 | 6/2 | 6/2 | yes |
| Messi | La Liga 2004-05 | 7/1 | 7/1 | yes |
| Messi | La Liga 2005-06 | 17/6 | 17/6 | yes |
| Messi | La Liga 2008-09 | 31/23, 2,516 min | 31/23 (BDFutbol 2,516 min) | yes |
| Messi | WC 2010 | 5/0 | 5/0 | **yes; site summaries give 4** |
| Messi | WC 2014 | 7/4 | 7/4 | **yes; site summaries give 6** |
| Messi | UCL 2005-06 | not in statisticslog | 6/1 | hole (eventlog lists 7 squad, 1 dnp) |
| Henry | EPL 2002-03 | 37/24, 23 A | 37/24 | yes |
| Henry | EPL 2003-04 | 37/30 | 37/30 | yes |
| Henry | La Liga 2008-09 | 30/19 | 29/19 | apps +1 |
| Totti | Serie A 2003-04 | 32/20 | 31/20 | goals now right (site 19); apps +1 |
| Totti | Serie A 2006-07 | 35/26 | 35/26 | yes |
| Totti | Serie A 2010-11 | 33/15 | 32/15 | apps +1 |
| Haaland | Austria 2019-20 | 14/16 | 14/16 | yes |
| Haaland | EPL 2022-23 | 35/36 | 35/36 | yes |
| Haaland | UCL 2022-23 | 11/12 | 11/12 | yes |
| Haaland | EPL 2024-25 | 31/22 | 31/22 | yes |

That's 15 exact, 1 hole, and 5 within one app (Ronaldo -1, Henry +1, Totti +1 twice; Totti 2003-04's goals are right). Minutes are 0 before about 2006 (they come from stat arrays) and exact where present.

**eventlog `played` and gamelog count vs true apps (sample):**

| | eventlog played / listed | gamelog rows | true apps |
|---|---|---|---|
| Ronaldo EPL 2003-04 | 33/39 | 33 | 29 |
| Ronaldo UCL 2007-08 | 12/13 | 12 | 11 |
| Messi La Liga 2005-06 | 18/38 | 18 | 17 |
| Messi UCL 2005-06 | 7/13 | 7 | 6 |
| Haaland EPL 2022-23 | 36/38 | 36 | 35 |
| Haaland FA Cup 2022-23 | 6/6 | 6 | 4 |

**Gamelog goals by competition, three seasons per player:** exact in every competition the gamelog returned, except Ronaldo La Liga 2011-12 (45 against 46). It returned **zero rows** for Henry EPL 2003-04, Henry La Liga 2008-09, Totti Serie A 2003-04 and 2006-07 (eventlog lists 31-37 squad matches), and for Henry's 2002-03 UCL (eventlog 0 of 12 played).

**National team by calendar year:** gamelog rows, which count matchday squads, so this is an upper bound. Format: ESPN apps/goals vs Wikipedia caps/goals.

| Year | Ronaldo | Messi | Henry | Totti | Haaland |
|---|---|---|---|---|---|
| 1998 | | | 4/3 vs 10/3 | 0 vs 3/0 | |
| 1999-2000 | | | 0 vs 14/5 | 0 vs 18/4 | |
| 2001 | | | 0 vs 7/3 | 1/0 vs 6/1 | |
| 2002 | | | 9/3 vs 10/3 | 6/0 = 6/0 | |
| 2003 | 0 vs 2/0 | | 11/9 vs 14/11 | 5/1 = 5/1 | |
| 2004 | 13/7 vs 16/7 | | 14/3 vs 13/3 | 6/2 = 6/2 | |
| 2005 | 9/2 vs 11/2 | 3/0 vs 5/0 | 7/3 vs 6/3 | 5/0 = 5/0 | |
| 2006 | 14/6 = 14/6 | 9/2 vs 7/2 | 17/9 vs 16/8 | 9/1 = 9/1 | |
| 2007 | 9/5 vs 10/5 | **0 vs 14/6** | 4/4 vs 6/5 | | |
| 2008 | 7/1 vs 8/1 | 9/3 vs 8/2 (incl. Olympics) | 8/2 vs 11/4 | | |
| 2009 | 5/0 vs 7/1 | 9/2 vs 10/3 | 9/3 = 9/3 | | |
| 2010 | 11/3 = 11/3 | 7/1 vs 10/2 | 7/0 vs 6/0 | | |
| 2019-2026 | | | | | 2020-22, 2024-25 exact; 2019, 2023, 2026 +1 |

**Verdict on Q2:** a per-player harvest is real and changes the design. The fill comes from the per-event stat records, and the cost is about 1 eventlog call per player-season plus 1 call per match listed. Ronaldo's career is about 1,800 listed matches, so roughly 1,850 requests, 46 minutes at 1.5 s. Per-match harvesting costs the same per match, but the athlete store recovers lines the match store lost (collapsed and empty rosters).

It doesn't replace the match store. Some matches are in the match store but not the athlete store: Messi's 2007 Copa América (6 site rosters list id 45843, yet the eventlog says `played:false` and the stat record is 404). Others are in neither: rosterless friendlies, everything before 2001. National-team careers before about 2008 stay short of Wikipedia by 1-5 caps a year for Ronaldo and Henry, and by a whole year for Messi 2007.

## Q3. National-team seasons: schedule vs Wikipedia

Enumeration: core `leagues/all/seasons/{Y,Y+1}/teams/{t}/events` plus site-web `{slug}/teams/{t}/schedule?season=` per competition. Qualifiers needed the campaign season (WCQ 2006 for 2004-05 matches, euroq 2008 for 2006-07). Roster = the team's own side is OK.

| Team-year | Wikipedia (F/Q/T) | ESPN found | Friendlies: site / core / neither | Qualifiers: site / core / neither | Tournament: site / core |
|---|---|---|---|---|---|
| Portugal 2004 | 16 (5/5/6) | 16 | 2 / 2 / **3** | 5 / 5 / 0 | 6 / 6 |
| Portugal 2006 | 15 (4/4/7) | 15 | 3 / 3 / **1** (Denmark 09-01) | 4 / 4 / 0 | 7 / 7 |
| Portugal 2008 | 13 (5/4/4) | 13 | 4 / 4 / **1** (Brazil 11-19) | 4 / 4 / 0 | 4 / 4 |
| Argentina 2005 | 17 (5/7/5) | 17 | 2 / 2 / **3** | 3 / 3 / **4** (Mar-Jun) | 5 / 5 (11-man starter-only lists) |
| Argentina 2007 | 16 (6/4/6) | 12 of 16 + 1 extra (2007-05-20 "Argentina v Mexico", not in Wikipedia, empty) | 1 / 1 / **5** | **0 found** (the 4 Oct-Nov 2007 WCQ were not returned by any schedule season tried, 2006-2010) | 6 / 6 |
| **Total** | **77** | **73** | 12 / 12 / 13 of 25 | 16 / 16 / 4 of 24 (+4 not found) | 28 / 28 |

The core column equals the site column in every row: the core roster never adds a match. Of 77 matches, 56 have rosters, 13 found matches have none, and 4 were not enumerated, so 21 of 77 (27%) are holes in the match store. Most are pre-2008 friendlies and CONMEBOL 2005 qualifiers.

## Q4 and Q5

- **Q4:** no hidden friendly slug. `fifa.friendly` (3922) is the only one, holding 1,338 completed events for 2002-2008 in our year scoreboards, and it is where the coverage gaps live. Confederation qualifier slugs are the ones already known, and their history starts at the 2006 campaign. The bare `fifa.worldq` resolves but has no id and no events on the probed dates.
- **Q5:** scoreboards on 2004-10-13 and 2001-09-01 across 66 international slugs, hidden ones included. On 2004-10-13: 21 matches under `fifa.worldq.uefa`, 6 under `.concacaf`, 3 under `.conmebol`, none elsewhere. On 2001-09-01: zero events on every slug. The 2002 WC qualifiers aren't filed anywhere, so there's no unexpected-slug filing.

## What ESPN fills, and what remains for the archive

**ESPN fills (via the athlete store or re-indexing):**
- EPL 2009-10's 23 "missing" matches. These are a filing artefact: the site summaries are full under the 2013-14 slug bucket.
- Per-player lines in the collapsed Serie A rosters (2001-08) and in Barca-Udinese, for any player whose eventlog lists the match. These are fetched per player (eventlog plus per-event stats). Totti's Bologna v Roma is recovered exactly.
- Messi's two empty World Cup summaries (apps and minutes per player). Plays don't help there; the athlete stat records do.
- Season-level gates: the totals endpoint gives apps, starts and goals per player-league-season in one request, matching Wikipedia to within 1 app in 20 of 21 checks (the other is a hole).
- Phantom apps (the 2006 final squad list) are removed by per-event `appearances`/`dnp`.

**Still holes for the archive:**
- Full collapsed-roster lineups (all 18 players per side) can't be recovered except player by player, and only for players whose eventlog is pulled. Other team-mates' lines in those matches need the per-player pull or an outside source.
- Friendlies before about 2008 with no roster: 13 of 25 in the Q3 team-years, and 10 of 16 sampled in 2002-04. They're absent from both stores.
- CONMEBOL 2005 qualifiers (scorer-only), plus the Oct-Nov 2007 CONMEBOL qualifiers the schedule didn't return.
- All internationals before 2001 except World Cups (Henry 1998-2001, Totti 1998-2001), and the 2002 WC qualifiers entirely.
- Messi's 2007 internationals: the match store has Copa 2007, but the athlete store doesn't, so take them from the site summaries.
- Youth internationals below U19 and U21, and pre-2017 Norwegian lower-tier club matches (Haaland at Bryne).
- One-app residuals the gates still show: Ronaldo EPL 2003-04 (28 against 29), and the +1s for Henry La Liga 2008-09 and Totti 2003-04 and 2010-11.

## Requests

| Script | Uncached |
|---|---|
| `core-get.mjs` (endpoint discovery, 4 runs) | 31 |
| `core-q1.mjs` (Q1 rosters and plays) | 102 |
| `core-q2.mjs` (plays, Haaland id, statisticslog and eventlog for 5 players) | 116 |
| `core-q345.mjs` (hidden slugs, season ranges, Q5 scoreboards, Q3 schedules and rosters, Q1 international sampling) | 478 |
| `core-q2b.mjs` (web gamelog gates, caps by year) | 156 |
| `core-q3fix.mjs` (campaign-season schedules, 2 qualifiers) | 18 |
| `core-q2c.mjs` (season totals) | 21 |
| `core-evstat.mjs` (per-event stats, 2 runs) | 8 |
| **Total** | **930** |

## Scripts (research/espn/)

| File | What |
|---|---|
| `espn.mjs` | now exports `getUrl(absoluteUrl)`; `get()` wraps it |
| `core-lib.mjs` | base URLs, `coreRoster`, `siteRosterInfo`, `competitorsOf`, ref helpers |
| `core-cat.mjs` | cache-only reader for absolute URLs (`cachedUrl`) |
| `core-get.mjs` | fetch any absolute URLs and print their shape |
| `core-find-ids.mjs` | cache-only: EPL 2009-10 missing ids and Serie A collapsed ids → `out/core-test-ids.json` |
| `core-q1.mjs` → `core-q1.json` | Q1 |
| `core-q2.mjs` → `core-q2.json` | eventlogs and statisticslogs |
| `core-q2b.mjs` → `core-q2b.json` | gamelog gates and caps |
| `core-q2c.mjs` → `core-q2c.json` | season totals |
| `core-q345.mjs`, `core-q3fix.mjs` → `core-q345.json` | Q3, Q4, Q5, Q1 internationals |
| `core-evstat.mjs` | per-event athlete stat records from a URL list |
