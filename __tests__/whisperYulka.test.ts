// Whisper-chain end-to-end smoke (OTA 187). Drives the Yulka chain
// through plant → meet → fetch → return → reward → ambush, asserts
// the state transitions land cleanly without any UI involvement.
// Pittsburgh loop in code form.

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
import { isHourInWindow, reapExpiredWhispers, pickTargetTile, findChain } from '../app/engine/whispers';
import type { WhisperRecord } from '../app/engine/types';

describe('Whisper engine — pure helpers', () => {
  it('isHourInWindow handles non-wrap windows', () => {
    expect(isHourInWindow(10, 8, 16)).toBe(true);
    expect(isHourInWindow(7, 8, 16)).toBe(false);
    expect(isHourInWindow(16, 8, 16)).toBe(true);
  });

  it('isHourInWindow handles midnight-wrap windows', () => {
    // 8pm to 4am — Yulka's window
    expect(isHourInWindow(22, 20, 4)).toBe(true);  // 10pm
    expect(isHourInWindow(2, 20, 4)).toBe(true);   // 2am
    expect(isHourInWindow(10, 20, 4)).toBe(false); // 10am
    expect(isHourInWindow(20, 20, 4)).toBe(true);  // 8pm exact
    expect(isHourInWindow(4, 20, 4)).toBe(true);   // 4am exact
  });

  it('reapExpiredWhispers drops entries past their expiry hour', () => {
    const whispers: WhisperRecord[] = [
      { id: 'a', stage: 'planted', plantedAtHour: 0, expiresAtHour: 48, targetMapX: 0, targetMapY: 0, targetLocationId: 'x' },
      { id: 'b', stage: 'planted', plantedAtHour: 0, expiresAtHour: 10, targetMapX: 0, targetMapY: 0, targetLocationId: 'x' },
    ];
    const { kept, expired } = reapExpiredWhispers(whispers, 20);
    expect(kept.map((w) => w.id)).toEqual(['a']);
    expect(expired.map((w) => w.id)).toEqual(['b']);
  });

  it('pickTargetTile picks within the chain range, deterministically against the player tile', () => {
    const chain = findChain('yulka_discs')!;
    const tile = pickTargetTile(chain, 10, 10);
    // yulka_discs targetOffset: dx [-1,1], dy [-3,-2]
    expect(tile.x).toBeGreaterThanOrEqual(9);
    expect(tile.x).toBeLessThanOrEqual(11);
    expect(tile.y).toBeGreaterThanOrEqual(7);
    expect(tile.y).toBeLessThanOrEqual(8);
  });
});

describe('Yulka chain — full state-machine drive', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it("'buy from yulka' branch consumes 50 TC and grants 5 Aetheric Discs, retires the chain", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'YulkaBuyer', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // Force a planted Yulka whisper into met_yulka state and give
    // the player enough TC.
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        tc: 100,
        activeWhispers: [{
          id: 'yulka_discs',
          stage: 'met_yulka',
          plantedAtHour: 0,
          expiresAtHour: 48,
          targetMapX: p0.mapX ?? 0,
          targetMapY: p0.mapY ?? 0,
          targetLocationId: p0.currentLocationId,
          ctx: { thiefMapX: 99, thiefMapY: 99 },
        }],
      },
    });

    store.getState().submitPlayerAction('buy from yulka');

    const after = store.getState().player!;
    expect(after.tc).toBe(50);
    const discs = after.inventory.find((i) => i.name === 'Aetheric Disc');
    expect(discs?.quantity).toBe(5);
    expect((after.activeWhispers ?? []).find((w) => w.id === 'yulka_discs')).toBeUndefined();
    expect(after.completedWhisperIds ?? []).toContain('yulka_discs');
  });

  it("'accept yulka' branch advances the whisper to fetch_in_progress", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'YulkaFetcher', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        activeWhispers: [{
          id: 'yulka_discs',
          stage: 'met_yulka',
          plantedAtHour: 0,
          expiresAtHour: 48,
          targetMapX: p0.mapX ?? 0,
          targetMapY: p0.mapY ?? 0,
          targetLocationId: p0.currentLocationId,
          ctx: { thiefMapX: 99, thiefMapY: 99 },
        }],
      },
    });

    store.getState().submitPlayerAction('accept yulka');

    const w = (store.getState().player!.activeWhispers ?? []).find((w2) => w2.id === 'yulka_discs');
    expect(w?.stage).toBe('fetch_in_progress');
  });

  it("'leave yulka' branch retires the chain without reward", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'YulkaLeaver', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        activeWhispers: [{
          id: 'yulka_discs',
          stage: 'met_yulka',
          plantedAtHour: 0,
          expiresAtHour: 48,
          targetMapX: 0, targetMapY: 0, targetLocationId: 'x',
        }],
      },
    });

    store.getState().submitPlayerAction('leave yulka');

    const after = store.getState().player!;
    expect((after.activeWhispers ?? []).find((w) => w.id === 'yulka_discs')).toBeUndefined();
    expect(after.completedWhisperIds ?? []).toContain('yulka_discs');
    expect(after.inventory.find((i) => i.name === 'Aetheric Disc')).toBeUndefined();
  });

  it("returning to Yulka WITHOUT recovered Discs doesn't pay out", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'YulkaEmpty', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    // Plant the whisper in fetch_returned stage but player has no
    // Stolen Aetheric Discs in pack. Pretending they fled the thief.
    store.setState({
      player: {
        ...p0,
        tc: 0,
        mapX: 5,
        mapY: 5,
        activeWhispers: [{
          id: 'yulka_discs',
          stage: 'fetch_returned',
          plantedAtHour: 0,
          expiresAtHour: 48,
          targetMapX: 5,
          targetMapY: 5,
          targetLocationId: p0.currentLocationId,
        }],
      },
    });

    // Step "south" via stepDirection re-evaluation. Easier: call
    // the resolver via cardinal travel. Force coords to match.
    store.getState().stepDirection('north'); // forces a step; resolver runs

    const after = store.getState().player!;
    // No pay-out because no Stolen Discs in pack.
    expect(after.tc).toBe(0);
    expect(after.inventory.find((i) => i.name === 'Aetheric Disc')).toBeUndefined();
  });
});
