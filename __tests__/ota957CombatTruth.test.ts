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

// OTA-957 — combat truth batch, from one playtest log:
// 1) a DOT tick that drops an enemy to 0 in a MIXED fight now kills it (the
//    corpse used to stand at 0 HP until a whole extra swing formally killed it);
// 2) a bandolier throw settles (spend + off-hand restore) when its dice modal
//    CLOSES, so the damage phase reads the thrown item — not the weapon that
//    was quietly put back in the hand while the modal sat open;
// 3) the ranged/point-blank check reads the SWUNG hand, so an off-hand melee
//    blade no longer inherits "+2 (point blank)" from a holstered ranged main.
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import { findEnemyByName } from '../app/engine/encounter';
import type { InventoryItem } from '../app/engine/types';

type DotStatus = { kind: 'corruption_coat'; turnsRemaining: number; dmgPerTurn: number; sourceName: string };

async function bootFight(hps: number[], statuses: DotStatus[][] = []) {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Batch', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  await new Promise((r) => setTimeout(r, 25));
  const proto = findEnemyByName('Mud Spider') ?? findEnemyByName('Gutter Rat');
  const foes = hps.map((hp, i) => {
    const e = JSON.parse(JSON.stringify(proto));
    e.hp = Math.max(hp, 30);
    e.name = `${e.name} ${i + 1}`;
    return e;
  });
  const scene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...scene,
      enemies: foes,
      enemyHps: hps,
      activeEnemyIdx: hps.length - 1,
      range: 'close',
      enemyAmbushUsed: foes.map(() => false),
      enemyKnockedOut: foes.map(() => false),
      enemyStatuses: hps.map((_, i) => statuses[i] ?? []),
      enemyArmorShred: foes.map(() => 0),
      enemyCorruptionStacks: foes.map(() => 0),
    },
  });
  store.setState((s) => ({ player: { ...s.player!, hp: 200, hpMax: 200, stamina: 20, staminaMax: 20 } }));
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

describe('OTA-957 — a mid-fight DOT kill lands NOW, not on the next swing', () => {
  it('the poisoned raider dies to the tick; loot fires; the survivor keeps the fight alive', async () => {
    const store = await bootFight(
      [1, 9999],
      [[{ kind: 'corruption_coat', turnsRemaining: 3, dmgPerTurn: 6, sourceName: 'Corrupted Test Coat' }], []],
    );
    await store.getState().submitPlayerAction('attack');
    drain(store, 20);
    await new Promise((r) => setTimeout(r, 5));
    const sc = store.getState().currentScene!;
    expect(sc.enemies.length).toBe(1); // the corpse resolved out mid-fight
    expect(sc.range ?? null).not.toBeNull(); // and the fight did NOT end
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/ 1 defeated/); // loot + kill bookkeeping ran for the DOT kill
  });
});

const plate = (qty: number): InventoryItem => ({
  id: 'plate1', name: 'Sentinel Core Plate', kind: 'misc', rarity: 'Uncommon', quantity: qty,
  tags: ['automation', 'tech', 'salvage', 'scrap', 'throwable'],
});
const club = (): InventoryItem => ({
  id: 'club1', name: 'Club', kind: 'weapon', rarity: 'Common', quantity: 1, tags: ['weapon', 'melee'],
});

async function bootThrow(qty: number) {
  const store = await bootFight([9999]);
  store.setState((s) => ({
    player: {
      ...s.player!,
      inventory: [...s.player!.inventory, plate(qty), club()],
      equipped: { ...(s.player!.equipped ?? {}), off: 'Club', offId: 'club1', bandolierIds: ['plate1'] },
    },
  }));
  return store;
}

describe('OTA-957 — a bandolier throw settles when its dice modal closes', () => {
  it('the modal opens with the THROWN item in hand; resolving spends one and restores the real off hand', async () => {
    const store = await bootThrow(2);
    store.getState().throwFromBandolier('Sentinel Core Plate', 'plate1');
    expect(store.getState().pendingRolls).toBeTruthy();
    // Still in hand — the damage phase must read the plate, not the Club.
    expect(store.getState().player!.equipped?.off).toBe('Sentinel Core Plate');
    drain(store, 20);
    await new Promise((r) => setTimeout(r, 5));
    const p = store.getState().player!;
    expect(p.equipped?.off).toBe('Club'); // hand unwound after the swing
    expect(p.inventory.find((i) => i.id === 'plate1')?.quantity).toBe(1); // exactly one spent
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/sentinel core plate/i); // the swing narrates the thrown item
  });

  it('CANCELLING the throw restores the hand and spends nothing', async () => {
    const store = await bootThrow(2);
    store.getState().throwFromBandolier('Sentinel Core Plate', 'plate1');
    expect(store.getState().pendingRolls).toBeTruthy();
    store.getState().cancelPendingRolls();
    const p = store.getState().player!;
    expect(p.equipped?.off).toBe('Club');
    expect(p.inventory.find((i) => i.id === 'plate1')?.quantity).toBe(2);
    expect(p.equipped?.bandolierIds ?? []).toContain('plate1');
  });
});

describe('OTA-957 — point blank follows the hand that swings', () => {
  it('an off-hand melee swing does not inherit point blank from a ranged main hand', async () => {
    const store = await bootFight([9999]);
    store.setState((s) => ({
      player: {
        ...s.player!,
        inventory: [
          ...s.player!.inventory,
          { id: 'bc1', name: 'Bolt-Caster', kind: 'weapon', rarity: 'Uncommon', quantity: 1, tags: ['weapon', 'ranged'] } as InventoryItem,
          club(),
        ],
        equipped: { ...(s.player!.equipped ?? {}), main: 'Bolt-Caster', mainId: 'bc1', off: 'Club', offId: 'club1' },
      },
    }));
    await store.getState().submitPlayerAction('attack with the off-hand club');
    expect(store.getState().pendingRolls).toBeTruthy();
    expect(JSON.stringify(store.getState().pendingRolls!.steps)).not.toMatch(/point blank/i);
    store.getState().cancelPendingRolls();
    // Guard the intended case: the ranged MAIN at arm's reach still gets it.
    await store.getState().submitPlayerAction('attack');
    expect(store.getState().pendingRolls).toBeTruthy();
    expect(JSON.stringify(store.getState().pendingRolls!.steps)).toMatch(/point blank/i);
    store.getState().cancelPendingRolls();
  });
});
