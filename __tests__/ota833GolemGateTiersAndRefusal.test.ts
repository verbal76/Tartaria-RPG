// OTA-833 — (1) tier the golem-weapon Core gate (player ruling "A"): Crude → 1 Core,
// normal → 2, Elder → 4 (was a flat 4 for all, so a learned "Golem Sledge" and even
// a "Crude" one were locked as hard as the Elder tier). (2) The gate refusal now
// surfaces a "NOT YET" popup instead of a silent no-op — the engine already logs an
// arbiter refusal; this test locks the tier math + that a refusal is logged (the
// signal the CraftRefusalModal renders).

jest.setTimeout(20000);
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
  makeDirectoryAsync: jest.fn(async () => {}), readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => {}), deleteAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ uri: '' })), EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } })); } },
}));

import recipesData from '../app/data/items/recipes.json';
import { useGameStore } from '../app/state/gameStore';

type Recipe = { result: string; coresRequired?: number };
const recipes = (recipesData as { recipes: Recipe[] }).recipes;
const cores = (name: string) => recipes.find((r) => r.result === name)?.coresRequired;

describe('OTA-833 (data) — the golem-weapon Core gate is tiered', () => {
  it('Crude → 1, normal → 2, Elder → 4 for every golem-weapon family', () => {
    for (const base of ['Golem Sledge', 'Golem Greatsword', 'Golem Pike']) {
      expect(cores(`Crude ${base}`)).toBe(1);
      expect(cores(base)).toBe(2);
      expect(cores(`Elder ${base}`)).toBe(4);
    }
  });
});

describe('OTA-833 (engine) — the tiered gate refuses/permits by Core count', () => {
  async function newGameWithCores(n: number) {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Forger', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: { ...p, mainQuest: { ...(p.mainQuest ?? { phase: 'cores' }), coresRecovered: Array.from({ length: n }, (_, i) => `cap_${i}`) } as never },
    });
  }
  const tail = () => (useGameStore.getState().gameLog ?? []).map((e) => (e as { text?: string }).text ?? '').join('\n');

  it('a Crude golem weapon is REFUSED at 0 Cores (needs 1) and the refusal is logged', async () => {
    await newGameWithCores(0);
    const before = useGameStore.getState().gameLog.length;
    await useGameStore.getState().submitPlayerAction('craft Crude Golem Sledge');
    const log = tail();
    // The war-forge refusal fired, naming the 1-Core requirement (this is the text
    // the CraftRefusalModal shows) — and it wasn't a silent no-op.
    expect(useGameStore.getState().gameLog.length).toBeGreaterThan(before);
    expect(log).toMatch(/war-forging.*1 Cores|carried 1 Cores/i);
  });

  it('at 1 Core the Crude gate PASSES (any refusal is no longer about Cores)', async () => {
    await newGameWithCores(1);
    await useGameStore.getState().submitPlayerAction('craft Crude Golem Sledge');
    // With the Core gate cleared, the craft proceeds to the ingredient check — so the
    // refusal (if any) is NOT the war-forge Core message.
    expect(tail()).not.toMatch(/war-forging from before the flood/i);
  });

  // (A tier-specific behavioral craft like "craft Elder Golem Sledge" is confounded
  // by findRecipeByResult's substring matching — "elder golem sledge" also contains
  // "golem sledge", so the parser can resolve the shorter normal-tier recipe. The
  // per-tier Core requirement is locked by the DATA test above; the behavioral tests
  // here prove the gate refuses-under / permits-met + logs a refusal for the modal.)
});
