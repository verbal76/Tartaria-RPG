// OTA-063 — Bug-report modal, used by the TitleScreen and the in-game About
// screen. Presentation only: it collects a choice and (for two of the three
// modes) a description, and hands them to the caller. The send itself lives in
// diagnostics/bugReport.
//
// ⚠⚠⚠ OTA-1672 — THREE MODES, AND THE TEXT GATE ONLY BINDS TWO OF THEM. Owner:
// *"I can't hit send on a bug on my main character until I type something in
// that box … there should still be a text box gate on the send button for
// general bugs or character bugs, because I need to know what you're trying to
// show me … but this new button that would just say send log doesn't need me to
// type something in the box, cuz I'm legitimately just sending you a log."*
//
// So: a character bug and a general bug both still require a description, and
// SEND FULL LOG FOR ANALYSIS is offered with no text box at all — not a disabled
// one, which would still read as a field the player is failing to fill in.
//
// ⚠ The mailto this file's header used to describe is gone (OTA-1665). The body
// copy that still described it went with it.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  InputAccessoryView,
  Keyboard,
  Platform,
} from 'react-native';
import { KeyboardSafeCard } from './KeyboardSafeCard';

// ⚠ OTA-1718 — the id that ties the multiline field to its DONE bar. A multiline
// field has no return key to close with, so without this there is genuinely no
// gesture a player is expected to know. iOS only; Android's back gesture already
// closes the keyboard.
const DESCRIBE_ACCESSORY = 'bugReportDescribeAccessory';
import type { SlotSummary } from '../engine/saveSystem';
import type { BugReportMode } from '../diagnostics/bugReport';

interface Props {
  visible: boolean;
  slots: SlotSummary[];
  /** ⚠ OTA-1672 — the character whose log a FULL LOG push should carry, when the
   *  caller knows one (the in-game About screen does; the title screen does not).
   *  Absent falls back to the most recently saved slot — the character the player
   *  was last inside, which is the only honest guess available from the title
   *  screen and the right one there. */
  activeSlotId?: string | null;
  onCancel: () => void;
  /** Called when the player taps SEND. slot is null when the
   *  player chose "General — no character".
   *  ⚠ OTA-1682 — `logSlot` is the character whose log rides along when no
   *  slot was picked: the one being played, else the newest save — the same
   *  answer the full-log row names. A general report used to carry no log. */
  onSend: (args: {
    slot: SlotSummary | null;
    logSlot?: SlotSummary | null;
    description: string;
    mode: BugReportMode;
  }) => void;
}

/** ⚠⚠⚠ OTA-1672 — the sentinel for the third choice. Owner: *"it should just say
 *  send full log for analysis; in there there really shouldn't be a text box."*
 *  Real slot IDs are slot_{base36}, so neither sentinel can collide with one. */
const FULL_LOG = 'fulllog';

export function BugReportModal({ visible, slots, activeSlotId, onCancel, onSend }: Props) {
  // 'general' sentinel for the "no character" option. Real slot IDs
  // are slot_{base36}, so no collision risk.
  const [selectedId, setSelectedId] = useState<string | 'general' | typeof FULL_LOG>('general');
  const [description, setDescription] = useState('');

  // Reset state every time the modal opens — bug reports should
  // start fresh, not carry over a half-typed description from a
  // previous open.
  useEffect(() => {
    if (visible) {
      setSelectedId('general');
      setDescription('');
    }
  }, [visible]);

  // ⚠⚠ THE LOG A FULL PUSH WOULD CARRY, resolved here so THE ROW CAN NAME IT. A
  // button that says "send full log" without saying whose log is the shape of
  // control this project keeps having to repair: the player taps it, something
  // goes somewhere, and nobody can say what went. Active character when the
  // caller knows one, newest save otherwise.
  const fullLogSlot: SlotSummary | null =
    (activeSlotId ? slots.find((s) => s.slotId === activeSlotId) : undefined)
    ?? [...slots].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0]
    ?? null;

  const isFullLog = selectedId === FULL_LOG;

  // ⚠⚠⚠ THE TEXT GATE APPLIES TO THE DESCRIBED REPORTS ONLY, which is exactly
  // the line the owner drew: *"there should still be a text box gate on the send
  // button for general bugs or character bugs, because I need to know what
  // you're trying to show me … this new button that would just say send log
  // doesn't need me to type something in the box, cuz I'm legitimately just
  // sending you a log."*
  const canSend = isFullLog ? fullLogSlot !== null : description.trim().length > 0;

  const handleSend = (): void => {
    if (!canSend) return;
    if (isFullLog) {
      onSend({ slot: fullLogSlot, description: '', mode: 'fulllog' });
      return;
    }
    const slot = selectedId === 'general'
      ? null
      : slots.find((s) => s.slotId === selectedId) ?? null;
    onSend({ slot, logSlot: fullLogSlot, description: description.trim(), mode: slot ? 'character' : 'general' });
  };

  return (
    <KeyboardSafeCard
      visible={visible}
      onRequestClose={onCancel}
      maxWidth={420}
      testID="bug-report-card"
      header={(
        <View style={styles.headerRow}>
          <Text style={styles.title} accessibilityRole="header">REPORT A BUG</Text>
          <View style={styles.ruleLine} />
        </View>
      )}
      footer={(
        // ⚠⚠⚠ OTA-1718 — PINNED. This row used to be the tail of a card that had
        // no height limit inside a wrapper that did, so it simply overflowed and
        // landed under the keyboard with no scroll path to it. It is now outside
        // the scrolling body: the card gives up BODY height as the keyboard
        // rises, never the buttons, so SEND is on screen at every size without
        // the player scrolling at all.
        <View style={styles.buttonRow}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnNeutral, pressed && styles.btnPressed]}
            onPress={onCancel}
            accessibilityRole="button"
          >
            <Text style={[styles.btnText, styles.btnTextNeutral]}>CANCEL</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              canSend ? styles.btnPrimary : styles.btnDisabled,
              pressed && styles.btnPressed,
            ]}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
          >
            <Text style={[styles.btnText, canSend ? styles.btnTextPrimary : styles.btnTextDisabled]}>
              {isFullLog ? 'SEND LOG' : 'SEND'}
            </Text>
          </Pressable>
        </View>
      )}
    >
      {/* ⚠⚠ OTA-1672 — THIS COPY WAS DESCRIBING A ROUTE THAT NO LONGER EXISTS.
          It told the player their report would be "copied to your clipboard —
          paste them into the email body before sending", which OTA-1665 retired
          when REPORT A BUG became the push. Stale instructions on the one screen
          a confused player reads are worse than none. */}
      <Text style={styles.body}>
        Pick what this is about, then send. It goes straight from here —
        no email, no copy-and-paste.
      </Text>

      <Text style={styles.sectionLabel}>WHAT IS THIS?</Text>
      {/* ⚠ OTA-1718 — this was a ScrollView with its own maxHeight, nested inside
          a card that could not scroll. One scrolling surface now: the list grows,
          the card's body scrolls, and there is no inner scroll for a thumb to get
          caught in on a 4.7" screen. */}
      <View style={styles.slotList}>
        {/* ⚠ OTA-1672 — the characters lead. The owner listed the three choices
            in this order, and it is also the order of use: a bug almost always
            happened to somebody. */}
        {slots.map((s) => (
          <SlotRow
            key={s.slotId}
            label={`${s.playerName}${s.dead ? ' (fallen)' : ''}`}
            sub={`HP ${s.hp}/${s.hpMax} · saved ${formatAgo(s.savedAt)}`}
            selected={selectedId === s.slotId}
            onPress={() => setSelectedId(s.slotId)}
          />
        ))}
        <SlotRow
          label="General bug — no character"
          sub="Title-screen / startup / setup issues"
          selected={selectedId === 'general'}
          onPress={() => setSelectedId('general')}
        />
        {/* ⚠⚠⚠ THE THIRD MODE. Only offered when there is a log to push — a row
            that promises to send one and then cannot is the
            claims-success-without-checking defect this project has fixed
            repeatedly, and the sub-line NAMES whose log goes. */}
        {fullLogSlot !== null && (
          <SlotRow
            label="Send full log for analysis"
            sub={`${fullLogSlot.playerName}'s log · no description needed`}
            selected={isFullLog}
            onPress={() => setSelectedId(FULL_LOG)}
          />
        )}
        {slots.length === 0 && (
          <Text style={styles.emptyHint}>
            (no characters yet — only a general bug can be sent)
          </Text>
        )}
      </View>

      {/* ⚠⚠⚠ OTA-1672 — NO TEXT BOX ON THE FULL-LOG PUSH. Owner: *"in there
          there really shouldn't be a text box."* Disabling it would have been
          the smaller edit and the wrong one: a greyed field still reads as
          something you are failing to fill in. */}
      {isFullLog ? (
        <Text style={styles.body}>
          Nothing to type. This sends {fullLogSlot?.playerName}&apos;s
          whole log, pack, device and voice state as-is, for me to read
          through.
        </Text>
      ) : (
        <>
          <Text style={styles.sectionLabel}>DESCRIBE THE ISSUE</Text>
          <TextInput
            style={styles.input}
            multiline
            numberOfLines={4}
            placeholder="What did you expect? What actually happened? Any reproduction steps?"
            placeholderTextColor="#5c5345"
            value={description}
            onChangeText={setDescription}
            textAlignVertical="top"
            inputAccessoryViewID={Platform.OS === 'ios' ? DESCRIBE_ACCESSORY : undefined}
          />
          {/* ⚠ OTA-1718 — the courtesy, not the fix. SEND is reachable with the
              keyboard up either way; this is here because a multiline field has
              no return key to close with, and asking a tester to know an
              undocumented gesture is its own defect. */}
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID={DESCRIBE_ACCESSORY}>
              <View style={styles.accessoryBar}>
                <Pressable
                  onPress={() => Keyboard.dismiss()}
                  accessibilityRole="button"
                  accessibilityLabel="Done — close the keyboard"
                  style={({ pressed }) => [styles.accessoryBtn, pressed && styles.btnPressed]}
                >
                  <Text style={styles.accessoryText}>DONE</Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          )}
        </>
      )}
    </KeyboardSafeCard>
  );
}

function SlotRow({
  label,
  sub,
  selected,
  onPress,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.slotRow,
        selected && styles.slotRowSelected,
        pressed && styles.slotRowPressed,
      ]}
    >
      <View style={styles.radio}>
        {selected && <View style={styles.radioDot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.slotLabel, selected && styles.slotLabelSelected]}>
          {label}
        </Text>
        <Text style={styles.slotSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

function formatAgo(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return `${Math.round(delta / 86_400_000)}d ago`;
}

const styles = StyleSheet.create({
  // ⚠ OTA-1718 — scrim / cardWrap / card are gone: KeyboardSafeCard owns the
  // frame now, and owning it in one place is the point of that component.
  accessoryBar: {
    backgroundColor: '#1a1714',
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  accessoryBtn: { paddingHorizontal: 14, paddingVertical: 6 },
  accessoryText: { color: '#c9a86a', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  headerRow: { marginBottom: 10 },
  title: {
    color: '#c9a86a',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
  },
  ruleLine: { height: 1, backgroundColor: '#3a342c', marginTop: 6 },
  body: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  sectionLabel: {
    color: '#a2977b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 4,
    marginBottom: 6,
  },
  slotList: {
    padding: 4,
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    backgroundColor: '#1a1714',
  },
  slotListContent: { padding: 4 },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 3,
    gap: 10,
  },
  slotRowSelected: { backgroundColor: '#2a2520' },
  slotRowPressed: { opacity: 0.7 },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c9a86a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#c9a86a',
  },
  slotLabel: { color: '#cdbf99', fontSize: 13 },
  slotLabelSelected: { color: '#e6d8b3', fontWeight: '700' },
  slotSub: { color: '#a2977b', fontSize: 10, marginTop: 1 },
  emptyHint: { color: '#a2977b', fontSize: 11, padding: 10, fontStyle: 'italic' },
  input: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 10,
    color: '#e6d8b3',
    fontSize: 13,
    minHeight: 80,
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 3,
    borderWidth: 1,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.7 },
  btnPrimary: { backgroundColor: '#c9a86a', borderColor: '#c9a86a' },
  btnDisabled: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnNeutral: { backgroundColor: 'transparent', borderColor: '#3a342c' },
  btnText: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  btnTextPrimary: { color: '#13110f' },
  btnTextDisabled: { color: '#5c5345' },
  btnTextNeutral: { color: '#cdbf99' },
});
