/**
 * Studio release convention: "<Game> v<N>" — one number, supplied once, that becomes
 * the GitHub Release title, the artifact filename and the notes' first lines.
 * Engineering identifiers (SHA, versionCode, tag, channel, DISPLAY_VERSION) are
 * provenance in the notes and in diagnostics, never the title or filename.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { load } = require('js-yaml') as { load: (src: string) => unknown };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const naming = require('../scripts/release-naming.cjs') as {
  readPublicVersion: (f?: string) => { product: string; fileStem: string; version: number };
  title: (pv: { product: string; version: number }) => string;
  assetName: (pv: { fileStem: string; version: number }, kind: string) => string;
  notesHead: (pv: { product: string; version: number }, kind: string, file: string) => string;
  guard: (rel: unknown[], pv: { product: string; version: number }, sha: string) => { ok: boolean; existingTag: string; reason: string };
};

const root = (...p: string[]) => join(__dirname, '..', ...p);
const pv = { product: 'Tartaria Realms', fileStem: 'Tartaria-Realms', version: 284 };
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const rel = (over: Record<string, unknown>) => ({ name: 'Tartaria Realms v284', tag_name: 'golem-apk-479', target_commitish: SHA_A, draft: false, prerelease: false, ...over });

describe('the one number', () => {
  it('release/public-version.json is a valid sequential public version, not semver or a codename', () => {
    const v = naming.readPublicVersion();
    expect(v.product).toBe('Tartaria Realms');
    expect(Number.isInteger(v.version)).toBe(true);
    expect(v.version).toBeGreaterThanOrEqual(283); // continues the 283 delivered Android builds
    expect(JSON.stringify(v)).not.toMatch(/"version":\s*"/);
  });

  it('rejects anything that is not a positive integer', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const os = require('node:os') as typeof import('node:os');
    const tmp = join(os.tmpdir(), `pv-${process.pid}.json`);
    for (const bad of ['"1.3.4"', '0', '-2', '2.5', '"b9"', 'null']) {
      fs.writeFileSync(tmp, `{"product":"X","fileStem":"X","version":${bad}}`);
      expect(() => naming.readPublicVersion(tmp)).toThrow(/version/);
    }
    fs.writeFileSync(tmp, '{"product":"X","fileStem":"has space","version":3}');
    expect(() => naming.readPublicVersion(tmp)).toThrow(/fileStem/);
  });
});

describe('names are derived, and agree', () => {
  it('title and filenames carry the same v<N>', () => {
    expect(naming.title(pv)).toBe('Tartaria Realms v284');
    expect(naming.assetName(pv, 'apk')).toBe('Tartaria-Realms-v284.apk');
    expect(naming.assetName(pv, 'aab')).toBe('Tartaria-Realms-v284.aab');
    expect(naming.assetName(pv, 'windows')).toBe('Tartaria-Realms-v284-Windows.exe');
  });
  it('no technical identifier can leak into a title or filename', () => {
    for (const k of ['apk', 'aab', 'windows']) {
      expect(naming.assetName(pv, k)).not.toMatch(/build|sha|[0-9a-f]{7,}|golem|hal|ota|b\d+\b/i);
    }
    expect(naming.title(pv)).not.toMatch(/build|ota|golem|hal2001|[0-9a-f]{7,}/i);
  });
  it('the notes open with the title and the file to install', () => {
    const head = naming.notesHead(pv, 'apk', 'Tartaria-Realms-v284.apk');
    expect(head.split('\n')[0]).toBe('# Tartaria Realms v284');
    expect(head).toContain('Android:\nTartaria-Realms-v284.apk');
  });
  it('an unknown artifact kind is refused', () => {
    expect(() => naming.assetName(pv, 'zip')).toThrow(/unknown artifact kind/);
  });
});

describe('a version identifies exactly one delivered build', () => {
  it('an unused number is fine', () => {
    expect(naming.guard([], pv, SHA_A)).toEqual({ ok: true, existingTag: '', reason: '' });
    expect(naming.guard([rel({ name: 'Tartaria Realms v283', target_commitish: SHA_B })], pv, SHA_A).ok).toBe(true);
  });
  it('the same number from a DIFFERENT commit is refused, naming the fix', () => {
    const g = naming.guard([rel({ target_commitish: SHA_B })], pv, SHA_A);
    expect(g.ok).toBe(false);
    expect(g.reason).toContain('bump "version" in release/public-version.json to 285');
  });
  it('the same number and commit attaches to the existing release (APK + AAB of one build)', () => {
    expect(naming.guard([rel({})], pv, SHA_A)).toEqual({ ok: true, existingTag: 'golem-apk-479', reason: '' });
  });
  it('a PC prerelease is never an attach target (but still counts for reuse)', () => {
    const pc = rel({ tag_name: 'pc-v4.32.0', prerelease: true });
    expect(naming.guard([pc], pv, SHA_A)).toEqual({ ok: true, existingTag: '', reason: '' });
    expect(naming.guard([{ ...pc, target_commitish: SHA_B }], pv, SHA_A).ok).toBe(false);
  });
  it('drafts and short-sha target prefixes are handled', () => {
    expect(naming.guard([rel({ draft: true, target_commitish: SHA_B })], pv, SHA_A).ok).toBe(true);
    expect(naming.guard([rel({ target_commitish: SHA_A.slice(0, 12) })], pv, SHA_A).existingTag).toBe('golem-apk-479');
  });
});

describe('the workflows use it', () => {
  type Step = { name?: string; run?: string; id?: string; with?: Record<string, unknown> };
  const stepsOf = (f: string): Step[] => {
    const d = load(readFileSync(root('.github', 'workflows', f), 'utf8')) as { jobs: Record<string, { steps: Step[] }> };
    return d.jobs[Object.keys(d.jobs)[0]!]!.steps;
  };
  const exe = (run: string) => run.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

  it('build-apk: resolves the name, guards the number BEFORE the build, and stages/titles from it', () => {
    const names = stepsOf('build-apk.yml').map((s) => s.name);
    const i = (n: string) => names.indexOf(n);
    expect(i('Resolve the public release name')).toBeGreaterThan(-1);
    expect(i('Refuse to reuse a delivered version')).toBe(i('Resolve the public release name') + 1);
    expect(i('Refuse to reuse a delivered version')).toBeLessThan(i('Gradle build (Tartaria Realms)'));
    const stage = exe(stepsOf('build-apk.yml').find((s) => s.name === 'Stage Tartaria Realms artifact')!.run!);
    expect(stage.split('OUT="artifacts/${{ steps.public.outputs.asset_name }}"').length - 1).toBe(2);
    expect(stage).not.toContain('tartaria-realms-${{ steps.meta.outputs.tag }}');
  });

  it('the guard cannot be swallowed by a pipe (default shell has no pipefail)', () => {
    for (const f of ['build-apk.yml', 'build-steam-exe.yml']) {
      for (const st of stepsOf(f)) {
        if (st.run && /release-naming\.cjs/.test(st.run)) expect(exe(st.run)).not.toMatch(/release-naming\.cjs[^\n]*\|/);
      }
    }
  });

  it('the release notes lead with the install file and keep the provenance', () => {
    const sh = exe(stepsOf('build-apk.yml').find((s) => s.name === 'Create Tartaria Realms GitHub Release')!.run!);
    expect(sh.indexOf('# ${TITLE}')).toBeLessThan(sh.indexOf('Source commit:'));
    for (const must of ['Source commit: ${GITHUB_SHA}', 'Android versionCode / Build #:', 'Git tag: ${TAG}', 'SHA-256 of ${ASSET_NAME}', 'Workflow run:', 'Package id:']) {
      expect(sh).toContain(must);
    }
    // an existing release of the same build gains the artifact; nothing is clobbered
    expect(sh).toContain('gh release upload "$EXISTING"');
    expect(sh).not.toContain('--clobber');
  });

  it('build-steam-exe: public title + public filename, guard before the build', () => {
    const steps = stepsOf('build-steam-exe.yml');
    const names = steps.map((s) => s.name);
    expect(names.indexOf('Refuse to reuse a delivered version')).toBeLessThan(names.indexOf('Package portable Windows .exe (electron-builder)'));
    const pub = steps.find((s) => s.name === 'Publish the PC build as a Release')!;
    expect(pub.with!.name).toBe('${{ steps.public.outputs.title }}');
    expect(String(pub.with!.body)).toContain('${{ steps.public.outputs.asset_name }}');
  });
});

describe('the convention is written down where the next session will read it', () => {
  it('docs/RELEASE-NAMING.md exists and CLAUDE.md points at it', () => {
    const doc = readFileSync(root('docs', 'RELEASE-NAMING.md'), 'utf8');
    for (const must of ['v<number>', 'release/public-version.json', 'Tartaria Realms v283', 'next', 'DISPLAY_VERSION']) expect(doc).toContain(must);
    expect(readFileSync(root('CLAUDE.md'), 'utf8')).toContain('docs/RELEASE-NAMING.md');
  });
});
