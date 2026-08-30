// missionEncounter — OTA-1580. The mission conversation card's rules, pure.
//
// ⚠⚠⚠ THE HOLE THIS FILLS IS TOTAL, not partial. 114 stages across hunts,
// mysteries and storylines name a person. `npcName` was read in exactly ONE
// place in the whole codebase — questStage.ts, building the hint string
// `find <name>` — and nothing ever placed them, gave them dialogue, or let them
// hand anything over. The owner asked it plainly: "I have to meet a guy to get a
// note, right?" There was no guy. Not for that mission, not for any of them.
//
// ⚠⚠⚠ AND IT IS WHY THE CARD IS THE ARCHITECTURE, not a nicer wrapper. Every
// previous pass fixed individual stages where the prose and the bindings
// disagreed. A card cannot disagree with itself: if the beat is a set of
// buttons, the text cannot promise an option the buttons do not offer.
//
// The owner's ruleset (2026-08-30), which this file encodes:
//   1. A role repeated across stages is ONE PERSON, persistent.
//   2. They exist only while the mission is live.
//   3. A good enough CHA roll ELIMINATES the fight and completes the stage —
//      whoever was waiting to fight "figures it out" and stands down.
//   4. A failed persuade goes STRAIGHT to the fight. ONE attempt EVER; it does
//      not reset on flee-and-return. Come back after failing and they MOCK you,
//      then fight.
//   5. Flee costs what any flee costs.
//   6. After winning: TAKE, or TAKE AND KILL. Kill them and a SUCCESSOR holds
//      the post in later missions, knows what you did, and is HARDER to talk
//      down — "they are prepared to die."
//   7. The card owns the whole encounter. A fight drops back to the exploration
//      screen and then RETURNS here to finish.

/** Where the encounter is in its own life. */
export type EncounterPhase =
  | 'opening'      // the card is up, nothing chosen yet
  | 'fighting'     // handed off to the exploration screen; the card is waiting
  | 'aftermath'    // the fight is won; take / take-and-kill
  | 'resolved'     // the stage is done
  | 'fled';        // player left; the tile keeps a SUMMON button

/**
 * What the player can press. FLEE is always offered — a modal with no exit is
 * how a player gets wedged when a check cannot be passed.
 *
 * ⚠⚠⚠ OTA-1581 SUPERSEDES OTA-1580'S BUTTON SET, and the reason is a
 * MEASUREMENT, not a redesign. 1580 offered `talk` as the opening button on
 * every card. Counting the shipped data afterwards: of the 114 stages that name
 * a person, exactly ZERO put bodies in front of you — the only two `spawn`
 * blocks in the whole game sit on boss stages that name nobody. So a card
 * built around TALK-then-FIGHT would have shown a FIGHT button that spawned
 * nothing on all 114, which is the exact lie this card exists to end.
 *
 * `talk` is therefore replaced by `proceed`: the stage's OWN action, as a
 * visible button. That is the owner's actual complaint answered — *"make sure
 * the events actually happen and are not hidden under text, that they're
 * noticeable as a pop-up on the screen like talk to yulka. has that button
 * now."* 99 of the 114 are conversations, and a conversation's button is
 * "hand it over", not "swing".
 */
export type EncounterChoice = 'proceed' | 'persuade' | 'fight' | 'flee' | 'take' | 'take_and_kill';

/**
 * ⚠⚠ THE PERSUADE BAR IS DELIBERATELY HIGH. Owner: "making him give it up
 * should be a hard roll. you should have to really train your charisma. plus
 * have armor with buff stats to make it — the average player shouldn't just roll
 * it and walk away." A success skips a whole fight AND completes the stage, so
 * it has to cost a build, not a lucky d20.
 *
 * Scaled by what is being ASKED, not by a flat number: handing over a token the
 * asker wants you to have is nothing; prising loose the thing three sworn men
 * were left to guard is the hard end.
 */
export type PersuadeStakes = 'errand' | 'favour' | 'concession' | 'surrender';

/** Base DC per stake. A d20 + CHA has to clear these. */
export const PERSUADE_DC: Readonly<Record<PersuadeStakes, number>> = {
  errand: 10,      // "take this token to Mira" — they want you to have it
  favour: 15,      // "tell me where it roosts"
  concession: 22,  // "give me the thing you were told to keep"
  surrender: 26,   // "call off the men you posted to kill me"
};

// ⚠⚠ TUNED AGAINST REAL BUILDS, and the first draft failed its own suite. At
// errand 10 / favour 14 / concession 18 / surrender 22 the owner's OWN character
// — CHA 2 — cleared every tier on a natural 20, which is exactly the "roll it and
// walk away" he ruled out. What the numbers above mean in practice:
//
//   CHA 2  (a dump stat)          errand 65% · favour 40% · concession 5% · surrender never
//   CHA 8  (an average player)    errand 95% · favour 70% · concession 35% · surrender 15%
//   CHA 16 (trained + gear)       errand auto · favour auto · concession 75% · surrender 55%
//
// So the social route is a BUILD: the hardest ask is unreachable without
// investment, and generous once you have made it. A natural 20 is not a skeleton
// key at the top tier, which is the whole of the owner's ruling.

/**
 * ⚠⚠ WHAT A DEAD PREDECESSOR COSTS YOU. Owner: "somebody's scared of you and you
 * have to convince him… they are prepared to die." Fear reads as leverage and is
 * not — a man who has watched the last holder of his post die for this has
 * already decided how it ends. Each killing in that role stacks, and the clamp
 * exists so a serial killer meets a wall rather than an impossibility.
 */
export const SUCCESSOR_DC_STEP = 3;
export const SUCCESSOR_DC_MAX = 6;

export interface PersuadeContext {
  stakes: PersuadeStakes;
  /** Effective CHA, gear and buffs already folded in — the owner's "armor with
   *  buff stats" is expected to arrive here, not be applied after. */
  charisma: number;
  /** How many holders of THIS ROLE the player has killed. */
  predecessorsKilled: number;
  /** d20. Injectable so the suite can walk the whole curve. */
  roll: number;
}

export interface PersuadeOutcome {
  dc: number;
  total: number;
  success: boolean;
  /** True when a dead predecessor is what made the difference — the card says so. */
  hardenedByFear: boolean;
}

/** The bar this attempt has to clear. */
export function persuadeDc(stakes: PersuadeStakes, predecessorsKilled: number): number {
  const bump = Math.min(SUCCESSOR_DC_MAX, Math.max(0, predecessorsKilled) * SUCCESSOR_DC_STEP);
  return PERSUADE_DC[stakes] + bump;
}

/**
 * ⚠ ONE ROLL, NO MODIFIERS INVENTED HERE. Everything the player brings is
 * already in `charisma`; this function only decides. Keeping the arithmetic in
 * one place is the OTA-1564 lesson — a second copy of "did the talk land" is how
 * two screens come to disagree about the same conversation.
 */
export function resolvePersuade(ctx: PersuadeContext): PersuadeOutcome {
  const base = PERSUADE_DC[ctx.stakes];
  const dc = persuadeDc(ctx.stakes, ctx.predecessorsKilled);
  const total = ctx.roll + ctx.charisma;
  return {
    dc,
    total,
    success: total >= dc,
    hardenedByFear: dc > base && total >= base && total < dc,
  };
}

/** Per-encounter state the save carries while a mission is live. */
export interface EncounterState {
  /** Stage this belongs to — mission id + stage index. */
  key: string;
  phase: EncounterPhase;
  /** ⚠⚠ ONE ATTEMPT EVER. Owner: "you only get one chance at persuade, after
   *  that it's always the fight. even if you flee and come back." So this rides
   *  the ENCOUNTER, not the card instance, and survives a flee. */
  persuadeSpent: boolean;
  /** True once they have mocked the player for the failed attempt, so the jeer
   *  lands once rather than on every re-entry. */
  mocked: boolean;
}

export function freshEncounter(key: string): EncounterState {
  return { key, phase: 'opening', persuadeSpent: false, mocked: false };
}

/** Which buttons the card shows right now. */
export function choicesFor(
  st: EncounterState,
  opts?: { hasFight?: boolean; canPersuade?: boolean; canKill?: boolean },
): EncounterChoice[] {
  const hasFight = opts?.hasFight ?? true;
  switch (st.phase) {
    case 'opening': {
      const out: EncounterChoice[] = [];
      if (hasFight) {
        // ⚠ PERSUADE ONLY EXISTS WHERE THERE IS A FIGHT TO REMOVE. Owner's rule
        // 4 is precisely that: *"a good enough charisma roll should eliminate
        // the fight and you complete that stage."* On a beat with nobody posted
        // to stop you there is nothing for a roll to buy, and offering one would
        // be a dice screen that changes nothing.
        //
        // ⚠ And it DISAPPEARS once spent — not greyed out, not silently
        // ignored. A button that does nothing is the same lie as a card that
        // promises what the engine will not do.
        if (!st.persuadeSpent && (opts?.canPersuade ?? true)) out.push('persuade');
        out.push('fight');
      } else if (opts?.canPersuade ?? true) {
        // ⚠ `canPersuade` doubles as "the pack satisfies this stage" — a stage
        // that wants a logbook you are not carrying offers no way forward, and
        // the card names what is owed instead of showing a button that refuses.
        out.push('proceed');
      }
      out.push('flee');
      return out;
    }
    // The fight is on the exploration screen; the card is not showing.
    case 'fighting': return [];
    // ⚠ TAKE AND KILL IS FOR A POST, NOT A PERSON. `canKill` is false for the 19
    // authored individuals (Old Mira, Brother Ammon…) who have no successor to
    // hold their place — see missionRoles.
    case 'aftermath': return (opts?.canKill ?? true) ? ['take', 'take_and_kill'] : ['take'];
    case 'resolved': return [];
    // ⚠ A fled encounter is re-entered by the tile's SUMMON button, not by the
    // card — see the owner's rule 10. Nothing to press here.
    case 'fled': return [];
  }
}

export interface EncounterStep {
  next: EncounterState;
  /** What the caller must now do. The card never does these itself. */
  effect:
    | { kind: 'none' }
    | { kind: 'start_fight' }
    | { kind: 'complete_stage'; killed: boolean }
    | { kind: 'leave' };
  /** Line to show, if the step has one to say. */
  say?: string;
}

/**
 * ⚠⚠⚠ THE ONE TRANSITION FUNCTION. Every button routes through this so the
 * one-attempt rule and the fight hand-off cannot be forgotten at a call site —
 * the same reason `landControl` is the only way to grant a control (OTA-1572).
 */
export function applyChoice(
  st: EncounterState,
  choice: EncounterChoice,
  ctx?: { persuade?: PersuadeContext; hasFight?: boolean },
): EncounterStep {
  const hasFight = ctx?.hasFight ?? true;

  if (choice === 'flee') {
    return { next: { ...st, phase: 'fled' }, effect: { kind: 'leave' } };
  }

  if (choice === 'persuade') {
    // Refused rather than silently re-rolled. A spent attempt is spent.
    if (st.persuadeSpent) {
      return { next: st, effect: { kind: 'none' }, say: 'You have already said your piece.' };
    }
    const out = ctx?.persuade
      ? resolvePersuade(ctx.persuade)
      : { dc: 99, total: 0, success: false, hardenedByFear: false };
    if (out.success) {
      // ⚠⚠ A WIN SKIPS THE FIGHT ENTIRELY AND CLOSES THE STAGE. Owner: "whoever
      // is there to fight, you should just be like — oh, I guess they figured it
      // out." Nobody dies, so nobody is added to the kill ledger.
      return {
        next: { ...st, persuadeSpent: true, phase: 'resolved' },
        effect: { kind: 'complete_stage', killed: false },
      };
    }
    // ⚠⚠ FAILURE GOES STRAIGHT TO THE FIGHT — no second try, no back-out to the
    // opening. The stage is still winnable, just the hard way.
    return {
      next: { ...st, persuadeSpent: true, phase: hasFight ? 'fighting' : 'opening' },
      effect: hasFight ? { kind: 'start_fight' } : { kind: 'none' },
      say: out.hardenedByFear
        ? 'They have seen what happens to people who hold this post. It does not move them the way you hoped.'
        : undefined,
    };
  }

  if (choice === 'fight') {
    return { next: { ...st, phase: 'fighting' }, effect: { kind: 'start_fight' } };
  }

  if (choice === 'take' || choice === 'take_and_kill') {
    if (st.phase !== 'aftermath') return { next: st, effect: { kind: 'none' } };
    return {
      next: { ...st, phase: 'resolved' },
      effect: { kind: 'complete_stage', killed: choice === 'take_and_kill' },
    };
  }

  if (choice === 'proceed') {
    // ⚠ THE STAGE'S OWN ACTION, AS A BUTTON. No roll, no fight — this is the
    // beat the prose describes, performed deliberately instead of happening to
    // the player somewhere in a scroll of feed text.
    if (st.phase !== 'opening') return { next: st, effect: { kind: 'none' } };
    return { next: { ...st, phase: 'resolved' }, effect: { kind: 'complete_stage', killed: false } };
  }

  return { next: st, effect: { kind: 'none' } };
}

/**
 * The fight is over and the player is still standing. The card comes back — the
 * owner's rule 8: "it drops back into the exploration screen until that part is
 * over, then it goes back to the pop-up to resolve the rest of it."
 */
export function onFightWon(st: EncounterState): EncounterState {
  return st.phase === 'fighting' ? { ...st, phase: 'aftermath' } : st;
}

/**
 * Re-entering the tile. A fled encounter re-arms; a resolved one stays shut.
 *
 * ⚠⚠ AND A FAILED PERSUADER GETS MOCKED, ONCE. Owner: "if you lose a persuade
 * and you flee and come back, have them mock you a little bit then fight you."
 * The `mocked` flag is what keeps that a beat rather than a nag.
 */
export function onReenter(st: EncounterState): { next: EncounterState; mock: boolean } {
  if (st.phase !== 'fled') return { next: st, mock: false };
  const mock = st.persuadeSpent && !st.mocked;
  return { next: { ...st, phase: 'opening', mocked: st.mocked || mock }, mock };
}
