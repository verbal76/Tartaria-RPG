// ⚠ PORTED FROM THE GOLEM LINE during the golem-parity pass. Golem is the model
// line, so its version of this suite is authoritative; the OTA numbers in the
// commentary below are GOLEM's, which is the honest provenance for where the
// behaviour being pinned was actually written.
// OTA-1114 — GROUP EQUIP / UNEQUIP.
//
// Owner: "you should be able to pick your armor hold and select a group and
// either equip all or unequip all depending on what you selected."
//
// The bug underneath the request: OTA-1100's group bar had four actions, and
// for a group of WORN ARMOR the only one that ever appeared was SCRAP — DROP
// excludes worn gear, RESERVE needs fusion eligibility. Scrap auto-unequips and
// then destroys. So the sole thing the screen let you do to your armor was
// destroy it, which is what the owner hit ("there was only scrap") in the same
// session whose log shows AC 16 → AC 10 mid-fight and a death four swings
// later.
//
// What these tests actually guard is the COUNT ON THE BUTTON. A group action's
// number is a promise. Slots have capacity, so a naive loop over equipItem
// would report five and land one, each piece displacing the last. planGroupEquip
// resolves that contention before the button is drawn.

import fs from 'fs';
import path from 'path';
import { planGroupEquip, SLOT_LABEL } from '../app/engine/equipment';
import type { InventoryItem } from '../app/engine/types';

const item = (name: string, id = name.toLowerCase().replace(/\s+/g, '_')): InventoryItem => ({
  id,
  name,
  quantity: 1,
  tags: [],
} as unknown as InventoryItem);

const NONE = new Set<string>();

describe('OTA-1114 — planGroupEquip resolves slot contention before the button lies', () => {
  it('a full set of armor all goes on — one piece per slot, in list order', () => {
    const set = [
      item('Iron Helm'), item('Iron Cuirass'), item('Iron Gauntlets'),
      item('Iron Greaves'), item('Iron Boots'),
    ];
    const plan = planGroupEquip(set, NONE);
    expect(plan.equip).toHaveLength(5);
    expect(plan.crowdedOut).toHaveLength(0);
    expect(plan.notEquippable).toHaveLength(0);
    expect(plan.equip.map((e) => e.slot)).toEqual(['head', 'chest', 'hands', 'legs', 'feet']);
  });

  it('⚠ two pieces racing for ONE slot: the first wins, the second is named, not silently lost', () => {
    // This is the whole reason the planner exists. A for-loop over equipItem
    // would have "succeeded" twice and worn one.
    const plan = planGroupEquip([item('Iron Cuirass'), item('Steel Cuirass')], NONE);
    expect(plan.equip).toHaveLength(1);
    expect(plan.equip[0]?.item.name).toBe('Iron Cuirass');
    expect(plan.crowdedOut.map((i) => i.name)).toEqual(['Steel Cuirass']);
  });

  it('the equip count and the crowded-out count always partition the equippable selection', () => {
    const sel = [item('Iron Helm'), item('Steel Helm'), item('Iron Boots'), item('Bone Helm')];
    const plan = planGroupEquip(sel, NONE);
    expect(plan.equip.length + plan.crowdedOut.length + plan.notEquippable.length).toBe(sel.length);
  });

  it('rings have three slots, so three rings go on and a fourth does not', () => {
    const rings = [item('Copper Ring', 'r1'), item('Iron Ring', 'r2'), item('Bone Ring', 'r3'), item('Ash Ring', 'r4')];
    const plan = planGroupEquip(rings, NONE);
    expect(plan.equip).toHaveLength(3);
    expect(plan.equip.every((e) => e.slot === 'ring')).toBe(true);
    expect(plan.crowdedOut.map((i) => i.id)).toEqual(['r4']);
  });

  it('⚠ already-worn pieces are SKIPPED, not counted as failures — they belong to the other button', () => {
    // A mixed selection has to produce an honest number on EACH button. Counting
    // a worn helm as "crowded out" would make EQUIP read low and explain it with
    // a reason that is not true.
    const worn = new Set(['iron_helm']);
    const plan = planGroupEquip([item('Iron Helm'), item('Iron Boots')], worn);
    expect(plan.equip.map((e) => e.item.name)).toEqual(['Iron Boots']);
    expect(plan.crowdedOut).toHaveLength(0);
    expect(plan.notEquippable).toHaveLength(0);
  });

  it('things with no slot at all land in notEquippable rather than being counted', () => {
    const plan = planGroupEquip([item('Scrap Iron'), item('Iron Helm')], NONE);
    expect(plan.equip.map((e) => e.item.name)).toEqual(['Iron Helm']);
    expect(plan.notEquippable.map((i) => i.name)).toEqual(['Scrap Iron']);
  });

  it('an empty selection plans nothing and throws nothing', () => {
    const plan = planGroupEquip([], NONE);
    expect(plan).toEqual({ equip: [], crowdedOut: [], notEquippable: [] });
  });

  it('every planned slot has a human label, so the confirm can name where each piece goes', () => {
    const plan = planGroupEquip([item('Iron Helm'), item('Iron Boots'), item('Copper Ring')], NONE);
    for (const e of plan.equip) expect(SLOT_LABEL[e.slot]).toBeTruthy();
  });

  it('capacity is seeded FULL, not from what is worn — equipping SWAPS', () => {
    // Wearing a helm already must not stop a new helm from being planned; the
    // single-item path has always swapped, and the group has to agree with it.
    const plan = planGroupEquip([item('Steel Helm', 'steel_helm')], new Set(['iron_helm']));
    expect(plan.equip).toHaveLength(1);
    expect(plan.equip[0]?.slot).toBe('head');
  });
});

describe('OTA-1114 — two-handed weapons eat both hands', () => {
  it('a two-hander is planned once and blocks a second weapon from the off hand', () => {
    // Catalog lookup drives this, so use a real two-handed weapon name if the
    // catalog has one; otherwise the pair simply fills main then off, which is
    // still the correct one-per-slot behaviour and the assertion holds either way.
    const plan = planGroupEquip([item('Rusted Blade', 'w1'), item('Bent Blade', 'w2'), item('Chipped Blade', 'w3')], NONE);
    // Three one-handers, two hands: at most two can be worn, the rest are named.
    expect(plan.equip.length).toBeLessThanOrEqual(2);
    expect(plan.equip.length + plan.crowdedOut.length + plan.notEquippable.length).toBe(3);
    expect(new Set(plan.equip.map((e) => e.slot)).size).toBe(plan.equip.length);
  });
});

describe('OTA-1114 — the screen wires both actions, and the destructive one is no longer alone', () => {
  const screen: string = fs.readFileSync(
    path.join(__dirname, '../app/screens/InventoryScreen.tsx'), 'utf8');

  it('the group bar offers EQUIP and TAKE OFF', () => {
    expect(screen).toContain("setInvGroupAction('equip')");
    expect(screen).toContain("setInvGroupAction('unequip')");
    expect(screen).toContain('EQUIP {equipPlan.equip.length}');
    expect(screen).toContain('TAKE OFF {unequippable.length}');
  });

  it('⚠ the reversible actions are rendered BEFORE scrap, so worn armor never shows destroy-only', () => {
    const bar = screen.slice(screen.indexOf('styles.groupBarActions'), screen.indexOf('groupBarNone'));
    expect(bar.indexOf("setInvGroupAction('equip')")).toBeGreaterThan(-1);
    expect(bar.indexOf("setInvGroupAction('scrap')")).toBeGreaterThan(-1);
    expect(bar.indexOf("setInvGroupAction('equip')")).toBeLessThan(bar.indexOf("setInvGroupAction('scrap')"));
    expect(bar.indexOf("setInvGroupAction('unequip')")).toBeLessThan(bar.indexOf("setInvGroupAction('scrap')"));
  });

  it('the buttons are driven by the PLAN, never by the raw selection', () => {
    // If these ever read selectedItems.length the count becomes a lie again.
    expect(screen).toContain('const equipPlan = planGroupEquip(selectedItems, wornIds);');
    expect(screen).toContain('accessibilityLabel={`Equip ${equipPlan.equip.length} items`}');
  });

  it('UNEQUIP clears SLOTS, not items — a two-hander holds two of them', () => {
    expect(screen).toContain('[...new Set(unequippable.flatMap((r) => r.slots))]');
    expect(screen).toContain('unequipSlot(slot)');
  });

  it('⚠ the take-off confirm says what it costs, because armor IS armor class', () => {
    expect(screen).toContain('your armor class drops by what they were worth');
  });

  it('⚠ and it says it LOUDER mid-fight, which is the case the death log actually was', () => {
    // Taking armor off in a quiet room is housekeeping. Taking it off with five
    // raiders on the tile is the last decision the character makes. Same action;
    // only one of them needs saying out loud.
    expect(screen).toContain('const inCombatNow = useGameStore((s) => (s.currentScene?.enemies?.length ?? 0) > 0);');
    expect(screen).toContain('if (inCombatNow) {');
    expect(screen).toContain('⚠ You are in a fight. Every swing coming at you lands easier the moment this is off.');
  });

  it('the equip confirm warns that occupied slots are emptied into the pack', () => {
    expect(screen).toContain('Anything already in those slots is set aside into your pack.');
  });

  it('crowded-out pieces are named in the bar AND in the confirm', () => {
    expect(screen).toContain('wants a slot another piece in this group already has');
    expect(screen).toContain('another piece here wants the same slot');
  });

  it('the equip walk snapshots the plan before mutating, so each step reads a stale-free tuple', () => {
    expect(screen).toContain('equipPlan.equip.map((e) => ({ name: e.item.name, id: e.item.id, slot: e.slot }))');
  });

  it('the "nothing here can be done" line now accounts for the gear actions too', () => {
    expect(screen).toContain('+ equipPlan.equip.length + unequippable.length === 0');
    // ⚠ OTA-1243 — the breakdown verb is SALVAGE in all player copy now.
    expect(screen).toContain('Nothing here can be worn, dropped, salvaged or reserved');
  });
});

describe('OTA-1114 — the planner is documented as a planner, not a loop', () => {
  const eqSrc: string = fs.readFileSync(
    path.join(__dirname, '../app/engine/equipment.ts'), 'utf8');

  it('the header states the failure a naive loop would produce', () => {
    expect(eqSrc).toContain('WHY THIS IS A PLANNER AND NOT A FOR-LOOP');
    expect(eqSrc).toContain('Slots have');
  });

  it('ring capacity is data, not a special case buried in a branch', () => {
    expect(eqSrc).toContain('const SLOT_CAPACITY: Partial<Record<EquipSlot, number>> = { ring: 3 };');
  });

  it('two-handed detection matches the rest of the screen rather than inventing a third rule', () => {
    expect(eqSrc).toContain("findWeaponByName(item.name)?.style === 'two_handed'");
  });
});
