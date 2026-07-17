import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { BrandedModal } from '../components/BrandedModal';
import { VendorContractsModal } from '../components/VendorContractsModal';
import { getItemPreview, getItemPreviewForInstance } from '../components/itemPreview';
import { validSlotsForItem, SLOT_LABEL, equippedInstanceIds, effectiveStats } from '../engine/equipment';
import type { EquipSlot, InventoryItem } from '../engine/types';
import { sellPriceFor, isUnsellable } from '../engine/sellPrice';
import { vendorPriceMod } from '../engine/factionRapport';
import { resolveItemEffect, type GateKind } from '../engine/itemEffect';
import { findGearByName, findMaterialByName, findExplorationItemByName, findCatalogItem, RECIPES } from '../engine/crafting';
import { vendorRecipeOffers, vendorSeed } from '../engine/recipeDiscovery';
import { corruptionTierOf, corruptionPriceMultiplier } from '../engine/corruption';
import {
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  CATEGORY_COLORS,
  categorizeItem,
  type InventoryCategory,
} from '../components/InventoryCategorize';

function rarityColor(rarity: string | null | undefined): string {
  switch (rarity) {
    case 'Legendary': return '#e07a5f';
    case 'Rare': return '#b88ce0';
    case 'Uncommon': return '#9ec96a';
    default: return '#c9a86a';
  }
}

type Mode = 'buy' | 'sell' | 'contracts';
type Pending =
  | { mode: 'buy'; itemName: string; price: number; isRecipe?: boolean }
  | { mode: 'sell'; itemName: string; price: number; itemId?: string }
  | { mode: 'steal'; itemName: string; dc: number }
  | { mode: 'dismiss' }
  | { mode: 'accept'; kind: 'faction' | 'hunt' | 'mystery' | 'storyline'; title: string; reward: string }
  | null;

export function VendorScreen() {
  const player = useGameStore((s) => s.player);
  const activeBuildingId = useGameStore((s) => s.activeBuildingId);
  const scene = useGameStore((s) => s.currentScene);
  const setScreen = useGameStore((s) => s.setScreen);
  const appendLog = useGameStore((s) => s.appendLog);
  const buyFromVendor = useGameStore((s) => s.buyFromVendor);
  const equipItem = useGameStore((s) => s.equipItem);
  const sellToVendor = useGameStore((s) => s.sellToVendor);
  const stealFromVendor = useGameStore((s) => s.stealFromVendor);
  const dismissVendor = useGameStore((s) => s.dismissVendor);
  const useVendorCrucible = useGameStore((s) => s.useVendorCrucible);
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
  // "Sell All" pass the whole stack; default uses the stepper value. Each
  // sellToVendor call is one unit (its own TC credit + log line).
  const sellStackFor = (name: string) =>
    player.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase())?.quantity ?? 1;
  const pendingSellStack = pending?.mode === 'sell' ? sellStackFor(pending.itemName) : 1;
  const sellRepsClamped = Math.max(1, Math.min(sellQty, pendingSellStack));
  const doSell = (repsOverride?: number) => {
    if (pending?.mode !== 'sell') return;
    const stack = sellStackFor(pending.itemName);
    const reps = Math.max(1, Math.min(repsOverride ?? sellQty, stack));
    // OTA-727 — a bulk sale is one negotiation: only the first unit trains CHA,
    // so dumping a big stack no longer farms Charisma one level at a time.
    for (let i = 0; i < reps; i++) sellToVendor(pending.itemName, pending.itemId, { social: i === 0 });
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
  );
  const rapportPct = Math.round(rapportMod * 100);
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
    .map((i) => ({ item: i, price: sellPriceFor(i, vendor, rapportMod) }))
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
    >
      <View style={styles.sectionHeaderLeft}>
        <Text style={[styles.sectionChevron, { color: CATEGORY_COLORS[cat] }]}>{collapsed ? '▾' : '▴'}</Text>
        <Text style={[styles.sectionLabel, { color: CATEGORY_COLORS[cat] }]}>{CATEGORY_LABEL[cat].toUpperCase()}</Text>
      </View>
      <Text style={styles.sectionCount}>{count}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FirstTimeHint
        id="vendor_first_open"
        title="The trader"
        body="Buy and sell here. Prices swing with the seller's faction power and your standing — a favored trader deals kinder."
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>SHOP</Text>
        <TouchableOpacity
          onPress={openDismiss}
          style={styles.dismissBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.dismissText}>DISMISS</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.vendorCard}>
        <Text style={styles.vendorName}>{vendor.name}</Text>
        <Text style={styles.vendorTitle}>{vendor.title}</Text>
        <Text style={styles.vendorDesc}>{vendor.description}</Text>
        {/* OTA-805 — rapport price break. Shown once the player has earned dealing
            with this faction (done its rapport quest); the % scales with Charisma. */}
        {rapportMod > 0 && (
          <Text style={styles.rapportBanner}>
            ✦ Trusted partner — {rapportPct}% off buys, +{rapportPct}% on sell-backs (Charisma)
          </Text>
        )}
        {/* arb103 — every vendor will fire a portable Fusing Crucible for 25 TC.
            arb153 — …EXCEPT where the LOCATION already has its own Crucible chip
            (outpost / Hidden Market / a live fusion permit): the exploration
            screen already offers that Crucible, so the vendor's paid 25 TC copy
            is redundant. Mirror the exploration chip's own gate so the two never
            both show. Roadside / wild stalls (no hub, not market) keep it — it's
            the only Crucible there. */}
        {!(player?.fusionPending
          || (player?.hubRoomId && (player?.macroVisitSeq ?? 0) >= 1)
          || activeBuildingId === 'market') && (
          <TouchableOpacity
            style={styles.crucibleBtn}
            onPress={() => { useVendorCrucible(); setScreen('exploration'); }}
            activeOpacity={0.7}
          >
            <Text style={styles.crucibleBtnText}>★★ USE CRUCIBLE · 25 TC</Text>
          </TouchableOpacity>
        )}
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

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, mode === 'buy' && styles.tabActive]}
          onPress={() => setMode('buy')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, mode === 'buy' && styles.tabTextActive]}>BUY</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mode === 'sell' && styles.tabActive]}
          onPress={() => setMode('sell')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, mode === 'sell' && styles.tabTextActive]}>SELL</Text>
        </TouchableOpacity>
        {vendor.faction && (
          // arb151 — CONTRACTS now opens a mission-board-style popup instead of
          // an inline tab (player preferred the Mission Board modal). It's a
          // button, not a tab, so it never holds the active state.
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setContractsOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.tabText}>CONTRACTS ▸</Text>
          </TouchableOpacity>
        )}
      </View>

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
              const effPrice = Math.max(1, Math.ceil(o.price * corruptionMult * (1 - rapportMod)));
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
                // want to reach for. Steal has its own gates (DC roll, faction
                // standing, witness checks in `stealFromVendor`) and never
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
                  >
                    <View style={styles.offerHead}>
                      <Text style={styles.offerName} numberOfLines={1}>{o.itemName}</Text>
                      <Text style={[styles.offerPrice, !canAfford && styles.offerPriceBroke]}>
                        {effPrice} TC
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
                >
                  <View style={styles.sectionHeaderLeft}>
                    <Text style={[styles.sectionChevron, { color: RECIPE_ACCENT }]}>{collapsed ? '▾' : '▴'}</Text>
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
                  >
                    <Text style={[styles.sortTabText, sellSort === s && styles.sortTabTextActive]}>
                      {s === 'value' ? 'VALUE' : s === 'rarity' ? 'RARITY' : 'NAME'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
                    {!collapsed && catRows.map(({ item, price }) => {
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
                  style={styles.offerRow}
                  onPress={() => openSell(item.name, price, item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.offerStripe, { backgroundColor: rarityColor(preview.rarity) }]} />
                  <View style={styles.offerBody}>
                    <View style={styles.offerHead}>
                      <Text style={styles.offerName} numberOfLines={1}>
                        {item.name}{item.quantity > 1 ? ` (x${item.quantity})` : ''}
                        {bandolierIds.has(item.id)
                          ? <Text style={styles.loadoutTag}>  ⚑ in bandolier</Text>
                          : toolPouchIds.has(item.id)
                            ? <Text style={styles.loadoutTag}>  ⚑ in pouch</Text>
                            : null}
                      </Text>
                      <Text style={styles.sellPrice}>+{price} TC</Text>
                    </View>
                    <View style={styles.offerSubHead}>
                      <Text style={styles.offerKind} numberOfLines={1}>
                        {preview.kindLabel}{preview.rarity ? ` · ${preview.rarity}` : ''}
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
          pending?.mode === 'dismiss'
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
  container: { flex: 1, backgroundColor: 'transparent', padding: 12, width: '100%', maxWidth: 600, alignSelf: 'center' },
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
  tabText: { color: '#7a705c', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  tabTextActive: { color: '#c9a86a' },
  sellPrice: { color: '#9ec96a', fontSize: 12, fontWeight: '700' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6, paddingHorizontal: 2 },
  sortLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 1, marginRight: 4 },
  sortTab: { paddingHorizontal: 8, paddingVertical: 3, borderColor: '#3a342c', borderWidth: 1, borderRadius: 2 },
  sortTabActive: { borderColor: '#c9a86a' },
  // arb121 — text is ALWAYS readable amber; the BORDER (sortTabActive) is the
  // sole active indicator. Was a dim #7a705c on inactive that the player
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
  vendorTitle: { color: '#7a705c', fontSize: 11, letterSpacing: 1, marginTop: 1 },
  vendorDesc: { color: '#cdbf99', fontSize: 12, marginTop: 6, lineHeight: 17, fontStyle: 'italic' },
  rapportBanner: { color: '#9ec96a', fontSize: 12, marginTop: 6, fontWeight: '700' },
  // arb103 — vendor Fusing Crucible offer.
  crucibleBtn: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 4,
    borderColor: '#b88ce0',
    borderWidth: 1,
    backgroundColor: '#1e1726',
    alignItems: 'center',
  },
  crucibleBtnText: { color: '#d9b8f0', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  walletLabel: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  corruptionMarkup: {
    color: '#e07a5f',
    fontSize: 10,
    letterSpacing: 1,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
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
  offerPriceBroke: { color: '#7a705c' },
  offerSubHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 2 },
  offerKind: { color: '#7a705c', fontSize: 10, letterSpacing: 1, flex: 1 },
  // arb-fix — right-hand stack: "×N in stock" over "you have N".
  offerCounts: { alignItems: 'flex-end', gap: 1 },
  offerOwned: { color: '#9ec96a', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  offerStock: { color: '#7fb0a8', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  offerStats: { color: '#cdbf99', fontSize: 11, marginTop: 4 },
  empty: { color: '#7a705c', fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
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
