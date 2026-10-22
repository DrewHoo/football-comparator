#!/usr/bin/env node
// The team ledger: team-match rows, team-season tables (points, positions, clinch moments) and runs,
// from data/ledger/matches.jsonl plus data/corrections/teams.json. Never fetches. The index scores
// every match whether or not its summary is cached, so this is full-scope today.
//
//   node pipeline/build-teams.mjs          # write data/ledger/teams/*, then the team gates
//   node pipeline/build-teams.mjs --gate   # gates only, nothing written; exit 1 on a FAIL
//
// See pipeline/docs/compact.md §Teams.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTeamLedger, teamCorrections } from './lib/ledger/team.mjs'
import { runTeamGates } from './lib/ledger/team-gates.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'data/ledger/teams')
const gateOnly = process.argv.includes('--gate')

export const readJsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const corrFile = path.join(ROOT, 'data/corrections/teams.json')
const corrections = teamCorrections(fs.existsSync(corrFile) ? JSON.parse(fs.readFileSync(corrFile, 'utf8')) : null)

const t0 = Date.now()
const matches = readJsonl(path.join(ROOT, 'data/ledger/matches.jsonl'))
const led = buildTeamLedger(matches, { corrections })
const t1 = Date.now()
console.log(`teams: ${matches.length} matches -> ${led.rows.length} team-match rows, ${led.seasons.length} team-seasons, ${led.runs.length} runs (${t1 - t0} ms); ${corrections.deductions.length} deductions, ${corrections.results.length} result corrections`)

if (!gateOnly) {
  fs.mkdirSync(OUT, { recursive: true })
  const write = (name, rows) => { const f = path.join(OUT, name), tmp = f + '.tmp'; fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); fs.renameSync(tmp, f) }
  write('team-matches.jsonl', led.rows)
  write('team-seasons.jsonl', led.seasons)
  write('runs.jsonl', led.runs.filter((r) => r.len >= 3))
}

const gates = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/gates/team-factoids.json'), 'utf8')).gates
const res = runTeamGates(gates, matches, { corrections })
printTeamGates(res)
if (!gateOnly) fs.writeFileSync(path.join(OUT, 'gates.json'), JSON.stringify({ builtAt: new Date().toISOString(), source: 'data/ledger/matches.jsonl', results: res }, null, 1) + '\n')
if (gateOnly && res.some((r) => r.status === 'FAIL' || r.status === 'ERROR')) process.exit(1)

export function printTeamGates(res) {
  const n = (s) => res.filter((r) => r.status === s).length
  for (const r of res) {
    const head = `${r.status.padEnd(6)} ${r.gate} · ${r.role} · ${r.subject ?? ''} ${r.season ?? ''} ${r.kind}`
    if (r.status === 'SKIP') console.log(`${head} (${r.why})`)
    else console.log(`${head}: ledger ${JSON.stringify(r.got)}${r.rank != null ? ` rank ${r.rank}` : ''} | expected ${JSON.stringify(r.expected)}${r.diffs?.length ? ` | ${r.diffs.join('; ')}` : ''}${r.why ? ` | ${r.why}` : ''}`)
  }
  console.log(`team gates: ${n('PASS')} pass, ${n('FAIL')} fail, ${n('ERROR')} error, ${n('RECORD')} recorded, ${n('SKIP')} skipped (not checkable in full)`)
}
