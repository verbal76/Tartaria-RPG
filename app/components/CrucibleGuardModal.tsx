// CrucibleGuardModal — OTA-1552. The "are you sure about that?" the game never asked.
//
// ⚠⚠⚠ WHY THIS IS A PICKER AND NOT A YES/NO. The owner asked for it in one
// sentence: *"some of these items are for the crucible would you like to save
// them? and then I see you there get a pop-up asking which ones I want to save or
// a save all button for crucible."* A bare confirm would technically close the
// hole — he'd stop losing material without knowing — but it would put the whole
// decision on a single tap made at the worst possible moment, mid-repair, with a
// list of eight names he has to hold in his head. The picker lets the answer be
// partial, which is what the real answer usually is: keep the two curiosities you
// were saving, let the tar go.
//
// ⚠⚠ EVERYTHING IS TICKED WHEN IT OPENS. The guard only ever fires on material
// the Crucible would have taken, so "save it" is the answer that matches why the
// modal exists at all. Untick what you're happy to burn.
//
// ⚠ SPENDING IS THE ONLY DESTRUCTIVE BUTTON AND IT LOOKS LIKE ONE. It sits last,
// alone, in red. Nothing about tapping past this modal quickly ends with material
// gone: the backdrop and the hardware back close it as CANCEL, which spends and
// saves nothing.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, TouchableWithoutFeedback } from 'react-native';
import { useGameStore } from '../state/gameStore';
// ⚠ OTA-1836 — this presentation surface reaches real gameplay mutations.
import { useHumanAction } from '../state/humanActivity';
// ⚠⚠⚠ OTA-1864 — THE GUARD THAT WAS NEVER ANSWERED, AND COULD NOT BE READ.
// On 2026-09-21 this modal came up over `craft Mudstone` at 21:34:03.760 and no
// answer ever ran; JS stayed demonstrably alive to 21:34:21.255 and the owner
// force-closed. Which of "no touch reached JS" / "touch reached the surface but
// not the control" / "the handler never began" happened is UNDECIDABLE, because
// this file emitted nothing. It is not a hypothetical gap: TWO answers on THIS
// modal, 25 seconds earlier in the same session, also left no record.
//
// ⚠⚠ OBSERVATION ONLY. No <Modal> prop changes, no onDismiss, no
// presentationHandoff, no mounting change, no new async boundary, no timer. The
// ladder below is the SHIPPED OTA-1813/1818 vocabulary, nothing invented.
import { noteRootTouch, notePressIn, noteHandlerEnter, noteStage } from '../diagnostics/touchPath';

import { tartariaKitStyles as kit, tRowStyle } from '../ui/tartariaKit';
/* ⚠⚠⚠ PHASE 3 — THE PLANES ARE THE DEPTH; the kit style is only the material.
 * Each fragment below belongs to ONE physical family, and which one a control
 * gets is decided by its INTERACTION CONTRACT, never by what its style key is
 * called: CTL for a thing you strike, TAB for a thing you switch between, ROW
 * for a thing you select or open. A full-width list row wearing the command
 * key's sidewall is the same category error as a button with no depth at all.
 *
 * ⚠⚠ They are absolutely positioned, `pointerEvents="none"` children inside a
 * box the control already owns, so adopting them moves nothing by a pixel, and
 * any SEMANTIC colour the call site already carries layers on top and still
 * wins. Construction is what the object IS; state is what it is IN. */
/** ⚠⚠⚠ OTA-1806 — THE PLANES ARE A FUNCTION OF THE FINGER NOW.
 *  Pressed, the sidewall collapses and crosses to the TOP, the light catches
 *  BELOW the face, and the contact band is not drawn — a key pushed home is not
 *  standing on anything. Frozen at their resting heights, as these were, a key
 *  could travel 3dp and never lose height, which is most of a depression. */
const ctlPlanes = (pressed: boolean) => (
  <>
    <View style={pressed ? kit.controlPlaneTopPressed : kit.controlPlaneTop} pointerEvents="none" />
    <View style={pressed ? kit.controlPlaneBottomPressed : kit.controlPlaneBottom} pointerEvents="none" />
    {pressed ? null : <View style={kit.controlPlaneContact} pointerEvents="none" />}
  </>
);
/** The resting planes, for a surface that has no press to report. */
const CTL_PLANES = ctlPlanes(false);
const ROW_PLANES = (
  <>
    <View style={kit.chassisPlaneTop} pointerEvents="none" />
    <View style={kit.chassisPlaneBottom} pointerEvents="none" />
    <View style={kit.chassisPlaneContact} pointerEvents="none" />
  </>
);

export function CrucibleGuardModal() {
  const prompt = useGameStore((s) => s.crucibleGuardPrompt);
  const resolve = useHumanAction('resolveCrucibleGuard');

  // Ticked = "save this one". Re-seeded every time a new guard is raised, so a
  // second prompt in the same REPAIR ALL never inherits the last one's ticks.
  const [ticked, setTicked] = useState<string[]>([]);
  const seed = useMemo(() => (prompt ? prompt.atRisk.map((a) => a.id).join('|') : ''), [prompt]);
  useEffect(() => {
    setTicked(prompt ? prompt.atRisk.map((a) => a.id) : []);
  }, [seed, prompt]);

  /* ⚠⚠⚠ OTA-1864 — REACT PRESENTATION LIFETIME. NOT NATIVE DISMISSAL.
   *
   * This component still does `if (!prompt) return null`, so the <Modal>
   * unmounts and — per react-native 0.81.5's Modal, which drops its
   * `modalDismissed` subscription in componentWillUnmount — NOTHING here can
   * know when iOS finished tearing the window down. OTA-1863 is where that
   * distinction was learned and it is not being blurred now: `react-mount` and
   * `react-unmount` claim the React layer and only the React layer.
   *
   * ⚠ WHAT IT BUYS. A recurrence can say whether the guard was still presented
   * (React-wise) for the whole silent interval, which separates "the answer ran
   * and the card stayed up" from "the card was never up". `#0` is OTA-1814's
   * non-interaction id — `nextId` starts at 1, so it can never collide. */
  const presented = useRef(false);
  useEffect(() => {
    const up = prompt !== null;
    if (presented.current === up) return;
    presented.current = up;
    noteStage(0, 'pres', {
      control: 'craft:crucible-guard',
      reason: up ? 'react-mount' : 'react-unmount',
    });
  }, [prompt]);

  if (!prompt) return null;

  const atRisk = prompt.atRisk;
  const spendUnits = atRisk.reduce((sum, a) => sum + a.quantity, 0);
  const verb = prompt.action === 'repair' ? 'Repairing' : 'Crafting';
  const allTicked = ticked.length === atRisk.length;
  const noneTicked = ticked.length === 0;

  const toggle = (id: string) =>
    setTicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const close = () => resolve('cancel');

  /* ⚠⚠⚠ OTA-1864 — THE LADDER, IN WORDS THAT ALREADY EXIST.
   *   root     — the capture below: a finger reached this surface at all
   *   in       — onPressIn: it reached THIS control
   *   enter    — the control's own callback began
   *   dispatch — execution reached the store action
   *   done     — the SYNCHRONOUS action returned
   * A missing rung is the finding. Production never interprets it; the reader does.
   *
   * ⚠⚠ NO try/catch, DELIBERATELY. If `run` throws, `done` is simply never
   * written — which IS the signal — and the exception propagates exactly as it
   * does today. Catching it would change behaviour and destroy the evidence.
   * ⚠ `run` is called inline: no promise, no scheduler, no new boundary. */
  const answered = (control: string, run: () => void) => () => {
    const tp = noteHandlerEnter(control);
    noteStage(tp, 'dispatch', { control });
    run();
    noteStage(tp, 'done', { control });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <TouchableWithoutFeedback
        onPressIn={(e) => { notePressIn('guard:backdrop', e); }}
        onPress={answered('guard:backdrop', close)}
      >
        <View
          style={styles.backdrop}
          /* ⚠⚠⚠ OTA-1864 — MODAL_TOUCH, exactly as ClimbModal/GatherModal/
             SearchModal carry it. This card is presented by a native <Modal>, so
             its content is NOT inside CraftingScreen's tree and the T0 observer
             there never sees these touches. CAPTURE PHASE, RETURNS FALSE: this
             view never becomes the responder, so every control below keeps the
             responder negotiation it has today, unchanged. */
          onStartShouldSetResponderCapture={() => { noteRootTouch('modal'); return false; }}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.card}>
              <Text style={styles.kicker}>♥ CRUCIBLE STOCK</Text>
              <Text style={styles.title}>Save these for the forge?</Text>
              <Text style={styles.body}>
                {verb} the {prompt.label} would spend {spendUnits}{' '}
                {spendUnits === 1 ? 'piece' : 'pieces'} of material the Fusing Crucible
                accepts. Tick what you want held back.
              </Text>

              <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
                {atRisk.map((a) => {
                  const on = ticked.includes(a.id);
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => toggle(a.id)}
                      style={[tRowStyle(), styles.row, on && styles.rowOn]}
                    >
                      <Text style={[styles.box, on && styles.boxOn]}>{on ? '♥' : '☐'}</Text>
                      <View style={styles.rowText}>
                        <Text style={[styles.rowName, on && styles.rowNameOn]}>{a.name}</Text>
                        <Text style={styles.rowMeta}>
                          {a.quantity} would be spent{a.held > a.quantity ? ` · you hold ${a.held}` : ''}
                        </Text>
                      </View>
                      {ROW_PLANES}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.note}>
                Saving reserves the whole stack and stops here — nothing is mended and
                nothing is spent.
              </Text>

              <Pressable
                style={styles.saveAll}
                onPressIn={(e) => { notePressIn('guard:save-all', e); }}
                onPress={answered('guard:save-all', () => resolve('save-all'))}
              >
                <Text style={styles.saveAllText}>♥ SAVE ALL FOR THE CRUCIBLE</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [kit.ctl, styles.saveSome, (noneTicked || allTicked) && styles.dim, pressed && kit.controlPressed]}
                disabled={noneTicked || allTicked}
                /* ⚠ A DISABLED Pressable never runs onPressIn OR onPress, so a tap
                   here writes NOTHING below `root`. That is correct and is not a
                   rejection: nothing was addressed, so nothing refused. */
                onPressIn={(e) => { notePressIn('guard:save-ticked', e); }}
                onPress={answered('guard:save-ticked', () => resolve('save', ticked))}
              >
{({ pressed }) => (<>
                <Text style={styles.saveSomeText}>
                  SAVE TICKED ({ticked.length}) · SPEND THE REST
                </Text>
                {ctlPlanes(pressed)}
              </>)}
</Pressable>

              <View style={styles.footRow}>
                <Pressable
                  style={({ pressed }) => [kit.ctl, styles.cancel, pressed && kit.controlPressed]}
                  onPressIn={(e) => { notePressIn('guard:cancel', e); }}
                  onPress={answered('guard:cancel', close)}
                >
{({ pressed }) => (<>
                  <Text style={styles.cancelText}>CANCEL</Text>
                  {ctlPlanes(pressed)}
                </>)}
</Pressable>
                <Pressable
                  style={({ pressed }) => [kit.ctl, styles.spend, pressed && kit.controlPressed]}
                  onPressIn={(e) => { notePressIn('guard:spend', e); }}
                  onPress={answered('guard:spend', () => resolve('spend'))}
                >
{({ pressed }) => (<>
                  <Text style={styles.spendText}>SPEND IT ALL</Text>
                  {ctlPlanes(pressed)}
                </>)}
</Pressable>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#161310',
    borderColor: '#8a6a2f',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
  },
  kicker: { color: '#d99b4e', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  title: { color: '#f0c96a', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  body: { color: '#c9bda9', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  list: { maxHeight: 220, marginBottom: 10 },
  listInner: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#3a332a',
    backgroundColor: '#1e1a15',
  },
  rowOn: { borderColor: '#a8763a', backgroundColor: '#2a2117' },
  box: { color: '#6c6255', fontSize: 15, width: 18, textAlign: 'center' },
  boxOn: { color: '#f0c96a' },
  rowText: { flex: 1 },
  rowName: { color: '#b9ae9c', fontSize: 13, fontWeight: '600' },
  rowNameOn: { color: '#f0c96a' },
  rowMeta: { color: '#7e7466', fontSize: 11 },
  note: { color: '#8b8172', fontSize: 11, fontStyle: 'italic', lineHeight: 16, marginBottom: 12 },
  saveAll: {
    backgroundColor: '#f0c96a',
    borderRadius: 5,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveAllText: { color: '#241a09', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  saveSome: {
    borderWidth: 1,
    borderColor: '#8a6a2f',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveSomeText: { color: '#d99b4e', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  dim: { opacity: 0.35 },
  footRow: { flexDirection: 'row', gap: 10 },
  cancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#4a4238',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { color: '#9a9080', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  spend: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#7d3535',
    backgroundColor: '#2a1616',
    borderRadius: 5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  spendText: { color: '#d97a7a', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
});
