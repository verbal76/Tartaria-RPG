// OTA-058 — Scrap UX repairs.
//
// Two behaviors land in this OTA, both covered here:
//
//   1. MIN-YIELD on failure. Pre-OTA, a failed scrap roll consumed
//      the item and gave nothing — anti-spam by design but reported
//      as "wasted click" by a playtester. Now failure still consumes
//      the item but always grants 1 unit of the FIRST material from
//      scrapOutputFor() as a consolation. Successful rolls still
//      grant the full output.
//
//   2. AUTO-UNEQUIP on scrap. Pre-OTA, scrapping an equipped item
//      refused with "unequip first." A playtester hit this three
//      times on the Aetheric Locket and read it as "scrap didn't
//      work / item stayed in inventory." Now scrapInventoryItem
//      auto-unequips the matching slot(s), then runs the normal
//      scrap flow.

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

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Scrapper', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

describe('OTA-058 — scrap min-yield + auto-unequip', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('failed scrap still grants at least one base material', async () => {
    const store = await bootstrap();
    const p = store.getState().player!;
    // Replace inventory with a single unique-name item so the
    // scrapInventoryItem.find() targets exactly this one (starter
    // inventory contains a Rusted Blade by default).
    store.setState({
      player: {
        ...p,
        // Drop INT/DEX to push success chance to the 35% floor — but
        // since the consolation lands on failure too, we can rely on
        // EITHER branch producing a grant.
        stats: { ...p.stats, intelligence: 1, dexterity: 1 },
        inventory: [
          { id: 'test_blade_unique', name: 'Test Scrap Blade', kind: 'weapon', quantity: 1, tags: ['metal', 'blade'] } as any,
        ],
        equipped: {},
      },
    });
    // Force a guaranteed failure path: stub Math.random to always
    // return 0.99 (above the 0.35 floor), so the success roll fails
    // and the second-chance (gated on INT 14 / DEX 16 — both 1 here)
    // doesn't even fire.
    const realRandom = Math.random;
    Math.random = () => 0.99;
    try {
      store.getState().scrapInventoryItem('Test Scrap Blade');
    } finally {
      Math.random = realRandom;
    }
    // The Blade is gone (consumed on fail per OTA 23-014).
    const inv = store.getState().player!.inventory;
    expect(inv.find((i) => i.name === 'Test Scrap Blade')).toBeUndefined();
    // And at least one base material landed — Scrap Metal is the
    // first grant for a metal/blade/weapon-tagged item.
    const metal = inv.find((i) => i.name === 'Scrap Metal');
    expect(metal).toBeDefined();
    expect(metal!.quantity).toBeGreaterThanOrEqual(1);
  });

  it('successful scrap still grants the FULL output (not just consolation)', async () => {
    const store = await bootstrap();
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        stats: { ...p.stats, intelligence: 14, dexterity: 12 },
        inventory: [
          { id: 'test_blade_full', name: 'Test Full Blade', kind: 'weapon', quantity: 1, tags: ['metal', 'blade'] } as any,
        ],
        equipped: {},
      },
    });
    // Force a guaranteed success path: Math.random → 0 always wins.
    const realRandom = Math.random;
    Math.random = () => 0;
    try {
      store.getState().scrapInventoryItem('Test Full Blade');
    } finally {
      Math.random = realRandom;
    }
    const inv = store.getState().player!.inventory;
    // Full output for a metal/blade/weapon: Scrap Metal + Stick.
    expect(inv.find((i) => i.name === 'Scrap Metal')).toBeDefined();
    expect(inv.find((i) => i.name === 'Stick')).toBeDefined();
  });

  it('scrapping an equipped item auto-unequips and consumes it', async () => {
    const store = await bootstrap();
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        stats: { ...p.stats, intelligence: 14, dexterity: 12 },
        inventory: [
          { id: 'test_locket_unique', name: 'Test Equipped Locket', kind: 'relic', quantity: 1, tags: ['aether'] } as any,
        ],
        equipped: { amulet: 'Test Equipped Locket', amuletId: 'test_locket_unique' },
      },
    });
    // Force success path so we cleanly test the unequip + consume.
    const realRandom = Math.random;
    Math.random = () => 0;
    try {
      store.getState().scrapInventoryItem('Test Equipped Locket');
    } finally {
      Math.random = realRandom;
    }
    const after = store.getState().player!;
    // Locket is gone from inventory.
    expect(after.inventory.find((i) => i.name === 'Test Equipped Locket')).toBeUndefined();
    // Amulet slot is cleared (not referencing the now-deleted item).
    expect(after.equipped?.amulet).toBeUndefined();
    expect(after.equipped?.amuletId).toBeUndefined();
    // Aetheric Shard (relic/aether → shard) landed.
    expect(after.inventory.find((i) => i.name === 'Aetheric Shard')).toBeDefined();
  });

  it('scrapping an equipped item DOES NOT log the legacy refusal line', async () => {
    const store = await bootstrap();
    const p = store.getState().player!;
    store.setState({
      gameLog: [],
      player: {
        ...p,
        inventory: [
          { id: 'test_locket_log', name: 'Test Refusal Locket', kind: 'relic', quantity: 1, tags: ['aether'] } as any,
        ],
        equipped: { amulet: 'Test Refusal Locket', amuletId: 'test_locket_log' },
      },
    });
    store.getState().scrapInventoryItem('Test Refusal Locket');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).not.toMatch(/can't scrap what you're wearing/);
  });
});
