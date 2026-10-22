# Before the repo, before the deploy, before the share

Written 2026-10-22. Three gates, in order. The repo can be created once gate A is done; the site can be deployed privately once B is; the share goes out once C is.

## A. Before `git init`

Data:
1. ESPN club harvest finishes (~2026-10-22 17:40Z). Then, offline: `node pipeline/backfill-espn-manifest.mjs`, `node pipeline/build-ledger.mjs && node pipeline/build-ledger.mjs --gate` at full scope. All 18 club-season and UCL gates must pass at full scope; the probe-era numbers are the floor.
2. The ESPN fill jobs, in the documented order (pipeline/docs/fill.md): `intl-slugs` (0.3 h), `athlete-fills --no-qualifiers` (1.8 h), `dob --strategy roster` (0.5 h if the roster shortcut passes its check, 3.7 h if not). Rebuild both ledgers. Messi's debut-minutes gate resolves here, and the collapsed Serie A rosters get their rows.
3. A season-level cross-check of the ESPN ledger against transfermarkt-datasets for 2012-13 and 2013-14 (apps and goals per player-season, every player). That's the only independent club-side gate at scale, and it hasn't been run. The CC0 file is already on disk from the probe.
4. The id-merge table reviewed (`--merge-review`), at least for the ~400 players the factoid gates touch.

Repo shape, decided before the first commit because history can't be un-written:
5. What is public and what is private. Public: code, the compact committed ledger (the `COLS` encoding the siblings use; WNBA's is 8 MB), gates, corrections, AGENTS.md, pipeline docs, the derived indexes small enough to read. Private (a private GitHub repo, or an R2 bucket for the big caches): `data/raw/` (ESPN ~12 GB, Wayback 0.2 GB, RSSSF 57 MB, Wikidata 237 MB), the StatsBomb Messi fixture, the long `.jsonl` ledgers (rsssf-caps alone is 198 MB). `.gitignore` for `data/raw/` and the large indexes goes in before the first `git add`, and the add uses an explicit file list.
6. The compact-encoding step doesn't exist yet: long `player-matches.jsonl` to the `COLS` layout per competition, with the international rows alongside. It's the last pipeline stage and it decides the public repo's size.
7. Name. Recommendation stands: `football-comparator` (repo name = package.json name = slug). "FIFA" reads as the video game.
8. LICENSE. The siblings have none. Proposal from the StatsBomb analysis: a code-only MIT `LICENSE` plus `data/NOTICE` saying the derived data is published for viewing under its sources' terms and isn't sublicensed. Decide once; it's awkward to add later.
9. RSSSF: no permission ask. Its footer is a standing grant (copy in whole or part with acknowledgement), and derived numbers with a link per row is less than copying. Credit RSSSF in the Method and footer, link every international row to its source page, name the page's author where one is named. The drafted email in research/emails/ becomes an optional post-launch courtesy note, not a gate (Drew, 2026-10-22).

## B. Before a private deploy (show before ship)

10. Scaffold with the dataviz-pages-site skill (`gh repo create … --template DrewHoo/dataviz-project-template`), then the canon chrome from Streak King and the comparator engine from the newest sibling after its open PRs merge (or extract comparator-core; the skill flags that the WNBA clone drifted from the NFL fixes the same day). Launch port: next free after 5176.
11. Football-specific engine changes, from the research: a competition/scope slot in the sentence (one league by default, UCL proper, opt-in club+country career view); appearances and age as the clocks, starts secondary; a team entity from day one (futility factoids are all team-level); era floors per competition carried in the words (assists 2005-08 by league); the league-and-tier colour on the curve; the clean-game played floor (minutes ≥ 1 is an appearance; a threshold test needs a minutes floor).
12. Stats catalogue and thresholds for football (goals, assists, goal involvements, minutes, starts, cards, penalties, clean sheets for keepers if the ledger carries GA), and the per-game 0/1 stats (scored, assisted, brace, hat-trick).
13. Gates wired: `data/gates/*.json` into `query.test.ts` and `scripts/gate.mjs`, one engine evaluating each query at N.
14. Words: the sentence module, the share text, the Method section with every publisher-definition difference in data/gates/README.md (14 of them) and the credit lines (ESPN compiled by us; RSSSF with acknowledgement; martj42 CC0; Wikidata CC0; FIFA/UEFA archived reports via the Internet Archive as receipts; transfermarkt-datasets CC0 as a cross-check only).
15. Design takes: several, as static HTML, desktop and 375px, reviewed on the phone. The dense/quiet direction from the craft skill.
16. Entity views: player page, team page, competition board; URL state one param a slot plus the scope; prerender with `.sr-only` words; `document.title` updates.
17. Cards (`og.png`, `card.png`, per-entity at build) and the share worker copied from WNBA (`BASE`, `SITE`, `RAW_LEDGER`, route, `CARD_VERSION`, `NO_REPORT`), deployed once by hand; Drew sets `CLOUDFLARE_API_TOKEN`.
18. Refresh: the running season through `--refresh-season` in the runner on a weekly cron (the ledger is committed, so a code change never waits on a download), nothing committed back; the private store is read-only to CI except the current-season patch.
19. AGENTS.md and CLAUDE.md in the repo: AGENTS.md exists; CLAUDE.md gets the product rules (scope default, era floors, the appearance definition, the no-StatsBomb-in-public rule).

## C. Before the public share

20. RSSSF credited as in A9, with the per-row links live.
21. Mixpanel delivering (the index site's embed), Drew's devices excluded; the share-worker live checks and platform validators; sample OG renders for every view, from prod, not the dev server.
22. Sitemap, IndexNow, the index-site card PR (`section: sports`, a real row in the blurb), sibling links added on the other five sites.
23. Known-answer spot checks against the live site for the marquee claims (Haaland 100 in 111; Ronaldo 140/141 UCL; Messi 474 La Liga; Derby 11 points) and the era-wall sentence visible on each.
24. Timing: a marquee match (a Champions League night or a big Premier League fixture), with the project page as the thing shared.

## Open decisions for Drew

- Private data repo vs R2 bucket for the raw caches (A5).
- Code-only MIT plus data NOTICE, or no LICENSE like the siblings (A8).
- Does the club+country career view ship in v1 now that the data supports it for 50 of 52 marquee players, or does v1 stay PL + UCL with the career view behind a flag?
- The name (A7).
