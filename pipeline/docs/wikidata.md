# Wikidata: national-team match lineups, and the archive gate

Wikidata (CC0) holds machine-readable match items for men's internationals with lineups and goals. This layer pulls every one dated 1990-01-01 to 2026-10-21, joins them to martj42's CC0 results, and uses them as an independent second source for the FIFA/UEFA archive records (`harvest-archive.mjs`).

```
node pipeline/harvest-wikidata.mjs             # fetch (cached) and build data/index/wikidata/*
node pipeline/harvest-wikidata.mjs --offline   # rebuild from the cache only; a cache miss throws
node pipeline/gate-wikidata.mjs                # gate data/index/archive/<source>.json against it (no network)
node pipeline/gate-wikidata.mjs --source fifa2006,euro2000
```

## The helper: `lib/wikidata.mjs`

Every Wikidata request goes through it. Hosts: `query.wikidata.org/sparql` (POST) and `www.wikidata.org/wiki/Special:EntityData/Qxx.json`.

- One request at a time, at least `WD_GAP_MS` (default and floor 1000 ms) between the end of one and the start of the next, shared across processes through `data/raw/wikidata/.last-request` under a mkdir mutex. `lockProcess()` takes a PID lock so only one Wikidata harvester runs.
- User-Agent per Wikimedia policy: `football-comparator/0.3 (https://drewhoover.com; non-commercial football stats site; pipeline/lib/wikidata.mjs; cached, 1 req/s, one process) node/22`.
- 429 and 5xx back off exponentially, honouring Retry-After. A query that times out at the server (504, a 5xx after 55 s, or a Java `TimeoutException` body) is not retried: it throws `WikidataTimeout`, and the harvester splits that VALUES batch in half and runs each half.
- Cache: `data/raw/wikidata/{sparql,entity}/<sha1[0:2]>/<sha1>.json`, keyed by exact query text or QID; the query is stored with the result. Private data store only, never the public repo.
- Request log: `data/raw/logs/wikidata-requests.log` (status, ms, bytes, label). `WD_OFFLINE=1` makes a miss throw.

Run of 2026-10-21: **268 requests** in all (254 by the harvester, 14 probes), 266 OK, one malformed probe query (400), one probe that hit the 60 s limit (504). The harvester's slowest query took 21 s. No 429s. 391 MB transferred, 237 MB cached. A rebuild costs 0 requests.

## How Wikidata models a match

Checked on Portugal 7-1 Russia, 2004-10-13 (Q115905720), then counted across all items.

| What | Where |
|---|---|
| Class | `P31` mostly `international association football match` (Q17315159); also `friendly match` (Q493386) and stage classes for finals (final, semi-final, quarter-final, last 16, third place playoff, "final of the FIFA World Cup", Copa América Finals) |
| Date | `P585` (day precision; 546 candidates carry only a year, or a fake 1 January) |
| Teams | `P1923` participating team, qualifiers `P3831` object has role = home team (Q24633211) / away team (Q24633216), `P1351` goals scored. Team items are `men's national association football team` (Q135408445) or the older `national association football team` (Q6979593) |
| Lineup | `P710` participant, one statement per player: `P54` team, `P1618` shirt number, `P413` position (goalkeeper Q201330, captain Q715772). **No start/sub flag and no minutes on P710.** |
| Goals | `P1363` points/goal scored by: `P518` team, `P6887` period (first half / second half / first or second period of overtime), `P1390` minute **into the period** (Ronaldo's 69' is second half +24; a second-half value over 45 is stoppage time, 90+3 = +48), `P1443` method (penalty, own goal) |
| Events | `P793` significant event: substitute (Q784121) with `P710` player on, `P1365` player replaced, `P1390` + `P6887` minute, `P518` team; yellow card, red card, yellow and red card; successful / missed penalty shootout kick (with `P1545` order) |
| Competition | `P361` part of (the group or round), `P179` series, `P2094` competition class, `P664` organizer. `P3450` (sports season) is not used on these items |
| Other | `P276` venue, `P17` country, `P1110` attendance, `P1652` referee, `P1346` winner; match ids `P7455` Transfermarkt (6,649), `P7494` Soccerway, `P8319` National-Football-Teams, `P7492` EU-Football, `P13665` FBref |

What the brief guessed and isn't there: `P3062` (not used), goals as `P1351` qualifiers on `P710` (1 match), substitution qualifiers on `P710` (`P1365`/`P1366`/`P9140` in 6 matches). Some items list the team itself as a `P710` participant; the harvester drops those.

## Selection

A candidate is any item with a `P585` date in the window and a `P1923` value of either team class (7,879). Kept as a match: day-precision date, exactly two teams, no list/group/season/tournament/rivalry/two-legged-tie class, and no women's, Olympic, youth, B or regional side in the team labels. 6,790 matches remain (excluded: 546 not day precision, 394 not two teams, 7 non-match classes, 142 non-senior).

## Outputs (`data/index/wikidata/`)

| File | What |
|---|---|
| `matches.json` | One record per match: `qid, label, date, classes, home/away {qid, name, score, role_stated}, part_of, series, venue, attendance, referee, ext_ids, participants [{qid, label, team, shirt, position, role: starter|sub|null, other}], n_home, n_away, goals [{player, team, period_label, time, method}], events [{type, player, replaces, team, period_label, time}], n_subs, martj42 {date, home, away, score, tournament, friendly, score_ok}` |
| `players.json` | 15,599 players: `label, born (P569), citizenship (P27, labelled), labels (16 Latin-script languages), aliases (en, mul), family (P734), ids` |
| `labels.json` | English labels for every other referenced item |
| `survey.json` | Counts below, qualifier censuses, participants-per-side histogram, per-decade figures, request stats |
| `martj42-join.csv` | Every match with its martj42 row (date ±2 days, teams either order after the alias maps) |
| `martj42-miss.csv` | `martj42-only` (martj42 rows 1990-2026 without a Wikidata item, 26,098) and `wikidata-only` (62 items martj42 lacks or that didn't map) |
| `coverage.csv` | Per team and year: martj42 matches, joined Wikidata items, and items with that team's lineup (11+ participants), split competitive / friendly |
| `archive-gate.csv`, `archive-gate-summary.json` | The gate (below) |

Player ids (`PLAYER_IDS` in the harvester): ESPN FC P3681 (1,659 players), Transfermarkt P2446 (15,556), FBref P5750 (13,686), National-Football-Teams P2574 (14,576), Soccerway P2369 (11,430), FIFA (archived) P1469 (7,388), EU-Football P3726 (11,016), 11v11 P12551 (2,358), UEFA P2276 (7,561), WorldFootball (old) P2020 (11,303). There is no RSSSF property. 15,474 have a date of birth.

## What's there (2026-10-21)

- **6,790 matches; 6,728 join martj42** (6,533 with the same score: 177 items carry no score qualifier, 16 store a shootout-inclusive score, a few awarded 3-0 forfeits differ, and the 2002 World Cup semi-final Brazil 1-0 Turkey, Q115495755, is wrong in Wikidata). Unjoined: Catalonia and Basque regional sides, CIS 1992, placeholder 1 January dates.
- **Lineups:** 6,513 with 22 or more participants, 6,506 with 11+ on each side. Per side the mode is 14 (11 + 3 subs); P710 lists the players who appeared, not the bench (the archive gate finds an unused sub listed in 24 of 603 compared matches, 4%).
- **Goals:** 5,994 matches with `P1363` goal statements (17,960 goals, nearly all with minute and half); in 5,948 the count equals the score.
- **Substitutions:** only 660 matches have `P793` substitution events (5,028 subs, with minutes), mostly 2018 onward (15 in the 1990s, 127 in the 2000s, 190 in the 2010s, 287 in the 2020s). 104 of them, all from 2026, list the starters in `P710` and the substitutes only in the events; the harvester adds those substitutes to `participants`. In the other matches there is no start/sub flag at all.
- **Coverage of martj42 team-matches 1990-2026:** competitive 12,498 of 44,126 (28%), friendlies 466 of 21,516 (2%). It's a UEFA layer. Competitive 1998-2008: Portugal 73/75, England 71/75, Spain 79/79, Germany 80/81, Italy 79/79, Netherlands 72/72, France 87/87; Argentina 18/81, Brazil 37/117, Mexico 26/125, Japan 22/114, Egypt 6/92. From 2009, the big UEFA sides are at 99-100%. Friendlies are 1-6% for every team except **France, 100% in every year from 1991** (67/67 1998-2008, 83/83 since; 4 of 5 in 1990).
- **Gaps inside UEFA:** the Euro 2000 play-offs (November 1999, eight legs) are missing.

## The archive gate: `gate-wikidata.mjs`

For each parsed archive record it finds the Wikidata match (date ±2 days, teams either order through `canonTeam`), then per side compares the archive players who appeared (starters, plus subs with an `on_min`; for `fifa1998` a sub without minutes is "unknown") to the Wikidata participants credited to that team.

Name matching, best first, one-to-one per side:
1. Token sets after diacritic folding (ß, ø, æ, ł, đ, ı folded; particles like da, de, van dropped), against the label, 16 language labels, aliases: exact set (4), one side's tokens all within the other's (3; handles name order, `CRISTIANO RONALDO` v `Cristiano Ronaldo dos Santos Aveiro`, Spanish mononyms through the Spanish label), fuzzy tokens (2), family-name token with the same shirt (1). Shirt number adds a tie-break.
2. A second "loose" pass pairs leftovers on the same side by transliteration-folded surname similarity (≥ 0.7), with the archive surname taken from FIFA's capitals. A hard veto applies where both sides give a given name and they clearly differ (Shota v Archil Arveladze). These count as matched but are reported separately (`matched_loose`, `loose_pairs`). On a read of all 150 distinct loose pairs, about 4 are wrong (Dejan Stanković paired with Dragan Stojković, Armen Avagyan with Artashes Adamyan, Bengt with Anders Andersson, Albert with Bart De Roover). So treat a loose pair as a probable name form, not a proven one.

Scorers: archive non-own goals mapped to QIDs through the lineup match (UEFA goal lines carry surnames, resolved against the side's participants) against Wikidata's non-own-goal `P1363` players, as multisets. Minutes are compared within one minute (archive `min + added` against Wikidata period start + `P1390`).

`archive-gate.csv` columns: `source, source_id, date, home, away, score, wikidata, status (compared | wikidata-no-lineup | no-wikidata-item), date_offset, swapped, arch_appeared, arch_unknown_1998, wd_listed, matched, matched_exact, matched_loose, players_matched (matched/appeared), subs_used, subs_in_wd, wd_unused_subs_listed, full_agree, archive_only, wikidata_only, name_form_pairs (same-shirt leftovers), loose_pairs, scorers (agree | disagree | wd-no-goals | na), scorer_detail, goal_minutes (ok/n)`.

### Results, 2026-10-21 (the archive harvester was still filling `fifa1998` and `fifa2002`; rerun when it finishes)

| Source | Parsed | Wikidata item found | UEFA zone found | Players matched (strict) | Full lineup agreement | Scorers agree | Goal minutes ±1 | Matches with every used sub in Wikidata |
|---|---|---|---|---|---|---|---|---|
| euro2000 | 61 | 59 | 59/59 (play-offs 0/2) | 99.4% (98.2%) | 85% | 98.3% | 91% | 97% |
| euro2004q | 60 | 60 | 58/58 | 99.2% (98.5%) | 80% | 98.3% | 92% | 92% |
| fifa1998 | 642 | 228 | (no zone field) | 98.0% (94.5%) | 60% | 95.6% | 91% | 79% |
| fifa2002 | 420 | 218 | 170/171 | 99.2% (96.3%) | 79% | 95.0% | 95% | 91% |
| fifa2006 | 62 | 21 | 20/20 | 98.4% (96.8%) | 70% | 95.0% | 97% | 80% |
| fifa2010 | 60 | 19 | 18/18 | 99.8% (98.7%) | 95% | 100% | 98% | 95% |

UEFA-zone records found: 325 of 326. Outside UEFA the gate has almost nothing to compare: CONMEBOL 1 of 82, CAF 0 of 66, AFC 1 of 28, CONCACAF 0 of 39, OFC 0 of 8 (2002-2010 sources; fifa1998 records carry no zone).

Mismatch causes (players): transliteration name forms paired loosely 431; Wikidata lacks a substitute who came on 96; Wikidata lists a player the archive doesn't 112, plus a starter the archive has and Wikidata doesn't 83 (mostly FIFA 1998, where FIFA lists 10 or 12 starters and doubles players under two name forms, and genuine picks of a different player); Wikidata lists an unused substitute 25; same shirt with names too different to pair 17. Goal-minute disagreements are 2-5 minutes, source against source (UEFA 2000 writes stoppage time as 90).

### What this means for using it

- For UEFA competitive matches 1990-2026 Wikidata is a usable second source for who appeared and who scored. It names starters and used subs together, and it can't say who started (except the 660 matches with substitution events).
- It doesn't help gate non-UEFA qualifiers or friendlies (France excepted).
- The FIFA 1998 disagreements are mostly FIFA's own (see `harvest-archive` gates); the gate's `archive_only` / `wikidata_only` columns are the review list.
