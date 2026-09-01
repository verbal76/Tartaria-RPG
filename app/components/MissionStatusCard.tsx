// MissionStatusCard — OTA-1615. WHAT YOU ARE DOING, WHERE YOU STAND.
//
// ⚠⚠⚠ Owner: *"the hint was investigate to advance in the missions and it's
// getting annoying jumping back into the missions tab every time. I want to
// check to see what I have to do next. is there a way to call the mission that
// I'm in into a pop-up to see its status while I'm on the exploration screen?
// happy to just scroll through the mission and where I'm at."*
//
// ⚠⚠ THE ANSWER WAS ALREADY COMPUTED — IT JUST WENT TO ME. Since OTA-1586 every
// log carries a `missions:` line per live contract: the stage owed and how many
// there are, the verb that stage wants, the ground it happens on and whether the
// boots are on it, what the pack owes it, tracked or paused. He has been walking
// to the Contracts tab to read a thing the engine writes on every arrival for a
// log reader. `missionStatusCards` is that same reader, shaped for him.
//
// ⚠ IT REPLACES A TAB JUMP, IT DOES NOT HIDE THE TAB. OPEN CONTRACTS is on the
// card — the full screen is one tap away for everything this deliberately does
// not carry (rewards, abandon, activate). The card answers the question he
// actually keeps asking, which is "what now, and am I in the right place".
import React, { useMemo } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { missionStatusCards } from '../engine/missionTrace';

export function MissionStatusCard({
  visible,
  onClose,
  onOpenContracts,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenContracts: () => void;
}) {
  const player = useGameStore((s) => s.player);
  const cards = useMemo(() => missionStatusCards(player), [player]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.kicker}>ON YOUR SLATE</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close — back to the world"
            >
              <Text style={styles.closeText}>▾</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner}>
            {cards.length === 0 ? (
              <Text style={styles.empty}>
                Nothing on the slate. Read a contracts board, or let the road hand you something.
              </Text>
            ) : (
              cards.map((c) => (
                <View key={`${c.family}:${c.id}`} style={styles.card}>
                  <Text style={styles.title}>{c.title}</Text>
                  <Text style={styles.meta}>
                    {c.ready ? 'ALL BEATS DONE' : `STEP ${c.stageNo} OF ${c.stageTotal}`}
                    {c.tracked ? '' : ' · PAUSED'}
                  </Text>

                  {/* ⚠ The two questions the tab jump was being spent on. */}
                  {c.ready ? (
                    <Text style={styles.ask}>The work is done — find a counter and hand it in.</Text>
                  ) : (
                    <>
                      {c.ask ? <Text style={styles.ask}>Next: {c.ask}</Text> : null}
                      <Text style={c.here ? styles.here : styles.where}>
                        {c.here ? '▸ You are standing on it.' : `Where: ${c.where || 'not yet named'}`}
                      </Text>
                      {c.npcName ? <Text style={styles.detail}>Find {c.npcName}.</Text> : null}
                      {c.needs ? (
                        <Text style={c.needs.held ? styles.needHeld : styles.needShort}>
                          {c.needs.held
                            ? `Carrying: ${c.needs.item} ✓`
                            : `You still need: ${c.needs.item}`}
                        </Text>
                      ) : null}
                    </>
                  )}

                  {/* The shape of the whole job, with a mark on where you are. */}
                  {c.steps.length > 0 && (
                    <View style={styles.steps}>
                      {c.steps.map((s) => (
                        <Text
                          key={s.no}
                          style={[
                            styles.step,
                            s.state === 'done' && styles.stepDone,
                            s.state === 'current' && styles.stepCurrent,
                          ]}
                        >
                          {s.state === 'done' ? '✓' : s.state === 'current' ? '▸' : '·'} {s.no}. {s.ask}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onOpenContracts}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open the full Contracts screen"
          >
            <Text style={styles.secondaryText}>OPEN CONTRACTS</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to the world"
          >
            <Text style={styles.primaryText}>BACK TO THE WORLD</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#13110f',
    borderTopWidth: 1,
    borderColor: '#c9a86a',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    // OTA-1614's rule, applied here too: never taller than the screen, and the
    // buttons live outside the scroll so they cannot be pushed away.
    maxHeight: '85%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  kicker: { color: '#c9a86a', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  closeBtn: { paddingHorizontal: 10, paddingVertical: 2 },
  closeText: { color: '#c9a86a', fontSize: 16 },
  scroll: { flexShrink: 1, flexGrow: 0 },
  scrollInner: { paddingBottom: 6 },
  empty: { color: '#a2977b', fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  card: { borderTopWidth: 1, borderColor: '#2a251d', paddingVertical: 10 },
  title: { color: '#e8dcc0', fontSize: 15, fontWeight: '700' },
  meta: { color: '#8f8570', fontSize: 10, letterSpacing: 1, fontWeight: '700', marginTop: 2 },
  ask: { color: '#c9a86a', fontSize: 13, lineHeight: 19, marginTop: 6 },
  where: { color: '#a2977b', fontSize: 12, lineHeight: 18, marginTop: 2 },
  here: { color: '#7fb069', fontSize: 12, lineHeight: 18, marginTop: 2, fontWeight: '700' },
  detail: { color: '#a2977b', fontSize: 12, lineHeight: 18, marginTop: 2 },
  needHeld: { color: '#7fb069', fontSize: 12, lineHeight: 18, marginTop: 2 },
  needShort: { color: '#c96a6a', fontSize: 12, lineHeight: 18, marginTop: 2 },
  steps: { marginTop: 8 },
  step: { color: '#6f6656', fontSize: 11, lineHeight: 17 },
  stepDone: { color: '#5c6b52' },
  stepCurrent: { color: '#e8dcc0', fontWeight: '700' },
  secondaryBtn: {
    marginTop: 8, borderWidth: 1, borderColor: '#3a342c', borderRadius: 3,
    paddingVertical: 10, alignItems: 'center',
  },
  secondaryText: { color: '#a2977b', fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  primaryBtn: {
    marginTop: 6, backgroundColor: '#c9a86a', borderRadius: 3,
    paddingVertical: 11, alignItems: 'center',
  },
  primaryText: { color: '#1b1710', fontSize: 12, letterSpacing: 1, fontWeight: '700' },
});
