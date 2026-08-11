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

// ⚠⚠ OTA-1225 — THE FOURTH DOOR, AND THE RECKONING BEFORE ALL FOUR. Owner, on
// the last open item in the character arc: *"yes stay is right, kin is the bar,
// bundle the reckoning."*
//
// The design problem he named first, and it governs every assertion here:
// *"unless this is advertised everywhere and the Arbiter narrates the
// consequences constantly, it will look like they were cheated out of an
// outcome."* The resolution is that the gate is ADDITIVE. SEAL, UNLEASH and
// PRESERVE belong to every character who reaches the Nexus, unconditionally,
// forever. STAY is added for a run that earned it. Nothing is ever removed,
// greyed out, or named-then-withheld — so a player who does not earn it never
// learns it was there, and needs no warning they were never given.
//
// THE INVARIANT THIS SUITE EXISTS TO HOLD: **the three base endings must never
// acquire a condition.** If a future change gates one of them, this fails. That
// is the difference between "choices have consequences" and "you were cheated".
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import {
  canStayAtTheNexus, theReckoning, nexusArrivalCinematic, endingLine, LOST_CAPITAL_LOCATIONS,
} from '../app/engine/mainQuest';
import { REGARD_ORDER, regardOf } from '../app/engine/arbiterPersona';
import { STORY_MOTIVE_IDS } from '../app/engine/story';
import chaptersData from '../app/data/story/chapters.json';

jest.setTimeout(600000);

const store = useGameStore;
const BASE_ENDINGS = ['seal', 'unleash', 'preserve'] as const;

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

/** ⚠⚠ A player shaped to land in a chosen regard band — and WHAT KIN COSTS is
 *  the interesting half. Every contribution to regard is clamped and the total
 *  is clamped again, so the ceilings are: debts made good +12, gifts +6, someone
 *  vouches for you +6, lore read +8, relics left standing +8, the pressure you
 *  asked for +5. That totals 45 against a kin bar of 40 — meaning a player
 *  CANNOT reach the fourth door on any two or three of those. It takes nearly
 *  the whole spread: made amends with people, gave things away, earned somebody's
 *  word, read the dead, left relics where they stood, and asked the mud for no
 *  mercy. That is the bar the owner picked, and it is a demanding one by
 *  construction rather than by a tuned number. Fork answers can add or subtract
 *  on top; the run below deliberately uses none, so the floor is proven without
 *  them. */
function kinWorldMemory() {
  const wm = store.getState().worldMemory;
  return {
    ...wm,
    npcRelations: {
      a: { wrongs: 0, amendsCleared: 3, gifts: [{ item: 'x' }, { item: 'y' }, { item: 'z' }] },
      b: { wrongs: 0, amendsCleared: 2, gifts: [{ item: 'x' }, { item: 'y' }, { item: 'z' }] },
    },
  } as typeof wm;
}

function playerAtRegard(band: 'cold' | 'kin') {
  const p = store.getState().player!;
  if (band === 'kin') {
    return {
      ...p,
      corruption: 0,
      menace: 0,
      factionStanding: (getFactions()).map((f) => ({ factionId: f.id, standing: 60 })),
      storyChoices: {},
      pressure: 'bury_me',
      titleProgress: { ...(p.titleProgress ?? {}), loreRead: 30, relicsPreserved: 12, relicsTraded: 0 },
    } as typeof p;
  }
  return {
    ...p,
    corruption: 90,
    menace: 60,
    factionStanding: (getFactions()).map((f) => ({ factionId: f.id, standing: -60 })),
    pressure: 'salvage',
    titleProgress: { ...(p.titleProgress ?? {}), loreRead: 0, relicsPreserved: 0, relicsTraded: 40 },
  } as typeof p;
}

describe('OTA-1225 — the fourth door is EARNED, and the three are never taken', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Warden', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠ THE INVARIANT: the three base endings are unconditional — no state can withhold one', () => {
    // Read the store's own guard: only 'stay' may ever be refused. If a future
    // change adds a condition to seal/unleash/preserve, this is the tripwire.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8') as string;
    const guard = src.slice(src.indexOf('chooseEndingMainQuest(ending'), src.indexOf('chooseEndingMainQuest(ending') + 1400);
    expect(guard).toContain("if (ending === 'stay')");
    for (const e of BASE_ENDINGS) {
      expect(guard).not.toContain(`if (ending === '${e}')`);
    }
  });

  it('⚠⚠ the gate opens ONLY at kin, and a bad run is never locked out of the game', () => {
    const wm = kinWorldMemory();
    const kin = playerAtRegard('kin');
    const cold = playerAtRegard('cold');
    expect(regardOf(kin as never, wm as never)).toBe('kin');
    expect(canStayAtTheNexus(kin as never, wm)).toBe(true);
    expect(canStayAtTheNexus(cold as never, wm)).toBe(false);
    // ⚠ The bar is the TOP band and nothing below it opens the door...
    expect(REGARD_ORDER[REGARD_ORDER.length - 1]).toBe('kin');
    // ...but the character who cannot open it still finishes the game: all
    // three base endings render full prose for them.
    for (const e of BASE_ENDINGS) {
      expect(endingLine(e, cold.factionId).length).toBeGreaterThan(60);
    }
    // A missing player, or a regard read that throws, must never hand it out.
    expect(canStayAtTheNexus(null, wm)).toBe(false);
    expect(canStayAtTheNexus(kin as never, undefined)).toBe(false);
  });

  it('⚠⚠ a run that has NOT earned it is never told the door exists', () => {
    const three = nexusArrivalCinematic(false).join('\n');
    expect(three).toContain('Three actions remain');
    expect(three).not.toMatch(/\bSTAY\b/);
    const four = nexusArrivalCinematic(true).join('\n');
    expect(four).toContain('Four actions remain');
    expect(four).toMatch(/\bSTAY\b/);
    // Both prompts still name all three base doors — the fourth is additive.
    for (const word of ['SEAL', 'UNLEASH', 'PRESERVE']) {
      expect(three).toContain(word);
      expect(four).toContain(word);
    }
  });

  it('⚠⚠ STAY is fully authored: nine faction futures and five motive epilogues', () => {
    for (const f of getFactions()) {
      const line = endingLine('stay', f.id);
      expect({ faction: f.id, len: line.length > 120 }).toEqual({ faction: f.id, len: true });
      // Each faction's future must be its OWN, not the shared fallback.
      expect(line).not.toBe(endingLine('stay', 'no_such_faction'));
    }
    const ep = (chaptersData as { epilogue: Record<string, { motives: Record<string, string> }> }).epilogue;
    expect(Object.keys(ep)).toEqual(expect.arrayContaining(['seal', 'unleash', 'preserve', 'stay']));
    for (const m of STORY_MOTIVE_IDS) {
      expect({ motive: m, len: (ep.stay!.motives[m] ?? '').length > 120 }).toEqual({ motive: m, len: true });
    }
  });

  it('⚠ the STAY epilogues do not claim the character walked out — the door means they did not', () => {
    const ep = (chaptersData as { epilogue: Record<string, { motives: Record<string, string> }> }).epilogue;
    for (const m of STORY_MOTIVE_IDS) {
      const text = ep.stay!.motives[m]!;
      // The other three endings' epilogues talk about carrying things up the
      // Stair. This one cannot — the whole cost of the door is not going up.
      expect({ motive: m, walksOut: /up the Stair|carried it up|went up|climbed out/i.test(text) })
        .toEqual({ motive: m, walksOut: false });
    }
  });

  it('⚠⚠ THE RECKONING reads the run back, gates nothing, and never crashes an ending', () => {
    const wm = kinWorldMemory();
    const kin = playerAtRegard('kin');
    const cold = playerAtRegard('cold');
    for (const p of [kin, cold]) {
      const lines = theReckoning(p as never, wm);
      expect(lines.length).toBeGreaterThan(2);
      // ⚠ THE REAL INVARIANT: the Reckoning reads the RUN back, never the DOORS
      // forward. It must not name, recommend, rank or withhold any ending — the
      // moment it editorialises about a door it stops being a mirror and starts
      // being the nagging the owner specifically did not want.
      const joined = lines.join('\n');
      for (const door of ['SEAL', 'UNLEASH', 'PRESERVE', 'STAY']) {
        expect({ door, named: joined.includes(door) }).toEqual({ door, named: false });
      }
      expect(joined).not.toMatch(/you (must|cannot|may not|should) (choose|pick|take)/i);
    }
    // The kin run gets the Arbiter's own admission; the cold run does not.
    expect(theReckoning(kin as never, wm).join('\n')).toMatch(/the first I would have followed/);
    expect(theReckoning(cold as never, wm).join('\n')).not.toMatch(/the first I would have followed/);
    // Defensive: no player, and a junk worldMemory, both return safely.
    expect(theReckoning(null, wm)).toEqual([]);
    expect(theReckoning(kin as never, undefined).length).toBeGreaterThan(0);
  });

  it('⚠⚠ LIVE: an unearned STAY is refused by the ENGINE, not just hidden by the screen', async () => {
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...playerAtRegard('cold'),
        mainQuest: { phase: 'choice', coresRecovered: [...LOST_CAPITAL_LOCATIONS] as string[] },
      } as typeof p,
    });
    // Reaching the action directly — a stale screen, a replayed tap, anything.
    store.getState().chooseEndingMainQuest('stay');
    await new Promise((r) => setTimeout(r, 200));
    expect(store.getState().player!.mainQuest!.phase).toBe('choice');
    expect(store.getState().player!.mainQuest!.ending).toBeUndefined();
    expect(store.getState().gameLog.map((e) => e.text).join('\n')).toMatch(/the three that are yours are still yours/);
    // And the same character can still finish the game, right now.
    store.getState().chooseEndingMainQuest('preserve');
    await settle(() => store.getState().player!.mainQuest!.phase === 'ended');
    expect(store.getState().player!.mainQuest!.ending).toBe('preserve');
  });

  it('⚠⚠ LIVE: an earned STAY is recorded as a real ending', async () => {
    const p = store.getState().player!;
    useGameStore.setState({
      player: {
        ...playerAtRegard('kin'),
        mainQuest: { phase: 'choice', coresRecovered: [...LOST_CAPITAL_LOCATIONS] as string[] },
      } as typeof p,
      worldMemory: kinWorldMemory(),
    });
    expect(canStayAtTheNexus(store.getState().player, store.getState().worldMemory)).toBe(true);
    store.getState().chooseEndingMainQuest('stay');
    await settle(() => store.getState().player!.mainQuest!.phase === 'ended');
    expect(store.getState().player!.mainQuest!.ending).toBe('stay');
    // The ending screen has something to show for it.
    expect(endingLine('stay', store.getState().player!.factionId).length).toBeGreaterThan(120);
  });
});
