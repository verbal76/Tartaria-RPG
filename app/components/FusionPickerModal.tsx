// OTA-1007 — Fusion picker. The Crucible used to consume the player's ENTIRE reserved
// (♥) pool on one item. Now firing it opens this picker: choose 3–5 of your reserved
// pieces, optionally add a reserved faction catalyst (separate theme slot), pick
// whether to forge a WEAPON or ARMOR, then fuse — spending only what you selected.

import React, { useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, TouchableWithoutFeedback } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { canonicalItemTags } from '../engine/crafting';
import { eligibleInputs, fusionMaterialTags, visibleFusionInputs } from '../engine/itemFusion';
import { isCoatableItem, coatingCapacity, coatedDisplayName } from '../engine/weaponCoating';
import { equippedInstanceIds } from '../engine/equipment';
import type { InventoryItem } from '../engine/types';

const MIN_PICK = 3;
const MAX_PICK = 5;
// OTA-873 — the "Upgrade weapon" mode costs EXACTLY this many reserved pieces.
const UPGRADE_PICK = 5;

// OTA-679 — the item's material type(s) for the picker row (metal / aether / organic
// / wood / stone / …), title-cased and joined. Mirrors the fusionMaterialTags the
// diversity gate uses, so what the player reads is exactly what fusion counts.
function fusionTypeLabel(item: InventoryItem): string {
  const mats = fusionMaterialTags(item);
  if (mats.length === 0) return 'misc';
  return mats.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(' · ');
}

type ForgeKind = 'weapon' | 'armor' | 'dog_armor' | 'upgrade';

export function FusionPickerModal() {
  const visible = useGameStore((s) => s.fusionPickerOpen);
  const inventory = useGameStore((s) => s.player?.inventory);
  const close = useGameStore((s) => s.closeFusionPicker);
  const confirm = useGameStore((s) => s.confirmFusionSelection);
  const upgradeCoating = useGameStore((s) => s.upgradeCoatingSlot);
  const player = useGameStore((s) => s.player);

  const scraps = useMemo<InventoryItem[]>(
    () => (inventory ? eligibleInputs(inventory) : []),
    [inventory],
  );
  const catalysts = useMemo<InventoryItem[]>(
    () => (inventory ?? []).filter((i) => i.reservedForFusion && canonicalItemTags(i).includes('faction_gear')),
    [inventory],
  );
  // OTA-873 — pieces eligible for a coating-channel upgrade. A single-instance
  // WEAPON that's coatable and not already dual-slot gains a 2nd coating slot; a
  // single-instance ARMOR / DOG-VEST not already upgraded gains +1 resist capacity.
  const isArmorPiece = (i: InventoryItem) =>
    i.kind === 'armor' || i.kind === 'dog_armor'
    || i.uniqueStats?.kind === 'armor' || i.uniqueStats?.kind === 'dog_armor';
  const upgradeable = useMemo<InventoryItem[]>(
    () => (inventory ?? []).filter((i) =>
      i.quantity === 1 && (
        (isCoatableItem(i) && coatingCapacity(i) < 2)
        || (isArmorPiece(i) && (i.resistCapBonus ?? 0) < 1)
      ),
    ),
    [inventory],
  );
  // OTA-1051 — the upgrade target list, grouped + badged (owner: "listed as all
  // armor that can be upgraded, then all weapons. and it should say which are
  // equipped. I want to be able to upgrade what I am wearing"). Worn pieces
  // sort first in each group and carry an EQUIPPED badge — same instance-id
  // resolver as the inventory badge, plus the dog's vest (worn on the dog,
  // never in a player slot).
  const equippedIds = useMemo<Set<string>>(
    () => (player ? equippedInstanceIds(player) : new Set<string>()),
    [player],
  );
  const isWorn = (i: InventoryItem): boolean => {
    if (equippedIds.has(i.id)) return true;
    const vestId = player?.dog?.equipped?.vestId ?? null;
    const vestName = player?.dog?.equipped?.vest ?? null;
    if (vestId) return i.id === vestId;
    return !!vestName && i.name === vestName;
  };
  const wornFirst = (a: InventoryItem, b: InventoryItem) => Number(isWorn(b)) - Number(isWorn(a));
  const upgradeableArmor = upgradeable.filter(isArmorPiece).sort(wornFirst);
  const upgradeableWeapons = upgradeable.filter((i) => !isArmorPiece(i)).sort(wornFirst);

  const [picked, setPicked] = useState<string[]>([]);
  const [catalystId, setCatalystId] = useState<string | null>(null);
  const [kind, setKind] = useState<ForgeKind>('weapon');
  // OTA-873 — two-stage flow for the upgrade: pick 5 materials, then pick the weapon.
  const [stage, setStage] = useState<'pick' | 'weapon'>('pick');

  if (!visible) return null;

  const isUpgrade = kind === 'upgrade';
  const pickCap = isUpgrade ? UPGRADE_PICK : MAX_PICK;

  const toggle = (id: string) => {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= pickCap) return cur; // cap
      return [...cur, id];
    });
  };

  const pickedItems = scraps.filter((i) => picked.includes(i.id));
  const catalystItem = catalystId ? catalysts.find((c) => c.id === catalystId) ?? null : null;
  const distinctMats = Array.from(new Set(
    [...pickedItems, ...(catalystItem ? [catalystItem] : [])].flatMap((i) => fusionMaterialTags(i)),
  ));
  const nMats = distinctMats.length;
  // Once you pick an item, hide the other reserved pieces that add no NEW material
  // (same-material duplicates) to steer toward diversity — but never so aggressively
  // that you can't reach the 3-item MINIMUM. A single material-rich piece (an Aetheric
  // Cog = metal+improvised+aether) can cover a whole pool's materials in two picks; the
  // naive declutter then hid ALL remaining filler and the Fuse button could never light
  // (OTA-682 deadlock read as "I still can't fuse"). visibleFusionInputs reveals filler
  // when you're short of MIN_PICK with nothing left that adds a new material.
  const visibleScraps = visibleFusionInputs(scraps, picked, isUpgrade ? UPGRADE_PICK : MIN_PICK);
  const predicted = nMats >= 4 ? 'Legendary' : nMats >= 3 ? 'Rare' : null;
  // OTA-873 — upgrade needs EXACTLY 5; a normal forge needs 3–5.
  // OTA-1007 — ...AND the diversity rule the STORE enforces on confirm. Gating on
  // count alone let the button light on three same-material pieces, which then
  // bounced off gateFusion ("The Crucible cools") — a lit button that doesn't
  // fuse. A lit FUSE now always fuses.
  const canFuse = isUpgrade
    ? picked.length === UPGRADE_PICK
    : picked.length >= MIN_PICK && picked.length <= MAX_PICK && nMats >= 3;

  const reset = () => { setPicked([]); setCatalystId(null); setKind('weapon'); setStage('pick'); };

  const onFuse = () => {
    if (!canFuse) return;
    if (isUpgrade) {
      // Move to weapon selection instead of forging a new item.
      setStage('weapon');
      return;
    }
    confirm(picked, kind as 'weapon' | 'armor' | 'dog_armor', catalystId ?? undefined);
    reset();
  };
  const onPickPiece = (pieceId: string) => {
    upgradeCoating(pieceId, picked);
    reset();
    close();
  };
  const onClose = () => { reset(); close(); };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.backdrop} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback onPress={() => { /* swallow inner taps */ }}>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">Fusing Crucible</Text>

              {stage === 'weapon' ? (
                // OTA-873 — upgrade stage 2: choose which piece gains the coating channel.
                // A weapon gains a 2nd coating slot; armor / a dog vest gains +1 resist slot.
                <>
                  <Text style={styles.sub}>
                    Choose the piece to gain a coating channel — a weapon gets a SECOND coating slot; armor or a dog vest gets room for one more worked-in resist. This spends your {UPGRADE_PICK} reserved pieces; it doesn't change the piece's AC, damage, or edge.
                  </Text>
                  {upgradeable.length === 0 ? (
                    <Text style={styles.empty}>No eligible piece. You need a single coatable weapon (blade / arrow-arm / bolt-caster) without two coating slots, or a piece of armor or a dog vest that hasn't been upgraded yet.</Text>
                  ) : (
                    <ScrollView style={styles.list} nestedScrollEnabled>
                      {/* OTA-1051 — grouped: ALL upgradeable armor (incl. dog vests), then
                          ALL weapons; worn pieces first in each group with an EQUIPPED
                          badge so upgrading what you're wearing is a deliberate,
                          visible choice. */}
                      {[
                        { label: 'ARMOR & VESTS', items: upgradeableArmor },
                        { label: 'WEAPONS', items: upgradeableWeapons },
                      ].map((section) => section.items.length === 0 ? null : (
                        <View key={section.label}>
                          <Text style={styles.sectionLabel}>{section.label}</Text>
                          {section.items.map((w) => {
                            const armor = isArmorPiece(w);
                            const worn = isWorn(w);
                            const onDog = worn && !equippedIds.has(w.id);
                            const detail = armor
                              ? `${(w.addedResists ?? []).length} resist${(w.addedResists ?? []).length === 1 ? '' : 's'} → +1 slot`
                              : w.coating ? `has ${w.coating.label.toLowerCase()} → +1 slot` : 'no coating yet → +1 slot';
                            return (
                              <Pressable key={w.id} onPress={() => onPickPiece(w.id)} style={[styles.row, styles.rowOn]} accessibilityRole="button" accessibilityLabel={`${w.name}${worn ? ', equipped' : ''}`}>
                                <View style={styles.rowNameWrap}>
                                  <Text style={[styles.rowName, styles.rowNameTight]} numberOfLines={1}>{armor ? w.name : coatedDisplayName(w)}</Text>
                                  {worn ? (
                                    <Text style={styles.equippedTag}>★ {onDog ? `ON ${(player?.dog?.name ?? 'THE DOG').toUpperCase()}` : 'EQUIPPED'}</Text>
                                  ) : null}
                                </View>
                                <Text style={styles.rowType} numberOfLines={1}>{detail}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ))}
                    </ScrollView>
                  )}
                  <View style={styles.actions}>
                    <Pressable onPress={() => setStage('pick')} style={[styles.actBtn, styles.actNeutral]} accessibilityRole="button">
                      <Text style={styles.actNeutralTxt}>← Back</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.sub}>
                    {isUpgrade
                      ? `Pick exactly ${UPGRADE_PICK} reserved pieces (${picked.length} chosen), then choose a weapon, armor piece, or dog vest to add a coating channel.`
                      : `Pick ${MIN_PICK}–${MAX_PICK} reserved pieces to spend (${picked.length} chosen), then forge.`}
                  </Text>
                  {isUpgrade ? (
                    <Text style={styles.readout}>
                      Upgrade — adds a coating channel (no rarity / AC / damage change). A weapon then carries two coatings that both bite on every hit; armor / a vest holds one more worked-in resist.
                    </Text>
                  ) : (
                    <Text style={styles.readout}>
                      {nMats} material{nMats === 1 ? '' : 's'}{distinctMats.length ? ` (${distinctMats.join(', ')})` : ''} → {predicted ? `${predicted} result` : 'need 3+ DIFFERENT materials'}
                    </Text>
                  )}

                  {scraps.length === 0 ? (
                    <Text style={styles.empty}>No reserved (♥) materials. Heart items in your inventory first.</Text>
                  ) : (
                    <ScrollView style={styles.list} nestedScrollEnabled>
                      {visibleScraps.map((it) => {
                        const on = picked.includes(it.id);
                        const dim = !on && picked.length >= pickCap;
                        // OTA-679 — show the item's MATERIAL TYPE (metal / aether / organic /
                        // wood / …) next to the name. Fusion needs DIFFERENT materials, so the
                        // type is the info the player actually picks on; rarity is secondary.
                        return (
                          <Pressable key={it.id} onPress={() => toggle(it.id)} style={[styles.row, on && styles.rowOn, dim && styles.rowDim]} accessibilityRole="button" accessibilityState={{ selected: on, disabled: dim }}>
                            <Text style={[styles.check, on && styles.checkOn]}>{on ? '☑' : '☐'}</Text>
                            <Text style={styles.rowName} numberOfLines={1}>{it.name}</Text>
                            <Text style={styles.rowType} numberOfLines={1}>{fusionTypeLabel(it)}</Text>
                            <Text style={styles.rowMeta}>{it.rarity}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}

                  {/* Faction catalyst themes a FORGED item — irrelevant to a coating-slot upgrade. */}
                  {!isUpgrade && catalysts.length > 0 && (
                    <View style={styles.catBlock}>
                      <Text style={styles.catLabel}>Faction catalyst (optional — themes the result)</Text>
                      {catalysts.map((c) => {
                        const on = catalystId === c.id;
                        return (
                          <Pressable key={c.id} onPress={() => setCatalystId(on ? null : c.id)} style={[styles.row, on && styles.rowOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                            <Text style={[styles.check, on && styles.checkOn]}>{on ? '◉' : '○'}</Text>
                            <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                            <Text style={styles.rowType} numberOfLines={1}>{fusionTypeLabel(c)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  <Text style={styles.catLabel}>{isUpgrade ? 'Mode' : 'Forge as'}</Text>
                  <View style={styles.kindRow}>
                    <Pressable onPress={() => setKind('weapon')} style={[styles.kindBtn, kind === 'weapon' && styles.kindOn]} accessibilityRole="button" accessibilityState={{ selected: kind === 'weapon' }}>
                      <Text style={[styles.kindTxt, kind === 'weapon' && styles.kindTxtOn]}>⚔ Weapon</Text>
                    </Pressable>
                    <Pressable onPress={() => setKind('armor')} style={[styles.kindBtn, kind === 'armor' && styles.kindOn]} accessibilityRole="button" accessibilityState={{ selected: kind === 'armor' }}>
                      <Text style={[styles.kindTxt, kind === 'armor' && styles.kindTxtOn]}>🛡 Armor</Text>
                    </Pressable>
                    {/* OTA-757 — third forge shape: a one-of-a-kind DOG VEST. */}
                    <Pressable onPress={() => setKind('dog_armor')} style={[styles.kindBtn, kind === 'dog_armor' && styles.kindOn]} accessibilityRole="button" accessibilityState={{ selected: kind === 'dog_armor' }}>
                      <Text style={[styles.kindTxt, kind === 'dog_armor' && styles.kindTxtOn]}>🐕 Dog</Text>
                    </Pressable>
                    {/* OTA-873 — fourth mode: upgrade an existing weapon with a 2nd coating slot. */}
                    <Pressable onPress={() => { setKind('upgrade'); setPicked((cur) => cur.slice(0, UPGRADE_PICK)); }} style={[styles.kindBtn, kind === 'upgrade' && styles.kindOn]} accessibilityRole="button" accessibilityState={{ selected: kind === 'upgrade' }}>
                      <Text style={[styles.kindTxt, kind === 'upgrade' && styles.kindTxtOn]}>⬆ Upgrade</Text>
                    </Pressable>
                  </View>

                  <View style={styles.actions}>
                    <Pressable onPress={onClose} style={[styles.actBtn, styles.actNeutral]} accessibilityRole="button">
                      <Text style={styles.actNeutralTxt}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={onFuse} disabled={!canFuse} style={[styles.actBtn, styles.actPrimary, !canFuse && styles.actDisabled]} accessibilityRole="button" accessibilityState={{ disabled: !canFuse }}>
                      <Text style={styles.actPrimaryTxt}>
                        {isUpgrade ? `Choose piece → ${picked.length}/${UPGRADE_PICK}` : `Fuse ${picked.length > 0 ? `(${picked.length})` : ''}`}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#17150f', borderColor: '#8aa0a4', borderWidth: 1.5, borderRadius: 8, padding: 16, maxHeight: '82%' },
  title: { color: '#d8b46a', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  sub: { color: '#a2977b', fontSize: 12, marginTop: 4, marginBottom: 2 },
  readout: { color: '#d8b46a', fontSize: 11, fontWeight: '700', marginBottom: 8 },
  empty: { color: '#a2977b', fontSize: 13, fontStyle: 'italic', paddingVertical: 16, textAlign: 'center' },
  list: { maxHeight: 260, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  rowOn: { backgroundColor: '#2a2620', borderColor: '#3d5a2c' },
  rowDim: { opacity: 0.4 },
  check: { color: '#a2977b', fontSize: 16, width: 26 },
  checkOn: { color: '#9ec96a' },
  rowName: { color: '#e6d8b3', fontSize: 13, flex: 1 },
  // OTA-679 — material type: the primary decision info, so it reads brighter than
  // the (secondary) rarity. Right-aligned so the type column lines up down the list.
  rowType: { color: '#9ec96a', fontSize: 11, fontWeight: '600', marginLeft: 8, textAlign: 'right' },
  rowMeta: { color: '#a2977b', fontSize: 10, marginLeft: 8 },
  // OTA-1051 — upgrade list grouping + worn badge (amber matches the
  // inventory EQUIPPED badge palette).
  sectionLabel: { color: '#8aa0a4', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 8, marginBottom: 4 },
  rowNameWrap: { flex: 1 },
  rowNameTight: { flex: 0 },
  equippedTag: { color: '#c9a86a', fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginTop: 2 },
  catBlock: { marginTop: 6, borderTopColor: '#3a342c', borderTopWidth: 1, paddingTop: 6 },
  catLabel: { color: '#8aa0a4', fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginTop: 8, marginBottom: 4 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindBtn: { flex: 1, paddingVertical: 10, borderRadius: 4, borderWidth: 1, borderColor: '#3a342c', alignItems: 'center' },
  kindOn: { backgroundColor: '#2a1f12', borderColor: '#8aa0a4' },
  kindTxt: { color: '#a2977b', fontSize: 13, fontWeight: '600' },
  kindTxtOn: { color: '#f0e6cc' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flex: 1, paddingVertical: 12, borderRadius: 4, alignItems: 'center' },
  actNeutral: { backgroundColor: '#2a1f12' },
  actNeutralTxt: { color: '#a2977b', fontSize: 14, fontWeight: '600' },
  actPrimary: { backgroundColor: '#3d5a2c' },
  actPrimaryTxt: { color: '#f0e6cc', fontSize: 14, fontWeight: '700' },
  actDisabled: { opacity: 0.4 },
});
