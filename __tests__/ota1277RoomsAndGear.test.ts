// ⚠⚠ OTA-1277 — TWO THINGS THE OWNER TYPED INTO THE GAME MID-RUN.
//
// (1) *"I don't know if I've been to a room yet or not. maybe we should put a
//      little symbol in the room button if it's already been explored... I'm
//      tapping the same things over and over again cuz I'm cycling through like
//      15 names."* His own log proves it: Memorial visit 5, Workshop visit 4,
//      Hearth visit 3, all inside seven minutes of one session.
//
// (2) *"you should always recommend two different ranged weapons. try to get one
//      long range like a bolt caster or a bow or a crossbow and try to make the
//      other one a melee weapon... and go for the highest roll value. so a 1d6
//      bolt caster is going to get beat by a 2d8 bolt caster... and as far as
//      the armor if we have multiple pieces for one slot, go towards the one
//      that has the most resists the highest AC and any other values."*
import { armorScore, upgradeEquipSlot } from '../app/engine/gatherSort';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1277 (1) — the room buttons say where you have been', () => {
  it('⚠⚠ visited rooms carry a mark, unvisited do not', () => {
    const box = src('app', 'components', 'InputBox.tsx');
    // ⚠ OTA-1362 put a compass glyph ahead of the check, so the template moved.
    // The RULE this test guards is unchanged and is asserted in both halves:
    // a walked room carries the ✓, an unwalked one does not, and the mark still
    // sits immediately before the name rather than after it.
    expect(box).toContain('const walked = seen.has(targetId);');
    expect(box).toContain('label: `${arrow} ${walked ? `✓ ${name}` : name}`,');
  });

  it('⚠⚠ it reads the SAME set fast-travel earns off — the mark cannot lie', () => {
    // If the dot used its own bookkeeping it would drift from what the game
    // believes you have seen. worldMemory.hubVisited is the one source.
    const box = src('app', 'components', 'InputBox.tsx');
    expect(box).toContain('const hubVisited = useGameStore((st) => st.worldMemory.hubVisited);');
    expect(box).toContain('const seen = new Set(hubVisited ?? []);');
    // ...and the memo re-runs when it changes, or the mark would go stale the
    // moment you walked into a new room.
    expect(box).toContain('}, [hubRoom, skinFactionId, hubVisited]);');
  });
});

describe('OTA-1277 (2a) — armour is ranked by AC, then resists, then stats', () => {
  it("⚠⚠ THE OWNER'S OWN EXAMPLE: equal AC, more resists + stats wins", () => {
    const plain = { acBonus: 2, resistances: ['poison'] };
    const better = { acBonus: 2, resistances: ['poison', 'slashing', 'burning'], statBonus: { amount: 2 } };
    expect(armorScore(better)).toBeGreaterThan(armorScore(plain));
  });

  it('⚠⚠ AC still dominates — two AC beats a pile of resists', () => {
    const highAC = { acBonus: 4, resistances: [] as string[] };
    const manyResists = { acBonus: 2, resistances: ['a', 'b', 'c', 'd', 'e'] };
    expect(armorScore(highAC)).toBeGreaterThan(armorScore(manyResists));
  });

  it('⚠ multiple stat bonuses all count', () => {
    const one = { acBonus: 1, resistances: [], statBonus: { amount: 1 } };
    const two = { acBonus: 1, resistances: [], statBonuses: [{ amount: 1 }, { amount: 2 }] };
    expect(armorScore(two)).toBeGreaterThan(armorScore(one));
  });

  it('⚠⚠ a WORSE piece no longer claims a slot just for being catalog armour', () => {
    // Pre-fix, any armour took its slot on sight — which could downgrade what
    // was already on your back. Now it must beat the worn piece.
    const src2 = src('app', 'engine', 'gatherSort.ts');
    expect(src2).toContain('if (wornArmor && armorScore(armor) <= armorScore(wornArmor)) return null;');
  });
});

describe('OTA-1277 (2b) — the hands cover two ranges, then maximise damage', () => {
  const player = (main?: string, off?: string) => ({
    inventory: [
      ...(main ? [{ id: 'm', name: main, quantity: 1 }] : []),
      ...(off ? [{ id: 'o', name: off, quantity: 1 }] : []),
    ],
    equipped: { main, off },
  }) as never;

  it('⚠⚠ an empty-handed player takes anything into main', () => {
    expect(upgradeEquipSlot(player(), 'Cudgel')?.slot).toBe('main');
  });

  it('⚠⚠ THE COVERAGE RULE: holding only melee, a ranged pickup is taken', () => {
    // Owner: "always recommend two different ranged weapons... one long range
    // ... the other one a melee weapon." A player with two clubs cannot answer
    // anything at distance, so filling the gap outranks a damage comparison.
    const got = upgradeEquipSlot(player('Cudgel', 'Bone Shiv'), 'Bolt-Caster');
    expect(got).not.toBeNull();
  });

  it('⚠⚠ ...and it does NOT strip the pair back to one band', () => {
    // With a ranged main and a melee off, the pair already covers both. A second
    // melee must not displace the only ranged weapon.
    const got = upgradeEquipSlot(player('Bolt-Caster', 'Cudgel'), 'Bone Shiv');
    expect(got?.slot).not.toBe('main');
  });

  it('⚠ the source states the damage rule the owner gave', () => {
    const s = src('app', 'engine', 'gatherSort.ts');
    expect(s).toContain('1d6 bolt');           // his exact example, kept verbatim
    expect(s).toContain('averageDamage(weapon.damageDice) > averageDamage(offWeapon.damageDice)');
  });
});
