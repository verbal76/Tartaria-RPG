// OTA-1117 — GEAR LISTS TELL THE TRUTH (from the device, 2026-08-04).
//
// Owner: "went to upgrade at the fuse and it only allowed me to pick armor no
// weapons. this was at foreman draft halloways stall."
//
// Root cause, and it is not a bug in the Crucible: the upgrade grants a COATING
// CHANNEL, and roughly half the weapon catalog is energy-based (runecasters, burn
// / aetheric / electrical casters) with no edge to carry a coating. The picker
// rendered `section.items.length === 0 ? null : …`, so the WEAPONS heading simply
// vanished — a permanent design rule reading as a broken screen. Nothing on the
// device could tell the two apart.
//
// Plus the owner's standing sorting rule: "whenever a list of armor or weapons
// pops up sort equipped items to the top", and specifically "when you open the
// repair tab, it should prioritize all of the things that are equipped that can
// be repaired at the top."

jest.setTimeout(20000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { crucibleUpgradeVerdict, isWeaponRow } from '../app/engine/itemFusion';
import { wornInstanceIds, byWornFirst, equippedInstanceIds } from '../app/engine/equipment';
import { findWeaponByName } from '../app/engine/crafting';
import weaponsData from '../app/data/items/weapons.json';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i1', name: 'Thing', kind: 'misc', quantity: 1, tags: [],
  ...over,
} as InventoryItem);

// Pick real catalog names so the verdict is exercised through the same lookup the
// game uses, not through a hand-built fixture that could drift from the data.
const catalogWeapons = (weaponsData as { weapons: { name: string; weaponKind: string; damageType: string }[] }).weapons;
const coatableName = catalogWeapons.find((w) => w.weaponKind === 'melee' && w.damageType === 'slashing')!.name;
const energyName = catalogWeapons.find((w) => w.weaponKind === 'runecaster')!.name;

describe('OTA-1117 #1 — the Crucible says WHY a weapon cannot be upgraded', () => {
  it('a physical weapon is offered', () => {
    const v = crucibleUpgradeVerdict(item({ name: coatableName, kind: 'weapon' }));
    expect(v).toEqual({ kind: 'weapon', blocked: null });
  });

  it('an ENERGY weapon is refused with the reason the player was never shown', () => {
    const v = crucibleUpgradeVerdict(item({ name: energyName, kind: 'weapon' }));
    expect(v.kind).toBeNull();
    expect(v.blocked).toMatch(/no edge to carry a coating/i);
  });

  it('a weapon that already has two channels says so rather than disappearing', () => {
    const v = crucibleUpgradeVerdict(item({ name: coatableName, kind: 'weapon', coatingSlots: 2 }));
    expect(v.kind).toBe('weapon');
    expect(v.blocked).toMatch(/already carries two coating channels/i);
  });

  it('armor is offered once, then refused with its reason', () => {
    const bare = item({ id: 'a1', name: 'Padded Vest', kind: 'armor' });
    expect(crucibleUpgradeVerdict(bare)).toEqual({ kind: 'armor', blocked: null });
    const done = item({ id: 'a2', name: 'Padded Vest', kind: 'armor', resistCapBonus: 1 });
    expect(crucibleUpgradeVerdict(done).blocked).toMatch(/already carries an extra resist channel/i);
  });

  it('a great-climb reward keeps its own refusal (collect_only outranks everything)', () => {
    const v = crucibleUpgradeVerdict(item({ name: 'Beacon Rifle', kind: 'weapon', tags: ['collect_only'] }));
    expect(v.kind).toBeNull();
    expect(v.blocked).toMatch(/great climbs/i);
  });

  it('EVERY blocked case carries a reason — the picker can never render a silent gap', () => {
    const cases = [
      item({ name: energyName, kind: 'weapon' }),
      item({ name: coatableName, kind: 'weapon', coatingSlots: 2 }),
      item({ name: 'Padded Vest', kind: 'armor', resistCapBonus: 1 }),
      item({ name: 'Beacon Rifle', kind: 'weapon', tags: ['collect_only'] }),
      item({ name: 'Scrap Metal', kind: 'misc' }),
    ];
    for (const c of cases) {
      const v = crucibleUpgradeVerdict(c);
      expect(typeof v.blocked).toBe('string');
      expect(v.blocked!.length).toBeGreaterThan(10);
    }
  });

  it('the WEAPONS heading has real content to explain — a large slice of the catalog can never take a channel', () => {
    // This is the fact behind the report. If it ever drops to zero the honesty
    // layer is dead weight; if it is non-trivial the layer is load-bearing.
    const blocked = catalogWeapons.filter(
      (w) => crucibleUpgradeVerdict(item({ name: w.name, kind: 'weapon' })).kind === null,
    );
    expect(blocked.length).toBeGreaterThan(50);
  });

  it('isWeaponRow files catalog weapons under WEAPONS even with no kind field', () => {
    expect(isWeaponRow(item({ name: coatableName, kind: undefined }))).toBe(true);
    expect(isWeaponRow(item({ name: 'Scrap Metal', kind: 'misc' }))).toBe(false);
    expect(findWeaponByName(energyName)).toBeTruthy(); // the fixture is a real weapon
  });
});

describe('OTA-1117 #2 — worn gear floats to the top of every gear list', () => {
  const mkPlayer = (): PlayerCharacter => ({
    name: 'T', inventory: [], equipped: {},
  } as unknown as PlayerCharacter);

  it('wornInstanceIds counts the DOG vest, which equippedInstanceIds cannot see', () => {
    const vest = item({ id: 'vest1', name: 'Hide Wrap', kind: 'dog_armor' });
    const p = {
      ...mkPlayer(),
      inventory: [vest],
      equipped: {},
      dog: { name: 'Rook', equipped: { vest: 'Hide Wrap', vestId: 'vest1' } },
    } as unknown as PlayerCharacter;
    expect(equippedInstanceIds(p).has('vest1')).toBe(false);
    expect(wornInstanceIds(p).has('vest1')).toBe(true);
  });

  it('a legacy save with only the vest NAME still resolves the worn instance', () => {
    const vest = item({ id: 'vest9', name: 'Hide Wrap', kind: 'dog_armor' });
    const p = {
      ...mkPlayer(),
      inventory: [vest],
      equipped: {},
      dog: { name: 'Rook', equipped: { vest: 'Hide Wrap' } },
    } as unknown as PlayerCharacter;
    expect(wornInstanceIds(p).has('vest9')).toBe(true);
  });

  it('byWornFirst floats worn pieces and leaves the rest to the caller-s axis', () => {
    const worn = new Set(['b']);
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect([...rows].sort(byWornFirst(worn)).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    // Nothing worn → the comparator is inert, order preserved.
    expect([...rows].sort(byWornFirst(new Set())).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('OTA-1117 #3 — source locks on the lists that must not regress', () => {
  const read = (p: string): string => require('fs').readFileSync(require('path').join(__dirname, '..', p), 'utf8');

  it('the REPAIR tab sorts worn gear above every axis, direction-independent', () => {
    const src = read('app/screens/CraftingScreen.tsx');
    // The pre-key must sit OUTSIDE the switch (so it applies to READY / DURABILITY
    // / NAME / COST alike) and must not be multiplied by `dir`.
    expect(src).toContain('if (a.worn !== b.worn) return a.worn ? -1 : 1;');
    expect(src).toContain('wornInstanceIds(player)');
  });

  it('the Crucible upgrade list renders BOTH headings unconditionally', () => {
    const src = read('app/components/FusionPickerModal.tsx');
    // The old `section.items.length === 0 ? null : …` is what hid WEAPONS.
    expect(src).not.toContain('section.items.length === 0 ? null');
    expect(src).toContain('section.group.open.length === 0 &&');
    expect(src).toContain('section.group.blocked.map');
  });

  it('the inventory list and both coating pickers take the worn pre-key', () => {
    const src = read('app/screens/InventoryScreen.tsx');
    expect(src).toContain('sortInventoryItems(fusionFiltered, sortKey, sortDirection, wornIds)');
    // Weapon picker AND armor picker.
    expect(src.match(/\.sort\(byWornFirst\(wornIds\)\)/g)?.length).toBe(2);
  });
});
