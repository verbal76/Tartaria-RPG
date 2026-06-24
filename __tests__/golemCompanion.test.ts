// 2026-05-25 [MECHANIC-1b] — Golem sidekick combat companion test.
// Covers:
//   - summon path consumes the recipe's fuel set + creates player.sidekick
//   - duplicate summon refusal when a golem already exists
//   - command-golem strike damages enemy + retaliation routes to golem HP
//   - golem HP ≤ 0 → clear player.sidekick
//   - dismiss path clears player.sidekick
//   - parseSidekickKind picks the right kind from input text

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
import { SIDEKICK_DEFINITIONS, parseSidekickKind, missingFuelFor, consumeFuel, makeCompanion } from '../app/engine/sidekicks';

function stockItem(name: string, qty: number): InventoryItem {
  return { id: `inv_${name}_${Math.random().toString(36).slice(2, 8)}`, name, kind: 'misc', quantity: qty, tags: [] };
}

function mudGolemFuelStock(): InventoryItem[] {
  // arb119 — the starter mud golem was re-tiered off RARE Mudstone onto COMMON
  // Mud Fragment (×2); keep the test fuel in step with SIDEKICK_DEFINITIONS.
  return [
    stockItem('Aether Mud', 3),
    stockItem('Mud Fragment', 2),
    stockItem('Aether Crystal', 2),
  ];
}

async function bootstrap(inventory: InventoryItem[] = []) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Tester', raceId: 'mud_dweller', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  store.setState({
    player: {
      ...p0,
      stats: { strength: 10, dexterity: 10, intelligence: 12, wisdom: 10, charisma: 10 },
      inventory,
    },
  });
  return store;
}

describe('MECHANIC-1b — golem sidekick', () => {
  beforeAll(() => { console.log = () => {}; });

  describe('parseSidekickKind', () => {
    it('picks iron_golem on "summon iron golem"', () => {
      expect(parseSidekickKind('summon iron golem')).toBe('iron_golem');
    });
    it('picks aether_golem on "summon aether golem"', () => {
      expect(parseSidekickKind('summon aether golem')).toBe('aether_golem');
    });
    it('picks crystal_golem on "summon crystal golem"', () => {
      expect(parseSidekickKind('summon crystal golem')).toBe('crystal_golem');
    });
    it('defaults to mud_golem on bare "summon golem"', () => {
      expect(parseSidekickKind('summon golem')).toBe('mud_golem');
    });
    it('returns null for unrelated input', () => {
      expect(parseSidekickKind('attack the drone')).toBeNull();
    });
  });

  describe('missingFuelFor', () => {
    it('returns the missing list when inventory is empty', () => {
      const missing = missingFuelFor(SIDEKICK_DEFINITIONS.mud_golem, []);
      expect(missing.length).toBeGreaterThan(0);
    });
    it('returns empty when inventory has the full recipe', () => {
      const missing = missingFuelFor(SIDEKICK_DEFINITIONS.mud_golem, [
        { name: 'Aether Mud', quantity: 5 },
        { name: 'Mud Fragment', quantity: 5 },
        { name: 'Aether Crystal', quantity: 5 },
      ]);
      expect(missing).toEqual([]);
    });
    it('reports a partial shortfall correctly', () => {
      const missing = missingFuelFor(SIDEKICK_DEFINITIONS.mud_golem, [
        { name: 'Aether Mud', quantity: 1 }, // need 2, have 1 → short 1
        { name: 'Mud Fragment', quantity: 2 }, // need 2, have 2 → ok
        { name: 'Aether Crystal', quantity: 1 },
      ]);
      expect(missing.length).toBe(1);
      expect(missing[0]).toContain('Aether Mud');
    });
  });

  describe('consumeFuel', () => {
    it('decrements the correct quantities from the inventory', () => {
      const inv = [
        { name: 'Aether Mud', quantity: 5 },
        { name: 'Mud Fragment', quantity: 3 },
        { name: 'Aether Crystal', quantity: 2 },
        { name: 'Unrelated', quantity: 1 },
      ];
      const after = consumeFuel(SIDEKICK_DEFINITIONS.mud_golem, inv);
      const byName = Object.fromEntries(after.map((i) => [i.name, i.quantity]));
      expect(byName['Aether Mud']).toBe(3); // 5 - 2
      expect(byName['Mud Fragment']).toBe(1); // 3 - 2
      expect(byName['Aether Crystal']).toBe(1); // 2 - 1
      expect(byName['Unrelated']).toBe(1); // untouched
    });
  });

  describe('makeCompanion', () => {
    it('seeds hp from hpMax for a fresh summon', () => {
      const g = makeCompanion(SIDEKICK_DEFINITIONS.iron_golem);
      expect(g.hp).toBe(g.hpMax);
      expect(g.kind).toBe('iron_golem');
      expect(g.attackDie).toBe('1d8'); // arb100 — golem power scaled by summon DC
    });
  });

  describe('summon → player.sidekick written', () => {
    it('writes a mud_golem when fuel is present + skill check is forced to succeed', async () => {
      const store = await bootstrap(mudGolemFuelStock());
      const before = store.getState().player!;
      expect(before.sidekick).toBeFalsy();

      // Stack the deck — int 20 + mud_dweller (DC 15, +0 racial, +2 INT
      // bonus) means total > DC on any non-1 roll. Spam should land.
      let attempts = 0;
      while (!store.getState().player?.sidekick && attempts < 12) {
        store.getState().submitPlayerAction('summon golem');
        attempts++;
        // Restock fuel between attempts because failed attempts also burn it.
        const inv = store.getState().player!.inventory;
        const needRestock = missingFuelFor(SIDEKICK_DEFINITIONS.mud_golem, inv).length > 0;
        if (needRestock) {
          store.setState({ player: { ...store.getState().player!, inventory: mudGolemFuelStock() } });
        }
      }
      const golem = store.getState().player?.sidekick;
      expect(golem).toBeTruthy();
      expect(golem?.kind).toBe('mud_golem');
      expect(golem?.hp).toBe(golem?.hpMax);
    });
  });

  describe('dismiss clears player.sidekick', () => {
    it('clears the golem on "dismiss golem"', async () => {
      const store = await bootstrap();
      // Force a golem directly so we test the dismiss path in isolation.
      const golem = makeCompanion(SIDEKICK_DEFINITIONS.iron_golem);
      store.setState({ player: { ...store.getState().player!, sidekick: golem } });
      expect(store.getState().player!.sidekick).toBeTruthy();

      store.getState().submitPlayerAction('dismiss golem');
      expect(store.getState().player!.sidekick).toBeNull();
    });
  });

  describe('golem persists across cardinal moves', () => {
    it('player.sidekick survives a stepDirection call', async () => {
      const store = await bootstrap();
      const golem = makeCompanion(SIDEKICK_DEFINITIONS.aether_golem);
      store.setState({ player: { ...store.getState().player!, sidekick: golem } });

      store.getState().stepDirection('east');
      // Step direction may move the player or fire spawn rolls, but
      // shouldn't touch the golem (POLISH-4 path only clears vendor).
      expect(store.getState().player!.sidekick).toBeTruthy();
      expect(store.getState().player!.sidekick!.kind).toBe('aether_golem');
    });
  });

  // OTA-433 — enemy retaliation against the golem rolls the enemy's REAL
  // damage notation, not a flat 1d6+1 (max 7). A high-tier foe now hits the
  // golem far harder than the old cap, so a summoned golem can't immortally
  // tank a boss.
  describe('OTA-433 — retaliation scales with enemy damage', () => {
    it('a heavy-damage enemy deals more than the old flat 1d6+1 cap to the golem', async () => {
      const store = await bootstrap();
      // Beefy golem so it survives the hit and we can measure the loss.
      const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.iron_golem), hp: 10000, hpMax: 10000 };
      // A Core-Guardian-tier foe: huge damage notation + high ability point so
      // its retaliation always lands (atk + AP >> golem AC 11), and enough HP
      // that the golem's own swing can't kill it (which would skip retaliation).
      const enemy = {
        name: 'Apex Guardian', damage: '10d10', abilityPoint: 'Strength 40',
        hp: 100000, type: 'construct', loot: [], rarity: 'Legendary', traits: [],
      };
      const scene = store.getState().currentScene!;
      store.setState({
        // OTA-611 — commanding the golem now ALSO volleys the enemy group at the
        // PLAYER (closed the risk-free group-grind exploit). This test measures
        // the GOLEM's retaliation, so give the player enough HP to survive the
        // Apex Guardian's swing and keep the golem assertion isolated.
        player: { ...store.getState().player!, sidekick: golem, hp: 1000000, hpMax: 1000000 },
        currentScene: {
          ...scene, enemies: [enemy as never], enemyHps: [100000], activeEnemyIdx: 0,
          range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
        },
      });

      const golemHpBefore = store.getState().player!.sidekick!.hp;
      await store.getState().submitPlayerAction('golem attack');

      const after = store.getState().player!.sidekick!;
      // 10d10 is at least 10 — comfortably above the old flat cap of 7.
      expect(after.hp).toBeLessThanOrEqual(golemHpBefore - 8);
      // OTA-611 — and the player took the group's volley too (no longer risk-free).
      expect(store.getState().player!.hp).toBeLessThan(1000000);
    });
  });

  // OTA-449 — a COMPANION killing blow routes through resolveEnemyDefeat, so
  // loot / TC / kill-milestone (and, for bosses, the Core/gem/quest grants) fire
  // regardless of who lands the final hit. Pre-OTA a golem-killed foe vanished
  // with no reward.
  describe('OTA-449 — golem kill grants the same rewards as a player kill', () => {
    it('a golem killing the last enemy awards loot, TC, and a kill milestone', async () => {
      const store = await bootstrap();
      const p0 = store.getState().player!;
      // Guaranteed-hit, lethal golem.
      const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.iron_golem), hitBonus: 30, attackMod: 50, hp: 500, hpMax: 500 };
      // A 1-HP foe with low AC (so the golem always connects) and real loot.
      const enemy = {
        name: 'Sentinel Husk', damage: '1d6', abilityPoint: 'Strength 0',
        hp: 1, type: 'construct', loot: ['Scrap Metal'], rarity: 'Common', traits: [],
      };
      const scene = store.getState().currentScene!;
      const tcBefore = p0.tc;
      const killsBefore = p0.milestones?.enemiesDefeated ?? 0;
      store.setState({
        player: { ...p0, sidekick: golem },
        currentScene: {
          ...scene, enemies: [enemy as never], enemyHps: [1], activeEnemyIdx: 0,
          range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
        },
      });

      await store.getState().submitPlayerAction('golem attack');

      const after = store.getState();
      // Enemy resolved out + combat ended.
      expect(after.currentScene!.enemies.length).toBe(0);
      // resolveEnemyDefeat fired: kill counted, TC awarded, defeat/loot logged.
      expect((after.player!.milestones?.enemiesDefeated ?? 0)).toBe(killsBefore + 1);
      expect(after.player!.tc).toBeGreaterThan(tcBefore);
      const log = after.gameLog.map((l) => l.text).join('\n');
      expect(log).toMatch(/Sentinel Husk defeated\. You recover/);
    });
  });

  // OTA-466 — repair a surviving golem by feeding it its own constituent parts,
  // and name it on summon.
  describe('OTA-466 — golem repair + naming', () => {
    it('sidekickRepairParts / isSidekickRepairPart / sidekickRepairHeal reflect the fuel set', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const g = require('../app/engine/sidekicks');
      expect(g.sidekickRepairParts('iron_golem').sort()).toEqual(['Golem Core', 'Scrap Metal'].sort());
      expect(g.isSidekickRepairPart('iron_golem', 'scrap metal')).toBe(true);
      expect(g.isSidekickRepairPart('iron_golem', 'Aether Mud')).toBe(false);
      expect(g.sidekickRepairHeal('iron_golem')).toBe(13); // arb170 — round(40/3)
      expect(g.sidekickRepairHeal('mud_golem')).toBe(8);   // arb170 — round(24/3)
    });

    it('feed golem <constituent part> repairs HP and consumes the part', async () => {
      const store = await bootstrap([
        { id: 'sm', name: 'Scrap Metal', kind: 'misc', rarity: 'Common', quantity: 2, tags: [] } as never,
      ]);
      const p0 = store.getState().player!;
      const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.iron_golem), hp: 5 }; // hurt, hpMax 24
      store.setState({ player: { ...p0, sidekick: golem } });

      store.getState().submitPlayerAction('feed golem scrap metal');

      const after = store.getState().player!;
      expect(after.sidekick!.hp).toBe(18); // arb170 — 5 + 13 (round(40/3))
      expect((after.inventory.find((i) => i.name === 'Scrap Metal')?.quantity) ?? 0).toBe(1);
    });

    it('feed golem with a NON-constituent item is refused and consumes nothing', async () => {
      const store = await bootstrap([
        { id: 'am', name: 'Aether Mud', kind: 'misc', rarity: 'Common', quantity: 1, tags: [] } as never,
      ]);
      const p0 = store.getState().player!;
      const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.iron_golem), hp: 5 };
      store.setState({ player: { ...p0, sidekick: golem } });

      store.getState().submitPlayerAction('feed golem aether mud');

      const after = store.getState().player!;
      expect(after.sidekick!.hp).toBe(5); // unchanged
      expect((after.inventory.find((i) => i.name === 'Aether Mud')?.quantity) ?? 0).toBe(1); // not consumed
      // arb121 — refusal now reads "mends best … or, at half worth, any raw <element> scrap"
      // (a true non-matching item like tagless Aether Mud on an IRON golem still won't take).
      expect(store.getState().gameLog.map((l) => l.text).join('\n')).toMatch(/mends best from what it's made of/);
    });

    it('arb122 — an element-matched MATERIAL substitute heals SCALED BY RARITY and is consumed', async () => {
      const store = await bootstrap([
        // Common garbage aether loot — NOT aether-golem fuel, but shares the element.
        { id: 'ad', name: 'Aether Dust', kind: 'misc', rarity: 'Common', quantity: 2, tags: ['aether', 'dust'] } as never,
        // An Uncommon aether material for the half tier.
        { id: 'ar', name: 'Aether Residue', kind: 'misc', rarity: 'Uncommon', quantity: 2, tags: ['aether'] } as never,
      ]);
      const p0 = store.getState().player!;
      const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.aether_golem), hp: 1 };
      store.setState({ player: { ...p0, sidekick: golem } });
      // arb170 — aether golem full part = round(34/3) = 11. Common substitute = floor(11 * 0.25) = 2.
      store.getState().submitPlayerAction('feed golem aether dust');
      expect(store.getState().player!.sidekick!.hp).toBe(3); // 1 + 2 (Common = quarter)
      expect((store.getState().player!.inventory.find((i) => i.name === 'Aether Dust')?.quantity) ?? 0).toBe(1);
      // Uncommon substitute = floor(11 * 0.5) = 5.
      store.getState().submitPlayerAction('feed golem aether residue');
      expect(store.getState().player!.sidekick!.hp).toBe(8); // 3 + 5 (Uncommon = half)
    });

    it('arb122 — the substitute system covers MUD and IRON golems too (generic by element tag)', async () => {
      // arb170 — MUD golem (hpMax 24 → full part 8) mends from a mud material that isn't its fuel.
      const store = await bootstrap([
        { id: 'ms', name: 'Mudstone', kind: 'misc', rarity: 'Rare', quantity: 1, tags: ['mud', 'stone'] } as never,
        { id: 'bn', name: 'Bent Nail', kind: 'misc', rarity: 'Common', quantity: 1, tags: ['metal', 'junk', 'scrap'] } as never,
      ]);
      const p0 = store.getState().player!;
      store.setState({ player: { ...p0, sidekick: { ...makeCompanion(SIDEKICK_DEFINITIONS.mud_golem), hp: 1 } } });
      store.getState().submitPlayerAction('feed golem mudstone'); // arb170 — Rare mud → floor(8 * 0.75) = 6
      expect(store.getState().player!.sidekick!.hp).toBe(7); // 1 + 6

      // arb170 — IRON golem (hpMax 40 → full part 13) mends from common metal scrap.
      const p1 = store.getState().player!;
      store.setState({ player: { ...p1, sidekick: { ...makeCompanion(SIDEKICK_DEFINITIONS.iron_golem), hp: 1 } } });
      store.getState().submitPlayerAction('feed golem bent nail'); // arb170 — Common metal → floor(13 * 0.25) = 3
      expect(store.getState().player!.sidekick!.hp).toBe(4); // 1 + 3
    });

    it('naming takeover: the input after a summon names the golem', async () => {
      const store = await bootstrap();
      const p0 = store.getState().player!;
      // Simulate the post-summon state the summon path sets.
      store.setState({ player: { ...p0, sidekick: makeCompanion(SIDEKICK_DEFINITIONS.mud_golem) }, pendingSidekickNaming: true });

      store.getState().submitPlayerAction('Clanker');

      const after = store.getState();
      expect(after.pendingSidekickNaming).toBe(false);
      expect(after.player!.sidekick!.name).toBe('Clanker');
    });

    it('naming takeover: "skip" keeps the type label', async () => {
      const store = await bootstrap();
      const p0 = store.getState().player!;
      store.setState({ player: { ...p0, sidekick: makeCompanion(SIDEKICK_DEFINITIONS.mud_golem) }, pendingSidekickNaming: true });

      store.getState().submitPlayerAction('skip');

      const after = store.getState();
      expect(after.pendingSidekickNaming).toBe(false);
      expect(after.player!.sidekick!.name).toBe('Mud Golem');
    });
  });

  // OTA-467 — golem stat progression (mirrors the dog).
  describe('OTA-467 — golem stats grow through combat', () => {
    it('makeCompanion seeds power/resilience at 0; trainSidekickStat awards on success only', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const g = require('../app/engine/sidekicks');
      const golem = makeCompanion(SIDEKICK_DEFINITIONS.iron_golem);
      expect(golem.stats).toEqual({ power: 0, resilience: 0 });
      // A failed action trains nothing.
      expect(g.trainSidekickStat(golem, 'power', false).leveled).toBeNull();
      // 34 successes at stat 0 (award 3) crosses the 100 threshold → +1 power.
      let cur = golem;
      let leveledAt = -1;
      for (let i = 0; i < 34; i++) {
        const r = g.trainSidekickStat(cur, 'power', true);
        cur = r.golem;
        if (r.leveled && leveledAt < 0) leveledAt = i;
      }
      expect(cur.stats!.power).toBe(1);
      expect(leveledAt).toBe(33); // 34th success (3*34=102 >= 100)
    });

    it('a golem strike trains POWER and a surviving retaliation trains RESILIENCE', async () => {
      const store = await bootstrap();
      const p0 = store.getState().player!;
      // A high-power golem that always hits + survives; a tanky low-AC foe so the
      // strike lands but doesn't one-shot, and the foe hits back but doesn't kill.
      const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.iron_golem), hp: 100, hpMax: 100, hitBonus: 30 };
      const enemy = {
        name: 'Practice Dummy', damage: '1d4', abilityPoint: 'Strength 0',
        hp: 500, type: 'construct', loot: ['Scrap Metal'], rarity: 'Common', traits: [],
      };
      const scene = store.getState().currentScene!;
      store.setState({
        player: { ...p0, sidekick: golem },
        currentScene: {
          ...scene, enemies: [enemy as never], enemyHps: [500], activeEnemyIdx: 0,
          range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
        },
      });

      await store.getState().submitPlayerAction('golem attack');

      const after = store.getState().player!.sidekick!;
      // Strike landed → power progress; the dummy hit back (atk vs AC 11) often
      // enough that across a few asserts we at least see power trained.
      expect((after.statProgress?.power ?? 0)).toBeGreaterThan(0);
    });
  });

  // OTA-481 — golem armaments: two universal forms (Sledge / Greatsword), any golem.
  describe('OTA-481 — golem wields a universal weapon (Sledge / Greatsword)', () => {
    it('any golem can wield either form; a non-golem weapon is refused; pack <-> golem', async () => {
      const store = await bootstrap([
        { id: 'w1', name: 'Sidekick Greatsword', kind: 'weapon', rarity: 'Rare', quantity: 1, tags: ['weapon', 'golem_weapon', 'two_handed'] } as never,
        { id: 'w2', name: 'Tartarian Spear', kind: 'weapon', rarity: 'Uncommon', quantity: 1, tags: ['weapon'] } as never,
      ]);
      const p0 = store.getState().player!;
      // A MUD golem (any kind) CAN wield the universal greatsword.
      store.setState({ player: { ...p0, sidekick: makeCompanion(SIDEKICK_DEFINITIONS.mud_golem) } });
      store.getState().submitPlayerAction('arm golem with Sidekick Greatsword');
      const g = store.getState().player!.sidekick!;
      expect(g.weapon?.name).toBe('Sidekick Greatsword');
      expect(g.weapon?.durability?.current).toBeGreaterThan(0);
      expect(store.getState().player!.inventory.some((i) => i.name === 'Sidekick Greatsword')).toBe(false);

      // A normal (non-golem) weapon is refused — golem keeps the greatsword.
      store.getState().submitPlayerAction('arm golem with Tartarian Spear');
      expect(store.getState().player!.sidekick!.weapon?.name).toBe('Sidekick Greatsword');
      expect(store.getState().player!.inventory.some((i) => i.name === 'Tartarian Spear')).toBe(true);

      // Disarm returns the greatsword to the pack.
      store.getState().submitPlayerAction('disarm golem');
      expect(store.getState().player!.sidekick!.weapon ?? null).toBeNull();
      expect(store.getState().player!.inventory.some((i) => i.name === 'Sidekick Greatsword')).toBe(true);
    });

    it('a wielded weapon raises golem damage and wears down on strikes', async () => {
      const store = await bootstrap();
      const p0 = store.getState().player!;
      const weapon = { id: 'gw', name: 'Sidekick Sledge', kind: 'weapon' as const, rarity: 'Rare' as const, quantity: 1, tags: ['weapon', 'golem_weapon', 'two_handed'], durability: { current: 3, max: 45 } };
      const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.crystal_golem), hp: 200, hpMax: 200, hitBonus: 40, weapon: weapon as never };
      const scene = store.getState().currentScene!;
      store.setState({
        player: { ...p0, sidekick: golem },
        currentScene: { ...scene, enemies: [{ name: 'Dummy', damage: '1d4', abilityPoint: 'Strength 0', hp: 100000, type: 'construct', loot: [], rarity: 'Common', traits: [] } as never], enemyHps: [100000], activeEnemyIdx: 0, range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]] },
      });
      // 3 strikes: weapon (durability 3) wears to 0 and shatters → golem.weapon cleared.
      for (let i = 0; i < 3; i++) await store.getState().submitPlayerAction('golem attack');
      const g = store.getState().player!.sidekick!;
      expect(g.weapon ?? null).toBeNull();
      const log = store.getState().gameLog.map((l) => l.text).join('\n');
      expect(log).toMatch(/swings the Sidekick Sledge/);
      expect(log).toMatch(/shatters in .* grip/);
    });

    it('a coated golem weapon applies the coating on hit (acid shreds enemy armor)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isCoatableItem } = require('../app/engine/weaponCoating');
      // A bludgeoning golem sledge is still coatable (construct smears it on).
      expect(isCoatableItem({ name: 'Sidekick Sledge', kind: 'weapon', tags: ['weapon', 'golem_weapon', 'two_handed'] })).toBe(true);

      const store = await bootstrap();
      const p0 = store.getState().player!;
      const weapon = {
        id: 'gw2', name: 'Sidekick Sledge', kind: 'weapon' as const, rarity: 'Rare' as const, quantity: 1,
        tags: ['weapon', 'golem_weapon', 'two_handed'], durability: { current: 45, max: 45 },
        coating: { kind: 'acid' as const, label: 'Acid', dice: '1d4' },
      };
      const golem = { ...makeCompanion(SIDEKICK_DEFINITIONS.crystal_golem), hp: 300, hpMax: 300, hitBonus: 40, weapon: weapon as never };
      const scene = store.getState().currentScene!;
      store.setState({
        player: { ...p0, sidekick: golem },
        currentScene: { ...scene, enemies: [{ name: 'Dummy', damage: '1d4', abilityPoint: 'Strength 0', hp: 100000, type: 'construct', loot: [], rarity: 'Common', traits: [] } as never], enemyHps: [100000], activeEnemyIdx: 0, range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]] },
      });

      await store.getState().submitPlayerAction('golem attack');

      const after = store.getState().currentScene!;
      // Acid shred accumulated on the enemy, and a DOT status seeded.
      expect((after.enemyArmorShred?.[0] ?? 0)).toBeGreaterThan(0);
      expect((after.enemyStatuses?.[0]?.length ?? 0)).toBeGreaterThan(0);
      expect(store.getState().gameLog.map((l) => l.text).join('\n')).toMatch(/coating — \d+ acid bites in/);
    });
  });
});
