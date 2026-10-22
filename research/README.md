# Football comparator: the landscape, in one read

Written 2026-10-21 from three research passes in this folder:

- [league-landscape.md](league-landscape.md): the pyramid, the big five, competitions, national teams, reserve teams, loans, relegation, 13 career arcs, and the Jeter analogy answered.
- [factoids-and-conventions.md](factoids-and-conventions.md): 35 viral factoids with their competition scope tagged, and how 11 publishers (Opta, UEFA, Transfermarkt, FBref, Wikipedia, RSSSF, Guinness, IFFHS, premierleague.com, Soccerway, messivsronaldo.app) define a career.
- [data-sources.md](data-sources.md): every bulk per-match source checked against the ledger pattern, with license posture and where a ledger could start.

## The short version

Football has no league that owns a career. A great player passes through 4 to 6 leagues. Ronaldo's path is Sporting (Portugal), Man Utd (England), Real Madrid (Spain), Juventus (Italy), Man Utd again, Al-Nassr (Saudi). Mbappé and Kane are the concentrated cases at 2 leagues each. Ibrahimović is the scattered case at 7.

The football world draws its counting line by the kind of match, not by the league. An official competitive match for a club's first team, or for the senior national team, counts wherever that club plays. Friendlies, reserve teams and youth internationals do not. That rule produces Ronaldo's 981 and Messi's 936 (the Opta, ESPN and messivsronaldo.app basis, Oct 2026).

So the Jeter question has a clean answer, and it's three answers:

| US frame | Football case | Football's own verdict |
|---|---|---|
| AAA, excluded | Barça B, Real Madrid Castilla, Bayern II (reserve squads of the same club playing real league football lower in the pyramid) | Excluded from every headline total. Wikipedia lists the rows anyway. |
| A bad team in the same league, included | Juventus in Serie B after the 2006 Calciopoli demotion (Del Piero, Buffon, Nedvěd stayed) | Included in career goals and in Juventus club records. Excluded from "Serie A goals" and "top-flight goals". |
| MLB to NPB, stats kept apart | Ronaldo at Al-Nassr, Messi at Inter Miami, Lewandowski at Chicago Fire | Included in full, then discounted in argument. "Europe-only" splits are a standard move in Haaland-vs-Messi articles. |
| Rehab stint in the minors | Kane on loan at Leyton Orient (tier 3) at 18 | Included, credited to the loan club. The test is "first team of a real club in an official match", not "top league". |
| Spring training | Club friendlies, preseason tours | Never counted. This is the whole Pelé dispute: 1,279 with exhibitions, 757 to 778 official. |
| No US equivalent | Senior international friendlies | Counted as full caps and goals. FIFA classes an authorised senior friendly as an "A" international. |

The relegation case is the one that maps worst onto US intuition. A Championship season after relegation is real first-team football and counts in a player's career total, but it drops out of every league-scoped record because the Premier League record book simply doesn't contain it. Football keeps both numbers and names the scope in the sentence.

## What the discourse actually scopes to

The factoid corpus is the strongest signal for the site's default. Of 35 viral claims, 23 are scoped to a single domestic league (17 of those Premier League only), 7 to a single competition (Champions League, World Cup, Euros), 3 to club plus country, 1 to country only, 1 is an award count. The club-plus-country claims are only the GOAT-tier ones (Ronaldo's 900, Messi's 91 in 2012, Mbappé's 300 before 25), and those are also the ones where publishers disagree by 6 to 30 goals.

Two more conventions matter for the engine:

- The unit is appearances and age, never starts. "Fastest to 100 Premier League goals" is Haaland in 111 games against Shearer's 124. "First to 300 goals before turning 25" is Mbappé. Starts exist on FBref match logs and nowhere in the discourse. Minutes and goals per 90 are the analyst's refinement.
- "Fastest to M" counts appearances in that competition only, and UCL figures exclude qualifiers (UEFA's own tables say so). UEFA already publishes the comparator's exact shape: "most Champions League goals in their first N games", with Haaland leading at every N from 10 to 60.

Futility is as common as glory and almost entirely team-level and PL-scoped (Derby's 11 points, Sheffield United's 104 conceded, Wolves' 18-game winless start in 2025-26). Same finding as the NFL site. Teams go in on day one.

England has two record books. "Premier League records" start in 1992-93 when the top clubs broke away from the Football League for the Sky money. "English top flight" goes back to 1888-89 and often names a different holder (most defeats in a season: Southampton 30 in the PL book, Stoke 31 in the top-flight book). The other big leagues have one founding date each: La Liga 1929, Serie A 1929-30, Bundesliga 1963-64, Ligue 1 1932-33.

## So, what the site should do

Make scope a first-class slot in the sentence, with the discourse's default and the discourse's toggles.

1. **Default board: one league.** Premier League first (the audience and 17 of 35 factoids), then La Liga, Bundesliga, Serie A, Ligue 1. "Fastest to 100 goals" means that league's appearances. The PL board defaults to the PL era; "English top flight since 1888" is a later toggle if data ever allows.
2. **Second board: Champions League proper**, qualifiers excluded, matching UEFA and Opta.
3. **Opt-in career view: all senior official matches, club plus country.** Includes domestic cups, continental, super cups, Club World Cup and senior "A" internationals including international friendlies. Excludes club friendlies, B teams and youth caps. This reproduces 981 / 936. The Method names the known swings: the Arab Club Champions Cup moves Ronaldo by 6, RSSSF's youth-inclusive count by 18, Pelé's friendlies by about 500.
4. **Colour each season's segment by league and tier on the curve.** A Serie B year or a Saudi year is then visible instead of silently filtered. This is the honest answer to "does his time elsewhere count": show it, scope it, let the reader toggle it.
5. **Appearances and age as the clocks, not starts.** The WNBA "starts" machinery becomes "appearances" with a sub flag; age windows ("goals before 25") are new to the engine.
6. **The scope rides in the URL and in the sentence**, the same way "playoffs included" does on the NFL site.

Something the sibling sites never had to say: a club's league is a property of the season, not the club. Promotion and relegation mean the ledger carries league and tier per club-season, and "the team's first N games of a season" has to be the games in that competition.

## The data reality

This is the hard part, and it's worse than the sibling sports.

- Nothing licensed, maintained, and reaching before 2012 exists for the big five plus UCL at player-match grain. The one CC0 compilation (dcaribou's transfermarkt-datasets, 2012-07 to 2026-06) is paused indefinitely as of 2026-09-05 because Transfermarkt now blocks the scraper, and the only proposed fix routes through a paid anti-bot service. FBref lost its Opta feed in January 2026 and Sports Reference terms forbid scraping anyway. StatsBomb's open data bars redistribution and commercial use, so it can't feed a public ledger, which is stricter than the sports-site skill currently says.
- The workable spine is ESPN's undocumented soccer JSON API, keyless and reachable from a GitHub Action. Rosters with starter and sub flags plus timed goal and substitution events exist for the big five from 2002-03 (EPL 2001-02) and the UCL from 2001-02. Per-player stat lines with assists arrive later: EPL 2001-02, La Liga and UCL 2005-06, Bundesliga and Ligue 1 2006-07, Serie A 2007-08. Messi's debut (16 Oct 2004, on at 83') and first goal (1 May 2005, on at 88', scored at 90') are both there. Ronaldo's Sporting season is missing (no Portuguese league before 2005).
- The license posture is the same as the WNBA site's: Disney's terms bar automated extraction, and sportsdataverse's CC BY release is what sits between the WNBA site and ESPN. For European football there is no sportsdataverse in between. We would be the compiler, one step closer to the line. Publishing cumulative curves rather than raw rows reduces exposure under every source.
- Internationals: martj42's goalscorers file (CC0) has every competitive international goal since 1916 but no friendlies and no appearances, so it gives "fastest to N World Cup goals" and not caps. RSSSF has cap-by-cap logs for 100-cap players under an acknowledge-us permission. Nothing open covers the Champions League at player grain before 2001-02.
- Era wall, league by league: 2002-03 for the big five, 2001-02 for the UCL, assists per the dates above. Fully covered from debut: Messi, Haaland, Mbappé, Kane, Salah, Lewandowski's Dortmund years onward. Partially covered: Ronaldo (from Man Utd 2003-04), Zlatan (from Juventus), Henry (last 5 Arsenal seasons), Shearer (last 5 seasons). Gone: Zidane's Juventus years, Ronaldinho's PSG year, everything before 2001.
- The 2002-2012 coverage map above comes from 3 sampled matches per season. Before trusting it, a gate has to sum ESPN goals per player-season against known answers (Messi 2004-05: 7 apps, 1 goal; Henry 2002-03: 24 PL goals) and against transfermarkt 2012-2026.

## On the name

"FIFA Comparator" would read as a video-game ratings tool. Every top result for "fifa compare players" is about EA's game ratings (FIFA 19 through 23, renamed EA Sports FC in 2023 when the license lapsed over a fee dispute). FIFA is also the governing body of international football specifically, and the site's main boards are club leagues. "Football Comparator" matches the audience's word for the sport and the sibling pattern (NFL Comparator, WNBA Comparator) as closely as a sport with no single league can. The directory stays `football-comparator`; renaming it is one `mv` later if you change your mind.

## Where it landed (later the same day)

The ESPN completeness probes and the StatsBomb read are done. The decision is in [beachhead.md](beachhead.md): start at 2002-03 for the five leagues and the Champions League, built from ESPN with nine repair rules, Serie A as the one open sub-decision (2005-06 or 2002-03 with an appearances flag), internationals out of v1 because qualifiers and friendlies are patchy, StatsBomb as a Messi test gate and not a published source. Probe reports: [espn-coverage-leagues.md](espn-coverage-leagues.md), [espn-coverage-ucl-intl.md](espn-coverage-ucl-intl.md), [statsbomb-license.md](statsbomb-license.md). Scripts and a 623 MB response cache sit in `espn/`.

Internationals were then re-opened at Drew's suggestion of the Wayback Machine. The plan is in [internationals.md](internationals.md): RSSSF's 4,697 per-player cap logs plus ESPN as the spine (49 of 52 marquee players exact), FIFA's archived 1998-2010 qualifier reports and UEFA's Euro 2000 pages as a complete competitive fill (about 4,200 requests), Wikidata lineups as the gate, friendlies player-driven. Reports: [espn-core-probe.md](espn-core-probe.md), [intl-gap.md](intl-gap.md), [wayback-internationals.md](wayback-internationals.md). The core probe also dissolved the Serie A question: it starts at 2002-03 with the others.
