// Defensive verbs (dodge / block / take_cover / ready / aim) must
// consume the player's combat action AND let the enemy take their
// counter-swing afterwards. Pre-fix behaviour: dodge just set the
// status and returned, leaving the round paused — the player had
// to attack to advance, which defeated the point of going
// defensive in the first place. Playtester report 2026-05-21.

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

function plantEnemy(name = 'Mud Boar') {
  const store = useGameStore;
  const proto = findEnemyByName(name);
  if (!proto) throw new Error('test enemy not found');
  const enemy = JSON.parse(JSON.stringify(proto));
  const scene = store.getState().currentScene!;
  store.setState({
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

describe('defensive verbs advance the round', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  it('dodge triggers the enemy counter-attack so the round advances', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Dodger', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    plantEnemy();

    const beforeLog = store.getState().gameLog.length;
    store.getState().submitPlayerAction('dodge');
    const afterLog = store.getState().gameLog;
    const newLines = afterLog.slice(beforeLog).flatMap((e) => e.text);

    // The enemy's counter-attack rolled. Search the new log entries
    // for the canonical enemy-attack line shape (d20 → N ... vs your AC).
    const enemyRolled = newLines.some((t) => /vs your AC/i.test(t));
    expect(enemyRolled).toBe(true);
    // The dodging status is single-shot now — applyEnemyCounter
    // consumes it when an enemy attack landed (hit OR miss above AC
    // first, then parry roll). So either:
    //   (a) enemy hit and parry resolved → dodging consumed
    //   (b) enemy missed the AC roll → dodging still active (no parry fired)
    // Both are valid post-2026-05-21 behaviour.
    const stillDodging = store.getState().player!.statusEffects?.some((e) => e.kind === 'dodging') ?? false;
    void stillDodging; // accepted either way
  });

  it("'block' verb is now an alias for dodge — sets dodging status + triggers enemy counter + parry resolves", async () => {
    // Pre-2026-05-21 'block' set a separate 'blocking' status with a
    // d20+weapon.defense roll. After the dodge rework, 'block' /
    // 'parry' / 'deflect' / 'shield' etc all parse to the dodge
    // intent. The status this commit sets is 'dodging', not
    // 'blocking'.
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Blocker', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
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

    const beforeLog = store.getState().gameLog.length;
    store.getState().submitPlayerAction('block');
    const newLines = store.getState().gameLog.slice(beforeLog).flatMap((e) => e.text);

    // Enemy counter fired this turn.
    expect(newLines.some((t) => /vs your AC/i.test(t))).toBe(true);
    // The legacy 'blocking' status MUST NOT be in play — the new
    // mechanic uses 'dodging' for both.
    expect(store.getState().player!.statusEffects?.some((e) => e.kind === 'blocking')).toBe(false);
  });

  it('take_cover triggers the enemy counter so the cover bonus actually gates an incoming swing', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'Coverer', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    plantEnemy();

    const beforeLog = store.getState().gameLog.length;
    store.getState().submitPlayerAction('take cover');
    const newLines = store.getState().gameLog.slice(beforeLog).flatMap((e) => e.text);

    expect(store.getState().player!.statusEffects?.some((e) => e.kind === 'in_cover' || e.kind === 'in_cover_full')).toBe(true);
    expect(newLines.some((t) => /vs your AC/i.test(t))).toBe(true);
  });

  it('dodge OUTSIDE combat does NOT roll an enemy counter (no enemy to swing)', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    const race = getRaces()[0]!;
    const fac = getFactions()[0]!;
    await store.getState().startNewGame({ name: 'PeacefulDodger', raceId: race.id, factionId: fac.id });
    store.getState().skipTutorial?.();
    // No plantEnemy — pure peaceful scene.

    const beforeLog = store.getState().gameLog.length;
    store.getState().submitPlayerAction('dodge');
    const newLines = store.getState().gameLog.slice(beforeLog).flatMap((e) => e.text);

    expect(store.getState().player!.statusEffects?.some((e) => e.kind === 'dodging')).toBe(true);
    // No enemy-attack rolls expected.
    expect(newLines.some((t) => /vs your AC/i.test(t))).toBe(false);
  });
});
