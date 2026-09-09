// ⚠⚠⚠ OTA-1738 — THE GUIDANCE SCREEN: one place to reread everything the game
// ever taught. Settings → DISPLAY → GUIDANCE → REPLAY TEACHING.
//
// The 11B4DF audit found three bodies of teaching with no shared door: the
// outpost tutorial (TUTORIAL_STEPS, playable once per character), the screen
// orientation doc (TUTORIAL_DOCS_FULL, written for "a future Tutorial Replay
// panel" and never rendered), the first-use cards (dismissed once per install
// and gone), and the Action Reference (a screen no button reached). Owner
// decisions 9 and 10: the replay carries core + first-use teaching, grouped,
// with seen status, and the Action Reference is one of its tabs, so there is
// one authority for "how does this work".
//
// ⚠ READ-ONLY BY CONSTRUCTION. Listing a card here never writes its flag:
// `readSeenHintIds` is a read, the ✓ is a display, and a card that is unseen
// stays unseen so it still fires at its trigger. SHOW ALL TIPS AGAIN (in the
// same GUIDANCE card) is the only reset, and the global tips switch does not
// gate this screen — a player who turned tips off is exactly the player who
// needs a place to look things up.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { TScreenHeader, TTabBar } from '../ui/tartariaKit';
import { useGameStore } from '../state/gameStore';
import { TUTORIAL_STEPS, TUTORIAL_DOCS_FULL } from '../components/tutorialSteps';
import { ALL_TEACHINGS, type Teaching, type TeachingGroup } from '../components/teachingRegistry';
import { readSeenHintIds } from '../components/useFirstTimeHint';
import { ActionReferenceBody } from './ActionReferenceScreen';

export type GuidanceTab = 'core' | 'firstuse' | 'reference';

const GROUP_TITLES: Record<TeachingGroup, string> = {
  exploration: 'OUT IN THE WORLD',
  combat: 'FIGHTING',
  inventory: 'YOUR PACK',
  trade: 'TRADERS',
  crafting: 'THE BENCH',
  companions: 'COMPANIONS',
  screens: 'THE SCREENS',
};
const GROUP_ORDER: readonly TeachingGroup[] = ['exploration', 'combat', 'inventory', 'trade', 'crafting', 'companions', 'screens'];

/** The first-use cards, grouped in display order. Exported so a test can pin
 *  that every registry entry lands in exactly one group. */
export function groupTeachings(all: readonly Teaching[]): { group: TeachingGroup; title: string; items: Teaching[] }[] {
  return GROUP_ORDER
    .map((group) => ({ group, title: GROUP_TITLES[group], items: all.filter((t) => t.group === group) }))
    .filter((g) => g.items.length > 0);
}

export function GuidanceScreen() {
  const setScreen = useGameStore((s) => s.setScreen);
  const [tab, setTab] = useState<GuidanceTab>('core');
  const [seen, setSeen] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    void readSeenHintIds().then((ids) => { if (live) setSeen(ids); });
    return () => { live = false; };
  }, []);
  const groups = useMemo(() => groupTeachings(ALL_TEACHINGS), []);
  // The outpost beats: the welcome/orientation doc has its own card list, so the
  // core tab shows the playable beats first, then the screen tour.
  const coreBeats = useMemo(() => TUTORIAL_STEPS.filter((st) => !!st.title), []);
  const screenTour = useMemo(() => TUTORIAL_DOCS_FULL.filter((st) => !st.welcome), []);

  return (
    <View style={styles.container}>
      <TScreenHeader
        title="GUIDANCE"
        onBack={() => setScreen('about')}
          accessibilityLabel="Back to settings"
      />

      {/* ⚠⚠⚠ OTA-1780 — AND ADOPTING `TTabBar` IS WHERE THIS SCREEN'S THREE
          PINNED DEFECTS DIE. OTA-1776 wrote them down before anything moved:
            1. `tabText` was missing `fontWeight: '700'`, so these tabs rendered
               LIGHTER than every other screen's for no reason anybody chose;
            2. the selected label was `#e0c179` — a fourth off-brand gold that
               `check:gold` is blind to, exactly as it was blind to the two in
               Inventory. Nothing argued it was deliberate: no functional claim,
               no comment defending it;
            3. the selected chip's fill was `#221d15` against the kit's
               `#2a2520` — found by that pass rather than reported.
          All three are the kit's values now. This is the cover-first order
          paying off: each was a pin written to DIE here, so the fixes are
          visible in this diff instead of arriving as unremarked side effects. */}
      <TTabBar
        tabs={[
          { key: 'core', label: 'CORE', a11yLabel: 'Core tutorial' },
          { key: 'firstuse', label: 'FIRST-USE', a11yLabel: 'First-use teaching' },
          { key: 'reference', label: 'REFERENCE', a11yLabel: 'Action reference' },
        ]}
        value={tab}
        onChange={(k) => setTab(k as GuidanceTab)}
      />

      {tab === 'core' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            The outpost tutorial, as the Arbiter runs it for a new character — then the tour of the screens.
          </Text>
          <Text style={styles.sectionTitle} accessibilityRole="header">THE OUTPOST</Text>
          {coreBeats.map((st, i) => (
            <View key={st.id ?? `beat-${i}`} style={styles.card} accessibilityLabel={`Tutorial beat: ${st.title}`}>
              <Text style={styles.cardTitle}>{st.title}</Text>
              <Text style={styles.cardBody}>{st.body}</Text>
            </View>
          ))}
          <Text style={[styles.sectionTitle, { marginTop: 14 }]} accessibilityRole="header">THE SCREENS</Text>
          {screenTour.map((st, i) => (
            <View key={`tour-${i}`} style={styles.card} accessibilityLabel={`Screen tour: ${st.title}`}>
              <Text style={styles.cardTitle}>{st.title}</Text>
              <Text style={styles.cardBody}>{st.body}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'firstuse' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            Every card the game shows once, the first time a system comes up. ✓ marks the ones this
            install has already seen; the rest still fire in play. SHOW ALL TIPS AGAIN in Settings resets them.
          </Text>
          {groups.map((g) => (
            <View key={g.group} style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">{g.title}</Text>
              {g.items.map((t) => {
                const isSeen = seen.has(t.id);
                return (
                  <View
                    key={t.id}
                    style={styles.card}
                    accessibilityLabel={`${t.title}${isSeen ? ', seen' : ', not yet seen'}`}
                  >
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{t.title}</Text>
                      <Text style={[styles.seen, isSeen ? styles.seenYes : styles.seenNo]}>{isSeen ? '✓ SEEN' : 'NOT YET'}</Text>
                    </View>
                    <Text style={styles.when}>Shows: {t.when}</Text>
                    <Text style={styles.cardBody}>{t.body}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'reference' && <ActionReferenceBody />}
    </View>
  );
}

const styles = StyleSheet.create({
  // ⚠⚠ OTA-1780 — `header`, `backBtn`, `backText` and `title` moved to the kit
  // (`TScreenHeader`). Cover was written FIRST, in OTA-1776, so the diff below
  // is measured rather than hoped: see that suite for exactly which of these
  // four values already matched the kit and which move.
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  intro: { color: '#a2977b', fontSize: 12, fontStyle: 'italic', marginBottom: 12, paddingHorizontal: 4, lineHeight: 17 },
  section: { marginBottom: 14 },
  sectionTitle: {
    color: '#c9a86a', fontSize: 13, letterSpacing: 2, fontWeight: '700',
    marginBottom: 6, paddingBottom: 4, borderBottomColor: '#3a342c', borderBottomWidth: 1,
  },
  card: {
    backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4,
    padding: 10, marginBottom: 8,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', marginBottom: 4, flexShrink: 1 },
  seen: { fontSize: 10, letterSpacing: 1.5, marginLeft: 8 },
  seenYes: { color: '#9ec96a' },
  seenNo: { color: '#6b5c3a' },
  when: { color: '#8aa0a4', fontSize: 11, fontStyle: 'italic', marginBottom: 6 },
  cardBody: { color: '#cfc6b2', fontSize: 12, lineHeight: 18 },
});
