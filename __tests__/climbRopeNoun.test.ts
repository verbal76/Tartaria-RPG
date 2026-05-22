// OTA 045 — Regression for the "climb rope" gibberish bug.
// Player log showed: scene noun list included a plain `rope`, the
// player typed "climb rope", and the parser resolved the noun to
// the player's inventory `Climbing Rope` item (general parser policy
// — prefer inventory items for `use torch` etc.). The climb handler
// then ran the auto-rope template against the inventory item it had
// itself just used as fuel, narrating:
//
//   "You loop the climbing rope around the Climbing Rope and walk
//    the line. Tier 1/2 cleared."
//
// Two fixes:
//   1. The climb handler now checks scene ambient nouns FIRST and
//      only falls back to parsed.resolvedNoun (which favors
//      inventory matches) if no scene match exists. Climb is a
//      scene-noun verb, not an inventory verb.
//   2. The auto-rope narration switches to "haul up the rope hand
//      over hand" when the climbed noun is itself a rope / line /
//      chain / cable / cord — so the rare case where a scene
//      legitimately has a `rope` noun doesn't produce
//      "loop the climbing rope around the rope".

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

async function setupSceneWithRope() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Climber', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();

  // Inject a scene that has a plain `rope` ambient noun AND give the
  // player a Climbing Rope in inventory — the exact playtest setup.
  const p0 = store.getState().player!;
  store.setState({
    currentScene: {
      ...store.getState().currentScene!,
      ambientNouns: ['rope', 'arch', 'gate'],
    },
    player: {
      ...p0,
      inventory: [
        ...p0.inventory.filter((i) => i.name !== 'Climbing Rope'),
        { id: 'crope_x', name: 'Climbing Rope', kind: 'misc', quantity: 1, tags: ['gear', 'rope'] },
      ],
    },
  });
  return store;
}

describe('OTA 045 — climb noun resolution prefers scene nouns over inventory items', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('"climb rope" with a scene rope + inventory Climbing Rope narrates "haul up the rope", not "around the Climbing Rope"', async () => {
    const store = await setupSceneWithRope();
    store.getState().submitPlayerAction('climb rope');

    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    // The fix: narration mentions "haul up the rope hand over hand"
    // (rope-shaped noun branch) — NOT the gibberish double-rope line.
    expect(logs).toMatch(/haul up the rope hand over hand/);
    // Negative assertion: the broken pre-fix string ("around the
    // Climbing Rope") should never appear.
    expect(logs).not.toMatch(/around the Climbing Rope/);
    expect(logs).not.toMatch(/around the climbing rope/i);
  });

  it('"climb wall" with the same inventory rope keeps the original belay narration', async () => {
    const store = await setupSceneWithRope();
    // Add a wall noun to the scene.
    const p = store.getState().player!;
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        ambientNouns: ['wall', 'rope', 'arch'],
      },
      player: p,
    });

    store.getState().submitPlayerAction('climb wall');

    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    // Non-rope noun: the original auto-rope template fires —
    // "loop the climbing rope around the wall".
    expect(logs).toMatch(/loop the climbing rope around the wall/);
  });
});
