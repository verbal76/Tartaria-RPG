import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { useGameStore } from '../state/gameStore';
import {
  CATEGORY_COLORS,
  rarityHexColor, // ⚠ OTA-1312 — one palette, shared

  CATEGORY_LABEL,
  CATEGORY_ORDER,
  groupInventoryByCategory,
} from '../components/InventoryCategorize';
import type { InventoryItem, EquipSlot, PlayerCharacter } from '../engine/types';
import { validSlotsForItem, SLOT_LABEL, wornInstanceIds, byWornFirst, planGroupEquip } from '../engine/equipment';
import { canScrap } from '../engine/scrapEngine';
import { findWeaponByName, isFusedInventoryItem } from '../engine/crafting';
import { resolveDisplayWeapon } from '../engine/itemResolution';
import { isPouchEligible } from '../engine/pouchEligibility';
import { isBandolierEligible, itemIsThrowable } from '../engine/bandolierEligibility';
import { isWeaponCoatingItem } from '../engine/weaponCoating';
import { canonicalItemRarity, canonicalItemTags } from '../engine/crafting';
import { useReadableMuted } from '../ui/displaySettings';
import { BrandedModal } from '../components/BrandedModal';
import { giftBlockReason } from '../engine/giftEligibility';
import { getItemPreview, getItemPreviewForInstance } from '../components/itemPreview';
import { fusionMaterialTags, isForgeReservableItem } from '../engine/itemFusion';
import { coatingItemDrinkable } from '../engine/coatingRemedy';
import { computeInventoryDelta, type InventoryDelta } from '../components/inventoryDelta';
import { SearchSortBar, type SortDirection } from '../components/SearchSortBar';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { consumeVerb } from '../engine/consumeVerb';
import { wornDogVestInstanceId } from '../engine/dogCompanion';
import { activeFetchItemNames } from '../engine/factionQuests';
import { isGolemRepairPart, isGolemSubstitutePart, isGolemWeapon, golemRepairHeal, golemSubstituteHeal } from '../engine/golems';
import { healBatchCount, HEAL_BATCH_NOTE } from '../engine/healBatch';
import { isQuestLockedItem } from '../engine/questItems';
import { CONTENT_MAX_WIDTH } from '../ui/displayScale'; // OTA-1227 — one column width, platform-aware

// 2026-05-27 OTA-087 — Sort axes for inventory. Each axis
// has a default direction baked in (alphabetical asc, rarity
// asc = Common→Legendary, quantity desc = biggest stacks
// first, kind asc). Tapping the active axis toggles direction.
const INV_SORT_OPTIONS = [
  // arb-fix — SLOT is the default: within each category, gear orders by the
  // body slot it fills (main → off → head → chest → hands → legs → feet →
  // cloak → amulet → ring), so the Armor section reads head-to-toe.
  { key: 'slot', label: 'SLOT' },
  { key: 'name', label: 'NAME' },
  { key: 'rarity', label: 'RARITY' },
  { key: 'kind', label: 'KIND' },
  { key: 'qty', label: 'QTY' },
  // arb-fix — FUSABLE acts as a filter: it narrows the list to every item that
  // qualifies for the Crucible (whether or not it's reserved ♥), so the player
  // can see their fusion stock at a glance.
  { key: 'fusionable', label: 'FUSABLE' },
];

// arb-fix — an item qualifies for fusion if it's engine-inferred (the Crucible
// only fuses non-catalog items) OR it's faction gear (a reservable catalyst).
// Mirrors the eligibility gate in gameStore.toggleReserveForFusion exactly.
function isFusionEligible(item: InventoryItem): boolean {
  if (canonicalItemTags(item).includes('faction_gear')) return true;
  return isForgeReservableItem(item);
}
const RARITY_RANK: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Legendary: 3,
};
// arb-fix — head-to-toe order for the SLOT sort. Items with no equip slot
// (materials, consumables, loot) fall to the bottom of their category by name.
const SLOT_RANK: Record<string, number> = {
  main: 0, off: 1, head: 2, chest: 3, hands: 4, legs: 5, feet: 6, cloak: 7, amulet: 8, ring: 9,
};
function primarySlotRank(item: InventoryItem): number {
  const s = validSlotsForItem(item)[0];
  return s ? (SLOT_RANK[s] ?? 50) : 99;
}

function sortInventoryItems(
  items: InventoryItem[],
  sortKey: string,
  direction: SortDirection,
  // OTA-1094 — worn instance ids. Gear you are actually wearing floats to the top
  // of its category on EVERY axis. Owner: "whenever a list of armor or weapons
  // pops up sort equipped items to the top."
  worn: ReadonlySet<string> = new Set<string>(),
): InventoryItem[] {
  const dir = direction === 'asc' ? 1 : -1;
  const sorted = [...items];
  sorted.sort((a, b) => {
    // Pre-key, direction-independent: the pieces on your body come first. The list
    // is grouped by category downstream, so this reads as "worn first within Weapons,
    // worn first within Armor" rather than dragging armor above weapons.
    const aw = worn.has(a.id);
    const bw = worn.has(b.id);
    if (aw !== bw) return aw ? -1 : 1;
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
      case 'fusionable': {
        // Reserved (♥) items float to the top of the fusion view, then by name.
        const ar = a.reservedForFusion ? 0 : 1;
        const br = b.reservedForFusion ? 0 : 1;
        if (ar !== br) return (ar - br) * dir;
        return a.name.localeCompare(b.name) * dir;
      }
      case 'slot': {
        const ar = primarySlotRank(a);
        const br = primarySlotRank(b);
        if (ar !== br) return (ar - br) * dir;
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
  // OTA-1154 — gift mode: who we are giving to while the player browses.
  const giftMode = useGameStore((s) => s.giftMode);
  const giveGift = useGameStore((s) => s.giveGift);
  const cancelGiftMode = useGameStore((s) => s.cancelGiftMode);
  const setScreen = useGameStore((s) => s.setScreen);
  // arb103 → shared. The bottom legend text washed out when the player tuned a
  // lighter/brighter background. The auto-contrast tone (dark ink on a light
  // bg, faded parchment on a dark one) now lives in displaySettings so the
  // title screen + other on-background text reuse the exact same color.
  const legendTextColor = useReadableMuted();
  const equipItem = useGameStore((s) => s.equipItem);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  // OTA-1114 — is something swinging at you right now? The take-off confirm
  // says a different thing mid-fight, because that is the case the owner's
  // death log actually is: AC 16 → 10 with five raiders on the tile.
  const inCombatNow = useGameStore((s) => (s.currentScene?.enemies?.length ?? 0) > 0);
  const dropInventoryItem = useGameStore((s) => s.dropInventoryItem);
  const useInventoryItem = useGameStore((s) => s.useInventoryItem);
  const scrapInventoryItem = useGameStore((s) => s.scrapInventoryItem);
  const toggleReserveForFusion = useGameStore((s) => s.toggleReserveForFusion);
  const reserveManyForFusion = useGameStore((s) => s.reserveManyForFusion);
  const toggleReserveForQuest = useGameStore((s) => s.toggleReserveForQuest);
  const applyCoating = useGameStore((s) => s.applyCoating);
  const applyCoatingToArmor = useGameStore((s) => s.applyCoatingToArmor);
  // OTA-269 — pulled in for the pouch-filter-tap stow path. Bypasses
  // the equip modal entirely when pouchFilterActive — a single tap
  // on the eligible item stows it and clears the filter.
  const stowInPouch = useGameStore((s) => s.stowInPouch);
  const stowInBandolier = useGameStore((s) => s.stowInBandolier);
  const useHealBatch = useGameStore((s) => s.useHealBatch);
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
  // ⚠ OTA-1126 — THE PACK IS A HOMEWORK WINDOW. Owner named it directly:
  // *"Menu / inventory / map time? You're reading, not waiting on the
  // engine."* While this screen is mounted the model may write item
  // descriptions ahead of the player opening them, so the popup is already
  // there when they tap. Cleared on unmount, and separately cleared by
  // submitPlayerAction the instant any real action is taken — a screen that
  // forgot to clean up can therefore never leave homework running forever.
  useEffect(() => {
    const mark = useGameStore.getState().markUiIdle;
    mark(true);
    return () => { mark(false); };
  }, []);
  // OTA-087 — search query + sort axis state. Ephemeral (not
  // persisted across sessions); resets to defaults on each
  // mount. Query is a case-insensitive substring match against
  // the item NAME only (not tags or kind) — keeps the search
  // mental-model simple and predictable.
  const [searchQuery, setSearchQuery] = useState('');
  // arb-fix — default to SLOT sort so opening the pack always groups gear by
  // the slot it fills (head-to-toe within Armor). The player can switch sorts
  // afterwards; this resets to SLOT each time the screen re-opens.
  const [sortKey, setSortKey] = useState('slot');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  // OTA-269 — when the player taps an empty tool pouch slot, the
  // inventory list below filters to ONLY pouch-eligible items so they
  // can grab the tool without scrolling past 40 entries. Tapping an
  // eligible item stows it and clears the filter. Cancel button or
  // toggling the slot off also clears.
  const [pouchFilterActive, setPouchFilterActive] = useState(false);
  // arb110 — bandolier fill mode (mutually exclusive with the pouch fill mode).
  const [bandolierFilterActive, setBandolierFilterActive] = useState(false);
  // OTA-1100 — inventory GROUP mode. Owner, after OTA-1099's group sell: "yes
  // wire drop, fusable select and scrap the same way." Same contract as the
  // vendor list, which is the whole point — one gesture, one meaning, wherever
  // you are: HOLD a row to start a group, TAP to add or remove, act on the lot.
  const [invSelectMode, setInvSelectMode] = useState(false);
  const [invSelected, setInvSelected] = useState<string[]>([]);
  // Which group action is awaiting confirmation; null = no modal up.
  const [invGroupAction, setInvGroupAction] = useState<'drop' | 'scrap' | 'reserve' | 'release' | 'equip' | 'unequip' | null>(null);
  // arb108 — per-category collapse. Tapping a section header folds that whole
  // category away so the player can skip past Weapons/Armor to reach Materials /
  // Food without scrolling through every row. Keyed by category id; default open.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  // OTA-668 — a deep-link (e.g. "View in inventory" after a Crucible forge) can
  // ask for a category section to be EXPANDED on arrival. Sections default
  // collapsed, so without this the player lands on a folded pack and never sees
  // the new piece. Apply it once on entry, unfold that section, then clear it.
  const pendingInventoryCategory = useGameStore((s) => s.pendingInventoryCategory);
  const clearPendingInventoryCategory = useGameStore((s) => s.clearPendingInventoryCategory);
  useEffect(() => {
    if (pendingInventoryCategory) {
      const cat = pendingInventoryCategory;
      setCollapsedSections((prev) => ({ ...prev, [cat]: false }));
      clearPendingInventoryCategory();
    }
  }, [pendingInventoryCategory, clearPendingInventoryCategory]);
  // OTA-684 — scroll to + briefly highlight a specific item on arrival (a forged
  // weapon can sort anywhere in a long list). We record each section's y (sections
  // are direct children of the scroll content) and each row's y within its section
  // via onLayout, then after the expanded section has laid out we scroll to
  // section.y + row.y and pulse the row for ~2.5s.
  const scrollRef = useRef<ScrollView>(null);
  const sectionYRef = useRef<Record<string, number>>({});
  const rowInfoRef = useRef<Record<string, { y: number; cat: string }>>({});
  const [focusItemId, setFocusItemId] = useState<string | null>(null);
  const pendingInventoryItemId = useGameStore((s) => s.pendingInventoryItemId);
  const clearPendingInventoryFocusItem = useGameStore((s) => s.clearPendingInventoryFocusItem);
  useEffect(() => {
    if (pendingInventoryItemId) {
      setFocusItemId(pendingInventoryItemId);
      clearPendingInventoryFocusItem();
    }
  }, [pendingInventoryItemId, clearPendingInventoryFocusItem]);
  useEffect(() => {
    if (!focusItemId) return;
    // Let the just-expanded section render + lay out before measuring.
    const scrollTimer = setTimeout(() => {
      const info = rowInfoRef.current[focusItemId];
      if (info) {
        const y = (sectionYRef.current[info.cat] ?? 0) + info.y;
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true });
      }
    }, 280);
    // Clear the highlight after the pulse so it doesn't stick.
    const clearTimer = setTimeout(() => setFocusItemId(null), 2600);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [focusItemId]);
  // OTA-360 — weapon-coating picker. When the player taps "Coat a
  // weapon" on a coating consumable, this holds that consumable and
  // the second modal lists the coatable weapons in the pack as
  // pick buttons. Cleared on apply or cancel.
  const [coatTarget, setCoatTarget] = useState<InventoryItem | null>(null);
  // OTA-921 — a coat that would REPLACE (scrub off) an existing coating is staged here
  // for a second, explicit confirm. Applying a coating to a weapon with no open second
  // slot silently overwrote slot 1 on a single tap — that is how a coating "disappears".
  const [coatReplace, setCoatReplace] = useState<
    { coatId: string; coatName: string; weaponId: string; weaponName: string;
      slots: Array<{ slot: 'coating' | 'coating2'; label: string }> } | null
  >(null);
  // engine_Dev — armor-coating picker: the vial being worked into a piece of armor.
  const [armorCoatTarget, setArmorCoatTarget] = useState<InventoryItem | null>(null);
  // OTA-922 — a FULL armor piece (all resist slots used) stages a which-resist-to-replace
  // picker here instead of silently refusing.
  const [armorResistReplace, setArmorResistReplace] = useState<
    { coatId: string; coatName: string; armorId: string; armorName: string; coatType: string; resists: string[] } | null
  >(null);

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
    // arb110 — bandolier fill mode narrows the list to throwables.
    : bandolierFilterActive
      ? queryFiltered.filter((i) => isBandolierEligible(i, player).eligible)
      : queryFiltered;
  // arb-fix — the FUSABLE tab is a filter, not just a sort: narrow to items
  // that qualify for the Crucible (reserved or not).
  const fusionFiltered = sortKey === 'fusionable'
    ? filtered.filter(isFusionEligible)
    : filtered;
  // OTA-1097 — the FUSABLE view is a SELECTION surface, not a browsing one: every
  // row in it is Crucible stock, and the only question is in or out. In this mode
  // a tap toggles the reserve directly (owner: "if you tap on an item that has
  // been selected it automatically deselects") and category headers carry a
  // SELECT ALL. The pouch / bandolier fill modes already own the tap, so they win
  // — two "armed" tap modes at once would be a coin flip.
  const fusionSelectMode = sortKey === 'fusionable' && !pouchFilterActive && !bandolierFilterActive;
  // Which rows in a category the bulk button may act on, and whether they are
  // already all reserved (which flips the button to CLEAR). Quest-locked rows are
  // excluded here for the same reason the store skips them — the button must never
  // claim a count it cannot deliver.
  const categorySelection = (rows: InventoryItem[]) => {
    const actionable = rows.filter((i) => !isQuestLockedItem(i) && (i.reservedForFusion || isFusionEligible(i)));
    return {
      ids: actionable.map((i) => i.id),
      eligible: actionable.length,
      allSelected: actionable.length > 0 && actionable.every((i) => i.reservedForFusion === true),
    };
  };
  // OTA-1094 — one worn-instance set for the whole screen: the sort pre-key AND
  // the coating pickers below read it, so what floats to the top and what carries
  // the EQUIPPED tag can never disagree.
  const wornIds = wornInstanceIds(player);
  // OTA-1100 — THE INVENTORY LEARNS THE SAME GRIP. Owner, after OTA-1099's group
  // sell: "yes wire drop, fusable select and scrap the same way." Same contract
  // as the vendor list, which is the whole point — one gesture, one meaning,
  // wherever you are: HOLD a row to start a group, TAP to add or remove, act on
  // the lot. A player who never holds a row sees no change at all.
  //
  // Selection is by INSTANCE ID and, like the group sell, RE-DERIVED from the
  // live inventory every render — a picked row that is sold, dropped, used or
  // scrapped falls OUT of the group instead of lingering as a dead id the count
  // still claims.
  const selectedItems = invSelected
    .map((id) => (player.inventory ?? []).find((i) => i.id === id && i.quantity > 0))
    .filter((i): i is InventoryItem => !!i);
  // Per-action eligibility, mirroring exactly what each single-item path allows.
  // A group action must never claim a count it cannot deliver, and must never
  // sweep up something the one-at-a-time route would have refused.
  const droppable = selectedItems.filter((i) => !isQuestLockedItem(i) && !wornIds.has(i.id));
  // Scrap AUTO-UNEQUIPS (OTA-058), so worn gear is allowed here — but that is
  // exactly why the confirm names it.
  const scrappable = selectedItems.filter((i) => !isQuestLockedItem(i) && canScrap(i));
  const reservable = selectedItems.filter((i) => !isQuestLockedItem(i) && !i.reservedForFusion && isFusionEligible(i));
  const releasable = selectedItems.filter((i) => i.reservedForFusion === true);

  const exitInvSelect = () => { setInvSelectMode(false); setInvSelected([]); setInvGroupAction(null); };
  const toggleInvSelect = (id: string) => {
    setInvSelected((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      // Emptying the group leaves the mode, so you are never parked on a bar
      // that reads "0" with nothing to act on.
      if (next.length === 0) setInvSelectMode(false);
      return next;
    });
  };
  const beginInvSelect = (id: string) => { setInvSelectMode(true); setInvSelected([id]); };
  const runGroupAction = () => {
    if (invGroupAction === 'drop') {
      // Snapshot first — each drop mutates the inventory the rows came from.
      // Instance-exact: OTA-1100 threads the id through, so two rows of the same
      // name drop the ones you ticked rather than whichever sorts first.
      for (const it of droppable.map((i) => ({ name: i.name, id: i.id, qty: i.quantity ?? 1 }))) {
        for (let n = 0; n < it.qty; n++) dropInventoryItem(it.name, it.id);
      }
    } else if (invGroupAction === 'scrap') {
      for (const it of scrappable.map((i) => ({ name: i.name, id: i.id }))) {
        scrapInventoryItem(it.name, it.id);
      }
    } else if (invGroupAction === 'reserve') {
      reserveManyForFusion(reservable.map((i) => i.id), true);
    } else if (invGroupAction === 'release') {
      reserveManyForFusion(releasable.map((i) => i.id), false);
    } else if (invGroupAction === 'equip') {
      // OTA-1114 — snapshot the plan before the first equip, because each one
      // rewrites player.equipped and every derived list this render read from.
      // The plan already resolved slot contention, so this is a straight walk:
      // no piece here can displace another piece here.
      for (const step of equipPlan.equip.map((e) => ({ name: e.item.name, id: e.item.id, slot: e.slot }))) {
        equipItem(step.name, step.slot, step.id);
      }
    } else if (invGroupAction === 'unequip') {
      // Clear every slot the selection occupies. Slots, not items: a two-handed
      // weapon holds main AND off, and clearing only the first would leave a
      // half-wielded weapon behind.
      for (const slot of [...new Set(unequippable.flatMap((r) => r.slots))]) {
        unequipSlot(slot);
      }
    }
    exitInvSelect();
  };
  const sorted = sortInventoryItems(fusionFiltered, sortKey, sortDirection, wornIds);
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
  // OTA-685 - the dog's vest is worn on the DOG (tracked by name on
  // dog.equipped.vest, NOT in the player's equip slots), so it never lit the
  // EQUIPPED badge and you couldn't tell which vest was on him. Mark ONE matching
  // inventory instance equipped so the Dog Armor row reads "EQUIPPED (on <dog>)".
  // OTA-961 — items an ACCEPTED fetch contract still wants, by exact name.
  // Drives the context-aware "Save for quest" earmark in the item modal.
  const activeFetchWanted = activeFetchItemNames(player.activeFactionQuests);
  const dogForVest = player.dog;
  // OTA-956 — one shared resolver (wornDogVestInstanceId): id-first, then a
  // name match that also accepts uniqueStats.kind === 'dog_armor' (fused
  // vests whose stored kind drifted). Owner: "dog vests don't show which one
  // is equipped in the inventory."
  const wornVestId = wornDogVestInstanceId(player);
  if (wornVestId) equippedItemIds.add(wornVestId);

  // arb-fix — which SLOT(s) an equipped instance occupies, so the row can show
  // "EQUIPPED (main hand)" / "(off hand)" / "(both hands)" for weapons instead
  // of a bare EQUIPPED (player: weapons don't say which hand). Built from the
  // per-slot instance ids (exact), with a legacy name fallback for old saves.
  const equippedSlotsById = new Map<string, EquipSlot[]>();
  const idSlotPairs: Array<[string | undefined, EquipSlot]> = [
    [eq.mainId, 'main'], [eq.offId, 'off'], [eq.headId, 'head'],
    [eq.chestId, 'chest'], [eq.handsId, 'hands'], [eq.legsId, 'legs'],
    [eq.feetId, 'feet'], [eq.cloakId, 'cloak'], [eq.amuletId, 'amulet'],
    [eq.ringId, 'ring'], [eq.ring2Id, 'ring'], [eq.ring3Id, 'ring'],
  ];
  for (const [id, slot] of idSlotPairs) {
    if (!id) continue;
    const list = equippedSlotsById.get(id) ?? [];
    list.push(slot);
    equippedSlotsById.set(id, list);
  }
  // ⚠⚠⚠ OTA-1550 — THE NAME FALLBACK MUST NOT OUTRANK AN ID THAT ALREADY
  // ANSWERED. Owner, on the APPLY ACID FLASK picker: *"why is cudgel listed
  // twice if I can only hold one in my hand at a time"* — and both rows read
  // EQUIPPED (MAIN HAND).
  //
  // He was holding an Acid-Etched Cudgel and carrying a plain Cudgel. A
  // coating changes the DISPLAY name (coatedDisplayName), not the stored
  // `item.name`, and `equipped.main` stores a NAME — so both instances answer
  // to "Cudgel". equippedSlotLabelFor resolved the held one exactly by
  // `mainId`, then, for the pack one, missed on id and fell through to the
  // by-name map — which still said main hand. One slot, claimed twice.
  //
  // The fallback exists for pre-id saves and has to stay, so it is narrowed
  // rather than removed: a slot whose instance id is SET has already been
  // resolved exactly and must never be re-matched by name. Same discipline
  // the EQUIPPED badge's own `hasIdForThisName` guard uses two blocks up —
  // this reader was simply the one that never got it.
  const legacySlotsByName = new Map<string, EquipSlot[]>();
  const nameIdSlotTriples: Array<[EquipSlot, string | undefined, string | undefined]> = [
    ['main', player.equipped?.main, eq.mainId],
    ['off', player.equipped?.off, eq.offId],
    ['head', player.equipped?.head, eq.headId],
    ['chest', player.equipped?.chest, eq.chestId],
    ['hands', player.equipped?.hands, eq.handsId],
    ['legs', player.equipped?.legs, eq.legsId],
    ['feet', player.equipped?.feet, eq.feetId],
    ['cloak', player.equipped?.cloak, eq.cloakId],
    ['amulet', player.equipped?.amulet, eq.amuletId],
    ['ring', player.equipped?.ring, eq.ringId],
    ['ring', player.equipped?.ring2, eq.ring2Id],
    ['ring', player.equipped?.ring3, eq.ring3Id],
  ];
  for (const [slot, name, id] of nameIdSlotTriples) {
    if (!name || id) continue; // an id-bearing slot is settled — never by name
    const list = legacySlotsByName.get(name) ?? [];
    list.push(slot);
    legacySlotsByName.set(name, list);
  }
  const equippedSlotLabelFor = (item: InventoryItem): string => {
    // OTA-685 — a dog vest reads "(on <dogname>)", since it's worn on the dog,
    // not in a player slot. OTA — matched by INSTANCE ID via the shared
    // resolver (name comparison broke when a still-cooling fused vest was
    // renamed by the settle).
    if (wornVestId && item.id === wornVestId) {
      return dogForVest?.name ? `on ${dogForVest.name}` : 'on your dog';
    }
    let slots = equippedSlotsById.get(item.id);
    // ⚠ OTA-1550 — the LEGACY-ONLY map (slots with no instance id). Using the
    // full by-name map here tagged a pack duplicate as equipped whenever the
    // held instance shared its stored name — the owner's two Cudgels, both
    // reading EQUIPPED (MAIN HAND).
    if (!slots || slots.length === 0) slots = legacySlotsByName.get(item.name) ?? [];
    if (slots.length === 0) return '';
    // Two-handed weapons take both hands by design — keep the existing wording.
    if (findWeaponByName(item.name)?.style === 'two_handed') return 'two-handed';
    const hasMain = slots.includes('main');
    const hasOff = slots.includes('off');
    if (hasMain && hasOff) return 'both hands';
    if (hasMain) return 'main hand';
    if (hasOff) return 'off hand';
    // Armor / accessory: the human slot label(s), deduped (e.g. a ring → "ring").
    const labels = [...new Set(slots.map((s) => SLOT_LABEL[s] ?? s))];
    return labels.join(' + ');
  };
  // OTA-1008 — the coating pickers (weapon vials AND armor vials) tag each candidate
  // that is CURRENTLY EQUIPPED, via the same resolver as the EQUIPPED badge —
  // one source of truth, no divergent copy. Owner: "when you are applying
  // coatings to weapons or armor, it should show you which one you have
  // equipped at that time."
  const withEquippedTag = (label: string, item: InventoryItem): string => {
    const where = equippedSlotLabelFor(item);
    return where ? `${label} · EQUIPPED (${where})` : label;
  };
  // OTA-1114 — the two GEAR group actions. Owner: "you should be able to pick
  // your armor hold and select a group and either equip all or unequip all
  // depending on what you selected."
  //
  // ⚠ WHY THIS IS THE FIX AND NOT A NICETY. The group bar shipped in OTA-1100
  // with four actions — drop, scrap, reserve, release — and DROP excludes worn
  // gear while RESERVE needs fusion eligibility. So for a group of ARMOR YOU ARE
  // WEARING, the only button that ever appeared was SCRAP, which is exactly what
  // the owner hit ("I did the hold to select multiple and there was only
  // scrap"). Scrap auto-unequips and then destroys the piece. A one-tap
  // irreversible action as the SOLE option on a set of worn armor is not a
  // missing feature, it is a trap — and the log from the same session shows the
  // character's AC drop 16 → 10 mid-fight and die to the next four raider
  // swings. Whatever produced that particular unequip, a screen where the only
  // thing you can do to your armor is destroy it should not have shipped.
  //
  // These are derived AFTER equippedSlotsById so UNEQUIP knows the real slot of
  // each worn instance (ring2/ring3 included) rather than guessing from name.
  const equipPlan = planGroupEquip(selectedItems, wornIds);
  // Worn selections, paired with every slot that instance occupies — a
  // two-hander is one item holding main AND off, so it must clear both.
  const unequippable = selectedItems
    .filter((i) => wornIds.has(i.id))
    .map((i) => ({ item: i, slots: equippedSlotsById.get(i.id) ?? [] }))
    .filter((r) => r.slots.length > 0);
  // arb-fix — the slot an item FILLS, shown on every equippable row (esp. armor:
  // "Chest", "Head", "Feet"…) whether worn or not, so the player can see where a
  // piece goes at a glance. Weapons collapse to "Hand" / "Two-handed".
  const slotFillLabelFor = (item: InventoryItem): string => {
    const slots = validSlotsForItem(item);
    if (slots.length === 0) return '';
    if (findWeaponByName(item.name)?.style === 'two_handed') return 'Two-handed';
    if (slots.every((s) => s === 'main' || s === 'off')) return 'Hand';
    const labels = [...new Set(slots.map((s) => SLOT_LABEL[s] ?? s))];
    return labels.join(' / ');
  };


  // OTHER inventory item that competes for that slot gets a red ✗ (you'd
  // have to unequip first). Rings have three physical slots, so a ring only
  // counts as blocked when all three are worn.
  const slotIsFull = (slot: EquipSlot): boolean => {
    if (slot === 'ring') return !!(eq.ring && eq.ring2 && eq.ring3);
    const worn = (eq as Record<string, unknown>)[slot];
    return typeof worn === 'string' && worn.length > 0;
  };
  const POUCH_MAX = 3; // mirrors stowInPouch in gameStore
  const itemSlotTaken = (item: InventoryItem): boolean => {
    if (equippedItemIds.has(item.id)) return false;
    const slots = validSlotsForItem(item);
    if (slots.length === 0 || !slots.every(slotIsFull)) return false;
    // A pouch-eligible tool is NOT blocked just because its equip slot is full —
    // it can still go on the tool belt. Scanners are the case that bit players:
    // all three (Pulse / Aetheric / Mud) share the single off-hand equip slot, so
    // equipping one used to red-✗ the other two — making it look like you can only
    // carry one. But the 4-slot pouch holds all three AND each fires from there
    // (playerHasScannerEquipped checks the pouch). So while the belt has room and
    // the item is pouch-eligible, don't mark it "taken".
    const pouchIds = eq.toolPouchIds ?? [];
    if (pouchIds.length < POUCH_MAX && isPouchEligible(item, player).eligible) return false;
    return true;
  };

  // ALWAYS show the modal. Auto-equipping silently when there was only one
  // valid slot (e.g. amulet) made the player think the tap did nothing —
  // and left no path to unequip. Modal always opens; player picks Equip
  // (specific slot) or Unequip (if currently worn) or Close.
  const handleItemTap = (item: InventoryItem) => {
    // OTA-1100 — once a group is open, a tap adds or removes. Checked FIRST so
    // it beats every other tap meaning on this screen, including the FUSABLE
    // reserve-toggle below: while you are building a group, that is what taps do.
    if (invSelectMode) { toggleInvSelect(item.id); return; }
    // OTA-269 — pouch-filter tap path. The player tapped an empty
    // pouch slot above, narrowing the inventory below to eligible
    // tools. Tapping one of those tools stows it directly and
    // clears the filter — no equip modal, no double-tap. If the
    // engine refuses (e.g., pouch already full), it logs to the
    // Arbiter; we close the filter either way so the player can
    // see the world feed without re-tapping the slot.
    if (pouchFilterActive) {
      stowInPouch(item.name, item.id);
      setPouchFilterActive(false);
      return;
    }
    // arb110 — same direct-stow path for the bandolier fill mode.
    if (bandolierFilterActive) {
      stowInBandolier(item.name);
      setBandolierFilterActive(false);
      return;
    }
    // OTA-1097 — FUSABLE view: a tap IS the selection. Owner: "if you tap on an
    // item that has been selected it automatically deselects." Deselect-on-tap
    // without select-on-tap would be maddening, so the tap is a straight toggle
    // in both directions — and it moves the WHOLE stack, matching the bulk intent
    // of a view whose headers say "ALL". The per-unit "Save 1 / Free 1" controls
    // are still one long-press away, and any other sort axis opens the modal as
    // before. A quest-locked row keeps its modal: it can never be fused, so
    // swallowing the tap would just look broken.
    if (fusionSelectMode && !isQuestLockedItem(item)) {
      toggleReserveForFusion(item.id, item.quantity ?? 1);
      return;
    }
    setScrapResult(null); // fresh modal — clear any prior result
    setPending({ item, slots: validSlotsForItem(item) });
  };

  // OTA-1100 — HOLD starts a group, everywhere in the inventory. This replaces
  // OTA-1097's FUSABLE-only "long-press opens the item sheet" escape hatch: one
  // gesture has to mean one thing on this screen, and the group is worth more
  // than that hatch was. The single-unit "Save 1 for fusion" it used to reach is
  // still there — switch off the FUSABLE axis and tap the item, which is what
  // the FUSABLE banner now says.
  const handleItemLongPress = (item: InventoryItem) => {
    // The pouch / bandolier fill modes own the tap while they're armed; letting
    // a hold start a group underneath them would leave two live modes fighting.
    if (pouchFilterActive || bandolierFilterActive) return;
    if (invSelectMode) { toggleInvSelect(item.id); return; }
    beginInvSelect(item.id);
  };

  const closeModal = () => {
    setPending(null);
    setScrapResult(null);
  };
  // arb-fix — auto-dismiss the post-salvage result. The "what you received"
  // panel only needs a beat to read, not a deliberate Close tap (player: "no
  // one is going to study the text"). When scrapResult is populated, close the
  // modal on a short timer; the Close button stays as an early-out.
  useEffect(() => {
    if (scrapResult === null) return;
    const t = setTimeout(() => {
      setPending(null);
      setScrapResult(null);
    }, 2800);
    return () => clearTimeout(t);
  }, [scrapResult]);
  const chooseSlot = (slot: EquipSlot) => {
    if (!pending) return;
    equipItem(pending.item.name, slot, pending.item.id);
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
      scrapInventoryItem(pending.item.name, pending.item.id);
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
    // OTA-493 — locked objective items (quest / contract / whisper) are view-only:
    // no drop, scrap, sell, gift, or fusion-reserve. They exist solely to be turned
    // in for their purpose, so the modal offers nothing but Close.
    if (isQuestLockedItem(pending.item)) {
      return [{ label: 'Close', onPress: closeModal, tone: 'neutral' }];
    }
    // ⚠ OTA-1154 — IN GIFT MODE, GIVE COMES FIRST AND CROWDS NOTHING OUT.
    // The player entered the pack for exactly one reason, so the action they came
    // for leads. It is drawn only when giftBlockReason says the item may go —
    // the same call the store makes before moving anything — so a blocked item
    // simply has no GIVE rather than offering one that gets refused on tap.
    // (Quest-locked items never reach here: the branch above already ends them.)
    if (giftMode && player && giftBlockReason(pending.item, player) === null) {
      return [
        {
          label: `Give to ${giftMode.toName}`,
          onPress: () => { const id = pending.item.id; closeModal(); giveGift(id); },
          tone: 'primary' as const,
        },
        { label: 'Close', onPress: closeModal, tone: 'neutral' as const },
      ];
    }
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
    // OTA-607 — a THROWABLE's off-hand "Use" is a real, distinct affordance
    // (ready it to hurl); a plain weapon's off-hand is just an equip, already
    // covered by the dedicated "Equip (Off hand)" button above. So only let
    // off-hand eligibility light up the USE button for throwables — otherwise a
    // regular weapon wrongly showed both "Use (off hand)" AND "Equip (Off hand)"
    // (player: "you don't use the weapon, you equip it").
    const isThrowableItem = itemIsThrowable(pending.item);
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
    // OTA-746 — a coat-only coating (acid: no player ailment to counter) shows no
    // Use/Drink button; the "Coat a weapon" / "Coat armor" buttons below still appear.
    // OTA-968 — the Skyreacher Maps get a dedicated, always-on Use button. The
    // owner bought one on-device and "there's no use button" — the generic gate
    // above resolves the item's effect through three catalog lookups inside the
    // render path, so any resolution hiccup silently eats the button. The maps
    // are too important for that: match on the name and wire Use directly.
    // (Legacy 'Skyreacher Chart' names are renamed on load, but match them too.)
    const isSkyMap = /^Skyreacher (Map|Chart)\b/.test(pending.item.name);
    // OTA-1205 — a Procedure Text's real action is READING it, and the generic gate
    // can't see that (texts carry no authored `effect`, deliberately — they are not
    // consumables). Same dedicated-button pattern as the Skyreacher Maps above, for
    // the same reason: the found-in-the-world door hands a player this item with no
    // vendor line telling them what to do with it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const isProcedureText = (require('../engine/aetherTechniques') as typeof import('../engine/aetherTechniques')).isProcedureTextName(pending.item.name);
    const useIsRealAction = (isConsumable || hasEffect || (offEligible && isThrowableItem)) && coatingItemDrinkable(pending.item);
    if (isProcedureText) {
      buttons.push({ label: 'Read — learn the technique', onPress: doUse, tone: 'primary' });
    }
    if (isSkyMap) {
      buttons.push({ label: 'Use — add the location to your MAP', onPress: doUse, tone: 'primary' });
    }
    if (useIsRealAction && !isSkyMap && !isProcedureText) {
      // arb106 — show YOUR current HP on the eat/drink button so you can see at a
      // glance whether you actually need it (player ask).
      const hpTag = isConsumable && player ? `  ${player.hp}/${player.hpMax}` : '';
      buttons.push({
        label: isConsumable ? `Use (${consumeVerb(pending.item)})${hpTag}` : (offEligible ? 'Use (off hand)' : 'Use'),
        onPress: doUse,
        tone: 'primary',
      });
    }
    // OTA-693 — per-unit fixed HP heal, for the "Use Max" batch buttons below.
    const perItemHP = isConsumable ? (() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolveItemEffect } = require('../engine/itemEffect');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { findGearByName, findExplorationItemByName, findMaterialByName } = require('../engine/crafting');
      const fx = resolveItemEffect(pending.item.name, [findGearByName, findExplorationItemByName, findMaterialByName]);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { scaledHealHP: shp } = require('../engine/itemEffect') as typeof import('../engine/itemEffect');
      return fx?.kind === 'consumable' ? shp(fx.healHP ?? 0, player?.hpMax ?? 0) : 0; // OTA-978 — #120
    })() : 0;
    const stackQty = pending.item.quantity;
    // Self batch-heal. Two offers:
    //   • "Heal to full" (OTA — player ask: "the first aid kit doesn't have a heal
    //     max option"). Uses ceil(gap / perItem) kits — the fewest that reach max HP,
    //     accepting a little overheal-waste on the LAST kit. A single "Use" already
    //     tops you off when the gap is smaller than one kit, so this only surfaces
    //     when it takes 2+ kits to reach full (i.e. a real one-tap saver), and only
    //     when the pack actually holds enough to get there.
    //   • "Use Max (no waste)" — the most that fit UNDER max with zero waste
    //     (floor). Kept as a secondary, de-emphasised option, and only shown when
    //     it's a genuinely different, smaller count than the top-off (the gap isn't
    //     an exact multiple of the per-kit heal).
    if (isConsumable && perItemHP > 0 && player && player.hp < player.hpMax) {
      const hpGap = player.hpMax - player.hp;
      const toFull = Math.min(stackQty, Math.ceil(hpGap / perItemHP));
      const noWaste = healBatchCount(perItemHP, hpGap, stackQty);
      const reachesFull = perItemHP * toFull >= hpGap;
      if (toFull >= 2 && reachesFull) {
        buttons.push({
          label: `Heal to full ×${toFull} → ${player.hpMax}/${player.hpMax}`,
          onPress: () => { useHealBatch(pending.item.name, 'self', toFull); closeModal(); },
          tone: 'primary',
        });
        if (noWaste >= 2 && noWaste < toFull) {
          const to = player.hp + perItemHP * noWaste;
          buttons.push({
            label: `Use Max ×${noWaste} → ${to}/${player.hpMax} (no waste)`,
            onPress: () => { useHealBatch(pending.item.name, 'self', noWaste); closeModal(); },
            tone: 'neutral',
          });
        }
      } else if (noWaste >= 2) {
        // Can't reach full (not enough kits, or one kit already tops you off) —
        // fall back to the original no-waste bulk-use offer.
        const to = Math.min(player.hpMax, player.hp + perItemHP * noWaste);
        buttons.push({
          label: `Use Max ×${noWaste} → ${to}/${player.hpMax} (no waste)`,
          onPress: () => { useHealBatch(pending.item.name, 'self', noWaste); closeModal(); },
          tone: 'primary',
        });
      }
    }
    // OTA-120 Phase 5 — dog-targeted actions. Equip vests on the dog
    // (kind 'dog_armor'); feed consumables to the dog (any consumable
    // — the treat-vs-regular delta is calculated in the engine). Only
    // surface when an active dog exists.
    const dogActive = !!player?.dog
      && player.dog.status !== 'abandoned'
      && player.dog.status !== 'dead';
    const pendingIsDogArmor = pending.item.kind === 'dog_armor'
      || pending.item.uniqueStats?.kind === 'dog_armor';
    // OTA-956 — the details modal now SAYS when this exact vest is the one the
    // dog is wearing, and offers to take it off — before this, every vest
    // read the same "Equip on dog", so you couldn't tell them apart here.
    if (dogActive && pendingIsDogArmor && wornVestId && pending.item.id === wornVestId) {
      buttons.push({
        label: `Unequip (worn by ${player?.dog?.name ?? 'your dog'})`,
        onPress: () => {
          const pDog = useGameStore.getState().player;
          if (!pDog?.dog) { closeModal(); return; }
          useGameStore.setState((s) => s.player && s.player.dog
            ? {
                player: {
                  ...s.player,
                  dog: { ...s.player.dog, equipped: { vest: null, vestId: null } },
                },
              }
            : s);
          useGameStore.getState().appendLog('world', `You unbuckle the ${pending.item.name} from ${pDog.dog.name}.`);
          closeModal();
        },
        tone: 'neutral',
      });
    } else if (dogActive && pendingIsDogArmor) {
      buttons.push({
        // ⚠ OTA-1423 — THE DOG'S NAME, like every other dog affordance.
        // Owner, twice: at OTA-184 ("let's use the dogs name instead of just
        // dog") and again here. That fix landed on the FEED button and this
        // one, eleven lines away, kept saying 'dog' — as did the Unequip label
        // directly ABOVE it, which has read `worn by ${name}` the whole time.
        // The right answer was sitting in the sibling branch.
        label: `Equip on ${player!.dog!.name}`,
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
                    equipped: { vest: pending.item.name, vestId: pending.item.id },
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
      // arb106 — show the dog's current HP so you know if they still need feeding.
      const dog = player!.dog!;
      buttons.push({
        label: `Feed ${dogName}  ${dog.hp}/${dog.hpMax}`,
        onPress: () => {
          useGameStore.getState().submitPlayerAction(`feed dog ${pending.item.name}`);
          closeModal();
        },
        tone: 'primary',
      });
      if (perItemHP > 0 && dog.hp < dog.hpMax) {
        const n = healBatchCount(perItemHP, dog.hpMax - dog.hp, stackQty);
        if (n >= 2) {
          buttons.push({
            // ⚠ OTA-1423 — the other half of the OTA-184 feed fix. The button
            // above it says "Feed Ember"; this one said "Feed Max".
            label: `Feed ${dogName} Max ×${n} → ${Math.min(dog.hpMax, dog.hp + perItemHP * n)}/${dog.hpMax}`,
            onPress: () => { useHealBatch(pending.item.name, 'dog', n); closeModal(); },
            tone: 'primary',
          });
        }
      }
    }
    // OTA-466 — REPAIR GOLEM. When a golem is active, hurt, and this item is one
    // of the parts it's MADE of, offer a one-tap repair (routes through the same
    // `feed golem <item>` engine path). Mirrors the dog feed affordance.
    {
      const golem = player?.golem;
      const golemActive = !!golem && golem.hp > 0;
      // arb122 — Heal button shows for a full fuel PART or an element-matched
      // SUBSTITUTE material (both route through `feed golem <item>`; the engine
      // applies the right full / rarity-scaled heal).
      const isGolemFeedable = !!golem && (
        isGolemRepairPart(golem.kind, pending.item.name)
        || isGolemSubstitutePart(golem.kind, pending.item)
      );
      if (golemActive && isGolemFeedable) {
        // arb111 — keep the Heal button visible even when the golem is FULL (player
        // ask: "should still show heal golem but show its health full like 31/31")
        // so you can confirm it doesn't need the part. When full it's a neutral,
        // non-consuming info button; only a hurt golem actually feeds.
        const full = golem.hp >= golem.hpMax;
        buttons.push({
          // arb106 — "Heal" (not "Repair"), with the golem's current HP.
          label: `Heal ${golem.name}  ${golem.hp}/${golem.hpMax}${full ? ' (full)' : ''}`,
          onPress: () => {
            if (!full) useGameStore.getState().submitPlayerAction(`feed golem ${pending.item.name}`);
            closeModal();
          },
          tone: full ? 'neutral' : 'primary',
        });
        if (!full) {
          const golemPer = isGolemRepairPart(golem.kind, pending.item.name)
            ? golemRepairHeal(golem.kind)
            : golemSubstituteHeal(golem.kind, canonicalItemRarity(pending.item));
          const n = healBatchCount(golemPer, golem.hpMax - golem.hp, stackQty);
          if (n >= 2) {
            buttons.push({
              label: `Heal Max ×${n} → ${Math.min(golem.hpMax, golem.hp + golemPer * n)}/${golem.hpMax}`,
              onPress: () => { useHealBatch(pending.item.name, 'golem', n); closeModal(); },
              tone: 'primary',
            });
          }
        }
      }
      // OTA-478/481 — ARM GOLEM. If this is a golem armament (Sledge / Greatsword,
      // wieldable by any golem), offer a one-tap arm (routes through `arm golem`).
      if (golemActive) {
        const cat = findWeaponByName(pending.item.name);
        if (cat && isGolemWeapon(cat.tags)) {
          buttons.push({
            label: `Arm ${golem.name}`,
            onPress: () => {
              useGameStore.getState().submitPlayerAction(`arm golem with ${pending.item.name}`);
              closeModal();
            },
            tone: 'primary',
          });
        }
      }
    }
    // OTA-360 — COAT A WEAPON. Weapon-coating consumables (Poison
    // Vial / Acid Flask / Corruption Tonic, tagged `weapon_coating`)
    // aren't drunk: they paint onto a chosen weapon instance. Opening
    // the picker stashes the coating item in coatTarget; the second
    // modal lists the coatable weapons in the pack.
    if (isWeaponCoatingItem(pending.item)) {
      buttons.push({
        label: 'Coat a weapon',
        onPress: () => {
          const coat = pending.item;
          closeModal();
          setCoatTarget(coat);
        },
        tone: 'primary',
      });
      // engine_Dev — APPLY TO ARMOR. The same vial can instead be worked into an
      // armor piece for a permanent damage-type resist (the vial's damage type).
      // Opens a second picker (armorCoatTarget) listing the player's armor.
      const armorCoatType = (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { findGearByName } = require('../engine/crafting') as typeof import('../engine/crafting');
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { resolveItemEffect } = require('../engine/itemEffect');
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { coatingDamageType } = require('../engine/weaponCoating') as typeof import('../engine/weaponCoating');
          const fx = resolveItemEffect(pending.item.name, [findGearByName]);
          const spec = fx?.kind === 'consumable' ? fx.coating : undefined;
          if (spec) return coatingDamageType(String(spec.kind));
        } catch { /* fall through to tag */ }
        return (pending.item.tags ?? []).find((t) => ['poison', 'acid', 'corruption', 'electrical', 'burn'].includes(t));
      })();
      // OTA-873 — only offer "Apply to armor" when the coating's type is one armor can
      // actually resist (an incoming damage type). acid / corruption are offensive-only
      // DOT families — no enemy deals them, so a resist against them is inert; hide the
      // button for those so a vial isn't wasted. Unknown types still show it (the store
      // action guards them).
      const canArmorCoat = (() => {
        if (!armorCoatType) return true;
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { isResistableIncomingType } = require('../engine/damageTypes') as typeof import('../engine/damageTypes');
          return isResistableIncomingType(armorCoatType);
        } catch { return true; }
      })();
      if (canArmorCoat) {
        buttons.push({
          label: armorCoatType ? `Apply to armor (+${armorCoatType} resist)` : 'Apply to armor',
          onPress: () => {
            const coat = pending.item;
            closeModal();
            setArmorCoatTarget(coat);
          },
          tone: 'primary',
        });
      }
    }
    // SCRAP — only for built items with material content. Hidden for
    // raw stock (already material) and for items currently equipped
    // (would leave a phantom slot).
    if (canScrap(pending.item) && equippedInSlots.length === 0) {
      const stack = pending.item.quantity ?? 1;
      buttons.push({
        // ⚠ OTA-1243 — one word for the breakdown verb everywhere: SALVAGE.
        label: stack > 1 ? `Salvage ×${Math.max(1, Math.min(scrapQty, stack))}` : 'Salvage',
        onPress: () => doScrap(),
        tone: 'destructive',
      });
      // Scrap All — one tap to break down the whole stack (skips the stepper).
      if (stack > 1) {
        buttons.push({
          label: `Salvage All (${stack})`,
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
    // arb105 — faction-gear items can ALSO be reserved, as a fusion
    // CATALYST: reserving one themes the next Crucible output into a
    // unique faction item (it doesn't count toward the 3-scrap gate).
    const isFactionCatalyst = canonicalItemTags(pending.item).includes('faction_gear');
    // OTA-737 — show the reserve toggle when the item is forge-reservable (2a: no
    // weapons/armor; 1a: 'loot' reagents included) OR it's already reserved (so a
    // piece stranded by the new rule can still be released) OR it's a faction catalyst.
    const alreadyReserved = pending.item.reservedForFusion === true;
    if (isForgeReservableItem(pending.item) || alreadyReserved || isFactionCatalyst) {
      const reserved = pending.item.reservedForFusion === true;
      const stackQty = pending.item.quantity ?? 1;
      const label = isFactionCatalyst
        ? (reserved ? '♥ Reserved as faction catalyst' : '♡ Save as faction catalyst')
        : reserved
          ? (stackQty > 1 ? '♥ Free 1 from fusion' : '♥ Reserved for fusion')
          : (stackQty > 1 ? '♡ Save 1 for fusion' : '♡ Save for fusion');
      buttons.push({
        label,
        onPress: () => {
          toggleReserveForFusion(pending.item.id);
          closeModal();
        },
        tone: 'neutral',
      });
      // OTA-945 — whole-stack reserve in ONE tap. Owner: reserving a x5 stack meant
      // reopening this modal five times, one peel per tap. "Save all xN" (and its
      // "Free all" mirror) moves the entire stack across the boundary at once;
      // the single-unit button stays for partial counts. Catalysts stay 1-at-a-time
      // (one catalyst themes one fuse).
      if (stackQty > 1 && !isFactionCatalyst) {
        buttons.push({
          label: reserved ? `♥ Free all ×${stackQty}` : `♡ Save all ×${stackQty} for fusion`,
          onPress: () => {
            toggleReserveForFusion(pending.item.id, stackQty);
            closeModal();
          },
          tone: 'neutral',
        });
      }
    }
    // OTA-872 — SAVE FOR QUEST. A soft earmark for an ordinary item (food,
    // materials, loot) the player was told to bring for a turn-in. Sets
    // reservedForQuest: the item moves to the Quest Items section and drops out of
    // the vendor sell tab, but stays usable/droppable (unlike a hard tag-locked
    // quest item, which returns a view-only modal above and never reaches here).
    // Hidden while the item is reserved for fusion — the two earmarks are mutually
    // exclusive (an item can't be both Crucible fodder and a quest hand-in). The
    // player releases the fusion reserve first, then can save it for a quest.
    if (!pending.item.reservedForFusion) {
      const savedForQuest = pending.item.reservedForQuest === true;
      // OTA-961 — CONTEXT-AWARE earmark (owner: "I would only like it to say save
      // for quest when you actually have an active quest that needs them").
      // The button now shows only when an accepted fetch contract names this
      // exact item — the "gather N, bring them back" case the earmark was
      // invented for. Specific objective items hard-lock automatically and
      // never need it. An already-flagged item ALWAYS shows the release
      // button, so a stale earmark can be cleared after the quest resolves.
      const questWantsIt = activeFetchWanted.has(pending.item.name.toLowerCase());
      if (savedForQuest || questWantsIt) {
        buttons.push({
          label: savedForQuest ? '⚑ Saved for quest' : '⚐ Save for quest',
          onPress: () => {
            toggleReserveForQuest(pending.item.id);
            closeModal();
          },
          tone: 'neutral',
        });
      }
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
  // ⚠⚠⚠ OTA-1463 — WHILE GIVING, THE SHEET TALKS ABOUT GIVING. Owner, mid-session:
  //
  //   "I just tried to gift scrap metal to brisk cartwright and it told me that
  //    I cannot equip it... I'm not trying to equip it... it even says at the
  //    top of the screen that I'm gifting so that's a glitch"
  //
  // He was right that it reads as a refusal, and wrong only about what was
  // refused — nothing was. The `Give to <name>` action WAS on the sheet (the
  // gift-mode branch below adds it whenever `giftBlockReason` is null, and for
  // Scrap Metal it is null). What he read was this body text, which answers a
  // question nobody asked while he was in the middle of a different one.
  //
  // ⚠⚠ THAT IS THE NAMED DEFECT, INVERTED. "The game offers a thing and does not
  // look like it's offering" has cost this project several OTAs; here the game
  // offered correctly and then TALKED him out of it. A modal that is going to
  // volunteer prose must volunteer prose about the mode the player is in — the
  // gift bar is on screen saying GIVING TO BERSK CARTWRIGHT, and the sheet
  // underneath it was lecturing about equip slots.
  //
  // ⚠ AND THE BLOCKED CASE IS THE MORE VALUABLE HALF. `giftBlockReason` already
  // computes a plain-English reason for every item that CANNOT be given — worn,
  // racked, reserved, wanted by a fetch contract. None of it ever reached the
  // screen: a blocked item simply had no GIVE button and said nothing about why,
  // which is the-game-knows-and-does-not-say (OTA-1402) on a second door.
  const giftBlock = giftMode && pending && player ? giftBlockReason(pending.item, player) : null;
  const modalBody = pending && isQuestLockedItem(pending.item)
    ? 'Reserved for your objective — this stays in your pack until you turn it in. It can\'t be dropped, salvaged, sold, or fused.'
    // OTA-872 — a soft "Save for quest" earmark: explain that it's out of the sell
    // tab and filed under Quest Items, but still yours to use or drop.
    : pending && pending.item.reservedForQuest
      ? 'Saved for a quest — filed under Quest Items and hidden from vendor sell lists so you don\'t sell it by accident. You can still use or drop it, or tap "Saved for quest" to release it.'
      // ⚠ Gift mode outranks the equip note, because it is what the player is
      // doing right now. Blocked first — a reason beats a silence.
      : giftMode && giftBlock !== null
        ? `You can't give this to ${giftMode.toName} — ${giftBlock}.`
        : giftMode && pending
          ? `Tap "Give to ${giftMode.toName}" below to hand this over.`
          : pending && pending.slots.length === 0 && (slotsByEquippedName.get(pending.item.name)?.length ?? 0) === 0
            ? 'This item cannot be equipped, but you can still keep, sell, or use it.'
            : undefined;
  // OTA-945 — fusion info block: for a fusable/reservable item, name the material it
  // contributes and how diversity drives output rarity (a common playtest question:
  // "does what I put in change the quality?" — yes: DIFFERENT materials, not rarity).
  const fusionHint = pending && (isForgeReservableItem(pending.item) || canonicalItemTags(pending.item).includes('faction_gear'))
    ? (() => {
        if (canonicalItemTags(pending.item).includes('faction_gear')) {
          return 'Fusion: a faction catalyst — themes the Crucible\'s output (a separate slot; doesn\'t count toward the 3–5 materials).';
        }
        const mats = fusionMaterialTags(pending.item);
        const matStr = mats.length ? mats.join(', ') : 'no distinct material';
        return `Fusion material: ${matStr}. At a Crucible, combine 3–5 reserved pieces — 3 DIFFERENT materials \u2192 Rare, 4+ \u2192 Legendary (variety matters, not rarity).`;
      })()
    : null;
  const healBatchHint = pending && pending.item.quantity >= 2
    ? (() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { resolveItemEffect } = require('../engine/itemEffect');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { findGearByName, findExplorationItemByName, findMaterialByName } = require('../engine/crafting');
        const fx = resolveItemEffect(pending.item.name, [findGearByName, findExplorationItemByName, findMaterialByName]);
        const perHP = fx?.kind === 'consumable' ? (fx.healHP ?? 0) : 0;
        return perHP > 0 ? HEAL_BATCH_NOTE : null;
      })()
    : null;
  const modalBodyFull = [modalBody, fusionHint, healBatchHint].filter(Boolean).join('\n\n') || undefined;

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

  // OTA-360 — weapon-coating picker. When coatTarget is set, list the
  // coatable weapon instances in the pack as pick buttons. Each shows
  // its current coating (if any) so the player knows a re-coat will
  // replace it. Wrapped in try/catch since isCoatableWeapon resolves
  // through the weapon catalog.
  let coatPickerBody: string | undefined;
  let coatPickerButtons: Array<{ label: string; onPress: () => void; tone: 'primary' | 'neutral' | 'destructive' }> = [];
  if (coatTarget) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isCoatableItem, coatedDisplayName, nextCoatSlot, coatingRefusalFor } = require('../engine/weaponCoating');
      const coatable = (player.inventory ?? []).filter(
        // OTA-453 — instance-aware so FUSED weapons (catalog-absent) are listed.
        (i: InventoryItem) => isCoatableItem(i),
      // OTA-1094 — the weapon you are HOLDING is the one you almost always mean
      // to coat, so it heads the list instead of sitting wherever pack order put it.
      ).sort(byWornFirst(wornIds));
      // ⚠⚠ OTA-1407 — NAME WHAT WAS LEFT OUT, AND WHY. The picker used to filter
      // the pack down to coatable weapons and show only those, so a weapon that
      // cannot take a coating simply was not there. The owner hit exactly that
      // with a Force Wave in his off hand and reported "I can't apply coatings to
      // my off hand weapon" — a rule about RUNE-CASTERS, read as a rule about
      // HANDS, because the only thing the game told him was an absence.
      // ⚠ Same discipline as the tutorial picker's lock (OTA-1250): SHOW
      // EVERYTHING, ALLOW ONE. Here the excluded weapons live in the body rather
      // than as dead buttons — a row that refuses on tap would be the OTA-1405
      // failure again, one layer down.
      const refused = (player.inventory ?? [])
        .filter((i: InventoryItem) => i.kind === 'weapon' && !isCoatableItem(i))
        .map((i: InventoryItem) => `• ${i.name}${wornIds.has(i.id) ? ' (equipped)' : ''} — ${coatingRefusalFor(i)}`);
      const refusedNote = refused.length
        ? `\n\nNot on the list:\n${refused.join('\n')}`
        : '';
      if (coatable.length === 0) {
        coatPickerBody = 'Nothing in your pack can hold this coating. A coating needs an edge or a point to carry it — a blade, an arrow-arm, or a bolt-caster.'
          + refusedNote;
      } else {
        coatPickerBody = `Paint the ${coatTarget.name.toLowerCase()} onto which weapon? It stays on until the weapon breaks (a repair won't scrub it off).`
          + refusedNote;
        // ⚠⚠⚠ OTA-1556 — TWO ROWS CARRYING THE SAME WORD ARE NOT A LIST, THEY ARE
        // A COIN TOSS.
        //
        // Owner, from the device: *"double weapons show for the same hand."* They
        // are not one weapon listed twice — he owns two Cudgels, and listing
        // INSTANCES is right, because a coating lands on one specific weapon and
        // this picker is where he chooses which. But the two rows read
        // `CUDGEL · EQUIPPED (MAIN HAND)` and `CUDGEL`, so the only thing telling
        // them apart was a tag on one of them; for two rows where NEITHER is
        // equipped there was nothing at all. He read it as a duplicate because a
        // list that cannot tell its own rows apart behaves like one.
        //
        // ⚠⚠ DISAMBIGUATE BY WEAR, WHICH IS THE THING THAT ACTUALLY DIFFERS. Two
        // copies of a durable weapon are rarely at the same condition, and
        // condition is precisely what you want to know before spending a finite
        // coating on one of them — you paint the good one. Only COLLIDING rows
        // take the suffix, so a pack holding one Cudgel looks exactly as it did.
        //
        // ⚠ A last-resort ordinal covers what wear cannot separate (two pristine
        // copies, or a weapon with no durability at all). It claims nothing beyond
        // "these are different objects", which is the one thing the player must
        // not be left guessing about.
        const coatLabelCounts = new Map<string, number>();
        for (const w of coatable as InventoryItem[]) {
          const base = coatedDisplayName(w) as string;
          coatLabelCounts.set(base, (coatLabelCounts.get(base) ?? 0) + 1);
        }
        const coatOrdinalSoFar = new Map<string, number>();
        const disambiguateCoatRow = (label: string, w: InventoryItem): string => {
          const base = coatedDisplayName(w) as string;
          if ((coatLabelCounts.get(base) ?? 0) < 2) return label;
          const seen = (coatOrdinalSoFar.get(base) ?? 0) + 1;
          coatOrdinalSoFar.set(base, seen);
          const dur = w.durability;
          if (dur && dur.max > 0) return `${label} · ${dur.current}/${dur.max}`;
          return `${label} · #${seen}`;
        };
        coatPickerButtons = coatable.map((w: InventoryItem) => {
          // OTA-873 — dual-slot aware label: an upgraded weapon with an open 2nd slot
          // ADDS a coating; a full weapon REPLACES slot 1; a bare one just coats.
          const slot: 'coating' | 'coating2' | 'replace' = nextCoatSlot(w);
          const label = slot === 'coating2'
            ? `${coatedDisplayName(w)} — adds 2nd coat`
            : slot === 'replace'
              ? `${coatedDisplayName(w)} — replaces ${w.coating!.label.toLowerCase()}`
              : w.name;
          const isReplace = slot === 'replace';
          return {
            label: withEquippedTag(disambiguateCoatRow(label, w), w),
            onPress: () => {
              if (isReplace) {
                // OTA-921/922 — never scrub off a coating on one tap. Stage a picker of
                // the filled slots so the player chooses WHICH coating to replace.
                const filled: Array<{ slot: 'coating' | 'coating2'; label: string }> = [];
                if (w.coating) filled.push({ slot: 'coating', label: w.coating.label });
                if (w.coating2) filled.push({ slot: 'coating2', label: w.coating2.label });
                setCoatReplace({
                  coatId: coatTarget.id,
                  coatName: coatTarget.name,
                  weaponId: w.id,
                  weaponName: w.name,
                  slots: filled,
                });
                setCoatTarget(null);
                return;
              }
              applyCoating(coatTarget.id, w.id);
              setCoatTarget(null);
            },
            tone: isReplace ? ('destructive' as const) : ('primary' as const),
          };
        });
      }
    } catch {
      coatPickerBody = 'Could not read your weapons just now.';
    }
    coatPickerButtons.push({ label: 'Cancel', onPress: () => setCoatTarget(null), tone: 'neutral' });
  }

  // engine_Dev — armor-coating picker. When armorCoatTarget is set, list the
  // player's armor pieces; tapping one works the vial's resist (its damage type)
  // permanently into that piece. Pieces that already resist the type are flagged.
  let armorPickerBody: string | undefined;
  let armorPickerButtons: Array<{ label: string; onPress: () => void; tone: 'primary' | 'neutral' | 'destructive' }> = [];
  if (armorCoatTarget) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { findArmorByName, findGearByName } = require('../engine/crafting') as typeof import('../engine/crafting');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolveItemEffect } = require('../engine/itemEffect');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { coatingDamageType } = require('../engine/weaponCoating') as typeof import('../engine/weaponCoating');
      const fx = resolveItemEffect(armorCoatTarget.name, [findGearByName]);
      const spec = fx?.kind === 'consumable' ? fx.coating : undefined;
      const coatType = (spec
        ? coatingDamageType(String(spec.kind))
        : (armorCoatTarget.tags ?? []).find((t) => ['poison', 'acid', 'corruption', 'electrical', 'burn'].includes(t))) ?? 'this';
      const armorItems = (player.inventory ?? []).filter(
        (i: InventoryItem) => i.kind === 'armor' || i.uniqueStats?.kind === 'armor' || !!findArmorByName(i.name),
      // OTA-1094 — worn armor first, same rule as the weapon picker above.
      ).sort(byWornFirst(wornIds));
      if (armorItems.length === 0) {
        armorPickerBody = 'You have no armor to work the vial into. Pick up a piece first.';
      } else {
        armorPickerBody = `Work the ${armorCoatTarget.name.toLowerCase()} into which armor? It gains permanent ${coatType} resist until the piece is lost or destroyed.`;
        armorPickerButtons = armorItems.map((a: InventoryItem) => {
          const arList = a.addedResists ?? [];
          const alreadyType = arList.map((r) => r.toLowerCase()).includes(coatType.toLowerCase());
          // OTA-922 — mirror the store's cap: base 3 + the Crucible resistCapBonus.
          const arCap = 3 + (a.resistCapBonus ?? 0);
          const atCap = arList.length >= arCap;
          return {
            label: withEquippedTag(
              alreadyType
                ? `${a.name} — already resists ${coatType}`
                : atCap
                  ? `${a.name} — full (${arList.join('/')}) · replace one`
                  : `${a.name}${arList.length ? ` (+${arList.join('/')})` : ''}`,
              a,
            ),
            onPress: () => {
              if (!alreadyType && atCap) {
                // OTA-922 — full piece: pick which resist to strip instead of refusing.
                setArmorResistReplace({
                  coatId: armorCoatTarget.id,
                  coatName: armorCoatTarget.name,
                  armorId: a.id,
                  armorName: a.name,
                  coatType,
                  resists: arList,
                });
                setArmorCoatTarget(null);
                return;
              }
              applyCoatingToArmor(armorCoatTarget.id, a.id);
              setArmorCoatTarget(null);
            },
            tone: !alreadyType && atCap ? ('destructive' as const) : ('primary' as const),
          };
        });
      }
    } catch {
      armorPickerBody = 'Could not read your armor just now.';
    }
    armorPickerButtons.push({ label: 'Cancel', onPress: () => setArmorCoatTarget(null), tone: 'neutral' });
  }

  // OTA-485 — companion-item background stripes. Items the player can FEED or USE
  // ON a companion get faint diagonal hatching in that companion's signature colour
  // (the same hue its name renders in): GOLD for the dog, PURPLE for the golem — so
  // the player can spot "this is for my dog / golem" at a glance while scanning the
  // pack. Eligibility mirrors the modal action buttons exactly (no drift):
  //   • dog (gold)   — active dog + a consumable (Feed) or a dog_armor vest (Equip on dog).
  //   • golem (purple) — active golem + a repair part (Repair) or a golem weapon (Arm).
  const dogActiveForStripe = !!player.dog
    && player.dog.status !== 'abandoned'
    && player.dog.status !== 'dead';
  const golemForStripe = player.golem;
  const golemActiveForStripe = !!golemForStripe && golemForStripe.hp > 0;
  const companionStripeColor = (item: InventoryItem): string | null => {
    if (dogActiveForStripe && (item.kind === 'consumable' || item.kind === 'dog_armor')) {
      return COMPANION_STRIPE_DOG;
    }
    if (golemActiveForStripe && golemForStripe) {
      // Full fuel part OR an element-matched SUBSTITUTE material (arb122) — both
      // feed THIS golem (kind-specific, so it never lights for the wrong golem).
      if (isGolemRepairPart(golemForStripe.kind, item.name)) return COMPANION_STRIPE_GOLEM;
      if (isGolemSubstitutePart(golemForStripe.kind, item)) return COMPANION_STRIPE_GOLEM;
      const w = findWeaponByName(item.name);
      if (w && isGolemWeapon(w.tags)) return COMPANION_STRIPE_GOLEM;
    }
    return null;
  };

  return (
    <View style={styles.container}>
      {/* ⚠ OTA-1154 — GIFT MODE BANNER. The player arrived here from a GIVE
          affordance in the world, so the pack has to say why it opened and offer
          a way back out. Without this the inventory looks identical to a normal
          visit and the only clue is an extra button inside a modal you have to
          open first — a mode with no visible state is a mode players get stuck
          in. Tapping the banner leaves gift mode without giving anything. */}
      {giftMode && (
        <Pressable
          onPress={cancelGiftMode}
          style={({ pressed }) => [styles.giftModeBar, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`Giving to ${giftMode.toName}. Tap to cancel.`}
        >
          <Text style={styles.giftModeText}>✦ GIVING TO {giftMode.toName.toUpperCase()}</Text>
          <Text style={styles.giftModeHint}>
            tap an item to offer it · worn, racked and contract-bound things cannot be given · tap here to cancel
          </Text>
        </Pressable>
      )}
      {/* OTA-230 — first-time inventory hint. Pops once per install
          when the player first opens the pack; dismissable.
          Authoring rule: ~25 words, 2 sentences max. */}
      <FirstTimeHint
        id="inventory_first_open"
        title="Your pack"
        body="Tap any item to equip, use, salvage, or drop. The green line shows damage; the diamond means engine-named."
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
        <Text style={styles.title} accessibilityRole="header">INVENTORY</Text>
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

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* OTA-239 — Tool Pouch banner. 3 slots above the inventory list
            showing what's stowed (Aetheric Torch, Vision Lens, etc.).
            Pouched items are ready-to-use; the `use <item>` verb
            resolves them faster. Tap a slot to unpouch. Tap an inventory
            item below to stow via the existing equip dialog (the dialog
            now offers "stow in pouch" alongside the equip slots). */}
        <ToolPouchBanner
          player={player}
          pouchFilterActive={pouchFilterActive}
          onTapEmptySlot={() => { setBandolierFilterActive(false); setPouchFilterActive((v) => !v); }}
        />
        {/* arb110 — BANDOLIER (throwables), mutually exclusive fill mode with the pouch. */}
        <BandolierBanner
          player={player}
          filterActive={bandolierFilterActive}
          onTapEmptySlot={() => { setPouchFilterActive(false); setBandolierFilterActive((v) => !v); }}
        />
        {bandolierFilterActive && (
          <View style={styles.pouchFilterBanner}>
            <Text style={styles.pouchFilterText}>
              Tap a throwable below to rack it on your bandolier.
            </Text>
            <TouchableOpacity onPress={() => setBandolierFilterActive(false)} style={styles.pouchFilterCancel} accessibilityRole="button">
              <Text style={styles.pouchFilterCancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* OTA-269 — filter active callout. Shows when the player
            has tapped an empty pouch slot above; the inventory below
            is now narrowed to pouch-eligible tools. CANCEL clears
            the filter. */}
        {pouchFilterActive && (
          <View style={styles.pouchFilterBanner}>
            <Text style={styles.pouchFilterText}>
              Tap a tool below to stow it on your belt.
            </Text>
            <TouchableOpacity onPress={() => setPouchFilterActive(false)} style={styles.pouchFilterCancel} accessibilityRole="button">
              <Text style={styles.pouchFilterCancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* OTA-1097 — say the mode out loud. The FUSABLE view now behaves
            differently from every other sort (a tap reserves instead of opening
            the item sheet), and a screen that silently changes what a tap means
            is the same silent-rule problem OTA-1094 was written against. One
            line, only in this view, naming both the tap and the long-press. */}
        {fusionSelectMode && !invSelectMode && (
          <View style={styles.fusionModeBanner}>
            <Text style={styles.fusionModeText}>
              Tap to reserve ♡ / release ♥ for the Crucible. Use a category&apos;s ALL button to take the lot, or hold a row to build a group. For a single unit off a stack, switch sort and tap the item.
            </Text>
          </View>
        )}
        {/* OTA-1100 — the group bar. Only present once you've held a row, and it
            offers exactly the actions the SELECTION can actually take: a button
            that would act on nothing is not shown at all, rather than sitting
            there greyed and unexplained. Counts come from the same predicates
            the action uses, so a button can never claim a number it cannot
            deliver — the rule the Crucible's SELECT ALL learned in OTA-1097. */}
        {invSelectMode && (
          <View style={styles.groupBar}>
            <View style={styles.groupBarHead}>
              <Text style={styles.groupBarCount}>☑ {selectedItems.length} picked</Text>
              <TouchableOpacity onPress={exitInvSelect} style={styles.groupBarCancel} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Cancel the group">
                <Text style={styles.groupBarCancelText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.groupBarActions}>
              {/* OTA-1114 — gear first, and DESTRUCTIVE LAST. Before this, a
                  group of worn armor showed exactly one button and it was
                  SCRAP; putting EQUIP / UNEQUIP ahead of it means the reversible
                  thing is the one under your thumb. */}
              {equipPlan.equip.length > 0 && (
                <TouchableOpacity onPress={() => setInvGroupAction('equip')} style={styles.groupActBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Equip ${equipPlan.equip.length} items`}>
                  <Text style={styles.groupActText}>EQUIP {equipPlan.equip.length}</Text>
                </TouchableOpacity>
              )}
              {unequippable.length > 0 && (
                <TouchableOpacity onPress={() => setInvGroupAction('unequip')} style={styles.groupActBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Take off ${unequippable.length} items`}>
                  <Text style={styles.groupActText}>TAKE OFF {unequippable.length}</Text>
                </TouchableOpacity>
              )}
              {droppable.length > 0 && (
                <TouchableOpacity onPress={() => setInvGroupAction('drop')} style={styles.groupActBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Drop ${droppable.length} items`}>
                  <Text style={styles.groupActText}>DROP {droppable.length}</Text>
                </TouchableOpacity>
              )}
              {scrappable.length > 0 && (
                <TouchableOpacity onPress={() => setInvGroupAction('scrap')} style={styles.groupActBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Salvage ${scrappable.length} items`}>
                  <Text style={styles.groupActText}>SALVAGE {scrappable.length}</Text>
                </TouchableOpacity>
              )}
              {reservable.length > 0 && (
                <TouchableOpacity onPress={() => setInvGroupAction('reserve')} style={styles.groupActBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Reserve ${reservable.length} items for fusion`}>
                  <Text style={styles.groupActText}>♡ RESERVE {reservable.length}</Text>
                </TouchableOpacity>
              )}
              {releasable.length > 0 && (
                <TouchableOpacity onPress={() => setInvGroupAction('release')} style={styles.groupActBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Release ${releasable.length} items from fusion`}>
                  <Text style={styles.groupActText}>♥ RELEASE {releasable.length}</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Say what the group CAN'T do, rather than leaving the player to
                wonder why their quest item has no button. */}
            {droppable.length + scrappable.length + reservable.length + releasable.length
              + equipPlan.equip.length + unequippable.length === 0 && (
              <Text style={styles.groupBarNone}>
                Nothing here can be worn, dropped, salvaged or reserved — quest-bound items stay with you.
              </Text>
            )}
            {/* OTA-1114 — say WHY a piece you ticked isn't in the EQUIP count,
                rather than leaving the player to wonder which of their two
                chestplates the button meant. */}
            {equipPlan.crowdedOut.length > 0 && (
              <Text style={styles.groupBarNone}>
                {equipPlan.crowdedOut.length === 1
                  ? `The ${equipPlan.crowdedOut[0]?.name} wants a slot another piece in this group already has.`
                  : `${equipPlan.crowdedOut.length} pieces want slots others in this group already have.`}
              </Text>
            )}
          </View>
        )}
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (items.length === 0) return null;
          const collapsed = collapsedSections[cat] ?? true; // default collapsed
          return (
            <View
              key={cat}
              style={styles.section}
              onLayout={(e) => { sectionYRef.current[cat] = e.nativeEvent.layout.y; }}
            >
              {/* arb108 — semi-transparent backing so the label reads over any
                  background; tap anywhere on the header (chevron included) to
                  collapse/expand the whole section. */}
              <TouchableOpacity
                style={[styles.sectionHeader, { borderLeftColor: CATEGORY_COLORS[cat] }]}
                activeOpacity={0.7}
                onPress={() => setCollapsedSections((s) => ({ ...s, [cat]: !(s[cat] ?? true) }))}
                accessibilityRole="button"
                accessibilityState={{ expanded: !collapsed }}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Text style={[styles.sectionChevron, { color: CATEGORY_COLORS[cat] }]}>
                    {/* ⚠ OTA-1456 — chevron-as-state: ▸ closed, ▾ open. */}
                    {collapsed ? '▸' : '▾'}
                  </Text>
                  <Text style={[styles.sectionLabel, { color: CATEGORY_COLORS[cat] }]}>
                    {CATEGORY_LABEL[cat].toUpperCase()}
                  </Text>
                </View>
                {/* OTA-1097 — SELECT ALL / CLEAR ALL, in the FUSABLE view only.
                    Owner: "we also need a select all button on the category
                    headers in inventory when we select sort by fusable so you
                    can select a whole category." Reserving a category one row at
                    a time was the same complaint OTA-968 answered for a single
                    stack, one level up. Rendered INSIDE the header but with its
                    own press handler, so it never collapses the section it acts
                    on — the one thing that would make it useless. */}
                {fusionSelectMode && (() => {
                  const sel = categorySelection(items);
                  if (sel.eligible === 0) return null;
                  return (
                    <TouchableOpacity
                      style={[styles.selectAllBtn, sel.allSelected && styles.selectAllBtnOn]}
                      activeOpacity={0.7}
                      onPress={() => reserveManyForFusion(sel.ids, !sel.allSelected)}
                      accessibilityRole="button"
                      accessibilityLabel={sel.allSelected
                        ? `Clear all ${sel.eligible} reserved ${CATEGORY_LABEL[cat]} items`
                        : `Reserve all ${sel.eligible} ${CATEGORY_LABEL[cat]} items for fusion`}
                    >
                      <Text style={[styles.selectAllText, sel.allSelected && styles.selectAllTextOn]}>
                        {sel.allSelected ? `♥ CLEAR ${sel.eligible}` : `♡ ALL ${sel.eligible}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
                <Text style={styles.sectionCount}>
                  {items.reduce((sum, i) => sum + i.quantity, 0)}
                </Text>
              </TouchableOpacity>
              {!collapsed && items.map((item) => (
                <View
                  key={item.id}
                  onLayout={(e) => { rowInfoRef.current[item.id] = { y: e.nativeEvent.layout.y, cat }; }}
                >
                <ItemRow
                  item={item}
                  color={CATEGORY_COLORS[cat]}
                  highlight={item.id === focusItemId}
                  isEquipped={equippedItemIds.has(item.id)}
                  equippedSlotLabel={equippedSlotLabelFor(item)}
                  fillSlotLabel={slotFillLabelFor(item)}
                  isPouched={(player.equipped?.toolPouchIds ?? []).includes(item.id)}
                  isBandoliered={(player.equipped?.bandolierIds ?? []).includes(item.id)}
                  // arb105 — the red ✗ means "this item's EQUIP slot is already
                  // worn". In pouch/bandolier fill mode the player isn't equipping —
                  // a scanner's off-hand being full is irrelevant — so suppress it.
                  slotTaken={!pouchFilterActive && !bandolierFilterActive && itemSlotTaken(item)}
                  stripeColor={companionStripeColor(item)}
                  onPress={() => handleItemTap(item)}
                  onLongPress={() => handleItemLongPress(item)}
                  // OTA-1100 — the checkbox affordance now belongs to the GROUP
                  // mode; the FUSABLE view keeps its own ♥ tick through
                  // item.reservedForFusion, which is a different thing.
                  selectable={fusionSelectMode}
                  grouped={invSelectMode}
                  groupPicked={invSelected.includes(item.id)}
                />
                </View>
              ))}
            </View>
          );
        })}
        {player.inventory.length === 0 && (
          <Text style={styles.empty}>Your pack is empty. Tartaria has not given you anything yet.</Text>
        )}
        {/* arb-fix — distinct empty copy when the FUSABLE filter hides
            everything, so it doesn't read as a totally empty pack. */}
        {player.inventory.length > 0 && sortKey === 'fusionable' && sorted.length === 0 && (
          <Text style={styles.empty}>Nothing in your pack qualifies for the Crucible yet. Salvage-grade engine-named items and faction gear can be fused.</Text>
        )}
      </ScrollView>

      <View style={styles.legend}>
        {CATEGORY_ORDER.map((cat) => (
          <View key={cat} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: CATEGORY_COLORS[cat] }]} />
            <Text style={[styles.legendText, { color: legendTextColor }]}>{CATEGORY_LABEL[cat]}</Text>
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
        body={scrapResultBody ?? modalBodyFull}
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
                label: 'Salvage how many?',
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

      {/* OTA-1100 — group-action confirmation. Itemises exactly what is going,
          and carries the warnings each single-item path would have raised: SCRAP
          silently AUTO-UNEQUIPS worn gear (OTA-058) and DROP leaves things on
          the ground where you stand. A bulk action's real danger is doing
          quietly what one action would have stopped to explain. */}
      <BrandedModal
        visible={invGroupAction !== null}
        title={
          invGroupAction === 'drop' ? `Drop ${droppable.length}`
            : invGroupAction === 'scrap' ? `Break down ${scrappable.length}`
              : invGroupAction === 'reserve' ? `Reserve ${reservable.length} for the Crucible`
                : invGroupAction === 'equip' ? `Put on ${equipPlan.equip.length}`
                  : invGroupAction === 'unequip' ? `Take off ${unequippable.length}`
                    : `Release ${releasable.length} from the Crucible`
        }
        body={(() => {
          const rows = invGroupAction === 'drop' ? droppable
            : invGroupAction === 'scrap' ? scrappable
              : invGroupAction === 'reserve' ? reservable
                : invGroupAction === 'equip' ? equipPlan.equip.map((e) => e.item)
                  : invGroupAction === 'unequip' ? unequippable.map((r) => r.item)
                    : releasable;
          // OTA-1114 — the gear rows name their SLOT, because "Put on 4" is
          // only checkable if you can see it is four different slots.
          if (invGroupAction === 'equip' || invGroupAction === 'unequip') {
            const lines = invGroupAction === 'equip'
              ? equipPlan.equip.map((e) => `· ${e.item.name} — ${SLOT_LABEL[e.slot] ?? e.slot}`)
              : unequippable.map((r) => `· ${r.item.name} — ${[...new Set(r.slots.map((s) => SLOT_LABEL[s] ?? s))].join(' + ')}`);
            const gearNotes: string[] = [];
            if (invGroupAction === 'unequip') {
              // ⚠ The whole reason this OTA exists. Armor IS armor class; a
              // player who takes five pieces off mid-run should be told what it
              // costs before the next thing swings at them, not after.
              gearNotes.push('Stripped off and back into your pack — your armor class drops by what they were worth.');
              // ⚠ The exact situation in the owner's death log. Taking armor off
              // in a quiet room is housekeeping; taking it off with five raiders
              // on the tile is the last decision the character makes. Same
              // action, and only one of them needs saying out loud.
              if (inCombatNow) {
                gearNotes.push('⚠ You are in a fight. Every swing coming at you lands easier the moment this is off.');
              }
            } else {
              gearNotes.push('Anything already in those slots is set aside into your pack.');
            }
            if (equipPlan.crowdedOut.length > 0 && invGroupAction === 'equip') {
              gearNotes.push(`Skipped: ${equipPlan.crowdedOut.map((i) => i.name).join(', ')} — another piece here wants the same slot.`);
            }
            return [lines.join('\n'), ...gearNotes].filter(Boolean).join('\n\n');
          }
          const list = rows
            .map((i) => `· ${i.name}${(i.quantity ?? 1) > 1 ? ` ×${i.quantity}` : ''}`)
            .join('\n');
          const notes: string[] = [];
          if (invGroupAction === 'drop') {
            notes.push('They lie on the ground here. You can pick them back up until you move on.');
            if (selectedItems.length > droppable.length) {
              notes.push(`Skipped: ${selectedItems.length - droppable.length} you're wearing or that are quest-bound.`);
            }
          }
          if (invGroupAction === 'scrap') {
            notes.push('Broken down for stock material. This cannot be undone.');
            const wornHere = scrappable.filter((i) => wornIds.has(i.id)).map((i) => i.name);
            if (wornHere.length > 0) notes.push(`⚠ Worn right now — these will be taken off first: ${wornHere.join(', ')}.`);
            if (selectedItems.length > scrappable.length) {
              notes.push(`Skipped: ${selectedItems.length - scrappable.length} that are already raw stock or quest-bound.`);
            }
          }
          return [list, ...notes].filter(Boolean).join('\n\n');
        })()}
        buttons={[
          { label: 'Back', onPress: () => setInvGroupAction(null), tone: 'neutral' as const },
          {
            label: invGroupAction === 'drop' ? 'Drop them'
              : invGroupAction === 'scrap' ? 'Break them down'
                : invGroupAction === 'reserve' ? '♡ Reserve them'
                  : invGroupAction === 'equip' ? 'Put them on'
                    : invGroupAction === 'unequip' ? 'Take them off' : '♥ Release them',
            onPress: runGroupAction,
            tone: (invGroupAction === 'drop' || invGroupAction === 'scrap')
              ? ('destructive' as const)
              : ('primary' as const),
          },
        ]}
        onRequestClose={() => setInvGroupAction(null)}
      />

      {/* OTA-360 — weapon-coating picker. Second modal that opens when
          the player chose "Coat a weapon"; lists the coatable weapons
          in the pack as pick buttons. */}
      <BrandedModal
        visible={coatTarget !== null}
        title={coatTarget ? `Apply ${coatTarget.name}` : ''}
        body={coatPickerBody}
        buttons={coatPickerButtons}
        onRequestClose={() => setCoatTarget(null)}
      />
      {/* OTA-921/922 — every coating slot is full. Ask WHICH coating to scrub off and
          replace (a picker), so one is never blindly overwritten. A single-slot weapon
          shows exactly one option (its lone coating). */}
      <BrandedModal
        visible={coatReplace !== null}
        title={coatReplace
          ? (coatReplace.slots.length > 1
              ? 'All coating slots are full'
              : `Replace the ${(coatReplace.slots[0]?.label ?? '').toLowerCase()} coating?`)
          : ''}
        body={coatReplace
          ? (coatReplace.slots.length > 1
              ? `The ${coatReplace.weaponName} already carries ${coatReplace.slots.map((sl) => sl.label.toLowerCase()).join(' + ')} and every slot is full. Pick which coating to scrub off and replace with the ${coatReplace.coatName.toLowerCase()}.`
              : `The ${coatReplace.weaponName} already carries a ${(coatReplace.slots[0]?.label ?? '').toLowerCase()} coating and has no open second slot, so working the ${coatReplace.coatName.toLowerCase()} in will scrub the ${(coatReplace.slots[0]?.label ?? '').toLowerCase()} off for good. Crucible-upgrade the weapon first if you want it to carry more than one coating.`)
          : undefined}
        buttons={coatReplace
          ? [
              ...coatReplace.slots.map((sl) => ({
                label: `Scrub off ${sl.label} & replace`,
                onPress: () => {
                  applyCoating(coatReplace.coatId, coatReplace.weaponId, sl.slot);
                  setCoatReplace(null);
                },
                tone: 'destructive' as const,
              })),
              { label: 'Cancel', onPress: () => setCoatReplace(null), tone: 'neutral' as const },
            ]
          : []}
        onRequestClose={() => setCoatReplace(null)}
      />
      {/* engine_Dev — armor-coating picker: works a vial's resist into a piece. */}
      <BrandedModal
        visible={armorCoatTarget !== null}
        title={armorCoatTarget ? `Apply ${armorCoatTarget.name} to armor` : ''}
        body={armorPickerBody}
        buttons={armorPickerButtons}
        onRequestClose={() => setArmorCoatTarget(null)}
      />
      {/* OTA-922 — the armor piece is FULL. Ask which worked-in resist to strip so the
          new one can take its place, rather than silently refusing. */}
      <BrandedModal
        visible={armorResistReplace !== null}
        title={armorResistReplace ? `${armorResistReplace.armorName} is full — replace which resist?` : ''}
        body={armorResistReplace
          ? `The ${armorResistReplace.armorName} already turns aside ${armorResistReplace.resists.join(', ')} and every slot is worked. Pick which resist to strip so it can take ${armorResistReplace.coatType} instead. Crucible-upgrade the piece to hold one more.`
          : undefined}
        buttons={armorResistReplace
          ? [
              ...armorResistReplace.resists.map((r) => ({
                label: `Strip ${r} & take ${armorResistReplace.coatType}`,
                onPress: () => {
                  applyCoatingToArmor(armorResistReplace.coatId, armorResistReplace.armorId, r);
                  setArmorResistReplace(null);
                },
                tone: 'destructive' as const,
              })),
              { label: 'Cancel', onPress: () => setArmorResistReplace(null), tone: 'neutral' as const },
            ]
          : []}
        onRequestClose={() => setArmorResistReplace(null)}
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
  const POUCH_MAX = 3;
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
      <Text style={pouchStyles.title}>SCANNER POUCH</Text>
      <Text style={pouchStyles.hint}>Scanners run whenever you search (3 slots). Tap an empty slot to stow one from your pack.</Text>
      <View style={pouchStyles.row}>
        {slots.map((slot, idx) => (
          <View key={idx} style={pouchStyles.slot}>
            {slot.name ? (
              <TouchableOpacity
                style={pouchStyles.slotFilled}
                activeOpacity={0.7}
                onPress={() => unpouchItem(slot.name!, slot.id ?? undefined)}
                accessibilityRole="button"
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
                accessibilityRole="button"
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
  hint: { color: '#a2977b', fontSize: 10, fontStyle: 'italic', marginBottom: 6 },
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
  slotAction: { color: '#a2977b', fontSize: 9, marginTop: 2 },
  slotEmptyText: { color: '#9ec96a', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  slotEmptyTextActive: { color: '#c9a86a' },
});

// arb110 — BANDOLIER banner. The throwables counterpart to the tool pouch: five
// slots that rack one-shot throwables (Shaped Aetheric Shard, Disease Sample, …).
// In combat a Bandolier button opens a popup and tapping an item throws it.
function BandolierBanner({
  player,
  filterActive,
  onTapEmptySlot,
}: {
  player: PlayerCharacter;
  filterActive: boolean;
  onTapEmptySlot: () => void;
}) {
  const BANDOLIER_MAX = 5;
  const ids = player.equipped?.bandolierIds ?? [];
  const removeFromBandolier = useGameStore((s) => s.removeFromBandolier);
  const slots: Array<{ name: string | null; qty: number; id: string | null }> = [];
  for (let i = 0; i < BANDOLIER_MAX; i++) {
    const id = ids[i];
    const item = id ? player.inventory.find((it) => it.id === id) : undefined;
    slots.push({ name: item?.name ?? null, qty: item?.quantity ?? 0, id: id ?? null });
  }
  return (
    <View style={bandolierStyles.banner}>
      <Text style={bandolierStyles.title}>BANDOLIER</Text>
      <Text style={bandolierStyles.hint}>Ready-to-throw (5 slots). Tap an empty slot to rack a throwable; in combat, tap the bandolier to hurl one.</Text>
      <View style={bandolierStyles.row}>
        {slots.map((slot, idx) => (
          <View key={idx} style={bandolierStyles.slot}>
            {slot.name ? (
              <TouchableOpacity
                style={bandolierStyles.slotFilled}
                activeOpacity={0.7}
                onPress={() => removeFromBandolier(slot.name!, slot.id ?? undefined)}
                accessibilityRole="button"
              >
                <Text style={bandolierStyles.slotName} numberOfLines={1}>
                  {slot.name}{slot.qty > 1 ? ` ×${slot.qty}` : ''}
                </Text>
                <Text style={bandolierStyles.slotAction}>tap to unrack</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[bandolierStyles.slotEmpty, filterActive && bandolierStyles.slotEmptyActive]}
                activeOpacity={0.7}
                onPress={onTapEmptySlot}
                accessibilityRole="button"
              >
                <Text style={[bandolierStyles.slotEmptyText, filterActive && bandolierStyles.slotEmptyTextActive]}>
                  {filterActive ? 'pick a throwable ↓' : '+ rack throw'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const bandolierStyles = StyleSheet.create({
  banner: {
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: '#1d1411',
    borderColor: '#5a3a30',
    borderWidth: 1,
    borderRadius: 4,
  },
  title: { color: '#e07a5f', fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  hint: { color: '#a2977b', fontSize: 10, fontStyle: 'italic', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  slot: { flexBasis: '18%', flexGrow: 1 },
  slotFilled: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderColor: '#e07a5f',
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#2a1a14',
  },
  slotEmpty: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#13110f',
    alignItems: 'center',
  },
  slotEmptyActive: { backgroundColor: '#2a1a14', borderColor: '#e07a5f' },
  slotName: { color: '#e6d8b3', fontSize: 10, fontWeight: '700' },
  slotAction: { color: '#a2977b', fontSize: 8, marginTop: 2 },
  slotEmptyText: { color: '#9ec96a', fontSize: 9, fontWeight: '600', letterSpacing: 0.3, textAlign: 'center' },
  slotEmptyTextActive: { color: '#e07a5f' },
});

// OTA-485 — companion signature colours, keyed to the hues each name renders in
// (StatsPanel: dogName #c9a86a gold, golemName #9888a8 purple).
// OTA-489 — player asked to "keep the translucence but bump the saturation": same
// gold/purple HUES, richer chroma so they read clearly as gold/purple at the
// unchanged ~0.2 stripe opacity (the name-label hues stay as-is; these brighter
// variants are stripe-only, since a faint 0.2 wash needs more saturation to land).
const COMPANION_STRIPE_DOG = '#e3a82a';   // saturated gold (hue ~40°)
const COMPANION_STRIPE_GOLEM = '#a45fe0'; // saturated amethyst (hue ~268°)

// OTA-485 — diagonal hatch drawn with plain <View>s (no SVG / gradient dependency,
// so the whole thing ships over-the-air). A row of vertical bands inside an
// oversized layer rotated 45°; the row's overflow:'hidden' clips it to the item
// box. Low opacity keeps it "mostly translucent but still visible," and
// pointerEvents none + back-most paint order keep it from blocking taps or text.
const STRIPE_BAND = 6;      // width of each coloured band (dp)
const STRIPE_GAP = 9;       // clear gap between bands (dp)
const STRIPE_COUNT = 60;    // enough bands to cover a full-width row once rotated
const STRIPE_OPACITY = 0.2; // mostly translucent, still legible over the dark row

function CompanionStripes({ color }: { color: string }) {
  const bands = [];
  for (let i = 0; i < STRIPE_COUNT; i++) {
    bands.push(
      <View key={i} style={{ width: STRIPE_BAND, marginRight: STRIPE_GAP, backgroundColor: color }} />,
    );
  }
  return (
    <View pointerEvents="none" style={styles.stripeClip}>
      <View style={styles.stripeField}>{bands}</View>
    </View>
  );
}

function ItemRow({
  item,
  color,
  highlight,
  isEquipped,
  equippedSlotLabel,
  fillSlotLabel,
  isPouched,
  isBandoliered,
  slotTaken,
  stripeColor,
  onPress,
  onLongPress,
  selectable,
  grouped,
  groupPicked,
}: {
  item: InventoryItem;
  color: string;
  highlight?: boolean;
  isEquipped: boolean;
  equippedSlotLabel: string;
  fillSlotLabel: string;
  isPouched: boolean;
  isBandoliered: boolean;
  slotTaken: boolean;
  stripeColor: string | null;
  onPress: () => void;
  /** OTA-1097 — FUSABLE view only: opens the ordinary item modal, since the tap
   *  is spent on the reserve toggle there. */
  onLongPress?: () => void;
  /** OTA-1097 — true in the FUSABLE view, where the row behaves as a checkbox.
   *  A reserved row gets a lit border so "selected" reads at a glance rather
   *  than resting entirely on the small ♥ at the end of the meta line. */
  selectable?: boolean;
  /** OTA-1100 — a group is open (hold-to-pick). Rows show a ☐/☑ box. */
  grouped?: boolean;
  /** OTA-1100 — this row is in the group. */
  groupPicked?: boolean;
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
      // OTA-684 — a just-forged piece arrives highlighted (gold wash + border) so
      // the eye lands on it after the "View in inventory" jump; it clears itself.
      style={[
        styles.row,
        highlight && styles.rowHighlighted,
        // OTA-1097 — selection state is a lit border, not just the trailing ♥.
        selectable && item.reservedForFusion === true && styles.rowSelected,
        // OTA-1100 — group membership outranks it visually: while a group is
        // open, that is the question the screen is asking.
        grouped && groupPicked && styles.rowGrouped,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.7}
      accessibilityRole={grouped || selectable ? 'checkbox' : 'button'}
      accessibilityState={grouped
        ? { checked: !!groupPicked }
        : selectable ? { checked: item.reservedForFusion === true } : undefined}
      accessibilityHint={grouped
        ? 'Tap to add or remove this from the group.'
        : selectable
          ? (item.reservedForFusion
            ? 'Reserved for fusion. Tap to release it. Hold to start a group.'
            : 'Tap to reserve it for fusion. Hold to start a group.')
          : 'Tap for the item menu. Hold to start a group.'}
    >
      {/* OTA-1100 — the group tick. Sits ahead of the rarity stripe so a picked
          row reads from its leading edge, the way a checklist does. */}
      {grouped && (
        <View style={styles.groupTickWrap}>
          <Text style={groupPicked ? styles.groupTick : styles.groupTickOff}>
            {groupPicked ? '☑' : '☐'}
          </Text>
        </View>
      )}
      {/* OTA-485 — faint diagonal hatching behind the row for companion-edible/
          usable items. Rendered FIRST so it sits behind the rarity stripe + the
          text body; pointerEvents none + low opacity so it never blocks a tap or
          obscures any writing. */}
      {stripeColor && <CompanionStripes color={stripeColor} />}
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
          {/* arb87 — red ✗ when this item's slot is already worn (you'd have
              to unequip first). Same alarm red as combat misses.
              arb-fix — and a green ✓ when THIS item is the one equipped, the
              positive twin of the red ✗ (same combat-success green as a crit).
              Mutually exclusive: an equipped item isn't "slot-taken by another". */}
          {isEquipped && <Text style={styles.rowEquippedCheck}>✓ </Text>}
          {slotTaken && <Text style={styles.rowSlotTaken}>✗ </Text>}
          {/* OTA-688 — a Crucible-forged item wears a magical ❖ star (rarity-colored),
              distinct from the ◆ inferred diamond. Fused items are catalog-absent but
              NOT "inferred", so they never showed the ◆ — now they carry their own mark. */}
          {isFusedInventoryItem(item) ? (
            <Text style={[styles.rowFusedMark, { color: rarityHexColor(item.rarity) }]}>❖ </Text>
          ) : isForgeReservableItem(item) ? (
            <Text style={[styles.rowInferredDiamond, { color: rarityHexColor(item.rarity) }]}>◆ </Text>
          ) : null}
          <Text style={styles.rowName} numberOfLines={1}>
            {/* OTA-360 — a coated weapon shows its coated name
                ("Corrupted Battle Axe"); the underlying name is
                unchanged for stat lookup. OTA-873 — a dual-coat weapon
                shows both adjectives ("Corrupted Venomous Battle Axe"). */}
            {[item.coating?.label, item.coating2?.label].filter(Boolean).length
              ? `${[item.coating?.label, item.coating2?.label].filter(Boolean).join(' ')} ${item.name}`
              : item.name}
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
          {/* OTA-1024 — material kind(s) on every forge-reservable row (owner,
              reading his 29 identical-looking ♥ rows: "they are all too
              alike, there isn't 3 different kinds here?"). Building a
              3-kind spread is now a glance, not a refusal-driven lesson.
              Mirrors fusionMaterialTags — what the player reads is exactly
              what the diversity gate counts. */}
          {isForgeReservableItem(item) && (
            <Text style={[styles.rowMeta, styles.rowMatKinds]}>
              [{fusionMaterialTags(item).join(' · ') || 'misc'}]
            </Text>
          )}
          {/* OTA-872 — pennant marker on items the player has saved for a quest
              turn-in (soft earmark; hidden from the sell tab). Gold to match the
              Quest Items section colour. */}
          {item.reservedForQuest && <Text style={[styles.rowMeta, styles.rowQuestSaved]}>⚑</Text>}
          {/* arb58 — mark items currently stowed in the tool pouch so the
              player can see at a glance which pack items are pouched. */}
          {isPouched && <Text style={[styles.rowMeta, styles.rowPouch]}>[scanner pouch]</Text>}
          {isBandoliered && <Text style={[styles.rowMeta, styles.rowBandolier]}>[bandolier]</Text>}
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
          {/* OTA-360 — coating chip: the extra damage a coated weapon
              lands on every hit. */}
          {item.coating && (
            <Text style={[styles.rowMeta, styles.rowCoating]}>
              +{item.coating.dice} {item.coating.kind}
            </Text>
          )}
          {/* arb-fix — show the slot the piece fills (esp. armor: "Chest",
              "Feet"…) right on the row so the player sees where it goes. */}
          {canEquip && !isEquipped && (
            <Text style={styles.rowEquippable}>
              {fillSlotLabel ? `${fillSlotLabel} · tap to equip` : 'tap to equip'}
            </Text>
          )}
          {!canEquip && !isEquipped && <Text style={styles.rowEquippable}>tap for details</Text>}
          {isEquipped && (
            // 2026-05-26 OTA-056 — show the slot the item occupies so the
            // player sees it at a glance: weapons read "(main hand)" /
            // "(off hand)" / "(both hands)" / "(two-handed)"; armor reads
            // its slot label. Computed in the parent (equippedSlotLabelFor).
            <Text style={styles.rowEquipped}>
              EQUIPPED{equippedSlotLabel ? ` (${equippedSlotLabel})` : ''}
            </Text>
          )}
        </View>
        {/* arb87 — at-a-glance stat line for EVERY item ("so you know what
            you're picking"). Pulls the same preview stats the details modal
            shows (AC, resists, stat bonuses, consumable restores, passives),
            minus the ones already rendered above (weapon Damage dice +
            Durability) and the noisy Tags line. */}
        {(() => {
          const extra = getItemPreviewForInstance(item).stats.filter(
            (s) => !s.startsWith('Damage:') && !s.startsWith('Durability:') && !s.startsWith('Tags:'),
          );
          if (extra.length === 0) return null;
          return (
            <Text style={styles.rowStat} numberOfLines={1}>
              {extra.join(' · ')}
            </Text>
          );
        })()}
      </View>
    </TouchableOpacity>
  );
}

// OTA-199 — rarity-to-hex palette mirrors BrandedModal.tsx so the
// inferred-item diamond on the inventory row matches the color the
// player sees in the item modal's rarity line. Kept local to this
// file because the only other call site (the modal) imports its own
// version; centralizing would be premature.
const styles = StyleSheet.create({
  // OTA-275 — tablet width cap. Phones unchanged; iPad centers at 600pt.
  // OTA-1154 — gift mode banner. Completion-green, matching the COMPLETE button
  // and the READY sort, so "this is the thing you came to do" reads the same
  // everywhere in the game.
  giftModeBar: {
    backgroundColor: '#161c12',
    borderColor: '#9ec96a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  giftModeText: { color: '#9ec96a', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  giftModeHint: { color: '#a2977b', fontSize: 9, letterSpacing: 0.5, marginTop: 2 },
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
    paddingRight: 10,
    paddingVertical: 6,
    marginBottom: 4,
    // arb108 — semi-transparent backing so the category label never blends into
    // the page background, and a subtle rounded plate to read as a tappable bar.
    backgroundColor: 'rgba(8,6,4,0.55)',
    borderRadius: 3,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  // arb108 — collapse chevron (▾ open / ▸ collapsed).
  sectionChevron: { fontSize: 11, fontWeight: '900', marginRight: 7, width: 11, textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  sectionCount: { color: '#9a8e74', fontSize: 11 },
  // OTA-1097 — the per-category SELECT ALL / CLEAR ALL chip in the FUSABLE view.
  // Sits between the label and the count; its own press handler keeps the tap
  // off the collapse toggle it lives inside.
  selectAllBtn: {
    marginLeft: 'auto',
    marginRight: 10,
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  selectAllBtnOn: { borderColor: '#d8b46a', backgroundColor: 'rgba(216,180,106,0.12)' },
  selectAllText: { color: '#c9a86a', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  selectAllTextOn: { color: '#e6d8b3' },
  row: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 4,
    overflow: 'hidden',
  },
  // OTA-684 — a freshly-forged piece the player deep-linked to: warm gold wash +
  // bright border so it stands out the moment the list scrolls to it. Transient
  // (the screen clears the highlight after ~2.5s).
  rowHighlighted: {
    backgroundColor: '#2a2411',
    borderColor: '#d8b46a',
    borderWidth: 1.5,
  },
  // OTA-1097 — a RESERVED row in the FUSABLE view. Quieter than rowHighlighted
  // (which is a transient "look here" flash) because this is a steady state the
  // player will be looking at a dozen rows of at once, and a dozen loud rows is
  // no signal at all. Reads as "checked" beside the unlit rows around it.
  rowSelected: {
    borderColor: '#9c8348',
    backgroundColor: '#1b1710',
  },
  // OTA-485 — companion hatch. `stripeClip` fills the row and clips (the row also
  // has overflow:'hidden'); `stripeField` is an oversized, 45°-rotated flex row of
  // bands so the diagonal lines cover the whole box at any width.
  stripeClip: { ...StyleSheet.absoluteFillObject, opacity: STRIPE_OPACITY, overflow: 'hidden' },
  stripeField: {
    position: 'absolute',
    top: -140, bottom: -140, left: -140, right: -140,
    flexDirection: 'row',
    alignItems: 'stretch',
    transform: [{ rotate: '45deg' }],
  },
  rowStripe: { width: 4 },
  rowBody: { flex: 1, padding: 8 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowName: { color: '#e6d8b3', fontSize: 14, fontWeight: '600', flex: 1 },
  rowInferredDiamond: { fontSize: 12, fontWeight: '700' },
  // OTA-688 — Crucible-forged marker: a magical ❖ star, rarity-colored.
  rowFusedMark: { fontSize: 12, fontWeight: '700' },
  rowQty: { color: '#cdbf99', fontSize: 12 },
  rowMetaRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  rowMeta: { color: '#a2977b', fontSize: 10, letterSpacing: 1 },
  // arb87 — per-item stat line (AC / resists / bonuses / restores).
  rowStat: { color: '#bfa86a', fontSize: 11, marginTop: 3 },
  // arb87 — "slot already worn" red ✗ (combat-miss red).
  rowSlotTaken: { color: '#e07a5f', fontSize: 13, fontWeight: '800' },
  // arb-fix — "this is equipped" green ✓ (combat-success green, twin of ✗).
  rowEquippedCheck: { color: '#7fb069', fontSize: 13, fontWeight: '800' },
  rowDurabilityLow: { color: '#e07a5f' },
  // OTA 028 — damage dice chip in green so it pops as the
  // "how hard does this hit" signal at a glance.
  rowDamage: { color: '#9ec96a' },
  // OTA-120 Phase 5 — [fits dog] / [treat] tag styling. Amber so they
  // stand out from the grey rarity / durability metadata.
  rowDogTag: { color: '#c9a86a', fontWeight: '700' },
  // OTA-1024 — material-kind chip tone (teal, quieter than the ♥).
  rowMatKinds: { color: '#8aa0a4' },
  rowReserved: { color: '#d97a7a', fontWeight: '700' },
  rowQuestSaved: { color: '#d9c34a', fontWeight: '700' }, // gold — matches Quest Items section
  // OTA-360 — weapon-coating chip. Sickly green-violet so it reads as
  // an applied toxin distinct from the green damage-dice chip.
  rowCoating: { color: '#b08fd4', fontWeight: '700' },
  rowPouch: { color: '#c9a86a', fontWeight: '700' },
  rowBandolier: { color: '#e07a5f', fontWeight: '700' },
  rowEquipped: { color: '#c9a86a', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  rowEquippable: { color: '#a2977b', fontSize: 10, letterSpacing: 1, fontStyle: 'italic' },
  empty: { color: '#a2977b', fontStyle: 'italic', textAlign: 'center', marginTop: 30 },
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
  // OTA-1097 — the FUSABLE-mode explainer. Same plate as the pouch/bandolier
  // banners (it is the same class of thing: a mode where a tap means something
  // else), in the Crucible's amber rather than their green.
  fusionModeBanner: {
    backgroundColor: '#221a10',
    borderColor: '#c9a86a',
    borderLeftWidth: 3,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  fusionModeText: { color: '#cdbf99', fontSize: 12, lineHeight: 17 },
  // OTA-1100 — the inventory group bar + row tick. Same amber language as the
  // Crucible controls, since a group is the same kind of thing: a declaration
  // about several items at once.
  groupBar: {
    backgroundColor: '#1e1a12',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 8,
  },
  groupBarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupBarCount: { color: '#e6d8b3', fontSize: 12, fontWeight: '700' },
  groupBarCancel: {
    borderColor: '#3a342c', borderWidth: 1, borderRadius: 3,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  groupBarCancelText: { color: '#a2977b', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  groupBarActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  groupActBtn: {
    borderColor: '#6b5c3a', borderWidth: 1, borderRadius: 3,
    backgroundColor: '#17150f', paddingHorizontal: 10, paddingVertical: 6,
  },
  groupActText: { color: '#e6d8b3', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  groupBarNone: { color: '#a2977b', fontSize: 11, fontStyle: 'italic' },
  groupTickWrap: { justifyContent: 'center', paddingLeft: 8, paddingRight: 2 },
  groupTick: { color: '#c9a86a', fontSize: 15, fontWeight: '700' },
  groupTickOff: { color: '#6b5c3a', fontSize: 15 },
  // A row in the group. Brighter than rowSelected (the FUSABLE ♥ state) because
  // while a group is open, group membership is the question being asked.
  rowGrouped: { borderColor: '#c9a86a', backgroundColor: '#1e1a12' },
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
  legendText: { color: '#a2977b', fontSize: 10, letterSpacing: 1 },
  placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80 },
});
