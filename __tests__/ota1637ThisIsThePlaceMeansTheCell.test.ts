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

// ⚠⚠⚠ OTA-1637 — "THIS IS THE PLACE" MUST MEAN THE CELL.
//
// Measured on the owner's device: the arrival doors (heal the debts, arm the
// spawn — stageArrival, OTA-1597) key on the canon grid CELL, on his own spec
// ("it is coordinate based … you need to know that I stepped on that tile").
// The arrival LINE, the trace's HERE, the status card, the conversation card's
// arm and all three verb matchers compared `currentLocationId` — the whole
// named place. One tile off the anchor the feed said HERE, a typed verb PAID,
// and nothing armed. He read it as "every tile says I'm standing on it".
//
// ONE vocabulary now: the cell is the ground everywhere the player can see
// it, and off the cell every reader says how far and which way.

import {
  tilesFromLocation, offGroundText, wrongGroundLine, standingAtLocation,
} from '../app/engine/standingAt';
import { missionTraceLines, missionArrivalLines, missionStatusCards } from '../app/engine/missionTrace';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { findMysteryById } from '../app/engine/mysteries';
import type { PlayerCharacter } from '../app/engine/types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { placedAt } from '../test-utils/placePlayer';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const at = (loc: string, off: { dx?: number; dy?: number } = {}, extra: Partial<PlayerCharacter> = {}): PlayerCharacter =>
  ({ ...placedAt(loc, off), inventory: [], roleKills: {}, ...extra } as unknown as PlayerCharacter);

// mystery_ashen_codex stage 1: INVESTIGATE at Nimari, nobody named (OTA-1586's own case).
const CODEX = { activeMysteries: [{ id: 'mystery_ashen_codex', stage: 1 }] } as Partial<PlayerCharacter>;
const CODEX_TITLE = findMysteryById('mystery_ashen_codex')!.title;
// mystery_red_tower stage 0: a person-stage at Varakush (the conversation card arms on it).
const TOWER = { activeMysteries: [{ id: 'mystery_red_tower', stage: 0 }] } as Partial<PlayerCharacter>;

describe('OTA-1637 — the offset, spelled once', () => {
  it('⚠⚠⚠ two tiles east of the ground reads "2 tiles west" — the way BACK, on the dominant axis', () => {
    expect(tilesFromLocation(at('nimari', { dx: 2 }), 'nimari')).toEqual({ tiles: 2, dir: 'west' });
    expect(tilesFromLocation(at('nimari', { dy: -3 }), 'nimari')).toEqual({ tiles: 3, dir: 'south' });
    expect(tilesFromLocation(at('nimari', { dx: 1, dy: 1 }), 'nimari')).toEqual({ tiles: 2, dir: 'west' });
    expect(tilesFromLocation(at('nimari'), 'nimari')).toEqual({ tiles: 0, dir: null });
  });

  it('⚠⚠ the sentence: plural, singular, and nothing on the cell', () => {
    expect(offGroundText(at('nimari', { dx: 2 }), 'nimari')).toBe('2 tiles west');
    expect(offGroundText(at('nimari', { dx: -1 }), 'nimari')).toBe('1 tile east');
    expect(offGroundText(at('nimari'), 'nimari')).toBe('');
    expect(offGroundText(null, 'nimari')).toBe('');
  });

  it('⚠⚠ the refusal: "Close" on the named place, "Not here" anywhere else', () => {
    expect(wrongGroundLine(at('nimari', { dx: 2 }), 'nimari', 'The Ashen Codex'))
      .toContain('"Close. The Ashen Codex wants the ground 2 tiles west of here — step onto it and go again."');
    expect(wrongGroundLine(at('varakush'), 'nimari', 'The Ashen Codex'))
      .toContain('"Not here. The Ashen Codex points elsewhere — set a course from Contracts and do it there."');
  });
});

describe('OTA-1637 — every reader says the same thing about the same tile', () => {
  it('⚠⚠⚠ THE ARRIVAL LINE: on the cell "this is the place"; a tile off, how far — never both', () => {
    const on = missionArrivalLines(at('nimari', {}, CODEX));
    expect(on).toHaveLength(1);
    expect(on[0]).toContain(`▸ ${CODEX_TITLE}: this is the place`);

    const off = missionArrivalLines(at('nimari', { dx: 2 }, CODEX));
    expect(off).toEqual([`▸ ${CODEX_TITLE}: the ground is 2 tiles west of here — step onto it.`]);

    // Somewhere else entirely: quiet, as OTA-1586 pinned.
    expect(missionArrivalLines(at('varakush', {}, CODEX))).toEqual([]);
  });

  it('⚠⚠⚠ THE TRACE: HERE is the cell; on the place but off the cell it says OFF-CELL and the offset', () => {
    expect(missionTraceLines(at('nimari', {}, CODEX)).join('\n')).toContain('@nimari HERE');
    const off = missionTraceLines(at('nimari', { dx: 2 }, CODEX)).join('\n');
    expect(off).toContain('@nimari OFF-CELL(2 tiles west)');
    expect(off).not.toContain(' HERE');
    const away = missionTraceLines(at('varakush', {}, CODEX)).join('\n');
    expect(away).toContain('@nimari ');
    expect(away).not.toContain('OFF-CELL');
  });

  it('⚠⚠ THE STATUS CARD: here / offGround / route agree with the trace', () => {
    const card = (p: PlayerCharacter) => missionStatusCards(p).find((c) => c.id === 'mystery_ashen_codex')!;
    expect(card(at('nimari', {}, CODEX))).toMatchObject({ here: true, offGround: '', route: null });
    expect(card(at('nimari', { dx: 2 }, CODEX))).toMatchObject({
      here: false, offGround: '2 tiles west', route: { kind: 'location', id: 'nimari' },
    });
    expect(card(at('varakush', {}, CODEX))).toMatchObject({
      here: false, offGround: '', route: { kind: 'location', id: 'nimari' },
    });
  });

  it('⚠⚠ THE CONVERSATION CARD arms on the cell and not a tile off it', () => {
    expect(armedEncounter(at('varakush', {}, TOWER))?.missionId).toBe('mystery_red_tower');
    expect(armedEncounter(at('varakush', { dx: 1 }, TOWER))).toBeNull();
    // and the predicate every one of them reads
    expect(standingAtLocation(at('varakush', { dx: 1 }, TOWER), 'varakush')).toBe(false);
  });
});

describe('OTA-1637 — the wiring', () => {
  it('⚠⚠⚠ the three verb matchers and stageAwaitsIntentHere pay on the cell and refuse with the offset', () => {
    const G = src('app/state/gameStore.ts');
    expect(G).toContain('if (standingAtLocation(player, anchor)) {');
    expect((G.match(/if \(!standingAtLocation\(player, ground\)\) \{/g) ?? []).length).toBe(2);
    expect((G.match(/wrongGroundLine\(player, /g) ?? []).length).toBe(3);
    expect((G.match(/standingAtLocation\(player, QS\.stageLocationId\(/g) ?? []).length).toBe(3);
    expect(G).not.toContain('player.currentLocationId === anchor');
    expect(G).not.toContain('player.currentLocationId !== ground');
    // The "Not here" sentence lives in ONE place now, beside the "Close" one.
    expect(G).not.toContain('"Not here. ${');
  });

  it('⚠⚠ the readers no longer compare the id', () => {
    const T = src('app/engine/missionTrace.ts');
    expect(T).not.toContain("where === player.currentLocationId ? ' HERE'");
    expect(T).not.toContain('here: !!where && where === player.currentLocationId');
    expect(T).not.toContain('where !== player.currentLocationId');
    expect(T).toContain("import { standingAtLocation, offGroundText } from './standingAt';");
    const A = src('app/engine/missionEncounterArm.ts');
    expect(A).toContain('if (!standingAtLocation(player, where)) return null;');
    expect(A).not.toContain('where !== player.currentLocationId');
  });
});
