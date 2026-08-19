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
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1044 — THE MOTIVE DRIP (story phase 3, closes the arc). Owner: "we
// need to keep updating the player as they play." This suite locks: five
// authored beats per motive with monotone gates; strict-order one-shot
// delivery through real travel arrivals; The Missing's trail ending in one
// of three deterministic resolutions at a Lost Capital (grave / lie /
// walker, keepsake guaranteed); and the wiring — travel hook, walker defeat
// hook, EndingScreen epilogue override — pinned at the source level.
jest.setTimeout(60000);

import * as fs from 'fs';
import * as path from 'path';
import { useGameStore } from '../app/state/gameStore';
import {
  beatsForMotive,
  nextDripBeat,
  missingResolutionDue,
  missingResolution,
  missingResolutionFor,
  missingResolvedEpilogue,
  missingPersonName,
  missingWalkerEnemy,
  isMissingWalker,
  storySeed,
  MISSING_RESOLUTION_KINDS,
} from '../app/engine/storyDrip';
import { STORY_MOTIVE_IDS } from '../app/engine/story';

const MISSING_BEAT_IDS = ['missing_1', 'missing_2', 'missing_3', 'missing_4', 'missing_5'];
const CAPITALS = ['samarran', 'nimari', 'drakova', 'voronov', 'karok_sa', 'yuldra_tul'];

describe('OTA-1044 — the authored drip is complete and well-ordered', () => {
  it('every motive carries five beats with rising gates and real text', () => {
    for (const motive of STORY_MOTIVE_IDS) {
      const pool = beatsForMotive(motive);
      expect(pool.length).toBe(5);
      let lastHours = -1;
      let lastCores = -1;
      for (const b of pool) {
        expect(b.id.startsWith(`${motive}_`)).toBe(true);
        expect(b.text.length).toBeGreaterThan(120);
        expect(['world', 'arbiter']).toContain(b.speaker);
        expect(b.minHours).toBeGreaterThanOrEqual(lastHours);
        expect(b.minCores).toBeGreaterThanOrEqual(lastCores);
        lastHours = b.minHours;
        lastCores = b.minCores;
      }
    }
  });

  it('all three Missing resolutions are authored: arrival, keepsake, epilogue (+ defeat for the walker)', () => {
    for (const kind of MISSING_RESOLUTION_KINDS) {
      const res = missingResolution(kind, 'Maren');
      expect(res.arrival.length).toBeGreaterThanOrEqual(3);
      for (const l of res.arrival) expect(l.text.length).toBeGreaterThan(80);
      expect(res.keepsake.name.length).toBeGreaterThan(3);
      expect(res.epilogue.length).toBeGreaterThan(80);
      if (kind === 'walker') {
        expect(res.defeat!.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('resolution + person name are deterministic per seed, and {name} is filled everywhere', () => {
    expect(missingResolutionFor('a|b|c')).toBe(missingResolutionFor('a|b|c'));
    expect(missingPersonName('a|b|c')).toBe(missingPersonName('a|b|c'));
    const res = missingResolution('walker', 'Veyra');
    const all = [...res.arrival, ...(res.defeat ?? [])].map((l) => l.text).join(' ') + res.epilogue;
    expect(all).not.toMatch(/\{name\}/);
    expect(all).toContain('Veyra');
  });

  it('nextDripBeat enforces strict order and both gates', () => {
    const base = {
      name: 'T', raceId: 'r', factionId: 'f', storyMotive: 'debt' as const,
      storyBeatsSeen: [] as string[], hoursElapsed: 0,
      mainQuest: { phase: 'hook' as const, coresRecovered: [] as string[] },
    };
    expect(nextDripBeat(base)).toBeNull(); // 0h < 6h
    expect(nextDripBeat({ ...base, hoursElapsed: 10 })!.id).toBe('debt_1');
    // Later beats never jump the queue, even when their own gates pass.
    expect(nextDripBeat({ ...base, hoursElapsed: 999 })!.id).toBe('debt_1');
    // Cores gate: beat 3 needs a Core even at high hours.
    expect(nextDripBeat({ ...base, hoursElapsed: 999, storyBeatsSeen: ['debt_1', 'debt_2'] })).toBeNull();
    expect(nextDripBeat({
      ...base, hoursElapsed: 999, storyBeatsSeen: ['debt_1', 'debt_2'],
      mainQuest: { phase: 'cores' as const, coresRecovered: ['asgardar'] },
    })!.id).toBe('debt_3');
    // All seen → silence.
    expect(nextDripBeat({
      ...base, hoursElapsed: 999,
      storyBeatsSeen: ['debt_1', 'debt_2', 'debt_3', 'debt_4', 'debt_5'],
      mainQuest: { phase: 'cores' as const, coresRecovered: ['a', 'b', 'c'] },
    })).toBeNull();
  });

  it('the walker is a boss banded off the player frame, flagged for the defeat hook', () => {
    const foe = missingWalkerEnemy(40, 'Tam');
    expect(foe.boss).toBe(true);
    expect(foe.hp).toBeGreaterThanOrEqual(60);
    expect(foe.hp).toBeLessThanOrEqual(140);
    expect(foe.name).toContain('Tam');
    expect(isMissingWalker(foe)).toBe(true);
    expect(foe.traits).toContain('fallen_revenant'); // revenant rules apply (mercy, no talk-down)
  });
});

describe('OTA-1044 — the drip rides real travel arrivals', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  function logsText(): string {
    return useGameStore.getState().gameLog.map((e) => e.text).join('\n');
  }

  // Arrival scenes can roll hostile; the drip correctly holds then. Travel
  // until a calm arrival lets it speak (bounded — flake-proof, not infinite).
  function travelUntil(pred: () => boolean, stops: string[]): void {
    for (let i = 0; i < stops.length && !pred(); i++) {
      useGameStore.getState().travelTo(stops[i]!);
      const st = useGameStore.getState();
      if ((st.currentScene?.enemies?.length ?? 0) > 0 && !pred()) {
        useGameStore.setState({ currentScene: { ...st.currentScene!, enemies: [], enemyHps: [] } });
      }
      useGameStore.setState({ chapterCard: null });
    }
  }

  it('a due beat fires on arrival, is marked seen, and never repeats', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({
      name: 'Ledger', raceId: 'unknowing_mass', factionId: 'reclaimers_guild', motiveId: 'debt',
    } as any);
    store.getState().dismissStoryIntro();
    store.getState().skipTutorial();
    store.setState({ player: { ...store.getState().player!, hoursElapsed: 10 } });

    travelUntil(() => (store.getState().player!.storyBeatsSeen ?? []).length > 0,
      ['asgardar', 'reclaimer_stake', 'asgardar', 'reclaimer_stake', 'asgardar', 'reclaimer_stake']);
    expect(store.getState().player!.storyBeatsSeen).toEqual(['debt_1']);
    expect(logsText()).toMatch(/recalculated with interest/);

    // Beat 2 gated at 16h — nothing new fires at 10h no matter how far you walk.
    const before = store.getState().gameLog.length;
    travelUntil(() => false, ['asgardar', 'reclaimer_stake']);
    expect(store.getState().player!.storyBeatsSeen).toEqual(['debt_1']);
    const dripLinesSince = store.getState().gameLog.slice(before).filter((e) => /recalculated with interest|paying ransom/.test(e.text));
    expect(dripLinesSince.length).toBe(0);
  });

  it("The Missing's trail ends at a Lost Capital with the seed's own answer", async () => {
    const store = useGameStore;
    await store.getState().startNewGame({
      name: 'Searcher', raceId: 'unknowing_mass', factionId: 'reclaimers_guild', motiveId: 'missing',
    } as any);
    store.getState().dismissStoryIntro();
    store.getState().skipTutorial();
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        hoursElapsed: 200,
        storyBeatsSeen: [...MISSING_BEAT_IDS],
        mainQuest: { phase: 'cores', coresRecovered: ['asgardar', 'ostragar', 'iskan_veil'] },
      },
    } as any);
    const seed = storySeed(store.getState().player!);
    const kind = missingResolutionFor(seed);
    const person = missingPersonName(seed);
    expect(missingResolutionDue(store.getState().player!)).toBe(true);

    const resolved = () => {
      const st = useGameStore.getState();
      return !!st.player!.missingResolved || (st.currentScene?.enemies ?? []).some((e) => isMissingWalker(e));
    };
    // Only Capital arrivals can end the trail — walk the circuit until one is calm.
    for (let i = 0; i < CAPITALS.length && !resolved(); i++) {
      store.getState().travelTo(CAPITALS[i]!);
      const st = store.getState();
      if (!resolved() && (st.currentScene?.enemies?.length ?? 0) > 0) {
        store.setState({ currentScene: { ...st.currentScene!, enemies: [], enemyHps: [] } });
      }
      store.setState({ chapterCard: null });
    }
    expect(resolved()).toBe(true);

    if (kind === 'walker') {
      // The fight is the answer: boss in the scene, thread NOT yet marked
      // (a fled fight re-offers it), keepsake waits for the defeat hook.
      const foe = store.getState().currentScene!.enemies.find((e) => isMissingWalker(e))!;
      expect(foe.name).toContain(person);
      expect(store.getState().player!.missingResolved).toBeUndefined();
      expect(logsText()).toMatch(/the way a door says a name/);
    } else {
      expect(store.getState().player!.missingResolved).toBe(kind);
      const keepsake = kind === 'grave' ? 'Weathered Locket' : 'Unsent Letter';
      expect(store.getState().player!.inventory.some((i) => i.name === keepsake)).toBe(true);
      expect(logsText()).toContain(person);
      // The resolved thread now owns the ending's epilogue.
      expect(missingResolvedEpilogue(store.getState().player!)).toBe(missingResolution(kind, person).epilogue);
    }
  });
});

describe('OTA-1044 — SOURCE LOCKS (category: the drip reaches the game)', () => {
  const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
  const endingSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'screens', 'EndingScreen.tsx'), 'utf8');

  it('travel arrivals advance the drip (after the main-quest trigger)', () => {
    expect(storeSrc).toMatch(/advanceStoryDrip\(get, set, locationId\);/);
  });

  // ⚠ OTA-1246 RETARGET — these two pinned the MISSING-ONLY spellings. That path
  // is now the general one (every motive resolves on the same machine), so the
  // pins follow it rather than pinning a call that no longer exists. What they
  // were protecting is unchanged and is now covered LIVE for all five motives by
  // ota1246EveryMotiveEnds: the kill grants the keepsake and marks the thread,
  // and the resolved epilogue outranks the open-question one.
  it('the kill path closes the resolved thread: guaranteed beats + keepsake + resolved mark', () => {
    expect(storeSrc).toMatch(/dripMod\.motiveBossFromEnemy\(enemy\)/);
    expect(storeSrc).toMatch(/motiveResolved: bossTag\.kind/);
    // The Missing keeps its original field written alongside, so a save that
    // finished that trail before OTA-1246 still reads exactly as it did.
    expect(storeSrc).toMatch(/bossTag\.motive === 'missing' \? \{ missingResolved: bossTag\.kind \}/);
  });

  it("EndingScreen prefers the resolved thread's epilogue over the open-question one", () => {
    expect(endingSrc).toMatch(/resolvedEpilogue\(player\) \?\? epilogueMotiveLine\(ending, player\.storyMotive\)/);
  });
});
