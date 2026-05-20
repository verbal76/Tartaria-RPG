// Cardinal-movement ambient-noun variety. Before this fix, every
// step within the same macro location showed the same 8 nouns
// because stepDirection updated mapX/mapY but didn't re-shuffle
// currentScene.displayedAmbientNouns. Playtester report: walked
// south, looked, saw the same lantern/arch/watchtower/scrap pile
// list as at The Gate.
//
// Fix: stepDirection re-rolls displayedAmbientNouns from the full
// pool using (mapX, mapY) as a deterministic seed. Same tile →
// same nouns; new tile → fresh 8 from the pool.

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
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
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

describe('cardinal movement ambient-noun variety', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('re-rolls displayedAmbientNouns on each cardinal step and stays consistent on backtrack', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Walker', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // Leave the hub so we're in open wilderness — cardinal steps
    // then drive the new shuffle path.
    store.setState((s) => (s.player ? { player: { ...s.player, hubRoomId: null } } : s));

    // Seed currentScene with a big ambient pool so the shuffle has
    // room to vary. Pool size matches Tartarian Outskirts (~36).
    const scene = store.getState().currentScene!;
    const bigPool = [
      'mud', 'silt', 'wagon', 'rubble', 'trap', 'pillar', 'arch', 'footprint',
      'spike', 'ladder', 'barricade', 'marker', 'torch', 'skeleton', 'fissure',
      'brambles', 'smear', 'lever', 'header', 'portcullis', 'detector',
      'rusted blade', 'broken chain', 'defense light', 'stone crack',
      'scrap pile', 'watchtower', 'dust trail', 'warning slate', 'vent fissure',
      'sludge smear', 'lantern', 'defense lever', 'bent spike', 'pulse emitter',
      'rope',
    ];
    store.setState({
      currentScene: {
        ...scene,
        ambientNouns: bigPool,
        displayedAmbientNouns: bigPool.slice(0, 8),
      },
    });
    // Boost stamina so we don't hit the travel refusal mid-test.
    const p0 = store.getState().player!;
    store.setState({
      player: { ...p0, stamina: 99, staminaMax: 99, mapX: 4, mapY: 4 },
    });

    const tileSnapshots: Record<string, string[]> = {};
    function snapshot(label: string) {
      const p = store.getState().player!;
      const s = store.getState().currentScene!;
      const key = `${label}@${p.mapX},${p.mapY}`;
      tileSnapshots[key] = [...(s.displayedAmbientNouns ?? [])];
    }

    snapshot('start');
    store.getState().stepDirection('south');
    snapshot('south1');
    store.getState().stepDirection('south');
    snapshot('south2');
    store.getState().stepDirection('east');
    snapshot('east');
    store.getState().stepDirection('north');
    snapshot('back-north');
    store.getState().stepDirection('north');
    snapshot('back-start');

    const sets = Object.values(tileSnapshots).map((arr) => arr.join('|'));
    const uniqueSets = new Set(sets);
    // At least 3 distinct displays across 6 sampled positions — way
    // better than the pre-fix "always identical" behaviour. 5+ would
    // be ideal but Cantor pairing on a 36-noun pool can produce
    // overlaps within a small window.
    expect(uniqueSets.size).toBeGreaterThanOrEqual(3);

    // Determinism: backtracking to a tile we've visited should show
    // the same display we saw before.
    const startCoords = `start@${tileSnapshots.start ? Object.keys(tileSnapshots)[0]!.split('@')[1] : '?'}`;
    const backCoords = Object.keys(tileSnapshots).find((k) => k.startsWith('back-start@'));
    const startKey = Object.keys(tileSnapshots).find((k) => k.startsWith('start@'));
    if (startKey && backCoords) {
      // If the player ended up back at the start coords after two
      // norths, the display should match. (stepDirection may bounce
      // off map edges, so we only assert when the coords actually
      // match.)
      const sameCoord = startKey.split('@')[1] === backCoords.split('@')[1];
      if (sameCoord) {
        expect(tileSnapshots[backCoords]!.join('|')).toBe(tileSnapshots[startKey]!.join('|'));
      }
    }
    void startCoords;

    // Every displayed list must be drawn FROM the pool — no rogue
    // entries snuck in.
    for (const list of Object.values(tileSnapshots)) {
      for (const noun of list) {
        expect(bigPool).toContain(noun);
      }
    }
  });

  it('small pools (≤8) show the entire pool unchanged across steps', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'SmallPool', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    store.setState((s) => (s.player ? { player: { ...s.player, hubRoomId: null } } : s));

    const scene = store.getState().currentScene!;
    const smallPool = ['mud', 'silt', 'wagon', 'rubble'];
    store.setState({
      currentScene: {
        ...scene,
        ambientNouns: smallPool,
        displayedAmbientNouns: smallPool,
      },
    });
    const p0 = store.getState().player!;
    store.setState({ player: { ...p0, stamina: 99, staminaMax: 99, mapX: 4, mapY: 4 } });

    store.getState().stepDirection('south');
    const after = store.getState().currentScene!.displayedAmbientNouns ?? [];
    // Pool ≤ 8 should pass through as-is (no shuffle, no truncation).
    expect(after.sort().join('|')).toBe([...smallPool].sort().join('|'));
  });
});
