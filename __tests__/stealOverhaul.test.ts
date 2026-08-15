// OTA 23-009 — Regression tests for the steal overhaul:
//   - Stolen items carry a per-instance stolen=true flag
//   - sellToVendor refuses items flagged stolen
//   - Stolen item stays its own row (not merged into clean stacks)
//   - Scrapping a stolen item yields clean (non-stolen) outputs
//   - Each steal attempt against a vendor bumps the streak counter
//     by 1; each point adds +2 to the next steal's DC

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

async function setupSketchyVendor() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Pilferer', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  store.setState({
    currentScene: {
      ...store.getState().currentScene!,
      vendor: {
        id: 'sketchy_vendor',
        name: 'Hooked Fence',
        faction: 'reclaimers_guild',
        offers: [
          { itemName: 'Rusted Blade', price: 8 },
          { itemName: 'Climbing Rope', price: 6 },
          { itemName: 'Trail Rations', price: 4 },
          { itemName: 'Wild Onion', price: 3 },
        ],
        greeting: '"Mind your business or make some."',
        demeanor: 'sketchy',
      } as any,
    },
    player: { ...p0, stats: { ...p0.stats, dexterity: 18 } }, // can't fail an early steal
  });
  return store;
}

describe('OTA 23-009 — steal overhaul', () => {
  let rngSpy: jest.SpyInstance;
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });
  beforeEach(() => {
    // Pin d20 high so success is reliable across the streak (each
    // streak point adds +2 DC; with DEX 18 we can still pass DC 19+
    // on a high d20).
    rngSpy = jest.spyOn(Math, 'random').mockReturnValue(0.95);
  });
  afterEach(() => {
    rngSpy.mockRestore();
  });

  describe('stolen flag', () => {
    it('a stolen item has stolen=true on its instance', async () => {
      const store = await setupSketchyVendor();
      // Wild Onion isn't in any starter kit, so the stolen instance
      // is the only Wild Onion in pack after the lift.
      store.getState().stealFromVendor('Wild Onion');
      const stolen = store.getState().player!.inventory.find((i) => i.name === 'Wild Onion');
      expect(stolen?.stolen).toBe(true);
    });

    it('stolen instance pushes its own row, does NOT merge into a clean stack', async () => {
      const store = await setupSketchyVendor();
      // Plant a clean Wild Onion in pack first.
      const p = store.getState().player!;
      store.setState({
        player: {
          ...p,
          inventory: [
            ...p.inventory,
            { id: 'clean_onion', name: 'Wild Onion', kind: 'consumable', quantity: 2, tags: ['food'] },
          ],
        },
      });
      store.getState().stealFromVendor('Wild Onion');
      // Two rows now: the clean stack (stolen=undefined) and the
      // stolen instance (stolen=true). Stack quantity unchanged.
      const onionRows = store.getState().player!.inventory.filter((i) => i.name === 'Wild Onion');
      expect(onionRows.length).toBe(2);
      const clean = onionRows.find((r) => r.id === 'clean_onion');
      const stolen = onionRows.find((r) => r.id !== 'clean_onion');
      expect(clean?.quantity).toBe(2);
      expect(clean?.stolen).toBeFalsy();
      expect(stolen?.quantity).toBe(1);
      expect(stolen?.stolen).toBe(true);
    });
  });

  describe('sellToVendor refuses stolen items per instance', () => {
    it('refuses to buy back a stolen Wild Onion', async () => {
      // ⚠ OTA-1083 — a SKETCHY vendor is a fence now and BUYS hot goods at
      // the cut (its own suite covers that), so the refusal this test asserts
      // belongs to the honest/hub tiers. Flip the vendor honest after the
      // steal: the per-instance refusal — the claim under test — is unchanged
      // there, word for word.
      const store = await setupSketchyVendor();
      store.getState().stealFromVendor('Wild Onion');
      const scHonest = store.getState().currentScene!;
      store.setState({ currentScene: { ...scHonest, vendor: { ...scHonest.vendor!, demeanor: 'honest' } } });
      const tcBefore = store.getState().player!.tc;
      store.getState().sellToVendor('Wild Onion');
      const after = store.getState().player!;
      // Sale should not have completed: TC unchanged, item still in pack.
      expect(after.tc).toBe(tcBefore);
      expect(after.inventory.some((i) => i.name === 'Wild Onion' && i.stolen)).toBe(true);
      const logs = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(logs).toMatch(/That's mine|don't put it on my table/);
    });

    it('lets the player sell a CLEAN copy when both clean and stolen exist', async () => {
      const store = await setupSketchyVendor();
      const p = store.getState().player!;
      // Plant a clean Wild Onion in pack BEFORE the steal.
      store.setState({
        player: {
          ...p,
          inventory: [
            ...p.inventory,
            { id: 'clean_onion', name: 'Wild Onion', kind: 'consumable', quantity: 1, tags: ['food'] },
          ],
        },
      });
      store.getState().stealFromVendor('Wild Onion');
      // sellToVendor finds the first matching item by name. The
      // clean row was inserted FIRST so it should be the one sold.
      // The stolen row stays in inventory.
      const tcBefore = store.getState().player!.tc;
      store.getState().sellToVendor('Wild Onion');
      const after = store.getState().player!;
      expect(after.tc).toBeGreaterThan(tcBefore);
      // Stolen instance still in pack.
      expect(after.inventory.some((i) => i.name === 'Wild Onion' && i.stolen)).toBe(true);
    });
  });

  describe('scrap launders the stolen flag', () => {
    // OTA 23-014 made scrap roll for success (70% base + INT/DEX
    // modifiers). The two laundering tests below need the scrap
    // to actually produce materials, so force-stub Math.random
    // to 0 for the duration — guarantees the success branch
    // every roll. Restored after each test so other tests run
    // with real entropy.
    let mathRandomSpy: jest.SpyInstance<number, []> | null = null;
    beforeEach(() => {
      mathRandomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    });
    afterEach(() => {
      mathRandomSpy?.mockRestore();
      mathRandomSpy = null;
    });
    it('scrapping a stolen weapon yields clean (non-stolen) scrap', async () => {
      const store = await setupSketchyVendor();
      // Clear all Rusted Blades + any pre-existing scrap output so we
      // can cleanly observe the scrap's flag state after the lift.
      const p = store.getState().player!;
      store.setState({
        player: {
          ...p,
          // OTA-348 — vendor theft rolls STEALTH (not DEX). With Math.random
          // mocked to 0 the d20 lands on 1, so the lift only clears the DC-11
          // sketchy stall if stealth is high; 30 guarantees success at the worst
          // roll while random=0 still passes the later scrap-success check.
          stats: { ...p.stats, stealth: 30 },
          equipped: {},
          inventory: p.inventory.filter(
            (i) => i.name !== 'Rusted Blade' && i.name !== 'Scrap Metal',
          ),
        },
      });
      store.getState().stealFromVendor('Rusted Blade');
      const stolen = store.getState().player!.inventory.find((i) => i.stolen && i.name === 'Rusted Blade');
      expect(stolen).toBeDefined();
      store.getState().scrapInventoryItem(stolen!.name);
      const after = store.getState().player!;
      expect(after.inventory.some((i) => i.id === stolen!.id)).toBe(false);
      // Scrap should have produced Scrap Metal. It's a fresh row
      // since we cleared any existing scrap above.
      const newScrap = after.inventory.find((i) => i.name === 'Scrap Metal');
      expect(newScrap).toBeDefined();
      expect(newScrap?.stolen).toBeFalsy();
    });

    it('the laundered scrap can be sold to a vendor', async () => {
      const store = await setupSketchyVendor();
      const p = store.getState().player!;
      store.setState({
        player: {
          ...p,
          // OTA-348 — see note above: stealth drives the steal roll now.
          stats: { ...p.stats, stealth: 30 },
          equipped: {},
          inventory: p.inventory.filter(
            (i) => i.name !== 'Rusted Blade' && i.name !== 'Scrap Metal',
          ),
        },
      });
      store.getState().stealFromVendor('Rusted Blade');
      const stolen = store.getState().player!.inventory.find((i) => i.stolen && i.name === 'Rusted Blade');
      store.getState().scrapInventoryItem(stolen!.name);
      const newScrap = store.getState().player!.inventory.find((i) => i.name === 'Scrap Metal');
      expect(newScrap).toBeDefined();
      // Vendor needs to accept Scrap Metal as a sellable item.
      const tcBefore = store.getState().player!.tc;
      store.getState().sellToVendor('Scrap Metal');
      const after = store.getState().player!.tc;
      expect(after).toBeGreaterThan(tcBefore);
    });
  });

  describe('streak DC penalty', () => {
    it('vendor.stealAttempts increments per attempt (success or caught)', async () => {
      const store = await setupSketchyVendor();
      expect(store.getState().currentScene?.vendor?.stealAttempts).toBeFalsy();
      store.getState().stealFromVendor('Rusted Blade');
      expect(store.getState().currentScene?.vendor?.stealAttempts).toBe(1);
      store.getState().stealFromVendor('Climbing Rope');
      expect(store.getState().currentScene?.vendor?.stealAttempts).toBe(2);
      store.getState().stealFromVendor('Trail Rations');
      expect(store.getState().currentScene?.vendor?.stealAttempts).toBe(3);
    });

    it('caught attempts at higher streak count surface the bumped DC', async () => {
      // Force a fail by pinning d20 to 1 (nat-1 = miss).
      rngSpy.mockRestore();
      const failSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
      try {
        const store = await setupSketchyVendor();
        // Player at DEX 1 + nat-1 = total 2. Base DC is 11; with
        // streak 3 it's 17 (11 + 3*2). The CAUGHT log line shows
        // vs DC <bumped>.
        const p = store.getState().player!;
        store.setState({
          player: { ...p, stats: { ...p.stats, dexterity: 1 } },
          currentScene: {
            ...store.getState().currentScene!,
            vendor: {
              ...(store.getState().currentScene!.vendor as any),
              stealAttempts: 3, // sketchy DC 11 → 17 with streak
            } as any,
          },
        });
        store.getState().stealFromVendor('Trail Rations');
        const logs = store.getState().gameLog.map((e) => e.text).join('\n');
        // Expected DC = 11 + 3 * 2 = 17.
        expect(logs).toMatch(/vs DC 17/);
        expect(logs).toMatch(/CAUGHT/);
      } finally {
        failSpy.mockRestore();
      }
    });
  });
});
