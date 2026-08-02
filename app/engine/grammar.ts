// Shared indefinite-article + article-dedup grammar for interpolated nouns.
//
// Two recurring glitches this fixes:
//  1. a/an — fantasy enemy/item names are dropped into narration ("a ${name}")
//     where the name may begin with a vowel sound ("Aetheric Raven" →
//     "an Aetheric Raven", not "a Aetheric Raven").
//  2. "The the …" — parser/scene-derived nouns sometimes already carry a leading
//     article ("the old altar"), so a raw `The ${noun}` doubles to
//     "The the old altar". theCap/theLower strip a leading article first.
//
// Both are the single source of truth so new vowel-named content and player-typed
// "the …" targets are handled correctly without touching every call site again.

// Silent-h words: vowel SOUND behind a consonant letter → take "an".
const SILENT_H = /^(hour|honest|honou?r|heir)/i;
// Vowel LETTER but consonant sound (y-/w- onset) → take "a" ("a unicorn", "a one-way").
const HARD_ONSET = /^(uni|use|user|usu|ubiq|eu|ewe|one|once)/i;

type Word = string | null | undefined;

/** Correct indefinite article for the word's leading sound. */
export function anOrA(word: Word): 'a' | 'an' {
  const w = (word ?? '').trim();
  if (!w) return 'a';
  if (SILENT_H.test(w)) return 'an';
  if (HARD_ONSET.test(w)) return 'a';
  return /^[aeiou]/i.test(w) ? 'an' : 'a';
}

/** Mid-sentence: "an Aetheric Raven" / "a Mud Harpy". */
export function withArticle(word: Word): string {
  return `${anOrA(word)} ${word ?? ''}`;
}

/** Sentence-start: "An Aetheric Raven" / "A Mud Harpy". */
export function withArticleCap(word: Word): string {
  const art = anOrA(word);
  return `${art.charAt(0).toUpperCase()}${art.slice(1)} ${word ?? ''}`;
}

/** Drop a leading "the "/"a "/"an " so we don't double an article we re-add. */
export function stripLeadingArticle(word: Word): string {
  return (word ?? '').replace(/^\s*(the|an|a)\s+/i, '');
}

/** Sentence-start "The old altar" — no doubling if `noun` already starts "the ". */
export function theCap(noun: Word): string {
  return `The ${stripLeadingArticle(noun)}`;
}

/** Mid-sentence "the old altar" — no doubling if `noun` already starts "the ". */
export function theLower(noun: Word): string {
  return `the ${stripLeadingArticle(noun)}`;
}

// ---------------------------------------------------------------------------
// OTA-1068 — party composition, in words.
//
// The scene-arrival announcer used to read
//     `${enemies.length} ${enemies[0].name}${'s'} close on you`
// which is only true when every member of the party is the same enemy. That
// held when the ONLY multi-enemy source was pickGroupForLocation, which spawns
// `count` copies of ONE prototype. OTA-808 (menace bonus) and OTA-817
// (mixed-role packs) both later appended members of a DIFFERENT kind --
// rollExtraPackMembers explicitly filters out names already present -- and
// neither updated the announcer. Result: a Scrap Drone + Mud Wasp pack was
// announced as "2 Scrap Drones", and the Mud Wasp only revealed itself by
// swinging.
//
// This describes what is actually standing there: groups by name, keeps
// first-seen order, counts duplicates, and joins with proper articles.
//   [Drone]                      -> "a Scrap Drone"
//   [Drone, Drone, Drone]        -> "3 Scrap Drones"
//   [Drone, Wasp]                -> "a Scrap Drone and a Mud Wasp"
//   [Drone, Drone, Wasp]         -> "2 Scrap Drones and a Mud Wasp"
// ---------------------------------------------------------------------------

/** English plural for an enemy/item noun. Handles the sibilant and
 *  consonant-y endings that a bare +'s' gets wrong ("Mud Lich" -> "Mud Liches",
 *  "Harpy" -> "Harpies", not "Lichs" / "Harpys"). */
export function pluralizeNoun(word: Word): string {
  const w = (word ?? '').trim();
  if (!w) return w;
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}

/** Mid-sentence description of who is present, grouped and counted. */
export function describeEnemyParty(names: readonly string[]): string {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const raw of names) {
    const n = (raw ?? '').trim();
    if (!n) continue;
    if (!counts.has(n)) order.push(n);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const parts = order.map((n) => {
    const c = counts.get(n) ?? 1;
    return c === 1 ? withArticle(n) : `${c} ${pluralizeNoun(n)}`;
  });
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** Sentence-start form of describeEnemyParty. A count-led phrase ("2 Scrap
 *  Drones") is already fine; capitalising its first character is a no-op. */
export function describeEnemyPartyCap(names: readonly string[]): string {
  const s = describeEnemyParty(names);
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s;
}
