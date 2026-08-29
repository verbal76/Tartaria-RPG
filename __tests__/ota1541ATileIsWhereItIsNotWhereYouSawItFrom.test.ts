/**
 * OTA-1541 — A TILE IS WHERE IT IS, NOT WHERE YOU SAW IT FROM.
 *
 * Owner: *"also this tile just repopulated after I hit autoroute to the
 * mission"* — with the order to dig deep, because this is the FOURTH report of
 * the same symptom and the third "fix" was already on his device:
 *
 *   arb105    restock on a 48h timer          → red-team: `rest` buys hours free
 *   arb107    restock on a named round trip   → an auto-course is a round-trip machine
 *   OTA-1529  BOTH, ANDed                     → fired again within days
 *
 * ⚠⚠⚠ ALL THREE FIXED THE GATE, AND THE GATE WAS NEVER THE LEAK. Room ledgers
 * are filed under `makeRoomKey(currentLocationId, mm, mapX, mapY)` — but
 * `mapX/mapY` are coordinates on a map that `travelToLocation` RECENTERS on
 * every named arrival (`mapX: WORLD_MAP_CENTER_X`), and `currentLocationId`
 * changes with it. The same physical tile is therefore re-addressed after every
 * named-location arrival. An auto-course to a mission ENDS in such an arrival,
 * so the return leg walks tiles whose ledgers — consumed nouns, gear roster,
 * dig counts, clearedAt stamps — sit orphaned under the previous frame's
 * address. The new key reads empty, `consumedHere.size > 0` is false, and
 * OTA-1529's gate is never consulted at all. Its own tell is in the owner's
 * log: the tile refilled with NO restock line, and a real restock always
 * prints one.
 *
 * ⚠⚠⚠ THE AUTHORITATIVE ANSWER ALREADY EXISTED. arb47 established the absolute
 * cell (`gridX/gridY`, playerGridCell — "ONE source of truth for where the
 * player is") and the map marker, distances, and movement were all converted to
 * it. The room-key system never was. And the conversion needs nothing new: the
 * map is always generated centered on `currentLocationId`, so
 * `absolute = canonCell(locationId) + (map − CENTER)` — the exact formula
 * playerGridCell has used for its legacy fallback all along.
 *
 * ⚠⚠ ONE CHOKE POINT, 47 CALL SITES UNTOUCHED. Ground keys become
 * `grid@mm@ax,ay` inside makeRoomKey itself. Hub interiors keep their shape —
 * nothing recenters inside a hub, their keys were always stable, and every hub
 * record in every save is filed under them.
 *
 * ⚠⚠ SAVES MIGRATE LOSSLESSLY, because an old key RECORDS its own frame. Its
 * locationId prefix names the map it was minted on, so `canonCell(prefix) +
 * (x,y − CENTER)` recovers the absolute cell exactly. Collisions under the new
 * key ARE the bug made visible — the same tile filed from two frames — and the
 * merge never resurrects consumption recorded in either ledger.
 */
// Importing the store drags the native world in; same mock preamble the other
// store-importing suites use (absoluteGridPosition et al).
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
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import { makeRoomKey, migrateGroundRoomKeys } from '../app/state/gameStore';
import { canonicalCellOf, WORLD_MAP_CENTER_X as CX, WORLD_MAP_CENTER_Y as CY } from '../app/engine/worldMap';
import type { VisitedRoom } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

/** The map frame a player standing at `locId` sees: a tile at absolute (ax,ay)
 *  appears at map coords CENTER + (abs − canonCell(locId)). This mirrors
 *  travelToLocation's recenter and the cardinal step's co-write. */
const frameCoords = (locId: string, ax: number, ay: number): { mapX: number; mapY: number } => {
  const c = canonicalCellOf(locId);
  return { mapX: CX + (ax - c.x), mapY: CY + (ay - c.y) };
};

describe('OTA-1541 — one tile, one key, from every frame', () => {
  it('⚠⚠⚠ THE BUG: the same tile keyed from two frames now yields the SAME key', () => {
    // The reported scenario. A tile near Reclaimer's Stake, cleared while that
    // frame was live; the auto-course arrives somewhere and recenters; the
    // return leg views the same dirt from the new frame. Pre-1541 these were
    // two different rooms and the second one was born fully stocked.
    const stake = canonicalCellOf('reclaimer_stake');
    const ax = stake.x + 2;
    const ay = stake.y + 1;
    const before = frameCoords('reclaimer_stake', ax, ay);
    const after = frameCoords('monarch_waystation', ax, ay);
    const keyBefore = makeRoomKey('reclaimer_stake', null, before.mapX, before.mapY, null);
    const keyAfter = makeRoomKey('monarch_waystation', null, after.mapX, after.mapY, null);
    expect(keyBefore).toBe(keyAfter);
    expect(keyBefore).toBe(`grid@_@${ax},${ay}`);
  });

  it('⚠⚠⚠ …across EVERY frame the game can put the player in', () => {
    // Not just one pair: the key must be invariant over the whole location
    // catalogue, or some route will still find the seam.
    const target = { ax: 3, ay: -7 };
    const keys = new Set(
      ['reclaimer_stake', 'monarch_waystation', 'great_tartary_plains', 'iskan_veil', 'hidden_market']
        .map((loc) => {
          const f = frameCoords(loc, target.ax, target.ay);
          return makeRoomKey(loc, 'mm42', f.mapX, f.mapY, null);
        }),
    );
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('grid@mm42@3,-7');
  });

  it('⚠⚠ hub interiors keep their exact legacy key — stable then, untouched now', () => {
    // Inside a hub nothing recenters and every save's hub records live under
    // this shape. Re-keying them would be OTA-1104's orphaning, done on purpose.
    expect(makeRoomKey('reclaimer_stake', 'mm1', 10, 14, 'outpost_gate'))
      .toBe('reclaimer_stake@mm1@10,14@outpost_gate');
  });

  it('⚠ coordinate-less keys keep the legacy shape — there is no cell to convert', () => {
    expect(makeRoomKey('reclaimer_stake', null, null, null, null)).toBe('reclaimer_stake@_@_,_');
  });

  it('⚠⚠ different tiles stay different — the key still separates ground', () => {
    const a = makeRoomKey('reclaimer_stake', null, CX, CY, null);
    const b = makeRoomKey('reclaimer_stake', null, CX + 1, CY, null);
    const c = makeRoomKey('reclaimer_stake', 'other_mm', CX, CY, null);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe('OTA-1541 — saves migrate losslessly, because old keys record their frame', () => {
  const room = (over: Partial<VisitedRoom>): VisitedRoom => ({
    firstVisitAt: 1000, lastVisitAt: 2000, visitCount: 1, ...over,
  });

  it('⚠⚠⚠ an old ground key converts through its OWN frame, not the current one', () => {
    const stake = canonicalCellOf('reclaimer_stake');
    const migrated = migrateGroundRoomKeys({
      [`reclaimer_stake@_@${CX + 2},${CY + 1}`]: room({ searchedAmbientNouns: ['mud'] }),
    })!;
    expect(Object.keys(migrated)).toEqual([`grid@_@${stake.x + 2},${stake.y + 1}`]);
    expect(Object.values(migrated)[0]!.searchedAmbientNouns).toEqual(['mud']);
  });

  it('⚠⚠⚠ two frames of ONE tile merge without resurrecting anything consumed', () => {
    // This collision IS the historical bug: the same dirt, two ledgers. The
    // union rule is what stops a merge from quietly handing loot back.
    const stake = canonicalCellOf('reclaimer_stake');
    const way = canonicalCellOf('monarch_waystation');
    const ax = stake.x + 2, ay = stake.y + 1;
    const fromStake = `reclaimer_stake@_@${CX + 2},${CY + 1}`;
    const fromWay = `monarch_waystation@_@${CX + (ax - way.x)},${CY + (ay - way.y)}`;
    const migrated = migrateGroundRoomKeys({
      [fromStake]: room({ lastVisitAt: 2000, searchedAmbientNouns: ['rope'], digYields: 4, visitCount: 3 }),
      [fromWay]: room({ lastVisitAt: 5000, searchedAmbientNouns: ['mud'], digYields: 1, visitCount: 1, dogSmelledHere: true }),
    })!;
    const keys = Object.keys(migrated);
    expect(keys).toEqual([`grid@_@${ax},${ay}`]);
    const merged = migrated[keys[0]!]!;
    expect(new Set(merged.searchedAmbientNouns)).toEqual(new Set(['rope', 'mud']));
    expect(merged.digYields).toBe(4);          // max — a cap already spent stays spent
    expect(merged.visitCount).toBe(3);         // max, not sum — same tile, not two tiles
    expect(merged.firstVisitAt).toBe(1000);
    expect(merged.lastVisitAt).toBe(5000);
    expect(merged.dogSmelledHere).toBe(true);
  });

  it('⚠⚠ hub keys and grid keys pass through migration untouched', () => {
    const input = {
      'reclaimer_stake@mm1@10,14@outpost_gate': room({}),
      'grid@_@3,-7': room({}),
      'reclaimer_stake@_@_,_': room({}),
    };
    const out = migrateGroundRoomKeys(input)!;
    expect(new Set(Object.keys(out))).toEqual(new Set(Object.keys(input)));
  });

  it('⚠⚠ the migration is idempotent — a save loaded twice is not re-keyed twice', () => {
    const once = migrateGroundRoomKeys({ [`reclaimer_stake@_@${CX},${CY}`]: room({}) })!;
    const twice = migrateGroundRoomKeys(once);
    expect(twice).toBe(once); // unchanged input returns the same reference
  });

  it('⚠ and it runs at the ONE load door every save passes through', () => {
    // OTA-998 made migrateLoadedWorldMemory the single migration site precisely
    // so a fix like this cannot miss a load path (loadSlot, resurrect, …).
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    const door = code.indexOf('export function migrateLoadedWorldMemory');
    const call = code.indexOf('visitedRooms: migrateGroundRoomKeys(wm.visitedRooms),');
    expect(door).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(door);
  });
});

describe('OTA-1541 — the gate the last three fixes built finally has a wall', () => {
  it('⚠⚠ OTA-1529\'s restock condition is intact — this OTA moves the ADDRESS, not the rule', () => {
    // Round trip AND hours: both still required. The gate was always right; it
    // was standing next to a hole.
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(code).toContain("const roundTripped = typeof clearedSeq === 'number' && macroVisitSeq > clearedSeq;");
    expect(code).toContain('if (roundTripped && hoursTurned) {');
  });

  it('⚠⚠ no call site was touched — the fix lives at the choke point', () => {
    // 47 callers pass (currentLocationId, mm, mapX, mapY, hub) exactly as
    // before; the conversion happens inside makeRoomKey. A fix that edited 47
    // sites would guarantee a 48th slips in unfixed.
    const code = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(code).toContain('return `grid@${mm}@${ax},${ay}`;');
    expect(code).toContain('return `${locationId}@${mm}@${x},${y}${hubSuffix}`;');
  });
});
