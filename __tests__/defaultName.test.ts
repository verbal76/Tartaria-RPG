// Tungsten Spire — default-name generator. When a player skips the
// tutorial before the Arbiter's name beat, skipTutorial assigns a
// race-themed default name: a random flavor adjective + the singular
// race noun (e.g. "Dusty Reclaimer", "Confused Aetherborn").

// Importing gameStore pulls in the save system + native modules; mock
// them so the module hydrates under node (same bootstrap as the other
// store-importing tests).
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

import {
  generateDefaultName,
  raceSingular,
  DEFAULT_NAME_ADJECTIVE_POOL,
} from '../app/state/gameStore';

describe('raceSingular — title-cases the snake_case raceId', () => {
  it.each([
    ['tartarian_giant', 'Tartarian Giant'],
    ['mud_dweller', 'Mud Dweller'],
    ['reclaimer', 'Reclaimer'],
    ['architectural_sentinel', 'Architectural Sentinel'],
    ['mud_golem', 'Mud Golem'],
    ['unknowing_mass', 'Unknowing Mass'],
    ['aetherborn', 'Aetherborn'],
  ])('%s -> %s', (raceId, expected) => {
    expect(raceSingular(raceId)).toBe(expected);
  });

  it.each([[null], [undefined], ['']])('falls back to "Wanderer" for %s', (raceId) => {
    expect(raceSingular(raceId as string | null | undefined)).toBe('Wanderer');
  });
});

describe('generateDefaultName — "<Adjective> <Race>"', () => {
  it('is an adjective from the pool followed by the singular race', () => {
    // Sample heavily so the random adjective pick is well covered.
    for (let i = 0; i < 500; i++) {
      const name = generateDefaultName('reclaimer');
      expect(name.endsWith(' Reclaimer')).toBe(true);
      const adj = name.slice(0, name.length - ' Reclaimer'.length);
      expect((DEFAULT_NAME_ADJECTIVE_POOL as readonly string[]).includes(adj)).toBe(true);
    }
  });

  it('uses the singular race noun for multi-word races', () => {
    const name = generateDefaultName('mud_dweller');
    expect(name.endsWith(' Mud Dweller')).toBe(true);
  });

  it('handles the no-plural-suffix race (Aetherborn)', () => {
    expect(generateDefaultName('aetherborn').endsWith(' Aetherborn')).toBe(true);
  });

  it('falls back to "<Adjective> Wanderer" for an unknown race', () => {
    expect(generateDefaultName(null).endsWith(' Wanderer')).toBe(true);
  });

  it('eventually exercises the whole adjective pool', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const name = generateDefaultName('aetherborn');
      seen.add(name.slice(0, name.length - ' Aetherborn'.length));
    }
    expect(seen.size).toBe(DEFAULT_NAME_ADJECTIVE_POOL.length);
  });
});
