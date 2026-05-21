import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Keyboard } from 'react-native';
import { TutorialTarget } from './TutorialTarget';
import { BrandedKeyboard } from './BrandedKeyboard';
import { getVoiceSettings, onVoiceSettingsChange } from '../voice/voiceSettings';
import { isSpeaking as ttsIsSpeaking, stopAndClear as stopTTS } from '../voice/TTSManager';
import { startListening, stopListening, isListening } from '../voice/STTManager';
import { useGameStore } from '../state/gameStore';

interface Props {
  onSubmit: (text: string) => void;
  onOpenInventory: () => void;
  onOpenSearch: () => void;
  onOpenCrafting: () => void;
  onOpenApproach: () => void;
  onOpenSalvage: () => void;
  onOpenTake: () => void;
  inCombat: boolean;
  equippedMain: string | null;
  equippedOff: string | null;
  /** Current combat range — surfaces advance/retreat buttons when meaningful. */
  range?: 'arm' | 'close' | 'far' | null;
}

// Peace-mode quick buttons. The "look around you" button submits 'look' —
// the parser still routes via the look verb, but the label is more
// inviting + more clearly tells the player what the button does.
// 'search' = opens a search prompt where the player names what to search
// (also covers digging — searching the mud/silt/ground routes through
// the dig path when the player carries a tool).
// 'rest' = direct verb.
const PEACE_QUICK_DIRECT: Array<{ label: string; submit: string }> = [
  { label: 'look around you', submit: 'look' },
  { label: 'rest', submit: 'rest' },
];

// Trim a weapon name down to fit comfortably on a button. Examples:
// "Aetheric Crystal Blade" → "Crystal Blade"
// "Mud-fist Wraps"          → "Mud-fist"
// "Sentinel Cleaver"        → "Cleaver"
function shortWeaponLabel(name: string): string {
  const tokens = name.split(/\s+/);
  if (tokens.length <= 2) return name;
  return tokens.slice(-2).join(' ');
}

export function InputBox({ onSubmit, onOpenInventory, onOpenSearch, onOpenCrafting, onOpenApproach, onOpenSalvage, onOpenTake, inCombat, equippedMain, equippedOff, range }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  // BrandedKeyboard is the Tartaria-themed on-screen keyboard. We
  // suppress the system IME (showSoftInputOnFocus={false}) and mount
  // the branded one below the input row when the player taps in.
  // The preview line at the top of the keyboard panel shows what
  // they're typing, so the system-keyboard "covers the input"
  // problem the playtest log flagged is solved structurally.
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Voice state — both flags drive a tiny render loop so the MIC /
  // SILENCE ARBITER button swaps live when TTS starts / stops or the
  // mic begins recording. Polling once per ~250ms is cheaper than
  // wiring observers on the TTS / STT singletons.
  const [voice, setVoice] = useState(() => getVoiceSettings());
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => onVoiceSettingsChange(setVoice), []);

  // Pull a pre-filled draft (e.g. an example phrase the player tapped
  // on ActionReferenceScreen). Consume → reads + clears the store
  // field in one shot so the draft doesn't keep re-applying every
  // render. Polled at 250ms via the same loop as voice state since
  // we're already there.
  const consumeDraft = useGameStore((s) => s.consumeInputDraft);
  const pendingDraft = useGameStore((s) => s.pendingInputDraft);
  useEffect(() => {
    if (pendingDraft !== null) {
      const draft = consumeDraft();
      if (draft) {
        setText(draft);
        // Defer focus by one tick so the TextInput is mounted +
        // ready to receive the cursor.
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
  }, [pendingDraft, consumeDraft]);
  useEffect(() => {
    if (!voice.ttsEnabled && !voice.sttEnabled) return;
    const t = setInterval(() => {
      setSpeaking(ttsIsSpeaking());
      setListening(isListening());
    }, 250);
    return () => clearInterval(t);
  }, [voice.ttsEnabled, voice.sttEnabled]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    // Android IME composition buffer keeps the tail of long inputs even
    // after setText('') — controlled-value pattern alone isn't enough.
    // Call the native clear() method too so the on-screen input actually
    // empties out. Playtest screenshot showed "? it should make that
    // what is going on right now" stuck in the box after Act.
    setText('');
    inputRef.current?.clear();
    // Close the branded keyboard on submit. Player can re-open it
    // by tapping the input again.
    setKeyboardOpen(false);
  };

  const handleMic = async () => {
    // Wrap EVERYTHING — even the stop path. Tapping mic / silence
    // was kicking some players out to the home screen because
    // unhandled errors (or unhandled promise rejections from the
    // native side) propagated into the React Native bridge and
    // crashed the process. Catch them all here; the player can
    // re-tap to retry.
    try {
      if (listening) {
        try { await stopListening(); } catch { /* ignore */ }
        setListening(false);
        return;
      }
      await startListening(
        (r) => {
          // Drop transcripts into the text box. Final results auto-submit
          // when voice.autoSubmit is on; partial results just preview so
          // the player can see what's being captured.
          try {
            setText(r.text);
            if (r.isFinal && voice.autoSubmit) {
              onSubmit(r.text.trim());
              setText('');
              inputRef.current?.clear();
            }
          } catch { /* ignore — recognition continues */ }
        },
        (msg) => {
          // Surface the error in the input as a placeholder hint and
          // bail. The player can re-tap the mic to retry.
          try {
            setText(`(mic: ${msg.slice(0, 60)})`);
          } catch { /* ignore */ }
          setListening(false);
        },
      );
      setListening(true);
    } catch (err) {
      // Last-resort catch — any error from startListening / stopListening
      // / setState lands here, the input stays alive, the player sees
      // a hint in the text field.
      const msg = err instanceof Error ? err.message : String(err);
      try { setText(`(mic error: ${msg.slice(0, 60)})`); } catch { /* ignore */ }
      setListening(false);
    }
  };

  const handleSilenceArbiter = async () => {
    // Same defensive shell — stopTTS hits two native engines
    // (expo-speech + executorch) and any unhandled rejection can
    // kill the bridge.
    try { stopTTS(); } catch { /* ignore */ }
    try { setSpeaking(false); } catch { /* ignore */ }
    // After silencing, the player almost always wants to respond —
    // open the mic if STT is enabled. If not, just leave them at
    // text input.
    if (voice.sttEnabled) {
      try { await handleMic(); } catch { /* handleMic has its own catch */ }
    }
  };

  return (
    <View style={styles.container}>
      {/* Quick-travel row — full-word buttons so they're easy to hit
          without fat-fingering an adjacent direction. Travel is the
          most-issued verb in playtest; pulling it onto the quick row
          removes "go north" / "head east" typing every step. Hidden
          in combat (cardinal travel is gated by enemy presence
          anyway and the slot is needed for combat verbs). */}
      {!inCombat && (
        <TutorialTarget area="travel-row" style={styles.travelRow}>
          <TravelBtn label="NORTH" onPress={() => onSubmit('go north')} />
          <TravelBtn label="SOUTH" onPress={() => onSubmit('go south')} />
          <TravelBtn label="EAST" onPress={() => onSubmit('go east')} />
          <TravelBtn label="WEST" onPress={() => onSubmit('go west')} />
        </TutorialTarget>
      )}
      <TutorialTarget area="quick-row" style={styles.quickRow}>
        {inCombat ? (
          <>
            <QuickBtn label="punch" onPress={() => onSubmit('punch')} />
            <QuickBtn label="kick" onPress={() => onSubmit('kick')} />
            {equippedMain ? (
              <QuickBtn
                label={shortWeaponLabel(equippedMain).toLowerCase()}
                onPress={() => onSubmit(`attack with the ${equippedMain.toLowerCase()}`)}
              />
            ) : null}
            {equippedOff ? (
              <QuickBtn
                label={`off: ${shortWeaponLabel(equippedOff).toLowerCase()}`}
                onPress={() => onSubmit(`attack with the off-hand ${equippedOff.toLowerCase()}`)}
              />
            ) : null}
            {/* Inventory access stays prominent in combat — playtest report
                flagged "pack" at the end of the row as easy to miss. Sits
                right after the weapons so swap/quaff flows are reachable
                without scanning past dodge/block/advance. */}
            <QuickBtn label="inventory" onPress={onOpenInventory} />
            {/* Approach in combat lets the player pick a SPECIFIC enemy
                out of a multi-target encounter ("approach the human"
                while the dragon and hellhound watch) plus optionally
                slip in via stealth instead of closing the gap in the
                open. */}
            <QuickBtn label="approach" onPress={onOpenApproach} />
            {/* `block` quick-action removed 2026-05-21 — folded into
                dodge. The dodge button now triggers the active-parry
                mechanic: opposed d20+DEX roll on the next incoming
                attack, full negation + 2× counter-strike on success,
                2 durability wear either way. */}
            <QuickBtn label="dodge" defensive onPress={() => onSubmit('dodge')} />
            {range && range !== 'arm' && (
              <QuickBtn label="advance" onPress={() => onSubmit('advance')} />
            )}
            {range && range !== 'far' && (
              <QuickBtn label="step back" onPress={() => onSubmit('step back')} />
            )}
            {/* Always-available escape. Iron Fog can lock advance/step
                back, so the player needs a visible flee button or they'll
                think the game is stuck. Routes to escape intent → skill
                check → enemies cleared on success. */}
            <QuickBtn label="flee" defensive onPress={() => onSubmit('flee')} />
          </>
        ) : (
          <>
            {PEACE_QUICK_DIRECT.map((qa) => (
              <QuickBtn key={qa.submit} label={qa.label} onPress={() => onSubmit(qa.submit)} />
            ))}
            <QuickBtn label="search" onPress={onOpenSearch} />
            <QuickBtn label="approach" onPress={onOpenApproach} />
            <QuickBtn label="take" onPress={onOpenTake} />
            <QuickBtn label="salvage" onPress={onOpenSalvage} />
            <QuickBtn label="craft" onPress={onOpenCrafting} />
            <QuickBtn label="inventory" onPress={onOpenInventory} />
          </>
        )}
      </TutorialTarget>
      <TutorialTarget area="input-row" style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={
            listening
              ? '🎙 LISTENING — speak now'
              : inCombat
                ? 'What do you do? (or use quick buttons)'
                : 'What do you do?'
          }
          placeholderTextColor={listening ? '#6a9bbf' : '#5a5246'}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
          // System IME is suppressed; the BrandedKeyboard below
          // takes its place. showSoftInputOnFocus={false} stops
          // Android from raising the OS keyboard; we still want
          // the cursor + selection behaviour of TextInput, so we
          // keep editability but route keystrokes through our own
          // panel via the keyboardOpen state.
          showSoftInputOnFocus={false}
          onFocus={() => {
            setKeyboardOpen(true);
            // Belt-and-suspenders: if any OS keyboard ever sneaks up,
            // dismiss it. (Some Android ROMs ignore showSoftInputOnFocus.)
            Keyboard.dismiss();
          }}
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
        />
        {/* Voice controls — only render when the player opted in via
            Settings. SILENCE ARBITER takes the slot whenever TTS is
            actively speaking (always-visible interrupt); otherwise the
            MIC button is the always-visible push-to-talk. */}
        {(voice.ttsEnabled || voice.sttEnabled) && (
          speaking && voice.ttsEnabled ? (
            <TouchableOpacity style={styles.silenceBtn} onPress={handleSilenceArbiter}>
              <Text style={styles.silenceBtnText}>🛑</Text>
            </TouchableOpacity>
          ) : voice.sttEnabled ? (
            <TouchableOpacity
              style={[styles.micBtn, listening && styles.micBtnActive]}
              onPress={handleMic}
            >
              <Text style={styles.micBtnText}>🎙</Text>
            </TouchableOpacity>
          ) : null
        )}
        <TouchableOpacity style={styles.send} onPress={handleSubmit}>
          <Text style={styles.sendText}>Act</Text>
        </TouchableOpacity>
      </TutorialTarget>
      {keyboardOpen && (
        <BrandedKeyboard
          value={text}
          onKey={(ch) => setText((t) => t + ch)}
          onBackspace={() => setText((t) => t.slice(0, -1))}
          onSubmit={handleSubmit}
          onDismiss={() => setKeyboardOpen(false)}
        />
      )}
    </View>
  );
}

function QuickBtn({
  label,
  onPress,
  defensive,
}: {
  label: string;
  onPress: () => void;
  defensive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.quick, defensive && styles.quickDefensive]}
      onPress={onPress}
    >
      <Text style={[styles.quickText, defensive && styles.quickDefensiveText]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Bigger button for the travel row so it's easy to hit without
 *  fat-fingering an adjacent direction. Equal-width flex layout
 *  splits the available horizontal space across all four buttons. */
function TravelBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.travelBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.travelBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  travelRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  travelBtn: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#5a4a2e',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  travelBtnText: { color: '#c9a86a', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  quick: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  quickDefensive: { borderColor: '#6a9bbf' },
  quickText: { color: '#cdbf99', fontSize: 12 },
  quickDefensiveText: { color: '#6a9bbf' },
  inputRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
    fontSize: 14,
  },
  send: {
    backgroundColor: '#3a342c',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 4,
  },
  sendText: { color: '#e6d8b3', fontWeight: '700' },
  // Voice push-to-talk button. Sits between the input and Act.
  micBtn: {
    backgroundColor: '#1a1612',
    borderColor: '#3a342c',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  micBtnActive: {
    backgroundColor: '#1c2a35',
    borderColor: '#6a9bbf',
  },
  micBtnText: { color: '#cdbf99', fontSize: 18 },
  // SILENCE ARBITER button — replaces the mic while TTS is active.
  // Red tint so the player knows it's an interrupt, not a regular tap.
  silenceBtn: {
    backgroundColor: '#3a201c',
    borderColor: '#e07a5f',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  silenceBtnText: { color: '#e07a5f', fontSize: 18 },
});
