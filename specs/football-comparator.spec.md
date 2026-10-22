# Football Comparator: build spec

Written 2026-10-21 from `research/` and `pipeline/`. No site code exists; this is the stop for review.

Numbers in braces (`{g}`) come from the ledger once the club harvest finishes. Written-out numbers are publishers' figures the gates in `data/gates/` pin.

## 1. The product

Football Comparator is the NFL, WNBA and NBA Comparator for club and international football. A reader builds a sentence about players or teams at the same point in a career or a season, and the board ranks every career (or every team-season) by its value at that point. Football has no league that owns a career, and the discourse names the competition in every claim (23 of 35 viral factoids are one league, 17 of them Premier League only). So the sentence gets a sixth slot for the competition, and every number on the page carries it.

The sentence is: **who · did what · how much · over which appearances · in which competition · against whom.** The competition slot (`scope`) is one of the five leagues (Premier League by default), the Champions League proper (qualifiers excluded), or the opt-in career view (the five leagues, the Champions League and senior internationals together).

**Haaland vs Messi, cross-league.** The board is Premier League goals through the first 111 Premier League appearances. The sentence reads "Players with the most Premier League goals through their first 111 Premier League appearances, since 2002-03." Haaland's row reads "Erling Haaland has 100 Premier League goals through his first 111 Premier League appearances, 1st of {K}." Messi has no Premier League appearances, so he can't be a row. He can be the panel's peer: the picker offers the board's top 40 and a finder, and a peer from another league is evaluated with the same query and his own league in the slot. When the two leagues differ, each number carries its league noun: "Lionel Messi had {g} La Liga goals through his first 111 La Liga appearances." When they match, the league is said once. The crossings and the to-match line read both curves at the same ordinal, and the comparison card's heading is "Haaland in the Premier League vs Messi in La Liga, through 111 appearances." The URL carries the peer's competition as `vsc=laliga` only when it differs from the board's.

**Fastest to 50 Champions League goals.** The sentence reads "Players fastest to 50 Champions League goals, by Champions League appearances, qualifiers excluded, since 2002-03." Haaland's row reads "Erling Haaland reached 50 Champions League goals in his 49th Champions League appearance." Van Nistelrooy's 62 (UEFA's figure) sits out, because his Champions League career began before 2002-03; the board says how many careers sat out. Switching `how` to youngest gives "Lionel Messi was 24 years 284 days old at his 50th Champions League goal, in his 66th appearance."

**Ronaldo vs Messi, career view.** The sentence reads "Players with the most goals through their first {N} league, Champions League and international appearances, since 2002-03." Ronaldo's window starts at Manchester United in 2003-04, because Sporting's 2002-03 season isn't in the ledger, and the words say "his first {N} appearances from August 2003". Both carry a `complete` international badge (gated RSSSF logs: Ronaldo 233 caps and 146 goals, Messi 207 and 125). The career view isn't Opta's career total: the ledger has no domestic cups, Europa League, super cups, Club World Cup, Saudi Pro League or MLS, so 981 and 936 stay `not-reproducible` and the Method says so.

## 2. What changes from the NFL/WNBA/NBA engine

**The scope slot and its defaults.** `scope` takes `pl` (default, omitted from the URL), `laliga`, `seriea`, `bundesliga`, `ligue1`, `ucl` and `career`. A league scope counts that league's appearances only, which is how "fastest to M" is framed everywhere (Haaland 100 in 111, AGENTS.md). `ucl` counts proper stages only and has a qualifiers toggle (`qual=1`, "qualifiers included"), because UEFA publishes both of Ronaldo's 140 and 141. The toggle replaces the siblings' `scope=all` playoff switch, which football doesn't need. `ordinals.jsonl` already has per-competition ordinals (`compApp`, `compStart`, `compSeason`, `tgn`), with UCL qualifiers in their own sequence.

**Appearances and age as clocks, starts secondary.** The default sequence is `apps`. No factoid in the corpus counts starts. `starts` stays a sequence because the starter flag is clean from 2002-03. Age is a new window ("goals before turning 25") and a new reading ("youngest to M", the age at the appearance where the sum reaches M). Five gates need it, from Messi's 24y 284d to Yamal's 16y 87d.

**The team entity from day one.** Futility is almost all team-level and Premier League scoped (Derby's 11 points, Sheffield United's 104 conceded, Wolves' 18-game winless start). `team-factoids.json` defines the team ledger: one row per team per league match with GF, GA, result and points; team-season P, W, D, L, GF, GA, GD, points on the pitch, table points (after deductions), position, points per game, and games left at clinch. Runs go across seasons and skip seasons spent outside the league (Arsenal's 49; Sunderland's 20, which skips their two seasons down). "Earliest" means the clinching team's own games left, computed on points (Southampton 2024-25 with 7 left), and the Method names the by-date reading (Derby, 29 Mar 2008). It reads match headers, not rosters, so it's complete where a roster collapsed.

**Per-competition era floors in the words.** Goals and appearances start 2002-03 in the Premier League, La Liga, Bundesliga, Serie A and the Champions League proper, and 2003-04 in Ligue 1 (ESPN misfiles 2002-03). Assists start later, league by league: Premier League and La Liga 2005-06, Bundesliga 2006-07, Ligue 1 2007-08, Serie A 2008-09, Champions League 2006-07. The NBA engine already does this per stat (`Stat.since`, `eraBound`, `board.early`, `board.partial`). Football keys `since` on the stat and the competition together. UCL qualifiers are excluded from the board and flagged, never dropped.

**League and tier colour on the curve.** Each segment of a career curve is coloured by its league, with the Champions League and internationals as their own colours. In v1 every club row is top tier, because the ledger holds only the five top flights. A relegated season (Juventus in Serie B, 2006-07) has no rows, and a curve drawn against age shows it as a flat stretch labelled "Serie B, not covered". Tier matters once a second tier is harvested. The hues come from design takes.

**A club's league is a property of the season.** The team key carries no league; the team-season row does. A league's team board includes a team only in its seasons in that league, and "the team's first N games of a season" means its games in that competition.

**The appearance definition and the played floor.** An appearance is a start or a sub appearance, any minutes, with `APP ≥ 1` where the match has stats. `APP` is what drops the injured Messi from the 2006 final's 20-man "starting" list. A clean-game test (`max: 0`, "no goal", "no card") needs a floor so a one-minute cameo can't build a run. The proposal is `PLAYED_MIN = 60`, the fantasy Premier League's rule for a clean sheet, inside `holds()` as in the siblings. A window with a null `minutes` value inside it sits out a floored test.

**International rows with per-player coverage.** `players.json` in `data/ledger/intl/` gives every person `intl_coverage`: `complete` (an RSSSF log, 4,702 people), `partial` (no log, built from the archive, ESPN, Wikidata and martj42, 23,054 people) or `none` (Vardy and Lacazette before Wikidata). In the career view a `complete` player ranks normally. A `partial` or `none` player sits out the ranking and is counted in the sat-out line ("{k} careers sit out: their internationals aren't fully covered"). His own page and panel still draw the curve, with the international segment dashed and the badge "internationals not yet covered". International rows carry appearances and goals; starts and minutes are filled only where the archive or Wikidata gives them, so career boards offer appearances and goals only. The career view's floor is 2002-03 on both sides, so a cap before it doesn't start a window (Henry sits out).

**Date of birth and age windows.** Every player needs a birth date, because a youngest board ranks the whole field. Sources: the ESPN core athlete record (`fill-espn --job dob`), else Wikidata (15,599 players with birth dates, CC0). A player with no birth date sits out age boards, and the board counts him.

**The id-merge table.** ESPN ids split (185 name-plus-club pairs) and names collide (389 homonyms), so the site keys on the post-merge `athleteId` and never on a name. Star ids are pinned and the build throws if one merges away (Messi 45843, Ronaldo 22774, Henry 8039, Totti 10293). The international side joins through `espn_athlete_ids` where an ESPN international gives one, and through a reviewed merge table otherwise.

**Corrections with receipts in the panel.** Sources are never edited. `data/corrections/intl.json` holds 49 corrections, each with a receipt string-checked on every build (`intl-0001`: FIFA's report credits Danny Murphy with Gerrard's goal in Munich). The club side needs `data/corrections/club.json` in the same shape, starting with Ronaldo 2003-04 (one appearance and start short) and Totti 2003-04 if the athlete-store fill doesn't close it. A corrected row is marked in the panel's ledger, and opening it shows the reason and the receipt link.

## 3. The stats catalogue

Player stats, each with its noun and thresholds:

| Key | Noun | Thresholds | Exists |
|---|---|---|---|
| `goals` | goals | 1, 2, 3, 4 | every scope from its floor; internationals from RSSSF |
| `assists` | assists | 1, 2, 3 | leagues and UCL from the assists floors; EPL 2011-12 partial; not internationals |
| `ga` | goals and assists | 1, 2, 3 | from the assists floor |
| `pens` | penalty goals | 1 | typed goals only; null for EPL 2002-03 and 2009-10, so a window containing them sits out |
| `npg` | non-penalty goals | 1, 2 | where `pens` exists |
| `min` | minutes | 45, 60, 90 | leagues and UCL from the floor; internationals partial |
| `starts` | starts | 1 | leagues and UCL; internationals partial |
| `yc`, `rc` | yellow cards, red cards | 1 | leagues and UCL, every season |
| `og` | own goals | 1 | leagues and UCL |
| `win`, `draw`, `loss`, `unbeaten` | wins, draws, losses, unbeaten appearances | 1 | every scope |

Per-game 0/1 stats: `scored`, `brace` (2+), `hattrick` (3+), `assisted`, `involved` (a goal or an assist), `sentoff`, `subscored` (came on and scored). `isUnit` reads them as "a hat-trick".

Team stats: points, wins, draws, losses, GF, GA, GD, clean sheets (GA = 0), failed to score (GF = 0), position, points per game, games left at clinch. Team tests for runs: no win, loss, unbeaten, win, and a home loss without scoring.

Futility ranks first-class, as on the NFL site: fewest points through N games of a season, most goals conceded, longest winless start, earliest relegation by games left, most own goals, most red cards, longest run of appearances without a goal (floored at 60 minutes). The records mine's `goodDir` lists the bad directions, so a team page can lead with a record low.

Keeper clean sheets need goals conceded while he was on and a position column, so they wait.

## 4. Words

`words.ts` builds every sentence, and the claim, the share text, the card and the worker read it. The cases:

- **League scope:** "Players with the most Premier League goals through their first 111 Premier League appearances, since 2002-03."
- **UCL:** "…through their first 60 Champions League appearances, qualifiers excluded, since 2002-03", or "qualifiers included" with the toggle.
- **Career:** "…through their first 300 league, Champions League and international appearances, since 2002-03." The noun names what's counted, so it never claims a career total.
- **Team:** "Teams with the fewest points through their first 38 Premier League games of a season, since 2002-03."

The player unit word is "appearances", never "games". Teams play "games", the word the futility posts use ("an 18-game winless start"). Pronouns are "his" and "their" on cards.

The era bound is the later of the reader's `since` and the stat's floor in that competition, as NBA's `eraBound` does, and the sentence carries it: "since 2002-03"; "Premier League assists since 2005-06"; "Ligue 1 goals since 2003-04". Season labels are "2002-03".

The share text is the open row's claim with its rank and era, else the board's sentence. A cross-league comparison shares both claims: "Erling Haaland had 100 Premier League goals through 111 appearances. Lionel Messi had {g} La Liga goals through his first 111."

The Method section carries, in order:

1. The credit lines. Club matches: ESPN's match data, compiled by us from its public site. Internationals: RSSSF's player logs, credited with acknowledgement, each international row linked to its log and the log's author named where one is; martj42's international results (CC0); Wikidata lineups (CC0); FIFA's and UEFA's archived match reports through the Internet Archive as receipts, with the "worth a donation" line; transfermarkt-datasets (CC0) as a cross-check only, never a source of rows.
2. The era walls in one sentence each: five leagues and the Champions League from 2002-03 (Ligue 1 from 2003-04), assists by league, internationals from 2002-03 in the career view.
3. The appearance definition: a start or a sub appearance, any minutes; the 60-minute floor for clean-game tests; minutes from substitution clocks, capped at 90 (120 with extra time).
4. The 14 publisher-definition differences in `data/gates/README.md`, each with its example: `pl-era-vs-top-flight`, `ucl-qualifiers`, `42-game-seasons`, `earliest-by-date-vs-games-remaining`, `appearances-include-subs`, `opta-assists`, `arab-club-champions-cup`, `youth-caps-and-b-teams`, `publisher-count-disagreement`, `run-span-dates`, `calendar-year-competitive-only`, `clinch-moment`, `points-deductions`, `english-tiers-1-4`. They read as sentences ("UEFA counts Ronaldo's 140 Champions League goals without qualifiers and 141 with them. This site does too.").
5. The career view's basis: what it counts, what it leaves out, and why Ronaldo's 981 isn't on it.
6. Ranks, the sat-out lines, the coverage badge, and the reader-correction ask.

## 5. Entity views

**Player page** (`/player/<id>/`). The name, the mono meta (`clubs · born YYYY · 2004-05 to 2025-26`), then the career curve drawn against age with segments coloured by league and tier, the Champions League and internationals as their own colours, and gaps shown flat. Under it, club spells (club, league, seasons, appearances, goals) and the international block (country, caps, goals, the coverage badge, a link to the RSSSF log). Then the records the mine finds he leads, grouped by stat, each a link to its board with `t` set, as on the NFL and NBA pages.

**Team page** (`/team/<slug>/`). "Fans want to see what they're good at." The page leads with what the team leads, glory or futility, from the same mine filtered to the team: "Arsenal: 49 league games unbeaten, the longest since 2002-03." Then the season-by-season strip (league, position, points), the runs, and the players who lead something for the club. Every team in the ledger gets one, including the ones that went down.

**Competition board.** The root is the Premier League board. Named boards (NBA's `landing.ts`) give marquee queries their own paths (`/fastest-to-50-champions-league-goals/`).

**URL state.** One param per slot, defaults omitted: `scope`, `stat`, `how`, `n`, `seq`, `since`, `dir`, `tests`, `qual`, `who=team` for team boards, `t` the open row, `vs` the peer, `vsc` the peer's competition when it differs.

**The panel.** Inline under its row, as on every sibling. The claim with its rank; "against [peer]"; the last six crossings ("appearance {n} passed Lionel Messi at {g} goals"); the to-match line, which is arithmetic, not a forecast; both curves; the appearance ledger with the opponent, competition, minutes and goals. A corrected row carries a mark, and opening it shows the correction's reason and receipt. An international row links to its RSSSF log.

## 6. Data plumbing

**Compact files.** Another agent is building the encoder now. The contract the site needs from it:

- One column set per competition (`pl`, `laliga`, `seriea`, `bundesliga`, `ligue1`, `ucl`) plus `intl`, in NBA's columnar layout: a players file (id, name, birth date, debut per competition, international coverage, badge text) with each player's slice, and one typed array per column. The page loads the base columns and the default board's stat first, then the columns a query reads.
- Per row: day, season, team, opponent, flags (home, started, start known, qualifier, result), `tgn`, minutes, goals, assists, penalties, cards, own goals. Unknown is a sentinel, never 0 (assists before a floor, pens in untyped seasons, minutes with a missing clock).
- A header per competition with the first season, the current season, each stat's floor, and the team's games played per season.
- A team file per competition built from match headers, with deductions applied from a corrections file.
- Receipts and correction notes live in a per-player file fetched when the panel opens, not in the columns.
- Nothing StatsBomb-derived, and no lineup tables: derived per-player rows with a receipt link, as `research/internationals.md` §Posture sets out.

**The private data store.** `football-comparator-data` holds the raw caches (ESPN about 12 GB, Wayback 0.2 GB, RSSSF 57 MB, Wikidata 237 MB), the StatsBomb Messi fixture and the long `.jsonl` ledgers (the international `player-matches.jsonl` alone is 468 MB). The build reads it with a read-only token Drew sets as a repo secret.

**Refresh.** A push builds from the committed compact files, so a code change never waits on a download. A weekly cron refetches the running season's ESPN summaries through `research/espn/espn.mjs`, rebuilds that season and re-encodes it in the runner, with nothing committed back. International rows refresh by hand after each international window.

**Gates.** `src/lib/query.test.ts` loads `data/gates/factoids.json` (33 gates), `team-factoids.json` (18) and `club-seasons.json` (18 rows), truncates the ledger at each `as_of`, asserts every `checkable: "full"` assertion, and prints the rest with their reason. `scripts/gate.mjs` prints the same table.

**Out of the public repo:** `data/raw/`, the long `.jsonl` ledgers and indexes, the StatsBomb fixture, and anything over a few MB that the page doesn't download. The `.gitignore` goes in before the first `git add`, and the add uses an explicit file list.

## 7. Open decisions

1. **v1 scope.** All five league boards plus the UCL at launch, or PL plus UCL only? I'd ship all five plus the UCL with the Premier League as the default. The harvest and the engine are the same for each, and La Liga and the Bundesliga carry five factoid gates between them. Serie A depends on decision 5. Does the career view ship in v1 or behind a flag? I'd put it behind `?career=1`. It can't reproduce 981 or 936 without the cups and Europa League, and a "career" board short by a few hundred goals invites the wrong argument. It ships when those competitions are harvested, or when you're happy with the "league, Champions League and international" noun as it is. WDYT?
2. **Which players get internationals at launch.** I'd show international rows for the 4,702 `complete` players and give the 23,054 `partial` ones the badge and a seat in the sat-out count. The 52 marquee players get a hand check against their published totals before launch. Ranking `partial` players with a marker would put short curves in a ranking.
3. **The name.** "Football Comparator", slug `football-comparator`. "FIFA" reads as the video game, and the boards are club leagues. Still good?
4. **LICENSE.** A code-only MIT `LICENSE` plus `data/NOTICE`, saying the derived data is published for viewing under its sources' terms and isn't sublicensed? The siblings have none. It's awkward to add after the first public commit, so I'd do it now.
5. **Serie A 2002-08 appearances.** The athlete-store fill (`fill-espn --job athlete-fills`, about 1.8 hours) should rebuild the collapsed rosters (62 collapsed sides in the 3,150-summary build). I'd hold Serie A's board until the fill lands and the Totti 2003-04 gate (31 appearances, 20 goals) passes. Any match still collapsed after that makes its window `partial`, and the window sits out, as on the NBA site. I'd skip a "±N appearances" label on the board. Is that right, or would you rather launch Serie A from 2008-09 and backfill?
6. **comparator-core or a fork.** NBA Comparator is the newest sibling (launched 2026-10-21) and already has the columnar ledger, per-stat era walls, named boards, the records mine and player pages. I'd fork it now and extract `comparator-core` after football ships, because the scope slot, team entity, age windows and coverage rules would churn a shared API while it's being designed. The cost is a fourth engine kept in step by hand. Or is now the time to extract?
7. **The raw store's host.** 12 GB of ESPN responses is past what a GitHub repo holds comfortably. Private repo for the ledgers and fixture plus an R2 bucket for the raw caches?

## 8. Successes, problems and opportunities

**Successes**

- All 18 club-season and UCL gates pass on the 3,150 cached summaries, with three deliberate moves toward the known figure (Messi 2006-07 goals 14, two Ronaldo red-card minute cuts, Henry 2002-03 penalties null).
- International gates: 13 pass, 1 pending (Messi's debut minutes, which the ESPN fills should settle). Join rates: archive 99.7%, Wikidata 99.1%, ESPN 97.4%, RSSSF 96.4%. RSSSF logs match their stated cap totals for 4,618 of 4,682 players (98.6%).
- RSSSF plus ESPN is complete for 49 of 52 marquee players, and Wikidata has lineups for 1,187 of 1,192 UEFA competitive matches in 1998-2008.
- Two-source gating caught FIFA's report giving Murphy the #4 line Gerrard played (`intl-0001`). Villa's goal against Latvia was settled by UEFA's contemporary report against three short sources, where a vote would have been wrong (`intl-0048`).

**Problems**

- The club harvest wasn't finished at the last build: 45,844 of 48,994 events pending. Every gate above passes on the probe-era sample, and the full-scope run is still owed.
- The transfermarkt cross-check (2012-13 and 2013-14, every player-season) hasn't run. It's the only independent club-side gate at scale.
- The DOB job and the merge review haven't run, so no age board can be gated yet.
- Known residue: Ronaldo 2003-04 one appearance short, EPL 2011-12 assists half missing, no penalty typing in two EPL seasons, some 2002-03 sides with 10 or 12 starters.
- Incidents in AGENTS.md: a research agent fetched all 4,697 RSSSF logs at about 13 requests a second against its brief. The ESPN harvester started on the old module, so its manifest needs the backfill script. Two research briefs named matches wrong (Ronaldo's debut by a year, the Munich match with the home side swapped). Every fetching agent gets the helper by path, a budget, and a check of its request log afterwards.

**Opportunities**

- UEFA already publishes the comparator's shape ("most Champions League goals in their first N games", Haaland leading at every N from 10 to 60). That's the launch board and a known-answer gate in one.
- Live launch copy: Kane's Champions League scoring run and Ronaldo's countdown to 1,000 (981 on 12 Oct 2026).
- An international-only scope (`scope=intl`) could reach back decades for the 4,702 `complete` players, since RSSSF logs aren't bound by the 2002-03 club floor. "Fastest to 50 international goals" needs no new data.
- ESPN's leagues endpoint lists 220 slugs, the old UEFA Cup (`uefa.uefa`) among them. One probe pass over the cups and the Europa League would say whether the career view can reach Opta's basis.
- Team boards read match headers, so they're complete where rosters aren't. That makes the futility boards the most trustworthy thing on the site at launch.
- The errata we've found (FIFA's Munich report, Wikidata's wrong Brazil 1-0 Turkey semi-final, `Q115495755`) can go upstream as drafts for you to read, the way Streak King's Repole errata did.
