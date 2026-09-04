// itemBackfill — one-shot pass over an existing player inventory
// that re-stamps the OTA-191 synthesized fields (effect, tags,
// description) onto items that were added BEFORE the upgraded
// `itemDefaults.ts` shipped. Without this, the player's "ton of
// useless items" stays useless until they re-acquire each item;
// the backfill walks the inventory and overlays the now-synthesized
// values in place.
//
// Idempotent — safe to call multiple times. The merge logic only
// fills FIELDS THAT ARE MISSING on the stored item, so an item
// that already carries authored tags / effect data is left alone.
// Flag-gated in gameStore.hydrate so the actual disk write
// happens exactly once per save slot regardless.

import type { InventoryItem } from './types';
import {
  findWeaponByName,
  findArmorByName,
  findAmuletByName,
  findRingByName,
  findGearByName,
  findExplorationItemByName,
  findMaterialByName,
} from './crafting';
import { canonicalItemRarity, lookupCraftedItem } from './crafting';
import { stampDurability, resealUtilityDurability } from './durability';
import { healLegacyDogVest } from './dogCompanion';
import { inferGear, inferWeapon, inferArmor, inferAccessory } from './itemDefaults';

/** Resolve the catalog row for an item by name. Tries every catalog
 *  lookup in turn; falls through to the appropriate inference path
 *  for items the hand-authored catalogs don't cover. The `source`
 *  flag distinguishes catalog hits (authored — preserve the in-pack
 *  description) from inferred rows (synthesized — let the freshest
 *  description win when restamping). */
type ResolvedShape = {
  tags?: readonly string[];
  description?: string;
  effect?: unknown;
};
function resolveCatalogShape(item: InventoryItem):
  | { shape: ResolvedShape; source: 'catalog' | 'inferred' }
  | null {
  // Authored catalogs first. The order matches `findCatalogItem` in
  // crafting.ts so a name that lives in materials.json isn't redirected
  // to gear inference, etc.
  const w = findWeaponByName(item.name);
  if (w) return { shape: w, source: 'catalog' };
  const a = findArmorByName(item.name);
  if (a) return { shape: a, source: 'catalog' };
  const am = findAmuletByName(item.name);
  if (am) return { shape: am, source: 'catalog' };
  const r = findRingByName(item.name);
  if (r) return { shape: r, source: 'catalog' };
  const g = findGearByName(item.name);
  if (g) return { shape: g, source: 'catalog' };
  const ex = findExplorationItemByName(item.name);
  if (ex) return { shape: ex, source: 'catalog' };
  const m = findMaterialByName(item.name);
  if (m) return { shape: m, source: 'catalog' };

  // Fall through to inference based on the item's kind. Mirrors how
  // the engine routes uncatalogued items live.
  if (item.kind === 'weapon') return { shape: inferWeapon(item.name), source: 'inferred' };
  if (item.kind === 'armor') {
    const inferred = inferArmor(item.name);
    if (inferred) return { shape: inferred, source: 'inferred' };
  }
  // Accessory inference reads name keywords (amulet / ring / band /
  // signet / etc.) regardless of the stored kind.
  const acc = inferAccessory(item.name);
  if (acc) return { shape: acc, source: 'inferred' };

  // Everything else falls through to gear inference, which handles
  // food / drink / light / rope / fungus / compass and emits the
  // OTA-191 effect + scrap tags.
  return { shape: inferGear(item.name, item.tags), source: 'inferred' };
}

/** Restamp one inventory item with any newly-synthesized fields it's
 *  missing. Returns a fresh InventoryItem with the merged tags +
 *  description; does NOT mutate the input. */
export function restampInventoryItem(item: InventoryItem): InventoryItem {
  // OTA-704 — a Crucible-fused piece is catalog-absent BY DESIGN: its name is
  // Qwen/deterministic flavor and its tags/description/stats are stamped at the
  // forge. If that name happens to collide with an authored catalog row — e.g. a
  // fused ARMOR the namer called "Aetheric Armor", which is ALSO a runecaster
  // WEAPON in weapons.json — the overlay below would merge the wrong kind's tags
  // (runecaster/rune_power/ward) and clobber the forged description on EVERY load,
  // scattering the piece toward Weapons. Fused items own their shape; never
  // restamp them from the catalog.
  if (item.uniqueStats || (item.tags ?? []).some((t) => t.toLowerCase() === 'fused')) {
    return item;
  }
  const resolved = resolveCatalogShape(item);
  if (!resolved) return item;
  const { shape, source } = resolved;

  // Merge tags — keep every tag already on the inventory instance
  // (per-instance flags like 'stolen' are not on the catalog row),
  // add any tags the synthesized row carries. De-duped.
  const existingTags = item.tags ?? [];
  const catalogTags = (shape.tags ?? []) as string[];
  const mergedTags = Array.from(new Set([...existingTags, ...catalogTags]));

  // Description policy:
  //   - Catalog hits (authored) — leave the stored description alone
  //     unless it's the legacy placeholder string. Hand-authored copy
  //     is canonical.
  //   - Inferred items — the fresh shape.description IS the canonical
  //     one (it picks up any Qwen overlay from the cache), so prefer
  //     it. This lets a live restamp on Qwen-lands actually update
  //     what the player sees without a save reload.
  const stored = typeof item.description === 'string' ? item.description.trim() : '';
  const isLegacyPlaceholder = stored.length === 0
    || /Field-inferred from the name\. Catalog backfill pending\.?$/i.test(stored)
    || /pending catalog backfill\.?$/i.test(stored);
  const description = source === 'inferred'
    ? (shape.description ?? item.description)
    : (isLegacyPlaceholder ? (shape.description ?? item.description) : item.description);

  return {
    ...item,
    tags: mergedTags,
    ...(description !== undefined ? { description } : {}),
  };
}

/** OTA-1654 — WRITE DOWN THE RARITY THE READERS ALREADY USE.
 *
 *  Owner: *"for all of the items that I already had on, or in my inventory like
 *  those rings, fix the effect on them in my save file and bump their rarity
 *  level."*
 *
 *  ⚠ THE EFFECTS WERE NEVER THE PROBLEM. An accessory's powers resolve from the
 *  CATALOG ROW by name every time they are read (`equippedAccessoryPowers` →
 *  `findRingByName`), and every magnitude on the OTA-1649 ladder is indexed by
 *  `row.rarity`, not by the copy in the pack. So the Tin Ward Ring in his save
 *  was already warding acid and already shaving 15% off his gear's wear the
 *  moment OTA-1653 landed. Nothing to migrate there.
 *
 *  What DID drift is the rarity STAMPED ON THE INSTANCE at mint. OTA-999 taught
 *  the ECONOMY to ignore that stamp — `canonicalItemRarity` asks the catalog, and
 *  sell price, scrap yield, repair cost and the golem substitute heal all go
 *  through it — but it never wrote the answer back. Every reader OTA-999 did not
 *  convert still reads the stale field:
 *
 *    • the inventory row PRINTS the word and colours its stripe from `rarity`
 *    • the RARITY sort ranks from `rarity`
 *    • ⚠ `fusionOutputRarity` grades the Crucible's OUTPUT from its inputs'
 *      `rarity` — so feeding a since-promoted piece to the forge quietly bought
 *      a worse item than the piece deserved. That one costs real value.
 *
 *  A ring minted Common under OTA-1649 and promoted to Rare by OTA-1653 was
 *  therefore selling at its Rare price while reading "Common" on the player's own
 *  sheet — the sheet and the till disagreeing about the same object.
 *
 *  ⚠ THE HEAL INVENTS NO SECOND RULE. It calls the very same
 *  `canonicalItemRarity` the economy calls and persists what comes back, so there
 *  stays exactly ONE definition of what an item's rarity is; this only stops the
 *  save from contradicting it. It heals in BOTH directions for the same reason —
 *  a demotion the economy is already charging for should not keep printing the
 *  old word.
 *
 *  Fused and Guardian pieces are returned untouched, mirroring
 *  `restampInventoryItem`'s guard: their rarity was decided at the forge (or by
 *  the set) and no catalog row speaks for them — a fused ARMOR that happens to
 *  share a name with a catalog WEAPON must not be regraded off that collision.
 *
 *  Idempotent: an item that already agrees is returned by reference. */
export function resealCatalogRarity(item: InventoryItem): InventoryItem {
  if (item.uniqueStats || (item.tags ?? []).some((t) => t.toLowerCase() === 'fused')) {
    return item;
  }
  const canon = canonicalItemRarity(item);
  if (!canon || canon === item.rarity) return item;
  return { ...item, rarity: canon };
}

/** OTA-192 — restamp every inventory entry that matches the given
 *  name (case-insensitive). Returns the new inventory array, or the
 *  input untouched if nothing changed. Used by the Qwen-cache-lands
 *  listener so a freshly synthesized item updates in-session. */
export function restampInventoryForName(
  inventory: readonly InventoryItem[],
  name: string,
): { inventory: InventoryItem[]; changed: boolean } {
  const lower = name.toLowerCase();
  let changed = false;
  const next = inventory.map((item) => {
    if (item.name.toLowerCase() !== lower) return item;
    const fresh = restampInventoryItem(item);
    if (
      fresh.description !== item.description
      || (fresh.tags ?? []).join('|') !== (item.tags ?? []).join('|')
    ) {
      changed = true;
      return fresh;
    }
    return item;
  });
  return { inventory: changed ? next : [...inventory], changed };
}

/** Walk an entire inventory and restamp every item. Returns a fresh
 *  array; safe to call on a frozen player object. */
export function restampInventory(inventory: readonly InventoryItem[]): InventoryItem[] {
  return inventory.map(restampInventoryItem);
}

/** ⚠ OTA-1654 — EVERY REPAIR ONE SAVED ITEM NEEDS, IN ORDER, IN ONE PLACE.
 *
 *  This chain lived inline inside `backfillPlayerInner`'s inventory `.map` and
 *  had grown to a hundred-odd lines of a dozen migrations stacked since OTA-191.
 *  Nothing in it ever touched the store — every step is a pure item → item
 *  function over the engine catalogs — so it was sitting in gameStore only
 *  because that is where the first one was written. It belongs in the module
 *  named for backfilling items, where the rules it applies can be read (and
 *  exercised) beside the functions that implement them.
 *
 *  ⚠ THE ORDER IS LOAD-BEARING and each step says why:
 *    1. settle a fusion caught mid-materialize by a process kill
 *    2. stamp durability, then reconcile KIND against the catalog and re-stamp
 *       (a kind change can newly qualify the item for durability)
 *    3. restamp synthesized tags/description
 *    4. heal a legacy dog vest's drifted kind
 *    5. reseal a utility item's durability ceiling
 *    6. regrade rarity — AFTER 5, so a promoted row's ceiling and tier land on
 *       the same load
 *    7. Guardian / fused provenance, reach, and the two legacy name repairs
 *
 *  Pure and idempotent: a save that has already been through it comes back
 *  unchanged, which is what makes it safe to run on every single load. */

/** ⚠⚠⚠ OTA-1670 — A SAVED PIECE FOLLOWS ITS CATALOG ROW TO THE NEW STAT.
 *
 *  The owner's ruling when I asked whether the redistribution should touch live
 *  saves: *"yes this should affect all game save files."* It has to, or the
 *  rebalance only reaches characters nobody has made yet — and his own run, and
 *  both his daughters', would keep the old pile forever.
 *
 *  ⚠ THE ROLLED AMOUNT IS KEPT. `rollInstancePerks` seeds an instance's channel
 *  from the CATALOG stat and then varies the magnitude, so a saved piece is
 *  carrying its own roll on a channel that has now moved. Rewriting the channel
 *  NAME and leaving the number is the whole migration: the player keeps exactly
 *  the piece they earned, pointed at the stat its name always implied.
 *
 *  ⚠⚠ AND IT REFUSES TO GUESS. It fires only when the piece has exactly ONE
 *  rolled stat channel and is not a Crucible fusion — a fused piece's extra
 *  channels are its own history, not a catalog echo, and there is no honest way
 *  to tell which of three rolled channels was once the catalog's. Those keep
 *  what they have. Idempotent: a save already migrated matches on the first
 *  comparison and returns unchanged. */
function followCatalogStat(item: InventoryItem): InventoryItem {
  const rolled = item.instanceStats?.statBonuses;
  if (!rolled || rolled.length !== 1) return item;
  if (item.uniqueStats || (item.tags ?? []).some((t) => t.toLowerCase() === 'fused')) return item;
  const row = findArmorByName(item.name);
  const want = row?.statBonus?.stat;
  if (!want) return item;
  const have = rolled[0]!;
  if (have.stat === want) return item;
  return {
    ...item,
    instanceStats: { ...item.instanceStats, statBonuses: [{ stat: want, amount: have.amount }] },
  };
}

export function healSavedItem(saved: InventoryItem): InventoryItem {
  let i = saved;
  // OTA-631 — settle any fused item still "materializing" when the app was last
  // killed. After a process restart the background namer is gone and the fusion
  // inputs are already consumed, so settle to the stashed deterministic name
  // (formingName) rather than leaving a weapon stuck as "Cooling Crucible-Work".
  if (i.materializing) {
    i = {
      ...i,
      name: i.formingName ?? i.name,
      description: i.formingDesc ?? i.description,
      materializing: undefined,
      formingName: undefined,
      formingDesc: undefined,
    };
  }
  let item = stampDurability(i);
  const lookup = lookupCraftedItem(item.name);
  // OTA-1001 — fused pieces are kind-authoritative (mirrors restampInventoryItem's
  // guard): a fused ARMOR sharing a name with a catalog weapon row flipped to
  // 'weapon' on every load.
  if (!item.uniqueStats && !(item.tags ?? []).includes('fused') && lookup.kind !== 'misc' && item.kind !== lookup.kind) {
    item = { ...item, kind: lookup.kind };
    // Kind change can unlock durability tracking — re-stamp so the
    // newly-eligible item picks up its baseDurability on this load.
    item = stampDurability(item);
  }
  // OTA-191 — re-stamp synthesized fields (tags, description, scrap routing) onto
  // every item. Items dropped / scavenged / bought BEFORE the upgraded
  // itemDefaults.ts shipped carry empty tag lists and the bare "Field-inferred …
  // pending catalog backfill" description. Idempotent (the merge only fills gaps).
  item = restampInventoryItem(item);
  // ⚠ OTA-1603 — a legacy Crucible dog vest whose kind drifted (pre-OTA-688
  // forges carry no uniqueStats; OTA-1001 above deliberately skips fused items)
  // gets its kind + minimal uniqueStats back from its own forge noun.
  item = healLegacyDogVest(item);
  // OTA-677 — heal temper bloat: a non-weapon/armor tool (Climbing Rope, Pry Bar)
  // stamped BEFORE the temper gate carries an inflated random durability max (a
  // 150-rope at ~270). No-op for weapons/armor and for already-correct items.
  item = resealUtilityDurability(item);
  // OTA-1654 — regrade against the catalog. See resealCatalogRarity above.
  item = resealCatalogRarity(item);
  // OTA-1670 — follow the catalog's stat channel. AFTER the rarity reseal, for
  // the same reason that one runs late: the row this reads is the healed row.
  item = followCatalogStat(item);
  // OTA-688 — mark older Crucible forges. applyFusion now stamps uniqueStats AND
  // a 'fused' tag, but pieces forged before the tag existed carry uniqueStats
  // without it. Backfill the tag on load so every crucible item is marked (the
  // inventory ✶ badge + any fused-aware logic keys off it).
  // OTA-808 — Core Guardian reward gear now ALSO carries uniqueStats (so it's a
  // usable weapon/armor — see coreGuardians.ts), which breaks OTA-688's old
  // "uniqueStats ⇒ fused" assumption. A Guardian drop is NOT a forge: skip the
  // fused-tag backfill AND the fused-name migration below for the tagged set, so
  // "Atalan's Trident" keeps its name and doesn't read as a Crucible fusion.
  const isGuardianReward = (item.tags ?? []).some((t) => t.toLowerCase() === 'core_guardian_set');
  // OTA-830 — a Core Guardian drop granted BEFORE OTA-828 has NO uniqueStats
  // (the builder didn't stamp yet): resolved barehanded / 0 AC. Backfill from
  // the canonical set entry by name, BEFORE the fused-tag backfill below.
  if (isGuardianReward && !item.uniqueStats) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gStats = (require('./coreGuardians') as typeof import('./coreGuardians')).guardianGearUniqueStats(item);
    if (gStats) item = { ...item, uniqueStats: gStats };
  }
  if (item.uniqueStats && !isGuardianReward && !(item.tags ?? []).some((t) => t.toLowerCase() === 'fused')) {
    item = { ...item, tags: [...(item.tags ?? []), 'fused'] };
  }
  // OTA-955 — reach recheck for already-forged weapons (owner: "have it recheck
  // and fix old saves as well"). Every fused weapon now carries an explicit
  // reachClass; older forges get it inferred from their name on load — a legacy
  // "Humming Bow" shoots from distance, a "Cairn Spear" reaches to mid, and a
  // "Resonant Spike" is honestly close-quarters. Idempotent.
  if (item.uniqueStats && !isGuardianReward && item.uniqueStats.kind === 'weapon' && !item.uniqueStats.reachClass) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { inferReachFromName: irnSweep } = require('./itemFusion') as typeof import('./itemFusion');
    item = { ...item, uniqueStats: { ...item.uniqueStats, reachClass: irnSweep(item.name) ?? 'melee' } };
  }
  // OTA-225 — repair the OTA-221 deterministic-synth name bug. A signed-shift bug
  // produced fused items named "Resonant undefined" / "<Theme> undefined" before
  // OTA-224 fixed the shift; saves loaded post-OTA-224 still carry the broken name
  // on the instance. Rewrite the suffix from the item's id + uniqueStats.kind,
  // using the same suffix pools as the synth.
  if (item.uniqueStats && / undefined\b/i.test(item.name)) {
    const suffixPool: Record<string, string[]> = {
      weapon: ['Cleaver', 'Edge', 'Spike', 'Lash', 'Maul'],
      armor: ['Brace', 'Vigil', 'Mantle', 'Shroud', 'Bulwark'],
      dog_armor: ['Vigil', 'Wrap', 'Pattern', 'Stride'],
    };
    const pool = suffixPool[item.uniqueStats.kind] ?? suffixPool.weapon!;
    // Deterministic pick from the item's id so the same item always gets the
    // same suffix on every load.
    let hash = 5381;
    for (let n = 0; n < item.id.length; n++) {
      hash = ((hash << 5) + hash + item.id.charCodeAt(n)) >>> 0;
    }
    const suffix = pool[hash % pool.length]!;
    item = { ...item, name: item.name.replace(/\s*undefined\b/gi, ` ${suffix}`).trim() };
  }
  // OTA-706 — one-time rename for ALREADY-forged fused items whose stored name
  // cross-kind-collides with a catalog row: a forged ARMOR named "Aetheric Armor"
  // is ALSO an authored runecaster WEAPON, so it read as a weapon (1d10 line,
  // wrong section) before OTA-704/705 sealed the resolution. Those fixes made the
  // collision harmless, but the ugly/duplicate name persisted — re-mint a
  // distinct, non-colliding deterministic name. Idempotent.
  if (item.uniqueStats && !isGuardianReward) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { migrateFusedName } = require('./itemFusion') as typeof import('./itemFusion');
    item = migrateFusedName(item);
  }
  return item;
}
