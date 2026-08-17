// ⚠⚠ OTA-1343 — THE MAP WALKS WITH YOU, COURSE OR NO COURSE.
//
// Owner's device log, first session with the OTA-1340 marker: six taps EAST from
// Iskan-Veil — *"my map marker did not move, and my location/weather line didn't
// update my location either."* Two roots, both pinned here:
//   · the marker anchored to the LOCATION's canonical cell, not the player's
//     authoritative absolute cell (gridX/gridY) — free wandering moves the cell
//     while currentLocationId still names the origin;
//   · the area label / discovery-in-passing / weather drift block in
//     stepDirection ran ONLY in transit (course set), and the else-branch
//     actively CLEARED the label — a free walk froze the scene bar.
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

import { useGameStore, playerGridCell } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { canonicalCellFor } from '../app/engine/worldMap';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

async function bootWild() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Walker', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  const cell = canonicalCellFor('iskan_veil');
  store.setState((s) => ({
    player: {
      ...s.player!,
      currentLocationId: 'iskan_veil',
      hubRoomId: null,
      gridX: cell.x, gridY: cell.y,
      travelTarget: null,
    } as never,
    currentScene: {
      ...s.currentScene!,
      location: { id: 'iskan_veil', name: 'Iskan-Veil', type: 'lost_capital', tags: ['ruin', 'outdoor'] },
      enemies: [], enemyHps: [], hooks: [],
      transitArea: null,
    } as never,
  }));
  return store;
}

describe('OTA-1343 — the marker and the bar follow a free walk', () => {
  it('⚠⚠ playerGridCell advances with every free step — the marker anchor moves', async () => {
    const store = await bootWild();
    const start = playerGridCell(store.getState().player!);
    store.getState().stepDirection('east');
    store.getState().stepDirection('east');
    store.getState().stepDirection('east');
    const after = playerGridCell(store.getState().player!);
    expect(after.x).toBe(start.x + 3);
    expect(after.y).toBe(start.y);
    // currentLocationId still names the origin — exactly the state that fooled
    // the OTA-1340 anchor. The marker reads playerGridCell, so it has moved.
    expect(store.getState().player!.currentLocationId).toBe('iskan_veil');
  });

  it('⚠⚠ a FREE walk sets the "near X" area label — no course required', async () => {
    const store = await bootWild();
    expect(store.getState().player!.travelTarget ?? null).toBeNull();
    store.getState().stepDirection('east');
    const label = store.getState().currentScene?.transitArea ?? null;
    expect(label).not.toBeNull();
    expect(String(label)).toMatch(/^near /);
  });

  it('⚠ the label tracks the walk instead of being cleared per step (the old else-branch)', async () => {
    const store = await bootWild();
    store.getState().stepDirection('east');
    const first = store.getState().currentScene?.transitArea ?? null;
    expect(first).not.toBeNull();
    store.getState().stepDirection('east');
    // Still labelled after a second free step — the old code wiped it here.
    expect(store.getState().currentScene?.transitArea ?? null).not.toBeNull();
  });
});
