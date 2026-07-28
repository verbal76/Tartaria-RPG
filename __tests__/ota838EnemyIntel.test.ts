// OTA-838 — enemy weakness tags "once discovered." The EnemyPanel long promised
// "strike to learn" for low-Wisdom characters, but that discovery was a transient
// combat-log line — never persisted or shown. Now landing a weak/resist hit records
// it in worldMemory.enemyIntel (name-keyed), the panel reveals those observed types
// even below the Wisdom read-threshold, and the bestiary lists them. This locks the
// recorder's dedup/move behaviour (the panel/bestiary just read the field).

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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import { recordEnemyIntel } from '../app/state/gameStore';

// Minimal fake store: recordEnemyIntel only touches s.worldMemory via get()/set().
function makeStore(initial: Record<string, { weak: string[]; resist: string[] }> = {}) {
  let state: { worldMemory: { enemyIntel: Record<string, { weak: string[]; resist: string[] }> } } = {
    worldMemory: { enemyIntel: initial },
  };
  const get = () => state as never;
  const set = (fn: (s: never) => object) => { state = { ...state, ...(fn(state as never) as object) }; };
  return { get, set, intel: () => state.worldMemory.enemyIntel };
}

describe('OTA-838 — recordEnemyIntel banks observed damage-type matches', () => {
  it("a 'weak' hit records the type under the enemy (lowercased key)", () => {
    const s = makeStore();
    recordEnemyIntel(s.get, s.set, 'Mud Boar', 'burn', 'weak');
    expect(s.intel()['mud boar']).toEqual({ weak: ['burn'], resist: [] });
  });

  it("a 'resist' hit records under resist", () => {
    const s = makeStore();
    recordEnemyIntel(s.get, s.set, 'Iron Sentinel', 'slashing', 'resist');
    expect(s.intel()['iron sentinel']).toEqual({ weak: [], resist: ['slashing'] });
  });

  it("a 'normal' hit records nothing", () => {
    const s = makeStore();
    recordEnemyIntel(s.get, s.set, 'Mud Boar', 'piercing', 'normal');
    expect(s.intel()['mud boar']).toBeUndefined();
  });

  it('the same type is not duplicated on repeat observations', () => {
    const s = makeStore();
    recordEnemyIntel(s.get, s.set, 'Mud Boar', 'burn', 'weak');
    recordEnemyIntel(s.get, s.set, 'Mud Boar', 'burn', 'weak');
    expect(s.intel()['mud boar'].weak).toEqual(['burn']);
  });

  it('a contradicting observation MOVES a type from weak to resist (freshest wins)', () => {
    const s = makeStore({ 'mud boar': { weak: ['burn'], resist: [] } });
    recordEnemyIntel(s.get, s.set, 'Mud Boar', 'burn', 'resist');
    expect(s.intel()['mud boar']).toEqual({ weak: [], resist: ['burn'] });
  });

  it('multiple distinct types accumulate', () => {
    const s = makeStore();
    recordEnemyIntel(s.get, s.set, 'Mud Boar', 'burn', 'weak');
    recordEnemyIntel(s.get, s.set, 'Mud Boar', 'cold', 'weak');
    recordEnemyIntel(s.get, s.set, 'Mud Boar', 'slashing', 'resist');
    expect(new Set(s.intel()['mud boar'].weak)).toEqual(new Set(['burn', 'cold']));
    expect(s.intel()['mud boar'].resist).toEqual(['slashing']);
  });
});
