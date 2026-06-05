import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import {
  CATEGORY_COLORS,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  groupInventoryByCategory,
} from '../components/InventoryCategorize';
import type { InventoryItem, EquipSlot, PlayerCharacter } from '../engine/types';
import { validSlotsForItem, SLOT_LABEL } from '../engine/equipment';
import { canScrap } from '../engine/scrapEngine';
import { findWeaponByName, isInferredItem, isInferredInventoryItem } from '../engine/crafting';
import { resolveDisplayWeapon } from '../engine/itemResolution';
import { isPouchEligible } from '../engine/pouchEligibility';
import { BrandedModal } from '../components/BrandedModal';
import { getItemPreview, getItemPreviewForInstance } from '../components/itemPreview';
import { computeInventoryDelta, type InventoryDelta } from '../components/inventoryDelta';
import { SearchSortBar, type SortDirection } from '../components/SearchSortBar';
import { FirstTimeHint } from '../components/FirstTimeHint';

// 2026-05-27 OTA-087 — Sort axes for inventory. Each axis
// has a default direction baked in (alphabetical asc, rarity
// asc = Common→Legendary, quantity desc = biggest stacks
// first, kind asc). Tapping the active axis toggles direction.
const INV_SORT_OPTIONS = [
  { key: 'name', label: 'NAME' },
  { key: 'rarity', label: 'RARITY' },
  { key: 'kind', label: 'KIND' },
  { key: 'qty', label: 'QTY' },
];
const RARITY_RANK: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Legendary: 3,
};

function sortInventoryItems(
  items: InventoryItem[],
  sortKey: string,
  direction: SortDirection,
): InventoryItem[] {
  const dir = direction === 'asc' ? 1 : -1;
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'rarity': {
        const ar = RARITY_RANK[a.rarity ?? 'Common'] ?? 0;
        const br = RARITY_RANK[b.rarity ?? 'Common'] ?? 0;
        if (ar !== br) return (ar - br) * dir;
        return a.name.localeCompare(b.name) * dir;
      }
      case 'kind': {
        const ak = a.kind ?? '';
        const bk = b.kind ?? '';
        if (ak !== bk) return ak.localeCompare(bk) * dir;
        return a.name.localeCompare(b.name) * dir;
      }
      case 'qty': {
        if (a.quantity !== b.quantity) return (a.quantity - b.quantity) * dir;
        return a.name.localeCompare(b.name) * dir;
      }
      case 'name':
      default:
        return a.name.localeCompare(b.name) * dir;
    }
  });
  return sorted;
}
// 2026-05-26 OTA-059 — RECIPES tab moved to CraftingScreen as its
// 3rd tab (CRAFT / REPAIR / RECIPES). InventoryScreen is now a
// single ITEMS view — no tabs needed.

export function InventoryScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  const equipItem = useGameStore((s) => s.equipItem);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const dropInventoryItem = useGameStore((s) => s.dropInventoryItem);
  const useInventoryItem = useGameStore((s) => s.useInventoryItem);
  const scrapInventoryItem = useGameStore((s) => s.scrapInventoryItem);
  const toggleReserveForFusion = useGameStore((s) => s.toggleReserveForFusion);
  // OTA-269 — pulled in for the pouch-filter-tap stow path. Bypasses
  // the equip modal entirely when pouchFilterActive — a single tap
  // on the eligible item stows it and clears the filter.
  const stowInPouch = useGameStore((s) => s.stowInPouch);
  const [pending, setPending] = useState<{ item: InventoryItem; slots: EquipSlot[] } | null>(null);
  // After-scrap result list. When non-null, the action-modal body
  // switches from "Equip / Drop / Scrap" buttons to a "✦ Added to
  // pack" summary with a single CLOSE button. Cleared on next
  // item-tap.
  const [scrapResult, setScrapResult] = useState<InventoryDelta[] | null>(null);
  // OTA-286 — quantity selector for batch scrap. Player log showed
  // 5 Aetheric Locket + 5 Worn Tartarian Coin scrapped in rapid
  // succession one tap at a time. Stepper lets them pick the count
  // up front; doScrap loops scrapInventoryItem that many times.
  // Reset to 1 whenever the pending item changes (different items
  // start fresh; same item lets the player re-tap with a remembered
  // qty if they want).
  const [scrapQty, setScrapQty] = useState(1);
  useEffect(() => {
    setScrapQty(1);
  }, [pending?.item.id]);
  // OTA-087 — search query + sort axis state. Ephemeral (not
  // persisted across sessions); resets to defaults on each
  // mount. Query is a case-insensitive substring match against
  // the item NAME only (not tags or kind) — keeps the search
  // mental-model simple and predictable.
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  // OTA-269 — when the player taps an empty tool pouch slot, the
  // inventory list below filters to ONLY pouch-eligible items so they
  // can grab the tool without scrolling past 40 entries. Tapping an
  // eligible item stows it and clears the filter. Cancel button or
  // toggling the slot off also clears.
  const [pouchFilterActive, setPouchFilterActive] = useState(false);

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No expedition is underway.</Text>
      </View>
    );
  }

  // OTA-087 — apply search filter + sort BEFORE grouping by
  // category. The category sections still render in the same
  // CATEGORY_ORDER; only the items within each section get
  // filtered/sorted by the user's choices. Empty sections
  // collapse automatically via the `items.length === 0` check
  // further down.
  const queryLower = searchQuery.trim().toLowerCase();
  // OTA-269 — pouch filter narrows the list to pouch-eligible items
  // when the player has tapped an empty slot above. Layered AFTER
  // the text-search filter so both can coexist (rare but cleanly
  // composable).
  const queryFiltered = queryLower.length > 0
    ? player.inventory.filter((i) => i.name.toLowerCase().includes(queryLower))
    : player.inventory;
  const filtered = pouchFilterActive
    ? queryFiltered.filter((i) => isPouchEligible(i, player).eligible)
    : queryFiltered;
  const sorted = sortInventoryItems(filtered, sortKey, sortDirection);
  const grouped = groupInventoryByCategory(sorted);
  // Map equipped item name → the slot(s) it's currently in. Used so the
  // modal can offer Unequip on items already worn.
  const slotsByEquippedName = new Map<string, EquipSlot[]>();
  const allSlotPairs: Array<[EquipSlot, string | undefined]> = [
    ['main', player.equipped?.main],
    ['off', player.equipped?.off],
    ['head', player.equipped?.head],
    ['chest', player.equipped?.chest],
    ['hands', player.equipped?.hands],
    ['legs', player.equipped?.legs],
    ['feet', player.equipped?.feet],
    ['cloak', player.equipped?.cloak],
    ['amulet', player.equipped?.amulet],
    ['ring', player.equipped?.ring],
    // OTA-239 — three concurrent ring slots. ring2/ring3 share the
    // 'ring' EquipSlot identifier in the type union but write to
    // different equipped.* fields; for display dedupe purposes any
    // ring slot counts as 'ring'.
    ['ring', player.equipped?.ring2],
    ['ring', player.equipped?.ring3],
  ];
  for (const [slot, name] of allSlotPairs) {
    if (!name) continue;
    const list = slotsByEquippedName.get(name) ?? [];
    list.push(slot);
    slotsByEquippedName.set(name, list);
  }
  // PlayerEquipped now carries per-slot instance ids (mainId / offId /
  // amuletId / etc.) alongside the names, so the dedupe is exact: the
  // EQUIPPED badge lands on the specific InventoryItem the player put
  // in the slot, never on a duplicate. Legacy saves where ids aren't
  // recorded fall back to the previous "first-matching-name" shim.
  const equippedItemIds = new Set<string>();
  const eq = player.equipped ?? {};
  const idSlots: (string | undefined)[] = [
    eq.mainId, eq.offId, eq.headId, eq.chestId, eq.handsId,
    eq.legsId, eq.feetId, eq.cloakId, eq.amuletId, eq.ringId,
    // OTA-239 — ring2 / ring3 instance ids participate in the
    // EQUIPPED badge dedupe.
    eq.ring2Id, eq.ring3Id,
  ];
  for (const id of idSlots) {
    if (id) equippedItemIds.add(id);
  }
  // Legacy fallback for saves that only have names (no ids yet).
  for (const equippedName of slotsByEquippedName.keys()) {
    const hasIdForThisName = idSlots.some((id) => {
      const item = player.inventory.find((i) => i.id === id);
      return item?.name === equippedName;
    });
    if (hasIdForThisName) continue;
    const owner = player.inventory.find(
      (it) => it.name === equippedName && it.quantity > 0,
    );
    if (owner) equippedItemIds.add(owner.id);
  }

  // ALWAYS show the modal. Auto-equipping silently when there was only one
  // valid slot (e.g. amulet) made the player think the tap did nothing —
  // and left no path to unequip. Modal always opens; player picks Equip
  // (specific slot) or Unequip (if currently worn) or Close.
  const handleItemTap = (item: InventoryItem) => {
    // OTA-269 — pouch-filter tap path. The player tapped an empty
    // pouch slot above, narrowing the inventory below to eligible
    // tools. Tapping one of those tools stows it directly and
    // clears the filter — no equip modal, no double-tap. If the
    // engine refuses (e.g., pouch already full), it logs to the
    // Arbiter; we close the filter either way so the player can
    // see the world feed without re-tapping the slot.
    if (pouchFilterActive) {
      stowInPouch(item.name);
      setPouchFilterActive(false);
      return;
    }
    setScrapResult(null); // fresh modal — clear any prior result
    setPending({ item, slots: validSlotsForItem(item) });
  };

  const closeModal = () => {
    setPending(null);
    setScrapResult(null);
  };
  const chooseSlot = (slot: EquipSlot) => {
    if (!pending) return;
    equipItem(pending.item.name, slot);
    setPending(null);
  };
  const unequipFromSlot = (slot: EquipSlot) => {
    unequipSlot(slot);
    setPending(null);
  };

  const doUse = () => {
    if (!pending) return;
    useInventoryItem(pending.item.name);
    setPending(null);
  };
  const doDrop = () => {
    if (!pending) return;
    dropInventoryItem(pending.item.name);
    setPending(null);
  };
  // OTA-286 — batch scrap. `repsOverride` lets "Scrap All" pass the full
  // stack regardless of the stepper; default uses the stepper value.
  const doScrap = (repsOverride?: number) => {
    if (!pending) return;
    // Snapshot inventory BEFORE the whole batch so we can diff the
    // combined output across all N iterations. scrapInventoryItem
    // is synchronous, so each iteration's mutation is settled before
    // the next call runs.
    const before = (useGameStore.getState().player?.inventory ?? []).map((i) => ({ ...i }));
    // Loop scrap N times. Each call does its own RNG roll + grant + log
    // entry (so the player sees each yield individually in the world feed),
    // and the modal's result body shows the combined delta. Clamp to the
    // current stack size in case the inventory shifted while the modal was
    // open (e.g., an autosave dock event).
    const stack = pending.item.quantity ?? 1;
    const reps = Math.max(1, Math.min(repsOverride ?? scrapQty, stack));
    for (let i = 0; i < reps; i++) {
      scrapInventoryItem(pending.item.name);
    }
    const after = useGameStore.getState().player?.inventory ?? [];
    const delta = computeInventoryDelta(before, after);
    setScrapResult(delta);
  };

  // Build the modal's button list based on the item's state.
  // Wrapped in try/catch so a malformed item / missing field can't
  // crash the screen — playtest reported an inventory hang-then-
  // crash and the most likely vector is something downstream of
  // canScrap / getItemPreview throwing on an unexpected item shape.
  // Fallback is the safe Close-only menu; the player can still
  // navigate away.
  const buildModalButtons = (): {
    label: string;
    onPress: () => void;
    tone?: 'primary' | 'destructive' | 'neutral';
  }[] => {
    if (!pending) return [{ label: 'Close', onPress: closeModal, tone: 'neutral' }];
    try {
    // Only show Unequip buttons when THIS specific item is the equipped one
    // (not just same-named). Prevents the modal on a second locket from
    // offering to unequip the first locket's slot.
    const equippedInSlots = equippedItemIds.has(pending.item.id)
      ? slotsByEquippedName.get(pending.item.name) ?? []
      : [];
    const buttons: ReturnType<typeof buildModalButtons> = [];
    // Equip buttons — one per valid slot the item ISN'T currently in.
    for (const slot of pending.slots) {
      if (equippedInSlots.includes(slot)) continue;
      buttons.push({
        label: `Equip (${SLOT_LABEL[slot]})`,
        onPress: () => chooseSlot(slot),
        tone: 'primary',
      });
    }
    // Unequip buttons — one per slot the item is currently in.
    for (const slot of equippedInSlots) {
      buttons.push({
        label: `Unequip (${SLOT_LABEL[slot]})`,
        onPress: () => unequipFromSlot(slot),
        tone: 'destructive',
      });
    }
    // USE — consumables eat, off-hand-eligible items equip to off,
    // others fall back to their canonical slot. Hide when the
    // item's already equipped everywhere it could go.
    //
    // OTA-201 — Player report on Aetheric Torch + Vision Lens
    // modals: both have rich catalog descriptions and authored
    // effects ("Reveals hidden scene hooks", "Vision aid for
    // Aetheric anomalies"), the modal body string even claims
    // "you can still keep, gift, sell, or use it" — but no USE
    // button was rendered because the Torch is kind:'relic' (not
    // consumable) and the Lens is kind:'exploration'. The use_relic
    // engine handler already routes by effect.kind for revealScene
    // / healHP / gate / etc.; we just weren't surfacing the action.
    // Broadened the gate to "has any effect" so items with authored
    // effects light up the USE button regardless of `kind`.
    const isConsumable = pending.item.kind === 'consumable';
    const hasEffect = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { resolveItemEffect } = require('../engine/itemEffect');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { findExplorationItemByName, findGearByName, findMaterialByName } = require('../engine/crafting');
        return !!resolveItemEffect(pending.item.name, [findGearByName, findExplorationItemByName, findMaterialByName]);
      } catch { return false; }
    })();
    const offEligible = pending.slots.includes('off') && !equippedInSlots.includes('off');
    const anySlotFree = pending.slots.some((s) => !equippedInSlots.includes(s));
    // OTA-214 — fix the redundant USE button on equip-only items.
    // Player ask: "I don't think you can have both equip and use on
    // things like armor cuz to use it. you have to equip it." Pre-OTA
    // the modal showed BOTH "Equip (Chest)" and "Use" on armor — the
    // Use button just re-routed through the equip handler, no
    // different from tapping Equip. Now USE is only surfaced when
    // there's a REAL action behind it: consumable (eat), an authored
    // effect (Torch's revealScene, Lens's gate, Scanner's bias), or
    // an off-hand-eligible item that takes a use-style off-hand
    // equip. Pure-armor / pure-weapon (no effect, equippable) gets
    // the dedicated Equip button only.
    const useIsRealAction = isConsumable || hasEffect || offEligible;
    if (useIsRealAction) {
      buttons.push({
        label: isConsumable ? 'Use (eat)' : (offEligible ? 'Use (off hand)' : 'Use'),
        onPress: doUse,
        tone: 'primary',
      });
    }
    // OTA-120 Phase 5 — dog-targeted actions. Equip vests on the dog
    // (kind 'dog_armor'); feed consumables to the dog (any consumable
    // — the treat-vs-regular delta is calculated in the engine). Only
    // surface when an active dog exists.
    const dogActive = !!player?.dog
      && player.dog.status !== 'abandoned'
      && player.dog.status !== 'dead';
    if (dogActive && pending.item.kind === 'dog_armor') {
      buttons.push({
        label: 'Equip on dog',
        onPress: () => {
          // Route via submitPlayerAction so the engine's equip-on-dog
          // path can grow without UI changes. Falls back to direct
          // state mutation since no parser intent exists yet for
          // dog-equip (Phase 5 deferred a dedicated verb).
          const p = useGameStore.getState().player;
          if (!p?.dog) { closeModal(); return; }
          useGameStore.setState((s) => s.player && s.player.dog
            ? {
                player: {
                  ...s.player,
                  dog: {
                    ...s.player.dog,
                    equipped: { vest: pending.item.name },
                  },
                },
              }
            : s);
          useGameStore.getState().appendLog('world', `You strap the ${pending.item.name} onto ${p.dog.name}.`);
          closeModal();
        },
        tone: 'primary',
      });
    }
    if (dogActive && isConsumable) {
      // OTA-184 — use the dog's actual name in the button label
      // ("Feed Rocky") instead of the generic "Feed to dog" so the
      // inventory affordance reads like every other personal beat.
      // Player ask: "let's use the dogs name instead of just dog."
      const dogName = player!.dog!.name;
      buttons.push({
        label: `Feed ${dogName}`,
        onPress: () => {
          useGameStore.getState().submitPlayerAction(`feed dog ${pending.item.name}`);
          closeModal();
        },
        tone: 'primary',
      });
    }
    // SCRAP — only for built items with material content. Hidden for
    // raw stock (already material) and for items currently equipped
    // (would leave a phantom slot).
    if (canScrap(pending.item) && equippedInSlots.length === 0) {
      const stack = pending.item.quantity ?? 1;
      buttons.push({
        label: stack > 1 ? `Scrap ×${Math.max(1, Math.min(scrapQty, stack))}` : 'Scrap',
        onPress: () => doScrap(),
        tone: 'destructive',
      });
      // Scrap All — one tap to break down the whole stack (skips the stepper).
      if (stack > 1) {
        buttons.push({
          label: `Scrap All (${stack})`,
          onPress: () => doScrap(stack),
          tone: 'destructive',
        });
      }
    }
    // OTA-208 — the OTA-207 inventory "Throw at X" button was the
    // wrong abstraction. Throwables are now weapons (validSlotsForItem
    // routes the 'throwable' tag to main/off slots), so the player
    // equips them and attacks from the combat screen. The attack
    // handler consumes one quantity + auto-unequips on the swing.
    // No throw button in the inventory modal — the equip + attack
    // flow IS the throw.
    // OTA-194 — RESERVE FOR FUSION. Heart-tap toggle, only on
    // inferred (catalog-absent) items. Filled heart = locked from
    // OTA-193's auto-substitute crafting drain; empty heart = free
    // to be consumed for canonical material substitution. The
    // fusion bench (planned) will draw from reserved items.
    if (isInferredInventoryItem(pending.item)) {
      const reserved = pending.item.reservedForFusion === true;
      buttons.push({
        label: reserved ? '♥ Reserved for fusion' : '♡ Save for fusion',
        onPress: () => {
          toggleReserveForFusion(pending.item.id);
          closeModal();
        },
        tone: 'neutral',
      });
    }
    // DROP — always available unless the item is currently equipped.
    // Drop handler in the engine also refuses equipped items, but
    // hiding the button cuts down on noise.
    if (equippedInSlots.length === 0) {
      buttons.push({
        label: 'Drop',
        onPress: doDrop,
        tone: 'destructive',
      });
    }
    buttons.push({ label: 'Close', onPress: closeModal, tone: 'neutral' });
    return buttons;
    } catch {
      return [{ label: 'Close', onPress: closeModal, tone: 'neutral' }];
    }
  };

  // Wrap preview lookup too — getItemPreview reads multiple catalog
  // tables and could throw if an item name isn't in any of them.
  let modalPreview: ReturnType<typeof getItemPreview> | null = null; // OTA-195 may also read uniqueStats
  if (pending) {
    try { modalPreview = getItemPreviewForInstance(pending.item); }
    catch { modalPreview = null; }
  }
  const modalBody = pending && pending.slots.length === 0 && (slotsByEquippedName.get(pending.item.name)?.length ?? 0) === 0
    ? 'This item cannot be equipped, but you can still keep, gift, sell, or use it.'
    : undefined;

  // Post-scrap result body. Overrides the equip/drop/etc body when
  // scrapResult is populated. Lists what landed in the pack with ✦
  // markers, or a "no parts" line when scrapOutputFor returned an
  // empty grant set.
  const scrapResultBody = scrapResult !== null
    ? (scrapResult.length > 0
        ? `✦ Added to your pack:\n${scrapResult.map((r) => `  • ${r.name}${r.quantity > 1 ? ` × ${r.quantity}` : ''}${r.rarity && r.name !== 'TC' ? ` (${r.rarity})` : ''}`).join('\n')}`
        : 'The breakdown yielded nothing usable this time. Some salvage simply refuses.')
    : undefined;
  const scrapResultButtons = scrapResult !== null
    ? [{ label: 'Close', onPress: closeModal, tone: 'neutral' as const }]
    : null;

  return (
    <View style={styles.container}>
      {/* OTA-230 — first-time inventory hint. Pops once per install
          when the player first opens the pack; dismissable.
          Authoring rule: ~25 words, 2 sentences max. */}
      <FirstTimeHint
        id="inventory_first_open"
        title="Your pack"
        body="Tap any item to equip, use, scrap, or drop. The green line shows damage; the diamond means engine-named."
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
        <Text style={styles.title}>INVENTORY</Text>
      </View>

      <Text style={styles.tc}>TC: {player.tc}</Text>

      <SearchSortBar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Search your pack…"
        sortOptions={INV_SORT_OPTIONS}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={(k, d) => { setSortKey(k); setSortDirection(d); }}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* OTA-239 — Tool Pouch banner. 3 slots above the inventory list
            showing what's stowed (Aetheric Torch, Vision Lens, etc.).
            Pouched items are ready-to-use; the `use <item>` verb
            resolves them faster. Tap a slot to unpouch. Tap an inventory
            item below to stow via the existing equip dialog (the dialog
            now offers "stow in pouch" alongside the equip slots). */}
        <ToolPouchBanner
          player={player}
          pouchFilterActive={pouchFilterActive}
          onTapEmptySlot={() => setPouchFilterActive((v) => !v)}
        />
        {/* OTA-269 — filter active callout. Shows when the player
            has tapped an empty pouch slot above; the inventory below
            is now narrowed to pouch-eligible tools. CANCEL clears
            the filter. */}
        {pouchFilterActive && (
          <View style={styles.pouchFilterBanner}>
            <Text style={styles.pouchFilterText}>
              Tap a tool below to stow it on your belt.
            </Text>
            <TouchableOpacity onPress={() => setPouchFilterActive(false)} style={styles.pouchFilterCancel}>
              <Text style={styles.pouchFilterCancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        )}
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (items.length === 0) return null;
          return (
            <View key={cat} style={styles.section}>
              <View style={[styles.sectionHeader, { borderLeftColor: CATEGORY_COLORS[cat] }]}>
                <Text style={[styles.sectionLabel, { color: CATEGORY_COLORS[cat] }]}>
                  {CATEGORY_LABEL[cat].toUpperCase()}
                </Text>
                <Text style={styles.sectionCount}>
                  {items.reduce((sum, i) => sum + i.quantity, 0)}
                </Text>
              </View>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  color={CATEGORY_COLORS[cat]}
                  isEquipped={equippedItemIds.has(item.id)}
                  isPouched={(player.equipped?.toolPouchIds ?? []).includes(item.id)}
                  onPress={() => handleItemTap(item)}
                />
              ))}
            </View>
          );
        })}
        {player.inventory.length === 0 && (
          <Text style={styles.empty}>Your pack is empty. Tartaria has not given you anything yet.</Text>
        )}
      </ScrollView>

      <View style={styles.legend}>
        {CATEGORY_ORDER.map((cat) => (
          <View key={cat} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: CATEGORY_COLORS[cat] }]} />
            <Text style={styles.legendText}>{CATEGORY_LABEL[cat]}</Text>
          </View>
        ))}
      </View>

      <BrandedModal
        visible={pending !== null}
        title={scrapResult !== null
          ? `${pending?.item.name ?? ''} — Salvaged`
          : pending?.item.name ?? ''}
        itemPreview={scrapResult !== null ? null : modalPreview}
        contextLine={
          scrapResult !== null
            ? undefined
            : pending && pending.item.durability
              ? `Durability: ${pending.item.durability.current}/${pending.item.durability.max}`
              : undefined
        }
        body={scrapResultBody ?? modalBody}
        // OTA-286 — quantity stepper appears when the player is
        // looking at a stack of 2+ scrap-able items AND we're still
        // in the action phase (not the post-salvage result view) AND
        // the specific stack the player tapped isn't an equipped
        // instance (id match via equippedItemIds). Lets them batch-
        // scrap N at once instead of tapping Scrap back-to-back.
        // Stack of 1, non-scrap-able items, equipped instance → no
        // stepper; modal looks identical to before.
        quantityStepper={
          scrapResult === null
          && pending
          && pending.item.quantity > 1
          && canScrap(pending.item)
          && !equippedItemIds.has(pending.item.id)
            ? {
                label: 'Scrap how many?',
                value: Math.max(1, Math.min(scrapQty, pending.item.quantity)),
                min: 1,
                max: pending.item.quantity,
                onChange: setScrapQty,
              }
            : undefined
        }
        buttons={scrapResultButtons ?? buildModalButtons()}
        onRequestClose={closeModal}
      />
    </View>
  );
}

// OTA-239 — Tool Pouch banner. 3 slots showing what's stowed.
// Empty slots render as dashes; pouched slots show the item name +
// an UNPOUCH button. Player stows via the existing equip flow
// (ItemRow's modal gains a "STOW IN POUCH" option for tool-eligible
// items) or via `stow <item>` in the input box.
// OTA-269 — empty slots are now tappable + green-bordered (chip-like)
// so they read as actionable affordances instead of dead "— empty —"
// labels. Tapping an empty slot toggles `pouchFilterActive` in the
// parent, which narrows the inventory list below to pouch-eligible
// tools. Player ask: "the empty tool pouch slots should be highlighted
// so the player can easily see them, and when you tap the empty slot
// your inventory should sort to only the items available to be used
// there."
function ToolPouchBanner({
  player,
  pouchFilterActive,
  onTapEmptySlot,
}: {
  player: PlayerCharacter;
  pouchFilterActive: boolean;
  onTapEmptySlot: () => void;
}) {
  const POUCH_MAX = 4;
  const pouchIds = player.equipped?.toolPouchIds ?? [];
  const unpouchItem = useGameStore((s) => s.unpouchItem);
  const slots: Array<{ name: string | null; id: string | null }> = [];
  for (let i = 0; i < POUCH_MAX; i++) {
    const id = pouchIds[i];
    const item = id ? player.inventory.find((it) => it.id === id) : undefined;
    slots.push({ name: item?.name ?? null, id: id ?? null });
  }
  return (
    <View style={pouchStyles.banner}>
      <Text style={pouchStyles.title}>TOOL POUCH</Text>
      <Text style={pouchStyles.hint}>Ready-to-use tools (4 slots). Tap an empty slot to stow from your pack.</Text>
      <View style={pouchStyles.row}>
        {slots.map((slot, idx) => (
          <View key={idx} style={pouchStyles.slot}>
            {slot.name ? (
              <TouchableOpacity
                style={pouchStyles.slotFilled}
                activeOpacity={0.7}
                onPress={() => unpouchItem(slot.name!)}
              >
                <Text style={pouchStyles.slotName} numberOfLines={1}>{slot.name}</Text>
                <Text style={pouchStyles.slotAction}>tap to unstow</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  pouchStyles.slotEmpty,
                  pouchFilterActive && pouchStyles.slotEmptyActive,
                ]}
                activeOpacity={0.7}
                onPress={onTapEmptySlot}
              >
                <Text style={[
                  pouchStyles.slotEmptyText,
                  pouchFilterActive && pouchStyles.slotEmptyTextActive,
                ]}>
                  {pouchFilterActive ? 'pick a tool ↓' : '+ stow tool'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const pouchStyles = StyleSheet.create({
  banner: {
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#1a1612',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
  },
  title: { color: '#c9a86a', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  hint: { color: '#7a705c', fontSize: 10, fontStyle: 'italic', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 6 },
  slot: { flex: 1 },
  slotFilled: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#26201a',
  },
  // OTA-269 — empty slots now use the same green chip border as the
  // SearchModal scene chips so they read "this is a real button you
  // can tap." Dashed border + dim text was too easy to miss. When
  // `pouchFilterActive` is true the parent's tap is "armed" — the
  // empty-active variant brightens the fill so the player sees which
  // mode they're in.
  slotEmpty: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#13110f',
    alignItems: 'center',
  },
  slotEmptyActive: {
    backgroundColor: '#1a2614',
    borderColor: '#c9a86a',
  },
  slotName: { color: '#e6d8b3', fontSize: 11, fontWeight: '700' },
  slotAction: { color: '#7a705c', fontSize: 9, marginTop: 2 },
  slotEmptyText: { color: '#9ec96a', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  slotEmptyTextActive: { color: '#c9a86a' },
});

function ItemRow({
  item,
  color,
  isEquipped,
  isPouched,
  onPress,
}: {
  item: InventoryItem;
  color: string;
  isEquipped: boolean;
  isPouched: boolean;
  onPress: () => void;
}) {
  const canEquip = validSlotsForItem(item).length > 0;
  // OTA-120 Phase 5 — dog-related tagging.
  // [fits dog] for dog_armor items; [treat] for consumables flagged
  // dogTreat in their catalog effect (or tagged with 'dog_treat' /
  // 'treat' on the inventory item itself for items dropped before
  // the catalog row existed).
  const fitsDog = item.kind === 'dog_armor';
  const isTreat = (item.tags ?? []).includes('dog_treat') || (() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findGearByName } = require('../engine/crafting');
    const gear = findGearByName(item.name);
    return gear?.effect?.kind === 'consumable' && gear.effect.dogTreat === true;
  })();
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rowStripe, { backgroundColor: color }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          {/* OTA-199 — inferred-item marker. Player asked: "Since we
              don't know what items were inferred and now they are
              useful let's put a small diamond before the name to
              signify it is, use the appropriate rarity color." The
              isInferredItem predicate (OTA-194) already distinguishes
              catalog from synthesized; here the diamond is colored
              by the InventoryItem's rarity so the player can read
              both at a glance — the diamond signals "engine-named"
              and its color signals the synthesis tier. Fused items
              (OTA-195 uniqueStats) are catalog-absent by name AND
              carry a Rare / Legendary rarity, so they get a purple
              or orange diamond too. */}
          {isInferredInventoryItem(item) && (
            <Text style={[styles.rowInferredDiamond, { color: rarityHexColor(item.rarity) }]}>◆ </Text>
          )}
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowQty}>×{item.quantity}</Text>
        </View>
        <View style={styles.rowMetaRow}>
          {item.rarity && <Text style={styles.rowMeta}>{item.rarity}</Text>}
          {/* OTA-194 — heart marker on items the player has reserved
              for the fusion bench. Tiny, fits in the meta row next to
              rarity / dog tags. No marker when un-reserved so the row
              isn't noisy for the catalog majority. */}
          {item.reservedForFusion && <Text style={[styles.rowMeta, styles.rowReserved]}>♥</Text>}
          {/* arb58 — mark items currently stowed in the tool pouch so the
              player can see at a glance which pack items are pouched. */}
          {isPouched && <Text style={[styles.rowMeta, styles.rowPouch]}>[tool pouch]</Text>}
          {fitsDog && <Text style={[styles.rowMeta, styles.rowDogTag]}>[fits dog]</Text>}
          {isTreat && <Text style={[styles.rowMeta, styles.rowDogTag]}>[treat]</Text>}
          {/* OTA 028 — surface the weapon's damage dice next to
              durability so the player can compare swords at a
              glance without opening a details modal. Playtester:
              "I want to see the weapon durability and I also want
              to see the attack dice roll like a 1d10 or a 1d20.
              That's how I know which weapon is the strongest." */}
          {(() => {
            // OTA-227 — uses resolveDisplayWeapon so fused weapons
            // (uniqueStats, catalog-absent) AND hand-authored ones
            // resolve through one API. See app/engine/itemResolution.ts.
            const w = resolveDisplayWeapon(item);
            if (!w) return null;
            return (
              <Text style={[styles.rowMeta, styles.rowDamage]}>
                {w.damageDice} {w.damageType}
              </Text>
            );
          })()}
          {item.durability && (
            <Text
              style={[
                styles.rowMeta,
                item.durability.current <= Math.ceil(item.durability.max * 0.25) && styles.rowDurabilityLow,
              ]}
            >
              dur {item.durability.current}/{item.durability.max}
            </Text>
          )}
          {canEquip && !isEquipped && <Text style={styles.rowEquippable}>tap to equip</Text>}
          {!canEquip && !isEquipped && <Text style={styles.rowEquippable}>tap for details</Text>}
          {isEquipped && (() => {
            // 2026-05-26 OTA-056 — when a two-handed weapon is equipped,
            // show "EQUIPPED (two-handed)" so the player sees in the
            // inventory list that the weapon is taking BOTH hands.
            // Matches the off-hand mirror on the Character Screen.
            const w = findWeaponByName(item.name);
            const twoHanded = w?.style === 'two_handed';
            return (
              <Text style={styles.rowEquipped}>
                EQUIPPED{twoHanded ? ' (two-handed)' : ''}
              </Text>
            );
          })()}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// OTA-199 — rarity-to-hex palette mirrors BrandedModal.tsx so the
// inferred-item diamond on the inventory row matches the color the
// player sees in the item modal's rarity line. Kept local to this
// file because the only other call site (the modal) imports its own
// version; centralizing would be premature.
function rarityHexColor(rarity: string | null | undefined): string {
  switch (rarity) {
    case 'Legendary': return '#e07a5f';
    case 'Rare': return '#b88ce0';
    case 'Uncommon': return '#9ec96a';
    default: return '#c9a86a'; // Common / undefined
  }
}

const styles = StyleSheet.create({
  // OTA-275 — tablet width cap. Phones unchanged; iPad centers at 600pt.
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12, width: '100%', maxWidth: 600, alignSelf: 'center' },
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
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  tc: { color: '#c9a86a', fontSize: 12, letterSpacing: 1, marginBottom: 6, textAlign: 'right' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 12 },
  section: { marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  sectionCount: { color: '#7a705c', fontSize: 11 },
  row: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 4,
    overflow: 'hidden',
  },
  rowStripe: { width: 4 },
  rowBody: { flex: 1, padding: 8 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowName: { color: '#e6d8b3', fontSize: 14, fontWeight: '600', flex: 1 },
  rowInferredDiamond: { fontSize: 12, fontWeight: '700' },
  rowQty: { color: '#cdbf99', fontSize: 12 },
  rowMetaRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  rowMeta: { color: '#7a705c', fontSize: 10, letterSpacing: 1 },
  rowDurabilityLow: { color: '#e07a5f' },
  // OTA 028 — damage dice chip in green so it pops as the
  // "how hard does this hit" signal at a glance.
  rowDamage: { color: '#9ec96a' },
  // OTA-120 Phase 5 — [fits dog] / [treat] tag styling. Amber so they
  // stand out from the grey rarity / durability metadata.
  rowDogTag: { color: '#c9a86a', fontWeight: '700' },
  rowReserved: { color: '#d97a7a', fontWeight: '700' },
  rowPouch: { color: '#c9a86a', fontWeight: '700' },
  rowEquipped: { color: '#c9a86a', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  rowEquippable: { color: '#7a705c', fontSize: 10, letterSpacing: 1, fontStyle: 'italic' },
  empty: { color: '#7a705c', fontStyle: 'italic', textAlign: 'center', marginTop: 30 },
  // OTA-269 — callout shown above the inventory list when the player
  // has tapped an empty pouch slot. Tan accent bar + CANCEL chip so
  // the player always has a clear exit from the filter mode.
  pouchFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a2614',
    borderColor: '#c9a86a',
    borderLeftWidth: 3,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  pouchFilterText: { color: '#cdbf99', fontSize: 12, flexShrink: 1, flexGrow: 1 },
  pouchFilterCancel: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
  },
  pouchFilterCancelText: { color: '#cdbf99', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 8,
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
    marginTop: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { color: '#7a705c', fontSize: 10, letterSpacing: 1 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
});
