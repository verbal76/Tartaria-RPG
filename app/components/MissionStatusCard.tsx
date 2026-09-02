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
// ⚠⚠⚠ OTA-1618 — AND NOW IT IS THE WHOLE SLATE, NOT A SAMPLE OF IT. Owner:
// *"can we just take the tab and put it on that button so when I hit the button
// it scrolls everything it's just right there and can we have it so that the
// active mission is always on top?"* — *"you hit the button it pops up. you hit
// your thing you close it. you're done."*
//
// Two things changed. Every live family is on it now (faction contracts,
// bounties, whispers and leads joined the three stage families), and the TAB'S
// OWN ACTIONS came with them: SET ACTIVE / PAUSE, HAND IT IN, ABANDON / DISCARD,
// beside the SET COURSE that arrived in OTA-1617. A cheat sheet you have to
// leave in order to act on is a reference card — that was 1617's lesson about
// autoroute, and it is the same lesson one door further out.
//
// ⚠ IT STILL COMPUTES NOTHING OF ITS OWN. Which actions a row may offer comes
// off the card the engine hands it (`pauseKind`, `abandonKind`, `discardable`,
// `turnInKind`), for the reason the reader's header gives: a status card that
// works out its own answer is telling the player about the card. Every button
// calls the SAME store action the Contracts screen called.
import React, { useMemo, useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { missionStatusCards, type MissionStatusCard as CardModel } from '../engine/missionTrace';

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
  // ⚠⚠⚠ OTA-1617 — AUTOROUTE LIVES ON THE MISSION IT BELONGS TO. Owner: *"the
  // missions tab is great, but autoroute if the mission is available it should
  // be on there too, listed in the mission it's for. I still had to go back to
  // the open missions button to hit autoroute. the new way it works should be a
  // lightly functional cheat sheet."* A cheat sheet you have to leave to act on
  // is a reference card, not a cheat sheet.
  // ⚠ Same two actions the Contracts screen's SET COURSE uses, in the same
  // order: inside an outpost the global confirm asks before walking you out
  // (OTA-035), otherwise the course is set outright. Routing through a second
  // path is how a button comes to send you somewhere Contracts would refuse.
  const setTravelCourse = useGameStore((s) => s.setTravelCourse);
  const requestTravelConfirm = useGameStore((s) => s.requestTravelConfirm);
  const setWhisperCourse = useGameStore((s) => s.setWhisperCourse);
  const routeMission = useGameStore((s) => s.routeMission);
  const setContractActive = useGameStore((s) => s.setContractActive);
  const abandonContract = useGameStore((s) => s.abandonContract);
  const discardLead = useGameStore((s) => s.discardLead);
  const completeContractFromUI = useGameStore((s) => s.completeContractFromUI);
  const setScreen = useGameStore((s) => s.setScreen);

  // ⚠ OTA-1618 — a DROP IS TWO TAPS. Abandon and discard are the only
  // irreversible buttons on this sheet, and on the Contracts screen they sat
  // behind a tap-to-expand that this sheet deliberately does not have. The
  // second tap replaces the expansion as the thing standing between a scrolling
  // thumb and a contract the player wanted.
  const [armedDrop, setArmedDrop] = useState<string | null>(null);

  const routeTo = (id: string, name: string) => {
    onClose();
    if (player?.hubRoomId) requestTravelConfirm(id, name);
    else setTravelCourse(id);
    setScreen('exploration');
  };

  const takeRoute = (c: CardModel) => {
    const r = c.route;
    if (!r) return;
    if (r.kind === 'location') { routeTo(r.id, r.name); return; }
    if (r.kind === 'cell') {
      onClose();
      setWhisperCourse(r.x, r.y, r.label);
      setScreen('exploration');
      return;
    }
    // 'mission' — the faction chain, which courses to the objective and then
    // auto-courses to the turn-in. Coursing to its id by hand would drop the
    // second leg.
    onClose();
    routeMission(r.id);
    setScreen('exploration');
  };

  const dropRow = (c: CardModel) => {
    if (c.discardable) discardLead(c.id);
    else if (c.abandonKind) abandonContract(c.abandonKind, c.id);
    setArmedDrop(null);
  };

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
              cards.map((c) => {
                const rowKey = `${c.family}:${c.id}`;
                const armed = armedDrop === rowKey;
                return (
                <View key={rowKey} style={styles.card}>
                  <View style={styles.titleRow}>
                    <Text style={styles.kind}>{c.kindLabel}</Text>
                    {!c.tracked ? <Text style={styles.paused}>⏸ PAUSED</Text> : null}
                  </View>
                  <Text style={styles.title}>{c.title}</Text>
                  <Text style={styles.meta}>
                    {c.ready
                      ? 'READY TO HAND IN'
                      : c.stageTotal > 1
                        ? `STEP ${c.stageNo} OF ${c.stageTotal}`
                        : 'OPEN'}
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
                  {/* ⚠ OTA-1618 — the family's own sentence: a bounty's tally and
                      clock, a whisper's next step, a lead's complication. */}
                  {c.note ? <Text style={styles.note}>{c.note}</Text> : null}

                  {/* ⚠⚠ OTA-1617 — the walk, on the row that wants it. Absent
                      where it would be a lie: standing on the ground, or a beat
                      whose ground has no id to walk to. */}
                  {c.route ? (
                    <TouchableOpacity
                      style={styles.routeBtn}
                      onPress={() => takeRoute(c)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Set course to ${c.where} for ${c.title}`}
                    >
                      <Text style={styles.routeBtnText}>▸ SET COURSE TO {(c.where || 'IT').toUpperCase()}</Text>
                    </TouchableOpacity>
                  ) : null}

                  {/* ⚠⚠⚠ OTA-1618 — THE TAB'S OWN ACTIONS, ON THE ROW. Each one
                      is the same store call its Contracts section made, offered
                      exactly where the engine says this family allows it. */}
                  <View style={styles.actions}>
                    {c.turnInKind ? (
                      <TouchableOpacity
                        style={styles.handInBtn}
                        onPress={() => { onClose(); completeContractFromUI(c.turnInKind!, c.id); }}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Hand in ${c.title}`}
                      >
                        <Text style={styles.handInText}>✓ HAND IT IN</Text>
                      </TouchableOpacity>
                    ) : null}
                    {c.pauseKind ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, c.tracked ? styles.actionOn : styles.actionOff]}
                        onPress={() => setContractActive(c.pauseKind!, c.id, !c.tracked)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: c.tracked }}
                        accessibilityLabel={`${c.tracked ? 'Pause' : 'Set active'} ${c.title}`}
                      >
                        <Text style={[styles.actionText, c.tracked ? styles.actionTextOn : styles.actionTextOff]}>
                          {c.tracked ? '▮▮ PAUSE' : '▶ SET ACTIVE'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {c.abandonKind || c.discardable ? (
                      <TouchableOpacity
                        style={[styles.actionBtn, armed ? styles.dropArmed : styles.dropIdle]}
                        onPress={() => (armed ? dropRow(c) : setArmedDrop(rowKey))}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={
                          armed
                            ? `Confirm — ${c.discardable ? 'discard' : 'abandon'} ${c.title}`
                            : `${c.discardable ? 'Discard' : 'Abandon'} ${c.title}`
                        }
                      >
                        <Text style={[styles.actionText, armed ? styles.dropArmedText : styles.dropIdleText]}>
                          {armed
                            ? 'TAP AGAIN TO CONFIRM'
                            : c.discardable ? 'DISCARD' : 'ABANDON'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

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
                );
              })
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: { color: '#8f8570', fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  paused: { color: '#c96a6a', fontSize: 9, letterSpacing: 1, fontWeight: '700' },
  title: { color: '#e8dcc0', fontSize: 15, fontWeight: '700', marginTop: 2 },
  meta: { color: '#8f8570', fontSize: 10, letterSpacing: 1, fontWeight: '700', marginTop: 2 },
  ask: { color: '#c9a86a', fontSize: 13, lineHeight: 19, marginTop: 6 },
  where: { color: '#a2977b', fontSize: 12, lineHeight: 18, marginTop: 2 },
  here: { color: '#7fb069', fontSize: 12, lineHeight: 18, marginTop: 2, fontWeight: '700' },
  detail: { color: '#a2977b', fontSize: 12, lineHeight: 18, marginTop: 2 },
  note: { color: '#8f8570', fontSize: 11, lineHeight: 17, marginTop: 4, fontStyle: 'italic' },
  needHeld: { color: '#7fb069', fontSize: 12, lineHeight: 18, marginTop: 2 },
  needShort: { color: '#c96a6a', fontSize: 12, lineHeight: 18, marginTop: 2 },
  routeBtn: {
    marginTop: 8, borderWidth: 1, borderColor: '#c9a86a', borderRadius: 3,
    paddingVertical: 8, paddingHorizontal: 10, alignSelf: 'flex-start',
  },
  routeBtnText: { color: '#c9a86a', fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  actionBtn: {
    borderWidth: 1, borderRadius: 3, paddingVertical: 7, paddingHorizontal: 10,
    marginRight: 6, marginBottom: 6,
  },
  actionOn: { borderColor: '#7fb069' },
  actionOff: { borderColor: '#3a342c' },
  actionText: { fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  actionTextOn: { color: '#7fb069' },
  actionTextOff: { color: '#a2977b' },
  dropIdle: { borderColor: '#3a342c' },
  dropIdleText: { color: '#6f6656' },
  dropArmed: { borderColor: '#c96a6a', backgroundColor: '#2a1614' },
  dropArmedText: { color: '#e07a5f' },
  handInBtn: {
    backgroundColor: '#7fb069', borderRadius: 3, paddingVertical: 8, paddingHorizontal: 12,
    marginRight: 6, marginBottom: 6,
  },
  handInText: { color: '#141109', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
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
