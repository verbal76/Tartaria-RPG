import { findByTitle } from './titleMatch';
// Mystery-object quest engine — 3-5 step chains to find lore-canonical
// artifacts (Red Tower fragment, Cradle compass, Leviathan eye, etc.).
// Mechanically these are stripped-down hunts: same stage structure, but
// the "boss" stage hands you the trophy rather than spawning a fight.

import mysteriesData from '../data/quests/mysteries.json';
import type { HuntCheckKind } from './hunts';

export interface MysteryStageDef {
  narration: string;
  arbiter: string | null;
  checkKind: HuntCheckKind;
}

export interface MysteryDef {
  /** ⚠ The place the poster SENDS you — resolved against locations.json names and
   *  aliases by `resolvePosterLocation`. Optional: a contract with no place of its
   *  own still falls back to the posting faction's home. Same field, same resolver
   *  and same spelling as a hunt's, so "where does this contract happen" has ONE
   *  answer across every family. */
  targetLocationName?: string;
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

export const MYSTERIES = (mysteriesData as MysteryDataShape).mysteries;

export function findMysteryById(id: string): MysteryDef | null {
  return MYSTERIES.find((m) => m.id === id) ?? null;
}

export function availableMysteries(
  factionId: string | null,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
): MysteryDef[] {
  return MYSTERIES.filter(
    (m) =>
      (m.factionId === factionId || (factionId !== null && m.factionId === null)) &&
      playerRep >= m.minRep &&
      !active.includes(m.id) &&
      !completed.includes(m.id),
  );
}

// ⚠ OTA-1188 — delegates to the shared three-tier resolver. The first two tiers are
// the exact behaviour this function always had; the third catches the case the
// parser creates by stripping stop words ("fragment red tower" vs "Fragment of the
// Red Tower"), and only ever runs where this used to return null. See titleMatch.ts.
export function fuzzyFindMystery(text: string, pool: readonly MysteryDef[]): MysteryDef | null {
  return findByTitle(text, pool);
}
