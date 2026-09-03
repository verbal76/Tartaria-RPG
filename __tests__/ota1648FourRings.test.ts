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

// ⚠⚠⚠ OTA-1648 — A FOURTH RING, AND THE LIST THAT MADE IT A 30-SITE EDIT.
//
// Owner: *"we need to be able to wear up to four rings at a time."*
//
// Adding `ring4` to `PlayerEquipped` was one line. The other THIRTY were the
// work, and they are the reason this is an OTA rather than a one-liner: the
// literal `['ring', 'ring2', 'ring3']` had been written out BY HAND across 13
// files — the stat sum, the AC sum, the HP breakdown, the fallen ledger, the
// revenant loot priority, two fuse-protection id lists, the vendor repair list,
// the drop guard, the equip router, and four places in the inventory screen.
//
// Every one of them had to agree. A single missed list is a ring that is worn
// but not counted, or counted but not droppable, or greyed out in the UI while
// the equip router is perfectly willing to fill it. So the list moved to
// `RING_SLOTS` / `RING_ID_KEYS` in equipment.ts and all 30 sites read it. A
// fifth ring is now one edit.

import { readFileSync } from 'node:fs';
import ringsJson from '../app/data/items/rings.json';
import {
  RING_SLOTS, RING_ID_KEYS, MAX_RINGS, equippedGearAc, standingAc,
} from '../app/engine/equipment';
import type { PlayerCharacter } from '../app/engine/types';

type Ring = { name: string; acBonus?: number };
const RINGS = (ringsJson as unknown as { rings: Ring[] }).rings;
const AC_RINGS = RINGS.filter((r) => (r.acBonus ?? 0) > 0);

const mk = (equipped: Record<string, string>): PlayerCharacter =>
  ({ name: 'T', ac: 10, equipped, inventory: [], statusEffects: [] } as unknown as PlayerCharacter);

describe('OTA-1648 — four rings, and one list that says so', () => {
  // ── THE ASK ─────────────────────────────────────────────────────────────
  it('a player may wear four rings', () => {
    expect(MAX_RINGS).toBe(4);
    expect(RING_SLOTS).toEqual(['ring', 'ring2', 'ring3', 'ring4']);
    expect(RING_ID_KEYS).toEqual(['ringId', 'ring2Id', 'ring3Id', 'ring4Id']);
    expect(RING_ID_KEYS.length).toBe(RING_SLOTS.length);
  });

  it('the legacy slot keeps its unnumbered name — every save on every device has it', () => {
    // ⚠ Renaming `ring` to `ring1` for tidiness would orphan the ring every
    // existing player is currently wearing. The ugly name is the compatible one.
    expect(RING_SLOTS[0]).toBe('ring');
    expect(RING_ID_KEYS[0]).toBe('ringId');
  });

  it('all four rings are COUNTED, not just wearable', () => {
    // The failure this OTA exists to prevent: a ring worn on a finger no sum
    // walks. Four AC rings must be worth four times one.
    expect(AC_RINGS.length).toBeGreaterThan(0);
    const one = mk({ ring: AC_RINGS[0]!.name });
    const four: Record<string, string> = {};
    RING_SLOTS.forEach((k, i) => { four[k] = AC_RINGS[i % AC_RINGS.length]!.name; });
    const per = equippedGearAc(one).accessories;
    expect(per).toBeGreaterThan(0);
    expect(equippedGearAc(mk(four)).accessories).toBe(per * MAX_RINGS);
    expect(standingAc(mk(four)) - standingAc(mk({}))).toBe(per * MAX_RINGS);
  });

  it('the fourth ring is not smuggled in as armour or a shield', () => {
    const four: Record<string, string> = {};
    RING_SLOTS.forEach((k, i) => { four[k] = AC_RINGS[i % AC_RINGS.length]!.name; });
    const gear = equippedGearAc(mk(four));
    expect(gear.worn).toBe(0);
    expect(gear.shield).toBe(0);
  });

  // ── THE LIST THAT WAS THE REAL WORK ─────────────────────────────────────
  it('no file writes the ring list out by hand any more', () => {
    // ⚠ THE RATCHET. This is the assertion that keeps a fifth ring cheap and
    // stops the 30-site drift returning. Comments may still QUOTE the old
    // literal (the OTA notes do, deliberately); code may not.
    const FILES = [
      'app/engine/equipment.ts', 'app/engine/contextInjector.ts',
      'app/engine/hpBreakdown.ts', 'app/engine/fallenRevenants.ts',
      'app/engine/fallenLedger.ts', 'app/state/combatResolution.ts',
      'app/state/gameStore.ts', 'app/state/slices/inventorySlice.ts',
      'app/state/slices/craftingSlice.ts', 'app/state/slices/vendorSlice.ts',
      'app/screens/InventoryScreen.tsx', 'app/screens/ExplorationScreen.tsx',
    ];
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = readFileSync(f, 'utf8');
      src.split('\n').forEach((line, i) => {
        const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
        if (!code.trim()) return;
        // ⚠ The DECLARATION of the constants is the one place the literal
        // belongs — that is the whole point of having them. Exempt it by name
        // rather than by file, so a stray hand-written list elsewhere in
        // equipment.ts is still caught.
        if (/export const (RING_SLOTS|RING_ID_KEYS)\b/.test(code)) return;
        // A hand-written enumeration of the numbered slots or their id keys.
        if (/'ring2'\s*,\s*'ring3'/.test(code) || /'ring2Id'\s*,\s*'ring3Id'/.test(code)) {
          offenders.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every ring slot has an id key beside it, positionally', () => {
    RING_SLOTS.forEach((slot, i) => {
      const idKey = RING_ID_KEYS[i]!;
      // 'ring' → 'ringId', 'ring2' → 'ring2Id' …
      expect(idKey).toBe(`${slot}Id`);
    });
  });

  // ── BACK-COMPAT ─────────────────────────────────────────────────────────
  it('a save that predates the fourth finger simply has an empty one', () => {
    // No migration: an absent ring4 reads as an unworn slot, which is exactly
    // what it is. Wearing three still sums to three.
    const three: Record<string, string> = {};
    RING_SLOTS.slice(0, 3).forEach((k, i) => { three[k] = AC_RINGS[i % AC_RINGS.length]!.name; });
    const per = equippedGearAc(mk({ ring: AC_RINGS[0]!.name })).accessories;
    expect(equippedGearAc(mk(three)).accessories).toBe(per * 3);
  });

  it('wearing no rings is still zero', () => {
    expect(equippedGearAc(mk({})).accessories).toBe(0);
    expect(standingAc(mk({}))).toBe(10);
  });
});
