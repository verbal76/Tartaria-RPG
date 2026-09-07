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
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('about')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">GUIDANCE</Text>
        <View style={{ width: 80 }} />
      </View>

      <View style={styles.tabRow}>
        {(['core', 'firstuse', 'reference'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            accessibilityLabel={t === 'core' ? 'Core tutorial' : t === 'firstuse' ? 'First-use teaching' : 'Action reference'}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'core' ? 'CORE' : t === 'firstuse' ? 'FIRST-USE' : 'REFERENCE'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  backBtn: {
    backgroundColor: '#1a1714', paddingHorizontal: 12, paddingVertical: 6,
    borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, width: 80, alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#e6d8b3', letterSpacing: 4, fontSize: 14 },
  tabRow: { flexDirection: 'row', marginBottom: 10, gap: 6 },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 8,
    borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, backgroundColor: '#1a1714',
  },
  tabActive: { borderColor: '#c9a86a', backgroundColor: '#221d15' },
  tabText: { color: '#a2977b', fontSize: 12, letterSpacing: 2 },
  tabTextActive: { color: '#e0c179' },
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
