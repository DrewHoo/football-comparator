# ESPN coverage: Champions League, national teams, outer-ring leagues

Probe run 2026-10-21. Every request went through `research/espn/espn.mjs` at `ESPN_GAP_MS=1500`: about **796 uncached requests** plus 13 backoff retries (two persistent 5xx, both recovered). Scripts and raw JSON sit beside the helper under `research/espn/`, with `ucl-*` and `intl-*` prefixes. The scripts are listed at the end.

Tags: **[V]** = seen in ESPN responses during this run. **[K]** = known answer from Wikipedia season pages, fetched this run.

## Answers first

| Question | Answer |
|---|---|
| First UCL season in ESPN at all | **2001-02**. Seasons 1999-2000 and 2000-01 return nothing: every probed scoreboard is empty, and team schedules for seasons 1999 and 2000 return 0 events [V] |
| First season with reliable rosters and starter flags (proper stages) | **2002-03**. In 2001-02 the early group stage has no `starter` flags (18-man lists, so unused bench and starters can't be told apart), and 1 of 8 MD1 matches has empty rosters. Flags are present from the 2001-02 second group phase onward [V] |
| First season with stats arrays (APP, SUB, G, A...) | Stats first appear in the **2004-05 knockouts** (QF and final have them; group MD1 does not). Every sampled match has them from **2005-06** [V] |
| First season with usable assists | Stats `A` is present but zero in the 2005-06 group stage (0 of 22 goals assisted). It is populated at the 2005-06 QF and final, and from **2006-07** on 62-83% of goals carry an assist, a normal rate. KeyEvent assists (second participant) only appear from 2012-13 [V] |
| Qualifiers present and flaggable? | **Yes, flaggable in every season.** `event.season.slug` is `qualifying-{first,second,third}-round`, `play-off-round` (2009-12) or `playoff-round` (2013-). The summary's `header.season.name` ends in the round name, and `altGameNote` repeats it. From 2020-21, qualifiers live in a separate slug, `uefa.champions_qual`. Qualifier **rosters are patchy** (table below), which doesn't matter when they are excluded [V] |
| Old two-group-stage format | 2001-02 and 2002-03 second phases are present in full (4 matches per date, slugs `2001-second-phase` / `2002-second-phase`, full rosters and flags). 1999-2001 is absent entirely, so its second group stages are too [V] |
| UCL gates | **Goals reconcile in 5 of 5. Apps reconcile in 4 of 5.** The miss is Messi 2005-06, where a corrupt roster hides one appearance. It is repairable from substitution keyEvents |
| International gates | **Ronaldo: 11 of 11 tournaments exact on goals and apps. Messi: goals exact in 5 of 5 World Cups, apps short by 1 in 2010 and 2014** (empty match summaries) |
| Club + country career ledger from ESPN alone? | **No.** Tournaments yes (WC 1998-, Euro 2004-). UEFA qualifiers have rosters but no stats before about 2008. CONMEBOL 2004-05 qualifier rosters list only scorers. Friendlies are patchy |

## 1. Champions League 2001-02 through 2013-14, by stage

Sample: on each date every match was fetched, except qualifying dates, which were capped at 8. Columns give matches with both rosters / matches with exactly 22 starters / matches with stats arrays / matches whose goal keyEvents equal the final score. All goal and substitution keyEvents carry a clock. Only `kickoff` events lack one.

| Season | Qualifying (Q3 1st leg) | Group MD1 | 2nd group phase MD1 | QF 1st leg | Final | Calendar rounds in scoreboard |
|---|---|---|---|---|---|---|
| 1999-00 | none | none | none | none | none | none |
| 2000-01 | none | none | none | none | none | none |
| 2001-02 | 8 rosters but **scorers only** (avg 8.5 players), 1/1/0/8 | 7/**0**/0/7 of 8 | 4/4/0/4 | 2/2/0/2 | 1/1/0/1 | Q1-Q3, Group, "2001 Second Phase", QF, SF, Final |
| 2002-03 | 4/3/0/8 of 8 | 8/8/0/8 | 4/4/0/4 | 2/2/0/2 | 1/1/0/1 | same shape |
| 2003-04 | 6/4/0/8 | 8/8/0/8 | (R16 era) | 2/2/0/2 | 1/1/0/1 | Q1-Q3, Group, R16, QF, SF, Final |
| 2004-05 | 6/4/0/8 | 8/7/0/8 | | 2/2/**2**/2 | 1/1/1/1 | |
| 2005-06 | 8/8/0/8 | 8/8/8/8 | | 2/2/2/2 | 1/**0**/1/1 (squad list, below) | |
| 2006-07 | 8/8/0/8 | 8/8/8/8 | | 2/2/2/2 | 1/1/1/1 | |
| 2007-08 | 8/8/0/8 | 8/8/8/8 | | 2/2/2/2 | 1/1/1/1 | |
| 2008-09 | 8/8/0/8 | 8/8/8/8 | | 2/2/2/2 | 1/1/1/1 | |
| 2009-10 | **0**/0/0/3 of 8 (playoff round: full rosters) | 8/7/8/8 | | 2/2/2/2 | 1/1/1/1 | adds "Play-off round" |
| 2010-11 | **0**/0/0/6 of 8 (playoff round: full) | 8/8/8/8 | | 2/1/2/2 | 1/1/1/1 | |
| 2011-12 | **1**/1/0/1 of 7 (playoff round: full) | 8/8/8/8 | | 2/2/2/2 | 1/1/1/1 | |
| 2012-13 | 8/8/0/8 | 8/8/8/8 | | 2/2/2/2 | 1/1/1/1 | |
| 2013-14 | 8/8/7/8 | 8/8/8/8 | | 2/2/2/2 | 1/1/1/1 | |

Earlier qualifying rounds (2 matches each): 2005-06 Q1 lists scorers only, 2008-09 Q2 is empty, 2013-14 Q2 has full rosters. Modern era: on 2020-08-18 `uefa.champions` holds only the delayed 2019-20 semifinal, while `uefa.champions_qual` holds the 2020-21 first round with rosters. In 2023-24 the playoff round appears only in `uefa.champions_qual`, with rosters and stats [V].

**Assist coverage** (stats `A` total ÷ goals, on sampled group/QF/final dates): 2004-05 0/11 · 2005-06 5/27 (group 0/22, QF and final 5/5) · 2006-07 20/32 · 2007-08 16/22 · 2008-09 21/30 · 2009-10 19/30 · 2010-11 23/37 · 2011-12 19/23 · 2012-13 22/31 · 2013-14 30/39.

### How the stage is encoded

| Field | Where | Example |
|---|---|---|
| `events[].season.slug` | scoreboard, team schedule (as `seasonType.name`) | `qualifying-third-round`, `play-off-round`, `group-stage`, `2002-second-phase`, `round-of-16`, `quarter-finals` / `quarterfinals`, `semi-finals` / `semifinals`, `final` |
| `events[].season.type` | scoreboard | numeric id per round (e.g. 4753 = Q3 2013-14, 4754 = group-stage) |
| `header.season.name` | summary | `2013-14 UEFA Champions League, Final`; `2001/02 UEFA Champions League, Qualifying Third Round` |
| `competitions[0].altGameNote` | scoreboard | `UEFA Champions League, Qualifying Third Round` |
| `competitions[0].group.name` | scoreboard | `UEFA CHAMPIONS LEAGUE - GROUP B` |
| `competitions[0].notes[].headline` | scoreboard | `1st Leg` |
| `leagues[0].calendar[0].entries[]` | scoreboard | round labels with date ranges (`calendarType: list`), **not** a list of match dates |

The flag rule is `/qualif|play-?off/i` on the slug or header name. Spellings drift (`play-off-round` vs `playoff-round`, `quarter-finals` vs `quarterfinals`), so match with a regex, not an equality check. The scoreboard calendar gives round windows, not match days. The cheapest way to enumerate a season's events is `uefa.champions/teams/{id}/schedule?season={startYear}`: one call returns a club's whole UCL season, qualifiers included, with the stage on each event.

### Data-quality anomalies (scan of all 333 cached UCL summaries)

| Kind | Cases | Effect | Ledger rule |
|---|---|---|---|
| Duplicate-athlete roster: every row replaced by one athlete, jerseys intact | 2005-06 Barcelona-Udinese both legs (188764, 188837) | Lineups lost. Messi's 27 Sep 2005 appearance vanishes | Rebuild from substitution keyEvents plus a corrections file. Detect with `rows - uniqueIds > 2` |
| Squad list flagged as starters (20 "starters", no stats on the unused) | 2006 final (197123): Messi, injured, is flagged `starter: true` | Flag-only counting credits phantom apps | Where stats exist, an appearance = `APP ≥ 1`, not `starter` |
| 12 starters on one side | 283208 (2009-10), 315212 (2010-11), 254722 (2008-09) | +1 phantom start | Same APP rule. Cap at 11 and log |
| Every goal keyEvent duplicated | 254722, Barcelona 2-3 Shakhtar 2008-09 (10 events for 5 goals) | Double-counted goals from keyEvents | Dedupe on (team, clock, scorer). Prefer stats `G` where stats exist |
| Empty rosters | 2001-02 Spartak-Feyenoord. Qualifiers as tabled | Missing apps | Only one proper-stage case seen. Qualifiers are excluded anyway |

## 2. UCL known-answer gates

ESPN totals: apps = `starter || subbedIn`; goals = goal keyEvents (no own goals, no shootouts) cross-checked with stats `G`. Known answers come from the Wikipedia season pages [K]: 2002-03 and 2007-08 Man Utd, 2008-09 Barcelona, plus the brief's figures.

| Gate | ESPN UCL proper | ESPN qualifying (flagged) | Known answer | Verdict |
|---|---|---|---|---|
| Van Nistelrooy, Man Utd 2002-03 (16 matches) | 9 apps (8 starts, 1 sub), **12 goals**, no stats arrays that season | 2 apps, 2 goals (Zalaegerszeg 2nd leg) | 12 in the competition proper. Wikipedia's "Europe" column: 10(1) apps, 14 goals, which includes Q3 | **Pass.** Exactly 12 + 2, and the qualifier flag separates them |
| Messi, Barcelona 2005-06 (13 matches) | 6 apps by flag, 1 goal (keyEvent and `G`) | none | 6 apps, 1 goal | **Pass on goals. Apps pass only by accident.** The flag count includes the phantom 2006 final and misses the Udinese home match (corrupt roster; a substitution event shows Ezquerro on for Messi at 70'). By APP the count is 5. Correct = 6 after repair |
| Ronaldo, Man Utd 2007-08 (13) | 11 apps (11 starts), **8 goals** (`G` = 8), `A` = 1 | none played | 11 (11 starts), 8 goals [K] | **Pass** |
| Messi, Barcelona 2008-09 (15) | 12 apps (10 starts), **9 goals** (`G` = 9), `A` = 5 | 2 Wisła qualifiers flagged; Messi absent (Olympics) | 12 apps, 9 goals [K] | **Pass** (assists not independently verified) |
| Ronaldo, Real Madrid 2013-14 (13) | 11 apps (11 starts), **17 goals**, `A` = 4 = keyEvent assists | none | 17 goals; missed Galatasaray at home and Dortmund away | **Pass** (11 apps consistent; assists not verified, Wikipedia tables truncated) |

All five team-seasons: goal keyEvents equal the final score in every match except the duplicated Shakhtar game.

## 3. National teams

Team ids: Portugal 482, Argentina 202. Tournament matches come from `{slug}/teams/{id}/schedule?season=Y`. Euro 2020 is filed under season 2020.

| Tournament | Present | Rosters / starters | Stats | KeyEvents | Notes |
|---|---|---|---|---|---|
| WC 1998 | yes | 5/5 ARG matches, 22 starters (used players only) | yes | yes | |
| WC 2002 | yes | yes | yes | yes | |
| WC 2006 | yes | yes | yes | yes | |
| WC 2010 | yes | **final and ARG-GER QF empty** | elsewhere yes | elsewhere yes | 2 of 9 probed matches empty |
| WC 2014 | yes | **ARG-NED SF empty** | yes | final has a duplicated goal event | |
| WC 2018 / 2022 | yes | yes | yes | yes | |
| Euro 2000 | **no** (final and Portugal schedule empty) | | | | |
| Euro 2004 | yes | yes | yes, except the final (rosters only) | yes | |
| Euro 2008-2024 | yes | yes | yes | yes | |
| `fifa.worldq.uefa` 2004-05 (4 dates, 12 matches) | yes | 11 of 12 full (1 scorer-only) | **none** | yes, reconcile | |
| `fifa.worldq.uefa` 2008-09 (4 dates, 12 matches) | yes | 12 of 12 | 3 of 12 | yes | Portugal's 12-match campaign complete, Ronaldo 0 goals (correct) |
| `fifa.worldq.conmebol` 2004-05 (3 dates, 8 matches) | yes | **scorer-only** except Oct 2005 | none | reconcile | |
| `fifa.worldq.conmebol` 2008-09 (3 dates, 7 matches) | yes | yes | yes | **goal events duplicated 2x** in 4 of 7 | dedupe needed |
| `uefa.euroq` 2007, 2011, 2015, 2019 | yes | yes | yes | yes | solid |
| `fifa.friendly` 2004, 2008, 2011, 2014, 2018, 2024 (18 matches) | yes | 2004 scorer-only; 2008 and 2011 **none**; 2014 1 of 3 empty; 2018 3/3; 2024 2/3 | 3 of 18 | where rosters exist | Portugal's own 2008 friendlies: 4 of 5 with rosters |

### Ronaldo (Portugal) tournament gate [V vs brief]

| Tournament | ESPN apps | ESPN goals (KE = `G`) | Expected | |
|---|---|---|---|---|
| Euro 2004 | 6 | 2 | 2 | pass |
| WC 2006 | 6 of 7 (rested v Mexico) | 1 | 1 | pass |
| Euro 2008 | 3 of 4 (rested v Switzerland) | 1 | 1 | pass |
| WC 2010 | 4 | 1 | 1 | pass |
| Euro 2012 | 5 | 3 | 3 | pass |
| WC 2014 | 3 | 1 | 1 | pass |
| Euro 2016 | 7 | 3 | 3 | pass |
| WC 2018 | 4 | 4 | 4 | pass |
| Euro 2020 | 4 | 5 | 5 | pass |
| WC 2022 | 5 | 1 | 1 | pass |
| Euro 2024 | 5 | 0 | 0 | pass |

### Messi (Argentina) World Cup gate

| WC | ESPN apps | ESPN goals | Expected goals | |
|---|---|---|---|---|
| 2006 | 3 | 1 | 1 | pass |
| 2010 | **4** (true 5; Germany QF summary empty) | 0 | 0 | goals pass, apps -1 |
| 2014 | **6** (true 7; Netherlands SF summary empty) | 4 | 4 | goals pass, apps -1 |
| 2018 | 4 | 1 | 1 | pass |
| 2022 | 7 | 7 | 7 | pass |

**Conclusion:** a tournament ledger (WC 1998-, Euro 2004-) is buildable with a small corrections layer for empty summaries. A full international career ledger is not buildable from ESPN alone: friendlies are too patchy (8 of 18 sampled matches have no roster and 3 more list only scorers), and early qualifiers lack stats or list only scorers. RSSSF per-cap logs or martj42 would have to carry that ring.

## 4. Development and outer-ring leagues

3 dates each (por.1 got 7 plus a Sporting schedule check), 2 matches per date.

| Slug | Seasons probed | Rosters + starter flags | Stats arrays | Timed goal/sub events | Player window covered? |
|---|---|---|---|---|---|
| `por.1` | 2002-03, 2005-06: **empty**. Sporting schedule empty for 2002, 2003, 2005; 30 events in 2006 and 2008. 2010, 2015, 2019 present | from 2006-07 | 2019-20 yes; 2010, 2015 no | yes | **Ronaldo's Sporting 2002-03: no** |
| `ned.1` | 2001-02, 2003-04, 2009-10 | yes | no | yes | Zlatan (Ajax 2001-04), Suárez (Ajax 2007-11): apps + goals, no assists |
| `aut.1` | 2019-20 | yes | no | yes | Haaland Salzburg: apps + goals |
| `nor.1` | 2017, 2018, 2019 | yes | no | yes | Haaland Molde: apps + goals |
| `usa.1` | 2023, 2024, 2025 | yes | yes | yes | Messi Miami: full |
| `ksa.1` | 2023-24, 2024-25 | yes | from 2024-25 | yes | Ronaldo Al-Nassr: apps + goals; assists from 2024-25 |
| `tur.1` | 2005-06 empty; 2014-15 events without rosters; 2023-24 rosters | 2023-24 | no | 2023-24 | thin before recent seasons |
| `bra.1` | 2009, 2011, 2012 | yes (2009 has 23-26 "starters" per match, over-flagged) | 2011 on | yes | Neymar Santos 2009-13: apps + goals; 2009-10 starts unreliable |
| `arg.1` | 2005 and 2023 dates empty (likely no fixtures, not verified); 2012-13 full | 2012-13 | 2012-13 | yes | |
| `sco.1` | 2005-06 rosters; 2012-13 rosters + stats | yes | 2012-13 | yes | |

## 5. Recommendation

- **UCL beachhead: 2002-03.** It's the first season where every sampled proper-stage match has both rosters, 22 starters and goal events that reconcile. 2001-02 can be offered as a goals-only extension (start and appearance counts are unreliable in its early group stage), and nothing exists before it.
- **Qualifiers:** exclude by default with the slug regex. That matches UEFA's and Opta's counting, and the Van Nistelrooy gate (12 vs 14) proves the split. Keep them in the ledger, flagged, in case a "including qualifiers" toggle is wanted. From 2020-21 they arrive in a separate slug, `uefa.champions_qual`.
- **Assists: from 2006-07** (stats `A`). 2005-06 is partial: the group stage has none, the knockouts have them.
- **Rules the build must carry:**
  - Appearance = `APP ≥ 1` where stats exist, else `starter || subbedIn`.
  - Goals = stats `G` where stats exist, else goal keyEvents deduped on (team, clock, scorer).
  - Detect duplicate-athlete rosters and over-11 starters, and repair them from substitution events plus a corrections file.
  - Run these gates on every build.
- **Internationals: not in v1.** A "World Cup goals through N appearances" board is feasible as a tournament-only v2: WC 1998-, Euro 2004- (no Euro 2000), with corrections for the empty summaries already found. A club-plus-country career ledger isn't feasible from ESPN alone.
- **Outer ring:** apps and goals are coverable for ned.1 (2001-02-), aut.1, nor.1, usa.1, ksa.1, bra.1 (2009-), sco.1 (2005-), arg.1 (2012-), and por.1 from 2006-07, which misses Ronaldo's Sporting season. Assists only in usa.1, ksa.1 (2024-25-), bra.1 (2011-), arg.1 (2012-), sco.1 (2012-) and por.1 (about 2019-). tur.1 is only safe for recent seasons.

## Slug list

`../../leagues/dropdown?sport=soccer&limit=400` (relative to the soccer base) returns **220 leagues**. The bare `soccer/` and `soccer/leagues` paths return 404. Slugs relevant here: `uefa.champions`, `uefa.champions_qual`, `uefa.europa`, `uefa.europa_qual`, `uefa.europa.conf`, `uefa.super_cup`, `fifa.world`, `fifa.worldq.uefa`, `fifa.worldq.conmebol`, `fifa.worldq.concacaf`, `fifa.worldq.afc`, `fifa.worldq.caf`, `fifa.worldq.ofc`, `uefa.euro`, `uefa.euroq`, `uefa.nations`, `conmebol.america`, `fifa.friendly` (exists, confirmed), `fifa.cwc`, `por.1`, `ned.1`, `aut.1`, `nor.1`, `sco.1`, `bra.1`, `arg.1`, `usa.1`, `ksa.1`, `tur.1`. The full list is printed by `node research/espn/ucl-slugs.mjs` (cached, free to rerun).

## Scripts (research/espn/)

| File | What |
|---|---|
| `ucl-get.mjs` | fetch any path through the helper; print its shape |
| `ucl-slugs.mjs` | dump the 220-league slug table |
| `ucl-sbsum.mjs` | condensed scoreboard view |
| `ucl-lib.mjs` | `analyse()`, `tally()`, `scoreboardNear()`, a non-throwing `summary()` |
| `ucl-coverage.mjs` → `ucl-coverage.json` | part 1 sweep |
| `ucl-gates.mjs` → `ucl-gates.json` | part 2 gates |
| `ucl-inspect.mjs` | per-match roster and goal dump |
| `ucl-anomalies.mjs` | cache-wide anomaly scan (no network) |
| `ucl-followups.mjs` → `ucl-followups.json` | pre-2001 check, qualifying rounds, `champions_qual`, Portugal qualifiers and friendlies |
| `intl-coverage.mjs` → `intl-coverage.json` | part 3 tournaments and samples |
| `intl-devleagues.mjs` → `intl-devleagues.json` | part 4 |
| `intl-por1.mjs` | por.1 floor |

Requests: 331 (UCL coverage) + 64 (gates) + 229 (internationals) + 93 (dev leagues) + 57 (follow-ups) + 11 (por.1) + about 11 (discovery) ≈ **796 uncached**, plus 13 backoff retries.
