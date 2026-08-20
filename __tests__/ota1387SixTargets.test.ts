/**
 * OTA-1387 — the trunk can build all six targets again.
 *
 * Owner, listing what has to ship: *"we should have steam, Linux, html, iOS,
 * macOS, android correct?"* — and then *"those 6 should cover all android, ac,
 * and PC ecospheres."*
 *
 * ⚠⚠ I TOLD HIM ONLY THREE OF THOSE EXISTED. That was wrong, and the way it was
 * wrong is worth keeping written down, because it is the same mistake twice.
 *
 * I read `.github/workflows/` **on the trunk**, found Android, iOS and web, and
 * reported that as what the project can build. What was actually true is that
 * Windows, Linux and macOS all had working packaging — an Electron wrapper under
 * `desktop/` plus one workflow each — living on `steam_Dev`, `linux_dev` and
 * `mac_dev`. Reading one branch and describing the repository is exactly the
 * error the branch collapse existed to make impossible, committed while doing
 * the collapse.
 *
 * And the collapse had a matching blind spot. `scripts/divergence.py` measured
 * divergence across `app/` only, so `.github/workflows/` and `desktop/` were
 * never in the census at all. Nothing flagged that three of six shipping targets
 * had no path onto the trunk. Same shape as the web dependencies OTA-1384 caught
 * by accident: the census could only see the part of the tree it was pointed at.
 *
 * So this suite asserts the whole set, not the part that happened to be nearby.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');
const wf = (f: string) => src('.github', 'workflows', f);

/** Every shipping target and the workflow that produces it. */
const TARGETS: Array<{ target: string; file: string }> = [
  { target: 'android', file: 'build-apk.yml' },
  { target: 'ios (EAS)', file: 'build-ios.yml' },
  { target: 'ios (runner)', file: 'build-ios-native.yml' },
  { target: 'web / html', file: 'build-web.yml' },
  { target: 'windows / steam', file: 'build-steam-exe.yml' },
  { target: 'linux / steam deck', file: 'build-linux.yml' },
  { target: 'macos', file: 'build-mac.yml' },
];

/** The three that came back from the side branches in this OTA. */
const DESKTOP = ['build-steam-exe.yml', 'build-linux.yml', 'build-mac.yml'];

describe('OTA-1387 — all six targets have a build ON THE TRUNK', () => {
  it.each(TARGETS)('$target → $file', ({ file }) => {
    expect(existsSync(path('.github', 'workflows', file))).toBe(true);
  });

  it('⚠⚠ …and that is seven workflows for six targets, not three', () => {
    // Stated as a count so a deletion is loud. iOS has two because EAS builds
    // and the macOS-runner fallback are separate paths to the same target.
    const present = TARGETS.filter((t) => existsSync(path('.github', 'workflows', t.file)));
    expect(present).toHaveLength(7);
  });
});

describe('OTA-1387 — the Electron wrapper the desktop builds need', () => {
  it.each([
    ['desktop/main.js', ['desktop', 'main.js']],
    ['desktop/preload.js', ['desktop', 'preload.js']],
    ['desktop/package.json', ['desktop', 'package.json']],
    ['desktop/.gitignore', ['desktop', '.gitignore']],
    ['scripts/harden-web-bundle.sh', ['scripts', 'harden-web-bundle.sh']],
    ['obfuscator.config.json', ['obfuscator.config.json']],
  ] as Array<[string, string[]]>)('%s is on the trunk', (_label, p) => {
    expect(existsSync(path(...p))).toBe(true);
  });

  it('⚠⚠ the preload bridge and its consumer travel together', () => {
    // `app/ui/displayScale.ts` reads `window.tartariaDesktop.setZoom`. That code
    // was already on the trunk while the preload that provides it was not — so
    // the trunk shipped a consumer of a bridge it had no way to build. Either
    // both or neither.
    expect(src('app', 'ui', 'displayScale.ts')).toContain('tartariaDesktop');
    const preload = src('desktop', 'preload.js');
    expect(preload).toContain('exposeInMainWorld');
    expect(preload).toContain('setZoom:');
    expect(preload).toContain('isDesktop: true');
  });

  it('⚠⚠ all three platform targets are REAL — no "dir" stubs left', () => {
    // Each branch pinned its own platform and stubbed the other two to `dir`,
    // which produces an unpackaged folder rather than an installer. On one trunk
    // those stubs are just two ways to build the wrong thing.
    const pkg = JSON.parse(src('desktop', 'package.json')) as {
      build: { win: { target: string }; mac: { target: string }; linux: { target: string } };
    };
    expect(pkg.build.win.target).toBe('portable');
    expect(pkg.build.mac.target).toBe('dmg');
    expect(pkg.build.linux.target).toBe('AppImage');
  });

  it('⚠ the harden script is conservative on purpose, and says why', () => {
    // A previous attempt used numbersToExpressions + base64 rotate/shuffle and
    // the .exe hung mid-boot — those transforms are pathological on the
    // procedural-generation hot loops. The config records that so it is not
    // "improved" back.
    const cfg = JSON.parse(src('obfuscator.config.json')) as Record<string, unknown>;
    expect(cfg.numbersToExpressions).toBe(false);
    expect(cfg.controlFlowFlattening).toBe(false);
    expect(cfg.selfDefending).toBe(false);
    expect(cfg.stringArrayEncoding).toEqual([]);
    expect(src('scripts', 'harden-web-bundle.sh')).toContain('hung mid-boot');
  });
});

describe('OTA-1387 — the desktop workflows, as they are on the trunk', () => {
  it.each(DESKTOP)('%s selects a product line, defaulting to steam', (f) => {
    const y = wf(f);
    expect(y).toContain("TARTARIA_LINE: ${{ github.event.inputs.line || 'steam' }}");
    expect(y).toContain('      line:');
  });

  it.each(DESKTOP)('%s does not build on an ordinary push', (f) => {
    // ⚠ Each of these fired on every push to its own branch, which was fine when
    // that branch saw occasional PC work. The trunk takes every commit for all
    // four products, and Windows runners bill at 2x, macOS at 10x — an automatic
    // desktop build here would be a standing tax on ordinary phone work.
    //
    // ⚠⚠ SUPERSEDED BY OTA-1390, AND THE ORIGINAL WORDING WAS THE BUG. This
    // asserted `not.toMatch(/^\s*push:/)` — dispatch-only — which achieved the
    // cost goal and also removed the only way anything without the Actions UI
    // could build these at all. The repo's own convention is commit-title
    // markers (HANDOFF.md §5), and build-engine-exe.yml had the right shape all
    // along: keep the push trigger, gate the JOB. What must stay true is that an
    // UNASKED push builds nothing — which is what this now checks.
    const y = wf(f);
    expect(y).toContain('workflow_dispatch:');
    expect(y).toContain("      github.event_name == 'workflow_dispatch'");
    expect(y).toContain("contains(github.event.head_commit.message, '[build-desktop]')");
  });

  it.each(DESKTOP)('%s hardens the bundle before packaging it', (f) => {
    // ⚠⚠ Only Windows did this before. The AppImage and the .dmg shipped the
    // same game with source maps intact — so the protection on the .exe was
    // undone by downloading a different file for the same game.
    expect(wf(f)).toContain('bash scripts/harden-web-bundle.sh dist');
  });

  it.each(DESKTOP)('%s installs from the lockfile, not a loose resolve', (f) => {
    // `npm install --legacy-peer-deps` was correct on steam_Dev, whose lockfile
    // predated the web deps. OTA-1384 put those deps on the trunk WITH a
    // matching lockfile that ci.yml runs `npm ci` against every commit — so a
    // desktop build that resolved different versions would be a build nobody
    // had tested.
    // ⚠ Checked on the RUN LINE, not on the file. The comment above each step
    // names the old command to explain why it changed, and a whole-file
    // `not.toContain` would forbid saying so.
    const runs = wf(f).split('\n').filter((l) => /^\s*run:/.test(l));
    expect(runs.some((l) => l.includes('npm ci --no-audit --no-fund'))).toBe(true);
    expect(runs.some((l) => l.includes('--legacy-peer-deps'))).toBe(false);
  });

  it.each(DESKTOP)('%s prints the identity it resolved', (f) => {
    expect(wf(f)).toContain('Show the resolved identity actually being built');
    expect(wf(f)).toContain('npx expo config --type public --json');
  });

  it('⚠ the public Release is Windows-only, opt-out-able, and steam-only', () => {
    // A Release is a public permanent URL. One published from a line nobody
    // ships on PC would be a download with no owner.
    const y = wf('build-steam-exe.yml');
    expect(y).toContain('softprops/action-gh-release@v2');
    expect(y).toContain("github.event.inputs.line == 'steam'");
    expect(wf('build-linux.yml')).not.toContain('action-gh-release');
    expect(wf('build-mac.yml')).not.toContain('action-gh-release');
  });

  it('⚠ the macOS build is unsigned, and the workflow says what that costs', () => {
    // "Unsigned" is not a detail — it is the difference between double-clicking
    // and a Gatekeeper refusal with no obvious way past it.
    const y = wf('build-mac.yml');
    expect(y).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");
    expect(y).toContain('Gatekeeper');
    expect(y).toContain('Notarisation');
  });
});

describe('OTA-1387 — the blind spot that let this happen', () => {
  it('⚠⚠ the census measured app/ only, and that is recorded', () => {
    // Not a code fix — the branches are collapsed and the census has done its
    // job. What matters is that the NEXT person reading DIVERGENCE.md knows what
    // it could not see, rather than reading a clean report as "nothing differs".
    const d = src('DIVERGENCE.md');
    expect(d).toContain('WHAT THIS CENSUS COULD NOT SEE');
    expect(d).toContain('.github/workflows/');
    expect(d).toContain('desktop/');
  });

  it('⚠ no desktop workflow still triggers on its retired home branch', () => {
    for (const f of DESKTOP) {
      const y = wf(f);
      for (const b of ['steam_Dev', 'linux_dev', 'mac_dev']) {
        expect(y).not.toMatch(new RegExp(`^\\s+- ${b}$`, 'm'));
      }
    }
  });

  it('⚠ and no workflow file went missing in the move', () => {
    const files = readdirSync(path('.github', 'workflows')).sort();
    for (const t of TARGETS) expect(files).toContain(t.file);
  });
});
