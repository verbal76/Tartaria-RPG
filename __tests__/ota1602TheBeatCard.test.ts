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

// ⚠⚠⚠ OTA-1602 — THE BEAT CARD.
//
// Owner, completing the OTA-1601 ruling: "the combat should be separated. but
// multistage missions like the market heists either need a cutscene pop-up
// like the fight announcements or a conversation card pop up in between
// stages to separate and progress the mission."
//
// The measurement: 47 stage transitions close on their own tile with no fight
// stood up (5 hunt, 16 mystery, 26 storyline) — the Highest Bidder heist
// alone runs four in a row at the hidden market. No travel leg, no arrival,
// no stinger: each close was one narration line scrolling past, and the owner
// has typed "still didn't progress" while standing inside exactly this shape.
//
// Now every in-place, no-fight close raises the OTA-1600 curtain with a
// CONTINUE button: mission title up top, the closing prose big, the next
// objective under it. One writer per family; never over a completion (which
// celebrates itself) and never over a stinger (a fight stood up = not this).

import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findHuntById } from '../app/engine/hunts';
import { findMysteryById } from '../app/engine/mysteries';
import { findStorylineById } from '../app/engine/factionStorylines';
import { placedAt } from '../test-utils/placePlayer';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const set = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

function seed(at: string, fields: Record<string, unknown>) {
  const p = get().player!;
  store.setState({
    player: {
      ...p,
      ...placedAt(at),
      hubRoomId: null,
      stamina: 100,
      travelTarget: undefined,
      whisperCourse: null,
      activeHunts: [],
      activeMysteries: [],
      activeStorylines: [],
      ...fields,
    } as never,
    activeBuildingId: null,
    pendingMissionStinger: null,
    pendingMissionBeat: null,
  });
  set((s) => (s.currentScene ? {
    currentScene: { ...s.currentScene, enemies: [], enemyHps: [], activeEnemyIdx: 0, range: null },
  } : s));
}

describe('OTA-1602 — the beat card rises where a stage closes in place', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Beatkeeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ THE MARKET HEIST — his own example: a storyline chapter closing at the hidden market raises the card', () => {
    const def = findStorylineById('story_reclaimer_highest_bidder')!;
    seed('hidden_market', { activeStorylines: [{ id: def.id, stage: 1, tracked: true }] });
    get().advanceStoryline(def.id);
    const rec = (get().player?.activeStorylines ?? []).find((r) => r.id === def.id);
    expect(rec?.stage).toBe(2);
    const beat = get().pendingMissionBeat;
    expect(beat?.title).toBe(def.title);
    expect(beat?.line).toBe(def.stages[1]!.narration);
    // No fight in this transition — the stinger's curtain stays down.
    expect((get().currentScene?.enemies ?? []).length).toBe(0);
    expect(get().pendingMissionStinger).toBeNull();
  });

  it('⚠⚠⚠ a mystery investigate→stealth on one tile gets the same card', () => {
    const def = findMysteryById('mystery_monarch_redaction')!;
    seed('hidden_market', { activeMysteries: [{ id: def.id, stage: 1, tracked: true }] });
    get().advanceMystery(def.id);
    const rec = (get().player?.activeMysteries ?? []).find((r) => r.id === def.id);
    expect(rec?.stage).toBe(2);
    expect(get().pendingMissionBeat?.title).toBe(def.title);
    expect(get().pendingMissionBeat?.line).toBe(def.stages[1]!.narration);
  });

  it('⚠⚠⚠ a hunt\'s quiet in-place close gets it too — all three families, one curtain', () => {
    const def = findHuntById('hunt_mud_golem_thametan')!;
    seed('thametans_tower', { activeHunts: [{ id: def.id, stage: 1, tracked: true }] });
    get().advanceHunt(def.id);
    const rec = (get().player?.activeHunts ?? []).find((r) => r.id === def.id);
    expect(rec?.stage).toBe(2);
    expect(get().pendingMissionBeat?.title).toBe(def.title);
    expect(get().pendingMissionBeat?.line).toBe(def.stages[1]!.narration);
  });

  it('⚠⚠ a close that MOVES the ground raises the card too — OTA-1622 overruled "the travel leg is the separator"', () => {
    // This pin used to say "raises no card". The owner's scale stage proved
    // the travel leg is exactly where the feed buries a close (a same-action
    // ambush pushed it off the screen); his rule is EVERY close. The card now
    // carries the "▸ Next" line so the leg starts with the word in hand.
    const def = findHuntById('hunt_servants_doubter')!;
    seed('great_tartary_plains', {
      activeHunts: [{ id: def.id, stage: 2, tracked: true }],
      inventory: [
        ...(get().player?.inventory ?? []),
        { id: 't_stone', name: "Reaver's Spiral-Mark Stone", kind: 'misc', quantity: 1, tags: ['quest'] },
      ],
    });
    get().advanceHunt(def.id);
    const rec = (get().player?.activeHunts ?? []).find((r) => r.id === def.id);
    expect(rec?.stage).toBe(3);
    expect(get().pendingMissionBeat?.title).toBe(def.title);
    expect(get().pendingMissionBeat?.next).toContain('Next:');
  });

  it('⚠⚠ a close that stands a fight up gets the STINGER, never the beat', () => {
    const def = findHuntById('hunt_servants_doubter')!;
    seed('reavers_crest', {
      activeHunts: [{ id: def.id, stage: 4, tracked: true }],
      inventory: [
        ...(get().player?.inventory ?? []),
        { id: 't_sign', name: "Raider's Ridge-Sign", kind: 'misc', quantity: 1, tags: ['quest'] },
      ],
    });
    get().advanceHunt(def.id);
    expect((get().currentScene?.enemies ?? []).length).toBeGreaterThanOrEqual(1);
    expect(get().pendingMissionStinger).not.toBeNull();
    expect(get().pendingMissionBeat).toBeNull();
  });

  it('⚠⚠ a close that COMPLETES the mission (through a null epilogue) raises the card with the turn-in line — OTA-1622 overruled "completion celebrates itself"', () => {
    // "Celebrates itself" was one reward line in the feed. The owner's rule
    // is that the LAST close is the one he most needs in his face.
    const def = findStorylineById('story_dynasty_blood_aetherborn')!;
    seed('dynasty_border_post', { activeStorylines: [{ id: def.id, stage: 4, tracked: true }] });
    get().advanceStoryline(def.id);
    const rec = (get().player?.activeStorylines ?? []).find((r) => r.id === def.id);
    expect(rec?.stage).toBe(def.stages.length);
    expect(get().pendingMissionBeat?.title).toBe(def.title);
    expect(get().pendingMissionBeat?.next).toContain('Storyline complete in the field');
  });

  it('⚠ CONTINUE dismisses it', () => {
    set(() => ({ pendingMissionBeat: { title: 'T', line: 'L', next: null, granted: [] } }));
    get().dismissMissionBeat();
    expect(get().pendingMissionBeat).toBeNull();
  });
});

describe('OTA-1602 — the wiring is pinned', () => {
  const QSL = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');
  const SCREEN = readFileSync(join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
  const MODAL = readFileSync(join(__dirname, '..', 'app', 'components', 'MissionStingerModal.tsx'), 'utf8');

  it('⚠⚠ all three families write the card — hunt, mystery, storyline', () => {
    // ⚠ OTA-1622 superseded the three literal writes: one writer now
    // (`raiseMissionClose`), called from every close path. The claim is the
    // same — every family raises it — and ota1622 pins the single writer.
    expect(QSL).toContain('raiseMissionClose(get, set, {\n          title: hunt.title,');
    expect(QSL).toContain('raiseMissionClose(get, set, {\n      title: mystery.title, line: stageDef.narration,');
    expect(QSL).toContain('raiseMissionClose(get, set, {\n      title: def.title, line: stageDef.narration,');
    expect(QSL.match(/raiseMissionClose\(get, set, \{/g)!.length).toBeGreaterThanOrEqual(7);
  });

  it('⚠⚠ the screen renders the beat through the same curtain, CONTINUE for FIGHT', () => {
    expect(SCREEN).toContain('<MissionStingerModal stinger={pendingMissionBeat} onClose={dismissMissionBeat} cta="CONTINUE" />');
    // And the OTA-1600 stinger render is untouched beside it.
    expect(SCREEN).toContain('<MissionStingerModal stinger={pendingMissionStinger} onClose={dismissMissionStinger} />');
  });

  it('⚠ the modal stays story content — no hints gate, and the next line renders when present', () => {
    expect(MODAL).not.toContain('setHintsDisabled');
    expect(MODAL).toContain("{stinger?.next ? <Text style={styles.next}>{stinger.next}</Text> : null}");
  });
});
