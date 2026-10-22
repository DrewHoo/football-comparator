# Beachhead: start the ledger at 2002-03, built from ESPN

Decided on 2026-10-21 from three probes: [espn-coverage-leagues.md](espn-coverage-leagues.md) (1,352 requests, 807 sampled matches, 13 gated club-seasons), [espn-coverage-ucl-intl.md](espn-coverage-ucl-intl.md) (796 requests), and [statsbomb-license.md](statsbomb-license.md). Every ESPN response is cached under `research/espn/cache/` (623 MB), so re-running any script costs nothing.

## The call

**2002-03 for the five leagues and the Champions League.** It's the first season where appearances and goals are buildable and gate-verified in England, Spain and Germany, and the first UCL season with starter flags in every stage. It captures Henry's peak (24 and 30 goals, exact), all of Ronaldo's Man Utd years (within 1 app), Messi from his debut (exact), and Van Nistelrooy's 12-goal 2002-03 UCL (exact, with his 2 qualifier goals flagged off).

The alternative was 2008-09, when every league has clean lineups, stats arrays and assists. It loses Henry entirely, Ronaldo's 42-goal 2007-08, Messi's first four seasons and Totti's Golden Boot. A "first 100 appearances" board starting there can't do Messi vs Ronaldo from debut, which is the marquee query. So 2002-03 with printed per-league floors.

## What each floor is

| Field | Premier League | La Liga | Serie A | Bundesliga | Ligue 1 | Champions League |
|---|---|---|---|---|---|---|
| Appearances + goals | 2002-03 | 2002-03 | 2008-09 clean; 2005-06 with low risk; 2002-05 loses 1-4 apps per player-season | 2002-03 | 2003-04 | 2002-03 (proper stages) |
| Assists | 2005-06 | 2005-06 | 2008-09 | 2006-07 | 2007-08 | 2006-07 |
| Minutes (from sub clocks) | 2002-03 | 2002-03 | with apps | 2002-03 | 2003-04 | 2002-03 |

The page prints these the way the NFL site prints "flagged since 2003". Assists are a sparse layer with a later wall than goals, in every league.

**Update, later the same day:** the core-API probe ([espn-core-probe.md](espn-core-probe.md)) found that ESPN's athlete-scoped store repairs the collapsed Serie A rosters and that the 23 EPL 2009-10 matches aren't missing (Burnley fixtures filed under the 2013-14 slug). So Serie A starts at 2002-03 with the others, and the paragraph below is kept for the record. See [internationals.md](internationals.md) for the national-team plan.

**Serie A was the one open sub-decision.** 7 to 29% of its 2001-02 to 2007-08 rosters are collapsed (every entry is the same athlete), so Totti and Shevchenko lose an appearance or several per season. KeyEvents in those matches are fine, so goals are right and appearances are short. Options: start Serie A at 2005-06 (0 collapsed in the 2005-07 sample, 7% in 2007-08), or start at 2002-03 with a per-player "±N apps" flag, or probe `sports.core.api.espn.com` for a second copy of those rosters. I'd start Serie A at 2005-06 and keep the other four at 2002-03, unless the core API probe fills the holes.

## Internationals stay out of v1

Tournaments are good: World Cups from 1998 and Euros from 2004 have rosters, stats and keyEvents, and Ronaldo's goals and apps match in 11 of 11 tournaments. But a club-plus-country career ledger needs qualifiers and friendlies too, and ESPN's are patchy: UEFA qualifiers have no stats before about 2008, CONMEBOL 2004-05 qualifier rosters list only scorers, and 8 of 18 sampled friendlies have no roster. So the career view the discourse uses for Ronaldo's 981 can't be built from ESPN. A tournament-only board ("World Cup goals through N appearances") is possible later. Euro 2000 is missing entirely.

Outer-ring leagues: apps and goals exist for the Netherlands, Austria, Norway, Brazil (2009-), Scotland, Argentina, MLS and Saudi, so Haaland's Salzburg and Molde years and Messi's Miami years are coverable. Portugal starts 2006-07, so Ronaldo's Sporting season stays a receipt, not a row.

## StatsBomb: a test gate, not a source

Drew's pushback was half right. The agreement (unchanged since September 2023, identical at statsbomb/open-data and hudl/open-data, governed by English law) permits publishing "analysis or conclusions" with the logo and bars the User from "distribute, reproduce ... or in any way provide the data to any external or third party". Publishing cumulative curves computed at build time is arguable and leans allowed. A committed per-player-match ledger derived from StatsBomb rows in a public repo is barred on the text, and so is a receipts popover showing a StatsBomb lineup. Using Messi's complete La Liga match set as a known-answer gate in CI, fetched and never committed, is clearly fine.

The repo-license angle doesn't rescue it. Neither sibling repo has a LICENSE file at all, and the onward grant that matters is GitHub's own terms: any public repo licenses every GitHub user to fork its contents. A code-only LICENSE plus a data NOTICE stops the repo from purporting to license the data (which clause 7 names) but doesn't touch "provide the data to any third party". Nobody has been enforced against in eight years, raw mirrors sit on Kaggle labelled CC0, and clause 8.3 says non-enforcement isn't a waiver.

And the value isn't there for v1: ESPN already covers Messi from 2004, the early World Cups are 1-6 showcase matches each, and the La Liga set is Messi's matches only. So: StatsBomb as the Messi gate, a draft permission email sits in the license report if a receipts layer is ever wanted, and nothing StatsBomb-derived ships in the repo.

## The harvest, sized

- Enumeration is cheap: `scoreboard?dates=YYYY&limit=1000` returns a calendar year, so a league-season costs 2 requests. Assign seasons by match date, not by ESPN's season slug (it misfiles Bundesliga 2010-11 and Ligue 1 2002-03 and duplicates EPL 2009-10). Keep `STATUS_FULL_TIME`, `STATUS_FINAL_AET`, `STATUS_FINAL_ABANDONED`; drop ghost "postponed" rows and relegation playoffs.
- Summaries are the cost: about 380 per league-season. Five leagues from 2002-03 to 2025-26 is roughly 44,000 summaries, about 18 hours at 1.5 s per request, run once and cached. The UCL is one `teams/{id}/schedule?season=` call per club-season plus ~125 summaries a season.
- Rate: one process, one request per 1.5 s, exponential backoff on 429 and 5xx. The two probes ran 2,150 requests this way and hit 13 retries and no block.

## Repairs the ledger builder has to carry

These came out of the gates, and each is one bad match pattern:

1. Dedupe roster entries by athlete id (La Liga and Serie A list subs twice from 2007-08).
2. A starter is `starter && !subbedIn`. Where stats exist, a starter also needs `APP = 1` (drops bench players flagged as starters and 12th starters).
3. Count goals from keyEvents with `scoringPlay`, excluding `own-goal` (whose first participant is the defender and whose team is the beneficiary). Never count by type name; penalty typing is missing for whole seasons.
4. Reconcile keyEvent goals to the final score; when they exceed it, duplicates exist (Sevilla-Barcelona 2006-10-15 lists Messi's goal at 80' and 81'). Prefer stats `G` where stats exist, except stats sometimes read 0 against a real goal (Totti, two matches in 2006-07), so keyEvents win on goals and stats win on tie-breaks.
5. Dedupe substitution events by the (in, out) pair.
6. Check that keyEvent team ids match the header's competitors (the EPL 2009-10 re-ingest returns another match's events).
7. Build an id-merge table: 185 name-plus-club pairs carry two or more athlete ids (a re-ingest around 2006), and 389 display names are real homonyms, so key on id plus merges, never on name. Star ids are stable (Messi 45843 across 2004-14, Ronaldo 22774 across 2003-11).
8. Rebuild collapsed rosters from substitution keyEvents where possible, and keep a corrections file for the rest (Messi's 2005-09-27 Udinese appearance is recoverable this way).
9. Flag UCL qualifiers with `/qualif|play-?off/i` on the season slug or header name; from 2020-21 they live under `uefa.champions_qual`.

## Known holes to carry in Method

- 23 EPL 2009-10 matches have no lineup source in ESPN.
- EPL 2011-12 stat arrays (assists) are half missing.
- Serie A 2002-05 appearances short by 1-4 per player-season if included.
- Ronaldo 2003-04 is one appearance short in ESPN; one of five Man Utd rosters silently omits him, undetectable from the summary alone.
- Penalty typing absent for EPL 2002-03 and 2009-10.

## Next

1. Decide Serie A (2005-06, or 2002-03 with a flag).
2. Probe `sports.core.api.espn.com` for the collapsed Serie A rosters and the 23 EPL 2009-10 matches before harvesting.
3. Write the harvester on top of `research/espn/espn.mjs` with the nine repairs, run it in the background, and gate the 2012-13 and 2013-14 overlap against transfermarkt-datasets at season level for every player.
