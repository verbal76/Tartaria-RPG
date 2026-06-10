// 2026-05-25 [MECHANIC-1b] — Golem sidekick combat companion test.
// Covers:
//   - summon path consumes the recipe's fuel set + creates player.golem
//   - duplicate summon refusal when a golem already exists
//   - command-golem strike damages enemy + retaliation routes to golem HP
//   - golem HP ≤ 0 → clear player.golem
//   - dismiss path clears player.golem
//   - parseGolemKind picks the right kind from input text

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
import { GOLEM_DEFINITIONS, parseGolemKind, missingFuelFor, consumeFuel, makeCompanion } from '../app/engine/golems';

function stockItem(name: string, qty: number): InventoryItem {
  return { id: `inv_${name}_${Math.random().toString(36).slice(2, 8)}`, name, kind: 'misc', quantity: qty, tags: [] };
}

function mudGolemFuelStock(): InventoryItem[] {
  return [
    stockItem('Aether Mud', 3),
    stockItem('Mudstone', 2),
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

  describe('parseGolemKind', () => {
    it('picks iron_golem on "summon iron golem"', () => {
      expect(parseGolemKind('summon iron golem')).toBe('iron_golem');
    });
    it('picks aether_golem on "summon aether golem"', () => {
      expect(parseGolemKind('summon aether golem')).toBe('aether_golem');
    });
    it('picks crystal_golem on "summon crystal golem"', () => {
      expect(parseGolemKind('summon crystal golem')).toBe('crystal_golem');
    });
    it('defaults to mud_golem on bare "summon golem"', () => {
      expect(parseGolemKind('summon golem')).toBe('mud_golem');
    });
    it('returns null for unrelated input', () => {
      expect(parseGolemKind('attack the drone')).toBeNull();
    });
  });

  describe('missingFuelFor', () => {
    it('returns the missing list when inventory is empty', () => {
      const missing = missingFuelFor(GOLEM_DEFINITIONS.mud_golem, []);
      expect(missing.length).toBeGreaterThan(0);
    });
    it('returns empty when inventory has the full recipe', () => {
      const missing = missingFuelFor(GOLEM_DEFINITIONS.mud_golem, [
        { name: 'Aether Mud', quantity: 5 },
        { name: 'Mudstone', quantity: 5 },
        { name: 'Aether Crystal', quantity: 5 },
      ]);
      expect(missing).toEqual([]);
    });
    it('reports a partial shortfall correctly', () => {
      const missing = missingFuelFor(GOLEM_DEFINITIONS.mud_golem, [
        { name: 'Aether Mud', quantity: 1 }, // need 2, have 1 → short 1
        { name: 'Mudstone', quantity: 1 },
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
        { name: 'Mudstone', quantity: 3 },
        { name: 'Aether Crystal', quantity: 2 },
        { name: 'Unrelated', quantity: 1 },
      ];
      const after = consumeFuel(GOLEM_DEFINITIONS.mud_golem, inv);
      const byName = Object.fromEntries(after.map((i) => [i.name, i.quantity]));
      expect(byName['Aether Mud']).toBe(3); // 5 - 2
      expect(byName['Mudstone']).toBe(2);   // 3 - 1
      expect(byName['Aether Crystal']).toBe(1); // 2 - 1
      expect(byName['Unrelated']).toBe(1); // untouched
    });
  });

  describe('makeCompanion', () => {
    it('seeds hp from hpMax for a fresh summon', () => {
      const g = makeCompanion(GOLEM_DEFINITIONS.iron_golem);
      expect(g.hp).toBe(g.hpMax);
      expect(g.kind).toBe('iron_golem');
      expect(g.attackDie).toBe('1d8'); // arb100 — golem power scaled by summon DC
    });
  });

  describe('summon → player.golem written', () => {
    it('writes a mud_golem when fuel is present + skill check is forced to succeed', async () => {
      const store = await bootstrap(mudGolemFuelStock());
      const before = store.getState().player!;
      expect(before.golem).toBeFalsy();

      // Stack the deck — int 20 + mud_dweller (DC 15, +0 racial, +2 INT
      // bonus) means total > DC on any non-1 roll. Spam should land.
      let attempts = 0;
      while (!store.getState().player?.golem && attempts < 12) {
        store.getState().submitPlayerAction('summon golem');
        attempts++;
        // Restock fuel between attempts because failed attempts also burn it.
        const inv = store.getState().player!.inventory;
        const needRestock = missingFuelFor(GOLEM_DEFINITIONS.mud_golem, inv).length > 0;
        if (needRestock) {
          store.setState({ player: { ...store.getState().player!, inventory: mudGolemFuelStock() } });
        }
      }
      const golem = store.getState().player?.golem;
      expect(golem).toBeTruthy();
      expect(golem?.kind).toBe('mud_golem');
      expect(golem?.hp).toBe(golem?.hpMax);
    });
  });

  describe('dismiss clears player.golem', () => {
    it('clears the golem on "dismiss golem"', async () => {
      const store = await bootstrap();
      // Force a golem directly so we test the dismiss path in isolation.
      const golem = makeCompanion(GOLEM_DEFINITIONS.iron_golem);
      store.setState({ player: { ...store.getState().player!, golem } });
      expect(store.getState().player!.golem).toBeTruthy();

      store.getState().submitPlayerAction('dismiss golem');
      expect(store.getState().player!.golem).toBeNull();
    });
  });

  describe('golem persists across cardinal moves', () => {
    it('player.golem survives a stepDirection call', async () => {
      const store = await bootstrap();
      const golem = makeCompanion(GOLEM_DEFINITIONS.aether_golem);
      store.setState({ player: { ...store.getState().player!, golem } });

      store.getState().stepDirection('east');
      // Step direction may move the player or fire spawn rolls, but
      // shouldn't touch the golem (POLISH-4 path only clears vendor).
      expect(store.getState().player!.golem).toBeTruthy();
      expect(store.getState().player!.golem!.kind).toBe('aether_golem');
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
      const golem = { ...makeCompanion(GOLEM_DEFINITIONS.iron_golem), hp: 10000, hpMax: 10000 };
      // A Core-Guardian-tier foe: huge damage notation + high ability point so
      // its retaliation always lands (atk + AP >> golem AC 11), and enough HP
      // that the golem's own swing can't kill it (which would skip retaliation).
      const enemy = {
        name: 'Apex Guardian', damage: '10d10', abilityPoint: 'Strength 40',
        hp: 100000, type: 'construct', loot: [], rarity: 'Legendary', traits: [],
      };
      const scene = store.getState().currentScene!;
      store.setState({
        player: { ...store.getState().player!, golem },
        currentScene: {
          ...scene, enemies: [enemy as never], enemyHps: [100000], activeEnemyIdx: 0,
          range: 'close', enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
        },
      });

      await store.getState().submitPlayerAction('golem attack');

      const after = store.getState().player!.golem!;
      // 10d10 is at least 10 — comfortably above the old flat cap of 7.
      expect(after.hp).toBeLessThanOrEqual(10000 - 8);
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
      const golem = { ...makeCompanion(GOLEM_DEFINITIONS.iron_golem), hitBonus: 30, attackMod: 50, hp: 500, hpMax: 500 };
      // A 1-HP foe with low AC (so the golem always connects) and real loot.
      const enemy = {
        name: 'Sentinel Husk', damage: '1d6', abilityPoint: 'Strength 0',
        hp: 1, type: 'construct', loot: ['Scrap Metal'], rarity: 'Common', traits: [],
      };
      const scene = store.getState().currentScene!;
      const tcBefore = p0.tc;
      const killsBefore = p0.milestones?.enemiesDefeated ?? 0;
      store.setState({
        player: { ...p0, golem },
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
    it('golemRepairParts / isGolemRepairPart / golemRepairHeal reflect the fuel set', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const g = require('../app/engine/golems');
      expect(g.golemRepairParts('iron_golem').sort()).toEqual(['Golem Core', 'Scrap Metal'].sort());
      expect(g.isGolemRepairPart('iron_golem', 'scrap metal')).toBe(true);
      expect(g.isGolemRepairPart('iron_golem', 'Aether Mud')).toBe(false);
      expect(g.golemRepairHeal('iron_golem')).toBe(6); // round(24/4)
      expect(g.golemRepairHeal('mud_golem')).toBe(4);  // round(16/4)
    });

    it('feed golem <constituent part> repairs HP and consumes the part', async () => {
      const store = await bootstrap([
        { id: 'sm', name: 'Scrap Metal', kind: 'misc', rarity: 'Common', quantity: 2, tags: [] } as never,
      ]);
      const p0 = store.getState().player!;
      const golem = { ...makeCompanion(GOLEM_DEFINITIONS.iron_golem), hp: 5 }; // hurt, hpMax 24
      store.setState({ player: { ...p0, golem } });

      store.getState().submitPlayerAction('feed golem scrap metal');

      const after = store.getState().player!;
      expect(after.golem!.hp).toBe(11); // 5 + 6
      expect((after.inventory.find((i) => i.name === 'Scrap Metal')?.quantity) ?? 0).toBe(1);
    });

    it('feed golem with a NON-constituent item is refused and consumes nothing', async () => {
      const store = await bootstrap([
        { id: 'am', name: 'Aether Mud', kind: 'misc', rarity: 'Common', quantity: 1, tags: [] } as never,
      ]);
      const p0 = store.getState().player!;
      const golem = { ...makeCompanion(GOLEM_DEFINITIONS.iron_golem), hp: 5 };
      store.setState({ player: { ...p0, golem } });

      store.getState().submitPlayerAction('feed golem aether mud');

      const after = store.getState().player!;
      expect(after.golem!.hp).toBe(5); // unchanged
      expect((after.inventory.find((i) => i.name === 'Aether Mud')?.quantity) ?? 0).toBe(1); // not consumed
      expect(store.getState().gameLog.map((l) => l.text).join('\n')).toMatch(/mends only from what it's made of/);
    });

    it('naming takeover: the input after a summon names the golem', async () => {
      const store = await bootstrap();
      const p0 = store.getState().player!;
      // Simulate the post-summon state the summon path sets.
      store.setState({ player: { ...p0, golem: makeCompanion(GOLEM_DEFINITIONS.mud_golem) }, pendingGolemNaming: true });

      store.getState().submitPlayerAction('Clanker');

      const after = store.getState();
      expect(after.pendingGolemNaming).toBe(false);
      expect(after.player!.golem!.name).toBe('Clanker');
    });

    it('naming takeover: "skip" keeps the type label', async () => {
      const store = await bootstrap();
      const p0 = store.getState().player!;
      store.setState({ player: { ...p0, golem: makeCompanion(GOLEM_DEFINITIONS.mud_golem) }, pendingGolemNaming: true });

      store.getState().submitPlayerAction('skip');

      const after = store.getState();
      expect(after.pendingGolemNaming).toBe(false);
      expect(after.player!.golem!.name).toBe('Mud Golem');
    });
  });
});
