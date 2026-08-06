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
 * OTA-1104 — THE SHAKEDOWN, THE CLIENT'S COAT, AND THE MUMBLE.
 *
 * Three owner decisions in one OTA, each with its contract:
 *  1. PAY THEM OFF: caught at a vendor's pocket WITH enough TC → the choice
 *     (pay = quiet, no fight; refuse = the old caught fight). Without the TC
 *     there is no choice — straight to steel.
 *  2. ESCORT LEADERS ARE MARKS: caught robbing your own client kills the
 *     mission, costs a fine, and the WHOLE party fights.
 *  3. THE MUMBLE: a clean lift is remembered by the ledger, and the victim
 *     eventually notices the loss out loud — without suspecting you.
 */
jest.setTimeout(60_000);

import { useGameStore } from '../app/state/gameStore';
import { pocketLossMumble, getRelation } from '../app/engine/npcMemory';
import type { NpcRelation } from '../app/engine/types';

beforeAll(async () => {
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  await useGameStore.getState().hydrate();
  await useGameStore.getState().startNewGame({ name: 'Fingers', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
  useGameStore.getState().skipTutorial?.();
});

const scene = () => useGameStore.getState().currentScene!;
const logText = () => useGameStore.getState().gameLog.map((e) => String(e.text)).join('\n');
const relation = (): NpcRelation => ({
  id: 'roadside:grit_maalen', name: 'Grit Maalen', firstMetAt: 0, lastSeenAt: 0, lastSeenHours: 0,
  meetings: 2, trades: 0, tcTraded: 0, contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0,
});
describe('OTA-1104 — pay them off when caught (vendor)', () => {
  it('⚠ caught WITH the TC: the shakedown is offered, and nothing else can happen until it resolves', () => {
    putVendor(100, 0);
    const realRandom = Math.random;
    Math.random = () => 0.0; // d20 = 1 vs DC 11 — caught; STE 0 < quiet-fail 14
    try { useGameStore.getState().pickpocketPerson('Grit'); } finally { Math.random = realRandom; }
    const p = useGameStore.getState().pendingPayoff;
    expect(p).toBeTruthy();
    expect(p!.amount).toBe(20); // sketchy tier
    // No fight yet — the offer holds the steel back.
    expect(useGameStore.getState().currentScene?.vendor).toBeTruthy();
    expect(useGameStore.getState().currentScene?.enemies ?? []).toHaveLength(0);
    // ...and the grip refuses every other action.
    useGameStore.getState().submitPlayerAction('look around');
    expect(useGameStore.getState().pendingPayoff).toBeTruthy();
    expect(logText()).toContain('Settle it');
  });

  it('PAY: the coin leaves, no fight starts, and THEY remember the wrong', () => {
    const before = useGameStore.getState().player!.tc;
    useGameStore.getState().resolvePayoff(true);
    const after = useGameStore.getState().player!;
    expect(after.tc).toBe(before - 20);
    expect(useGameStore.getState().pendingPayoff).toBeNull();
    expect(useGameStore.getState().currentScene?.vendor).toBeTruthy();
    expect(useGameStore.getState().currentScene?.enemies ?? []).toHaveLength(0);
    expect(getRelation(useGameStore.getState().worldMemory, 'roadside:grit_maalen')?.wrongs).toBe(1);
    expect(logText()).toContain('waiting palm');
  });

  it('REFUSE: the fight the payoff was holding back', () => {
    putVendor(100, 0);
    const realRandom = Math.random;
    Math.random = () => 0.0;
    try { useGameStore.getState().pickpocketPerson('Grit'); } finally { Math.random = realRandom; }
    expect(useGameStore.getState().pendingPayoff).toBeTruthy();
    useGameStore.getState().resolvePayoff(false);
    expect(useGameStore.getState().currentScene?.vendor).toBeNull();
    expect(useGameStore.getState().currentScene?.enemies).toHaveLength(1);
    expect(logText()).toContain('catches your hand mid-lift');
  });

  it('⚠ caught WITHOUT the TC: no offer, straight to steel', () => {
    putVendor(5, 0); // sketchy price is 20 — the pouch can't cover it
    const realRandom = Math.random;
    Math.random = () => 0.0;
    try { useGameStore.getState().pickpocketPerson('Grit'); } finally { Math.random = realRandom; }
    expect(useGameStore.getState().pendingPayoff).toBeNull();
    expect(useGameStore.getState().currentScene?.vendor).toBeNull();
    expect(useGameStore.getState().currentScene?.enemies).toHaveLength(1);
    expect(logText()).toContain(`pouch can't cover`);
  });
});

describe('OTA-1104 — the client’s coat (escort leaders)', () => {
  const putEscort = (tc: number, stealth: number) => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      pendingTalk: null, pendingParley: null, pendingPayoff: null, pendingRolls: null,
      player: {
        ...p, tc, stats: { ...p.stats, stealth },
        stealHeat: 0, stealHeatHours: p.hoursElapsed ?? 0,
        activeFactionQuests: [{ id: 'q_escort_test', tracked: true, escort: { leaderName: 'Hessa Dorn', label: 'pilgrims', hp: 9, hpMax: 12, count: 3 } } as never],
      },
      currentScene: { ...scene(), enemies: [], enemyHps: [], vendor: null, vendorInFight: null, wanderer: null },
    });
  };

  it('⚠ CAUGHT: the mission dies, the fine is taken, and the WHOLE party fights', () => {
    putEscort(100, 0);
    const realRandom = Math.random;
    Math.random = () => 0.0; // d20 = 1 vs DC 14 — caught
    try { useGameStore.getState().pickpocketPerson('Hessa'); } finally { Math.random = realRandom; }
    const st = useGameStore.getState();
    // The mission is dead.
    expect((st.player!.activeFactionQuests ?? []).find((q) => q.id === 'q_escort_test')).toBeUndefined();
    // The fine came out (40, clamped to the pouch).
    expect(st.player!.tc).toBe(60);
    // The whole party: the named leader plus the rest of the pool of 3.
    expect(st.currentScene!.enemies).toHaveLength(3);
    expect(st.currentScene!.enemies[0]!.name).toBe('Hessa Dorn');
    expect(st.currentScene!.enemies[0]!.hp).toBeGreaterThanOrEqual(20); // a decent fight
    expect(logText()).toContain('We PAID you');
  });

  it('a clean lift leaves the mission standing', () => {
    putEscort(100, 30); // total ≥ 31 vs DC 14 — success regardless of the die
    const before = useGameStore.getState().player!;
    const beforeTc = before.tc; const beforeInv = before.inventory.length;
    const beforeNotes = (before.collectables ?? []).length;
    useGameStore.getState().pickpocketPerson('Hessa');
    const after = useGameStore.getState().player!;
    expect((after.activeFactionQuests ?? []).find((q) => q.id === 'q_escort_test')).toBeTruthy();
    expect(useGameStore.getState().currentScene?.enemies ?? []).toHaveLength(0);
    const gained = after.tc > beforeTc || after.inventory.length > beforeInv
      || (after.collectables ?? []).length > beforeNotes;
    expect(gained).toBe(true);
  });
});

describe('OTA-1104 — the mumble', () => {
  it('a clean lift is recorded on the ledger, not as a wrong', () => {
    putVendor(100, 30); // success regardless of the die
    useGameStore.getState().pickpocketPerson('Grit');
    const rel = getRelation(useGameStore.getState().worldMemory, 'roadside:grit_maalen');
    expect(rel?.pocketsLifted).toBe(1);
    expect(rel?.wrongs).toBe(0);
  });

  it('pocketLossMumble speaks while a loss is unmumbled, then goes quiet', () => {
    const rel = { ...relation(), pocketsLifted: 1, pocketsMumbled: 0 };
    const line = pocketLossMumble(rel, 'Grit Maalen');
    expect(line).toBeTruthy();
    expect(line!).toContain('Grit Maalen');
    // Delivered — nothing further owed.
    expect(pocketLossMumble({ ...rel, pocketsMumbled: 1 }, 'Grit Maalen')).toBeNull();
    // Never lifted → never mumbles; the innocent don't pat their pockets.
    expect(pocketLossMumble(relation(), 'Grit Maalen')).toBeNull();
    expect(pocketLossMumble(undefined, 'Grit Maalen')).toBeNull();
  });

  it('⚠ the mumble NEVER accuses — the player must read as unsuspected', () => {
    // All three variants, by contract: no "you", no "thief", no accusation.
    for (let i = 0; i < 3; i++) {
      const line = pocketLossMumble({ ...relation(), pocketsLifted: 5, pocketsMumbled: i }, 'Grit Maalen')!;
      expect(line.toLowerCase()).not.toMatch(/\byou\b(?!r way)/);
      expect(line.toLowerCase()).not.toContain('thief');
      expect(line.toLowerCase()).not.toContain('stolen');
    }
  });
});

// putVendor is shared by the vendor and mumble describes — hoisted here.
function putVendor(tc: number, stealth: number) {
  const p = useGameStore.getState().player!;
  useGameStore.setState({
    pendingTalk: null, pendingParley: null, pendingPayoff: null, pendingRolls: null,
    player: {
      ...p, tc, stats: { ...p.stats, stealth },
      stealHeat: 0, stealHeatHours: p.hoursElapsed ?? 0, activeFactionQuests: [],
    },
    currentScene: {
      ...scene(), enemies: [], enemyHps: [], wanderer: null, vendorInFight: null,
      vendor: {
        id: 'roadside_991', name: 'Grit Maalen', faction: null, title: 'Road Hawker',
        demeanor: 'sketchy', offers: [{ itemName: 'Wild Onion', price: 3 }],
      } as never,
    },
    worldMemory: {
      ...useGameStore.getState().worldMemory,
      npcRelations: { 'roadside:grit_maalen': relation() },
    },
  });
}
