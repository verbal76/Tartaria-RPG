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
