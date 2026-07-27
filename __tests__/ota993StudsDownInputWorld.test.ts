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

// OTA-993 — studs-down corrections, batch 3: input + world.
import * as fs from 'fs';
import * as path from 'path';
import { qwenRephraseRejection } from '../app/state/gameStore';
import { isClimbable } from '../app/engine/interactionTags';
// The jest harness globally mocks pickWeather to 'calm' (deterministic suites);
// the real chooser is what this test measures.
const realEncounter = jest.requireActual('../app/engine/encounter') as typeof import('../app/engine/encounter');
const pickWeather = realEncounter.pickWeather;

const STORE = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

describe('OTA-993 — the qwen guard guards (and stops false-rejecting)', () => {
  it('a fabricated action with NO resolved noun is rejected (the inert case)', () => {
    // The logged failure shape: garbled input, no resolvedNoun, LLM invents an
    // unrelated non-wait action. The old guard dispatched it clean.
    expect(qwenRephraseRejection(null, 'attack', 'attack the vendor', 'qwerty asdf zzz')).toBeTruthy();
  });
  it('an honest one-typo repair passes', () => {
    expect(qwenRephraseRejection(null, 'climb', 'climb the warp', 'clomb into the warp')).toBeNull();
  });
  it('the CATALOG-name false-reject is gone ("Aetheric Torch" -> "use the torch")', () => {
    expect(qwenRephraseRejection('Aetheric Torch', 'use', 'use the torch', 'use the torch')).toBeNull();
  });
  it('a dropped noun still rejects, and an invented wait still rejects', () => {
    expect(qwenRephraseRejection('rusted cage', 'investigate', 'open the door', 'check the cage')).toBeTruthy();
    expect(qwenRephraseRejection(null, 'wait', 'wait a while', 'attack the drone')).toBeTruthy();
  });
});

describe('OTA-993 — the scenery refusal speaks the weapon class', () => {
  it('runecasters, throwables, verbs and bare hands are all classified', () => {
    expect(STORE).toContain("const farHand = classes.some((c) => c === 'ranged' || c === 'runecaster' || c === 'throwable');");
    expect(STORE).toContain('answers your fists');
    // The single-tag test that missed all 55 runecasters is gone.
    expect(STORE).not.toContain('/^ranged$/i.test(t)');
  });
});

describe('OTA-993 — a course begins outside', () => {
  it('setTravelCourse clears hubRoomId/activeBuildingId at the shared choke point', () => {
    const fn = STORE.slice(STORE.indexOf('setTravelCourse(locationId: string) {'), STORE.indexOf('setTravelCourse(locationId: string) {') + 1200);
    expect(fn).toContain('player.hubRoomId || get().activeBuildingId');
    expect(fn).toContain('hubRoomId: null');
  });
});

describe('OTA-993 — offers rotate on pitches', () => {
  it('pitch-keyed, x2 step, NaN-guarded', () => {
    expect(STORE).toContain('const offerRot = (pitchSeq * 2) % 4;');
    expect(STORE).toContain('offerPitchSeq: pitchSeq + 1');
    expect(STORE).toContain('Number.isFinite(rawPitch)');
  });
});

describe('OTA-993 — the sky reads the tags', () => {
  it('a frost-TAGGED location biases the blizzard (Yuldra-Tul was invisible before)', () => {
    const mem = { tagCounts: {} } as any;
    const frostLoc = { id: 'yuldra_tul', name: 'Yuldra-Tul', tags: ['capital', 'frost', 'mountain'] };
    const plainLoc = { id: 'plainville', name: 'Plainville', tags: [] as string[] };
    let frostHits = 0; let plainHits = 0;
    for (let i = 0; i < 600; i++) {
      if (pickWeather(mem, frostLoc).id === 'silent_blizzard') frostHits++;
      if (pickWeather(mem, plainLoc).id === 'silent_blizzard') plainHits++;
    }
    // 3x weight vs uniform 1-in-9: expect roughly 27% vs 11%.
    expect(frostHits).toBeGreaterThan(plainHits * 1.5);
  });
  it('the short-word rows are word-anchored (no substring false positives)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'engine', 'encounter.ts'), 'utf8');
    expect(src).toMatch(/\\b\(ash\|ashfall/);
    expect(src).toMatch(/\\b\(frost\|frozen/);
    expect(src).not.toMatch(/frost\|ice\|north\|blizzard\|glacier\/i/);
  });
});

describe('OTA-993 — dog heals agree with each other and with the dog', () => {
  it('both feed paths scale by the DOG\'s hpMax', () => {
    expect(STORE).toContain('scaledHealHP((fx as { healHP?: number }).healHP ?? 0, dog.hpMax)');
    expect(STORE).toContain("scaledHealHP(fx.healHP ?? 0, dog.hpMax) : 0;");
    // The batch no longer scales the dog by the PLAYER's frame.
    const dogBranch = STORE.slice(STORE.indexOf("if (target === 'dog') {"), STORE.indexOf("if (target === 'dog') {") + 900);
    expect(dogBranch).toContain('dogPer * use');
    expect(dogBranch).not.toContain('perHP * use');
  });
});

describe('OTA-993 — an item is an item, even sharing words with a landmark', () => {
  it('the three Skyreacher Maps are paper, not towers', () => {
    expect(isClimbable('Skyreacher Map 2 of 5 — Asgardar Spire')).toBe(false);
    expect(isClimbable('Skyreacher Map 3 of 5 — Obsidian Monolith')).toBe(false);
    expect(isClimbable('Skyreacher Map 4 of 5 — Thametan Tower')).toBe(false);
  });
  it('the dual-identity landmark still climbs, and the curated pool survives', () => {
    expect(isClimbable('the Great Fang of Zharak')).toBe(true);
    expect(isClimbable('rope')).toBe(true);           // structural noun keeps its grip
    expect(isClimbable('Rail Saber')).toBe(false);    // the original #113 case stays fixed
  });
  it('the curly apostrophe no longer dodges the catalog exclusion', () => {
    const straight = isClimbable("Reclaimer's Rope");
    const curly = isClimbable('Reclaimer’s Rope');
    expect(curly).toBe(straight);
  });
});
