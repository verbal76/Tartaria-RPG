// OTA 043 — Audit-flagged test gap: corruption tier price markup
// applied on BUY only. Verifies:
//   - corruptionPriceMultiplier returns the right factor per tier
//   - buyFromVendor charges the markup-inclusive total
//   - sellToVendor is NOT affected by corruption (vendors don't pay
//     extra because you're corrupted)
//   - Clean players see no markup

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
import { corruptionTierOf, corruptionPriceMultiplier } from '../app/engine/corruption';

describe('OTA 043 — corruption price markup', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  // ── Unit-level multiplier ────────────────────────────────────
  describe('corruptionPriceMultiplier', () => {
    it('clean (corruption ≤ 10): 1.0 multiplier (no markup)', () => {
      expect(corruptionPriceMultiplier(corruptionTierOf(0))).toBe(1);
      expect(corruptionPriceMultiplier(corruptionTierOf(10))).toBe(1);
    });
    it('tainted (11-30): 1.0 multiplier (encounters spike, prices unchanged)', () => {
      expect(corruptionPriceMultiplier(corruptionTierOf(15))).toBe(1);
      expect(corruptionPriceMultiplier(corruptionTierOf(30))).toBe(1);
    });
    it('corrupted (31-60): 1.15 markup', () => {
      expect(corruptionPriceMultiplier(corruptionTierOf(45))).toBeCloseTo(1.15);
      expect(corruptionPriceMultiplier(corruptionTierOf(60))).toBeCloseTo(1.15);
    });
    it('hollowed (61+): 1.30 markup', () => {
      expect(corruptionPriceMultiplier(corruptionTierOf(75))).toBeCloseTo(1.3);
      expect(corruptionPriceMultiplier(corruptionTierOf(120))).toBeCloseTo(1.3);
    });
  });

  // ── Integration: buyFromVendor ───────────────────────────────
  async function setupVendor(corruption: number) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Buyer', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        vendor: {
          id: 'corr_test_vendor',
          name: 'Test Merchant',
          faction: 'reclaimers_guild',
          offers: [{ itemName: 'Rusted Blade', price: 100 }],
          greeting: '"Wares."',
        } as any,
      },
      // OTA-1341 — zero the standing ladder so this suite keeps testing its own
      // multiplier in isolation (a fresh character is Known +10 with their own
      // guild, which now takes 5% off at that guild's counter — the ladder has
      // its own suite, ota1341StandingLadder).
      player: { ...p0, tc: 1000, corruption, factionStanding: [] },
    });
    return store;
  }

  it('clean player pays the base price (100 TC)', async () => {
    const store = await setupVendor(0);
    const tcBefore = store.getState().player!.tc;
    store.getState().buyFromVendor('Rusted Blade');
    const tcAfter = store.getState().player!.tc;
    expect(tcBefore - tcAfter).toBe(100);
  });

  it('corrupted player pays +15% (115 TC)', async () => {
    const store = await setupVendor(45);
    const tcBefore = store.getState().player!.tc;
    store.getState().buyFromVendor('Rusted Blade');
    const tcAfter = store.getState().player!.tc;
    expect(tcBefore - tcAfter).toBe(115);
  });

  it('hollowed player pays +30% (130 TC)', async () => {
    const store = await setupVendor(80);
    const tcBefore = store.getState().player!.tc;
    store.getState().buyFromVendor('Rusted Blade');
    const tcAfter = store.getState().player!.tc;
    expect(tcBefore - tcAfter).toBe(130);
  });

  it('tainted player pays no markup (encounters scale, prices do not)', async () => {
    const store = await setupVendor(20);
    const tcBefore = store.getState().player!.tc;
    store.getState().buyFromVendor('Rusted Blade');
    const tcAfter = store.getState().player!.tc;
    expect(tcBefore - tcAfter).toBe(100);
  });

  it('insufficient TC at hollowed markup is rejected with the markup-aware message', async () => {
    const store = await setupVendor(80);
    // Set TC to 120 — less than 130 needed (base 100 × 1.30 = 130).
    // Note: unknowing_mass starts with a Rusted Blade in the kit, so
    // count Rusted Blade entries before/after rather than checking presence.
    const p0 = store.getState().player!;
    const bladeCountBefore = p0.inventory.filter((i) => i.name === 'Rusted Blade').length;
    store.setState({ player: { ...p0, tc: 120 } });

    store.getState().buyFromVendor('Rusted Blade');

    // Purchase should NOT have completed — TC unchanged.
    expect(store.getState().player!.tc).toBe(120);
    // Inventory count unchanged.
    const bladeCountAfter = store.getState().player!.inventory.filter((i) => i.name === 'Rusted Blade').length;
    expect(bladeCountAfter).toBe(bladeCountBefore);
    // Log mentions the corruption markup.
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/corruption markup/);
  });

  // ── SELL must NOT be markup-adjusted ─────────────────────────
  // unknowing_mass starts with Rusted Blade equipped, so sellToVendor
  // bails on that name. Use an Aether Crystal (not in starting kit,
  // not equippable as a slot item) so the sale path actually runs.
  it('selling at hollowed tier pays the same as selling clean (no markup on sell side)', async () => {
    const runSale = async (corruption: number): Promise<number> => {
      const store = await setupVendor(corruption);
      const p = store.getState().player!;
      store.setState({
        player: {
          ...p,
          inventory: [
            ...p.inventory,
            { id: `sell_xtal_${corruption}`, name: 'Aether Crystal', kind: 'misc', quantity: 1, tags: ['aether', 'crystal'] },
          ],
        },
      });
      const before = store.getState().player!.tc;
      store.getState().sellToVendor('Aether Crystal');
      return store.getState().player!.tc - before;
    };

    const cleanGained = await runSale(0);
    const hollowedGained = await runSale(80);

    // Sale must have completed in both states.
    expect(cleanGained).toBeGreaterThan(0);
    expect(hollowedGained).toBeGreaterThan(0);
    // Hollowed sale must not pay more (or less) than clean — vendors
    // don't reward corruption with sell-side bonuses.
    expect(hollowedGained).toBe(cleanGained);
  });
});
