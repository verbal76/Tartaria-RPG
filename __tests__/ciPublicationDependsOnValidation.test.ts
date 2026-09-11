// ⚠⚠⚠ CI IS THE AUTHORITY, AND PUBLICATION DEPENDS ON IT (2026-09-10).
//
// Owner: "Put the currently local-only gates under CI authority and make OTA
// publication dependent on successful validation. Avoid unnecessarily running
// the expensive fast surface twice."
//
// Before: fifteen `check:*` ratchets ran only on a developer's machine, and the
// publisher fired on every trunk push in parallel with CI — it published
// whether or not CI passed (OTA-1415: twenty-one OTAs shipped red). After: every
// check:* script runs in CI; the publisher no longer listens to pushes at all
// and is dispatched by CI's `publish` job only after every required job is
// green, for that exact commit, with the run id as a receipt it verifies
// against the API before touching a channel. The fast surface runs once.
//
// ⚠ Not an OTA — nothing here reaches a phone — so this suite carries no OTA
// number and the stamp does not move.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// js-yaml ships no types here; the parser is the one the repo already carries.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { load } = require('js-yaml') as { load: (src: string) => unknown };

const root = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
const CI_SRC = read('.github', 'workflows', 'ci.yml');
const PUB_SRC = read('.github', 'workflows', 'eas-update-golem.yml');
type Step = { name?: string; run?: string; if?: string; uses?: string };
type Job = { needs?: string[]; if?: string; steps: Step[]; 'continue-on-error'?: boolean; permissions?: Record<string, string> };
type Wf = { on: Record<string, unknown>; concurrency?: Record<string, unknown>; jobs: Record<string, Job> };
// js-yaml reads a bare `on:` key as boolean true; normalise.
const parse = (src: string): Wf => { const d = load(src) as Record<string, unknown>; return { ...(d as object), on: (d.on ?? d.true) as Record<string, unknown> } as Wf; };
const CI = parse(CI_SRC);
const PUB = parse(PUB_SRC);
const PKG = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

describe('every local gate runs in CI', () => {
  it('⚠⚠⚠ EVERY check:* SCRIPT IN package.json IS A CI STEP', () => {
    const checks = Object.keys(PKG.scripts).filter((k) => k.startsWith('check:'));
    expect(checks.length).toBeGreaterThanOrEqual(20);
    const runs = Object.values(CI.jobs).flatMap((j) => j.steps.map((s) => s.run ?? ''));
    for (const c of checks) {
      expect({ script: c, inCi: runs.some((r) => r.includes(`npm run ${c}`)) }).toEqual({ script: c, inCi: true });
    }
  });

  it('⚠⚠ the gates job is required by the publish job, alongside the three older required gates and lint', () => {
    expect(CI.jobs.gates).toBeDefined();
    expect(CI.jobs.gates!['continue-on-error']).toBeUndefined();
    expect([...(CI.jobs.publish!.needs ?? [])].sort()).toEqual(['gates', 'lint', 'test', 'typecheck-source', 'typecheck-tests']);
    // The heavy sims stay reported, and reported means not a publication gate.
    expect(CI.jobs['test-heavy']!['continue-on-error']).toBe(true);
    expect(CI.jobs.publish!.needs).not.toContain('test-heavy');
  });

  it('the typecheck, lint and fast-suite gates are unchanged', () => {
    expect(CI_SRC).toContain('run: npm run typecheck:ci');
    expect(CI_SRC).toContain('run: npm run typecheck:tests');
    expect(CI_SRC).toContain('run: npm run lint');
    expect(CI_SRC).toContain('run: npm run test:ci:fast -- --reporters=default');
  });
});

describe('publication depends on validation', () => {
  it('⚠⚠⚠ THE PUBLISHER NO LONGER LISTENS TO PUSHES — it is dispatched, and only dispatched', () => {
    expect(Object.keys(PUB.on)).toEqual(['workflow_dispatch']);
    expect(PUB_SRC).not.toMatch(/^\s+push:\s*$/m);
    const inputs = (PUB.on.workflow_dispatch as { inputs: Record<string, unknown> }).inputs;
    expect(Object.keys(inputs).sort()).toEqual(['line', 'sha', 'validated_by']);
  });

  it('⚠⚠⚠ CI DISPATCHES IT, only on a trunk push, only after the required jobs, only for a bundle change', () => {
    const publish = CI.jobs.publish!;
    expect(publish.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/golem-line'");
    expect(publish.permissions).toEqual({ contents: 'read', actions: 'write' });
    const dispatch = publish.steps.find((s) => (s.run ?? '').includes('gh workflow run eas-update-golem.yml'))!;
    expect(dispatch).toBeDefined();
    expect(dispatch.if).toBe("steps.bundle.outputs.touched == '1'");
    expect(dispatch.run).toContain('--ref golem-line');
    expect(dispatch.run).toContain('-f sha="${{ github.sha }}"');
    expect(dispatch.run).toContain('-f validated_by="${{ github.run_id }}"');
    // The bundle filter is the publisher's old paths-ignore, plus tests (not in the bundle).
    const filter = publish.steps.find((s) => (s.run ?? '').includes('TOUCHED='))!.run!;
    for (const p of ['sentry-inbox/*', 'package.json', 'app.json', 'app.config.js', 'eas.json', 'metro.config.js', '.github/*', '*.md', 'docs/*', 'scripts/*', 'android/*', 'ios/*', 'desktop/*', 'web-stubs/*', '__tests__/*', 'test-utils/*']) {
      expect(filter).toContain(p);
    }
  });

  it('⚠⚠⚠ THE PUBLISHER VERIFIES THE RECEIPT before it touches a channel — both paths', () => {
    const steps = PUB.jobs.ota!.steps;
    const names = steps.map((s) => s.name ?? s.uses ?? '');
    const receipt = names.findIndex((n) => n === 'Require a green CI run for this commit');
    const publish = names.findIndex((n) => n === "Publish OTA to the selected line's channel set");
    expect(receipt).toBeGreaterThan(0);
    expect(receipt).toBeLessThan(publish);
    const run = steps[receipt]!.run!;
    // ⚠⚠ 2026-09-11 — HARDENED. The two paths differ ONLY in how they find the
    // run id; one verifier (scripts/verify-ci-receipt.cjs) then judges both.
    // Automatic: the run id CI handed over.
    expect(run).toContain('RUN_ID="$VALIDATED_BY"');
    // Human: the NEWEST CI run for the SHA, by workflow FILE, not display name.
    expect(run).toContain('actions/workflows/ci.yml/runs?head_sha=${SHA}');
    expect(run).toContain('select(.path == ".github/workflows/ci.yml")');
    expect(run).toContain('Refusing to publish — no CI run exists');
    // Both: the run and its LATEST-attempt jobs go to the verifier with the
    // manifest read from the checkout — the SHA being published.
    expect(run).toContain('actions/runs/${RUN_ID}"');
    expect(run).toContain('actions/runs/${RUN_ID}/jobs?filter=latest&per_page=100');
    expect(run).toContain('node scripts/verify-ci-receipt.cjs');
    expect(run).toContain('--manifest .github/required-jobs.json');
    // The in-progress short-circuit is gone. The old guard was a no-op while
    // CI was still running, and validated_by is an input anyone can set.
    expect(run).not.toContain('[ "$R_STATUS" = "completed" ]');
    expect(run).not.toContain('.status == "completed" and .conclusion == "success"');
    expect(PUB.jobs.ota!.permissions ?? (PUB as unknown as { permissions: Record<string, string> }).permissions).toMatchObject({ actions: 'read' });
  });

  it('⚠⚠ it publishes the SHA it was dispatched for, and reads the marker from that commit', () => {
    const checkout = PUB.jobs.ota!.steps.find((s) => s.uses?.startsWith('actions/checkout'))! as Step & { with: Record<string, string> };
    expect(checkout.with.ref).toBe('${{ github.event.inputs.sha || github.sha }}');
    expect(PUB_SRC).not.toContain('github.event.head_commit.message');
    expect(PUB_SRC).toContain('COMMIT_MSG="$(git log -1 --format=%B)"');
    expect(PUB_SRC).toContain('MSG="OTA ${TARTARIA_LINE} — ${GITHUB_REF_NAME}@${SHA::7}');
  });

  it('⚠⚠⚠ THE FIREWALL IS UNCHANGED: an automatic run re-derives the line from the title and may only reach golem without the marker', () => {
    const resolve = PUB.jobs.ota!.steps.find((s) => s.name === 'Resolve which product line this run publishes')!.run!;
    expect(resolve).toContain('if [ -z "$VALIDATED_BY" ] && [ -n "$DISPATCHED" ]; then');
    expect(resolve).toContain("elif echo \"${COMMIT_MSG:-}\" | head -1 | grep -q '\\[ota-hal\\]'; then");
    expect(resolve).toContain('HOW="default (automatic push)"');
    expect(PUB_SRC).toContain('[ "${{ steps.line.outputs.how }}" = "default (automatic push)" ]');
    expect(PUB_SRC).toContain('an unselected (automatic) run may only target golem');
    expect(PUB_SRC).toContain('NOTHING UNATTENDED REACHES A PLAYER');
  });

  it('⚠⚠ a trunk push is never cancelled by the next one — each OTA and its catch-up is owed its own publish', () => {
    expect(CI.concurrency!['cancel-in-progress']).toBe("${{ github.ref != 'refs/heads/golem-line' }}");
    // ...and never REPLACED while pending, either: GitHub keeps one pending run
    // per group, so a trunk push must be its own group. Measured the hour the
    // first version shipped — two trunk runs cancelled before any job started.
    expect(CI.concurrency!.group).toBe("ci-${{ github.ref == 'refs/heads/golem-line' && github.sha || github.ref }}");
  });
});
