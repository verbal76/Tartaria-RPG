// Corruption tier ladder. OTA 039 promotes corruption from a meter
// that breathed-without-consequence to a real pressure system.
//
// Tiers:
//   Clean       0–10   no penalty
//   Tainted     11–30  -1 CHA; +5% extra apparition encounter per step
//   Corrupted   31–60  -1 all stats; +15% extra encounters; +15% vendor prices
//   Hollowed    61+    -2 all stats; +30% extra encounters; +30% vendor prices;
//                      forced Mud Monarch Purifier encounter every 5 steps
//
// Lore: the lorebook implies prolonged Aetheric exposure causes
// "lasting conditions"; this is the mechanical surface for that
// implication. The Aetheric Healing verb costs +2 corruption, so a
// healing-heavy playstyle eventually triggers consequences.

import type { Stats } from './types';

export type CorruptionTier = 'clean' | 'tainted' | 'corrupted' | 'hollowed';

export function corruptionTierOf(value: number): CorruptionTier {
  if (value <= 10) return 'clean';
  if (value <= 30) return 'tainted';
  if (value <= 60) return 'corrupted';
  return 'hollowed';
}

// Stat penalty applied through effectiveStats. Subtracts at every
// skill check site automatically.
export function corruptionStatPenalty(tier: CorruptionTier): Partial<Stats> {
  if (tier === 'tainted') return { charisma: -1 };
  if (tier === 'corrupted') {
    return { strength: -1, dexterity: -1, intelligence: -1, wisdom: -1, charisma: -1 };
  }
  if (tier === 'hollowed') {
    return { strength: -2, dexterity: -2, intelligence: -2, wisdom: -2, charisma: -2 };
  }
  return {};
}

// Vendor price multiplier — Corrupted +15%, Hollowed +30%. Vendors
// notice the aether on you and charge danger pay.
export function corruptionPriceMultiplier(tier: CorruptionTier): number {
  if (tier === 'corrupted') return 1.15;
  if (tier === 'hollowed') return 1.3;
  return 1;
}

// Extra-encounter chance per cardinal step. Stacks ON TOP of the
// base encounter roll. Tainted=5%, Corrupted=15%, Hollowed=30%.
export function corruptionExtraEncounterChance(tier: CorruptionTier): number {
  if (tier === 'tainted') return 0.05;
  if (tier === 'corrupted') return 0.15;
  if (tier === 'hollowed') return 0.3;
  return 0;
}

// Tier-cross narration. Called when corruption value crosses a
// threshold so the player sees what just changed.
export function tierCrossLine(prev: CorruptionTier, next: CorruptionTier): string | null {
  if (prev === next) return null;
  const order: Record<CorruptionTier, number> = { clean: 0, tainted: 1, corrupted: 2, hollowed: 3 };
  const worsening = order[next] > order[prev];
  if (worsening) {
    if (next === 'tainted') return '✦ The corruption tightens its grip — Tainted. (CHA −1)';
    if (next === 'corrupted') return '✦ The aether under your skin has its own pulse now — Corrupted. (all stats −1, prices bump)';
    if (next === 'hollowed') return '✦ You are Hollowed. The Mud Monarchs will come for you. (all stats −2, Purifiers will hunt)';
  } else {
    if (next === 'corrupted') return '✦ You feel cleaner — back to Corrupted.';
    if (next === 'tainted') return '✦ The aether dims — back to Tainted.';
    if (next === 'clean') return '✦ Clean. The hum of the Aether is no longer your own.';
  }
  return null;
}

export function tierLabel(tier: CorruptionTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// One-line tier description for the player sheet. Plain language
// so the player sees what each tier actually does to them.
export function tierDescription(tier: CorruptionTier): string {
  if (tier === 'clean') return 'No aether on you. Nothing reacting to you.';
  if (tier === 'tainted') return 'CHA −1. Extra apparition encounters when you walk outdoors.';
  if (tier === 'corrupted') return 'All stats −1. Vendors charge +15%. Encounters spike further.';
  return 'All stats −2. Vendors charge +30%. Mud Monarch Purifiers will hunt you every few steps.';
}
