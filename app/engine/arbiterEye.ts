// arbiterEye.ts — OTA-1206. THE TORCH MARKS WHAT'S WORTH A CLOSER LOOK.
//
// The owner, 75+ hours into his own game: "I tap investigate, tap an item, tap
// investigate, tap an item... that's becoming a boring part of the game because
// there's too much to do there to clear it." The monotony engine is that every
// noun LOOKS equally promising, so the only way to find the room's one real
// payoff is to clear all of them. And separately: "I barely ever use my
// [Aetheric Torch]... look around you is free" — the torch's reveal overlapped
// a free verb, so it rotted in the pack.
//
// One fix serves both (owner's call): USING the torch marks the investigate
// chips that actually hold something — ✦ under INVESTIGATE — so the torch has
// a purpose "look around" can't match, and investigate becomes a choice
// instead of a lottery you clear.
//
// ⚠ THE MARK MUST MIRROR THE REAL PAYOFF BRANCHES, or the ✦ is a new lie.
// What investigate actually pays, per the store's own handler:
//   1. an UNRESOLVED scene hook whose nouns reach the tapped noun (story beat),
//   2. a recipe-note noun (RECIPE_NOTE_RE) not yet read in this room (OTA-718),
//   3. a placed perch (nounPlacements) not yet harvested (OTA-974).
// Everything else is flavor — honest to leave unmarked, and the whole point.
// If a future OTA adds a fourth investigate payoff, add it HERE TOO.
//
// Pure and store-free so the marking rule is unit-testable.

import { RECIPE_NOTE_RE } from './recipeDiscovery';

export interface ArbiterEyeArgs {
  /** The chips the player can actually see (displayedAmbientNouns). */
  displayedNouns: readonly string[];
  hooks: ReadonlyArray<{ resolved?: boolean; nouns: readonly string[] }>;
  nounPlacements?: Readonly<Record<string, { structure: string; tier: number }>> | null;
  /** Room memory — recipe notes already read here (their read is spent). */
  flavorExhaustedNouns?: readonly string[];
  /** Room memory — perches already harvested live here. */
  searchedAmbientNouns?: readonly string[];
}

export function arbiterEyeNouns(args: ArbiterEyeArgs): string[] {
  const exhausted = new Set((args.flavorExhaustedNouns ?? []).map((n) => n.toLowerCase()));
  const searched = new Set((args.searchedAmbientNouns ?? []).map((n) => n.toLowerCase()));
  const openHookNouns = args.hooks
    .filter((h) => !h.resolved)
    .flatMap((h) => h.nouns.map((n) => n.toLowerCase()));

  const out: string[] = [];
  for (const noun of args.displayedNouns) {
    const ln = noun.toLowerCase();
    const toks = ln.split(/[^a-z0-9]+/).filter(Boolean);
    // Hook nouns are single words ('smoke', 'tracks'); scene nouns are often
    // multi-word ('column of smoke') — match on token or containment, the same
    // looseness the hook-resolution path itself uses.
    const holdsHook = openHookNouns.some((hn) => ln.includes(hn) || toks.includes(hn));
    const holdsNote = RECIPE_NOTE_RE.test(noun) && !exhausted.has(ln);
    const holdsPerch = !!args.nounPlacements?.[noun] && !searched.has(ln);
    if (holdsHook || holdsNote || holdsPerch) out.push(noun);
  }
  return out;
}
