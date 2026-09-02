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

// ⚠⚠⚠ OTA-1625 — THE SUBDUAL PAYS THE SLATE.
//
// Found by the player-shaped walker on its first pass over the eighteen staged
// faction quests, three times in one run (fq_builders_survey,
// fq_architects_evidence, fq_revivalists_headline): the last human on the
// ground cracked for 20 on a 24 HP body — "They crumple, out cold. Loot them
// before they come to." — then "Nobody left standing — the fight is yours",
// then a strip that paid a Bone Crossbow and 14 TC. The stage read "Destroy
// the rogue constructs" and did not move.
//
// OTA-1612 made a subdued mark a defeated mark for the whisper chain, the
// hunt and the lead — `lootKnockedOutEnemy` runs `creditDefeatedTarget` before
// the splice. The faction slate was never on that list: its `'kill'` trigger
// fired from the kill path only. The player won, the game said so, and the
// contract went on waiting for a death that had already been declined.

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findFactionQuestById } from '../app/engine/factionQuests';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);
const store = useGameStore;
const get = () => store.getState();
async function settle(pred: () => boolean, ms = 4000) { const t0 = Date.now(); while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); }

const QUEST = 'fq_builders_survey';
const def = () => findFactionQuestById(QUEST)!;
const stageOf = () => (get().player?.activeFactionQuests ?? []).find((r) => r.id === QUEST)?.stage ?? -1;

/** The walker's ground, replayed: one human ambusher, out cold on 4 HP, the
 *  quest on its LAST stage (the one whose close reads "is done. Bring word"). */
function seedKnockedOutAmbusher(opts: { stage?: number; tracked?: boolean; vendorInFight?: boolean; neutral?: boolean } = {}) {
  const p = get().player!;
  const foe = {
    name: 'Reclaimer Ambusher', type: 'Human', rarity: 'Common', hp: 24,
    damage: '1d6 piercing', abilityPoint: '+3', traits: [], loot: [],
    carries: { weapons: ['Bone Crossbow'], armor: [], tc: 14 },
    ...(opts.neutral ? { factionNeutralFight: true } : {}),
  };
  store.setState({
    player: {
      ...p,
      ...placedAt('slack_flats'),
      hubRoomId: null,
      activeFactionQuestIds: [QUEST],
      activeFactionQuests: [{ id: QUEST, stage: opts.stage ?? def().stages!.length - 1, postedByFaction: 'stone_builders', acceptedAt: Date.now(), tracked: opts.tracked ?? true }],
    } as never,
    activeBuildingId: null,
    pendingMissionBeat: null, pendingMissionStinger: null, missionCloseQueue: [],
    currentScene: {
      ...get().currentScene!,
      enemies: [foe as never],
      enemyHps: [4],
      enemyKnockedOut: [true],
      activeEnemyIdx: 0,
      range: 'close',
      enemyStatuses: [[]], enemyAmbushUsed: [false],
      vendorInFight: opts.vendorInFight ? { name: foe.name } : undefined,
    } as never,
  });
}

describe('OTA-1625 — the subdual pays the slate', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Foreman', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ THE WALKER\'S RUN, REPLAYED: strip the man you knocked cold and the last stage closes', async () => {
    seedKnockedOutAmbusher();
    const last = def().stages!.length - 1;
    expect(stageOf()).toBe(last);
    get().lootKnockedOutEnemy();
    await settle(() => stageOf() > last);
    expect(stageOf()).toBe(def().stages!.length);
    // And it is not quiet about it (OTA-1622): the close card is up.
    const card = get().pendingMissionBeat ?? get().missionCloseQueue?.[0] ?? null;
    expect(card?.title).toBe(def().title);
    expect(card?.line).toContain('is done');
    // The strip still paid — mercy keeps its economy on top of the credit.
    expect((get().player?.inventory ?? []).some((i) => i.name === 'Bone Crossbow')).toBe(true);
  });

  it('⚠⚠ a middle stage moves too — the knockout is a kill for every stage that asks for one', async () => {
    seedKnockedOutAmbusher({ stage: 1 });
    get().lootKnockedOutEnemy();
    await settle(() => stageOf() === 2);
    expect(stageOf()).toBe(2);
    const card = get().pendingMissionBeat ?? get().missionCloseQueue?.[0] ?? null;
    expect(card?.line).toContain(def().stages![2]!.narration);
  });

  it('a PAUSED contract still ignores it, exactly as it ignores a kill', async () => {
    seedKnockedOutAmbusher({ stage: 1, tracked: false });
    get().lootKnockedOutEnemy();
    await new Promise((r) => setTimeout(r, 150));
    expect(stageOf()).toBe(1);
  });

  it('a yielded vendor is not a kill (OTA-1056) — no faction credit off a beaten shopkeeper', async () => {
    seedKnockedOutAmbusher({ stage: 1, vendorInFight: true });
    get().lootKnockedOutEnemy();
    await new Promise((r) => setTimeout(r, 150));
    expect(stageOf()).toBe(1);
  });

  it('a rescue captor (factionNeutralFight) pays no faction work, same as the kill path', async () => {
    seedKnockedOutAmbusher({ stage: 1, neutral: true });
    get().lootKnockedOutEnemy();
    await new Promise((r) => setTimeout(r, 150));
    expect(stageOf()).toBe(1);
  });

  it('source pin — the knockout path fires the same trigger the kill path does', () => {
    const src = readFileSync(join(__dirname, '../app/state/gameStore.ts'), 'utf8');
    const koPath = src.slice(src.indexOf('  lootKnockedOutEnemy() {'), src.indexOf('  stealFromVendor(itemName) {'));
    expect(koPath).toContain('creditDefeatedTarget(get, set, player, enemy, idx,');
    expect(koPath).toContain("advanceActiveFactionQuests(get, set, 'kill'); advanceMissionRoute(get, set);");
    expect(koPath).toContain('if (!enemy.factionNeutralFight)');
  });
});
