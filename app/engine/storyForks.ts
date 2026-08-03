// OTA-1088 — PHASE 3: MAKE THE STORY ASK QUESTIONS.
//
// The build plan, verbatim: "the audience that pays premium for text is paying
// for consequence, and right now you have exactly one fork in the game. The
// Missing's grave / lie / walker resolution proves the machinery works. Extend
// that shape: 1-2 genuine forks per motive, with lasting consequence. Chapter
// cards become decisions rather than broadcasts."
//
// ── WHAT MAKES THIS A FORK AND NOT THE THING WE ALREADY HAD ──────────────
// The Missing resolution is DEALT — missingResolutionFor() hashes the identity
// seed and the character gets whichever of the three answers the hash lands on.
// It is a branch, and it proved the plumbing (a side-thread that ends, carries
// a keepsake, and overrides the epilogue), but the player never chose it. This
// module is the same plumbing with the hash replaced by a person. Every fork
// here is a question, asked once, with no correct answer and no take-backs.
//
// ⚠ FORKS ARE DERIVED, NOT QUEUED. THIS IS THE LOAD-BEARING DECISION.
// The plan flags the risk in as many words: "branch-state persistence needs
// care, and this is the one place a save-migration bug would be unrecoverable
// for a player mid-arc." A fork raised by pushing it onto a pending-queue can
// be lost — app killed mid-card, a crash between raise and answer, a migration
// that drops the queue — and a lost fork is a chapter of the player's story
// that silently never happened, with nothing on screen to say so.
//
// So nothing is ever queued. `dueFork(player)` is a PURE FUNCTION of state:
// the first fork whose motive matches, whose phase gate the run has passed,
// and which has no recorded answer. Kill the app in front of the card and it
// is due again on load, because it was never anywhere else. The only thing
// written to the save is the ANSWER — one string per fork in
// player.storyChoices — which is the smallest possible thing to persist and
// the only thing that cannot be recomputed.
//
// ── LASTING CONSEQUENCE, THREE WAYS ──────────────────────────────────────
// A choice with no downstream reader is a flavour text with extra taps. Each
// option lands in three places:
//   1. IMMEDIATELY — an authored line, and material effects (coin, a keepsake,
//      a title, a whisper, faction standing).
//   2. IN THE ENDING — an epilogue sentence, permanently, on EndingScreen.
//      The motive epilogue still closes the arc; these say what you DID.
//   3. IN THE WORLD — Phase 2 topics can gate on `requiresChoice`, so the cast
//      built over OTA-1081..1087 can know what you chose and say so.
//
// All authored text lives in app/data/story/forks.json — same contract as
// intro.json / chapters.json / drip.json, so the writing is revisable without
// touching logic.
import forksData from '../data/story/forks.json';
import { motiveById, type StoryMotiveId } from './story';
import type { MainQuestPhase, PlayerCharacter } from './types';

/** The story's own order, shared with dialogue.ts's minChapter. A fork gated
 *  at 'cores' is due from the moment the run reaches cores and stays due for
 *  every later phase — a player who blew through a transition without an
 *  answer is asked at the next opportunity, never skipped. */
export const PHASE_ORDER: MainQuestPhase[] = ['hook', 'revelation', 'cores', 'descent', 'nexus', 'choice', 'ended'];

export interface ForkEffects {
  /** Coin, either direction. A fork may cost you something. */
  tc?: number;
  /** A keepsake. Granted through the normal item path so it is real. */
  item?: { name: string; description: string };
  /** An authored whisper chain id (engine/whispers.ts CHAINS). */
  whisper?: string;
  /** ⚠ ONE-SHOT faction standing. Bounded and authored, and it is a STORY
   *  beat rather than an economy: it fires once per character, ever, because
   *  the fork itself can only be answered once. See OTA-1087 for why anything
   *  repeatable must never touch standing. */
  standing?: { factionId: string; delta: number };
  /** A title, awarded outright. */
  title?: string;
}

export interface ForkOption {
  id: string;
  /** The button. Written as the thing you DO, not the thing you get. */
  label: string;
  /** The honest cost or shape of it, shown under the button. A fork where the
   *  player cannot see what they are trading is a coin flip, not a decision. */
  hint: string;
  /** What happens, immediately, in the feed. */
  line: string;
  /** One sentence, on the ending screen, forever. */
  epilogue: string;
  effects?: ForkEffects;
}

export interface StoryFork {
  id: string;
  motive: StoryMotiveId;
  /** Earliest phase this question makes sense in. */
  minPhase: MainQuestPhase;
  /** Cores in hand. `minPhase: 'cores'` is a long stretch — five Cores live
   *  inside it — so phase alone cannot say "once you are most of the way". */
  minCores?: number;
  kicker: string;
  title: string;
  /** The situation. */
  body: string;
  /** The question itself, above the options. */
  question: string;
  options: ForkOption[];
}

const DATA = forksData as unknown as { forks: StoryFork[] };
export const ALL_FORKS: StoryFork[] = DATA.forks;

export function forksForMotive(motiveId: string | undefined): StoryFork[] {
  const motive = motiveById(motiveId);
  return ALL_FORKS.filter((f) => f.motive === motive.id);
}

export function forkById(forkId: string): StoryFork | null {
  return ALL_FORKS.find((f) => f.id === forkId) ?? null;
}

export function optionById(forkId: string, optionId: string): ForkOption | null {
  return forkById(forkId)?.options.find((o) => o.id === optionId) ?? null;
}

/** What this character has already answered. Tolerant of a save written by a
 *  build that had forks this one does not: an unknown id is simply not read
 *  back, never a crash. */
export function choicesOf(p: Pick<PlayerCharacter, 'storyChoices'>): Record<string, string> {
  return p.storyChoices ?? {};
}

export function chosenOption(
  p: Pick<PlayerCharacter, 'storyChoices'>,
  forkId: string,
): ForkOption | null {
  const optId = choicesOf(p)[forkId];
  return optId ? optionById(forkId, optId) : null;
}

/** ⚠ THE WHOLE PERSISTENCE STORY. Pure, total, and derived from state the run
 *  already carries — so a fork cannot be lost by a crash, a kill, or a
 *  migration. Returns the first unanswered fork this character has reached. */
export function dueFork(
  p: Pick<PlayerCharacter, 'storyMotive' | 'storyChoices' | 'mainQuest'>,
): StoryFork | null {
  const answered = choicesOf(p);
  const phase = p.mainQuest?.phase ?? 'hook';
  const have = PHASE_ORDER.indexOf(phase);
  const cores = p.mainQuest?.coresRecovered?.length ?? 0;
  for (const fork of forksForMotive(p.storyMotive)) {
    if (answered[fork.id]) continue;
    const need = PHASE_ORDER.indexOf(fork.minPhase);
    if (need < 0 || have < 0 || have < need) continue;
    if (fork.minCores !== undefined && cores < fork.minCores) continue;
    return fork;
  }
  return null;
}

/** Record an answer. Returns a NEW choices map — the caller owns the write, so
 *  this stays pure and testable with no store in the room. Answering the same
 *  fork twice is impossible by construction (dueFork skips answered ones), but
 *  if it ever happened the FIRST answer stands: a decision that could be
 *  overwritten is not a decision. */
export function recordChoice(
  prev: Record<string, string> | undefined,
  forkId: string,
  optionId: string,
): Record<string, string> {
  const cur = prev ?? {};
  if (cur[forkId]) return cur;
  if (!optionById(forkId, optionId)) return cur;
  return { ...cur, [forkId]: optionId };
}

/** The ending screen's "what you chose" block: one sentence per answered fork,
 *  in authored fork order so a replay reads the same way. */
export function epilogueChoiceLines(
  p: Pick<PlayerCharacter, 'storyMotive' | 'storyChoices'>,
): string[] {
  const answered = choicesOf(p);
  return forksForMotive(p.storyMotive)
    .map((f) => (answered[f.id] ? optionById(f.id, answered[f.id]!)?.epilogue : null))
    .filter((l): l is string => !!l);
}

/** The key a dialogue TopicGate matches on, so Phase 2's cast can react to
 *  Phase 3's decisions. `"<forkId>:<optionId>"` — one string, so the gate stays
 *  a single equality and cannot grow a second way to be wrong. */
export function choiceKeys(p: Pick<PlayerCharacter, 'storyChoices'>): string[] {
  return Object.entries(choicesOf(p)).map(([f, o]) => `${f}:${o}`);
}

/** Authoring guard, run as a test rather than at load: every option must carry
 *  a label, a hint, a line and an epilogue, and every fork must offer a real
 *  choice. Returns the problems it found. */
export function forkAuthoringProblems(): string[] {
  const bad: string[] = [];
  const seen = new Set<string>();
  for (const f of ALL_FORKS) {
    if (seen.has(f.id)) bad.push(`duplicate fork id ${f.id}`);
    seen.add(f.id);
    if (f.options.length < 2) bad.push(`${f.id}: a fork needs at least two options`);
    if (PHASE_ORDER.indexOf(f.minPhase) < 0) bad.push(`${f.id}: unknown minPhase ${f.minPhase}`);
    const optIds = new Set<string>();
    for (const o of f.options) {
      if (optIds.has(o.id)) bad.push(`${f.id}: duplicate option id ${o.id}`);
      optIds.add(o.id);
      for (const [field, v] of [['label', o.label], ['hint', o.hint], ['line', o.line], ['epilogue', o.epilogue]] as const) {
        if (!v || !v.trim()) bad.push(`${f.id}.${o.id}: empty ${field}`);
        if (v && v.includes('{')) bad.push(`${f.id}.${o.id}: unsubstituted placeholder in ${field}`);
      }
    }
  }
  return bad;
}
