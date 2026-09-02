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

// ⚠⚠⚠ OTA-1622 — EVERY STAGE CLOSE POPS UP IN YOUR FACE.
//
// Owner's rule, verbatim: *"every time you should finish a segment of a mission
// or a quest or whatever it is. it shouldn't be quiet. it shouldn't be able to be
// buried in the log feed. it should pop up on your face. you should know that
// you did the thing so you can just move on. I spent so much time on that scaled
// never even knowing that I had it even if it would have spawned a fight and we
// interrupted the fight with the pop-up out of disfleed and left and moved on
// with the mission."*
//
// THE MEASUREMENT. His 01:43:31 log: the scale stage of the Bog Dragon hunt
// closed — narration, "✦ … — mission item.", "▸ Next: …" — three lines that a
// Gutter Rat ambush on the same action pushed up the feed before he looked. He
// went on typing the closed stage's verb for twenty minutes. OTA-1602's beat
// card existed, and did not fire, because it was gated three ways: same tile
// only, no fight stood up, not the last stage. A close that MOVED the ground
// was feed-only ("the travel leg is the separator" — it was not, the ambush
// was). The escort clear, the apex kill, every final stage and the whole
// faction family were feed-only too.
//
// ⚠⚠ THE RULE THIS SUITE HOLDS: one writer (`raiseMissionClose`) and every path
// that moves a mission record forward calls it. The card carries what the close
// handed over and the next beat's command word; a fight that stood up gets the
// same card behind its FIGHT button; a second close while one is up WAITS
// instead of overwriting; the feed keeps every line it printed before. The
// dismiss is a logged tap, so a device log can prove the card was seen.

import { useGameStore } from '../app/state/gameStore';
import { raiseMissionClose } from '../app/state/slices/questSlice';
import { getRaces, getFactions } from '../app/engine/character';
import { findHuntById } from '../app/engine/hunts';
import { findMysteryById } from '../app/engine/mysteries';
import { findStorylineById } from '../app/engine/factionStorylines';
import { findFactionQuestById } from '../app/engine/factionQuests';
import { stageLocationId } from '../app/engine/questStage';
import { contractAnchorId, resolvePosterLocation } from '../app/engine/contractMarkers';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();
const set = (fn: (s: ReturnType<typeof get>) => Partial<ReturnType<typeof get>>) => store.setState(fn as never);
const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');

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
      activeFactionQuests: [],
      ...fields,
    } as never,
    activeBuildingId: null,
    pendingMissionStinger: null,
    pendingMissionBeat: null,
    missionCloseQueue: [],
  });
  set((s) => (s.currentScene ? {
    currentScene: { ...s.currentScene, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null },
  } : s));
}

/** Kill every body on the field in one resolve — the escort clear counts the
 *  conscious ones OTHER than the active corpse, so zeroing all of them and
 *  resolving the first is "the last of them is down". */
function dropTheField() {
  set((s) => (s.currentScene ? {
    currentScene: {
      ...s.currentScene,
      enemyHps: s.currentScene.enemies.map(() => 0),
      enemyKnockedOut: s.currentScene.enemies.map(() => false),
      activeEnemyIdx: 0,
    },
  } : s));
  get().resolveEnemyDefeat();
}

const withItem = (name: string) => [
  ...(get().player?.inventory ?? []),
  { id: `t_${name.replace(/\W+/g, '_')}`, name, kind: 'misc', quantity: 1, tags: ['quest'] },
];

const tapsLogged = (cta: string) =>
  get().gameLog.filter((e) => e.text === `ui: tap "mission card · ${cta}"`).length;

describe('OTA-1622 — every close is a card', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Faced', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ HIS CASE — a close that MOVES the ground is a card now, and it says what you got and what is next', () => {
    // OTA-1602 pinned this exact transition as "raises no card — the travel
    // leg is the separator". The scale stage proved the leg is where the feed
    // buries it. Stage 2 of the Doubter hands over the Spiral-Mark Stone and
    // sends you to Raider's Ridge.
    const def = findHuntById('hunt_servants_doubter')!;
    seed('great_tartary_plains', { activeHunts: [{ id: def.id, stage: 2, tracked: true }] });
    get().advanceHunt(def.id);
    expect((get().player?.activeHunts ?? []).find((r) => r.id === def.id)?.stage).toBe(3);
    const card = get().pendingMissionBeat!;
    expect(card).toBeTruthy();
    expect(card.title).toBe(def.title);
    expect(card.line).toBe(def.stages[2]!.narration);
    // What the close handed over — the thing he never knew he had.
    expect(card.granted).toEqual(["Reaver's Spiral-Mark Stone"]);
    // And the next beat, with its ground and its command word (OTA-1621).
    expect(card.next).toContain("Next: Raider's Ridge");
    expect(card.next).toContain('provoke it');
    // The feed keeps every line it printed before — the card is in addition.
    // (A wide window: the close auto-routes and the first step's arrival
    // scene prints a dozen lines of its own on top — which is the burial
    // this OTA is about, seen from the feed's side.)
    const tail = get().gameLog.slice(-80).map((e) => e.text).join('\n');
    expect(tail).toContain(def.stages[2]!.narration);
    expect(tail).toContain('▸ Next:');
    // And the log can prove the card went up.
    expect(tail).toContain(`mission card: "${def.title}"`);
  });

  it('⚠⚠⚠ THE LAST BODY DROPS — the escort clear is a card, over the field it just cleared', () => {
    const def = findHuntById('hunt_servants_doubter')!;
    seed('great_tartary_plains', {
      activeHunts: [{ id: def.id, stage: 1, tracked: true }],
      inventory: withItem("Servants' Mark of Sanction"),
    });
    get().advanceHunt(def.id);
    expect((get().currentScene?.enemies ?? []).length).toBe(3);
    // The stinger is the fight's curtain (OTA-1600); the stage has NOT closed.
    expect(get().pendingMissionStinger).not.toBeNull();
    expect(get().pendingMissionBeat).toBeNull();
    get().dismissMissionStinger();
    dropTheField();
    expect((get().player?.activeHunts ?? []).find((r) => r.id === def.id)?.stage).toBe(2);
    const card = get().pendingMissionBeat!;
    expect(card.title).toBe(def.title);
    expect(card.line).toContain('The last of them is down.');
    expect(card.line).toContain(def.stages[2]!.narration);
    expect(card.next).toContain('search this ground');
  });

  it('⚠⚠⚠ THE APEX KILL — "slain" is a card, not a reward line under the loot', () => {
    const def = findHuntById('hunt_servants_doubter')!;
    seed('reavers_crest', {
      activeHunts: [{ id: def.id, stage: 4, tracked: true }],
      inventory: withItem("Raider's Ridge-Sign"),
    });
    get().advanceHunt(def.id);
    expect((get().currentScene?.enemies ?? []).length).toBeGreaterThanOrEqual(1);
    get().dismissMissionStinger();
    dropTheField();
    expect((get().player?.activeHunts ?? []).find((r) => r.id === def.id)?.stage).toBe(def.stages.length);
    const card = get().pendingMissionBeat!;
    expect(card.title).toBe(def.title);
    expect(card.line).toContain(`${def.targetEnemyName} slain`);
    expect(card.next).toContain('bounty');
  });

  it('⚠⚠⚠ A MYSTERY\'S LAST BEAT — "recovered" is a card', () => {
    const def = findMysteryById('mystery_monarch_redaction')!;
    const last = def.stages.length - 1;
    const ground = stageLocationId(def.stages[last] as never, contractAnchorId(def as never), resolvePosterLocation);
    seed(ground, {
      activeMysteries: [{ id: def.id, stage: last, tracked: true }],
      inventory: withItem(def.trophyName),
    });
    get().advanceMystery(def.id);
    expect((get().player?.activeMysteries ?? []).find((r) => r.id === def.id)?.stage).toBe(def.stages.length);
    const card = get().pendingMissionBeat!;
    expect(card.title).toBe(def.title);
    expect(card.line).toBe(def.stages[last]!.narration);
    expect(card.next).toContain(`${def.trophyName} recovered`);
  });

  it('⚠⚠⚠ A STORYLINE THAT COMPLETES THROUGH A NULL EPILOGUE — OTA-1602 said "completion celebrates itself"; it did not', () => {
    const def = findStorylineById('story_dynasty_blood_aetherborn')!;
    seed('dynasty_border_post', {
      activeStorylines: [{ id: def.id, stage: 4, tracked: true }],
      inventory: withItem("The Claimant's Trust"),
    });
    get().advanceStoryline(def.id);
    expect((get().player?.activeStorylines ?? []).find((r) => r.id === def.id)?.stage).toBe(def.stages.length);
    const card = get().pendingMissionBeat!;
    expect(card.title).toBe(def.title);
    expect(card.next).toContain('Storyline complete in the field');
  });

  it('⚠⚠⚠ A STORYLINE THAT STANDS A BODY UP gets the FIGHT card — and closing on its corpse gets the close card', () => {
    // story_order_drowned_library #4: the Ooze on the stair, no authored
    // stinger, an epilogue behind it. Before this OTA the stand-up was two
    // feed lines and the kill was one.
    const def = findStorylineById('story_order_drowned_library')!;
    const ground = stageLocationId(def.stages[4] as never, contractAnchorId(def as never), resolvePosterLocation);
    seed(ground, {
      activeStorylines: [{ id: def.id, stage: 4, tracked: true }],
      inventory: withItem('The Chosen Salvage'),
    });
    get().advanceStoryline(def.id);
    expect((get().currentScene?.enemies ?? []).map((e) => e.name)).toEqual(['Aetheric Ooze']);
    const fight = get().pendingMissionStinger!;
    expect(fight.title).toBe(def.title);
    expect(fight.line).toBe(def.stages[4]!.narration);
    get().dismissMissionStinger();
    dropTheField();
    expect((get().player?.activeStorylines ?? []).find((r) => r.id === def.id)?.stage).toBe(def.stages.length);
    const card = get().pendingMissionBeat!;
    expect(card.title).toBe(def.title);
    expect(card.line).toContain('The last of them is down.');
    expect(card.next).toContain('Storyline complete in the field');
  });

  it('⚠⚠⚠ A FACTION QUEST STAGE — the fourth family, every tick and the finish', () => {
    const def = findFactionQuestById('fq_tartarians_giant')!;
    expect(def.stages!.length).toBe(2);
    seed('great_tartary_plains', { activeFactionQuests: [{ id: def.id, stage: 0, tracked: true }] });
    const foe = {
      name: 'Gutter Rat', type: 'Beast', rarity: 'Common', hp: 4,
      damage: '1d4 piercing', abilityPoint: '+1', traits: [], loot: [],
    };
    set((s) => ({ currentScene: { ...s.currentScene!, enemies: [foe as never], enemyHps: [0], enemyKnockedOut: [false], activeEnemyIdx: 0, range: 'close', enemyStatuses: [[]], enemyAmbushUsed: [false] } as never }));
    get().resolveEnemyDefeat();
    expect((get().player?.activeFactionQuests ?? []).find((r) => r.id === def.id)?.stage).toBe(1);
    let card = get().pendingMissionBeat!;
    expect(card.title).toBe(def.title);
    expect(card.line).toBe(def.stages![1]!.narration);
    get().dismissMissionBeat();
    set((s) => ({ currentScene: { ...s.currentScene!, enemies: [foe as never], enemyHps: [0], enemyKnockedOut: [false], activeEnemyIdx: 0, range: 'close', enemyStatuses: [[]], enemyAmbushUsed: [false] } as never }));
    get().resolveEnemyDefeat();
    expect((get().player?.activeFactionQuests ?? []).find((r) => r.id === def.id)?.stage).toBe(2);
    card = get().pendingMissionBeat!;
    expect(card.title).toBe(def.title);
    expect(card.line).toContain('is done');
    expect(card.next).toContain('Bring word');
  });

  it('⚠⚠ the in-place close OTA-1602 already covered still reads the same, plus the grant', () => {
    const def = findMysteryById('mystery_monarch_redaction')!;
    seed('hidden_market', {
      activeMysteries: [{ id: def.id, stage: 1, tracked: true }],
      inventory: withItem('Market Letter of Credit'),
    });
    get().advanceMystery(def.id);
    const card = get().pendingMissionBeat!;
    expect(card.title).toBe(def.title);
    expect(card.line).toBe(def.stages[1]!.narration);
    expect(card.granted).toEqual(["Fence's Hand-Off Note"]);
    expect(card.next).toContain('sneak');
  });
});

describe('OTA-1622 — a card cannot bury a card', () => {
  it('⚠⚠⚠ a second close while one is up WAITS, and CONTINUE brings it forward', () => {
    seed('great_tartary_plains', {});
    raiseMissionClose(get, set as never, { title: 'First', line: 'one', next: null, granted: [] });
    raiseMissionClose(get, set as never, { title: 'Second', line: 'two', next: 'go', granted: ['Thing'] });
    expect(get().pendingMissionBeat?.title).toBe('First');
    expect(get().missionCloseQueue.map((c) => c.title)).toEqual(['Second']);
    get().dismissMissionBeat();
    expect(get().pendingMissionBeat?.title).toBe('Second');
    expect(get().missionCloseQueue).toEqual([]);
    get().dismissMissionBeat();
    expect(get().pendingMissionBeat).toBeNull();
  });

  it('⚠⚠ the dismiss is a logged tap — a device log can prove the card was seen', () => {
    seed('great_tartary_plains', {});
    const before = tapsLogged('CONTINUE');
    raiseMissionClose(get, set as never, { title: 'T', line: 'L', next: null, granted: [] });
    get().dismissMissionBeat();
    expect(tapsLogged('CONTINUE')).toBe(before + 1);
    const beforeFight = tapsLogged('FIGHT');
    set(() => ({ pendingMissionStinger: { title: 'T', line: 'L', next: null, granted: [] } }));
    get().dismissMissionStinger();
    expect(tapsLogged('FIGHT')).toBe(beforeFight + 1);
  });

  it('⚠⚠ a fight card carries the same freight as a close card', () => {
    seed('great_tartary_plains', {});
    raiseMissionClose(get, set as never, { title: 'T', line: 'L', next: '▸ strike.', granted: ['Key'], fight: true });
    expect(get().pendingMissionStinger).toEqual({ title: 'T', line: 'L', next: '▸ strike.', granted: ['Key'] });
    expect(get().pendingMissionBeat).toBeNull();
  });
});

describe('OTA-1622 — one writer, pinned', () => {
  const QSL = src('app', 'state', 'slices', 'questSlice.ts');
  const STORE = src('app', 'state', 'gameStore.ts');
  const CREDIT = src('app', 'state', 'defeatCredit.ts');
  const MODAL = src('app', 'components', 'MissionStingerModal.tsx');
  const SCREEN = src('app', 'screens', 'ExplorationScreen.tsx');

  it('⚠⚠⚠ nothing sets the card but raiseMissionClose', () => {
    // The two object-literal writes live inside the writer; every other file
    // calls it. A second writer is how the next gate gets forgotten.
    // The writer sets both from the one `rest` object; no object literal is
    // written to either key anywhere in the slice.
    expect(QSL).toContain('set(() => ({ pendingMissionStinger: rest }));');
    expect(QSL).toContain('set(() => ({ pendingMissionBeat: rest }));');
    expect(QSL).not.toMatch(/pendingMissionBeat: \{/);
    expect(QSL).not.toMatch(/pendingMissionStinger: \{/);
    expect(STORE).not.toMatch(/pendingMissionBeat: \{/);
    expect(CREDIT).not.toMatch(/pendingMissionBeat: \{/);
    // Every close path calls it: hunt (advance + stood-up), mystery, storyline,
    // the escort clear, the apex kill, the faction tick.
    expect(QSL.match(/raiseMissionClose\(/g)!.length).toBeGreaterThanOrEqual(7);
    expect(CREDIT).toContain('raiseMissionClose(');
    expect(STORE).toContain('raiseMissionClose(');
  });

  it('⚠⚠ the three OTA-1602 gates are gone from the close paths', () => {
    expect(QSL).not.toContain('if (!movedGround) sameTileBeat =');
    expect(QSL).not.toContain('if (!moved) sameTileBeatM =');
    expect(QSL).not.toContain('if (!moved) sameTileBeatS =');
    expect(QSL).not.toContain('nextStage < hunt.stages.length) {\n        set(() => ({ pendingMissionBeat');
  });

  it('⚠⚠ the modal renders the grant and the next line, and the screen feeds it both', () => {
    expect(MODAL).toContain('stinger?.granted');
    expect(MODAL).toContain("{stinger?.next ? <Text style={styles.next}>{stinger.next}</Text> : null}");
    expect(SCREEN).toContain('<MissionStingerModal stinger={pendingMissionBeat} onClose={dismissMissionBeat} cta="CONTINUE" />');
    expect(SCREEN).toContain('<MissionStingerModal stinger={pendingMissionStinger} onClose={dismissMissionStinger} />');
  });
});
