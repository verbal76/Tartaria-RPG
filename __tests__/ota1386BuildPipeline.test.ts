/**
 * OTA-1386 — the build pipeline learns which product it is building.
 *
 * Owner: *"remember we build everything in git actions, we do not build through
 * expo."* Exactly — which is why the branch collapse was not finished at
 * OTA-1384. The code knew about four products; the thing that actually produces
 * binaries did not.
 *
 * ⚠⚠ WHAT WAS ACTUALLY BROKEN, and it was worse than "not wired yet":
 *
 *   1. Nothing set TARTARIA_LINE. The BRANCH used to answer "which product" —
 *      a push to HaL2001 checked out HAL's app.json. The collapse deleted that
 *      answer and put nothing in its place, so every workflow in the repo was
 *      silently building golem. No failure, no warning; a HAL build would just
 *      have come out wearing golem's name, id and channel.
 *
 *   2. The store package strip went dead. Both build workflows had a step that
 *      rewrote `app.json` to swap the suffixed package for the bare store one —
 *      Play refuses an AAB that has the wrong package. That worked while app.json
 *      WAS the config. OTA-1384 made app.config.js the entry point, and it
 *      overrides `android.package` AFTER that step runs. The step kept passing
 *      and printing a convincing before/after. The next production AAB would have
 *      been refused at upload with nothing in the log to explain why.
 *
 *   3. `eas build` does not inherit the runner's env. It ships the project to an
 *      EAS worker and prebuilds there, in an environment that never saw the
 *      workflow's env block — so line selection reached the local workflows and
 *      not that one.
 *
 *   4. The web product had no build workflow at all. Four lines, three
 *      workflows; `npm run export:web` was only ever run by hand.
 *
 * All four share one shape: something stopped being true and nothing went red.
 * That is what this suite is for.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');
const wf = (f: string) => src('.github', 'workflows', f);

const cfgSrc = src('app.config.js');

/** Render app.config.js the way Expo does, with a chosen env. */
function resolveConfig(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../app.config.js') as (a: { config: unknown }) => Record<string, any>;
    return mod({ config: {} });
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

/** The workflows that produce something a person installs or runs. */
const BUILD_WORKFLOWS = ['build-apk.yml', 'build-ios.yml', 'build-ios-native.yml', 'build-web.yml'];

describe('OTA-1386 — every build workflow says which product it is building', () => {
  it.each(BUILD_WORKFLOWS)('%s offers a line input AND sets TARTARIA_LINE job-wide', (f) => {
    const y = wf(f);
    expect(y).toContain('      line:');
    for (const l of ['golem', 'hal', 'steam', 'html']) expect(y).toContain(`          - ${l}`);
    // ⚠ JOB-level, not step-level. Every step that shells out to Expo — prebuild,
    // the config reads, the bundler — has to see the same answer, or the build
    // disagrees with itself halfway through.
    expect(y).toMatch(/\n    env:\n(?:.*\n)*?      TARTARIA_LINE: \$\{\{ github\.event\.inputs\.line \|\| '(golem|html)' \}\}/);
  });

  it('⚠⚠ a run with NO selection falls to golem on the native workflows', () => {
    // A push carries no input. Falling to the dev line means a forgotten
    // selection builds the developer's own product — never somebody else's
    // shipping one. The failure is a wasted build, not a mis-shipped app.
    for (const f of ['build-apk.yml', 'build-ios.yml', 'build-ios-native.yml']) {
      expect(wf(f)).toContain("TARTARIA_LINE: ${{ github.event.inputs.line || 'golem' }}");
    }
  });

  it('⚠ the web workflow defaults to html instead, because that is the only reason it exists', () => {
    expect(wf('build-web.yml')).toContain("TARTARIA_LINE: ${{ github.event.inputs.line || 'html' }}");
  });

  it('⚠⚠ no workflow still triggers on the archived HaL2001 branch', () => {
    // It was the old answer to "which product". Leaving the trigger means a push
    // to an archived branch quietly builds a months-stale HAL from a tree nobody
    // is maintaining any more.
    for (const f of readdirSync(path('.github', 'workflows'))) {
      const y = wf(f);
      expect(y).not.toMatch(/^\s+- 'HaL2001'$/m);
      expect(y).not.toMatch(/^\s+- HaL2001$/m);
    }
  });
});

describe('OTA-1386 — the store package flip, moved to the layer that has the last word', () => {
  it('⚠⚠ a store build resolves every line to the BARE store id', () => {
    for (const line of ['golem', 'hal', 'steam', 'html']) {
      const c = resolveConfig({ TARTARIA_LINE: line, TARTARIA_STORE_BUILD: '1' });
      expect(c.android.package).toBe('com.hotatticgames.tartarprim');
      expect(c.ios.bundleIdentifier).toBe('com.hotatticgames.tartarprim');
    }
  });

  it('⚠⚠ …and changes NOTHING else', () => {
    // A store build is still one of the four products; it only wears the
    // listing's id. If the channel moved with it, a store release would start
    // pulling a different product's OTAs — which is the precise accident the
    // whole collapse exists to prevent.
    const plain = resolveConfig({ TARTARIA_LINE: 'hal' });
    const store = resolveConfig({ TARTARIA_LINE: 'hal', TARTARIA_STORE_BUILD: '1' });
    expect(store.name).toBe(plain.name);
    expect(store.updates.requestHeaders['expo-channel-name'])
      .toBe(plain.updates.requestHeaders['expo-channel-name']);
    expect(store.extra.fallenSharing).toBe(plain.extra.fallenSharing);
    expect(store.extra.tartariaLine).toBe('hal');
  });

  it('⚠ an ordinary build keeps the line\'s own suffixed id', () => {
    // This is what keeps a sideload a SEPARATE INSTALL from the store app.
    const c = resolveConfig({ TARTARIA_LINE: 'hal' });
    expect(c.android.package).toBe('com.hotatticgames.tartarprim.hal2001');
    expect(c.ios.bundleIdentifier).toBe('com.hotatticgames.tartarprim.hal2001');
  });

  it('⚠ only the exact string "1" turns it on', () => {
    // An env var set to "0" or "false" by a well-meaning edit must not read as
    // truthy and silently ship every build under the store id.
    for (const v of ['0', 'false', '', 'yes']) {
      const c = resolveConfig({ TARTARIA_LINE: 'steam', TARTARIA_STORE_BUILD: v });
      expect(c.android.package).toBe('com.hotatticgames.tartarprim.steamdev');
    }
  });

  it('⚠⚠ every line id must live UNDER the store id, checked at config load', () => {
    // The strip has nothing sensible to fall back to otherwise, and the table in
    // app.config.js invites edits without making this relationship visible.
    expect(cfgSrc).toContain("const STORE_ID = 'com.hotatticgames.tartarprim';");
    expect(cfgSrc).toContain('is not under the store id');
    const { LINES, STORE_ID } = require('../app.config.js') as {
      LINES: Record<string, { id: string }>; STORE_ID: string;
    };
    for (const [k, v] of Object.entries(LINES)) {
      expect(`${k}:${v.id}`.startsWith(`${k}:${STORE_ID}.`)).toBe(true);
    }
  });

  it('⚠⚠ the DEAD app.json rewrite is gone from every workflow', () => {
    // This is the assertion that would have caught the original break. The old
    // steps read app.json, edited it, wrote it back and printed a before/after —
    // all of it true, none of it reaching the binary, because app.config.js
    // overrode the package afterwards.
    for (const f of readdirSync(path('.github', 'workflows'))) {
      const y = wf(f);
      expect(y).not.toContain("app.expo.android.package =");
      expect(y).not.toContain("app.expo.ios.bundleIdentifier =");
    }
  });

  it('⚠ the workflows ask for the flip instead, on the production paths only', () => {
    expect(wf('build-apk.yml')).toContain('TARTARIA_STORE_BUILD=1');
    expect(wf('build-apk.yml')).toContain("if: steps.meta.outputs.profile == 'production'");
    expect(wf('build-ios.yml')).toContain('TARTARIA_STORE_BUILD=1');
    // build-ios-native only ever makes a signed distribution .ipa, so it always
    // was and remains unconditional.
    expect(wf('build-ios-native.yml')).toContain('TARTARIA_STORE_BUILD=1');
  });
});

describe('OTA-1386 — the EAS worker, which does NOT inherit the runner env', () => {
  it('⚠⚠ build-ios.yml carries the line in through eas.json, the only channel it has', () => {
    // `eas build` uploads the project and prebuilds on an EAS machine. A job-level
    // env var never reaches it. eas.json travels WITH the project and EAS applies
    // build.<profile>.env on the worker — so that file is the carrier.
    const y = wf('build-ios.yml');
    expect(y).toContain('TARTARIA_LINE: process.env.TARTARIA_LINE');
    expect(y).toContain("j.build[p].env = { ...(j.build[p].env || {}), TARTARIA_LINE: process.env.TARTARIA_LINE };");
    expect(y).toContain("if (process.env.TARTARIA_STORE_BUILD === '1') j.build[p].env.TARTARIA_STORE_BUILD = '1';");
  });

  it('⚠ the edit is on the runner only — eas.json in the repo stays clean', () => {
    // A committed line selection would make the file lie about every other line.
    const eas = JSON.parse(src('eas.json')) as { build: Record<string, { env?: unknown }> };
    for (const [, profile] of Object.entries(eas.build)) {
      expect(profile.env).toBeUndefined();
    }
  });

  it('⚠ and the workflows that build LOCALLY say why they do not need it', () => {
    // The distinction is not obvious and getting it backwards produces a green
    // run that built the wrong product.
    expect(wf('build-ios-native.yml')).toContain('compiles ON THIS RUNNER');
    expect(wf('build-ios.yml')).toContain('does not: it uploads the project');
  });
});

describe('OTA-1386 — every build prints the identity it actually resolved', () => {
  it.each(BUILD_WORKFLOWS)('%s reads it back through Expo, not from a file', (f) => {
    // ⚠⚠ Reading app.json would report the file, and the file and the resolved
    // config disagreeing is exactly how the strip broke unnoticed. The log line
    // has to come from the same resolver the build uses.
    const y = wf(f);
    expect(y).toContain('Show the resolved identity actually being built');
    expect(y).toContain('npx expo config --type public --json');
    expect(y).toContain('c.extra.tartariaLine');
  });
});

describe('OTA-1386 — the OTA firewall survives the collapse', () => {
  const ota = wf('eas-update-golem.yml');

  it('⚠⚠ an UNASKED run can only ever reach golem', () => {
    // The original guarantee was structural: the file knew one string, so no path
    // in it could reach a live channel. One trunk means one workflow must serve
    // four products, so the string had to go. The guarantee is kept by splitting
    // the triggers instead — an unattended push is locked to the dev phone; a
    // dispatch, or a typed marker, is a person choosing a line.
    //
    // ⚠ OTA-1390 WIDENED "asked" from dispatch-only to dispatch-or-marker, so
    // this assertion moved with it. The property is unchanged and is the one
    // that matters: NOTHING UNATTENDED REACHES A PLAYER. What changed is that a
    // deliberate act no longer has to be a button press — the repo's whole
    // native-build convention is commit-title markers, for sessions that cannot
    // reach the Actions UI.
    expect(ota).toContain('an unselected (automatic) run may only target golem');
    expect(ota).toContain('[ "${{ steps.line.outputs.how }}" = "default (automatic push)" ]');
    expect(ota).toContain("grep -q '\\[ota-hal\\]'");
  });

  it('⚠⚠ the channel comes from the RESOLVED config, not from app.json', () => {
    // The old guard read app.json's expo-channel-name. Since OTA-1384 app.json is
    // only the shared BASE and still says golem-line for every line — so that
    // guard would have "verified" golem-line while publishing a hal bundle.
    expect(ota).toContain('npx expo config --type public --json');
    expect(ota).toContain("c.updates.requestHeaders['expo-channel-name']");
    expect(ota).not.toContain("require('./app.json').expo.updates");
  });

  it('⚠ and it aborts if the resolved line is not the one the run selected', () => {
    // A mismatch means the env var never reached Expo, and the bundle is not the
    // product this run's title claims.
    expect(ota).toContain('if [ "$RESOLVED_LINE" != "$TARTARIA_LINE" ]; then');
  });

  it('⚠⚠ the blanket refusal of `preview` is GONE, and that is deliberate', () => {
    // This asserted a `case` refusing preview / ios-preview / production /
    // development / arbiters-line outright. OTA-1390 removed it, because it was
    // wrong about `preview`: HAL's production iOS build is stamped channel
    // "preview" by eas.json, so `preview`/ios is HAL's ONLY iOS route. The old
    // guard would have refused the one publish iOS testers depend on.
    //
    // ⚠ What replaces a blanket refusal is a closed set. A line publishes to the
    // targets its own table entry names and to nothing else, so there is no path
    // for an arbitrary channel string to be reached at all — which is a stronger
    // guarantee than a denylist that had to be kept in step with reality.
    expect(ota).not.toContain('Refusing to publish to shared channel');
    expect(ota).toContain('TARGETS="hal2001:android:false hal2001:ios:true preview:ios:true"');
    expect(ota).toContain('TARGETS="golem-line:android:false"');
    // and an unknown line reaches no channel at all
    expect(ota).toContain("echo \"::error::Line '$TARTARIA_LINE' has no channel set.\"");
  });
});

describe('OTA-1386 — the web product finally has a build', () => {
  it('⚠⚠ build-web.yml exists — there were four lines and three workflows', () => {
    expect(existsSync(path('.github', 'workflows', 'build-web.yml'))).toBe(true);
    expect(wf('build-web.yml')).toContain('npm run export:web');
  });

  it('⚠ it fails loudly on an export that is not a loadable site', () => {
    // `expo export` exiting 0 with a dist/ missing index.html is a green run and
    // a broken artifact.
    const y = wf('build-web.yml');
    expect(y).toContain('dist/index.html is missing');
    expect(y).toContain('if-no-files-found: error');
  });

  it('⚠ it builds and uploads, and deliberately does NOT deploy', () => {
    // Where the site gets hosted is a decision nobody has made. A workflow that
    // quietly published it would be making that decision.
    const y = wf('build-web.yml');
    expect(y).toContain('WHAT THIS IS NOT');
    expect(y).toContain('uses: actions/upload-artifact@v4');
  });

  it('⚠ its push trigger is narrow, so it does not burn minutes on every commit', () => {
    const y = wf('build-web.yml');
    expect(y).toContain("- '**/*.web.ts'");
    expect(y).toContain("- '**/*.web.tsx'");
    expect(y).not.toContain("- 'app/**'");
  });
});

describe('OTA-1386 — the four-line check now runs in CI', () => {
  it('⚠⚠ check:lines is a blocking CI step, not a thing run by hand', () => {
    // It has existed since OTA-1384 and only ever ran on a developer's machine,
    // which is the same as not existing. It is the check that catches two
    // products sharing a channel — and the one that would have caught the strip
    // going dead.
    const ci = wf('ci.yml');
    expect(ci).toContain('run: npm run check:lines');
    expect(ci).toContain('Four product lines resolve distinctly (blocking)');
  });

  it('⚠ and verify-lines checks the store build too', () => {
    const v = src('scripts', 'verify-lines.mjs');
    expect(v).toContain('TARTARIA_STORE_BUILD');
    expect(v).toContain('a store build must not move the channel');
  });
});
