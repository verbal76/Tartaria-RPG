import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Decorative tile that sits in the top-right slot of the exploration
// screen when no enemy is staged. Placeholder for the lore-guide crest
// art that the user will drop in as assets/icon.png later.
export function CrestPlaceholder() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.crest}>✧</Text>
      <Text style={styles.title}>TARTARIA</Text>
      <Text style={styles.subtitle}>realms</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crest: { color: '#c9a86a', fontSize: 40, marginBottom: 4 },
  title: { color: '#e6d8b3', fontSize: 14, letterSpacing: 4, fontWeight: '800' },
  subtitle: { color: '#7a705c', fontSize: 10, letterSpacing: 4 },
});
