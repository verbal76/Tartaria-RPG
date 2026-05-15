import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useGameStore } from '../state/gameStore';

export function TitleScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  const abandonGame = useGameStore((s) => s.abandonGame);

  const handleNew = () => {
    if (player) {
      Alert.alert('New Game', 'A save already exists. Abandon it?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Abandon', style: 'destructive', onPress: async () => {
          await abandonGame();
          setScreen('character_creation');
        }},
      ]);
    } else {
      setScreen('character_creation');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TARTARIA</Text>
      <Text style={styles.subtitle}>REALMS</Text>
      <Text style={styles.flavor}>A procedural narrative of the buried world.</Text>

      <View style={styles.menu}>
        {player ? (
          <TouchableOpacity style={styles.button} onPress={() => setScreen('exploration')}>
            <Text style={styles.buttonText}>Continue — {player.name}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.button} onPress={handleNew}>
          <Text style={styles.buttonText}>New Expedition</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => setScreen('log')}>
          <Text style={styles.buttonText}>Game Log</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => setScreen('lore')}>
          <Text style={styles.buttonText}>Lore Codex</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.footer}>v0.1.0  /  2148</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0908',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 44, color: '#e6d8b3', letterSpacing: 8, fontWeight: '800' },
  subtitle: { fontSize: 18, color: '#c9a86a', letterSpacing: 16, marginTop: -6 },
  flavor: { color: '#7a705c', fontSize: 13, marginTop: 16, fontStyle: 'italic', textAlign: 'center' },
  menu: { marginTop: 48, gap: 12, width: '100%', maxWidth: 320 },
  button: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 4,
  },
  buttonText: { color: '#e6d8b3', fontSize: 14, letterSpacing: 2 },
  footer: { position: 'absolute', bottom: 24, color: '#3a342c', fontSize: 11 },
});
