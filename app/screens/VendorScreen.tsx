import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore, vendorNpcId } from '../state/gameStore';
import { FirstTimeHint } from '../components/FirstTimeHint';
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
import { findGearByName, findMaterialByName, findExplorationItemByName, findCatalogItem, RECIPES } from '../engine/crafting';
import { vendorRecipeOffers, vendorSeed } from '../engine/recipeDiscovery';
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
  | null;

export function VendorScreen() {
  const player = useGameStore((s) => s.player);
  const activeBuildingId = useGameStore((s) => s.activeBuildingId);
  const scene = useGameStore((s) => s.currentScene);
  const worldMemory = useGameStore((s) => s.worldMemory);
  const setScreen = useGameStore((s) => s.setScreen);
  const appendLog = useGameStore((s) => s.appendLog);
  const buyFromVendor = useGameStore((s) => s.buyFromVendor);
  const equipItem = useGameStore((s) => s.equipItem);
  const sellToVendor = useGameStore((s) => s.sellToVendor);
  const stealFromVendor = useGameStore((s) => s.stealFromVendor);
  const dismissVendor = useGameStore((s) => s.dismissVendor);
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
        <TouchableOpacity
          style={styles.backBtn}
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

  // arb150 — the SELL confirm previews the SPECIFIC instance (by id) so its
  // rolled stats/durability match the row tapped; BUY previews the catalog row.
  const preview = pending?.mode === 'buy'
    ? getItemPreview(pending.itemName)
    : pending?.mode === 'sell'
      ? getItemPreviewForInstance(
          player.inventory.find((i) => i.id === pending.itemId) ?? { name: pending.itemName },
        )
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
  const rapportMod = vendorPriceMod(
    effectiveStats(player).charisma,
    player.completedFactionQuestIds,
    vendor?.faction,
    // OTA-1341 — the standing ladder: same fourth argument the store passes, so
    // the shown price and the charged price keep agreeing (vendorPricing's rule).
    vendor?.faction ? getStanding(player.factionStanding ?? [], vendor.faction) : 0,
  );
  const rapportPct = Math.round(rapportMod * 100);
  // OTA-849/865 — the two modifiers that also move the REAL transaction price but the
  // display used to omit: the vendor faction's fortunes (tide teeth) and LOCAL WAR HEAT.
  // Computed here so the screen shows exactly what buyFromVendor / sellToVendor charge.
  const vendorTideMult = vendor?.faction ? tideVendorPriceMult(worldMemory?.factionTides?.[vendor.faction]) : 1;
  // ⚠ OTA-1156 — THE TWO THIS SCREEN STILL DROPPED, and the comment above has been
  // wrong since they landed. `buyFromVendor` multiplies in SIX factors; this screen
  // passed FOUR. Missing: OTA-1053's per-person regard (a vendor who likes or
  // dislikes you moves the price) and OTA-1066's Phase-4 pressure tide. So the shown
  // price and the charged price silently disagreed for any non-neutral vendor —
  // inside `vendorPricing.ts`, whose entire stated purpose is that these two can
  // never drift. Computed from the same helpers the store uses, not re-derived.
  const vendorRegardMult = vendor && worldMemory
    ? regardPriceMult(npcRegard(getRelation(worldMemory, vendorNpcId(vendor))))
    : 1;
  const pressureTideMult = player
    ? tidePriceMultiplier(tideStage(player.hoursElapsed ?? 0, profileOf(player)))
    : 1;
  // OTA-1689 — the menace markup, the same helper the store charges through.
  const vendorMenaceMult = player
    ? menacePriceMult(decayedMenace(player.menace ?? 0, player.menaceUpdatedHour ?? 0, player.hoursElapsed ?? 0))
    : 1;
  const warCell = player ? canonicalCellOf(player.currentLocationId) : { x: 0, y: 0 };
  const warHeat = localWarHeat(worldMemory?.patrols ?? [], warCell.x, warCell.y);
  const { buyMult: warBuyMult, sellMult: warSellMult } = warPriceFactor(warHeat);
  // The two factions whose war-parties are thickest here — for the "prices are up" line.
  const contestNames = contestedFactions(worldMemory?.patrols ?? [], warCell.x, warCell.y)
    .map((id) => (factionsData as { id: string; name: string }[]).find((f) => f.id === id)?.name ?? null)
    .filter((n): n is string => !!n);
  // Show the war-market note once the ground is meaningfully contested (not on one patrol).
  const warNote = warHeat >= 0.25;
  // OTA-812 — recipes this vendor will TEACH for TC, surfaced as buttons so the
  // player doesn't have to know the typed "buy <name>" command. Same source the
  // store's buy path checks; tapping LEARN calls buyFromVendor(result) which routes
  // through the recipe-learn branch. Filtered to the ones not yet known.
  const recipeOffers = vendor
    ? vendorRecipeOffers(RECIPES, player.knownRecipes, vendorSeed(vendor.name))
        .filter((o) => !(player.knownRecipes ?? []).includes(o.result))
    : [];
  // Inventory items the player can sell — exclude the EXACT equipped instances +
  // unsellable. OTA-687 — exclude by INSTANCE ID (equippedInstanceIds), not name,
  // so a spare copy of an equipped item's name is a different instance and stays
  // sellable (before, one equipped "Stone-Grip Gloves" hid every copy you owned).
  const equippedItemIds = equippedInstanceIds(player);
  // arb120 — bandolier (quick-throwables) and tool-pouch items aren't "equipped"
  // by slot, so they DON'T get filtered out of the sell list — but they're part
  // of the player's working loadout and selling one by accident stings. Flag
  // them in the row so the player sees what they're about to give up. (Keyed by
  // instance id, so a spare of the same name stays cleanly sellable.)
  const bandolierIds = new Set(player.equipped?.bandolierIds ?? []);
  const toolPouchIds = new Set(player.equipped?.toolPouchIds ?? []);
  // HANDOFF #12 — sell-back UI polish. Sort options so the player can
  // surface the most valuable junk first (default), alphabetize for
  // hunting, or group by rarity for clearing low-tier clutter.
  const RARITY_ORDER: Record<string, number> = { Legendary: 0, Rare: 1, Uncommon: 2, Common: 3 };
  const sellable = player.inventory
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
    });

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
      <FirstTimeHint
        id="vendor_first_open_v2"
        title="The trader"
        body="Buy and sell here. Prices swing with the seller's faction power and your standing — a favored trader deals kinder. At a faction's own site, the armory only racks faction gear for people the host trusts."
      />
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
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, mode === 'buy' && styles.tabActive]}
          // OTA-1099 — leaving the SELL tab ends the group. A selection you can
          // no longer see is a hidden mode waiting to surprise you on the way back.
          // OTA-1101 — belt-and-braces now: while a group is open this row isn't
          // even rendered, so BUY is unreachable until the group resolves.
          onPress={() => { exitSellSelect(); setMode('buy'); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'buy' }}
        >
          <Text style={[styles.tabText, mode === 'buy' && styles.tabTextActive]}>BUY</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === 'sell' && styles.tabActive]}
          onPress={() => setMode('sell')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'sell' }}
        >
          <Text style={[styles.tabText, mode === 'sell' && styles.tabTextActive]}>SELL</Text>
        </TouchableOpacity>
        {/* arb151 — CONTRACTS opens a mission-board-style popup instead of an
            inline tab (player preferred the Mission Board modal). It's a
            button, not a tab, so it never holds the active state.
            ⚠ OTA-1684 — ON EVERY VENDOR NOW. It was gated on `vendor.faction`,
            so a roadside trader (Skiv, 09-04 22:10: "haven't seen the missions
            button on a vendor in a while") simply had no button — and a
            missing control reads as a broken one. The board is still empty
            for them by design; the popup says so in words (B15: a refusal
            always speaks). */}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => setContractsOpen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.tabText}>CONTRACTS ▸</Text>
        </TouchableOpacity>
      </View>
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
              const owned = player.inventory
                .filter((inv) => inv.name.toLowerCase() === o.itemName.toLowerCase())
                .reduce((sum, inv) => sum + inv.quantity, 0);
              return (
                // OTA-258 — broke-dim is now scoped to the BUY body only,
                // NOT the parent row. Previously the `offerRowBroke` opacity
                // was applied here, which dimmed everything inside the row
                // including the STEAL button on the right — backwards
                // affordance, since stealing is what a broke player would
                // want to reach for. Steal has its own gates (DC roll, witness
                // checks in `stealFromVendor`) and never
                // touched TC affordability anyway. Now: BUY body dims when
                // unaffordable, STEAL stays full bright.
                <View
                  key={`buy_${o.itemName}_${i}`}
                  style={styles.offerRow}
                >
                  <View style={[styles.offerStripe, { backgroundColor: rarityColor(itemPreview.rarity) }]} />
                  <TouchableOpacity
                    style={[styles.offerBody, !canAfford && styles.offerRowBroke]}
                    onPress={() => openBuy(o.itemName, effPrice)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <View style={styles.offerHead}>
                      <Text style={styles.offerName} numberOfLines={1}>{o.itemName}</Text>
                      <Text style={[styles.offerPrice, !canAfford && styles.offerPriceBroke]}>
                        {effPrice} TC{buyTick ? <Text style={buyTick.good ? styles.tickGood : styles.tickBad}> {buyTick.glyph}</Text> : null}
                      </Text>
                    </View>
                    <View style={styles.offerSubHead}>
                      <Text style={styles.offerKind} numberOfLines={1}>
                        {itemPreview.kindLabel}{itemPreview.rarity ? ` · ${itemPreview.rarity}` : ''}
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
            const collapsed = collapsedSections[secKey] ?? false; // open by default — this is the discoverable bit
            const RECIPE_ACCENT = '#c9a86a';
            return (
              <View style={styles.section}>
                <TouchableOpacity
                  style={[styles.sectionHeader, { borderLeftColor: RECIPE_ACCENT }]}
                  activeOpacity={0.7}
                  onPress={() => setCollapsedSections((s) => ({ ...s, [secKey]: !(s[secKey] ?? false) }))}
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
                    <View key={`recipe_${o.result}`} style={styles.offerRow}>
                      <View style={[styles.offerStripe, { backgroundColor: rarityColor(preview.rarity) }]} />
                      <TouchableOpacity
                        style={[styles.offerBody, !canAfford && styles.offerRowBroke]}
                        onPress={() => openLearnRecipe(o.result, o.price)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                      >
                        <View style={styles.offerHead}>
                          <Text style={styles.offerName} numberOfLines={1}>{o.result}</Text>
                          <Text style={[styles.offerPrice, !canAfford && styles.offerPriceBroke]}>{o.price} TC</Text>
                        </View>
                        <View style={styles.offerSubHead}>
                          <Text style={styles.offerKind} numberOfLines={1}>
                            recipe{preview.rarity ? ` · ${preview.rarity}` : ''} · learn to craft
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
                  style={[styles.offerRow, sellSelected.includes(item.id) && styles.offerRowPicked]}
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
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#2a2520',
    borderColor: '#c9a86a',
  },
  tabText: { color: '#a2977b', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  tabTextActive: { color: '#c9a86a' },
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
  offerRow: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  offerRowBroke: { opacity: 0.45 },
  // OTA-1099 — group-sell selection. The ticked row is outlined in the same
  // trade-gold the sell prices use, so a group reads as one block down the list.
  offerRowPicked: { borderColor: '#c9a86a', backgroundColor: '#1e1a12' },
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
  offerSubHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 2 },
  offerKind: { color: '#a2977b', fontSize: 10, letterSpacing: 1, flex: 1 },
  // arb-fix — right-hand stack: "×N in stock" over "you have N".
  offerCounts: { alignItems: 'flex-end', gap: 1 },
  offerOwned: { color: '#9ec96a', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  offerStock: { color: '#7fb0a8', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  offerStats: { color: '#cdbf99', fontSize: 11, marginTop: 4 },
  empty: { color: '#a2977b', fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80 },
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
