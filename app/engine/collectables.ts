// Character-story collectables. Each of the 10 authored characters
// has a small chain of notes / letters / journal pages the player
// finds as loot in specific kinds of locations. The ContractsScreen
// Collectables tab reads this catalog + the player's `collectables`
// id list and renders per-character completion.
//
// Drop wiring: callers can grant a fragment via the store's
// grantCollectableFragment(id) action. The grant is a silent no-op
// when the fragment id is unknown OR already in the player's list,
// so it's safe to call from any loot path without dedupe checks.

import data from '../data/collectables/character_stories.json';

export interface CollectableFragment {
  id: string;
  title: string;
  kind: 'note' | 'letter' | 'journal' | 'fragment';
  body: string;
  /** Player-facing hint shown for an undiscovered fragment. Keep it
   *  concrete enough that the player can guess WHICH kind of place
   *  to look — biome, location name, or a faction reference. */
  discoveryHint: string;
  /** Biome tags this fragment is eligible to drop in. ANY-match against
   *  the scene's location.tags. Each fragment is tagged in the JSON
   *  during authoring; the substitute helper below uses this to gate
   *  which fragments can be considered for a given encounter. */
  biomeTags: string[];
}

export interface CharacterStory {
  id: string;
  characterName: string;
  /** Short blurb shown at the top of the character's collectable card.
   *  Sets the tone before any fragment is found. */
  characterBlurb: string;
  fragments: CollectableFragment[];
}

interface RawData {
  stories: CharacterStory[];
}

export const CHARACTER_STORIES: readonly CharacterStory[] = (data as RawData).stories;

/** Every fragment, flattened across all characters. Useful for the
 *  loot-roll path when picking a random unfound fragment to drop. */
export const ALL_FRAGMENTS: readonly CollectableFragment[] =
  CHARACTER_STORIES.flatMap((s) => s.fragments);

/** Map of fragment id → owning character story id, built once at load. */
const FRAGMENT_TO_STORY: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const s of CHARACTER_STORIES) {
    for (const f of s.fragments) m.set(f.id, s.id);
  }
  return m;
})();

export function findFragmentById(id: string): CollectableFragment | undefined {
  for (const story of CHARACTER_STORIES) {
    const f = story.fragments.find((frag) => frag.id === id);
    if (f) return f;
  }
  return undefined;
}

export function findStoryByFragmentId(fragmentId: string): CharacterStory | undefined {
  const storyId = FRAGMENT_TO_STORY.get(fragmentId);
  if (!storyId) return undefined;
  return CHARACTER_STORIES.find((s) => s.id === storyId);
}

export function findStoryById(id: string): CharacterStory | undefined {
  return CHARACTER_STORIES.find((s) => s.id === id);
}

export interface CharacterProgress {
  story: CharacterStory;
  found: CollectableFragment[];
  missing: CollectableFragment[];
  /** 0..1 — convenience for the progress bar in the UI. */
  fraction: number;
  /** True when every fragment for this character has been found. */
  complete: boolean;
}

/** Probability that an eligible loot roll is substituted with a
 *  fragment grant. Per the player's spec: low spawn rate, consumes
 *  the drop slot (caller skips normal loot when this returns a
 *  fragment id). 8% lands at "you'll find one every dozen-ish
 *  containers in the right biome" without making them feel rare-rare. */
export const FRAGMENT_SUBSTITUTE_CHANCE = 0.08;

/** Pick a fragment to drop in place of normal loot, given the
 *  player's already-owned fragment list + the scene's biome tags.
 *  Returns the fragment id on substitute, or null when:
 *   - no eligible un-owned fragments match this biome
 *   - the substitution roll missed (FRAGMENT_SUBSTITUTE_CHANCE gate)
 *
 *  The caller (wasteland encounter handler, container loot, etc.)
 *  should call grantCollectableFragment(id) and SKIP its normal loot
 *  grant — the fragment counts AGAINST the drop volume by design.
 *
 *  rng injectable for tests; defaults to Math.random.
 */
export function pickFragmentForBiome(
  playerCollectables: readonly string[],
  sceneTags: readonly string[],
  opts?: { chance?: number; rng?: () => number },
): string | null {
  const chance = opts?.chance ?? FRAGMENT_SUBSTITUTE_CHANCE;
  const rng = opts?.rng ?? Math.random;
  if (rng() >= chance) return null;
  const owned = new Set(playerCollectables);
  const tagSet = new Set(sceneTags.map((t) => t.toLowerCase()));
  const eligible: CollectableFragment[] = [];
  for (const frag of ALL_FRAGMENTS) {
    if (owned.has(frag.id)) continue;
    if (frag.biomeTags.some((t) => tagSet.has(t.toLowerCase()))) {
      eligible.push(frag);
    }
  }
  if (eligible.length === 0) return null;
  const idx = Math.floor(rng() * eligible.length);
  return eligible[idx]?.id ?? null;
}

/** Compute progress for every authored character given the player's
 *  current collectables list. Returns one entry per story in author
 *  order. Empty list of found / 0 fraction for characters the player
 *  hasn't found anything for yet. */
export function computeAllProgress(playerCollectables: readonly string[]): CharacterProgress[] {
  const owned = new Set(playerCollectables);
  return CHARACTER_STORIES.map((story) => {
    const found: CollectableFragment[] = [];
    const missing: CollectableFragment[] = [];
    for (const frag of story.fragments) {
      if (owned.has(frag.id)) found.push(frag);
      else missing.push(frag);
    }
    const total = story.fragments.length;
    const fraction = total > 0 ? found.length / total : 0;
    return { story, found, missing, fraction, complete: missing.length === 0 };
  });
}

// ---------------------------------------------------------------------------
// OTA-1183 — SET COMPLETION. The payoff the owner specified.
// ---------------------------------------------------------------------------
//
// ⚠ Before this, finishing a 5–7 fragment story flipped a pill style and printed a banner
// on a screen the player had to navigate to. PUNCHLIST P1. Owner's call on what it should
// be instead (2026-08-09): *"they should end in story screen like the chapters screens that
// put the whole story together to read, and it should say whatever the collectable sets
// name is is complete. you should get a title for completing all of them, some types of
// historian title."*

/** How many stories are fully assembled. Drives the Historian title (needs all 10).
 *  ⚠ Counts STORIES, not fragments — the 57 fragments are spread 5–7 per story, so a
 *  fragment threshold would let the title land before the last story closed. */
export function completedStoryCount(playerCollectables: readonly string[]): number {
  return computeAllProgress(playerCollectables).filter((p) => p.complete).length;
}

/** ⚠ THE STORY THAT *THIS* FRAGMENT JUST FINISHED, or null if it finished none.
 *  Called with the collectables list as it stood BEFORE the grant. Returning the story
 *  rather than a boolean is what lets the caller name it — "Zalmar's account is complete"
 *  reads as an event; "a story is complete" reads as a system message. */
export function storyCompletedBy(
  fragmentId: string,
  ownedBefore: readonly string[],
): CharacterStory | null {
  const story = findStoryByFragmentId(fragmentId);
  if (!story) return null;
  // Already owned → this grant changes nothing, so it completed nothing.
  if (ownedBefore.includes(fragmentId)) return null;
  const after = new Set([...ownedBefore, fragmentId]);
  return story.fragments.every((f) => after.has(f.id)) ? story : null;
}

/** The assembled story, in author order, for the completion screen. ⚠ Returns the
 *  fragments the PLAYER holds, not the catalog — a screen that renders unowned bodies
 *  would hand over text that was never earned. */
export function assembledStory(
  storyId: string,
  playerCollectables: readonly string[],
): { story: CharacterStory; parts: CollectableFragment[] } | null {
  const story = findStoryById(storyId);
  if (!story) return null;
  const owned = new Set(playerCollectables);
  return { story, parts: story.fragments.filter((f) => owned.has(f.id)) };
}

// ---------------------------------------------------------------------------
// OTA-1184 — STORY PERKS. Owner's call (2026-08-09): *"see if there are certain stories
// that lead well into adding an active buff… it doesn't have to be for all of them, but
// enough to make it worthwhile collecting them."*
// ---------------------------------------------------------------------------
//
// ⚠⚠ EVERY PERK HERE HAS A VERIFIED CONSUMPTION POINT. That is the rule this table lives
// under, and it is not decoration: a perk that aggregates and is never read is a NEW
// "ends in nothing" — the exact defect P1 was filed for. Each row below names where it
// lands, and there is a test asserting the consumer exists.
//
// ⚠ THE SIREN OF ZHARAK'S TEETH IS DELIBERATELY ABSENT. The owner picked it (charm
// resistance, from the verses scratched inside an empty flask) and it is a good fit —
// but **the game has no charm or mental-influence mechanic to resist.** Searched
// `statusEffects.ts` and `combatRules.ts`: nothing. Shipping it would have meant
// inventing a status effect to justify a buff, which is backwards. It stays on the punch
// list as a design question, not a silent omission.
//
// ⚠ THE FAMILY IN THE MUD is absent by the owner's own instruction — dropped in favour of
// The Siege of St. Petersburg. It remains pure lore, which is the point: not every story
// pays a buff, so the ones that do stay meaningful.

/** A completed story's passive contribution. Field names match `TitlePerks` so both
 *  sources merge into one accumulator and every existing consumer sees them. */
export interface StoryPerk {
  /** The completed story. */
  storyId: string;
  /** One line, player-facing, shown on the Collectibles tab. */
  label: string;
  apply: (acc: {
    tradeBonus: number;
    ruinsDefenseBonus: number;
    mechanicalDamageDice: number;
    electricalDamageBonus: number;
    grantsColdResist: boolean;
  }) => void;
}

export const STORY_PERKS: readonly StoryPerk[] = [
  {
    // Elior Zalmar built the Aetheric Engine. His logs trace the empire's last week from
    // triumph to mud — he understood the current better than anyone alive.
    // ⚠ Consumed: gameStore attack path, beside the Bane-of-Sentinels die roll.
    storyId: 'story_zalmar_cascade',
    label: '+1 damage with electrical and Aetheric weapons',
    apply: (a) => { a.electricalDamageBonus += 1; },
  },
  {
    // Five inscriptions carved into the cliffs above the Urals, letters taller than a
    // person. Whoever carved them stood in that cold long enough to finish.
    // ⚠ Consumed: `playerArmorResistKinds` — ONE function, ~16 call sites (weather ticks,
    // stat modifiers, attack penalties, visibility). Adding the kind there means the perk
    // works everywhere resistance already matters, with no new plumbing.
    storyId: 'story_giant',
    label: 'You endure cold as though armoured against it',
    apply: (a) => { a.grantsColdResist = true; },
  },
  {
    // A merchant turned Reclaimer, seven journal entries tracing one relic from purchase
    // to the Mud Seas, hand cramping worse with each. He learned what things really cost.
    // ⚠ Consumed: sell pricing (`tradeBonus` → +5% per point on relic trades).
    storyId: 'story_reclaimer_greed',
    label: '+1 Trade — you know what a thing is worth',
    apply: (a) => { a.tradeBonus += 1; },
  },
  {
    // Logic Core 04-B guarded the Grand Spire and, over seven timestamped chits, learned
    // to wonder. Reading it is reading how the machines think.
    // ⚠ Consumed: the existing mechanical-damage die roll vs automation/construct/sentinel.
    storyId: 'story_sentinel',
    label: '+1d6 damage against machines',
    apply: (a) => { a.mechanicalDamageDice += 1; },
  },
  {
    // Six diary days from a tunnel soldier who survived a three-day battle the official
    // record says never happened. He learned what a wall is worth.
    // ⚠ Consumed: AC in a `constructed_environment` context.
    storyId: 'story_siege',
    label: '+1 defence inside ruins and structures',
    apply: (a) => { a.ruinsDefenseBonus += 1; },
  },
];

/** Aggregate the perks the player has actually earned. ⚠ Reads COMPLETED sets only —
 *  a partial collection grants nothing, which is what makes finishing one worth doing. */
export function storyPerkModifiers(playerCollectables: readonly string[]): {
  tradeBonus: number;
  ruinsDefenseBonus: number;
  mechanicalDamageDice: number;
  electricalDamageBonus: number;
  grantsColdResist: boolean;
} {
  const acc = {
    tradeBonus: 0,
    ruinsDefenseBonus: 0,
    mechanicalDamageDice: 0,
    electricalDamageBonus: 0,
    grantsColdResist: false,
  };
  const done = new Set(
    computeAllProgress(playerCollectables).filter((p) => p.complete).map((p) => p.story.id),
  );
  for (const perk of STORY_PERKS) {
    if (done.has(perk.storyId)) perk.apply(acc);
  }
  return acc;
}

/** The perk line for a story, or null if it pays lore only. Drives the Collectibles tab. */
export function storyPerkLabel(storyId: string): string | null {
  return STORY_PERKS.find((p) => p.storyId === storyId)?.label ?? null;
}
