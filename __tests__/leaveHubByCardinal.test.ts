// Regression: when the player leaves a hub by walking in a
// cardinal direction that the hub doesn't have an internal exit
// for, the engine should fully re-roll the wilderness scene —
// drop the hub vendor, the hub's hooks, the hub's ambient pool,
// the microMicroId, etc.
//
// Playtester report 2026-05-21: stood in the Armory (Reclaimers'
// Outpost), typed "go east". Armory has no east exit, so the
// engine treated it as "leave outpost via east". The old code
// only patched ambientNouns and cleared hubRoomId; it left
// currentScene.vendor pointing at Irma. The wilderness look
// after the step read "Irma Ironhand is here" in open silt.

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
import { getRaces, getFactions } from '../app/engine/character';

describe('leaving a hub via an unsupported cardinal direction', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('drops the hub vendor + hooks + hub ambient pool when the player walks out by an unmapped direction', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'HubLeaver', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    // Force the player into a hub room. Plant an obvious vendor +
    // a hub-flavored ambient noun on the scene so we can assert
    // they're cleared on exit.
    const scene = store.getState().currentScene!;
    const ghostVendor = { name: 'Irma Ironhand', offers: [] } as never;
    const ghostHook = {
      id: 'hub_ghost_hook',
      kind: 'footprints',
      nouns: ['anvil ghost'],
      stage: 0,
      resolved: false,
      plantedLine: 'irrelevant',
    } as never;
    store.setState({
      currentScene: {
        ...scene,
        vendor: ghostVendor,
        hooks: [ghostHook],
        ambientNouns: ['anvil', 'racks', 'kettle', 'map-stone'],
        displayedAmbientNouns: ['anvil', 'racks', 'kettle', 'map-stone'],
        microMicroId: 'reclaimer_armory',
      },
    });
    const p0 = store.getState().player!;
    store.setState({
      player: { ...p0, hubRoomId: 'reclaimer_armory', stamina: 30, staminaMax: 30 },
    });

    // The Armory has no east exit. resolveHubTravel returns null, we
    // fall through to the cardinal-out-of-hub branch, beginScene
    // rebuilds the scene as open wilderness.
    store.getState().submitPlayerAction('go east');

    const after = store.getState();
    expect(after.player!.hubRoomId).toBeNull();
    const sceneAfter = after.currentScene!;
    // Vendor must be gone — specifically, Irma should not be standing
    // in open silt. OTA 030 added procedural roadside traders to
    // outdoor scenes (25% spawn) so the slot may hold one of those
    // instead; that's expected and not a leak.
    if (sceneAfter.vendor) {
      expect(sceneAfter.vendor.name).not.toBe('Irma Ironhand');
      expect(sceneAfter.vendor.id).toMatch(/^roadside_/);
    }
    // The hub's microMicroId must NOT survive — wilderness may set
    // its own based on coords, but it can't still be the armory tag.
    expect(sceneAfter.microMicroId).not.toBe('reclaimer_armory');
    // The hub's ambient pool should not survive.
    const ambient = sceneAfter.ambientNouns ?? [];
    expect(ambient).not.toContain('anvil');
    expect(ambient).not.toContain('racks');
    expect(ambient).not.toContain('kettle');
    // The hub's hook must not have followed.
    const hookIds = (sceneAfter.hooks ?? []).map((h) => h.id);
    expect(hookIds).not.toContain('hub_ghost_hook');
  });
});
