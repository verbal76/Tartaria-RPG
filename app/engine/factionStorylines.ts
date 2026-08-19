import { findByTitle } from './titleMatch';
// Faction storyline engine — 5-10 stage chains tied to a single faction.
// Mechanically identical to mysteries (no boss spawn at the end; the final
// stage just unlocks turn-in) but bigger rewards and longer commitment.

import storylineData from '../data/quests/faction-storylines.json';
import type { HuntCheckKind } from './hunts';
import type { StageBinding } from './questStage';

export interface StorylineStageDef extends StageBinding {
  narration: string;
  arbiter: string | null;
  checkKind: HuntCheckKind;
}

export interface StorylineDef {
  /** ⚠ The place the poster SENDS you — resolved against locations.json names and
   *  aliases by `resolvePosterLocation`. Optional: a contract with no place of its
   *  own still falls back to the posting faction's home. Same field, same resolver
   *  and same spelling as a hunt's, so "where does this contract happen" has ONE
   *  answer across every family. */
  targetLocationName?: string;
  id: string;
  title: string;
  posterText: string;
  factionId: string;
  minRep: number;
  rewardTc: number;
  rewardItem: string | null;
  rewardRep: number;
  stages: StorylineStageDef[];
}

interface DataShape { storylines: StorylineDef[]; }

export const STORYLINES = (storylineData as DataShape).storylines;

export function findStorylineById(id: string): StorylineDef | null {
  return STORYLINES.find((s) => s.id === id) ?? null;
}

export function availableStorylines(
  factionId: string | null,
  playerRep: number,
  active: readonly string[],
  completed: readonly string[],
): StorylineDef[] {
  if (!factionId) return [];
  return STORYLINES.filter(
    (s) =>
      s.factionId === factionId &&
      playerRep >= s.minRep &&
      !active.includes(s.id) &&
      !completed.includes(s.id),
  );
}

// ⚠ OTA-1188 — delegates to the shared three-tier resolver. The first two tiers are
// the exact behaviour this function always had; the third catches the case the
// parser creates by stripping stop words ("fragment red tower" vs "Fragment of the
// Red Tower"), and only ever runs where this used to return null. See titleMatch.ts.
export function fuzzyFindStoryline(text: string, pool: readonly StorylineDef[]): StorylineDef | null {
  return findByTitle(text, pool);
}
