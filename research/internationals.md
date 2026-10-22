# Internationals: the plan

Written 2026-10-21 from three probes: [espn-core-probe.md](espn-core-probe.md) (930 requests), [intl-gap.md](intl-gap.md) (the match population, the target players, existing coverage, per-team-year CSV at `intl-match-population.csv`), and [wayback-internationals.md](wayback-internationals.md) (472 requests, seven matches recovered end to end, parsers in `wayback/`).

## The short version

The archive idea works, and better than expected for competitive matches. FIFA.com's deleted official match reports are archived for every World Cup qualifier from 1998 to 2010 (643 / 777 / 847 / 853 matches per cycle, complete), each with both XIs, the bench, sub minutes, scorers with minutes, cards, referee and attendance in static HTML, and the parser ran clean on 23 of 24 sampled pages. UEFA's history pages hold all 259 Euro 2000 matches with lineup boxes. Together they fill ESPN's two biggest holes outright: nothing international before 2001 except World Cups, and no 2002 World Cup qualifiers at all.

Friendlies are the hard part, and they're most of the gap. FIFA and UEFA didn't report friendlies before about 2012. The only archived per-match source is 11v11.com, captured for 18 of 20 sampled major-team friendlies, and it's error-prone (a goalkeeper with the wrong identity in 2 of 7 pages, blank substitution fields, minutes off by 1-4). Every 11v11 row needs a second source: BBC for the home nations, Sky 2007-12, worldfootball.net, Soccerway, the DFB site, newspapers.

Two finds change the sizing before any archive work:

1. **RSSSF has 4,697 cap-by-cap player logs**, not just the 100-cap players. That covers 50 of the 52 marquee players exactly (short 28 caps of 6,032, all July-October 2026 lag; Luis Suárez's log is `bijtertje-intlg`, a nickname slug the gap pass missed), at least 340 of the 354 century-club players in the ledger era, and about half of the 50-99-cap band. The two marquee players without a log are Vardy and Lacazette. RSSSF's footer permits copying with acknowledgement; we credit and link per row rather than ask (decided 2026-10-22).
2. **Wikidata (CC0) has machine-readable lineups** for 1,187 of the 1,192 competitive matches the 22 UEFA teams played in 1998-2008. That's an independent gate for the FIFA and UEFA archive rows, and a fill in its own right.

And ESPN's athlete-scoped store, which the first probes never touched, repairs the club-side holes: the 23 "missing" EPL 2009-10 matches are Burnley fixtures filed under the 2013-14 slug with full rosters, and per-player per-match stat records give the right line for the collapsed Serie A rosters and the empty World Cup summaries (Messi 90 min in the 2010 QF, 120 in the 2014 SF, Totti 90 min and a goal in the collapsed Bologna match). The same store lists every match a player was in a squad for from 2001, club and country and youth, so a per-player pull is viable as a fill: about one request per squad listing, roughly 1,850 for Ronaldo's whole career. Its `played` flag counts squad listings, not appearances, so use the per-event record or the season totals.

## The gap, in numbers

14,817 team-matches (11,396 distinct) for the 42 national teams that matter, 1998 to October 2026, from martj42's CC0 results: 5,560 friendlies, 5,270 qualifiers, 612 Nations League, 2,739 tournament finals, 636 minor tournaments. The count matches Wikipedia exactly for Portugal and England and within one for Argentina.

| Covered by | Team-matches |
|---|---|
| ESPN, verified | 4,234 (World Cups 1998+, Euros 2004+, UEFA qualifiers from the Euro 2004 campaign, CONMEBOL from 2008) |
| Wikidata lineups | 468 (UEFA competitive 1998-2008 that ESPN lacks) |
| ESPN, partial | 4,479 friendlies (about half rostered 2001-11, 78% from 2014) |
| ESPN, absent | 1,312 (pre-2001 everything but World Cups; 2002 WCQ; CONMEBOL 2003-05 and late 2007) |
| Unprobed ESPN slugs | 4,324 (Nations League, AFCON, Asian Cup, Gold Cup and their qualifiers, 2004 onward; one probe pass settles them) |
| **Firm gap for an archive** | **3,027**, 78% friendlies, 1,540 of them 1998-2008 friendlies |

For the marquee curves, ESPN plus RSSSF is already complete for 49 of 52 players. ESPN alone would lose 40-47 of the first 50 caps for anyone who debuted before 2001 (Beckham, Zidane, Raúl, Del Piero, Henry, Totti, Buffon) and 34-45 for Salah, Neymar and Son (non-UEFA qualifiers in unprobed slugs). Tournaments-only would be a different stat from Opta's: Ronaldo 121 goals short of 146, Messi 103 short of 126.

## So, three layers

1. **Per-player logs as the international spine: RSSSF plus ESPN.** Parse the 4,697 RSSSF logs (static HTML, done once in the probe), fill the 1-5-cap tail for active players from ESPN's verified 2026 slices, and gate every log's row count against its stated total (93% exact today), competitive goals against martj42 (Ronaldo 124, Messi 71, exact), and every UEFA competitive cap against Wikidata. A player without a log shows club-only with a visible "internationals not yet covered" badge; never mix partial international data in silently. Vardy and Lacazette get an ESPN athlete-store pull plus a few archive matches.
2. **The competitive archive harvest, in full.** FIFA's 1998-2010 World Cup qualifier reports (about 3,500 requests), UEFA's Euro 2000 (260) and Euro 2004 qualifiers (470): about 4,200 Wayback requests, under three hours at one per 2 seconds, 2 GB cached. Gated two-source (Wikidata, 11v11, BBC) because FIFA's own report credits Danny Murphy with Gerrard's goal in Munich. This turns the international layer from per-player into per-match for competitive football, which is what a team board and the journeymen need, and it's cheap.
3. **Friendlies, player-driven.** Fetch 11v11 plus a second source only for matches in which tracked players appeared: about 2,000-3,000 matches, 6,000-7,000 requests, under a day. The full friendly population (about 6,400 matches, 19,600 requests, 3-4 days) adds nothing to any marquee curve and is where the data quality is worst. Defer it.

## Posture

The facts (who played, who scored, when) aren't copyrightable in the US. The live risk is UK/EU database right for a wholesale extraction of FIFA's or UEFA's match database (Football Dataco v Stan James found live match data protected), and reading an archived copy doesn't change that, it only spares their servers. The Internet Archive's terms grant access for research, ask for a descriptive user agent, backoff and caching, and publish no numeric limit for CDX or replay; `wayback/wb.mjs` does all of that, and the probe saw about 30 CDX 503s, all recovered.

Against the standing rule ("never crawl a league site; pages as receipts at reader pace"): the load side fits. The substance side is where layer 2 stretches it, since harvesting every FIFA qualifier report re-assembles FIFA's database. Two things keep it inside: publish derived per-player numbers and curves with a receipt per row, never the lineup tables themselves, and keep the raw archive cache in the private data repo. That's the same posture as the StatsBomb decision. If that still feels like too much, layer 2 collapses to player-driven as well (about 2,500 matches), and the only cost is the team boards for pre-2008 qualifiers.

## Club-side corrections from the core probe

- Serie A can start at 2002-03 with the others. The collapsed rosters are repairable from the athlete store and the plays endpoint (10 of 12 plays carry athlete tags in the collapsed Bologna match), so the beachhead's "2005-06 or flagged" sub-decision is gone. The repair is a per-player pull for the squads of the clubs in those matches, roughly 50 requests per collapsed match, about 600 matches.
- EPL 2009-10 is complete once the Burnley fixtures under the wrong slug are merged with the 357 legacy matches.
- The core competitor-roster endpoint is a mirror of the site summary, not a second source. Don't waste requests on it.
- ESPN's leagues endpoint lists 220 slugs. The confederation qualifier slugs start with the 2006 campaign (played 2004-05); `fifa.friendly` runs 2001-2026 and is the only friendly slug. Hidden historic slugs that resolve: `fifa.confederations`, `global.champs_cup`, `club.friendly`, `uefa.uefa` (the old UEFA Cup).

## Next

1. Decide the layer-2 scope: full competitive harvest or player-driven.
2. One ESPN probe pass over the 4,324 unprobed team-matches (Nations League, AFCON, Asian Cup, Gold Cup, non-UEFA qualifiers).
3. Build the harvesters, in this order: ESPN club ledger (44,000 summaries, ~18 h), RSSSF logs (4,697 pages), FIFA and UEFA archive (4,200 requests), ESPN athlete-store fills, player-driven friendlies. All background, all through the two throttled helpers, raw caches to the private data store.
4. Credit RSSSF in Method and footer, link every international row to its page; no permission email (Drew's call).
