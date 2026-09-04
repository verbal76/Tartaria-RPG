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

// ⚠⚠⚠ OTA-1646 — THE SHIELD IS THE FIRST THING THE BLOW MEETS.
//
// Owner, reading the OTA-1645 shield work: *"I would imagine that we need all
// incoming hits to hit the shield first, that is its intended use, unless an
// enemy uses dodge or stealth then it rolls an RNG to go around it. this is
// counter for the way it is now where there is an RNG roll to see what piece of
// armor it hits."*
//
// He had spotted a real contradiction between two of his own requirements.
// `rollHitLocation` came from OTA-1513, which he asked for in these words: *"it
// will have to roll on each attack what piece of armor their attack lands on."*
// That table is a BODY — chest, legs, hands, feet, cloak, head. A shield cannot
// be in it, because shields are weapons held in a hand rather than armour slots.
// So every blow rolled a body location while the thing the player was holding up
// to stop it was never asked.
//
// The body table is not replaced; it is demoted to second. A shield answers
// first, and when the blow gets past it — or there is no shield — the weighted
// roll decides, exactly as before.

import { readFileSync } from 'node:fs';
import weaponsJson from '../app/data/items/weapons.json';
import {
  rollBlowLanding, shieldBypassChance, rollHitLocation, HIT_LOCATION_WEIGHTS,
  SHIELD_BYPASS_FLOOR,
} from '../app/engine/enemyCoating';

type Row = { name: string; tags: string[]; rarity: string; baseDurability?: number };
const WEAPONS = (weaponsJson as unknown as { weapons: Row[] }).weapons;
const SHIELDS = WEAPONS.filter((w) => (w.tags ?? []).includes('shield'));
const COMBAT_SRC = readFileSync('app/state/combatResolution.ts', 'utf8');

/** A deterministic roller: hands back the given numbers in order. */
const seq = (...ns: number[]) => {
  let i = 0;
  return () => ns[Math.min(i++, ns.length - 1)]!;
};

describe('OTA-1646 — the shield goes first', () => {
  // ── THE RULE ────────────────────────────────────────────────────────────
  it('a blow lands on the shield when one is up and the attacker is not slippery', () => {
    // ⚠ OTA-1656 — a `savage` brute now gets SHIELD_BYPASS_FLOOR (10%) like
    // every other attacker, so "the shield takes EVERY blow" became "the shield
    // takes nine in ten". Measured cause: 66 of 135 enemies carried no bypass
    // trait, so against half the bestiary armour NEVER chipped — not "lasted
    // longer", switched off. Any roll above the floor still lands on the shield,
    // which is the rule this test exists to hold.
    for (const r of [0.5, 0.9, 0.99]) {
      const landing = rollBlowLanding({ hasShield: true, traits: ['savage', 'armored'] }, seq(r));
      expect(landing.on).toBe('shield');
      expect(landing.slot).toBeNull();
    }
    // …and a roll UNDER the floor is the one blow in ten that reaches the body.
    const slipped = rollBlowLanding({ hasShield: true, traits: ['savage'] }, seq(0.01));
    expect(slipped.on).toBe('body');
    expect(slipped.wentAround).toBe(true);
  });

  it('no shield up means the OTA-1513 body table answers, unchanged', () => {
    const landing = rollBlowLanding({ hasShield: false, traits: ['agile'] }, seq(0));
    expect(landing.on).toBe('body');
    // The first row of the weighted table — the same answer rollHitLocation
    // gives for the same roll, which is the point: nothing moved for a player
    // with no shield.
    expect(landing.slot).toBe(rollHitLocation(seq(0)));
    expect(landing.wentAround).toBe(false);
  });

  // ── DODGE AND STEALTH GO AROUND IT ──────────────────────────────────────
  it('dodge and stealth are still the ways AROUND a raised shield', () => {
    expect(shieldBypassChance(['agile'])).toBeCloseTo(0.18);
    expect(shieldBypassChance(['ambush_strike'])).toBeCloseTo(0.15);
    expect(shieldBypassChance(['quick'])).toBeCloseTo(0.12);
    // ⚠ OTA-1656 — being big, angry or armoured is still not a WAY PAST a
    // shield; it just no longer means a guaranteed block. Everyone gets the
    // 10% floor (nobody holds a shield perfectly for a whole engagement), and
    // the three authored traits keep their whole meaning by sitting ABOVE it.
    for (const dull of [['savage', 'armored', 'slow', 'bleeder'], undefined, []]) {
      expect(shieldBypassChance(dull)).toBe(SHIELD_BYPASS_FLOOR);
    }
    for (const slippery of ['agile', 'ambush_strike', 'quick']) {
      expect(shieldBypassChance([slippery])).toBeGreaterThan(SHIELD_BYPASS_FLOOR);
    }
  });

  it('two ways of being slippery is still one attacker — the best, never the sum', () => {
    expect(shieldBypassChance(['agile', 'quick', 'ambush_strike'])).toBeCloseTo(0.18);
  });

  it('an agile foe gets around it on a low roll and is stopped on a high one', () => {
    const around = rollBlowLanding({ hasShield: true, traits: ['agile'] }, seq(0.05, 0));
    expect(around.on).toBe('body');
    expect(around.wentAround).toBe(true);

    const stopped = rollBlowLanding({ hasShield: true, traits: ['agile'] }, seq(0.9, 0));
    expect(stopped.on).toBe('shield');
  });

  it('the bypass roll is spent before the location roll, so the table is not biased', () => {
    // ⚠ If the location were rolled first and re-rolled on a bypass, the body
    // distribution would skew. The second number is the one the table reads.
    const a = rollBlowLanding({ hasShield: true, traits: ['agile'] }, seq(0.01, 0.99));
    expect(a.on).toBe('body');
    expect(a.slot).toBe(rollHitLocation(seq(0.99)));
  });

  // ── THE BODY TABLE IS UNTOUCHED ─────────────────────────────────────────
  it('the OTA-1513 weights still sum to a real distribution', () => {
    const total = HIT_LOCATION_WEIGHTS.reduce((n, r) => n + r.weight, 0);
    expect(total).toBe(100);
    expect(HIT_LOCATION_WEIGHTS.map((r) => r.slot)).toEqual(
      ['chest', 'legs', 'hands', 'feet', 'cloak', 'head'],
    );
  });

  // ── THE DURABILITY THAT MAKES IT SURVIVABLE ─────────────────────────────
  it('every shield carries authored durability — the default would shatter it', () => {
    // ⚠ THE REASON THIS IS IN THE SAME OTA. A shield that eats every blow spends
    // 1 durability per hit where a 6-piece set spent 1 across six pieces. At the
    // catalog default of 25 a Common buckler would be gone in 25 blows, which is
    // the OTA-959 failure ("a 5-piece set spent 5 durability per blow… shattered
    // in ~10 minutes") re-made on a single item.
    expect(SHIELDS.length).toBeGreaterThanOrEqual(15);
    for (const s of SHIELDS) {
      expect(s.baseDurability).toBeDefined();
      // ⚠ THE PARITY POINT, MEASURED. Wear used to spread uniformly over ~6 worn
      // slots, so a 25-durability piece survived 25 x 6 = 150 blows of exposure.
      // A shield that eats every blow must start there or it is a downgrade
      // dressed as a feature. (Owner: "maybe 150 durability? use mathematical
      // reasoning. make it a useful piece of equipment but can still be broken.")
      expect(s.baseDurability!).toBeGreaterThanOrEqual(150);
      // …and still breakable. Nothing here is an heirloom you never maintain.
      expect(s.baseDurability!).toBeLessThanOrEqual(400);
    }
  });

  it('the ladder matches the measured fight budget', () => {
    // 1402 blows over 92 fight segments in the owner's own logs = median 11 a
    // fight. With ~11% of blows bypassing to the body, D durability absorbs
    // D / 0.89 blows. Every tier must land inside a band that reads as
    // "maintained equipment" rather than "disposable" or "forever".
    const BYPASS = 0.11;
    const MEDIAN_BLOWS_PER_FIGHT = 11;
    for (const s of SHIELDS) {
      const fights = (s.baseDurability! / (1 - BYPASS)) / MEDIAN_BLOWS_PER_FIGHT;
      expect(fights).toBeGreaterThanOrEqual(12);
      expect(fights).toBeLessThanOrEqual(40);
    }
  });

  it('shield durability climbs with rarity', () => {
    const by = (r: string) => SHIELDS.filter((s) => s.rarity === r).map((s) => s.baseDurability!);
    const common = by('Common');
    const legendary = by('Legendary');
    expect(common.length).toBeGreaterThan(0);
    expect(legendary.length).toBeGreaterThan(0);
    expect(Math.max(...common)).toBeLessThan(Math.min(...legendary));
    // Every row of one rarity agrees with its siblings — no odd one out.
    for (const r of ['Common', 'Uncommon', 'Rare', 'Legendary']) {
      const vals = new Set(by(r));
      if (vals.size > 0) expect(vals.size).toBe(1);
    }
  });

  it('the shields are the only rows this OTA authored — the rest predate it', () => {
    // ⚠ My first draft of this asserted "no non-shield weapon has durability",
    // which was never true: 30 rows already carried authored values (the starter
    // weapons, the golem line, and the four OTA-1642 additions). Pinning the
    // COUNT is the assertion that actually guards the authoring pass — if a
    // later edit sprays durability across the catalog, this moves.
    const nonShieldWithDur = WEAPONS.filter(
      (w) => !(w.tags ?? []).includes('shield') && w.baseDurability !== undefined,
    );
    expect(nonShieldWithDur.length).toBe(30);
    // And none of them was given a shield-tier number by accident.
    expect(nonShieldWithDur.every((w) => w.baseDurability! <= 60)).toBe(true);
  });

  // ── WHAT THE SHIELD DOES NOT DO ─────────────────────────────────────────
  it('the shield never touches base damage — that is AC and BLOCK, not this', () => {
    // Owner: "base damage always hit." The landing roll decides WHERE a blow
    // lands, never whether it lands or for how much. Pinned on the source so a
    // later edit cannot quietly turn the shield into flat damage reduction:
    // nothing in the landing branch subtracts from `dmg`, it only ADDS the
    // coating splash (or adds nothing when the shield turns it aside).
    const from = COMBAT_SRC.indexOf('const landing = ecLanding.rollBlowLanding(');
    const to = COMBAT_SRC.indexOf('const wornSlots = ARMOR_SLOTS.filter(');
    const body = COMBAT_SRC.slice(from, to);
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    expect(body).not.toMatch(/dmg\s*-=/);
    expect(body).not.toMatch(/dmg\s*=\s*Math\.max\(0,\s*dmg\s*-/);
    // The only writes to dmg in the whole block are the two coating additions.
    expect((body.match(/dmg \+= coatDmg;/g) ?? []).length).toBe(2);
  });

  // ── THE SHAPE OF THE ANSWER ─────────────────────────────────────────────
  it('a shield landing carries no body slot, and a body landing always does', () => {
    const onShield = rollBlowLanding({ hasShield: true, traits: [] }, seq(0.5));
    expect(onShield.slot).toBeNull();
    const onBody = rollBlowLanding({ hasShield: false, traits: [] }, seq(0.5));
    expect(onBody.slot).toBeTruthy();
    expect(HIT_LOCATION_WEIGHTS.some((r) => r.slot === onBody.slot)).toBe(true);
  });
});
