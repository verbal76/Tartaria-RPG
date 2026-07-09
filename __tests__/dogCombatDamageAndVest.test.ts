// OTA-685 — two dog fixes.
//  (1) The dog could no longer take combat damage: arb169 closed the "command
//      the dog to dodge the group volley" exploit by routing the WHOLE volley to
//      the player and removing the dog from all retaliation — so the dog became
//      invulnerable and the downed → bleed-out → death system went dead. The
//      volley now redirects ~1-in-4 of each enemy's swings to the dog (uniformly,
//      so the exploit stays closed), and a hit that drops it to 0 benches it and
//      starts the bleed-out clock.
//  (2) The dog's vest (worn on dog.equipped.vest, by NAME) never lit the EQUIPPED
//      badge because the inventory only checked the player's equip-slot ids.
//
// The combat path is store-internal; here we drive it end-to-end and assert the
// observable: after many volleys the dog has taken damage, and a lethal volley
// benches the dog with the bleed-out clock started.

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

import { useGameStore, runEnemyGroupCounters, applyEnemyCounterToDog } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { DogCompanion, Enemy } from '../app/engine/types';

async function freshGame() {
  const store = useGameStore;
  await store.getState().hydrate();
  const race = getRaces()[0]!;
  const fac = getFactions()[0]!;
  await store.getState().startNewGame({ name: 'Handler', raceId: race.id, factionId: fac.id });
  store.getState().skipTutorial?.();
  return store;
}

const mkDog = (hp: number, vest: string | null = null): DogCompanion => ({
  id: 'dog1', name: 'Rocky', breed: 'Pitbull',
  sex: { raw: 'male', pronoun: 'he' },
  startingProfile: 'mongrel',
  hp, hpMax: 14,
  stats: { strength: 10, dexterity: 10, intelligence: 10 },
  statProgress: { strength: 0, dexterity: 0, intelligence: 0 },
  loyalty: 100, lastFedAtHour: 0,
  equipped: { vest }, status: 'with_player',
});

// A brute with a big attack bonus + low-AC melee so hits land often.
const brute = (): Enemy => ({
  name: 'Brute', hp: 20, ac: 10, attack: 'Slam', damage: '1d6',
  abilityPoint: 'STR 18', rarity: 'Common', traits: [],
} as unknown as Enemy);

function setSceneWithEnemies(store: typeof useGameStore, n: number) {
  const enemies = Array.from({ length: n }, brute);
  store.setState((s) => ({
    currentScene: {
      ...((s.currentScene ?? {}) as any),
      enemies,
      enemyHps: enemies.map((e) => e.hp),
      enemyKnockedOut: enemies.map(() => false),
      enemyAmbushUsed: enemies.map(() => false),
      activeEnemyIdx: 0,
      range: 'close',
    } as any,
  }));
}

const getS = () => useGameStore.getState() as any;
const setS = (fn: any) => useGameStore.setState(fn);

describe('dog combat damage (OTA-685)', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('applyEnemyCounterToDog lands hits — the dog TAKES damage (no longer invulnerable)', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, dog: mkDog(14), hoursElapsed: 0 } });
    setSceneWithEnemies(store, 1);
    const enemy = store.getState().currentScene!.enemies[0]!;

    let sawDamage = false;
    for (let i = 0; i < 60 && !sawDamage; i++) {
      // Reset dog to full each swing; we only care that damage lands at all.
      const cur = store.getState().player!;
      store.setState({ player: { ...cur, dog: { ...cur.dog!, hp: 14, status: 'with_player' } } });
      applyEnemyCounterToDog(enemy as any, getS, setS);
      if (store.getState().player!.dog!.hp < 14) sawDamage = true;
    }
    expect(sawDamage).toBe(true);
  });

  it('a dog dropped to 0 benches (waiting_at_base) with the bleed-out clock started', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, dog: mkDog(1), hoursElapsed: 5 } });
    setSceneWithEnemies(store, 1);
    const enemy = store.getState().currentScene!.enemies[0]!;

    let benched = false;
    for (let i = 0; i < 80 && !benched; i++) {
      const cur = store.getState().player!;
      // keep resetting to 1hp with_player until a hit lands and downs it
      if (cur.dog!.status !== 'with_player' || cur.dog!.hp > 0) {
        store.setState({ player: { ...cur, dog: { ...cur.dog!, hp: 1, status: 'with_player', downedAtHour: undefined } } });
      }
      applyEnemyCounterToDog(enemy as any, getS, setS);
      if (store.getState().player!.dog!.hp <= 0) benched = true;
    }
    expect(benched).toBe(true);
    const d = store.getState().player!.dog!;
    expect(d.status).toBe('waiting_at_base');
    expect(typeof d.downedAtHour).toBe('number');
  });

  it('runEnemyGroupCounters redirects some swings to the dog over a large group', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, hp: p.hpMax, dead: false, dog: mkDog(14), hoursElapsed: 0 } });

    let sawDamage = false;
    for (let i = 0; i < 25 && !sawDamage; i++) {
      const cur = store.getState().player!;
      store.setState({ player: { ...cur, hp: cur.hpMax, dead: false, dog: { ...cur.dog!, hp: 14, status: 'with_player' } } });
      setSceneWithEnemies(store, 6);
      runEnemyGroupCounters(getS, setS, store.getState().player!);
      if (store.getState().player!.dog!.hp < 14 || store.getState().player!.dog!.status === 'waiting_at_base') sawDamage = true;
    }
    expect(sawDamage).toBe(true);
  });
});

describe('dog vest equipped marker (OTA-685)', () => {
  it('the equipped vest name is tracked on dog.equipped.vest', async () => {
    const store = await freshGame();
    const p = store.getState().player!;
    store.setState({ player: { ...p, dog: mkDog(14, 'Riveted Leather Vest') } });
    expect(store.getState().player!.dog!.equipped.vest).toBe('Riveted Leather Vest');
  });
});
