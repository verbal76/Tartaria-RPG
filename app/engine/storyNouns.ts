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

/** ⚠ The rescue matcher, deliberately LOOSER than the hook matcher's word-boundary
 *  test: it is the same case-insensitive substring rule the engine's own dispatch
 *  uses (`matchRescueHookNoun` in gameStore), and it MUST stay the same rule. If
 *  this were stricter, a noun the engine treats as the dog hook could still be
 *  swept by the bulk guard below — protecting a set that does not match the set
 *  that fires is the same class of bug as not protecting at all. */
export function rescueScenarioForNoun(noun: string): RescueScenarioId | null {
  const t = noun.toLowerCase().trim();
  if (!t) return null;
  for (const id of Object.keys(RESCUE_SCENARIOS) as RescueScenarioId[]) {
    for (const n of RESCUE_SCENARIOS[id].hookNouns) {
      const nl = n.toLowerCase();
      if (t.includes(nl) || nl.includes(t)) return id;
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
