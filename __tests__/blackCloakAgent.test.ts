// OTA-366 — the Black Cloak Agent, covert enforcer of the Forgotten
// Order. His signature weapon, the Hollow Edge, is a corrupted blade
// whose grip is honed to a razor — only a trained Order hand can take
// it up. So it is NEVER lootable (kill or knockout): the player eyes it
// on the body, reads why, and leaves it.

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
import enemiesData from '../app/data/enemies/enemies.json';
import conceptsData from '../app/data/lore/concepts.json';

const AGENT = ((enemiesData as { enemies?: any[] }).enemies
  ?? (enemiesData as unknown as any[])).find((e) => e.name === 'Black Cloak Agent');

describe('Black Cloak Agent — data + lore (OTA-366)', () => {
  it('carries a non-lootable signature weapon (the Hollow Edge) and no lootable weapon', () => {
    expect(AGENT).toBeDefined();
    expect(AGENT.signatureWeapon?.name).toBe('the Hollow Edge');
    expect(AGENT.signatureWeapon.reason.length).toBeGreaterThan(50);
    // The blade is the signature (non-lootable); the kit has no plain weapon.
    expect(AGENT.carries?.weapons ?? []).toHaveLength(0);
    expect(AGENT.carries?.armor ?? []).toContain("Mud-Bound Cloak");
  });

  it('is tied to the Forgotten Order, not the Mud Monarchs', () => {
    expect(AGENT.aliases).toEqual(expect.arrayContaining(['order agent', 'enforcer']));
    expect(AGENT.aliases).not.toContain('monarch agent');
  });

  it('has codex lore for the Black Cloaks and the Hollow Edge', () => {
    const ids = (conceptsData as { concepts: Array<{ id: string }> }).concepts.map((c) => c.id);
    expect(ids).toContain('black_cloak_agents');
    expect(ids).toContain('hollow_edge');
  });
});

describe('the Hollow Edge cannot be looted', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('knocking out the agent and looting grants the kit but NOT the blade — and tells you why', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'OrderHunter', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();

    const proto = findEnemyByName('Black Cloak Agent');
    const enemy = JSON.parse(JSON.stringify(proto));
    const scene = store.getState().currentScene!;
    store.setState({
      currentScene: {
        ...scene, enemies: [enemy], enemyHps: [20], activeEnemyIdx: 0,
        range: 'arm', enemyAmbushUsed: [false], enemyKnockedOut: [true],
      },
    });
    const beforeLog = store.getState().gameLog.length;

    store.getState().lootKnockedOutEnemy();

    const inv = store.getState().player!.inventory;
    // Kit armor came over; the Hollow Edge did NOT.
    expect(inv.some((i) => i.name === "Mud-Bound Cloak")).toBe(true);
    expect(inv.some((i) => /hollow edge/i.test(i.name))).toBe(false);
    // The reason surfaced in the log.
    const lines = store.getState().gameLog.slice(beforeLog).flatMap((e) => e.text);
    expect(lines.some((t) => /Hollow Edge|Order's hold|flay/i.test(t))).toBe(true);
  });
});
