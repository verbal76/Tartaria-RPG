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



// OTA-1219 — LOOP AUDIT, BATCH 2. Same bar as batch 1: start it, finish it through a
// public action, and assert a payoff the PLAYER can see.
// OTA-1219 — LOOP AUDIT, BATCH 3. Same bar: start it, finish it, assert a payoff the
// PLAYER can see.
import { useGameStore } from '../app/state/gameStore';

jest.setTimeout(180000);

async function fresh(name: string, factionId = 'mud_monarchs') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: 'tartarian_giant', factionId });
  store.getState().skipTutorial?.();
  return store;
}

describe('LOOP 13 — the six location challenges: every one is live AND has somewhere to happen', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ all six are enabled and each names a location that EXISTS in the world', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const LC = require('../app/engine/locationChallenges') as typeof import('../app/engine/locationChallenges');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('../app/data/locations/locations.json') as { id: string }[];
    const ids = new Set((Array.isArray(raw) ? raw : (raw as { locations?: { id: string }[] }).locations ?? []).map((l) => l.id));

    expect(LC.TIER_C_ENABLED).toBe(true);
    expect(LC.LOCATION_CHALLENGES.length).toBe(6);
    const homeless: string[] = [];
    for (const c of LC.LOCATION_CHALLENGES) {
      // ⚠ A challenge switched on at a tile that does not exist is unreachable — the same
      // shape as P2, where the loop was correct and could not be got to.
      expect(LC.challengeActive(c.id)).toBe(true);
      if (!ids.has(c.locationId)) homeless.push(`${c.id} -> ${c.locationId}`);
    }
    expect(homeless).toEqual([]);
  });

  test('⚠ each challenge has a handler the store can actually reach', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const LC = require('../app/engine/locationChallenges') as typeof import('../app/engine/locationChallenges');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('path') as typeof import('path');
    // ⚠ MY FIRST VERSION LOOKED ONLY IN gameStore AND FLAGGED THREE HEALTHY CHALLENGES.
    // Three of the six do not need to be named there at all: the store calls
    // `challengeForLocation(currentLocationId)` generically and the ROUTING TABLE lives in
    // engine/titleChallenges.ts. A test that only knows one of the two routes reports the
    // other as a defect.
    const STORE = readFileSync(join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    const TC = readFileSync(join(__dirname, '../app/engine/titleChallenges.ts'), 'utf8');
    const orphans = LC.LOCATION_CHALLENGES.filter(
      (c) => !STORE.includes(c.locationId) && !TC.includes(c.locationId),
    );
    // A challenge whose tile appears in NEITHER route is one nothing can start.
    expect(orphans.map((c) => c.id)).toEqual([]);
    // And the generic route really is wired.
    expect(STORE).toContain('challengeForLocation(');
  });
});

describe('LOOP 12 — the Labyrinth: walked live, start to heart', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ enter → walk → the heart pays a keepsake, and a SECOND walk does not', async () => {
    const store = await fresh('Wanderer');
    const p = store.getState().player!;
    useGameStore.setState({ player: { ...p, currentLocationId: 'iskan_veil' } });

    await store.getState().submitPlayerAction('enter the labyrinth');
    expect(store.getState().player!.labyrinthRun).toBeTruthy();

    // ⚠ THE MAZE IS AUTHORED, NOT A GRID. My first version typed north/east alternately and
    // never arrived — of course it didn't; every map of Iskan-Veil is wrong by design. The
    // route is solved here with the engine's OWN adjacency, and then TYPED, so the walk is
    // still the player's walk: real parser, real handler, real ending.
    const solve = () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const lab = require('../app/engine/labyrinth') as typeof import('../app/engine/labyrinth');
      const start = lab.startRun();
      const seen = new Set([start.visited[0]!]);
      const queue: { run: typeof start; path: string[] }[] = [{ run: start, path: [] }];
      while (queue.length) {
        const cur = queue.shift()!;
        if (cur.run.finished) return cur.path;
        for (const d of lab.openDirections(cur.run.pos)) {
          const res = lab.step(cur.run, d);
          if (res.blocked) continue;
          const k = `${res.run.pos[0]},${res.run.pos[1]}`;
          if (seen.has(k)) continue;
          seen.add(k);
          queue.push({ run: res.run, path: [...cur.path, lab.dirWord(d).toLowerCase()] });
        }
      }
      return null;
    };
    const route = solve();
    // A maze with no route to its own heart would be the loop unfinishable outright.
    expect(route).not.toBeNull();
    for (const wordDir of route!) {
      if (!store.getState().player!.labyrinthRun) break;
      await store.getState().submitPlayerAction(wordDir);
    }

    const after = store.getState().player!;
    // THE PAYOFF: the reveal happened and left something behind.
    expect(after.labyrinthHeartSeen).toBe(true);
    expect(after.inventory.some((it) => /Rubbing of the False Map/i.test(it.name))).toBe(true);

    // ⚠ AND IT IS ONCE. The maze is re-enterable by design, so a per-run keepsake would be
    // a farm — the fix for an ends-in-nothing must not become one.
    const countBefore = after.inventory.filter((it) => /Rubbing of the False Map/i.test(it.name)).length;
    await store.getState().submitPlayerAction('enter the labyrinth');
    for (const wordDir of route!) {
      if (!store.getState().player!.labyrinthRun) break;
      await store.getState().submitPlayerAction(wordDir);
    }
    const countAfter = store.getState().player!.inventory.filter((it) => /Rubbing of the False Map/i.test(it.name)).length;
    expect(countAfter).toBe(countBefore);
  });
});

describe('LOOP 24 — hidden locations: they can be revealed, and revealing changes the name', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ every hidden tile has a real world row and a reveal path', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const HL = require('../app/engine/hiddenLocations') as typeof import('../app/engine/hiddenLocations');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('../app/data/locations/locations.json') as { id: string; name: string }[];
    const rows = new Map((Array.isArray(raw) ? raw : []).map((l) => [l.id, l]));

    const ids = Object.keys(HL.HIDDEN_LOCATIONS);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      // A hidden tile with no world row is a placeholder pointing at nothing.
      expect(rows.get(id)).toBeTruthy();
      // Unrevealed reads as the placeholder; revealed reads as the real name.
      const hidden = HL.revealedLocationName(id, rows.get(id)!.name, []);
      const shown = HL.revealedLocationName(id, rows.get(id)!.name, [id]);
      expect(hidden).toBe(HL.HIDDEN_LOCATIONS[id]!.placeholder);
      expect(shown).toBe(rows.get(id)!.name);
      expect(hidden).not.toBe(shown);
    }
  });
});

describe('LOOP 23b — chapters: each phase of the main quest has a card to show', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  test('⚠⚠ every chapter phase × motive produces a card — no phase advances into silence', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CH = require('../app/engine/chapters') as typeof import('../app/engine/chapters');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ST = require('../app/engine/story') as typeof import('../app/engine/story');
    // ⚠ EVERY PHASE × EVERY MOTIVE. A phase can hold a card for one motive and throw for
    // another — `chapterCardFor` throws by design on a missing motive line — so checking
    // one motive would leave four fifths of the matrix unread.
    const silent: string[] = [];
    for (const phase of CH.CHAPTER_PHASES) {
      for (const motive of ST.STORY_MOTIVE_IDS) {
        let card = null as ReturnType<typeof CH.chapterCardFor>;
        try {
          card = CH.chapterCardFor(phase, motive);
        } catch (e) {
          silent.push(`${phase}/${motive}: threw ${(e as Error).message}`);
          continue;
        }
        if (!card || !card.title || !card.body || !card.motiveLine) silent.push(`${phase}/${motive}`);
      }
    }
    expect(silent).toEqual([]);
  });
});
