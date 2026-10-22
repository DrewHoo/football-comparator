# The club-football landscape, for a career-point comparator

Research date: 21 October 2026. Player numbers come from Wikipedia infoboxes read on this date unless a different source is named. Infobox numbers count **domestic league games only**. Treat any figure here as a snapshot, not a receipt. Re-pull it at build time.

## Summary: what matters for the comparator decision

1. Football has no single league that owns a career. A great player typically plays in **4 to 6 leagues**. In his prime he concentrates in 1 to 3 of the "big five" (England, Spain, Italy, Germany, France).
2. When fans say "career goals" they mean **senior official matches**: every first-team club competition (league, cups, continental, Super Cups, Club World Cup) **plus the national team**. Ronaldo's ~970 and Messi's ~900 are both built this way.
3. That total **excludes** friendlies and exhibitions. Pelé's 1,279 is disputed for exactly this reason. It also excludes youth and reserve teams: Messi's Barça B and C goals are not in his 900.
4. The total **includes** loan spells, second-tier seasons after relegation, and the Saudi and MLS years. Nobody strips Ronaldo's Al-Nassr goals out of his career count.
5. Club goals and national-team goals live side by side. Ronaldo's 146 for Portugal is its own record (Guinness), and it is also inside his career total.
6. The common subsets are "league goals", "[League name] goals" (Premier League, 1992- only), "Champions League goals", and "international goals".
7. The unit is **appearances (games) and age**, never starts. Typical phrasings: "fastest to 100 Premier League goals" (Haaland, 111 games), "goals before turning 25", "first to 300 goals before 25" (Mbappé).
8. The Jeter analogy: reserve teams (Barça B, Castilla) are the AAA analog and are excluded. A second-tier season after relegation counts in "career goals" but not in "top-flight goals". The Saudi league counts in full, more like a player going from MLB to NPB *and keeping the stats*, which is what football does.
9. Wikipedia infoboxes count league games only. They list B teams under "senior career", show loans as their own rows, and keep national teams in a separate block. Stat sites (Transfermarkt, FBref) split by competition, so any cut is possible.
10. Suggested default: "all senior official games, club + country", with toggles for league-only, club-only, international-only and top-flight/big-five-only. Count by appearances and age. Show the league as a colour on the timeline so the scatter at the ends is visible rather than hidden.

---

## 1. The pyramid

**How it works.** Each country has one connected ladder of leagues, the "pyramid". Every season the bottom clubs of a league drop down (relegation) and the top clubs of the league below move up (promotion). In England the Premier League (20 clubs, 38 games) relegates 3 clubs to the Championship every year. The **top flight** is simply tier 1. For players who matter to a comparator, at most two tiers are relevant: the top flight and, occasionally, the second tier. English tiers 3 and 4 (League One, League Two) matter only for young players on loan, such as Kane at Leyton Orient.

US contrast: no franchise is guaranteed its league slot. A club's league can change from one year to the next, so "league" is a property of a season, not of a club.

**Premier League vs English top flight.** The Football League was founded in 1888, and its first season was 1888-89. Its First Division was the top flight until 1992. That year the top clubs resigned en masse and formed the FA Premier League, chiefly to keep TV money (the first Sky deal). The first Premier League season was 1992-93. The old First Division became the name of tier 2 (today's "Championship"). Hence two different record books:
- "**Premier League records**" start in 1992-93. Shearer's 260 PL goals is the record, with Kane second at 213 ([ESPN](https://africa.espn.com/football/story/_/id/47051666/manchester-city-erling-haaland-alan-shearer-premier-league-100-goal-record)).
- "**English top-flight records**" go back to 1888-89. Jimmy Greaves (357) holds the all-time top-flight record. Commentators use the PL-only book far more often.

This is the biggest single "reset" in any book of records. It is roughly like the NFL treating pre-merger stats as a separate book, except that here the pre-1992 era is mostly ignored in broadcast graphics.

**Origin years of the other national leagues** (single national league, as opposed to regional championships that came earlier):

| League | Country | National league since | Notes |
|---|---|---|---|
| Football League / Premier League | England | 1888-89 / 1992-93 | PL is the rebrand of tier 1 |
| La Liga | Spain | 1929 | 20 clubs, 38 games |
| Serie A | Italy | 1929-30 (single round-robin) | Italian champions crowned since 1898 |
| Bundesliga | Germany | 1963-64 | German champions since 1903 via regional play-offs; 18 clubs, 34 games |
| Ligue 1 | France | 1932-33 (as Division 1; renamed 2002) | 18 clubs, 34 games since 2023-24 |
| Eredivisie | Netherlands | 1956-57 | |
| Primeira Liga | Portugal | 1934-35 trial, 1938-39 official | |
| Scottish top flight | Scotland | 1890-91 | Premier Division 1975, SPL 1998, Premiership 2013 |

Practical consequence: Spanish, Italian and German records each have a clean "since founding" date. English records have two eras, and the comparator must pick one per stat.

## 2. The "big five", coefficients, and the outer ring

**The convention.** "Big five" means England, Spain, Italy, Germany and France. The label is mainly carried by **Deloitte's Annual Review of Football Finance**, whose first edition was June 1992 and which reports "big five" league revenue every year. For 2024-25 the big five generated €21.6bn ([Deloitte DE press release](https://www.deloitte.com/de/de/about/press-room/europaeischer-fussballmarkt--ueberschreitet-erstmals-die-marke-von-40-milliarden-euro.html); [Deloitte 2018 release](https://www.deloitte.com/content/dam/Deloitte/ch/Documents/about-deloitte/ch-de-press-release-deloitte-football-finance-07-06-2018.pdf)). I could not find who coined the term. Analysts (Opta, FBref) use "big five leagues" as a standard filter.

**UEFA coefficients** rank leagues by how their clubs did in European competition over a rolling 5 seasons. The ranking decides how many Champions League places each country gets. The current table ([football-coefficient.eu, read 21 Oct 2026](https://www.football-coefficient.eu/coefficient); UEFA's official page is [uefa.com](https://www.uefa.com/nationalassociations/)):

| Rank | Country | 5-yr coefficient |
|---|---|---|
| 1 | England | 119.520 |
| 2 | Italy | 99.946 |
| 3 | Spain | 97.050 |
| 4 | Germany | 92.904 |
| 5 | France | 83.500 |
| 6 | Portugal | 73.167 |
| 7 | Netherlands | 67.929 |
| 8 | Belgium | 62.250 |
| 9 | Türkiye | 51.875 |

There is a clear gap after France. Portugal and the Netherlands are the "best of the rest". They work as **development leagues**: stars pass through them young (Ronaldo at Sporting, Ronaldo Nazário and Ibrahimović at PSV/Ajax, Haaland at Salzburg in Austria) and then sell up.

**Non-European leagues** have no coefficient that compares them with Europe. How the discourse treats them:
- **Saudi Pro League:** money-driven since Ronaldo arrived in January 2023, followed by Benzema, Neymar and others. Ronaldo claims it is "more competitive" than Ligue 1, and Neymar agreed in 2025 ([Gulf News](https://gulfnews.com/sport/football/ronaldo-says-saudi-league-more-competitive-than-french-1.1705719341820); [SI](https://www.si.com/fannation/soccer/futbol/news/neymar-says-saudi-pro-league-better-than-ligue-1-france)). French pros pushed back, and low attendances are a recurring knock. The consensus treats it as a late-career destination, not a peer.
- **MLS:** the classic retirement league (Pelé at the Cosmos, Beckham, Ibrahimović at LA Galaxy, Messi at Inter Miami since 2023). Lewandowski is listed at Chicago Fire in 2026. Goals count in career totals, but nobody uses MLS goals as evidence of greatness.
- **Brasileirão, Argentina's Primera:** respected as **origin** leagues (Pelé, Neymar, Maradona, Ronaldo Nazário all started there) and for Copa Libertadores. Players are seen as "not yet proven" until they reach Europe.
- **Liga MX, Turkey:** Turkey gets a European coefficient (9th) and is seen as a late-career and second-tier-star league (Salah and Lukaku are listed at Trabzonspor and Fenerbahçe in 2026). Liga MX is rich but rarely part of Europe-centred discourse.

**Where Messi/Ronaldo/Benzema/Neymar's late years sit in people's heads:** these goals **count** (they are in the 900+ totals) but are **discounted** in argument. A typical move in an argument is "Ronaldo's Europe-only goals" or "Haaland vs Messi in European top flights" (Goal excludes "goals scored outside Europe" in exactly this way: [Goal](https://www.goal.com/en-us/lists/pep-guardiola-erling-haaland-lionel-messi-cristiano-ronaldo-level-goal-scoring/blt8a40f145302ef813)). So the discourse wants both numbers.

## 3. Competitions in one club season

A top club in a big-five league plays in up to five competitions:

| Competition | Examples | Games for a top club |
|---|---|---|
| Domestic league | Premier League, La Liga, Serie A, Bundesliga, Ligue 1 | 34-38 |
| Domestic cup(s) | FA Cup (since 1871-72) and EFL/League Cup (since 1960-61) in England; Copa del Rey; Coppa Italia; DFB-Pokal; Coupe de France | 2-10 combined; England has two cups, so English clubs play more |
| Continental | UEFA Champions League (the 1955 European Cup, rebranded 1992-93); Europa League (UEFA Cup 1971); Conference League (2021-22); Copa Libertadores in South America; AFC Champions League (Elite) for Saudi clubs | CL since 2024-25: 8-game league phase, then knockouts; a finalist plays up to 17 |
| Super Cups | Community Shield, Supercopa de España (4-team format), UEFA Super Cup | 1-3 |
| Club World Cup | FIFA; expanded to 32 teams in the USA in summer 2025 | 3-7 in an edition year |

Plus **8-12 internationals** a year for the national team.

**Volume.** A star outfielder plays about **50-70 games** across all of these. FIFPRO recommends no more than 55. The 2024-25 top three outfielders averaged 73 ([Football Benchmark](https://footballbenchmark.com/ca/e/blog/28466/726062)). Valverde, Modrić, Julián Álvarez and Aktürkoğlu were at 53-55 by 1 April 2025 ([FIFPRO](https://www.fifpro.org/articles/2025/04/club-world-cup-bound-players-among-most-overworked-this-season-according-to-new-data)). Lamine Yamal had **130 professional games by age 18** ([beIN](https://www.beinsports.com/en-us/soccer/la-liga/articles/lamine-yamal-at-the-limit-two-injuries-and-130-matches-by-age-18-raise-concern-2025-10-07)). Only about half of a star's games are league games.

**What "all competitions" means.** Every official first-team match: league + cups + continental + Super Cups + Club World Cup. Club records ("Ronaldo, Real Madrid's all-time top scorer with 450") are all-competitions. "Career goals" goes one step further and adds the national team:
- **Messi, 900th goal (18 March 2026):** Barcelona 672 in 778, PSG 32 in 75, Inter Miami ~81, Argentina ~115. That makes 900 goals in 1,142 games ([ESPN](https://www.espn.com/soccer/story/_/id/47220729/messi-score-900th-goal-2026-reach-1000-pass-ronaldo); [beIN](https://www.beinsports.com/en-us/soccer/mls/articles/the-anatomy-of-lionel-messi-s-900-goals-2026-03-19)).
- **Ronaldo, ~970 by mid-2026:** Sporting 5, Man Utd 145, Real Madrid ~450, Juventus 101, Al-Nassr ~126, Portugal 143-146 ([Squawka](https://www.squawka.com/us/news/cristiano-ronaldo-stats/); [Sky Sports, 948 in 2025](https://www.skysports.com/football/news/12040/13450479/cristiano-ronaldo-on-948-career-goals-after-breaking-yet-another-scoring-record-but-when-could-he-reach-1000)).

The sources differ by a few goals. The differences come from cut-off dates and from edge cases (is a Super Cup official? does a match abandoned and replayed count?). A comparator needs one rule, written in its Method.

**Friendlies are the bright line.** Pelé's 1,279 (or 1,283) goals include exhibition tours. Counting only official matches, RSSSF has 775 in 840 ([Wikipedia: Pelé](https://en.wikipedia.org/wiki/Pel%C3%A9); [AP via Bay News 9](https://baynews9.com/fl/tampa/ap-online/2022/12/29/nobody-disputes-pels-greatness-but-goal-count-fuels-debate)). Modern consensus: official only.

## 4. National teams

International breaks happen in windows: about 4-5 per season of 2 games each, plus a summer tournament (World Cup, Euros, Copa América, AFCON) in most years. A player alternates club, country, club every 3-6 weeks.

**Do fans mix them?** In one number, yes: "career goals" = club + country. But records are always kept separately as well:
- "Most international goals": Ronaldo, **146** (12 June 2004 to 2 July 2026), per Guinness. He passed Ali Daei's 109 in September 2021 ([Guinness](https://www.guinnessworldrecords.es/world-records/81337-most-goals-scored-in-international-football-soccer-matches-by-an-individual-ma); [Guinness news 2021](https://guinnessworldrecords.com/news/2021/9/cristiano-ronaldo-breaks-iconic-record-for-most-goals-scored-in-international-matches)).
- Club records are kept per club and per competition (e.g. Ronaldo's Champions League goals record).

**How the sites split them.** Wikipedia's infobox has a **"Senior career"** block (club, league-only) and a separate **"International career"** block (all competitions plus friendlies, including U20/U21/U23 rows). Its template rule: national caps count "in all competitions and friendlies" ([Template:Infobox football biography](https://en.wikipedia.org/wiki/Template:Infobox_football_biography)). Transfermarkt and FBref have a club tab and a national-team tab, and every row is tagged with a competition.

Note one asymmetry: **international friendlies count** (they are full FIFA "A" internationals), while **club friendlies do not**. If a comparator includes national-team games, Messi's friendlies for Argentina are in and Barcelona's preseason tour games are out.

Youth internationals (U20, U23 and so on) are not part of "international goals" in the discourse. Messi's 14 for Argentina U20 are not in his 900.

## 5. Reserve/youth teams and loans

**Reserve teams are the AAA analog, and they are excluded.** Big Spanish and German clubs field a "B" team that plays real league football lower down the same pyramid: Barcelona Atlètic (Barça B), Real Madrid Castilla, Bayern II and Dortmund II (3. Liga / Regionalliga). Spanish rules forbid a B team from playing in the same division as its first team, which caps it below the top flight, and B teams are no longer allowed in the Copa del Rey ([Primera Federación, Wikipedia](https://en.wikipedia.org/wiki/Primera_Federaci%C3%B3n)). England uses U21 leagues instead and has no B teams in the pyramid.

- Messi: Barça C (tier 4), 10 games and 5 goals; Barça B (Segunda B, tier 3), 5 games and 0 goals in 2003-04 ([FC Barcelona](https://www.fcbarcelona.com/en/news/1692969/all-time-stats-for-messi-in-the-barca-youth-teams); [ESPN Deportes](https://espndeportes.espn.com/futbol/espana/nota/_/id/7751437/messi-barcelona-debut-rijkaard)). Wikipedia's infobox shows Barça B 22 games and 6 goals across 2004-05 too, listed under **senior career** ([Wikipedia: Messi](https://en.wikipedia.org/wiki/Lionel_Messi)).
- **But the 900 excludes them.** A fan site that adds youth and reserve official games gets ~961 for Messi ([messivsronaldo.app](https://www.messivsronaldo.app/detailed-stats/all-goals-including-youth/)). It labels that figure separately because it is not the standard number.
- Others: Ronaldo Sporting B (2 games, 0 goals), Benzema Lyon II (20 games, 15 goals), Mbappé Monaco II (12 games, 4 goals), Haaland Bryne 2 (18 games, 18 goals) and Molde 2, Lewandowski Legia II and Znicz II.

So: Wikipedia lists the rows (they are real senior league football), and every headline count leaves them out.

**Loans count, under the loan club.** A loan is a temporary move. The player plays real official games for the other club, and those goals are his. They are **not** credited to the parent club's totals (Lukaku's West Brom goals are not Chelsea goals), but they **are** in his career goals. Wikipedia shows each loan as its own "→ Club (loan)" row ([Wikipedia: Lukaku](https://en.wikipedia.org/wiki/Romelu_Lukaku)):
- Lukaku: Chelsea 2011-14 (10 games, 0 goals); loans to West Brom 2012-13 (35 games, 17 goals) and Everton 2013-14 (31, 15); later loaned from Chelsea to Inter and Roma.
- De Bruyne: Chelsea 2012-14 (3, 0); loan to Werder Bremen 2012-13 (33, 10) ([Wikipedia](https://en.wikipedia.org/wiki/Kevin_De_Bruyne)). He was *not* loaned to Genk; Genk was his first senior club.
- Kane: loans to Leyton Orient (League One, tier 3), Millwall (Championship, tier 2), Norwich (PL) and Leicester (Championship) in 2011-13 ([Wikipedia](https://en.wikipedia.org/wiki/Harry_Kane)). Media counted those goals in his "500 career goals" in February 2026 ([LBC](https://www.lbc.co.uk/news/sport/harry-kane-500-goals-career-landmark/)). I did not find an explicit breakdown. Both standard methods include loan clubs, so I treat it as included with high confidence.
- Salah: Chelsea loaned him to Fiorentina and Roma; Mbappé's first PSG season (2017-18) was technically a loan with an obligation to buy.

The Kane case is the instructive one. A tier-3 loan at 18 is functionally AA ball, but it counts because it is an official first-team match at a real club. The football rule is "**first team of a real club, official match**", not "**top league**".

## 6. Relegation and second-tier seasons

Goals in a second-tier season **count in "career goals" and "club goals"**. They **do not count in "top-flight goals"** or "Serie A / La Liga / Premier League goals".

Examples:
- **Juventus, Serie B 2006-07.** Juventus were demoted for the Calciopoli scandal. Del Piero, Buffon, Nedvěd, Trezeguet, Camoranesi and Chiellini stayed. Del Piero was Serie B top scorer with 20 league goals (23 in all competitions) and Juve went straight back up ([Wikipedia season page](https://en.wikipedia.org/wiki/2006%E2%80%9307_Juventus_FC_season); [90min](https://www.90min.com/posts/5036385-buffon-reveals-why-he-other-stars-chose-to-stay-at-juventus-after-their-relegation-to-serie-b)). Del Piero's Juventus record of 290 goals includes those Serie B goals. His Serie A total does not.
- **AC Milan, Serie B 1980-81 and 1982-83.** Milan were relegated once for the Totonero betting scandal and once on the pitch. Franco Baresi, a one-club legend, played both Serie B seasons, and they count in his Milan appearance record.
- **Atlético Madrid, Segunda 2000-02.** Fernando Torres made his senior debut in the second tier, and his first full senior season was there.
- **Lewandowski's way up:** he played in tiers 4 (Delta Warsaw), 3 and 2 (Znicz Pruszków, top scorer of the second tier in 2007-08) before the Ekstraklasa ([Wikipedia](https://en.wikipedia.org/wiki/Robert_Lewandowski)). This is the closest thing to a "minor-league climb", and it is counted in his career totals.

## 7. Career arcs

All rows are league seasons; apps (goals) are league-only per Wikipedia infoboxes read 17-20 Oct 2026. Reserve rows in italics. The rightmost columns count the distinct leagues each player has appeared in (reserves excluded) and the big-five leagues among them.

| Player (born) | Clubs (league, years) | Leagues | Big-five leagues |
|---|---|---|---|
| **Messi** (1987) | *Barça C/B (ESP 4/3), 2003-05*; Barcelona (La Liga) 2004-21, 520 (474); PSG (Ligue 1) 2021-23, 58 (22); Inter Miami (MLS) 2023-, 80 (75). Argentina 208 (126) | 3 | 2 |
| **C. Ronaldo** (1985) | *Sporting B*; Sporting (POR) 2002-03, 25 (3); Man Utd (PL) 2003-09, 196 (84); Real Madrid (La Liga) 2009-18, 292 (311); Juventus (Serie A) 2018-21, 98 (81); Man Utd (PL) 2021-22, 40 (19); Al-Nassr (SPL) 2023-, 115 (106). Portugal 234 (146) | 5 (POR, ENG, ESP, ITA, KSA) | 3 |
| **Haaland** (2000) | *Bryne 2, Molde 2*; Bryne (NOR tier 2) 2016-17; Molde (Eliteserien) 2017-19, 39 (14); Salzburg (AUT) 2019-20, 16 (17); Dortmund (Bundesliga) 2020-22, 67 (62); Man City (PL) 2022-, 139 (120). Norway 59 (65) | 4 (+NOR tier 2) | 2 |
| **Mbappé** (1998) | *Monaco II*; Monaco (Ligue 1) 2015-18, 41 (16); PSG (Ligue 1) 2017-24, 205 (175) incl. loan year; Real Madrid (La Liga) 2024-, 74 (65). France 107 (67) | 2 | 2 |
| **Lewandowski** (1988) | Delta Warsaw (POL tier 4); *Legia II*; Znicz (POL tiers 3-2) 2006-08, 59 (36); Lech (Ekstraklasa) 2008-10, 58 (32); Dortmund 2010-14, 131 (74); Bayern 2014-22, 253 (238); Barcelona (La Liga) 2022-26, 134 (83); Chicago Fire (MLS) 2026-, 15 (6). Poland 170 (92) | 4 top flights (POL, GER, ESP, USA) | 2 |
| **Ibrahimović** (1981) | Malmö (SWE) 1999-01; Ajax (NED) 2001-04; Juventus 2004-06; Inter 2006-09; Barcelona 2009-11; Milan 2010-12; PSG 2012-16; Man Utd 2016-18; LA Galaxy (MLS) 2018-19; Milan 2019-23. Total 637 (405). Sweden 122 (62) | 7 (SWE, NED, ITA, ESP, FRA, ENG, USA) | 4 |
| **Salah** (1992) | Al-Mokawloon (EGY) 2010-12; Basel (SUI) 2012-14; Chelsea (PL) 2014-16, 13 (2); Fiorentina/Roma (Serie A, loan then permanent) 2015-17; Liverpool (PL) 2017-26, 315 (191); Trabzonspor (TUR) 2026-. Egypt 122 (68) | 5 (EGY, SUI, ENG, ITA, TUR) | 2 |
| **Kane** (1993) | Tottenham (PL) 2009-23, 317 (213); loans to Leyton Orient (ENG 3), Millwall (ENG 2), Norwich (PL), Leicester (ENG 2) 2011-13; Bayern (Bundesliga) 2023-, 100 (102). England 125 (91) | 2 top flights (+ENG tiers 2-3) | 2 |
| **Neymar** (1992) | Santos (BRA) 2009-13, 179 (107); Barcelona 2013-17, 123 (68); PSG 2017-23, 112 (82); Al-Hilal (SPL) 2023-25, 3 (0); Santos 2025-, 43 (19). Brazil 130 (80) | 4 (BRA, ESP, FRA, KSA) | 2 |
| **Benzema** (1987) | *Lyon II*; Lyon (Ligue 1) 2004-09, 112 (43); Real Madrid 2009-23, 439 (238); Al-Ittihad (SPL) 2023-26, 64 (38); Al-Hilal (SPL) 2026, 12 (10). France 97 (37) | 3 | 2 |
| **Pelé** (1940) | Santos (BRA) 1956-74, 583 (569); NY Cosmos (NASL) 1975-77, 64 (37). Brazil 92 (77) | 2 | 0 |
| **Maradona** (1960) | Argentinos Juniors 1976-81; Boca 1981-82; Barcelona 1982-84; Napoli 1984-91, 188 (81); Sevilla 1992-93; Newell's 1993-94; Boca 1995-97. Argentina 91 (34) | 3 (ARG, ESP, ITA) | 2 |
| **Ronaldo Nazário** (1976) | Cruzeiro (BRA) 1993-94; PSV (NED) 1994-96; Barcelona 1996-97; Inter 1997-2002; Real Madrid 2002-07; Milan 2007-08; Corinthians 2009-11. Total 384 (280). Brazil 98 (62) | 4 (BRA, NED, ESP, ITA) | 2 |

Sources: Wikipedia pages for [Messi](https://en.wikipedia.org/wiki/Lionel_Messi), [Cristiano Ronaldo](https://en.wikipedia.org/wiki/Cristiano_Ronaldo), [Haaland](https://en.wikipedia.org/wiki/Erling_Haaland), [Mbappé](https://en.wikipedia.org/wiki/Kylian_Mbapp%C3%A9), [Lewandowski](https://en.wikipedia.org/wiki/Robert_Lewandowski), [Ibrahimović](https://en.wikipedia.org/wiki/Zlatan_Ibrahimovi%C4%87), [Salah](https://en.wikipedia.org/wiki/Mohamed_Salah), [Kane](https://en.wikipedia.org/wiki/Harry_Kane), [Neymar](https://en.wikipedia.org/wiki/Neymar), [Benzema](https://en.wikipedia.org/wiki/Karim_Benzema), [Pelé](https://en.wikipedia.org/wiki/Pel%C3%A9), [Maradona](https://en.wikipedia.org/wiki/Diego_Maradona), [Ronaldo Nazário](https://en.wikipedia.org/wiki/Ronaldo_(Brazilian_footballer)). Late-2026 moves (Salah to Trabzonspor, Lewandowski to Chicago Fire, Benzema to Al-Hilal, Lukaku to Fenerbahçe) come from those infoboxes and are newer than my own background knowledge. Verify them before shipping.

**The pattern.**
- **Start:** a home or development league (Portugal, Netherlands, Brazil, Norway, Austria, Poland, Egypt, Switzerland), often with a reserve team row before it.
- **Prime (roughly ages 22-32):** 1 to 3 big-five leagues, usually 1 or 2 clubs. Almost all of the "is he great?" evidence comes from here.
- **End:** Saudi Arabia, MLS, Turkey or a return home (Neymar to Santos, Maradona to Boca, Ronaldo Nazário to Corinthians).
- Mbappé (2 leagues, both big-five) and Kane (2) are unusually concentrated. Ibrahimović (7) is the extreme scatter.

A comparator chart that colours the line by league will show this shape clearly. A comparator that silently uses one league will cut off the first and last thirds of most careers.

## 8. How football already phrases "same point in the career"

The discourse is already full of these comparisons. It uses two clocks:
- **Age:** "Haaland vs Messi and Ronaldo at 21/24/26" ([FourFourTwo](https://www.fourfourtwo.com/us/features/how-does-erling-haalands-goalscoring-record-compare-to-that-of-messi-ronaldo-lewandowski-and-mbappe-at-the-same-age); [Planet Football at 26](https://www.planetfootball.com/stats-tables/erling-haaland-lionel-messi-cristiano-ronaldo-career-stats-age-26)). "Mbappé became the first to 300 career goals before turning 25", noted by Opta and reached at 24y 333d ([Fox Sports](https://www.foxsports.com/stories/soccer/kylian-mbappe-reaches-300-goals-faster-than-lionel-messi-cristiano-ronaldo)). "Mbappé's international record vs Messi and Ronaldo at the same age" ([Planet Football](https://www.planetfootball.com/stats-tables/comparing-kylian-mbappe-international-record-messi-ronaldo-same-age)).
- **Games:** "Fastest to 100 Premier League goals": Haaland needed 111 games, against Shearer's 124 ([The Analyst/Opta](https://theanalyst.com/articles/erling-haaland-fastest-100-premier-league-goals-stats)). "Fastest to 300 goals", by games ([Planet Football](https://www.planetfootball.com/stats-tables/erling-haaland-lionel-messi-cristiano-ronaldo-fastest-300-goals-comparison)). "Fastest to 50 Champions League goals" is a standard Opta and UEFA milestone, also counted by games.

**The scope is always named in the sentence:** "Premier League goals", "Champions League goals", "career goals (club and country)", "league goals in Europe's top flights". The articles disagree on scope and even contradict each other: FourFourTwo gives Haaland both 113 and 133 at 21. Goal's age-24 comparison excludes non-European and non-top-flight goals to get Haaland 121 vs Messi 119 ([Goal](https://www.goal.com/en-us/lists/pep-guardiola-erling-haaland-lionel-messi-cristiano-ronaldo-level-goal-scoring/blt8a40f145302ef813)). A tool that makes the scope explicit and switchable fixes a real problem.

**Starts barely matter.** Football's unit is **appearances** (any minutes, including off the bench). Analysts add **minutes** and **goals per 90**. FBref and Transfermarkt show starts, but no milestone is phrased per start. The NFL "wins through 150 starts" framing should become "goals through N appearances" or "goals before age X". Wins and trophies are discussed ("trophies by 25"), but they are team stats, not part of a scorer's record.

## 9. The Jeter analogy, answered

| US frame | Football case | How football itself treats it | Evidence |
|---|---|---|---|
| AAA (excluded) | **Reserve/B teams** (Barça B, Castilla, Bayern II, Sporting B) | **Excluded** from headline career totals; listed by Wikipedia as a senior row; kept separate by stat sites | Messi's 900 = 672 + 32 + ~81 + ~115, no Barça B ([ESPN](https://www.espn.com/soccer/story/_/id/47220729/messi-score-900th-goal-2026-reach-1000-pass-ronaldo)); youth-inclusive 961 is labelled separately ([messivsronaldo.app](https://www.messivsronaldo.app/detailed-stats/all-goals-including-youth/)) |
| Bad team, same league (included) | **Second tier after relegation** (Juve 2006-07) | **Included** in career and club totals; **excluded** from top-flight and league-name totals | Del Piero's Juve record includes Serie B; Serie A totals don't |
| Minor-league rehab stint | **Loan to a lower-tier club** (Kane at Leyton Orient) | **Included** in career totals (it's a real first team), credited to the loan club | Wikipedia loan rows; Kane's 500 counted from his whole senior career |
| MLB → NPB (stats usually kept separate) | **Saudi / MLS / Turkey late career** | **Included** in career totals; discounted in argument; "Europe-only" splits are common | Ronaldo's ~970 includes Al-Nassr; Goal's Europe-only comparisons |
| Separate sport-level record (e.g. Olympics) | **National team** | Included in "career goals", and **also** kept as its own record | Guinness 146 international; Wikipedia's separate infobox block |
| Spring training (excluded) | **Club friendlies / exhibitions** | **Excluded** | Pelé's disputed 1,279 vs official 775 (RSSSF) |

**My honest read.** Football has no "major league", so its line is not drawn by league. It is drawn by **match status**: an *official, competitive* game for a club's *first team* (or the senior national team) counts, wherever that club plays. That puts:
- **Barça B ≈ AAA → excluded.** It is a feeder squad of the same club, and the football world excludes it from headline numbers even though Wikipedia lists it.
- **A Championship or Serie B season after relegation ≈ a bad team in the same league → included** in career goals. The football-specific nuance is that "top-flight goals" exists as a standard subset that drops it.
- **The Saudi Pro League ≈ NPB, but football keeps the stats.** Fans include Al-Nassr goals in totals and then argue about their worth. Guinness, UEFA and Opta do not discount them. UEFA counts only its own competitions anyway.

What each authority counts:
- **Wikipedia infobox:** domestic league only, per club; B teams listed; loans as rows; national team separate ([template](https://en.wikipedia.org/wiki/Template:Infobox_football_biography)).
- **Transfermarkt / FBref:** every competition, one row each; the user picks the subtotal.
- **Guinness:** separate records (international goals; Pelé's all-games total, flagged as including exhibitions).
- **UEFA:** only UEFA competitions (European Cup + Champions League counted as one).
- **Opta:** competition-scoped milestones ("Premier League", "Champions League") and "all competitions, club and country" for career milestones.

**What this means for the comparator.** Default to "all senior official games, club + country", counted by appearances and by age. Offer scope toggles: league only, club only, internationals only, big five only, a named league (with "Premier League 1992-" vs "English top flight 1888-" as two options). Exclude reserve, youth and friendly matches, and say so in the Method. Colour each season by league and tier so a Serie B year or a Saudi year is visible instead of quietly filtered out.

## Gaps and caveats
- I could not find who coined "big five". Deloitte is the main institutional user, not proven as the source.
- Most of the late-2026 club moves are recent. They come from Wikipedia infoboxes as of 17-20 Oct 2026.
- Transfermarkt pages were not read directly (bot wall). Its treatment of loans as their own club rows is from general knowledge, consistent with FotMob and Wikipedia.
- Exact totals (Ronaldo, Messi) differ by 1-10 goals between outlets. Any figure shown on the site needs a dated receipt.
