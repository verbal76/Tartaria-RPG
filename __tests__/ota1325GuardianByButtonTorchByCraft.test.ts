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
      static createAsync: () => Promise<{ sound: { playAsync: () => void; unloadAsync: () => void } }> =
        jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } }));
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



// ⚠⚠ OTA-1325 — TWO OWNER RULINGS FROM THE 4.29.186 DEVICE LOG.
//
// (1) *"guardians should only come from the summon button, because there are other
// quests in some of the capital cities that need to examine the area and the examine
// summon will eat the other events."*
//
// (2) *"reduce the free lantern spawn rate, they should be a rare find, mostly
// crafted."*
import { readFileSync } from 'fs';
import { join } from 'path';
import { findCatalogItem } from '../app/engine/crafting';
import { hasSalvageYield, rollSalvagePool } from '../app/engine/salvagePools';
import { canRecoverCore } from '../app/engine/mainQuest';
import { classifyGatherNoun } from '../app/engine/gatherSort';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', 'app', ...p), 'utf8');
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const STORE = codeOnly(read('state', 'gameStore.ts'));

describe('OTA-1325 (1) — a Core Guardian comes from the button and nothing else', () => {
  it('⚠⚠ the verb path is GONE: no intent gate raises a guardian any more', () => {
    // The removed shape: `canRecoverCore(player, parsed.intent) && isStationed…`
    // followed by spawnGuardianForCapital, inside submitPlayerAction.
    expect(STORE).not.toContain('canRecoverCore(player, parsed.intent)');
    expect(STORE).not.toContain('mqMod.canRecoverCore');
  });

  it('⚠⚠ exactly ONE site spawns a guardian, and it is the summon action', () => {
    const spawns = STORE.split('\n').filter((l) => l.includes('spawnGuardianForCapital'));
    expect(spawns.length).toBe(1);
    // ...and it lives inside summonCoreGuardian, which the UI chips call.
    const i = STORE.indexOf('summonCoreGuardian()');
    expect(i).toBeGreaterThan(-1);
    expect(STORE.indexOf('spawnGuardianForCapital')).toBeGreaterThan(i);
  });

  it('⚠⚠ the ★ SUMMON control still exists on BOTH screens that offered it', () => {
    for (const f of [['screens', 'ExplorationScreen.tsx'], ['screens', 'ContractsScreen.tsx']]) {
      expect(read(...f)).toContain('summonCoreGuardian()');
    }
  });

  it('⚠⚠ THE POINT OF THE RULING: examining a capital no longer eats other threads', () => {
    // The old block RETURNED before the action's own handler ran, so whichever
    // Capital thread the player was actually reaching for never happened. With the
    // gate gone, `investigate` inside a capital is just `investigate`.
    expect(STORE).not.toContain('SEARCH_GATE_INTENTS');
  });

  it('⚠ the faction route survives as flavour, and says so', () => {
    // canRecoverCore is kept (the table is real colour and the suite pins it) but
    // must not decide anything — the header says so in as many words.
    expect(typeof canRecoverCore).toBe('function');
    expect(read('engine', 'mainQuest.ts')).toContain('THIS NO LONGER GATES THE SUMMON');
  });

  it('⚠ the wrong-verb nudge now points at the control that works', () => {
    expect(STORE).toContain('Tap ★ SUMMON on the MAIN QUEST chip');
  });
});

describe('OTA-1325 (2) — the torch is a rare find, mostly crafted', () => {
  it('⚠⚠ a room lantern is NO LONGER a free Aetheric Torch', () => {
    for (const noun of ['lantern', 'broken lantern', 'rusted lantern', 'dust lantern', 'torch']) {
      expect(findCatalogItem(noun, { aliases: true })).toBeNull();
    }
  });

  it('⚠⚠ ...it is scenery that SALVAGES, which is where the rare torch lives', () => {
    expect(hasSalvageYield('lantern')).toBe(true);
    // The picker must therefore file it as scenery, not as a takeable item.
    expect(classifyGatherNoun('lantern')).toBe('scenery');
  });

  it('⚠⚠ salvaging lanterns yields a torch RARELY, and Aether Crystal often', () => {
    // Measured over the real pool rather than asserted from the weights: the point
    // of the ruling is the RATE, so the rate is what gets pinned.
    let torches = 0; let crystals = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const out = rollSalvagePool('lantern');
      // ⚠ Not every roll reaches the `light` pool — a lantern can also come up as a
      // uncatalogued curio, which is its own (fusable) reward. Measure the END rate
      // the player actually sees rather than the pool's internal weights.
      if (out?.itemName === 'Aetheric Torch') torches += 1;
      if (out?.itemName === 'Aether Crystal') crystals += 1;
    }
    const torchRate = torches / N;
    // Measured ~3.0% end-to-end: the pool's 4.5% rare-find chance, less the ~17%
    // of yielding rolls the curio valve takes first. Band is generous so tuning
    // does not false-fail — but a return to the alias era (a guaranteed torch per
    // room, 100%) and a silent drop to ZERO both break it, and zero is the state
    // this suite was written to catch: the weight-4 entry sat in the pool for
    // dozens of builds while arb61's materials filter quietly ate every roll.
    expect(torchRate).toBeGreaterThan(0.005);
    expect(torchRate).toBeLessThan(0.10);
    // And the crafting ingredient comes out far more often than the finished item —
    // "mostly crafted" has to be the path the numbers actually push you down.
    expect(crystals).toBeGreaterThan(torches * 3);
  });

  it('⚠⚠ the recipe is real, so "mostly crafted" is an available path', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const recipes = require('../app/data/items/recipes.json') as { recipes?: unknown[] } | unknown[];
    const list = (Array.isArray(recipes) ? recipes : recipes.recipes ?? []) as Array<{
      result?: string; ingredients?: Array<{ name: string; quantity: number }>;
    }>;
    const torch = list.find((r) => r.result === 'Aetheric Torch');
    expect(torch).toBeTruthy();
    const names = (torch!.ingredients ?? []).map((i) => i.name);
    expect(names).toContain('Aether Crystal');
  });

  it('⚠ the OTHER alias families are untouched — this was about light, not aliases', () => {
    expect(findCatalogItem('rope coil', { aliases: true })?.name).toBe('Climbing Rope');
    expect(findCatalogItem('broken compass', { aliases: true })?.name).toBe('Aetheric Compass');
  });
});
