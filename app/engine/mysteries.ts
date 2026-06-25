// Mystery-object quest engine — 3-5 step chains to find lore-canonical
// artifacts (Red Tower fragment, Cradle compass, Leviathan eye, etc.).
// Mechanically these are stripped-down hunts: same stage structure, but
// the "boss" stage hands you the trophy rather than spawning a fight.

import mysteriesData from '../data/quests/mysteries.json';
import type { HuntCheckKind } from './hunts';
import { resolveMissions } from './contentPack';

export interface MysteryStageDef {
  narration: string;
  arbiter: string | null;
  checkKind: HuntCheckKind;
}

export interface MysteryDef {
  id: string;
  title: string;
  posterText: string;
  trophyName: string;
  minRep: number;
  factionId: string | null;
  rewardTc: number;
  rewardItem: string | null;
  rewardRep: number | null;
  stages: MysteryStageDef[];
}

interface MysteryDataShape {
  mysteries: MysteryDef[];
}

const MYSTERIES_BUILTIN = (mysteriesData as MysteryDataShape).mysteries;
/** Live mystery list — uploaded 'missions.mysteries' override or built-in. */
export function getMysteries(): MysteryDef[] {
  return resolveMissions('mysteries', MYSTERIES_BUILTIN) as MysteryDef[];
}
/** Built-in mysteries only — dev-console template. */
export const MYSTERIES = MYSTERIES_BUILTIN;

export function findMysteryById(id: string): MysteryDef | null {
  return getMysteries().find((m) => m.id === id) ?? null;
}

export function availableMysteries(
  factionId: string | null,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
): MysteryDef[] {
  return getMysteries().filter(
    (m) =>
      (m.factionId === factionId || (factionId !== null && m.factionId === null)) &&
      playerRep >= m.minRep &&
      !active.includes(m.id) &&
      !completed.includes(m.id),
  );
}

export function fuzzyFindMystery(text: string, pool: readonly MysteryDef[]): MysteryDef | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const exact = pool.find((m) => m.title.toLowerCase() === t);
  if (exact) return exact;
  return pool.find((m) => m.title.toLowerCase().includes(t) || t.includes(m.title.toLowerCase())) ?? null;
}
