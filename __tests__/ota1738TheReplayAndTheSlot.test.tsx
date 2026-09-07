/**
 * OTA-1738 — THE REPLAY AND THE SLOT, RENDERED (task list 4E91C7).
 *
 * Three surfaces that only prove themselves on a real render tree:
 *
 *   1. `useTeachingSlot` — one optional card per beat. Two eligible unseen
 *      candidates yield ONE id; dismissing it hands the beat to the next; an
 *      ineligible first candidate is skipped; the global switch silences all.
 *   2. GuidanceScreen — Settings → GUIDANCE → REPLAY TEACHING. Lists the core
 *      beats, the screen tour, every first-use card with its seen mark, and
 *      the Action Reference, with tips OFF, and writes no hint flag doing it.
 *   3. TutorialOverlay — the SKIP pill draws on `look`, `armor`, `screen_pick`
 *      (the three beats the pill's own list used to miss) and on nothing that
 *      is not a locked beat.
 */
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
jest.mock('../app/state/accessibility', () => ({
  ...jest.requireActual('../app/state/accessibility'),
  useReduceMotion: () => true,
}));

import React from 'react';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameStore } from '../app/state/gameStore';
import { TUTORIAL_STEPS, TUTORIAL_DOCS_FULL, TUT_LOCK_BEATS } from '../app/components/tutorialSteps';
import { ALL_TEACHINGS, TEACHINGS } from '../app/components/teachingRegistry';
import {
  useTeachingSlot, useFirstTimeHint, setHintsDisabled, resetAllFirstTimeHints, markHintSeen,
} from '../app/components/useFirstTimeHint';
import { GuidanceScreen } from '../app/screens/GuidanceScreen';
import { TutorialOverlay } from '../app/components/TutorialOverlay';
import { CombatPrimerModal } from '../app/components/CombatPrimerModal';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { toJSON(): unknown; root: TestNode; unmount(): void };
};
interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  children: Array<TestNode | string>;
  findAll(pred: (n: TestNode) => boolean): TestNode[];
}
/** Host nodes only — react-test-renderer's findAll also returns the composite
 *  element that carries the same props, which would double every count. */
const host = (n: TestNode): boolean => typeof n.type === 'string' && !!n.props;
/** The composite node that owns the press handler (host nodes carry responder props, not onPress). */
const pressable = (root: TestNode, label: string): TestNode =>
  root.findAll((n) => !!n.props && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0]!;
const _mounted: Array<{ unmount(): void }> = [];
const mount = (el: React.ReactElement) => { const t = renderer.create(el); _mounted.push(t); return t; };
afterEach(() => {
  const roots = _mounted.splice(0);
  renderer.act(() => { for (const r of roots) { try { r.unmount(); } catch { /* gone */ } } });
});
const flush = async () => { await renderer.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const texts = (root: TestNode): string[] =>
  root.findAll((n) => host(n) && n.type === 'Text' && typeof n.props.children === 'string')
    .map((n) => n.props.children as string);
const allText = (root: TestNode): string => {
  const out: string[] = [];
  const walk = (n: TestNode | string) => {
    if (typeof n === 'string') { out.push(n); return; }
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return out.join('\n');
};
const hintKeys = async () => (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('tartaria.hint.v1.'));

jest.setTimeout(120_000);
beforeAll(() => { console.log = () => {}; console.warn = () => {}; });
beforeEach(async () => { await resetAllFirstTimeHints(); await setHintsDisabled(false); });

// ─────────────────────────────────────────────────────────────────────────────
function SlotProbe({ candidates }: { candidates: Array<{ id: string; when: boolean }> }) {
  const id = useTeachingSlot(candidates);
  return <Text testID="slot">{id ?? 'none'}</Text>;
}
const slotValue = (root: TestNode) => root.findAll((n) => host(n) && n.props.testID === 'slot')[0]!.props.children as string;

describe('OTA-1738 — useTeachingSlot: one optional surface per beat', () => {
  it('⚠⚠⚠ two eligible unseen cards → ONE id; dismiss it → the next takes the beat', async () => {
    const cands = [{ id: 'slot_a', when: true }, { id: 'slot_b', when: true }];
    let t = mount(<SlotProbe candidates={cands} />);
    await flush();
    expect(slotValue(t.root)).toBe('slot_a');
    markHintSeen('slot_a');                       // the card's dismiss writes this same key
    renderer.act(() => t.unmount());
    t = mount(<SlotProbe candidates={cands} />);
    await flush();
    expect(slotValue(t.root)).toBe('slot_b');
    markHintSeen('slot_b');
    renderer.act(() => t.unmount());
    t = mount(<SlotProbe candidates={cands} />);
    await flush();
    expect(slotValue(t.root)).toBe('none');
  });

  it('⚠⚠ an ineligible card is skipped, whatever its priority', async () => {
    const t = mount(<SlotProbe candidates={[{ id: 'slot_a', when: false }, { id: 'slot_b', when: true }]} />);
    await flush();
    expect(slotValue(t.root)).toBe('slot_b');
  });

  it('⚠⚠ the global switch silences every candidate', async () => {
    await setHintsDisabled(true);
    const t = mount(<SlotProbe candidates={[{ id: 'slot_a', when: true }, { id: 'slot_b', when: true }]} />);
    await flush();
    expect(slotValue(t.root)).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
function PrimerProbe() {
  const h = useFirstTimeHint(TEACHINGS.combat_primer_v1.id);
  return <Text testID="primer">{h.shouldShow === undefined ? 'pending' : h.shouldShow ? 'show' : 'hidden'}</Text>;
}
describe('OTA-1738 — the combat primer answers to the switch and to the reset', () => {
  it('⚠⚠⚠ "Turn off tips" inside the primer hides the primer itself for the install', async () => {
    const onClose = jest.fn();
    const t = mount(<><CombatPrimerModal visible enemyName="Silt Raider" onClose={onClose} /><PrimerProbe /></>);
    await flush();
    const probe = () => t.root.findAll((n) => host(n) && n.props.testID === 'primer')[0]!.props.children as string;
    expect(probe()).toBe('show');
    const off = pressable(t.root, 'Turn off all tips and close this guide');
    await renderer.act(async () => { (off.props.onPress as () => void)(); });
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(probe()).toBe('hidden');
    // SHOW ALL TIPS AGAIN + the switch back on: the primer is due again.
    await setHintsDisabled(false);
    await resetAllFirstTimeHints();
    renderer.act(() => t.unmount());
    const t2 = mount(<PrimerProbe />);
    await flush();
    expect(t2.root.findAll((n) => host(n) && n.props.testID === 'primer')[0]!.props.children).toBe('show');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — GuidanceScreen: everything the game taught, read-only, with tips off', () => {
  const tab = (root: TestNode, label: string) => pressable(root, label);
  const press = async (n: TestNode) => { await renderer.act(async () => { (n.props.onPress as () => void)(); }); await flush(); };

  it('⚠⚠⚠ CORE lists the outpost beats and the screen tour', async () => {
    await setHintsDisabled(true);                 // the replay does not care
    const t = mount(<GuidanceScreen />);
    await flush();
    const beats = t.root.findAll((n) => host(n) && typeof n.props.accessibilityLabel === 'string' && (n.props.accessibilityLabel as string).startsWith('Tutorial beat: '));
    expect(beats.length).toBe(TUTORIAL_STEPS.filter((st) => !!st.title).length);
    const tour = t.root.findAll((n) => host(n) && typeof n.props.accessibilityLabel === 'string' && (n.props.accessibilityLabel as string).startsWith('Screen tour: '));
    expect(tour.length).toBe(TUTORIAL_DOCS_FULL.filter((st) => !st.welcome).length);
    const body = allText(t.root);
    expect(body).toContain(TUTORIAL_STEPS.find((st) => st.id === 'explore_or_leave')!.body);
  });

  it('⚠⚠⚠ FIRST-USE lists every registry card, marks the seen ones, and writes NOTHING', async () => {
    markHintSeen('inventory_first_open');
    const before = await hintKeys();
    expect(before).toEqual(['tartaria.hint.v1.inventory_first_open']);
    await setHintsDisabled(true);
    const t = mount(<GuidanceScreen />);
    await flush();
    await press(tab(t.root, 'First-use teaching'));
    const cards = t.root.findAll((n) => host(n) && typeof n.props.accessibilityLabel === 'string' && /, (seen|not yet seen)$/.test(n.props.accessibilityLabel as string));
    expect(cards.length).toBe(ALL_TEACHINGS.length);
    const seen = cards.filter((n) => (n.props.accessibilityLabel as string).endsWith(', seen'));
    expect(seen.length).toBe(1);
    expect(seen[0]!.props.accessibilityLabel).toBe(`${TEACHINGS.inventory_first_open.title}, seen`);
    const body = allText(t.root);
    for (const card of ALL_TEACHINGS) expect(body).toContain(card.body);
    // Grouped: every group header present, in the registry's order.
    const headers = texts(t.root);
    for (const h of ['OUT IN THE WORLD', 'FIGHTING', 'YOUR PACK', 'TRADERS', 'THE BENCH', 'COMPANIONS', 'THE SCREENS']) expect(headers).toContain(h);
    // Read-only: the flags are exactly what they were.
    expect(await hintKeys()).toEqual(before);
  });

  it('⚠⚠ REFERENCE hosts the Action Reference (search box and sections), and BACK returns to Settings', async () => {
    useGameStore.setState({ currentScreen: 'guidance' } as never);
    const t = mount(<GuidanceScreen />);
    await flush();
    await press(tab(t.root, 'Action reference'));
    expect(t.root.findAll((n) => host(n) && n.props.placeholder !== undefined && /search/i.test(String(n.props.placeholder))).length).toBe(1);
    expect(texts(t.root)).toContain('Movement Actions');
    await press(tab(t.root, 'Back to settings'));
    expect(useGameStore.getState().currentScreen).toBe('about');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('OTA-1738 — the SKIP pill draws on every locked beat', () => {
  const quiet = { storyIntro: null, chapterCard: null, dedicationCard: null, motivePickerPending: false, pendingFork: null, tutorialExploreChosen: false };
  const pill = (root: TestNode) => texts(root).filter((s) => s === 'SKIP TUTORIAL ▸').length;

  it('⚠⚠⚠ look / armor / screen_pick (the three the pill used to miss) and every other lock beat', async () => {
    for (const beat of TUT_LOCK_BEATS) {
      useGameStore.setState({ ...quiet, tutorialStep: TUTORIAL_STEPS.findIndex((st) => st.id === beat) } as never);
      const t = mount(<TutorialOverlay />);
      await flush();
      expect([beat, pill(t.root)]).toEqual([beat, 1]);
      renderer.act(() => t.unmount());
    }
  });

  it('⚠ and on nothing else: no tutorial, an unlocked beat, or the choice made', async () => {
    useGameStore.setState({ ...quiet, tutorialStep: null } as never);
    let t = mount(<TutorialOverlay />);
    await flush();
    expect(pill(t.root)).toBe(0);
    renderer.act(() => t.unmount());
    const unlocked = TUTORIAL_STEPS.findIndex((st) => !!st.id && !TUT_LOCK_BEATS.includes(st.id));
    expect(unlocked).toBeGreaterThan(-1);
    useGameStore.setState({ ...quiet, tutorialStep: unlocked } as never);
    t = mount(<TutorialOverlay />);
    await flush();
    expect(pill(t.root)).toBe(0);
    renderer.act(() => t.unmount());
    useGameStore.setState({ ...quiet, tutorialStep: TUTORIAL_STEPS.findIndex((st) => st.id === 'explore_or_leave'), tutorialExploreChosen: true } as never);
    t = mount(<TutorialOverlay />);
    await flush();
    expect(pill(t.root)).toBe(0);
  });
});
