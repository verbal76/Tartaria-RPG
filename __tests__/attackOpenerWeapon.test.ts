// arb-fix (playtest) — the pre-swing attack opener named the wrong weapon. A PUNCH
// and an OFF-HAND swing both fell back to equipped.main, so "punch" and "attack with
// the off-hand mud-fist wraps" narrated "You bring the aetheric bolt gun to bear" —
// the main weapon the striking hand isn't even holding. The opener must honour the
// swing actually made: bare-hand → fists flavor (no weapon noun), off-hand → the
// off-hand slot, main → the main weapon.

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

const MAIN = 'Aetheric Bolt Gun';
const OFF = 'Mud-fist Wraps';

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Verbal', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  // Equip a distinctively-named MAIN weapon + a bare-reach OFF-hand weapon, and make
  // sure both live in the pack so the opener's "is this a carried weapon?" test can see them.
  const p = store.getState().player!;
  store.setState({
    player: {
      ...p,
      inventory: [
        ...p.inventory,
        { id: 'w_main', name: MAIN, kind: 'weapon', rarity: 'Rare', quantity: 1, tags: [] },
        { id: 'w_off', name: OFF, kind: 'weapon', rarity: 'Common', quantity: 1, tags: [] },
      ],
      equipped: { ...(p.equipped ?? {}), main: MAIN, mainId: 'w_main', off: OFF, offId: 'w_off' },
    } as typeof p,
  });
  return store;
}

function plant() {
  const proto = findEnemyByName('Silt Serpent') ?? findEnemyByName('Mud Spider');
  const enemy = JSON.parse(JSON.stringify(proto));
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene,
      enemies: [enemy],
      enemyHps: [enemy.hp],
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: [false],
      enemyKnockedOut: [false],
    },
  });
}

const opener = (): string => {
  const world = useGameStore.getState().gameLog.filter((e) => e.channel === 'world');
  return world[world.length - 1]?.text ?? '';
};

describe('attack opener names the weapon the swing actually uses', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  it('a PUNCH never narrates the main weapon (bolt gun)', async () => {
    const store = await boot();
    plant();
    await store.getState().submitPlayerAction('punch');
    expect(opener().toLowerCase()).not.toContain('bolt gun');
  });

  it('an OFF-HAND swing names the off-hand weapon, not the main weapon', async () => {
    const store = await boot();
    plant();
    await store.getState().submitPlayerAction('attack with the off-hand mud-fist wraps');
    const line = opener().toLowerCase();
    expect(line).toContain('mud-fist wraps');
    expect(line).not.toContain('bolt gun');
  });

  it('a plain main-hand attack still names the main weapon', async () => {
    const store = await boot();
    plant();
    await store.getState().submitPlayerAction('attack with the aetheric bolt gun');
    expect(opener().toLowerCase()).toContain('bolt gun');
  });
});
