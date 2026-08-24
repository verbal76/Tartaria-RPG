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



// OTA-1196 — LOOP AUDIT, BATCH 2. Same bar as batch 1: start it, finish it through a
// public action, and assert a payoff the PLAYER can see.
// OTA-1196 — LOOP AUDIT, BATCH 3. Same bar: start it, finish it, assert a payoff the
// PLAYER can see.
// OTA-1196 — LOOP AUDIT, BATCH 4 — the last of the WIRED rows.
import { useGameStore } from '../app/state/gameStore';
import { placedAt } from '../test-utils/placePlayer';

jest.setTimeout(180000);

async function fresh(name: string, factionId = 'mud_monarchs') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'tartarian_giant', factionId });
  store.getState().skipTutorial?.();
  return store;
}

describe('LOOP 28 — faction standing: a real action moves it, and the world reads it', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ turning in a bounty raises the posting faction\'s standing — live', async () => {
    const store = await fresh('Standing', 'forgotten_order');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HUNTS } = require('../app/engine/hunts') as typeof import('../app/engine/hunts');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getStanding } = require('../app/engine/factions') as typeof import('../app/engine/factions');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FACTION_STARTING_LOCATION } = require('../app/engine/character') as typeof import('../app/engine/character');

    const hunt = HUNTS.find((h) => h.factionId === 'forgotten_order')!;
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...p,
        ...placedAt(FACTION_STARTING_LOCATION['forgotten_order']!),
        hubRoomId: 'outpost_quarters',
        activeHunts: [{ id: hunt.id, stage: hunt.stages.length, postedByFaction: hunt.factionId, acceptedAt: Date.now() }],
      },
    });
    await store.getState().beginScene?.();

    const before = getStanding(store.getState().player!.factionStanding, 'forgotten_order');
    store.getState().turnInHunt(hunt.id);
    const after = getStanding(store.getState().player!.factionStanding, 'forgotten_order');

    // THE PAYOFF: standing is a number the player watches, and it moved.
    expect(store.getState().player!.completedHuntIds ?? []).toContain(hunt.id);
    expect(after).toBeGreaterThan(before);
  });

  test('⚠ standing is bounded — it cannot run away in either direction', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getStanding } = require('../app/engine/factions') as typeof import('../app/engine/factions');
    const rows = useGameStore.getState().player!.factionStanding;
    for (const r of rows) {
      const v = getStanding(rows, r.factionId);
      expect(v).toBeGreaterThanOrEqual(-100);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('LOOP 18 — Aetherkin: the encounter builds, and reverence is a real consequence', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ an encounter can be built in BOTH contexts and carries a real enemy', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AK = require('../app/engine/aetherkin') as typeof import('../app/engine/aetherkin');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findEnemyByName } = require('../app/engine/encounter') as typeof import('../app/engine/encounter');
    // ⚠ The encounter carries an enemy NAME, not an enemy — the caller spawns it. So the
    // reachability question is whether that name resolves: a variant the roster has never
    // heard of is an encounter that cannot be spawned.
    for (const where of ['building', 'mud'] as const) {
      const enc = AK.buildAetherkinEncounter(where);
      expect(enc).toBeTruthy();
      expect(enc.lines.length).toBeGreaterThan(0);
      const proto = findEnemyByName(enc.enemyName);
      expect(proto).toBeTruthy();
      expect(proto!.hp).toBeGreaterThan(0);
    }
    // And EVERY authored variant resolves, not just the two that happened to be rolled.
    const missing = AK.AETHERKIN_VARIANT_NAMES.filter((n) => !findEnemyByName(n));
    expect(missing).toEqual([]);
  });

  test('⚠ the revering factions are real factions — a reverence penalty owed to nobody is not a penalty', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AK = require('../app/engine/aetherkin') as typeof import('../app/engine/aetherkin');
    const known = new Set(useGameStore.getState().player!.factionStanding.map((f) => f.factionId));
    for (const f of AK.AETHERKIN_REVERING_FACTIONS) expect(known.has(f)).toBe(true);
  });
});

describe('LOOP 25 — hook puzzles: every thread runs to a terminal payoff', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ every hook kind has a chain, and every chain ENDS in something', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const H = require('../app/engine/hooks') as typeof import('../app/engine/hooks');
    const kinds = Object.keys(H.HOOK_PLANTS) as (keyof typeof H.HOOK_PLANTS)[];
    expect(kinds.length).toBeGreaterThan(0);
    const dead: string[] = [];
    for (const kind of kinds) {
      // Walk the chain stage by stage the way the store does.
      let stage = 0;
      let last = null as ReturnType<typeof H.getHookOutcome>;
      while (stage < 20) {
        const out = H.getHookOutcome(kind as never, stage);
        if (!out) break;
        last = out;
        stage++;
      }
      // ⚠ A thread that has stages but no terminal outcome is the ends-in-nothing shape:
      // the player keeps pulling and the last pull returns nothing at all.
      if (stage === 0 || !last) dead.push(`${kind}: no stages`);
      else if (!last.done && !last.line) dead.push(`${kind}: terminal stage is empty`);
    }
    expect(dead).toEqual([]);
  });
});

describe('LOOP 21 — the Fallen: a revenant can be raised and put to rest', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ a fallen hero becomes a fightable enemy, and defeat has words for it', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const R = require('../app/engine/fallenRevenants') as typeof import('../app/engine/fallenRevenants');
    const fallen = { name: 'Old Kessa', ts: 12345, gear: [], level: 3 } as never;
    const enemy = R.revenantFromFallen(fallen, 40);
    // A real enemy, not a marker.
    expect(enemy.hp).toBeGreaterThan(0);
    expect(R.isRevenant(enemy)).toBe(true);
    // And putting it down says something — the payoff for this loop is narrative.
    const lines = R.revenantDefeatLines(fallen, 'a wanderer');
    expect(lines.world.length).toBeGreaterThan(10);
    expect(lines.reward.length).toBeGreaterThan(5);
  });

  test('⚠ avenging writes back to the roster, so the same ghost is not raised twice', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const R = require('../app/engine/fallenRevenants') as typeof import('../app/engine/fallenRevenants');
    R._setFallenCacheForTests([{ name: 'Old Kessa', ts: 999, gear: [], level: 3 } as never]);
    R.markAvenged(999, 'a wanderer');
    const row = R.cachedFallen().find((f) => f.ts === 999) as unknown as { avengedBy?: string } | undefined;
    expect(row).toBeTruthy();
    expect(row!.avengedBy).toBeTruthy();
    R._setFallenCacheForTests(null);
  });
});
