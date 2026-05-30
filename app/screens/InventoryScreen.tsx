import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import {
  CATEGORY_COLORS,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  groupInventoryByCategory,
} from '../components/InventoryCategorize';
import type { InventoryItem, EquipSlot } from '../engine/types';
import { validSlotsForItem, SLOT_LABEL } from '../engine/equipment';
import { canScrap } from '../engine/scrapEngine';
import { findWeaponByName } from '../engine/crafting';
import { BrandedModal } from '../components/BrandedModal';
import { getItemPreview } from '../components/itemPreview';
import { computeInventoryDelta, type InventoryDelta } from '../components/inventoryDelta';
import { needsRepair } from '../engine/durability';
import { repairCostMaterials } from '../engine/scrapEngine';
// 2026-05-30 OTA-064 — RECIPES tab moved to CraftingScreen as its
// 3rd tab (CRAFT / REPAIR / RECIPES) in OTA-059. OTA-064 then drops
// the Crafting REPAIR tab — field-repair now lives entirely in the
// pack item modal here.

export function InventoryScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  const equipItem = useGameStore((s) => s.equipItem);
  const unequipSlot = useGameStore((s) => s.unequipSlot);
  const dropInventoryItem = useGameStore((s) => s.dropInventoryItem);
  const useInventoryItem = useGameStore((s) => s.useInventoryItem);
  const scrapInventoryItem = useGameStore((s) => s.scrapInventoryItem);
  const repairInventoryItem = useGameStore((s) => s.repairInventoryItem);
  const repairNudgeShown = useGameStore((s) => s.worldMemory.repairNudgeShown ?? false);
  const markRepairNudgeShown = useGameStore((s) => s.markRepairNudgeShown);
  const triggerFirstUseNudge = useGameStore((s) => s.triggerFirstUseNudge);

  // OTA-066 — first inventory open gets the pack intro popup.
  useEffect(() => {
    triggerFirstUseNudge('inventory_intro');
  }, [triggerFirstUseNudge]);
  const [pending, setPending] = useState<{ item: InventoryItem; slots: EquipSlot[] } | null>(null);
  // After-scrap result list. When non-null, the action-modal body
  // switches from "Equip / Drop / Scrap" buttons to a "✦ Added to
  // pack" summary with a single CLOSE button. Cleared on next
  // item-tap.
  const [scrapResult, setScrapResult] = useState<InventoryDelta[] | null>(null);
  // Sub-modal: when set, replaces the equip modal with the repair material
  // checklist for the same item.
  const [repairFor, setRepairFor] = useState<InventoryItem | null>(null);
  const [showNudge, setShowNudge] = useState(false);

  // Fire the one-time nudge the first time the player opens the pack with
  // any worn-but-not-broken item. We mark it shown immediately so the
  // modal doesn't reopen if they tap dismiss and reopen the screen.
  const hasWornItem = useMemo(
    () => !!player?.inventory.some(needsRepair),
    [player?.inventory],
  );
  useEffect(() => {
    if (!repairNudgeShown && hasWornItem) {
      setShowNudge(true);
      markRepairNudgeShown();
    }
  }, [repairNudgeShown, hasWornItem, markRepairNudgeShown]);

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No expedition is underway.</Text>
      </View>
    );
  }

  const grouped = groupInventoryByCategory(player.inventory);
  // Map equipped item name → the slot(s) it's currently in. Used so the
  // modal can offer Unequip on items already worn.
  const slotsByEquippedName = new Map<string, EquipSlot[]>();
  const allSlotPairs: Array<[EquipSlot, string | undefined]> = [
    ['main', player.equipped?.main],
    ['off', player.equipped?.off],
    ['head', player.equipped?.head],
    ['chest', player.equipped?.chest],
    ['legs', player.equipped?.legs],
    ['feet', player.equipped?.feet],
    ['amulet', player.equipped?.amulet],
    ['ring', player.equipped?.ring],
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
    eq.mainId, eq.offId, eq.headId, eq.chestId,
    eq.legsId, eq.feetId, eq.amuletId, eq.ringId,
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
  const doScrap = () => {
    if (!pending) return;
    // Snapshot inventory BEFORE scrap so we can diff what landed.
    // scrapInventoryItem is synchronous, so by the time we re-read
    // useGameStore.getState() the mutation has already happened.
    const before = (useGameStore.getState().player?.inventory ?? []).map((i) => ({ ...i }));
    scrapInventoryItem(pending.item.name);
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
    const isConsumable = pending.item.kind === 'consumable';
    const offEligible = pending.slots.includes('off') && !equippedInSlots.includes('off');
    const anySlotFree = pending.slots.some((s) => !equippedInSlots.includes(s));
    if (isConsumable || (anySlotFree && (offEligible || pending.slots.length > 0))) {
      buttons.push({
        label: isConsumable ? 'Use (eat)' : (offEligible ? 'Use (off hand)' : 'Use'),
        onPress: doUse,
        tone: 'primary',
      });
    }
    // REPAIR — only when the item is worn. Opens the material modal.
    if (needsRepair(pending.item)) {
      buttons.push({
        label: 'Repair',
        onPress: () => {
          const item = pending.item;
          setPending(null);
          setRepairFor(item);
        },
        tone: 'primary',
      });
    }
    // SCRAP — only for built items with material content. Hidden for
    // raw stock (already material) and for items currently equipped
    // (would leave a phantom slot).
    if (canScrap(pending.item) && equippedInSlots.length === 0) {
      buttons.push({
        label: 'Scrap',
        onPress: doScrap,
        tone: 'destructive',
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
  let modalPreview: ReturnType<typeof getItemPreview> | null = null;
  if (pending) {
    try { modalPreview = getItemPreview(pending.item.name); }
    catch { modalPreview = null; }
  }

  // Build the repair sub-modal's checklist. Re-reads inventory off the
  // live player so material counts stay accurate after consumption.
  const repairChecklistData = repairFor
    ? (() => {
        const cost = repairCostMaterials(repairFor);
        const lines = cost.map((c) => {
          const have = player.inventory
            .filter((i) => i.name.toLowerCase() === c.name.toLowerCase())
            .reduce((s, i) => s + i.quantity, 0);
          return { name: c.name, need: c.quantity, have, ok: have >= c.quantity };
        });
        return { lines, canRepair: lines.length > 0 && lines.every((l) => l.ok) };
      })()
    : null;
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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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
        buttons={scrapResultButtons ?? buildModalButtons()}
        onRequestClose={closeModal}
      />

      <BrandedModal
        visible={repairFor !== null}
        title={repairFor ? `Repair ${repairFor.name}` : ''}
        bodyNode={
          repairChecklistData ? (
            <View style={styles.repairList}>
              <Text style={styles.repairIntro}>Requires:</Text>
              {repairChecklistData.lines.map((l) => (
                <Text
                  key={l.name}
                  style={[styles.repairLine, l.ok ? styles.repairOk : styles.repairMissing]}
                >
                  · {l.name} {l.have}/{l.need}
                </Text>
              ))}
            </View>
          ) : null
        }
        buttons={[
          {
            label: 'Repair',
            tone: 'primary',
            onPress: () => {
              if (!repairFor) return;
              if (repairChecklistData?.canRepair) {
                repairInventoryItem(repairFor.id);
              }
              setRepairFor(null);
            },
          },
          { label: 'Close', tone: 'neutral', onPress: () => setRepairFor(null) },
        ]}
        onRequestClose={() => setRepairFor(null)}
      />

      <BrandedModal
        visible={showNudge}
        title="Wear & Repair"
        body={
          "Items in your pack outlined in red are worn and need repair. Tap the item, then choose Repair — the modal will show what materials are required."
        }
        buttons={[{ label: 'Got it', tone: 'primary', onPress: () => setShowNudge(false) }]}
        onRequestClose={() => setShowNudge(false)}
      />
    </View>
  );
}

function ItemRow({
  item,
  color,
  isEquipped,
  onPress,
}: {
  item: InventoryItem;
  color: string;
  isEquipped: boolean;
  onPress: () => void;
}) {
  const canEquip = validSlotsForItem(item).length > 0;
  const worn = needsRepair(item);
  return (
    <TouchableOpacity
      style={[styles.row, worn && styles.rowNeedsRepair]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rowStripe, { backgroundColor: color }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowQty}>×{item.quantity}</Text>
        </View>
        <View style={styles.rowMetaRow}>
          {item.rarity && <Text style={styles.rowMeta}>{item.rarity}</Text>}
          {/* OTA 028 — surface the weapon's damage dice next to
              durability so the player can compare swords at a
              glance without opening a details modal. Playtester:
              "I want to see the weapon durability and I also want
              to see the attack dice roll like a 1d10 or a 1d20.
              That's how I know which weapon is the strongest." */}
          {(() => {
            const w = findWeaponByName(item.name);
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
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
  rowQty: { color: '#cdbf99', fontSize: 12 },
  rowMetaRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  rowMeta: { color: '#7a705c', fontSize: 10, letterSpacing: 1 },
  rowDurabilityLow: { color: '#e07a5f' },
  // OTA 028 — damage dice chip in green so it pops as the
  // "how hard does this hit" signal at a glance.
  rowDamage: { color: '#9ec96a' },
  rowNeedsRepair: { borderColor: '#e07a5f', borderWidth: 1 },
  repairList: { marginBottom: 4, gap: 4 },
  repairIntro: { color: '#cdbf99', fontSize: 12, letterSpacing: 1, marginBottom: 4 },
  repairLine: { fontSize: 13, letterSpacing: 1 },
  repairOk: { color: '#9ec96a' },
  repairMissing: { color: '#e07a5f' },
  rowEquipped: { color: '#c9a86a', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  rowEquippable: { color: '#7a705c', fontSize: 10, letterSpacing: 1, fontStyle: 'italic' },
  empty: { color: '#7a705c', fontStyle: 'italic', textAlign: 'center', marginTop: 30 },
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
