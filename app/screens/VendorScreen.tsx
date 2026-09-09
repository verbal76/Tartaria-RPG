import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore, vendorNpcId } from '../state/gameStore';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { useTeachingSlot } from '../components/useFirstTimeHint'; // OTA-1738
import { TEACHINGS as TEACH } from '../components/teachingRegistry'; // OTA-1738
import { dogMarketRowByName } from '../engine/dogMarket'; // OTA-1738 — the dog row, by the market's own lookup
import { BrandedModal } from '../components/BrandedModal';
import { VendorContractsModal } from '../components/VendorContractsModal';
import { getItemPreview, getItemPreviewForInstance, lootPurposeLine } from '../components/itemPreview';
import { validSlotsForItem, SLOT_LABEL, equippedInstanceIds, effectiveStats } from '../engine/equipment';
import type { EquipSlot, InventoryItem } from '../engine/types';
import { sellPriceFor, isUnsellable } from '../engine/sellPrice';
import { planCommonGearSale, planLootSale, bulkSellHeldBackNote } from '../engine/bulkSell'; // OTA-1232 — one-tap Common gear clear-out
import { rarityHexColor } from '../components/InventoryCategorize';
import { vendorPriceMod } from '../engine/factionRapport';
import { getStanding } from '../engine/factions'; // OTA-1341 — the ladder reaches the display too
import { resolveItemEffect, type GateKind } from '../engine/itemEffect';
import { findGearByName, findMaterialByName, findExplorationItemByName, findCatalogItem, missingIngredientsList, RECIPES } from '../engine/crafting';
import { vendorRecipeMenu, vendorSeed } from '../engine/recipeDiscovery';
// ⚠ OTA-1734 — the reinforcement AUTHORITIES, imported to be READ. The screen
//   renders what `reinforceQuote` hands it and never computes a price or a
//   ceiling of its own; `reinforceWithVendor` charges from the same call.
import { reinforceQuote, REINFORCE_MAX_LEVEL, reinforceLevel } from '../engine/durability';
// ⚠⚠⚠ OTA-1736 — A VENDOR SCREEN IS A PROJECTION OF AUTHORITATIVE STATE, NOT AN
//   APPROXIMATION OF IT. The item's name, where it is worn and how it is held
//   come from the same engine authority the inventory reads; whether a shelf
//   row is knowledge the character already holds comes from the shelf's own
//   predicate, which the counter refuses through. Nothing here is derived twice.
import { instanceDisplayName, equippedWhereLabel, holdLabelFor } from '../engine/itemIdentity';
import { shelfKnowledge } from '../engine/vendors';
import { resolveDisplayWeapon } from '../engine/itemResolution';
import { corruptionTierOf, corruptionPriceMultiplier } from '../engine/corruption';
import { warPriceFactor, finalBuyPrice, priceArrow } from '../engine/vendorPricing';
import { localWarHeat, contestedFactions } from '../engine/worldEvents';
import { tideVendorPriceMult } from '../engine/worldPulse';
// OTA-1156 — the two price factors the display was missing; see `priceParts` below.
import { npcRegard, regardPriceMult, getRelation } from '../engine/npcMemory';
import { profileOf, tideStage, tidePriceMultiplier } from '../engine/pressure';
import { decayedMenace, menacePriceMult } from '../engine/menace';
import { canonicalCellOf } from '../engine/worldMap';
import factionsData from '../data/factions/factions.json';
import { CONTENT_MAX_WIDTH } from '../ui/displayScale'; // OTA-1227 — one column width, platform-aware
import { tRowStyle, TTabBar, tartariaKitStyles as kit } from '../ui/tartariaKit'; // OTA-1759 rows · OTA-1762 tabs
import {
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  CATEGORY_COLORS,
  categorizeItem,
  type InventoryCategory,
} from '../components/InventoryCategorize';

// ⚠ OTA-1312 — one palette, shared with the pack and the salvage modal.
const rarityColor = rarityHexColor;

type Mode = 'buy' | 'sell' | 'contracts';
type Pending =
  | { mode: 'buy'; itemName: string; price: number; isRecipe?: boolean }
  | { mode: 'sell'; itemName: string; price: number; itemId?: string }
  | { mode: 'steal'; itemName: string; dc: number }
  | { mode: 'dismiss' }
  // ⚠ OTA-1232 — the count and the total ARE the safety on a bulk sell, so they
  // are carried into the confirm rather than recomputed when it fires.
  | { mode: 'bulkSellCommonGear'; count: number; total: number }
  | { mode: 'bulkSellLoot'; count: number; total: number }
  | { mode: 'accept'; kind: 'faction' | 'hunt' | 'mystery' | 'storyline'; title: string; reward: string }
  // ⚠⚠ OTA-1734 — REINFORCEMENT IS A SERVICE THE COUNTER SELLS, so it rides the
  // same `pending` sheet every other purchase does rather than a screen of its
  // own. Owner: *"Do not create a special standalone reinforcement screen if the
  // existing vendor architecture can represent the service cleanly."*
  //
  // ⚠ It carries the INSTANCE ID, not just the name: two copies of one blade can
  // sit at different levels, and the sheet must quote the copy that was tapped.
  | { mode: 'reinforce'; itemName: string; itemId: string }
  // ⚠ The outcome is its own arm because the player is standing at a vendor and
  // never sees the log line the store writes. "Receive a clear success message
  // showing the new maximum durability" has to happen HERE.
  | { mode: 'reinforceDone'; itemName: string; itemId: string; text: string }
  | null;

/** Sort order for the SELL list's "by rarity" mode. Module scope so the sell
 *  projection's memo does not depend on a table rebuilt every render. */
const RARITY_ORDER: Record<string, number> = { Legendary: 0, Rare: 1, Uncommon: 2, Common: 3 };

export function VendorScreen() {
  const player = useGameStore((s) => s.player);
  const activeBuildingId = useGameStore((s) => s.activeBuildingId);
  const scene = useGameStore((s) => s.currentScene);
  /* ⚠⚠⚠ LAG-2 — WHAT THE COUNTER READS, NOT THE WHOLE WORLD. This screen
   *  subscribed to the `worldMemory` object, which `worldRealtimeTick` replaces
   *  several times every ~6 real seconds as patrols roam — and this is the most
   *  expensive screen in the game to re-render (Fable: ~196-200ms per commit at
   *  258 inventory items). A shopper standing at a stall paid that every six
   *  seconds for a war being fought somewhere else.
   *
   *  ⚠ TWO OF THESE ARE REALTIME AND STAY, because the counter genuinely
   *  charges by them: the faction tide and LOCAL WAR HEAT both move real prices
   *  (`buyFromVendor` / `sellToVendor`). They are subscribed as the DERIVED
   *  VALUE rather than the patrol array, so the screen redraws when the price
   *  actually changes and not when a patrol two provinces away takes a step. */
  // The tide reaches the price as a MULTIPLIER; subscribing to that number
  // rather than the momentum map means a skirmish that does not move the price
  // does not redraw the counter.
  const vendorTideMult = useGameStore((s) => {
    const f = s.currentScene?.vendor?.faction;
    return f ? tideVendorPriceMult(s.worldMemory?.factionTides?.[f]) : 1;
  });
  const npcRelations = useGameStore((s) => s.worldMemory?.npcRelations);
  const warHeat = useGameStore((s) => {
    const loc = s.player?.currentLocationId;
    if (!loc) return 0;
    const c = canonicalCellOf(loc);
    return localWarHeat(s.worldMemory?.patrols ?? [], c.x, c.y);
  });
  // A stable key, so an unchanged pair of contesting factions is an unchanged
  // subscription value (an array would be a new reference on every tick).
  const contestKey = useGameStore((s) => {
    const loc = s.player?.currentLocationId;
    if (!loc) return '';
    const c = canonicalCellOf(loc);
    return contestedFactions(s.worldMemory?.patrols ?? [], c.x, c.y).join('\u0000');
  });
  const setScreen = useGameStore((s) => s.setScreen);
  const appendLog = useGameStore((s) => s.appendLog);
  const buyFromVendor = useGameStore((s) => s.buyFromVendor);
  const equipItem = useGameStore((s) => s.equipItem);
  const sellToVendor = useGameStore((s) => s.sellToVendor);
  const stealFromVendor = useGameStore((s) => s.stealFromVendor);
  const dismissVendor = useGameStore((s) => s.dismissVendor);
  const reinforceWithVendor = useGameStore((s) => s.reinforceWithVendor);
  const acceptFactionQuest = useGameStore((s) => s.acceptFactionQuest);
  const acceptHunt = useGameStore((s) => s.acceptHunt);
  const acceptMystery = useGameStore((s) => s.acceptMystery);
  const acceptStoryline = useGameStore((s) => s.acceptStoryline);
  const tutorialDemoVendor = useGameStore((s) => s.tutorialDemoVendor);

  const [mode, setMode] = useState<Mode>('buy');
  // arb151 — vendor CONTRACTS popup (mission-board style) open/closed.
  const [contractsOpen, setContractsOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  // v2.4.1 (OTA 022) — sellSort must live ABOVE the early-return guard
  // below. The prior position (line 104) made hook count depend on
  // vendor being non-null: when a vendor was dismissed mid-render
  // (e.g. caught stealing → vendor cleared → combat starts), the
  // early return fired and React saw 2 hooks instead of 3 — the
  // "Rendered fewer hooks than expected" crash. All hooks must
  // unconditionally precede any return statement in this component.
  const [sellSort, setSellSort] = useState<'name' | 'value' | 'rarity'>('value');
  // arb57 — batch sell: quantity stepper + Sell All, mirroring the scrap modal.
  const [sellQty, setSellQty] = useState(1);
  // arb92 — buy in quantity (food/material traders stock multiples).
  const [buyQty, setBuyQty] = useState(1);
  // "Buy & Equip" hand-choice prompt. Set after buying a weapon (which can go
  // in either hand) so the player picks main vs off before it's equipped.
  const [pendingEquip, setPendingEquip] = useState<{ itemName: string; slots: EquipSlot[] } | null>(null);
  // OTA-686 — the BUY / SELL lists are now organized into the same collapsible
  // categories as the inventory (Weapons / Armor / Consumables / …). Keyed by
  // `buy_<cat>` / `sell_<cat>`; ALL sections default CLOSED (?? true), so a
  // vendor opens as a tidy category index the player expands into.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  // OTA-1099 — GROUP SELL. Owner: "if I want to have a hold to start multiple
  // select so I can hold on an item and it gets a check mark then I tap to add
  // others to that group and sell a group let's make that happen."
  //
  // The standard mobile pattern, and the reason it works is that the LONG-PRESS
  // is the mode switch: a plain tap keeps meaning "sell this one" until you have
  // declared otherwise, so nothing at all changes for a player who never holds a
  // row. Selection is by INSTANCE ID for the same reason the sell list filters
  // by it — two rows can share a name and be different copies.
  const [sellSelectMode, setSellSelectMode] = useState(false);
  const [sellSelected, setSellSelected] = useState<string[]>([]);
  // The group-sale confirmation. Held separately from `pending` so the existing
  // single-item flow — stepper, Sell All, gate-loss branch — is untouched.
  const [groupSellConfirm, setGroupSellConfirm] = useState(false);

  const vendor = scene?.vendor ?? null;

  /* ⚠⚠⚠ LAG-2 — THE PROJECTIONS ARE MEMOIZED, AND THEY SIT ABOVE THE GUARD.
   *
   *  This screen rebuilt three whole-inventory projections on EVERY render —
   *  `reinforceQuote` per weapon, `sellPriceFor` twice per sellable row, and
   *  the recipe menu — so an unrelated store notification (a log line, a world
   *  heartbeat, a tick of anything) cost a full re-pricing of a 258-item pack.
   *  Fable measured the commit at ~200ms.
   *
   *  ⚠ THE DEPENDENCIES ARE THE REAL AUTHORITIES, not conveniences. Every input
   *  that can move a price or an eligibility is listed: the inventory array
   *  (any mutation replaces it), the vendor, the rapport/standing modifier, the
   *  war multiplier, TC and knownRecipes. Nothing here is cached beyond the
   *  state that produced it — change any of them and the projection is rebuilt
   *  before the next paint. Prices and options can never go stale; they can
   *  only stop being recomputed for changes that could not have moved them.
   *
   *  ⚠⚠ AND THEY ARE HOOKS, so they obey OTA-022's rule above: all hooks
   *  unconditionally precede the `!player || !vendor` return below. They are
   *  written null-safe for that reason, not defensively for its own sake. */
  const rapportMod = useMemo(() => (player ? vendorPriceMod(
    effectiveStats(player).charisma,
    player.completedFactionQuestIds,
    vendor?.faction,
    // OTA-1341 — the standing ladder: same fourth argument the store passes, so
    // the shown price and the charged price keep agreeing (vendorPricing's rule).
    vendor?.faction ? getStanding(player.factionStanding ?? [], vendor.faction) : 0,
  ) : 0), [player, vendor]);
  const { buyMult: warBuyMult, sellMult: warSellMult } = useMemo(() => warPriceFactor(warHeat), [warHeat]);
  const equippedItemIds = useMemo(() => (player ? equippedInstanceIds(player) : new Set<string>()), [player]);
  const reinforceRows = useMemo(() => (player ? player.inventory
    .filter((i) => !!i.durability && categorizeItem(i) === 'weapon')
    .map((i) => ({ item: i, quote: reinforceQuote(i) }))
    .sort((a, b) =>
      (equippedItemIds.has(a.item.id) ? 0 : 1) - (equippedItemIds.has(b.item.id) ? 0 : 1)
      || a.item.name.localeCompare(b.item.name)) : []),
  [player?.inventory, equippedItemIds]);
  const recipeOffers = useMemo(() => (player && vendor
    ? vendorRecipeMenu(RECIPES, player.knownRecipes, vendorSeed(vendor.name))
    : []), [player?.knownRecipes, vendor]);
  const sellable = useMemo(() => (player ? player.inventory
    .filter((i) => i.quantity > 0 && !equippedItemIds.has(i.id) && !isUnsellable(i))
    // OTA-865 — display the war-premium sell price (matches sellToVendor); carry the plain
    // catalogue value as `base` so the ▲/▼ ticker can show whether you're getting more.
    .map((i) => ({
      item: i,
      price: Math.round(sellPriceFor(i, vendor, rapportMod) * warSellMult),
      base: sellPriceFor(i, vendor, 0),
    }))
    .filter((x) => x.price > 0)
    .sort((a, b) => {
      if (sellSort === 'name') return a.item.name.localeCompare(b.item.name);
      if (sellSort === 'rarity') {
        const ra = RARITY_ORDER[a.item.rarity ?? 'Common'] ?? 99;
        const rb = RARITY_ORDER[b.item.rarity ?? 'Common'] ?? 99;
        if (ra !== rb) return ra - rb;
        return b.price - a.price;
      }
      return b.price - a.price; // default: most valuable first
    }) : []),
  [player?.inventory, equippedItemIds, vendor, rapportMod, warSellMult, sellSort]);

  // OTA-791 — a fight can start while the trade screen is open (hook-spawned
  // combat, caught stealing). The player kept trading blind: every sell bounced
  // off the arb166 combat guard, whose messages land in a log this screen never
  // shows. Eject to exploration the moment enemies appear so the enemy card is
  // the first thing they see; setScreen's door guard covers re-entry.
  const combatLive = (scene?.enemies?.length ?? 0) > 0;
  useEffect(() => {
    if (!combatLive) return;
    appendLog('system', 'The trade breaks off — something hostile demands your attention.');
    setScreen('exploration');
  }, [combatLive, appendLog, setScreen]);

  if (!player || !vendor) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>You're not as fast as you think you are.</Text>
        {/* ⚠ OTA-1760 — `alignSelf: 'center'`. Everywhere else this button lives
            in a header row and is sized by its label; here there is no header,
            so the container's default `stretch` blew it to the full 387pt
            column and it read as a banner rather than a control. */}
        <TouchableOpacity
          style={[styles.backBtn, styles.placeholderBtn]}
          onPress={() => setScreen('exploration')}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>← DEAL WITH YOUR CHOICES</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const openBuy = (itemName: string, price: number) => { setBuyQty(1); setPending({ mode: 'buy', itemName, price }); };
  // A recipe is LEARNED, not equipped or stacked — flag it so the confirm shows a
  // single "Learn" and never the item-only "Buy & Equip" / "Buy All" affordances
  // (buying the Aetheric Vest working doesn't put a vest on you).
  const openLearnRecipe = (result: string, price: number) => { setBuyQty(1); setPending({ mode: 'buy', itemName: result, price, isRecipe: true }); };
  const openSell = (itemName: string, price: number, itemId?: string) => { setSellQty(1); setPending({ mode: 'sell', itemName, price, itemId }); };

  /* ⚠⚠⚠ OTA-1734 — ONE SHEET, ONE REINFORCEMENT.
   *
   *  `setPending(null)` is a React state update, so a second tap landing in the
   *  same frame reads the STALE `pending` and would buy a second level the player
   *  never asked for — the shape doSell/doBuy live with because a duplicate sale
   *  is at least visible in the log; a duplicate reinforcement is a permanent,
   *  paid-for change to one object. The latch is SYNCHRONOUS (a ref, not state)
   *  and is cleared when a sheet is OPENED, so "one confirm sheet spends at most
   *  once" holds while +1 → +2 → +3 from three separate sheets stays possible. */
  const reinforceLatch = useRef<string | null>(null);
  const openReinforce = (item: InventoryItem) => {
    reinforceLatch.current = null;
    setPending({ mode: 'reinforce', itemName: item.name, itemId: item.id });
  };
  const doReinforce = () => {
    if (pending?.mode !== 'reinforce') return;
    if (reinforceLatch.current === pending.itemId) return;
    reinforceLatch.current = pending.itemId;
    const { itemName, itemId } = pending;
    const readDur = () => useGameStore.getState().player?.inventory.find((i) => i.id === itemId)?.durability;
    const before = readDur();
    reinforceWithVendor(itemName, itemId);
    const after = readDur();
    // ⚠ The success line is read back off the ITEM, not predicted from the quote.
    //   If the counter refused for a reason the sheet could not see, there is no
    //   change to report and no message claiming one.
    setPending(
      before && after && (after.reinforced ?? 0) > (before.reinforced ?? 0)
        ? {
            mode: 'reinforceDone',
            itemName,
            itemId,
            text: `+${after.reinforced} of ${REINFORCE_MAX_LEVEL}. Maximum durability ${before.max} → ${after.max}, permanently.\n\nIt holds ${after.current}/${after.max} now — the ${after.max - after.current} points it was already down are still down. Reinforcing raises the ceiling; mending is what fills it.`,
          }
        : null,
    );
  };

  // OTA-178 — gate-loss warning helper. Returns the GateKind label
  // when selling THIS item would leave the player with no other
  // item in their pack that unlocks the same gate (climb_steep is
  // the canonical example: a player sells their only Hardened
  // Climbing Strap → next `climb X` refuses with "not without rope"
  // until they find another climb tool).
  //
  // Returns null when:
  //   • the item doesn't have a gate effect at all
  //   • the player has another stack of the same gate item
  //   • another OTHER item in the pack also unlocks the same gate
  //     (so they keep the capability)
  //
  // Player ask: "enact that gate" — i.e., wire the sell-confirm
  // warning we discussed when only one climb tool remained.
  const GATE_LABELS: Record<GateKind, string> = {
    breathe_toxic: 'breathe in toxic zones',
    climb_steep: 'climb steep terrain',
    dig_metal: 'dig through hardened metal',
    fly: 'fly across gaps',
    nightvision: 'see in pitch dark',
    detect_aether: 'detect hidden Aether',
  };
  const resolvers = [findGearByName, findMaterialByName, findExplorationItemByName];
  const gateLossFor = (itemName: string): { gate: GateKind; label: string } | null => {
    if (!player) return null;
    const item = player.inventory.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
    if (!item || item.quantity <= 0) return null;
    const fx = resolveItemEffect(item.name, resolvers);
    if (fx?.kind !== 'gate') return null;
    const gate = fx.unlocks;
    // Selling reduces this stack by 1 — if quantity > 1, the player
    // keeps a copy and the warning is moot.
    if (item.quantity > 1) return null;
    // Check every OTHER inventory item for the same gate.
    for (const other of player.inventory) {
      if (other.id === item.id) continue;
      if (other.quantity <= 0) continue;
      const otherFx = resolveItemEffect(other.name, resolvers);
      if (otherFx?.kind === 'gate' && otherFx.unlocks === gate) return null;
    }
    return { gate, label: GATE_LABELS[gate] ?? gate };
  };
  const pendingGateLoss = pending?.mode === 'sell' ? gateLossFor(pending.itemName) : null;

  // arb57 — current stack size + batch-sell helper. `repsOverride` lets
  // "Sell All" pass the whole stack; default uses the stepper value.
  // ⚠⚠ OTA-1481 — ONE CALL, NOT A LOOP. This used to fire sellToVendor once per
  // unit, and each unit was three set()s, a disk-persisted log line and a FULL
  // state persist — the owner's 155-coin sell stalled the JS thread 2355ms. The
  // slice takes `units` now (the buy side has taken a count since arb92) and
  // the whole stack is one transaction, one line, one persist. OTA-708's rule
  // rides along unchanged: one negotiation, one CHA train.
  const sellStackFor = (name: string) =>
    player.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase())?.quantity ?? 1;
  const pendingSellStack = pending?.mode === 'sell' ? sellStackFor(pending.itemName) : 1;
  const sellRepsClamped = Math.max(1, Math.min(sellQty, pendingSellStack));
  const doSell = (repsOverride?: number) => {
    if (pending?.mode !== 'sell') return;
    const stack = sellStackFor(pending.itemName);
    const reps = Math.max(1, Math.min(repsOverride ?? sellQty, stack));
    sellToVendor(pending.itemName, pending.itemId, { social: true, units: reps });
    setPending(null);
  };
  // arb92 — buy-quantity helpers. Stock comes from the matching offer; the
  // stepper clamps to min(stock, affordable). doBuy fires one quantity-aware
  // purchase (gameStore.buyFromVendor charges per-unit × count and decrements
  // the trader's stock).
  const buyStockFor = (name: string) =>
    vendor.offers.find((o) => o.itemName.toLowerCase() === name.toLowerCase())?.quantity ?? 1;
  // A recipe is a one-time learn — never a stack, so no ×N / Buy All.
  const pendingBuyStock = pending?.mode === 'buy' && !pending.isRecipe ? buyStockFor(pending.itemName) : 1;
  const pendingBuyAfford = pending?.mode === 'buy' && pending.price > 0
    ? Math.floor(player.tc / pending.price)
    : 0;
  const buyMax = Math.max(1, Math.min(pendingBuyStock, Math.max(1, pendingBuyAfford)));
  const buyRepsClamped = Math.max(1, Math.min(buyQty, buyMax));
  // Equip slots an unbought ware would offer — used to decide whether to show
  // the "Buy & Equip" button. A name-only stub is enough: validSlotsForItem
  // resolves weapons/armor/accessories by catalog name + name-regex fallback.
  const equipSlotsForName = (itemName: string): EquipSlot[] =>
    validSlotsForItem({ id: '', name: itemName, kind: 'misc', quantity: 1, tags: [] } as InventoryItem);
  // A recipe can't be equipped — never offer "Buy & Equip" for one (buying the working
  // learns the recipe; it doesn't hand you the item to wear).
  const pendingBuyEquipSlots: EquipSlot[] = pending?.mode === 'buy' && !pending.isRecipe ? equipSlotsForName(pending.itemName) : [];

  // Buy one and equip it immediately. A single valid slot (armor / accessory)
  // equips straight away; a weapon (main OR off hand) opens the hand-choice
  // prompt. We read the freshly-bought instance from the live store so the
  // slot decision reflects the real item (tags/kind), then equip by name —
  // equipItem already handles two-handed displacement + HP/durability baking.
  const doBuyEquip = () => {
    if (pending?.mode !== 'buy') return;
    const name = pending.itemName;
    buyFromVendor(name, 1);
    setPending(null);
    const bought = useGameStore.getState().player?.inventory.find((i) => i.name === name);
    const slots = bought ? validSlotsForItem(bought) : equipSlotsForName(name);
    if (slots.length === 1) {
      equipItem(name, slots[0]!);
    } else if (slots.length > 1) {
      setPendingEquip({ itemName: name, slots });
    }
  };
  const doBuy = (override?: number) => {
    if (pending?.mode !== 'buy') return;
    const n = Math.max(1, Math.min(override ?? buyQty, buyMax));
    buyFromVendor(pending.itemName, n);
    setPending(null);
  };
  // OTA 030 — steal DC is tiered by vendor source. Hub vendors have no
  // demeanor and default to DC 16 (alert, help nearby). Roadside
  // sketchy = DC 11, honest = DC 14. Pre-compute here so the
  // confirmation modal can show DEX vs DC up-front.
  const stealDc = vendor.demeanor === 'sketchy' ? 11 : vendor.demeanor === 'honest' ? 14 : 16;
  const openSteal = (itemName: string) => setPending({ mode: 'steal', itemName, dc: stealDc });
  const openDismiss = () => setPending({ mode: 'dismiss' });
  const cancel = () => setPending(null);
  const confirmAction = () => {
    if (!pending) return;
    if (pending.mode === 'buy') buyFromVendor(pending.itemName);
    else if (pending.mode === 'sell') sellToVendor(pending.itemName, pending.itemId);
    else if (pending.mode === 'steal') stealFromVendor(pending.itemName);
    else if (pending.mode === 'dismiss') dismissVendor();
    else if (pending.mode === 'bulkSellCommonGear') {
      // ⚠ Re-plan at fire time against the CURRENT list. The confirm showed a
      // snapshot; between the tap and the yes the player may have sold a row by
      // hand, and selling from a stale plan would try to sell what is gone.
      // ⚠ OTA-1481 — one call per ROW, whole stack as `units`. Same prices, same
      // ledger, same standing effects the per-unit loop paid; what changed is
      // the cost of paying them — one state write and one persist per row
      // instead of per piece. Only the first row is the negotiation (OTA-727).
      let bulkRowIdx = 0;
      for (const row of planCommonGearSale(bulkSellable).rows) {
        const reps = Math.max(1, row.item.quantity ?? 1);
        sellToVendor(row.item.name, row.item.id, { social: bulkRowIdx === 0, units: reps });
        bulkRowIdx++;
      }
    }
    else if (pending.mode === 'bulkSellLoot') {
      // ⚠ OTA-1706 — same contract as the gear sweep above: re-plan at fire time
      // against the LIVE list, one call per row with the whole stack as `units`,
      // and only the first row negotiates.
      let lootRowIdx = 0;
      for (const row of planLootSale(bulkSellable).rows) {
        const reps = Math.max(1, row.item.quantity ?? 1);
        sellToVendor(row.item.name, row.item.id, { social: lootRowIdx === 0, units: reps });
        lootRowIdx++;
      }
    }
    else if (pending.mode === 'accept') {
      if (pending.kind === 'faction') acceptFactionQuest(pending.title);
      else if (pending.kind === 'hunt') acceptHunt(pending.title);
      else if (pending.kind === 'mystery') acceptMystery(pending.title);
      else if (pending.kind === 'storyline') acceptStoryline(pending.title);
    }
    setPending(null);
  };

  /* ⚠⚠ OTA-1734 — the SHEET's quote, re-read from the LIVE item on every render.
   *  The row's quote was a snapshot; between the tap and the yes the player can
   *  have spent the materials elsewhere, so what the confirm shows and what the
   *  buttons allow are computed from the inventory as it stands right now. */
  const pendingReinforce = pending?.mode === 'reinforce'
    ? (() => {
        const it = player.inventory.find((i) => i.id === pending.itemId);
        if (!it) return null;
        const quote = reinforceQuote(it);
        return {
          item: it,
          quote,
          missing: missingIngredientsList(quote.materials, player.inventory) as Array<{ name: string; quantity: number }>,
        };
      })()
    : null;
  /** Which refusal the sheet is showing, or null when the work can be bought.
   *  ⚠ Ordered the way the counter itself checks (OTA-984's rule: know that BOTH
   *  can be paid before either is spent), so the sheet names the same obstacle
   *  `reinforceWithVendor` would name. */
  const reinforceBlocked: 'gone' | 'refused' | 'tc' | 'materials' | null =
    pending?.mode !== 'reinforce' ? null
    : !pendingReinforce ? 'gone'
    : pendingReinforce.quote.refusal ? 'refused'
    : player.tc < pendingReinforce.quote.tc ? 'tc'
    : pendingReinforce.missing.length > 0 ? 'materials'
    : null;

  // arb150 — the SELL confirm previews the SPECIFIC instance (by id) so its
  // rolled stats/durability match the row tapped; BUY previews the catalog row.
  const preview = pending?.mode === 'buy'
    ? getItemPreview(pending.itemName)
    : pending?.mode === 'sell' || pending?.mode === 'reinforce' || pending?.mode === 'reinforceDone'
      // ⚠ OTA-1734 — the reinforcement arms preview the INSTANCE for the same
      //   reason the sell arm does, and on the DONE arm that is the point: the
      //   preview the player is looking at is re-read after the work, so the new
      //   ceiling shows on the card in the sheet as well as in the message.
      ? (() => {
          const it = player.inventory.find((i) => i.id === pending.itemId);
          const base = getItemPreviewForInstance(it ?? { name: pending.itemName });
          // ⚠ OTA-1736 — the sheet's headline is the INSTANCE's name (coating in
          //   front), the same string the row and the pack card show for it.
          return it ? { ...base, name: instanceDisplayName(it) } : base;
        })()
      : null;
  const canAffordPending = pending?.mode === 'buy' ? player.tc >= pending.price : true;
  // OTA 039 — corruption-tier markup. Multiplied into every BUY
  // display price + applied for real in gameStore.buyFromVendor.
  const corruptionTier = corruptionTierOf(player.corruption ?? 0);
  const corruptionMult = corruptionPriceMultiplier(corruptionTier);
  const corruptionMarkupPct = Math.round((corruptionMult - 1) * 100);
  // OTA-805 — CHA-scaled faction rapport price break (0..0.20), once you've earned
  // dealing with this vendor's faction. Cheaper buys, better sell-backs. Mirrors the
  // gameStore buy/sell math so the displayed prices match what actually transacts.
  const rapportPct = Math.round(rapportMod * 100);
  // OTA-849/865 — the two modifiers that also move the REAL transaction price but the
  // display used to omit: the vendor faction's fortunes (tide teeth) and LOCAL WAR HEAT.
  // Computed here so the screen shows exactly what buyFromVendor / sellToVendor charge.
  // ⚠ OTA-1156 — THE TWO THIS SCREEN STILL DROPPED, and the comment above has been
  // wrong since they landed. `buyFromVendor` multiplies in SIX factors; this screen
  // passed FOUR. Missing: OTA-1053's per-person regard (a vendor who likes or
  // dislikes you moves the price) and OTA-1066's Phase-4 pressure tide. So the shown
  // price and the charged price silently disagreed for any non-neutral vendor —
  // inside `vendorPricing.ts`, whose entire stated purpose is that these two can
  // never drift. Computed from the same helpers the store uses, not re-derived.
  const vendorRegardMult = vendor
    ? regardPriceMult(npcRegard(getRelation({ npcRelations }, vendorNpcId(vendor))))
    : 1;
  const pressureTideMult = player
    ? tidePriceMultiplier(tideStage(player.hoursElapsed ?? 0, profileOf(player)))
    : 1;
  // OTA-1689 — the menace markup, the same helper the store charges through.
  const vendorMenaceMult = player
    ? menacePriceMult(decayedMenace(player.menace ?? 0, player.menaceUpdatedHour ?? 0, player.hoursElapsed ?? 0))
    : 1;
  // The two factions whose war-parties are thickest here — for the "prices are up" line.
  const contestNames = (contestKey === '' ? [] : contestKey.split('\u0000'))
    .map((id) => (factionsData as { id: string; name: string }[]).find((f) => f.id === id)?.name ?? null)
    .filter((n): n is string => !!n);
  // Show the war-market note once the ground is meaningfully contested (not on one patrol).
  const warNote = warHeat >= 0.25;
  // OTA-812 — recipes this vendor will TEACH for TC, surfaced as buttons so the
  // player doesn't have to know the typed "buy <name>" command. Same source the
  // store's buy path checks; tapping LEARN calls buyFromVendor(result) which routes
  // through the recipe-learn branch. Filtered to the ones not yet known.
  // ⚠⚠⚠ OTA-1731 — THE WHOLE MENU, OWNED ROWS INCLUDED. Owner: *"ensure that if
  // I have already bought a 'working to learn' I can see that I own it if someone
  // tries to sell it to me again."* A learned row used to vanish — three workings
  // became two — so an absence had to carry the meaning "you own this", which no
  // absence can. The vendor genuinely still stocks it (OTA-802 fixed the slice so
  // it cannot reroll), so the row stays and says so.
  //
  // ⚠ The second `.filter` on knownRecipes that stood here is gone with it: it
  // repeated a rule the engine had already applied, which is how the display and
  // the shelf ended up with two opinions about the same three rows.
  // Inventory items the player can sell — exclude the EXACT equipped instances +
  // unsellable. OTA-687 — exclude by INSTANCE ID (equippedInstanceIds), not name,
  // so a spare copy of an equipped item's name is a different instance and stays
  // sellable (before, one equipped "Stone-Grip Gloves" hid every copy you owned).
  /* ⚠⚠⚠ OTA-1734 — WHAT THIS COUNTER CAN STRENGTHEN, quoted once per row.
   *
   *  ⚠ WEAPONS. The engine refuses only "no durability" and "already +3", so it
   *  would happily strengthen a helm; the SERVICE offered here is the weapon
   *  ladder the owner specified, and the list is where that scope is expressed
   *  rather than in a second refusal the engine would then disagree with.
   *
   *  ⚠ ONE ROW PER INSTANCE, keyed by id — two copies of a blade at +0 and +2 are
   *  two different offers, and picking by name could only ever reach one of them.
   *
   *  ⚠ MAXED ROWS STAY. OTA-1731's lesson at this same screen: an absence cannot
   *  carry the meaning "this one is finished". The row reads ✓ +3 MAX and does not
   *  act, exactly as an owned working does.
   *
   *  ⚠ THE ONE IN YOUR HAND FIRST — a player who came here to strengthen a weapon
   *  came about the weapon they are carrying. */
  // arb120 — bandolier (quick-throwables) and tool-pouch items aren't "equipped"
  // by slot, so they DON'T get filtered out of the sell list — but they're part
  // of the player's working loadout and selling one by accident stings. Flag
  // them in the row so the player sees what they're about to give up. (Keyed by
  // instance id, so a spare of the same name stays cleanly sellable.)
  // ⚠ OTA-1738 — the counter's teaching, one card at a time, each keyed on the
  // rows this screen is about to render (reinforceRows, recipeOffers, the pack's
  // worn pieces, the dog market lookup), so a card can never describe a service
  // that is not on the table in front of the player.
  const counterTeaching = useTeachingSlot([
    { id: TEACH.vendor_first_open_v2.id, when: true },
    { id: TEACH.reinforce_first.id, when: reinforceRows.length > 0 },
    { id: TEACH.workings_first.id, when: recipeOffers.some((o) => !o.known && player.tc >= o.price) },
    { id: TEACH.repair_vendor_first.id, when: player.inventory.some((i) => !!i.durability && i.durability.current < i.durability.max) },
    { id: TEACH.dog_replacement_first.id, when: (vendor?.offers ?? []).some((o) => !!dogMarketRowByName(o.itemName)) },
  ]) as keyof typeof TEACH | null;
  const bandolierIds = new Set(player.equipped?.bandolierIds ?? []);
  const toolPouchIds = new Set(player.equipped?.toolPouchIds ?? []);
  // HANDOFF #12 — sell-back UI polish. Sort options so the player can
  // surface the most valuable junk first (default), alphabetize for
  // hunting, or group by rarity for clearing low-tier clutter.

  // OTA-1099 — the group-sell working set. Derived from `sellable` every render
  // rather than stored, so a selected row that stops being sellable (sold,
  // dropped, equipped, or the vendor dismissed) simply falls out of the group
  // instead of lingering as a stale id the SELL button would silently skip.
  // ⚠⚠ OTA-1320 — THE BULK SWEEP NEVER TAKES YOUR LAST GATE TOOL. The single-item
  // sell stops on a red warning when the piece is your ONLY way to satisfy a gate
  // (OTA-178, the climbing-strap case). planCommonGearSale predates a reachable
  // bulk confirm (its button was dead until OTA-1307), so the sweep inherited no
  // such stop — one tap could silently sell the last Hardened Climbing Strap the
  // single-item path would have made you confirm in red. Same philosophy the
  // planner already states for Crucible work — "the one thing a bulk sell must
  // never do is spend something the player built" — extended to something the
  // player cannot act without. A SPARE copy still sells (gateLossFor is null when
  // quantity > 1 or another gate-satisfier exists); only the last one is held out.
  const bulkSellable = sellable.filter(({ item }) => !gateLossFor(item.name));
  // ⚠ OTA-1349 — B5: what that filter just held out of the sweep, NAMED, so the
  // confirm can say it instead of letting a held-out mask read as a broken
  // button. Narrowed to rows the plan would otherwise have sold (Common gear).
  const bulkHeldBack = planCommonGearSale(
    sellable.filter(({ item }) => !!gateLossFor(item.name)),
  ).rows.map((r) => ({ name: r.item.name, label: gateLossFor(r.item.name)!.label }));
  const sellableById = new Map(sellable.map((row) => [row.item.id, row]));
  const selectedRows = sellSelected
    .map((id) => sellableById.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r);
  // Whole stacks, matching the label: a row that reads "(x5)" and is ticked sells
  // all five, and the total below says exactly what that pays.
  const selectedUnits = selectedRows.reduce((n, r) => n + (r.item.quantity ?? 1), 0);
  const selectedTotal = selectedRows.reduce((n, r) => n + r.price * (r.item.quantity ?? 1), 0);
  // Warnings the single-item confirm would have shown, gathered for the group so
  // a bulk sale can't quietly do what one sale would have stopped to ask about.
  const selectedGateLosses = selectedRows
    .map((r) => ({ name: r.item.name, loss: gateLossFor(r.item.name) }))
    .filter((x): x is { name: string; loss: NonNullable<ReturnType<typeof gateLossFor>> } => !!x.loss);
  const selectedLoadout = selectedRows
    .filter((r) => bandolierIds.has(r.item.id) || toolPouchIds.has(r.item.id))
    .map((r) => r.item.name);

  const exitSellSelect = () => { setSellSelectMode(false); setSellSelected([]); };
  const toggleSellSelect = (id: string) => {
    setSellSelected((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      // Emptying the group leaves the mode — otherwise the player is parked in a
      // state with nothing to act on and a bar that says "0".
      if (next.length === 0) setSellSelectMode(false);
      return next;
    });
  };
  const beginSellSelect = (id: string) => { setSellSelectMode(true); setSellSelected([id]); };
  const doGroupSell = () => {
    // Snapshot first: each sale mutates the inventory the rows were derived from.
    const plan = selectedRows.map((r) => ({ name: r.item.name, id: r.item.id, qty: r.item.quantity ?? 1 }));
    // OTA-727's rule, applied to the whole group: a bulk sale is ONE
    // negotiation, so only the very first ROW across the entire group trains
    // Charisma. ⚠ OTA-1481 — each row's whole stack goes in one call now; the
    // per-unit loop was the 2355ms stall.
    plan.forEach((p, idx) => {
      sellToVendor(p.name, p.id, { social: idx === 0, units: p.qty });
    });
    setGroupSellConfirm(false);
    exitSellSelect();
  };

  // OTA-686 — file a vendor BUY offer (just a name) into an inventory category.
  // findCatalogItem resolves the wares' kind + tags so categorizeItem buckets it
  // exactly like the same item would sit in the player's pack; unknown/inferred
  // names fall back to categorizeItem's own name heuristics.
  const categorizeOfferName = (name: string): InventoryCategory => {
    const cat = findCatalogItem(name);
    return categorizeItem({
      id: '', name, quantity: 1,
      kind: (cat?.kind ?? 'misc') as InventoryItem['kind'],
      rarity: cat?.rarity,
      tags: cat?.tags ?? [],
    } as InventoryItem);
  };
  // Shared collapsible category header, styled like the inventory's.
  const renderSectionHeader = (key: string, cat: InventoryCategory, count: number, collapsed: boolean) => (
    <TouchableOpacity
      style={[styles.sectionHeader, { borderLeftColor: CATEGORY_COLORS[cat] }]}
      activeOpacity={0.7}
      onPress={() => setCollapsedSections((s) => ({ ...s, [key]: !(s[key] ?? true) }))}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
    >
      <View style={styles.sectionHeaderLeft}>
        <Text style={[styles.sectionChevron, { color: CATEGORY_COLORS[cat] }]}>{collapsed ? '▸' : '▾'}</Text>
        <Text style={[styles.sectionLabel, { color: CATEGORY_COLORS[cat] }]}>{CATEGORY_LABEL[cat].toUpperCase()}</Text>
      </View>
      <Text style={styles.sectionCount}>{count}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* OTA-1205 — v2 id: the body gained the host-gear rule (OTA-1201) and dismissals
          are per-install, so the old id would hide the new line from existing testers. */}
      {/* ⚠ OTA-1738 — ONE card per visit. The trader card first; then, on later
          visits or once it is dismissed, the service whose rows are actually on
          this counter and actionable: reinforce, workings, repair, a dog. Each
          keys on the same state that renders its rows — never on which vendor. */}
      {counterTeaching && (
        <FirstTimeHint id={TEACH[counterTeaching].id} title={TEACH[counterTeaching].title} body={TEACH[counterTeaching].body} />
      )}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">SHOP</Text>
        <TouchableOpacity
          onPress={openDismiss}
          style={styles.dismissBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.dismissText}>DISMISS</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.vendorCard}>
        <Text style={styles.vendorName}>{vendor.name}</Text>
        <Text style={styles.vendorTitle}>{vendor.title}</Text>
        <Text style={styles.vendorDesc}>{vendor.description}</Text>
        {/* OTA-805 — rapport price break. Shown once the player has earned dealing
            with this faction (rapport quest, Charisma) — and, OTA-1341, once the
            STANDING LADDER moves the price either way: loyalty earns the break on
            its own, hostility shows up as an honest markup instead of a silent one. */}
        {rapportMod > 0 && (
          <Text style={styles.rapportBanner}>
            ✦ Trusted partner — {rapportPct}% off buys, +{rapportPct}% on sell-backs (standing & charm)
          </Text>
        )}
        {rapportMod < 0 && (
          <Text style={styles.rapportBanner}>
            ✦ Bad blood — they deal, but at +{Math.abs(rapportPct)}% on buys and {rapportPct}% on your sell-backs (faction standing)
          </Text>
        )}
        {/* ⚠⚠⚠ OTA-1470 — THE FULL-WIDTH CRUCIBLE BUTTON THAT USED TO LIVE HERE
            IS GONE, and its work moved to the tile chip in ExplorationScreen's
            `placeChipRow`. Owner:

              "it's only the initial time i enter that I see the messed up fuse
               block. it's not that it's broken, it just shouldn't be there, it
               should be a separate chip from the start."

            He was seeing TWO DIFFERENT AFFORDANCES for one Crucible, and which
            one he got depended on whether he had already paid: before the 25 TC
            this button; after it, `fusionPending` flips and the same Crucible
            becomes a chip beside the store chip on the tile. Same Crucible, same
            tap, two pieces of UI swapping under him mid-session.

            arb153 was right that the two must never both show. It picked the
            wrong survivor. The chip composes — it shares a row with the store
            chip, which is the layout he asks for by name — so the chip stays and
            this goes.

            ⚠ NOTHING IS STRANDED. The chip fires the same `useVendorCrucible`,
            which still owns the 25 TC charge, the tour-mode refusal and the
            first-timer refusal; and the chip mirrors the `macroVisitSeq >= 1`
            gate at render time exactly as this button learned to. `fuse` typed
            at a vendor tile still works too.

            ⚠⚠ TWO RULES THIS BUTTON CARRIED MOVE WITH IT, because both were
            learned the hard way and neither is obvious from the chip's side:

              • arb103/arb153 — every vendor fires a portable Crucible for 25 TC,
                EXCEPT where the location already has its own (outpost / Hidden
                Market / a live fusion permit). The chip's `!atLocationCrucible`
                is that same rule; the two must never both show.
              • "not before you have ever left" — `useVendorCrucible` refuses
                outright while `macroVisitSeq < 1`, and that check once lived
                ONLY in the handler, so the button rendered lit, took the tap and
                answered with a wall. His log: four taps, four identical refusals
                in seventy seconds. The requirement is known at render time, so
                it is consulted at render time — on the chip now, as it was here. */}
      </View>

      {tutorialDemoVendor && (
        <View style={styles.tourBanner}>
          <Text style={styles.tourBannerText}>
            TOUR MODE — buy, sell, and contracts are disabled. Irma vanishes when the tour ends.
          </Text>
        </View>
      )}

      <View style={styles.walletRow}>
        <Text style={styles.walletLabel}>Your purse</Text>
        <Text style={styles.walletValue}>{player.tc} TC</Text>
      </View>
      {corruptionMarkupPct > 0 && (
        <Text style={styles.corruptionMarkup}>
          ⚠ +{corruptionMarkupPct}% prices — your aether unsettles them. ({corruptionTier})
        </Text>
      )}
      {/* OTA-865 — war-market flavour: contested ground means soldiers are buying, so the
          trader marks up (and pays a touch more). The ▲/▼ next to each price shows the net. */}
      {warNote && (
        <Text style={styles.warMarket}>
          ⚔ {contestNames.length >= 2
            ? `The fighting between the ${contestNames[0]} and the ${contestNames[1]} is cleaning them out.`
            : contestNames.length === 1
              ? `${contestNames[0]} war-parties are all over this ground.`
              : 'The fighting nearby has soldiers buying up supplies.'}{' '}
          Prices run high — your standing and charm matter more here.
        </Text>
      )}

      {/* OTA-1101 — while a group is open the bar TAKES THE TAB ROW'S PLACE and
          holds it. Owner: "the new line that says sell group needs to stay
          anchored at the top and replace the buy sell buttons until, you either
          sell the group or cancel the group."
          Two things follow from that, and both are the point. It is ANCHORED:
          the tab row lives outside the ScrollView, so putting the bar here means
          it cannot scroll away from you while you tick rows further down the
          list — which is exactly when you most want to see the running total.
          And it REPLACES: BUY is not a thing you can wander into mid-group, so
          the only two ways out are the two the bar offers. That is what makes
          the mode honest instead of something you can leave by accident. */}
      {sellSelectMode ? (
        <View style={styles.groupBar}>
          <View style={styles.groupBarInfo}>
            <Text style={styles.groupBarCount}>
              ☑ {selectedRows.length} picked{selectedUnits > selectedRows.length ? ` · ${selectedUnits} units` : ''}
            </Text>
            <Text style={styles.groupBarTotal}>+{selectedTotal} TC</Text>
          </View>
          <View style={styles.groupBarActions}>
            <TouchableOpacity
              onPress={exitSellSelect}
              style={styles.groupBarCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel the group and go back to selling one at a time"
            >
              <Text style={styles.groupBarCancelText}>CANCEL</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setGroupSellConfirm(true)}
              disabled={selectedRows.length === 0}
              style={[styles.groupBarSell, selectedRows.length === 0 && styles.groupBarSellOff]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ disabled: selectedRows.length === 0 }}
              accessibilityLabel={`Sell the group of ${selectedRows.length} for ${selectedTotal} trade coin`}
            >
              <Text style={styles.groupBarSellText}>SELL GROUP</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
      <TTabBar
        density="tight"
        value={mode}
        onChange={(k) => {
          // OTA-1099 — leaving the SELL tab ends the group. A selection you can
          // no longer see is a hidden mode waiting to surprise you on the way
          // back. OTA-1101 — belt-and-braces: while a group is open this row is
          // not even rendered, so BUY is unreachable until the group resolves.
          if (k === 'buy') exitSellSelect();
          setMode(k as 'buy' | 'sell');
        }}
        tabs={[{ key: 'buy', label: 'BUY' }, { key: 'sell', label: 'SELL' }]}
        right={(
          /* arb151 — CONTRACTS opens a mission-board-style popup instead of an
             inline tab (player preferred the Mission Board modal). It's a
             button, not a tab, so it never holds the selected state — which is
             exactly why it goes in `right` rather than in `tabs`. It wears the
             kit's chip so the row still reads as one piece, as it always has.
             ⚠ OTA-1684 — ON EVERY VENDOR NOW. It was gated on `vendor.faction`,
             so a roadside trader (Skiv, 09-04 22:10: "haven't seen the missions
             button on a vendor in a while") simply had no button — and a
             missing control reads as a broken one. The board is still empty for
             them by design; the popup says so in words (B15: a refusal always
             speaks). */
          <TouchableOpacity
            style={kit.tabChip}
            onPress={() => setContractsOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={kit.tabLabel}>CONTRACTS ▸</Text>
          </TouchableOpacity>
        )}
      />
      )}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {mode === 'buy' ? (
          <>
          {vendor.offers.length === 0 && recipeOffers.length === 0 ? (
            <Text style={styles.empty}>The vendor's pack is empty. Nothing more to trade.</Text>
          ) : (
            CATEGORY_ORDER.map((cat) => {
              const catOffers = vendor.offers
                .map((o, i) => ({ o, i }))
                .filter(({ o }) => categorizeOfferName(o.itemName) === cat);
              if (catOffers.length === 0) return null;
              const secKey = `buy_${cat}`;
              const collapsed = collapsedSections[secKey] ?? true;
              const count = catOffers.reduce((sum, { o }) => sum + (o.quantity ?? 1), 0);
              return (
                <View key={secKey} style={styles.section}>
                  {renderSectionHeader(secKey, cat, count, collapsed)}
                  {!collapsed && catOffers.map(({ o, i }) => {
              // OTA 039 — corruption-tier markup. Show the marked-up
              // price; canAfford / buyFromVendor both compute on the
              // same value so the player never sees a mismatch.
              // OTA-805 — CHA rapport discount folds in the same way (mirrors
              // buyFromVendor's effectivePrice).
              // OTA-865 — the FULL buy price (now including faction-tide + war heat, which
              // the display used to drop), from the same helper buyFromVendor uses so the
              // shown price is exactly what transacts. The ▲/▼ ticker compares it to base.
              const effPrice = finalBuyPrice(o.price, { corruptionMult, buyDiscount: rapportMod, tideMult: vendorTideMult, warBuyMult, regardMult: vendorRegardMult, pressureTideMult, menaceMult: vendorMenaceMult });
              const buyTick = priceArrow(effPrice, o.price, 'buy');
              const canAfford = player.tc >= effPrice;
              const itemPreview = getItemPreview(o.itemName);
              // ⚠ OTA-1736 — knowledge the character already holds is not for sale.
              //   Same treatment as an owned working (OTA-1731): the price is
              //   REPLACED by ✓ KNOWN, the row is greyed and is not a button.
              const knownRow = !!shelfKnowledge(o.itemName, player)?.known;
              const owned = player.inventory
                .filter((inv) => inv.name.toLowerCase() === o.itemName.toLowerCase())
                .reduce((sum, inv) => sum + inv.quantity, 0);
              return (
                // OTA-258 — broke-dim is now scoped to the BUY body only,
                // NOT the parent row. Previously that opacity
                // was applied here, which dimmed everything inside the row
                // including the STEAL button on the right — backwards
                // affordance, since stealing is what a broke player would
                // want to reach for. Steal has its own gates (DC roll, witness
                // checks in `stealFromVendor`) and never
                // touched TC affordability anyway. Now: BUY body dims when
                // unaffordable, STEAL stays full bright.
                <View
                  key={`buy_${o.itemName}_${i}`}
                  style={tRowStyle()}
                >
                  <View style={[styles.offerStripe, { backgroundColor: rarityColor(itemPreview.rarity) }]} />
                  <TouchableOpacity
                    style={[styles.offerBody, (knownRow || !canAfford) && styles.offerBodyBroke]}
                    onPress={knownRow ? undefined : () => openBuy(o.itemName, effPrice)}
                    disabled={knownRow}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: knownRow }}
                    accessibilityLabel={knownRow ? `${o.itemName} — already known` : undefined}
                  >
                    <View style={styles.offerHead}>
                      <Text style={styles.offerName} numberOfLines={1}>{o.itemName}</Text>
                      <Text style={[styles.offerPrice, knownRow ? styles.offerPriceKnown : (!canAfford && styles.offerPriceBroke)]}>
                        {knownRow ? '\u2713 KNOWN' : <>{effPrice} TC{buyTick ? <Text style={buyTick.good ? styles.tickGood : styles.tickBad}> {buyTick.glyph}</Text> : null}</>}
                      </Text>
                    </View>
                    <View style={styles.offerSubHead}>
                      <Text style={styles.offerKind} numberOfLines={1}>
                        {itemPreview.kindLabel}{itemPreview.rarity ? ` · ${itemPreview.rarity}` : ''}{knownRow ? ' · already in your hands' : ''}
                      </Text>
                      {/* arb-fix — stock count and owned count stack one above
                          the other (right-aligned), not jammed on one line. */}
                      <View style={styles.offerCounts}>
                        {(o.quantity ?? 1) > 1 && (
                          <Text style={styles.offerStock}>×{o.quantity} in stock</Text>
                        )}
                        {owned > 0 && (
                          <Text style={styles.offerOwned}>you have {owned}</Text>
                        )}
                      </View>
                    </View>
                    {itemPreview.stats.length > 0 && (
                      <Text style={styles.offerStats} numberOfLines={2}>
                        {itemPreview.stats.join(' · ')}
                      </Text>
                    )}
                  </TouchableOpacity>
                  {/* OTA 030 — STEAL button. DC stamped on the chip so the
                      player knows the risk before tapping. */}
                  {!tutorialDemoVendor && (
                    <TouchableOpacity
                      onPress={() => openSteal(o.itemName)}
                      style={styles.stealBtn}
                      hitSlop={6}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                    >
                      <Text style={styles.stealText}>STEAL</Text>
                      <Text style={styles.stealDc}>DC {stealDc}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
                </View>
              );
            })
          )}
          {/* OTA-812 — WORKINGS TO LEARN. Recipes the vendor teaches for TC, now
              tappable buttons instead of a typed "buy <name>" the player had to guess
              from the arrival prose. Tapping opens the same buy-confirm; confirming
              routes through buyFromVendor's recipe-learn branch. */}
          {recipeOffers.length > 0 && (() => {
            const secKey = 'buy_recipes';
            /* ⚠⚠ OTA-1764 — COLLAPSED BY DEFAULT, LIKE EVERY OTHER SECTION ON THE
             * COUNTER. Owner: *"workings to learn and reinforce your gear should
             * start collapsed like the rest of the categories when it shops and
             * vendors."*
             * ⚠ This USED to read `?? false` with the note "open by default —
             * this is the discoverable bit", and that reasoning is overridden
             * rather than lost: a section that opens itself while its ten
             * neighbours stay shut does not read as discoverable, it reads as
             * the odd one out, and it pushes the wares the player came for off
             * the first screen. The count in the header is what advertises it
             * now — the same job, without spending the fold. */
            const collapsed = collapsedSections[secKey] ?? true;
            const RECIPE_ACCENT = '#c9a86a';
            return (
              <View style={styles.section}>
                <TouchableOpacity
                  style={[styles.sectionHeader, { borderLeftColor: RECIPE_ACCENT }]}
                  activeOpacity={0.7}
                  onPress={() => setCollapsedSections((s) => ({ ...s, [secKey]: !(s[secKey] ?? true) }))}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !collapsed }}
                >
                  <View style={styles.sectionHeaderLeft}>
                    <Text style={[styles.sectionChevron, { color: RECIPE_ACCENT }]}>{collapsed ? '▸' : '▾'}</Text>
                    <Text style={[styles.sectionLabel, { color: RECIPE_ACCENT }]}>WORKINGS TO LEARN</Text>
                  </View>
                  <Text style={styles.sectionCount}>{recipeOffers.length}</Text>
                </TouchableOpacity>
                {!collapsed && recipeOffers.map((o) => {
                  const preview = getItemPreview(o.result);
                  const canAfford = player.tc >= o.price;
                  return (
                    <View key={`recipe_${o.result}`} style={tRowStyle()}>
                      <View style={[styles.offerStripe, { backgroundColor: rarityColor(preview.rarity) }]} />
                      <TouchableOpacity
                        // ⚠ OTA-1731 — an owned working is NOT a button. Tapping it
                        // would open a confirm sheet for a purchase the store then
                        // refuses, which is the "a control that does nothing" defect
                        // OTA-220 rules out. It reads as owned and does not act.
                        style={[styles.offerBody, (o.known || !canAfford) && styles.offerBodyBroke]}
                        onPress={o.known ? undefined : () => openLearnRecipe(o.result, o.price)}
                        disabled={o.known}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: o.known }}
                        accessibilityLabel={o.known ? `${o.result} — already known` : undefined}
                      >
                        <View style={styles.offerHead}>
                          <Text style={styles.offerName} numberOfLines={1}>{o.result}</Text>
                          {/* ⚠ the price is REPLACED, not struck through: what the
                              player needs here is "I own this", not a number they
                              will never pay. */}
                          <Text style={[styles.offerPrice, o.known ? styles.offerPriceKnown : (!canAfford && styles.offerPriceBroke)]}>
                            {o.known ? '✓ KNOWN' : `${o.price} TC`}
                          </Text>
                        </View>
                        <View style={styles.offerSubHead}>
                          <Text style={styles.offerKind} numberOfLines={1}>
                            recipe{preview.rarity ? ` · ${preview.rarity}` : ''}{o.known ? ' · already in your book' : ' · learn to craft'}
                          </Text>
                        </View>
                        {/* ⚠⚠⚠ OTA-1668 — WHAT THE WORKING MAKES, on the row.
                            Owner: *"at workings to learn at a vendor, the things
                            you buy need more than a name, they need to tell you
                            what they are and what they do on the button line. I
                            understand that if you tap on it you get the full
                            detailed view but that's an extra step. If I know
                            it's an axe with electric base damage and it's a 2d10
                            then it helps me choose faster."*

                            ⚠ This list was the ONLY buy surface with no such
                            line — the ordinary offer rows above have carried
                            kind + stats for OTAs. A recipe row said the result's
                            NAME, its price, and the word "recipe", so choosing
                            between two workings meant tapping both and backing
                            out of one. The headline comes from the same
                            getItemPreview the confirm sheet reads, so the row
                            and the sheet can never disagree, and the damage
                            glyph is the one the combat button paints. */}
                        {preview.headline ? (
                          <Text style={styles.offerStats} numberOfLines={1}>{preview.headline}</Text>
                        ) : null}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            );
          })()}
          {/* ⚠⚠⚠ OTA-1734 — REINFORCE YOUR GEAR. The mechanic shipped in OTA-1733
              had no way in but a typed command nobody is told about, which is the
              same shape the workings were in before OTA-812.

              ⚠ IT IS THE WORKINGS ROW, REUSED — a service the counter offers, listed
              as tappable rows, confirmed through the ONE shared sheet. Owner: *"use
              its established interaction pattern… do not create a special standalone
              reinforcement screen."* Nothing here is a new kind of control.

              ⚠⚠ AND NOTHING HERE IS ARITHMETIC. Every number on these rows comes off
              `reinforceQuote`, which is the call `reinforceWithVendor` prices from.
              The row, the confirm sheet and the transaction are one sum read three
              times, so a shown price cannot become a different charged price.

              ⚠ SHOWN AT ANY VENDOR, exactly as `repairWithVendor` is: the counter is
              the gate, and there is one rule about who can do this work rather than
              a screen rule and an engine rule that can disagree. What it is NOT is
              free from the pack — that was the owner's line. */}
          {reinforceRows.length > 0 && (() => {
            const secKey = 'buy_reinforce';
            // ⚠ OTA-1764 — collapsed by default, matching the wares above it.
            const collapsed = collapsedSections[secKey] ?? true;
            const FORGE_ACCENT = '#7fb0a8';
            return (
              <View style={styles.section}>
                <TouchableOpacity
                  style={[styles.sectionHeader, { borderLeftColor: FORGE_ACCENT }]}
                  activeOpacity={0.7}
                  onPress={() => setCollapsedSections((s2) => ({ ...s2, [secKey]: !(s2[secKey] ?? true) }))}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: !collapsed }}
                >
                  <View style={styles.sectionHeaderLeft}>
                    <Text style={[styles.sectionChevron, { color: FORGE_ACCENT }]}>{collapsed ? '\u25b8' : '\u25be'}</Text>
                    <Text style={[styles.sectionLabel, { color: FORGE_ACCENT }]}>REINFORCE YOUR GEAR</Text>
                  </View>
                  <Text style={styles.sectionCount}>{reinforceRows.length}</Text>
                </TouchableOpacity>
                {!collapsed && reinforceRows.map(({ item, quote }) => {
                  const maxed = quote.refusal !== null;
                  const short = maxed ? [] : missingIngredientsList(quote.materials, player.inventory);
                  const cannotPay = !maxed && (player.tc < quote.tc || short.length > 0);
                  return (
                    <View key={`reinforce_${item.id}`} style={tRowStyle()}>
                      <View style={[styles.offerStripe, { backgroundColor: rarityColor(item.rarity) }]} />
                      <TouchableOpacity
                        // ⚠ A maxed row is NOT a button (OTA-220: no control that
                        //   does nothing). A row you cannot yet AFFORD still is —
                        //   the sheet is where the shortfall is named, exactly as
                        //   an unaffordable ware behaves two sections up.
                        style={[styles.offerBody, (maxed || cannotPay) && styles.offerBodyBroke]}
                        onPress={maxed ? undefined : () => openReinforce(item)}
                        disabled={maxed}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: maxed }}
                        accessibilityLabel={maxed
                          ? `${instanceDisplayName(item)} — already reinforced +${quote.level}, the maximum`
                          : `Reinforce ${instanceDisplayName(item)}${equippedWhereLabel(player, item) ? `, equipped ${equippedWhereLabel(player, item)},` : ''} to plus ${quote.nextLevel} for ${quote.tc} coin`}
                      >
                        {/* ⚠⚠⚠ OTA-1736 — THE ROW SAYS WHICH COPY. Owner: *"similarly
                            named instances can be difficult or impossible to
                            distinguish before spending TC and materials."* The
                            name is the inventory's own (coating in front), it may
                            take two lines rather than be cut, and every line below
                            is one the pack card already carries — rarity + level,
                            durability, damage, how it is held, WHERE IT IS WORN,
                            and the rolled/paid properties — read from the same
                            authorities, keyed on the instance id, never the name. */}
                        <View style={styles.offerHead}>
                          <Text style={styles.offerName} numberOfLines={2}>{instanceDisplayName(item)}</Text>
                          <Text style={[styles.offerPrice, maxed ? styles.offerPriceKnown : (cannotPay && styles.offerPriceBroke)]}>
                            {maxed ? `\u2713 +${quote.level} MAX` : `${quote.tc} TC`}
                          </Text>
                        </View>
                        {(() => {
                          const w = resolveDisplayWeapon(item);
                          const lvl = reinforceLevel(item);
                          const where = equippedWhereLabel(player, item);
                          const held = holdLabelFor(item);
                          const traits = getItemPreviewForInstance(item).stats
                            .filter((line) => /^(AC \+|[A-Z]{3} \+|Resists:|Special:|Scales with)/.test(line));
                          if (item.coating) traits.push(`+${item.coating.dice} ${item.coating.kind}`);
                          if (item.coating2) traits.push(`+${item.coating2.dice} ${item.coating2.kind}`);
                          return (
                            <>
                              {/* rarity + level · durability now → after · damage */}
                              <Text style={styles.offerKind}>
                                {[
                                  item.rarity ? `${item.rarity}${lvl > 0 ? ` +${lvl}` : ''}` : null,
                                  `${quote.from.current}/${quote.from.max}${maxed ? '' : ` \u2192 ${quote.to.current}/${quote.to.max}`}`,
                                  w ? `${w.damageDice} ${w.damageType}` : null,
                                ].filter(Boolean).join(' \u00b7 ')}
                              </Text>
                              {/* how it is held · where it is worn */}
                              <Text style={[styles.offerKind, where ? styles.offerOwned : undefined]}>
                                {[held || null, where ? `EQUIPPED (${where})` : 'in your pack'].filter(Boolean).join(' \u00b7 ')}
                              </Text>
                              {traits.length > 0 && (
                                <Text style={styles.offerStats}>{traits.join(' \u00b7 ')}</Text>
                              )}
                            </>
                          );
                        })()}
                        {!maxed && (
                          <Text style={styles.offerStats}>
                            {`+${quote.level} \u2192 +${quote.nextLevel} of ${REINFORCE_MAX_LEVEL} \u00b7 `}
                            {quote.materials.length > 0
                              ? quote.materials.map((m) => `${m.name} \u00d7${m.quantity}`).join(' \u00b7 ')
                              : 'no materials needed'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            );
          })()}
          </>
        ) : (
          // SELL mode — inventory list with sell prices.
          <>
            {sellable.length > 0 && (
              <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>Sort:</Text>
                {(['value', 'rarity', 'name'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setSellSort(s)}
                    style={[styles.sortTab, sellSort === s && styles.sortTabActive]}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sellSort === s }}
                  >
                    <Text style={[styles.sortTabText, sellSort === s && styles.sortTabTextActive]}>
                      {s === 'value' ? 'VALUE' : s === 'rarity' ? 'RARITY' : 'NAME'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {/* ⚠⚠ OTA-1232 — SELL ALL COMMON GEAR. Owner: *"some games have a sell
                all scrap button when you're in a shop... that seems to be my most
                sold items."* One button, not the two he first sketched
                (weapons/armor), because splitting means two taps for one
                intention and two more things to read on a phone — the per-item
                rows below are right there for the exceptions.

                ⚠ The count and the total go in the BUTTON, not just the confirm.
                A bulk action whose size you only learn after committing to look
                is a bulk action people stop trusting. Hidden entirely at zero
                rather than shown disabled: a dead button on a screen full of live
                ones reads as a bug. */}
            {(() => {
              const plan = planCommonGearSale(bulkSellable);
              if (plan.count === 0) return null;
              return (
                <TouchableOpacity
                  onPress={() => setPending({ mode: 'bulkSellCommonGear', count: plan.count, total: plan.total })}
                  style={styles.bulkSellBtn}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Sell all ${plan.count} Common gear pieces for ${plan.total} coin`}
                >
                  <Text style={styles.bulkSellText}>
                    SELL ALL COMMON GEAR — {plan.count} for {plan.total} TC
                  </Text>
                </TouchableOpacity>
              );
            })()}
            {/* ⚠⚠ OTA-1706 — SELL ALL LOOT, beside it. Owner: "add the sell all
                loot button with an 'are you sure' prompt." Same shape as the
                sweep above for the same reasons: the count and the total live in
                the BUTTON so the size of the action is known before committing
                to look, and the whole thing is hidden at zero rather than shown
                disabled. */}
            {(() => {
              const lootPlan = planLootSale(bulkSellable);
              if (lootPlan.count === 0) return null;
              return (
                <TouchableOpacity
                  onPress={() => setPending({ mode: 'bulkSellLoot', count: lootPlan.count, total: lootPlan.total })}
                  style={styles.bulkSellBtn}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Sell all ${lootPlan.count} loot pieces for ${lootPlan.total} coin`}
                >
                  <Text style={styles.bulkSellText}>
                    SELL ALL LOOT — {lootPlan.count} for {lootPlan.total} TC
                  </Text>
                </TouchableOpacity>
              );
            })()}
            {/* OTA-1101 — the group bar moved OUT of this scrolling list and up
                into the tab row's slot, where it stays anchored. It used to sit
                here and scroll away the moment you started ticking rows further
                down — losing sight of the running total exactly when it starts
                mattering. */}
            {sellable.length === 0 ? (
              <Text style={styles.empty}>
                Nothing in your pack worth selling. Equipped gear can't be sold — unequip from the
                Inventory tab first, then come back to trade.
              </Text>
            ) : (
              CATEGORY_ORDER.map((cat) => {
                const catRows = sellable.filter(({ item }) => categorizeItem(item) === cat);
                if (catRows.length === 0) return null;
                const secKey = `sell_${cat}`;
                const collapsed = collapsedSections[secKey] ?? true;
                const count = catRows.reduce((sum, { item }) => sum + item.quantity, 0);
                return (
                  <View key={secKey} style={styles.section}>
                    {renderSectionHeader(secKey, cat, count, collapsed)}
                    {!collapsed && catRows.map(({ item, price, base }) => {
              // arb150 — instance-aware preview so the row shows THIS copy's
              // rolled stats (AC / attribute perks / damage / resists), not the
              // generic catalog row. Two "Bone Shoes" with different rolls now
              // read differently, so the player can compare before selling one.
              const preview = getItemPreviewForInstance(item);
              // Durability shows on its own at the right, so drop it from the
              // stat line to avoid printing it twice.
              const statLine = preview.stats.filter((s) => !s.startsWith('Durability:'));
              return (
                <TouchableOpacity
                  key={`sell_${item.id}`}
                  // OTA-1099 — a ticked row is outlined so the group reads at a
                  // glance down the list, not just from the ✓ at its head.
                  style={tRowStyle({ selected: sellSelected.includes(item.id) })}
                  // Hold to start a group; once in the mode a plain tap adds or
                  // removes. Outside the mode a tap is the ordinary single sale.
                  onPress={() => (sellSelectMode ? toggleSellSelect(item.id) : openSell(item.name, price, item.id))}
                  onLongPress={() => (sellSelectMode ? toggleSellSelect(item.id) : beginSellSelect(item.id))}
                  delayLongPress={350}
                  activeOpacity={0.7}
                  accessibilityRole={sellSelectMode ? 'checkbox' : 'button'}
                  accessibilityState={sellSelectMode ? { checked: sellSelected.includes(item.id) } : undefined}
                  accessibilityHint={sellSelectMode
                    ? 'Tap to add or remove this from the group.'
                    : 'Tap to sell this one. Hold to start selecting a group.'}
                >
                  <View style={[styles.offerStripe, { backgroundColor: rarityColor(preview.rarity) }]} />
                  <View style={styles.offerBody}>
                    <View style={styles.offerHead}>
                      <Text style={styles.offerName} numberOfLines={1}>
                        {sellSelectMode ? (
                          <Text style={sellSelected.includes(item.id) ? styles.pickTick : styles.pickTickOff}>
                            {sellSelected.includes(item.id) ? '☑ ' : '☐ '}
                          </Text>
                        ) : null}
                        {item.name}{item.quantity > 1 ? ` (x${item.quantity})` : ''}
                        {bandolierIds.has(item.id)
                          ? <Text style={styles.loadoutTag}>  ⚑ in bandolier</Text>
                          : toolPouchIds.has(item.id)
                            ? <Text style={styles.loadoutTag}>  ⚑ in pouch</Text>
                            : null}
                      </Text>
                      <Text style={styles.sellPrice}>+{price} TC{(() => { const t = priceArrow(price, base, 'sell'); return t ? <Text style={t.good ? styles.tickGood : styles.tickBad}> {t.glyph}</Text> : null; })()}</Text>
                    </View>
                    <View style={styles.offerSubHead}>
                      {/* ⚠⚠ OTA-1668 — AND THE SELL ROW SAYS WHAT LOOT IS FOR.
                          Owner: *"we need to define what loot is in the
                          inventory. It's just there, but what is it for?"* The
                          vendor list is exactly where that question gets asked
                          and answered wrongly — the moment before you sell
                          something the Crucible wanted. `lootPurposeLine` reads
                          the same predicates the bench enforces, so a row
                          promising "Crucible fodder" is one the forge will take,
                          and a recipe ingredient says so rather than looking
                          like the same anonymous pile. */}
                      <Text style={styles.offerKind} numberOfLines={1}>
                        {preview.kindLabel}{preview.rarity ? ` · ${preview.rarity}` : ''}
                        {(() => { const lp = lootPurposeLine(item); return lp ? ` · ${lp}` : ''; })()}
                      </Text>
                      {item.durability && (
                        <Text style={styles.offerOwned}>
                          {item.durability.current}/{item.durability.max} dur
                        </Text>
                      )}
                    </View>
                    {statLine.length > 0 && (
                      <Text style={styles.offerStats} numberOfLines={2}>
                        {statLine.join(' · ')}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <BrandedModal
        visible={pending !== null}
        title={
          pending?.mode === 'dismiss'
            ? `Dismiss ${vendor.name}?`
            : pending?.mode === 'bulkSellCommonGear'
              ? `Sell ${pending.count} Common ${pending.count === 1 ? 'piece' : 'pieces'}?`
            : pending?.mode === 'bulkSellLoot'
              ? `Sell ${pending.count} loot ${pending.count === 1 ? 'piece' : 'pieces'}?`
            : pending?.mode === 'sell'
              ? `Sell to ${vendor.name}`
              : pending?.mode === 'steal'
                ? `Steal ${pending.itemName}?`
              : pending?.mode === 'reinforceDone'
                ? `${instanceDisplayName(player.inventory.find((i) => i.id === pending.itemId) ?? { name: pending.itemName })} reinforced`
              : pending?.mode === 'reinforce'
                // ⚠ OTA-1734 — the title names the OBSTACLE when there is one, the
                //   way the buy sheet says "Not enough TC" instead of pretending.
                ? (reinforceBlocked === 'tc' ? 'Not enough TC'
                  : reinforceBlocked === 'materials' ? 'Not enough materials'
                  : reinforceBlocked ? `Cannot reinforce ${pending.itemName}`
                  : `Reinforce ${pendingReinforce ? instanceDisplayName(pendingReinforce.item) : pending.itemName} to +${pendingReinforce?.quote.nextLevel ?? 1}`)
                : pending?.mode === 'accept'
                  ? `Accept "${pending.title}"`
                  : canAffordPending
                    ? (pending?.mode === 'buy' && pending.isRecipe ? `Learn the ${pending.itemName} working` : `Buy from ${vendor.name}`)
                    : 'Not enough TC'
        }
        itemPreview={pending?.mode === 'accept' ? null : preview}
        quantityStepper={
          pending?.mode === 'sell' && !pendingGateLoss && pendingSellStack > 1
            ? {
                label: 'Sell how many?',
                value: sellRepsClamped,
                min: 1,
                max: pendingSellStack,
                onChange: setSellQty,
              }
            : pending?.mode === 'buy' && canAffordPending && buyMax > 1
              ? {
                  label: 'Buy how many?',
                  value: buyRepsClamped,
                  min: 1,
                  max: buyMax,
                  onChange: setBuyQty,
                }
              : undefined
        }
        contextLine={
          pending?.mode === 'dismiss'
            ? 'They leave the scene. New offers will come from the next vendor who shows up.'
            : pending?.mode === 'bulkSellLoot'
              // ⚠ OTA-1706 — the count and the total lead, as on the gear sweep,
              // and the second line names the boundary: this sells the junk the
              // Crucible would burn and nothing a recipe needs. The third names
              // what the player's OWN marks held back, because a hold-out nobody
              // explains reads as the button missing pieces (OTA-1349).
              ? `+${pending.total} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc + pending.total} TC\n\nLoot only — the scrap the Crucible melts. Anything a recipe calls for, anything you reserved for fusion or a quest, and anything you already forged is left alone.${(() => {
                const spared = planLootSale(bulkSellable).sparedCoated;
                return spared > 0 ? `\n\n⚠ ${spared} ${spared === 1 ? 'piece' : 'pieces'} held back — you reserved ${spared === 1 ? 'it' : 'them'}.` : '';
              })()}`
            : pending?.mode === 'bulkSellCommonGear'
              // ⚠ OTA-1232 — the COUNT and the TOTAL are the safety on a one-tap
              // sweep, so they lead. The second line names what is deliberately
              // NOT in the sweep, because a player who cannot see the boundary
              // has to take it on trust — and Common covers rations, scrap and
              // Aether Dust, which this must never touch.
              ? `+${pending.total} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc + pending.total} TC\n\nWeapons and armor only, unequipped, Common rarity. Consumables, crafting materials, anything you forged at the Crucible and anything you coated are left alone.${bulkSellHeldBackNote(bulkHeldBack) ? `\n\n⚠ ${bulkSellHeldBackNote(bulkHeldBack)}` : ''}${(() => {
                // ⚠ OTA-1683 — the coated pieces the sweep stepped around, counted
                // in the same breath as the gate hold-backs, for the same reason:
                // a hold-out nobody explains reads as the button refusing to work.
                const spared = planCommonGearSale(bulkSellable).sparedCoated;
                return spared > 0 ? `\n\n${spared} coated ${spared === 1 ? 'piece' : 'pieces'} kept — a coating is work you did. Sell those by hand if you mean to.` : '';
              })()}`
            : pending?.mode === 'sell'
              ? (pendingGateLoss
                  ? `Price: +${pending.price} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc + pending.price} TC\n\n⚠ This is your ONLY way to ${pendingGateLoss.label}. Selling it leaves you with no other tool that satisfies the gate — actions that need it will refuse until you find or craft a replacement.`
                  : `Price: +${pending.price}${sellRepsClamped > 1 ? ` × ${sellRepsClamped} = +${pending.price * sellRepsClamped}` : ''} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc + pending.price * sellRepsClamped} TC`)
              : pending?.mode === 'reinforceDone'
                ? pending.text
              : pending?.mode === 'reinforce'
                // ⚠⚠ OTA-1734 — LEVEL, CEILING, COIN, MATERIALS, in that order,
                //    and every one of them off the quote. The last paragraph is
                //    the promise the mechanic actually makes: OTA-1654's rule is
                //    that a raised ceiling carries the SAME points of damage
                //    across, so a player who reads "→ 17/33" and expects a mended
                //    weapon has been misled by the arrow alone.
                ? (() => {
                      const q = pendingReinforce?.quote;
                      if (!q) return 'That piece is no longer in your pack.';
                      if (q.refusal) return `${vendor.name} turns it over. "This one ${q.refusal}."`;
                      const mats = q.materials.map((m) => `${m.name} \u00d7${m.quantity}`).join(', ') || 'none';
                      const missing = pendingReinforce?.missing ?? [];
                      const down = q.to.max - q.to.current;
                      // ⚠ OTA-1736 — the FIRST line of the sheet says which copy this
                      //   is and where it is worn, keyed on the instance id, so the
                      //   final spend never happens against a name the player has
                      //   two of.
                      const where = pendingReinforce ? equippedWhereLabel(player, pendingReinforce.item) : '';
                      return [
                        `${pendingReinforce ? instanceDisplayName(pendingReinforce.item) : pending.itemName} \u2014 ${where ? `EQUIPPED (${where})` : 'in your pack'}`,
                        `Reinforcement: +${q.level} \u2192 +${q.nextLevel} of ${REINFORCE_MAX_LEVEL}`,
                        `Durability: ${q.from.current}/${q.from.max}   \u2192   ${q.to.current}/${q.to.max}`,
                        '',
                        `Cost: ${q.tc} TC   \u00b7   You have: ${player.tc} TC   \u2192   After: ${player.tc - q.tc} TC`,
                        `Materials: ${mats}`,
                        player.tc < q.tc ? `\n\u26a0 You are ${q.tc - player.tc} TC short.` : '',
                        missing.length > 0
                          ? `\n\u26a0 You are short ${missing.map((m) => `${m.name} \u00d7${m.quantity}`).join(', ')}.`
                          : '',
                        `\nThis raises THIS copy's ceiling for good \u2014 the catalog and every other ${pending.itemName} you own are untouched. It does not mend it: the ${down} ${down === 1 ? 'point' : 'points'} it is down stay down.`,
                      ].filter((l) => l !== '').join('\n');
                    })()
              : pending?.mode === 'steal'
                ? `DEX ${player.stats.dexterity} vs DC ${pending.dc}. On a miss, ${vendor.name} draws steel and the deal becomes a fight.${vendor.faction ? ` Caught theft tanks rep with ${vendor.faction.replace(/_/g, ' ')}.` : ''}`
                : pending?.mode === 'accept'
                  ? `Reward on completion: ${pending.reward}. The contract starts now — you can review it on the Contracts screen.`
                  : pending?.mode === 'buy'
                    ? canAffordPending
                      ? `Price: ${pending.price}${buyRepsClamped > 1 ? ` × ${buyRepsClamped} = ${pending.price * buyRepsClamped}` : ''} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc - pending.price * buyRepsClamped} TC${pendingBuyStock > 1 ? `\n\n${pendingBuyStock} in stock.` : ''}`
                      : `Price: ${pending.price} TC   ·   You only have ${player.tc} TC.`
                    : undefined
        }
        buttons={
          // ⚠⚠ OTA-1307 — THE CONFIRM HAD NO CONFIRM BUTTON.
          //
          // Owner: *"the sell all common items… takes me to the warning and
          // explanation screen. I hit OK which okay should have a highlighted
          // outline not the dull one that it has. but even when I hit it it just
          // takes me back to the same menu. doesn't sell anything."*
          //
          // Every other mode has a branch in this chain — dismiss, sell, steal,
          // accept, buy — and `bulkSellCommonGear` had none, so it fell all the
          // way through to the terminal fallback: a single neutral-tone **OK**
          // wired to `cancel`. That is exactly what he described, down to the
          // dullness: `tone: 'neutral'` IS the dull one, and `cancel` closes the
          // modal without selling a thing.
          //
          // ⚠ The work itself was never missing. `confirmAction` has carried a
          // complete, careful bulkSellCommonGear branch since OTA-1232 — it
          // re-plans at fire time against the live list and sells row by row
          // through sellToVendor so every piece takes the same price, log line
          // and standing effect. It was simply unreachable: nothing on the
          // screen could call it. A title and a body were written for this mode
          // and a button was not, so the sweep looked implemented from every
          // angle except the one that does the work.
          pending?.mode === 'bulkSellCommonGear' || pending?.mode === 'bulkSellLoot'
            ? [
                { label: 'Cancel', onPress: cancel, tone: 'neutral' as const },
                { label: `Sell ${pending.count} for ${pending.total} TC`, onPress: confirmAction, tone: 'primary' as const },
              ]
          : pending?.mode === 'dismiss'
            ? [
                { label: 'Cancel', onPress: cancel, tone: 'neutral' },
                { label: 'Dismiss', onPress: confirmAction, tone: 'destructive' },
              ]
            : pending?.mode === 'sell'
              ? [
                  { label: 'Cancel', onPress: cancel, tone: 'neutral' },
                  // OTA-178 — gate-loss sells get the destructive (red)
                  // button tone + label change so the second tap reads
                  // as "yes I really mean to lose this capability."
                  // Normal sells stay primary tone. arb57 — the label
                  // carries the stepper quantity; Sell All adds a one-tap
                  // whole-stack option (skips the stepper).
                  pendingGateLoss
                    ? { label: 'Sell anyway', onPress: () => doSell(1), tone: 'destructive' as const }
                    : { label: pendingSellStack > 1 ? `Sell ×${sellRepsClamped}` : 'Sell', onPress: () => doSell(), tone: 'primary' as const },
                  ...(!pendingGateLoss && pendingSellStack > 1
                    ? [{ label: `Sell All (${pendingSellStack})`, onPress: () => doSell(pendingSellStack), tone: 'primary' as const }]
                    : []),
                ]
              : pending?.mode === 'reinforceDone'
                ? [{ label: 'Good', onPress: cancel, tone: 'primary' as const }]
              : pending?.mode === 'reinforce'
                // ⚠ OTA-1734 — a blocked sheet gets ONE dismissal and no live
                //   Reinforce button, because a button that can only be refused is
                //   the dead control OTA-1307 was about. The live label carries the
                //   price so the last thing read before committing is the cost.
                ? (reinforceBlocked
                    ? [{ label: 'OK', onPress: cancel, tone: 'neutral' as const }]
                    : [
                        { label: 'Cancel', onPress: cancel, tone: 'neutral' as const },
                        {
                          label: `Reinforce for ${pendingReinforce?.quote.tc ?? 0} TC`,
                          onPress: doReinforce,
                          tone: 'primary' as const,
                        },
                      ])
              : pending?.mode === 'steal'
                ? [
                    { label: 'Back off', onPress: cancel, tone: 'neutral' },
                    { label: 'Lift it', onPress: confirmAction, tone: 'destructive' },
                  ]
                : pending?.mode === 'accept'
                  ? [
                      { label: 'Cancel', onPress: cancel, tone: 'neutral' },
                      { label: 'Accept', onPress: confirmAction, tone: 'primary' },
                    ]
                  : pending?.mode === 'buy' && canAffordPending
                    ? [
                        { label: 'Cancel', onPress: cancel, tone: 'neutral' as const },
                        { label: pending.isRecipe ? 'Learn' : (buyMax > 1 ? `Buy ×${buyRepsClamped}` : 'Buy'), onPress: () => doBuy(), tone: 'primary' as const },
                        ...(buyMax > 1
                          ? [{ label: `Buy All (${buyMax})`, onPress: () => doBuy(buyMax), tone: 'primary' as const }]
                          : []),
                        // Buy one and wear it now (weapons prompt for which hand).
                        ...(pendingBuyEquipSlots.length > 0
                          ? [{ label: 'Buy & Equip', onPress: doBuyEquip, tone: 'primary' as const }]
                          : []),
                      ]
                    : [{ label: 'OK', onPress: cancel, tone: 'neutral' }]
        }
        onRequestClose={cancel}
      />

      {/* OTA-1099 — group-sale confirmation. It carries the SAME warnings the
          single-item confirm would have raised, because the whole risk of a bulk
          action is that it quietly does what one action would have stopped to
          ask about: the gate-loss warning (selling your only climbing strap) and
          the loadout flag (something racked in your bandolier or pouch). */}
      <BrandedModal
        visible={groupSellConfirm}
        title={`Sell ${selectedRows.length} to ${vendor.name}`}
        contextLine={`+${selectedTotal} TC${selectedUnits > selectedRows.length ? ` for ${selectedUnits} units` : ''}`}
        body={[
          selectedRows
            .map((r) => `· ${r.item.name}${(r.item.quantity ?? 1) > 1 ? ` ×${r.item.quantity}` : ''} — +${r.price * (r.item.quantity ?? 1)} TC`)
            .join('\n'),
          selectedLoadout.length > 0
            ? `⚑ Part of your working loadout: ${selectedLoadout.join(', ')}.`
            : '',
          selectedGateLosses.length > 0
            ? `⚠ This is your last way to ${[...new Set(selectedGateLosses.map((g) => g.loss.label))].join(', and your last way to ')}. Sell it and you lose that until you find another.`
            : '',
        ].filter(Boolean).join('\n\n')}
        buttons={[
          { label: 'Back', onPress: () => setGroupSellConfirm(false), tone: 'neutral' as const },
          {
            label: `Sell group (+${selectedTotal} TC)`,
            onPress: doGroupSell,
            tone: selectedGateLosses.length > 0 ? ('destructive' as const) : ('primary' as const),
          },
        ]}
        onRequestClose={() => setGroupSellConfirm(false)}
      />

      {/* Buy & Equip — hand choice for weapons (main vs off). Single-slot gear
          equips without this prompt. */}
      <BrandedModal
        visible={pendingEquip !== null}
        title={`Equip ${pendingEquip?.itemName ?? ''}`}
        contextLine="Which hand?"
        buttons={[
          { label: 'Not now', onPress: () => setPendingEquip(null), tone: 'neutral' as const },
          ...(pendingEquip?.slots ?? []).map((s) => ({
            label: SLOT_LABEL[s],
            onPress: () => { equipItem(pendingEquip!.itemName, s); setPendingEquip(null); },
            tone: 'primary' as const,
          })),
        ]}
        onRequestClose={() => setPendingEquip(null)}
      />

      {/* arb151 — vendor contracts as a mission-board-style popup. */}
      <VendorContractsModal
        visible={contractsOpen}
        onClose={() => setContractsOpen(false)}
        vendor={vendor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // OTA-275 — tablet width cap. Phones unchanged; iPad centers at 600pt.
  container: { flex: 1, backgroundColor: 'transparent', padding: 12, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
  backBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  placeholderBtn: { alignSelf: 'center' },
  dismissBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#7a4040',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  dismissText: { color: '#e07a5f', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  sellPrice: { color: '#9ec96a', fontSize: 12, fontWeight: '700' },
  // ⚠ OTA-1232 — deliberately NOT styled like the primary buy/sell actions. A
  // one-tap sweep should read as a convenience the player reaches for, not as the
  // obvious thing to press on arrival.
  bulkSellBtn: {
    borderWidth: 1,
    borderColor: '#5a4a32',
    backgroundColor: '#1a1611',
    borderRadius: 3,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  bulkSellText: { color: '#c9a86a', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, paddingHorizontal: 2 },
  sortLabel: { color: '#a2977b', fontSize: 10, letterSpacing: 1, marginRight: 4 },
  sortTab: { paddingHorizontal: 8, paddingVertical: 3, borderColor: '#3a342c', borderWidth: 1, borderRadius: 2 },
  sortTabActive: { borderColor: '#c9a86a' },
  // arb121 — text is ALWAYS readable amber; the BORDER (sortTabActive) is the
  // sole active indicator. Was a dim #a2977b on inactive that the player
  // couldn't read.
  sortTabText: { color: '#c9a86a', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  sortTabTextActive: { color: '#c9a86a' },
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  vendorCard: {
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  vendorName: { color: '#c9a86a', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  vendorTitle: { color: '#a2977b', fontSize: 11, letterSpacing: 1, marginTop: 1 },
  vendorDesc: { color: '#cdbf99', fontSize: 12, marginTop: 6, lineHeight: 17, fontStyle: 'italic' },
  rapportBanner: { color: '#9ec96a', fontSize: 12, marginTop: 6, fontWeight: '700' },
  // ⚠ OTA-1470 — `crucibleBtn` / `crucibleBtnText` / `crucibleBtnShort` are gone
  // with the button they dressed. A style sheet is a claim about what a
  // component renders, and three orphaned entries would keep saying this screen
  // has a Crucible in it. The purple-on-dark it carried lives on in the chip's
  // `fusionChip` / `fusionBannerStripe`, and the short-of-coin amber in the
  // chip's hint line.
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  walletLabel: { color: '#a2977b', fontSize: 11, letterSpacing: 1 },
  corruptionMarkup: {
    color: '#e07a5f',
    fontSize: 10,
    letterSpacing: 1,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  // OTA-865 — war-market note + the ▲/▼ price ticker.
  warMarket: {
    color: '#d98a5f',
    fontSize: 11,
    lineHeight: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  tickGood: { color: '#7fc96a', fontWeight: '900' },
  tickBad: { color: '#e07a5f', fontWeight: '900' },
  walletValue: { color: '#c9a86a', fontSize: 13, fontWeight: '700' },
  tourBanner: {
    backgroundColor: '#2a1f12',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  tourBannerText: {
    color: '#c9a86a',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    textAlign: 'center',
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 12 },
  // OTA-686 — collapsible category sections, mirroring the inventory screen so a
  // vendor's BUY / SELL lists read the same way the player's pack does.
  section: { marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 6,
    marginBottom: 4,
    backgroundColor: 'rgba(8,6,4,0.55)',
    borderRadius: 3,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionChevron: { fontSize: 11, fontWeight: '900', marginRight: 7, width: 11, textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  sectionCount: { color: '#9a8e74', fontSize: 11 },
  // ⚠ OTA-258 scoped this to the BUY BODY, not the row — see the call site. The
  // name said `row` for 1500 commits and meant `body`; OTA-1759 renamed it so
  // the scoping is legible rather than a trap for the next reader.
  offerBodyBroke: { opacity: 0.45 },
  // ⚠ OTA-1099's group-sell outline MOVED to the kit as `rowSelected` in
  // OTA-1759 — its two declarations were byte-identical in three screens. The
  // reason it is trade-gold survives with it: a group reads as one block down
  // the list, not as a scatter of ticks.
  pickTick: { color: '#c9a86a', fontWeight: '700' },
  pickTickOff: { color: '#6b5c3a' },
  // The bar only exists while a group does; it states the pay-out up front,
  // because what the group is worth is the whole reason to build one.
  groupBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e1a12',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 8,
  },
  groupBarInfo: { flexShrink: 1 },
  groupBarCount: { color: '#e6d8b3', fontSize: 12, fontWeight: '700' },
  groupBarTotal: { color: '#9ec96a', fontSize: 13, fontWeight: '700', marginTop: 2 },
  groupBarActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupBarCancel: {
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  groupBarCancelText: { color: '#a2977b', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  groupBarSell: {
    backgroundColor: '#3d5a2c',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  groupBarSellOff: { opacity: 0.4 },
  groupBarSellText: { color: '#e6d8b3', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  offerStripe: { width: 4 },
  offerBody: { flex: 1, padding: 10 },
  // CONTRACTS tab — vendor-side list of available hunts / mysteries
  // / storylines / faction quests. Reuses offerStripe / offerHead /
  // offerName from the BUY rows but with quest-specific reward +
  // body styling.
  contractSection: { marginBottom: 10 },
  contractSectionTitle: { color: '#c9a86a', fontSize: 11, letterSpacing: 2, fontWeight: '700', marginBottom: 6 },
  contractRow: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  contractReward: { color: '#9ec96a', fontSize: 13, fontWeight: '700' },
  contractBody: { color: '#cdbf99', fontSize: 12, marginTop: 2, marginBottom: 4, fontStyle: 'italic' },
  contractDesc: { color: '#a89c7a', fontSize: 11, lineHeight: 15 },
  contractAccept: { color: '#c9a86a', fontSize: 10, marginTop: 6, letterSpacing: 1, fontStyle: 'italic' },
  offerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  offerName: { color: '#e6d8b3', fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  // arb120 — loadout warning tag (bandolier / pouch) on a sellable row.
  loadoutTag: { color: '#e0a85f', fontSize: 11, fontWeight: '700' },
  offerPrice: { color: '#c9a86a', fontSize: 12, fontWeight: '700' },
  offerPriceBroke: { color: '#a2977b' },
  // ⚠ OTA-1731 — a working you already own. Completion-green, the same colour the
  // READY sort and the COMPLETE button use, so "this one is done" reads the same
  // everywhere in the game rather than looking like a price you cannot afford.
  offerPriceKnown: { color: '#9ec96a', fontWeight: '700' as const, letterSpacing: 1 },
  offerSubHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 2 },
  offerKind: { color: '#a2977b', fontSize: 10, letterSpacing: 1, flex: 1 },
  // arb-fix — right-hand stack: "×N in stock" over "you have N".
  offerCounts: { alignItems: 'flex-end', gap: 1 },
  offerOwned: { color: '#9ec96a', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  offerStock: { color: '#7fb0a8', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  offerStats: { color: '#cdbf99', fontSize: 11, marginTop: 4 },
  empty: { color: '#a2977b', fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  /* ⚠⚠ OTA-1760 — `marginBottom` AND `alignSelf`, BOTH MEASURED FROM THE RENDER.
   * Owner, on a screenshot of this state: *"the border covers the top sentence."*
   * It does, and the render says exactly why — the text's line box ends at y=122
   * and the button's box starts at y=122. ZERO gap, so the button's 1px top
   * border lands on the descenders of "You're not as fast as you think you are."
   * and slices them. The style had a `marginTop` and no `marginBottom`.
   * ⚠ This `placeholder` is BYTE-IDENTICAL in seven screens, and Vendor is the
   * only one with a sibling after it, so it is the only one where the missing
   * gap is visible. The other six are fixed here by not being broken; the
   * duplication itself is a Tier 1 item, not something to convert under a
   * two-line fix. */
  placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80, marginBottom: 20 },
  // OTA 030 — steal button sits at the right edge of every BUY row.
  // Darker tone than BUY so the player reads it as the risky path.
  stealBtn: {
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#221512',
    borderLeftColor: '#7a4040',
    borderLeftWidth: 1,
  },
  stealText: { color: '#e07a5f', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  stealDc: { color: '#7a4040', fontSize: 9, letterSpacing: 1, marginTop: 1 },
});
