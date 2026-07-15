// OTA-817 — mixed-role packs return, and a pack is scaled as ONE shared budget (not
// per-body), so a trio never out-guns a boss (player: "scale multiples as a package
// not individually — if you scale 3 enemies then put them together it will be harder
// than a boss fight").

import {
  rollExtraPackMembers,
  scaleEncounterForContext,
  scaledEnemyForContext,
  enemyScalePower,
} from '../app/engine/encounter';
import type { Enemy, Location } from '../app/engine/types';

const loc = (danger: number): Location => ({ danger } as unknown as Location);
const bat = (): Enemy =>
  ({ name: 'Aetherbat', type: 'Aetheric Creature', abilityPoint: 'Dexterity 3', attack: 'Sonic Scream', damage: '1d6', hp: 15, rarity: 'Common', loot: [], traits: [] } as unknown as Enemy);
const boss = (): Enemy =>
  ({ name: 'Sentinel', type: 'aether_construct', abilityPoint: 'Strength 6', attack: 'Sweep', damage: '2d6', hp: 80, rarity: 'Legendary', loot: [], traits: [], boss: true } as unknown as Enemy);

const ENDGAME = enemyScalePower(28, 120); // maxed

describe('OTA-817 — mixed-role pack spawning', () => {
  it('adds role-diverse foes, more at higher danger (rng forced to pass)', () => {
    const zero = () => 0; // packChance passes; taper never breaks the loop
    const d1 = rollExtraPackMembers(loc(1), [bat()], { rng: zero });
    const d4 = rollExtraPackMembers(loc(4), [bat()], { rng: zero });
    expect(d1.length).toBe(1);          // low danger → at most one extra body
    expect(d4.length).toBe(2);          // deep zone → up to two
    // Role diversity: an added foe should differ in TYPE from the Aetherbat lead.
    for (const e of d4) expect((e.type ?? '').toLowerCase()).not.toBe('aetheric creature');
  });

  it('never packs onto a boss / Guardian', () => {
    expect(rollExtraPackMembers(loc(5), [boss()], { rng: () => 0 })).toHaveLength(0);
  });

  it('never grows a pack past 3 total', () => {
    expect(rollExtraPackMembers(loc(5), [bat(), bat(), bat()], { rng: () => 0 })).toHaveLength(0);
  });

  it('a low roll spawns no pack (frontier stays mostly single)', () => {
    expect(rollExtraPackMembers(loc(0), [bat()], { rng: () => 0.99 })).toHaveLength(0);
  });
});

describe('OTA-817 — pack scaled as one shared, boss-capped budget', () => {
  it('a 3-bat pack totals far LESS than 3× the solo-scaled HP', () => {
    const solo = scaledEnemyForContext(bat(), 3, ENDGAME).hp;         // one bat, danger 3
    const pack = scaleEncounterForContext([bat(), bat(), bat()], 3, ENDGAME);
    const packTotal = pack.reduce((s, e) => s + e.hp, 0);
    expect(packTotal).toBeLessThan(solo * 3);                        // NOT per-body scaled
    expect(packTotal).toBeLessThanOrEqual(100);                     // under the danger-3 boss ceiling
    // Each body is still a real target (not chipped to nothing).
    for (const e of pack) expect(e.hp).toBeGreaterThanOrEqual(6);
  });

  it('a single enemy still scales solo (unchanged path)', () => {
    const viaBatch = scaleEncounterForContext([bat()], 2, ENDGAME)[0]!;
    const viaSolo = scaledEnemyForContext(bat(), 2, ENDGAME);
    expect(viaBatch.hp).toBe(viaSolo.hp);
  });

  it('a boss mixed into a pack is left untouched and does not share the budget', () => {
    const scaled = scaleEncounterForContext([boss(), bat(), bat()], 4, ENDGAME);
    const scaledBoss = scaled.find((e) => e.boss)!;
    expect(scaledBoss.hp).toBe(80);   // boss HP unchanged
  });

  it('distributes by base-HP weight — a brute out-bulks a rat in the same pack', () => {
    const rat = bat();
    const brute = { ...bat(), name: 'Brute', type: 'brute', hp: 45 } as Enemy;
    const pack = scaleEncounterForContext([rat, brute], 3, ENDGAME);
    const scaledRat = pack.find((e) => e.name === 'Aetherbat')!;
    const scaledBrute = pack.find((e) => e.name === 'Brute')!;
    expect(scaledBrute.hp).toBeGreaterThan(scaledRat.hp);
  });
});
