// OTA 040 — Player Sheet screen. Reached by tapping the top-left
// stats panel in the exploration HUD. Read-only — equip / unequip /
// use actions live on the inventory screen. This sheet's job is to
// show *what you are right now*, with every number broken down into
// its sources so the player can audit any surprising value.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';
import type { Faction, Race, PlayerCharacter, Stats } from '../engine/types';
import { effectiveStatsBreakdown, type StatBreakdown } from '../engine/equipment';
import { displayedProgressBar, displayedProgressPercent } from '../engine/statTraining';
import { effectiveAC, barehandDamageFor } from '../engine/raceMechanics';
import { corruptionTierOf, tierLabel, tierDescription } from '../engine/corruption';
import { getItemPreview } from '../components/itemPreview';
import { weatherStatModifiers } from '../engine/weatherEffects';
import { findFactionQuestById } from '../engine/factionQuests';
import { findHuntById } from '../engine/hunts';
import { findMysteryById } from '../engine/mysteries';

const STAT_LABEL: Record<keyof Stats, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

const SLOT_LABEL: Record<string, string> = {
  main: 'Main hand',
  off: 'Off hand',
  head: 'Head',
  chest: 'Chest',
  legs: 'Legs',
  feet: 'Feet',
  amulet: 'Amulet',
  ring: 'Ring',
};

export function CharacterScreen() {
  const player = useGameStore((s) => s.player);
  const scene = useGameStore((s) => s.currentScene);
  const worldMemory = useGameStore((s) => s.worldMemory);
  const setScreen = useGameStore((s) => s.setScreen);

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No character loaded.</Text>
      </View>
    );
  }

  const race = (racesData as Race[]).find((r) => r.id === player.raceId);
  const faction = (factionsData as Faction[]).find((f) => f.id === player.factionId);
  const factionStanding = player.factionStanding.find((f) => f.factionId === player.factionId)?.standing ?? 0;
  const hpPct = player.hpMax > 0 ? player.hp / player.hpMax : 0;
  const stamPct = player.staminaMax > 0 ? player.stamina / player.staminaMax : 0;
  const hpColor = hpPct > 0.5 ? '#9ec96a' : hpPct > 0.25 ? '#c9a86a' : '#e07a5f';
  const stamColor = stamPct > 0.4 ? '#9ec96a' : '#c9a86a';

  const breakdown = effectiveStatsBreakdown(player, weatherStatModifiers(scene?.weather ?? null));
  const acValue = effectiveAC(player, scene ?? null);
  const barehand = barehandDamageFor(player.raceId);
  const barehandStr = barehand.bonus === 0
    ? `${barehand.count}d${barehand.sides}`
    : `${barehand.count}d${barehand.sides}${barehand.bonus > 0 ? '+' : ''}${barehand.bonus}`;
  const tier = corruptionTierOf(player.corruption ?? 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>CHARACTER</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ── HEADER CARD ───────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.name}>{player.name}</Text>
          <Text style={styles.subline}>
            {race?.name ?? player.raceId}
            {faction ? ` · ${faction.name} (${factionStanding >= 0 ? '+' : ''}${factionStanding})` : ''}
          </Text>

          <View style={styles.barRow}>
            <Text style={styles.barLabel}>HP</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.max(0, hpPct * 100)}%`, backgroundColor: hpColor }]} />
            </View>
            <Text style={styles.barValue}>{player.hp}/{player.hpMax}</Text>
          </View>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>STA</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.max(0, stamPct * 100)}%`, backgroundColor: stamColor }]} />
            </View>
            <Text style={styles.barValue}>{player.stamina}/{player.staminaMax}</Text>
          </View>
        </View>

        {/* ── CORE STATS ────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>CORE STATS</Text>
        <View style={styles.card}>
          {(Object.keys(STAT_LABEL) as Array<keyof Stats>).map((s) => (
            <StatRow
              key={s}
              label={STAT_LABEL[s]}
              b={breakdown[s]}
              progressBar={displayedProgressBar(player, s)}
              progressPct={displayedProgressPercent(player, s)}
            />
          ))}
        </View>

        {/* ── DEFENSE & BAREHAND ────────────────────────────────── */}
        <Text style={styles.sectionTitle}>DEFENSE</Text>
        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Armor Class</Text>
            <Text style={styles.kvValue}>{acValue}</Text>
          </View>
          {race?.racialACBonus && race.racialACBonus !== 'No inherent AC bonus' && (
            <Text style={styles.kvSub}>↳ {race.racialACBonus}</Text>
          )}
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Barehand</Text>
            <Text style={styles.kvValue}>{barehandStr}</Text>
          </View>
          {barehand.hitGate && (
            <Text style={styles.kvSub}>↳ hit only on a {barehand.hitGate} d{barehand.sides}</Text>
          )}
        </View>

        {/* ── WALLET & CONDITION ────────────────────────────────── */}
        <Text style={styles.sectionTitle}>WALLET & CONDITION</Text>
        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>TC</Text>
            <Text style={styles.kvValue}>{player.tc}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Corruption</Text>
            <Text style={[styles.kvValue, tier === 'hollowed' && styles.danger, tier === 'corrupted' && styles.warning]}>
              {player.corruption} · {tierLabel(tier)}
            </Text>
          </View>
          <Text style={styles.kvSub}>↳ {tierDescription(tier)}</Text>
        </View>

        {/* ── EQUIPPED ──────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>EQUIPPED</Text>
        <View style={styles.card}>
          {(Object.keys(SLOT_LABEL) as Array<keyof typeof SLOT_LABEL>).map((slot) => {
            const name = (player.equipped as Record<string, string | undefined> | undefined)?.[slot];
            if (!name) {
              return (
                <View key={slot} style={styles.slotRow}>
                  <Text style={styles.slotLabel}>{SLOT_LABEL[slot]}</Text>
                  <Text style={styles.slotEmpty}>—</Text>
                </View>
              );
            }
            const preview = getItemPreview(name);
            return (
              <View key={slot} style={styles.slotRow}>
                <Text style={styles.slotLabel}>{SLOT_LABEL[slot]}</Text>
                <View style={styles.slotBody}>
                  <Text style={styles.slotName}>{name}</Text>
                  {preview.stats.length > 0 && (
                    <Text style={styles.slotMeta}>{preview.stats.join(' · ')}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* ── STATUS EFFECTS ────────────────────────────────────── */}
        {(player.statusEffects ?? []).length > 0 && (
          <>
            <Text style={styles.sectionTitle}>STATUS EFFECTS</Text>
            <View style={styles.card}>
              {(player.statusEffects ?? []).map((e, i) => (
                <View key={i} style={styles.effectRow}>
                  <Text style={styles.effectLabel}>{e.label ?? e.kind}</Text>
                  <Text style={styles.effectMeta}>{e.remainingRounds} round{e.remainingRounds === 1 ? '' : 's'} left</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── RACIAL TRAITS ─────────────────────────────────────── */}
        {race?.traits && race.traits.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>RACIAL TRAITS</Text>
            <View style={styles.card}>
              {race.traits.map((t, i) => (
                <Text key={i} style={styles.traitRow}>• {t}</Text>
              ))}
            </View>
          </>
        )}

        {/* ── ACTIVE CONTRACTS ─────────────────────────────────── */}
        {((player.activeFactionQuestIds?.length ?? 0)
          + (player.activeHunts?.length ?? 0)
          + (player.activeMysteries?.length ?? 0)) > 0 && (
          <>
            <Text style={styles.sectionTitle}>ACTIVE CONTRACTS</Text>
            <TouchableOpacity style={styles.card} onPress={() => setScreen('contracts')} activeOpacity={0.8}>
              {(player.activeFactionQuestIds ?? []).map((id) => {
                const q = findFactionQuestById(id);
                if (!q) return null;
                const rec = (player.activeFactionQuests ?? []).find((r) => r.id === id);
                return (
                  <Text key={id} style={styles.contractRow}>
                    · {q.title} (stage {(rec?.stage ?? 0) + 1}/{q.stages?.length ?? 1})
                  </Text>
                );
              })}
              {(player.activeHunts ?? []).map((rec) => {
                const h = findHuntById(rec.id);
                if (!h) return null;
                return (
                  <Text key={rec.id} style={styles.contractRow}>
                    · {h.title} (hunt, stage {rec.stage + 1}/{h.stages?.length ?? 1})
                  </Text>
                );
              })}
              {(player.activeMysteries ?? []).map((rec) => {
                const m = findMysteryById(rec.id);
                if (!m) return null;
                return (
                  <Text key={rec.id} style={styles.contractRow}>
                    · {m.title} (mystery, stage {rec.stage + 1}/{m.stages?.length ?? 1})
                  </Text>
                );
              })}
              <Text style={styles.contractTap}>tap to open full contract board ›</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── MILESTONES & MEMORY ──────────────────────────────── */}
        <Text style={styles.sectionTitle}>MILESTONES & MEMORY</Text>
        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Enemies defeated</Text>
            <Text style={styles.kvValue}>{player.milestones?.enemiesDefeated ?? 0}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Travels completed</Text>
            <Text style={styles.kvValue}>{player.milestones?.travelsCompleted ?? 0}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Checks succeeded</Text>
            <Text style={styles.kvValue}>{player.milestones?.checksSucceeded ?? 0}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Locations discovered</Text>
            <Text style={styles.kvValue}>{worldMemory?.discoveredLocationIds?.length ?? 0}</Text>
          </View>
        </View>

        <Text style={styles.footerHint}>Tap the top-left stats panel any time to return here.</Text>
      </ScrollView>
    </View>
  );
}

function StatRow({
  label,
  b,
  progressBar,
  progressPct,
}: {
  label: string;
  b: StatBreakdown;
  progressBar: string;
  progressPct: number;
}) {
  const hasSources = b.sources.length > 0;
  return (
    <View style={styles.statRow}>
      <Text style={styles.statKey}>{label}</Text>
      <View style={styles.statBody}>
        <Text style={styles.statTotal}>
          {b.total}
          {hasSources && <Text style={styles.statBase}>  (base {b.base})</Text>}
        </Text>
        {/* OTA 058 — use-based growth bar. Quantized to quarters
            so the player sees changes at 25/50/75/100 — not every
            single use. The label reads e.g. "▮▮▯▯  50%". */}
        <Text style={styles.progressBar}>
          {progressBar}  <Text style={styles.progressPct}>{progressPct}%</Text>
        </Text>
        {hasSources && (
          <View style={styles.chipRow}>
            {b.sources.map((s, i) => (
              <View key={i} style={[styles.chip, s.delta < 0 && styles.chipNeg]}>
                <Text style={[styles.chipText, s.delta < 0 && styles.chipTextNeg]}>
                  {s.delta > 0 ? '+' : ''}{s.delta} {s.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
  backBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  sectionTitle: {
    color: '#c9a86a',
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
  },

  name: { color: '#e6d8b3', fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  subline: { color: '#7a705c', fontSize: 12, letterSpacing: 1, marginTop: 2, marginBottom: 10 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  barLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 1, width: 30 },
  barBg: { flex: 1, height: 8, backgroundColor: '#1a1714', borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  barFill: { height: '100%' },
  barValue: { color: '#cdbf99', fontSize: 11, width: 64, textAlign: 'right' },

  statRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomColor: '#1f1c18', borderBottomWidth: 1 },
  statKey: { color: '#c9a86a', fontSize: 12, fontWeight: '700', letterSpacing: 1, width: 44, paddingTop: 2 },
  statBody: { flex: 1 },
  statTotal: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  statBase: { color: '#5a5246', fontSize: 11, fontWeight: '400' },
  progressBar: { color: '#9ec96a', fontSize: 10, letterSpacing: 1, marginTop: 3 },
  progressPct: { color: '#5a5246', fontSize: 9, letterSpacing: 0.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chip: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  chipNeg: { borderColor: '#7a4040', backgroundColor: '#221512' },
  chipText: { color: '#9ec96a', fontSize: 10, letterSpacing: 0.5 },
  chipTextNeg: { color: '#e07a5f' },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 4 },
  kvKey: { color: '#7a705c', fontSize: 12, letterSpacing: 1 },
  kvValue: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  kvSub: { color: '#7a705c', fontSize: 10, fontStyle: 'italic', marginTop: -2, marginBottom: 4 },
  warning: { color: '#c9a86a' },
  danger: { color: '#e07a5f' },

  slotRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomColor: '#1f1c18', borderBottomWidth: 1 },
  slotLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 1, width: 80, paddingTop: 2 },
  slotBody: { flex: 1 },
  slotEmpty: { color: '#3a342c', fontSize: 12 },
  slotName: { color: '#e6d8b3', fontSize: 13, fontWeight: '700' },
  slotMeta: { color: '#9ec96a', fontSize: 10, marginTop: 2 },

  effectRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  effectLabel: { color: '#e6d8b3', fontSize: 12 },
  effectMeta: { color: '#7a705c', fontSize: 10, letterSpacing: 0.5 },

  traitRow: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 4 },

  contractRow: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 2 },
  contractTap: { color: '#c9a86a', fontSize: 10, letterSpacing: 1, marginTop: 6, fontStyle: 'italic', textAlign: 'right' },

  footerHint: { color: '#5a5246', fontSize: 10, fontStyle: 'italic', textAlign: 'center', marginTop: 18 },
});
