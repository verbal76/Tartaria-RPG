/**
 * OTA-1739 — NOTHING HEAVY RUNS INSIDE A TAP (task list LAG-1-7C42).
 *
 * Fable's 91C4B8 audit measured the infrastructure around a player action, not
 * the RPG logic inside it: game logic is 5-48ms, while one action could open an
 * optional 6-11s Qwen generation, re-render a 3,500-line screen once per streamed
 * token nobody sees, read-modify-write a 400KB log file per line, and serialize
 * the whole save more than once for the same turn. Four repairs, no gameplay,
 * narration content, save-safety or deliberate-pacing change:
 *
 *   1. ambient generation is ARMED by an action and STARTED by the existing idle
 *      tick, so it never begins inside a settling action;
 *   2. ExplorationScreen reads a BOOLEAN, not the token stream;
 *   3. ordinary disk-log lines batch for one beat (crash breadcrumbs do not);
 *   4. persist requests made in ONE synchronous turn become ONE save.
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
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import React, { Profiler } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorageMod from '@react-native-async-storage/async-storage';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { ExplorationScreen } from '../app/screens/ExplorationScreen';
import {
  appendLogToDisk, flushLogWrites, readFullLog, stampLiveBreadcrumb, DISK_LOG_BATCH_MS,
} from '../app/engine/saveSystem';
import {
  armAmbientArbiter, ambientArmPending, ambientArbiterTickIfArmed, _resetAmbientArmForTest,
} from '../app/ai/narration';
import type { Enemy, InventoryItem, PlayerCharacter } from '../app/engine/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void };
};
const AS = ((AsyncStorageMod as unknown as { default?: unknown }).default ?? AsyncStorageMod) as {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
};

jest.setTimeout(240_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const ROOT = join(__dirname, '..');
const src = (...p: string[]): string => readFileSync(join(ROOT, ...p), 'utf8');
const codeOnly = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const S = () => useGameStore.getState();
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const flush = async () => { await renderer.act(async () => { await tick(0); }); };

// ── storage instrumentation ──────────────────────────────────────────────────
let liveSlotWrites = 0; let logReads = 0; let logWrites = 0; let crumbWrites = 0;
const origSet = AS.setItem.bind(AS); const origGet = AS.getItem.bind(AS);
AS.setItem = async (k: string, v: string) => {
  // A phone's storage is not free; without a little latency every write lands in
  // the same turn and the harness measures a machine no player owns.
  await tick(2);
  if (k.startsWith('tartaria.slot.') && !k.endsWith('.bak') && !k.includes('.tmp.')) liveSlotWrites += 1;
  if (k.startsWith('tartaria.gamelog.')) logWrites += 1;
  if (k.includes('lastBreadcrumb')) crumbWrites += 1;
  return origSet(k, v);
};
AS.getItem = async (k: string) => {
  await tick(1);
  if (k.startsWith('tartaria.gamelog.')) logReads += 1;
  return origGet(k);
};
const resetCounters = () => { liveSlotWrites = 0; logReads = 0; logWrites = 0; crumbWrites = 0; };

async function boot(): Promise<void> {
  await S().hydrate();
  await S().startNewGame({ name: 'Hot', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  S().skipTutorial?.();
  if (S().storyIntro) S().dismissStoryIntro();
  await tick(0);
  S().submitPlayerAction('leave outpost');
  await tick(600); // let the opening settle so no save is already in flight
}
const foe = (): Enemy => ({
  name: 'Raider', type: 'Human', abilityPoint: 'Strength 6', attack: 'Cudgel',
  damage: '10', hp: 400, rarity: 'Common', loot: [],
});
function stageFight() {
  const sc = S().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...sc, enemies: [foe()], enemyHps: [400], activeEnemyIdx: 0, range: 'close',
      enemyAmbushUsed: [true], enemyKnockedOut: [false], enemyStaggered: [0], stealthOpenerUsed: true,
    },
  } as never);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1739 (1) — ambient generation is armed by an action, started by the quiet', () => {
  beforeEach(() => { _resetAmbientArmForTest(); });

  it('⚠⚠⚠ THE FREE HALF STILL RUNS ON THE ACTION; THE EXPENSIVE HALF DOES NOT', () => {
    // The call site is deliberately unchanged: everything above the admission
    // guard costs nothing and includes spending a BANKED musing, which is how the
    // Arbiter speaks while Qwen reloads. Moving the whole call to the idle tick
    // would have taken that away, since the tick returns early when Qwen is not
    // ready. What moved is generation, and only generation.
    const store = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(store).toContain('if (chance(35)) void maybeGenerateAmbientArbiter(get, set);');
    const narration = codeOnly(src('app', 'ai', 'narration.ts'));
    // the bank spend sits ABOVE the guard, the generation below it
    const bank = narration.indexOf('const banked = takeBankedMusing(get);');
    const guard = narration.indexOf('if (playerActionIsSettling(get)) {');
    expect(bank).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(bank);
  });

  it('⚠⚠⚠ AND THE TICK REFUSES WHILE THE ACTION IS STILL SETTLING', async () => {
    await boot();
    armAmbientArbiter('speak');
    expect(ambientArmPending()).toBe('speak');
    // an action landed just now
    useGameStore.setState({ lastPlayerActionAt: Date.now(), pendingRolls: null } as never);
    expect(ambientArbiterTickIfArmed(useGameStore.getState, useGameStore.setState as never)).toBe(false);
    expect(ambientArmPending()).toBe('speak'); // still waiting, not thrown away
    // a roll is open: still not a quiet moment, however old the action is
    useGameStore.setState({
      lastPlayerActionAt: Date.now() - 60_000,
      pendingRolls: { steps: [], currentStep: 0 },
    } as never);
    expect(ambientArbiterTickIfArmed(useGameStore.getState, useGameStore.setState as never)).toBe(false);
    expect(ambientArmPending()).toBe('speak');
  });

  it('⚠⚠ AND FIRES AT THE FIRST QUIET TICK, CONSUMING THE ARM ONCE', async () => {
    await boot();
    armAmbientArbiter('speak');
    useGameStore.setState({ lastPlayerActionAt: Date.now() - 60_000, pendingRolls: null } as never);
    expect(ambientArbiterTickIfArmed(useGameStore.getState, useGameStore.setState as never)).toBe(true);
    expect(ambientArmPending()).toBeNull();
    // and a spent arm does not re-fire on the next tick
    expect(ambientArbiterTickIfArmed(useGameStore.getState, useGameStore.setState as never)).toBe(false);
  });

  it('⚠ a spoken musing outranks a bank fill, and the arm never accumulates', () => {
    armAmbientArbiter('bank');
    expect(ambientArmPending()).toBe('bank');
    armAmbientArbiter('speak');
    expect(ambientArmPending()).toBe('speak');
    armAmbientArbiter('bank'); // must not demote the player-facing request
    expect(ambientArmPending()).toBe('speak');
  });

  it('⚠⚠ the existing 5s homework tick is the starter — no new timer, no polling', () => {
    const bootSlice = codeOnly(src('app', 'state', 'slices', 'bootSlice.ts'));
    expect(bootSlice).toContain('if (deps.ambientArbiterTickIfArmed(get, set)) return;');
    // it reads the idle authority that already exists, not a new one
    const narration = codeOnly(src('app', 'ai', 'narration.ts'));
    expect(narration).toContain('const last = get().lastPlayerActionAt;');
    expect(narration).not.toContain('setInterval(');
  });

  it('⚠⚠⚠ the guard sits ABOVE the model-readiness gate, so no caller can slip past it', () => {
    // Placement is the claim: a guard below `qwen.isReady()` would let a ready
    // model start generating inside the action, which is the whole defect.
    const narration = codeOnly(src('app', 'ai', 'narration.ts'));
    const guard = narration.indexOf('if (playerActionIsSettling(get)) {\n    armAmbientArbiter(');
    const ready = narration.indexOf('if (!qwen.isReady() || get().isGenerating) return;\n  if (Date.now() - lastAmbientGenStartMs');
    expect(guard).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(ready);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1739 (2) — invisible tokens do not re-render the exploration screen', () => {
  it('⚠⚠⚠ 34 STREAMED TOKENS COMMIT THE SCREEN ZERO TIMES', async () => {
    await boot();
    useGameStore.setState({ currentScreen: 'exploration' } as never);
    let commits = 0;
    const onRender = () => { commits += 1; };
    let tree!: { toJSON(): unknown; unmount(): void };
    await renderer.act(async () => {
      tree = renderer.create(<Profiler id="explore" onRender={onRender}><ExplorationScreen /></Profiler>);
    });
    await flush();
    // generation opens: the sign appears, so exactly one commit is expected
    commits = 0;
    await renderer.act(async () => {
      useGameStore.setState({ isGenerating: true, partialArbiterText: '' } as never);
    });
    const openCommits = commits;
    expect(openCommits).toBeLessThanOrEqual(1);
    // …then 34 tokens arrive, each in its own task, exactly as on the device
    commits = 0;
    for (let i = 0; i < 34; i++) {
      await renderer.act(async () => {
        useGameStore.setState({ partialArbiterText: 'y'.repeat(i + 1) } as never);
      });
    }
    expect(commits).toBe(0);
    await renderer.act(async () => { tree.unmount(); });
  });

  it('⚠⚠ and the sign still tells reactive generation apart from a bank-only fill', async () => {
    await boot();
    useGameStore.setState({ currentScreen: 'exploration' } as never);
    let tree!: { toJSON(): unknown; unmount(): void };
    await renderer.act(async () => { tree = renderer.create(<ExplorationScreen />); });
    await flush();
    const showsSign = () => JSON.stringify(tree.toJSON()).includes('choosing their words');
    // reactive line: narration sets partialArbiterText to '' alongside isGenerating
    await renderer.act(async () => {
      useGameStore.setState({ isGenerating: true, partialArbiterText: '' } as never);
    });
    expect(showsSign()).toBe(true);
    // bank-only fill: isGenerating true, partialArbiterText left null → no sign
    await renderer.act(async () => {
      useGameStore.setState({ isGenerating: true, partialArbiterText: null } as never);
    });
    expect(showsSign()).toBe(false);
    await renderer.act(async () => {
      useGameStore.setState({ isGenerating: false, partialArbiterText: null } as never);
    });
    expect(showsSign()).toBe(false);
    await renderer.act(async () => { tree.unmount(); });
  });

  it('⚠ the screen no longer subscribes to the token stream itself', () => {
    const screen = codeOnly(src('app', 'screens', 'ExplorationScreen.tsx'));
    expect(screen).not.toContain('const partialArbiterText = useGameStore((s) => s.partialArbiterText);');
    expect(screen).toContain('const arbiterComposing = useGameStore((s) => s.isGenerating && typeof s.partialArbiterText === \'string\');');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1739 (3) — the ordinary disk log batches; the crash evidence does not', () => {
  it('⚠⚠⚠ TWELVE LINES ACROSS TWELVE TURNS COST A HANDFUL OF WRITES, NOT TWELVE', async () => {
    await boot();
    await AS.setItem(`tartaria.gamelog.${S().activeSlotId}.v2`, `${'x'.repeat(300)}\n`.repeat(1200));
    await flushLogWrites();
    resetCounters();
    for (let i = 0; i < 12; i++) {
      void appendLogToDisk(`[debug] beat ${i}`);
      await tick(30); // each line in its own turn, as a combat round emits them
    }
    await flushLogWrites();
    // 12 turns × 30ms = 360ms of lines through a 100ms window → about four cycles.
    expect(logWrites).toBeLessThanOrEqual(5);
    expect(logWrites).toBeGreaterThan(0);
    expect(logReads).toBe(logWrites); // still one read per write, never more
  });

  it('⚠⚠ ordering survives the window, and a reader never sees a stale snapshot', async () => {
    await boot();
    await flushLogWrites();
    for (let i = 0; i < 6; i++) void appendLogToDisk(`[debug] ordered ${i}`);
    const full = await readFullLog(); // must flush the window itself
    const at = [0, 1, 2, 3, 4, 5].map((i) => full.indexOf(`ordered ${i}`));
    expect(at.every((x) => x > -1)).toBe(true);
    expect(at.slice().sort((a, b) => a - b)).toEqual(at);
  });

  it('⚠⚠⚠ THE CRASH BREADCRUMB IS NOT BATCHED — the OTA/death investigation still reads it', async () => {
    await boot();
    resetCounters();
    stampLiveBreadcrumb({ at: Date.now(), what: 'probe', screen: 'exploration' });
    await tick(20); // far inside the log's batch window
    expect(crumbWrites).toBeGreaterThan(0);
    const save = codeOnly(src('app', 'engine', 'saveSystem.ts'));
    // the crumb writes on its own, straight to its own key
    expect(save).toContain('void AsyncStorage.setItem(LAST_BREADCRUMB_KEY, JSON.stringify(_lastLiveCrumb))');
    // and the tap ledger still logs before any handler work (OTA-1172/1276)
    const store = codeOnly(src('app', 'state', 'gameStore.ts'));
    expect(store).toContain('export function logUiTap(label: string): void {');
  });

  it('⚠ every deliberate exit flushes the window', () => {
    const save = codeOnly(src('app', 'engine', 'saveSystem.ts'));
    expect(save).toContain('export function flushDiskLogNow(): Promise<void> {');
    expect(save).toContain('await flushDiskLogNow(); // LAG-1 — buffered lines land before the caller reads');
    expect(DISK_LOG_BATCH_MS).toBeLessThanOrEqual(100);
    // backgrounding and the OTA reload both flush
    expect(codeOnly(src('App.tsx'))).toContain('void flushLogWrites();');
    expect(codeOnly(src('app', 'updates', 'checkAndApplyOTA.ts'))).toContain('await save.flushLogWrites();');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1739 (4) — one settled turn, one save', () => {
  it('⚠⚠⚠ FOUR REQUESTS IN ONE TURN ARE ONE SAVE', async () => {
    await boot();
    resetCounters();
    const p = [S().persist(), S().persist(), S().persist(), S().persist()];
    await Promise.all(p);
    await tick(120);
    expect(liveSlotWrites).toBe(1);
  });

  it('⚠⚠ requests in DIFFERENT turns stay different saves — the boundary is not debounced away', async () => {
    await boot();
    resetCounters();
    await S().persist();
    await tick(60);
    await S().persist();
    await tick(120);
    expect(liveSlotWrites).toBe(2);
  });

  it('⚠⚠⚠ AN AWAITED persist() STILL MEANS THE STATE IS ON DISK', async () => {
    await boot();
    const marker = 987_654;
    useGameStore.setState({ player: { ...S().player!, tc: marker } as PlayerCharacter } as never);
    await S().persist();
    const raw = await AS.getItem(`tartaria.slot.${S().activeSlotId}.v2`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).player.tc).toBe(marker);
  });

  it('⚠⚠ the save that lands is the END of the turn, never a stale mid-turn snapshot', async () => {
    await boot();
    // request first, mutate after — inside the same synchronous turn
    void S().persist();
    useGameStore.setState({ player: { ...S().player!, tc: 4242 } as PlayerCharacter } as never);
    await tick(150);
    const raw = await AS.getItem(`tartaria.slot.${S().activeSlotId}.v2`);
    expect(JSON.parse(raw!).player.tc).toBe(4242);
  });

  it('⚠⚠⚠ ADVERSARIAL: damage, a spent item and lost coin all survive a background+reload', async () => {
    await boot();
    stageFight();
    const p0 = S().player!;
    useGameStore.setState({
      player: {
        ...p0, hp: 40, hpMax: 40, tc: 500,
        inventory: [...p0.inventory, {
          id: 'kit_adv', name: 'First Aid Kit', kind: 'consumable', rarity: 'Common',
          quantity: 2, tags: ['consumable', 'medical', 'healing'],
        } as InventoryItem],
      } as PlayerCharacter,
    } as never);
    // a real mutation through a real action: the kit is spent, HP moves
    useGameStore.setState({ player: { ...S().player!, hp: 9 } as PlayerCharacter } as never);
    S().useHealBatch('First Aid Kit', 'self', 1);
    await tick(0);
    const kitsAfter = S().player!.inventory.find((i) => i.id === 'kit_adv')?.quantity ?? 0;
    const hpAfter = S().player!.hp;
    expect(kitsAfter).toBe(1);
    // the app is backgrounded at this ordinary action boundary
    await S().persist();
    await S().loadSlotIntoGame(S().activeSlotId!);
    await tick(0);
    const reloaded = S().player!;
    expect(reloaded.inventory.find((i) => i.id === 'kit_adv')?.quantity ?? 0).toBe(1); // no resurrection of the spent kit
    expect(reloaded.hp).toBe(hpAfter);                                                  // no undone healing
    expect(reloaded.tc).toBe(500);
  });

  it('⚠⚠ the transactional write itself is untouched — stage, read back, back up, go live', () => {
    const save = codeOnly(src('app', 'engine', 'saveSystem.ts'));
    expect(save).toContain('const tmpKey = `${slotSaveKey(slotId)}.tmp.${(saveTmpCounter++) & 7}`;');
    expect(save).toContain('if (staged === payload) { stageReason = \'\'; return true; }');
    expect(save).toContain('await AsyncStorage.setItem(bakKey, currentLive);');
    expect(save).toContain('await AsyncStorage.setItem(liveKey, payload);');
    // and the coalescer is a microtask, not a timer: no wall-clock deferral
    const slice = codeOnly(src('app', 'state', 'slices', 'persistSlice.ts'));
    expect(slice).toContain('void Promise.resolve().then(() => {');
    expect(slice).not.toMatch(/persistTurn[\s\S]{0,200}setTimeout\(/);
  });
});
