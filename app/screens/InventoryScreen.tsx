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
import { isBandolierEligible } from '../engine/bandolierEligibility';
import { useReadableMuted } from '../ui/displaySettings';
import { BrandedModal } from '../components/BrandedModal';
import { getItemPreview, getItemPreviewForInstance } from '../components/itemPreview';
import { fusionMaterialTags } from '../engine/itemFusion';
import { computeInventoryDelta, type InventoryDelta } from '../components/inventoryDelta';
import { SearchSortBar, type SortDirection } from '../components/SearchSortBar';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { consumeVerb } from '../engine/consumeVerb';
import { isGolemRepairPart, isGolemSubstitutePart, isGolemWeapon } from '../engine/golems';
import { isQuestLockedItem } from '../engine/questItems';

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
  if ((item.tags ?? []).includes('faction_gear')) return true;
  return isInferredItem(item.name);
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
  const setScreen = useGameStore((s) => s.setScreen);
  // arb103 → shared. The bottom legend text washed out when the player tuned a
  // lighter/brighter background. The auto-contrast tone (dark ink on a light
  // bg, faded parchment on a dark one) now lives in displaySettings so the
  // title screen + other on-background text reuse the exact same color.
  const legendTextColor = useReadableMuted();
  const equipItem = useGameStore((s) => s.equipItem);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const dropInventoryItem = useGameStore((s) => s.dropInventoryItem);
  const useInventoryItem = useGameStore((s) => s.useInventoryItem);
  const scrapInventoryItem = useGameStore((s) => s.scrapInventoryItem);
  const toggleReserveForFusion = useGameStore((s) => s.toggleReserveForFusion);
  const applyCoating = useGameStore((s) => s.applyCoating);
  const applyCoatingToArmor = useGameStore((s) => s.applyCoatingToArmor);
  // OTA-269 — pulled in for the pouch-filter-tap stow path. Bypasses
  // the equip modal entirely when pouchFilterActive — a single tap
  // on the eligible item stows it and clears the filter.
  const stowInPouch = useGameStore((s) => s.stowInPouch);
  const stowInBandolier = useGameStore((s) => s.stowInBandolier);
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
  // arb108 — per-category collapse. Tapping a section header folds that whole
  // category away so the player can skip past Weapons/Armor to reach Materials /
  // Food without scrolling through every row. Keyed by category id; default open.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  // OTA-360 — weapon-coating picker. When the player taps "Coat a
  // weapon" on a coating consumable, this holds that consumable and
  // the second modal lists the coatable weapons in the pack as
  // pick buttons. Cleared on apply or cancel.
  const [coatTarget, setCoatTarget] = useState<InventoryItem | null>(null);
  // engine_Dev — armor-coating picker: the vial being worked into a piece of armor.
  const [armorCoatTarget, setArmorCoatTarget] = useState<InventoryItem | null>(null);

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
  const sorted = sortInventoryItems(fusionFiltered, sortKey, sortDirection);
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
  const equippedSlotLabelFor = (item: InventoryItem): string => {
    let slots = equippedSlotsById.get(item.id);
    if (!slots || slots.length === 0) slots = slotsByEquippedName.get(item.name) ?? [];
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
  const POUCH_MAX = 4; // mirrors stowInPouch in gameStore
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
    // arb110 — same direct-stow path for the bandolier fill mode.
    if (bandolierFilterActive) {
      stowInBandolier(item.name);
      setBandolierFilterActive(false);
      return;
    }
    setScrapResult(null); // fresh modal — clear any prior result
    setPending({ item, slots: validSlotsForItem(item) });
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
    // Pass the selected instance's unique id so equipping picks THIS item (its
    // durability / instance stats), not the first inventory row of the same name.
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
      // Scrap THIS exact instance by id (a same-name item with different durability
      // must not be scrapped in its place). For a true stack (one id, quantity N)
      // the id is stable as the quantity decrements, so the batch loop still works.
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
    const isThrowableItem = (pending.item.tags ?? []).some((t) => /^throwable$/i.test(t));
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
    const useIsRealAction = isConsumable || hasEffect || (offEligible && isThrowableItem);
    if (useIsRealAction) {
      // arb106 — show YOUR current HP on the eat/drink button so you can see at a
      // glance whether you actually need it (player ask).
      const hpTag = isConsumable && player ? `  ${player.hp}/${player.hpMax}` : '';
      buttons.push({
        label: isConsumable ? `Use (${consumeVerb(pending.item)})${hpTag}` : (offEligible ? 'Use (off hand)' : 'Use'),
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
    if ((pending.item.tags ?? []).includes('weapon_coating')) {
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
    // arb105 — faction-gear items can ALSO be reserved, as a fusion
    // CATALYST: reserving one themes the next Crucible output into a
    // unique faction item (it doesn't count toward the 3-scrap gate).
    const isFactionCatalyst = (pending.item.tags ?? []).includes('faction_gear');
    if (isInferredInventoryItem(pending.item) || isFactionCatalyst) {
      const reserved = pending.item.reservedForFusion === true;
      const label = isFactionCatalyst
        ? (reserved ? '♥ Reserved as faction catalyst' : '♡ Save as faction catalyst')
        : (reserved ? '♥ Reserved for fusion' : '♡ Save for fusion');
      buttons.push({
        label,
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
  const modalBody = pending && isQuestLockedItem(pending.item)
    ? 'Reserved for your objective — this stays in your pack until you turn it in. It can\'t be dropped, scrapped, sold, gifted, or fused.'
    : pending && pending.slots.length === 0 && (slotsByEquippedName.get(pending.item.name)?.length ?? 0) === 0
      ? 'This item cannot be equipped, but you can still keep, gift, sell, or use it.'
      : undefined;
  // OTA — fusion info block: for a fusable/reservable item, name the material it
  // contributes and how diversity drives output rarity (a common playtest question:
  // "does what I put in change the quality?" — yes: DIFFERENT materials, not rarity).
  const fusionHint = pending && (isInferredInventoryItem(pending.item) || (pending.item.tags ?? []).includes('faction_gear'))
    ? (() => {
        if ((pending.item.tags ?? []).includes('faction_gear')) {
          return 'Fusion: a faction catalyst — themes the Crucible\'s output (a separate slot; doesn\'t count toward the 3–5 materials).';
        }
        const mats = fusionMaterialTags(pending.item);
        const matStr = mats.length ? mats.join(', ') : 'no distinct material';
        return `Fusion material: ${matStr}. At a Crucible, combine 3–5 reserved pieces — 3 DIFFERENT materials \u2192 Rare, 4+ \u2192 Legendary (variety matters, not rarity).`;
      })()
    : null;
  const modalBodyFull = [modalBody, fusionHint].filter(Boolean).join('\n\n') || undefined;

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
      const { isCoatableItem, coatedDisplayName } = require('../engine/weaponCoating');
      const coatable = (player.inventory ?? []).filter(
        // OTA-453 — instance-aware so FUSED weapons (catalog-absent) are listed.
        (i: InventoryItem) => isCoatableItem(i),
      );
      if (coatable.length === 0) {
        coatPickerBody = 'Nothing in your pack can hold this coating. A coating needs an edge or a point to carry it — a blade, an arrow-arm, or a bolt-caster.';
      } else {
        coatPickerBody = `Paint the ${coatTarget.name.toLowerCase()} onto which weapon? It stays on until the weapon breaks (a repair won't scrub it off).`;
        coatPickerButtons = coatable.map((w: InventoryItem) => ({
          label: w.coating
            ? `${coatedDisplayName(w)} — replaces ${w.coating.label.toLowerCase()}`
            : w.name,
          onPress: () => {
            applyCoating(coatTarget.id, w.id);
            setCoatTarget(null);
          },
          tone: 'primary' as const,
        }));
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
      );
      if (armorItems.length === 0) {
        armorPickerBody = 'You have no armor to work the vial into. Pick up a piece first.';
      } else {
        armorPickerBody = `Work the ${armorCoatTarget.name.toLowerCase()} into which armor? It gains permanent ${coatType} resist until the piece is lost or destroyed.`;
        armorPickerButtons = armorItems.map((a: InventoryItem) => ({
          label: (a.addedResists ?? []).map((r) => r.toLowerCase()).includes(coatType.toLowerCase())
            ? `${a.name} — already resists ${coatType}`
            : `${a.name}${(a.addedResists ?? []).length ? ` (+${(a.addedResists ?? []).join('/')})` : ''}`,
          onPress: () => {
            applyCoatingToArmor(armorCoatTarget.id, a.id);
            setArmorCoatTarget(null);
          },
          tone: 'primary' as const,
        }));
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
            <TouchableOpacity onPress={() => setBandolierFilterActive(false)} style={styles.pouchFilterCancel}>
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
            <TouchableOpacity onPress={() => setPouchFilterActive(false)} style={styles.pouchFilterCancel}>
              <Text style={styles.pouchFilterCancelText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        )}
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          if (items.length === 0) return null;
          const collapsed = collapsedSections[cat] ?? true; // default collapsed
          return (
            <View key={cat} style={styles.section}>
              {/* arb108 — semi-transparent backing so the label reads over any
                  background; tap anywhere on the header (chevron included) to
                  collapse/expand the whole section. */}
              <TouchableOpacity
                style={[styles.sectionHeader, { borderLeftColor: CATEGORY_COLORS[cat] }]}
                activeOpacity={0.7}
                onPress={() => setCollapsedSections((s) => ({ ...s, [cat]: !(s[cat] ?? true) }))}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Text style={[styles.sectionChevron, { color: CATEGORY_COLORS[cat] }]}>
                    {collapsed ? '▾' : '▴'}
                  </Text>
                  <Text style={[styles.sectionLabel, { color: CATEGORY_COLORS[cat] }]}>
                    {CATEGORY_LABEL[cat].toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.sectionCount}>
                  {items.reduce((sum, i) => sum + i.quantity, 0)}
                </Text>
              </TouchableOpacity>
              {!collapsed && items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  color={CATEGORY_COLORS[cat]}
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
                />
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
      {/* engine_Dev — armor-coating picker: works a vial's resist into a piece. */}
      <BrandedModal
        visible={armorCoatTarget !== null}
        title={armorCoatTarget ? `Apply ${armorCoatTarget.name} to armor` : ''}
        body={armorPickerBody}
        buttons={armorPickerButtons}
        onRequestClose={() => setArmorCoatTarget(null)}
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
  const slots: Array<{ name: string | null; qty: number }> = [];
  for (let i = 0; i < BANDOLIER_MAX; i++) {
    const id = ids[i];
    const item = id ? player.inventory.find((it) => it.id === id) : undefined;
    slots.push({ name: item?.name ?? null, qty: item?.quantity ?? 0 });
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
                onPress={() => removeFromBandolier(slot.name!)}
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
  hint: { color: '#7a705c', fontSize: 10, fontStyle: 'italic', marginBottom: 6 },
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
  slotAction: { color: '#7a705c', fontSize: 8, marginTop: 2 },
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
  isEquipped,
  equippedSlotLabel,
  fillSlotLabel,
  isPouched,
  isBandoliered,
  slotTaken,
  stripeColor,
  onPress,
}: {
  item: InventoryItem;
  color: string;
  isEquipped: boolean;
  equippedSlotLabel: string;
  fillSlotLabel: string;
  isPouched: boolean;
  isBandoliered: boolean;
  slotTaken: boolean;
  stripeColor: string | null;
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
          {isInferredInventoryItem(item) && (
            <Text style={[styles.rowInferredDiamond, { color: rarityHexColor(item.rarity) }]}>◆ </Text>
          )}
          <Text style={styles.rowName} numberOfLines={1}>
            {/* OTA-360 — a coated weapon shows its coated name
                ("Corrupted Battle Axe"); the underlying name is
                unchanged for stat lookup. */}
            {item.coating ? `${item.coating.label} ${item.name}` : item.name}
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
  row: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 4,
    overflow: 'hidden',
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
  rowQty: { color: '#cdbf99', fontSize: 12 },
  rowMetaRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  rowMeta: { color: '#7a705c', fontSize: 10, letterSpacing: 1 },
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
  rowReserved: { color: '#d97a7a', fontWeight: '700' },
  // OTA-360 — weapon-coating chip. Sickly green-violet so it reads as
  // an applied toxin distinct from the green damage-dice chip.
  rowCoating: { color: '#b08fd4', fontWeight: '700' },
  rowPouch: { color: '#c9a86a', fontWeight: '700' },
  rowBandolier: { color: '#e07a5f', fontWeight: '700' },
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
