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
