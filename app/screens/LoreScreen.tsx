// v2.4.1 (OTA 046) — LoreScreen is now a thin wrapper around the
// shared LoreCodexBody component. The body moved out so the same
// content can render in the gear-icon AboutScreen tab (player ask:
// "always accessible from the gear icon"). The standalone screen
// stays for any external navigation path that lands on 'lore'.

import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TScreenHeader } from '../ui/tartariaKit';
import { useGameStore } from '../state/gameStore';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { TEACHINGS as TEACH } from '../components/teachingRegistry'; // OTA-1738
import { LoreCodexBody } from '../components/LoreCodexBody';
import type { Section } from '../components/LoreCodexBody';
import { takeLoreJump } from '../ui/loreJump';
import type { LoreJump } from '../ui/loreJump';

export function LoreScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  // ⚠⚠ OTA-1292 — BACK GOES WHERE YOU CAME FROM. This screen was built as a
  // title-menu destination and its BACK was hard-wired setScreen('title') —
  // then the exploration crest nav (◈ LORE) started linking here MID-GAME, and
  // reading the bestiary ended with the player dumped onto the character
  // select. Owner, after clearing the beginner outpost: "I hit the back button
  // and it dropped me to the character selection screen." With a live
  // character, BACK returns to the game; only the true title-menu path leaves.
  const inSession = useGameStore((s) => s.player !== null);
  /* ⚠⚠⚠ OTA-1783 — A LOOK-UP JUMP GOES BACK EXACTLY WHERE IT CAME FROM.
   * Owner, on the combat glyph reference: *"Back must return cleanly to the
   * exact active combat state. Do not dump the player onto another screen,
   * character selection, exploration, or the Lore root."*
   * The rule above is a good DEFAULT and a bad promise: it re-derives the
   * destination from whether a character exists, which is a guess. `loreJump`
   * carries the screen the player actually left, captured at the jump, so BACK
   * is a recorded fact rather than a rule that has to be right about every
   * path. The default stays for every ordinary visit — OTA-1292's fix is
   * untouched — and the jump wins only when there is one.
   * ⚠ NOTHING HERE RESTORES A FIGHT, because nothing has to: combat is store
   * state and `exploration` is the screen it is fought on, so the round trip
   * never touched it. That is the whole reason this could be a navigation
   * change rather than a combat one. */
  /* ⚠ READ ONCE PER MOUNT. `takeLoreJump` clears as it reads, and the ref is
   * what keeps a second render of the SAME mount from finding it already gone.
   * `undefined` means "not looked yet"; `null` means "looked, nothing there". */
  const jump = useRef<LoreJump | null | undefined>(undefined);
  if (jump.current === undefined) jump.current = takeLoreJump();
  const loreJump = jump.current;

  return (
    <View style={styles.container}>
      <FirstTimeHint id={TEACH.lore_first_open.id} title={TEACH.lore_first_open.title} body={TEACH.lore_first_open.body} />
      <TScreenHeader
        title="LORE CODEX"
        onBack={() => setScreen(loreJump?.returnTo ?? (inSession ? 'exploration' : 'title'))}
          accessibilityLabel="Back"
      />

      <LoreCodexBody openAt={loreJump?.section as Section | undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  // ⚠⚠ OTA-1780 — `header`, `backBtn`, `backText` and `title` moved to the kit
  // (`TScreenHeader`). Cover was written FIRST, in OTA-1776, so the diff below
  // is measured rather than hoped: see that suite for exactly which of these
  // four values already matched the kit and which move.
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
});
