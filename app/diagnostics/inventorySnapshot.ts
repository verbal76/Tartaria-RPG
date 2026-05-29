// OTA-202 — inventory snapshot bundled into the COPY LOG export.
// Player ask: *"is there a way to copy an inventory log showing all
// items on my inventory from the log copy screen in the session tab
// so you can check for recurring themes"*. Pre-OTA, the Copy Log
// envelope carried log entries + the device/install header from
// aboutSummary.ts — but no inventory. Recurring-theme analysis
// (which materials accumulate, which items get hoarded vs. spent,
// what the inferred-item population looks like) needs the player's
// pack as a flat readable list.
//
// Keeps the format compact + line-oriented so it parses easily by
// eye and pastes cleanly into a chat window. One bucket per kind,
// alphabetically sorted, with per-instance metadata (quantity,
// rarity, durability, equipped slot, stolen flag, reservedForFusion
// flag, uniqueStats summary).

import type { InventoryItem, PlayerCharacter } from '../engine/types';
import { categorizeItem, CATEGORY_ORDER, CATEGORY_LABEL, type InventoryCategory } from '../components/InventoryCategorize';
import {
  findWeaponByName,
  isInferredItem,
  findExplorationItemByName,
  findGearByName,
  findMaterialByName,
} from '../engine/crafting';
import { canScrap, repairCostMaterials } from '../engine/scrapEngine';
import { validSlotsForItem } from '../engine/equipment';
import { resolveItemEffect } from '../engine/itemEffect';

/** OTA-206 — list the action buttons the inventory modal would
 *  render for this item. Mirrors the gating in InventoryScreen.
 *  buildModalButtons so the snapshot reads with the same answer
 *  the player sees on tap. Used by the COPY INVENTORY export so
 *  recurring-theme analysis can flag items missing actions. */
function actionsFor(item: InventoryItem, equippedSlots: ReadonlyMap<string, string>): string[] {
  const acts: string[] = [];
  const slots = validSlotsForItem(item);
  const equippedAt = equippedSlots.get(item.id);
  const equippedInSlots = equippedAt ? [equippedAt] : [];
  // EQUIP — one per valid slot the item isn't already in.
  for (const s of slots) {
    if (!equippedInSlots.includes(s)) acts.push(`equip:${s}`);
  }
  // UNEQUIP — one per slot currently holding this specific instance.
  for (const s of equippedInSlots) acts.push(`unequip:${s}`);
  // USE — mirrors OTA-201's gate: consumable OR effect-bearing OR
  // any-slot-free equippable.
  const isConsumable = item.kind === 'consumable';
  const fx = resolveItemEffect(item.name, [findGearByName, findExplorationItemByName, findMaterialByName]);
  const offEligible = slots.includes('off') && !equippedInSlots.includes('off');
  const anySlotFree = slots.some((s) => !equippedInSlots.includes(s));
  if (isConsumable || fx !== null || (anySlotFree && (offEligible || slots.length > 0))) {
    acts.push(isConsumable ? 'use(eat)' : offEligible ? 'use(off)' : 'use');
  }
  // SCRAP — built items + non-equipped.
  if (canScrap(item) && equippedInSlots.length === 0) acts.push('scrap');
  // REPAIR — durability-tracked + not at max.
  if (item.durability && item.durability.current < item.durability.max) {
    const cost = repairCostMaterials(item);
    if (cost.length > 0) acts.push('repair');
  }
  // SAVE FOR FUSION — only inferred items, only when not already
  // reserved. Mirrors the OTA-194 heart-tap gate.
  if (isInferredItem(item.name) && !item.reservedForFusion) acts.push('save-for-fusion');
  if (item.reservedForFusion) acts.push('release-from-fusion');
  // DROP — always available unless equipped.
  if (equippedInSlots.length === 0) acts.push('drop');
  return acts;
}

/** Build a one-line summary for a single item — name, qty, rarity,
 *  durability, equipped slot, per-instance flags. OTA-204 — surfaces
 *  the catalog damage dice on weapons (mirrors what the screen shows)
 *  and prefixes inferred items with a ◆ marker so the export reads
 *  the way the inventory does. */
function lineFor(item: InventoryItem, equippedSlots: ReadonlyMap<string, string>): string {
  const parts: string[] = [];
  // OTA-204 — inferred-item ◆ marker matches the OTA-199 row diamond,
  // so the snapshot makes catalog-vs-engine-named obvious at a paste.
  if (isInferredItem(item.name)) parts.push('◆');
  parts.push(item.name);
  if (item.quantity > 1) parts.push(`×${item.quantity}`);
  const meta: string[] = [];
  if (item.rarity && item.rarity !== 'Common') meta.push(item.rarity);
  // OTA-204 — weapon damage dice. The screen shows "1d10 piercing"
  // next to each weapon name and the snapshot was carrying tags but
  // not damage. Pull from the catalog (uniqueStats path covered
  // separately below).
  if (item.kind === 'weapon' && !item.uniqueStats) {
    try {
      const w = findWeaponByName(item.name);
      if (w) meta.push(`${w.damageDice} ${w.damageType}`);
    } catch { /* tolerate catalog miss */ }
  }
  if (item.durability) meta.push(`dur ${item.durability.current}/${item.durability.max}`);
  const slot = equippedSlots.get(item.id);
  if (slot) meta.push(`equipped:${slot}`);
  if (item.stolen) meta.push('stolen');
  if (item.reservedForFusion) meta.push('♥reserved');
  if (item.uniqueStats) {
    const u = item.uniqueStats;
    if (u.damageDice) meta.push(`${u.damageDice} ${u.damageType ?? ''}`.trim());
    if (u.acBonus !== undefined) meta.push(`AC+${u.acBonus}`);
    if (u.resistance) meta.push(`resist:${u.resistance}`);
    meta.push('unique');
  }
  if (item.tags && item.tags.length > 0) {
    // Keep tag list short so the line stays readable.
    meta.push(`[${item.tags.slice(0, 5).join(',')}]`);
  }
  if (meta.length > 0) parts.push(`(${meta.join(', ')})`);
  // OTA-206 — actions block on a second line so each item shows
  // what its modal would offer. "—" when no actions resolve
  // (catalog item with no slot + no effect + not scrap-able + no
  // durability + already at full — rare but possible for raw
  // currency-like stock).
  const acts = actionsFor(item, equippedSlots);
  const actsLine = acts.length > 0 ? `    actions: ${acts.join(', ')}` : '    actions: —';
  return `  ${parts.join(' ')}\n${actsLine}`;
}

/** Map of InventoryItem.id → equipped slot name for items currently
 *  worn / wielded. Used to annotate the snapshot lines. */
function equippedSlotMap(player: PlayerCharacter): Map<string, string> {
  const out = new Map<string, string>();
  const eq = player.equipped ?? {};
  // The equip table stores names, not ids — match by name back into
  // the inventory. This is approximate when the player has stacked
  // duplicates of the same name, but good enough for an export.
  const SLOTS: Array<keyof typeof eq> = [
    'main', 'off', 'head', 'chest', 'legs', 'feet', 'amulet', 'ring',
  ];
  for (const slot of SLOTS) {
    const name = eq[slot];
    if (!name || typeof name !== 'string') continue;
    const match = player.inventory.find(
      (i) => i.name.toLowerCase() === name.toLowerCase(),
    );
    if (match && !out.has(match.id)) out.set(match.id, String(slot));
  }
  return out;
}

/** Build the full inventory snapshot block. Includes a one-line
 *  summary header (count + TC + corruption) then one bucket per
 *  item kind, sorted alphabetically inside each bucket. Returns
 *  an empty-pack stub when the player has nothing. */
export function buildInventorySnapshot(player: PlayerCharacter | null): string {
  if (!player) return 'Inventory\n  (no active character)';
  const inv = player.inventory ?? [];
  if (inv.length === 0) {
    return `Inventory (${player.name})\n  TC: ${player.tc}\n  Pack: empty`;
  }
  const equippedSlots = equippedSlotMap(player);
  // OTA-204 — bucket by the UI's category logic (categorizeItem in
  // InventoryCategorize.ts) so the snapshot's WEAPONS / ARMOR /
  // ACCESSORY / CONSUMABLE / RELIC / MATERIAL / LOOT split mirrors
  // what the player sees on screen. Pre-OTA the snapshot grouped by
  // raw InventoryItem.kind which collapsed LOOT into "Materials &
  // Misc" and misled the analysis.
  const buckets = new Map<InventoryCategory, InventoryItem[]>();
  for (const it of inv) {
    const cat = categorizeItem(it);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(it);
  }
  const lines: string[] = [];
  lines.push(`Inventory (${player.name})`);
  lines.push(`  HP: ${player.hp}/${player.hpMax}  Stamina: ${player.stamina}/${player.staminaMax}  TC: ${player.tc}  Corruption: ${player.corruption}`);
  const totalItems = inv.reduce((acc, i) => acc + i.quantity, 0);
  lines.push(`  Pack: ${inv.length} distinct rows / ${totalItems} total`);
  if (player.dog && player.dog.status === 'with_player') {
    const d = player.dog;
    lines.push(`  Dog: ${d.name} (${d.breed}) loyalty ${d.loyalty} HP ${d.hp}/${d.hpMax}`);
  }
  for (const cat of CATEGORY_ORDER) {
    const items = buckets.get(cat);
    if (!items || items.length === 0) continue;
    items.sort((a, b) => a.name.localeCompare(b.name));
    lines.push('');
    lines.push(`${CATEGORY_LABEL[cat]} (${items.length})`);
    for (const it of items) lines.push(lineFor(it, equippedSlots));
  }
  return lines.join('\n');
}

/** OTA-203 — envelope the inventory snapshot for a standalone Copy
 *  Inventory export. Same BEGIN/END framing as `stampLogExport` so
 *  the paste back into chat is greppable, plus the device/install
 *  block so the analysis can pair the pack against the OTA build
 *  the player was running. The device/install block is built by
 *  `aboutSummary.ts`; we ask the caller to pass it in so this
 *  module stays free of the env-import dependency. */
export function stampInventoryExport(
  snapshot: string,
  deviceSummary: string,
  playerName?: string,
): string {
  const begin = `=== TARTARIA INVENTORY · ${snapshot.length} CHARS · BEGIN ===`;
  const end = `=== END INVENTORY · ${snapshot.length} CHARS ===`;
  const header = playerName ? `Tartaria Realms · ${playerName}` : 'Tartaria Realms';
  return `${begin}\n${snapshot}\n${end}\n\n${header}\n\n${deviceSummary}\n`;
}
