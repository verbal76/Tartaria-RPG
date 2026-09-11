#!/usr/bin/env node
/**
 * ⚠⚠⚠ THE VALIDATION RECEIPT — "THIS EXACT SOURCE SHA PASSED THE COMPLETE
 * REQUIRED VALIDATION CONTRACT THAT APPLIES TO THIS SHA."
 *
 * The publisher used to check a CI run like this:
 *
 *     if [ "$R_STATUS" = "completed" ] && [ "$R_CONCL" != "success" ]; then refuse
 *
 * Read it again. When the run is still IN PROGRESS the first half is false and
 * the whole guard is a no-op — the only things left standing were "the run is
 * named CI" and "it is at this SHA". CI dispatches the publisher from inside its
 * own still-running run, so this was written on purpose, and on the automatic
 * path the `needs:` graph really did hold the line: the publish job cannot start
 * until every required job is green. But the RECEIPT never carried that
 * guarantee. `validated_by` is a workflow_dispatch INPUT; hand the publisher the
 * id of a still-running CI run at the target SHA and every surviving check
 * passes while jest is mid-flight. And the "automatic" branch was WEAKER than
 * the "manual" one, which demanded a completed success — the inversion was the
 * finding (OTA latency audit, 2026-09-11, Codex claim K, confirmed).
 *
 * ⚠⚠ THIS FILE IS THE ONE RECEIPT, FOR EVERY PATH. There is no weaker automatic
 * receipt and stronger manual receipt any more. Both dispatch routes resolve a
 * CI run id and hand it here.
 *
 * What it demands, and why each line exists:
 *
 *   • run.path == .github/workflows/ci.yml — the FILE, not the display name.
 *     Anyone with contents:write can add evil.yml with `name: CI`.
 *   • run.head_sha == the SHA being published — a run at a different commit is
 *     a different validation.
 *   • run.run_attempt is captured and every counted job must belong to it. A
 *     "re-run failed jobs" makes attempt 2; a receipt that read attempt 1's
 *     green `test` beside attempt 2's red one would accept the green.
 *   • jobs.total_count == jobs returned — a truncated page is not evidence.
 *   • FOR EACH NAME IN THE MANIFEST (never "for each job that came back"):
 *       exactly ONE job with that name in the current attempt, and
 *       conclusion === 'success' — LITERALLY. Not "!== failure". A skipped,
 *       cancelled, timed_out, neutral, action_required, startup_failure, stale
 *       or in-progress (null) job is a job that did not pass.
 *     Zero matches → a required gate did not run. Two → the name is ambiguous
 *     (a matrix leg, a copy-paste) and one green sibling proves nothing.
 *   • EVERYTHING NOT IN THE MANIFEST IS IGNORED. That is how the deferred heavy
 *     simulations stay reported and non-blocking: still running, or failed,
 *     they are simply not consulted. The overall run status/conclusion is
 *     never read, for the same reason — heavy may keep the run open for an hour.
 *
 * ⚠⚠ THE MANIFEST TRAVELS WITH THE SOURCE. The publisher reads
 * .github/required-jobs.json from the CHECKED-OUT SHA — the same commit whose
 * ci.yml produced the run being verified — so the contract being enforced is
 * the contract that applied to that SHA, and a later trunk cannot rewrite the
 * terms of an older validation. scripts/check-required-jobs.mjs keeps the
 * manifest and ci.yml's `publish.needs` in agreement at authoring time.
 *
 * ⚠ WHY .cjs WHEN EVERY OTHER SCRIPT HERE IS .mjs. The suite
 * ciReceiptNamesEveryGate drives verifyReceipt DIRECTLY — the real function,
 * not a restatement — for every refusal above and for the three cases that
 * must not refuse. Jest's transform matches `\.[jt]sx?$`, so an .mjs would be
 * loaded raw as ESM and fail to import; a .cjs needs no transform and no jest
 * configuration change. Stock runner node runs it the same way, before
 * `npm ci`, because the receipt gates the install and not the reverse. No
 * dependencies.
 */
'use strict';
const { readFileSync } = require('node:fs');

const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';

/**
 * @param {object} args
 * @param {string} args.sha           the exact commit being published
 * @param {object} args.run           GET /repos/{o}/{r}/actions/runs/{id}
 * @param {object} args.jobs          GET /repos/{o}/{r}/actions/runs/{id}/jobs?filter=latest&per_page=100
 * @param {string[]} args.manifest    required job display names, read from the checked-out SHA
 * @param {string} [args.workflowPath]
 * @returns {{ ok: boolean, reasons: string[], attempt: number|null, verified: string[] }}
 */
function verifyReceipt({ sha, run, jobs, manifest, workflowPath = CI_WORKFLOW_PATH }) {
  const reasons = [];
  const verified = [];

  // ── the manifest itself must be a real contract ──────────────────────────
  if (!Array.isArray(manifest) || manifest.length === 0) {
    return { ok: false, reasons: ['manifest is empty or not a list — no contract, no publish'], attempt: null, verified };
  }
  if (manifest.some((n) => typeof n !== 'string' || n.trim() === '')) {
    return { ok: false, reasons: ['manifest contains a non-string or blank job name'], attempt: null, verified };
  }
  if (new Set(manifest).size !== manifest.length) {
    return { ok: false, reasons: ['manifest lists a job name twice'], attempt: null, verified };
  }
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
    return { ok: false, reasons: [`sha "${sha}" is not a full 40-hex commit id`], attempt: null, verified };
  }

  // ── the run: the right workflow FILE, at this SHA, one attempt ───────────
  if (!run || typeof run !== 'object') {
    return { ok: false, reasons: ['no CI run object'], attempt: null, verified };
  }
  if (run.path !== workflowPath) {
    reasons.push(`run ${run.id ?? '?'} is workflow "${run.path}", not ${workflowPath} (display name "${run.name}" is not identity)`);
  }
  if (run.head_sha !== sha) {
    reasons.push(`run ${run.id ?? '?'} is at ${run.head_sha}, not the SHA being published ${sha}`);
  }
  const attempt = Number.isInteger(run.run_attempt) && run.run_attempt >= 1 ? run.run_attempt : null;
  if (attempt === null) {
    reasons.push(`run ${run.id ?? '?'} has no usable run_attempt (${run.run_attempt})`);
  }
  if (reasons.length) return { ok: false, reasons, attempt, verified };

  // ── the jobs: the whole latest attempt, nothing truncated ────────────────
  const list = jobs && Array.isArray(jobs.jobs) ? jobs.jobs : null;
  if (!list) {
    return { ok: false, reasons: ['no jobs list on the CI run'], attempt, verified };
  }
  if (Number.isInteger(jobs.total_count) && jobs.total_count !== list.length) {
    return {
      ok: false,
      reasons: [`jobs response is truncated: total_count ${jobs.total_count} but ${list.length} returned — a partial page is not evidence`],
      attempt,
      verified,
    };
  }

  // ── every required name: exactly one current-attempt job, literally green ─
  for (const name of manifest) {
    const matched = list.filter((j) => j && j.name === name && j.run_attempt === attempt);
    if (matched.length === 0) {
      const stale = list.filter((j) => j && j.name === name);
      reasons.push(
        stale.length
          ? `required job "${name}" is absent from attempt ${attempt} (only found in attempt(s) ${[...new Set(stale.map((j) => j.run_attempt))].join(',')})`
          : `required job "${name}" did not run`,
      );
      continue;
    }
    if (matched.length > 1) {
      reasons.push(`required job "${name}" matched ${matched.length} jobs in attempt ${attempt} — ambiguous, one green sibling proves nothing`);
      continue;
    }
    const job = matched[0];
    if (job.status !== 'completed' || job.conclusion !== 'success') {
      reasons.push(`required job "${name}" is ${job.status}/${job.conclusion === null || job.conclusion === undefined ? 'null' : job.conclusion}, not completed/success`);
      continue;
    }
    verified.push(name);
  }

  return { ok: reasons.length === 0, reasons, attempt, verified };
}

// ── CLI: node scripts/verify-ci-receipt.cjs --sha S --run run.json --jobs jobs.json --manifest .github/required-jobs.json
function cli(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) { opt[a.slice(2)] = argv[i + 1]; i += 1; }
  }
  const missing = ['sha', 'run', 'jobs', 'manifest'].filter((k) => !opt[k]);
  if (missing.length) {
    console.error(`[verify-ci-receipt] missing --${missing.join(', --')}`);
    return 2;
  }
  const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const manifestFile = json(opt.manifest);
  // The committed file is an object so it can carry its own explanation; the
  // contract is its `required` list. A bare array is accepted for fixtures.
  const manifest = Array.isArray(manifestFile) ? manifestFile : manifestFile && manifestFile.required;
  const result = verifyReceipt({ sha: opt.sha, run: json(opt.run), jobs: json(opt.jobs), manifest });
  if (result.ok) {
    console.log(`✓ receipt: CI attempt ${result.attempt} at ${opt.sha} — every required gate green: ${result.verified.join(' · ')}`);
    return 0;
  }
  console.error(`::error::Refusing to publish — the validation receipt for ${opt.sha} does not hold:`);
  for (const r of result.reasons) console.error(`  · ${r}`);
  return 1;
}

module.exports = { verifyReceipt, CI_WORKFLOW_PATH };

if (require.main === module) {
  process.exit(cli(process.argv.slice(2)));
}
