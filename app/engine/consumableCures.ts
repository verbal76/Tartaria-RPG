// consumableCures — OTA-1573.
//
// ⚠⚠⚠ THE FINDING, FROM THE OWNER'S OWN 4.32.11 LOG. He used a Field Dressing
// mid-fight to stop a bleed and the bleed stayed on his portrait:
//
//   18:34:16 parser: intent=use_relic … resolved=Field Dressing
//   18:34:16 [world] You use one Field Dressing. +10 HP.
//   18:35:31 [system] bleeding fades.          ← 75s later. NATURAL EXPIRY.
//
// The card says "stops the bleeding". The catalog entry says `cureBleed: true`.
// Neither was wrong — nothing read them.
//
// ⚠⚠⚠ BECAUSE THERE ARE THREE IMPLEMENTATIONS OF "USE A CONSUMABLE" AND ONLY
// ONE OF THEM EVER LEARNED ABOUT THE CURES:
//
//   • gameStore `consume`  — heals, restores, cures.          ✓
//   • gameStore `use_relic` — heals, restores, coats, buffs.  ✗ no cures
//   • inventorySlice.useConsumableOnTarget — heals, restores. ✗ no cures
//
// `use_relic` is the path a tapped item takes IN COMBAT, which is exactly when a
// player reaches for a dressing. So the one route where curing matters most was
// the one that silently dropped it.
//
// ⚠⚠ THIS IS OTA-1564'S LESSON AGAIN, VERBATIM: *"twenty-six local copies of it
// is how two of them end up disagreeing."* The answer there was one reader; the
// answer here is one curer. Every path calls this and nothing else, so a cure
// added to the catalog tomorrow cannot land on two paths and miss the third.

import type { StatusEffect, StatusEffectKind } from './types';

/** The cure flags a consumable's catalog effect can carry. */
export interface ConsumableCureFlags {
  cureBleed?: boolean;
  curePoison?: boolean;
}

/** What each flag clears, and what the line says when it does. Adding a cure is
 *  a row here and nothing else — which is the point. */
const CURES: ReadonlyArray<{
  readonly flag: keyof ConsumableCureFlags;
  readonly kind: StatusEffectKind;
  readonly said: string;
}> = [
  { flag: 'cureBleed', kind: 'bleed', said: 'bleeding stopped' },
  { flag: 'curePoison', kind: 'poisoned', said: 'poison neutralized' },
];

/**
 * Strip every status this consumable promises to cure.
 *
 * ⚠ SILENT WHEN THERE WAS NOTHING TO CURE. A dressing used at full health should
 * not announce "bleeding stopped" — that is the same class of untrue line this
 * OTA exists to remove. The caller decides what to say when `messages` is empty.
 */
export function applyConsumableCures(
  current: readonly StatusEffect[] | undefined,
  fx: ConsumableCureFlags | null | undefined,
): { effects: StatusEffect[]; messages: string[]; cured: boolean } {
  const start = current ?? [];
  if (!fx) return { effects: [...start], messages: [], cured: false };
  let effects = [...start];
  const messages: string[] = [];
  for (const c of CURES) {
    if (!fx[c.flag]) continue;
    if (!effects.some((e) => e.kind === c.kind)) continue;
    effects = effects.filter((e) => e.kind !== c.kind);
    messages.push(c.said);
  }
  return { effects, messages, cured: messages.length > 0 };
}

/**
 * ⚠⚠ DOES THIS ITEM DO ANYTHING AT ALL WHEN USED? The second defect in the same
 * report: `useConsumableOnTarget` refused any item whose `healHP` was zero —
 * *"That won't mend anything in bulk."* — so a pure cure (an antivenom with no
 * heal on it) was rejected outright by the inventory screen while working fine
 * from the combat bar. A consumable is useful if it heals, restores, cleanses OR
 * CURES; healing was never the whole test.
 */
export function consumableDoesSomething(
  fx: { healHP?: number; restoreStamina?: number; reduceCorruption?: number } & ConsumableCureFlags
    | null | undefined,
): boolean {
  if (!fx) return false;
  return (fx.healHP ?? 0) > 0
    || (fx.restoreStamina ?? 0) > 0
    || (fx.reduceCorruption ?? 0) > 0
    || !!fx.cureBleed
    || !!fx.curePoison;
}
