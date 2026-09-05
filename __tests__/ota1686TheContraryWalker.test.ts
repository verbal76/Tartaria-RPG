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
 * OTA-1686 — THE CONTRARY WALKER, Bog Dragon only (task #195, step 1 of the
 * Narrative Agency plan). The player-shaped walker proves the obedient path;
 * this one walks the same hunt premature, contrary and interrupted, grades
 * every deviation on handled / acknowledged / prior knowledge, and prints the
 * punch list step 2 builds against.
 *
 * ⚠⚠ THE GRADES ARE PINNED AS MEASURED. A "no" here is not a pass — it is the
 * game's behaviour on 2026-09-05, written down so the OTA that fixes it flips
 * a pin instead of guessing. The one hard assertion is HANDLED: every road
 * still finishes the hunt with no break, because a deviation that wedges the
 * mission is a defect of a different order from one that goes unremarked.
 *
 *   PLAYER_WALKER_REPORT=/path   appends the four reports + the punch list
 */
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findHuntById } from '../app/engine/hunts';
import { classifyMetaComment, anyClauseIsMeta } from '../app/engine/metaComment';
import { stalledInCombat } from '../app/engine/missionTrace';
import { pluralizeNoun } from '../app/engine/grammar';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkObedient, walkPremature, walkContrary, walkInterrupted, formatContrary, punchList, BOG_DRAGON_ID, type ContraryReport, type MissionLike } from '../test-utils/contraryWalker';
import { appendFileSync } from 'node:fs';

jest.setTimeout(900000);

const store = useGameStore;
const REPORT = process.env.PLAYER_WALKER_REPORT;

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

const def = findHuntById(BOG_DRAGON_ID) as unknown as MissionLike;
const reports: ContraryReport[] = [];

function emit(r: ContraryReport) {
  reports.push(r);
  const text = formatContrary(r);
  if (REPORT) appendFileSync(REPORT, `${text}\n\n`);
  process.stdout.write(`${text}\n`);
}

function grades(r: ContraryReport) {
  return r.probes.map((p) => ({ step: p.step, handled: p.handled, acknowledged: p.acknowledged, prior: p.priorKnowledge }));
}

describe('OTA-1686 — ⚠⚠⚠ three defects the road turned up, fixed here', () => {
  it('⚠⚠⚠ the meta-comment guard cuts the scene\'s own names out before it reads — "approach Mud Elemental Spawn" is a command', () => {
    // Without the scene's names, the word inside the monster's name was a note.
    expect(classifyMetaComment('approach Mud Elemental Spawn').isMeta).toBe(true);
    expect(classifyMetaComment('approach Mud Elemental Spawn', ['Mud Elemental Spawn']).isMeta).toBe(false);
    expect(classifyMetaComment('attack the mud elemental spawn', ['Mud Elemental Spawn', 'Mud Harpy']).isMeta).toBe(false);
    expect(anyClauseIsMeta('approach Mud Elemental Spawn then attack', ['approach Mud Elemental Spawn', 'attack'], ['Mud Elemental Spawn']).isMeta).toBe(false);
    // The owner's real notes stay notes — no scene name contains "spawned".
    expect(classifyMetaComment('nothing spawned here to combat', ['Mud Elemental Spawn']).isMeta).toBe(true);
    expect(classifyMetaComment('the vendor should not be able to spawn in that tile', ['Mud Harpy']).isMeta).toBe(true);
    // The store hands the names over at both guard sites.
    const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(STORE.includes('classifyMetaComment(trimmed, worldNames)')).toBe(true);
    expect(STORE.includes('anyClauseIsMeta(trimmed, clauses, worldNames)')).toBe(true);
  });

  it('⚠⚠ the stall line skips a provoke and a spawn stage, and speaks only on the stage\'s own cell', () => {
    const p = useGameStore.getState().player!;
    const hunt = findHuntById(BOG_DRAGON_ID)!;
    // Stage 5 (attack_provoke, spawn ×3 Mud Harpy) on its own ground: no stall — the fight IS the beat.
    const onMudSeas = { ...p, ...placedAt('mud_seas'), hubRoomId: null, activeHunts: [{ id: hunt.id, stage: 5, tracked: true }], activeMysteries: [], activeStorylines: [] } as never;
    expect(stalledInCombat(onMudSeas, 'attack')).toBeNull();
    // Stage 1 (investigate) on the Cradle of Dusk: a stall — but only there.
    const onCradle = { ...p, ...placedAt('cradle_of_dusk'), hubRoomId: null, activeHunts: [{ id: hunt.id, stage: 1, tracked: true }], activeMysteries: [], activeStorylines: [] } as never;
    expect(stalledInCombat(onCradle, 'investigate')?.title).toBe(hunt.title);
    const onTheRoad = { ...p, ...placedAt('dynasty_border_post'), hubRoomId: null, activeHunts: [{ id: hunt.id, stage: 1, tracked: true }], activeMysteries: [], activeStorylines: [] } as never;
    expect(stalledInCombat(onTheRoad, 'investigate')).toBeNull();
  });

  it('⚠ the escort ambush line pluralises like the party announcer', () => {
    expect(pluralizeNoun('Mud Harpy')).toBe('Mud Harpies');
    const QS = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');
    expect(QS.includes('${escort.length} ${pluralizeNoun(who)} are on you before you have the room to turn.')).toBe(true);
    expect(QS.includes('${who}s are on you')).toBe(false);
  });
});

describe('OTA-1686 — the contrary walker on the Bog Dragon of Old Drakova', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Contrary', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    let last = -1;
    await settle(() => {
      const n = store.getState().gameLog.length;
      const stable = n === last;
      last = n;
      return stable;
    }, 10000);
  });

  afterAll(() => {
    const list = punchList(reports);
    const text = `\n=== punch list (${list.length}) ===\n${list.map((l) => `  - ${l}`).join('\n')}\n`;
    if (REPORT) appendFileSync(REPORT, text);
    process.stdout.write(text);
  });

  it('obedient — the baseline finishes clean, a card on every close', async () => {
    const r = await walkObedient(def);
    emit(r);
    expect(r.finish?.breaks).toEqual([]);
    expect(grades(r)).toEqual([
      { step: 'the whole hunt, as asked', handled: 'yes', acknowledged: 'yes', prior: 'n/a' },
    ]);
  });

  it('premature — the roost and Old Mira before the reeve: handled, unremarked', async () => {
    const r = await walkPremature(def);
    emit(r);
    expect(r.finish?.breaks).toEqual([]);
    // ⚠ MEASURED 2026-09-05. The early visits are invisible: nothing at the
    // steeple names the hunt; Mira's ground draws only the generic "Not here …
    // points elsewhere" for the parley verb; the proper visits afterwards read
    // exactly as a first visit. Flip these when the deed ledger (step 2) lands.
    expect(grades(r)).toEqual([
      { step: 'the steeple before the reeve', handled: 'yes', acknowledged: 'no', prior: 'n/a' },
      { step: 'Old Mira before the reeve', handled: 'yes', acknowledged: 'partial', prior: 'n/a' },
      { step: 'the proper visits, after the early ones', handled: 'yes', acknowledged: 'n/a', prior: 'no' },
    ]);
  });

  it('contrary — walking out, the empty hand-in, the wrong verb, the abandon: handled, mostly unremarked', async () => {
    const r = await walkContrary(def);
    emit(r);
    expect(r.finish?.breaks).toEqual([]);
    // ⚠ MEASURED 2026-09-05. See the report for each verdict.
    expect(grades(r)).toEqual([
      { step: 'the trophy before the hunt', handled: 'yes', acknowledged: 'yes', prior: 'n/a' },
      { step: 'walking out on the reeve', handled: 'yes', acknowledged: 'yes', prior: 'no' },
      // ⚠ OTA-1687 flipped two pins: the wrong verb on the right ground now draws
      // "Not that. … wants you to search this ground here", and ABANDON drops the
      // mission's encounter records so the reeve's card comes back on re-accept.
      { step: 'the wrong verb on the right ground', handled: 'yes', acknowledged: 'yes', prior: 'n/a' },
      { step: 'abandon with the items, take it up again', handled: 'yes', acknowledged: 'yes', prior: 'no' },
    ]);
  });

  it('interrupted — a harpy killed and a Dragon wounded before running: handled, nothing remembered', async () => {
    const r = await walkInterrupted(def);
    emit(r);
    expect(r.finish?.breaks).toEqual([]);
    // ⚠ MEASURED 2026-09-05. The flee is honoured on the tile (OTA-1610) and
    // the return re-arms the fight (OTA-1597) — but the brood is back to three
    // and the Dragon back to full, the name stalls it a second time word for
    // word, and no line knows you ran.
    expect(grades(r)).toEqual([
      { step: 'one harpy down, then run', handled: 'yes', acknowledged: 'yes', prior: 'no' },
      { step: 'the Dragon wounded, then run', handled: 'yes', acknowledged: 'yes', prior: 'no' },
    ]);
  });

  it('⚠⚠ a knocked-out body on the ground does not hold the apex shut (the OTA-1612 rule, at both arm guards)', async () => {
    const st = useGameStore.getState();
    const hunt = findHuntById(BOG_DRAGON_ID)!;
    const p = st.player!;
    const sleeper = { name: 'Tin Grubber', type: 'Beast', rarity: 'Common', hp: 25, damage: '1d4 piercing', abilityPoint: '+1', traits: [], loot: [] };
    useGameStore.setState({
      player: {
        ...p, ...placedAt('broken_steeple'), hubRoomId: null, travelTarget: undefined,
        activeHunts: [{ id: hunt.id, stage: 6, tracked: true, acceptedAt: 0 }], activeMysteries: [], activeStorylines: [],
        inventory: [...p.inventory.filter((i) => i.name !== "Eshren's Name-Token"), { id: 't_name', name: "Eshren's Name-Token", kind: 'misc', quantity: 1, tags: ['quest'] }],
      } as never,
      missionFleeHoldCell: null, pendingMissionStinger: null, pendingMissionBeat: null,
    });
    const sc = useGameStore.getState().currentScene!;
    // One body, out cold with hit points left — the exact field the walker measured.
    useGameStore.setState({ currentScene: { ...sc, enemies: [sleeper as never], enemyHps: [9], enemyKnockedOut: [true], enemyStatuses: [[]], enemyAmbushUsed: [false], activeEnemyIdx: 0, range: 'close' } as never });
    await useGameStore.getState().submitPlayerAction('look around');
    await new Promise((r) => setTimeout(r, 200));
    const names = (useGameStore.getState().currentScene?.enemies ?? []).map((e) => e.name);
    expect(names).toContain(`${hunt.targetEnemyName} (hunted)`);
    // Tidy: the Dragon is not part of the roads that follow.
    const live = useGameStore.getState().currentScene!;
    useGameStore.setState({ currentScene: { ...live, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never, pendingMissionStinger: null, pendingMissionBeat: null });
  });

});
