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

// ⚠⚠⚠ OTA-1601 — COMBAT SEPARATES.
//
// Owner, ruling on the 74-pair same-tile sweep: "the combat should be
// separated." His case in play: the Doubter's ambush and the Reaver's apex
// shared one ridge tile, and "the mission said the next ambush was further up
// the hill — that could have been a tile north."
//
// The measurement found 21 hunt fight-stages standing on their predecessor's
// tile — and every one of their own narrations already names a micro-place the
// map never had: the steeple out of the Mud Seas, the sixth landing of the
// Stair, the deep nave, the crest, the master-strand, the flooded reliquary.
// Sixteen authored fight-grounds now exist (shared where hunts share a site),
// one exact tile from their parent, and all 21 stages stand on them. Closing
// the previous stage auto-routes the one-tile leg; arrival is a real arrival;
// the OTA-1597 cell trigger and the OTA-1600 stinger meet the player there.
//
// (The other same-tile shapes — the single-site story arcs and the quiet
// investigate→stealth continuations — keep their tiles per the same ruling;
// the between-stages beat card is the next OTA.)
//
// ⚠⚠⚠ AND THE APEX FIRES AT ARRIVAL. Owner, testing the crest leg on device:
// "I autoroutes to the last stage of the mission again and nothing happened,
// I had to yell fight me again, THEN the pop up played. it should fire as
// soon as I step on the tile and I should be dropped right into the fight."
// Every hunt's FINAL boss stage carries no authored spawn, so OTA-1597's
// spawn-only arrival arm walked past all 18 of them. The arm now also fires
// the final boss stage — the exact set advanceHunt freezes for the kill — so
// separation plus arrival IS the summons: route in, boots on the cell,
// narration, apex, stinger, no verb required.

import { useGameStore } from '../app/state/gameStore';
import { armSpawnStagesAtArrival } from '../app/state/stageArrival';
import { getRaces, getFactions } from '../app/engine/character';
import { HUNTS } from '../app/engine/hunts';
import { stageLocationId } from '../app/engine/questStage';
import { huntAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { isHubLocation } from '../app/engine/hub';
import { canonicalCellOf, canonicalPositions, canonicalCellFor } from '../app/engine/worldMap';
import { SATELLITE_ATLAS_COORDS } from '../app/engine/atlasCoords';
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

const FIGHT_GROUNDS: ReadonlyArray<{ id: string; besideParent: string }> = [
  { id: 'broken_steeple', besideParent: 'mud_seas' },
  { id: 'sixth_landing', besideParent: 'endless_stair' },
  { id: 'slack_flats', besideParent: 'cradle_of_dusk' },
  { id: 'inner_archive', besideParent: 'etheric_chamber' },
  { id: 'central_pillars', besideParent: 'zharaks_teeth' },
  { id: 'reavers_crest', besideParent: 'raiders_ridge' },
  { id: 'deep_nave', besideParent: 'sinking_cathedral' },
  { id: 'builders_scaffold', besideParent: 'thametans_tower' },
  { id: 'sirens_roost', besideParent: 'drowned_quarter' },
  { id: 'master_strand', besideParent: 'obsidian_pillars' },
  { id: 'core_casing', besideParent: 'red_tower_of_nimari' },
  { id: 'cistern_intake', besideParent: 'samarran' },
  { id: 'storms_eye', besideParent: 'great_tartary_plains' },
  { id: 'flooded_reliquary', besideParent: 'tartarian_enclave' },
  { id: 'tomb_gate_rise', besideParent: 'yuldra_tul' },
  { id: 'conduit_line', besideParent: 'voronov' },
];

describe('OTA-1601 — the grounds are real, adjacent, open, and nothing moved to make room', () => {
  it('⚠⚠⚠ each fight-ground exists, is not a hub, and sits exactly one tile from its parent', () => {
    for (const g of FIGHT_GROUNDS) {
      expect(getLocationById(g.id)?.id).toBe(g.id);
      expect(isHubLocation(g.id)).toBe(false);
      expect(SATELLITE_ATLAS_COORDS[g.id]).toBeTruthy();
      const cell = canonicalCellOf(g.id);
      const parent = canonicalCellOf(g.besideParent);
      expect(Math.abs(cell.x - parent.x) + Math.abs(cell.y - parent.y)).toBe(1);
    }
  });

  it('⚠⚠ no location anywhere was displaced by the new cells — every base cell is its placed cell', () => {
    const p = canonicalPositions();
    const displaced = Object.entries(p)
      .filter(([id, cell]) => {
        const base = canonicalCellFor(id);
        return base.x !== cell.x || base.y !== cell.y;
      })
      .map(([id]) => id);
    expect(displaced).toEqual([]);
  });

  it('⚠⚠⚠ THE RATCHET — no hunt fight-stage stands on its predecessor\'s tile, ever again', () => {
    const offenders: string[] = [];
    for (const h of HUNTS) {
      const stages = h.stages ?? [];
      for (let i = 1; i < stages.length; i++) {
        const st = stages[i] as { checkKind?: string | null; spawn?: unknown };
        if (!(st.checkKind === 'boss' || !!st.spawn)) continue;
        const prev = stageLocationId(stages[i - 1] as never, huntAnchorId(h as never), resolvePosterLocation);
        const cur = stageLocationId(st as never, huntAnchorId(h as never), resolvePosterLocation);
        if (prev === cur) offenders.push(`${h.id}#${i}@${cur}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('⚠⚠ and no fight-ground is a hub or shares a cell with any other location', () => {
    const seen = new Map<string, string>();
    for (const [id, cell] of Object.entries(canonicalPositions())) {
      const key = `${cell.x},${cell.y}`;
      expect(seen.has(key) ? `${id} collides with ${seen.get(key)}` : '').toBe('');
      seen.set(key, id);
    }
  });
});

describe('OTA-1601 — his hunt, walked over the seam', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Crestward', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  function seedDoubter(stage: number, at: string) {
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
          { id: 't_stone', name: "Reaver's Spiral-Mark Stone", kind: 'misc', quantity: 1, tags: ['quest'] } as never,
          { id: 't_sign', name: "Raider's Ridge-Sign", kind: 'misc', quantity: 1, tags: ['quest'] } as never,
        ],
        activeHunts: [{ id: 'hunt_servants_doubter', stage, tracked: true } as never],
      },
      activeBuildingId: null,
      pendingMissionStinger: null,
    });
    set((s) => (s.currentScene ? {
      currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null },
    } : s));
  }

  it('⚠⚠⚠ closing the gauntlet SETS THE ROAD one tile up to the Reaver\'s Crest — one tap, and the Reaver is WAITING', async () => {
    // ⚠ OTA-1632 — setTravelCourse no longer takes the first step itself, so a
    // one-tile chain route is no longer instant: closing stage 3 leaves the
    // course SET (travel row lit, player still on the ridge) and the tap on
    // → DESTINATION lands on the crest. Arrival on the apex ground IS the
    // summons: no "fight me", no second button.
    seedDoubter(3, 'raiders_ridge');
    get().advanceHunt('hunt_servants_doubter'); // stage 3 closes in prose
    const rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(4);
    expect(get().player?.currentLocationId).toBe('raiders_ridge');
    expect(get().player?.travelTarget?.locationId).toBe('reavers_crest');
    await get().continueTravel(); // → REAVER'S CREST
    expect(get().player?.currentLocationId).toBe('reavers_crest');
    expect(get().player?.travelTarget ?? null).toBeNull();
    await settle(() => (get().currentScene?.enemies ?? []).length > 0);
    expect((get().currentScene?.enemies ?? []).length).toBeGreaterThanOrEqual(1);
    expect(get().pendingMissionStinger?.line).toContain('Come, then');
  });

  it('⚠⚠⚠ the arrival arm alone summons the apex — the 18 final boss stages no longer need the typed verb', () => {
    seedDoubter(4, 'reavers_crest');
    armSpawnStagesAtArrival(get as never, set as never);
    expect((get().currentScene?.enemies ?? []).length).toBeGreaterThanOrEqual(1);
    expect(get().pendingMissionStinger?.line).toContain('Come, then');
    const rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(4); // frozen for the kill — the arm mirrors the freeze rule
  });

  it('⚠⚠ a stage the freeze rule would NOT hold is not fired by the arm — the verb door stays', () => {
    // Stage 2 (investigate, on the Plains) and stage 3 (attack_provoke, on the
    // ridge) put no bodies up and are not the apex: standing on their grounds
    // must not auto-advance them — arrival-fires is exactly the freeze set.
    seedDoubter(2, 'great_tartary_plains');
    armSpawnStagesAtArrival(get as never, set as never);
    let rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(2);
    expect((get().currentScene?.enemies ?? []).length).toBe(0);
    seedDoubter(3, 'raiders_ridge');
    armSpawnStagesAtArrival(get as never, set as never);
    rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(3); // the provoke is the player's own swing to take
    expect((get().currentScene?.enemies ?? []).length).toBe(0);
  });

  it('⚠⚠⚠ ON THE CREST the Reaver stands up with his stinger — a separate tile, a real arrival, the full curtain', () => {
    seedDoubter(4, 'reavers_crest');
    get().advanceHunt('hunt_servants_doubter');
    expect((get().currentScene?.enemies ?? []).length).toBeGreaterThanOrEqual(1);
    expect(get().pendingMissionStinger?.line).toContain('Come, then');
    const rec = (get().player?.activeHunts ?? []).find((h) => h.id === 'hunt_servants_doubter');
    expect(rec?.stage).toBe(4); // frozen for the kill
  });
});
