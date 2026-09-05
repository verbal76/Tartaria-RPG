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

// ⚠⚠⚠ OTA-1645 (slice 4b, task #98 unit 2 of 3) — THE SHIELD'S AC IS REAL.
//
// Seven shields print "+N AC" on the card. Not one point of it has ever reached
// the number an enemy rolls against. This was MEASURED before a line was
// written: a probe equipping the Titan Shield ("+4 AC", the priciest shield in
// the game) read `standingAc = 10` — identical to an empty off-hand — while a
// chest piece in the control read 13.
//
// The cause is structural rather than arithmetic. `equippedGearAc` walks
// ARMOR_SLOTS (head / chest / hands / legs / feet / cloak); shields are WEAPONS
// that equip to a hand, so no AC reader in the game has ever had one in view.
// What the shields DID have — a `defense` number feeding the BLOCK roll, and a
// `statBonuses` HP grant — both worked, which is exactly why this survived: a
// shield was doing two of the three things on its card, so it read as
// underwhelming rather than broken.
//
// ⚠ The fix goes in `equippedGearAc` and nowhere else, because `aggregateArmor`
// (the resolver's source) and `standingAc` (the sheet's) both call it. That is
// the whole point of OTA-1133/1135 — one answer, everywhere — and adding a
// shield term at any call site instead would put the sheet and the fight back
// out of step, which is the bug those OTAs were written to end.

import weaponsJson from '../app/data/items/weapons.json';
import { standingAc, equippedGearAc, heldShieldAc } from '../app/engine/equipment';
import { parseWeaponEffect, shieldAcVersus } from '../app/engine/weaponEffects';
import { getItemPreview } from '../app/components/itemPreview';
import type { PlayerCharacter } from '../app/engine/types';

type Row = { name: string; tags: string[]; rarity: string; effect?: string };
const WEAPONS = (weaponsJson as unknown as { weapons: Row[] }).weapons;

const mk = (equipped: Record<string, string>): PlayerCharacter =>
  ({ name: 'Test', ac: 10, equipped, inventory: [], statusEffects: [] } as unknown as PlayerCharacter);

/** The five shields whose "+N AC" carries no qualifier, and what they promise. */
const FLAT: ReadonlyArray<readonly [string, number]> = [
  ['Bone Round Shield', 2],
  ['Giant Bone Shield', 3],
  ['Titan Shield', 4],
  ['Mud Royal Shield', 3],
  ["Mud Emperor's Buckler", 3],
];

describe('OTA-1645 — the shield AC on the card is the shield AC in the fight', () => {
  // ── THE PROMISE, KEPT ───────────────────────────────────────────────────
  it.each(FLAT)('%s adds its printed +%i to standing AC', (name, amount) => {
    const bare = standingAc(mk({}));
    const held = standingAc(mk({ off: name }));
    expect(held - bare).toBe(amount);
  });

  it('the AC arrives through the one function the sheet AND the resolver read', () => {
    // ⚠ This is the assertion that keeps the panel and the fight in step. If a
    // later edit adds shield AC at a call site instead of here, `standingAc`
    // and `aggregateArmor` drift and the player is defended at a number the
    // card never showed — the OTA-1135 defect, re-made.
    const gear = equippedGearAc(mk({ off: 'Titan Shield' }));
    expect(gear.shield).toBe(4);
    expect(gear.worn).toBe(0);        // it is NOT smuggled in as armour
    expect(gear.accessories).toBe(0); // nor as jewellery
  });

  it('the card says what the fight does', () => {
    const p = getItemPreview('Titan Shield');
    expect(p.stats.some((s) => /AC \+4 while held/.test(s))).toBe(true);
  });

  // ── THE CONDITIONAL HALF ────────────────────────────────────────────────
  it('a typed shield is worth its points against its own damage type and nothing else', () => {
    const heater = parseWeaponEffect(
      WEAPONS.find((w) => w.name === 'Mud Heater Shield')!.effect,
    )?.shieldAc;
    expect(shieldAcVersus(heater, 'burn')).toBe(2);
    expect(shieldAcVersus(heater, 'slashing')).toBe(0);
    expect(shieldAcVersus(heater, null)).toBe(0);

    const aetheric = parseWeaponEffect(
      WEAPONS.find((w) => w.name === 'Aetheric Shield')!.effect,
    )?.shieldAc;
    // "Deflects energy attacks; +2 AC vs energy damage" — energy is the aether
    // and what it drives.
    expect(shieldAcVersus(aetheric, 'aetheric')).toBe(2);
    expect(shieldAcVersus(aetheric, 'electrical')).toBe(2);
    expect(shieldAcVersus(aetheric, 'burn')).toBe(2);
    expect(shieldAcVersus(aetheric, 'piercing')).toBe(0);
  });

  it('a typed shield adds NOTHING to standing AC — it is not a flat bonus in disguise', () => {
    for (const n of ['Mud Heater Shield', 'Aetheric Shield']) {
      expect(standingAc(mk({ off: n }))).toBe(standingAc(mk({})));
      expect(heldShieldAc(mk({ off: n })).flat).toBe(0);
      expect(heldShieldAc(mk({ off: n })).vs).not.toBeNull();
    }
  });

  // ── WHAT MUST NOT MOVE ──────────────────────────────────────────────────
  it('a TIMED AC is refused — the Shield-Hammer does not get a permanent +2', () => {
    // "+2 AC for 1 round after a hit" is a status write on the player's own
    // attack path, not a passive the gear stack can hold. Reading it here would
    // hand a two-handed hammer a standing +2 it never promised.
    const row = WEAPONS.find((w) => w.name === 'Aetheric Shield-Hammer')!;
    expect(row.effect).toMatch(/\+2 AC for 1 round/);
    expect(parseWeaponEffect(row.effect)?.shieldAc).toBeUndefined();
    expect(standingAc(mk({ main: 'Aetheric Shield-Hammer' }))).toBe(standingAc(mk({})));
  });

  it('a shield with no AC clause still adds none', () => {
    for (const n of ['Iron Buckler', 'Mud Buckler', 'Mud Spiked Shield', 'Shockwave Buckler']) {
      expect(standingAc(mk({ off: n }))).toBe(standingAc(mk({})));
    }
  });

  it('an ordinary weapon in hand adds no AC', () => {
    for (const n of ['Magnetic Axe', 'Plasma Knife', 'Bone Sword']) {
      expect(standingAc(mk({ off: n }))).toBe(standingAc(mk({})));
      expect(standingAc(mk({ main: n }))).toBe(standingAc(mk({})));
    }
  });

  it('two shields are one shield of cover, not two', () => {
    // You can only put one shield between yourself and a blow.
    const both = standingAc(mk({ main: 'Bone Round Shield', off: 'Titan Shield' }));
    expect(both - standingAc(mk({}))).toBe(4);
  });

  // ── THE AUDIT ───────────────────────────────────────────────────────────
  it('every "+N AC" in the catalog is now read by something', () => {
    // The slice-4 rule: a number printed on a card must reach the engine, or
    // the card must stop printing it. The only licensed exception is a clause
    // the parser deliberately refuses as timed/earned, and there is exactly one.
    const withAc = WEAPONS.filter((w) => /\+\s*\d+\s*AC\b/i.test(w.effect ?? ''));
    expect(withAc.length).toBeGreaterThanOrEqual(8);
    const unread = withAc.filter((w) => !parseWeaponEffect(w.effect)?.shieldAc);
    // ⚠ OTA-1676 (slice 4c) — every timed "+N AC" is read now, just not HERE:
    // a guard you earn by swinging is a status on the wielder, not a passive
    // the gear stack holds, so it rides `selfBuff` (guard). This list is the
    // proof the two readers do not overlap — each of these four has a selfBuff
    // and no shieldAc, and the Shield-Hammer waited for exactly this.
    expect(unread.map((w) => `${w.name}: ${w.effect}`)).toEqual([
      'Aetheric Shield-Hammer: +2 AC for 1 round after a hit. Grants +15 HP.',
      'Lightfoot Dash Wand: Quick as light — +3 AC for 2 rounds, on use.',
      'Displace Aether Scepter: 1d10 aetheric; you blink out of reach — +4 AC for 2 rounds after a hit.',
      'Shadow Caller Stave: 2d8 aetheric; you step into shadow — +3 AC for 1 round after a hit.',
    ]);
    for (const w of unread) expect(parseWeaponEffect(w.effect)?.selfBuff?.kind).toBe('guard');
  });
});
