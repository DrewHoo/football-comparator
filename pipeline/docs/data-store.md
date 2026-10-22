# The private data store

The raw caches and the long-form ledgers live in a private GitHub repo, `DrewHoo/football-comparator-data`, cloned next to this project at `../football-comparator-data`. The public repo never holds them. `pipeline/sync-data.mjs` moves data between the two. It uses Node built-ins only, and the only network call it makes is `git push` under `--commit`.

```
node pipeline/sync-data.mjs status                         # packed vs local, ESPN pending, git state
node pipeline/sync-data.mjs pack [--only g,..] [--dry-run] [--commit] [--partial] [--force]
node pipeline/sync-data.mjs unpack [--only g,..] [--unit id,..] [--to DIR] [--force]
```

The groups are `espn wayback rsssf wikidata martj42 index ledger`. `ledger` also carries `data/corrections/` and `data/gates/`. Gates are small and will also be committed to the public repo; the copy here keeps the store self-contained. `FC_DATA_REPO` points the script at another clone, `FC_DATA` at another data dir.

## Layout

| Data repo path | From | Unit |
|---|---|---|
| `raw/espn/<slug>/<season>.jsonl.gz` | `data/raw/espn/` summaries | league-season, e.g. `eng.1/2004-05` |
| `raw/espn/<slug>/scoreboards.jsonl.gz` | year and month scoreboards | one per slug |
| `raw/wayback/<family>.jsonl.gz` | `data/raw/wayback/` | `fifa1998 fifa2002 fifa2006 fifa2010 euro2000 euro2004q probe` |
| `raw/rsssf/rsssf.jsonl.gz` | `data/raw/rsssf/` | one |
| `raw/wikidata/{sparql,entity}.jsonl.gz` | `data/raw/wikidata/` | one per kind |
| `raw/martj42/<name>-<date>.csv` | `data/raw/martj42/` | as-is, not gzipped |
| `index/<file>.gz`, `ledger/<file>.gz`, ... | a top-level derived file | gzipped byte for byte |
| `index/<dir>.jsonl.gz`, `ledger/fills.jsonl.gz`, ... | a derived subdirectory | bundled, one record per file |
| `MANIFEST.json` | | every unit's files, bytes, sha256, record count, span, content hash |

A derived subdirectory with a file over 50 MB (`ledger/intl/`) is packed file by file instead of bundled.

A raw record is one line: `{sha1, url, status, bytes, fetchedAt, bodySha1, body, enc?, meta?, key?}`.
- `sha1` is the cache file name. Every host keys by the sha1 of the request, not of the body: the exact URL for ESPN and Wayback, `canon(url)` for RSSSF, the query text or QID for Wikidata.
- `body` is the response as a string. It's base64 with `enc: "base64"` when the bytes aren't valid UTF-8 (some Wayback pages), so every body comes back byte-identical. `bodySha1` is the sha1 of those bytes.
- `meta` is whatever makes the entry findable. For Wayback and RSSSF it's the `.json` sidecar text verbatim. For ESPN it's the entry's `manifest.jsonl` lines. Wikidata has no sidecars: a SPARQL file embeds its query, an entity file names its QID, and `key` carries that.
- ESPN entries the manifest doesn't have yet (the harvester started with the old module loaded) get their URL from the index, are proved by sha1(url) = file name, and carry `urlFrom: "index"` and `fetchedAtFrom: "mtime"`. Running `backfill-espn-manifest.mjs` after the harvest and repacking replaces those with real manifest lines.

A bundle record is `{path, bytes, sha256, body, enc?}`.

Wayback family: the archive index (`data/index/archive/<family>.json`) cites the capture it parsed, so citation decides first. A URL pattern decides the rest (`edition=1013`, `edition=4395`, `germany2006`, `southafrica2010`, `season=2000`, `Round=1579|1580` for the Euro 2004 groups and play-offs). Everything else is `probe` (CDX discovery, 11v11, BBC, Soccernet, the Euro 2008 Villa pages).

## The 90 MB rule

No file in the data repo reaches 90 MB. GitHub rejects files over 100 MB and warns from 50 MB, and LFS would add a second store and bandwidth quotas for no gain. The packer starts a new part once a part passes 80 MB compressed (`<id>.part00.jsonl.gz`, `.part01`, ...), always on a record or line boundary, so every part is a valid gzip on its own and the parts concatenate to the original. It refuses to finish a unit with a part at 90 MB or over. Nothing needs splitting today. The largest file is `ledger/intl/player-matches.jsonl.gz` at 27 MB (468 MB raw), and a full ESPN league-season is 4-8 MB. Splitting was tested with `FC_PART_TARGET=2000000` (rsssf-caps came out as 8 parts and unpacked byte-identical).

`--commit` pushes in batches under 1 GB, since GitHub refuses a push over 2 GB. The full ESPN harvest is about 157 league-season units at roughly 6 MB, so about 1 GB for ESPN when it's done.

## Pack is idempotent

A unit whose inputs (relative names, sizes, mtimes, plus ESPN's manifest lines) match the `fingerprint` in MANIFEST is skipped without reading. When the inputs changed, the unit is rebuilt, and its files are replaced only if the sha256 of the uncompressed content changed. So a `touch` costs a rebuild but no commit. `--force` ignores fingerprints. gzip runs at level 9 with a zero header mtime, so the same content gives the same bytes on the same zlib.

An ESPN league-season gets packed once every event the index lists for it is marked `fetched` and its summary is on disk. Excluded events (the EPL 2009-10 re-ingest, the Serie A playoff) come along when their summaries were fetched. Incomplete seasons are listed in `MANIFEST.json` under `pending.espn` and in `status`. As of 2026-10-22 03:40Z that's 42 league-seasons (2002-03 to 2008-09 for all six slugs) plus the 7 scoreboard units packed, and 115 pending. Rerun `pack --only espn --commit` after the harvest and the backfill.

`--commit` stages by explicit path: the MANIFEST files git reports as new or modified, plus `git rm --cached` for tracked data files MANIFEST no longer lists. Never `git add -A`. Set `FC_COMMIT_TRAILER` to append a trailer line to the commit message.

## Unpack verifies everything

`unpack` checks each packed file's sha256 against MANIFEST, each body's sha1 against `bodySha1`, each cache file name against the sha1 of its key, and each derived file against its sha256. It writes files atomically. An existing file with different content counts as a conflict and is left alone unless `--force`. ESPN manifest lines the target doesn't have get appended. Existing lines are never rewritten. Any failure exits 2.

Round trip, 2026-10-22: `raw/wayback/euro2000` and `raw/rsssf/rsssf` unpacked into a scratch dir gave 10,382 files (5,185 bodies, 5,197 sidecars), all byte-identical to `data/raw`. `raw/espn/eng.1/2002-03` plus `uefa.champions/scoreboards` gave 405 bodies, identical, and 405 manifest lines that are a verbatim subset of the live manifest.

## CI at build time

The site build needs the derived ledgers, not the raw caches. So CI fetches the `index/` and `ledger/` units it reads, or `raw/` units when a build step re-derives from source.

Read access, either of:
1) a deploy key: an SSH key pair whose public half is added to the data repo as a read-only deploy key and whose private half is a secret in the public repo (`DATA_REPO_KEY`). It's scoped to the one repo by construction.
2) a fine-grained PAT owned by DrewHoo, repository access limited to `football-comparator-data`, permission `Contents: read`, with an expiry, stored as `DATA_REPO_TOKEN`.

The deploy key is preferable because it doesn't expire and can't reach any other repo. Fetch sparsely so a build doesn't download 1 GB of ESPN:

```yaml
- uses: actions/checkout@v4
  with:
    repository: DrewHoo/football-comparator-data
    ssh-key: ${{ secrets.DATA_REPO_KEY }}   # or token: ${{ secrets.DATA_REPO_TOKEN }}
    path: football-comparator-data
    sparse-checkout: |
      MANIFEST.json
      index
      ledger
      corrections
- run: FC_DATA_REPO=football-comparator-data node pipeline/sync-data.mjs unpack --only index,ledger
```

Unpacked data stays in the runner. It's never committed to the public repo or uploaded as a public artifact. Only the compact per-page JSON the build emits is published.

## Running-season refresh

The scheduled refresh (the current season's year scoreboard is refetched with `nocache`, new summaries are fetched, the ledgers are rebuilt) writes back only the units it changed:

```
node pipeline/sync-data.mjs pack --only espn --unit raw/espn/eng.1/2026-27,raw/espn/eng.1/scoreboards --partial --commit
node pipeline/sync-data.mjs pack --only index,ledger --commit
```

`--partial` lets an unfinished league-season be packed. It's flagged `info.complete: false` in MANIFEST. Past seasons' inputs don't change, so their fingerprints match and they're skipped without being read. The refresh job needs write access, a second deploy key with write, used only by that workflow. It's the one writer besides Drew's machine. Concurrent writers would race on `MANIFEST.json`, so the workflow should use a `concurrency:` group.

## Not packed yet

- ESPN league-seasons still harvesting (above), and ESPN cache files that are neither a summary of an indexed event nor a year/month scoreboard: probe-era core API, athlete eventlogs, day scoreboards, about 1,500 files today. They need a unit (`raw/espn/other`) once the backfill has given them URLs.
- `data/raw/wikipedia/` (two article JSONs) and `data/raw/logs/` (request logs, which the incident note says get checked). Neither is in a group. Both are small and should probably go in.
- The StatsBomb Messi fixture, once it's fetched. It goes in `raw/statsbomb/` and stays research-only.

## R2 mirror (added 2026-10-22)

The packed store is mirrored to the private R2 bucket `football-comparator-data` on Drew's Cloudflare account (`fd9fcbf0…`), created with `npx wrangler r2 bucket create football-comparator-data`. R2 holds the same files under the same relative keys as the git clone, plus `MANIFEST.json`, so a pull reproduces the clone's packed layout without git.

- `node pipeline/r2-sync.mjs push [--only groups]`: uploads every manifest file whose sha256 the bucket doesn't have, downloads each one back and compares sha256 before recording it in `.r2-state.json` in the clone (gitignored there), then uploads `MANIFEST.json`.
- `node pipeline/r2-sync.mjs pull --to DIR`: fetches the manifest and every file, verifying sha256; then `FC_DATA_REPO=DIR node pipeline/sync-data.mjs unpack` rebuilds `data/`.
- `status` compares the state file to the manifest; `verify --sample N` re-downloads N random objects.
- Transport is `wrangler r2 object put|get --remote` through the wrangler OAuth login, so no S3 keys live on this machine. CI will use a read-only R2 API token scoped to the bucket (Access Key ID + Secret as GitHub secrets, plus the account id) with the S3 endpoint `https://<account>.r2.cloudflarestorage.com`; that path isn't written yet because CI only needs the compact ledger, which the public repo commits.
- Cost: about 1.4 GB today, under the 10 GB free tier; no egress charges. Each season adds about 50 MB packed.
- The git clone remains the source of truth and the manifest's home. If the clone grows past comfort, the `raw/espn/*` units can be dropped from git and kept in R2 only; `pull` then restores them.
