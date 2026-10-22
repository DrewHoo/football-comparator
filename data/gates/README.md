# Known-answer gates

Every viral factoid the site is asked to reproduce, written as a query the engine can run and the numbers the publisher printed. The rule (from the comparator reference): "Add a gate for every factoid the site is asked to reproduce, with the publisher's definition noted where it differs." A mismatch is information, not something to patch: the gate pins one publisher's number, names that publisher, and the Method section says why we differ.

| File | What |
|---|---|
| `factoids.json` | Player claims: corpus Part A #1-17 and #19-22, with #7 split into one gate per N. Also added: Van Nistelrooy's 2002-03 UCL, Ronaldo's PL career per premierleague.com, and Dunne's own goals and red cards. `excluded[]` lists what no ledger can reproduce (#18 Ballon d'Or, and two unverified claims) |
| `team-factoids.json` | Team claims (#23-35, #35 split in two), four record-book extras, and the `team_ledger` block that defines the team-season stats and runs |
| `club-seasons.json` | 13 league club-seasons (espn-coverage-leagues.md §3) and 5 UCL club-seasons (espn-coverage-ucl-intl.md), with known, probe and expected-after-repair figures |

Sources: `research/factoids-and-conventions.md`, the two ESPN coverage probes, `research/beachhead.md`. Three numbers were re-checked by WebFetch on 2026-10-21:
- the UEFA first-N-games article, which gave the full runner-up lists;
- Wikipedia's Shearer table (2002-06 by season);
- Wikipedia's Haaland table (35 apps in 2022-23), plus the Analyst Wolves pages.

## Schema (one gate)

```jsonc
{
  "id": "haaland-fastest-100-pl",       // stable; tests reference it
  "corpus_ref": "A1#1",                  // row in factoids-and-conventions.md, or "probe: ..."
  "claim": "...",                        // as published
  "publisher": "...", "url": ["..."],
  "claim_date": "2025-12-02",            // when the claim was made
  "as_of": "2025-12-02",                 // cut the ledger here before evaluating (live careers drift)
  "scope": {                             // what the PUBLISHER counted
    "competitions": ["eng.1"], "label": "...",
    "publisher_era_floor": "1992-93",
    "qualifiers": "excluded|included|unstated|n/a",
    "stages": "league|proper|finals|..."
  },
  "query": {                             // the five slots, what OUR engine runs
    "who":    { "kind": "player|team", "unit": "careers|player-seasons|team-seasons|team-runs|team-matches" },
    "stat":   { "stat": "goals" }        // or { "test": [{ "stat": "goals", "min": 1 }] } / { "test": [{ "result": ["D","L"] }] }
    "how":    { "agg": "sum|count|streak|reach|youngest-reach|rate|value", "target": 100, "dir": "most|fewest|earliest" },
    "window": { "seq": "apps|starts|caps|season|seasons|team-games-of-season|team-league-games|calendar-year|tournaments",
                "n": 111,                 // prefix N; null = free (the board is ranked at every N)
                "span": "any", "crosses_seasons": true, "age": true },
    "field":  { "competitions": ["eng.1"], "qualifiers": false, "since": "1992-93", "label": "PL all-time" },
    "variants": [ /* the same query with one slot switched, e.g. qualifiers on */ ]
  },
  "unit": "PL appearances (starts plus sub appearances)",
  "entities": [{ "name": "...", "espn_id": 45843, "dob_needed": true, "dob": "1987-06-24" }],
  "assertions": [{
    "role": "headline|previous-holder|runner-up|context|partial|derived",
    "subject": "Erling Haaland", "kind": "reach|value|age|rank|run|first-n|clinch|team-season|visible-sum|visible-leader|visible-top|count",
    "n": 111, "season": "2022-23",
    "expected": 111,                     // number, "24y 284d", or an object of team-season stats
    "alt_expected": { "value": 141, "publisher": "ESPN" },   // a second publisher's figure, never asserted
    "rank": 1,                           // competition rank: 1, "T3"
    "checkable": "full|partial|no", "why": "...", "source_note": "UNVERIFIED|derived|..."
  }],
  "ledger_view": { "can_see": "...", "cannot_see": "..." },
  "era_wall": "reproducible-in-full|reproducible-partial|not-reproducible",
  "status":   "reproducible-in-full|reproducible-partial|not-reproducible|publisher-definition-differs",
  "status_reason": "...",
  "definition_diffs": ["ucl-qualifiers", "..."],   // keys into the list below
  "needs_dob": true
}
```

Competition codes are ESPN slugs (`eng.1`, `esp.1`, `ita.1`, `ger.1`, `fra.1`, `uefa.champions`, `uefa.champions_qual`). `career-basis` means the Opta/ESPN career basis described in AGENTS.md, which v1 does not carry.

### Units

- **Appearance:** the player started (`starter && !subbedIn`, and `APP = 1` where stats exist) or came on. Sub appearances count. This is the unit for "first N games" and "fastest to M", matching premierleague.com, Opta and UEFA.
- **Start:** a separate sequence. No factoid in the corpus uses it, and the discourse never does.
- **Match** (team): a played league fixture with status FT, AET or abandoned.
- **Age:** whole years plus days since the last birthday, on the match date. "24y 10m 29d" and "24y 333d" are the same day (Mbappé), not a disagreement.

## How a gate runs

One engine, one function: `evaluate(query, { asOf })` returns the board, meaning the field ranked by the value at N. It also returns the rows still inside their window and `gapped`, the count of entities that sat out because their window starts before the ledger floor. A gate test then does three things:

1. Truncates the ledger at `as_of`, and applies `variants` when an assertion names one.
2. For each assertion with `checkable: "full"`, finds the subject's row and compares `expected` (and `rank` if given) exactly. Minutes have a stated tolerance (Messi 2008-09 ±1). `reach` compares the ordinal at which the running sum first reaches `target`. `youngest-reach` compares age at that match. `visible-*` assertions compare the board as our ledger sees it, which can legitimately differ from the publisher's (UCL first 70: UEFA names Van Nistelrooy 55, our board names Kane 54 and says "since 2002-03").
3. Skips assertions marked `checkable: "partial"` or `"no"`, but prints them, so the gate report lists every number we can't see and why. A `partial` assertion with a `visible-sum` expected value (Shearer: 132 apps, 56 goals over 2002-06) is asserted. A `partial` assertion with `expected: null` is computed and recorded only, because no publisher figure exists for that slice.

`club-seasons.json` runs the same way: for each row, sum the ledger's matches for (espn_id, club, competition, season) and compare `expected_after_repair` on `gate_fields`. Rows whose probe figure differs from the known figure name the repair or correction that closes the gap. Until that lands, the gate fails, as it should.

Like the NFL and WNBA sites, `src/lib/query.test.ts` should load these files, and `scripts/gate.mjs` should print the same comparisons as a table.

## Status

`era_wall` is always one of three values. These are the era-wall statuses:

- **reproducible-in-full:** every number the claim states, including its comparisons, lies inside the ledger, or the publisher's own list shows nothing pre-floor could change it. Examples: Derby's 11, whose published bottom five are all post-2002; Arsenal's 49, which starts 2003-05-07, inside the 2002-03 floor season.
- **reproducible-partial:** the headline number is visible but some of the claim isn't. Usually the previous holder or the "ever" comparison is pre-2002, as with Shearer's 124 or Müller's 40. Or the career straddles the floor, as with Shearer's 260, where only 2002-06 is visible and that partial sum is gated. The board prints the gapped count and never shows a number for a window it can't fully see.
- **not-reproducible:** the claim needs a competition or stat v1 doesn't carry: club plus country careers, internationals, World Cups, Euros, cups, awards. A computable slice may be recorded with `expected: null`.

`status` equals `era_wall` unless the headline number only matches under a definition that differs from our default basis. In that case it is **publisher-definition-differs**, and `status_reason` says how: Opta assists for Salah's 47 and Ronaldo's 37, or "earliest" by date versus by games remaining for Southampton. `definition_diffs` is filled in on every gate, whatever its status.

## Publisher-definition differences the Method section must print

These are the keys used in `definition_diffs`. The first eight are required; the rest came up while writing the gates.

1. **`pl-era-vs-top-flight`.** "Premier League" records start in 1992-93; "English top flight" records start in 1888-89, and the two often name different holders. Most defeats: Southampton 30 (PL) vs Stoke 31 (1984-85). Winless start: Wolves 19 vs Bolton 22 (1902-03). Four titles in a row is framed on top-flight history. Our ledger sees neither book before 2002-03.
2. **`ucl-qualifiers`.** UEFA's and Opta's UCL figures exclude qualifiers. UEFA publishes both tables: Ronaldo 140 without qualifiers, 141 with. Van Nistelrooy's 2002-03 is 12 without and 14 with (Wikipedia's Europe column). The UEFA first-N article doesn't say which it uses; we assume excluded. Qualifiers stay in the ledger, flagged by `/qualif|play-?off/i` (and `uefa.champions_qual` from 2020-21).
3. **`42-game-seasons`.** 1992-93 to 1994-95 had 42 games. Cole's and Shearer's 34 goals, their 47 involvements, and Swindon's 100 conceded all came in 42 games. Publishers write "in a 38-game season" or compare per-game rates, and the site must too. All three seasons are pre-floor for us.
4. **`earliest-by-date-vs-games-remaining`.** By calendar date, Derby's 29 Mar 2008 is still the earliest relegation. By games remaining, Southampton 2024-25 (7 left) holds it. Liverpool's 2019-20 title record is by games remaining (7), not date, because of the 2020 suspension. The comparator's "fastest" means games.
5. **`appearances-include-subs`.** The unit is appearances, including sub appearances (premierleague.com shows "10 (6)"), never starts. "Fastest to M" counts appearances in that competition only.
6. **`opta-assists`.** Publishers quote Opta assists. Our only assist source is ESPN stats `A`, which is reliable only from per-league floors: PL and La Liga 2005-06, Bundesliga 2006-07, Ligue 1 2007-08, Serie A 2008-09, UCL 2006-07. It can still differ from Opta: Henry 2002-03 is 23 vs 20, and Ronaldo 2006-07 is 14 vs 8 (weak source). EPL 2011-12 stat arrays are half missing.
7. **`arab-club-champions-cup`.** A UAFA competition FIFA doesn't recognise. Transfermarkt excludes it and ESPN and Sofascore include it, which swings Ronaldo's total by 6 (961 vs 967 in April 2026).
8. **`youth-caps-and-b-teams`.** The career basis (Opta, ESPN, messivsronaldo.app: Ronaldo 981, Messi 936) excludes reserve and B teams, youth internationals and club friendlies. RSSSF includes youth (994 = 976 senior + 18 youth). Wikipedia's international career-total row includes youth sides (268/164). Opta explicitly drops Ronaldo's 2 Sporting B appearances.
9. **`publisher-count-disagreement`.** Two publishers give different counts for the same event. Henry's 100th PL goal: Opta says game 160, ESPN 141. Kane's 100th Bundesliga goal: AFP says game 98 (previous holder 129), another report 99 (123). The gate pins one figure and names its publisher, and `alt_expected` keeps the other.
10. **`run-span-dates`.** GWR starts Ronaldo's 11-match UCL scoring run on 29 Sep 2017. UEFA starts it at the 2017 final, and only UEFA's span gives 11.
11. **`calendar-year-competitive-only`.** Messi's 91 in 2012 counts competitive club and country matches. The 5 friendly goals are excluded.
12. **`clinch-moment`.** A title or relegation is often clinched by another team's result (Leicester 2016, Liverpool 2020). "Games left" means the clinching team's own remaining fixtures at that moment, computed on points only (no GD), as the publishers do.
13. **`points-deductions`.** The table can differ from points won on the pitch: Portsmouth 2009-10 -9, Everton and Nottingham Forest 2023-24. Positions and points gates use table points, and a corrections file holds the deductions.
14. **`english-tiers-1-4`.** Leicester's record covers England's top four tiers, a field the ledger doesn't carry.

## Dates of birth and ESPN ids

The ledger must carry date of birth for every player, not only gated ones, because a youngest-to board ranks the whole field. The gates that need it:
- Messi youngest to 50 UCL goals (24y 284d, 66 games);
- Mbappé's 300 goals before age 25 and his 50 UCL goals at 25y 356d;
- Ronaldo's 50th UCL goal at 28y 78d;
- Yamal, youngest La Liga scorer (16y 87d, the previous record Olinga's 16y 98d) and youngest Euros scorer.

DOBs given in `entities` were derived from the publisher's age plus the match date, and they agree with Wikipedia. Olinga's is still needed.

ESPN athlete ids recorded by the probes: Messi 45843, Ronaldo 22774, Henry 8039, Totti 10293, Klose 10955, Ribéry 42968. Every other `espn_id` is `null`, to be filled from the ledger's id-merge table. Key on id plus merges, never on name: 185 name-plus-club pairs carry two or more ids, and 389 display names are homonyms.

## Counts (2026-10-21)

| File | in-full | partial | not-reproducible | definition-differs | total |
|---|---|---|---|---|---|
| factoids.json | 5 | 20 | 6 | 2 | 33 |
| team-factoids.json | 7 | 10 | 0 | 1 | 18 |
| club-seasons.json | 18 rows. 14 pass on the probe as is. 4 need a named repair or correction: Messi 2006-07 (goal dedupe), Ronaldo 2003-04 and Totti 2003-04 (corrections), Messi UCL 2005-06 (APP rule and collapsed roster) | | | | 18 |
