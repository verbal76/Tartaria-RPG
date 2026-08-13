jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// ⚠ Native modules the store pulls in transitively. Mocked, not stubbed out — the
// point is to get the REAL screen mounted, not a hollow stand-in.
// ⚠⚠ NO `{ virtual: true }`. These modules genuinely EXIST, and a virtual mock on a
// real module held only while this suite ran alone — in the full run the real
// binding loaded and died on `Cannot read properties of undefined (reading
// 'install')`. This is the house pattern already used by petScratchVerbRouting and
// puppyVendorEdges; matching it is why it survives a whole-suite run.
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

// ⚠⚠ OTA-1246 — I SHIPPED A CRASH, AND NOTHING IN 793 SUITES COULD HAVE CAUGHT IT.
//
// From the owner's device, on the build I had pushed hours earlier:
//
//     stage: screen-render · error: undefined is not a function
//     component stack: in ExplorationScreen
//
// OTA-1245 hoisted the picker's chip list out of the JSX into a `gatherChips`
// memo so the colour-lane hint could read the same array. Right idea, placed 82
// lines too early: **a `useMemo` FACTORY RUNS DURING RENDER**, and the memo called
// `isAmbientConsumed` while that `const` was still in its temporal dead zone.
// Under Hermes a TDZ const reads as `undefined`, so the call died before a single
// frame drew. ⚠ MOVING A COMPUTATION EARLIER MOVES ITS DEPENDENCIES EARLIER TOO.
//
// ⚠⚠ WHY NOTHING CAUGHT IT — AND THIS IS THE PART WORTH KEEPING. `tsc` cannot see
// it (a reference inside a closure is legal to TypeScript; it has no idea the
// closure runs immediately). `eslint` would — `no-use-before-define` is exactly
// this rule — but measured, enabling it flags **2,869 pre-existing sites** across
// the tree, so it cannot be a blocking gate today. And EVERY suite that touches
// ExplorationScreen SOURCE-PINS it. **Not one of them had ever rendered it.**
// The same lesson as the OTA-1232 invisible icons and the OTA-1239 test pinned to
// a deleted file, in its most expensive form: a source pin proves a line exists,
// never that the component mounts.
//
// ⚠⚠ AND AN EMPTY RENDER IS NOT ENOUGH — THE FIRST VERSION OF THIS TEST PASSED
// WITH THE BUG STILL IN. With no scene, the chip list maps over an empty array and
// the dead reference is never CALLED. The room has to be populated or this suite
// is theatre. That was checked by putting the bug back and watching this fail.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): { toJSON(): unknown };
};
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const ROOM_NOUNS = ['bench', 'Aetheric Torch', 'Compact Blaster', 'chain'];

function mountWithScene(nouns: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGameStore } = require('../app/state/gameStore');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
  useGameStore.setState({
    currentScene: {
      location: { id: 'test_tile', name: 'Test Tile', type: 'ruin', tags: ['ruin'] },
      ambientNouns: nouns, displayedAmbientNouns: nouns, pinnedAmbientNouns: [],
      enemies: [], enemyHps: [], hooks: [], range: 'mid', text: '',
    },
  } as never);
  let tree!: { toJSON(): unknown };
  renderer.act(() => { tree = renderer.create(<ExplorationScreen />); });
  return tree;
}

describe('OTA-1246 — the screen actually mounts', () => {
  it('⚠⚠ ExplorationScreen RENDERS with a populated room — the guard that was missing', () => {
    // Verified to fail on the shipped bug: putting `gatherChips` back above
    // `isAmbientConsumed` makes this throw "isAmbientConsumed is not a function",
    // the same shape the device reported.
    expect(() => mountWithScene(ROOM_NOUNS)).not.toThrow();
  });

  it('⚠ ...and with an empty room, which is the WEAKER half of the check', () => {
    // Kept because an empty scene exercises different branches — but it is
    // explicitly NOT the guard: it passed while the crash was live.
    expect(() => mountWithScene([])).not.toThrow();
  });

  it('⚠⚠ every render-time memo sits BELOW the helpers it calls', () => {
    // The fix has to hold structurally, not just today. `gatherChips` calls
    // `isAmbientConsumed`, which itself calls `isFuzzyConsumed` — the first move
    // of this fix only cleared the FIRST hop and the render test caught the second.
    const s = src('app', 'screens', 'ExplorationScreen.tsx');
    const at = (needle: string): number => {
      const i = s.indexOf(needle);
      expect(i).toBeGreaterThan(-1);
      return i;
    };
    const isAmbientConsumed = at('  const isAmbientConsumed = (noun: string): boolean => {');
    const isFuzzyConsumed = at('  const isFuzzyConsumed = (chipNoun: string, pool: Set<string>): boolean =>');
    const gatherChips = at('  const gatherChips = useMemo(');
    const gatherLaneCount = at('  const gatherLaneCount = useMemo(');
    expect(gatherChips).toBeGreaterThan(isAmbientConsumed);
    expect(gatherChips).toBeGreaterThan(isFuzzyConsumed);
    expect(gatherLaneCount).toBeGreaterThan(gatherChips);
  });

  it('⚠ the picker and the lane count still share ONE array — the OTA-1245 point survives', () => {
    // The fix moved the memo; it must not have quietly duplicated it back.
    const s = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(s).toContain('chips={gatherChips}');
    expect((s.match(/const gatherChips = useMemo\(/g) ?? []).length).toBe(1);
  });
});
