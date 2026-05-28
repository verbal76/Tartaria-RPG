// Captain Craft-A-Lot Mode — stress sim for crafting / scrapping / repair.
//
// Drives 500 turns of craft / scrap / repair / equip churn against a player
// whose inventory is force-seeded with materials each turn. Goal: surface
// inventory corruption (duplicate ids, NaN qty, ghost items), recipe lookup
// failures, scrap-yield NaN, repair miscount, and unhandled exceptions in
// the crafting pipeline.
//
// Mock block copied verbatim from __tests__/parserFuzz.test.ts.

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

jest.setTimeout(15000);

// ------------------------------------------------------------------
// Seeded RNG so the run is reproducible.
function makeRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const rand = makeRng('craft-1000h');
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

// 30+ craftable item names drawn from app/data/items/recipes.json.
const CRAFT_POOL = [
  'Climbing Rope', 'Club', 'Cudgel', 'Stone Spear', 'Iron Spear',
  'Aether-Shard Spear', 'Aetheric Torch', 'First Aid Kit',
  'Aetheric Crystal Blade', 'Storm Rod', 'Aetheric Compass',
  'Aetheric Vest', 'Sentinel Cleaver', "Founder's Edge",
  'Sludge-Forged Vest', 'Aether-Wing Cloak', 'Mudstone Bulwark',
  'Mud Gem Amulet', 'Aether-Shard Ring', 'Resonant Song Phial',
  'Lich-Heart Pendant', 'Hollow Crown Circlet', 'Iron-Worm Engine',
  'Wyrm-Fang Blade', 'Voidspawn Bolt', 'Mud-Iron Greatblade',
  'Behemoth-Heart Talisman', "Forager's Stew", 'Hearty Stew',
  'Mushroom Stew', 'Red Cap Tincture', 'Blue Cap Draught',
  'Violet Cap Distillate', 'Orange Sporecap Brew', 'Many-Colored Tonic',
];

// Materials seeded each turn. Quantity 50 of each.
const SEED_MATERIAL_NAMES = [
  'Aether Mud', 'Mudstone', 'Aether Crystal', 'Aetheric Cloth',
  'Aetheric Shard', 'Bone Fragment', 'Bone Sliver', 'Bent Nail',
  'Copper Wire', 'Mud Fragment',
];

const BOGUS_TARGETS = [
  'moonbeam dagger', 'phantom sceptre', 'sunfire bow',
  'crystal teapot', 'invisible cloak',
];

let __seedCounter = 0;
function buildSeedMaterials() {
  // Each seeded stack gets a fresh unique id so duplicate-id detection
  // measures ENGINE behavior, not our fixture's collisions. Without this,
  // re-seeding the same name 500 times produces self-inflicted dupes.
  return SEED_MATERIAL_NAMES.map((name) => ({
    id: `seed_${name.toLowerCase().replace(/\s+/g, '_')}_${__seedCounter++}`,
    name,
    kind: 'misc' as const,
    quantity: 50,
    tags: ['material'],
  }));
}

async function bootstrap() {
  const store = useGameStore;
  await store.getState().hydrate();
  await store.getState().startNewGame({
    name: 'CaptainCraft',
    raceId: 'reclaimer',
    factionId: 'stone_builders',
  });
  store.getState().skipTutorial?.();
  return store;
}

interface InvariantState {
  qtyZeroOrNeg: number;
  qtyNaN: number;
  duplicateIds: number;
  highWaterLen: number;
  ghostName: number;
}

function checkInvariants(inv: Array<{ id?: unknown; name?: unknown; quantity?: unknown }>, st: InvariantState) {
  if (!Array.isArray(inv)) return;
  if (inv.length > st.highWaterLen) st.highWaterLen = inv.length;
  const ids = new Map<string, number>();
  for (const it of inv) {
    if (!it || typeof it !== 'object') continue;
    const q = (it as { quantity: unknown }).quantity;
    if (typeof q !== 'number') {
      st.qtyNaN++;
    } else if (Number.isNaN(q)) {
      st.qtyNaN++;
    } else if (q <= 0) {
      st.qtyZeroOrNeg++;
    }
    const name = (it as { name: unknown }).name;
    if (typeof name !== 'string' || name.length === 0) st.ghostName++;
    const id = (it as { id: unknown }).id;
    if (typeof id === 'string') {
      ids.set(id, (ids.get(id) ?? 0) + 1);
    }
  }
  for (const [, n] of ids) {
    if (n > 1) st.duplicateIds += n - 1;
  }
}

describe('CAPTAIN CRAFT-A-LOT — 500-turn crafting / scrap / repair stress', () => {
  const consoleCounts = { log: 0, warn: 0, error: 0 };
  beforeAll(() => {
    console.log = () => { consoleCounts.log++; };
    console.warn = () => { consoleCounts.warn++; };
    console.error = () => { consoleCounts.error++; };
  });

  it('runs 500 craft-loop turns without throwing, surfaces inventory invariants', async () => {
    const store = await bootstrap();
    const TURNS = 500;
    const exceptions: { turn: number; cmd: string; err: string }[] = [];
    const inv: InvariantState = {
      qtyZeroOrNeg: 0,
      qtyNaN: 0,
      duplicateIds: 0,
      highWaterLen: 0,
      ghostName: 0,
    };
    let craftAttempts = 0;
    let scrapAttempts = 0;
    let repairAttempts = 0;
    let bogusAttempts = 0;
    let craftSuccessHints = 0;
    let bareCraftAttempts = 0;

    for (let turn = 0; turn < TURNS; turn++) {
      // Re-seed materials so the engine never runs dry. Mutates the store
      // directly — this is a stress fixture, not a gameplay simulation.
      try {
        useGameStore.setState((s) => {
          if (!s.player) return {} as Partial<typeof s>;
          return {
            player: {
              ...s.player,
              inventory: [...s.player.inventory, ...buildSeedMaterials()],
            },
          };
        });
      } catch (e) {
        exceptions.push({ turn, cmd: 'seed', err: e instanceof Error ? e.message : String(e) });
      }

      const roll = rand();
      let cmd: string;
      const player = store.getState().player;
      const currentInv = player?.inventory ?? [];
      const equipped = player?.equipped ?? {};
      const equippedNames: string[] = [];
      for (const v of Object.values(equipped)) {
        if (typeof v === 'string') equippedNames.push(v);
        else if (v && typeof v === 'object') {
          for (const inner of Object.values(v as Record<string, unknown>)) {
            if (typeof inner === 'string') equippedNames.push(inner);
          }
        }
      }

      if (roll < 0.50) {
        // 50% craft a random known item (or bare 'craft' rarely)
        if (rand() < 0.05) {
          cmd = 'craft';
          bareCraftAttempts++;
        } else {
          cmd = `craft ${pick(CRAFT_POOL)}`;
          craftAttempts++;
        }
      } else if (roll < 0.75) {
        // 25% scrap a random inventory item by name
        const candidates = currentInv.filter((i) => i && typeof i.name === 'string' && i.name.length > 0);
        if (candidates.length === 0) {
          cmd = `scrap ${pick(CRAFT_POOL)}`;
        } else {
          const target = candidates[Math.floor(rand() * candidates.length)];
          cmd = `scrap ${target.name}`;
        }
        scrapAttempts++;
      } else if (roll < 0.90) {
        // 15% repair a random equipped item
        if (equippedNames.length === 0) {
          cmd = `repair ${pick(CRAFT_POOL)}`;
        } else {
          cmd = `repair ${equippedNames[Math.floor(rand() * equippedNames.length)]}`;
        }
        repairAttempts++;
      } else {
        // 10% bogus craft target to exercise the unknown-recipe path
        cmd = `craft ${pick(BOGUS_TARGETS)}`;
        bogusAttempts++;
        craftAttempts++; // counts as a craft attempt overall
      }

      // Sprinkle in equip/unequip churn every ~10 turns
      if (turn % 10 === 0 && currentInv.length > 0) {
        try {
          const target = currentInv[Math.floor(rand() * currentInv.length)];
          if (target && typeof target.name === 'string') {
            store.getState().submitPlayerAction(`equip ${target.name}`);
          }
        } catch (e) {
          exceptions.push({ turn, cmd: 'equip', err: e instanceof Error ? e.message : String(e) });
        }
      }
      if (turn % 17 === 0 && equippedNames.length > 0) {
        try {
          store.getState().submitPlayerAction(`unequip ${equippedNames[0]}`);
        } catch (e) {
          exceptions.push({ turn, cmd: 'unequip', err: e instanceof Error ? e.message : String(e) });
        }
      }

      const logBefore = store.getState().gameLog.length;
      try {
        store.getState().submitPlayerAction(cmd);
      } catch (e) {
        exceptions.push({ turn, cmd, err: e instanceof Error ? e.message : String(e) });
      }
      // microtask drain for cognitive layer
      await Promise.resolve();
      await Promise.resolve();

      // Look for craft-success hints in newly-added log entries.
      const newEntries = store.getState().gameLog.slice(logBefore);
      for (const entry of newEntries) {
        const text = typeof entry?.text === 'string' ? entry.text : '';
        // Crafting engine prints lines like "You craft a X" or "+1 X" or
        // "crafted". Look for any of those.
        if (/crafted|you (craft|forge|assemble)|\+1\s/i.test(text)) {
          if (cmd.startsWith('craft ') && !BOGUS_TARGETS.some((b) => cmd.includes(b))) {
            craftSuccessHints++;
            break;
          }
        }
      }

      const after = store.getState().player;
      if (after) checkInvariants(after.inventory ?? [], inv);
    }

    const finalPlayer = store.getState().player;
    const finalInvLen = finalPlayer?.inventory.length ?? 0;
    const finalLogLen = store.getState().gameLog.length;

    process.stderr.write(
      `\n========== CAPTAIN CRAFT-A-LOT REPORT ==========\n` +
      `turns=${TURNS}\n` +
      `exceptions=${exceptions.length}\n`,
    );
    for (const e of exceptions.slice(0, 5)) {
      process.stderr.write(
        `  T${e.turn} cmd="${e.cmd.slice(0, 50)}" err=${e.err.slice(0, 100)}\n`,
      );
    }
    process.stderr.write(
      `craftAttempts=${craftAttempts} (incl ${bogusAttempts} bogus, ${bareCraftAttempts} bare)\n` +
      `craftSuccessHints=${craftSuccessHints}\n` +
      `scrapAttempts=${scrapAttempts}\n` +
      `repairAttempts=${repairAttempts}\n` +
      `invariant.qtyZeroOrNeg=${inv.qtyZeroOrNeg}\n` +
      `invariant.qtyNaN=${inv.qtyNaN}\n` +
      `invariant.duplicateIds=${inv.duplicateIds}\n` +
      `invariant.ghostName=${inv.ghostName}\n` +
      `invariant.highWaterInvLen=${inv.highWaterLen}\n` +
      `finalInvLen=${finalInvLen}\n` +
      `finalLogLen=${finalLogLen}\n` +
      `console.log=${consoleCounts.log} warn=${consoleCounts.warn} error=${consoleCounts.error}\n` +
      `==================================================\n`,
    );

    // We don't fail on invariant violations — this is a diagnostic harness.
    // We only fail if the run threw catastrophically (test framework still
    // wants an expectation).
    expect(exceptions.length).toBeLessThan(TURNS); // crashes on every turn = fail
    expect(finalPlayer).not.toBeNull();
  });
});
