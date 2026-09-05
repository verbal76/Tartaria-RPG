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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1684 — THE TYPO IS ASKED, NOT RUN (task #194).
 *
 * Three notations from the owner's 09-04 log:
 *
 *   21:59  "srink" → intent=unknown → 4.8s at Qwen → "no usable result" → the
 *          Arbiter recommended a rope. His note: "I think typing drink is
 *          broken" — and then that there was no "did you mean drink?".
 *          ROOT: fuzzyEqual is exact-only at 4–5 letters (OTA-094, so "leave"
 *          never becomes "cleave"). Right refusal, wrong silence. The parser
 *          now NAMES the one-edit miss and the engine asks, with the corrected
 *          line first on the chip row. It still never runs the guess.
 *   22:15  "0 The enemy portrait is stuck between a left and right swipe and I
 *          did not swipe" → intent=steal (swipe is a steal synonym) → "Nothing
 *          to steal here". The guard learns "enemy portrait", swipe gestures,
 *          and "I did not swipe/tap/press". A bare "portrait" stays a noun —
 *          "investigate family portrait" is a real command in the 1464 corpus.
 *   22:10  "haven't seen the missions button on a vendor in a while" — at
 *          Skiv, a roadside trader. CONTRACTS ▸ was gated on `vendor.faction`,
 *          so the button was simply absent, and absent reads as broken. It is
 *          on every vendor now; a roadside board says it keeps none.
 *
 * The fourth ("I couldn't even tell you the last time I was able to use my
 * dog") needs the save — nothing in the log names the dog's state.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseInput, nearMissVerb, splitClauses } from '../app/engine/parser';
import { classifyMetaComment, anyClauseIsMeta } from '../app/engine/metaComment';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { placedAt } from '../test-utils/placePlayer';

const ROOT = join(__dirname, '..');
const STORE = readFileSync(join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8');
const VENDOR = readFileSync(join(ROOT, 'app', 'screens', 'VendorScreen.tsx'), 'utf8');
const MODAL = readFileSync(join(ROOT, 'app', 'components', 'VendorContractsModal.tsx'), 'utf8');

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) await new Promise((r) => setTimeout(r, 15));
}

describe('OTA-1684 — ⚠⚠⚠ the near miss is named, never run', () => {
  it('"srink" names drink, and leads the suggestions with it', () => {
    const p = parseInput('srink');
    expect(p.intent).toBe('unknown');
    expect(p.didYouMean).toEqual({ typed: 'srink', meant: 'drink', command: 'drink' });
    expect(p.suggestions[0]).toBe('drink');
  });

  it('the rest of the line rides along on the corrected command', () => {
    const p = parseInput('srink the water');
    expect(p.didYouMean?.command).toBe('drink the water');
  });

  it('a word that matched is never second-guessed; a short word is left alone', () => {
    expect(parseInput('drink').didYouMean).toBeUndefined();
    expect(parseInput('rest').didYouMean).toBeUndefined();
    expect(nearMissVerb('eat')).toBeNull();
  });

  it('⚠ the prepended-letter family fuzzyEqual refuses is not offered either', () => {
    // "eave" is one deletion from "leave" — the very pair OTA-094 refused to
    // auto-correct (leave/cleave, word/sword). Not offered.
    expect(nearMissVerb('eave')).toBeNull();
  });

  it('⚠ only the FIRST word is a candidate — a noun one edit from a verb is not a typo', () => {
    const p = parseInput('the swirl of mud');
    expect(p.didYouMean).toBeUndefined();
  });
});

describe('OTA-1684 — ⚠⚠ the engine asks instead of resolving', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Wayfarer', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    const p = get().player!;
    store.setState({ player: { ...p, ...placedAt('tartarian_outskirts'), hubRoomId: null } as never, activeBuildingId: null });
  });

  it('⚠⚠⚠ "srink" gets "did you mean drink?" and the chip row, with no trip to the resolver', async () => {
    const before = get().gameLog.length;
    await get().submitPlayerAction('srink');
    const tail = get().gameLog.slice(before).map((e) => e.text);
    expect(tail.some((t) => t.includes('"srink" — did you mean drink?'))).toBe(true);
    expect(tail.some((t) => t.startsWith('Try: drink'))).toBe(true);
    expect(tail.some((t) => t.includes('parse-fallback: handing'))).toBe(false);
    expect(get().parseSuggestions?.[0]).toBe('drink');
    // And nothing was drunk: the guess is offered, not acted on.
    expect(tail.some((t) => /you drink|You take a drink/i.test(t))).toBe(false);
  });

  it('the ask sits BEFORE the Qwen handoff in the store, and is skipped on a re-submission', () => {
    const askAt = STORE.indexOf('did you mean ${dym.meant}?');
    const qwenAt = STORE.indexOf("parse-fallback: handing \"${trimmed}\" to qwen");
    expect(askAt).toBeGreaterThan(-1);
    expect(qwenAt).toBeGreaterThan(askAt);
    expect(STORE.includes('if (parsed.didYouMean && !_opts?.skipPreChecks) {')).toBe(true);
  });
});

describe('OTA-1684 — ⚠⚠ the 22:15 note is a note', () => {
  const NOTE = '0 The enemy portrait is stuck between a left and right swipe and I did not swipe';

  it('the whole note, and its clauses, read as a note', () => {
    const v = classifyMetaComment(NOTE);
    expect(v.isMeta).toBe(true);
    expect(anyClauseIsMeta(NOTE, splitClauses(NOTE)).isMeta).toBe(true);
  });

  it('each of the three new shapes fires on its own', () => {
    expect(classifyMetaComment('the enemy portrait is wrong').isMeta).toBe(true);
    expect(classifyMetaComment('swipe left does nothing').isMeta).toBe(true);
    expect(classifyMetaComment('I did not tap it').isMeta).toBe(true);
    expect(classifyMetaComment('I did not swipe').isMeta).toBe(true);
  });

  it('⚠ and the commands the corpus protects still pass — swipe is still a steal', () => {
    for (const cmd of ['investigate family portrait', 'swipe the coin purse', 'steal bread', 'I did not attack the drone']) {
      expect(classifyMetaComment(cmd).isMeta).toBe(false);
    }
    expect(parseInput('swipe the coin purse').intent).toBe('steal');
  });
});

describe('OTA-1684 — ⚠ CONTRACTS ▸ is on every vendor', () => {
  it('the button is no longer gated on vendor.faction', () => {
    const tabs = VENDOR.slice(VENDOR.indexOf("setMode('sell')"), VENDOR.indexOf('<ScrollView style={styles.list}'));
    expect(tabs.includes('CONTRACTS ▸')).toBe(true);
    expect(tabs.includes('{vendor.faction && (')).toBe(false);
  });

  it('a roadside trader says it keeps no board, in words, instead of "build reputation"', () => {
    expect(MODAL.includes('!vendor.faction && !isBrokerVendor(vendor)')).toBe(true);
    expect(MODAL.includes('keeps no board')).toBe(true);
  });
});
