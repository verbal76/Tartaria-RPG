// OTA-631 — the Crucible forges stats INSTANTLY and mints the weapon right away;
// a background namer then "settles" its true name and pops a reveal that deep-links
// to the inventory. In jest Qwen isn't ready, so the background path settles with
// the deterministic name — which is exactly what we assert end-to-end here.

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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore, backfillPlayer } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';

const mkInferred = (name: string, tags: string[]): InventoryItem =>
  ({ id: `i_${name.replace(/\s+/g, '_')}`, name, kind: 'misc', quantity: 1, rarity: 'Common', tags: ['loot', ...tags], reservedForFusion: true } as InventoryItem);

describe('OTA-631 — materializing fusion', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('forges instantly, consumes inputs, settles to a real name, and reveals with a View-in-inventory CTA', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Smith', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    const p = store.getState().player!;
    store.setState({
      player: {
        ...p,
        hubRoomId: 'outpost_gate',
        macroVisitSeq: 2, // past the spawn-outpost gate → Crucible available
        fusionPending: false,
        inventory: [
          mkInferred('Aetheric Cog', ['aether', 'metal']),
          mkInferred('Mud Cloth', ['cloth']),
          mkInferred('Tortoise Shell', ['bone']),
        ],
      },
      discoveryReveal: null,
      gameLog: [],
    });

    await store.getState().fuseAtCrucible();
    await new Promise((r) => setTimeout(r, 50)); // let the background namer settle

    const after = store.getState();
    const fused = after.player!.inventory.find((i) => i.id.startsWith('fused_'));
    expect(fused).toBeTruthy();
    // Settled: no longer the placeholder, materializing flag cleared.
    expect(fused!.name).not.toBe('Cooling Crucible-Work');
    expect(fused!.name.length).toBeGreaterThan(0);
    expect(fused!.materializing).toBeFalsy();
    expect(['Rare', 'Legendary']).toContain(fused!.rarity);
    expect(fused!.uniqueStats).toBeTruthy(); // real stats were stamped instantly

    // Inputs were consumed by the forge.
    expect(after.player!.inventory.find((i) => i.id === 'i_Aetheric_Cog')).toBeFalsy();
    // Permit spent.
    expect(after.player!.fusionPending).toBe(false);

    // The reveal pops and deep-links to the inventory.
    expect(after.discoveryReveal).toBeTruthy();
    expect(after.discoveryReveal!.title).toMatch(/formed/i);
    expect(after.discoveryReveal!.cta?.screen).toBe('inventory');
    expect(after.discoveryReveal!.body).toContain(fused!.name);
  });

  it('settleFusion is a no-op if the forging was removed before it formed', () => {
    const store = useGameStore;
    const p = store.getState().player!;
    store.setState({ player: { ...p, inventory: [] }, discoveryReveal: null });
    store.getState().settleFusion('fused_ghost', 'Phantom Edge', 'it never was');
    expect(store.getState().discoveryReveal).toBeNull();
  });

  it('a reload settles a stuck materializing item to its stashed deterministic name', () => {
    // Simulates the app being killed mid-forge: the item persisted as
    // "Cooling Crucible-Work" with materializing=true. backfillPlayer (run on
    // load) must settle it to the stashed formingName so it isn't stuck nameless.
    const store = useGameStore;
    const p = store.getState().player!;
    const stuck = {
      id: 'fused_stuck', name: 'Cooling Crucible-Work', kind: 'weapon', quantity: 1,
      rarity: 'Legendary', tags: ['fused', 'unique'],
      materializing: true, formingName: 'Resonant Sunder', formingDesc: 'A blade that hums.',
      durability: { current: 45, max: 45 },
    } as unknown as InventoryItem;
    const loaded = backfillPlayer({ ...p, inventory: [stuck] });
    const item = loaded.inventory.find((i) => i.id === 'fused_stuck')!;
    expect(item.name).toBe('Resonant Sunder');
    expect(item.materializing).toBeFalsy();
    expect(item.formingName).toBeUndefined();
  });
});
