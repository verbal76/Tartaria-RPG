/**
 * OTA-1730 - THE HINT POINTS SOMEWHERE YOU CAN STILL GO.
 *
 * Audit item 4: every "do X to unlock Y" must agree with the runtime predicate
 * that actually unlocks it. One mismatch, and the module was already carrying its
 * own correct answer.
 *
 * `afterGuardianWall` and `afterApexWall` are the Arbiter's "try something else"
 * lines - their whole job is to name a road the player has NOT exhausted after
 * they have been walled twice. Both branch on a tower and say so out loud:
 *
 *     "You've heard what they bring down from the old Towers, haven't you?"
 *     "the climbers' summits pay better still"
 *
 * They branched on `knowsATower` - true of a tower the player has ALREADY TOPPED.
 * So a player who bought one chart and crested that tower (an ordinary mid-game
 * state; there are five climbs) was sent back to finished content by the one line
 * meant to unstick them.
 *
 * ⚠⚠ THE RIGHT PREDICATE WAS SIXTY LINES BELOW, AND ALREADY USED CORRECTLY. The
 * vendor rumour has always required `knowsAnUncrestedTower`. One module, two
 * answers to "does this player have a tower to climb". TEXT WRONG / ENGINE RIGHT,
 * and the engine's own stricter answer is now the only one.
 */
import * as PH from '../app/engine/progressionHints';

const ctx = (over: Partial<PH.WallContext> = {}): PH.WallContext =>
  ({ priorWalls: 1, coresRecovered: 0, weaponRarity: 'Rare', knowsAnUncrestedTower: false, nowHour: 100, ...over });

describe('OTA-1730 - the wall hints agree with the unlock ledger', () => {
  beforeEach(() => { PH._resetProgressionHints(); });

  it('⚠⚠⚠ A TOPPED TOWER IS NOT A ROAD: all-crested gets the hunts line, not the towers line', () => {
    const memory = { unlockedGreatClimbs: ['grand_spire'], greatClimbsCrested: ['grand_spire'] };
    expect(PH.knowsATower(memory as never)).toBe(true);              // it IS known…
    expect(PH.knowsAnUncrestedTower(memory as never)).toBe(false);   // …and finished
    const line = PH.afterGuardianWall(ctx({ knowsAnUncrestedTower: PH.knowsAnUncrestedTower(memory as never) }))!;
    expect(line).toContain('hunts are still posted');
    expect(line).not.toContain('old Towers');
  });

  it('an UNCRESTED tower still gets the towers line', () => {
    const memory = { unlockedGreatClimbs: ['grand_spire', 'zharak_fang'], greatClimbsCrested: ['grand_spire'] };
    expect(PH.knowsAnUncrestedTower(memory as never)).toBe(true);
    const line = PH.afterGuardianWall(ctx({ knowsAnUncrestedTower: true }))!;
    expect(line).toContain('old Towers');
  });

  it('⚠⚠ THE SAME FIX ON THE APEX WALL - both hints named the summits', () => {
    PH._resetProgressionHints();
    const done = PH.afterApexWall(ctx({ knowsAnUncrestedTower: false }))!;
    expect(done).not.toContain('summits');
    PH._resetProgressionHints();
    const open = PH.afterApexWall(ctx({ knowsAnUncrestedTower: true }))!;
    expect(open).toContain('summits');
  });

  it('⚠ wallContext reads the STRICT predicate off world memory', () => {
    const player = { mainQuest: { coresRecovered: [] }, hoursElapsed: 100, equipped: {}, inventory: [] };
    const crested = PH.wallContext(
      { unlockedGreatClimbs: ['grand_spire'], greatClimbsCrested: ['grand_spire'] } as never, player as never, 1);
    expect(crested.knowsAnUncrestedTower).toBe(false);
    const open = PH.wallContext(
      { unlockedGreatClimbs: ['grand_spire'], greatClimbsCrested: [] } as never, player as never, 1);
    expect(open.knowsAnUncrestedTower).toBe(true);
  });

  it('⚠ ONE ANSWER IN THE MODULE: nothing branches on the loose predicate any more', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('path').resolve(__dirname, '../app/engine/progressionHints.ts'), 'utf-8') as string;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    // it survives as an exported helper (other callers may want "known at all"),
    // but no hint decides anything with it.
    expect(code.includes('ctx.knowsATower')).toBe(false);
    expect(code.includes('knowsATower: knowsATower(memory)')).toBe(false);
    expect(code.includes('knowsAnUncrestedTower: knowsAnUncrestedTower(memory)')).toBe(true);
  });
});
