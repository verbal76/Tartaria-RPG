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

// ⚠⚠⚠ OTA-1624 — THE REFUSAL SPEAKS FOR EVERY FAMILY.
//
// From the owner's 09-02 log audit ("find every piece of it that isn't
// following the missions or is not reacting like it should"): every non-fight
// stage verb is gated on `!inCombat` — the OTA-1217 rule, you cannot study a
// room while it is trying to kill you — and P19 gave the HUNT branch a voice
// for it: "That is the right move for X — but not with something on you." The
// mystery and storyline branches never got the line. Right verb, right
// ground, something mid-swing, and nothing said at all — the same silence
// that had him typing a closed stage's verb for twenty minutes.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findMysteryById } from '../app/engine/mysteries';
import { findStorylineById } from '../app/engine/factionStorylines';
import { findHuntById } from '../app/engine/hunts';
import { stalledInCombat } from '../app/engine/missionTrace';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();
async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

const foe = { name: 'Gutter Rat', type: 'Beast', rarity: 'Common', hp: 40, damage: '1d4 piercing', abilityPoint: '+1', traits: [], loot: [] };

function seed(at: string, fields: Record<string, unknown>, inCombat: boolean) {
  const p = get().player!;
  store.setState({
    player: {
      ...p, ...placedAt(at), hubRoomId: null, stamina: 100, travelTarget: undefined, whisperCourse: null,
      activeHunts: [], activeMysteries: [], activeStorylines: [], activeFactionQuests: [], ...fields,
    } as never,
    pendingMissionBeat: null, pendingMissionStinger: null, missionCloseQueue: [],
  });
  const sc = get().currentScene!;
  store.setState({ currentScene: { ...sc, enemies: inCombat ? [foe as never] : [], enemyHps: inCombat ? [40] : [], enemyKnockedOut: inCombat ? [false] : [], activeEnemyIdx: 0, range: inCombat ? 'close' : null, enemyStatuses: inCombat ? [[]] : [], enemyAmbushUsed: inCombat ? [false] : [] } as never });
}
const withItem = (name: string) => [...(get().player?.inventory ?? []), { id: `t_${name.replace(/\W+/g, '_')}`, name, kind: 'misc', quantity: 1, tags: ['quest'] }];
const STALL = 'but not with something on you';

describe('OTA-1624 — the combat refusal names the mission, every family', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await get().hydrate();
    await get().startNewGame({ name: 'Stalled', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    get().skipTutorial?.();
    await settle(() => !!get().currentScene);
  });

  it('⚠⚠⚠ A MYSTERY verb typed mid-fight is answered, and the stage holds', async () => {
    const def = findMysteryById('mystery_temporal_watch')!;
    seed('buried_cities', { activeMysteries: [{ id: def.id, stage: 1, tracked: true }], inventory: withItem('Guild Eddy-Gauge') }, true);
    const mark = get().gameLog.length;
    await get().submitPlayerAction('search this ground');
    const said = get().gameLog.slice(mark).map((e) => e.text).join('\n');
    expect(said).toContain(`That is the right move for ${def.title}`);
    expect(said).toContain(STALL);
    expect(get().player!.activeMysteries!.find((m) => m.id === def.id)!.stage).toBe(1);
  });

  it('⚠⚠⚠ A STORYLINE verb typed mid-fight is answered too', async () => {
    const def = findStorylineById('story_reclaimer_highest_bidder')!;
    seed('hidden_market', { activeStorylines: [{ id: def.id, stage: 1, tracked: true }], inventory: withItem('Auction Floor-Warrant') }, true);
    const mark = get().gameLog.length;
    await get().submitPlayerAction('search this ground');
    const said = get().gameLog.slice(mark).map((e) => e.text).join('\n');
    expect(said).toContain(`That is the right move for ${def.title}`);
    expect(get().player!.activeStorylines!.find((m) => m.id === def.id)!.stage).toBe(1);
  });

  it('⚠⚠ the hunt line is unchanged — same sentence, same reader', async () => {
    const def = findHuntById('hunt_servants_doubter')!;
    seed('great_tartary_plains', { activeHunts: [{ id: def.id, stage: 2, tracked: true }] }, true);
    const mark = get().gameLog.length;
    await get().submitPlayerAction('search this ground');
    expect(get().gameLog.slice(mark).map((e) => e.text).join('\n')).toContain(`That is the right move for ${def.title}`);
  });

  it('⚠⚠ out of combat the same verb pays instead — the reader is only for the fight', async () => {
    const def = findMysteryById('mystery_temporal_watch')!;
    seed('buried_cities', { activeMysteries: [{ id: def.id, stage: 1, tracked: true }], inventory: withItem('Guild Eddy-Gauge') }, false);
    await get().submitPlayerAction('search this ground');
    await settle(() => get().player!.activeMysteries!.find((m) => m.id === def.id)!.stage > 1);
    expect(get().player!.activeMysteries!.find((m) => m.id === def.id)!.stage).toBe(2);
  });

  it('⚠ the reader keeps the hunt exclusions — a boss beat and an escape beat are not stalls', () => {
    const p = get().player!;
    expect(stalledInCombat({ ...p, activeHunts: [{ id: 'hunt_servants_doubter', stage: 4, tracked: true }], activeMysteries: [], activeStorylines: [] } as never, 'attack')).toBeNull();
    expect(stalledInCombat({ ...p, activeHunts: [], activeMysteries: [{ id: 'mystery_temporal_watch', stage: 2, tracked: true }], activeStorylines: [] } as never, 'stealth')?.title).toBe('Temporal Distortion Watch');
    // A paused contract is silent, as everywhere.
    expect(stalledInCombat({ ...p, activeHunts: [], activeMysteries: [{ id: 'mystery_temporal_watch', stage: 2, tracked: false }], activeStorylines: [] } as never, 'stealth')).toBeNull();
  });

  it('⚠ one reader, pinned: gameStore no longer keeps its own hunt-only copy', () => {
    const STORE = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    expect(STORE).toContain('.stalledInCombat(player, intent)');
    expect(STORE).not.toContain("if (next.checkKind === 'escape') return false; // fleeing IS combat");
  });
});
