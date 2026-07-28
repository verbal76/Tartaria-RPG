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

// OTA-983 — elevated combat. Owner: "you can be attacked by airborn creatures
// and with shots from below, so you need a ranged weapon to fire down at the
// ground and any weapon to attack airborn enemies." When a timed ambush
// masses at the BASE of your climb (enemiesAtBase): grounded melee members
// circle below and cannot swing; grounded RANGED members shoot up; AIRBORNE
// members fight you level. Your side mirrors it — a grounded target needs a
// weapon that reaches far/distant; an airborne one meets any weapon. Summit
// and wall fights (spawned at your level) are untouched.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { InventoryItem } from '../app/engine/types';

const bruteEnemy = () => ({
  name: 'Silt Brute', hp: 9999, ac: 10, attack: 'Slam', damage: '1d6 crushing',
  abilityPoint: 'Strength 6', rarity: 'Common', traits: [], loot: [],
});
const slingerEnemy = () => ({
  name: 'Silt Slinger', hp: 9999, ac: 10, attack: 'Sling Stone', damage: '1d6 crushing',
  abilityPoint: 'Dexterity 6', rarity: 'Common', traits: [], loot: [],
});
const dronerEnemy = () => ({
  name: 'Winged Drone', hp: 9999, ac: 10, attack: 'Talon Rake', damage: '1d6 slashing',
  abilityPoint: 'Dexterity 6', rarity: 'Common', traits: [], loot: [],
});

const club = (): InventoryItem => ({
  id: 'club1', name: 'Club', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon', 'melee'],
});
const caster = (): InventoryItem => ({
  id: 'bc1', name: 'Bolt-Caster', kind: 'weapon', rarity: 'Uncommon', quantity: 1, tags: ['weapon', 'ranged'],
});

async function bootElevated(foes: any[], atBase: boolean, mainWeapon: 'Club' | 'Bolt-Caster') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Perch', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      ambientNouns: ['watchtower'],
      elevatedOn: { noun: 'watchtower', tier: 2, totalTiers: 3 },
      enemiesAtBase: atBase,
      enemies: foes,
      enemyHps: foes.map((e) => e.hp),
      activeEnemyIdx: 0,
      range: 'close',
      enemyAmbushUsed: foes.map(() => false),
      enemyKnockedOut: foes.map(() => false),
      enemyStatuses: foes.map(() => []),
      enemyArmorShred: foes.map(() => 0),
      enemyCorruptionStacks: foes.map(() => 0),
    },
  });
  store.setState((s) => ({
    player: {
      ...s.player!,
      hp: 300, hpMax: 300, stamina: 30, staminaMax: 30,
      inventory: [...s.player!.inventory, club(), caster()],
      equipped: {
        ...(s.player!.equipped ?? {}),
        main: mainWeapon, mainId: mainWeapon === 'Club' ? 'club1' : 'bc1',
        off: undefined, offId: undefined,
      },
    },
  }));
  return store;
}

function drain(store: typeof useGameStore, rollValue: number) {
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 50) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    store.getState().resolveRollStep(Array.from({ length: step.count ?? 1 }, () => rollValue));
  }
}

describe('OTA-983 — firing down the climb needs a weapon that shoots', () => {
  it('a melee swing at a base-camped grounder is refused free; a caster fires down fine', async () => {
    const store = await bootElevated([bruteEnemy()], true, 'Club');
    await store.getState().submitPlayerAction('attack');
    expect(store.getState().pendingRolls).toBeFalsy();
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/won't reach from up here/i);
    store.setState((s) => ({
      player: { ...s.player!, equipped: { ...(s.player!.equipped ?? {}), main: 'Bolt-Caster', mainId: 'bc1' } },
    }));
    await store.getState().submitPlayerAction('attack');
    expect(store.getState().pendingRolls).toBeTruthy();
    store.getState().cancelPendingRolls();
  });

  it('an AIRBORNE enemy meets any weapon — the melee swing goes through', async () => {
    const store = await bootElevated([dronerEnemy()], true, 'Club');
    await store.getState().submitPlayerAction('attack');
    expect(store.getState().pendingRolls).toBeTruthy();
    drain(store, 15);
    await new Promise((r) => setTimeout(r, 5));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/Winged Drone — d20/); // and it fights back, level with you
  });
});

describe('OTA-983 — the base-camped pack: melee benched, shooters shoot', () => {
  it('the brute circles below while the slinger fires up', async () => {
    const store = await bootElevated([bruteEnemy(), slingerEnemy()], true, 'Bolt-Caster');
    await store.getState().submitPlayerAction('attack');
    drain(store, 15);
    await new Promise((r) => setTimeout(r, 5));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/Silt Slinger — d20/); // the shot from below happened
    expect(log).not.toMatch(/Silt Brute — d20/); // the grounded melee never swung
    expect(log).toMatch(/circle(s)? the base/i); // and the bench is narrated
  });
});

describe('OTA-983 — summit fights at your level stay ordinary melee', () => {
  it('without enemiesAtBase, a melee swing at a grounder-type enemy proceeds', async () => {
    const store = await bootElevated([bruteEnemy()], false, 'Club');
    await store.getState().submitPlayerAction('attack');
    expect(store.getState().pendingRolls).toBeTruthy();
    drain(store, 15);
    await new Promise((r) => setTimeout(r, 5));
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/Silt Brute — d20/); // it swings back like any summit brawl
  });
});
