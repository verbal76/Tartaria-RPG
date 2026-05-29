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

const KIND_ORDER: ReadonlyArray<InventoryItem['kind']> = [
  'weapon', 'armor', 'dog_armor', 'relic', 'runecaster', 'consumable', 'misc',
];

const KIND_LABEL: Record<InventoryItem['kind'], string> = {
  weapon: 'Weapons',
  armor: 'Armor',
  dog_armor: 'Dog Armor',
  relic: 'Relics',
  runecaster: 'Runecasters',
  consumable: 'Consumables',
  misc: 'Materials & Misc',
};

/** Build a one-line summary for a single item — name, qty, rarity,
 *  durability, equipped slot, per-instance flags. */
function lineFor(item: InventoryItem, equippedSlots: ReadonlyMap<string, string>): string {
  const parts: string[] = [];
  // Name + optional inferred-tier diamond. Mirrors the OTA-199
  // inventory-row marker so the export reads the way the screen does.
  // No actual color — just a marker character so the player can grep.
  parts.push(item.name);
  if (item.quantity > 1) parts.push(`×${item.quantity}`);
  const meta: string[] = [];
  if (item.rarity && item.rarity !== 'Common') meta.push(item.rarity);
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
  return `  ${parts.join(' ')}`;
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
  const buckets = new Map<InventoryItem['kind'], InventoryItem[]>();
  for (const it of inv) {
    const k = it.kind;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(it);
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
  for (const kind of KIND_ORDER) {
    const items = buckets.get(kind);
    if (!items || items.length === 0) continue;
    items.sort((a, b) => a.name.localeCompare(b.name));
    lines.push('');
    lines.push(`${KIND_LABEL[kind]} (${items.length})`);
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
