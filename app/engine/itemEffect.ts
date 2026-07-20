// itemEffect.ts — generic effect system for catalog items.
//
// Born from OTA 192's "no useless items" pass: the playtester
// flagged that ~80 catalog items had only a TC sell value and a
// flavor description — nothing the engine actually used them for.
// This module is the schema + resolver for an `effect` field that
// any catalog row (exploration tool, material, gear, etc.) can
// carry. Three kinds:
//
//   1. PASSIVE — while the item is anywhere in the player's
//      inventory, contribute a small stat bonus. Capped globally
//      at +PASSIVE_STAT_CAP per stat so 78 items in a backpack
//      don't inflate the build. Lowest item wins (first-found
//      contributor up to the cap; rest are inert).
//
//   2. CONSUMABLE — single-use trigger via the new `use <item>`
//      verb. Fires one of a fixed set of sub-effects (heal,
//      restore stamina, reduce corruption, extend the light
//      buff, reveal hidden scene hooks) then deletes one copy
//      of the item from inventory.
//
//   3. GATE — passive unlock keyed on a string. The engine asks
//      `playerHasGate(player, 'breathe_toxic')` when entering a
//      tile that requires the gate; missing-gate scenes refuse
//      entry with a flavored line. Per-gate behaviour is wired
//      in the scene / travel layer; this file just records that
//      the gate exists.
//
// All three kinds are read by the resolver functions exported
// below. The actual side-effect work — mutating the player —
// lives in gameStore's `useItem` action and in
// effectiveStats's passive-bonus sum.

import type { Stats } from './types';

/** Hard cap on inventory-passive stat bonuses, applied per stat.
 *  Equipped gear (armor / amulet / ring statBonus) is unaffected
 *  by this cap — it stacks on top. Without the cap, 12 different
 *  "+1 INT" exploration tools would silently push the build to
 *  +12 INT just by living in the backpack, which we don't want. */
export const PASSIVE_STAT_CAP = 2;

export type StatKey = 'strength' | 'dexterity' | 'intelligence' | 'wisdom' | 'charisma';

export type GateKind =
  | 'breathe_toxic'
  | 'climb_steep'
  | 'dig_metal'
  | 'fly'
  | 'nightvision'
  | 'detect_aether';

/** Distinct scanner families. Each gates its own noun pool +
 *  drops from its own loot table. Adding a new bias = adding a
 *  keyword class to searchRequirementFor and a loot pool to
 *  the gameStore scanner-roll branch. */
export type ScannerBias = 'pulse' | 'aetheric' | 'mud';

/** Tag schema attached to catalog rows. Authored as plain JSON
 *  inside the catalog entry under an `effect` key. Read by every
 *  consumer below. */
export type ItemEffect =
  | { kind: 'passive'; stat: StatKey; bonus: number }
  | {
      kind: 'consumable';
      healHP?: number;
      restoreStamina?: number;
      reduceCorruption?: number;
      extendLight?: number;
      revealScene?: boolean;
      // OTA 003 — timed stat buff on consumption. All three must be
      // present together for the eat handler to register the buff.
      buffStat?: StatKey;
      buffBonus?: number;
      buffDuration?: number;
      // v2.4.1 (OTA 021) — strip the bleed status on consumption.
      // First Aid Kit promises this in its description; opens the
      // door to other patch/salve items declaring the same flag.
      cureBleed?: boolean;
      // OTA-383 — strip the poisoned status on consumption. Antivenom
      // (rendered from viper venom) promises this; mirrors cureBleed.
      curePoison?: boolean;
      // OTA-120 Phase 4 — dog treat flag. When true, the item gives
      // +40 loyalty when fed to the dog (vs +20 for regular food)
      // and surfaces as [treat] in the inventory. The player can
      // still eat the treat themselves; the dogTreat flag is purely
      // a loyalty multiplier on the feed-dog path.
      dogTreat?: boolean;
      // OTA-360 — weapon-coating payload. When present, this
      // consumable is NOT drunk: the inventory "Coat a weapon"
      // button paints the spec onto a chosen weapon instance
      // (InventoryItem.coating) and consumes one unit. poison =
      // pure DOT, acid = DOT + armor shred, corruption = DOT +
      // corruption stacks. dice rolls on a landing hit.
      coating?: { kind: 'poison' | 'acid' | 'corruption' | 'electrical' | 'burn' | 'cold'; dice: string; label: string; statBonus?: { stat: string; amount: number } };
    }
  | { kind: 'gate'; unlocks: GateKind }
  | {
      /** OTA-912 — a Skyreacher Chart. Using it from the pack unlocks a great
       *  climb (adds greatClimb.id to worldMemory.unlockedGreatClimbs so its
       *  climbable prop starts spawning at the landmark), reveals + routes to the
       *  landmark, and logs the climb as an active mission. Consumed on use.
       *  `climbId` matches a GREAT_CLIMBS id; index/total drive the "N of 5" copy. */
      kind: 'map';
      climbId: string;
      index: number;
      total: number;
    }
  | {
      /** Off-hand equippable scanner — a Geiger-counter analog
       *  that biases search outcomes toward a tagged loot pool
       *  when the player is searching physical features. Three
       *  bias families today, each gating a distinct noun pool
       *  and dropping from a distinct loot pool:
       *    'pulse'    — Pulse Scanner: Sentinel / automaton /
       *                 mechanical signatures (circuits, drones,
       *                 emitters, runic gear).
       *    'aetheric' — Aetheric Scanner: rare aether / crystal /
       *                 ley-line phenomena (fissures, glyphs,
       *                 conduits, leystones).
       *    'mud'      — Mud Scanner: silt / sludge / fungal /
       *                 buried-in-mud caches (mud pits, silt
       *                 mounds, peat seams, fungal beds).
       *  The slot is fixed on the item side ('off');
       *  validSlotsForItem reads this to make the scanner
       *  equippable in the off hand. */
      kind: 'scanner';
      bias: ScannerBias;
      slot: 'off';
    };

/** A minimal lookup signature: any function that returns an item
 *  row with an optional `effect` field given a name. Lets us pass
 *  in catalog-specific resolvers (findExplorationItemByName,
 *  findMaterialByName, etc.) without coupling this module to any
 *  particular catalog import. */
export type EffectResolver = (name: string) => { effect?: ItemEffect } | null;

/** Try a list of resolvers in order; return the first effect we
 *  find for the given item name. Returns null if no catalog has
 *  the item or the row has no effect field. */
export function resolveItemEffect(name: string, resolvers: EffectResolver[]): ItemEffect | null {
  for (const r of resolvers) {
    const row = r(name);
    if (row?.effect) return row.effect;
  }
  return null;
}

/** Sum passive stat bonuses across the player's inventory, capped
 *  per stat at PASSIVE_STAT_CAP. Items with non-passive effects
 *  are skipped. Stacking is "first-found wins up to the cap":
 *  contributors are accumulated until the per-stat total reaches
 *  the cap, then later contributors are dropped silently. */
export function aggregateInventoryPassives(
  itemNames: string[],
  resolvers: EffectResolver[],
): Partial<Stats> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const name of itemNames) {
    const fx = resolveItemEffect(name, resolvers);
    if (!fx || fx.kind !== 'passive') continue;
    const current = out[fx.stat] ?? 0;
    if (current >= PASSIVE_STAT_CAP) continue;
    const headroom = PASSIVE_STAT_CAP - current;
    out[fx.stat] = current + Math.min(fx.bonus, headroom);
  }
  return out;
}

/** OTA-198 — wrapper that asks "is the Aetheric Vision Lens active
 *  in the player's pack?" by checking for the `detect_aether` gate.
 *  Used by area-search rolls (raises the chance of a mission hook
 *  outcome) and the wasteland encounter picker (biases toward the
 *  fusion bench archetype). Exploration items don't equip — they
 *  "activate" by being carried, mirroring how Climbing Rope works
 *  for `climb_steep`. */
export function aethericVisionActive(
  itemNames: string[],
  resolvers: EffectResolver[],
): boolean {
  return inventoryHasGate(itemNames, 'detect_aether', resolvers);
}

/** True iff the player has at least one inventory item granting
 *  the given gate. Used by scene/travel code to gate
 *  toxic-air / steep-climb / metal-dig / flight / nightvision
 *  tiles on owning the right tool. */
export function inventoryHasGate(
  itemNames: string[],
  gate: GateKind,
  resolvers: EffectResolver[],
): boolean {
  for (const name of itemNames) {
    const fx = resolveItemEffect(name, resolvers);
    if (fx?.kind === 'gate' && fx.unlocks === gate) return true;
  }
  return false;
}

/** True iff the given item name is a scanner with the given bias.
 *  Used by the equip-slot resolver (scanner items are valid in
 *  off-hand) and by the search action (scanner-equipped player
 *  gets a bias-specific find roll on every gated ambient search). */
export function isScanner(
  name: string,
  bias: ScannerBias,
  resolvers: EffectResolver[],
): boolean {
  const fx = resolveItemEffect(name, resolvers);
  return fx?.kind === 'scanner' && fx.bias === bias;
}

/** Search-gating per ambient noun. Some nouns can only be
 *  searched when the right tool is equipped — e.g. an Aetheric
 *  vent fissure needs a Pulse Scanner (or other scanner with
 *  aetheric bias). The chip UI renders gated-but-unequipped
 *  nouns as grayed, and the engine refuses the search verb
 *  with a "equip X to search this" line when the requirement
 *  isn't met.
 *
 *  Pattern-matched on the noun text so new authored nouns can
 *  just say "ley line fissure" / "aether glyph" and inherit
 *  the gate without per-noun authoring.
 *
 *  Returns null when the noun is freely searchable (the default
 *  for all the everyday outpost nouns — bench, trap, wall, etc.). */
export interface NounSearchRequirement {
  /** Human-readable hint shown when the requirement isn't met
   *  ("Equip an Aetheric Scanner in your off hand to search
   *  the vent fissure."). */
  hint: string;
  /** Scanner bias the equipped item must match. Caller checks
   *  this against playerHasScannerEquipped. */
  scannerBias: ScannerBias;
  /** Short label for the gray chip's "requires" tag — kept
   *  brief so the chip stays readable ("requires: scanner"). */
  shortLabel: string;
}

/** 2026-05-25 OTA-033 — three-way scanner gate. Each noun class
 *  routes to a distinct scanner type. Tested in declared order
 *  so more-specific patterns ("mud fissure" → mud) win over
 *  less-specific ("fissure" → aetheric). */
export function searchRequirementFor(noun: string): NounSearchRequirement | null {
  // Mud-coded nouns — buried-in-mud caches, silt vents, fungal
  // beds, sludge pools. The Mud Scanner is the gate. Tested
  // first so "mud fissure" / "silt vent" route to mud, not
  // aetheric.
  const mud = /\b(mud|silt|sludge|peat|fungal|fungus|mire|bog|fen|slurry|slime|ooze)\b/i;
  if (mud.test(noun)) {
    return {
      hint: `Equip a Mud Scanner in your off hand to search the ${noun}.`,
      scannerBias: 'mud',
      shortLabel: 'requires Mud scanner',
    };
  }
  // Pulse-coded nouns — Sentinel / automaton / mechanical /
  // circuit signatures. The Pulse Scanner is the gate.
  const pulse = /\b(automaton|drone|emitter|servo|circuit|pulse|sentinel|machine|gear[s]?|cog|pipe|coil|engine|construct|relic[- ]?core)\b/i;
  if (pulse.test(noun)) {
    return {
      hint: `Equip a Pulse Scanner in your off hand to search the ${noun}.`,
      scannerBias: 'pulse',
      shortLabel: 'requires Pulse scanner',
    };
  }
  // Aether-coded nouns — pre-flood Aetheric artifacts and
  // phenomena. The Aetheric Scanner is the gate.
  const aether = /\b(vent fissure|fissure|aether|aetheric|etheric|ether|glyph|rune|crystal|conduit|ley[- ]?line|sigil|leystone|aetherstone|obelisk|monolith)\b/i;
  if (aether.test(noun)) {
    return {
      hint: `Equip an Aetheric Scanner in your off hand to search the ${noun}.`,
      scannerBias: 'aetheric',
      shortLabel: 'requires Aetheric scanner',
    };
  }
  return null;
}
