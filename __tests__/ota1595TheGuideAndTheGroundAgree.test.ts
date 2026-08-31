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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// ⚠⚠⚠ OTA-1595 — THE GUIDE AND THE GROUND AGREE.
//
// FROM THE OWNER'S 21:00 PLAY SESSION on 1594 — three defects, all typed into
// the game as he hit them, all one disease: a guide (map, hint, Arbiter)
// describing a world the ground no longer matched.
//
//  1. *"I have auto routed and moved twice and the mini map still shows the
//     interior of the Outpost"* — setWhisperCourse never learned OTA-993's
//     rule that a course begins OUTSIDE. He set out toward Hollis from inside
//     the Gate; hubRoomId stayed, and the minimap faithfully rendered the
//     stale room while his body walked open silt.
//
//  2. *"The text in The whisperer says this is one block away but the actual
//     number on the world exploration screen says three blocks away. they
//     don't give the same answer"* — the whisper hint re-printed the AUTHORED
//     offset range from the plant origin while the course walks the record's
//     CONCRETE tile. Two origins, two numbers.
//
//  3. Ask the Arbiter about Hollis and the 0.5B persona answered *"I'm not
//     familiar with this specific band or its music"*; ask how a mission
//     finished and it answered *"I have finished the mission. My purpose is
//     to ensure the safety..."* — the raw model, out of character, past a
//     prompt that says never to be.

import { useGameStore } from '../app/state/gameStore';
import { arbiterAnswerOutOfCharacter } from '../app/engine/askArbiter';
import { getRaces, getFactions } from '../app/engine/character';
import {
  whisperDistancePhrase, describeWhisperStage, findMeetWhisperOffHours,
} from '../app/engine/whispers';
import type { WhisperRecord } from '../app/engine/types';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(180000);

const store = useGameStore;

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

async function freshGame(name: string) {
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await settle(() => !!store.getState().currentScene);
}

function hollisRecord(overrides: Partial<WhisperRecord> = {}): WhisperRecord {
  const g = placedAt('reclaimer_stake');
  return {
    id: 'hollis_salt',
    stage: 'planted',
    targetLocationId: 'reclaimer_stake',
    targetMapX: 0, targetMapY: 0,
    targetGridX: g.gridX + 1, targetGridY: g.gridY + 2,
    plantedAtHours: 0,
    activeFromHour: 5, activeToHour: 17,
  } as unknown as WhisperRecord;
}

describe('OTA-1595 — a whisper course begins outside, this door too', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await freshGame('Course');
  });

  it('⚠⚠⚠ SET OUT FROM INSIDE THE GATE → hubRoomId clears before the first step', async () => {
    const p = store.getState().player!;
    const at = placedAt('reclaimer_stake');
    store.setState({ player: { ...p, ...at, hubRoomId: 'outpost_gate', stamina: 40, staminaMax: 40 } });
    store.getState().setWhisperCourse(at.gridX + 1, at.gridY + 2, "Hollis's salt cart");
    expect(store.getState().player!.hubRoomId).toBeFalsy();
    // ⚠ Whole-log search, not a slice window: the course's own step appends
    // enough lines that the capped gameLog can rotate the earliest ones out
    // of an index-based window.
    const lines = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(lines).toContain('You step out under open sky');
  });

  it('⚠⚠ a course RESUMED with the stale room attached clears it on the first tap', () => {
    const p = store.getState().player!;
    const at = placedAt('reclaimer_stake');
    store.setState({
      player: {
        ...p, ...at, hubRoomId: 'outpost_gate', stamina: 40,
        whisperCourse: { gridX: at.gridX + 2, gridY: at.gridY, label: "Hollis's salt cart" },
      },
    });
    store.getState().continueWhisperCourse();
    expect(store.getState().player!.hubRoomId).toBeFalsy();
  });
});

describe('OTA-1595 — the hint and the compass count the same tiles', () => {
  it('⚠⚠⚠ THE ONE WRITER — Manhattan walk with the per-axis breakdown', () => {
    expect(whisperDistancePhrase({ x: 10, y: 10 }, { x: 11, y: 13 }))
      .toBe('4 tiles from where you stand (3 south, 1 east)');
    expect(whisperDistancePhrase({ x: 5, y: 5 }, { x: 3, y: 4 }))
      .toBe('3 tiles from where you stand (1 north, 2 west)');
    expect(whisperDistancePhrase({ x: 0, y: 0 }, { x: 0, y: 1 }))
      .toBe('1 tile from where you stand (1 south)');
    expect(whisperDistancePhrase({ x: 2, y: 2 }, { x: 2, y: 2 }))
      .toBe('on the tile you are standing on');
  });

  it("⚠⚠ HIS CASE — the planted Hollis hint states the true walk to the record's tile", () => {
    const w = hollisRecord();
    const g = placedAt('reclaimer_stake');
    const line = describeWhisperStage(w, { x: g.gridX, y: g.gridY });
    // The record's concrete tile is 2 south + 1 east of the player: the hint
    // says exactly that, not the authored "tiles 2-3 south of the outpost".
    expect(line).toContain('Hollis camps 3 tiles from where you stand (2 south, 1 east)');
    expect(line).toContain('SET COURSE');
    expect(line).not.toContain('somewhere in tiles');
  });

  it('⚠ without a position the legacy line renders untouched — old callers and old saves', () => {
    const line = describeWhisperStage(hollisRecord());
    expect(line).toContain('Hollis camps somewhere in tiles 2-3 south');
  });

  it('⚠ the fetch stages speak the true walk to the thief tile the same way', () => {
    const g = placedAt('reclaimer_stake');
    const w = {
      ...hollisRecord({ stage: 'fetch_active' }),
      stage: 'fetch_active',
      ctx: { thiefGridX: g.gridX + 3, thiefGridY: g.gridY },
    } as unknown as WhisperRecord;
    const line = describeWhisperStage(w, { x: g.gridX, y: g.gridY });
    expect(line).toContain('3 tiles from where you stand (3 east)');
    expect(line).toContain('Brine Runner');
  });
});

describe('OTA-1595 — the right tile at the wrong hour is not silence', () => {
  // The pushed bundle held 15 seconds the paste did not: *"so I'm supposed to
  // be at hollis's camp but I'm at an active dig site."* He was standing where
  // the record pointed, outside Hollis's 5am-5pm window, and the meet check
  // missed in the exact same silence as a wrong tile.
  it('⚠⚠ the off-hours finder answers where the meet finder goes quiet', () => {
    const g = placedAt('reclaimer_stake');
    const w = { ...hollisRecord(), targetGridX: g.gridX, targetGridY: g.gridY } as unknown as WhisperRecord;
    // 20:00 game time — window closed → found.
    expect(findMeetWhisperOffHours([w], 20, g.gridX, g.gridY)?.id).toBe('hollis_salt');
    // Noon — window open → null (the real meet fires instead).
    expect(findMeetWhisperOffHours([w], 12, g.gridX, g.gridY)).toBeNull();
    // Wrong tile — null either way; this finder only explains the cold camp.
    expect(findMeetWhisperOffHours([w], 20, g.gridX + 1, g.gridY)).toBeNull();
  });

  it('⚠ and the tile walk SPEAKS it — who works, and when', () => {
    // Stated against the call site: the miss branch consults the off-hours
    // finder and appends the cold-camp line naming the hours.
    const SRC = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const i = SRC.indexOf('findMeetWhisperOffHours(p.activeWhispers');
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 700)).toContain('activeHoursText(coldChain.activeHours)');
  });
});

describe('OTA-1595 — the Arbiter cannot break character', () => {
  it('⚠⚠⚠ THE THREE DEVICE LEAKS ARE ALL CAUGHT', () => {
    // Verbatim from the owner's log — each one shipped to his screen in the
    // Arbiter's gold.
    expect(arbiterAnswerOutOfCharacter(
      "I'm not familiar with this specific band or its music. If you could provide more details or context, I might be able to help further.",
    )).toBe(true);
    expect(arbiterAnswerOutOfCharacter(
      'I have finished the mission. My purpose is to ensure the safety and security of the ancient artifacts and the integrity of the civilization that once thrived in Tartaria.',
    )).toBe(true);
    expect(arbiterAnswerOutOfCharacter(
      "I was typing in the Arbiter's voice. I'm a witness to Tartaria, old and mysterious.",
    )).toBe(true);
  });

  it('⚠⚠ and the voice itself passes clean — the sieve rejects assistant-speak, not terseness', () => {
    expect(arbiterAnswerOutOfCharacter('The mud keeps what it takes. Walk lighter.')).toBe(false);
    expect(arbiterAnswerOutOfCharacter('Buried, like most true things. Do not dig for it.')).toBe(false);
    expect(arbiterAnswerOutOfCharacter('That name does not surface. Ask the ground; it held everything once.')).toBe(false);
  });

  it('⚠⚠ the sieve gates the persona path — a clamped answer falls to the silent line', () => {
    // Stated against code: arbiterPersonaAnswer must consult the sieve on its
    // cleaned line and null out on a hit, so the ask fallback prints the
    // authored ARBITER_SILENT_LINE instead of the leak.
    const SRC = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const i = SRC.indexOf('async function arbiterPersonaAnswer');
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 1600)).toContain('if (arbiterAnswerOutOfCharacter(line)) return null;');
  });
});

describe('OTA-1595 — a question that names a live whisper NPC is a lookup', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
  });

  it('⚠⚠⚠ "what\'s at Hollis camps" answers from the chain record, with the true walk', async () => {
    await freshGame('Asker');
    const p = store.getState().player!;
    const at = placedAt('reclaimer_stake');
    store.setState({ player: { ...p, ...at, activeWhispers: [hollisRecord()] } });
    const logBefore = store.getState().gameLog.length;
    await store.getState().submitPlayerAction("what's at Hollis camps");
    await settle(() => store.getState().gameLog.slice(logBefore).some((e) => e.text.includes('Hollis camps')), 8000);
    const lines = store.getState().gameLog.slice(logBefore).map((e) => e.text).join('\n');
    // The engine knows Hollis: stage, tile, hours — and now says so, with the
    // same tile count the course will walk. No band, no music.
    expect(lines).toContain('Hollis camps 3 tiles from where you stand (2 south, 1 east)');
  });
});
