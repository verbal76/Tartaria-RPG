import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PlayerCharacter } from '../engine/types';
import racesData from '../data/races/races.json';
import { findArmorByName } from '../engine/crafting';
import { formatEffectSummary } from '../engine/statusEffects';

interface Props { player: PlayerCharacter; }

export function StatsPanel({ player }: Props) {
  const race = (racesData as { id: string; name: string }[]).find((r) => r.id === player.raceId);
  const factionStanding = player.factionStanding.find((f) => f.factionId === player.factionId)?.standing ?? 0;
  const equippedArmor = player.equipped?.armorName ? findArmorByName(player.equipped.armorName) : null;
  const effectiveAc = player.ac + (equippedArmor?.acBonus ?? 0);
  const equippedLabel = [player.equipped?.weaponName, player.equipped?.armorName].filter(Boolean).join(' · ');
  return (
    <View style={styles.container}>
      <Text style={styles.name}>{player.name}</Text>
      <Text style={styles.subline}>{race?.name ?? player.raceId}</Text>
      <View style={styles.row}>
        <Stat label="HP" value={`${player.hp}/${player.hpMax}`} />
        <Stat label="STA" value={`${player.stamina}/${player.staminaMax}`} />
        <Stat label="AC" value={`${effectiveAc}`} />
        <Stat label="TC" value={`${player.tc}`} />
        <Stat label="Corr" value={`${player.corruption}`} />
      </View>
      <View style={styles.row}>
        <Stat label="STR" value={`${player.stats.strength}`} />
        <Stat label="DEX" value={`${player.stats.dexterity}`} />
        <Stat label="INT" value={`${player.stats.intelligence}`} />
        <Stat label="WIS" value={`${player.stats.wisdom}`} />
        <Stat label="CHA" value={`${player.stats.charisma}`} />
      </View>
      <Text style={styles.equipped} numberOfLines={1}>
        {equippedLabel ? `Equipped: ${equippedLabel}` : 'Equipped: nothing'}
      </Text>
      {player.statusEffects && player.statusEffects.length > 0 && (
        <Text style={styles.effects} numberOfLines={1}>
          Effects: {formatEffectSummary(player.statusEffects)}
        </Text>
      )}
      <Text style={styles.subline}>Faction standing: {factionStanding}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
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
  },
  name: { color: '#e6d8b3', fontSize: 16, fontWeight: '700' },
  subline: { color: '#7a705c', fontSize: 11, marginBottom: 4 },
  equipped: { color: '#c9a86a', fontSize: 10, marginTop: 4, letterSpacing: 1 },
  effects: { color: '#e07a5f', fontSize: 10, marginTop: 2, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  stat: { flex: 1 },
  label: { color: '#7a705c', fontSize: 10 },
  value: { color: '#e6d8b3', fontSize: 13, fontWeight: '600' },
});
