import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { findHuntById, HUNTS } from '../engine/hunts';
import { findMysteryById, MYSTERIES } from '../engine/mysteries';
import { findStorylineById, STORYLINES } from '../engine/factionStorylines';
import { findFactionQuestById, FACTION_QUESTS } from '../engine/factionQuests';
import { FACTIONS } from '../engine/factions';
import { computeAllProgress, CHARACTER_STORIES, ALL_FRAGMENTS } from '../engine/collectables';

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

type Tab = 'contracts' | 'collectables';

export function ContractsScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  const [tab, setTab] = useState<Tab>('contracts');

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

  const progress = computeAllProgress(player.collectables ?? []);
  const totalFragmentsFound = progress.reduce((acc, p) => acc + p.found.length, 0);
  const totalFragments = ALL_FRAGMENTS.length;

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

      <View style={styles.tabRow}>
        <TouchableOpacity
          onPress={() => setTab('contracts')}
          style={[styles.tabBtn, tab === 'contracts' && styles.tabBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'contracts' && styles.tabBtnTextActive]}>
            CONTRACTS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('collectables')}
          style={[styles.tabBtn, tab === 'collectables' && styles.tabBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'collectables' && styles.tabBtnTextActive]}>
            COLLECTIBLES {totalFragments > 0 ? `(${totalFragmentsFound}/${totalFragments})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'collectables' ? (
        <CollectablesTab progress={progress} />
      ) : (
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
              {factionQuests.map(({ rec, def }, i) => {
                if (!def) return null;
                const stageDef = def.stages?.[rec.stage];
                const readyToTurnIn =
                  def.stages && def.stages.length > 0 && rec.stage >= def.stages.length;
                return (
                  <View key={`q_${def.id}_${i}`} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{def.title}</Text>
                      <Text style={styles.stagePill}>
                        {def.stages && def.stages.length > 0
                          ? readyToTurnIn
                            ? 'ready to turn in'
                            : `stage ${rec.stage + 1} / ${def.stages.length}`
                          : 'open'}
                      </Text>
                    </View>
                    <Text style={styles.cardFaction}>{factionLabel(def.factionId)}</Text>
                    <Text style={styles.cardBody}>{def.objective}</Text>
                    {/* Current-stage narration — playtest feedback:
                        "I should be able to tap on the listed quest and
                        see instructions on my next step". Surface the
                        stage line directly so the player sees what to
                        do next without needing to remember the vendor
                        intro. Hunt / Mystery / Storyline cards already
                        do this — this brings faction quests to parity. */}
                    {!readyToTurnIn && stageDef && (
                      <>
                        <Text style={styles.cardStageLabel}>Next step</Text>
                        <Text style={styles.cardStageBody}>{stageDef.narration}</Text>
                        {stageDef.advanceOn && stageDef.advanceOn !== 'any' && (
                          <Text style={styles.cardStageHint}>
                            {stageDef.advanceOn === 'kill'
                              ? '→ Advance by defeating an enemy.'
                              : '→ Advance by traveling to a new location.'}
                          </Text>
                        )}
                      </>
                    )}
                    {readyToTurnIn && (
                      <Text style={styles.cardStageHint}>
                        → Return to any {factionLabel(def.factionId)} agent and turn in.
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}
      </ScrollView>
      )}
    </View>
  );
}

// Collectibles tab — per-character story progress with expandable
// fragments. Tap a character card to expand; tap again to collapse.
// Found fragments show their full body; undiscovered fragments show
// the discovery hint as a teaser.
function CollectablesTab({ progress }: { progress: ReturnType<typeof computeAllProgress> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (CHARACTER_STORIES.length === 0) {
    return (
      <View style={styles.emptyInline}>
        <Text style={styles.emptyTitle}>No collectibles authored yet.</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CHARACTER STORIES</Text>
        <Text style={styles.collectIntro}>
          Notes, letters, and journal pages from ten people who walked Tartaria
          before you. Find every fragment to read each story end to end.
        </Text>
      </View>
      {progress.map(({ story, found, missing, fraction, complete }) => {
        const isOpen = openId === story.id;
        const pct = Math.round(fraction * 100);
        return (
          <View key={story.id} style={[styles.card, styles.collectCard]}>
            <TouchableOpacity
              onPress={() => setOpenId(isOpen ? null : story.id)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{story.characterName}</Text>
                <Text style={complete ? styles.completePill : styles.stagePill}>
                  {found.length}/{story.fragments.length}
                </Text>
              </View>
              <Text style={styles.cardFaction}>{story.characterBlurb}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
            </TouchableOpacity>
            {isOpen && (
              <View style={styles.fragmentList}>
                {story.fragments.map((frag) => {
                  const isFound = found.some((f) => f.id === frag.id);
                  return (
                    <View key={frag.id} style={styles.fragmentRow}>
                      <Text style={isFound ? styles.fragTitleFound : styles.fragTitleMissing}>
                        {isFound ? `${frag.title} (${frag.kind})` : `?? — ${frag.kind}`}
                      </Text>
                      {isFound ? (
                        <Text style={styles.fragBody}>{frag.body}</Text>
                      ) : (
                        <Text style={styles.fragHint}>{frag.discoveryHint}</Text>
                      )}
                    </View>
                  );
                })}
                {missing.length === 0 && (
                  <Text style={styles.completeBanner}>
                    ✦ Story complete — every fragment recovered.
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
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
  cardStageLabel: { color: '#c9a86a', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginTop: 8, marginBottom: 2 },
  cardStageBody: { color: '#e6d8b3', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  cardStageHint: { color: '#9ec96a', fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  milestoneRow: { flexDirection: 'row', backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, padding: 10 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
  },
  tabBtnActive: { borderBottomColor: '#c9a86a' },
  tabBtnText: { color: '#7a705c', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  tabBtnTextActive: { color: '#c9a86a' },
  collectIntro: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  collectCard: { marginBottom: 8 },
  completePill: {
    color: '#13110f',
    backgroundColor: '#9ec96a',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '800',
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#1a1714',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#c9a86a' },
  fragmentList: { marginTop: 10, gap: 8 },
  fragmentRow: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 8,
  },
  fragTitleFound: { color: '#c9a86a', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  fragTitleMissing: { color: '#5a5246', fontSize: 11, fontWeight: '700', letterSpacing: 1, fontStyle: 'italic', marginBottom: 4 },
  fragBody: { color: '#e6d8b3', fontSize: 12, lineHeight: 17 },
  fragHint: { color: '#7a705c', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  completeBanner: { color: '#9ec96a', fontSize: 11, letterSpacing: 1, fontWeight: '700', marginTop: 4 },
});
