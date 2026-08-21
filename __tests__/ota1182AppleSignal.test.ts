// OTA-1182 — MAKE THE APPLE SIGNALS USABLE. Owner: *"I have Apple testers, they need to be
// able to play test. I need the game running fully on Apple before I worry about QoL or
// balancing."*
//
// Two things were hiding the answer to "is iOS healthy", and both are removed here.
//
// ⚠⚠ 1. THE iOS BUILD CHECK HAS BEEN RED ON EVERY ORDINARY PUSH, FOREVER, FOR A REASON
// THAT IS NOT ABOUT iOS. `build-ios.yml` defaults to the `preview` profile, which is
// `distribution: internal` in eas.json and needs ad-hoc provisioning credentials this
// project does not hold. The workflow's own footer records the same failure twice
// (arb172, OTA-302: *"the preview profile (no internal-distribution creds) and failed"*).
//
// ⚠ The dangerous part is not the noise, it is what the noise taught. On 2026-08-09 I
// reported that failure to the owner as "pre-existing, not from these changes" — true, and
// also precisely what someone would say about a real regression. **A genuine iOS build
// failure would have looked identical.** The check now SKIPS rather than fails, so a red
// iOS X means something. ⚠ Nothing about credentials is touched: this only stops
// attempting a build that cannot succeed.
//
// ⚠⚠ 2. THE NARRATION ENGINE'S FAILURE REASON WAS INVISIBLE. OTA-1181 put `qwenError` in
// the bug-report header, which requires a player to get far enough to send one. A
// TestFlight tester who never files a report is the ordinary case — but the LOG ships with
// any report, including one about something else. Three reports have now said the model
// does not load; the reason decides which of three completely different fixes applies:
//   · "llama.rn not available in this build" → the native module is not in the installed
//     IPA, and NO OTA can fix it. A new build is the only path.
//   · "GGUF download failed: …"             → network or disk, fixable in JS.
//   · "Load failed: <native error>"          → memory or a native fault on this device.

import fs from 'fs';
import path from 'path';

const WF = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/build-ios.yml'), 'utf8');
const EAS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eas.json'), 'utf8'));
const STORE = fs.readFileSync(path.join(__dirname, '..', 'app/state/gameStore.ts'), 'utf8');
/** ⚠ OTA-1393 — `bootQwen` LEFT gameStore.ts for
 *  `app/state/slices/aiLifecycleSlice.ts` when the store split began. The block
 *  below reads it there. Re-pointed rather than relaxed: what these four tests
 *  hold down is the only line that tells an Apple tester whether the narration
 *  engine is missing, out of memory, or out of disk — and a source pin loosened
 *  after a refactor pins nothing. The bodies are unchanged; only the file is. */
const AI_LIFECYCLE = fs.readFileSync(path.join(__dirname, '..', 'app/state/slices/aiLifecycleSlice.ts'), 'utf8');

function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('OTA-1182 — a red iOS check now means something', () => {
  test('the premise: preview really is internal distribution', () => {
    // ⚠ If this ever becomes `store`, or gains credentials, the skip below should be
    // revisited rather than left in place out of habit.
    expect(EAS.build.preview.distribution).toBe('internal');
    // And production is NOT internal — that is the profile that can actually build.
    expect(EAS.build.production.distribution).toBeUndefined();
  });

  test('⚠⚠ the build step only runs for the production profile', () => {
    expect(WF).toContain("- name: EAS Build (iOS, non-interactive) — with optional auto-submit\n        if: steps.meta.outputs.profile == 'production'");
  });

  test('a non-production run SKIPS loudly rather than failing silently', () => {
    expect(WF).toContain("- name: Skip — preview profile has no internal-distribution credentials");
    expect(WF).toContain("if: steps.meta.outputs.profile != 'production'");
    // ⚠ And it must say HOW to get a real build, or the skip is just a different dead end.
    expect(WF).toContain('[build-ios]');
    expect(WF).toContain('profile=production');
  });

  test('⚠ the three production triggers still work', () => {
    // Skipping preview must not have closed the paths that DO build.
    expect(WF).toMatch(/refs\/tags\/v\*-ios/);
    // RETARGETED BY OTA-1418 — this pinned the `^\[build-ios\]` ANCHOR, which
    // turned out to be the defect rather than the trigger. The claim is "a
    // [build-ios] title still selects production", and that is unchanged; what
    // changed is that the marker no longer has to LEAD. Pinning the anchor would
    // have blocked its own removal.
    expect(WF).toMatch(/=~ \\\[build-ios\\\]/);
    expect(WF).toContain("github.event.inputs.profile || 'preview'");
  });

  test('nothing in this change touches credentials', () => {
    // Standing owner directive: certificates, provisioning profiles, signing identities
    // and App Store Connect are owner-only. This OTA adds two `if:` guards and an echo.
    // ⚠ RETARGETED: the first version matched the WORD "provisioning" and tripped on this
    // step's own explanation of why it skips. That is prose, not behaviour — the same
    // proximity trap this repo has hit before. What matters is that the step READS no
    // secret and RUNS no credential command; saying the word out loud is the point of it.
    const added = WF.slice(WF.indexOf('- name: Skip — preview profile'), WF.indexOf('- name: EAS Build'));
    expect(added).not.toMatch(/secrets\./);
    expect(added).not.toMatch(/eas[- ]cli\s+credentials|security\s+import|keychain/i);
    // The step does nothing but echo.
    const cmds = (added.match(/^\s{10}(?!echo)\S.*$/gm) ?? []).filter((l) => !/^\s*(run:|if:|- name:)/.test(l));
    expect(cmds).toHaveLength(0);
  });
});

describe('OTA-1182 — the narration engine says why it failed, in the log', () => {
  const code = codeOnly(AI_LIFECYCLE);

  test('the swallowed-failure path logs the reason', () => {
    expect(code).toContain('qwen: LOAD FAILED — ${why}');
  });

  test('the throwing path logs it too', () => {
    // ⚠ This is the one that matters most for Apple: a missing native module THROWS, and
    // that answer means no OTA can fix it — only a new build.
    expect(code).toContain('qwen: LOAD THREW — ${message}');
  });

  test('⚠ the reason logged is the same one stored, not a second guess', () => {
    // Two different strings for one event is how a diagnostic starts disagreeing with
    // itself. `why` is what goes into state AND into the log.
    expect(code).toContain("const why = qwen.getLastError() ?? 'Qwen failed to initialize';");
    expect(code).toContain("set({ qwenStatus: 'failed', qwenError: why });");
  });

  test('logging can never break the boot', () => {
    // A failed load is already a bad moment; the line describing it must not throw into it.
    for (const marker of ['qwen: LOAD FAILED', 'qwen: LOAD THREW']) {
      const i = code.indexOf(marker);
      expect(i).toBeGreaterThan(-1);
      const line = code.slice(code.lastIndexOf('\n', i), code.indexOf('\n', i));
      expect(line).toContain('try {');
      expect(line).toContain('catch');
    }
  });
});
