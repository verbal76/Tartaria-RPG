import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PlayerCharacter } from '../engine/types';
import racesData from '../data/races/races.json';
import { findArmorByName } from '../engine/crafting';
import { ARMOR_SLOTS, effectiveStats } from '../engine/equipment';
import { formatEffectSummary } from '../engine/statusEffects';
import { findFactionQuestById } from '../engine/factionQuests';

interface Props { player: PlayerCharacter; }

export function StatsPanel({ player }: Props) {
  const race = (racesData as { id: string; name: string }[]).find((r) => r.id === player.raceId);
  const factionStanding = player.factionStanding.find((f) => f.factionId === player.factionId)?.standing ?? 0;

  // Effective AC = race base + summed armor bonus across head/chest/legs/feet.
  let armorAc = 0;
  for (const slot of ARMOR_SLOTS) {
    const name = player.equipped?.[slot];
    if (!name) continue;
    armorAc += findArmorByName(name)?.acBonus ?? 0;
  }
  const effectiveAc = player.ac + armorAc;

  // Stats with accessory + armor bonuses folded in so the player sees the
  // numbers combat will actually use.
  const eff = effectiveStats(player);

  // Compose a single-line summary of every filled slot so the panel
  // stays compact even with eight slots tracked.
  const slotParts: string[] = [];
  if (player.equipped?.main) slotParts.push(`R: ${player.equipped.main}`);
  if (player.equipped?.off) slotParts.push(`L: ${player.equipped.off}`);
  if (player.equipped?.head) slotParts.push(`Hd: ${player.equipped.head}`);
  if (player.equipped?.chest) slotParts.push(`Ch: ${player.equipped.chest}`);
  if (player.equipped?.legs) slotParts.push(`Lg: ${player.equipped.legs}`);
  if (player.equipped?.feet) slotParts.push(`Ft: ${player.equipped.feet}`);
  if (player.equipped?.amulet) slotParts.push(`Aml: ${player.equipped.amulet}`);
  if (player.equipped?.ring) slotParts.push(`Rg: ${player.equipped.ring}`);
  const equippedLabel = slotParts.length > 0 ? slotParts.join(' · ') : 'nothing';

  // OTA-145 — dog name displays on the same row as the player name,
  // right-aligned to the panel edge, when a dog is active. Hidden for
  // abandoned/dead/waiting dogs so the panel doesn't lie. Playtester:
  // "The dogs name should go on the same level as yours and aligned
  // right to the edge of the box."
  const dogShows = player.dog
    && player.dog.status !== 'abandoned'
    && player.dog.status !== 'dead';

  // OTA-145 — golem name displays under the dog name, right-aligned.
  // Playtester: "the golem.name.shluld be under the dogs in the
  // character box."
  const golemShows = !!player.golem && player.golem.hp > 0;

  return (
    <View style={styles.container}>
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
        {dogShows && player.dog ? (
          <Text style={styles.dogName} numberOfLines={1}>
            {player.dog.name} ({player.dog.hp}/{player.dog.hpMax})
          </Text>
        ) : null}
      </View>
      {golemShows && player.golem ? (
        <View style={styles.golemRow}>
          <Text style={styles.golemName} numberOfLines={1}>
            {player.golem.name} ({player.golem.hp}/{player.golem.hpMax})
          </Text>
        </View>
      ) : null}
      <Text style={styles.subline}>{race?.name ?? player.raceId}</Text>
      <View style={styles.row}>
        <Stat label="HP" value={`${player.hp}/${player.hpMax}`} />
        <Stat label="STA" value={`${player.stamina}/${player.staminaMax}`} />
        <Stat label="AC" value={`${effectiveAc}`} />
        <Stat label="TC" value={`${player.tc}`} />
        <Stat label="Corr" value={`${player.corruption}`} />
      </View>
      <View style={styles.row}>
        <Stat label="STR" value={formatStat(player.stats.strength, eff.strength)} />
        <Stat label="DEX" value={formatStat(player.stats.dexterity, eff.dexterity)} />
        <Stat label="INT" value={formatStat(player.stats.intelligence, eff.intelligence)} />
        <Stat label="WIS" value={formatStat(player.stats.wisdom, eff.wisdom)} />
        <Stat label="CHA" value={formatStat(player.stats.charisma, eff.charisma)} />
      </View>
      <Text style={styles.equipped} numberOfLines={4} ellipsizeMode="tail">
        Equipped: {equippedLabel}
      </Text>
      {player.statusEffects && player.statusEffects.length > 0 && (
        <Text style={styles.effects} numberOfLines={1}>
          Effects: {formatEffectSummary(player.statusEffects)}
        </Text>
      )}
      {player.companion && (
        <Text style={styles.companion} numberOfLines={1}>
          Companion: {player.companion.name}
        </Text>
      )}
      {(() => {
        const titles = (player.activeFactionQuestIds ?? [])
          .map((id) => findFactionQuestById(id)?.title)
          .filter((t): t is string => !!t);
        if (titles.length === 0) return null;
        return (
          <Text style={styles.contracts} numberOfLines={2}>
            Contracts: {titles.join(' · ')}
          </Text>
        );
      })()}
      <Text style={styles.subline}>Faction standing: {factionStanding}</Text>
      {/* OTA 040 — affordance for the new Player Sheet screen. Tap
          handler lives on the parent TouchableOpacity in
          ExplorationScreen.tsx; this is the visual cue. */}
      <Text style={styles.tapHint}>tap for full sheet ›</Text>
    </View>
  );
}

// Render a stat as "base" or "base (+bonus)" when gear boosts it.
function formatStat(base: number, effective: number): string {
  return effective > base ? `${effective} (+${effective - base})` : `${base}`;
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
    padding: 8,
    borderRadius: 4,
  },
  name: { color: '#e6d8b3', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  // OTA-145 — row holds player name (left, growing) + dog name
  // (right, fixed). flex layout pins the dog to the right edge.
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  dogName: { color: '#c9a86a', fontSize: 13, fontWeight: '600', flexShrink: 0, maxWidth: 160 },
  // OTA-145 — golem row sits right-aligned beneath the dog name row.
  // Slightly muted color (slate-mauve) so it reads as a secondary
  // companion vs the dog's warm-gold.
  golemRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  golemName: { color: '#9888a8', fontSize: 12, fontWeight: '600', maxWidth: 200 },
  subline: { color: '#7a705c', fontSize: 10, marginBottom: 2 },
  equipped: { color: '#c9a86a', fontSize: 9, marginTop: 3, letterSpacing: 0.5 },
  effects: { color: '#e07a5f', fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
  tapHint: { color: '#7a705c', fontSize: 8, marginTop: 4, letterSpacing: 0.5, fontStyle: 'italic', textAlign: 'right' },
  companion: { color: '#9ec96a', fontSize: 9, marginTop: 2, letterSpacing: 0.5, fontWeight: '700' },
  contracts: { color: '#9ec96a', fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 4, marginTop: 3 },
  stat: { flex: 1, minWidth: 0 },
  label: { color: '#7a705c', fontSize: 9 },
  value: { color: '#e6d8b3', fontSize: 12, fontWeight: '600' },
});
