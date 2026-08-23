// ⚠ OTA-1352 — REFUSALS ALWAYS SPEAK: the rest-in-combat refusal repeats.
//
// The B15 dig found the movement sim wedged on the OTA-1140 rest-in-combat
// refusal — and could not see WHY, because from the second identical tap on
// the arbiter repeat-dedup (OTA-610) swallowed the line entirely. A real
// player in the same spot (enemies closing, stamina gone) mashes REST and
// gets one answer, then dead silence: the "dead button" read again. The
// refusal now passes skipDedup — a direct answer to a player action must
// reach the player every single time, however often they ask.
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

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { readFileSync } from 'fs';
import { join } from 'path';
import { blockAt } from '../test-utils/srcBlock';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

const REFUSAL = 'Nothing here has agreed to that';

async function bootIntoCombat() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Mashers', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  store.getState().submitPlayerAction('leave outpost');
  store.setState((s) => ({
    player: { ...s.player!, stamina: 3, hp: s.player!.hpMax } as never,
    currentScene: {
      ...s.currentScene!,
      range: 'mid',
      enemies: [
        { name: 'Mud Monarchs Raider 1', type: 'Human', hp: 15, attack: 'Quick Knife', damage: '1D6', aliases: ['raider'], traits: ['quick'] },
      ],
      enemyHps: [15],
    } as never,
  }));
  return store;
}

describe('OTA-1352 — the rest-in-combat refusal speaks on every tap', () => {
  it('⚠⚠ three rests in a fight: three refusal lines, not one line and silence', async () => {
    const store = await bootIntoCombat();
    const countRefusals = () =>
      store.getState().gameLog.filter((e) => e.channel === 'arbiter' && e.text.includes(REFUSAL)).length;
    expect(countRefusals()).toBe(0);
    store.getState().submitPlayerAction('rest');
    expect(countRefusals()).toBe(1);
    store.getState().submitPlayerAction('rest');
    expect(countRefusals()).toBe(2);
    store.getState().submitPlayerAction('rest');
    expect(countRefusals()).toBe(3);
    // And the refusal is a refusal: no time passed, no stamina moved.
    expect(store.getState().player!.stamina).toBe(3);
  });

  it('⚠ the ambient-chatter dedup itself is untouched (repeat arbiter flavor still swallowed)', async () => {
    const store = await bootIntoCombat();
    // A non-refusal arbiter line appended twice through the store API is
    // deduped — OTA-610's protection against duplicate chatter stands.
    store.getState().appendLog('arbiter', '"I\'d place that at a Hard, if I had to guess."');
    store.getState().appendLog('arbiter', '"I\'d place that at a Hard, if I had to guess."');
    const n = store.getState().gameLog.filter((e) => e.channel === 'arbiter' && e.text.includes('at a Hard')).length;
    expect(n).toBe(1);
  });

  it('⚠ source lock: the refusal carries skipDedup', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const at = src.indexOf('Nothing here has agreed to that');
    expect(at).toBeGreaterThan(-1);
    expect(blockAt(src, 'Nothing here has agreed to that')).toContain('skipDedup: true');
  });
});
