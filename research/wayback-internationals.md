# Wayback Machine as a source for national-team lineups, 2000-2026

Probe run 2026-10-21. Every request went through `research/wayback/wb.mjs` (1 request per 2 s, enforced across processes, cached). That came to **472 uncached requests**: 244 CDX, 203 raw snapshots, 25 other. Two subagents shared the same throttle and cache. No ESPN API call was made. ESPN event ids were read from the other agent's local cache files.

Tags: **[V]** = seen in an archived page, CDX response or file during this run, with URL and timestamp given. **[R]** = recalled, not verified this run.

## Summary

1. **Verdict: feasible for competitive matches, partly feasible for friendlies.** The Wayback Machine holds FIFA.com's deleted official match reports for every World Cup qualifier from 1998 to 2010. Archived distinct match ids per cycle: 643 / 777 / 847 / 853 [V]. Each report has XIs, full bench, sub minutes, goals with minutes, cautions, referee and attendance, all in static HTML [V].
2. UEFA.com's history pages hold all of Euro 2000: 259 match ids, i.e. 228 qualifiers and play-offs plus 31 finals, every one with a lineup box [V]. This fills ESPN's biggest hole outright.
3. Euro 2004 qualifiers (210) come from UEFA's 2002-03 live pages and the later history pages. Euro 2008 qualifiers (306) are already in ESPN with rosters, and UEFA's archived pages can fill any gaps.
4. **Friendlies have no official archive.** FIFA and UEFA did not report friendlies before about 2012.
   - The best archived source is 11v11.com, whose URL slug can be built from martj42's fixture list. It was captured for 18/20 sampled major-team friendlies and 6/20 others [V].
   - 11v11 is error-prone. Its goalkeeper was given a wrong identity in 2 of 7 pages, it has blank substitution "for" fields, and its minutes drift by 1-4 [V]. Every 11v11 row therefore needs a second source.
   - Second sources: BBC for home nations, Sky Sports `match_facts` 2007-12, worldfootball.net, Soccerway, DFB 2000-06 and national newspapers.
5. Six target matches (seven with Messi's debut): **six recovered completely, five of those agreeing across two independent sources, and one partially** (Portugal v Kazakhstan 2003, where the archive has a damaged 11v11 page and newspaper prose but no line-up box).
6. Two-source agreement is not automatic. FIFA's own report credits **Danny Murphy** with England's second goal in Munich (48') and lists him at #4. BBC's minute-by-minute shows it was **Steven Gerrard** at 45' [V]. A known-answer and two-source gate is mandatory, not optional.
7. **The brief had two fixture errors.** "Portugal v Kazakhstan 2004-08-18" was played on 2003-08-20, Ronaldo's debut. "England v Germany 2001-09-01" was Germany 1-5 England in Munich [V, martj42 results.csv].
8. **Terms:** the facts are uncopyrightable in the US. UK/EU database right and Swiss unfair-competition law are the live risks for a wholesale FIFA/UEFA extraction [R]. Reading archived copies spares FIFA's servers, but the legal question is the same as copying their database.
9. **Fit with Drew's rule:** a few thousand Wayback fetches at 1 per 2 s are within IA's published guidance. A complete re-assembly of FIFA's qualifier database stretches "receipts at reader pace". A player-driven harvest of about 2,500 matches with per-row receipts fits it.
10. **Sized plan:** about 3,100 FIFA qualifier pages, 260 UEFA Euro 2000 pages, about 500 UEFA Euro 2004 qualifier requests, and about 2 requests per friendly for 11v11 plus 2 for a cross-check source. A 10,000-match harvest is about 25,000-30,000 requests. That is about 15 hours of pure throttle, but CDX latency (10-90 s per query) makes it several days wall-clock unless CDX listings are batched by prefix, which the plan does.

## 1. Per-source table

Density is distinct match-page URLs (or match ids) archived for the era, measured by CDX prefix queries. "Capped" means the query hit its row limit, so the true count is higher. Raw data: `research/wayback/density.json`, `density.log`.

| Source | URL pattern (archived) | Density, 2000-2012 era | What a page holds | Parseability | Era / use |
|---|---|---|---|---|---|
| **FIFA.com archive, WC qualifiers** | `www.fifa.com/worldcup/archive/{edition=1013 \| edition=4395 \| germany2006}/preliminaries/preliminary=Z/matches/match=N/report.html`; 2010: `.../southafrica2010/preliminaries/<zone>/matches/round=R/match=N/report.html` | 643 (1998), 777 (2002), 847 (2006), 853 (2010) distinct match ids, i.e. complete cycles [V]. Captured 2007-2012 | Both XIs with shirt numbers and (GK)/(C); full bench; subs as `(-88')` / `(+88')`; goals with minute, including `45'+1`; cautions with minute; sent off; referee, two assistants, fourth official (2002-2010); date, venue, kickoff, attendance; coach [V] | Static. `div.mrep` (2002-06) / `FASTReport` (2010), `div.lnupTeam[ away]`, `div.bibNum`, `div.playerInfo span`. Zone index pages (`preliminary=Z/index.html`) list every match with id [V]. Parser `wayback/fifa.mjs` | **Harvest.** Gated sample: 2006 12/12, 2002 11/12, 2010 9/12 (all 3 failures were 2020 extensionless captures; the 2011-12 `.html` captures parsed), 1998 6/12 (FIFA's 1998 sub data is incomplete in the source) [V] |
| FIFA.com archive, WC finals | `.../results/matches/match=N/report.html` | 64 per edition [V] | same format | same | ESPN already has 1998+; use only for gates |
| FIFA.com 2008-10 live `/worldcup/preliminaries/` | `www.fifa.com/worldcup/preliminaries/...` | 20,000+ URLs, mostly news and photos [V] | not needed | | Superseded by the archive pages |
| **UEFA.com history, Euro 2000** | `www.uefa.com/uefaeuro/season=2000/matches/round=R/match=M/index.html` and `.../postmatch/lineups/index.html` | 259 match ids (round 1165 = 220 qualifiers, 1318 = 8 play-offs, 1458/1459/1460/1461 = finals); 112 with a separate lineups page, 146 root-only; root pages also carry the lineup box (8/8 sampled) [V]. Captured 2011-2020 | `div#matchbox`: round, date, kickoff, stadium, city, score, scorers with minutes (`Zidane 117 ET (P)`). `div.box.Lineup`: XIs and benches with shirt numbers, (GK)/(C), per-player event icons with minutes (Goal, Yellow Card, Red Card, Substitution), coaches, referee, assistants [V] | Static. `tr.people` rows, `td.c.w18` shirt, `span` (2013+) or `a.pllinehe` (2011-12) name, `span.minbymin`. Parser `wayback/uefa.mjs` | **Harvest.** Sample 11/12 clean; the twelfth showed 10 starters on one side [V] |
| UEFA.com live era 2001-03 (WC 2002 qualifiers, Euro 2004 qualifiers) | `www.uefa.com/competitions/WorldCup/FixturesResults/Round=1478/Match=N/Report=MS.html`; `.../competitions/EURO/FixturesResults/Round=1579/Match=N/Report=MS.html` | 228 MS pages (WC 2002 qualifiers), about 200 (Euro 2004 qualifiers) [V, subagent] | XIs with numbers, bench, coaches, all four officials, event list (goals, cards, "X out / Y in" with minutes); no attendance [V, subagent] | Static XSLT tables (`td.FixturesTitle`/`FixturesBody`, `#Tbl1` lineups, `#Tbl2` events) | **Harvest** for Euro 2004 qualifiers. The first capture is often **pre-match** ("Lineups not yet available"), so pick a capture dated after the match |
| UEFA.com live era 2004-09 (WC 2006/2010 qualifiers) | Round=1915, round=15218, `Report=MS/LU/EV` | 274 / 207 pages [V, subagent] | **No lineups ever**, only officials [V, subagent] | | Receipts for referees only. FIFA covers these |
| UEFA.com live era, Euro 2008 qualifiers | `.../competitions/euro/fixturesresults/round=2241/match=N/report=lu.html` + `report=ev.html` | 301 LU, 196 EV [V, subagent] | Both XIs, bench, coach, scorers, officials (LU); events with minutes (EV) [V, subagent] | `ul.lineup > li`, `div.lineupHome`, `dl.officials` | Gap-fill (ESPN has these with rosters) |
| UEFA.com history, WC 2010 qualifiers and Euro 2004/2008 qualifiers | `worldcup/matches/season=2010/round=15218/match=N/`; `uefaeuro/season=2004\|2008/matches/round=1579\|2241/...` | 243; 53 + 139 lineups pages [V, subagent] | uefa.mjs format | uefa.mjs | Fallback |
| UEFA.com friendlies | `www.uefa.com/worldcup/friendlies/season=2014/...` | about 60 matches from Aug 2012; 0 for 2006/2010 [V, subagent] | events only on the root page | | Useless for 2000-11 |
| **ESPN Soccernet 2000 (soccernet.com)** | `www.soccernet.com/euro2000/matchstats/YYYYMMDD/xxx_yyy.html`, `.../matchreports/...` | soccernet.com 2000-02: 8,443 URLs [V] | Euro 2000 matchstats: XIs with numbers, subs "for X (min)", bookings with minutes, sent off, referee, attendance, venue (plain text) [V] | Static, regex-able | Receipts for Euro 2000 (independent of UEFA) |
| ESPN Soccernet 2003-12 | `soccernet.espn.go.com/{match,report,gamecast}?id=<ESPN event id>`; 2010-12 `/match/_/id/N` | 20,000+ capped, but only about 40-120 pages per 10,000-id block for 2004-06 ids, mostly captured 2010-12 [V] | Rendered from ESPN's own database | | **Useless:** not independent of the API and sparse. None of 152876, 158829, 156881 was captured [V] |
| ESPN JSON API | `site.api.espn.com/apis/site/v2/sports/soccer/`, `site.web.api.espn.com/...` | **0 captures** [V] | | | Never archived |
| **BBC Sport 2001** | `news.bbc.co.uk/sport/hi/english/football/world_cup_2002/newsid_NNN0000/NNNNNNN.stm` | 128 URLs for ids 151xxxx-152xxxx (Sep 2001) [V] | Clockwatch pages end with "Teams:" (XIs, subs listed). Sub minutes are inside the narrative [V] | Text | Receipts (England) |
| **BBC Sport 2002-09** | `news.bbc.co.uk/sport{1,2}/hi/football/internationals/NNNNNNN.stm` | about 9,000 URLs (4,025 sport1 + 4,865 sport2) [V] | Home-nations and big-match reports end with a team line: XI with "(Sub min)", Subs Not Used, Booked, Goals with minutes, Att, Ref [V] | Plain text; regex | **Harvest** for England/Scotland/Wales/NI, and receipts for big friendlies. Index pages were captured only about monthly, so find ids by id-range scan (ids are sequential with date) |
| BBC Sport 2012 | `www.bbc.co.uk/sport/0/football/NNNNNNNN` | 9,834 URLs (2012) [V] | `#line-up-wrapper`, players with "(Sub - 46')", Ref, Att [V, subagent] | Static, clean | 2012 |
| **11v11.com** (AFS, live site) | `www.11v11.com/matches/<home>-v-<away>-<dd>-<month>-<yyyy>-<id>/` | Friendlies 2000-12: 18/20 major-team and 6/20 other matches captured [V]. Captures 2012-2023 | Goals with minute, XIs with positions, subs "X for Y" with minute, cards with minute and colour, bench (often used subs only) [V] | Static: `div.goals`, `div.lineup`, `div.substitutions` (`span.substitute`/`span.substituted`), `div.cards`. Parser `wayback/elevens.mjs` with self-checks | **Harvest, but always cross-check.** Errors seen: goalkeeper Ricardo shown as "Ricardo Silva" (2 of 7 pages), 12-man XI, blank "for" (4 of 7), minutes off by 1-4 vs BBC/UEFA/Soccernet [V] |
| worldfootball.net (live) | `www.worldfootball.net/report/<german-slug>/` | 2,136 WC-qualifier and 675 Euro-qualifier era slugs; captures 2013-2025 [V, subagent] | XIs, bench, subs with minutes, cards with minutes, goals, managers, stadium, attendance, referee and assistants [V, subagent] | Static `table.standard_tabelle` | Second source for friendlies; German slug building needed |
| Soccerway (live) | `{uk,www}.soccerway.com/matches/YYYY/MM/DD/<region>/<comp>/<home>/<away>/<id>/` | about 230-530 distinct international matches per year per host 2002-08 [V, subagent] | Old matches captured in 2010: score only. 2009+ matches, and post-2015 captures of old ones: XIs, subs "Y for X 60'", bookings, goals, coach, sometimes officials [V, subagent] | Static `block_match_lineups` | Second source for 2005+; prefer post-2015 captures |
| Sky Sports | `www.skysports.com/football/match_facts/0,19762,11065_<id>,00.html` | ≥9,997 ids 2007-12 (mostly club games) [V] | Att, scorers, XIs, bench, sub minutes, cards; no referee [V, subagent] | Static tables | Second source 2007-12 via team pages |
| national-football-teams.com (live) | `www.national-football-teams.com/matches/report/<id>/<Home>_<Away>.html` | about 4,900, captured 2014-16 [V, subagent] | Old matches: "No events available" [V, subagent] | | Useless for 2000-12 |
| eu-football.info (live) | `eu-football.info/_match.php?id=N` | 1,715-3,143 match URLs, captured 2011-12 [V] | not fetched | | Sparse; receipts at most |
| Guardian | `www.guardian.co.uk/football/...` | CDX returns **403** for the prefix [V, subagent] | | | Cannot be enumerated |
| Telegraph | `www.telegraph.co.uk/sport/football/international/...` | CDX works [V, subagent] | No team line in the 2007 report read [V, subagent] | | Useless |
| Clarín (AR) | `www.clarin.com/diario/YYYY/MM/DD/deportes/d-NNNNN.htm` | 5-20 pages per day [V] | Prose; the line-up box ("síntesis") is an **image** [V] | | Receipts for prose facts |
| Público (PT) | `jornal.publico.pt/YYYY/MM/DD/Desporto/DNN.html` | 13 pages for 2003-08-21 [V] | Prose; line-up box not captured [V] | | Receipts |
| FPF | `www.fpf.pt/seleccoes/aa/historial/historialNN.htm` | 8 decade pages [V] | Date, venue, opponent, score, competition, coach, scorers; no lineups [V] | | Receipts for scorers |
| AFA | `www.afa.org.ar/datafactory/...` | handful [V, subagent] | Pre-match ficha, minute-by-minute without lineup [V, subagent] | | Useless |
| DFB | `www.dfb.de/dfb-team/db/schema.php?...&matchid=dfbatN` | 759 ids, about 51 for 2000-06 [V, subagent] | XIs, sub minutes, goals, attendance, referee, booked [V, subagent] | Small text page | Germany 2000-06 second source |
| The FA, Euro2000.org | `www.thefa.com/`; `www.euro2000.org/de/...` | thefa.com CDX 504; Euro2000.org 10,000+ (German-language CMS) [V] | not fetched | | Not pursued |

## 2. Six (seven) matches recovered

"Time" is approximate wall clock this session, mostly CDX latency; the first match per source includes learning the page format. Sub notation: `A→B 61'` means B replaced A at 61'.

### 2.1 Portugal 1-0 Kazakhstan, friendly, 2003-08-20, Chaves (the brief said 2004-08-18): **partial**

- **Date correction** [V]: martj42 `results.csv` row `2003-08-20,Portugal,Kazakhstan,1,0,Friendly,Chaves`. martj42 has no Portugal-Kazakhstan match in 2004. The ESPN 2004-08-18 scoreboard in the local cache does not list it either.
- **Sources found:**
  - 11v11 [V]: `http://www.11v11.com:80/matches/portugal-v-kazakhstan-20-august-2003-251761/` @20120611035856.
  - Público [V]: `http://jornal.publico.pt:80/2003/08/21/Desporto/D01.html` @20030827194044; `.../D01CX01.html` @20030827195540; `.../D01CX02.html` @20030827194320.
  - Nothing in FIFA, UEFA, BBC or Soccernet. FPF historial gives scorers only.
- **Facts:**
  - Goal 65', Simão: 11v11 "Simao 65". Público: "um golo (65')", a Kazakh centre-back's clearance hit Simão Sabrosa's chest and went in. **Two sources agree on minute and player.** Público's wording leaves own-goal-vs-Simão to the reader.
  - Ronaldo debut, came on at half-time: Público "Ao intervalo, Scolari fez quatro substituições. Entrou em cena Cristiano Ronaldo" (D01). 11v11 "Cristiano Ronaldo for Manuel Rui Costa 46". **Agree on 46'.**
  - Figo and Rui Costa both off at half-time: Público D01CX01 ("depois do intervalo, quando já não havia Figo nem Rui Costa"). 11v11 lists Figo as playing the whole match, which is wrong.
  - **Whom Ronaldo replaced is unresolved.** 11v11 says Rui Costa; I recall Figo [R].
  - Bruno Vale (goalkeeper) came on about 75' per Público ("a um quarto de hora do fim"), 82' per 11v11. **Disagree.**
  - Goalkeeper Ricardo started (Público mentions "Ricardo a fazer uma defesa"). 11v11 lists "Ricardo Silva, Defender" and 12 starters.
  - Attendance about 9,000 (Público).
- **Kazakhstan XI and subs: single source (11v11).**
- **Status:** not ledger-grade. One defect matters for the target player: Ronaldo's own row (on 46', 0 goals) is two-source, but the record of whom he replaced is not.
- **Time:** about 40 min.

### 2.2 Portugal 7-1 Russia, WC 2006 qualifier, 2004-10-13, Lisbon: **complete, two sources agree**

- **FIFA** [V]: `http://fifa.com:80/worldcup/archive/germany2006/preliminaries/preliminary=8071/matches/match=36543/report.html` @20071023021407. Parsed to `wayback/out/fifa-36543.json`.
  - Venue, attendance, referee: Jose Alvalade, att 27,258, referee Vassaras (GRE).
  - Goals: Pauleta 26, Cristiano Ronaldo 39, Deco 45, Cristiano Ronaldo 69, Arshavin 79, Simão 82, Petit 89, Petit 92.
  - Portugal XI: Ricardo; Paulo Ferreira, Jorge Andrade, Costinha, Pauleta, Simão, Miguel, R. Carvalho, Cristiano Ronaldo, Maniche, Deco.
  - Portugal subs: Pauleta→Nuno Gomes 67', Maniche→Petit 72', Ronaldo→Boa Morte 85'.
  - Russia XI: Malafeev; Anyukov, Bugaev, Smertin, Evseev, Ignashevich, Sennikov, Aldonin, Bulykin, Arshavin, Sychev.
  - Russia subs: Sennikov→Gusev 45', Sychev→Kirichenko 45', Aldonin→Boyarintsev 71'.
  - Cautions: Bugaev 46', Smertin 51', Aldonin 58'.
- **11v11** [V]: `http://www.11v11.com:80/matches/portugal-v-russia-13-october-2004-253989/` @20120610155447.
  - Same 22 starters (the goalkeeper again shown as "Ricardo Silva"). Same goal minutes and scorers. Sub minutes 67/72/85 and 46/46/71 agree, with Russia's half-time subs written as 46 vs FIFA's 45.
- ESPN has this match (event 152876) with a roster but no stats, per the coverage report.
- **Time:** about 15 min.

### 2.3 Argentina 3-1 Brazil, WC 2006 qualifier, 2005-06-08, Buenos Aires: **complete, two sources agree**

- **FIFA** [V]: `http://fifa.com:80/worldcup/archive/germany2006/preliminaries/preliminary=7302/matches/match=33887/report.html` @20071020005051. Parsed to `out/fifa-33887.json`.
  - Venue, attendance, referee: River Plate, att 49,497, referee Méndez (URU).
  - Goals: Crespo 3, Riquelme 18, Crespo 40, Roberto Carlos 71.
  - Argentina XI: Abbondanzieri; Ayala, Sorín, Mascherano, Heinze, Saviola, Riquelme, Crespo, C. González, L. González, Coloccini.
  - Argentina subs: L. González→Zanetti 71', Saviola→Tevez 82'.
  - Brazil XI: Dida; Cafu, Juan, Roque Júnior, Emerson, Roberto Carlos, Robinho, Kaká, Adriano, Ronaldinho, Zé Roberto.
  - Brazil sub: Robinho→Renato 61'.
  - Cautions: Cafu 5', Ronaldinho 42', Sorín 42', Roque Júnior 46+', Heinze 56'.
- **11v11** [V]: `http://www.11v11.com:80/matches/argentina-v-brazil-08-june-2005-254556/` @20160610075357.
  - Same XIs, goals and minutes, and Argentina subs 71'/82'. The Brazil sub is listed as Renato 61' for a blank player.
- **Time:** about 10 min.

### 2.4 Hungary 1-2 Argentina, friendly, 2005-08-17, Budapest (Messi's debut): **complete from one structured source, core facts corroborated**

- **11v11** [V]: `http://www.11v11.com/matches/hungary-v-argentina-17-august-2005-254793/` @20150417001754.
  - Goals: Torghelle 29 (HUN); Maxi Rodríguez 19, Heinze 63 (ARG).
  - Hungary XI: Király; Juhász, Éger, Bodnár, Vanczák, Takács, Huszti, Böőr, Halmosi, Gera, Torghelle.
  - Hungary subs: Torghelle→Kerekes 69', Böőr→Kenesei 69', Halmosi→Priskin 69', Vanczák→Tóth 87'.
  - Argentina XI: Franco; Ayala, Heinze, Bernardi, D'Alessandro, L. González, Maxi Rodríguez, Scaloni, Sorín, Lisandro López, Crespo.
  - Argentina subs: **Lisandro López→Messi 64'**, L. González→Zabaleta 82', D'Alessandro→Santana 90'. **Messi red card 65'.**
- **Clarín** [V]:
  - `http://www.clarin.com/diario/2005/08/18/deportes/d-05301.htm` @20080617160028: Messi's debut lasted "93 segundos" before referee **Markus Merk** showed the red card. Consistent with on 64', off 65'.
  - `.../d-05001.htm` @20070718025543: Argentina played "25 minutos con uno menos". Maxi's goal was a header from Sorín's cross; Heinze headed in D'Alessandro's corner.
  - The line-up box is an image (`2005-08-17futbol.jpg`).
- **Agreement:** Messi on, sent off within about 2 minutes, 0 goals, and scorers Maxi and Heinze are two-source. XIs and the other sub minutes are single-source.
- **Time:** about 20 min.

### 2.5 France 2-1 Portugal (golden goal), Euro 2000 semi-final, 2000-06-28, Brussels: **complete, two sources agree**

- **UEFA** [V]: `http://www.uefa.com/uefaeuro/season=2000/matches/round=1460/match=65183/postmatch/lineups/index.html` @20140324123857.
  - Header: "Semi-finals - 28/06/2000 - 20:45CET - Roi Baudouin - Brussels".
  - Goals: Nuno Gomes 19, Henry 51, Zidane 117 ET (P).
  - France XI: Barthez (16); Lizarazu, Vieira, Blanc, Deschamps, Desailly, Anelka, Zidane, Henry, Thuram, Petit.
  - France subs: Anelka→Wiltord 72', Petit→Pirès 87', Henry→Trezeguet 105'.
  - Portugal XI: Vítor Baía (1, C); Jorge Costa, Vidigal, Fernando Couto, Figo, Rui Costa, Sérgio Conceição, Dimas, Abel Xavier, Costinha, Nuno Gomes.
  - Portugal subs: Vidigal→Paulo Bento 61', Rui Costa→João Pinto 78', Dimas→Rui Jorge 91'.
  - Yellow cards: Vieira 23', Desailly 39', Vidigal 44', Figo 54', Jorge Costa 55', Dimas 62', João Pinto 107'.
  - Coaches Lemerre and Coelho. Referee Günter Benkö (AUT), assistants Sramka, Van Nylen.
- **ESPN Soccernet 2000** [V]: `http://www.soccernet.com:80/euro2000/matchstats/20000628/por_fra.html` @20000711031446.
  - Same 22 starters with the same shirt numbers, and the same six substitutions at the same minutes (61, 78, 91; 72, 87, 105).
  - Same goals, bookings, referee. Attendance 50,000.
- **Disagreements:**
  - João Pinto's booking: 117 (Soccernet) vs 107 ET (UEFA).
  - Soccernet lists Nuno Gomes "Sent Off (116)"; UEFA's page shows no red card.
- 11v11 (@20131118034331) has a third version with different minutes (Wiltord 71, Pirès 91, Trezeguet 106, Rui Jorge 87) and Nuno Gomes red 118.
- **Time:** about 25 min.

### 2.6 Germany 1-5 England, WC 2002 qualifier, 2001-09-01, Munich (the brief said "England v Germany"): **complete, sources disagree on one player**

- **FIFA** [V]: `http://www.fifa.com:80/worldcup/archive/edition=4395/preliminaries/preliminary=3835/matches/match=19743/report.html` @20070702022521.
  - Venue, attendance, referee: Olympiastadion, att 63,000, referee Collina.
  - Goals: Jancker 6, Owen 12, **"MURPHY Danny" 48**, Owen 48, Owen 65, Heskey 73.
  - England XI includes "[4] MURPHY Danny (-78')" with Hargreaves +78.
- **BBC clockwatch** [V]: `http://news.bbc.co.uk:80/sport/hi/english/football/world_cup_2002/newsid_1520000/1520626.stm` @20010904192843.
  - The narrative includes "45 mins: Gerrard scores his first international goal" and "78 mins: The outstanding Gerrard is substituted for ... Hargreaves".
  - Its Teams line names Gerrard.
  - Other times: Owen 12', 48', 67'; Heskey 73'; Asamoah for Wörns at half-time; McManaman for Barmby 65'; Carragher for Scholes 83'.
- **11v11** [V]: `.../germany-v-england-01-september-2001-271082/` @20131121080257.
  - Gerrard 45; Owen 13, 48, 66; Heskey 74.
  - Hargreaves 82 for a blank player; Carragher 88; McManaman 64; Klose for Ballack 67; Kehl for Neuville 78.
- **Ledger answer:** Gerrard (not Murphy) started and scored, 45'. That is two of three sources plus the BBC's own goal-graphic headline "Gerrard thunderbolt".
- FIFA's version would credit Murphy with an appearance and a goal he never had. Germany's later subs (Klose 65/67', Kehl 78') come only from FIFA and 11v11.
- Bonus: England 0-1 Germany at Wembley, 2000-10-07, is in the same FIFA archive (match 19731, @20071126044451, Hamann 14').
- **Time:** about 25 min.

### 2.7 Brazil 3-0 Argentina, friendly, 2006-09-03, Emirates Stadium London: **complete, two sources agree (minute drift)**

- **BBC** [V]: `http://news.bbc.co.uk:80/sport1/hi/football/internationals/5301984.stm` @20061020231051.
  - Brazil: Gomes, Cicinho (Maicon 66), Lúcio, Juan, Edmílson (Cearense 69), Gilberto, Elano (Júlio Baptista 73), Silva, Fred (Vágner Love 80), Robinho (Rafael Sóbis 89), Daniel Carvalho (Kaká 59).
  - Argentina: Abbondanzieri, Coloccini, Rodríguez (Samuel 46), Zabaleta, Mascherano (Somoza 46), Riquelme, Bilos (Insúa 72), Tevez (Agüero 66), Milito, González, Messi.
  - Goals: Elano 3, 67, Kaká 89.
  - Booked: Gilberto, Elano, Robinho; Riquelme, Milito, Agüero.
  - Att 59,032. Ref S Bennett.
- **11v11** [V]: `.../brazil-v-argentina-03-september-2006-274527/` @20150904020657.
  - Same 22 starters and same substitution pairings.
  - Minutes differ: Cearense 68, Baptista 72, Love 79, Sóbis 86; Elano 2, Kaká 88.
  - 11v11 omits Riquelme's booking.
- **Ledger answer:** apps, starts and goals agree. Minutes need a precedence rule (BBC over 11v11).
- **Time:** about 10 min.

### Scorecard

| Match | Sources with lineups | Two independent sources agree? | Ledger-grade (apps, starts, goals, sub minutes)? |
|---|---|---|---|
| POR-KAZ 2003 | 11v11 (damaged) + Público prose | Ronaldo 46' and Simão 65' yes; the rest no | No |
| POR-RUS 2004 | FIFA, 11v11 | yes | Yes |
| ARG-BRA 2005 | FIFA, 11v11 | yes | Yes |
| HUN-ARG 2005 | 11v11 + Clarín prose | Messi's row yes; XIs single-source | Messi's row yes; others no |
| FRA-POR 2000 | UEFA, Soccernet 2000, 11v11 | yes (UEFA = Soccernet) | Yes |
| GER-ENG 2001 | FIFA, BBC, 11v11 | **FIFA wrong on Gerrard/Murphy** | Yes, after the correction |
| BRA-ARG 2006 | BBC, 11v11 | yes, with minute drift | Yes |

## 3. Terms and posture

### What the Internet Archive says [V, read this run through wb.mjs]

- **Terms of Use** (snapshot `web.archive.org/web/20240101002842id_/https://archive.org/about/terms.php`, dated 31 Dec 2014; the live page is a JS-only shell):
  - Access is "granted for scholarship and research purposes only".
  - Users certify use "limited to noninfringing or fair use under copyright law".
  - Users agree "not to interfere with the work of other users or Archive personnel, servers, or resources".
  - The terms have no clause against automated access.
- **Bots page** (`archive.org/developers/bots.html`):
  - Automated requests "must include a descriptive User-Agent" naming tool, version and, for AI agents, the model.
  - "Honor 429 ... and Retry-After", add delays, cache, back off exponentially. Its example caps at 4 parallel jobs with a 1 s delay.
  - wb.mjs now sends `football-comparator-research/0.2 (wb.mjs; drewhoover.com; agent: claude-opus-5-5; ...)` and honours Retry-After.
- **Rate numbers:**
  - The only published number, 15 per minute with a 5-minute block, is for **Save Page Now**, not CDX or replay (`archive.org/details/toomanyrequests_20191110`).
  - No numeric CDX or replay limit is published. The publishers FAQ (May 2026) says "The Wayback Machine is built for human readers. We use rate limiting, filtering, and monitoring to prevent abusive access."
- **CDX server README** (`raw.githubusercontent.com/internetarchive/wayback/master/wayback-cdx-server/README.md`):
  - Default maximum is 150,000 rows per query. `limit`, `showResumeKey`/`resumeKey`.
  - Pagination via `showNumPages` and `page`: 50 blocks of about 3,000 lines per page. It is recommended for bulk queries, and paged results may be slightly stale.
- **Availability API:** `archive.org/wayback/available?url=…&timestamp=YYYYMMDDhhmmss` returns the single closest snapshot.
- **This run's experience:** about 30 CDX 503/504 responses on large prefixes, all recovered by backoff; one 429 on the Availability API; Guardian prefixes return CDX 403 (an exclusion).

### Plain statement

- **US law.** Who played, who came on in which minute, who scored and when, are facts. Under *Feist* (1991) [R] facts are not copyrightable, and a compilation's protection is thin and covers only original selection and arrangement.
  - Compiling those facts from archived BBC, UEFA, FIFA or ESPN pages, one match at a time, and storing a receipt (URL, timestamp, short verbatim quote) is reader-pace receipts research of uncopyrightable facts.
  - The prose and markup of the pages stay copyrighted, so the ledger stores facts and short quotes, never copies of pages.
- **UK/EU database right.** The UK and EU have a separate *sui generis* database right (Directive 96/9/EC; retained in UK law after Brexit) [R]. It protects a "substantial investment in obtaining, verifying or presenting" data, against extraction of a substantial part.
  - *Football Dataco v Yahoo* (CJEU 2012) [R] said fixture lists are not protected by copyright.
  - *Football Dataco v Stan James / Sportradar* (England and Wales, 2013) [R] held that live match data (goals, scorers, cards, substitutions) collected with substantial investment *is* protected by database right. That is exactly the kind of data here.
  - The right attaches to the database, not to a server, so extracting a substantial part from an archived copy is legally the same act as extracting it from the live site [R].
  - FIFA and UEFA are Swiss bodies. Switzerland has no sui generis database right, but its Unfair Competition Act art. 5(c) bars taking over another's "market-ready work product" by technical reproduction without reasonable effort of one's own [R].
  - UEFA's terms also forbid systematic collection (`research/data-sources.md`, [V] earlier). Those terms bind users of uefa.com; reading IA's copy is not using uefa.com, but IA's own terms push the use back to "noninfringing".
- **Archived copy vs live site.** Practically, reading archived pages puts zero load on FIFA, UEFA or BBC servers, ignores no robots.txt and evades no blocking. The load lands on IA, which welcomes research use at polite rates. Legally, as above, it changes nothing about the database question.

### Drew's rule: "never crawl a league site or Sports Reference; use pages as receipts at reader pace"

- **Load and politeness: fits.** About 4,000-30,000 requests at one per 2 s through the Archive, with a descriptive UA and backoff, is within everything IA publishes. It touches no league site.
- **Substance: a full harvest stretches the rule.** A full harvest of all 3,120 FIFA qualifier reports plus all of UEFA's Euro 2000 and 2004 qualifiers re-assembles FIFA's and UEFA's own match databases wholesale. That is what the rule exists to avoid, and it is where database-right exposure (UK/EU) and Swiss UCA exposure sit.
- **What fits the rule:** a **player-driven harvest**. Fetch only the matches in which the tracked stars (about 50 players) appeared, store one receipt per row, and publish derived per-player apps, starts, minutes and goals, never the full lineups.
  - A few thousand pages read at 1 per 2 s, each cited as a receipt, is the same activity as a researcher reading the pages, just patient.
  - Sizing that scope: Portugal had 45 friendlies 2003-12, Argentina 49 in 2005-12 [V, martj42]. Fifty players over about 25 nations comes to roughly 2,000-3,000 distinct matches.
- **Recommendation:** adopt the player-driven scope as the rule's working form. Do not commit a full FIFA/UEFA lineup dump to the public repo. Treat the ledger the way the StatsBomb decision treats StatsBomb rows: derived numbers plus receipts, not the source table.

## 4. Harvest plan

### Source per era

| Gap (from ESPN probe) | Primary | Second source / gate | Matches |
|---|---|---|---|
| Euro 2000 finals + qualifiers | UEFA history `uefaeuro/season=2000` (all 259 ids) | Soccernet 2000 matchstats (finals); 11v11 | 259 |
| WC 2002 qualifiers (2000-01) | FIFA archive `edition=4395` | UEFA live-era `Round=1478 Report=MS` (Europe); BBC (home nations) | 777 |
| WC 2006 qualifiers (2003-05) | FIFA archive `germany2006` | 11v11; BBC | 847 |
| WC 2010 qualifiers (2007-09) | FIFA archive `southafrica2010` (2011-12 `.html` captures) | ESPN rosters (2008-09 present) | 853 |
| WC 1998 qualifiers (pre-window; only for gates) | FIFA `edition=1013` | — (sub data incomplete) | 643 |
| Euro 2004 qualifiers (2002-03) | UEFA live-era `Round=1579 Report=MS` (post-match captures) + history `season=2004` | 11v11; BBC | 210 |
| Euro 2008 qualifiers | ESPN already has rosters; UEFA `round=2241 report=lu/ev` for gaps | | 306 |
| Other confederation qualifiers (AFCON, Asian Cup, Gold Cup) | not covered by FIFA/UEFA archives; 11v11 / Soccerway | | about 1,100 (2000-12) |
| Friendlies 2000-12 | 11v11 (slug from martj42) | BBC (home nations, big friendlies), Sky `match_facts` 2007-12, worldfootball.net, Soccerway, DFB (Germany 2000-06), national press | 4,524 (1,734 involve a top-35 team) |
| Friendlies 2013-26 | ESPN where it has rosters (2018 3/3, 2024 2/3); else 11v11 / worldfootball.net (denser recent captures) | BBC 2012+ format | 3,882 |

### Enumeration

- **FIFA:**
  1. One CDX prefix query per edition (`.../preliminaries/`, limit 20,000; under 3,000 rows each) gives every report URL and timestamp.
  2. Group by `match=` id. Prefer the `report.html` capture over 2020 extensionless ones.
  3. The zone index pages (`preliminary=Z/index.html`, 6-8 per edition) give home, away, score and id for the join to martj42. Their first capture can fail to parse (Euro zone 2002), so try the next digest.
- **UEFA Euro 2000:** one CDX prefix query (`uefaeuro/season=2000/matches/`) lists 259 ids. Fetch `postmatch/lineups/index.html` where present, else the root `index.html`; both carry the box.
- **UEFA Euro 2004 qualifiers:** CDX prefix for `competitions/EURO/FixturesResults/Round=1579/`, then one exact-URL CDX query per match (`collapse=timestamp:8`) to pick a capture after the match date. History pages are the fallback.
- **11v11:** build `<home>-v-<away>-<dd>-<month>-<yyyy>` from martj42 rows, with a name map (South Korea → `korea-republic`, United States → `usa`, ...; misses suggest more mappings).
  - Batch by team rather than per match: one CDX prefix query `www.11v11.com/matches/<team>-v-` returns all of that team's home matches.
  - So about 35 queries cover the top-35 teams' home friendlies, and their opponents' prefixes cover the away ones. A per-slug query is the fallback.
- **BBC:** article ids rise with date. Bracket the match date with ids captured that week (CDX prefix on `internationals/NN`) and read titles in id order until a "Team A n-n Team B" headline. That took 6-19 fetches per match here. Monthly index snapshots (`collapse=timestamp:6`) give anchor ids.

### Parsing (scripts that ran on the recovered pages)

- `wayback/fifa.mjs`: `parseFifaIndex` and `parseFifaReport`. Handles 1998, 2002, 2006 and 2010 markup: info table read by header label, `(-N')`/`(+N')` subs, `45'+1` stoppage, cautions, expulsions, referee, coach.
- `wayback/uefa.mjs`: `parseUefaLineups`. Handles the `div#matchbox` header and the `div.box.Lineup` table; name markup differs between 2011-12 and 2013+ captures, and both are handled. Subs are paired by equal minute on the outgoing starter and the incoming sub.
- `wayback/elevens.mjs`: `parseElevens` for 11v11, with built-in warnings (≠11 starters, no goalkeeper, blank "for", goal rows ≠ score).
- **Gates to run on every row:**
  - 11 starters per side.
  - Sub-off count = sub-on count.
  - Listed goals = score (allow own goals).
  - Join to martj42 on date, teams and score.
  - Known-answer gates: Ronaldo and Messi cap and goal logs (RSSSF), and martj42 goalscorers for competitive goals.
  - Two-source rule for any row that changes a tracked player's apps, starts or goals.

### Expected hit rate [V from samples]

| Source | In archive | Parses clean | Notes |
|---|---|---|---|
| FIFA 2002/2006 qualifiers | 100% of matches | 23/24 sampled | |
| FIFA 2010 qualifiers | 100% | 9/9 for 2011-12 captures | 2020 captures fail |
| FIFA 1998 qualifiers | 100% | 6/12 | sub minutes missing in FIFA's own data |
| UEFA Euro 2000 | 259/259 ids | 11/12 | |
| 11v11 friendlies, top-35 team | 18/20 | parser works on all; 4 of 7 pages had at least one data defect | |
| 11v11 friendlies, others | 6/20 | | |
| Data accuracy (all sources) | | | Sub minutes disagree by 1-4 between sources in about a third of substitutions; one wrong-player error in FIFA (Munich) |

### Requests for about 10,000 matches

| Block | Matches | Requests |
|---|---|---|
| FIFA qualifiers 1998-2010 | 3,120 | about 30 CDX + about 30 index + 3,120 raw + about 10% alternate captures ≈ **3,500** |
| UEFA Euro 2000 | 259 | 1 CDX + 259 raw ≈ **260** |
| UEFA Euro 2004 qualifiers | 210 | 1 + 210 exact CDX + 210 raw + about 50 fallbacks ≈ **470** |
| Friendlies and other qualifiers | about 6,400 | 11v11 by team prefix (about 400 CDX) + 6,400 raw; second source about 2 per match (≈ 12,800) ≈ **19,600** |
| **Total** | **about 10,000** | **about 24,000** |

- **Throttle floor:** 24,000 × 2 s ≈ **13.5 hours**.
- **Practical time:** about 3-4 days of background running, because CDX queries take 10-90 s and 503 or 504 under load.
- **Player-driven scope:** about 2,500 matches is about 6,000-7,000 requests, under one day.
- **Disk:** about 150 KB per FIFA page and 80 KB per UEFA or 11v11 page, so roughly 2 GB cached for the full scope. The cache is 71 MB after this probe.

### Failure modes seen

1. **Snapshots missing.**
   - The BBC match report for Germany-England was never captured; only the clockwatch survived.
   - The Público line-up box is missing.
   - Soccernet 2004-06 pages are 98% missing.
   - Guardian is CDX 403 (excluded).
2. **Pre-match captures.** UEFA live-era pages first captured before kick-off say "Lineups not yet available". Pick captures after the match date.
3. **Format drift within one source.**
   - FIFA has three markups (2002-06 `mrep`, 2010 `FASTReport`, 2020 JS app).
   - UEFA 2011 vs 2013 name markup differs.
   - 11v11's goalkeeper position labels are sometimes missing.
4. **Wayback JS shell.** Replay sometimes answers HTTP 200 with its own JavaScript page instead of the archived page (seen with a malformed URL). Check for "requires your browser to support JavaScript" and treat it as a miss.
5. **Lineups in images.** Clarín's síntesis is a JPEG. National-press line-up boxes are often images or uncaptured.
6. **Source data errors.**
   - FIFA: Murphy for Gerrard.
   - 11v11: wrong goalkeeper identity, 12-man XIs, blank "for", wrong minutes.
   - FIFA 1998: half the substitutions lack an on-minute.
   - Soccernet 2000 and UEFA disagree on a booking minute and a red card.
7. **Charset.** 2000s pages declared or sniffed as UTF-8 but encoded Latin-1. wb.mjs now falls back to windows-1252 when strict UTF-8 yields replacement characters.
8. **CDX behaviour.**
   - `collapse=urlkey` with a row cap silently truncates alphabetically later URL forms. Soccernet `match?id=` was hidden behind `match/_/id/` until queried separately.
   - Regex filters on big prefixes take minutes.
   - About 30 503/504 responses this run.
9. **Naming.** martj42 vs 11v11 team names (Korea Republic, USA, FYR Macedonia ...) cause slug misses that look like archive misses.
10. **Brief-level date errors.** Join on martj42 before searching.

## 5. Scripts written (all under `research/wayback/`)

| File | Purpose |
|---|---|
| `wb.mjs` | Throttled (1 req / 2 s **across processes** via a lock dir and timestamp file in `cache/`), disk-cached Wayback client. `get`, `cdx`, `cdxPages`, `raw` (`id_` snapshots), `available`, `text`. Exponential backoff on 429/5xx/network errors honouring Retry-After; 404/403/410 cached as misses; descriptive UA; Latin-1 fallback. CLI: `node wb.mjs cdx|pages|raw|text|avail …` |
| `density.mjs` → `density.json`, `density.log` | One bounded CDX query per candidate source, 2000-2012 |
| `shapes.mjs` | URL-shape histogram for any CDX prefix (optional regex filter) |
| `fifa.mjs` | FIFA archive index and report parsers (1998-2010), CLI |
| `recover-fifa.mjs` | Recover FIFA reports by `edition:preliminary:match` → `out/fifa-<id>.json` |
| `uefa.mjs` | UEFA history-page lineup parser, CLI |
| `elevens.mjs` | 11v11 parser with self-check warnings, CLI → `out/11v11-<id>.json` |
| `bbc-find.mjs`, `bbc-titles.mjs` | BBC index-page link finder; BBC id-range title scanner |
| `titles.mjs` | Title + snippet scan for a dated CDX prefix (newspapers) |
| `sample-harvest.mjs` → `out/sample-harvest.json` | Gated sample harvest across FIFA 1998/2002/2006/2010 and UEFA Euro 2000 |
| `friendly-hitrate.mjs` → `out/friendly-hitrate.json` | 11v11 archive hit rate on 40 martj42 friendlies |
| `show.py` | Pretty-printer for recover-fifa output |

Subagent scratch scripts (Soccerway counts, UEFA live-era, Sky, DFB probes) are in the session scratchpad, not in the project.
