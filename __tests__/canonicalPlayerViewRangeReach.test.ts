// Phase 11 — focused regression for the range/reach observability added to
// PlayerView (test-utils/canonical/playerView.ts). Proves buildPlayerView()
// computes rangeLabel/mainHandReach using the SAME resolvers the production
// attack-reach gate and the real EnemyPanel use (enemyBandOf,
// playerWeaponReach) — not a re-derivation — and that the fields read
// exactly what a real player already sees on screen.

// playerView.ts value-imports combatResolution.ts (Phase 11's
// enemyBandOf/playerWeaponReach), which pulls in the full production module
// graph down to saveSystem.ts's native AsyncStorage. Same boilerplate every
// other test file that value-imports this chain already carries (see
// canonicalBoundedActionLoop.test.ts).
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
      static createAsync: () => Promise<{ sound: { playAsync: () => Promise<void>; unloadAsync: () => Promise<void> } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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

import { buildPlayerView } from '../test-utils/canonical/playerView';
import { createCharacter } from '../app/engine/character';
import type { CurrentScene } from '../app/state/gameStore';
import type { Enemy, WorldMemory } from '../app/engine/types';

function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    name: 'Mud-Wracked Aetherkin',
    type: 'Aetheric Undead',
    hp: 95,
    ac: 12,
    power: 10,
    attack: '+2',
    damage: '2D8 Aetheric',
    rarity: 'Uncommon',
    traits: ['aetherkin', 'slow', 'resist:slashing'],
    ...overrides,
  } as Enemy;
}

function makeScene(range: CurrentScene['range'], enemy: Enemy): CurrentScene {
  // Only `location.danger` is read on this path (threatReadout) — a real
  // full Location record is not needed to prove the range/reach fields.
  const location = { id: 'dynasty_border_post', danger: 2, name: 'Dynasty Border Post' };
  return {
    weather: { id: 'clear', name: 'Clear skies' },
    location,
    hazard: null,
    enemies: [enemy],
    enemyHps: [enemy.hp],
    activeEnemyIdx: 0,
    vendor: null,
    range,
  } as unknown as CurrentScene;
}

const EMPTY_WORLD_MEMORY = {} as WorldMemory;

describe('buildPlayerView — range/reach observability (Phase 11)', () => {
  it('a close-range weapon at MID range reads rangeLabel="mid-range" and mainHandReach.inRange=false — the exact proven Mud-Wracked Aetherkin stalemate condition', () => {
    const player = createCharacter({ name: 'Test', raceId: 'mud_golem', factionId: 'eternal_dynasty', motiveId: 'missing', pressure: 'owed', sex: 'male' });
    // Force a real catalog close-only melee weapon into the main slot,
    // exactly like the golem's proven Cudgel-class starting weapon.
    player.equipped = { ...player.equipped, main: 'Cudgel', mainId: undefined };
    const scene = makeScene('mid', makeEnemy());
    const view = buildPlayerView({ player, currentScene: scene, worldMemory: EMPTY_WORLD_MEMORY });
    expect(view).not.toBeNull();
    const enemyView = view!.scene!.enemies[0]!;
    expect(enemyView.rangeLabel).toBe('mid-range');
    expect(enemyView.mainHandReach.inRange).toBe(false);
    expect(enemyView.mainHandReach.label).toBe('Cudgel');
  });

  it('the same close-range weapon at CLOSE range reads inRange=true — nothing else about the encounter changed, only distance', () => {
    const player = createCharacter({ name: 'Test', raceId: 'mud_golem', factionId: 'eternal_dynasty', motiveId: 'missing', pressure: 'owed', sex: 'male' });
    player.equipped = { ...player.equipped, main: 'Cudgel', mainId: undefined };
    const scene = makeScene('close', makeEnemy());
    const view = buildPlayerView({ player, currentScene: scene, worldMemory: EMPTY_WORLD_MEMORY });
    const enemyView = view!.scene!.enemies[0]!;
    expect(enemyView.rangeLabel).toBe("close / arm's reach");
    expect(enemyView.mainHandReach.inRange).toBe(true);
  });

  it('a ranged weapon reaches every band, including distant — never structurally "out of reach"', () => {
    const player = createCharacter({ name: 'Test', raceId: 'mud_golem', factionId: 'eternal_dynasty', motiveId: 'missing', pressure: 'owed', sex: 'male' });
    player.equipped = { ...player.equipped, main: 'Bolt-Caster', mainId: undefined };
    for (const range of ['distant', 'far', 'mid', 'close'] as const) {
      const scene = makeScene(range, makeEnemy());
      const view = buildPlayerView({ player, currentScene: scene, worldMemory: EMPTY_WORLD_MEMORY });
      expect(view!.scene!.enemies[0]!.mainHandReach.inRange).toBe(true);
    }
  });

  it('no enemies present -> scene is null, exactly as before Phase 11 (no new field forces a non-null scene)', () => {
    const player = createCharacter({ name: 'Test', raceId: 'mud_golem', factionId: 'eternal_dynasty', motiveId: 'missing', pressure: 'owed', sex: 'male' });
    const view = buildPlayerView({ player, currentScene: null, worldMemory: EMPTY_WORLD_MEMORY });
    expect(view!.scene).toBeNull();
  });

  it('bare hands (no weapon equipped) read reach label "Bare hands" and reach close only, same close-only class as the Cudgel', () => {
    const player = createCharacter({ name: 'Test', raceId: 'mud_golem', factionId: 'eternal_dynasty', motiveId: 'missing', pressure: 'owed', sex: 'male' });
    player.equipped = { ...player.equipped, main: undefined, mainId: undefined, weaponName: undefined } as typeof player.equipped;
    const scene = makeScene('mid', makeEnemy());
    const view = buildPlayerView({ player, currentScene: scene, worldMemory: EMPTY_WORLD_MEMORY });
    const enemyView = view!.scene!.enemies[0]!;
    expect(enemyView.mainHandReach.label).toBe('Bare hands');
    expect(enemyView.mainHandReach.inRange).toBe(false);
  });
});
