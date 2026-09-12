import React, { useEffect, useMemo, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
/* ⚠⚠⚠ VIS-2 — THE STRUCTURED COMBAT RESULT COMES FIRST. An entry whose meta
 * carries a `cmb` event (engine/combatEvent) is drawn as a compact instrument
 * row instead of a paragraph of prose; everything else in the feed renders
 * exactly as it did. Qwen's narration is untouched and still arrives on its own
 * channels — what changed is that the RESULT no longer has to be read out of a
 * sentence to be known. */
import { type CombatEvent } from '../engine/combatEvent';
/* ⚠⚠⚠ OTA-1790 — THE ROW SHAPE IS DECIDED IN THE ENGINE. `foldExchanges` pairs
 * each to-hit verdict with the damage line that reports the same exchange, and
 * collapses adjacent reward events exactly as the loop below it used to. It is a
 * pure function over `{id, meta}`, so the claim "one exchange is one row" can be
 * graded without mounting a renderer. */
import { foldExchanges } from '../engine/combatSentence';
import { CombatStrip, RewardCluster, STRIP_METRICS } from './CombatStrip';
import type { GameLogEntry, LogChannel } from '../engine/types';
import { HIDDEN_LOG_CHANNELS } from '../engine/gameLog';

import { tartariaKitStyles as kit } from '../ui/tartariaKit';
interface Props {
  entries: GameLogEntry[];
  /** Names of enemies currently on the field, used to highlight enemy
   *  mentions inline within world / combat / reward text in the combat
   *  color so they stand out as the live threats. */
  enemyNames?: string[];
  /** ⚠ OTA-1457 — the trailing action chip's button face, or null for none.
   *  A LABEL and a HANDLER, not a chip object: this component stays ignorant of
   *  what the action is, which is what keeps the reachability rule enforceable
   *  in the one place that owns the truth (ExplorationScreen, which holds the
   *  picker's own array). A feed that understood equipment would be a second
   *  place that could decide something is takeable. */
  actionChipLabel?: string | null;
  /** Screen-reader sentence for the chip. ⚠ Required whenever a label is given —
   *  see the pin in ota1457. */
  actionChipA11yLabel?: string;
  onActionChipPress?: () => void;
  /** ⚠ OTA-1498 — the pack-only sibling under the take-and-equip chip. Both or
   *  neither: the pack door only renders beside an offer, never alone. */
  packChipLabel?: string | null;
  packChipA11yLabel?: string;
  onPackChipPress?: () => void;
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
// OTA-658 — mission reminders get their own clear YELLOW voice (more yellow than
// the muted world tan) with a MISSION chip, so a tracked mission "slaps you in the
// face" in the feed. The mission NAME renders in a brighter accent yellow so it
// reads as a proper title you can find under CONTRACTS.
const MISSION_COLOR = '#e6c84a';
const MISSION_ACCENT = '#ffe066';

const channelColors: Record<LogChannel, string> = {
  player: PLAYER_COLOR,
  arbiter: ARBITER_COLOR,
  world: WORLD_COLOR,
  system: WORLD_COLOR,
  combat: COMBAT_COLOR,
  reward: REWARD_COLOR,
  cognitive: '#a2977b',
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
  // OTA-658 — the standing "current mission" reminder, yellow + MISSION chip.
  mission: MISSION_COLOR,
};

// The hidden-channel list moved to engine/gameLog so the playtest harness can
// grade the feed the PLAYER reads against the same rule this screen renders
// by — see HIDDEN_LOG_CHANNELS there for why there is only one copy.
// `system` is folded visually into the world voice; the underlying channel is
// preserved so the on-disk log is still searchable.
const HIDDEN_CHANNELS = HIDDEN_LOG_CHANNELS;

// Only these channels get a label tag above the text. Everything else
// is rendered as voiceless prose — colored, but without a SYSTEM /
// WORLD / REWARD chip on top.
function tagForChannel(channel: LogChannel): string | null {
  if (channel === 'arbiter') return 'ARBITER';
  if (channel === 'feedback') return 'NOTE';
  // OTA-177 — DOG QUEST tag so the purple beats also carry a
  // chip-label header, matching how ARBITER / NOTE lines render.
  if (channel === 'dog_quest') return 'DOG QUEST';
  // OTA-658 — MISSION chip: the yellow line already stands out; the tag names
  // the concept so the player learns "this is a mission, it's in my CONTRACTS."
  if (channel === 'mission') return 'MISSION';
  return null;
}

// OTA-658 — render a mission reminder with its NAME (everything up to the first
// ':') in the brighter accent, the rest of the objective in the base mission
// yellow. Mirrors renderBodyWithEnemyHighlight's span approach.
function renderMissionBody(text: string, baseColor: string): React.ReactNode {
  const idx = text.indexOf(':');
  if (idx <= 0) return <Text style={[styles.body, { color: baseColor }]}>{text}</Text>;
  const name = text.slice(0, idx);
  const rest = text.slice(idx);
  return (
    <Text style={[styles.body, { color: baseColor }]}>
      <Text style={{ color: MISSION_ACCENT, fontWeight: '800' }}>{name}</Text>
      {rest}
    </Text>
  );
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

/** ⚠ OTA-1696 — the rows the feed keeps mounted. The feed yanks to the bottom on
 *  every line (OTA 026), so what a player can scroll back through is the recent
 *  past; the whole log stays in `gameLog` and on disk. 150 rows is several
 *  screens; the render cost is bounded by it instead of by MAX_LOG_IN_MEMORY. */
export const FEED_WINDOW = 150;

// ⚠⚠ OTA-1696 — ONE ROW, MEMOISED. The feed used to re-map EVERY visible entry
// on every log line: `gameLog` is an external-store subscription, so each
// appendLog commits synchronously, and a five-raider round writes twenty-five
// lines — twenty-five full re-renders of up to five hundred rich rows. The 13:32
// bundle read that as engine lines 70–150ms apart and JS stalls of 2.5–5.2s
// after every action. Entries are immutable objects, so a memoised row only
// renders once; `names` is keyed on its contents (below) so it is stable too.
const FeedRow = React.memo(function FeedRow({ entry, names, event }: { entry: GameLogEntry; names: string[]; event: CombatEvent | null }) {
        // OTA 221 — combat-outcome color override. Lines tagged with
        // meta.combatOutcome='player_dmg' (player landed damage)
        // render in green so the win pops out of the red roll math.
        // Lines tagged 'enemy_miss' stay red overall but the trailing
        // outcome marker (MISS / FUMBLE / AUTO-MISS) renders green
        // for the same at-a-glance scan. Playtester: "if I do damage
        // please put that wording in green ... if they attack and
        // miss me put just the word Miss in green at the end".
        // OTA-1051 — `storyBeat` rides alongside combatOutcome on the same
        // meta bag. A flag rather than a LogChannel member on purpose: the
        // channel drives TTS routing, HIDDEN_CHANNELS and the copy-all export,
        // and a story beat needs none of that changed — only how it LOOKS.
        const meta = entry.meta as {
          combatOutcome?: 'player_dmg' | 'enemy_miss';
          storyBeat?: boolean;
        } | undefined;
        const isStoryBeat = meta?.storyBeat === true;
        /* ⚠⚠ AHEAD OF EVERY PROSE BRANCH, INCLUDING OTA-221's COLOUR TAGS. A
         * combat line that carries an authoritative event is drawn from the
         * event; the colour override below is what the SAME line used to get
         * when all the feed had was its sentence. Both still ride the same meta
         * bag, so an entry with no `cmb` is completely unaffected. */
        /* ⚠ THE EVENT ARRIVES ALREADY FOLDED. It used to be re-read here from
         * `entry.meta`; it now comes down from `foldExchanges`, which may have
         * merged a verdict's roll into it. Reading the raw meta again at this
         * depth would quietly undo the fold. */
        const cmbEvent = event;
        if (cmbEvent) {
          return (
            <View style={styles.combatEntry}>
              <CombatStrip event={cmbEvent} text={entry.text} />
            </View>
          );
        }
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
            <View style={styles.entry}>
              <Text style={[styles.body, { color: REWARD_COLOR, fontWeight: '600' }]}>
                {entry.text}
              </Text>
            </View>
          );
        }
        if (outcome === 'enemy_miss') {
          return (
            <View style={styles.entry}>
              {renderEnemyMissLine(entry.text)}
            </View>
          );
        }

        const color = channelColors[entry.channel];
        // OTA-1051 — a story beat keeps its channel voice (the Arbiter still
        // sounds like the Arbiter) and gains a rule above it plus a STORY chip.
        // The rule is what actually does the work: it breaks the wall of feed
        // text so the eye stops, which is the whole complaint — the main quest
        // turning over scrolled past looking exactly like "✦ Rusted Bolt".
        if (isStoryBeat) {
          return (
            <View style={styles.storyEntry}>
              <View style={styles.storyRule} />
              <Text style={styles.storyTag}>STORY</Text>
              <Text style={[styles.body, styles.storyBody, { color }]}>{entry.text}</Text>
            </View>
          );
        }
        return (
          <View style={styles.entry}>
            {tag ? <Text style={[styles.tag, { color }]}>{tag}</Text> : null}
            {entry.channel === 'mission'
              ? renderMissionBody(entry.text, color)
              : allowHighlight
                ? renderBodyWithEnemyHighlight(entry.text, color, names)
                : <Text style={[styles.body, { color }]}>{entry.text}</Text>}
          </View>
        );
});

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
const CTL_PLANES = (
  <>
    <View style={kit.controlPlaneTop} pointerEvents="none" />
    <View style={kit.controlPlaneBottom} pointerEvents="none" />
    <View style={kit.controlPlaneContact} pointerEvents="none" />
  </>
);

export function AdventureFeed({ entries, enemyNames, actionChipLabel, actionChipA11yLabel, onActionChipPress, packChipLabel, packChipA11yLabel, onPackChipPress }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  /* ⚠⚠⚠ OTA-1790 — MEMOISED, AND IT HAS TO BE NOW. This was recomputed on every
   * render, which was already wasteful (LAG-2's whole subject) but harmless:
   * `rows` only handed each memoised `FeedRow` its ENTRY, and entries are
   * immutable objects, so identity held and nothing re-rendered.
   * The fold changed that. A merged exchange is a NEW object built from a verdict
   * and its damage line, so a fresh `rows` array means a fresh `event` prop on
   * every folded row — every combat row in the window re-rendering on every log
   * line, which is exactly the five-raider stall OTA-1696 measured and fixed.
   * `entries` is the store's own array and is stable between appends, so keying
   * on it makes `visible`, `rows` and every merged event stable with it. */
  const visible = useMemo(
    () => entries.filter((e) => !HIDDEN_CHANNELS.has(e.channel)).slice(-FEED_WINDOW), // OTA-1696
    [entries],
  );
  /* ⚠⚠⚠ VIS-2 — A DEFEAT'S DROPS ARE ONE BLOCK, NOT ONE ROW EACH.
   * The resolver writes one entry per recovered item, which is right for the
   * disk log and for TTS and must not change. In the FEED that was four
   * full-width lines and four paragraph margins for what is a single moment, so
   * a RUN of adjacent reward events is collapsed into one cluster here — the
   * brief's "group rewards compactly ... do not turn each loot item into its
   * own giant full-width row", solved in presentation rather than by rewriting
   * what the authority logs.
   * ⚠ Adjacent only. A reward separated from the pile by any other line keeps
   * its own place, because the order the feed shows is the order things
   * happened and grouping across a gap would be a lie about sequence.
   * ⚠ OTA-1790 — the loop that did this MOVED, unchanged in behaviour, into
   * `combatSentence.foldExchanges`, which now also folds a to-hit verdict into
   * the damage line reporting the same exchange. Both are the same kind of claim
   * (one moment, one row) and both are presentation only, so they belong in one
   * graded function rather than one here and one there. */
  const rows = useMemo(() => foldExchanges(visible), [visible]);
  // OTA-1696 — keyed on the CONTENTS: the screen builds a fresh `enemyNames`
  // array every render, so a dependency on the array itself changed every time
  // and every memoised row re-rendered with it.
  const namesKey = (enemyNames ?? []).filter((n) => n && n.trim().length > 0).join('\u0000');
  const names = useMemo(() => (namesKey ? namesKey.split('\u0000') : []), [namesKey]);

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
      {rows.map((r) => (r.kind === 'rewards'
        ? <View key={r.key} style={styles.combatEntry}><RewardCluster events={r.events} /></View>
        : <FeedRow key={r.key} entry={visible[r.index]!} names={names} event={r.event} />))}

      {/* ⚠⚠⚠ OTA-1457 — THE TRAILING ACTION CHIP, AND WHY IT IS *HERE*.
          It renders AFTER the entry map, outside it, so it is structurally
          incapable of attaching to a historic entry. That is not a layout
          preference — it is the fix for the one way this feature could hurt.

          This feed auto-scrolls UNCONDITIONALLY: `scrollToEnd` fires from both
          the entry-count effect and `onContentSizeChange`. Yank-to-bottom is
          deliberate (OTA 026, after a playtester lost her own death to a
          sticky-bottom gate). So ANY element that changes content height above
          the fold drags the view down under the player's thumb mid-read. A chip
          appended at the very bottom cannot do that: the feed is already there.

          If somebody later moves this inside the map "so each line can carry its
          own chip", that IS the bug. It belongs outside. */}
      {actionChipLabel ? (
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[kit.ctl, styles.chip]}
            activeOpacity={0.7}
            onPress={onActionChipPress}
            accessibilityRole="button"
            accessibilityLabel={actionChipA11yLabel}
            testID="feed-action-chip"
          >
            <Text style={styles.chipText}>{actionChipLabel}</Text>
            {CTL_PLANES}
          </TouchableOpacity>
        </View>
      ) : null}
      {/* ⚠ OTA-1498 — the quieter second door: same item, straight to the pack,
          nothing un-equipped. Rendered only beside the offer above so the pair
          reads as one choice — swap in, or just carry it. */}
      {actionChipLabel && packChipLabel ? (
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[kit.ctl, styles.packChip]}
            activeOpacity={0.7}
            onPress={onPackChipPress}
            accessibilityRole="button"
            accessibilityLabel={packChipA11yLabel}
            testID="feed-pack-chip"
          >
            <Text style={styles.packChipText}>{packChipLabel}</Text>
            {CTL_PLANES}
          </TouchableOpacity>
        </View>
      ) : null}
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
  /* ⚠⚠⚠ VIS-3 — THE FEED IS A RECESS, AND IT IS THE SCREEN'S FOCAL PLANE.
   *
   * This is the biggest object on the screen the player spends the game in, and
   * it was drawn exactly like the four small chips above it: `#3a342c` at 1px,
   * radius 4, one plane. Squint at the old screen and it was five identical
   * rectangles with no way to tell which one you were supposed to be reading.
   *
   * ⚠⚠ THE DEPTH IS FREE. There is no shadow and no elevation here: the face is
   * DARKER than the housing and the substrate around it, the shadow hairline is
   * on the TOP edge and the light hairline on the BOTTOM — the exact inverse of
   * a raised plate, and what the eye reads as "cut into". Zero render cost, no
   * Android all-round shadow seam of the kind the owner photographed on the
   * dossiers, and it holds on a light player theme as well as a dark one
   * because BOTH hairlines are present.
   *
   * ⚠ The material is the kit's `glass` / `glassRim`, quoted rather than
   * imported: this file is on the feed's hot render path and the values freeze
   * into a StyleSheet at module load either way. If the kit's inset material
   * moves, this comment is the pointer. */
  container: {
    flex: 1,
    backgroundColor: 'rgba(6,7,8,0.94)',
    borderWidth: 1,
    borderColor: '#242829',
    borderTopColor: 'rgba(0,0,0,0.80)',
    borderBottomColor: 'rgba(180,186,190,0.16)',
    borderRadius: 2,
    padding: 8,
  },
  // Each entry gets its own "paragraph" — a generous bottom margin
  // plus an explicit empty-line gap above the next entry's body so a
  // sequence of world / arbiter lines reads as paragraphs in prose,
  // not as cramped chat bubbles. The opening narrative's three world
  // entries should feel like three paragraphs of a single story.
  content: { paddingBottom: 16 },
  entry: { marginBottom: 24 },
  /* ⚠⚠⚠ VIS-2 — THE PARAGRAPH MARGIN IS THE DENSITY BUG, AND THIS IS THE FIX.
   * `entry`'s 24px bottom margin is right for prose: OTA-471's three opening
   * world lines should read as three paragraphs. It is badly wrong for a swing
   * and its counter, which are ONE moment split across four log lines — four
   * paragraph gaps plus four wrapped bodies is most of the visible feed for a
   * single exchange. A structured combat row is not a paragraph, so it does not
   * get a paragraph's air. Measured: an ordinary exchange goes from ~290px to
   * under 100px of feed, which is the difference between seeing one exchange
   * and seeing several. */
  combatEntry: { marginBottom: STRIP_METRICS.entry },
  tag: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 22 },
  // OTA-1051 — story beats. Extra air above and below so the beat sits in its
  // own space rather than in the column of loot lines, a gold rule to stop the
  // eye, and slightly larger, looser type. Gold (#c9a86a) is the house accent
  // already used by MissionCompleteModal and the naming cards, so a story beat
  // reads as the same class of event as a VICTORY card without being one.
  storyEntry: { marginBottom: 28, marginTop: 12 },
  storyRule: { height: 1, backgroundColor: '#7a6640', marginBottom: 10 },
  storyTag: {
    color: '#c9a86a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 6,
  },
  storyBody: { fontSize: 15, lineHeight: 25 },
  // ⚠ OTA-1457 — the trailing action chip.
  //
  // ⚠⚠ OUTLINE, NOT FILL, AND THAT IS LOAD-BEARING. OTA-1454 spent a whole OTA
  // establishing that a SOLID fill means "this is the turn-ending strike" and an
  // outline means "this is a side action". A take-and-wear is emphatically a side
  // action, so it takes the outline. The review that asked for this chip proposed
  // defaulting it to the `ready` green — the exact fill we had just retired from
  // the attack buttons — which would have re-imported the ambiguity one layer down.
  //
  // ⚠ AND THE FILL IS OPAQUE (arb86): the feed background is player-tunable, and a
  // low-alpha fill lets a bright user-picked hue flood straight through the chip.
  chipRow: { marginTop: 4, marginBottom: 4, flexDirection: 'row' },
  chip: {
    borderColor: '#9ec96a',
    borderWidth: 1,
    backgroundColor: '#12160e',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipText: { color: '#9ec96a', fontSize: 13, fontWeight: '700' },
  // OTA-1498 — pack chip: deliberately quieter than the equip offer above it
  // (neutral border, smaller face) so the recommended action stays primary.
  packChip: {
    borderColor: '#3a342c',
    borderWidth: 1,
    backgroundColor: 'transparent',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  packChipText: { color: '#cdbf99', fontSize: 12, fontWeight: '600' },
});
