// Regression test for the "use first aid kit" parser dispatch bug.
// Before the fix, `submitPlayerAction('use first aid kit')` routed
// through the use_relic skill-check path which builds a Wisdom roll
// against the FAK and never touched the player's inventory — the
// catalog description promises "1d6 HP on use" but the only way to
// actually consume one was through the "rest with X" rest-with-consumable
// path. The combat balance probe caught it: FAKs used = 0.00 across
// 400 fights where the player WAS commanded to use them.
//
// After the fix: invoking 'use <consumable>' consumes one and heals
// 1d6 HP. Non-consumable relics still hit the skill-check path.

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

describe('use <consumable> dispatch', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('consumes one First Aid Kit and heals HP when player types "use first aid kit"', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'FakUser', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    // Stock a known starting state: 2 FAKs, HP at 5/30 so heal has room
    // to land. mergeOrPushItem would dedupe, so push by id directly.
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        hpMax: 30,
        hp: 5,
        inventory: [
          ...p0.inventory.filter((i) => i.name !== 'First Aid Kit'),
          { id: 'fak_test', name: 'First Aid Kit', kind: 'consumable', quantity: 2, tags: ['healing'] },
        ],
      },
    });

    store.getState().submitPlayerAction('use first aid kit');

    const p1 = store.getState().player!;
    const remainingFaks = p1.inventory.find((i) => i.name === 'First Aid Kit')?.quantity ?? 0;
    expect(remainingFaks).toBe(1);
    // v2.4.1 (OTA 021) — First Aid Kit now declares an effect block
    // (+25 HP, +10 stamina, cureBleed). From 5/30 with 25 room the
    // heal lands the player at 30 HP (clamped to hpMax).
    expect(p1.hp).toBe(30);
    // No pending dice roll should have been queued — the consumable
    // path bypasses the skill check.
    expect(store.getState().pendingRolls).toBeNull();
  });

  it('does NOT consume a relic ("use the locket") — falls through to skill check', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'RelicUser', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        inventory: [
          ...p0.inventory.filter((i) => i.name !== 'Aetheric Locket'),
          { id: 'locket_test', name: 'Aetheric Locket', kind: 'relic', quantity: 1, tags: ['relic'] },
        ],
      },
    });

    store.getState().submitPlayerAction('use the locket');

    // A relic should queue a skill check, not silently consume.
    const stillThere = store.getState().player!.inventory.find((i) => i.name === 'Aetheric Locket');
    expect(stillThere?.quantity).toBe(1);
    expect(store.getState().pendingRolls).not.toBeNull();
    // Tidy: cancel the roll so it doesn't leak into other tests.
    store.getState().cancelPendingRolls();
  });
});
