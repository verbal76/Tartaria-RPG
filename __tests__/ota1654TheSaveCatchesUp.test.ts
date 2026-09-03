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

// OTA-1654 — THE SAVE CATCHES UP TO THE CATALOG.
//
// Owner: *"And for all of the items that I already had on, or in my inventory
// like those rings, fix the effect on them in my save file and bump their rarity
// level."*
//
// The measurement that shaped this OTA is the first block below, and it says the
// EFFECTS were never the stale part: an accessory's powers — and every ladder
// magnitude behind them — resolve from the CATALOG ROW by name on every read, so
// a ring stamped Common in a save from before OTA-1653 was already warding acid
// and already shaving 15% off the player's gear wear. What was stale was the
// rarity written on the instance, and the readers OTA-999 never converted were
// still reading it: the inventory row's word and colour, the RARITY sort, and —
// the expensive one — the Crucible's output grade.

import {
  resealCatalogRarity,
  restampInventoryItem,
  healSavedItem,
} from '../app/engine/itemBackfill';
import { resealUtilityDurability, stampDurability } from '../app/engine/durability';
import { canonicalItemRarity, findRingByName } from '../app/engine/crafting';
import { equippedAccessoryPowers, wearWardPct, WEAR_WARD_PCT } from '../app/engine/accessoryEffects';
import { fusionOutputRarity } from '../app/engine/itemFusion';
import { backfillPlayer } from '../app/state/gameStore';
import { placedAt } from '../test-utils/placePlayer';
import type { InventoryItem, PlayerCharacter } from '../app/engine/types';

const RING = 'Tin Ward Ring';

/** An instance as it sits in a save written BEFORE OTA-1653 promoted the row:
 *  minted Common, 25 durability, no idea the catalog moved under it. */
function staleRing(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'inv_tinward_1',
    name: RING,
    kind: 'relic',
    rarity: 'Common',
    quantity: 1,
    tags: ['ring', 'crafted', 'defensive'],
    durability: { current: 25, max: 25 },
    ...over,
  } as unknown as InventoryItem;
}

/** The save as it sits on his device: the ring on a finger, stamped Common. */
function savedWearingTheRing(): PlayerCharacter {
  return {
    name: 'Tester', raceId: 'tartarian_giants', hp: 20, hpMax: 20, stamina: 10, staminaMax: 10,
    stats: { strength: 5, dexterity: 5, intelligence: 5, wisdom: 5, charisma: 5, stealth: 1 },
    // OTA-1484 — placedAt keeps the authoritative cell and the visual frame in
    // agreement; a bare currentLocationId is a state no real path produces.
    ...placedAt('tartarian_outskirts'),
    inventory: [staleRing()],
    equipped: { ring: RING, ringId: 'inv_tinward_1' },
  } as unknown as PlayerCharacter;
}

describe('OTA-1654 — the effects were already live (the measurement)', () => {
  it('the catalog row is Rare and carries the ward, whatever a save says', () => {
    const row = findRingByName(RING);
    expect(row).toBeTruthy();
    expect(row!.rarity).toBe('Rare');
    expect((row!.resistances ?? []).map(String)).toContain('acid');
    expect((row as { wearWard?: boolean }).wearWard).toBe(true);
  });

  it('⚠ a COMMON-STAMPED instance still gets the RARE ward — powers never read the stamp', () => {
    // This is the whole reason "fix the effect on them" needed no effect migration.
    // The equipped slot holds a NAME; the powers come from the row that name
    // resolves to. Wearing the stale copy is indistinguishable from wearing a
    // freshly-minted one.
    const player = {
      inventory: [staleRing()],
      equipped: { ring: RING, ringId: 'inv_tinward_1' },
    } as unknown as PlayerCharacter;

    const powers = equippedAccessoryPowers(player);
    expect(powers.resistances).toContain('acid');
    expect(powers.wearWardPct).toBe(WEAR_WARD_PCT.Rare);
    expect(wearWardPct(player)).toBe(WEAR_WARD_PCT.Rare);
    // And the ladder value it got is the RARE one, not the Common one it was
    // stamped with — proving the magnitude is indexed by the row, not the copy.
    expect(WEAR_WARD_PCT.Rare).toBeGreaterThan(WEAR_WARD_PCT.Common);
  });
});

describe('OTA-1654 — resealCatalogRarity writes down what the economy already reads', () => {
  it('regrades a stale Common instance to the catalog Rare', () => {
    const before = staleRing();
    expect(before.rarity).toBe('Common');
    // ⚠ The economy was ALREADY charging Rare for this exact object — that
    // disagreement between the till and the sheet is the defect.
    expect(canonicalItemRarity(before)).toBe('Rare');
    expect(resealCatalogRarity(before).rarity).toBe('Rare');
  });

  it('invents no second rule — it persists canonicalItemRarity, item for item', () => {
    const cases: InventoryItem[] = [
      staleRing(),
      staleRing({ id: 'x2', rarity: 'Legendary' }),      // stamped too HIGH: heals down
      staleRing({ id: 'x3', name: 'zz-not-a-real-item' }), // uncatalogued: keeps its own
    ];
    for (const c of cases) {
      expect(resealCatalogRarity(c).rarity).toBe(canonicalItemRarity(c));
    }
  });

  it('is idempotent — a healed item is returned by reference on the next load', () => {
    const once = resealCatalogRarity(staleRing());
    expect(resealCatalogRarity(once)).toBe(once);
  });

  it('leaves a FUSED piece alone — its rarity was decided at the forge', () => {
    // A fused ARMOR may share a name with a catalog row; regrading off that
    // collision is the same class of bug restampInventoryItem guards against.
    const fusedByTag = staleRing({ id: 'f1', tags: ['ring', 'fused'] });
    expect(resealCatalogRarity(fusedByTag)).toBe(fusedByTag);
    const fusedByStats = staleRing({
      id: 'f2',
      uniqueStats: { kind: 'armor', rarity: 'Uncommon' },
    } as Partial<InventoryItem>);
    expect(resealCatalogRarity(fusedByStats)).toBe(fusedByStats);
  });

  it('leaves an uncatalogued name alone rather than defaulting it to Common', () => {
    const odd = staleRing({ id: 'o1', name: 'zz-forged-trophy', rarity: 'Legendary' });
    expect(resealCatalogRarity(odd).rarity).toBe('Legendary');
  });
});

describe('OTA-1654 — a promotion raises the ceiling without inventing damage', () => {
  it('an UNTOUCHED 25/25 ring loads as 40/40, not 25/40', () => {
    const healed = resealUtilityDurability(staleRing());
    expect(healed.durability).toEqual({ current: 40, max: 40 });
  });

  it('a CHIPPED 18/25 ring keeps its 7 points of damage: 33/40', () => {
    const healed = resealUtilityDurability(staleRing({ durability: { current: 18, max: 25 } }));
    expect(healed.durability).toEqual({ current: 33, max: 40 });
  });

  it('⚠ the OTA-677 SHRINK still clamps — a bogus max means bogus damage', () => {
    // A Climbing Rope's 270 came from a temper roll that never should have run,
    // so "170 points of damage" measured against it was never a real number.
    // Only the promotion direction carries damage across.
    const rope = {
      id: 'r1', name: 'Climbing Rope', kind: 'misc', rarity: 'Common', quantity: 1,
      tags: [], durability: { current: 100, max: 270 },
    } as unknown as InventoryItem;
    expect(resealUtilityDurability(rope).durability).toEqual({ current: 100, max: 150 });
  });

  it('never heals an item to zero durability', () => {
    const nearly = staleRing({ durability: { current: 1, max: 25 } });
    expect(resealUtilityDurability(nearly).durability!.current).toBeGreaterThan(0);
  });

  it('leaves weapons and armour to their intended temper band', () => {
    const w = {
      id: 'w1', name: 'Mud-Rend Blade', kind: 'weapon', rarity: 'Common', quantity: 1,
      tags: [], durability: { current: 12, max: 30 },
    } as unknown as InventoryItem;
    expect(resealUtilityDurability(w).durability).toEqual({ current: 12, max: 30 });
  });
});

describe('OTA-1654 — the forge asks the same question the shop asks', () => {
  it('a promoted piece grades the Crucible output at its CATALOG tier', () => {
    // Two stale-Common copies of a now-Rare ring. fusionOutputRarity takes the
    // SECOND-highest input (OTA-1537), so two Rares support Rare.
    const pack = [staleRing(), staleRing({ id: 'inv_tinward_2' })];
    expect(fusionOutputRarity(pack, ['ring'])).toBe('Rare');
  });

  it('a genuinely Common pack still lands on the floor — the heal is not a free tier', () => {
    // Scrap Metal IS Common in the catalog, so nothing is regraded here; the
    // result is Uncommon only because `bumpRarity` floors every fusion at
    // Uncommon by design (OTA-445). The regrade adds no tier of its own.
    const junk = (id: string): InventoryItem => ({
      id, name: 'Scrap Metal', kind: 'misc', rarity: 'Common', quantity: 1, tags: [],
    } as unknown as InventoryItem);
    expect(canonicalItemRarity(junk('a'))).toBe('Common');
    expect(fusionOutputRarity([junk('a'), junk('b'), junk('c')], ['scrap'])).toBe('Uncommon');
  });
});

describe('OTA-1654 — the load chain heals the ring the owner is wearing', () => {
  it('a save carrying the stale ring comes back Rare, 40/40, still equipped', () => {
    const loaded = backfillPlayer(savedWearingTheRing());
    const ring = loaded.inventory.find((i) => i.name === RING);
    expect(ring).toBeTruthy();
    // ⚠ THE BUMP THE OWNER ASKED FOR, in the save itself.
    expect(ring!.rarity).toBe('Rare');
    // …and the ceiling that came with it, with no damage invented.
    expect(ring!.durability).toEqual({ current: 40, max: 40 });
    // The slot still points at the same instance — a heal, not a re-mint.
    expect(loaded.equipped?.ring).toBe(RING);
    expect(loaded.equipped?.ringId).toBe('inv_tinward_1');
    // And the effects that were live all along are still live.
    expect(equippedAccessoryPowers(loaded).wearWardPct).toBe(WEAR_WARD_PCT.Rare);
  });

  it('a second load changes nothing — the migration settles', () => {
    const once = backfillPlayer(savedWearingTheRing());
    const twice = backfillPlayer(once);
    const a = once.inventory.find((i) => i.name === RING)!;
    const b = twice.inventory.find((i) => i.name === RING)!;
    expect(b.rarity).toBe(a.rarity);
    expect(b.durability).toEqual(a.durability);
  });

  it('the golem\'s arm is regraded too — it is the one item outside the inventory', () => {
    const STORE = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
    ) as string;
    // The golem's weapon lives on `golem.weapon`, not in `inventory`, so the
    // array walk cannot reach it and the call has to be spelled out.
    expect(STORE).toContain('weapon: resealCatalogRarity(restampInventoryItem(stampDurability(out.golem.weapon)))');
  });

  it('ONE call does every repair — ceiling and tier land on the same load', () => {
    // ⚠ The claim is not that one step precedes the other (they key on name and
    // kind, not on each other) — it is that a single pass over a saved item does
    // BOTH, so a promoted row can never arrive half-healed.
    const healed = healSavedItem(staleRing());
    expect(healed.rarity).toBe('Rare');
    expect(healed.durability).toEqual({ current: 40, max: 40 });
    // …and the chain is what the load walk actually runs.
    const STORE = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8',
    ) as string;
    expect(STORE).toContain('const inventory = (p.inventory ?? []).map(healSavedItem);');
  });

  it('the chain stays idempotent and pure over the whole save', () => {
    // healSavedItem now owns a dozen stacked migrations; running it twice must
    // change nothing, or every load would keep rewriting the player's pack.
    const once = healSavedItem(staleRing());
    const twice = healSavedItem(once);
    expect(twice).toEqual(once);
    // The input is never mutated — backfill runs over a frozen saved player.
    const source = staleRing();
    healSavedItem(source);
    expect(source.rarity).toBe('Common');
    expect(source.durability).toEqual({ current: 25, max: 25 });
  });
});

describe('OTA-1654 — the other load heals are undisturbed', () => {
  it('restamp still merges catalog tags onto the instance', () => {
    const bare = staleRing({ tags: ['stolen'] });
    const out = restampInventoryItem(bare);
    expect(out.tags).toContain('stolen');   // per-instance flag survives
    expect(out.tags).toContain('ring');     // catalog tag merged in
  });

  it('stampDurability still gives a fresh ring the catalog ceiling, undamaged', () => {
    const fresh = stampDurability(staleRing({ durability: undefined }));
    expect(fresh.durability).toEqual({ current: 40, max: 40 });
  });
});

describe('OTA-1654 — the heal can never pick the wrong row', () => {
  it('⚠ NO ITEM NAME LIVES IN TWO CATALOGS, so a name resolves one rarity and only one', () => {
    // This is a GUARD, not a snapshot. A write-back is only safe while the name
    // → row map is a function: the moment the same name appears in two catalogs
    // at two tiers, `canonicalRowFor` picks whichever catalog it happens to try
    // first and this heal would stamp that arbitrary answer into every save that
    // holds the item. Measured at 0 collisions across all seven catalogs when the
    // heal was written; if this ever fires, fix the duplicate name — do not relax
    // the test.
    const files = ['weapons', 'armor', 'amulets', 'rings', 'gear', 'materials', 'dogGear'];
    const seen = new Map<string, { file: string; rarity: string }[]>();
    for (const f of files) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const raw = require(`../app/data/items/${f}.json`);
      const rows: { name: string; rarity: string }[] = Array.isArray(raw)
        ? raw
        : (Object.values(raw).find(Array.isArray) as { name: string; rarity: string }[]);
      for (const r of rows) {
        const key = String(r.name).toLowerCase();
        const list = seen.get(key) ?? [];
        list.push({ file: f, rarity: r.rarity });
        seen.set(key, list);
      }
    }
    const ambiguous = [...seen.entries()]
      .filter(([, v]) => v.length > 1 && new Set(v.map((x) => x.rarity)).size > 1)
      .map(([name, v]) => `${name}: ${v.map((x) => `${x.file}=${x.rarity}`).join(' vs ')}`);
    expect(ambiguous).toEqual([]);
  });
});
