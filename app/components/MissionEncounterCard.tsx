// ⚠⚠⚠ OTA-1581 — THE MISSION CONVERSATION CARD.
//
// Owner's design, in his words: *"if each of these missions has a stage where I
// have to meet a guy to get a note — but I'm going to get jumped by 3 raiders —
// then maybe it should have a conversation card like Yulka. as soon as I get on
// that tile and that mission is active, it pops up … I think each individual
// instance of a thing that you're specifically there to do should have a pop-up
// … nothing can interrupt that conversation until you make a choice of all of
// the available options. that way you can't miss what you're there for."*
//
// ⚠⚠ IT IS A POPUP, NOT A BAR, AND THAT IS THE OPPOSITE OF OTA-1547. The Yulka
// sheet deliberately used a bar — a card that opens itself covers the thing the
// player is reading, and her meet fires while you are walking past. This is the
// other case: you WALKED HERE for this, from the Contracts screen, following a
// course you set. There is nothing to interrupt. The owner asked for the popup
// by name and the reason is sound.
//
// ⚠⚠ THERE IS NO STEP-BACK. Every other sheet in the game has one. This one's
// exits are its buttons — including WALK AWAY, which is always offered, because
// a modal with no exit is how a player gets wedged on a check they cannot pass.
// Android's back button is deliberately inert here for the same reason: the
// choice is the point.
//
// ⚠ AND IT YIELDS TO COMBAT, like every other sheet. Owner's rule 8: the fight
// happens on the exploration screen and the card comes back afterwards to
// resolve the rest.

import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { armedEncounter } from '../engine/missionEncounterArm';
import {
  choicesFor,
  freshEncounter,
  persuadeDc,
  type EncounterChoice,
  type EncounterState,
} from '../engine/missionEncounter';

/** ⚠ THE BUTTON SAYS WHAT HAPPENS. A generic CONTINUE is how a beat gets missed
 *  even after it has been given a button — the exact failure this card exists to
 *  end. So PROCEED is labelled from the stage's own bindings first (the item
 *  changing hands is the most concrete thing in the beat) and only falls back to
 *  the verb when the stage moves no goods. */
function proceedLabel(needs: string | null, gives: string | null, verb: string | null): string {
  if (needs) return `HAND OVER ${needs.toUpperCase()}`;
  if (gives) return `TAKE ${gives.toUpperCase()}`;
  switch (verb) {
    case 'investigate': return 'LOOK IT OVER WITH THEM';
    case 'stealth': return 'SLIP PAST';
    case 'diplomacy': return 'HEAR THEM OUT';
    case 'cast': return 'WORK THE AETHER';
    case 'boss': return 'SETTLE IT HERE';
    default: return 'GET ON WITH IT';
  }
}

const LABEL: Record<EncounterChoice, string> = {
  proceed: 'GET ON WITH IT',
  persuade: 'TALK THEM DOWN',
  fight: 'DRAW ON THEM',
  flee: 'WALK AWAY',
  take: 'TAKE IT AND GO',
  take_and_kill: 'TAKE IT — AND FINISH THEM',
};

export function MissionEncounterCard() {
  // ⚠ Subscribe to the PLAYER, derive the encounter. A selector that returns
  // `armedEncounter(...)`'s fresh object every call hands zustand a new snapshot
  // on every render and spins — the OTA-1549 lesson, same shape.
  const player = useGameStore((s) => s.player);
  const enemies = useGameStore((s) => s.currentScene?.enemies?.length ?? 0);
  const answer = useGameStore((s) => s.answerMissionEncounter);
  const summon = useGameStore((s) => s.summonMissionEncounter);

  const armed = useMemo(() => armedEncounter(player), [player]);
  const st: EncounterState | null = useMemo(
    () => (armed ? player?.missionEncounters?.[armed.key] ?? freshEncounter(armed.key) : null),
    [armed, player?.missionEncounters],
  );

  if (!armed || !st) return null;
  // Combat owns the screen — the card is waiting for it to finish (rule 8).
  if (enemies > 0) return null;
  if (st.phase === 'resolved') return null;

  // ⚠ A fight the player walked out of parks the encounter in `fighting` with
  // nothing left on the tile. It gets the same SUMMON handle a flee does, rather
  // than a card with no buttons and no way back to the beat.
  const stranded = st.phase === 'fled' || st.phase === 'fighting';
  if (stranded) {
    return (
      <TouchableOpacity
        style={styles.summonBar}
        onPress={summon}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Summon ${armed.person.name} — the business here is not finished`}
      >
        <Text style={styles.summonText}>▸ SUMMON {armed.person.name.toUpperCase()}</Text>
        <Text style={styles.summonHint}>{armed.missionTitle} — unfinished</Text>
      </TouchableOpacity>
    );
  }

  const choices = choicesFor(st, {
    hasFight: armed.hasFight,
    canPersuade: armed.canPersuade,
    canKill: armed.person.canKill,
  });
  const dc = persuadeDc(armed.stakes, armed.person.predecessorsKilled);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.kicker}>{armed.missionTitle.toUpperCase()}</Text>
            <Text style={styles.npcName}>{armed.person.name}</Text>
            {/* The post is addressable on its own — owner's rule 1 — so it is
                printed, and it is how a returning player knows this is the same
                office even when the face has changed. */}
            {armed.person.role ? <Text style={styles.title}>{armed.person.title}</Text> : null}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
            {armed.narration ? <Text style={styles.narration}>{armed.narration}</Text> : null}
            {armed.arbiter ? <Text style={styles.arbiter}>{armed.arbiter}</Text> : null}
            {/* ⚠ A SUCCESSOR SAYS SO. Owner's rule 12: *"they are prepared to
                die."* A player who cleared this post before should be told
                exactly why the room is colder than last time. */}
            {armed.person.isSuccessor ? (
              <Text style={styles.note}>
                {armed.person.name} holds this post because you emptied it. They know it, and
                they have already decided how this ends.
              </Text>
            ) : null}
            {armed.owed ? (
              <Text style={styles.note}>
                Nothing can move here until you are carrying {armed.owed}.
              </Text>
            ) : null}
          </ScrollView>

          {choices.map((c) => {
            const primary = c === 'proceed' || c === 'take';
            const danger = c === 'fight' || c === 'take_and_kill';
            return (
              <TouchableOpacity
                key={c}
                style={[styles.btn, primary && styles.btnPrimary, danger && styles.btnDanger]}
                onPress={() => answer(c)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={c === 'proceed'
                  ? proceedLabel(armed.needs, armed.gives, armed.verb)
                  : LABEL[c]}
              >
                <Text style={[styles.btnText, primary && styles.btnTextPrimary, danger && styles.btnTextDanger]}>
                  {c === 'proceed' ? proceedLabel(armed.needs, armed.gives, armed.verb) : LABEL[c]}
                </Text>
                {/* ⚠ THE BAR IS PRINTED ON THE BUTTON. The owner's ruling was that
                    the social route should reward a build — which is only true if
                    the player can see what the build has to clear. */}
                {c === 'persuade' ? (
                  <Text style={styles.btnHint}>{armed.stakes} · DC {dc} · one attempt, ever</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

// The whisper sheet's palette — a mission conversation must read as the same
// kind of place as Yulka's fire, because it is the same kind of moment.
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 22,
    backgroundColor: 'rgba(0,0,0,0.86)',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: '#13110f',
    borderColor: '#f0c96a',
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  header: { gap: 2 },
  kicker: { color: '#c9a86a', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  npcName: { color: '#cdbf99', fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#8aa0a4', fontSize: 12, fontStyle: 'italic' },
  body: {
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 6,
    backgroundColor: '#0f0d0b',
    paddingHorizontal: 10,
  },
  bodyInner: { paddingVertical: 10, gap: 10 },
  narration: { color: '#e6d8b3', fontSize: 15, lineHeight: 22 },
  arbiter: { color: '#c9a86a', fontSize: 14, lineHeight: 21, fontStyle: 'italic' },
  note: {
    color: '#8aa0a4',
    fontSize: 13,
    lineHeight: 20,
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  btn: {
    borderColor: '#6b5c3a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#17150f',
  },
  // The game's own convention for A THING YOU CAN USE RIGHT NOW is a filled
  // plate (OTA-1549) — so the beat you walked here for is the filled one.
  btnPrimary: { backgroundColor: '#f0c96a', borderColor: '#f7dc9a' },
  btnDanger: { backgroundColor: '#2a1414', borderColor: '#8c4a4a' },
  btnText: { color: '#e6d8b3', fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  btnTextPrimary: { color: '#241a09' },
  btnTextDanger: { color: '#e8b8b8' },
  btnHint: { color: '#8aa0a4', fontSize: 10, fontStyle: 'italic', marginTop: 3 },
  summonBar: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
    backgroundColor: '#17150f',
    borderColor: '#6b5c3a',
  },
  summonText: { color: '#c9a86a', fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  summonHint: { color: '#8aa0a4', fontSize: 11, fontStyle: 'italic', marginTop: 2 },
});
