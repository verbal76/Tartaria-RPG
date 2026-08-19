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
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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

// ⚠⚠ HAL-ONLY — THE TWO LEGACY-SAVE MIGRATIONS THE GOLEM LINE NEVER NEEDED.
//
// This line is the one with real saves on real devices, so it carries backfills
// for features that shipped after those saves were written. The golem line was
// started later and has no such function; when this line was brought to golem
// parity, `gameStore.ts` was taken from golem WHOLESALE, and both migrations
// would have gone out with it — silently, because nothing referenced them and
// nothing tested them.
//
// ⚠ THAT IS THE WHOLE POINT OF THIS SUITE. It is not testing clever behaviour;
// it is a tripwire on a file that gets replaced from another line. The next
// parity pass will take golem's gameStore again, and golem still will not have
// these. If that pass forgets to re-graft them, this fails instead of a tester
// losing their tracked mission and their whole enemy-intel record.
import { readFileSync } from 'fs';
import { join } from 'path';
import { backfillEnemyIntelFromDefeats } from '../app/state/gameStore';

const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

describe('HAL-only save migrations survive a golem-parity port', () => {
  it('⚠⚠ the enemy-intel backfill is still defined AND still wired into the reader', () => {
    expect(typeof backfillEnemyIntelFromDefeats).toBe('function');
    // Defined is not enough — it has to be on the path that normalises a loaded
    // world memory, or it is dead code that passes a smoke test.
    expect(STORE).toContain('enemyIntel: wm.enemyIntel ?? backfillEnemyIntelFromDefeats(wm.defeatedEnemies)');
  });

  it('⚠ it reconstructs weak/resist from names a save already carries', () => {
    // Driven through the real bestiary the function reads, not a fixture: the
    // migration is only worth anything if it resolves the names live saves hold.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const enemies = require('../app/data/enemies/enemies.json') as Array<{ name: string }>;
    const anyKnown = enemies.slice(0, 40).map((e) => e.name);
    const out = backfillEnemyIntelFromDefeats(anyKnown);
    expect(Object.keys(out).length).toBeGreaterThan(0);
    for (const entry of Object.values(out)) {
      expect(Array.isArray(entry.weak)).toBe(true);
      expect(Array.isArray(entry.resist)).toBe(true);
      // A damage type can't be both a weakness and a resistance on one enemy.
      expect(entry.weak.filter((d) => entry.resist.includes(d))).toEqual([]);
    }
  });

  it('⚠⚠ an empty / missing defeat list migrates to nothing, not to a crash', () => {
    expect(backfillEnemyIntelFromDefeats(undefined)).toEqual({});
    expect(backfillEnemyIntelFromDefeats([])).toEqual({});
    // A name no bestiary row matches is skipped, not guessed at.
    expect(backfillEnemyIntelFromDefeats(['a thing that never existed'])).toEqual({});
  });

  it('⚠⚠ the faction-quest `tracked` backfill is still on the load path', () => {
    // A save written before the flag existed has no `tracked` on any quest, and
    // an all-untracked list shows the player NO active mission at all. First
    // record becomes the tracked one; an explicit choice is never re-picked.
    expect(STORE).toContain('.map((q, i) => (q.tracked === undefined ? { ...q, tracked: i === 0 } : q))');
  });

  it('⚠ both migrations are labelled HAL-ONLY where the next porter will read it', () => {
    // The label is load-bearing: it is the only thing telling whoever runs the
    // next wholesale copy that these two blocks are not golem drift to clean up.
    const halOnly = STORE.split('\n').filter((l) => l.includes('HAL-ONLY'));
    expect(halOnly.length).toBeGreaterThanOrEqual(2);
  });
});
