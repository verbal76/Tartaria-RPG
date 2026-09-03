// ⚠⚠⚠ OTA-1650 — THE COMPANIONS' GEAR IS REAL GEAR.
//
// Owner: *"it needs to show weapons and armor equipped on your companions. and
// a small symbol next to the golems name in the shrunk character screen so we
// know if they are armed or not. i dont know when thiewr weapon breaks. and we
// should be able to repair the dogs armor, and the golems weapons when we
// craft."*
//
// ⚠⚠ WHAT THE MEASUREMENT FOUND, and it is worse than a missing glyph:
//
//   • THE DOG'S VEST HAS NEVER WORN, because it has never been durable.
//     `lookupBaseDurability` walks weapons, armour, amulets, rings, gear and
//     exploration — and not `dogGear.json`. Every vest in that catalog declares
//     a `baseDurability` (18 / 24 / 28 / 34) and no instance has ever been
//     stamped with one. Four authored numbers the game has never read.
//
//   • THE GOLEM'S WEAPON WEARS AND DIES SILENTLY. It loses a point per landed
//     strike and then "shatters in Bob's grip" with no warning at all — the
//     player's own gear got a fraying warning in OTA-959 and the golem's never
//     did. That is exactly the owner's *"i dont know when their weapon breaks."*
//
//   • AND IT COULD NOT BE MENDED BY ANY PATH IN THE GAME. `armGolem` moves the
//     instance OUT of `player.inventory` and onto `player.golem.weapon`; the
//     crafting bench's repair list and `repairWithVendor` both walk
//     `player.inventory`. A golem weapon was, on every line, a consumable.
//
// This module is the one place that knows where a companion's gear lives, so
// the panels, the wear, the warning and the repair all read the same answer.
import type { InventoryItem, PlayerCharacter } from './types';

/** ⚠ Beside the GOLEM's name when it is holding something. Owner asked for "a
 *  small weapon symbol"; ⚔ is unclaimed — ⚒ is already SALVAGE and ✦ is the
 *  "worth a look" mark, and a glyph that means two things means neither. */
export const GOLEM_ARMED_GLYPH = '⚔';

/** ⚠ Beside the DOG's name when it is wearing a vest. Owner asked for "a small
 *  shield"; 🛡 already means armour on the fusion picker's kind row, so the
 *  player has met it before in exactly this sense. */
export const DOG_ARMORED_GLYPH = '🛡';

/** Durability at or below which a piece is one bad fight from gone. Matches the
 *  player's own fraying warning (OTA-959 fires at 3) so a companion's gear
 *  speaks up at the same point in its life the player's does. */
export const COMPANION_FRAY_AT = 3;

export type GearCondition = 'sound' | 'worn' | 'failing' | 'none';

/** A word for a durability bar, for panels that have room for one. `failing` is
 *  the one that matters — it is the answer to "when does it break". */
export function gearCondition(d: { current: number; max: number } | null | undefined): GearCondition {
  if (!d || d.max <= 0) return 'none';
  if (d.current <= COMPANION_FRAY_AT) return 'failing';
  if (d.current < d.max) return 'worn';
  return 'sound';
}

/** Colour for a condition, matching the HP-bar ladder used across the panels. */
export function conditionColor(c: GearCondition): string {
  return c === 'failing' ? '#e07a5f' : c === 'worn' ? '#c9a86a' : '#9ec96a';
}

/** `12/28 · failing` — the short readout both companion panels print, and the
 *  reason a player can answer "when does it break" without counting. */
export function durabilityLabel(d: { current: number; max: number } | null | undefined): string | null {
  if (!d || d.max <= 0) return null;
  const c = gearCondition(d);
  return `${d.current}/${d.max}${c === 'sound' ? '' : ` · ${c}`}`;
}

/** Where a piece of companion gear lives. The dog's vest is an ordinary
 *  inventory item bound by id; the golem's weapon is NOT in the inventory at
 *  all, which is the whole reason repair could never see it. */
export type CompanionHome = 'golem' | 'dog';

export interface CompanionGearRow {
  home: CompanionHome;
  /** "Bob" / "Scrap" — whose it is, for the repair row's subtitle. */
  ownerName: string;
  /** 'Arm' / 'Vest' — the slot word the character panel already uses. */
  slotLabel: string;
  item: InventoryItem;
}

/** The golem's wielded weapon, if it has one. */
export function golemWeapon(player: PlayerCharacter | null | undefined): InventoryItem | null {
  const g = player?.golem;
  if (!g || g.hp <= 0) return null;
  return g.weapon ?? null;
}

/** The dog's worn vest instance, resolved the same way combat resolves it: by
 *  bound id first (two same-named vests must not be confused), then by name for
 *  saves written before `vestId` existed. */
export function dogVestInstance(player: PlayerCharacter | null | undefined): InventoryItem | null {
  const dog = player?.dog;
  if (!dog || dog.status === 'abandoned' || dog.status === 'dead') return null;
  const name = dog.equipped?.vest;
  if (!name) return null;
  const inv = player?.inventory ?? [];
  const byId = dog.equipped?.vestId ? inv.find((i) => i.id === dog.equipped!.vestId) : undefined;
  return byId ?? inv.find((i) => i.name.toLowerCase() === name.toLowerCase()) ?? null;
}

/** True when the golem is holding a weapon — the glyph's whole question. */
export function golemIsArmed(player: PlayerCharacter | null | undefined): boolean {
  return golemWeapon(player) !== null;
}

/** True when the dog is wearing a vest. ⚠ Reads the dog's own `equipped.vest`
 *  NAME, not the resolved instance: a legacy save can have a worn vest whose
 *  inventory row cannot be resolved, and the dog is still wearing it. */
export function dogIsArmored(player: PlayerCharacter | null | undefined): boolean {
  const dog = player?.dog;
  if (!dog || dog.status === 'abandoned' || dog.status === 'dead') return false;
  return Boolean(dog.equipped?.vest);
}

/** Every piece of companion gear that is currently worn or wielded, whatever
 *  its condition. One list, so no reader has to remember that a golem weapon
 *  lives outside the inventory and a vest lives inside it. */
export function companionGearRows(player: PlayerCharacter | null | undefined): CompanionGearRow[] {
  const rows: CompanionGearRow[] = [];
  const gw = golemWeapon(player);
  if (gw && player?.golem) {
    rows.push({ home: 'golem', ownerName: player.golem.name, slotLabel: 'Arm', item: gw });
  }
  const vest = dogVestInstance(player);
  if (vest && player?.dog) {
    rows.push({ home: 'dog', ownerName: player.dog.name, slotLabel: 'Vest', item: vest });
  }
  return rows;
}

/** ⚠ THE REPAIR BENCH'S BLIND SPOT, named once.
 *
 *  The crafting screen's repair list is `player.inventory.filter(damaged)`. The
 *  dog's vest is IN the inventory, so it appears there for free the moment it
 *  can wear. The golem's weapon is not, so it has to be added — this returns
 *  exactly the damaged companion pieces that list would otherwise miss.
 *
 *  Deliberately NOT "all companion gear": handing back the vest as well would
 *  duplicate it in the list, and a player looking at two identical rows has no
 *  way to know which one the button will mend. */
export function offInventoryRepairables(player: PlayerCharacter | null | undefined): CompanionGearRow[] {
  const inv = player?.inventory ?? [];
  return companionGearRows(player).filter((r) =>
    Boolean(r.item.durability)
    && r.item.durability!.current < r.item.durability!.max
    && !inv.some((i) => i.id === r.item.id),
  );
}

/** Resolve a repair target that may not be in the pack. Returns the item and
 *  where it lives, so the caller can write the mended instance home again. */
export function findCompanionGearById(
  player: PlayerCharacter | null | undefined,
  itemId: string,
): CompanionGearRow | null {
  const inv = player?.inventory ?? [];
  return companionGearRows(player).find(
    (r) => r.item.id === itemId && !inv.some((i) => i.id === itemId),
  ) ?? null;
}

/** One log line a companion-gear event wants written. */
export interface CompanionGearLog { channel: 'world' | 'system'; text: string; }

/** ⚠⚠ THE GOLEM'S WEAPON, WORN BY ONE LANDED STRIKE.
 *
 *  Owner: *"i dont know when thiewr weapon breaks."* He could not. This weapon
 *  lost a point a swing and then simply shattered — the player's own gear has
 *  warned at three points since OTA-959 and the golem's never did, and that
 *  warning is the whole difference between gear you can manage and gear that
 *  vanishes mid-fight.
 *
 *  Returns the golem to store and the lines to log, so the rule lives beside
 *  COMPANION_FRAY_AT rather than inline in the swing handler — and so it can be
 *  exercised without running a combat turn. A golem with no weapon, or a weapon
 *  with no durability, comes back untouched. */
export function wearGolemWeapon<T extends { name: string; weapon?: InventoryItem | null }>(
  golem: T,
): { golem: T; logs: CompanionGearLog[] } {
  const w = golem.weapon;
  if (!w?.durability) return { golem, logs: [] };
  const next = w.durability.current - 1;
  if (next <= 0) {
    return {
      golem: { ...golem, weapon: null },
      logs: [{ channel: 'world', text: `The ${w.name} shatters in ${golem.name}'s grip — back to bare fists.` }],
    };
  }
  return {
    golem: { ...golem, weapon: { ...w, durability: { ...w.durability, current: next } } },
    logs: next === COMPANION_FRAY_AT
      ? [{ channel: 'system', text: `⚠ ${golem.name}'s ${w.name} is failing — a few more swings will finish it. Mend it at the bench or lose it.` }]
      : [],
  };
}
