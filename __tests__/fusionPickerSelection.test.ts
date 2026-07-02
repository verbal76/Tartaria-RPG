// OTA — the Crucible used to consume the player's ENTIRE reserved (♥) pool on one
// fusion. Now firing it opens a picker; the player spends only the 3–5 they choose,
// and picks weapon vs armor. These lock: (1) fuse opens the picker without consuming
// anything; (2) confirming a selection consumes ONLY those items (others survive);
// (3) the chosen output kind is honored.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

jest.setTimeout(20000);

import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';

const tick = () => new Promise((r) => setTimeout(r, 0));

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Fuser', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

// A 5-item reserved pool spanning ≥3 material tags (proven ok by fuseDiversityGate).
const pool = (): InventoryItem[] => ([
  { id: 's1', name: 'Aetheric Moss', kind: 'consumable', rarity: 'Common', quantity: 1, reservedForFusion: true, tags: ['loot', 'aether'] },
  { id: 's2', name: 'Aetheric Blood', kind: 'misc', rarity: 'Common', quantity: 1, reservedForFusion: true, tags: ['loot', 'improvised', 'aether'] },
  { id: 's3', name: 'Leech Mucus', kind: 'misc', rarity: 'Common', quantity: 1, reservedForFusion: true, tags: ['loot', 'improvised'] },
  { id: 's4', name: 'Shrike Claw', kind: 'misc', rarity: 'Common', quantity: 1, reservedForFusion: true, tags: ['loot', 'organic'] },
  { id: 's5', name: 'Shrike Claw', kind: 'misc', rarity: 'Common', quantity: 1, reservedForFusion: true, tags: ['loot', 'organic'] },
] as InventoryItem[]);

function setup(store: typeof useGameStore) {
  store.setState((s) => (s.player ? { player: { ...s.player, inventory: pool(), fusionPending: true }, fusionPickerOpen: false, pendingFusionSelection: null } : s));
}

describe('fusion picker — spend only what you choose', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('firing the Crucible OPENS the picker and consumes nothing', async () => {
    const store = await boot();
    setup(store);
    await store.getState().fuseAtCrucible();
    expect(store.getState().fusionPickerOpen).toBe(true);
    // Nothing consumed — all five still present and reserved.
    const inv = store.getState().player!.inventory;
    expect(inv.filter((i) => i.reservedForFusion)).toHaveLength(5);
  });

  it('confirming 3 picks consumes ONLY those, leaves the others, forges the chosen kind', async () => {
    const store = await boot();
    setup(store);
    store.getState().confirmFusionSelection(['s1', 's2', 's3'], 'armor');
    await tick();
    const inv = store.getState().player!.inventory;
    // The three picked are gone…
    expect(inv.find((i) => i.id === 's1')).toBeUndefined();
    expect(inv.find((i) => i.id === 's2')).toBeUndefined();
    expect(inv.find((i) => i.id === 's3')).toBeUndefined();
    // …the two unpicked survive, still reserved.
    expect(inv.find((i) => i.id === 's4')?.reservedForFusion).toBe(true);
    expect(inv.find((i) => i.id === 's5')?.reservedForFusion).toBe(true);
    // A freshly-forged item exists and is ARMOR (the chosen kind), not a weapon.
    const forged = inv.find((i) => i.materializing || i.uniqueStats);
    expect(forged).toBeTruthy();
    const forgedKind = forged!.kind ?? (forged!.uniqueStats as { kind?: string } | undefined)?.kind;
    expect(forgedKind).toBe('armor');
    // Picker closed + selection cleared.
    expect(store.getState().fusionPickerOpen).toBe(false);
    expect(store.getState().pendingFusionSelection).toBeNull();
  });
});
