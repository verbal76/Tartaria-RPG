// OTA-1864 — THE BENCH LEAVES A TRAIL.
//
// ⚠⚠⚠ WHY THIS SUITE EXISTS, FROM THE DEVICE AND NOT FROM A THEORY.
// On 2026-09-21 the owner's iPhone raised the Crucible guard over `craft
// Mudstone` at 21:34:03.760. It was never answered. JS stayed demonstrably alive
// to 21:34:21.255 — a cognitive op at +3.5s, an appstate transition at +16.5s,
// an immediate breadcrumb at +17.5s — and then the owner force-closed.
//
// The freeze could not be classified, and the reason was not subtle: the
// crafting surface emitted NOTHING. Sixty-seven seconds of crafting before it —
// two crafts, six repairs, and TWO SUCCESSFULLY ANSWERED Crucible guards on this
// very modal — produced ZERO touch-path entries, while the ring sat half empty
// (#19..#22, room to spare). So "no touch was recorded during the freeze" meant
// exactly nothing.
//
// ⚠⚠ WHAT THIS SUITE HOLDS PRODUCTION TO. Not a freeze repair — no crafting
// freeze cause is proven, and this OTA does not claim one. It holds the LADDER:
//
//     root → in → enter → dispatch → done
//
// so a recurrence can separate "no touch reached JS" from "the touch reached the
// surface but not the control" from "the handler never began" from "the handler
// began and the store action did not return". Each missing rung is a different
// fault with a different repair, and before this OTA all four were the same
// silence.
//
// ⚠ AND ONE DISTINCTION IT REFUSES TO BLUR. The guard still unmounts its <Modal>
// on `return null`, so its presentation edges claim the REACT layer and nothing
// more. OTA-1863 is where the difference between "React let go" and "iOS finished
// dismissing" was learned; `react-mount`/`react-unmount` say so in the wire
// format itself, and test 8 pins that the words `dismissed` and `native` never
// appear on this surface.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
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
      static createAsync: (...a: unknown[]) => Promise<unknown> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import React from 'react';
import { useGameStore } from '../app/state/gameStore';
import { CrucibleGuardModal } from '../app/components/CrucibleGuardModal';
import { CraftingScreen } from '../app/screens/CraftingScreen';
import {
  peekTouchPath,
  touchPathContext,
  _resetTouchPathForTest,
  type TouchPathEntry,
  type TouchStage,
} from '../app/diagnostics/touchPath';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => TestTree;
  act: (fn: () => void) => void;
};
interface TI { type: unknown; props: Record<string, unknown>; findAll(f: (n: TI) => boolean): TI[] }
interface TestTree { root: TI; unmount(): void }

/** The two at-risk stacks the device's own Mudstone guard listed. */
const AT_RISK = [
  { id: 'inst-imp-horn-1', name: 'Imp Horn', quantity: 1, held: 1 },
  { id: 'inst-imp-horn-2', name: 'Imp Horn', quantity: 1, held: 1 },
];

function raiseGuard(): jest.Mock {
  const spy = jest.fn();
  useGameStore.setState({
    crucibleGuardPrompt: {
      action: 'craft',
      label: 'Mudstone',
      queue: [],
      recipeResult: 'Mudstone',
      craftCount: 5,
      atRisk: AT_RISK,
      allow: [],
    },
    resolveCrucibleGuard: spy as never,
  } as never);
  return spy;
}

/** ⚠⚠ EVERY TREE IS TRACKED. A test that throws before its own `unmount()`
 *  would otherwise leave a live store subscriber behind, and the NEXT test's
 *  `setState` would see two components answer — which is exactly how a green
 *  suite turns into a cascade of unrelated reds. Learned here, the hard way. */
const live: TestTree[] = [];
function mountGuard(): { tree: TestTree; spy: jest.Mock } {
  const spy = raiseGuard();
  let tree!: TestTree;
  renderer.act(() => { tree = renderer.create(<CrucibleGuardModal />); });
  live.push(tree);
  return { tree, spy };
}

/** Every string rendered anywhere under a node — how a control is named here. */
function textUnder(n: TI): string {
  const out: string[] = [];
  for (const t of n.findAll(() => true)) {
    const kids = ([] as unknown[]).concat((t.props.children ?? []) as unknown[]);
    for (const k of kids) if (typeof k === 'string') out.push(k);
  }
  return out.join(' ');
}

/** Every real <Pressable> instance in the rendered tree.
 *  ⚠ BY NAME, NOT BY IDENTITY: react-native wraps Pressable in memo+forwardRef,
 *  so `findAllByType(Pressable)` matches nothing against the rendered instance. */
function pressables(tree: TestTree): TI[] {
  return tree.root.findAll((n) => {
    const t = n.type as { name?: string; displayName?: string } | string;
    return typeof t !== 'string' && (t?.displayName ?? t?.name) === 'Pressable';
  });
}

/** The tick rows: the only pressables here with no press-in instrument, by
 *  design — this OTA covers the TERMINAL answer controls, not the picker rows. */
function rows(tree: TestTree): TI[] {
  return pressables(tree).filter((p) => typeof p.props.onPressIn !== 'function');
}

/** The real <Pressable> whose rendered label contains `needle`. */
function control(tree: TestTree, needle: string): TI {
  const hit = pressables(tree).filter((p) => textUnder(p).includes(needle));
  expect(hit.length).toBe(1);
  return hit[0]!;
}

/** A complete physical press on a real control: press-in then press. */
function press(node: TI): void {
  renderer.act(() => {
    (node.props.onPressIn as (e: unknown) => void)?.({ nativeEvent: { timestamp: Date.now() } });
    (node.props.onPress as () => void)?.();
  });
}

const stages = (entries: readonly TouchPathEntry[], control?: string): string[] =>
  entries.filter((e) => control === undefined || e.c === control).map((e) => e.st);

/**
 * ⚠⚠⚠ THE CONTRACT ITSELF, AND THE THING THE NEGATIVE CONTROL SHOOTS AT.
 * Asserts the four rungs a terminal answer control must leave, in order, all
 * carrying ONE interaction id. Written as a function precisely so test 11 can
 * prove it goes red when a rung is missing rather than merely proving the modal
 * still renders.
 */
function expectLadder(entries: readonly TouchPathEntry[], control: string): void {
  const mine = entries.filter((e) => e.c === control);
  expect(mine.map((e) => e.st)).toEqual<TouchStage[]>(['in', 'enter', 'dispatch', 'done']);
  const ids = new Set(mine.map((e) => e.i));
  expect(ids.size).toBe(1);
  expect([...ids][0]).toBeGreaterThan(0); // #0 is the non-interaction id
}

beforeEach(() => {
  _resetTouchPathForTest();
  useGameStore.setState({ crucibleGuardPrompt: null } as never);
});
afterEach(() => {
  while (live.length) { try { live.pop()!.unmount(); } catch { /* already unmounted */ } }
  _resetTouchPathForTest();
  useGameStore.setState({ crucibleGuardPrompt: null } as never);
});

describe('OTA-1864 — the bench leaves a trail', () => {
  // ─── 1 — CRAFTING SCREEN ROOT ─────────────────────────────────────────────
  it('1 · the crafting screen mints a root touch and NEVER claims the responder', async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({
      name: 'Bench', raceId: 'unknowing_mass', factionId: 'reclaimers_guild', motiveId: 'debt',
    } as never);
    expect(useGameStore.getState().player).not.toBeNull();
    let tree!: TestTree;
    renderer.act(() => { tree = renderer.create(<CraftingScreen />); });

    const roots = tree.root.findAll(
      (n) => typeof n.type === 'string' && typeof n.props.onStartShouldSetResponderCapture === 'function',
    );
    expect(roots.length).toBeGreaterThan(0);

    const before = peekTouchPath().length;
    const claimed = (roots[0]!.props.onStartShouldSetResponderCapture as () => boolean)();
    // ⚠ RETURNING FALSE IS THE WHOLE SAFETY ARGUMENT: claiming here would steal
    // the gesture from the control the player actually pressed.
    expect(claimed).toBe(false);

    const added = peekTouchPath().slice(before);
    expect(added.map((e) => e.st)).toEqual<TouchStage[]>(['root']);
    // And the record must say which bench it came from, or the reader inherits
    // whatever screen was named last — which in the 2026-09-21 trace was
    // `exploration`, on a life that died on the crafting screen.
    expect(touchPathContext().screen).toBe('crafting');

    tree.unmount();
  });

  // ─── 2 — GUARD MODAL ROOT ─────────────────────────────────────────────────
  it('2 · the guard mints a modal touch and NEVER claims the responder', () => {
    const { tree } = mountGuard();
    const caps = tree.root.findAll(
      (n) => typeof n.type === 'string' && typeof n.props.onStartShouldSetResponderCapture === 'function',
    );
    expect(caps.length).toBe(1);

    const before = peekTouchPath().length;
    expect((caps[0]!.props.onStartShouldSetResponderCapture as () => boolean)()).toBe(false);
    expect(peekTouchPath().slice(before).map((e) => e.st)).toEqual<TouchStage[]>(['modal']);
    tree.unmount();
  });

  // ─── 3..6 — THE FOUR TERMINAL ANSWERS ─────────────────────────────────────
  it('3 · SAVE ALL leaves in → enter → dispatch → done', () => {
    const { tree, spy } = mountGuard();
    press(control(tree, 'SAVE ALL FOR THE CRUCIBLE'));
    expectLadder(peekTouchPath(), 'guard:save-all');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toBe('save-all');
    tree.unmount();
  });

  it('4 · CANCEL leaves in → enter → dispatch → done', () => {
    const { tree, spy } = mountGuard();
    press(control(tree, 'CANCEL'));
    expectLadder(peekTouchPath(), 'guard:cancel');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toBe('cancel');
    tree.unmount();
  });

  it('5 · SPEND IT ALL leaves in → enter → dispatch → done', () => {
    const { tree, spy } = mountGuard();
    press(control(tree, 'SPEND IT ALL'));
    expectLadder(peekTouchPath(), 'guard:spend');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toBe('spend');
    tree.unmount();
  });

  it('6 · SAVE TICKED leaves the ladder once it is enabled, and carries the ticks', () => {
    const { tree, spy } = mountGuard();
    // Everything ticks on open, so the control is correctly disabled. Untick one
    // row through its own real Pressable — a partial answer is the whole reason
    // this modal is a picker (OTA-1552).
    const picked = rows(tree);
    expect(picked).toHaveLength(AT_RISK.length);
    renderer.act(() => { (picked[0]!.props.onPress as () => void)(); });

    const ticked = control(tree, 'SAVE TICKED');
    expect(ticked.props.disabled).toBe(false);
    press(ticked);

    expectLadder(peekTouchPath(), 'guard:save-ticked');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0]).toBe('save');
    expect(spy.mock.calls[0]![1]).toHaveLength(1);
    tree.unmount();
  });

  // ─── 7 — THE DISABLED CONTROL REPORTS NOTHING ─────────────────────────────
  it('7 · a disabled SAVE TICKED reports no stage at all and answers nothing', () => {
    const { tree, spy } = mountGuard();
    const ticked = control(tree, 'SAVE TICKED');
    // Everything ticked on open ⇒ allTicked ⇒ disabled, exactly as before.
    expect(ticked.props.disabled).toBe(true);
    // RN never invokes onPressIn/onPress on a disabled Pressable, so the honest
    // record is `root` and nothing under it: nothing was addressed, so nothing
    // refused. This must NOT read as a completed action.
    expect(stages(peekTouchPath(), 'guard:save-ticked')).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    tree.unmount();
  });

  // ─── 8 — PRESENTATION LIFETIME, AT THE REACT LAYER ONLY ───────────────────
  it('8 · the guard reports react-mount then react-unmount, and never claims native dismissal', () => {
    const { tree } = mountGuard();
    const mounted = peekTouchPath().filter((e) => e.st === 'pres');
    expect(mounted.map((e) => e.r)).toEqual(['react-mount']);
    expect(mounted[0]!.c).toBe('craft:crucible-guard');
    expect(mounted[0]!.i).toBe(0); // OTA-1814's non-interaction id

    renderer.act(() => { useGameStore.setState({ crucibleGuardPrompt: null } as never); });
    const all = peekTouchPath().filter((e) => e.st === 'pres');
    expect(all.map((e) => e.r)).toEqual(['react-mount', 'react-unmount']);

    // ⚠⚠⚠ OTA-1863's LESSON, PINNED. react-native 0.81.5's Modal drops its
    // `modalDismissed` subscription in componentWillUnmount, and this component
    // still returns null, so nothing here can know when iOS finished. The wire
    // format must never suggest otherwise.
    for (const e of all) {
      expect(e.r).not.toMatch(/dismiss/i);
      expect(e.r).not.toMatch(/native/i);
    }
    tree.unmount();
  });

  // ─── 9 — BEHAVIOUR IS UNCHANGED ───────────────────────────────────────────
  it('9 · the instrumentation adds no Modal lifecycle prop and no new async boundary', () => {
    const { tree } = mountGuard();
    // The <Modal> keeps exactly the props it shipped with.
    const modal = tree.root.findAll((n) => {
      const t = n.type as { name?: string; displayName?: string } | string;
      return typeof t !== 'string' && (t?.displayName ?? t?.name) === 'Modal'
        && typeof n.props.animationType === 'string';
    })[0]!;
    expect(modal.props.visible).toBe(true);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.animationType).toBe('fade');
    expect(typeof modal.props.onRequestClose).toBe('function');
    // ⚠ THE TWO THINGS THIS OTA IS FORBIDDEN TO ADD.
    expect(modal.props.onDismiss).toBeUndefined();
    expect(modal.props.onShow).toBeUndefined();

    // The answer is still synchronous: the store action has already been called
    // by the time onPress returns, with no microtask in between.
    const spy = jest.fn();
    useGameStore.setState({ resolveCrucibleGuard: spy as never } as never);
    let treeB!: TestTree;
    renderer.act(() => { treeB = renderer.create(<CrucibleGuardModal />); });
    (control(treeB, 'CANCEL').props.onPress as () => void)();
    expect(spy).toHaveBeenCalledTimes(1); // no await, no tick
    treeB.unmount();
    tree.unmount();
  });

  // ─── 10 — THE HOOKS DO NOT DOUBLE-ANSWER ──────────────────────────────────
  it('10 · one press answers exactly once on every terminal control', () => {
    for (const [label, mode] of [
      ['SAVE ALL FOR THE CRUCIBLE', 'save-all'],
      ['CANCEL', 'cancel'],
      ['SPEND IT ALL', 'spend'],
    ] as const) {
      _resetTouchPathForTest();
      const { tree, spy } = mountGuard();
      press(control(tree, label));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toBe(mode);
      // And exactly one `done` — a ladder that fired twice would show two.
      expect(peekTouchPath().filter((e) => e.st === 'done').length).toBe(1);
      tree.unmount();
    }
  });

  // ─── 11 — NEGATIVE CONTROL ────────────────────────────────────────────────
  //
  // ⚠⚠⚠ THE SUITE MUST DETECT A MISSING FORENSIC STAGE, not merely prove the
  // modal still renders. `expectLadder` is the contract every test above leans
  // on, so it is the thing worth shooting at. Production is NOT mutated: the
  // checker is fed a hand-built trace with one rung removed.
  it('11 · NEGATIVE CONTROL — the ladder assertion goes red when a rung is missing', () => {
    const full: TouchPathEntry[] = (['in', 'enter', 'dispatch', 'done'] as TouchStage[])
      .map((st, k) => ({ s: k, i: 7, t: 0, st, c: 'guard:spend' } as TouchPathEntry));
    expect(() => expectLadder(full, 'guard:spend')).not.toThrow();

    for (const drop of ['in', 'enter', 'dispatch', 'done'] as TouchStage[]) {
      const holed = full.filter((e) => e.st !== drop);
      expect(() => expectLadder(holed, 'guard:spend')).toThrow();
    }
    // And a ladder split across two fingers is not one interaction.
    const split = full.map((e, k) => ({ ...e, i: k < 2 ? 7 : 8 }));
    expect(() => expectLadder(split, 'guard:spend')).toThrow();
  });

  // ─── 12 — NEGATIVE CONTROL, THROUGH THE REAL COMPONENT ────────────────────
  //
  // ⚠⚠⚠ THE PROOF THAT MATTERS: if PRODUCTION stopped emitting one rung, does
  // this suite notice? A real hook is bypassed by mocking — the tree on disk is
  // never touched — and the same assertion every test above leans on must go
  // red while the gameplay answer still happens. That last half is the point: a
  // suite that only caught "the modal broke" would not have caught the blind
  // spot this OTA exists to close.
  it('12 · NEGATIVE CONTROL — silencing `dispatch` in production turns the ladder red', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const touch = require('../app/diagnostics/touchPath') as {
      noteStage: (id: number, st: TouchStage, o?: { control?: string; reason?: string }) => void;
    };
    const real = touch.noteStage;
    const gag = jest.spyOn(touch, 'noteStage').mockImplementation((id, st, o) => {
      if (st === 'dispatch') return; // the one rung this control removes
      real(id, st, o);
    });
    try {
      const { tree, spy } = mountGuard();
      press(control(tree, 'SPEND IT ALL'));
      // The ANSWER still ran — this is an observability control, not a break.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toBe('spend');
      // ...and the contract notices the hole.
      expect(stages(peekTouchPath(), 'guard:spend')).toEqual(['in', 'enter', 'done']);
      expect(() => expectLadder(peekTouchPath(), 'guard:spend')).toThrow();
    } finally {
      gag.mockRestore();
    }
    // Restored: the very next press writes the full ladder again.
    _resetTouchPathForTest();
    const { tree: t2 } = mountGuard();
    press(control(t2, 'SPEND IT ALL'));
    expectLadder(peekTouchPath(), 'guard:spend');
  });
});
