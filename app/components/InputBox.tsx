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
import { visibleBuildingRooms, roomHasExitDoor } from '../engine/buildings';
import type { ClimbBlockReason } from '../engine/climbReadiness';
import { TUTORIAL_STEPS, TUT_LOCK_BEATS } from './tutorialSteps';
import { useGameStore, logUiTap } from '../state/gameStore';
// ⚠ OTA-1404 — combat resolution moved out of gameStore into its own leaf.
import { playerWeaponReach } from '../state/combatResolution';
import { itemIsShield, findWeaponByName } from '../engine/crafting';
// OTA-1562 — the bandolier button has to give the SAME reach answer the throw
// gate will give; see the note at its `inRange` below.
import { parseWeaponEffect, applyRangeNote } from '../engine/weaponEffects';
import { itemIsHandThrownSpear } from '../engine/bandolierEligibility';
import { useReduceMotion } from '../state/accessibility';
import { hubRoomFor, hubSkinFactionFor, isLeaveHubCommand, roomIsExit, hubDefinesExitRoom, isHubLocation } from '../engine/hub';
import { WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } from '../engine/worldMap';
import { resolveDisplayWeaponByName } from '../engine/itemResolution';
// OTA-1553 — the combat weapon label: coating glyphs, the name, and a ★ when
// this weapon hits a weakness the player has actually discovered.
import {
  combatWeaponLabel,
  // OTA-1568 — the glyphs get their own styled nodes; see COATING_GLYPH_COLOR.
  combatWeaponLabelParts, COATING_GLYPH_COLOR, type CoatingGlyphPart,
  BASE_GLYPH_COLOR, type BaseGlyphPart, // OTA-1636 — the base type, far right
} from '../engine/weaponGlyphs';
import { reachBandsFor, reachFiresDown } from '../engine/types';
// ⚠ OTA-1423 — the three Arbiter refusals below name the dog, so they also
// have to gender it. Without this they read "bring it up" about a companion
// the player named and chose a sex for.
import { applyDogPronouns } from '../engine/dogCompanion';
import { buildingChipLabel, buildingMap } from '../engine/buildingMaps';
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
/** ⚠⚠ OTA-1454 — AN IN-REACH ATTACK IS `strike`, NOT `ready`, AND THAT ONE WORD
 *  IS THE WHOLE FIX.
 *
 *  An outside reviewer given only screenshots read the combat row as *"11
 *  identical flat buttons"* and asked for the groups to be colour-coded. They
 *  already were — and the review was still right, because two DIFFERENT groups
 *  had been given the SAME colour:
 *
 *    · every attack in reach            → 'ready'  (green)
 *    · golem / ability / loot / bandolier → 'ready'  (green)
 *
 *  So the turn-ending strikes and the utility chips were indistinguishable, and
 *  `defensive` blue was the only group that read as a group at all. Colour was
 *  never missing; it was AMBIGUOUS, which is worse, because it looks deliberate.
 *
 *  ⚠ THE OUT-OF-REACH AMBER IS UNTOUCHED. That amber is not a group, it is a
 *  STATE — "this one cannot land from here" — and OTA-930's whole point is that
 *  a control which cannot act must not look like one that can. Only the
 *  in-reach answer moved.
 *
 *  ⚠ AND NO NEW HUE. `strike` is the game's own parchment turned up, because
 *  amber already means out-of-reach and red already means unavailable; a sixth
 *  colour here would have read as a warning on the button you press most. */
function weaponTone(
  player: PlayerCharacter | null,
  hand: 'main' | 'off' | null,
  range: CombatRange | null | undefined,
  /** ⚠⚠⚠ OTA-1517 — TRUE WHEN THE ONLY FOES ARE GROUNDED AT THE BASE OF A
   *  CLIMB. The store has refused melee weapons in this situation since
   *  OTA-960; the button never knew, so it went ready-green and the tap
   *  bounced. Four taps in a row on the owner's tower relay. The band test
   *  below is not wrong — the raider really WAS at close band — it was just
   *  answering a different question than the gate. */
  groundedFoesBelow?: boolean,
): 'strike' | 'needs-approach' | undefined {
  if (!range) return undefined;
  const bands = hand && player ? playerWeaponReach(player, hand).bands : reachBandsFor('barehanded');
  // ⚠ Elevation FIRST: a weapon can be perfectly in-band and still unable to
  // land, and the amber's own meaning ("this one cannot land from here") is
  // exactly right for it. No new tone — see the header on why not.
  if (groundedFoesBelow && !reachFiresDown(bands)) return 'needs-approach';
  return bands.includes(range) ? 'strike' : 'needs-approach';
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
  /** ⚠⚠⚠ OTA-1517 — the scene's own answer to "are the only live foes standing
   *  at the BASE of the climb I'm up?". Computed once by the screen from the
   *  same scene flags the store's gate reads, so the button's look and the
   *  gate's refusal cannot drift apart again. */
  groundedFoesBelow?: boolean;
  inCombat: boolean;
  equippedMain: string | null;
  equippedOff: string | null;
  // OTA-406 — the equipped weapon INSTANCE in each hand, resolved by the equipped
  // slot id (so two same-named weapons — one coated, one not — are told apart).
  //
  // ⚠⚠ OTA-1553 — WAS A COATING ADJECTIVE, NOW THE INSTANCE ITSELF. The prop used
  // to be a single string ("Acid-Etched") prepended to the label, which had two
  // defects the owner hit at once: it could only ever show ONE coat, so his
  // frost-AND-incendiary cudgel read as though it carried one; and it spent a
  // whole word — sometimes two — before reaching the weapon's own name, which is
  // what pushed the damage off the button. Handing over the instance lets the
  // label carry a glyph per coat AND ask whether this weapon bites this foe.
  // The attack ACTION still uses the base name + hand keyword, so the parser
  // resolves the right instance.
  equippedMainItem?: InventoryItem | null;
  equippedOffItem?: InventoryItem | null;
  /** ⚠⚠⚠ OTA-1553 — the weaknesses of the ACTIVE enemy that the player has
   *  actually discovered (boss / Wisdom 12 read / learned by hitting it), from
   *  knownEnemyWeaknesses. Drives the ★. Empty — which is the common case early
   *  — draws no star at all, because the owner was explicit that the label may
   *  only say what he already knows: *"only base it off of what the player has
   *  discovered or is shown."* */
  activeEnemyKnownWeak?: readonly string[];
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
  /** OTA-1483 — true while the paced INVESTIGATE ALL sweep is streaming its
   *  results. The chip drops its green glow and reads "investigating…" so it
   *  stops inviting a tap that would talk over the stream. Still pressable —
   *  opening the picker is harmless and a dead control teaches nothing. */
  investigateSweeping?: boolean;
  golem?: { name: string; hp: number; hpMax: number } | null;
  dog?: { name: string; hp: number; hpMax: number } | null;
  // arb-fix — why the dog can't act THIS swing, if at all. The dog chip still
  // shows in combat; when blocked, tapping it buzzes and the engine drops the
  // matching Arbiter line ('elevated' = benched at a climb base — hasn't
  // learned to climb; 'aerial' = target flies — can't jump that high).
  dogBlocked?: 'elevated' | 'aerial' | 'downed' | null;
  // arb-fix — a once/day race ability is available → show the ✦ ability chip.
  /** ⚠⚠ OTA-1455 — a real, currently-actionable thing to suggest typing. Built by
   *  ExplorationScreen from the SAME array the gather picker renders, so the bar
   *  can never propose something the parser would refuse. Null when the scene has
   *  nothing live to point at — and then the bar says nothing rather than
   *  inventing an example, because a hint that fails teaches the wrong lesson. */
  parserHint?: string | null;
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

/** ⚠ OTA-1458 — "you cannot do this YET", distinct from "wrong control". A single
 *  soft pulse rather than the double-pulse error: empty legs are a state to fix,
 *  not a mistake to scold, and the two should not feel the same in the hand. */
function buzzSpent() {
  try { Vibration.vibrate(28); } catch { /* ignore */ }
}

// ⚠ OTA-1553 — the two-word trim moved to engine/weaponGlyphs as
// `shortWeaponName`, where combatWeaponLabel applies it. It is one rule about
// how much of a weapon's name fits on a button, and it now sits beside the
// glyphs and the ★ that share that room with it, rather than in a component
// where a second caller would have had to reimplement it.

/** ⚠⚠ OTA-1379 — THE MORE TRAY STAYS OPEN UNTIL THE PLAYER CLOSES IT.
 *
 *  Owner: *"when I hit the more button it should stay expanded until hit less."*
 *  It did not, and nothing was closing it — `setMoreOpen` has exactly ONE caller,
 *  the toggle itself. The tray was collapsing because the COMPONENT was being
 *  destroyed and `useState(false)` ran again on the way back.
 *
 *  InputBox is the final branch of ExplorationScreen's action-slot ternary, so it
 *  unmounts for a dice roll, a payoff, a conversation, a parley and the pickpocket
 *  picker — and the whole screen unmounts on every trip to inventory, missions,
 *  the map, the codex or the character sheet. Those are the most common things a
 *  player does BETWEEN needing the tray, which is why it felt like the button
 *  never held.
 *
 *  ⚠ A latch outside the component is the fix precisely BECAUSE it is outside:
 *  the state has to outlive the thing that keeps dying. Not lifted to
 *  ExplorationScreen (that unmounts too) and not put in the game store, because
 *  this is a bar preference, not world state — it has no business in a save file
 *  or a save migration.
 *
 *  ⚠ Session-scoped, deliberately. A cold start opens collapsed, which is the
 *  layout every player has always seen on launch, and it keeps this to one
 *  in-memory boolean with no key, no write, no hydration race and nothing to
 *  flicker. "Until hit less" is honoured for as long as the app is alive; if the
 *  owner wants it to survive a restart, that is a persisted preference and should
 *  be argued as one.
 *
 *  ⚠ The tutorial's forced-open (`moreOpen || tutLock`) is untouched and does NOT
 *  write the latch — a beat pointing at a control must not silently re-set the
 *  player's own choice for the rest of the session. */
let MORE_TRAY_OPEN = false;

export function InputBox({ onSubmit, onOpenInventory, onOpenSearch, onOpenCrafting, onOpenApproach, onOpenPickpocket, pickpocketBlocked, pickpocketPossible, onOpenMissions, onOpenSalvage, onOpenTake, onOpenClimb, onOpenTorch, hasTorch, torchReady, torchLabel, onFuse, onClimbUp, onClimbDown, elevatedOn, groundedFoesBelow, inCombat, equippedMain, equippedOff, equippedMainItem, equippedOffItem, activeEnemyKnownWeak, inventory, range, knockedOutPresent, travelTargetName, onContinueTravel, onStopTravel, movesLeft, takeableCount, salvageableCount, climbableCount, investigateCount, investigateSweeping, parserHint, golem, dog, dogBlocked, raceAbilityReady, onOpenRaceAbilities, climbBlockedReason }: Props) {
  const [dogPickerOpen, setDogPickerOpen] = useState(false);
  // arb-fix (OTA — adaptive quick row) — the out-of-combat quick row shows the
  // world-interaction verbs (look / rest / investigate / take / salvage / climb /
  // ability) always, and tucks the menus + rarer actions (pickpocket / craft /
  // inventory / missions / torch / fuse) behind a MORE ▾ tray so the bottom of
  // the screen isn't a wall of buttons. Nothing is hidden — MORE is always there
  // — so discoverability holds and the layout doesn't jump as you move. During
  // the tutorial the tray is forced open so every beat can still point at its
  // control.
  const [moreOpen, setMoreOpen] = useState(MORE_TRAY_OPEN);
  // arb110 — combat bandolier popup. Resolve the racked throwable ids to live
  // inventory rows (qty > 0); tapping one hurls it via throwFromBandolier.
  const [bandolierOpen, setBandolierOpen] = useState(false);
  const bandolierIds = useGameStore((s) => s.player?.equipped?.bandolierIds ?? EMPTY_BANDOLIER_IDS);
  const bandolierItems = bandolierIds
    .map((id) => inventory.find((it) => it.id === id))
    .filter((it): it is InventoryItem => !!it && it.quantity > 0);
  // ⚠⚠ OTA-1270 — the draft lives in the STORE, shared with the floating
  // KeyboardInputBar. Two private useState copies were how "act doesn't see
  // any text" happened: the player typed into one field and tapped the other
  // field's ACT, which read its own empty copy and silently returned.
  const text = useGameStore((s) => s.explorationDraft);
  const setText = useGameStore((s) => s.setExplorationDraft);
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
  // ⚠ OTA-1510 — the shield on the off arm, if any: lights the owner's BLOCK
  // ("should have a block button up here during combat") and SHIELD BASH.
  const offShieldName = (() => {
    const eq = reachPlayer?.equipped;
    if (!eq?.off) return null;
    const inst = reachPlayer?.inventory.find((i) => i.id === eq.offId)
      ?? reachPlayer?.inventory.find((i) => i.name === eq.off);
    return inst && itemIsShield(inst) ? inst.name : null;
  })();
  // ⚠ OTA-1511 — the SPARE throwing spear, if any: lights the owner's THROW
  // SPEAR button ("you should have spare and then throw spear button"). A
  // spare is a long-shaft hand throwable (throwable+spear — the population
  // OTA-605 keeps off the bandolier) that is either unequipped or a stack
  // deep enough that hurling one does not empty the hand.
  const throwSpearItem = (() => {
    const inv = reachPlayer?.inventory ?? [];
    const eq = reachPlayer?.equipped;
    return inv.find((i) =>
      itemIsHandThrownSpear(i) && i.quantity > 0
      && ((i.id !== eq?.mainId && i.id !== eq?.offId) || i.quantity > 1)) ?? null;
  })();
  // OTA-1170 — rounds left on the dodge lockout; 0/absent = ready (full blue).
  // ⚠⚠ OTA-1458 — EMPTY LEGS. Drives the travel row's spent state so a move the
  // store is about to refuse never looks tappable. See TravelBtn's `spent`.
  const noStamina = useGameStore((s) => (s.player?.stamina ?? 1) <= 0);
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
  // OTA-1611 — the local-grid tile the boots are on, for the gate-chip anchor test.
  const mapX = useGameStore((s) => s.player?.mapX ?? WORLD_MAP_CENTER_X);
  const mapY = useGameStore((s) => s.player?.mapY ?? WORLD_MAP_CENTER_Y);
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
  const buildingVisited = useGameStore((s) => s.buildingVisited);
  const exitBuilding = useGameStore((s) => s.exitBuilding);
  const buildingRooms = useMemo(
    () => (activeBuildingId
      // OTA-787 — navHidden rooms (the market square you land in) aren't tabs;
      // the row is the four stall tabs + EXIT whether you're in the square or a
      // stall.
      ? visibleBuildingRooms(activeBuildingId, new Set(buildingRevealed)).filter((r) => !r.navHidden)
      // ⚠ OTA-1430 — nothing is navHidden any more (the market square stopped
      // being, so the exit could be tied to it), but the filter stays: it is the
      // contract for any future room that should be enterable without being a
      // tab, and dropping it would put such a room on the row silently.
      : []),
    [activeBuildingId, buildingRevealed],
  );

  const currentTutStep = tutorialStep !== null ? TUTORIAL_STEPS[tutorialStep] ?? null : null;
  const currentBeatId = currentTutStep?.id ?? null;

  // Pre-fill input from pendingInputDraft — the Action Reference help cards
  // queue "finish this phrase" examples here. (⚠ OTA-1442: the TUTORIAL no
  // longer uses this — the old rope beat seeded "take rope", and the owner
  // cut it: typing the command yourself is the lesson.) We deliberately do
  // NOT call .focus() here — auto-focusing raised the soft keyboard on its
  // own, which the player reported as the keyboard popping up unbidden. Rule:
  // the keyboard only ever appears when the player taps the text field.
  useEffect(() => {
    if (pendingDraft !== null) {
      const draft = consumeDraft();
      if (draft) setText(draft);
    }
  }, [pendingDraft, consumeDraft]);

  // Tungsten Spire — input row pulses when the current tutorial step
  // has `inputPulse: true` (name beat + rope beat).
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
    // ⚠⚠ OTA-1442 — NATIVE driver, and the reason is the KEYBOARD, not the
    // frame rate. This loop used to animate borderColor on the JS driver —
    // a style write across the bridge every frame, for the whole beat, at the
    // exact moment the player taps the field. That JS load is when Android
    // starts dropping the tap→focus→keyboard event chain (OTA-1075 caught one
    // symptom; the owner's rope-beat "types blind behind the keyboard" is
    // another — the floating bar's mount signal raced the saturated thread).
    // borderColor cannot run native, so the pulse is now an OVERLAY border in
    // the bright colour whose OPACITY crossfades over a static dim border —
    // same look, zero per-frame JS.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { loop.stop(); };
  }, [inputPulse, reduceMotion, pulse]);
  const inputBorderColor = inputPulse
    ? (reduceMotion
        ? '#ffe28a'  // static highlight — no motion, still clearly cued
        : '#c9a86a') // the dim end; the bright overlay crossfades above it
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
  // ⚠ OTA-1606 — standing OUTSIDE on a hub tile: arrival no longer walks
  // through the gate on its own (owner: "other wise it's a tile"), so the
  // gate needs a button. Submits the taught phrase, same as EXIT does.
  // ⚠⚠⚠ OTA-1611 — AND THE GATE IS WHERE THE GATE IS. Owner's screenshot at
  // Reclaimer's Stake: ENTER and ENTER OUTPOST side by side — "why two enters?"
  // The 1606 predicate asked only whether the LOCATION is an outpost, and a
  // location is a whole local grid, so the gate chip followed him onto every
  // tile of it — including the tile where a found structure already offers its
  // own ENTER. Two buttons, two different doors, no way to tell which. The
  // outpost's door stands on the location's ANCHOR tile (the same tile
  // `sceneBuilding` is suppressed on, which is why they could never overlap
  // once this is right), so the chip stands there and nowhere else.
  const onAnchorTile = mapX === WORLD_MAP_CENTER_X && mapY === WORLD_MAP_CENTER_Y;
  const onHubTileOutside = !hubRoomId && !activeBuildingId && onAnchorTile && isHubLocation(hubLocationId);
  // ⚠⚠ OTA-1277 — MARK THE ROOMS YOU HAVE ALREADY WALKED. Owner, typed into the
  // game mid-session: *"I don't know if I've been to a room yet or not. maybe we
  // should put a little symbol in the room button if it's already been explored.
  // just so we know cuz I'm tapping the same things over and over again cuz I'm
  // cycling through like 15 names."* His own log shows exactly that — Memorial
  // visit 5, Workshop visit 4, Hearth visit 3, all inside seven minutes.
  // The visited set is the SAME one hub fast-travel already earns off
  // (worldMemory.hubVisited), so the dot can never disagree with what the game
  // thinks you have seen.
  const hubVisited = useGameStore((st) => st.worldMemory.hubVisited);
  const hubExitChips: Array<{ label: string; submit: string; a11y: string }> = useMemo(() => {
    if (!hubRoom) return [];
    const seen = new Set(hubVisited ?? []);
    const out: Array<{ label: string; submit: string; a11y: string }> = [];
    for (const dir of ['north', 'south', 'east', 'west'] as const) {
      const targetId = hubRoom.exits[dir];
      if (!targetId) continue;
      const targetRoom = hubRoomFor(targetId, skinFactionId);
      const name = targetRoom?.shortName?.toUpperCase() ?? dir.toUpperCase();
      // ⚠⚠ OTA-1369 — THE ARROW LEADS, AND IT IS THE HALF THAT CANNOT BE WRONG.
      // Owner: *"let's also get a directional arrow in front of that name in the
      // box only so even if the name is wrong directional[ly] you can figure it
      // out on the map."* Exactly right, and it is the correct division of
      // trust: the chip's WORD is an abbreviation of a painted label and can
      // drift from the artwork (this same OTA fixed seven that had), but the
      // DIRECTION is composed from outpostGraph and is the same thing the map's
      // corridors draw. A player holding the picture can always resolve the
      // room from the arrow, whatever the button says.
      //
      // Arrow FIRST, because it is the one element that is always present — the
      // four arrows line up as a stable left column the way OTA-1277 wanted the
      // ✓ marks to. The check keeps its place immediately before the name.
      const arrow = DIR_ARROW[dir];
      const walked = seen.has(targetId);
      out.push({
        label: `${arrow} ${walked ? `✓ ${name}` : name}`,
        submit: `go ${dir}`,
        // Screen readers get the word, not the glyph.
        a11y: `${dir}, ${targetRoom?.shortName ?? dir}${walked ? ', already explored' : ''}`,
      });
    }
    return out;
  }, [hubRoom, skinFactionId, hubVisited]);

  // ⚠ OTA-1194 (PUNCHLIST P11) — the EXIT chip belongs only in rooms that HAVE a door out.
  // Showing it in every room let the player leave through the armory or the mess, which is
  // not how the outpost is laid out.
  //
  // ⚠⚠ OTA-1271 — the owner overruled gate-ONLY from his own playtest ("why is there no
  // exit button", stranded in the workshop cluster): rooms tagged `exterior_door` in the
  // layout now carry the chip too (the Workshop's service door is the first). The rule
  // stays data-driven through roomIsExit — this component decides nothing about WHICH
  // rooms have doors.
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
  // OTA-1483 — a running sweep unlights the chip regardless of the count: the
  // count says "there is more to investigate", which is exactly what the sweep
  // is busy doing.
  const investigateTone: 'ready' | undefined = investigateSweeping
    ? undefined
    : tutActionBeat
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
            // Inside a building: the room buttons + EXIT (no MAP).
            // ⚠ OTA-1430 — the cap was 4, from when four rooms was the biggest
            // building. The market is five with the square un-hidden, and the
            // shed is four plus a revealed cellar. A silent slice(0, 4) would
            // have dropped the materials stall off the row — the row wraps
            // (travelRow: flexWrap), so a fifth and sixth chip cost a line, not
            // a room.
            <>
              {buildingRooms.slice(0, 6).map((r) => (
                <TravelBtn
                  key={r.id}
                  // ⚠ OTA-1428 — the found hall's chips carry a direction arrow
                  // and a ✓ for rooms already walked this visit, matching the
                  // outpost's travel chips. Only that building has a painted
                  // floor plan to be directional ABOUT: every other template is
                  // a flat room list, and an arrow invented for one would point
                  // at nothing. Those keep the plain label.
                  // ⚠ OTA-1429 — any building WITH A PAINTED PLAN gets arrows
                  // and ✓; the rest keep the plain label. Branches on the plan
                  // existing, not on an id, so a third painting needs no edit
                  // here.
                  label={buildingMap(activeBuildingId)
                    ? buildingChipLabel(activeBuildingId!, activeBuildingRoomId ?? '', r, buildingVisited)
                    : r.shortName}
                  active={r.id === activeBuildingRoomId}
                  onPress={() => goBuildingRoom(r.id)}
                />
              ))}
              {/* OTA-781 — the nav row stays CLEAN like a building's rooms:
                  just the room tabs + EXIT. Tapping a room swaps to it; EXIT
                  leaves the whole building. TRADE / FUSE live in the quick-action
                  row below (not here, not as floating chips).

                  ⚠⚠ OTA-1430 — EXIT ONLY WHERE THERE IS A DOOR. Owner: *"I want
                  the exit tied to the correct room."* It used to stand in every
                  room, so the player could walk out of a sealed vault or a
                  cellar under the floorboards straight into the weather. The
                  rule is data-driven (roomHasExitDoor) and the entry room always
                  qualifies, so no template can strand anyone — which is the
                  failure OTA-1271 records, the owner's own playtest stuck in the
                  outpost workshop behind an exit rule with no floor under it.
                  Every room is one tap away on this same row, so the way out is
                  never more than two taps. */}
              {roomHasExitDoor(activeBuildingId, activeBuildingRoomId) ? (
                <TravelBtn label="🚪 EXIT" wayOut testID="exit-chip" a11yLabel="Exit, leave this building" onPress={() => exitBuilding()} />
              ) : null}
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
              {onHubTileOutside ? (
                <TravelBtn label="ENTER OUTPOST" onPress={() => onSubmit('enter outpost')} blocked={tutLock} />
              ) : null}
              <TravelBtn label={`→ ${travelTargetName.toUpperCase()}`} destination spent={noStamina} onPress={onContinueTravel ?? (() => {})} />
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
                <TravelBtn key={c.submit} label={c.label} a11yLabel={c.a11y} destination={false} onPress={() => onSubmit(c.submit)} blocked={tutLock} />
              ))}
              {showExitChip ? (
                <TravelBtn label="🚪 EXIT" wayOut testID="exit-chip" a11yLabel="Exit, leave the outpost for the wilds" onPress={() => onSubmit('leave outpost')} spent={noStamina} blocked={tutLock && currentBeatId !== 'explore_or_leave'} />
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
              {onHubTileOutside ? (
                <TravelBtn label="ENTER OUTPOST" onPress={() => onSubmit('enter outpost')} blocked={tutLock} />
              ) : null}
              <TravelBtn label="NORTH" onPress={() => onSubmit('go north')} blocked={tutLock} spent={noStamina} />
              <TravelBtn label="SOUTH" onPress={() => onSubmit('go south')} blocked={tutLock} spent={noStamina} />
              <TravelBtn label="EAST" onPress={() => onSubmit('go east')} blocked={tutLock} spent={noStamina} />
              <TravelBtn label="WEST" onPress={() => onSubmit('go west')} blocked={tutLock} spent={noStamina} />
            </>
          ) : (
            <>
              {onHubTileOutside ? (
                <TravelBtn label="ENTER OUTPOST" onPress={() => onSubmit('enter outpost')} blocked={tutLock} />
              ) : null}
              <TravelBtn label="NORTH" onPress={() => onSubmit('go north')} blocked={tutLock} spent={noStamina} />
              <TravelBtn label="SOUTH" onPress={() => onSubmit('go south')} blocked={tutLock} spent={noStamina} />
              <TravelBtn label="EAST" onPress={() => onSubmit('go east')} blocked={tutLock} spent={noStamina} />
              <TravelBtn label="WEST" onPress={() => onSubmit('go west')} blocked={tutLock} spent={noStamina} />            </>
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
                    const punchT = weaponTone(reachPlayer, null, range, groundedFoesBelow);
                    return <QuickBtn label="punch" onPress={() => onSubmit('punch')} tone={punchT} outOfRange={punchT === 'needs-approach'} />;
                  })()}
                  {(() => {
                    const kickT = weaponTone(reachPlayer, null, range, groundedFoesBelow);
                    return <QuickBtn label="kick" onPress={() => onSubmit('kick')} tone={kickT} outOfRange={kickT === 'needs-approach'} />;
                  })()}
                </>
              )}
              {/* ⚠⚠⚠ OTA-1553 — `🔥 ❄ cudgel ★`. The owner's format, exactly:
                  *"fire glyph then a snowflake glyph then the word cudgel and
                  then at the end if the enemy is weak to either the frost or the
                  fire or the bludgeoning from the cudgel there should be a star
                  at the very end."* Both coats now show (the old prop carried a
                  single adjective, so a dual-coated weapon read as though it had
                  one), the star answers for BOTH coats and the weapon's raw
                  damage, and it obeys discovery — no star at all when nothing is
                  known, because the button may only say what he already knows.
                  The `off:` prefix is gone: in a fight the two buttons ARE the
                  two hands, side by side, and the word restated their own
                  arrangement while crowding out the thing worth reading. */}
              {equippedMain ? (() => {
                const mainT = weaponTone(reachPlayer, 'main', range, groundedFoesBelow);
                const raw = resolveDisplayWeaponByName(equippedMain, inventory)?.damageType ?? null;
                const label = combatWeaponLabel(equippedMain, equippedMainItem, raw, activeEnemyKnownWeak ?? []);
                const parts = combatWeaponLabelParts(equippedMain, equippedMainItem, raw, activeEnemyKnownWeak ?? []);
                return <QuickBtn label={label} glyphs={parts.glyphs} glyphText={parts.text} baseGlyph={parts.base} star={parts.star} onPress={() => onSubmit(`attack with the ${equippedMain.toLowerCase()}`)} tone={mainT} outOfRange={mainT === 'needs-approach'} />;
              })() : null}
              {equippedOff ? (() => {
                const offT = weaponTone(reachPlayer, 'off', range, groundedFoesBelow);
                const raw = resolveDisplayWeaponByName(equippedOff, inventory)?.damageType ?? null;
                const label = combatWeaponLabel(equippedOff, equippedOffItem, raw, activeEnemyKnownWeak ?? []);
                const parts = combatWeaponLabelParts(equippedOff, equippedOffItem, raw, activeEnemyKnownWeak ?? []);
                return <QuickBtn label={label} glyphs={parts.glyphs} glyphText={parts.text} baseGlyph={parts.base} star={parts.star} onPress={() => onSubmit(`attack with the off-hand ${equippedOff.toLowerCase()}`)} tone={offT} outOfRange={offT === 'needs-approach'} />;
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
                        applyDogPronouns(
                          dogBlocked === 'aerial'
                            ? `"${dog.name} can't reach what's in the air," the Arbiter says. "Bring it down, or fight it yourself."`
                            : dogBlocked === 'downed'
                              ? `"${dog.name} is still down from that last fight," the Arbiter says. "Feed {object} to bring {object} up, then rest somewhere safe and {pronoun} will fall in at your side."`
                              : `"${dog.name} is holding the ground below," the Arbiter says. "Dogs don't climb — come down to fight at ${dog.name}'s side."`,
                          // ⚠ The local `dog` here is a narrowed view ({name, hp, hpMax})
                          // with no sex on it, so the pronoun comes from the store. 'they'
                          // is the fallback the parser itself uses for an unknown answer.
                          useGameStore.getState().player?.dog?.sex.pronoun ?? 'they',
                        ),
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
              {/* ⚠⚠ OTA-1510 — the owner's BLOCK, "up here during combat", lit
                  exactly when a shield rides the off arm: the first blow of the
                  round breaks on it; holding position gives everybody a shot.
                  SHIELD BASH is the same shield turned offense — it rings the
                  target (stagger on hit) through the normal attack flow. */}
              {offShieldName && !elevatedOn ? (
                <QuickBtn label="block" defensive onPress={() => onSubmit('block')} />
              ) : null}
              {offShieldName ? (
                <QuickBtn label="shield bash" onPress={() => onSubmit(`attack with the off-hand ${offShieldName.toLowerCase()}`)} />
              ) : null}
              {/* ⚠ OTA-1511 — THROW SPEAR: hurl the spare long shaft through the
                  store's dedicated hand-throw (same full pipeline the bandolier
                  rides — throwable reach, authored dice, consume-on-hit). */}
              {throwSpearItem ? (
                <QuickBtn label="throw spear" onPress={() => useGameStore.getState().throwHeldWeapon(throwSpearItem.name, throwSpearItem.id)} />
              ) : null}
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
              label={investigateSweeping ? 'investigating…' : 'investigate'}
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
            {/* ⚠⚠⚠ OTA-1618 — MISSIONS IS A PRIMARY ACTION NOW, BESIDE MORE.
                Owner: *"can we have the mission button always there? Just set it
                right next to the more button. That way, we don't gotta hit more
                to get it."* It opens the whole slate (OTA-1615/1618) — the
                single most-asked question in his sessions, "what am I doing and
                am I in the right place" — and it was costing a tray tap first.
                Same reasoning that lifted USE TORCH out one row above. It sits
                BEFORE the tray toggle so its place on the row does not move when
                the tray opens. */}
            <QuickBtn label="missions" onPress={onOpenMissions} blocked={tutLock} />
            {/* MORE ▾ tray toggle — reveals the menus + rarer actions. Hidden
                during the tutorial, where the tray is force-shown so the beats
                can point at every control. */}
            {!tutLock && (
              <QuickBtn label={moreOpen ? 'less ▾' : 'more ▸'} onPress={() => setMoreOpen((v) => { MORE_TRAY_OPEN = !v; return !v; })} />
            )}
            {(moreOpen || tutLock) && (
              <>
                {/* OTA-1080 — ready-green while a mark is in reach, matching
                    the TALK glow's "live possibility" language. Blocked still
                    wins (tone resolves to none). */}
                <QuickBtn label="pickpocket" onPress={onOpenPickpocket} blocked={approachBlocked || !!pickpocketBlocked} tone={pickpocketPossible ? 'ready' : undefined} />
                <QuickBtn label="craft" onPress={onOpenCrafting} blocked={tutLock} />
                <QuickBtn label="inventory" onPress={onOpenInventory} blocked={tutLock} />
                {/* ⚠ OTA-1618 — MISSIONS left this tray for the primary row above.
                    Two copies would put the same button twice on one line the
                    moment the tray opens. */}
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
            //
            // ⚠⚠ OTA-1562 — …AND NOW BY ITS OWN RANGE NOTE. This button could
            // not call playerWeaponReach (the item isn't in a hand until the
            // throw racks it), so it re-derived the bands from the class alone —
            // harmless while every throwable reached identically, a live
            // disagreement the moment "Short-range" started meaning something.
            // A racked Throwing Knife would have glowed GREEN at `far` and then
            // been refused by the gate. Reading the same note the gate reads
            // keeps one authority on reach, which is the whole point of OTA-1006.
            // A coating vial has no catalog weapon row, so the note is null and
            // its colour is exactly what it always was.
            const throwBands = applyRangeNote(
              reachBandsFor('throwable'),
              parseWeaponEffect(findWeaponByName(it.name)?.effect)?.rangeNote ?? null,
            );
            const inRange = range ? throwBands.includes(range) : true;
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
        <View style={[styles.inputWrap, { borderColor: inputBorderColor }]}>
          {/* OTA-1442 — the pulse itself: bright border fading in and out on
              the NATIVE driver, over the static dim border above. */}
          {inputPulse && !reduceMotion ? (
            <Animated.View pointerEvents="none" style={[styles.inputPulseOverlay, { opacity: pulse }]} />
          ) : null}
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
            // ⚠⚠ OTA-1455 — THE BAR SAYS WHAT IT ACCEPTS, USING THIS ROOM.
            // Static "What do you do?" reads as a search box; a concrete example
            // drawn from what is actually in front of the player reads as an
            // engine that takes sentences. `❯` marks it as a prompt rather than
            // a field — one character that says "terminal, not search".
            //
            // ⚠ ORDER MATTERS. The tutorial name beat and combat keep their own
            // wording: during the name beat there is exactly one right answer and
            // a suggestion would compete with it, and in combat the quick buttons
            // are the thing to look at.
            placeholder={
              awaitingTutorialName
                ? 'Speak your name…'
                : inCombat
                ? 'What do you do? (or use quick buttons)'
                : parserHint
                ? `❯ try: ${parserHint}`
                : '❯ what do you do?'
            }
            placeholderTextColor="#c9a86a"
            onSubmitEditing={handleSubmit}
            // ⚠⚠ OTA-1555 — THE SAME WRAP FIX AS THE FLOATING BAR, and it has to
            // be here too because these two fields share ONE draft (OTA-1270).
            // The player types into whichever is up, so fixing only the floating
            // one would mean the same sentence wraps or does not depending on how
            // he happened to open the keyboard — a difference with no meaning he
            // could ever learn. Single-line meant a long action scrolled sideways
            // and he could see only its tail. Capped at three lines, then it
            // scrolls inside itself; `blurOnSubmit` keeps Enter meaning "send"
            // rather than letting Android swallow it as a newline.
            multiline
            blurOnSubmit
            scrollEnabled
            textAlignVertical="top"
            returnKeyType="send"
            autoCorrect={false}
            autoCapitalize={awaitingTutorialName ? 'words' : 'none'}
            autoComplete="off"
            textContentType="none"
          />
        </View>
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

/** ⚠⚠ OTA-1454 — `strike` JOINS THE TONES, AND IT IS THE ONE THAT WAS MISSING.
 *  An outside reviewer looking only at screenshots read the combat row as
 *  *"11 identical flat buttons"* and asked for the groups to be colour-coded.
 *  They ALREADY were — `defensive` has a blue border, `ready` a green border and
 *  fill, and the two range states their own ambers. What had no tone at all was
 *  the ATTACKS, which fell through to the base `quick` chip: a `#3a342c` grey
 *  border, dimmer than every utility beside it.
 *
 *  ⚠ So the hierarchy was INVERTED. The turn-ending action — hit the thing — was
 *  the quietest control on the row, and Dodge, Stealth and the bandolier all
 *  outshouted it. That is why the groups did not read: not because they were
 *  absent, but because the most important one was wearing the default. */
type QuickBtnTone = 'strike' | 'ready' | 'needs-approach' | 'defensive' | 'unavailable';

function QuickBtn({
  label,
  onPress,
  defensive,
  tone,
  blocked,
  outOfRange,
  cooldownFill,
  glyphs,
  glyphText,
  baseGlyph,
  star,
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
  /** ⚠ OTA-1568 — the coating glyphs, split out of `label` so each can carry its
   *  own colour and the black halo. When present, `glyphText` carries the rest of
   *  the same label. `label` itself is untouched and still the breadcrumb. */
  glyphs?: readonly CoatingGlyphPart[];
  glyphText?: string;
  /** ⚠ OTA-1636 — the weapon's own damage type, painted LAST and apart from
   *  the coats. Owner: "all the way to the right so it's not mixed in." */
  baseGlyph?: BaseGlyphPart | null;
  /** OTA-1638 — the discovery star, painted LAST, after the base glyph. */
  star?: boolean;
}) {
  const resolvedTone: QuickBtnTone | undefined = blocked
    ? undefined
    : tone ?? (defensive ? 'defensive' : undefined);
  const containerStyle = [
    styles.quick,
    resolvedTone === 'strike' && styles.quickStrike,
    resolvedTone === 'defensive' && styles.quickDefensive,
    resolvedTone === 'ready' && styles.quickReady,
    resolvedTone === 'needs-approach' && styles.quickNeedsApproach,
    resolvedTone === 'unavailable' && styles.quickUnavailable,
    blocked && styles.quickDisabled,
  ];
  const textStyle = [
    styles.quickText,
    resolvedTone === 'strike' && styles.quickStrikeText,
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
      // ⚠⚠⚠ OTA-1591 — THE BUZZ LEARNS TO TALK: buzz, then LET THE TAP THROUGH.
      //
      // This branch used to `return` after the vibrate, and the field proved
      // that design wrong: the owner's 2026-08-31 log has NINE taps on his
      // main-hand cleaver in 2.7 seconds while elevated over grounded foes —
      // nine 30ms buzzes, not one word, and he reasonably concluded the button
      // was broken.
      //
      // The bitter part: the store ALREADY HAD the words. OTA-960's elevation
      // gate and the reach gate beside it are FREE refusals — no stamina, no
      // time — that name the weapon, the reason, and the remedy ("X is down at
      // the base — the cleaver won't reach from up here. Use something that
      // SHOOTS, or climb down"). OTA-1517's swallow, added so a green chip
      // would stop "bouncing", sat IN FRONT of that refusal and traded the
      // spoken answer for a silent one — the defect class B15 closed
      // ("refusals always speak"), rebuilt one layer up in the UI.
      //
      // So: the amber tint stays (the hint before the tap), the buzz stays (the
      // hint at the tap), and the tap now REACHES the store, whose refusal says
      // why. One implementation of the answer, and it is the one with words.
      try { Vibration.vibrate(30); } catch { /* ignore */ }
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
      {/* ⚠⚠⚠ OTA-1568 — THE GLYPHS RENDER AS THEIR OWN NODES so they can carry a
          black halo and a per-kind colour; see weaponGlyphs.COATING_GLYPH_COLOR
          for why one string in one Text could never be styled.
          ⚠ `label` is UNCHANGED and still the flat string — it is the tap
          breadcrumb (logUiTap, above) and the screen-reader label, and OTA-1172
          is on record that the breadcrumb is forensic evidence. This only
          changes how the same characters are PAINTED. */}
      {(glyphs && glyphs.length > 0) || baseGlyph ? (
        <Text style={textStyle}>
          {(glyphs ?? []).map((g, i) => (
            <Text key={`${g.kind}${i}`} style={[styles.coatGlyph, { color: COATING_GLYPH_COLOR[g.kind] }]}>
              {/* ⚠ OTA-1569 — hair spaces pad the dark cell. Inline Text takes no
                  padding in React Native, and a cell clamped to the glyph's exact
                  box reads as a clipping artifact rather than a deliberate inlay.
                  They are added HERE and never to `label`, so the tap breadcrumb
                  and the screen-reader string stay byte-for-byte what they were. */}
              {`\u200a${g.ch}\u200a`}
            </Text>
          ))}
          <Text>{`${glyphs && glyphs.length > 0 ? ' ' : ''}${glyphText ?? ''}`.toUpperCase()}</Text>
          {baseGlyph ? (
            <>
              {/* ⚠ OTA-1638 — THE SPACER LIVES OUTSIDE THE CELL. The em space that
                  sets the base glyph off from the name used to sit INSIDE the dark
                  cell, so the cell stretched across the gap and read as a black
                  box on the sage chip (owner: "why the weird black boxes around
                  the glyphs"). Unstyled here, the gap is just a gap; the glyph
                  gets the same hair-space cell the coats get. */}
              <Text>{'\u2003'}</Text>
              <Text style={[styles.coatGlyph, { color: BASE_GLYPH_COLOR[baseGlyph.kind] ?? '#ffffff' }]}>
                {/* ⚠ OTA-1636 — the weapon's OWN damage type, painted after the
                    name so it can never be read as a third coat. Owner: "all the
                    way to the right so it's not mixed in." Same halo as the coat
                    cells (OTA-1568), its own colour, and — as with the coats —
                    added HERE and never to `label`. */}
                {`\u200a${baseGlyph.ch}\u200a`}
              </Text>
            </>
          ) : null}
          {/* \u26a0 OTA-1638 \u2014 the discovery star, all the way to the right, after the
              base glyph. Owner: "put the discovery star all the way to the right."
              Plain text in the button's own colour: it is a verdict, not a type. */}
          {star ? <Text>{' ★'}</Text> : null}
        </Text>
      ) : (
        <Text style={textStyle}>{label.toUpperCase()}</Text>
      )}
    </TouchableOpacity>
  );
}

/** ⚠ OTA-1369 — the four compass glyphs, declared once. `→` is deliberately the
 *  EAST arrow AND the destination marker below; `destination` is now an explicit
 *  prop rather than a string sniff, so an east-facing room chip can never be
 *  mistaken for a travel destination and pick up its styling. */
const DIR_ARROW: Record<'north' | 'south' | 'east' | 'west', string> = {
  north: '↑', south: '↓', east: '→', west: '←',
};

/** ⚠⚠ OTA-1454 — `wayOut` MARKS THE ONE BUTTON ON THIS ROW THAT IS NOT A ROOM.
 *
 *  An outside UX review, and the owner separately, landed on the same thing:
 *  *"relocate EXIT out of the directional grid so players don't confuse it with
 *  adjacent room doors"* / *"the exit doesn't feel right where it is, it should
 *  be easily noticeable."* EXIT sits in the travel row wearing the identical
 *  chip as `↑ FIRST LANDING` and `→ ARSENAL`, so it reads as one more door among
 *  the doors — except this one leaves the building entirely.
 *
 *  ⚠ IT IS MARKED, NOT MOVED. Relocating it to a different row would put the way
 *  out somewhere the player is not looking when they want to leave, and would
 *  break the "every room is one tap away on this same row" property OTA-1430
 *  relies on so nobody can be stranded. It keeps its place and stops looking
 *  like its neighbours: the 🚪 the map already uses for the same rooms
 *  (OTA-1451), plus its own border so the row reads as "doors… and the way
 *  out." One glyph, two surfaces, same meaning. */
function TravelBtn({ label, onPress, blocked, spent, active, destination, wayOut, a11yLabel, testID }: {
  label: string; onPress: () => void; blocked?: boolean; active?: boolean;
  /** ⚠⚠⚠ OTA-1458 — EMPTY LEGS, SHOWN BEFORE THE TAP RATHER THAN AFTER.
   *  Owner's device log: fifteen-plus refused travel taps in one session, twice
   *  on the EXIT button, each one reading "You have no stamina left" AFTER the
   *  fact — and each one charging 15 minutes of game clock for a move that never
   *  happened. He tapped WEST, was refused, tapped WEST again, then rested. The
   *  button looked identical whether it would work or not, so the only way to
   *  discover the answer was to spend time finding out.
   *
   *  ⚠ CLIMB has shown exactly this state since OTA-628 ("red now covers EVERY
   *  blocked case… the playtest where CLIMB was tapped repeatedly on 0 stamina").
   *  The pattern was already here; the travel row never adopted it. */
  spent?: boolean;
  destination?: boolean; wayOut?: boolean; a11yLabel?: string;
  /** ⚠⚠ OTA-1454 — A STABLE HANDLE THAT IS NOT THE COPY. ota1271 found this
   *  button by matching /^exit$/i against its label, so adding a door glyph and
   *  a descriptive screen-reader label broke a test whose CLAIM ("the way out
   *  appears here and not there") had not changed at all. Visible words are
   *  copy and will keep moving; what a control IS should not be read off them. */
  testID?: string;
}) {
  const isDestination = destination ?? label.startsWith('→');
  // arb108/arb109 — during the outpost tutorial lockdown, travel/room buttons
  // buzz (double-pulse) + drop an Arbiter nudge instead of moving, so the
  // player can't wander off-script and gets clear "wrong" feedback.
  const handlePress = () => {
    logUiTap(label); // OTA-1172 — before any handler; see the note in QuickBtn.
    if (blocked) { buzzWrong(); useGameStore.getState().nudgeTutorialBlocked(); return; }
    // ⚠⚠ OTA-1458 — a spent tap SAYS SO AND COSTS NOTHING. It does not reach the
    // store's travel path, so it never spends the 15-minute anti-stuck tick
    // (OTA-163) that a genuine refused move still charges. Refusing a move the
    // player was never shown they could not make, and billing them for it, is the
    // part that turned one mistake into thirty wasted minutes in his log.
    if (spent) {
      buzzSpent();
      useGameStore.getState().appendLog(
        'world',
        "Your legs are done — you can't travel until you rest. Tap REST (8h) and the road will still be there.",
      );
      return;
    }
    onPress();
  };
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.travelBtn, isDestination && styles.travelBtnDest, wayOut && styles.travelBtnWayOut, (blocked || spent) && styles.travelBtnBlocked, active && styles.travelBtnActive]}
      onPress={handlePress}
      activeOpacity={blocked ? 1 : 0.7}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? `${isDestination ? 'Travel to ' : ''}${label.replace(/^→\s*/, '')}${active ? ', current course' : ''}`}
      accessibilityState={{ disabled: !!blocked, selected: !!active }}
    >
      <Text
        style={[styles.travelBtnText, isDestination && styles.travelBtnTextDest, wayOut && styles.travelBtnWayOutText, active && styles.travelBtnTextActive]}
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
  // ⚠ OTA-1454 — the way OUT, distinct from the doors beside it. Cooler and
  // dimmer than the room chips' warm gold: leaving is not the same kind of act as
  // stepping next door, and on this row it was the only one that looked like it.
  travelBtnWayOut: { borderColor: '#7a8c9b', backgroundColor: '#161b1f' },
  travelBtnWayOutText: { color: '#a8bcc9' },
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
  // ⚠⚠⚠ OTA-1454 — FILL vs OUTLINE INSIDE ONE HUE, WHICH IS BETTER THAN WHAT I
  // FIRST BUILT. My first cut gave strikes a NEW colour — a bone border in the
  // parchment family — reasoning that amber already meant out-of-reach and red
  // already meant unavailable, so a fresh hue would read as a warning. True, and
  // it solved the wrong half: it separated the groups by inventing a meaning
  // instead of ranking the one already there.
  //
  // The reviewer's answer is the standard one and it is correct for a restricted
  // palette: KEEP THE HUE, SEPARATE BY WEIGHT. Green goes on meaning "available".
  // A SOLID green block with soot lettering is a decisive, turn-ending commitment;
  // the same green as a thin border on near-black is the ready pool's modifiers
  // and setup tools. One axis, one job, and no sixth colour in a game built out
  // of parchment and soot.
  //
  // ⚠ OPAQUE, NOT TRANSPARENT — the constraint the reviewer could not know. The
  // "ghost" variant is spelled as a transparent dark background everywhere it is
  // taught, and arb86 is this project's record of what that costs here: chips
  // once used a ~6% alpha fill, and once the BACKGROUND BECAME PLAYER-TUNABLE a
  // bright hue flooded straight through them ("weird coloring"). So the ghost
  // reads unfilled and is a solid near-black; the effect is the same and it
  // survives any background the player picks.
  quickStrike: { borderColor: '#9ec96a', backgroundColor: '#9ec96a' },
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
  // ⚠ THE GHOST HALF of the pair above: same green, worn as a border on a solid
  // near-black. Unchanged by OTA-1454 — the utilities were never the problem, the
  // strikes were, and moving both would only have relocated the collision.
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
  // Soot on the solid block — the dark-on-light inversion is what makes it read
  // as FILLED at a glance rather than as another outlined chip.
  // ⚠⚠⚠ OTA-1568 — THE BLACK HALO, and it is a SHADOW rather than a border on
  // purpose: React Native cannot stroke glyph outlines, but a text shadow is
  // drawn from the glyph's own alpha mask, which is the only technique that
  // reaches a COLOUR EMOJI. That is what makes `❄` — permanently its own blue,
  // deaf to `color:` — legible against quickStrike's light sage `#9ec96a`.
  // Offset 0 with a radius makes it a halo on every side rather than a drop
  // shadow on two. On the near-black chips it is invisible and harmless, which
  // is correct: there the bright glyph already carries itself.
  // ⚠⚠⚠ OTA-1569 — THE GLYPH BRINGS ITS OWN BACKGROUND, and that is the fix
  // OTA-1568 should have been. He looked at the acid alembic on a strike chip:
  // *"it's blended into the active button color."* He is right, and the cause is
  // that I chose `#b4e619` — an acid green-yellow — for a glyph that sits on
  // `quickStrike`'s sage green `#9ec96a`. Same hue family. My error.
  //
  // ⚠⚠⚠ BUT SWAPPING THE HUE WOULD ONLY MOVE THE COLLISION, because the real
  // problem is structural: a chip has TWO fills that are nearly opposite —
  // light sage when it is a strike, near-black (`#1b2417`, `#1a1714`) otherwise
  // — and I was hunting for six hues that read on both at once. There is no such
  // set. Every colour bright enough for the black chip is at risk on the sage
  // one, and every colour dark enough for the sage chip dies on the black.
  //
  // ⚠⚠ SO THE GLYPH STOPS CARING WHAT IS BEHIND IT. An inline `backgroundColor`
  // gives it a dark cell of its own, which means all six colours are now chosen
  // against ONE known backdrop instead of two hostile ones — permanently, for
  // any colour added later. On the dark chips the cell matches the fill and is
  // invisible, which is correct: nothing there needed fixing.
  //
  // ⚠ The halo stays. On the sage chip it now softens the cell's hard edge; on
  // the dark chips it is what it always was — invisible and harmless.
  coatGlyph: {
    backgroundColor: '#0d0b09',
    textShadowColor: '#000000',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  quickStrikeText: { color: '#15180f', fontWeight: '700' },
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
  // OTA-1442 — the bright half of the tutorial pulse. Sits exactly on the
  // wrap's own 1px border (offset -1 reaches back over it) and fades in/out
  // on the native driver; only its opacity ever animates.
  inputPulseOverlay: {
    position: 'absolute',
    top: -1, left: -1, right: -1, bottom: -1,
    borderWidth: 1,
    borderRadius: 4,
    borderColor: '#ffe28a',
  },
  input: {
    color: '#e6d8b3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    // OTA-1555 — one line is unchanged from before; a longer sentence wraps to
    // three before the field scrolls internally. Same ceiling as the floating
    // bar, so the two behave identically on the same text.
    minHeight: 38,
    maxHeight: 96,
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
