import { factionQuestReady, type FactionQuestDef } from './factionQuests';

/** OTA-1175 — ONE definition of "ready to hand in", for every contract kind.
 *
 *  ⚠ WHY THIS MODULE EXISTS. Until now "ready" was three separate expressions
 *  computed inline in three different sections of ContractsScreen:
 *    • hunts / mysteries / storylines → `run.stage >= def.stages.length`
 *    • faction contracts             → `factionQuestReady(def, stage, countItem)`
 *    • the broker's alliance legs     → every demanded relic held
 *  Nothing tied them together, so the sections were free to drift apart, and any
 *  NEW consumer would have been wired to whichever one its author happened to
 *  read — floating that kind correctly while silently missing the other two. The
 *  READY TO HAND IN sort is that new consumer, so the definitions get unified
 *  first and every existing site now routes through here.
 *
 *  ⚠ THE BEHAVIOUR IS DELIBERATELY UNCHANGED. Each arm reproduces its old
 *  expression exactly — including the stage arm's missing "has any stages at all"
 *  guard, which would flip a stage-less def from ready to not-ready if "tidied".
 *  This OTA unifies WHERE the answer is computed, not WHAT it answers; a tuning
 *  change to any arm is a separate, deliberate call.
 *
 *  `countItem` / `hasItem` are passed in so this module stays store-free and
 *  testable, matching factionQuestReady's own convention. */
export type TurnInSubject =
  /** Stage-counter kinds: the work is done when every stage has been played. */
  | { kind: 'hunt' | 'mystery' | 'storyline'; stage: number; stageCount: number }
  /** Faction contracts: staged OR fetch-count OR legacy single-objective. */
  | {
      kind: 'faction_quest';
      def: FactionQuestDef;
      stage: number;
      countItem: (name: string) => number;
    }
  /** The broker's Parley of Factions: every demanded relic in hand. */
  | {
      kind: 'broker';
      legs: readonly { itemName: string }[];
      hasItem: (name: string) => boolean;
    };

/** True when a contract's WORK is finished and only the hand-in remains.
 *  This is the same question the card's READY pill and its COMPLETE gate ask,
 *  so a contract can never sort as ready while its card refuses to close. */
export function missionTurnInReady(subject: TurnInSubject): boolean {
  switch (subject.kind) {
    case 'hunt':
    case 'mystery':
    case 'storyline':
      return subject.stage >= subject.stageCount;
    case 'faction_quest':
      return factionQuestReady(subject.def, subject.stage, subject.countItem);
    case 'broker':
      return subject.legs.length > 0 && subject.legs.every((l) => subject.hasItem(l.itemName));
  }
}
