// OTA-1493 — THE WARM WAITS FOR THE PLAYER.
//
// ⚠⚠ THE RECEIPTS, server-side at last (sentry-inbox/crash_*): six
// native-death reports across four days, five builds, both product lines —
// and every single one is "no action yet", killed at ctx-open /
// ctx-open-done / ctx-release / ctx-release-done / rendered. The
// 3s-after-boot Qwen warm held ~425MB against a boot already paying for the
// classifier, the voice and first render, and the OS collected. Owner:
// *"do the deferred warm."*
//
// The design: boot ARMS the warm (all three boot paths), the first player
// action FIRES it, once, at the same gameStore door that stamps the OTA-1276
// breadcrumb. The completion-crash guard is re-checked at fire time, exactly
// as the timer used to re-check it at +3s. The watchdog cannot preempt the
// deferral because startQwenWatchdog is called from inside bootQwen and
// nowhere else — deferring the boot defers the watchdog with it.

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  armQwenWarm, fireQwenWarmOnPlayerAction, qwenWarmReleased,
  _resetDeferredQwenWarmForTests,
} from '../app/ai/deferredQwenWarm';
import { between } from '../test-utils/srcBlock';
import { storeSource } from '../test-utils/storeSource';

const APP = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
const STORE = storeSource();

beforeEach(() => _resetDeferredQwenWarmForTests());
afterEach(() => _resetDeferredQwenWarmForTests());

describe('OTA-1493 — the latch', () => {
  it('⚠⚠ arm then act: the warm runs exactly once, ever', () => {
    let warms = 0;
    armQwenWarm(() => { warms += 1; });
    expect(warms).toBe(0);            // boot alone warms nothing now
    expect(qwenWarmReleased()).toBe(false);
    fireQwenWarmOnPlayerAction();
    expect(warms).toBe(1);
    expect(qwenWarmReleased()).toBe(true);
    fireQwenWarmOnPlayerAction();     // second action
    fireQwenWarmOnPlayerAction();     // third action
    expect(warms).toBe(1);
  });

  it('⚠⚠ act then arm: the warm cannot be dropped by ordering', () => {
    // The race the 3s timer used to hide: if the first action somehow lands
    // before the boot path arms, the arm fires immediately rather than
    // waiting for a second action that may never come.
    fireQwenWarmOnPlayerAction();
    let warms = 0;
    armQwenWarm(() => { warms += 1; });
    expect(warms).toBe(1);
  });
});

describe('OTA-1493 — every boot path arms instead of warming', () => {
  it('⚠⚠ three arm sites, zero 3-second qwen timers left', () => {
    expect((APP.match(/armQwenWarm\(/g) ?? []).length).toBe(3);
    expect(APP).not.toContain('}, 3000);');
    expect(APP).not.toContain('Defer Qwen init 3s');
  });

  it('⚠⚠ each armed warm RE-CHECKS the completion-crash guard at fire time', () => {
    // The timer re-checked shouldAttemptQwen at +3s; the deferral must
    // re-check at first-action time — the guard can trip between boot and act.
    const sites = APP.split('armQwenWarm(() => {').slice(1);
    expect(sites.length).toBe(3);
    for (const site of sites) {
      expect(site.slice(0, 700)).toContain('shouldAttemptQwen()');
    }
  });

  it('⚠ the boot stage says deferred, so About tells the truth while waiting', () => {
    expect((APP.match(/setStage\('qwen:deferred'\)/g) ?? []).length).toBe(3);
  });
});

describe('OTA-1493 — the release rides the single action door', () => {
  it('⚠⚠ fired at the OTA-1276 door, after the sprint note, before the breadcrumb', () => {
    const span = between(STORE, 'notePlayerActionForSprint();', 'stampLiveBreadcrumb({');
    expect(span).toContain('fireQwenWarmOnPlayerAction();');
  });

  it('⚠ the watchdog cannot preempt the deferral — it starts from bootQwen only', () => {
    expect((STORE.match(/startQwenWatchdog\(/g) ?? []).length).toBe(1);
  });
});
