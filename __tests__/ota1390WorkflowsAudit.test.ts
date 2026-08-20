/**
 * OTA-1390 — the workflows audit, and the two things it turned up.
 *
 * Owner: *"you do have permission to push builds. I haven't had to manually push
 * a build in 5 iterations of you… do a full workflows audit."*
 *
 * ⚠⚠ HE WAS RIGHT AND I WAS WRONG. I hit a 403 dispatching a workflow and
 * reported that as "I can't start builds." The dispatch API is not how builds
 * have ever been started here. `HANDOFF.md` §5 spells out the actual
 * convention — commit-title markers — and `build-apk.yml` says why in its own
 * header: *"lets a sandboxed agent or anyone without tag-push permission trigger
 * a Play-Store-ready AAB build without needing to dispatch via the GitHub UI."*
 * I read one error and stopped, instead of reading the docs that were written for
 * precisely that error.
 *
 * Two real holes came out of reading properly:
 *
 *   1. ⚠⚠ OTA-1387 MADE THE THREE DESKTOP BUILDS DISPATCH-ONLY. I removed their
 *      push triggers to stop them running on every commit — correct instinct,
 *      wrong mechanism. It also removed the only way anything without the Actions
 *      UI could build them. The right shape was already in this repo:
 *      `build-engine-exe.yml` keeps a push trigger and gates the JOB on a marker,
 *      so an untagged push skips for free and a tagged one builds. All three now
 *      do that.
 *
 *   2. ⚠⚠ THE LIVE OTA PUBLISHER NEVER CAME ONTO THE TRUNK. `eas-update.yml` on
 *      HaL2001 picks its channels with `case "$BRANCH"`, so on the trunk it would
 *      have fallen through to "branch not mapped, skipping". The collapse
 *      therefore left the LIVE channel with no update path, and the only symptom
 *      would have been testers quietly never getting one. Absorbed here, keyed on
 *      the LINE instead of the branch.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const path = (...p: string[]) => join(__dirname, '..', ...p);
const src = (...p: string[]) => readFileSync(path(...p), 'utf8');
const wf = (f: string) => src('.github', 'workflows', f);

const DESKTOP: Array<[string, string]> = [
  ['build-steam-exe.yml', 'build-exe'],
  ['build-linux.yml', 'build-linux'],
  ['build-mac.yml', 'build-dmg'],
];

describe('OTA-1390 — every desktop build can be started without the Actions UI', () => {
  it.each(DESKTOP)('%s gates the JOB on a marker, keeping its push trigger', (f, marker) => {
    const y = wf(f);
    // The push trigger must exist — without it the marker is never read, because
    // the workflow never starts.
    expect(y).toMatch(/^  push:$/m);
    expect(y).toContain('      - golem-line');
    // …and the job must skip unless asked, or every commit builds it.
    expect(y).toContain("github.event_name == 'workflow_dispatch'");
    expect(y).toContain(`contains(github.event.head_commit.message, '[${marker}]')`);
  });

  it('⚠ …and one marker fires all three, because "build everything" is a real request', () => {
    for (const [f] of DESKTOP) {
      expect(wf(f)).toContain("contains(github.event.head_commit.message, '[build-desktop]')");
    }
  });

  it('⚠⚠ the expensive runners still skip by default', () => {
    // Windows bills 2x and macOS 10x. The gate is what keeps the trunk — which
    // takes every commit for all four products — from being a standing charge.
    for (const [f] of DESKTOP) {
      const y = wf(f);
      const gate = y.slice(y.indexOf('    if: >-'), y.indexOf('    env:'));
      expect(gate).toContain('workflow_dispatch');
      expect(gate.includes('||')).toBe(true);
    }
    expect(wf('build-mac.yml')).toContain('most expensive accident');
  });
});

describe('OTA-1390 — the trigger-touch file', () => {
  it('⚠⚠ exists, because a marker alone cannot start a path-filtered workflow', () => {
    // build-apk and build-ios ignore app/**, so an OTA-stamp commit starts
    // nothing at all and the marker is never read. `.github/**` is not ignored.
    expect(existsSync(path('.github', 'build-trigger.txt'))).toBe(true);
    const t = src('.github', 'build-trigger.txt');
    expect(t).toContain('[build-aab]');
    expect(t).toContain('[ota-hal]');
  });

  it('⚠ and the web build watches it too', () => {
    expect(wf('build-web.yml')).toContain("- '.github/build-trigger.txt'");
  });

  it('⚠ …while build-apk and build-ios reach it by NOT ignoring .github/**', () => {
    // Stated as an assertion because it is load-bearing and invisible: the file
    // works on those two through an absence, not a presence.
    for (const f of ['build-apk.yml', 'build-ios.yml']) {
      const y = wf(f);
      const ignore = y.slice(y.indexOf('paths-ignore:'), y.indexOf('workflow_dispatch:'));
      expect(ignore).not.toContain("- '.github/**'");
    }
  });
});

describe('OTA-1390 — the live OTA path exists on the trunk', () => {
  const ota = wf('eas-update-golem.yml');

  it('⚠⚠ HAL publishes to THREE targets, and preview/ios is one of them', () => {
    // The production iOS build is stamped channel "preview" by eas.json, which
    // overrides the app config's expo-channel-name. An hal2001-only publish
    // reaches nobody on iOS and does not look like a failure — the Expo server
    // correctly answers "no update available". OTA-303 lost a session to it.
    expect(ota).toContain('TARGETS="hal2001:android:false hal2001:ios:true preview:ios:true"');
    expect(ota).toContain('preview:ios IS NOT A TYPO');
  });

  it('⚠⚠ the channel set is a TABLE, not derived from the config', () => {
    // Any derivation from `updates.requestHeaders` drops preview/ios, because
    // the config does not know about it. Writing it out is the fix.
    expect(ota).toContain('WRITTEN OUT PER LINE');
    expect(ota).toContain('case "$TARTARIA_LINE" in');
  });

  it('⚠ iOS publishes are best-effort so they cannot take Android down', () => {
    expect(ota).toContain('hal2001:ios:true');
    expect(ota).toContain('Optional publish to');
  });

  it('⚠ steam and html publish NOTHING, and say so', () => {
    // Publishing to steam-dev / html-dev would put a bundle where nothing is
    // listening — which reads in the dashboard exactly like a successful release.
    expect(ota).toContain('does not consume EAS updates');
    expect(ota).toContain('steam|html)');
  });

  it('⚠⚠ nothing unattended reaches a player', () => {
    // The firewall, restated for the new trigger shape: an ordinary push may only
    // publish golem. A dispatch or a typed [ota-hal] marker is somebody deciding.
    expect(ota).toContain("an unselected (automatic) run may only target golem");
    expect(ota).toContain("grep -q '\\[ota-hal\\]'");
  });

  it('⚠ platform markers cannot silently publish nothing', () => {
    // [ota-ios-only] on a line whose set is android-only would otherwise exit 0
    // having done nothing, which is indistinguishable from success.
    expect(ota).toContain('excluded every target');
  });

  it('⚠ the runtime-version guard survived the rewrite', () => {
    // A published runtimeVersion that does not match app.json is ignored by the
    // device in silence. It has to fail here or it fails invisibly there.
    expect(ota).toContain("installed builds will reject it");
  });
});

describe('OTA-1391 — the trunk is actually IN the mobile workflows\' trigger list', () => {
  /**
   * ⚠⚠ FOUND BY PUSHING THE TRIAL BUILD AND COUNTING. The OTA-1390 commit
   * carried every marker and touched `.github/build-trigger.txt`, and **four**
   * of six targets fired. Android and iOS did not — not because of the path
   * filter or the marker, but because `golem-line` was never in their `push:`
   * branch list at all.
   *
   * It was left off deliberately, back when golem was one dev line that shipped
   * JS over the air and built APKs "manually via workflow_dispatch". The collapse
   * made it THE TRUNK for all four products and nobody revisited the list. So
   * from OTA-1384 until now, **Android and iOS could not be built from the trunk
   * by a push at all** — a `[build-aab]` or `[build-ios]` marker was read by
   * nothing, because the workflow never started.
   *
   * ⚠ And `build-ios-native.yml` was worse: `paths-ignore: ['**']` excludes every
   * path, so no push has ever passed its filter on any branch — while its own
   * header documented a `[build-ios-native]` push marker. The doc had been false
   * for as long as the filter existed.
   */
  const MOBILE = ['build-apk.yml', 'build-ios.yml', 'build-ios-native.yml'];

  it.each(MOBILE)('%s lists the trunk as a push branch', (f) => {
    const y = wf(f);
    const on = y.slice(y.indexOf('on:'), y.indexOf('permissions:'));
    expect(on).toContain("      - 'golem-line'");
  });

  it('⚠⚠ build-ios-native no longer excludes every path from its own trigger', () => {
    const y = wf('build-ios-native.yml');
    const on = y.slice(y.indexOf('on:'), y.indexOf('permissions:'));
    expect(on).not.toMatch(/paths-ignore:\s*\n\s*- '\*\*'/);
  });

  it.each(MOBILE)('%s still refuses to build on an UNASKED push to the trunk', (f) => {
    // Adding the trunk to the branch list is only safe because the job gate
    // exists. An Android build is 30-60 minutes and the trunk takes every commit
    // for all four products; "fires on any non-JS push" would be a standing tax.
    const y = wf(f);
    expect(y).toContain('    if: >-');
    const gate = y.slice(y.indexOf('    if: >-'), y.indexOf('    env:'));
    expect(gate).toContain("github.event_name == 'workflow_dispatch'");
    expect(gate).toContain('head_commit.message');
  });

  it('⚠ …but a push to a NON-trunk branch keeps the old always-build behaviour', () => {
    // main / release/** / claude/** are branches where a build is the point.
    // Only the trunk needed the new restraint.
    for (const f of ['build-apk.yml', 'build-ios.yml']) {
      expect(wf(f)).toContain("|| github.ref != 'refs/heads/golem-line'");
    }
  });

  it('⚠ a version tag still forces a build regardless', () => {
    for (const f of ['build-apk.yml', 'build-ios.yml']) {
      expect(wf(f)).toContain("|| startsWith(github.ref, 'refs/tags/')");
    }
  });

  it('⚠⚠ the 10x runner is gated so it is never even allocated', () => {
    // macOS bills at 10x — the one place where "starts and exits cleanly" is
    // still too expensive. The step-level should_run check stays as a second
    // line of defence, but the job-level `if` is what saves the money.
    const y = wf('build-ios-native.yml');
    expect(y).toContain("startsWith(github.event.head_commit.message, '[build-ios-native]')");
    expect(y).toContain('never allocated');
    expect(y).toContain("steps.meta.outputs.should_run != 'true'");
  });
});

describe('OTA-1390 — the audit document', () => {
  const doc = src('docs', 'WORKFLOWS.md');

  it('⚠⚠ names every marker, and which ones need a trigger touch', () => {
    for (const m of ['[build-aab]', '[build-ios]', '[submit-ios]', '[build-ios-native]',
      '[build-exe]', '[build-linux]', '[build-dmg]', '[build-desktop]', '[ota-hal]']) {
      expect(doc).toContain(m);
    }
    expect(doc).toContain('trigger touch');
  });

  it('⚠ records all six targets and both iOS routes', () => {
    for (const f of ['build-apk.yml', 'build-ios.yml', 'build-ios-native.yml',
      'build-web.yml', 'build-steam-exe.yml', 'build-linux.yml', 'build-mac.yml']) {
      expect(doc).toContain(f);
    }
  });

  it('⚠⚠ records that the three desktop targets all start from the web export', () => {
    // The consequence people miss: a broken web export breaks four targets, not
    // one. It is why build-web is the only build with an automatic trigger.
    expect(doc).toContain('all start from `npx expo export --platform web`');
  });

  it('⚠ records the secrets each path needs, and that the two Expo tokens differ', () => {
    expect(doc).toContain('TARTARIATWO');
    expect(doc).toContain('Not interchangeable');
  });

  it('⚠⚠ lists the six holes and says the one thing they had in common', () => {
    expect(doc).toContain('Every one of them was silent');
    expect(doc).toContain('a census is a reading');
    expect(doc).toContain('fail the way a build fails');
  });
});
