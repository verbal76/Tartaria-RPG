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

// ⚠⚠⚠ OTA-1818 — THE BLIND INTERVAL BETWEEN T0 AND T1.
//
// Four freeze reports (E2-E5, 2026-09-14) end identically: the preceding action
// completes, the presentation token returns to `none`, `root` keeps arriving, and
// no `in` ever follows — while JS stays demonstrably alive (one window finished a
// 13,388 ms narration and spoke it aloud). Everything between the app root and a
// control's press-in is responder negotiation and hit testing, and the app
// observed none of it.
//
// ⚠⚠ AND ONE REGION WOULD HAVE LIED. A healthy tap on the transcript produces a
// root touch and no press-in — MEASURED in that same corpus (bundle mu0m8svi4x46:
// #6/#7/#8 root-only, then #9 `in quick:inventory` perfectly healthy). So this
// suite proves BOTH regions, and proves the instrument changes nothing.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): {
    toJSON(): unknown; unmount(): void;
    root: { findAll(fn: (n: { props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> }[] };
  };
};
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useGameStore } from '../app/state/gameStore';
import {
  noteRootTouch, notePressIn, noteHandlerEnter, noteStage, peekPendingTouchId,
  noteContentTouch, peekTouchPath, _resetTouchPathForTest, _touchPathWriteState,
  setTouchPathContext, flushTouchPath, touchPathLines,
  TOUCH_PATH_MAX_ENTRIES, TOUCH_CLAIM_MAX_AGE_MS,
  type TouchPathEntry,
} from '../app/diagnostics/touchPath';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const EXPL = src('app', 'screens', 'ExplorationScreen.tsx');
const INV = src('app', 'screens', 'InventoryScreen.tsx');
const TP = src('app', 'diagnostics', 'touchPath.ts');

const ring = (): readonly TouchPathEntry[] => peekTouchPath();
const stages = (): string[] => ring().map((e) => e.st);
const idsOf = (st: string): number[] => ring().filter((e) => e.st === st).map((e) => e.i);

const PACK = [
  { id: 'i1', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'] },
  { id: 'i2', name: "Mud-Warden's Vest", kind: 'armor', rarity: 'Common', quantity: 1, tags: ['armor'] },
  { id: 'i5', name: 'Scrap Metal', kind: 'material', rarity: 'Common', quantity: 7, tags: [] },
];
const SCENE = {
  location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'] },
  ambientNouns: ['bench'], displayedAmbientNouns: ['bench'], pinnedAmbientNouns: [],
  enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '',
};

beforeAll(async () => {
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  useGameStore.getState().submitPlayerAction('Walker');
  const base = useGameStore.getState().player;
  useGameStore.setState({
    tutorialStep: null, currentScene: SCENE,
    player: base ? { ...base, inventory: PACK, tc: 500 } : base,
  } as never);
});

beforeEach(() => { _resetTouchPathForTest(); });

/** Every DISTINCT capture observer in a rendered tree, in tree order (root first).
 *
 *  ⚠⚠ DEDUPED BY FUNCTION IDENTITY, and the reason is worth writing down: `findAll`
 *  visits the composite element AND every host element beneath it, so ONE observer
 *  is returned once per node in that chain — measured here as 3 copies of the root,
 *  4 of the feed (TutorialTarget → Animated.View → View) and 2 of the controls.
 *  Calling the duplicates would mint three root interactions for one finger and make
 *  this suite accuse production of a defect that is purely an artefact of how the
 *  test walks the tree. The prop value is the same function object across that
 *  chain, so identity collapses it exactly. */
function captures(tree: { root: { findAll(fn: (n: { props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> }[] } }):
  (() => boolean)[] {
  const seen = new Set<() => boolean>();
  for (const n of tree.root.findAll((x) => typeof x.props?.onStartShouldSetResponderCapture === 'function')) {
    seen.add(n.props.onStartShouldSetResponderCapture as () => boolean);
  }
  return [...seen];
}

function mount(name: 'ExplorationScreen' | 'InventoryScreen'): ReturnType<typeof renderer.create> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Screen = require(`../app/screens/${name}`)[name] as () => React.ReactElement;
  let tree!: ReturnType<typeof renderer.create>;
  renderer.act(() => { tree = renderer.create(React.createElement(Screen)); });
  expect(tree.toJSON()).not.toBeUndefined();
  return tree;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('1. the correlation primitive — it looks without taking', () => {
  it('⚠⚠⚠ peek returns the newest eligible root id and does NOT claim it', () => {
    const t0 = noteRootTouch('root');
    expect(peekPendingTouchId()).toBe(t0);
    expect(peekPendingTouchId()).toBe(t0);            // idempotent — still unclaimed
    const t1 = notePressIn('quick:TEST');             // the REAL claim still succeeds
    expect(t1).toBe(t0);
    expect(ring().find((e) => e.st === 'in')?.o).toBeUndefined();  // not an orphan
  });

  it('⚠⚠ it mints nothing when there is no eligible touch — null is the honest answer', () => {
    expect(peekPendingTouchId()).toBeNull();
    expect(noteContentTouch('controls')).toBeNull();
    expect(ring()).toHaveLength(0);                   // and records nothing
  });

  it('⚠⚠ it respects the SAME age boundary as the claim path', () => {
    const t0 = noteRootTouch('root', 1_000);
    expect(peekPendingTouchId(1_000 + TOUCH_CLAIM_MAX_AGE_MS)).toBe(t0);
    expect(peekPendingTouchId(1_000 + TOUCH_CLAIM_MAX_AGE_MS + 1)).toBeNull();
  });

  it('⚠⚠ a claimed touch is invisible to the peek', () => {
    noteRootTouch('root');
    notePressIn('quick:TEST');
    expect(peekPendingTouchId()).toBeNull();
  });

  it('⚠ newest-first, so region and control describe the SAME finger', () => {
    noteRootTouch('root');
    const second = noteRootTouch('root');
    expect(peekPendingTouchId()).toBe(second);
  });
});

describe('2. T0 → content → T1 → T2 is ONE interaction', () => {
  it('⚠⚠⚠ controls: root, content and press-in all share one id', () => {
    const t0 = noteRootTouch('root');
    expect(noteContentTouch('controls')).toBe(t0);
    expect(notePressIn('quick:ATTACK')).toBe(t0);
    expect(noteHandlerEnter('quick:ATTACK')).toBe(t0);
    expect(new Set(ring().map((e) => e.i)).size).toBe(1);
    expect(stages()).toEqual(['root', 'content', 'in', 'enter']);
    expect(ring()[1]!.c).toBe('controls');
  });

  it('⚠⚠⚠ feed: root and content share one id, and NO press-in is manufactured', () => {
    const t0 = noteRootTouch('root');
    expect(noteContentTouch('feed')).toBe(t0);
    expect(stages()).toEqual(['root', 'content']);
    expect(ring()[1]!.c).toBe('feed');
    expect(idsOf('content')).toEqual([t0]);
  });

  it('⚠⚠ the two regions are distinguishable — that is the whole correction', () => {
    noteRootTouch('root'); noteContentTouch('feed');
    const a = ring()[1]!.c;
    _resetTouchPathForTest();
    noteRootTouch('root'); noteContentTouch('controls');
    const b = ring()[1]!.c;
    expect(a).toBe('feed');
    expect(b).toBe('controls');
    expect(a).not.toBe(b);
  });
});

describe('3. the real Exploration tree', () => {
  it('⚠⚠⚠ every capture observer in the tree RETURNS FALSE', () => {
    const tree = mount('ExplorationScreen');
    const caps = captures(tree);
    expect(caps).toHaveLength(3);                     // root + controls + feed, and nothing else
    for (const c of caps) expect(c()).toBe(false);
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠⚠ the real observers, driven in tree order, correlate to one interaction', () => {
    const tree = mount('ExplorationScreen');
    _resetTouchPathForTest();
    const caps = captures(tree);
    for (const c of caps) c();
    const roots = ring().filter((e) => e.st === 'root');
    const contents = ring().filter((e) => e.st === 'content');
    expect(roots).toHaveLength(1);                    // exactly ONE interaction minted
    expect(contents).toHaveLength(2);
    for (const c of contents) expect(c.i).toBe(roots[0]!.i);
    expect(new Set(contents.map((e) => e.c))).toEqual(new Set(['controls', 'feed']));
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠ a control still reaches T1/T2 after the region observers ran', () => {
    const tree = mount('ExplorationScreen');
    _resetTouchPathForTest();
    for (const c of captures(tree)) c();
    const t1 = notePressIn('quick:ATTACK');
    const t2 = noteHandlerEnter('quick:ATTACK');
    expect(t1).toBe(ring()[0]!.i);
    expect(t2).toBe(t1);
    expect(ring().find((e) => e.st === 'in')?.o).toBeUndefined();
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠⚠ a modal-owned touch produces NO gameplay-region content', () => {
    // Native Modal content is a separate tree; the region observers are not in it.
    noteRootTouch('modal');
    notePressIn('search:wagon');
    expect(stages()).toEqual(['modal', 'in']);
    expect(idsOf('content')).toEqual([]);
  });
});

describe('4. nothing else moved', () => {
  it('⚠⚠ the existing stage vocabulary is intact and backward compatible', () => {
    const t = noteRootTouch('root');
    notePressIn('quick:X'); noteHandlerEnter('quick:X');
    noteStage(t, 'admit', { control: 'quick:X', reason: 'callback' });
    noteStage(t, 'dispatch', { control: 'quick:X', reason: 'callback' });
    noteStage(t, 'done', { control: 'quick:X', reason: 'callback' });
    noteStage(t, 'reject', { control: 'quick:X', reason: 'nope' });
    noteStage(t, 'pres', { control: 'report:receipt', reason: 'shown' });
    expect(stages()).toEqual(['root', 'in', 'enter', 'admit', 'dispatch', 'done', 'reject', 'pres']);
    expect(touchPathLines(ring())[0]).toContain('root');
  });

  it('⚠⚠ the ring stays bounded at the existing limit', () => {
    for (let i = 0; i < TOUCH_PATH_MAX_ENTRIES * 3; i++) { noteRootTouch('root'); noteContentTouch('controls'); }
    expect(ring().length).toBe(TOUCH_PATH_MAX_ENTRIES);
  });

  it('⚠⚠ one write in flight; further appends only mark dirty', () => {
    noteRootTouch('root');
    expect(_touchPathWriteState().writing).toBe(true);
    noteContentTouch('controls');
    const st = _touchPathWriteState();
    expect(st.writing).toBe(true);
    expect(st.dirty).toBe(true);
  });

  it('⚠⚠ a content observation never mutates store, screen or navigation', () => {
    setTouchPathContext({ screen: 'exploration', presentation: 'none' });
    const before = JSON.stringify({
      screen: useGameStore.getState().currentScreen,
      last: useGameStore.getState().lastPlayerActionAt,
      idle: useGameStore.getState().uiIdleSince,
      inv: useGameStore.getState().player?.inventory?.length,
    });
    noteRootTouch('root'); noteContentTouch('controls'); noteContentTouch('feed');
    const after = JSON.stringify({
      screen: useGameStore.getState().currentScreen,
      last: useGameStore.getState().lastPlayerActionAt,
      idle: useGameStore.getState().uiIdleSince,
      inv: useGameStore.getState().player?.inventory?.length,
    });
    expect(after).toBe(before);
  });

  it('⚠ a storage failure is swallowed and changes no touch behaviour', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AS = require('@react-native-async-storage/async-storage');
    const spy = jest.spyOn(AS, 'setItem').mockRejectedValue(new Error('disk full'));
    const t0 = noteRootTouch('root');
    expect(noteContentTouch('controls')).toBe(t0);
    expect(notePressIn('quick:X')).toBe(t0);
    expect(() => flushTouchPath()).not.toThrow();
    spy.mockRestore();
  });

  it('⚠ persistence architecture is unchanged — one key, no new timer', () => {
    expect((TP.match(/AsyncStorage\.setItem/g) ?? []).length).toBe(1);
    expect((TP.match(/const STORAGE_KEY/g) ?? []).length).toBe(1);
    expect(TP).not.toContain('setInterval');
  });
});

describe('5. the Inventory Equip trace', () => {
  it('⚠⚠⚠ the pack now declares its own screen context and a root observer', () => {
    expect(INV).toContain("setTouchPathContext({ screen: 'inventory'");
    expect(INV).toContain("onStartShouldSetResponderCapture={() => { noteRootTouch('root'); return false; }}");
  });

  it('⚠⚠⚠ the pack root observer returns FALSE and mints exactly one interaction', () => {
    const tree = mount('InventoryScreen');
    _resetTouchPathForTest();
    const caps = captures(tree);
    expect(caps.length).toBeGreaterThanOrEqual(1);
    for (const c of caps) expect(c()).toBe(false);
    expect(ring().filter((e) => e.st === 'root')).toHaveLength(caps.length);
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠⚠ Equip records enter → dispatch → done on ONE id behind a root touch', () => {
    const t0 = noteRootTouch('root');
    const tp = noteHandlerEnter('equip:chest');
    noteStage(tp, 'dispatch', { control: 'equip:chest', reason: 'equip' });
    noteStage(tp, 'done', { control: 'equip:chest', reason: 'equip' });
    expect(tp).toBe(t0);
    expect(stages()).toEqual(['root', 'enter', 'dispatch', 'done']);
    expect(new Set(ring().map((e) => e.i)).size).toBe(1);
  });

  it('⚠⚠⚠ the shipped order is observe, act, observe — equip is NOT wrapped or deferred', () => {
    const body = INV.slice(INV.indexOf('const chooseSlot = (slot: EquipSlot) => {'));
    const head = body.slice(0, 400);
    const iEnter = head.indexOf('noteHandlerEnter');
    const iDispatch = head.indexOf("'dispatch'");
    const iEquip = head.indexOf('equipItem(pending.item.name, slot, pending.item.id);');
    const iDone = head.indexOf("'done'");
    expect(iEnter).toBeGreaterThan(-1);
    expect(iDispatch).toBeGreaterThan(iEnter);
    expect(iEquip).toBeGreaterThan(iDispatch);
    expect(iDone).toBeGreaterThan(iEquip);
    // the guard and the call and the reset are byte-unchanged
    expect(head).toContain('if (!pending) return;');
    expect(head).toContain('setPending(null);');
  });

  it('⚠⚠ the omitted stages are omitted, not faked', () => {
    const body = INV.slice(INV.indexOf('const chooseSlot = (slot: EquipSlot) => {'), INV.indexOf('const chooseSlot') + 400);
    expect(body).not.toContain("'reject'");
    expect(body).not.toContain('notePressIn');
    // and the reason they cannot exist yet is still true of the renderer
    const BM = src('app', 'components', 'BrandedModal.tsx');
    expect(BM).not.toContain('onPressIn');
  });
});
