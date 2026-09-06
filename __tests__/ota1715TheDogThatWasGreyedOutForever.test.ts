/**
 * OTA-1715 — THE DOG THAT WAS GREYED OUT FOREVER.
 *
 * Reported by the owner, mid-playtest, in one sentence: *"I haven't seemed to be
 * able to use my dog when I had one for like the last 25 battles. it was always
 * just grayed out even though I had healed it."*
 *
 * ⚠⚠⚠ THE CAUSE, and it is a two-line story. A dog knocked to 0 HP is benched —
 * `combatResolution` writes `status: 'waiting_at_base'` and stamps `downedAtHour`
 * in the same breath. Healing it restores HP and, on the next tick, clears the
 * bleed-out stamps. NOTHING RESTORES `status`. `handleDogCombat` refuses every
 * command from a `waiting_at_base` dog at ANY hp, so from that moment the dog is
 * alive, at full health, walking beside you — and permanently unusable. There is
 * exactly one path back in the whole codebase, `rejoinDogOnDescent`, and it fires
 * only when you climb DOWN off a ledge. A player who was never up one never gets
 * their dog back. Ever.
 *
 * ⚠⚠ AND THE SECOND HALF IS WHY IT LOOKED LIKE NOTHING AT ALL. The refusal for a
 * benched-but-healthy dog was the climb joke, latched behind
 * `worldMemory.dogClimbNoticeShown` — once per install unless a descent resets
 * it. So the FIRST tap printed a line about climbing, on flat ground, which reads
 * as noise; every tap after that was a completely silent no-op. Twenty-five
 * battles of tapping a greyed chip that says nothing back.
 *
 * ⚠ THE FIX IS AN INVARIANT, NOT A HEAL HOOK, and that distinction is the whole
 * value of this OTA. Hooking the restore onto the heal would fix future
 * knockdowns and leave every save already in the broken state broken — the
 * stamps are long gone on those, so a stamp-keyed repair never runs. `a healthy
 * dog is never benched on flat ground` is true independent of how the save got
 * there, so the owner's live save repairs itself on his next action.
 *
 * Introduced by OTA-670 (`bd808c94`, "dog takes combat damage again"), which
 * added the bench-on-knockdown without a way off the bench.
 */
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

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore, tickDogStatus } from '../app/state/gameStore';
import type { GameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import { createDogCompanion } from '../app/engine/dogCompanion';
import type { DogCompanion } from '../app/engine/types';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

// ── the cheap harness, borrowed from dogBleedOutAndAbandon ───────────────
function makeDog(over: Partial<DogCompanion> = {}): DogCompanion {
  return {
    id: 'dog1', name: 'Cinder', breed: 'mutt',
    sex: { raw: 'male', pronoun: 'he' },
    startingProfile: 'mongrel',
    hp: 16, hpMax: 16,
    stats: { strength: 10, dexterity: 10, intelligence: 10 },
    statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
    loyalty: 80, lastFedAtHour: 0,
    equipped: { vest: null },
    status: 'with_player',
    ...over,
  };
}

function harness(dog: DogCompanion, hoursElapsed = 10, scene: unknown = null) {
  const logs: { ch: string; msg: string }[] = [];
  let state: any = {
    player: { hoursElapsed, dog },
    currentScene: scene,
    worldMemory: { puppyVendorOwed: false, puppyVendorUsed: false, puppyVendorQueued: false },
    appendLog: (ch: string, msg: string) => logs.push({ ch, msg }),
    persist: () => Promise.resolve(),
  };
  const get = () => state as GameStore;
  const set = (fn: (s: GameStore) => Partial<GameStore>) => { state = { ...state, ...fn(state) }; };
  return { get, set, dog: () => get().player!.dog as DogCompanion, text: () => logs.map((l) => l.msg).join('\n') };
}

describe('OTA-1715 — ⚠⚠⚠ a healthy dog is never left benched on flat ground', () => {
  it('THE OWNER\'S SAVE: benched, healed, stamps long gone — one tick puts it back at his side', () => {
    // This is the state twenty-five battles of tapping produced. `downedAtHour`
    // was cleared by the very first tick after the heal, so there is nothing
    // left in the save that says "this dog was knocked down" — which is exactly
    // why a repair keyed on the stamps would never have reached him.
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 16 }));
    expect(h.dog().downedAtHour).toBeUndefined();
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('with_player');
    expect(h.text()).toContain('falls back in beside you');
  });

  it('the fresh case: knocked down, then healed above 0', () => {
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 16, downedAtHour: 4, bleedWarned: true, bleedWarnStage: 2 }));
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('with_player');
    // …and the bleed-out clock still resets, so a LATER knockdown gets a fresh
    // 24h window and its warning beats from the top.
    expect(h.dog().downedAtHour).toBeUndefined();
    expect(h.dog().bleedWarned).toBe(false);
    expect(h.dog().bleedWarnStage).toBe(0);
  });

  it('⚠⚠ IT CANNOT HAUL A DOG UP A CLIFF — the climb bench is left alone', () => {
    // `waiting_at_base` means two different things, and the UI already tells
    // them apart by the scene's `elevatedOn` rather than by anything on the dog
    // (ExplorationScreen: `currentScene?.elevatedOn ? 'elevated' : 'downed'`).
    // This uses the same discriminator, so a dog left at the base of a climb
    // stays there and `rejoinDogOnDescent` keeps its job.
    const elevated = { elevatedOn: { noun: 'scaffold', tier: 1, totalTiers: 2 }, enemies: [] };
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 16, downedAtHour: 4 }), 10, elevated);
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('waiting_at_base');
    expect(h.text()).not.toContain('falls back in beside you');
  });

  it('a dog still DOWN at 0 hp is not swept up by the invariant', () => {
    // hp > 0 is load-bearing: the bleed-out ladder owns a dog at 0, and pulling
    // it off the bench would cancel the 24h window the owner asked for.
    const h = harness(makeDog({ status: 'waiting_at_base', hp: 0, downedAtHour: 8 }));
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('waiting_at_base');
  });

  it('a dog already at your side is untouched, and its stamps still clear', () => {
    const h = harness(makeDog({ status: 'with_player', hp: 16, downedAtHour: 4 }));
    tickDogStatus(h.get, h.set);
    expect(h.dog().status).toBe('with_player');
    expect(h.dog().downedAtHour).toBeUndefined();
    expect(h.text()).not.toContain('falls back in beside you');
  });
});

describe('OTA-1715 — ⚠⚠ the refusal always says something', () => {
  it('the climb notice picks the WORDING now, not whether to speak', () => {
    // The latch was the silent half of the report: `dogClimbNoticeShown` is
    // persisted and only ever reset by a descent, so the second tap onward
    // printed nothing at all. It still exists — a descent resets it and the
    // long line is worth reading once per climb — but it can no longer buy
    // silence.
    const g = src('app', 'state', 'gameStore.ts');
    expect(g.includes('const firstClimb = !get().worldMemory.dogClimbNoticeShown;')).toBe(true);
    expect(g.includes('if (firstClimb) set((s) => ({ worldMemory:')).toBe(true);
    // The short form exists and is the else branch of one appendLog, not a
    // second guarded call that could be skipped the same way.
    expect(g.includes('The Arbiter nods down the slope.')).toBe(true);
    const from = g.indexOf('const firstClimb =');
    const gate = g.slice(from, g.indexOf('if (firstClimb) set(', from));
    expect(gate.split('appendLog').length - 1).toBe(1);
    // …and that one call is unconditional: nothing between the latch read and
    // the log stands between the player and an answer.
    expect(gate.includes('if (')).toBe(false);
  });
});

describe('OTA-1715 — the live sequence, end to end', () => {
  jest.setTimeout(120000);
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  async function boot() {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Verbal', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    const p = store.getState().player!;
    const dog = createDogCompanion({ name: 'Cinder', breed: 'mutt', rawSex: 'male', startingProfile: 'mongrel', currentHour: p.hoursElapsed ?? 0 });
    store.setState({ player: { ...p, dog } as typeof p });
    return store;
  }

  function plant() {
    const proto = findEnemyByName('Silt Serpent') ?? findEnemyByName('Mud Spider');
    const enemy = JSON.parse(JSON.stringify(proto));
    const scene = useGameStore.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene, enemies: [enemy], enemyHps: [enemy.hp], activeEnemyIdx: 0,
        range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], elevatedOn: null,
      },
    });
  }

  /** Exactly what combatResolution writes when a hit drops the dog to 0. */
  function knockTheDogDown() {
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: { ...p, dog: { ...p.dog!, hp: 0, status: 'waiting_at_base' as const, downedAtHour: p.hoursElapsed ?? 0, bleedWarned: false } } as typeof p,
    });
  }

  /** What a poultice or a meal leaves behind: HP, and nothing else. */
  function healTheDog() {
    const p = useGameStore.getState().player!;
    useGameStore.setState({ player: { ...p, dog: { ...p.dog!, hp: p.dog!.hpMax } } as typeof p });
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('⚠⚠⚠ knocked down → healed → SIC, and the dog actually bites', async () => {
    const store = await boot();
    plant();
    knockTheDogDown();
    expect(store.getState().player!.dog!.status).toBe('waiting_at_base');

    healTheDog();
    // One ordinary action is all it takes — tickDogStatus runs as a microtask
    // after every non-silent submission.
    await store.getState().submitPlayerAction('look');
    await flush();
    expect(store.getState().player!.dog!.status).toBe('with_player');

    plant();
    const before = store.getState().currentScene!.enemyHps![0]!;
    const logLen = store.getState().gameLog.length;
    await store.getState().submitPlayerAction('sic the enemy');
    await flush();
    const said = store.getState().gameLog.slice(logLen).map((e) => e.text).join('\n');
    // The dog either lands a bite or misses — both are the dog ACTING. What it
    // must never do again is come back with the climb joke or with silence.
    expect(said.length).toBeGreaterThan(0);
    expect(said).not.toContain('has learned to climb');
    expect(store.getState().currentScene!.enemyHps![0]!).toBeLessThanOrEqual(before);
  });

  it('⚠⚠ and while it IS benched, every tap gets an answer — not just the first', async () => {
    const store = await boot();
    plant();
    // Up a climb with the dog left below: the one case where the bench is right.
    const p = store.getState().player!;
    useGameStore.setState({
      player: { ...p, dog: { ...p.dog!, status: 'waiting_at_base' as const } } as typeof p,
      currentScene: { ...store.getState().currentScene!, elevatedOn: { noun: 'scaffold', tier: 1, totalTiers: 2 } },
    });

    const saidBy = async (): Promise<string> => {
      const n = store.getState().gameLog.length;
      await store.getState().submitPlayerAction('sic the enemy');
      await flush();
      return store.getState().gameLog.slice(n).map((e) => e.text).join('\n');
    };

    const first = await saidBy();
    expect(first).toContain('has learned to climb');
    // ⚠ THIS is the assertion the report was made of. Before OTA-1715 the
    // second tap returned an empty string.
    const second = await saidBy();
    expect(second.trim().length).toBeGreaterThan(0);
    expect(second).toContain('holding the ground below');
    // Still benched — the elevated case is the one the bench is FOR.
    expect(store.getState().player!.dog!.status).toBe('waiting_at_base');
  });
});

describe('OTA-1715 — ⚠ the fifth "they" line, in the beat that matters most', () => {
  it('the first bleed-out warning no longer says "before they is gone for good"', () => {
    // OTA-1714 fixed four pronoun templates and shipped two instruments; this
    // one slipped both, because its singular-verb scanner skips `is` (that shape
    // has its own {isOrAre} token and the scanner was measuring bare verbs). It
    // sits in the FIRST beat of the bleed-out ladder — the line a player reads
    // while deciding whether their dog lives.
    const g = src('app', 'state', 'gameStore.ts');
    expect(g.includes('h before {pronoun} {isOrAre} gone for good.')).toBe(true);
    expect(g.includes('h before {pronoun} is gone for good.')).toBe(false);
  });

  it('⚠ THE INSTRUMENT — no pronoun token is followed by a bare singular auxiliary', () => {
    // The class OTA-1714's scanner could not see, closed here. `{pronoun} is`,
    // `{pronoun} has`, `{pronoun} was`, `{pronoun} does` all read as "they is".
    const files = [
      ['app', 'state', 'gameStore.ts'],
      ['app', 'engine', 'dogCompanion.ts'],
      ['app', 'state', 'stageArrival.ts'],
      ['app', 'state', 'combatResolution.ts'],
    ];
    const bad: string[] = [];
    let scanned = 0;
    for (const f of files) {
      for (const m of src(...f).matchAll(/`([^`]*\{[Pp]ronoun\}[^`]*)`/g)) {
        scanned++;
        for (const hit of m[1]!.matchAll(/\{[Pp]ronoun\}\s+(is|was|has|does|isn't|doesn't|hasn't)\b/g)) {
          bad.push(`${f[f.length - 1]}: "${hit[1]}" in — ${m[1]!.slice(0, 80)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    // A scanner pointed at nothing passes forever.
    expect(scanned).toBeGreaterThanOrEqual(20);
  });
});

describe('OTA-1715 — the gameStore stays under its ceiling', () => {
  it('net zero: three comment lines bought by collapsing the climb branch', () => {
    expect(src('app', 'state', 'gameStore.ts').split('\n').length).toBeLessThan(37000);
  });
});
