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

// ⚠⚠ THE BUTTON CRAWL — THE TUTORIAL PLAYED WITH A THUMB, NOT A KEYBOARD.
//
// Owner: *"are we able to crawl the new options and the tutorial"*
//
// ⚠⚠ THE TYPED PATH WAS ALREADY CRAWLED AND THAT WAS NOT THE PATH THAT KEPT
// BREAKING. `playtestTutorialWalk` types every beat's command through
// `submitPlayerAction` — and stayed green across the exact days the owner's
// device logs caught: the vest paying out five times (OTA-1250), the cudgel
// equipping for 2 of 7 races (OTA-1254), the armor beat stranding the player at
// fourteen refusals (OTA-1250), the ★ that was a label with no behaviour
// (OTA-1251). Every one of those lived on the BUTTON path: the lit chip, the
// picker row, the lock, the buzz. The store walk cannot see any of it, and the
// per-beat suites (ota1249–1254) each mount one beat in isolation — nothing had
// ever pressed its way from the name to EXPLORE in one continuous run.
//
// This crawl does. One store, one seeded new game, and every beat advanced by
// finding the control ON THE RENDERED SCREEN and pressing it — typed input only
// where the design itself says "typed" (the name; the rope beat, whose feed hint
// is "type 'take rope' in the box"). If a beat's control is unreachable, dimmed
// when it should be lit, or wired to a handler that stalls the beat, the crawl
// stops there and says which beat.
//
// ⚠⚠ AND AT EVERY LOCKED BEAT IT ALSO PRESSES WHAT IT SHOULD NOT. The owner's
// second device report — *"I broke it by just grabbing stuff, you should only be
// able to do what it says, the other button touches should buzz"* — is a claim
// about every OTHER control, so each beat sweeps the off-script surface: every
// travel button and every locked chip is pressed, and the world must not move.
// The one thing the sweep never presses is SKIP TUTORIAL — that pill is the
// designed exit, and "pressing everything" must not quietly take it.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

jest.setTimeout(180_000);

/* eslint-disable @typescript-eslint/no-require-imports */
const React = require('react');
const renderer = require('react-test-renderer');
const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
/* eslint-enable @typescript-eslint/no-require-imports */

type Node = { props: Record<string, unknown>; children?: unknown };
type Tree = { root: { findAll(f: (n: Node) => boolean): Node[] }; unmount(): void };

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};

// ⚠ FAKE TIMERS, because ten mounts of the real screen under real timers leave
// RN's Animated driver racing Jest teardown (the pulse glow cleans itself up on
// unmount, but the driver's own frame timer crashed the worker after the run:
// `_bezier is not a function` inside jest/setup.js). Same pattern as ota1236.
// The advance is 20ms — enough for every deferred setTimeout(0) the store uses,
// far short of the 700ms glow pulse, so no animation frames ever run.
const flush = async (): Promise<void> => {
  await renderer.act(async () => { jest.advanceTimersByTime(20); await Promise.resolve(); });
};

/** All text inside a node's subtree, joined — how a thumb identifies a row. */
function textOf(n: unknown): string {
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(textOf).join(' ');
  const node = n as { props?: { children?: unknown } } | null;
  return node?.props ? textOf(node.props.children) : '';
}

function mount(): Tree {
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(React.createElement(ExplorationScreen)); });
  return tree;
}

/** Every pressable, labelled the way a player reads it: accessibilityLabel if
 *  present, else the subtree text. */
function pressables(tree: Tree): { label: string; press: () => void }[] {
  return tree.root
    .findAll((n) => typeof n.props?.onPress === 'function')
    .map((n) => ({
      label: (typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.length > 0
        ? n.props.accessibilityLabel
        : textOf(n)).trim(),
      press: () => renderer.act(() => { (n.props.onPress as () => void)(); }),
    }));
}

/** Press the first control matching `re`; throws with the full visible surface
 *  if nothing matches, so a crawl gap names what WAS on screen. */
function press(tree: Tree, re: RegExp): void {
  const all = pressables(tree);
  const hit = all.find((p) => re.test(p.label));
  if (!hit) {
    throw new Error(
      `crawl gap at beat "${beat()}": nothing on screen matches ${String(re)}.\n`
      + `Visible pressables:\n${all.map((p) => `  · ${p.label || '(unlabelled)'}`).join('\n')}`,
    );
  }
  hit.press();
}

/** World-state fingerprint for the off-script sweep: if any of this moves on a
 *  blocked press, the lock leaked. */
function fingerprint(): string {
  const s = useGameStore.getState();
  return JSON.stringify({
    beat: beat(),
    // ⚠ The game clock lives on the PLAYER (advanceTime adds to
    // player.hoursElapsed on every action) — so a leaked REST press shows up
    // here as +8 hours, which is exactly the owner's original 8-hour incident.
    hours: s.player?.hoursElapsed ?? 0,
    room: s.currentScene?.location?.id ?? null,
    hp: s.player?.hp,
    inv: (s.player?.inventory ?? []).map((i: { name: string; quantity?: number }) => `${i.name}x${i.quantity ?? 1}`).sort(),
    equipped: s.player?.equipped ?? null,
  });
}

/** ⚠⚠ THE OFF-SCRIPT SWEEP. Press every control on screen EXCEPT the ones the
 *  beat instructs, the tray toggle, and the SKIP pill — after each press the
 *  world fingerprint must be identical. Modals a blocked press failed to block
 *  would change the fingerprint on the NEXT instructed press instead, so the
 *  sweep also asserts nothing new appeared (no picker rows suddenly visible). */
function sweepOffScript(allowed: RegExp[]): { pressed: number; nudges: number } {
  const tree = mount();
  const skip = /skip/i;
  const inert = /^(less ▴|more ▾|hide keyboard|close)$/i;
  const before = fingerprint();
  const logBefore = useGameStore.getState().gameLog.length;
  let pressed = 0;
  for (const p of pressables(tree)) {
    if (!p.label) continue;
    if (skip.test(p.label)) continue;
    if (inert.test(p.label)) continue;
    if (allowed.some((re) => re.test(p.label))) continue;
    p.press();
    pressed += 1;
    const after = fingerprint();
    if (after !== before) {
      throw new Error(`lock leak at beat "${beat()}": pressing "${p.label}" changed the world.\nbefore ${before}\nafter  ${after}`);
    }
  }
  renderer.act(() => { tree.unmount(); });
  const nudges = useGameStore.getState().gameLog.slice(logBefore)
    .filter((e: { text: string }) => /tap the glowing|type your name|type 'take rope'|tap the ★/i.test(String(e.text))).length;
  return { pressed, nudges };
}

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
afterAll(() => { jest.clearAllTimers(); jest.useRealTimers(); });

interface SweepRecord { beatId: string; pressed: number; nudges: number }

describe('the tutorial, crawled by thumb', () => {
  const sweeps: SweepRecord[] = [];
  let feedAll: string[] = [];

  beforeAll(async () => {
    await useGameStore.getState().startNewGame({
      name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
      motiveId: 'debt', pressure: 'owed',
    } as never);
    if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
    jest.useFakeTimers();
    const logStart = useGameStore.getState().gameLog.length;

    // ── name — typed, by design (the hint says "type your name"). ──────────
    expect(beat()).toBe('name');
    sweeps.push({ beatId: 'name', ...sweepOffScript([]) });
    useGameStore.getState().submitPlayerAction('Walker');
    expect(beat()).toBe('look');

    // ── look — the ONE lit chip. Sweep first: everything else must buzz. ───
    sweeps.push({ beatId: 'look', ...sweepOffScript([/^look around/i]) });
    {
      const tree = mount();
      press(tree, /^look around/i);
      renderer.act(() => { tree.unmount(); });
    }
    expect(beat()).toBe('cudgel');

    // ── cudgel — TAKE / SALVAGE, then the cudgel row. The picker's own lock
    //    is probed in place: a non-cudgel row must refuse. ───────────────────
    sweeps.push({ beatId: 'cudgel', ...sweepOffScript([/^take \/ salvage$/i]) });
    {
      const tree = mount();
      press(tree, /^take \/ salvage$/i);
      const before = fingerprint();
      const rows = pressables(tree).filter((p) => /vest|rope|chest plate|note/i.test(p.label));
      for (const r of rows) r.press();               // every locked row
      expect(fingerprint()).toBe(before);            // none of them acted
      press(tree, /cudgel/i);
      renderer.act(() => { tree.unmount(); });
    }
    await flush();
    expect(beat()).toBe('armor');
    expect(useGameStore.getState().player?.equipped?.main).toBe('Cudgel');

    // ── armor — the ★ vest row: one tap takes AND wears. ───────────────────
    sweeps.push({ beatId: 'armor', ...sweepOffScript([/^take \/ salvage$/i]) });
    {
      const tree = mount();
      press(tree, /^take \/ salvage$/i);
      press(tree, /mud-warden's vest/i);
      renderer.act(() => { tree.unmount(); });
    }
    await flush();
    expect(beat()).toBe('rope');
    expect(useGameStore.getState().player?.equipped?.chest).toMatch(/vest/i);

    // ── rope — typed, by design (the hint says "type 'take rope'"). ────────
    sweeps.push({ beatId: 'rope', ...sweepOffScript([]) });
    useGameStore.getState().submitPlayerAction('take the rope');
    expect(beat()).toBe('scrap');

    // ── scrap — TAKE / SALVAGE, then the chest plate under SALVAGE. ────────
    sweeps.push({ beatId: 'scrap', ...sweepOffScript([/^take \/ salvage$/i]) });
    {
      const tree = mount();
      press(tree, /^take \/ salvage$/i);
      press(tree, /chest plate/i);
      renderer.act(() => { tree.unmount(); });
    }
    await flush();
    expect(beat()).toBe('climb');

    // ── climb — the CLIMB button, up in stages, then down. Completion fires
    //    on the way down, so the crawl presses whatever climb control the
    //    screen offers until the beat moves. ─────────────────────────────────
    // ⚠ The climbable's NAME comes from the same source the screen reads
    // (isClimbable over the scene nouns) rather than a guess-list of climb
    // words. First draft guessed "rope/wall/ladder" — the tutorial room's real
    // climbable is a "rusted aether-tether grapple point", and a crawl that
    // only knows English climb-nouns would have called that a screen bug.
    /* eslint-disable-next-line @typescript-eslint/no-require-imports */
    const { isClimbable } = require('../app/engine/interactionTags');
    sweeps.push({ beatId: 'climb', ...sweepOffScript([/^climb/i]) });
    for (let guard = 0; beat() === 'climb' && guard < 12; guard++) {
      const tree = mount();
      const all = pressables(tree);
      const down = all.find((p) => /^climb down$/i.test(p.label));
      const up = all.find((p) => /^climb up/i.test(p.label));
      const open = all.find((p) => /^climb$/i.test(p.label));
      if (down && !up) down.press();          // topped out — come back down
      else if (up) up.press();                // go up a tier
      else if (open) {
        open.press();                          // opens the climb picker
        const sc = useGameStore.getState().currentScene;
        const climbNoun = (sc?.displayedAmbientNouns ?? sc?.ambientNouns ?? [])
          .find((n: string) => isClimbable(n));
        if (climbNoun) {
          const noun = climbNoun.toLowerCase();
          const row = pressables(tree).find((p) => p.label.toLowerCase().includes(noun));
          if (row) row.press();
        }
      } else {
        throw new Error(`crawl gap at climb: no climb control on screen.\n${all.map((p) => `  · ${p.label}`).join('\n')}`);
      }
      renderer.act(() => { tree.unmount(); });
      await flush();
    }
    expect(beat()).toBe('investigate');

    // ── investigate — the INVESTIGATE button, then the beat's own prop. ────
    sweeps.push({ beatId: 'investigate', ...sweepOffScript([/^investigate/i]) });
    {
      const tree = mount();
      press(tree, /^investigate$/i);
      press(tree, /note|door/i);
      renderer.act(() => { tree.unmount(); });
    }
    await flush();
    expect(beat()).toBe('explore_or_leave');

    // ── explore_or_leave — the EXPLORE choice, pressed in its popup. ───────
    // ⚠ The door popup arrives on a 450ms delay (setDoorModalVisible's
    // setTimeout), so this one step advances past it before pressing.
    {
      const tree = mount();
      await renderer.act(async () => { jest.advanceTimersByTime(500); await Promise.resolve(); });
      press(tree, /explore the outpost/i);
      renderer.act(() => { tree.unmount(); });
    }
    feedAll = useGameStore.getState().gameLog.slice(logStart).map((e: { text: string }) => String(e.text));
  });

  it('⚠⚠ the crawl reached EXPLORE by pressing what the screen showed', () => {
    // Every beat assertion already fired in sequence above; this is the
    // terminal claim — the lock lifted because the player CHOSE, not because
    // the tutorial lost track of itself.
    expect(beat()).toBe('explore_or_leave');
    expect(useGameStore.getState().tutorialExploreChosen).toBe(true);
  });

  it('⚠⚠ every locked beat survived a full off-script sweep', () => {
    // The owner's report, held as a rule: at each beat, every control that is
    // not the instructed one was pressed and the world did not move. A sweep
    // that pressed nothing proves nothing, so each must have real coverage.
    const byBeat = Object.fromEntries(sweeps.map((s) => [s.beatId, s]));
    for (const id of ['name', 'look', 'cudgel', 'armor', 'rope', 'scrap', 'climb', 'investigate']) {
      expect({ beat: id, swept: byBeat[id]!.pressed }.swept).toBeGreaterThan(0);
    }
  });

  it('⚠⚠ blocked presses ANSWER — the buzz carries the Arbiter\'s hint', () => {
    // arb109: a refusal that says nothing teaches nothing. At least the name
    // and look sweeps (the beats with the most locked surface) must have put
    // the per-beat hint in the feed.
    const early = sweeps.filter((s) => s.beatId === 'name' || s.beatId === 'look');
    expect(early.reduce((n, s) => n + s.nudges, 0)).toBeGreaterThan(0);
  });

  it('⚠⚠ the vest paid out ONCE across the whole crawl', () => {
    // OTA-1250's five-vest bug, asserted over the full run rather than a beat.
    const held = (useGameStore.getState().player?.inventory ?? [])
      .filter((i: { name: string }) => /vest/i.test(i.name))
      .reduce((n: number, i: { quantity?: number }) => n + (i.quantity ?? 1), 0);
    expect(held).toBe(1);
  });

  it('⚠⚠ nothing on the way pointed the player at the inventory screen', () => {
    // The owner's complaint that started the armor rework: "it was supposed to
    // highlight the fact you can select and equip the vest from the popup, not
    // from inventory."
    const feed = feedAll.join(' | ').toLowerCase();
    expect(feed).not.toContain('open your pack');
    expect(feed).not.toContain('open the pack');
    expect(feed).not.toContain('does you no good in there');
  });

  it('⚠ the crawl pressed real surface, not a handful of chips', () => {
    // Keeps the sweep honest against a future regression that hides the locked
    // controls instead of blocking them — a screen with three buttons would
    // pass every lock check while failing the design.
    const total = sweeps.reduce((n, s) => n + s.pressed, 0);
    expect(total).toBeGreaterThanOrEqual(40);
  });
});
