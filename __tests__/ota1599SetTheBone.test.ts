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

// ⚠⚠⚠ OTA-1599 — SET THE BONE.
//
// The owner, on OTA-1598's truce guard: "you put a Band-Aid on a broken leg
// instead of setting the bone ... have the destination be the tile beside it
// ... just make all of these missions have nothing to do with an outpost or
// any other inside place that would involve combat."
//
// So the DATA moves. Three authored battle-grounds, each one tile from the
// outpost whose story it serves, where the prose already put the fighting:
//
//   raiders_ridge    (26,12) — one east of tartarian_outskirts (25,12).
//                    "East through scrub" / "the ridge the sign named" — and
//                    the stage item was already called the Raider's RIDGE-Sign.
//                    (East, not north: the whisper walkers' — and new players' —
//                    most-walked lane out of the start outpost runs north, and a
//                    named tile there hijacked every one of ota1222's chains.)
//   vault_steps      (51,28) — one west of giant_vault (52,28). The wraith
//                    ambush fights on the open stair; the tube comes up on the
//                    hoist-chain and the player never passes the doors.
//   drowned_quarter  (52,16) — one east of drakova (51,16), on the water.
//                    "You pole into the drowned quarter of Drakova" — the
//                    Siren fights were always written on the rafts.
//
// The five hunt fight-stages that stood on hub tiles now stand there instead;
// auto-route lands the player on open ground and the OTA-1597 cell trigger
// starts the fight with no gate, no truce, no LEAVE OUTPOST detour. The 1598
// truce guard stays behind this as the belt for anything authored later.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS, findHuntById } from '../app/engine/hunts';
import { MYSTERIES } from '../app/engine/mysteries';
import { STORYLINES } from '../app/engine/factionStorylines';
import { stageLocationId } from '../app/engine/questStage';
import { huntAnchorId, contractAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { isHubLocation } from '../app/engine/hub';
import { canonicalCellOf } from '../app/engine/worldMap';
import { LOCATION_ATLAS_COORDS, SATELLITE_ATLAS_COORDS } from '../app/engine/atlasCoords';
import { getLocationById } from '../app/engine/encounter';
import { placedAt } from '../test-utils/placePlayer';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const set = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

const NEW_GROUNDS: ReadonlyArray<{ id: string; besideHub: string }> = [
  { id: 'raiders_ridge', besideHub: 'tartarian_outskirts' },
  { id: 'vault_steps', besideHub: 'giant_vault' },
  { id: 'drowned_quarter', besideHub: 'drakova' },
];

function doubterStage(): number | undefined {
  return (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter')?.stage;
}

describe('OTA-1599 — the grounds are real, adjacent, and open', () => {
  it('⚠⚠⚠ each battle-ground exists, is NOT a hub, has a map pin, and sits ONE tile from its outpost', () => {
    for (const g of NEW_GROUNDS) {
      const loc = getLocationById(g.id);
      expect(loc?.id).toBe(g.id);
      expect(isHubLocation(g.id)).toBe(false);
      // Satellites live in their OWN table: placed and routable, but invisible
      // to the name-label solver, the painted-map overlays, and the radar —
      // the artist's 38 landmarks stay exactly the artist's 38.
      expect(SATELLITE_ATLAS_COORDS[g.id]).toBeTruthy();
      expect(LOCATION_ATLAS_COORDS[g.id]).toBeUndefined();
      const cell = canonicalCellOf(g.id);
      const hub = canonicalCellOf(g.besideHub);
      const dist = Math.abs(cell.x - hub.x) + Math.abs(cell.y - hub.y);
      // "the tile beside it" — his words. One tile, and never the same cell.
      expect(dist).toBe(1);
    }
  });

  it('⚠⚠⚠ the five fight-stages resolve to the new open grounds', () => {
    const groundOf = (huntId: string, stage: number): string => {
      const h = findHuntById(huntId)!;
      return stageLocationId(h.stages[stage] as never, huntAnchorId(h as never), resolvePosterLocation);
    };
    expect(groundOf('hunt_servants_doubter', 3)).toBe('raiders_ridge');
    // (OTA-1601 supersede — combat separates: the apex crest and the roost each
    // stand one further tile out, so no fight shares its predecessor's ground.)
    expect(groundOf('hunt_servants_doubter', 4)).toBe('reavers_crest');
    expect(groundOf('hunt_mud_titan', 3)).toBe('vault_steps');
    expect(groundOf('hunt_mud_siren_drakova', 5)).toBe('drowned_quarter');
    expect(groundOf('hunt_mud_siren_drakova', 6)).toBe('sirens_roost');
  });

  it('⚠⚠ THE RATCHET, all three families: no fight-stage of any kind stands on any hub tile', () => {
    const offenders: string[] = [];
    const sweep = (
      family: string,
      defs: ReadonlyArray<{ id: string; stages?: readonly unknown[] }>,
      anchorOf: (d: never) => string,
      draws: (st: { checkKind?: string | null; spawn?: unknown }) => boolean,
    ) => {
      for (const d of defs) {
        (d.stages ?? []).forEach((raw, i) => {
          const st = raw as { checkKind?: string | null; spawn?: unknown };
          if (!draws(st)) return;
          const ground = stageLocationId(st as never, anchorOf(d as never), resolvePosterLocation);
          if (isHubLocation(ground)) offenders.push(`${family}:${d.id}#${i}@${ground}`);
        });
      }
    };
    sweep('hunt', HUNTS, ((d: never) => huntAnchorId(d)) as never,
      (st) => st.checkKind === 'boss' || st.checkKind === 'attack_provoke' || !!st.spawn);
    sweep('mystery', MYSTERIES, ((d: never) => contractAnchorId(d)) as never, (st) => !!st.spawn);
    sweep('storyline', STORYLINES, ((d: never) => contractAnchorId(d)) as never, (st) => !!st.spawn);
    expect(offenders).toEqual([]);
  });
});

describe('OTA-1599 — his hunt, replayed on the set bone', () => {
  const realRandom = Math.random;

  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Bonesetter', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  afterEach(() => { Math.random = realRandom; });

  function seedDoubter(stage: number, at: string, withStone: boolean) {
    const p = get().player!;
    store.setState({
      player: {
        ...p,
        ...placedAt(at),
        hubRoomId: null,
        stamina: 100,
        travelTarget: undefined,
        whisperCourse: null,
        inventory: [
          ...p.inventory.filter((i) => !/Spiral-Mark Stone|Ridge-Sign/.test(i.name)),
          ...(withStone
            ? [{ id: 'test_spiral', name: "Reaver's Spiral-Mark Stone", kind: 'misc', quantity: 1, tags: ['quest'] } as never]
            : []),
        ],
        activeHunts: [{ id: 'hunt_servants_doubter', stage, tracked: true } as never],
      },
      activeBuildingId: null,
    });
    set((s) => (s.currentScene ? {
      currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null },
    } : s));
  }

  it('⚠⚠⚠ closing stage 2 on the Plains auto-routes to Raider\'s Ridge — never to the outpost', () => {
    seedDoubter(2, 'great_tartary_plains', true);
    Math.random = () => 0.99;
    get().advanceHunt('hunt_servants_doubter');
    expect(doubterStage()).toBe(3);
    expect(get().player?.travelTarget?.locationId).toBe('raiders_ridge');
  });

  it('⚠⚠⚠ ON THE RIDGE the verb pays clean — no gate, no truce line, and the apex stands up', async () => {
    seedDoubter(3, 'raiders_ridge', true);
    Math.random = () => 0.99;
    await get().submitPlayerAction('attack');
    await settle(() => doubterStage() === 4);
    expect(doubterStage()).toBe(4);
    expect((get().player?.inventory ?? []).some((i) => i.name === "Raider's Ridge-Sign")).toBe(true);
    expect(get().gameLog.slice(-12).some((e) => e.text.includes('outpost holds its truce'))).toBe(false);
    // ⚠ OTA-1632 — the close set the road to the crest but did not walk it
    // (setTravelCourse no longer steps by itself). One tap on → DESTINATION
    // lands on the apex ground, and arrival there stands the Reaver up.
    expect(get().player?.travelTarget?.locationId).toBe('reavers_crest');
    await get().continueTravel();
    await settle(() => (get().currentScene?.enemies ?? []).length > 0);
    expect((get().currentScene?.enemies ?? []).length).toBeGreaterThanOrEqual(1);
    expect(doubterStage()).toBe(4); // frozen for the kill
  });
});
