/**
 * app/state/gearWear.ts — GEAR WEARS OUT, AND WHO ELSE NEEDS TO KNOW.
 *
 * OTA-1404 (slice 10 of the gameStore split). One function, moved DOWN out of
 * gameStore because TWO different owners now call it and neither can own it.
 *
 * ⚠ THE RULE THAT PUT IT HERE. Combat wears the piece that just took a blow;
 * digging wears the tool that just bit rock. Wear is not a combat concept and it
 * is not a digging concept — it belongs to the gear. When the combat resolver
 * moved to `combatResolution.ts` it needed this function, and a leaf may never
 * import a VALUE from the store: that import compiles, passes a one-sided unit
 * test, and resolves to `undefined` at module-init on a device. So the shared
 * thing moves DOWN to where both callers can reach it, which is the same answer
 * `sprint.ts`, `playerGrid.ts` and `visibleLogCount.ts` got in slice 7.
 *
 * ⚠ IT TAKES `get` FOR ONE REASON ONLY — to append the two log lines (the
 * fraying warning and the shatter). The GameStore type comes in through
 * `import type`, which is fully erased at compile time, so this file does not
 * appear in gameStore's module graph and there is no cycle to reason about.
 *
 * ⚠ NOT ONE LINE OF THE BODY CHANGED. Same wear-by-id-then-by-name order, same
 * `current === 3` fraying threshold, same slot + bound-id clearance on break,
 * same salvage drop and the same deferred logging so the caller's `set()` lands
 * first. The suites that covered it before the move cover it unchanged after.
 */
import type { PlayerCharacter, InventoryItem, EquipSlot } from '../engine/types';
import { SLOT_ID_KEY } from '../engine/equipment';
import { wearItemByName, wearItemById } from '../engine/durability';
import { mergeOrPushItem } from '../engine/inventory';
import type { GameStore } from './gameStore';

// Wear the named equipped item by one point. If it breaks, remove it from
// inventory AND clear it from every slot that referenced it. Returns a new
// PlayerCharacter; the caller persists.
export function wearEquippedItem(
  player: PlayerCharacter,
  itemName: string,
  get: () => GameStore,
): PlayerCharacter {
  // Prefer wearing the specific instance bound to a slot — when the
  // player holds two Aetheric Lockets the equipped one (whose id was
  // captured by equipItem) should take damage, not the duplicate
  // sitting in the pack. Fall back to wear-by-name for legacy saves
  // where no id was stored, or items wearing outside any slot (e.g.
  // tools used for digging — those just match by name).
  const eq = player.equipped ?? {};
  const target = itemName.toLowerCase();
  let boundId: string | undefined;
  for (const slot of Object.keys(SLOT_ID_KEY) as EquipSlot[]) {
    if ((eq[slot] ?? '').toLowerCase() !== target) continue;
    const idKey = SLOT_ID_KEY[slot];
    if (eq[idKey]) {
      boundId = eq[idKey];
      break;
    }
  }
  const result = boundId
    ? wearItemById(player.inventory, boundId)
    : wearItemByName(player.inventory, itemName);
  // OTA-959 — fraying warning. The rope warns before it fails; armor and weapons
  // never did — the first thing the player heard was "shatters from wear. It
  // is gone." When the piece this blow/swing just chipped is down to its last
  // few points, say so (wear is always 1, so current === 3 fires exactly once
  // per decline).
  if (!result.broken) {
    const wornInst = boundId
      ? result.inventory.find((i) => i.id === boundId)
      : result.inventory.find((i) => i.name.toLowerCase() === itemName.toLowerCase() && i.durability);
    if (wornInst?.durability && wornInst.durability.current === 3) {
      get().appendLog('system', `⚠ Your ${wornInst.name} is coming apart — a few more hits will finish it. Mend it or lose it.`);
    }
  }
  let equipped = player.equipped ?? {};
  let finalInventory = result.inventory;
  if (result.broken && result.brokenName) {
    const next: PlayerCharacter['equipped'] = { ...equipped };
    // Clear both the name AND the bound id for any slot referencing
    // the broken item. Without id-clearance, a new pickup with the
    // same name could resurrect the empty slot via stale mapping.
    for (const slot of Object.keys(SLOT_ID_KEY) as EquipSlot[]) {
      const idKey = SLOT_ID_KEY[slot];
      if (boundId && next[idKey] === boundId) {
        next[slot] = undefined;
        next[idKey] = undefined;
      } else if (!boundId && next[slot] === result.brokenName) {
        next[slot] = undefined;
        next[idKey] = undefined;
      }
    }
    // Also clear the legacy single-slot fields if they referenced this.
    if (next.weaponName === result.brokenName) next.weaponName = undefined;
    if (next.armor === result.brokenName) next.armor = undefined;
    if (next.armorName === result.brokenName) next.armorName = undefined;
    equipped = next;
    // OTA-188 — push the salvage drop into inventory before
    // logging. wearItemByName/wearItemById return the drop
    // computed by brokenSalvageFor (rope → Broken Rope; weapon/
    // armor/relic → first scrap material). mergeOrPushItem
    // handles stacking with any existing copies of that material.
    let dropMsg = '';
    if (result.salvageDrop) {
      // OTA-946 — the drop phrase used to be a hardcoded "A length of ..." (rope-flavored)
      // for EVERY remnant: "A length of Small Rock comes free in your hand." Pick a
      // noun that fits the material instead.
      const dn = result.salvageDrop.name;
      const dropPrefix = /rope|cord|line/i.test(dn) ? 'A length of'
        : /cloth|fiber|silk|hide|leather|patched/i.test(dn) ? 'A scrap of'
        : /rock|stone|shard|glass/i.test(dn) ? 'A chunk of'
        : /metal|iron|nail|gear|part|scrap/i.test(dn) ? 'A twist of'
        : 'A piece of';
      const dropItem: InventoryItem = {
        id: `broken_${result.brokenName.replace(/\s+/g, '_')}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: result.salvageDrop.name,
        kind: 'misc',
        rarity: 'Common',
        quantity: result.salvageDrop.quantity,
        tags: ['salvage', 'broken_item'],
      };
      finalInventory = mergeOrPushItem(finalInventory, dropItem);
      dropMsg = ` ${dropPrefix} ${result.salvageDrop.name} comes free in your hand.`;
    }
    // Defer the log so the caller's main set() lands first.
    void Promise.resolve().then(() => {
      get().appendLog('combat', `Your ${result.brokenName} shatters from wear. It is gone.${dropMsg}`);
      if (result.salvageDrop) {
        get().appendLog('reward', `✦ ${result.salvageDrop.name} (Common).`);
      }
    });
  }
  return { ...player, inventory: finalInventory, equipped };
}