// OTA-711 — three glitches a playtest log surfaced:
//
//  (1) INVESTIGATE flavor. The generic no-loot pool used handheld phrasing
//      ("you turn the {noun} in your hands", "you weigh the {noun}") on
//      fixed architecture, so `investigate stair` read "You turn the stair
//      in your hands." Fixed features now draw a posture-agnostic pool.
//
//  (2) AETHERKIN call to action. The aetherkin_mourner travel encounter
//      dares "reach for a coin and you will not reach it twice," but
//      reach/take/disturb/attack all dead-ended (unknown verb, or the noun
//      resolved to a relic in the pack). Provoking it now makes good on
//      the threat: the Aetherkin turns hostile + a corruption tick.
//
//  (3) NUDGE misfire. "disturb the aetherkin" suggested "Try: use flame of
//      aether" because resolveItem matched on the shared "aether" fragment.
//      The item suggestion now requires a whole-word overlap.

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
      static createAsync = jest.fn(async () => ({ sound: { playAsync: jest.fn(async () => {}), unloadAsync: jest.fn(async () => {}) } }));
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
import { resolveLore } from '../app/engine/investigationTable';
import { parseInput } from '../app/engine/parser';
import { pickWastelandEncounter } from '../app/engine/wastelandEncounters';

const HANDHELD = /in your hands|you weigh the|you let it go/i;

describe('OTA-711 — investigate flavor never treats architecture as handheld', () => {
  // These nouns fall through to the generic category (no dedicated keyword
  // template) AND classify as fixed features.
  const FIXED = ['stair', 'landing', 'anchor bolt', 'toolbench', 'ledge', 'scaffold', 'buttress', 'floor'];
  for (const noun of FIXED) {
    it(`\`${noun}\` gets posture-agnostic flavor (no "in your hands")`, () => {
      const line = resolveLore({ noun, category: 'generic', loreLine: null } as any);
      expect(line.length).toBeGreaterThan(10);
      expect(line).toMatch(new RegExp(noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      expect(line).not.toMatch(HANDHELD);
    });
  }

  it('a portable noun still resolves (handheld phrasing is allowed there)', () => {
    const line = resolveLore({ noun: 'ice axe', category: 'generic', loreLine: null } as any);
    expect(line).toMatch(/ice axe/i);
    expect(line.length).toBeGreaterThan(10);
  });
});

describe('OTA-711 — item-use nudge requires a whole-word overlap', () => {
  it('"disturb the aetherkin" does not suggest "use flame of aether"', () => {
    const parsed = parseInput('disturb the aetherkin', {
      inventory: [{ id: 'r1', name: 'Flame of Aether', kind: 'relic', quantity: 1, tags: [] }] as any,
    });
    const sugg = (parsed.suggestions ?? []).join(' | ').toLowerCase();
    expect(sugg).not.toMatch(/use flame of aether/);
  });

  it('a real word overlap still suggests the item ("the coin" → use worn tartarian coin)', () => {
    const parsed = parseInput('the coin', {
      inventory: [{ id: 'c1', name: 'Worn Tartarian Coin', kind: 'misc', quantity: 1, tags: [] }] as any,
    });
    const sugg = (parsed.suggestions ?? []).join(' | ').toLowerCase();
    expect(sugg).toMatch(/use worn tartarian coin/);
  });
});

describe('OTA-695 — provoke is data-driven (pulled from the encounter JSON)', () => {
  it('the aetherkin_mourner archetype resolves a provoke block with an enemy + nouns + line', () => {
    // forceArchetype bypasses the biome/roll gates and resolves the named
    // archetype straight from wasteland_encounters.json — proving the enemy
    // and prose come from CONTENT, not hardcoded engine strings.
    const enc = pickWastelandEncounter(
      { id: 'x', name: 'X', tags: ['buried'] } as any,
      { stepsSinceLastEncounter: 0, forceArchetype: 'aetherkin_mourner' },
    );
    expect(enc).toBeTruthy();
    expect(enc!.provoke).toBeTruthy();
    expect(enc!.provoke!.enemy).toBe('Aetherkin');
    expect(enc!.provoke!.nouns).toEqual(expect.arrayContaining(['coin', 'aetherkin', 'entombed']));
    expect(enc!.provoke!.line.length).toBeGreaterThan(20);
    expect((enc!.provoke!.corruption ?? 0)).toBeGreaterThan(0);
  });

  it('an archetype with no provoke block resolves provoke: null', () => {
    const enc = pickWastelandEncounter(
      { id: 'x', name: 'X', tags: ['ruin', 'outskirts', 'buried'] } as any,
      { stepsSinceLastEncounter: 0, forceArchetype: 'scrap_drone_swarm' },
    );
    // scrap_drone_swarm is a skirmish with no provoke.
    if (enc) expect(enc.provoke).toBeNull();
  });
});

describe('OTA-711 — Aetherkin makes good on the threat', () => {
  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  async function armedScene(name: string) {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name, raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, enemies: [], enemyHps: [] } });
    // Arm the temptation as the encounter would — the payload the
    // aetherkin_mourner archetype's `provoke` block resolves to.
    store.setState((s) => (s.player ? { player: { ...s.player, corruption: 0, pendingProvoke: {
      enemy: 'Aetherkin',
      corruption: 8,
      nouns: ['coin', 'coins', 'aetherkin', 'kin', 'entombed', 'silhouette', 'silhouettes', 'pocket', 'pockets', 'payment', 'dead'],
      line: 'Your fingers close on the cold coin pressed into the Aetherstone — and the Aetherkin turns. "Not twice," it says.',
      system_line: 'The debt of the Entombed settles on you.',
    } } } : s));
    return store;
  }

  for (const cmd of ['reach for the coin', 'take a coin', 'attack the aetherkin', 'disturb the entombed']) {
    it(`\`${cmd}\` spawns the hostile Aetherkin + a corruption tick`, async () => {
      const store = await armedScene(`Provoke_${cmd.replace(/\W+/g, '_')}`);
      const corr0 = store.getState().player!.corruption ?? 0;

      store.getState().submitPlayerAction(cmd);

      const scene = store.getState().currentScene!;
      expect(scene.enemies.some((e) => /aetherkin/i.test(e.name))).toBe(true);
      // enemyHps stays in lockstep with enemies.
      expect(scene.enemyHps.length).toBe(scene.enemies.length);
      // Corruption rose; the temptation is consumed.
      expect(store.getState().player!.corruption ?? 0).toBeGreaterThan(corr0);
      expect(store.getState().player!.pendingProvoke).toBeFalsy();
      const tail = store.getState().gameLog.slice(-5).map((e) => e.text).join('\n');
      expect(tail).toMatch(/Not twice|Aetherkin/i);
    });
  }

  it('does NOT provoke when the temptation is not armed (no false positive)', async () => {
    const store = useGameStore;
    await store.getState().hydrate();
    await store.getState().startNewGame({ name: 'NoArm', raceId: getRaces()[0]!.id, factionId: getFactions()[0]!.id });
    store.getState().skipTutorial?.();
    const scene = store.getState().currentScene!;
    store.setState({ currentScene: { ...scene, enemies: [], enemyHps: [] } });
    store.setState((s) => (s.player ? { player: { ...s.player, pendingProvoke: undefined } } : s));

    store.getState().submitPlayerAction('reach for the coin');
    const after = store.getState().currentScene!;
    expect(after.enemies.some((e) => /aetherkin/i.test(e.name))).toBe(false);
  });
});
