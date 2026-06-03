import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Pressable, Keyboard, Platform } from 'react-native';
import { TutorialTarget } from './TutorialTarget';
// OTA-189 — speech-to-text removed entirely per player ask: "remove
// the stt button, the code for it from the game, and the button for
// activation from the voice tab in settings." Mic button, handleMic,
// STTManager import, listening state + poll all dropped. TTS path is
// unaffected — read-aloud still routes through TTSManager via
// gameStore, controlled by the gear screen's TTS toggle.
import { useGameStore } from '../state/gameStore';
import { resolveDisplayWeaponByName } from '../engine/itemResolution';
import type { InventoryItem } from '../engine/types';

/** OTA 207 — does the equipped weapon reach the current combat range?
 *  Mirrors playerWeaponReach() in gameStore but takes weapon name +
 *  range as plain inputs so the component layer can call it. Returns
 *  the tone the QuickBtn should render: 'ready' when the weapon can
 *  hit at this range, 'needs-approach' when it can't. Returns
 *  undefined when there's no combat in progress so neutral grey
 *  rendering applies (we don't tone weapons out-of-combat).
 *  OTA-227 — takes inventory so fused weapons (catalog-absent,
 *  uniqueStats-bearing) resolve their weaponKind correctly instead
 *  of falling back to barehand. */
function weaponTone(
  weaponName: string | null | undefined,
  range: 'arm' | 'close' | 'far' | null | undefined,
  intelligence: number,
  inventory: ReadonlyArray<InventoryItem>,
): 'ready' | 'needs-approach' | undefined {
  if (!range) return undefined;
  // Bare hands — arm reach only.
  if (!weaponName) return range === 'arm' ? 'ready' : 'needs-approach';
  const w = resolveDisplayWeaponByName(weaponName, inventory);
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
  /** OTA-239 — opens the Ask the Arbiter modal (lore lookup). */
  onOpenAskArbiter: () => void;
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
  /** OTA-180 — onOpenFeedback prop dropped alongside the 📝
   *  designer-note button removal. The appendFeedback store action
   *  is still exported for any future re-introduction or for
   *  programmatic feedback emits. */
  /** OTA 049 — open the world Atlas (MapScreen). Sits on the same row
   *  as the cardinal direction buttons so the player can step out of
   *  travel to consult the map without changing modes. Hidden in
   *  combat alongside the rest of the travel row. */
  onOpenMap: () => void;
  inCombat: boolean;
  equippedMain: string | null;
  equippedOff: string | null;
  /** OTA-227 — passed through to weaponTone so fused weapons
   *  (uniqueStats-bearing, catalog-absent) resolve their weaponKind
   *  for the in-range tone instead of falling back to barehand. */
  inventory: ReadonlyArray<InventoryItem>;
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
  /** OTA-188 — true when the player has any item in inventory that
   *  satisfies the climb_steep gate (Climbing Rope, Reclaimer's Rope,
   *  Mudwalker's Treads, etc.). Drives the CLIMB button's red-amber-
   *  green ladder: no rope → red, rope + nothing to climb → amber,
   *  rope + climbable in scene → green. Player ask: "this button
   *  should remain red until you have a usable rope in your
   *  inventory. and then turn amber until there are things to climb
   *  them turn green." */
  playerHasRope?: boolean;
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

export function InputBox({ onSubmit, onOpenInventory, onOpenSearch, onOpenCrafting, onOpenApproach, onOpenAskArbiter, onOpenSalvage, onOpenTake, onOpenClimb, onClimbUp, onClimbDown, elevatedOn, onOpenMap, inCombat, equippedMain, equippedOff, inventory, range, travelTargetName, onContinueTravel, onStopTravel, movesLeft, takeableCount, salvageableCount, climbableCount, investigateCount, golem, dog, playerHasRope }: Props) {
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

  // OTA-189 — voice state + listening poll dropped along with the
  // mic button. The only voice-settings consumer left in InputBox
  // was `voice.sttEnabled`; without STT there's nothing to watch.

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

  // OTA-298 — Tutorial keyboard gate. Player ask: "make it so the
  // keyboard cannot be used until the player either hits the skip
  // or first continue in the tutorial. it pops up as soon as you
  // open on Android and then you cannot see skip and it's
  // confusing." On Android the system likes to bring the soft
  // keyboard up the moment a focused TextInput is on screen, which
  // hides the welcome step's SKIP / CONTINUE buttons (positioned at
  // the top of the screen — see TutorialOverlay's cardPositionFor:
  // 'fullscreen' → bottom card, but the buttons sit on the keyboard
  // edge). Solution: while the tutorial is on the welcome step
  // (tutorialStep === 0), make the input non-editable + suppress
  // the soft keyboard on focus. Hitting SKIP clears tutorialStep
  // to null; hitting CONTINUE advances it to 1. Either action
  // unlocks the input — exactly the "skip or first continue"
  // gate the player asked for.
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const tutorialBlocksInput = tutorialStep === 0;
  useEffect(() => {
    // If the keyboard happened to be up when the welcome step
    // appeared (e.g. autoFocus from a stale draft, Android focus
    // restoration), dismiss it so the tutorial buttons are visible.
    if (tutorialBlocksInput) {
      Keyboard.dismiss();
    }
  }, [tutorialBlocksInput]);

  useEffect(() => {
    if (pendingDraft !== null) {
      const draft = consumeDraft();
      if (draft) {
        setText(draft);
        // Defer focus by one tick so the TextInput is mounted +
        // ready to receive the cursor. Skip the focus call while the
        // tutorial is blocking input — the welcome step takes
        // priority over any pending draft.
        if (!tutorialBlocksInput) {
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      }
    }
  }, [pendingDraft, consumeDraft, tutorialBlocksInput]);

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

  // OTA-189 — handleMic removed. STT is gone from the game; the only
  // voice affordance left on the input row is the Act button.

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
                tone={weaponTone(null, range, playerInt, inventory)}
              />
              <QuickBtn
                label="kick"
                onPress={() => onSubmit('kick')}
                tone={weaponTone(null, range, playerInt, inventory)}
              />
              {equippedMain ? (
                <QuickBtn
                  label={shortWeaponLabel(equippedMain).toLowerCase()}
                  onPress={() => onSubmit(`attack with the ${equippedMain.toLowerCase()}`)}
                  tone={weaponTone(equippedMain, range, playerInt, inventory)}
                />
              ) : null}
              {equippedOff ? (
                <QuickBtn
                  label={`off: ${shortWeaponLabel(equippedOff).toLowerCase()}`}
                  onPress={() => onSubmit(`attack with the off-hand ${equippedOff.toLowerCase()}`)}
                  tone={weaponTone(equippedOff, range, playerInt, inventory)}
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
              {/* OTA-175 — row 3 order corrected to match the playtest
                  spec: "approach, step back, and inventory should be on
                  the third line." OTA-172 shipped these in
                  inventory→approach→step-back order; reading the screen
                  back, the player meant the literal order they listed.
                  Now: APPROACH · STEP BACK · INVENTORY.
                  Approach in combat lets the player pick a SPECIFIC
                  enemy out of a multi-target encounter ("approach the
                  human" while the dragon and hellhound watch) plus
                  optionally slip in via stealth.
                  2026-05-25 [POLISH-1] — tone='needs-approach' (green
                  glow) when range is 'far' so the player sees at a
                  glance they need to close before attacking. */}
              <QuickBtn
                label="approach"
                onPress={onOpenApproach}
                tone={range === 'far' ? 'needs-approach' : undefined}
              />
              {/* v2.4.1 (OTA 034) — `advance` quick-button removed; the
                  approach button above unifies the close-range entry
                  for both exploration and combat. Parser synonyms
                  (`advance`, `lunge`, `forward`, `closein`, `charge
                  in`, `near`) still parse to the same intent for
                  typed-input compatibility. */}
              {range && range !== 'far' && (
                <QuickBtn label="step back" onPress={() => onSubmit('step back')} />
              )}
              {/* Inventory access stays prominent in combat — playtest
                  report flagged "pack" at the end of the row as easy
                  to miss. Now on the third row at the end of the
                  approach / step-back / inventory sequence per the
                  player's stated order. */}
              <QuickBtn label="inventory" onPress={onOpenInventory} />
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
                // OTA-188 — three-state tone ladder per player ask:
                //   no rope        → red (can't climb at all)
                //   rope + nothing → amber (ready when you find one)
                //   rope + things  → green (go).
                tone={
                  !playerHasRope
                    ? 'unavailable'
                    : climbableCount && climbableCount > 0
                      ? 'ready'
                      : 'needs-approach'
                }
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
            {/* OTA-239 — Ask the Arbiter button. Surfaces OTA-233's
                lore-lookup scheme as a one-tap action: opens a small
                modal with a text input; submit fires `ask the arbiter
                about <X>` through the parser → MiniLM cosine match
                against the ~408-concept lore bank. */}
            <QuickBtn label="ask arbiter" onPress={onOpenAskArbiter} />
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
            tutorialBlocksInput
              ? 'Tap SKIP or CONTINUE above to begin'
              : inCombat
              ? 'What do you do? (or use quick buttons)'
              : 'What do you do?'
          }
          placeholderTextColor="#5a5246"
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          textContentType="none"
          // OTA-298 — Tutorial keyboard gate. While the welcome step
          // is on screen, the input is non-editable and the soft
          // keyboard is suppressed even if the field somehow gets
          // focus (Android focus-restoration on cold start). Both
          // props are toggled together so the gate is consistent
          // across platforms — iOS honors editable; Android honors
          // showSoftInputOnFocus.
          editable={!tutorialBlocksInput}
          showSoftInputOnFocus={!tutorialBlocksInput}
        />
        {/* OTA-189 — mic button removed entirely along with all STT
            wiring. TTS toggle still lives on the gear screen for
            players who want read-aloud off. */}
        {/* OTA-180 — designer-note (📝) button removed. Player:
            "let's remove the add note function for the log, I am
            past that portion of request adding." The feedback
            channel + appendFeedback action stay in place (they're
            referenced by the in-game tutorial copy and a few
            engine breadcrumbs); only the UI affordance to
            invoke them is gone. */}
        {/* OTA-282 — final keyboard-dismiss state. Player corrected the
            earlier Pitch Spire reading: "its supposed to be here for
            ios and nowhere for android." The in-row ▼ between input
            and Act IS the correct iOS position (the iOS keyboard
            pushes the row up so it stays visible above the keyboard);
            the InputAccessoryView bar I added in Ember Coil was the
            wrong placement. Final design: in-row ▼ on iOS, nothing on
            Android (system back already dismisses there).
            Lineage: Chalk Tine (277) added in-row ▼ both platforms.
            Ember Coil (279) added InputAccessoryView + brightened in-
            row ▼. Ash Fence (280) iOS-gated the in-row ▼. Pitch Spire
            (281) wrongly removed it. Tar Vault (282) restores it. */}
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.kbDismiss}
            onPress={() => Keyboard.dismiss()}
            accessibilityLabel="Hide keyboard"
          >
            <Text style={styles.kbDismissText}>▼</Text>
          </TouchableOpacity>
        ) : null}
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
// OTA-188 — added 'unavailable' (red) for action buttons whose
// requirement isn't met at all (e.g., CLIMB with no rope in
// inventory). Greys are already taken by "nothing to act on";
// red signals "can't do this from your current loadout."
type QuickBtnTone = 'ready' | 'needs-approach' | 'defensive' | 'unavailable';

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
    resolvedTone === 'unavailable' && styles.quickUnavailable,
  ];
  const textStyle = [
    styles.quickText,
    resolvedTone === 'defensive' && styles.quickDefensiveText,
    resolvedTone === 'ready' && styles.quickReadyText,
    resolvedTone === 'needs-approach' && styles.quickNeedsApproachText,
    resolvedTone === 'unavailable' && styles.quickUnavailableText,
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
 *  OTA-181 — destination button (label starts with "→") now
 *  renders 2 lines tall with the full-size font instead of the
 *  shrunk-to-70% single-line that was hard to read on long Capital
 *  names. Player ask: "the arrow to mud flood nexus in the route
 *  box is way too small, make it two line tall." Non-destination
 *  buttons (NORTH / STOP TRAVEL / MAP) stay single-line + auto-
 *  shrink because their labels fit cleanly at full size. */
function TravelBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const isDestination = label.startsWith('→');
  return (
    <TouchableOpacity
      style={[styles.travelBtn, isDestination && styles.travelBtnDest]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text
        style={[styles.travelBtnText, isDestination && styles.travelBtnTextDest]}
        numberOfLines={isDestination ? 2 : 1}
        ellipsizeMode="tail"
        adjustsFontSizeToFit={!isDestination}
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
  // OTA-181 — destination travel button (label starts with "→").
  // Taller box + larger center-wrapped text so a long Capital name
  // ("→ MUD FLOOD NEXUS", "→ ISKAN-VEIL") reads at a glance instead
  // of shrinking to a 70% single-line blur. Two lines plus a touch
  // more vertical padding gives the destination its own visual
  // weight — it's the most important button in the row while travel
  // is active.
  travelBtnDest: { paddingVertical: 8 },
  travelBtnTextDest: { fontSize: 14, lineHeight: 17, letterSpacing: 1.5, textAlign: 'center' },
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
  // OTA-188 — red tone for actions with an unmet hard requirement
  // (no rope → CLIMB red). Combat color #e07a5f matches the
  // existing low-HP / damage warning palette.
  quickUnavailable: { borderColor: '#e07a5f' },
  quickText: { color: '#cdbf99', fontSize: 12 },
  quickDefensiveText: { color: '#6a9bbf' },
  quickReadyText: { color: '#9ec96a' },
  quickNeedsApproachText: { color: '#c9a86a' },
  quickUnavailableText: { color: '#e07a5f' },
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
  // OTA-277 — manual keyboard-dismiss chevron. Sized to sit between
  // input field and Act button without dominating the row.
  // OTA-279 — brightened from muted (#7a705c) to accent gold (#c9a86a)
  // because the original render was nearly invisible against the dark
  // background; iPhone playtester couldn't see the ▼ at all. Real iOS
  // dismiss path is now the InputAccessoryView bar above the keyboard
  // (kbAccessoryBar), but this in-row chevron stays as a redundant
  // affordance for Android + for when the keyboard isn't yet up.
  kbDismiss: {
    backgroundColor: '#1a1714',
    borderColor: '#5a5246',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
  },
  kbDismissText: { color: '#c9a86a', fontSize: 14, fontWeight: '700' },
  // OTA-189 — micBtn / micBtnActive / micBtnText styles removed
  // alongside the mic button. STT is gone from the game entirely;
  // only the TTS read-aloud path is still wired (and toggled from
  // the gear screen).
  // OTA-180 — feedbackBtn + feedbackBtnText styles removed alongside
  // the 📝 designer-note button removal.
});
