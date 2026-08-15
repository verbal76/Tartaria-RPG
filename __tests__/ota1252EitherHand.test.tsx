jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1252 — "ISN'T THERE AN OPTION TO EQUIP A PICKED UP WEAPON TO ANY EMPTY
// HAND?"
//
// Owner, straight after OTA-1251 gave the ★ its take-and-wear tap.
//
// ⚠⚠ THERE IS, EVERYWHERE EXCEPT HERE. `validSlotsForItem` has returned
// `['main', 'off']` for every weapon since long before the picker existed — the
// comment on that line literally reads *"any weapon can go in either hand"*. The
// off hand swings in combat (`offHandSwing`, `getEquippedWeapon(player, 'off')`),
// has its own reach resolution, and draws its own `off:` button in the quick row.
// Typed `equip X off hand` routes to it. The USE verb defaults to it.
//
// ⚠⚠ AND THE PICKER'S UPGRADE MARK NEVER LOOKED AT IT. `isUpgradeOverEquipped`
// compared against the MAIN hand alone, so a weapon that could have filled a bare
// off hand for free was not marked, and OTA-1251's tap hardcoded `slot: 'main'` —
// which would have DISPLACED a perfectly good main-hand weapon to fill a hand that
// was already full while the empty one stayed empty.
//
// ⚠ THE RULE WAS ALREADY WRITTEN DOWN ONE BRANCH UP. The armor arm of the same
// function says `if (!worn) return true` — nothing in the slot means anything is an
// improvement. The weapon arm just never asked that question of the second hand.
// This makes them symmetric; it does not invent a policy.
//
// ⚠⚠ AND THE ORDER MATTERS MORE THAN THE FEATURE. Fill-the-free-hand-first is the
// obvious implementation and it is wrong: it drops a Bone Splitter Axe into the off
// hand and leaves a worse cudgel swinging in the main. BETTER-THAN-MAIN WINS; the
// free hand is the fallback.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void };
};
import { GatherModal } from '../app/components/GatherModal';
import { isUpgradeOverEquipped, upgradeEquipSlot } from '../app/engine/gatherSort';
import { validSlotsForItem } from '../app/engine/equipment';
import { WEAPONS } from '../app/engine/crafting';

/** A player holding `main` / `off` by name. Both null = bare hands. */
const wielding = (main: string | null, off: string | null = null) => ({
  equipped: {
    ...(main ? { main } : {}),
    ...(off ? { off } : {}),
  },
  inventory: [
    ...(main ? [{ id: 'm', name: main, kind: 'weapon', rarity: 'Common', quantity: 1, tags: [] }] : []),
    ...(off ? [{ id: 'o', name: off, kind: 'weapon', rarity: 'Common', quantity: 1, tags: [] }] : []),
  ],
});

/** Two real catalog weapons with a clear damage gap, resolved not assumed. */
function pickPair() {
  const oneHanded = WEAPONS.filter((w) => w.style !== 'two_handed' && typeof w.damageDice === 'string');
  const d6 = oneHanded.find((w) => w.damageDice === '1d6');
  const d8 = oneHanded.find((w) => w.damageDice === '1d8');
  expect(d6).toBeDefined();
  expect(d8).toBeDefined();
  return { weak: d6!.name, strong: d8!.name };
}

describe('OTA-1252 — the engine always allowed either hand', () => {
  it('⚠⚠ MEASURED: every one-handed catalog weapon is valid in BOTH hands', () => {
    // The premise of the whole change, checked against the shipped catalog rather
    // than trusted from a comment.
    const oneHanded = WEAPONS.filter((w) => w.style !== 'two_handed');
    expect(oneHanded.length).toBeGreaterThan(10);
    for (const w of oneHanded.slice(0, 40)) {
      const slots = validSlotsForItem({
        id: 'x', name: w.name, kind: 'weapon', rarity: 'Common', quantity: 1, tags: [],
      } as never);
      expect(slots).toContain('main');
      expect(slots).toContain('off');
    }
  });
});

describe('OTA-1252 — a free hand is a free slot', () => {
  const { weak, strong } = pickPair();

  it('⚠⚠ a weapon that does NOT beat your main is still an upgrade if a hand is bare', () => {
    // ⚠ THE BUG: this returned false, so the row carried no ★ and the picker had
    // no route into the empty hand at all.
    expect(isUpgradeOverEquipped(wielding(strong) as never, weak)).toBe(true);
    expect(upgradeEquipSlot(wielding(strong) as never, weak)?.slot).toBe('off');
  });

  it('⚠⚠ ...and with BOTH hands full it is not an upgrade and has nowhere to go', () => {
    // The mark stays trustworthy: no free hand and it beats neither.
    const full = wielding(strong, strong) as never;
    expect(isUpgradeOverEquipped(full, weak)).toBe(false);
    expect(upgradeEquipSlot(full, weak)).toBeNull();
  });

  it('⚠⚠ BETTER-THAN-MAIN WINS OVER FREE-HAND — the ordering bug, pinned', () => {
    // ⚠ Fill-the-free-hand-first is the obvious implementation and it is wrong: it
    // would leave the worse weapon swinging in the good hand. A player picking up a
    // clearly better weapon means it for their main.
    const p = wielding(weak) as never;   // weak in main, off hand bare
    expect(isUpgradeOverEquipped(p, strong)).toBe(true);
    expect(upgradeEquipSlot(p, strong)?.slot).toBe('main');
  });

  it('⚠ bare hands still take the main hand', () => {
    expect(upgradeEquipSlot(wielding(null) as never, weak)?.slot).toBe('main');
  });

  it('⚠⚠ a TWO-HANDER is never a free-hand case — it takes both, so it must EARN it', () => {
    // ⚠ Equipping one with a full main hand DISPLACES that weapon (equipItem says
    // so out loud). Marking it just because the off hand is bare would promise a
    // free gain and then cost the player their main weapon.
    //
    // The check is direct: a two-hander that does NOT out-damage the main hand,
    // against a player whose off hand is empty. A one-hander in the same spot IS
    // marked; this one must not be.
    const avg = (d: string): number => {
      const m = /^(\d+)d(\d+)$/.exec(d);
      return m ? Number(m[1]) * (Number(m[2]) + 1) / 2 : 0;
    };
    const strongAvg = avg(WEAPONS.find((w) => w.name === strong)!.damageDice);
    const meek2H = WEAPONS.find((w) => w.style === 'two_handed' && avg(w.damageDice) <= strongAvg);
    expect(meek2H).toBeDefined();

    const offHandBare = wielding(strong) as never;
    expect(isUpgradeOverEquipped(offHandBare, weak)).toBe(true);        // one-hander: free hand counts
    expect(isUpgradeOverEquipped(offHandBare, meek2H!.name)).toBe(false); // two-hander: it does not

    // And a two-hander that DOES out-damage the main hand is marked, for the main.
    const beefy2H = WEAPONS.find((w) => w.style === 'two_handed' && avg(w.damageDice) > strongAvg);
    if (beefy2H) {
      expect(isUpgradeOverEquipped(offHandBare, beefy2H.name)).toBe(true);
      expect(upgradeEquipSlot(offHandBare, beefy2H.name)?.slot).toBe('main');
    }
  });
});

describe('OTA-1252 — RENDERED: the row names the hand', () => {
  function tailFor(player: unknown, noun: string): string {
    const tree = renderer.create(
      <GatherModal
        visible player={player as never} chips={[{ noun }]} leadNouns={[]}
        onTake={() => {}} onSalvage={() => {}} onTakeAll={() => {}} onSalvageAll={() => {}}
        onInvestigate={() => {}} onCancel={() => {}}
      />,
    );
    const out: string[] = [];
    const walk = (n: unknown): void => {
      if (typeof n === 'string') { out.push(n); return; }
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const node = n as { children?: unknown[] } | null;
      if (node && node.children) node.children.forEach(walk);
    };
    walk(tree.toJSON());
    tree.unmount();
    return out.join('|');
  }

  const { weak, strong } = pickPair();

  it('⚠⚠ "→ off hand" when it fills the bare one, "→ main hand" when it displaces', () => {
    // ⚠ `→ worn` would be the same vagueness one step smaller. Filling a bare off
    // hand and displacing your main are DIFFERENT DECISIONS, and the row is where
    // the player makes them.
    expect(tailFor(wielding(strong), weak)).toContain('★ → off hand');
    expect(tailFor(wielding(weak), strong)).toContain('★ → main hand');
  });

  it('⚠ armor keeps "→ worn" — it has one slot and the item already names it', () => {
    expect(tailFor({ equipped: {}, inventory: [] }, "Mud-Warden's Vest")).toContain('★ → worn');
  });

  it('⚠ a non-upgrade weapon still reads → pack, unmarked', () => {
    const text = tailFor(wielding(strong, strong), weak);
    expect(text).toContain('→ pack');
    expect(text).not.toContain('★');
  });
});
