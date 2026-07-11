// OTA — Fusion picker. The Crucible used to consume the player's ENTIRE reserved
// (♥) pool on one item. Now firing it opens this picker: choose 3–5 of your reserved
// pieces, optionally add a reserved faction catalyst (separate theme slot), pick
// whether to forge a WEAPON or ARMOR, then fuse — spending only what you selected.

import React, { useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, TouchableWithoutFeedback } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { eligibleInputs, fusionMaterialTags, visibleFusionInputs } from '../engine/itemFusion';
import type { InventoryItem } from '../engine/types';

const MIN_PICK = 3;
const MAX_PICK = 5;

// OTA-679 — the item's material type(s) for the picker row (metal / aether / organic
// / wood / stone / …), title-cased and joined. Mirrors the fusionMaterialTags the
// diversity gate uses, so what the player reads is exactly what fusion counts.
function fusionTypeLabel(item: InventoryItem): string {
  const mats = fusionMaterialTags(item);
  if (mats.length === 0) return 'misc';
  return mats.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(' · ');
}

export function FusionPickerModal() {
  const visible = useGameStore((s) => s.fusionPickerOpen);
  const inventory = useGameStore((s) => s.player?.inventory);
  const close = useGameStore((s) => s.closeFusionPicker);
  const confirm = useGameStore((s) => s.confirmFusionSelection);

  const scraps = useMemo<InventoryItem[]>(
    () => (inventory ? eligibleInputs(inventory) : []),
    [inventory],
  );
  const catalysts = useMemo<InventoryItem[]>(
    () => (inventory ?? []).filter((i) => i.reservedForFusion && (i.tags ?? []).includes('faction_gear')),
    [inventory],
  );

  const [picked, setPicked] = useState<string[]>([]);
  const [catalystId, setCatalystId] = useState<string | null>(null);
  const [kind, setKind] = useState<'weapon' | 'armor' | 'dog_armor'>('weapon');

  if (!visible) return null;

  const toggle = (id: string) => {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_PICK) return cur; // cap at 5
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
  const visibleScraps = visibleFusionInputs(scraps, picked, MIN_PICK);
  const predicted = nMats >= 4 ? 'Legendary' : nMats >= 3 ? 'Rare' : null;
  const canFuse = picked.length >= MIN_PICK && picked.length <= MAX_PICK;

  const onFuse = () => {
    if (!canFuse) return;
    confirm(picked, kind, catalystId ?? undefined);
    setPicked([]); setCatalystId(null); setKind('weapon');
  };
  const onClose = () => { setPicked([]); setCatalystId(null); setKind('weapon'); close(); };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => { /* swallow inner taps */ }}>
            <View style={styles.card}>
              <Text style={styles.title}>Fusing Crucible</Text>
              <Text style={styles.sub}>
                Pick {MIN_PICK}–{MAX_PICK} reserved pieces to spend ({picked.length} chosen), then forge.
              </Text>
              <Text style={styles.readout}>
                {nMats} material{nMats === 1 ? '' : 's'}{distinctMats.length ? ` (${distinctMats.join(', ')})` : ''} → {predicted ? `${predicted} result` : 'need 3+ DIFFERENT materials'}
              </Text>

              {scraps.length === 0 ? (
                <Text style={styles.empty}>No reserved (♥) materials. Heart items in your inventory first.</Text>
              ) : (
                <ScrollView style={styles.list} nestedScrollEnabled>
                  {visibleScraps.map((it) => {
                    const on = picked.includes(it.id);
                    const dim = !on && picked.length >= MAX_PICK;
                    // OTA-679 — show the item's MATERIAL TYPE (metal / aether / organic /
                    // wood / …) next to the name. Fusion needs DIFFERENT materials, so the
                    // type is the info the player actually picks on; rarity is secondary.
                    return (
                      <Pressable key={it.id} onPress={() => toggle(it.id)} style={[styles.row, on && styles.rowOn, dim && styles.rowDim]}>
                        <Text style={[styles.check, on && styles.checkOn]}>{on ? '☑' : '☐'}</Text>
                        <Text style={styles.rowName} numberOfLines={1}>{it.name}</Text>
                        <Text style={styles.rowType} numberOfLines={1}>{fusionTypeLabel(it)}</Text>
                        <Text style={styles.rowMeta}>{it.rarity}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {catalysts.length > 0 && (
                <View style={styles.catBlock}>
                  <Text style={styles.catLabel}>Faction catalyst (optional — themes the result)</Text>
                  {catalysts.map((c) => {
                    const on = catalystId === c.id;
                    return (
                      <Pressable key={c.id} onPress={() => setCatalystId(on ? null : c.id)} style={[styles.row, on && styles.rowOn]}>
                        <Text style={[styles.check, on && styles.checkOn]}>{on ? '◉' : '○'}</Text>
                        <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                        <Text style={styles.rowType} numberOfLines={1}>{fusionTypeLabel(c)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <Text style={styles.catLabel}>Forge as</Text>
              <View style={styles.kindRow}>
                <Pressable onPress={() => setKind('weapon')} style={[styles.kindBtn, kind === 'weapon' && styles.kindOn]}>
                  <Text style={[styles.kindTxt, kind === 'weapon' && styles.kindTxtOn]}>⚔ Weapon</Text>
                </Pressable>
                <Pressable onPress={() => setKind('armor')} style={[styles.kindBtn, kind === 'armor' && styles.kindOn]}>
                  <Text style={[styles.kindTxt, kind === 'armor' && styles.kindTxtOn]}>🛡 Armor</Text>
                </Pressable>
                {/* OTA-757 — third forge shape: a one-of-a-kind DOG VEST. The synth
                    already supports dog_armor; the picker just never offered it. */}
                <Pressable onPress={() => setKind('dog_armor')} style={[styles.kindBtn, kind === 'dog_armor' && styles.kindOn]}>
                  <Text style={[styles.kindTxt, kind === 'dog_armor' && styles.kindTxtOn]}>🐕 Dog</Text>
                </Pressable>
              </View>

              <View style={styles.actions}>
                <Pressable onPress={onClose} style={[styles.actBtn, styles.actNeutral]}>
                  <Text style={styles.actNeutralTxt}>Cancel</Text>
                </Pressable>
                <Pressable onPress={onFuse} disabled={!canFuse} style={[styles.actBtn, styles.actPrimary, !canFuse && styles.actDisabled]}>
                  <Text style={styles.actPrimaryTxt}>Fuse {picked.length > 0 ? `(${picked.length})` : ''}</Text>
                </Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#141c1e', borderColor: '#8fa6ac', borderWidth: 1.5, borderRadius: 8, padding: 16, maxHeight: '82%' },
  title: { color: '#d8b46a', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  sub: { color: '#9db2b8', fontSize: 12, marginTop: 4, marginBottom: 2 },
  readout: { color: '#d8b46a', fontSize: 11, fontWeight: '700', marginBottom: 8 },
  empty: { color: '#9db2b8', fontSize: 13, fontStyle: 'italic', paddingVertical: 16, textAlign: 'center' },
  list: { maxHeight: 260, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  rowOn: { backgroundColor: '#1e2f24', borderColor: '#3d5a2c' },
  rowDim: { opacity: 0.4 },
  check: { color: '#6c8088', fontSize: 16, width: 26 },
  checkOn: { color: '#9ec96a' },
  rowName: { color: '#d6e4e8', fontSize: 13, flex: 1 },
  // OTA-679 — material type: the primary decision info, so it reads brighter than
  // the (secondary) rarity. Right-aligned so the type column lines up down the list.
  rowType: { color: '#8fbfa8', fontSize: 11, fontWeight: '600', marginLeft: 8, textAlign: 'right' },
  rowMeta: { color: '#6c8088', fontSize: 10, marginLeft: 8 },
  catBlock: { marginTop: 6, borderTopColor: '#2b3a3e', borderTopWidth: 1, paddingTop: 6 },
  catLabel: { color: '#8fa6ac', fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginTop: 8, marginBottom: 4 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindBtn: { flex: 1, paddingVertical: 10, borderRadius: 4, borderWidth: 1, borderColor: '#2b3a3e', alignItems: 'center' },
  kindOn: { backgroundColor: '#26313a', borderColor: '#8fa6ac' },
  kindTxt: { color: '#9db2b8', fontSize: 13, fontWeight: '600' },
  kindTxtOn: { color: '#e8f0f2' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actBtn: { flex: 1, paddingVertical: 12, borderRadius: 4, alignItems: 'center' },
  actNeutral: { backgroundColor: '#26313a' },
  actNeutralTxt: { color: '#9db2b8', fontSize: 14, fontWeight: '600' },
  actPrimary: { backgroundColor: '#3d5a2c' },
  actPrimaryTxt: { color: '#e8f0f2', fontSize: 14, fontWeight: '700' },
  actDisabled: { opacity: 0.4 },
});
