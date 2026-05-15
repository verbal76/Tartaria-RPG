import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { InventoryItem } from '../engine/types';

interface Props { items: InventoryItem[]; }

export function InventoryPanel({ items }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pack</Text>
      <ScrollView style={styles.list}>
        {items.length === 0 ? (
          <Text style={styles.empty}>Empty.</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.qty}>x{item.quantity}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    padding: 10,
    borderRadius: 4,
    flex: 1,
  },
  title: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  list: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  name: { color: '#cdbf99', fontSize: 12, flexShrink: 1 },
  qty: { color: '#7a705c', fontSize: 12, marginLeft: 6 },
  empty: { color: '#5a5246', fontSize: 11, fontStyle: 'italic' },
});
