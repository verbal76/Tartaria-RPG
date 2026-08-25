// OTA-1499 — ★ MEANS BARE, THE ARROWS MEAN COMPARED.
//
// ⚠⚠⚠ THE OWNER, 2026-08-25: *"i have been thinking of the star on the
// take / salvage screen. what if star was for a slot that isn't filled, and we
// put a green up or red down arrow on an item and the slots name so we can
// compare it in relation [real] time."*
//
// THE VOCABULARY, three states plus silence, every one naming its slot:
//   ★ → off hand          the slot is BARE — taking it displaces nothing
//   ▲ → main hand         it BEATS what is worn there — one tap swaps it in
//   ▼ main hand · → pack  it LOSES to what is worn — the tap only pockets it
//   (no mark)             nothing honest to compare — catalog can't rule
//
// ⚠⚠ ONE DERIVATION, LAYERED: `equipVerdict` does not re-decide anything.
// `isUpgradeOverEquipped` still rules IF the tap equips (so ★ and ▲ rows
// take-and-wear exactly as before, and ▼ rows plain-take exactly as before);
// `upgradeEquipSlot` still rules WHERE (its better-than-main and
// range-coverage policies untouched). The verdict only names whether that
// destination was bare — which is the entire difference between ★ and ▲.

import React from 'react';
import renderer from 'react-test-renderer';
import {
  equipVerdict, equipSlotWord, gatherIcon, isUpgradeOverEquipped,
} from '../app/engine/gatherSort';
import { GatherModal } from '../app/components/GatherModal';
import type { PlayerCharacter } from '../app/engine/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const bare = (): PlayerCharacter =>
  ({ name: 'T', inventory: [], equipment: {}, stats: {} } as unknown as PlayerCharacter);

/** Rusted Blade 1d6 · Cudgel 1d8, straight from the weapons catalog. */
const armed = (main: string, off?: string): PlayerCharacter =>
  ({
    name: 'T',
    inventory: [
      { id: 'w1', name: main, kind: 'weapon', quantity: 1 },
      ...(off ? [{ id: 'w2', name: off, kind: 'weapon', quantity: 1 }] : []),
    ],
    equipped: { main, ...(off ? { off } : {}) },
    equipment: {},
    stats: {},
  } as unknown as PlayerCharacter);

describe('OTA-1499 — the verdict itself', () => {
  it('⚠⚠⚠ ★ ONLY FOR A BARE SLOT — both hands and armor', () => {
    expect(equipVerdict(bare(), 'Cudgel')).toEqual({ slot: 'main', state: 'empty' });
    expect(equipVerdict(bare(), "Mud-Warden's Vest")).toEqual({ slot: 'chest', state: 'empty' });
    // main full, off free, weaker weapon → fills the bare off hand
    expect(equipVerdict(armed('Cudgel'), 'Rusted Blade')).toEqual({ slot: 'off', state: 'empty' });
  });

  it('⚠⚠⚠ ▲ WHEN IT BEATS AN OCCUPIED SLOT — the displace case', () => {
    // both hands full of 1d6; a 1d8 displaces the main (better-than-main rule)
    expect(equipVerdict(armed('Rusted Blade', 'Rusted Blade'), 'Cudgel'))
      .toEqual({ slot: 'main', state: 'up' });
  });

  it('⚠⚠⚠ ▼ WHEN IT LOSES — named against the slot it was measured on', () => {
    const v = equipVerdict(armed('Cudgel', 'Cudgel'), 'Rusted Blade');
    expect(v).toEqual({ slot: 'main', state: 'down' });
  });

  it('⚠⚠ SILENCE where nothing honest can be said', () => {
    expect(equipVerdict(bare(), 'rubble')).toBeNull();
    expect(equipVerdict(null, 'Cudgel')).toBeNull();
  });

  it('⚠⚠⚠ THE VERDICT NEVER CONTRADICTS THE TAP: ★/▲ ⟺ the one-tap equip rule', () => {
    // takeAndWear equips exactly when isUpgradeOverEquipped says yes. If a ▼
    // row ever read as equippable — or a ★ row as not — the mark would promise
    // an action the tap does not perform.
    const cases: Array<[PlayerCharacter, string]> = [
      [bare(), 'Cudgel'],
      [bare(), "Mud-Warden's Vest"],
      [armed('Cudgel'), 'Rusted Blade'],
      [armed('Rusted Blade', 'Rusted Blade'), 'Cudgel'],
      [armed('Cudgel', 'Cudgel'), 'Rusted Blade'],
    ];
    for (const [p, noun] of cases) {
      const v = equipVerdict(p, noun);
      const equips = isUpgradeOverEquipped(p, noun);
      expect({ noun, agree: (v?.state === 'empty' || v?.state === 'up') === equips })
        .toEqual({ noun, agree: true });
    }
  });

  it('⚠ the slot word is one spelling everywhere', () => {
    expect(equipSlotWord('main')).toBe('main hand');
    expect(equipSlotWord('off')).toBe('off hand');
    expect(equipSlotWord('chest')).toBe('chest');
  });
});

describe('OTA-1499 — the icon column speaks the same language', () => {
  it('⚠⚠ ★ / ▲ / ▼ by verdict; the lead ✦ still outranks everything', () => {
    expect(gatherIcon({ kind: 'weapon', upgrade: true, verdict: { slot: 'off', state: 'empty' } })).toBe('★');
    expect(gatherIcon({ kind: 'weapon', upgrade: true, verdict: { slot: 'main', state: 'up' } })).toBe('▲');
    expect(gatherIcon({ kind: 'weapon', upgrade: false, verdict: { slot: 'main', state: 'down' } })).toBe('▼');
    expect(gatherIcon({ kind: 'lead', upgrade: true, verdict: { slot: 'main', state: 'up' } })).toBe('✦');
  });

  it('⚠ a verdict-less caller still renders what it always did', () => {
    // Older fixtures and any code path that never computed a verdict keep the
    // pre-1499 glyphs — the vocabulary tightened, nothing broke underneath it.
    expect(gatherIcon({ kind: 'armor', upgrade: true })).toBe('★');
    expect(gatherIcon({ kind: 'weapon', upgrade: false })).toBe('⚔');
  });
});

describe('OTA-1499 — rendered rows carry the mark, the slot, and the action', () => {
  const textOf = (player: PlayerCharacter, noun: string): string => {
    const tree = renderer.create(
      <GatherModal
        visible player={player as never} chips={[{ noun }] as never} leadNouns={[]}
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
  };

  it('⚠⚠⚠ THE ▼ ROW EXISTS AT ALL — a downgrade used to render unmarked', () => {
    // The owner's real question was about a row like this one: "I don't know
    // how it compares — why would I just grab it?" Now it says: weaker than
    // your main hand, and the tap goes to the pack.
    const text = textOf(armed('Cudgel', 'Cudgel'), 'Rusted Blade');
    expect(text).toContain('▼');
    expect(text).toContain('▼ main hand · → pack');
  });

  it('⚠⚠ ▲ names the slot it displaces', () => {
    const text = textOf(armed('Rusted Blade', 'Rusted Blade'), 'Cudgel');
    expect(text).toContain('▲ → main hand');
  });

  it('⚠⚠ ★ still means a free fill, slot named', () => {
    expect(textOf(bare(), "Mud-Warden's Vest")).toContain('★ → chest');
    expect(textOf(armed('Cudgel'), 'Rusted Blade')).toContain('★ → off hand');
  });

  it('⚠ the screen reader hears the ▼ verdict too', () => {
    const tree = renderer.create(
      <GatherModal
        visible player={armed('Cudgel', 'Cudgel') as never}
        chips={[{ noun: 'Rusted Blade' }] as never} leadNouns={[]}
        onTake={() => {}} onSalvage={() => {}} onTakeAll={() => {}} onSalvageAll={() => {}}
        onInvestigate={() => {}} onCancel={() => {}}
      />,
    );
    const labels = (tree as unknown as { root: { findAll(f: (n: { props: Record<string, unknown> }) => boolean): Array<{ props: Record<string, unknown> }> } })
      .root.findAll((n) => typeof n.props?.accessibilityLabel === 'string')
      .map((n) => String(n.props.accessibilityLabel));
    expect(labels.some((l) => /Weaker than what is in your main hand/.test(l))).toBe(true);
    expect(labels.some((l) => /Tap to take it into your pack/.test(l))).toBe(true);
    tree.unmount();
  });
});
