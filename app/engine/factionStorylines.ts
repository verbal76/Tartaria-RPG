// Faction storyline engine — 5-10 stage chains tied to a single faction.
// Mechanically identical to mysteries (no boss spawn at the end; the final
// stage just unlocks turn-in) but bigger rewards and longer commitment.

import storylineData from '../data/quests/faction-storylines.json';
import type { HuntCheckKind } from './hunts';

export interface StorylineStageDef {
  narration: string;
  arbiter: string | null;
  checkKind: HuntCheckKind;
}

export interface StorylineDef {
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

export function fuzzyFindStoryline(text: string, pool: readonly StorylineDef[]): StorylineDef | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  const exact = pool.find((s) => s.title.toLowerCase() === t);
  if (exact) return exact;
  return pool.find((s) => s.title.toLowerCase().includes(t) || t.includes(s.title.toLowerCase())) ?? null;
}
