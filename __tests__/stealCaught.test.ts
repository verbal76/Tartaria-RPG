// OTA 043 — Audit-flagged test gap: caught-steal → fight transition.
// A failed steal at gameStore.ts:7660-7696 has to do four things:
//   1. clear scene.vendor (so the vendor screen goes away)
//   2. inject a buildTraderEnemy into scene.enemies
//   3. dock the vendor's faction by -10 rep
//   4. record a memorable event
// This test forces a failure by pinning the d20 roll to 1 via
// Math.random, then verifies all four post-conditions.

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
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';

describe('OTA 043 — caught steal → fight transition', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('failed steal clears vendor, injects enemy, docks -10 rep, records memorable event', async () => {
    // Pin Math.random to 0 — rollDie(20) becomes Math.floor(0 * 20) + 1 = 1,
    // guaranteeing a failed roll against any DC.
    const rng = jest.spyOn(Math, 'random').mockReturnValue(0);

    try {
      const store = useGameStore;
      await store.getState().hydrate();
      await store.getState().startNewGame({ name: 'Thief', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
      store.getState().skipTutorial?.();

      // Manufacture a hub vendor scene (no demeanor → DC 16, faction loss applies).
      const p0 = store.getState().player!;
      const standingBefore = p0.factionStanding.find((f) => f.factionId === 'reclaimers_guild')?.standing ?? 0;
      store.setState({
        currentScene: {
          ...store.getState().currentScene!,
          vendor: {
            id: 'hub_vendor_test',
            name: 'Sera the Quartermaster',
            faction: 'reclaimers_guild',
            offers: [{ itemName: 'Rusted Blade', price: 12 }],
            greeting: '"Tools or trouble?"',
          } as any,
          enemies: [],
          enemyHps: [],
        },
        player: {
          ...p0,
          stats: { ...p0.stats, dexterity: 1 }, // DEX 1 + d20 of 1 = 2 vs DC 16 → caught
        },
      });

      store.getState().stealFromVendor('Rusted Blade');

      const afterScene = store.getState().currentScene!;
      const afterPlayer = store.getState().player!;

      // 1. vendor cleared
      expect(afterScene.vendor).toBeNull();
      // 2. trader enemy spawned
      expect(afterScene.enemies?.length).toBeGreaterThan(0);
      expect(afterScene.enemyHps?.length).toBe(afterScene.enemies?.length);
      // 3. rep dropped by 10
      const standingAfter = afterPlayer.factionStanding.find((f) => f.factionId === 'reclaimers_guild')?.standing ?? 0;
      expect(standingAfter).toBe(standingBefore - 10);
      // 4. log line shows the caught roll AND a memorable-event was filed
      const logs = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(logs).toMatch(/✗ CAUGHT/);
      expect(logs).toMatch(/Thief!/);
    } finally {
      rng.mockRestore();
    }
  });

  it('successful steal removes the offer from the list, no enemy spawn, no rep loss', async () => {
    // Math.random = 0.99 → rollDie(20) = 20. Sketchy vendor DC 11 + DEX 15 ≈ guaranteed pass.
    const rng = jest.spyOn(Math, 'random').mockReturnValue(0.99);

    try {
      const store = useGameStore;
      await store.getState().hydrate();
      await store.getState().startNewGame({ name: 'NimbleThief', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
      store.getState().skipTutorial?.();

      const p0 = store.getState().player!;
      const standingBefore = p0.factionStanding.find((f) => f.factionId === 'reclaimers_guild')?.standing ?? 0;
      store.setState({
        currentScene: {
          ...store.getState().currentScene!,
          vendor: {
            id: 'roadside_sketchy_test',
            name: 'Hooked Fence',
            faction: 'reclaimers_guild',
            offers: [{ itemName: 'Rusted Blade', price: 8 }],
            greeting: '"Mind your business or make some."',
            demeanor: 'sketchy',
          } as any,
        },
        player: {
          ...p0,
          stats: { ...p0.stats, dexterity: 15 },
        },
      });

      store.getState().stealFromVendor('Rusted Blade');

      const afterScene = store.getState().currentScene!;
      const afterPlayer = store.getState().player!;

      // Vendor remains, but the stolen offer is gone.
      expect(afterScene.vendor).not.toBeNull();
      expect(afterScene.vendor!.offers.some((o) => o.itemName === 'Rusted Blade')).toBe(false);
      // No combat triggered.
      expect(afterScene.enemies?.length ?? 0).toBe(0);
      // No rep change.
      const standingAfter = afterPlayer.factionStanding.find((f) => f.factionId === 'reclaimers_guild')?.standing ?? 0;
      expect(standingAfter).toBe(standingBefore);
      // Player got the item.
      expect(afterPlayer.inventory.some((i) => i.name === 'Rusted Blade')).toBe(true);
    } finally {
      rng.mockRestore();
    }
  });
});
