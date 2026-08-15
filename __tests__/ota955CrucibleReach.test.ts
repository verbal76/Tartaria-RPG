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

// OTA-955 — the Crucible forges REACH. Owner: "let's have the crucible add the
// appropriate range to weapons, have it recheck and fix old saves as well."
// Forge time: weapons pick a reach class first (60% melee / 20% long / 20%
// ranged, hash-seeded) and a form noun that MATCHES it — a "Bow" shoots, a
// "Spike" doesn't. The stamp lives in uniqueStats.reachClass; the description
// and forge announcement say it out loud. Settle time: if the Qwen namer's
// final name clearly reads ranged/long, reach follows the displayed name.
// Load time: older forges are back-stamped from their name — the recheck that
// fixes old saves. Combat: reach resolution reads the stamp, so a fused Bow
// fires from mid with no refusal.
import { useGameStore, backfillPlayer } from '../app/state/gameStore';
import {
  synthesizeFusionDeterministic, inferReachFromName,
} from '../app/engine/itemFusion';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import type { InventoryItem } from '../app/engine/types';

const mkInput = (i: number, tag: string): InventoryItem => ({
  id: `in${i}`, name: `Scrap Piece ${i}`, kind: 'misc', rarity: 'Common', quantity: 1, tags: [tag],
});

describe('OTA-955 — name→reach inference', () => {
  it('reads ranged and long forms, stays null on neutral names', () => {
    expect(inferReachFromName('Humming Bow')).toBe('ranged');
    expect(inferReachFromName('Slag-Cast Bolt-Rig')).toBe('ranged');
    expect(inferReachFromName('Cairn Spear')).toBe('long');
    expect(inferReachFromName('Iron-Bound Halberd')).toBe('long');
    expect(inferReachFromName('Resonant Spike')).toBeNull();
    expect(inferReachFromName('Tempered Fang')).toBeNull();
  });
});

describe('OTA-955 — the forge stamps a reach and names to match', () => {
  it('every forged weapon carries reachClass, and the noun agrees with it', () => {
    const seen = new Set<string>();
    for (let v = 0; v < 60; v++) {
      const inputs = [mkInput(v * 3, 'metal'), mkInput(v * 3 + 1, 'aether'), mkInput(v * 3 + 2, v % 2 ? 'stone' : 'organic')];
      const det = synthesizeFusionDeterministic(inputs, ['metal', 'aether', v % 2 ? 'stone' : 'organic'], 'weapon');
      expect(det.stats.kind).toBe('weapon');
      expect(['melee', 'long', 'ranged']).toContain(det.stats.reachClass);
      seen.add(det.stats.reachClass!);
      const named = inferReachFromName(det.name);
      if (det.stats.reachClass === 'ranged') expect(named).toBe('ranged');
      if (det.stats.reachClass === 'long') expect(named).toBe('long');
      if (det.stats.reachClass === 'melee') expect(named).toBeNull();
    }
    // across 60 hash-seeded forges all three reach classes appear
    expect(seen.size).toBe(3);
  });

  it('the description states the reach in plain words', () => {
    for (let v = 0; v < 40; v++) {
      const inputs = [mkInput(v * 3, 'metal'), mkInput(v * 3 + 1, 'cloth'), mkInput(v * 3 + 2, 'wood')];
      const det = synthesizeFusionDeterministic(inputs, ['metal', 'cloth', 'wood'], 'weapon');
      if (det.stats.reachClass === 'ranged') expect(det.description).toContain('ranged weapon');
      else if (det.stats.reachClass === 'long') expect(det.description).toContain('reach weapon');
      else expect(det.description).toContain('close-quarters');
    }
  });

  it('same inputs always forge the same reach (deterministic, no reroll farming)', () => {
    const inputs = [mkInput(1, 'metal'), mkInput(2, 'aether'), mkInput(3, 'stone')];
    const a = synthesizeFusionDeterministic(inputs, ['metal', 'aether', 'stone'], 'weapon');
    const b = synthesizeFusionDeterministic(inputs, ['metal', 'aether', 'stone'], 'weapon');
    expect(a.stats.reachClass).toBe(b.stats.reachClass);
    expect(a.name).toBe(b.name);
  });
});

describe('OTA-955 — old saves get the recheck on load', () => {
  it('a legacy fused Bow shoots, a legacy Spear reaches, a legacy Spike stays honest', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Reacher', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const legacy = (id: string, name: string): InventoryItem => ({
      id, name, kind: 'weapon', rarity: 'Rare', quantity: 1, tags: ['fused'],
      uniqueStats: { kind: 'weapon', rarity: 'Rare', durability: { current: 35, max: 35 }, damageDice: '2d6' },
    });
    // backfillPlayer is the exact save-upgrade pass every device runs on load.
    const out = backfillPlayer({
      ...store.getState().player!,
      inventory: [
        ...store.getState().player!.inventory,
        legacy('lgb', 'Humming Bow'),
        legacy('lgs', 'Cairn Spear'),
        legacy('lgk', 'Resonant Spike'),
      ],
    });
    expect(out.inventory.find((i) => i.id === 'lgb')?.uniqueStats?.reachClass).toBe('ranged');
    expect(out.inventory.find((i) => i.id === 'lgs')?.uniqueStats?.reachClass).toBe('long');
    expect(out.inventory.find((i) => i.id === 'lgk')?.uniqueStats?.reachClass).toBe('melee');
    // Idempotent: a second pass changes nothing.
    const again = backfillPlayer(out);
    expect(again.inventory.find((i) => i.id === 'lgb')?.uniqueStats?.reachClass).toBe('ranged');
  });
});

describe('OTA-955 — a fused ranged weapon actually fires from mid range', () => {
  it('no ADVANCE refusal, the attack rolls', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Bowyer', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await new Promise((r) => setTimeout(r, 25));
    const proto = findEnemyByName('Mud Spider') ?? findEnemyByName('Gutter Rat');
    const foe = JSON.parse(JSON.stringify(proto));
    foe.hp = 9999;
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene, elevatedOn: null, enemies: [foe], enemyHps: [foe.hp], activeEnemyIdx: 0, range: 'mid',
        enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]], enemyArmorShred: [0], enemyCorruptionStacks: [0],
      },
    });
    store.setState((s) => ({
      player: {
        ...s.player!,
        hp: 100, hpMax: 100, stamina: 20, staminaMax: 20,
        inventory: [
          ...s.player!.inventory,
          {
            id: 'fbow1', name: 'Humming Bow', kind: 'weapon' as const, rarity: 'Rare' as const, quantity: 1, tags: ['fused'],
            uniqueStats: { kind: 'weapon' as const, rarity: 'Rare' as const, durability: { current: 35, max: 35 }, damageDice: '2d6', reachClass: 'ranged' as const },
          },
        ],
        equipped: { ...(s.player!.equipped ?? {}), main: 'Humming Bow', mainId: 'fbow1' },
      },
    }));
    store.getState().submitPlayerAction('attack');
    let guard = 0;
    while (store.getState().pendingRolls) {
      if (guard++ > 50) throw new Error('roll loop did not terminate');
      const pr = store.getState().pendingRolls!;
      const step = pr.steps[pr.currentStep]!;
      store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => 10));
    }
    await new Promise((r) => setTimeout(r, 5));
    expect(store.getState().gameLog.some((e) => e.text.includes('ADVANCE to close in'))).toBe(false);
    expect(store.getState().gameLog.some((e) => e.channel === 'combat' && /You — d20/.test(e.text))).toBe(true);
    expect(store.getState().currentScene!.range).toBe('mid');
  });
});
