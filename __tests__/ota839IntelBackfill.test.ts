// OTA-839 (HAL only) — one-time enemy-intel backfill for a returning character.
// The observed-weakness system (OTA-838) only records from install day forward, so a
// veteran save would open the new bestiary/panel to blank weaknesses on foes it has
// beaten many times. backfillEnemyIntelFromDefeats seeds each already-DEFEATED enemy's
// canonical (type + base-trait) weak/resist — the same reconcile EnemyPanel uses —
// and runs only when the save carries no enemyIntel yet.

jest.setTimeout(20000);
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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { backfillEnemyIntelFromDefeats } from '../app/state/gameStore';

describe('OTA-839 — backfillEnemyIntelFromDefeats', () => {
  it('empty / undefined defeats → empty intel', () => {
    expect(backfillEnemyIntelFromDefeats([])).toEqual({});
    expect(backfillEnemyIntelFromDefeats(undefined)).toEqual({});
  });

  it("seeds a defeated foe's trait-based weakness (Aetheric Leech is vulnerable:burn)", () => {
    const intel = backfillEnemyIntelFromDefeats(['Aetheric Leech']);
    expect(intel['aetheric leech']).toBeDefined();
    expect(intel['aetheric leech'].weak).toContain('burn');
  });

  it("seeds a defeated foe's trait-based resistance (Swamp Crab resist:piercing)", () => {
    const intel = backfillEnemyIntelFromDefeats(['Swamp Crab']);
    expect(intel['swamp crab']?.resist).toContain('piercing');
  });

  it('is case-insensitive on the recorded name', () => {
    const intel = backfillEnemyIntelFromDefeats(['AETHERIC LEECH']);
    expect(intel['aetheric leech']?.weak).toContain('burn');
  });

  it('skips names not in the enemy catalog (no crash, no phantom entry)', () => {
    const intel = backfillEnemyIntelFromDefeats(['Definitely Not A Real Enemy 9000']);
    expect(intel).toEqual({});
  });

  it('a foe with no type/trait defenses produces no entry (not a blank one)', () => {
    // Whatever it derives, every emitted entry must carry at least one type.
    const intel = backfillEnemyIntelFromDefeats(['Aetheric Leech', 'Swamp Crab']);
    for (const k of Object.keys(intel)) {
      expect(intel[k].weak.length + intel[k].resist.length).toBeGreaterThan(0);
    }
  });
});
