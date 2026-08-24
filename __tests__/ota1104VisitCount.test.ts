// OTA-1104 — EVERY FIRST VISIT GREETED YOU AS A RETURNER, AND THE BOOT
// FILED THE GATE IN THE WRONG DRAWER.
//
// Device log (2026-08-05, APK 293): a fresh game opened with "You've stood
// here before. (visit 2)" in the very first room, every first entry to a hub
// room greeted the same way, and a later RETURN to the Reception ALSO said
// "(visit 2)" — the count appeared to go backwards. Two independent defects,
// reproduced with a live-store probe before fixing:
//
//  1. PHANTOM PRIOR VISIT. The OTA-071 investigation-table seeder (and the
//     dog smell-find) run BEFORE the visit-record block in the same scene
//     build, and both CREATED the room record with `visitCount: 1` when it
//     was missing. The counter then found an "existing" record on the
//     player's genuinely-first entry: greeting printed, count stamped 2.
//     Created shells now seed visitCount 0, and the greeting requires a
//     count >= 1 — the visit block owns the counting; the tables ride along.
//
//  2. THE WRONG DRAWER AT BOOT. `candidateKey` read `player.hubRoomId` off
//     the snapshot captured at the top of the build — but the hub AUTO-ENTRY
//     assigns the gate room to a LOCAL variable (and writes it to the store)
//     AFTER that snapshot was taken. The opening scene filed the gate room
//     under a suffixless key while every later hub move filed the same room
//     under `…@outpost_gate`: one room, two records, and the boot record
//     (count, seeded investigation table) was orphaned on the first step.
//     The key now uses the RESOLVED hub room id.
//
// The live-store tests below drive a real fresh game through the hub and
// assert what the device log showed broken.

jest.setTimeout(60000);

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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));

import { RETURN_AGAIN_LINES, RETURN_FAMILIAR_LINES } from '../app/engine/voicePools';
import { useGameStore } from '../app/state/gameStore';
import { readFileSync } from 'fs';
import { join } from 'path';

const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

const roomCounts = (): Record<string, number> => {
  const rooms = useGameStore.getState().worldMemory.visitedRooms ?? {};
  return Object.fromEntries(Object.entries(rooms).map(([k, r]) => [k, r.visitCount]));
};
// ⚠⚠⚠ OTA-1467 REPLACED THE SENTENCE THIS USED TO MATCH, and this helper broke
// with it — the SECOND downstream pin in one night to fail because it recognised
// a behaviour by quoting the words instead of naming the thing (ota1275 was the
// first, on the same night, for the same reason).
//
// The old body was `e.text.includes("You've stood here")`, and the assertion
// below read `toContain("You've stood here before. (visit 2)")`. OTA-1104's
// CLAIM has nothing to do with either string: it is that a FIRST entry is silent
// and a RETURN greets. The counter in that literal is the exact thing the owner
// asked to be removed —
//
//   "you can't say 'this is my second time here'... find some other kind of
//    flavour"
//
// — so a pin written that way was guaranteed to break the moment anyone did
// what he asked, and to break with a message about a missing sentence rather
// than about visit counting.
//
// ⚠ Now it recognises the greeting by MEMBERSHIP IN THE RETURN POOLS. That is
// the actual identity of the thing: whatever words the pools happen to hold,
// a return greeting is a line drawn from them, and a first entry produces none.
//
// ⚠⚠ AND THE FIRST REBUILD OF THIS HELPER WAS ALSO WRONG, in a way worth writing
// down because it is the third instrument mistake in the same family. It used
// `startsWith`, on the reasoning that the store appends a cleared-bodies note to
// the greeting — true, but only half the story. `appendLog` COALESCES consecutive
// same-kind 'world' entries, so what actually reaches the log is one block:
//
//   Architect's Cell — The Reception. A clerical office with filing cabinets…
//
//   You have been here. The shape of it comes back before the details do.
//
//   Paths: north to Operations · south to First Landing.
//
// The greeting is a MIDDLE paragraph of a merged entry, so it has a prefix as
// well as a suffix and `startsWith` found nothing — an empty result, reported as
// "the game stopped greeting returns", when the game was greeting them fine. An
// instrument that cannot tell ABSENT from NOT-WHERE-I-LOOKED is worse than none.
const RETURN_POOL: readonly string[] = [...RETURN_AGAIN_LINES, ...RETURN_FAMILIAR_LINES];
/** ⚠ The GREETING itself, lifted out of whatever block it was merged into — not
 *  the containing entry. Downstream assertions ("no counter", "no digits") are
 *  about the greeting, and running them against a whole scene block would test
 *  the scene description instead. */
const stoodLines = (): string[] => {
  const out: string[] = [];
  for (const e of useGameStore.getState().gameLog) {
    for (const l of RETURN_POOL) if (e.text.includes(l)) out.push(l);
  }
  return out;
};
const move = async (cmd: string) => {
  useGameStore.getState().submitPlayerAction(cmd);
  await new Promise((r) => setTimeout(r, 700));
};

describe('OTA-1104 — a first visit is a first visit', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Counter', raceId: 'reclaimer', factionId: 'conspiracy_architects' });
    useGameStore.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 400));
  });

  it('⚠⚠⚠ THE INSTRUMENT SELF-CHECKS FIRST — the pools are loaded and unambiguous', () => {
    // A matcher that scans for substrings has two ways to lie, and both are
    // checked here rather than assumed. An EMPTY pool would make every "no
    // greeting" assertion below pass while measuring nothing; and one pool line
    // contained inside another would make a single greeting count twice, which
    // is exactly what `toHaveLength(1)` is relying on not to happen.
    expect(RETURN_POOL.length).toBeGreaterThan(20);
    const dupes = RETURN_POOL.filter((a, i) =>
      RETURN_POOL.some((b, j) => i !== j && b.includes(a)));
    expect(dupes).toEqual([]);
  });

  it('⚠ the opening scene counts ONE visit, greets nobody, and files under the HUB key', () => {
    const counts = roomCounts();
    // Exactly one room record so far, keyed WITH the resolved gate room —
    // not the suffixless orphan the boot used to mint.
    const keys = Object.keys(counts);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/@outpost_gate$/);
    expect(counts[keys[0]!]).toBe(1);
    // No RETURN greeting anywhere in a fresh opening.
    expect(stoodLines()).toHaveLength(0);
  });

  it('⚠ first entry to a new room is silent at count 1; the RETURN is greeted', async () => {
    await move('go north'); // gate -> central, first time
    let counts = roomCounts();
    const centralKey = Object.keys(counts).find((k) => k.endsWith('@outpost_central'))!;
    expect(counts[centralKey]).toBe(1);
    expect(stoodLines()).toHaveLength(0);

    await move('go south'); // back to the gate — a REAL return
    counts = roomCounts();
    const gateKey = Object.keys(counts).find((k) => k.endsWith('@outpost_gate'))!;
    expect(counts[gateKey]).toBe(2);
    const lines = stoodLines();
    expect(lines).toHaveLength(1);
    // ⚠ The claim, stated: a return is greeted, the greeting comes from the
    // recognition tier (this is the second visit, not a well-trodden one), and
    // it carries NO counter — which is what the owner objected to and what
    // OTA-1467 removed.
    expect(RETURN_AGAIN_LINES).toContain(lines[0]);
    expect(lines[0]).not.toMatch(/\(visit \d+\)/);
    expect(lines[0]).not.toMatch(/\d/);

    await move('go north'); // central again — a return to the OTHER room
    counts = roomCounts();
    expect(counts[centralKey]).toBe(2);
    // ⚠ TWO returns have now happened (the gate, then central), so two greetings
    // stand in the log. The old assertion counted entries containing the literal
    // `(visit 2)` — the debug readout OTA-1467 removed at the owner's word — so
    // it was measuring the very thing he asked to be taken out.
    const both = stoodLines();
    expect(both).toHaveLength(2);
    for (const g of both) {
      expect(RETURN_AGAIN_LINES).toContain(g);   // second visits, not well-trodden ones
      expect(g).not.toMatch(/\d/);
    }
    // ⚠ AND THEY ARE NOT THE SAME SENTENCE TWICE. `rotatingPick` refuses an
    // immediate repeat, which is the whole reason the pools replaced one fixed
    // string: "I think I've been here more than once cuz you're saying the same
    // thing."
    expect(both[0]).not.toBe(both[1]);
  });

  it('the investigation table still seeds on first entry — riding the SAME record the counter owns', async () => {
    await move('go north');
    const rooms = useGameStore.getState().worldMemory.visitedRooms ?? {};
    const central = Object.entries(rooms).find(([k]) => k.endsWith('@outpost_central'))?.[1];
    expect(central).toBeDefined();
    // One record carries BOTH the count and the table — no orphan twin.
    expect(central!.visitCount).toBe(1);
    expect(central!.roomInvestigationTable).toBeDefined();
  });
});

describe('OTA-1104 — source locks', () => {
  it('⚠ created shells seed visitCount 0 — the visit block owns the counting', () => {
    // Both build-time creators that run before the counter.
    const zeroSeeds = store.match(/visitCount: 0,/g) ?? [];
    expect(zeroSeeds.length).toBeGreaterThanOrEqual(2);
  });

  it('⚠ the greeting requires a real prior visit, not bare record existence', () => {
    expect(store).toContain('if (existing && existing.visitCount >= 1) {');
  });

  it('⚠ candidateKey uses the RESOLVED hub room, not the stale snapshot', () => {
    expect(store).toContain('const candidateKey = makeRoomKey(player.currentLocationId, microMicroId, player.mapX, player.mapY, inHub ? hubRoomId : null);');
    // The investigation seeder keys the same way.
    expect(store).toMatch(/investigateRoomKey = makeRoomKey\([\s\S]{0,160}inHub \? hubRoomId : null,/);
  });
});
