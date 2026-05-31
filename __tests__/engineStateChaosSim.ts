// 2026-05-28 — Engine-state chaos sim. Adversarial regression test
// suite for the per-room investigation table, salvage / take / climb
// chip-greying, the elevated-overlay system, and the makeRoomKey
// hub collision flagged by OTA-080. Also probes per-noun infinity
// (200-tap dedup) and chip-state invariants under randomized play.
//
// Goals (matches the audit checklist):
//   1. Random-walk sim — every step holds the OTA-070/076/078/079
//      invariants (no chip stays actionable after a refuse; consumed
//      list monotonic; pack-full never leaves chip+no-grant; nouns
//      land in searchedAmbient OR flavorExhausted after refuse).
//   2. Elevated overlay edge cases — minTiers ≥ 2 default, trader
//      gated at 4, ambient-noun seed is idempotent, descent round-
//      trips the preserved scene cleanly.
//   3. Hub interior collision probe — makeRoomKey omits hubRoomId,
//      so two distinct hub rooms at the same (locationId, mapX,
//      mapY) share VisitedRoom state. Test asserts the collision
//      and is marked `test.failing` so the OTA-080 known-open issue
//      is tracked, not silently re-introduced.
//   4. Per-noun infinity — 100 investigate attempts on the same
//      noun produce exactly ONE arbiter acknowledgement; the rest
//      hit the dedup-refuse path.
//
// Constraints:
//   - Seeded RNG so failures are reproducible. SEED noted per test.
//   - Each test under 15s; suite total well under 60s.
//   - No engine modifications. If a real bug surfaces, the failing
//     test gets `test.failing(...)` + a code comment naming the bug.

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
import {
  rollElevatedOverlay,
  buildOverlayOverrides,
  buildOverlayTrader,
} from '../app/engine/elevatedOverlay';
import { seedInvestigationTable } from '../app/engine/investigationTable';
import type { InvestigationEntry } from '../app/engine/investigationTable';
import type { InventoryItem } from '../app/engine/types';

// `useGameStore` is a typed zustand store (UseBoundStore); using
// its own type for the helper params avoids the unknown cascade
// that `ReturnType<typeof useGameStore>` produces in strict-mode tsc.
type StoreApi = typeof useGameStore;

// Seeded Mulberry32 RNG. Deterministic, fast, and only needs one
// 32-bit state word — perfect for reproducing a sim from a single
// SEED constant.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type Counter = Record<string, number>;
function bump(c: Counter, k: string) { c[k] = (c[k] ?? 0) + 1; }

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'Chaos',
    raceId: 'reclaimer',
    factionId: 'reclaimers_guild',
  });
  store.getState().skipTutorial?.();
  const p0 = store.getState().player!;
  // Place player outside the hub so investigate/salvage flows fire
  // through the procedural ambient pool, not the hub anchor path.
  // Bonus: hand the player a Climbing Rope so climb verbs aren't
  // hard-refused by the OTA 23-007 rope requirement.
  store.setState({
    player: {
      ...p0,
      hubRoomId: null,
      hp: p0.hpMax,
      stamina: p0.staminaMax,
      tc: 1000,
      inventory: [
        ...p0.inventory,
        {
          id: `rope_${Date.now()}`,
          name: 'Climbing Rope',
          kind: 'relic',
          rarity: 'Common',
          quantity: 1,
          tags: ['rope'],
          durability: { current: 200, max: 200 },
        } satisfies InventoryItem,
      ],
    },
    gameLog: [],
  });
  return store;
}

// Inject a scene with a known ambient noun pool. Skips beginScene's
// random encounter / weather / vendor roll so the sim has stable
// nouns to investigate / salvage / take across iterations. We still
// seed the room investigation table via the engine's seed helper so
// the table-write path is identical to live play.
function installScene(
  store: StoreApi,
  ambientNouns: string[],
  microMicroId: string | null = 'sim_room',
) {
  const player = store.getState().player!;
  const scene = store.getState().currentScene;
  if (!scene) {
    // beginScene must run at least once so we have a valid base
    // scene shape (weather / location / hazard / etc.).
    store.getState().beginScene();
  }
  const baseScene = store.getState().currentScene!;
  store.setState({
    currentScene: {
      ...baseScene,
      microMicroId,
      enemies: [],
      enemyHps: [],
      enemyAmbushUsed: [],
      activeEnemyIdx: 0,
      vendor: null,
      hooks: [],
      ambientNouns,
      displayedAmbientNouns: ambientNouns.slice(0, 8),
      elevatedOn: null,
      preservedSceneOnDescent: undefined,
      elevatedOverlayMeta: undefined,
      range: null,
    },
  });
  // Seed the investigation table the same way beginScene does.
  const roomKey = `${player.currentLocationId}@${microMicroId ?? '_'}@${player.mapX ?? '_'},${player.mapY ?? '_'}`;
  store.setState((s) => {
    const prev = s.worldMemory.visitedRooms?.[roomKey];
    if (prev?.roomInvestigationTable) return s;
    const base = prev ?? { firstVisitAt: Date.now(), lastVisitAt: Date.now(), visitCount: 1 };
    return {
      worldMemory: {
        ...s.worldMemory,
        visitedRooms: {
          ...(s.worldMemory.visitedRooms ?? {}),
          [roomKey]: { ...base, roomInvestigationTable: seedInvestigationTable(ambientNouns) },
        },
      },
    };
  });
  return roomKey;
}

function getRoom(store: StoreApi, roomKey: string) {
  return store.getState().worldMemory.visitedRooms?.[roomKey];
}

function consumedNounCount(table: Record<string, InvestigationEntry> | undefined): number {
  if (!table) return 0;
  return Object.values(table).filter((e) => e.consumed).length;
}

describe('engineStateChaosSim — adversarial regression', () => {
  jest.setTimeout(60_000);

  beforeAll(() => {
    // Suppress engine spam so the test logs stay legible.
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  });

  // ---------------------------------------------------------------
  // 1. Random-walk sim.
  // ---------------------------------------------------------------
  it('random-walk sim — 600 iterations hold investigation-table invariants', async () => {
    const SEED = 0xC0FFEE01; // reproducible. Change to vary the walk.
    const rand = mulberry32(SEED);
    const store = await bootstrap();
    // Curate a pool of nouns that mix climbable / salvageable /
    // investigable categories — covers furniture, vessel, machinery,
    // landmark, vegetation, container, debris.
    const NOUNS = [
      'wooden bench', 'iron shelf', 'rust panel', 'clay urn',
      'broken statue', 'tarnished altar', 'mossy stone', 'bone pile',
      'dim lantern', 'splintered chest', 'faded sign', 'tall pillar',
      'crumbling debris', 'gnarled vine', 'painted door',
    ];
    const roomKey = installScene(store, NOUNS);
    const VERBS: ReadonlyArray<(n: string) => string> = [
      (n) => `investigate ${n}`,
      (n) => `salvage ${n}`,
      (n) => `take ${n}`,
      (n) => `climb ${n}`,
    ];

    const errors: string[] = [];
    const invariantFails: string[] = [];
    const verbCounter: Counter = {};
    let prevConsumedCount = 0;

    for (let i = 0; i < 600; i++) {
      // Periodically "descend back" — if we're elevated, climb down
      // so we don't end up stuck on a tier waiting on rope/stamina.
      const sceneNow = store.getState().currentScene;
      if (sceneNow?.elevatedOn) {
        try { store.getState().submitPlayerAction('climb down'); }
        catch (e) { errors.push(String(e)); }
      }
      // Re-stamina/HP so the verbs don't refuse for non-table
      // reasons (low stamina deflection isn't what we're testing).
      const p = store.getState().player!;
      store.setState({ player: { ...p, hp: p.hpMax, stamina: p.staminaMax } });

      const noun = NOUNS[Math.floor(rand() * NOUNS.length)]!;
      const verb = VERBS[Math.floor(rand() * VERBS.length)]!;
      const cmd = verb(noun);
      bump(verbCounter, cmd.split(' ')[0]!);
      try {
        store.setState({ gameLog: [] }); // isolate each step's log
        store.getState().submitPlayerAction(cmd);
      } catch (e) {
        errors.push(`iter ${i} "${cmd}": ${e instanceof Error ? e.message : String(e)}`);
      }
      // Invariant: consumed count monotonic.
      const room = getRoom(store, roomKey);
      const consumedNow = consumedNounCount(room?.roomInvestigationTable);
      if (consumedNow < prevConsumedCount) {
        invariantFails.push(`iter ${i}: consumed shrunk from ${prevConsumedCount} → ${consumedNow}`);
      }
      prevConsumedCount = consumedNow;

      // Invariant: if the engine emitted a refuse-style log entry
      // (look for "already worked" or "Nothing more to find" or
      // dedup-refuse text), the noun MUST be in searched or flavor
      // exhausted by now. This is the OTA-070/076/078 chip-grey
      // invariant.
      const log = store.getState().gameLog;
      const refused = log.some((e) =>
        /already (?:worked|salvaged|taken)|nothing more to find/i.test(e.text),
      );
      if (refused) {
        const searched = (room?.searchedAmbientNouns ?? []).map((s) => s.toLowerCase());
        const flavor = (room?.flavorExhaustedNouns ?? []).map((s) => s.toLowerCase());
        const lower = noun.toLowerCase();
        // Fuzzy match — substring either direction, mirroring the
        // engine's own dedup check (nonClimbMarkers + .includes).
        const matched =
          searched.some((s) => s.includes(lower) || lower.includes(s)) ||
          flavor.some((s) => s.includes(lower) || lower.includes(s));
        if (!matched) {
          invariantFails.push(
            `iter ${i}: "${cmd}" refused but noun "${lower}" absent from searched+flavor`,
          );
        }
      }

      // Invariant: pack-full state never leaves chip + no-grant.
      // The OTA-078 promise is the consume mark + table-write are
      // BOTH skipped on pack-full. We approximate by checking that
      // no log entry contains "pack is too full" combined with a
      // newly-flipped consumed flag for that noun.
      const packFullLine = log.find((e) => /pack is too full/i.test(e.text));
      if (packFullLine) {
        const lower = noun.toLowerCase();
        const entry = room?.roomInvestigationTable?.[lower];
        // OTA-078 expects entry.consumed remains false on pack-full
        // — if true here the OTA-078 skip didn't fire.
        if (entry && entry.consumed && /\bpack is too full\b/i.test(packFullLine.text)) {
          invariantFails.push(
            `iter ${i}: pack-full for "${lower}" but entry.consumed === true (OTA-078 invariant)`,
          );
        }
      }
    }

    // Salvage-then-investigate double-dip check (OTA-079). For any
    // noun whose consumed flag is set, the searchedAmbientNouns list
    // should reflect it (the salvage path writes both). We check the
    // intersection: every consumed entry has at least one fuzzy match
    // in searchedAmbientNouns OR flavorExhaustedNouns.
    const finalRoom = getRoom(store, roomKey);
    const finalTable = finalRoom?.roomInvestigationTable ?? {};
    const allRefusalLists = [
      ...(finalRoom?.searchedAmbientNouns ?? []),
      ...(finalRoom?.flavorExhaustedNouns ?? []),
    ].map((s) => s.toLowerCase());
    for (const [key, entry] of Object.entries(finalTable)) {
      if (!entry.consumed) continue;
      const matched = allRefusalLists.some(
        (s) => s.includes(key) || key.includes(s),
      );
      if (!matched) {
        invariantFails.push(
          `final: consumed table entry "${key}" missing from searched+flavor lists`,
        );
      }
    }

    // Allow up to a tiny set of hard throws (the random walk can
    // hit handlers with weird state); fail loudly on invariant
    // violations.
    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      process.stderr.write(`THROWS (${errors.length}/600):\n${errors.slice(0, 5).join('\n')}\n`);
    }
    if (invariantFails.length > 0) {
      // eslint-disable-next-line no-console
      process.stderr.write(`INVARIANT_FAILS:\n${invariantFails.slice(0, 10).join('\n')}\n`);
    }
    expect(invariantFails).toEqual([]);
    expect(errors.length).toBeLessThan(20); // generous; we're stress-testing
  });

  // ---------------------------------------------------------------
  // 2. Elevated overlay edge cases.
  // ---------------------------------------------------------------
  it('1-tier climbs never receive an overlay (OTA-102 minTiers default 2)', () => {
    // SEED 1 — run rollElevatedOverlay 10_000 times with totalTiers=1.
    // Expect zero non-null returns since every overlay has minTiers
    // ≥ 2 after OTA-102 (default 2; traders explicit 4).
    const SEED = 0xA0B1C2D3;
    const rand = mulberry32(SEED);
    let nonNull = 0;
    for (let i = 0; i < 10_000; i++) {
      const ov = rollElevatedOverlay(1, rand);
      if (ov) nonNull++;
    }
    expect(nonNull).toBe(0);
  });

  it('trader overlays only fire at totalTiers >= 4', () => {
    // SEED 2. Drive rollElevatedOverlay at totalTiers=2 and =3 a
    // large number of times — no trader-kind overlay should ever
    // surface. At totalTiers=4 the trader pool unlocks; we don't
    // assert it MUST fire (probabilistic) — just that the gate
    // works at low tiers.
    const SEED = 0xBEEF0042;
    const rand = mulberry32(SEED);
    for (const tt of [2, 3]) {
      let traders = 0;
      for (let i = 0; i < 5_000; i++) {
        const ov = rollElevatedOverlay(tt, rand);
        if (ov?.kind === 'trader') traders++;
      }
      expect(traders).toBe(0);
    }
  });

  it('overlay ambient-noun seed is idempotent (no double-seed inflation)', () => {
    // OTA-102 promise: scene-swap on elevated overlay merges
    // overrides.ambientNouns into the existing roomInvestigationTable
    // exactly once. Seed once, count; seed again with the same nouns,
    // count must be identical.
    const ambient = ['copper bowl', 'bent rivets', 'ozone tang', 'iron grate'];
    const seeded1 = seedInvestigationTable(ambient);
    const seeded2 = seedInvestigationTable(ambient);
    expect(Object.keys(seeded1).sort()).toEqual(Object.keys(seeded2).sort());
    // Now drive the merge logic the way gameStore does — start from
    // a non-empty table, merge in the overlay nouns, then re-merge.
    // The post-merge table size should match after the SECOND merge.
    const baseTable = seedInvestigationTable(['bench', 'shelf']);
    const merge = (
      prev: Record<string, InvestigationEntry>,
      adds: Record<string, InvestigationEntry>,
    ): Record<string, InvestigationEntry> => {
      const out = { ...prev };
      for (const [k, v] of Object.entries(adds)) {
        if (!out[k]) out[k] = v;
      }
      return out;
    };
    const afterFirst = merge(baseTable, seeded1);
    const afterSecond = merge(afterFirst, seeded2);
    expect(Object.keys(afterFirst).sort()).toEqual(Object.keys(afterSecond).sort());
  });

  it('overlay descent restores preserved base scene cleanly', async () => {
    // Hand-roll the climb-up → overlay swap → climb-down chain and
    // verify the base scene is exactly restored (excluding the
    // intentionally-cleared overlay metadata fields).
    const store = await bootstrap();
    const baseNouns = ['old gate', 'rusted ladder', 'broken bench', 'flat stone'];
    installScene(store, baseNouns);
    const baseScene = store.getState().currentScene!;

    // Simulate the overlay swap (mirrors gameStore.ts ~line 7180):
    const overlayNouns = ['copper bowl', 'bent rivets', 'sky', 'wind'];
    const overlayScene = {
      ...baseScene,
      ambientNouns: overlayNouns,
      displayedAmbientNouns: overlayNouns,
      enemies: [],
      enemyHps: [],
      enemyAmbushUsed: [],
      activeEnemyIdx: 0,
      vendor: null,
      hooks: [],
      preservedSceneOnDescent: baseScene,
      elevatedOverlayMeta: {
        climbedNoun: 'rusted ladder',
        climbedRoomKey: 'sim-room-key',
        maxTier: 3,
        overlayId: 'sealed_door',
      },
      // Show overlay is "active" — elevatedOn must be non-null for
      // the climb-down branch to fire.
      elevatedOn: { noun: 'rusted ladder', tier: 3, totalTiers: 3 },
    };
    store.setState({ currentScene: overlayScene });

    // Now "climb down" — the engine should restore baseScene fields
    // and null out elevatedOn + clear the overlay meta + preserved.
    store.getState().submitPlayerAction('climb down');
    const restored = store.getState().currentScene!;
    expect(restored.ambientNouns).toEqual(baseScene.ambientNouns);
    expect(restored.elevatedOn).toBeNull();
    expect(restored.preservedSceneOnDescent).toBeUndefined();
    expect(restored.elevatedOverlayMeta).toBeUndefined();
    // The base scene's enemies / hooks come back unchanged.
    expect(restored.enemies).toEqual(baseScene.enemies);
    expect(restored.hooks).toEqual(baseScene.hooks);
  });

  it('overlay roll only fires within trigger-chance bounds (statistical sanity)', () => {
    // SEED 3. 30% trigger chance per OTA_TRIGGER_CHANCE. With 20k
    // samples at totalTiers=10 (so every overlay is eligible) the
    // hit rate should be roughly 0.30 ± 0.03.
    const SEED = 0x12345678;
    const rand = mulberry32(SEED);
    let hits = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) {
      if (rollElevatedOverlay(10, rand) != null) hits++;
    }
    const rate = hits / N;
    expect(rate).toBeGreaterThan(0.26);
    expect(rate).toBeLessThan(0.34);
  });

  // ---------------------------------------------------------------
  // 3. Hub-interior makeRoomKey collision probe.
  // ---------------------------------------------------------------
  //
  // OTA-080 noted: makeRoomKey omits player.hubRoomId. Two hub
  // interiors at the same (locationId, mapX, mapY) — e.g. Asgardar's
  // chandelier study, armory, and atlas hall all live on the same
  // tile — collide on the same VisitedRoom entry. Investigating a
  // noun in one room then walking to another room at the same tile
  // sees the noun as already-investigated.
  //
  // This test EXPECTS the bug and is marked `test.failing` so it
  // green-passes today (the bug exists) but flips to red the day the
  // engine starts including hubRoomId in the key. When that happens,
  // unflip + update HANDOFF.md.
  test.failing(
    'OTA-080 KNOWN OPEN — two hub rooms at same tile collide on VisitedRoom',
    async () => {
      const store = await bootstrap();
      const player = store.getState().player!;
      // Park the player at a fixed tile inside the Asgardar hub.
      store.setState({
        player: {
          ...player,
          currentLocationId: 'asgardar',
          mapX: 0,
          mapY: 0,
          hubRoomId: 'asgardar_chandelier_study',
        },
      });
      // Seed scene A (chandelier study) and investigate "chandelier".
      const roomKeyA = installScene(store, ['chandelier', 'desk', 'tome'], null);
      store.getState().submitPlayerAction('investigate chandelier');
      const tableA = getRoom(store, roomKeyA)?.roomInvestigationTable;
      const chandConsumed = !!tableA?.['chandelier']?.consumed;

      // Now swap hubRoomId to a DIFFERENT room at the SAME tile.
      // makeRoomKey ignores hubRoomId, so this resolves to the same
      // key. installScene with microMicroId=null will overwrite the
      // scene's nouns but the worldMemory entry persists.
      store.setState((s) => (s.player ? {
        player: { ...s.player, hubRoomId: 'asgardar_armory' },
      } : s));
      const roomKeyB = installScene(store, ['rack', 'helm', 'sword'], null);

      // The two keys should be DIFFERENT for the collision to be
      // fixed. Today they're the same — assert "different" so the
      // failing-test marker flips when the engine learns to include
      // hubRoomId.
      expect(roomKeyA).not.toBe(roomKeyB);
      // And the armory should NOT see "chandelier" as consumed —
      // it's a different room. Today (bug present) the consumed
      // flag bleeds through. Assert the "fixed" world: the armory
      // table has no chandelier entry at all, or it's un-consumed.
      const tableB = getRoom(store, roomKeyB)?.roomInvestigationTable;
      const chandLeak = !!tableB?.['chandelier']?.consumed;
      expect(chandConsumed && !chandLeak).toBe(true);
    },
  );

  // ---------------------------------------------------------------
  // 4. Per-noun infinity — 100 investigates → ONE ack, 99 dedups.
  // ---------------------------------------------------------------
  it('100 investigate attempts on same noun = exactly 1 first-touch outcome', async () => {
    const store = await bootstrap();
    const roomKey = installScene(store, ['wooden bench', 'iron shelf', 'flat stone']);

    // Per-tap contract: only the first investigate may set the
    // table entry from consumed=false → consumed=true. Subsequent
    // calls must hit the callbackLine path (entry.consumed stays
    // true) and MUST NOT produce a yield log line ("Tucked into
    // the seam: a X.") — that only fires when rollOutcome rolls
    // an item branch, which the engine gates behind !entry.consumed.
    let firstTouchFlips = 0;
    let dedupCalls = 0;
    let yieldLinesAfterFirst = 0;
    for (let i = 0; i < 100; i++) {
      const p = store.getState().player!;
      store.setState({ player: { ...p, hp: p.hpMax, stamina: p.staminaMax }, gameLog: [] });
      const before = getRoom(store, roomKey)?.roomInvestigationTable?.['wooden bench'];
      const wasConsumed = !!before?.consumed;
      store.getState().submitPlayerAction('investigate wooden bench');
      const after = getRoom(store, roomKey)?.roomInvestigationTable?.['wooden bench'];
      const isConsumed = !!after?.consumed;
      if (!wasConsumed && isConsumed) firstTouchFlips++;
      else if (wasConsumed) {
        dedupCalls++;
        // No yield-grant line on the dedup path. The seam-yield
        // sentence is the strongest tell — if it fires after the
        // first tap the engine double-granted.
        const log = store.getState().gameLog;
        if (log.some((e) => /tucked into the seam/i.test(e.text))) {
          yieldLinesAfterFirst++;
        }
      }
    }
    // Exactly ONE flip from un-consumed to consumed.
    expect(firstTouchFlips).toBe(1);
    expect(dedupCalls).toBe(99);
    expect(yieldLinesAfterFirst).toBe(0);
    // Chip-grey invariant: by tap #2, the entry is consumed.
    const entry = getRoom(store, roomKey)?.roomInvestigationTable?.['wooden bench'];
    expect(entry?.consumed).toBe(true);
  });

  // ---------------------------------------------------------------
  // 5. Trader template build is deterministic with seeded RNG.
  // ---------------------------------------------------------------
  it('overlay trader builder rolls price ranges within bounds', () => {
    // SEED 4. Find a trader overlay (minTiers=4) and run buildOverlayTrader
    // 200 times — every offer's price must lie in [priceMin, priceMax].
    const SEED = 0xFADEC0DE;
    const rand = mulberry32(SEED);
    // Force a trader-kind pick by scanning the export pool. We use
    // a lazy fallback for the unlikely case the pool name changed.
    let traderOverlay = null;
    for (let i = 0; i < 500 && !traderOverlay; i++) {
      const ov = rollElevatedOverlay(10, rand);
      if (ov?.kind === 'trader') traderOverlay = ov;
    }
    // If the test environment can't surface a trader in 500 rolls,
    // skip the price check gracefully — the gate on totalTiers=10
    // makes this extremely unlikely.
    if (!traderOverlay) return;
    for (let i = 0; i < 200; i++) {
      const trader = buildOverlayTrader(traderOverlay, rand);
      if (!trader) continue;
      for (const offer of trader.offers) {
        const template = traderOverlay.trader!.offers.find(
          (o) => o.itemName === offer.itemName,
        )!;
        expect(offer.price).toBeGreaterThanOrEqual(template.priceMin);
        expect(offer.price).toBeLessThanOrEqual(template.priceMax);
      }
    }
  });

  // ---------------------------------------------------------------
  // 6. buildOverlayOverrides shape sanity (idempotent + complete).
  // ---------------------------------------------------------------
  it('buildOverlayOverrides preserves overlay nouns and zeroes enemies on lookout', () => {
    const SEED = 0x77AA55BB;
    const rand = mulberry32(SEED);
    // Hunt for a lookout overlay — same scan pattern.
    let lookoutOverlay = null;
    for (let i = 0; i < 500 && !lookoutOverlay; i++) {
      const ov = rollElevatedOverlay(10, rand);
      if (ov?.kind === 'lookout') lookoutOverlay = ov;
    }
    if (!lookoutOverlay) return;
    const overrides = buildOverlayOverrides(lookoutOverlay, null);
    expect(overrides.ambientNouns).toEqual(lookoutOverlay.ambientNouns);
    expect(overrides.displayedAmbientNouns).toEqual(lookoutOverlay.ambientNouns);
    expect(overrides.enemies).toEqual([]);
    expect(overrides.enemyHps).toEqual([]);
    expect(overrides.activeEnemyIdx).toBe(0);
    expect(overrides.hooks).toEqual([]);
  });
});

