// ⚠⚠⚠ THE VALIDATION RECEIPT NAMES EVERY GATE, AND ONLY THE GATES (2026-09-11).
//
// The OTA latency audit confirmed Codex's claim K: the publisher's receipt
// accepted an IN-PROGRESS CI run on the automatic path. Its only refusal was
//
//     [ "$R_STATUS" = "completed" ] && [ "$R_CONCL" != "success" ]
//
// which is a no-op while CI is still running — and `validated_by` is a
// workflow_dispatch INPUT. Hand the publisher the id of a still-running CI run
// at the target SHA and every surviving check (name == "CI", head_sha == SHA)
// passes while jest is mid-flight. The `needs:` graph held the line on the
// genuinely automatic path; the RECEIPT never carried that guarantee, and the
// "automatic" branch was weaker than the "manual" one.
//
// Change A replaces both branches with one verifier, scripts/verify-ci-receipt.cjs,
// and one contract, .github/required-jobs.json, read from the CHECKED-OUT SHA.
// This suite holds three things:
//
//   1. the contract is the contract — the manifest equals ci.yml's publish.needs
//      by display name, and never names a job that cannot fail the run;
//   2. the publisher actually consults it, from the checkout, on both paths,
//      with the short-circuit gone;
//   3. the verifier refuses every way a run can look green without being green
//      (NC-A1..A10), and does NOT refuse when the deferred heavy simulations
//      are still running or red (PC-A2, PC-A3) — hardening the required receipt
//      must not quietly turn the reported tier into a blocking one.
//
// ⚠ Not an OTA — nothing here reaches a phone — so, like its sibling
// ciPublicationDependsOnValidation, this suite carries no OTA number and the
// stamp does not move.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// js-yaml ships no types here; the parser is the one the repo already carries.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { load } = require('js-yaml') as { load: (src: string) => unknown };

type Run = { id?: number; name?: string; path?: string; head_sha?: string; run_attempt?: number; status?: string; conclusion?: string | null };
type JobRow = { name: string; run_attempt: number; status: string; conclusion: string | null };
type Jobs = { total_count?: number; jobs: JobRow[] };
type Result = { ok: boolean; reasons: string[]; attempt: number | null; verified: string[] };
type Verify = (a: { sha: string; run: Run; jobs: Jobs; manifest: unknown; workflowPath?: string }) => Result;
// The real verifier, not a re-statement of it. It is .cjs so jest can load it
// with no transform and no config change (the transform pattern is \.[jt]sx?$).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyReceipt, CI_WORKFLOW_PATH } = require('../scripts/verify-ci-receipt.cjs') as { verifyReceipt: Verify; CI_WORKFLOW_PATH: string };

const root = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
type Step = { name?: string; run?: string; uses?: string };
type Job = { name?: string; needs?: string[]; steps: Step[]; 'continue-on-error'?: boolean };
type Wf = { jobs: Record<string, Job> };
const CI = load(read('.github', 'workflows', 'ci.yml')) as Wf;
const PUB = load(read('.github', 'workflows', 'eas-update-golem.yml')) as Wf;
const PUB_SRC = read('.github', 'workflows', 'eas-update-golem.yml');
const MANIFEST = JSON.parse(read('.github', 'required-jobs.json')) as { workflow: string; required: string[] };
const PKG = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

const SHA = '257b583ed18ceaf6e363db91f3d7aa1995a0eee4';
const OTHER_SHA = '9e7d33cd81c33033ce143fb6e2f3a765a6fdc530';
const REQUIRED = MANIFEST.required;
const HEAVY = 'jest (heavy sims · reported)';
// ⚠ 2026-09-11 (Change C) — the single `jest (fast · required)` job became four
// shards, so the controls below name ONE representative required shard rather
// than the retired single job. Nothing about the receipt changed: it still
// demands exactly one current-attempt job per manifest entry, literally green.
const SHARD1 = 'jest shard 1/4 (fast · required)';

/** A CI run exactly as the API returns it, with every required job green. */
const greenRun = (over: Partial<Run> = {}): Run => ({
  id: 34632840636, name: 'CI', path: CI_WORKFLOW_PATH, head_sha: SHA, run_attempt: 1, status: 'in_progress', conclusion: null, ...over,
});
const job = (name: string, over: Partial<JobRow> = {}): JobRow => ({ name, run_attempt: 1, status: 'completed', conclusion: 'success', ...over });
const greenJobs = (extra: JobRow[] = []): Jobs => {
  const rows = [...REQUIRED.map((n) => job(n)), job(HEAVY), ...extra];
  return { total_count: rows.length, jobs: rows };
};
const verify = (jobs: Jobs, run: Run = greenRun(), manifest: unknown = REQUIRED, sha = SHA) => verifyReceipt({ sha, run, jobs, manifest });

// ─────────────────────────────────────────────────────────────────────────
describe('1. the contract is the contract', () => {
  it('⚠⚠⚠ THE MANIFEST EQUALS ci.yml publish.needs, BY DISPLAY NAME — one contract, two spellings, no drift', () => {
    const needs = CI.jobs.publish!.needs!;
    const gated = needs.map((id) => CI.jobs[id]!.name ?? id).sort();
    expect([...REQUIRED].sort()).toEqual(gated);
    expect(MANIFEST.workflow).toBe(CI_WORKFLOW_PATH);
  });

  it('⚠⚠ it names the eight real gates — four non-jest, four jest shards — each exactly once, and nothing reported', () => {
    expect(REQUIRED).toHaveLength(8);
    expect(new Set(REQUIRED).size).toBe(8);
    for (const n of ['typecheck (source · required)', 'typecheck (tests · ratchet)', 'lint (required)', 'source gates (ratchets · required)']) {
      expect(REQUIRED).toContain(n);
    }
    // ⚠⚠⚠ FOUR SHARDS, FOUR LITERAL NAMES. Not a matrix: a matrix with a static
    // `name:` gives every leg the SAME display name, which is exactly the
    // ambiguity this receipt exists to refuse. Each is its own required job.
    for (const n of [1, 2, 3, 4]) expect(REQUIRED).toContain(`jest shard ${n}/4 (fast · required)`);
    expect(REQUIRED).not.toContain('jest (fast · required)');
    expect(REQUIRED).not.toContain(HEAVY);
    // …and no manifest entry may be a job that cannot fail the run.
    for (const n of REQUIRED) {
      const id = Object.keys(CI.jobs).find((k) => (CI.jobs[k]!.name ?? k) === n)!;
      expect({ job: n, coe: CI.jobs[id]!['continue-on-error'] }).toEqual({ job: n, coe: undefined });
    }
    expect(CI.jobs['test-heavy']!['continue-on-error']).toBe(true);
  });

  it('⚠⚠ every ci.yml job has a distinct display name — "exactly one job with this name" must be decidable before any run exists', () => {
    const names = Object.keys(CI.jobs).map((k) => CI.jobs[k]!.name ?? k);
    expect(new Set(names).size).toBe(names.length);
  });

  it('⚠⚠ the drift gate exists, is a check:* script, and runs in the required gates job', () => {
    expect(PKG.scripts['check:requiredjobs']).toBe('node scripts/check-required-jobs.mjs');
    const gates = CI.jobs.gates!.steps.map((s) => s.run ?? '');
    expect(gates).toContain('npm run check:requiredjobs');
    expect(CI.jobs.publish!.needs).toContain('gates');
  });
});

describe('2. the publisher consults the contract, from the checkout, on both paths', () => {
  const step = PUB.jobs.ota!.steps.find((s) => s.name === 'Require a green CI run for this commit')!;
  const run = step.run!;

  it('⚠⚠⚠ ONE VERIFIER JUDGES BOTH PATHS — the paths differ only in how the run id is found', () => {
    expect(run).toContain('RUN_ID="$VALIDATED_BY"');
    expect(run).toContain('select(.path == ".github/workflows/ci.yml")');
    expect(run).toContain('node scripts/verify-ci-receipt.cjs');
    expect(run).toContain('--sha "$SHA"');
    expect(run).toContain('--manifest .github/required-jobs.json');
    // Exactly one invocation, after both branches have converged on RUN_ID.
    expect(run.split('node scripts/verify-ci-receipt.cjs')).toHaveLength(2);
  });

  it('⚠⚠ it reads the LATEST attempt, all of it, from the run the id names', () => {
    expect(run).toContain('actions/runs/${RUN_ID}/jobs?filter=latest&per_page=100');
    expect(run).toContain('actions/runs/${RUN_ID}"');
  });

  it('⚠⚠⚠ THE IN-PROGRESS SHORT-CIRCUIT IS GONE, and nothing reads the run\'s overall status or conclusion', () => {
    expect(PUB_SRC).not.toMatch(/\[ "\$R_STATUS" = "completed" \]/);
    expect(run).not.toContain('.status == "completed"');
    expect(run).not.toContain('R_CONCL');
    expect(run).not.toContain('.conclusion');
  });

  it('⚠⚠ the manifest and verifier come from the checkout — the SHA being published — which runs BEFORE the receipt step', () => {
    const names = PUB.jobs.ota!.steps.map((s) => s.name ?? s.uses ?? '');
    const checkout = names.findIndex((n) => n === 'Checkout');
    const receipt = names.findIndex((n) => n === 'Require a green CI run for this commit');
    const publish = names.findIndex((n) => n === "Publish OTA to the selected line's channel set");
    expect(checkout).toBeGreaterThanOrEqual(0);
    expect(checkout).toBeLessThan(receipt);
    expect(receipt).toBeLessThan(publish);
    const co = PUB.jobs.ota!.steps[checkout]! as Step & { with: Record<string, string> };
    expect(co.with.ref).toBe('${{ github.event.inputs.sha || github.sha }}');
    // Relative paths, resolved against that checkout — never a URL, never a ref.
    expect(run).not.toMatch(/raw\.githubusercontent|golem-line.*required-jobs/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('3. the verifier — positive controls', () => {
  it('PC-A1 — COMPLETE REQUIRED CONTRACT: every required job exactly once, literally success → GREEN', () => {
    const r = verify(greenJobs());
    expect(r).toMatchObject({ ok: true, reasons: [], attempt: 1 });
    expect([...r.verified].sort()).toEqual([...REQUIRED].sort());
  });

  it('PC-A2 — HEAVY STILL RUNNING while every required job is green → GREEN (the run itself is in_progress, and that is fine)', () => {
    const jobs = greenJobs();
    const heavy = jobs.jobs.find((j) => j.name === HEAVY)!;
    heavy.status = 'in_progress'; heavy.conclusion = null;
    const r = verify(jobs, greenRun({ status: 'in_progress', conclusion: null }));
    expect(r).toMatchObject({ ok: true, reasons: [] });
  });

  it('PC-A3 — HEAVY FAILED while every required job is green → GREEN (reported means not consulted)', () => {
    const jobs = greenJobs();
    const heavy = jobs.jobs.find((j) => j.name === HEAVY)!;
    heavy.conclusion = 'failure';
    const r = verify(jobs, greenRun({ status: 'completed', conclusion: 'failure' }));
    expect(r).toMatchObject({ ok: true, reasons: [] });
  });

  it('PC — the real API shape of CI run 2120 (OTA-1803), captured verbatim, is accepted', () => {
    // The fields the verifier reads are exactly the ones GitHub returns; this
    // pins the shape so a renamed field cannot make every receipt silently red.
    const run: Run = { id: 34632840636, name: 'CI', path: '.github/workflows/ci.yml', head_sha: SHA, run_attempt: 1, status: 'completed', conclusion: 'success' };
    // The run object's values are verbatim from the real API; the job rows carry
    // the CURRENT contract's names plus the two jobs a real run also returns and
    // the manifest deliberately ignores (heavy, and publish itself).
    const rows = [...REQUIRED, HEAVY, 'publish (dispatch the OTA for a validated trunk commit)'].map((n) => job(n));
    expect(verify({ total_count: rows.length, jobs: rows }, run).ok).toBe(true);
  });
});

describe('3. the verifier — negative controls (every one must REFUSE)', () => {
  const refuses = (r: Result, pattern: RegExp) => {
    expect(r.ok).toBe(false);
    expect(r.reasons.join('\n')).toMatch(pattern);
  };

  it('NC-A1 — MISSING REQUIRED JOB', () => {
    const jobs = greenJobs();
    jobs.jobs = jobs.jobs.filter((j) => j.name !== SHARD1);
    jobs.total_count = jobs.jobs.length;
    refuses(verify(jobs), /"jest shard 1\/4 \(fast · required\)" did not run/);
  });

  it('NC-A2 — SKIPPED REQUIRED JOB', () => {
    const jobs = greenJobs();
    jobs.jobs.find((j) => j.name === 'lint (required)')!.conclusion = 'skipped';
    refuses(verify(jobs), /"lint \(required\)" is completed\/skipped/);
  });

  it('NC-A3 — CANCELLED REQUIRED JOB', () => {
    const jobs = greenJobs();
    jobs.jobs.find((j) => j.name === 'source gates (ratchets · required)')!.conclusion = 'cancelled';
    refuses(verify(jobs), /cancelled/);
  });

  it('NC-A4 — NULL / IN-PROGRESS REQUIRED JOB (the exact hole: jest still running)', () => {
    const jobs = greenJobs();
    const jest = jobs.jobs.find((j) => j.name === SHARD1)!;
    jest.status = 'in_progress'; jest.conclusion = null;
    refuses(verify(jobs, greenRun({ status: 'in_progress', conclusion: null })), /"jest shard 1\/4 \(fast · required\)" is in_progress\/null/);
  });

  it('NC-A5 — DUPLICATE REQUIRED NAME: two current-attempt jobs, one green, one red → REFUSE (one green sibling proves nothing)', () => {
    const jobs = greenJobs([job(SHARD1, { conclusion: 'failure' })]);
    refuses(verify(jobs), /matched 2 jobs .* ambiguous/);
  });

  it('NC-A5b — DUPLICATE REQUIRED NAME, both green → still REFUSE (ambiguity is the defect, not the colour)', () => {
    refuses(verify(greenJobs([job('lint (required)')])), /matched 2 jobs/);
  });

  it('NC-A6 — WRONG SHA: the run validated a different commit', () => {
    refuses(verify(greenJobs(), greenRun({ head_sha: OTHER_SHA })), /is at 9e7d33cd.*not the SHA being published 257b583e/);
    // …and the same run, asked to vouch for a different SHA.
    refuses(verify(greenJobs(), greenRun(), REQUIRED, OTHER_SHA), /not the SHA being published 9e7d33cd/);
  });

  it('NC-A7 — FOREIGN WORKFLOW: display name "CI", path is not ci.yml', () => {
    refuses(verify(greenJobs(), greenRun({ name: 'CI', path: '.github/workflows/evil.yml' })), /is workflow "\.github\/workflows\/evil\.yml", not \.github\/workflows\/ci\.yml/);
    // A different real workflow of the repo, too — the publisher itself.
    refuses(verify(greenJobs(), greenRun({ name: 'Publish · OTA (one line at a time)', path: '.github/workflows/eas-update-golem.yml' })), /not \.github\/workflows\/ci\.yml/);
  });

  it('NC-A8 — STALE RUN ATTEMPT: green in attempt 1, red or absent in attempt 2', () => {
    // Attempt 2 exists (a "re-run failed jobs"); jest is green only in attempt 1.
    const stale = greenJobs();
    stale.jobs = stale.jobs.map((j) => (j.name === SHARD1 ? { ...j, run_attempt: 1 } : { ...j, run_attempt: 2 }));
    refuses(verify(stale, greenRun({ run_attempt: 2 })), /"jest shard 1\/4 \(fast · required\)" is absent from attempt 2 \(only found in attempt\(s\) 1\)/);
    // …and green in attempt 1 beside RED in attempt 2 — the red one is the truth.
    const both = greenJobs([job(SHARD1, { run_attempt: 2, conclusion: 'failure' })]);
    both.jobs = both.jobs.map((j) => (j.name !== SHARD1 ? { ...j, run_attempt: 2 } : j));
    refuses(verify(both, greenRun({ run_attempt: 2 })), /"jest shard 1\/4 \(fast · required\)" is completed\/failure/);
  });

  it('NC-A9 — REQUIRED FAILURE, literally', () => {
    const jobs = greenJobs();
    jobs.jobs.find((j) => j.name === 'typecheck (source · required)')!.conclusion = 'failure';
    refuses(verify(jobs), /"typecheck \(source · required\)" is completed\/failure/);
  });

  it('NC-A10 — every other legitimate non-success conclusion refuses: timed_out, action_required, neutral, startup_failure, stale', () => {
    for (const c of ['timed_out', 'action_required', 'neutral', 'startup_failure', 'stale']) {
      const jobs = greenJobs();
      jobs.jobs.find((j) => j.name === 'typecheck (tests · ratchet)')!.conclusion = c;
      const r = verify(jobs);
      expect({ conclusion: c, ok: r.ok }).toEqual({ conclusion: c, ok: false });
      expect(r.reasons.join('\n')).toContain(`is completed/${c}`);
    }
  });

  it('NC-A11 — a truncated jobs page is not evidence', () => {
    const jobs = greenJobs();
    jobs.total_count = jobs.jobs.length + 40; // GitHub says there are more than we saw
    refuses(verify(jobs), /truncated: total_count/);
  });

  it('NC-A12 — no contract, no publish: an empty or duplicated manifest refuses before looking at any job', () => {
    refuses(verify(greenJobs(), greenRun(), []), /manifest is empty/);
    refuses(verify(greenJobs(), greenRun(), [...REQUIRED, REQUIRED[0]]), /lists a job name twice/);
  });

  it('NC-A13 — a required job that ran but has status ≠ completed refuses even if conclusion says success', () => {
    const jobs = greenJobs();
    jobs.jobs.find((j) => j.name === 'lint (required)')!.status = 'queued';
    refuses(verify(jobs), /"lint \(required\)" is queued\/success/);
  });
});

describe('4. the contract in the repository is the one the verifier was proven against', () => {
  it('the committed manifest, run through the verifier against a fully green fixture, is accepted — the two are not merely similar', () => {
    const r = verifyReceipt({ sha: SHA, run: greenRun(), jobs: greenJobs(), manifest: MANIFEST.required });
    expect(r.ok).toBe(true);
    expect(r.verified).toHaveLength(MANIFEST.required.length);
  });
});
