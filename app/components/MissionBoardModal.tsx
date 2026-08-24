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
import { availableFactionQuests, neutralBoardPostings } from '../engine/factionQuests';
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

  // ⚠⚠⚠ OTA-1475 — `faction: null` IS THE HIDDEN MARKET'S NEUTRAL POST. Owner:
  // "all of the factions should be able to post there without interaction from
  // each other." The square's truce is already in the fiction — "the Market's
  // truce is older than any grudge" — so nine factions who will not fight there
  // have no reason not to nail work to the same board.
  const neutral = !!board && board.faction === null;
  const factionLabel = !board
    ? ''
    : neutral
      ? 'The Market'
      : FACTIONS.find((f) => f.id === board.faction)?.name ?? String(board.faction).replace(/_/g, ' ');

  // ⚠ ROWS STAY GROUPED BY FACTION, because "without interaction from each
  // other" is the load-bearing half of the ask: a Reclaimers posting taken off
  // this board is still Reclaimers work, and the player has to be able to see
  // whose colour they are about to fly before they tap.
  const groups = useMemo(() => {
    if (!board) return [];
    if (neutral) {
      return neutralBoardPostings(
        FACTIONS,
        (fid) => getStanding(factionStanding ?? [], fid),
        activeIds ?? [],
        completedIds ?? [],
      );
    }
    const fid = String(board.faction);
    const one = availableFactionQuests(fid, getStanding(factionStanding ?? [], fid), activeIds ?? [], completedIds ?? []);
    return one.length ? [{ factionId: fid, factionName: factionLabel, postings: one }] : [];
  }, [board, neutral, factionLabel, factionStanding, activeIds, completedIds]);

  const postings = useMemo(() => groups.flatMap((g) => g.postings), [groups]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} accessibilityViewIsModal={true}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title} accessibilityRole="header">⚑ {factionLabel.toUpperCase()} MISSION BOARD</Text>
              <View style={styles.rule} />
              {postings.length === 0 ? (
                <Text style={styles.empty}>
                  The board is clear — nothing posted for you right now. Turn in your active
                  work, then check back.
                </Text>
              ) : (
                <>
                  <Text style={styles.subtitle}>
                    {neutral
                      ? 'Every colour posts here — the square\'s truce holds on the paper too. Tap ACCEPT to take one on.'
                      : 'Open postings — tap ACCEPT to take one on.'}
                  </Text>
                  <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                    {groups.map((g) => (
                      <View key={g.factionId}>
                        {/* ⚠ OTA-1475 — the heading only appears on the neutral
                            post. On a faction outpost's own board there is
                            exactly one group and its name is already the modal
                            title, so a heading would just repeat it. */}
                        {neutral && <Text style={styles.groupHead}>— {g.factionName} —</Text>}
                        {g.postings.map((q) => (
                          <View key={q.id} style={styles.posting}>
                            <Text style={styles.postingTitle}>{q.title}</Text>
                            <Text style={styles.postingObjective}>{q.objective}</Text>
                            <View style={styles.postingFooter}>
                              <Text style={styles.postingReward}>
                                ✦ {q.reward.tc} TC · +{q.reward.rep} rep{neutral ? ` · ${g.factionName}` : ''}
                              </Text>
                              <Pressable
                                style={({ pressed }) => [styles.acceptBtn, pressed && styles.btnPressed]}
                                onPress={() => acceptFactionQuest(q.title)}
                                accessibilityRole="button"
                                accessibilityLabel={`Accept ${q.title}${neutral ? ` for the ${g.factionName}` : ''}`}
                              >
                                <Text style={styles.acceptBtnText}>ACCEPT</Text>
                              </Pressable>
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
                accessibilityRole="button"
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
  subtitle: { color: '#a2977b', fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  // OTA-1475 — faction heading on the Market's neutral post.
  groupHead: { color: '#c9a86a', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 8, marginBottom: 4 },
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
