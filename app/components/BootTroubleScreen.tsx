import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';

import { tartariaKitStyles as kit } from '../ui/tartariaKit';
/* ⚠⚠⚠ BOOT-HANG-1741 — THE SPINNER MUST NOT BE A DEAD END.
 *
 * The failure this exists for: OTA-1741 put `Promise.allSettled` on the launch
 * path; a runtime without it threw inside `hydrate()`, the rejection landed in
 * App.tsx's `.catch`, and `hydrated` was never set — so the app rendered its
 * pre-hydration spinner (near-black, one gold ActivityIndicator) FOREVER, on
 * every cold start, with no Settings screen, no log push, no bug report and no
 * way for the owner to say anything about it except "it spins".
 *
 * ⚠⚠ WHAT THIS IS NOT. It is NOT "set hydrated after a timeout". Nothing here
 * pretends the boot succeeded: `hydrated` stays false, the title screen is not
 * shown, no save is read, written or repaired, and the game cannot be entered
 * from here. This screen exists to convert an unreportable brick into a
 * reported, retryable, UPDATABLE one — which is the property the boot path was
 * missing, not a shortcut past initialisation.
 *
 * ⚠ THE THREE DOORS, in the order a stuck player needs them:
 *   RETRY            — hydration is idempotent; the overwhelmingly common cause
 *                      of a stall is one storage read, and one more attempt is
 *                      free and non-destructive.
 *   CHECK FOR UPDATE — the repair door. The boot OTA check runs AFTER hydrate
 *                      resolves, so a boot that never resolves never checks;
 *                      this is the same call the title screen's button makes,
 *                      reachable from a screen the player can actually see.
 *   COPY DIAGNOSTIC  — the last boot stage the app reached, verbatim, so the
 *                      owner can paste it into a message without Settings.
 *
 * ⚠ It takes NO game state and reads NO store, so it can render on a boot that
 * failed at any point — including one that failed before the store had anything
 * in it at all. */

export interface BootTroubleProps {
  /** The last stage `setStage` recorded — the whole point of the durable ledger. */
  stage: string;
  /** The rejection's message, when the boot rejected rather than stalled. */
  message?: string | null;
  /** True when nothing rejected and the gate simply never opened. */
  stalled: boolean;
  onRetry: () => void;
  onCheckForUpdate: () => Promise<string> | string;
  onCopyDiagnostic: () => void;
}

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

export function BootTroubleScreen({
  stage, message, stalled, onRetry, onCheckForUpdate, onCopyDiagnostic,
}: BootTroubleProps) {
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>TARTARIA DID NOT FINISH STARTING</Text>
        {/* ⚠ Said first and said plainly. A player looking at a stuck launcher
            assumes the worst thing, and the worst thing is not what happened:
            nothing here has touched a save. */}
        <Text style={styles.reassure}>
          Your characters are safe. Nothing has been deleted, changed or
          overwritten — the app stopped before it opened anything.
        </Text>
        <Text style={styles.detailLabel}>WHERE IT STOPPED</Text>
        <Text style={styles.detail}>{stage || '(no stage recorded)'}</Text>
        {message ? (
          <>
            <Text style={styles.detailLabel}>WHAT IT SAID</Text>
            <Text style={styles.detail}>{message}</Text>
          </>
        ) : stalled ? (
          <Text style={styles.detail}>
            No error — the startup step above never finished.
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [kit.ctl, styles.primaryBtn, pressed && kit.controlPressed]}
          onPress={() => { setNote(null); onRetry(); }}
          accessibilityRole="button"
        >
{({ pressed }) => (<>
          <Text style={styles.primaryBtnText}>TRY STARTING AGAIN</Text>
          {ctlPlanes(pressed)}
        </>)}
</Pressable>

        {/* ⚠ THE REPAIR DOOR. A build that cannot boot cannot reach the update
            check on its own — that check is chained after hydration. */}
        <Pressable
          style={({ pressed }) => [kit.ctl, styles.secondaryBtn, busy && styles.btnDisabled, pressed && kit.controlPressed]}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          onPress={() => {
            setBusy(true);
            setNote('Checking…');
            void (async () => {
              try {
                const r = await onCheckForUpdate();
                setNote(String(r));
              } catch {
                setNote('Update check failed — try again on a better connection.');
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
{({ pressed }) => (<>
          <Text style={styles.secondaryBtnText}>CHECK FOR AN UPDATE</Text>
          {ctlPlanes(pressed)}
        </>)}
</Pressable>

        <Pressable
          style={({ pressed }) => [kit.ctl, styles.secondaryBtn, pressed && kit.controlPressed]}
          accessibilityRole="button"
          onPress={() => { onCopyDiagnostic(); setCopied(true); }}
        >
{({ pressed }) => (<>
          <Text style={styles.secondaryBtnText}>
            {copied ? '✓ COPIED — PASTE IT TO THE DEV' : 'COPY DIAGNOSTIC'}
          </Text>
          {ctlPlanes(pressed)}
        </>)}
</Pressable>

        {note ? <Text style={styles.note}>{note}</Text> : null}
        <Text style={styles.footer}>
          If an update installs, close Tartaria completely and open it again.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0908' },
  body: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 10 },
  title: { color: '#c9a86a', fontSize: 15, fontWeight: '800', letterSpacing: 2, textAlign: 'center', marginBottom: 4 },
  reassure: { color: '#e6d8b3', fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 10 },
  detailLabel: { color: '#8e7548', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginTop: 6 },
  detail: { color: '#a2977b', fontSize: 12, fontFamily: undefined },
  primaryBtn: {
    marginTop: 18, backgroundColor: '#3a342c', borderColor: '#c9a86a', borderWidth: 1,
    borderRadius: 4, paddingVertical: 13, alignItems: 'center',
  },
  primaryBtnText: { color: '#e6d8b3', fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  secondaryBtn: {
    marginTop: 8, backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1,
    borderRadius: 4, paddingVertical: 12, alignItems: 'center',
  },
  secondaryBtnText: { color: '#cdbf99', fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  btnDisabled: { opacity: 0.55 },
  note: { color: '#c9a86a', fontSize: 12, textAlign: 'center', marginTop: 10 },
  footer: { color: '#7e7461', fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 16 },
});
