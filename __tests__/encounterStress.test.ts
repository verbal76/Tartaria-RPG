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
import { openingRange } from '../app/state/combatResolution';
import type { Location, InventoryItem } from '../app/engine/types';

/** OTA-1832 — THE WALK OWNS ITS OWN DICE.
 *
 * ⚠⚠⚠ WHAT THIS REPLACED, AND WHY IT HAD TO. Test 3 below used to fall through
 * to the AMBIENT seeded stream (jest.setup.js) once its forced prefix ran out.
 * That stream's POSITION when the walk starts is the total number of draws taken
 * before it — and test 3 `require`s app/state/gameStore.ts inside its own body,
 * which draws ~265,000 times, >99.98% of them from the `source-map` package's
 * randomized quicksort. OTA-1831 measured that count and proved it is a function
 * of the loaded modules' SOURCE-MAP SHAPE. So the walk began wherever the byte
 * layout of the product tree happened to put it.
 *
 * ⚠⚠ THAT MADE THIS SUITE A LOTTERY, AND THE RATE WAS MEASURED, NOT GUESSED.
 * At 199353ee, twenty behaviour-free variants (n dead statements inserted at one
 * spot in gameStore.ts, n=1..20) were run against this file. EIGHT OF TWENTY
 * FAILED — 40%. The twelve that passed each drew a different enemy at a
 * different try count, because every mapping-emitting edit reshuffles the whole
 * stream. The sharpest control: adding ONE LINE OF DEAD CODE — a branch that
 * cannot execute, guarded on a field that did not exist on that tree — turned
 * this suite red. The failure never named the edit that moved it.
 *
 * ⚠ SO THE WALK NO LONGER BORROWS. Same mulberry32 jest.setup.js uses, seeded
 * here, owned here, advanced only by this test. No import cost, no sibling suite
 * and no future edit to any product file can move it. This does NOT weaken the
 * test: it still drives real code with a full non-repeating pseudo-random
 * sequence — exactly jest.setup.js's own rationale — and it now drives the SAME
 * one on every tree, which is the entire point of having a seed.
 *
 * ⚠ OTA-1831 CANNOT COVER THIS ON ITS OWN, and that is not a defect in it. Its
 * per-test re-seed fixes the stream's STARTING position; a heavy `require`
 * INSIDE a test body then walks it forward again by a layout-derived amount
 * before the first assertion. Any test that lazily imports the store is exposed
 * the same way. */
function makeWalkRandom(seed: number): () => number {
  let s = seed >>> 0;
  return function walkRandom() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    // OTA-1832 — the walk's own stream. See makeWalkRandom above for what this
    // replaced (the ambient seeded stream) and what that cost: a measured 40%
    // of behaviour-free edits to gameStore.ts turned this suite red.
    const walkRandom = makeWalkRandom(0x776b);
    // Sequence pattern per stepDirection call (best-effort — the
    // function makes several rng calls for narration / wander before
    // pickWastelandEncounter). We use a low (force-trigger) → high
    // (force-skirmish-pick) → med (enemy-pool index) cycle and fall
    // through to the walk's own stream for anything past.
    //
    // ⚠ `seq` is DELIBERATELY NOT RESET between steps: the forced cycle seeds
    // the FIRST step only, and every try after it runs on walkRandom, so the
    // 200-try window explores varied wander / pick / placement paths instead of
    // replaying one scripted step 200 times. The old comment here called that
    // fall-through "real entropy" — it never was. It was jest.setup.js's seeded
    // PRNG, shared with every other draw in the process. There is no entropy in
    // this loop and there must not be: a blocking gate that rolls real dice is a
    // gate that goes red on somebody else's commit.
    let seq = 0;
    Math.random = jest.fn(() => {
      const cycle = [0.1, 0.95, 0.2, 0.05, 0.9, 0.4];
      const v = cycle[seq % cycle.length]!;
      seq++;
      if (seq > 8) return walkRandom();
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
        // The deterministic prefix seeds the first attempt; from there the
        // walk's OWN seeded stream (the mock falls through to walkRandom past
        // seq=8) drives variation across the 200-try window so the larger
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
          // OTA-1832 — the scene's legacy `range` word must agree with WHERE
          // THE BODIES ACTUALLY STAND. This used to be a hard-coded 'close',
          // which was never a true claim: openingRange (OTA-550, re-banded by
          // OTA-1506) reads the leader's band off the randomized stagger, and a
          // lone body deliberately opens at 'mid'. Seven of the eight failures
          // in the OTA-1832 sweep were this assertion, not the spawn. Reading
          // the authority instead of a literal is STRICTER, not looser: it now
          // fails if any spawn site ever writes a word that disagrees with the
          // placement it just made — the exact drift OTA-1506 had to chase.
          expect(sc.range).toBe(openingRange(sc.enemies));
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
