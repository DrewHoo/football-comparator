# The compact ledger and the team ledger

The last pipeline stage. It turns the long ledger (`data/ledger/*.jsonl`, `pipeline/docs/ledger.md`) and the international ledger (`data/ledger/intl/`, `pipeline/docs/intl.md`) into the files the site downloads. It also derives the team-season stats the team boards and the team gates need.

```sh
node pipeline/build-teams.mjs                                    # team ledger -> data/ledger/teams/*, then the team gates (~0.5 s)
node pipeline/build-teams.mjs --gate                             # team gates only; exit 1 on a FAIL
node --max-old-space-size=8000 pipeline/encode-ledger.mjs        # every compact file + round trip + sizes -> data/ledger/compact/ (~25 s)
node pipeline/encode-ledger.mjs --no-intl                        # club files only (skips the 470 MB intl read)
node --max-old-space-size=8000 pipeline/encode-ledger.mjs --project   # also a synthetic full-scope Premier League file, to check the size projection
node --max-old-space-size=8000 pipeline/encode-ledger.mjs --gate      # decode the files on disk and run every gate through them; exit 1 on a FAIL
node --test pipeline/lib/ledger/compact.test.mjs                 # team rules, delta coding, 2,000-row round trips (club and intl)
```

Nothing here fetches. The inputs are files on disk: `matches.jsonl`, `player-matches.jsonl`, `ordinals.jsonl`, `id-merge.json` and `build.json`, plus `intl/player-matches.jsonl`, `intl/players.json` and `data/corrections/teams.json`. Rerun after every `build-ledger.mjs` or `build-intl.mjs` run. Every output is rebuilt from scratch.

Code (`pipeline/lib/ledger/`):

| File | What |
|---|---|
| `team.mjs` | team-match rows, team-season tables, positions, clinch moments, runs (pure functions) |
| `team-gates.mjs` | the team gates (`data/gates/team-factoids.json`) over any match rows |
| `encode.mjs` | the layouts (`COLS` and the other `*_COLS`), floors, `encodeClub`, `encodeIntl` |
| `decode.mjs` | the reference decoder; `src/lib/ledger.ts` should be a port |
| `roundtrip.mjs` | decoded vs long, field by field |
| `evaluate.mjs` | a minimal evaluator (sum, first-N, fastest-to, youngest-to) for the club-season and factoid gates |
| `compact.test.mjs` | tests |

## Teams

The index scores every match whether or not its summary is cached, and `matches.jsonl` carries those scores. So the team ledger is full-scope today (48,994 matches, 2002-03 to 2026-27 so far), even though the player rows cover only the cached summaries. Every row in `matches.jsonl` counts as played. The index has already dropped ghost postponements and relegation playoffs. The 15 rows with a non-final status are all `stuck: true` matches that were played, such as La Liga's 2023-02-11 round, which is still `STATUS_SCHEDULED` with real scores. Every team in every league-season has the same match count, except Ligue 1 2019-20 (COVID: Strasbourg v PSG never played, and the table used points per game).

Outputs in `data/ledger/teams/`:

- **`team-matches.jsonl`**: one row per team per match: `comp` (league slug, `uefa.champions`, or `uefa.champions:qual`), `season`, `teamId`, `tgn`, `home`, `oppId`, `GF`, `GA`, `result`, `pts` (3-1-0), `cum {P,W,D,L,GF,GA,pts}`, and `pos`/`tied`.
  - `cum.pts` is table points (after any deduction in force on that date).
  - `pos` is set only after a matchday where every team in the league-season has played the same number of matches; otherwise null. That is about 57% of Premier League rows (10,420 of 18,380), because postponements leave many rounds uneven.
- **`team-seasons.jsonl`**: one row per team per competition-season:
  - `P W D L GF GA GD`, `pointsOnPitch`, `deduction`, `points`, `pos`, `tied`
  - `margin` (the champion's points over second)
  - `winlessStart` (matches before the first win)
  - `titleClinch` and `relegationClinch` (`{gamesLeft, date, matchId}`), and `complete`
- **`runs.jsonl`**: every maximal run of length 3 or more, per team per competition, crossing seasons and skipping seasons spent outside the competition.
  - Tests: `unbeaten`, `winless`, `losing`, `winning`, `scoring`, `scoreless`, `home-lost-scoreless` (home games only).
  - Each run carries `from`/`to`, its split by season, and W/D/L/GF/GA inside it.
  - `ongoing`: it includes the team's last match.
  - `truncated`: it starts at the team's first match in the competition's first ledger season, so it may have begun before the floor. Rank boards leave truncated runs out.
- **`gates.json`**: the team gate results.

Rules (from `team_ledger` in `data/gates/team-factoids.json`):

- **Result:** from the score after 90 or 120 minutes. A shootout is a draw.
- **Table order:** table points first, then the league's tie-break (`TIEBREAK` in `team.mjs`).
  - Premier League, Bundesliga and Ligue 1: GD, then GF.
  - La Liga and Serie A: head-to-head points, then head-to-head GD, over the tied teams' matches so far; then GD and GF.
  - Teams equal on every key share the position (`tied`). Only the Premier League is gated.
- **Title clinch:** after the last match at a kickoff time, no rival's maximum reaches the leader's points. GD is ignored, as the publishers do.
- **Relegation clinch:** at least (teams − relegation places) other teams have more points than this team's maximum.
  - Relegation places are set only for the Premier League (3). The other leagues' places changed by season (play-offs, 18-team years), and they are left out rather than guessed.
- **Calendar-date rank:** month and day within the season (July = 0). So 29 March 2008 beats 30 March 2019, whatever the leap years, and COVID's July 2020 relegations count as month 12.

### Team corrections (`data/corrections/teams.json`)

Empty for now. Two lists:

- `deductions`: `{ id, added, slug, season: "2009-10", teamId, team, points, from: "YYYY-MM-DD" | null, source: { publisher, url, quote }, note }`.
  - Applied to the table from `from`. Null means the whole season.
  - Positions, `cum.pts`, clinches and `points` all use table points. `pointsOnPitch` never changes.
  - Portsmouth 2009-10 (−9), Everton 2023-24 (−10, cut to −6 on appeal, then −2 more) and Nottingham Forest 2023-24 (−4) belong here, each with the date the table first showed it. Pin which figure each gate's publisher uses.
- `results`: `{ id, added, matchId, homeScore, awayScore, reason, source }`. This replaces the index score of an awarded or overturned match.
  - Abandoned rows come through with the score ESPN has: Como v Udinese 2002-12-18, Betis v Athletic 2008-03-15, Bastia v Lyon 2017-04-16, Nantes v Toulouse 2026-05-17. Each needs a check against the awarded result before a gate depends on it.

### Team gates (all on 2026-10-21)

Every gated season has scores in the index, so every team gate runs: 49 of the 50 `checkable: "full"` assertions pass, 1 is recorded (Arsenal's W/D split: 36 W, 13 D), and 12 are not checkable in full and are printed only. Highlights:

- Arsenal 49 unbeaten runs 2003-05-07 to 2004-10-16 (2 + 38 + 9 across three seasons), rank 1.
- Sunderland's 20 straight defeats split 15 at the end of 2002-03 and 5 at the start of 2005-06. Their 26-match winless run is rank 2.
- Derby: 11 points, a 32-match winless run (ongoing), relegated 29 March 2008 (earliest by date).
- Southampton 2024-25: relegated with 7 games left, 30 losses.
- Man City 2017-18: 100 points, 18 straight wins, margin 19. Liverpool 2019-20: title clinched 25 June 2020 with 7 left.
- Leicester 2015-16: title with 2 left, margin 10. City's four titles in a row. Wolves 2025-26: 2 points from 18, 19 winless, first win in game 20.
- The visible 9-0 count is 3.

The one FAIL is the gate's cut date, not the ledger:

- `leicester-8-home-losses-no-goal` has `as_of` 2025-06-30, by which date the run had become 9 (GA 22), the "later extension" in the gate's own context assertion.
- Cut at 2025-04-19 (after the 8th defeat on 04-07, before the 9th on 04-20), the ledger gives exactly 8 and GA 21.
- The gate's `as_of` should be the claim date.

## The compact files (`data/ledger/compact/`)

One file per competition: `eng.1.json`, `esp.1.json`, `ita.1.json`, `ger.1.json`, `fra.1.json`, and `uefa.champions.json` (which includes the `uefa.champions_qual` slug and the flagged qualifiers). Plus `intl.json`, `manifest.json` (sizes, counts, projection, round-trip result) and `gates.json` (from `--gate`).

### Conventions

- Every table is `{ cols: [...], data: [col0[], col1[], ...] }`. That is column-major: one integer array per column. It gzips about 40% better than the siblings' row arrays. The decoder looks columns up by name, so adding or reordering a column is safe and a missing one throws.
- Strings are stored once in `strings`. A string column holds the string's index.
- Null is −1 in every column, since every real value is ≥ 0. Booleans are 0/1. `result` is 2 won, 1 drawn, 0 lost (the WNBA convention). Dates are `ymd` (YYYYMMDD) plus `hm` (HHMM UTC kickoff, −1 when unknown).
- **Deltas.** The columns listed in `deltas` are stored as the step from the previous row of the same entity; an entity's first row is absolute. These are club `m` and `cApp`, and intl `app`. Only never-null columns are delta-coded, so a negative value is a real step down: UCL `cApp` interleaves proper and qualifier numbering.
- **Ordering.** Rows are sorted by entity, then date. A player's career is one contiguous slice, and `entities.rows` is its length. Entities are ordered by row count, descending.

### Club file

| Key | What |
|---|---|
| header | `v` (1), `kind: "club"`, `comp`, `label`, `builtAt`, `source` (the long ledger's builtAt, rules version, merge table, summaries built), `firstSeason`, `lastSeason`, `floors`, `deltas`, `runMin` (3), `counts` |
| `floors` | first season (start year) where each stat is reliable: `{ apps, starts, minutes, goals, assists, labels: { assists: "2005-06", ... } }`, so the engine can print "assists since 2005-06" |
| `seasons` | per competition-season: `slug, season, matches, cached, stats` (matches with stat arrays), `assists` (−1 uncached, 0 no stat arrays, 1 below the floor, 2 partial stat arrays, 3 reliable), `pens` (1 typed, 0 untyped = null, −1 unknown) |
| `entities` | `id` (post-merge ESPN athlete id), `name` (the most frequent spelling), `born`, `nat`, `pos` (placeholders: −1 until the DOB/nationality/position layer lands), `rows` |
| `teams` | `id` (ESPN team id), `name` (latest) |
| `matches` | every match of the competition, cached or pending: `id, slug, season, ymd, hm, home, away` (team indexes), `hs, as, shH, shA`, `status, stage, round, seasonSlug` (strings), `qualifier, stuck, summary, extraTime, stats, keyEvents, goalsReconciled, quality, assistsReliable`, `tgnH, tgnA` |
| `rows` (`COLS`) | one per appearance: `e` (entity), `m` (match), `home, started, subIn, subOff, sentOff, min, goals, pens, og, ast, yc, rc, result`, then the ordinals: `cApp, cStart, cSeason` (within the competition: league, UCL proper or UCL qualifiers), `app, start, aSeason` (across every league and UCL-proper match in the ledger; null for qualifiers) |
| `alias` | sparse `[row, espnId]` where the roster used an id the merge table folded away (722 rows) |
| `nameAlt` | sparse `[row, string]` where the match listed a spelling other than the entity's (36 athletes) |
| `teamMatches` | `m, side` (0 home, 1 away), `tgn, pos, tied`. The decoder recomputes GF/GA/result and the running P/W/D/L/GF/GA/points |
| `teamSeasons` | `t, comp, season, P, W, D, L, GF, GA, pitch, ded, pts, pos, tied, margin, winlessStart, titleLeft, titleM, relLeft, relM, complete` (`*M` = match index of the clinch) |
| `runs` | `t, comp, test, len, from, to` (match indexes), `W, D, L, GF, GA, ongoing, truncated`; runs of 3 or more |

Team, opponent, date, season, stage and the qualifier flag of a row come from its match. Under `home`, the team is the match's home side.

**Assists below the floor are written as null.** This applies wherever the match's `assistsReliable` is false: below the league's floor, or a match without stat arrays. ESPN's `A` undercounts there, and a board must never show it. The other floors are carried in the header but do not null anything. Ligue 1 2002-03 rows exist; the engine gaps a career whose window falls before `floors.apps` and prints the floor. The floors come from `research/beachhead.md` and AGENTS.md:

| | apps / starts / minutes / goals | assists |
|---|---|---|
| eng.1 | 2002-03 | 2005-06 |
| esp.1 | 2002-03 | 2005-06 |
| ita.1 | 2002-03 (the athlete store fills collapsed rosters) | 2008-09 |
| ger.1 | 2002-03 | 2006-07 |
| fra.1 | 2003-04 | 2007-08 |
| uefa.champions | 2002-03 (proper stages) | 2006-07 |

**Not shipped from the long rows:** the per-match `lineup` block on matches and the anomalies. The site has no use for either, and both stay in `data/ledger/`.

### Intl file

| Key | What |
|---|---|
| header | `v, kind: "intl", builtAt, source, deltas, counts` |
| `entities` | `key` (player_key), `name`, `team`, `born` (Wikidata P569 via `club_join`, else −1), `coverage` (`complete` = RSSSF log, `partial`, `none`), `badge` (the coverage text to print), `rsssf` (the log URL: the per-row source link the RSSSF ruling asks for), `wikidata`, `espn` (comma-joined ESPN athlete ids from the club join, the bridge to the club files), `capsStated, goalsStated, rows` |
| `rows` (`INTL_COLS`) | `e, match` (martj42 match_id), `ymd, team, opp, type` (friendly / qualifier / nations_league / finals / minor), `tournament, compRsssf, competitive, venue` (0 H, 1 A, 2 N), `score` (as written, the player's side first), `result` (from the score; −1 for awd/abd), `cap` (RSSSF cap_no), `app` (this ledger's count), `started, on, off, offReason, min, goals, goalMin` (comma-joined clocks), `src` (cap_source), `flags` (pipe-joined) |
| `nameAlt` | sparse per-row spellings |

Receipts, `sources` and `field_source` stay in `data/ledger/intl/player-matches.jsonl`. They are most of its 468 MB. The page links the player's RSSSF log, and the full receipt stays one hop away in the build product.

### Round trip

`encode-ledger.mjs` serialises each file to text, parses it back, decodes it, and compares it with the long rows field by field (`roundtrip.mjs`). Results on 2026-10-21:

| Set | Checked | Differences |
|---|---|---|
| Club, stratified sample | 2,000 rows over 75 competition-seasons | 0 |
| Club, every row | 82,293 rows | 0 |
| Club, every match | 48,994 matches | 0 |
| Intl, stratified sample | 2,000 rows | 0 |
| Intl, every row | 441,678 rows | 0 |

The only transform is assists, nulled where `assistsReliable` is false. The ordinals (`compApp`, `compStart`, `compSeason`, `tgn`, `app`, `start`, `season`) round-trip too; `tgn` comes from the match's `tgnH`/`tgnA`. The test file repeats both 2,000-row samples.

### Sizes

On the cached data (3,150 summaries, 82,293 club rows) and projected to full scope:

| File | Cached: rows | Cached: raw | Cached: gz | Full: rows | Full: raw | Full: gz |
|---|---|---|---|---|---|---|
| eng.1 | 16,664 | 2.10 MB | 0.22 MB | 246k | 13.5 MB | 1.17 MB |
| esp.1 | 16,100 | 2.07 MB | 0.22 MB | 251k | 13.6 MB | 1.26 MB |
| ita.1 | 12,772 | 1.89 MB | 0.20 MB | 232k | 12.6 MB | 1.16 MB |
| ger.1 | 12,553 | 1.66 MB | 0.18 MB | 201k | 10.9 MB | 0.96 MB |
| fra.1 | 12,859 | 1.88 MB | 0.20 MB | 236k | 12.8 MB | 1.12 MB |
| uefa.champions | 11,345 | 1.53 MB | 0.21 MB | 121k | 7.0 MB | 0.87 MB |
| intl (already full) | 441,678 | 37.2 MB | 4.87 MB | same | same | same |

How the projection works:

- **Rows:** played matches × the cached matches' rows per match (22.9-27.3). That gives about 1.29M club rows.
- **Entities:** about 0.011 per row for a league, 0.06 for the UCL.
- **Bytes:** the cached file's own bytes per row and per entity. The matches and team layers are already full-scope, because every match is in the file.
- **Check:** `--project` builds a synthetic full-scope Premier League. It draws a fully cached Bundesliga 2002-03 match at random into every real eng.1 fixture and rotates players through five-season careers. It measured 251k rows, 2,752 entities, 14.0 MB raw and 0.94 MB gz, against the 1.19 MB the bytes-per-row method projects. The projection is conservative.

**Verdict.** Every competition file stays far under the 10 MB gz line at full scope (about 1-1.3 MB gz, about 11-14 MB raw, against the WNBA's 8 MB / 2 MB). No era split is needed.

- The default board loads one league file.
- Load the other leagues and the UCL on demand (`import.meta.glob`, as the NFL site does per position).
- The intl file (4.9 MB gz, 37 MB raw) should be lazy-loaded only when a board includes internationals.
  - Its raw size, not its gzip size, is what costs on a phone (JSON.parse of 37 MB).
  - If that proves slow, split it by era at 1990, or ship only rows whose player has a club entity. Do not split by competition type, since a career board needs all of them.

## Gates through the compact files (`--gate`)

`--gate` reads the files from disk, decodes them, and runs three gate sets:

1. **Club-season gates** (`data/gates/club-seasons.json`): every row's club matches are cached, so all 18 run. 15 pass. The 3 FAILs are the pending corrections the README says must fail until they land:
   - Ronaldo 2003-04: 28/14 against 29/15. The roster that omits him needs the corrections layer.
   - Totti 2003-04: 30/19 against 31/20. Bologna v Roma is collapsed; needs the athlete-store fill.
   - Messi UCL 2005-06: 5 against 6. Udinese 188764 is collapsed; needs the fill.
2. **Factoid gates** (`data/gates/factoids.json`, status `reproducible-in-full`): a board runs only if every competition-season in its field up to `as_of` is fully cached. Only `vannistelrooy-12-ucl-2002-03` qualifies, and it passes: 12 (9 apps, 8 starts) and, with qualifiers, 14 (11 apps). The rest SKIP, with the count of seasons and matches that are still pending:
   - `ucl-first-n-090`: 24 of 25 comp-seasons not cached
   - `messi-youngest-50-ucl`, `ronaldo-140-ucl` and its qualifiers variant, `yamal-youngest-laliga-scorer`: each needs about 20 UCL or La Liga seasons
3. **Team gates:** these run over the decoded `matches` tables, with the same `team.mjs`. The result matches `build-teams.mjs` (49 pass, 1 FAIL as above). The shipped `teamSeasons` table equals a rebuild from the shipped matches on all 4,601 rows.

`evaluate.mjs` is a gate harness for these shapes, not the site's engine. It has no board ties, gapping or variants beyond the qualifier switch. The youngest-to gates need the DOB layer; the entity `born` column exists for it.
