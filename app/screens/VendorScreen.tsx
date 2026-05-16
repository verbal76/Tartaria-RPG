import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from '../components/BrandedModal';
import { getItemPreview } from '../components/itemPreview';

function rarityColor(rarity: string | null | undefined): string {
  switch (rarity) {
    case 'Legendary': return '#e07a5f';
    case 'Rare': return '#b88ce0';
    case 'Uncommon': return '#9ec96a';
    default: return '#c9a86a';
  }
}

export function VendorScreen() {
  const player = useGameStore((s) => s.player);
  const scene = useGameStore((s) => s.currentScene);
  const setScreen = useGameStore((s) => s.setScreen);
  const buyFromVendor = useGameStore((s) => s.buyFromVendor);

  const [pending, setPending] = useState<{ itemName: string; price: number } | null>(null);

  const vendor = scene?.vendor ?? null;

  if (!player || !vendor) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No vendor is present.</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setScreen('exploration')}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const openConfirm = (itemName: string, price: number) => setPending({ itemName, price });
  const cancel = () => setPending(null);
  const confirmBuy = () => {
    if (!pending) return;
    buyFromVendor(pending.itemName);
    setPending(null);
  };

  const preview = pending ? getItemPreview(pending.itemName) : null;
  const canAffordPending = pending ? player.tc >= pending.price : false;

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
        <Text style={styles.title}>SHOP</Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={styles.vendorCard}>
        <Text style={styles.vendorName}>{vendor.name}</Text>
        <Text style={styles.vendorTitle}>{vendor.title}</Text>
        <Text style={styles.vendorDesc}>{vendor.description}</Text>
      </View>

      <View style={styles.walletRow}>
        <Text style={styles.walletLabel}>Your purse</Text>
        <Text style={styles.walletValue}>{player.tc} TC</Text>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {vendor.offers.length === 0 ? (
          <Text style={styles.empty}>The vendor's pack is empty. Nothing more to trade.</Text>
        ) : (
          vendor.offers.map((o, i) => {
            const canAfford = player.tc >= o.price;
            const itemPreview = getItemPreview(o.itemName);
            // Count how many of this item the player already owns so they
            // can see at a glance whether to bother buying another.
            const owned = player.inventory
              .filter((inv) => inv.name.toLowerCase() === o.itemName.toLowerCase())
              .reduce((sum, inv) => sum + inv.quantity, 0);
            return (
              <TouchableOpacity
                key={`${o.itemName}_${i}`}
                style={[styles.offerRow, !canAfford && styles.offerRowBroke]}
                onPress={() => openConfirm(o.itemName, o.price)}
                activeOpacity={0.7}
              >
                <View style={[styles.offerStripe, { backgroundColor: rarityColor(itemPreview.rarity) }]} />
                <View style={styles.offerBody}>
                  <View style={styles.offerHead}>
                    <Text style={styles.offerName} numberOfLines={1}>{o.itemName}</Text>
                    <Text style={[styles.offerPrice, !canAfford && styles.offerPriceBroke]}>
                      {o.price} TC
                    </Text>
                  </View>
                  <View style={styles.offerSubHead}>
                    <Text style={styles.offerKind} numberOfLines={1}>
                      {itemPreview.kindLabel}{itemPreview.rarity ? ` · ${itemPreview.rarity}` : ''}
                    </Text>
                    {owned > 0 && (
                      <Text style={styles.offerOwned}>you have {owned}</Text>
                    )}
                  </View>
                  {itemPreview.stats.length > 0 && (
                    <Text style={styles.offerStats} numberOfLines={2}>
                      {itemPreview.stats.join(' · ')}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <BrandedModal
        visible={pending !== null}
        title={canAffordPending ? `Buy from ${vendor.name}` : 'Not enough TC'}
        itemPreview={preview}
        contextLine={
          pending
            ? canAffordPending
              ? `Price: ${pending.price} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc - pending.price} TC`
              : `Price: ${pending.price} TC   ·   You only have ${player.tc} TC.`
            : undefined
        }
        buttons={
          canAffordPending
            ? [
                { label: 'Cancel', onPress: cancel, tone: 'neutral' },
                { label: 'Buy', onPress: confirmBuy, tone: 'primary' },
              ]
            : [{ label: 'OK', onPress: cancel, tone: 'neutral' }]
        }
        onRequestClose={cancel}
      />
    </View>
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
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  walletLabel: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  walletValue: { color: '#c9a86a', fontSize: 13, fontWeight: '700' },
  list: { flex: 1 },
  listContent: { paddingBottom: 12 },
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
  offerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  offerName: { color: '#e6d8b3', fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  offerPrice: { color: '#c9a86a', fontSize: 12, fontWeight: '700' },
  offerPriceBroke: { color: '#7a705c' },
  offerSubHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 },
  offerKind: { color: '#7a705c', fontSize: 10, letterSpacing: 1, flex: 1 },
  offerOwned: { color: '#9ec96a', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  offerStats: { color: '#cdbf99', fontSize: 11, marginTop: 4 },
  empty: { color: '#7a705c', fontStyle: 'italic', textAlign: 'center', marginTop: 40 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
});
