// ⚠⚠⚠ FOUR SHARDS, ONE SURFACE, EVERY SUITE EXACTLY ONCE (2026-09-11, Change C).
//
// The required Jest gate was ~97% of the required-gate wall time: one runner
// grinding ~1,295 suites while four cheap gates finished in a minute. Change C
// deals that surface across FOUR required runners. It reduces nothing: the
// membership is the same, decided by the same live `jest --listTests` discovery
// the canonical `test:ci:fast` uses.
//
// The danger sharding introduces is not slowness — it is a QUIET gate. A suite
// that lands on no shard still reports green and nobody learns it stopped
// running; that is exactly how two live OTA regression suites sat red and
// unwatched for two hundred OTAs (scripts/heavy-suites.mjs). So the reconciler
// is the centre of this suite, and it is proven in both directions:
//
//     union(shard 1..4) == live discovery      (nothing lost)
//     shard i ∩ shard j == ∅                   (nothing run twice)
//     no shard is empty                        (drift is not success)
//
// ⚠⚠ LIVE DISCOVERY IS THE AUTHORITY; WEIGHTS ARE A HINT. suite-weights.json
// decides the ORDER of the deal, never the MEMBERSHIP. An unweighted new suite
// still runs (fallback weight); a weight for a deleted file is ignored and can
// never resurrect it; malformed weight data degrades to "everything weighs the
// same" — worse balance, identical coverage. Each of those is a test below.
//
// ⚠⚠⚠ AND CHANGE A STILL DECIDES PUBLICATION. All four shards are in
// .github/required-jobs.json and in publish.needs, as four LITERAL display
// names — not a matrix, whose static `name:` would give every leg the same
// display name and re-create the exact ambiguity the hardened receipt exists to
// refuse. Missing, skipped, cancelled, in-progress, failed, timed-out,
// duplicated or stale-attempt: any one of those on any one shard and nothing
// publishes. Those refusals live in ciReceiptNamesEveryGate and are exercised
// here against the real four-shard manifest.
//
// ⚠ Not an OTA — nothing here reaches a phone — so, like its siblings, this
// suite carries no OTA number and the stamp does not move.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// js-yaml ships no types here; the parser is the one the repo already carries.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { load } = require('js-yaml') as { load: (src: string) => unknown };

type Assign = { shards: string[][]; weight: number[]; fallback: number; unweighted: string[] };
type Shard = {
  assignShards: (suites: string[], weights?: Record<string, number>, k?: number) => Assign;
  reconcile: (suites: string[], shards: string[][]) => string[];
  loadWeights: (path?: string) => Record<string, number>;
  fallbackWeight: (w: Record<string, number>) => number;
  discover: () => string[];
  SHARD_COUNT: number;
  WEIGHTS_PATH: string;
};
// The real dealer, not a restatement. .cjs so jest loads it with no transform.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assignShards, reconcile, loadWeights, fallbackWeight, SHARD_COUNT, WEIGHTS_PATH } = require('../scripts/shard-suites.cjs') as Shard;

const root = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');
type Step = { name?: string; run?: string; uses?: string };
type Job = { name?: string; needs?: string[]; steps: Step[]; 'continue-on-error'?: boolean };
type Wf = { jobs: Record<string, Job> };
const CI_SRC = read('.github', 'workflows', 'ci.yml');
const CI = load(CI_SRC) as Wf;
const PKG = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
const MANIFEST = JSON.parse(read('.github', 'required-jobs.json')) as { required: string[] };
const WEIGHTS_DOC = JSON.parse(read('scripts', 'suite-weights.json')) as { weights: Record<string, number> };

const SHARD_NAMES = [1, 2, 3, 4].map((i) => `jest shard ${i}/4 (fast · required)`);
const SHARD_IDS = [1, 2, 3, 4].map((i) => `test-shard-${i}`);

/**
 * A believable surface, shaped like the real one: one dominant suite at ~8% of
 * total compute (ota1686TheContraryWalker is 140s of 1669s), a short heavy
 * shoulder, then a long flat body around the real ~160ms median. The shape
 * matters — a fixture where five suites carry 90% of the time cannot be
 * balanced by ANY dealer, and would test arithmetic rather than the algorithm.
 */
const fakeSuites = (n = 400) => Array.from({ length: n }, (_, i) => `__tests__/s${String(i).padStart(4, '0')}.test.ts`);
const fakeWeights = (suites: string[]) => Object.fromEntries(suites.map((p, i) => {
  if (i === 0) return [p, 140000];                 // the floor-setting suite
  if (i < 12) return [p, 90000 - i * 6000];        // the heavy shoulder
  return [p, 120 + (i % 300)];                     // the long flat body
}));

// ─────────────────────────────────────────────────────────────────────────
describe('1. the deal — deterministic LPT over live discovery', () => {
  const suites = fakeSuites();
  const weights = fakeWeights(suites);

  it('⚠⚠⚠ EVERY SUITE EXACTLY ONCE: union == input, pairwise intersection empty, no empty shard', () => {
    const { shards } = assignShards(suites, weights);
    expect(reconcile(suites, shards)).toEqual([]);
    expect(shards).toHaveLength(4);
    const union = shards.flat();
    expect(union).toHaveLength(suites.length);
    expect(new Set(union).size).toBe(suites.length);
    expect([...union].sort()).toEqual([...suites].sort());
    for (let i = 0; i < shards.length; i += 1) {
      for (let j = i + 1; j < shards.length; j += 1) {
        expect(shards[i]!.filter((p) => shards[j]!.includes(p))).toEqual([]);
      }
    }
    for (const s of shards) expect(s.length).toBeGreaterThan(0);
  });

  it('⚠⚠ DETERMINISTIC: same input, same output — ten times, and independent of input order', () => {
    const first = assignShards(suites, weights).shards;
    for (let i = 0; i < 10; i += 1) expect(assignShards(suites, weights).shards).toEqual(first);
    // Shuffled discovery order must not move a single suite.
    const shuffled = [...suites].sort((a, b) => (a > b ? -1 : 1));
    expect(assignShards(shuffled, weights).shards).toEqual(first);
  });

  it('C8 — ties are broken by PATH, not by arrival: equal weights still deal identically from any order', () => {
    const flat = Object.fromEntries(suites.map((p) => [p, 500]));
    const a = assignShards(suites, flat).shards;
    const b = assignShards([...suites].reverse(), flat).shards;
    expect(b).toEqual(a);
    // …and with no weights at all (everything on the fallback) it is still stable.
    expect(assignShards([...suites].reverse(), {}).shards).toEqual(assignShards(suites, {}).shards);
  });

  it('⚠ LPT actually balances, and beats the naive alternatives it replaced', () => {
    const { shards, weight } = assignShards(suites, weights);
    const spread = Math.max(...weight) - Math.min(...weight);
    expect(spread / Math.max(...weight)).toBeLessThan(0.10);
    // The heavy shoulder cannot pile onto one runner.
    const heavy = suites.slice(0, 12);
    const perShard = shards.map((s) => heavy.filter((h) => s.includes(h)).length);
    expect(Math.max(...perShard)).toBeLessThanOrEqual(5);
    // ⚠⚠ THE REASON LPT WAS CHOSEN. Path-contiguous slicing — what jest's own
    // `--shard` does — clusters alphabetically adjacent heavy suites; measured
    // at 51% imbalance on the real surface. LPT must be strictly better here.
    const contiguous = [0, 1, 2, 3].map((i) => suites.slice(i * 100, (i + 1) * 100));
    const cw = contiguous.map((s) => s.reduce((a, p) => a + weights[p]!, 0));
    expect(Math.max(...weight)).toBeLessThan(Math.max(...cw));
  });
});

describe('2. weights are a hint — discovery is the authority', () => {
  const suites = fakeSuites(120);
  const weights = fakeWeights(suites);

  it('C3 — a NEW live suite absent from the weights still runs, on exactly one shard', () => {
    const withNew = [...suites, '__tests__/ota9999BrandNew.test.ts'];
    const { shards, unweighted } = assignShards(withNew, weights);
    expect(unweighted).toEqual(['__tests__/ota9999BrandNew.test.ts']);
    expect(reconcile(withNew, shards)).toEqual([]);
    expect(shards.flat().filter((p) => p === '__tests__/ota9999BrandNew.test.ts')).toHaveLength(1);
  });

  it('C4 — a STALE weight for a deleted suite is ignored and cannot resurrect it', () => {
    const stale = { ...weights, '__tests__/deletedLastYear.test.ts': 99999 };
    const { shards } = assignShards(suites, stale);
    expect(shards.flat()).not.toContain('__tests__/deletedLastYear.test.ts');
    expect(reconcile(suites, shards)).toEqual([]);
  });

  it('C5 — a RENAMED suite follows discovery: the new path runs, the old name is a phantom', () => {
    const renamed = suites.map((p, i) => (i === 3 ? '__tests__/renamedNow.test.ts' : p));
    const { shards, unweighted } = assignShards(renamed, weights);
    expect(shards.flat()).toContain('__tests__/renamedNow.test.ts');
    expect(shards.flat()).not.toContain(suites[3]);
    expect(unweighted).toContain('__tests__/renamedNow.test.ts');
    expect(reconcile(renamed, shards)).toEqual([]);
  });

  it('C7 — MALFORMED weight data degrades to the fallback, never to lost coverage', () => {
    for (const bad of [{}, { a: 'x' } as unknown as Record<string, number>, { a: NaN }, { a: -5 }]) {
      const { shards } = assignShards(suites, bad as Record<string, number>);
      expect(reconcile(suites, shards)).toEqual([]);
      expect(shards.flat()).toHaveLength(suites.length);
    }
    // …and an unreadable/absent file is an empty hint, not a throw.
    expect(loadWeights(join(root, 'scripts', 'no-such-weights.json'))).toEqual({});
    expect(loadWeights(join(root, 'package.json'))).toEqual({}); // valid JSON, no `weights` key
  });

  it('⚠⚠ weights CANNOT SUPPRESS a live suite — even a zero weight is dealt', () => {
    const zeroed = Object.fromEntries(suites.map((p) => [p, 0]));
    const { shards } = assignShards(suites, zeroed);
    expect(reconcile(suites, shards)).toEqual([]);
    expect(new Set(shards.flat()).size).toBe(suites.length);
  });

  it('the fallback is the MEAN of known weights — defensive against a heavy newcomer', () => {
    expect(fallbackWeight({ a: 100, b: 300 })).toBe(200);
    expect(fallbackWeight({})).toBe(1);
  });
});

describe('3. the reconciler bites — these must all REPORT A PROBLEM', () => {
  const suites = fakeSuites(60);
  const good = () => assignShards(suites, fakeWeights(suites)).shards;

  it('C1 — one live suite omitted from every shard', () => {
    const s = good(); const dropped = s[2]!.splice(4, 1)[0]!;
    expect(reconcile(suites, s).join('\n')).toMatch(new RegExp(`1 live suite\\(s\\) in NO shard: ${dropped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });

  it('C2 — one suite assigned to two shards', () => {
    const s = good(); s[1]!.push(s[0]![0]!);
    expect(reconcile(suites, s).join('\n')).toMatch(/assigned to more than one shard/);
  });

  it('C6 — a shard that resolves zero suites is drift, not success', () => {
    const s = good(); s[0]!.push(...s[3]!.splice(0));
    expect(reconcile(suites, s).join('\n')).toMatch(/shard 4\/4 resolved ZERO suites/);
  });

  it('a phantom assignment — a path no longer live — is caught too', () => {
    const s = good(); s[0]!.push('__tests__/neverExisted.test.ts');
    expect(reconcile(suites, s).join('\n')).toMatch(/1 assigned suite\(s\) not live/);
  });

  it('the untouched deal reports nothing', () => {
    expect(reconcile(suites, good())).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('4. the real repository: four required jobs, one contract', () => {
  it('⚠⚠⚠ FOUR EXPLICIT JOBS WITH FOUR LITERAL DISPLAY NAMES — not a matrix', () => {
    for (let i = 0; i < 4; i += 1) {
      const job = CI.jobs[SHARD_IDS[i]!];
      expect({ id: SHARD_IDS[i], defined: Boolean(job) }).toEqual({ id: SHARD_IDS[i], defined: true });
      expect(job!.name).toBe(SHARD_NAMES[i]);
      expect(job!['continue-on-error']).toBeUndefined();
      // No matrix anywhere near them: a static `name:` under a matrix gives
      // every leg the SAME display name, which the receipt cannot disambiguate.
      expect(job as unknown as Record<string, unknown>).not.toHaveProperty('strategy');
    }
    expect(CI_SRC).not.toContain('strategy:');
    expect(CI_SRC).not.toContain('matrix:');
    // The retired single job is gone, by id and by name.
    expect(CI.jobs.test).toBeUndefined();
    expect(Object.values(CI.jobs).map((j) => j.name)).not.toContain('jest (fast · required)');
  });

  it('C9/C10 — the manifest and publish.needs name all four shards, and nothing that does not exist', () => {
    for (const n of SHARD_NAMES) expect(MANIFEST.required).toContain(n);
    for (const id of SHARD_IDS) expect(CI.jobs.publish!.needs).toContain(id);
    // Every manifest entry resolves to a real job; every gated job is named.
    const byName = Object.fromEntries(Object.entries(CI.jobs).map(([k, j]) => [j.name ?? k, k]));
    for (const n of MANIFEST.required) expect({ entry: n, job: byName[n] ?? null }).not.toEqual({ entry: n, job: null });
    const gated = (CI.jobs.publish!.needs ?? []).map((id) => CI.jobs[id]!.name ?? id).sort();
    expect([...MANIFEST.required].sort()).toEqual(gated);
  });

  it('C15 — all four display names are distinct, and distinct from every other job', () => {
    expect(new Set(SHARD_NAMES).size).toBe(4);
    const all = Object.entries(CI.jobs).map(([k, j]) => j.name ?? k);
    expect(new Set(all).size).toBe(all.length);
  });

  it('⚠⚠ each shard job runs its own shard, and only its own', () => {
    for (let i = 0; i < 4; i += 1) {
      const runs = CI.jobs[SHARD_IDS[i]!]!.steps.map((s) => s.run ?? '').join('\n');
      expect(runs).toContain(`npm run test:ci:fast:shard -- ${i + 1}`);
      for (const other of [1, 2, 3, 4].filter((n) => n !== i + 1)) {
        expect(runs).not.toContain(`test:ci:fast:shard -- ${other}`);
      }
    }
    expect(PKG.scripts['test:ci:fast:shard']).toBe('node scripts/shard-suites.cjs --run');
  });

  it('C18 — the CANONICAL UNSHARDED AUTHORITY survives, unaltered and complete', () => {
    expect(PKG.scripts['test:ci:fast']).toBe('jest --ci --testPathIgnorePatterns /node_modules/ "$(node scripts/heavy-suites.mjs --pattern)"');
    expect(PKG.scripts['test:ci:fast']).not.toContain('shard');
    expect(PKG.scripts['test:ci:fast']).not.toContain('runTestsByPath');
    // …and the composite still runs the whole surface plus heavy.
    expect(PKG.scripts['test:ci']).toBe('npm run test:ci:fast && npm run test:ci:heavy');
  });

  it('⚠⚠ the coverage gate is a check:* script and runs in the required gates job', () => {
    expect(PKG.scripts['check:shardcoverage']).toBe('node scripts/check-shard-coverage.mjs');
    expect(CI.jobs.gates!.steps.map((s) => s.run ?? '')).toContain('npm run check:shardcoverage');
    expect(CI.jobs.publish!.needs).toContain('gates');
  });

  it('C17 — HEAVY STAYS REPORTED: not in the manifest, not in needs, still continue-on-error, still its own job', () => {
    expect(CI.jobs['test-heavy']!['continue-on-error']).toBe(true);
    expect(CI.jobs.publish!.needs).not.toContain('test-heavy');
    expect(MANIFEST.required).not.toContain('jest (heavy sims · reported)');
    expect(CI.jobs['test-heavy']!.steps.map((s) => s.run ?? '').join('\n')).toContain('npm run test:ci:heavy');
    // No shard job may run heavy, and the heavy job may run no shard.
    for (const id of SHARD_IDS) expect(CI.jobs[id]!.steps.map((s) => s.run ?? '').join('\n')).not.toContain('test:ci:heavy');
    expect(CI.jobs['test-heavy']!.steps.map((s) => s.run ?? '').join('\n')).not.toContain('fast:shard');
  });

  it('⚠ the committed weight file is a hint with a shape, and every weight is a sane number', () => {
    const w = loadWeights(WEIGHTS_PATH);
    expect(Object.keys(w).length).toBeGreaterThan(1000);
    expect(Object.keys(w)).toEqual(Object.keys(WEIGHTS_DOC.weights));
    for (const [p, ms] of Object.entries(w)) {
      expect({ p, ok: typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 }).toEqual({ p, ok: true });
      expect({ p, inTests: p.startsWith('__tests__/') }).toEqual({ p, inTests: true });
    }
    // A hint, not a census: it may not name a heavy suite as if it were required.
    expect(Object.keys(w)).not.toContain('__tests__/combatStress.test.ts');
    expect(SHARD_COUNT).toBe(4);
  });
});
