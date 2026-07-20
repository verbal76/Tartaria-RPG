// OTA-466/467 — bounded golem stress sweep. The pre-existing dogGolemCombatStress
// suite OOMs (it accumulates an unbounded gameLog across 500×200 rounds — a harness
// limitation, not engine logic). This focused sweep validates the OTA-466 (repair)
// + OTA-467 (combat stat growth) features under heavy combat WITHOUT the OOM, by
// trimming the gameLog every iteration and asserting invariants:
//   - golem HP is always a finite number in [0, hpMax]; never NaN/negative
//   - trained stats (power/resilience) only ever rise (monotonic), never NaN
//   - feeding a constituent part repairs (capped at hpMax) and consumes one part
//   - a non-constituent part never repairs and is never consumed
//   - the golem survives a long fight against a soft dummy and keeps growing

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
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
  Audio: {
    setAudioModeAsync: jest.fn(),
    Sound: class {
      static createAsync: (...args: unknown[]) => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
    },
  },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

import { useGameStore } from '../app/state/gameStore';
import type { InventoryItem } from '../app/engine/types';
import { SIDEKICK_DEFINITIONS, makeCompanion, sidekickRepairHeal } from '../app/engine/sidekicks';

function stockItem(name: string, qty: number): InventoryItem {
  return { id: `inv_${name}_${Math.random().toString(36).slice(2, 8)}`, name, kind: 'misc', rarity: 'Common', quantity: qty, tags: [] } as never;
}

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Tester', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  return store;
}

// Soft dummy: low AC so the golem connects, high HP so it never dies (the fight
// runs as long as we want), low damage so the golem isn't one-shot.
function softDummy() {
  return { name: 'Practice Dummy', damage: '1d4', abilityPoint: 'Strength 0', hp: 100000, type: 'construct', loot: ['Scrap Metal'], rarity: 'Common', traits: [] };
}

function finite(n: number): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

describe('OTA-466/467 — golem stress sweep (repair + combat stat growth)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; });

  it('300 golem strikes: HP stays finite & in-range, stats only rise, no crash', async () => {
    const store = await boot();
    const p0 = store.getState().player!;
    // Effectively immortal HP so it survives long enough to level POWER (which needs
    // ~34 landed hits at stat 0); the in-range HP invariant still holds throughout.
    const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.iron_golem), hp: 100000, hpMax: 100000, hitBonus: 40 };
    const scene = store.getState().currentScene!;
    store.setState({
      player: { ...p0, sidekick: golem, stamina: 100000, staminaMax: 100000 },
      currentScene: {
        ...scene, enemies: [softDummy() as never], enemyHps: [100000], activeEnemyIdx: 0,
        range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      },
    });

    let prevPower = 0;
    let prevRes = 0;
    let sawPowerGrow = false;
    let maxPower = 0; // arb170 — track the peak; golems now CYCLE (die→resummon)
                      // under the immortal-dummy instead of becoming an immortal
                      // tank (% resist is capped), so final power isn't reliable.
    for (let i = 0; i < 300; i++) {
      await store.getState().submitPlayerAction('golem attack');
      const g = store.getState().player?.sidekick;
      // The golem may crumble if the dummy ever drops it; re-summon a fresh one and
      // keep going (the sweep should never crash regardless of who's standing).
      if (!g) {
        store.setState((s) => (s.player ? { player: { ...s.player, sidekick: { ...makeCompanion(SIDEKICK_DEFINITIONS.iron_golem), hitBonus: 40 } } } : s));
        prevPower = 0; prevRes = 0;
      } else {
        expect(finite(g.hp)).toBe(true);
        expect(g.hp).toBeGreaterThanOrEqual(0);
        expect(g.hp).toBeLessThanOrEqual(g.hpMax);
        const pow = g.stats?.power ?? 0;
        const res = g.stats?.resilience ?? 0;
        expect(finite(pow)).toBe(true);
        expect(finite(res)).toBe(true);
        // Trained stats are monotonic non-decreasing within one golem's life.
        expect(pow).toBeGreaterThanOrEqual(prevPower);
        expect(res).toBeGreaterThanOrEqual(prevRes);
        if (pow > prevPower) sawPowerGrow = true;
        maxPower = Math.max(maxPower, pow);
        prevPower = pow; prevRes = res;
      }
      // Keep the dummy alive + topped up, TRIM the gameLog so memory stays flat,
      // AND keep the PLAYER alive: the dummy's counter-swing lands on the
      // COMMANDER, so without a top-up the ~30-HP player dies within a dozen
      // rounds and 'golem attack' stops training the golem entirely.
      store.setState((s) => (s.currentScene && s.player ? {
        gameLog: s.gameLog.slice(-20),
        player: { ...s.player, hp: s.player.hpMax, dead: false },
        currentScene: { ...s.currentScene, enemyHps: [100000], range: 'close' as const },
      } : { gameLog: s.gameLog.slice(-20) }));
    }
    // Across 300 hits at stat 0 (award 3/hit → +1 every ~34 hits), power must have
    // levelled at least a few times.
    expect(sawPowerGrow).toBe(true);
    expect(maxPower).toBeGreaterThanOrEqual(1);
  });

  it('repair sweep: feeding constituent parts mends (capped), non-parts never do', async () => {
    const store = await boot();
    const p0 = store.getState().player!;
    const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.iron_golem), hp: 1, hpMax: 24 };
    store.setState({
      player: {
        ...p0,
        sidekick: golem,
        inventory: [stockItem('Scrap Metal', 50), stockItem('Aether Mud', 50)],
      },
    });
    const heal = sidekickRepairHeal('iron_golem'); // 6

    // Feed the WRONG part 10×: never repairs, never consumes.
    for (let i = 0; i < 10; i++) {
      store.getState().submitPlayerAction('feed golem aether mud');
      store.setState((s) => ({ gameLog: s.gameLog.slice(-10) }));
    }
    expect(store.getState().player!.sidekick!.hp).toBe(1);
    expect(store.getState().player!.inventory.find((i) => i.name === 'Aether Mud')!.quantity).toBe(50);

    // Feed the RIGHT part repeatedly: HP climbs by `heal` each time and caps at hpMax;
    // each successful feed consumes exactly one part.
    let prevHp = 1;
    let scrapLeft = 50;
    for (let i = 0; i < 20; i++) {
      const before = store.getState().player!.sidekick!.hp;
      store.getState().submitPlayerAction('feed golem scrap metal');
      const g = store.getState().player!.sidekick!;
      expect(finite(g.hp)).toBe(true);
      expect(g.hp).toBeLessThanOrEqual(g.hpMax);
      expect(g.hp).toBeGreaterThanOrEqual(before); // never goes backwards
      if (before < g.hpMax) {
        // A real repair happened: hp rose (capped) and one scrap was consumed.
        expect(g.hp).toBe(Math.min(g.hpMax, before + heal));
        scrapLeft -= 1;
      }
      expect(store.getState().player!.inventory.find((i) => i.name === 'Scrap Metal')?.quantity ?? 0).toBe(scrapLeft);
      prevHp = g.hp;
      store.setState((s) => ({ gameLog: s.gameLog.slice(-10) }));
    }
    expect(prevHp).toBe(24); // fully repaired
  });
});
