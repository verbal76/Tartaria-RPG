import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Decorative tile that sits in the top-right slot of the exploration
// screen when no enemy is staged. Shows the Tartaria crest art.
export function CrestPlaceholder() {
  return (
    <View style={styles.wrap}>
      <Image
        source={require('../../assets/icon.png')}
        style={styles.crest}
        resizeMode="contain"
      />
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
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  crest: { width: '100%', height: '100%' },
});
