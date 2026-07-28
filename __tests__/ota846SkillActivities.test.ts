// OTA-846 — "Grows from:" accuracy guard.
//
// The CharacterScreen renders SKILL_ACTIVITIES[stat] under each core stat as
// "how it is earned." An audit (2026-07-16) found two of the six blocks had
// drifted away from the actual trainStat() call sites in gameStore:
//
//   DEX — still advertised "Parry / dodge", but parry was retired in OTA-795;
//         and it omitted the finesse/ranged hit, jump, disengage, and escape
//         trainers that the code actually rewards.
//   STR — advertised "Heavy salvage / breaking", but salvage trains INT (not
//         STR), and it omitted the Fight-Back struggle trainer.
//   STE — accurate but under-sold: the stealth-gear passive was unlisted.
//
// These assertions pin the corrected copy so the display can't silently drift
// back to describing mechanics the engine no longer has.

import { SKILL_ACTIVITIES } from '../app/engine/statTraining';

describe('OTA-846 — SKILL_ACTIVITIES accuracy', () => {
  it('covers all six stats with at least one activity each', () => {
    (['strength', 'dexterity', 'intelligence', 'wisdom', 'charisma', 'stealth'] as const).forEach((k) => {
      expect(Array.isArray(SKILL_ACTIVITIES[k])).toBe(true);
      expect(SKILL_ACTIVITIES[k].length).toBeGreaterThan(0);
    });
  });

  it('DEX no longer advertises the retired parry mechanic', () => {
    const dex = SKILL_ACTIVITIES.dexterity.join(' ').toLowerCase();
    expect(dex).not.toContain('parry');
  });

  it('DEX lists its real trainers: finesse/ranged hits, dodge, jump, disengage, escape', () => {
    const dex = SKILL_ACTIVITIES.dexterity.join(' ').toLowerCase();
    expect(dex).toContain('finesse');
    expect(dex).toContain('dodg');
    expect(dex).toContain('jump');
    expect(dex).toContain('disengag');
    expect(dex).toContain('escap');
    expect(dex).toContain('climb');
  });

  it('STR drops the stale salvage line (salvage trains INT, not STR)', () => {
    const str = SKILL_ACTIVITIES.strength.join(' ').toLowerCase();
    expect(str).not.toContain('salvage');
  });

  it('STR lists the Fight-Back struggle trainer', () => {
    const str = SKILL_ACTIVITIES.strength.join(' ').toLowerCase();
    expect(str).toContain('fight-back');
  });

  it('STE surfaces the stealth-gear passive and the skill-check trainer', () => {
    const ste = SKILL_ACTIVITIES.stealth.join(' ').toLowerCase();
    expect(ste).toContain('passive');
    expect(ste).toContain('skill check');
  });
});
