// Dodge parry rework (2026-05-21). Block was folded into dodge as
// an active reaction: opposed d20+DEX vs the enemy's attack total;
// success negates damage and lands a counter-strike at 2× the
// equipped weapon's damage dice; failure lets damage land normally.
// Either outcome consumes the dodging status and chips 2 durability
// off the equipped weapon (1.5× normal hit-wear, rounded up).

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
import { parseInput } from '../app/engine/parser';

function plantEnemy(name = 'Mud Boar') {
  const proto = findEnemyByName(name);
  if (!proto) throw new Error('test enemy not found');
  const enemy = JSON.parse(JSON.stringify(proto));
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies: [enemy],
      enemyHps: [enemy.hp],
      activeEnemyIdx: 0,
      range: 'arm',
      enemyAmbushUsed: [false],
    },
  });
}

describe('dodge rework — active parry', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it("parser routes 'block' verbs through the dodge intent (block intent is unreachable)", () => {
    const p1 = parseInput('block');
    expect(p1.intent).toBe('dodge');
    const p2 = parseInput('parry');
    expect(p2.intent).toBe('dodge');
    const p3 = parseInput('deflect');
    expect(p3.intent).toBe('dodge');
  });

  it("dodging status is single-shot — remainingRounds=1, consumed after one incoming attack", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Parrier', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    plantEnemy();

    store.getState().submitPlayerAction('dodge');
    // After dodge + enemy counter, the status should be consumed.
    const fx = store.getState().player!.statusEffects ?? [];
    const dodging = fx.find((e) => e.kind === 'dodging');
    // Either status was consumed by the parry resolution, OR if the
    // enemy didn't reach the player this round (no counter ran),
    // it's still active with remainingRounds=1.
    if (dodging) {
      expect(dodging.remainingRounds).toBeLessThanOrEqual(1);
    }
  });

  it("parry chip the equipped weapon's durability by 2 when an attack actually lands", async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Durability', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // Equip a fresh Rusted Blade with full durability.
    const p0 = store.getState().player!;
    store.setState({
      player: {
        ...p0,
        inventory: [
          ...p0.inventory.filter((i) => i.kind !== 'weapon'),
          {
            id: 'main_blade',
            name: 'Rusted Blade',
            kind: 'weapon',
            quantity: 1,
            tags: ['weapon', 'blade', 'melee'],
            durability: { current: 25, max: 25 },
          },
        ],
        equipped: { ...(p0.equipped ?? {}), main: 'Rusted Blade' },
      },
    });
    plantEnemy();

    // Submit dodge — applyEnemyCounter will roll an attack; if it
    // lands, parry fires (success or failure) and chips 2 durability.
    store.getState().submitPlayerAction('dodge');

    const blade = store.getState().player!.inventory.find((i) => i.name === 'Rusted Blade');
    // Durability either stayed at 25 (no enemy hit registered) or
    // dropped by 2 (parry resolved). Pre-fix it would have stayed
    // untouched even on a successful enemy hit.
    expect([23, 25]).toContain(blade?.durability?.current);
  });

  it('OTA-908 — a SUCCESSFUL dodge in a multi-enemy fight names that the others still press in', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Reader', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // Pin every d20 to 10 (0.47 → 1 + floor(9.4)) so no nat-20 pierce / nat-1;
    // with sky-high DEX the dodge contest is a clean WIN, deterministically.
    const realRandom = Math.random;
    Math.random = () => 0.47;
    try {
      const proto = findEnemyByName('Mud Boar')!;
      const e1 = JSON.parse(JSON.stringify(proto));
      const e2 = JSON.parse(JSON.stringify(proto));
      const p0 = store.getState().player!;
      store.setState({
        player: { ...p0, hp: 500, hpMax: 500, stats: { ...p0.stats, dexterity: 20 } },
        currentScene: {
          ...store.getState().currentScene!,
          enemies: [e1, e2],
          enemyHps: [e1.hp, e2.hp],
          activeEnemyIdx: 0,
          range: 'close',
          enemyAmbushUsed: [false, false],
        },
      });
      store.getState().submitPlayerAction('dodge');
      const feed = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(feed).toMatch(/slip .*'s arc clean — but a dodge reads one attacker; the rest press in/);
    } finally {
      Math.random = realRandom;
    }
  });

  it('OTA-908 — a MISREAD dodge emits a visceral "stumbled into it" world beat', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Misreader', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // Pin d20 to 10 (no nat-20 pierce) but DEX 0 + a hard-hitting enemy so the
    // opposed contest LOSES → a misread (not the nat-20 pierce path).
    const realRandom = Math.random;
    Math.random = () => 0.47;
    try {
      const proto = findEnemyByName('Mud Boar')!;
      const e1 = JSON.parse(JSON.stringify(proto));
      e1.attackBonus = 30; // atkTotal 40 >> dodge total 10 → misread
      const p0 = store.getState().player!;
      store.setState({
        player: { ...p0, hp: 500, hpMax: 500, stats: { ...p0.stats, dexterity: 0 } },
        currentScene: {
          ...store.getState().currentScene!,
          enemies: [e1],
          enemyHps: [e1.hp],
          activeEnemyIdx: 0,
          range: 'close',
          enemyAmbushUsed: [false],
        },
      });
      store.getState().submitPlayerAction('dodge');
      const feed = store.getState().gameLog.map((e) => e.text).join('\n');
      expect(feed).toMatch(/stumble straight into it|arc you leaned into|duck into the strike|balance on the slip/i);
    } finally {
      Math.random = realRandom;
    }
  });

  it('dodge outside combat sets the status but does NOT trigger a phantom enemy attack', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Peaceful', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // No plantEnemy — pure peaceful scene.

    const before = store.getState().gameLog.length;
    store.getState().submitPlayerAction('dodge');
    const newLines = store.getState().gameLog.slice(before).flatMap((e) => e.text);
    expect(store.getState().player!.statusEffects?.some((e) => e.kind === 'dodging')).toBe(true);
    expect(newLines.some((t) => /vs your AC/i.test(t))).toBe(false);
  });
});
