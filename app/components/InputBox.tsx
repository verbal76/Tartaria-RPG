import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Pressable,
  Keyboard,
  Platform,
  Animated,
  Vibration,
} from 'react-native';
import { TutorialTarget } from './TutorialTarget';
import { visibleBuildingRooms } from '../engine/buildings';
import type { ClimbBlockReason } from '../engine/climbReadiness';
import { TUTORIAL_STEPS, TUT_LOCK_BEATS } from './tutorialSteps';
import { playerWeaponReach, useGameStore, logUiTap } from '../state/gameStore';
import { useReduceMotion } from '../state/accessibility';
import { hubRoomFor, hubSkinFactionFor, isLeaveHubCommand, roomIsExit, hubDefinesExitRoom } from '../engine/hub';
import { resolveDisplayWeaponByName } from '../engine/itemResolution';
import { reachBandsFor } from '../engine/types';
// OTA-1170 — the dodge recharge bar reads its fill from one place.
import { dodgeFill, dodgeCooldownRounds } from '../engine/dodgeCooldown';
// OTA-1171 — the dodge lock is per difficulty tier; dialOf resolves CUSTOM per system.
import { dialOf } from '../engine/pressure';
import type { InventoryItem, CombatRange, PlayerCharacter } from '../engine/types';

/** OTA-1006 — the quick-button highlight reads reach from the SAME resolver the
 *  attack gate rolls with (playerWeaponReach: throwable instance → catalog
 *  row → forge-stamped uniqueStats.reachClass on fused weapons → runecaster
 *  INT gate). The local copy this replaces re-derived reach from the display
 *  catalog and missed the forge stamp, so a close-only fused weapon glowed
 *  green at mid range while the gate refused every swing. Bare hands
 *  (punch/kick, hand = null) stay a fixed barehanded check regardless of
 *  what's equipped. */
function weaponTone(
  player: PlayerCharacter | null,
  hand: 'main' | 'off' | null,
  range: CombatRange | null | undefined,
): 'ready' | 'needs-approach' | undefined {
  if (!range) return undefined;
  const bands = hand && player ? playerWeaponReach(player, hand).bands : reachBandsFor('barehanded');
  return bands.includes(range) ? 'ready' : 'needs-approach';
}

interface Props {
  onSubmit: (text: string) => void;
  onOpenInventory: () => void;
  onOpenSearch: () => void;
  onOpenCrafting: () => void;
  onOpenApproach: () => void;
  /** OTA-847 (STEALTH SYSTEM) — peaceful PICKPOCKET button (replaces the old
   *  out-of-combat APPROACH). Opens the mark/target picker; the walk-up-to-a-
   *  noun job APPROACH used to do out of combat is retired. */
  onOpenPickpocket: () => void;
  /** True when there's nothing to lift here (no vendor, no liftable target) —
   *  greys the PICKPOCKET button so it's never a dead tap. */
  pickpocketBlocked?: boolean;
  /** OTA-1080 — true when a MARK (a person with pockets) is in reach. Lights
   *  the PICKPOCKET button the same ready-green the torch uses: the glow
   *  means "this is a live possibility right now", matching the TALK glow's
   *  language one row up. */
  pickpocketPossible?: boolean;
  onOpenAskArbiter: () => void;
  /** arb120 — quick-row MISSIONS button → Contracts screen. Lets the top
   *  main-quest chip slim to a single line for more exploration room. */
  onOpenMissions: () => void;
  onOpenSalvage: () => void;
  onOpenTake: () => void;
  onOpenClimb: () => void;
  /** OTA-777 — small quick-use TORCH button (aim the Aetheric Torch at a lead).
   *  Shown only when `hasTorch`; `torchReady` lights it when the room has an
   *  open lead to aim at. */
  onOpenTorch: () => void;
  hasTorch?: boolean;
  torchReady?: boolean;
  /** OTA-778 — the torch's actual item name ("Aetheric Torch" / "Hand Torch"),
   *  so the button reads "use aetheric torch" — blatantly the item, not a
   *  mystery flashlight icon. */
  torchLabel?: string;
  /** OTA-788 — inside the Hidden Market, FUSE fires the free Crucible. (Trading
   *  is handled by stepping into a stall, which auto-opens its wares.) */
  onFuse?: () => void;
  onClimbUp: () => void;
  onClimbDown: () => void;
  elevatedOn?: { noun: string; tier: number; totalTiers: number } | null;
  onOpenMap: () => void;
  inCombat: boolean;
  equippedMain: string | null;
  equippedOff: string | null;
  // OTA-406 — coating adjective ("Acid-Etched", "Poisoned", …) for the equipped
  // weapon INSTANCE in each hand, or null. Resolved by the equipped slot id (so
  // two same-named weapons — one coated, one not — are told apart) and prepended
  // to the quick-button label so a coated weapon reads as itself ("off:
  // acid-etched rusty shortbow"). The attack ACTION still uses the base name +
  // hand keyword, so the parser resolves the right instance.
  equippedMainCoating?: string | null;
  equippedOffCoating?: string | null;
  inventory: ReadonlyArray<InventoryItem>;
  range?: CombatRange | null;
  // OTA-361 — at least one enemy in the scene is knocked out and lootable.
  // Surfaces the combat "loot" button.
  knockedOutPresent?: boolean;
  travelTargetName?: string | null;
  onContinueTravel?: () => void;
  onStopTravel?: () => void;
  movesLeft?: number | null;
  takeableCount?: number;
  salvageableCount?: number;
  climbableCount?: number;
  /** OTA-628 — why the engine would refuse a climb right now (or null when it
   *  wouldn't / nothing to climb). Drives the CLIMB button's red tone for ALL
   *  blocked cases, and the no-stamina-only haptic buzz. */
  climbBlockedReason?: ClimbBlockReason;
  investigateCount?: number;
  golem?: { name: string; hp: number; hpMax: number } | null;
  dog?: { name: string; hp: number; hpMax: number } | null;
  // arb-fix — why the dog can't act THIS swing, if at all. The dog chip still
  // shows in combat; when blocked, tapping it buzzes and the engine drops the
  // matching Arbiter line ('elevated' = benched at a climb base — hasn't
  // learned to climb; 'aerial' = target flies — can't jump that high).
  dogBlocked?: 'elevated' | 'aerial' | 'downed' | null;
  // arb-fix — a once/day race ability is available → show the ✦ ability chip.
  raceAbilityReady?: boolean;
  onOpenRaceAbilities?: () => void;
}

const PEACE_QUICK_DIRECT: Array<{ label: string; submit: string }> = [
  { label: 'look around you', submit: 'look' },
  { label: 'rest', submit: 'rest' },
];

// arb132 — STABLE empty-array sentinel for the bandolier selector. A NEW character
// has no `player.equipped.bandolierIds` yet, so `?? []` returned a FRESH array on
// every selector run; Zustand's Object.is equality then saw it as "changed" every
// render → InputBox re-rendered → selector re-ran → "Maximum update depth exceeded"
// the instant the name beat mounted (before the exploration screen ever painted).
// One frozen reference makes the undefined case stable, so the loop can't start.
const EMPTY_BANDOLIER_IDS: readonly string[] = Object.freeze([]);

// arb109 — "wrong control" haptic. A double-pulse (buzz · pause · buzz) reads
// unmistakably as an error, unlike the old single 30ms tap that was easy to
// miss on a Pixel-class device. Wrapped in try/catch since Vibration is a
// no-op on devices/sims without a vibrator.
function buzzWrong() {
  try { Vibration.vibrate([0, 32, 45, 32]); } catch { /* ignore */ }
}

function shortWeaponLabel(name: string): string {
  const tokens = name.split(/\s+/);
  if (tokens.length <= 2) return name;
  return tokens.slice(-2).join(' ');
}

export function InputBox({ onSubmit, onOpenInventory, onOpenSearch, onOpenCrafting, onOpenApproach, onOpenPickpocket, pickpocketBlocked, pickpocketPossible, onOpenMissions, onOpenSalvage, onOpenTake, onOpenClimb, onOpenTorch, hasTorch, torchReady, torchLabel, onFuse, onClimbUp, onClimbDown, elevatedOn, onOpenMap, inCombat, equippedMain, equippedOff, equippedMainCoating, equippedOffCoating, inventory, range, knockedOutPresent, travelTargetName, onContinueTravel, onStopTravel, movesLeft, takeableCount, salvageableCount, climbableCount, investigateCount, golem, dog, dogBlocked, raceAbilityReady, onOpenRaceAbilities, climbBlockedReason }: Props) {
  const [dogPickerOpen, setDogPickerOpen] = useState(false);
  // arb-fix (OTA — adaptive quick row) — the out-of-combat quick row shows the
  // world-interaction verbs (look / rest / investigate / take / salvage / climb /
  // ability) always, and tucks the menus + rarer actions (pickpocket / craft /
  // inventory / missions / torch / fuse) behind a MORE ▾ tray so the bottom of
  // the screen isn't a wall of buttons. Nothing is hidden — MORE is always there
  // — so discoverability holds and the layout doesn't jump as you move. During
  // the tutorial the tray is forced open so every beat can still point at its
  // control.
  const [moreOpen, setMoreOpen] = useState(false);
  // arb110 — combat bandolier popup. Resolve the racked throwable ids to live
  // inventory rows (qty > 0); tapping one hurls it via throwFromBandolier.
  const [bandolierOpen, setBandolierOpen] = useState(false);
  const bandolierIds = useGameStore((s) => s.player?.equipped?.bandolierIds ?? EMPTY_BANDOLIER_IDS);
  const bandolierItems = bandolierIds
    .map((id) => inventory.find((it) => it.id === id))
    .filter((it): it is InventoryItem => !!it && it.quantity > 0);
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  const consumeDraft = useGameStore((s) => s.consumeInputDraft);
  const pendingDraft = useGameStore((s) => s.pendingInputDraft);
  // arb-fix — flag the floating KeyboardInputBar to appear the instant the player
  // taps this field. A React focus event is reliable; the keyboard-height event
  // the bar used to mount on is dropped ~half the time on Android's New
  // Architecture, which left the bar absent and this field covered.
  const setExplorationInputActive = useGameStore((s) => s.setExplorationInputActive);
  // OTA-1006 — the whole player, for the shared reach resolver behind the weapon
  // quick-button tones (replaces the old intelligence-only read).
  const reachPlayer = useGameStore((s) => s.player ?? null);
  // OTA-1170 — rounds left on the dodge lockout; 0/absent = ready (full blue).
  const dodgeCooldown = useGameStore((s) => s.player?.dodgeCooldown ?? 0);
  // ⚠ OTA-1171 — the bar's DENOMINATOR is this character's difficulty tier, not the bare
  // constant. Divide bury_me's 5-round lock by 3 and the chip reads full blue with two
  // beats still locked — a control that visibly invites a tap it will then refuse, which
  // is the whole defect class OTA-1164 exists to prevent.
  const dodgeMax = useGameStore((s) => dodgeCooldownRounds(dialOf(s.player, 'dodgeLock')));
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const awaitingTutorialName = useGameStore((s) => s.awaitingTutorialName);
  const tutorialExploreChosen = useGameStore((s) => s.tutorialExploreChosen);
  const hubRoomId = useGameStore((s) => s.player?.hubRoomId ?? null);
  const factionId = useGameStore((s) => s.player?.factionId ?? null);
  // OTA-1186 — the room chips must read the SITE's names, not the player's, or the
  // exit labels disagree with the room the player is standing in.
  const hubLocationId = useGameStore((s) => s.player?.currentLocationId ?? null);
  const skinFactionId = hubSkinFactionFor(hubLocationId, factionId);
  // arb25 — enterable buildings: when inside one, the travel row shows the
  // building's rooms + EXIT instead of cardinals / faction-hub exits.
  const activeBuildingId = useGameStore((s) => s.activeBuildingId);
  const activeBuildingRoomId = useGameStore((s) => s.activeBuildingRoomId);
  const buildingRevealed = useGameStore((s) => s.buildingRevealed);
  // arb36 — enterable structure discovered on the current wild tile.
  const sceneBuilding = useGameStore((s) => s.currentScene?.sceneBuilding ?? null);
  const enterBuilding = useGameStore((s) => s.enterBuilding);
  const goBuildingRoom = useGameStore((s) => s.goBuildingRoom);
  const exitBuilding = useGameStore((s) => s.exitBuilding);
  const buildingRooms = useMemo(
    () => (activeBuildingId
      // OTA-787 — navHidden rooms (the market square you land in) aren't tabs;
      // the row is the four stall tabs + EXIT whether you're in the square or a
      // stall.
      ? visibleBuildingRooms(activeBuildingId, new Set(buildingRevealed)).filter((r) => !r.navHidden)
      : []),
    [activeBuildingId, buildingRevealed],
  );

  const currentTutStep = tutorialStep !== null ? TUTORIAL_STEPS[tutorialStep] ?? null : null;
  const currentBeatId = currentTutStep?.id ?? null;

  // Pre-fill input from pendingInputDraft (the rope beat queues "take
  // rope"). We pre-fill the text as a VISIBLE hint but deliberately do
  // NOT call .focus() here — auto-focusing raised the soft keyboard on
  // its own (e.g. the instant the rope beat became active after the
  // player took the cudgel), which the player reported as the keyboard
  // popping up unbidden. Rule now: the keyboard only ever appears when
  // the player taps the text field themselves. The pre-filled command
  // sits in the field ready to send via the TAKE chip or a tap+enter.
  useEffect(() => {
    if (pendingDraft !== null) {
      const draft = consumeDraft();
      if (draft) setText(draft);
    }
  }, [pendingDraft, consumeDraft]);

  // Tungsten Spire — input row pulses when the current tutorial step
  // has `inputPulse: true` (name beat + rope beat). Pulses a border
  // colour animation; same Animated pattern as TutorialTarget.
  const inputPulse = currentTutStep?.inputPulse === true;
  // OTA-898 (SA-6) — respect the reduce-motion preference: hold the tutorial
  // input cue as a STATIC highlight instead of a looping pulse (the cue still
  // reads; only the continuous motion is dropped).
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!inputPulse || reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); };
  }, [inputPulse, reduceMotion, pulse]);
  const inputBorderColor = inputPulse
    ? (reduceMotion
        ? '#ffe28a'  // static highlight — no motion, still clearly cued
        : pulse.interpolate({ inputRange: [0, 1], outputRange: ['#c9a86a', '#ffe28a'] }))
    : '#3a342c';

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
    inputRef.current?.clear();
    // Hitting enter/send always dismisses the keyboard now (player ask:
    // "when you hit enter it should go away"). Previously this only fired
    // on the name beat, so the keyboard lingered after every typed
    // command and could reappear over later UI.
    Keyboard.dismiss();
  };

  // Tungsten Spire — hub-room named exits. When the player is inside
  // a hub (player.hubRoomId is set), the travel row swaps cardinal
  // chips for chips named after the rooms reachable from this one,
  // plus an OUT chip that fires the leave-hub verb. The chip's
  // onPress still submits 'go <direction>' so resolveHubTravel does
  // its existing thing; only the chip LABEL changes. Outside a hub
  // the row renders cardinals as before.
  const hubRoom = useMemo(() => (hubRoomId ? hubRoomFor(hubRoomId, skinFactionId) : null), [hubRoomId, skinFactionId]);
  const hubExitChips: Array<{ label: string; submit: string }> = useMemo(() => {
    if (!hubRoom) return [];
    const out: Array<{ label: string; submit: string }> = [];
    for (const dir of ['north', 'south', 'east', 'west'] as const) {
      const targetId = hubRoom.exits[dir];
      if (!targetId) continue;
      const targetRoom = hubRoomFor(targetId, skinFactionId);
      const label = targetRoom?.shortName?.toUpperCase() ?? dir.toUpperCase();
      out.push({ label, submit: `go ${dir}` });
    }
    return out;
  }, [hubRoom, skinFactionId]);

  // ⚠ OTA-1194 (PUNCHLIST P11) — the EXIT chip belongs ONLY in the gate room. Showing it in
  // every room let the player leave through the armory or the mess, which is not how the
  // outpost is laid out. Ported up from golem-line, where it has been correct since
  // 2026-06-27 while the live line was not.
  //
  // ⚠ The Gate is also the spawn room, so EXIT is still present where the tutorial's
  // `explore_or_leave` beat needs it — the beat is unaffected.
  const showExitChip = useMemo(() => {
    if (!hubRoom) return false;
    if (hubDefinesExitRoom()) return roomIsExit(hubRoom);
    return true;   // no gate tagged anywhere → never strand the player
  }, [hubRoom]);

  // TAKE / SALVAGE / INVESTIGATE during their tutorial beats now OPEN the
  // real picker menu so the player learns the actual interaction — the demo
  // prop (cudgel / broken chest plate / door) is injected into the matching
  // modal by ExplorationScreen for that beat, and its chip lights via the
  // count. Picking the prop submits the verb, which the submitPlayerAction
  // tutorial intercept grants + advances on.
  //
  // Only the typed-input demos keep a direct submit: the rope beat is
  // teaching TYPED input (the input row pulses with a pre-filled "take
  // rope"), and the note is taken straight from the feed.
  const takeOverride: (() => void) | null = currentBeatId === 'rope'
    ? () => onSubmit('take rope')
    : currentBeatId === 'read_note'
    ? () => onSubmit('take note')
    : null;
  const salvageOverride: (() => void) | null = null;
  const investigateOverride: (() => void) | null = null;

  // During the guided action beats (cudgel / rope / scrap / investigate),
  // drive the TAKE / SALVAGE / INVESTIGATE green "ready" glow off the CURRENT
  // BEAT rather than the room's real interactable counts. Otherwise TAKE
  // stayed green after the tutorial items were already taken (the room still
  // had real nouns), and SALVAGE stayed green into the investigate beat.
  // green = the one thing to do now; the completed buttons drop to amber.
  const tutActionBeat =
    currentBeatId === 'cudgel' || currentBeatId === 'armor' || currentBeatId === 'rope'
      || currentBeatId === 'scrap' || currentBeatId === 'climb'
      || currentBeatId === 'investigate'
      ? currentBeatId : null;
  const takeTone: 'ready' | undefined = tutActionBeat
    ? (tutActionBeat === 'cudgel' || tutActionBeat === 'armor' || tutActionBeat === 'rope' ? 'ready' : undefined)
    : (takeOverride || (takeableCount && takeableCount > 0) ? 'ready' : undefined);
  const salvageTone: 'ready' | undefined = tutActionBeat
    ? (tutActionBeat === 'scrap' ? 'ready' : undefined)
    : (salvageOverride || (salvageableCount && salvageableCount > 0) ? 'ready' : undefined);
  const investigateTone: 'ready' | undefined = tutActionBeat
    ? (tutActionBeat === 'investigate' ? 'ready' : undefined)
    : (investigateOverride || (investigateCount && investigateCount > 0) ? 'ready' : undefined);
  // CLIMB is green whenever the room has climbables, which during the
  // tutorial meant it glowed through every beat. Gate it to the climb beat
  // so green points only at the current action; normal count/rope logic
  // applies outside the tutorial.
  // CLIMB only carries a colour when there's actually something to climb:
  //   • climbable here, engine would allow it → 'ready'   (green)
  //   • climbable here, engine would refuse    → 'unavailable' (red)
  //   • nothing climbable here                 → undefined (neutral)
  // OTA-628 — red now covers EVERY blocked case (no rope / empty stamina /
  // frayed rope), driven by climbBlockedReason, so a green button never lies.
  // The old code only reddened the no-rope case (playerHasRope), leaving the
  // button green while the engine refused an empty-tank or frayed-rope climb —
  // the playtest where CLIMB was tapped repeatedly on 0 stamina.
  const climbTone: 'ready' | 'needs-approach' | 'unavailable' | undefined = tutActionBeat
    ? (tutActionBeat === 'climb' ? 'ready' : undefined)
    : (climbableCount && climbableCount > 0 ? (climbBlockedReason ? 'unavailable' : 'ready') : undefined);
  // OTA-629 — tapping a blocked (red) CLIMB now drops a one-line Arbiter nudge
  // explaining WHY, instead of opening a dead-end modal. The recoverable
  // empty-tank case ALSO buzzes (single 40ms pulse) so mashing CLIMB on 0 stamina
  // gives tactile feedback; gear problems (no/frayed rope) are red + nudge, no
  // buzz — a fix-your-kit message, not a scold. Arbiter dedup keeps repeat taps
  // from spamming the feed (line shows once; the buzz still fires each tap).
  const handleClimbPress = () => {
    if (!climbBlockedReason) { onOpenClimb(); return; }
    const line = climbBlockedReason === 'no_stamina'
      ? 'The Arbiter catches your arm. "Not on empty — rest or eat, then climb."'
      : climbBlockedReason === 'frayed_rope'
        ? 'The Arbiter eyes your kit. "That rope’s frayed through — it won’t hold your weight. Mend it or find another."'
        : 'The Arbiter looks up the height. "Not without a rope or climbing gear — you’ll need a grip first."';
    useGameStore.getState().appendLog('arbiter', line);
    if (climbBlockedReason === 'no_stamina') {
      try { Vibration.vibrate(40); } catch { /* ignore */ }
    }
  };
  // arb108 — OUTPOST TUTORIAL LOCKDOWN. Until the player makes the
  // stay/leave choice (explore_or_leave), they're in the tutorial and may do
  // ONLY what the current beat asks; EVERY other control is dimmed + buzzes
  // on tap. This covers the beats that have no single "action" button (name,
  // rope→type, explore_or_leave) where nothing used to be blocked, plus the
  // controls that always slipped through (craft / inventory / ask-arbiter /
  // the direct quick row / travel / MAP). The lock lifts the moment the
  // player chooses (tutorialExploreChosen, or the beat advances past
  // explore_or_leave). The SKIP TUTORIAL pill is the one always-allowed exit.
  const tutLock =
    currentBeatId !== null
    && TUT_LOCK_BEATS.includes(currentBeatId)
    && !tutorialExploreChosen;
  // The single button the current beat permits (null = none; type/choose).
  const tutInstructed: 'look' | 'take' | 'salvage' | 'investigate' | 'climb' | null =
    // ⚠ OTA-1248 — 'armor' permits the same button as 'cudgel': the vest is TAKEN
    // from the picker, and the beat then completes on the equip in the pack.
    currentBeatId === 'look' ? 'look'
    : currentBeatId === 'cudgel' || currentBeatId === 'armor' ? 'take'
    : currentBeatId === 'scrap' ? 'salvage'
    : currentBeatId === 'investigate' ? 'investigate'
    : currentBeatId === 'climb' ? 'climb'
    : null; // name / rope (typed) / explore_or_leave (popup) → no button
  const takeBlocked = tutLock && tutInstructed !== 'take';
  const salvageBlocked = tutLock && tutInstructed !== 'salvage';
  const investigateBlocked = tutLock && tutInstructed !== 'investigate';
  const climbBlocked = tutLock && tutInstructed !== 'climb';
  const approachBlocked = tutLock;
  // ⚠⚠ OTA-1249 — the look beat's OWN button must survive its own lockdown.
  // `blocked` beats `tone` inside QuickBtn, so a button that is both instructed
  // and locked renders GREY: the beat would tell the player to tap the one
  // control it had just dimmed. REST is the other direct quick button and stays
  // blocked, which is the whole point — one lit button, nothing else live.
  const lookBlocked = (submit: string): boolean =>
    tutLock && !(tutInstructed === 'look' && submit === 'look');

  return (
    <View style={styles.container}>
      {!inCombat && (
        <TutorialTarget area="travel-row" style={styles.travelRow}>
          {activeBuildingId ? (
            // Inside a building: up to 4 room buttons + EXIT (no MAP).
            <>
              {buildingRooms.slice(0, 4).map((r) => (
                <TravelBtn
                  key={r.id}
                  label={r.shortName}
                  active={r.id === activeBuildingRoomId}
                  onPress={() => goBuildingRoom(r.id)}
                />
              ))}
              {/* OTA-781 — the nav row stays CLEAN like a building's rooms:
                  just the stall tabs + EXIT. Tapping a stall swaps to it; EXIT
                  leaves the whole market. TRADE / FUSE live in the quick-action
                  row below (not here, not as floating chips). */}
              <TravelBtn label="EXIT" onPress={() => exitBuilding()} />
            </>
          ) : travelTargetName ? (
            <>
              {/* OTA-621 — a structure stands on THIS tile even mid-journey. Keep
                  the ENTER affordance on the travel row so "Tap ENTER to step
                  inside" never dangles without a button (the arb120 case): you can
                  step in, then resume the course. */}
              {sceneBuilding ? (
                <TravelBtn label="ENTER" onPress={() => enterBuilding(sceneBuilding)} />
              ) : null}
              <TravelBtn label={`→ ${travelTargetName.toUpperCase()}`} onPress={onContinueTravel ?? (() => {})} />
              <TravelBtn label="STOP TRAVEL" onPress={onStopTravel ?? (() => {})} />
              {typeof movesLeft === 'number' && movesLeft >= 0 ? (
                <View style={styles.movesBadge}>
                  <Text style={styles.movesBadgeText} numberOfLines={1}>{movesLeft}</Text>
                  <Text style={styles.movesBadgeSub} numberOfLines={1}>{movesLeft === 1 ? 'move' : 'moves'}</Text>
                </View>
              ) : null}            </>
          ) : hubRoom ? (
            // Tungsten Spire — hub-named exits. ROOM SHORT-NAMES instead of
            // N/S/E/W when the player is inside a building. arb22 — the world
            // MAP is meaningless indoors (you navigate by room, not tile), so
            // it's dropped here; the freed slot keeps the row at "up to 4
            // rooms + EXIT". EXIT (was OUT) leaves the building to the wilds.
            <>
              {hubExitChips.slice(0, 4).map((c) => (
                // arb108 — room hops are locked during the tutorial so the
                // beats stay in the spawn room; EXIT unlocks at the stay/leave
                // choice (the player's way out of the outpost + the tutorial).
                <TravelBtn key={c.submit} label={c.label} onPress={() => onSubmit(c.submit)} blocked={tutLock} />
              ))}
              {showExitChip ? (
                <TravelBtn label="EXIT" onPress={() => onSubmit('leave outpost')} blocked={tutLock && currentBeatId !== 'explore_or_leave'} />
              ) : null}
            </>
          ) : sceneBuilding ? (
            // arb36 — a structure stands on this tile: offer ENTER alongside
            // the cardinals so the player can step inside what they found.
            // ⚠ OTA-1249 — the cardinals carry the lock too. The outpost beats run
            // in a hub, so today this branch never renders under a live lock; that
            // is an assumption about spawn, not a guarantee, and it left the one
            // row that can walk the player out of the tutorial unblocked. Outside
            // the outpost `tutLock` is false and this costs nothing.
            <>
              <TravelBtn label="ENTER" onPress={() => enterBuilding(sceneBuilding)} blocked={tutLock} />
              <TravelBtn label="NORTH" onPress={() => onSubmit('go north')} blocked={tutLock} />
              <TravelBtn label="SOUTH" onPress={() => onSubmit('go south')} blocked={tutLock} />
              <TravelBtn label="EAST" onPress={() => onSubmit('go east')} blocked={tutLock} />
              <TravelBtn label="WEST" onPress={() => onSubmit('go west')} blocked={tutLock} />
            </>
          ) : (
            <>
              <TravelBtn label="NORTH" onPress={() => onSubmit('go north')} blocked={tutLock} />
              <TravelBtn label="SOUTH" onPress={() => onSubmit('go south')} blocked={tutLock} />
              <TravelBtn label="EAST" onPress={() => onSubmit('go east')} blocked={tutLock} />
              <TravelBtn label="WEST" onPress={() => onSubmit('go west')} blocked={tutLock} />            </>
          )}
        </TutorialTarget>
      )}
      <TutorialTarget area="quick-row" style={inCombat ? styles.quickRowColumn : styles.quickRow}>
        {inCombat ? (
          <>
            <View style={styles.quickRowLine}>
              {/* OTA-932 — hide the bare-hand PUNCH/KICK buttons when a HAND weapon (gauntlets,
                  wraps, knuckles — tagged 'barehanded') is equipped: those hands ARE the weapon,
                  so you wouldn't take it off to punch. The weapon button below covers the swing. */}
              {!(
                !!resolveDisplayWeaponByName(equippedMain ?? '', inventory)?.tags?.includes('barehanded') ||
                !!resolveDisplayWeaponByName(equippedOff ?? '', inventory)?.tags?.includes('barehanded')
              ) && (
                <>
                  {(() => {
                    const punchT = weaponTone(reachPlayer, null, range);
                    return <QuickBtn label="punch" onPress={() => onSubmit('punch')} tone={punchT} outOfRange={punchT === 'needs-approach'} />;
                  })()}
                  {(() => {
                    const kickT = weaponTone(reachPlayer, null, range);
                    return <QuickBtn label="kick" onPress={() => onSubmit('kick')} tone={kickT} outOfRange={kickT === 'needs-approach'} />;
                  })()}
                </>
              )}
              {equippedMain ? (() => {
                const mainT = weaponTone(reachPlayer, 'main', range);
                const coat = equippedMainCoating ? `${equippedMainCoating.toLowerCase()} ` : '';
                return <QuickBtn label={`${coat}${shortWeaponLabel(equippedMain).toLowerCase()}`} onPress={() => onSubmit(`attack with the ${equippedMain.toLowerCase()}`)} tone={mainT} outOfRange={mainT === 'needs-approach'} />;
              })() : null}
              {equippedOff ? (() => {
                const offT = weaponTone(reachPlayer, 'off', range);
                const coat = equippedOffCoating ? `${equippedOffCoating.toLowerCase()} ` : '';
                return <QuickBtn label={`off: ${coat}${shortWeaponLabel(equippedOff).toLowerCase()}`} onPress={() => onSubmit(`attack with the off-hand ${equippedOff.toLowerCase()}`)} tone={offT} outOfRange={offT === 'needs-approach'} />;
              })() : null}
            </View>

            <View style={styles.quickRowLine}>
              {/* OTA-912 — while ELEVATED (fighting atop a climb) dodge, flee, and the golem
                  are unavailable and companions are benched below. Say so, so the missing
                  buttons read as a rule, not a bug. */}
              {elevatedOn ? (
                <Text style={styles.elevatedNote}>⛰ ELEVATED — no dodge · companions below · flee dives for the base</Text>
              ) : null}
              {golem && golem.hp > 0 && !elevatedOn ? (
                // OTA-911 — the golem is benched at the climb base (it can't
                // climb), so its command is hidden while you're elevated.
                <QuickBtn label={`golem (${golem.hp}/${golem.hpMax})`} onPress={() => onSubmit('use golem')} tone="ready" />
              ) : null}
              {dog && dog.hp > 0 ? (
                <QuickBtn
                  label={`${dog.name.toLowerCase()} (${dog.hp}/${dog.hpMax})`}
                  // arb-fix — keep the dog in the arsenal even when it can't act
                  // (benched at a climb base, or the target's airborne). Tapping
                  // a blocked dog buzzes + lets the engine explain (once); an
                  // available dog opens the BITE/DISTRACT picker as before.
                  tone={dogBlocked ? 'needs-approach' : 'ready'}
                  onPress={() => {
                    if (dogBlocked) {
                      // arb143 — a BLOCKED dog can't act, so DON'T dispatch a
                      // 'bite': that ran the dog-combat handler, which early-
                      // returned with no roll and no damage — the player saw a
                      // bare "[player] bite" do nothing. Just buzz and explain
                      // inline (no turn spent, no empty action in the log).
                      Vibration.vibrate(40);
                      useGameStore.getState().appendLog(
                        'arbiter',
                        dogBlocked === 'aerial'
                          ? `"${dog.name} can't reach what's in the air," the Arbiter says. "Bring it down, or fight it yourself."`
                          : dogBlocked === 'downed'
                            ? `"${dog.name} is still down from that last fight," the Arbiter says. "Feed the dog to bring it up, then rest somewhere safe and it will fall in at your side."`
                            : `"${dog.name} is holding the ground below," the Arbiter says. "Dogs don't climb — come down to fight at ${dog.name}'s side."`,
                      );
                      return;
                    }
                    setDogPickerOpen((v) => !v);
                  }}
                />
              ) : null}
              {raceAbilityReady && onOpenRaceAbilities ? (
                <QuickBtn label="✦ ability" onPress={onOpenRaceAbilities} tone="ready" />
              ) : null}
              {/* OTA-911 — dodge and flee are off while you're on a climb: no
                  footing to weave a parry, nowhere to flee but straight down.
                  Hidden here (the engine also refuses them defensively). */}
              {/* OTA-1170 — DODGE carries a recharge bar. Still tappable while red: the
                  engine buzzes and names the beats left rather than refusing in silence. */}
              {!elevatedOn ? <QuickBtn label="dodge" defensive cooldownFill={dodgeFill(dodgeCooldown, dodgeMax)} onPress={() => onSubmit('dodge')} /> : null}
              {/* OTA-847 (STEALTH SYSTEM) — in-combat STEALTH. First action of the
                  fight = SNEAK ATTACK (free STE check for the drop); mid-combat =
                  BACKSTAB attempt (costs your turn, STE initiative race). The
                  'sneak' verb routes to the stealth intent handler either way. */}
              <QuickBtn label="stealth" defensive onPress={() => onSubmit('sneak')} />
              {/* OTA — flee is legal in wall fights now: one tap, normal flee
                  roll, success dives for the base (double stamina per tier). */}
              <QuickBtn label="flee" defensive onPress={() => onSubmit('flee')} />
              {/* OTA-361 — loot a knocked-out humanoid. One tap strips their
                  kit (damaged) + drops + TC and clears them from the fight. */}
              {knockedOutPresent ? (
                <QuickBtn label="loot" tone="ready" onPress={() => useGameStore.getState().lootKnockedOutEnemy()} />
              ) : null}
              {/* arb110 — bandolier: opens a popup of racked throwables to hurl. */}
              {bandolierItems.length > 0 ? (
                <QuickBtn label={`✦ bandolier (${bandolierItems.length})`} tone="ready" onPress={() => setBandolierOpen((v) => !v)} />
              ) : null}
            </View>

            <View style={styles.quickRowLine}>
              {/* OTA-550 — approach highlights whenever you're not yet at the
                  closest band; step back shows whenever you're not at the
                  farthest (distant). */}
              <QuickBtn label="approach" onPress={onOpenApproach} tone={range && range !== 'close' ? 'needs-approach' : undefined} />
              {range && range !== 'distant' && (
                <QuickBtn label="step back" onPress={() => onSubmit('step back')} />
              )}
              <QuickBtn label="inventory" onPress={onOpenInventory} />
            </View>
          </>
        ) : (
          <>
            {PEACE_QUICK_DIRECT.map((qa) => (
              <QuickBtn
                key={qa.submit}
                label={qa.label}
                onPress={() => onSubmit(qa.submit)}
                // Light "look around you" green during the look beat. It was
                // a static, unlit button with nothing drawing the player to
                // it (playtest: "nothing's drawing you to that button").
                tone={currentBeatId === 'look' && qa.submit === 'look' ? 'ready' : undefined}
                blocked={lookBlocked(qa.submit)}
              />
            ))}
            {raceAbilityReady && onOpenRaceAbilities && !tutLock ? (
              <QuickBtn label="✦ ability" onPress={onOpenRaceAbilities} tone="ready" />
            ) : null}
            <QuickBtn
              label="investigate"
              onPress={investigateOverride ?? onOpenSearch}
              tone={investigateTone}
              blocked={investigateBlocked}
            />
            {/* ⚠⚠ OTA-1233 — ONE BUTTON. TAKE and SALVAGE were two buttons over the
                same list of scene nouns, and the seam between them is where
                OTA-1231's bugs lived. The merged picker (GatherModal) shows the
                room once and chooses the verb per row.

                ⚠ The TUTORIAL OVERRIDES ARE BOTH HONOURED HERE. Its 'cudgel' beat
                drives `takeOverride` and its 'scrap' beat drives
                `salvageOverride`, and each beat force-shows its own prop. With one
                button, whichever override is armed wins — take first, because the
                cudgel beat comes first and a beat that cannot be tapped is a
                stalled tutorial, which is the one failure this merge must not
                introduce.

                ⚠ Tone and blocked-state OR the two, so the button lights when
                EITHER kind of thing is present and only greys when neither is. */}
            <QuickBtn
              label="take / salvage"
              onPress={takeOverride ?? salvageOverride ?? onOpenTake}
              tone={takeTone ?? salvageTone}
              blocked={takeBlocked && salvageBlocked}
            />
            {!elevatedOn ? (
              <QuickBtn
                label="climb"
                onPress={handleClimbPress}
                tone={climbTone}
                blocked={climbBlocked}
              />
            ) : (
              <>
                {elevatedOn.tier < elevatedOn.totalTiers && (
                  <QuickBtn label={`climb up (${elevatedOn.tier}/${elevatedOn.totalTiers})`} onPress={onClimbUp} defensive />
                )}
                <QuickBtn label="climb down" onPress={onClimbDown} defensive />
              </>
            )}
            {/* USE TORCH stays a PRIMARY action — it's a situational world verb (it
                only appears when you're carrying a torch), so it doesn't belong behind
                MORE. Player ask: "use aetheric torch should not be under the more button." */}
            {hasTorch && (
              <QuickBtn label={`use ${torchLabel ?? 'torch'}`} onPress={onOpenTorch} tone={hasTorch && torchReady ? 'ready' : undefined} blocked={tutLock} />
            )}
            {/* MORE ▾ tray toggle — reveals the menus + rarer actions. Hidden
                during the tutorial, where the tray is force-shown so the beats
                can point at every control. */}
            {!tutLock && (
              <QuickBtn label={moreOpen ? 'less ▴' : 'more ▾'} onPress={() => setMoreOpen((v) => !v)} />
            )}
            {(moreOpen || tutLock) && (
              <>
                {/* OTA-1080 — ready-green while a mark is in reach, matching
                    the TALK glow's "live possibility" language. Blocked still
                    wins (tone resolves to none). */}
                <QuickBtn label="pickpocket" onPress={onOpenPickpocket} blocked={approachBlocked || !!pickpocketBlocked} tone={pickpocketPossible ? 'ready' : undefined} />
                <QuickBtn label="craft" onPress={onOpenCrafting} blocked={tutLock} />
                <QuickBtn label="inventory" onPress={onOpenInventory} blocked={tutLock} />
                <QuickBtn label="missions" onPress={onOpenMissions} blocked={tutLock} />
                {/* OTA-788 — no TRADE button: stepping into a stall opens its wares
                    (and tapping the stall tab you're in re-opens them). FUSE stays —
                    the free Crucible has no other in-market affordance. */}
                {activeBuildingId === 'market' && onFuse && (
                  <QuickBtn label="fuse" onPress={onFuse} blocked={tutLock} />
                )}
              </>
            )}
          </>
        )}
      </TutorialTarget>
      {/* arb160 — reverted to the inline BITE/DISTRACT overlay (the player
          preferred it over the OTA-571 blocking popup). The amber-blocked-dog
          fix from arb143 stays; only the picker presentation is reverted. */}
      {dog && dog.hp > 0 && dogPickerOpen ? (
        <View style={styles.dogPicker}>
          <Pressable onPress={() => { setDogPickerOpen(false); onSubmit('bite'); }} style={styles.dogPickerBtn}>
            <Text style={styles.dogPickerLabel}>BITE</Text>
            <Text style={styles.dogPickerHint}>{dog.name} lunges in</Text>
          </Pressable>
          <Pressable onPress={() => { setDogPickerOpen(false); onSubmit('distract'); }} style={styles.dogPickerBtn}>
            <Text style={styles.dogPickerLabel}>DISTRACT</Text>
            <Text style={styles.dogPickerHint}>pounces + barks · +1 init, +4 atk next swing</Text>
          </Pressable>
        </View>
      ) : null}
      {/* arb110 — bandolier throw popup: one button per racked throwable; tap to hurl. */}
      {inCombat && bandolierOpen && bandolierItems.length > 0 ? (
        <View style={styles.bandolierPicker}>
          {bandolierItems.map((it) => {
            // OTA-550 — color each throwable by reach. Throwables strike from
            // 'far' inward (far/mid/close); the only out-of-range band is
            // 'distant'. RED when the current combat range is beyond reach
            // (too far to throw), GREEN when in range.
            const inRange = range ? reachBandsFor('throwable').includes(range) : true;
            return (
              <Pressable
                key={it.id}
                onPress={() => { setBandolierOpen(false); useGameStore.getState().throwFromBandolier(it.name, it.id); }}
                style={[styles.bandolierPickerBtn, inRange ? styles.bandolierInRange : styles.bandolierOutOfRange]}
              >
                <Text style={[styles.bandolierPickerLabel, inRange ? null : styles.bandolierOutOfRangeLabel]} numberOfLines={1}>{it.name.toUpperCase()}</Text>
                <Text style={styles.bandolierPickerHint}>{inRange ? 'hurl' : 'too far'}{it.quantity > 1 ? ` · ×${it.quantity} left` : ''}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <TutorialTarget area="input-row" style={styles.inputRow}>
        <Animated.View style={[styles.inputWrap, { borderColor: inputBorderColor }]}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            // OTA-1075 — owner, at the rope beat: "the text bar didn't pop up
            // with the keyboard, i had to back up and hit it again." Android
            // intermittently drops the native tap→focus→keyboard chain
            // (worst while a JS-driven pulse animation is saturating the
            // thread, which is exactly the tutorial's input-row state). An
            // explicit focus() on press-in is a no-op when the chain worked
            // and the retry when it did not — first tap always lands.
            onPressIn={() => inputRef.current?.focus()}
            onFocus={() => setExplorationInputActive(true)}
            placeholder={
              awaitingTutorialName
                ? 'Speak your name…'
                : inCombat
                ? 'What do you do? (or use quick buttons)'
                : 'What do you do?'
            }
            placeholderTextColor="#c9a86a"
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
            autoCorrect={false}
            autoCapitalize={awaitingTutorialName ? 'words' : 'none'}
            autoComplete="off"
            textContentType="none"
          />
        </Animated.View>
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

type QuickBtnTone = 'ready' | 'needs-approach' | 'defensive' | 'unavailable';

function QuickBtn({
  label,
  onPress,
  defensive,
  tone,
  blocked,
  outOfRange,
  cooldownFill,
}: {
  label: string;
  onPress: () => void;
  defensive?: boolean;
  tone?: QuickBtnTone;
  /** Tutorial gating: render neutral + dimmed, and a tap buzzes (haptic)
   *  instead of firing the action — so only the beat's instructed button
   *  actually does anything. */
  blocked?: boolean;
  /** Combat range gating: the weapon can't reach the target from here.
   *  KEEP the amber 'needs-approach' tone (so the player sees WHY), but a
   *  tap buzzes ("can't do it") instead of firing the attack — the engine
   *  used to treat an out-of-range attack as a free approach, which let
   *  PUNCH double as APPROACH. Now you must hit APPROACH yourself. */
  outOfRange?: boolean;
  /** ⚠ OTA-1170 — COOLDOWN FILL, 0…1. Undefined on every chip without a cooldown, which
   *  is all of them but DODGE. 0 renders full red (just used), 1 renders full blue (ready).
   *  ⚠ The chip stays TAPPABLE while red: the engine answers with a buzz and a line naming
   *  the beats remaining, because a control that refuses in silence is the OTA-1164 bug. */
  cooldownFill?: number;
}) {
  const resolvedTone: QuickBtnTone | undefined = blocked
    ? undefined
    : tone ?? (defensive ? 'defensive' : undefined);
  const containerStyle = [
    styles.quick,
    resolvedTone === 'defensive' && styles.quickDefensive,
    resolvedTone === 'ready' && styles.quickReady,
    resolvedTone === 'needs-approach' && styles.quickNeedsApproach,
    resolvedTone === 'unavailable' && styles.quickUnavailable,
    blocked && styles.quickDisabled,
  ];
  const textStyle = [
    styles.quickText,
    resolvedTone === 'defensive' && styles.quickDefensiveText,
    resolvedTone === 'ready' && styles.quickReadyText,
    resolvedTone === 'needs-approach' && styles.quickNeedsApproachText,
    resolvedTone === 'unavailable' && styles.quickUnavailableText,
    // arb86 — dim the LABEL on disabled chips (replaces the old whole-chip
    // opacity:0.4 so the fill stays opaque against any tuned background).
    blocked && styles.quickDisabledText,
  ];
  const handlePress = () => {
    // ⚠ OTA-1172 — THE BREADCRUMB, AND IT IS FIRST ON PURPOSE. The freeze report had no
    // record of a tap between the last salvage and 90 seconds of silence, so there was no
    // way to tell "the tap never arrived" (screen frozen) from "the tap arrived and the
    // work hung" (engine frozen). Moving this below any handler destroys that signal.
    logUiTap(label);
    if (blocked) {
      // arb109 — wrong control for this tutorial beat. A stronger double-pulse
      // (clearly an "error" buzz, not a tap) PLUS an on-screen Arbiter nudge,
      // because the old single 30ms buzz was easy to miss and "said" nothing.
      buzzWrong();
      useGameStore.getState().nudgeTutorialBlocked();
      return;
    }
    if (outOfRange) {
      // Combat range gate — buzz only (no tutorial nudge).
      try { Vibration.vibrate(30); } catch { /* ignore */ }
      return;
    }
    onPress();
  };
  return (
    // OTA-898 (SA-6) — screen-reader support for the quick-action chips: each
    // exposes a button role, its label, and a disabled state when blocked.
    <TouchableOpacity
      style={containerStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={cooldownFill !== undefined && cooldownFill < 1
        ? `${label}, recharging, ${Math.round(cooldownFill * 100)} percent`
        : label}
      accessibilityState={{ disabled: !!blocked }}
    >
      {/* ⚠ OTA-1170 — THE RECHARGE BAR, behind the label. Owner: "have it turn red and
          slowly fill back to blue… make the color fill left to right with no fade."
          Two absolute layers: red across the whole chip, then blue laid over it from the
          left to `cooldownFill`. No gradient and no Animated value anywhere — the fill is
          a hard edge that JUMPS one step per action, because the cooldown counts ROUNDS,
          not seconds, and a smooth tween would imply time is what refills it. */}
      {cooldownFill !== undefined && cooldownFill < 1 ? (
        <>
          <View style={styles.cooldownTrack} pointerEvents="none" />
          <View style={[styles.cooldownFill, { width: `${Math.max(0, Math.min(1, cooldownFill)) * 100}%` }]} pointerEvents="none" />
        </>
      ) : null}
      <Text style={textStyle}>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

function TravelBtn({ label, onPress, blocked, active }: { label: string; onPress: () => void; blocked?: boolean; active?: boolean }) {
  const isDestination = label.startsWith('→');
  // arb108/arb109 — during the outpost tutorial lockdown, travel/room buttons
  // buzz (double-pulse) + drop an Arbiter nudge instead of moving, so the
  // player can't wander off-script and gets clear "wrong" feedback.
  const handlePress = () => {
    logUiTap(label); // OTA-1172 — before any handler; see the note in QuickBtn.
    if (blocked) { buzzWrong(); useGameStore.getState().nudgeTutorialBlocked(); return; }
    onPress();
  };
  return (
    <TouchableOpacity
      style={[styles.travelBtn, isDestination && styles.travelBtnDest, blocked && styles.travelBtnBlocked, active && styles.travelBtnActive]}
      onPress={handlePress}
      activeOpacity={blocked ? 1 : 0.7}
      accessibilityRole="button"
      accessibilityLabel={`${isDestination ? 'Travel to ' : ''}${label.replace(/^→\s*/, '')}${active ? ', current course' : ''}`}
      accessibilityState={{ disabled: !!blocked, selected: !!active }}
    >
      <Text
        style={[styles.travelBtnText, isDestination && styles.travelBtnTextDest, active && styles.travelBtnTextActive]}
        numberOfLines={isDestination ? 2 : 1}
        ellipsizeMode="tail"
        adjustsFontSizeToFit={!isDestination}
        minimumFontScale={0.8} // OTA-1025 — was 0.55; below ~80% room names stop being readable
      >
        {active ? `▸ ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  quickRowColumn: { flexDirection: 'column', gap: 6 },
  quickRowLine: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  // OTA-912 — elevated-fight notice chip (why dodge/flee/companions are gone).
  elevatedNote: { color: '#c9a86a', fontSize: 11, fontWeight: '700', letterSpacing: 0.3, paddingVertical: 4, paddingHorizontal: 2 },
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
  // arb110 — bandolier throw popup (orange accent, wraps for up to 5 items).
  bandolierPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  bandolierPickerBtn: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: '#1d1411',
    borderColor: '#5a3a30',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  bandolierPickerLabel: { color: '#e07a5f', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  bandolierPickerHint: { color: '#8a7e66', fontSize: 9, marginTop: 3, textAlign: 'center' },
  // OTA-550 — reach coloring on the bandolier picker: green border when the
  // throwable can reach the current combat range, red when it's out of range.
  bandolierInRange: { borderColor: '#4f7a3a' },
  bandolierOutOfRange: { borderColor: '#7a2f2f', backgroundColor: '#241211' },
  bandolierOutOfRangeLabel: { color: '#c45b4a' },
  // OTA-1025 — WRAP, don't shrink. Five equal-width slots on a phone left
  // ~80pt per button and adjustsFontSizeToFit took "MATERIALS" down to
  // 55% font — unreadable (owner, in Asgardar: "the text is too small to
  // read"). The row now wraps onto a second line once buttons would drop
  // under ~92pt, and the shrink floor is raised so text stays legible.
  travelRow: { flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  travelBtn: {
    flexGrow: 1, // OTA-1025 — grow to fill, but never below minWidth (wrap instead)
    flexBasis: '22%',
    minWidth: 92,
    backgroundColor: '#1a1714',
    borderColor: '#5a4a2e',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  // letterSpacing kept low (1) so longer room names ("GRAND HALL",
  // "LIVING ROOM") fit the equal-width slots without shrinking/ellipsizing
  // as hard. Short labels (NORTH / EXIT) still read fine with it.
  travelBtnText: { color: '#c9a86a', fontSize: 12, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 2 },
  travelBtnDest: { paddingVertical: 8 },
  travelBtnBlocked: { borderColor: '#2a2620', backgroundColor: '#141210', opacity: 0.5 },
  // you-are-here: the room the player currently stands in, inside a building.
  travelBtnActive: { borderColor: '#c9a86a', backgroundColor: '#2a2418' },
  travelBtnTextActive: { color: '#f0dca8' },
  travelBtnTextDest: { fontSize: 14, lineHeight: 17, letterSpacing: 1.5, textAlign: 'center' },
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
  movesBadgeSub: { color: '#a2977b', fontSize: 8, letterSpacing: 1, marginTop: 1 },
  quick: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    // OTA-1170 — clips the cooldown fill to the chip's rounded corners.
    overflow: 'hidden',
  },
  quickDefensive: { borderColor: '#6a9bbf' },
  // ⚠ OTA-1170 — the dodge recharge bar. Two absolute layers INSIDE the chip and behind
  // the label, clipped by the chip's own radius. `overflow: 'hidden'` on `quick` is what
  // keeps the fill from spilling past the rounded corners.
  // ⚠ NO GRADIENT, NO ANIMATION. Owner: "fill left to right with no fade." The blue is a
  // flat block whose WIDTH jumps one step per action; the red is simply what shows where
  // the blue has not reached yet. Blue matches `quickDefensive`'s border, so a full bar
  // reads as the chip's ordinary ready state rather than as a new colour.
  cooldownTrack: { position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, backgroundColor: '#4a1f1a' },
  cooldownFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#24455c' },
  // arb86 — was backgroundColor '#1a201410' (alpha ~6% → near-transparent).
  // Against the old near-black bg it read as a faint green tint, but with the
  // player-tunable background a bright hue FLOODED through the chip ("weird
  // coloring"). Now a fully OPAQUE dark green-tinted fill so the chip keeps a
  // solid background on any tuned hue; the green border still marks "ready".
  quickReady: { borderColor: '#9ec96a', backgroundColor: '#1b2417' },
  quickNeedsApproach: { borderColor: '#c9a86a' },
  quickUnavailable: { borderColor: '#e07a5f' },
  // Disabled (e.g. TAKE during the typed-input rope beat) — muted so it reads
  // as "not now" without the red 'unavailable' alarm color. arb86 — was
  // opacity 0.4, which made the whole chip (fill included) translucent so the
  // tuned background bled through ("weird fading"). Now an opaque darker fill +
  // dimmer border + dimmed text instead, so the chip stays solid on any hue.
  quickDisabled: { borderColor: '#2a2620', backgroundColor: '#141210' },
  quickText: { color: '#cdbf99', fontSize: 12 },
  quickDisabledText: { color: '#6a6253' },
  quickDefensiveText: { color: '#6a9bbf' },
  quickReadyText: { color: '#9ec96a' },
  quickNeedsApproachText: { color: '#c9a86a' },
  quickUnavailableText: { color: '#e07a5f' },
  inputRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  // Tungsten Spire — Animated.View wrapper so the input border can
  // pulse during the name + rope beats. Border lives on the wrapper;
  // TextInput inside is borderless so the pulse is the only frame.
  inputWrap: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    backgroundColor: '#1a1714',
  },
  input: {
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  send: {
    backgroundColor: '#3a342c',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 4,
  },
  sendText: { color: '#e6d8b3', fontWeight: '700' },
  kbDismiss: {
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
  },
  kbDismissText: { color: '#c9a86a', fontSize: 14, fontWeight: '700' },
});
