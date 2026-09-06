// OTA-1094 — GEAR LISTS TELL THE TRUTH (from the device, 2026-08-04).
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
const catalogWeapons = (weaponsData as { weapons: { name: string; weaponKind: string; damageType: string; tags?: string[] }[] }).weapons;
const coatableName = catalogWeapons.find((w) => w.weaponKind === 'melee' && w.damageType === 'slashing')!.name;
// ⚠⚠ OTA-1561 — RETARGETED, NOT RELAXED. This used to pick a RUNE-CASTER as the
// "energy weapon that can never take a channel", and that was true right up until
// rune-casters got a channel of their own: the Crucible now works PASSIVES into
// them instead of a coating. The property this suite guards — a weapon that
// cannot be upgraded says WHY, out loud, instead of vanishing from the picker —
// is unchanged, and it still has a real subject: an energy RANGED weapon (a
// plasma thrower, a beam caster) genuinely has no channel of any kind.
const energyName = catalogWeapons.find(
  (w) => w.weaponKind === 'ranged' && (w.damageType === 'burn' || w.damageType === 'electrical'),
)!.name;
// …and the rune-caster is now pinned from the OTHER side: it must be OFFERED.
const runecasterName = catalogWeapons.find((w) => w.weaponKind === 'runecaster')!.name;

describe('OTA-1094 #1 — the Crucible says WHY a weapon cannot be upgraded', () => {
  it('a physical weapon is offered', () => {
    const v = crucibleUpgradeVerdict(item({ name: coatableName, kind: 'weapon' }));
    expect(v).toEqual({ kind: 'weapon', blocked: null });
  });

  it('an ENERGY weapon is refused with the reason the player was never shown', () => {
    const v = crucibleUpgradeVerdict(item({ name: energyName, kind: 'weapon' }));
    expect(v.kind).toBeNull();
    expect(v.blocked).toMatch(/no edge to carry a coating/i);
  });

  it('⚠ OTA-1561 — a RUNE-CASTER is now OFFERED, not refused: it takes passives', () => {
    // The owner hit the old refusal twice with Earthshaker. A rune-caster has no
    // edge and never will; what changed is that "no edge" stopped being the end
    // of the sentence.
    const v = crucibleUpgradeVerdict(item({ name: runecasterName, kind: 'weapon' }));
    expect(v.kind).toBe('runecaster');
    expect(v.blocked).toBeNull();
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

  it('the WEAPONS heading has real content to explain — a slice of the catalog can never take a channel', () => {
    // This is the fact behind the report. If it ever drops to zero the honesty
    // layer is dead weight; if it is non-trivial the layer is load-bearing.
    //
    // ⚠⚠ OTA-1644 — THE BAR MOVED 50 → 25, AND MOST OF THE OLD COUNT WAS THE BUG.
    // `crucibleUpgradeVerdict` routes through `isCoatableItem`, so every weapon
    // the coating gate wrongly refused ALSO arrived here as "can never take a
    // channel". That gate tested `damageType` as a proxy for physical form and
    // turned away 58 melee weapons with real edges — a steel axe head with a
    // magnetised core — plus 7 thrown weapons that ARE their own projectile.
    //
    // What is left is the honest set, and it is exactly what the OTA-1561
    // comment in itemFusion.ts already described: the energy LAUNCHERS (plasma
    // rifles, blasters, railguns), which have no channel of any kind because
    // nothing solid leaves them. 30 of them today. The layer is still
    // load-bearing; it is no longer inflated by weapons that should have been
    // upgradeable all along.
    const blocked = catalogWeapons.filter(
      (w) => crucibleUpgradeVerdict(item({ name: w.name, kind: 'weapon' })).kind === null,
    );
    expect(blocked.length).toBeGreaterThan(25);
    // ⚠ And the blocked set must be BEAMS ONLY. If a melee weapon or a thrown
    // weapon ever lands back in here, the OTA-1644 gate has regressed — which is
    // the assertion that makes lowering the bar safe rather than a test weakened
    // until it passed.
    expect(blocked.filter((w) => w.weaponKind === 'melee').map((w) => w.name)).toEqual([]);
    expect(
      blocked
        .filter((w) => (w.tags ?? []).some((t: string) => t === 'thrown' || t === 'sling'))
        .map((w) => w.name),
    ).toEqual([]);
  });

  it('isWeaponRow files catalog weapons under WEAPONS even with no kind field', () => {
    expect(isWeaponRow(item({ name: coatableName, kind: undefined }))).toBe(true);
    expect(isWeaponRow(item({ name: 'Scrap Metal', kind: 'misc' }))).toBe(false);
    expect(findWeaponByName(energyName)).toBeTruthy(); // the fixture is a real weapon
  });
});

describe('OTA-1094 #2 — worn gear floats to the top of every gear list', () => {
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

describe('OTA-1094 #3 — source locks on the lists that must not regress', () => {
  const read = (p: string): string => require('fs').readFileSync(require('path').join(__dirname, '..', p), 'utf8');

  // OTA-1096 — RETARGETED. Worn-first was an unconditional pre-key welded onto
  // every axis; it is now a real axis, and the DEFAULT one. Owner: "let's add
  // some different sorting options in the craft repair tab, still prioritize
  // equipped it's on top as default sort." Opening the tab is still worn-first
  // (the OTA-1094 ask, unchanged) — but picking NAME now sorts by name instead
  // of by name within worn and within unworn.
  it('the REPAIR tab opens on the EQUIPPED axis, and that axis puts worn gear first', () => {
    const src = read('app/screens/CraftingScreen.tsx');
    expect(src).toContain("useState('equipped')");
    expect(src).toContain("{ key: 'equipped', label: 'EQUIPPED' }");
    expect(src).toContain("case 'equipped': {");
    expect(src).toContain('if (a.worn !== b.worn) return (a.worn ? -1 : 1) * dir;');
    expect(src).toContain('wornInstanceIds(player)');
    // The old unconditional pre-key must be GONE, or the new axes are theatre.
    expect(src).not.toContain('if (a.worn !== b.worn) return a.worn ? -1 : 1;\n      switch');
  });

  // OTA-1098 — owner: "let's also add a select all to the repair tab." Repair has
  // no deferred step (the action IS the repair), so select-all collapses to
  // repair-all; the SEARCH BOX is what makes it a selection.
  it('REPAIR ALL acts on the FILTERED view, in display order, and only on READY rows', () => {
    const src = read('app/screens/CraftingScreen.tsx');
    // repairableView, not repairable — so searching narrows what the button mends.
    expect(src).toContain('() => repairableView.filter((r) => r.available).map((r) => r.item.id),');
    // ⚠ OTA-1552 — RETARGETED, NOT RELAXED. The screen-side `for` loop moved
    // into the store as `repairInventoryItems`, because the Crucible guard has
    // to be able to stop a run AND KEEP THE REST OF IT, and a loop living in a
    // click handler has nowhere to keep it. The two properties this line has
    // always guarded are both re-asserted, one here and one below:
    //   · REPAIR ALL still acts on exactly repairReadyInView, in that order;
    //   · it still reuses the single-row repair rather than a second path.
    expect(src).toContain('repairInventoryItems(repairReadyInView);');
    // It reuses the single-row action rather than growing a second repair path
    // that could disagree about cost, substitutions, or eligibility. The batch
    // is now one level down, so the proof is one level down with it.
    expect(src).not.toMatch(/consumeIngredientsList[\s\S]{0,200}repairAllReady/);
    const slice = read('app/state/slices/inventorySlice.ts');
    expect(slice).toContain("const verdict = get().repairInventoryItem(id, { allowIds: allow });");
    expect(slice).not.toMatch(/repairInventoryItems\([\s\S]{0,900}consumeIngredientsList/);
    // Hidden when there is nothing to do, rather than sitting there dead.
    // OTA-1102 — RETARGETED. The `&&` became the middle arm of a ternary when
    // the group bar took this slot: `{repairSelectMode ? (bar) : readyInView > 0
    // ? (REPAIR ALL) : null}`. The guarded condition is unchanged — REPAIR ALL
    // still only exists when there is something ready to mend.
    // ⚠ OTA-1720 — RETARGETED AGAIN. The else arm is now a fragment holding
    // REPAIR MY KIT, the (secondary) all-ready sweep, and a line saying what you
    // are short of when neither can be offered. The CLAIM is unchanged and is
    // pinned on the guards themselves: each button exists only when it has
    // something to do.
    expect(src).toContain('{repairEquippedInView.length > 0 && (');
    expect(src).toContain('{repairReadyInView.length > repairEquippedInView.length && (');
    // The sweep's label spells out what it adds over the kit button, so nobody
    // taps it expecting the quick fix and mends seven cudgels.
    expect(src).toMatch(/repairReadyInView\.length > repairEquippedInView\.length && \([\s\S]{0,900}repair everything listed/);
  });

  it('the ★ worn marker still shows on EVERY axis, so gear stays findable after a re-sort', () => {
    const src = read('app/screens/CraftingScreen.tsx');
    // Rendered off r.worn, never off the active sort key.
    expect(src).toContain("{r.worn ? '★ ' : ''}{r.item.name}");
    expect(src).toContain('EQUIPPED — this is what breaks mid-fight');
  });

  it('the Crucible upgrade list renders BOTH headings unconditionally', () => {
    const src = read('app/components/FusionPickerModal.tsx');
    // The old `section.items.length === 0 ? null : …` is what hid WEAPONS.
    expect(src).not.toContain('section.items.length === 0 ? null');
    expect(src).toContain('section.group.open.length === 0 &&');
    expect(src).toContain('section.group.blocked.map');
  });

  // OTA-1096 — owner: "let's add some different sorting options in the craft
  // repair tab". Three new axes, each with a real tie-break so the order is
  // deterministic rather than dependent on inventory insertion order.
  it('the REPAIR tab offers the three new axes, each ranked and tie-broken', () => {
    const src = read('app/screens/CraftingScreen.tsx');
    for (const axis of ['slot', 'rarity', 'kind']) {
      expect(src).toContain(`case '${axis}': {`);
      expect(src).toContain(`{ key: '${axis}',`);
    }
    // SLOT reuses the SAME head-to-toe ranks as the inventory screen, so "sorted
    // by slot" means one order across the game, not two that nearly agree.
    expect(src).toMatch(/REPAIR_SLOT_RANK[\s\S]{0,160}main: 0, off: 1, head: 2, chest: 3, hands: 4, legs: 5, feet: 6, cloak: 7, amulet: 8, ring: 9,/);
    const invSrc = read('app/screens/InventoryScreen.tsx');
    expect(invSrc).toMatch(/main: 0, off: 1, head: 2, chest: 3, hands: 4, legs: 5, feet: 6, cloak: 7, amulet: 8, ring: 9,/);
    // Gear with no equip slot sinks below the worn kit instead of scattering.
    expect(src).toContain('return s ? (REPAIR_SLOT_RANK[s] ?? 50) : 99;');
    // Every new axis falls through to a name tie-break.
    expect((src.match(/return byName\(a, b\);/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('the inventory list and both coating pickers take the worn pre-key', () => {
    const src = read('app/screens/InventoryScreen.tsx');
    expect(src).toContain('sortInventoryItems(fusionFiltered, sortKey, sortDirection, wornIds)');
    // Weapon picker AND armor picker.
    expect(src.match(/\.sort\(byWornFirst\(wornIds\)\)/g)?.length).toBe(2);
  });
});
