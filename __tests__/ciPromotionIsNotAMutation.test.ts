// ⚠⚠⚠ PROMOTION IS NOT A MUTATION (2026-09-11, Change B).
//
// Promoting a game-source SHA to HAL must not touch that SHA, must not move
// `golem-line`, and must not invent a commit to make the machinery notice. The
// request is a record on the persistent control-plane branch `promotions`;
// promote.yml proves INTENT and IDENTITY (canonical record, same SHA in name
// and body, never seen before, ancestor of origin/golem-line, carries the
// Change-A contract) and dispatches the EXISTING publisher for that exact SHA
// with line=hal. The publisher — not this workflow — decides whether the SHA
// earned publication, by Change A's receipt, read from the SHA's own checkout.
//
// Why a branch and not a tag: measured 2026-09-11, the release agent's
// credential can create and advance refs/heads/* but cannot write refs/tags/*,
// delete any ref, or call the GitHub REST/Actions API. A persistent append-only
// branch is the one ledger those permissions can drive.
//
// This suite holds four things:
//   1. the decision (scripts/promote-hal.cjs) refuses every way a request can be
//      wrong — NC-B1..B15 — and is inert on bootstrap and on doc-only pushes;
//   2. promote.yml is wired exactly as designed: promotions-only trigger, least
//      permissions, exact-SHA + line=hal dispatch, NO validated_by (Change A's
//      receipt runs in the publisher), no source mutation of any kind;
//   3. ci.yml excludes exactly `promotions` and nothing else — the exclusion is
//      pinned so it can never widen into a CI bypass;
//   4. the [ota-hal] marker path is byte-for-byte intact.
//
// ⚠ Not an OTA — nothing here reaches a phone — so, like its siblings, this suite
// carries no OTA number and the stamp does not move.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// js-yaml ships no types here; the parser is the one the repo already carries.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { load } = require('js-yaml') as { load: (src: string) => unknown };

type Change = { status: string; path: string };
type Params = {
  before: string; after: string; forced: boolean; changes: Change[];
  readRecord: (p: string) => string; priorAdditions: (p: string) => number;
  isTrunkAncestor: (sha: string) => boolean; shaHasFile: (sha: string, f: string) => boolean;
};
type Result = { ok: boolean; action: 'inert' | 'dispatch' | 'refuse'; sha: string | null; record: string | null; reasons: string[] };
// The real decision, not a restatement. .cjs so jest loads it with no transform.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { evaluatePromotion, recordPathFor, ZERO_SHA, CONTRACT_FILES } = require('../scripts/promote-hal.cjs') as {
  evaluatePromotion: (p: Params) => Result; recordPathFor: (s: string) => string; ZERO_SHA: string; CONTRACT_FILES: string[];
};

const root = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
type Step = { name?: string; run?: string; uses?: string; if?: string; with?: Record<string, unknown> };
type Job = { name?: string; if?: string; needs?: string[]; steps: Step[]; permissions?: Record<string, string> };
type Wf = { on: Record<string, unknown>; permissions?: Record<string, string>; jobs: Record<string, Job> };
const parse = (src: string): Wf => { const d = load(src) as Record<string, unknown>; return { ...(d as object), on: (d.on ?? d.true) as Record<string, unknown> } as Wf; };
const PROMO_SRC = read('.github', 'workflows', 'promote.yml');
const CI_SRC = read('.github', 'workflows', 'ci.yml');
const PUB_SRC = read('.github', 'workflows', 'eas-update-golem.yml');
const PROMO = parse(PROMO_SRC);
const CI = parse(CI_SRC);
const PUB = parse(PUB_SRC);

const SHA = '3c1bcea9ff68078e2de2ae1e7d6b4b8e85912abb';
const OTHER = '257b583ed18ceaf6e363db91f3d7aa1995a0eee4';
const REC = recordPathFor(SHA);
const record = (over: Record<string, unknown> = {}) => JSON.stringify({ target: 'hal', sha: SHA, requested_by: 'kevin', reason: 'test', ...over });

/** A well-formed push: one never-seen canonical record, on-trunk, post-Change-A. */
const good = (over: Partial<Params> = {}): Params => ({
  before: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', after: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', forced: false,
  changes: [{ status: 'A', path: REC }],
  readRecord: () => record(),
  priorAdditions: () => 0,
  isTrunkAncestor: (s) => s === SHA,
  shaHasFile: () => true,
  ...over,
});
const refuses = (r: Result, re: RegExp) => { expect(r.action).toBe('refuse'); expect(r.ok).toBe(false); expect(r.reasons.join('\n')).toMatch(re); };

// ─────────────────────────────────────────────────────────────────────────
describe('1. the decision — positive and inert paths', () => {
  it('PC-B1 — one never-seen canonical record for an on-trunk post-Change-A SHA → DISPATCH that exact SHA', () => {
    const r = evaluatePromotion(good());
    expect(r).toMatchObject({ ok: true, action: 'dispatch', sha: SHA, record: REC });
  });

  it('PC-B2 — BOOTSTRAP IS INERT: branch creation (before = 0000…) dispatches nothing', () => {
    const r = evaluatePromotion(good({ before: ZERO_SHA, changes: [{ status: 'A', path: 'README.md' }, { status: 'A', path: '.github/workflows/promote.yml' }] }));
    expect(r).toMatchObject({ ok: true, action: 'inert', sha: null });
  });

  it('PC-B3 — a control-plane doc edit with no record added is inert, not a promotion', () => {
    const r = evaluatePromotion(good({ changes: [{ status: 'M', path: 'README.md' }, { status: 'A', path: 'promotions/README.md' }] }));
    expect(r).toMatchObject({ ok: true, action: 'inert' });
  });

  it('the canonical record path is the ONE spelling for a SHA', () => {
    expect(recordPathFor(SHA)).toBe(`promotions/promote-hal-${SHA}.json`);
    expect(CONTRACT_FILES).toEqual(['scripts/verify-ci-receipt.cjs', '.github/required-jobs.json']);
  });
});

describe('1. the decision — negative controls (every one must REFUSE)', () => {
  it('NC-B1 — malformed ledger record (not JSON / not an object)', () => {
    refuses(evaluatePromotion(good({ readRecord: () => '{ not json' })), /not valid JSON/);
    refuses(evaluatePromotion(good({ readRecord: () => '[1,2]' })), /must be a JSON object/);
  });

  it('NC-B2 — malformed filename inside promotions/ (wrong prefix, uppercase, extra segment)', () => {
    for (const bad of ['promotions/promote-HAL-' + SHA + '.json', 'promotions/promote-hal-' + SHA.toUpperCase() + '.json', 'promotions/hal-' + SHA + '.json', 'promotions/promote-hal-' + SHA + '-again.json']) {
      refuses(evaluatePromotion(good({ changes: [{ status: 'A', path: bad }] })), /not a canonical record name/);
    }
  });

  it('NC-B3 — short SHA in the filename', () => {
    refuses(evaluatePromotion(good({ changes: [{ status: 'A', path: 'promotions/promote-hal-3c1bcea9.json' }] })), /not a canonical record name/);
  });

  it('NC-B4 — filename SHA ≠ record SHA (a record may not disagree with its own name)', () => {
    refuses(evaluatePromotion(good({ readRecord: () => record({ sha: OTHER }) })), /names sha .* but its filename names/);
    refuses(evaluatePromotion(good({ readRecord: () => record({ sha: SHA.toUpperCase() }) })), /but its filename names/);
    refuses(evaluatePromotion(good({ readRecord: () => JSON.stringify({ target: 'hal' }) })), /names sha undefined/);
  });

  it('NC-B5 — off-trunk SHA: not an ancestor of origin/golem-line', () => {
    refuses(evaluatePromotion(good({ isTrunkAncestor: () => false })), /not a commit on origin\/golem-line/);
  });

  it('NC-B6 — non-HAL target (golem, or missing)', () => {
    refuses(evaluatePromotion(good({ readRecord: () => record({ target: 'golem' }) })), /target is "golem", not "hal"/);
    refuses(evaluatePromotion(good({ readRecord: () => JSON.stringify({ sha: SHA }) })), /target is undefined, not "hal"/);
  });

  it('NC-B7 — REPLAY: the record was added before in the ledger\'s history (deleted and re-added, or re-pushed)', () => {
    refuses(evaluatePromotion(good({ priorAdditions: () => 1 })), /already added 1 time\(s\) .* REPLAY refused/);
    refuses(evaluatePromotion(good({ priorAdditions: () => 3 })), /already added 3 time\(s\)/);
  });

  it('NC-B7b — REPLAY by edit or delete: the ledger is append-only', () => {
    refuses(evaluatePromotion(good({ changes: [{ status: 'M', path: REC }] })), /was modified — the ledger is append-only/);
    refuses(evaluatePromotion(good({ changes: [{ status: 'D', path: REC }] })), /was deleted — the ledger is append-only/);
    refuses(evaluatePromotion(good({ changes: [{ status: 'A', path: REC }, { status: 'D', path: recordPathFor(OTHER) }] })), /append-only/);
  });

  it('NC-B8 — a force-push to the control plane', () => {
    refuses(evaluatePromotion(good({ forced: true })), /force-push .* fast-forward only/);
  });

  it('NC-B9 — pre-Change-A SHA: missing the contract files cannot be promoted (the ledger grants no exception)', () => {
    refuses(evaluatePromotion(good({ shaHasFile: (_s, f) => f !== 'scripts/verify-ci-receipt.cjs' })), /predates the hardened publication contract \(missing scripts\/verify-ci-receipt\.cjs\)/);
    refuses(evaluatePromotion(good({ shaHasFile: () => false })), /missing scripts\/verify-ci-receipt\.cjs, \.github\/required-jobs\.json/);
  });

  it('NC-B15 — two records in one push is ambiguous', () => {
    refuses(evaluatePromotion(good({ changes: [{ status: 'A', path: REC }, { status: 'A', path: recordPathFor(OTHER) }] })), /2 ledger records added in one push .* one promotion per push/);
  });

  it('NC-B16 — bootstrap that smuggles a record is refused, not promoted', () => {
    refuses(evaluatePromotion(good({ before: ZERO_SHA })), /branch creation carries 1 ledger record/);
  });

  it('the order of checks is safe: an off-trunk replay is refused as a replay before ancestry is even consulted', () => {
    let asked = false;
    const r = evaluatePromotion(good({ priorAdditions: () => 1, isTrunkAncestor: () => { asked = true; return false; } }));
    expect(r.action).toBe('refuse');
    expect(asked).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('2. promote.yml — wired exactly as designed', () => {
  const job = PROMO.jobs.promote!;
  const steps = job.steps;
  const decide = steps.find((s) => s.name === 'Decide — intent, identity, ancestry, replay')!;
  const dispatch = steps.find((s) => (s.name ?? '').startsWith('Dispatch the publisher'))!;

  it('⚠⚠⚠ it triggers ONLY on the promotions branch, and the job guards the ref again', () => {
    expect(Object.keys(PROMO.on)).toEqual(['push']);
    expect((PROMO.on.push as { branches: string[] }).branches).toEqual(['promotions']);
    expect(PROMO.on.push as object).not.toHaveProperty('tags');
    expect(PROMO.on).not.toHaveProperty('workflow_dispatch');
    expect(job.if).toBe("github.ref == 'refs/heads/promotions'");
  });

  it('NC-B10 — least permissions: contents read, actions write, nothing else, and NO job-level widening', () => {
    expect(PROMO.permissions).toEqual({ contents: 'read', actions: 'write' });
    expect(job.permissions).toBeUndefined();
    expect(Object.keys(PROMO.jobs)).toEqual(['promote']);
  });

  it('⚠⚠ it dispatches the EXISTING publisher for the EXACT SHA with line=hal and NO validated_by — the publisher runs Change A\'s receipt itself', () => {
    expect(dispatch).toBeDefined();
    expect(dispatch.if).toBe("steps.decide.outputs.sha != ''");
    expect(dispatch.run).toContain('gh workflow run eas-update-golem.yml --ref golem-line');
    expect(dispatch.run).toContain('-f sha="$SHA"');
    expect(dispatch.run).toContain('-f line=hal');
    expect(dispatch.run).not.toContain('validated_by');
    expect(dispatch.run).not.toContain('line=golem');
    // the SHA comes from the decision step's output, nowhere else
    expect((dispatch as Step & { env: Record<string, string> }).env.SHA).toBe('${{ steps.decide.outputs.sha }}');
    expect((dispatch as Step & { env: Record<string, string> }).env.GH_TOKEN).toBe('${{ github.token }}');
  });

  it('⚠⚠ the decision is trunk logic run against the ledger — before/after/forced from the event, script from golem-line', () => {
    expect(decide.run).toContain('node trunk/scripts/promote-hal.cjs');
    expect(decide.run).toContain('--before "$BEFORE" --after "$AFTER" --forced "${FORCED:-false}"');
    expect(decide.run).toContain('--ledger ledger --trunk trunk');
    const env = (decide as Step & { env: Record<string, string> }).env;
    expect(env.BEFORE).toBe('${{ github.event.before }}');
    expect(env.AFTER).toBe('${{ github.sha }}');
    expect(env.FORCED).toBe('${{ github.event.forced }}');
    const trunk = steps.find((s) => s.uses?.startsWith('actions/checkout') && (s.with as { ref: string }).ref === 'golem-line')!;
    expect(trunk.with).toMatchObject({ ref: 'golem-line', 'fetch-depth': 0, path: 'trunk' });
    const ledger = steps.find((s) => s.uses?.startsWith('actions/checkout') && (s.with as { ref: string }).ref === 'promotions')!;
    expect(ledger.with).toMatchObject({ ref: 'promotions', 'fetch-depth': 0, path: 'ledger' });
  });

  it('⚠ the executing copy must equal the trunk\'s canonical copy, before anything is decided', () => {
    const names = steps.map((s) => s.name ?? s.uses ?? '');
    const cmp = names.findIndex((n) => n === "The executing workflow must equal the trunk's canonical copy");
    const dec = names.findIndex((n) => n === 'Decide — intent, identity, ancestry, replay');
    expect(cmp).toBeGreaterThan(0);
    expect(cmp).toBeLessThan(dec);
    expect(steps[cmp]!.run).toContain('cmp -s ledger/.github/workflows/promote.yml trunk/.github/workflows/promote.yml');
  });

  // ⚠ These two scan what EXECUTES — every step's `run` and `uses` — not the
  // file's comments, which rightly describe what the workflow does not do.
  const executable = steps.map((s) => [s.run ?? '', s.uses ?? '', s.if ?? ''].join('\n')).join('\n');

  it('NC-B8/B9 — NO SOURCE MUTATION: no commit, push, merge, cherry-pick, marker, or write to golem-line in any executable step', () => {
    for (const forbidden of ['git commit', 'git push', 'git merge', 'git cherry-pick', 'git rebase', 'git tag', '[ota-hal]', 'push origin golem-line', 'git checkout -b', 'eas update', 'expo export']) {
      expect({ forbidden, present: executable.includes(forbidden) }).toEqual({ forbidden, present: false });
    }
    // and no step may `uses` anything that writes to the repo
    for (const s of steps) if (s.uses) expect(s.uses).toMatch(/^actions\/checkout@/);
    expect(steps.filter((s) => s.uses).length).toBe(2);
  });

  it('NC-B14 — it cannot bypass Change A: no executable step reads a CI run, names the manifest, calls the verifier, or passes validated_by', () => {
    expect(executable).not.toContain('verify-ci-receipt');
    expect(executable).not.toContain('required-jobs.json');
    expect(executable).not.toContain('actions/runs/');
    expect(executable).not.toContain('validated_by');
    // …and the publisher it dispatches still verifies, on its manual path, at the exact SHA
    const receipt = PUB.jobs.ota!.steps.find((s) => s.name === 'Require a green CI run for this commit')!.run!;
    expect(receipt).toContain('node scripts/verify-ci-receipt.cjs');
    expect(receipt).toContain('select(.path == ".github/workflows/ci.yml")');
    const co = PUB.jobs.ota!.steps.find((s) => s.uses?.startsWith('actions/checkout'))! as Step & { with: { ref: string } };
    expect(co.with.ref).toBe('${{ github.event.inputs.sha || github.sha }}');
  });

  it('NC-B11-adjacent — the promotion namespace can never collide with a native-build tag pattern (no tags at all)', () => {
    expect(PROMO_SRC).not.toMatch(/^\s+tags:/m);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('3. ci.yml — the exclusion is exactly `promotions`, and cannot widen', () => {
  const branches = (CI.on.push as { branches: string[] }).branches;

  it('NC-B11 — promotions is excluded from normal CI', () => {
    expect(branches).toContain('!promotions');
  });

  it('NC-B12 — ordinary source branches keep normal CI: the list is EXACTLY ["**", "!promotions"] — one wildcard, one exclusion, nothing else', () => {
    expect(branches).toEqual(['**', '!promotions']);
    expect(branches.filter((b) => b.startsWith('!'))).toEqual(['!promotions']);
    expect(branches.filter((b) => !b.startsWith('!'))).toEqual(['**']);
  });

  it('the rest of ci.yml\'s triggers and the trunk-only publish guard are unchanged', () => {
    expect(Object.keys(CI.on).sort()).toEqual(['pull_request', 'push', 'workflow_dispatch']);
    expect(CI.on.push as object).not.toHaveProperty('tags');
    expect(CI.on.push as object).not.toHaveProperty('paths-ignore');
    expect(CI.jobs.publish!.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/golem-line'");
    expect([...(CI.jobs.publish!.needs ?? [])].sort()).toEqual(['gates', 'lint', 'test', 'typecheck-source', 'typecheck-tests']);
  });

  it('no other workflow adopts the promotions branch as a source branch', () => {
    // promote.yml is the only file allowed to name it as a trigger.
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const dir = join(root, '.github', 'workflows');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.yml') && n !== 'promote.yml')) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect({ file: f, triggersOnPromotions: /^\s+-\s+'?promotions'?\s*$/m.test(src) }).toEqual({ file: f, triggersOnPromotions: false });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('4. [ota-hal] is untouched — the fresh-source path still works exactly as before', () => {
  it('NC-B13 — the publisher still resolves the line from the commit TITLE and still refuses an unattended non-golem run', () => {
    const resolve = PUB.jobs.ota!.steps.find((s) => s.name === 'Resolve which product line this run publishes')!.run!;
    expect(resolve).toContain('if [ -z "$VALIDATED_BY" ] && [ -n "$DISPATCHED" ]; then');
    expect(resolve).toContain("elif echo \"${COMMIT_MSG:-}\" | head -1 | grep -q '\\[ota-hal\\]'; then");
    expect(resolve).toContain('LINE="hal"');
    expect(resolve).toContain('HOW="default (automatic push)"');
    expect(PUB_SRC).toContain('an unselected (automatic) run may only target golem');
    // and a dispatch that names a line — what promote.yml does — takes the dispatch branch, not the marker branch
    expect(resolve).toContain('LINE="$DISPATCHED"');
    expect(resolve).toContain('HOW="dispatch"');
  });

  it('the HAL target table the promotion lands on is the same one [ota-hal] lands on', () => {
    expect(PUB_SRC).toContain('TARGETS="hal2001:android:false hal2001:ios:true preview:ios:true"');
    expect(PUB_SRC).toContain('TARGETS="golem-line:android:false"');
  });
});
