// OTA-1211 — TITLE MATCHING THAT SURVIVES THE PARSER'S OWN STOP-WORD STRIPPING.
//
// ⚠⚠ THE DEFECT, MEASURED (2026-08-09). A live probe typed `send word Fragment of the Red
// Tower` while holding exactly that mystery. The parser resolved it perfectly —
// `intent=turn_in conf=1.00 target=fragment red tower` — and the turn-in was refused with
// *"You have no active contracts."*
//
// All four contract finders (`fuzzyFindMystery`, `fuzzyFindHunt`, `fuzzyFindStoryline`,
// `fuzzyFindFactionQuest`) are the same six lines: exact match, then substring either way.
// **The parser strips "of the"; the finders require it.** `"fragment red tower"` is not a
// substring of `"fragment of the red tower"` and does not contain it, so the match fails.
//
// ⚠ THIS IS NOT A COURIER BUG AND IT PREDATES OTA-1211. It breaks the typed turn-in of
// ANY contract whose title carries a word the parser drops — it was simply invisible while
// "send word" was refused outright before it ever reached a finder, and while most players
// use the Contracts screen's COMPLETE button instead of typing.
//
// ⚠⚠ STRICTLY ADDITIVE, ON PURPOSE. This runs only as a THIRD tier, after exact and after
// substring, i.e. only where the finder would otherwise have returned `null`. It can widen
// what matches; it can never change an answer the old code already gave. That property is
// what makes it safe to drop into four finders that many paths depend on.

/** Words the parser drops and a player would not think of as part of a title. Kept small
 *  and closed on purpose — this list decides what counts as "the same title", and every
 *  entry added to it is another way two different contracts could collide. */
const IGNORABLE = new Set([
  'the', 'of', 'a', 'an', 'and', 'to', 'in', 'at', 'on', 'for', 'from', 'with',
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !IGNORABLE.has(w));
}

/** Do the player's words pick out this title?
 *
 *  True when every meaningful word the player typed appears in the title. Deliberately NOT
 *  order-sensitive — a player who types "red tower fragment" means the same contract.
 *
 *  ⚠ An empty target matches NOTHING. Treating "no words" as "matches everything" would
 *  hand back the first contract on the slate for a bare `turn in`, which is precisely the
 *  kind of silent wrong-target action this file exists to prevent. */
export function titleTokensMatch(target: string, title: string): boolean {
  const want = tokens(target);
  if (want.length === 0) return false;
  const have = new Set(tokens(title));
  return want.every((w) => have.has(w));
}

/** The shared three-tier resolver every contract finder now ends with.
 *
 *  ⚠ AMBIGUITY IS A REFUSAL, NOT A GUESS. If the player's words fit more than one contract
 *  on the pool, this returns `null` and the caller's existing "name the contract you mean"
 *  refusal speaks. Picking the first of several matches would close the wrong contract and
 *  pay out the wrong reward, which is far worse than asking again. */
export function findByTitle<T extends { title: string }>(
  text: string,
  pool: readonly T[],
): T | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  // ⚠ EXACT still wins outright, and it is the only tier allowed to. A player who typed
  // the whole title has told us exactly which contract they mean; if two contracts somehow
  // share a title verbatim, that is a data defect and picking the first is the least of the
  // problems it causes.
  const exact = pool.find((x) => x.title.toLowerCase() === t);
  if (exact) return exact;

  // ⚠⚠ OTA-1216 (PUNCHLIST P12) — SUBSTRING NO LONGER GUESSES.
  //
  // This was `pool.find(...)`, which returns the FIRST match even when several fit. Hold
  // "Red Tower Fragment Cache" and "Red Tower Fragment Vault", type `turn in red tower
  // fragment`, and the game silently closed whichever happened to sit earlier in the
  // catalog — with a real payout attached and no way for the player to know it had chosen.
  //
  // ⚠ It was left alone deliberately in OTA-1211: that change dropped a shared resolver
  // into four widely-used finders, and its entire safety argument was that it could only
  // ever WIDEN what matched, never change an answer the old code already gave. Fixing this
  // inside it would have broken that promise. It was filed as P12 instead, with a test
  // documenting the guess rather than blessing it, and is now fixed on its own.
  const substrings = pool.filter(
    (x) => x.title.toLowerCase().includes(t) || t.includes(x.title.toLowerCase()),
  );
  if (substrings.length === 1) return substrings[0]!;
  // ⚠ Two or more, and we stop HERE rather than falling through to tokens. A query that
  // fits several titles as a substring will fit the same several as tokens, so continuing
  // would only reach the same ambiguity by a longer road — and a caller that got `null`
  // from the substring tier and a guess from the token tier would be the same defect wearing
  // a different hat.
  if (substrings.length > 1) return null;

  const byTokens = pool.filter((x) => titleTokensMatch(t, x.title));
  return byTokens.length === 1 ? byTokens[0]! : null;
}
