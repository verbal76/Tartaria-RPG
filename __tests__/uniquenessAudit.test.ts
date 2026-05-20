// Uniqueness audit — detect content pools that are too small / repeat
// too much during real play. Drives the engine's pure pickers and the
// gameStore's stepDirection narration over varied contexts and tallies
// distinct outputs.
//
// Pass criteria (per brief):
//   - Arbiter remarks ≥40% unique over 500 fires
//   - Cardinal travel ≥60% unique over 100 fires (16-variant pool)
//   - Wasteland: every archetype fires ≥1; every archetype's loot
//     covers ≥3 distinct items
//   - Container: every archetype's pool ≥2 distinct items in 100 rolls
//   - Location flavor: every location ≥50% unique over 20 fires

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
  documentDirectory: '/tmp/',
  cacheDirectory: '/tmp/',
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

// Mirror twoYearChaosSim's Qwen mock so isReady=true + deterministic
// JSON ('{"intent":"look","target":""}') flows through any code that
// touches the generative engine on the way to the deterministic
// templated path we're actually measuring.
jest.mock('../app/ai/generation/QwenGenerativeEngine', () => {
  class MockQwen {
    isReady() { return true; }
    getModelId() { return 'mock-qwen'; }
    getStatus() { return 'ready' as const; }
    async initialize(_opts: any) { /* no-op */ }
    async generate(_messages: any, _opts?: any) {
      return JSON.stringify({ intent: 'look', target: '' });
    }
  }
  return {
    QwenGenerativeEngine: MockQwen,
    DEFAULT_QWEN_MODEL_ID: 'mock-qwen',
  };
});

const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;

import { buildArbiterRemark, LOCATION_FLAVORS } from '../app/engine/narrativeGenerator';
import {
  pickWastelandEncounter,
  __TEST_ONLY__ as WASTE_TEST,
} from '../app/engine/wastelandEncounters';
import {
  classifyContainer,
  rollFromPool,
  __TEST_ONLY__ as LOOT_TEST,
} from '../app/engine/containerLoot';
import { resetRotationCursors } from '../app/engine/rng';
import { useGameStore } from '../app/state/gameStore';
import { getRaces, getFactions } from '../app/engine/character';
import type { Location, Hazard, Intent } from '../app/engine/types';

type Counter = Record<string, number>;
function bump(c: Counter, key: string, n = 1) {
  c[key] = (c[key] ?? 0) + n;
}
function topN(c: Counter, n: number): Array<[string, number]> {
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
function uniqueCount(c: Counter): number {
  return Object.keys(c).length;
}
function totalCount(c: Counter): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

// Synthetic Location factory for the Arbiter audit. We sweep across
// every authored location id so the location-flavor branch fires
// proportionally to its pool size.
function mkLocation(id: string, name: string, tags: string[] = []): Location {
  return {
    id,
    name,
    type: 'wilderness',
    description: `${name} description.`,
    danger: 1,
    tags,
    discoverable: true,
  };
}

function mkHazard(name: string): Hazard {
  return {
    id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    description: `${name} description.`,
    severity: 1,
    effect: 'minor',
    tags: ['env'],
  };
}

const MOODS = ['FEAR', 'CURIOSITY', 'AGGRESSION', 'CAUTIOUSNESS', 'RESOLVE', 'DESPAIR', undefined];
const INTENTS: (Intent | undefined)[] = [
  'attack', 'stealth', 'diplomacy', 'escape', 'investigate', 'rest',
  'travel', 'cast', 'use_relic', 'wait', undefined,
];
const HAZARDS = [
  null,
  mkHazard('Ether Storm'),
  mkHazard('Mudslide'),
  mkHazard('Resonance Bloom'),
];
const TARGET_NOUNS = [
  '', '', '', '', // bias toward no-target so flavor branch dominates
  'spire', 'statue', 'lockbox', 'figure', 'dagger', 'rune',
];
const RECENT_ACTIONS_POOL = [
  [],
  ['drew your blade'],
  ['stepped into the chamber'],
  ['knelt by the marker'],
  ['lit your lantern'],
];
const HOOK_SETS = [
  undefined,
  [{ kind: 'sighted', nouns: ['smoke'] }],
  [{ kind: 'tracks', nouns: ['footprints'] }],
  [{ kind: 'glimpse', nouns: ['silhouette'] }],
];

describe('Uniqueness Audit — Tartaria Realms content pools', () => {
  jest.setTimeout(300000);

  beforeAll(() => {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  afterAll(() => {
    console.log = _origLog;
    console.warn = _origWarn;
    console.error = _origErr;
  });

  // ----------------------------------------------------------------- 1
  it('Arbiter remarks — 500 fires across varied contexts ≥40% unique', () => {
    resetRotationCursors();
    const locIds = Object.keys(LOCATION_FLAVORS);
    const counter: Counter = {};
    const FIRES = 500;
    for (let i = 0; i < FIRES; i++) {
      const id = locIds[i % locIds.length]!;
      const loc = mkLocation(id, id.replace(/_/g, ' '), ['mud', 'open']);
      const hazard = HAZARDS[i % HAZARDS.length] ?? null;
      const mood = MOODS[i % MOODS.length];
      const intent = INTENTS[i % INTENTS.length];
      const target = TARGET_NOUNS[i % TARGET_NOUNS.length] || undefined;
      const recent = RECENT_ACTIONS_POOL[i % RECENT_ACTIONS_POOL.length];
      const hooks = HOOK_SETS[i % HOOK_SETS.length];
      const line = buildArbiterRemark({
        location: loc,
        hazard,
        enemy: null,
        intent,
        mood,
        recentActions: recent,
        unresolvedHooks: hooks as any,
        playerTargetNoun: target,
      });
      bump(counter, line);
    }
    const unique = uniqueCount(counter);
    const pct = unique / FIRES;
    const top5 = topN(counter, 5);

    _origLog(`\n[Arbiter remarks] fires=${FIRES} unique=${unique} (${(pct * 100).toFixed(1)}%)`);
    _origLog('  top 5 repeats:');
    for (const [line, n] of top5) {
      _origLog(`    ${n}x  ${line.slice(0, 110)}`);
    }
    expect(pct).toBeGreaterThanOrEqual(0.4);
  });

  // ----------------------------------------------------------------- 2
  it('Cardinal-travel narration — 100 steps ≥60% unique', async () => {
    resetRotationCursors();
    const store = useGameStore;
    await store.getState().hydrate();
    const races = getRaces();
    const factions = getFactions();
    const race = races.find((r) => r.id === 'reclaimer') ?? races[0]!;
    const fac = factions.find((f) => f.id === 'reclaimers_guild') ?? factions[0]!;
    await store.getState().startNewGame({
      name: 'Walker',
      raceId: race.id,
      factionId: fac.id,
    });
    store.getState().skipTutorial?.();

    // Remove any compass from inventory so the rotatingPick branch
    // (the 16-variant pool we're measuring) fires deterministically.
    const st = store.getState();
    if (st.player) {
      const purged = st.player.inventory.filter(
        (i) => !/compass/i.test(i.name),
      );
      store.setState({ player: { ...st.player, inventory: purged } });
    }

    // Capture appendLog calls — only the "You walk/push/head/strike out
    // <dir>." pattern. Stepping cardinal-only avoids landing on a new
    // location (which short-circuits with "You walk <dir>. You arrive
    // at ...") for the audit's main pool measurement.
    const captured: string[] = [];
    const origAppend = store.getState().appendLog;
    store.setState({
      appendLog: ((channel: string, msg: string) => {
        // Match the 16-variant cardinal pool only: "You <verb> <cardinal>. ..."
        // where <cardinal> is one of n/e/s/w spelled out. Excludes the
        // intro/travel boilerplate ("You set out on foot. ...") and the
        // "You arrive at ..." short-circuit.
        if (
          channel === 'world' &&
          /^You (walk|push|head|strike out|set out|move|press|step) (north|east|south|west)\b/i.test(msg) &&
          !/You arrive at/.test(msg)
        ) {
          captured.push(msg);
        }
        return origAppend(channel as any, msg);
      }) as any,
    });

    const dirs = ['north', 'east', 'south', 'west'] as const;
    let attempts = 0;
    while (captured.length < 100 && attempts < 400) {
      const dir = dirs[attempts % dirs.length];
      try {
        store.getState().stepDirection(dir as any);
      } catch {
        // ignore — defensive
      }
      attempts++;
    }
    // Restore appendLog
    store.setState({ appendLog: origAppend });

    const fires = Math.min(100, captured.length);
    const counter: Counter = {};
    for (let i = 0; i < fires; i++) bump(counter, captured[i]!);
    const unique = uniqueCount(counter);
    const pct = fires > 0 ? unique / fires : 0;
    const top5 = topN(counter, 5);

    _origLog(`\n[Cardinal travel] fires=${fires} unique=${unique} (${(pct * 100).toFixed(1)}%)`);
    _origLog('  top 5 repeats:');
    for (const [line, n] of top5) {
      _origLog(`    ${n}x  ${line.slice(0, 110)}`);
    }
    expect(fires).toBeGreaterThanOrEqual(20);
    expect(pct).toBeGreaterThanOrEqual(0.6);
  });

  // ----------------------------------------------------------------- 3
  it('Wasteland encounters — every archetype fires + ≥3 distinct loot items each', () => {
    const loc = mkLocation('synthetic_outskirts', 'Outskirts', ['mud', 'outskirts', 'open']);
    // Bumped from 1000 → 3000 fires. With 45 archetypes now sharing
    // this biome (post-batch-3 mini-dungeons), low-weight entries
    // (weight 2-3) need more samples before their ≥3 distinct loot
    // assertion lands consistently.
    const FIRES = 3000;
    const byArchetype: Counter = {};
    const lootByArch: Record<string, Counter> = {};
    const narrByArch: Record<string, Counter> = {};
    for (let i = 0; i < FIRES; i++) {
      const enc = pickWastelandEncounter(loc, {
        stepsSinceLastEncounter: 10,
        threshold: 2,
        rollChance: 1.0, // force fire so every step yields an encounter
      });
      if (!enc) continue;
      bump(byArchetype, enc.archetypeId);
      narrByArch[enc.archetypeId] ??= {};
      bump(narrByArch[enc.archetypeId]!, enc.narration);
      if (enc.loot) {
        lootByArch[enc.archetypeId] ??= {};
        bump(lootByArch[enc.archetypeId]!, enc.loot.name);
      }
    }

    _origLog(`\n[Wasteland] ${totalCount(byArchetype)} archetype fires across ${FIRES} rolls`);
    for (const [arch, n] of topN(byArchetype, 20)) {
      const lootEntries = lootByArch[arch] ? uniqueCount(lootByArch[arch]!) : 0;
      const narrEntries = narrByArch[arch] ? uniqueCount(narrByArch[arch]!) : 0;
      _origLog(`  ${arch}: fires=${n} distinctLoot=${lootEntries} distinctNarrations=${narrEntries}`);
    }

    // Every archetype that this biome should match must fire at least once.
    // Build expected set: archetypes whose matchers overlap with our tags.
    const ourTags = new Set(['mud', 'outskirts', 'open']);
    const expectedArchetypes = Object.entries(WASTE_TEST.ARCHETYPES)
      .filter(([, a]) => a.matchers.some((m) => ourTags.has(m.toLowerCase())))
      .map(([id]) => id);
    _origLog(`  expected archetypes for tags ${[...ourTags].join(',')}: ${expectedArchetypes.join(', ')}`);

    for (const id of expectedArchetypes) {
      expect(byArchetype[id] ?? 0).toBeGreaterThan(0);
    }
    // For archetypes with loot pools of ≥3 entries, demand ≥3 distinct
    // names were rolled.
    for (const id of expectedArchetypes) {
      const arch = WASTE_TEST.ARCHETYPES[id]!;
      if (arch.loot && arch.loot.length >= 3) {
        const distinct = lootByArch[id] ? uniqueCount(lootByArch[id]!) : 0;
        expect(distinct).toBeGreaterThanOrEqual(3);
      }
    }
  });

  // ----------------------------------------------------------------- 4
  it('Container loot — every archetype produces ≥2 distinct items in 100 rolls', () => {
    const allArch = Object.keys(LOOT_TEST.ARCHETYPES);
    const ROLLS = 100;
    const distinctByArch: Record<string, number> = {};
    const distByArch: Record<string, Counter> = {};
    for (const id of allArch) {
      // pick a matcher to classify with — use the first matcher
      const matchers = LOOT_TEST.ARCHETYPES[id]!.matchers;
      const sample = matchers[0]!;
      const match = classifyContainer(sample);
      expect(match).not.toBeNull();
      const counter: Counter = {};
      for (let i = 0; i < ROLLS; i++) {
        const roll = rollFromPool(match!.pool);
        if (roll) bump(counter, roll.entry.name);
      }
      distinctByArch[id] = uniqueCount(counter);
      distByArch[id] = counter;
    }
    _origLog(`\n[Container loot] ${allArch.length} archetypes, ${ROLLS} rolls each`);
    for (const id of allArch) {
      const top = topN(distByArch[id]!, 3)
        .map(([n, c]) => `${n}×${c}`)
        .join(', ');
      _origLog(`  ${id}: distinct=${distinctByArch[id]}  top: ${top}`);
    }
    for (const id of allArch) {
      const poolSize = LOOT_TEST.ARCHETYPES[id]!.pool.length;
      if (poolSize >= 2) {
        expect(distinctByArch[id]).toBeGreaterThanOrEqual(2);
      }
    }
  });

  // ----------------------------------------------------------------- 5
  it('Location flavor — every authored location ≥50% unique over 20 fires', () => {
    const locIds = Object.keys(LOCATION_FLAVORS);
    const flagged: Array<{ id: string; unique: number; pct: number }> = [];
    const allStats: Array<{ id: string; unique: number; pct: number; pool: number }> = [];
    for (const id of locIds) {
      resetRotationCursors();
      const loc = mkLocation(id, id.replace(/_/g, ' '));
      const counter: Counter = {};
      const FIRES = 20;
      for (let i = 0; i < FIRES; i++) {
        const line = buildArbiterRemark({
          location: loc,
          hazard: null,
          enemy: null,
          // No mood / hooks / target / recent actions → falls through to
          // the location-flavor branch deterministically.
        });
        bump(counter, line);
      }
      const u = uniqueCount(counter);
      const pct = u / FIRES;
      const pool = LOCATION_FLAVORS[id]!.length;
      allStats.push({ id, unique: u, pct, pool });
      if (pct < 0.5) flagged.push({ id, unique: u, pct });
    }
    _origLog(`\n[Location flavor] ${locIds.length} locations audited (20 fires each)`);
    for (const s of allStats.sort((a, b) => a.pct - b.pct)) {
      _origLog(`  ${s.id}: unique=${s.unique} (${(s.pct * 100).toFixed(0)}%)  poolSize=${s.pool}`);
    }
    if (flagged.length > 0) {
      _origLog('  FLAGGED (<50% unique):');
      for (const f of flagged) {
        _origLog(`    ${f.id}: ${f.unique}/20 (${(f.pct * 100).toFixed(0)}%)`);
      }
    }
    expect(flagged).toEqual([]);
  });
});
