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

// ⚠⚠ OTA-1270 — "ACT DOESN'T SEE ANY TEXT."
//
// Owner, typed into the game: *"when I tap on the text bar it doesn't always go
// above the keyboard, and when it does I have to tap it again for it to type in
// it and then I have to hit enter because act doesn't see any text"*.
//
// ⚠⚠ THE THIRD CLAUSE IS A STATE BUG AND THIS SUITE OWNS IT. Two text fields
// exist on the exploration screen — the in-flow InputBox and the floating
// KeyboardInputBar that rides above the soft keyboard — and each held a PRIVATE
// useState copy of the draft, each with its own ACT reading only its own copy.
// Type into one, tap the other's ACT: `if (!trimmed) return;` — silence. The
// player's workaround (hit enter instead) worked because enter submits from the
// field that actually held the text.
//
// One draft now (gameStore.explorationDraft); both fields render it; either ACT
// submits it; backing the floating bar out no longer wipes what was typed.
//
// ⚠ The first two clauses (bar not always lifting; focus needing a second tap)
// are native keyboard behaviour with three generations of mitigations already
// in the bar — they need DEVICE verification, and this suite makes no claim
// about them.
import { useGameStore } from '../app/state/gameStore';

jest.setTimeout(60_000);

/* eslint-disable @typescript-eslint/no-require-imports */
const React = require('react');
const renderer = require('react-test-renderer');
const { InputBox } = require('../app/components/InputBox');
const { KeyboardInputBar } = require('../app/components/KeyboardInputBar');
const { TextInput } = require('react-native');
/* eslint-enable @typescript-eslint/no-require-imports */

type Node = { props: Record<string, unknown>; type?: unknown };
type Tree = { root: { findAll(f: (n: Node) => boolean): Node[] }; unmount(): void };

function textOf(n: unknown): string {
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(textOf).join(' ');
  const node = n as { props?: { children?: unknown } } | null;
  return node?.props ? textOf(node.props.children) : '';
}

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

const submitted: string[] = [];

function mountInputBox(): Tree {
  let tree!: Tree;
  renderer.act(() => {
    tree = renderer.create(React.createElement(InputBox, {
      onSubmit: (s: string) => submitted.push(s),
      onOpenInventory: () => {}, onOpenSearch: () => {}, onOpenCrafting: () => {},
      onOpenApproach: () => {}, onOpenPickpocket: () => {}, onOpenMissions: () => {},
      onOpenSalvage: () => {}, onOpenTake: () => {}, onOpenClimb: () => {},
      onOpenTorch: () => {}, hasTorch: false, onOpenMap: () => {},
      inCombat: false, inventory: [],
    }));
  });
  return tree;
}

function mountBar(): Tree {
  let tree!: Tree;
  renderer.act(() => { tree = renderer.create(React.createElement(KeyboardInputBar)); });
  return tree;
}

const field = (tree: Tree): Node => {
  const inputs = tree.root.findAll((n) => n.type === TextInput && typeof n.props.onChangeText === 'function');
  expect(inputs.length).toBeGreaterThan(0);
  return inputs[0]!;
};

const pressAct = (tree: Tree): void => {
  const act = tree.root.findAll((n) =>
    typeof n.props?.onPress === 'function' && /^act$/i.test(textOf(n).trim()));
  expect(act.length).toBeGreaterThan(0);
  renderer.act(() => { (act[0]!.props.onPress as () => void)(); });
};

beforeEach(() => {
  submitted.length = 0;
  useGameStore.setState({
    explorationDraft: '',
    explorationInputActive: true,
    inputModalOpen: false,
    currentScreen: 'exploration',
  } as never);
});

describe('OTA-1270 — one draft, either ACT', () => {
  it('⚠⚠ THE OWNER\'S BUG: typed in the floating bar, tapped the in-flow ACT — it submits', () => {
    const bar = mountBar();
    renderer.act(() => { (field(bar).props.onChangeText as (t: string) => void)('take the rope'); });
    const box = mountInputBox();
    pressAct(box);                          // the OTHER field's button
    // Before the fix this was the silent `if (!trimmed) return;` — the in-flow
    // ACT read its own empty useState copy and did nothing.
    expect(submitted).toEqual(['take the rope']);
    renderer.act(() => { bar.unmount(); box.unmount(); });
  });

  it('⚠⚠ in-flow box → floating bar\'s ACT: the store receives the command', () => {
    // The bar submits straight to the store; with no live game the real
    // handler would no-op, so the store action is spied for this case.
    const real = useGameStore.getState().submitPlayerAction;
    const spy = jest.fn();
    useGameStore.setState({ submitPlayerAction: spy } as never);
    try {
      const box = mountInputBox();
      renderer.act(() => { (field(box).props.onChangeText as (t: string) => void)('look around'); });
      const bar = mountBar();
      pressAct(bar);
      expect(spy).toHaveBeenCalledWith('look around');
      renderer.act(() => { box.unmount(); bar.unmount(); });
    } finally {
      useGameStore.setState({ submitPlayerAction: real } as never);
    }
  });

  it('⚠⚠ both fields RENDER the same draft — no second copy to drift', () => {
    const box = mountInputBox();
    const bar = mountBar();
    renderer.act(() => { (field(bar).props.onChangeText as (t: string) => void)('salvage the pot'); });
    expect(field(box).props.value).toBe('salvage the pot');
    expect(field(bar).props.value).toBe('salvage the pot');
    renderer.act(() => { box.unmount(); bar.unmount(); });
  });

  it('⚠⚠ backing the bar out KEEPS the draft — closing the keyboard no longer eats the text', () => {
    const bar = mountBar();
    renderer.act(() => { (field(bar).props.onChangeText as (t: string) => void)('give the locket to Yulka'); });
    renderer.act(() => { useGameStore.getState().setExplorationInputActive(false); });
    // The bar is gone; the draft is not.
    expect(useGameStore.getState().explorationDraft).toBe('give the locket to Yulka');
    renderer.act(() => { bar.unmount(); });
  });

  it('⚠ submitting CLEARS the shared draft in both fields', () => {
    const box = mountInputBox();
    renderer.act(() => { (field(box).props.onChangeText as (t: string) => void)('rest'); });
    pressAct(box);
    expect(submitted).toEqual(['rest']);
    expect(useGameStore.getState().explorationDraft).toBe('');
    renderer.act(() => { box.unmount(); });
  });
});
