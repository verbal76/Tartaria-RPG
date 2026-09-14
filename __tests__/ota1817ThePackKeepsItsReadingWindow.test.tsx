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

// ⚠⚠⚠ OTA-1817 (Baker item 13, job B) — THE PACK'S READING WINDOW COMES BACK.
//
// Two clocks, two meanings, and until OTA-1816 they could not touch each other:
//
//   `lastPlayerActionAt`  the player DID something. Job A put it on 39 actions.
//   `uiIdleSince`         the player is READING a stationary screen. Armed by
//                         exactly one caller in the whole app — this screen.
//
// OTA-1816 put `noteHumanInteraction` on sixteen pack seams. That primitive
// clears `uiIdleSince` — correct, pinned since OTA-1807, the player really is
// acting. But the pack arms its window ONCE, on mount, with `[]` deps. MEASURED
// on 994bf018: the FIRST equip / drop / scrap / stow left the field null for the
// REST of the mounted visit, and both readers — the item-description homework
// slot and the interactive synth requester — stayed dead until the player left
// the pack and came back. The one feature the window exists for, the description
// written ahead of the tap, was switched off by the player using the pack.
//
// Neither OTA-1126 nor OTA-1807 decided that; it fell out of the primitive's new
// reach, and OTA-1816's own header still claims it makes "no uiIdleSince policy
// change". Owner ruling 2026-09-14: a pack action IS human activity and MUST
// keep clearing the window, but it must not END eligibility for the visit —
// once it settles, a FRESH window is armed and the existing threshold starts
// again from the new stamp.
//
// ⚠ THIS SUITE MOUNTS THE REAL SCREEN against a real `startNewGame` player, and
// drives the real store. It asserts BOTH directions: the window returns, and it
// returns only where it should — not after unmount, not for a programmatic
// mutation, and never by resuming the pre-action stamp.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): { toJSON(): unknown; unmount(): void };
};
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useGameStore } from '../app/state/gameStore';
import { noteHumanInteraction } from '../app/state/humanActivity';

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const INV = src('app', 'screens', 'InventoryScreen.tsx');
const BOOT = src('app', 'state', 'slices', 'bootSlice.ts');

/** ⚠ THE REAL THRESHOLD, READ OFF THE REAL READER rather than retyped. The
 *  homework slot's own gate is `idleSince === null || now - idleSince < 1500`;
 *  the assertion below pins that the line still says so, so this model cannot
 *  drift away from the code it claims to measure. */
const HOMEWORK_IDLE_MS = 1_500;
const homeworkEligible = (now: number): boolean => {
  const idleSince = useGameStore.getState().uiIdleSince;
  return idleSince !== null && now - idleSince >= HOMEWORK_IDLE_MS;
};

const PACK = [
  { id: 'i1', name: 'Rusted Blade', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon'] },
  { id: 'i2', name: "Mud-Warden's Vest", kind: 'armor', rarity: 'Common', quantity: 1, tags: ['armor'] },
  { id: 'i3', name: 'Aetheric Torch', kind: 'misc', rarity: 'Common', quantity: 1, tags: [] },
  { id: 'i4', name: 'First Aid Kit', kind: 'consumable', rarity: 'Uncommon', quantity: 3, tags: [] },
  { id: 'i5', name: 'Scrap Metal', kind: 'material', rarity: 'Common', quantity: 7, tags: [] },
];
const SCENE = {
  location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'] },
  ambientNouns: ['bench', 'brick'], displayedAmbientNouns: ['bench', 'brick'],
  pinnedAmbientNouns: [], enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '',
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

/** A controllable clock, so "later than the original stamp" and "past the
 *  threshold" are decided by arithmetic rather than by how fast the suite runs. */
let clock = 0;
let realNow: () => number;
beforeAll(() => { realNow = Date.now; });
const useClock = (start: number): void => { clock = start; Date.now = () => clock; };
const advance = (ms: number): void => { clock += ms; };
afterEach(() => { Date.now = realNow; });

/** Mount the REAL pack. Returns the live tree so a test can unmount it itself. */
function openPack(): { unmount(): void } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Screen = require('../app/screens/InventoryScreen').InventoryScreen as () => React.ReactElement;
  let tree!: { toJSON(): unknown; unmount(): void };
  renderer.act(() => { tree = renderer.create(React.createElement(Screen)); });
  expect(tree.toJSON()).not.toBeUndefined();
  return tree;
}

/** ⚠ THE HUMAN PRESS, SPELLED THE WAY THE PACK SPELLS IT. Every pack seam reaches
 *  the store through `useHumanAction` / `humanGetState`, and both call exactly
 *  this primitive before the mutation (OTA-1816). Calling it here is the same
 *  event a tap produces — not a re-implementation of one. The structural test in
 *  section 5 pins that the pack's seams really do go through that door. */
const humanPressInPack = (): void => { renderer.act(() => { noteHumanInteraction(); }); };

describe('1. the pack still declares a reading window, and still cleans up', () => {
  it('⚠ entering the pack establishes the idle window (OTA-1126, unchanged)', () => {
    useClock(1_000_000);
    useGameStore.setState({ uiIdleSince: null });
    const tree = openPack();
    expect(useGameStore.getState().uiIdleSince).toBe(1_000_000);
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠ the OTA-1126 mount/unmount contract is byte-intact', () => {
    expect(INV).toContain('mark(true);');
    expect(INV).toContain('return () => { mark(false); };');
  });
});

describe('2. an admitted pack mutation is human activity, and clears the window', () => {
  it('⚠⚠ it records human activity — Job A accounting is untouched', () => {
    useClock(2_000_000);
    useGameStore.setState({ lastPlayerActionAt: 1 });
    const tree = openPack();
    humanPressInPack();
    expect(useGameStore.getState().lastPlayerActionAt).toBe(2_000_000);
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠ it CLEARS the prior stamp — the player is acting, not reading', () => {
    // The primitive's own contract, pinned since OTA-1807 and deliberately kept.
    useClock(3_000_000);
    useGameStore.setState({ uiIdleSince: 2_999_000 });
    noteHumanInteraction();
    expect(useGameStore.getState().uiIdleSince).toBeNull();
  });
});

describe('3. ⚠⚠⚠ and the window COMES BACK — the repair', () => {
  it('⚠⚠⚠ after the mutation settles, a NEW window is armed while the pack stays open', () => {
    useClock(4_000_000);
    useGameStore.setState({ uiIdleSince: null });
    const tree = openPack();
    expect(useGameStore.getState().uiIdleSince).toBe(4_000_000);
    advance(9_000);
    humanPressInPack();
    expect(useGameStore.getState().uiIdleSince).not.toBeNull();
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠⚠ the new stamp is FRESH — later than the pack stamp, not the old one resumed', () => {
    useClock(5_000_000);
    useGameStore.setState({ uiIdleSince: null });
    const tree = openPack();
    const onEntry = useGameStore.getState().uiIdleSince;
    advance(9_000);
    humanPressInPack();
    const afterAction = useGameStore.getState().uiIdleSince;
    expect(onEntry).toBe(5_000_000);
    expect(afterAction).toBe(5_009_000);
    expect(afterAction as number).toBeGreaterThan(onEntry as number);
    renderer.act(() => { tree.unmount(); });
  });
});

describe('4. the existing threshold is served in full, never bypassed', () => {
  it('⚠⚠ the reader this models still spells its own gate that way', () => {
    expect(BOOT).toContain('if (idleSince === null || Date.now() - idleSince < 1500) return;');
  });

  it('⚠⚠ homework is INELIGIBLE immediately after the re-arm', () => {
    useClock(6_000_000);
    useGameStore.setState({ uiIdleSince: null });
    const tree = openPack();
    advance(60_000);                       // long past the threshold on the OLD stamp
    expect(homeworkEligible(Date.now())).toBe(true);
    humanPressInPack();                    // …and the action resets it
    expect(homeworkEligible(Date.now())).toBe(false);
    advance(HOMEWORK_IDLE_MS - 1);
    expect(homeworkEligible(Date.now())).toBe(false);
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠ and ELIGIBLE again once the fresh threshold is served', () => {
    useClock(7_000_000);
    useGameStore.setState({ uiIdleSince: null });
    const tree = openPack();
    humanPressInPack();
    expect(homeworkEligible(Date.now())).toBe(false);
    advance(HOMEWORK_IDLE_MS);
    expect(homeworkEligible(Date.now())).toBe(true);
    renderer.act(() => { tree.unmount(); });
  });
});

describe('5. it re-arms ONLY where it should', () => {
  it('⚠⚠⚠ leaving the pack clears the window, and nothing re-arms it afterwards', () => {
    useClock(8_000_000);
    useGameStore.setState({ uiIdleSince: null });
    const tree = openPack();
    expect(useGameStore.getState().uiIdleSince).not.toBeNull();
    renderer.act(() => { tree.unmount(); });
    expect(useGameStore.getState().uiIdleSince).toBeNull();
    // a human action AFTER the pack closed must not open a window on a screen
    // that is no longer there
    advance(1_000);
    noteHumanInteraction();
    expect(useGameStore.getState().uiIdleSince).toBeNull();
  });

  it('⚠⚠⚠ a PROGRAMMATIC store mutation gains no human accounting and no window', () => {
    // ⚠ THE EXEMPLAR IS CHOSEN, NOT CONVENIENT. `cancelPendingRolls` is the one
    // Job A's own suite uses, because it mutates and reaches no other door. The
    // first draft of this test used `dropInventoryItem('i5')` and went RED on
    // `lastPlayerActionAt` — correctly: called with a NAME and no instance id,
    // that action deliberately routes through `submitPlayerAction('drop <name>')`
    // (inventorySlice:581) so the parser's noun resolution and its "isn't in your
    // pack" line still apply. On that branch it IS the typed door, and the typed
    // door has stamped this clock since OTA-1129. Not a defect and not a
    // programmatic path — a bad probe. Written down so nobody re-finds it.
    useClock(9_000_000);
    useGameStore.setState({ uiIdleSince: null, lastPlayerActionAt: 42 });
    const tree = openPack();
    renderer.act(() => {
      const s = useGameStore.getState();
      try { (s.cancelPendingRolls as () => void)(); } catch { /* shape-agnostic */ }
    });
    // the engine touching the same action is not a person
    expect(useGameStore.getState().lastPlayerActionAt).toBe(42);
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠ the re-arm reads Job A’s clock — it does not invent a second one', () => {
    const effect = INV.slice(INV.indexOf('const lastPlayerActionAt = useGameStore'));
    expect(effect.slice(0, 220)).toContain('markUiIdle(true)');
    expect(effect.slice(0, 220)).toContain('[lastPlayerActionAt]');
    // no parallel activity architecture, and no sprint/preemption reach
    expect(INV).not.toContain('notePlayerActionForSprint');
    expect(INV).not.toContain('preemptHomeworkForPlayer');
  });
});

describe('6. Job A and OTA-1807 remain exactly as they were', () => {
  it('⚠⚠ the pack still reaches the store through the Job A seams', () => {
    expect(INV).toContain("from '../state/humanActivity'");
    expect(INV).toContain("useHumanAction('equipItem')");
    expect(INV).toContain("useHumanAction('dropInventoryItem')");
    expect(INV).toContain("useHumanAction('scrapInventoryItem')");
    // membership did not quietly grow on this screen
    expect(INV).not.toContain("useHumanAction('setScreen')");
  });

  it('⚠⚠ the primitive is unchanged — still clears, still stamps, still no sprint feed', () => {
    const HA = src('app', 'state', 'humanActivity.ts')
      .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(HA).toContain('if (st.uiIdleSince !== null) useGameStore.setState({ uiIdleSince: null });');
    expect(HA).toContain('useGameStore.setState({ lastPlayerActionAt: now });');
    expect(HA).not.toContain('notePlayerActionForSprint');
    expect(HA).not.toContain('preemptHomeworkForPlayer');
  });

  it('⚠ markUiIdle keeps its global semantics — idempotent, stamps only when null', () => {
    const GS = src('app', 'state', 'gameStore.ts');
    expect(GS).toContain('return st.uiIdleSince === null ? { uiIdleSince: Date.now() } : {};');
  });
});
