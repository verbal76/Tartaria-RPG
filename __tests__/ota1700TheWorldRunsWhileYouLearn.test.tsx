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

/**
 * OTA-1700 — THE WORLD RUNS WHILE YOU LEARN.
 *
 * Owner, on a fresh character: "all the background stuff under world is broken,
 * just tried to show it off and none of it works. the world and lore buttons are
 * on the minimap which no longer takes you to the big map" — and, asked, "works
 * fine on my old character". Both keyed off the tutorial:
 *
 *   · worldRealtimeTick returned early while tutorialStep !== null. The guard
 *     predates OTA-958, which took faction STANDING out of the heartbeat; since
 *     then it protected nothing and cost a new character its whole living world
 *     (no patrols, no events, no power moving) for the twelve-beat tutorial.
 *   · The minimap tap carried the old MAP button's lockdown refusal (OTA-1375):
 *     buzz + Arbiter nudge, no Atlas.
 *
 * Measured before the fix (this suite's shape, on the unfixed store): twelve
 * heartbeats on a new character → events 0, patrols 0, ticks undefined; the
 * minimap tap left the screen on exploration and wrote the "Not that — type your
 * name" nudge.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { ExplorationScreen } from '../app/screens/ExplorationScreen';
import { MapScreen } from '../app/screens/MapScreen';
import { isTutorialLocked, TUTORIAL_STEPS, TUT_LOCK_BEATS } from '../app/components/tutorialSteps';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void): void;
  create(el: React.ReactElement): { toJSON(): unknown; root: any; unmount(): void };
};

jest.setTimeout(120_000);
const store = useGameStore;
const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) await new Promise((r) => setTimeout(r, 15));
}

function textOf(node: any): string {
  const parts: string[] = [];
  const walk = (n: any) => {
    const c = n?.props?.children;
    if (typeof c === 'string') parts.push(c);
    else if (Array.isArray(c)) c.forEach((x) => { if (typeof x === 'string') parts.push(x); });
    for (const k of n.children ?? []) if (typeof k === 'object') walk(k);
  };
  walk(node);
  return parts.join(' ');
}

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => { renderer.act(() => { for (const m of mounted.splice(0)) { try { m.unmount(); } catch { /* gone */ } } }); });
function mount(el: React.ReactElement) {
  let tree!: ReturnType<typeof renderer.create>;
  renderer.act(() => { tree = renderer.create(el); });
  mounted.push(tree);
  return tree;
}
const buttonsOf = (tree: any) => tree.root.findAll((n: any) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button');
const logTexts = () => store.getState().gameLog.map((e: any) => e.text as string);

describe('OTA-1700 — isTutorialLocked is the one rule', () => {
  it('locks on a lockdown beat until the stay/leave choice, never outside the tutorial', () => {
    const lockIdx = TUTORIAL_STEPS.findIndex((s) => s.id === 'name');
    const freeIdx = TUTORIAL_STEPS.findIndex((s) => s.id === 'main_quest');
    expect(lockIdx).toBeGreaterThan(-1);
    expect(freeIdx).toBeGreaterThan(-1);
    expect(TUT_LOCK_BEATS.includes('main_quest')).toBe(false);
    expect(isTutorialLocked(lockIdx, false)).toBe(true);
    expect(isTutorialLocked(lockIdx, true)).toBe(false);
    expect(isTutorialLocked(freeIdx, false)).toBe(false);
    expect(isTutorialLocked(null, false)).toBe(false);
    expect(isTutorialLocked(999, false)).toBe(false);
  });

  it('⚠ InputBox, ExplorationScreen and MapScreen all read it; nobody re-types the rule', () => {
    for (const f of [['app', 'components', 'InputBox.tsx'], ['app', 'screens', 'ExplorationScreen.tsx'], ['app', 'screens', 'MapScreen.tsx']]) {
      const text = src(...f);
      expect(text.includes('isTutorialLocked(tutorialStep, tutorialExploreChosen)')).toBe(true);
      expect(text.includes('TUT_LOCK_BEATS.includes(')).toBe(false);
    }
  });
});

describe('OTA-1700 — a new character, tutorial running', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Newcomer', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    await settle(() => !!store.getState().currentScene);
    let last = -1;
    await settle(() => { const n = store.getState().gameLog.length; const stable = n === last; last = n; return stable; }, 10000);
    store.getState().setScreen('exploration');
  });

  it('is inside the tutorial lockdown (the precondition the owner hit)', () => {
    const st = store.getState();
    expect(st.tutorialStep).not.toBeNull();
    expect(isTutorialLocked(st.tutorialStep, st.tutorialExploreChosen)).toBe(true);
  });

  it('⚠⚠ the world heartbeat moves the board during the tutorial: ticks count, patrols deploy, events land', () => {
    for (let i = 0; i < 12; i++) store.getState().worldRealtimeTick();
    const wm = store.getState().worldMemory;
    expect(wm.worldRealtimeTicks).toBe(12);
    expect((wm.patrols ?? []).length).toBeGreaterThan(0);
    expect((wm.worldEvents ?? []).length).toBeGreaterThan(0);
  });

  it('⚠ the heartbeat still does not move faction standing (OTA-958 holds)', () => {
    const before = JSON.stringify(store.getState().player!.factionStanding);
    for (let i = 0; i < 24; i++) store.getState().worldRealtimeTick();
    expect(JSON.stringify(store.getState().player!.factionStanding)).toBe(before);
  });

  it('⚠ the in-game pulse (worldTideCheck) keeps its tutorial guard — it is the path that moves standing', () => {
    const s = src('app', 'state', 'gameStore.ts');
    const i = s.indexOf('function worldTideCheck(');
    const body = s.slice(i, i + 1400);
    expect(body.includes('if (s.tutorialStep !== null && s.tutorialStep !== undefined) return;')).toBe(true);
    const j = s.indexOf('worldRealtimeTick() {');
    const beat = s.slice(j, s.indexOf('setTravelCourse(locationId: string)', j));
    expect(beat.includes('if (s.tutorialStep !== null) return;')).toBe(false);
  });

  it('⚠⚠ the minimap opens the Atlas under the lock, and the tap is on the log', () => {
    const tree = mount(<ExplorationScreen />);
    const mini = buttonsOf(tree).find((b: any) => String(b.props.accessibilityLabel ?? '').startsWith('Map'));
    expect(mini).toBeTruthy();
    const n0 = store.getState().gameLog.length;
    renderer.act(() => { mini.props.onPress(); });
    expect(store.getState().currentScreen).toBe('map');
    const fresh = logTexts().slice(n0);
    expect(fresh.some((t) => t.startsWith('ui: tap "map"'))).toBe(true);
    expect(fresh.some((t) => /Not that/.test(t))).toBe(false);
  });

  it('⚠⚠ the Atlas travel rows refuse under the lock with the Arbiter nudge, and no course is set', () => {
    store.getState().setScreen('map');
    const tree = mount(<MapScreen />);
    const rows = buttonsOf(tree).filter((b: any) => !b.props.disabled && /faction outpost|ruin|site|camp|city|wilds|—|\(/.test(textOf(b)) && !/BACK|RESET|ME/.test(textOf(b)));
    expect(rows.length).toBeGreaterThan(0);
    const n0 = store.getState().gameLog.length;
    renderer.act(() => { rows[0].props.onPress(); });
    expect(store.getState().currentScreen).toBe('map');
    expect(store.getState().player!.travelTarget).toBeFalsy();
    expect(logTexts().slice(n0).some((t) => /Not that/.test(t))).toBe(true);
  });

  it('WORLD and LORE taps write ui: tap lines carrying the rendered label, and open their screens', () => {
    store.getState().setScreen('exploration');
    const tree = mount(<ExplorationScreen />);
    const world = buttonsOf(tree).find((b: any) => textOf(b).includes('WORLD'));
    const lore = buttonsOf(tree).find((b: any) => textOf(b).includes('LORE'));
    const n0 = store.getState().gameLog.length;
    renderer.act(() => { world.props.onPress(); });
    expect(store.getState().currentScreen).toBe('world');
    store.getState().setScreen('exploration');
    renderer.act(() => { lore.props.onPress(); });
    expect(store.getState().currentScreen).toBe('lore');
    const fresh = logTexts().slice(n0);
    expect(fresh.some((t) => t.startsWith('ui: tap "⚑ WORLD"'))).toBe(true);
    expect(fresh.some((t) => t.startsWith('ui: tap "◈ LORE"'))).toBe(true);
  });
});
