jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1231 — THREE VERBS SHARING TWO MARKERS, AND EACH ONE EATING THE OTHERS.
// Owner, after a phone session: *"investigate kills salvage sometimes, salvage can
// kill items in take."* Both true, and the contract they broke is written down in
// `app/engine/types.ts` on the marker itself:
//
//     flavorExhaustedNouns — "Kept SEPARATE from searchedAmbientNouns so other
//     verbs (take, salvage, break) can still act on these nouns — ONLY the
//     investigate verb consults this list."
//
// Three places read it anyway (the take chip predicate, the salvage chip
// predicate, and the engine's investigate handler — which `salvage <noun>` routes
// through, because OTA-140 made salvage a verb synonym to reuse its noun matcher).
//
// ⚠ THE MEASURED COST, from the owner's own device log:
//     [player] investigate brick   → "Tartarian stone. Granular…"
//     [player] take the brick      → "…Leave it. Or salvage it."
//     [player] salvage the brick   → "You've already examined the brick."
// The game named the verb, the player used it, and the game refused — and
// `rollSalvagePool('brick')` is a real rubble-pool yield, so it cost him the loot
// it had just pointed at.
//
// ⚠⚠ AND THE OTHER DIRECTION, which is the worse one because it is SILENT: salvage
// writes `searchedAmbientNouns` and TAKE reads it, so bulk SALVAGE ALL scrapped
// items the player could have pocketed. The overlap is real, not hypothetical —
// this suite measures it from the shipped data rather than asserting it.
import { rollSalvagePool } from '../app/engine/salvagePools';
import { findCatalogItem } from '../app/engine/crafting';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1231 — the marker contract', () => {
  it('⚠⚠ the contract is still WRITTEN DOWN — if this wording goes, the rule went with it', () => {
    // Every fix below is downstream of this sentence. A future edit that quietly
    // rewrites the marker's purpose should fail here first, loudly.
    // Whitespace-normalised: the sentence wraps across JSDoc lines, and a suite
    // that broke on a re-wrap would be pinning the formatting, not the rule.
    const types = src('app', 'engine', 'types.ts').replace(/\s*\n\s*\*?\s*/g, ' ');
    expect(types).toContain('flavorExhaustedNouns');
    expect(types).toMatch(/only the investigate verb consults this list/i);
    expect(types).toMatch(/other verbs \(take, salvage, break\) can still act on these nouns/i);
  });

  it('⚠⚠ INVESTIGATE → SALVAGE: the engine gate stands down for the salvage verb', () => {
    const store = src('app', 'state', 'gameStore.ts');
    // The gate that produced "You've already examined the brick."
    const i = store.indexOf('const alreadyExamined =');
    expect(i).toBeGreaterThan(-1);
    const gate = store.slice(i, i + 200);
    expect(gate).toContain('!isSalvageVerb');
    // ...and the verb is read from the parse, not guessed from the raw text.
    expect(store).toContain("(reparsed.matchedVerb ?? '').toLowerCase() === 'salvage'");
  });

  it('⚠⚠ INVESTIGATE → TAKE: the take picker no longer greys on the flavor list', () => {
    // `takeAmbientNoun` reads ONLY searchedAmbientNouns — it has never consulted
    // the flavor list — so the UI was refusing what the engine would have allowed.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const helper = screen.slice(screen.indexOf('const isAmbientConsumed ='), screen.indexOf('const isAmbientConsumed =') + 2600);
    // Pin the CODE, not the prose — the comment above it deliberately still names
    // the flavor list, because it is the record of what was wrong.
    const code = helper.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).toContain('isFuzzyConsumed(noun, productivelyConsumedSet)');
    expect(code).not.toContain('flavorExhaustedSet');
    // And the engine half of that claim, pinned so it stays true.
    const store = src('app', 'state', 'gameStore.ts');
    const take = store.slice(store.indexOf('  takeAmbientNoun(noun) {'));
    const body = take.slice(0, take.indexOf('stealthTakeAmbientNoun'));
    expect(body).toContain('searchedAmbientNouns');
    expect(body).not.toContain('flavorExhaustedNouns');
  });

  it('⚠ the SEARCH picker KEEPS its flavor check — that is the one verb it was for', () => {
    // The fix is a split, not a deletion. If this ever drops too, repeat
    // investigates start looping the player on spent nouns again (the OTA-076 bug).
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('isNounFlavorExhausted');
    const searchPredicate = screen.slice(screen.indexOf('// OTA-257 — chip is "consumed"'), screen.indexOf('// OTA-257 — chip is "consumed"') + 900);
    expect(searchPredicate).toContain('isNounFlavorExhausted(n, flavorExhaustedSet)');
  });

  it('⚠⚠ SALVAGE → TAKE: the overlap is REAL, measured from the shipped data', () => {
    // This is the assertion that justifies the bulk-salvage guard. If it ever
    // reports zero, the guard has become dead code and should be revisited —
    // rather than left in place on the strength of a comment.
    const both: string[] = [];
    for (const noun of ['aetheric torch', 'rusty shortbow', 'small rock', 'lantern']) {
      const takeable = findCatalogItem(noun) !== null;
      const salvageable = rollSalvagePool(noun) !== null;
      if (takeable && salvageable) both.push(noun);
    }
    expect(both.length).toBeGreaterThan(0);
  });

  it('⚠⚠ bulk SALVAGE ALL leaves takeable items whole, and says so honestly', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const bulk = store.slice(store.indexOf('salvageAllAmbient(nouns) {'));
    const loop = bulk.slice(0, bulk.indexOf('// Emit the aggregated reward summary'));
    // The guard itself...
    expect(loop).toContain('if (findCatalogItem(noun) !== null) {');
    // ...and it must NOT be filed under "already worked over", which would be a
    // message describing a state the game is not in.
    expect(loop).toContain('skippedTakeable.push(noun)');
    expect(loop).not.toContain('findCatalogItem(noun) !== null) {\n        skippedAlready');
    // The player is told the item survived AND which verb to use on it.
    expect(bulk).toContain('Left whole');
    expect(bulk).toContain('(TAKE them.)');
  });

  it('⚠ a TYPED salvage of an item is still honoured — the guard is for the bulk sweep only', () => {
    // Breaking down something you can see is a legitimate deliberate choice. The
    // guard exists because a batch fired at the room's furniture is not that
    // choice. If it ever moves into the single-noun path, this fails.
    const store = src('app', 'state', 'gameStore.ts');
    const single = store.indexOf('stealthTakeAmbientNoun(noun) {');
    const bulk = store.indexOf('salvageAllAmbient(nouns) {');
    const guardAt = store.indexOf('if (findCatalogItem(noun) !== null) {');
    expect(guardAt).toBeGreaterThan(bulk);
    expect(guardAt).not.toBe(single);
    // Exactly one such guard — a second copy would mean it leaked somewhere.
    expect(store.split('if (findCatalogItem(noun) !== null) {').length - 1).toBe(1);
  });

  it('⚠ the brick that started it: still a real salvage yield, so the refusal cost something', () => {
    const roll = rollSalvagePool('brick');
    expect(roll).not.toBeNull();
    expect(roll!.kind).toBe('material');
    // ...and it is NOT a takeable catalog item, so the bulk guard does not
    // accidentally start skipping the very noun this OTA unblocked.
    expect(findCatalogItem('brick')).toBeNull();
  });
});
