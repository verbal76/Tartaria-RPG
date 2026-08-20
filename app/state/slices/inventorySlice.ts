/**
 * OTA-1399 — SLICE 8b OF THE gameStore SPLIT: the player's own kit.
 *
 * Twelve actions, 1,306 lines: equip, unequip, un-bandolier, heal in batches,
 * drop by name, drop by instance, use, coat a weapon, coat armour, scrap,
 * repair, and salvage every ambient noun in a room at once.
 *
 * ⚠⚠ THE LARGEST OF THE THREE, AND THE MOST COUPLED — 19 module-level symbols
 * handed in, against 8 for the vendor counter and 4 for crafting. That number is
 * a measurement, not a failure: this is the cluster that touches the clock
 * (`advanceTime`), the stamina economy (`spendStamina`, `restoreStamina`,
 * `effectiveStaminaMax`, `STAMINA_COSTS`), the armour aggregate and the salvage
 * ledger. It is coupled because equipping a thing genuinely changes six systems.
 *
 * ⚠ AND THE DEPS OBJECT NAMES THE NEXT MOVE. Five of the nineteen are broad
 * utilities with 30-95 call sites elsewhere in the store — `advanceTime`,
 * `spendStamina`, `makeRoomKey`, `freshInstanceId`, `STAMINA_COSTS`. Those are
 * candidates to move DOWN to leaves the way the sprint detector and the log
 * counter did in slice 7, and doing so would shrink this object and every later
 * one. They are injected rather than moved because moving them is a SECOND
 * refactor, and mixing a move with a move is how a reviewer loses the thread.
 *
 * ⚠ ONE HELPER TRAVELLED: `hpAfterMaxChange`, which decides what current HP
 * becomes when gear re-bakes hpMax. It is read by nothing else, and it is the
 * guard that stops equipping a +HP item from standing a corpse back up.
 *
 * ⚠ NO MUTABLE STATE. ⚠ WHAT DID NOT CHANGE: twelve bodies, verbatim.
 */
import { withArticle } from '../../engine/grammar';
import type { InventoryItem } from '../../engine/types';
import { makeEntry, persistEntry } from '../../engine/gameLog';
import { isQuestLockedItem } from '../../engine/questItems';
import { pick, chance } from '../../engine/rng';
import { grantItem } from '../../engine/inventory';
import { lookupCraftedItem, findArmorByName, findWeaponByName, applyArmorResistance } from '../../engine/crafting';
import { trainStat } from '../../engine/statTraining';
import { validSlotsForItem, SLOT_LABEL, SLOT_ID_KEY, effectiveStats, gearHpBonus, resolveEquippedItem } from '../../engine/equipment';
import { canScrap, scrapOutputFor, repairCostMaterials, scrapSuccessChance, scrapHasSecondChance, pickScrapFailureLine } from '../../engine/scrapEngine';
import { stampDurability } from '../../engine/durability';
import type { EquipSlot, PlayerEquipped } from '../../engine/types';
import { ARMOR, findCatalogItem } from '../../engine/crafting';
import { weatherStatModifiers } from '../../engine/weatherEffects';
import { resolveLootItem } from '../../engine/crafting';
import { canonicalItemRarity, canonicalItemTags } from '../../engine/crafting';
import { rollAreaSearch } from '../../engine/areaSearch';
import { rollSalvagePool } from '../../engine/salvagePools';
import { scaledHealHP } from '../../engine/itemEffect';
import { pickFragmentForBiome } from '../../engine/collectables';

/**
 * ⚠ `import type * as` is fully erased at compile time, so this is NOT a runtime
 * cycle. It lets every dep below be typed `typeof Store.fn`, which means their
 * signatures cannot drift from the real functions: change one in gameStore and
 * this file stops compiling rather than silently accepting the wrong shape.
 */
import type * as Store from '../gameStore';
// ⚠ OTA-1404 — type-only, same as the Store import above and for the same
//   reason: it is erased at compile time, so it cannot form a runtime cycle.
import type * as Combat from '../combatResolution';

type GameStore = Store.GameStore;
type SetState = (
  partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>),
) => void;


export interface InventorySlice {
  equipItem: (itemName: string, slot: EquipSlot, itemId?: string) => void;
  unequipSlot: (slot: EquipSlot) => void;
  removeFromBandolier: (itemName: string, itemId?: string) => void;
  useHealBatch: (itemName: string, target: 'self' | 'dog' | 'golem', count: number) => void;
  dropInventoryItem: (itemName: string, itemId?: string) => void;
  dropInventoryInstance: (itemId: string) => void;
  useInventoryItem: (itemName: string) => void;
  applyCoating: (coatingItemId: string, weaponId: string, replaceSlot?: 'coating' | 'coating2') => void;
  applyCoatingToArmor: (coatingItemId: string, armorId: string, replaceResist?: string) => void;
  scrapInventoryItem: (itemName: string, itemId?: string) => void;
  repairInventoryItem: (itemId: string) => void;
  salvageAllAmbient: (nouns: readonly string[]) => void;
}

export interface InventorySliceDeps {
  AT_isProcedureTextName: typeof Store.AT_isProcedureTextName;
  STAMINA_COSTS: typeof Store.STAMINA_COSTS;
  // ⚠ OTA-1404 — these three now live in the combat leaf rather than the store.
  //   The dep threading is unchanged: gameStore imports them and hands them over
  //   exactly as before; only the address they are TYPED against moved.
  activeEnemy: typeof Combat.activeEnemy;
  advanceTime: typeof Store.advanceTime;
  aggregateArmor: typeof Combat.aggregateArmor;
  assembleBeaconRifle: typeof Store.assembleBeaconRifle;
  debugLoadout: typeof Store.debugLoadout;
  effectiveStaminaMax: typeof Store.effectiveStaminaMax;
  freshInstanceId: typeof Store.freshInstanceId;
  ledgeredSalvage: typeof Store.ledgeredSalvage;
  makeRoomKey: typeof Store.makeRoomKey;
  nonClimbMarkers: typeof Store.nonClimbMarkers;
  pickFragmentSalvageLine: typeof Store.pickFragmentSalvageLine;
  playerArmorResistKinds: typeof Combat.playerArmorResistKinds;
  restoreStamina: typeof Store.restoreStamina;
  spendStamina: typeof Store.spendStamina;
  statNowClause: typeof Store.statNowClause;
  unlockGreatClimbFromChart: typeof Store.unlockGreatClimbFromChart;
}
/** ⚠ OTA-1110 — HP AFTER AN hpMax CHANGE, WITHOUT RESURRECTING ANYONE.
 *  Equipping or displacing +HP gear re-bakes hpMax and carries current HP with
 *  it. The four sites that do this all read `Math.max(1, …)`, whose floor of 1
 *  exists so a big hpMax cut can never leave a living character on zero — a
 *  correct instinct with a hole in it: at ZERO HP that same floor quietly
 *  stands a corpse back up, which is half of the owner's "I was at 0 and kept
 *  playing." A player already at zero is either about to be resolved dead or
 *  already is; either way gear must not heal them. Stay at zero and let the
 *  death path own it. */
function hpAfterMaxChange(cur: number | undefined, delta: number, newMax: number): number {
  const now = cur ?? 1;
  if (now <= 0) return 0;
  return Math.max(1, Math.min(now + delta, newMax));
}

export const createInventorySlice = (
  set: SetState,
  get: () => GameStore,
  deps: InventorySliceDeps,
): InventorySlice => ({
  equipItem(itemName, slot, itemId) {
    // ⚠ OTA-1248 — the `armor` beat completes on the EQUIP, not the take. Placed at
    // the top so it fires for every route into equipping (inventory tap, typed
    // `equip vest`, the group action) rather than only the one the beat suggested.
    if (/vest|mud-warden|warden/i.test(itemName)) {
      setTimeout(() => { try { get().maybeAdvanceTutorial('armor'); } catch { /* never block an equip */ } }, 0);
    }
    const state = get();
    const player = state.player;
    if (!player) return;
    // OTA-930 — resolve the EXACT instance the caller picked by its unique id when
    // given (the inventory UI passes it), so a stack of same-name items with
    // different durability/instance stats equips the ONE the player selected — not
    // just the first row that happens to share the name. Falls back to name-match
    // for typed commands / legacy callers that don't carry an id.
    const item =
      (itemId ? player.inventory.find((i) => i.id === itemId && i.quantity > 0) : null)
      ?? player.inventory.find(
        (i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0,
      );
    if (!item) {
      get().appendLog('arbiter', `The Arbiter glances at your pack. "I don't see ${withArticle(itemName)} on you."`);
      return;
    }
    const valid = validSlotsForItem(item);
    if (!valid.includes(slot)) {
      get().appendLog(
        'arbiter',
        `The Arbiter shakes their head. "The ${item.name} doesn't go in the ${SLOT_LABEL[slot]} slot."`,
      );
      return;
    }
    // 2026-05-26 OTA-056 — two-handed weapon auto-displace. Was: refuse
    // the equip and force the player to unequip the conflicting
    // weapon manually. Now: drop the conflicting item back to inventory
    // automatically and proceed with the equip. The displaced weapon
    // is still in player.inventory (equipped slots are pointers, not
    // owners), so "drop" just means clearing the equipped pointer +
    // narrating the swap.
    const incomingCat = findWeaponByName(item.name);
    const mainName = player.equipped?.main;
    const offName = player.equipped?.off;
    const mainCat = mainName ? findWeaponByName(mainName) : null;
    // Track displacements so a single combined "you set X aside" line
    // fires before the equip narration.
    const displaced: string[] = [];
    // OTA-796 — a displaced weapon must give back the max-HP bonus it baked in
    // (mirror of unequipSlot). Without this, alternating a +HP shield with a
    // +HP two-hander re-baked the bonus on every re-equip while the displace
    // never stripped it — an unbounded hpMax + full-heal loop (exploit sweep).
    const stripDisplacedHp = (name: string | undefined) => {
      const d = -gearHpBonus(name);
      if (d === 0) return;
      set((s) => {
        if (!s.player) return s;
        const newMax = Math.max(1, (s.player.hpMax ?? 1) + d);
        return { player: { ...s.player, hpMax: newMax, hp: hpAfterMaxChange(s.player.hp, d, newMax) } };
      });
    };
    if (slot === 'off' && mainCat?.style === 'two_handed') {
      // Equipping anything to off-hand while 2H in main → drop the 2H.
      displaced.push(mainName!);
      stripDisplacedHp(mainName);
      set((s) => (s.player ? {
        player: {
          ...s.player,
          equipped: { ...(s.player.equipped ?? {}), main: undefined, mainId: undefined },
        },
      } : s));
    }
    if (slot === 'main' && incomingCat?.style === 'two_handed' && offName) {
      // Equipping a 2H to main while off-hand has something → drop off-hand.
      displaced.push(offName);
      stripDisplacedHp(offName);
      set((s) => (s.player ? {
        player: {
          ...s.player,
          equipped: { ...(s.player.equipped ?? {}), off: undefined, offId: undefined },
        },
      } : s));
    }
    if (slot === 'off' && incomingCat?.style === 'two_handed') {
      // Equipping a 2H weapon to OFF (rare via parser, possible via UI):
      // route it to MAIN instead so the 2H rendering is consistent
      // (main is the canonical 2H slot). Treat as "main equip" from
      // here. Drops anything in either hand.
      if (mainName) {
        displaced.push(mainName);
        stripDisplacedHp(mainName);
        set((s) => (s.player ? {
          player: {
            ...s.player,
            equipped: { ...(s.player.equipped ?? {}), main: undefined, mainId: undefined },
          },
        } : s));
      }
      if (offName) {
        displaced.push(offName);
        stripDisplacedHp(offName);
        set((s) => (s.player ? {
          player: {
            ...s.player,
            equipped: { ...(s.player.equipped ?? {}), off: undefined, offId: undefined },
          },
        } : s));
      }
      slot = 'main' as EquipSlot;
    }
    if (displaced.length > 0) {
      get().appendLog(
        'world',
        `You set ${displaced.length === 1 ? `the ${displaced[0]}` : `the ${displaced.join(' and ')}`} aside to free your ${displaced.length === 1 && slot === 'off' ? 'off hand' : 'hands'} for the ${item.name}.`,
      );
    }
    // OTA-239 — three ring slots. When caller asks for 'ring' and the
    // primary ring slot is taken, route to ring2 / ring3 if empty.
    // Falls back to ring (overwrite) if all three are full so the
    // equip still succeeds — playtest: "you can equip up to three
    // rings." validSlotsForItem returns 'ring' for any ring-shaped
    // item; equip flow chooses the actual slot internally so the
    // UI / parser doesn't need to know.
    let writeSlot: string = slot;
    let writeIdKey: string = SLOT_ID_KEY[slot];
    if (slot === 'ring') {
      const eq = player.equipped ?? {};
      if (!eq.ring) { writeSlot = 'ring'; writeIdKey = 'ringId'; }
      else if (!eq.ring2) { writeSlot = 'ring2'; writeIdKey = 'ring2Id'; }
      else if (!eq.ring3) { writeSlot = 'ring3'; writeIdKey = 'ring3Id'; }
      else { writeSlot = 'ring'; writeIdKey = 'ringId'; } // all full → overwrite first
    }
    // Capture what was already in this slot so the swap is visible.
    // Playtest: player equipped a locket, then a compass to the same Amulet
    // slot and got two "You equip ..." lines with no signal that the locket
    // was actually displaced.
    const previousInSlot = (player.equipped ?? {})[writeSlot as keyof PlayerEquipped] as string | undefined;
    // arb62 — split-on-equip. A stack of N>1 durable items (e.g. 3 Aetherbound
    // Masks merged by grantItem) shares ONE inventory row + id; equipping it
    // flagged ALL N as EQUIPPED and the spares couldn't be scrapped/used. Now:
    // when equipping from a stack, the EQUIPPED copy KEEPS the original id (qty
    // 1) and the REMAINDER (N-1) is peeled off into a new free instance. Keeping
    // the original id on the equipped copy preserves the invariant that
    // equipped[slotId] === the id of the item the caller equipped (relied on by
    // durability wear, resolveEquippedItem, and the inventory-audit harnesses).
    // arb64 — flipped the split direction (was: peel the equipped copy to a new
    // id), which had broken that invariant. Quantity 1 → no split.
    const equipId = item.id;
    if ((item.quantity ?? 1) > 1) {
      const remainderId = `equip_rem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      set((s) => {
        if (!s.player) return s;
        const inv = s.player.inventory.map((i) =>
          i.id === item.id ? { ...i, quantity: 1 } : i,
        );
        inv.push({
          ...item,
          id: remainderId,
          quantity: (item.quantity ?? 1) - 1,
          durability: item.durability ? { ...item.durability } : undefined,
        });
        return { player: { ...s.player, inventory: inv } };
      });
    }
    // Store both the catalog name (for display + catalog lookup) AND the
    // specific InventoryItem.id so durability wear, the InventoryScreen
    // "EQUIPPED" badge, and any other instance-sensitive code knows
    // EXACTLY which copy is in the slot.
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              equipped: {
                ...(s.player.equipped ?? {}),
                [writeSlot]: item.name,
                [writeIdKey]: equipId,
              },
            },
          }
        : s,
    );
    // arb-fix — bake the armor's max-HP bonus into hpMax. Net delta = new
    // piece's HP bonus minus whatever this slot already held (so swaps don't
    // double-count). hp rises with the cap so the player actually gains the HP.
    {
      const hpDelta = gearHpBonus(item.name) - gearHpBonus(previousInSlot);
      if (hpDelta !== 0) {
        set((s) => {
          if (!s.player) return s;
          const newMax = Math.max(1, (s.player.hpMax ?? 1) + hpDelta);
          return { player: { ...s.player, hpMax: newMax, hp: hpAfterMaxChange(s.player.hp, hpDelta, newMax) } };
        });
      }
    }
    // A routine equip no longer narrates to the story feed. It's a deliberate
    // menu action the player just performed, already confirmed by the inventory
    // screen and the HUD's "Equipped:" line — and echoing "You equip X" for each
    // of 8-10 slots buried the scene's arrival dialogue (playtester report). NOTE
    // the 2-handed auto-displace line above still fires: that's a CONSEQUENCE the
    // player can't otherwise see, so it stays. (previousInSlot is still used above
    // for the HP-bonus delta.)
    // OTA-352 — loadout snapshot on equip change, so a log review can confirm
    // the piece's bonuses (incl. weapon/cloak/fused stealth) landed in effectiveStats.
    { const live = get().player; if (live) get().appendLog('debug', deps.debugLoadout(live)); }
    void get().persist();
  },

  unequipSlot(slot) {
    // arb-fix — strip the removed armor's max-HP bonus from hpMax (mirror of
    // the equip bake-in). Read the occupant before clearing the slot.
    const removed = (get().player?.equipped ?? {})[slot as keyof PlayerEquipped] as string | undefined;
    const hpDelta = -gearHpBonus(removed);
    set((s) =>
      s.player
        ? {
            player: {
              ...s.player,
              equipped: {
                ...(s.player.equipped ?? {}),
                [slot]: undefined,
                [SLOT_ID_KEY[slot]]: undefined,
              },
              ...(hpDelta !== 0
                ? (() => {
                    const newMax = Math.max(1, (s.player.hpMax ?? 1) + hpDelta);
                    // arb168 — actually SUBTRACT the removed gear's HP bonus from
                    // current HP (hpDelta is negative here), mirroring the equip
                    // bake-in. The old code only re-clamped `hp` to the new max, so
                    // equipping +HP gear while wounded then unequipping banked the
                    // bonus as free current HP — a repeatable infinite heal.
                    return { hpMax: newMax, hp: hpAfterMaxChange(s.player.hp, hpDelta, newMax) };
                  })()
                : {}),
            },
          }
        : s,
    );
    // Routine unequip no longer narrates to the story feed (see equipItem) — the
    // inventory screen + HUD already reflect the empty slot. Suppressed so gear
    // management doesn't bury the scene.
    void get().persist();
  },

  removeFromBandolier(itemName, itemId) {
    const player = get().player;
    if (!player) return;
    const current = player.equipped?.bandolierIds ?? [];
    // OTA-695 — pull the exact racked instance the UI tapped (id-first).
    const item = (itemId ? player.inventory.find((i) => i.id === itemId && current.includes(i.id)) : undefined)
      ?? player.inventory.find(
        (i) => i.name.toLowerCase() === itemName.toLowerCase() && current.includes(i.id),
      );
    if (!item) {
      get().appendLog('arbiter', `The Arbiter looks at the bandolier. "${itemName} isn't racked."`);
      return;
    }
    set((s) => s.player
      ? { player: { ...s.player, equipped: { ...(s.player.equipped ?? {}), bandolierIds: current.filter((id) => id !== item.id) } } }
      : s);
    get().appendLog('world', `You pull ${item.name} off the bandolier and back into your pack.`);
    void get().persist();
  },

  useHealBatch(itemName, target, count) {
    const player = get().player;
    if (!player || count <= 0) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolveItemEffect } = require('../../engine/itemEffect');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findGearByName, findExplorationItemByName, findMaterialByName } = require('../../engine/crafting');
    const item = player.inventory.find((i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0);
    if (!item) { get().appendLog('arbiter', `The Arbiter glances at your pack. "No ${itemName} left."`); return; }
    const use = Math.min(count, item.quantity);
    const spend = (inv: InventoryItem[]) => inv
      .map((i) => (i.id === item.id ? { ...i, quantity: i.quantity - use } : i))
      .filter((i) => i.quantity > 0);

    if (target === 'golem') {
      const golem = player.golem;
      if (!golem) { get().appendLog('arbiter', `The Arbiter looks around. "No golem to mend."`); return; }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isGolemRepairPart, isGolemSubstitutePart, golemRepairHeal, golemSubstituteHeal } = require('../../engine/golems') as typeof import('../../engine/golems');
      const perHP = isGolemRepairPart(golem.kind, item.name)
        ? golemRepairHeal(golem.kind)
        : isGolemSubstitutePart(golem.kind, item)
          ? golemSubstituteHeal(golem.kind, canonicalItemRarity(item))
          : 0;
      if (perHP <= 0) { get().appendLog('arbiter', `The Arbiter shakes their head. "${item.name} won't feed the Aetherstone."`); return; }
      const gap = Math.max(0, golem.hpMax - golem.hp);
      const heal = Math.min(gap, perHP * use);
      set((s) => (s.player?.golem
        ? { player: { ...s.player, golem: { ...s.player.golem, hp: s.player.golem.hp + heal }, inventory: spend(s.player.inventory) } }
        : s));
      get().appendLog('world', `You pack ${use}× ${item.name} into ${golem.name}'s frame. +${heal} HP (${Math.min(golem.hpMax, golem.hp + heal)}/${golem.hpMax}).`);
      void get().persist();
      return;
    }

    const fx = resolveItemEffect(item.name, [findGearByName, findExplorationItemByName, findMaterialByName]);
    const perHP = fx?.kind === 'consumable' ? scaledHealHP(fx.healHP ?? 0, player.hpMax) : 0; // OTA-978 — #120
    if (perHP <= 0) { get().appendLog('arbiter', `The Arbiter studies the ${item.name}. "That won't mend anything in bulk."`); return; }

    if (target === 'dog') {
      const dog = player.dog;
      if (!dog || dog.status === 'dead' || dog.status === 'abandoned') { get().appendLog('arbiter', `The Arbiter glances at your side. "No dog to tend."`); return; }
      const gap = Math.max(0, dog.hpMax - dog.hp);
      // OTA-993 — the dog's meal scales by the DOG's hpMax, not the player's.
      const dogPer = fx?.kind === 'consumable' ? scaledHealHP(fx.healHP ?? 0, dog.hpMax) : 0;
      const heal = Math.min(gap, dogPer * use);
      const isTreat = canonicalItemTags(item).includes('dog_treat');
      const loyPer = isTreat ? 40 : fx?.kind === 'consumable' ? 20 : 5;
      const loyalty = Math.min(100, dog.loyalty + loyPer * use);
      set((s) => (s.player?.dog
        ? { player: { ...s.player, dog: { ...s.player.dog, hp: s.player.dog.hp + heal, loyalty }, inventory: spend(s.player.inventory) } }
        : s));
      get().appendLog('world', `You feed ${dog.name} ${use}× ${item.name}. +${heal} HP (${Math.min(dog.hpMax, dog.hp + heal)}/${dog.hpMax}), +loyalty.`);
      void get().persist();
      return;
    }

    const perStam = fx?.kind === 'consumable' ? (fx.restoreStamina ?? 0) : 0;
    const hpGap = Math.max(0, player.hpMax - player.hp);
    const stamGap = Math.max(0, deps.effectiveStaminaMax(player) - player.stamina);
    const healHP = Math.min(hpGap, perHP * use);
    const healStam = Math.min(stamGap, perStam * use);
    set((s) => {
      if (!s.player) return s;
      const healed = { ...s.player, hp: s.player.hp + healHP, stamina: s.player.stamina + healStam, inventory: spend(s.player.inventory) };
      return { player: deps.advanceTime(healed, 0.25) };
    });
    get().appendLog('world', `You use ${use}× ${item.name}. +${healHP} HP (${Math.min(player.hpMax, player.hp + healHP)}/${player.hpMax})${healStam > 0 ? `, +${healStam} stamina` : ''}.`);
    void get().persist();
  },

  dropInventoryItem(itemName, itemId) {
    // OTA-1100 — with an INSTANCE ID in hand, drop that exact instance directly.
    // The first attempt threaded the id through `submitPlayerAction('drop <id>')`
    // because the verb also matches on id — and it worked in a probe, then failed
    // on a real id, because the id has to survive the intent PARSER to arrive as
    // `parsed.target`. `trinket_junk` does not; `bbb` does. An identifier whose
    // resolution depends on whether it happens to look like a word is not a
    // mechanism, it is a coincidence. So the drop BODY moved into
    // `dropInventoryInstance` and both entry points call it: the typed verb still
    // resolves the noun, the UI passes the id, and there is exactly ONE
    // implementation of dropping.
    if (itemId) { get().dropInventoryInstance(itemId); return; }
    // Name only (typed commands, legacy callers) — unchanged: route through the
    // verb so the parser's noun resolution and its "isn't in your pack" line apply.
    get().submitPlayerAction(`drop ${itemName}`);
  },

  dropInventoryInstance(itemId) {
    const player = get().player;
    const currentScene = get().currentScene;
    if (!player || !currentScene) return;
    const item = player.inventory.find((i) => i.id === itemId);
    if (!item) {
      get().appendLog('arbiter', `The Arbiter shakes their head. "That isn't in your pack."`);
      return;
    }
    // Equipped items can't be dropped without unequipping first —
    // would otherwise leave the player wielding a phantom blade.
    const eq = player.equipped ?? {};
    const equippedSlots = ['main', 'off', 'head', 'chest', 'hands', 'legs', 'feet', 'cloak', 'amulet', 'ring', 'ring2', 'ring3'] as const;
    const isEquipped = equippedSlots.some((slot) => eq[slot] === item.name);
    if (isEquipped) {
      get().appendLog('arbiter', `The Arbiter taps your hand. "Unequip the ${item.name} first — you can't drop what you're wielding."`);
      return;
    }
    // v2.4.1 (OTA 052) — quest items (Tartarian Cores etc.) are
    // bound to the player until the final act. The Order would
    // hunt the player to the ends of Tartaria for leaving one
    // in the silt. Refuse the drop with an in-character line.
    if (isQuestLockedItem(item)) {
      get().appendLog(
        'arbiter',
        `The Arbiter folds your fingers back over the ${item.name}. "Not this one. It does not leave your pack until the end of the road."`,
      );
      return;
    }
    const dropKey = deps.makeRoomKey(player.currentLocationId, currentScene.microMicroId, player.mapX, player.mapY, player.hubRoomId);
    const dropOne: InventoryItem = { ...item, quantity: 1 };
    // Remove one from player inventory.
    const newInventory = player.inventory
      .map((i) => (i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i))
      .filter((i) => i.quantity > 0);
    set((s) => {
      if (!s.player) return s;
      const room = s.worldMemory.visitedRooms?.[dropKey] ?? {
        firstVisitAt: Date.now(),
        lastVisitAt: Date.now(),
        visitCount: 1,
      };
      // Merge with any existing dropped pile (same name -> bump qty).
      const dropped = [...(room.droppedItems ?? [])];
      const exist = dropped.findIndex((d) => d.name === dropOne.name);
      if (exist >= 0) dropped[exist] = { ...dropped[exist]!, quantity: dropped[exist]!.quantity + 1 };
      else dropped.push(dropOne);
      return {
        player: { ...s.player, inventory: newInventory },
        worldMemory: {
          ...s.worldMemory,
          visitedRooms: {
            ...(s.worldMemory.visitedRooms ?? {}),
            [dropKey]: { ...room, droppedItems: dropped },
          },
        },
      };
    });
    get().appendLog('world', `You drop the ${item.name}. It lies on the ground here.`);
    void get().persist();
  },

  useInventoryItem(itemName) {
    const player = get().player;
    if (!player) return;
    const item = player.inventory.find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0,
    );
    if (!item) {
      get().appendLog('arbiter', `The Arbiter glances at your pack. "I don't see ${withArticle(itemName)} on you."`);
      return;
    }
    // ⚠ OTA-1205 — a Procedure Text's tap-action is READING it. It carries no authored
    // `effect`, so without this branch it fell through the effect router to nothing —
    // the pack's READ button and the typed `read` land on the same teacher.
    if (deps.AT_isProcedureTextName(item.name)) {
      void get().submitPlayerAction(`read ${item.name}`);
      return;
    }
    // OTA 024 — items with a consumable-shaped effect route through
    // the use_relic path REGARDLESS of inventory kind. Aetheric Torch
    // is kind='relic' but carries effect.kind='consumable' with
    // revealScene; without this check, USE just re-equipped the
    // torch to off-hand silently, leaving the playtester with "why
    // can the etheric torch not be used only scrapped or dropped."
    // Now USE fires the effect (revealScene / extendLight / heal /
    // stamina / etc.) and consumes one charge.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolveItemEffect: rie } = require('../../engine/itemEffect');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findExplorationItemByName: feib, findGearByName: fgbn, findMaterialByName: fmbn } = require('../../engine/crafting');
    const fxLookup = rie(item.name, [fgbn, feib, fmbn]);
    if (fxLookup && fxLookup.kind === 'consumable') {
      // Route through the use_relic case — it handles all the
      // consumable sub-effects (heal / stamina / revealScene /
      // reduceCorruption / extendLight) AND consumes one unit.
      get().submitPlayerAction(`use ${item.name}`);
      return;
    }
    // OTA-201 — gate items (Aetheric Vision Lens, Climbing Rope, etc.)
    // also route through use_relic so the OTA-200 "Already at work —
    // keep it on your person" arbiter explanation fires. Without this,
    // pressing USE on the Lens silently fell into the equip branch and
    // tried to equip a non-equippable item.
    if (fxLookup && fxLookup.kind === 'gate') {
      get().submitPlayerAction(`use ${item.name}`);
      return;
    }
    // OTA-912 — a Skyreacher Chart. Applied DIRECTLY (not through the parser,
    // whose item resolution stumbles on the "(N of 5)" name): unlock the great
    // climb + reveal + log the mission + consume one chart.
    if (fxLookup && fxLookup.kind === 'map') {
      get().appendLog('player', `use ${item.name}`);
      deps.unlockGreatClimbFromChart(get, set, item, fxLookup.climbId);
      return;
    }
    // OTA-913 — using an Aether Collection Beacon builds the Beacon Rifle once
    // all five towers are cleared (applied directly, like the chart).
    if (fxLookup && fxLookup.kind === 'beacon') {
      get().appendLog('player', `use ${item.name}`);
      deps.assembleBeaconRifle(get, set);
      return;
    }
    // Consumables → eat (HP recovery + time advance + quantity
    // decrement). Routed through submitPlayerAction so the existing
    // rest-with-resolvedItemId path handles all the state mutations.
    if (item.kind === 'consumable') {
      get().submitPlayerAction(`eat ${item.name}`);
      return;
    }
    // Anything else — torch / compass / locket / relic — gets
    // equipped to the off-hand per playtest spec ("to use it it
    // needs to replace the item in your offhand"). Refuse for
    // items the equipment rules don't let live in 'off'.
    const validSlots = validSlotsForItem(item);
    if (validSlots.includes('off')) {
      get().equipItem(item.name, 'off');
      return;
    }
    // Items that aren't off-hand-eligible — amulets, rings, armor —
    // route to their canonical slot instead so 'use' always does
    // something useful.
    if (validSlots.length > 0) {
      get().equipItem(item.name, validSlots[0]!);
      return;
    }
    get().appendLog('arbiter', `The Arbiter shrugs. "The ${item.name} doesn't have a single obvious 'use' — keep it, gift it, or scrap it."`);
  },

  applyCoating(coatingItemId, weaponId, replaceSlot) {
    const player = get().player;
    if (!player) return;
    const coatItem = player.inventory.find((i) => i.id === coatingItemId);
    const weapon = player.inventory.find((i) => i.id === weaponId);
    if (!coatItem || !weapon) return;
    // Resolve the coating spec off the consumable's catalog effect.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolveItemEffect } = require('../../engine/itemEffect');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findGearByName } = require('../../engine/crafting');
    const fx = resolveItemEffect(coatItem.name, [findGearByName]);
    const spec = fx?.kind === 'consumable' ? fx.coating : undefined;
    if (!spec) {
      get().appendLog('debug', `applyCoating: ${coatItem.name} carries no coating spec`);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isCoatableItem, coatedDisplayName, nextCoatSlot, coatingCapacity } = require('../../engine/weaponCoating');
    // OTA-453 — instance-aware: a FUSED weapon is catalog-absent (its stats live
    // on the instance), so the old name-only isCoatableWeapon always refused it.
    if (!isCoatableItem(weapon)) {
      get().appendLog('world', `You can't coat the ${weapon.name} — a coating needs an edge or a point to carry it. Try a blade, an arrow-arm, or a bolt-caster.`);
      return;
    }
    // OTA-873 — which slot this coat fills. 'coating' = fresh slot 1; 'coating2' =
    // slot 1 full and this is a Crucible-upgraded dual-slot weapon with slot 2 open
    // (adds a SECOND coating rather than replacing); 'replace' = both usable slots
    // full, so it overwrites slot 1.
    const coatSlot: 'coating' | 'coating2' | 'replace' = nextCoatSlot(weapon);
    // OTA-922 — when every usable slot is full, the UI sends WHICH slot to overwrite
    // (a picker), so a coating is never blindly scrubbed off slot 1. Default to slot 1
    // for safety / older callers.
    // OTA-934 — the store validates the caller's slot choice instead of trusting it: a
    // programmatic replaceSlot: 'coating2' on a 1-slot weapon would stamp an illegal
    // dual coat that combat honors (the UI can't send it — its picker only offers
    // slots that exist — but "default to slot 1 for safety" must actually be enforced).
    if (replaceSlot === 'coating2' && coatingCapacity(weapon) < 2) {
      get().appendLog('world', `The ${weapon.name} has no second coating slot to fill.`);
      return;
    }
    const replaceField: 'coating' | 'coating2' = replaceSlot === 'coating2' ? 'coating2' : 'coating';
    const replaced = coatSlot === 'replace' ? (weapon[replaceField] ?? weapon.coating) : null;
    const addedSecond = coatSlot === 'coating2';
    set((s) => {
      if (!s.player) return s;
      const target = s.player.inventory.find((i) => i.id === weaponId);
      if (!target) return s;
      const coatingSpec = { kind: spec.kind, dice: spec.dice, label: spec.label, ...(spec.statBonus ? { statBonus: spec.statBonus } : {}) };
      // The field to stamp: slot 2 only when nextCoatSlot chose it; 'replace' and a
      // fresh coat both write slot 1 (`coating`).
      const coatField: 'coating' | 'coating2' =
        coatSlot === 'coating2' ? 'coating2'
          : coatSlot === 'replace' ? replaceField
            : 'coating';
      let inv: InventoryItem[];
      let equipped = s.player.equipped;
      if (target.quantity > 1) {
        // OTA-800 — the target is a STACK (e.g. a bundle of throwing darts).
        // Stamping the coating on the row would coat ALL N copies for a single
        // vial — a coating dupe (throw/split them and every unit carries it).
        // Peel ONE unit off into its own instance, coat only that, and leave the
        // rest of the stack bare. (A coated instance never re-stacks — grantItem's
        // OTA-363 guard keeps it separate.)
        const coatedId = deps.freshInstanceId('coat');
        inv = s.player.inventory.map((i) => (i.id === weaponId ? { ...i, quantity: i.quantity - 1 } : i));
        inv.push({ ...target, id: coatedId, quantity: 1, coating: coatingSpec });
        // OTA-814 — if the coated weapon was the EQUIPPED one, the peel just left the
        // equipped slot pointing at the uncoated stack remainder — so the on-hit
        // coating resolver (which looks up by equipped.mainId/offId) never fired and
        // the "Now wielding the Burning …" line lied. Re-point the equipped slot(s)
        // to the freshly-coated instance so the weapon you swing actually carries it.
        if (equipped?.mainId === weaponId || equipped?.offId === weaponId) {
          equipped = {
            ...equipped,
            ...(equipped.mainId === weaponId ? { mainId: coatedId } : {}),
            ...(equipped.offId === weaponId ? { offId: coatedId } : {}),
          };
        }
      } else {
        // Single instance — stamp in place (into slot 1 or slot 2 per coatField) so
        // the equipped weapon's id/equip state is preserved.
        inv = s.player.inventory.map((i) => (i.id === weaponId ? { ...i, [coatField]: coatingSpec } : i));
      }
      // Consume one coating unit (drop the stack when it hits 0).
      inv = inv
        .map((i) => (i.id === coatingItemId ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => !(i.id === coatingItemId && i.quantity <= 0));
      return { player: { ...s.player, inventory: inv, equipped } };
    });
    // OTA-873 — show the weapon with BOTH coatings when a second was added / a slot
    // was replaced, so the reward line names the real dual-coat weapon.
    const resultCoatings = addedSecond
      ? { coating: weapon.coating, coating2: { ...spec } }
      : coatSlot === 'replace'
        ? (replaceField === 'coating2'
            ? { coating: weapon.coating, coating2: { ...spec } }
            : { coating: { ...spec }, coating2: weapon.coating2 })
        : { coating: { ...spec }, coating2: weapon.coating2 };
    const display = coatedDisplayName({ name: weapon.name, ...resultCoatings });
    get().appendLog(
      'reward',
      addedSecond
        ? `You work the ${coatItem.name.toLowerCase()} into the weapon's second channel — it now carries TWO coatings. Now wielding the ${display}; both bite on every landing hit (${weapon.coating!.dice} ${weapon.coating!.kind} + ${spec.dice} ${spec.kind}).`
        : replaced
          ? `You scrape off the old ${replaced.label.toLowerCase()} layer and work the ${coatItem.name.toLowerCase()} into the weapon. Now wielding the ${display} — ${spec.dice} ${spec.kind} on every landing hit.`
          : `You work the ${coatItem.name.toLowerCase()} along the weapon. Now wielding the ${display} — ${spec.dice} ${spec.kind} on every landing hit.`,
    );
    // ⚠ OTA-1343 — ACID JOINS THE LORE. Owner: *"we could work acid somehow into
    // the lore"* — the sketch he liked was a vendor topic + an Arbiter line + the
    // flask description. This is the Arbiter line: the FIRST time a character
    // paints an acid coat, the Arbiter says where the bile comes from. Once per
    // save (worldMemory.acidLoreIntroShown), same one-shot pattern as OTA-877.
    if (spec.kind === 'acid' && !get().worldMemory?.acidLoreIntroShown) {
      get().appendLog(
        'arbiter',
        `"Battery bile," the Arbiter says, watching the edge darken. "The old world stored its lightning in acid — jar-batteries taller than a house, vault floors full of them. The flood shorted the lightning out and left the bile keeping for a thousand years. Down here everything is either preserved by the mud or eaten by what leaked into it. Now your blade gets a say in which."`,
      );
      set((s2) => ({ worldMemory: { ...s2.worldMemory, acidLoreIntroShown: true } }));
    }
    // OTA-707 — persist the freshly-painted coating; the action had no explicit save,
    // so a hard-quit before the next auto-persist lost the coating.
    void get().persist();
  },

  applyCoatingToArmor(coatingItemId, armorId, replaceResist) {
    const player = get().player;
    if (!player) return;
    const coatItem = player.inventory.find((i) => i.id === coatingItemId);
    const armor = player.inventory.find((i) => i.id === armorId);
    if (!coatItem || !armor) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolveItemEffect } = require('../../engine/itemEffect');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findGearByName, findArmorByName } = require('../../engine/crafting') as typeof import('../../engine/crafting');
    const fx = resolveItemEffect(coatItem.name, [findGearByName]);
    const spec = fx?.kind === 'consumable' ? fx.coating : undefined;
    if (!spec) { get().appendLog('debug', `applyCoatingToArmor: ${coatItem.name} carries no coating spec`); return; }
    const isArmor = armor.kind === 'armor' || (armor.uniqueStats?.kind === 'armor') || !!findArmorByName(armor.name);
    if (!isArmor) { get().appendLog('world', `You can only work a vial's resist into ARMOR — the ${armor.name} won't hold it.`); return; }
    // engine_Dev — the resist a coating grants is its DAMAGE TYPE, so it matches
    // incoming damage. deps.aggregateArmor adds it to the worn slot; the existing
    // applyArmorResistance combat path then reduces incoming damage of that type.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { coatingDamageType } = require('../../engine/weaponCoating') as typeof import('../../engine/weaponCoating');
    const type = coatingDamageType(String(spec.kind));
    // OTA-873/874 — reject a coating whose damage type no enemy can ever DEAL (so a
    // worked-in resist would match nothing and silently waste the vial). OTA-874 made
    // acid + corruption first-class incoming types, so every current coating family
    // (poison / acid / corruption / electrical / burn / cold) is resistable and passes;
    // this now only guards a hypothetical future coating with no incoming counterpart.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isResistableIncomingType } = require('../../engine/damageTypes') as typeof import('../../engine/damageTypes');
    if (!isResistableIncomingType(type)) {
      get().appendLog('world', `A ${coatItem.name.toLowerCase()} is a pure offensive coating — nothing in the wasteland strikes with ${type}, so armor can't be hardened against it. Work it into a WEAPON instead.`);
      return;
    }
    const already = (armor.addedResists ?? []).map((r) => r.toLowerCase());
    if (already.includes(type.toLowerCase())) {
      get().appendLog('world', `The ${armor.name} already turns aside ${type}. No need to waste another vial on it.`);
      return;
    }
    // Cap worked-in resists so one piece can't become a god-vest. OTA-873 — the
    // Crucible "Upgrade" mode raises THIS piece's cap by resistCapBonus (a second
    // coating channel, the armor parallel to a weapon's 2nd coating slot).
    const ADDED_RESIST_CAP = 3;
    const effectiveCap = ADDED_RESIST_CAP + (armor.resistCapBonus ?? 0);
    // OTA-922 — a FULL piece no longer just refuses. The UI opens a picker and sends
    // which existing resist to strip; honour it here. Without a valid replaceResist
    // (older caller / no pick), keep the refusal.
    const replaceLower = replaceResist?.toLowerCase();
    const willReplace = already.length >= effectiveCap;
    if (willReplace && (!replaceLower || !already.includes(replaceLower))) {
      get().appendLog('world', `The ${armor.name} is already worked with ${already.length} resists (${(armor.addedResists ?? []).join(', ')}). It can't hold another — strip one first, upgrade it at a Crucible, or use a different piece.`);
      return;
    }
    set((s) => {
      if (!s.player) return s;
      const target = s.player.inventory.find((i) => i.id === armorId);
      if (!target) return s;
      // OTA-922 — on a full piece, strip the picked resist first; otherwise just append.
      const withResist = (base: string[]) => {
        const stripped = willReplace && replaceLower ? base.filter((r) => r.toLowerCase() !== replaceLower) : base;
        return [...stripped, type];
      };
      let inv: InventoryItem[];
      if (target.quantity > 1) {
        // OTA-800 — same anti-dupe as applyCoating: peel one piece off the stack
        // so a single vial can't work its resist into all N copies at once.
        inv = s.player.inventory.map((i) => (i.id === armorId ? { ...i, quantity: i.quantity - 1 } : i));
        inv.push({ ...target, id: deps.freshInstanceId('coat'), quantity: 1, addedResists: withResist(target.addedResists ?? []) });
      } else {
        inv = s.player.inventory.map((i) => (i.id === armorId ? { ...i, addedResists: withResist(i.addedResists ?? []) } : i));
      }
      inv = inv
        .map((i) => (i.id === coatingItemId ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => !(i.id === coatingItemId && i.quantity <= 0));
      return { player: { ...s.player, inventory: inv } };
    });
    get().appendLog('reward', willReplace && replaceResist
      ? `You strip the ${replaceResist.toLowerCase()} channel off the ${armor.name} and work the ${coatItem.name.toLowerCase()} in its place. It now turns aside ${type} damage instead — for good, until the piece is lost or destroyed.`
      : `You work the ${coatItem.name.toLowerCase()} into the ${armor.name}. It now turns aside ${type} damage — for good, until the piece is lost or destroyed.`);
    void get().persist();
  },

  scrapInventoryItem(itemName, itemId) {
    const player = get().player;
    if (!player) return;
    // OTA-930 — scrap the EXACT instance the caller picked by its unique id when given
    // (the inventory UI passes it). A player with several same-name items of
    // different durability who selects the worst must break down THAT one — not
    // whichever row sorts first by name. Falls back to name-match for typed commands.
    const item =
      (itemId ? player.inventory.find((i) => i.id === itemId && i.quantity > 0) : null)
      ?? player.inventory.find(
        (i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0,
      );
    if (!item) {
      get().appendLog('arbiter', `The Arbiter glances at your pack. "I don't see ${withArticle(itemName)} on you."`);
      return;
    }
    if (!canScrap(item)) {
      get().appendLog('arbiter', `The Arbiter taps the ${item.name}. "Nothing here to break down — it already IS stock material."`);
      return;
    }
    // OTA-058 — auto-unequip on scrap intent. The pre-OTA refusal
    // ("Unequip the X first — can't scrap what you're wearing") was
    // surprising to a playtester who hit it three times on an
    // Aetheric Locket and reported the item as "stayed in inventory,
    // yielded nothing." It IS the item refusing because it was
    // equipped, but from the player's POV the scrap silently didn't
    // work. Drop the refusal and unequip the relevant slot(s) up
    // front, then proceed with the normal scrap flow.
    //
    // Match slots by ID, not by name — a player can have two Rusted
    // Blades (one equipped, one in pack) and scrap should only clear
    // the slot when the SPECIFIC equipped instance is being broken
    // down. Same name + different id leaves the slot alone.
    const eq = player.equipped ?? {};
    // OTA-796 — the scan was missing 'hands' and 'cloak' (both real equip
    // slots) and never checked ring2/ring3, so scrapping the equipped instance
    // in one of those slots destroyed the inventory row but left the equipped
    // pointer live — the destroyed gear kept granting AC / resists / stats /
    // regen forever (name-based aggregation with catalog fallback). Now every
    // SLOT_ID_KEY slot is covered.
    const equippedSlots = ['main', 'off', 'head', 'chest', 'hands', 'legs', 'feet', 'cloak', 'amulet', 'ring'] as const;
    const occupiedSlots = equippedSlots.filter((s) => {
      const idKey = SLOT_ID_KEY[s];
      return eq[idKey] === item.id;
    });
    if (occupiedSlots.length > 0) {
      for (const slot of occupiedSlots) get().unequipSlot(slot);
    }
    // ring2 / ring3 have no EquipSlot entry, so unequipSlot can't address them —
    // clear the pointer inline and strip the ring's HP bonus (mirror of
    // unequipSlot's bake-out) when the scrapped instance sits there.
    for (const [nameKey, idKey] of [['ring2', 'ring2Id'], ['ring3', 'ring3Id']] as const) {
      if (eq[idKey] === item.id) {
        const ringName = eq[nameKey];
        const hpDelta = -gearHpBonus(ringName);
        set((s) => {
          if (!s.player) return s;
          const newEq = { ...(s.player.equipped ?? {}), [nameKey]: undefined, [idKey]: undefined };
          const newMax = Math.max(1, (s.player.hpMax ?? 1) + hpDelta);
          return { player: { ...s.player, equipped: newEq, hpMax: newMax, hp: hpAfterMaxChange(s.player.hp, hpDelta, newMax) } };
        });
      }
    }
    // OTA 23-014 — salvage now rolls for success. Base 70% + INT/DEX
    // modifiers. The item is CONSUMED on failure either way; the
    // player can't just keep clicking until they get materials.
    // High INT/DEX characters get one re-roll per attempt.
    // OTA-058 — failures now grant the MIN-TIER output (1 of the
    // first material from scrapOutputFor) instead of nothing. The
    // anti-spam intent stays — you can't re-roll the same item for
    // a better yield — but no scrap is ever a wasted click.
    const scene = get().currentScene;
    const scrapStats = effectiveStats(
      get().player!,
      weatherStatModifiers(scene?.weather ?? null, deps.playerArmorResistKinds(player)),
    );
    const successP = scrapSuccessChance(scrapStats.intelligence, scrapStats.dexterity);
    let rolled = Math.random() < successP;
    let usedSecondChance = false;
    if (!rolled && scrapHasSecondChance(scrapStats.intelligence, scrapStats.dexterity)) {
      usedSecondChance = true;
      rolled = Math.random() < successP;
    }
    const fullOutput = scrapOutputFor(item);
    let output: typeof fullOutput | null;
    if (rolled) {
      output = fullOutput;
    } else {
      // Min-tier consolation: one unit of the first material from the
      // full output. e.g. a metal blade fails → 1 Scrap Metal. A
      // cloth cape fails → 1 Patched Cloth.
      const first = fullOutput.grants[0];
      if (first) {
        const consolation = { name: first.name, quantity: 1 };
        output = { grants: [consolation], summary: consolation.name };
      } else {
        // scrapOutputFor always returns ≥1 grant via its fallback, so
        // this branch is unreachable; null-guard for safety.
        output = null;
      }
    }
    // OTA 012 — route grants through grantItem so ITEM_CAPS apply.
    // Was a manual merge that ignored caps: scrap an item yielding
    // 8 Sticks landed all 8 in pack despite the 6 cap. Now overflow
    // is dropped per item with a "pack is already full" line.
    set((s) => {
      if (!s.player) return s;
      let newInventory: InventoryItem[] = s.player.inventory
        .map((i) => (i.id === item.id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0);
      if (output) {
        for (const grant of output.grants) {
          const scrapLookup = lookupCraftedItem(grant.name);
          const stamp: InventoryItem = stampDurability({
            id: `scrap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: grant.name,
            kind: scrapLookup.kind,
            rarity: scrapLookup.rarity,
            quantity: grant.quantity,
            tags: scrapLookup.tags,
          });
          const result = grantItem(newInventory, stamp);
          newInventory = result.inventory;
          if (result.dropped > 0) {
            // Buffered side-effect: we're still inside the set()
            // closure, so defer the log so it fires after the state
            // settles. Use a queue via void Promise.resolve().then.
            const droppedQty = result.dropped;
            void Promise.resolve().then(() =>
              get().appendLog(
                'world',
                `${grant.name} x${droppedQty} from the scrap won't fit — your pack is already full of them.`,
              ),
            );
          }
        }
      }
      return { player: { ...s.player, inventory: newInventory } };
    });
    if (rolled && output) {
      // Clean salvage — full output landed.
      if (usedSecondChance) {
        get().appendLog(
          'world',
          `The first pass on the ${item.name} crumbles in your hands — but your training kicks in. You stop, breathe, change angle, and try again.`,
        );
      }
      get().appendLog('world', `You break the ${item.name} down. ✦ Recovered: ${output.summary}.`);
      // OTA 23-014 — train INT on a successful salvage. Engineering
      // hands learn from clean disassembly, not from wrecking it.
      // OTA-058 — only full-success rolls train INT, not the
      // consolation grant on a failed roll.
      const liveScrapper = get().player;
      if (liveScrapper) {
        const tr = trainStat(liveScrapper, 'intelligence', true);
        set((s) => (s.player ? { player: tr.player } : s));
        if (tr.leveled) {
          get().appendLog(
            'reward',
            `✦ Your eye for parts sharpens. +1 INT (${deps.statNowClause(get().player, 'intelligence', tr.leveled.to)}).`,
          );
        }
      }
    } else if (output) {
      // OTA-058 — failure roll with the min-tier consolation grant.
      // Narrate the messy break + the salvaged remnant in one beat
      // so the player sees both the failure flavor AND the small yield.
      get().appendLog('world', pickScrapFailureLine(item.name));
      get().appendLog('world', `✦ Salvaged from the wreckage: ${output.summary}.`);
    } else {
      // Belt-and-suspenders branch — scrapOutputFor always returns
      // ≥1 grant via fallback, but if a future change ever breaks
      // that, surface the original failure narration.
      get().appendLog('world', pickScrapFailureLine(item.name));
    }
    void get().persist();
  },

  repairInventoryItem(itemId) {
    const player = get().player;
    if (!player) return;
    const item = player.inventory.find((i) => i.id === itemId);
    if (!item) {
      get().appendLog('arbiter', `The Arbiter glances at your pack. "I don't see that piece on you anymore."`);
      return;
    }
    if (!item.durability) {
      get().appendLog('arbiter', `The Arbiter taps the ${item.name}. "Nothing to repair — this one doesn't wear."`);
      return;
    }
    // Use the coated display name in every line so a repaired coated weapon
    // reads as itself ("Acid-Etched Rusty Shortbow") — the coating survives the
    // repair (the instance is restored in place), so the name must too.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const display = require('../../engine/weaponCoating').coatedDisplayName(item) as string;
    if (item.durability.current >= item.durability.max) {
      get().appendLog('arbiter', `The Arbiter looks the ${display} over. "Already whole. Don't waste materials."`);
      return;
    }
    const cost = repairCostMaterials(item);
    if (cost.length === 0) {
      get().appendLog('arbiter', `The Arbiter taps the ${display}. "No recipe to mend this one. Sell it on or scrap for parts."`);
      return;
    }
    // OTA-205 — substitution-aware shortage check. Previously the
    // repair handler required exact-name matches on the cost list
    // (Patched Cloth, Scrap Metal, etc.). Now it routes through
    // missingIngredientsList / consumeIngredientsList so the player
    // can spend Cloth Scrap / Spider Silk / Mud Cloth for the
    // Patched Cloth call, Brass Sextant / Bent Nails for Scrap Metal,
    // etc. Same canonical-first + substitute-tag pass as crafting.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const craftingMod = require('../../engine/crafting');
    const missing = craftingMod.missingIngredientsList(cost, player.inventory) as Array<{ name: string; quantity: number }>;
    if (missing.length > 0) {
      const shortages = missing.map((m) => `${m.name} ${m.quantity} short`);
      get().appendLog(
        'arbiter',
        `The Arbiter eyes the ${display}. "Short on stock: ${shortages.join(', ')}. Gather, then return."`,
      );
      return;
    }
    // Narrate substitutions BEFORE the drain so the player understands
    // why their Cloth Scrap disappeared in service of the repair.
    const subs = craftingMod.previewSubstitutionsList(cost, player.inventory) as Array<{ ingredient: string; substitute: string; quantity: number }>;
    if (subs.length > 0) {
      const list = subs.map((s) =>
        s.quantity > 1
          ? `${s.quantity}× ${s.substitute} → ${s.ingredient}`
          : `${s.substitute} → ${s.ingredient}`,
      ).join(', ');
      get().appendLog(
        'arbiter',
        `The Arbiter nods. "Patched in: ${list}."`,
      );
    }
    // Consume materials + restore durability.
    set((s) => {
      if (!s.player) return s;
      const drained = craftingMod.consumeIngredientsList(s.player.inventory, cost) as InventoryItem[];
      const newInventory = drained.map((i) =>
        i.id === itemId && i.durability
          ? { ...i, durability: { ...i.durability, current: i.durability.max } }
          : i,
      );
      return { player: { ...s.player, inventory: newInventory } };
    });
    const costSummary = cost.map((c) => c.quantity > 1 ? `${c.name} x${c.quantity}` : c.name).join(', ');
    get().appendLog('world', `You repair the ${display}. Back to full. (spent: ${costSummary})`);
    void get().persist();
  },

  salvageAllAmbient(nouns) {
    const player = get().player;
    const scene = get().currentScene;
    if (!player || !scene) return;
    const blocker = deps.activeEnemy(scene);
    if (blocker) {
      get().appendLog('arbiter', `The Arbiter shakes their head. "Not while ${blocker.name} is on you."`);
      return;
    }
    const harvestRoomKey = deps.makeRoomKey(
      player.currentLocationId,
      scene.microMicroId,
      player.mapX,
      player.mapY,
      player.hubRoomId,
    );

    const narrationLines: string[] = [];
    /** Aggregated reward totals across the whole bulk. Keyed by
     *  item name; rarity sticks to the first roll's rarity since
     *  salvage pools are rarity-stable per item. */
    const itemTotals = new Map<string, { quantity: number; rarity: string }>();
    let tcGained = 0;
    let staminaSpent = 0;
    let hoursAdded = 0;
    const consumedNouns: string[] = [];
    const skippedAlready: string[] = [];
    // ⚠ OTA-1231 — its OWN bucket, not skippedAlready. These nouns were not
    // "already worked over" — they were deliberately left intact because they are
    // things the player can pick up, and saying otherwise would be the exact class
    // of lie this project keeps hunting: a message that describes a state the game
    // is not in. They get their own line, which names the verb that DOES work.
    const skippedTakeable: string[] = [];
    // ⚠⚠ OTA-1236 — ITS OWN BUCKET AGAIN, for the nouns that carry a next step.
    // Owner: *"I don't like that salvage all can bury the dog quest."* It could,
    // and this is measured rather than argued: TEN of the twenty dog-rescue hook
    // nouns match a salvage pool — chain, wagon, wagon wheel, overturned wagon,
    // cellar door, trapdoor, buried structure, snare pit, snare, trapper camp,
    // trap. Salvage writes `searchedAmbientNouns` and every picker reads it, so
    // one tap pried the chain apart and **the rescue noun left the investigate
    // list entirely.** The quest stayed typeable and stopped being tappable, which
    // is the worse failure: nobody types a noun the game has stopped showing them.
    const skippedLead: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isLeadNoun: isBulkLeadNoun } = require('../../engine/storyNouns') as typeof import('../../engine/storyNouns');
    const bulkLeadCtx = {
      hooks: scene.hooks ?? [],
      // ⚠ The same conditions the engine's own rescue dispatch checks. Once the
      // player HAS a dog, a snare is just a snare again — protecting it forever
      // would keep scrap out of their hands for a quest that already happened.
      rescueEligible: !get().player?.dog && !get().worldMemory.pendingDogOnboarding,
    };
    // 2026-05-25 OTA-037 — track nouns that the modal surfaced but
    // rollSalvagePool didn't recognize. Previously these were swallowed
    // silently, so a SALVAGE ALL where every chip was unmatched
    // produced ZERO log output (the bug the playtester reported when
    // the button "didn't do anything"). We now name them in a debug
    // breadcrumb and emit a player-visible fallback so the button
    // never reads as broken.
    const unmatchedNouns: string[] = [];
    // 2026-05-25 OTA-040 — track collectable fragments granted in this
    // bulk so the loop's player.collectables snapshot stays accurate
    // for subsequent fragment substitution rolls. Without it, hitting
    // 8% twice in one SALVAGE ALL would risk granting the same fragment
    // twice (grantCollectableFragment is silent-dedup but we'd waste
    // the roll).
    const grantedFragmentIds: string[] = [];
    let liveInv: InventoryItem[] = player.inventory.map((i) => ({ ...i }));

    for (const noun of nouns) {
      const harvestLowered = noun.toLowerCase();
      // Skip nouns already worked over this room visit. Don't even
      // narrate — the player tapped SALVAGE ALL so a deluge of
      // "already worked over" lines would just be noise.
      const harvestPrior = get().worldMemory.visitedRooms?.[harvestRoomKey];
      const alreadyDoneFromPrior = deps.nonClimbMarkers(harvestPrior?.searchedAmbientNouns).some(
        (n) => n === harvestLowered || harvestLowered.includes(n) || n.includes(harvestLowered),
      );
      const alreadyDoneFromBatch = consumedNouns.some(
        (n) => n === harvestLowered || harvestLowered.includes(n) || n.includes(harvestLowered),
      );
      if (alreadyDoneFromPrior || alreadyDoneFromBatch) {
        skippedAlready.push(noun);
        continue;
      }

      // ⚠⚠ OTA-1231 — SALVAGE ALL NEVER SCRAPS SOMETHING YOU COULD HAVE POCKETED.
      // Owner: *"salvage can kill items in take."* It could, and the overlap is not
      // theoretical — measured across the catalog and the salvage pools:
      //     Aetheric Torch   takeable ✓  salvage pool ✓
      //     Rusty Shortbow   takeable ✓  salvage pool ✓
      //     Small Rock       takeable ✓  salvage pool ✓
      //     lantern          takeable ✓  salvage pool ✓ (and offered as a chip)
      // Salvage writes `searchedAmbientNouns`; TAKE reads it. So one tap of SALVAGE
      // ALL turned a real item lying on the ground into two Aether Dust and removed
      // it from the take list — silently, in a batch the player fired at the
      // scenery.
      //
      // ⚠ A TYPED `salvage lantern` IS STILL HONOURED, and that distinction is the
      // whole rule: breaking down an item you can see is a legitimate choice, made
      // deliberately, one noun at a time. A bulk sweep is not that choice — it is
      // aimed at the room's furniture, and it must not quietly spend the loot.
      if (findCatalogItem(noun) !== null) {
        skippedTakeable.push(noun);
        continue;
      }

      // ⚠⚠ OTA-1236 — AND NEVER THE NOUN THE STORY IS ATTACHED TO. A bulk sweep is
      // aimed at the room's furniture by definition; it is not the place to spend
      // the one thing here that has a next step on it. A typed `salvage chain` is
      // still honoured — deliberately breaking the dog's chain is the player's call
      // to make, one noun at a time — exactly the distinction OTA-1231 drew for
      // takeables.
      if (isBulkLeadNoun(noun, bulkLeadCtx)) {
        skippedLead.push(noun);
        continue;
      }

      // 2026-05-25 OTA-040 — collectable substitution per noun. Same
      // 8% biome-gated chance the single-tap salvage path uses. When
      // hit, replaces the noun's normal pool roll with a fragment
      // grant; narration is queued into narrationLines so it lands
      // alongside the other per-noun lines (haul block stays at the
      // bottom of the log).
      const liveOwned = [...(player.collectables ?? []), ...grantedFragmentIds];
      const bulkFragId = pickFragmentForBiome(
        liveOwned,
        scene.location.tags ?? [],
      );
      if (bulkFragId) {
        staminaSpent += deps.STAMINA_COSTS.skillCheck;
        hoursAdded += 0.25;
        narrationLines.push(deps.pickFragmentSalvageLine(noun));
        get().grantCollectableFragment(bulkFragId);
        grantedFragmentIds.push(bulkFragId);
        consumedNouns.push(harvestLowered);
        continue;
      }

      const outcome = deps.ledgeredSalvage(get, set, noun);
      if (!outcome) {
        // No pool matched. Track for the fallback emit + breadcrumb
        // so the player doesn't see a silent no-op.
        unmatchedNouns.push(noun);
        continue;
      }

      // Per-noun stamina + time tick (same as single-tap salvage).
      staminaSpent += deps.STAMINA_COSTS.skillCheck;
      hoursAdded += 0.25;

      if (outcome.kind === 'nothing') {
        narrationLines.push(pickScrapFailureLine(noun));
        consumedNouns.push(harvestLowered);
        continue;
      }
      if (outcome.kind === 'material' && outcome.itemName) {
        narrationLines.push(outcome.line);
        const itemCat = resolveLootItem(outcome.itemName, outcome.rarity);
        const qty = ('quantity' in outcome && typeof outcome.quantity === 'number')
          ? outcome.quantity
          : 1;
        const newItem: InventoryItem = stampDurability({
          id: `salvage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: outcome.itemName,
          kind: itemCat.kind === 'weapon' ? 'weapon' : itemCat.kind === 'armor' ? 'armor' : itemCat.kind,
          rarity: outcome.rarity ?? 'Common',
          quantity: qty,
          tags: itemCat.tags,
        });
        const grantResult = grantItem(liveInv, newItem);
        liveInv = grantResult.inventory;
        const accepted = grantResult.accepted;
        if (accepted > 0) {
          const prev = itemTotals.get(outcome.itemName);
          itemTotals.set(outcome.itemName, {
            quantity: (prev?.quantity ?? 0) + accepted,
            rarity: prev?.rarity ?? (outcome.rarity ?? 'Common'),
          });
          // OTA-078 — only consume the noun when the grant
          // actually landed. Pre-OTA-078 the consume push was
          // unconditional, so pack-full salvage-all would
          // narrate "found a X but your pack is full" AND lock
          // the chip out forever. Now: pack-full keeps the noun
          // workable so the player can drop something + retry.
          consumedNouns.push(harvestLowered);
        } else {
          narrationLines.push(
            `Your pack is too full to take the ${outcome.itemName.toLowerCase()} from the ${noun}. Drop something and try again.`,
          );
          // Don't push to consumedNouns — chip remains workable.
        }
        continue;
      }
      // rollSalvagePool only produces 'material' or 'nothing' —
      // no TC, no hooks. Players who want those paths can re-tap
      // an individual chip which routes through the full salvage
      // handler (including rollAreaSearch fallback).
    }

    // Commit aggregated state changes in one set() so the UI
    // reflects everything in lockstep.
    set((s) => {
      if (!s.player) return s;
      const advanced = deps.advanceTime(deps.spendStamina({ ...s.player, inventory: liveInv, tc: s.player.tc + tcGained }, staminaSpent), hoursAdded);
      return { player: advanced };
    });
    // Mark all consumed nouns as searched.
    if (consumedNouns.length > 0) {
      set((s) => {
        const room = s.worldMemory.visitedRooms?.[harvestRoomKey] ?? {
          firstVisitAt: Date.now(),
          lastVisitAt: Date.now(),
          visitCount: 1,
        };
        const prevSearched = room.searchedAmbientNouns ?? [];
        const merged = Array.from(new Set([...prevSearched, ...consumedNouns]));
        // OTA-079 — also mark each consumed noun's OTA-071+
        // table entry as consumed, mirroring the single-tap
        // salvage path. Without this, bulk SALVAGE ALL leaves
        // the table entries un-consumed and the next per-noun
        // INVESTIGATE re-rolls a fresh outcome (double-dip).
        const prevTable = room.roomInvestigationTable;
        let updatedTable = prevTable;
        if (prevTable) {
          let touched = false;
          for (const noun of consumedNouns) {
            const entry = prevTable[noun];
            if (entry && !entry.consumed) {
              if (!touched) {
                updatedTable = { ...prevTable };
                touched = true;
              }
              updatedTable![noun] = {
                ...entry,
                consumed: true,
                consumedAt: Date.now(),
                result: entry.result ?? {
                  kind: 'item',
                  detail: 'salvage',
                  line: entry.loreLine ?? '',
                },
              };
            }
          }
        }
        return {
          worldMemory: {
            ...s.worldMemory,
            visitedRooms: {
              ...(s.worldMemory.visitedRooms ?? {}),
              [harvestRoomKey]: {
                ...room,
                searchedAmbientNouns: merged,
                ...(updatedTable !== prevTable
                  ? { roomInvestigationTable: updatedTable }
                  : {}),
              },
            },
          },
        };
      });
    }

    // Emit the narration block in order.
    for (const line of narrationLines) {
      get().appendLog('world', line);
    }
    // One "already worked over" summary line for the skipped nouns,
    // so the player isn't confused about why they didn't fire.
    if (skippedAlready.length > 0) {
      const names = skippedAlready.slice(0, 4).join(', ');
      const overflow = skippedAlready.length > 4 ? ` and ${skippedAlready.length - 4} more` : '';
      get().appendLog('world', `Already worked over: ${names}${overflow}.`);
    }
    // ⚠ OTA-1231 — and the honest line for the ones left whole on purpose. It names
    // TAKE, because that is the verb that works on them, and it says they are still
    // there — a player who tapped SALVAGE ALL and saw nothing about these would
    // reasonably assume they were gone.
    if (skippedTakeable.length > 0) {
      const names = skippedTakeable.slice(0, 4).join(', ');
      const overflow = skippedTakeable.length > 4 ? ` and ${skippedTakeable.length - 4} more` : '';
      get().appendLog('world', `Left whole — worth more in your pack than in pieces: ${names}${overflow}. (TAKE them.)`);
    }
    // ⚠⚠ OTA-1236 — and the lead says so LOUDLY, on the arbiter channel, because
    // this is the one line in a bulk salvage that is a next step rather than a
    // receipt. Owner: *"the next step is right there to see."*
    if (skippedLead.length > 0) {
      const names = skippedLead.slice(0, 3).join(', ');
      const overflow = skippedLead.length > 3 ? ` and ${skippedLead.length - 3} more` : '';
      get().appendLog(
        'arbiter',
        `✦ Left untouched — there is something here worth understanding first: ${names}${overflow}. (INVESTIGATE.)`,
      );
    }
    // Emit the aggregated reward summary as the last block.
    if (itemTotals.size > 0 || tcGained > 0) {
      // One header line so the haul reads as one event, not a
      // scattering of single rewards.
      get().appendLog('reward', `✦ Salvage haul:`);
      for (const [name, total] of itemTotals.entries()) {
        const qtyLabel = total.quantity > 1 ? ` x${total.quantity}` : '';
        get().appendLog('reward', `    • ${name}${qtyLabel} (${total.rarity})`);
      }
      if (tcGained > 0) {
        get().appendLog('reward', `    • +${tcGained} TC`);
      }
    } else if (consumedNouns.length > 0) {
      get().appendLog('world', `Nothing carried over from this round of salvage.`);
    }
    // 2026-05-25 OTA-037 — fallback so SALVAGE ALL never reads as
    // broken. If nothing was consumed AND nothing was skipped AND
    // nothing was unmatched, the modal handed us an empty list —
    // tell the player. If everything was unmatched, surface that
    // explicitly + persist a breadcrumb naming the nouns so we can
    // add the missing pools without a repro.
    // OTA-840 [never-fail-silently] — on a MIXED batch (some nouns broke down, some
    // matched no pool) the unmatched ones used to leave only a 'debug' breadcrumb —
    // the player saw the successful loot but never learned the rest yielded nothing.
    // Surface them whenever there WAS other output; the all-empty case below still
    // owns the nothing-at-all batch.
    const hadOtherOutput =
      narrationLines.length > 0 || skippedAlready.length > 0 || skippedTakeable.length > 0
      || skippedLead.length > 0   // ⚠ OTA-1236 — a lead line IS output; without this a
                                  // lead-only batch falls to the "button did nothing" path.
      || itemTotals.size > 0 || tcGained > 0;
    if (unmatchedNouns.length > 0 && hadOtherOutput) {
      get().appendLog(
        'world',
        `You look the ${unmatchedNouns.slice(0, 3).join(', ')} over and find nothing your tools can break down here.`,
      );
    }
    if (
      narrationLines.length === 0
      && skippedAlready.length === 0
      && skippedTakeable.length === 0
      && skippedLead.length === 0
      && itemTotals.size === 0
      && tcGained === 0
    ) {
      if (unmatchedNouns.length > 0) {
        get().appendLog(
          'world',
          `You look the ${unmatchedNouns.slice(0, 3).join(', ')} over and find nothing your tools can break down here.`,
        );
        void persistEntry(
          makeEntry(
            'debug',
            `salvageAllAmbient: no pool matched for ${unmatchedNouns.length} noun(s) — ${unmatchedNouns.join(', ')}. Add pools in app/engine/salvagePool.ts so SALVAGE ALL produces output.`,
          ),
        );
      } else if (nouns.length === 0) {
        get().appendLog('world', `Nothing here to salvage.`);
      } else {
        // Shouldn't reach — every non-matched noun is in unmatchedNouns.
        // Defensive belt so the player never sees a silent button.
        get().appendLog('world', `Nothing here to salvage.`);
      }
    }
    void get().persist();
  },
});
