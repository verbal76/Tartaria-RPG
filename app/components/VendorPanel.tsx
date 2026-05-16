import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import type { VendorInstance } from '../engine/vendors';

interface Props {
  vendor: VendorInstance;
  playerTc: number;
  onBuy: (itemName: string) => void;
  onDismiss: () => void;
}

export function VendorPanel({ vendor, playerTc, onBuy, onDismiss }: Props) {
  const confirmBuy = (itemName: string, price: number) => {
    if (playerTc < price) {
      Alert.alert('Not enough TC', `${itemName} costs ${price}. You have ${playerTc}.`);
      return;
    }
    Alert.alert(
      'Buy from vendor',
      `Buy ${itemName} for ${price} TC? (You have ${playerTc})`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Buy', onPress: () => onBuy(itemName) },
      ],
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {vendor.name}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {vendor.title}
          </Text>
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={8}>
          <Text style={styles.dismiss}>leave ✕</Text>
        </TouchableOpacity>
      </View>
      {vendor.offers.length === 0 ? (
        <Text style={styles.empty}>The vendor's pack is empty. Nothing more to trade.</Text>
      ) : (
        <ScrollView style={styles.list} horizontal showsHorizontalScrollIndicator={false}>
          {vendor.offers.map((o, i) => {
            const canAfford = playerTc >= o.price;
            return (
              <TouchableOpacity
                key={`${o.itemName}_${i}`}
                style={[styles.item, !canAfford && styles.itemBroke]}
                onPress={() => confirmBuy(o.itemName, o.price)}
                activeOpacity={0.7}
              >
                <Text style={styles.itemName} numberOfLines={1}>
                  {o.itemName}
                </Text>
                <Text style={[styles.itemPrice, !canAfford && styles.itemPriceBroke]}>
                  {o.price} TC
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  name: { color: '#c9a86a', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  dismiss: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  list: { },
  item: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 6,
    minWidth: 130,
  },
  itemBroke: { opacity: 0.45 },
  itemName: { color: '#e6d8b3', fontSize: 12, fontWeight: '600' },
  itemPrice: { color: '#c9a86a', fontSize: 11, marginTop: 2, letterSpacing: 1 },
  itemPriceBroke: { color: '#7a705c' },
  empty: { color: '#7a705c', fontSize: 12, fontStyle: 'italic' },
});
