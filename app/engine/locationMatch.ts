// OTA-989 — "travel to <place>" must find the place the player NAMED, not the place
// they punctuated correctly. Owner: "'travel to the location name' should start
// an auto route as long as the name matches."
//
// ROOT CAUSE OF THE CATEGORY: the old matcher compared RAW strings, so every
// apostrophe and hyphen an author typed had to be reproduced exactly by a player
// on a phone keyboard. Measured against the live catalog: typing a name exactly
// resolved 36/36, but typing it WITHOUT punctuation failed outright on 7 —
// Zharak's Teeth, Reclaimer's Stake, Thametan's Tower, The Architect's Blind,
// The Monarch's Waystation, Builders' Survey Camp, Giant-Watch Shrine. Not a
// near miss: a flat "I don't know a place called that."
//
// The typo fallback couldn't rescue them either, because it compared single
// WORDS of the name against the player's WHOLE phrase and rejected anything
// whose length differed by more than one — so "zharaks teeth" (13) was measured
// against "zharak's" (8) and "teeth" (5) and both were skipped before the
// spell-check ran.
//
// The fix is to normalise BOTH sides once, in one place, and match on that.
// Squashing to letters-and-digits collapses apostrophes, hyphens AND spaces
// together, so "Giant-Watch Shrine" is reachable as "giant-watch shrine",
// "giantwatch shrine" or "giant watch shrine" — all three become the same key.
import { levenshtein } from './editDistance';

export interface MatchableLocation {
  id: string;
  name: string;
  aliases?: string[];
}

/** Letters and digits only — apostrophes, hyphens, periods and spaces all fall
 *  away, so every way a player might punctuate a name lands on one key. */
export function tightKey(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** A player typing a partial name must give us enough to be unambiguous. Spaces
 *  are gone by this point, so a short fragment can straddle word boundaries —
 *  4 is the floor that keeps "art" from reaching "The Architect's Blind". */
const MIN_PARTIAL = 4;

/** Every key a string can legitimately be addressed by: itself, and itself
 *  without a leading article. BOTH SIDES need this. Stripping "the" off the
 *  player's words but not off the authored name meant "The Hidden Market" only
 *  resolved by luck (it happens to carry a "hidden market" alias) and "the
 *  engine" — an exact alias of Thametan's Tower — missed the exact tier entirely
 *  and then collided with Samarran's "engine city" one tier down. */
export function keysFor(s: string): string[] {
  const lower = (s ?? '').trim().toLowerCase();
  const bare = lower.replace(/^(?:the|a|an)\s+/, '');
  const a = tightKey(lower);
  const b = tightKey(bare);
  return a === b ? [a] : [a, b];
}

/** Do any of the two sides' keys line up exactly? */
function keysMeet(qs: readonly string[], ks: readonly string[]): boolean {
  return qs.some((q) => q.length > 0 && ks.includes(q));
}

/** Typos scale with length: 1 slip in a short name, 2 in a long one. Kept tight
 *  so "drakova" can't drift into a different real place. */
function typoBudget(len: number): number {
  if (len < 6) return 0;
  return len >= 14 ? 2 : 1;
}

/**
 * Resolve what the player typed to a location, tolerating punctuation, casing,
 * a leading "the", partial names and small typos — while still returning null
 * for a place that does not exist (the Arbiter's "I don't know a place called
 * that" is a real answer and must survive).
 *
 * Ordered most-precise-first so an exact name can never lose to someone else's
 * fuzzy match.
 */
export function matchLocationByName<T extends MatchableLocation>(
  rawQuery: string,
  locations: readonly T[],
): T | null {
  const raw = (rawQuery ?? '').trim().toLowerCase();
  if (!raw) return null;
  // Both the player's words and each authored string are reduced to the same
  // set of keys, so an article on either side stops mattering.
  const qs = keysFor(raw);
  const q = qs[qs.length - 1]!;            // the barest form, for partial/typo work
  if (!q) return null;

  // 1. Exact id (how missions and the map address places internally).
  const byId = locations.find((l) => keysMeet(qs, keysFor(l.id.replace(/_/g, ' '))));
  if (byId) return byId;

  // 2. Exact name, punctuation- and article-insensitive. The broken case.
  const exact = locations.find((l) => keysMeet(qs, keysFor(l.name)));
  if (exact) return exact;

  // 3. Exact alias — but SHARED aliases are a refusal, not a coin toss. The
  //    catalog deliberately gives five places the alias "city" (Asgardar,
  //    Samarran, Voronov, Nimari, Drakova) and three the alias "tower". There is
  //    no right answer to "travel to the city", and silently walking the player
  //    to whichever row sorted first is the same class of bug this OTA exists to
  //    kill. Refuse here rather than falling through to a fuzzier tier — an
  //    ambiguity at a precise tier must not be "resolved" by a vaguer one. The
  //    caller's refusal already lists real destinations to pick from.
  const aliasOwners = locations.filter(
    (l) => (l.aliases ?? []).some((a) => keysMeet(qs, keysFor(a))),
  );
  if (aliasOwners.length === 1) return aliasOwners[0]!;
  if (aliasOwners.length > 1) return null;

  if (q.length >= MIN_PARTIAL) {
    // 4. Partial name — "zharaks" for Zharak's Teeth. Prefer the SHORTEST
    //    containing name so a fragment lands on the most specific place rather
    //    than whichever row happened to sort first.
    const partials = locations.filter((l) => tightKey(l.name).includes(q));
    if (partials.length === 1) return partials[0]!;
    if (partials.length > 1) {
      // OTA-989 — multiple owners is a REFUSAL here too, same as the alias and typo
      // tiers ("camp" names three real places; walking the player to whichever
      // sorted shortest is a wrong multi-day trek). One carve-out: when a single
      // candidate is the BASE NAME the others merely extend — "Nimari" inside
      // "Red Tower of Nimari" — the base is unambiguous intent and resolves.
      const base = partials.find((l) =>
        partials.every((o) => tightKey(o.name).includes(tightKey(l.name))));
      return base ?? null;
    }
    // 5. Partial alias — one owner or none, same reasoning as the exact tier.
    const partialAliasOwners = locations.filter(
      (l) => (l.aliases ?? []).some((a) => tightKey(a).includes(q)),
    );
    if (partialAliasOwners.length === 1) return partialAliasOwners[0]!;
    if (partialAliasOwners.length > 1) return null;
  }

  // 6. Typo tolerance, measured on the WHOLE normalised name (the old code
  //    compared word-by-word, which no multi-word name could ever satisfy).
  //    Requires a single clear winner — an ambiguous near-miss is no match, so
  //    the player gets the honest "I don't know that place" instead of being
  //    walked somewhere they did not ask for.
  const budget = typoBudget(q.length);
  if (budget > 0) {
    let best: T | null = null;
    let bestD = budget + 1;
    let tied = false;
    for (const l of locations) {
      const key = tightKey(l.name);
      // Skip lengths that cannot possibly come within budget.
      if (Math.abs(key.length - q.length) > budget) continue;
      const d = levenshtein(q, key);
      if (d < bestD) { bestD = d; best = l; tied = false; }
      else if (d === bestD && best && l.id !== best.id) { tied = true; }
    }
    if (best && bestD <= budget && !tied) return best;
  }
  return null;
}
