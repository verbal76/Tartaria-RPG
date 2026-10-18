// ⚠⚠ SINGLE SOURCE OF TRUTH — the policy is a test, not a paragraph.
//
// Owner directive 2026-10-12 (CLAUDE.md "Single source of truth", docs/SOURCE-OF-TRUTH.md):
// golem-line is the one authoritative codebase; platforms are build targets; branches are
// temporary workspaces; every branch is accounted for in a ledger; every build records
// exactly what it compiled; a coordinated release is one SHA.
//
// CATEGORY LOCK: the workflow section scans EVERY .github/workflows/build-*.yml found on
// disk, so a build workflow added tomorrow without the guard fails here — not just the
// seven that exist today.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const guard = require('../scripts/assert-authoritative-source.cjs') as {
  decide: (i: Record<string, unknown>) => { ok: boolean; integration: string; reason: string };
  relationViaApi: (i: Record<string, unknown>) => Promise<string>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const prov = require('../scripts/build-provenance.cjs') as {
  buildProvenance: (i: Record<string, unknown>) => any;
  readBuildInfo: (s: string) => { displayVersion: string | null; otaBuildId: string | null };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const manifest = require('../scripts/release-manifest.cjs') as {
  verifyParity: (l: any[], o?: Record<string, unknown>) => string[];
  buildManifest: (l: any[]) => any;
};

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('SSOT — the authoritative-source decision', () => {
  const base = { sha: A, event: 'workflow_dispatch', ref: 'refs/heads/claude/topic', approvedSha: '' };

  it('allows the tip of the trunk and any ancestor of it', () => {
    expect(guard.decide({ ...base, relation: 'identical' })).toMatchObject({ ok: true, integration: 'integrated' });
    expect(guard.decide({ ...base, relation: 'behind' })).toMatchObject({ ok: true, integration: 'integrated' });
  });

  it('refuses a commit that has work the trunk does not (ahead or diverged)', () => {
    for (const relation of ['ahead', 'diverged']) {
      const d = guard.decide({ ...base, relation });
      expect(d.ok).toBe(false);
      expect(d.reason).toContain(`approved_source_sha set to exactly ${A}`);
    }
  });

  it('fails CLOSED when the relation cannot be established', () => {
    expect(guard.decide({ ...base, relation: 'unknown' }).ok).toBe(false);
  });

  it('lets a plain push to golem-line through even if the lookup failed (the ref IS the trunk)', () => {
    expect(guard.decide({ ...base, event: 'push', ref: 'refs/heads/golem-line', relation: 'unknown' }).ok).toBe(true);
  });

  it('does NOT let a push to any other branch ride on that exception', () => {
    expect(guard.decide({ ...base, event: 'push', ref: 'refs/heads/main', relation: 'diverged' }).ok).toBe(false);
    expect(guard.decide({ ...base, event: 'push', ref: 'refs/heads/HaL2001', relation: 'ahead' }).ok).toBe(false);
  });

  it('accepts an unintegrated candidate ONLY when approved by its exact full SHA, and labels it', () => {
    expect(guard.decide({ ...base, relation: 'ahead', approvedSha: A })).toMatchObject({ ok: true, integration: 'approved-unintegrated' });
    expect(guard.decide({ ...base, relation: 'ahead', approvedSha: B }).ok).toBe(false);
    expect(guard.decide({ ...base, relation: 'ahead', approvedSha: A.slice(0, 12) }).ok).toBe(false);
  });

  it('refuses anything that is not a full 40-hex SHA', () => {
    expect(guard.decide({ ...base, sha: 'abc123', relation: 'identical' }).ok).toBe(false);
    expect(guard.decide({ ...base, sha: '', relation: 'identical' }).ok).toBe(false);
  });

  it('reads the relation from the GitHub compare API as trunk...sha, and degrades to unknown', async () => {
    const calls: string[] = [];
    const ok = async (url: string) => { calls.push(url); return { ok: true, json: async () => ({ status: 'behind' }) }; };
    await expect(guard.relationViaApi({ repo: 'o/r', token: 't', sha: A, fetchImpl: ok })).resolves.toBe('behind');
    expect(calls[0]).toContain('/repos/o/r/compare/golem-line...' + A);
    const bad = async () => ({ ok: false, json: async () => ({}) });
    await expect(guard.relationViaApi({ repo: 'o/r', token: 't', sha: A, fetchImpl: bad })).resolves.toBe('unknown');
    const boom = async () => { throw new Error('net'); };
    await expect(guard.relationViaApi({ repo: 'o/r', token: 't', sha: A, fetchImpl: boom })).resolves.toBe('unknown');
    await expect(guard.relationViaApi({ repo: '', token: '', sha: A })).resolves.toBe('unknown');
  });

  it('the CLI exits non-zero for a refused source and zero for an integrated one', () => {
    const run = (relation: string, extra: Record<string, string> = {}) => {
      try {
        execFileSync('node', ['scripts/assert-authoritative-source.cjs', '--sha', A, '--relation', relation], {
          cwd: ROOT, stdio: 'pipe',
          env: { PATH: process.env.PATH ?? '', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/claude/x', ...extra } as unknown as NodeJS.ProcessEnv,
        });
        return 0;
      } catch (e) { return (e as { status: number }).status; }
    };
    expect(run('behind')).toBe(0);
    expect(run('diverged')).toBe(1);
    expect(run('diverged', { APPROVED_SOURCE_SHA: A })).toBe(0);
  });
});

describe('SSOT — every build workflow guards its source (category lock)', () => {
  const dir = join(ROOT, '.github/workflows');
  const builds = readdirSync(dir).filter((f) => /^build-.*\.yml$/.test(f));

  it('finds the build workflows it is supposed to police', () => {
    // A rename that dodged the glob would silently weaken the lock.
    expect(builds.length).toBeGreaterThanOrEqual(7);
  });

  it.each(builds)('%s: guard immediately after checkout, provenance uploaded, approval input declared', (f) => {
    const src = readFileSync(join(dir, f), 'utf8');
    const co = src.indexOf('uses: actions/checkout@v4');
    const guardAt = src.indexOf('node scripts/assert-authoritative-source.cjs');
    const provAt = src.indexOf('node scripts/build-provenance.cjs');
    const upAt = src.indexOf('name: build-provenance-');
    expect(co).toBeGreaterThan(-1);
    // checkout < guard < provenance < upload, with no other `uses:` step in between
    expect(guardAt).toBeGreaterThan(co);
    expect(provAt).toBeGreaterThan(guardAt);
    expect(upAt).toBeGreaterThan(provAt);
    const stepAt = src.indexOf('- name: Assert authoritative source');
    expect(stepAt).toBeGreaterThan(co);
    expect(stepAt).toBeLessThan(guardAt);
    const between = src.slice(co + 'uses: actions/checkout@v4'.length, stepAt);
    expect(between).not.toMatch(/^\s*uses:/m);
    expect(between).not.toMatch(/^\s*run:/m);
    expect(src).toMatch(/approved_source_sha:/);
    expect(src).toContain('APPROVED_SOURCE_SHA: ${{ github.event.inputs.approved_source_sha }}');
    expect(src).toMatch(/--integration "\$SOURCE_INTEGRATION"/);
  });

  it('exactly one checkout per build workflow (a second, unguarded checkout would defeat the guard)', () => {
    for (const f of builds) expect(readFileSync(join(dir, f), 'utf8').split('uses: actions/checkout@').length - 1).toBe(1);
  });

  it('the guard never builds, publishes or deploys anything (no eas / gh release / npm publish)', () => {
    for (const p of ['scripts/assert-authoritative-source.cjs', 'scripts/build-provenance.cjs', 'scripts/release-manifest.cjs']) {
      const code = read(p).split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
      expect(code).not.toMatch(/eas (build|update|submit)|gh release|npm publish|workflow_dispatch/);
    }
  });
});

describe('SSOT — build provenance', () => {
  const env = {
    GITHUB_SHA: A, GITHUB_REF: 'refs/heads/golem-line', GITHUB_REF_TYPE: 'branch', GITHUB_REF_NAME: 'golem-line',
    GITHUB_REPOSITORY: 'o/r', GITHUB_WORKFLOW: 'Build APK', GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '1',
    RUNNER_OS: 'Linux', TARTARIA_LINE: 'golem',
  };
  const readers = {
    json: (p: string) => (p === 'app.json' ? { expo: { version: '2.5.0', runtimeVersion: { policy: 'appVersion' } } } : { version: 283 }),
    buildInfo: () => "// export const OTA_BUILD_ID = 'old';\nexport const DISPLAY_VERSION = '4.32.11';\nexport const OTA_BUILD_ID = 'new-stamp';\n",
    run: () => 'x',
  };

  it('records commit, ref, integration, versions, platform, line, profile, timestamp and toolchain', () => {
    const p = prov.buildProvenance({ env, args: { platform: 'android', profile: 'preview', integration: 'integrated' }, now: new Date('2026-10-12T00:00:00Z'), readers });
    expect(p.source).toMatchObject({ sha: A, ref: 'refs/heads/golem-line', authoritativeBranch: 'golem-line', integration: 'integrated' });
    expect(p.target).toMatchObject({ platform: 'android', line: 'golem', profile: 'preview' });
    expect(p.versions).toMatchObject({ appVersion: '2.5.0', displayVersion: '4.32.11', otaBuildId: 'new-stamp', publicVersion: 283 });
    expect(p.versions.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(p.builtAt).toBe('2026-10-12T00:00:00.000Z');
    expect(p.toolchain.node).toBe(process.version);
    expect(p.ci).toMatchObject({ runId: '42', workflow: 'Build APK' });
  });

  it('a build the guard never vouched for is stamped "unverified", never "integrated"', () => {
    expect(prov.buildProvenance({ env, args: { platform: 'web' }, readers }).source.integration).toBe('unverified');
  });

  it('ignores commented-out stamp lines and reads the live ones from the real buildInfo.ts', () => {
    const live = prov.readBuildInfo(read('app/buildInfo.ts'));
    expect(live.displayVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(live.otaBuildId).toMatch(/^\d{4}-\d{2}-\d{2}-\d+-/);
  });
});

describe('SSOT — a coordinated release is one SHA', () => {
  const mk = (platform: string, sha = A, integration = 'integrated', otaBuildId = 's') => ({
    source: { sha, integration, authoritativeBranch: 'golem-line' },
    target: { platform, line: 'golem', profile: 'p', artifact: null },
    versions: { displayVersion: '4.32.11', otaBuildId },
    builtAt: 't', ci: { runId: '1', workflow: 'w' },
  });

  it('passes when every platform compiled the same integrated commit', () => {
    expect(manifest.verifyParity([mk('android'), mk('ios'), mk('windows')])).toEqual([]);
    const m = manifest.buildManifest([mk('android'), mk('windows')]);
    expect(m.sha).toBe(A);
    expect(m.builds.map((b: any) => b.platform)).toEqual(['android', 'windows']);
  });

  it('names the platform whose SHA, stamp or integration breaks parity', () => {
    expect(manifest.verifyParity([mk('android'), mk('ios', B)])[0]).toMatch(/ios\/golem: built b+, expected a+/);
    expect(manifest.verifyParity([mk('android'), mk('web', A, 'integrated', 'other')])[0]).toMatch(/web\/golem: otaBuildId/);
    expect(manifest.verifyParity([mk('android'), mk('mac', A, 'approved-unintegrated')])[0]).toMatch(/mac\/golem: integration/);
    expect(manifest.verifyParity([mk('android'), mk('mac', A, 'approved-unintegrated')], { allowUnintegrated: true })).toEqual([]);
  });

  it('refuses an empty release', () => {
    expect(manifest.verifyParity([]).length).toBeGreaterThan(0);
  });
});

describe('SSOT — the branch / recovery ledger', () => {
  const ledgerCli = (file: string, md?: string) => {
    try {
      execFileSync('node', ['scripts/branch-ledger.mjs', '--file', file, ...(md ? ['--md', md] : [])], { cwd: ROOT, stdio: 'pipe' });
      return { code: 0, err: '' };
    } catch (e) {
      const x = e as { status: number; stderr: Buffer };
      return { code: x.status, err: x.stderr.toString() };
    }
  };
  const doc = () => JSON.parse(read('docs/branch-ledger.json'));
  const tmp = mkdtempSync(join(tmpdir(), 'ledger-'));
  const write = (name: string, d: unknown) => { const f = join(tmp, name); writeFileSync(f, JSON.stringify(d)); return f; };

  it('the committed ledger validates and its rendered view is in sync (what check:branchledger runs)', () => {
    expect(ledgerCli(join(ROOT, 'docs/branch-ledger.json'))).toEqual({ code: 0, err: '' });
  });

  it('ledgers the authoritative line exactly once and classifies every branch', () => {
    const d = doc();
    expect(d.branches.filter((b: any) => b.role === 'authoritative').map((b: any) => b.branch)).toEqual(['golem-line']);
    for (const b of d.branches) expect(Object.keys(d.classifications)).toContain(b.classification);
    // everything not provably integrated or superseded is an explicit owner decision, not silent
    for (const b of d.branches.filter((x: any) => x.classification === 'unknown_owner_review')) expect(b.ownerReview).toBe(true);
  });

  it('records the recovery it performed, and the recovered files really exist', () => {
    const rec = doc().branches.find((b: any) => b.recovery?.status === 'recovered');
    expect(rec.branch).toBe('claude/hello-iteration-8-yctnkj');
    expect(readdirSync(join(ROOT, rec.recovery.into)).length).toBeGreaterThanOrEqual(20);
  });

  // NEGATIVE CONTROLS — the validator must actually be able to fail.
  it.each([
    ['a duplicate branch entry', (d: any) => { d.branches.push({ ...d.branches[1] }); }, 'duplicate entry'],
    ['a short SHA', (d: any) => { d.branches[1].tipSha = 'abc'; }, 'full 40-hex SHA'],
    ['a classification outside the vocabulary', (d: any) => { d.branches[1].classification = 'probably_fine'; }, 'not in the vocabulary'],
    ['no authoritative entry', (d: any) => { d.branches[0].role = 'temporary_workspace'; }, 'exactly one entry'],
    ['a missing disposition', (d: any) => { d.branches[1].disposition = ''; }, 'missing disposition'],
    ['a recovery target that does not exist', (d: any) => { d.branches[1].recovery = { status: 'recovered', into: 'docs/nope/', commits: [] }; }, 'does not exist'],
    ['unknown_owner_review without ownerReview', (d: any) => { const e = d.branches.find((b: any) => b.classification === 'unknown_owner_review'); e.ownerReview = false; }, 'requires ownerReview'],
  ])('rejects %s', (_n, mutate, needle) => {
    const d = doc(); mutate(d);
    const r = ledgerCli(write('bad.json', d));
    expect(r.code).toBe(1);
    expect(r.err).toContain(needle as string);
  });

  it('rejects a rendered view that has drifted from the JSON', () => {
    const md = join(tmp, 'drift.md');
    writeFileSync(md, read('docs/BRANCH-LEDGER.md') + '\nhand edit\n');
    const r = ledgerCli(join(ROOT, 'docs/branch-ledger.json'), md);
    expect(r.code).toBe(1);
    expect(r.err).toContain('out of sync');
  });
});

describe('SSOT — the policy is recorded where sessions read it, and enforced in CI', () => {
  it('CLAUDE.md states the policy and points at its detail', () => {
    const c = read('CLAUDE.md');
    expect(c).toContain('## Single source of truth');
    expect(c).toContain('docs/SOURCE-OF-TRUTH.md');
    expect(c).toContain('docs/BRANCH-LEDGER.md');
    expect(c).toContain('golem-line');
  });

  it('HANDOFF.md carries the pointer (no second, contradictory policy file)', () => {
    expect(read('HANDOFF.md')).toContain('docs/SOURCE-OF-TRUTH.md');
    const stray = readdirSync(ROOT).filter((f) => /^(SOURCE-OF-TRUTH|BRANCH-POLICY|CODEBASE-POLICY)/i.test(f));
    expect(stray).toEqual([]);
  });

  it('the ledger gate is a package script and a blocking step of the required gates job', () => {
    expect(JSON.parse(read('package.json')).scripts['check:branchledger']).toBe('node scripts/branch-ledger.mjs');
    const ci = read('.github/workflows/ci.yml');
    const gates = ci.slice(ci.indexOf('  gates:'), ci.indexOf('  test-shard-1:'));
    expect(gates).toContain('npm run check:branchledger');
  });

  it('adds no hosted-Actions cost: the new steps live only in already-opted-in jobs (trigger lists unchanged)', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/push:\s*\n\s*branches: \['golem-line'\]/);
  });
});
