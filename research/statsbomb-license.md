# StatsBomb open data: what the agreement allows for the football comparator

Researched 2026-10-21. Markers: **[V]** verified this session against the source. **[R]** reasoned or from memory, not checked against a primary source today. **[U]** could not verify. This is an analyst's read of a contract, not legal advice.

## Summary

1. The agreement has **no defined terms** for "Data", "Analysis" or "Derived". It uses lowercase "the data", "analysis" and "any analysis derived". The earlier note's framing ("only analysis may be published, with the logo") is about right. "Bars distributing ... to any third party" is right too, for the data itself [V].
2. **(a) Build-time fetch, publish only cumulative curves: arguable, leaning allowed.** The preamble and 1.4 contemplate publishing analysis with the logo. But a per-appearance cumulative curve can be differenced back into per-match goals/assists/minutes, so it is thinner cover than it looks.
3. **(b) Committed per-player-match ledger in the public repo: barred on the text.** 1.2.1 ("distribute, reproduce ... or in any way provide the data to any external or third party") and clause 7 ("transfer, distribute, license ... without the express prior written consent") both catch a re-shaped copy of the rows sitting in a public repo.
4. **(c) Receipts popover with lineups and goal minutes: barred on the text.** It is reproducing records to third parties. It is not analysis.
5. **(d) Messi La Liga set as a known-answer gate in tests: allowed.** It is internal research use, as long as the StatsBomb-derived fixture is fetched in CI and not committed.
6. **Drew's pushback is half right.** Publishing analysis is allowed, and his repo license isn't the cause of (b)'s problem. Neither sibling repo has a LICENSE file at all (both public on GitHub, `license: null`) [V]. The real onward-grant problem is **GitHub's ToS D.5**: a public repo grants every GitHub user a licence to reproduce its contents by forking, whatever LICENSE says [V].
7. So a code-only LICENSE plus a data NOTICE shrinks (b)'s exposure (it stops the repo purporting to *license* the data, which clause 7 names). It doesn't fix the "distribute / provide to a third party" problem. Only written consent or keeping the ledger out of the public repo does.
8. **Ko-fi:** a voluntary tip link on a free, ad-free site is a weak basis for "commercially exploit". It is still the one fact a hostile reader would point to, and 1.2.2 reaches "any analysis derived", which is broader than CC BY-NC.
9. **In practice:** no enforcement found in eight years. Full raw mirrors persist on Kaggle (one labelled CC0) alongside 987 GitHub forks [V]. Clause 8.3 says non-enforcement isn't a waiver, though. Governing law is England and Wales [V], where sports-event data has database right (Football Dataco v Sportradar, 2013) [R].
10. **Value:** StatsBomb adds little the comparator needs for v1. ESPN covers the big five from 2002-03. The early World Cup sets are showcase fragments (1-6 matches each), not careers [V]. The best use is (d), Messi's La Liga match set as a test gate, which is clearly fine. So skip StatsBomb as a published source for v1, use it as a gate, and send the email if (b) is ever wanted.

## 1. The agreement, quoted

Sources: `LICENSE.pdf` at https://github.com/hudl/open-data (the old https://github.com/statsbomb/open-data now redirects there) [V]. Both URLs serve a byte-identical file (sha1 `17efdfeb...`) [V]. The footer reads "[StatsBomb Data: User Agreement Standard Terms - last updated 8 September 2023]" [V]. LICENSE.pdf commit history: `6c5fa9f` 2018-06-05 initial, `bc10e73` 2019-07-15, `5401c04` 2023-10-09 "Update LICENSE.pdf" [V]. **No change in 2024, 2025 or 2026** [V]. The repo moved to the hudl org after July 2025; the exact date isn't exposed [U].

**Preamble (no section number):**
> StatsBomb have made this data freely available and accessible to encourage and facilitate research and the shared analytical understanding of the game of Football. This is aimed to be a research tool, and is intended to be used as such. Any analysis or conclusions that are created as a result of using this data, may be shared publicly but are not necessarily the opinions or analytical insights of StatsBomb.

> The provision of Github access to specific leagues of StatsBomb Data (the 'Service') is provided by StatsBomb Services Ltd ('StatsBomb') to any user (the 'User') who agrees to use the data according to the Terms and Conditions of this Agreement.

> This Agreement governs the use of the Service. By using the Service the User will be bound by all terms making up this Agreement.

**Definitions.** The only defined terms are "Service", "StatsBomb" and "User", plus "Content" in 5.2. **"Data", "Analysis" and "Derived" are not defined** [V]. "StatsBomb Data" is capitalised but never defined. "the data", "analysis" and "any analysis derived" are ordinary words.

**1.1 (grant):**
> Subject to the terms of this Agreement, StatsBomb will provide the User with access to the Service to be used for analysis, research and to facilitate the shared ideas & understanding of the data

**1.2 (restrictions):**
> 1.2. The User may not:
> 1.2.1. edit, distort, distribute, reproduce, sell or in any way provide the data to any external or third party;
> 1.2.2. commercially exploit the data or any analysis derived from the use of the Service;
> [1.2.3-1.2.5: illegal use, defamatory material, reverse engineering]
> StatsBomb reserves the right to, without prejudice to any other remedies it may have, take any such measures it deems necessary to protect against unauthorised use of the Service.

**1.4 (attribution):**
> The User is required to accredit any publication of analysis formed from StatsBomb Data with the StatsBomb brand logo.

**2.1:**
> StatsBomb have full rights to withhold the Service at any time without prior warning to its Users.

**6.1 (suspension), relevant limbs:**
> Without prejudice to any remedy that StatsBomb may have against the User, StatsBomb may at any time suspend provision of the Service without liability if: (a) StatsBomb reasonably believes that the User is using, distributing or making available any part of the Service other than in accordance with this Agreement; ... (c) StatsBomb reasonably believes the User has breached this Agreement;

**7 (Intellectual Property Rights), in full:**
> The User acknowledges and agrees that all data provided through the Service, is the property of StatsBomb. The User shall, except as expressly permitted herein, shall not modify, translate, transfer, distribute, license, sell or otherwise exploit for any purposes whatsoever any data, content or third party submissions or other proprietary rights not owned by the User: (i) without the express prior written consent of StatsBomb, and (ii) in any way that violates any third party right.

**8.2, 8.3:**
> A person who is not a party to this Agreement has no rights under the Contracts (Rights of Third Parties) Act 1999 to enforce, or to enjoy the benefit of, any provision of this Agreement.
> The failure of either Party to enforce its rights under this Agreement at any time for any period shall not be construed as a waiver of such rights.

**9 (Governing Law):**
> This Agreement and any dispute or claim arising out of or in connection with it (including any non-contractual claims or disputes) shall be governed by and construed in accordance with the laws of England and Wales and the parties irrevocably submit to the exclusive jurisdiction of the English courts.

StatsBomb Services Ltd is registered in England and Wales, no. 10377735, Bath [V].

**Derivative works and aggregates.** The agreement has no clause on derivative datasets, aggregation or summary statistics [V]. The only words reaching derived material are "any analysis derived" in 1.2.2 (commercial use only) and "analysis formed from StatsBomb Data" in 1.4 (attribution).

**README (both repos, identical, last edited 2022-03-29) [V]:**
> If you publish, share or distribute any research, analysis or insights based on this data, please state the data source as StatsBomb and use our logo, available in our [Media Pack](https://statsbomb.com/media-pack/).

The README describes the data as "freely available for public use for research projects and genuine interest in football analytics." The statsbombpy / StatsBombR READMEs (now github.com/hudl/statsbombpy, github.com/hudl/StatsBombR) add "By using this repository, you are agreeing to the user agreement." [V via subagent]. The media-pack link now redirects to a Hudl Bynder portal (hudl.bynder.com) [V via subagent]. Issue #80 reports the logo is hard to find after the rebrand [V via subagent].

## 2. Reading the text against the four scenarios

### What the text clearly permits and forbids

- **Permitted:** use "for analysis, research and to facilitate the shared ideas & understanding of the data" (1.1). Publishing "analysis or conclusions" (preamble), with the logo (1.4).
- **Forbidden without written consent:**
  - giving "the data" to anyone in any form: "edit, distort, distribute, reproduce, sell or in any way provide" (1.2.1);
  - commercial exploitation of the data *or* derived analysis (1.2.2);
  - "modify, translate, transfer, distribute, license, sell or otherwise exploit for any purposes whatsoever any data" (7).
- So the line the agreement draws is **data vs analysis**. It never says where one ends. "Is a reshaped subset of the data still 'the data'?" is the whole question for (a)-(c).

### Data vs analysis

An English court construes a contract by what a reasonable person with the parties' background knowledge would take the words to mean (Arnold v Britton; Wood v Capita) [R]. Read against the preamble's purpose ("research tool"; analysis "may be shared publicly"), the reasonable reading is:
- **Analysis:** something the user computed that says something the raw rows don't (a chart, a model output, a ranking, a curve, a conclusion).
- **The data:** the records themselves, including records that were filtered, renamed, re-keyed or re-formatted. 1.2.1's "edit" and clause 7's "modify, translate" exist to stop "I changed the format, so it's not the data any more".

Contra proferentem (ambiguity read against the drafter) helps a little at the edges [R]. It doesn't turn a per-match row into analysis.

### (a) Build-time fetch, publish only cumulative curves

**Verdict: arguable, leaning allowed.**

- The runner fetching raw JSON is "use of the Service". Nothing lands in the repo.
- Public Actions logs can't print raw rows, so don't log them.
- The Pages artifact is built by Actions and never committed to the repo.
- What ships is appearance ordinal → cumulative goals/assists/minutes. That is a computed series answering a question StatsBomb's files don't answer. It is close to the "analysis ... may be shared publicly" the preamble invites. 1.4 requires the logo.

The weakness Drew should be honest about:
- A cumulative series by appearance ordinal is lossless for the per-appearance numbers. Differencing gives back goals, assists and minutes for each appearance.
- It loses only the labels (date, opponent, lineup).
- It is shipped as machine-readable JSON a third party could fetch.

So it is a *re-encoding* of a slice of the data as well as an analysis. Two things reduce the exposure:
1. Ship the curves only for the plotted players, as the chart's own payload, not as a documented "dataset" with a download link.
2. Don't include match ids or dates in the StatsBomb-derived series.

Neither changes the information content. Both keep it on the "chart payload" side of the line.

The real argument for (a) is purpose and proportion. It is one statistic about a handful of players, from data covering ~3,500 matches of event-level detail, shown as a chart with the logo. Any reasonable reader of the agreement would call that published analysis.

### (b) Committed per-player-match ledger in the public repo

**Verdict: barred on the text.**

- One row per player per match (date, competition, opponent, started, minutes, goals, assists) is the lineup and goal records with columns dropped and renamed. That is "edit ... reproduce ... provide the data to any external or third party" (1.2.1). It is also "modify, translate, transfer, distribute" (7).
- Committing it to a public repo makes it available to anyone. GitHub's ToS D.5 adds an express grant:

  > "By making a repository public, you grant other Users a nonexclusive, worldwide license to use, display, perform and reproduce (by forking) Your Content through the Service as permitted by GitHub's functionality." [V]
  >
  > "If you post Content you did not create or own, you are responsible for ensuring it is licensed under terms that permit these uses." [V]

  So the public repo purports to sublicense fork-and-reproduce rights to StatsBomb's data, which clause 7 ("license") forbids. That happens with or without a LICENSE file.
- Drew's point that this isn't redistribution because it's only his build cache doesn't survive the text. "In any way provide the data to any external or third party" doesn't care about intent. A public repo is provision to third parties.

### (c) Receipts popover: lineup and goal minutes for one match

**Verdict: barred on the text.**

- A popover that renders a match's lineup and goal minutes, credited to StatsBomb, is reproducing StatsBomb records for readers. It isn't analysis.
- It also shows other players' data (the whole lineup), which no conclusion of Drew's requires.
- The credit doesn't help. 1.4's logo requirement attaches to "publication of analysis", not to a licence to republish records.

This is the most visible version of (b). The receipts idea fits sources that are actually licensed (Wikipedia CC BY-SA, RSSSF with permission) or ESPN.

### (d) Known-answer gate in tests

**Verdict: allowed.**

- Comparing his pipeline's Messi La Liga numbers to StatsBomb's is "analysis, research" (1.1). Nothing is provided to a third party.
- Keep it that way: the test step fetches StatsBomb JSON in CI and compares in memory.
- Don't commit a StatsBomb-derived fixture (a per-match expected-values file). That would put (b) back into the repo in miniature.
- Committing a handful of season totals as expected values (e.g. "2011-12: 37 apps, 50 goals") is fine in practice. Those are facts available from a dozen public sources. They also aren't a "substantial part" of anything (see below).

### Facts vs data: US law and the database right

**US (Feist v Rural, 1991)** [R]:
- Facts aren't copyrightable. A compilation is protected only in its original selection and arrangement.
- "Messi scored in the 23rd minute against Getafe" isn't protected by copyright anywhere in the US.
- StatsBomb's richer fields (xG, pressure, freeze frames) involve modelling judgment and may have thin protection. Who played, minutes and goals do not.

**But the agreement is a contract** [R]:
- Contracts can bind the licensee over uncopyrightable facts (ProCD v Zeidenberg, 7th Cir. 1996). Copyright preemption arguments against such contracts mostly fail in US courts.
- So "facts aren't copyrightable" is a defence to a copyright claim. It isn't a defence to a breach-of-contract claim against Drew, who has read the terms.
- Formation is about as strong as a browsewrap gets for him: LICENSE.pdf sits at the repo root, the statsbombpy README says using the repo means agreeing, and Drew has actual knowledge.

**England and Wales (clause 9)** [R unless marked]:
- Copyright in a database needs the author's own intellectual creation. Fixture lists failed that test (Football Dataco v Yahoo, CJEU C-604/10, 2012).
- The **sui generis database right** (Copyright and Rights in Databases Regulations 1997) protects substantial investment in *obtaining, verifying or presenting* contents.
- In **Football Dataco v Sportradar [2013] EWCA Civ 27**, the Court of Appeal held the right subsisted in live match data (goals, scorers, cards) gathered by paid observers. Extracting goal data to show punters infringed. (Holdings per press summaries; the judgment itself wasn't read: https://www.managingip.com/article/b1kc1w63ng9d6r/court-backs-database-owner-in-live-football-data-case, https://www.lawgazette.co.uk/law/intellectual-property/65845.article.)
- StatsBomb's collection from video is the same kind of investment. So the UK right very likely subsists in the open data.
- **Regulation 19** cuts the other way, in Drew's favour [V]:

  > "A lawful user of a database which has been made available to the public in any manner shall be entitled to extract or re-utilise insubstantial parts of the contents of the database for any purpose."
  >
  > "(2) Where under an agreement a person has a right to use a database ... any term or condition in the agreement shall be void in so far as it purports to prevent that person from extracting or re-utilising insubstantial parts..."

  (https://www.legislation.gov.uk/uksi/1997/3032/regulation/19)
- So under English law StatsBomb **cannot contract out of** a lawful user's right to re-use *insubstantial* parts. This is the strongest legal support for (a), and for (d)'s committed season totals.
  - A few players' cumulative goal/minute curves, drawn from an event database of ~3,500 matches and millions of events, is plausibly insubstantial, quantitatively and qualitatively.
  - Messi's full 520-match La Liga goals/minutes ledger is a closer call. That set exists in the open data *because* of Messi, so it is arguably qualitatively substantial.
  - Repeated, systematic extraction of insubstantial parts can add up to a substantial one (reg. 16(2)) [R].
- If the database right didn't subsist, the contract would govern unconstrained (Ryanair v PR Aviation, CJEU C-30/14, 2015) [R]. Reg. 19 helps only because the right does subsist.
- Post-Brexit, a UK-made database created after 2020 isn't protected in the EU. That doesn't matter here: clause 9 points to English courts [R].

**Net:**
- The "facts" argument protects Drew from copyright claims. It doesn't protect him from the contract. In England it partly protects him from the contract, but only for insubstantial extraction.
- That supports (a) and (d). It doesn't reach (b) (a whole ledger in a public repo) or (c) (whole lineups as receipts).

## 3. How StatsBomb/Hudl treat it in practice

Announcements (all [V via subagent]):

| Date | Post | What it says on use |
|---|---|---|
| 2018-09-11 | https://blogarchive.statsbomb.com/news/statsbomb-release-free-fifa-world-cup-data/ | "for non-commercial use". Credit StatsBomb "and where possible include our logo". Users are "actively encouraged to write about your analysis publicly". |
| 2019-07-16 | https://blogarchive.statsbomb.com/news/messi-data-release-part-1-working-with-statsbomb-data-in-r/ | "sign the user agreement and go have some fun" |
| 2021-11-09 | https://blogarchive.statsbomb.com/news/statsbomb-release-free-messi-data-all-seasons-from-2004-05-2020-21-now-available/ | "for free, public, non-commercial use" |
| 2021-11-17 | https://blogarchive.statsbomb.com/news/statsbomb-announce-the-release-of-free-statsbomb-360-data-euro-2020-available-now/ | suggests "Created with free data from StatsBomb" |
| 2023-12-19 | https://www.hudl.com/blog/statsbomb-release-free-lionel-messi-data-psg-and-inter-miami | "abide by our user agreement and credit StatsBomb" |
| 2024-07-16 | https://www.hudl.com/blog/statsbomb-release-free-euro-2024-data | publishing work is something "we greatly encourage you to do" |
| 2025-07-30 | https://www.hudl.com/blog/hudl-statsbomb-free-euro-2025-data | "credit Hudl Statsbomb as your data source" |
| 2026-05-27 | https://www.hudl.com/blog/statsbomb-free-womens-data-wsl-ligaf-bundesliga-seriea-nwsl | no terms stated |

- None of the posts mention apps, redistribution or derived datasets.
- The old resource-centre and free-data pages redirect to a Hudl product page, with no FAQ [V via subagent].
- No statement by Ted Knutson or staff on republishing derived data was found. X/Twitter wasn't searchable [U].
- Hudl hasn't answered licence questions on the repo:
  - https://github.com/hudl/open-data/issues/47 (academic citation vs logo, open since Sep 2024)
  - https://github.com/hudl/open-data/issues/80 (a YouTuber describing "commercial/monetised use", Sep 2026, unanswered) [V via subagent]

**Objections or takedowns:**
- Zero hits for "statsbomb" or "hudl" in the github/dmca repo (search index may be incomplete).
- No reports of Kaggle takedowns or cease-and-desist letters [V via subagent, not exhaustive; Reddit/X not searched].

**Uses in the wild that have persisted:**
- Full raw mirror on Kaggle, live, updated 2026-10-20, ~16 GB, 8.5k downloads: https://www.kaggle.com/datasets/saurabhshahane/statsbomb-football-data [V via subagent].
- Kaggle re-upload labelled **CC0**, live since 2020: https://www.kaggle.com/datasets/hardikagarwal1/football-analytics-event-data-statsbomb [V via subagent].
- 987 GitHub forks of the raw repo, e.g. https://github.com/eddwebster/open-data [V via subagent].
- Messi repos: https://github.com/BenjaminLarrousse/statsbomb-messi, https://github.com/amtantravahi/statsbomb_messi (contents not checked) [U].
- Shiny app, Lars Maurath's Messi Free Kick Explorer (Posit Shiny contest): https://forum.posit.co/t/lionel-messi-free-kick-explorer-shiny-contest-submission/98913 [V via subagent].
- mplsoccer's docs gallery is built on the data, which it describes as available "under a non-commercial license": https://mplsoccer.readthedocs.io/en/latest/mplsoccer.soccer.statsbomb.html [V via subagent].
- kloppy loads straight from raw.githubusercontent.com: https://kloppy.pysport.org/user-guide/loading-data/statsbomb/ [V via subagent].

**Read:**
- StatsBomb/Hudl treat the open data as marketing and recruiting. They have tolerated full raw redistribution for 4-8 years.
- The enforcement risk to a credited, free, non-raw comparator is very low in practice.
- That isn't permission. 8.3 says tolerance isn't waiver, and 2.1/6.1 let them pull access at will.
- The realistic worst case for Drew is a polite takedown request. A lawsuit is unlikely.

## 4. Ko-fi and "commercially exploit"

- 1.2.2 bars commercially exploiting "the data or any analysis derived from the use of the Service". "Commercially exploit" is undefined [V]. The blog posts paraphrase it as "non-commercial use" [V].
- The ordinary meaning of "commercially exploit": using the thing to make money in trade (selling it, selling access, selling ads against it, using it in a paid product). A Ko-fi link on a free, ad-free, open-source site sells nothing. Viewing the analysis doesn't depend on paying. Tips are gifts to the author.
- **CC BY-NC comparison:**
  - CC's NonCommercial test is "not primarily intended for or directed towards commercial advantage or monetary compensation" (https://wiki.creativecommons.org/wiki/NonCommercial_interpretation) [V via subagent].
  - CC's 2009 "Defining Noncommercial" study (https://creativecommons.org/2009/09/14/defining-noncommercial-report-published/) found uses that "earn users money or involve online advertising" were commonly read as commercial. Cost-recovery cases got mixed ratings [V via subagent for the quote; mixed-rating detail U].
  - CC itself doesn't rule on tip jars. Common practice, and at least one OER guidance sheet, treats optional donations that don't gate access as compatible with NC [U, paraphrased from a search summary].
- **Where StatsBomb's wording is worse than CC:**
  - 1.2.2 reaches "any analysis derived", not only the work itself.
  - Clause 7 bars "otherwise exploit for any purposes whatsoever any data" without consent. That covers the *data*, not the analysis, and doesn't need a commercial element.
- **Verdict:**
  - The tip link alone doesn't make (a) or (d) commercial exploitation on any reasonable reading.
  - It's the single fact a strict reader would cite, so name it in the permission email.
  - Optional mitigation: keep the Ko-fi link off the StatsBomb-credited chart itself (in the footer, as on the siblings). The NOTICE should say tips support the site and code, and nothing is charged for data or analysis. The mitigation is mostly cosmetic.

## 5. The repo-license question

**Drew's sibling repos:**
- `~/Projects/nfl-comparator` and `~/Projects/wnba-comparator` have **no LICENSE file** locally or on GitHub. GitHub reports `license: null` for both public repos [V].
- Both `package.json` files have `"private": true` and no `license` field [V].
- So the premise "likely MIT" is wrong. Today these repos grant nothing beyond what GitHub's ToS grants (view and fork within GitHub, D.5) [V].
- Default copyright means "all rights reserved", which is arguably *not* open source. If Drew means to call these sites open source, he should add a licence on purpose.

**How a repo licence could cause a problem:**
- An MIT LICENSE at the repo root, with no scope note, reads as covering every file in the repo. "Permission is hereby granted ... to deal in the Software without restriction, including ... to copy, modify, merge, publish, distribute, sublicense, and/or sell copies" [R; standard MIT text].
- A StatsBomb-derived ledger in `data/` would then be offered to the world under MIT. That is "license" and "distribute" in clause 7, and "sell" is in the grant.
- It would also mislead downstream users into thinking they're free to reuse it. The Kaggle CC0 mislabel is that failure in the wild.
- GitHub's D.6 "inbound=outbound" rule applies when *contributors* add content to a licensed repo [V]. It doesn't override a scoped notice.

**The fix:**
1. `LICENSE` (MIT), with a first-line scope note, e.g. "This license covers the source code in this repository (src/, scripts/, workers/, tests/). It does not cover files under data/ or the published site's data files; see data/NOTICE."
2. `data/NOTICE` (or `DATA-NOTICE.md`), for example:
   > Files in this directory derived from StatsBomb open data (marked `source: statsbomb`) are © StatsBomb Services Ltd / Hudl and are used under the StatsBomb Public Data User Agreement (https://github.com/hudl/open-data/blob/master/LICENSE.pdf). They are published here for viewing as part of this site's analysis. No licence to them is granted by this repository or its LICENSE; they are not sublicensed, and you may not reuse them except under StatsBomb's own terms. Get the data from StatsBomb directly. Data: StatsBomb [logo].
3. Repeat the scope line in the README and the site's Method section, with the StatsBomb logo next to every chart that uses it.
4. Set `"license": "MIT"` in package.json if the code is meant to be MIT. Keep `"private": true` (that's about npm publishing).

**Does it resolve each scenario?**
- **(a) Yes, close to fully.** Nothing StatsBomb-derived is in the repo. The site JSON carries the NOTICE in its Method section and the logo next to the chart. The only exposure left is the data-vs-analysis question from section 2, and the licence fix doesn't affect it.
- **(b) It only shrinks the problem.** It removes the *licence* limb of clause 7 and the misleading-downstream problem. It doesn't remove:
  1. "distribute / reproduce / in any way provide ... to any external or third party" (1.2.1), because the rows are still publicly readable;
  2. GitHub's D.5 fork grant, which applies to every public repo regardless of LICENSE and which no notice can withdraw [V].

  Options that fully fix (b):
  - written consent (the email below);
  - keep the ledger out of the public repo. Rebuild it in CI from StatsBomb raw files each time (the fetch is cheap and isn't the ESPN budget). Or cache it with `actions/cache` (caches aren't publicly downloadable) or in a private data repo pulled with a token [R on cache visibility; check before relying on it].
- **(c) No.** The issue is what's on the page, not what's in the repo.
- **(d) Not needed,** as long as no derived fixture is committed.

## 6. What StatsBomb actually adds to the comparator

From `data/competitions.json` (80 competition-seasons) and each season's matches file, fetched 2026-10-21 from hudl/open-data [V].

**Messi's club career:**
- La Liga 2004-05 → 2020-21, excluding the full 2015-16 season: Barcelona matches only, 7-38 per season.
- Per-season StatsBomb counts: 7, 17, 26, 27, 31, 35, 33, 37, 32, 31, 38, (2015-16 full league; Barça 38 of 380), 34, 36, 34, 33, 35 [V]. These track Messi's La Liga appearances season by season [R, from memory]. So the selection is Messi's appearances, not Barcelona's full schedule.
- Counting his 33 in 2015-16, that's 519 against the commonly cited 520 La Liga appearances. 2007-08 shows 27 where references give 28 [R]. So **one 2007-08 match looks missing**. Check it before using the set as a gate.
- Messi at PSG: Ligue 1 2021-22 (26) and 2022-23 (32) [V].
- Messi at Inter Miami: MLS 2023 (6) [V].

**Full league seasons:**
- 2015-16 Premier League (380), La Liga (380), Serie A (380), Ligue 1 (377).
- Bundesliga 2015-16 and 2023-24 are Leverkusen's 34 matches only [V].
- Arsenal 2003-04, all 38 Premier League matches [V].

**Other sets:**
- Champions League: the final only for 1970-71, 71-72, 72-73, 1999-2000, 2003-04, 04-05, 06-07, then 2008-09 → 2018-19 (missing 2000-03, 2005-06, 2007-08) [V]. The prior note's "one final per season 1999-2019" is slightly wrong.
- **World Cups: early tournaments are showcase fragments.**
  - 1958: 2 matches (Brazil)
  - 1962: 1 (Brazil v Mexico)
  - 1970: 6 (Brazil)
  - 1974: 6 (5 involve the Netherlands)
  - 1986: 3 (Argentina)
  - 1990: 1 (Brazil v Argentina)
  - full: 2018 (64) and 2022 (64)
  - none for 1966, 1978, 1982, 1994-2014 [V]
- Maradona fragments [V]:
  - Copa del Rey finals 1982-83 and 1983-84 (1 each)
  - Serie A 1986-87 (1, Juventus v Napoli)
  - UEFA Cup 1988-89 (3, Napoli)
  - Liga Profesional 1981 and 1997-98 (1 Superclásico each)
  - U-20 World Cup 1979 final (1)
- Pelé: NASL 1977 (1 match, Cosmos) [V].
- Euros 2020 (51) and 2024 (51), Copa América 2024 (32), AFCON 2023 (52), Indian Super League 2021-22 (115) [V].
- Women's:
  - WSL 2018-19, 2019-20, 2020-21, 2023-24 (87-132 each)
  - NWSL 2018 (36, partial) and 2023 (137)
  - Liga F, Frauen-Bundesliga and Serie A Women 2023-24 (130-240 each)
  - Women's World Cup 2019 and 2023
  - Women's Euro 2022 and 2025 [V]

**What only StatsBomb has, for this comparator:**
1. **Pelé / Maradona / Cruyff rows.** StatsBomb has them, but only 1-6 matches per tournament, chosen as highlights. That isn't a career and won't drive an "after N appearances" curve. It's no use for the comparator as designed.
2. **Messi's complete La Liga match set with minutes from lineup sub times.** ESPN reaches back to 2002-03 [per data-sources.md], so ESPN already covers Messi's whole La Liga career. StatsBomb's value is as an **independent second source**: a known-answer gate for ESPN-derived minutes, goals and starts. That is scenario (d), which is allowed.
3. **Event-level detail** (xG, shot locations, assists as StatsBomb defines them, 360 freeze frames). Nobody else publishes it for free, but the comparator doesn't plot it in v1.
4. **Women's league seasons 2018-2024.** Possibly useful for a women's comparator later. They're whole seasons, not careers.

**Is any of it needed for v1?** Only (d). So for v1: use StatsBomb as a test gate, publish nothing from it, and don't put the logo on the site. The logo is only required for "publication of analysis formed from StatsBomb Data", and nothing would be published. If Drew later wants StatsBomb-only content (2015-16 xG overlays, Messi minutes as a displayed series), do it as (a), or get consent for (b).

## 7. Draft email

To: the contact on the open-data repo or Hudl StatsBomb support. There's no dedicated open-data address. Issue #80 suggests nobody watches the repo issues, so email is better than an issue [U on the right address].

> Subject: Permission question: StatsBomb open data in a free football comparator
>
> Hi,
>
> I build free sports data sites at drewhoover.com. They're static sites on GitHub Pages, the source is public on GitHub, there are no ads and no paywall. There's a Ko-fi tip link in the footer. Nothing on the site is gated behind it.
>
> I'm building a football career comparator. It lets you pick two players and compare their goals, assists and minutes through their first N appearances in a competition (Messi's first 300 La Liga games vs Haaland's, for example). My main source is other public data. I'd like to use your open data for Messi's La Liga seasons and the 2015-16 big-five leagues.
>
> What I'd publish:
> 1. Charts of cumulative goals, assists and minutes by appearance number, credited "Data: StatsBomb" with your logo.
> 2. A per-player-per-match table in the public repo, one row per player per match: date, competition, opponent, started, minutes, goals, assists. It's derived from your lineups and events, and it's there so the site can rebuild without refetching. No event-level data, xG or 360 data, and none of your raw JSON.
>
> The repo's code license (MIT) would explicitly exclude that table. A separate data notice would say the rows come from StatsBomb under your user agreement, are published for viewing only, are not sublicensed, and anyone who wants the data should get it from you.
>
> My reading of the agreement is that (1) is fine and (2) needs your written consent under sections 1.2.1 and 7. Is (2) OK with you on those terms? A yes or no is all I need. If it's no, I'll keep the table out of the repo and only publish the charts.
>
> Thanks,
> Drew Hoover
> drewhoover.com

## Not verified / open

- The Court of Appeal's reasoning in Football Dataco v Sportradar comes from press summaries. The judgment wasn't read.
- Whether ProCD and Arnold v Britton are still the controlling authorities is from memory [R].
- Messi's 2007-08 La Liga appearance count (28) is from memory. The StatsBomb set has 27 [V], so the gap needs checking against a second source.
- Whether a GitHub Actions cache is readable by the public on a public repo [R: caches are scoped to the repo's workflows and aren't publicly downloadable; confirm in GitHub docs before relying on it].
- The right contact address at Hudl for open-data permissions [U].
- Whether the Messi repos and the Pitt Messi goal chart carry the StatsBomb credit [U].
