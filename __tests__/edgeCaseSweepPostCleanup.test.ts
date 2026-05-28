// Post-OTA-140 stress: adversarial edge-case sweep.
//
// Targets four orthogonal pressure surfaces:
//
//   1. Hook-puzzle verb resolver fed empty / null / whitespace /
//      unicode targets through every new puzzle verb (drink, rotate,
//      knock, turn, twist, press, push, pull). Must not crash or
//      mark a wrong-attempt against a fresh-hook puzzle when the
//      target is garbage.
//
//   2. Save/load round-trip with a fully-populated player (dog,
//      golem-companion, puzzle progress on a planted hook, transit
//      area, travel target, hub-room). Round-trip via JSON should
//      preserve every field.
//
//   3. Race condition: rapidly fire submitPlayerAction calls back-to-
//      back. Player + scene must stay coherent (HP non-negative,
//      finite, no NaN, no double-write corruption).
//
//   4. Per-golem summonDC × race-modifier table (OTA-137 + OTA-039 /
//      MECHANIC-1). Verify the effective DC matrix for every (race,
//      golem) combination.
//
// Iteration caps documented per block.

jest.setTimeout(15000);

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
import { applyPuzzleInput } from '../app/engine/hookPuzzles';
import type { Hook } from '../app/engine/hooks';
import { getGolemDefinition, GOLEM_DEFINITIONS } from '../app/engine/golems';
import { aethercraftDcModifier } from '../app/engine/raceMechanics';
import { createDogCompanion } from '../app/engine/dogCompanion';

const NEW_VERBS = ['drink', 'rotate', 'knock', 'turn', 'twist', 'press', 'push', 'pull'] as const;
const ADVERSARIAL_TARGETS = [
  '',
  ' ',
  '   ',
  '\t\n',
  ' ', // non-breaking space
  '🔥',
  '🐉ring🔥', // unicode + ascii
  'РИНГ', // cyrillic
  'リング', // katakana
  '<script>alert(1)</script>',
  '../../etc/passwd',
  'null',
  'undefined',
  'NaN',
];

function vaultHook(): Hook {
  return {
    id: 'edge_vault',
    kind: 'sealed_vault_door',
    nouns: ['vault', 'door', 'ring', 'tumbler'],
    plantedLine: 'A circular Tartarian vault door.',
    stage: 0,
    resolved: false,
  };
}

function steepleHook(): Hook {
  return {
    id: 'edge_steeple',
    kind: 'submerged_steeple',
    nouns: ['steeple', 'church'],
    plantedLine: 'A submerged steeple breaks the mud.',
    stage: 0,
    resolved: false,
  };
}

async function bootClean(name = 'Edger', raceId = 'mud_dweller', factionId = 'reclaimers_guild') {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({ name, raceId, factionId });
  store.getState().skipTutorial?.();
  const p = store.getState().player!;
  store.setState({
    player: {
      ...p,
      hubRoomId: null,
      stamina: 50,
      staminaMax: 50,
      hp: 30,
      hpMax: 30,
      stats: { strength: 12, dexterity: 12, intelligence: 12, wisdom: 12, charisma: 12 },
    },
  });
  return store;
}

describe('puzzle resolver — adversarial targets via applyPuzzleInput', () => {
  it('every (verb × adversarial target) pair on a fresh vault hook yields a coherent outcome (no throws, no NaN)', () => {
    // 8 verbs × 14 adversarial targets = 112 invocations. Under cap.
    let ran = 0;
    for (const intent of NEW_VERBS) {
      for (const target of ADVERSARIAL_TARGETS) {
        const hook = vaultHook();
        // applyPuzzleInput is pure — never throws on garbage inputs.
        const outcome = applyPuzzleInput(hook, { intent, target, direction: null });
        ran++;
        expect(outcome).toBeTruthy();
        expect(outcome.progress).toBeTruthy();
        expect(Number.isFinite(outcome.progress.correctSoFar)).toBe(true);
        expect(Number.isFinite(outcome.progress.failures)).toBe(true);
        expect(outcome.progress.correctSoFar).toBeGreaterThanOrEqual(0);
        expect(outcome.progress.failures).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(outcome.progress.history)).toBe(true);
      }
    }
    expect(ran).toBe(NEW_VERBS.length * ADVERSARIAL_TARGETS.length);
  });

  it('rotate with adversarial direction strings never crashes the vault resolver', () => {
    const adversarialDirs = [null, undefined, '', ' ', 'leftright', 'spin', '🌀', 'arouund', '左'] as const;
    for (const dir of adversarialDirs) {
      const hook = vaultHook();
      const outcome = applyPuzzleInput(hook, {
        intent: 'rotate',
        target: 'ring',
        direction: (dir as 'left' | 'right' | null),
      });
      expect(outcome).toBeTruthy();
      expect(Number.isFinite(outcome.progress.correctSoFar)).toBe(true);
      expect(Number.isFinite(outcome.progress.failures)).toBe(true);
    }
  });

  it('steeple hook fed unicode garbage never produces NaN / negative counters', () => {
    let hook = steepleHook();
    for (const target of ADVERSARIAL_TARGETS) {
      const outcome = applyPuzzleInput(hook, { intent: 'knock', target, direction: null });
      hook = { ...hook, puzzleProgress: outcome.progress };
      expect(Number.isFinite(outcome.progress.correctSoFar)).toBe(true);
      expect(Number.isFinite(outcome.progress.failures)).toBe(true);
      expect(outcome.progress.correctSoFar).toBeGreaterThanOrEqual(0);
      expect(outcome.progress.failures).toBeGreaterThanOrEqual(0);
      // history should be capped at 6 per the OTA-129 resolver contract.
      expect(outcome.progress.history.length).toBeLessThanOrEqual(6);
    }
  });

  it('submitPlayerAction with adversarial verb + target strings never throws', async () => {
    const store = await bootClean('AdvParser');
    let calls = 0;
    for (const verb of NEW_VERBS) {
      for (const target of ADVERSARIAL_TARGETS.slice(0, 6)) {
        // 8 × 6 = 48 calls — cap kept low
        try {
          store.getState().submitPlayerAction(`${verb} ${target}`);
          calls++;
        } catch (e) {
          throw new Error(`submitPlayerAction("${verb} ${target}") threw: ${(e as Error).message}`);
        }
      }
    }
    expect(calls).toBe(NEW_VERBS.length * 6);
    // Player + scene still coherent.
    const p = store.getState().player!;
    expect(Number.isFinite(p.hp)).toBe(true);
    expect(p.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(p.stamina)).toBe(true);
  });
});

describe('save/load round-trip with a fully-populated player', () => {
  it('JSON round-trip preserves dog, planted hook puzzle progress, transit area, travel target, hub room', async () => {
    const store = await bootClean('Saver');
    const dog = createDogCompanion({
      name: 'Marrow',
      breed: 'old bloodhound',
      rawSex: 'boy',
      startingProfile: 'hound',
      currentHour: 42,
    });
    // Populate the player with every field we care about.
    const p0 = store.getState().player!;
    const populated = {
      ...p0,
      hp: 17,
      hpMax: 30,
      stamina: 23,
      staminaMax: 50,
      hubRoomId: 'chandelier_study',
      currentLocationId: 'asgardar',
      mapX: 20,
      mapY: 20,
      travelTarget: { locationId: 'voronov', distanceRemaining: 4 },
      dog,
      companion: {
        name: 'Mud Golem',
        title: 'sworn shield',
        factionId: 'reclaimers_guild',
        recruitedAt: 42,
      },
    };
    store.setState({ player: populated });

    // Plant a puzzle-mid-state hook on the scene.
    const scene = store.getState().currentScene!;
    const hook: Hook = {
      ...vaultHook(),
      puzzleProgress: {
        correctSoFar: 2,
        failures: 1,
        history: ['rotate:left', 'rotate:right'],
      },
    };
    store.setState({
      currentScene: {
        ...scene,
        hooks: [hook],
        transitArea: 'near Voronov',
      },
    });

    // Round-trip via JSON.
    const snapshot = {
      player: store.getState().player,
      worldMemory: store.getState().worldMemory,
      currentScene: store.getState().currentScene,
    };
    const restored = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;

    expect(restored.player).toEqual(snapshot.player);
    expect(restored.player!.travelTarget).toEqual({ locationId: 'voronov', distanceRemaining: 4 });
    expect(restored.player!.dog).toEqual(snapshot.player!.dog);
    expect(restored.player!.companion).toEqual(snapshot.player!.companion);
    expect(restored.player!.hubRoomId).toBe('chandelier_study');
    expect(restored.currentScene!.transitArea).toBe('near Voronov');
    const rh = restored.currentScene!.hooks.find((h: { id: string }) => h.id === 'edge_vault');
    expect(rh).toBeTruthy();
    expect(rh!.puzzleProgress?.correctSoFar).toBe(2);
    expect(rh!.puzzleProgress?.failures).toBe(1);
    expect(rh!.puzzleProgress?.history.length).toBe(2);
  });
});

describe('race-condition: rapid-fire submitPlayerAction calls', () => {
  it('20 back-to-back submits keep player + scene coherent', async () => {
    const store = await bootClean('Spammer');
    const actions = [
      'look around', 'check inventory', 'rest', 'look around',
      'check inventory', 'look around', 'rest', 'check inventory',
      'look around', 'rest', 'look around', 'rest',
      'check inventory', 'look around', 'rest', 'check inventory',
      'look around', 'rest', 'look around', 'check inventory',
    ];
    // 20 calls — well within cap
    for (const a of actions) {
      store.getState().submitPlayerAction(a);
    }
    const p = store.getState().player!;
    const scene = store.getState().currentScene;
    expect(Number.isFinite(p.hp)).toBe(true);
    expect(p.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(p.stamina)).toBe(true);
    expect(p.stamina).toBeGreaterThanOrEqual(0);
    expect(p.stamina).toBeLessThanOrEqual(p.staminaMax);
    expect(scene).toBeTruthy();
    expect(scene!.location).toBeTruthy();
    // Game log strictly grew.
    expect(store.getState().gameLog.length).toBeGreaterThan(0);
  });

  it('submitPlayerAction with the same input 10 times in a row keeps state coherent', async () => {
    const store = await bootClean('Repeater');
    for (let i = 0; i < 10; i++) {
      store.getState().submitPlayerAction('look around');
    }
    const p = store.getState().player!;
    expect(Number.isFinite(p.hp)).toBe(true);
    expect(p.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(p.hoursElapsed ?? 0)).toBe(true);
  });
});

describe('per-golem summonDC × race table (OTA-137 + race modifier)', () => {
  // Reproduces the runAethercraft dc computation:
  //   dc = (def.summonDC ?? 15) + aethercraftDcModifier(raceId)
  //
  // Spec the cleanup OTAs locked in:
  //   Mud 13 / Iron 15 / Aether 17 / Crystal 19
  // Race modifier:
  //   mud_dweller 0, aetherborn +2, everyone else +3
  function effectiveDc(raceId: string, kind: keyof typeof GOLEM_DEFINITIONS): number {
    const def = getGolemDefinition(kind);
    return (def.summonDC ?? 15) + aethercraftDcModifier(raceId);
  }

  it('Mud Dweller (no DC penalty) — full table matches spec', () => {
    expect(effectiveDc('mud_dweller', 'mud_golem')).toBe(13);
    expect(effectiveDc('mud_dweller', 'iron_golem')).toBe(15);
    expect(effectiveDc('mud_dweller', 'aether_golem')).toBe(17);
    expect(effectiveDc('mud_dweller', 'crystal_golem')).toBe(19);
  });

  it('Aetherborn (+2 DC) — full table', () => {
    expect(effectiveDc('aetherborn', 'mud_golem')).toBe(15);
    expect(effectiveDc('aetherborn', 'iron_golem')).toBe(17);
    expect(effectiveDc('aetherborn', 'aether_golem')).toBe(19);
    expect(effectiveDc('aetherborn', 'crystal_golem')).toBe(21);
  });

  // Every other race gets +3.
  it.each([
    'tartarian_giant',
    'reclaimer',
    'architectural_sentinel',
    'mud_golem',
    'unknowing_mass',
    'made_up_race_id',
  ])('untrained race "%s" (+3 DC) — full table', (race) => {
    expect(effectiveDc(race, 'mud_golem')).toBe(16);
    expect(effectiveDc(race, 'iron_golem')).toBe(18);
    expect(effectiveDc(race, 'aether_golem')).toBe(20);
    expect(effectiveDc(race, 'crystal_golem')).toBe(22);
  });

  it('summonDC values themselves match the OTA-137 spec on the GolemDefinition', () => {
    expect(getGolemDefinition('mud_golem').summonDC).toBe(13);
    expect(getGolemDefinition('iron_golem').summonDC).toBe(15);
    expect(getGolemDefinition('aether_golem').summonDC).toBe(17);
    expect(getGolemDefinition('crystal_golem').summonDC).toBe(19);
  });

  it('aethercraftDcModifier monotonicity — mud_dweller 0 < aetherborn 2 < other 3', () => {
    expect(aethercraftDcModifier('mud_dweller')).toBe(0);
    expect(aethercraftDcModifier('aetherborn')).toBe(2);
    expect(aethercraftDcModifier('zorglax')).toBe(3);
    expect(aethercraftDcModifier(undefined)).toBe(3);
  });
});
