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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-991 — the Skyreacher Charts become Skyreacher Maps. Owner (on-device):
// "I click on it and there's no use button... it's not a chart. we should call
// it a map... and a text pops up saying that you've added the skyreacher
// location ... to the map and mission logs." Names now read
// 'Skyreacher Map N of 5 — <tower>'; old saves are migrated (inventory rename
// on load, legacy names still honored by the sell-once ledger); a fresh unlock
// announces itself with an explicit MAP + MISSION LOG reward line.
import {
  useGameStore, backfillPlayer, withSkyreacherChartOffer,
  SKYREACHER_CHARTS, LEGACY_SKYREACHER_CHART_NAMES,
} from '../app/state/gameStore';
import { findGearByName } from '../app/engine/crafting';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem, WorldMemory } from '../app/engine/types';

const legacyChart = (n: number): InventoryItem => ({
  id: `legacy${n}`, name: `Skyreacher Chart (${n} of 5)`, kind: 'misc', rarity: 'Rare',
  quantity: 1, tags: ['map', 'skyreacher_chart', 'chart'],
});

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  return store;
}

const roadside = () =>
  ({ id: 'roadside_test', name: 'Roadside Pedlar', title: 'roadside trader', demeanor: 'honest', faction: null, offers: [] } as never);

describe('OTA-991 — Skyreacher Maps: rename, migration, and the unlock popup', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('all five new map names resolve their catalog effect to the right climb', () => {
    for (const c of SKYREACHER_CHARTS) {
      expect(/^Skyreacher Map \d of 5 — /.test(c.name)).toBe(true);
      const row = findGearByName(c.name);
      expect(row).not.toBeNull();
      const fx = row!.effect as { kind: string; climbId: string } | undefined;
      expect(fx?.kind).toBe('map');
      expect(fx?.climbId).toBe(c.climbId);
    }
  });

  it('using a Skyreacher Map unlocks the climb, consumes it, and pops the MAP + MISSION LOG line', async () => {
    const store = await boot('Wayfinder');
    const p0 = store.getState().player!;
    const map: InventoryItem = {
      id: 'map1', name: 'Skyreacher Map 1 of 5 — Grand Spire', kind: 'misc', rarity: 'Rare',
      quantity: 1, tags: ['map', 'skyreacher_chart', 'chart'],
    };
    store.setState({ player: { ...p0, inventory: [...p0.inventory, map] } });

    store.getState().useInventoryItem('Skyreacher Map 1 of 5 — Grand Spire');

    const wm = store.getState().worldMemory;
    expect(wm.unlockedGreatClimbs ?? []).toContain('grand_spire');
    expect((store.getState().player!.inventory).some((i) => i.id === 'map1')).toBe(false); // consumed
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/Skyreacher location added to your MAP and MISSION LOG/);
  });

  it('backfillPlayer renames legacy charts held in an old save to the new map names', async () => {
    const store = await boot('Curator');
    const p0 = store.getState().player!;
    const held = { ...p0, inventory: [...p0.inventory, legacyChart(1), legacyChart(3), legacyChart(5)] };
    const out = backfillPlayer(held);
    for (const n of [1, 3, 5]) {
      expect(out.inventory.some((i) => i.name === `Skyreacher Chart (${n} of 5)`)).toBe(false);
      expect(out.inventory.some((i) => i.name === SKYREACHER_CHARTS[n - 1]!.name)).toBe(true);
    }
    // the renamed item still resolves its Use effect from the catalog
    expect((findGearByName(SKYREACHER_CHARTS[0]!.name)!.effect as { kind: string }).kind).toBe('map');
  });

  it('a legacy ledger entry still counts as sold — that map is never re-offered', () => {
    const orig = Math.random;
    Math.random = () => 0; // force the ~18% offer gate open
    try {
      const wm = {
        soldMapIds: [LEGACY_SKYREACHER_CHART_NAMES[0]!], // map 1 sold under its old name
        unlockedGreatClimbs: [],
      } as unknown as WorldMemory;
      const stall = withSkyreacherChartOffer(roadside(), wm)!;
      const offer = stall.offers.find((o: { itemName: string }) => /^Skyreacher Map/.test(o.itemName));
      expect(offer).toBeDefined();
      expect(offer!.itemName).toBe(SKYREACHER_CHARTS[1]!.name); // skipped to map 2

      const allSold = { soldMapIds: [...LEGACY_SKYREACHER_CHART_NAMES], unlockedGreatClimbs: [] } as unknown as WorldMemory;
      const none = withSkyreacherChartOffer(roadside(), allSold)!;
      expect(none.offers.some((o: { itemName: string }) => /^Skyreacher/.test(o.itemName))).toBe(false);
    } finally {
      Math.random = orig;
    }
  });
});
