jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1250 — "I BROKE IT BY JUST GRABBING STUFF."
//
// Owner, from a device run on 4.29.177: *"you should only be able to do what it
// says, the other button touches should buzz."*
//
// ⚠⚠ THE LOCKDOWN STOPPED AT THE MODAL'S EDGE. Everything OTA-1249 dimmed was in
// the quick row; the picker that row opens was never touched. OTA-1248 had just
// FILLED that picker with the whole room so the colour layout could be taught —
// which is right, and which handed a first-time player a board where every row and
// all three sweep buttons were live. Measured from his log, inside the cudgel and
// armor beats:
//
//     22:12:54  You take the Bone Splitter Axe        ← not the cudgel
//     22:12:59  You take the Mud-Warden's Vest
//     22:12:59  You take the Salvaged Bow             ← not the vest
//     22:13:03  You take the Aetheric Torch
//     22:13:04  brick · gate · sign · console · table · coil rack   ← SALVAGE ALL
//
// Four taps, and the tutorial's opening room was stripped before the second beat
// finished. ⚠ THE TWO FIXES PULL IN OPPOSITE DIRECTIONS AND BOTH ARE RIGHT: show
// the whole room (so the layout is learnable), allow exactly one line (so the beat
// is a beat). Hiding the rest would teach the layout by deleting it.
//
// ⚠⚠ AND THE LOG CAUGHT A SECOND BUG THE FIRST ONE WAS HIDING. The vest row paid
// out FIVE TIMES in six seconds. `consumed` was hardcoded false on the tutorial
// prop chip, and `armor` is the one beat that deliberately does not advance on the
// take — so the row never went spent. `grantTutorialItem` early-returns once a
// prop is consumed, so only the FIRST of those five was a real grant: the other
// four printed "✦ Mud-Warden's Vest (Common)." over nothing. **A reward line for
// an item the engine did not hand over is worse than a dead button** — the player
// cannot tell which of the five they own.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): {
    toJSON(): unknown;
    unmount(): void;
    root: { findAll(fn: (n: { props: Record<string, unknown> }) => boolean): Array<{ props: Record<string, unknown> }> };
  };
};
import { GatherModal } from '../app/components/GatherModal';
import { readFileSync } from 'fs';
import { join } from 'path';
import { blockAt } from '../test-utils/srcBlock';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** A room shaped like the owner's: gear, an item, and scenery to sweep. */
const ROOM = ['cudgel', 'Bone Splitter Axe', 'Aetheric Torch', 'brick', 'table'];

interface Press { label: string; press: () => void; disabled: boolean }

function mount(lockedNoun: string | null, sink: {
  taken: string[]; salvaged: string[]; sweptTake: string[][]; sweptSalvage: string[][];
  blocked: number; cancelled: number;
}) {
  const tree = renderer.create(
    <GatherModal
      visible
      player={null}
      chips={ROOM.map((noun) => ({ noun }))}
      leadNouns={[]}
      lockedNoun={lockedNoun}
      onBlocked={() => { sink.blocked += 1; }}
      onTake={(n) => sink.taken.push(n)}
      onSalvage={(n) => sink.salvaged.push(n)}
      onTakeAll={(ns) => sink.sweptTake.push(ns)}
      onSalvageAll={(ns) => sink.sweptSalvage.push(ns)}
      onInvestigate={() => {}}
      onCancel={() => { sink.cancelled += 1; }}
    />,
  );
  const seen = new Map<string, Press>();
  for (const n of tree.root.findAll((x) => typeof x.props?.accessibilityLabel === 'string'
    && typeof x.props?.onPress === 'function')) {
    const label = String(n.props.accessibilityLabel);
    if (seen.has(label)) continue; // outermost layer wins
    seen.set(label, {
      label,
      press: n.props.onPress as () => void,
      disabled: !!(n.props as { accessibilityState?: { disabled?: boolean } }).accessibilityState?.disabled,
    });
  }
  return { presses: [...seen.values()], unmount: () => tree.unmount() };
}

const fresh = () => ({
  taken: [] as string[], salvaged: [] as string[],
  sweptTake: [] as string[][], sweptSalvage: [] as string[][],
  blocked: 0, cancelled: 0,
});

/** Find the control whose a11y label starts with a noun or button phrase. */
const find = (ps: Press[], needle: string): Press => {
  const hit = ps.find((p) => p.label.toLowerCase().includes(needle.toLowerCase()));
  expect({ needle, found: !!hit }.found).toBe(true);
  return hit!;
};

describe('OTA-1250 — RENDERED: the locked picker allows exactly one line', () => {
  it('⚠⚠ the beat\'s own row still works — the lock is not a wall', () => {
    const sink = fresh();
    const { presses, unmount } = mount('cudgel', sink);
    renderer.act(() => { find(presses, 'cudgel').press(); });
    expect(sink.taken).toEqual(['cudgel']);
    expect(sink.blocked).toBe(0);
    unmount();
  });

  it('⚠⚠ EVERY other row buzzes instead of taking — the axe, the torch, the brick', () => {
    // These are the exact nouns his log shows him walking away with.
    const sink = fresh();
    const { presses, unmount } = mount('cudgel', sink);
    for (const noun of ['Bone Splitter Axe', 'Aetheric Torch', 'brick', 'table']) {
      renderer.act(() => { find(presses, noun).press(); });
    }
    expect(sink.taken).toEqual([]);
    expect(sink.salvaged).toEqual([]);
    expect(sink.blocked).toBe(4);
    unmount();
  });

  it('⚠⚠ ALL THREE SWEEP BUTTONS buzz — including the lane the locked noun is in', () => {
    // ⚠ A sweep is never the beat's answer even when its lane holds only the
    // target: the beat teaches ONE TAP on ONE LINE, and letting TAKE ALL GEAR
    // stand in for that teaches the opposite lesson.
    const sink = fresh();
    const { presses, unmount } = mount('cudgel', sink);
    for (const b of ['TAKE ALL GEAR', 'TAKE ALL ITEMS', 'SALVAGE ALL']) {
      renderer.act(() => { find(presses, b).press(); });
    }
    expect(sink.sweptTake).toEqual([]);
    expect(sink.sweptSalvage).toEqual([]);   // the six-noun sweep from the log
    expect(sink.blocked).toBe(3);
    unmount();
  });

  it('⚠⚠ IGNORE stays live — a lock you cannot leave is a softlock', () => {
    const sink = fresh();
    const { presses, unmount } = mount('cudgel', sink);
    renderer.act(() => { find(presses, 'Ignore the rest').press(); });
    expect(sink.cancelled).toBe(1);
    expect(sink.blocked).toBe(0);
    unmount();
  });

  it('⚠⚠ WITH NO LOCK NOTHING CHANGES — free play is untouched', () => {
    // The regression guard. Every one of these taps is a normal player's tap.
    const sink = fresh();
    const { presses, unmount } = mount(null, sink);
    renderer.act(() => { find(presses, 'Bone Splitter Axe').press(); });
    renderer.act(() => { find(presses, 'brick').press(); });
    renderer.act(() => { find(presses, 'SALVAGE ALL').press(); });
    expect(sink.taken).toEqual(['Bone Splitter Axe']);
    expect(sink.salvaged).toEqual(['brick']);
    expect(sink.sweptSalvage.length).toBe(1);
    expect(sink.blocked).toBe(0);
    unmount();
  });

  it('⚠ the locked rows are DIMMED and announce themselves, not silently inert', () => {
    // ⚠ A control that refuses in silence is the OTA-1164 bug. The refused rows
    // stay rendered, stay tappable, carry a disabled a11y state, and say WHY.
    const sink = fresh();
    const { presses, unmount } = mount('cudgel', sink);
    expect(find(presses, 'Bone Splitter Axe').disabled).toBe(true);
    expect(find(presses, 'Bone Splitter Axe').label).toContain('Not yet');
    expect(find(presses, 'cudgel').disabled).toBe(false);
    // And it is a LIGHTER dim than a spent row: locked comes back, spent does not.
    const mod = src('app', 'components', 'GatherModal.tsx');
    expect(mod).toContain('rowLocked: { opacity: 0.5 }');
    expect(mod).toContain('rowConsumed: { opacity: 0.35 }');
    unmount();
  });

  it('⚠ the card says what the one live line IS', () => {
    const sink = fresh();
    const { presses } = mount('cudgel', sink);
    expect(presses.length).toBeGreaterThan(0);
    const tree = renderer.create(
      <GatherModal
        visible player={null} chips={ROOM.map((noun) => ({ noun }))} leadNouns={[]}
        lockedNoun="cudgel" onBlocked={() => {}}
        onTake={() => {}} onSalvage={() => {}} onTakeAll={() => {}} onSalvageAll={() => {}}
        onInvestigate={() => {}} onCancel={() => {}}
      />,
    );
    const out: string[] = [];
    const walk = (n: unknown): void => {
      if (typeof n === 'string') { out.push(n); return; }
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const node = n as { children?: unknown[] } | null;
      if (node && node.children) node.children.forEach(walk);
    };
    walk(tree.toJSON());
    const text = out.join('|');
    expect(text).toContain('Tap the cudgel.');
    // ...and it does NOT advertise the sweeps it is about to refuse.
    expect(text).not.toContain('clear a whole colour with its button');
    tree.unmount();
  });
});

describe('OTA-1250 — the lock is wired to the beat, in one place', () => {
  it('⚠⚠ the screen passes the SAME prop it merges into the chip list', () => {
    // ⚠ `tutorialProp` was computed inside the chip memo. It now drives the chip
    // AND the lock, so it is hoisted to one const — a second copy would let the
    // picker allow a noun it is not showing, or show one it will not allow.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('const tutorialProp: string | null =');
    expect(screen).toContain('lockedNoun={tutLock ? tutorialProp : null}');
    expect(screen).toContain('{ noun: tutorialProp, consumed: propConsumed }');
    expect((screen.match(/tutBeat === 'cudgel' \? 'cudgel'/g) ?? []).length).toBe(1);
  });

  it('⚠⚠ the refusal BUZZES and speaks — the same feedback the quick row gives', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf('onBlocked={()');
    expect(i).toBeGreaterThan(-1);
    const block = blockAt(screen, 'onBlocked={()');
    expect(block).toContain('Vibration.vibrate([0, 32, 45, 32])'); // the "wrong control" double-pulse
    expect(block).toContain('nudgeTutorialBlocked()');
  });

  it('⚠ the lock only applies while the outpost lockdown is up', () => {
    // Gated on `tutLock`, not on the beat id alone: once the player chooses at
    // explore_or_leave the tutorial is over and the picker is theirs.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('lockedNoun={tutLock ? tutorialProp : null}');
  });
});

describe('OTA-1250 — the prop goes spent when it is taken', () => {
  it('⚠⚠ the chip reads the consumed flag instead of hardcoding false', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).not.toContain('{ noun: tutorialProp, consumed: false }');
    const i = screen.indexOf('const propConsumed = useGameStore(');
    expect(i).toBeGreaterThan(-1);
    const block = blockAt(screen, 'const propConsumed = useGameStore(');
    // Each beat reads ITS OWN prop's flag — the ids differ from the beat ids.
    expect(block).toContain('tutorialPropsConsumed.cudgel');
    expect(block).toContain('tutorialPropsConsumed.vest');
    expect(block).toContain('tutorialPropsConsumed.chestPlate');
  });

  it('⚠⚠ a consumed chip does not render — the five-vest row is gone', () => {
    const sink = fresh();
    const tree = renderer.create(
      <GatherModal
        visible player={null} leadNouns={[]}
        chips={[{ noun: "Mud-Warden's Vest", consumed: true }, { noun: 'brick' }]}
        lockedNoun="Mud-Warden's Vest" onBlocked={() => { sink.blocked += 1; }}
        onTake={(n) => sink.taken.push(n)} onSalvage={() => {}}
        onTakeAll={() => {}} onSalvageAll={() => {}} onInvestigate={() => {}} onCancel={() => {}}
      />,
    );
    const labels = tree.root
      .findAll((x) => typeof x.props?.accessibilityLabel === 'string')
      .map((x) => String(x.props.accessibilityLabel));
    expect(labels.some((l) => /vest/i.test(l))).toBe(false);
    tree.unmount();
  });

  it('⚠⚠ and the store stops claiming a grant it did not make', () => {
    // The five reward lines. `grantTutorialItem` early-returns on an already
    // consumed prop, so the block must check the same flag before it narrates.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf("if (tStep?.id === 'armor' &&");
    expect(i).toBeGreaterThan(-1);
    const block = blockAt(store, "if (tStep?.id === 'armor' &&");
    const guard = block.indexOf('if (get().tutorialPropsConsumed.vest) {');
    const grant = block.indexOf("grantTutorialItem(get, set, 'vest');");
    const reward = block.indexOf("appendLog('reward'");
    expect(guard).toBeGreaterThan(-1);
    // The guard returns BEFORE the grant and before the reward line.
    expect(guard).toBeLessThan(grant);
    expect(guard).toBeLessThan(reward);
    expect(block.slice(guard, grant)).toContain('return;');
    // It still says something — a silent refusal is the bug one layer down.
    // ⚠ OTA-1251 re-worded it: the tap that takes now also WEARS, so "open your
    // pack" described a chore the player no longer has.
    expect(block.slice(guard, grant)).toContain('it is on your back');
  });

  it('⚠ taking the vest now CLOSES the picker — nothing left in it is legal', () => {
    // OTA-1248 kept it open so the room stayed visible. With the lock in place the
    // vest was the only live row, so after the take every control refuses and the
    // next step (open your pack) is behind the modal.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const i = screen.indexOf("if (tutBeat === 'armor' && /vest|warden/i.test(noun)) {");
    expect(i).toBeGreaterThan(-1);
    expect(blockAt(screen, "if (tutBeat === 'armor' && /vest|warden/i.test(noun)) {")).toContain('setTakeOpen(false);');
  });
});
