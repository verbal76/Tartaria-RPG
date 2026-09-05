jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1643 (slice 4a) — THE DICE RIDERS. Slice 4's measurement (2026-09-03,
// current catalog) counted 303 effect strings, of which 164 parsed and 139 did
// not. Thirty of the unread ones carry a "+N" or "+NdN" DAMAGE PROMISE — the
// simplest sentence in the whole column — and nothing anywhere rolled a single
// one of them. A Legendary Energy Hammer said "+1d6 shock damage" and swung for
// its printed 2d10 and nothing else, every time, for the life of the game.
//
// This suite keeps three things honest at once:
//   1. THE PROMISES NOW PAY. Each of the 19 weapons in scope resolves to exactly
//      the mechanic its sentence describes.
//   2. NOTHING PAYS TWICE. The two families this slice adds sit next to five
//      that already existed, and every one of them can be spelled with dice —
//      so the suite pins the boundaries, not just the wins.
//   3. NOTHING PROMISES THE IMPOSSIBLE. Three cards asked for something no
//      enemy in the game can be, and they were reworded rather than left to
//      read as features.

import weaponsJson from '../app/data/items/weapons.json';
import runecastersJson from '../app/data/items/runecasters.json';
import {
  parseWeaponEffect, rollEffectBonusDamage, rollRiderDot, effectConditionMatches,
} from '../app/engine/weaponEffects';
import type { Enemy } from '../app/engine/types';
import enemiesJson from '../app/data/enemies/enemies.json';

type Row = { name: string; effect?: string; damageDice?: string; damageType?: string };
// ⚠ weapons.json is an OBJECT with a `weapons` array; runecasters.json is a
// bare array. Reading both the same way is how a fixture silently comes back
// empty and an audit passes by testing nothing.
const WEAPONS = (weaponsJson as unknown as { weapons: Row[] }).weapons;
const RUNECASTERS = runecastersJson as unknown as Row[];
const ALL: Row[] = [...WEAPONS, ...RUNECASTERS];
const ENEMIES = enemiesJson as unknown as Array<{
  name: string; type?: string; traits?: string[];
}>;

const row = (name: string): Row => {
  const r = ALL.find((w) => w.name === name);
  if (!r) throw new Error(`no weapon row named ${name}`);
  return r;
};
const parse = (name: string) => parseWeaponEffect(row(name).effect);

const enemy = (over: Partial<Enemy> = {}): Enemy => ({
  name: 'Test Thing', type: 'Mud Creature', hp: 20, ac: 12,
  damage: '1d6', traits: [], ...over,
} as Enemy);

describe('OTA-1643 — an unconditional rider is rolled on every hit', () => {
  // The six weapons whose whole effect line is a flat addition, plus the two
  // that bury one behind a semicolon.
  const RIDERS: ReadonlyArray<readonly [string, string, string | undefined]> = [
    ['Heavy Rail Axe', '1d6', 'shock'],
    ['Energy Hammer', '1d6', 'shock'],
    ['Plasma Knife', '1d6', 'plasma'],
    ['Plasma Mace', '1d6', 'plasma'],
    ['Bone Thornblade', '1d6', 'poison'],
    ['Plasma Spear', '1d6', 'plasma'],
    ['Aetheric Blade', '1d6', 'aetheric'],
    ['Giant Bone Knuckles', '1d6', 'bludgeoning'],
  ];

  it.each(RIDERS)('%s carries its printed rider', (name, dice, type) => {
    const p = parse(name);
    expect(p?.flatRider?.dice).toBe(dice);
    if (type) expect(p?.flatRider?.type).toBe(type);
  });

  it('the rider actually reaches the damage total, on any enemy', () => {
    const p = parse('Energy Hammer');
    // 1d6 → 1..6, and it must be there for a plain unarmoured beast with no
    // condition satisfied anywhere. Before this OTA the answer was 0.
    for (let i = 0; i < 40; i++) {
      const rolled = rollEffectBonusDamage(p, enemy({ traits: [] }));
      expect(rolled).toBeGreaterThanOrEqual(1);
      expect(rolled).toBeLessThanOrEqual(6);
    }
  });

  it('a weapon with no effect line still adds nothing', () => {
    expect(rollEffectBonusDamage(null, enemy())).toBe(0);
    expect(rollEffectBonusDamage(parseWeaponEffect('A plain blade.'), enemy())).toBe(0);
  });
});

describe('OTA-1643 — the flat conditioned bonus', () => {
  it('"+4 damage against creatures with natural armor" is read as 4, not as nothing', () => {
    const p = parse('Tartarian Claw Knife');
    expect(p?.bonuses).toEqual([{ flat: 4, condition: 'natural_armor' }]);
  });

  it('"+1 damage to mechanical creatures" is read as 1', () => {
    expect(parse('Aetheric Baton')?.bonuses).toEqual([{ flat: 1, condition: 'mechanical' }]);
  });

  it('the flat bonus lands on a match and stays off everything else', () => {
    const p = parse('Tartarian Claw Knife');
    // A Mud Creature in a carapace: armour it grew.
    expect(rollEffectBonusDamage(p, enemy({ type: 'Mud Creature', traits: ['armored'] }))).toBe(4);
    // An Automation has armour, but it was bolted on.
    expect(rollEffectBonusDamage(p, enemy({ type: 'Automation', traits: ['armored'] }))).toBe(0);
    // Bare flesh has no seams to find.
    expect(rollEffectBonusDamage(p, enemy({ type: 'Mud Creature', traits: [] }))).toBe(0);
  });

  /**
   * ⚠⚠⚠ THE REGRESSION THIS PINS, because it is the one the build actually hit.
   * A flat-number pattern loose enough to read "+1 damage to tech" also reads
   * the shields' "+2 AC vs energy damage" as +2 bonus damage versus energy —
   * turning a defensive clause into an offensive one on eight items. Requiring
   * the literal word `damage` immediately after the number is the whole guard.
   */
  it('a shield\'s "+N AC vs X damage" is never read as bonus damage', () => {
    for (const name of ['Mud Heater Shield', 'Aetheric Shield', 'Titan Shield',
      'Giant Bone Shield', 'Mud Royal Shield', "Mud Emperor's Buckler"]) {
      const p = parse(name);
      expect(p?.bonuses ?? []).toEqual([]);
      expect(p?.flatRider).toBeUndefined();
      expect(p?.riderDot).toBeUndefined();
    }
  });
});

describe('OTA-1643 — a stated duration makes it fester', () => {
  it('"+1d6 poison over 2 turns" is a DOT, not an immediate bonus', () => {
    const p = parse('Mud Venom Blade (Rare)');
    expect(p?.riderDot).toEqual({ dice: '1d6', rounds: 2, type: 'poison' });
    expect(p?.flatRider).toBeUndefined();
  });

  it('"on rolls of 15+" is carried as the gate it is', () => {
    const p = parse('Mud Venom Blade');
    expect(p?.riderDot?.threshold).toBe(15);
    expect(p?.riderDot?.rounds).toBe(2);
  });

  it('an ungated DOT lands; a gated one waits for its roll', () => {
    const open = parse('Mud Venom Blade (Rare)');
    expect(rollRiderDot(open, enemy())).not.toBeNull();

    const gated = parse('Mud Venom Blade');
    // ⚠ An unproven gate is a no-op, never a free pass — a caller that forgets
    // to answer gets the weapon it had before this OTA.
    expect(rollRiderDot(gated, enemy())).toBeNull();
    expect(rollRiderDot(gated, enemy(), false)).toBeNull();
    expect(rollRiderDot(gated, enemy(), true)).not.toBeNull();
  });

  it('a scoped DOT skips the wrong body', () => {
    const p = parse('Mud Thornblade');
    expect(p?.riderDot?.restrictedTo).toBe('unarmored');
    expect(rollRiderDot(p, enemy({ traits: [] }))).not.toBeNull();
    expect(rollRiderDot(p, enemy({ traits: ['armored'] }))).toBeNull();
  });

  /**
   * ⚠⚠ THE DOUBLE-COUNT THIS PINS. Mud Thornblade's line is a SINGLE clause that
   * satisfies both readers — an aimed "+NdN against X" bonus AND a scoped DOT —
   * so the blade collected 1d6 immediately and 1d6 a turn for two turns off a
   * card promising only the second. The clause that becomes a DOT is withheld
   * from the bonus passes.
   */
  it('one clause is paid once: the DOT clause yields no immediate bonus', () => {
    const p = parse('Mud Thornblade');
    expect(p?.riderDot).toBeTruthy();
    expect(p?.bonuses ?? []).toEqual([]);
    expect(rollEffectBonusDamage(p, enemy({ traits: [] }))).toBe(0);
  });
});

describe('OTA-1643 — the new conditions are backed by real enemies', () => {
  /**
   * ⚠⚠⚠ A CONDITION THAT MATCHES NOTHING IS THE DEFECT, NOT THE FIX. This is
   * the whole reason three cards were reworded instead of parsed: `structure`
   * has returned false since it was added because structures are not enemies in
   * this schema, so every weapon routed to it reads as a feature and does
   * nothing. Each condition this OTA adds has to be reachable by a real row in
   * enemies.json, and the counts are asserted so a later data edit that empties
   * one fails here rather than silently going quiet in the field.
   */
  const countMatching = (cond: Parameters<typeof effectConditionMatches>[0]): number =>
    ENEMIES.filter((e) => effectConditionMatches(cond, enemy({
      name: e.name, type: e.type, traits: e.traits ?? [],
    }))).length;

  it('armored / unarmored split the whole roster and neither half is empty', () => {
    const armored = countMatching('armored');
    const unarmored = countMatching('unarmored');
    expect(armored).toBeGreaterThan(10);
    expect(unarmored).toBeGreaterThan(10);
    expect(armored + unarmored).toBe(ENEMIES.length);
  });

  it('natural_armor is a real subset of armored — grown, not bolted on', () => {
    const nat = countMatching('natural_armor');
    expect(nat).toBeGreaterThan(5);
    expect(nat).toBeLessThan(countMatching('armored'));
  });

  it('burnable finds the vulnerable:burn roster', () => {
    expect(countMatching('burnable')).toBeGreaterThan(10);
  });
});

describe('OTA-1643 — the rewords, because nothing could satisfy the old text', () => {
  it('no weapon asks for a cold creature, since the game has none', () => {
    // Measured: zero enemies carry resist:cold or vulnerable:cold, and no type
    // is cold-natured. "+1d6 against cold creatures" could never once fire.
    for (const w of ALL) {
      expect(w.effect ?? '').not.toMatch(/against cold creatures/i);
    }
    expect(parse('Mud Heater Sword')?.bonuses)
      .toEqual([{ dice: '1d6', condition: 'burnable' }]);
  });

  it('the sling no longer aims at objects that are not enemies', () => {
    expect(row('Mud Sling').effect).not.toMatch(/glass|fragile/i);
    expect(parse('Mud Sling')?.bonuses).toEqual([{ dice: '1d6', condition: 'unarmored' }]);
  });

  it('the knuckles say what a barehanded weapon can actually promise', () => {
    // "+1d6 to arm's-reach targets" on a weapon that has never reached further
    // than arm's length is a condition that is always true, written as though it
    // were sometimes false.
    expect(row('Giant Bone Knuckles').effect).not.toMatch(/arm's-reach targets/i);
    expect(parse('Giant Bone Knuckles')?.flatRider?.dice).toBe('1d6');
  });
});

describe('OTA-1643 — the boundaries the rider reader must not cross', () => {
  /**
   * ⚠⚠⚠ THE FIRST DRAFT OF THIS READER CLAIMED 73 WEAPONS INSTEAD OF 19, and
   * this block is the record of why. A rider is an ADDITION; the catalog writes
   * additions with a `+`. Two families write dice for entirely different reasons
   * and a reader without the plus test swallowed both.
   */
  it('a rune-caster restating its own base dice gains no rider', () => {
    // Every rune-caster repeats its damage in the effect column. Read as riders,
    // all of them would have doubled — a Legendary scepter going 2d20 → 4d20 on
    // a change meant for three mud blades.
    for (const rc of RUNECASTERS) {
      const p = parseWeaponEffect(rc.effect);
      if (!p?.flatRider) continue;
      // The only way a rune-caster may hold a rider is if its line actually
      // writes a '+' addition. None currently do; this asserts the rule rather
      // than the count, so authoring one later still has to be deliberate.
      expect(rc.effect ?? '').toMatch(/\+\s*\d+d\d+/);
    }
  });

  it('the defensive dice on shields and wards are never an attack rider', () => {
    for (const name of ['Graviton Shield', 'Mud Spiked Shield', 'Plasma Buckler']) {
      const p = parse(name);
      expect(p?.flatRider).toBeUndefined();
    }
  });

  it('a duration on a CONTROL effect is not a damage duration', () => {
    // "1d10, deals both frost and lightning damage, stuns target for 1 round" —
    // the round belongs to the stun. A loose reader turned four rune-casters
    // into per-turn engines ticking their full base dice.
    for (const name of ['Frost Shock', 'Eternal Flame', 'Frostbite', 'Inferno Pulse']) {
      const r = ALL.find((w) => w.name === name);
      if (!r) continue;
      expect(parseWeaponEffect(r.effect)?.riderDot).toBeUndefined();
    }
  });

  it('the max-roll family keeps its own clauses', () => {
    // "+1d6 on max roll" is OTA-1564's, and a rider that also took it would pay
    // the perfect swing twice.
    const p = parse('Bone Scimitar');
    expect(p?.onMaxRoll?.bonusDice).toBe('1d6');
    expect(p?.flatRider).toBeUndefined();
  });

  it('an aimed bonus stays a bonus and never becomes an unconditional rider', () => {
    const p = parse('Giant Bone Sword');
    expect(p?.bonuses).toEqual([{ dice: '1d6', condition: 'armored' }]);
    expect(p?.flatRider).toBeUndefined();
  });

  /**
   * ⚠⚠ THE ORDERING BUG THIS PINS, in both directions. `armored` sits between
   * `construct` and `structure` in the condition table and both neighbours are
   * load-bearing — see the comment on conditionFromTarget.
   */
  it('"constructs or armor" still means constructs', () => {
    expect(parse('Tartarian Longbow')?.bonuses).toEqual([
      { dice: '1d6', condition: 'construct' },
      { dice: '1d6', condition: 'aerial' },
    ]);
  });

  it('"armor or structures" now means armour, which is the half that can fire', () => {
    expect(parse('Tartarian Great Knife')?.bonuses)
      .toEqual([{ dice: '1d6', condition: 'armored' }]);
  });

  it('"unarmored" is never read as "armored"', () => {
    const p = parseWeaponEffect('+1d6 against unarmored enemies.');
    expect(p?.bonuses).toEqual([{ dice: '1d6', condition: 'unarmored' }]);
  });
});

describe('OTA-1643 — the audit that keeps the column honest', () => {
  /**
   * ⚠⚠ THE RATCHET. Slice 4 has two units left after this one (the eight shield
   * +AC promises, then the exotic reword pass), so the unread tail is expected
   * to SHRINK and never grow. Pinning the current number means a newly authored
   * weapon carrying a dead promise fails here instead of shipping.
   */
  /**
   * ⚠⚠ THE DEBT IS NAMED, NOT HIDDEN. Four rows still carry a "+NdN" nothing
   * reads, and each one belongs to a unit that has not shipped:
   *
   *   • Graviton Shield / Titan Shield — DEFENSIVE dice, counted off incoming
   *     damage. Slice 4b (the eight shield +AC promises) owns them.
   *   • Aetheric Pike (Rare) "+1d6 vs affiliated foes" — needs a FACTION
   *     condition, which no BonusCondition expresses yet.
   *   • Aetheric Plasma Blade "+1d20 to all in close range if broken on parry"
   *     — needs the parry system, and a blast keyed on the weapon breaking.
   *
   * Listing them by name is what makes this a ratchet rather than a wish: a
   * NEWLY authored dead promise is not on the list and fails here.
   */
  // ⚠ OTA-1676 (slice 4c) — three of the four came OFF the list, exactly as the
  // note above says they must: Graviton Shield and Titan Shield's defensive
  // dice are read as `shieldAc.dr` and spent on a blow that lands on the
  // shield; the Aetheric Plasma Blade was reworded onto a max-roll blast. The
  // Aetheric Pike's faction condition is the one promise still without a reader.
  const DEFERRED_TO_LATER_UNITS = [
    'Aetheric Pike (Rare)',
  ];

  // OTA-1676 — a shield's DR is a paid "+NdN": counted off the blow, not dealt.
  const isPaid = (p: ReturnType<typeof parseWeaponEffect>): boolean => !!(p && (p.bonuses?.length || p.flatRider || p.riderDot
    || p.onMaxRoll || p.splash || p.weather?.bonus || p.onHitBleed || p.onHitBurn || p.shieldAc?.dr));

  it('no weapon carries an unread "+NdN damage" promise except the named debt', () => {
    const dead: string[] = [];
    for (const w of ALL) {
      const e = w.effect ?? '';
      if (!/\+\s*\d+d\d+/.test(e)) continue;
      const p = parseWeaponEffect(e);
      // ⚠ onHitBleed / onHitBurn count as PAID: "+1d6 bleed damage on hit" has
      // been read since long before this slice, and omitting them from the
      // check is how an audit reports a defect that was fixed years ago.
      const paid = isPaid(p);
      if (!paid && !DEFERRED_TO_LATER_UNITS.includes(w.name)) dead.push(`${w.name} :: ${e}`);
    }
    expect(dead).toEqual([]);
  });

  it('every named debt is still genuinely unread, so the list cannot rot', () => {
    // If a later unit pays one of these, it must come OFF the list — otherwise
    // the list quietly grows into an exemption nobody re-checks.
    for (const name of DEFERRED_TO_LATER_UNITS) {
      expect(isPaid(parseWeaponEffect(row(name).effect))).toBe(false);
    }
  });

  it('the unparsed tail does not grow', () => {
    const unparsed = ALL.filter((w) => (w.effect ?? '').trim() && !parseWeaponEffect(w.effect));
    // 139 before this OTA, 123 after. Slice 4b (shields) and 4c (the exotic
    // reword pass) take this down further; nothing may push it back up.
    // ⚠ OTA-1676 (4c) — 57: the 28 named flavour lines in weapons.json (pinned
    // by name in ota1676) plus the 29 rows of the orphaned runecasters.json
    // that `ALL` still counts. The live tail is the 28.
    expect(unparsed.length).toBeLessThanOrEqual(57);
  });
});
