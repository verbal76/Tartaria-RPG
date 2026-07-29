// OTA-1020 — CHAPTER CARDS (golem-line story feature, phase 2 of 3).
//
// Owner: "we need to keep updating the player as they play." The main quest
// already advances through a phase spine (mainQuest.ts: hook → revelation →
// cores → descent → nexus/choice → ended) and narrates each transition into
// the feed — but feed lines scroll away like everything else. A CHAPTER CARD
// is the cinematic marker the crawl promised: a full-screen title beat at
// every phase transition, carrying a universal body paragraph plus a line
// written for YOUR story motive (OTA-1018), so the game keeps answering
// "why am I doing this?" in the player's own terms as the arc turns.
//
// Four transitions get cards (the crawl itself is Chapter I):
//   revelation → CHAPTER II  — NINE HEARTS       (first Lost Capital visit)
//   cores      → CHAPTER III — THE FIRST HEART   (first Core recovered)
//   descent    → CHAPTER IV  — THE ENDLESS STAIR (all nine Cores)
//   choice     → CHAPTER V   — THE MUD FLOOD NEXUS (arrival at the Nexus)
// The 'ended' transition deliberately has NO card — EndingScreen is already
// the ending's full-screen presentation; it gains the per-motive EPILOGUE
// line instead (epilogueMotiveLine below).
//
// All authored text lives in app/data/story/chapters.json so the writing can
// be revised without touching logic — same contract as intro.json.

import chaptersData from '../data/story/chapters.json';
import { motiveById } from './story';
import type { MainQuestPhase, MainQuestEnding } from './types';

export interface ChapterCard {
  /** The phase this card marks (also used as a dedupe key by the caller). */
  phase: MainQuestPhase;
  /** Small over-title, e.g. "CHAPTER II". */
  kicker: string;
  /** Large display title, e.g. "NINE HEARTS". */
  title: string;
  /** Universal body paragraph(s). */
  body: string;
  /** Display title of the player's motive, e.g. "The Debt". */
  motiveTitle: string;
  /** The line written for the player's motive. */
  motiveLine: string;
}

interface ChaptersData {
  chapters: Record<string, {
    kicker: string;
    title: string;
    body: string;
    motives: Record<string, string>;
  }>;
  epilogue: Record<string, { motives: Record<string, string> }>;
}

const data = chaptersData as ChaptersData;

/** The phases that carry a chapter card, in arc order (exposed for tests). */
export const CHAPTER_PHASES: readonly MainQuestPhase[] = [
  'revelation',
  'cores',
  'descent',
  'choice',
] as const;

/** The chapter card for entering `phase`, personalized to the character's
 *  motive — or null for phases that don't carry one (hook / nexus / ended).
 *  A missing or unknown motive resolves through motiveById's fallback, so a
 *  legacy character always gets a coherent card rather than a blank line. */
export function chapterCardFor(
  phase: MainQuestPhase,
  motiveId: string | undefined,
): ChapterCard | null {
  const chapter = data.chapters[phase];
  if (!chapter) return null;
  const motive = motiveById(motiveId);
  const motiveLine = chapter.motives[motive.id];
  if (!motiveLine) throw new Error(`story/chapters.json chapter '${phase}' is missing motive '${motive.id}'`);
  return {
    phase,
    kicker: chapter.kicker,
    title: chapter.title,
    body: chapter.body,
    motiveTitle: motive.title,
    motiveLine,
  };
}

/** The per-motive epilogue line for the chosen ending — rendered on
 *  EndingScreen under the faction ending prose. Null only if the JSON drops
 *  an ending block entirely (a missing motive inside a present block is
 *  authoring breakage and throws, same contract as chapterCardFor). */
export function epilogueMotiveLine(
  ending: MainQuestEnding,
  motiveId: string | undefined,
): string | null {
  const block = data.epilogue[ending];
  if (!block) return null;
  const motive = motiveById(motiveId);
  const line = block.motives[motive.id];
  if (!line) throw new Error(`story/chapters.json epilogue '${ending}' is missing motive '${motive.id}'`);
  return line;
}
