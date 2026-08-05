// OTA-1134 — HALF. Owner: "there were sections that every move or rest was a
// fight … let's just 1/2 the chance percentage."
//
// THE ARITHMETIC HE WAS FEELING. The wasteland encounter roll was
// `0.58 auto-travel / 0.45 manual`, times the time-of-day multiplier
// (1.3 night / 0.85 day) — so **75% per step auto-travelling after dark**.
// And the gate that is supposed to space encounters out does the opposite for
// the player who needs it most: `tileIsNovel` tests `recentTileHistory`, which
// starts EMPTY, so a brand-new character has every tile novel and rolls the
// full chance every single step, while an established player working known
// ground rolls far less often. The rate peaked exactly where the character was
// weakest. Owner, unprompted, on his own play pattern: "I have been starting
// new characters and running them through the paces for 1 to 2 capitals. So of
// course it looked rough — the 50 paces thing was beating me up since it was
// early game."
//
// ⚠ WHY A FLAT HALVING AND NOT AN EARLY-GAME RAMP. A ramp climbing to full
// rate over ~25 tiles was proposed first and the owner rejected it on sight:
// "the 25 step block means they can make it to half of the capitals with no
// encounters." He is right, and the reasoning generalises — the problem was
// never that the early game deserves a discount, it is that the BASELINE was
// too high for everybody and the novelty gate made the opening the place you
// noticed it. A ramp would have papered over a bad number with a second
// mechanic, and bought a dead opening in exchange.
//
// NOT TOUCHED, on the owner's instruction:
//   • Late-game scaling — "I don't think the numbers for later in the game
//     need adjusted yet, they should be tied to a difficulty level choice in
//     character creation." That knob exists (engine/pressure.ts); wiring it is
//     its own job, logged in HANDOFF.
//   • REST ambush (22% wild / 8% hub) — measured before touching it, and the
//     two-for-two rest in the last device log is a ~5% coincidence, not a
//     broken roll.
//   • The novelty gate itself — it is doing the anti-farm job it was added for
//     (OTA-438), and halving the baseline is what actually fixes the symptom.

jest.setTimeout(20000);

import { encounterRateMultiplier } from '../app/engine/timeOfDay';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const store = src('app/state/gameStore.ts');

/** The one line every number in this suite is about. */
const ROLL_LINE = 'const baseRollChance = isAutoTravel ? 0.29 : 0.225;';

describe('OTA-1134 — the encounter roll is halved', () => {
  it('⚠ both baselines are exactly half of what they were', () => {
    expect(store).toContain(ROLL_LINE);
    expect(0.29).toBeCloseTo(0.58 / 2, 5);
    expect(0.225).toBeCloseTo(0.45 / 2, 5);
  });

  it('the old values are gone — no stale constant left to drift back', () => {
    expect(store).not.toContain('isAutoTravel ? 0.58 : 0.45');
  });

  it('⚠ the number the owner actually felt — 75% a step at night — is now ~38%', () => {
    // Night. hoursElapsed is hours-since-start; encounterRateMultiplier is the
    // only thing between the base and the roll.
    const night = 1.3;
    expect(Math.min(0.99, 0.58 * night)).toBeCloseTo(0.754, 2); // before
    expect(Math.min(0.99, 0.29 * night)).toBeCloseTo(0.377, 2); // after
  });

  it('the day / manual corner falls with it, and stays a real chance', () => {
    const day = 0.85;
    expect(0.29 * day).toBeCloseTo(0.2465, 3);
    expect(0.225 * day).toBeCloseTo(0.19125, 4);
    // Halving must not accidentally switch the wasteland off.
    expect(0.225 * day).toBeGreaterThan(0.15);
  });

  it('auto-travel stays MORE eventful than walking — the ordering is the design', () => {
    // OTA-713's point: you are in transit and exposed, so danger ticks faster.
    // A flat halving preserves the ratio exactly.
    expect(0.29).toBeGreaterThan(0.225);
    expect(0.29 / 0.225).toBeCloseTo(0.58 / 0.45, 5);
  });

  it('the time-of-day multiplier itself is untouched', () => {
    // 1.3 night / 0.85 day is shared with the rest-ambush roll, which the
    // owner did NOT ask to change and which measured fine.
    expect(encounterRateMultiplier(2)).toBe(1.3);
    expect(encounterRateMultiplier(13)).toBe(0.85);
    expect(encounterRateMultiplier(undefined)).toBe(1);
  });
});

describe('OTA-1134 — what was deliberately left alone', () => {
  it('⚠ REST ambush keeps its rates — measured, not assumed', () => {
    // 22% wild / 8% hub. Two rests ambushed in one log is ~5%, not a bug.
    expect(store).toContain('const restAmbushBase = restInSafeZone ? 0.08 : 0.22;');
  });

  it('⚠ there is no early-game ramp — the owner rejected it, with a reason', () => {
    // "the 25 step block means they can make it to half of the capitals with
    // no encounters." A ramp would paper over a bad baseline with a second
    // mechanic and buy a dead opening.
    expect(store).not.toMatch(/earlyStepsRamp|rampMult|newPlayerMult/);
  });

  it('the novelty gate still gates — the anti-farm job is untouched', () => {
    // OTA-438 added it because oscillating between two tiles farmed unlimited
    // encounters and loot. Halving the baseline does not weaken that.
    expect(store).toContain('const tileIsNovel = !!liveAfterStep && !history.includes(tileKey);');
    expect(store).toContain('const enc = tileIsNovel ? pickWastelandEncounter(');
  });

  it('the step threshold is unchanged — spacing was never the complaint', () => {
    expect(store).toContain('const baseThreshold = isAutoTravel ? 1 : 2;');
  });

  it('the change is DOCUMENTED at the constant, including why not a ramp', () => {
    const near = store.slice(store.indexOf('OTA-1134'), store.indexOf(ROLL_LINE));
    expect(near).toContain('1/2 the chance percentage');
    expect(near).toContain('capitals with no encounters');
    expect(near).toContain('pressure.ts');
  });
});
