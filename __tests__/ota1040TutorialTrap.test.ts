/**
 * OTA-1040 — the tutorial climb softlock.
 *
 * Device report (4.28.73, Pixel 10 Pro XL, 2026-08-01): the player topped out
 * the tutorial climb, an Aetheric Raven spawned via the summit overlay, and
 * every command they tried was answered with
 *
 *     The Arbiter lifts a hand. "Not yet — do what I've asked of you, or tap
 *     SKIP TUTORIAL to set out on your own."
 *
 * Two independent defects stacked:
 *
 *   1. The lockdown accepted ONLY the current beat's verb. At the 'climb'
 *      beat that is `climb` and nothing else — so with a live enemy on the
 *      board the player could not attack, flee, sneak, or use an item. The
 *      only escape was `climb down`, which nothing told them about.
 *   2. The refusal never restated the pending instruction, so once the
 *      Arbiter's line scrolled off the feed there was no way to recover it.
 *
 * Fixes under test: self-defence verbs always pass while enemies are live,
 * and every lockdown-gated beat carries a `remind` string.
 */
import {
  TUTORIAL_STEPS,
  TUTORIAL_SELF_DEFENCE,
} from '../app/components/tutorialSteps';

/** The beat ids the typed-input lockdown gates (gameStore, arb108). */
const LOCKED_BEATS = [
  'name',
  'cudgel',
  'rope',
  'scrap',
  'climb',
  'investigate',
  'explore_or_leave',
];

describe('OTA-1040 — tutorial refusal restates the pending step', () => {
  it('every lockdown-gated beat carries a remind string', () => {
    for (const id of LOCKED_BEATS) {
      const step = TUTORIAL_STEPS.find((s) => s.id === id);
      expect(step).toBeDefined();
      expect(typeof step!.remind).toBe('string');
      expect(step!.remind!.length).toBeGreaterThan(0);
    }
  });

  it('remind reads as a mid-sentence clause (lowercase, no trailing period)', () => {
    // It is interpolated as: `"Not yet — ${remind}. Or tap SKIP TUTORIAL…"`
    for (const id of LOCKED_BEATS) {
      const remind = TUTORIAL_STEPS.find((s) => s.id === id)!.remind!;
      expect(remind.charAt(0)).toBe(remind.charAt(0).toLowerCase());
      expect(remind.endsWith('.')).toBe(false);
    }
  });

  it('the climb beat names both ways out — up and down', () => {
    // The reported softlock: the player did not know `climb down` existed.
    const remind = TUTORIAL_STEPS.find((s) => s.id === 'climb')!.remind!;
    expect(remind).toMatch(/climb down/i);
  });

  it('the produced refusal names the action instead of scolding', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'climb')!;
    const line = `The Arbiter lifts a hand. "Not yet — ${step.remind}. Or tap SKIP TUTORIAL to set out on your own."`;
    expect(line).not.toMatch(/do what I've asked of you/);
    expect(line).toMatch(/climb/i);
  });
});

describe('OTA-1040 — the lockdown yields to a live enemy', () => {
  it('passes the verbs a cornered player needs', () => {
    const needed = [
      'attack the raven',
      'attack with the cudgel',
      'shoot the raven',
      'kick',
      'punch',
      'throw rock',
      'flee',
      'escape',
      'retreat',
      'dodge',
      'sneak',
      'hide',
      'use first aid kit',
      'drink ration',
      'equip cudgel',
      'talk down the raven',
    ];
    for (const cmd of needed) {
      expect(TUTORIAL_SELF_DEFENCE.test(cmd)).toBe(true);
    }
  });

  it('still holds the lockdown on world verbs', () => {
    // The escape hatch is self-defence only — it must not become a way to
    // walk out of the tutorial sideways by typing an unrelated system verb.
    const blocked = [
      'fuse',
      'craft a vest',
      'salvage the plate',
      'rest',
      'travel north',
      'investigate the wall',
      'buy rope',
      'sell cudgel',
    ];
    for (const cmd of blocked) {
      expect(TUTORIAL_SELF_DEFENCE.test(cmd)).toBe(false);
    }
  });

  it('matches on word boundaries, not substrings', () => {
    // 'use' inside 'because', 'hit' inside 'whither', 'run' inside 'runic'.
    expect(TUTORIAL_SELF_DEFENCE.test('because')).toBe(false);
    expect(TUTORIAL_SELF_DEFENCE.test('runic seal')).toBe(false);
    expect(TUTORIAL_SELF_DEFENCE.test('whither')).toBe(false);
  });
});
