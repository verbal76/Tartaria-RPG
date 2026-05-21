import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { GameLogEntry, LogChannel } from '../engine/types';

interface Props {
  entries: GameLogEntry[];
  /** Names of enemies currently on the field, used to highlight enemy
   *  mentions inline within world / combat / reward text in the combat
   *  color so they stand out as the live threats. */
  enemyNames?: string[];
}

// Color palette per the user's spec:
//   - WORLD = one unified color (description, system meta, rewards).
//   - ARBITER = amber, gets a label so you know who is talking.
//   - PLAYER = blue (their own input echoed back).
//   - COMBAT = warning red — used both as the combat log color AND as
//     the inline highlight for enemy names appearing inside world text
//     so the live threat is easy to scan.
const WORLD_COLOR = '#cdbf99';
const ARBITER_COLOR = '#c9a86a';
const PLAYER_COLOR = '#7fb8ff';
const COMBAT_COLOR = '#e07a5f';
const REWARD_COLOR = '#9ec96a';

const channelColors: Record<LogChannel, string> = {
  player: PLAYER_COLOR,
  arbiter: ARBITER_COLOR,
  world: WORLD_COLOR,
  system: WORLD_COLOR,
  combat: COMBAT_COLOR,
  reward: REWARD_COLOR,
  cognitive: '#7a705c',
  debug: '#605648',
  // OTA 202 — designer notes from the 📝 button. Distinct accent so
  // a glance distinguishes them from world prose during a long
  // copy-paste / scroll-back review.
  feedback: '#c97aa8',
};

// `cognitive` (MiniLM emotion/intent) and `debug` (parser, combat range
// transitions) are diagnostic noise — kept in the on-disk log via
// COPY ALL but never shown in-game. `system` is now folded visually into
// the world voice; the underlying channel is preserved so the on-disk
// log is still searchable.
const HIDDEN_CHANNELS: ReadonlySet<LogChannel> = new Set(['cognitive', 'debug']);

// Only these channels get a label tag above the text. Everything else
// is rendered as voiceless prose — colored, but without a SYSTEM /
// WORLD / REWARD chip on top.
function tagForChannel(channel: LogChannel): string | null {
  if (channel === 'arbiter') return 'ARBITER';
  if (channel === 'feedback') return 'NOTE';
  return null;
}

// Split body text into spans, highlighting any occurrence of a known
// enemy name in the combat color. Case-insensitive match; preserves
// non-matching text verbatim. When `names` is empty or no match is
// found, returns a single-text-fragment shortcut for perf.
function renderBodyWithEnemyHighlight(
  text: string,
  baseColor: string,
  names: string[],
): React.ReactNode {
  if (names.length === 0) {
    return <Text style={[styles.body, { color: baseColor }]}>{text}</Text>;
  }
  // Build a single regex matching any enemy name (longest first so
  // "Mud Goblin" beats "Goblin"). Escape regex metachars.
  const escaped = names
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <Text key={`e${key++}`} style={{ color: COMBAT_COLOR, fontWeight: '700' }}>
        {match[0]}
      </Text>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <Text style={[styles.body, { color: baseColor }]}>{parts}</Text>;
}

export function AdventureFeed({ entries, enemyNames }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const visible = entries.filter((e) => !HIDDEN_CHANNELS.has(e.channel));
  const names = useMemo(
    () => (enemyNames ?? []).filter((n) => n && n.trim().length > 0),
    [enemyNames],
  );

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [visible.length]);

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      {visible.map((entry) => {
        const color = channelColors[entry.channel];
        const tag = tagForChannel(entry.channel);
        // Enemy highlighting only applies to ambient narration — skip it
        // on player echo (their own input) and on the arbiter's own
        // voice (we don't want to recolor a name inside their dialogue).
        const allowHighlight = entry.channel === 'world'
          || entry.channel === 'combat'
          || entry.channel === 'system'
          || entry.channel === 'reward';
        return (
          <View key={entry.id} style={styles.entry}>
            {tag ? <Text style={[styles.tag, { color }]}>{tag}</Text> : null}
            {allowHighlight
              ? renderBodyWithEnemyHighlight(entry.text, color, names)
              : <Text style={[styles.body, { color }]}>{entry.text}</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0908',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
  // Each entry gets its own "paragraph" — a generous bottom margin
  // plus an explicit empty-line gap above the next entry's body so a
  // sequence of world / arbiter lines reads as paragraphs in prose,
  // not as cramped chat bubbles. The opening narrative's three world
  // entries should feel like three paragraphs of a single story.
  content: { paddingBottom: 16 },
  entry: { marginBottom: 24 },
  tag: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 22 },
});
