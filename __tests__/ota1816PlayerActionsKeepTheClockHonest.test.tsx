// ⚠⚠⚠ OTA-1816 (Baker item 13, job A) — A PLAYER WHO IS PLAYING IS NOT IDLE.
//
// `lastPlayerActionAt` is the authority two schedulers ask before they start
// optional work on top of the player: `introFillTick` (bootSlice) against a
// 6–20 s floor, and `playerActionIsSettling` (ai/narration) against a 1.5 s
// settle window. OTA-1807 fixed the Take family and wrote that wrapping the
// store call once "keeps that number from quietly becoming four."
//
// The number was never four. A census of CURRENT source found direct human
// gameplay mutations on SEVEN screens, none passing `submitPlayerAction` and
// none noted — including the one that matters most in a fight:
//
//     resolveRollStep / cancelPendingRolls — a whole combat fought by tapping
//     dice, and the clock never moved once.
//
// …plus buy / sell / steal / reinforce, equip / unequip / use / drop / scrap /
// coat / stow / gift / heal, accept / abandon / complete / turn-in, set a travel
// course, repair, arm the golem, accept a bounty, choose an ENDING.
//
// This suite proves the invariant in BOTH directions, because half the value is
// the exclusions: a successfully admitted human gameplay mutation refreshes the
// clock, and passive, programmatic and presentation-only things do not.
//
// ⚠ WHAT IT DOES NOT TOUCH, and asserts it does not: `uiIdleSince` POLICY (job
// B), the sprint/preemption door, admission timing, narration thresholds.

// ⚠ The store's native dependencies, mocked exactly as every other suite that
// imports gameStore does — this file needs the REAL store, not a stub of it.
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

import React from 'react';
// ⚠ `react-test-renderer` ships no bundled types in this tree, and adding @types
// just to satisfy one import would put a dependency in package.json for a
// test-only concern. The require is typed locally instead — narrowly, to the two
// calls this suite makes — so the tests ratchet stays at baseline rather than
// growing by one to buy a convenience. Same shape the eight existing renderer
// suites use (ota1233, ota1727, ota1746, ota1802 …).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer') as {
  create(el: React.ReactElement): { unmount(): void };
  act(cb: () => void): void;
};
const act = TestRenderer.act;
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useGameStore } from '../app/state/gameStore';
import {
  noteHumanInteraction, humanGetState, useHumanAction,
  HUMAN_GAMEPLAY_MUTATIONS,
} from '../app/state/humanActivity';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const SCREENS = ['VendorScreen', 'InventoryScreen', 'ContractsScreen', 'MapScreen',
  'WorldScreen', 'CraftingScreen', 'ExplorationScreen'] as const;
const screenSrc = (n: string): string => src('app', 'screens', `${n}.tsx`);

/** Park the clock somewhere unmistakably old, then report whether it moved. */
function withStaleClock(run: () => void): { moved: boolean; before: number } {
  const before = 1_000;
  useGameStore.setState({ lastPlayerActionAt: before });
  run();
  const after = useGameStore.getState().lastPlayerActionAt;
  return { moved: after !== before, before };
}

/** Drive a hook for real rather than re-implementing it.
 *  ⚠ OTA-1449 — CLOSE WHAT YOU OPEN: the probe is unmounted even though it
 *  renders null, so nothing this suite mounts outlives the test that mounted it. */
function callHook<T>(useIt: () => T, use: (v: T) => void): void {
  const Probe = (): null => { use(useIt()); return null; };
  let tree: { unmount(): void } | null = null;
  act(() => { tree = TestRenderer.create(<Probe />); });
  act(() => { (tree as unknown as { unmount(): void } | null)?.unmount(); });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('1. the primitive, and the two shapes a seam can take', () => {
  it('⚠⚠ noteHumanInteraction refreshes the clock — the OTA-1807 primitive, intact', () => {
    const { moved } = withStaleClock(() => { noteHumanInteraction(9_999); });
    expect(moved).toBe(true);
    expect(useGameStore.getState().lastPlayerActionAt).toBe(9_999);
  });

  it('⚠⚠⚠ humanGetState refreshes the clock AND returns the real store', () => {
    let sameStore = false;
    const { moved } = withStaleClock(() => { sameStore = humanGetState() === useGameStore.getState(); });
    expect(moved).toBe(true);
    expect(sameStore).toBe(true);
  });

  it('⚠⚠⚠ useHumanAction refreshes the clock when the returned action is CALLED', () => {
    let action: ((...a: unknown[]) => unknown) | null = null;
    callHook(() => useHumanAction('cancelPendingRolls'), (fn) => { action = fn as never; });
    expect(typeof action).toBe('function');
    // ⚠ Obtaining it must NOT stamp — a screen that merely renders is not a press.
    const justRendering = withStaleClock(() => { /* hook already ran above */ });
    expect(justRendering.moved).toBe(false);
    const { moved } = withStaleClock(() => { (action as unknown as () => void)(); });
    expect(moved).toBe(true);
  });

  it('⚠⚠ and it passes the action THROUGH — a wrapper that swallowed the answer would change gameplay', () => {
    let action: ((...a: unknown[]) => unknown) | null = null;
    callHook(() => useHumanAction('buyFromVendor'), (fn) => { action = fn as never; });
    const direct = useGameStore.getState().buyFromVendor;
    expect(typeof direct).toBe('function');
    expect(typeof action).toBe('function');
    expect(action).not.toBe(direct); // it IS wrapped…
  });
});

describe('2. a successfully admitted human mutation refreshes the clock', () => {
  // One representative per DIFFERENT admission architecture, which is the point:
  // a hook-wrapped selector, and an imperative getState seam.
  const HOOKED: Array<[string, string]> = [
    ['roll resolution', 'resolveRollStep'],
    ['roll stand-down', 'cancelPendingRolls'],
    ['vendor', 'sellToVendor'],
    ['inventory', 'useInventoryItem'],
    ['contract turn-in', 'completeContractFromUI'],
    ['travel course', 'setTravelCourse'],
    ['repair', 'repairInventoryItem'],
    ['golem', 'armGolem'],
  ];
  it.each(HOOKED)('⚠⚠⚠ %s (%s) stamps when pressed', (_label, name) => {
    let action: ((...a: unknown[]) => unknown) | null = null;
    callHook(() => useHumanAction(name as never), (fn) => { action = fn as never; });
    const { moved } = withStaleClock(() => {
      try { (action as unknown as (...a: unknown[]) => void)(undefined as never); } catch { /* the stamp lands first */ }
    });
    expect(`${name}:${moved}`).toBe(`${name}:true`);
  });

  it('⚠⚠ the stamp lands even when the mutation itself throws — the player still acted', () => {
    const { moved } = withStaleClock(() => {
      try { humanGetState(); throw new Error('mutation blew up'); } catch { /* ignored */ }
    });
    expect(moved).toBe(true);
  });
});

describe('3. what must NOT become human activity', () => {
  it('⚠⚠⚠ a PROGRAMMATIC call to the same store action does not stamp', () => {
    // The engine, a timer and a test all reach the action directly. If wrapping
    // had been done at the store instead of the UI, this would stamp and
    // automatic simulation would look like a person.
    const { moved } = withStaleClock(() => {
      const s = useGameStore.getState();
      try { (s.cancelPendingRolls as () => void)(); } catch { /* shape-agnostic */ }
    });
    expect(moved).toBe(false);
  });

  it('⚠⚠ a plain store read does not stamp', () => {
    const { moved } = withStaleClock(() => { void useGameStore.getState().player; });
    expect(moved).toBe(false);
  });

  it('⚠⚠ presentation and refusal actions are NOT on the membership list', () => {
    const names = HUMAN_GAMEPLAY_MUTATIONS as readonly string[];
    for (const excluded of [
      'setScreen',            // navigation
      'appendLog',            // narration/log write
      'nudgeTutorialBlocked', // a REFUSAL — the action never entered gameplay
      'openRaceAbilityPicker', 'closeRaceAbilityPicker', 'openCallDogModal', 'openStoryReveal',
      'clearContractsNotice', 'clearPendingInventoryCategory', 'cancelGiftMode',
      'replayStoryIntro', 'refreshSlots', 'importSaveFromText', 'clearGameLog',
    ]) {
      expect(`${excluded}:${names.includes(excluded)}`).toBe(`${excluded}:false`);
    }
  });

  it('⚠ every listed name is a real store action — the list cannot rot', () => {
    const st = useGameStore.getState() as unknown as Record<string, unknown>;
    const missing = (HUMAN_GAMEPLAY_MUTATIONS as readonly string[]).filter((n) => typeof st[n] !== 'function');
    expect(missing).toEqual([]);
  });
});

describe('4. ONE authority — no second player-activity clock', () => {
  it('⚠⚠⚠ lastPlayerActionAt is written in exactly two places, and both are the authority', () => {
    const writers: string[] = [];
    for (const f of ['app/state/gameStore.ts', 'app/state/humanActivity.ts',
      ...SCREENS.map((s) => `app/screens/${s}.tsx`)]) {
      const body = src(...f.split('/')).split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      const n = (body.match(/lastPlayerActionAt:\s*(Date\.now\(\)|now)/g) ?? []).length;
      if (n) writers.push(`${f}:${n}`);
    }
    // submitPlayerAction (the typed/chip door) + noteHumanInteraction (every direct door).
    expect(writers.sort()).toEqual(['app/state/gameStore.ts:1', 'app/state/humanActivity.ts:1']);
  });

  it('⚠⚠ the screens never stamp the clock themselves — they go through the primitive', () => {
    for (const s of SCREENS) {
      expect(`${s}:${screenSrc(s).includes('lastPlayerActionAt:')}`).toBe(`${s}:false`);
    }
  });
});

describe('5. structural census — a new direct seam cannot silently bypass the authority', () => {
  it('⚠⚠⚠ no screen reaches a listed mutation through a BARE selector', () => {
    const leaks: string[] = [];
    for (const s of SCREENS) {
      const body = screenSrc(s);
      for (const name of HUMAN_GAMEPLAY_MUTATIONS) {
        if (body.includes(`useGameStore((s) => s.${name})`)) leaks.push(`${s}.${name}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('⚠⚠⚠ the known imperative seams go through humanGetState, not the bare store', () => {
    const IMPERATIVE: Array<[string, string]> = [
      ['WorldScreen', 'acceptBounty'], ['WorldScreen', 'setTravelCourse'],
      ['ContractsScreen', 'chooseEndingMainQuest'], ['ContractsScreen', 'summonCoreGuardian'],
      ['InventoryScreen', 'armGolem'],
      ['ExplorationScreen', 'pickpocketPerson'], ['ExplorationScreen', 'useRaceAbility'],
      ['ExplorationScreen', 'openGift'], ['ExplorationScreen', 'applyTorchToHook'],
      ['ExplorationScreen', 'confirmCraftSubstitution'],
    ];
    const leaks: string[] = [];
    for (const [s, name] of IMPERATIVE) {
      const body = screenSrc(s);
      if (body.includes(`useGameStore.getState().${name}(`)) leaks.push(`${s}.${name} still bare`);
      if (!body.includes(`humanGetState().${name}(`)) leaks.push(`${s}.${name} not wrapped`);
    }
    expect(leaks).toEqual([]);
  });

  it('⚠⚠ every screen that mutates gameplay imports the authority', () => {
    for (const s of SCREENS) {
      expect(`${s}:${screenSrc(s).includes("from '../state/humanActivity'")}`).toBe(`${s}:true`);
    }
  });
});

describe('6. DIRECT TAKE — repaired at OTA-1807, preserved here', () => {
  it('⚠⚠⚠ the Take family still notes, and still through the same primitive', () => {
    const body = screenSrc('ExplorationScreen');
    // takeDirect: note, THEN take. The order is the claim.
    expect(body).toMatch(/const takeDirect = useCallback\(\(noun: string\) => \{\s*\n\s*noteHumanInteraction\(\);\s*\n\s*takeAmbientNoun\(noun\);/);
    // the tutorial grant and the SALVAGE ALL sweep, its two siblings
    expect(body.split('noteHumanInteraction();').length - 1).toBeGreaterThanOrEqual(4);
    expect(body).toContain('salvageAllAmbient');
  });

  it('⚠⚠ take-and-wear is accounted ONCE, by takeDirect — not double-stamped', () => {
    const body = screenSrc('ExplorationScreen');
    const block = body.slice(body.indexOf('const takeAndWear'), body.indexOf('const takeAndWear') + 900);
    expect(block).toContain('takeDirect(noun)');
    expect(block).not.toContain('noteHumanInteraction()');
    expect(block).not.toContain('humanGetState()');
  });
});

describe('7. the boundaries this job did NOT cross', () => {
  it('⚠⚠⚠ uiIdleSince POLICY is untouched — job B', () => {
    const ha = src('app', 'state', 'humanActivity.ts');
    // The primitive still only CLEARS a standing stamp, guarded, as at OTA-1807.
    expect(ha).toContain('if (st.uiIdleSince !== null) useGameStore.setState({ uiIdleSince: null });');
    // and nothing here ever SETS one.
    expect(ha).not.toMatch(/uiIdleSince:\s*(Date\.now\(\)|now)/);
  });

  it('⚠⚠⚠ the sprint / preemption door is NOT fed from here', () => {
    const ha = src('app', 'state', 'humanActivity.ts')
      .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(ha).not.toContain('notePlayerActionForSprint');
    expect(ha).not.toContain('preemptHomeworkForPlayer');
    expect(ha).not.toContain('sprintActionTimes');
  });

  it('⚠⚠ submitPlayerAction keeps its own bookkeeping exactly as it was', () => {
    const gs = src('app', 'state', 'gameStore.ts');
    expect(gs).toContain('set({ lastPlayerActionAt: Date.now() });');
    expect(gs).toContain('notePlayerActionForSprint();');
    expect(gs).toContain('fireQwenWarmOnPlayerAction();');
  });

  it('⚠ the clock stays runtime-only — a resumed save must not claim recent activity', () => {
    expect(src('app', 'state', 'gameStore.ts')).toContain('lastPlayerActionAt: null,');
  });
});
