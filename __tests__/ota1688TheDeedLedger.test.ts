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
 * OTA-1688 — THE DEED LEDGER. Step 2 of the Narrative Agency plan: punch items
 * 1–5 of the contrary walker's list (docs/contrary-walker-bog-dragon-2026-09-05.md).
 *
 * One ledger, `worldMemory.deeds[locationId]`: typed, timestamped facts about
 * what the player did on that ground. Four writers (a mission ground under
 * the boots; a card walked out on; a mission fight fled, with the bodies'
 * state) and three readers:
 *
 *   1. the arrival line — a later step's ground says "not yet" and what comes
 *      first (items 1, 3); the proper visit remembers the early one (item 2);
 *   2. the people — the reeve you walked out on says "Back, then." (item 4);
 *   3. the narrator — `deeds_here` on the Qwen fact sheet;
 *
 * and the mission fight reads it too: the brood comes back one short and
 * rising rather than ambushing, the apex keeps its wound, and the name-token
 * narration does not stall it a second time word for word (item 5).
 */
import fs from 'node:fs';
import path from 'node:path';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findHuntById } from '../app/engine/hunts';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { laterStageUnderfoot, laterStageLine, missionArrivalLines, missionFightUnderfoot } from '../app/engine/missionTrace';
import { deedsAt, deedsHereLine, deedClause, hasDeed, lastDeed, recordDeed, stageFled, visitedBefore, DEEDS_PER_LOCATION, DEED_LOCATIONS } from '../app/engine/deeds';
import { trimSaveStateToFit } from '../app/engine/saveTrim';
import { buildLlmContext, buildSystemPrompt } from '../app/engine/contextInjector';
import { placedAt } from '../test-utils/placePlayer';
import type { Deed, WorldMemory } from '../app/engine/types';

jest.setTimeout(120000);

const store = useGameStore;
const get = () => store.getState();
const BOG = 'hunt_bog_dragon';
// The stage names "the Drakovan reeve"; the roster gives him his name.
const REEVE = 'Reeve Halvard';
const APEX = 'Bog Dragon (hunted)';
const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

const emptyMemory = (): WorldMemory => ({} as WorldMemory);

describe('OTA-1688 — the ledger itself', () => {
  it('recordDeed appends without mutating, caps per place, and sheds the coldest place first', () => {
    const m0 = emptyMemory();
    const m1 = recordDeed(m0, 'drakova', { kind: 'visited', hour: 1, ts: 10, missionId: BOG, stage: 0, title: 'T' });
    expect(m0.deeds).toBeUndefined();
    expect(deedsAt(m1, 'drakova')).toHaveLength(1);
    expect(deedsAt(m1, 'drakova')[0]).toMatchObject({ kind: 'visited', ts: 10, hour: 1 });
    // A missing ts is stamped now.
    const m2 = recordDeed(m1, 'drakova', { kind: 'walked_out', hour: 2, who: REEVE });
    expect(deedsAt(m2, 'drakova')[1]!.ts).toBeGreaterThan(0);
    // Per-place cap: the oldest fall off the front.
    let m = emptyMemory();
    for (let i = 0; i < DEEDS_PER_LOCATION + 5; i++) m = recordDeed(m, 'x', { kind: 'visited', hour: i, ts: i });
    expect(deedsAt(m, 'x')).toHaveLength(DEEDS_PER_LOCATION);
    expect(deedsAt(m, 'x')[0]!.hour).toBe(5);
    // Place cap: the place whose NEWEST deed is oldest is dropped, not the first-seen one.
    let p = emptyMemory();
    for (let i = 0; i < DEED_LOCATIONS; i++) p = recordDeed(p, `loc${i}`, { kind: 'visited', hour: i, ts: 100 + i });
    p = recordDeed(p, 'loc0', { kind: 'visited', hour: 999, ts: 9999 }); // loc0 touched again — now the warmest
    p = recordDeed(p, 'locNew', { kind: 'visited', hour: 1000, ts: 10000 });
    expect(Object.keys(p.deeds!)).toHaveLength(DEED_LOCATIONS);
    expect(p.deeds!.loc0).toBeDefined();
    expect(p.deeds!.locNew).toBeDefined();
    expect(p.deeds!.loc1).toBeUndefined(); // ts 101 — the coldest
    // Readers on an empty or absent ledger are quiet.
    expect(deedsAt(null, 'drakova')).toEqual([]);
    expect(deedsAt(m1, null)).toEqual([]);
    expect(hasDeed(m1, 'nowhere', () => true)).toBe(false);
    expect(lastDeed(m2, 'drakova', (d) => d.kind === 'walked_out')?.who).toBe(REEVE);
  });

  it('visitedBefore is an EARLIER hour; stageFled is the last flee for that stage; deedsHereLine is three clauses, newest first', () => {
    let m = emptyMemory();
    m = recordDeed(m, 'broken_steeple', { kind: 'visited', hour: 10, ts: 1, missionId: BOG, stage: 6, title: 'T' });
    // The visit written THIS arrival (same hour) is not "before".
    expect(visitedBefore(m, 'broken_steeple', BOG, 6, 10)).toBeNull();
    expect(visitedBefore(m, 'broken_steeple', BOG, 6, 10.5)?.hour).toBe(10);
    expect(visitedBefore(m, 'broken_steeple', BOG, 5, 20)).toBeNull(); // another stage's ground-visit does not count
    m = recordDeed(m, 'mud_seas', { kind: 'fled', hour: 12, ts: 2, missionId: BOG, stage: 5, title: 'T', who: 'Mud Harpy', n: 3 });
    m = recordDeed(m, 'mud_seas', { kind: 'fled', hour: 13, ts: 3, missionId: BOG, stage: 5, title: 'T', who: 'Mud Harpy', n: 2 });
    expect(stageFled(m, 'mud_seas', BOG, 5)?.n).toBe(2);
    expect(stageFled(m, 'mud_seas', BOG, 6)).toBeNull();
    m = recordDeed(m, 'mud_seas', { kind: 'walked_out', hour: 14, ts: 4, who: 'Old Mira' });
    m = recordDeed(m, 'mud_seas', { kind: 'visited', hour: 15, ts: 5, title: 'The Bog Dragon of Old Drakova' });
    const line = deedsHereLine(m, 'mud_seas')!;
    expect(line.split('; ')).toEqual([
      'stood here before on the trail of The Bog Dragon of Old Drakova',
      'walked out on Old Mira mid-conversation',
      'fled Mud Harpy with 2 still standing',
    ]);
    expect(deedsHereLine(m, 'nowhere')).toBeNull();
    expect(deedClause({ kind: 'fled', ts: 0, hour: 0, who: APEX, hpLeft: 200, hpMax: 561 })).toBe('fled Bog Dragon (hunted) after wounding it (200 of 561 left)');
    expect(deedClause({ kind: 'fled', ts: 0, hour: 0, title: 'T' })).toBe('fled the fight for T');
    expect(deedClause({ kind: 'visited', ts: 0, hour: 0 })).toBe('stood here before');
    expect(deedClause({ kind: 'walked_out', ts: 0, hour: 0 })).toBe('walked out mid-conversation');
    expect(deedClause({ kind: 'nope' as Deed['kind'], ts: 0, hour: 0 })).toBeNull();
  });

  it('saveTrim keeps the last eight deeds per place under pressure; the deeds survive a normal-size save', () => {
    let m = emptyMemory();
    for (let i = 0; i < 20; i++) m = recordDeed(m, 'drakova', { kind: 'visited', hour: i, ts: i });
    const state = { player: null, worldMemory: m, gameLog: [], currentScene: null } as never;
    const fits = trimSaveStateToFit(state);
    expect(fits.trimmed).toBe(false);
    expect(deedsAt(fits.state.worldMemory, 'drakova')).toHaveLength(20);
    const squeezed = trimSaveStateToFit(state, 10);
    expect(squeezed.memosCapped).toBe(true);
    expect(deedsAt(squeezed.state.worldMemory, 'drakova')).toHaveLength(8);
    expect(deedsAt(squeezed.state.worldMemory, 'drakova')[0]!.hour).toBe(12);
  });

  it('reader 3 — deeds_here rides the Qwen fact sheet, and both narration builders pass it', () => {
    const ctx = buildLlmContext({ player: null, scene: null, gameLog: [], deedsHere: 'walked out on the Drakovan reeve mid-conversation' });
    expect(ctx.deeds_here).toBe('walked out on the Drakovan reeve mid-conversation');
    const sys = buildSystemPrompt(ctx).map((m) => m.content).join('\n');
    expect(sys.includes('Here before, the player: walked out on the Drakovan reeve mid-conversation.')).toBe(true);
    const bare = buildLlmContext({ player: null, scene: null, gameLog: [] });
    expect(bare.deeds_here).toBeUndefined();
    expect(buildSystemPrompt(bare).map((m) => m.content).join('\n').includes('Here before, the player')).toBe(false);
    const narration = src('app', 'ai', 'narration.ts');
    expect(narration.includes("deedsHere: forLoc ? null : deedsHereLine(state.worldMemory, player?.currentLocationId)")).toBe(true);
    expect(narration.includes('deedsHere: deedsHereLine(get().worldMemory, player?.currentLocationId)')).toBe(true);
  });
});

function seed(at: string, fields: Record<string, unknown>) {
  const p = get().player!;
  store.setState({
    player: {
      ...p, ...placedAt(at), hubRoomId: null, stamina: 100, travelTarget: undefined, whisperCourse: null,
      hp: 600, hpMax: 600, stats: { ...p.stats, strength: 20, dexterity: 20 },
      activeHunts: [], activeMysteries: [], activeStorylines: [], activeFactionQuests: [], missionEncounters: {}, ...fields,
    } as never,
    pendingMissionBeat: null, pendingMissionStinger: null, missionCloseQueue: [], missionFleeHoldCell: null,
    activeBuildingId: null,
  } as never);
  const sc = get().currentScene!;
  store.setState({ currentScene: { ...sc, enemies: [], enemyHps: [], enemyKnockedOut: [], enemyStatuses: [], enemyAmbushUsed: [], activeEnemyIdx: 0, range: null } as never });
}
const token = (name: string) => ({ id: `t_${name.replace(/\W+/g, '_')}`, name, kind: 'misc', quantity: 1, tags: ['quest'] });
const withToken = (name: string) => [...get().player!.inventory.filter((i) => i.name !== name), token(name)];
/** From one entry BEFORE the mark: a world line landing within 500ms of the
 *  previous world entry is grouped into it (HANDOFF #4), so the text of a
 *  line printed after the mark can live in the entry just before it. */
const logText = (from: number) => get().gameLog.slice(Math.max(0, from - 1)).map((e) => e.text).join('\n');
/** Strictly after the mark — for the pins that say a line did NOT print. */
const logAfter = (from: number) => get().gameLog.slice(from).map((e) => e.text).join('\n');
function drain() { let g = 0; while (get().pendingRolls && g++ < 60) { const pr = get().pendingRolls!; const step = pr.steps[pr.currentStep]!; get().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 18)); } }
async function act(text: string) { await get().submitPlayerAction(text); drain(); await new Promise((r) => setTimeout(r, 150)); drain(); }
const hunt = () => findHuntById(BOG)!;

describe('OTA-1688 — the writers and the readers on Drakova and the Mud Seas', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Ledger', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    get().skipTutorial?.();
    await settle(() => !!get().currentScene);
    let last = -1;
    await settle(() => { const n = get().gameLog.length; const stable = n === last; last = n; return stable; }, 10000);
  });

  it('⚠⚠⚠ 1+3. a later step\'s ground says "not yet" and what comes first; the visit is written down', async () => {
    // The roost at stage 0 — the poster names it, the record has not reached it.
    seed('broken_steeple', { activeHunts: [{ id: BOG, stage: 0, tracked: true, acceptedAt: 0 }] });
    store.setState({ worldMemory: { ...get().worldMemory, deeds: {} } });
    const later = laterStageUnderfoot(get().player)!;
    expect(later).toMatchObject({ family: 'hunt', missionId: BOG, stageIndex: 6, npcName: null, firstGroundId: 'drakova', firstNpc: 'the Drakovan reeve' });
    const line = laterStageLine(later);
    expect(line.startsWith("▸ The Bog Dragon of Old Drakova: this is a later step's ground — not yet. First: find the Drakovan reeve at ")).toBe(true);
    const mark = get().gameLog.length;
    await act('look around');
    expect(logText(mark).includes(line)).toBe(true);
    // Once per standing: the same line is not printed again on the next action.
    const mark2 = get().gameLog.length;
    await act('look around');
    expect(logAfter(mark2).includes(line)).toBe(false);
    // The deed: stood on the stage-6 ground, on the trail of the hunt.
    const visited = deedsAt(get().worldMemory, 'broken_steeple').filter((d) => d.kind === 'visited' && d.missionId === BOG);
    expect(visited.map((d) => d.stage)).toEqual([6]);
    expect(visited[0]!.title).toBe(hunt().title);
    expect(get().player!.activeHunts![0]!.stage).toBe(0);
    // Old Mira's ground at stage 0: the line names her as a later step and the reeve as the first.
    seed('monarch_waystation', { activeHunts: [{ id: BOG, stage: 0, tracked: true, acceptedAt: 0 }] });
    const atMira = laterStageUnderfoot(get().player)!;
    expect(atMira.stageIndex).toBe(2);
    expect(laterStageLine(atMira).startsWith('▸ The Bog Dragon of Old Drakova: Old Mira is a later step — not yet. First: find the Drakovan reeve at ')).toBe(true);
    const mark3 = get().gameLog.length;
    await act('negotiate');
    expect(logText(mark3).includes('Old Mira is a later step — not yet. First: find the Drakovan reeve')).toBe(true);
    // Stages 2 AND 4 both stand at Mira's: both are written, once each.
    const atMiraDeeds = deedsAt(get().worldMemory, 'monarch_waystation').filter((d) => d.kind === 'visited' && d.missionId === BOG).map((d) => d.stage);
    expect(atMiraDeeds).toEqual([2, 4]);
    await act('look around');
    expect(deedsAt(get().worldMemory, 'monarch_waystation').filter((d) => d.kind === 'visited').length).toBe(2);
    // On the CURRENT stage's ground the arrival line has it — no "not yet".
    seed('drakova', { activeHunts: [{ id: BOG, stage: 0, tracked: true, acceptedAt: 0 }] });
    expect(laterStageUnderfoot(get().player)).toBeNull();
  });

  it('⚠⚠⚠ 2. reader 1 — the proper visit remembers the early one', () => {
    // The early visit, hours ago; then the proper arrival at stage 6 with the token.
    seed('broken_steeple', { activeHunts: [{ id: BOG, stage: 6, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 40 });
    const early = recordDeed({ ...get().worldMemory, deeds: {} }, 'broken_steeple', { kind: 'visited', hour: 12, missionId: BOG, stage: 6, title: hunt().title });
    store.setState({ worldMemory: early });
    const lines = missionArrivalLines(get().player, get().worldMemory);
    const mine = lines.find((l) => l.includes('The Bog Dragon of Old Drakova: this is the place'))!;
    expect(mine.endsWith(' You have stood here before, ahead of the trail.')).toBe(true);
    // Without the ledger — or with a visit written this same hour — it is a first visit.
    expect(missionArrivalLines(get().player, null).some((l) => l.includes('stood here before'))).toBe(false);
    const sameHour = recordDeed({ ...get().worldMemory, deeds: {} }, 'broken_steeple', { kind: 'visited', hour: 40, missionId: BOG, stage: 6, title: hunt().title });
    expect(missionArrivalLines(get().player, sameHour).some((l) => l.includes('stood here before'))).toBe(false);
  });

  it('⚠⚠⚠ 4. reader 2 — the reeve you walked out on says "Back, then."', async () => {
    seed('drakova', { activeHunts: [{ id: BOG, stage: 0, tracked: true, acceptedAt: 0 }], hoursElapsed: 5 });
    store.setState({ worldMemory: { ...get().worldMemory, deeds: {} } });
    const armed = armedEncounter(get().player)!;
    expect(armed.key).toBe(`hunt:${BOG}:0`);
    expect(armed.person.name).toBe(REEVE);
    const mark = get().gameLog.length;
    get().answerMissionEncounter('flee');
    expect(logText(mark).includes(`You break off and step away from ${REEVE}.`)).toBe(true);
    const walked = lastDeed(get().worldMemory, 'drakova', (d) => d.kind === 'walked_out')!;
    expect(walked).toMatchObject({ who: REEVE, missionId: BOG, stage: 0, hour: 5, title: hunt().title });
    // Back on the tile, SUMMON: the reeve knows.
    const mark2 = get().gameLog.length;
    get().summonMissionEncounter();
    expect(logText(mark2).includes(`${REEVE} looks up as you come back. "Back, then." The conversation resumes where you left it.`)).toBe(true);
    // A first summon with no walk-away on the ledger says nothing of the kind.
    seed('drakova', { activeHunts: [{ id: BOG, stage: 0, tracked: true, acceptedAt: 0 }], missionEncounters: { [`hunt:${BOG}:0`]: { key: `hunt:${BOG}:0`, phase: 'fled', persuadeSpent: false, mocked: false } } });
    store.setState({ worldMemory: { ...get().worldMemory, deeds: {} } });
    const mark3 = get().gameLog.length;
    get().summonMissionEncounter();
    expect(logAfter(mark3).includes('Back, then.')).toBe(false);
  });

  it('⚠⚠⚠ 5a. the brood: one down, flee, return — two rise from where they were left; the kill sticks', async () => {
    seed('mud_seas', { activeHunts: [{ id: BOG, stage: 5, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 50 });
    store.setState({ worldMemory: { ...get().worldMemory, deeds: {} } });
    expect(missionFightUnderfoot(get().player)).toMatchObject({ missionId: BOG, stage: 5, groundId: 'mud_seas', spawnName: 'Mud Harpy', spawnCount: 3, apexName: null });
    get().advanceHunt(BOG);
    await settle(() => (get().currentScene?.enemies ?? []).filter((e) => e.name === 'Mud Harpy').length === 3);
    // One harpy down (hp 0), the other two up; then run.
    const sc = get().currentScene!;
    store.setState({ currentScene: { ...sc, enemyHps: sc.enemyHps.map((h, i) => (i === 0 ? 0 : h)), range: 'close' } as never, pendingMissionStinger: null, pendingMissionBeat: null });
    const mark = get().gameLog.length;
    await act('flee');
    expect(get().currentScene!.enemies).toHaveLength(0);
    const fled = stageFled(get().worldMemory, 'mud_seas', BOG, 5)!;
    expect(fled).toMatchObject({ who: 'Mud Harpy', n: 2, title: hunt().title });
    expect(fled.hour).toBeGreaterThanOrEqual(50); // the run itself costs time
    expect(fled.hpLeft).toBeUndefined();
    // Away and back: the arm runs again (called as the arrival door calls it).
    seed('drakova', { activeHunts: [{ id: BOG, stage: 5, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 52 });
    seed('mud_seas', { activeHunts: [{ id: BOG, stage: 5, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 53 });
    const mark2 = get().gameLog.length;
    get().advanceHunt(BOG);
    await settle(() => (get().currentScene?.enemies ?? []).some((e) => e.name === 'Mud Harpy'));
    expect(get().currentScene!.enemies.filter((e) => e.name === 'Mud Harpy')).toHaveLength(2);
    const back = logText(mark2);
    expect(back.includes('You come back onto ground you ran from. Mud Harpies rise from the positions they were left in.')).toBe(true);
    expect(back.includes('The one you put down stays down. The rest remember you.')).toBe(true);
    // Not the first-time curtain: no ambush line, no authored narration.
    expect(back.includes(hunt().stages[5]!.narration.slice(0, 40))).toBe(false);
    expect(back.includes('before you have the room to turn')).toBe(false);
    // The fight card carries the return line, not the authored stinger.
    const card = get().pendingMissionStinger as { line: string } | null;
    expect((card?.line ?? '').includes('rise from the positions they were left in')).toBe(true);
    expect(logAfter(mark2).includes(hunt().stages[5]!.stinger!)).toBe(false);
    store.setState({ currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never, pendingMissionStinger: null, pendingMissionBeat: null, missionFleeHoldCell: null });
  });

  it('⚠⚠⚠ 5b. the Dragon: wounded, flee, return — the wound holds and the name does not stall it twice', async () => {
    seed('broken_steeple', { activeHunts: [{ id: BOG, stage: 6, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 60 });
    store.setState({ worldMemory: { ...get().worldMemory, deeds: {} } });
    expect(missionFightUnderfoot(get().player)).toMatchObject({ missionId: BOG, stage: 6, groundId: 'broken_steeple', spawnName: null, apexName: APEX });
    const mark0 = get().gameLog.length;
    get().advanceHunt(BOG);
    await settle(() => (get().currentScene?.enemies ?? []).some((e) => e.name === APEX));
    expect(logText(mark0).includes('and it stalls, for one long breath')).toBe(true);
    const sc = get().currentScene!;
    const i = sc.enemies.findIndex((e) => e.name === APEX);
    const max = sc.enemyHps[i]!;
    const left = max - 40;
    store.setState({ currentScene: { ...sc, enemyHps: sc.enemyHps.map((h, k) => (k === i ? left : h)), range: 'close' } as never, pendingMissionStinger: null, pendingMissionBeat: null });
    await act('flee');
    expect(get().currentScene!.enemies).toHaveLength(0);
    const fled = stageFled(get().worldMemory, 'broken_steeple', BOG, 6)!;
    expect(fled).toMatchObject({ who: APEX, hpLeft: left, hpMax: max });
    expect(fled.hour).toBeGreaterThanOrEqual(60);
    expect(fled.n).toBeUndefined();
    // Away and back.
    seed('mud_seas', { activeHunts: [{ id: BOG, stage: 6, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 62 });
    seed('broken_steeple', { activeHunts: [{ id: BOG, stage: 6, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 63 });
    const mark = get().gameLog.length;
    get().advanceHunt(BOG);
    await settle(() => (get().currentScene?.enemies ?? []).some((e) => e.name === APEX));
    const sc2 = get().currentScene!;
    const j = sc2.enemies.findIndex((e) => e.name === APEX);
    expect(sc2.enemyHps[j]).toBe(left);
    const back = logText(mark);
    expect(back.includes('Bog Dragon rises from where you left it. It has not forgotten you.')).toBe(true);
    expect(back.includes('The Arbiter, low: "It has seen your opening once. Whatever caught it the first time will not catch it twice."')).toBe(true);
    expect(back.includes(`The wound you gave it is still open — ${left} of ${max}.`)).toBe(true);
    expect(back.includes('and it stalls, for one long breath')).toBe(false);
    expect(back.includes('do not let it get airborne again')).toBe(false);
    expect(((get().pendingMissionStinger as { line: string } | null)?.line ?? '').includes('It has not forgotten you.')).toBe(true);
    // The narrator's sheet for this ground now carries the flee.
    expect(deedsHereLine(get().worldMemory, 'broken_steeple')!.startsWith(`fled ${APEX} after wounding it (${left} of ${max} left); stood here before on the trail of`)).toBe(true);
    get().dismissMissionBeat();
    store.setState({ currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never, pendingMissionStinger: null, pendingMissionBeat: null, missionFleeHoldCell: null });
  });

  it('a flee that left nothing standing (every body out cold) comes back to the authored count, nothing owed', async () => {
    seed('mud_seas', { activeHunts: [{ id: BOG, stage: 5, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 70 });
    store.setState({ worldMemory: { ...get().worldMemory, deeds: {} } });
    get().advanceHunt(BOG);
    await settle(() => (get().currentScene?.enemies ?? []).filter((e) => e.name === 'Mud Harpy').length === 3);
    const sc = get().currentScene!;
    store.setState({ currentScene: { ...sc, enemyKnockedOut: sc.enemies.map(() => true), range: 'close' } as never, pendingMissionStinger: null, pendingMissionBeat: null });
    await act('flee');
    expect(stageFled(get().worldMemory, 'mud_seas', BOG, 5)?.n).toBe(0);
    seed('drakova', { activeHunts: [{ id: BOG, stage: 5, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 72 });
    seed('mud_seas', { activeHunts: [{ id: BOG, stage: 5, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 73 });
    const mark = get().gameLog.length;
    get().advanceHunt(BOG);
    await settle(() => (get().currentScene?.enemies ?? []).some((e) => e.name === 'Mud Harpy'));
    expect(get().currentScene!.enemies.filter((e) => e.name === 'Mud Harpy')).toHaveLength(3);
    expect(logText(mark).includes('stay down')).toBe(false);
    expect(logText(mark).includes('stays down')).toBe(false);
    get().dismissMissionBeat();
    store.setState({ currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never, pendingMissionStinger: null, pendingMissionBeat: null, missionFleeHoldCell: null });
  });

  it('⚠⚠ the last body dropped INSIDE a roll still raises the curtain (the clear-field re-arm on the dice path)', async () => {
    // A wandering body on the apex ground, one hit from dead; the attack's
    // kill lands in resolveRollStep, after the per-action tail has already
    // checked the ground with the body still up.
    seed('broken_steeple', { activeHunts: [{ id: BOG, stage: 6, tracked: true, acceptedAt: 0 }], inventory: withToken("Eshren's Name-Token"), hoursElapsed: 80 });
    store.setState({ worldMemory: { ...get().worldMemory, deeds: {} } });
    const sc = get().currentScene!;
    const wanderer = { id: 'w_dbg', name: 'Mud Wasp', hp: 1, ac: 1, damage: '1d2', rarity: 'Common', tags: [], description: 'a wasp', xp: 1, loot: [], abilities: [], resistances: [], weaknesses: [] };
    store.setState({ currentScene: { ...sc, enemies: [wanderer], enemyHps: [1], enemyKnockedOut: [false], enemyStatuses: [[]], enemyAmbushUsed: [false], enemyArmorShred: [0], enemyCorruptionStacks: [0], activeEnemyIdx: 0, range: 'close' } as never, pendingMissionStinger: null, pendingMissionBeat: null });
    for (let round = 0; round < 6 && !(get().currentScene?.enemies ?? []).some((e) => e.name === APEX); round++) await act('attack');
    await settle(() => (get().currentScene?.enemies ?? []).some((e) => e.name === APEX));
    expect((get().currentScene?.enemies ?? []).some((e) => e.name === APEX)).toBe(true);
    const storeSrc = src('app', 'state', 'gameStore.ts');
    expect(storeSrc.includes('rearmAfterRoll(get, set, grantStageItems, hadLive);')).toBe(true);
    expect(storeSrc.includes('const hadLive = fieldHasLiveHostiles(get().currentScene);')).toBe(true);
    get().dismissMissionBeat();
    store.setState({ currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never, pendingMissionStinger: null, pendingMissionBeat: null, missionFleeHoldCell: null });
  });

  it('the writers live outside gameStore (the line ratchet) and the store calls each once', () => {
    const store_ = src('app', 'state', 'gameStore.ts');
    expect(store_.split('\n').length).toBeLessThan(37000);
    expect(store_.includes('noteMissionFlee(get, set, currentScene);')).toBe(true);
    expect(store_.includes('noteMissionGroundsUnderfoot(get, set);')).toBe(true);
    expect(store_.includes('missionArrivalLines(get().player, get().worldMemory)')).toBe(true);
    const arrival = src('app', 'state', 'stageArrival.ts');
    expect(arrival.includes('healStageDebtsAtArrival(get, set, grantStageItems);\n  noteMissionGroundsUnderfoot(get, set);\n  armSpawnStagesAtArrival(get, set);')).toBe(true);
  });
});
