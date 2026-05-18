import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { BrandedModal } from '../components/BrandedModal';
import { getItemPreview } from '../components/itemPreview';
import { sellPriceFor, isUnsellable } from '../engine/sellPrice';

function rarityColor(rarity: string | null | undefined): string {
  switch (rarity) {
    case 'Legendary': return '#e07a5f';
    case 'Rare': return '#b88ce0';
    case 'Uncommon': return '#9ec96a';
    default: return '#c9a86a';
  }
}

type Mode = 'buy' | 'sell';
type Pending =
  | { mode: 'buy'; itemName: string; price: number }
  | { mode: 'sell'; itemName: string; price: number }
  | { mode: 'dismiss' }
  | null;

export function VendorScreen() {
  const player = useGameStore((s) => s.player);
  const scene = useGameStore((s) => s.currentScene);
  const setScreen = useGameStore((s) => s.setScreen);
  const buyFromVendor = useGameStore((s) => s.buyFromVendor);
  const sellToVendor = useGameStore((s) => s.sellToVendor);
  const dismissVendor = useGameStore((s) => s.dismissVendor);

  const [mode, setMode] = useState<Mode>('buy');
  const [pending, setPending] = useState<Pending>(null);

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

  const openBuy = (itemName: string, price: number) => setPending({ mode: 'buy', itemName, price });
  const openSell = (itemName: string, price: number) => setPending({ mode: 'sell', itemName, price });
  const openDismiss = () => setPending({ mode: 'dismiss' });
  const cancel = () => setPending(null);
  const confirmAction = () => {
    if (!pending) return;
    if (pending.mode === 'buy') buyFromVendor(pending.itemName);
    else if (pending.mode === 'sell') sellToVendor(pending.itemName);
    else if (pending.mode === 'dismiss') dismissVendor();
    setPending(null);
  };

  const preview = pending && pending.mode !== 'dismiss'
    ? getItemPreview(pending.itemName)
    : null;
  const canAffordPending = pending?.mode === 'buy' ? player.tc >= pending.price : true;
  // Inventory items the player can sell — exclude equipped + unsellable.
  const equippedNames = new Set(
    Object.values(player.equipped ?? {}).filter((n): n is string => !!n),
  );
  const [sellSort, setSellSort] = useState<'name' | 'value' | 'rarity'>('value');
  // HANDOFF #12 — sell-back UI polish. Sort options so the player can
  // surface the most valuable junk first (default), alphabetize for
  // hunting, or group by rarity for clearing low-tier clutter.
  const RARITY_ORDER: Record<string, number> = { Legendary: 0, Rare: 1, Uncommon: 2, Common: 3 };
  const sellable = player.inventory
    .filter((i) => i.quantity > 0 && !equippedNames.has(i.name) && !isUnsellable(i))
    .map((i) => ({ item: i, price: sellPriceFor(i, vendor) }))
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
      </View>

      <View style={styles.walletRow}>
        <Text style={styles.walletLabel}>Your purse</Text>
        <Text style={styles.walletValue}>{player.tc} TC</Text>
      </View>

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
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {mode === 'buy' ? (
          vendor.offers.length === 0 ? (
            <Text style={styles.empty}>The vendor's pack is empty. Nothing more to trade.</Text>
          ) : (
            vendor.offers.map((o, i) => {
              const canAfford = player.tc >= o.price;
              const itemPreview = getItemPreview(o.itemName);
              const owned = player.inventory
                .filter((inv) => inv.name.toLowerCase() === o.itemName.toLowerCase())
                .reduce((sum, inv) => sum + inv.quantity, 0);
              return (
                <TouchableOpacity
                  key={`buy_${o.itemName}_${i}`}
                  style={[styles.offerRow, !canAfford && styles.offerRowBroke]}
                  onPress={() => openBuy(o.itemName, o.price)}
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
          )
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
              sellable.map(({ item, price }) => {
              const preview = getItemPreview(item.name);
              return (
                <TouchableOpacity
                  key={`sell_${item.id}`}
                  style={styles.offerRow}
                  onPress={() => openSell(item.name, price)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.offerStripe, { backgroundColor: rarityColor(preview.rarity) }]} />
                  <View style={styles.offerBody}>
                    <View style={styles.offerHead}>
                      <Text style={styles.offerName} numberOfLines={1}>
                        {item.name}{item.quantity > 1 ? ` (x${item.quantity})` : ''}
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
                  </View>
                </TouchableOpacity>
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
              : canAffordPending
                ? `Buy from ${vendor.name}`
                : 'Not enough TC'
        }
        itemPreview={preview}
        contextLine={
          pending?.mode === 'dismiss'
            ? 'They leave the scene. New offers will come from the next vendor who shows up.'
            : pending?.mode === 'sell'
              ? `Price: +${pending.price} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc + pending.price} TC`
              : pending?.mode === 'buy'
                ? canAffordPending
                  ? `Price: ${pending.price} TC   ·   You have: ${player.tc} TC   →   After: ${player.tc - pending.price} TC`
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
                  { label: 'Sell', onPress: confirmAction, tone: 'primary' },
                ]
              : pending?.mode === 'buy' && canAffordPending
                ? [
                    { label: 'Cancel', onPress: cancel, tone: 'neutral' },
                    { label: 'Buy', onPress: confirmAction, tone: 'primary' },
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
  sortTabText: { color: '#7a705c', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
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
