# fill-espn.mjs: the ESPN follow-up fills

Three jobs that need the ESPN host, written while the club harvester owned it. Each has a `--dry-run` that fetches nothing and writes the exact URL list it would fetch, and every parsing path is tested against responses already in the cache.

```sh
node pipeline/fill-espn.mjs --job athlete-fills --dry-run   # plan -> data/ledger/fills/plan-athlete-fills.json
node pipeline/fill-espn.mjs --job dob --dry-run [--strategy roster] [--dob-source wikidata-first]
node pipeline/fill-espn.mjs --job intl-slugs --dry-run
node pipeline/fill-espn.mjs --job <job> --cache-only         # build outputs from disk only, written as *.cache-only.*
node pipeline/fill-espn.mjs --job <job> [--limit N]          # live
node --test pipeline/lib/fill/fill.test.mjs                  # 20 tests, cache only, fetch trapped
```

Every request goes through `research/espn/espn.mjs` (`getUrl`: disk cache, backoff, manifest). The CLI sets `ESPN_GAP_MS=1500` before anything imports that module, because it reads the gap at import time. A live run refuses to start (exit 3) while another ESPN process is alive (`pgrep` for `harvest-espn.mjs`, `espn.mjs`, `core-*.mjs`). It appends its miss count to `research/espn/requests.log` on exit or Ctrl-C. Reruns are free because the cache answers them, so a killed run just restarts.

The only network path is `Fetcher.get()` in `lib/fill/espn-cache.mjs`. In a dry run or a cache-only run, an uncached URL is recorded and `undefined` is returned; `getUrl` is reached only by a dynamic import inside the live branch. Cache reads use `cacheFile()` and `MANIFEST` from `espn.mjs`. Core URLs are cached as https with the query stripped, which is how the probe fetched them; eventlog `$ref`s are http with `?lang=en&region=us`, and `canonCore()` fixes both.

Code: `pipeline/fill-espn.mjs` (CLI, plans, writing) and `pipeline/lib/fill/`:

| File | What |
|---|---|
| `espn-cache.mjs` | URL builders, `readCached`, `fetchedAt` (manifest, else file mtime), `Fetcher`, `espnHostBusy` |
| `parse.mjs` | pure parsers: per-event stat record, eventlog, core athlete, team roster, core competition, year scoreboard, summary side, presence checks |
| `squads.mjs` | candidate squads from cached rosters (club: harvester index; internationals: `lib/intl/sources.mjs` `scanEspn`) |
| `athlete-fills.mjs` | job 1 |
| `dob.mjs` | job 2 |
| `intl-probe.mjs` | job 3 |
| `fill.test.mjs` | tests against the cache |

## Plans (dry run, 2026-10-21, ledger of 3,150 summaries)

| Job | Exact URLs | Estimated | Total | At 1.5 s |
|---|---|---|---|---|
| `athlete-fills` | 2,111 (877 eventlog, 1,232 stat, 2 squad scoreboards) | 3,418 (1,182 stat behind uncached eventlogs; Vardy ~1,086, Lacazette ~1,150) | ~5,530 | 2.3 h |
| `athlete-fills --no-qualifiers` | 1,454 | 2,970 | ~4,420 | 1.8 h |
| `dob` (one per athlete) | 8,834 for today's 8,835 ids | full scope ~30,400 ids | | 3.7 h now, ~12.6 h full |
| `dob --strategy roster` | 1,171 club-season rosters (3 of them are the check) | full scope ~3,700 rosters plus per-id leftovers | | 0.5 h now, ~2-3 h full |
| `intl-slugs` | 253 year scoreboards | ~420 summaries (4 per slug-season) | ~673 | 0.3 h |

The exact part is the URL list in each plan file. Estimates are labelled, and the formulas are below. All three plans read the ledger and the cache at run time, so rebuild the ledger after the harvest and the numbers move. `athlete-fills` at full scope: Serie A 2002-03 alone has 46 collapsed sides in 306 matches. At roughly 0.2 collapsed sides per Serie A match 2002-08 (about 500 sides) and about 100 team-seasons, that's roughly 500 × 18 + 100 × 35 ≈ 12,500 requests (~5 h), plus whatever the UCL qualifiers add. Rerun the dry run after the ledger rebuild for the real figure.

## Job 1: `--job athlete-fills`

**Targets.** Every side in `data/ledger/anomalies.jsonl` with rule `roster-collapsed` or `roster-missing`, read at run time (the list grows with the harvest), joined to `matches.jsonl` for teams, score, stage and the qualifier flag. Plus `SPECIAL`:

- 184000, Messi's debut v Hungary (Argentina side; Messi's record is forced into the plan whatever the candidates)
- 264119 (WC 2010 QF) and 383241 (WC 2014 SF), both sides
- 264123, the WC 2010 final, flagged optional: also empty, and cheap once the squads are known
- 188764 and 188837, Barca-Udinese, both sides

Internationals take their header from the cached site summary, with a hardcoded fallback. `--no-qualifiers` drops UCL qualifier sides, which the board excludes; today that's 90 of 173 sides and about 1,100 requests.

**Candidate squad (zero requests).** Club: the team's matches in the same season from the harvester index (any slug, so a UCL side borrows league rosters), nearest first by date. It takes up to 3 usable rosters before and 3 after, skipping sides that are themselves collapsed or missing ("usable" = the ledger's collapse test fails and there are 11+ distinct ids). The union of their entries (starters, subs and unused bench) plus the anomaly's keyEvent `evidence` ids is the candidate set. If the season gives fewer than 2 usable rosters, it borrows the neighbouring seasons and marks the side `widened`.

Internationals: cached national-team summaries of the same team, same slug within 60 days, then any slug within 400 days. With fewer than 2 sources, the fallback plans the slug's year scoreboard plus up to 3 of the team's nearest summaries. Today that hits Germany 2010, Netherlands 2010 and 2014, and Spain 2010, because only Argentina's and Portugal's tournaments were ever pulled.

Today: collapsed sides average 26.9 candidates (minimum 19), and all sides average 16.3. The low mean is the UCL qualifier clubs, which have nothing usable in the cache; 78 sides have fewer than 2 sources: 73 qualifiers, 4 World Cup sides and 1 Serie A 2004-05 side.

**Cheapest route, per (team, eventlog year).** The eventlog year is the ledger season (start year) for clubs and ESPN's season year for internationals.

- **direct:** `leagues/{L}/events/{E}/competitions/{E}/competitors/{T}/roster/{athlete}/statistics/0` per candidate per match (a 404 is a cached `null`, harmless)
- **eventlog:** `leagues/all/seasons/{Y}/athletes/{id}/eventlog?limit=300` once per candidate, then the stat record only for the matches it lists with a `statistics` ref. Cost is |union| + at most 18 per side

The planner takes the cheaper one, and eventlog is forced for widened sides because their candidates are loose. Today it's 85 eventlog groups and 42 direct; the split shifts toward direct as the harvest fills the seasons in. Multi-page eventlogs (`pageCount > 1`) get `&page=n`.

**Rows** go to `data/ledger/fills/athlete-matches.jsonl`, one per appearance (`appearances >= 1`), in the club ledger's `player-matches` shape (`pipeline/docs/ledger.md`). The extra fields are `source: "athlete-store"`, `intl`, `fill` (the anomaly rule, `special` or `player-pull`) and `receipt {url, fetchedAt}`:

- `started` = `starts >= 1`
- `subIn` and `subOff` come from `timeStarted` and `timeEnded` (seconds, rounded to the minute: 4190 s is 70'); `sentOff` replaces `subOff` on a red card
- `minutes` = the record's `minutes`, capped at 90, or 120 when the ledger says extra time, or, when the flag is unknown (internationals), when the record says more than 90 (383241 gives Messi 120)
- `goals` `totalGoals`, `pens` `penaltyKickGoals`, `assists` `goalAssists` (check `matches.assistsReliable`), `yc`/`rc`
- `result` from the score; a shootout is a draw
- `athleteId` goes through `id-merge.json`, and `name` is the candidate roster's display name

**Checks.** `athlete-fills.json` carries one line per side: strategy, candidates, sources, records, 404s, apps, starters, subs on, `complete` (11 starters found), and `checks`. The checks are disagreements with the keyEvent evidence (a goal count, or a sub minute more than 2' off), plus squad listings without a stat record. A side that isn't `complete` lost someone outside the candidate set; that's the case for a later eventlog widening, never a guess.

**Vardy and Lacazette** (165648 and 131752, found in cached summaries) get an eventlog for every season (Vardy 2010-26, Lacazette 2009-26), then the stat record for every listed event, club and country. `--athlete-events intl` restricts it to internationals. Match context comes from the club index first, then a cached summary, then the core competition (`leagues/{L}/events/{E}/competitions/{E}`: date, sides, `winner` flags; the score sits behind another `$ref`, so `result` there comes from the winner flags and `resultFrom: "winner-flag"`). Rows carry `intl: true` for senior A internationals (`INTL_SLUG`) and `youth` for youth slugs, so `build-intl.mjs` can take their caps in a later pass. The estimate: 48 stat-ref items per season (mean over the probe's 88 cached eventlog-seasons for Ronaldo, Messi, Henry, Totti and Haaland), 33% of them outside the index (so a competition request each).

**Cached today.** Built from the cache with zero requests: Totti 131335 (90 min, 1 goal), Messi 188764 (started, off 70', matching the keyEvent), 264119 (90) and 383241 (120). Messi 188837 is a DNP record.

## Job 2: `--job dob`

**Which endpoint.** The probe cached all four web endpoints and the core athlete for Ronaldo:

- core `athletes/{id}` (4.9 KB) has `dateOfBirth` "1985-02-05T08:00Z", `citizenship`, `citizenshipCountry`, `birthPlace`, `position`, height in inches, weight in pounds
- web `common/v3/.../athletes/{id}` has only `displayDOB` "5/2/1985" (day first, ambiguous) and no numeric height
- `/bio` has only `teamHistory`, and `/overview` and `/stats` have no bio

So the core athlete is the source: one request per id. The ISO DOB is local midnight Pacific, so the date part is the birth date. `dobOf()` never goes through `Date`.

**Ids.** Every canonical `athleteId` in `player-matches.jsonl` plus `fills/athlete-matches.jsonl`, with the merged-away ids listed as `aliases` (one request per survivor). Today that's 8,835 ids and 253 aliases. The full-scope projection is about 30,400, from the near-complete 2002-03 seasons: 509 ids per league-season, 31% new the next season, 574 UCL-only ids in 2002-03 with churn of at least 0.6, over 25 seasons, before merges. Run the dob job after athlete-fills so the fill ids are in.

**Output** `data/index/athletes.jsonl`: `id, name, dob, nationality, position, height (cm), source (espn-core-athlete | espn-team-roster | wikidata | espn-404), fetchedAt, weight (kg), birthCountry, aliases, receipt, wikidata`. `athletes-build.json` holds the counts, Wikidata join methods and every DOB disagreement.

**`--strategy roster`** (a cheaper option, unverified). The site team roster has the same fields per athlete (tested on the cached Man City roster), so one request per club-season could cover the squad. Today that's 1,171 rosters; at full scope, about 3,700 against about 30,000 single-athlete requests. Whether `?season=Y` is honoured for old seasons is unknown, so the job first fetches 3 rosters: Arsenal 359 eng.1 2003 must list Henry 8039, Barcelona 83 esp.1 2005 must list Messi 45843, and Roma 104 ita.1 2006 must list Totti 10293. On any fail it logs the refusal and falls back to one request per athlete. Ids no roster covered (loans, mid-season moves) get the per-athlete request either way. Club-seasons use the league slug when the club has one, else the UCL slug. Try this first.

**Wikidata: a cross-check, not the source.** It's `pipeline/docs/wikidata.md` with `data/index/wikidata/players.json`, 15,599 players. Its ESPN FC id (P3681) covers 1,659 of them, and 477 of today's 8,835 ids. So a Wikidata-first pull can't replace the ESPN request; it saves about 5%. Each ESPN row gets a `wikidata` block:

- `P3681` exact id join: confidence 1, `dobAgree` compares the two DOBs
- `name+nationality+dob` (unique on the folded name key from `lib/intl/names.mjs` `tokenKey`, over label, labels and aliases, plus citizenship): 0.95
- `name+dob`: 0.85
- `name+nationality`: 0.5 when Wikidata has no DOB, 0.3 with `note: "DOB disagrees: review"`
- `ambiguous` or `name-only`: 0

players.json has no club membership (P54), so the club-season join the coordinator suggested isn't available from the harvested file; add P54 to the harvester if it's wanted. ESPN is never overridden.

**The switch:** `--dob-source wikidata-first`. Ids with a P3681 join and a Wikidata DOB skip the ESPN request and get `source: "wikidata"` and a `receipt` to the Wikidata item (CC0), unless the ESPN record is already cached. Today that's 8,358 requests instead of 8,834, and about 28,700 instead of 30,400 at full scope. Default `espn`.

## Job 3: `--job intl-slugs`

It covers the slugs `research/internationals.md` "Next" left unprobed, with ids from `research/espn-core-probe.md` "Slug list":

- `uefa.nations`
- `caf.nations`, `caf.nations_qual`
- `afc.asian.cup`, `afc.cupq`
- `concacaf.gold`, `concacaf.gold_qual`, `concacaf.nations.league`, `concacaf.confederations_playoff`
- `conmebol.america` (2001-2024)
- `fifa.confederations` (hidden)
- `fifa.worldq.concacaf`, `.afc`, `.caf`, `.ofc`
- `fifa.wcq.ply`

**Enumerate:** `{slug}/scoreboard?dates=YYYY&limit=1000`, the same URL as `pipeline/lib/espn-index.mjs` `yearUrl`, so the caches are shared. Tournament slugs are scanned only in their edition years. Qualifier slugs are scanned every year from 2003, because an empty year costs one request and proves the absence. That's 253 year scoreboards, none cached. Events are kept when completed and grouped by ESPN's `season.year`.

**Sample:** 4 summaries per slug-season, the density of the earlier probes (3 per date, 4-8 dates per slug). The season's dates are cut into 4 strata, taking the first match with a tracked team (the 42 of `research/intl-match-population.csv`, through `canonTeam`), else the stratum's middle match. That's about 420, from the expected edition counts `seasonsEst`.

**Checks per match** (`parse.mjs` `presence`): both sides full (11+ distinct ids, 10+ distinct starters, not collapsed), any roster, starter flags, stats arrays on both sides, keyEvents present (an empty 0-0 summary doesn't pass), goals reconcile to the score, and scorer-only sides (4 entries or fewer).

**Output** `data/index/espn-intl-probe.json`: per slug, the events per year, and per slug-season the events, tracked team-matches, first and last date, sampled, and counts of rosters, starters, stats, keyEvents and reconciled goals, with every sampled match's detail. A live run also prints markdown rows in the style of `research/espn-coverage-ucl-intl.md` §3 to extend those tables.

## Run order once the host frees (harvester ends about 2026-10-22 17:40Z)

0. Local, no requests: `node pipeline/backfill-espn-manifest.mjs`, then `node pipeline/build-ledger.mjs`, so `anomalies.jsonl` and `player-matches.jsonl` cover the full harvest. Then rerun all three dry runs.
1. `--job intl-slugs` (~670 requests, ~17 min). It's the cheapest, it's independent, and it settles the 4,324 unprobed team-matches before the layer-2 scope decision.
2. `--job athlete-fills --no-qualifiers`, then without the flag if qualifier lineups are wanted. This unblocks the waiting gates (Messi's debut minutes, Messi UCL 2005-06, Totti 2003-04) and the Serie A fill. Rebuild the ledger and intl after it.
3. `--job dob --strategy roster`. Its 3-request check decides; if it fails, it falls back to one request per athlete, about 12-13 h, so it runs last and overnight. Run it after the fills so their ids are included.

## Known holes

- UCL qualifier clubs outside the five leagues usually have no usable roster anywhere in the cache (73 sides today). They stay unfilled, or partly filled where a widened season gives candidates.
- Players outside the candidate set (a debutant who never appears in an adjacent roster) are missed. `complete: false` says so.
- The athlete store's own holes (`research/espn-core-probe.md` §7): nothing before 2001; no record where the match had no roster (some friendlies; 184000 may 404 for this reason); Messi's 2007.
- Player-pull rows outside the index and the cache take their result from winner flags (no score).
