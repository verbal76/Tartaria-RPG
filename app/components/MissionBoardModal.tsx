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
import { getStanding, FACTIONS } from '../engine/factions';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// arb135 — Mission Board, as a SCREEN instead of a text dump.
// Player feedback: tapping the "MISSION BOARD" chip used to just print the
// open postings into the log with no way to act on them — you had to know to
// TYPE `accept <name>`. They (reasonably) expected it to behave like the
// missions button: open a screen that lists the postings and lets you ACCEPT
// each one with a tap. This modal does exactly that. Accepting calls the same
// acceptFactionQuest(title) the typed path uses; availableFactionQuests already
// filters out anything active/completed, so an accepted posting drops off the
// list immediately and the modal stays open to take more.
export function MissionBoardModal({ visible, onClose }: Props) {
  const board = useGameStore((s) => s.currentScene?.missionBoard ?? null);
  // Raw selects (NO `?? []` inside the selector — that returns a fresh array
  // every render and Object.is would loop the component). Default inside useMemo.
  const factionStanding = useGameStore((s) => s.player?.factionStanding);
  const activeIds = useGameStore((s) => s.player?.activeFactionQuestIds);
  const completedIds = useGameStore((s) => s.player?.completedFactionQuestIds);
  const acceptFactionQuest = useGameStore((s) => s.acceptFactionQuest);

  const factionLabel = board
    ? FACTIONS.find((f) => f.id === board.faction)?.name ?? board.faction.replace(/_/g, ' ')
    : '';

  const postings = useMemo(() => {
    if (!board) return [];
    return availableFactionQuests(
      board.faction,
      getStanding(factionStanding ?? [], board.faction),
      activeIds ?? [],
      completedIds ?? [],
    );
  }, [board, factionStanding, activeIds, completedIds]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>⚑ {factionLabel.toUpperCase()} MISSION BOARD</Text>
              <View style={styles.rule} />
              {postings.length === 0 ? (
                <Text style={styles.empty}>
                  The board is clear — nothing posted for you right now. Turn in your active
                  work, then check back.
                </Text>
              ) : (
                <>
                  <Text style={styles.subtitle}>Open postings — tap ACCEPT to take one on.</Text>
                  <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                    {postings.map((q) => (
                      <View key={q.id} style={styles.posting}>
                        <Text style={styles.postingTitle}>{q.title}</Text>
                        <Text style={styles.postingObjective}>{q.objective}</Text>
                        <View style={styles.postingFooter}>
                          <Text style={styles.postingReward}>
                            ✦ {q.reward.tc} TC · +{q.reward.rep} rep
                          </Text>
                          <Pressable
                            style={({ pressed }) => [styles.acceptBtn, pressed && styles.btnPressed]}
                            onPress={() => acceptFactionQuest(q.title)}
                          >
                            <Text style={styles.acceptBtnText}>ACCEPT</Text>
                          </Pressable>
                        </View>
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
  listContent: { gap: 10, paddingBottom: 4 },
  posting: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, padding: 11 },
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
