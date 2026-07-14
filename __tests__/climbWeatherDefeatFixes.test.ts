// OTA-625 — regression tests for three live-playtest fixes:
//   1. Frayed-rope fall LOOP: a rope at/below the wear-per-tier threshold is a
//      guaranteed snap, but on the GROUND (not elevated) the climb must refuse +
//      warn instead of dropping the player for fall damage every tap. Already-up
//      still falls.
//   2. 0-HP "zombie" enemy: the Elemental Control (mud_golem) proc that lands the
//      killing blow must run resolveEnemyDefeat(), not leave the enemy at 0 HP.
//   3. Weather-damage cooldown: after a damaging weather tick, the next actions
//      are weather-free (no back-to-back chip damage).

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
import { findEnemyByName } from '../app/engine/encounter';
import type { InventoryItem } from '../app/engine/types';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

// ── Fix #1 — OTA-799: a rope is usable to its LAST point ──────────────────────
// The old OTA-625 behavior snapped/refused a rope at durability ≤ ROPE_WEAR_PER_
// TIER (15), stranding a whole climb and dropping the player with no warning.
// Now: a low rope climbs, breaks GRACEFULLY at 0 (no fall), fires a fraying
// warning while low, and only a truly SPENT rope (0) fails.
describe('OTA-799 — rope usable to its last point (graceful break, warn low, fail at 0)', () => {
  async function setup(elevated: boolean, durability: number) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Climber', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    const rope: InventoryItem = {
      id: 'test_rope', name: "Reclaimer's Rope", kind: 'misc', quantity: 1,
      tags: ['utility', 'gate'], durability: { current: durability, max: 50 },
    } as unknown as InventoryItem;
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        ambientNouns: ['wall', 'tower'],
        elevatedOn: elevated ? { noun: 'wall', tier: 1, totalTiers: 3 } : null,
      },
      player: {
        ...p0, hp: 40, hpMax: 40, stamina: 10, staminaMax: 10,
        inventory: [...p0.inventory.filter((i) => i.name !== 'Climbing Rope' && i.name !== "Reclaimer's Rope"), rope],
      },
    });
    return store;
  }

  it('a low rope (10) climbs its last pull and breaks GRACEFULLY — no fall', async () => {
    const store = await setup(false, 10);
    store.getState().submitPlayerAction('climb wall');
    const after = store.getState().player!;
    expect(after.hp).toBe(40); // the ≤15 snap-fall is gone — no fall damage
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).not.toMatch(/YOU FALL/);
    expect(logs).toMatch(/gives out|coils dead/i);
    expect(after.inventory.some((i) => i.name === 'Broken Rope')).toBe(true);
  });

  it('ALREADY UP on a low rope: still breaks gracefully — no fall (was a fall pre-799)', async () => {
    const store = await setup(true, 10);
    store.getState().submitPlayerAction('climb wall');
    const after = store.getState().player!;
    expect(after.hp).toBe(40); // no fall even mid-climb — the rope just runs out
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).not.toMatch(/YOU FALL/);
    expect(after.inventory.some((i) => i.name === 'Broken Rope')).toBe(true);
  });

  it('a rope with margin (20) climbs, survives, and fires a FRAYING warning', async () => {
    const store = await setup(false, 20);
    store.getState().submitPlayerAction('climb wall');
    const after = store.getState().player!;
    expect(after.hp).toBe(40);
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/fraying/i);
    // Survived (20 → 5): still a rope, not yet Broken.
    expect(after.inventory.some((i) => i.id === 'test_rope' && i.name === "Reclaimer's Rope")).toBe(true);
    expect(after.inventory.some((i) => i.name === 'Broken Rope')).toBe(false);
  });

  it('a SPENT rope (0) refuses on the ground — no fall, no damage', async () => {
    const store = await setup(false, 0);
    store.getState().submitPlayerAction('climb wall');
    const after = store.getState().player!;
    expect(after.hp).toBe(40);
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(logs).toMatch(/spent/i);
    expect(logs).not.toMatch(/YOU FALL/);
  });
});

// ── Fix #2 — Elemental Control killing blow runs the defeat resolver ──────────
describe('OTA-625 #2 — Elemental Control killing blow defeats the enemy (no 0-HP zombie)', () => {
  it('drops the active enemy to 0 and resolves the defeat in the same action', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Golem', raceId: 'mud_golem', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    const proto = findEnemyByName('Mud Boar') ?? findEnemyByName('Aetheric Leech');
    if (!proto) throw new Error('test enemy not found');
    const enemy = JSON.parse(JSON.stringify(proto));
    store.setState({
      currentScene: {
        ...store.getState().currentScene!,
        enemies: [enemy],
        enemyHps: [1], // 1 HP — any 1d6 Elemental Control roll is lethal
        activeEnemyIdx: 0,
        range: 'close',
        enemyAmbushUsed: [false],
      },
    });
    store.getState().useRaceAbility('elemental_control');
    const sceneAfter = store.getState().currentScene;
    const logs = store.getState().gameLog.map((e) => e.text).join('\n');
    // The defeat resolver ran: a "defeated" line was logged AND the enemy is gone
    // from the live scene (not lingering at 0 HP).
    expect(logs).toMatch(/defeated/i);
    expect(sceneAfter?.enemies.length ?? 0).toBe(0);
  });
});

// ── Fix #3 — weather cooldown blocks back-to-back chip damage ─────────────────
describe('OTA-625 #3 — weather damage cannot fire on back-to-back actions', () => {
  async function bootInGlassHail() {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Walker', raceId: 'unknowing_mass', factionId: 'reclaimers_guild' });
    store.getState().skipTutorial?.();
    const p0 = store.getState().player!;
    store.setState({
      currentScene: { ...store.getState().currentScene!, weather: { id: 'glass_hail' } as any },
      player: { ...p0, hp: 40, hpMax: 40 },
    });
    return store;
  }

  it('while the cooldown is armed, the weather roll is skipped (no HP lost) and it decrements', async () => {
    const store = await bootInGlassHail();
    store.setState((s) => (s.player ? { player: { ...s.player, weatherTickCooldown: 2, hp: 40 } } : s));
    store.getState().submitPlayerAction('look around');
    const after = store.getState().player!;
    expect(after.hp).toBe(40); // weather skipped — no chip damage this action
    expect(after.weatherTickCooldown).toBe(1); // counted down
  });

  it('a landed glass-hail tick arms the cooldown so the very next action is weather-free', async () => {
    const store = await bootInGlassHail();
    store.setState((s) => (s.player ? { player: { ...s.player, weatherTickCooldown: 0, hp: 40 } } : s));
    const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.5); // glass_hail (p=0.5) fires; above spawn thresholds
    try {
      store.getState().submitPlayerAction('look around');
      const afterHit = store.getState().player!;
      expect(afterHit.hp).toBe(39); // glass_hail chips exactly 1
      expect(afterHit.weatherTickCooldown).toBe(2); // cooldown armed

      store.getState().submitPlayerAction('look around');
      const afterGap = store.getState().player!;
      expect(afterGap.hp).toBe(39); // no second hit back-to-back
      expect(afterGap.weatherTickCooldown).toBe(1); // counted down
    } finally {
      rnd.mockRestore();
    }
  });
});
