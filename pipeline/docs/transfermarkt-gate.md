# The Transfermarkt gate

`pipeline/gate-transfermarkt.mjs` is the one independent club-side check at scale. It compares the ESPN-derived ledger against dcaribou's transfermarkt-datasets (CC0 compilation, 2012-07 to 2026-06) for every player-club-competition-season both sources cover: appearances, goals, assists and minutes. Helpers live in `pipeline/lib/transfermarkt.mjs`.

```sh
node pipeline/gate-transfermarkt.mjs                       # every season both cover (2012-13..2025-26), the six competitions
node pipeline/gate-transfermarkt.mjs --download            # fetch any table not cached yet (the R2 bucket only)
node pipeline/gate-transfermarkt.mjs --seasons 2009-2013   # partial run, *.partial.* outputs; pre-2012 seasons report "no transfermarkt coverage"
node pipeline/gate-transfermarkt.mjs --leagues eng.1,uefa.champions
node pipeline/gate-transfermarkt.mjs --inject-faults       # self-test of the diagnosis, *.faults.* outputs
node pipeline/gate-transfermarkt.mjs --profile             # rewrite data/raw/transfermarkt/profile.json (row counts, spans)
```

**The real run, once the harvest has finished:** rebuild the ledger, then gate it. The gate only reads the ledger, so it always sees the last build.

```sh
node pipeline/build-ledger.mjs && node pipeline/gate-transfermarkt.mjs
```

That takes about 15 s today. At full scope it will be about a minute, mostly spent streaming `player-matches.jsonl` and `game_lineups`. If `data/index/athletes.jsonl` exists by then (the `fill-espn --job dob` output), ESPN DOBs feed the player map with no code change.

The gate never touches ESPN or any host other than the R2 bucket. It reads `data/index/espn-events.json`, `data/ledger/{matches,player-matches}.jsonl`, `data/ledger/id-merge.json`, `data/raw/transfermarkt/`, and `data/index/athletes.jsonl` and `data/index/wikidata/players.json` when they exist.

## The source (downloaded 2026-10-22)

There is one GET per table from `https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/<table>.csv.gz`, plus one HEAD to size `game_lineups` against its 200 MB cap: 7 requests in total. Each table is cached as `data/raw/transfermarkt/<table>.2026-10-22.csv.gz`, with a sidecar `<same>.json` holding `{url, status, bytes, sha256, fetchedAt, lastModified, etag}`. A cached table is never fetched again. Every file's Last-Modified is 2026-09-05 (the final re-export; the pipeline is paused).

| Table | Rows | Span | Bytes (gz) |
|---|---|---|---|
| `appearances` | 1,894,350 | 2012-07-03 to 2026-06-28 | 45,253,638 |
| `games` | 88,958 | 2006-06-09 to 2026-07-06 (the six competitions start 2012-13) | 4,995,595 |
| `clubs` | 796 | | 51,281 |
| `players` | 50,149 | DOBs 1968 to 2011 | 4,389,958 |
| `competitions` | 65 | | 2,242 |
| `game_lineups` | 3,179,016 | 2013-07-02 to 2026-07-06 (**no 2012-13**) | 125,814,089 |

What the data showed (and where the brief's assumptions were wrong):

- **TM minutes do not include stoppage.** In the six competitions, 407,686 rows are exactly 90, 5 are 91, and 327 run past 95 (extra time). A sub on in stoppage gets 1'. Both sources cap at 90 (120 with extra time).
- **TM's `appearances` holds only players who played.** One 0-minute row in 776k. That's the same unit as the ledger, which has rows for starters and subs who came on, so apps compare exactly.
- **Use TM's `season` column, not the date rule.** It matches the July-June rule except for the COVID restart: the July-August 2020 games are 2019-20, as the ESPN index files them. The date rule put Bournemouth, Watford and Norwich into 2020-21.
- **TM's score includes the shootout and records forfeits.** The 2016 CL final is 6-4 against ESPN's 1-1. Pescara v Sassuolo 2016 and Verona v Roma 2020 are 3-0 forfeits. That accounts for 11 paired games whose score differs. Scores are not used to pair games.
- **TM's CL rows for clubs whose league TM didn't track that season are partial.** Only players TM has profiles for appear: Dinamo Zagreb 2012-13 has 6 rows for 14 used, Viktoria Plzeň 2013-14 one. Across CL, 3,368 sides have 11+ rows and 265 have fewer. A side counts as covered in a game only when TM lists **at least 9 players for it** (`tm-side-partial` otherwise, kept out of the gate). Sides with 9-10 rows stay in the gate, so a tracked side missing a player shows up there.
- **TM has holes too.** Nacho Monreal has no TM row in Málaga's 2012-13 matches (ESPN 348500, 355637). He's the only TM-short player-season in today's overlap.
- The 2025-26 CL final (ESPN 401862897, 2026-05-30) is not in TM's `games`.

## 1. The club map

TM club ids and ESPN team ids are mapped per competition-season (GB1↔eng.1, ES1↔esp.1, IT1↔ita.1, L1↔ger.1, FR1↔fra.1, CL↔uefa.champions without qualifiers). It's built from TM `games` (club names as each game lists them) and the ESPN index (every event, cached or not). It always runs over the full 2012-13 to 2025-26 window, whatever `--seasons` says.

1. **Name score** (`clubScore`): NFKD fold, legal forms and filler dropped (FC, SSC, Calcio, Real, United, ...), aliases (München/Munich, Internazionale/Inter, Olympiakos Syndesmos Filathlon Peiraios/Olympiacos, København/Copenhagen, Athletic Club/Athletic Bilbao). There's a 10% tie-break on the full token set, so "Manchester United" beats "Manchester City".
2. **Anchors:** a TM club whose best name is ≥ 0.8 and clear of the runner-up by 0.15.
3. **Fixture shape:** for every TM game against an anchored opponent, the one ESPN event on d-1..d+1 with the anchor in the same home/away role names the other side. The share of those votes for the best ESPN team is the fixture share.
4. **Decision:** name and fixtures agree (share ≥ 0.6) → `name+fixtures`. Otherwise fixtures win at share ≥ 0.8 over 3+ games, or 1.0 over 2+ (`fixtures-over-name`, on the review list). Otherwise a clear name ≥ 0.8 wins (`name-only`). Otherwise the club is unresolved. Two TM clubs claiming one ESPN team, or one TM club mapping to two ESPN teams, is a review item.

**Coverage:** every club-season in every competition is matched.

| Comp | Clubs | Club-seasons | Method | Games paired |
|---|---|---|---|---|
| GB1 | 37/37 | 280/280 | all `name+fixtures` | 5,320/5,320 |
| ES1 | 33/33 | 280/280 | 275 + 5 `fixtures-over-name` (Espanyol, whose name prefers "Barcelona") | 5,320/5,320 |
| IT1 | 39/39 | 280/280 | all `name+fixtures` | 5,320/5,320 |
| L1 | 31/31 | 252/252 | all `name+fixtures` | 4,284/4,284 |
| FR1 | 36/36 | 274/274 | all `name+fixtures` | 4,997/4,997 |
| CL | 106/106 | 456/456 | 453 + 3 `fixtures-over-name` (Lokomotiv Moscow, named in Cyrillic by TM) | 1,871/1,871 (one ESPN-only: the 2025-26 final) |

**Game pairing:** the club map plus the ordered pairing within ±3 days, nearest first, then the swapped pairing (neutral finals). It's written to `transfermarkt-games.csv` (`paired`, `tm-only`, `espn-only`). Every paired game today is on the same date.

## 2. The player map

The unit is one ESPN team-season, with league and CL together. ESPN athletes are post-merge ids: `id-merge.json` is applied first, to the ledger's `athleteId` and to every ESPN id used in a check. TM players are those with appearances for the mapped club that season.

- A **candidate** pair needs a name score ≥ 0.6 (`nameScore`): token sets, containment ("Juanfran" ⊂ "Juanfran Torres" is 0.75), the same surname with a compatible first initial (0.82), and surname transliterations, i.e. edit distance ≤ 2 or a prefix on 5+ letters ("Holebas"/"Cholevas", "Zyrianov"/"Zyryanov", "Rados"/"Radosevic", 0.78). Apostrophes are dropped, not split ("N'Dy" is "ndy").
- **Confidence** = 0.6 × name + 0.4 × co-appearance Jaccard over the paired games (name × 0.9 when no paired game holds either). Then +0.2 for an equal DOB and −0.5 for a different one; ESPN has no DOB yet, so this is wired but unused. Matching is one-to-one, greedy by confidence, accepted at ≥ 0.55. `high` needs ≥ 0.85 and a name ≥ 0.8; `medium` ≥ 0.7. A rival within 0.05 is recorded as `ambiguous`.
- **Never on co-appearance alone.** A leftover pair that co-appears with Jaccard ≥ 0.9 but whose names don't match (nicknames: Chicharito/Javier Hernández, Coro/Ferrán Corominas, Cote/José Ángel, Kanu/Ruben Dos Santos) goes to `review` and its rows become `map-review` units. Matching them on co-appearance would make the appearance check circular.
- Across seasons, one TM id mapped to several ESPN ids is a `splitCandidate`: an unmerged ESPN split to feed the merge table. One ESPN id mapped to several TM ids is a `homonymCandidate` (an over-merge or a wrong match).
- **Wikidata check:** `players.json` carries both a Transfermarkt and an ESPN id for 1,657 players.

**Today:** 2,221 club-season pairs (1,762 players), 2,168 high, 48 medium (mononyms and nicknames: Papu/Alejandro Gómez, Quique/Enrique De Lucas), 5 low. Of 2,257 ESPN athlete-seasons in covered teams, 1 is unmatched where TM covered his side (Monreal, a TM hole), 23 are unmatched only because TM's side was partial (Zagreb, Plzeň), and 12 pairs are in review. No splits or homonyms are found at today's size. Wikidata agrees on 319 of 328 checked:

- 7 name an ESPN id that has no ledger row: a second ESPN id for the same person from the athlete store or national team, not a wrong match.
- 2 are real ESPN splits inside the ledger: Romaric is 84976 in 2002-05 and 299252 in 2012-13; Mavuba is 37437 and 84862. Neither pair is merged yet because the merge table only joins ids seen at one club. Add them to the merge review.

Outputs: `transfermarkt-players.json` (`summary, splitCandidates, homonymCandidates, wikidataDisagree, wikidataOtherEspnId, review, espnUnmatched, tmUnmatched, map`).

## 3. The gate

A unit is a player × club × competition × season. Each unit is compared **over the games both sources hold**: paired, the ESPN summary `ok`, and TM covering his side (≥ 9 rows). During the harvest that's the cached subset; afterwards it's the whole season. Each row also carries the whole-season totals (`espnSeasonApps`, `tmSeason*`, `teamEspnEvents`, `teamTmGames`, `teamCommonGames`) and `coverage` (`full-season` when common = ESPN events = TM games for the team, else `partial`).

Unit `status`: `compared`; `tm-unmatched` (TM row, no ESPN player: ESPN short); `espn-unmatched` (ESPN row, no TM player: TM short); `map-review`; `tm-side-partial`; `espn-game-unpaired`; `no-tm-coverage` (the season or competition is outside TM, e.g. any `--seasons` before 2012, with the TM club still labelled through the club map). Exact-match rates are over `compared` only. Unmatched units are reported as patterns and can enter the top 50.

### Tolerances (season level, `TOL` in the lib)

| Stat | Tolerance | Why |
|---|---|---|
| apps | 0 | Both count a sub appearance; both have rows only for players who played |
| goals | 0 | Own goals are excluded on both sides |
| assists | 1 + floor(max/10) | Assists are Transfermarkt's own (second assists, won penalties). ESPN's are stats `A`, null where `assistsReliable` is false |
| minutes | max(5, 3 × common apps) | The sub-clock convention and stoppage, below. Both cap at 90/120 |

### Per-game diagnosis, and the three patterns kept apart

Each disagreeing game gets tags (`diagnoseGame`). The unit's `pattern` is the highest-priority tag; `tags` counts them all.

- **ESPN short by a whole match** (`espn-short-whole-match`): TM has him in a paired game and ESPN doesn't. The cause is `espn-roster-collapsed` or `espn-roster-missing` (from `matches.lineup`), or `espn-player-absent` (a silent omission, Ronaldo 2003-04 style). The reverse is `tm-short-whole-match`: `tm-unused-sub` or `tm-no-appearance` (from TM's `game_lineups`, 2013-14 on), or `tm-player-absent`.
- **Goal credited differently** (`goal-credited-differently`): both have him, goals differ.
- **Minutes**, from a per-game look at every small delta in today's overlap:
  - `minutes-sub-clock`: TM puts a substitution a minute earlier than ESPN's clock. A starter off at 70 in ESPN is 69' in TM (95 cases of +1), and his replacement gets 20' against 21' (89 of −1).
  - `minutes-stoppage`: a clock involved is 90+ or 120+. ESPN drops stoppage, so a 90+2 sub has 0'; TM gives him 1' (27 cases).
  - `minutes-off`: more than 3' in one game, which is a real defect (a missing sub event, a red card, extra time).
- `assist-credited-differently`.

`severity` = 100 × |Δapps| + 50 × |Δgoals| + 10 × assists beyond tolerance + minutes beyond tolerance. It ranks the top 50, and each of them lists its ESPN event ids, TM game ids and a per-game line (`espn 0g 0a 90', tm 0g 0a 73'`).

## Outputs (`data/ledger/gates/`)

| File | |
|---|---|
| `transfermarkt-season.csv` | One row per unit: both values, deltas, tolerances, `ok*`, pattern, tags, season totals, the ESPN events and TM games involved |
| `transfermarkt-summary.json` | Downloads, club map coverage, player map summary, unit counts, overall rates, patterns, game tags, `byCompetitionSeason` (exact and within-tolerance rates per stat, delta histograms, patterns), `top50` |
| `transfermarkt-players.json` | The player map and its leftovers (above) |
| `transfermarkt-clubs.json` | Club map `coverage`, `review`, `espnUnmatched`, `map` (per comp, seasons aggregated), `decisions` (per comp-season) |
| `transfermarkt-games.csv` | Game pairing |

A run with `--seasons` or `--leagues` writes `*.partial.*` (season, summary, players). `--inject-faults` writes `*.faults.*`. The club and game files are always the full window.

## Results on 2026-10-22 (ledger built 2026-10-21 22:36Z, 116 cached matches in the window)

The overlap is the probe sample: 8-10 matches per league in 2012-13 and 2013-14, 33 CL matches, and one CL 2019-20 tie, giving **2,441 compared player-seasons**.

| Stat | Exact | Within tolerance | Deltas |
|---|---|---|---|
| apps | 100% | 100% | all 0 |
| goals | 100% | 100% | all 0 |
| assists | 97.9% | 99.9% | −1: 45, −2: 2, +1: 5 (TM credits more) |
| minutes | 89.8% | 99.96% | ±1-5: 245, 6-30: 3 |

- Patterns: 2,143 exact, 220 `minutes-sub-clock`, 28 `minutes-stoppage`, 47 assists, 3 `minutes-off`, 2 TM-short (Monreal).
- The largest real disagreement is **Rafa (Getafe), Atlético Madrid v Getafe 2012-11-11 (ESPN 348409 / TM 2242924)**: ESPN 90', TM 73'. ESPN has no substitution event for him.

**Self-test** (`--inject-faults`): drop one ESPN appearance, move a goal to a team-mate, add 12' to one row and 2' to another. All four come out under the right pattern. A player whose only club-season row is dropped surfaces as a `tm-unmatched` unit with `espn-player-absent`, which is why unmatched units get the diagnosis too.

This sample says the pipeline is right, not that ESPN is clean at scale. The collapsed-roster seasons (Serie A 2002-08) are before TM's window, so the gate can't see them. What it will measure after the harvest is 2012-13 onward at full size.
