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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));


/**
 * OTA-1056 — VENDORS DO NOT DIE.
 *
 * Owner's design call, and it closes the last open item of Phase 1. The death
 * half was never designed: it fell out of the caught-theft path converting the
 * vendor into an ordinary Enemy, which then flowed into the generic defeat
 * routine like any wasteland raider. Two things were wrong with that.
 *
 * (1) It breaks the game quietly. A killed armourer is the turn-in point for
 *     every contract chain that ends at their counter, and there is no dead-NPC
 *     list anywhere in the code — so the "death" was really just a scene wipe
 *     that the next scene regeneration undid. Nobody decided that; it happened.
 * (2) It paid better than the mechanic it competes with. The trader-enemy drops
 *     the first two items off the vendor's own shelf, so "steal -> get caught ->
 *     win the fight" beat stealing, and the target was back for a second round.
 *
 * So: you win the fight or you lose it, and either way they are still alive.
 * A successful THEFT still hands you the goods — that is what the steal roll is
 * for. A BEATING hands you nothing: they keep hold of the pack, and the room
 * turns you out.
 */
jest.setTimeout(60_000);

import { useGameStore, vendorNpcId } from '../app/state/gameStore';
import { getRelation, recordNpcSighting, npcRegard, regardPriceMult } from '../app/engine/npcMemory';
import { getRaces, getFactions } from '../app/engine/character';

const FACTION = 'forgotten_order';

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  return store;
}

/** The scene exactly as the caught-theft flip leaves it: vendor pulled off the
 *  counter, the trader-enemy in their place, and the person held on
 *  `vendorInFight` so there is something to restore. */
async function caughtStealing(name: string, opts: { inSettlement: boolean }) {
  const store = await boot(name);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildTraderEnemy } = require('../app/engine/vendors') as typeof import('../app/engine/vendors');
  const vendor = {
    id: 'v_submit_test', name: 'Sallow Vek', title: 'armorer', faction: FACTION,
    description: 'A trader.', demeanor: 'honest' as const,
    offers: [{ itemName: 'Trail Rations', price: 10 }, { itemName: 'Pocket Knife', price: 12 }],
  };
  const enemy = buildTraderEnemy(vendor);
  store.setState((s) => ({
    player: {
      ...s.player!,
      hubRoomId: opts.inSettlement ? 'outpost_central' : undefined,
      factionStanding: [
        ...s.player!.factionStanding.filter((r) => r.factionId !== FACTION),
        { factionId: FACTION, standing: 50 },
      ],
    },
    worldMemory: recordNpcSighting(
      s.worldMemory,
      { id: vendorNpcId(vendor), name: vendor.name, role: 'armorer', factionId: FACTION },
      { nowMs: 1, hoursElapsed: 0 },
    ),
    currentScene: {
      ...store.getState().currentScene!,
      vendor: null,
      vendorInFight: vendor as never,
      enemies: [enemy],
      enemyHps: [0],
      activeEnemyIdx: 0,
      range: 'mid',
    },
  }));
  return { store, vendor, enemy };
}

const feed = (store: typeof useGameStore, mark: number) =>
  store.getState().gameLog.slice(mark).filter((e) => e.channel !== 'debug').map((e) => e.text).join('\n');

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

describe('OTA-1056 — beating a trader does not kill them', () => {
  it('THE RULE: the defeat routine never runs for a vendor', async () => {
    const { store, vendor } = await caughtStealing('Bruiser', { inSettlement: true });
    const kills = store.getState().player!.milestones?.enemiesDefeated ?? 0;
    store.getState().resolveEnemyDefeat();

    // No corpse: not counted as a kill, not written to the bestiary.
    expect(store.getState().player!.milestones?.enemiesDefeated ?? 0).toBe(kills);
    expect(store.getState().worldMemory.defeatedEnemies ?? []).not.toContain(vendor.name);
  });

  it('the fight is over — no enemy left standing', async () => {
    const { store } = await caughtStealing('Ender', { inSettlement: true });
    store.getState().resolveEnemyDefeat();
    expect(store.getState().currentScene!.enemies).toHaveLength(0);
    expect(store.getState().currentScene!.range).toBeNull();
  });
});

describe('OTA-1056 — they keep every last thing', () => {
  it('NO LOOT. A beating is not a theft', async () => {
    // The trader-enemy's loot pool is the vendor's own first two offers, so the
    // old path handed you two items off the shelf for winning — a better item
    // source than the steal roll, repeatable on a target that was still there.
    const { store } = await caughtStealing('Grabby', { inSettlement: true });
    const before = store.getState().player!.inventory.length;
    const mark = store.getState().gameLog.length;
    store.getState().resolveEnemyDefeat();

    expect(store.getState().player!.inventory.length).toBe(before);
    const out = feed(store, mark);
    expect(out).not.toContain('You recover');
    expect(out).not.toContain('Trail Rations');
    expect(out).not.toContain('Pocket Knife');
  });

  it('...and the narration says so, in as many words', async () => {
    const { store } = await caughtStealing('Reader', { inSettlement: true });
    const mark = store.getState().gameLog.length;
    store.getState().resolveEnemyDefeat();
    const out = feed(store, mark);
    expect(out).toContain('never let go of the pack');
    expect(out).toContain('not one thing in it is yours');
  });
});

describe('OTA-1056 — the room turns you out', () => {
  it('in a settlement, the other traders and the watch run you off', async () => {
    const { store } = await caughtStealing('Runoff', { inSettlement: true });
    const mark = store.getState().gameLog.length;
    store.getState().resolveEnemyDefeat();
    const out = feed(store, mark);
    expect(out).toMatch(/watch|stallholders/);
    expect(out).toContain('walked out');
  });

  it('on the open road there is nobody to do it, so the trader leaves instead', async () => {
    // Getting this wrong would summon guards onto an empty stretch of flats.
    const { store } = await caughtStealing('Roadside', { inSettlement: false });
    const mark = store.getState().gameLog.length;
    store.getState().resolveEnemyDefeat();
    const out = feed(store, mark);
    expect(out).not.toMatch(/watch|stallholders/);
    expect(out).toContain('the poles are down');
  });

  it('you cannot simply turn round and start again — the counter is gone', async () => {
    const { store } = await caughtStealing('Repeater', { inSettlement: true });
    store.getState().resolveEnemyDefeat();
    expect(store.getState().currentScene!.vendor).toBeNull();
    expect(store.getState().currentScene!.vendorInFight).toBeNull();
  });
});

describe('OTA-1056 — it costs you, on both ledgers', () => {
  it('faction standing drops', async () => {
    const { store } = await caughtStealing('Pariah', { inSettlement: true });
    const before = store.getState().player!.factionStanding.find((r) => r.factionId === FACTION)!.standing;
    store.getState().resolveEnemyDefeat();
    const after = store.getState().player!.factionStanding.find((r) => r.factionId === FACTION)!.standing;
    expect(after).toBeLessThan(before);
  });

  it('and it goes on THEIR ledger as a wrong — so it is visible, and payable', async () => {
    // The whole reason it lands on the personal ledger rather than being a
    // permanent black mark: OTA-1053's amends give a road back.
    const { store, vendor } = await caughtStealing('Debtor', { inSettlement: true });
    store.getState().resolveEnemyDefeat();
    const rel = getRelation(store.getState().worldMemory, vendorNpcId(vendor))!;
    expect(rel.wrongs).toBe(1);
    expect(npcRegard(rel)).toBe('wronged');
    expect(regardPriceMult(npcRegard(rel))).toBeGreaterThan(1);
  });

  it('an ordinary enemy is completely unaffected by any of this', async () => {
    // The intercept keys off vendorInFight matching the active enemy by name.
    // A scene with no vendor in it must fall straight through to the normal
    // defeat routine, loot and kill count and all.
    const store = await boot('Normal');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildTraderEnemy } = require('../app/engine/vendors') as typeof import('../app/engine/vendors');
    const raider = { ...buildTraderEnemy({
      id: 'x', name: 'Mud Raider', title: '', faction: null, description: '',
      offers: [{ itemName: 'Trail Rations', price: 5 }], demeanor: 'honest' as const,
    }), factionId: undefined };
    const kills = store.getState().player!.milestones?.enemiesDefeated ?? 0;
    store.setState((s) => ({
      currentScene: { ...s.currentScene!, vendor: null, vendorInFight: null,
        enemies: [raider], enemyHps: [0], activeEnemyIdx: 0, range: 'mid' },
    }));
    store.getState().resolveEnemyDefeat();
    expect(store.getState().player!.milestones!.enemiesDefeated).toBe(kills + 1);
  });
});
