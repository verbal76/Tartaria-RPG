// Whisper-chain end-to-end smoke (OTA 187). Drives the Yulka chain
// through plant → meet → fetch → return → reward → ambush, asserts
// the state transitions land cleanly without any UI involvement.
// Pittsburgh loop in code form.

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

import { canonicalCellOf, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from '../app/engine/worldMap';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { canonicalLocationAtCell } from '../app/engine/worldMap';
import { isHourInWindow, reapExpiredWhispers, pickTargetTile, findChain, whisperRouteTarget } from '../app/engine/whispers';
import type { WhisperRecord } from '../app/engine/types';

describe('Whisper engine — pure helpers', () => {
  it('isHourInWindow handles non-wrap windows', () => {
    expect(isHourInWindow(10, 8, 16)).toBe(true);
    expect(isHourInWindow(7, 8, 16)).toBe(false);
    expect(isHourInWindow(16, 8, 16)).toBe(true);
  });

  it('isHourInWindow handles midnight-wrap windows', () => {
    // 8pm to 4am — Yulka's window
    expect(isHourInWindow(22, 20, 4)).toBe(true);  // 10pm
    expect(isHourInWindow(2, 20, 4)).toBe(true);   // 2am
    expect(isHourInWindow(10, 20, 4)).toBe(false); // 10am
    expect(isHourInWindow(20, 20, 4)).toBe(true);  // 8pm exact
    expect(isHourInWindow(4, 20, 4)).toBe(true);   // 4am exact
  });

  it('reapExpiredWhispers is a no-op since OTA 187 — whispers stay open until resolved', () => {
    // Expiration removed per playtester: "I don't think the quest
    // expiration is a good idea, keep them open." Whispers persist
    // until the player resolves them. The reap function is kept as
    // a no-op landing pad so future time-pressure chains have a
    // place to wire in if we ever change our minds.
    const whispers: WhisperRecord[] = [
      { id: 'a', stage: 'planted', plantedAtHour: 0, targetMapX: 0, targetMapY: 0, targetLocationId: 'x' },
      { id: 'b', stage: 'planted', plantedAtHour: 0, targetMapX: 0, targetMapY: 0, targetLocationId: 'x' },
    ];
    const { kept, expired } = reapExpiredWhispers(whispers, 9999);
    expect(kept.map((w) => w.id)).toEqual(['a', 'b']);
    expect(expired.length).toBe(0);
  });

  it('pickTargetTile picks within the chain range, deterministically against the player tile', () => {
    const chain = findChain('yulka_discs')!;
    const tile = pickTargetTile(chain, 10, 10);
    // yulka_discs targetOffset: dx [-1,1], dy [2,3].
    // ⚠ OTA-1548 — dy flipped from [-3,-2]: that offset walked NORTH (north is
    // y−1 everywhere in the engine) while every authored line says "south".
    // The camp is now on the side of the outpost the prose always claimed.
    expect(tile.x).toBeGreaterThanOrEqual(9);
    expect(tile.x).toBeLessThanOrEqual(11);
    expect(tile.y).toBeGreaterThanOrEqual(12);
    expect(tile.y).toBeLessThanOrEqual(13);
  });

  // OTA-465 — the Contracts "set course" uses whisperRouteTarget to pick the tile.
  // ⚠ OTA-1542 — the route target is an ABSOLUTE cell now. This legacy record
  // has no targetGridX, so the exact fallback applies: canonCell('x') + (map −
  // CENTER). The SUBJECT (stage-aware routing: thief mid-fetch, Yulka on
  // return, null when done) is unchanged.
  it('whisperRouteTarget routes Yulka to the thief tile mid-fetch, and to Yulka on return', () => {
    const base: WhisperRecord = {
      id: 'yulka_discs', stage: 'fetch_active', plantedAtHour: 0,
      targetMapX: 5, targetMapY: 5, targetLocationId: 'x',
      ctx: { thiefMapX: 8, thiefMapY: 5 },
    };
    const c = canonicalCellOf('x');
    const yulkaG = { x: c.x + (5 - WORLD_MAP_CENTER_X), y: c.y + (5 - WORLD_MAP_CENTER_Y) };
    // Mid-fetch → head to the Silt Thief's tile (3 east of Yulka in this fixture).
    const fetch = whisperRouteTarget(base);
    expect(fetch).toEqual({ gridX: yulkaG.x + 3, gridY: yulkaG.y, label: 'the Silt Thief' });
    // Recovered → head back to Yulka.
    const ret = whisperRouteTarget({ ...base, stage: 'fetch_returned' });
    expect(ret?.gridX).toBe(yulkaG.x);
    expect(ret?.gridY).toBe(yulkaG.y);
    // Just-met → still head to Yulka's tile.
    expect(whisperRouteTarget({ ...base, stage: 'met_yulka' })?.gridX).toBe(yulkaG.x);
    // No fixed tile once the deed is done.
    expect(whisperRouteTarget({ ...base, stage: 'ambush_armed' })).toBeNull();
    // ⚠ And the 1542 point itself: a record that carries targetGridX routes to
    // it VERBATIM, ignoring the frame coords entirely.
    expect(whisperRouteTarget({ ...base, stage: 'met_yulka', targetGridX: 40, targetGridY: 41 }))
      .toEqual({ gridX: 40, gridY: 41, label: "Yulka's fire" });
  });
});

describe('Yulka chain — full state-machine drive', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it("'buy from yulka' branch consumes 50 TC and grants 5 Aetheric Discs, retires the chain", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'YulkaBuyer', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // Force a planted Yulka whisper into met_yulka state and give
    // the player enough TC.
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        tc: 100,
        activeWhispers: [{
          id: 'yulka_discs',
          stage: 'met_yulka',
          plantedAtHour: 0,
          expiresAtHour: 48,
          targetMapX: p0.mapX ?? 0,
          targetMapY: p0.mapY ?? 0,
          targetLocationId: p0.currentLocationId,
          ctx: { thiefMapX: 99, thiefMapY: 99 },
        }],
      },
    });

    store.getState().submitPlayerAction('buy from yulka');

    const after = store.getState().player!;
    expect(after.tc).toBe(50);
    const discs = after.inventory.find((i) => i.name === 'Aetheric Disc');
    expect(discs?.quantity).toBe(5);
    expect((after.activeWhispers ?? []).find((w) => w.id === 'yulka_discs')).toBeUndefined();
    expect(after.completedWhisperIds ?? []).toContain('yulka_discs');
  });

  it("'accept yulka' branch advances the whisper to fetch_in_progress", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'YulkaFetcher', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        activeWhispers: [{
          id: 'yulka_discs',
          stage: 'met_yulka',
          plantedAtHour: 0,
          expiresAtHour: 48,
          targetMapX: p0.mapX ?? 0,
          targetMapY: p0.mapY ?? 0,
          targetLocationId: p0.currentLocationId,
          ctx: { thiefMapX: 99, thiefMapY: 99 },
        }],
      },
    });

    store.getState().submitPlayerAction('accept yulka');

    const w = (store.getState().player!.activeWhispers ?? []).find((w2) => w2.id === 'yulka_discs');
    expect(w?.stage).toBe('fetch_in_progress');
  });

  it("'leave yulka' branch retires the chain without reward", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'YulkaLeaver', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        activeWhispers: [{
          id: 'yulka_discs',
          stage: 'met_yulka',
          plantedAtHour: 0,
          expiresAtHour: 48,
          targetMapX: 0, targetMapY: 0, targetLocationId: 'x',
        }],
      },
    });

    store.getState().submitPlayerAction('leave yulka');

    const after = store.getState().player!;
    expect((after.activeWhispers ?? []).find((w) => w.id === 'yulka_discs')).toBeUndefined();
    expect(after.completedWhisperIds ?? []).toContain('yulka_discs');
    expect(after.inventory.find((i) => i.name === 'Aetheric Disc')).toBeUndefined();
  });

  it("returning to Yulka WITHOUT recovered Discs doesn't pay out", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'YulkaEmpty', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    // Plant the whisper in fetch_returned stage but player has no
    // Stolen Aetheric Discs in pack. Pretending they fled the thief.
    store.setState({
      player: {
        ...p0,
        tc: 0,
        mapX: 5,
        mapY: 5,
        activeWhispers: [{
          id: 'yulka_discs',
          stage: 'fetch_returned',
          plantedAtHour: 0,
          expiresAtHour: 48,
          targetMapX: 5,
          targetMapY: 5,
          targetLocationId: p0.currentLocationId,
        }],
      },
    });

    // Step "south" via stepDirection re-evaluation. Easier: call
    // the resolver via cardinal travel. Force coords to match.
    store.getState().stepDirection('north'); // forces a step; resolver runs

    const after = store.getState().player!;
    // No pay-out because no Stolen Discs in pack.
    expect(after.tc).toBe(0);
    expect(after.inventory.find((i) => i.name === 'Aetheric Disc')).toBeUndefined();
  });

  // OTA-458 regression — killing the Silt Thief grants the Stolen Aetheric Discs
  // and advances the whisper to 'fetch_returned'. Pre-fix, resolveEnemyDefeat's
  // disc grant ran an early set() that was then CLOBBERED by the monolithic loot
  // set() (built from a stale player snapshot): the discs were wiped and the stage
  // reverted to 'fetch_active' — "defeated the silt thief but didn't get the discs."
  it("killing the Silt Thief grants the Stolen Discs and advances the whisper (not clobbered by loot)", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'YulkaKiller', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    const scene = store.getState().currentScene!;
    // Whisper armed at fetch_active (thief spawned), and a 1-HP Silt Thief as the
    // active enemy with real loot so the monolithic loot set() definitely fires.
    const thief = {
      name: 'Silt Thief', damage: '1d6', abilityPoint: 'Strength 0',
      hp: 1, type: 'humanoid', loot: ['Scrap Metal'], rarity: 'Common', traits: [],
    };
    store.setState({
      player: {
        ...p0,
        activeWhispers: [{
          id: 'yulka_discs',
          stage: 'fetch_active',
          plantedAtHour: 0,
          expiresAtHour: 48,
          targetMapX: p0.mapX ?? 0,
          targetMapY: p0.mapY ?? 0,
          targetLocationId: p0.currentLocationId,
          ctx: { thiefMapX: 5, thiefMapY: 5 },
        }],
      },
      currentScene: {
        ...scene, enemies: [thief as never], enemyHps: [1], activeEnemyIdx: 0,
        range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      },
    });

    store.getState().resolveEnemyDefeat();

    const after = store.getState().player!;
    // The stolen discs survived the loot set().
    const stolen = after.inventory.find((i) => i.name === 'Stolen Aetheric Discs');
    expect(stolen).toBeDefined();
    expect(stolen!.quantity).toBe(12);
    // And the whisper advanced to the return stage (was reverting to fetch_active).
    const w = (after.activeWhispers ?? []).find((x) => x.id === 'yulka_discs');
    expect(w?.stage).toBe('fetch_returned');
  });

  // OTA-465 — "set course" walks the player cardinally toward a whisper tile.
  it('setWhisperCourse steps the player toward the objective tile and clears on arrival', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Courser', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    // arb47 — the player's position is the persistent absolute grid cell (gridX/
    // gridY); mapX/mapY are the derived CENTER-based visual frame the whisper
    // course lives in (target = playerMapX + dx at spawn). Stand at the start
    // anchor (mapX/mapY at CENTER, gridX/gridY at the location's canon cell) and
    // put the objective two tiles EAST in that same frame.
    store.setState({
      player: { ...p0, stamina: 20, staminaMax: 20, travelTarget: undefined, whisperCourse: null },
    });
    const baseMapX = p0.mapX!;
    const baseMapY = p0.mapY!;
    const baseGridX = p0.gridX!;
    const baseGridY = p0.gridY!;
    // Pick a cardinal whose first TWO cells hold no named location, so the whisper
    // course doesn't accidentally "arrive" at a neighbour (which would fire
    // travelTo and re-center). The objective tile sits two cells out in that dir.
    const dirs = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    ];
    const clear = dirs.find((d) =>
      !canonicalLocationAtCell(baseGridX + d.dx, baseGridY + d.dy)
      && !canonicalLocationAtCell(baseGridX + 2 * d.dx, baseGridY + 2 * d.dy))!;
    expect(clear).toBeDefined();
    const tgtMapX = baseMapX + 2 * clear.dx;
    const tgtMapY = baseMapY + 2 * clear.dy;
    // ⚠ OTA-1542 — setWhisperCourse takes the ABSOLUTE cell now. This test used
    // to hand it map coords, and because both are plain numbers the compiler
    // could not object — the exact silent-wrong-frame call the API change was
    // meant to end. Passing the grid cell is the new contract.
    const tgtGridX = baseGridX + 2 * clear.dx;
    const tgtGridY = baseGridY + 2 * clear.dy;

    // Set a course two cells out: the first step moves toward it and the course
    // persists (still one cell short).
    store.getState().setWhisperCourse(tgtGridX, tgtGridY, 'the Silt Thief');
    let after = store.getState().player!;
    expect(after.mapX).toBe(baseMapX + clear.dx);
    expect(after.mapY).toBe(baseMapY + clear.dy);
    expect(after.gridX).toBe(baseGridX + clear.dx); // authoritative cell stepped one
    expect(after.gridY).toBe(baseGridY + clear.dy);
    expect(after.whisperCourse).toEqual({ gridX: tgtGridX, gridY: tgtGridY, label: 'the Silt Thief' });

    // One more continue lands on the tile and clears the course.
    store.getState().continueWhisperCourse();
    after = store.getState().player!;
    expect(after.mapX).toBe(tgtMapX);
    expect(after.mapY).toBe(tgtMapY);
    expect(after.gridX).toBe(tgtGridX);
    expect(after.gridY).toBe(tgtGridY);
    expect(after.gridX).toBe(baseGridX + 2 * clear.dx);
    expect(after.gridY).toBe(baseGridY + 2 * clear.dy);
    expect(after.whisperCourse).toBeNull();
  });
});
