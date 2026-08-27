import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { canonicalItemTags } from '../engine/crafting';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Pressable, Keyboard, Vibration } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGameStore, makeRoomKey, chipDismissTileKey, logUiTap } from '../state/gameStore';
// ⚠ OTA-1404 — combat resolution moved out of gameStore into its own leaf.
import { enemyBandOf, enemyIsAirborne, enemyThreatAt, playerWeaponReach } from '../state/combatResolution';
// OTA-1480 — "am I really at the place my record names", once, for all four readers.
import { stationedAtNamedLocation } from '../engine/standingAt';
import { readFullLog, flushLogWrites, clearActiveSlotLog, getLastLogWriteError, clearLastLogWriteError, stampBreadcrumbPhase } from '../engine/saveSystem';
import { StatsPanel } from '../components/StatsPanel';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { useHintsDisabled } from '../components/useFirstTimeHint'; // OTA-1524 — the primer honours the tips switch
import { AdventureFeed } from '../components/AdventureFeed';
import { InputBox } from '../components/InputBox';
import { DiceRoller } from '../components/DiceRoller';
import { EnemyPanel, type EnemyView } from '../components/EnemyPanel';
import { playerPowerScore, enemyPowerScore } from '../engine/powerRating';
import { CrestPlaceholder } from '../components/CrestPlaceholder';
import { MiniMap } from '../components/MiniMap';
import { SearchModal } from '../components/SearchModal';
// ⚠⚠ OTA-1266 — THE SALVAGEMODAL IMPORT IS GONE, AND THE COMMENT THAT STOOD HERE
// WAS MINE AND HAD GONE FALSE. It read: *"its `isSalvageable` predicate is still
// the source of truth for the action-button count, so the module stays."* That
// stopped being true at OTA-1263, when I deleted the `salvageableCount` predicate
// that was its only caller and left the import behind — so a retired file was
// being kept alive by a claim about a consumer that no longer existed.
// ⚠ `app/components/SalvageModal.tsx` now has ZERO importers in app/, __tests__/
// or scripts/. It is left on disk rather than deleted while the picker trial's
// merge-or-revert is the owner's open call; git makes the deletion a one-liner
// once that is decided.
import { BrandedModal } from '../components/BrandedModal';
import { GatherModal } from '../components/GatherModal'; // OTA-1233 — one picker, both verbs
import { CombatPrimerModal } from '../components/CombatPrimerModal'; // OTA-1321 — the first fight explains itself

/** ⚠ OTA-1263 — the beat between INVESTIGATE ALL's results. The owner asked for
 *  "maybe 2+3 seconds"; 2.2s was the low end of that, because the sweep can be six
 *  nouns long and the whole point is that it stays readable, not that it stalls.
 *
 *  ⚠⚠ OTA-1512 — A SECOND OFF, ON THE OWNER'S WORD AFTER LIVING WITH IT:
 *  *"remove 1 second from in between investigations."* 2.2s → 1.2s. He set the
 *  original figure sight-unseen and has now read hundreds of sweeps at it; the
 *  readable floor is what he says it is, not what the first guess said. The
 *  gate below moved with it — a range pinned to a superseded instruction is a
 *  test asserting the past. */
const INVESTIGATE_ALL_GAP_MS = 1_200;
// OTA-1251 — the ★ takes AND wears; both read from the same catalog lookups.
import { isUpgradeOverEquipped, upgradeEquipSlot } from '../engine/gatherSort';
// ⚠ OTA-1457 — the feed's trailing action chip. Leaf module: it imports no
// screen and no store, so its rule can be tested without a renderer.
import {
  pickFeedActionChip, feedActionChipLabel, feedActionChipA11yLabel,
  feedPackChipLabel, feedPackChipA11yLabel,
} from '../engine/feedActionChip';
import { ClimbModal } from '../components/ClimbModal';
import { TorchProbeModal } from '../components/TorchProbeModal';
import { HookContinueModal } from '../components/HookContinueModal';
import { WhisperCompleteModal } from '../components/WhisperCompleteModal';
// OTA-180 — FeedbackModal import dropped along with the 📝 button.
// The component file stays on disk for potential re-introduction.
// ⚠ OTA-1266 — `isSalvageable` dropped from this import too: it was the OTHER
// dead salvage predicate in this file, unused since the pickers merged. Two
// competing "is this salvageable?" answers lived here; the picker's own
// `classifyGatherNoun` / `laneForKind` is the surviving one.
import { isClimbable } from '../engine/interactionTags';
import { climbBlockReason } from '../engine/climbReadiness';
import { isNounConsumed, isNounFlavorExhausted } from '../engine/ambientNounMatch';
import { getLocationById } from '../engine/encounter';
import { revealedLocationName } from '../engine/hiddenLocations';
import { questionMarkerNumbers } from '../engine/questionMarkers';
import { climbHeightFor, isClimbCleared, reachableWhileElevated } from '../engine/climbHeight';
import { findCatalogItem, itemIsShield } from '../engine/crafting'; // itemIsShield: OTA-1523 shield hint
import { isOversized } from '../engine/portability';
import { playerHasScannerEquipped } from '../engine/equipment';
import { searchRequirementFor, inventoryHasGate } from '../engine/itemEffect';
import { enemyIsAerial } from '../engine/enemyTraits';
import { findGearByName, findMaterialByName, findExplorationItemByName } from '../engine/crafting';
import { ApproachModal } from '../components/ApproachModal';
import { PickpocketSheet } from '../components/PickpocketSheet';
import { MissionBoardModal } from '../components/MissionBoardModal';
import { FusionPickerModal } from '../components/FusionPickerModal';
import { FusionBlockedModal } from '../components/FusionBlockedModal';
import { MissionCompleteModal } from '../components/MissionCompleteModal';
import { ParleySheet } from '../components/ParleySheet';
import { PayoffSheet } from '../components/PayoffSheet';
import { TalkSheet } from '../components/TalkSheet';
import { GiftModal } from '../components/GiftModal';
import { hasTopicsFor } from '../engine/dialogue';
// OTA-1064 — the SAME identity function the store and the ledger use. See the
// TALK chip below for what asking in the wrong namespace cost.
import { npcLedgerId } from '../engine/npcMemory';
import { availableFactionQuests } from '../engine/factionQuests';
import { getStanding } from '../engine/factions';
import { profileOf } from '../engine/pressure';
import { TutorialTarget } from '../components/TutorialTarget';
import { TUTORIAL_STEPS, TUT_LOCK_BEATS } from '../components/tutorialSteps';
import { reachBandsFor, RANGE_LABELS } from '../engine/types';
import type { CombatRange } from '../engine/types';
import { CONTENT_MAX_WIDTH } from '../ui/displayScale'; // OTA-1227 — one column width, platform-aware
import { useBackAction } from '../ui/desktopBack'; // OTA-1229 — right-click / Escape closes the top popup
// ⚠⚠ OTA-1236 — the ONE rule for "this noun carries a next step", shared with the
// engine's rescue dispatch and the bulk-salvage guard. See engine/storyNouns.ts.
import { isLeadNoun, orderByStoryTier } from '../engine/storyNouns';

function describeTime(hours: number): string {
  const day = Math.floor(hours / 24) + 1;
  const hourOfDay = Math.floor(hours % 24);
  let part: string;
  if (hourOfDay < 6) part = 'night';
  else if (hourOfDay < 12) part = 'morning';
  else if (hourOfDay < 18) part = 'afternoon';
  else part = 'evening';
  return `Day ${day} · ${part}`;
}

/** arb95 — danger readout for the scene-bar location line. Surfaces the
 *  location's danger tier (1-5) so the player can read at a glance how
 *  lethal the ground is — capitals (5) vs frontier outposts (2). */
function dangerLabel(danger: number): string {
  const d = Math.max(1, Math.min(5, Math.round(danger || 1)));
  const tier = d <= 1 ? 'Calm' : d === 2 ? 'Uneasy' : d === 3 ? 'Dangerous' : d === 4 ? 'Deadly' : 'Lethal';
  return `Danger ${d} (${tier})`;
}

/** Subtle background tint per time-of-day. Always darker than the base
 *  charcoal so text stays legible; nightly is the bluest, morning the
 *  warmest, evening the dustiest. */
function timeOfDayTint(hours: number): string {
  const hourOfDay = Math.floor(hours % 24);
  if (hourOfDay < 6) return '#080a10';   // night — cool, deep blue
  if (hourOfDay < 12) return '#0f0d0a';  // morning — warm amber undertone
  if (hourOfDay < 18) return '#0a0908';  // afternoon — neutral (the default)
  return '#0e0b08';                       // evening — dusty rust
}

// ⚠ OTA-1497 — how long a sheet's native dismissal gets before a deferred
// submit runs. The RN <Modal> fade is ~300ms on iOS; 400 clears it with margin
// without reading as lag (the tap still lands its feed line right after).
const SHEET_SETTLE_MS = 400;

export function ExplorationScreen() {
  const player = useGameStore((s) => s.player);
  const gameLog = useGameStore((s) => s.gameLog);
  // ⚠ OTA-1356 — the dying breath's RENDER checkpoint. Runs after every React
  // commit of this screen (no dep array, throttled inside the stamp), so a
  // freeze crumb that reached `engine-done` but never `rendered` indicts the
  // render side — the exact question the 2026-08-17 receipt could not answer.
  useEffect(() => { stampBreadcrumbPhase('rendered'); });
  const partialArbiterText = useGameStore((s) => s.partialArbiterText);
  const isGenerating = useGameStore((s) => s.isGenerating);
  const submit = useGameStore((s) => s.submitPlayerAction);
  // ⚠⚠ OTA-1497 — A SHEET FINISHES CLOSING BEFORE ITS ACTION CAN RAISE A POPUP.
  //
  // THE FOUR iPHONE FREEZES (sentry-inbox/player-log_2026-08-25T02-07-26): the
  // player tapped a marked lead ("bench") inside the take/salvage sheet. The
  // sheet's handler did `setTakeOpen(false); submit('investigate bench')` in one
  // tick — the sheet's native <Modal> began its ~300ms dismissal while the
  // submit synchronously set pendingHookContinue, flipping HookContinueModal
  // visible in the SAME render pass. On iOS, presenting one modal while another
  // is mid-dismissal wedges the window: the log shows the ★ STORY THREAD line
  // landing and then fifty seconds of appstate churn without one ui: tap —
  // JS alive, screen dead, force-close. Twice in a row, same three log lines.
  //
  // ⚠ THE FIX IS WHEN, NOT WHAT: any submit that leaves a closing sheet waits
  // out the dismissal before it runs, so a popup it raises presents against a
  // settled window. Feed-chip and typed submits are untouched — no sheet is
  // closing under those. Modals raised over a sheet that STAYS open are fine
  // (present-over-presented works); it is present-during-dismiss that wedges.
  const submitAfterSheetSettles = (text: string, after?: () => void): void => {
    setTimeout(() => { submit(text); after?.(); }, SHEET_SETTLE_MS);
  };
  const setInputModalOpen = useGameStore((s) => s.setInputModalOpen);
  const setScreen = useGameStore((s) => s.setScreen);
  // OTA-1059 — the Phase 2 talk exchange, reachable by tap rather than only by typing.
  const talkToNpc = useGameStore((s) => s.talkToNpc);
  const currentScene = useGameStore((s) => s.currentScene);
  // OTA-507 — drives the hidden-location "?" so the travel row doesn't leak the
  // real name before arrival/discovery.
  const discoveredIds = useGameStore((s) => s.worldMemory?.discoveredLocationIds);
  // OTA-508 — the Hidden Market offers the Fuse Cauldron at every stall.
  const activeBuildingId = useGameStore((s) => s.activeBuildingId);
  const activeBuildingRoomId = useGameStore((s) => s.activeBuildingRoomId);
  // arb-fix — equipped-faction-catalyst fusion confirmation prompt.
  const fusionCatalystPrompt = useGameStore((s) => s.fusionCatalystPrompt);
  const craftSubstitutionPrompt = useGameStore((s) => s.craftSubstitutionPrompt);
  // arb-fix — race-ability picker (activatable once/day race powers).
  const raceAbilityPickerOpen = useGameStore((s) => s.raceAbilityPickerOpen);
  // Tungsten Spire — current tutorial beat id (null when no tutorial). The
  // TAKE / SALVAGE / INVESTIGATE beats inject their demo prop into the
  // matching modal + light its chip so the player opens the REAL picker and
  // learns the interaction (instead of the chip direct-submitting). Picking
  // the prop submits the verb, which the tutorial intercept advances on.
  const tutorialStep = useGameStore((s) => s.tutorialStep);
  const tutBeat = tutorialStep !== null ? (TUTORIAL_STEPS[tutorialStep]?.id ?? null) : null;
  // Door-open branch popup (explore_or_leave beat).
  const tutorialExploreChosen = useGameStore((s) => s.tutorialExploreChosen);
  const chooseTutorialExplore = useGameStore((s) => s.chooseTutorialExplore);
  // arb108 — outpost tutorial lockdown (mirrors InputBox): MAP + other
  // out-of-band controls buzz until the player makes the stay/leave choice.
  // ⚠ OTA-1249 — reads the SAME exported list InputBox does. This was an
  // identical literal array in both files, and 'look' was missing from both.
  const tutLock =
    tutBeat !== null
    && TUT_LOCK_BEATS.includes(tutBeat)
    && !tutorialExploreChosen;
  const chooseTutorialLeave = useGameStore((s) => s.chooseTutorialLeave);
  const pendingRolls = useGameStore((s) => s.pendingRolls);
  // OTA-1076 — the talk/parley sheets share the DiceRoller's controls slot;
  // these drive which occupant renders. Rolls win: a parley choice that starts
  // a roll hands the slot straight to the dice.
  const pendingTalk = useGameStore((s) => s.pendingTalk);
  const pendingParley = useGameStore((s) => s.pendingParley);
  // OTA-1081 — the shakedown outranks every other sheet: your wrist is in
  // their grip, and the store refuses all actions until you pay or fight.
  const pendingPayoff = useGameStore((s) => s.pendingPayoff);
  // OTA-1081 — escort leaders walking with you are pickpocket marks too.
  // Select the stable quests reference; derive the names in a memo so the
  // selector never mints a fresh array (which would re-render on every tick).
  const activeQuestsForMarks = useGameStore((s) => s.player?.activeFactionQuests);
  const escortLeaderMarks = React.useMemo(
    () => (activeQuestsForMarks ?? [])
      .filter((q) => q.tracked !== false && !!q.escort?.leaderName && (q.escort?.hp ?? 0) > 0)
      .map((q) => q.escort!.leaderName!),
    [activeQuestsForMarks],
  );
  // OTA-1079 — the TALK glow. Subscribing to talkedTopics is what keeps the
  // light honest: it goes out the moment the last unread line is heard, and
  // comes back when a warmth/story gate opens a new topic on this vendor.
  const talkedTopics = useGameStore((s) => s.worldMemory.talkedTopics);
  const glowVendorName = useGameStore((s) => s.currentScene?.vendor?.name);
  const vendorTalkGlow = React.useMemo(
    () => (glowVendorName ? useGameStore.getState().hasUnspokenTalk(glowVendorName) : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- talkedTopics is the invalidation signal
    [glowVendorName, talkedTopics],
  );
  // OTA-841 [did-you-mean] — runnable command suggestions from the last low-confidence
  // parse, rendered as a tappable chip row above the input.
  const parseSuggestions = useGameStore((s) => s.parseSuggestions);
  const pendingHookContinue = useGameStore((s) => s.pendingHookContinue);
  const pendingWhisperComplete = useGameStore((s) => s.pendingWhisperComplete);
  const dismissWhisperComplete = useGameStore((s) => s.dismissWhisperComplete);
  const continueHook = useGameStore((s) => s.continueHook);
  const abandonHook = useGameStore((s) => s.abandonHook);
  const dismissHookContinue = useGameStore((s) => s.dismissHookContinue);
  const pendingTravelConfirm = useGameStore((s) => s.pendingTravelConfirm);
  const confirmLeaveAndTravel = useGameStore((s) => s.confirmLeaveAndTravel);
  const cancelTravelConfirm = useGameStore((s) => s.cancelTravelConfirm);
  const pendingMissionOffer = useGameStore((s) => s.pendingMissionOffer);
  const acceptMissionOffer = useGameStore((s) => s.acceptMissionOffer);
  const declineMissionOffer = useGameStore((s) => s.declineMissionOffer);
  const resolveRollStep = useGameStore((s) => s.resolveRollStep);
  const cancelPendingRolls = useGameStore((s) => s.cancelPendingRolls);
  const saveAndExitToTitle = useGameStore((s) => s.saveAndExitToTitle);
  const setActiveEnemyIdx = useGameStore((s) => s.setActiveEnemyIdx);

  // Measured height of the left stats panel — the enemy panel caps to this so a
  // tall enemy card scrolls within the top-right corner instead of growing the row.
  const [statsColH, setStatsColH] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  // OTA-1483 — true while the paced INVESTIGATE ALL sweep (OTA-1263) is live;
  // unlights the INVESTIGATE chip so it stops inviting a tap that would talk
  // over its own stream. Cleared on every sweep exit (see endSweep).
  const [investigateSweepRunning, setInvestigateSweepRunning] = useState(false);
  const [approachOpen, setApproachOpen] = useState(false);
  // OTA-847 (STEALTH SYSTEM) — PICKPOCKET picker (replaces the peaceful APPROACH).
  const [pickpocketOpen, setPickpocketOpen] = useState(false);
  // OTA-239 — Ask the Arbiter modal. Opens via the new ASK ARBITER
  // quick-row button; submits `ask the arbiter about <input>` so
  // OTA-233's parser fallback fires the MiniLM lore lookup.
  const [askArbiterOpen, setAskArbiterOpen] = useState(false);
  const [askArbiterInput, setAskArbiterInput] = useState('');
  const [salvageOpen, setSalvageOpen] = useState(false);
  // arb135 — Mission Board as a tappable screen (open postings + ACCEPT), not a text dump.
  const [missionBoardOpen, setMissionBoardOpen] = useState(false);
  // arb152 — once every posting on this board has been accepted (or completed),
  // there's nothing left to take, so the chip should come off the screen. Mirror
  // the modal's filter (availableFactionQuests already drops active/completed).
  const missionBoardHasPostings = useMemo(() => {
    const board = currentScene?.missionBoard;
    if (!board || !player) return false;
    // ⚠ OTA-1475 — `faction: null` is the Hidden Market's neutral post: every
    // faction's pool, side by side. Same question ("is there anything to take"),
    // asked of nine pools instead of one.
    if (board.faction === null) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { neutralBoardPostings } = require('../engine/factionQuests') as typeof import('../engine/factionQuests');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { FACTIONS } = require('../engine/factions') as typeof import('../engine/factions');
      return neutralBoardPostings(
        FACTIONS,
        (fid) => getStanding(player.factionStanding ?? [], fid),
        player.activeFactionQuestIds ?? [],
        player.completedFactionQuestIds ?? [],
      ).length > 0;
    }
    return availableFactionQuests(
      board.faction,
      getStanding(player.factionStanding ?? [], board.faction),
      player.activeFactionQuestIds ?? [],
      player.completedFactionQuestIds ?? [],
    ).length > 0;
  }, [currentScene?.missionBoard, player]);
  // arb152 — a dismiss (✕) for the Fusing Crucible chip, and OTA-1029 the same for
  // the vendor chip. arb-fix — the dismiss lives in the STORE, NOT local useState:
  // entering a vendor UNMOUNTS this screen (App.tsx renders exploration vs vendor by
  // a flag), so a local flag was lost on the round-trip and the chip popped back on
  // return.
  // OTA-1029 — the scope is the macro TILE, not the room (reversing arb154's
  // room-keyed shape). Owner: "the crucible once dismissed can stay dismissed until
  // we leave the capital tile and come back" — a capital is a dozen rooms on ONE
  // tile, so a room-keyed dismiss re-showed the chip on every interior hop. Leaving
  // the tile clears the key in beginScene, so a return visit shows it again.
  const chipViewKey = chipDismissTileKey(player);
  const crucibleDismissedKey = useGameStore((s) => s.crucibleChipDismissedKey);
  const setCrucibleChipDismissedKey = useGameStore((s) => s.setCrucibleChipDismissedKey);
  const crucibleDismissed = !!crucibleDismissedKey && crucibleDismissedKey === chipViewKey;
  const vendorDismissedKey = useGameStore((s) => s.vendorChipDismissedKey);
  const setVendorChipDismissedKey = useGameStore((s) => s.setVendorChipDismissedKey);
  const vendorChipDismissed = !!vendorDismissedKey && vendorDismissedKey === chipViewKey;
  const [takeOpen, setTakeOpen] = useState(false);
  // ⚠⚠ OTA-1238 — THE ONE THING THAT CLOSES IT WITHOUT THE PLAYER ASKING.
  //
  // Now that the picker survives a selection (owner: *"the top hat should stay
  // open ... until you hit the ignore button"*), it can outlive the room being
  // safe. `salvage <noun>` routes through the investigate verb, which carries a
  // 6% ambush roll, and a lead tap spawns a rescue captor outright. A loot list
  // floating over a fight is not a choice the player made — every action behind
  // it would be refused with "Not while X is on you", which is the "button did
  // nothing" complaint wearing a different hat.
  //
  // ⚠ It closes on the ARRIVAL of an enemy, not on their presence: the picker is
  // never openable mid-fight in the first place, so this fires exactly once, on
  // the transition, and cannot fight the player for control of the screen.
  const liveEnemyCount = currentScene?.enemies?.length ?? 0;
  useEffect(() => {
    if (takeOpen && liveEnemyCount > 0) setTakeOpen(false);
  }, [takeOpen, liveEnemyCount]);
  // ⚠⚠ OTA-1321 — THE FIRST FIGHT EXPLAINS ITSELF, ONCE. Owner: *"let's add a first
  // time pop-up for the first fight explaining briefly, how to heal, what Dodge and
  // stealth do, and where to go to change armor and weapons and the approach button."*
  //
  // ⚠ ONE DERIVED CONDITION, NOT A LATCH AT EACH SPAWN SITE. An enemy enters a scene
  // from at least three places — the wilderness roll, the OTA-1032 indoor rest-ambush,
  // and the OTA-089 climb-top overlay — and hanging a "first fight" flag on each is how
  // the third one gets forgotten. The screen asks the question instead: is something
  // live in front of me, and has this character been told? So it fires on whichever
  // fight is genuinely first, including an ambush the player never chose to start.
  //
  // ⚠ `enemiesDefeated === 0` KEEPS IT OFF A VETERAN'S SCREEN. The milestone is new, so
  // every existing save reads `firstCombatPrimerShown: undefined` — without this second
  // clause a character 200 kills deep would be handed a card headed YOUR FIRST FIGHT on
  // their next encounter. A veteran who genuinely has no kills yet still gets it.
  const markCombatPrimerSeen = useGameStore((s) => s.markCombatPrimerSeen);
  const combatPrimerSeen = useGameStore((s) => !!s.player?.milestones?.firstCombatPrimerShown);
  const enemiesDefeatedEver = useGameStore((s) => s.player?.milestones?.enemiesDefeated ?? 0);
  // ⚠⚠⚠ OTA-1524 — AND IT HONOURS THE GLOBAL TIPS SWITCH, WHICH IT NEVER DID.
  // `setHintsDisabled` has gated every FirstTimeHint since OTA-860, and this
  // modal ignored it outright: a player who turned tips off still met this card
  // on their first fight with no way to refuse it. An opt-out that some cards
  // ignore is not an opt-out. `useHintsDisabled` is the reactive read, so
  // flipping the Settings toggle or tapping "turn off tips" inside any card
  // takes effect here live.
  const hintsOff = useHintsDisabled();
  const combatPrimerOpen = liveEnemyCount > 0 && !combatPrimerSeen && enemiesDefeatedEver === 0 && !hintsOff;
  // OTA 031 — climb-target picker. Opens to a chip list of every
  // climbable noun in the current scene; tapping one fires `climb
  // <noun>` which resolves one tier in the climb handler.
  const [climbOpen, setClimbOpen] = useState(false);
  // OTA-776 — the "aim the torch" lead chooser (opens when a room holds more
  // than one open lead so the player picks which one to reveal + take over).
  const [torchChooserOpen, setTorchChooserOpen] = useState(false);
  // Tell the floating KeyboardInputBar to stand down whenever a popup
  // that owns its own (keyboard-avoided) text field is open, so the bar
  // can't mount behind the modal and steal focus from the visible field.
  // Reset to false on unmount so it never sticks across screens.
  //
  // arb71 (iOS tutorial fix) — the floating bar AUTOFOCUSES to hold the
  // keyboard above it. On iOS that focused input then (a) keeps the keyboard
  // ON TOP of the chip-picker modals (Climb/Take) and (b) BLOCKS native
  // <Modal>s — the explore_or_leave DOOR popup is a native <Modal> and would
  // never present while a text input is focused, so the tutorial stalled with
  // no popup even though the beat fired. The original list only covered the
  // text-field popups. Widen it to EVERY popup that should own the screen —
  // the climb/take pickers and the door beat included — and hard-dismiss the
  // keyboard when one opens, so the floating bar unmounts (releasing focus)
  // and the modal presents cleanly.
  const doorBeatOpen = tutBeat === 'explore_or_leave' && !tutorialExploreChosen;
  useEffect(() => {
    const anyPopupOpen =
      searchOpen || approachOpen || askArbiterOpen || salvageOpen
      || climbOpen || takeOpen || doorBeatOpen || combatPrimerOpen;
    setInputModalOpen(anyPopupOpen);
    // iOS: a native <Modal> won't present over a live keyboard / focused
    // input, and the floating bar's autoFocus keeps re-grabbing it — so
    // explicitly drop the keyboard the moment any popup/beat opens.
    if (anyPopupOpen) Keyboard.dismiss();
  }, [searchOpen, approachOpen, askArbiterOpen, salvageOpen, climbOpen, takeOpen, doorBeatOpen, combatPrimerOpen, setInputModalOpen]);
  useEffect(() => () => setInputModalOpen(false), [setInputModalOpen]);
  // ⚠⚠ OTA-1229 — RIGHT-CLICK / ESCAPE CLOSES THE POPUP ON TOP. Owner, on the
  // PC build: *"right click on the mouse should be the back button."* On a
  // phone each of these <Modal>s already answers Android's hardware back
  // through `onRequestClose`; a PC has no such button, so every picker had
  // exactly one exit — finding and hitting its small CANCEL.
  //
  // ⚠ THE DOOR BEAT IS DELIBERATELY ABSENT from this list. It is a TUTORIAL
  // GATE, not a convenience popup — the run cannot continue until the player
  // chooses, so a back action that dismissed it would strand them on a screen
  // with nothing to press. Everything here is a picker the player opened and
  // may simply not want.
  //
  // Registered AFTER the AppShell handler, so it is consulted BEFORE it: with a
  // picker open the click closes the picker, and only once nothing is open does
  // the click fall through to "leave this sub-screen".
  useBackAction(true, () => {
    // OTA-1321 — the primer sits on top of everything when it is up, so it answers
    // first. Unlike the door beat it is safe to dismiss: closing it IS having seen
    // it, and the fight underneath is fully playable. It must latch the milestone
    // on the way out, though — visibility is derived, so a close that didn't latch
    // would put the card straight back up on the next render.
    if (combatPrimerOpen) { markCombatPrimerSeen(); return true; }
    if (torchChooserOpen) { setTorchChooserOpen(false); return true; }
    if (takeOpen) { setTakeOpen(false); return true; }
    if (salvageOpen) { setSalvageOpen(false); return true; }
    if (climbOpen) { setClimbOpen(false); return true; }
    if (searchOpen) { setSearchOpen(false); return true; }
    if (approachOpen) { setApproachOpen(false); return true; }
    if (pickpocketOpen) { setPickpocketOpen(false); return true; }
    if (askArbiterOpen) { setAskArbiterOpen(false); return true; }
    if (missionBoardOpen) { setMissionBoardOpen(false); return true; }
    return false;
  });
  // arb72 (iOS door-popup fix) — the leave/stay popup is a native <Modal>, and
  // its `visible` used to flip true the instant the explore_or_leave beat
  // advanced (mid store-driven re-render, with the keyboard still dismissing
  // from the typed "investigate door"). iOS silently refuses to present a
  // <Modal> in that window, so the popup never appeared even though the beat
  // fired (confirmed on Onyx Anvil / OTA-303). Decouple the present: when the
  // door beat opens, dismiss the keyboard, then flip a LOCAL visible flag a
  // beat later so iOS presents over a clean, settled frame. (The Take/Salvage/
  // Climb modals work because the player taps them on an already-clean frame.)
  const [doorModalVisible, setDoorModalVisible] = useState(false);
  useEffect(() => {
    if (!doorBeatOpen) { setDoorModalVisible(false); return; }
    Keyboard.dismiss();
    const t = setTimeout(() => setDoorModalVisible(true), 450);
    return () => clearTimeout(t);
  }, [doorBeatOpen]);
  // OTA-1321 — the combat primer takes the SAME deferred present as the door beat,
  // and for the same reason: it raises itself off a store change (an enemy landing
  // in the scene) rather than off a tap, which is exactly the frame iOS refuses to
  // present a <Modal> over while the floating input bar still holds focus. The
  // Take/Climb pickers get away without this because the player taps them on an
  // already-settled frame; a card that appears when something attacks you does not.
  const [combatPrimerVisible, setCombatPrimerVisible] = useState(false);
  useEffect(() => {
    if (!combatPrimerOpen) { setCombatPrimerVisible(false); return; }
    Keyboard.dismiss();
    const t = setTimeout(() => setCombatPrimerVisible(true), 450);
    return () => clearTimeout(t);
  }, [combatPrimerOpen]);
  // OTA-1029 — the vendor-leave prompt (POLISH-4, 2026-05-25) is GONE. It gated
  // every cardinal move while a vendor stood in the scene — and a capital's room
  // hops ARE cardinal moves, so walking Workshop → Armory asked "leave Tarek
  // behind?" every single time (owner: "it just feels disorganized... we don't
  // need the stay or leave popup when we switch rooms"). Vendors are anchored to
  // their rooms (hub anchorNpc), so walking back in finds them exactly where they
  // were; the chip's ✕ is the deliberate way to wave one off.
  // OTA-180 — feedbackOpen state dropped alongside the 📝 button.
  // OTA 223 — transient "COPIED" flash on the FULL LOG button so
  // the tap-to-copy shortcut gives visible confirmation without a
  // separate screen.
  const [logCopied, setLogCopied] = useState(false);
  // OTA 017 — char count displayed in the flash so the player can
  // verify the clipboard buffer size matches what they expected.
  // If their paste target shows fewer chars, the paste destination
  // (some chat / email apps cap pastes at ~64-128 KB) is at fault,
  // not the copy itself. SHARE bypasses the clipboard entirely for
  // very long logs.
  const [logCharCount, setLogCharCount] = useState(0);
  // OTA 224 — transient "CLEARED" flash on the CLEAR LOG button so
  // the wipe is acknowledged in the same chip-flash pattern as COPIED.
  const [logCleared, setLogCleared] = useState(false);
  // OTA-180 — appendFeedback selector dropped; store action still
  // exists for any non-UI emit site.
  const takeAmbientNoun = useGameStore((s) => s.takeAmbientNoun);
  const worldMemory = useGameStore((s) => s.worldMemory);

  // OTA-930 — the old merged consumedAmbientNouns memo (searched + flavor in ONE set) is gone:
  // the two pools now match differently (searched keeps the historical loose substring rule;
  // flavor-exhausted matches whole WORDS via isNounFlavorExhausted, so an investigated "rack"
  // no longer greys an unrelated "cracked terminal"), so every consumer reads the split sets
  // below and applies the right matcher per pool. [POLISH-3]'s intent is preserved — flavor
  // exhaustion still greys/sorts Search-modal chips — via the flavor half at each call site.

  // 2026-05-25 — split sets for cross-modal removal. The user wants
  // any noun that was PRODUCTIVELY consumed (take / salvage with
  // loot / investigate that yielded an item) to disappear from
  // every modal, including Investigate. Flavor-only investigate
  // results stay visible in Investigate (grayed + sorted right per
  // POLISH-3) because the noun is still investigable for narrative
  // re-color but shouldn't clutter the actionable list.
  const productivelyConsumedSet = useMemo(() => {
    if (!player || !currentScene) return new Set<string>();
    // OTA-164 — use canonical makeRoomKey so hub interiors map to
    // the same key the action handlers write to. Pre-OTA-164 the
    // inline key shape ("locId@mm@x,y") was missing the
    // @${hubRoomId} suffix that makeRoomKey appends for hubs, so
    // every modal in a hub room read from a stale/different room
    // record. Playtest: at Reclaimers' Outpost The Gate, SALVAGE
    // ALL successfully consumed 4 nouns, then 5 more taps each
    // showed those same 4 nouns as fresh chips → re-fired the
    // bulk action → engine emitted "Already worked over: ..." each
    // time because the action's read DID use makeRoomKey and saw
    // the consumed marks the UI couldn't.
    const roomKey = makeRoomKey(
      player.currentLocationId,
      currentScene.microMicroId,
      player.mapX,
      player.mapY,
      player.hubRoomId,
    );
    const room = worldMemory.visitedRooms?.[roomKey];
    // Inline filter — climb-tier markers (climbed:noun:tN) are
    // separate from productive consumption and don't gate other
    // verbs. nonClimbMarkers in gameStore.ts uses the same prefix
    // check.
    return new Set(
      (room?.searchedAmbientNouns ?? [])
        .filter((s) => !s.startsWith('climbed:'))
        .map((n) => n.toLowerCase()),
    );
  }, [
    player?.currentLocationId,
    player?.mapX,
    player?.mapY,
    currentScene?.microMicroId,
    // ⚠⚠ OTA-1451 — hubRoomId IS PART OF THE KEY, SO IT MUST BE PART OF THE DEPS.
    //
    // OTA-164 added it to `makeRoomKey` above and did not add it here, and the
    // hole it left is invisible everywhere except the one place it matters. Out
    // in the world, changing rooms always changes locationId / mapX / mapY /
    // microMicroId, so the memo recomputes and nobody notices. INSIDE AN OUTPOST
    // OR A BUILDING, walking from one room to the next changes NOTHING IN THIS
    // LIST — only hubRoomId moves — so this memo kept serving the PREVIOUS
    // room's consumed nouns until something else happened to touch visitedRooms.
    //
    // Owner: *"sometimes when I go through a room investigate still stays lit
    // and when I tap it again it's empty, and when I leave it it clears then."*
    // That is exactly this, and the "when I leave it it clears" half is the
    // tell — leaving finally moves one of the other deps. Walk into a room you
    // already stripped while carrying a fresh room's set and none of its nouns
    // look consumed, so INVESTIGATE lights; the picker itself resolves the nouns
    // properly and comes up empty. A lit button over an empty menu is OTA-1402's
    // defect in UI form: the game knows and shows the opposite.
    player?.hubRoomId,
    worldMemory.visitedRooms,
  ]);
  // OTA-1211 — a RESOLVED hook's noun must grey like any spent chip. The
  // engine's investigate handler hard-refuses these (step 4.6 — "You already
  // searched the eddy") but nothing writes the noun into searchedAmbientNouns,
  // so the chip stayed bright and tappable forever. The owner filed this from
  // INSIDE the game: "on investigate it should be consumed." Same matcher the
  // engine's refusal uses, so the chip and the engine cannot disagree again.
  const isExhaustedHookNoun = (n: string): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { matchAnyHookNoun } = require('../engine/hooks') as typeof import('../engine/hooks');
    return matchAnyHookNoun(n, currentScene?.hooks ?? [])?.resolved === true;
  };
  // ⚠⚠ OTA-1236 — WHICH NOUNS IN THIS ROOM CARRY A NEXT STEP.
  //
  // Owner: *"I don't like that salvage all can bury the dog quest."* It could, and
  // the overlap is measured, not guessed: TEN of the twenty dog-rescue hook nouns
  // match a salvage pool (chain, wagon, overturned wagon, cellar door, trapdoor,
  // snare pit, snare, trap...). The OTA-1235 yellow SCRAP lane put the chain the
  // dog is on one tap from being pried apart, with a bulk button over it — and
  // salvage writes `searchedAmbientNouns`, which every picker reads, so the rescue
  // noun then LEFT the investigate list entirely.
  //
  // ⚠ THE ELIGIBILITY CHECK IS THE SAME ONE THE ENGINE'S DISPATCH MAKES. Once the
  // player has a dog, a snare is a snare again: protecting it forever would keep
  // scrap out of their hands for a quest that already happened.
  const leadCtx = useMemo(
    () => ({
      hooks: currentScene?.hooks ?? [],
      rescueEligible: !player?.dog && !worldMemory.pendingDogOnboarding,
    }),
    [currentScene?.hooks, player?.dog, worldMemory.pendingDogOnboarding],
  );
  const leadNouns = useMemo(
    () =>
      (currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? [])
        .filter((n) => isLeadNoun(n, leadCtx))
        // ⚠ A SPENT lead is not a lead. A resolved hook still matches the noun
        // list, and pinning it in the un-sweepable lane forever would protect
        // scrap the player is entitled to and keep pointing at a step that is
        // already behind them.
        .filter((n) => !isExhaustedHookNoun(n)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentScene?.displayedAmbientNouns, currentScene?.ambientNouns, leadCtx],
  );
  const flavorExhaustedSet = useMemo(() => {
    if (!player || !currentScene) return new Set<string>();
    // OTA-164 — see productivelyConsumedSet above. Same hub-key bug.
    const roomKey = makeRoomKey(
      player.currentLocationId,
      currentScene.microMicroId,
      player.mapX,
      player.mapY,
      player.hubRoomId,
    );
    const room = worldMemory.visitedRooms?.[roomKey];
    return new Set((room?.flavorExhaustedNouns ?? []).map((n) => n.toLowerCase()));
  }, [
    player?.currentLocationId,
    player?.mapX,
    player?.mapY,
    currentScene?.microMicroId,
    // ⚠⚠ OTA-1451 — the SIBLING DOOR. This memo is a copy of the one above,
    // keyed the same way and missing the same dependency, and fixing only the
    // first would have left half the stale-lit INVESTIGATE standing: the count
    // subtracts flavour-exhausted nouns from this set too. Both, or neither.
    player?.hubRoomId,
    worldMemory.visitedRooms,
  ]);

  const isAmbientConsumed = (noun: string): boolean => {
    // 2026-05-26 OTA-076 — fuzzy match (was exact .has).
    // Mirrors the engine's substring dedup logic so the
    // salvage/take chip-greying matches the engine's accept/
    // refuse decision exactly. Pre-OTA the chip used
    // consumedAmbientNouns.has(lower) which missed variant
    // phrasings ("wooden bench" in memory vs chip "bench") and
    // left the salvage chip eternally green; the player tapped
    // it repeatedly and got "you've already worked over the
    // bench" forever. Now: any chip the engine would refuse
    // via fuzzy match is greyed in the salvage / take modals
    // too. Self-heal logic below stays intact (only treat as
    // consumed if the catalog item is in inventory, otherwise
    // ungrey so the player isn't stuck on a sold/lost item).
    // ⚠⚠ OTA-1231 — THE FLAVOR LIST IS NOT A CONSUMPTION LIST, AND READING IT HERE
    // GREYED CHIPS THE ENGINE WOULD HAVE ACCEPTED. Owner: *"investigate kills
    // salvage sometimes, salvage can kill items in take."* This helper is used for
    // BOTH the take and salvage pickers, and it OR-ed in `flavorExhaustedSet` —
    // so investigating a noun for lore greyed its TAKE chip.
    //
    // ⚠ MEASURED: `takeAmbientNoun` reads ONLY `searchedAmbientNouns`. It has never
    // consulted the flavor list, which means the engine would happily have taken
    // the item — the UI was refusing on its own authority, and the player had no
    // way to tell the difference from a genuinely spent noun. The type declaring
    // `flavorExhaustedNouns` says so outright: *"only the investigate verb consults
    // this list"*, and this was one of three places that broke it.
    //
    // ⚠ The comment below about a lit chip never earning a refusal still holds —
    // it now holds in the honest direction: the chip is lit exactly when the
    // engine would say yes.
    // OTA-930 — searched keeps the loose fuzzy rule.
    if (!isFuzzyConsumed(noun, productivelyConsumedSet)) return false;
    // OTA-958 — taken is taken. The ownership tail un-greyed the chip the moment
    // the item left the pack — but USING it also empties the pack, so the chip
    // re-lit and take -> use -> take farmed forever. Mirrors the engine's
    // once-per-room rule exactly (a lit chip must never earn a refusal).
    return true;
  };


  // 2026-05-26 OTA-070 — substring-fuzzy consumed check. Mirrors
  // the engine's alreadySearched logic at gameStore.ts:4189 so the
  // chip's gray-out state matches the engine's accept/refuse
  // decision exactly. Pre-OTA the chip used exact match
  // (set.has(chipLower)), but the engine uses
  //   n === chipLower || chipLower.includes(n) || n.includes(chipLower)
  // — so if memory held a variant ("wooden bench") and the chip
  // was the bare form ("bench"), the engine refused 'investigate
  // bench' with "Nothing more to find" without writing 'bench' to
  // memory, and the chip stayed green forever. This helper applies
  // the same fuzzy match the engine uses, so any chip the engine
  // would refuse is greyed in the modal and not counted toward the
  // INVESTIGATE tab tone.
  //
  // Empty-string entries in the pool are skipped because
  // "anything".includes('') is trivially true and would mark every
  // chip consumed; this matches the engine's nonClimbMarkers
  // filter which strips empty + climbed: markers before the same
  // .some() check.
  // Phrasing-tolerant consumed check. Extracted to app/engine/ambientNounMatch.ts
  // (isNounConsumed) so it can be unit-tested. It is insensitive to BOTH the
  // possessive apostrophe ("Zharak's Teeth Spire" stored as "zharak teeth spire")
  // AND the connective "of" ("scraps of cloth" stored as "scraps cloth") — either
  // mismatch used to leave the SALVAGE/INVESTIGATE chip green forever, re-tappable
  // for an endless "already examined", because the stored consumed/flavor-exhausted
  // noun never substring-matched the live display noun.
  const isFuzzyConsumed = (chipNoun: string, pool: Set<string>): boolean =>
    isNounConsumed(chipNoun, pool);

  // ⚠⚠ OTA-1246 — THIS BLOCK LIVES *BELOW* `isAmbientConsumed` AND MUST STAY THERE.
  // OTA-1245 hoisted it out of the JSX to give the colour-lane hint the same array
  // the picker renders — correct idea, placed 82 lines too early. A `useMemo`
  // FACTORY RUNS DURING RENDER, so the memo called `isAmbientConsumed` while that
  // const was still in its temporal dead zone. Under Hermes that reads as
  // `undefined`, and the app died on the owner’s device with
  // `undefined is not a function` in ExplorationScreen before a single frame drew.
  // ⚠ Moving a computation earlier moves its DEPENDENCIES earlier too. Any new
  // reader added between here and the JSX has to come after this, not before it.
  // ⚠⚠ OTA-1245 — THE PICKER'S CHIP LIST, HOISTED. It used to be an inline JSX
  // expression, which was fine while the picker was its only reader. The
  // colour-lane teaching hint needs to know whether THIS room actually shows more
  // than one lane — and computing that from a second copy of this filter chain is
  // the exact drift this session has now paid for three times (OTA-1236's guard vs
  // its firer, OTA-1241's matcher vs its census, OTA-1244's display guarantee vs
  // its recompute). One list, two readers.
  // ⚠⚠ OTA-1248 — THE TUTORIAL PICKER SHOWS THE WHOLE ROOM. Owner: *"even though
  // we are doing just the cudgel for take, the take/salvage popup should be fully
  // populated so they understand it shows all."*
  //
  // ⚠ THIS REVERSES OTA-1233's NARROWING, AND THE REASON THAT RULE EXISTED HAS
  // EXPIRED. It was written after a playtest where a guided beat offered the room's
  // real nouns beside the demo one — *"neither of those are the cudgel"* — back
  // when a wrong tap CLOSED the picker and cost a reopen. Since OTA-1238 the picker
  // STAYS OPEN, so a wrong tap now just takes something else and leaves the beat's
  // target sitting right there. The cost that justified narrowing is gone; the cost
  // of narrowing (OTA-1245: the layout is unteachable) is not.
  //
  // ⚠⚠ THE PROPS ARE MERGED IN, NOT SWAPPED FOR THE ROOM. The tutorial props are
  // NOT scene nouns — they never appear in `displayedAmbientNouns`, which is why
  // the owner's log shows LOOK listing the room without the cudgel in it. Dropping
  // the override would have deleted the demo prop from the picker entirely and
  // stalled the beat.
  // ⚠⚠ OTA-1250 — HOISTED, BECAUSE IT NOW DRIVES TWO THINGS. The demo prop the
  // beat is about is both the chip that gets merged in AND the ONE noun the picker
  // will act on. Computing it twice is the drift this session has paid for six
  // times over; the picker's lock and the picker's contents read the same value.
  const tutorialProp: string | null =
    tutBeat === 'cudgel' ? 'cudgel'
      : tutBeat === 'armor' ? "Mud-Warden's Vest"
        : tutBeat === 'screen_pick' ? "Reclaimer's Salvage Cap"
          : tutBeat === 'scrap' ? 'broken chest plate'
            : null;
  // ⚠⚠ ...AND THE PROP GOES SPENT WHEN IT IS TAKEN. From the owner's log, the vest
  // row paid out FIVE TIMES: `consumed` was hardcoded false, so the armor beat —
  // the one beat that deliberately does NOT advance on the take (it advances on
  // the equip) — left a row that could be tapped forever. `grantTutorialItem`
  // early-returns once the prop is consumed, so only the FIRST tap was a real
  // grant; the four after it printed the reward line over nothing. A log line
  // claiming an item the engine did not hand over is worse than a dead button.
  const propConsumed = useGameStore((s) =>
    tutorialProp === null ? false
      : tutBeat === 'cudgel' ? !!s.tutorialPropsConsumed.cudgel
        : tutBeat === 'armor' ? !!s.tutorialPropsConsumed.vest
          : tutBeat === 'screen_pick' ? !!s.tutorialPropsConsumed.cap
            : !!s.tutorialPropsConsumed.chestPlate);
  const gatherChips = useMemo(
    () => {
      const room =
          // ⚠ ONE list, unfiltered by kind — the merge is the point. The
          // elevation filter still applies: while up a climb the picker lists
          // only what is actually reachable (OTA-948), rather than ground
          // nouns every tap would be refused on.
          reachableWhileElevated(
              currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? [],
              currentScene?.elevatedOn?.noun ?? null,
              !!currentScene?.elevatedOverlayMeta,
              currentScene?.nounPlacements ?? null,
              currentScene?.elevatedOn?.tier ?? 0,
            )
              .filter((n) => !isOversized(n) || findCatalogItem(n) === null)
              // ⚠⚠ OTA-1233 — `isExhaustedHookNoun` IS PART OF THE CONSUMED
              // TEST, and it nearly went missing in the merge. The old salvage
              // picker consulted it (OTA-1211: a spent hook noun must grey, or
              // the chip stays lit forever and every tap earns a refusal), and
              // retiring that picker took its call site with it. ota1211's
              // suite counts these call sites for exactly this reason and
              // failed the moment it dropped — the pin worked.
              .map((n) => ({
                noun: n,
                consumed: isAmbientConsumed(n) || isExhaustedHookNoun(n),
              }));
      // ⚠ The prop goes FIRST so the beat's target is the top line of its lane —
      // the room is fully populated, and the thing the Arbiter just named is still
      // the easiest row to find.
      return tutorialProp
        ? [{ noun: tutorialProp, consumed: propConsumed }, ...room.filter((c) => c.noun !== tutorialProp)]
        : room;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tutorialProp, propConsumed, currentScene, productivelyConsumedSet],
  );

  // ⚠⚠ OTA-1245 — HOW MANY COLOUR LANES THIS ROOM WOULD ACTUALLY SHOW. Derived
  // from `gatherChips` — the same array the picker renders — so the teaching hint
  // cannot fire over a room that turns out to have one lane, or stay silent over
  // one that has three.
  // ⚠⚠ OTA-1263 — AND HOW MANY ROWS, WHICH IS WHAT LIGHTS THE BUTTON. Owner, typed
  // into the game: *"take /salvage is still green but the popup has nothing in it
  // to claim."* The button's green came from `takeableCount` + `salvageableCount`,
  // two predicates written in 2026-05 to mirror TakeModal's and SalvageModal's
  // filter chains — **two modals that have not existed since OTA-1233.** They were
  // never updated to match GatherModal, so the light and the card had drifted into
  // different opinions about what the room holds.
  //
  // ⚠ THE SEVENTH TIME THIS SESSION FOR A RULE COMPUTED TWICE. The picker renders
  // `gatherChips`; so does the lane count; so does this now. One array, one answer.
  const gatherCounts = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { classifyGatherNoun: cls, laneForKind: lane } =
      require('../engine/gatherSort') as typeof import('../engine/gatherSort');
    const lanes = new Set<string>();
    let rows = 0;
    for (const c of gatherChips) {
      if (c.consumed) continue;
      const l = lane(cls(c.noun));
      if (l) { lanes.add(l); rows += 1; }
    }
    return { lanes: lanes.size, rows };
  }, [gatherChips]);
  /** ⚠⚠ OTA-1455 — WHAT TO SUGGEST TYPING, DRAWN FROM WHAT IS ACTUALLY HERE.
   *
   *  The parser is a first-class way to play — several verbs are typed-only by
   *  design — and the input advertised it with a static "What do you do?", which
   *  reads as a search box rather than as a conversation. An outside review put
   *  it well: a generic bar says "Google fallback", not "this engine takes prose".
   *
   *  ⚠⚠⚠ AND IT MUST NEVER SUGGEST SOMETHING THE PARSER WOULD REFUSE. A hint that
   *  fails is worse than no hint: the player's first typed sentence gets rejected
   *  and they conclude typing does not work. So the noun comes from `gatherChips`
   *  — THE EXACT ARRAY THE PICKER RENDERS, consumed rows already flagged — not
   *  from the raw scene list and not from a table of nice-sounding examples. If
   *  the picker would grey it, this cannot offer it.
   *
   *  ⚠ It changes when the noun is spent, which is the right moment: a hint that
   *  held while its subject was worked over would go stale in place. Deterministic
   *  (first live row, authored order) so it does not flicker between renders. */
  const parserHint = useMemo(() => {
    const live = gatherChips.find((c) => !c.consumed);
    if (live) return `take the ${live.noun}`;
    if (currentScene?.vendor?.name) return `talk to ${currentScene.vendor.name}`;
    if (currentScene?.wanderer?.name) return `talk to ${currentScene.wanderer.name}`;
    return null;
  }, [gatherChips, currentScene?.vendor?.name, currentScene?.wanderer?.name]);

  // ⚠⚠⚠ OTA-1457 — TAKE-AND-WEAR, IN ONE PLACE, BECAUSE IT NOW HAS TWO CALLERS.
  //
  // This is the OTA-1237 block verbatim, lifted out of the gather picker's
  // `onTake` so the feed chip runs THE SAME CODE rather than a copy of it. A
  // second hand-written copy is how the two would eventually disagree about
  // when the equip is safe — and the safety here is subtle enough that a copy
  // WOULD drift:
  //
  //   • the slot comes from the same catalog lookups the ★ mark uses, so a row
  //     cannot advertise an upgrade and then have nowhere to put it; and
  //   • the equip only runs IF THE TAKE ACTUALLY LANDED. `takeAmbientNoun`
  //     refuses by LOGGING, not by throwing — a full pack, an already-worked-over
  //     noun — so equipping regardless would answer one refusal with a second
  //     ("I don't see it on you") at a player who did nothing wrong.
  const takeAndWear = useCallback((noun: string) => {
    const wear = isUpgradeOverEquipped(player, noun) ? upgradeEquipSlot(player, noun) : null;
    takeAmbientNoun(noun);
    if (!wear) return;
    const held = useGameStore.getState().player?.inventory ?? [];
    // ⚠ OTA-1485 — both outcomes of the equip half leave a debug line. The owner
    // reported a take-and-wear landing on the wrong slot and taps that did
    // nothing, and the log could name neither: the take half logs through
    // takeAmbientNoun, but which slot the equip resolved to — and whether it ran
    // at all — was invisible. The slot named here is the one the equip is given.
    if (held.some((i) => i.name.toLowerCase() === wear.name.toLowerCase() && i.quantity > 0)) {
      useGameStore.getState().appendLog('debug', `take&wear: equipping "${wear.name}" -> ${wear.slot}`);
      useGameStore.getState().equipItem(wear.name, wear.slot);
    } else {
      useGameStore.getState().appendLog('debug', `take&wear: take of "${noun}" did not land - equip skipped`);
    }
  }, [player, takeAmbientNoun]);

  // ⚠⚠ OTA-1457 — THE FEED'S TRAILING CHIP, DERIVED FROM THE PICKER'S OWN ARRAY.
  // `gatherChips` is the exact list the take picker renders, consumed rows already
  // flagged by the pass that greys them. So the chip cannot offer a noun the picker
  // would refuse — the same structural guarantee OTA-1455 gave the parser hint, and
  // for the same reason: an offer the game then rejects teaches the player that the
  // offer meant nothing.
  const feedChip = useMemo(
    // ⚠⚠⚠ NOT DURING THE TUTORIAL, AND THIS WAS A REAL BUG THE SUITE CAUGHT.
    // `takeAndWear` is the NON-TUTORIAL tail of the picker's `onTake`: the
    // tutorial branches above it advance the beat, and the chip skips them. So a
    // player who tapped the chip during the armor beat got the vest, wore it, and
    // stayed stuck on `armor` — the beat waiting forever for a tap on a row they
    // had already been given a faster way past. ota1253 failed exactly this way.
    //
    // ⚠ The gate is the WHOLE tutorial (`tutBeat !== null`), not the narrower
    // `tutLock`. During a scripted beat there is exactly one right control and the
    // beat is pointing at it; a second, faster route to the same action competes
    // with the thing being taught. Same reasoning the more-tray uses for refusing
    // to let a forced-open tray write the player's own preference.
    // ⚠ OTA-1500 — hidden through the tutorial EXCEPT its own beat: screen_pick
    // exists to teach this exact offer, so that is the one beat that shows it.
    () => (tutBeat !== null && tutBeat !== 'screen_pick' ? null : pickFeedActionChip(player, gatherChips)),
    [player, gatherChips, tutBeat],
  );
  const gatherLaneCount = gatherCounts.lanes;
  /** ⚠ Rows the picker would actually draw. Zero = an empty card, so the button
   *  must not promise one. */
  const gatherRowCount = gatherCounts.rows;

  // ⚠⚠ OTA-1249 — THE CARD WAITS FOR THE PICKER TO CLOSE. Owner: *"when you hit
  // the button, the new popup should jump in, then when you close it it should
  // show the new card."* OTA-1245 fired it on ARRIVAL instead, one beat before the
  // player pressed anything, on the reasoning that FirstTimeHint is an absolute
  // overlay that renders BELOW an RN Modal (OTA-234) and so could not be raised
  // over the open picker. That solved the wrong half: it explained a layout the
  // player had not seen yet, and by the time they opened the picker the card was
  // already dismissed and gone.
  //
  // ⚠ THE LANE COUNT IS SNAPSHOT WHILE OPEN, NOT READ AT CLOSE. Taking or
  // sweeping empties lanes, so a player who cleared the room down to one lane —
  // or to none, which auto-closes (OTA-1240) — would read zero at close and never
  // be taught. The high-water mark is what they actually saw.
  // ⚠⚠⚠ OTA-1524 — THE SEVEN SYSTEMS THE OTA-1523 AUDIT DELIBERATELY SKIPPED,
  // COVERED ON THE OWNER'S CALL ("cover them anyways"). The audit's argument for
  // skipping was that each already opens a modal at the point of use and piling
  // cards on top is how a player learns to reach for "turn off tips". That was an
  // argument about NOISE — and the owner's answer is the better one: the switch
  // is the answer to noise, so OTA-1524 covers the systems AND makes certain
  // every surface actually offers the switch (the two primers did not, and worse,
  // ignored it entirely — see CombatPrimerModal / DogOnboardingModal).
  //
  // ⚠⚠ EVERY ONE LATCHES, RATHER THAN READING LIVE. FirstTimeHint is an absolute
  // overlay and renders BELOW an RN Modal (OTA-234), so a card raised while the
  // sheet is still open is invisible — exactly the trap `pickerLanesTaught` below
  // was built to dodge. Latch on open, render once the sheet is gone.
  const [pickpocketTaught, setPickpocketTaught] = useState(false);
  useEffect(() => { if (pickpocketOpen) setPickpocketTaught(true); }, [pickpocketOpen]);
  const [torchTaught, setTorchTaught] = useState(false);
  useEffect(() => { if (torchChooserOpen) setTorchTaught(true); }, [torchChooserOpen]);
  const [climbTaught, setClimbTaught] = useState(false);
  useEffect(() => { if (climbOpen) setClimbTaught(true); }, [climbOpen]);
  // ⚠ These three live in the STORE rather than in screen state, so the latch
  // reads the same field the self-mounting sheet does — a hint cannot fire for a
  // sheet the player was never shown.
  const fusionPickerOpen = useGameStore((st) => st.fusionPickerOpen);
  const [fusionTaught, setFusionTaught] = useState(false);
  useEffect(() => { if (fusionPickerOpen) setFusionTaught(true); }, [fusionPickerOpen]);
  // ⚠ pendingParley is ALREADY selected above — reuse it rather than shadowing.
  const [parleyTaught, setParleyTaught] = useState(false);
  useEffect(() => { if (pendingParley) setParleyTaught(true); }, [pendingParley]);
  const giftMode = useGameStore((st) => st.giftMode);
  const [giftTaught, setGiftTaught] = useState(false);
  useEffect(() => { if (giftMode) setGiftTaught(true); }, [giftMode]);

  const [pickerLanesTaught, setPickerLanesTaught] = useState(false);
  const lanesWhileOpen = useRef(0);
  useEffect(() => {
    if (takeOpen) {
      lanesWhileOpen.current = Math.max(lanesWhileOpen.current, gatherLaneCount);
      return;
    }
    if (lanesWhileOpen.current >= 2) setPickerLanesTaught(true);
    lanesWhileOpen.current = 0;
  }, [takeOpen, gatherLaneCount]);

  // Build one view per enemy in the scene. Tap-to-cycle is wired through
  // the store's setActiveEnemyIdx so combat handlers always target the
  // enemy the player is currently looking at.
  const enemyViews: EnemyView[] = useMemo(() => {
    if (!currentScene || currentScene.enemies.length === 0) return [];
    // OTA-1006 — reach comes from the SAME resolver the attack gate rolls with
    // (playerWeaponReach: throwable instance → catalog row → forge-stamped
    // uniqueStats.reachClass on fused weapons → runecaster INT gate). The
    // local copy this replaced missed the forge stamp, so a close-only fused
    // weapon read as in-range at mid while every swing bounced.
    // ⚠⚠ OTA-1502 — BOTH HANDS, from that same resolver.
    // ⚠⚠⚠ OTA-1506 — AND NOW PER ENEMY. Each hand's bands resolve once; the
    // per-card question is which bands THIS enemy's own ring falls in — which
    // is the owner's whole design: "if I slide the enemy portraits left and
    // right … it would show me my weapons at different ranges."
    const handReaches: Array<{ slot: 'main' | 'off'; label: string; bands: CombatRange[] }> = [];
    if (player) {
      const eq = player.equipped ?? {};
      for (const slot of ['main', 'off'] as const) {
        const held = slot === 'off' ? eq.off : (eq.main ?? eq.weaponName);
        if (!held) continue;
        const reach = playerWeaponReach(player, slot);
        handReaches.push({ slot, label: reach.label, bands: reach.bands });
      }
      // Both hands empty is still an answer — bare hands reach at close.
      if (handReaches.length === 0) {
        handReaches.push({ slot: 'main', label: 'Bare hands', bands: reachBandsFor('barehanded') });
      }
    }
    return currentScene.enemies.map((e, i) => {
      // Band null = ring 5: present and closing, out of everyone's reach.
      const band = enemyBandOf(currentScene, i);
      const hands = handReaches.map((h) => ({
        slot: h.slot, label: h.label, inRange: band !== null && h.bands.includes(band),
      }));
      return {
        enemy: e,
        currentHp: currentScene.enemyHps[i] ?? e.hp,
        rangeLabel: band === null ? 'out of range' : RANGE_LABELS[band],
        inRange: hands[0]?.inRange ?? false,
        hands,
        // ⚠ OTA-1508 — the owner's corner dot: red = it can hit you from where
        // it stands, yellow = only weakly (halved), green = it can't touch you.
        // A dead body threatens nobody.
        threat: (currentScene.enemyHps[i] ?? e.hp) <= 0 ? ('green' as const) : enemyThreatAt(e, band),
        // OTA-401 — surface active coating/DOT statuses + turns left on the panel.
        statuses: currentScene.enemyStatuses?.[i] ?? [],
      };
    });
  }, [
    currentScene?.enemies, currentScene?.enemyHps, currentScene?.range,
    currentScene?.enemyStatuses,
    player?.equipped?.main, player?.equipped?.off, player?.equipped?.weaponName,
    player?.stats?.intelligence,
    player?.inventory,
  ]);
  const activeIdx = Math.min(currentScene?.activeEnemyIdx ?? 0, Math.max(0, enemyViews.length - 1));

  const inCombat = enemyViews.length > 0;
  const equippedMain = player?.equipped?.main ?? null;
  const equippedOff = player?.equipped?.off ?? null;
  // OTA-406 — coating adjective for the equipped instance in each hand, resolved
  // by the equipped slot id (NOT by name — two same-named weapons, one coated
  // and one not, must be told apart). Feeds the combat quick-button label so a
  // coated weapon reads as itself ("off: acid-etched rusty shortbow") instead of
  // its bare base name. Null when the hand is empty or the weapon is uncoated.
  const coatingForSlot = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const inst = player?.inventory?.find((i) => i.id === id);
    return inst?.coating?.label ?? null;
  };
  const equippedMainCoating = coatingForSlot(player?.equipped?.mainId);
  const equippedOffCoating = coatingForSlot(player?.equipped?.offId);

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No expedition is underway.</Text>
      </View>
    );
  }

  // arb76 (Phase 1) — container is transparent so the AppShell's "aged
  // artifact" background (umber + parchment + vignette) shows through here.
  // The day/night tint (timeOfDayTint) returns in Phase 2 as a translucent
  // wash over the texture rather than an opaque fill.
  void timeOfDayTint;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: 'transparent' }]}
      // OTA 022 — was behavior='height' on Android (OTA 209 fix for
      // keyboard covering the input). 'height' on Android double-
      // shrinks the view: Android's native adjustResize already
      // pulls the window up by keyboard height, then KAV's height
      // mode shrinks the container again on top of that. Periodic
      // "main screen smaller than available" was the visible result.
      // 'padding' adds bottom padding (visual) without touching the
      // container height — it doesn't compound with adjustResize.
      //
      // OTA-178 — behavior split by platform. iOS keeps 'padding'
      // (iOS doesn't auto-resize the window on keyboard show — the
      // padding does the lift). Android sets behavior={undefined}
      // so the native adjustResize (Expo default for managed apps)
      // is the ONLY thing pulling the window up. Pre-fix the
      // 'padding' branch was firing on Android too, adding padding
      // on top of adjustResize — net effect was the input getting
      // shoved off the visible area when the keyboard appeared.
      // Playtester: "can we keep the keyboard from covering the
      // text line we are typing into?"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ⚠⚠ OTA-1245 — THE COLOUR SYSTEM, TAUGHT WHERE IT IS ACTUALLY VISIBLE.
          Owner: *"have we addressed the tutorial yet where we need to go over this
          new style of picker?"* No — and two copy passes had hidden that. The
          tutorial's two picker beats each narrow the list to ONE prop (OTA-1233,
          so a guided beat cannot offer the room's real nouns beside the demo one —
          playtest: "neither of those are the cudgel"), so a first-timer sees a
          single lane twice and never meets the layout at all. Rendered, the cudgel
          beat is `GEAR | ⚔ cudgel | TAKE ALL GEAR (1)`. The redesign's whole idea —
          here is everything, grouped by colour — is invisible.

          ⚠ AND IT CANNOT BE TAUGHT INSIDE THE TUTORIAL WITHOUT LYING: there are
          exactly four tutorial props (cudgel, rope, chest plate, note) and all are
          spent or unavailable by the time the scrap beat runs. Faking a second lane
          means inventing a prop that is not in the room, which is the class of
          defect this whole run has been closing.

          ⚠⚠ SO IT FIRES THE FIRST TIME THE PLAYER CLOSES A REAL MULTI-LANE PICKER
          — `pickerLanesTaught`, latched from the SAME chip array the picker
          renders, so the card cannot describe a layout the player was not just
          shown. It lands AFTER the modal, not during: FirstTimeHint is an absolute
          overlay that renders BELOW an RN Modal (OTA-234), so a card raised over
          the open picker would be invisible. Naming the colours right after the
          player has seen them is the whole point. */}
      {pickerLanesTaught && (
        <FirstTimeHint
          id="picker_colour_lanes"
          title="The room, by colour"
          body="TAKE / SALVAGE opens the whole room grouped by colour — orange gear, green items, yellow salvage. Sweep a colour with its button, or tap one line."
        />
      )}
      {/* ⚠ OTA-1321 — the OTA-860 `combat_first_fight` hint WAS HERE AND IS GONE. It
          fired on this exact condition (a fight is on-screen) and taught a strict
          subset of what CombatPrimerModal now teaches; its one unique idea — you can
          talk a foe down or run — moved into the primer's NOT EVERY FIGHT line. Two
          cards on the same beat is how a player learns to reach for "turn off tips".
          The id is retired, not reused: a player who already dismissed the old hint
          still gets the primer, which is new material. */}
      {/* OTA-1205 — the first Procedure Text in the pack. The vendor-buy door teaches
          instantly and the storyline door says "read it" in its reward line, but the
          FOUND door (site loot) drops the text with no instruction at all — and it is
          the one door open at zero standing, so for many players it comes first. */}
      {(player?.inventory ?? []).some((i) => i.name.startsWith('Procedure Text:') && i.quantity > 0) && (
        <FirstTimeHint
          id="procedure_text_first"
          title="A procedure text"
          body="You're carrying a Procedure Text — an aether technique, written down. READ it to learn the technique: tap it in your pack, or type read and its name. If it's beyond you today, it keeps — nothing is wasted."
        />
      )}
      {/* OTA-928 — introduce the Power rating the first time a fight is on-screen, when
          both the player badge (top-right) and the enemy badge (top-left) are visible. */}
      {(currentScene?.enemies?.length ?? 0) > 0 && (
        <FirstTimeHint
          id="power_number"
          title="Power rating"
          body="The ◆ number by your name is your Power — a quick gauge built from your stats, weapon, armour, and health. In a fight, your number AND each foe's are coloured by the matchup: green means you outclass it, gold is an even fight, red means it outclasses you. Your individual stats still matter — Power just tells you at a glance where you stand. Make your character stronger and watch it climb."
        />
      )}
      {/* ⚠⚠⚠ OTA-1523 — THE BUTTON ROW GREW AND NOTHING EVER SAID SO. An audit of
          every tutorial beat and first-time card found three controls with zero
          onboarding: BLOCK and SHIELD BASH (OTA-1510, the owner's own request —
          "should have a block button up here during combat") and THROW SPEAR
          (OTA-1511). CombatPrimerModal is OTA-1321 and predates all three.
          ⚠⚠ AND THE PRIMER CANNOT BE THE FIX FOR ANYONE ALREADY PLAYING. It is
          gated `enemiesDefeatedEver === 0`, so a character past their first kill
          can never see it again however much copy is added. These buttons appear
          the moment a shield rides the off arm or a spare spear is in the pack —
          which for an existing character is the ONLY moment left to teach them.
          So the teaching goes where the control does. */}
      {(currentScene?.enemies?.length ?? 0) > 0 && (() => {
        const eq = player?.equipped;
        const offInst = eq?.offId
          ? player?.inventory.find((i) => i.id === eq.offId)
          : (eq?.off ? player?.inventory.find((i) => i.name === eq.off) : undefined);
        return !!offInst && itemIsShield(offInst);
      })() && (
        <FirstTimeHint
          id="combat_shield_block"
          title="The shield on your arm"
          body="A shield on the off arm adds two buttons. BLOCK sets you behind it — the first blow that comes breaks on it — but you hold position for the round, so everything else in reach gets a swing. SHIELD BASH is the same shield turned offensive: it goes through the normal attack, and a solid hit staggers them. BLOCK wants a shield; bare-armed, DODGE is the read."
        />
      )}
      {/* ⚠ OTA-1523 — THROW SPEAR only exists when a SPARE is in the pack: a long
          shaft that is either unequipped or stacked deep enough that hurling one
          does not empty your hand. Taught on the same rule the button lights by. */}
      {(currentScene?.enemies?.length ?? 0) > 0
        && (player?.inventory ?? []).some((i) => /spear|lance|javelin|pike/i.test(i.name) && (i.quantity ?? 0) > 0) && (
        <FirstTimeHint
          id="combat_throw_spear"
          title="Throwing a spear"
          body="Carry a spare long shaft and THROW SPEAR appears in a fight. It hurls the spare at its own throwing range — much further than you can stab with it — and the spear is spent on a hit, so it is a way to open on something before it closes, not a move to lean on. Keep one back if you want it twice."
        />
      )}
      {/* ⚠⚠⚠ OTA-1523 — HIGH GROUND CUTS BOTH WAYS, AND ONLY ONE WAY WAS EVER SAID.
          The game already narrates the half that helps — "Below, X circles the base
          — it cannot reach you up here" — and says nothing about the half that
          hurts: from up here most weapons cannot reach DOWN either, so the attack
          button simply refuses. That gap cost the OWNER a debugging session (the
          tuning-fork case behind OTA-1517: the strike button read green on a climb
          because reach-band and elevation were being answered by the same test).
          If it confused the person who wrote it, it will confuse a player. */}
      {!!currentScene?.elevatedOn && !!currentScene?.enemiesAtBase
        && (currentScene?.enemies?.length ?? 0) > 0 && (
        <FirstTimeHint
          id="elevation_first_fight"
          title="Fighting from up here"
          body="Height cuts both ways. Nothing on the ground can reach you — but most of what you carry cannot reach DOWN either, and a weapon that cannot will just refuse when you tap it. Bows, slings and thrown weapons work from up here; a blade needs you back on the ground. Your golem cannot climb, so it waits at the base. Climb down to close, or fight with something that carries."
        />
      )}
      {/* ⚠⚠ OTA-1523 — THE COMBAT LOG IS DENSE AND NOTHING DECODES IT. A player
          reads `d20 → 18 + ATK 8 = 26 vs your AC 28 (needs nat 16+ — AC capped) —
          HIT` and sees a hit on a total BELOW their armour with no way to learn
          why. Same for `[plate −2]`, `35% resisted`, `[edge of reach — halved]`.
          Fires on the first fight, beside the Power card that already reads the
          top badges — both are "how to read what you are looking at". */}
      {(currentScene?.enemies?.length ?? 0) > 0 && (
        <FirstTimeHint
          id="combat_readout"
          title="Reading the fight"
          body="Every swing shows its arithmetic. `d20 → 14 + ATK 8 = 22 vs your AC 28` is their roll against your armour. `needs nat 16+ — AC capped` means your armour is high enough that only the die itself can beat you — a high enough raw roll lands regardless of the total, so no armour makes you untouchable. On damage, `[plate −2]` is flat armour soak, `35% resisted` is your resistance to that damage type, and `[edge of reach — halved]` means they were barely close enough. Coatings tick on their own line — burn and acid keep eating for a set number of turns after the hit that started them."
        />
      )}
      {/* ⚠⚠⚠ OTA-1524 — THE SEVEN, each fired off a durable fact rather than off
          the sheet that taught nothing. A modal explains WHAT to pick; none of
          them explains what the system COSTS or when it refuses, which is the
          part players learn by losing something. */}
      {pickpocketTaught && (
        <FirstTimeHint
          id="pickpocket_first"
          title="Lifting a pocket"
          body="PICKPOCKET goes for what someone is carrying, not what they have laid out to sell — their table is a TAKE or a trade. It is a check against them, and failing it is not free: get caught and the mark turns on you, and the whole faction hears about it. Standing you spent hours earning can go in one bad roll."
        />
      )}
      {parleyTaught && (
        <FirstTimeHint
          id="parley_first"
          title="Talking instead of swinging"
          body="Not every fight has to be one. A parley opens two ways out — leaning on them or winning them over — and which one works depends on who they are and what you have already done to their people. You can skip the choice entirely by typing the verb you want: intimidate, persuade, calm. A parley that fails still costs you the beat, and they act."
        />
      )}
      {giftTaught && (
        <FirstTimeHint
          id="gift_first"
          title="Giving something away"
          body="GIVE hands an item over for nothing and buys standing instead. What it is worth to them depends on who they are — a Mud Monarch cares about different things than a Tomekeep — and giving to one faction can cool another that hates them. The item is gone either way, so give what you can spare, not what you might need."
        />
      )}
      {torchTaught && (
        <FirstTimeHint
          id="torch_first"
          title="Burning your light"
          body="A torch, lantern or lamp burns down while it is lit — light is a consumable, not a switch. Some things in the dark can only be found with one burning, so carry a spare before you go deep. When more than one thing here could use the flame, the game asks which; pick the one you actually came for."
        />
      )}
      {fusionTaught && (
        <FirstTimeHint
          id="fusion_first"
          title="The Fusing Crucible"
          body="The Crucible pushes one item into another and keeps the result. It consumes both — there is no undoing it and no separating them again afterwards — so fuse the spare into the keeper, never the other way round. If a pairing is refused, the Crucible says why rather than wasting the pair."
        />
      )}
      {player?.golem && (
        <FirstTimeHint
          id="golem_first"
          title="Your golem"
          body="A golem fights beside you and takes hits meant for you, but it is not a second you: it cannot climb, so it waits at the base of anything you go up, and it cannot be healed with your kit. Name it when you raise it — the name sticks, and it is what the log will call it when it goes down for you."
        />
      )}
      {climbTaught && (
        <FirstTimeHint
          id="climb_first"
          title="Going up"
          body="A climb goes in tiers, and each one costs stamina — the taller the thing, the more it takes to reach the top, and coming down costs again. What is up there is usually worth it, but check your stamina before the last tier: running out partway is how a fall happens. Rope makes every tier cheaper."
        />
      )}
      <View style={styles.topRow}>
        <TutorialTarget area="top-left-stats" style={styles.statsCol}>
          {/* OTA 040 — tap the stats panel to open the full Player
              Sheet. Wrapped INSIDE the TutorialTarget so the overlay
              still measures the same layout box. */}
          <TouchableOpacity
            onPress={() => setScreen('character')}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Open player sheet"
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && Math.abs(h - statsColH) > 0.5) setStatsColH(h);
            }}
          >
            <StatsPanel player={player} enemyPower={inCombat && enemyViews[activeIdx] ? enemyPowerScore(enemyViews[activeIdx]!.enemy) : undefined} />
          </TouchableOpacity>
        </TutorialTarget>
        <TutorialTarget area="top-right-enemy" style={styles.rightCol}>
          {inCombat ? (
            <EnemyPanel
              enemies={enemyViews}
              activeIndex={activeIdx}
              onSelectActive={setActiveEnemyIdx}
              maxHeight={statsColH}
              playerWisdom={player?.stats?.wisdom}
              enemyIntel={worldMemory?.enemyIntel}
              playerPower={player ? playerPowerScore(player) : undefined}
              witholdIntel={player ? profileOf(player).witholdIntel : false}
            />
          ) : (
            // OTA-852 — the crest square is idle real estate when peaceful, so it
            // becomes the codex hub: WORLD above, LORE below, bracketing the crest.
            // Both vanish the instant an enemy is staged (the panel flips to
            // EnemyPanel), so they never cost permanent space or clutter combat.
            <>
              <TouchableOpacity style={styles.crestNavBtn} activeOpacity={0.7} onPress={() => setScreen('world')} accessibilityRole="button">
                <Text style={styles.crestNavText}>⚑ WORLD</Text>
              </TouchableOpacity>
              {/* ⚠⚠ OTA-1370 — the crest tile is now a live, player-centred
                  mini-map: the outpost interior while you are inside one, the
                  world atlas otherwise. Owner's ask, and his two conditions
                  are both kept — ⚑ WORLD and ◈ LORE still bracket it above and
                  below, and the whole column still flips to the EnemyPanel the
                  instant an enemy is staged, so the portrait is untouched.
                  Tapping it opens the Atlas, which is where you go anyway once
                  the corner tells you something is worth a closer look.
                  CrestPlaceholder is kept, not deleted: it is the fallback for
                  a player with no position to draw yet (character creation, the
                  title screen's preview) and the art is still referenced. */}
              <MiniMap
                onPress={() => {
                  // ⚠⚠ OTA-1375 — THE LOCK COMES ACROSS WITH THE TAP. The MAP
                  // button this replaces refused during the tutorial lockdown
                  // (arb109: double-pulse buzz + an Arbiter nudge, because a
                  // silent no-op reads as a broken button). Deleting that button
                  // without carrying its guard would have left the corner as an
                  // unguarded way out of the scripted crawl — the lockdown is
                  // only as tight as its loosest affordance.
                  if (tutLock) {
                    try { Vibration.vibrate([0, 32, 45, 32]); } catch { /* ignore */ }
                    useGameStore.getState().nudgeTutorialBlocked();
                    return;
                  }
                  setScreen('map');
                }}
              />
              <TouchableOpacity style={styles.crestNavBtn} activeOpacity={0.7} onPress={() => setScreen('lore')} accessibilityRole="button">
                <Text style={styles.crestNavText}>◈ LORE</Text>
              </TouchableOpacity>
            </>
          )}
          {/* v2.4.1 (OTA 048) — gear icon overlaid in the right column.
              Replaces the bottom-row gear, which was the only thing
              left there after the session controls moved into the gear
              screen. The gear floats over whichever right-col content
              is showing (EnemyPanel or CrestPlaceholder).
              OTA-174 — moved from top-right to BOTTOM-right per
              playtest ask: "I wanted the settings gear moved from the
              top right of the enemy box to the bottom right of the
              enemy box." Bottom-right keeps the enemy name + range tag
              at top fully visible (no more truncation around the gear)
              and groups the secondary navigation in one corner. */}
          {/* OTA-748 — settings gear moved OUT of the enemy card (it covered the
              trait tags) into the top scene bar next to MAP. */}
        </TutorialTarget>
      </View>

      <TutorialTarget area="scene-bar" style={styles.sceneBar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sceneText} numberOfLines={1} ellipsizeMode="tail">
            {currentScene
              ? `${currentScene.transitArea ?? currentScene.location.name} · ${dangerLabel(currentScene.location.danger)}${currentScene.hazard ? `  /  ${currentScene.hazard.name}` : ''}`
              : 'No scene'}
          </Text>
          <Text style={styles.timeText} numberOfLines={1}>
            {describeTime(player.hoursElapsed ?? 0)}
            {currentScene?.weather ? (
              <Text style={styles.weatherText}>{` · ${currentScene.weather.name}`}</Text>
            ) : null}
          </Text>
        </View>
        <View style={styles.sceneBarBtns}>
          {/* ⚠⚠ OTA-1375 — THE MAP BUTTON IS GONE. Owner: *"since tapping on
              the minimap opens the atlas, I don't think we need the map button
              anymore."* Right — arb99 put MAP here so the map was always one
              tap away, and the corner mini-map is now that one tap AND shows
              you where you are without spending it. Two controls for one screen,
              one of which is also a live readout, is one too many.

              ⚠ ONE THING IT COST, STATED RATHER THAN SMUGGLED: this bar renders
              in combat and the mini-map does not — the right column flips to the
              EnemyPanel, by the owner's own instruction. So the Atlas is no
              longer reachable mid-fight. That reads correct (you should not be
              browsing the map with a blade out) but it IS a change, and if it
              ever wants undoing the button is one commit back. */}
          {/* OTA-748 — settings gear, relocated here from the enemy card. */}
          <TouchableOpacity
            onPress={() => setScreen('about')}
            hitSlop={8}
            style={styles.sceneBarBtn}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Text style={styles.sceneBarGear}>⚙</Text>
          </TouchableOpacity>
          {/* v2.4.1 (OTA 045) — QUESTS button removed per player
              direction. The main-quest objective chip below the
              scene bar is now the single entry to Contracts (which
              holds the main quest + all side quests + collectibles).
              The chip's relabeling makes that dual role explicit. */}
        </View>
      </TutorialTarget>

      {/* v2.4.1 (OTA 045) — Main Quest chip + entry to all Contracts.
          Replaces the OTA 037 chip and the now-removed QUESTS
          button in the header. The chip plays two roles:
            1. Persistent main-quest pointer — shows the next
               concrete step in prose
            2. The menu button into the full Contracts screen
               (side quests, hunts, mysteries, collectibles)
          The dual role is reflected by the "MAIN QUEST" label on
          line 1 and a dim "tap for all contracts + collectibles"
          subtitle on line 2 — explicit without being verbose.
          Visible whenever the player exists, suppressed only in
          the 'ended' phase (no live quest to point at). */}
      {(() => {
        if (!player) return null;
        const mq = player.mainQuest;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { phaseHint, LOST_CAPITAL_LOCATIONS: capitals, coreGateNextAction } = require('../engine/mainQuest');
        let mainLine: string;
        // OTA-154 — atUnrecovered flag also drives the SUMMON chip on
        // the right edge of the home-screen MAIN QUEST card. Player
        // asked to skip the bounce through Contracts: "I want to be
        // able to get right to the city smack that button and have at
        // it." Same precondition surface the Contracts SUMMON chip
        // uses — both stay live so the secondary path remains as a
        // backup.
        let atUnrecovered = false;
        // ⚠⚠ OTA-1471 — the settle window, read at RENDER time so this chip never
        // becomes the lit-button-that-refuses (OTA-1324: four taps, four
        // identical walls in seventy seconds). Same helper the ACTION calls —
        // two derivations of "can I summon" is how a label and a handler come to
        // disagree. The chip stays PRESSABLE on purpose: a tap prints the full
        // in-world reason, which is more use to a confused player than a dead
        // control (OTA-220's rule).
        let summonSettle: { ready: boolean; hoursLeft: number } = { ready: true, hoursLeft: 0 };
        // ⚠ OTA-1480 — the other thing that can stand between the player and the
        // seat. Same render-time read, same helper as the action.
        let summonBlocked: { blocked: boolean; count: number; names: string[] } =
          { blocked: false, count: 0, names: [] };
        if (!mq || mq.phase === 'ended') {
          // No active main quest — chip still serves as the menu
          // entry but doesn't pretend to point anywhere.
          mainLine = 'No active objective.';
        } else {
          const cores = mq.coresRecovered?.length ?? 0;
          // OTA-412 — the SUMMON chip must only show while the player is
          // STANDING ON the capital's anchor tile. currentLocationId lingers as
          // the capital after a cardinal step off into the wilderness, so gating
          // on it alone left the chip drawn (and the "recover the core here" line)
          // miles outside the city. The summon ACTION already enforces this
          // (summonCoreGuardian → not_at_capital); this hides the button so the
          // affordance matches.
          //
          // ⚠⚠ OTA-1480 — THIS WAS A HAND-ROLLED COPY of the store's private
          // `isStationedAtNamedLocation`, under a comment that admitted it
          // ("Mirror isStationedAtNamedLocation") — and ContractsScreen carried a
          // second copy under the same comment. Three spellings of one rule, all
          // three testing the RE-CENTERED visual frame while every other position
          // question in the game reads the authoritative grid cell. One exported
          // predicate now, so the chip and the action cannot come to disagree.
          const stationedAtCapital = stationedAtNamedLocation(player);
          atUnrecovered = stationedAtCapital
            && capitals.includes(player.currentLocationId)
            && !mq.coresRecovered.includes(player.currentLocationId)
            && (mq.phase === 'revelation' || mq.phase === 'cores');
          if (atUnrecovered) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { coreSettleState, settleWaitPhrase, summonHostiles, hostileNamePhrase } = require('../engine/coreGuardians') as typeof import('../engine/coreGuardians');
            summonSettle = coreSettleState(player.hoursElapsed ?? 0, mq.lastCoreAtHours);
            // ⚠⚠ OTA-1480 — read at RENDER time, same helper the ACTION calls, for
            // the same reason the settle window is (OTA-1324: a lit button that
            // refuses is four taps and four walls in seventy seconds). The chip
            // stays PRESSABLE — a tap prints the full in-world reason, which beats
            // a dead control (OTA-220).
            summonBlocked = summonHostiles(currentScene?.enemies, currentScene?.enemyHps, currentScene?.enemyKnockedOut);
            mainLine = summonBlocked.blocked
              ? `${hostileNamePhrase(summonBlocked.names)} still ${summonBlocked.count === 1 ? 'stands' : 'stand'} between you and the seat.`
              : summonSettle.ready
                // ⚠ The faction next-action is FLAVOUR now, not an instruction: the verb
                // path that used to summon is gone, so the line ends at the control that
                // actually raises the Guardian — the ★ SUMMON chip beside this text.
                ? `${coreGateNextAction(player.factionId)} — then ★ SUMMON.`
                : `The grid is still closing over the last seat — ${settleWaitPhrase(summonSettle.hoursLeft)}.`;
          } else {
            mainLine = phaseHint(mq.phase, cores);
          }
        }
        return (
          <TutorialTarget area="objective-chip">
          <TouchableOpacity
            style={styles.objectiveChip}
            accessibilityRole="button"
            onPress={() => {
              // Tungsten Spire — advance the main_quest tutorial beat
              // when the player taps the MAIN QUEST chip, then route
              // to the Contracts screen as normal.
              useGameStore.getState().maybeAdvanceTutorial('main_quest');
              setScreen('contracts');
            }}
            activeOpacity={0.7}
            hitSlop={6}
          >
            <View style={styles.objectiveChipRow}>
              {/* arb120 — slimmed to ONE line (was title + subtitle) to give the
                  exploration feed more room; the MISSIONS quick-button now carries
                  the "open Contracts" affordance the subtitle used to spell out. */}
              <Text style={[styles.objectiveChipTitle, styles.objectiveChipBody]} numberOfLines={1}>
                <Text style={styles.objectiveChipStar}>★ </Text>
                <Text style={styles.objectiveChipLabel}>MAIN QUEST · </Text>
                {mainLine}
              </Text>
              {atUnrecovered && (
                <TouchableOpacity
                  style={[styles.objectiveChipSummon, (!summonSettle.ready || summonBlocked.blocked) && styles.objectiveChipSummonWait]}
                  onPress={() => useGameStore.getState().summonCoreGuardian()}
                  activeOpacity={0.7}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  {/* OTA-1471 — the label names the wait BEFORE the tap; the tap
                      still prints the full reason.
                      OTA-1480 — and names the fight, which is the nearer of the two
                      reasons and the one the player can do something about now. */}
                  <Text style={[styles.objectiveChipSummonText, (!summonSettle.ready || summonBlocked.blocked) && styles.objectiveChipSummonWaitText]}>
                    {summonBlocked.blocked
                      ? '★ FIGHT FIRST'
                      : summonSettle.ready ? '★ SUMMON' : `★ SETTLING · ${Math.max(1, Math.round(summonSettle.hoursLeft))}h`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
          </TutorialTarget>
        );
      })()}

      {/* ⚠⚠ OWNER, 2026-08-17: *"when you land on the tile, beginning the climb should be a
          button like summon the guardian. and it should only be visible if you have that
          particular map and used it to mark the location."*

          The ★ CLIMB chip, built to the same rule as ★ SUMMON: an affordance that appears
          exactly when the action behind it would succeed, and is absent otherwise. Before
          this, the ONLY way into a 14-tier ascent was to type the tower's full canonical
          name — and the capital's own object list leads with the bare noun "spire", which
          matched neither climb and dropped the player into a generic 3-tier scramble.

          ⚠ THE GATE IS THE CHART, exactly as the owner asked and exactly as OTA-912 already
          defines it: `worldMemory.unlockedGreatClimbs` only contains a climb id once its
          Skyreacher Chart has been USED from the pack. Owning the map is not enough; the
          map has to have been read. Until then the landmark reads as an ordinary place and
          no button appears — the discovery is still the reward.

          ⚠ The other three conditions mirror the scene-prop gate in beginScene, so the
          button and the climbable noun can never disagree: outdoors (no hubRoomId), nothing
          hostile in the scene, and standing on the climb's own tile. */}
      {(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const GCL = require('../engine/greatClimbs') as typeof import('../engine/greatClimbs');
        const climb = GCL.greatClimbForLocation(player?.currentLocationId);
        if (!climb) return null;
        const charted = (useGameStore.getState().worldMemory.unlockedGreatClimbs ?? []).includes(climb.id);
        if (!charted) return null;
        if (player?.hubRoomId) return null;
        const hostile = (currentScene?.enemies ?? []).some(
          (_e, i) => (currentScene?.enemyHps?.[i] ?? 0) > 0,
        );
        if (hostile) return null;
        return (
          <View style={styles.objectiveChip}>
            <View style={styles.objectiveChipRow}>
              <Text style={[styles.objectiveChipTitle, styles.objectiveChipBody]} numberOfLines={1}>
                <Text style={styles.objectiveChipStar}>★ </Text>
                <Text style={styles.objectiveChipLabel}>GREAT CLIMB · </Text>
                {`${climb.noun} — ${climb.tiers} tiers`}
              </Text>
              <TouchableOpacity
                style={styles.objectiveChipSummon}
                // ⚠ Submits the canonical noun rather than calling a private climb entry
                // point. That is deliberate: it walks the SAME parser → climb path a
                // player typing the name walks, so the button cannot drift away from the
                // typed route or skip the strap gate, the height rules, or the guaranteed
                // Skyreacher drop.
                onPress={() => { void useGameStore.getState().submitPlayerAction(`climb ${climb.noun}`); }}
                activeOpacity={0.7}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.objectiveChipSummonText}>★ CLIMB</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {/* arb166 — no trading mid-fight. The vendor stays in the scene (the
          banner returns once the enemies are down), but while a hostile is
          present the banner is hidden so the player can't step into the stall
          during combat ("I just entered a vendors stall during combat"). */}
      {/* OTA-775 — the top "approach vendor" banner is for OUTDOOR vendors
          (roadside fences, hub square traders). Inside a building the stalls
          ARE the rooms — the bottom room tabs navigate them and EXIT leaves —
          so advertising the current stall as a separate "approach" banner on
          top is redundant and breaks the walked-into-a-building feel. Suppress
          it while inside a building; the stall's own Trade + Crucible actions
          render inside the room instead (block just below). */}
      {/* OTA-1029 — ONE compact row for everything standing in this place: the
          trader, the board, a wanderer, the Crucible. Owner (at Asgardar): "having
          the map line, the weather line, the vendor line and the fuse line takes up
          a lot of screen real estate at a capital." Each was a full-width two-line
          banner; they now sit two-across as short chips, so four stacked banners
          become one row and the feed keeps the height. */}
      <View style={styles.placeChipRow}>
      {/* ⚠ OTA-1154 — the Hidden Market exclusion is GONE from this chip's gate.
          It hid the whole vendor chip there, and the GIFT button lives inside it,
          so every Market face was ungiftable by button — including the twelve
          shopkeepers who work a Market stall and had tastes written for them.
          Typing "gift" always reached them; the affordance never did. */}
      {currentScene?.vendor && !inCombat && !activeBuildingId && !vendorChipDismissed && (
        <TouchableOpacity
          style={[styles.placeChip, styles.vendorChip]}
          onPress={() => setScreen('vendor')}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={styles.vendorBannerStripe} />
          <View style={styles.placeChipBody}>
            <Text style={styles.vendorBannerName} numberOfLines={1}>{currentScene.vendor.name}</Text>
            <Text style={styles.placeChipHint} numberOfLines={1}>{currentScene.vendor.offers.length} offers · tap to trade</Text>
          </View>
          {/* OTA-1059 — TALK. The Phase 2 exchange shipped in OTA-1058 with no
              way to reach it but typing `talk to <name>`, which is a feature
              nobody finds. Shown ONLY for the authored cast — a TALK button on
              somebody with nothing to say is a worse lie than no button. Nested
              touchable, so it does not open the stall.
              ⚠ OTA-1064 — npcLedgerId, NOT `vendor.id`. The raw id is the SPAWN
              id (`roadside_<seed>`, `overlay_<id>_<ms>`); the topic sets are
              keyed on who the person IS (`roadside:grit_maalen`). Asking in the
              wrong namespace answered `false` for all 24 roadside and 5 overlay
              traders, so this button only ever appeared for the 30 named vendors
              whose raw id happens to equal their ledger id — and it was the only
              route into their conversation that a player would ever find. */}
          {/* ⚠⚠ OTA-1453 — STORE, AND IT IS DELIBERATELY REDUNDANT WITH THE CHIP.
              Reported by a player who is not the owner, which is why it is worth
              the pixels: *"why do I have to gift someone before I can use them?"*
              She had not found the store at all. The chip IS the button and its
              hint says "tap to trade" — but the only things on this row that LOOK
              like buttons were TALK and GIFT, so gifting read as the way in. A
              player conditioned by other games looks for the labelled control and
              never learns that the banner itself is tappable.
              ⚠ Same handler as the chip, on purpose. This is not a second route
              into the store, it is the same route wearing the shape people expect
              — so the two can never disagree about where they go. It sits FIRST
              and in the vendor's gold rather than the quiet TALK grey, because
              trading is the primary action at a counter and the other two are
              not. Nested touchables do not bubble in RN, so tapping it navigates
              exactly once. */}
          <TouchableOpacity
            style={[styles.placeChipTalk, styles.placeChipStore]}
            onPress={() => setScreen('vendor')}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Open ${currentScene.vendor.name}'s store, ${currentScene.vendor.offers.length} offers`}
          >
            <Text style={[styles.placeChipTalkText, styles.placeChipStoreText]}>STORE</Text>
          </TouchableOpacity>
          {hasTopicsFor(npcLedgerId(currentScene.vendor)) ? (
            // OTA-1079 — the glow means "something NEW to hear": green while
            // any gate-open topic still has unread lines, back to gold once
            // the player has heard them all. Same spent-math as the sheet's
            // "(asked)" marks, via hasUnspokenTalk.
            <TouchableOpacity
              style={[styles.placeChipTalk, vendorTalkGlow && styles.placeChipTalkUnspoken]}
              onPress={() => talkToNpc(currentScene.vendor?.name ?? '')}
              hitSlop={8}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                vendorTalkGlow
                  ? `Talk to ${currentScene.vendor.name}, they have something new to say`
                  : `Talk to ${currentScene.vendor.name}`
              }
            >
              <Text style={[styles.placeChipTalkText, vendorTalkGlow && styles.placeChipTalkTextUnspoken]}>TALK</Text>
            </TouchableOpacity>
          ) : null}
          {/* OTA-1083 — GIFT beside TALK. The verb existed since OTA-1060 but
              only as typed input ("I didn't see a gift button" — owner). Same
              quiet affordance as TALK; opens the OTA-1060 picker. */}
          <TouchableOpacity
            style={styles.placeChipTalk}
            onPress={() => useGameStore.getState().openGift()}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Give a gift`}
          >
            <Text style={styles.placeChipTalkText}>GIFT</Text>
          </TouchableOpacity>
          {/* OTA-1029 — ✕ on the trader, matching the Crucible's. Nested touchable
              handles its own tap (doesn't open the stall). Hides the chip for this
              tile only: the vendor stays anchored to the room, so walking back in
              — or typing "trade" — still reaches them. */}
          <TouchableOpacity
            style={styles.placeChipX}
            onPress={() => {
              // OTA-1082 — the ✕ doesn't route through submitPlayerAction, so
              // it was the one exit the talk sheet's walk-away guard didn't
              // cover: owner hit ✕ mid-conversation and the vendor left while
              // the sheet stayed open. Dismissing the person you're talking
              // to walks away from the conversation first (same feed line as
              // STOP TALKING). A conversation with somebody ELSE (a wanderer)
              // is not touched — match on the ledger id. And mid-shakedown
              // the ✕ does nothing: their grip is on your wrist.
              const st = useGameStore.getState();
              if (st.pendingPayoff) return;
              if (st.pendingTalk && currentScene.vendor
                && st.pendingTalk.npcId === npcLedgerId(currentScene.vendor)) {
                st.closeTalk();
              }
              setVendorChipDismissedKey(chipViewKey);
            }}
            hitSlop={10}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss ${currentScene.vendor.name}`}
          >
            <Text style={styles.vendorChipX}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* OTA-780 — no floating stall chips. Inside the market the room tabs ARE
          the stalls (bottom travel row) and the stall's actions — TRADE and
          FUSE — live down there beside them + EXIT (see InputBox). Nothing
          layers over the feed. */}

      {/* OTA-451 — Mission Board chip. Stands in the vendor-free central square
          of every faction Outpost; tapping reads the board's open postings into
          the feed (the rep-0 starter quests + anything the player qualifies for)
          so a brand-new character has an immediate quest on-ramp. */}
      {currentScene?.missionBoard && missionBoardHasPostings && (
        <TouchableOpacity
          style={[styles.placeChip, styles.missionBoardChip]}
          onPress={() => setMissionBoardOpen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={styles.missionBoardStripe} />
          <View style={styles.placeChipBody}>
            {/* OTA-1475 — the Market's post is a different thing from a
                faction outpost's board, and saying so is why he asked for it:
                every colour, under the square's truce. */}
            <Text style={styles.missionBoardName} numberOfLines={1}>
              {currentScene.missionBoard.faction === null ? '⚑ THE MARKET POST' : '⚑ MISSION BOARD'}
            </Text>
            <Text style={styles.placeChipHint} numberOfLines={1}>
              {currentScene.missionBoard.faction === null
                ? 'every faction posts here · tap to read'
                : 'tap to view postings'}
            </Text>
          </View>
          <Text style={styles.placeChipArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* OTA-807 — Wandering NPC chip. A person (not a vendor) resting on a peaceful
          outdoor tile. Tapping submits "talk to <name>" so it routes through the
          engine's wanderer talk-check (a d20 + CHA read for a tip / coins / a rare
          standing nudge). Hidden in combat. */}
      {currentScene?.wanderer && !inCombat && (
        <TouchableOpacity
          style={[styles.placeChip, styles.wandererChip]}
          onPress={() => submit(`talk to ${currentScene.wanderer!.name}`)}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={styles.wandererStripe} />
          <View style={styles.placeChipBody}>
            <Text style={styles.wandererName} numberOfLines={1}>☺ {currentScene.wanderer.name}</Text>
            <Text style={styles.placeChipHint} numberOfLines={1}>{currentScene.wanderer.role} · tap to speak</Text>
          </View>
          {/* ⚠ OTA-1154 — GIFT reaches the wanderer now. They were always a valid
              recipient (openGift reads talkablePeople, which includes them) and
              all seven archetypes have authored tastes, but the only GIFT button
              in the game sat on the VENDOR chip — so the affordance existed for
              shopkeepers and nobody else. Stops propagation so the chip's own
              tap-to-speak does not also fire. */}
          <TouchableOpacity
            style={styles.placeChipTalk}
            onPress={(e) => { e.stopPropagation(); useGameStore.getState().openGift(); }}
            hitSlop={8}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Give a gift to ${currentScene.wanderer.name}`}
          >
            <Text style={styles.placeChipTalkText}>GIFT</Text>
          </TouchableOpacity>
          <Text style={styles.placeChipArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* OTA-217 / OTA-220 — visible permit indicator for the OTA-195
          Fusing Crucible. Playtest log: after OTA-217's banner shipped,
          player tapped 'fuse' 5 times in a row not realizing they
          only had 1 of the 3 required reserved items. OTA-220 now
          computes gateFusion state on the player inventory and shows
          the readiness explicitly:
            - READY: "★★ Fusing Crucible ready · tap to fuse"
            - NEEDS PREP: "★★ Fusing Crucible · need N more ♥ items"
                  with the gateFusion reason as the hint line so the
                  player knows exactly what's missing.
          Tapping still submits "fuse" so the engine's own gates fire
          for narration parity. */}
      {/* arb108 — no Crucible in the SPAWN outpost. The outpost banner only
          appears once the player has left to another named location and come
          back (macroVisitSeq ≥ 1; it's 0 only while you've never left the
          spawn macro-location). A wild fusion_bench permit (fusionPending)
          still shows it anywhere. This also keeps it off-screen for the whole
          tutorial, which runs before you've ever left. */}
      {(() => {
        if (crucibleDismissed || !player) return null;
        // OTA-775 — inside a building the Crucible is offered from within the
        // stall (the in-stall actions block above), so the redundant top banner
        // is suppressed here. Outpost/hub and wild-permit Crucibles (not inside
        // a building) still show their top banner as before.
        if (activeBuildingId || currentScene?.location?.id === 'hidden_market') return null;
        // A location that carries its OWN (free) Crucible: an outpost you've left
        // and returned to, an active fusion permit, or a market building.
        const atLocationCrucible = !!(player.fusionPending
          || (player.hubRoomId && (player.macroVisitSeq ?? 0) >= 1)
          || activeBuildingId === 'market');
        // ⚠⚠⚠ OTA-1470 — AND A VENDOR'S PORTABLE CRUCIBLE IS A CHIP TOO, FROM THE
        // FIRST MOMENT. This REVERSES the arb-fix decision that used to live here
        // ("a vendor-carried Crucible lives solely in the vendor screen"), on the
        // owner's explicit ask:
        //
        //   "when I first went to ovik's shop inside there was the fuse screen we
        //    were looking for... but when I backed out it put the store chip and
        //    the fuse chip on the same line like we had decided before. it's only
        //    the initial time i enter that I see the messed up fuse block. it's
        //    not that it's broken, it just shouldn't be there, it should be a
        //    separate chip from the start."
        //
        // ⚠⚠ WHAT HE WAS SEEING WAS TWO DIFFERENT AFFORDANCES FOR ONE THING, and
        // which one he got depended on whether he had already paid. Before the
        // 25 TC: a full-width CRUCIBLE button buried in the vendor screen — the
        // "messed up fuse block". After paying, `fusionPending` flips, and the
        // same Crucible becomes a chip on the tile beside the store chip. Same
        // Crucible, same tap, two completely different pieces of UI, switching
        // under him mid-session.
        //
        // arb-fix was right that the two must never BOTH show — that was the
        // duplication it removed. It picked the wrong survivor. The chip is the
        // one that composes (it shares `placeChipRow` with the store chip, which
        // is the layout he is asking for by name), so the chip wins and the
        // vendor-screen button goes.
        //
        // ⚠ `macroVisitSeq >= 1` mirrors `useVendorCrucible`'s own refusal — "the
        // Crucible's not for first-timers". A chip that renders lit and answers
        // with a wall is the exact defect OTA-1024 and the vendor screen's own
        // comment already record; the requirement is known at render time, so it
        // is consulted at render time.
        const vendorCrucible = !atLocationCrucible
          && !!currentScene?.vendor
          && (player.macroVisitSeq ?? 0) >= 1;
        if (!atLocationCrucible && !vendorCrucible) return null;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { gateFusion, findFactionCatalyst } = require('../engine/itemFusion') as typeof import('../engine/itemFusion');
        // arb-fix — mirror the fuse handler: a reserved faction catalyst counts
        // toward the gate, but only when it isn't equipped (the Crucible burns
        // it). So the banner reads "ready" exactly when the fuse will succeed.
        const eqF = player.equipped ?? {};
        const bannerEquippedIds = new Set(
          [eqF.mainId, eqF.offId, eqF.headId, eqF.chestId, eqF.handsId, eqF.legsId, eqF.feetId, eqF.cloakId, eqF.amuletId, eqF.ringId, eqF.ring2Id, eqF.ring3Id].filter(Boolean) as string[],
        );
        const bannerCatalyst = findFactionCatalyst(player.inventory ?? [], bannerEquippedIds);
        const gate = gateFusion(player.inventory ?? [], bannerCatalyst);
        // ⚠ OTA-1470 — a LOCATION forge is free ('fuse'); a VENDOR's is 25 TC and
        // goes through `useVendorCrucible`, which owns the charge, the tour-mode
        // refusal and the first-timer refusal. Routing the chip through the same
        // action the vendor button used means the price and every gate behind it
        // move with it — the chip is a new door onto the old handler, not a
        // second implementation of it.
        const fireCrucible = () => (vendorCrucible
          ? useGameStore.getState().useVendorCrucible()
          : useGameStore.getState().submitPlayerAction('fuse'));
        const shortOfCoin = vendorCrucible && (player.tc ?? 0) < 25;
        const readyName = vendorCrucible ? '★★ Crucible · 25 TC' : '★★ Crucible ready';
        // ⚠ OTA-1024's lesson, carried onto the chip: say the fee AND the balance
        // BEFORE the tap. He once spent down to 11 TC, tapped, and learned about
        // the fee from a buried system line.
        const readyHint = shortOfCoin
          ? `25 TC to fire — you have ${player.tc ?? 0}`
          : vendorCrucible
            ? `${currentScene?.vendor?.name ?? 'the trader'} fires it · spends ♥ items`
            : 'tap to fuse · spends ♥ items';
        return (
        <TouchableOpacity
          style={[styles.placeChip, styles.fusionChip]}
          onPress={fireCrucible}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <View style={styles.fusionBannerStripe} />
          <View style={styles.placeChipBody}>
            <Text style={styles.fusionBannerName} numberOfLines={1}>
              {gate.ok ? readyName : '★★ Crucible · needs prep'}
            </Text>
            {/* OTA-220's reason line survives the OTA-1029 squeeze: the READY case
                is a one-liner, but a BLOCKED Crucible still spells out what's
                missing (a player once tapped fuse 5× not knowing). */}
            <Text
              style={[styles.placeChipHint, shortOfCoin && gate.ok && styles.placeChipHintShort]}
              numberOfLines={gate.ok ? 1 : 2}
            >
              {gate.ok
                ? readyHint
                : (gate.reason ?? 'tap for details')}
            </Text>
          </View>
          {/* arb152 — dismiss the Crucible chip if you don't need it. Nested
              touchable handles its own tap (doesn't fire the fuse); 'fuse' can
              still be typed, and OTA-1029 leaving the tile re-shows the chip. */}
          <TouchableOpacity
            style={styles.placeChipX}
            onPress={() => setCrucibleChipDismissedKey(chipViewKey)}
            hitSlop={10}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Dismiss Fusing Crucible"
          >
            <Text style={styles.crucibleDismissText}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
        );
      })()}
      </View>

      {/* OTA-777 — the torch is a small quick-use button in the bottom action
          row (see InputBox `torch` QuickBtn), NOT a top banner. */}

      <TutorialTarget area="feed" style={styles.feed}>
        <AdventureFeed
          entries={gameLog}
          enemyNames={currentScene?.enemies.map((e) => e.name)}
          actionChipLabel={feedChip ? feedActionChipLabel(feedChip) : null}
          actionChipA11yLabel={feedChip ? feedActionChipA11yLabel(feedChip) : undefined}
          onActionChipPress={feedChip ? () => {
            // ⚠ OTA-1485 — logUiTap FIRST, before any work. This chip was the
            // one pressable in the game outside the tap ledger: the owner
            // picked it, nothing visibly happened, and the log had no tap line
            // and no live breadcrumb to say the touch even arrived. Same
            // ordering rule as every QuickBtn (OTA-1172/1276) — moving the log
            // after the handler destroys the frozen-screen-vs-frozen-engine
            // signal.
            logUiTap(feedActionChipLabel(feedChip));
            // ⚠ OTA-1500 — during its own beat the offer is a tutorial prop, not
            // a scene noun, so the generic take path cannot grant it; the beat's
            // store action grants, wears and advances (vest-flow rules).
            if (tutBeat === 'screen_pick') {
              useGameStore.getState().tutorialScreenPick();
              return;
            }
            takeAndWear(feedChip.noun);
          } : undefined}
          packChipLabel={feedChip && tutBeat !== 'screen_pick' ? feedPackChipLabel(feedChip) : null}
          packChipA11yLabel={feedChip ? feedPackChipA11yLabel(feedChip) : undefined}
          onPackChipPress={feedChip && tutBeat !== 'screen_pick' ? () => {
            // ⚠ OTA-1498 — same tap-ledger-first rule as the chip above. The pack
            // door is the picker's own plain take (takeAmbientNoun): item lands in
            // the pack, nothing equipped, nothing un-equipped.
            logUiTap(feedPackChipLabel(feedChip));
            takeAmbientNoun(feedChip.noun);
          } : undefined}
        />
        {/* ⚠ OTA-1168 — THE LIVE TEXT IS NO LONGER SHOWN. Owner: "while the arbiter is
            typing live, can we keep that hidden and just see the end result on the screen
            like the rest of the text."
            It used to tail-render `partialArbiterText` token by token with a ▍ cursor, so
            a generated line got read TWICE — once as it was written, once filed into the
            feed. Worse: a line that was later DISCARDED had already been read in full
            before a template replaced it, and the device log shows ~3 wasted generations a
            session (`cancelled:player-acted-again`, `empty→template`).
            ⚠ THE INDICATOR STAYS, DELIBERATELY. This was the ONLY signal the engine is
            working, and measured on-device generations run 6.6-10.9 SECONDS. Dropping it
            entirely buys silence at the price of looking frozen. No words, no cursor —
            just a sign that someone is composing. */}
        {isGenerating && (partialArbiterText || partialArbiterText === '') && (
          <View style={styles.streamingTail}>
            <Text style={styles.streamingPrefix}>The Arbiter is choosing their words…</Text>
          </View>
        )}
      </TutorialTarget>

      <View style={styles.controls}>
        {pendingRolls ? (
          <DiceRoller
            state={pendingRolls}
            onRoll={resolveRollStep}
            onCancel={cancelPendingRolls}
          />
        ) : pendingPayoff ? (
          // OTA-1081 — the shakedown. No cancel: pay, or fight.
          <PayoffSheet />
        ) : pendingTalk ? (
          // OTA-1076 — an open conversation takes the input's place, dice-
          // roller style: topic list at the bottom, replies in the feed,
          // STOP TALKING to hand the slot back.
          <TalkSheet />
        ) : pendingParley ? (
          <ParleySheet />
        ) : pickpocketOpen ? (
          // OTA-1077 — the pickpocket picker joins the slot: choose the mark
          // at the bottom, the Stealth roll and outcome land in the feed.
          // OTA-1078 — marks are PEOPLE (vendor / wanderer), and the payout
          // is what's in their pockets, not their table (pickpocketPerson →
          // engine/pocketLoot.ts). Items stay with the steal/take verbs.
          <PickpocketSheet
            marks={[currentScene?.vendor?.name, currentScene?.wanderer?.name, ...escortLeaderMarks].filter((n): n is string => !!n)}
            onPick={(mark) => {
              setPickpocketOpen(false);
              useGameStore.getState().pickpocketPerson(mark);
            }}
            onCancel={() => setPickpocketOpen(false)}
          />
        ) : (
          <>
          {/* OTA-841 [did-you-mean] — after a low-confidence / unresolved parse, the
              engine stashes the runnable command suggestions; show them as a tappable
              chip row so the player can pick one with a tap instead of retyping. */}
          {parseSuggestions.length > 0 && !inCombat && (
            <View style={styles.didYouMeanRow}>
              <Text style={styles.didYouMeanLabel}>Did you mean…</Text>
              {parseSuggestions.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.didYouMeanChip}
                  activeOpacity={0.7}
                  onPress={() => submit(s)}
                  accessibilityRole="button"
                >
                  <Text style={styles.didYouMeanChipText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <InputBox
            onSubmit={(text) => {
              // OTA-1029 — no vendor-leave gate. Every cardinal move used to be
              // intercepted while a vendor stood in the scene, which meant every
              // capital ROOM hop (the room chips submit "go <dir>") asked whether
              // to leave the trader behind. Vendors stay anchored to their rooms;
              // the chip's ✕ is the way to dismiss one.
              submit(text);
            }}
            onOpenInventory={() => setScreen('inventory')}
            onOpenSearch={() => { Keyboard.dismiss(); setSearchOpen(true); }}
            onOpenCrafting={() => setScreen('crafting')}
            onOpenApproach={() => {
              // OTA-238 — auto-target when there's exactly one enemy.
              // Playtester: "if there's only one enemy, it should
              // automatically approach one distance count towards
              // that enemy. ... If I hit approach it shows me that
              // enemy and I got to click on it and then it shows me
              // all the 50 other things that I can't do." Skip the
              // picker entirely and dispatch `approach <enemy>` so
              // each tap costs one range step (far → close → arm)
              // toward the only enemy in the scene.
              //
              // ⚠⚠⚠ OTA-1502 — THE PICKER IS GONE FROM COMBAT ENTIRELY, not just
              // from the one-enemy case. The owner: *"does the approach button
              // even need to select a person to approach or is it just an extra
              // step that slows down the battle? … all I have to do is slide the
              // enemy target portrait left or right and I'll be able to select
              // that target anyways."* He was right, and the code proved it: the
              // multi-enemy branch's ENTIRE effect was `activeEnemyIdx = idx`
              // (gameStore's advance handler) — the same assignment the portrait
              // pager already makes on a swipe, minus the pager's HP, power and
              // intel. A modal that duplicates a gesture is a tax, so combat now
              // closes on whoever is UP ON THE PAGER. Out of combat the picker
              // is untouched: doors, vendors and features have no pager, and
              // that is where it earns its keep.
              const enemies = currentScene?.enemies ?? [];
              const target = enemies[activeIdx] ?? enemies[0];
              if (target) {
                submit(`approach ${target.name}`);
                return;
              }
              setApproachOpen(true);
            }}
            // OTA-847 (STEALTH SYSTEM) — peaceful PICKPOCKET. Greyed when there's
            // no vendor and nothing liftable in the scene.
            onOpenPickpocket={() => { Keyboard.dismiss(); setPickpocketOpen(true); }}
            // OTA-1080 — marks are PEOPLE now (OTA-1078), so both the block
            // and the glow key on presence of someone with pockets. OTA-1081
            // adds escort leaders walking with you to that set.
            pickpocketBlocked={!currentScene?.vendor && !currentScene?.wanderer && escortLeaderMarks.length === 0}
            pickpocketPossible={!!(currentScene?.vendor || currentScene?.wanderer) || escortLeaderMarks.length > 0}
            onOpenAskArbiter={() => setAskArbiterOpen(true)}
            onOpenMissions={() => { useGameStore.getState().maybeAdvanceTutorial('main_quest'); setScreen('contracts'); }}
            onOpenSalvage={() => { Keyboard.dismiss(); setSalvageOpen(true); }}
            // ⚠⚠ OTA-1263 — AN EMPTY ROOM ANSWERS IN THE FEED, NOT IN A CARD YOU
            // HAVE TO DISMISS. Owner: *"and I have to hit ignore rest to close
            // it."* OTA-1240 taught the picker to auto-close when the PLAYER
            // empties it, but deliberately made an already-empty open explain
            // itself and wait — *"a player who needs an explanation, not a
            // dismissal."* The explanation was right; the modal was the wrong
            // place for it. One line in the feed says the same thing, costs no
            // tap, and can be read at the player's own pace.
            //
            // ⚠ The button still WORKS when dark — it is not blocked. Refusing the
            // tap outright would be the silent-control bug (OTA-1164); this answers.
            onOpenTake={() => {
              Keyboard.dismiss();
              if (gatherRowCount === 0) {
                useGameStore.getState().appendLog(
                  'world',
                  'Nothing here to take or pry apart. The room is picked clean.',
                );
                return;
              }
              setTakeOpen(true);
            }}
            onOpenClimb={() => setClimbOpen(true)}
            onFuse={activeBuildingId === 'market' ? () => useGameStore.getState().submitPlayerAction('fuse') : undefined}
            hasTorch={!!(player?.inventory ?? []).find((i) => /torch|lantern|lamp/i.test(i.name) && canonicalItemTags(i).includes('light') && i.quantity > 0)}
            torchLabel={(player?.inventory ?? []).find((i) => /torch|lantern|lamp/i.test(i.name) && canonicalItemTags(i).includes('light') && i.quantity > 0)?.name?.toLowerCase()}
            torchReady={(currentScene?.hooks ?? []).some((h) => !h.resolved && (h.stage ?? 0) === 0 && !h.torchCharged)}
            onOpenTorch={() => {
              const torch = (player?.inventory ?? []).find((i) => /torch|lantern|lamp/i.test(i.name) && canonicalItemTags(i).includes('light') && i.quantity > 0);
              if (!torch) return;
              const chargeable = (currentScene?.hooks ?? []).filter((h) => !h.resolved && (h.stage ?? 0) === 0 && !h.torchCharged);
              if (chargeable.length > 1) setTorchChooserOpen(true);
              else useGameStore.getState().submitPlayerAction(`use ${torch.name}`);
            }}
            onClimbUp={() => {
              // OTA 033 — tolerate the old OTA 031 string schema for
              // saves that haven't been re-saved on the new shape.
              const elev = currentScene?.elevatedOn as unknown;
              const noun = typeof elev === 'string'
                ? elev
                : (elev as { noun?: string } | null | undefined)?.noun;
              if (noun) submit(`climb ${noun}`);
            }}
            onClimbDown={() => submit('climb down')}
            elevatedOn={(() => {
              const elev = currentScene?.elevatedOn as unknown;
              if (!elev) return null;
              if (typeof elev === 'string') return { noun: elev, tier: 1, totalTiers: 1 };
              return elev as { noun: string; tier: number; totalTiers: number };
            })()}
            // ⚠⚠⚠ OTA-1517 — THE ELEVATION QUESTION, ASKED WHERE THE GATE ASKS IT.
            // Same three scene facts the store's OTA-960 refusal reads, in the
            // same order, so the button's look and the gate's answer cannot
            // disagree. An AIRBORNE foe comes to you — any weapon meets it — so
            // one live flier is enough to leave every button green.
            groundedFoesBelow={(() => {
              if (!currentScene?.elevatedOn || !currentScene?.enemiesAtBase) return false;
              const live = (currentScene?.enemies ?? []).filter(
                (e, i) => e && (e.hp ?? 0) > 0 && !(currentScene?.enemyKnockedOut ?? [])[i],
              );
              return live.length > 0 && live.every((e) => !enemyIsAirborne(e));
            })()}
            inCombat={inCombat}
            equippedMain={equippedMain}
            equippedOff={equippedOff}
            equippedMainCoating={equippedMainCoating}
            equippedOffCoating={equippedOffCoating}
            inventory={player?.inventory ?? []}
            range={currentScene?.range ?? null}
            knockedOutPresent={(currentScene?.enemyKnockedOut ?? []).some(Boolean)}
            // ⚠⚠ OTA-1263 — ONE ARRAY LIGHTS THE BUTTON AND FILLS THE CARD. Owner:
            // *"take /salvage is still green but the popup has nothing in it to
            // claim."* Both counts below mirrored TakeModal / SalvageModal, retired
            // at OTA-1233, and had drifted from what GatherModal actually renders.
            // `gatherRowCount` is derived from `gatherChips` — the exact array the
            // picker draws — so the light cannot disagree with the card again.
            takeableCount={gatherRowCount}
            salvageableCount={0}
            climbableCount={(() => {
              // 2026-05-25 — green tone for CLIMB when the scene has at
              // least one climbable noun the modal will render AND it's
              // not fully cleared (top-tier reached, marked with
              // 'climbed:noun:t{maxTier}' in searchedAmbientNouns).
              // Previously we counted every isClimbable noun without
              // subtracting cleared ones, leaving the button green
              // after the player had topped everything in the scene.
              const sceneNouns = currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? [];
              // OTA-164 — see productivelyConsumedSet above. Same hub-key bug.
              const roomKey = makeRoomKey(
                player?.currentLocationId ?? '',
                currentScene?.microMicroId,
                player?.mapX,
                player?.mapY,
                player?.hubRoomId,
              );
              const marks = worldMemory.visitedRooms?.[roomKey]?.searchedAmbientNouns ?? [];
              return sceneNouns.filter((n) => isClimbable(n) && !isClimbCleared(n, marks)).length;
            })()}
            parserHint={parserHint}
            investigateSweeping={investigateSweepRunning}
            investigateCount={(() => {
              // 2026-05-25 — green tone for INVESTIGATE when the scene
              // has at least one chip still actionable (not
              // productively-consumed, not flavor-exhausted). Matches
              // the SearchModal chips param exactly: productively-
              // consumed are filtered out entirely; flavor-exhausted
              // stay visible greyed but don't count as actionable for
              // the tone purpose.
              //
              // 2026-05-25 — also count the pinned "the ground" chip
              // when outside a hub room and not yet consumed (the
              // SearchModal pins this chip regardless of the noun
              // pool). Without this, a wilderness scene with every
              // ambient noun consumed would render INVESTIGATE gray
              // even though tapping 'the ground' is still actionable.
              //
              // 2026-05-26 OTA-069 — also exclude chips with an
              // unmetRequirement (scanner-gated nouns when the
              // matching scanner is not equipped). Playtester: "the
              // only thing left to investigate is a locked item and I
              // do not have the piece... why that investigate button
              // shouldn't turn back to the regular amber". The lock
              // isn't actionable from this state — the player can't
              // tap the chip with any productive outcome until they
              // equip the scanner — so it must not light the tab
              // green.
              //
              // OTA-183 — was hard-coded to 'aetheric' scanner check
              // (and to 'ground' for the pinned chip), so a player on
              // a mud biome with no Mud Scanner had INVESTIGATE
              // staying green because a) the mud-gated chips weren't
              // being filtered (wrong scanner bias check), and b) the
              // pinned 'the mud' chip wasn't being checked against
              // its mud-scanner requirement. Now per-noun: each
              // chip's req.scannerBias drives the check (same fix
              // OTA-179 made to chip-greying), and the pinned chip
              // computes the right key (mud / floor / ground) +
              // honors its own scanner gate.
              const sceneCount = buildChipPool(currentScene).filter(
                (n) => {
                  // 2026-05-26 OTA-070 — fuzzy match against both
                  // pools, mirroring the engine's accept/refuse
                  // decision. Was exact set.has(n.toLowerCase()).
                  if (isFuzzyConsumed(n, productivelyConsumedSet)) return false;
                  if (isExhaustedHookNoun(n)) return false;
                  if (isNounFlavorExhausted(n, flavorExhaustedSet)) return false;
                  const req = searchRequirementFor(n);
                  if (req && player && !playerHasScannerEquipped(player, req.scannerBias)) {
                    return false;
                  }
                  // OTA-930 — elevation gate, mirroring the SearchModal chip logic
                  // (see the chips map ~"climb down to reach"). While the player is
                  // climbed onto a feature with no elevated overlay, every GROUND
                  // noun except the climbed one refuses with "climb down to reach"
                  // and is greyed in the modal — so it is NOT actionable and must
                  // not light the INVESTIGATE chip green. Without this the count
                  // and the modal disagreed: the chip read active while every item
                  // in the picker was greyed — the "active chip, nothing to
                  // investigate" hang the player hit.
                  const elev = currentScene?.elevatedOn;
                  if (elev && !currentScene?.elevatedOverlayMeta) {
                    const climbedNoun = elev.noun.toLowerCase();
                    const nl = n.toLowerCase();
                    const isClimbedNoun = nl.includes(climbedNoun) || climbedNoun.includes(nl);
                    if (!isClimbedNoun) return false;
                  }
                  return true;
                },
              ).length;
              // Pinned-chip key matches the SearchModal pin: mud
              // biome → 'the mud', hub → 'the floor', otherwise →
              // 'the ground'. Hub case never counts (no surface
              // dig); the other two count only when the chip is
              // unconsumed AND any scanner requirement is met.
              let groundCount = 0;
              if (!player?.hubRoomId) {
                const surfaceNoun = (currentScene?.location.tags ?? []).includes('mud') ? 'mud' : 'ground';
                if (!isAmbientConsumed(surfaceNoun)) {
                  const surfaceReq = searchRequirementFor(surfaceNoun);
                  const surfaceUnlocked = !surfaceReq
                    || (player && playerHasScannerEquipped(player, surfaceReq.scannerBias));
                  // OTA-1124 — and the SAME elevation gate the scene nouns get
                  // above. This is the half that made the badge read active
                  // while the modal was entirely greyed; the chip and the count
                  // have to agree or the player is told to open a menu that has
                  // nothing in it.
                  const gElev = currentScene?.elevatedOn;
                  const groundOutOfReach = !!gElev && !currentScene?.elevatedOverlayMeta
                    && !gElev.noun.toLowerCase().includes(surfaceNoun)
                    && !surfaceNoun.includes(gElev.noun.toLowerCase());
                  if (surfaceUnlocked && !groundOutOfReach) groundCount = 1;
                }
              }
              // OTA-1210 — eye-only chips (a marked story lead that is not an
              // ambient noun) are actionable too; the count and the modal must
              // agree, per the OTA-1124 rule.
              const eyeOnlyCount = (currentScene?.arbiterEye ?? []).filter(
                (m) => !buildChipPool(currentScene).some((n) => n.toLowerCase() === m.toLowerCase())
                  && !isFuzzyConsumed(m, productivelyConsumedSet)
                  && !isNounFlavorExhausted(m, flavorExhaustedSet)
                  && !isExhaustedHookNoun(m),
              ).length;
              return sceneCount + groundCount + eyeOnlyCount + (tutBeat === 'investigate' ? 1 : 0); // tutorial door prop
            })()}
            // OTA-188 — drives the CLIMB button's red/amber/green
            // ladder. inventoryHasGate checks every inventory item's
            // resolved effect for a 'gate' kind that unlocks
            // 'climb_steep' — covers Climbing Rope, Reclaimer's
            // Rope, Hardened Climbing Strap, Mudwalker's Treads,
            // Aetheric Treads, Aether Grip Pads, Climbing Gear,
            // Alloy Grappler, Mag-Climb Kit. Same gate the engine
            // checks at climb-time (gameStore.ts:7673), so the
            // button color matches the engine's accept/refuse.
            // OTA-628 — drives the CLIMB button's red/green tone AND the
            // no-stamina haptic. We compute the SAME refusal the engine would
            // give if you climbed right now (no rope / empty stamina / frayed
            // rope), so the colour never lies and the buzz only fires on the
            // recoverable "rest first" case. Mirrors the gate the engine checks
            // at climb-time (gameStore climb handler).
            climbBlockedReason={(() => {
              if (!player) return null;
              const sceneNouns = currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? [];
              const roomKey = makeRoomKey(
                player.currentLocationId,
                currentScene?.microMicroId,
                player.mapX,
                player.mapY,
                player.hubRoomId,
              );
              const marks = worldMemory.visitedRooms?.[roomKey]?.searchedAmbientNouns ?? [];
              const hasClimbable = sceneNouns.some((n) => isClimbable(n) && !isClimbCleared(n, marks));
              const hasGate = inventoryHasGate(
                player.inventory.map((i) => i.name),
                'climb_steep',
                [findGearByName, findMaterialByName, findExplorationItemByName],
              );
              const hasReclaimersRope = player.inventory.some(
                (i) => i.name === "Reclaimer's Rope" && i.quantity > 0,
              );
              const wearsClimbStrap = (player.equipped?.legs ?? '').toLowerCase() === 'hardened climbing strap';
              const ropeName = hasReclaimersRope ? "Reclaimer's Rope" : 'Climbing Rope';
              const ropeInstances = player.inventory.filter(
                (i) => i.name === ropeName && i.quantity > 0 && i.durability != null,
              );
              const activeRopeDurability = ropeInstances.length
                ? Math.max(...ropeInstances.map((i) => i.durability!.current))
                : null;
              return climbBlockReason({
                hasClimbable,
                hasGate,
                hasReclaimersRope,
                wearsClimbStrap,
                stamina: player.stamina,
                activeRopeDurability,
              });
            })()}
            golem={player?.golem ? {
              name: player.golem.name,
              hp: player.golem.hp,
              hpMax: player.golem.hpMax,
            } : null}
            // arb-fix — keep the dog in the combat arsenal whenever it's a
            // living companion, INCLUDING when benched at a climb base
            // (waiting_at_base). dogBlocked tells InputBox to buzz + let the
            // engine explain instead of opening the BITE/DISTRACT picker.
            dog={player?.dog
              && player.dog.hp > 0
              && (player.dog.status === 'with_player' || player.dog.status === 'waiting_at_base')
              ? { name: player.dog.name, hp: player.dog.hp, hpMax: player.dog.hpMax }
              : null}
            dogBlocked={(() => {
              const d = player?.dog;
              if (!d || d.hp <= 0) return null;
              // Benched at the base of a climb — can't follow you up.
              // OTA-917 — 'waiting_at_base' covers BOTH a climb-benched dog (player elevated)
              // AND a combat-downed dog (recovering on the ground). Only the former should read
              // as "come down to fight" — a downed dog gets its own message.
              if (d.status === 'waiting_at_base') return currentScene?.elevatedOn ? 'elevated' : 'downed';
              // At your side, but the active target flies out of reach.
              const activeEnemy = currentScene?.enemies?.[activeIdx];
              if (d.status === 'with_player' && enemyIsAerial(activeEnemy)) return 'aerial';
              return null;
            })()}
            raceAbilityReady={(() => {
              if (!player) return false;
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { availableRaceAbilities } = require('../engine/raceAbilities');
              const inCombat = (currentScene?.enemies?.length ?? 0) > 0;
              return availableRaceAbilities(player, inCombat).length > 0;
            })()}
            onOpenRaceAbilities={() => useGameStore.getState().openRaceAbilityPicker()}
            travelTargetName={(() => {
              // OTA-465 — a whisper/lead course shows in the same travel row.
              if (player?.whisperCourse && !player?.travelTarget) return player.whisperCourse.label;
              if (!player?.travelTarget) return null;
              const id = player.travelTarget.locationId;
              // OTA-507 — canon-aware name (resolves canonized places), but a HIDDEN
              // location stays "?" until the player actually arrives + discovers it.
              // Without this the travel row read "→ THE HIDDEN MARKET" while still
              // 6 moves out, spoiling the reveal.
              const real = getLocationById(id).name ?? id;
              const shown = revealedLocationName(id, real, discoveredIds);
              // arb99 — if the destination is one of the numbered "?" places, lead
              // with the same number the atlas shows so this route block matches.
              const qNum = questionMarkerNumbers(worldMemory)[id];
              return qNum ? (shown === '?' ? `${qNum}?` : `${qNum}?  ${shown}`) : shown;
            })()}
            movesLeft={(() => {
              // OTA-126 — prefer the stored distanceRemaining counter
              // (snapshotted at travel-start, decremented per step).
              // The legacy fallback recomputes Manhattan from the
              // current-location-centered map, which broke when the
              // player crossed a location boundary — the destination's
              // coords shift in the regenerated map, so the badge
              // jumped (playtester: "23 → 2 → mud flats → 26").
              // Legacy path stays as a safety net for older saves
              // that travel started before this OTA landed.
              // OTA-465 — whisper course distance = Manhattan to the tile.
              if (player?.whisperCourse && !player?.travelTarget) {
                const fx = typeof player.mapX === 'number' ? player.mapX : 0;
                const fy = typeof player.mapY === 'number' ? player.mapY : 0;
                return Math.abs(player.whisperCourse.mapX - fx) + Math.abs(player.whisperCourse.mapY - fy);
              }
              if (!player?.travelTarget) return null;
              if (typeof player.travelTarget.distanceRemaining === 'number') {
                return player.travelTarget.distanceRemaining;
              }
              // GRID-EXACT fallback (older saves whose travelTarget predates the
              // stored counter). The OLD fallback measured Manhattan on the
              // re-centered VISUAL map, which UNDERCOUNTS from an outdoor tile and
              // warps when you cross a location boundary — the "8 → 16" jump. Now it
              // measures the same install-fixed canon grid the step loop uses.
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { canonicalDistanceFromGrid, canonicalCellOf, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } = require('../engine/worldMap');
              const gx = typeof player.gridX === 'number'
                ? player.gridX
                : canonicalCellOf(player.currentLocationId).x + ((player.mapX ?? WORLD_MAP_CENTER_X) - WORLD_MAP_CENTER_X);
              const gy = typeof player.gridY === 'number'
                ? player.gridY
                : canonicalCellOf(player.currentLocationId).y + ((player.mapY ?? WORLD_MAP_CENTER_Y) - WORLD_MAP_CENTER_Y);
              return canonicalDistanceFromGrid(gx, gy, player.travelTarget.locationId);
            })()}
            onContinueTravel={() => {
              const st = useGameStore.getState();
              if (st.player?.whisperCourse && !st.player?.travelTarget) st.continueWhisperCourse();
              else st.continueTravel();
            }}
            onStopTravel={() => {
              const st = useGameStore.getState();
              if (st.player?.whisperCourse && !st.player?.travelTarget) st.stopWhisperCourse();
              else st.stopTravel();
            }}
          />
          </>
        )}
        {/* v2.4.1 (OTA 048) — bottom menu row removed. Gear icon
            moved to the top-right corner of the right column
            (above). All run-control (save & exit, copy/clear log)
            lives in the gear screen's SESSION tab now. */}
      </View>

      {/* OTA-259 / OTA-263 — CONTINUE popup between multi-stage hook
          steps. OTA-263 update: the modal now accumulates each
          stage's text in-place (stageHistory) so the player sees the
          full thread arc without fighting the scrim; LATER replaced
          with ABANDON (which marks the hook resolved — explicit
          walk-away). OTA-1007 — the terminal stage shows COMPLETE
          alone (dismissHookContinue). OTA-1027 — no follow-up popup;
          the modal's own reward strip shows the payout. */}
      <HookContinueModal
        visible={pendingHookContinue !== null}
        noun={pendingHookContinue?.noun ?? ''}
        stageHistory={pendingHookContinue?.stageHistory ?? []}
        completed={pendingHookContinue?.completed ?? false}
        onContinue={continueHook}
        onAbandon={abandonHook}
        onComplete={dismissHookContinue}
        // OTA-284 — when a vendor is in the scene (typically spawned
        // by the hook itself via spawn_vendor effect — Roadfire
        // Reclaimer is the canonical case), show the TRADE NOW button
        // so the player can act on the "tap to trade" narration.
        // Tapping it dismisses the modal (hook stays unresolved —
        // player can re-investigate the noun to resume the thread)
        // and navigates to the vendor screen.
        vendorName={currentScene?.vendor?.name}
        onTrade={
          currentScene?.vendor
            ? () => {
                dismissHookContinue();
                setScreen('vendor');
              }
            : undefined
        }
      />

      {/* arb120 — side-contract (whisper) completion popup so the payout
          doesn't scroll off behind the next narration beat. */}
      <WhisperCompleteModal
        visible={pendingWhisperComplete !== null}
        title={pendingWhisperComplete?.title ?? ''}
        lines={pendingWhisperComplete?.lines ?? []}
        rewards={pendingWhisperComplete?.rewards ?? []}
        onClose={dismissWhisperComplete}
      />

      <SearchModal
        visible={searchOpen}
        // During the investigate beat, show ONLY the demo prop (the locked
        // door) so the picker can't bury it under the room's real surfaces —
        // same confusion fix as the TAKE / SALVAGE pickers.
        chips={tutBeat === 'investigate' ? [{ noun: 'door', consumed: false }] : [
          // 'the ground' pinned at the top of the scene chip row.
          // OTA 222 — playtester wanted consistency: other consumed
          // nouns disappear from the chip list. The engine still
          // allows manual typing of "investigate the ground" to
          // gather more stock material.
          //
          // 2026-05-25 — context-aware surface chip. Always pinned at
          // the top of the Investigate row on every new location:
          //   - 'the floor' when inside a hub room (any building,
          //     regardless of material — wooden, board, stone, mud-
          //     brick). Investigate-the-floor rolls a chance pickup
          //     via the digHere floor-scavenge path.
          //   - 'the mud' when standing on a mud-tagged biome
          //     (Tartarian Outskirts, Buried Cities, etc.). Routes
          //     through digHere's normal silt-scrape path.
          //   - 'the ground' otherwise — pickup-if-you-see-it.
          // The consumed flag is keyed off the surface noun (mud /
          // ground / floor), so per-room dedup still applies.
          ...(() => {
            const noun: string = player.hubRoomId
              ? 'the floor'
              : (currentScene?.location.tags ?? []).includes('mud')
                ? 'the mud'
                : 'the ground';
            const key = noun.replace(/^the\s+/i, ''); // 'mud' / 'ground' / 'floor'
            // OTA-179 — pin chip now respects scanner gating. Pre-fix
            // the 'the mud' chip rendered as a bright-active green
            // chip even when the player had no Mud Scanner equipped —
            // tapping it produced the same Arbiter refusal every
            // time. Playtester typed `investigate the mud` 5+ times
            // in 25 seconds. Now: if searchRequirementFor matches
            // the chip's key AND the player lacks the right scanner
            // bias, the chip greys with the requirement label.
            const req = searchRequirementFor(key);
            const hasScannerForReq = req && player
              ? playerHasScannerEquipped(player, req.scannerBias)
              : false;
            let unmetRequirement = req && !hasScannerForReq ? req.shortLabel : undefined;
            // ⚠ OTA-1124 — THE PINNED CHIP NEVER GOT THE ELEVATION GATE, and it
            // is the last chip in the app that lies.
            //
            // OTA-166 greyed scene nouns while the player is climbed; OTA-953
            // took them out of the INVESTIGATE count for the same reason. Both
            // skipped THIS chip, because it is built separately a few lines up.
            // So standing on a shelf leaves every reachable noun greyed and the
            // ground / mud / floor chip alone still bright, with the chip badge
            // still reading active. Tapping it earns the engine's "You're up on
            // the {perch}. The ground is down there. Climb down to reach it."
            // every single time.
            //
            // That is the exact shape of the unconfirmed watch-list report —
            // "tap again → 2 active items" — and the detail the owner was asked
            // for was WHETHER THEY WERE CLIMBED UP. It is also what OTA-970
            // describes from the other side: "eight identical salvage attempts
            // from atop a shelf … the player retried into dead silence, which
            // reads as a hang."
            //
            // Scanner gate wins when both apply: a missing scanner is the more
            // specific thing to say, and climbing down will not fix it.
            const pinElev = currentScene?.elevatedOn;
            if (pinElev && !currentScene?.elevatedOverlayMeta && !unmetRequirement) {
              const climbed = pinElev.noun.toLowerCase();
              if (!climbed.includes(key) && !key.includes(climbed)) {
                unmetRequirement = 'climb down to reach';
              }
            }
            return [{ noun, consumed: isAmbientConsumed(key), alwaysShow: true, unmetRequirement }];
          })(),
          // OTA-257 — productively-consumed nouns now STAY VISIBLE as
          // greyed chips instead of being filtered out. Player feedback:
          // typing "investigate titan's bone marker" after the first
          // tap had already produced a contract lead, with no chip in
          // the menu to remind them they'd done it. The chip-vanish
          // pattern (here pre-OTA-257) was technically correct — the
          // engine fires a dedup refusal on the manual re-tap — but
          // gave the player no visual record of completion and let
          // them keep typing the noun by hand. New behavior:
          //   - productively-consumed → chip stays, greyed + ✓ (same
          //     visual treatment as flavor-exhausted chips since
          //     OTA-070).
          //   - flavor-exhausted → unchanged (already greyed).
          //   - when ALL chips in the modal are consumed, SearchModal
          //     auto-closes after a brief hold (see SearchModal.tsx).
          ...buildChipPool(currentScene)
            .map((n) => {
              // OTA 195 — compute per-chip requirement. Aether / pulse /
              // mud-coded nouns require the matching scanner equipped.
              // OTA-179 — was hard-coded to 'aetheric' bias, so mud and
              // pulse nouns never greyed even when the player lacked
              // the right scanner (chip stayed bright-active while the
              // engine kept refusing). Now passes req.scannerBias —
              // the same bias the engine checks at search-time — so
              // the chip-grey decision matches the engine's accept/
              // refuse decision for every scanner family.
              const req = searchRequirementFor(n);
              const hasScanner = req && player
                ? playerHasScannerEquipped(player, req.scannerBias)
                : false;
              let unmetRequirement = req && !hasScanner ? req.shortLabel : undefined;
              // OTA-166 — elevated-noun gate. Playtest log showed the
              // player climbed onto `weathered submerged library shelf`
              // and then tapped `investigate sign` / `investigate brick`
              // 9 times in 27 seconds, each producing the same "Climb
              // down to reach it" Arbiter refusal. The chips stayed
              // bright-active in the modal because the modal didn't
              // know about the elevation. Same engine gate that fires
              // the refusal (gameStore.ts:4804) — if elevated AND no
              // overlay AND the noun isn't the climbed noun itself,
              // mark it unmet so SearchModal greys it with "climb down
              // to reach" and the player learns by sight.
              const elev = currentScene?.elevatedOn;
              if (elev && !currentScene?.elevatedOverlayMeta && !unmetRequirement) {
                const climbedNoun = elev.noun.toLowerCase();
                const nLower = n.toLowerCase();
                const isClimbedNoun = nLower.includes(climbedNoun) || climbedNoun.includes(nLower);
                if (!isClimbedNoun) unmetRequirement = 'climb down to reach';
              }
              return {
                noun: n,
                // OTA-257 — chip is "consumed" (greyed) if EITHER it
                // was productively consumed (taken / salvaged with
                // loot / investigated with substantive result) OR
                // flavor-exhausted. Was just flavor-exhausted prior
                // to OTA-257; productively-consumed chips were
                // filtered out entirely (see comment above the map).
                // Fuzzy match handles substring variants ("wooden
                // bench" vs chip "bench") per OTA-070's pattern.
                consumed:
                  isFuzzyConsumed(n, productivelyConsumedSet) ||
                  isNounFlavorExhausted(n, flavorExhaustedSet) ||
                  isExhaustedHookNoun(n),
                unmetRequirement,
                // OTA-1206 — ✦ when the Aetheric Torch has flagged this noun as
                // actually worth the look (scene.arbiterEye, stamped on torch use).
                marked: (currentScene?.arbiterEye ?? []).some(
                  (m) => m.toLowerCase() === n.toLowerCase(),
                ),
              };
            }),
          // ⚠ OTA-1210 — eye nouns that are NOT ambient chips (a charged story
          // lead, most often) render as their own ✦ chips, or the torch's mark
          // is invisible in exactly the rooms that hold a lead — the owner's
          // first live session with the eye showed precisely that. Tapping one
          // fires the same `investigate <noun>` a typed engagement would.
          ...(currentScene?.arbiterEye ?? [])
            .filter((m) => !buildChipPool(currentScene).some((n) => n.toLowerCase() === m.toLowerCase()))
            .map((m) => ({
              noun: m,
              consumed:
                isFuzzyConsumed(m, productivelyConsumedSet) ||
                isNounFlavorExhausted(m, flavorExhaustedSet) ||
                isExhaustedHookNoun(m),
              marked: true,
            })),
        ]}
        onSubmit={(target) => {
          setSearchOpen(false);
          // OTA 208 — verb renamed from 'search' to 'investigate' to
          // match the new button label and the engine intent. Parser
          // VERB_SYNONYMS already routes both verbs to the same
          // 'investigate' intent, so this is cosmetic (log lines
          // read "investigate the trap" now) — no engine behavior
          // change.
          // OTA-1497 — deferred: this is the verb that raises the story-thread
          // popup, and the sheet above is still dismissing.
          submitAfterSheetSettles(`investigate ${target}`);
        }}
        // ⚠ OTA-1183 — INVESTIGATE ALL. Deliberately loops the SAME submit path a player
        // tapping each chip would take, rather than adding a bulk resolver.
        // `salvageAllAmbient` is a ~270-line aggregator built to fix SALVAGE ALL's
        // interleaved output; investigate resolves through hooks, ambient nouns, items,
        // puzzles and elevation gates, and re-implementing that ordering in bulk would be
        // a new set of failure modes for a cosmetic gain. Looping the real path cannot
        // resolve anything differently from the manual taps it replaces — which is the
        // property that matters for a completability fix.
        // ⚠⚠ OTA-1236 — THE SWEEP RUNS IN THE OWNER'S ORDER, AND IT STOPS IF A
        // FIGHT STARTS. His sentence, in order: *"investigate all skips the dead
        // ends, shows what was found on investigate or does a story hook pop-up,
        // then does the dog quest."*
        //
        // ⚠ ORDERING IS NOT COSMETIC HERE. The dog rescue SPAWNS A CAPTOR. Reached
        // mid-sweep, every remaining `investigate` lands during combat and is
        // refused — *"Not while the Reclaimer Deserter is on you."* So the loop
        // both runs the lead LAST and breaks the moment an enemy is on the board:
        // firing commands into a fight the player has not seen yet is how a sweep
        // silently eats half the room. A story hook is the milder case of the same
        // thing — it opens a popup the queued lines push out of sight.
        // ⚠⚠ OTA-1263 — ONE AT A TIME, WITH A BEAT BETWEEN. Owner, typed into the
        // game: *"I don't think investigate all should be instant, resolve them one
        // at a time when you hit it giving each maybe 2+3 seconds to see a
        // result?"* Measured from the same log, five investigates landed inside
        // FIFTY MILLISECONDS and three more inside forty — the whole sweep arrived
        // as one wall of text with no way to tell which line answered which noun.
        //
        // ⚠ THE ABORTS ARE UNCHANGED AND NOW MATTER MORE, because the sweep is
        // live for seconds instead of a single frame: it still stops the instant an
        // enemy is on the board (OTA-1236 — firing commands into a fight the player
        // has not seen yet is how a sweep eats half the room), and it now also
        // stops if the player acts, since a paced sweep must never talk over them.
        onInvestigateAll={(nouns) => {
          setSearchOpen(false);
          const ordered = orderByStoryTier(nouns, (n) => n, leadCtx);
          // ⚠ OTA-1483 — THE BUTTON KNOWS THE SWEEP IS RUNNING. The paced sweep
          // (OTA-1263) is live for ordered.length × 2.2s, and for all of it the
          // INVESTIGATE chip kept its green "ready" glow — a lit invitation to
          // tap the very control whose input stream the sweep is speaking on.
          // Owner's log: the button "stays lit during the paced stream". The
          // chip now reads "investigating…" (unlit) until the sweep ends by ANY
          // exit — finished, combat abort, or the player acting.
          setInvestigateSweepRunning(true);
          // ⚠⚠ OTA-1268 — THE SWEEP WAS ABORTING ON ITS OWN FOOTSTEPS. The 1263
          // abort compared against the stamp from BEFORE the sweep started — but
          // `submitPlayerAction` stamps `lastPlayerActionAt` on EVERY submit,
          // including the sweep's own. Step one ran, moved the stamp, and step two
          // read "the player acted" and quit: INVESTIGATE ALL resolved exactly ONE
          // noun on device and silently dropped the rest (owner, next log: "the
          // investigations... were supposed to show on the screen one at a time").
          // The watermark is now re-read AFTER each of the sweep's own submits, so
          // the only thing that can move it between steps is a real player action.
          let watermark = useGameStore.getState().lastPlayerActionAt;
          let i = 0;
          // ⚠ ONE exit door for the sweep, so no abort path can forget to unlight
          // the chip — a "running" flag that survives its run is a lit button
          // lying in the other direction.
          const endSweep = (): void => setInvestigateSweepRunning(false);
          const step = (): void => {
            if (i >= ordered.length) { endSweep(); return; }
            const s = useGameStore.getState();
            if ((s.currentScene?.enemies ?? []).length > 0) { endSweep(); return; }
            // ⚠ The player did something of their own — stop rather than queue
            // lines behind whatever they just asked for.
            if (s.lastPlayerActionAt !== watermark) { endSweep(); return; }
            submit(`investigate ${ordered[i]!}`);
            watermark = useGameStore.getState().lastPlayerActionAt;
            i += 1;
            if (i < ordered.length) setTimeout(step, INVESTIGATE_ALL_GAP_MS);
            else endSweep();
          };
          // OTA-1497 — the sweep's FIRST submit raced the sheet's dismissal
          // exactly like a manual pick; it waits out the close like one too.
          // The abort checks run inside step(), so a player acting during the
          // wait still cancels the sweep before its first line.
          setTimeout(step, SHEET_SETTLE_MS);
        }}
        leadNouns={leadNouns}
        onCancel={() => setSearchOpen(false)}
      />

      {/* OTA-1321 — first-fight primer. `enemyName` is read straight off the live
          scene so the card names the thing actually in front of the player; FIGHT
          (and Android back, and the PC right-click above) all land on the same
          latch, so there is exactly one way for this to be marked seen. */}
      <CombatPrimerModal
        visible={combatPrimerVisible}
        enemyName={currentScene?.enemies?.[0]?.name ?? null}
        onClose={markCombatPrimerSeen}
      />

      {/* ⚠⚠ OTA-1233 — ONE PICKER. TakeModal + SalvageModal were two modals over the
          SAME `displayedAmbientNouns`, each with its own consumed-predicate — the
          seam OTA-1231's bugs lived in. GatherModal shows the room once and picks
          the verb per row: catalog items TAKE, everything else SALVAGES.

          ⚠⚠ OTA-1250 — THE OUTPOST LOCKDOWN REACHES INSIDE THE MODAL. Owner, from
          a device run: *"I broke it by just grabbing stuff, you should only be able
          to do what it says, the other button touches should buzz."* OTA-1248 filled
          the tutorial picker with the whole room so the layout could be TAUGHT, and
          the lockdown that dims the quick row stopped at the modal's edge — so the
          beat that says "tap the cudgel" opened a board where every row and all
          three sweep buttons were live. He took an axe, a bow, a torch and a second
          vest, then swept six nouns of scenery, in about four taps.

          ⚠ SHOW EVERYTHING, ALLOW ONE. Hiding the rest would teach the layout by
          deleting it, which is the state OTA-1248 exists to end. `lockedNoun` dims
          the rest and buzzes on tap, exactly like the quick row. */}
      <GatherModal
        visible={takeOpen}
        player={player}
        chips={gatherChips}
        lockedNoun={tutLock ? tutorialProp : null}
        onBlocked={() => {
          try { Vibration.vibrate([0, 32, 45, 32]); } catch { /* ignore */ }
          useGameStore.getState().nudgeTutorialBlocked();
        }}
        // ⚠⚠ OTA-1238 — THE PICKER STAYS OPEN ACROSS SELECTIONS. Owner: *"the top
        // hat should stay open during all of the selections until you hit the
        // ignore button so you don't have to keep reopening it."* Every handler
        // used to close it, so clearing a five-noun room was ten taps: act, reopen,
        // act, reopen. The list is already reactive — the acted-on noun drops out
        // of `chips` on the next store tick — so the popup just had to stop
        // dismissing itself.
        //
        // ⚠ A TUTORIAL BEAT STILL CLOSES IT, and that is not an inconsistency: the
        // next beat's target is the input row or a quick button, both of which sit
        // BEHIND this modal. Leaving it open would put the pulse under the scrim
        // and stall the tutorial on turn one — the exact failure the OTA-1237 copy
        // pass was cleaning up after.
        onTake={(noun) => {
          Keyboard.dismiss();
          if (tutBeat === 'cudgel' && noun.toLowerCase() === 'cudgel') {
            setTakeOpen(false);
            submitAfterSheetSettles('take cudgel');
            return;
          }
          // ⚠⚠ OTA-1251 — THE ARMOR BEAT IS ONE TAP, IN THIS CARD. Owner: *"why are
          // we doing inventory stuff? it was supposed to highlight the fact you can
          // select and equip the vest from the popup, not from inventory."* OTA-1248
          // built the beat as take-here-then-equip-in-the-pack, which sent the
          // player out of the card the beat was teaching — and OTA-1250's lock then
          // made that dead end visible: his log shows fourteen refusals in ninety
          // seconds, the Arbiter repeating "take the vest from TAKE / SALVAGE" at a
          // player who had already taken it. The tap grants AND wears.
          if (tutBeat === 'armor' && /vest|warden/i.test(noun)) {
            setTakeOpen(false);
            // ⚠ The grant is a synchronous `set`, so the vest is in the pack by the
            // time the callback reads it — and it is checked rather than assumed,
            // because `grantTutorialItem` refuses a second grant and a full pack
            // refuses the first. equipItem advances the beat from its own top.
            // OTA-1497 — the check rides the deferred submit so it still runs
            // right after the grant, just on the far side of the dismissal.
            submitAfterSheetSettles(`take ${noun}`, () => {
              if ((useGameStore.getState().player?.inventory ?? []).some((i) => /vest/i.test(i.name))) {
                useGameStore.getState().equipItem("Mud-Warden's Vest", 'chest');
              }
            });
            return;
          }
          // ⚠⚠ AND THE SAME RULE OUTSIDE THE TUTORIAL — the ★ is not a label you go
          // and act on somewhere else. It has meant "picked and equipped at the same
          // time" since the owner first asked about the mark (OTA-1237); it just had
          // never done it. The slot comes from the same catalog lookups the mark
          // does, so a row cannot show ★ and then have nowhere to go.
          // ⚠ OTA-1500 — the screen_pick cap is a tutorial prop, not a scene
          // noun; whichever door the player takes it through (this sheet or the
          // on-screen offer), the beat's store action does the grant + wear.
          if (tutBeat === 'screen_pick' && /salvage cap/i.test(noun)) {
            setTakeOpen(false);
            useGameStore.getState().tutorialScreenPick();
            return;
          }
          // ⚠ OTA-1457 — shared with the feed chip; see `takeAndWear` above.
          takeAndWear(noun);
        }}
        onSalvage={(noun) => {
          Keyboard.dismiss();
          // Routed through the parser exactly as the old salvage picker did, so
          // the hook system and scene-noun matcher see the same input they always
          // have (OTA-117 made 'salvage' an investigate verb synonym for that).
          // OTA-1497 — when the tutorial beat closes the sheet, the submit waits
          // out the dismissal; the ordinary stays-open salvage is untouched
          // (present-over-a-PRESENTED sheet does not wedge — only mid-dismiss).
          if (tutBeat === 'scrap') {
            setTakeOpen(false);
            submitAfterSheetSettles(`salvage ${noun}`);
            return;
          }
          submit(`salvage ${noun}`);
        }}
        // ⚠⚠ OTA-1236 — the lead lane's single tap INVESTIGATES. It is the only
        // verb that fires the dog rescue or opens a story hook; taking or salvaging
        // the noun spends it and takes the next step with it.
        // ⚠⚠ THE LEAD IS THE ONE TAP THAT STILL CLOSES, ALWAYS. Investigating a
        // lead is what fires the dog rescue (a captor spawns and a fight starts) or
        // opens a story-hook popup. Neither is something to leave a loot list
        // floating over — and the OTA-1236 sweep breaks on the same condition for
        // the same reason.
        onInvestigate={(noun) => {
          Keyboard.dismiss();
          setTakeOpen(false);
          // OTA-1497 — THE FREEZE PATH, verbatim from the iPhone log: this tap is
          // the one that "opens a story hook pop-up" (the comment above always
          // said so), and it must not present that popup into a closing sheet.
          submitAfterSheetSettles(`investigate ${noun}`);
        }}
        leadNouns={leadNouns}
        // ⚠⚠ OTA-1239 — NO STEALTH TOGGLE HERE ANY MORE. Owner, for the second
        // time: *"why did you add a stealth option to it, that's not how the
        // stealth is used anymore."* PICKPOCKET owns people, the `steal` verb owns
        // things on tables and the ground, and this picker owns the open take. See
        // GatherModal's header for the full history.
        onTakeAll={(nouns) => {
          Keyboard.dismiss();
          for (const n of nouns) takeAmbientNoun(n);
        }}
        onSalvageAll={(nouns) => {
          Keyboard.dismiss();
          // The store's bulk path — which since OTA-1231 skips catalog items, so
          // this can never scrap something the player could have pocketed.
          useGameStore.getState().salvageAllAmbient(nouns);
        }}
        onCancel={() => { Keyboard.dismiss(); setTakeOpen(false); }}
      />


      {/* arb135 — Mission Board screen: open postings with tappable ACCEPT. */}
      <MissionBoardModal
        visible={missionBoardOpen}
        onClose={() => setMissionBoardOpen(false)}
      />

      <FusionPickerModal />
      <FusionBlockedModal />
      <MissionCompleteModal />
      {/* OTA-1023 — the opening crawl moved to App.tsx's GLOBAL overlay
          stack so REPLAY OPENING plays over any screen. */}

      {/* OTA-1076 — the parley chooser and the topic exchange moved out of the
          overlay stack into the controls slot below (bottom sheets, dice-
          roller pattern) at the owner's direction: the feed must stay
          readable while talking. */}
      {/* OTA-1060 — the gift picker, self-mounting off pendingGift. */}
      <GiftModal />

      {/* OTA-180 — FeedbackModal render removed alongside the 📝
          button. Component file kept for any future re-add. */}

      <ApproachModal
        visible={approachOpen}
        enemyHints={currentScene?.enemies.map((e) => e.name) ?? []}
        sceneHints={buildChipPool(currentScene)}
        vendorName={currentScene?.vendor?.name}
        onSubmit={(target) => {
          setApproachOpen(false);
          // OTA-847 (STEALTH SYSTEM) — APPROACH is now positioning only. The old
          // USE STEALTH toggle (sneak-up opener) is retired; the pre-fight sneak
          // attack migrated to the in-combat STEALTH button's first action. In
          // combat this closes the gap and switches focus to the named enemy.
          // OTA-1497 — approach is hook-eligible; same closing-sheet rule.
          submitAfterSheetSettles(`approach ${target}`);
        }}
        onCancel={() => setApproachOpen(false)}
      />

      {/* OTA-1077 — the PICKPOCKET picker moved out of the overlay stack into
          the controls slot above (bottom sheet, dice-roller pattern).
          ⚠ OTA-1239 — this comment used to say it routes to
          `stealthTakeAmbientNoun`. It does not and never did: it calls
          `pickpocketPerson`. The stale line is worth naming because it is part of
          how a duplicate stealth path stayed invisible for six OTAs. */}

      {/* OTA 046 — CLIMB picker. Pull climbables from the same scene
          noun pool the other modals read (displayedAmbientNouns →
          ambientNouns) and filter through isClimbable, then attach
          per-noun tier counts so the player sees commitment up-front
          (wall=2, tower=4, cliff=5). Also flag fully-cleared
          climbables so the chip renders dimmed with a ✓ TOP suffix
          — same room-key + marker convention the climb handler uses
          in gameStore.ts. */}
      {(() => {
        const sceneNouns = (currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? []);
        const climbables = sceneNouns.filter((n) => isClimbable(n));
        const heights = climbables.map((n) => climbHeightFor(n));
        // OTA-164 — see productivelyConsumedSet above. Same hub-key bug.
        const roomKey = makeRoomKey(
          player?.currentLocationId ?? '',
          currentScene?.microMicroId,
          player?.mapX,
          player?.mapY,
          player?.hubRoomId,
        );
        const marks = worldMemory.visitedRooms?.[roomKey]?.searchedAmbientNouns ?? [];
        const cleared = climbables.map((noun) => isClimbCleared(noun, marks));
        return (
          <ClimbModal
            visible={climbOpen}
            climbables={climbables}
            heights={heights}
            cleared={cleared}
            onSubmit={(target) => {
              setClimbOpen(false);
              // OTA-1497 — same closing-sheet rule.
              submitAfterSheetSettles(`climb ${target}`);
            }}
            onCancel={() => setClimbOpen(false)}
          />
        );
      })()}

      {/* OTA-776 — "aim the torch" lead chooser. Lists the room's open leads;
          picking one charges it with the torch (reveal + take over), and that
          lead pays an upgraded Rare/Legendary drop when the player works it. */}
      <TorchProbeModal
        visible={torchChooserOpen}
        leads={(currentScene?.hooks ?? [])
          .filter((h) => !h.resolved && (h.stage ?? 0) === 0 && !h.torchCharged)
          .map((h) => ({ id: h.id, noun: h.nouns[0] ?? h.kind }))}
        onSubmit={(hookId) => {
          setTorchChooserOpen(false);
          useGameStore.getState().applyTorchToHook(hookId);
        }}
        onCancel={() => setTorchChooserOpen(false)}
      />

      {/* 2026-05-25 — branded vendor-leave prompt. Replaces the
          native Alert.alert that broke the dark+amber palette. */}
      {/* OTA-239 — Ask the Arbiter modal. Player types a lore query;
          submit fires `ask the arbiter about <input>` through the
          parser → MiniLM cosine match against the ~408-concept lore
          bank → Arbiter dialogue line lands in the feed. */}
      <BrandedModal
        visible={askArbiterOpen}
        title="ASK THE ARBITER"
        body="What is the Aether? Who are the Reclaimers? Tell me about the Berlin Betrayal. The Arbiter keeps what they remember of the buried world."
        textInput={{
          value: askArbiterInput,
          onChangeText: setAskArbiterInput,
          placeholder: 'topic — event, place, faction, item, title…',
          // No autoFocus — the keyboard only appears when the player taps
          // the field. The modal is keyboard-avoided so the field rides
          // above the keyboard once they do.
          autoFocus: false,
        }}
        buttons={[
          {
            label: 'Cancel',
            onPress: () => { setAskArbiterOpen(false); setAskArbiterInput(''); },
            tone: 'neutral',
          },
          {
            label: 'Ask',
            onPress: () => {
              const q = askArbiterInput.trim();
              setAskArbiterOpen(false);
              setAskArbiterInput('');
              if (q) submit(`ask the arbiter about ${q}`);
            },
            tone: 'primary',
          },
        ]}
        onRequestClose={() => { setAskArbiterOpen(false); setAskArbiterInput(''); }}
      />

      {/* Door-open branch — the explore_or_leave tutorial beat. Shows once
          the door is investigated open; hidden after EXPLORE is chosen so
          the player can free-roam. Dismissing (scrim tap) defaults to the
          less-final EXPLORE choice. */}
      <BrandedModal
        visible={doorModalVisible}
        inline={Platform.OS === 'ios'}
        title="The Door Is Open"
        body="The outpost door stands open. Pick through what's left of this place, or step out and begin your journey. You can always leave later — just type 'leave outpost' or tap EXIT."
        buttons={[
          {
            label: 'Explore the Outpost',
            onPress: () => chooseTutorialExplore(),
            tone: 'neutral',
          },
          {
            label: 'Leave & Begin Journey',
            onPress: () => chooseTutorialLeave(),
            tone: 'primary',
          },
        ]}
        onRequestClose={() => chooseTutorialExplore()}
      />

      {/* arb-fix — equipped faction catalyst confirmation. When the only
          reserved faction catalyst is currently worn, the Crucible asks before
          burning it (instead of silently consuming worn gear). Confirm unequips
          it + fuses; the body warns the slot will be empty. */}
      <BrandedModal
        visible={fusionCatalystPrompt !== null}
        title="Burn your worn faction piece?"
        body={fusionCatalystPrompt
          ? `Your ${fusionCatalystPrompt.itemName} is the faction catalyst — but you're wearing it (${fusionCatalystPrompt.slotLabel}). The Crucible CONSUMES the catalyst: fuse it and it's gone, leaving your ${fusionCatalystPrompt.slotLabel.toLowerCase()} slot empty until you equip something else.${fusionCatalystPrompt.cost > 0 ? ` This vendor charges ${fusionCatalystPrompt.cost} TC to fire the Crucible.` : ''}\n\nTake it off and fuse it now?`
          : undefined}
        buttons={[
          {
            label: 'Keep wearing it',
            onPress: () => useGameStore.getState().cancelFusionCatalystPrompt(),
            tone: 'neutral',
          },
          {
            label: 'Use it & fuse',
            onPress: () => useGameStore.getState().confirmEquippedCatalystFusion(),
            tone: 'primary',
          },
        ]}
        onRequestClose={() => useGameStore.getState().cancelFusionCatalystPrompt()}
      />

      {/* OTA-439 — [audit #23] confirm before a craft consumes material
          substitutes (a misc/inferred piece standing in for a named ingredient
          via its tag), so synthesized gear isn't silently stripped. */}
      <BrandedModal
        visible={craftSubstitutionPrompt !== null}
        title="Strip these for parts?"
        body={craftSubstitutionPrompt
          ? `Crafting ${craftSubstitutionPrompt.recipeResult} will consume substitutes from your pack:\n\n${craftSubstitutionPrompt.subsList}\n\nThese stand in for the listed ingredients and will be used up. Proceed?`
          : undefined}
        buttons={[
          {
            label: 'Keep them',
            onPress: () => useGameStore.getState().cancelCraftSubstitution(),
            tone: 'neutral',
          },
          {
            label: 'Craft & strip',
            onPress: () => useGameStore.getState().confirmCraftSubstitution(),
            tone: 'primary',
          },
        ]}
        onRequestClose={() => useGameStore.getState().cancelCraftSubstitution()}
      />

      {/* arb-fix — ✦ race-ability picker. Lists the once/day race powers the
          player can use right now (off cooldown, combat-gate satisfied) with a
          button each; tapping fires the ability + closes. */}
      {(() => {
        if (!raceAbilityPickerOpen || !player) return null;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { availableRaceAbilities } = require('../engine/raceAbilities') as typeof import('../engine/raceAbilities');
        const inCombat = (currentScene?.enemies?.length ?? 0) > 0;
        const avail = availableRaceAbilities(player, inCombat);
        const close = () => useGameStore.getState().closeRaceAbilityPicker();
        return (
          <BrandedModal
            visible={true}
            title="Race Abilities"
            body={avail.length === 0
              ? 'Nothing ready right now — your race powers return after a night’s rest.'
              : avail.map((a) => `✦ ${a.name} — ${a.description}`).join('\n\n')}
            buttons={[
              ...avail.map((a) => ({
                label: a.name,
                onPress: () => useGameStore.getState().useRaceAbility(a.id),
                tone: 'primary' as const,
              })),
              { label: 'Close', onPress: close, tone: 'neutral' as const },
            ]}
            onRequestClose={close}
          />
        );
      })()}

      {/* 2026-05-25 OTA-035 — outpost-aware travel confirmation. When
          the player issues `travel to <city>` (typed or via SET COURSE)
          from inside an outpost, the modal asks if they want to leave
          first. Yes leaves + starts the course; cancel keeps them
          inside the outpost with no state change. */}
      <BrandedModal
        visible={pendingTravelConfirm !== null}
        title="Leave the outpost?"
        body={pendingTravelConfirm
          ? `To travel to ${pendingTravelConfirm.locationName}, you'll need to walk back through the gate and out into the open ground. Leave the outpost and start the course?`
          : undefined}
        buttons={[
          {
            label: 'Stay inside',
            onPress: () => cancelTravelConfirm(),
            tone: 'neutral',
          },
          {
            label: 'Leave + travel',
            onPress: () => confirmLeaveAndTravel(),
            tone: 'primary',
          },
        ]}
        onRequestClose={() => cancelTravelConfirm()}
      />

      {/* OTA-656 — stumbled-onto mission offer (Parley of Factions). Approaching
          the leaders no longer silently takes the contract; it announces the
          demands and asks. Accept commits it; Decline walks away. */}
      <BrandedModal
        visible={pendingMissionOffer !== null}
        title={pendingMissionOffer?.title ?? 'Accept this mission?'}
        body={pendingMissionOffer?.body}
        buttons={[
          {
            label: 'Decline',
            onPress: () => declineMissionOffer(),
            tone: 'neutral',
          },
          {
            label: 'Accept',
            onPress: () => acceptMissionOffer(),
            tone: 'primary',
          },
        ]}
        onRequestClose={() => declineMissionOffer()}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // OTA-841 [did-you-mean] — tappable disambiguation chip row above the input.
  didYouMeanRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingBottom: 4 },
  didYouMeanLabel: { color: '#a2977b', fontSize: 11, letterSpacing: 1, fontStyle: 'italic' },
  didYouMeanChip: { backgroundColor: '#1a1714', borderColor: '#c9a86a', borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6 },
  didYouMeanChipText: { color: '#e6d8b3', fontSize: 12, letterSpacing: 0.5 },
  // OTA-275 — tablet width cap. Phones unchanged; iPad centers at 600pt.
  container: { flex: 1, backgroundColor: 'transparent', padding: 8, gap: 6, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  // minHeight (not fixed height) — characters with multiple active
  // contracts / effects / a companion overflow 165px; the fixed height
  // clipped the bottom rows behind the scene bar. Letting the row grow
  // to fit content keeps every stat visible.
  topRow: { flexDirection: 'row', gap: 6, minHeight: 165 },
  statsCol: { flex: 1 },
  rightCol: { flex: 1, position: 'relative' },
  // OTA-852 — WORLD / LORE nav buttons bracketing the peaceful crest.
  crestNavBtn: { backgroundColor: '#1a1714', borderColor: '#c9a86a', borderWidth: 1, borderRadius: 4, paddingVertical: 5, alignItems: 'center', marginVertical: 3 },
  crestNavText: { color: '#c9a86a', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  // v2.4.1 (OTA 048) — gear icon floats over the right column
  // (EnemyPanel or CrestPlaceholder). 32×32 hit area, semi-
  // transparent backdrop so it stays legible on top of either
  // content.
  // OTA-174 — moved from top-right to bottom-right per playtest
  // ask. EnemyCard's `head` style no longer needs paddingRight
  // reservation since the gear no longer overlaps the enemy name
  // / range tag area.
  // OTA-748 — settings gear now lives in the scene bar next to MAP (sceneBarGear).
  sceneBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#13110f',
    borderColor: '#3a342c', borderWidth: 1, borderRadius: 4,
    gap: 6,
  },
  sceneText: { color: '#c9a86a', fontSize: 10, letterSpacing: 1 },
  timeText: { color: '#a2977b', fontSize: 9, letterSpacing: 1, marginTop: 1 },
  // OTA-914 — weather pops on the day line: the location line's bright gold + a bold weight,
  // instead of inheriting the faded day-counter color.
  weatherText: { color: '#c9a86a', fontWeight: '700' },
  sceneBarBtns: { flexDirection: 'row', gap: 4, flexShrink: 0 },
  sceneBtn: { color: '#cdbf99', fontSize: 16, paddingHorizontal: 8 },
  // Compact bordered chips on the scene bar — 'ACTS' opens the action
  // reference, 'QUESTS' opens the active hunts / mysteries / storylines /
  // faction quests board. Short labels keep the row from crowding the
  // location + weather text on narrow Android screens. Settings stays
  // accessible via the gear in the bottom menu row.
  sceneBarBtn: {
    backgroundColor: '#1a1612',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  sceneBarBtnBlocked: { opacity: 0.4, borderColor: '#2a2620' },
  sceneBarBtnText: { color: '#c9a86a', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  // OTA-179 — flex:1 alone wasn't shrinking the feed enough when
  // the OTA-172 combat row went 3 lines tall, so the bottom action
  // button row clipped below the safe-area bottom edge. Adding
  // flexShrink:1 + minHeight:0 is the canonical RN fix for "let
  // this flex child shrink below its content's measured size" — it
  // lets the feed compress to whatever space is left after the
  // InputBox claims its natural (taller) height. Player ask: "can
  // we have the rows put up and shrink the exploration box a touch
  // and not push the action buttons down?"
  feed: { flex: 1, flexShrink: 1, minHeight: 0 },
  streamingTail: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0e0c0a',
    borderLeftColor: '#c9a86a',
    borderLeftWidth: 2,
    marginTop: 4,
  },
  streamingPrefix: { color: '#a2977b', fontSize: 10, letterSpacing: 1, marginBottom: 2 },
  streamingText: { color: '#cdbf99', fontSize: 13, lineHeight: 18 },
  streamingCursor: { color: '#c9a86a', fontSize: 13 },
  // v2.4.1 (OTA 048) — the bottom menu row (save & exit, copy/clear
  // log, gear) was removed; gear is the cornerGear above and the
  // session controls all live in the gear screen's SESSION tab. The
  // controls block now wraps just the InputBox / DiceRoller, so the
  // feed's flex:1 naturally absorbs the reclaimed vertical real
  // estate.
  controls: { gap: 6 },
  // OTA-748 — gear sized to sit inline in the scene bar next to MAP.
  sceneBarGear: { color: '#c9a86a', fontSize: 13, lineHeight: 13, fontWeight: '700' },
  // v2.4.1 (OTA 045) — Main Quest chip + Contracts menu entry.
  // Sits above the vendor banner, below the scene bar. Now the only
  // entry to Contracts (QUESTS header button removed). Two-line
  // layout: title row (★ MAIN QUEST · prose) and a dim subtitle
  // explaining the chip also opens side quests + collectibles.
  objectiveChip: {
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
  },
  objectiveChipTitle: {
    color: '#c9a86a',
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  objectiveChipStar: {
    color: '#c9a86a',
    fontStyle: 'normal',
    fontWeight: '700',
  },
  objectiveChipLabel: {
    color: '#c9a86a',
    fontStyle: 'normal',
    fontWeight: '700',
    letterSpacing: 1,
  },
  objectiveChipSubtitle: {
    color: '#a2977b',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  // OTA-154 — row layout for the home-screen MAIN QUEST chip so a
  // SUMMON button can sit on the right edge alongside the existing
  // title + subtitle. Nested TouchableOpacity captures the tap so
  // the chip's tap-to-Contracts handler doesn't also fire.
  objectiveChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  objectiveChipBody: { flex: 1, minWidth: 0 },
  objectiveChipSummon: {
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  // OTA-1471 — a settling seat reads muted, so the chip does not look like a
  // live call to action while it is naming a wait.
  objectiveChipSummonWait: { borderColor: '#5c5343' },
  objectiveChipSummonWaitText: { color: '#8b8069' },
  objectiveChipSummonText: {
    color: '#c9a86a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  // OTA-1029 — the "what's standing here" chip system. Was four full-width,
  // two-line, 44px-tall banners stacked down the screen (trader / board /
  // wanderer / Crucible); at a capital that ate the feed. They now share one
  // wrapping row two-across: same information, ~a third of the height. Each keeps
  // its own accent colour so the family stays readable at a glance.
  placeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13110f',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    minHeight: 34,
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 150,
  },
  placeChipBody: { flex: 1, paddingHorizontal: 7, paddingVertical: 3, minWidth: 0 },
  placeChipHint: { color: '#a2977b', fontSize: 9, letterSpacing: 0.5, marginTop: 1 },
  // OTA-1024's short-of-coin amber, carried onto the chip with the fee line it
  // belongs to. It is the colour that made "you have 11" read as a WARNING and
  // not as trivia, on the exact screen where he missed it the first time.
  placeChipHintShort: { color: '#e0a75f' },
  placeChipArrow: { color: '#8a8070', fontSize: 16, paddingHorizontal: 7 },
  placeChipX: { paddingHorizontal: 9, paddingVertical: 7, alignSelf: 'center' },
  vendorChip: { borderColor: '#c9a86a' },
  missionBoardChip: { borderColor: '#8b7355' },
  wandererChip: { borderColor: '#6e8f4e' },
  fusionChip: { borderColor: '#b88ce0' },
  vendorChipX: { color: '#8a7448', fontSize: 15, fontWeight: '800' },
  vendorBannerStripe: { width: 4, backgroundColor: '#c9a86a', alignSelf: 'stretch' },
  // OTA-1059 — the TALK affordance on the vendor chip. Deliberately quieter
  // than the chip itself: trading is still the primary action at a counter.
  placeChipTalk: {
    paddingHorizontal: 8, paddingVertical: 4, marginRight: 4,
    borderWidth: 1, borderColor: '#7a6640', borderRadius: 4,
  },
  placeChipTalkText: { color: '#c9a86a', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  // OTA-1079 — unspoken-dialogue glow: the house green (#9ec96a, the wanderer/
  // social accent) on border + text while this person still has unread lines.
  placeChipTalkUnspoken: { borderColor: '#9ec96a' },
  placeChipTalkTextUnspoken: { color: '#9ec96a' },
  vendorBannerName: { color: '#c9a86a', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  // OTA-451 — Mission Board chip. Parchment/brown accent to distinguish from the
  // vendor's amber and the Crucible's purple.
  missionBoardStripe: { width: 4, backgroundColor: '#8b7355', alignSelf: 'stretch' },
  missionBoardName: { color: '#b89a6a', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  // OTA-807 — Wandering NPC banner. Soft green stripe (a friendly, social beat) to
  // set it apart from the vendor gold and mission-board brown.
  wandererStripe: { width: 4, backgroundColor: '#6e8f4e', alignSelf: 'stretch' },
  wandererName: { color: '#9ec96a', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  // OTA-217 — Crucible permit banner. Purple stripe to differentiate
  // from the vendor banner's amber, matching the OTA-199 Rare rarity
  // color so the visual signal reads "rare event, act now."
  // arb108 — positioned like the trader banner: full content width (no
  // horizontal inset) and flush under the main-quest box (no top margin), so
  // it reads as a sibling of the quest box / vendor banner rather than a
  // detached, narrower chip. Mirrors `vendorBanner`'s box model; only the
  // purple accent colour distinguishes it.
  // ⚠ OTA-1453 — STORE wears the vendor's own gold so it reads as the PRIMARY
  // action on the row, unlike the deliberately quiet TALK/GIFT beside it. Same
  // geometry as placeChipTalk (it layers on top) so the three stay aligned.
  placeChipStore: { borderColor: '#c9a86a', backgroundColor: '#2a2113' },
  placeChipStoreText: { color: '#e8c766' },
  fusionBannerStripe: { width: 4, backgroundColor: '#b88ce0', alignSelf: 'stretch' },
  fusionBannerName: { color: '#b88ce0', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  // arb152 — dismiss (✕) on the Fusing Crucible chip.
  crucibleDismissText: { color: '#8a6fa8', fontSize: 15, fontWeight: '800' },
  placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80 },
});

// Build the chip pool the search / approach modals show.
//
// Order matters: author-declared interactables (Phase 2 OTA 113) lead,
// then ONE hook noun per active hook (the primary one — the rest of a
// hook's noun list is parser-disambiguation aliases like ['draft',
// 'breeze', 'cold', 'air'] for the SAME thread-of-cold-air plant, and
// the alternates don't make good standalone chips — playtest log
// caught "cold / air / draft / breeze" leaking in as five separate
// chips and pushing the real interactables off the visible list).
//
// Returns up to 10 unique entries.
function buildChipPool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scene: any,
): string[] {
  if (!scene) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (n: string) => {
    const key = (n ?? '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(n);
  };
  // 1) Read from the per-visit cached subset (scene.displayedAmbientNouns,
  //    set once in beginScene). Stable across consecutive Search /
  //    Approach / Salvage taps in the same room — leave and come back
  //    to re-roll. Falls back to the full ambientNouns list for legacy
  //    saves predating the cache field.
  const source = scene.displayedAmbientNouns ?? scene.ambientNouns ?? [];
  for (const n of source) push(n);
  // 2) The FIRST noun from each unresolved hook. Hook nouns aren't
  //    in the cached subset (they live on scene.hooks separately),
  //    so they get added on top and don't dilute the rotation.
  for (const h of scene.hooks ?? []) {
    if (h.resolved) continue;
    const primary = h.nouns?.[0];
    if (primary) push(primary);
  }
  // arb74 — cap the Investigate chip pool at 5 (was 10; playtester had
  // "close to ten"). Ambient nouns come first, then unresolved-hook primaries,
  // so the most relevant 5 survive. The pinned surface chip (the ground/floor/
  // mud) is added separately in the render, so the row shows ~5-6 total.
  return out.slice(0, 5);
}
