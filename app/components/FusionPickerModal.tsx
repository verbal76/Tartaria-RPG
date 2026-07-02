// OTA — Fusion picker. The Crucible used to consume the player's ENTIRE reserved
// (♥) pool on one item. Now firing it opens this picker: choose 3–5 of your reserved
// pieces, optionally add a reserved faction catalyst (separate theme slot), pick
// whether to forge a WEAPON or ARMOR, then fuse — spending only what you selected.

import React, { useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, TouchableWithoutFeedback } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { eligibleInputs, fusionMaterialTags } from '../engine/itemFusion';
import type { InventoryItem } from '../engine/types';

const MIN_PICK = 3;
const MAX_PICK = 5;

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
  const [kind, setKind] = useState<'weapon' | 'armor'>('weapon');

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
  const pickedMats = new Set(pickedItems.flatMap((i) => fusionMaterialTags(i)));
  const distinctMats = Array.from(new Set(
    [...pickedItems, ...(catalystItem ? [catalystItem] : [])].flatMap((i) => fusionMaterialTags(i)),
  ));
  const nMats = distinctMats.length;
  // Every fusion needs DIFFERENT materials, so once you pick an item, hide the other
  // reserved pieces that would add no NEW material (same-material duplicates). You can
  // never assemble a same-type-only batch that fails the diversity gate. A picked item
  // always stays visible (so you can deselect it); an item that still adds at least one
  // uncovered material stays too.
  const visibleScraps = scraps.filter(
    (it) => picked.includes(it.id) || fusionMaterialTags(it).some((m) => !pickedMats.has(m)),
  );
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
                    return (
                      <Pressable key={it.id} onPress={() => toggle(it.id)} style={[styles.row, on && styles.rowOn, dim && styles.rowDim]}>
                        <Text style={[styles.check, on && styles.checkOn]}>{on ? '☑' : '☐'}</Text>
                        <Text style={styles.rowName} numberOfLines={1}>{it.name}</Text>
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
