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
jest.mock('expo-av', () => ({
  Audio: { setAudioModeAsync: jest.fn(), Sound: class { static createAsync: any = jest.fn(async () => ({ sound: { playAsync: jest.fn(), unloadAsync: jest.fn() } })); } },
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '0', applicationId: 'test' }));
jest.mock('expo-asset', () => ({ Asset: { fromModule: () => ({ downloadAsync: jest.fn(async () => {}), localUri: '' }) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: {} } }));
jest.mock('expo-font', () => ({ loadAsync: jest.fn(async () => {}) }));
jest.mock('expo-speech-recognition', () => ({}));
jest.mock('expo-updates', () => ({}));

/**
 * OTA-1078 — WHAT'S ACTUALLY IN THEIR POCKETS.
 *
 * Owner: "stealing is for items, pickpocket is for what would be in their
 * clothing or on them. Maybe their TC, a collectable note, rarely a tower
 * map... a single legendary material — something they wouldn't trust on the
 * tabletop with all the thieves around."
 *
 * Engine half: the pocket table rolls the four owner-named payouts and
 * nothing else, and a fragment the player already owns falls through to
 * coin instead of duping. Store half: pickpocketPerson targets PEOPLE,
 * pays from the pocket table, and shares vendor theft's consequences —
 * including the caught-red-handed fight — through the same extracted
 * machinery, not a copy of it.
 */
jest.setTimeout(60_000);

import { rollPocketLoot, POCKET_WEIGHTS } from '../app/engine/pocketLoot';
import { ALL_FRAGMENTS } from '../app/engine/collectables';
import { MATERIALS, GEAR } from '../app/engine/crafting';
import { useGameStore } from '../app/state/gameStore';

beforeAll(() => { console.log = () => {}; console.warn = () => {}; console.error = () => {}; });

/** rng stub fed a fixed sequence; falls back to 0.5 when the sequence runs dry. */
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++] ?? 0.5;
};

describe('OTA-1078 — the pocket table (engine)', () => {
  it('the weights cover the whole die and name exactly the owner’s four payouts', () => {
    const total = POCKET_WEIGHTS.tc + POCKET_WEIGHTS.fragment + POCKET_WEIGHTS.material + POCKET_WEIGHTS.map;
    expect(total).toBeCloseTo(1);
    // Coin is the common lift; the map is the rare one — the owner's shape.
    expect(POCKET_WEIGHTS.tc).toBeGreaterThan(POCKET_WEIGHTS.fragment);
    expect(POCKET_WEIGHTS.map).toBeLessThan(POCKET_WEIGHTS.material);
  });

  it('coin: small walking-around money, never a strongbox', () => {
    const loot = rollPocketLoot({ ownedCollectables: [], rng: seq(0.0, 0.0) });
    expect(loot).toEqual({ kind: 'tc', amount: 3 });
    const high = rollPocketLoot({ ownedCollectables: [], rng: seq(0.0, 0.999) });
    expect(high.kind).toBe('tc');
    expect((high as { amount: number }).amount).toBeLessThanOrEqual(12);
  });

  it('fragment: a real un-owned collectable note', () => {
    const loot = rollPocketLoot({ ownedCollectables: [], rng: seq(0.6, 0.0) });
    expect(loot.kind).toBe('fragment');
    const id = (loot as { fragmentId: string }).fragmentId;
    expect(ALL_FRAGMENTS.some((f) => f.id === id)).toBe(true);
  });

  it('⚠ a note the player already owns falls through to coin — no dupes', () => {
    const all = ALL_FRAGMENTS.map((f) => f.id);
    const loot = rollPocketLoot({ ownedCollectables: all, rng: seq(0.6, 0.0) });
    expect(loot.kind).toBe('tc');
  });

  it('material: exactly one, and it is Legendary', () => {
    const loot = rollPocketLoot({ ownedCollectables: [], rng: seq(0.85, 0.0) });
    expect(loot.kind).toBe('material');
    const name = (loot as { name: string }).name;
    expect(MATERIALS.find((m) => m.name === name)?.rarity).toBe('Legendary');
  });

  it('map: rarely, a real tower map', () => {
    const loot = rollPocketLoot({ ownedCollectables: [], rng: seq(0.97, 0.0) });
    expect(loot.kind).toBe('map');
    const name = (loot as { name: string }).name;
    expect(name.startsWith('Skyreacher Map')).toBe(true);
    expect(GEAR.some((g) => g.name === name)).toBe(true);
  });
});

describe('OTA-1078 — pickpocketPerson (store)', () => {
  beforeAll(async () => {
    await useGameStore.getState().hydrate();
    await useGameStore.getState().startNewGame({ name: 'Fingers', raceId: 'reclaimer', factionId: 'reclaimers_guild' });
    useGameStore.getState().skipTutorial?.();
  });

  const scene = () => useGameStore.getState().currentScene!;
  const putVendor = () => {
    useGameStore.setState({
      currentScene: {
        ...scene(), enemies: [], enemyHps: [], wanderer: null,
        vendor: {
          id: 'roadside_991', name: 'Grit Maalen', faction: null, title: 'Road Hawker',
          demeanor: 'sketchy', offers: [{ itemName: 'Wild Onion', price: 3 }],
        } as never,
      },
    });
  };
  const setStealth = (v: number) => {
    const p = useGameStore.getState().player!;
    useGameStore.setState({
      player: { ...p, stats: { ...p.stats, stealth: v }, stealHeat: 0, stealHeatHours: p.hoursElapsed ?? 0 },
    });
  };
  const logText = () => useGameStore.getState().gameLog.map((e) => String(e.text)).join('\n');

  it('a sure hand lifts from the POCKET, never from the table', () => {
    putVendor();
    setStealth(30); // total ≥ 31 vs DC ≤ 16 — success regardless of the d20
    const before = useGameStore.getState().player!;
    const beforeTc = before.tc;
    const beforeInv = before.inventory.length;
    const beforeNotes = (before.collectables ?? []).length;
    useGameStore.getState().pickpocketPerson('Grit');
    const after = useGameStore.getState().player!;
    const gained =
      after.tc > beforeTc
      || after.inventory.length > beforeInv
      || (after.collectables ?? []).length > beforeNotes;
    expect(gained).toBe(true);
    // ⚠ The mark's table is untouched — the pocket is not the offer list.
    expect(useGameStore.getState().currentScene?.vendor?.offers).toHaveLength(1);
    // Anything physical that came out of the pocket is flagged stolen.
    for (const item of after.inventory.slice(beforeInv)) {
      expect(item.stolen).toBe(true);
    }
  });

  it('⚠ caught at a vendor’s pocket starts the SAME fight as caught at their table', () => {
    putVendor();
    setStealth(0); // d20 max 20... force the miss with a floored die
    const realRandom = Math.random;
    Math.random = () => 0.0; // d20 = 1; total ≤ 2 vs DC 11 — caught, STE 0 < quiet-fail 14
    try {
      useGameStore.getState().pickpocketPerson('Grit');
    } finally {
      Math.random = realRandom;
    }
    const s = useGameStore.getState().currentScene!;
    expect(s.vendor).toBeNull();
    expect(s.enemies.length).toBe(1);
    expect(logText()).toContain('catches your hand mid-lift');
  });

  it('a wanderer who catches you names it and leaves — no steel over a pocket', () => {
    useGameStore.setState({
      currentScene: {
        ...scene(), enemies: [], enemyHps: [], vendor: null, vendorInFight: null,
        wanderer: { id: 'wanderer:drifter:jex', name: 'Jex', faction: null, role: 'drifter' } as never,
      },
    });
    setStealth(0);
    const realRandom = Math.random;
    Math.random = () => 0.0;
    try {
      useGameStore.getState().pickpocketPerson('Jex');
    } finally {
      Math.random = realRandom;
    }
    expect(useGameStore.getState().currentScene?.wanderer).toBeNull();
    expect(useGameStore.getState().currentScene?.enemies ?? []).toHaveLength(0);
    expect(logText()).toContain('snatches your wrist');
  });

  it('no mark by that name — the sheet cannot reach a stranger, and neither can the store', () => {
    useGameStore.setState({
      currentScene: { ...scene(), enemies: [], enemyHps: [], vendor: null, wanderer: null },
    });
    useGameStore.getState().pickpocketPerson('Nobody Real');
    // ⚠ Whole log, not a slice — the world-channel 500ms debounce can merge
    // this line into the previous world card by mutation (HANDOFF #4).
    expect(logText()).toContain('close enough to touch');
  });
});
