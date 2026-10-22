# ESPN soccer API: big-five league coverage, 2000-01 to 2013-14

Measured 2026-10-21. 1,352 uncached requests (budget 1,500), all through `research/espn/espn.mjs` at `ESPN_GAP_MS=1500`, with one process at a time. The scripts live in `research/espn/` (listed at the end), and every response is cached, so a re-run costs nothing.

**Bottom line.** ESPN can carry a five-league appearances-and-goals ledger from **2002-03**. Serie A 2002-05 is the exception (corrupt rosters, below), and so is Ligue 1 2002-03 (93% rosters). Assists arrive league by league, 2005-06 to 2008-09. On 13 known-answer club-seasons, ESPN matched Wikipedia/BDFutbol apps exactly in 11 and keyEvent goals exactly in 11. Once duplicate goal events are reconciled to the score and the keyEvents of one collapsed-roster match are counted, goals match in all 13. Every miss traces to one specific bad match. Raw ESPN flags can't be used as they are, though. Lineups need three repair rules, player ids need a merge table, and every summary needs a sanity check against its own header.

## 1. Enumeration: 2 requests per league-season

- `scoreboard?dates=YYYY&limit=1000` returns **every event in that calendar year** (385 La Liga events for 2004; no year came near 1,000). A league-season therefore costs **2 requests**: the two calendar years, split by match date (July to June). The whole 5-league, 2000-2014 index cost 75 requests.
- `dates=YYYYMMDD-YYYYMMDD` returns **HTTP 400**. `dates=YYYYMM` works (40 events for Oct 2004), and so does `dates=YYYY&limit=200`, but the latter silently truncates at 200.
- The scoreboard's `leagues[0].calendar` is a whitelist of match days (`calendarType: "day"`, 81 days for La Liga 2004-05). It's useful for day-by-day crawling, but the year query makes it unnecessary.
- `events[].season` = `{year, type, slug}`. There's no `week` field, so completeness is checked by counting: 380, or 306 for 18-team leagues. Each team must appear and each home/away pairing must occur once.
- **Assign the season by date, not by `season.slug`.** ESPN files:
  - Bundesliga 2010-11 under `group-stage` (303 matches), plus 3 matches under the real slug.
  - Three La Liga 2010-11 Almería matches under `group-stage`.
  - Ligue 1 2002-03 as `20032003-french-ligue-1`.
  - EPL 2009-10 twice (see oddities).
  - Bundesliga relegation playoffs as `…-german-bundesliga-playoffs`.
- Keep `STATUS_FULL_TIME`, `STATUS_FINAL_AET` and `STATUS_FINAL_ABANDONED`. With those three, every league-season 2001-02 to 2013-14 counts out to exactly 380 or 306 played matches, with no repeated pairings, except these:

| League-season | Played | Why |
|---|---|---|
| eng.1 2000-01 | 0 | EPL slug starts 2001-02 |
| esp/ita/ger 2000-01 | 254 / 207 / 190 | Only the 2001 half of the season exists; no usable rosters (below) |
| fra.1 2000-01 | 9 | Fragments |
| ita.1 2003-04 | 305 | Reggina v Sampdoria (2004-01-24) is stuck at STATUS_SCHEDULED 0-0 |
| fra.1 2003-04 | 379 | Nantes v Bordeaux (2004-02-06) is stuck at STATUS_SCHEDULED |
| esp.1 2007-08 | 379 | One abandoned match with no replay row |
| ita.1 2004-05 | 382 | Includes the Parma v Bologna relegation playoff (2005-06-14 and 06-18, ids 183904 and 183905); exclude them |
| eng.1 2009-10 | 380 / 357 | Two copies; only the 357 legacy one has data |

**Cost of a full ledger:** 2 scoreboard requests plus ~380 summaries per league-season. Five leagues from 2002-03 to 2013-14 is about 22,000 summaries, roughly 9 hours at 1.5 s per request.

## 2. Coverage sweep

**Method.** The brief asked for whole match days. Because the year query lists every match, I sampled matches evenly spaced by date instead, with each season's first and last match always included. The same budget then covers more distinct days: 14 per league-season for 2001-02 to 2008-09, 8 for 2009-10 to 2013-14, and 4 for 2000-01. On top of that I took 8 from the EPL 2009-10 legacy copy and every stuck-status row. That's 807 summaries in all. The 463 gate matches (§3) are reported separately.

**Repairs behind "clean lineup"** (in `inspect.mjs`; raw flags are worse):
1. Dedupe roster entries by `athlete.id`. From 2007-08, La Liga and Serie A list subs twice: once in the starting block with `starter:true`, and again in a `SUB` block.
2. Count a player as a starter only if `starter && !subbedIn`.
3. If the match has stat arrays, a starter must also have `APP=1`. This drops unused bench players wrongly flagged `starter:true` (e.g. Piqué and Yaya Touré, Barcelona at Sporting, 2008-09) and phantom 12th starters with no stats.

"Clean lineup" = rosters for both sides, distinct athlete ids, exactly 11 repaired starters per side, and repaired sub-on count = distinct substitution keyEvents per side.

### First season each field is reliable

Reliable means ≥95% of sampled matches in that season **and in every later sampled season**. EPL 2009-10 is judged on its legacy copy. With n = 8-14, ≥95% means zero failures, so one bad match pushes a floor years later. Read this table together with the per-season table and the gates.

| Field | eng.1 | esp.1 | ita.1 | ger.1 | fra.1 |
|---|---|---|---|---|---|
| rosters both sides | 2001-02 | 2005-06 | 2001-02 | 2001-02 | 2003-04 |
| clean lineup (repaired) | 2002-03 | 2011-12 | 2008-09 | 2009-10 | 2012-13 |
| starter flags present | 2002-03 | 2005-06 | 2002-03 | 2005-06 | 2003-04 |
| sub clocks for every sub | 2001-02 | 2005-06 | 2008-09 | 2001-02 | 2003-04 |
| keyEvent goals = score | 2003-04 | 2008-09 | 2001-02 | 2001-02 | 2009-10 |
| stats[] for every used player | 2012-13 | 2008-09 | 2008-09 | 2009-10 | 2012-13 |
| stats[] G = score | 2012-13 | 2011-12 | 2010-11 | 2006-07 | 2012-13 |
| unused bench listed | 2001-02 | 2005-06 | 2001-02 | 2001-02 | 2005-06 |
| venue | 2001-02 | 2003-04 | 2006-07 | 2001-02 | 2005-06 |
| attendance > 0 | 2001-02 | 2008-09 | never | 2008-09 | 2012-13 |

### Per league-season (% of sampled matches)

- **dup-entry** = a roster lists some player twice.
- **collapsed-id** = every roster entry is the same athlete.
- **A per goal** = stats[] assists ÷ goals. Real leagues run about 0.70-0.80, so a lower ratio means assists are missing.
- **attendance** 0 means missing. Score vs scoreboard agreed in 100% of matches everywhere, so it isn't a column.

| League | Season | n | rosters | clean lineup | starter flags | dup-entry rosters | collapsed-id rosters | sub clocks | KE goals = score | dup sub events | stats[] all used | stats G = score | A per goal | venue | attendance |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| eng.1 | 2001-02 | 14 | 100 | 79 | 79 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.00 | 100 | 100 |
| eng.1 | 2002-03 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 93 | 0 | 100 | 93 | 0.48 | 100 | 100 |
| eng.1 | 2003-04 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.54 | 100 | 100 |
| eng.1 | 2004-05 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.60 | 100 | 100 |
| eng.1 | 2005-06 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 7 | 100 | 100 | 0.69 | 100 | 100 |
| eng.1 | 2006-07 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.75 | 100 | 100 |
| eng.1 | 2007-08 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.81 | 100 | 100 |
| eng.1 | 2008-09 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.59 | 100 | 100 |
| eng.1 | 2009-10 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 100 | 100 |
| eng.1 | 2009-10 legacy ids | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.63 | 100 | 100 |
| eng.1 | 2010-11 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.86 | 100 | 100 |
| eng.1 | 2011-12 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 50 | 50 | 0.40 | 100 | 100 |
| eng.1 | 2012-13 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.73 | 100 | 100 |
| eng.1 | 2013-14 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.75 | 100 | 100 |
| esp.1 | 2000-01 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 25 | 0 | 0 | 0 | - | 0 | 0 |
| esp.1 | 2001-02 | 14 | 100 | 86 | 86 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 100 | 79 |
| esp.1 | 2002-03 | 14 | 100 | 93 | 100 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 86 | 93 |
| esp.1 | 2003-04 | 14 | 100 | 93 | 100 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 100 | 100 |
| esp.1 | 2004-05 | 14 | 93 | 86 | 93 | 0 | 0 | 93 | 100 | 0 | 43 | 43 | 0.26 | 100 | 57 |
| esp.1 | 2005-06 | 14 | 100 | 93 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.55 | 100 | 0 |
| esp.1 | 2006-07 | 14 | 100 | 86 | 100 | 0 | 0 | 100 | 86 | 14 | 100 | 93 | 0.67 | 100 | 0 |
| esp.1 | 2007-08 | 14 | 100 | 93 | 100 | 21 | 0 | 100 | 93 | 7 | 93 | 93 | 0.68 | 100 | 43 |
| esp.1 | 2008-09 | 14 | 100 | 93 | 100 | 79 | 0 | 100 | 100 | 0 | 100 | 71 | 0.84 | 100 | 100 |
| esp.1 | 2009-10 | 8 | 100 | 100 | 100 | 63 | 0 | 100 | 100 | 0 | 100 | 88 | 0.69 | 100 | 100 |
| esp.1 | 2010-11 | 8 | 100 | 88 | 100 | 50 | 0 | 100 | 100 | 25 | 100 | 88 | 0.86 | 100 | 100 |
| esp.1 | 2011-12 | 8 | 100 | 100 | 100 | 13 | 0 | 100 | 100 | 0 | 100 | 100 | 0.57 | 100 | 100 |
| esp.1 | 2012-13 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.61 | 100 | 100 |
| esp.1 | 2013-14 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.74 | 100 | 100 |
| ita.1 | 2000-01 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0 | 0 |
| ita.1 | 2001-02 | 14 | 100 | 64 | 86 | 7 | 7 | 93 | 100 | 0 | 0 | 0 | - | 100 | 100 |
| ita.1 | 2002-03 | 14 | 100 | 86 | 100 | 7 | 7 | 93 | 100 | 0 | 0 | 0 | - | 93 | 93 |
| ita.1 | 2003-04 | 14 | 100 | 86 | 100 | 14 | 14 | 86 | 100 | 0 | 0 | 0 | - | 100 | 100 |
| ita.1 | 2004-05 | 14 | 100 | 71 | 100 | 29 | 29 | 71 | 100 | 0 | 0 | 0 | - | 93 | 100 |
| ita.1 | 2005-06 | 14 | 100 | 86 | 100 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 93 | 71 |
| ita.1 | 2006-07 | 14 | 100 | 86 | 100 | 0 | 0 | 100 | 100 | 0 | 71 | 71 | 0.49 | 100 | 29 |
| ita.1 | 2007-08 | 14 | 100 | 86 | 100 | 29 | 7 | 93 | 100 | 7 | 93 | 93 | 0.57 | 100 | 43 |
| ita.1 | 2008-09 | 14 | 100 | 100 | 100 | 57 | 0 | 100 | 100 | 0 | 100 | 86 | 0.81 | 100 | 100 |
| ita.1 | 2009-10 | 8 | 100 | 100 | 100 | 75 | 0 | 100 | 100 | 0 | 100 | 75 | 0.82 | 100 | 100 |
| ita.1 | 2010-11 | 8 | 100 | 100 | 100 | 50 | 0 | 100 | 100 | 0 | 100 | 100 | 0.71 | 100 | 100 |
| ita.1 | 2011-12 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.84 | 100 | 88 |
| ita.1 | 2012-13 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.72 | 100 | 100 |
| ita.1 | 2013-14 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.75 | 100 | 88 |
| ger.1 | 2000-01 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 0 | 0 |
| ger.1 | 2001-02 | 14 | 100 | 79 | 79 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 100 | 93 |
| ger.1 | 2002-03 | 14 | 100 | 86 | 100 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 100 | 100 |
| ger.1 | 2003-04 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 100 | 100 |
| ger.1 | 2004-05 | 14 | 100 | 93 | 93 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 100 | 86 |
| ger.1 | 2005-06 | 14 | 100 | 71 | 100 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 100 | 86 |
| ger.1 | 2006-07 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.82 | 100 | 7 |
| ger.1 | 2007-08 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 7 | 100 | 100 | 0.70 | 100 | 71 |
| ger.1 | 2008-09 | 14 | 100 | 79 | 100 | 14 | 0 | 100 | 100 | 14 | 93 | 100 | 0.68 | 100 | 100 |
| ger.1 | 2009-10 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.69 | 100 | 100 |
| ger.1 | 2010-11 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.74 | 100 | 100 |
| ger.1 | 2011-12 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.79 | 100 | 100 |
| ger.1 | 2012-13 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.71 | 100 | 100 |
| ger.1 | 2013-14 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.65 | 100 | 100 |
| fra.1 | 2000-01 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - | 50 | 0 |
| fra.1 | 2001-02 | 14 | 93 | 71 | 71 | 0 | 0 | 93 | 93 | 7 | 0 | 0 | - | 100 | 71 |
| fra.1 | 2002-03 | 14 | 93 | 93 | 93 | 0 | 0 | 93 | 93 | 0 | 0 | 0 | - | 100 | 86 |
| fra.1 | 2003-04 | 14 | 100 | 86 | 100 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 100 | 100 |
| fra.1 | 2004-05 | 14 | 100 | 79 | 100 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 93 | 100 |
| fra.1 | 2005-06 | 14 | 100 | 86 | 100 | 0 | 0 | 100 | 100 | 0 | 0 | 0 | - | 100 | 79 |
| fra.1 | 2006-07 | 14 | 100 | 93 | 100 | 7 | 0 | 100 | 100 | 0 | 93 | 93 | 0.74 | 100 | 7 |
| fra.1 | 2007-08 | 14 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.65 | 100 | 36 |
| fra.1 | 2008-09 | 14 | 100 | 100 | 100 | 14 | 0 | 100 | 93 | 0 | 100 | 100 | 0.58 | 100 | 100 |
| fra.1 | 2009-10 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.60 | 100 | 100 |
| fra.1 | 2010-11 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 13 | 100 | 100 | 0.52 | 100 | 100 |
| fra.1 | 2011-12 | 8 | 100 | 88 | 100 | 13 | 0 | 100 | 100 | 0 | 88 | 88 | 0.52 | 100 | 63 |
| fra.1 | 2012-13 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.76 | 100 | 100 |
| fra.1 | 2013-14 | 8 | 100 | 100 | 100 | 0 | 0 | 100 | 100 | 0 | 100 | 100 | 0.84 | 100 | 100 |

**How to read it:**
- **Rosters + keyEvents with clocks:** present from 2001-02 in four leagues; Ligue 1 is 93% until 2003-04.
- **Starter flags:** missing entirely in 14-29% of 2001-02 matches (all five leagues). In those matches, starters who weren't substituted look the same as unused subs: `APP` is 1 only for subs, and the 16-18-man roster includes the bench.
- **stats[] arrays:**
  - EPL: from 2001-02, but `A` is always 0 that season.
  - La Liga: partial in 2004-05 (43%), full from 2005-06.
  - Bundesliga: 2006-07.
  - Ligue 1: 2006-07 (93%), full 2007-08.
  - Serie A: 2006-07 (71%), 2007-08 (93%), full 2008-09.
- **EPL 2011-12:** only 50% of sampled matches have stat arrays. That's an assists hole in the middle of the modern era, a season before transfermarkt-datasets begins.
- **Unused bench:** listed in every league from 2001-02 (median roster 16 in the EPL to 2007-08, 18 elsewhere). There is no "only used players" era. The 16-man figure the last agent saw is the EPL's 11 + 5 named subs.

## 3. Known-answer gates

Every league match of each club-season was fetched, using the repaired lineup rules.
- **Apps** = starter or subbedIn.
- **Goals (keyEvents)** = scoring events whose first participant is the player, excluding `own-goal`.
- **Minutes** = from sub clocks, capped at 90.

The known answers come from the Wikipedia career tables and club season articles, plus BDFutbol for Messi's starts and minutes. A `?` marks a figure from an FBref search snippet or another weak source.

| Player | Club-season | ESPN matches | Apps ESPN / known | Starts ESPN / known | Goals keyEvents / stats[] / known | Pens KE / known | Assists stats[] / keyEvents / known | Minutes ESPN / known | athlete id |
|---|---|---|---|---|---|---|---|---|---|
| Lionel Messi | Barcelona 2004-05 | 38 (0 no roster) | 7 / 7 | 0 / 0 | 1 / 1 / 1 | 0 / - | 0 / 0 / - | 72 | 45843:Lionel Messi |
| Lionel Messi | Barcelona 2005-06 | 38 (0 no roster) | 17 / 17 | 11 / 11 | 6 / 6 / 6 | 0 / - | 2 / 0 / - | 915 | 45843:Lionel Messi |
| Lionel Messi | Barcelona 2006-07 | 38 (0 no roster) | 26 / 26 | 23 / 23 | 15 / 14 / 14 | 0 / - | 2 / 0 / - | 2005 | 45843:Lionel Messi |
| Lionel Messi | Barcelona 2008-09 | 38 (0 no roster) | 31 / 31 | 27 / 27 | 23 / 23 / 23 | 3 / - | 11 / 0 / - | 2517 / 2516 | 45843:Lionel Messi |
| Cristiano Ronaldo | Manchester United 2003-04 | 38 (0 no roster) | 28 / 29 | 14 / 15 | 4 / 4 / 4 | 0 / - | 4 / 0 / - | 1463 | 22774:Cristiano Ronaldo |
| Cristiano Ronaldo | Manchester United 2006-07 | 38 (0 no roster) | 34 / 34 | 31 / 31 | 17 / 17 / 17 | 3 / - | 14 / 0 / 8? | 2788 | 22774:Cristiano Ronaldo |
| Cristiano Ronaldo | Manchester United 2007-08 | 38 (0 no roster) | 34 / 34 | 31 / 31 | 31 / 31 / 31 | 4 / 4 | 7 / 0 / - | 2753 | 22774:Cristiano Ronaldo |
| Thierry Henry | Arsenal 2002-03 | 38 (0 no roster) | 37 / 37 | 37 / 37 | 24 / 24 / 24 | 0 / 3? | 23 / 0 / 20 | 3301 | 8039:Thierry Henry |
| Thierry Henry | Arsenal 2003-04 | 38 (0 no roster) | 37 / 37 | 37 / 37 | 30 / 30 / 30 | 7 / 7? | 9 / 0 / - | 3330 | 8039:Thierry Henry |
| Francesco Totti | AS Roma 2003-04 | 34 (1 no roster) | 30 / 31 | 30 / - | 19 / 0 / 20 | 6 / - | 0 / 0 / - | 2679 | 10293:Francesco Totti |
| Francesco Totti | AS Roma 2006-07 | 38 (0 no roster) | 35 / 35 | 35 / 35 | 26 / 24 / 26 | 5 / 5 | 9 / 0 / - | 3026 | 10293:Francesco Totti |
| Miroslav Klose | Werder Bremen 2005-06 | 34 (0 no roster) | 26 / 26 | 23 / 25? | 25 / 0 / 25 | 2 / - | 0 / 0 / 11/14/16 | 2059 | 10955:Miroslav Klose |
| Franck Ribéry | Marseille 2006-07 | 38 (0 no roster) | 25 / 25 | 25 / 25? | 5 / 5 / 5 | 0 / - | 8 / 0 / 8? | 2167 | 42968:Franck Ribéry |

**Every discrepancy, named:**
- **Ronaldo 2003-04: 28/29 apps, 14/15 starts.** Five Man Utd rosters omit him: 2003-12-28 at Middlesbrough, 2004-01-07 at Bolton, 2004-01-11 v Newcastle, 2004-03-28 at Arsenal, 2004-05-01 at Blackburn. All five are internally consistent (11 starters, subs match events, 16 listed), so one of them silently lists another player in place of a start he made. No internal check can catch this. Wikipedia's season page has scorers only, so I couldn't identify which match.
- **Totti 2003-04: 30/31 apps, 19/20 goals.** Both come from one match, Bologna v Roma (2003-11-23), whose roster has collapsed: every entry is one athlete. Its keyEvents still credit Totti's 16' goal (19 + 1 = 20), but his appearance can't be recovered.
- **Messi 2006-07: keyEvents give 15 goals against 14.** Sevilla v Barcelona (2006-10-15) has every goal event duplicated, and Messi's appears at 80' and again at 81', so a clock-based dedupe fails. stats[] G (14) is right. The rule: when keyEvent goals exceed the final score, reconcile to the score or to stats[] G.
- **Totti 2006-07: stats[] G = 24 against 26.** stats[] shows G=0 in two matches where keyEvents have his goals (Chievo 2006-10-22, Ascoli 2006-10-25). keyEvents are the better goal source; stats[] arrays are sometimes incomplete.
- **Klose 2005-06: 23 starts against "25?".** The known figure is an unconfirmed FBref snippet; apps (26) and goals (25) match. The 2005-06 Bundesliga has no stat arrays, so ESPN has no assists for his 11/14/16-assist season.
- **Henry 2002-03: 0 penalties typed against 3.** The 2002-03 EPL has no `penalty---scored` events at all (0 of 153 cached goals; 2003-04 has 16 of 226). His goal total is right. Henry 2003-04: 7/7 penalties.
- **Assists:** Ribéry 8 = FBref 8. Henry 2002-03 has 23 against the 20 cited on Wikipedia, so EPL 2002-03 assists can overcount for a player even while the league-wide ratio (0.48) shows undercounting. Messi 2005-06/06-07 have 2 and 2. Every other ESPN assist figure is reported without a solid known answer; a transfermarkt or FBref check is still needed.
- **No own goal was credited to a player, and no goal to the wrong team or player,** once `own-goal` events are excluded.

Minutes are close where checkable: Messi 2008-09 ESPN 2,517 against BDFutbol 2,516.

## 4. Oddities

1. **Own goals.** `type.type = "own-goal"`. `team` is the side that **benefits**, but `participants[0]` is the defender who scored it (e.g. Gary Speed of Newcastle on a Tottenham event). A naive "first participant scored" count credits him a goal. stats[] has a separate `OG` key, and the team's stats[] G excludes own goals.
2. **Penalties.** `penalty---scored` (scoringPlay true), `penalty---saved` and `penalty---missed` (scoringPlay false). Typing is missing for whole seasons: EPL 2002-03 (0 of 27 sampled goals) and 2009-10 (0 of 33). Other goal types are `goal`, `goal---header`, `goal---free-kick` and `goal---volley`. Count goals with `scoringPlay`, never by type name.
3. **Assister in keyEvents** (`participants[1]` on goals) appears only from 2011-12 in all five leagues. Earlier assists exist only in stats[] `A`.
4. **Unused bench** is listed in every league and season from 2001-02.
5. **Duplicate roster entries** (subs listed twice, or bench flagged as starters) affect 50-79% of 2008-10 La Liga and Serie A matches and 14-29% of some other seasons. They're repairable with the three rules in §2.
6. **Collapsed rosters (Serie A, 2001-02 to 2007-08):** 7-29% of sampled matches per season have every roster entry carrying one athlete id and name (e.g. all 18 Bologna entries are "Fausto Rossini" #196222 in event 14151). The keyEvents in those matches are fine. This is the main reason Serie A appearances are unreliable before 2008-09.
7. **Residual lineup errors** after repair (8-10 or 12-13 starters, a 9-and-6-man Ligue 1 roster) run a few percent per season until about 2011-12. They're detectable but not fixable from the summary alone.
8. **Duplicate keyEvents** (the same sub or goal twice, sometimes a minute apart) affect 0-25% of matches. Dedupe subs by the (in, out) pair, and reconcile goals to the score.
9. **Athlete ids never rename but often split.** In 31,803 roster entries, no id ever carried two names. But 185 name-plus-club pairs carry two or more ids (Tarnat at Hannover 13464/85186, Smolarek at Dortmund, Craddock at Wolves, Cousin at Lens). In 22 cases both ids appear in the same season (Juanito at Betis, Claudio López at Lazio, Möller at Frankfurt). Most second ids fall in the 50-100k range, which suggests a re-ingest around 2006. A career ledger needs an id-merge table.
10. **displayName collides** for real homonyms (Paul Robinson ×2, Edu ×3, Juanfran ×3, Anderson, Rafael, Paulinho, Luis García). 389 names carry more than one id, so key on id plus merge table, never on name.
11. **Stable star ids:** Ronaldo is 22774 for Man Utd 2003-04 and 2007-08 and Real Madrid 2009-11. Messi is 45843 from 2004-05 through 2013-14 (checked 2014-03-02 v Almería).
12. **Postponed fixtures appear twice.** The postponed row stays under its own event id, and the played match gets a new id. EPL 2005-06 has 115 "postponed" rows, every pairing of which was also played (e.g. "Newcastle at Arsenal 2005-08-13 POSTPONED"). These are ghost fixtures, not real postponements. Filtering to played statuses removes them all.
13. **EPL 2009-10 exists twice.** The legacy copy (ids ~270k, correct slug) has 357 matches with full data. The complete re-ingest (ids ~678k, filed under the 2013-14 slug) has 380 matches, **no rosters, and keyEvents from an unrelated match**: event 678280 "Hull City at Chelsea" returns a Rangers v Hearts sub-and-goal list. So 23 EPL 2009-10 matches have no lineup source in ESPN. Generally, a ledger must check that keyEvent `team.id`s match the header competitors.
14. **Mixed competitions.** No cup matches were found under league slugs (team counts are exactly 18 or 20 in every season). The intruders are relegation playoffs (the Bundesliga's under their own slug, Serie A's 2004-05 one inside the league slug) and one garbage 2001 row, "Energie Cottbus at Boca Juniors" (SCHEDULED). 2001-02 has a few league matches mislabelled `STATUS_FINAL_AET`.
15. **Attendance** is 0 (missing) in most 2005-07 La Liga, Bundesliga and Ligue 1 matches, and in many Serie A ones through 2007-08. Venue is near-complete from 2001-02.
16. **2000-01 is unusable.** There are no rosters in any sampled match, in any league.

## 5. Recommendation

| League | Apps + goals ledger buildable from | Assists from | Caveats |
|---|---|---|---|
| Premier League | **2002-03** (2001-02: 21% of matches lack starter flags) | **2005-06** (stats[] from 2002-03, but A per goal is 0.48-0.60 until 2004-05) | 23 matches missing in 2009-10; stats[] (assists) half missing in 2011-12; penalty typing patchy |
| La Liga | **2002-03** (2001-02: 14% lack starter flags) | **2005-06** (2004-05 43%) | Duplicate-entry repair needed 2007-11; A per goal 0.55-0.68 until 2008-09 |
| Serie A | **2008-09** clean; 2005-06 usable with risk (0 collapsed in the 2005-07 sample, 7% in 2007-08); goals alone from 2001-02 via keyEvents | **2008-09** (2007-08 93%) | Collapsed rosters 2001-05 cost 1-4 apps per player-season |
| Bundesliga | **2002-03** (2001-02: 21% lack starter flags) | **2006-07** | |
| Ligue 1 | **2003-04** (2002-03 rosters 93%) | **2007-08** (2006-07 93%) | |

**Beachhead: 2002-03.** The comparator's core claim is "goals through N appearances", and that is buildable, and gate-verified, from 2002-03 in England, Spain and Germany. Ligue 1 and Serie A lag. Starting there captures:
- Henry's peak (24 and 30 goals, exact),
- all of Ronaldo's Man Utd years (2003-09, within 1 app),
- Messi from his debut (exact).

The costs:
- **Assists are a sparse layer.** They appear 2005-06 (EPL, La Liga), 2006-07 (Bundesliga), 2007-08 (Ligue 1) and 2008-09 (Serie A), and the page has to print these floors the way the NFL site prints its floors.
- **Serie A 2002-05 apps carry a known error.** Collapsed rosters lose about 1 in 7 to 1 in 4 matches, so Totti and Shevchenko lose an app or several per season. Either show Serie A from 2005-06, or fill those matches from another source.
- **Ligue 1 starts a season late** (2003-04).

**The alternative is 2008-09:** every league has clean lineups, stats[] arrays and assists. But it drops Henry entirely, Ronaldo's Man Utd peak (the 42-goal 2007-08 season), Messi's first four seasons, and Totti's 2006-07 Golden Boot. A "first 100 appearances" comparator starting there can't do Messi v Ronaldo from debut, the marquee query. I'd take 2002-03 with printed per-league floors and the three lineup repairs. The one decision for Drew is whether Serie A's ledger starts at 2002-03 with a "±1-4 apps" flag or at 2005-06.

**Before harvesting:**
1. Build the id-merge table (same name + same club + adjacent seasons, then hand-check).
2. Add the header-team check on keyEvents.
3. Reconcile keyEvent goals to the score.
4. Re-run the gates against transfermarkt-datasets for 2012-13 and 2013-14 (overlap season-level goals and apps for every player), which can confirm the residual 2-5% error rate at scale.
5. For the 23 missing EPL 2009-10 matches and the collapsed Serie A rosters, probe whether `sports.core.api.espn.com` event rosters differ. That wasn't done here.

## Scripts (research/espn/)

| File | What it does |
|---|---|
| `enumerate.mjs` | Year scoreboards → `out/index.json` (75 requests) |
| `season-index.mjs` | Date-based season assignment, slug merging, played-status filter, EPL 2009-10 legacy split |
| `sweep.mjs` | Coverage sample → `out/sweep-sample.json`, fetches summaries (807) |
| `inspect.mjs` | Per-match record with the lineup repair rules |
| `analyze.mjs` + `floors.mjs` | Cache-only aggregation → `out/coverage-table.md` and the floors table |
| `gate.mjs` | `fetch` (463 requests) and `report` (cache-only) for the 13 club-seasons |
| `identity.mjs` | displayName/id collision and split analysis |
| `cache-read.mjs` | Reads the helper's cache without fetching (safe beside a running sweep) |
| `ledger.mjs` | Appends each run's uncached count to `requests.log` |
| `probe-*.mjs` | One-off probes (enumeration forms, summary schema, Messi id 2013-14) |

Request log (`requests.log`): enumeration/schema probes 6, enumeration 74, sweep 807, gates 463, Messi id probes 2. **Total 1,352.**
