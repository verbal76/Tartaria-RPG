// OTA-873 — same-element dual coating SUMS its DOT. An upgraded weapon carrying two
// coatings of the SAME element (poison + poison) should land ONE poison DOT whose
// per-turn damage is the SUM of both slots' rolls — not a single refreshed tick. We
// drive real store combat (forced max rolls, a poison-NEUTRAL enemy so both coatings
// always take) and compare a single-poison weapon's DOT to a dual-poison weapon's.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) { void _t; void _d; void _s; } },
}));
jest.mock('llama.rn', () => ({ initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })), releaseAllLlama: jest.fn() }));
jest.mock('react-native-executorch', () => ({}));
jest.mock('expo-file-system', () => ({ documentDirectory: '/tmp/', cacheDirectory: '/tmp/', getInfoAsync: jest.fn(async () => ({ exists: false })), makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''), writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}), downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } } }));
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
import { secondCoatRolled } from '../app/engine/weaponCoating';

jest.setTimeout(20000);

async function boot() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name: 'Venom', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
  store.getState().skipTutorial?.();
  return store;
}

// A poison-NEUTRAL enemy (Mud Boar) so the coating always takes; kept alive through
// the swing so the survive-gated DOT seeds.
function plantBoar() {
  const proto = findEnemyByName('Mud Boar');
  if (!proto) throw new Error('Mud Boar not found');
  const enemy: any = JSON.parse(JSON.stringify(proto));
  enemy.hp = 9999;
  const scene = useGameStore.getState().currentScene!;
  useGameStore.setState({
    currentScene: {
      ...scene, enemies: [enemy], enemyHps: [enemy.hp], activeEnemyIdx: 0, range: 'close',
      enemyAmbushUsed: [false], enemyKnockedOut: [false], enemyStatuses: [[]],
      enemyArmorShred: [0], enemyCorruptionStacks: [0],
    },
  });
}

function equip(dual: boolean) {
  const store = useGameStore;
  const p = store.getState().player!;
  const id = 'coat-test-wpn';
  const item: any = {
    id, name: 'Rusted Blade', kind: 'weapon', quantity: 1,
    coating: { kind: 'poison', dice: '1d4', label: 'Poisoned' },
    ...(dual ? { coatingSlots: 2, coating2: { kind: 'poison', dice: '1d4', label: 'Venomous' } } : {}),
  };
  useGameStore.setState({
    player: {
      ...p,
      inventory: [...(p.inventory ?? []).filter((i) => i.id !== id), item],
      equipped: { ...(p.equipped ?? {}), main: 'Rusted Blade', mainId: id },
    },
  });
}

async function attackMaxRolls() {
  const store = useGameStore;
  await store.getState().submitPlayerAction('attack');
  let guard = 0;
  while (store.getState().pendingRolls) {
    if (guard++ > 50) throw new Error('roll loop did not terminate');
    const pr = store.getState().pendingRolls!;
    const step = pr.steps[pr.currentStep]!;
    const values = step.id === 'attack'
      ? [20] // natural 20 → forced hit
      : Array.from({ length: step.count ?? 1 }, () => step.sides ?? 1); // max each die
    store.getState().resolveRollStep(values);
  }
}

function poisonDot(): number {
  const sc = useGameStore.getState().currentScene!;
  const dot = (sc.enemyStatuses?.[0] ?? []).find((st: any) => st.kind === 'poison_coat');
  return dot?.dmgPerTurn ?? 0;
}

describe('OTA-873 — same-element dual coating sums its DOT', () => {
  it('a dual-poison weapon lands ONE poison DOT ticking for slot 1 + HALF of slot 2', async () => {
    // single-poison baseline
    await boot(); plantBoar(); equip(false);
    await attackMaxRolls();
    const single = poisonDot();
    expect(single).toBeGreaterThan(0);
    // exactly one poison_coat status (not two)
    const sc1 = useGameStore.getState().currentScene!;
    expect((sc1.enemyStatuses?.[0] ?? []).filter((st: any) => st.kind === 'poison_coat')).toHaveLength(1);

    // dual-poison — same weapon + a second poison slot
    await boot(); plantBoar(); equip(true);
    await attackMaxRolls();
    const dual = poisonDot();
    const sc2 = useGameStore.getState().currentScene!;
    // Still ONE merged poison DOT — that is OTA-873's actual claim and it holds.
    expect((sc2.enemyStatuses?.[0] ?? []).filter((st: any) => st.kind === 'poison_coat')).toHaveLength(1);
    // ⚠ Retargeted by OTA-1150, and the SUM half of the claim genuinely changed.
    // This used to be 2× — both slots paying full freight. That batch capped the
    // SECOND slot at SECOND_COAT_EFFECT_MULT, so a same-element dual now ticks
    // for slot 1 plus half of slot 2. The merge behaviour (one status, not two)
    // is what OTA-873 was defending and is untouched; only the total moved.
    expect(dual).toBe(single + secondCoatRolled(single));
    expect(dual).toBeLessThan(single * 2);
    expect(dual).toBeGreaterThan(single);
  });
});
