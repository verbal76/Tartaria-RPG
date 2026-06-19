// OTA 043 — Audit-flagged test gap: Aethercraft verb dispatch +
// fuel-burn integration. The OTA 039 layer ships three verbs
// (shape stone / summon golem / mend wounds) that route through
// runAethercraft. This test pins:
//   - the parser routes each verb to the correct discipline
//   - fuel is consumed exactly once regardless of success/fail
//   - the DC log line carries the right race modifier
//     (Mud Dweller +0, Aetherborn +2, others +4)
//   - "no fuel" path logs and bails without state change

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
import type { InventoryItem } from '../app/engine/types';

function stockFuel(name: string, qty = 3): InventoryItem {
  return { id: `fuel_${name}_${Date.now()}`, name, kind: 'misc', quantity: qty, tags: ['aether', 'crystal'] };
}

function stockNonAetherInv(): InventoryItem[] {
  return [{ id: 'mud_1', name: 'Mudstone', kind: 'misc', quantity: 2, tags: ['material', 'stone'] }];
}

async function bootstrap(raceId: string, fuel: InventoryItem[]) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Caster', raceId, factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  store.setState({
    player: {
      ...p0,
      stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      inventory: fuel,
    },
  });
  return store;
}

describe('OTA 043 — Aethercraft verb dispatch + fuel burn', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('"shape stone" routes to Aetherstone Manipulation and burns 1 fuel', async () => {
    const store = await bootstrap('mud_dweller', [stockFuel('Aether Crystal', 3)]);

    store.getState().submitPlayerAction('shape stone');

    const after = store.getState().player!;
    const fuel = after.inventory.find((i) => i.name === 'Aether Crystal');
    expect(fuel?.quantity).toBe(2);
    // Either success or failure logs the discipline header line.
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/Aetherstone Manipulation/);
  });

  it('"summon golem" routes to Aether Golem Constructor and burns mud-golem recipe fuel', async () => {
    // arb119 — the default (mud) golem recipe is 2 Aether Mud + 2 Mud Fragment
    // + 1 Aether Crystal. (Mudstone, the old RARE anchor, was swapped for the
    // COMMON foraged Mud Fragment so the starter golem is actually buildable.)
    // Stock the full recipe + extras and assert the recipe set was consumed.
    // NOTE: pre-fix this test stocked the stale Mudstone recipe, so the fuel
    // gate refused ("Need: Mud Fragment") before the discipline header logged.
    const store = await bootstrap('mud_dweller', [
      stockFuel('Aether Mud', 5),
      stockFuel('Mud Fragment', 5),
      stockFuel('Aether Crystal', 3),
    ]);

    store.getState().submitPlayerAction('summon golem');

    const after = store.getState().player!;
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/Aether Golem Constructor/);
    // On success the recipe set was consumed; on failure (RNG-driven)
    // the recipe is still consumed per the runAethercraft contract.
    // Assert the deltas match the mud-golem recipe.
    const aetherMud = after.inventory.find((i) => i.name === 'Aether Mud');
    const mudFragment = after.inventory.find((i) => i.name === 'Mud Fragment');
    const aetherCrystal = after.inventory.find((i) => i.name === 'Aether Crystal');
    expect(aetherMud?.quantity ?? 0).toBe(3); // 5 - 2
    expect(mudFragment?.quantity ?? 0).toBe(3); // 5 - 2
    expect(aetherCrystal?.quantity ?? 0).toBe(2); // 3 - 1
  });

  it('"mend wounds" routes to Aetheric Healing and burns 1 fuel', async () => {
    const store = await bootstrap('mud_dweller', [stockFuel('Aetheric Shard', 2)]);

    store.getState().submitPlayerAction('mend wounds');

    const after = store.getState().player!;
    const fuel = after.inventory.find((i) => i.name === 'Aetheric Shard');
    expect(fuel?.quantity).toBe(1);
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/Aetheric Healing/);
  });

  it('Mud Dweller casts at base DC (12 for shape, 15 for summon)', async () => {
    const store = await bootstrap('mud_dweller', [stockFuel('Aether Crystal', 2)]);
    store.getState().submitPlayerAction('shape stone');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/DC 12/);
  });

  it('Aetherborn casts at +2 DC (14 for shape)', async () => {
    const store = await bootstrap('aetherborn', [stockFuel('Aether Crystal', 2)]);
    store.getState().submitPlayerAction('shape stone');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/DC 14/);
  });

  it('Unknowing Mass / Reclaimer casts at +3 DC (15 for shape) — MECHANIC-1 tune, was +4/16', async () => {
    const store = await bootstrap('unknowing_mass', [stockFuel('Aether Crystal', 2)]);
    store.getState().submitPlayerAction('shape stone');
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/DC 15/);
  });

  it('No fuel → cast bails with Arbiter line, inventory unchanged', async () => {
    const store = await bootstrap('mud_dweller', stockNonAetherInv());
    const invBefore = JSON.stringify(store.getState().player!.inventory);

    store.getState().submitPlayerAction('shape stone');

    const invAfter = JSON.stringify(store.getState().player!.inventory);
    expect(invAfter).toBe(invBefore);
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/finds nothing to pull on/);
    // Discipline header should NOT have logged — we bailed before the roll.
    expect(logs).not.toMatch(/Aetherstone Manipulation/);
  });
});
