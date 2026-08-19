// ⚠⚠ OTA-1236 — THE NOUN THAT CARRIES THE STORY, AND WHY BULK ACTIONS MUST KNOW IT.
//
// Owner: *"I don't like that salvage all can bury the dog quest. If it is there it
// should always be the last thing listed so the next step is right there to see.
// So investigate all skips the dead ends, shows what was found on investigate or
// does a story hook pop-up, then does the dog quest."*
//
// ⚠⚠ THE FIRST HALF IS NOT A PREFERENCE, IT IS A BUG — AND IT IS MEASURED, NOT
// ARGUED. Ten of the twenty dog-rescue hook nouns match a salvage pool:
//
//     chain · wagon · wagon wheel · overturned wagon · cellar door · trapdoor
//     buried structure · snare pit · snare · trapper camp · trap
//
// `salvageAllAmbient` skipped catalog items (OTA-1231) and nothing else, so one
// tap of SALVAGE ALL pried apart the chain the dog is on. Salvage writes
// `searchedAmbientNouns`; every picker reads it. **The rescue noun then vanished
// from the investigate list and the dog quest became unreachable by tapping** —
// still typeable, which is worse than useless, because nobody types a noun the
// game has stopped showing them. The yellow SCRAP lane shipped in OTA-1235 put
// those nouns one tap from destruction with a bulk button over them.
//
// ⚠ THE SECOND HALF IS AN ORDERING RULE, and it has teeth too. The rescue SPAWNS A
// CAPTOR AND STARTS A FIGHT. If INVESTIGATE ALL reaches it in the middle of the
// sweep, every remaining `investigate` in the loop lands during combat and is
// refused — *"Not while the Reclaimer Deserter is on you."* So "then does the dog
// quest" is not decoration: doing it anywhere but last breaks the rest of the
// sweep. Same for a story hook, which opens a popup that the lines behind it push
// out of sight.
//
// ⚠ THIS MODULE IS PURE and holds the tiering ONCE, because the picker's order,
// the sweep's order and the bulk-salvage guard have to agree about what a story
// noun is. Three copies of that judgement is how they drift apart.
import { RESCUE_SCENARIOS, type RescueScenarioId } from './dogCompanion';
import { matchAnyHookNoun, type Hook } from './hooks';

/** ⚠⚠ OTA-1241 — WORD BOUNDARIES. THE OLD RULE MATCHED 35 OF THE GAME'S 975 SCENE
 *  NOUNS, AND THE OWNER'S DEVICE LOG CAUGHT IT LIVE:
 *
 *      [player]    investigate firepit
 *      [dog_quest] You crest the snare pit. The Unaligned Poacher is checking
 *                  their lines...
 *
 *  He looked at a FIREPIT and got the SNARE PIT rescue, because `"firepit"`
 *  contains `"pit"`.
 *
 *  ⚠⚠ AND THE COMPOUND CASE WAS THE MILD ONE. The old test ran BOTH directions —
 *  `t.includes(nl) || nl.includes(t)` — and that second direction meant any short
 *  noun that is a FRAGMENT of a hook phrase matched it:
 *
 *      door  -> cellar   (it sits inside "cellar door")
 *      ruin  -> smelter  (inside "forge ruin")
 *      camp  -> wagon    (inside "roadside camp")
 *      anvil -> smelter  (inside "anvil post")
 *
 *  Every door, every ruin, every camp in the game was a dog-rescue trigger. Plus
 *  `pulpit`, `climbing piton` and `mud pit` via "pit", eleven different chains,
 *  three wheels, and `lobster trap`.
 *
 *  ⚠ AND ONE STRAIGHT MIS-ROUTE: `trap` matched CELLAR (through "trapdoor") before
 *  SNARE, whose own noun list contains `trap` exactly. The wrong scenario fired.
 *
 *  ⚠⚠ THE GALLING PART, AGAIN: `engine/hooks.ts` FIXED THIS EXACT CLASS in OTA-432,
 *  with this exact reasoning — *"a 2–3 char token could snag half the nouns in a
 *  room."* The rescue matcher never got that fix, and OTA-1236 deliberately COPIED
 *  its loose rule so the bulk-salvage guard would match the firer. Matching the
 *  firer was right; what got propagated was the bug. **When you consolidate two
 *  copies of a rule, check whether the surviving copy is the CORRECT one.**
 *
 *  THE RULE NOW: an exact match always wins; a multi-word hook noun must appear as
 *  a PHRASE; a single-word hook noun must appear as a WHOLE WORD. ⚠ Deliberately
 *  no prefix-overlap fuzz — hooks.ts allows a ≥4-char prefix overlap, and that is
 *  precisely what let `trap` reach `trapdoor`. */
export function rescueScenarioForNoun(noun: string): RescueScenarioId | null {
  const t = noun.toLowerCase().trim();
  if (!t) return null;
  const words = t.split(/[^a-z0-9]+/).filter(Boolean);
  for (const id of Object.keys(RESCUE_SCENARIOS) as RescueScenarioId[]) {
    for (const n of RESCUE_SCENARIOS[id].hookNouns) {
      const nl = n.toLowerCase();
      if (!nl) continue;
      if (t === nl) return id;
      if (nl.includes(' ')) {
        if (t.includes(nl)) return id;   // multi-word: phrase containment
        continue;
      }
      if (words.includes(nl)) return id; // single word: whole word only
    }
  }
  return null;
}

/** ⚠ The dog rescue can only fire once, and only while the player has no dog and
 *  no onboarding in flight — the same three conditions the engine's dispatch
 *  checks. A rescue noun in a room where the rescue CANNOT fire is an ordinary
 *  noun again: protecting it there would keep scrap out of the player's hands for
 *  a quest that already happened. */
export interface StoryNounContext {
  /** Unresolved + resolved scene hooks. */
  hooks?: readonly Hook[];
  /** False once the player has a dog or an onboarding is pending. */
  rescueEligible?: boolean;
}

export type StoryTier = 'ordinary' | 'hook' | 'rescue';

/** ⚠⚠ THE ORDER IS THE OWNER'S SENTENCE, IN ORDER: the ordinary nouns report what
 *  was found, then a hook opens its popup, then the dog quest goes last. */
const TIER_RANK: Record<StoryTier, number> = { ordinary: 0, hook: 1, rescue: 2 };

export function storyTier(noun: string, ctx: StoryNounContext = {}): StoryTier {
  if ((ctx.rescueEligible ?? true) && rescueScenarioForNoun(noun) !== null) return 'rescue';
  if (ctx.hooks && ctx.hooks.length > 0 && matchAnyHookNoun(noun, ctx.hooks) !== null) return 'hook';
  return 'ordinary';
}

/** ⚠⚠ A LEAD IS NEVER SWEPT — not by SALVAGE ALL, not by TAKE ALL, not by
 *  INVESTIGATE ALL's bulk framing. It is the one thing in the room that has a next
 *  step attached, and a bulk button is by definition not aimed at it. Single taps
 *  are still honoured everywhere: breaking the chain on purpose is the player's
 *  call to make, one noun at a time. Same rule, same reason, as OTA-1231's
 *  never-scrap-a-takeable guard. */
export function isLeadNoun(noun: string, ctx: StoryNounContext = {}): boolean {
  return storyTier(noun, ctx) !== 'ordinary';
}

/** ⚠ Stable partition, not a sort with a comparator: nouns keep their incoming
 *  order inside a tier, so a room does not reshuffle between the list the player
 *  read and the sweep that runs. */
export function orderByStoryTier<T>(
  items: readonly T[],
  nounOf: (item: T) => string,
  ctx: StoryNounContext = {},
): T[] {
  const buckets: Record<StoryTier, T[]> = { ordinary: [], hook: [], rescue: [] };
  for (const item of items) buckets[storyTier(nounOf(item), ctx)].push(item);
  return (Object.keys(buckets) as StoryTier[])
    .sort((a, b) => TIER_RANK[a] - TIER_RANK[b])
    .flatMap((t) => buckets[t]);
}
