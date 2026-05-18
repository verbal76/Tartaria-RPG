import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { findHuntById, HUNTS } from '../engine/hunts';
import { findMysteryById, MYSTERIES } from '../engine/mysteries';
import { findStorylineById, STORYLINES } from '../engine/factionStorylines';
import { findFactionQuestById, FACTION_QUESTS } from '../engine/factionQuests';
import { FACTIONS } from '../engine/factions';

function MilestoneStat({ label, value, next, suffix }: { label: string; value: number; next: number; suffix: string }) {
  const toNext = next - (value % next);
  return (
    <View style={milestoneStyles.cell}>
      <Text style={milestoneStyles.value}>{value}</Text>
      <Text style={milestoneStyles.label}>{label}</Text>
      <Text style={milestoneStyles.next}>{toNext === next ? `next ${suffix} after ${next}` : `${toNext} → ${suffix}`}</Text>
    </View>
  );
}

const milestoneStyles = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  value: { color: '#c9a86a', fontSize: 18, fontWeight: '700' },
  label: { color: '#cdbf99', fontSize: 11, letterSpacing: 1 },
  next: { color: '#7a705c', fontSize: 9, marginTop: 2, textAlign: 'center' },
});

function factionLabel(factionId: string | null | undefined): string {
  if (!factionId) return 'Unaffiliated';
  const f = FACTIONS.find((x) => x.id === factionId);
  return f?.name ?? factionId.replace(/_/g, ' ');
}

export function ContractsScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No active character.</Text>
      </View>
    );
  }

  // Resolve every active contract via its catalog lookup so we always
  // have a current title + stage count even after lore edits.
  const hunts = (player.activeHunts ?? []).map((h) => ({
    run: h,
    def: findHuntById(h.id),
  }));
  const mysteries = (player.activeMysteries ?? []).map((m) => ({
    run: m,
    def: findMysteryById(m.id),
  }));
  const storylines = (player.activeStorylines ?? []).map((s) => ({
    run: s,
    def: findStorylineById(s.id),
  }));
  // Faction quests — prefer the new staged shape (activeFactionQuests)
  // and fall back to the legacy id list. The legacy list will be empty
  // after backfillPlayer runs on load, but the dual read keeps the
  // screen safe across mid-session migrations.
  const factionQuestRecords =
    player.activeFactionQuests ??
    (player.activeFactionQuestIds ?? []).map((id) => ({
      id,
      stage: 0,
      postedByFaction: findFactionQuestById(id)?.factionId ?? 'unknown',
      acceptedAt: Date.now(),
    }));
  const factionQuests = factionQuestRecords.map((rec) => ({
    rec,
    def: findFactionQuestById(rec.id),
  }));

  const totalActive =
    hunts.length + mysteries.length + storylines.length + factionQuests.length;

  // Lifetime milestone counters — surfaced here so players have a single
  // place to see progress toward stat bumps (every 10 checks succeeded
  // → +1 stat, every 5 enemies defeated → +1 HP max, every 5 travels
  // → +1 stamina max).
  const ms = player.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 };

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
        <Text style={styles.title}>CONTRACTS</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MILESTONES</Text>
          <View style={styles.milestoneRow}>
            <MilestoneStat label="Enemies" value={ms.enemiesDefeated} next={5} suffix="+1 HP max" />
            <MilestoneStat label="Travels" value={ms.travelsCompleted} next={5} suffix="+1 STA max" />
            <MilestoneStat label="Checks" value={ms.checksSucceeded} next={10} suffix="+1 stat" />
          </View>
        </View>

        {totalActive === 0 ? (
          <View style={styles.emptyInline}>
            <Text style={styles.emptyTitle}>No active contracts.</Text>
            <Text style={styles.emptyBody}>
              Find a faction vendor — `accept`, `take`, or `undertake` a hunt /
              mystery / storyline / quest to pick one up.
            </Text>
            <Text style={styles.emptySub}>
              {HUNTS.length} hunts · {MYSTERIES.length} mysteries ·
              {' '}{STORYLINES.length} storylines · {FACTION_QUESTS.length} faction quests
              available in the world.
            </Text>
          </View>
        ) : null}

        {hunts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>HUNTS</Text>
              {hunts.map(({ run, def }) =>
                def ? (
                  <View key={`h_${run.id}`} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{def.title}</Text>
                      <Text style={styles.stagePill}>
                        Stage {run.stage + 1}/{def.stages.length}
                      </Text>
                    </View>
                    <Text style={styles.cardFaction}>{factionLabel(def.factionId)}</Text>
                    {def.stages[run.stage] && (
                      <Text style={styles.cardBody}>
                        {def.stages[run.stage]!.narration}
                      </Text>
                    )}
                  </View>
                ) : null,
              )}
            </View>
          )}

          {mysteries.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>MYSTERIES</Text>
              {mysteries.map(({ run, def }) =>
                def ? (
                  <View key={`m_${run.id}`} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{def.title}</Text>
                      <Text style={styles.stagePill}>
                        Stage {run.stage + 1}/{def.stages.length}
                      </Text>
                    </View>
                    <Text style={styles.cardFaction}>{factionLabel(def.factionId)}</Text>
                    {def.stages[run.stage] && (
                      <Text style={styles.cardBody}>
                        {def.stages[run.stage]!.narration}
                      </Text>
                    )}
                  </View>
                ) : null,
              )}
            </View>
          )}

          {storylines.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>STORYLINES</Text>
              {storylines.map(({ run, def }) =>
                def ? (
                  <View key={`s_${run.id}`} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{def.title}</Text>
                      <Text style={styles.stagePill}>
                        Stage {run.stage + 1}/{def.stages.length}
                      </Text>
                    </View>
                    <Text style={styles.cardFaction}>{factionLabel(def.factionId)}</Text>
                    {def.stages[run.stage] && (
                      <Text style={styles.cardBody}>
                        {def.stages[run.stage]!.narration}
                      </Text>
                    )}
                  </View>
                ) : null,
              )}
            </View>
          )}

          {factionQuests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FACTION QUESTS</Text>
              {factionQuests.map(({ rec, def }, i) =>
                def ? (
                  <View key={`q_${def.id}_${i}`} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{def.title}</Text>
                      <Text style={styles.stagePill}>
                        {def.stages && def.stages.length > 0
                          ? rec.stage >= def.stages.length
                            ? 'ready to turn in'
                            : `stage ${rec.stage + 1} / ${def.stages.length}`
                          : 'open'}
                      </Text>
                    </View>
                    <Text style={styles.cardFaction}>{factionLabel(def.factionId)}</Text>
                    <Text style={styles.cardBody}>{def.objective}</Text>
                  </View>
                ) : null,
              )}
            </View>
          )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backBtn: {
    backgroundColor: '#1a1714',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    width: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#e6d8b3', letterSpacing: 4, fontSize: 14 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyInline: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyTitle: { color: '#c9a86a', fontSize: 16, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  emptyBody: { color: '#cdbf99', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  emptySub: { color: '#7a705c', fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  section: { marginBottom: 14 },
  sectionTitle: {
    color: '#c9a86a',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomColor: '#3a342c',
    borderBottomWidth: 1,
  },
  card: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  cardTitle: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', flex: 1, marginRight: 8 },
  stagePill: {
    color: '#9ec96a',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    borderColor: '#3d5a2c',
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardFaction: { color: '#7a705c', fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  cardBody: { color: '#cdbf99', fontSize: 12, lineHeight: 17 },
  milestoneRow: { flexDirection: 'row', backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, padding: 10 },
});
