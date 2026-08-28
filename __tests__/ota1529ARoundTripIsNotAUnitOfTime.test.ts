/**
 * OTA-1529 — A ROUND TRIP IS NOT A UNIT OF TIME.
 *
 * The owner: *"a tile still regenerates loot when in an auto course."*
 *
 * ⚠⚠⚠ THE RESTOCK CLOCK COUNTED PLACES, NOT HOURS. beginScene wipes a room's
 * `searchedAmbientNouns` — its take / salvage / scanner / floor-dig memory — when
 * `macroVisitSeq > clearedAtMacroSeq`, i.e. "you left to another named location
 * and came back". Nothing else. An AUTO-COURSE is a named-location-changing
 * machine: the owner's 5-tile run to Iskan-Veil crosses named ground repeatedly,
 * so the counter advances every few taps and the world restocks at travel speed.
 * His log has `The outpost has restocked since you were last through` firing 21
 * seconds into a session.
 *
 * ⚠⚠ THE HISTORY MATTERS, BECAUSE THE OBVIOUS FIX IS THE ONE ALREADY REVERTED.
 * arb105 restocked on a 48h in-game timer. Red-team broke it: `rest` buys hours
 * standing still, so consume → rest → restock was free. arb107 replaced the timer
 * with the round-trip rule — which `rest` genuinely cannot fake — and deleted the
 * hours entirely. That half is right and is kept. What it lost is any sense that
 * a round trip should COST something.
 *
 * So both, not either. The round trip proves you actually left (rest cannot); the
 * hours prove enough of the world turned over to justify fresh supplies (a course
 * cannot). Neither alone is a restock. The number goes back to arb105's own 48.
 *
 * ⚠ AND A DANGLING COMMENT WENT WITH IT. arb107 removed the hour field and its
 * `HUB_LOOT_RESPAWN_HOURS` constant but left the doc comment describing them
 * attached to nothing — six lines in types.ts documenting a mechanism the game
 * had not had for hundreds of OTAs, running straight into the next field's
 * comment. The stamp this OTA adds takes that slot back.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const STORE = src('app', 'state', 'gameStore.ts');
const TYPES = src('app', 'engine', 'types.ts');
const codeOnly = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('OTA-1529 — a restock needs a round trip AND elapsed time', () => {
  it('⚠⚠⚠ BOTH CONDITIONS GATE THE WIPE, and it is an AND', () => {
    const code = codeOnly(STORE);
    expect(code).toContain('const roundTripped = typeof clearedSeq === \'number\' && macroVisitSeq > clearedSeq;');
    expect(code).toContain('if (roundTripped && hoursTurned) {');
    // The old single-condition gate is gone, not merely shadowed.
    expect(code).not.toContain("if (typeof clearedSeq === 'number' && macroVisitSeq > clearedSeq) {");
  });

  it('⚠⚠⚠ the hour half is measured against the stamp, not against zero', () => {
    expect(codeOnly(STORE)).toContain("(player.hoursElapsed ?? 0) - clearedHour >= ROOM_RESTOCK_MIN_HOURS");
  });

  it('⚠⚠ arb107 IS NOT REVERTED — the round trip is still required', () => {
    // The whole point of keeping both: `rest` buys hours standing still, so an
    // hours-only rule is the arb105 farm again. If this assertion ever fails
    // because the seq check was dropped, the red-team exploit is back.
    expect(codeOnly(STORE)).toContain('macroVisitSeq > clearedSeq');
  });

  it('⚠⚠ the hour is STAMPED when the round-trip clock is stamped', () => {
    // A gate reading a field nobody writes would silently never restock.
    expect(codeOnly(STORE)).toContain('clearedAtMacroSeq: macroVisitSeq, clearedAtHour: player.hoursElapsed ?? 0');
  });

  it('⚠⚠ …and CLEARED when the restock fires, so the next round starts fresh', () => {
    // Leaving the hour behind would let one old stamp satisfy every later
    // restock forever — the bug inverted.
    const i = STORE.indexOf('searchedAmbientNouns: [],');
    const block = STORE.slice(i, i + 400);
    expect(block).toContain('clearedAtMacroSeq: undefined,');
    expect(block).toContain('clearedAtHour: undefined,');
  });

  it('⚠⚠ a save written before 1529 restocks on the round trip alone', () => {
    // No stamp means no evidence, and the absence of evidence must not freeze a
    // room's loot forever for someone mid-playthrough.
    expect(codeOnly(STORE)).toContain("typeof clearedHour !== 'number'");
  });
});

describe('OTA-1529 — the number is arb105\'s, restored rather than invented', () => {
  it('⚠⚠ 48 in-game hours', () => {
    expect(STORE).toContain('export const ROOM_RESTOCK_MIN_HOURS = 48;');
  });

  it('⚠ and it is sized against the owner\'s own travel, in writing', () => {
    // 5 tiles / ~13 hours out, ~26 there-and-back — so a mid-course crossing
    // cannot restock, while a multi-day expedition can.
    expect(STORE).toContain('Iskan-Veil is 5 tiles');
  });
});

describe('OTA-1529 — the dangling arb105 comment is gone', () => {
  it('⚠⚠ types.ts no longer documents a field that does not exist', () => {
    expect(TYPES).not.toContain('HUB_LOOT_RESPAWN_HOURS');
  });

  it('⚠⚠ …and the slot it occupied now holds a real, typed field', () => {
    expect(TYPES).toContain('clearedAtHour?: number;');
    // Still adjacent to the marker it is read with, so the pair stays legible.
    expect(TYPES.indexOf('clearedAtHour?: number;'))
      .toBeLessThan(TYPES.indexOf('clearedAtMacroSeq?: number;'));
  });

  it('⚠ every doc comment in the VisitedRoom block still terminates', () => {
    // The specific breakage: a `/** … ` that ran into the next `/**` with no
    // field between them. Cheap structural check over the whole file.
    const opens = (TYPES.match(/\/\*\*/g) ?? []).length;
    const closes = (TYPES.match(/\*\//g) ?? []).length;
    expect(closes).toBeGreaterThanOrEqual(opens);
  });
});
