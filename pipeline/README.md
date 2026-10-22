# pipeline/

## harvest-espn.mjs: fill the raw ESPN cache

Enumerates every played match for `eng.1 esp.1 ita.1 ger.1 fra.1` and `uefa.champions` (with `uefa.champions_qual` from 2020-21) from 2002-03 to the running season, then fetches every match summary that isn't cached yet. It builds no ledger. The ledger builder reads the cache and the index this writes.

```sh
ESPN_GAP_MS=1500 node pipeline/harvest-espn.mjs --dry-run   # plan and ETA, no summaries
ESPN_GAP_MS=1500 nohup node pipeline/harvest-espn.mjs >> data/raw/logs/harvest-espn.out 2>&1 &   # the full run, resumable
tail -f data/raw/logs/harvest-espn.log
```

Every request goes through `research/espn/espn.mjs`: one request per `ESPN_GAP_MS`, backoff on 429/5xx, and every response cached forever under `data/raw/espn/` (key = sha1 of the URL). Run one ESPN process at a time. Rerunning skips cached summaries, so a killed run picks up where it stopped. Ctrl-C finishes the current request and saves.

Copied from the probe (`research/espn/enumerate.mjs`, `season-index.mjs`) into `lib/espn-scope.mjs`, with the evidence in `research/espn-coverage-leagues.md` §1/§4, `espn-coverage-ucl-intl.md` §1 and `espn-core-probe.md`:

- **Enumeration** is `{slug}/scoreboard?dates=YYYY&limit=1000`, one request per calendar year. A season needs two, and neighbouring seasons share them. That covers the UCL too: the year scoreboards hold every team-schedule event, qualifiers included (checked for Barcelona 2008-09 and Real Madrid 2024-25), and cost about 1/40 as much.
- **Season by match date** (July to June). Between May and September, ESPN's `season.year` wins when it is one off: a UCL qualifier on 2009-06-30 belongs to 2009-10, and the COVID 2019-20 season ran into August 2020. Such rows carry `seasonBy: "espn-year"`.
- **Played** = `STATUS_FULL_TIME`, `FINAL_AET`, `FINAL_PEN`, `FINAL_AGT` (away goals) or `FINAL_ABANDONED`. Ghost `POSTPONED` rows are dropped.
- **Stuck rows** are played league matches ESPN never closed: five La Liga 2022-23 matches at `SCHEDULED` with real scores, Bastia v Lyon 2016-17 and Nantes v Toulouse 2025-26 at `ABANDONED`, and the probe's three (Sampdoria v Reggina 2003-04, Bordeaux v Nantes 2003-04, Betis v Athletic 2007-08). A `SCHEDULED` or `ABANDONED` row is kept, with `stuck: true`, only in a finished season whose home/away pairing has no played row. Its score may be a placeholder.
- **Excluded**, and listed in `excluded[]` with `excludedBecause`: Bundesliga, Ligue 1 and Serie A relegation playoffs under their own slugs; Serie A 2004-05 playoff ids 183904/183905; and the EPL 2009-10 re-ingest (ids around 678k, no rosters, foreign keyEvents). EPL 2009-10 keeps the 357 legacy ids plus the 23 Burnley fixtures that ESPN filed under the 2013-14 slug with legacy ids.
- **Not harvested:** the UCL 2004-05 Q1 and part of Q2 exist only as 34 `FIXTURE_NO_LIVE` placeholders with no score. ESPN has no 2003-04 or 2004-05 first qualifying round and no 2024-25+ preliminary round.
- **Completeness** is printed for every league-season: 380 or 306 played, every team present, no repeated pairing. The UCL proper stage must be 157 (2002-03), 125, 119 (2019-20) or 189 (2024-25 on). `KNOWN` marks a tolerated real shortfall (Ligue 1 2019-20, 279 matches), and `RUNNING` marks the season in progress. Anything else prints `FAIL` and is named in the log.

### Flags

| Flag | Effect |
|---|---|
| `--dry-run` | Enumerate (and write the index), print completeness, the summary request count and the ETA; fetch no summaries |
| `--limit N` | Fetch at most N uncached summaries (smoke tests) |
| `--leagues eng.1,uefa.champions` | Restrict to these slugs (`uefa.champions_qual` is its own slug) |
| `--seasons 2002-2005` | Start years 2002 to 2005 inclusive. `2004` or `2004-05` is one season. Default: 2002 to the running season |
| `--refresh-season 2026` | Re-pull the scoreboards for calendar years 2026 and 2027 (those not in the future) with the helper's `nocache` option, which refetches and overwrites the cached copy under the same URL, then re-derive the index |

The index remembers which year scoreboards it was built from (`sources`). A run re-enumerates a slug only when the scope needs a year it lacks, `--refresh-season` touches it, or `RULES_VERSION` in `lib/espn-scope.mjs` changed. Re-deriving reads the other years from the cache at no cost. Check results carry over by event id. Summaries of matches under 48 hours old are deferred, because ESPN still edits them and the cache is forever. To pick up new matchdays in the running season: `--refresh-season 2026`, then a normal run.

### Outputs

**`data/index/espn-events.json`**: `{ schema, sources, rules, unplayed, refreshed?, updatedAt, excluded: [...], events: [...] }`, one event per line. `unplayed[slug][season]` tallies the statuses that were dropped. Each event:

| Field | |
|---|---|
| `slug`, `season` (start year), `seasonLabel` (`2002-03`) | |
| `date` (ISO, UTC), `id` | ESPN event id; the summary is `{slug}/summary?event={id}` |
| `homeId`, `homeName`, `awayId`, `awayName`, `homeScore`, `awayScore` | from the scoreboard |
| `status` | ESPN status name |
| `seasonSlug`, `seasonYear`, `seasonType` | ESPN's own filing (the UCL round lives in `seasonSlug`: `group-stage`, `league-phase`, `qualifying-third-round`, `knockout-round-playoffs`...) |
| `round` | `altGameNote` or the leg notes (`UEFA Champions League, Qualifying First Round`) |
| `qualifier` | UCL only: qualifying, preliminary or play-off round. The 2024-25+ knockout play-offs are proper stage |
| `seasonBy`, `stuck` | present only when a rule above applied |
| `fetched` | summary is in the cache. `empty: true` if ESPN returned 404 |
| `checked`, `rosters`, `anomalies` | date of the sanity check, [home, away] roster entry counts, reasons found |

**`data/index/espn/{slug}/{season}.csv`**: the same rows flattened, one file per league-season, for eyeballing.

**`data/index/espn-anomalies.jsonl`**: one line per (event, problem): `{ id, slug, season, date, match, reason, detail, at }`. Reasons: `summary-empty`, `header-teams-mismatch`, `header-home-away-swapped`, `header-score-mismatch`, `roster-team-mismatch`, `rosters-missing`, `rosters-short` (<11), `keyevent-team-mismatch`, and `fetch-error` (not cached; a rerun retries it). None of these are fatal. They're for the ledger builder.

### Log format

`data/raw/logs/harvest-espn.log` is appended on every run and mirrored to stdout:

```
<ISO time> start leagues=... seasons=2002-03..2026-27 gapMs=1500
<ISO time> enumerated eng.1 years 2002-2026 (25 new, 0 refreshed): 9190 played, 357 excluded
<ISO time> completeness: 157 league-seasons, 0 unexplained
<ISO time> plan: 48994 events in scope, 1640 cached, 47335 to fetch, 19 deferred (< 48h old), ...; ETA 19h43m at 1500 ms
<ISO time> progress done=100/150 (66.7%) hits=138 misses=100 retries=0 errors=0 anomalies=0 rate=40.3/min eta=1m14s at=eng.1 2002-03
<ISO time> end done=... ; summary: N summaries attempted, N requests, N errors, N new anomalies; scope now X/Y cached; elapsed ...
```

A `progress` line is written every 100 network requests. `hits` counts cache reads and `misses` counts requests; `retries` are the helper's 429/5xx backoffs. `ERROR`, `WARN` and `STOP` lines flag problems. The helper's own backoff messages go to stderr, which is why the full-run command keeps `harvest-espn.out`; the run stops after 15 consecutive fetch errors rather than keep hitting a blocked endpoint.

Order: season-ascending, with leagues interleaved within each season, so a partial run leaves whole early seasons usable.

## harvest-rsssf.mjs + parse-rsssf.mjs: RSSSF per-player international cap logs

The national-team spine: RSSSF's hand-typed, cap-by-cap logs (4,697 men's logs, listed in `research/intl/rsssf-player-logs.tsv`). RSSSF's footer permits copying "provided that proper acknowledgement is given to the RSSSF"; every row carries its `source_url` and every log JSON an `acknowledgement` string. Email RSSSF before publishing.

```sh
node pipeline/harvest-rsssf.mjs --only cronaldo-intlg.html,messi-intlg.html --index-depth 0   # a few pages
nohup node pipeline/harvest-rsssf.mjs --refresh-seeded --include-discovered >> data/raw/logs/harvest-rsssf.out 2>&1 &   # the full run, ~4,870 requests, ~2.7 h, resumable
tail -f data/raw/logs/harvest-rsssf.log
node pipeline/parse-rsssf.mjs --gate            # parse every cached log (~15 s), then the gates
node pipeline/parse-rsssf.mjs --only cronaldo-intlg,messi-intlg --gate   # partial run: writes *.partial.* files, never the combined ones
```

### Fetching

Every RSSSF request goes through `lib/rsssf.mjs`: at most one request per 2 s (`RSSSF_GAP_MS`, floor 2000), a descriptive user agent naming the project and drewhoover.com, exponential backoff (10 s → 5 min) on 429/5xx/network errors honouring `Retry-After`, and a cache under `data/raw/rsssf/<sha1[0:2]>/<sha1(url)>.{json,bin}` keyed by the canonical URL (raw bytes, untouched; 404s cached as misses). `lockProcess()` takes a PID lock (`data/raw/rsssf/.process.lock`), so a second RSSSF process refuses to start while one is alive. `node pipeline/lib/rsssf.mjs get <url>` fetches one page.

The harvester reads the TSV, fetches the index pages first (discovery), then every log, logging progress every 100 pages to `data/raw/logs/harvest-rsssf.log`. A killed run resumes from the cache. Flags: `--limit N`, `--only a.html,b.html`, `--index-depth 0|1`, `--no-indexes`, `--include-discovered` (also fetch logs the indexes link to that the TSV lacks), `--refresh-seeded` (re-fetch only cache entries that were imported rather than fetched here; resumable), `--refresh` (re-fetch everything; not resumable), `--seed <dir> --seed-note "..."` (import already-fetched pages by basename, no network).

State of the cache on 2026-10-21: all 4,697 logs and the 189 index pages are cached. 34 were fetched by `rsssf.mjs` (the smoke test); 4,854 were seeded from the intl-gap agent's earlier fetch (14:12-14:18 that day, about 13 requests a second, no throttle), recorded as `via: "seed: ..."` in each meta file. 30 of 30 refetched pages were byte-identical to the seeded copies. `--refresh-seeded` replaces the seeded copies with throttled fetches of our own.

### Discovery URLs

The 4,697 logs are exactly the union of the log links on these pages (rerun the harvester to pick up new ones; it writes `data/raw/rsssf/discovered-logs.tsv` with `in_tsv` and `linked_from`):

- `https://www.rsssf.org/intlp-countrywise.html` → about 185 per-country pages `miscellaneous/<cc>-recintlp.html` (record internationals per country) plus a few listings (`afcunoffintl.html`, `cata-intlp.html`, `bask-intlp.html`, `double-caps.html`, `oldest-youngest.html`, `colourfulpioneers.html`)
- `https://www.rsssf.org/miscellaneous/century.html` (century of caps / two-score goals)
- `https://www.rsssf.org/miscellaneous/intl-app-trivia.html`
- `https://www.rsssf.org/miscellaneous/intl-goals-trivia.html`

A log is a linked page named `*-intl.html`, `*-intlg.html` or `isra-intlp-*.html`. The old `/players/` tree is a 2008 club archive with no cap logs. On 2026-10-21 the indexes linked 4,712 logs: the TSV's 4,697 plus 15 it lacks (5 Iraqi players, `bah-helal`, `hk-chan-wh`, `ind-mohabib`, `skhvyrin`, and trivia-page links such as `hrkramaric-intl`, `dbennett-intl`, `peru--yotun-intl`, several of them dead links). `parse-rsssf.mjs` picks those up once cached.

### Parsing

`parse-rsssf.mjs` reads only the cache. Per page: decode (BOM, UTF-16 without BOM, UTF-8, else windows-1252), strip tags one at a time (some pages have an unclosed `<A` before the table), find header lines to learn the column order, then read every line that starts with a cap number and holds a date. House formats handled (from `data/index/rsssf-formats.csv`):

| Header | Logs | Exact |
|---|---|---|
| Caps Date Venue Opponent Score Competition | 2,498 | 99.1% |
| Cap Goals Date Venue Opponent Score Competition (match goals + running total) | 899 | 97.7% |
| Cap Date Venue Opponent Score Competition | 663 | 98.6% |
| Caps Goals Date Venue Opponent Score Competition | 466 | 97.2% |
| Czech: Caps Opponent Score Date Competition Minutes Goals [Venue] (has minutes) | 66 | 100% |
| Israeli: No. Date Opponent Venue(Home/Away/country) Result Competition, plus separate FIFA / IFA-only / goals tables | 54 | 100% of stated |
| two-team `dc-*` pages ("for Croatia", "Matches for Spain", bare team-name lines) | ~150 | most |

Details that matter:
- **Tables by kind.** The heading just above a header line marks a table as caps, unofficial (amateurs, war-time, "not by FIFA", B, U-23) or a goal list. Only caps go to `rsssf-caps.jsonl`; unofficial rows are kept in the log JSON under `other_rows`; goal-list rows are counted onto the cap with the same date.
- **Goals.** One token before the date is a running total if the column never falls (or matches the stated total); two tokens are match goals and running total. Running totals restart per team section. When the running total and match column disagree, the match-goals column wins and the row gets `parse_warning: cumulative_mismatch`; neither column is ever derived from the other (the earlier rule let the running total win and gave Mbappé 2 v Gibraltar 2023-06-16 for the page's 1; its cost is Son v Colombia 2017, where the page's goals column reads 1 for a brace). A lone token in a two-column log is placed by column position: in the total's column it means a blank goals cell (0); in the goals column it is goals. `player_goals` is `null` for logs with no goals column (about 3,200 `-intl` logs), never a silent 0.
- **Dates.** d-m-yy, d.m.yyyy, d/ m/yy, yyyy-mm-dd and month names; a loose pattern catches hand-typed slips (`29- 2/12`, `9  7/69`, `26— 3-05`, `29- 3- 0`) and logs a warning. Two-digit years take the century nearest the previous row, never past the page's last-updated year; the base century is the one whose dates best fit martj42.
- **Venue v opponent.** Cells split on tabs or 2+ spaces; single-space runs are split by a lexicon of team spellings (aliases + `former_names.csv` + spellings learned from cleanly split rows, saved as `data/index/rsssf-lexicon.json`).
- **Stated total** (the parse-rate target), first match wins: "Total caps / goals" line; per-team "Caps: 3 for Croatia" / "Caps (Spain): 31" lines summed; "Total Caps"; "Caps:"; the page's own Total Record (per team summed, or the combined one); the intro ("obtained N international caps"); then the TSV. The TSV's `caps_stated` took the first team's number on two-team pages, so it is kept as `caps_stated_tsv` for comparison only.
- **Not encoded:** started/sub and minutes, except the Czech logs (`minutes`) and a handful of footnotes. `started_or_sub` is always `null`.

### Schema

`data/index/rsssf/<slug>.json` per log: `{slug, player, country, team, teams, source_url, fetched_at, fetched_via, page_title, last_updated, caps_stated, caps_stated_source, caps_stated_tsv, goals_stated, rows_parsed, goals_parsed, format, warnings[], acknowledgement, rows[], other_rows[]}`.

Each row (also one per line in `data/index/rsssf-caps.jsonl`, with `slug`): `player, country, team` (martj42 name), `cap_no, date` (ISO), `date_as_written, opponent, venue_or_city, home_away_neutral` (H/A/N), `home_away_source` (`page` or `martj42`), `score` (as written, the player's team first in 99.4% of checked rows), `player_goals` (int or null), `competition` (blank on the page = `Friendly` when the page says "friendlies unless stated otherwise"), `competition_as_written, competitive, started_or_sub` (null), `minutes` (Czech logs only), `notes` (footnotes the row cites), `section` (team on two-team pages), `join` (`{date, home_team, away_team, home_score, away_score, tournament, city, neutral, day_offset, opponent_match}` or null), `source_url`, `line_quote` (the row's line verbatim from the page text after decoding, tag removal and entity decoding).

`join.opponent_match`: `name` (opponent name matches, date ±2 days), `date-typo-suspected` (same team v same opponent with the same score within 62 days: RSSSF typed the date wrong, e.g. Ronaldo cap 162 "14-11-19" = 14 Oct 2019 at Ukraine), `weak` (the team's only match that day ±1, opponent name not recognised or wrong on the page, e.g. Messi cap 157 typed "Argentina" for Uruguay).

`data/index/rsssf-coverage.csv`: `player, country, team, url, caps_stated, caps_stated_tsv, rows_parsed, exact, exact_one_section, miss_cause, sections, goals_stated, goals_parsed, first_date, last_date, join_matched, join_unmatched, join_unmatched_rate, format, parse_warnings`.

### Parse rate (2026-10-21, all 4,697 logs)

- 268,671 official cap rows; 0 logs with no rows.
- **rows = stated total for 4,613 of the 4,677 logs that state one (98.6%)**; 4,621 counting two-team pages where one team's rows equal the stated figure; 4,645 within 2. Against the TSV's numbers: 3,626 of 3,859 (94.0%), held down by the TSV's one-team figure on two-team pages.
- The 64 that miss, by `miss_cause`: 19 pages that state two different totals (the rows match one of them), 2 more with two totals matching neither, 8 where the page has no line for a cap number (e.g. `tun-yahia-intl.html` lacks cap 1), 23 multi-table pages not separated (two teams with no heading, e.g. `libonatti-intlg.html`, `orsi-intlg.html`, `distefano-intl.html`), 8 two-team pages, 1 numbered line not read (`gha-acquah-intlg.html`), 6 unexplained (`riedle-intl.html` 42 rows vs a Total Record of 46 while its own per-type table totals 42; `kam-ndip-intl.html`, `madsen-intlg.html`, `gaetjens-intlg.html`, `abelardo-intl.html`, `mijnals-intl.html`). 20 logs state no total at all.
- Goals: for the 1,191 logs that state a goals total, 1,117 match exactly; most misses are two-team pages whose stated goals are one team's.
- Join to martj42 `results.csv` (date ±2 + teams): 258,972 of 268,671 rows (96.4%). Unmatched rows are mostly matches martj42 doesn't carry: CHAN qualifiers, Arab Cup B-team games, 1950s-70s Africa and the Middle East, and pre-1914 amateur sides.

### Gates (`--gate`, results in `data/index/rsssf-gates.json`; exit 1 on failure)

For Ronaldo (`cronaldo-intlg`) and Messi (`messi-intlg`):
1. Caps and goals against the current Wikipedia infobox (API, cached under `data/raw/wikipedia/`), allowing the RSSSF lag only as far as martj42 has matches after RSSSF's last row (≤5). Ronaldo 233 v 234 (Wikipedia updated 24 Sep 2026), goals 146 = 146; Messi 207 v 208, goals 125 v 126 (the 6 Oct 2026 Benin friendly).
2. Debut: Ronaldo 2003-08-20 v Kazakhstan, matching Wikipedia's sentence. Messi 2005-08-17 v Hungary; the current Wikipedia revision gives only the year, so the date and opponent are the brief's known answer.
3. Rows = the page's stated total (233/146, 207/125).
4. Competitive goals (RSSSF's competition label, which is Wikipedia's split) against martj42 `goalscorers.csv` (own goals excluded), total and match by match: **Ronaldo 124 = 124, Messi 71 = 71, no per-match differences.** Information only: martj42 files the 2014/2017/2019 Superclásicos de las Américas as a tournament, with no scorer rows; counting by martj42's label would give Messi 72.
5. Every cap joins `results.csv`, and any unmatched cap must be one martj42 doesn't have. Ronaldo 233/233 (one date typo joined); Messi 206/207, the miss being Argentina 1-0 Honduras, San Juan, 27 May 2016, which martj42 lacks.

The martj42 files are downloaded once, dated: `data/raw/martj42/{results,goalscorers,former_names}-2026-10-21.csv` (CC0, github.com/martj42/international_results). The parser uses the newest dated copy.

## harvest-archive.mjs: national-team competitive match reports from the Wayback Machine

Recovers the deleted official match reports for World Cup qualifiers 1998-2010 (FIFA.com) and Euro 2000 / Euro 2004 qualifiers (UEFA.com) from the Internet Archive, one record per match with both line-ups, substitution minutes, scorers and cards, each carrying its receipt. The sources and the probe behind them are in `research/wayback-internationals.md` (§1 sources, §4 plan). Friendlies are out of scope: neither body reported them before about 2012, and they're a later, player-driven job.

```
node pipeline/harvest-archive.mjs --dry-run                  # request counts per source, no network
node pipeline/harvest-archive.mjs --limit 60                 # up to 60 pending matches per source, spread evenly (+ known-answer matches)
node pipeline/harvest-archive.mjs --source fifa2006,euro2000 # some sources (also: fifa, uefa, all)
node pipeline/harvest-archive.mjs                            # full run, all six sources
node pipeline/harvest-archive.mjs --gates-only               # recompute gates + known answers from the JSON on disk
node pipeline/harvest-archive.mjs --rebuild                  # re-parse harvested matches from the cache after a parser fix (no network)
```

- **Throttle.** Every request goes through `lib/archive/wb.mjs` (a copy of `research/wayback/wb.mjs` with the same cache dir `data/raw/wayback/` and the same lock, so the one-request-per-2-s gap (`WB_GAP_MS`, default 2000) is shared with any other Wayback script). Backoff on 429/5xx honouring Retry-After; 404/403/410 cached as misses; descriptive user agent. `WB_OFFLINE=1` makes it throw on a cache miss (the dry run uses this).
- **One process.** A lock dir `data/index/archive/.harvest.lock` (holding the pid) stops a second harvester.
- **Resumable.** Records are keyed by the source's match id and skipped on rerun; the JSON is saved every 10 matches and at the end of each source; every response is cached. Ctrl-C finishes the current match and saves. A match that throws (network gave up) isn't stored, so the next run retries it.
- **Log.** A progress line every 50 requests, plus failures and per-source gate summaries, in `data/raw/logs/harvest-archive.log`.
- **Parsers** (in `lib/archive/`): `fifa.mjs` (copied from research: zone index pages, and 1998/2002/2006/2010 report markup), `uefa.mjs` (copied: UEFA history pages, `div.box.Lineup`; the copy fixes a bug where a row holding only an away substitute was credited to home. `research/wayback/uefa.mjs` still has it), `uefa-ms.mjs` (new: UEFA's 2001-03 XSLT "Match Specific" pages), `records.mjs` (parser output to the record schema), `gates.mjs` (gates, martj42 join, known answers).

### Sources and archived URL patterns

| `--source` | Matches | Archived URL pattern | Enumeration | Notes |
|---|---|---|---|---|
| `fifa1998` | 643 | `www.fifa.com/worldcup/archive/edition=1013/preliminaries/preliminary=Z/matches/match=N/report.html` | one CDX prefix query on `.../edition=1013/preliminaries/` (from 2005, limit 20,000), grouped by `match=` id; zone index `preliminary=Z/index.html` | FIFA's 1998 reports often omit substitutes' on-minutes and sometimes list 10 or 12 starters (one player twice under two name forms), so every record is flagged. The 1998 zone pages list results without match links, so no index cross-check |
| `fifa2002` | 777 | `.../archive/edition=4395/preliminaries/preliminary=Z/matches/match=N/report.html` | same | Munich 2001 source error is a warning (see known answers) |
| `fifa2006` | 847 | `.../archive/germany2006/preliminaries/preliminary=Z/matches/match=N/report.html` | same | |
| `fifa2010` | 853 | `.../archive/southafrica2010/preliminaries/<zone>/matches/round=R/match=N/report.html` | same; zone index `<zone>/matches/index.html` (shows only the latest 20 results, so the index cross-check covers ~120 matches) | 2020 extensionless `.../report` captures are a JS app; `report.html` (2011-12) is always tried first |
| `euro2000` | 259 | `www.uefa.com/uefaeuro/season=2000/matches/round=R/match=M/postmatch/lineups/index.html`, else `.../match=M/index.html` | one CDX prefix query on `.../season=2000/matches/`; rounds 1165 qualifiers, 1318 play-offs, 1458-1461 finals | lineups page where captured (112), else the root page, which carries the same box |
| `euro2004q` | 211 | `www.uefa.com/competitions/EURO/FixturesResults/Round=1579/Match=N/Report=MS.html` (play-offs `Round=1580`); fallback `www.uefa.com/uefaeuro/season=2004/matches/round=R/match=N/[postmatch/lineups/]index.html` | ids from the cached `season=2004` history listing (rounds 1579, 1580) and the live `Round=1579` listing; one exact-URL CDX query per match (`collapse=timestamp:8`) | captures before kick-off say "Lineups not yet available", and so do late ones (UEFA blanked the pages after the campaign); the date is read from the newest capture, then the earliest captures after the match are tried. Most matches played after about February 2003 have no post-match MS capture and use the history page (42 of 60 in the smoke run). No attendance on either |

For each FIFA match: the `report.html` capture, else the extensionless one, else up to two other digests from an exact CDX query. For each UEFA history match: lineups page, root page, then two other digests of the root. A match with no parseable capture is still written, with `status: unparsed` (or `not-archived`), the URLs tried as receipts, and teams and score from the zone index where FIFA has one.

### Record schema (`data/index/archive/<source>.json`, an array)

```
{source, source_id, status: parsed|unparsed|not-archived, competition, stage, date (YYYY-MM-DD), home, away,
 score: {home, away, ht, aet?, pens?, raw}, venue, kickoff, attendance, referee,
 lineups: [{team, side: home|away, coach,
            players: [{name, shirt, gk, captain, role: starter|sub, on_min, off_min, off_reason: sub|red|null,
                       goals: [{min, added?, type: goal|pen|og}], cards: [{type: yellow|red|yellow-red, min, added?}]}]}],
 goals: [{side, team, player, min, added?, type, raw}],      // side = the team credited; an own goal sits on the scorer's row
 receipts: [{url: https://web.archive.org/web/<ts>/<original>, timestamp, original}],
 warnings: [], round?, zone_path?, index?}
```

`on_min` is 0 for starters and null for an unused sub (or, in 1998, a sub whose minute FIFA didn't record). `off_min` null means the player finished. Names are as the source spells them (FIFA: `CRISTIANO RONALDO`, `OWEN Michael`; UEFA 2000: `Fabien Barthez`; UEFA 2002-03: surnames only). Nothing is corrected: a source error known from a second source goes into `warnings`, and the corrections layer fixes it later.

### Gates (`data/index/archive/<source>-gates.csv`, summary in `gates-summary.json`)

Per record: **starters** (11 per side), **subs** (sub-off count equals sub-on count, per side), **goals** (goals credited per side equal the score, own goals credited to the other side, none unattributed), and **martj42** (a row in martj42's CC0 `results.csv`, `data/raw/martj42/results-2026-10-21.csv`, within 2 days, same teams in either order after a name-alias map, and the same score). `all_ok` is all four. The CSV carries the failure detail, the martj42 match note, the warning count and the receipt URL. Team names the join couldn't map are listed in the summary for the alias map in `gates.mjs`.

**Known answers** (`known-answers.json`, checked on every run): Portugal 7-1 Russia 2004-10-13 (Ronaldo starts, scores 39' and 69', off 85'; FIFA 36543); Argentina 3-1 Brazil 2005-06-08 (Crespo 3', 40'; Tevez on 82'; FIFA 33887); Germany 1-5 England 2001-09-01 (Owen 12', 48', 65'; FIFA credits Danny Murphy with Gerrard's 45' goal and the record keeps that, with a warning citing the BBC clockwatch; FIFA 19743); France 2-1 Portugal 2000-06-28 (Zidane 117' pen golden goal; UEFA 65183).

### Smoke test, 2026-10-21 (`--limit 60`, 364 matches, 543 requests, 19 min, 2.1 s per request)

Every match parsed at the first capture tried. Gate pass rates over parsed records (starters / subs / goals / martj42 / all four):

| Source | Records | Starters | Subs | Goals | martj42 | All four |
|---|---|---|---|---|---|---|
| fifa1998 | 60 | 80% | 62% | 100% | 100% | 55% |
| fifa2002 | 61 | 97% | 95% | 100% | 97% | 89% |
| fifa2006 | 62 | 100% | 100% | 100% | 100% | 100% |
| fifa2010 | 60 | 100% | 100% | 100% | 100% | 100% |
| euro2000 | 61 | 100% | 100% | 100% | 100% | 100% |
| euro2004q | 60 | 100% | 98% | 98% | 100% | 98% |

The remaining failures are in the sources, not the parsers: FIFA 1998's duplicated or missing starters and unrecorded sub minutes; FIFA 2002 listing 10 Saudi starters twice and a Moldova substitute with no one going off; Costa Rica 3-0 Trinidad dated 2001-03-28 by FIFA and 2001-03-25 by martj42; Burkina Faso v Guinea (2000-07-09) missing from martj42; and the 2012 history page for France 5-0 Cyprus (Euro 2004 qualifier) showing only 3 of the 5 goals. All four known answers pass. The 18 Euro 2004 qualifiers parsed from Match Specific pages pass all four gates.

The full run (about 3,700 more requests, a bit over 2 hours plus CDX latency): `WB_GAP_MS=2000 node pipeline/harvest-archive.mjs`

### Residue, 2026-10-22 (full run: 3,590 records; this pass made 73 Wayback requests)

New flag: `--redo id,id` (with `--source`) re-harvests named matches with the network on, to try captures the first pass never fetched. `--rebuild` now skips a capture that isn't cached instead of abandoning the match.

**Parser and harvester fixes.**
- UEFA history pages mark own goals and penalties only by the icon file (`goals_O.gif`, `goals_P.gif`; the alt text is "Goal" for all three), and the header scorer lists that would say "(o.g.)" are empty on these captures. Own goals were credited to the scorer's team. That was all 8 Euro 2000 goal failures and Romania 2-5 Denmark.
- Captures of one UEFA match differ. The 2018-19 captures drop a starter that the 2011-15 root pages list (Romania v Liechtenstein, FYROM v Yugoslavia, Netherlands v Yugoslavia), and some captures drop a goal or a sub-on event. `harvestHistory` now ranks every candidate by the three lineup gates, keeps the best, and lists the others' failures in `warnings`. Three Euro 2004 qualifiers were fixed by later captures: Bosnia v Norway, Netherlands v Austria, Latvia v Hungary.
- Some FIFA pages carry a stray third lineup block: "Raja Casablanca" in Morocco v Gambia 2000, Mexico in Sweden v Bulgaria 2005. `parseFifaReport` keeps the two blocks named in the header and the record warns. Both matches now parse.
- A FIFA page with a header but no usable lineups keeps its date, teams, score, scorers and referee as an `unparsed` record. Sides are assigned by team name, not by block order.
- UEFA Match Specific pre-match template: the date comes from the centred info cell, and a result box holding a time ("20:00") is not a score.
- Euro 2000 match 54924 (Northern Ireland 2-2 Moldova, 1998-11-18) has no lineups or root capture, only 2021-22 redirects. `parseUefaStatsPages` rebuilds it from the 2019 statistics page (17-man squads; rows 1-11 are the starters, which the commentary's subs confirm) and the commentary page (subs, goals, cards). Its warnings say what was inferred. It passes all four gates.

**Void records.** The `void` field (`VOID` in `records.mjs`) takes a match out of the gates and the ledger, and the summary counts it separately. Georgia v Russia 2002-10-12 (euro2004q 69047) was abandoned and replayed 2003-04-30. Singapore v Palestine 2007-10-28 (fifa2010 300033480) was awarded 3-0 after Palestine didn't travel. martj42 has neither.

**Not recovered.** Gabon 0-4 Morocco (fifa1998 8656). FIFA's page has no Gabon block and only Morocco's 4 scorers and booked players, and Wayback holds exactly one capture. The header is kept as `unparsed`.

**martj42 join.**
- New aliases: Tadjikistan, Yemen Republic, Guam Island (Korea DPR and Kirghizistan were already mapped; their matches failed on the other team).
- Following AGENTS.md, a match whose dates disagree by more than 2 days joins on teams plus score within 31 days, when exactly one row fits. It is flagged `date_conflict`. There are three: Cuba 6-1 Haiti (FIFA 1996-06-10, martj42 06-23), Costa Rica 3-0 Trinidad (3 days), and Mauritius 0-2 Egypt (FIFA 2000-04-20 at Mauritius, martj42 04-09 at Cairo).
- Join rate over parsed records, before → after: fifa1998 640/642 → 641/642; fifa2002 768/776 → 774/777; fifa2006 832/846 → 847/847; fifa2010 848/852 → 848/852; euro2000 258/258 → 259/259; euro2004q 210/211 → 210/210 (the miss was the void Georgia v Russia).
- Matches martj42 lacks, each warned in its record:
  - Chinese Taipei 0-0 Malaysia, 1997-03-27. martj42 has the other five Jeddah-leg matches. This is a plain gap and a candidate for an upstream PR.
  - Guinea's three 2002 group matches: v Zimbabwe 2000-06-18, Burkina Faso v Guinea 2000-07-09, v Malawi 2001-01-28.
  - Ethiopia's four 2010 matches: v Morocco, Rwanda and Mauritania twice, May-June 2008.
  - In both groups martj42 has every other match but none of that team's, consistent with FIFA annulling the results (Guinea disqualified, Ethiopia suspended). They were played, so whether to add them upstream is a judgement call.

**Gate failures by cause** (parsed, non-void). Every failure carries a `source defect:` warning in its record, from `defectWarnings` in `gates.mjs`, and every one is in the source.

| Source | Starters | Subs | Goals |
|---|---|---|---|
| fifa1998 | 142 matches: 79 sides list one player twice under two name forms or shirts, 62 sides list fewer than 11, 14 sides list 12+ with no duplicate | 240 matches: 380 starters marked `(+m')(-m')` with the replacement unnamed (the bench often reads "UNKNOWN"), 404 sides missing a sub-on | 1: Kazakhstan 3-1 Iraq lists 2-2 |
| fifa2002 | 24 (fewer than 11) | 25 (23 sides with no sub-off marker) | 2 (Albania 2-0 Greece credits Karagounis (GRE); an Andrews goal not in the T&T XI) |
| fifa2006 | 4 | 11 | 3 (pages list one goal fewer) |
| fifa2010 | 8 | 8 | 3 (Faroes v Serbia scorers blank; two Singapore pages short of goals) |
| euro2000 | 0 | 0 | 1: Romania 7-0 Liechtenstein, where the 2011 captures omit Popescu's 18' goal, which the 2019 capture has |
| euro2004q | 0 | 8: 7 with one sub-on event missing in every capture (2-4 captures each), and Azerbaijan 1-2 Finland with a phantom 4th substitution | 5: France 5-0 Cyprus (3 listed), San Marino 0-5 Hungary (2), Albania 3-1 Georgia, N. Ireland 0-1 Armenia, Wales 0-1 Russia (the goal missing) |

All four gates now pass: fifa1998 321, fifa2002 725, fifa2006 834, fifa2010 834, euro2000 258, euro2004q 198 (before: 320, 721, 820, 834, 250, 194).
