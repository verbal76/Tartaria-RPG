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

// ⚠⚠⚠ OTA-1612 — A SUBDUED MARK IS A DEFEATED MARK.
//
// Owner, typed into the game at 19:24:50 with the fight already behind him:
// "I killed the runner. I was supposed to get the folio as the loot I did not
// and when I kill him and I get the folio it is supposed to auto route me back
// to garrin."
//
// He had not killed the Chart Runner. His log, 19:22:13 — 25 damage on a 26 HP
// body: "They crumple, out cold. (1/26 HP) Loot them before they come to." Then
// "Nobody left standing — the fight is yours", then a strip that paid a Bone
// Knife, a Mud-Bound Cloak, Patched Cloth and 22 TC. No folio. No course home.
//
// Because the whisper hook, the hunt completion and the lead completion all
// lived inside `resolveEnemyDefeat`, and `lootKnockedOutEnemy` is a different
// path that never called any of it. The game told him he had won and then
// quietly failed his objective — and the Arbiter, correctly, went on saying
// "Still open — Defeat the Chart Runner".

import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findChain } from '../app/engine/whispers';
import { placedAt } from '../test-utils/placePlayer';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.setTimeout(180000);

const store = useGameStore;
const get = () => store.getState();

async function settle(pred: () => boolean, deadlineMs = 5000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

const CHAIN_ID = 'garrin_charts';
const chain = () => findChain(CHAIN_ID)!;

/** The mark, standing in the scene, knocked cold exactly as his log shows: one
 *  HP left on the body and the KO flag set. */
function seedSubduedMark(opts: { knockedOut: boolean } = { knockedOut: true }) {
  const p = get().player!;
  const c = chain().content;
  const mark = {
    name: c.fetchEnemy, type: 'Human', rarity: 'Common', hp: 26,
    damage: '1d8 slashing', abilityPoint: '+9', traits: [], loot: [],
    carries: { weapons: ['Bone Knife'], armor: [], tc: 22 },
  };
  store.setState({
    player: {
      ...p,
      ...placedAt('reclaimers_stake'),
      hubRoomId: null,
      // The whisper mid-flight: the job taken, the mark not yet down.
      activeWhispers: [{
        id: CHAIN_ID, stage: 'fetch_active', targetMapX: 41, targetMapY: 20,
        targetGridX: 20, targetGridY: 20, plantedAtHour: 0,
      } as never],
      inventory: p.inventory.filter((i) => i.name !== c.stolen.name),
    } as never,
    activeBuildingId: null,
    currentScene: {
      ...get().currentScene!,
      enemies: [mark as never],
      enemyHps: [1],
      enemyKnockedOut: [opts.knockedOut],
      activeEnemyIdx: 0,
      range: 'close',
      enemyStatuses: [[]], enemyAmbushUsed: [false],
    } as never,
  });
}

const hasFolio = () =>
  (get().player?.inventory ?? []).some((i) => i.name === chain().content.stolen.name && i.quantity > 0);
const whisperStage = () =>
  (get().player?.activeWhispers ?? []).find((w) => w.id === CHAIN_ID)?.stage;

describe('OTA-1612 — the subdued mark counts', () => {
  beforeAll(async () => {
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Runner', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
  });

  it('⚠⚠⚠ HIS RUN, REPLAYED: strip the man you knocked cold and the folio comes off him', () => {
    seedSubduedMark();
    expect(hasFolio()).toBe(false);
    expect(whisperStage()).toBe('fetch_active');
    get().lootKnockedOutEnemy();
    // The thing he went there for.
    expect(hasFolio()).toBe(true);
    // And the chain moves on, so Garrin is owed instead of the job hanging.
    expect(whisperStage()).toBe('fetch_returned');
  });

  it('⚠⚠⚠ AND THE COURSE TURNS FOR HOME — "it is supposed to auto route me back to garrin"', () => {
    seedSubduedMark();
    // A live course pointed at the mark is what the return re-points.
    const p0 = get().player!;
    store.setState({ player: { ...p0, whisperCourse: { gridX: 1, gridY: 1, label: 'the Chart Runner' } } as never });
    get().lootKnockedOutEnemy();
    expect(get().player?.whisperCourse?.label).toBe(chain().content.returnRouteLabel);
  });

  it('⚠⚠ the knockout keeps its own economy — mercy still pays, on top of the credit', () => {
    seedSubduedMark();
    const tc0 = get().player!.tc;
    get().lootKnockedOutEnemy();
    // carries.tc is 22; the mercy premium (2d6 × tier) rides on top of it, so a
    // live capture is strictly better paid than the purse alone.
    expect(get().player!.tc).toBeGreaterThan(tc0 + 22);
    // The kit still comes off the body.
    expect((get().player?.inventory ?? []).some((i) => i.name === 'Bone Knife')).toBe(true);
  });

  it('⚠⚠ the kill path still credits exactly the same, through the same function', () => {
    seedSubduedMark({ knockedOut: false });
    // Not knocked out — dead. The kill path's credit is now the shared one.
    store.setState({
      currentScene: { ...get().currentScene!, enemyHps: [0], enemyKnockedOut: [false] } as never,
    });
    get().resolveEnemyDefeat();
    expect(hasFolio()).toBe(true);
    expect(whisperStage()).toBe('fetch_returned');
  });

  it('⚠⚠ a vendor yields, they do not die — no contract credit off a beaten shopkeeper', () => {
    seedSubduedMark();
    const c = chain().content;
    // OTA-1056's rule, now guarded on the knockout path too: the body in the
    // scene IS the vendor in the fight.
    store.setState({
      currentScene: {
        ...get().currentScene!,
        vendorInFight: { name: c.fetchEnemy } as never,
      } as never,
    });
    get().lootKnockedOutEnemy();
    expect(hasFolio()).toBe(false);
    expect(whisperStage()).toBe('fetch_active');
  });

  it('⚠ one credit rule, one implementation — both win paths call it', () => {
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const calls = GS.split('creditDefeatedTarget(get, set, player, enemy').length - 1;
    expect(calls).toBe(2); // the kill path and the knockout path, and nothing else
    // The credit rule itself no longer lives inline in the combat path.
    const DC = readFileSync(join(__dirname, '..', 'app', 'state', 'defeatCredit.ts'), 'utf8');
    expect(DC).toContain('export function creditDefeatedTarget(');
    expect(DC).toContain("w.id === live.id ? { ...w, stage: 'fetch_returned' } : w,");
    // ⚠ And "still up" means CONSCIOUS, so a pack won by mercy can close its
    // escort stage — the win 1612 legitimizes.
    const QS = readFileSync(join(__dirname, '..', 'app', 'state', 'slices', 'questSlice.ts'), 'utf8');
    expect(QS).toContain('&& !(live!.enemyKnockedOut?.[i] ?? false),');
  });
});
