// v2.4.1 (OTA 046) — Lore Codex body component.
//
// Extracted from the original LoreScreen so the same content can
// render in TWO places:
//   1. The standalone LoreScreen (existing 'lore' route, unchanged
//      navigation contract)
//   2. As a tab inside the gear-icon AboutScreen, accessible from
//      both the title screen AND in-game (player request: "want it
//      always accessible from the gear icon").
//
// This component owns the section tabs (races / factions / places /
// timeline) and the scrollable entry list. No header — each host
// screen is responsible for its own back button + page chrome so the
// component can drop into either context cleanly.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import factionsData from '../data/factions/factions.json';
import racesData from '../data/races/races.json';
import locationsData from '../data/locations/locations.json';
import timelineData from '../data/events/timeline.json';
import type { Faction, Race, Location, TimelineEvent } from '../engine/types';

type Section = 'races' | 'factions' | 'places' | 'timeline';

export function LoreCodexBody() {
  const [section, setSection] = useState<Section>('races');

  return (
    <View style={styles.bodyWrap}>
      <View style={styles.tabs}>
        {(['races', 'factions', 'places', 'timeline'] as Section[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setSection(s)}
            style={[styles.tab, section === s && styles.tabActive]}
          >
            <Text style={[styles.tabText, section === s && styles.tabTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
        {section === 'races' && (racesData as Race[]).map((r) => {
          const statBumps = r.racialStatBonuses ?? {};
          const statBumpStrs = Object.entries(statBumps)
            .filter(([, v]) => (v ?? 0) !== 0)
            .map(([k, v]) => `${v! > 0 ? '+' : ''}${v} ${k.slice(0, 3).toUpperCase()}`);
          return (
            <View key={r.id} style={styles.entry}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.desc}>{r.description}</Text>
              <Text style={styles.meta}>COMBAT • AC {r.baseAC} • Barehand {r.barehandDamage}</Text>
              {r.racialACBonus && r.racialACBonus !== 'No inherent AC bonus' && (
                <Text style={styles.meta}>↳ {r.racialACBonus}</Text>
              )}
              {statBumpStrs.length > 0 && (
                <Text style={styles.meta}>STATS • {statBumpStrs.join(', ')} (always on)</Text>
              )}
              {r.traits.map((t, i) => <Text key={i} style={styles.trait}>• {t}</Text>)}
              <Text style={styles.meta}>KIT • {r.startingTCFormula} TC • HP bonus +{r.startingHPBonus}</Text>
            </View>
          );
        })}
        {section === 'factions' && (factionsData as Faction[]).map((f) => (
          <View key={f.id} style={styles.entry}>
            <Text style={styles.name}>{f.name}</Text>
            <Text style={styles.subtitle}>{f.subtitle}</Text>
            <Text style={styles.desc}>Goal: {f.goal}</Text>
            <Text style={styles.desc}>{f.philosophy}</Text>
            <Text style={styles.meta}>Structure: {f.structure}</Text>
            <Text style={styles.meta}>Join: {f.joinRequirements}</Text>
          </View>
        ))}
        {section === 'places' && (locationsData as Location[]).map((l) => (
          <View key={l.id} style={styles.entry}>
            <Text style={styles.name}>{l.name}</Text>
            <Text style={styles.subtitle}>{l.type}</Text>
            <Text style={styles.desc}>{l.description}</Text>
            <Text style={styles.meta}>Danger {l.danger}/5</Text>
          </View>
        ))}
        {section === 'timeline' && (timelineData as TimelineEvent[]).map((e) => (
          <View key={`${e.year}_${e.name}`} style={styles.entry}>
            <Text style={styles.name}>{e.year} — {e.name}</Text>
            <Text style={styles.subtitle}>{e.location} • {e.outcome}</Text>
            <Text style={styles.desc}>{e.summary}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyWrap: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 6, borderWidth: 1, borderColor: '#3a342c', borderRadius: 4, alignItems: 'center' },
  tabActive: { borderColor: '#c9a86a' },
  tabText: { color: '#7a705c', fontSize: 11, letterSpacing: 2 },
  tabTextActive: { color: '#e6d8b3' },
  scroll: { flex: 1 },
  entry: { backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, padding: 10, borderRadius: 4, marginBottom: 8 },
  name: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  subtitle: { color: '#c9a86a', fontSize: 11, marginBottom: 4 },
  desc: { color: '#cdbf99', fontSize: 12, lineHeight: 18, marginTop: 2 },
  meta: { color: '#7a705c', fontSize: 11, marginTop: 4 },
  trait: { color: '#a89a78', fontSize: 11, marginTop: 2 },
});
