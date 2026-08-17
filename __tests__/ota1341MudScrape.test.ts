// ⚠ OTA-1341 — THE SCRAPE WAKES THE MUD.
//
// Owner tried to preempt a mud fight from a remembered beat — *"you examine the
// mud. the mud changes shape"* — and from the original design where *"any edged
// metal item scrapes the ground."* The affordance was never wired: the bulging
// mud (mud_golem_stir) only answered INVESTIGATE. Now, on the omen's own ground,
// dragging an edge through the mud raises the golem — the same encounter, the
// same hook resolution, one more honest door into it. The rules this pins:
//   · with the omen in the scene, dig = the golem stands up (deterministic);
//   · the hook resolves — no double-raise from scraping twice;
//   · on ordinary ground (no omen), dig stays the safe loot loop it has always
//     been — no golem, ever.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
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
import type { InventoryItem } from '../app/engine/types';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

async function bootOnMud(withOmen: boolean) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Scraper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  store.setState((s) => ({
    player: {
      ...s.player!,
      // OUTDOORS — the outpost's floor has its own scavenge path; the scrape is
      // a wild-ground affordance, so the fixture stands on the open plains.
      currentLocationId: 'great_tartary_plains',
      hubRoomId: null,
      inventory: [
        { id: 'knife1', name: 'Pocket Knife', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon', 'knife', 'tool'] },
      ] as InventoryItem[],
    } as never,
    currentScene: {
      ...s.currentScene!,
      location: { id: 'great_tartary_plains', name: 'Great Tartary Plains', type: 'plains', tags: ['plains', 'mud', 'outdoor'] },
      enemies: [],
      enemyHps: [],
      hooks: withOmen
        ? [{ id: 'stir1', kind: 'mud_golem_stir', stage: 0, resolved: false, nouns: ['mud', 'bulge', 'golem', 'mound'] }]
        : [],
    } as never,
  }));
  return store;
}

const enemies = () => (useGameStore.getState().currentScene?.enemies ?? []).map((e) => e.name);
const worldText = (from: number) =>
  useGameStore.getState().gameLog.slice(from).map((e) => String((e as { text: string }).text)).join(' | ');

describe('OTA-1341 — scraping the omen ground raises the Mud Golem', () => {
  it('⚠⚠ dig on the bulging mud → "The mud changes shape." → the golem stands up', async () => {
    const store = await bootOnMud(true);
    const from = store.getState().gameLog.length;
    store.getState().submitPlayerAction('dig');
    expect(worldText(from)).toContain('The mud changes shape');
    expect(enemies()).toContain('Mud Golem');
  });

  it('⚠ the hook resolves with the raise — a second scrape cannot double-summon', async () => {
    const store = await bootOnMud(true);
    store.getState().submitPlayerAction('dig');
    const golems = () => enemies().filter((n) => n === 'Mud Golem').length;
    expect(golems()).toBe(1);
    // Clear the fight so the second dig isn't refused for combat, then dig again.
    store.setState((s) => ({ currentScene: { ...s.currentScene!, enemies: [], enemyHps: [] } as never }));
    store.getState().submitPlayerAction('dig');
    expect(golems()).toBe(0); // no re-raise — the hook is resolved
  });

  it('⚠ ordinary ground stays the safe loot loop — no omen, no golem', async () => {
    const store = await bootOnMud(false);
    store.getState().submitPlayerAction('dig');
    expect(enemies()).not.toContain('Mud Golem');
  });
});
