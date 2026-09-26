// I-011 / D-aetherbuff-never-cleared — production defect repair.
//
// effectiveStats() (app/engine/equipment.ts:1101-1102) is a read-time expiry
// gate for player.aetherBuff (Aether Dust's +3-for-5-real-minutes food buff)
// — it stops applying the bonus once `Date.now() >= expiresAtMs`. But no
// write site anywhere ever cleared/deleted the field itself once expired: a
// full-repo grep for aetherBuff found exactly one write site
// (selectAetherStat, gameStore.ts) and it only ever SETS the field, never
// clears it. The stale object lingered in player state (and every save file)
// forever, with no player-visible symptom today only because the read gate
// already hides it — but any future reader that trusted the field's mere
// presence instead of re-checking expiry would misbehave.
//
// Fix: advanceTime() (gameStore.ts) — a pure function invoked on every
// player action — now drops player.aetherBuff to undefined the moment
// Date.now() has passed its expiresAtMs, exactly the same way it already
// pure-computes the dog's loyalty decay on every call.
//
// This test drives the real production door directly: advanceTime(), the
// exact exported pure function every action in the game calls.

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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import { advanceTime } from '../app/state/gameStore';
import type { PlayerCharacter } from '../app/engine/types';

function basePlayer(overrides: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return {
    hoursElapsed: 0,
    hp: 10,
    hpMax: 10,
    ...overrides,
  } as PlayerCharacter;
}

describe('I-011 — aetherBuff is cleared once expired, not left to linger forever', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears an EXPIRED aetherBuff on the next advanceTime() call', () => {
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const player = basePlayer({
      aetherBuff: { stat: 'strength', bonus: 3, expiresAtMs: now - 1 }, // already expired
    });

    const next = advanceTime(player, 0.1);

    expect(next.aetherBuff).toBeUndefined();
  });

  it('negative control: a STILL-ACTIVE aetherBuff survives advanceTime() untouched', () => {
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const active = { stat: 'strength' as const, bonus: 3, expiresAtMs: now + 60_000 };
    const player = basePlayer({ aetherBuff: active });

    const next = advanceTime(player, 0.1);

    expect(next.aetherBuff).toEqual(active);
  });

  it('a player with no aetherBuff at all is unaffected', () => {
    const player = basePlayer();
    const next = advanceTime(player, 1);
    expect(next.aetherBuff).toBeUndefined();
  });
});
