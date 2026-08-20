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
// OTA-1131 — THE ARBITER STOPS RAMBLING, AND THE PROMPT STOPS LEAKING.
//
// Both findings come from ONE device log (build 4.29.62 / OTA-1129), and both
// are the log doing the job instrumentation exists to do: neither was
// reproducible from a cold read of the code.
//
// ⚠ 1. FIVE UNRELATED LORE LINES IN TEN SECONDS, ONE TILE.
//
//   00:14:43  "You saw the traveler … That memory will rot if you leave it."
//   00:14:45  "Black, polished, magnetic. They were aimed at something…"
//   00:14:47  "The observatory beneath the Pillars charted skies that…"
//   00:14:51  "Walk between two Pillars and your compass forgets you…"
//   00:14:53  "Birds will not perch here. Birds are wise."
//
// Every one carries `reason=intent-not-allowed:investigate` — the TEMPLATE
// path, which appended a flavor line unconditionally on every call. Owner:
//
//   "if he has multiple lines and they don't have a gap of time in between and
//    they are unrelated topics then he just sounds like he is rambling. I don't
//    want the arbiter to be a chatty Kathy … forcing him to repeatedly say
//    multiple things in one tile comes across as too much."
//
// ⚠ THE FIX IS A BUDGET, NOT A FILTER, and that distinction is the whole
// design. Every one of those five lines is good on its own; the defect is only
// that they arrived together. Nothing here judges a line's quality — it rations
// how often the Arbiter volunteers something unasked.
//
// Two limits, because the owner named two different things:
//   · ONE PER TILE — "multiple things in one tile comes across as too much".
//   · A SHARED CLOCK — "they don't have a gap of time in between". Crossing
//     into a new tile resets the count but NOT the clock, so sprinting through
//     four tiles still cannot produce four asides.
//
// ⚠ AND WHAT IS DELIBERATELY NOT RATIONED, in the owner's own words: "lore
// flavor lines are good advice on how to play. like what weapon to choose or he
// notices that they're resistant to something is good." Those are ANSWERS to
// something the player did — combat cues, resist callouts, refusals, mission
// beats — and they never pass through this door at all.
//
// ⚠ 2. THE PROMPT LEAKED INTO THE FEED, AND WAS READ ALOUD.
//
//   [arbiter] Your read of them: HP 24/24, Stamina 8/14, AC 10 You, the
//             seasoned traveler, have
//
// That is the ambient prompt's own line — `Your read of them: ${player_stats}`
// — recited back and continued from. OTA-1030 built `looksLikeInstructionEcho`
// for exactly this class, and it has a dozen patterns; every one of them is
// about the model reciting its INSTRUCTIONS. None covered it reciting the
// FACTS BLOCK, which is just as much prompt and reads worse, because it puts
// raw numbers in the narrator's mouth.
//
// Guarded on the literal strings the prompt emits, per OTA-1125's standing
// rule: when a log hands you the exact failing input, build the guard around
// THAT STRING rather than around a reconstruction of it.

import { looksLikeInstructionEcho } from '../app/engine/foreignText';
import {
  _resetArbiterFlavorBudget,
  _ARBITER_FLAVOR_GAP_MS,
  _ARBITER_FLAVOR_PER_TILE,
} from '../app/state/gameStore';

jest.setTimeout(60_000);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const STORE: string = require('fs').readFileSync(
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  // ⚠ OTA-1398 — BOTH FILES, AND THE ORDER MATTERS. The flavour budget itself
  // moved to `app/ai/narration.ts` (slice 7), but the ARRIVAL-INTRO spend site
  // that this suite pins an ordering against — the banked line speaks, then the
  // budget is taken — is in gameStore's scene path. gameStore is concatenated
  // FIRST so the two indexOf anchors below resolve inside that one call site
  // rather than straddling the join.
  require('path').join(__dirname, '../app/state/gameStore.ts'), 'utf8')
  + '\n' + require('fs').readFileSync(
    require('path').join(__dirname, '../app/ai/narration.ts'), 'utf8');

describe('OTA-1131 — ⚠ the exact line from the log is caught now', () => {
  it('the leaked ambient prompt is recognised as an echo', () => {
    // Verbatim from the device log, including the truncation.
    expect(looksLikeInstructionEcho(
      'Your read of them: HP 24/24, Stamina 8/14, AC 10 You, the seasoned traveler, have',
    )).toBe(true);
  });

  it('each half of it is caught on its own, so a partial leak cannot slip', () => {
    expect(looksLikeInstructionEcho('Your read of them: STR9 DEX13')).toBe(true);
    expect(looksLikeInstructionEcho('HP 24/24, Stamina 8/14')).toBe(true);
  });

  it('the other field labels the prompt emits are caught too', () => {
    for (const leak of [
      'Entities Present: None.',
      'Inventory & Equipment: a torch',
      'Stats: HP 46/58',
      'Location: Buried Capital - Obsidian Pillars',
      'Environment: A forest of black glass columns.',
      'Exits: north, east, south, west',
    ]) {
      expect(looksLikeInstructionEcho(leak)).toBe(true);
    }
  });

  it('⚠ and real narration is NOT eaten — the OTA-1031 lesson', () => {
    // A guard that quietly deletes the feature is the recurring failure in this
    // area. These are ordinary Arbiter lines and every one must survive.
    for (const good of [
      'The Pillars hate machines. Bring nothing that ticks if you mean to leave with it.',
      'You have come far, and the road behind is longer than the one ahead.',
      'Birds will not perch here. Birds are wise.',
      'Your shoulders carry more than mine ever did.',
      'You read the inscription and find a name, or a list of names.',
      'Your blade is notched; the mud has been unkind to it.',
      'The observatory beneath the Pillars charted skies that no longer exist.',
    ]) {
      expect(looksLikeInstructionEcho(good)).toBe(false);
    }
  });

  it('a line that merely mentions HP in prose survives', () => {
    // The stat-block pattern needs the READOUT shape, not the letters.
    expect(looksLikeInstructionEcho('Your HP is low; rest before you press on.')).toBe(false);
  });
});

describe('OTA-1131 — ⚠ one unsolicited aside per tile, on a shared clock', () => {
  beforeEach(() => { _resetArbiterFlavorBudget(); });

  it('the budget exists and is one per tile', () => {
    expect(_ARBITER_FLAVOR_PER_TILE).toBe(1);
    // Wide enough that thumbing through a tile's nouns gets one remark, not
    // five — which is the reported symptom, at ~2s per tap.
    expect(_ARBITER_FLAVOR_GAP_MS).toBeGreaterThanOrEqual(20_000);
  });

  it('⚠ ALL THREE template flavor sites go through the one door', () => {
    // The five lines in the log came from one code path called five times. A
    // rule applied at two of the three sites would have left the third to
    // ramble, so the count is the assertion.
    expect((STORE.match(/speakArbiterFlavor\(get, trimmed\);/g) ?? []).length).toBe(3);
    // …and the old unconditional append is gone from every one of them.
    expect(STORE).not.toContain("if (trimmed) get().appendLog('arbiter', trimmed, chance(30)");
  });

  it('the tile key changes with the ROOM, not just the location', () => {
    // Each room is a place with its own things to remark on.
    expect(STORE).toContain("`${sc?.location?.id ?? '-'}|${sc?.microMicroId ?? '-'}`");
  });

  it('⚠ a new tile resets the COUNT but not the CLOCK', () => {
    // Otherwise sprinting through four tiles produces four asides, which is the
    // same rambling by another route.
    const fn = STORE.slice(
      STORE.indexOf('function takeArbiterFlavorBudget'),
      STORE.indexOf('function speakArbiterFlavor'),
    );
    expect(fn).toContain('arbiterFlavorThisTile = 0;');
    expect(fn).toContain('Date.now() - lastArbiterFlavorAt < ARBITER_FLAVOR_GAP_MS');
    // The clock is only reset when a line actually SPEAKS.
    expect(fn.indexOf('lastArbiterFlavorAt = Date.now();'))
      .toBeGreaterThan(fn.indexOf('if (arbiterFlavorThisTile >= ARBITER_FLAVOR_PER_TILE) return false;'));
  });

  it('a held line says so in the log rather than vanishing', () => {
    // OTA-840's never-fail-silently rule: a suppressed line must leave a trace,
    // or the next report is "the Arbiter went quiet and I do not know why".
    expect(STORE).toContain('arbiter: flavor held (budget');
  });
});

describe('OTA-1131 — ⚠ the clock is shared by every Arbiter line', () => {
  it('a GENERATED line starts the quiet period too', () => {
    // In the log an ambient musing landed between the investigate asides. Had
    // only the asides been rationed, he would still have spoken twice in a
    // breath.
    const nar = STORE.slice(STORE.indexOf('async function narrateViaArbiter'));
    const spoke = nar.indexOf('noteArbiterSpoke();');
    expect(spoke).toBeGreaterThan(-1);
    expect(spoke).toBeGreaterThan(nar.indexOf("get().appendLog('arbiter', finalText);"));
  });

  it('the ambient musing waits when he just spoke', () => {
    expect(STORE).toContain('arbiter: ambient held (he just spoke)');
    const amb = STORE.slice(STORE.indexOf('async function maybeGenerateAmbientArbiter'));
    expect(amb.slice(0, 3000)).toContain('if (!arbiterHasBeenQuiet())');
  });

  it('⚠ the banked arrival intro SPENDS the tile budget', () => {
    // It is the line with something to say about where the player now is, so
    // it should be the one that gets to speak — and everything after it waits.
    const i = STORE.indexOf('takeArbiterFlavorBudget(get);');
    const j = STORE.indexOf("get().appendLog('arbiter', banked);");
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(-1);
    expect(i).toBeGreaterThan(j);
  });

  it('a spent banked musing also stamps the clock', () => {
    const amb = STORE.slice(STORE.indexOf('const banked = takeBankedMusing(get);'));
    expect(amb.slice(0, 500)).toContain('noteArbiterSpoke();');
  });
});
