// OTA-1881 — THE CRUCIBLE KEEPS ITS HOOKS (#206, #213).
//
// ⚠⚠⚠ THE OWNER TAPPED FUSE AND THE GAME BROKE. On a Pixel 10 Pro XL, Android 17,
// release 2026-09-24-1880, at 20:36:11.483Z, in asgardar, the screen went to
// SOMETHING BROKE carrying React's own words:
//
//     Rendered more hooks than during the previous render.
//         at FusionPickerModal
//
// The error boundary caught it and the process survived, so the ledger calls it a
// "screen crash (recovered)" — but the Crucible never opened.
//
// ⚠⚠ THE CAUSE WAS TOPOLOGY AND IT WAS UNCONDITIONAL. `FusionPickerModal` stays
// MOUNTED while shut and renders null through `if (!visible) return null`. Three
// hooks — a `useRef` and two `useEffect`s — sat BELOW that line, so a closed
// render ran 15 hooks and an open one ran 18. The extra three arrive on the very
// render where `visible` flips, which is the render the FUSE tap causes. This was
// not a race and not a device: every opening of this card broke the rule, and
// Android is only where it was caught.
//
// ⚠ SO THE SUITE COUNTS RENDERS, NOT STRINGS. A regex would have been satisfied by
// moving the lines and would say nothing about whether React accepts the result.
// Every case below drives the real component through real `visible` transitions
// and fails if React throws — which is exactly what the owner saw.
//
// #206 — the earlier Fusing-Crucible investigation closed as INSUFFICIENT
// EVIDENCE: the surface emitted no `pres` row and nothing named a mechanism. That
// disposition was right for the evidence it had. This crash supplied the
// mechanism, and §E keeps the rows that investigation asked for.
import React from 'react';
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// ⚠⚠ NO `{ virtual: true }`. Both modules genuinely EXIST, and a virtual mock on a
// real module holds only while this suite runs ALONE — in a shared run the real
// onnxruntime binding loaded and died on "Cannot read properties of undefined
// (reading 'install')", failing a NEIGHBOUR suite rather than this one. OTA-1246
// already wrote that lesson down; this is the house pattern it settled on.
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => unknown): unknown;
  create(el: React.ReactElement): { toJSON(): unknown; root: TI; unmount(): void };
};
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const FPM = src('app', 'components', 'FusionPickerModal.tsx');

interface TI {
  props: Record<string, unknown>;
  children: unknown[];
  findAll(fn: (n: TI) => boolean): TI[];
}

jest.setTimeout(60_000);

let base: unknown = null;
beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGameStore } = require('../app/state/gameStore');
  await useGameStore.getState().startNewGame({
    name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
    motiveId: 'debt', pressure: 'owed',
  } as never);
  if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
  useGameStore.getState().submitPlayerAction('Walker');
  base = useGameStore.getState().player;
  require('../app/components/FusionPickerModal');
});

const _mounted: Array<{ unmount(): void }> = [];
/** ⚠⚠ TEARDOWN MUST FLUSH INSIDE act(). React defers a passive effect's destroy
 *  function past `unmount()`; outside act() it is not flushed until the next
 *  act() runs — which is the NEXT test's first one. Left unwrapped, this card's
 *  own `react-unmount` row arrives during the following test's mount and is
 *  counted against it, and React prints its "not wrapped in act(...)" warning.
 *  The row is correct; only its timing was the harness's fault. */
afterEach(() => {
  renderer.act(() => { while (_mounted.length) _mounted.pop()!.unmount(); });
});

/** ⚠ SCRAP IN THE PACK, because the card's own body reads the inventory. The
 *  defect is in the hook prologue and fires whatever the pack holds, but a picker
 *  with nothing to pick would let a later reader mistake an empty card for a
 *  working one. */
const SCRAP = Array.from({ length: 6 }, (_, i) => ({
  id: `sc${i}`, name: 'Scrap Plate', type: 'material', quantity: 1,
}));

function setVisible(v: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGameStore } = require('../app/state/gameStore');
  renderer.act(() => { useGameStore.setState({ fusionPickerOpen: v } as never); });
}

function mountShut() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useGameStore } = require('../app/state/gameStore');
  const p = base as Record<string, unknown>;
  renderer.act(() => {
    useGameStore.setState({
      player: { ...p, inventory: [...((p.inventory as unknown[]) ?? []), ...SCRAP] },
      fusionPickerOpen: false,
    } as never);
  });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FusionPickerModal } = require('../app/components/FusionPickerModal');
  let tree!: { toJSON(): unknown; root: TI; unmount(): void };
  renderer.act(() => { tree = renderer.create(<FusionPickerModal />) as never; });
  _mounted.push(tree);
  return tree;
}

const isOpen = (tree: { toJSON(): unknown }): boolean => tree.toJSON() !== null;

// ════════════════════════════════════════════════════════════════════════════
// §A — THE CRASH THE OWNER SAW, AS A TEST
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1881 §A — opening the Crucible does not throw', () => {
  it('⚠⚠⚠ mounted-shut then OPENED — the exact transition the FUSE tap causes', () => {
    const tree = mountShut();
    expect(isOpen(tree)).toBe(false);
    // Before the repair this threw "Rendered more hooks than during the previous
    // render", because three hooks appeared for the first time on this render.
    expect(() => setVisible(true)).not.toThrow();
    expect(isOpen(tree)).toBe(true);
  });

  it('⚠⚠ and CLOSING again does not throw either', () => {
    const tree = mountShut();
    setVisible(true);
    expect(() => setVisible(false)).not.toThrow();
    expect(isOpen(tree)).toBe(false);
  });

  it('⚠⚠⚠ repeated shut → open → shut → open survives, which is the player\'s day', () => {
    const tree = mountShut();
    for (let i = 0; i < 4; i++) {
      expect(() => setVisible(true)).not.toThrow();
      expect(isOpen(tree)).toBe(true);
      expect(() => setVisible(false)).not.toThrow();
      expect(isOpen(tree)).toBe(false);
    }
  });

  it('⚠ a card mounted ALREADY OPEN still works — the other entry order', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    const p = base as Record<string, unknown>;
    renderer.act(() => {
      useGameStore.setState({
        player: { ...p, inventory: [...((p.inventory as unknown[]) ?? []), ...SCRAP] },
        fusionPickerOpen: true,
      } as never);
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FusionPickerModal } = require('../app/components/FusionPickerModal');
    let tree!: { toJSON(): unknown; root: TI; unmount(): void };
    expect(() => { renderer.act(() => { tree = renderer.create(<FusionPickerModal />) as never; }); }).not.toThrow();
    _mounted.push(tree);
    expect(isOpen(tree)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — THE INVARIANT ITSELF: NO HOOK BELOW THE GUARD
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1881 §B — every hook runs on every render', () => {
  it('⚠⚠⚠ no hook call appears after `if (!visible) return null`', () => {
    // ⚠ The behavioural cases above are the real proof; this is the rule stated so
    // a future hand cannot reintroduce the shape and pass by luck. It counts
    // GENERIC-TYPED hooks too — `useMemo<T>(` and `useState<T>(` are why a naive
    // scan of this file reported 6 hooks when there were 15.
    const guard = FPM.indexOf('if (!visible) return null;');
    expect(guard).toBeGreaterThan(0);
    const after = FPM.slice(guard);
    const HOOK = /\buse(State|Effect|Ref|Memo|Callback|Reducer|LayoutEffect|ImperativeHandle|Context|HumanAction|GameStore)\b\s*[<(]/g;
    const strays = after.match(HOOK) ?? [];
    expect(strays).toEqual([]);
    // …and the prologue really does still hold them.
    const before = FPM.slice(0, guard);
    expect((before.match(HOOK) ?? []).length).toBeGreaterThanOrEqual(18);
  });

  it('⚠ the guard is still a plain early return — not replaced by a remount trick', () => {
    expect(FPM).toContain('if (!visible) return null;');
    expect(FPM).not.toMatch(/key=\{[^}]*visible/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — NO DEVICE, NO PLATFORM, NO VERSION
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1881 §C — a hook rule that held on one platform would not be a rule', () => {
  it('⚠⚠⚠ nothing in this component branches on a device, OS or version', () => {
    /* ⚠⚠ STRIP THE PROSE FIRST. This file's comments NAME the platforms on
     * purpose — OTA-1875's note says "the Android incident" and OTA-1881's says
     * the crash was caught on a Pixel — and a census that cannot tell a sentence
     * from a branch would fail on its own documentation. That is the OTA-1721
     * class: an instrument acting on the words that describe it. The rule is
     * about CODE, so the code is what it reads. */
    const code = FPM
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    for (const forbidden of ['Platform.OS', 'Platform.Version', 'iPhone', 'iOS', 'Android', 'Pixel', 'DEVICE_PROFILES', 'useWindowDimensions']) {
      expect(code).not.toContain(forbidden);
    }
    // And the stripper really did leave the code behind, not everything.
    expect(code).toContain('if (!visible) return null;');
  });

  it('⚠⚠ the invariant is not suppressed, caught or swallowed', () => {
    // A boundary around the symptom would have hidden the owner's crash without
    // fixing a thing.
    expect(FPM).not.toContain('componentDidCatch');
    expect(FPM).not.toContain('ErrorBoundary');
    expect(FPM).not.toMatch(/try\s*\{[\s\S]{0,200}useEffect/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — THE EFFECTS STILL DO THEIR JOB, AND ONLY WHILE THE CARD IS UP
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1881 §D — the presentation rows still bracket the open card', () => {
  function rows(): Array<Record<string, unknown>> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { peekTouchPath } = require('../app/diagnostics/touchPath');
    return [...(peekTouchPath() as Array<Record<string, unknown>>)];
  }
  const crucible = () => rows().filter((r) => JSON.stringify(r).includes('craft:fusion-picker'));

  it('⚠⚠ a card that is mounted but SHUT writes no presentation row', () => {
    const before = crucible().length;
    mountShut();
    // Nothing on screen, nothing to announce. Before the repair this was true
    // because the effects did not exist; now it is true because they decline.
    expect(crucible().length).toBe(before);
  });

  it('⚠⚠⚠ opening writes the mount row, and closing writes the unmount row', () => {
    const tree = mountShut();
    const start = crucible().length;
    setVisible(true);
    const opened = crucible();
    expect(opened.length).toBeGreaterThan(start);
    expect(JSON.stringify(opened)).toContain('react-mount');
    setVisible(false);
    expect(JSON.stringify(crucible())).toContain('react-unmount');
    expect(isOpen(tree)).toBe(false);
  });

  it('⚠ re-opening announces the stage again — the ref does not go stale', () => {
    mountShut();
    setVisible(true);
    setVisible(false);
    const before = crucible().length;
    setVisible(true);
    const again = crucible();
    expect(again.length).toBeGreaterThan(before);
    expect(JSON.stringify(again)).toContain('stage:');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — THE CARD STILL WORKS, AND THE FORGE'S RULES ARE UNTOUCHED
// ════════════════════════════════════════════════════════════════════════════
describe('OTA-1881 §E — a topology repair changes no forge rule', () => {
  it('the opened card renders its own contents and controls', () => {
    const tree = mountShut();
    setVisible(true);
    const pressables = tree.root.findAll((n) => typeof n.props.onPress === 'function');
    expect(pressables.length).toBeGreaterThan(0);
    expect(isOpen(tree)).toBe(true);
  });

  it('⚠⚠ the transaction path is byte-identical — nothing was re-plumbed', () => {
    expect(FPM).toContain("confirm(picked, kind as 'weapon' | 'armor' | 'dog_armor', catalystId ?? undefined)");
    expect(FPM).toContain('upgradeCoating(pieceId, picked)');
    expect(FPM).toContain("useHumanAction('confirmFusionSelection')");
    expect(FPM).toContain("useHumanAction('upgradeCoatingSlot')");
  });

  it('⚠⚠ OTA-1875 — the picker\'s own scroll keeps its responder topology', () => {
    // The Crucible list must not acquire a Touchable ancestor; that is the defect
    // OTA-1875 closed on this very surface and it is not disturbed here.
    const tree = mountShut();
    setVisible(true);
    const scrolls = tree.root.findAll((n) => typeof n.props.onScroll === 'function'
      || (n.props as { horizontal?: unknown }).horizontal !== undefined);
    void scrolls;
    expect(FPM).not.toMatch(/<TouchableWithoutFeedback[\s\S]{0,400}<ScrollView/);
  });

  it('⚠ opening and closing spends nothing — no item is consumed by presentation', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    mountShut();
    const inv0 = JSON.stringify(useGameStore.getState().player?.inventory);
    const tc0 = useGameStore.getState().player?.tc;
    setVisible(true);
    setVisible(false);
    setVisible(true);
    expect(JSON.stringify(useGameStore.getState().player?.inventory)).toBe(inv0);
    expect(useGameStore.getState().player?.tc).toBe(tc0);
  });
});
