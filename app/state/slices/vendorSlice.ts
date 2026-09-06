/**
 * OTA-1399 — SLICE 8a OF THE gameStore SPLIT: the vendor counter.
 *
 * The four things that happen across a trader's table: buy, sell, pay for a
 * crucible fusion, pay for a repair. 666 lines.
 *
 * ⚠⚠ THE PLAN SAID ONE SLICE. MEASURING SAID THREE, AND THAT IS THE SIXTH TIME
 * IN EIGHT SLICES THAT MEASURING HAS CORRECTED THE PLAN.
 *
 * Slice 8 was "vendor / inventory / crafting, ~40 actions, ~2,500 lines". Taken
 * method by method it is 19 actions and 2,233 lines, and the dependency sets
 * separate almost perfectly:
 *
 *     vendor     666 lines,  8 module symbols
 *     inventory 1306 lines, 19 module symbols
 *     crafting   261 lines,  4 module symbols
 *
 *     inventory ∩ crafting = ∅
 *     vendor ∩ inventory   = 2   (deps.freshInstanceId, deps.statNowClause)
 *     vendor ∩ crafting    = 2   (deps.recordTitleProgress, slotOfEquippedId)
 *
 * Slice 3 established the test: when two groups share no unexported dependency,
 * they are two jobs that happened to be typed near each other, and moving them
 * as one lump produces a slice that needs both sets and explains neither. Here
 * the overlaps are two shared utilities out of eight, nineteen and four — near
 * enough to zero that the same conclusion holds, and each file's deps object is
 * an honest readout of what its OWN job is coupled to rather than an average.
 *
 * ⚠ NO MUTABLE STATE, in any of the three. Nothing was forced to travel, so the
 * compiler had nothing to refuse — the same property that made slice 4 the
 * largest and mechanically the safest move. What DID travel is the one knob only
 * this file reads: `FENCE_STOLEN_CUT`, what a fence pays for stolen goods.
 *
 * ⚠ WHAT DID NOT CHANGE: four bodies, same code, same order, same comments. The
 * suites that covered buying, selling, fencing, repair pricing and the vendor
 * crucible before the move cover them unchanged after.
 */
import type { InventoryItem } from '../../engine/types';
import { recordNpcDealing, getRelation } from '../../engine/npcMemory';
import { npcRegard, regardPriceMult } from '../../engine/npcMemory';
import { decayedMenace, menacePriceMult } from '../../engine/menace';
import { profileOf, tideStage, tidePriceMultiplier } from '../../engine/pressure';
import { pick } from '../../engine/rng';
import { grantItem } from '../../engine/inventory';
import { lookupCraftedItem, RECIPES, findDogGearByName, type Recipe } from '../../engine/crafting';
import { trainStat } from '../../engine/statTraining';
import { sellPriceFor, isUnsellable, applySellCaps, buyBackAskFor } from '../../engine/sellPrice';
import { vendorPriceMod } from '../../engine/factionRapport';
import { SLOT_LABEL, effectiveStats, equippedInstanceIds, RING_ID_KEYS } from '../../engine/equipment';
import { canScrap } from '../../engine/scrapEngine';
import { stampDurability, repairCost, repairItem } from '../../engine/durability';
import { WEAPONS, ARMOR, GEAR, MATERIALS, AMULETS, RINGS } from '../../engine/crafting';
import { canonicalFactionId, applyRepChange, getStanding, BUY_REP_TC_PER_STANDING } from '../../engine/factions';
import { canonicalItemKind, canonicalItemTags } from '../../engine/crafting';
import { canonicalCellOf } from '../../engine/worldMap';
// ⚠ SHARED BY TWO SLICES AND NOTHING ELSE, so it moved DOWN rather than being
// injected twice. It is a pure lookup over SLOT_ID_KEY, which app/engine/equipment.ts
// already owns — so that is where it went, beside the table it indexes.
import { slotOfEquippedId } from '../../engine/equipment';

/**
 * ⚠ `import type * as` is fully erased at compile time, so this is NOT a runtime
 * cycle. It lets every dep below be typed `typeof Store.fn`, which means their
 * signatures cannot drift from the real functions: change one in gameStore and
 * this file stops compiling rather than silently accepting the wrong shape.
 */
import type * as Store from '../gameStore';

type GameStore = Store.GameStore;
type SetState = (
  partial: Partial<GameStore> | ((s: GameStore) => Partial<GameStore>),
) => void;


export interface VendorSlice {
  buyFromVendor: (itemName: string, qty?: number) => void;
  /** ⚠ OTA-1481 — `units` sells N of the stack as ONE transaction: one state
   *  write, one log line, one ledger entry, one persist. The buy side has done
   *  quantity since arb92; the sell side was left looping the screen-side, and
   *  a 155-coin dump was 155 full persists — the owner's 2355ms JS stall. */
  sellToVendor: (itemName: string, itemId?: string, opts?: { social?: boolean; units?: number }) => void;
  useVendorCrucible: () => void;
  repairWithVendor: (itemName: string) => void;
}

export interface VendorSliceDeps {
  SKYREACHER_CHART_NAMES: typeof Store.SKYREACHER_CHART_NAMES;
  freshInstanceId: typeof Store.freshInstanceId;
  logRepChanges: typeof Store.logRepChanges;
  recordTitleProgress: typeof Store.recordTitleProgress;
  statNowClause: typeof Store.statNowClause;
  vendorNpcId: typeof Store.vendorNpcId;
}
/** OTA-1083 — what a fence pays for stolen goods, as a fraction of the honest
 *  sell-back. Deep by design: they carry the risk of holding hot goods, and
 *  the cut is what keeps steal-and-fence from beating honest selling. */
const FENCE_STOLEN_CUT = 0.4;

export const createVendorSlice = (
  set: SetState,
  get: () => GameStore,
  deps: VendorSliceDeps,
): VendorSlice => ({
  buyFromVendor(itemName, qty) {
    const state = get();
    const scene = state.currentScene;
    const player = state.player;
    if (!player) return;
    // OTA-840 [never-fail-silently] — a buy fired with no vendor present (queued action,
    // stale/dismissed vendor screen) used to no-op in silence. Say so.
    if (!scene?.vendor) { get().appendLog('system', "There's no one here to trade with."); return; }
    // arb166 — no trading mid-fight (defense-in-depth behind the hidden vendor
    // banner: the 'buy from X' text command still parses during combat).
    if (scene.enemies.length > 0) {
      get().appendLog('system', "Not while you're in a fight — deal with the threat first.");
      return;
    }
    // Tour mode — Irma is a demo vendor injected for the intro walkthrough.
    // No transactions: stops the player from cheesing the game by buying
    // out the armory before play actually starts.
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — purchases disabled while the tutorial is running.');
      return;
    }

    // ⚠ OTA-1195 — PROCEDURE TEXTS (PUNCHLIST P16). Buying one TEACHES the technique; it
    // never mints an item. This sits beside the OTA-726 recipe branch and works the same
    // way for the same reason: what you are buying is knowledge, and a physical book would
    // need a catalog row, a `use` handler and a read path before it taught anything —
    // three more places for the loop to end in nothing.
    {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AT = require('../../engine/aetherTechniques') as typeof import('../../engine/aetherTechniques');
      const tech = AT.findTechniqueByTextName(itemName);
      if (tech) {
        const rowName = AT.techniqueTextName(tech);
        // ⚠ The vendor must actually be OFFERING it. Without this, `buy procedure text:
        // resonance cascade` would teach a Legendary technique at any stall in the world,
        // which deletes the rapport gate that is the whole acquisition design.
        const row = scene.vendor.offers.find((o) => o.itemName.toLowerCase() === rowName.toLowerCase());
        if (!row) {
          get().appendLog('system', `${scene.vendor.name} doesn't carry the ${tech.name} procedure.`);
          return;
        }
        if ((player.knownTechniques ?? []).includes(tech.id)) {
          get().appendLog('system', `You already carry the ${tech.name} in your hands.`);
          return;
        }
        if (player.tc < row.price) {
          get().appendLog('system', `${scene.vendor.name} rests a hand on the folder. "The ${tech.name} runs ${row.price} TC. It is not a thing I discount."`);
          return;
        }
        set((s) => (s.player ? {
          player: {
            ...s.player,
            tc: s.player.tc - row.price,
            knownTechniques: [...(s.player.knownTechniques ?? []), tech.id],
          },
        } : s));
        get().appendLog(
          'reward',
          `Bought the ${tech.name} procedure for ${row.price} TC. ✦ Technique learned — type \`channel ${tech.name.toLowerCase()}\`.`
          + ` It costs Aetheric fuel and ${tech.baseDose} corruption a run, and it will cost you your turn in a fight.`,
        );
        void get().persist();
        return;
      }
    }

    // OTA-709 — RECIPE offers. A vendor teaches a small, stable slice of the
    // rare/legendary recipes you haven't learned yet (a gold sink + a reliable,
    // pricey way to get a working you never stumbled on). `buy <recipe name>`
    // routes here before the normal item lookup. Teaches into knownRecipes —
    // you still have to gather the materials and forge it.
    {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const rd = require('../../engine/recipeDiscovery') as typeof import('../../engine/recipeDiscovery');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { RECIPES } = require('../../engine/crafting') as typeof import('../../engine/crafting');
      const recipeOffers = rd.vendorRecipeOffers(RECIPES, player.knownRecipes, rd.vendorSeed(scene.vendor.name));
      const rOffer = recipeOffers.find((o) => o.result.toLowerCase() === itemName.toLowerCase());
      if (rOffer) {
        if ((player.knownRecipes ?? []).includes(rOffer.result)) {
          get().appendLog('system', `You already know the ${rOffer.result} working.`);
          return;
        }
        if (player.tc < rOffer.price) {
          get().appendLog('system', `${scene.vendor.name} taps the schematic. "The ${rOffer.result} working runs ${rOffer.price} TC. Come back when your purse is heavier."`);
          return;
        }
        set((s) => (s.player ? { player: { ...s.player, tc: s.player.tc - rOffer.price, knownRecipes: [...(s.player.knownRecipes ?? []), rOffer.result] } } : s));
        get().appendLog('reward', `Bought the ${rOffer.result} working for ${rOffer.price} TC. ✦ Recipe learned (${lookupCraftedItem(rOffer.result).rarity})! Open Crafting to forge it — you'll still need the materials.`);
        void get().persist();
        return;
      }
    }

    const offer = scene.vendor.offers.find((o) => o.itemName.toLowerCase() === itemName.toLowerCase());
    // OTA-840 [never-fail-silently] — asking for an item the vendor doesn't stock
    // (stale row, sold-out, an LLM-rephrased buy) was the one silent exit here.
    if (!offer) { get().appendLog('system', `${scene.vendor.name} doesn't carry any ${itemName}.`); return; }
    // OTA 039 — corruption-tier price markup. Corrupted players pay
    // +15%, Hollowed +30%; vendors notice the aether on you.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { corruptionTierOf, corruptionPriceMultiplier } = require('../../engine/corruption');
    const tier = corruptionTierOf(player.corruption ?? 0);
    const mult = corruptionPriceMultiplier(tier);
    // OTA-805 — Charisma-scaled faction DISCOUNT, gated by rapport. Once you've done
    // this faction's rapport quest, its vendors knock up to 20% off (2%/CHA above
    // 10). Multiplies in beside the corruption markup, same as any per-context price
    // modifier. 0 for a neutral vendor or a faction you haven't earned.
    const buyDiscount = vendorPriceMod(
      effectiveStats(player).charisma,
      player.completedFactionQuestIds,
      scene.vendor.faction,
      // OTA-1341 — the standing ladder reaches the counter: loyalty discounts,
      // hostility marks up. Same read the VendorScreen display makes.
      scene.vendor.faction ? getStanding(player.factionStanding ?? [], scene.vendor.faction) : 0,
    );
    // OTA-849 [tides get teeth] — the vendor's faction fortunes move prices. An
    // ascendant faction's traders charge a confidence premium; a waning faction's
    // discount to move goods before they lose the ground to hold them. ±20% at the
    // tide extremes, multiplied in beside the corruption markup + CHA discount.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tideVendorPriceMult } = require('../../engine/worldPulse') as typeof import('../../engine/worldPulse');
    const vendorTideMult = scene.vendor.faction
      ? tideVendorPriceMult(get().worldMemory.factionTides?.[scene.vendor.faction])
      : 1;
    // OTA-865 [war micro-economy] — contested ground marks prices up: soldiers are buying.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WEbuy = require('../../engine/worldEvents') as typeof import('../../engine/worldEvents');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VP = require('../../engine/vendorPricing') as typeof import('../../engine/vendorPricing');
    const buyCell = canonicalCellOf(player.currentLocationId);
    const buyHeat = WEbuy.localWarHeat(get().worldMemory.patrols ?? [], buyCell.x, buyCell.y);
    const { buyMult: warBuyMult } = VP.warPriceFactor(buyHeat);
    // OTA-1053 — and finally the relationship with THIS person. Excluded from
    // strangerBuyPrice by design, so the existing "you saved N TC" line now
    // reports what being a regular is worth alongside the charm.
    const buyRegardMult = regardPriceMult(npcRegard(getRelation(get().worldMemory, deps.vendorNpcId(scene.vendor))));
    // OTA-1066 — PHASE 4 TIDE: the buried country gets leaner the longer you
    // stay in it. Flat, capped at TIDE_MAX_STAGES, and exactly 1.0 for a fresh
    // character and for the whole of the 'salvage' tier.
    const pressureTideMult = tidePriceMultiplier(tideStage(player.hoursElapsed ?? 0, profileOf(player)));
    // OTA-1689 — and the player's own reputation for getting their way: a
    // feared face pays a padded price (menace.menacePriceMult), shown on the
    // vendor screen through the same helper.
    const menaceMult = menacePriceMult(decayedMenace(player.menace ?? 0, player.menaceUpdatedHour ?? 0, player.hoursElapsed ?? 0));
    const priceParts = { corruptionMult: mult, buyDiscount, tideMult: vendorTideMult, warBuyMult, regardMult: buyRegardMult, pressureTideMult, menaceMult };
    const effectivePrice = VP.finalBuyPrice(offer.price, priceParts);
    if (player.tc < effectivePrice) {
      get().appendLog(
        'system',
        `Not enough TC. ${offer.itemName} costs ${effectivePrice}${mult > 1 ? ` (${offer.price} base + ${Math.round((mult - 1) * 100)}% corruption markup)` : ''}, you have ${player.tc}.`,
      );
      return;
    }

    // Look up the catalog entry to know what kind of inventory item to write.
    // v2.4.1 — added RINGS and AMULETS lookups. 6 vendor offers across
    // the game are rings/amulets (Aetheric Locket, Golem Controller
    // Ring, Minor Aetheric Amulet, Reclaimer's Quick Band, Tartarian
    // Stoneband, Whisperer's Charm); without these checks they landed
    // as bare 'misc' with no rarity/tags.
    const weapon = WEAPONS.find((w) => w.name === offer.itemName);
    const armor = !weapon ? ARMOR.find((a) => a.name === offer.itemName) : null;
    const gear = !weapon && !armor ? GEAR.find((g) => g.name === offer.itemName) : null;
    const material = !weapon && !armor && !gear ? MATERIALS.find((m) => m.name === offer.itemName) : null;
    const ring = !weapon && !armor && !gear && !material ? RINGS.find((r) => r.name === offer.itemName) : null;
    const amulet = !weapon && !armor && !gear && !material && !ring ? AMULETS.find((a) => a.name === offer.itemName) : null;
    // OTA-603 — dog vests (kind 'dog_armor') can now be vendor stock. Resolve
    // them here so a bought vest mints as a real, equippable dog_armor item
    // (rarity + tags from the catalog) instead of falling through to bare 'misc'.
    const dogVest = !weapon && !armor && !gear && !material && !ring && !amulet
      ? findDogGearByName(offer.itemName)
      : null;
    const cat = weapon ?? armor ?? gear ?? material ?? ring ?? amulet ?? dogVest ?? null;
    // OTA-742 — a bought weapon/armor MUST mint with its real kind. Pre-fix it
    // was stamped 'misc', which broke canScrap (a misc item only scraps if it
    // carries a raw-material tag, so a Rust Dagger / Bone Shiv bought from a
    // trader could never be scrapped). Dug/foraged copies minted 'weapon'
    // correctly, so the paths disagreed. Now the buy path matches.
    const kind: InventoryItem['kind'] = dogVest
      ? 'dog_armor'
      : weapon
      ? 'weapon'
      : armor
        ? 'armor'
        : gear?.kind === 'consumable' || gear?.kind === 'relic' || gear?.kind === 'misc'
          ? gear.kind
          : material
            ? 'misc'
            : ring || amulet
              ? 'relic'
              : 'misc';
    const tags = cat?.tags ?? [];
    // arb92 — buy in quantity. Clamp the requested count to what's in stock
    // and what the player can afford; the per-unit affordability gate above
    // already guaranteed at least one is buyable.
    const available = Math.max(1, offer.quantity ?? 1);
    // arb94 — Number.isFinite guard so a non-finite qty (NaN/Infinity from a
    // future caller) can't propagate into totalCost and corrupt TC / stock.
    const reqRaw = Math.floor(qty ?? 1);
    const requested = Number.isFinite(reqRaw) ? Math.max(1, Math.min(reqRaw, available)) : 1;
    const affordableCount = Math.floor(player.tc / effectivePrice);
    const buyCount = Math.max(1, Math.min(requested, affordableCount));
    const newItem: InventoryItem = stampDurability({
      id: deps.freshInstanceId('bought'),
      name: offer.itemName,
      kind,
      rarity: cat?.rarity,
      quantity: buyCount,
      tags,
    });

    // Check cap BEFORE charging TC. If the player can't carry it, refuse
    // the sale instead of taking their coin for nothing.
    const dryRun = grantItem(player.inventory, newItem);
    if (dryRun.accepted <= 0) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} pauses. "Your pack is already heavy with ${offer.itemName.toLowerCase()}. Drop one first if you want this."`,
        { skipDedup: true },
      );
      return;
    }
    // arb92 — charge only for what the pack actually accepted (cap may
    // trim a multi-buy), and decrement the trader's stock instead of
    // always removing the whole offer.
    const boughtCount = Math.max(1, dryRun.accepted);
    const totalCost = effectivePrice * boughtCount;
    const remainingStock = available - boughtCount;

    // OTA-804 — buying builds faction standing, but only as a SLOW GRIND / after-
    // thought (per the user). Was a flat +1 per purchase — so buying anything, even
    // a 2 TC junk item, farmed standing and let you shop your way to a faction.
    // Now standing accrues by TC of HONEST CUSTOM: a hidden pool banks the coin you
    // spend and grants +1 standing per BUY_REP_TC_PER_STANDING TC, carrying the
    // remainder across purchases (buyRepProgress, persisted). Real business slowly
    // earns a little regard; cheap-junk spam can't grind it (a 2 TC buy adds 2 to
    // the pool). The intended paths — mission completions + sigil turn-ins — still
    // dwarf it (joining needs 20 standing ≈ 10,000 TC spent this way). The pool is
    // faction-agnostic; it banks into whoever you're buying from when it crosses,
    // a benign cross-faction bleed for an afterthought lever.
    // ⚠ OTA-1158 — the value now lives in engine/factions.ts and is IMPORTED. It was
    // a function-local const, so the character sheet had no way to state the rule and
    // the in-game glossary just said purchases were worth "+1" — off by this whole
    // constant. A number two surfaces have to agree on does not get two homes.
    // ⚠ OTA-1156 — CANONICALISE, THEN ONLY SPEND THE POOL IF THE GRANT CAN LAND.
    //
    // The pool used to be debited unconditionally: `nextBuyRepProgress` was
    // computed from `buyRepGranted` and written whether or not `applyRepChange`
    // did anything. **Every roadside trader in the game has `faction: null`**
    // (engine/vendors.ts), so crossing 500 TC at a roadside stall silently burned
    // 500 TC of accumulated honest custom and granted nothing — permanently, since
    // the pool does not refund. Same loss at REP_MAX, and same loss for a vendor
    // whose recorded faction is one of the legacy race ids (see canonicalFactionId).
    //
    // ⚠ THE REMAINDER IS NOT THE SAME AS THE GRANT. Only the part that was
    // converted into standing is spent; the sub-500 remainder always carries, which
    // is what makes this a grind rather than a lottery. So on a landing grant we
    // keep the remainder, and on a no-op we keep the WHOLE pool — the coin is still
    // honest custom, it just has nobody to bank it with yet.
    //
    // ⚠ ONE CONSEQUENCE THE OWNER SHOULD SEE ON DEVICE BEFORE IT IS TUNED: a long
    // stretch of roadside-only shopping now banks in a LUMP at the next faction
    // vendor, because the pool carries instead of evaporating. That is the stated
    // design ("faction-agnostic; it banks into whoever you're buying from when it
    // crosses") paid out honestly for the first time — 10,000 TC of custom is worth
    // +20 either way. But it arrives all at once, and +20 is the join threshold. If
    // that reads badly in play the answer is a per-purchase grant cap, which is a
    // DESIGN call and is deliberately not made here.
    const vendorFaction = canonicalFactionId(scene.vendor.faction);
    const buyRepPool = (player.buyRepProgress ?? 0) + totalCost;
    const buyRepGranted = Math.floor(buyRepPool / BUY_REP_TC_PER_STANDING);
    const repResult = (vendorFaction && buyRepGranted > 0)
      ? applyRepChange(player.factionStanding, vendorFaction, buyRepGranted)
      : { standing: player.factionStanding.map((r) => ({ ...r })), changed: [] };
    // `changed` is empty when the id was unknown OR the faction was already pinned
    // at REP_MAX — in both cases nothing moved, so nothing should be charged.
    const buyRepLanded = repResult.changed.length > 0;
    const nextBuyRepProgress = buyRepLanded
      ? buyRepPool - buyRepGranted * BUY_REP_TC_PER_STANDING
      : buyRepPool;
    set((s) => {
      if (!s.player || !s.currentScene?.vendor) return s;
      // OTA 036 — filter by (itemName, price) instead of reference
      // identity. Reference equality is fragile: any intervening set
      // that rewrites currentScene.vendor.offers (e.g. via a spread)
      // would silently leave this offer in the list. (itemName, price)
      // pair is unique within a single vendor's session offers.
      const newOffers = s.currentScene.vendor.offers
        .map((o) =>
          o.itemName === offer.itemName && o.price === offer.price
            ? { ...o, quantity: remainingStock }
            : o,
        )
        .filter((o) => (o.quantity ?? 1) > 0);
      return {
        player: {
          ...s.player,
          tc: s.player.tc - totalCost,
          inventory: dryRun.inventory,
          factionStanding: repResult.standing,
          buyRepProgress: nextBuyRepProgress,
        },
        currentScene: {
          ...s.currentScene,
          vendor: { ...s.currentScene.vendor, offers: newOffers },
        },
        // OTA-912 — a Skyreacher Chart sells ONCE, ever. Stamp it into the
        // persistent ledger so no other roadside stall can ever offer it again.
        ...(deps.SKYREACHER_CHART_NAMES.has(offer.itemName)
          ? { worldMemory: { ...s.worldMemory, soldMapIds: Array.from(new Set([...(s.worldMemory.soldMapIds ?? []), offer.itemName])) } }
          : {}),
      };
    });
    // OTA-1049 — the trade goes on the ledger with THIS person. A bulk buy is
    // one transaction, not `boughtCount` of them: walking out with five of
    // something is one piece of business, and counting units would let a
    // stack purchase vault a stranger to "trusted" in a single tap.
    // OTA-1053 — restitution. Coin spent with someone you were caught stealing
    // from is banked as amends; enough of it buys the wrong back. Read the
    // count before and after so the clearing can be announced — a debt settled
    // silently is a debt the player never learns they could settle.
    const wrongsBefore = getRelation(get().worldMemory, deps.vendorNpcId(scene.vendor))?.wrongs ?? 0;
    set((s) => ({
      worldMemory: recordNpcDealing(s.worldMemory, deps.vendorNpcId(scene.vendor!), {
        trades: 1,
        tcTraded: totalCost,
        // OTA-1055 — only money the player HANDS OVER can pay a debt.
        spent: totalCost,
        // ⚠ OTA-1438 — the visit stamp. `trades` counts VISITS, not line items;
        // the comment above already argued this for units of one stack, and
        // this is the same rule across separate purchases in one stop.
        atHours: s.player?.hoursElapsed ?? 0,
      }),
    }));
    const relAfterBuy = getRelation(get().worldMemory, deps.vendorNpcId(scene.vendor));
    if (wrongsBefore > 0 && (relAfterBuy?.wrongs ?? 0) < wrongsBefore) {
      get().appendLog(
        'world',
        `${scene.vendor.name} counts the coin twice, then puts it away without a word. Whatever you took from them, you have paid for it now.`,
      );
    }
    const markupNote = mult > 1 ? ` (${offer.price} base + ${Math.round((mult - 1) * 100)}% corruption)` : '';
    const countNote = boughtCount > 1 ? `${boughtCount}× ` : '';
    get().appendLog(
      'reward',
      `Bought ${countNote}${offer.itemName} from ${scene.vendor.name} for ${totalCost} TC${markupNote}. (${player.tc - totalCost} TC left)`,
    );
    // OTA-865 — the "friend's price" line: what your CHA/rapport shaved off vs. a stranger's
    // price here (heat/tide/corruption are NOT counted — this is purely YOUR skill's doing,
    // so it reads as a win even in a marked-up war market). Only shown when it saved coin.
    {
      const strangerUnit = VP.strangerBuyPrice(offer.price, priceParts);
      const saved = (strangerUnit - effectivePrice) * boughtCount;
      if (saved > 0) {
        get().appendLog('reward', `They don't charge a friend full price — ${saved} TC stayed in your pouch.`);
      }
    }
    deps.logRepChanges(get, repResult.changed);
    // OTA 059 — successful BUY trains CHA. You read the room well
    // enough to close the deal at the price they offered. The
    // diplomacy intent already trains CHA on typed verbs; this
    // covers the tap-driven path so CHA grows naturally.
    {
      const liveBuyer = get().player;
      if (liveBuyer) {
        const tr = trainStat(liveBuyer, 'charisma', true);
        set((s) => (s.player ? { player: tr.player } : s));
        if (tr.leveled) {
          get().appendLog(
            'reward',
            `✦ You read them well. +1 CHA (${deps.statNowClause(get().player, 'charisma', tr.leveled.to)}).`,
          );
        }
      }
      // OTA-057 — WIS no longer fires on active social verbs (buying is
      // a CHA push). Passive perception WIS still trains on outcome paths
      // (turn-ins, whispers, novel travel, surviving encounters).
    }
    void get().persist();
  },

  sellToVendor(itemName, itemId, opts) {
    const state = get();
    const scene = state.currentScene;
    const player = state.player;
    if (!player) return;
    // OTA-840 [never-fail-silently] — a sell with no vendor present used to no-op silently.
    if (!scene?.vendor) { get().appendLog('system', "There's no one here to trade with."); return; }
    // arb166 — no trading mid-fight (see buyFromVendor).
    if (scene.enemies.length > 0) {
      get().appendLog('system', "Not while you're in a fight — deal with the threat first.");
      return;
    }
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — selling is disabled while the tutorial is running.');
      return;
    }
    // Refuse if the item is equipped — don't quietly strip the player's
    // loadout. They have to unequip first.
    // OTA-695 — resolve the exact instance the shop row points at (id-first),
    // so a spare sells even when an equipped same-named copy exists.
    const item = (itemId ? player.inventory.find((i) => i.id === itemId && i.quantity > 0) : undefined)
      ?? player.inventory.find((i) => i.name.toLowerCase() === itemName.toLowerCase() && i.quantity > 0);
    if (!item) {
      get().appendLog('system', `You don't have any ${itemName} to sell.`);
      return;
    }
    if (equippedInstanceIds(player).has(item.id)) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} eyes the ${item.name} on your person. "Take it off first. I don't haggle for what's still on a man."`,
      );
      return;
    }
    if (isUnsellable(item)) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} shakes their head. "That one's not for sale. Not by you, not by me."`,
      );
      return;
    }
    // OTA 23-009 — stolen items can't be sold. The flag is per-
    // item-instance (item.id), so other copies of the same name
    // in the player's pack are fine — only the specific stolen
    // instance is refused. Player can still USE it or SCRAP it
    // (scrap outputs are clean, mintable for resale).
    // OTA-1083 — EXCEPT AT THE FENCE. A sketchy trader buys hot goods, no
    // questions asked, at FENCE_STOLEN_CUT of the honest price — the deep
    // cut is the whole deal: they carry the risk, you carry the discount.
    // Honest and hub vendors keep the refusal word for word.
    const fenced = !!item.stolen;
    if (item.stolen && scene.vendor.demeanor !== 'sketchy') {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} looks at the ${item.name} you're holding. "That's mine — or somebody's. I'm not buying it back. Use it, break it down, but don't put it on my table."`,
      );
      return;
    }
    // OTA-805 — CHA-scaled rapport BONUS on the sell-back, once you've earned
    // dealing with this faction (mirror of the buy discount).
    const sellRapportBonus = vendorPriceMod(
      effectiveStats(player).charisma,
      player.completedFactionQuestIds,
      scene.vendor.faction,
      // OTA-1341 — mirror of the buy side: the ladder moves the sell-back too
      // (a hostile vendor pays less for your goods; the B1 caps clamp above).
      scene.vendor.faction ? getStanding(player.factionStanding ?? [], scene.vendor.faction) : 0,
    );
    // OTA-865 [war micro-economy] — in a contested area the trader pays a little more:
    // they can turn your goods over to soldiers who need them. Bounded (+8% at full heat),
    // and well under the buy/sell spread so it never opens a buy-here-sell-there arbitrage.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WEsell = require('../../engine/worldEvents') as typeof import('../../engine/worldEvents');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VPsell = require('../../engine/vendorPricing') as typeof import('../../engine/vendorPricing');
    const sellCell = canonicalCellOf(player.currentLocationId);
    const sellHeat = WEsell.localWarHeat(get().worldMemory.patrols ?? [], sellCell.x, sellCell.y);
    const { sellMult: warSellMult } = VPsell.warPriceFactor(sellHeat);
    const basePrice = Math.round(sellPriceFor(item, scene.vendor, sellRapportBonus) * warSellMult);
    // arb45 — Relic Trader perk: sharper coin when bartering relics.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tPerksSell = require('../../engine/titles').titlePerkModifiers(player);
    const isRelicTrade = canonicalItemKind(item) === 'relic';
    const multiplied = (isRelicTrade && tPerksSell.tradeBonus > 0)
      ? Math.round(basePrice * (1 + 0.05 * tPerksSell.tradeBonus))
      : basePrice;
    // OTA-916 — re-clamp to the arbitrage floor as the LAST operation, so the
    // war-heat + relic-title multipliers (like rapport) can lift the price toward
    // but never above the cheapest-buy cap. Without this a rapport'd, war-heated
    // relic stall paid ABOVE the floor on unstocked items — a buy-cheap-sell-here loop.
    // OTA-1083 — the fence's cut, applied LAST so it can never lift a price,
    // only sink one. max(1,…): a fence never pays zero for something they
    // agreed to take — a 1 TC insult is still a completed deal.
    const price = fenced
      ? Math.max(1, Math.round(applySellCaps(item, multiplied) * FENCE_STOLEN_CUT))
      : applySellCaps(item, multiplied);
    if (price <= 0) {
      get().appendLog('system', `${scene.vendor.name} won't pay for ${item.name} — no resale value.`);
      return;
    }
    // ⚠⚠ OTA-1481 — THE WHOLE STACK IS ONE TRANSACTION, NOT N OF THEM.
    //
    // Owner's 4.32.11 log: a 155-coin sell froze the JS thread for 2355ms. The
    // screen looped `sellToVendor` per unit, and each unit was: three `set()`
    // calls (inventory rebuild, ledger, CHA), one DISK-PERSISTED log line, and a
    // FULL STATE `persist()`. 155 persists for one tap. The buy side has taken a
    // quantity since arb92 — the sell side simply never got the same treatment,
    // which is the usual story: one half of a symmetric pair gets the fix.
    //
    // ⚠ THE RULES DO NOT CHANGE WITH THE BATCHING. Price is per-unit and constant
    // across a stack (it depends on the item def, rapport, war heat — not on the
    // count), so total = price × units, exactly what the loop paid. The ledger
    // still records ONE trade per negotiation (OTA-1438), CHA still trains once
    // per negotiation (OTA-708), and every refusal above ran before a single
    // unit moved — as it always did, since a stack is copies of one item.
    // ⚠ FOUND BY THE SUITE, NOT BY THE FIX: NaN slides straight through
    // Math.max/Math.min (both return NaN), and `quantity - NaN` is NaN, which the
    // >0 filter then DROPS — a NaN units request would have vaporised the whole
    // stack and credited NaN TC. Same lesson as OTA-1477's clamp: the guard
    // everyone assumes Math.max provides does not exist for NaN.
    const askedUnits = Number(opts?.units ?? 1);
    const units = Number.isFinite(askedUnits)
      ? Math.max(1, Math.min(Math.floor(askedUnits), item.quantity))
      : 1;
    const total = price * units;
    set((s) => {
      if (!s.player || !s.currentScene?.vendor) return s;
      const newInventory = s.player.inventory
        .map((i) => (i.id === item.id ? { ...i, quantity: i.quantity - units } : i))
        .filter((i) => i.quantity > 0);
      return {
        player: {
          ...s.player,
          tc: s.player.tc + total,
          inventory: newInventory,
        },
      };
    });
    // One line per NEGOTIATION. A 155-line receipt was its own defect — the feed
    // is a story, not a cash-register tape. The unit price stays visible so the
    // player can still check the arithmetic.
    // ⚠⚠⚠ OTA-1570 — NAME THE RARITY, because he had to ASK. After a 66-line
    // bulk sweep he typed into the game: *"I thought the sell all common would
    // only sell of common weapons and armor"* and *"did I just sell off rares and
    // uncommons as well?"* — and the answer was no, every item was Common and the
    // button had worked exactly as specified. What made him doubt it is that the
    // line never SAID so: `Sold Aetherium Spear … for 14 TC` reads like a Rare
    // going for pocket change, because several Commons have Rare-sounding names.
    // One word closes a question the receipt was always able to answer.
    // ⚠⚠⚠ OTA-1706 — AND NOW IT IS ON THEIR SHELF. Owner: "whatever we sell to
    // a vendor is added to their available buy inventory so we have a chance to
    // buy it back, but of course whatever we buy back is going to be at a loss."
    //
    // Measured before building: `sellToVendor` never touched `vendor.offers` —
    // the item left the pack, the coin arrived, and the thing stopped existing.
    // A regretted sale was unrecoverable and a vendor's stock never showed a
    // trace of the town's own trade.
    //
    // ⚠ `VendorInstance.offers` is already per-instance and mutable (vendors.ts
    // rolls a fresh array when you meet them), so this needs no new state — the
    // shelf is where it always was. The ask comes from what they actually PAID
    // (buyBackAskFor), so every modifier that shaped the sale is carried into
    // the price, and the vendor's cut is the loss the owner described rather
    // than a penalty invented here.
    //
    // ⚠ An existing line item KEEPS ITS PRICE and only grows in quantity:
    // selling a vendor one more Bone Knife must not re-price the ones they had.
    set((sBuy) => {
      const scBuy = sBuy.currentScene;
      if (!scBuy?.vendor) return {};
      const offers = [...scBuy.vendor.offers];
      const at = offers.findIndex((o) => o.itemName.toLowerCase() === item.name.toLowerCase());
      if (at >= 0) offers[at] = { ...offers[at]!, quantity: (offers[at]!.quantity ?? 1) + units };
      else offers.push({ itemName: item.name, price: buyBackAskFor(price), quantity: units });
      return { currentScene: { ...scBuy, vendor: { ...scBuy.vendor, offers } } };
    });
    const rarityTag = item.rarity ? ` (${item.rarity})` : '';
    const soldWhat = units === 1 ? `${item.name}${rarityTag}` : `${units}× ${item.name}${rarityTag}`;
    const forWhat = units === 1 ? `${total} TC` : `${total} TC (${price} TC each)`;
    get().appendLog(
      'reward',
      fenced
        ? `Fenced ${soldWhat} to ${scene.vendor.name} for ${forWhat} — no questions asked, and none answered. (${player.tc + total} TC on hand)`
        : `Sold ${soldWhat} to ${scene.vendor.name} for ${forWhat}. (${player.tc + total} TC on hand)`,
    );
    // OTA-1049 — on the ledger with THIS person. TC accrues per unit, but the
    // TRADE count rides the same `social` flag the Charisma train already uses
    // to mean "first unit of this negotiation" (OTA-727) — so emptying a stack
    // of twenty is one piece of business, exactly as it is for CHA.
    set((s) => ({
      worldMemory: recordNpcDealing(s.worldMemory, deps.vendorNpcId(scene.vendor!), {
        trades: opts?.social !== false ? 1 : 0,
        tcTraded: total,
        // ⚠⚠ OTA-1438 — AND THIS IS THE ONE THAT WAS ACTUALLY LEAKING. The
        // `social` flag dedupes units of ONE stack; selling three different
        // items is three calls, each a fresh first unit, so an inventory dump
        // credited a trade per item. The owner's log: fifteen in 400ms.
        atHours: s.player?.hoursElapsed ?? 0,
      }),
    }));
    // arb45 — Relic Trader: count relic barters toward the title (5 needed).
    // arb45 — relic barters count toward the title PER PIECE, as the loop always
    // did: five relics is five barters whether they left in one negotiation or five.
    if (isRelicTrade) deps.recordTitleProgress(get, set, { relicsTraded: units });
    // OTA 059 — successful SELL trains CHA. Closing the trade
    // counts as social work.
    // OTA-708 — but ONE negotiation, not one per unit: a bulk sale passes
    // social:false for every unit after the first, so dumping a big stack no
    // longer farms Charisma a level at a time.
    if (opts?.social !== false) {
      const liveSeller = get().player;
      if (liveSeller) {
        const tr = trainStat(liveSeller, 'charisma', true);
        set((s) => (s.player ? { player: tr.player } : s));
        if (tr.leveled) {
          get().appendLog(
            'reward',
            `✦ You named your price and held it. +1 CHA (${deps.statNowClause(get().player, 'charisma', tr.leveled.to)}).`,
          );
        }
      }
      // OTA-057 — selling is an active CHA push; no WIS train here.
    }
    void get().persist();
  },

  useVendorCrucible() {
    const state = get();
    const scene = state.currentScene;
    const player = state.player;
    if (!scene?.vendor || !player) return;
    if (state.tutorialDemoVendor) {
      get().appendLog('system', 'Tour mode — the crucible is offline while the tutorial is running.');
      return;
    }
    // arb108 — no Crucible in the spawn outpost (never-left). Matches the
    // outpost-Crucible gate in fuseAtCrucible: you must have ventured out and
    // returned (macroVisitSeq ≥ 1) before a vendor will fire one.
    if ((player.macroVisitSeq ?? 0) < 1) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} waves you off. "The Crucible's not for first-timers. Leave the outpost and see something of the world first — travel out to a named place and come back. Then I'll fire it and forge you something new."`,
      );
      return;
    }
    const COST = 25;
    // Pre-check the reserve gate so the player never pays for a fuse they
    // can't make. Charge only when they're actually ready.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fusion = require('../../engine/itemFusion');
    // arb-fix — same catalyst-counts gate as fuseAtCrucible. Resolve the
    // faction catalyst (excluding equipped instances) so 2 inferred + 1
    // reserved faction item passes here too, and so the player isn't charged
    // for a fuse the gate would refuse.
    const eqForVendorFuse = player.equipped ?? {};
    const vendorEquippedIds = new Set(
      [eqForVendorFuse.mainId, eqForVendorFuse.offId, eqForVendorFuse.headId, eqForVendorFuse.chestId, eqForVendorFuse.handsId, eqForVendorFuse.legsId, eqForVendorFuse.feetId, eqForVendorFuse.cloakId, eqForVendorFuse.amuletId, ...RING_ID_KEYS.map((k) => eqForVendorFuse[k])].filter(Boolean) as string[],
    );
    const vendorCatalyst = fusion.findFactionCatalyst(player.inventory, vendorEquippedIds) as ReturnType<typeof import('../../engine/itemFusion').findFactionCatalyst>;
    const gate = fusion.gateFusion(player.inventory, vendorCatalyst) as ReturnType<typeof import('../../engine/itemFusion').gateFusion>;
    if (!gate.ok) {
      // arb-fix — equipped faction catalyst would complete it → ask first
      // (charge happens on confirm, not now).
      const equippedReservedFaction = player.inventory.find(
        (i) => i.reservedForFusion && canonicalItemTags(i).includes('faction_gear') && vendorEquippedIds.has(i.id),
      );
      if (equippedReservedFaction && fusion.gateFusion(player.inventory, equippedReservedFaction).ok) {
        const slot = slotOfEquippedId(player.equipped, equippedReservedFaction.id);
        if (slot) {
          set({ fusionCatalystPrompt: { itemName: equippedReservedFaction.name, slot, slotLabel: SLOT_LABEL[slot] ?? slot, cost: COST, vendorName: scene.vendor.name } });
          return;
        }
      }
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} taps the cold Crucible. "${gate.reason ?? 'Reserve at least three pieces first, then I will fire it up.'}" No charge until you are ready.`,
      );
      return;
    }
    if (player.tc < COST) {
      get().appendLog('system', `The Crucible costs ${COST} TC to fire; you have ${player.tc}.`);
      return;
    }
    // OTA-984 — don't sell a fire that can't light. Pre-fix this charged the fee and
    // THEN discovered the pack couldn't fuse, so the player paid for a dead menu.
    {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const preFuse = require('../../engine/itemFusion') as typeof import('../../engine/itemFusion');
      const eqIds = new Set(
        Object.values(player.equipped ?? {}).filter((v): v is string => typeof v === 'string'),
      );
      const cat = preFuse.findFactionCatalyst(player.inventory, eqIds);
      if (!preFuse.gateFusion(player.inventory, cat).ok) {
        get().appendLog(
          'arbiter',
          `${scene.vendor.name} looks over your pack and shakes their head. "Nothing in there to work with. Come back when you've odd salvage to spare — I'll not take your coin for a cold bowl."`,
        );
        return;
      }
    }
    set((s) => (s.player ? { player: { ...s.player, tc: s.player.tc - COST, fusionPending: true } } : s));
    get().appendLog('reward', `${scene.vendor.name} fires up a portable Crucible for you. (−${COST} TC)`);
    void get().fuseAtCrucible();
  },

  repairWithVendor(itemName) {
    const state = get();
    const scene = state.currentScene;
    const player = state.player;
    if (!player) return;
    if (!scene?.vendor) {
      get().appendLog('arbiter', `The Arbiter shakes their head. "No one here repairs gear. Find a smith."`);
      return;
    }
    const target = itemName.toLowerCase();
    // OTA-431 — pick the RIGHT copy when several share a name. With per-instance
    // durability (OTA-427) the player can carry several same-named pieces at
    // different wear, so the old `.find` (first damaged match) could mend a
    // near-full spare while leaving the battered piece the player actually
    // meant untouched — and still charge for it. Resolve in player-intent order:
    // the EQUIPPED instance first, then the MOST-damaged copy (lowest
    // current/max ratio).
    const damagedMatches = player.inventory.filter(
      (i) => i.name.toLowerCase() === target && i.durability && i.durability.current < i.durability.max,
    );
    if (damagedMatches.length === 0) {
      get().appendLog(
        'arbiter',
        `The Arbiter glances at your pack. "Nothing in your pack matches that — or it's already in good order."`,
      );
      return;
    }
    const eqRep = player.equipped ?? {};
    const equippedRepairIds = new Set(
      [eqRep.mainId, eqRep.offId, eqRep.headId, eqRep.chestId, eqRep.handsId, eqRep.legsId, eqRep.feetId, eqRep.cloakId, eqRep.amuletId, ...RING_ID_KEYS.map((k) => eqRep[k])].filter(Boolean) as string[],
    );
    const item = damagedMatches.find((i) => equippedRepairIds.has(i.id))
      ?? damagedMatches.slice().sort((a, b) =>
        (a.durability!.current / a.durability!.max) - (b.durability!.current / b.durability!.max),
      )[0]!;
    const baseCost = repairCost(item);
    // arb45 — Architect's Eye perk: cheaper mends on relic / ancient gear.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tPerksRep = require('../../engine/titles').titlePerkModifiers(player);
    const isAncientItem = canonicalItemKind(item) === 'relic' || canonicalItemTags(item).some((t) => /ancient|relic|tartarian/i.test(t));
    const cost = (isAncientItem && tPerksRep.repairBonus > 0)
      ? Math.max(1, Math.round(baseCost * (1 - 0.05 * tPerksRep.repairBonus)))
      : baseCost;
    if (player.tc < cost) {
      get().appendLog(
        'arbiter',
        `${scene.vendor.name} looks at your purse. "That mends for ${cost} TC. You don't have it."`,
      );
      return;
    }
    const newInventory = repairItem(player.inventory, item.id);
    set((s) =>
      s.player ? { player: { ...s.player, tc: s.player.tc - cost, inventory: newInventory } } : s,
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mendDisplay = require('../../engine/weaponCoating').coatedDisplayName(item) as string;
    get().appendLog(
      'reward',
      `${scene.vendor.name} mends your ${mendDisplay}. ${cost} TC. (durability restored)`,
    );
    // arb45 — Architect's Eye: a completed mend counts as restoring ancient work.
    deps.recordTitleProgress(get, set, { repairsCompleted: 1 });
    void get().persist();
  },
});
