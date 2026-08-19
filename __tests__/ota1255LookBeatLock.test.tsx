jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// ⚠ Native modules the store pulls in transitively. Mocked, not stubbed out — the
// point is to mount the REAL component, not a hollow stand-in. NO `{ virtual: true }`
// on a module that genuinely exists; a virtual mock holds only while the suite runs
// alone and then dies in the full run on the real binding.
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));
// ⚠ TutorialTarget runs an Animated.loop on the pulsing beat, and an RN timing
// loop outlives Jest's teardown ("_bezier is not a function" as the module graph
// is torn down under it). Reduce-motion is a REAL shipped path — the glow holds
// static — so this exercises production code rather than stubbing the wrapper out.
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

// ⚠⚠ OTA-1255 — "IT SHOULD BE THE ONLY BUTTON HIGHLIGHTED."
//
// Ported from golem OTA-1249 at the owner's direction — *"the look around you
// button fix can go to Hal"* — while the picker work it was found alongside stays
// golem-only. HAL had the identical bug.
//
// Owner, describing the opening he wants: *"in the tutorial you should type your
// name, then get the prompt for look around you, and it should be the only button
// highlighted."*
//
// ⚠⚠ (1) THE LOOK BEAT HAD NO LOCKDOWN AT ALL. The outpost tutorial dims every
// control except the one the current beat asks for — and `look` was the single
// beat between `name` and `explore_or_leave` missing from the lock list. So the
// beat that says "tap LOOK AROUND YOU" shipped with LOOK lit green and eleven
// other live buttons beside it: travel, EXIT, investigate, take, salvage, rest,
// torch, craft, inventory, missions, map, ask. Not the only one highlighted — the
// only one that happened to be green.
//
// ⚠⚠ (2) AND THE LIST EXISTED IN THREE PLACES. Identical literal arrays in
// InputBox, in ExplorationScreen, and inside the store's typed-input gate. A rule
// computed three times drifts; keeping three pins in a test is a standing tax, not
// a fix. One export, three readers, and the assertions below DERIVE the contents
// from TUTORIAL_STEPS rather than restating them.
//
// ⚠ ADDING A BEAT TO THE LOCK LIST IS HALF A CHANGE. The lock refuses everything
// that is not the beat's own instructed control, so a beat added without its
// allowance refuses the very thing it asks for — the typed twin of a greyed-out
// button. `look` gets its own.
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
import { TUTORIAL_STEPS, TUT_LOCK_BEATS } from '../app/components/tutorialSteps';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

const ids = (): string[] => TUTORIAL_STEPS.map((s) => s.id ?? '');

describe('OTA-1255 — the lockdown covers the whole outpost, in one place', () => {
  it('⚠⚠ MEASURED: every beat from `name` through `explore_or_leave` is locked', () => {
    // Derived from the step list itself, not re-typed. A future beat inserted
    // anywhere in the outpost span fails this until it is added — which is
    // exactly how `look` slipped through.
    const all = ids();
    const from = all.indexOf('name');
    const to = all.indexOf('explore_or_leave');
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const span = all.slice(from, to + 1);
    for (const id of span) expect(TUT_LOCK_BEATS).toContain(id);
    // ...and it locks nothing OUTSIDE that span (main_quest / pick_city are
    // post-choice; locking them would dim the map on the way out).
    for (const id of TUT_LOCK_BEATS) expect(span).toContain(id);
  });

  it('⚠⚠ `look` is in it — the specific hole the owner walked into', () => {
    expect(TUT_LOCK_BEATS).toContain('look');
  });

  it('⚠⚠ ONE array, three readers — no hand-written copies left', () => {
    const files = [
      ['app', 'components', 'InputBox.tsx'],
      ['app', 'screens', 'ExplorationScreen.tsx'],
      ['app', 'state', 'gameStore.ts'],
    ];
    for (const f of files) {
      const text = src(...f);
      expect(text).toContain('TUT_LOCK_BEATS');
      // The tell-tale of a re-typed list: the beat names as a literal array.
      expect(text).not.toMatch(/\[\s*'name',\s*'/);
      expect(text).not.toMatch(/'scrap',\s*'climb',\s*'investigate',\s*'explore_or_leave'\s*\]/);
    }
    // The one definition.
    expect(src('app', 'components', 'tutorialSteps.ts')).toContain('export const TUT_LOCK_BEATS');
  });

  it('⚠⚠ every locked beat can still DO its own thing — the lock is not a wall', () => {
    // The typed gate refuses anything the beat does not ask for. A beat in the
    // list needs either a dedicated intercept above the gate (name, cudgel, rope,
    // scrap, investigate) or a `beatAllows` branch — otherwise adding it to the
    // list SOFTLOCKS that beat.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const beatAllows =');
    expect(i).toBeGreaterThan(-1);
    const allows = store.slice(i, i + 360);
    expect(allows).toContain("lockBeatId === 'look' && isLookCmd");
    expect(allows).toContain("lockBeatId === 'climb' && isClimbCmd");
    expect(allows).toContain("lockBeatId === 'explore_or_leave' && isLeaveCmd");
    // ⚠ The self-defence escape stays: a spawn during a beat must never leave the
    // player unable to swing (OTA-1063).
    expect(allows).toContain('enemiesLive && isCombatCmd');
  });

  it('⚠ the beat the lock names has a nudge line, so a refusal is never silent', () => {
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const hint: Record<string, string> = {');
    const block = store.slice(i, store.indexOf('};', i));
    for (const id of TUT_LOCK_BEATS) expect(block).toContain(`${id}:`);
  });
});

describe('OTA-1255 — RENDERED: one lit button on the look beat', () => {
  /** Mount the REAL InputBox on a given beat and read back every button's
   *  screen-reader disabled state — the same flag `blocked` drives the grey
   *  fill from, so this is what the player sees, not a source pin. */
  function buttons(beatId: string): Array<{ label: string; disabled: boolean }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('../app/state/gameStore');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { InputBox } = require('../app/components/InputBox');
    useGameStore.setState({ tutorialStep: ids().indexOf(beatId), tutorialExploreChosen: false } as never);
    const noop = (): void => {};
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        <InputBox
          onSubmit={noop} onOpenInventory={noop} onOpenSearch={noop} onOpenCrafting={noop}
          onOpenApproach={noop} onOpenPickpocket={noop} onOpenAskArbiter={noop} onOpenMissions={noop}
          onOpenSalvage={noop} onOpenTake={noop} onOpenClimb={noop} onOpenTorch={noop}
          onClimbUp={noop} onClimbDown={noop} onOpenMap={noop}
          inCombat={false} equippedMain={null} equippedOff={null} inventory={[]}
        />,
      );
    });
    const seen = new Map<string, boolean>();
    for (const n of tree.root.findAll((x) => typeof x.props?.accessibilityLabel === 'string'
      && typeof (x.props as { accessibilityState?: { disabled?: boolean } }).accessibilityState?.disabled === 'boolean')) {
      const label = String(n.props.accessibilityLabel).toLowerCase();
      const disabled = !!(n.props as { accessibilityState: { disabled: boolean } }).accessibilityState.disabled;
      // A TouchableOpacity appears once per layer in the rendered tree; if any
      // layer says live, the button is live.
      seen.set(label, (seen.get(label) ?? true) && disabled);
    }
    renderer.act(() => { tree.unmount(); });
    return [...seen].map(([label, disabled]) => ({ label, disabled }));
  }

  it('⚠⚠ LOOK AROUND YOU is live and everything else is dimmed', () => {
    const btns = buttons('look');
    const look = btns.filter((b) => b.label.includes('look around'));
    expect(look.length).toBeGreaterThan(0);
    for (const b of look) expect(b.disabled).toBe(false);
    // ⚠ THE ASSERTION THAT WOULD HAVE CAUGHT THE SHIPPED BUG: nothing else in the
    // row is tappable. Before this, every one of these was live.
    const others = btns.filter((b) => !b.label.includes('look around'));
    expect(others.length).toBeGreaterThan(8); // the row really is populated
    for (const b of others) expect(b.disabled).toBe(true);
    // Named explicitly, because "everything else" is only convincing if the
    // list is recognisable: these were all live during the look beat.
    for (const l of ['rest', 'investigate', 'craft', 'inventory', 'north']) {
      expect(btns.find((b) => b.label === l)?.disabled).toBe(true);
    }
  });

  it('⚠⚠ ...and REST, its own row-mate, is dimmed — `blocked` is per button, not per row', () => {
    // The two direct quick actions share one map. Blocking the map would dim
    // LOOK too; exempting the map would leave REST live. Only the beat's own
    // submit is exempt.
    const rest = buttons('look').filter((b) => b.label === 'rest');
    expect(rest.length).toBe(1);
    expect(rest[0]!.disabled).toBe(true);
  });

  it('⚠⚠ the exemption is TONE-AWARE — a blocked button throws its green away', () => {
    // QuickBtn resolves `blocked ? undefined : tone`, so a button that is both
    // instructed and locked renders GREY. That is precisely what would have
    // shipped: the beat lights LOOK green, the lock discards it, and the player
    // is told to tap a control the same frame has greyed out.
    const input = src('app', 'components', 'InputBox.tsx');
    expect(input).toContain('const resolvedTone: QuickBtnTone | undefined = blocked');
    expect(input).toContain('blocked={lookBlocked(qa.submit)}');
    expect(input).not.toMatch(/tone=\{currentBeatId === 'look'[\s\S]{0,120}blocked=\{tutLock\}/);
  });

  it('⚠ a beat with no button of its own dims the whole row', () => {
    // `name` is typed. Nothing in the quick row should be live during it —
    // the check that the exemption did not become a blanket hole.
    const btns = buttons('name').filter((b) => b.label.includes('look around') || b.label === 'rest');
    expect(btns.length).toBeGreaterThan(0);
    for (const b of btns) expect(b.disabled).toBe(true);
  });
});
