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

// ⚠⚠⚠ OTA-1626 — THE WORD IS THE DIRECTION.
//
// Found by the player-shaped walker on its first whisper chain, three taps
// in. The gate room prints "Paths: north to Standards · south to First
// Landing", the walker typed the word the room gave it — "north" — and got
// *"Try: look around · search · rest"*. The parser's bare-direction shortcut
// (2026-05-25) knew n / s / e / w and the four diagonals as single-letter
// codes, and nothing else: the full word, the one the room prints, fell
// through bestVerbMatch as unknown at 0.10.
//
// And the code that DID parse had the opposite hole: "n" inside an outpost
// parsed to travel north, but resolveHubTravel was handed the RAW text — a
// lone letter that matches no cardinal and no room name — so the interior
// move resolved to nothing and fell through to the overland step. "You walk
// north past the gate. The outpost falls away behind you." From the
// Strongroom. Two spellings of one instruction, and neither did what the
// room said.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { parseInput } from '../app/engine/parser';
import { findHubRoom } from '../app/engine/hub';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();
async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

describe('OTA-1626 — the word is the direction', () => {
  it('⚠⚠⚠ every bare direction word parses to travel, exactly as its letter does', () => {
    for (const w of ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'North', 'SOUTH ']) {
      const p = parseInput(w);
      expect({ w, intent: p.intent, target: p.target }).toEqual({ w, intent: 'travel', target: w.trim().toLowerCase() });
      expect(p.confidence).toBeGreaterThanOrEqual(0.95);
    }
    const letter = parseInput('n');
    const word = parseInput('north');
    expect(word.target).toBe(letter.target);
    expect(word.confidence).toBe(letter.confidence);
  });

  describe('inside the outpost', () => {
    beforeAll(async () => {
      console.log = () => {}; console.warn = () => {}; console.error = () => {};
      await store.getState().hydrate();
      await store.getState().startNewGame({ name: 'Pacer', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
      store.getState().skipTutorial?.();
      await settle(() => !!store.getState().currentScene);
      await settle(() => store.getState().player?.hubRoomId === 'outpost_gate');
    });

    it('⚠⚠⚠ THE WALKER\'S TAP, REPLAYED: "north" in the gate room goes where the Paths line says', async () => {
      const here = get().player!.hubRoomId!;
      const north = findHubRoom(here)!.exits.north!;
      expect(north).toBeTruthy();
      await get().submitPlayerAction('north');
      await settle(() => get().player?.hubRoomId === north);
      expect(get().player?.hubRoomId).toBe(north);
    });

    it('⚠⚠ "s" walks back to the gate and stays INSIDE — the letter is the word', async () => {
      const here = get().player!.hubRoomId!;
      const south = findHubRoom(here)!.exits.south!;
      expect(south).toBe('outpost_gate');
      await get().submitPlayerAction('s');
      await settle(() => get().player?.hubRoomId === south);
      expect(get().player?.hubRoomId).toBe(south);
      const feed = get().gameLog.slice(-6).map((e) => e.text);
      expect(feed.some((t) => /falls away behind you/.test(t))).toBe(false);
    });

    it('a letter with no door on it is a refusal inside, not an exit', async () => {
      const here = get().player!.hubRoomId!;
      const room = findHubRoom(here)!;
      const dead = (['east', 'west', 'north', 'south'] as const).find((d) => !room.exits[d]);
      if (!dead) return;
      const code = dead[0]!;
      const n0 = get().gameLog.length;
      await get().submitPlayerAction(code);
      await new Promise((r) => setTimeout(r, 200));
      expect(get().player?.hubRoomId).toBe(here);
      const said = get().gameLog.slice(n0).map((e) => e.text).join('\n');
      expect(said).toMatch(new RegExp(`No way ${dead} from here`));
    });
  });

  it('source pin — the interior resolver reads the PARSED direction, never the raw letter', () => {
    const src = readFileSync(join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    expect(src).toContain("resolveHubTravel(player.hubRoomId, hubTravelText(parsed, trimmed),");
    const parser = readFileSync(join(__dirname, '../app/engine/parser.ts'), 'utf8');
    expect(parser).toContain("north: 'north', south: 'south', east: 'east', west: 'west',");
  });
});
