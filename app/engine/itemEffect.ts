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
    }
  | { kind: 'gate'; unlocks: GateKind }
  | {
      /** Off-hand equippable scanner — a Geiger-counter analog
       *  that biases search outcomes toward a tagged loot pool
       *  when the player is searching physical features. Pulse
       *  Scanner uses bias='aetheric' to surface Aetheric
       *  Shards, Aether Dust, Aetheric Fungus, etc. on a
       *  successful d20 check. The slot is fixed on the item
       *  side ('off'); validSlotsForItem reads this to make
       *  the scanner equippable in the off hand. */
      kind: 'scanner';
      bias: 'aetheric';
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
 *  gets an Aether-find roll on every ambient search). */
export function isScanner(
  name: string,
  bias: 'aetheric',
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
   *  ("Equip Pulse Scanner (or other Aether scanner) in your
   *  off hand to search this.") */
  hint: string;
  /** Scanner bias the equipped item must match. Caller checks
   *  this against playerHasScannerEquipped. */
  scannerBias: 'aetheric';
  /** Short label for the gray chip's "requires" tag — kept
   *  brief so the chip stays readable ("requires: scanner"). */
  shortLabel: string;
}

export function searchRequirementFor(noun: string): NounSearchRequirement | null {
  // Aether-coded nouns — anything that reads as a pre-flood
  // Aetheric artifact or phenomenon. The Pulse Scanner (or any
  // future scanner with aetheric bias) is the gate.
  const aether = /\b(vent fissure|fissure|aether|aetheric|etheric|ether|glyph|rune|crystal|conduit|ley[- ]?line|sigil|leystone)\b/i;
  if (aether.test(noun)) {
    return {
      hint: `Equip a Pulse Scanner (or other Aether scanner) in your off hand to search the ${noun}.`,
      scannerBias: 'aetheric',
      shortLabel: 'requires Aether scanner',
    };
  }
  return null;
}
