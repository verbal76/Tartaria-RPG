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
  // ⚠ The annotation is not decoration: without it tsc raises TS7022 ("implicitly
  // has type any... referenced in its own initializer") on the static, and the
  // test-typecheck gate counts that. The other suites carrying this mock silence it
  // with `any`; spelling the shape out keeps the debt from growing at all.
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

// ⚠⚠ OTA-1253 — THE ARMOR BEAT, PLAYED THE WAY THE PICKER PLAYS IT.
//
// Owner, checking the fix landed: *"and we fixed the tutorial? no heading to the
// inventory."*
//
// ⚠⚠ THE COPY WAS ALREADY ASSERTED AND THAT WAS NOT ENOUGH. ota1251 pins that no
// tutorial surface says "open your pack" — true, and it would stay true if the
// beat never advanced at all. **A beat that says the right thing and then stalls
// is the worse bug**, and it is exactly what this run of OTAs kept shipping: the
// OTA-1250 lock was correct and left the player with fourteen refusals because the
// action it permitted lived on another screen.
//
// ⚠ AND THE END-TO-END WALK DOES NOT COVER THIS PATH. `playtestTutorialWalk` drives
// the armor beat by calling `equipItem` directly — a thumb in the INVENTORY, which
// is the route the owner asked us to stop needing. This plays the picker's route:
// the exact two calls `GatherModal`'s onTake makes, in order, against the real
// store, from a real new game.
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

jest.setTimeout(120_000);

const beat = (): string | null => {
  const i = useGameStore.getState().tutorialStep;
  return i === null ? null : TUTORIAL_STEPS[i]?.id ?? null;
};

/** Let the deferred `maybeAdvanceTutorial` inside equipItem run. */
// OTA-1497 — sheet submits now settle for 400ms before running (the iPhone
// modal-wedge fix), so a flush that outruns them reads the world too early.
const flush = async (): Promise<void> => { await new Promise((r) => setTimeout(r, 450)); };

/** Mount the real ExplorationScreen, open the picker, and press the vest row.
 *  ⚠ Two presses and no store calls: the tutorial's claim is "one tap in the
 *  picker", and a test that called the handlers itself would be asserting the
 *  handler I wrote rather than the screen the player touches. */
function pressVestRowInPicker(): void {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const renderer = require('react-test-renderer');
  const { ExplorationScreen } = require('../app/screens/ExplorationScreen');
  /* eslint-enable @typescript-eslint/no-require-imports */
  type Node = { props: Record<string, unknown> };
  let tree!: { root: { findAll(f: (n: Node) => boolean): Node[] }; unmount(): void };
  renderer.act(() => { tree = renderer.create(React.createElement(ExplorationScreen)); });

  const pressable = (match: RegExp): Node => {
    const hit = tree.root.findAll((n) =>
      typeof n.props?.accessibilityLabel === 'string'
      && match.test(String(n.props.accessibilityLabel))
      && typeof n.props?.onPress === 'function');
    expect({ match: String(match), found: hit.length }.found).toBeGreaterThan(0);
    return hit[0]!;
  };

  renderer.act(() => { (pressable(/^take \/ salvage$/i).props.onPress as () => void)(); });
  renderer.act(() => { (pressable(/mud-warden's vest/i).props.onPress as () => void)(); });
  renderer.act(() => { tree.unmount(); });
}

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1253 — the armor beat completes inside the picker', () => {
  let logs: string[] = [];

  beforeAll(async () => {
    await useGameStore.getState().startNewGame({
      name: '', raceId: 'reclaimer', factionId: 'reclaimers_guild',
      motiveId: 'debt', pressure: 'owed',
    } as never);
    if (useGameStore.getState().storyIntro) useGameStore.getState().dismissStoryIntro();

    // Walk to the armor beat the way a player does.
    useGameStore.getState().submitPlayerAction('Walker');            // name
    useGameStore.getState().submitPlayerAction('look around');       // look
    useGameStore.getState().submitPlayerAction('take the cudgel');   // cudgel
    expect(beat()).toBe('armor');
    // ⚠⚠ OTA-1254 — THE CUDGEL IS ACTUALLY IN A HAND. A reclaimer starts with a
    // Rusted Blade (1d6) and the Cudgel is 1d8, so it wins the MAIN hand. The
    // shipped build printed "[equipped]" here and equipped nothing, for every race.
    expect(useGameStore.getState().player?.equipped?.main).toBe('Cudgel');

    const before = useGameStore.getState().gameLog.length;
    // ⚠⚠ THE REAL SCREEN, AND THE REAL ROW. Mount ExplorationScreen at the armor
    // beat, press TAKE / SALVAGE, find the vest line in the rendered picker, and
    // press THAT. Nothing here restates what the handler does — if the screen stops
    // equipping, or the row stops being reachable, this fails.
    pressVestRowInPicker();
    await flush();
    logs = useGameStore.getState().gameLog.slice(before).map((e: { text: string }) => String(e.text));
  });

  it('⚠⚠ ONE TAP ADVANCES IT — the beat does not wait on a trip to the pack', () => {
    expect(beat()).toBe('rope');
  });

  it('⚠⚠ ...and the vest is actually ON, not sitting in the pack', () => {
    // The beat advancing is not the same as the player being dressed. OTA-1248's
    // whole point was that the cudgel auto-equips and armor does not, so "wearing
    // it" is the thing being taught and the thing worth asserting.
    expect(useGameStore.getState().player?.equipped?.chest).toMatch(/vest/i);
  });

  it('⚠⚠ nothing in the feed sends the player to the inventory', () => {
    // ⚠ The owner read the NUDGE, fourteen times, in the run that surfaced this.
    // Whatever the beat says on the way through must not point at another screen.
    const feed = logs.join(' | ').toLowerCase();
    expect(feed).not.toContain('open the pack');
    expect(feed).not.toContain('open your pack');
    expect(feed).not.toContain('does you no good in there');
  });

  it('⚠⚠ the take is narrated ONCE — no reward line without a grant', () => {
    // OTA-1250's five-vest bug, held down end-to-end rather than by source shape.
    const rewards = logs.filter((t) => /Mud-Warden's Vest \(Common\)/i.test(t));
    expect(rewards.length).toBe(1);
    const held = (useGameStore.getState().player?.inventory ?? [])
      .filter((i: { name: string }) => /vest/i.test(i.name))
      .reduce((n: number, i: { quantity?: number }) => n + (i.quantity ?? 1), 0);
    expect(held).toBe(1);
  });

  it('⚠ tapping it again is refused honestly, without pointing at the pack', () => {
    const before = useGameStore.getState().gameLog.length;
    useGameStore.getState().submitPlayerAction("take Mud-Warden's Vest");
    const after = useGameStore.getState().gameLog.slice(before)
      .map((e: { text: string }) => String(e.text)).join(' | ').toLowerCase();
    // The beat has moved on, so this is now an ordinary off-script command and the
    // lockdown restates the CURRENT ask. What matters is that no path re-grants.
    const held = (useGameStore.getState().player?.inventory ?? [])
      .filter((i: { name: string }) => /vest/i.test(i.name))
      .reduce((n: number, i: { quantity?: number }) => n + (i.quantity ?? 1), 0);
    expect(held).toBe(1);
    expect(after).not.toContain('open your pack');
  });
});
