// OTA-1000 — two scene-interaction dead-ends the playtest log surfaced.
//
//  (1) TAKE a weapon-named scene noun. The player saw an "ice axe" in
//      the room, typed `take ice axe`, and the engine refused ("part of
//      the ground — try SALVAGE") because "ice axe" isn't a literal
//      catalog row. Salvage then also dead-ended. Anything that READS as
//      a weapon (findWeaponByName's inference — the same logic the
//      display + combat already use) should hand the player an improvised
//      instance instead of refusing. Plain scenery (hearth, shelf) still
//      refuses.
//
//  (2) SALVAGE a noun that was resolved via context rather than the
//      scene's ambientNouns (e.g. a location alias or a noun the player
//      just investigated). The harvest handler only consulted
//      matchAmbientNoun(scene.ambientNouns) and fell through to a flavor
//      dead-end when the noun resolved through the recency/context path
//      instead. It now falls back to the parser's resolvedNoun so salvage
//      actually rolls.

jest.setTimeout(20000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
      static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

async function bootstrap(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name, raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

function tailLog(n = 8): string {
  return useGameStore.getState().gameLog.slice(-n).map((e) => e.text).join('\n');
}

describe('OTA-1000 — take infers a weapon from a weapon-named scene noun', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('`take ice axe` grants an improvised Ice Axe weapon instead of the salvage refusal', async () => {
    const store = await bootstrap('AxeGrabber');
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        enemies: [],
        ambientNouns: ['ice axe', 'silt', 'hearth'],
        displayedAmbientNouns: ['ice axe', 'silt', 'hearth'],
      },
    });

    const before = store.getState().player!.inventory
      .filter((i) => /ice axe/i.test(i.name)).length;

    store.getState().submitPlayerAction('take ice axe');

    const inv = store.getState().player!.inventory;
    const axe = inv.find((i) => /ice axe/i.test(i.name));
    expect(axe).toBeTruthy();
    expect(axe!.kind).toBe('weapon');
    // A brand-new instance was granted (not a merge into a pre-existing row).
    expect(inv.filter((i) => /ice axe/i.test(i.name)).length).toBe(before + 1);
    // The old dead-end refusal must NOT be what the player saw.
    expect(tailLog()).not.toMatch(/try SALVAGE/i);
  });

  it('`take mildew` (plain scenery) still refuses — inference does not fire for non-weapons', async () => {
    const store = await bootstrap('MildewPoker');
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene,
        enemies: [],
        ambientNouns: ['mildew', 'silt'],
        displayedAmbientNouns: ['mildew', 'silt'],
      },
    });

    store.getState().submitPlayerAction('take mildew');

    const inv = store.getState().player!.inventory;
    // "mildew" doesn't read as a weapon → no inferred grant, no reward line.
    expect(inv.find((i) => /mildew/i.test(i.name))).toBeFalsy();
    // Scenery still routes to the salvage-redirect refusal.
    expect(tailLog()).toMatch(/salvage/i);
  });
});

describe('OTA-1000 — salvage falls back to the context-resolved noun', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('`salvage <alias>` rolls a salvage outcome even when the noun is not in ambientNouns', async () => {
    const store = await bootstrap('Scavenger');
    const scene = store.getState().currentScene!;
    // "reactor" is a LOCATION ALIAS — collectSceneNouns() feeds it to the
    // parser's recentNouns so `salvage reactor` resolves via context, but
    // it is deliberately NOT in ambientNouns, so the old matchAmbientNoun-
    // only path missed it and dead-ended. It must now reach the harvest
    // roll (any non-refusal salvage line).
    store.setState({
      currentScene: {
        ...scene,
        enemies: [],
        // hooks cleared + the room's one-per-visit investigate ambush marked
        // spent, so the salvage deterministically reaches the harvest handler
        // instead of being preempted by the sporadic ~6% ambush roll (arb168).
        hooks: [],
        investigateAmbushUsed: true,
        ambientNouns: ['rubble'],
        displayedAmbientNouns: ['rubble'],
        location: { ...scene.location, aliases: [...(scene.location.aliases ?? []), 'reactor'] },
      },
    });

    const hoursBefore = store.getState().player!.hoursElapsed ?? 0;
    store.getState().submitPlayerAction('salvage reactor');

    const log = tailLog(10);
    // The old dead-end phrasing — the salvage attempt landing on the
    // flavor "already examined / nothing to work over" gate — must be gone.
    expect(log).not.toMatch(/don'?t see (a|any)|nothing (here|to)|already examined/i);
    // The fallback strips a leading article so the salvage line templates
    // (which prepend their own "The") don't emit "The the reactor".
    expect(log).not.toMatch(/\bthe the\b/i);
    // Deterministic proof the harvest handler actually RAN (rather than
    // dead-ending): the harvest branch unconditionally spends the skill-
    // check time (0.25h) before rolling an outcome, whereas the pre-fix
    // fall-through advanced the clock by 0. Outcome-independent, so no RNG
    // flakiness. (The old per-noun marker assertion was produced-gated and
    // could stay false on some salvage outcomes.)
    const hoursAfter = store.getState().player!.hoursElapsed ?? 0;
    expect(hoursAfter - hoursBefore).toBeGreaterThanOrEqual(0.2);
  });
});
