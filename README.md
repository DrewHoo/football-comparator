# Football Comparator

Career-point comparisons for football: who stacks up at the same point in a career, by competition. "Haaland's Premier League goals through his first 111 appearances", "fastest to 50 Champions League goals", "Derby's 11 points". The football sibling of the NFL, WNBA and NBA Comparators on drewhoover.com.

## Status

The data pipeline is built and the club harvest is finishing. The site isn't built yet; the build spec is in [specs/football-comparator.spec.md](specs/football-comparator.spec.md) and waits on review.

## What's here

- `research/`: how football counts a career, the source survey, the coverage probes and the decisions they led to. Start with [research/README.md](research/README.md), then [beachhead.md](research/beachhead.md) and [internationals.md](research/internationals.md).
- `pipeline/`: harvesters, parsers, the club and international ledger builders, the compact encoder, gates and the private-store sync. Each stage is documented in `pipeline/docs/`.
- `data/gates/`: known-answer gates from published factoids, each with its publisher and definition.
- `data/corrections/`: corrections over the sources, each with a receipt.
- [AGENTS.md](AGENTS.md): the running list of data surprises.

## Data

Raw responses and the long-form ledgers live in a private store and aren't in this repo. The pipeline rebuilds everything here from that store.

Sources:

- Club matches: ESPN's public soccer API, compiled by us. Big five leagues and the Champions League from 2002-03.
- International caps and goals: RSSSF (rsssf.org), used with acknowledgement; every international row links to its RSSSF page.
- International results and goalscorers: martj42/international_results, CC0.
- Lineups: Wikidata, CC0.
- World Cup and Euro qualifier match reports, 1998-2010: FIFA.com and UEFA.com pages as archived by the Internet Archive, used as receipts.
- Cross-check only: dcaribou/transfermarkt-datasets, CC0.
