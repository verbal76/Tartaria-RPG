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
import { getCollectablesOverride } from './contentPack';

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

const BUILTIN_STORIES: readonly CharacterStory[] = (data as RawData).stories;

/** engine_Dev — the live story set: an uploaded `collectables` override (an array
 *  of stories) replaces the built-in set wholesale; else the built-in Tartaria
 *  stories. Resolved at call time so an upload after boot is honored. */
export function getCharacterStories(): readonly CharacterStory[] {
  const ov = getCollectablesOverride();
  return Array.isArray(ov) && ov.length > 0 ? (ov as CharacterStory[]) : BUILTIN_STORIES;
}

/** Every fragment, flattened across all stories (for the loot-roll path). */
export function allFragments(): readonly CollectableFragment[] {
  return getCharacterStories().flatMap((s) => s.fragments ?? []);
}

export function findFragmentById(id: string): CollectableFragment | undefined {
  for (const story of getCharacterStories()) {
    const f = (story.fragments ?? []).find((frag) => frag.id === id);
    if (f) return f;
  }
  return undefined;
}

export function findStoryByFragmentId(fragmentId: string): CharacterStory | undefined {
  return getCharacterStories().find((s) => (s.fragments ?? []).some((f) => f.id === fragmentId));
}

export function findStoryById(id: string): CharacterStory | undefined {
  return getCharacterStories().find((s) => s.id === id);
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
  for (const frag of allFragments()) {
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
  return getCharacterStories().map((story) => {
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
