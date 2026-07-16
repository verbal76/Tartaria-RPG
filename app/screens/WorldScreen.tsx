// OTA-849 [living world] — the WORLD view. One place to read the state of the
// waste that moves without you: every faction's current momentum on the World
// Pulse (rising / waning), your standing with each, and the running feed of
// rumours (the pulses that have fired, in-game and while you were away). This is
// where the previously-invisible tides finally surface — the Character sheet only
// tagged factions you already stood with; here you see the whole board.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import factionsData from '../data/factions/factions.json';
import type { Faction } from '../engine/types';
import { tideLabel } from '../engine/worldPulse';
import { pickBounty } from '../engine/factionBounty';
import { FACTION_STARTING_LOCATION } from '../engine/character';
import { getLocationById } from '../engine/encounter';

export function WorldScreen() {
  const player = useGameStore((s) => s.player);
  const worldMemory = useGameStore((s) => s.worldMemory);
  const setScreen = useGameStore((s) => s.setScreen);

  const factions = factionsData as Faction[];
  const tides = worldMemory?.factionTides ?? {};
  // OTA-851 — the board: the world-event feed (newest first), richer than the raw rumours.
  const events = [...(worldMemory?.worldEvents ?? [])].reverse();
  const rumors = [...(worldMemory?.worldRumors ?? [])].reverse(); // fallback if no events yet
  const patrolCount = (worldMemory?.patrols ?? []).length;
  const standingOf = (id: string) => player?.factionStanding.find((r) => r.factionId === id)?.standing ?? 0;
  // A small glyph per event kind so the board reads at a glance.
  const glyphFor = (kind: string): string => (
    { surge: '▲', setback: '▼', skirmish: '⚔', muster: '⚑', warband: '⚔', bounty: '◆',
      schism: '✂', truce: '☮', defector: '↩', pilgrimage: '⛨', caravan: '⛟', relic: '✦',
      market: '⚖', omen: '☄', purge: '✖', windfall: '✧', patrol_clash: '⚔', outpost_assault: '⌂', patrol_mauled: '☠' }[kind] ?? '🗞'
  );

  // OTA-850 — active bounty, or an offer to accept (routes the player to the quarry's outpost).
  const activeBounty = player?.activeBounty;
  const offer = !activeBounty && player
    ? pickBounty(
        factions,
        player.factionStanding,
        (fid) => FACTION_STARTING_LOCATION[fid],
        (loc) => getLocationById(loc).name ?? loc,
        tides,
      )
    : null;

  // Sort factions by momentum (most ascendant first), then name.
  const rows = [...factions].sort((a, b) => {
    const d = (tides[b.id] ?? 0) - (tides[a.id] ?? 0);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setScreen('exploration')} style={styles.backBtn} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>THE WORLD</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.intro}>
          The waste does not wait for you. Factions gain and lose ground on their own — while you
          play and while you are away. Here is where the power stands.
        </Text>

        {/* ── FACTION BOUNTY ────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>FACTION BOUNTY</Text>
        <View style={styles.card}>
          {activeBounty ? (
            <>
              <Text style={styles.bountyHead}>{activeBounty.giverName} — contract in progress</Text>
              <Text style={styles.bountyBody}>
                Hunt {activeBounty.targetName} near {activeBounty.targetLocationName}.
              </Text>
              <Text style={styles.bountyProgress}>
                {activeBounty.progress}/{activeBounty.count} put down · reward {activeBounty.rewardTc} TC
              </Text>
              <Text style={styles.bountyFoot}>↳ Their patrols work the ground near the outpost. Watch the road in.</Text>
            </>
          ) : offer ? (
            <>
              <Text style={styles.bountyHead}>{offer.giverName} have work for you</Text>
              <Text style={styles.bountyBody}>
                Put down {offer.count} of the {offer.targetName} at {offer.targetLocationName}. Pays {offer.rewardTc} TC
                and {offer.giverName} standing.
              </Text>
              <Text style={styles.bountyFoot}>↳ Accepting sets your course to {offer.targetLocationName} — patrolled ground.</Text>
              <TouchableOpacity
                style={styles.bountyBtn}
                activeOpacity={0.8}
                onPress={() => { useGameStore.getState().acceptBounty(offer); setScreen('exploration'); }}
              >
                <Text style={styles.bountyBtnText}>ACCEPT & SET COURSE ›</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.empty}>No bounties on offer. Earn a faction's favor (standing +10) and its enemies become your work.</Text>
          )}
        </View>

        {/* ── BALANCE OF POWER ──────────────────────────────────── */}
        <Text style={styles.sectionLabel}>BALANCE OF POWER</Text>
        <View style={styles.card}>
          {rows.map((f) => {
            const m = tides[f.id] ?? 0;
            const tag = tideLabel(m);
            const standing = standingOf(f.id);
            const tagColor = m > 0 ? '#9ec96a' : m < 0 ? '#c98a6a' : '#7a705c';
            const standColor = standing >= 20 ? '#9ec96a' : standing >= 0 ? '#cdbf99' : standing >= -10 ? '#c9a86a' : '#e07a5f';
            // A little momentum meter: −5…+5 mapped to a 11-cell bar with the center marked.
            const cells = Array.from({ length: 11 }, (_, i) => i - 5);
            return (
              <View key={f.id} style={styles.facRow}>
                <View style={styles.facHead}>
                  <Text style={styles.facName}>{f.name}</Text>
                  <Text style={[styles.facTag, { color: tagColor }]}>
                    {tag ? `${tag.glyph} ${tag.word}` : 'steady'}
                  </Text>
                </View>
                <View style={styles.meterRow}>
                  {cells.map((c) => {
                    const on = (m >= 0 && c > 0 && c <= m) || (m < 0 && c < 0 && c >= m);
                    const isCenter = c === 0;
                    return (
                      <Text
                        key={c}
                        style={[
                          styles.meterCell,
                          isCenter && styles.meterCenter,
                          on && (m > 0 ? styles.meterOnPos : styles.meterOnNeg),
                        ]}
                      >
                        {isCenter ? '│' : on ? '▮' : '·'}
                      </Text>
                    );
                  })}
                  <Text style={[styles.facStanding, { color: standColor }]}>
                    you {standing >= 0 ? '+' : ''}{standing}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={styles.footNote}>
            ↳ Momentum shifts a faction's reach: ascendant traders charge more, and a faction on
            the rise fields bigger raiding parties against those who side with its rivals.
          </Text>
        </View>

        {/* ── THE BOARD (world events) ──────────────────────────── */}
        <Text style={styles.sectionLabel}>THE BOARD — WORD ON THE WIND</Text>
        {patrolCount > 0 && (
          <Text style={styles.patrolNote}>⚑ {patrolCount} faction patrol{patrolCount === 1 ? '' : 's'} abroad in the waste.</Text>
        )}
        <View style={styles.card}>
          {events.length > 0 ? (
            events.map((e, i) => (
              <View key={i} style={styles.rumorRow}>
                <Text style={styles.rumorGlyph}>{glyphFor(e.kind)}</Text>
                <Text style={styles.rumorText}>{e.text}</Text>
              </View>
            ))
          ) : rumors.length > 0 ? (
            rumors.map((r, i) => (
              <View key={i} style={styles.rumorRow}>
                <Text style={styles.rumorGlyph}>🗞</Text>
                <Text style={styles.rumorText}>{r.text}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>The waste is quiet — for now. Give it time; the factions never rest long.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 4 },
  backBtn: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10, minWidth: 80, alignItems: 'center' },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  intro: { color: '#bcae88', fontSize: 12, lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  sectionLabel: { color: '#c9a86a', fontSize: 11, letterSpacing: 3, fontWeight: '700', marginTop: 12, marginBottom: 6, paddingHorizontal: 4 },
  card: { backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, padding: 12 },
  facRow: { paddingVertical: 7, borderBottomColor: '#1f1c18', borderBottomWidth: 1 },
  facHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  facName: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  facTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  meterRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  meterCell: { color: '#3a342c', fontSize: 12, width: 11, textAlign: 'center' },
  meterCenter: { color: '#7a705c' },
  meterOnPos: { color: '#9ec96a' },
  meterOnNeg: { color: '#c98a6a' },
  facStanding: { fontSize: 10, marginLeft: 8, letterSpacing: 0.3 },
  footNote: { color: '#7a705c', fontSize: 10, fontStyle: 'italic', marginTop: 8, lineHeight: 14 },
  patrolNote: { color: '#c98a6a', fontSize: 11, fontStyle: 'italic', marginBottom: 4, paddingHorizontal: 4 },
  rumorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  rumorGlyph: { fontSize: 12, width: 18, textAlign: 'center' },
  rumorText: { color: '#cdbf99', fontSize: 12, lineHeight: 17, flex: 1 },
  empty: { color: '#7a705c', fontSize: 12, fontStyle: 'italic' },
  // OTA-850 — bounty card.
  bountyHead: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', letterSpacing: 0.3, marginBottom: 3 },
  bountyBody: { color: '#cdbf99', fontSize: 12, lineHeight: 17 },
  bountyProgress: { color: '#9ec96a', fontSize: 12, fontWeight: '700', marginTop: 4 },
  bountyFoot: { color: '#c98a6a', fontSize: 10, fontStyle: 'italic', marginTop: 6, lineHeight: 14 },
  bountyBtn: { marginTop: 10, backgroundColor: '#c9a86a', borderRadius: 3, paddingVertical: 9, alignItems: 'center' },
  bountyBtnText: { color: '#13110f', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
});
