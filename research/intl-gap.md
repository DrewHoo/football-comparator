# Internationals: how big the national-team side is, and how much is already covered

Research pass, 2026-10-21. It sizes the "club and country" career view: goals through a player's first N senior appearances, counted the way Opta and ESPN count Ronaldo's 981 and Messi's 936 (senior "A" matches including friendlies, youth excluded; see factoids-and-conventions.md Part B).

Tags: **[V]** counted or fetched today. **[R]** recalled or second-hand, not checked today. **[E]** estimated; the method is given each time. I made no ESPN API calls and no web.archive.org calls. The ESPN facts come from the two probe reports in this folder, `espn-coverage-ucl-intl.md` and `espn-core-probe.md`.

Receipts are in `research/intl/`:
- every script (`scripts/`);
- the per-team-year CSV (`../intl-match-population.csv`);
- the gap table (`gap-by-era-type.csv`);
- the marquee per-player tables (`marquee-caps-by-type.csv`, `marquee-scope-options.csv`);
- the 698-player century-club table with Wikidata IDs and RSSSF matches (`century-club-targets.csv`);
- the list of all 4,697 RSSSF player logs (`rsssf-player-logs.tsv`).

## Summary

1. **There are 14,817 team-matches to cover:** 11,396 distinct matches for the 42 national teams that matter, 1998-01-01 to 2026-10-06 [V, martj42 `results.csv`, CC0].
   - By type: 5,560 friendlies, 5,270 qualifiers, 612 Nations League group matches, 2,739 tournament-finals matches, 636 minor tournaments.
   - The counts match Wikipedia's results pages exactly for Portugal (255) and England (237) over 2000-2019, and to within 1 for Argentina (267 vs 266).
2. **Target population** (capped players in the big-five-plus-UCL club ledger) [E, Wikidata]:
   - about 7,650 players with a recorded cap count (10,450 counting national-team stints with no count);
   - about 1,550 with 50+ caps;
   - 354 with 100+ caps, an exact list from Wikipedia × Wikidata;
   - 52 in the marquee set.
3. **RSSSF is much bigger than "100-cap players".** It has 4,697 per-player cap-by-cap logs [V]:
   - at least 340 of the 354 target century-club players;
   - 730 of the 1,366 era players with 50+ caps from the 42 teams (53%);
   - 49 of the 52 marquee players. The three without a log are Luis Suárez, Vardy and Lacazette.
4. **The RSSSF logs agree with Wikipedia** on caps, debut date and friendly count wherever I compared. The only differences are a 1-5 cap lag for active players, covering Jul-Oct 2026.
5. **martj42's goalscorers file confirms the brief** [V]. It has 0 goals in any match labelled Friendly, 124 of Ronaldo's 146 (146 minus his 22 friendly goals) and 71 of Messi's 126 (126 minus his 55 friendly goals). It also has no AFCON, Asian Cup or CONCACAF Nations League qualifier goals. It holds goals only, no appearances.
6. **New CC0 find: Wikidata has machine-readable lineups (P710) for essentially every competitive match of the 22 UEFA teams, 1998-2008.**
   - The counts: 1,187 match items with lineups against 1,192 competitive matches in martj42 [V counts; the item-by-item join is not done].
   - That fills ESPN's dead zone: the Euro 2000 qualifiers, Euro 2000 itself and the 2002 WC qualifiers.
   - Wikidata has almost no friendlies.
7. **ESPN verified** [V, two probes]:
   - World Cup from 1998, Euro from 2004;
   - UEFA qualifiers from the Euro 2004 campaign (2002-03);
   - CONMEBOL qualifiers from 2008;
   - friendlies about half rostered 2001-2011 and about 78% from 2014.
   - Nothing international exists before 2001 except World Cups.
8. **The firm gap after ESPN, Wikidata and RSSSF is 3,027 team-matches** [E]: about 31,000 player-appearances that only an archive can supply. 78% of these team-matches are friendlies, concentrated in 1998-2008 (1,540 team-matches). Another 4,324 team-matches (2004-2026, mostly non-UEFA) sit in ESPN slugs nobody has probed.
9. **For the marquee curves, ESPN plus RSSSF is already complete for 49 of 52 players.**
   - It misses 28 of 6,032 caps, all of them post-July-2026 lag.
   - Tournaments-only would miss 4,916 caps (81%), including 36-50 of each player's first 50.
   - ESPN alone would miss about 1,921 (32%) [E].
10. **Recommendation:** v1 should be an internationals layer built from ESPN plus RSSSF logs, plus Wikidata as a cross-check, for every player who has an RSSSF log. Players without a log show club-only, flagged. Don't ship tournaments-only, and don't take on the archive recovery for the full population in v1. Ask RSSSF for dataset permission first.

## 1. Target population

The definition: every player in the club ledger (big five plus UCL, 2002-03 onward) with at least one senior cap.

| Tier | Count | How counted | Tag |
|---|---|---|---|
| Men with 100+ caps, all eras | **698 parsed** (Wikipedia states 699, "as of 6 October 2026", 128 nation codes) | Parsed the main table of https://en.wikipedia.org/wiki/List_of_men%27s_footballers_with_100_or_more_international_caps; 1 row lost to table markup | V |
| … with latest cap on or after Aug 2002 | **627** (121 still active) | `latest` column | V |
| … with a big-five club stint overlapping 2003+ | **301** | Wikidata P54 stints (start/end qualifiers) at clubs with P118 ∈ {Premier League, La Liga, Serie A, Bundesliga, Ligue 1} | E (see caveat) |
| … plus a UCL-club stint, not big five | **+53 → 354** | Clubs from https://en.wikipedia.org/wiki/UEFA_Champions_League_clubs_performance_comparison with any UCL-proper season 2002-03 to 2026-27 (137 clubs, 136 resolved to QIDs) | E |
| … of the 354 with an RSSSF cap log | **at least 339**, really at least 340 | Matched on debut date (±1 day) and caps (±8). The 15 unmatched include Eden Hazard, who does have a log (`ehazard-intlg`), so the true count is ≥340. The other 14 (Guardado, Nekounam, Isaksson, Kawaguchi, Bjarnason, Lee Jae-sung, Mahdavikia, Carrillo, E. Valencia, E. Álvarez, Hakimi, Højbjerg, Jahanbakhsh, Robertson) weren't checked one by one | V (match) |
| All 698 century-club players with an RSSSF log | **652** | same match | V |
| Big-five-ledger players with 50+ caps | **1,186** | Wikidata: 24,000 players with a big-five club stint ending 2003 or later; senior men's national-team stint with P1350 (matches played) ≥ 50 | E |
| UCL-club (not big-five) players with 50+ caps | **+363 → about 1,549** | same, for 19,650 players at the 136 UCL clubs | E |
| Era players (last cap ≥ Aug 2002) with 50+ caps, 42 teams, per RSSSF country pages | **1,366, of whom 730 (53%) have an RSSSF log** | Parsed 42 `*-recintlp.html` pages; a link on the page means a log exists. 100+ caps: 288, of whom 280 have a log | V |
| Big-five-ledger players with ≥1 cap | **4,552** with P1350 ≥ 1; **6,016** with any senior national-team stint | Wikidata, as above | E |
| UCL-club (not big-five) players with ≥1 cap | **+3,096** (P1350); **+4,433** (any stint) | Wikidata | E |
| **Target population, ≥1 cap** | **about 7,650 (P1350) to about 10,450 (any stint)** | sum of the two rows above | E |
| RSSSF logs whose last cap is after Aug 2002, any nation | 2,418 (1,099 for the 42 teams) | from the 4,697 logs | V |
| Marquee set | **52** (the brief lists Ibrahimović twice) | | |

**Caveats on the Wikidata tiers.**
- A club's P118 (league) carries no dates. So a stint at a club that is in the Premier League now, but was in the Championship then, gets counted. The UCL-club test counts any stint at a club that played the UCL proper at some point after 2002-03, including reserve and fringe players. Both tests over-include.
- P1350 (matches played) is missing on 1,455 + 1,332 national-team stints and is often stale. So the "≥1 cap" range brackets the truth, and the 50+ figure is a floor on P1350 and a ceiling on the ledger definition.
- The real count comes free once the ESPN club ledger exists: join ledger athletes to Wikidata or RSSSF.
- The class "men's national association football team" (Q135408445) also contains Italy U21, Catalonia, the Basque Country and similar sides. I whitelisted 216 senior FIFA sides.

**What the tiers mean for coverage.** The century club (354) is almost entirely logged at RSSSF. The 50-99 band is about half logged, and the coverage is uneven by country: Netherlands 38/38, Germany 27/38, Italy 20/28, Egypt 31/39, but Scotland 0/20, Norway 4/27, Wales 4/30, Colombia 9/26 and South Korea 11/48. Below 50 caps RSSSF is thin. Of the roughly 7,650 capped ledger players, at most about 2,418 have any log, so about 32% or fewer [E].

## 2. Marquee set

Sources:
- Caps and goals: the Wikipedia infobox senior row (as of Sep-Oct 2026 for active players).
- Debut and cap 50: row 1 and row 50 of the RSSSF log.
- Friendlies: "R" is the RSSSF count (matches with no competition named, so the Kirin Cup and the like are excluded). "W" is a Wikipedia by-competition table. "+n" means minor-tournament caps that RSSSF lists separately.
- Last six columns: computed by joining each RSSSF cap row to martj42 by (team, date). 94.1% of all RSSSF rows join, and 100% of the marquee rows.
- "Tourn. in ESPN" is caps at WC 1998+ or Euro 2004+.
- "Missing" columns are caps a ledger would lack under each scope:
  - (a) tournaments-only from ESPN;
  - (b) ESPN alone, with partial slices weighted by the sampled hit rate [E];
  - (c) ESPN plus RSSSF.
- "First-50 missing" is the same thing for caps 1-50, under (a) and (b).

| Player | Ctry | Caps / goals | Debut | Friendlies | RSSSF log | Cap 50 | Tourn. in ESPN | Missing (a) tourn.-only | Missing (b) ESPN only [E] | Missing (c) ESPN + RSSSF | First-50 missing (a) / (b) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Messi | ARG | 208 / 126 | 2005-08-17 | 62 W / 61 R | messi-intlg | 2010-07-03 | 39 | 169 | 70 | 1 | 36 / 15 |
| C. Ronaldo | POR | 234 / 146 | 2003-08-20 | 56 W = R | cronaldo-intlg | 2007-10-13 | 57 | 177 | 51 | 1 | 38 / 8 |
| Haaland | NOR | 59 / 65 | 2019-09-05 | 12 | haaland-intlg | 2026-06-07 | 5 | 54 | 23 | 4 | 50 / 19 |
| Mbappé | FRA | 107 / 67 | 2017-03-25 | 25 | fran-mbappe-intlg | 2021-10-07 | 31 | 76 | 27 | 1 | 39 / 12 |
| Lewandowski | POL | 170 / 92 | 2008-09-10 | 54 | lewandowski-intlg | 2012-11-14 | 20 | 150 | 47 | 3 | 47 / 21 |
| Ibrahimović | SWE | 122 / 62 | 2001-01-31 | 35 R | ibrahimovic-intlg | 2008-06-01 | 18 | 104 | 24 | 0 | 41 / 12 |
| Salah | EGY | 122 / 68 | 2011-09-03 | 30 R | egy-salah-intlg | 2017-01-25 | 7 | 115 | 100 | 1 | 50 / 45 |
| Kane | ENG | 125 / 91 | 2015-03-27 | 19 | kane-intlg | 2020-11-15 | 36 | 89 | 32 | 5 | 40 / 13 |
| Neymar | BRA | 130 / 80 | 2010-08-10 | 70 W / 65 R | neymar-intlg | 2014-06-12 | 15 | 115 | 58 | 0 | 49 / 42 |
| Benzema | FRA | 97 / 37 | 2007-03-28 | 43 R | fran-benzema-intlg | 2012-08-15 | 15 | 82 | 27 | 0 | 44 / 14 |
| L. Suárez | URU | 143 / 69 | 2007-02-07 | n/s | **none** | n/s | n/a | n/a | about 47 [E] | **143** | n/a |
| Cavani | URU | 136 / 58 | 2008-02-06 | 40 R | cavani-intlg | 2013-06-11 | 17 | 119 | 46 | 0 | 44 / 17 |
| Agüero | ARG | 101 / 41 | 2006-09-03 | 38 R | aguero-intlg | 2014-03-05 | 12 | 89 | 45 | 0 | 47 / 21 |
| Higuaín | ARG | 75 / 31 | 2009-10-10 | 26 R | higuain-intlg | 2015-06-20 | 14 | 61 | 27 | 0 | 39 / 18 |
| Di María | ARG | 145 / 31 | 2008-09-06 | 46 R | dimaria-intlg | 2014-06-25 | 18 | 127 | 50 | 0 | 42 / 17 |
| Modrić | CRO | 206 / 30 | 2006-03-01 | 49 R (+2) | hrmodric-intl | 2011-10-07 | 39 | 167 | 51 | 4 | 45 / 10 |
| Kroos | GER | 114 / 17 | 2010-03-03 | 36 R | dui-kroos-intl | 2014-07-08 | 33 | 81 | 25 | 0 | 36 / 13 |
| T. Müller | GER | 131 / 45 | 2010-03-03 | 43 R | thmueller-intlg | 2014-06-16 | 35 | 96 | 28 | 0 | 38 / 12 |
| Klose | GER | 137 / 71 | 2001-03-24 | 58 W = R | klose-intlg | 2005-11-12 | 37 | 100 | 37 | 0 | 41 / 20 |
| Podolski | GER | 130 / 49 | 2004-06-06 | 59 R | podolski-intlg | 2008-06-12 | 27 | 103 | 36 | 0 | 40 / 18 |
| Rooney | ENG | 120 / 53 | 2003-02-12 | 46 W / 44 R | rooney-intlg | 2009-04-01 | 21 | 99 | 23 | 0 | 42 / 9 |
| Lampard | ENG | 106 / 29 | 1999-10-10 | 45 R | lampard-intlg | 2006-10-11 | 14 | 92 | 27 | 0 | 41 / 12 |
| Gerrard | ENG | 114 / 21 | 2000-05-31 | 43 R | gerrard-intlg | 2006-09-06 | 20 | 94 | 32 | 0 | 41 / 16 |
| Beckham | ENG | 115 / 17 | 1996-09-01 | 42 R (+5) | beckham-intl | 2002-06-02 | 17 | 98 | 57 | 0 | 46 / 43 |
| Henry | FRA | 123 / 51 | 1997-10-11 | 52 R | henry-intlg | 2003-06-26 | 23 | 100 | 46 | 0 | 42 / 31 |
| Zidane | FRA | 108 / 31 | 1994-08-17 | 59 W / 51 R | zidane-intl | 2000-02-23 | 16 | 92 | 67 | 0 | 45 / 45 |
| Trezeguet | FRA | 71 / 34 | 1998-01-28 | 36 R (+3) | trezeguet-intl | 2004-05-20 | 16 | 55 | 31 | 0 | 40 / 27 |
| Ribéry | FRA | 81 / 16 | 2006-05-27 | 33 R | ribery-intlg | 2011-03-29 | 17 | 64 | 22 | 0 | 37 / 10 |
| Giroud | FRA | 137 / 57 | 2011-11-11 | 54 W / 55 R | fran-giroud-intlg | 2016-06-10 | 33 | 104 | 34 | 0 | 41 / 17 |
| Griezmann | FRA | 137 / 44 | 2014-03-05 | 45 R | griezmann-intlg | 2018-03-23 | 36 | 101 | 30 | 0 | 38 / 6 |
| David Villa | ESP | 98 / 59 | 2005-02-09 | 39 W = R | dvilla-intlg | 2009-08-12 | 16 | 82 | 31 | 0 | 42 / 14 |
| F. Torres | ESP | 110 / 38 | 2003-09-06 | 43 W = R | ftorres-intlg | 2008-06-10 | 27 | 83 | 32 | 0 | 42 / 11 |
| Raúl | ESP | 102 / 44 | 1996-10-09 | 35 R | raul-intlg | 2002-03-27 | 14 | 88 | 53 | 0 | 47 / 45 |
| Xavi | ESP | 133 / 13 | 2000-11-15 | 51 W = R | xavi-intlg | 2007-09-12 | 26 | 107 | 37 | 0 | 43 / 12 |
| Iniesta | ESP | 131 / 13 | 2006-05-27 | 55 W = R | iniesta-intl | 2010-09-03 | 30 | 101 | 34 | 0 | 37 / 10 |
| Sergio Ramos | ESP | 180 / 23 | 2005-03-26 | 65 W = R | sramos-intlg | 2009-06-14 | 32 | 148 | 52 | 0 | 42 / 11 |
| Totti | ITA | 58 / 9 | 1998-10-10 | 21 R | totti-intl | 2006-05-31 | 12 | 46 | 30 | 0 | 45 / 30 |
| Del Piero | ITA | 91 / 27 | 1995-03-25 | 33 R | delpiero-intlg | 2002-06-03 | 18 | 73 | 49 | 0 | 44 / 42 |
| Pirlo | ITA | 116 / 13 | 2002-09-07 | 40 R | pirlo-intlg | 2008-08-20 | 22 | 94 | 30 | 0 | 38 / 9 |
| Buffon | ITA | 176 / 0 | 1997-10-29 | 56 R (+1) | buffon-intl | 2004-08-18 | 31 | 145 | 54 | 0 | 43 / 27 |
| Robben | NED | 96 / 37 | 2003-04-30 | 35 R | robben-intl | 2010-07-02 | 24 | 72 | 22 | 0 | 38 / 9 |
| Van Persie | NED | 102 / 50 | 2005-06-04 | 34 R | vpersie-intl | 2010-07-06 | 24 | 78 | 21 | 0 | 36 / 9 |
| Sneijder | NED | 134 / 31 | 2003-04-30 | 55 R | sneijder-intl | 2008-10-15 | 25 | 109 | 27 | 0 | 41 / 10 |
| Van Nistelrooy | NED | 70 / 35 | 1998-11-18 | 28 R | nistelrooij-intlg | 2006-05-27 | 11 | 59 | 24 | 0 | 45 / 22 |
| Lukaku | BEL | 135 / 94 | 2010-03-03 | 46 R (at 132 caps) | rlukaku-intlg | 2016-06-26 | 32 | 103 | 34 | 3 | 42 / 15 |
| De Bruyne | BEL | 127 / 40 | 2010-08-11 | 34 R (at 124) | debruyne-intl | 2016-11-13 | 31 | 96 | 32 | 3 | 41 / 10 |
| Hazard | BEL | 126 / 33 | 2008-11-19 | 41 R | ehazard-intlg | 2014-07-01 | 23 | 103 | 30 | 0 | 46 / 15 |
| Son Heung-min | KOR | 151 / 59 | 2010-12-30 | 71 R (at 149) | skor-son-hm-intlg | 2016-06-05 | 13 | 138 | 89 | 2 | 47 / 34 |
| Vardy | ENG | 26 / 7 | 2015-06 (month only [V]; 2015-06-07 [R]) | n/s | **none** | n/a | n/a | n/a | about 2 [E] | **26** | n/a |
| Lacazette | FRA | 16 / 3 | 2013 (year only [V]; 2013-06-05 [R]) | n/s | **none** | n/a | n/a | n/a | about 3 [E] | **16** | n/a |
| Falcao | COL | 104 / 36 | 2007-02-07 | 43 R | radamelfalcao-intlg | 2013-11-19 | 4 | 100 | 34 | 0 | 50 / 21 |
| James Rodríguez | COL | 131 / 31 | 2011-10-11 | 41 R | col-jamesr-intlg | 2016-09-06 | 13 | 118 | 33 | 0 | 45 / 17 |

**Totals for the 49 logged players** (6,032 caps): (a) tournaments-only misses 4,916 (81.5%); (b) ESPN alone misses about 1,921 (32%); (c) ESPN plus RSSSF misses 28 (0.5%). Of their 2,450 first-50 caps, (a) misses 2,073 and (b) about 936.

How the no-log rows were estimated: I took each player's national-team window from martj42 and applied the ESPN slice rates to their team's matches in that window. Suárez's window holds 217 Uruguay matches, about 33% of them outside ESPN coverage, which gives about 47 of his 143 caps [E]. Vardy works out at about 9% (2 caps) and Lacazette at about 17% (3 caps).

Data notes:
- Some Wikipedia pages disagree with themselves:
  - Suárez's debut is 7 Feb 2007 on his goals list and 8 Feb 2007 in the main article.
  - Rooney's goals list says 13 Feb 2003, against RSSSF's 12 Feb.
  - Giroud's list page gives 54 friendlies by competition and 30 friendly goals by year (29 by competition).
- RSSSF has two goal discrepancies against Wikipedia: Agüero 42 vs 41, and Higuaín 32 vs 31.
- The cap-50 dates come from the RSSSF row numbers. They are reliable because the RSSSF lag is always at the recent end of a career.

### Ronaldo, checked against the brief's example
- His first 50 caps (2003-08-20 to 2007-10-13) are 16 friendlies, 22 qualifiers and 12 tournament matches [V, RSSSF joined to martj42].
- Portugal hosted Euro 2004, so there were no Euro 2004 qualifiers. The 22 qualifiers are the 2006 WC campaign and the Euro 2008 campaign.
- Every qualifier and tournament match is in ESPN.
- The 16 friendlies are the 2003-2007 hole. The core probe found rosters for 9 of 14 Portugal friendlies in 2004-08 [V], so ESPN alone loses about 5-8 of them. RSSSF has all 50.
- The brief's instinct holds: the friendlies that bite are 2001-2011's.

### Haaland
- Every cap is from 2019 on, but "fine in ESPN" needs a qualifier.
- 22 qualifiers verified; 12 friendlies in a partial slice; 16 Nations League caps in a slug nobody has probed yet (`uefa.nations`, id 2395).
- His RSSSF log has 55 of 59, so the ledger is complete either way.

## 3. Match population

The 42 teams:
- **UEFA (22):** England, France, Germany, Spain, Italy, Netherlands, Portugal, Belgium, Croatia, Poland, Sweden, Denmark, Switzerland, Austria, Turkey, Czech Republic, Russia, Ukraine, Norway, Serbia (martj42 merges FR Yugoslavia and Serbia and Montenegro into it), Scotland, Wales.
- **The brief's 20 others:** Argentina, Brazil, Uruguay, Colombia, Chile, Mexico, USA, Egypt, Senegal, Nigeria, Ivory Coast, Ghana, Cameroon, Morocco, Algeria, South Korea, Japan, Australia, Saudi Arabia, Iran.

Source and rules:
- **Source:** martj42 `results.csv` (https://github.com/martj42/international_results, CC0, last row 2026-10-06) [V]. I used it instead of 42 × 3 Wikipedia pages because it has the competition on every row and it matches the Wikipedia results pages (Portugal 255 = 255, England 237 = 237, Argentina 267 vs 266, all for 2000-2019) [V].
- **Classification:**
  - "Friendly" is a friendly.
  - Any "… qualification" label is a qualifier (WC and continental).
  - UEFA and CONCACAF Nations League matches are group/league-phase matches, except the finals windows (UEFA Jun 2019, Oct 2021, Jun 2023, Jun 2025; CONCACAF Jun 2021, Jun 2023, Mar 2024, Mar 2025), which count as tournament.
  - WC, Euro, Copa América, AFCON, Asian Cup, Gold Cup and Confederations Cup are tournament.
  - Everything else is "other": Kirin Cup, Gulf Cup, Arab Cup, FIFA Series, Superclásico, King's Cup and so on. Wikipedia usually files these as friendlies; RSSSF keeps them apart.
- **Units:** a "team-match" is one team's appearance in a match, so a match between two of the 42 counts twice. Distinct matches are given too.
- **CSV:** `research/intl-match-population.csv` (42 teams × 29 years, 1998-2026). Columns: team, year, friendlies, qualifiers, nations_league, tournament, other, total, source_url. 2026 runs to 6 Oct only.

| Era | Friendlies | Qualifiers | Nations League | Tournament | Other | **Team-matches** | Distinct matches |
|---|---|---|---|---|---|---|---|
| 1998-2003 | 1,262 | 966 | 0 | 582 | 238 | **3,048** | 2,308 |
| 2004-2008 | 1,112 | 1,021 | 0 | 470 | 85 | **2,688** | 2,079 |
| 2009-2014 | 1,387 | 1,142 | 0 | 471 | 117 | **3,117** | 2,395 |
| 2015-2026 | 1,799 | 2,141 | 612 | 1,216 | 196 | **5,964** | 4,614 |
| **Total** | **5,560** | **5,270** | **612** | **2,739** | **636** | **14,817** | **11,396** |

Distinct matches by type, all years: 4,083 friendlies, 4,501 qualifiers, 406 Nations League, 1,867 tournament, 539 other.

The yearly total is steady at about 480-650 team-matches. The exception is 2020: 244, the Covid year. The busiest teams are Mexico (524), the USA (461) and Saudi Arabia (461). The quietest are Russia (286), Austria (282), Scotland (267) and Wales (258).

## 4. Existing coverage

| Source | What it holds | Slices complete | License | Tag |
|---|---|---|---|---|
| **ESPN site + core API** (from `espn-coverage-ucl-intl.md` and `espn-core-probe.md`; not re-fetched) | Rosters with starter/sub flags, goal and sub events, stat arrays. The athlete store adds per-player per-match lines (appearances, starts, minutes, goals) | **WC 1998-** (2 empty summaries recoverable through the athlete store); **Euro 2004-** (no Euro 2000); **UEFA qualifiers from the Euro 2004 campaign** (2002-03; 3 of 47 sampled 2002-08 qualifiers lack rosters), **WC qualifiers from the 2006 campaign** (2004-05); **CONMEBOL WCQ from 2008** (2004-05 scorer-only, Oct-Nov 2007 not enumerated); Copa 2007 rosters. **Friendlies:** none before 2001 (`fifa.friendly` 2001-); 2001-2008 about 48% rostered for top teams (Portugal 9/14, Argentina 3/11; 10 of 16 random 2002-04 friendlies had no roster); 2008 and 2011 random samples 0/6; 2014-2024 7/9. **Unprobed:** `uefa.nations` 2395, `caf.nations` (2004-), `afc.asian.cup`, `concacaf.gold` (2003-), `fifa.confederations` (2003-2017), CAF/AFC/CONCACAF WC qualifiers (2006 campaign-), `caf.nations_qual`, `afc.cupq`. Nothing before 2001 except WCs | Disney ToS bars automated extraction | V (samples) |
| **RSSSF per-player logs** | 4,697 men's cap-by-cap logs: cap no., goals, date, venue, opponent, score, competition. No minutes or start/sub flag. 266,654 cap rows parsed; 94.1% join to a martj42 match by (team, date); 3,542 of the 3,793 logs that state a total parse to exactly that total | Ronaldo: 233 caps (Wikipedia 234; missing 24 Sep 2026), 146 goals, friendlies 56/22 = Wikipedia. Messi: 207/125 (Wikipedia 208/126; missing the 6 Oct 2026 Benin friendly), friendlies 61 vs 62. Active players lag 1-5 caps. Per team-match, the logs account for about 6 of the roughly 14-17 players used before 2015 and about 3 from 2015 (newer players are less often logged). Indexes: `miscellaneous/century.html`, `intl-app-trivia.html`, `intl-goals-trivia.html`, `intlp-countrywise.html` (the old `/players/` is a 2008 club archive with no cap logs) | "free to copy this document in whole or part provided that proper acknowledgement is given to the RSSSF"; some pages carry individual author copyrights | V |
| **martj42 `goalscorers.csv`** | 47,914 goals, 1916-07-02 to 2026-07-19; competitive only | 0 rows in any of the 8,975 1998-2026 "Friendly" results. Ronaldo's two friendly goals v Saudi Arabia (2006-03-01) and Messi's Brazil hat-trick (2012-06-09) are in `results.csv` with no scorer rows, and so is the Benin match (2026-10-06). **Ronaldo 124** (146 − 22 friendly goals), **Messi 71** (126 − 55; Wikipedia's by-competition table: friendlies 62 apps / 55 goals, WCQ 36, WC 21, Copa 14, Finalissima 0). It covers WC, WCQ, Euro, EQ, Copa, AFCON, Asian Cup, Gold Cup, Nations League and Confed Cup, but **no AFCON or Asian Cup qualifiers and no CONCACAF Nations League** (neither appears in the goals file). No appearances | CC0 | V |
| **martj42 `results.csv`** | Every result including friendlies, with competition, city and neutral flag | The match spine for the whole population | CC0 | V |
| **Wikipedia goal lists** | 19 of the 52 marquee players have a standalone "List of international goals scored by X". 8 are redirects to the biography (Salah, Cavani, Di María, Müller, Podolski, Zidane, Griezmann, Robben) and 25 don't exist. 109 such pages in all, plus 66 redirects. They carry a Cap column per goal and, on some, a by-competition or by-year table. They never list goalless caps | | CC BY-SA 4.0 | V |
| **Wikipedia results pages** | Football boxes with date, score, round, venue, referee, attendance and scorers. **No lineups** (0 hits on 3 pages: Portugal 255 boxes, England 237, Argentina 266 table rows) | Score and scorer spine only | CC BY-SA | V |
| **Wikipedia match and group articles** | WC and Euro group pages have full lineups with sub minutes (2006 WC Group D, Euro 2004 Group A). Qualifying group pages have scores and scorers only (2006 WCQ UEFA Group 3: 42 boxes, 0 lineups). Standalone match articles are rare: 7 in `Category:Portugal national football team matches`, none for 2003-07 qualifiers or friendlies. **No article and no lineup exists for Portugal 1-0 Kazakhstan, 20 Aug 2003** (Ronaldo's debut) | Tournaments only | CC BY-SA | V |
| **Wikidata match items** | `international association football match` (Q17315159): 10,721 items, 9,677 with P710 participants. Each participant carries qualifiers P54 (team) and P1618 (shirt number); no start/sub flag was seen. **22 UEFA teams, 1998-2008: 1,195 items, 1,187 with that team's lineup, against 1,192 distinct competitive matches in martj42.** Portugal 2002-08: 51 items (50 with lineups) against 50 competitive matches; England 49 against 48; **Argentina 18 against 53**. Friendlies: almost none (Portugal 0, England 1 and Argentina 2 in 2002-08). Player stints carry career totals only (Ronaldo P1350 = 233) | Very likely all UEFA competitive matches 1998-2008, but the item-by-item join isn't done. Whether P710 lists only players who appeared (it shows 14 Portugal players per 2004 match, which fits 11 + 3 subs) needs checking before use | CC0 | V counts; E overlap |
| **national-football-teams.com** | Per-player match lists (Ronaldo 234 links, footer "234 Matches 146") and per-match lineups with sub minutes. Report 18815 has the full XIs for Portugal-Kazakhstan 2003 | **The only source found with full lineups for the 2003 friendly.** | No terms page (`/terms.html` is 404); site-wide footer: "Unauthorized publishing and copying of this website's content and images strictly prohibited!"; robots `Crawl-delay: 60` | V |
| **11v11.com** | Season lists and match pages exist [S]; lineups [R] | 403 to curl and WebFetch | "You may download information from the Site for your own personal use only." (https://www.11v11.com/terms-and-conditions-and-privacy-policy/) | V terms; S content |
| **eu-football.info** | Per-player match lists (Wikipedia cites `/_player.php?id=24753` for Ronaldo); per-match lineups [R] | 200 with an empty body (probably user-agent gating) | No terms page found | V/R |
| **worldfootball.net** | Lineups [R] | 403 | robots.txt: `ai-train=no, use=reference`, blocks ClaudeBot and CCBot, and reserves rights under EU Directive 2019/790 Art. 4 | V |
| **FBref** | National-team match logs per player, friendlies from 2014 (data-sources.md) | Cloudflare challenge | §5 bars "any automated means … scripts, bots, scrapers" and any substitute database | V terms |

## 5. The gap, in numbers

Each team-match is put in one of these states:
- **ESPN-verified (V).**
- **Wikidata.** UEFA competitive matches up to 2008 that ESPN lacks; credited only to the 22 UEFA teams, because Argentina's Wikidata coverage is 18 of 53.
- **ESPN-partial.** Friendlies; counted as missing at a rate of 52% for 2001-2011 and 22% from 2014 (the sampled no-roster rates).
- **ESPN-absent (N).** Probed and not there: everything before 2001 except the WC; the 2002 WCQ; CONMEBOL 2003-05 and Oct-Nov 2007; Euro 2000 for non-UEFA purposes; pre-2001 continental finals.
- **Unprobed (U).** No probe has looked at the slice.

"Firm gap" = absent + the missing share of partial. The appearances column takes the players used per side (13.8 per competitive match before 2020, 15 from 2020, 16-17 per friendly [E, from the ESPN sample's sub counts]) and subtracts the RSSSF-logged appearances in that exact match [V]. The result is the appearances an archive would still have to supply.

| Era | Type | Team-matches | ESPN V | Wikidata | ESPN partial | ESPN absent | Unprobed | **Firm gap (team-matches)** | Firm gap: appearances still missing after RSSSF [E] | Unprobed: appearances not in RSSSF [E] |
|---|---|---|---|---|---|---|---|---|---|---|
| 1998-2003 | friendly | 1,262 | 0 | 0 | 624 | 638 | 0 | **962** | 9,678 | 0 |
| 1998-2003 | qualifier | 966 | 184 | 390 | 0 | 313 | 79 | **313** | 2,623 | 693 |
| 1998-2003 | tournament | 582 | 210 | 73 | 0 | 129 | 170 | **129** | 963 | 1,531 |
| 1998-2003 | other | 238 | 0 | 0 | 0 | 140 | 98 | **140** | 1,582 | 1,134 |
| 2004-2008 | friendly | 1,112 | 0 | 0 | 1,112 | 0 | 0 | **578** | 5,713 | 0 |
| 2004-2008 | qualifier | 1,021 | 592 | 0 | 0 | 92 | 337 | **92** | 817 | 2,513 |
| 2004-2008 | tournament + other | 555 | 246 | 5 | 0 | 0 | 304 | **0** | 0 | 2,570 |
| 2009-2014 | friendly | 1,387 | 0 | 0 | 944 | 0 | 443 | **416** | 4,183 | 4,596 |
| 2009-2014 | qualifier | 1,142 | 747 | 0 | 0 | 0 | 395 | **0** | 0 | 2,749 |
| 2009-2014 | tournament + other | 588 | 266 | 0 | 0 | 0 | 322 | **0** | 0 | 2,766 |
| 2015-2026 | friendly | 1,799 | 0 | 0 | 1,799 | 0 | 0 | **396** | 5,605 | 0 |
| 2015-2026 | qualifier | 2,141 | 1,367 | 0 | 0 | 0 | 774 | **0** | 0 | 8,732 |
| 2015-2026 | Nations League | 612 | 0 | 0 | 0 | 0 | 612 | **0** | 0 | 7,688 |
| 2015-2026 | tournament + other | 1,412 | 622 | 0 | 0 | 0 | 790 | **0** | 0 | 9,259 |
| **All** | **friendly** | 5,560 | 0 | 0 | 4,479 | 638 | 443 | **2,353** | **25,180** | 4,596 |
| **All** | **qualifier** | 5,270 | 2,890 | 390 | 0 | 405 | 1,585 | **405** | **3,440** | 14,687 |
| **All** | **everything** | **14,817** | 4,234 | 468 | 4,479 | 1,312 | 4,324 | **3,027** | **about 31,200** | about 44,200 |

How to read this:
- **The archive problem is friendlies, 1998-2008.** Of the 3,027-team-match firm gap, 1,540 are 1998-2008 friendlies: about 15,400 appearances not covered by RSSSF.
- **The rest of the firm gap:**
  - 2009-2014 and 2015-2026 friendlies: 416 + 396 team-matches. These rest on small samples, so they are the least certain figures.
  - Pre-2004 non-UEFA qualifiers (313 + 92). These are mostly CONMEBOL, CAF, AFC and CONCACAF campaigns for the 2002 and 2006 World Cups.
  - Pre-2001 continental finals other than the Euro (129): Copa 1999, AFCON 1998/2000, Asian Cup 2000, Gold Cup 1998/2000, Confed Cup 1999.
  - Minor tournaments (140).
- **The unprobed 4,324 team-matches are mostly 2004 onward:** Nations League, AFCON/Asian Cup/Gold Cup finals and their qualifiers, and non-UEFA, non-CONMEBOL WC qualifiers. All of them sit in ESPN slugs that exist. One probe pass, at the density the earlier probes used, would settle them. I expect most to come out V, by analogy with the UEFA qualifiers, but that is unverified.
- **A whole match is rarely covered by RSSSF alone.** Only 3-22% of team-matches have 11 or more RSSSF-logged appearances. RSSSF is a per-player source, not a lineup source. It closes the gap for the players who matter and leaves journeymen for an archive.

**What bites for the marquee "first N" curves.**
- **Players whose first 50 caps are mostly pre-2005 friendlies:** under ESPN alone they lose 40-47 of those caps.
  - Beckham (first 50: 1996-2002), Zidane (1994-2000), Raúl (1996-2002), Del Piero (1995-2002), Henry (1997-2003), Totti (1998-2006), Buffon (1997-2004) and Trezeguet (1998-2004).
  - These careers start before ESPN's 2001 floor. Their club side is partial too (README).
  - RSSSF has every one of their caps.
- **Second worst: Salah, Neymar and Son.**
  - Non-UEFA: AFCON qualifiers, Copa, Asian Cup and Gulf/Kirin-type caps, mostly in unprobed slugs.
  - ESPN alone misses 45, 42 and 34 of their first 50.
  - RSSSF has them all.
- **Mid-2000s debutants** (Ronaldo, Messi, Rooney, Torres, Villa, Ramos, Iniesta, Pirlo, Robben, Sneijder, Van Persie): ESPN alone misses 8-21 of the first 50, almost all 2004-2011 friendlies. RSSSF closes it.
- **Post-2014 debutants** (Kane, Mbappé, Griezmann, Haaland): the ESPN-only misses are mostly partial-slice friendlies and unprobed Nations League caps, roughly 6-19 of the first 50. RSSSF closes it.

## 6. Recommendation: v1 scope for the internationals layer

**Option A, tournaments-only** (WC 1998-, Euro 2004- from ESPN):
- The cheapest to build and fully covered.
- **It is the wrong shape for the career view.** It drops 81% of the marquee players' caps and 36-50 of each player's first 50 caps.
- "Goals through the first N appearances, club and country" would then mean "club plus World Cups and Euros". That is a different stat from Opta's and ESPN's, and it would fail the 981 / 936 known-answer gate by 121 goals for Ronaldo (only 25 of his 146 are WC or Euro 2004+ goals) and by 103 for Messi (23 of 126 are WC or Copa 2007 goals) [V, martj42 goalscorers].
- **Per player:** Ronaldo loses 177 caps, Messi 169, Modrić 167, Lewandowski 150, Ramos 148, Buffon 145, Son 138, Salah 115, Haaland 54.
- Keep it as a separate board ("World Cup goals through N World Cup appearances"). Don't use it as the career view.

**Option B, logged players: ESPN plus RSSSF, with Wikidata as a gate** (recommended v1):
- **Cost:** parsing 4,697 static HTML pages, already done once in this pass, plus ESPN's verified slices to fill the 1-5-cap tail for active players.
- **Who is complete:**
  - 49 of the 52 marquee players, with 28 caps short (all post-July-2026 lag that ESPN's 2026 qualifier, Nations League and friendly slices should cover);
  - at least 340 of the 354 target century-club players;
  - about half of the 50-99-cap band.
- **Who is incomplete:**
  - **Luis Suárez:** 143 caps with no log. ESPN's verified slices and the athlete store probably cover about 96 [E]. About 47 remain, mostly 2007-2011 friendlies and unprobed Copa matches.
  - **Vardy:** 26 caps, about 2 missing [E].
  - **Lacazette:** 16 caps, about 3 missing [E].
  - All three need either a per-player ESPN athlete-store pull plus a few archive matches, or an RSSSF log request.
- **Display rule:** a player without a log shows club-only in the career view, with a visible "internationals not yet covered" badge. Don't mix in partial international data silently.
- **Gates:**
  - every RSSSF log's row count against its stated total (93% exact today);
  - goals in competitive caps against martj42 (Ronaldo 124, Messi 71, exact);
  - every UEFA competitive cap against Wikidata P710.
- **Before publishing:** the RSSSF copy permission is for documents "with proper acknowledgement". data-sources.md already flags asking before republishing RSSSF as a dataset. Send that one email to RSSSF before launch. Publishing cumulative curves, not raw cap rows, also keeps the exposure low.

**Option C, the full population** (every capped ledger player, about 7,650-10,450):
- Needs the ESPN pass above.
- Then one probe pass on the 4,324 unprobed team-matches.
- Then archive recovery for the firm gap: about 3,000 team-matches and about 31,000 player-appearances, 80% of them in friendlies before 2012.
- **The only per-match lineup source found for those friendlies is national-football-teams.com, which forbids copying.** 11v11 is personal-use only, worldfootball.net reserves rights against AI and crawling, and eu-football.info has no terms and couldn't be read. So option C means the Wayback/match-report route the other agent is sizing: national FA match reports and newspaper reports.
- It is a multi-month receipts-research job. It changes no marquee curve that option B doesn't already get right.
- **Do it only if the site needs the career view for journeymen**, for example "every player through 300 appearances". Otherwise defer.

**Per-player consequence, summarised.** Option B is exact for the 49 logged marquee players, to within ESPN's fill of the last 1-5 caps. It is short for Suárez (about 47 caps until fixed, or club-only), Vardy (about 2) and Lacazette (about 3). Option A is wrong for all 52, by 46-177 caps each. Option C adds nothing for the marquee set over B, and adds roughly 6,000-9,000 non-logged players at the cost of the archive project.

## Method notes

- **RSSSF rows** were parsed from the 4,711 pages the RSSSF subagent cached. Century and two-digit years were resolved from row order and the "last updated" year.
  - Each player's team was chosen as the martj42 team whose match dates best fit their cap dates (±1 day).
  - 67 pages produced no rows and 787 logs join below 90%. The low joiners are mostly pre-1990 African and Asian players whose matches martj42 lacks, and players capped by two nations.
- **Wikidata** was read with the `wbgetentities` API (claims only) for 43,650 players in 873 batches, because the SPARQL joins timed out. The SPARQL endpoint was used only for the club list, player lists and the per-year match counts.
- **Uncertain assumptions, all [E]:**
  - players used per side;
  - the friendly roster rates (12/25 for 2001-2011, 7/9 for 2014-);
  - "Wikidata covers every UEFA competitive match up to 2008", inferred from equal counts, not an item-by-item join.
- **Cheapest next checks:**
  - join the Wikidata items to martj42 by date and teams;
  - check whether P710 includes unused substitutes;
  - probe `uefa.nations`, `caf.nations`, `afc.asian.cup`, `concacaf.gold` and the CAF/AFC/CONCACAF qualifier slugs at about 3 dates each.
