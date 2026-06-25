import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import type { GameLogEntry, LogChannel } from '../engine/types';
import { getNarratorName } from '../engine/contentPack';
import { TEMPLATE_FLAG_COLOR, splitOnPlaceholders, hasInlinePlaceholder } from '../engine/templatePlaceholders';

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
const WORLD_COLOR = '#bcd2db';
const ARBITER_COLOR = '#6ab0c9';
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
  cognitive: '#6c8088',
  debug: '#605648',
  // OTA 202 — designer notes from the 📝 button. Distinct accent so
  // a glance distinguishes them from world prose during a long
  // copy-paste / scroll-back review.
  feedback: '#c97aa8',
  // OTA-177 — dog rescue + onboarding narration in a clear purple
  // so the quest beats stand out from amber (Arbiter) / yellow /
  // green (reward) / red (combat) / blue (player). Same hue family
  // as the Rare-rarity color the player already reads as "this is
  // important to my run." Player ask: "make the text that is part
  // of the initial dog getting quest and any other dog getting
  // quests in a color that is noticably different... let's use
  // purple like the notes."
  dog_quest: '#b88ce0',
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
  if (channel === 'arbiter') return getNarratorName().toUpperCase();
  if (channel === 'feedback') return 'NOTE';
  // OTA-177 — DOG QUEST tag so the purple beats also carry a
  // chip-label header, matching how ARBITER / NOTE lines render.
  if (channel === 'dog_quest') return 'DOG QUEST';
  return null;
}

// Push a plain string, but first split out any unfilled-TEMPLATE markers (REPLACE…) and
// tint them PINK so the author spots template material left in their game. Mutates parts.
function pushWithPlaceholderFlags(parts: React.ReactNode[], str: string, keyRef: { k: number }): void {
  for (const span of splitOnPlaceholders(str)) {
    if (!span.text) continue;
    if (span.flag) {
      parts.push(
        <Text key={`p${keyRef.k++}`} style={{ color: TEMPLATE_FLAG_COLOR, fontWeight: '700' }}>
          {span.text}
        </Text>,
      );
    } else {
      parts.push(span.text);
    }
  }
}

// Split body text into spans: known enemy names tint to the combat color, and unfilled
// TEMPLATE markers (REPLACE…) tint pink. Case-insensitive enemy match; case-sensitive
// REPLACE match (so prose "replace" is never flagged). Single-fragment fast path when
// there is nothing to mark.
function renderBodyWithEnemyHighlight(
  text: string,
  baseColor: string,
  names: string[],
): React.ReactNode {
  if (names.length === 0 && !hasInlinePlaceholder(text)) {
    return <Text style={[styles.body, { color: baseColor }]}>{text}</Text>;
  }
  const parts: React.ReactNode[] = [];
  const keyRef = { k: 0 };
  if (names.length === 0) {
    // Only placeholder flagging to do.
    pushWithPlaceholderFlags(parts, text, keyRef);
    return <Text style={[styles.body, { color: baseColor }]}>{parts}</Text>;
  }
  // Build a single regex matching any enemy name (longest first so
  // "Mud Goblin" beats "Goblin"). Escape regex metachars.
  const escaped = names
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      // Non-enemy slice — still scan it for template placeholders.
      pushWithPlaceholderFlags(parts, text.slice(lastIndex, match.index), keyRef);
    }
    parts.push(
      <Text key={`e${keyRef.k++}`} style={{ color: COMBAT_COLOR, fontWeight: '700' }}>
        {match[0]}
      </Text>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    pushWithPlaceholderFlags(parts, text.slice(lastIndex), keyRef);
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

  // v2.4.1 (OTA 026) — always auto-scroll on every new entry.
  //
  // Playtester: "anytime anything happens the text scroll she always
  // show the newest text, I died of a full climb and three
  // investigates and had to keep scrolling down." Reverting the
  // OTA 025 isNearBottom gate — yank-to-bottom is the desired
  // behavior, not sticky-to-bottom. onContentSizeChange ALSO fires
  // the scroll so the initial-mount / screen-re-entry case (where
  // useEffect runs before layout) still lands at the bottom.
  const handleAutoScroll = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  useEffect(() => {
    handleAutoScroll();
  }, [visible.length]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      onContentSizeChange={handleAutoScroll}
    >
      {visible.map((entry) => {
        // OTA 221 — combat-outcome color override. Lines tagged with
        // meta.combatOutcome='player_dmg' (player landed damage)
        // render in green so the win pops out of the red roll math.
        // Lines tagged 'enemy_miss' stay red overall but the trailing
        // outcome marker (MISS / FUMBLE / AUTO-MISS) renders green
        // for the same at-a-glance scan. Playtester: "if I do damage
        // please put that wording in green ... if they attack and
        // miss me put just the word Miss in green at the end".
        const meta = entry.meta as { combatOutcome?: 'player_dmg' | 'enemy_miss' } | undefined;
        const outcome = entry.channel === 'combat' ? meta?.combatOutcome : undefined;
        const tag = tagForChannel(entry.channel);
        // Enemy highlighting only applies to ambient narration — skip it
        // on player echo (their own input) and on the arbiter's own
        // voice (we don't want to recolor a name inside their dialogue).
        const allowHighlight = entry.channel === 'world'
          || entry.channel === 'combat'
          || entry.channel === 'system'
          || entry.channel === 'reward';

        if (outcome === 'player_dmg') {
          return (
            <View key={entry.id} style={styles.entry}>
              <Text style={[styles.body, { color: REWARD_COLOR, fontWeight: '600' }]}>
                {entry.text}
              </Text>
            </View>
          );
        }
        if (outcome === 'enemy_miss') {
          return (
            <View key={entry.id} style={styles.entry}>
              {renderEnemyMissLine(entry.text)}
            </View>
          );
        }

        const color = channelColors[entry.channel];
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

// Render an enemy-roll line with the trailing MISS / FUMBLE /
// AUTO-MISS in green. The whole line stays in the combat color
// (red) so it still reads as "their attack" — the green marker
// just gives the player an instant "I'm safe" cue at the end.
function renderEnemyMissLine(text: string): React.ReactNode {
  const m = /(✗\s*(?:AUTO-MISS|MISS|FUMBLE))\s*\.?\s*$/.exec(text);
  if (!m) {
    return <Text style={[styles.body, { color: COMBAT_COLOR }]}>{text}</Text>;
  }
  const head = text.slice(0, m.index);
  const marker = m[1]!;
  return (
    <Text style={[styles.body, { color: COMBAT_COLOR }]}>
      {head}
      <Text style={{ color: REWARD_COLOR, fontWeight: '700' }}>{marker}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1012',
    borderColor: '#2b3a3e',
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
