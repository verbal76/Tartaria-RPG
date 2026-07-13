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
//
// OTA 456 — Places entries become tap-to-route. Tapping a Place
// pops a confirmation: "Plan a route to <name>?" — yes calls
// gameStore.setTravelCourse(id) and switches to the exploration
// screen, matching the in-game `travel to <name>` flow. Tap-to-route
// only activates when there's an active player (so the title-screen
// host still renders the entries as info-only).

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { BrandedModal } from './BrandedModal';
import locationsData from '../data/locations/locations.json';
import { getRaces, getFactions } from '../engine/character';
import { resolveTable, getNarratorName } from '../engine/contentPack';
import type { Faction, Race, Location } from '../engine/types';
import { useGameStore } from '../state/gameStore';
import { revealedLocationName, isLocationRevealed, isHiddenLocation } from '../engine/hiddenLocations';

type Section = 'races' | 'factions' | 'places';

export function LoreCodexBody() {
  // engine_Dev — the Timeline tab is REMOVED. It was the one Codex section with
  // no upload path: it imported the built-in timeline JSON directly, so any game
  // that didn't override BOTH locations and factions still showed the built-in
  // events. Races/factions/places all resolve through the content pack.
  const SECTIONS: Section[] = ['races', 'factions', 'places'];
  const [section, setSection] = useState<Section>('races');
  const [pendingRoute, setPendingRoute] = useState<Location | null>(null);
  // 2026-05-25 — branded refusal modal for the hub-room gate.
  // Replaces the native Alert.alert that was breaking the dark
  // theme on the title-screen path.
  const [hubRefusalDest, setHubRefusalDest] = useState<string | null>(null);
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  const setTravelCourse = useGameStore((s) => s.setTravelCourse);
  const appendLog = useGameStore((s) => s.appendLog);
  // OTA-498 — hidden locations (the Hidden Market) read as "?" here too until visited.
  const discoveredIds = useGameStore((s) => s.worldMemory?.discoveredLocationIds);

  const canPlanRoute = !!player;
  const here = player?.currentLocationId ?? null;

  const confirmRoute = () => {
    if (!pendingRoute || !player) return;
    const id = pendingRoute.id;
    setPendingRoute(null);
    // OTA 458 — refuse the route when the player is still inside a hub
    // room. setTravelCourse reads currentLocationId (the macro tile
    // under the hub) and would step the player onto a procedural tile
    // while hubRoomId is still set, leaving the scene in a half-state.
    // The player has to leave the outpost first — same gate the
    // cardinal-travel handler applies for outdoor moves from hubs.
    if (player.hubRoomId) {
      // 2026-05-25 — branded modal replaces the OS Alert. Same copy
      // / same behavior on dismiss (back to exploration), just in
      // the dark+amber palette the rest of the game uses.
      setHubRefusalDest(pendingRoute.name);
      return;
    }
    setTravelCourse(id);
    setScreen('exploration');
  };

  return (
    <View style={styles.bodyWrap}>
      <View style={styles.tabs}>
        {SECTIONS.map((s) => (
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
        {section === 'races' && (getRaces() as Race[]).map((r) => {
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
        {section === 'factions' && (getFactions() as Faction[]).map((f) => (
          <View key={f.id} style={styles.entry}>
            <Text style={styles.name}>{f.name}</Text>
            <Text style={styles.subtitle}>{f.subtitle}</Text>
            <Text style={styles.desc}>Goal: {f.goal}</Text>
            <Text style={styles.desc}>{f.philosophy}</Text>
            <Text style={styles.meta}>Structure: {f.structure}</Text>
            <Text style={styles.meta}>Join: {f.joinRequirements}</Text>
          </View>
        ))}
        {section === 'places' && (resolveTable('locations', locationsData as Location[]) as Location[]).map((l) => {
          const atHere = canPlanRoute && l.id === here;
          const hidden = isHiddenLocation(l.id) && !isLocationRevealed(l.id, discoveredIds);
          const content = (
            <>
              <Text style={styles.name}>{revealedLocationName(l.id, l.name, discoveredIds)}</Text>
              <Text style={styles.subtitle}>{hidden ? 'unknown — travel to reveal' : l.type}</Text>
              <Text style={styles.desc}>{hidden ? 'A place that keeps no name on any map until you find it yourself.' : l.description}</Text>
              <Text style={styles.meta}>Danger {l.danger}/5</Text>
              {canPlanRoute ? (
                <Text style={styles.tapHint}>
                  {atHere ? '· you are here ·' : '▸ tap to plan a route'}
                </Text>
              ) : null}
            </>
          );
          if (!canPlanRoute || atHere) {
            return <View key={l.id} style={styles.entry}>{content}</View>;
          }
          return (
            <TouchableOpacity
              key={l.id}
              style={styles.entry}
              activeOpacity={0.7}
              onPress={() => setPendingRoute(l)}
            >
              {content}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal
        visible={!!pendingRoute}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingRoute(null)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>PLAN A ROUTE</Text>
            <Text style={styles.modalBody}>
              Set course for {pendingRoute?.name}? The {getNarratorName()} will
              start the walk and the travel row will replace your cardinal
              controls until you arrive or STOP.
            </Text>
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setPendingRoute(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGo]}
                onPress={confirmRoute}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnGoText}>SET COURSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2026-05-25 — branded refusal modal for hub-room gate.
          Same dark+amber palette as the rest of the game's popups. */}
      <BrandedModal
        visible={hubRefusalDest !== null}
        title="Leave the outpost first"
        body={hubRefusalDest
          ? `The ${getNarratorName()} can't chart you to ${hubRefusalDest} from inside the outpost. Walk through the gate (or type "leave outpost"), then tap Set Course again.`
          : undefined}
        buttons={[
          {
            label: 'OK',
            onPress: () => {
              setHubRefusalDest(null);
              setScreen('exploration');
            },
            tone: 'primary',
          },
        ]}
        onRequestClose={() => {
          setHubRefusalDest(null);
          setScreen('exploration');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bodyWrap: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 6, borderWidth: 1, borderColor: '#2b3a3e', borderRadius: 4, alignItems: 'center' },
  tabActive: { borderColor: '#6ab0c9' },
  tabText: { color: '#6c8088', fontSize: 11, letterSpacing: 2 },
  tabTextActive: { color: '#d6e4e8' },
  scroll: { flex: 1 },
  entry: { backgroundColor: '#0e1618', borderColor: '#2b3a3e', borderWidth: 1, padding: 10, borderRadius: 4, marginBottom: 8 },
  name: { color: '#d6e4e8', fontSize: 14, fontWeight: '700' },
  subtitle: { color: '#6ab0c9', fontSize: 11, marginBottom: 4 },
  desc: { color: '#bcd2db', fontSize: 12, lineHeight: 18, marginTop: 2 },
  meta: { color: '#6c8088', fontSize: 11, marginTop: 4 },
  trait: { color: '#a89a78', fontSize: 11, marginTop: 2 },
  tapHint: { color: '#6ab0c9', fontSize: 10, marginTop: 6, letterSpacing: 1 },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#131c1f',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 6,
    padding: 16,
  },
  modalTitle: {
    color: '#6ab0c9',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 10,
  },
  modalBody: {
    color: '#bcd2db',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalBtnGhost: {
    backgroundColor: '#0e1618',
    borderColor: '#2b3a3e',
  },
  modalBtnGhostText: {
    color: '#bcd2db',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },
  modalBtnGo: {
    backgroundColor: '#6ab0c9',
    borderColor: '#6ab0c9',
  },
  modalBtnGoText: {
    color: '#131c1f',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },
});
