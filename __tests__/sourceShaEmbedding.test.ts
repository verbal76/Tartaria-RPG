/**
 * The commit a bundle was built from reaches About / Copy All.
 *
 * app.config.js resolves it at build/publish time into `extra.sourceSha`; the app reads it back
 * from Constants. Both halves are pinned, and so is the safety property: a malformed value is
 * "not embedded", never a guess, and it is not an input to runtimeVersion.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cfg = require('../app.config.js') as {
  (a: { config: Record<string, unknown> }): { extra: Record<string, unknown>; runtimeVersion?: unknown };
  resolveSourceSha: (env?: Record<string, string | undefined>, run?: ((cmd: string) => string) | null) => string | null;
};

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const git = (out: string) => () => out;
const noGit = () => { throw new Error('not a git repository'); };

describe('resolveSourceSha (app.config.js)', () => {
  it('prefers the checked-out tree over the environment — the publisher can publish a SHA that is not the ref head', () => {
    expect(cfg.resolveSourceSha({ GITHUB_SHA: B }, git(`${A}\n`))).toBe(A);
  });
  it('falls back to the EAS cloud-build hash, then GITHUB_SHA, when there is no .git', () => {
    expect(cfg.resolveSourceSha({ EAS_BUILD_GIT_COMMIT_HASH: B, GITHUB_SHA: C }, noGit)).toBe(B);
    expect(cfg.resolveSourceSha({ GITHUB_SHA: C }, noGit)).toBe(C);
  });
  it('normalises to lower case', () => {
    expect(cfg.resolveSourceSha({}, git('ABCDEF0123456789ABCDEF0123456789ABCDEF01'))).toBe('abcdef0123456789abcdef0123456789abcdef01');
  });
  it('anything that is not exactly 40 hex characters is null, never a guess', () => {
    expect(cfg.resolveSourceSha({}, git('HEAD'))).toBeNull();
    expect(cfg.resolveSourceSha({ GITHUB_SHA: 'abc123' }, noGit)).toBeNull();
    expect(cfg.resolveSourceSha({ GITHUB_SHA: `${A}0` }, noGit)).toBeNull();
    expect(cfg.resolveSourceSha({}, noGit)).toBeNull();
  });
  it('never throws when git is missing or fails', () => {
    expect(() => cfg.resolveSourceSha({}, noGit)).not.toThrow();
  });
});

describe('the resolved config', () => {
  const resolved = cfg({ config: {} });
  it('carries sourceSha in extra — the channel a build-time value has into the app', () => {
    expect('sourceSha' in resolved.extra).toBe(true);
    const v = resolved.extra.sourceSha;
    expect(v === null || /^[0-9a-f]{40}$/.test(v as string)).toBe(true);
  });
  it('does not touch the runtime identity: runtimeVersion is still app.json’s appVersion policy', () => {
    const app = JSON.parse(readFileSync(join(__dirname, '..', 'app.json'), 'utf8')).expo;
    expect(app.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(resolved.runtimeVersion).toEqual({ policy: 'appVersion' });
  });
});

describe('readSourceSha with a live Constants value', () => {
  const load = (extra: unknown) => {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra }, deviceName: 'x' } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../app/diagnostics/aboutIdentity') as typeof import('../app/diagnostics/aboutIdentity');
  };
  afterEach(() => { jest.dontMock('expo-constants'); jest.resetModules(); });

  it('returns a valid embedded SHA (lower-cased) and shows it short in About, full in Copy All', () => {
    const m = load({ sourceSha: A.toUpperCase() });
    expect(m.readSourceSha()).toBe(A);
    const facts = m.collectAboutFacts({ updateStaged: false, updateApplying: false });
    expect(facts.sourceSha).toBe(A);
    const rows = m.buildAboutIdentity(facts).flatMap((s) => s.rows);
    expect(rows.find((r) => r.label === 'Source SHA')?.value).toBe('aaaaaaa');
    expect(m.buildAboutIdentityText(facts)).toContain(`Source SHA (full): ${A}`);
  });
  it('malformed, missing or non-string values read as not embedded', () => {
    for (const bad of [{}, { sourceSha: 'deadbeef' }, { sourceSha: 7 }, { sourceSha: null }, undefined]) {
      expect(load(bad).readSourceSha()).toBeNull();
    }
    expect(load({}).buildAboutIdentityText(load({}).collectAboutFacts({ updateStaged: false, updateApplying: false })))
      .toContain('not embedded in this bundle');
  });
});
