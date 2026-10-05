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
import { placedAt } from '../test-utils/placePlayer';

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
    // ⚠ OTA-1601 — placed on VERIFIED-OPEN silt (three south of the Plains
    // seat; cells (40,16)…(41,18) hold no canon location). The old fixture
    // walked from the faction start, and the world has grown named tiles
    // beside the starts — a step that ARRIVES rebuilds the scene and replaces
    // the synthetic pool this suite exists to watch.
    store.setState((s) => (s.player ? { player: { ...s.player, hubRoomId: null, ...placedAt('great_tartary_plains', { dy: 3 }) } } : s));

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
    const gearSeen: string[] = [];
    function snapshot(label: string) {
      const p = store.getState().player!;
      const s = store.getState().currentScene!;
      const key = `${label}@${p.mapX},${p.mapY}`;
      tileSnapshots[key] = [...(s.displayedAmbientNouns ?? [])];
      gearSeen.push(...((s as { tileGearNouns?: string[] }).tileGearNouns ?? []));
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
    // A return leg that lands on a tile already shown (see the determinism block below).
    // back-start stands at south1's column + 1 (the east step), one row up: west, then south, is south1's tile.
    store.getState().stepDirection('west');
    store.getState().stepDirection('south');
    snapshot('again-south1');

    // ⚠ WHAT THIS ASSERTS, AND WHY IT IS NOT A COUNT OF DISTINCT DISPLAYS.
    // It used to count distinct FULL displays (≥ 3). Each tile also places its own gear and the
    // cross-tile variety window hides recent picks, so the displayed list changes from tile to tile
    // WITH EVERY ROTATION SWITCHED OFF: replacing shuffleSliceSeeded by a plain slice(0, n) left that
    // count at 4 and the suite green. Measured on that mutation, the pool-derived part of every window
    // was a PREFIX of the pool. So the claim that actually separates rotation from its absence is
    // reach: across the walked tiles the windows draw on much more of the pool than one window holds.
    const poolWindow = (arr: string[]): string[] => arr.filter((n) => bigPool.includes(n));
    const windows = Object.entries(tileSnapshots)
      .filter(([k]) => !k.startsWith('start@')) // 'start' is the synthetic seed, not a shuffle output
      .map(([, arr]) => poolWindow(arr));
    const reach = new Set(windows.flat());
    // 8-slot window over a 36-noun pool, five stepped tiles: unrotated reach is exactly the first 8.
    expect(reach.size).toBeGreaterThanOrEqual(16);
    // …and it is not merely the head of the pool.
    expect([...reach].filter((n) => !bigPool.slice(0, 8).includes(n)).length).toBeGreaterThanOrEqual(8);

    // Determinism: stepping back onto a tile already shown gives (nearly) the display it gave before.
    // ⚠ This block used to run only `if (sameCoord)` — and the walk never returned to the start's
    // coordinates (a step ARRIVES and the map cell jumps), so it asserted nothing, ever. The return leg
    // above lands on south1's tile; the coordinates are asserted equal so it cannot silently skip, and the
    // POOL-derived windows must overlap heavily (not equal: the OTA-973 variety window can deliberately
    // hide a pick on a return leg, OTA-1301). A re-roll that ignored the tile would share ~2 of 8.
    const first = Object.keys(tileSnapshots).find((k) => k.startsWith('south1@'))!;
    const again = Object.keys(tileSnapshots).find((k) => k.startsWith('again-south1@'))!;
    expect(again.split('@')[1]).toBe(first.split('@')[1]);
    const w1 = poolWindow(tileSnapshots[first]!);
    const w2 = poolWindow(tileSnapshots[again]!);
    expect(w1.filter((n) => w2.includes(n)).length).toBeGreaterThanOrEqual(Math.min(w1.length, w2.length) - 2);

    // Every displayed list must be drawn FROM the pool — no rogue
    // entries snuck in.
    //
    // ⚠ OTA-1301 — "from the pool" is about the SHUFFLE not inventing nouns. A
    // cardinal step also PLACES that tile's gear, which is a deliberate addition,
    // not a rogue entry — so gear is allowed and everything else must still come
    // from the pool. Pinning it this way keeps the original guarantee intact: a
    // shuffle that invented a noun would still fail here.
    const placedGear = new Set(gearSeen);
    for (const list of Object.values(tileSnapshots)) {
      for (const noun of list) {
        if (placedGear.has(noun)) continue;
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
    // ⚠ OTA-1601 — same verified-open placement as the walk above.
    store.setState((s) => (s.player ? { player: { ...s.player, hubRoomId: null, ...placedAt('great_tartary_plains', { dy: 3 }) } } : s));

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
    //
    // ⚠ OTA-1301 — this used to assert the displayed list was BYTE-IDENTICAL to
    // the pool, which is a stronger claim than the rule it is named for and than
    // its own comment makes. The rule is that a small pool is not shuffled and
    // not truncated. Landing on a new tile also places that tile's gear, and a
    // byte-identity assertion called that a regression. Pin the rule: every
    // authored noun survives, in order, and the only additions are the gear the
    // step just placed — so a genuine truncation or re-order still fails here.
    const gear = (store.getState().currentScene as { tileGearNouns?: string[] }).tileGearNouns ?? [];
    expect(after.filter((n) => smallPool.includes(n))).toEqual(smallPool);
    expect(after.filter((n) => !smallPool.includes(n))).toEqual(gear);
  });
});
