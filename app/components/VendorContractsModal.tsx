import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { useGameStore } from '../state/gameStore';
import { availableFactionQuests } from '../engine/factionQuests';
import { availableHunts } from '../engine/hunts';
import { availableMysteries } from '../engine/mysteries';
import { availableStorylines } from '../engine/factionStorylines';
import { getStanding } from '../engine/factions';
import type { VendorInstance } from '../engine/vendors';

interface Props {
  visible: boolean;
  onClose: () => void;
  vendor: VendorInstance;
}

interface Posting {
  key: string;
  title: string;
  body: string;
  tc: number;
  rep?: number | null;
  accent: string;
  onAccept: () => void;
}

// arb151 — vendor CONTRACTS as a mission-board-style POPUP instead of an inline
// tab. Player feedback: they preferred the outpost Mission Board modal (OTA-567)
// over the vendor's inline contracts tab and asked for the same popup here. This
// lists every contract the vendor offers — faction quests, bounties, mysteries,
// storylines — grouped, each with a tap-to-ACCEPT (direct, like the Mission
// Board; no extra confirm). availableX() already filters active/completed, so an
// accepted posting drops off the list and the popup stays open to take more.
export function VendorContractsModal({ visible, onClose, vendor }: Props) {
  // Raw selectors (no `?? []` inside the selector — that returns a fresh array
  // every render and Object.is would loop the component). Default inside useMemo.
  const factionStanding = useGameStore((s) => s.player?.factionStanding);
  const activeFactionQuestIds = useGameStore((s) => s.player?.activeFactionQuestIds);
  const completedFactionQuestIds = useGameStore((s) => s.player?.completedFactionQuestIds);
  const activeHunts = useGameStore((s) => s.player?.activeHunts);
  const completedHuntIds = useGameStore((s) => s.player?.completedHuntIds);
  const activeMysteries = useGameStore((s) => s.player?.activeMysteries);
  const completedMysteryIds = useGameStore((s) => s.player?.completedMysteryIds);
  const activeStorylines = useGameStore((s) => s.player?.activeStorylines);
  const completedStorylineIds = useGameStore((s) => s.player?.completedStorylineIds);
  const acceptFactionQuest = useGameStore((s) => s.acceptFactionQuest);
  const acceptHunt = useGameStore((s) => s.acceptHunt);
  const acceptMystery = useGameStore((s) => s.acceptMystery);
  const acceptStoryline = useGameStore((s) => s.acceptStoryline);

  const sections = useMemo(() => {
    const rep = vendor.faction ? getStanding(factionStanding ?? [], vendor.faction) : 0;
    const quests = vendor.faction
      ? availableFactionQuests(vendor.faction, rep, activeFactionQuestIds ?? [], completedFactionQuestIds ?? [])
      : [];
    const hunts = availableHunts(vendor.faction, rep, (activeHunts ?? []).map((h) => h.id), completedHuntIds ?? []);
    const mysteries = availableMysteries(vendor.faction, rep, (activeMysteries ?? []).map((m) => m.id), completedMysteryIds ?? []);
    const stories = vendor.faction
      ? availableStorylines(vendor.faction, rep, (activeStorylines ?? []).map((s) => s.id), completedStorylineIds ?? [])
      : [];

    const out: { label: string; postings: Posting[] }[] = [];
    if (quests.length > 0) {
      out.push({
        label: 'FACTION CONTRACTS',
        postings: quests.map((q) => ({
          key: `fq_${q.id}`, title: q.title, body: q.objective, tc: q.reward.tc, rep: q.reward.rep,
          accent: '#c9a86a', onAccept: () => acceptFactionQuest(q.title),
        })),
      });
    }
    if (hunts.length > 0) {
      out.push({
        label: 'BOUNTIES',
        postings: hunts.map((h) => ({
          key: `h_${h.id}`, title: h.title, body: h.posterText, tc: h.rewardTc, rep: h.rewardRep,
          accent: '#e07a5f', onAccept: () => acceptHunt(h.title),
        })),
      });
    }
    if (mysteries.length > 0) {
      out.push({
        label: 'MYSTERIES',
        postings: mysteries.map((m) => ({
          key: `m_${m.id}`, title: m.title, body: m.posterText, tc: m.rewardTc, rep: m.rewardRep,
          accent: '#b88ce0', onAccept: () => acceptMystery(m.title),
        })),
      });
    }
    if (stories.length > 0) {
      out.push({
        label: 'STORYLINES',
        postings: stories.map((s) => ({
          key: `s_${s.id}`, title: s.title, body: s.posterText, tc: s.rewardTc, rep: s.rewardRep,
          accent: '#9ec96a', onAccept: () => acceptStoryline(s.title),
        })),
      });
    }
    return out;
  }, [
    vendor.faction, factionStanding, activeFactionQuestIds, completedFactionQuestIds,
    activeHunts, completedHuntIds, activeMysteries, completedMysteryIds,
    activeStorylines, completedStorylineIds,
    acceptFactionQuest, acceptHunt, acceptMystery, acceptStoryline,
  ]);

  const empty = sections.length === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>⚑ {vendor.name.toUpperCase()} · CONTRACTS</Text>
              <View style={styles.rule} />
              {empty ? (
                <Text style={styles.empty}>
                  {vendor.name} has no contracts on offer for you right now. Build reputation, or
                  finish what you're already carrying, then check back.
                </Text>
              ) : (
                <>
                  <Text style={styles.subtitle}>Open work — tap ACCEPT to take one on.</Text>
                  <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                    {sections.map((sec) => (
                      <View key={sec.label} style={styles.section}>
                        <Text style={styles.sectionTitle}>{sec.label}</Text>
                        {sec.postings.map((p) => (
                          <View key={p.key} style={styles.posting}>
                            <View style={[styles.stripe, { backgroundColor: p.accent }]} />
                            <View style={styles.postingBody}>
                              <Text style={styles.postingTitle}>{p.title}</Text>
                              <Text style={styles.postingObjective}>{p.body}</Text>
                              <View style={styles.postingFooter}>
                                <Text style={styles.postingReward}>
                                  ✦ {p.tc} TC{p.rep ? ` · +${p.rep} rep` : ''}
                                </Text>
                                <Pressable
                                  style={({ pressed }) => [styles.acceptBtn, pressed && styles.btnPressed]}
                                  onPress={p.onAccept}
                                >
                                  <Text style={styles.acceptBtnText}>ACCEPT</Text>
                                </Pressable>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}
              <Pressable
                style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
                onPress={onClose}
              >
                <Text style={styles.closeBtnText}>CLOSE</Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, maxHeight: '82%', backgroundColor: '#13110f', borderColor: '#b98a4a', borderWidth: 1, borderRadius: 4, padding: 14 },
  title: { color: '#d8b271', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 10 },
  subtitle: { color: '#7a705c', fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  empty: { color: '#cdbf99', fontSize: 13, lineHeight: 19, marginBottom: 6 },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 4 },
  section: { marginBottom: 12 },
  sectionTitle: { color: '#9a8f78', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginBottom: 6 },
  posting: { flexDirection: 'row', backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, marginBottom: 8, overflow: 'hidden' },
  stripe: { width: 4 },
  postingBody: { flex: 1, padding: 11 },
  postingTitle: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  postingObjective: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginTop: 4 },
  postingFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  postingReward: { color: '#9ec96a', fontSize: 12, flexShrink: 1 },
  acceptBtn: { backgroundColor: '#b98a4a', borderColor: '#b98a4a', borderWidth: 1, borderRadius: 3, paddingHorizontal: 16, paddingVertical: 7 },
  acceptBtnText: { color: '#13110f', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  closeBtn: { marginTop: 14, alignSelf: 'flex-end', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 3, borderWidth: 1, borderColor: '#3a342c', minWidth: 80, alignItems: 'center' },
  closeBtnText: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  btnPressed: { opacity: 0.7 },
});
