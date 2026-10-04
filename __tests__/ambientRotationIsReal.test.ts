/**
 * The ambient-noun window rotation — pinned at the primitive that does it.
 *
 * Every scene shows at most AMBIENT_DISPLAY_CAP of a location's (up to 100+) ambient nouns, and which
 * ones depends on the tile: `shuffleSliceSeeded(pool, n, seed)` with the seed mixed from the tile's
 * coordinates, so neighbouring tiles differ and a backtrack repeats.
 *
 * WHY THIS EXISTS. Two other suites looked as though they covered it and did not: with this function
 * replaced by a plain `slice(0, n)` — every rotation off — `ambientNounVariety` still passed (its
 * variety comes from the real tile pools and gear) and `interactionStress`'s "distinct look subsets"
 * count went UP (it counts any change to the displayed list). This suite fails under that mutation.
 */
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

import { shuffleSliceSeeded } from '../app/state/gameStore';

const POOL = Array.from({ length: 36 }, (_, i) => `noun${i}`);
const CAP = 8;
// The seed stepDirection mixes from a tile (see the re-shuffle block in gameStore).
const tileSeed = (x: number, y: number) => (((x + 1000) & 0xffff) * 65537) ^ ((y + 1000) & 0xffff);

describe('shuffleSliceSeeded — the rotation primitive', () => {
  it('is a pure function of (pool, n, seed): the same tile shows the same nouns, always', () => {
    const a = shuffleSliceSeeded(POOL, CAP, tileSeed(4, 5));
    const b = shuffleSliceSeeded(POOL, CAP, tileSeed(4, 5));
    expect(a).toEqual(b);
  });

  it('returns n distinct members of the pool', () => {
    const w = shuffleSliceSeeded(POOL, CAP, tileSeed(9, 2));
    expect(w).toHaveLength(CAP);
    expect(new Set(w).size).toBe(CAP);
    for (const n of w) expect(POOL).toContain(n);
  });

  it('gives different tiles different windows — walking changes what you are shown', () => {
    const tiles: Array<[number, number]> = [[4, 4], [4, 5], [4, 6], [5, 6], [4, 5 + 100], [20, 3], [3, 20], [11, 11]];
    const windows = new Set(tiles.map(([x, y]) => shuffleSliceSeeded(POOL, CAP, tileSeed(x, y)).join('|')));
    expect(windows.size).toBeGreaterThanOrEqual(6);
  });

  it('distinguishes (x, y) from (y, x) — the mix is not symmetric', () => {
    expect(shuffleSliceSeeded(POOL, CAP, tileSeed(3, 5)).join('|'))
      .not.toBe(shuffleSliceSeeded(POOL, CAP, tileSeed(5, 3)).join('|'));
  });

  it('is not a prefix: the window is not just the first n of the pool', () => {
    const prefix = POOL.slice(0, CAP).join('|');
    const differing = [[1, 1], [2, 7], [8, 3], [13, 13]].filter(([x, y]) => shuffleSliceSeeded(POOL, CAP, tileSeed(x!, y!)).join('|') !== prefix);
    expect(differing.length).toBeGreaterThanOrEqual(3);
  });

  it('a pool no bigger than the window is shown whole, in order, whatever the seed', () => {
    const small = POOL.slice(0, CAP);
    expect(shuffleSliceSeeded(small, CAP, 1)).toEqual(small);
    expect(shuffleSliceSeeded(small, CAP, 99999)).toEqual(small);
  });
});
