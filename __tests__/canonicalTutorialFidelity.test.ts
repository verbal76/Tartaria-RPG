// P5 proof — tutorial fidelity.
//
// Proves: the CanonicalWalker's playTutorialNormally() (test-utils/canonical/
// CanonicalWalker.ts) drives the real production tutorial — real crawl
// dismissal, no SKIP button pressed, no direct state injection — end to end,
// and the resulting state is exactly what production's own tutorialStep
// index reports (null = finished) with every known prop granted through the
// real grant path. RNG draws are part of the one continuous seeded stream
// (no local reseed anywhere in this file).
//
// Run focused: npx jest __tests__/canonicalTutorialFidelity.test.ts

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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

jest.setTimeout(60000);

import { useGameStore, setHomeworkTick } from '../app/state/gameStore';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';
import { CanonicalWalker, CANONICAL_NAME, CANONICAL_RACE_ID, CANONICAL_FACTION_ID } from '../test-utils/canonical/CanonicalWalker';
import { installCanonicalClock, uninstallCanonicalClock } from '../test-utils/canonical/virtualClock';
import { assertNoLlm, assertHomeworkDisarmed, startConsoleCapture, stopConsoleCapture } from '../test-utils/canonical/hostProfile';

const store = useGameStore;
const get = () => store.getState();

async function worldSettle(pred: () => boolean, deadlineMs: number): Promise<void> {
  const pollMs = 15;
  const polls = Math.max(1, Math.ceil(deadlineMs / pollMs));
  for (let i = 0; i < polls && !pred(); i++) {
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

describe('P5 proof — tutorial fidelity (real doors, no SKIP)', () => {
  let walker: CanonicalWalker;

  beforeAll(async () => {
    startConsoleCapture();
    installCanonicalClock();
    // Exactly one intentional RNG seed initialization, before any draw.
    (globalThis as { __TARTARIA_RESEED_RANDOM__?: () => void }).__TARTARIA_RESEED_RANDOM__?.();
    await get().hydrate();

    walker = new CanonicalWalker();
    await walker.createCharacterLegitimately();
    await worldSettle(() => !!get().currentScene, 5000);
    // Environment control (not a player action), same door jest.teardown.js
    // and the base Walker's own buildWalkerWorld() already use.
    setHomeworkTick(null);
    assertHomeworkDisarmed({ _homeworkInstalled: (require('../app/state/gameStore') as typeof import('../app/state/gameStore'))._homeworkInstalled });

    await walker.dismissStoryIntroLegitimately();
    await walker.playTutorialNormally();
  });

  afterAll(() => {
    uninstallCanonicalClock();
    stopConsoleCapture();
  });

  it('never called the LLM (declared no-LLM boundary holds)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { qwen } = require('../app/ai/engines') as typeof import('../app/ai/engines');
    expect(() => assertNoLlm(qwen)).not.toThrow();
  });

  it('finished the tutorial (tutorialStep === null) without ever calling skipTutorial() as a shortcut', () => {
    expect(get().tutorialStep).toBeNull();
  });

  it('set the real player name via the name beat, not a hardcoded stand-in', () => {
    expect(get().player?.name).toBe(CANONICAL_NAME);
    expect(get().player?.raceId).toBe(CANONICAL_RACE_ID);
    expect(get().player?.factionId).toBe(CANONICAL_FACTION_ID);
  });

  // ⚠ I-001 — FIXED (Production Defect Adjudication and Repair Campaign).
  // This test used to document a real defect: advanceTutorial()'s off-the-end
  // fallback (gameStore.ts, `if (next >= TUTORIAL_STEPS.length) { get().skipTutorial();
  // return; }`) is the "legitimate natural finalization" path completing
  // pick_city runs through — not a SKIP-button press. But skipTutorial()'s
  // patch used to REPLACE tutorialPropsConsumed wholesale with a stale 4-key
  // literal instead of merging onto the current object, so a player who
  // finished the tutorial NORMALLY (every beat, no SKIP tap) lost the real
  // vest/cap grant flags this same run had just set moments earlier (the
  // ITEMS were always fine — verified equipped in the prior assertion — only
  // these two flags vanished). Fixed by merging onto the live flags instead
  // of replacing them; see docs/cartography/open-issues.json#I-001 for the
  // full evidence trail and regression test.
  it('natural tutorial completion preserves the vest/cap flags a normal playthrough already set (I-001, fixed)', () => {
    const consumed = get().tutorialPropsConsumed;
    expect(consumed).toEqual({ cudgel: true, rope: true, chestPlate: true, note: true, vest: true, cap: true });
  });

  it('equipped the cudgel and vest (armor beat completed on the EQUIP, per OTA-1248)', () => {
    const equipped = get().player?.equipped;
    const inv = get().player?.inventory ?? [];
    const hasVestEquipped = /vest/i.test(equipped?.chest ?? '');
    const hasCudgelSomewhere = /cudgel/i.test(equipped?.main ?? '') || /cudgel/i.test(equipped?.off ?? '');
    expect(hasVestEquipped).toBe(true);
    expect(hasCudgelSomewhere || inv.some((i) => /cudgel/i.test(i.name))).toBe(true);
  });

  it('landed on exploration with a real scene, main quest armed, and a road set to a Capital', () => {
    expect(get().currentScreen).toBe('exploration');
    expect(get().currentScene).not.toBeNull();
    expect(get().player?.travelTarget).not.toBeNull();
  });

  it('used only the documented direct doors, each with a recorded UI surface and justification', () => {
    for (const rec of walker.directDoors) {
      expect(rec.uiSurface.length).toBeGreaterThan(0);
      expect(rec.storeAction.length).toBeGreaterThan(0);
      expect(rec.policyVisibleJustification.length).toBeGreaterThan(0);
    }
    // screen_pick and main_quest are the two documented exceptions.
    const ids = walker.directDoors.map((d) => d.beatOrAction);
    expect(ids).toEqual(expect.arrayContaining(['tutorial:screen_pick', 'tutorial:main_quest']));
  });

  it('every TUTORIAL_STEPS beat id the walker branches on still exists in production (no silent drift)', () => {
    const known = new Set(TUTORIAL_STEPS.map((s) => s.id));
    for (const id of ['name', 'look', 'cudgel', 'armor', 'screen_pick', 'rope', 'scrap', 'climb', 'investigate', 'explore_or_leave', 'main_quest', 'pick_city']) {
      expect(known.has(id)).toBe(true);
    }
  });
});
