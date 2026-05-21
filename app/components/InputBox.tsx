import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { TutorialTarget } from './TutorialTarget';
import { getVoiceSettings, onVoiceSettingsChange } from '../voice/voiceSettings';
import { isSpeaking as ttsIsSpeaking, stopAndClear as stopTTS } from '../voice/TTSManager';
import { startListening, stopListening, isListening } from '../voice/STTManager';
import { useGameStore } from '../state/gameStore';
import { findWeaponByName } from '../engine/crafting';

/** OTA 207 — does the equipped weapon reach the current combat range?
 *  Mirrors playerWeaponReach() in gameStore but takes weapon name +
 *  range as plain inputs so the component layer can call it. Returns
 *  the tone the QuickBtn should render: 'ready' when the weapon can
 *  hit at this range, 'needs-approach' when it can't. Returns
 *  undefined when there's no combat in progress so neutral grey
 *  rendering applies (we don't tone weapons out-of-combat). */
function weaponTone(
  weaponName: string | null | undefined,
  range: 'arm' | 'close' | 'far' | null | undefined,
  intelligence: number,
): 'ready' | 'needs-approach' | undefined {
  if (!range) return undefined;
  // Bare hands — arm reach only.
  if (!weaponName) return range === 'arm' ? 'ready' : 'needs-approach';
  const w = findWeaponByName(weaponName);
  if (!w) return range === 'arm' ? 'ready' : 'needs-approach';
  // Reach bands per kind. Runecasters: 'arm'+'close' baseline,
  // Int >= 9 extends to 'far' (matches the gameStore rule).
  let bands: Array<'arm' | 'close' | 'far'>;
  switch (w.weaponKind) {
    case 'melee':
      bands = ['arm'];
      break;
    case 'ranged':
      bands = ['arm', 'close', 'far'];
      break;
    case 'runecaster':
      bands = intelligence >= 9 ? ['arm', 'close', 'far'] : ['arm', 'close'];
      break;
    default:
      bands = ['arm'];
  }
  return bands.includes(range) ? 'ready' : 'needs-approach';
}

interface Props {
  onSubmit: (text: string) => void;
  onOpenInventory: () => void;
  onOpenSearch: () => void;
  onOpenCrafting: () => void;
  onOpenApproach: () => void;
  onOpenSalvage: () => void;
  onOpenTake: () => void;
  /** OTA 202 — open the designer-note (FeedbackModal) overlay. The
   *  📝 button next to the text input dispatches this; bypasses the
   *  action parser entirely so playtest notes land cleanly on the
   *  `feedback` log channel. */
  onOpenFeedback: () => void;
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

export function InputBox({ onSubmit, onOpenInventory, onOpenSearch, onOpenCrafting, onOpenApproach, onOpenSalvage, onOpenTake, onOpenFeedback, inCombat, equippedMain, equippedOff, range }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  // BrandedKeyboard removed 2026-05-21 per playtester: "it is not
  // looking like it fits." Reverted to the system IME — Android's
  // native keyboard layout, predictive text, voice input, etc.
  // The system keyboard does cover the input on some devices when
  // raised; if that becomes a problem again, KeyboardAvoidingView
  // around the parent screen is the React Native idiomatic fix.

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
  // OTA 207 — Intelligence determines runecaster reach (Int ≥ 9
  // extends to 'far'). Read it from the store so the weapon tone
  // updates whenever the player's effective stats change.
  const playerInt = useGameStore((s) => s.player?.stats.intelligence ?? 0);
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
    // System keyboard handles its own dismissal on returnKey;
    // we don't need to drive it from here.
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
            {/* OTA 207 — color-code weapon buttons by reach.
                GREEN  = can hit at the current combat range
                YELLOW = equipped but needs an advance to connect
                BLUE   = defensive alternative (dodge / flee)
                Bare-hand attacks (punch/kick) are always arm-only,
                so they tone exactly with the current range. Weapon
                buttons use weaponTone() which mirrors the same
                reach rules as gameStore.playerWeaponReach. */}
            <QuickBtn
              label="punch"
              onPress={() => onSubmit('punch')}
              tone={weaponTone(null, range, playerInt)}
            />
            <QuickBtn
              label="kick"
              onPress={() => onSubmit('kick')}
              tone={weaponTone(null, range, playerInt)}
            />
            {equippedMain ? (
              <QuickBtn
                label={shortWeaponLabel(equippedMain).toLowerCase()}
                onPress={() => onSubmit(`attack with the ${equippedMain.toLowerCase()}`)}
                tone={weaponTone(equippedMain, range, playerInt)}
              />
            ) : null}
            {equippedOff ? (
              <QuickBtn
                label={`off: ${shortWeaponLabel(equippedOff).toLowerCase()}`}
                onPress={() => onSubmit(`attack with the off-hand ${equippedOff.toLowerCase()}`)}
                tone={weaponTone(equippedOff, range, playerInt)}
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
            {/* OTA 208 — label renamed from "search" to "investigate"
                per playtester's semantic distinction: "I searched my
                drawer for the right pair of socks" (looking for one
                specific thing inside a container) vs "investigate
                the dresser" (examining a context to learn what's
                going on). The modal lets the player tap any scene
                noun to learn about it — that's investigation, not
                search. The parser intent is already 'investigate'
                internally; this aligns the button with the intent. */}
            <QuickBtn label="investigate" onPress={onOpenSearch} />
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
        {/* OTA 202 — designer-note button. Tap opens the
            FeedbackModal which writes straight to the log on the
            `feedback` channel, bypassing the action parser entirely.
            Sits between mic and Act so the touch target lives in the
            same gesture zone as the other input-row controls. */}
        <TouchableOpacity
          style={styles.feedbackBtn}
          onPress={onOpenFeedback}
          hitSlop={6}
        >
          <Text style={styles.feedbackBtnText}>📝</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.send} onPress={handleSubmit}>
          <Text style={styles.sendText}>Act</Text>
        </TouchableOpacity>
      </TutorialTarget>
    </View>
  );
}

/** OTA 207 — combat-tone props for weapon buttons.
 *  'ready'         (green)  — weapon can hit the current range
 *  'needs-approach' (yellow) — equipped but won't reach from here
 *  'defensive'     (blue)   — alternate actions (dodge / flee /
 *                             block); existing styling kept via the
 *                             legacy `defensive` boolean which is
 *                             treated as tone='defensive'
 *  undefined       (grey)   — neutral (inventory, search, etc.) */
type QuickBtnTone = 'ready' | 'needs-approach' | 'defensive';

function QuickBtn({
  label,
  onPress,
  defensive,
  tone,
}: {
  label: string;
  onPress: () => void;
  defensive?: boolean;
  tone?: QuickBtnTone;
}) {
  const resolvedTone: QuickBtnTone | undefined = tone ?? (defensive ? 'defensive' : undefined);
  const containerStyle = [
    styles.quick,
    resolvedTone === 'defensive' && styles.quickDefensive,
    resolvedTone === 'ready' && styles.quickReady,
    resolvedTone === 'needs-approach' && styles.quickNeedsApproach,
  ];
  const textStyle = [
    styles.quickText,
    resolvedTone === 'defensive' && styles.quickDefensiveText,
    resolvedTone === 'ready' && styles.quickReadyText,
    resolvedTone === 'needs-approach' && styles.quickNeedsApproachText,
  ];
  return (
    <TouchableOpacity style={containerStyle} onPress={onPress}>
      {/* OTA 206 — all action-button labels uppercased per playtester:
          "all of the action buttons Dodge flee search take… all of
          those should be all in capitals. Being all in lowercase
          makes them look insignificant." */}
      <Text style={textStyle}>{label.toUpperCase()}</Text>
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
  // OTA 207 — combat tone colors. Green for weapons that can hit
  // the current range, yellow for weapons that need an advance to
  // reach (player has it equipped but the swing won't connect from
  // here). Blue/defensive is the existing dodge / flee treatment.
  quickReady: { borderColor: '#9ec96a', backgroundColor: '#1a201410' },
  quickNeedsApproach: { borderColor: '#c9a86a' },
  quickText: { color: '#cdbf99', fontSize: 12 },
  quickDefensiveText: { color: '#6a9bbf' },
  quickReadyText: { color: '#9ec96a' },
  quickNeedsApproachText: { color: '#c9a86a' },
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
  // OTA 202 — designer-note button (📝). Same footprint as the mic
  // so the input row stays balanced; lower-key border because it's
  // a tool button, not a primary action.
  feedbackBtn: {
    marginLeft: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#3a342c',
    backgroundColor: '#1a1714',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackBtnText: { fontSize: 16 },
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
