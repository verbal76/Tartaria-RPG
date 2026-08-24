/**
 * OTA-1404 — SLICE 10: COMBAT RESOLUTION LEAVES gameStore.
 *
 * ⚠⚠ THIS IS THE FIRST MOVE IN THE SERIES THAT IS A LEAF RATHER THAN A SLICE,
 * and the distinction is what this suite exists to hold.
 *
 * Slices 1-9 moved STORE ACTIONS. `useGameStore` kept the same object, the same
 * keys and the same 473 importers; the risk lived in the store's SHAPE, and
 * `storeSource()` (gameStore + every file in `slices/`) was the right reader
 * because a slice is still part of the store.
 *
 * This moved module-level FUNCTIONS. There is no store surgery, no interface
 * change and nothing for an importer to notice. Which is why `storeSource()`
 * deliberately does NOT read it, and why this OTA re-pointed sixty pins across
 * twenty suites by hand instead of widening that helper — twice before, in
 * slices 5 and 7, widening was proposed and refused for the same reason:
 *
 *     A HELPER THAT READS "WHEREVER THE CODE WENT" CAN NEVER FAIL, AND A PIN
 *     THAT CANNOT FAIL IS NOT A TEST.
 *
 * ⚠ THE ONE HAZARD A LEAF HAS THAT A SLICE DOES NOT: a leaf that imports a
 * VALUE from the store compiles, passes a one-sided unit test, and resolves to
 * `undefined` at module-init on a device. The first test below is the only one
 * in this file that would be worth keeping if the rest were thrown away.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

const COMBAT = read('app', 'state', 'combatResolution.ts');
const GEARWEAR = read('app', 'state', 'gearWear.ts');
const STORE = read('app', 'state', 'gameStore.ts');
const EQUIP = read('app', 'engine', 'equipment.ts');
const NARRATION = read('app', 'ai', 'narration.ts');

/** Source with comments stripped. ⚠ Every previous slice tripped over asserting
 *  the absence of a string its own explanatory comment then quoted. */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('OTA-1404 — the leaf never reaches back into the store', () => {
  it('⚠⚠ combatResolution imports NOTHING by value from gameStore', () => {
    // The rule the whole series is built on. `import type` is erased at compile
    // time and is fine; a value import is the failure that hides until a device
    // boots. Matches `import { x } from './gameStore'` but not `import type {`.
    const valueImports = COMBAT.match(/^import\s+(?!type\b)[^\n]*from\s+'\.\/gameStore';/gm) ?? [];
    expect(valueImports).toEqual([]);
    // …and it DOES take the types, which is how the signatures cannot drift.
    expect(COMBAT).toMatch(/^import type \{[^}]*GameStore[^}]*\} from '\.\/gameStore';/m);
  });

  it('⚠⚠ neither does gearWear, which moved down for the same reason', () => {
    const valueImports = GEARWEAR.match(/^import\s+(?!type\b)[^\n]*from\s+'\.\/gameStore';/gm) ?? [];
    expect(valueImports).toEqual([]);
    expect(GEARWEAR).toContain("import type { GameStore } from './gameStore';");
  });

  it('⚠ the store imports the leaf, so the dependency runs one way only', () => {
    expect(STORE).toContain("} from './combatResolution';");
    expect(STORE).toContain("import { wearEquippedItem } from './gearWear';");
  });
});

describe('OTA-1404 — the three that had to move DOWN first', () => {
  it('⚠⚠ statNowClause lives beside the effectiveStats it reads', () => {
    // Shared by gameStore and the resolver, so it could belong to neither.
    expect(EQUIP).toContain('export function statNowClause(');
    expect(EQUIP.indexOf('export function statNowClause(')).toBeLessThan(
      EQUIP.indexOf('export function effectiveStats('),
    );
    expect(codeOnly(STORE)).not.toContain('export function statNowClause(');
  });

  it('⚠⚠ …and the store RE-EXPORTS it, so nothing downstream had to change', () => {
    // Twenty-one call sites here, three slices that thread it as a dep, and two
    // suites that import it from this module. The one-line re-export is cheaper
    // than churning ten files, and it says where the function went.
    expect(STORE).toContain('export { statNowClause };');
    expect(STORE).toMatch(/import \{[^}]*statNowClause[^}]*\} from '\.\.\/engine\/equipment';/);
  });

  it('⚠ arbiterAddress lives with the Arbiter\'s voice', () => {
    expect(NARRATION).toContain('export function arbiterAddress(');
    expect(codeOnly(STORE)).not.toContain('function arbiterAddress(');
    // It is genuinely shared — the store still calls it, from narration.
    expect(STORE).toMatch(/import \{[\s\S]{0,4000}?arbiterAddress,[\s\S]{0,400}?\} from '\.\.\/ai\/narration';/);
  });

  it('⚠ gear wear is its own file because combat AND digging both wear gear', () => {
    expect(GEARWEAR).toContain('export function wearEquippedItem(');
    expect(codeOnly(STORE)).not.toContain('function wearEquippedItem(');
    // Both owners reach it, which is exactly why neither could hold it.
    expect(COMBAT).toContain("import { wearEquippedItem } from './gearWear';");
    expect(STORE).toContain('wearEquippedItem(');
  });
});

describe('OTA-1404 — single-owner state travelled WITH its owner', () => {
  it('⚠⚠ _lastEffectiveAc moved instead of being handed down behind an accessor', () => {
    // The other half of the state rule, and the half that is easy to get wrong.
    // Both its reads and its ONLY write are inside applyEnemyCounter, so it is
    // single-owner: it moves with the owner and stays private. Had a second
    // writer existed it would have had to move DOWN behind two functions, the
    // way the Arbiter's generation epoch did in slice 7.
    expect(COMBAT).toContain('let _lastEffectiveAc: number | null = null;');
    expect(STORE).not.toContain('_lastEffectiveAc');
    // Private: it is not exported, so the surface stays at zero.
    expect(COMBAT).not.toContain('export let _lastEffectiveAc');
    // ⚠ codeOnly — the file's own header explains why this `let` travelled, and
    // counting raw text would count that explanation. Third time this session a
    // comment has been caught standing in for the code it describes.
    const uses = (codeOnly(COMBAT).match(/_lastEffectiveAc/g) ?? []).length;
    expect(uses).toBe(3); // the declaration, the read, the write
  });
});

/** ⚠ MODULE scope, not describe scope — the arithmetic block at the bottom needs
 *  the same list, and a second copy of it in this file would be the very defect
 *  the file is written to guard against. */
const MOVED = [
  'applyEnemyCounter', 'applyEnemyCounterToDog', 'runEnemyGroupCounters',
  'tickEnemyDotsAndMaybeEndFight', 'sweepDeadEnemies', 'runSurvivorVolley',
  'enemyChannelsTechnique', 'swapEnemyTrait', 'staggerEnemy', 'takeStagger',
  'aggregateArmor', 'effectiveACBreakdown', 'describeWornForAcLedger',
  'playerArmorResistKinds', 'playerColdResist', 'playerWeaponReach',
  'dogVestAcBonus', 'damageModClause', 'recordEnemyIntel', 'playerIsDownNotDead',
  'handlePlayerDeath', 'runMoveCombatRange', 'enemyIsAirborne', 'isRangedEnemy',
  'enemyCanReach', 'parseEnemyAP', 'playerBuildScore', 'enemyBuildScore',
  'canonDT', 'dtProcChance', 'activeEnemy', 'checkLowHpWarning',
  'applyEscortDamage', 'failEscortQuests',
];

describe('OTA-1404 — the whole family went, and nothing was left behind', () => {
  it('⚠⚠ every one of the 34 is DEFINED in the leaf and nowhere else', () => {
    const storeCode = codeOnly(STORE);
    for (const name of MOVED) {
      expect(COMBAT).toMatch(new RegExp(`^(export )?function ${name}[(<]`, 'm'));
      // ⚠ `not.toMatch` on the DEFINITION, not on the name: the store still
      // CALLS most of these, and it should — that is what a leaf is for.
      expect(storeCode).not.toMatch(new RegExp(`^(export )?function ${name}[(<]`, 'm'));
    }
  });

  it('⚠ combat\'s own constants came with it rather than staying upstairs', () => {
    // Nine of the twelve things the family referenced outside itself turned out
    // to be its own furniture, left in the store only by history.
    for (const c of ['AIRBORNE_RE', 'BRACED_ROUNDS', 'DT_ALIAS_G', 'BUILTIN_DT_COMBAT',
                     'RANGE_LABEL', 'DEV_REVIVE_NAMES', 'DOG_TARGET_CHANCE',
                     'MELEE_PACK_SWINGS_PER_ROUND']) {
      expect(COMBAT).toMatch(new RegExp(`^(export )?const ${c}\\b`, 'm'));
      expect(codeOnly(STORE)).not.toMatch(new RegExp(`^(export )?const ${c}\\b`, 'm'));
    }
  });

  it('⚠ the damage-type shape went with the tables it describes', () => {
    expect(COMBAT).toContain("type DTProc = { mode: 'on_hit' | 'dot';");
    expect(codeOnly(STORE)).not.toContain('type DTProc =');
  });
});

describe('OTA-1404 — the pins were re-pointed, not blunted', () => {
  it('⚠⚠ storeSource() still refuses to read the leaves', () => {
    // Twice before (slices 5 and 7) widening this helper was proposed and
    // refused. It reads the store and its slices — parts of the store — and
    // stops there. If it ever grows a leaf, every pin using it stops saying
    // WHERE the code is, and "where" is half of what these pins guard.
    const helper = read('test-utils', 'storeSource.ts');
    expect(helper).not.toContain('combatResolution');
    expect(helper).not.toContain('gearWear');
    expect(helper).not.toContain('narration');
  });

  it('⚠ twenty suites now name the leaf explicitly', () => {
    // A count rather than a list, so adding a pin does not fail this test — but
    // silently DROPPING the leaf from all of them would.
    const { readdirSync } = require('fs') as typeof import('fs');
    const files = readdirSync(join(__dirname)).filter((f) => f.endsWith('.test.ts'));
    const readers = files.filter((f) => read('__tests__', f).includes('combatResolution.ts'));
    expect(readers.length).toBeGreaterThanOrEqual(20);
  });
});

describe('OTA-1404 — the move changed no behaviour, and here is the arithmetic', () => {
  it('⚠ the leaf is carrying real bodies, not just the names of them', () => {
    // ⚠⚠ OTA-1477 — THIS TEST WAS A COUNTDOWN DRESSED AS A RATCHET, AND IT WENT
    // OFF. It read:
    //     expect(storeLines).toBeLessThan(35_400);
    //     expect(37_300 - storeLines).toBeGreaterThan(2_000);
    //     expect(leafLines).toBeGreaterThan(2_400);
    // OTA-1430 had already moved the first ceiling once (35,000 → 35,400) and
    // wrote, correctly, that "a hard line count is a countdown, not a ratchet —
    // it fails on the day someone adds a legitimate twenty lines and says
    // nothing about whether the SLICE still holds." It then committed the same
    // mistake in the next line: `37_300 - storeLines > 2_000` is the identical
    // countdown with a subtraction in front of it. It went red on a two-line
    // compass fix — 1,998 against 2,000 — having said nothing whatsoever about
    // combat resolution.
    //
    // ⚠ WHAT THE SLICE ACTUALLY CLAIMS is not a number of lines in gameStore. It
    // is: the 34 functions live in the leaf, the store has no copy of them, and
    // the leaf carries their real BODIES rather than 34 one-line stubs
    // delegating somewhere else. The first two are pinned above, by name, and
    // cannot rot. The third is what this test now measures.
    //
    // ⚠ The floor below is a TRUE ratchet: the leaf only grows as combat grows,
    // so nothing legitimate ever drives it down. What drives it down is the
    // extraction being reverted or hollowed out, which is precisely the event
    // worth failing on. It is deliberately not an upper bound — an upper bound
    // on a living file is the countdown all over again.
    const bodyLinesOf = (src: string, name: string): number => {
      const start = src.search(new RegExp(`^(export )?function ${name}[(<]`, 'm'));
      if (start < 0) return 0;
      // A top-level function ends at the first `}` in column 0 after it.
      const end = src.indexOf('\n}', start);
      if (end < 0) return 0;
      return src.slice(start, end).split('\n').length;
    };

    // ⚠ THE FIVE THAT ARE GENUINELY TINY, BY NAME. A first draft of this test
    // set a blanket bar of "> 3 lines" on the reasoning that `canonDT` and
    // `activeEnemy` were the smallest members. That was a guess and it was
    // wrong — five of the 34 are one-expression predicates, and the bar failed
    // on the fix rather than on a defect. Measured instead of assumed:
    //   enemyIsAirborne 2 · dtProcChance 2 · playerColdResist 3
    //   playerIsDownNotDead 3 · isRangedEnemy 3 · then parseEnemyAP 4
    // Naming them is the instrument: a SIXTH member shrinking to three lines is
    // a function being hollowed out, and it fails here.
    const KNOWN_TINY = new Set([
      'enemyIsAirborne', 'dtProcChance', 'playerColdResist',
      'playerIsDownNotDead', 'isRangedEnemy',
    ]);

    let measured = 0;
    const unexpectedlyTiny: string[] = [];
    for (const name of MOVED) {
      const lines = bodyLinesOf(COMBAT, name);
      // ⚠ ABSENT vs NOT-WHERE-I-LOOKED: a 0 means the regex stopped matching,
      // and it must never be allowed to read as "a very small function".
      expect(lines).toBeGreaterThan(0);
      if (lines <= 3 && !KNOWN_TINY.has(name)) unexpectedlyTiny.push(`${name} (${lines})`);
      measured += lines;
    }
    // Prove the measurement ran over the whole list rather than a slice of it.
    expect(MOVED.length).toBe(34);
    expect(unexpectedlyTiny).toEqual([]);
    // …and that the allowlist is not quietly covering for functions that grew
    // past it — an allowlist nobody prunes is a suppression, not a rule.
    for (const name of KNOWN_TINY) {
      expect(bodyLinesOf(COMBAT, name)).toBeLessThanOrEqual(3);
    }

    // The family weighs what a moved family should weigh. Measured at 1,954
    // lines across the 34; the floor is set below that with room for ordinary
    // trimming, and it only ever moves UP.
    expect(measured).toBeGreaterThan(1_800);
    // …and it is the bulk of the leaf, not a corner of it — so the file cannot
    // pass by having grown unrelated code while the combat family shrank.
    // …and it is the BULK of the leaf (measured: 1,954 of 2,517 lines, 78%),
    // not a corner of it — so the file cannot pass this test by growing
    // unrelated code while the combat family quietly shrinks.
    const leafLines = COMBAT.split('\n').length + GEARWEAR.split('\n').length;
    expect(leafLines).toBeGreaterThan(2_400);
    expect(measured / leafLines).toBeGreaterThan(0.6);
  });

  it('⚠ the store still holds no body for any of them, however big it grows', () => {
    // The half of the old arithmetic that was worth keeping, said in a way that
    // cannot rot: it is about gameStore's CONTENT, not gameStore's SIZE.
    const storeCode = codeOnly(STORE);
    let checked = 0;
    for (const name of MOVED) {
      expect(storeCode).not.toMatch(new RegExp(`^(export )?function ${name}\\b`, 'm'));
      expect(storeCode).not.toMatch(new RegExp(`^const ${name}\\s*=\\s*(async\\s*)?\\(`, 'm'));
      checked++;
    }
    expect(checked).toBe(34);
  });

  it('⚠ the header records what measuring said, including what it REFUSED to move', () => {
    // Two of the twelve apparent dependencies were named only in comments. A
    // header that claimed twelve real ones would be a measurement nobody made.
    expect(COMBAT).toContain('narrateWanderingJourney');
    expect(COMBAT).toContain('were named');
    expect(COMBAT).toContain('only in COMMENTS');
  });

  it('⚠ the OTA-838 comment that had been split in half is whole again', () => {
    // Its first four lines sat seventy lines above the function and its last two
    // sat on it. Both halves are here, adjacent, above recordEnemyIntel.
    const i = COMBAT.indexOf('OTA-838 — record an OBSERVED damage-type match');
    const j = COMBAT.indexOf('export function recordEnemyIntel(');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    expect(COMBAT.slice(i, j)).toContain('randomization can flip a type');
    // And the halves are close together now, not seventy lines apart.
    expect(COMBAT.slice(i, j).split('\n').length).toBeLessThan(12);
  });
});
