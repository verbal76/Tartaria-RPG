#!/usr/bin/env node
/**
 * ⚠⚠⚠ THE RECEIPT MUST NAME EVERY GATE, AND ONLY THE GATES.
 *
 * .github/required-jobs.json is the list of CI jobs the publisher demands are
 * green before it touches a channel (scripts/verify-ci-receipt.cjs). ci.yml's
 * `publish.needs` is the list of jobs the automatic path actually waits for.
 * These are two spellings of ONE contract, and a contract with two spellings
 * drifts: add a required job to ci.yml and forget the manifest, and the
 * publisher happily publishes without it; add one to the manifest and not to
 * ci.yml, and every publish is refused for a job that never runs. Either way the
 * receipt stops meaning what it says.
 *
 * This gate holds the invariant at authoring time:
 *
 *   THE SET OF JOBS THAT MUST SUCCEED BEFORE AUTOMATIC PUBLICATION
 *   ==
 *   THE SET OF JOBS THE RECEIPT REQUIRES.
 *
 * It reads ci.yml STRUCTURALLY (js-yaml, the parser the repo's own CI-wiring
 * suite already uses) — not by grepping — so a reformatted workflow cannot fool
 * it and a renamed job cannot slip past it. It also refuses, in both places, any
 * job marked continue-on-error: a job that cannot fail the run cannot be a gate,
 * and the deferred heavy simulations must never become one by accident.
 *
 * ⚠ js-yaml is a transitive dependency here, not a declared one. If it ever
 * disappears this gate fails LOUDLY (import error), not silently — which is the
 * right direction for a gate.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { load } = require('js-yaml');

const fail = [];

const manifestPath = join(root, '.github', 'required-jobs.json');
const ciPath = join(root, '.github', 'workflows', 'ci.yml');
const pubPath = join(root, '.github', 'workflows', 'eas-update-golem.yml');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const ci = load(readFileSync(ciPath, 'utf8'));
const pubSrc = readFileSync(pubPath, 'utf8');

// ── 1. the manifest is well-formed ────────────────────────────────────────
const required = Array.isArray(manifest?.required) ? manifest.required : null;
if (!required || required.length === 0) fail.push('required-jobs.json has no non-empty `required` list');
if (manifest?.workflow !== '.github/workflows/ci.yml') fail.push(`required-jobs.json names workflow "${manifest?.workflow}", expected .github/workflows/ci.yml`);
if (required) {
  const seen = new Set();
  for (const n of required) {
    if (typeof n !== 'string' || !n.trim()) fail.push(`required-jobs.json has a blank or non-string entry: ${JSON.stringify(n)}`);
    if (seen.has(n)) fail.push(`required-jobs.json lists "${n}" twice`);
    seen.add(n);
  }
}

// ── 2. what ci.yml actually waits for, by DISPLAY NAME ────────────────────
const jobs = ci?.jobs ?? {};
const publish = jobs.publish;
if (!publish) fail.push('ci.yml has no `publish` job');
const needs = Array.isArray(publish?.needs) ? publish.needs : [];
if (needs.length === 0) fail.push('ci.yml publish job has no `needs` — nothing gates publication');

const displayName = (id) => jobs[id]?.name ?? id;
const gated = needs.map((id) => {
  if (!jobs[id]) fail.push(`ci.yml publish.needs names job "${id}", which does not exist`);
  if (jobs[id]?.['continue-on-error'] === true) fail.push(`ci.yml publish.needs includes "${id}" which is continue-on-error — a job that cannot fail the run cannot be a gate`);
  return displayName(id);
});

// Display names must be unique across ALL jobs, or the receipt's "exactly one
// job with this name" rule is ambiguous before a single run happens.
{
  const names = Object.keys(jobs).map(displayName);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  for (const d of new Set(dupes)) fail.push(`ci.yml gives two jobs the display name "${d}" — the receipt cannot tell them apart`);
}

// ── 3. THE INVARIANT: the two sets are the same set ───────────────────────
if (required) {
  const want = new Set(required);
  const have = new Set(gated);
  for (const n of want) if (!have.has(n)) fail.push(`required-jobs.json requires "${n}" but ci.yml publish.needs does not wait for it`);
  for (const n of have) if (!want.has(n)) fail.push(`ci.yml publish.needs waits for "${n}" but required-jobs.json does not require it — the receipt would publish without it`);
  // …and nothing in the manifest may be a reported/non-blocking job.
  for (const n of want) {
    const id = Object.keys(jobs).find((k) => displayName(k) === n);
    if (id && jobs[id]['continue-on-error'] === true) fail.push(`required-jobs.json requires "${n}" which is continue-on-error in ci.yml — deferred work must stay outside the contract`);
  }
}

// ── 4. the publisher actually consults this contract, from the checkout ───
if (!pubSrc.includes('.github/required-jobs.json')) fail.push('eas-update-golem.yml never reads .github/required-jobs.json');
if (!pubSrc.includes('scripts/verify-ci-receipt.cjs')) fail.push('eas-update-golem.yml never runs scripts/verify-ci-receipt.cjs');
if (/\[ "\$R_STATUS" = "completed" \] && \[ "\$R_CONCL" != "success" \]/.test(pubSrc)) {
  fail.push('eas-update-golem.yml still carries the in-progress short-circuit (status == completed && conclusion != success) — that is the hole the receipt closes');
}

// ── 5. say what the contract is, every run ────────────────────────────────
console.log(`[check:requiredjobs] contract: ${gated.length} required job(s) — ${gated.join(' · ')}`);

if (fail.length) {
  console.error('[check:requiredjobs] FAIL');
  for (const f of fail) console.error('  · ' + f);
  process.exit(1);
}
console.log('[check:requiredjobs] OK — the receipt names every gate ci.yml waits for, and nothing else.');
