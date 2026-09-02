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

// ⚠⚠⚠ OTA-1628 — THE WHISPER BEATS POP UP TOO.
//
// The player-shaped walker's first clean pass over all twenty-one whisper
// chains printed the shape of the problem in every report: five stages, one
// card, on the very last hand-over. The giver at the camp, the mark going
// down with the goods spilling into your pack, the giver waiting when you
// walked back — feed lines, under whatever ambush or loot came next. The
// owner's rule (OTA-1622, verbatim in questSlice.raiseMissionClose): *"every
// time you should finish a segment of a mission or a quest or whatever it is
// … it should pop up on your face."* Whatever it is includes a whisper.
//
// The two arrival beats moved out of gameStore into app/state/whisperBeats.ts
// (the store is pinned under 37,000 lines and had two to spare); the recovery
// beat is raised where the goods are granted, in defeatCredit.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findChain, makeStolenGoods } from '../app/engine/whispers';
import { placedAt } from '../test-utils/placePlayer';
import { playerGridCell } from '../app/state/playerGrid';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();
async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

const CHAIN = 'yulka_discs';
const chain = () => findChain(CHAIN)!;
const rec = () => (get().player?.activeWhispers ?? []).find((w) => w.id === CHAIN);
const card = () => get().pendingMissionBeat ?? get().missionCloseQueue?.[0] ?? null;

/** Yulka's record on the tile the player stands on, at nine in the evening. */
function seedOnTile(stage: string, extra: Record<string, unknown> = {}) {
  const p = { ...get().player!, ...placedAt('slack_flats'), hubRoomId: null };
  const days = Math.floor((p.hoursElapsed ?? 0) / 24);
  const g = playerGridCell(p);
  const c = chain().content;
  store.setState({
    player: {
      ...p,
      hoursElapsed: days * 24 + 21,
      activeWhispers: [{
        id: CHAIN, stage, plantedAtHour: 0,
        targetMapX: p.mapX ?? 0, targetMapY: p.mapY ?? 0, targetGridX: g.x, targetGridY: g.y,
        targetLocationId: p.currentLocationId, activeFromHour: 20, activeToHour: 4, ...extra,
      }],
      completedWhisperIds: [],
      inventory: p.inventory.filter((i) => i.name !== c.stolen.name),
    } as never,
    activeBuildingId: null,
    pendingMissionBeat: null, pendingMissionStinger: null, missionCloseQueue: [],
    currentScene: { ...get().currentScene!, enemies: [], enemyHps: [], enemyKnockedOut: [], activeEnemyIdx: 0, range: null } as never,
  });
}

describe('OTA-1628 — the whisper beats pop up too', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Listener', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ the meet is a card: Yulka at the fire, pointing at her bar', async () => {
    seedOnTile('planted');
    await get().submitPlayerAction('north');
    await get().submitPlayerAction('south');
    await settle(() => rec()?.stage === 'met_yulka');
    expect(rec()?.stage).toBe('met_yulka');
    expect(card()?.title).toBe(chain().title);
    expect(card()?.line).toBe(chain().content.sighting);
    expect(card()?.next).toContain('SPEAK TO YULKA');
  });

  it('⚠⚠⚠ the recovery is a card: the mark down, the Discs in the pack, the way back named', async () => {
    seedOnTile('fetch_active', { ctx: { thiefMapX: 0, thiefMapY: 0, thiefGridX: 0, thiefGridY: 0 } });
    const c = chain().content;
    const mark = { name: c.fetchEnemy, type: 'Human', rarity: 'Common', hp: 26, damage: '1d8 slashing', abilityPoint: '+9', traits: [], loot: [], carries: { weapons: ['Bone Knife'], armor: [], tc: 22 } };
    store.setState({ currentScene: { ...get().currentScene!, enemies: [mark as never], enemyHps: [1], enemyKnockedOut: [true], activeEnemyIdx: 0, range: 'close', enemyStatuses: [[]], enemyAmbushUsed: [false] } as never });
    get().lootKnockedOutEnemy();
    await settle(() => rec()?.stage === 'fetch_returned');
    expect(rec()?.stage).toBe('fetch_returned');
    expect(card()?.title).toBe(chain().title);
    expect(card()?.line).toBe(c.recoverLine);
    expect(card()?.granted?.join(' ')).toContain(c.stolen.name);
    expect(card()?.next).toContain(c.npcName);
  });

  it('⚠⚠⚠ the hand-back arm is a card: she sees the Discs, and the card says where the button is', async () => {
    seedOnTile('fetch_returned');
    const c = chain().content;
    store.setState({ player: { ...get().player!, inventory: [...get().player!.inventory, makeStolenGoods(chain())] } as never });
    await get().submitPlayerAction('north');
    await get().submitPlayerAction('south');
    await settle(() => rec()?.stage === 'handback');
    expect(rec()?.stage).toBe('handback');
    expect(card()?.title).toBe(chain().title);
    expect(card()?.line).toContain(`${c.npcName} sees`);
    expect(card()?.next).toContain('SPEAK TO YULKA');
    // And nothing is paid yet — the hand-over is still the player's to make (OTA-1613).
    expect((get().player?.completedWhisperIds ?? []).includes(CHAIN)).toBe(false);
  });

  it('source pin — the beats live in whisperBeats.ts, and gameStore calls them from the tile resolver', () => {
    const src = readFileSync(join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    expect(src).not.toContain('function fireWhisperMeet(');
    expect(src).not.toContain('function armWhisperHandback(');
    expect(src).toContain("WB().fireWhisperMeet(get, set, meet, meetChain);");
    expect(src).toContain("return WB().armWhisperHandback(get, set, ret, retChain);");
    const beats = readFileSync(join(__dirname, '../app/state/whisperBeats.ts'), 'utf8');
    expect((beats.match(/raiseMissionClose\(get, set, \{ title: chain\.title/g) ?? []).length).toBe(2);
    const credit = readFileSync(join(__dirname, '../app/state/defeatCredit.ts'), 'utf8');
    expect(credit).toContain('line: c.recoverLine,');
  });
});
