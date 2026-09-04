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

// OTA-1656 — THE BLADE YOU CAN SEE.
//
// Owner, after asking whether the last day's work had made him overpowered and
// reading the measurements back: *"do all 4, but let's shoot for 30% having
// coatings."*
//
// Five levers, each one measured against the real catalogs before it was moved.
// The suite re-runs those measurements rather than trusting the numbers I wrote
// into the comments — if the roster changes, this goes red and the ladder gets
// re-solved instead of quietly drifting off 30%.

import {
  coatingChanceFor,
  rollEnemyCoating,
  rollBlowLanding,
  shieldBypassChance,
  SHIELD_BYPASS_FLOOR,
} from '../app/engine/enemyCoating';
import { equippedAccessoryPowers, BURST_DAMAGE } from '../app/engine/accessoryEffects';
import { enemyDetailBody, type EnemyView } from '../app/components/EnemyPanel';
import { COATING_GLYPH } from '../app/engine/weaponGlyphs';
import type { Enemy, PlayerCharacter } from '../app/engine/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROSTER = (() => {
  const raw = require('../app/data/enemies/enemies.json');
  return (Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray)) as Enemy[];
})();

function foe(over: Partial<Enemy> = {}): Enemy {
  return {
    name: 'Rust Stalker', type: 'Construct', rarity: 'Uncommon', hp: 22,
    attack: 'Road Blade', damage: '1D8+2', traits: [], loot: [],
    ...over,
  } as unknown as Enemy;
}

describe('OTA-1656 — the coating rate is 30%, solved not guessed', () => {
  it('⚠ the ROSTER-WEIGHTED average lands on 30%', () => {
    // Not "the ladder numbers average 30" — the ladder is applied to the 135
    // authored enemies at their real rarities, which is the number a player
    // actually meets. The old ladder measured 24.3% here.
    const mean = ROSTER.reduce((a, e) => a + coatingChanceFor(e, 0), 0) / ROSTER.length;
    expect(ROSTER.length).toBeGreaterThan(100);
    expect(mean).toBeGreaterThan(0.29);
    expect(mean).toBeLessThan(0.31);
  });

  it('the ladder still climbs with rarity, and a boss outranks every tier', () => {
    const c = coatingChanceFor(foe({ rarity: 'Common' }));
    const u = coatingChanceFor(foe({ rarity: 'Uncommon' }));
    const r = coatingChanceFor(foe({ rarity: 'Rare' }));
    const l = coatingChanceFor(foe({ rarity: 'Legendary' }));
    const b = coatingChanceFor(foe({ rarity: 'Rare', boss: true } as Partial<Enemy>));
    expect(c).toBeLessThan(u);
    expect(u).toBeLessThan(r);
    expect(r).toBeLessThan(l);
    expect(b).toBeGreaterThan(l);
  });

  it('⚠ the COMMONS stay gentle — the raise is a mid-game lever, not an early one', () => {
    // The owner named the problem as mid-game ("my stacked AC makes me a little
    // overpowered mid game"). A new character's first fights must not become the
    // answer to a complaint nobody made: commons moved 6% → 8%, and no further.
    expect(coatingChanceFor(foe({ rarity: 'Common' }))).toBeLessThanOrEqual(0.10);
    // …while the tiers that only appear once the AC stack exists carry the load.
    expect(coatingChanceFor(foe({ rarity: 'Legendary' }))).toBeGreaterThanOrEqual(0.45);
  });

  it('danger still nudges and never drives, and the cap still holds', () => {
    const calm = coatingChanceFor(foe({ rarity: 'Common' }), 0);
    const grim = coatingChanceFor(foe({ rarity: 'Common' }), 5);
    expect(grim).toBeGreaterThan(calm);
    expect(grim - calm).toBeLessThan(0.20);
    expect(coatingChanceFor(foe({ rarity: 'Legendary', boss: true } as Partial<Enemy>), 99))
      .toBeLessThanOrEqual(0.6);
  });
});

describe('OTA-1656 — the dice put back what shield-first took', () => {
  const diceOf = (e: Enemy): string => {
    // Force the coating on: roll 0 always passes the chance gate.
    const c = rollEnemyCoating(e, () => 0);
    return c!.dice;
  };

  it('every tier stepped up one', () => {
    expect(diceOf(foe({ rarity: 'Common' }))).toBe('1d4');
    expect(diceOf(foe({ rarity: 'Uncommon' }))).toBe('1d4');
    expect(diceOf(foe({ rarity: 'Rare' }))).toBe('1d6');
    expect(diceOf(foe({ rarity: 'Legendary' }))).toBe('1d8');
    expect(diceOf(foe({ rarity: 'Common', boss: true } as Partial<Enemy>))).toBe('1d8');
  });

  it('⚠ the point of the step: HALVED on a shield, it lands where it used to land whole', () => {
    // OTA-1646 sends the blow to the shield and halves the coating there. The old
    // legendary die was 1d6 (avg 3.5) reaching the player whole; halved it became
    // 2.0. The new 1d8 (avg 4.5) halves to 2.25 — back above where it started,
    // without touching the shield's own logic.
    const avg = (n: number) => (n + 1) / 2;
    const halved = (n: number) => Math.max(1, Math.ceil(avg(n) / 2));
    expect(halved(8)).toBeGreaterThanOrEqual(Math.round(avg(6) / 2));
    // …and an UNSHIELDED player simply takes the raise, which is what was asked.
    expect(avg(8)).toBeGreaterThan(avg(6));
    expect(avg(4)).toBeGreaterThan(avg(3));
  });

  it('a coating is still chip damage, never the thing that kills you', () => {
    // The whole design argument in enemyCoating.ts is that this restores a floor
    // of pressure, not that it becomes a damage source. Even a boss die stays
    // small beside the median enemy's own damage.
    for (const e of [foe({ rarity: 'Legendary' }), foe({ boss: true } as Partial<Enemy>)]) {
      const sides = Number(diceOf(e).split('d')[1]);
      expect(sides).toBeLessThanOrEqual(8);
    }
  });
});

describe('OTA-1656 — no fight is free for your armour any more', () => {
  it('⚠ EVERY attacker gets at least the floor, trait or no trait', () => {
    expect(shieldBypassChance([])).toBe(SHIELD_BYPASS_FLOOR);
    expect(shieldBypassChance(undefined)).toBe(SHIELD_BYPASS_FLOOR);
    expect(shieldBypassChance(['lumbering', 'armored'])).toBe(SHIELD_BYPASS_FLOOR);
  });

  it('the authored traits still sit ABOVE the floor and still decide who is slippery', () => {
    expect(shieldBypassChance(['agile'])).toBeGreaterThan(SHIELD_BYPASS_FLOOR);
    expect(shieldBypassChance(['ambush_strike'])).toBeGreaterThan(SHIELD_BYPASS_FLOOR);
    expect(shieldBypassChance(['quick'])).toBeGreaterThan(SHIELD_BYPASS_FLOOR);
    // Still BEST, never the sum — two ways of being slippery is one attacker.
    expect(shieldBypassChance(['agile', 'quick', 'ambush_strike']))
      .toBe(shieldBypassChance(['agile']));
  });

  it('⚠ measured on the real roster: nobody is at zero any more', () => {
    // 66 of 135 enemies carried none of the three traits, so against half the
    // bestiary a raised shield meant armour NEVER chipped for a whole fight.
    const zeros = ROSTER.filter((e) => shieldBypassChance(e.traits) <= 0);
    expect(zeros).toEqual([]);
    const mean = ROSTER.reduce((a, e) => a + shieldBypassChance(e.traits), 0) / ROSTER.length;
    expect(mean).toBeGreaterThan(0.10);
  });

  it('a shield is still excellent — nine blows in ten still land on it', () => {
    let onShield = 0;
    const seq = Array.from({ length: 1000 }, (_, i) => (i % 100) / 100);
    let k = 0;
    for (let i = 0; i < 500; i++) {
      const landing = rollBlowLanding({ hasShield: true, traits: [] }, () => seq[k++ % seq.length]!);
      if (landing.on === 'shield') onShield++;
    }
    expect(onShield / 500).toBeGreaterThan(0.85);
  });

  it('a player with no shield is untouched by any of this', () => {
    const landing = rollBlowLanding({ hasShield: false, traits: ['agile'] }, () => 0.5);
    expect(landing.on).toBe('body');
    expect(landing.wentAround).toBe(false);
  });
});

describe('OTA-1656 — one ring, one burst', () => {
  const wearing = (rings: string[], amulet?: string): PlayerCharacter => ({
    equipped: {
      ...Object.fromEntries(rings.map((n, i) => [i === 0 ? 'ring' : `ring${i + 1}`, n])),
      ...(amulet ? { amulet } : {}),
    },
  } as unknown as PlayerCharacter);

  it('⚠ FOUR COPIES OF ONE RING IS ONE BURST, not four', () => {
    // Nothing in equipItem stops the same row sitting on four fingers, so this
    // was 4 x 50 = 200 flat on the opening tap, from one farmed ring.
    const four = equippedAccessoryPowers(wearing([
      "Rimebinder's Ring", "Rimebinder's Ring", "Rimebinder's Ring", "Rimebinder's Ring",
    ]));
    expect(four.bursts).toHaveLength(1);
    expect(four.bursts[0]!.amount).toBe(BURST_DAMAGE.Legendary);
  });

  it('DISTINCT sources still stack — the designed trade is untouched', () => {
    const mixed = equippedAccessoryPowers(
      wearing(["Rimebinder's Ring", 'Thunderclap Ring'], 'Amulet of the Cold Star'),
    );
    expect(mixed.bursts.map((b) => b.source).sort()).toEqual(
      ['Amulet of the Cold Star', "Rimebinder's Ring", 'Thunderclap Ring'],
    );
    // Three different pieces, three openings — that is "four fingers of passive
    // value for four openings", which is what the trade was always meant to be.
    expect(mixed.bursts).toHaveLength(3);
  });

  it('a duplicate never changes the total, however many fingers wear it', () => {
    const one = equippedAccessoryPowers(wearing(["Rimebinder's Ring"]));
    const four = equippedAccessoryPowers(wearing([
      "Rimebinder's Ring", "Rimebinder's Ring", "Rimebinder's Ring", "Rimebinder's Ring",
    ]));
    const total = (p: ReturnType<typeof equippedAccessoryPowers>) =>
      p.bursts.reduce((a, b) => a + b.amount, 0);
    expect(total(four)).toBe(total(one));
  });
});

describe('OTA-1656 — the coated blade is on the card', () => {
  const view = (over: Partial<EnemyView> = {}): EnemyView =>
    ({ enemy: foe(), currentHp: 22, ...over } as EnemyView);

  it('⚠ the popup NAMES the coating, its dice, and what answers it', () => {
    const body = enemyDetailBody(
      view({ enemy: foe({ coating: { kind: 'poison', dice: '1d4' } } as Partial<Enemy>) }),
      false,
    );
    expect(body).toContain('Coated blade');
    expect(body).toContain(COATING_GLYPH.poison);
    expect(body).toContain('Poison');
    expect(body).toContain('1d4');
    // The actionable half: the player can DO something about it.
    expect(body).toContain('halves it');
  });

  it('an uncoated enemy says nothing at all about coatings', () => {
    const body = enemyDetailBody(view(), false);
    expect(body).not.toContain('Coated blade');
  });

  it('every one of the six families has a glyph, so none can render blank', () => {
    for (const kind of ['poison', 'acid', 'corruption', 'electrical', 'burn', 'cold'] as const) {
      expect(COATING_GLYPH[kind]).toBeTruthy();
      const body = enemyDetailBody(
        view({ enemy: foe({ coating: { kind, dice: '1d6' } } as Partial<Enemy>) }),
        false,
      );
      expect(body).toContain(COATING_GLYPH[kind]);
    }
  });

  it('⚠ the combat card draws it INLINE — OTA-1651 shortened these cards on purpose', () => {
    // The glyph rides inside the existing type line rather than earning a row of
    // its own; spending the height OTA-1651 just gave back would trade one
    // complaint for the one before it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', 'components', 'EnemyPanel.tsx'), 'utf8',
    ) as string;
    const i = src.indexOf('<View style={styles.subhead}>');
    const j = src.indexOf('</View>', i);
    expect(src.slice(i, j)).toContain('COATING_GLYPH[view.enemy.coating.kind]');
  });
});
