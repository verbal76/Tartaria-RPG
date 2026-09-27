// Enemy conditional-effect class — Repair 3: player-inflicted enemy control
// (stunned/paralyzed/restrained/prone/slowed/blinded/knockback/pull) is
// mechanically real via `enemyControl.ts`'s `EnemyControlState`, but
// `EnemyPanel.tsx` never read `currentScene.enemyControl` before this repair,
// so a controlled enemy looked exactly like a free one. This proves the
// production door: a currently-controlled enemy now surfaces that fact in
// the expanded popup's ACTIVE EFFECTS section — never as a trait/capability
// chip — using only the existing typed authority in `enemyControl.ts`, with
// no fabricated duration and no raw internal identifiers.
//
// Rendered via react-test-renderer against the REAL `EnemyPanel` /
// `EnemyDetailContent`, following the same production-door pattern already
// established by qol220AcAdjacentEffectIndicator.test.tsx.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: any, _s: any[]) {} },
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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import React from 'react';
import { EnemyPanel, type EnemyView } from '../app/components/EnemyPanel';
import type { EnemyControlState } from '../app/engine/enemyControl';
import type { Enemy } from '../app/engine/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; root: TestInstanceLike };
};
interface TestInstanceLike {
  props: Record<string, unknown>;
  children: unknown[];
  parent: TestInstanceLike | null;
  findAll(p: (n: TestInstanceLike) => boolean): TestInstanceLike[];
  findAllByProps(props: Record<string, unknown>): TestInstanceLike[];
}
const textOf = (n: TestInstanceLike): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestInstanceLike | null)?.children ? walk((x as TestInstanceLike).children) : '');
  return walk(n.children);
};

function foe(over: Partial<Enemy> = {}): Enemy {
  return {
    name: 'Rust Stalker', type: 'Construct', rarity: 'Uncommon', hp: 22,
    attack: 'Road Blade', damage: '1D8+2', traits: [], loot: [],
    ...over,
  } as unknown as Enemy;
}
function view(over: Partial<EnemyView> = {}): EnemyView {
  return { enemy: foe(), currentHp: 22, ...over } as EnemyView;
}
function control(over: Partial<EnemyControlState> = {}): EnemyControlState {
  return { kind: 'stunned', roundsRemaining: 2, sourceName: 'Test Weapon', ...over };
}

async function mount(v: EnemyView) {
  let tree!: { unmount(): void; root: TestInstanceLike };
  await renderer.act(() => {
    tree = renderer.create(
      <EnemyPanel enemies={[v]} activeIndex={0} onSelectActive={() => {}} />,
    ) as unknown as { unmount(): void; root: TestInstanceLike };
  });
  return tree;
}

/** Taps the real card to open the expanded popup — same technique the
 *  accepted QOL #220 suite uses, never a synthetic modal-open shortcut. */
async function open(tree: { root: TestInstanceLike }) {
  const card = tree.root.findAllByProps({ accessibilityRole: 'button' })
    .filter((n) => typeof n.props.onPress === 'function');
  expect(card.length).toBeGreaterThan(0);
  await renderer.act(() => { (card[0]!.props.onPress as () => void)(); });
}

describe('enemy conditional-effect class — Repair 3: enemy control state reaches the panel', () => {
  it('⚠ a currently-stunned enemy (a skip kind) shows itself as stunned and skipping its turn', async () => {
    const tree = await mount(view({ control: control({ kind: 'stunned', roundsRemaining: 2 }) }));
    await open(tree);
    const text = textOf(tree.root);
    expect(text).toContain('STUNNED');
    expect(text).toContain('skips its turn');
    expect(text).toContain('2 rounds remaining');
    tree.unmount();
  });

  it('⚠ a currently-blinded enemy (a hinder kind) shows the real attack penalty, not a skipped turn', async () => {
    const tree = await mount(view({ control: control({ kind: 'blinded', roundsRemaining: 1 }) }));
    await open(tree);
    const text = textOf(tree.root);
    expect(text).toContain('BLINDED');
    expect(text).toContain('-4 to its attack');
    expect(text).not.toContain('skips its turn');
    // Singular round, correctly pluralized.
    expect(text).toContain('1 round remaining');
    expect(text).not.toContain('1 rounds remaining');
    tree.unmount();
  });

  it('every hinder kind reports controlAttackPenalty\'s real number, never a made-up one', async () => {
    const cases: Array<[EnemyControlState['kind'], string]> = [
      ['prone', '-2 to its attack'],
      ['knockback', '-2 to its attack'],
      ['pull', '-2 to its attack'],
      ['slowed', '-2 to its attack'],
    ];
    for (const [kind, expected] of cases) {
      const tree = await mount(view({ control: control({ kind, roundsRemaining: 3 }) }));
      await open(tree);
      expect(textOf(tree.root)).toContain(expected);
      tree.unmount();
    }
  });

  it('every skip kind (stunned/paralyzed/restrained) says the swing is gone, not a penalty number', async () => {
    for (const kind of ['stunned', 'paralyzed', 'restrained'] as const) {
      const tree = await mount(view({ control: control({ kind, roundsRemaining: 1 }) }));
      await open(tree);
      const text = textOf(tree.root);
      expect(text).toContain('skips its turn');
      expect(text).not.toMatch(/-\d to its attack/);
      tree.unmount();
    }
  });

  it('an uncontrolled enemy shows no control state at all', async () => {
    const tree = await mount(view({ control: null }));
    await open(tree);
    const text = textOf(tree.root);
    expect(text).not.toContain('skips its turn');
    expect(text).not.toContain('rounds remaining');
    expect(text).not.toContain('round remaining');
    tree.unmount();
  });

  it('⚠ an EXPIRED control (roundsRemaining <= 0) is not fabricated as still active', async () => {
    const tree = await mount(view({ control: control({ kind: 'slowed', roundsRemaining: 0 }) }));
    await open(tree);
    const text = textOf(tree.root);
    expect(text).not.toContain('SLOWED');
    expect(text).not.toContain('rounds remaining');
    tree.unmount();
  });

  it('a controlled enemy with no OTHER active statuses still gets an ACTIVE EFFECTS section', async () => {
    // Before this repair, EnemyDetailContent only opened the section when
    // view.statuses was non-empty — a control-only enemy would render
    // NOTHING, silently hiding a real, mechanically-active effect.
    const tree = await mount(view({ statuses: [], control: control({ kind: 'restrained', roundsRemaining: 4 }) }));
    await open(tree);
    const text = textOf(tree.root);
    expect(text).toContain('ACTIVE EFFECTS');
    expect(text).toContain('RESTRAINED');
    tree.unmount();
  });

  it('⚠ no raw ControlKind identifier leaks — the label is always the human phrase, not the code', async () => {
    // 'knockback' and 'pull' are the sharpest cases: controlLabel() renames
    // them entirely ("driven back" / "dragged in"), so a leak of the raw
    // kind would be a distinctly different, wrong-looking word on screen.
    for (const kind of ['knockback', 'pull'] as const) {
      const tree = await mount(view({ control: control({ kind, roundsRemaining: 2 }) }));
      await open(tree);
      const text = textOf(tree.root).toUpperCase();
      expect(text).not.toContain(kind.toUpperCase());
      tree.unmount();
    }
  });

  it('brace/internal state is never rendered — EnemyView carries no brace field for the panel to misuse', async () => {
    const tree = await mount(view({ control: null }));
    await open(tree);
    const text = textOf(tree.root).toLowerCase();
    expect(text).not.toContain('brace');
  });
});
