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

// OTA-1016 — NO OPEN-GROUND AMBUSHES INDOORS. The three outdoor world-event
// spawners (rival raid, outpost-patrol intercept, roaming-patrol ambush) each
// tested `player.hubRoomId` for "am I inside?" — but that field is only set in
// an OUTPOST room. Explorable building interiors live on the store's
// activeBuildingId, so all three read "outdoors" while the player stood in a
// flooded house. Owner's log, twice inside six minutes: a patrol "crosses your
// path in the open" in the KITCHEN, and a war party "crests the rise" in the
// STUDY. One shared `underRoof()` predicate now answers for all three.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { blockAt } from '../test-utils/srcBlock';

describe('OTA-1016 — SOURCE LOCKS: one roof test, used by every outdoor spawner', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

  it('the shared predicate exists and counts BOTH kinds of interior', () => {
    expect(src).toMatch(/function underRoof\(s: GameStore, player: PlayerCharacter\): boolean \{/);
    expect(src).toMatch(/return !!player\.hubRoomId \|\| !!s\.activeBuildingId;/);
  });

  it('all three outdoor spawners route through it — none tests hubRoomId alone', () => {
    const guards = src.match(/if \(underRoof\(s, player\)\) return;/g) ?? [];
    expect(guards.length).toBe(3);
    // Old shape gone: the bare outpost-only guard is no longer a spawner's gate.
    expect(src).not.toMatch(/ {2}if \(player\.hubRoomId\) return;/);
  });

  it('the three spawners are the ones we think they are', () => {
    for (const fn of ['maybeSpawnRaid', 'maybeInterceptPatrol', 'maybePatrolAmbush']) {
      const at = src.indexOf(`function ${fn}(`);
      expect(at).toBeGreaterThan(-1);
      // The guard appears within the function's opening block.
      expect(blockAt(src, `function ${fn}(`)).toMatch(/if \(underRoof\(s, player\)\) return;/);
    }
  });

  it('the wall-rest refusal tells a rope-carrier what their rope cannot do', () => {
    expect(src).toMatch(/const hasPlainClimbingRope = player\.inventory\.some\(/);
    // OTA-1017 — the RULE changed (strap-only, owner's call), so the sentence did
    // too. Assert the invariant this lock exists for — a line-carrier is told
    // their line won't hold them asleep — not the exact wording.
    expect(src).toMatch(/won't hold you asleep/);
  });
});
