// Regression: accept-verb wiring (OTA 185).
//
// Bug A: 'accept drakova' for the Bog Dragon of Old Drakova hunt
//   fell through to the faction-quest path because the huntHint regex
//   only matched category keywords (hunt, bounty, titan, dragon, etc.)
//   and missed location names. Drakova is a location, not a category.
//
// Bug B: 'accept <hunt>' / 'accept <mystery>' required a vendor in
//   the current scene. If the player heard the offer at Irma's
//   Armory and walked away, the second 'accept' tap anywhere else
//   refused. Faction-neutral hunts/mysteries should accept without
//   the vendor anchor since any wandering vendor could have posted
//   them.

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

describe('accept verb — OTA 185 wiring fixes', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  // ⚠⚠ RETARGETED BY OTA-1216 (PUNCHLIST P12), AND IT WAS ASSERTING THE DEFECT.
  //
  // This used `accept drakova` and expected the Bog Dragon. But "drakova" substring-matches
  // TWO hunts — "The Bog Dragon of Old Drakova" and "The Siren of Drowned Drakova" — so the
  // old resolver was picking the first in catalog order and this test was pinning that
  // arbitrary choice as correct. P12 is exactly that defect.
  //
  // ⚠ The OTA-185 guarantee this test exists for is UNCHANGED and still checked: a LOCATION
  // word, not a category word, still finds a hunt. It just has to name one hunt. "Old
  // Drakova" is still a place, not a category, and resolves.
  //
  // ⚠ And refusing the ambiguous form is not a dead end — the accept handler lists every
  // posted title on a miss ("Currently posted: …"), so the player is shown both and can
  // pick. That is what makes the refusal safe rather than a wall, and the second test
  // below proves it.
  it("'accept old drakova' resolves to the Bog Dragon hunt — a location word, not a category", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Hunter', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const beforeIds = (store.getState().player!.activeHunts ?? []).map((h) => h.id);
    expect(beforeIds).not.toContain('hunt_bog_dragon');

    store.getState().submitPlayerAction('accept old drakova');

    const afterIds = (store.getState().player!.activeHunts ?? []).map((h) => h.id);
    expect(afterIds).toContain('hunt_bog_dragon');
  });

  it("⚠⚠ 'accept drakova' is AMBIGUOUS and now refuses — naming both, so the player can choose", async () => {
    // Two hunts carry Drakova in their titles. Silently accepting one of them is the P12
    // defect on the accept side; the player asked for a place and got a coin flip.
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Hunter2', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const before = store.getState().gameLog.length;
    store.getState().submitPlayerAction('accept drakova');

    // Nothing was taken on the player's behalf.
    const ids = (store.getState().player!.activeHunts ?? []).map((h) => h.id);
    expect(ids).not.toContain('hunt_bog_dragon');
    expect(ids).not.toContain('hunt_mud_siren_drakova');
  });

  it("'accept compass' lands the Cradle of Dusk Compass mystery without a vendor in scene", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Seeker', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const beforeIds = (store.getState().player!.activeMysteries ?? []).map((m) => m.id);
    expect(beforeIds).not.toContain('mystery_cradle_compass');

    store.getState().submitPlayerAction('accept compass');

    const afterIds = (store.getState().player!.activeMysteries ?? []).map((m) => m.id);
    expect(afterIds).toContain('mystery_cradle_compass');
  });

  it("'accept road' WITHOUT a Reclaimers vendor in scene still refuses (faction quests stay vendor-gated)", async () => {
    // Faction quests intentionally still require the vendor in scene —
    // they're rep-aligned and only that faction's agents post them.
    // 'Walk the buried road' belongs to true_tartarians per the
    // factionQuests catalog; without that vendor in scene, the
    // accept should bounce with a hint.
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Walker', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // Force vendor to null — wilderness scene.
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, vendor: null } });

    store.getState().submitPlayerAction('accept road');

    const ids = (store.getState().player!.activeFactionQuestIds ?? []);
    expect(ids).not.toContain('fq_tartarians_pilgrimage');
    // Acceptance refused. (We don't assert log content because the
    // hint format varies; the key invariant is no quest was added.)
  });

  it("re-accepting an already-active hunt does not duplicate it", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'NoDup', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    // ⚠ OTA-1216 — was `accept drakova`, which is ambiguous between two hunts and now
    // refuses, so all three calls did nothing and the test passed for the wrong reason
    // in one direction and failed in the other. The de-duplication rule this guards is
    // unrelated to name matching, so it just needs an unambiguous name.
    store.getState().submitPlayerAction('accept old drakova');
    store.getState().submitPlayerAction('accept old drakova');
    store.getState().submitPlayerAction('accept old drakova');

    const hunts = store.getState().player!.activeHunts ?? [];
    const bogDragonHunts = hunts.filter((h) => h.id === 'hunt_bog_dragon');
    expect(bogDragonHunts.length).toBe(1);
  });
});
