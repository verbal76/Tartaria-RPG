// OTA-1192 — HP REGEN IS PER TILE, NOT PER ACTION.
//
// Owner: "I feel invincible in this playthrough — is it all the +5 AC armor stacking or
// the +2 regen on every action? would +2 regen per tile traveled be better? I'm never low
// in health except mid battle… it is starting to be a button masher."
//
// ⚠ MEASURED FROM HIS DEVICE LOG, NOT GUESSED. Enemies hit a FLAT 25% (`needs nat 16+ —
// AC capped`, so AC past ~20 does nothing), and the ~4 damage that lands after
// `armor −47%, plate −2` averages about 1 HP a round — against +2 a round of regen. He
// GAINED HP DURING FIGHTS. Across eight combats in one session he never fell below 26 of
// 32; the damage that actually landed all night was 1,1,2,3,3,4,4,5,5,6,6.
//
// Ticking on tile entry makes combat regen exactly ZERO — you do not walk mid-fight —
// while the road still mends you, so nobody is pushed back into rest-spam.

jest.setTimeout(30000);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/', cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
type MockSound = { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> };
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: () => Promise<{ sound: MockSound }> = jest.fn(async () => ({
        sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) },
      }));
    },
  },
}));

import { HP_REGEN_CAP } from '../app/engine/equipment';

import * as fs from 'fs';
import * as path from 'path';
const read = (...p: string[]): string => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');

/** The regen block, sliced from its own comment banner to the end of its set(). */
const regenBlock = (): string => {
  const i = STORE.indexOf('OTA-1192 — HP REGEN IS PER TILE NOW');
  expect(i).toBeGreaterThan(-1);
  return STORE.slice(i, i + 2600);
};

describe('OTA-1192 — regen no longer ticks on every action', () => {
  it('⚠ HP GAIN IS GATED ON CROSSING A TILE', () => {
    const b = regenBlock();
    expect(b).toContain('const crossedTile =');
    expect(b).toContain('const hpGain = crossedTile');
    // The un-gated form must be gone, or combat healing survives.
    expect(b).not.toMatch(/const hpGain = Math\.min\(regen\.hp/);
  });

  it('⚠ AND THAT MAKES COMBAT REGEN EXACTLY ZERO — you do not walk mid-fight', () => {
    // The gate compares the cell the player is standing on against the cell regen last
    // ticked on. Attacking, dodging and advancing never change the grid cell.
    const b = regenBlock();
    expect(b).toContain('_lastRegenCell !== cellNow');
  });

  it('⚠ STAMINA REGEN IS DELIBERATELY LEFT PER-ACTION', () => {
    // It was never the problem — stamina is barely a combat resource — and tile-gating it
    // would nerf the one pool tiles already drain.
    const b = regenBlock();
    expect(b).toContain('const stamGain = Math.min(regen.stamina');
    expect(b).not.toContain('crossedTile\n          ? Math.min(regen.stamina');
  });

  it('⚠ A RELOAD CANNOT FARM A TICK — null means "no tile crossed"', () => {
    // _lastRegenCell is transient. If a fresh load counted as a crossing, quitting and
    // reloading would be a free heal button.
    expect(STORE).toContain('let _lastRegenCell: string | null = null;');
    expect(regenBlock()).toContain('_lastRegenCell !== null &&');
  });

  it('the cap itself is untouched — this changes CADENCE, not amount', () => {
    // A tile still pays the full worn-gear regen, capped as before. OTA-1183 established
    // that 2 is the entire HP_REGEN_CAP; that is unchanged.
    expect(HP_REGEN_CAP).toBe(2);
    expect(regenBlock()).toContain('aggregateEquippedRegen(live)');
  });

  it('⚠ AND IT STILL RESPECTS THE HP CEILING', () => {
    // Regen must never overfill; the room calculation is the same one it always used.
    expect(regenBlock()).toContain('Math.max(0, (live.hpMax ?? 0) - live.hp)');
  });
});
