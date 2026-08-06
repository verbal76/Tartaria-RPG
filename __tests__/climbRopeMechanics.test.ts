// OTA 23-007 — Regression tests for the climb mechanics overhaul:
//   - Rope is HARD-REQUIRED to climb. No rope -> refuse, no
//     stamina spent, no HP lost.
//   - Reclaimer's Rope costs 1 stamina/tier (vs 2 for plain Climbing
//     Rope) and unlocks mid-climb rest.
//   - If stamina < required cost, the player falls and loses 20%
//     of max HP. The elevatedOn flag is cleared.

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

async function setupClimber(
  ropeName: 'Climbing Rope' | "Reclaimer's Rope" | null,
  overrides: { hp?: number; hpMax?: number; stamina?: number; staminaMax?: number } = {},
) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Climber', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  const rope: InventoryItem | null = ropeName
    ? { id: `rope_${ropeName}`, name: ropeName, kind: 'misc', quantity: 1, tags: ['utility', 'gate'] }
    : null;
  const inv = [
    ...p0.inventory.filter((i) => i.name !== 'Climbing Rope' && i.name !== "Reclaimer's Rope"),
    ...(rope ? [rope] : []),
  ];
  store.setState({
    currentScene: {
      ...store.getState().currentScene!,
      ambientNouns: ['wall', 'tower'],
      elevatedOn: null,
    },
    player: {
      ...p0,
      hp: overrides.hp ?? 30,
      hpMax: overrides.hpMax ?? 30,
      stamina: overrides.stamina ?? 10,
      staminaMax: overrides.staminaMax ?? 10,
      inventory: inv,
    },
  });
  return store;
}

describe('OTA 23-007 — climb mechanics', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  describe('rope hard-requirement', () => {
    it('without any rope: climb is refused, no stamina spent, no HP lost', async () => {
      const store = await setupClimber(null);
      const before = store.getState().player!;
      store.getState().submitPlayerAction('climb wall');
      const after = store.getState().player!;
      expect(after.stamina).toBe(before.stamina);
      expect(after.hp).toBe(before.hp);
      const logs = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(logs).toMatch(/Not without rope/);
    });

    it('with plain Climbing Rope: climb succeeds, 2 stamina spent', async () => {
      const store = await setupClimber('Climbing Rope');
      const before = store.getState().player!.stamina;
      store.getState().submitPlayerAction('climb wall');
      const after = store.getState().player!.stamina;
      expect(after).toBe(before - 2);
    });

    it("with Reclaimer's Rope: climb succeeds, 1 stamina spent (half cost)", async () => {
      const store = await setupClimber("Reclaimer's Rope");
      const before = store.getState().player!.stamina;
      store.getState().submitPlayerAction('climb wall');
      const after = store.getState().player!.stamina;
      expect(after).toBe(before - 1);
    });
  });

  describe('OTA-356 — ground-level empty-stamina refuses (no fall)', () => {
    it('on the ground (not elevated), stamina < cost → refused, no HP lost, no fall', async () => {
      const store = await setupClimber('Climbing Rope', { hp: 30, hpMax: 30, stamina: 0, staminaMax: 10 });
      // elevatedOn is null (default) — player is on the ground.
      expect(store.getState().currentScene?.elevatedOn).toBeNull();
      store.getState().submitPlayerAction('climb wall');
      const after = store.getState().player!;
      expect(after.hp).toBe(30); // no fall damage
      const logs = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(logs).toMatch(/refused — you're on the ground/);
      expect(logs).not.toMatch(/YOU FALL/);
    });
  });

  describe('OTA-936 — stamina shortfall while UP HOLDS (no fall)', () => {
    it('plain rope, stamina < 2 while UP: HOLDS — no fall, no HP lost, elevation kept', async () => {
      const store = await setupClimber('Climbing Rope', {
        hp: 30, hpMax: 30, stamina: 1, staminaMax: 10,
      });
      store.setState({
        currentScene: { ...store.getState().currentScene!, elevatedOn: { noun: 'wall', tier: 1, totalTiers: 2 } },
      });
      store.getState().submitPlayerAction('climb wall');
      expect(store.getState().player!.hp).toBe(30);                       // no fall damage
      expect(store.getState().currentScene?.elevatedOn).not.toBeNull();   // held, still up
      const logs = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(logs).not.toMatch(/YOU FALL/);
      expect(logs).toMatch(/climb down or rest|Climb DOWN while you can still grip/i);
    });

    it("Reclaimer's Rope, stamina 0 while UP: also HOLDS (no fall)", async () => {
      const store = await setupClimber("Reclaimer's Rope", {
        hp: 50, hpMax: 50, stamina: 0, staminaMax: 10,
      });
      store.setState({
        currentScene: { ...store.getState().currentScene!, elevatedOn: { noun: 'wall', tier: 1, totalTiers: 2 } },
      });
      store.getState().submitPlayerAction('climb wall');
      expect(store.getState().player!.hp).toBe(50);
      expect(store.getState().currentScene?.elevatedOn).not.toBeNull();
    });
  });

  describe('OTA-910 — a REAL fall (rope worn to 0) still scales damage by tier', () => {
    it('plain rope at durability 0 while UP: falls, height-scaled HP, elevation cleared', async () => {
      const store = await setupClimber('Climbing Rope', { hp: 30, hpMax: 30, stamina: 10, staminaMax: 10 });
      store.setState({
        player: {
          ...store.getState().player!,
          inventory: store.getState().player!.inventory.map((i) =>
            i.name === 'Climbing Rope' ? { ...i, durability: { current: 0, max: 90 } } : i,
          ),
        },
        currentScene: { ...store.getState().currentScene!, elevatedOn: { noun: 'wall', tier: 1, totalTiers: 2 } },
      });
      store.getState().submitPlayerAction('climb wall');
      const after = store.getState().player!;
      // OTA-910 — from tier 1: floor(30 × (0.12 + 0.055×1)) = floor(30 × 0.175) = 5.
      expect(after.hp).toBe(30 - 5);
      expect(store.getState().currentScene?.elevatedOn).toBeNull();
      const logs = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(logs).toMatch(/YOU FALL/);
    });

    it('fall damage floors at 1 even on a low-HP-max character', async () => {
      const store = await setupClimber('Climbing Rope', { hp: 3, hpMax: 3, stamina: 10, staminaMax: 10 });
      store.setState({
        player: {
          ...store.getState().player!,
          inventory: store.getState().player!.inventory.map((i) =>
            i.name === 'Climbing Rope' ? { ...i, durability: { current: 0, max: 90 } } : i,
          ),
        },
        currentScene: { ...store.getState().currentScene!, elevatedOn: { noun: 'wall', tier: 1, totalTiers: 2 } },
      });
      store.getState().submitPlayerAction('climb wall');
      expect(store.getState().player!.hp).toBe(2); // 20% of 3 -> floor at 1
    });
  });

  describe('rest gating while elevated', () => {
    it('plain Climbing Rope: rest is refused while elevated', async () => {
      const store = await setupClimber('Climbing Rope', {
        hp: 10, hpMax: 30, stamina: 0, staminaMax: 10,
      });
      // Make the player elevated.
      store.setState({
        currentScene: { ...store.getState().currentScene!, elevatedOn: { noun: 'wall', tier: 1, totalTiers: 2 } },
      });
      const before = store.getState().player!;
      store.getState().submitPlayerAction('rest');
      const after = store.getState().player!;
      // Rest should have been refused — no HP/stamina change.
      expect(after.hp).toBe(before.hp);
      expect(after.stamina).toBe(before.stamina);
      const logs = store.getState().gameLog.map((e) => e.text).join('\n');
      // OTA-1039 — a plain Climbing Rope now gets its OWN refusal naming what the
      // line can't do; the generic wall line still covers the no-rope case.
      // The invariant under test is that rest is REFUSED, not its phrasing.
      expect(logs).toMatch(/can't sleep on a wall|won't hold you asleep/i);
    });

    it("Reclaimer's Rope: rest is REFUSED while elevated — only the strap anchors one", async () => {
      // OTA-1040 — OWNER'S RULE CHANGE: a rope no longer anchors a rest on ANY
      // climb ("you need the hardened climbing strap for that"). This test
      // asserted the old allowance; it now guards the new rule from both
      // sides — nothing recovers, and the refusal explains itself.
      const store = await setupClimber("Reclaimer's Rope", {
        hp: 10, hpMax: 30, stamina: 0, staminaMax: 10,
      });
      store.setState({
        currentScene: { ...store.getState().currentScene!, elevatedOn: { noun: 'wall', tier: 1, totalTiers: 2 } },
      });
      const before = store.getState().player!;
      store.getState().submitPlayerAction('rest');
      const after = store.getState().player!;
      expect(after.stamina).toBe(before.stamina);
      expect(after.hp).toBe(before.hp);
      const logs = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(logs).toMatch(/won't hold you asleep|Hardened Climbing Strap/i);
    });

    it('the Hardened Climbing Strap still anchors a rest while elevated', async () => {
      const store = await setupClimber("Reclaimer's Rope", {
        hp: 10, hpMax: 30, stamina: 0, staminaMax: 10,
      });
      store.setState({
        player: { ...store.getState().player!, equipped: { ...(store.getState().player!.equipped ?? {}), legs: 'Hardened Climbing Strap' } } as any,
        currentScene: { ...store.getState().currentScene!, elevatedOn: { noun: 'wall', tier: 1, totalTiers: 2 } },
      });
      store.getState().submitPlayerAction('rest');
      const after = store.getState().player!;
      expect(after.stamina).toBeGreaterThan(0);
      expect(after.hp).toBeGreaterThan(10);
    });
  });

  // OTA-462 — when the player is actively elevated on a climb, the live
  // elevatedOn progress is authoritative, not the fuzzy persistent marker scan.
  // Repro: a t3 marker from a DIFFERENT crested climb ("climbed:scaffold:t3")
  // fuzzy-matched "broken scaffold" → maxClimbedTier said fully crested → "already
  // crested" fired while the button still showed (1/3). On an active climb, climbing
  // up must advance the tier, not refuse.
  describe('OTA-462 — active climb trusts elevatedOn over fuzzy markers', () => {
    it('climbing up from tier 1/3 advances to tier 2 despite a fuzzy-matching cleared marker', async () => {
      const store = await setupClimber('Climbing Rope', { stamina: 10, staminaMax: 10 });
      const p = store.getState().player!;
      const { makeRoomKey } = require('../app/state/gameStore');
      const roomKey = makeRoomKey(p.currentLocationId, store.getState().currentScene?.microMicroId, p.mapX, p.mapY, p.hubRoomId);
      store.setState({
        currentScene: {
          ...store.getState().currentScene!,
          ambientNouns: ['broken scaffold'],
          // Player is up on the broken scaffold at tier 1 of 3.
          elevatedOn: { noun: 'broken scaffold', tier: 1, totalTiers: 3 },
        },
        worldMemory: {
          ...store.getState().worldMemory,
          visitedRooms: {
            ...(store.getState().worldMemory.visitedRooms ?? {}),
            // A t3 marker from a different climb that fuzzy-matches "broken scaffold".
            [roomKey]: { firstVisitAt: 1, lastVisitAt: 1, visitCount: 1, searchedAmbientNouns: ['climbed:scaffold:t3'] },
          },
        },
      });

      store.getState().submitPlayerAction('climb broken scaffold');

      const after = store.getState();
      const logs = after.gameLog.map((e) => e.text).join('\n');
      // Must NOT refuse with "already crested" — and must advance the elevation.
      expect(logs).not.toMatch(/already crested/i);
      expect(after.currentScene?.elevatedOn?.tier).toBe(2);
    });
  });
});
