// OTA-361 — knockout + loot. A single NON-LETHAL blow dealing ≥ half a
// HUMANOID enemy's max HP knocks them out (they're out of the fight,
// never counter), and a combat Loot action strips their authored
// `carries` kit (DAMAGED — durability scaled to how hurt they were)
// plus their full loot list and a little TC, then clears them from the
// scene. Only type 'Human' enemies can be subdued.

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
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import { findWeaponByName, findArmorByName } from '../app/engine/crafting';
import enemiesData from '../app/data/enemies/enemies.json';

const HUMANS = (enemiesData as { enemies?: any[] }).enemies?.filter((e) => e.type === 'Human')
  ?? (enemiesData as unknown as any[]).filter((e) => e.type === 'Human');

describe('humanoid kit data (carries)', () => {
  it('every Human enemy carries a resolvable weapon + armor kit', () => {
    expect(HUMANS.length).toBeGreaterThan(0);
    for (const h of HUMANS) {
      expect(h.carries).toBeDefined();
      for (const w of h.carries.weapons ?? []) expect(findWeaponByName(w)).not.toBeNull();
      for (const a of h.carries.armor ?? []) expect(findArmorByName(a)).not.toBeNull();
    }
  });
});

function plantHuman(name = 'Silt Thief', hpOverride?: number) {
  const proto = findEnemyByName(name);
  if (!proto) throw new Error('test enemy not found');
  const enemy = JSON.parse(JSON.stringify(proto));
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies: [enemy],
      enemyHps: [hpOverride ?? enemy.hp],
      activeEnemyIdx: 0,
      range: 'arm',
      enemyAmbushUsed: [false],
      enemyKnockedOut: [false],
    },
  });
  return enemy;
}

async function boot(name: string) {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name, raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

describe('lootKnockedOutEnemy', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('strips a knocked-out humanoid: kit (damaged) + loot + TC, then clears them', async () => {
    const store = await boot('Looter');
    const enemy = plantHuman('Silt Thief', 20); // 20/28 HP → fairly intact kit
    // Mark knocked out (the threshold path is exercised in real combat;
    // here we drive the loot action directly).
    const sc = store.getState().currentScene!;
    store.setState({ currentScene: { ...sc, enemyKnockedOut: [true] } });
    const tcBefore = store.getState().player!.tc;
    const namesBefore = new Set(store.getState().player!.inventory.map((i) => i.name));

    store.getState().lootKnockedOutEnemy();

    const inv = store.getState().player!.inventory;
    // Authored kit landed.
    const knife = inv.find((i) => i.name === 'Bone Knife');
    const vest = inv.find((i) => i.name === "Mud-Warden's Vest");
    expect(knife).toBeDefined();
    expect(vest).toBeDefined();
    // Damaged, never pristine.
    expect(knife!.durability).toBeDefined();
    expect(knife!.durability!.current).toBeLessThan(knife!.durability!.max);
    expect(knife!.durability!.current).toBeGreaterThan(0);
    // Loot list came over too (Silt Thief drops Patched Cloth + Aether Residue).
    void namesBefore;
    expect(inv.some((i) => i.name === 'Patched Cloth')).toBe(true);
    // TC granted.
    expect(store.getState().player!.tc).toBeGreaterThan(tcBefore);
    // Enemy cleared from the scene.
    const after = store.getState().currentScene!;
    expect(after.enemies.length).toBe(0);
    expect(after.range).toBeNull();
    expect(enemy.type).toBe('Human');
  });

  it('more-beaten foes yield rougher gear (lower durability)', async () => {
    const store = await boot('Beater');
    // Barely subdued (high remaining HP) vs nearly-killed (low remaining HP).
    plantHuman('Silt Thief', 26);
    store.setState({ currentScene: { ...store.getState().currentScene!, enemyKnockedOut: [true] } });
    store.getState().lootKnockedOutEnemy();
    const intactKnife = store.getState().player!.inventory.find((i) => i.name === 'Bone Knife')!;
    const intactFrac = intactKnife.durability!.current / intactKnife.durability!.max;

    const store2 = await boot('Beater2');
    plantHuman('Silt Thief', 2);
    store2.setState({ currentScene: { ...store2.getState().currentScene!, enemyKnockedOut: [true] } });
    store2.getState().lootKnockedOutEnemy();
    const wreckedKnife = store2.getState().player!.inventory.find((i) => i.name === 'Bone Knife')!;
    const wreckedFrac = wreckedKnife.durability!.current / wreckedKnife.durability!.max;

    expect(wreckedFrac).toBeLessThan(intactFrac);
  });

  it('no-op (with a log line) when nobody is knocked out', async () => {
    const store = await boot('NoKO');
    plantHuman('Silt Thief');
    const invLen = store.getState().player!.inventory.length;
    const tcBefore = store.getState().player!.tc;
    store.getState().lootKnockedOutEnemy();
    expect(store.getState().player!.inventory.length).toBe(invLen);
    expect(store.getState().player!.tc).toBe(tcBefore);
    expect(store.getState().currentScene!.enemies.length).toBe(1); // still standing
  });
});
