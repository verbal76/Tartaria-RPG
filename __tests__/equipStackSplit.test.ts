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

// arb62 — equipping from a stack of N>1 must split ONE copy into the slot and
// leave N-1 free (the player had 3 Aetherbound Masks; equipping one locked all
// three as EQUIPPED and the spares couldn't be scrapped).
describe('split-on-equip from a stack', () => {
  it('peels one copy into the slot; the rest stay free + scrappable', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Equipper', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    // Inject a merged stack of 3 head-slot masks (durable, fully-durable so
    // grantItem would have merged them into one row).
    const masks = {
      id: 'mask_stack', name: 'Aetherbound Mask', kind: 'armor' as const,
      rarity: 'Common' as const, quantity: 3, tags: ['armor', 'head'],
      durability: { current: 20, max: 20 },
    };
    store.setState({ player: { ...p0, inventory: [masks], equipped: {} } });

    store.getState().equipItem('Aetherbound Mask', 'head');

    const p = store.getState().player!;
    const headId = p.equipped?.headId;
    // arb64 — the EQUIPPED copy KEEPS the original stack id (qty 1); the
    // REMAINDER is peeled to a new free instance. Keeping the original id on the
    // equipped copy preserves the equipped-id invariant the stress harnesses
    // (inventoryAudit / domesticStress) rely on.
    expect(headId).toBe('mask_stack');
    const equippedRow = p.inventory.find((i) => i.id === headId)!;
    expect(equippedRow.quantity).toBe(1);
    const freeRows = p.inventory.filter((i) => i.name === 'Aetherbound Mask' && i.id !== headId);
    const freeTotal = freeRows.reduce((n, i) => n + i.quantity, 0);
    expect(freeTotal).toBe(2); // the spares remain as a new free row, unequipped
    // total masks conserved
    expect(p.inventory.filter((i) => i.name === 'Aetherbound Mask').reduce((n, i) => n + i.quantity, 0)).toBe(3);
  });
});
