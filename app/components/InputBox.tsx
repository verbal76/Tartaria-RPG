import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Pressable } from 'react-native';
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
  /** OTA 031 — open the climb-target picker (ClimbModal). Lists every
   *  climbable noun in the current scene with its tier count.
   *  Tapping one fires `climb <noun>` which resolves one tier. */
  onOpenClimb: () => void;
  /** OTA 031 — fire the next tier on whatever the player is already
   *  climbing. Submits `climb <noun>` for the noun stamped in
   *  elevatedOn so the player can ascend without re-opening the
   *  picker each tap. */
  onClimbUp: () => void;
  /** OTA 031 — fire the descent path. Submits `climb down` which
   *  the climb handler routes to a quick descent narration and
   *  clears the elevated flag. */
  onClimbDown: () => void;
  /** OTA 032 — full elevation tuple so the HUD knows whether the
   *  player still has tiers to ascend. Null when on the ground. */
  elevatedOn?: { noun: string; tier: number; totalTiers: number } | null;
  /** OTA 202 — open the designer-note (FeedbackModal) overlay. The
   *  📝 button next to the text input dispatches this; bypasses the
   *  action parser entirely so playtest notes land cleanly on the
   *  `feedback` log channel. */
  onOpenFeedback: () => void;
  /** OTA 049 — open the world Atlas (MapScreen). Sits on the same row
   *  as the cardinal direction buttons so the player can step out of
   *  travel to consult the map without changing modes. Hidden in
   *  combat alongside the rest of the travel row. */
  onOpenMap: () => void;
  inCombat: boolean;
  equippedMain: string | null;
  equippedOff: string | null;
  /** Current combat range — surfaces advance/retreat buttons when meaningful. */
  range?: 'arm' | 'close' | 'far' | null;
  /** v2.4.1 (OTA 049) — when set, the cardinal travel row swaps to
   *  CONTINUE TRAVEL / STOP TRAVEL buttons. Display name of the
   *  destination is rendered above. */
  travelTargetName?: string | null;
  onContinueTravel?: () => void;
  onStopTravel?: () => void;
  /** 2026-05-25 — Manhattan distance to the active travel target.
   *  Rendered as a compact "N moves" badge between STOP TRAVEL and
   *  MAP so the player knows how far they have to walk. Hidden when
   *  travelTargetName is null. */
  movesLeft?: number | null;
  /** 2026-05-25 [UI-2] — count of nouns that each modal will
   *  ACTUALLY render. When > 0, the corresponding peace-mode quick
   *  button renders with 'ready' tone (green) to signal there's
   *  something actionable behind it. When 0/undefined the button
   *  stays neutral. Same affordance pattern as the combat APPROACH
   *  'needs-approach' tone.
   *
   *  Expansion 2026-05-25 — now covers all four ambient-noun modals
   *  (take, salvage, climb, investigate). Empty modal → gray button,
   *  populated modal → green. */
  takeableCount?: number;
  salvageableCount?: number;
  climbableCount?: number;
  investigateCount?: number;
  /** 2026-05-25 [MECHANIC-1b] — active golem sidekick summary. When
   *  present + hp > 0 + in combat, a "golem (hp/max)" QuickBtn
   *  renders in the combat row. Tap fires 'use golem' through
   *  onSubmit. The button stays 'ready' tone always — its existence
   *  signals the affordance. */
  golem?: { name: string; hp: number; hpMax: number } | null;
  /** OTA-144 — active dog companion summary. When present + hp > 0 +
   *  status='with_player' + in combat, a "{name} (hp/max)" QuickBtn
   *  renders in the combat row, parallel to the golem button. Tap
   *  opens a 2-button action picker (BITE / DISTRACT) per the OTA-121
   *  spec which never wired the UI surface. */
  dog?: { name: string; hp: number; hpMax: number } | null;
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

export function InputBox({ onSubmit, onOpenInventory, onOpenSearch, onOpenCrafting, onOpenApproach, onOpenSalvage, onOpenTake, onOpenClimb, onClimbUp, onClimbDown, elevatedOn, onOpenFeedback, onOpenMap, inCombat, equippedMain, equippedOff, range, travelTargetName, onContinueTravel, onStopTravel, movesLeft, takeableCount, salvageableCount, climbableCount, investigateCount, golem, dog }: Props) {
  // OTA-144 — dog combat action picker state. When the player taps
  // the DOG quick-button in combat, this flips to true and the
  // BITE / DISTRACT row renders inline. Either tap fires the
  // corresponding intent and closes the picker.
  const [dogPickerOpen, setDogPickerOpen] = useState(false);
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
          {travelTargetName ? (
            // v2.4.1 (OTA 049) — multi-step travel mode. Cardinal
            // buttons swap to "→ [DEST]" + STOP TRAVEL while the
            // player walks tile-by-tile toward the named destination.
            // 2026-05-25 — MAP button kept on the travel row since
            // cardinals are hidden; the moves-left badge shows the
            // Manhattan distance to the target so the player knows
            // how far they have to walk.
            <>
              <TravelBtn label={`→ ${travelTargetName.toUpperCase()}`} onPress={onContinueTravel ?? (() => {})} />
              <TravelBtn label="STOP TRAVEL" onPress={onStopTravel ?? (() => {})} />
              {typeof movesLeft === 'number' && movesLeft >= 0 ? (
                <View style={styles.movesBadge}>
                  <Text style={styles.movesBadgeText} numberOfLines={1}>
                    {movesLeft}
                  </Text>
                  <Text style={styles.movesBadgeSub} numberOfLines={1}>
                    {movesLeft === 1 ? 'move' : 'moves'}
                  </Text>
                </View>
              ) : null}
              <TravelBtn label="MAP" onPress={onOpenMap} />
            </>
          ) : (
            <>
              <TravelBtn label="NORTH" onPress={() => onSubmit('go north')} />
              <TravelBtn label="SOUTH" onPress={() => onSubmit('go south')} />
              <TravelBtn label="EAST" onPress={() => onSubmit('go east')} />
              <TravelBtn label="WEST" onPress={() => onSubmit('go west')} />
              <TravelBtn label="MAP" onPress={onOpenMap} />
            </>
          )}
        </TutorialTarget>
      )}
      <TutorialTarget area="quick-row" style={inCombat ? styles.quickRowColumn : styles.quickRow}>
        {inCombat ? (
          <>
            {/* OTA-172 — combat row split into 3 lines per playtest
                ask: "approach, step back, and inventory should be on
                the third line, that keeps room for the dog and golem
                on the second row, and keep dodge and flee next to
                them on the second row."
                Row 1: punch / kick / [main weapon] / [off weapon]
                Row 2: [golem] / [dog] / dodge / flee
                Row 3: inventory / approach / [step back] */}
            <View style={styles.quickRowLine}>
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
            </View>

            <View style={styles.quickRowLine}>
              {/* 2026-05-25 [MECHANIC-1b] — golem sidekick command.
                  Only renders in combat when a golem is summoned and
                  still alive. Tap fires 'use golem' which routes to
                  handleGolemCommand and strikes the primary enemy. */}
              {golem && golem.hp > 0 ? (
                <QuickBtn
                  label={`golem (${golem.hp}/${golem.hpMax})`}
                  onPress={() => onSubmit('use golem')}
                  tone="ready"
                />
              ) : null}
              {/* OTA-144 — Dog combat button. Mirrors the golem button
                  pattern. Tap toggles a small picker (BITE / DISTRACT)
                  below the quick row. The OTA-121 spec wired the
                  parser intents + dispatch + resolver but never landed
                  the UI surface; playtester (Rocky's owner) reported
                  hunting for it through 3 combat rounds. */}
              {dog && dog.hp > 0 ? (
                <QuickBtn
                  label={`${dog.name.toLowerCase()} (${dog.hp}/${dog.hpMax})`}
                  onPress={() => setDogPickerOpen((v) => !v)}
                  tone="ready"
                />
              ) : null}
              {/* `block` quick-action removed 2026-05-21 — folded into
                  dodge. The dodge button now triggers the active-parry
                  mechanic: opposed d20+DEX roll on the next incoming
                  attack, full negation + 2× counter-strike on success,
                  2 durability wear either way. */}
              <QuickBtn label="dodge" defensive onPress={() => onSubmit('dodge')} />
              {/* Always-available escape. Iron Fog can lock advance/step
                  back, so the player needs a visible flee button or they'll
                  think the game is stuck. Routes to escape intent → skill
                  check → enemies cleared on success. */}
              <QuickBtn label="flee" defensive onPress={() => onSubmit('flee')} />
            </View>

            <View style={styles.quickRowLine}>
              {/* Inventory access stays prominent in combat — playtest report
                  flagged "pack" at the end of the row as easy to miss. Now
                  on the third row, alongside approach + step back, so the
                  weapon row + companion row stay uncluttered. */}
              <QuickBtn label="inventory" onPress={onOpenInventory} />
              {/* Approach in combat lets the player pick a SPECIFIC enemy
                  out of a multi-target encounter ("approach the human"
                  while the dragon and hellhound watch) plus optionally
                  slip in via stealth instead of closing the gap in the
                  open.
                  2026-05-25 [POLISH-1] — tone='needs-approach' (green
                  glow) when range is 'far' so the player sees at a
                  glance they need to close before attacking. */}
              <QuickBtn
                label="approach"
                onPress={onOpenApproach}
                tone={range === 'far' ? 'needs-approach' : undefined}
              />
              {/* v2.4.1 (OTA 034) — `advance` quick-button removed.
                  Player noted approach already covers the close-range
                  use case AND adds the stealth option (DEX roll →
                  +5 next attack if you slip in unseen). The approach
                  button above is the unified close-range entry for
                  both exploration and combat.
                  Parser synonyms (`advance`, `lunge`, `forward`,
                  `closein`, `charge in`, `near`) still parse to the
                  same intent so typed-input compatibility is intact.
                  Removing only the HUD button. */}
              {range && range !== 'far' && (
                <QuickBtn label="step back" onPress={() => onSubmit('step back')} />
              )}
            </View>
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
            <QuickBtn
              label="investigate"
              onPress={onOpenSearch}
              tone={investigateCount && investigateCount > 0 ? 'ready' : undefined}
            />
            <QuickBtn label="approach" onPress={onOpenApproach} />
            {/* 2026-05-25 [UI-2] — take/salvage tone='ready' (green)
                when there's something actionable in the scene. Players
                were tapping these and finding empty modals; the green
                tint at-a-glance signals there's loot worth checking.
                Gray (no tone) when count is 0/undefined. */}
            <QuickBtn
              label="take"
              onPress={onOpenTake}
              tone={takeableCount && takeableCount > 0 ? 'ready' : undefined}
            />
            <QuickBtn
              label="salvage"
              onPress={onOpenSalvage}
              tone={salvageableCount && salvageableCount > 0 ? 'ready' : undefined}
            />
            {/* OTA 031/032 — climb action group. Three states:
                  - on the ground       → CLIMB (opens noun picker)
                  - elevated, mid-climb → CLIMB UP + CLIMB DOWN
                  - elevated, at top    → CLIMB DOWN only
                CLIMB UP fires the next tier on the same noun
                without re-opening the picker. */}
            {!elevatedOn ? (
              <QuickBtn
                label="climb"
                onPress={onOpenClimb}
                tone={climbableCount && climbableCount > 0 ? 'ready' : undefined}
              />
            ) : (
              <>
                {/* OTA-172 — climb up + climb down get the blue
                    `defensive` tone when rendered. They only render
                    when the player is elevated AND the action is
                    usable (climb-up only shows mid-climb when more
                    tiers remain; climb-down only shows when
                    elevated), so the tone signals "this is the safe
                    egress from being up high" — same blue cue the
                    player already reads on dodge / flee. Player ask:
                    "make the climb 1/3 type buttons blue and the
                    climb down blue when they are able to be used." */}
                {elevatedOn.tier < elevatedOn.totalTiers && (
                  <QuickBtn
                    label={`climb up (${elevatedOn.tier}/${elevatedOn.totalTiers})`}
                    onPress={onClimbUp}
                    defensive
                  />
                )}
                <QuickBtn label="climb down" onPress={onClimbDown} defensive />
              </>
            )}
            <QuickBtn label="craft" onPress={onOpenCrafting} />
            <QuickBtn label="inventory" onPress={onOpenInventory} />
          </>
        )}
      </TutorialTarget>
      {/* OTA-144 — Dog action picker. Renders below the quick-row
          when the player has tapped the dog button. Two big buttons:
          BITE fires `dog_bite`, DISTRACT fires `dog_distract`. Either
          tap closes the picker. */}
      {dog && dog.hp > 0 && dogPickerOpen ? (
        <View style={styles.dogPicker}>
          <Pressable
            onPress={() => {
              setDogPickerOpen(false);
              onSubmit('bite');
            }}
            style={styles.dogPickerBtn}
          >
            <Text style={styles.dogPickerLabel}>BITE</Text>
            <Text style={styles.dogPickerHint}>{dog.name} lunges in</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setDogPickerOpen(false);
              onSubmit('distract');
            }}
            style={styles.dogPickerBtn}
          >
            <Text style={styles.dogPickerLabel}>DISTRACT</Text>
            <Text style={styles.dogPickerHint}>pounces + barks · +1 init, +2 atk next swing</Text>
          </Pressable>
        </View>
      ) : null}
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
            MIC button is the always-visible push-to-talk.
            OTA-173 — silence button hides here when inCombat. The
            EnemyPanel renders its own bottom-right silence overlay
            during combat so the composer row stays clear of text-
            blocking icons. In peace mode the silence button stays
            here as the always-visible interrupt. */}
        {(voice.ttsEnabled || voice.sttEnabled) && (
          speaking && voice.ttsEnabled && !inCombat ? (
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
 *  splits the available horizontal space across all four buttons.
 *
 *  Single-line + ellipsize for long labels — destination name is
 *  passed through with the arrow prefix ("→ ISKAN-VEIL"), Text has
 *  overflow control to keep long Capital names from wrapping. */
function TravelBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.travelBtn} onPress={onPress} activeOpacity={0.7}>
      <Text
        style={styles.travelBtnText}
        numberOfLines={1}
        ellipsizeMode="tail"
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  // OTA-172 — combat-only stacked layout. The wrapper goes column,
  // and each row inside uses quickRowLine. Peace mode keeps the
  // single flat quickRow.
  quickRowColumn: { flexDirection: 'column', gap: 6 },
  quickRowLine: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  // OTA-144 — dog action picker. Two big tap targets below the quick
  // row when the player taps the dog combat button. Sized to match
  // the QuickBtn visual register but more prominent (vertical-stack
  // label + hint per option).
  dogPicker: { flexDirection: 'row', gap: 8, marginTop: 6 },
  dogPickerBtn: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#5a4f3e',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  dogPickerLabel: { color: '#e6d8b3', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  dogPickerHint: { color: '#8a7e66', fontSize: 10, marginTop: 4, textAlign: 'center' },
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
  /** 2026-05-25 — moves-left badge sits between STOP TRAVEL and MAP
   *  in the travel row, sized to the digit + sub-label only so it
   *  doesn't crowd the action buttons. Non-interactive. */
  movesBadge: {
    backgroundColor: '#13110f',
    borderColor: '#9ec96a',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  movesBadgeText: { color: '#9ec96a', fontSize: 16, fontWeight: '800', letterSpacing: 1, lineHeight: 18 },
  movesBadgeSub: { color: '#7a705c', fontSize: 8, letterSpacing: 1, marginTop: 1 },
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
