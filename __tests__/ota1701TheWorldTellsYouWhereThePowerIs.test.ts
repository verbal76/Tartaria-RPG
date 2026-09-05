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
 * OTA-1701 — THE WORLD TELLS YOU WHERE THE POWER IS.
 *
 * Owner, after his progression assessment: "Do not rebalance progression.
 * Surface the existing progression ecosystem. … Preserve player freedom: these
 * are suggestions and world knowledge, never gates or required objectives."
 *
 * The suite holds three things:
 *   · the line builders are pure and keyed off state the store already keeps —
 *     the first wall is silent, the second speaks, then a game-day of quiet;
 *     the variants follow the pack (a stale blade → the Crucible; a known climb
 *     → the Towers; neither → the hunts);
 *   · the death writes its killer, and the revive reads it once;
 *   · the store speaks at exactly the six places the OTA named, and NOTHING here
 *     refuses — no builder is consulted before a decision, only after one.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { useGameStore } from '../app/state/gameStore';
import { handlePlayerDeath } from '../app/state/combatResolution';
import { getRaces, getFactions } from '../app/engine/character';
import { spawnGuardianForCapital, isCoreGuardian } from '../app/engine/coreGuardians';
import { playerPowerScore, enemyPowerScore, powerMatchup } from '../app/engine/powerRating';
import { VENDORS } from '../app/engine/vendors';
import type { NpcRelation, PlayerCharacter, WorldMemory } from '../app/engine/types';
import * as PH from '../app/engine/progressionHints';

jest.setTimeout(60_000);

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const store = useGameStore;

const mem = (over: Partial<WorldMemory> = {}): WorldMemory => ({ ...(store.getState().worldMemory as WorldMemory), ...over });
const ctx = (over: Partial<PH.WallContext> = {}): PH.WallContext =>
  ({ priorWalls: 1, coresRecovered: 0, weaponRarity: 'Rare', knowsATower: false, nowHour: 100, ...over });

beforeEach(() => { PH._resetProgressionHints(); });

describe('OTA-1701 — the Arbiter after a Guardian wall', () => {
  it('is silent on the first wall and speaks on the second', () => {
    expect(PH.afterGuardianWall(ctx({ priorWalls: 0 }))).toBeNull();
    const line = PH.afterGuardianWall(ctx({ priorWalls: 1 }));
    expect(line).not.toBeNull();
    expect(line!.includes('That Guardian nearly buried you')).toBe(true);
  });

  it('then holds its tongue for a game-day and speaks again after', () => {
    expect(PH.afterGuardianWall(ctx({ nowHour: 100 }))).not.toBeNull();
    expect(PH.afterGuardianWall(ctx({ nowHour: 100 + PH.GUARDIAN_HINT_COOLDOWN_HOURS - 1 }))).toBeNull();
    expect(PH.afterGuardianWall(ctx({ nowHour: 100 + PH.GUARDIAN_HINT_COOLDOWN_HOURS }))).not.toBeNull();
  });

  it('names the Towers only once a chart has put one on the map, the hunts otherwise', () => {
    const towers = PH.afterGuardianWall(ctx({ knowsATower: true }))!;
    expect(towers.includes('old Towers')).toBe(true);
    PH._resetProgressionHints();
    const hunts = PH.afterGuardianWall(ctx({ knowsATower: false }))!;
    expect(hunts.includes('hunts are still posted')).toBe(true);
    expect(hunts.includes('Towers')).toBe(false);
  });

  it('a Common blade past the third Core draws the Crucible line over the others', () => {
    expect(PH.weaponIsStale('Common', PH.STALE_WEAPON_FROM_CORES)).toBe(true);
    expect(PH.weaponIsStale('Common', PH.STALE_WEAPON_FROM_CORES - 1)).toBe(false);
    expect(PH.weaponIsStale('Rare', 9)).toBe(false);
    expect(PH.weaponIsStale(null, 9)).toBe(true);
    const line = PH.afterGuardianWall(ctx({ weaponRarity: 'Uncommon', coresRecovered: 4, knowsATower: true }))!;
    expect(line.includes('Crucible')).toBe(true);
    expect(line.includes('Towers')).toBe(false);
  });

  it('never names the Beacon Rifle anywhere', () => {
    // Code only — the header quotes the owner's direction, which names it.
    const text = src('app', 'engine', 'progressionHints.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(/beacon rifle/i.test(text)).toBe(false);
  });
});

describe('OTA-1701 — the Arbiter after an apex wall', () => {
  it('speaks from the second flee on, once a game-day, and the deed ledger is the count', () => {
    expect(PH.afterApexWall(ctx({ priorWalls: 0 }))).toBeNull();
    const line = PH.afterApexWall(ctx({ priorWalls: 1 }))!;
    expect(line.includes('Twice now')).toBe(true);
    expect(PH.afterApexWall(ctx({ priorWalls: 2, nowHour: 101 }))).toBeNull();
    const deeds = { swamp: [
      { kind: 'fled' as const, ts: 1, hour: 1, who: 'Bog Dragon', hpLeft: 40, hpMax: 90 },
      { kind: 'fled' as const, ts: 2, hour: 2, who: 'Mud Wasp', n: 2 },
      { kind: 'visited' as const, ts: 3, hour: 3 },
    ] };
    expect(PH.apexWallsSoFar({ deeds } as unknown as WorldMemory)).toBe(1);
    expect(PH.apexWallsSoFar(undefined)).toBe(0);
  });
});

describe('OTA-1701 — towers, beacons, the stubborn seat, the revive', () => {
  it('the tower line fires once per climb a session and never for a crested one', () => {
    expect(PH.towerDiscovered('gc_a', true)).toBeNull();
    expect(PH.towerDiscovered('gc_a', false)).not.toBeNull();
    expect(PH.towerDiscovered('gc_a', false)).toBeNull();
    expect(PH.towerDiscovered('gc_b', false)).not.toBeNull();
  });

  it('the beacon line is for the FIRST beacon only and counts five collectors without naming the rifle', () => {
    expect(PH.beaconInHand(0)).toBeNull();
    const line = PH.beaconInHand(1)!;
    expect(line.includes('Five old collectors')).toBe(true);
    expect(/rifle/i.test(line)).toBe(false);
    expect(PH.beaconInHand(2)).toBeNull();
  });

  it('the revive reads the killer once — a Guardian speaks, anything else is silent', () => {
    expect(PH.afterRevive({ lastDeath: { enemyName: 'Mud Wasp', locationId: null, hour: 1, guardian: false } } as unknown as WorldMemory)).toBeNull();
    expect(PH.afterRevive(undefined)).toBeNull();
    const line = PH.afterRevive({ lastDeath: { enemyName: 'The Ashen Warden', locationId: 'asgardar', hour: 1, guardian: true } } as unknown as WorldMemory)!;
    expect(line.includes('The Ashen Warden put you in the ground')).toBe(true);
  });

  it('guardianWallsSoFar counts the flee ledger and the deaths together', () => {
    const m = { memorableEvents: [{ id: 'a', kind: 'mq_guardian_fled' }, { id: 'b', kind: 'first_kill' }], guardianDeaths: 2 } as unknown as WorldMemory;
    expect(PH.guardianWallsSoFar(m)).toBe(3);
    expect(PH.guardianWallsSoFar(undefined)).toBe(0);
  });
});

describe('OTA-1701 — the store', () => {
  let player: PlayerCharacter;
  beforeEach(async () => {
    await store.getState().startNewGame({ name: 'Stubborn', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    player = store.getState().player!;
  });

  it('⚠⚠ the death writes its killer and the count; the revive line reads it', () => {
    const guardian = spawnGuardianForCapital({ ...player, mainQuest: { ...player.mainQuest!, coresRecovered: ['a', 'b'] } }, 'asgardar')!;
    expect(isCoreGuardian(guardian)).toBe(true);
    store.setState((s) => ({
      player: { ...s.player!, hp: 0 },
      currentScene: { ...s.currentScene!, enemies: [guardian], activeEnemyIdx: 0 },
    }));
    handlePlayerDeath(store.getState, store.setState as any);
    const wm = store.getState().worldMemory;
    expect(store.getState().player?.dead).toBe(true);
    expect(wm.lastDeath?.guardian).toBe(true);
    expect(wm.lastDeath?.enemyName).toBe(guardian.name);
    expect(wm.guardianDeaths).toBe(1);
    expect(PH.guardianWallsSoFar(wm)).toBe(1);
    expect(PH.afterRevive(wm)!.includes(guardian.name)).toBe(true);
  });

  it('a death to anything else is written too, and counted as no Guardian wall', () => {
    const wasp = { ...spawnGuardianForCapital(player, 'asgardar')!, name: 'Mud Wasp', id: 'wasp', traits: [] } as any;
    expect(isCoreGuardian(wasp)).toBe(false);
    store.setState((s) => ({ player: { ...s.player!, hp: 0 }, currentScene: { ...s.currentScene!, enemies: [wasp], activeEnemyIdx: 0 } }));
    handlePlayerDeath(store.getState, store.setState as any);
    const wm = store.getState().worldMemory;
    expect(wm.lastDeath?.guardian).toBe(false);
    expect(wm.guardianDeaths ?? 0).toBe(0);
    expect(PH.afterRevive(wm)).toBeNull();
  });

  it('the stubborn line waits for the sixth Core and the numbers against you — and the Guardian still rises', () => {
    const late = { ...player, mainQuest: { ...player.mainQuest!, coresRecovered: ['1', '2', '3', '4', '5', '6'] } } as PlayerCharacter;
    const guardian = spawnGuardianForCapital(late, 'asgardar')!;
    expect(powerMatchup(playerPowerScore(late), enemyPowerScore(guardian))).toBe('danger');
    expect(PH.stubbornAtTheSeat(player, guardian)).toBeNull(); // no cores yet
    const line = PH.stubbornAtTheSeat(late, guardian)!;
    expect(line.includes('died proving they were stubborn')).toBe(true);
    expect(PH.stubbornAtTheSeat({ ...late, hoursElapsed: (late.hoursElapsed ?? 0) + 1 }, guardian)).toBeNull();
    // Never a gate: the summon path consults the builder AFTER the Guardian is
    // on the field, and appends only.
    const g = src('app', 'state', 'gameStore.ts');
    const at = g.indexOf('PH.stubbornAtTheSeat(player, guardian)');
    expect(at).toBeGreaterThan(-1);
    expect(g.slice(at, at + 400).includes("kind: 'mq_guardian_spawned'")).toBe(true);
    expect(/if \(PH\.[a-zA-Z]+\([^)]*\)\) return/.test(g)).toBe(false);
  });

  it('a smith recognises the beacon once; a familiar counter passes the rumour on while a known climb stands uncrested', () => {
    const smith = VENDORS.find((v) => /smith/i.test(v.title ?? ''))!;
    const grocer = VENDORS.find((v) => !PH.isSmith(v.id, v.name))!;
    expect(PH.isSmith(smith.id, smith.name)).toBe(true);
    const packed = { ...player, inventory: [...player.inventory, { id: 'b1', name: 'Aether Collection Beacon', kind: 'misc', quantity: 1 }] } as unknown as PlayerCharacter;
    expect(PH.holdsABeacon(packed)).toBe(true);
    expect(PH.holdsABeacon(player)).toBe(false);
    const stranger = null;
    const first = PH.vendorTowerRumour(mem(), packed, smith, stranger)!;
    expect(first.includes('Collector-tower work')).toBe(true);
    expect(PH.vendorTowerRumour(mem(), packed, smith, stranger)).toBeNull();
    expect(PH.vendorTowerRumour(mem(), packed, grocer, stranger)).toBeNull();
    const familiar = { id: 'x', name: grocer.name, meetings: 5, wrongs: 0, trades: 4, contractsTurnedIn: 0, contractsTaken: 0, tcTraded: 0 } as unknown as NpcRelation;
    expect(PH.vendorTowerRumour(mem(), player, grocer, familiar)).toBeNull(); // no tower known
    const known = mem({ unlockedGreatClimbs: ['gc_a'], greatClimbsCrested: [] });
    const rumour = PH.vendorTowerRumour(known, player, grocer, familiar)!;
    expect(rumour.includes('Climbers came through')).toBe(true);
    expect(PH.vendorTowerRumour(known, player, grocer, familiar)).toBeNull(); // 72h cooldown
    expect(PH.vendorTowerRumour(mem({ unlockedGreatClimbs: ['gc_a'], greatClimbsCrested: ['gc_a'] }), { ...player, hoursElapsed: 999 } as PlayerCharacter, grocer, familiar)).toBeNull();
  });

  it('the six hooks stand where the OTA put them, and the ratchet holds', () => {
    const g = src('app', 'state', 'gameStore.ts');
    expect(g.includes("import * as PH from '../engine/progressionHints';")).toBe(true);
    expect((g.match(/PH\.vendorTowerRumour\(get\(\)\.worldMemory, player, vendor, rel\)/g) ?? []).length).toBe(2);
    expect(g.includes('PH.afterGuardianWall(PH.wallContext(get().worldMemory, player, PH.guardianWallsSoFar(get().worldMemory)))')).toBe(true);
    expect(g.includes('PH.beaconInHand(nextDefeated.length)')).toBe(true);
    expect(g.includes('PH.towerDiscovered(gc.id,')).toBe(true);
    expect(g.split('\n').length - 1).toBeLessThanOrEqual(36_998);
    const sa = src('app', 'state', 'stageArrival.ts');
    expect(sa.includes('PH.afterApexWall(PH.wallContext(get().worldMemory, fledPl, priorApexWalls))')).toBe(true);
    expect(sa.indexOf('const priorApexWalls = PH.apexWallsSoFar(get().worldMemory);')).toBeLessThan(sa.indexOf('hpLeft: Math.max(1, apex.hp)'));
    const cr = src('app', 'state', 'combatResolution.ts');
    expect(cr.includes('guardianDeaths: (wm.guardianDeaths ?? 0) + (killerIsGuardian ? 1 : 0)')).toBe(true);
    const ss = src('app', 'state', 'slices', 'slotSlice.ts');
    expect(ss.includes('const ph = afterRevive(get().worldMemory);')).toBe(true);
    expect(ss.includes('lastDeath: undefined')).toBe(true);
  });
});
