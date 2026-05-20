// encounterStress — exercises the wasteland-encounter + container-loot
// systems at scale. Verifies:
//   1. every wasteland archetype in wasteland_encounters.json is
//      reachable through pickWastelandEncounter when a matching
//      location-tag is provided.
//   2. every enemy name in every skirmish enemyPool resolves to a
//      real Enemy via findEnemyByName (catches typo drift between
//      wasteland_encounters.json and enemies.json).
//   3. driving the live gameStore.stepDirection with a forced rng
//      actually spawns a skirmish enemy into the scene with combat
//      state (range, enemyHps, activeEnemyIdx).
//   4. every container archetype is reachable through classifyContainer
//      using its declared matchers.
//   5. every loot entry in every container pool fires at least once
//      in 200 rolls.
//   6. narrate() substitutes the player's {target} word into the
//      narration template for every container archetype.
//   7. grantItem accepts wasteland encounter loot drops without
//      cap-overflow crashes across 100 encounters.

// Mocks copied from yearSimulation.test.ts — gameStore pulls in a
// thicket of native modules (storage, audio, ML runtimes) that don't
// load under Jest.

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

import {
  pickWastelandEncounter,
  __TEST_ONLY__ as WASTE_TO,
  type WastelandArchetype,
} from '../app/engine/wastelandEncounters';
import {
  classifyContainer,
  rollFromPool,
  narrate,
  __TEST_ONLY__ as CONT_TO,
  type ContainerArchetype,
} from '../app/engine/containerLoot';
import { findEnemyByName } from '../app/engine/encounter';
import { grantItem } from '../app/engine/inventory';
import type { Location, InventoryItem } from '../app/engine/types';

const WASTE_ARCHETYPES = WASTE_TO.ARCHETYPES as Record<string, WastelandArchetype>;
const CONT_ARCHETYPES = CONT_TO.ARCHETYPES as Record<string, ContainerArchetype>;

function makeLocation(tags: string[]): Location {
  return {
    id: 'test_loc',
    name: 'Test Locus',
    type: 'wilderness',
    description: 'a synthetic test location',
    danger: 1,
    tags,
    discoverable: true,
  };
}

describe('encounterStress — wasteland + container systems', () => {
  it('1. every wasteland archetype is reachable across 2000 synthetic encounters', () => {
    // Collect every distinct matcher tag across all archetypes — these
    // are the only tags that can ever trigger anything.
    const allTags = new Set<string>();
    for (const a of Object.values(WASTE_ARCHETYPES)) {
      for (const t of a.matchers) allTags.add(t.toLowerCase());
    }
    const tagList = [...allTags];

    const tally: Record<string, number> = {};
    const N = 2000;
    let nonNull = 0;
    for (let i = 0; i < N; i++) {
      // Round-robin across single-tag locations so each matcher gets
      // even airtime. Multi-tag locations are also covered every 5th
      // iteration via the union-tag location.
      const tag = tagList[i % tagList.length]!;
      const loc = i % 5 === 0
        ? makeLocation(tagList)
        : makeLocation([tag]);
      // stepsSinceLastEncounter=10 + chance=1.0 ⇒ guaranteed to roll.
      const enc = pickWastelandEncounter(loc, {
        stepsSinceLastEncounter: 10,
        threshold: 2,
        rollChance: 1,
      });
      if (enc) {
        nonNull++;
        tally[enc.archetypeId] = (tally[enc.archetypeId] ?? 0) + 1;
      }
    }

    const expectedIds = Object.keys(WASTE_ARCHETYPES);
    const unreached = expectedIds.filter((id) => !tally[id]);

    // eslint-disable-next-line no-console
    console.log(
      '[stress] wasteland archetype distribution (N=' + N + ', non-null=' + nonNull + '):\n' +
        expectedIds
          .map((id) => `  ${id}: ${tally[id] ?? 0}`)
          .join('\n') +
        (unreached.length > 0 ? `\n  UNREACHED: ${unreached.join(', ')}` : '\n  UNREACHED: (none)'),
    );

    expect(nonNull).toBeGreaterThan(0);
    expect(unreached).toEqual([]);
  });

  it('2. every enemy name in every skirmish enemyPool resolves via findEnemyByName', () => {
    const missing: Array<{ archetypeId: string; name: string }> = [];
    let checked = 0;
    for (const [id, archetype] of Object.entries(WASTE_ARCHETYPES)) {
      if (archetype.type !== 'skirmish') continue;
      const pool = archetype.enemyPool ?? [];
      for (const name of pool) {
        checked++;
        const e = findEnemyByName(name);
        if (!e) missing.push({ archetypeId: id, name });
        else {
          expect(e.name.toLowerCase()).toBe(name.toLowerCase());
          expect(typeof e.hp).toBe('number');
          expect(e.hp).toBeGreaterThan(0);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[stress] skirmish enemy lookup: ${checked} names checked, ${missing.length} missing.` +
        (missing.length > 0
          ? '\n  Missing: ' + missing.map((m) => `${m.archetypeId}/${m.name}`).join(', ')
          : ''),
    );
    expect(missing).toEqual([]);
  });

  it('3. stepDirection spawns a skirmish enemy into currentScene with combat state', async () => {
    // We bias Math.random *high* (≥ 0.7) so the weighted-pick inside
    // pickWastelandEncounter lands on the heaviest archetype in the
    // pool. Under "borderlands" tags the eligible set is {
    // abandoned_caravan (w=12), wandering_drifter (w=14), skirmish_pack
    // (w=35) } — weighted total 61, with skirmish_pack covering rolls
    // ∈ [26, 61) ≈ 57% of mass. A high rng value lands there reliably.
    // We rotate through a few high values to also vary the enemyPool
    // pick and force-trigger the encounter (rng() < 0.55 = rollChance).
    const origRandom = Math.random;
    const realRandom = Math.random.bind(Math);
    // Sequence pattern per stepDirection call (best-effort — the
    // function makes several rng calls for narration / wander before
    // pickWastelandEncounter). We use a low (force-trigger) → high
    // (force-skirmish-pick) → med (enemy-pool index) cycle and fall
    // through to realRandom for anything past.
    let seq = 0;
    Math.random = jest.fn(() => {
      const cycle = [0.1, 0.95, 0.2, 0.05, 0.9, 0.4];
      const v = cycle[seq % cycle.length]!;
      seq++;
      // Mix in some real entropy past index 8 so wander / world-map
      // helpers don't lock onto the same tile every step.
      if (seq > 8) return realRandom();
      return v;
    }) as any;

    try {
      const { useGameStore } = require('../app/state/gameStore');
      const { getRaces, getFactions } = require('../app/engine/character');
      const store = useGameStore;

      await store.getState().hydrate();
      const races = getRaces();
      const factions = getFactions();
      const race = races.find((r: any) => r.id === 'reclaimer') ?? races[0];
      const fac = factions.find((f: any) => f.id === 'reclaimers_guild') ?? factions[0];

      await store.getState().startNewGame({
        name: 'StressTester',
        raceId: race.id,
        factionId: fac.id,
      });
      store.getState().skipTutorial?.();

      // Clear hub state + force scene tags to "borderlands" so the
      // wasteland matcher pool contains skirmish_pack.
      const initialScene = store.getState().currentScene;
      if (initialScene) {
        store.setState({
          player: { ...store.getState().player, hubRoomId: null, mapX: 4, mapY: 4 },
          currentScene: {
            ...initialScene,
            location: { ...initialScene.location, tags: ['borderlands'] },
            enemies: [],
            enemyHps: [],
            activeEnemyIdx: 0,
            range: null,
          },
          wastelandStepsSinceEncounter: 10,
        });
      }

      expect(store.getState().currentScene?.enemies.length ?? 0).toBe(0);

      let spawned = false;
      let lastEnemyName: string | null = null;
      let triesUsed = 0;
      for (let i = 0; i < 200 && !spawned; i++) {
        triesUsed = i + 1;
        // The deterministic prefix seeds the first attempt; from there
        // real entropy (mock falls through to realRandom past seq=8)
        // drives variation across the 200-try window so the larger
        // archetype pool from the mini-dungeon batch still produces
        // at least one skirmish / bandit spawn within the budget.
        const liveScene = store.getState().currentScene;
        if (liveScene) {
          // Re-pin the scene tags before each step in case stepDirection
          // landed on a new macro location and re-keyed location tags.
          store.setState({
            currentScene: {
              ...liveScene,
              location: { ...liveScene.location, tags: ['borderlands'] },
            },
            wastelandStepsSinceEncounter: 10,
          });
        }
        try {
          store.getState().stepDirection('north');
        } catch {
          // ignore — we just want a skirmish to land in 200 tries
        }
        const sc = store.getState().currentScene;
        if (sc && sc.enemies.length > 0) {
          spawned = true;
          lastEnemyName = sc.enemies[0]?.name ?? null;
          expect(sc.range).toBe('close');
          expect(sc.enemyHps.length).toBe(sc.enemies.length);
          expect(sc.activeEnemyIdx).toBeGreaterThanOrEqual(0);
          expect(sc.enemyHps[sc.activeEnemyIdx] ?? 0).toBeGreaterThan(0);
        }
      }
      // eslint-disable-next-line no-console
      console.log(`[stress] skirmish in-engine spawn: spawned=${spawned}, enemy=${lastEnemyName ?? '(none)'}, triesUsed=${triesUsed}`);
      expect(spawned).toBe(true);
    } finally {
      Math.random = origRandom;
    }
  });

  it('4. every container archetype is reachable via its matchers', () => {
    const unreached: string[] = [];
    for (const [id, archetype] of Object.entries(CONT_ARCHETYPES)) {
      let anyMatched = false;
      const failedMatchers: string[] = [];
      for (const m of archetype.matchers) {
        const result = classifyContainer(m);
        if (result?.archetypeId === id) {
          anyMatched = true;
        } else {
          failedMatchers.push(`"${m}" → ${result?.archetypeId ?? 'null'}`);
        }
      }
      if (!anyMatched) {
        unreached.push(`${id} [${failedMatchers.join(' | ')}]`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[stress] container reachability: ${Object.keys(CONT_ARCHETYPES).length} archetypes, ${unreached.length} unreachable.` +
        (unreached.length > 0 ? '\n  Unreachable: ' + unreached.join(' / ') : ''),
    );
    expect(unreached).toEqual([]);
  });

  it('5. every item in every container pool fires at least once across 200 rolls', () => {
    const ROLLS = 200;
    const report: Array<{ id: string; counts: Record<string, number>; missing: string[] }> = [];
    let totalMissing = 0;
    for (const [id, archetype] of Object.entries(CONT_ARCHETYPES)) {
      const counts: Record<string, number> = {};
      for (const e of archetype.pool) counts[e.name] = 0;
      for (let i = 0; i < ROLLS; i++) {
        const rolled = rollFromPool(archetype.pool);
        if (rolled) counts[rolled.entry.name] = (counts[rolled.entry.name] ?? 0) + 1;
      }
      const missing = Object.entries(counts)
        .filter(([, v]) => v === 0)
        .map(([k]) => k);
      report.push({ id, counts, missing });
      totalMissing += missing.length;
    }
    // eslint-disable-next-line no-console
    console.log(
      '[stress] container loot distribution (rolls=' + ROLLS + '):\n' +
        report
          .map(
            (r) =>
              `  ${r.id}: ` +
              Object.entries(r.counts)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ') +
              (r.missing.length > 0 ? `  ⚠ MISSING: ${r.missing.join(', ')}` : ''),
          )
          .join('\n'),
    );
    expect(totalMissing).toBe(0);
  });

  it('6. narrate() substitutes {target} into every container narration template', () => {
    const failures: string[] = [];
    for (const [id, archetype] of Object.entries(CONT_ARCHETYPES)) {
      // Build a ContainerLootMatch shape that narrate() accepts.
      const match = { archetypeId: id, narration: archetype.narration, pool: archetype.pool };
      const out = narrate(match, 'test_thing');
      if (!out.includes('test_thing')) {
        // Only flag templates that DECLARE {target} but failed.
        if (archetype.narration.includes('{target}')) {
          failures.push(`${id}: "${archetype.narration}" → "${out}"`);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[stress] container narration substitution: ${Object.keys(CONT_ARCHETYPES).length} templates checked, ${failures.length} failed.` +
        (failures.length > 0 ? '\n  ' + failures.join('\n  ') : ''),
    );
    expect(failures).toEqual([]);
  });

  it('7. grantItem accepts 100 encounter loot drops without cap-overflow crashes', () => {
    // Drive 100 encounters with rollChance=1 across rotating biomes;
    // every loot drop must round-trip through grantItem cleanly.
    const tagList: string[] = [];
    for (const a of Object.values(WASTE_ARCHETYPES)) {
      for (const t of a.matchers) if (!tagList.includes(t)) tagList.push(t);
    }
    let inventory: InventoryItem[] = [];
    let loots = 0;
    let accepted = 0;
    let dropped = 0;
    const errors: string[] = [];
    for (let i = 0; i < 100; i++) {
      const enc = pickWastelandEncounter(makeLocation([tagList[i % tagList.length]!]), {
        stepsSinceLastEncounter: 10,
        threshold: 2,
        rollChance: 1,
      });
      if (!enc || !enc.loot) continue;
      loots++;
      try {
        const result = grantItem(inventory, {
          id: `${enc.loot.name}_${i}`,
          name: enc.loot.name,
          kind: enc.loot.kind,
          quantity: enc.loot.quantity,
          tags: enc.loot.tags,
        });
        inventory = result.inventory;
        accepted += result.accepted;
        dropped += result.dropped;
        // Sanity invariants — accepted+dropped must equal the drop's
        // declared quantity (no items are silently lost or duplicated).
        expect(result.accepted + result.dropped).toBe(enc.loot.quantity);
        expect(result.accepted).toBeGreaterThanOrEqual(0);
        expect(result.dropped).toBeGreaterThanOrEqual(0);
      } catch (e: any) {
        errors.push(`iter=${i} loot=${enc.loot.name}: ${e?.message ?? e}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[stress] encounter loot grant: loots=${loots}, accepted=${accepted}, cap-overflow-dropped=${dropped}, errors=${errors.length}, finalInvSize=${inventory.length}` +
        (errors.length > 0 ? '\n  ' + errors.slice(0, 5).join('\n  ') : ''),
    );
    expect(errors).toEqual([]);
    expect(loots).toBeGreaterThan(0);
  });
});
