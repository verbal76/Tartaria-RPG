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

// OTA-967 — the Crucible faucet closes. Owner: "make the outpost run the same
// as a roadside vendor." The outpost Crucible now charges the vendor's 25 TC
// per fire (fuse AND the extra-channel upgrade), taken only after every gate
// passes so a refusal never costs a coin. Vendor fires and wild benches
// (fusionPending) stay pre-paid; the Hidden Market cauldron keeps its perk.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem } from '../app/engine/types';

const mat = (id: string, tag: string): InventoryItem => ({
  id, name: `Test ${tag} Chunk ${id}`, kind: 'misc', rarity: 'Common', quantity: 1,
  tags: [tag], reservedForFusion: true,
});

async function bootOutpost(tc: number) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Smith', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  store.setState((s) => ({
    player: {
      ...s.player!,
      tc,
      hubRoomId: 'forge_room',
      macroVisitSeq: 2, // has left the spawn outpost — the Crucible permit
      fusionPending: false,
      inventory: [...s.player!.inventory, mat('m1', 'metal'), mat('m2', 'wood'), mat('m3', 'stone')],
    },
  }));
  return store;
}

describe('OTA-967 — the outpost Crucible charges the vendor rate', () => {
  it('a fired fuse costs exactly 25 TC and still forges', async () => {
    const store = await bootOutpost(100);
    store.getState().confirmFusionSelection(['m1', 'm2', 'm3'], 'weapon');
    await new Promise((r) => setTimeout(r, 10));
    const p = store.getState().player!;
    expect(p.inventory.some((i) => i.uniqueStats?.kind === 'weapon')).toBe(true); // it forged
    expect(p.tc).toBe(75); // and the fee landed
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/outpost Crucible takes its fee/);
  });

  it('too broke to fire: nothing is consumed, nothing forges, the price is named', async () => {
    const store = await bootOutpost(10);
    store.getState().confirmFusionSelection(['m1', 'm2', 'm3'], 'weapon');
    await new Promise((r) => setTimeout(r, 10));
    const p = store.getState().player!;
    expect(p.tc).toBe(10); // not a coin taken
    expect(p.inventory.filter((i) => i.reservedForFusion).length).toBe(3); // inputs untouched
    expect(p.inventory.some((i) => i.uniqueStats?.kind === 'weapon')).toBe(false);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/costs 25 TC to fire; you have 10/);
  });

  it('a pre-paid fire (vendor / wild bench sets fusionPending) is NOT double-charged', async () => {
    const store = await bootOutpost(100);
    store.setState((s) => ({ player: { ...s.player!, fusionPending: true } }));
    store.getState().confirmFusionSelection(['m1', 'm2', 'm3'], 'weapon');
    await new Promise((r) => setTimeout(r, 10));
    expect(store.getState().player!.tc).toBe(100); // the fuse itself takes nothing extra
    expect(store.getState().player!.inventory.some((i) => i.uniqueStats?.kind === 'weapon')).toBe(true);
  });

  it('the Hidden Market cauldron keeps its free-fire perk', async () => {
    const store = await bootOutpost(100);
    store.setState({ activeBuildingId: 'market' });
    store.getState().confirmFusionSelection(['m1', 'm2', 'm3'], 'weapon');
    await new Promise((r) => setTimeout(r, 10));
    expect(store.getState().player!.tc).toBe(100);
    expect(store.getState().player!.inventory.some((i) => i.uniqueStats?.kind === 'weapon')).toBe(true);
  });
});
