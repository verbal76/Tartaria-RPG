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
    return { strength: -1, dexterity: -1, intelligence: -1, wisdom: -1, charisma: -1, stealth: -1 };
  }
  if (tier === 'hollowed') {
    return { strength: -2, dexterity: -2, intelligence: -2, wisdom: -2, charisma: -2, stealth: -2 };
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

// engine_Dev — affliction noun + tier names resolve through the content pack so a
// re-skin renames the whole plague (Corruption → Phase-Sickness; Tainted/Corrupted/
// Hollowed → its own tiers). Remaining built-in nouns (aether → energy, Mud Monarch
// → termMap) are swapped live in appendLog.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cp = () => require('./contentPack') as typeof import('./contentPack');

export function tierLabel(tier: CorruptionTier): string {
  return cp().getCorruptionTierName(tier);
}

// Tier-cross narration. Called when corruption value crosses a
// threshold so the player sees what just changed.
export function tierCrossLine(prev: CorruptionTier, next: CorruptionTier): string | null {
  if (prev === next) return null;
  const name = cp().getCorruptionName();
  // engine_Dev — the energy noun resolves through the content pack (generic → "energy",
  // Tartaria built-in → "aether", a reskin → its own), so the line never hardcodes "aether".
  const energy = cp().getEnergyName().toLowerCase();
  const t = (x: CorruptionTier) => tierLabel(x);
  const order: Record<CorruptionTier, number> = { clean: 0, tainted: 1, corrupted: 2, hollowed: 3 };
  const worsening = order[next] > order[prev];
  if (worsening) {
    if (next === 'tainted') return `✦ The ${name.toLowerCase()} tightens its grip — ${t('tainted')}. (CHA −1)`;
    if (next === 'corrupted') return `✦ The ${energy} under your skin has its own pulse now — ${t('corrupted')}. (all stats −1, prices bump)`;
    if (next === 'hollowed') return `✦ You are ${t('hollowed')}. They will come for you. (all stats −2, hunters on your trail)`;
  } else {
    if (next === 'corrupted') return `✦ You feel cleaner — back to ${t('corrupted')}.`;
    if (next === 'tainted') return `✦ The ${energy} dims — back to ${t('tainted')}.`;
    if (next === 'clean') return `✦ ${t('clean')}. The hum of the ${energy} is no longer your own.`;
  }
  return null;
}

// One-line tier description for the player sheet. Plain language
// so the player sees what each tier actually does to them.
export function tierDescription(tier: CorruptionTier): string {
  const energy = cp().getEnergyName().toLowerCase();
  if (tier === 'clean') return `No ${energy} on you. Nothing reacting to you.`;
  if (tier === 'tainted') return 'CHA −1. Extra apparition encounters when you walk outdoors.';
  if (tier === 'corrupted') return 'All stats −1. Vendors charge +15%. Encounters spike further.';
  return 'All stats −2. Vendors charge +30%. Hunters will track you every few steps.';
}
