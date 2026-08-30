/**
 * OTA-1554 — WORKED-OUT GROUND SAYS SO.
 *
 * ⚠⚠⚠ THE OWNER TAPPED INVESTIGATE ABOUT THIRTY TIMES ON A SPENT PATCH before
 * the game admitted it had nothing left. It was not being coy. The dig has a
 * hard ceiling — `groundDigCount >= DIG_SPOT_PRODUCTIVE_CAP` (16, arb119) — and
 * past it EVERY attempt refuses with "it's spent — you've turned over everything
 * this spot had to give." He was reading a green button that had no idea the
 * ceiling existed.
 *
 * ⚠⚠⚠ AND THE REASON IT HAD NO IDEA IS THE POINT. The INVESTIGATE badge counts
 * actionable chips out of two sets: productively-consumed and flavour-exhausted.
 * The pinned surface chip ("the mud" / "the ground" / "the floor") is in NEITHER,
 * and never can be, because a patch is not *consumed* — it is *worked out*, which
 * is a different ledger (`visitedRooms[key].groundDigCount`) that lived only
 * inside the dig handler as an inline comparison. Bright chip, green badge,
 * thirty identical refusals.
 *
 * ⚠⚠⚠ THIS IS THE SAME DEFECT FOR THE FOURTH TIME, and the code says so in its
 * own comments each time:
 *   · OTA-179  — the scanner gate the pinned chip never got (a Mud Scanner
 *                missing; the playtester typed `investigate the mud` 5+ times in
 *                25 seconds);
 *   · OTA-1124 — the elevation gate the pinned chip never got (climbed on a
 *                shelf; every other chip greyed, this one alone stayed bright);
 *   · OTA-1263 — TAKE and SALVAGE green over an empty picker ("take/salvage is
 *                still green but the popup has nothing in it to claim").
 * Every one of them is: THE STATE THE ACTION CHECKS AND THE STATE THE BUTTON
 * READS ARE TWO DIFFERENT PLACES. So the fix here is not another special case
 * bolted onto the chip — it is turning the ceiling into a shared predicate
 * (`digSpotWorkedOut`) that the refusal and the greying both call, so a change
 * to one can no longer leave the other behind.
 *
 * ⚠ THE BADGE AND THE PICKER MOVE TOGETHER, which is the OTA-1124 rule: a player
 * must never be sent to open a menu that has nothing in it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { digSpotWorkedOut, DIG_SPOT_PRODUCTIVE_CAP } from '../app/engine/digging';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const codeOnly = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const mem = (key: string, count: number) => ({ visitedRooms: { [key]: { groundDigCount: count } } });

describe('OTA-1554 — the predicate', () => {
  it('⚠⚠⚠ a patch at the cap is worked out; one dig short of it is not', () => {
    expect(digSpotWorkedOut(mem('r1', DIG_SPOT_PRODUCTIVE_CAP), 'r1')).toBe(true);
    expect(digSpotWorkedOut(mem('r1', DIG_SPOT_PRODUCTIVE_CAP - 1), 'r1')).toBe(false);
    expect(digSpotWorkedOut(mem('r1', DIG_SPOT_PRODUCTIVE_CAP + 40), 'r1')).toBe(true);
  });

  it('⚠⚠ fresh ground is never worked out — absent counts read as zero', () => {
    // Rooms dug before the counter existed carry no `groundDigCount`. They must
    // get a fresh allowance rather than being sealed retroactively, which is the
    // same call OTA-1533 made for the sibling `digYields` field.
    expect(digSpotWorkedOut(mem('r1', 0), 'r1')).toBe(false);
    expect(digSpotWorkedOut({ visitedRooms: { r1: {} } }, 'r1')).toBe(false);
    expect(digSpotWorkedOut({ visitedRooms: {} }, 'r1')).toBe(false);
    expect(digSpotWorkedOut({}, 'r1')).toBe(false);
    expect(digSpotWorkedOut(null, 'r1')).toBe(false);
    expect(digSpotWorkedOut(undefined, 'r1')).toBe(false);
  });

  it('⚠⚠ it is PER PATCH — working one tile out does not seal the next one', () => {
    // The refusal tells the player to "try fresh ground". If the predicate were
    // not keyed per room, that instruction would be a lie the moment he followed
    // it, which is worse than the bug being fixed.
    const two = { visitedRooms: { spent: { groundDigCount: DIG_SPOT_PRODUCTIVE_CAP }, fresh: { groundDigCount: 2 } } };
    expect(digSpotWorkedOut(two, 'spent')).toBe(true);
    expect(digSpotWorkedOut(two, 'fresh')).toBe(false);
    expect(digSpotWorkedOut(two, 'never-visited')).toBe(false);
  });

  it('⚠ the cap is unchanged — this OTA reports the ceiling, it does not move it', () => {
    // Lowering it would be a balance change smuggled in under a UI fix. 16 is
    // still enough to build a Stone Spear or Cudgel without walking.
    expect(DIG_SPOT_PRODUCTIVE_CAP).toBe(16);
  });
});

describe('OTA-1554 — one predicate, three readers', () => {
  const DIG = src('app/engine/digging.ts');
  const STORE = src('app/state/gameStore.ts');
  const EXPLORE = src('app/screens/ExplorationScreen.tsx');

  it('⚠⚠⚠ the dig REFUSAL calls it — the inline comparison is gone', () => {
    // While the ceiling was an inline `>=` in one handler, nothing else could
    // ever learn it. That is the whole defect, in one line of code.
    expect(STORE).toContain('if (digSpotWorkedOut(get().worldMemory, groundRoomKey)) {');
    expect(codeOnly(STORE)).not.toContain('if (groundDigCount >= DIG_SPOT_PRODUCTIVE_CAP) {');
    expect(STORE).toContain(`you've turned over everything this spot had to give`);
  });

  it('⚠⚠⚠ the pinned CHIP greys on it, with a reason the player can act on', () => {
    // "worked out — try fresh ground" is a sentence he can do something about,
    // which is the standard OTA-1407 set for refusals: say the rule, not the
    // rule id.
    expect(EXPLORE).toContain("unmetRequirement = 'worked out — try fresh ground';");
    expect(EXPLORE).toContain('if (!unmetRequirement && !player.hubRoomId && digSpotWorkedOut(worldMemory, surfaceRoomKey)) {');
  });

  it('⚠⚠⚠ the BADGE counts it too — the button and the picker must agree', () => {
    // The OTA-1124 rule. A badge that lights over a picker with nothing in it
    // sends the player to open a menu that cannot help him, which is exactly the
    // shape of the owner's thirty taps.
    expect(EXPLORE).toContain('const groundSpent = digSpotWorkedOut(worldMemory, surfaceRoomKey);');
    expect(EXPLORE).toContain('if (surfaceUnlocked && !groundOutOfReach && !groundSpent) groundCount = 1;');
  });

  it('⚠⚠ the scanner gate still outranks it — the more specific refusal wins', () => {
    // A missing scanner is the more useful thing to say and climbing down or
    // walking away will not fix it, so it is set first and this gate only fills
    // an empty slot. Same precedence OTA-1124 chose for elevation.
    const pin = EXPLORE.slice(EXPLORE.indexOf("const key = noun.replace(/^the\\s+/i, '')"));
    const scannerAt = pin.indexOf('let unmetRequirement = req && !hasScannerForReq');
    const workedAt = pin.indexOf("unmetRequirement = 'worked out — try fresh ground';");
    expect(scannerAt).toBeGreaterThan(-1);
    expect(workedAt).toBeGreaterThan(scannerAt);
  });

  it('⚠⚠ the room key is canonical — the same makeRoomKey the ledger is written with', () => {
    // OTA-164's lesson: a hub interior keys differently, and a UI reading a
    // hand-built key sees marks the action cannot, or misses marks it wrote.
    expect(EXPLORE).toContain('() => (player');
    expect(EXPLORE).toContain('? makeRoomKey(player.currentLocationId, currentScene?.microMicroId, player.mapX, player.mapY, player.hubRoomId)');
    expect(STORE).toContain('const groundRoomKey = makeRoomKey(player.currentLocationId, scene?.microMicroId, player.mapX, player.mapY, player.hubRoomId);');
  });

  it('⚠ hub floors are exempt — they restock on their own path', () => {
    // The dig ceiling is a WILD-tile guard (arb119); hub/outpost floors use a
    // different restock and must not inherit a limit that was never theirs.
    expect(EXPLORE).toContain('!player.hubRoomId && digSpotWorkedOut');
  });

  it('⚠ the predicate lives in the engine, not in a screen', () => {
    expect(DIG).toContain('export function digSpotWorkedOut(');
    expect(EXPLORE).toContain("import { digSpotWorkedOut } from '../engine/digging';");
  });
});
