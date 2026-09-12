/**
 * ⚠⚠⚠ A GATE-ONLY REPAIR MUST NOT ERASE THE PUBLICATION NEED BEHIND IT.
 *
 * The defect this suite exists for, measured 2026-09-12:
 *
 *   3f840c10  Phase 3 / OTA-1804 — app/ changed        CI 2127 RED
 *   94bc0c83  re-pin one allowlist LINE NUMBER         CI 2128 GREEN
 *
 * ci.yml's publish job diffed `github.event.before..github.sha` — the PREVIOUS
 * PUSH. For 94bc0c83 that range is one file under scripts/, so the bundle filter
 * said "nothing to publish" and skipped the dispatch. Correct about the push and
 * wrong about the phone: Phase 3's validated bundle sat on the trunk, unshipped,
 * and no future push's range would ever contain it again.
 *
 * ⚠⚠ THE INVARIANT, in the owner's words: "A validated trunk SHA must be
 * considered publication-worthy when the currently deployed Golem OTA does not
 * yet contain the most recent bundle-affecting changes reachable in that
 * validated SHA." So the question is about the GAP between the trunk and the
 * channel, not about one push — and the fix is the diff's ANCHOR, not its path
 * filter. The filter was never wrong and is deliberately still in ci.yml, where
 * ciPublicationDependsOnValidation already pins every ignored path.
 *
 * ⚠ WHAT THIS SUITE IS NOT. It does not test whether a SHA is worth publishing —
 * that is Change A's receipt (scripts/verify-ci-receipt.cjs) inside the
 * publisher, and case 7 below asserts the repair did not move or weaken it. It
 * does not test the HAL firewall's design, only that this change leaves it
 * intact (case 5). Every fixture is injected; nothing here touches the network,
 * the Actions API, or a real git repository.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml = require('js-yaml') as { load(s: string): unknown };

type Run = { id: number; run_number: number; head_sha: string };
type Found = { anchor: string | null; why: string; skipped: string[] };
type RangeStart = { from: string | null; publishAnyway: boolean; why: string };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const anchorMod = require('../scripts/publication-anchor.cjs') as {
  lastGolemPublication(p: {
    runs: Run[];
    headRunId: number | string;
    isAncestorOfHead(sha: string): boolean;
    dispatchStatus(id: number | string): string | null;
    titleOf(sha: string): string;
  }): Found;
  olderOf(a: string | null, b: string | null, isAncestorOf: (a: string, b: string) => boolean): string | null;
  chooseRangeStart(p: {
    before: string | null;
    anchor: string | null;
    hasCommit(sha: string): boolean;
    isAncestorOf(a: string, b: string): boolean;
  }): RangeStart;
  DISPATCH_STEP: string;
};
const { lastGolemPublication, olderOf, chooseRangeStart, DISPATCH_STEP } = anchorMod;

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const CI_SRC = read('.github/workflows/ci.yml');
const PUB_SRC = read('.github/workflows/eas-update-golem.yml');
type Step = { name?: string; id?: string; run?: string; uses?: string; if?: string; with?: Record<string, unknown> };
type WF = { jobs: Record<string, { steps: Step[]; permissions?: unknown; if?: string }> };
const CI = yaml.load(CI_SRC) as WF;
const PUB = yaml.load(PUB_SRC) as WF;

/* ── The real history, as fixtures. These are the actual SHAs, run numbers and
 * step conclusions read from the Actions API on 2026-09-12, so the suite fails
 * if the logic stops reproducing the case that actually happened. ───────────── */
const PHASE2 = '5037113b93f38facfffe0979673b8d727fe01ddd'; // CI 2126, dispatched golem
const PHASE3 = '3f840c10b46224cdb654126e0bc1078aa6bbbf75'; // CI 2127, RED, app/ changed
const GATEFIX = '94bc0c83a2dc19bae2ee7c075b376f56c7b2c8e8'; // CI 2128, GREEN, scripts/ only
const HAL1803 = '257b583e257b583e257b583e257b583e257b583e'; // CI 2120, dispatched — but [ota-hal]
const SHARDS = 'ae5cee38ae5cee38ae5cee38ae5cee38ae5cee38'; // CI 2124, green, dispatch skipped

/** A linear trunk, oldest first — ancestry is just index order. */
const TRUNK = [HAL1803, SHARDS, PHASE2, PHASE3, GATEFIX];
const isAncestorOf = (a: string, b: string) => {
  const i = TRUNK.indexOf(a); const j = TRUNK.indexOf(b);
  return i >= 0 && j >= 0 && i <= j;
};
const hasCommit = (sha: string) => TRUNK.includes(sha);

const HISTORY: Array<{ run: Run; dispatch: string | null; title: string }> = [
  { run: { id: 2128, run_number: 2128, head_sha: GATEFIX }, dispatch: 'skipped', title: 'Re-pin the standing-at allowlist to the line Phase 3 moved it to' },
  { run: { id: 2127, run_number: 2127, head_sha: PHASE3 }, dispatch: null, title: 'Visual language phase 3 — one control language' },
  { run: { id: 2126, run_number: 2126, head_sha: PHASE2 }, dispatch: 'success', title: 'Visual language phase 2 — the third plane' },
  { run: { id: 2124, run_number: 2124, head_sha: SHARDS }, dispatch: 'skipped', title: 'Four shards, one surface' },
  { run: { id: 2120, run_number: 2120, head_sha: HAL1803 }, dispatch: 'success', title: '[ota-hal] OTA-1803 — the HUD belongs to Tartaria' },
];

const lookup = (head: string, headRunId: number, runs = HISTORY) => lastGolemPublication({
  runs: runs.map((h) => h.run),
  headRunId,
  isAncestorOfHead: (sha) => hasCommit(sha) && isAncestorOf(sha, head),
  dispatchStatus: (id) => runs.find((h) => h.run.id === id)?.dispatch ?? null,
  titleOf: (sha) => runs.find((h) => h.run.head_sha === sha)?.title ?? '',
});

/** The bundle filter, read out of ci.yml so the test cannot drift from it. */
const IGNORED = (() => {
  const step = CI.jobs.publish!.steps.find((s) => (s.run ?? '').includes('TOUCHED='))!;
  const line = step.run!.split('\n').find((l) => l.includes('sentry-inbox/*'))!;
  return line.trim().replace(/\).*$/, '').split('|').map((s) => s.trim()).filter(Boolean);
})();
const globHit = (glob: string, file: string) =>
  glob.endsWith('/*') ? file.startsWith(glob.slice(0, -1))
    : glob.startsWith('*.') ? file.endsWith(glob.slice(1))
      : glob === file;
const bundleTouched = (files: string[]) => files.some((f) => !IGNORED.some((g) => globHit(g, f)));

/** Files changed between two trunk points, as they really were. */
const CHANGED: Record<string, string[]> = {
  [`${PHASE2}..${PHASE3}`]: ['app/ui/tartariaKit.tsx', 'app/screens/MapScreen.tsx', '__tests__/ota1804OneControlLanguage.test.tsx'],
  [`${PHASE3}..${GATEFIX}`]: ['scripts/check-standing-at.mjs'],
  [`${PHASE2}..${GATEFIX}`]: ['app/ui/tartariaKit.tsx', 'app/screens/MapScreen.tsx', '__tests__/ota1804OneControlLanguage.test.tsx', 'scripts/check-standing-at.mjs'],
  [`${SHARDS}..${PHASE2}`]: ['app/ui/tartariaKit.tsx', 'app/components/BrandedModal.tsx'],
};
const changedBetween = (from: string, to: string) => CHANGED[`${from}..${to}`] ?? [];

/** The whole decision, end to end, the way the publish job runs it. */
function wouldDispatch(head: string, headRunId: number, before: string | null, runs = HISTORY) {
  const { anchor } = lookup(head, headRunId, runs);
  const r = chooseRangeStart({ before, anchor, hasCommit, isAncestorOf });
  if (r.publishAnyway || !r.from) return { dispatch: true, from: null, why: r.why };
  return { dispatch: bundleTouched(changedBetween(r.from, head)), from: r.from, why: r.why };
}

describe('1. a bundle-changing commit with green CI publishes', () => {
  it('Phase 2 (5037113b) — app/ changed since the previously published commit, so it dispatches', () => {
    const before = SHARDS;
    const runs = HISTORY.filter((h) => h.run.run_number <= 2126);
    const { anchor } = lookup(PHASE2, 2126, runs);
    // No golem anchor is findable here: 2124's dispatch was skipped and 2120's
    // was [ota-hal]. The push base is still usable, so the decision falls back
    // to exactly the old push-range semantics — which for this commit is right.
    expect(anchor).toBe(null);
    const d = wouldDispatch(PHASE2, 2126, before, runs);
    expect(d.from).toBe(SHARDS);
    expect(d.dispatch).toBe(true);
  });

  it('the ordinary case — anchor equals the push base, one bundle commit, dispatches', () => {
    const r = chooseRangeStart({ before: PHASE2, anchor: PHASE2, hasCommit, isAncestorOf });
    expect(r).toMatchObject({ from: PHASE2, publishAnyway: false });
    expect(bundleTouched(changedBetween(PHASE2, PHASE3))).toBe(true);
  });
});

describe('2. a bundle-changing commit with red CI does not publish', () => {
  it('the publish job cannot even start — it `needs` every required gate', () => {
    const publish = CI.jobs.publish!;
    const needs = (yaml.load(CI_SRC) as { jobs: Record<string, { needs?: string[] }> }).jobs.publish!.needs!;
    expect(needs).toEqual(['typecheck-source', 'typecheck-tests', 'lint', 'gates', 'test-shard-1', 'test-shard-2', 'test-shard-3', 'test-shard-4']);
    // And that is what really happened to Phase 3: CI 2127's publish job was
    // SKIPPED, so its dispatch step has no conclusion at all.
    expect(HISTORY.find((h) => h.run.head_sha === PHASE3)!.dispatch).toBe(null);
    expect(publish.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/golem-line'");
  });

  it('a red run is never an anchor for anyone else either — only a `success` dispatch counts', () => {
    const { skipped } = lookup(GATEFIX, 2128);
    expect(skipped.join(' | ')).toMatch(/run 2127: dispatch absent/);
  });
});

describe('3. ⚠⚠⚠ THE STRANDED CASE — red CI, then a gate-only repair, then green', () => {
  it('BEFORE (the old anchor) the gate fix looked like nothing to publish — the actual defect', () => {
    // The old code diffed the previous push. This is that range, and this is
    // why OTA-1804 never shipped.
    expect(changedBetween(PHASE3, GATEFIX)).toEqual(['scripts/check-standing-at.mjs']);
    expect(bundleTouched(changedBetween(PHASE3, GATEFIX))).toBe(false);
  });

  it('AFTER — the anchor is the last commit golem received, so Phase 3 is still in range', () => {
    const { anchor, why } = lookup(GATEFIX, 2128);
    expect(anchor).toBe(PHASE2);
    expect(why).toContain('2126');
    const d = wouldDispatch(GATEFIX, 2128, PHASE3);
    expect(d.from).toBe(PHASE2);
    expect(d.dispatch).toBe(true);
  });

  it('and the SHA published is the validated one — the anchor moves the range, never the commit', () => {
    const dispatch = CI.jobs.publish!.steps.find((s) => (s.run ?? '').includes('gh workflow run eas-update-golem.yml'))!;
    expect(dispatch.run).toContain('-f sha="${{ github.sha }}"');
    expect(dispatch.run).not.toContain('steps.anchor');
  });
});

describe('4. truly non-bundle changes after an already-published tree make no OTA', () => {
  it('a docs-only push on top of a published commit does not dispatch', () => {
    const DOCS = 'dddddddd11111111dddddddd11111111dddddddd';
    TRUNK.push(DOCS);
    CHANGED[`${GATEFIX}..${DOCS}`] = ['README.md', 'docs/HANDOFF.md'];
    const runs = [{ run: { id: 2129, run_number: 2129, head_sha: GATEFIX }, dispatch: 'success', title: 'gate re-pin' }, ...HISTORY];
    const d = wouldDispatch(DOCS, 2130, GATEFIX, runs);
    expect(d.from).toBe(GATEFIX);
    expect(d.dispatch).toBe(false);
    TRUNK.pop();
  });

  it('every ignored path really is ignored — scripts, tests, workflows, native, the sentry inbox', () => {
    for (const f of ['scripts/x.mjs', '__tests__/a.test.ts', 'test-utils/playerWalker.ts', '.github/workflows/ci.yml',
      'android/app/build.gradle', 'ios/Podfile', 'docs/HANDOFF.md', 'README.md', 'sentry-inbox/2026.json',
      'package.json', 'app.json', 'eas.json', 'metro.config.js', 'jest.config.js']) {
      expect(bundleTouched([f])).toBe(false);
    }
    // And the things that DO ship still do.
    for (const f of ['app/ui/tartariaKit.tsx', 'app/data/quests/hunts.json', 'assets/x.png']) {
      expect(bundleTouched([f])).toBe(true);
    }
  });
});

describe('5. the automatic path still cannot reach HAL by accident', () => {
  it('a dispatch that published HAL is NOT treated as a golem publication', () => {
    // CI 2120 dispatched successfully — to HAL, by its title marker. If that
    // counted as golem, the golem anchor would jump forward over commits golem
    // never received and strand them. It is refused BY NAME.
    const runs = HISTORY.filter((h) => h.run.run_number <= 2124);
    const { anchor, skipped } = lookup(SHARDS, 2124, runs);
    expect(skipped.join(' | ')).toMatch(/run 2120: \[ota-hal\] — that dispatch published HAL, not golem/);
    expect(anchor).toBe(null);
  });

  it('the line is still the publisher\'s to resolve, from the commit TITLE, and this change passes it nothing', () => {
    const anchorStep = CI.jobs.publish!.steps.find((s) => s.id === 'anchor')!;
    expect(anchorStep).toBeDefined();
    expect(anchorStep.run).not.toMatch(/\bline\b/);
    expect(anchorStep.run).not.toMatch(/ota-hal|hal2001|preview/);
    const dispatch = CI.jobs.publish!.steps.find((s) => (s.run ?? '').includes('gh workflow run'))!;
    expect(dispatch.run).toContain('-f line=golem');
    expect(dispatch.run).not.toContain('-f line=hal');
    // The publisher's own firewall assertion is untouched.
    expect(PUB_SRC).toContain('an unselected (automatic) run may only target golem');
  });

  it('the anchor scan reads only ci.yml trunk PUSH runs — a dispatch cannot seed it', () => {
    const anchorStep = CI.jobs.publish!.steps.find((s) => s.id === 'anchor')!;
    const src = readFileSync(join(__dirname, '..', 'scripts/publication-anchor.cjs'), 'utf8');
    expect(src).toContain('workflows/ci.yml/runs?branch=golem-line&event=push');
    expect(anchorStep.run).toContain('scripts/publication-anchor.cjs');
  });
});

describe('6. the manual recovery path is documented as it really is', () => {
  it('the header no longer claims an Actions UI button that does not exist', () => {
    expect(PUB_SRC).not.toMatch(/BY A PERSON, from the Actions UI/);
    expect(PUB_SRC).toMatch(/renders the "Run workflow" control only for[\s\S]{0,120}DEFAULT branch/);
  });

  it('and it names the two paths that do work, plus the automatic recovery', () => {
    expect(PUB_SRC).toContain('gh workflow run eas-update-golem.yml --ref golem-line');
    expect(PUB_SRC).toMatch(/promotions` ledger \(promote\.yml\)/);
    expect(PUB_SRC).toContain('scripts/publication-anchor.cjs');
  });

  it('the workflow_dispatch trigger and its three inputs are unchanged', () => {
    const inputs = ((PUB as unknown as { on: { workflow_dispatch: { inputs: Record<string, unknown> } } }).on).workflow_dispatch.inputs;
    expect(Object.keys(inputs).sort()).toEqual(['line', 'sha', 'validated_by']);
    expect(PUB_SRC).not.toMatch(/^\s+push:\s*$/m);
  });
});

describe('7. receipt verification is still mandatory, and this change did not touch it', () => {
  it('the publisher still verifies before it publishes, on BOTH paths', () => {
    const steps = PUB.jobs.ota!.steps;
    const names = steps.map((s) => s.name ?? s.uses ?? '');
    const receipt = names.findIndex((n) => n === 'Require a green CI run for this commit');
    const publish = names.findIndex((n) => n === "Publish OTA to the selected line's channel set");
    expect(receipt).toBeGreaterThan(0);
    expect(receipt).toBeLessThan(publish);
    expect(steps[receipt]!.run).toContain('node scripts/verify-ci-receipt.cjs');
    expect(steps[receipt]!.run).toContain('--manifest .github/required-jobs.json');
  });

  it('the anchor never decides worth — its CODE holds no receipt, manifest or gate name', () => {
    // ⚠ CODE, not prose. The header explains the division of labour and names
    // verify-ci-receipt.cjs to do it, so this reads a comment-blanked copy —
    // asserting on the raw text would fail on the explanation rather than on a
    // second validation authority, which is the thing that must not exist.
    const raw = readFileSync(join(__dirname, '..', 'scripts/publication-anchor.cjs'), 'utf8');
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/^[ \t]*\/\/.*$/gm, '');
    expect(code).not.toContain('verify-ci-receipt');
    expect(code).not.toContain('required-jobs');
    expect(code).not.toContain('.github/required');
    // It reads ONE step conclusion and one commit title. Nothing else.
    expect(code).not.toMatch(/typecheck|shard|lint\b/);
  });

  it('⚠⚠ AND THE NEW RANGE CAN ONLY EVER WIDEN — it cannot turn a publish into a miss', () => {
    // The start is the OLDER of the anchor and the old push base, so the new
    // range always contains the old one. That asymmetry is the safety property:
    // the worst this change can do is publish golem once too often.
    expect(olderOf(PHASE2, PHASE3, isAncestorOf)).toBe(PHASE2);
    expect(olderOf(PHASE3, PHASE2, isAncestorOf)).toBe(PHASE2);
    expect(olderOf(null, PHASE3, isAncestorOf)).toBe(PHASE3);
    expect(olderOf(PHASE3, null, isAncestorOf)).toBe(PHASE3);
    // Unrelated or unknown anchors never narrow anything — they publish.
    expect(chooseRangeStart({ before: null, anchor: null, hasCommit, isAncestorOf }).publishAnyway).toBe(true);
    const ORPHAN = 'ffffffff0000ffffffff0000ffffffff0000ffff';
    expect(chooseRangeStart({ before: ORPHAN, anchor: ORPHAN, hasCommit, isAncestorOf }).publishAnyway).toBe(true);
  });

  it('a shallow checkout that cannot see the anchor publishes rather than skipping', () => {
    const r = chooseRangeStart({ before: PHASE3, anchor: PHASE2, hasCommit: (s) => s === PHASE3, isAncestorOf });
    expect(r.from).toBe(PHASE3); // the anchor is unusable; the push base still is
    const none = chooseRangeStart({ before: PHASE3, anchor: PHASE2, hasCommit: () => false, isAncestorOf });
    expect(none.publishAnyway).toBe(true);
  });

  it('the checkout fetches enough history for an anchor several pushes back', () => {
    const checkout = CI.jobs.publish!.steps.find((s) => (s.uses ?? '').startsWith('actions/checkout'))!;
    expect(Number((checkout.with as { 'fetch-depth': number })['fetch-depth'])).toBeGreaterThanOrEqual(200);
  });

  /* ⚠⚠⚠ AND THE CLI ITSELF RUNS, BECAUSE THE UNIT TESTS STRUCTURALLY CANNOT
   * CATCH A WIRING DEFECT. CI 2129 resolved the anchor perfectly and then died
   * on `TypeError: isAncestorOf is not a function` — the CLI's object literal
   * said `isAncestor`. Every test above injects the CORRECT key by
   * construction, so none of them could see it; and the local smoke run had no
   * `gh`, so the anchor came back null and `olderOf` returned before it ever
   * called the function. The gap was that NOTHING EXECUTED THE CLI.
   * This does: a throwaway git repo with a real ancestry, and a stub `gh` on
   * PATH serving fixture JSON, so the anchor is FOUND and the widening path —
   * the one that crashed — actually runs. */
  it('⚠⚠ END TO END — the CLI resolves an anchor and widens the range without crashing', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execFileSync, execSync } = require('node:child_process') as typeof import('node:child_process');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('node:os') as typeof import('node:os');

    const tmp = fs.mkdtempSync(join(os.tmpdir(), 'pub-anchor-'));
    const repo = join(tmp, 'repo');
    const bin = join(tmp, 'bin');
    fs.mkdirSync(repo); fs.mkdirSync(bin);
    const g = (cmd: string) => execSync(`git ${cmd}`, { cwd: repo, stdio: 'pipe' });
    g('init -q -b golem-line');
    g('config user.email t@t.t'); g('config user.name t');
    // Three commits: published → bundle change → gate-only repair.
    fs.writeFileSync(join(repo, 'a.txt'), '1'); g('add -A'); g('commit -qm published');
    const published = String(g('rev-parse HEAD')).trim();
    fs.mkdirSync(join(repo, 'app')); fs.writeFileSync(join(repo, 'app/x.ts'), 'x'); g('add -A'); g('commit -qm "bundle change"');
    const bundle = String(g('rev-parse HEAD')).trim();
    fs.mkdirSync(join(repo, 'scripts')); fs.writeFileSync(join(repo, 'scripts/g.mjs'), 'g'); g('add -A'); g('commit -qm "gate repair"');
    const head = String(g('rev-parse HEAD')).trim();

    // A stub `gh` that answers both API shapes the CLI asks for.
    const runsJson = JSON.stringify({ workflow_runs: [{ id: 99, run_number: 99, head_sha: published }] });
    const jobsJson = JSON.stringify({ jobs: [{ name: 'publish (dispatch the OTA for a validated trunk commit)', steps: [{ name: DISPATCH_STEP, conclusion: 'success' }] }] });
    fs.writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncase "$*" in\n  *"/jobs"*) cat <<'J'\n${jobsJson}\nJ\n  ;;\n  *) cat <<'R'\n${runsJson}\nR\n  ;;\nesac\n`, { mode: 0o755 });

    const out = execFileSync(process.execPath, [
      join(__dirname, '..', 'scripts/publication-anchor.cjs'),
      '--after', head, '--before', bundle, '--repo', repo, '--repository', 'o/r', '--head-run-id', '100',
    ], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: '' } });

    // The anchor was found, and the range was WIDENED past the push base to it.
    expect(out).toContain('run 99 dispatched a markerless publish');
    expect(out).toContain('the stranded-bundle case');
    expect(out).toContain(`from=${published}`);
    expect(out).toContain('publish=0');
    // And that is the whole point: app/x.ts is inside published..head but NOT
    // inside the old bundle..head range, so only the new anchor sees it.
    const widened = String(execSync(`git diff --name-only ${published}..${head}`, { cwd: repo })).trim().split('\n');
    const oldRange = String(execSync(`git diff --name-only ${bundle}..${head}`, { cwd: repo })).trim().split('\n');
    expect(bundleTouched(widened)).toBe(true);
    expect(bundleTouched(oldRange)).toBe(false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('the dispatch step is still gated on the filter, and the step name the anchor reads is the real one', () => {
    const dispatch = CI.jobs.publish!.steps.find((s) => (s.run ?? '').includes('gh workflow run'))!;
    expect(dispatch.if).toBe("steps.bundle.outputs.touched == '1'");
    expect(dispatch.name).toBe(DISPATCH_STEP);
  });
});
