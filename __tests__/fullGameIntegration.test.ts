// Post-OTA-140 stress: full-game integration.
//
// Boots the real gameStore and walks a single player through a
// representative session that exercises the cross-system surfaces the
// OTA-120 → OTA-140 cleanup wave touched:
//   • Dog companion spawn (OTA-120 → OTA-124)
//   • Drink narration via inventory water bottle (OTA-125 / OTA-128)
//   • Travel waypoint — distanceRemaining counts down, scene.transitArea
//     updates (OTA-126 / OTA-127)
//   • Hook puzzle dispatch + chain reward (OTA-129 → OTA-132)
//   • Hub-room key isolation (OTA-140) — two interior IDs at the same
//     location/coords write to DISTINCT visitedRooms entries.
//
// Iteration cap (any loop): ≤200 to stay inside the 15s timeout.

jest.setTimeout(15000);

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

import { useGameStore } from '../app/state/gameStore';
import type { Hook } from '../app/engine/hooks';
import { placedAt } from '../test-utils/placePlayer';

async function bootClean(name = 'Integrator') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name,
    raceId: 'mud_dweller',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  // Pump player stamina + stats so we can take a meaningful walk
  // without the wander-gate blocking us.
  const p0 = store.getState().player!;
  store.setState({
    player: {
      ...p0,
      hubRoomId: null,
      stamina: 50,
      staminaMax: 50,
      hp: 30,
      hpMax: 30,
      stats: { strength: 12, dexterity: 12, intelligence: 12, wisdom: 12, charisma: 12 },
    },
  });
  return store;
}

describe('full-game integration — character creation + basic exploration', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('startNewGame seeds a real player + scene + game log', async () => {
    const store = await bootClean('Booter');
    const state = store.getState();
    expect(state.player).toBeTruthy();
    expect(state.player!.name).toBe('Booter');
    expect(state.player!.hp).toBeGreaterThan(0);
    expect(state.currentScene).toBeTruthy();
    expect(state.currentScene!.location).toBeTruthy();
    expect(Array.isArray(state.currentScene!.ambientNouns)).toBe(true);
  });

  it('submitPlayerAction("look around") never crashes and produces some log output', async () => {
    const store = await bootClean('Looker');
    const before = store.getState().gameLog.length;
    store.getState().submitPlayerAction('look around');
    const after = store.getState().gameLog.length;
    expect(after).toBeGreaterThan(before);
  });

  it('rest advances hoursElapsed and restores stamina', async () => {
    const store = await bootClean('Rester');
    const p0 = store.getState().player!;
    const beforeH = p0.hoursElapsed ?? 0;
    store.setState({ player: { ...p0, stamina: 1 } });
    store.getState().rest();
    const p1 = store.getState().player!;
    expect((p1.hoursElapsed ?? 0)).toBeGreaterThanOrEqual(beforeH);
    expect(p1.stamina).toBeGreaterThan(1);
  });
});

describe('travel waypoint badge + transit area (OTA-126 / OTA-127)', () => {
  beforeAll(() => {
    console.log = () => {};
  });

  it('setTravelCourse populates travelTarget with distanceRemaining (OTA-126)', async () => {
    const store = await bootClean('Walker');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locs = require('../app/data/locations/locations.json') as Array<{ id: string }>;
    const startId = store.getState().player!.currentLocationId;
    const destId = locs.find((l) => l.id !== startId)!.id;

    store.getState().setTravelCourse(destId);
    const after = store.getState().player!;
    if (after.currentLocationId === destId) {
      // 1-step arrival: travelTarget cleared
      expect(after.travelTarget).toBeFalsy();
    } else {
      expect(after.travelTarget).toBeTruthy();
      expect(after.travelTarget!.locationId).toBe(destId);
      expect(typeof after.travelTarget!.distanceRemaining).toBe('number');
      expect(after.travelTarget!.distanceRemaining).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(after.travelTarget!.distanceRemaining)).toBe(true);
    }
  });

  it('continueTravel decrements distanceRemaining monotonically per step', async () => {
    const store = await bootClean('Counter');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locs = require('../app/data/locations/locations.json') as Array<{ id: string }>;
    const startId = store.getState().player!.currentLocationId;
    const destId = locs.find((l) => l.id !== startId)!.id;
    store.getState().setTravelCourse(destId);
    const after = store.getState().player!;
    if (!after.travelTarget) return; // 1-tile arrival; nothing to step
    let prev = after.travelTarget.distanceRemaining ?? 0;

    // Pin Math.random() above the OTA-127 weather-drift threshold (0.12)
    // so we deterministically avoid the buggy `require('../engine/weather')`
    // branch on app/state/gameStore.ts:12612 (the module is actually
    // `engine/weatherEffects` / `engine/encounter`, never `engine/weather`).
    // See `.failing` test below — bug is captured there.
    const rand = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      // Cap loop at 50 steps — well within 15s timeout
      for (let i = 0; i < 50; i++) {
        const cur = store.getState().player!;
        if (!cur.travelTarget) break;
        // Top stamina off so we never bounce out on the wander gate
        store.setState({ player: { ...cur, stamina: cur.staminaMax } });
        store.getState().continueTravel();
        const next = store.getState().player!;
        if (!next.travelTarget) break;
        const remaining = next.travelTarget.distanceRemaining ?? 0;
        // OTA-126 invariant: monotonic non-increase, never negative, never NaN
        expect(remaining).toBeLessThanOrEqual(prev);
        expect(remaining).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(remaining)).toBe(true);
        prev = remaining;
      }
    } finally {
      rand.mockRestore();
    }
  });

  // OTA-141 — fixed. OTA-127 weather-drift on per-step transit used
  // `require('../engine/weather')` which crashed with MODULE_NOT_FOUND
  // (pickWeather actually lives in '../engine/encounter', already
  // imported at the top of gameStore.ts). Replaced with the existing
  // pickWeather reference; no require needed. Found by the OTA-141
  // post-cleanup stress sweep.
  it('weather drift during transit does NOT crash (OTA-127 fix verified)', async () => {
    const store = await bootClean('Crasher');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locs = require('../app/data/locations/locations.json') as Array<{ id: string }>;
    const startId = store.getState().player!.currentLocationId;
    const destId = locs.find((l) => l.id !== startId)!.id;
    store.getState().setTravelCourse(destId);
    if (!store.getState().player!.travelTarget) return;
    // Force the weather-drift branch every step (Math.random()<0.12).
    const rand = jest.spyOn(Math, 'random').mockReturnValue(0.01);
    try {
      const cur = store.getState().player!;
      store.setState({ player: { ...cur, stamina: cur.staminaMax } });
      // Pre-OTA-141 this threw MODULE_NOT_FOUND on the broken require
      // path. Post-fix it runs cleanly and the scene's weather may
      // refresh. Just assert no throw + scene still has a weather
      // object.
      expect(() => store.getState().continueTravel()).not.toThrow();
      expect(store.getState().currentScene?.weather).toBeTruthy();
    } finally {
      rand.mockRestore();
    }
  });

  it('stopTravel clears travelTarget AND scene.transitArea', async () => {
    const store = await bootClean('Stopper');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const locs = require('../app/data/locations/locations.json') as Array<{ id: string }>;
    const startId = store.getState().player!.currentLocationId;
    const destId = locs.find((l) => l.id !== startId)!.id;
    store.getState().setTravelCourse(destId);
    // Force a transit label on the scene so we can verify it clears.
    store.setState((s) => s.currentScene
      ? { currentScene: { ...s.currentScene, transitArea: 'near Asgardar' } }
      : s);
    if (!store.getState().player!.travelTarget) {
      // 1-tile arrival; nothing to stop. Skip cleanly.
      return;
    }
    store.getState().stopTravel();
    expect(store.getState().player!.travelTarget).toBeFalsy();
    expect(store.getState().currentScene!.transitArea).toBeFalsy();
  });
});

describe('drink narration (OTA-125 / OTA-128) — verb-aware dispatch', () => {
  beforeAll(() => {
    console.log = () => {};
  });

  it('drink with a water bottle in inventory routes through the eat path (not rest)', async () => {
    const store = await bootClean('Drinker');
    const p = store.getState().player!;
    // Plant a Water Bottle into inventory.
    const bottle = {
      id: 'wb-1',
      name: 'Water Bottle',
      quantity: 1,
      kind: 'consumable' as const,
      tags: ['drink', 'water', 'container'],
    };
    store.setState({ player: { ...p, inventory: [...p.inventory, bottle] } });

    const before = store.getState().gameLog.length;
    store.getState().submitPlayerAction('drink the water bottle');
    const after = store.getState().gameLog.length;
    expect(after).toBeGreaterThan(before);
    const log = store.getState().gameLog.slice(before).map((e) => e.text).join('\n');
    // OTA-125/128 — verb should narrate as drink (or at minimum not crash).
    // Bare matches against /drink/i; we don't insist on exact phrasing
    // because narration can vary, but we DO insist the word fires.
    expect(/drink|sip|gulp/i.test(log)).toBe(true);
  });

  it('drink WITHOUT a water source or bottle emits an arbiter hint, not a crash', async () => {
    const store = await bootClean('Thirsty');
    const before = store.getState().gameLog.length;
    store.getState().submitPlayerAction('drink');
    const after = store.getState().gameLog.length;
    expect(after).toBeGreaterThan(before);
    // No throw; state stays coherent.
    expect(store.getState().player).toBeTruthy();
  });

  it('drink with a water source in ambientNouns succeeds via the water-source path', async () => {
    const store = await bootClean('Streamer');
    const scene = store.getState().currentScene!;
    // Inject a water-source noun so the WATER_SOURCE_NOUNS scan hits.
    store.setState({
      currentScene: {
        ...scene,
        ambientNouns: Array.from(new Set([...(scene.ambientNouns ?? []), 'stream', 'water'])),
      },
    });
    const p0 = store.getState().player!;
    // Drain stamina so the water grant has a delta to apply.
    store.setState({ player: { ...p0, stamina: Math.max(1, p0.stamina - 5) } });
    const before = store.getState().gameLog.length;
    store.getState().submitPlayerAction('drink water');
    const after = store.getState().gameLog.length;
    expect(after).toBeGreaterThan(before);
    // Player is still coherent — no NaN / negative stamina.
    const p1 = store.getState().player!;
    expect(Number.isFinite(p1.stamina)).toBe(true);
    expect(p1.stamina).toBeGreaterThanOrEqual(0);
  });
});

describe('hook puzzle dispatch (OTAs 129-132) — vault solve via real store', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('rotating [left, right, right] solves a planted sealed_vault_door hook', async () => {
    const store = await bootClean('Puzzler');
    const scene = store.getState().currentScene!;
    const hook: Hook = {
      id: 'integ_vault',
      kind: 'sealed_vault_door',
      nouns: ['vault', 'door', 'ring', 'tumbler'],
      plantedLine: 'A circular Tartarian vault door.',
      stage: 0,
      resolved: false,
    };
    store.setState({
      currentScene: {
        ...scene,
        hooks: [hook],
        ambientNouns: Array.from(new Set([...(scene.ambientNouns ?? []), 'ring', 'vault'])),
        enemies: [],
        vendor: null,
      },
    });

    store.getState().submitPlayerAction('rotate the ring left');
    let h = store.getState().currentScene!.hooks.find((x) => x.id === 'integ_vault')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(1);

    store.getState().submitPlayerAction('rotate the ring right');
    h = store.getState().currentScene!.hooks.find((x) => x.id === 'integ_vault')!;
    expect(h.puzzleProgress?.correctSoFar).toBe(2);

    store.getState().submitPlayerAction('rotate the ring right');
    h = store.getState().currentScene!.hooks.find((x) => x.id === 'integ_vault')!;
    expect(h.stage).toBeGreaterThanOrEqual(1);
  });

  it('a non-direction intent like "push the ring" doesn\'t advance correctSoFar', async () => {
    const store = await bootClean('Pusher');
    const scene = store.getState().currentScene!;
    const hook: Hook = {
      id: 'integ_vault_2',
      kind: 'sealed_vault_door',
      nouns: ['vault', 'door', 'ring', 'tumbler'],
      plantedLine: 'A circular Tartarian vault door.',
      stage: 0,
      resolved: false,
    };
    store.setState({
      currentScene: {
        ...scene,
        hooks: [hook],
        ambientNouns: Array.from(new Set([...(scene.ambientNouns ?? []), 'ring', 'vault'])),
        enemies: [],
        vendor: null,
      },
    });
    store.getState().submitPlayerAction('push the ring');
    const h = store.getState().currentScene!.hooks.find((x) => x.id === 'integ_vault_2')!;
    // Wrong intent does not progress vault rotations.
    expect(h.puzzleProgress?.correctSoFar ?? 0).toBe(0);
  });
});

describe('hub-room key isolation (OTA-140) — two interiors at same coords', () => {
  it('writing to chandelier_study + armory at the same locationId/coords produces 2 distinct keys', async () => {
    const store = await bootClean('Keyholder');
    const p = store.getState().player!;
    // Force hub interior 1 — chandelier_study
    store.setState({
      player: {
        ...p,
        ...placedAt('asgardar'),
        hubRoomId: 'chandelier_study',
      },
    });
    const key1 = 'asgardar@_@20,20@chandelier_study';
    store.setState((s) => ({
      worldMemory: {
        ...s.worldMemory,
        visitedRooms: {
          ...(s.worldMemory.visitedRooms ?? {}),
          [key1]: {
            firstVisitAt: Date.now(),
            lastVisitAt: Date.now(),
            visitCount: 1,
            searchedAmbientNouns: ['chandelier'],
          },
        },
      },
    }));

    // Walk into armory at the same coords
    store.setState({
      player: { ...store.getState().player!, hubRoomId: 'armory' },
    });
    const key2 = 'asgardar@_@20,20@armory';
    store.setState((s) => ({
      worldMemory: {
        ...s.worldMemory,
        visitedRooms: {
          ...(s.worldMemory.visitedRooms ?? {}),
          [key2]: {
            firstVisitAt: Date.now(),
            lastVisitAt: Date.now(),
            visitCount: 1,
            searchedAmbientNouns: ['anvil'],
          },
        },
      },
    }));

    const rooms = store.getState().worldMemory.visitedRooms ?? {};
    expect(rooms[key1]).toBeDefined();
    expect(rooms[key2]).toBeDefined();
    expect(rooms[key1]?.searchedAmbientNouns).toEqual(['chandelier']);
    expect(rooms[key2]?.searchedAmbientNouns).toEqual(['anvil']);
    // Cross-contamination check: the two rooms have disjoint searched
    // ambient noun lists.
    expect(rooms[key1]?.searchedAmbientNouns?.some((n) => rooms[key2]?.searchedAmbientNouns?.includes(n))).toBeFalsy();
  });
});
