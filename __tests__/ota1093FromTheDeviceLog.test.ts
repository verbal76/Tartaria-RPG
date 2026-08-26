// OTA-1093 — FIVE FROM THE DEVICE LOG (2026-08-04, Pixel 10 Pro XL, 4.29.26).
//
// The headline is #1, and it is a correction to my own triage: I told the owner
// the raid builder was dressing a non-human body in faction colours. It wasn't.
// The raiders were human; `randomizeEnemyDefense` was turning three of a
// Human's four authored WEAKNESSES into ×0.5 RESISTS on every spawn, so a man
// in a salvage vest shrugged off crossbow bolts. Neutralise had been
// implemented as invert. `inured:` is the missing third state.

jest.setTimeout(30000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { traitDamageMultiplier, combineDamageTypeMatch } from '../app/engine/enemyTraits';
import { randomizeEnemyDefense } from '../app/engine/encounter';
import { enemyTypeDefenses } from '../app/engine/crafting';
import { combatEnemyLabel } from '../app/engine/narrativeGenerator';
import { dressFactionFighter } from '../app/engine/factionBodies';
import type { Enemy } from '../app/engine/types';

// ⚠⚠ OTA-1404 — COMBAT RESOLUTION MOVED OUT OF gameStore INTO ITS OWN LEAF, and
// the pins below follow the code to its new address rather than reading both
// files and hoping. A helper that searches "wherever the code went" can never
// fail, and a pin that cannot fail is not a test. Everything still asserted
// against the store constant above is still IN the store.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const COMBAT_SRC: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('path').join(__dirname, '..', 'app', 'state', 'combatResolution.ts'), 'utf8');

const human = (over?: Partial<Enemy>): Enemy => ({
  name: 'Reclaimer Ambusher',
  type: 'Human',
  hp: 30,
  attack: 'Crossbow Volley',
  damage: '1D6',
  abilityPoint: 'Dexterity 5',
  rarity: 'Uncommon',
  traits: ['quick'],
  ...(over ?? {}),
} as Enemy);

describe('OTA-1093 #1 — a weakness that is rolled off becomes ORDINARY, not armour', () => {
  it('the profiler writes inured: for the unpicked weaknesses, never resist:', () => {
    // Deterministic rng: always take the first option, never the 35% wall.
    const profiled = randomizeEnemyDefense(human(), () => 0.99);
    const traits = profiled.traits ?? [];
    const weak = enemyTypeDefenses('Human').weak;
    expect(weak.length).toBeGreaterThan(1);
    for (const w of weak) {
      // Exactly one stays vulnerable; the others are inured, and NONE of the
      // kind's own weaknesses may be written as a resist.
      expect(traits).not.toContain(`resist:${w}`);
    }
    expect(traits.filter((t) => t.startsWith('vulnerable:')).length).toBe(1);
    expect(traits.some((t) => t.startsWith('inured:'))).toBe(true);
  });

  it('a crossbow bolt into a man lands NORMALLY, not at half', () => {
    const profiled = randomizeEnemyDefense(human(), () => 0.99);
    const trait = traitDamageMultiplier(profiled.traits, 'piercing');
    const combined = combineDamageTypeMatch('weak', trait.match);
    // Whatever the roll picked, piercing is never WORSE than an ordinary hit.
    expect(combined.multiplier).toBeGreaterThanOrEqual(1);
    expect(combined.match).not.toBe('resist');
  });

  it('inured cancels a weakness but can never talk a Construct out of its plating', () => {
    // Construct RESISTS slashing by type. An inured trait must leave that alone —
    // you cannot be "used to" something that was never soft.
    expect(combineDamageTypeMatch('resist', 'inured')).toEqual({ multiplier: 0.5, match: 'resist' });
    expect(combineDamageTypeMatch('weak', 'inured')).toEqual({ multiplier: 1, match: 'normal' });
    expect(combineDamageTypeMatch('normal', 'inured')).toEqual({ multiplier: 1, match: 'normal' });
  });

  it('authored resist:/vulnerable: traits are untouched by the new state', () => {
    expect(traitDamageMultiplier(['resist:piercing'], 'piercing').multiplier).toBe(0.5);
    expect(traitDamageMultiplier(['vulnerable:burn'], 'burn').multiplier).toBe(1.5);
    expect(traitDamageMultiplier(['inured:piercing'], 'piercing')).toEqual({ multiplier: 1, match: 'inured' });
  });

  it('the profiler stays idempotent — a second pass adds nothing', () => {
    const once = randomizeEnemyDefense(human(), () => 0.99);
    const twice = randomizeEnemyDefense(once, () => 0.01);
    expect(twice.traits).toEqual(once.traits);
  });
});

describe('OTA-1093 #3 — the Arbiter uses a faction fighter\'s NAME', () => {
  it('faction fighters keep their case; generic species still lowercase', () => {
    const dressed = dressFactionFighter(human(), 'conspiracy_architects', 'Conspiracy Architects', 'Raider', 1);
    expect(combatEnemyLabel(dressed)).toBe('Conspiracy Architects Raider 1');
    expect(combatEnemyLabel({ name: 'Mud Boar', boss: false } as Enemy)).toBe('mud boar');
    expect(combatEnemyLabel({ name: 'The Weeping Core', boss: true } as Enemy)).toBe('The Weeping Core');
  });
});

describe('OTA-1093 — source locks for the store-side fixes', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
  ) as string;

  it('#2 the pack swing cap counts shooters standing in the scrum', () => {
    // ⚠ OTA-1506 — the scrum is judged at THAT enemy's own band (liveRange).
    expect(COMBAT_SRC).toMatch(/const inTheScrum = liveRange === 'close';/);
    expect(COMBAT_SRC).toMatch(/const meleeAttacker = !enemy\.boss && \(inTheScrum \|\| !isRangedEnemy\(enemy\)\);/);
  });

  it('#4 gifting still refuses a piece you are still wearing, before spending it', () => {
    // ⚠ RETARGETED BY OTA-1154 — the CLAIM is unchanged and still enforced; the
    // implementation moved and got stricter. This used to pin the literal string
    // "You are still wearing the ${item.name} (${wornSlot})", which came from a
    // guard that compared the equipped slot's NAME to the item's name. That guard
    // is gone: it refused a SECOND identical copy because the FIRST was worn, and
    // it knew nothing about the bandolier, the tool pouch, fusion reservations or
    // accepted fetch contracts. `giftBlockReason` (engine/giftEligibility.ts)
    // answers all of it by instance id, and ota1154GiftMode tests the behaviour
    // directly. What this lock still owns is the ORDERING, which is what OTA-1093
    // was actually about: the refusal must land before the inventory decrement.
    expect(src).toMatch(/const blocked = giftBlockReason\(item, player\);/);
    const guardAt = src.indexOf('const blocked = giftBlockReason(item, player);');
    const spendAt = src.indexOf('i.id === itemId ? { ...i, quantity: i.quantity - 1 }');
    expect(guardAt).toBeGreaterThan(0);
    expect(spendAt).toBeGreaterThan(0);
    expect(guardAt).toBeLessThan(spendAt);
  });

  it('#5 two titles in one beat speak once, then name the rest', () => {
    expect(src).toMatch(/And a second, in the same breath/);
    expect(src).toMatch(/And \$\{rest\.length\} more in the same breath/);
  });
});
