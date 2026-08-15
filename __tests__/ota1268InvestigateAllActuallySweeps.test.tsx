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

// ⚠⚠ OTA-1268 — INVESTIGATE ALL WAS RESOLVING EXACTLY ONE NOUN, AND THE TEST
// THAT "COVERED" IT COULD NOT HAVE NOTICED.
//
// Owner, from the 4.29.190 device session: *"also the investigations when you
// hit investigate all were supposed to show on the screen one at a time with a
// second or two in between"*.
//
// ⚠⚠ THE 1263 PACING SHIPPED WITH A SELF-ABORT. Its player-interruption guard
// compared `lastPlayerActionAt` against the stamp from BEFORE the sweep began —
// but `submitPlayerAction` stamps that field on EVERY submit, including the
// sweep's own. Step one ran and moved the stamp; step two read "the player
// acted" and quit. One noun resolved, the rest silently dropped.
//
// ⚠⚠ AND THIS IS THE THIRD SHIPPED-INERT FIX OF THE SESSION (N2's wrong label,
// the negation fix's near-miss with the Qwen fallback, now this) — all three
// share one shape: **the covering test pinned the SOURCE, not the BEHAVIOUR.**
// ota1263 asserted `setTimeout(step, INVESTIGATE_ALL_GAP_MS)` exists and the
// abort line exists — both true, both useless: the abort line existing IS the
// bug. This suite runs the real screen and counts what actually resolves.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

jest.setTimeout(120_000);

/* eslint-disable @typescript-eslint/no-require-imports */
const React = require('react');
const renderer = require('react-test-renderer');
const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
/* eslint-enable @typescript-eslint/no-require-imports */

type Node = { props: Record<string, unknown> };
type Tree = { root: { findAll(f: (n: Node) => boolean): Node[] }; unmount(): void };

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

function press(tree: Tree, re: RegExp): void {
  const all = tree.root.findAll((n) => typeof n.props?.onPress === 'function');
  const hit = all.find((n) => {
    const label = (typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.length > 0
      ? n.props.accessibilityLabel : textOf(n)).trim();
    return re.test(label);
  });
  if (!hit) {
    const labels = all.map((n) => (typeof n.props.accessibilityLabel === 'string'
      ? n.props.accessibilityLabel : textOf(n)).trim()).filter(Boolean);
    throw new Error(`nothing matches ${String(re)} — visible: ${labels.join(' | ')}`);
  }
  renderer.act(() => { (hit.props.onPress as () => void)(); });
}

/** Player-channel investigate submissions since `from` — what the feed shows. */
const investigates = (from: number): string[] =>
  useGameStore.getState().gameLog.slice(from)
    .filter((e: { channel: string; text: string }) => e.channel === 'player' && /^investigate /.test(String(e.text)))
    .map((e: { text: string }) => String(e.text));

const tick = async (ms: number): Promise<void> => {
  await renderer.act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
};

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });
afterAll(() => { jest.clearAllTimers(); jest.useRealTimers(); });

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};

/** Open the search modal and press INVESTIGATE ALL; returns the log watermark
 *  taken just before the press. */
function pressInvestigateAll(tree: Tree): number {
  press(tree, /^investigate$/i);
  const from = useGameStore.getState().gameLog.length;
  press(tree, /^Investigate all \d+ surfaces$/);
  return from;
}

describe('OTA-1268 — INVESTIGATE ALL, run for real', () => {
  beforeAll(async () => {
    await useGameStore.getState().startNewGame({
      name: '', raceId: 'aetherborn', factionId: 'eternal_dynasty',
      motiveId: 'debt', pressure: 'owed',
    } as never);
    if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();
    const sub = (c: string): void => useGameStore.getState().submitPlayerAction(c);
    sub('Frank'); sub('look around'); sub('take the cudgel');
    sub("take the Mud-Warden's Vest");
    useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
    await new Promise((r) => setTimeout(r, 0));
    sub('take the rope'); sub('scrap the chest plate');
    for (let i = 0; i < 8 && beat() === 'climb'; i++) {
      sub(useGameStore.getState().currentScene?.elevatedOn ? 'climb down' : 'climb');
    }
    sub('investigate door');
    useGameStore.getState().chooseTutorialExplore();
    jest.useFakeTimers();
  });

  it('⚠⚠ THE OWNER\'S BUG: every surface resolves, one per beat — not one, not a wall', async () => {
    const tree = mount();
    const from = pressInvestigateAll(tree);
    await tick(0);
    const first = investigates(from).length;
    expect(first).toBe(1);                       // one immediately…
    await tick(2_300);
    expect(investigates(from).length).toBe(2);   // …one more per gap —
    // ⚠ THIS is the assertion 1263 lacked: under the shipped bug the count
    // stays 1 forever, because the sweep read its own submit as the player.
    let last = 2;
    for (let guard = 0; guard < 12; guard++) {
      await tick(2_300);
      const now = investigates(from).length;
      if (now === last) break;                   // sweep finished
      expect(now).toBe(last + 1);                // strictly one per beat
      last = now;
    }
    expect(last).toBeGreaterThanOrEqual(3);      // a real multi-surface sweep
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠ a REAL player action between beats still stops it — the guard survives the fix', async () => {
    // Fresh room — the previous sweep consumed this one's surfaces, and the
    // INVESTIGATE ALL button honestly hides below two actionable chips.
    useGameStore.getState().submitPlayerAction('go north');
    const tree = mount();
    const from = pressInvestigateAll(tree);
    await tick(0);
    expect(investigates(from).length).toBe(1);
    // ⚠ Move the (fake) clock a hair first: with time frozen, the player's
    // stamp would land in the SAME millisecond as the sweep's own submit and
    // the watermark could not tell them apart. On device they are seconds
    // apart — 50ms stays well under the 2.2s gap, so no step fires.
    await tick(50);
    // The player does something of their own mid-sweep.
    useGameStore.getState().submitPlayerAction('look around');
    const before = investigates(from).length;
    await tick(2_300);
    await tick(2_300);
    expect(investigates(from).length).toBe(before); // nothing queued over them
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠⚠ an enemy on the board stops it — OTA-1236\'s rule, still alive', async () => {
    useGameStore.getState().submitPlayerAction('go north'); // another fresh room
    const tree = mount();
    const from = pressInvestigateAll(tree);
    await tick(0);
    expect(investigates(from).length).toBe(1);
    const scene = useGameStore.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene,
        enemies: [{ id: 'zz', name: 'Mud Wasp', hp: 5, hpMax: 5, ac: 10, attack: 1, damageDice: '1d4', type: 'Animal', rarity: 'Common' } as never],
      },
    });
    const before = investigates(from).length;
    await tick(2_300);
    await tick(2_300);
    expect(investigates(from).length).toBe(before);
    useGameStore.setState({ currentScene: { ...useGameStore.getState().currentScene!, enemies: [] } });
    renderer.act(() => { tree.unmount(); });
  });

  it('⚠ the gap is still in the owner\'s asked-for range', () => {
    // "maybe 2+3 seconds" — the pacing constant survives the rewrite.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('path');
    const screen = readFileSync(join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
    const m = /const INVESTIGATE_ALL_GAP_MS = ([\d_]+);/.exec(screen);
    expect(m).not.toBeNull();
    const ms = Number(m![1]!.replace(/_/g, ''));
    expect(ms).toBeGreaterThanOrEqual(2_000);
    expect(ms).toBeLessThanOrEqual(3_000);
  });
});
