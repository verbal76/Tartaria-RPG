// ⚠ PORTED FROM THE GOLEM LINE during the golem-parity pass. Golem is the model
// line, so its version of this suite is authoritative; the OTA numbers in the
// commentary below are GOLEM's, which is the honest provenance for where the
// behaviour being pinned was actually written.
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
jest.mock('expo-av', () => ({ Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: jest.Mock = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } } }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

// OTA-1206 — THE TORCH MARKS WHAT'S WORTH A CLOSER LOOK. Owner, after 75 hours
// as his own main tester: investigate had become "tap investigate, tap an item"
// eight times per room to find the one payoff, and the Aetheric Torch rotted in
// the pack because free "look around" covered its old reveal. One fix for both:
// a torch use marks (✦, on the investigate chips) the nouns that actually hold
// something — hooks, unread recipe notes, unharvested perches — so investigate
// becomes a choice and the torch gets a job no free verb can do.
import { readFileSync } from 'fs';
import { join } from 'path';
import { arbiterEyeNouns } from '../app/engine/arbiterEye';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { Hook } from '../app/engine/hooks';

jest.setTimeout(120000);

async function settle(pred: () => boolean, deadlineMs = 4000) {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < deadlineMs) {
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe('OTA-1206 — the marking rule mirrors the real payoff branches', () => {
  const hook = (nouns: string[], resolved = false): Hook => ({
    id: 'h1', kind: 'strange_smoke' as Hook['kind'], nouns, plantedLine: '', stage: 0, resolved,
  });

  it('flags a noun an OPEN hook reaches, and not one a resolved hook reaches', () => {
    expect(arbiterEyeNouns({
      displayedNouns: ['column of smoke', 'silt bank'],
      hooks: [hook(['smoke'])],
    })).toEqual(['column of smoke']);
    expect(arbiterEyeNouns({
      displayedNouns: ['column of smoke', 'silt bank'],
      hooks: [hook(['smoke'], true)],
    })).toEqual([]);
  });

  it('flags an UNREAD recipe-note noun; a read one stays dark', () => {
    expect(arbiterEyeNouns({
      displayedNouns: ['faded schematic', 'silt bank'], hooks: [],
    })).toEqual(['faded schematic']);
    expect(arbiterEyeNouns({
      displayedNouns: ['faded schematic', 'silt bank'], hooks: [],
      flavorExhaustedNouns: ['faded schematic'],
    })).toEqual([]);
  });

  it('flags an UNHARVESTED perch; a harvested one stays dark', () => {
    const placements = { 'wax-sealed satchel': { structure: 'guard tower', tier: 2 } };
    expect(arbiterEyeNouns({
      displayedNouns: ['wax-sealed satchel', 'shore'], hooks: [], nounPlacements: placements,
    })).toEqual(['wax-sealed satchel']);
    expect(arbiterEyeNouns({
      displayedNouns: ['wax-sealed satchel', 'shore'], hooks: [], nounPlacements: placements,
      searchedAmbientNouns: ['wax-sealed satchel'],
    })).toEqual([]);
  });

  it('a room of plain nouns marks NOTHING — an unearned ✦ is a new lie', () => {
    expect(arbiterEyeNouns({
      displayedNouns: ['silt bank', 'shore', 'broken wall'], hooks: [],
    })).toEqual([]);
  });
});

describe('OTA-1206 — LIVE: the torch sweep in a no-lead room', () => {
  beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

  async function boot() {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'Sweeper', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    await settle(() => !!store.getState().currentScene);
    return store;
  }

  function torchCount(store: typeof useGameStore): number {
    return store.getState().player!.inventory
      .filter((i) => i.name === 'Aetheric Torch')
      .reduce((a, i) => a + i.quantity, 0);
  }

  it('a worthy no-lead room: charge SPENT, chips marked, line names them', async () => {
    const store = await boot();
    expect(torchCount(store)).toBeGreaterThan(0); // the starter torch
    const scene = store.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene, enemies: [], hooks: [],
        ambientNouns: ['faded schematic', 'silt bank'],
        displayedAmbientNouns: ['faded schematic', 'silt bank'],
      },
    });
    const before = torchCount(store);
    await store.getState().submitPlayerAction('use aetheric torch');
    await settle(() => (store.getState().currentScene?.arbiterEye ?? []).length > 0);
    expect(store.getState().currentScene?.arbiterEye).toEqual(['faded schematic']);
    expect(torchCount(store)).toBe(before - 1);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/✦ marked under INVESTIGATE/);
  });

  it('⚠ a room with NOTHING worthy keeps the charge — the OTA-212 rule holds', async () => {
    const store = await boot();
    const scene = store.getState().currentScene!;
    useGameStore.setState({
      currentScene: {
        ...scene, enemies: [], hooks: [],
        ambientNouns: ['silt bank', 'shore'],
        displayedAmbientNouns: ['silt bank', 'shore'],
      },
    });
    const before = torchCount(store);
    await store.getState().submitPlayerAction('use aetheric torch');
    const t0 = Date.now();
    while (Date.now() - t0 < 500) await new Promise((r) => setTimeout(r, 25));
    expect(torchCount(store)).toBe(before);
    expect(store.getState().currentScene?.arbiterEye ?? []).toEqual([]);
    const log = store.getState().gameLog.map((e) => e.text).join('\n');
    expect(log).toMatch(/keep the charge/i);
  });

  it('the AIMED charge (OTA-776 path) stamps the eye on the same spend', async () => {
    const store = await boot();
    const scene = store.getState().currentScene!;
    const lead: Hook = {
      id: 'eye_hook', kind: 'strange_smoke' as Hook['kind'],
      nouns: ['smoke'], plantedLine: '', stage: 0, resolved: false,
    };
    useGameStore.setState({
      currentScene: {
        ...scene, enemies: [], hooks: [lead],
        ambientNouns: ['column of smoke', 'silt bank'],
        displayedAmbientNouns: ['column of smoke', 'silt bank'],
      },
    });
    store.getState().applyTorchToHook('eye_hook');
    await settle(() => (store.getState().currentScene?.arbiterEye ?? []).length > 0);
    expect(store.getState().currentScene?.hooks[0]?.torchCharged).toBe(true);
    expect(store.getState().currentScene?.arbiterEye).toContain('column of smoke');
  });
});

describe('OTA-1206 — the mark actually renders', () => {
  // ⚠ Narrow source pin, silent-no-op class: a stamped scene.arbiterEye with no
  // renderer ships the whole feature dead behind green engine tests.
  it('SearchModal draws ✦ for marked chips; ExplorationScreen feeds the flag', () => {
    const modal = readFileSync(join(__dirname, '..', 'app', 'components', 'SearchModal.tsx'), 'utf8');
    // ⚠⚠ OTA-1236 — the RULE is unchanged and asserted in both halves; the exact
    // expression grew a second source. A ✦ now also marks a LEAD (a story hook or a
    // live dog-rescue noun), which is the same claim the torch's mark makes — "this
    // one is actually worth the look" — so it earns the same glyph. What must not
    // change: a marked chip draws it, and a CONSUMED chip never does (a spent noun's
    // mark is history, not signal).
    expect(modal).toContain('c.marked');
    expect(modal).toMatch(/c\.marked[^\n]*&& !c\.consumed \? '✦ ' : ''/);
    const screen = readFileSync(join(__dirname, '..', 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
    expect(screen).toContain('currentScene?.arbiterEye ?? []');
  });
});
