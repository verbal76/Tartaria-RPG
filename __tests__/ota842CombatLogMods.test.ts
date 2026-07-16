// OTA-842 [combat-log restructure] — an incoming hit's modifiers used to append as
// run-on parentheticals ("(armor turns 40% of the cold)(your title turns aside half
// the cold)(stone ward soaks 3)"). damageModClause collects them into one terse
// bracketed clause instead: " [armor −40%, title ½, ward soaks 3]".

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

import { damageModClause } from '../app/state/gameStore';

describe('OTA-842 — damageModClause', () => {
  it('no modifiers → empty clause (no bracket)', () => {
    expect(damageModClause({})).toBe('');
  });

  it('a single modifier → a one-item bracket', () => {
    expect(damageModClause({ armorFraction: 0.4 })).toBe(' [armor −40%]');
  });

  it('multiple modifiers → ONE comma-separated bracket in apply-order', () => {
    const c = damageModClause({
      armorFraction: 0.4,
      titleHalved: true,
      raceTag: ' (Aetherstone Resilience absorbs 25%)',
      shield: true,
      wardTag: ' (stone ward soaks 3)',
    });
    expect(c).toBe(' [armor −40%, title ½, Aetherstone Resilience absorbs 25%, shield ½, stone ward soaks 3]');
    // The old run-on ")(" wall must NOT appear.
    expect(c).not.toContain(')(');
  });

  it('a race VULNERABILITY shows as a "+N%" modifier (bracket lists increases too)', () => {
    const c = damageModClause({ raceTag: ' (Aetherstone Vulnerability — +50% dmg)' });
    expect(c).toBe(' [Aetherstone Vulnerability — +50% dmg]');
  });

  it('Etherbound flat shave shows when no title-halve fired', () => {
    expect(damageModClause({ titleShaved: 4 })).toBe(' [Etherbound −4]');
  });

  it('title-halve takes precedence over the flat shave (they never both list)', () => {
    expect(damageModClause({ titleHalved: true, titleShaved: 4 })).toBe(' [title ½]');
  });

  it('strips the raw parentheses off the race/ward tags', () => {
    const c = damageModClause({ wardTag: ' (stone ward soaks 2)' });
    expect(c).not.toContain('(');
    expect(c).not.toContain(')');
    expect(c).toContain('stone ward soaks 2');
  });
});
