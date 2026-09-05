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
 * OTA-1687 — THE MISSION LAYER REMEMBERS ITSELF. Punch items 6–8 of the
 * contrary walker's list (docs/contrary-walker-bog-dragon-2026-09-05.md):
 *
 *   6. ABANDON + ACCEPT left every answered card shut — the encounter records
 *      (`family:id:stage`, phase `resolved`) outlived the record they belonged
 *      to, and the card component hides a resolved card. A dropped contract
 *      drops its conversations; the next accept starts them fresh.
 *   7. The wrong verb on the right ground was silent about the hunt — every
 *      matcher spoke only when the verb matched and the ground did not. A stage
 *      verb that pays nothing, typed on a stage's own cell, now draws the ask
 *      that stage prints on arrival.
 *   8. The escort clear narrated the NEXT beat on the spot (Mira reading the
 *      locket 46 tiles from her holding; the Dragon uncoiling from the steeple
 *      while the player stood on the Mud Seas) and again at the ground. The
 *      clear says the clear and the direction; the prose waits for the beat.
 */
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findHuntById } from '../app/engine/hunts';
import { stageUnderfoot } from '../app/engine/missionTrace';
import { armedEncounter } from '../app/engine/missionEncounterArm';
import { placedAt } from '../test-utils/placePlayer';

jest.setTimeout(120000);

const store = useGameStore;
const get = () => store.getState();
const BOG = 'hunt_bog_dragon';

async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

function seed(at: string, fields: Record<string, unknown>) {
  const p = get().player!;
  store.setState({
    player: {
      ...p, ...placedAt(at), hubRoomId: null, stamina: 100, travelTarget: undefined, whisperCourse: null,
      // The walker's allowance: a fresh boot has a tiny HP pool and the brood killed it.
      hp: 600, hpMax: 600, stats: { ...p.stats, strength: 20, dexterity: 20 },
      activeHunts: [], activeMysteries: [], activeStorylines: [], activeFactionQuests: [], missionEncounters: {}, ...fields,
    } as never,
    pendingMissionBeat: null, pendingMissionStinger: null, missionCloseQueue: [], missionFleeHoldCell: null,
    // A new character boots inside the gate room; the arrival arm refuses under a roof.
    activeBuildingId: null,
  } as never);
  const sc = get().currentScene!;
  store.setState({ currentScene: { ...sc, enemies: [], enemyHps: [], enemyKnockedOut: [], enemyStatuses: [], enemyAmbushUsed: [], activeEnemyIdx: 0, range: null } as never });
}
const token = (name: string) => ({ id: `t_${name.replace(/\W+/g, '_')}`, name, kind: 'misc', quantity: 1, tags: ['quest'] });
const logText = (from: number) => get().gameLog.slice(from).map((e) => e.text).join('\n');
/** The dice roller a player taps through (OTA-1219 trap #2: an open roll swallows the next input). */
function drain() { let g = 0; while (get().pendingRolls && g++ < 60) { const pr = get().pendingRolls!; const step = pr.steps[pr.currentStep]!; get().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 18)); } }
async function act(text: string) { await get().submitPlayerAction(text); drain(); await new Promise((r) => setTimeout(r, 150)); drain(); }

describe('OTA-1687 — the mission layer remembers itself', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Remembers', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    get().skipTutorial?.();
    await settle(() => !!get().currentScene);
    let last = -1;
    await settle(() => { const n = get().gameLog.length; const stable = n === last; last = n; return stable; }, 10000);
  });

  it('⚠⚠⚠ 6. ABANDON drops the mission\'s encounter records — and only that mission\'s', () => {
    seed('drakova', {
      activeHunts: [{ id: BOG, stage: 3, tracked: true, acceptedAt: 0 }],
      activeMysteries: [{ id: 'mystery_temporal_watch', stage: 1, tracked: false }],
      missionEncounters: {
        [`hunt:${BOG}:0`]: { key: `hunt:${BOG}:0`, phase: 'resolved', persuadeSpent: false, mocked: false },
        [`hunt:${BOG}:2`]: { key: `hunt:${BOG}:2`, phase: 'resolved', persuadeSpent: false, mocked: false },
        'mystery:mystery_temporal_watch:1': { key: 'mystery:mystery_temporal_watch:1', phase: 'fled', persuadeSpent: true, mocked: false },
      },
    });
    get().abandonContract('hunt', BOG);
    const enc = get().player!.missionEncounters ?? {};
    expect(Object.keys(enc)).toEqual(['mystery:mystery_temporal_watch:1']);
    expect(get().player!.activeHunts).toEqual([]);
    // Taken again, the reeve's conversation is fresh: the card arms and holds no record.
    store.setState({ player: { ...get().player!, activeHunts: [{ id: BOG, stage: 0, tracked: true, acceptedAt: 0 }] } as never });
    const armed = armedEncounter(get().player);
    expect(armed?.key).toBe(`hunt:${BOG}:0`);
    expect(get().player!.missionEncounters?.[armed!.key]).toBeUndefined();
  });

  it('⚠⚠⚠ 7. the wrong verb on the right ground says what the ground wants', async () => {
    // Stage 1 of the Bog Dragon: the Cradle of Dusk, a search. Type a parley.
    seed('cradle_of_dusk', { activeHunts: [{ id: BOG, stage: 1, tracked: true, acceptedAt: 0 }], inventory: [...get().player!.inventory, token("Reeve's Brass Token")] });
    const under = stageUnderfoot(get().player);
    expect(under).toEqual({ family: 'hunt', title: findHuntById(BOG)!.title, intent: 'investigate', ask: 'search this ground' });
    const mark = get().gameLog.length;
    await act('negotiate');
    expect(logText(mark)).toContain('The Arbiter taps the slate. "Not that. The Bog Dragon of Old Drakova wants you to search this ground here."');
    expect(get().player!.activeHunts![0]!.stage).toBe(1);
    // The same verb one tile off the cell draws nothing about the hunt — the ground has to match.
    const p = get().player!;
    store.setState({ player: { ...p, gridX: (p.gridX ?? 0) + 1, mapX: (p.mapX ?? 0) + 1 } as never });
    expect(stageUnderfoot(get().player)).toBeNull();
    const mark2 = get().gameLog.length;
    await act('negotiate');
    expect(logText(mark2)).not.toContain('Not that.');
    // A look is not an attempt at the stage — "look around" parses as investigate,
    // and on a parley stage it must not be scolded. A search there is.
    seed('monarch_waystation', { activeHunts: [{ id: BOG, stage: 2, tracked: true, acceptedAt: 0 }], inventory: [...get().player!.inventory, token("Reeve's Brass Token")] });
    const mark3 = get().gameLog.length;
    await act('look around');
    expect(logText(mark3)).not.toContain('Not that.');
    const mark4 = get().gameLog.length;
    await act('search this ground');
    expect(logText(mark4)).toContain('The Arbiter taps the slate. "Not that. The Bog Dragon of Old Drakova wants you to talk it through here."');
  });

  it('⚠⚠ 8. the escort clear says the clear and the direction; the next beat\'s prose waits for its ground', async () => {
    const hunt = findHuntById(BOG)!;
    const apexProse = hunt.stages[6]!.narration.slice(0, 40);
    // Stage 5 on the Mud Seas with the name-token: arriving arms the brood.
    seed('mud_seas', { activeHunts: [{ id: BOG, stage: 5, tracked: true, acceptedAt: 0 }], inventory: [...get().player!.inventory.filter((i) => i.name !== "Eshren's Name-Token"), token("Eshren's Name-Token")] });
    const mark = get().gameLog.length;
    // The arrival door's own arm (stageArrival → advanceHunt), called directly:
    // the subject here is the CLEAR, and a wandering roll on the step can hold
    // the arm for a turn (OTA-1605), which is not what this pin measures.
    get().advanceHunt(BOG);
    await settle(() => (get().currentScene?.enemies ?? []).some((e) => e.name === 'Mud Harpy'));
    const live = get().currentScene!;
    const brood = live.enemies.filter((e) => e.name === 'Mud Harpy');
    expect(brood.length).toBe(3);
    // Put the brood down one at a time (the OTA-1219 shape), then read the clear.
    for (let k = brood.length; k > 0; k--) {
      const sc = get().currentScene!;
      const alive = sc.enemies.filter((e, i) => e.name === 'Mud Harpy' && (sc.enemyHps[i] ?? 0) > 0);
      store.setState({ currentScene: { ...sc, enemies: alive, enemyHps: alive.map(() => 1), activeEnemyIdx: 0, range: 'close', enemyAmbushUsed: alive.map(() => false), enemyKnockedOut: alive.map(() => false), enemyStatuses: alive.map(() => []), enemyArmorShred: alive.map(() => 0), enemyCorruptionStacks: alive.map(() => 0) } as never });
      for (let round = 0; round < 6 && (get().currentScene?.enemies.length ?? 0) >= k; round++) {
        await get().submitPlayerAction('attack');
        while (get().pendingRolls) { const pr = get().pendingRolls!; const step = pr.steps[pr.currentStep]!; get().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 18)); }
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    await settle(() => (get().player!.activeHunts![0]!.stage ?? 0) === 6);
    const said = logText(mark);
    expect(said).toContain('The last of them is down.');
    expect(said).toContain('▸ Next: The Broken Steeple');
    expect(said.includes(apexProse)).toBe(false);
    // The close card carries the clear and the direction, not the apex prose.
    const card = get().pendingMissionBeat as { line: string; next?: string | null } | null;
    expect(card?.line).toBe('The last of them is down.');
    expect(card?.next ?? '').toContain('▸ Next: The Broken Steeple');
    get().dismissMissionBeat();
    // On the steeple, the beat happens: the prose prints and the Dragon rises.
    const p = get().player!;
    store.setState({ player: { ...p, ...placedAt('broken_steeple'), travelTarget: undefined, hubRoomId: null } as never });
    const mark2 = get().gameLog.length;
    await get().submitPlayerAction('look around');
    await settle(() => (get().currentScene?.enemies ?? []).some((e) => e.name === 'Bog Dragon (hunted)'));
    expect(logText(mark2).includes(apexProse)).toBe(true);
    // Tidy.
    const sc2 = get().currentScene!;
    store.setState({ currentScene: { ...sc2, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never, pendingMissionStinger: null, pendingMissionBeat: null });
  });
});
