// weaponRiderEffects — OTA-1676, slice 4c of the weapon-effects program.
//
// ⚠⚠⚠ THE STORE-SIDE HALF OF THE LAST THREE FAMILIES: what a weapon does for
// its own wielder (the ward rods, the dust cloud, the Shield-Hammer's guard, the
// touch wand's heal), the shred a hit leaves on an enemy's armour, and the write
// that lands a control on the scene. The parser (`weaponEffects.ts`) knows what a
// card promises; this file is where the promise is paid, and it lives outside
// gameStore because that file is under the OTA-1400 line ratchet — the two
// `set()` blocks it absorbs from there (the max-roll shred and the control
// landing) were the price of adding the third.

import type { GameStore } from './gameStore';
import type { ParsedWeaponEffect, SelfBuff } from '../engine/weaponEffects';
import type { StatusEffect } from '../engine/types';
import type { EnemyControlState } from '../engine/enemyControl';
import { applyEffect } from '../engine/statusEffects';
import { rollFromNotation } from '../engine/rng';

type Get = () => GameStore;
type Set = (fn: (s: GameStore) => Partial<GameStore>) => void;

export interface SelfBuffPlan {
  /** The wielder's statuses after the buff, from the ones before it. */
  effects?: (current: readonly StatusEffect[]) => StatusEffect[];
  /** HP restored (heal only) — already clamped to the room there was. */
  heal?: number;
  line: string;
}

/**
 * ⚠⚠ THE PLAN IS PURE so the suite can hold every kind up against the card
 * without a store. `when` is the caller's moment — 'use' fires on the swing
 * itself (hit or miss: a ward you RAISE), 'hit' only when it connected — and a
 * buff written for the other moment returns nothing here.
 */
export function planSelfBuff(
  buff: SelfBuff | null | undefined,
  when: SelfBuff['when'],
  weaponName: string,
  hp: number,
  hpMax: number,
): SelfBuffPlan | null {
  if (!buff || buff.when !== when) return null;
  const rounds = Math.max(1, buff.rounds);
  const plural = rounds > 1 ? 's' : '';
  switch (buff.kind) {
    case 'guard': {
      const amount = Math.max(1, buff.amount ?? 1);
      return {
        effects: (cur) => applyEffect(cur, {
          kind: 'guard_up', remainingRounds: rounds, acBonus: amount,
          label: `${weaponName} guard (+${amount} AC)`,
        }),
        line: `The ${weaponName} holds a guard — +${amount} AC for ${rounds} round${plural}.`,
      };
    }
    case 'cover':
      return {
        effects: (cur) => applyEffect(cur, {
          kind: 'in_cover', remainingRounds: rounds, label: `cover (${weaponName})`,
        }),
        line: `The ${weaponName} throws up cover — you are harder to find for ${rounds} round${plural}.`,
      };
    case 'ward': {
      // Rolled ONCE when raised, like the Elemental Control ward (OTA-835), and
      // seeded the same way — the old ward is dropped, never summed, so two
      // casts are a fresh pool rather than a bank.
      const soak = Math.max(1, rollFromNotation(buff.dice ?? '1d4'));
      return {
        effects: (cur) => [
          ...cur.filter((e) => e.kind !== 'stone_ward'),
          { kind: 'stone_ward' as const, remainingRounds: rounds, absorb: soak, label: `${weaponName} ward (soak ${soak})` },
        ],
        line: `The ${weaponName} wards you — the next ${soak} damage breaks on it (${rounds} round${plural}).`,
      };
    }
    case 'heal': {
      const rolled = Math.max(1, rollFromNotation(buff.dice ?? '1d4'));
      const room = Math.max(0, hpMax - hp);
      const healed = Math.min(rolled, room);
      return healed > 0
        ? { heal: healed, line: `The ${weaponName} knits you back together — +${healed} HP.` }
        : { line: `The ${weaponName} hums against whole skin — nothing to mend.` };
    }
    default:
      return null;
  }
}

/** Pay the wielder's share. Returns true when something was applied. */
export function applyWeaponSelfBuff(
  get: Get,
  set: Set,
  parsed: ParsedWeaponEffect | null | undefined,
  weaponName: string,
  when: SelfBuff['when'],
): boolean {
  const p = get().player;
  if (!p) return false;
  const plan = planSelfBuff(parsed?.selfBuff, when, weaponName, p.hp, p.hpMax ?? p.hp);
  if (!plan) return false;
  set((s) => {
    if (!s.player) return {};
    const next = { ...s.player };
    if (plan.effects) next.statusEffects = plan.effects(s.player.statusEffects ?? []);
    if (plan.heal) next.hp = Math.min(s.player.hpMax ?? s.player.hp, s.player.hp + plan.heal);
    return { player: next };
  });
  get().appendLog('combat', plan.line);
  return true;
}

/** The OTA-362 `enemyArmorShred` lever, written for one enemy. Shared by the
 *  max-roll shred (OTA-1564) and the on-hit shred (OTA-1676). */
export function shredEnemyArmor(set: Set, idx: number, amount: number, cap?: number): void {
  if (amount <= 0) return;
  set((s) => {
    if (!s.currentScene) return s;
    const arr = [...(s.currentScene.enemyArmorShred ?? [])];
    while (arr.length < s.currentScene.enemies.length) arr.push(0);
    // ⚠ The on-hit shred is CAPPED (the acid coating's own ceiling, per enemy):
    // a blade that took 2 AC every landed hit would open any guard in a few
    // swings. The max-roll shred passes no cap, exactly as before.
    const next = (arr[idx] ?? 0) + amount;
    arr[idx] = cap !== undefined ? Math.min(cap, next) : next;
    return { currentScene: { ...s.currentScene, enemyArmorShred: arr } };
  });
}

/** The control landing write (OTA-1572), lifted out of the store verbatim. */
export function landControlOnScene(
  set: Set,
  idx: number,
  landed: { control: EnemyControlState; braceRounds: number },
): void {
  set((s) => {
    if (!s.currentScene) return s;
    const n = s.currentScene.enemies.length;
    const ctrls = [...(s.currentScene.enemyControl ?? [])];
    const braces = [...(s.currentScene.enemyBraced ?? [])];
    while (ctrls.length < n) ctrls.push(null);
    while (braces.length < n) braces.push(0);
    ctrls[idx] = landed.control;
    braces[idx] = landed.braceRounds;
    return { currentScene: { ...s.currentScene, enemyControl: ctrls, enemyBraced: braces } };
  });
}
