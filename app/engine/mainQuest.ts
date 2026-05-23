// v2.4.1 (OTA 033) — Mud Flood Nexus main quest arc.
//
// Universal end-game spine every character pursues:
//
//   hook       (character creation)
//     → Arbiter mentions the Mud Flood Nexus once; no active
//       objective yet. The mention is the seed.
//
//   revelation (first arrival at a Lost Capital)
//     → Arbiter or a faction-keyed NPC reveals: there are 5 Aetheric
//       Cores buried inside the 5 Lost Capitals. Reaching the Mud
//       Flood Nexus requires all 5.
//
//   cores      (active recovery)
//     → Player visits each Lost Capital and recovers its Core. Order
//       is free. UI surfaces progress (3/5, etc.).
//
//   descent    (all 5 Cores recovered)
//     → Endless Stair becomes passable. Player can descend to the
//       Aetherstone Deep.
//
//   nexus      (player arrives at Mud Flood Nexus with all 5 Cores)
//     → Terminal scene. The Choice is presented.
//
//   choice     (UI prompt — Seal / Unleash / Preserve)
//
//   ended      (Choice made — credits)
//
// Faction colors HOW each Core is recovered (the route flavor) —
// Reclaimers salvage, Forgotten Order study, Mud Monarchs claim,
// etc. Phase 1 ships the universal spine + a reference route for
// the Reclaimers; the other 8 factions get a generic placeholder
// route until later OTAs fill them in.

import type {
  MainQuestState,
  MainQuestPhase,
  MainQuestEnding,
  PlayerCharacter,
  Intent,
} from './types';

/** The 5 Lost Capitals canonically house one Aetheric Core each. */
export const LOST_CAPITAL_LOCATIONS: readonly string[] = [
  'asgardar',
  'samarran',
  'nimari',
  'drakova',
  'voronov',
] as const;

/** Mud Flood Nexus is the terminal destination — gated on all 5
 *  Cores being in the player's possession. */
export const NEXUS_LOCATION_ID = 'mud_flood_nexus';

/** Initial state for a fresh character. */
export function initMainQuest(): MainQuestState {
  return { phase: 'hook', coresRecovered: [] };
}

/** Backfill helper for legacy saves. */
export function ensureMainQuest(mq: MainQuestState | undefined): MainQuestState {
  if (mq && typeof mq.phase === 'string') return mq;
  return initMainQuest();
}

/** Arbiter narration per phase entry. Each phase logs ONE line on
 *  entry (the player just transitioned into this phase). The line
 *  varies by player faction so the same world-event reads through
 *  the faction's lens. */
const HOOK_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'The Arbiter watches you across the firelight. "There is a place under all the others — the Mud Flood Nexus. The Reclaimers have looked for it a long time. None has reached it. The 5 Lost Capitals know the way."',
  forgotten_order:
    'The Arbiter sets down a hand-copied page. "Every text the Order has restored points the same direction — the Mud Flood Nexus. The cataclysm did not happen everywhere. It happened HERE. And the 5 Lost Capitals each hold a key."',
  mud_monarchs:
    'The Arbiter speaks low. "Your family has known about the Nexus for three centuries. The 5 Lost Capitals each hold a piece of what bound it. The crown that gathers all five reopens it."',
  true_tartarians:
    'The Arbiter inclines their head. "The Entombed speak of the Mud Flood Nexus — the wound that made the buried country. The 5 Lost Capitals each guard a piece of its old binding."',
  eternal_dynasty:
    'The Arbiter folds a yellowed parchment. "The Mud Flood Nexus is where the empire ended. To raise the Dynasty again, the 5 Cores from the 5 Lost Capitals must be returned to it."',
  conspiracy_architects:
    'The Arbiter slides a redacted file across the desk. "There is a site we have buried our own warnings about — the Mud Flood Nexus. Whoever reaches it with all 5 Cores writes the next chapter. We would prefer no one did."',
  servants_of_giants:
    'The Arbiter touches the lantern. "The Giants speak in their sleep of the Nexus — the wound that drowned them. To wake them properly, the 5 Cores must be returned, each in turn."',
  stone_builders:
    'The Arbiter unrolls a draft. "The Mud Flood Nexus is the original Aethercraft engine — the one that failed. The 5 Cores in the 5 Lost Capitals are its old regulators. Recover them, and the engine can be made to work again."',
  tartarian_revivalists:
    'The Arbiter looks up from a stack of unpublished photographs. "When the public sees the Mud Flood Nexus, the surface world ends. We need the 5 Cores from the 5 Lost Capitals to open it. Then everyone will know."',
};

const REVELATION_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'A Reclaimer veteran walks you through the standing arches. "Each Capital — Asgardar, Samarran, Nimari, Drakova, Voronov — buries one Aetheric Core. The salvage of a lifetime, if you can pry them loose."',
  forgotten_order:
    'An Order librarian uncovers a sealed map. "The 5 Cores. One per Capital. Each was placed before the flood and sealed by Aetheric protocols the Order has half-translated. The other half waits inside."',
  mud_monarchs:
    'A Monarch agent presents the family ledger. "The 5 Cores by family right belong to you. Drakova, Nimari, Asgardar, Samarran, Voronov. Travel under our standard; the Capitals will recognize your claim — or refuse it, and pay the price."',
  true_tartarians:
    'A True Tartarian elder sketches the old map in clay. "Each Capital is a sleeping mouth. You must enter, ask permission of the Core, and carry it out. Asgardar speaks first. Samarran answers. Nimari listens. Drakova waits. Voronov tests."',
  eternal_dynasty:
    'A dynastic herald confirms the lineage seal on your hand. "Five Capitals. Five Cores. Five proofs of blood. Asgardar your throne, Samarran your school, Nimari your guard, Drakova your reserve, Voronov your treasury. Each will name you."',
  conspiracy_architects:
    'An Architect senior partner spreads five dossiers across the table. "The 5 Capitals each contain a Core. We have spent generations preventing anyone from connecting the dots. You are the dot-connector now. We have no further plausible deniability."',
  servants_of_giants:
    'A Servant of the Giants pours libation. "Five Capitals. Five Giants. Each Capital is the resting-place of one Giant; each Giant guards one Core. The Giants must consent. They will, if you keep the vigil correctly."',
  stone_builders:
    'A Stone Builder foreman lays out five blueprints. "Asgardar Core: power. Samarran Core: timing. Nimari Core: shielding. Drakova Core: reserve. Voronov Core: regulator. Assemble them all and the Nexus engine cycles. Miss one, it floods again."',
  tartarian_revivalists:
    'A Revivalist cell organizer hands you a press kit. "Five Capitals. Five recoveries. Five publishable artifacts. Each Core you bring out goes on the front page. By the time you have all five, the surface world is asking us for an interview."',
};

const CORE_RECOVERED_LINE = (factionId: string, capitalId: string, recoveredCount: number): string => {
  const capitalName = LOST_CAPITAL_NAMES[capitalId] ?? capitalId;
  const remaining = 5 - recoveredCount;
  const tail = remaining === 0
    ? 'All five Cores rest in your pack. The Endless Stair will open to a carrier of the full set.'
    : `${remaining} Core${remaining === 1 ? '' : 's'} still to recover.`;
  // Faction-flavored opener — kept terse so the cadence doesn't drag
  // when the player is mid-action.
  const opener: Record<string, string> = {
    reclaimers_guild:    `The ${capitalName} Core comes loose under your trowel — pried clean from its Tartarian seat.`,
    forgotten_order:     `The ${capitalName} Core releases on the third reading of its binding text. The Order's scholarship holds.`,
    mud_monarchs:        `The ${capitalName} Core acknowledges your blood and lets itself be lifted. Family right, family due.`,
    true_tartarians:     `The ${capitalName} Core consents to be carried. The Entombed approve.`,
    eternal_dynasty:     `The ${capitalName} Core knows you. The lineage is unbroken. It lifts to your hand.`,
    conspiracy_architects: `The ${capitalName} Core was already half-loose from a prior, unrecorded recovery. You complete the job.`,
    servants_of_giants:  `The ${capitalName} Core is released by the watching Giant. The vigil holds.`,
    stone_builders:      `The ${capitalName} Core is decoupled with the right tools and three calm hours of work. Aethercraft is method.`,
    tartarian_revivalists: `The ${capitalName} Core is yours. The cell will have the footage by morning.`,
  };
  const line = opener[factionId] ?? `The ${capitalName} Core is yours.`;
  return `${line} ${tail}`;
};

const LOST_CAPITAL_NAMES: Record<string, string> = {
  asgardar: 'Asgardar',
  samarran: 'Samarran',
  nimari: 'Nimari',
  drakova: 'Drakova',
  voronov: 'Voronov',
};

const DESCENT_LINE_BY_FACTION: Record<string, string> = {
  reclaimers_guild:
    'You stand at the head of the Endless Stair with all 5 Cores. The Reclaimers have never reached the bottom. You will be the first.',
  forgotten_order:
    'The 5 Cores hum together for the first time in a thousand years. The Stair recognizes the harmony and shows its lower turns.',
  mud_monarchs:
    'You hold the 5 Cores as your ancestors meant to. The Stair opens — the family right finally executed.',
  true_tartarians:
    'The 5 Cores ride your pack like sleeping children. The Stair, sensing them, draws breath. The Entombed walk down with you in silence.',
  eternal_dynasty:
    'With the 5 Cores returned to your blood, the empire descends with you. The Stair turns under a once-proper authority.',
  conspiracy_architects:
    'The 5 Cores together represent an evidentiary crisis. You carry them into the Stair anyway. The Architects will have to manage the press later.',
  servants_of_giants:
    'The 5 Cores wake the 5 Giants in their sleep. The Stair shakes once with their stirring, then steadies. The vigil descends with you.',
  stone_builders:
    'The 5 Cores in series. The Stair powers up like a long-disused engine — old Aethercraft warming. Each tread firms under your foot as the system cycles.',
  tartarian_revivalists:
    'You have all 5 Cores and a documentary crew waiting at the surface. The Stair opens. The world is about to learn what was buried.',
};

const NEXUS_ARRIVAL_LINE =
  'You arrive at the Mud Flood Nexus. The chamber is older than every kingdom drawn on every honest map. The 5 Cores in your pack pulse in concord. The control mantle waits — three actions are possible. None is reversible.';

const CHOICE_LINE_BY_ENDING: Record<MainQuestEnding, string> = {
  seal: 'You SEAL the Nexus. The cataclysm is locked away — Tartaria stays buried, the surface world stays innocent. The Cores fuse into the mantle as you set the last one. The chamber dims. You can walk out, or stay until the dim takes you. Either is a kind of ending.',
  unleash: 'You UNLEASH the Nexus. The cataclysm cycles back — Aetheric pressure rises, the surface tremors, every buried Tartaria stirs at once. What comes next is no longer in any one person\'s hands. Your faction will write the aftermath. You walk out under sky that has changed color.',
  preserve: 'You PRESERVE. The Cores stay in your pack; the Nexus stays mute; the world stays in equilibrium. You leave the chamber unsigned. Tartaria, the buried country, remains buried — but you carry the keys. Each Capital remembers you brought one back. They will remember.',
};

const FACTION_ROUTE_PLACEHOLDER = (factionId: string): string => {
  const name: Record<string, string> = {
    reclaimers_guild: "the Reclaimers' salvage route",
    forgotten_order: "the Forgotten Order's scholarship route",
    mud_monarchs: "the Mud Monarchs' claim-by-blood route",
    true_tartarians: "the True Tartarians' reverent route",
    eternal_dynasty: "the Eternal Dynasty's lineage route",
    conspiracy_architects: "the Conspiracy Architects' infiltration route",
    servants_of_giants: "the Servants' vigil route",
    stone_builders: "the Stone Builders' Aethercraft route",
    tartarian_revivalists: "the Revivalists' public-recovery route",
  };
  const route = name[factionId] ?? 'your faction route';
  return `${route} for the Cores is being authored in a coming OTA. For now, recover each Core however the world lets you — visit each Lost Capital and the engine will register the Core when you carry one back to your hub. The reference route (Reclaimers' salvage) is fully live; other factions will get their authored variants soon.`;
};

/** Return the narration line for entering the given phase. */
export function narrationForPhase(
  phase: MainQuestPhase,
  factionId: string,
  context?: { coreRecovered?: string; coresCount?: number; ending?: MainQuestEnding },
): string {
  switch (phase) {
    case 'hook':
      return HOOK_BY_FACTION[factionId] ?? HOOK_BY_FACTION.reclaimers_guild!;
    case 'revelation':
      return REVELATION_BY_FACTION[factionId] ?? REVELATION_BY_FACTION.reclaimers_guild!;
    case 'cores':
      if (context?.coreRecovered && context?.coresCount != null) {
        return CORE_RECOVERED_LINE(factionId, context.coreRecovered, context.coresCount);
      }
      return FACTION_ROUTE_PLACEHOLDER(factionId);
    case 'descent':
      return DESCENT_LINE_BY_FACTION[factionId] ?? DESCENT_LINE_BY_FACTION.reclaimers_guild!;
    case 'nexus':
      return NEXUS_ARRIVAL_LINE;
    case 'choice':
      return 'The Nexus offers three paths: SEAL the cataclysm, UNLEASH it, or PRESERVE the balance. Each is final. Choose from the Contracts screen.';
    case 'ended':
      return context?.ending ? CHOICE_LINE_BY_ENDING[context.ending] : 'The story is closed for this character.';
    default:
      return '';
  }
}

/** UI display: short label per phase for the main-quest card. */
export function phaseLabel(phase: MainQuestPhase): string {
  switch (phase) {
    case 'hook':       return 'A rumor, nothing more';
    case 'revelation': return 'Five Cores, five Capitals';
    case 'cores':      return 'Recovering the Cores';
    case 'descent':    return 'The Endless Stair opens';
    case 'nexus':      return 'At the Mud Flood Nexus';
    case 'choice':     return 'The Choice waits';
    case 'ended':      return 'The story is closed';
  }
}

/** Next-step hint for the main-quest card. Tells the player what
 *  to do next without spelling out the mechanic. */
export function phaseHint(phase: MainQuestPhase, coresRecovered: number): string {
  switch (phase) {
    case 'hook':
      return 'Visit a Lost Capital (Asgardar, Samarran, Nimari, Drakova, or Voronov) to learn what the Cores demand.';
    case 'revelation':
      return `Recover 1 of 5 Cores by visiting a Lost Capital. Each yields its Core to the right approach.`;
    case 'cores':
      return `${coresRecovered}/5 Cores recovered. Visit the remaining Lost Capitals.`;
    case 'descent':
      return 'All 5 Cores in your pack. Travel to the Endless Stair and descend.';
    case 'nexus':
      return 'You are at the Mud Flood Nexus. Open the Contracts screen to make The Choice.';
    case 'choice':
      return 'The Choice waits. Decide on the Contracts screen.';
    case 'ended':
      return 'This run is done. Start a new character to make a different Choice.';
  }
}

/** Capital ids the player has NOT yet recovered a Core from. */
export function remainingCapitals(state: MainQuestState): string[] {
  return LOST_CAPITAL_LOCATIONS.filter((id) => !state.coresRecovered.includes(id));
}

// v2.4.1 (OTA 035) — Phase 2: per-faction Core-recovery gates.
//
// Replaces the OTA 033 auto-grant-on-arrival with intentional play.
// On arrival at a Lost Capital the engine logs a faction-specific
// hint telling the player what verb their faction uses to coax the
// Core out. When the player submits an action whose intent matches
// the gate, the Core grants and the universal "core_recovered"
// narration plays.
//
// Phase 2 keeps the gate to a simple intent-match check. Phase 3+
// can layer skill-check DCs / item requirements / multi-step
// sequences on top without rewiring the call site.
interface CoreGate {
  /** Intents that count as the faction's recovery action. */
  intents: Intent[];
  /** Hint logged when the player arrives at a Capital. */
  hint: (capitalName: string) => string;
  /** Short label for the Contracts UI "next action" prompt. */
  nextAction: string;
}

const CAPITAL_DISPLAY_NAME: Record<string, string> = {
  asgardar: 'Asgardar',
  samarran: 'Samarran',
  nimari: 'Nimari',
  drakova: 'Drakova',
  voronov: 'Voronov',
};

export const FACTION_CORE_GATES: Record<string, CoreGate> = {
  reclaimers_guild: {
    intents: ['investigate'],
    hint: (cap) => `(Reclaimer route — to recover the ${cap} Core, SALVAGE something here. The Aetheric housing comes loose under the right trowel.)`,
    nextAction: 'salvage a feature here',
  },
  forgotten_order: {
    intents: ['ask', 'investigate'],
    hint: (cap) => `(Order route — to recover the ${cap} Core, READ the binding text. Ask the Capital what it remembers, or examine the scriptorium shelves.)`,
    nextAction: 'ask or read the binding text',
  },
  mud_monarchs: {
    intents: ['attack', 'diplomacy'],
    hint: (cap) => `(Monarch route — claim the ${cap} Core by force or by tongue. The keepers will yield to threat or to a Monarch's address.)`,
    nextAction: 'attack or address the keepers',
  },
  true_tartarians: {
    intents: ['ask', 'rest'],
    hint: (cap) => `(True Tartarian route — to recover the ${cap} Core, you must ASK the Core's spirit, or REST in vigil at its housing. Neither is hurried.)`,
    nextAction: 'ask or rest in vigil',
  },
  eternal_dynasty: {
    intents: ['diplomacy', 'ask'],
    hint: (cap) => `(Dynasty route — speak to the ${cap} keepers in the old voice. Prove the lineage and the Core lifts.)`,
    nextAction: 'address the keepers',
  },
  conspiracy_architects: {
    intents: ['steal', 'investigate'],
    hint: (cap) => `(Architect route — the ${cap} Core leaves with you only if it is never seen leaving. STEAL it, or investigate until you find the back-door route out.)`,
    nextAction: 'steal or scout the egress',
  },
  servants_of_giants: {
    intents: ['rest', 'cast'],
    hint: (cap) => `(Vigil route — sit the ${cap} watch. REST at the Giant's tomb-mark, or CAST a binding prayer; the Core releases on the silent hour.)`,
    nextAction: 'rest or cast a binding',
  },
  stone_builders: {
    intents: ['cast', 'investigate'],
    hint: (cap) => `(Builder route — Aethercraft the ${cap} Core out of its housing. Shape stone around the seat to break the bond, or investigate until the mounting plan is yours.)`,
    nextAction: 'shape or investigate the seat',
  },
  tartarian_revivalists: {
    intents: ['investigate', 'use_relic'],
    hint: (cap) => `(Revivalist route — document the ${cap} recovery for the cell's archive. Investigate every face of the Core's housing, or use a relic to record the moment.)`,
    nextAction: 'document the Core',
  },
};

/** True when the player's current state + this action's intent
 *  satisfies the faction-specific gate for the Capital they're at. */
export function canRecoverCore(player: PlayerCharacter, parsedIntent: Intent): boolean {
  const mq = ensureMainQuest(player.mainQuest);
  if (mq.phase !== 'revelation' && mq.phase !== 'cores') return false;
  if (!LOST_CAPITAL_LOCATIONS.includes(player.currentLocationId)) return false;
  if (mq.coresRecovered.includes(player.currentLocationId)) return false;
  const gate = FACTION_CORE_GATES[player.factionId];
  if (!gate) return true; // unknown faction — permissive fallback
  return gate.intents.includes(parsedIntent);
}

/** The on-arrival hint line for the player's faction at the given
 *  Capital. Returns null when no faction gate is mapped (legacy /
 *  unknown faction) — caller can skip the log line. */
export function coreGateHint(factionId: string, capitalId: string): string | null {
  const gate = FACTION_CORE_GATES[factionId];
  if (!gate) return null;
  const capName = CAPITAL_DISPLAY_NAME[capitalId] ?? capitalId;
  return gate.hint(capName);
}

/** Short next-action label for the Contracts UI prompt. */
export function coreGateNextAction(factionId: string): string {
  return FACTION_CORE_GATES[factionId]?.nextAction ?? 'recover the Core';
}

/** Returns the next mainQuest state after a trigger fires. Returns
 *  the input state unchanged when the trigger is a no-op (phase
 *  already past the relevant gate, etc.). Callers should compare
 *  state.phase before/after to know whether to log narration. */
export function advanceMainQuest(
  player: PlayerCharacter,
  trigger:
    | { kind: 'first_capital_visit'; locationId: string }
    | { kind: 'core_recovered'; locationId: string }
    | { kind: 'reached_nexus' }
    | { kind: 'chose_ending'; ending: MainQuestEnding },
): MainQuestState {
  const state = ensureMainQuest(player.mainQuest);
  switch (trigger.kind) {
    case 'first_capital_visit': {
      if (state.phase !== 'hook') return state;
      if (!LOST_CAPITAL_LOCATIONS.includes(trigger.locationId)) return state;
      return { ...state, phase: 'revelation' };
    }
    case 'core_recovered': {
      if (state.phase === 'ended' || state.phase === 'choice' || state.phase === 'nexus') {
        return state;
      }
      if (state.coresRecovered.includes(trigger.locationId)) return state;
      const coresRecovered = [...state.coresRecovered, trigger.locationId];
      const allFive = coresRecovered.length >= 5;
      return {
        ...state,
        phase: allFive ? 'descent' : 'cores',
        coresRecovered,
      };
    }
    case 'reached_nexus': {
      if (state.phase !== 'descent') return state;
      if (state.coresRecovered.length < 5) return state;
      return { ...state, phase: 'choice' };
    }
    case 'chose_ending': {
      if (state.phase !== 'choice') return state;
      return { ...state, phase: 'ended', ending: trigger.ending };
    }
  }
}
