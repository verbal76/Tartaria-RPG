// OTA-1486 — WIELD IS NOT WEAR.
//
// ⚠⚠ Owner, closing a defect that sat in the log-blocked pile for days:
// *"one of them was an axe, the other was a knife."* That named the whole bug.
// The take-&-wear chip has offered WEAPON upgrades since OTA-1252 (an empty
// hand is an empty slot), and a weapon's slot is the hand — so the axe and the
// knife landing in his hand was the EQUIP DOING ITS JOB. What was wrong was
// the sentence over the button: "⬆ Take & wear Mud Long Axe" promised an
// armor action, so a correct result read as a defect. The earlier analysis
// ("validSlotsForItem never returns hand+armor for one item") was right that
// no slot bug existed — the slot was never wrong; the VERB was.
//
// The claim pinned here is verb-kind agreement, not button copy (ota1457's
// rule — five label-shaped pins broke in two days): a hand-slot chip never
// says "wear", a worn-slot chip never says "wield", and the button face and
// the screen-reader sentence always agree on which verb the action deserves.

import {
  pickFeedActionChip,
  feedActionChipLabel,
  feedActionChipA11yLabel,
  type GatherChipRow,
  type FeedActionChip,
} from '../app/engine/feedActionChip';
import type { PlayerCharacter } from '../app/engine/types';

// A player holding and wearing nothing, so any catalog piece is an upgrade
// over bare skin / an empty hand — same fixture shape as ota1457.
function bare(): PlayerCharacter {
  return {
    name: 'Test', inventory: [], equipment: {}, stats: {},
  } as unknown as PlayerCharacter;
}
const rows = (...r: Array<[string, boolean]>): GatherChipRow[] =>
  r.map(([noun, consumed]) => ({ noun, consumed }));

const verbOf = (s: string): 'wield' | 'wear' | 'both' | 'neither' => {
  const t = s.toLowerCase();
  const wield = t.includes('wield');
  const wear = t.includes('wear');
  return wield && wear ? 'both' : wield ? 'wield' : wear ? 'wear' : 'neither';
};

describe('OTA-1486 — the owner\'s exact case: an axe and a knife', () => {
  const axe = pickFeedActionChip(bare(), rows(['Mud Long Axe', false]));
  const knife = pickFeedActionChip(bare(), rows(['Pocket Knife', false]));

  it('⚠⚠ both are still OFFERED, and still go to the hand — the equip was never the bug', () => {
    // The OTA-1252 behavior is untouched: a weapon into an empty hand is an
    // upgrade and the chip carries the hand slot the equip will use.
    for (const chip of [axe, knife]) {
      expect(chip).not.toBeNull();
      expect(['main', 'off']).toContain(chip!.slot);
    }
  });

  it('⚠⚠ a hand-slot chip says WIELD and never WEAR — face and sentence alike', () => {
    for (const chip of [axe!, knife!]) {
      expect(verbOf(feedActionChipLabel(chip))).toBe('wield');
      expect(verbOf(feedActionChipA11yLabel(chip))).toBe('wield');
    }
  });

  it('⚠ the spoken sentence names the actual hand, not a raw slot token', () => {
    // "wear it as your main" was the a11y version of the same lie. A hand slot
    // reads as a hand: "in your main hand" / "in your off hand".
    for (const chip of [axe!, knife!]) {
      expect(feedActionChipA11yLabel(chip)).toMatch(/in your (main|off) hand/);
      // The displacement warning survives the rewording — it is the fact that
      // could cost somebody their equipped weapon.
      expect(feedActionChipA11yLabel(chip).toLowerCase()).toContain('replaces');
    }
  });
});

describe('OTA-1486 — armor keeps its verb', () => {
  const vest = pickFeedActionChip(bare(), rows(["Mud-Warden's Vest", false]));

  it('⚠⚠ a worn-slot chip says WEAR and never WIELD — face and sentence alike', () => {
    expect(vest).not.toBeNull();
    expect(['main', 'off']).not.toContain(vest!.slot);
    expect(verbOf(feedActionChipLabel(vest!))).toBe('wear');
    expect(verbOf(feedActionChipA11yLabel(vest!))).toBe('wear');
  });
});

describe('OTA-1486 — the two strings cannot drift apart', () => {
  it('⚠⚠ label and a11y agree on the verb for EVERY slot the type admits', () => {
    // Not just the slots the catalog happens to produce today: any future slot
    // value routed through these functions gets one verb, in both strings.
    for (const slot of ['main', 'off', 'head', 'chest', 'legs', 'feet', 'hands', 'back']) {
      const chip = { noun: 'thing', slot, itemName: 'Thing' } as unknown as FeedActionChip;
      const label = verbOf(feedActionChipLabel(chip));
      expect(label).not.toBe('both');
      expect(label).not.toBe('neither');
      expect(verbOf(feedActionChipA11yLabel(chip))).toBe(label);
    }
  });
});
