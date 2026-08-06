// OTA-1127 — EVERY FIRST VISIT GREETED YOU AS A RETURNER, AND THE BOOT
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

import { useGameStore } from '../app/state/gameStore';
import { readFileSync } from 'fs';
import { join } from 'path';

const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');

const roomCounts = (): Record<string, number> => {
  const rooms = useGameStore.getState().worldMemory.visitedRooms ?? {};
  return Object.fromEntries(Object.entries(rooms).map(([k, r]) => [k, r.visitCount]));
};
const stoodLines = (): string[] => useGameStore.getState().gameLog
  .filter((e) => e.text.includes("You've stood here"))
  .map((e) => e.text);
const move = async (cmd: string) => {
  useGameStore.getState().submitPlayerAction(cmd);
  await new Promise((r) => setTimeout(r, 700));
};

describe('OTA-1127 — a first visit is a first visit', () => {
  beforeEach(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Counter', raceId: 'reclaimer', factionId: 'conspiracy_architects' });
    useGameStore.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 400));
  });

  it('⚠ the opening scene counts ONE visit, greets nobody, and files under the HUB key', () => {
    const counts = roomCounts();
    // Exactly one room record so far, keyed WITH the resolved gate room —
    // not the suffixless orphan the boot used to mint.
    const keys = Object.keys(counts);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/@outpost_gate$/);
    expect(counts[keys[0]!]).toBe(1);
    // No "stood here" greeting anywhere in a fresh opening.
    expect(stoodLines()).toHaveLength(0);
  });

  it('⚠ first entry to a new room is silent at count 1; the RETURN greets "(visit 2)"', async () => {
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
    expect(lines[0]).toContain("You've stood here before. (visit 2)");

    await move('go north'); // central again
    counts = roomCounts();
    expect(counts[centralKey]).toBe(2);
    expect(stoodLines().filter((l) => l.includes('(visit 2)'))).toHaveLength(2);
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

describe('OTA-1127 — source locks', () => {
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
