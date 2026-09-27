/* ⚠ THE NATIVE EDGE, MOCKED — same preamble as the other card-render suites
 * (OTA-1872 / OTA-1883 / this package's own #221 sibling), and for the same
 * reason: GatherModal reaches store diagnostics helpers whose imports touch
 * the wider engine. */
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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}), getStringAsync: jest.fn(async () => '') }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import React from 'react';
import { GatherModal, type GatherChip } from '../app/components/GatherModal';

/**
 * QOL #215 — THIS ROOM TAKE/SALVAGE MODAL TARGET STABILITY.
 *
 * Owner report: after TAKE ALL GEAR succeeds, that section disappears and the
 * modal reflows, so SALVAGE ALL jumps vertically under the thumb that just
 * pressed the first button. Traced to `renderSweep`: a lane's sweep control
 * used to `return null` the instant its lane emptied, unmounting the node
 * entirely. Repaired (see the QOL #215 comments in GatherModal.tsx) by having
 * a lane that has shown its sweep button THIS OPEN keep its slot in the
 * action column for the rest of the interaction — the button dims and its
 * `onPress` goes inert instead of disappearing. Loot/salvage mechanics,
 * inventory capacity, item outcomes and RNG are untouched; this is target
 * geometry only, and this suite proves it structurally: the emptied lane's
 * control is still IN THE TREE, at the SAME sibling position, after the
 * lane empties — the property that keeps the next button under the same
 * thumb position rather than a re-measured one.
 */

const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): Tree;
};

interface TestNode {
  type: unknown;
  parent: TestNode | null;
  props: Record<string, unknown>;
}
interface Tree {
  update(el: React.ReactElement): void;
  unmount(): void;
  root: { findAll(fn: (n: TestNode) => boolean): TestNode[] };
}

/** A Pressable-rendered control, found by an accessibilityLabel PREFIX rather
 *  than an exact match — the label's own trailing "(n)" count is expected to
 *  change as the lane empties, and matching on the stable prefix is how the
 *  test tells "still the same control, new count" apart from "a new one". */
const controlByPrefix = (tree: Tree, prefix: string): TestNode => {
  const hits = tree.root.findAll(
    (n) => typeof n.props.accessibilityLabel === 'string'
      && (n.props.accessibilityLabel as string).startsWith(prefix)
      && typeof n.props.onPress === 'function',
  );
  if (!hits.length) throw new Error(`no control labelled like "${prefix}…"`);
  return hits[0]!;
};

/** The action row's controls, in paint order — the region OTA-1799 named "the
 *  action region", holding one button per lane plus IGNORE. `findAll` walks
 *  the tree depth-first in render order, so this ordering is the same order
 *  the row lays its children out left-to-right — a control that keeps its
 *  index here never moved past another control that also kept its index. */
const ACTION_LABEL = /^(TAKE ALL GEAR|TAKE ALL ITEMS|⚒ SALVAGE ALL|Ignore the rest)/;
const actionsOrderOf = (tree: Tree): string[] =>
  tree.root
    .findAll((n) => typeof n.props.accessibilityLabel === 'string'
      && ACTION_LABEL.test(n.props.accessibilityLabel as string)
      && typeof n.props.onPress === 'function')
    .map((n) => n.props.accessibilityLabel as string);

const GEAR_CHIP: GatherChip = { noun: 'Rusted Blade' }; // resolves to a real weapon → gear lane
const SCRAP_CHIP: GatherChip = { noun: 'rubble' }; // resolves to scenery → scrap lane

const baseProps = {
  visible: true,
  player: null,
  onTake: jest.fn(),
  onSalvage: jest.fn(),
  onInvestigate: jest.fn(),
  onSalvageAll: jest.fn(),
  onCancel: jest.fn(),
};

let mounted: Tree | null = null;
afterEach(() => {
  if (mounted) { renderer.act(() => { try { mounted!.unmount(); } catch { /* already gone */ } }); }
  mounted = null;
  jest.clearAllMocks();
});

describe('QOL #215 — a swept lane keeps its slot; it does not unmount', () => {
  it('⚠⚠⚠ after TAKE ALL GEAR empties the lane, its button is still in the tree, dimmed and disabled — not removed', () => {
    const onTakeAll = jest.fn();
    let tree!: Tree;
    renderer.act(() => {
      tree = renderer.create(
        <GatherModal {...baseProps} onTakeAll={onTakeAll} chips={[GEAR_CHIP, SCRAP_CHIP]} />,
      );
    });
    mounted = tree;

    // Before: both sweeps present, gear enabled.
    const gearBefore = controlByPrefix(tree, 'TAKE ALL GEAR');
    expect(gearBefore.props.accessibilityLabel).toBe('TAKE ALL GEAR (1)');
    expect(gearBefore.props.accessibilityState).toEqual({ disabled: false });

    // Fire the sweep, then re-render with the gear chip consumed — exactly
    // what the real chips prop does once the store reports the take.
    renderer.act(() => { (gearBefore.props.onPress as () => void)(); });
    expect(onTakeAll).toHaveBeenCalledWith(['Rusted Blade']);
    renderer.act(() => {
      tree.update(
        <GatherModal
          {...baseProps}
          onTakeAll={onTakeAll}
          chips={[{ ...GEAR_CHIP, consumed: true }, SCRAP_CHIP]}
        />,
      );
    });

    // After: the gear button is STILL RENDERED — not null — now disabled.
    const gearAfter = controlByPrefix(tree, 'TAKE ALL GEAR');
    expect(gearAfter.props.accessibilityLabel).toBe('TAKE ALL GEAR (0)');
    expect(gearAfter.props.accessibilityState).toEqual({ disabled: true });
  });

  it('⚠⚠⚠ SALVAGE ALL keeps the SAME sibling position in the action row before and after GEAR empties', () => {
    const onTakeAll = jest.fn();
    let tree!: Tree;
    renderer.act(() => {
      tree = renderer.create(
        <GatherModal {...baseProps} onTakeAll={onTakeAll} chips={[GEAR_CHIP, SCRAP_CHIP]} />,
      );
    });
    mounted = tree;

    const before = actionsOrderOf(tree);
    const scrapIndexBefore = before.findIndex((l) => l.includes('SALVAGE ALL'));
    expect(scrapIndexBefore).toBeGreaterThanOrEqual(0);

    renderer.act(() => {
      tree.update(
        <GatherModal
          {...baseProps}
          onTakeAll={onTakeAll}
          chips={[{ ...GEAR_CHIP, consumed: true }, SCRAP_CHIP]}
        />,
      );
    });

    const after = actionsOrderOf(tree);
    const scrapIndexAfter = after.findIndex((l) => l.includes('SALVAGE ALL'));
    // Same slot in the action column — the owner's thumb finds SALVAGE ALL
    // exactly where it was, not one slot up.
    expect(scrapIndexAfter).toBe(scrapIndexBefore);
    expect(after.length).toBe(before.length); // nothing unmounted, nothing added
  });

  it('⚠⚠ pressing the now-emptied GEAR button is silently inert — no buzz, no onBlocked, no second sweep', () => {
    const onTakeAll = jest.fn();
    const onBlocked = jest.fn();
    let tree!: Tree;
    renderer.act(() => {
      tree = renderer.create(
        <GatherModal
          {...baseProps}
          onTakeAll={onTakeAll}
          onBlocked={onBlocked}
          chips={[GEAR_CHIP, SCRAP_CHIP]}
        />,
      );
    });
    mounted = tree;
    // Sweep it for real first — a chip that starts consumed was never shown
    // this open, so its button correctly renders nothing at all (see the
    // "never actionable this open" test below); the "silently inert" claim
    // is about a lane that WAS shown and then emptied.
    renderer.act(() => { (controlByPrefix(tree, 'TAKE ALL GEAR').props.onPress as () => void)(); });
    renderer.act(() => {
      tree.update(
        <GatherModal
          {...baseProps}
          onTakeAll={onTakeAll}
          onBlocked={onBlocked}
          chips={[{ ...GEAR_CHIP, consumed: true }, SCRAP_CHIP]}
        />,
      );
    });
    onTakeAll.mockClear();
    const gear = controlByPrefix(tree, 'TAKE ALL GEAR');
    renderer.act(() => { (gear.props.onPress as () => void)(); });
    // Already-swept is not a lock refusal — it must not buzz or re-invoke the sweep.
    expect(onBlocked).not.toHaveBeenCalled();
    expect(onTakeAll).not.toHaveBeenCalled();
  });

  it('⚠ SALVAGE ALL still fires normally, unaffected by GEAR having emptied first', () => {
    const onTakeAll = jest.fn();
    const onSalvageAll = jest.fn();
    let tree!: Tree;
    renderer.act(() => {
      tree = renderer.create(
        <GatherModal
          {...baseProps}
          onTakeAll={onTakeAll}
          onSalvageAll={onSalvageAll}
          chips={[{ ...GEAR_CHIP, consumed: true }, SCRAP_CHIP]}
        />,
      );
    });
    mounted = tree;
    const scrap = controlByPrefix(tree, '⚒ SALVAGE ALL');
    expect(scrap.props.accessibilityState).toEqual({ disabled: false });
    renderer.act(() => { (scrap.props.onPress as () => void)(); });
    expect(onSalvageAll).toHaveBeenCalledWith(['rubble']);
  });

  it('⚠ a lane that was NEVER actionable this open (ITEMS, with no chips) renders no button at all', () => {
    let tree!: Tree;
    renderer.act(() => {
      tree = renderer.create(
        <GatherModal {...baseProps} onTakeAll={jest.fn()} chips={[GEAR_CHIP, SCRAP_CHIP]} />,
      );
    });
    mounted = tree;
    const items = tree.root.findAll(
      (n) => typeof n.props.accessibilityLabel === 'string'
        && (n.props.accessibilityLabel as string).startsWith('TAKE ALL ITEMS'),
    );
    expect(items.length).toBe(0);
  });
});
