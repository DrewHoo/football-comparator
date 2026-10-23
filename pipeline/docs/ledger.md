# The ledger builder

`pipeline/build-ledger.mjs` turns cached ESPN match summaries into one row per player per match, with the repairs the probes proved necessary, then adds ESPN athlete-store rows for the sides the summaries couldn't give (see "The athlete-store fill"). It reads only the harvester's index (`data/index/espn-events.json`), the disk cache (`data/raw/espn/`) and the fill job's output (`data/ledger/fills/athlete-matches.jsonl`). It never fetches. The cache key comes from `cacheFile()` in `research/espn/espn.mjs` (sha1 of the full summary URL), which has no side effects on import.

This is the long intermediate form. The compact `COLS` encoding the site ships (see the sports-site comparator contract) comes later, built from these files.

```sh
node pipeline/build-ledger.mjs                     # everything in the index; uncached matches listed as summary: "pending"
node pipeline/build-ledger.mjs --only-cached       # leave uncached matches out of matches.jsonl
node pipeline/build-ledger.mjs --leagues eng.1,esp.1 --seasons 2002-2005   # partial run: writes *.partial.* files only
node pipeline/build-ledger.mjs --gate              # the gate league-seasons only, nothing written, exit 1 on a regression
node pipeline/build-ledger.mjs --merge-review      # also print every id-merge candidate, by confidence
node pipeline/build-ledger.mjs --strict            # full build that exits 1 if a gate regresses
node pipeline/build-ledger.mjs --no-fill           # summary rows only (leave out data/ledger/fills/athlete-matches.jsonl)
node --test pipeline/lib/ledger/rules.test.mjs     # one unit test per repair rule, plus the fill and person rules (21)
```

`--seasons` takes start years: `2004`, `2004-05`, `2002-2005`, or a comma list. A full run prints the gates every time; only `--gate` and `--strict` make a regression fatal.

Code: `pipeline/build-ledger.mjs` (driver, season passes, writing) and `pipeline/lib/ledger/`:

| File | What |
|---|---|
| `rules.mjs` | the repair rules, one named pure function each |
| `match.mjs` | one summary → match row, player rows, anomalies (applies the rules in order) |
| `merge.mjs` | the athlete id merge table |
| `fill.mjs` | the athlete-store fill: clocks, side checks, the merge into the summary rows |
| `ordinals.mjs` | the second pass: career, competition and team ordinals |
| `gates.mjs` | the known-answer gates |
| `cache.mjs` | read-only index and cache access (summaries, and `recordCompetitor` for an athlete-store record's own side) |
| `rules.test.mjs` | unit tests |

## Outputs (`data/ledger/`)

A partial run (any `--leagues` or `--seasons`) writes the same names with `.partial` before the extension and never touches the combined files.

### `matches.jsonl`: one row per index event

```json
{"id":"254722","slug":"uefa.champions","season":2008,"seasonLabel":"2008-09","date":"2008-12-09T19:45Z",
 "homeId":"83","homeName":"Barcelona","awayId":"493","awayName":"Shakhtar Donetsk","homeScore":2,"awayScore":3,
 "shootout":null,"status":"STATUS_FULL_TIME","stage":"group","round":"UEFA Champions League, Group C",
 "seasonSlug":"group-stage","qualifier":false,"stuck":false,"summary":"ok","extraTime":false,"stats":true,
 "keyEvents":"ok","goalsReconciled":true,
 "lineup":{"home":{"rows":20,"unique":19,"starters":11,"subsIn":1,"subEvents":1,"used":12,"bench":6,"collapsed":false,"missing":false,"duplicates":1,"anonymous":0},"away":{...}},
 "quality":"repaired","assistsReliable":true}
```

| Field | |
|---|---|
| `season` | start year, by match date (the index's rule, never ESPN's slug) |
| `homeId`..`awayScore` | from the summary header; the index's values are the fallback, and a disagreement is an anomaly. The score excludes a shootout |
| `shootout` | `{home, away}` shootout score, else null |
| `stage` | `league`, or for the UCL `qualifying`, `group`, `second-group` (2002-03), `league-phase`, `knockout-playoff`, `round-of-16`, `quarterfinal`, `semifinal`, `final` (regexes, since round names drift) |
| `qualifier` | `/qualif\|play-?off/i` on the season slug, round or header season name, or the `uefa.champions_qual` slug; the 2024-25+ knockout play-offs are proper stage |
| `summary` | `ok`, `pending` (not cached yet), `empty` (ESPN 404) |
| `extraTime` | minutes are capped at 120 rather than 90 |
| `stats` | the match has stat arrays (APP/G/A...) |
| `keyEvents` | `ok`, `none`, `foreign` (dropped: they belong to another match) |
| `goalsReconciled` | every side's goals equal the score after the goal rules |
| `lineup.{home,away}` | raw rows, unique ids, starters after repair, subs on, substitution events, used, unused bench, collapsed, missing, duplicates merged, entries with no athlete |
| `quality` | `clean` (no anomaly), `repaired` (rules fixed something), `defective` (missing or collapsed roster, foreign keyEvents, unreconciled goals, starters ≠ 11) |
| `assistsReliable` | stats exist and the season is at or past the league's assists floor |

### `player-matches.jsonl`: one row per player per match

Appearances only (a starter or a sub who came on). The unused bench is counted in `matches.lineup` but has no rows. This file is the per-match truth; nothing in it depends on another match except `athleteId` (via the merge table) and season-level `pens` nulling.

```json
{"id":"254676","slug":"uefa.champions","season":2008,"date":"2008-09-16T18:45Z","qualifier":false,"stage":"group",
 "athleteId":"45843","espnId":"45843","name":"Lionel Messi","teamId":"83","oppId":"2250","home":true,
 "started":true,"subIn":null,"subOff":null,"sentOff":null,"minutes":90,"goals":0,"pens":0,"ownGoals":0,
 "assists":0,"yc":0,"rc":0,"result":"W"}
```

| Field | |
|---|---|
| `athleteId` | post-merge id (`id-merge.json`); `espnId` is the id the roster used |
| `name` | ESPN `displayName` as listed in this match |
| `started` | `starter && !subbedIn`, and `APP = 1` where the match has stats |
| `subIn`, `subOff` | minute on (null for a starter) and off (null if he finished); base minute, stoppage dropped |
| `sentOff` | red-card minute, else null |
| `minutes` | from the sub clocks, off at a red card, capped at 90 (120 with extra time); null when a needed clock is missing |
| `goals` | reconciled keyEvent goals (rules 7-9); null only when the match has neither usable keyEvents nor stats |
| `pens` | typed `penalty---scored` goals; null for a league-season with no penalty typing at all |
| `ownGoals` | own goals he scored (against his team); null if keyEvents are unusable |
| `assists` | stats `A` where his entry has stats, else null. Check `matches.assistsReliable` before using |
| `yc`, `rc` | cards from the roster `plays` (every season), stats YC/RC when he has no plays |
| `result` | W/D/L from his team's view on the score after 90/120 minutes. A shootout is a draw; the winner is in `matches.shootout` |
| `source`, `fill`, `receipt`, `clockUnknown` | only on athlete-store rows: `source: "athlete-store"`, the side's anomaly rule, `{url, fetchedAt}` of the per-event stat record, and which clock (`subIn`, `subOff`, `sentOff`) neither the record nor the keyEvents give. A row without `source` came from the match summary |

### `ordinals.jsonl`: the second pass

Ordinals live in their own file because they depend on every other match being present. A match harvested later shifts every later number, and the per-match truth shouldn't churn when that happens. They're recomputed on every build from the two files above (`lib/ledger/ordinals.mjs`), so join on `(id, athleteId)`.

```json
{"id":"188756","athleteId":"45843","comp":"uefa.champions","compApp":1,"compStart":null,"compSeason":1,"tgn":1,"app":8,"start":null,"season":2}
```

| Field | |
|---|---|
| `comp` | the league slug, `uefa.champions` (proper stages) or `uefa.champions:qual` (qualifiers, from either UCL slug) |
| `compApp`, `compStart`, `compSeason` | his appearance, start and season number within that competition ("fastest to M" counts these). `compStart` is null for a sub appearance |
| `app`, `start`, `season` | the same across every league and UCL-proper match in the ledger; null for qualifiers |
| `tgn` | his team's match number in that competition-season, counting every played match in the index (cached or not), so a missed match is a gap |

Every ordinal starts at 2002-03, the ledger's first season. A career that began earlier (Henry, Totti, Van Nistelrooy) is offset until a debut floor or a corrections layer says otherwise. Until the harvest finishes, ordinals for any player with a pending match are provisional.

### `anomalies.jsonl`: every repair and every unrepairable defect

`{id, slug, season, date, rule, team?, athlete?, detail, ...}`; `id` is null for season-level rules. Every withheld or starterless side (`roster-collapsed`, `roster-missing`, `roster-invalid`, `roster-starters-missing`) carries `evidence`: the athletes the keyEvents place on that side (goals, subs on and off, red cards, with their minutes), and after the fill `filled` (athlete-store rows added; 0 when the fill gave nothing), `filledStarters` and `filledSubs`. The fill adds `fill-clock-unknown` (a side with a sub or red card whose clock neither source has), `fill-record-other-side` and `fill-both-sides` (below). Split-id folds carry `pairs`.

### `id-merge.json`

`{builtAt, rulesVersion, threshold, stats, map: {espnId: canonicalId}, candidates: [...]}`. Each candidate: `name, ids, apps, confidence, level (high|medium|low|veto), merged, veto, evidence`. See the merge section below.

### `build.json`, `gates.json`

The run's scope, counts (`fillRows` among them), anomalies by rule, the fill's report (`fill`: rows added by rule, starters per rule, the clock and side checks, every withheld side left `unfilled`, and `notWithheld`: athlete-store rows on sides the summary built that the summary lacks) and timings; the gate results.

`matches.lineup.{home,away}.filled` is the number of athlete-store rows on that side.

## The repair rules, in the order they run

Each is a named function in `rules.mjs` with a unit test. The `rule` column is what `anomalies.jsonl` records.

| # | Rule (`anomalies.rule`) | What it does | Motivating events |
|---|---|---|---|
| 1 | `header-competitors-missing`, `header-teams-differ-from-index`, `header-score-differs-from-index` | The summary header is the truth for teams and score; disagreements with the index are recorded | harvester's `header-*` checks |
| 2 | `keyevents-foreign` | Every keyEvent team id must be one of the header's competitors, or the whole keyEvents list is dropped (goals fall back to stats G, else null) | 678280 (Hull at Chelsea returning Rangers v Hearts events; excluded by the index); 156715 (UCL 2004-05 Q2) |
| 3 | `substitution-dedupe` | Substitutions deduped by the (in, out) pair | 254722 and 0-25% of matches per season |
| 4 | `roster-missing` | An empty side has no player rows | UCL 2002-03 and 2009-12 qualifiers, Spartak-Feyenoord 2001-02 |
| 5 | `roster-collapsed` | A side whose rows are one athlete is withheld (no phantom rows) and recorded with its keyEvent evidence for the athlete-store fill. Test: `rows - uniqueIds > 2` **and** one id repeated 3+ times. The brief's test alone flags 54 legitimate rosters in the cached sample, because La Liga and Serie A 2007-11 list up to 9 players twice, each id at most twice | 188764, 188837 (Barca-Udinese, 18 × 196222), 131335 (Bologna v Roma, Totti), event 14151 |
| 6a | `roster-duplicate-entries` | One entry per athlete id: flags OR-ed, stats from the entry that has them, plays unioned | La Liga and Serie A from 2007-08 (subs listed twice) |
| 6b | `roster-entry-no-athlete` | Entries with no athlete object are counted toward the eleven but get no row (unrecoverable from the summary) | 60603 (Mallorca, La Liga 2002-03) and 179 more in the sample |
| 6c | `split-id-double-listing` | Two ids for one shirt and surname on one side are one player: folded under the older id, the pair goes to the merge table as its strongest evidence | 203760 (13 Nantes players under old and 84k ids), 254722 (Botía 113188/129938) |
| 7 | `starter-flag-dropped` | A starter is `starter && !subbedIn`, and where the match has stats `APP = 1` | Piqué and Touré at Sporting 2008-09; the 12th starters 283208, 315212, 254722 |
| 8 | `appearance` (`app-without-flags`, `subbed-in-app-zero`, `no-stats-on-entry`) | Where the match has stats an appearance is `APP ≥ 1`, else repaired starter or subbedIn | 197123, the 2006 final: a 20-man squad list flagged as starters, the injured Messi among them |
| 9 | `starters-not-eleven`, `subs-mismatch` | After repair, a side without exactly 11 starters, or whose subs on differ from its substitution events, is recorded (not fixable from the summary) | 2001-03 starter-flag gaps, scorer-only qualifier rosters |
| 10 | `goal-event-unattributed` | Goals are keyEvents with `scoringPlay`, excluding `own-goal` (its team is the beneficiary, `participants[0]` the defender) and shootout kicks. Never by type name | Gary Speed's own goal on a Tottenham event |
| 11 | `goal-dedupe-exact`, `goal-dedupe-near`, `goal-stats-tiebreak` | When a side's goal events exceed its score less the own goals credited to it: drop exact repeats (scorer, minute), then the same scorer within 2 minutes, then let stats G break the tie. Only as many events as the excess are dropped, so a real brace at 80' and 81' survives when the score agrees | 254722 (Barcelona 2-3 Shakhtar, every goal twice); 203824 (Sevilla v Barcelona 2006-10-15, Messi at 80' and 81') |
| 12 | `goal-fill-from-stats`, `goal-events-short`, `goal-events-exceed-score` | When events fall short and stats exist, a scorer whose G is above his events gets the missing goals, up to the deficit. keyEvents otherwise win: stats G is sometimes 0 against a real goal (Totti, Chievo 2006-10-22 and Ascoli 2006-10-25) | 2 EPL, 1 Serie A and 22 UCL qualifier sides short in the sample |
| 13 | `stats-goals-disagree` | Informational: stats G differs from the reconciled count; keyEvents kept | 204993 |
| 14 | `minutes`, `sub-clock-missing` | Minutes from the sub clocks (keyEvents first, then the entry's own plays, then the partner via `subbedInFor`), stoppage dropped, off at a red card, capped at 90; 120 only when a UCL match is AET, a shootout, or has extra-time events. A period-3 keyEvent turns up in league matches, so periods alone are never evidence | Messi 2008-09: 2,517 against BDFutbol's 2,516; 169642 (Barcelona sub at 92' in a league match) |
| 15 | `cards` | Yellow and red from the roster plays, deduped by minute; stats YC/RC when there are no plays | |
| 16 | `penalty-typing-absent` (season) | A league-season with 40+ goals and no `penalty---scored` event has no typing: `pens` null for the season | EPL 2002-03 (Henry's 3 penalties untyped), EPL 2009-10 |
| 17 | `assists-null-season`, `assists-partial-season`, `assists-below-floor` (season) | Assists exist only where stats do; before the floors (EPL and La Liga 2005-06, Bundesliga 2006-07, Ligue 1 2007-08, Serie A 2008-09, UCL 2006-07) stats A undercounts, so `assistsReliable` is false | EPL 2011-12 stat arrays half missing |
| 18 | `athlete-id-merged` | The merge table (below) rewrites `athleteId` | Tarnat 13464/85186 |

Stuck rows (`stuck: true` in the index) and qualifiers come through as they are, flagged. The index has already dropped ghost postponements, relegation playoffs and the EPL 2009-10 re-ingest.

## The athlete-store fill

The summary can't give a side whose roster is collapsed, empty or hollow, or whose starting XI is missing. `pipeline/fill-espn.mjs --job athlete-fills` (`pipeline/docs/fill.md`) pulled those sides from ESPN's athlete-scoped store: one per-event stat record per candidate player. `build-ledger.mjs` merges the result (`lib/ledger/fill.mjs`) after the summary rows, the season passes and the id merge, and before the ordinals:

1. **Scope.** Rows of the six ledger competitions (eng.1, esp.1, ita.1, ger.1, fra.1, uefa.champions and uefa.champions_qual) for a match this run built, on a side with a `roster-collapsed`, `roster-missing`, `roster-invalid` or `roster-starters-missing` anomaly. Other slugs (Vardy's and Lacazette's eng.2, FA Cup, Europa League, internationals...) are left to their own ledgers.
2. **Side.** Taken from the stat record's own `$ref` (`competitors/{team}/roster/...`), not from the URL the fill asked: the store answers the same record under either competitor. Three rows moved (`fill-record-other-side`): Nakata, Bologna v Parma 2003-08-31 (118600), was Parma's; Simone Inzaghi (161577) and Stefano Mauri (188154) were Lazio's. If a record can't be read and one person comes back on both sides, the side of his nearest summary row by date wins (`fill-both-sides`); with no summary row, both are dropped.
3. **Never over the summary.** A row is dropped when the summary already has that canonical athlete in the match (on either side) or a player of the same name on that side. The merge table is built from summary rows only; fill rows take their `athleteId` from it.
4. **Context** (slug, season, date, stage, qualifier, home, opponent, result) comes from the ledger's match row.
5. **Clocks.** The side's keyEvent `evidence` first (as rule 14), then the record's. The record writes 0 for a clock it doesn't have (`subIns`/`subOuts` are still right), so 0 is unknown. Base minutes, stoppage dropped, capped at 90, or 120 with extra time.
6. **Minutes** by rule 14 from the clocks. The record's own `minutes` includes stoppage (Juarez on 33' at Udinese 188764: record 61, clocks 57) and is missing for whole Serie A seasons (2002-03, 2006-08), so it's used only when a needed clock is unknown.
7. **Pens** null in a league-season the builder found untyped; goals, own goals, assists and cards as the record has them (assists still go through `assistsReliable`).
8. **Ordinals** are computed after the merge, over summary and fill rows together.

Result on the full build (2026-10-23): 1,366,150 summary rows plus 4,421 athlete-store rows = 1,370,571.

| Rule | Sides | Sides filled | Rows added | Sides with 11 starters after |
|---|---|---|---|---|
| `roster-collapsed` | 304 (300 proper, 4 UCL qualifier) | 300 | 3,969 (3,203 starters, 766 subs) | 208 |
| `roster-missing` | 929 (74 league, 855 UCL qualifier) | 22 | 296 | 18 |
| `roster-invalid` | 10 | 10 | 156 | 10 |
| `roster-starters-missing` | 66 | 0 | 0 | 0 |

- **Not covered:** 977 sides.
  - 859 UCL qualifier sides the fill never attempted. It ran with `--no-qualifiers`; the board excludes qualifiers.
  - 52 `roster-missing` league sides where every candidate's record is a 404: La Liga 2004-05 (20 sides) and the twelve 2011-12 matches of team 3747 (24 sides, ids 420595-420607), plus 4 Ligue 1 and 4 Serie A sides.
  - All 66 `roster-starters-missing` sides. The store mirrors the hollow summary: it holds records for the same 1-5 subs (128 rows, all already in the summary) and none for the starters.
- **Incomplete:** 92 collapsed sides and 4 missing sides were filled with fewer than 11 starters. Their players fell outside the candidate set (`athlete-fills.json` `complete: false`).
- **Clocks:**
  - 1,558 rows took a clock from the keyEvents.
  - 33 rows have a clock neither source gives. 15 of them take their minutes from the record; 18 have minutes null.
  - In 72 rows the record's own minutes differ from the clocks by more than 2.
- **Cross-check:** the store's 855 Vardy and Lacazette rows on sides the summary built are all already in the summary. Starts and goals agree on all 855; minutes agree within 2 on 851.

## The id merge table

ESPN athlete ids never rename but often split. The probe found 185 name-plus-club pairs with two or more ids (a re-ingest around 2006, second ids mostly 50-100k) and 389 display names that are real homonyms, so a name alone never merges. Built from every appearance row:

1. **Candidates.** Two ids with the same name key (accents stripped, lowercase) that played for the same club in the same or adjacent seasons. Also any pair the `split-id-double-listing` fold found in one roster.
2. **Veto.** The two ids both have a row in one match. That means two people; a folded listing never leaves both.
3. **Confidence.** Base 0.4, then:
   - +0.3 for a handoff (one id's matches at the club end before the other's begin)
   - +0.25 for the same shirt number at the club, −0.2 for different shirts
   - +0.05 for the same position letter, −0.1 for a different one
   - +0.1 when exactly one id is in the 50-100k re-ingest band
   - −0.3 when the ids alternate match by match with no shared shirt
   - A same-roster fold is 0.95.
4. **Merge** at ≥ 0.6: `high` from 0.8, `medium` from 0.6 to 0.8. `low` is review only.
5. **Canonical id.** A star id (Messi 45843, Ronaldo 22774, Henry 8039, Totti 10293; the build throws if one is ever merged away), else the id with more appearances, else the lower id. Merges are transitive (union-find).

`--merge-review` prints every candidate with its evidence. In the cached sample (3,150 summaries) there are 273 candidates and 257 ids merged. The low tail is mostly shirt changes across seasons (Emre Aşık 5→21, Blasi 7→8). Those are probably the same players; they're left for a hand check rather than merged on name, club and adjacency alone. The Werder Bremen 2005-06 ids interleave match by match (Naldo, Valdez, Owomoyela, a partial re-ingest) and merge on the shared shirt. The table only joins ids seen at the same club, so a split that coincides with a transfer stays split until a later season puts both ids at one club.

## Gates (`--gate`)

`lib/ledger/gates.mjs` holds the 13 club-seasons from `research/espn-coverage-leagues.md` §3 and five UCL gates from `research/espn-coverage-ucl-intl.md` §2. Each gate has:

- `expect`: the probe's ESPN-derived number, moved only where a documented repair should move it
- `known`: the publisher's figure

The athlete-store fill moved two `expect`s, as documented repairs: Totti 2003-04 from 30/30/19/2679 to 31 apps, 31 starts, 20 goals, 2,769 minutes (Bologna v Roma 131335: started, 90', 1 goal, not a penalty), and Messi UCL 2005-06 from 5 to 6 apps (Udinese 188764: started, off 70').

For apps, starts, goals, penalties, assists and minutes, the printout shows ledger / expect / known. A gate fails on any difference from `expect`, with two exceptions: a move closer to `known`, and minutes lost to a red card (the probe ran minutes to 90 regardless). A gate whose matches aren't all cached prints `SKIP` with the count.

Results on 2026-10-21 (all 18 cached, all pass):

- **Every league gate matches the probe**, with three deliberate changes:
  - Messi 2006-07 goals are 14 = known (the probe's keyEvents gave 15)
  - Ronaldo 2003-04 and 2007-08 minutes are 5 lower each: sent off at 85' v Aston Villa 2004-05-15 and at Portsmouth 2007-08-15
  - Henry 2002-03 penalties are null (untyped season)
- **Van Nistelrooy 2002-03:** 9 apps, 8 starts, 12 goals proper, plus 2 apps and 2 goals in qualifiers.
- **Ronaldo 2007-08:** 11 apps, 11 starts, 8 goals.
- **Messi 2008-09:** 12 apps, 10 starts, 9 goals, 5 assists.
- **Ronaldo 2013-14:** 11 apps, 17 goals.
- **Messi 2005-06 UCL:** 5 apps and 1 goal. The 2006 final (197123) has no row for him, and Udinese 188764 is recorded as `roster-collapsed` with the keyEvent showing him off at 70'. Known is 6 = 5 + that fill.

Results on 2026-10-23, after the athlete-store fill: all 18 pass. Totti 2003-04 is 31/31/20 (2,769 minutes), and Messi UCL 2005-06 is 6 apps and 1 goal, with the 188764 anomaly still recorded and no row in 197123.

## Rerunning as the harvest fills

Rebuild everything every time; there's no incremental state to go stale. The build re-reads every cached summary (about 0.8-1.2 ms each).

- **Now:** 3,086 summaries take 2.5 s.
- **Full scope** (about 49,000 summaries, about 1.3M player rows, about 440 MB of `player-matches.jsonl`): about 25 s to read and build in a synthetic test at that size (every cached summary built 16 times), under 2 s for merge and ordinals, about 1 GB RSS. With writing, budget about a minute.

Files are written in 20k-row chunks to a `.tmp` and renamed, so a reader never sees half a file and the player file never has to be one string. The harvester rewrites the index atomically, so the builder can run beside it. Matches not cached yet appear as `summary: "pending"` (or are skipped with `--only-cached`), and their gates `SKIP`. Bump `RULES_VERSION` in `rules.mjs` when a rule changes meaning.

## Known residual errors

- **Ronaldo 2003-04 is one appearance and one start short** (28/29, 14/15). One of five Man Utd rosters silently lists someone else in his place, and nothing in the summary can tell which. Corrections layer.
- **Withheld sides the athlete store couldn't fill.** 977 sides, listed under "The athlete-store fill": 859 UCL qualifier sides that were never attempted, 52 league sides with no records, and the 66 starterless sides. Another 96 filled sides have fewer than 11 starters. The 304 collapsed rosters (Serie A 2002-08 above all) are filled, which is how Totti 2003-04 reaches 31 apps and 20 goals.
- **EPL 2011-12 assists are half missing** (stat arrays absent in about half the matches). Assists are null there, never 0, and `assists-partial-season` names it. The keyEvent assister exists from 2011-12, but AGENTS.md says stats `A` only.
- **Penalty typing gaps.** EPL 2002-03 and 2009-10 have none (`pens` null). Elsewhere typing is per event and can't be checked: Serie A 2002-03 roster plays flag 64 penalty goals where keyEvents type 70. `pens` counts typed keyEvents, so treat it as a floor.
- **Assists before the floors** undercount (EPL 2002-03 overall) and can also overcount for one player (Henry 2002-03: 23 against Wikipedia's 20). `assistsReliable: false`.
- **Lineups the summary can't fix:** 2002-03 sides with 10 or 12 starters, anonymous entries (`roster-entry-no-athlete`, mostly La Liga 2002-03), and scorer-only UCL qualifier rosters. All are recorded; none are guessed.
- **Ordinals start at 2002-03** and are provisional while any of a player's matches are pending.
- **The merge table is conservative.** Splits that coincide with a transfer, or with a shirt change across seasons, stay split unless reviewed.
