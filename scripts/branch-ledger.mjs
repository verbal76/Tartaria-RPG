#!/usr/bin/env node
// ⚠⚠ SINGLE SOURCE OF TRUTH — THE BRANCH / RECOVERY LEDGER, KEPT HONEST.
//
// docs/branch-ledger.json is the machine-readable record of every branch the
// recovery audit examined: its tip, whether its work is on the trunk, and what
// was decided. docs/BRANCH-LEDGER.md is rendered from it. This script:
//
//   (default)   validates the JSON (schema, vocabulary, full SHAs, one entry per
//               branch, exactly one authoritative entry, recovery targets that
//               exist) and proves the rendered MD is in sync with it.
//   --render    rewrites docs/BRANCH-LEDGER.md from the JSON.
//   --live      ALSO compares against `git branch -r` when a clone with remotes
//               is available: lists branches that have no ledger entry and
//               ledgered branches whose tip moved. Informational — a new topic
//               branch must never break the trunk's CI — unless --strict.
//
// It reads local files only: zero Actions cost beyond the gates job it joins.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argvAll = process.argv.slice(2);
const opt = (n, d) => { const i = argvAll.indexOf(`--${n}`); return i >= 0 ? argvAll[i + 1] : d; };
// --file / --md exist so the regression tests can feed deliberately broken ledgers.
const JSON_PATH = opt('file', join(ROOT, 'docs/branch-ledger.json'));
const MD_PATH = opt('md', join(ROOT, 'docs/BRANCH-LEDGER.md'));

export function validate(doc, { fileExists = (p) => existsSync(join(ROOT, p)) } = {}) {
  const errors = [];
  const cls = doc.classifications || {};
  if (doc.schema !== 1) errors.push(`schema must be 1, got ${doc.schema}`);
  if (!doc.authoritative || doc.authoritative.branch !== 'golem-line') errors.push('authoritative.branch must be "golem-line"');
  if (!/^[0-9a-f]{40}$/.test(doc.authoritative?.auditedAtSha || '')) errors.push('authoritative.auditedAtSha must be a full SHA');
  const seen = new Set();
  let authoritative = 0;
  for (const e of doc.branches || []) {
    const id = e.branch || '(unnamed)';
    if (seen.has(id)) errors.push(`${id}: duplicate entry`);
    seen.add(id);
    for (const k of ['role', 'classification', 'description', 'evidence', 'disposition']) {
      if (typeof e[k] !== 'string' || !e[k].trim()) errors.push(`${id}: missing ${k}`);
    }
    if (!/^[0-9a-f]{40}$/.test(e.tipSha || '')) errors.push(`${id}: tipSha must be a full 40-hex SHA`);
    if (!(e.classification in cls)) errors.push(`${id}: classification "${e.classification}" is not in the vocabulary`);
    if (typeof e.ownerReview !== 'boolean') errors.push(`${id}: ownerReview must be boolean`);
    if (e.role === 'authoritative') authoritative++;
    if (e.classification === 'unknown_owner_review' && e.ownerReview !== true) errors.push(`${id}: unknown_owner_review requires ownerReview: true`);
    if (e.recovery) {
      if (e.recovery.status === 'recovered' && !fileExists(e.recovery.into)) errors.push(`${id}: recovered into "${e.recovery.into}" which does not exist`);
    }
  }
  if (authoritative !== 1) errors.push(`exactly one entry must have role "authoritative" (found ${authoritative})`);
  if (!seen.has('golem-line')) errors.push('golem-line has no entry');
  return errors;
}

export function render(doc) {
  const out = [];
  out.push('# Branch & recovery ledger');
  out.push('');
  out.push('> GENERATED from `docs/branch-ledger.json` by `node scripts/branch-ledger.mjs --render`. Edit the JSON, never this file;');
  out.push('> `npm run check:branchledger` fails if they disagree. Policy: `docs/SOURCE-OF-TRUTH.md`.');
  out.push('');
  out.push(`Authoritative source: **\`${doc.authoritative.branch}\`**, audited at \`${doc.authoritative.auditedAtSha}\` on ${doc.auditedOn}.`);
  out.push('');
  out.push('## Classification vocabulary');
  out.push('');
  for (const [k, v] of Object.entries(doc.classifications)) out.push(`- \`${k}\` — ${v}`);
  out.push('');
  const counts = {};
  for (const e of doc.branches) counts[e.classification] = (counts[e.classification] || 0) + 1;
  out.push('## Summary');
  out.push('');
  out.push('| classification | branches |');
  out.push('|---|---:|');
  for (const k of Object.keys(doc.classifications)) if (counts[k]) out.push(`| \`${k}\` | ${counts[k]} |`);
  out.push(`| **total** | **${doc.branches.length}** |`);
  out.push('');
  out.push('## Ledger');
  out.push('');
  out.push('| branch | tip SHA | tip date | ahead/behind trunk | classification | owner review | disposition |');
  out.push('|---|---|---|---|---|:---:|---|');
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  for (const e of doc.branches) {
    out.push(`| \`${e.branch}\` | \`${e.tipSha.slice(0, 12)}\` | ${e.tipDate} | +${e.aheadOfTrunk} / −${e.behindTrunk} | \`${e.classification}\` | ${e.ownerReview ? 'yes' : ''} | ${cell(e.disposition)} |`);
  }
  out.push('');
  out.push('## Entries');
  for (const e of doc.branches) {
    out.push('');
    out.push(`### \`${e.branch}\``);
    out.push('');
    out.push(`- **Tip:** \`${e.tipSha}\` — ${e.tipSubject}`);
    out.push(`- **Role:** ${e.role} · **Classification:** \`${e.classification}\``);
    out.push(`- **What it is:** ${e.description}`);
    out.push(`- **Evidence:** ${e.evidence}`);
    out.push(`- **Disposition:** ${e.disposition}`);
    if (e.recovery) out.push(`- **Recovery:** ${e.recovery.status} → \`${e.recovery.into}\` (commits ${e.recovery.commits.map((c) => `\`${c}\``).join(', ')})`);
  }
  out.push('');
  return out.join('\n');
}

function live(doc, strict) {
  let remotes;
  try {
    remotes = execFileSync('git', ['branch', '-r', '--format=%(refname:short) %(objectname)'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').filter(Boolean).map((l) => l.split(' ')).filter(([n]) => n !== 'origin' && !n.endsWith('/HEAD'));
  } catch { remotes = []; }
  if (remotes.length === 0) { console.log('branch-ledger: --live skipped (no remote-tracking branches in this clone)'); return 0; }
  const known = new Map(doc.branches.map((e) => [e.branch, e]));
  const unledgered = [], moved = [];
  for (const [name, sha] of remotes) {
    const b = name.replace(/^origin\//, '');
    const e = known.get(b);
    if (!e) unledgered.push(b); else if (e.tipSha !== sha) moved.push(`${b} (${e.tipSha.slice(0, 9)} → ${sha.slice(0, 9)})`);
  }
  for (const b of unledgered) console.log(`branch-ledger: ${strict ? '✗' : '·'} no ledger entry: ${b}`);
  for (const b of moved) console.log(`branch-ledger: · tip moved since audit: ${b}`);
  return strict && unledgered.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const doc = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
  const errors = validate(doc);
  if (errors.length) { for (const e of errors) console.error(`branch-ledger: ✗ ${e}`); process.exit(1); }
  const md = render(doc);
  if (args.includes('--render')) { writeFileSync(MD_PATH, md); console.log(`branch-ledger: wrote ${MD_PATH}`); process.exit(0); }
  if (!existsSync(MD_PATH) || readFileSync(MD_PATH, 'utf8') !== md) {
    console.error('branch-ledger: ✗ docs/BRANCH-LEDGER.md is out of sync with docs/branch-ledger.json — run: node scripts/branch-ledger.mjs --render');
    process.exit(1);
  }
  let code = 0;
  if (args.includes('--live')) code = live(doc, args.includes('--strict'));
  console.log(`branch-ledger: ${doc.branches.length} branches ledgered, schema valid, rendered view in sync.`);
  process.exit(code);
}
