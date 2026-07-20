// OTA-912 — full-run verification: buy all five Skyreacher Charts (sell-once),
// unlock + clear all five towers, confirm each drops its Skyreacher armor piece
// AND an Aether Collection Beacon on boss defeat, and that the five beacons hand
// in for the Skyreacher Boltcaster + legendary materials.

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

import { useGameStore, withSkyreacherChartOffer, SKYREACHER_CHARTS } from '../app/state/gameStore';
import { GREAT_CLIMBS, buildSummitBoss } from '../app/engine/greatClimbs';
import type { InventoryItem, WorldMemory } from '../app/engine/types';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

const roadside = (offers: { itemName: string; price: number; quantity?: number }[] = []) =>
  ({ id: 'roadside_test', name: 'Roadside Pedlar', title: 'roadside trader', demeanor: 'honest', faction: null, offers } as never);

describe('OTA-912 — every Skyreacher Chart is purchasable exactly once', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('all five distinct charts get offered by roadside stalls as prior ones sell out', async () => {
    const store = await boot('Buyer');
    const orig = Math.random;
    Math.random = () => 0; // force the ~18% offer gate to fire every time
    try {
      let wm = { ...store.getState().worldMemory, soldMapIds: [], unlockedGreatClimbs: [] } as WorldMemory;
      const offered: string[] = [];
      for (let i = 0; i < 5; i++) {
        const stall = withSkyreacherChartOffer(roadside(), wm)!;
        const chart = stall.offers.find((o) => o.itemName.startsWith('Skyreacher Chart'));
        expect(chart).toBeDefined();
        offered.push(chart!.itemName);
        // simulate the sale — the ledger blocks re-offers of that chart
        wm = { ...wm, soldMapIds: [...(wm.soldMapIds ?? []), chart!.itemName] };
      }
      expect(new Set(offered).size).toBe(5); // all five distinct charts surfaced
      // with all five sold, no stall offers one again
      const none = withSkyreacherChartOffer(roadside(), wm)!;
      expect(none.offers.some((o) => o.itemName.startsWith('Skyreacher Chart'))).toBe(false);
    } finally {
      Math.random = orig;
    }
  });

  it('buying a chart grants it and stamps the sell-once ledger', async () => {
    const store = await boot('Shopper');
    const p0 = store.getState().player!;
    store.setState({
      player: { ...p0, tc: 500 },
      currentScene: { ...store.getState().currentScene!, vendor: roadside([{ itemName: 'Skyreacher Chart (2 of 5)', price: 100, quantity: 1 }]) },
    });
    await store.getState().buyFromVendor('Skyreacher Chart (2 of 5)', 1);
    expect(store.getState().player!.inventory.some((i) => i.name === 'Skyreacher Chart (2 of 5)')).toBe(true);
    expect(store.getState().worldMemory.soldMapIds ?? []).toContain('Skyreacher Chart (2 of 5)');
  });
});

describe('OTA-912 — clear all five towers and hand in for the Boltcaster', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('each tower: chart unlocks it, the summit boss drops a Skyreacher piece + a beacon; the 5th grants the Boltcaster', async () => {
    const store = await boot('Skyreacher');
    const p0 = store.getState().player!;
    // Give one chart per climb; make the player unkillable so defeat resolution is clean.
    store.setState({
      player: {
        ...p0, hp: 99999, hpMax: 99999, tc: 2000,
        inventory: [
          ...p0.inventory,
          ...SKYREACHER_CHARTS.map((c, i) => ({
            id: `chart_${i}`, name: c.name, kind: 'misc', rarity: 'Rare', quantity: 1,
            tags: ['map', 'skyreacher_chart', 'chart'],
          } as InventoryItem)),
        ],
      },
    });

    const armorSeen: string[] = [];
    let towerIdx = 0;
    for (const climb of GREAT_CLIMBS) {
      towerIdx += 1;
      const chartName = SKYREACHER_CHARTS.find((x) => x.climbId === climb.id)!.name;

      // (1) use the chart → the climb unlocks (mission opens)
      store.getState().useInventoryItem(chartName);
      expect(store.getState().worldMemory.unlockedGreatClimbs ?? []).toContain(climb.id);

      // (2) reach the summit → the named boss is on you. Drive its defeat.
      const boss = buildSummitBoss(climb.id)!;
      expect(boss.boss).toBe(true);
      store.setState({
        currentScene: {
          ...store.getState().currentScene!,
          enemies: [boss as never],
          enemyHps: [1],
          activeEnemyIdx: 0,
          range: 'mid',
          enemyAmbushUsed: [false],
          enemyKnockedOut: [false],
        },
      });
      store.getState().resolveEnemyDefeat();

      // (3) the tower is marked cleared, and its Skyreacher piece dropped
      expect(store.getState().worldMemory.summitBossesDefeated ?? []).toContain(climb.id);
      const inv = store.getState().player!.inventory;
      expect(inv.some((i) => i.name === climb.rewardArmor && i.quantity > 0)).toBe(true);
      armorSeen.push(climb.rewardArmor);

      const beaconQty = inv.filter((i) => i.name === 'Aether Collection Beacon').reduce((s, i) => s + i.quantity, 0);
      if (towerIdx < 5) {
        // (4a) a beacon dropped and is accumulating
        expect(beaconQty).toBe(towerIdx);
        // ...and the Boltcaster is NOT yet granted
        expect(inv.some((i) => i.name === 'Skyreacher Boltcaster')).toBe(false);
      } else {
        // (4b) the fifth beacon re-links into the Boltcaster — the five are consumed
        expect(beaconQty).toBe(0);
      }
    }

    // all five DISTINCT Skyreacher pieces were awarded
    expect(new Set(armorSeen).size).toBe(5);
    expect([...new Set(armorSeen)].sort()).toEqual([
      'Skyreacher Crown', 'Skyreacher Cuirass', 'Skyreacher Gauntlets', 'Skyreacher Mantle', 'Skyreacher Treads',
    ].sort());

    // the Boltcaster: Legendary, electrical + a permanent acid coating (electrical + acid)
    const finalInv = store.getState().player!.inventory;
    const bolt = finalInv.find((i) => i.name === 'Skyreacher Boltcaster');
    expect(bolt).toBeDefined();
    expect(bolt!.rarity).toBe('Legendary');
    expect((bolt as unknown as { coating?: { kind: string } }).coating?.kind).toBe('acid');
    // legendary material cache landed
    expect(finalInv.some((i) => i.name === 'Throne Shard')).toBe(true);
    expect(finalInv.some((i) => i.name === 'Iron Core')).toBe(true);
    // one-time flag set
    expect(store.getState().worldMemory.skyreacherBoltcasterGranted).toBe(true);
  });
});
