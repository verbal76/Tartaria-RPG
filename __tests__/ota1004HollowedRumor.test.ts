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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1004 — THE HOLLOWED, part 2: the HINT route. OTA-998 gave the fallen a
// random-encounter door (a 4% wild roll spawns the revenant outright). The
// owner asked for both — "hint missions that can be picked up AND random
// encounters" — so the same wild spawner now also plants a rumour marker the
// player may follow or walk past. Same pool, same boss, same put-to-rest.
import * as fs from 'fs';
import * as path from 'path';
import {
  HOOK_PLANTS, HOOK_WEIGHTS, getHookOutcome, pickRandomHookKind, plantHookByKind,
} from '../app/engine/hooks';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { _setFallenCacheForTests } from '../app/engine/fallenRevenants';
import type { FallenHero } from '../app/engine/saveSystem';

const FH: FallenHero = {
  name: 'Verbal', raceName: 'Tartarian Giant',
  epitaph: 'They died as they lived — mid-swing.',
  locationName: 'the Sentinel Ward', kills: 120, corruption: 'Untouched', hours: 40, ts: 4321,
};

describe('OTA-1004 — the Hollowed leave a trail', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
  afterAll(() => { _setFallenCacheForTests(null); });

  it('the rumour kind exists, and the random picker can never draw it', () => {
    expect(HOOK_PLANTS.fallen_whisper?.length).toBeGreaterThan(0);
    expect(HOOK_WEIGHTS.fallen_whisper).toBe(0);
    for (let i = 0; i < 500; i++) {
      expect(pickRandomHookKind()).not.toBe('fallen_whisper');
    }
    const planted = plantHookByKind('fallen_whisper');
    expect(planted.kind).toBe('fallen_whisper');
    expect(planted.nouns).toContain('marker');
    // Two beats, and the last one is what calls the revenant.
    expect(getHookOutcome('fallen_whisper', 0)?.done).toBe(false);
    const finale = getHookOutcome('fallen_whisper', 1);
    expect(finale?.done).toBe(true);
    expect(finale?.effects?.[0]?.type).toBe('spawn_fallen_revenant');
    expect(getHookOutcome('fallen_whisper', 2)).toBeNull();
  });

  it('following the marker to its end calls a fallen out of the mud', async () => {
    _setFallenCacheForTests([FH]);
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Wren', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const hook = plantHookByKind('fallen_whisper');
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], vendor: null, hooks: [hook] },
    }));
    // Beat 1 reads the marker; beat 2 answers it.
    store.getState().submitPlayerAction('examine the marker');
    await new Promise((r) => setTimeout(r, 30));
    store.getState().submitPlayerAction('examine the marker');
    await new Promise((r) => setTimeout(r, 30));
    const st = store.getState();
    expect(st.currentScene?.enemies?.[0]?.name).toBe('Hollowed Verbal');
    expect(st.worldMemory.activeRevenant?.ts).toBe(4321);
  });

  it('an install with nothing left un-avenged reads as a cold trail', async () => {
    _setFallenCacheForTests([{ ...FH, avengedTs: 999, avengedBy: 'someone else' }]);
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Wren2', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const hook = plantHookByKind('fallen_whisper');
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, enemies: [], enemyHps: [], vendor: null, hooks: [hook] },
    }));
    store.getState().submitPlayerAction('examine the marker');
    await new Promise((r) => setTimeout(r, 30));
    store.getState().submitPlayerAction('examine the marker');
    await new Promise((r) => setTimeout(r, 30));
    const st = store.getState();
    expect((st.currentScene?.enemies ?? []).length).toBe(0);
    const logs = st.gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/trail is cold/i);
  });

  it('category lock: the wild spawner offers BOTH doors — direct boss and rumour', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    // OTA-1014 — the plant now CARRIES the named fallen (chainId `fallen:<ts>`), so
    // the thing that rises is the thing the tale named.
    expect(src).toContain("plantFallenHook('fallen_whisper', `fallen:${fr.ts}`)");
    expect(src).toContain("spawn: fallen_whisper rumor");
    expect(src).toContain("case 'spawn_fallen_revenant': {");
    // ⚠ Both routes draw from the SAME pool — the intent this lock has always
    // guarded, and it earned its keep at OTA-1362: the shared-fallen wiring
    // joined the wild spawner to the imported dead and left the rumour route
    // behind, so a tale could never name a corpse from another house. The pool
    // is now `revenantPool()` (local un-avenged + imported un-rested), which
    // does the avengedTs filtering internally, so the shared draw is asserted
    // on that call instead of the raw filter it replaced.
    expect(src.match(/rev\.revenantPool\(\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
