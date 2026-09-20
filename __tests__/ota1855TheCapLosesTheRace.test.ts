/**
 * ⚠⚠⚠ OTA-1855 — THE EMERGENCY CAP MUST LOSE EVERY LEGITIMATE RACE.
 *
 * MEASURED, NOT HYPOTHETICAL. Owner's Pixel 10 Pro XL / Android 37, on OTA
 * 2026-09-19-1850, reported as "long lag on initial load":
 *
 *     23:54:03.845  process starts
 *     23:54:04.001  OTA state = Checking
 *     23:54:12.354  session/world resumes, character gate opens   (+8.353s)
 *     23:54:14.008  OTA state = Error                             (+10.007s)
 *
 * Two timers, in the wrong order. App.tsx's emergency boot-gate cap was a bare
 * `8000` while the boot-front OTA check asked for `10_000`. 8 < 10, so on EVERY
 * launch the network could not answer, the emergency hatch fired FIRST and the
 * player paid a fixed eight-second stall at the splash before they could pick a
 * character — and the check then reported its own timeout two seconds later,
 * into a gate that had already opened without it.
 *
 * WHAT THE CAP IS FOR, which is the whole argument: `hydrate()` rejecting, or
 * any boot step throwing before the check resolves, would leave the gate locked
 * forever and brick the player out of their own saves. It is a stuck-boot
 * escape hatch, NOT a second OTA timeout, so it has to sit strictly OUTSIDE the
 * budget it is protecting against and lose every honest race.
 *
 * WHY IT DRIFTED, and why a bigger literal would not have been a repair:
 * OTA-405 wrote the 8s cap; OTA-1453 later raised the check 5s → 10s for cold
 * radios, 120 lines away in a different function. Two independent magic numbers
 * with no expressed relationship, so one moved and the other did not. The cap is
 * now DERIVED from the budget, which makes the inversion unrepresentable.
 *
 * ⚠ THESE READ SOURCE RATHER THAN DRIVING FAKE TIMERS THROUGH TWELVE SECONDS OF
 * BOOT. The defect was an ORDERING RELATIONSHIP between two constants, and a
 * relationship is what a source-level invariant holds without flaking. The
 * behavioural halves — that a boot which fails hands over to a screen with doors
 * on it, and that a boot which never settles still gets its exit — are already
 * proven against a rendered App by ota1743TheBootGateHasAnExit.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const APP = read('App.tsx');
const OTA_HELPER = read('app', 'updates', 'checkAndApplyOTA.ts');

const numConst = (name: string): number => {
  const m = new RegExp(`const ${name} = ([\\d_]+);`).exec(APP);
  if (!m) throw new Error(`${name} not found in App.tsx`);
  return Number(m[1]!.replace(/_/g, ''));
};
const checkBudgetMs = () => numConst('BOOT_OTA_CHECK_TIMEOUT_MS');

/** ⚠⚠ IT READS THE OPERATOR, IT DOES NOT ASSUME IT. The first draft of this
 *  helper recomputed `budget + margin`, and under the negative control — the
 *  derivation flipped to `-`, reproducing the shipped 8s-vs-10s inversion
 *  exactly — the invariant test below stayed GREEN and only the source-text pin
 *  caught it. A helper that assumes the answer cannot test the question. */
const gateSafetyMs = (): number => {
  const m = /const OTA_GATE_SAFETY_TIMEOUT_MS = BOOT_OTA_CHECK_TIMEOUT_MS ([+-]) OTA_GATE_SAFETY_MARGIN_MS;/.exec(APP);
  if (!m) throw new Error('OTA_GATE_SAFETY_TIMEOUT_MS derivation not found in App.tsx');
  const budget = numConst('BOOT_OTA_CHECK_TIMEOUT_MS');
  const margin = numConst('OTA_GATE_SAFETY_MARGIN_MS');
  return m[1] === '+' ? budget + margin : budget - margin;
};

describe('OTA-1855 — the boot OTA budget, and the cap derived from it', () => {
  it('⚠⚠ the boot-front OTA check still asks for the full 10s cold-radio budget', () => {
    // OTA-1453's product decision, and this repair does NOT renegotiate it. A
    // shorter budget is how a cold radio misses an update for a whole session —
    // the owner reported that twice before it was raised.
    expect(checkBudgetMs()).toBe(10_000);
    expect(APP).toContain('checkTimeoutMs: BOOT_OTA_CHECK_TIMEOUT_MS,');
  });

  it('⚠⚠⚠ THE INVARIANT: the safety cap is strictly GREATER than that budget', () => {
    expect(gateSafetyMs()).toBeGreaterThan(checkBudgetMs());
  });

  it('⚠⚠⚠ and it is DERIVED, so the two can never drift apart again', () => {
    // The defect was two independent literals in two functions. A sum makes the
    // inversion unrepresentable: you cannot lower one without carrying the other.
    expect(APP).toMatch(
      /const OTA_GATE_SAFETY_TIMEOUT_MS = BOOT_OTA_CHECK_TIMEOUT_MS \+ OTA_GATE_SAFETY_MARGIN_MS;/,
    );
    expect(APP).toContain('}, OTA_GATE_SAFETY_TIMEOUT_MS);');
    // And the old bare literal is gone from the gate timer.
    expect(APP).not.toMatch(/\}, 8000\);/);
  });

  it('⚠⚠ the margin is a real margin, and a small one — this is an escape hatch', () => {
    const m = /const OTA_GATE_SAFETY_MARGIN_MS = ([\d_]+);/.exec(APP);
    expect(m).not.toBeNull();
    const margin = Number(m![1]!.replace(/_/g, ''));
    // All it has to cover is the JS between the check's own timeout firing and
    // App.tsx setting otaBootResolved on the same tick. Nowhere near a second
    // budget — a large margin would just be a slower version of the same stall.
    expect(margin).toBeGreaterThan(0);
    expect(margin).toBeLessThanOrEqual(5_000);
  });

  it('⚠⚠⚠ the cap CANNOT fire while the OTA check is still inside its own timeout', () => {
    // The defect stated as arithmetic over the real constants: at every instant
    // the check is legitimately still running, the cap has not elapsed.
    const budget = checkBudgetMs();
    const cap = gateSafetyMs();
    for (let t = 0; t <= budget; t += 250) expect(t).toBeLessThan(cap);
  });

  it('⚠⚠ the escape hatch still EXISTS for a genuinely stuck boot', () => {
    // Deriving it must not have deleted it. It still force-opens the gate, only
    // when nothing else has, and is still cleared on unmount.
    expect(APP).toContain('const otaGateSafetyCap = setTimeout(() => {');
    expect(APP).toContain('if (!useGameStore.getState().otaBootResolved) {');
    expect(APP).toContain('clearTimeout(otaGateSafetyCap);');
  });

  it('⚠⚠ the launch ordering holds end to end: check < gate cap < watchdog', () => {
    // The player should be released by the gate, not by the trouble screen.
    const w = /const BOOT_WATCHDOG_MS = ([\d_]+);/.exec(APP);
    expect(w).not.toBeNull();
    const watchdog = Number(w![1]!.replace(/_/g, ''));
    expect(checkBudgetMs()).toBeLessThan(gateSafetyMs());
    expect(gateSafetyMs()).toBeLessThan(watchdog);
  });

  it('⚠⚠ a normal OTA failure still releases the gate without waiting for the cap', () => {
    // The catch logs and falls through; the shared line after it opens GATE A.
    // That path is reached on error, on timeout and on "no update", and it does
    // not consult the safety timer at all.
    const tail = APP.slice(APP.indexOf('boot-front OTA check failed (proceeding to load)'));
    const open = tail.indexOf('useGameStore.setState({ otaBootResolved: true });');
    expect(open).toBeGreaterThan(-1);
    expect(tail.slice(0, open)).not.toContain('OTA_GATE_SAFETY_TIMEOUT_MS');
    // ⚠ and the 'applied' branch still returns FIRST, leaving the flag false so
    // a reloading context never opens a gate onto a bundle that is dying.
    expect(APP).toContain("if (otaResult === 'applied') {");
  });

  it('⚠ the OTA helper no longer documents a boot-front budget it does not have', () => {
    // The stale note said the boot-front shortened the check to ~5s. It has not
    // since OTA-1453, and that sentence is what made 8 > 5 look correct.
    expect(OTA_HELPER).not.toMatch(/shorter budget \(~5s\)/);
    expect(OTA_HELPER).toContain('BOOT_OTA_CHECK_TIMEOUT_MS');
  });

  it('⚠ the classifier readiness cap is a DIFFERENT timer and is untouched', () => {
    // GATE B, in TitleScreen, 5s. OTA-1855 governs GATE A only. If a later
    // repair moves this it should be a deliberate decision, not collateral.
    const title = read('app', 'screens', 'TitleScreen.tsx');
    expect(title).toContain('setTimeout(() => setBootGateCapReached(true), 5000);');
    expect(title).toContain('otaBootResolved && (classifierSettled || bootGateCapReached)');
  });
});
