import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { getNarratorName, getCrucibleName, isCrucibleEnabled, campaignTimeLimitConfig } from '../engine/contentPack';
import { hubNameForFaction } from '../engine/hub';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Pressable, Keyboard, Vibration } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGameStore, makeRoomKey } from '../state/gameStore';
import { readFullLog, flushLogWrites, clearActiveSlotLog, getLastLogWriteError, clearLastLogWriteError } from '../engine/saveSystem';
import { StatsPanel } from '../components/StatsPanel';
import { AdventureFeed } from '../components/AdventureFeed';

// engine_Dev — the "combat arena" grew the top char + enemy panels tall to fill the
// world-window (tried side-by-side AND top/bottom) and hid the feed. Per player call,
// reverted to the ORIGINAL Tartaria combat layout: the panels keep their normal
// orientation + size and DON'T move when a fight starts — the enemy card simply appears
// in the existing top-right box (replacing the crest), and the feed stays put. Left as a
// flag in case the arena is ever revisited; OFF restores the original. The enemy card is
// driven by `hasLiveEnemy` (below) so it still shows in-place during a fight regardless.
const COMBAT_ARENA_VIEW = false;

// engine_Dev — flash the just-resolved roll result in a transient popup just above the controls
// (below the action buttons). Shows the LAST roll only, holds ~2s, then fades. Set false to remove.
const ROLL_RESULT_POPUP = true;
const ROLL_POPUP_MS = 2000;
import { InputBox } from '../components/InputBox';
import { DiceRoller } from '../components/DiceRoller';
import { EnemyPanel, type EnemyView } from '../components/EnemyPanel';
import { CrestPlaceholder } from '../components/CrestPlaceholder';
import { SearchModal } from '../components/SearchModal';
import { SalvageModal, isSalvageable as isSalvageableForModal } from '../components/SalvageModal';
import { BrandedModal } from '../components/BrandedModal';
import { TakeModal } from '../components/TakeModal';
import { ClimbModal } from '../components/ClimbModal';
import { TorchProbeModal } from '../components/TorchProbeModal';
import { HookContinueModal } from '../components/HookContinueModal';
import { WhisperCompleteModal } from '../components/WhisperCompleteModal';
// OTA-180 — FeedbackModal import dropped along with the 📝 button.
// The component file stays on disk for potential re-introduction.
import { isClimbable, isSalvageable } from '../engine/interactionTags';
import { climbBlockReason } from '../engine/climbReadiness';
import { isNounConsumed } from '../engine/ambientNounMatch';
import { getLocationById } from '../engine/encounter';
import { revealedLocationName } from '../engine/hiddenLocations';
import { questionMarkerNumbers } from '../engine/questionMarkers';
import { climbHeightFor, isClimbCleared } from '../engine/climbHeight';
import { findCatalogItem } from '../engine/crafting';
import { getTutorialProps } from '../engine/tutorialProps';
import { isOversized } from '../engine/portability';
import { playerHasScannerEquipped } from '../engine/equipment';
import { searchRequirementFor, inventoryHasGate } from '../engine/itemEffect';
import { enemyIsAerial } from '../engine/enemyTraits';
import { findGearByName, findMaterialByName, findExplorationItemByName } from '../engine/crafting';
import { ApproachModal } from '../components/ApproachModal';
import { MissionBoardModal } from '../components/MissionBoardModal';
import { FusionPickerModal } from '../components/FusionPickerModal';
import { ParleyModal } from '../components/ParleyModal';
import { availableFactionQuests } from '../engine/factionQuests';
import { getStanding } from '../engine/factions';
import { TutorialTarget } from '../components/TutorialTarget';
import { TUTORIAL_STEPS } from '../components/tutorialSteps';
import { resolveDisplayWeaponByName } from '../engine/itemResolution';
import { reachClassFor } from '../engine/combatRules';
import { reachBandsFor, RANGE_LABELS } from '../engine/types';
import type { CombatRange } from '../engine/types';

function describeTime(hours: number): string {
  const day = Math.floor(hours / 24) + 1;
  const hourOfDay = Math.floor(hours % 24);
  let part: string;
  if (hourOfDay < 6) part = 'night';
  else if (hourOfDay < 12) part = 'morning';
  else if (hourOfDay < 18) part = 'afternoon';
  else part = 'evening';
  const base = `Day ${day} · ${part}`;
  // engine_Dev — campaign deadline readout. When the "time to complete the main
  // quest" timer is on, show how deep into the clock you are so the deadline is felt.
  const limit = campaignTimeLimitConfig();
  if (limit) {
    if (limit.unit === 'years') {
      const yr = Math.min(Math.floor(hours / (365 * 24)) + 1, limit.value);
      return `${base} · Year ${yr} of ${limit.value}`;
    }
    return `${base} · Day ${Math.min(day, limit.value)} of ${limit.value}`;
  }
  return base;
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
  if (hourOfDay < 18) return '#0a1012';  // afternoon — neutral (the default)
  return '#0e0b08';                       // evening — dusty rust
}

export function ExplorationScreen() {
  const player = useGameStore((s) => s.player);
  const gameLog = useGameStore((s) => s.gameLog);
  const partialArbiterText = useGameStore((s) => s.partialArbiterText);
  const isGenerating = useGameStore((s) => s.isGenerating);
  const submit = useGameStore((s) => s.submitPlayerAction);
  const setInputModalOpen = useGameStore((s) => s.setInputModalOpen);
  const setScreen = useGameStore((s) => s.setScreen);
  const currentScene = useGameStore((s) => s.currentScene);
  // OTA-507 — drives the hidden-location "?" so the travel row doesn't leak the
  // real name before arrival/discovery.
  const discoveredIds = useGameStore((s) => s.worldMemory?.discoveredLocationIds);
  // OTA-508 — the Hidden Market offers the Fuse Cauldron at every stall.
  const activeBuildingId = useGameStore((s) => s.activeBuildingId);
  const activeBuildingRoomId = useGameStore((s) => s.activeBuildingRoomId);
  // arb-fix — equipped-faction-catalyst fusion confirmation prompt.
  const fusionCatalystPrompt = useGameStore((s) => s.fusionCatalystPrompt);
  const fusionKindPrompt = useGameStore((s) => s.fusionKindPrompt);
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
  const tutLock =
    tutBeat !== null
    && ['name', 'cudgel', 'rope', 'scrap', 'climb', 'investigate', 'explore_or_leave'].includes(tutBeat)
    && !tutorialExploreChosen;
  const chooseTutorialLeave = useGameStore((s) => s.chooseTutorialLeave);
  const pendingRolls = useGameStore((s) => s.pendingRolls);
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
  // engine_Dev — transient combat-RESULT popup (above the controls). During a fight the feed is
  // hidden by the arena, so when a roll sequence resolves we surface the FINAL output line (the one
  // that would normally show in the feed) here for ~2s — NOT the dice math (the roller shows that).
  const [resultPop, setResultPop] = useState<string | null>(null);
  const rollPopupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showResult = useCallback((text: string) => {
    setResultPop(text);
    if (rollPopupTimer.current) clearTimeout(rollPopupTimer.current);
    rollPopupTimer.current = setTimeout(() => setResultPop(null), ROLL_POPUP_MS);
  }, []);
  useEffect(() => () => { if (rollPopupTimer.current) clearTimeout(rollPopupTimer.current); }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [approachOpen, setApproachOpen] = useState(false);
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
    return availableFactionQuests(
      board.faction,
      getStanding(player.factionStanding ?? [], board.faction),
      player.activeFactionQuestIds ?? [],
      player.completedFactionQuestIds ?? [],
    ).length > 0;
  }, [currentScene?.missionBoard, player]);
  // arb152 — a per-location dismiss for the Fusing Crucible chip (X on the chip).
  // Reset whenever the location or building changes (re-entering re-shows it).
  // arb-fix — the dismiss lives in the STORE (crucibleChipDismissedKey), NOT local
  // useState: entering a vendor UNMOUNTS this screen (App.tsx renders exploration vs
  // vendor by a flag), so a local flag was lost on the round-trip and the chip popped
  // back on return. Keying the stored dismiss to the view-key still auto-re-shows the
  // chip when you actually move to a different location (key mismatch).
  // arb154 — include activeBuildingRoomId: moving between ROOMS of a building
  // (market stalls etc.) changes only this, not activeBuildingId — so without it
  // a dismiss in one room stuck for the whole building ("disabled in all rooms").
  const crucibleViewKey = `${currentScene?.location.id ?? ''}|${activeBuildingId ?? ''}|${activeBuildingRoomId ?? ''}|${player?.hubRoomId ?? ''}`;
  const crucibleDismissedKey = useGameStore((s) => s.crucibleChipDismissedKey);
  const setCrucibleChipDismissedKey = useGameStore((s) => s.setCrucibleChipDismissedKey);
  const crucibleDismissed = !!crucibleDismissedKey && crucibleDismissedKey === crucibleViewKey;
  const [takeOpen, setTakeOpen] = useState(false);
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
      || climbOpen || takeOpen || doorBeatOpen;
    setInputModalOpen(anyPopupOpen);
    // iOS: a native <Modal> won't present over a live keyboard / focused
    // input, and the floating bar's autoFocus keeps re-grabbing it — so
    // explicitly drop the keyboard the moment any popup/beat opens.
    if (anyPopupOpen) Keyboard.dismiss();
  }, [searchOpen, approachOpen, askArbiterOpen, salvageOpen, climbOpen, takeOpen, doorBeatOpen, setInputModalOpen]);
  useEffect(() => () => setInputModalOpen(false), [setInputModalOpen]);
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
  // 2026-05-25 — branded vendor-leave prompt (POLISH-4). Replaces
  // the native Alert that was breaking the dark+amber palette. Holds
  // {vendorName, pendingText} so confirmation dispatches the
  // originally-typed move command.
  const [vendorLeavePrompt, setVendorLeavePrompt] = useState<
    { vendorName: string; pendingText: string } | null
  >(null);
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
  const stealthTakeAmbientNoun = useGameStore((s) => s.stealthTakeAmbientNoun);
  const worldMemory = useGameStore((s) => s.worldMemory);

  // Per-room dedup list — drives the "already taken" gating on the
  // TAKE modal chips. Two tightenings vs the first cut at this:
  //
  //   1. EXACT name match only, not bidirectional substring. The
  //      engine's substring match was greying out chips for nouns
  //      that weren't actually blocked (e.g. a save with "rope" in
  //      searchedAmbientNouns also greyed an unrelated "scrap pile"
  //      because some entries cross-matched). UI errs on the side
  //      of green; if the engine actually rejects on tap, the log
  //      line surfaces it.
  //
  //   2. Self-healing: the chip only greys when the player ACTUALLY
  //      has the catalog item for that noun in their inventory. If
  //      the dedup entry exists but the item isn't in the pack, the
  //      noun was either (a) marked consumed by the OTA<=172 salvage
  //      bug that wrote on 'nothing' outcomes, or (b) the player
  //      sold / lost the item. Either way, the chip should be
  //      re-tappable so the player isn't stuck.
  const consumedAmbientNouns = useMemo(() => {
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
    // 2026-05-25 [POLISH-3] — include flavor-exhausted nouns so the
    // Search modal chip renders greyed + sorted right after a
    // nothing-yields-from-investigate outcome too (not only after a
    // production-yielding investigate). Other verbs (take/salvage/
    // break) don't read flavorExhaustedNouns so the cross-verb chain
    // continues to work.
    return new Set([
      ...(room?.searchedAmbientNouns ?? []).map((n) => n.toLowerCase()),
      ...(room?.flavorExhaustedNouns ?? []).map((n) => n.toLowerCase()),
    ]);
  }, [
    player?.currentLocationId,
    player?.mapX,
    player?.mapY,
    currentScene?.microMicroId,
    worldMemory.visitedRooms,
  ]);

  // 2026-05-25 — split sets for cross-modal removal. The user wants
  // any noun that was PRODUCTIVELY consumed (take / salvage with
  // loot / investigate that yielded an item) to disappear from
  // every modal, including Investigate. Flavor-only investigate
  // results stay visible in Investigate (grayed + sorted right per
  // POLISH-3) because the noun is still investigable for narrative
  // re-color but shouldn't clutter the actionable list.
  const productivelyConsumedSet = useMemo(() => {
    if (!player || !currentScene) return new Set<string>();
    // OTA-164 — see consumedAmbientNouns above. Same hub-key bug.
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
    worldMemory.visitedRooms,
  ]);
  const flavorExhaustedSet = useMemo(() => {
    if (!player || !currentScene) return new Set<string>();
    // OTA-164 — see consumedAmbientNouns above. Same hub-key bug.
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
    if (!isFuzzyConsumed(noun, consumedAmbientNouns)) return false;
    if (!player) return true;
    const cat = findCatalogItem(noun);
    if (!cat) return true; // not a catalog item; honor engine dedup as-is
    const targetName = cat.name.toLowerCase();
    const owns = player.inventory.some(
      (i) => i.name.toLowerCase() === targetName && i.quantity > 0,
    );
    return owns;
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

  // Build one view per enemy in the scene. Tap-to-cycle is wired through
  // the store's setActiveEnemyIdx so combat handlers always target the
  // enemy the player is currently looking at.
  const enemyViews: EnemyView[] = useMemo(() => {
    if (!currentScene || currentScene.enemies.length === 0) return [];
    const range: CombatRange = currentScene.range ?? 'mid';
    const rangeLabel = RANGE_LABELS[range];
    const mainName = player?.equipped?.main ?? player?.equipped?.weaponName;
    // OTA-227 — resolveDisplayWeaponByName so fused weapons (catalog-
    // absent, uniqueStats-bearing) get their actual weaponKind instead
    // of barehand-only fallback. Resonant Edge (aetheric → runecaster)
    // now reports in-range at close, not just arm's reach.
    // OTA-550 — four-band reach via the shared resolver (ranged/throwable/
    // long/melee). A throwable inventory item reaches from 'far' inward.
    const w = mainName ? resolveDisplayWeaponByName(mainName, player?.inventory ?? []) : null;
    const throwInst = mainName
      ? (player?.inventory ?? []).find((it) => it.name.toLowerCase() === mainName.toLowerCase() && (it.tags ?? []).some((t) => /throwable/i.test(t)))
      : undefined;
    let canHit: boolean;
    if (throwInst) {
      canHit = reachBandsFor('throwable').includes(range);
    } else if (!w) {
      canHit = reachBandsFor('barehanded').includes(range);
    } else {
      const cls = reachClassFor({ weaponKind: w.weaponKind, name: w.name, tags: w.tags });
      let bands = reachBandsFor(cls);
      if (cls === 'runecaster' && (player?.stats?.intelligence ?? 0) < 9) bands = reachBandsFor('throwable');
      canHit = bands.includes(range);
    }
    return currentScene.enemies.map((e, i) => ({
      enemy: e,
      currentHp: currentScene.enemyHps[i] ?? e.hp,
      rangeLabel,
      inRange: canHit,
      // OTA-401 — surface active coating/DOT statuses + turns left on the panel.
      statuses: currentScene.enemyStatuses?.[i] ?? [],
    }));
  }, [
    currentScene?.enemies, currentScene?.enemyHps, currentScene?.range,
    currentScene?.enemyStatuses,
    player?.equipped?.main, player?.equipped?.weaponName, player?.stats?.intelligence,
    player?.inventory,
  ]);
  const activeIdx = Math.min(currentScene?.activeEnemyIdx ?? 0, Math.max(0, enemyViews.length - 1));

  const inCombat = enemyViews.length > 0;
  // engine_Dev — the ARENA layout (tall char | enemy split, hidden feed) must track a
  // LIVE threat, not mere enemy presence. Once the last foe is dead or knocked out the
  // fight is effectively over, so the screen has to collapse back to the peaceful layout
  // even though a KO'd body lingers in the scene to be looted — otherwise the character
  // box stays stretched full-height after you "complete" the combat. `inCombat` still
  // drives the controls + enemy panel so the "loot" button and the downed foe stay shown.
  // engine_Dev — read the LIVE hp array directly (missing entry => 0 => resolved),
  // not enemyViews' `?? e.hp` display fallback. A scene that ends up with an enemy
  // whose hp entry is missing/cleared used to read as full-HP through that fallback,
  // pinning arenaActive true so the arena never collapsed and the enemy box never
  // reverted to the crest. Treating a missing entry as 0 makes the collapse
  // deterministic the moment the last real threat is gone.
  // A real threat is on the board (living, not knocked out). Drives the in-place
  // enemy card in the top-right box: it shows while the fight is live and reverts to
  // the crest the moment the last foe is down/KO'd — exactly the original behavior,
  // independent of the (now-off) arena reorganization.
  const hasLiveEnemy = !!currentScene && currentScene.enemies.some(
    (_e, i) => (currentScene.enemyHps[i] ?? 0) > 0 && currentScene.enemyKnockedOut?.[i] !== true,
  );
  const arenaActive = COMBAT_ARENA_VIEW && hasLiveEnemy;
  // engine_Dev — when a roll sequence finishes resolving (pendingRolls goes null) during combat,
  // surface the FINAL output line in the result popup (the feed is hidden behind the arena). Only
  // the latest log line, only in combat, only once per sequence — no per-step dice-math duplication.
  const prevPendingRef = useRef(pendingRolls);
  useEffect(() => {
    const was = prevPendingRef.current;
    prevPendingRef.current = pendingRolls;
    if (ROLL_RESULT_POPUP && was && !pendingRolls && inCombat) {
      const last = gameLog[gameLog.length - 1];
      if (last?.text) showResult(last.text);
    }
  }, [pendingRolls, gameLog, inCombat, showResult]);
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
      <View style={[styles.topRow, arenaActive && styles.topRowCombat]}>
        <TutorialTarget area="top-left-stats" style={[styles.statsCol, arenaActive && styles.combatColEqual]}>
          {/* OTA 040 — tap the stats panel to open the full Player
              Sheet. Wrapped INSIDE the TutorialTarget so the overlay
              still measures the same layout box. */}
          <TouchableOpacity
            // In combat the panel shows lean vitals + the escort party, not the
            // full sheet — so tapping it to open the character screen is disabled
            // until the fight is over (it stays a live, glanceable combat readout).
            onPress={() => { if (!arenaActive) setScreen('character'); }}
            activeOpacity={arenaActive ? 1 : 0.75}
            disabled={arenaActive}
            style={arenaActive ? styles.combatColFill : undefined}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && Math.abs(h - statsColH) > 0.5) setStatsColH(h);
            }}
          >
            <StatsPanel player={player} fill={arenaActive} />
          </TouchableOpacity>
        </TutorialTarget>
        <TutorialTarget area="top-right-enemy" style={styles.rightCol}>
          {hasLiveEnemy ? (
            <EnemyPanel
              enemies={enemyViews}
              activeIndex={activeIdx}
              onSelectActive={setActiveEnemyIdx}
              maxHeight={statsColH}
              fill={arenaActive}
              playerWisdom={player?.stats?.wisdom}
              enemyIntel={worldMemory?.enemyIntel}
            />
          ) : (
            // Once the fight is over (last foe dead or knocked out) the top-right
            // reverts to the crest, exactly as it was before combat — the KO'd body
            // is still lootable via the "loot" button in the input row.
            <CrestPlaceholder />
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
              ? `${currentScene.transitArea ?? currentScene.location.name} · ${dangerLabel(currentScene.location.danger)}${currentScene.weather ? `  /  ${currentScene.weather.name}` : ''}${currentScene.hazard ? `  /  ${currentScene.hazard.name}` : ''}`
              : 'No scene'}
          </Text>
          <Text style={styles.timeText} numberOfLines={1}>
            {describeTime(player.hoursElapsed ?? 0)}
          </Text>
        </View>
        <View style={styles.sceneBarBtns}>
          {/* arb99 — ACTIONS removed (player never used it) and MAP moved
              here so the map is always one tap away. Inside an outpost the
              Map screen shows your outpost interior; out in the world it
              shows the world atlas. */}
          <TouchableOpacity
            onPress={() => {
              if (tutLock) {
                // arb109 — double-pulse "wrong" buzz + Arbiter nudge (the old
                // single 30ms tap was easy to miss and said nothing).
                try { Vibration.vibrate([0, 32, 45, 32]); } catch { /* ignore */ }
                useGameStore.getState().nudgeTutorialBlocked();
                return;
              }
              setScreen('map');
            }}
            hitSlop={8}
            style={[styles.sceneBarBtn, tutLock && styles.sceneBarBtnBlocked]}
          >
            <Text style={styles.sceneBarBtnText}>MAP</Text>
          </TouchableOpacity>
          {/* OTA-748 — settings gear, relocated here from the enemy card. */}
          <TouchableOpacity
            onPress={() => setScreen('about')}
            hitSlop={8}
            style={styles.sceneBarBtn}
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
        // engine_Dev — the always-on MAIN QUEST objective chip was removed to reclaim
        // exploration-feed space (escortee rows + the chip were squeezing the feed).
        // The storyline objective now lives in the mission board, reached via the
        // amber ALL MISSIONS quick button. What stays here is a CONDITIONAL ★ SUMMON
        // button: shown only while standing at the active kill-step boss's location
        // with no copy already in the scene (re-engages it after a death-revive /
        // scene rebuild). Nothing renders the rest of the time, so the row is free.
        if (!player || arenaActive) return null;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { liveMainQuest } = require('../engine/customMainQuest');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { questIsComplete, questBossAt } = require('../engine/customMainQuestEngine');
        const customQ = liveMainQuest();
        if (!customQ) return null;
        const complete = questIsComplete(player);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { WORLD_MAP_CENTER_X: scx, WORLD_MAP_CENTER_Y: scy } = require('../engine/worldMap');
        const stationedHere = !player.travelTarget
          && (player.hubRoomId != null || (player.mapX === scx && player.mapY === scy));
        const bossHere = !complete && stationedHere ? questBossAt(player, player.currentLocationId) : null;
        const bossInScene = !!bossHere && (currentScene?.enemies ?? []).some(
          (e: { name: string }) => e.name.trim().toLowerCase() === bossHere.name.trim().toLowerCase(),
        );
        if (!bossHere || bossInScene) return null;
        return (
          <TouchableOpacity
            style={[styles.objectiveChipSummon, { alignSelf: 'flex-start', marginBottom: 4 }]}
            onPress={() => useGameStore.getState().summonMainQuestBoss()}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Text style={styles.objectiveChipSummonText}>★ SUMMON {String(bossHere.name).toUpperCase()}</Text>
          </TouchableOpacity>
        );
      })()}

      {/* arb166 — no trading mid-fight. The vendor stays in the scene (the
          banner returns once the enemies are down), but while a hostile is
          present the banner is hidden so the player can't step into the stall
          during combat ("I just entered a vendors stall during combat"). */}
      {/* OTA-775 — suppress the top "approach vendor" banner while inside a
          building; the stall's own Trade + Crucible render inside the room. */}
      {currentScene?.vendor && !inCombat && !activeBuildingId && currentScene?.location?.id !== 'hidden_market' && (
        <TouchableOpacity
          style={styles.vendorBanner}
          onPress={() => setScreen('vendor')}
          activeOpacity={0.7}
        >
          <View style={styles.vendorBannerStripe} />
          <View style={styles.vendorBannerBody}>
            <Text style={styles.vendorBannerName}>{currentScene.vendor.name}</Text>
            <Text style={styles.vendorBannerHint}>tap to approach · {currentScene.vendor.offers.length} offers</Text>
          </View>
          <Text style={styles.vendorBannerArrow}>›</Text>
          {/* engine_Dev — dismiss the vendor right from the chip (like the Crucible
              chip's ✕), instead of opening the stall just to tap DISMISS. The vendor
              leaves the scene; a new one comes from the next vendor who shows up.
              Nested touchable handles its own tap, so it doesn't open the stall. */}
          <TouchableOpacity
            style={styles.crucibleDismiss}
            onPress={() => useGameStore.getState().dismissVendor()}
            hitSlop={10}
            activeOpacity={0.7}
          >
            <Text style={styles.crucibleDismissText}>✕</Text>
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
          style={styles.missionBoardBanner}
          onPress={() => setMissionBoardOpen(true)}
          activeOpacity={0.7}
        >
          <View style={styles.missionBoardStripe} />
          <View style={styles.vendorBannerBody}>
            <Text style={styles.missionBoardName}>⚑ MISSION BOARD</Text>
            <Text style={styles.vendorBannerHint}>tap to view &amp; accept postings</Text>
          </View>
          <Text style={styles.missionBoardArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* OTA-1092 — Wandering NPC chip. A person (not a vendor) resting on a peaceful
          outdoor tile. Tapping submits "talk to <name>" so it routes through the
          engine's wanderer talk-check (a d20 + CHA read for a tip / coins / a rare
          standing nudge). Hidden in combat. */}
      {currentScene?.wanderer && !inCombat && (
        <TouchableOpacity
          style={styles.wandererBanner}
          onPress={() => submit(`talk to ${currentScene.wanderer!.name}`)}
          activeOpacity={0.7}
        >
          <View style={styles.wandererStripe} />
          <View style={styles.vendorBannerBody}>
            <Text style={styles.wandererName}>☺ {currentScene.wanderer.name}</Text>
            <Text style={styles.vendorBannerHint}>{currentScene.wanderer.role} · tap to speak</Text>
          </View>
          <Text style={styles.wandererArrow}>›</Text>
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
        if (!isCrucibleEnabled() || crucibleDismissed || !player) return null;
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
        // arb-fix (player) — a VENDOR's portable Crucible is offered from INSIDE the
        // vendor screen (its own fuse chip). On a roadside-vendor tile the old OTA-1045
        // exploration chip DUPLICATED that offer (chip on the tile + fuse chip in the
        // vendor). So the tile chip now shows ONLY for a location's OWN Crucible; a
        // vendor-carried Crucible lives solely in the vendor screen. No Crucible is
        // stranded — the vendor screen still fires useVendorCrucible for 25 TC.
        if (!atLocationCrucible) return null;
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
        // A location forge is free via 'fuse' (a vendor's paid Crucible lives in the
        // vendor screen now).
        const fireCrucible = () => useGameStore.getState().submitPlayerAction('fuse');
        const readyName = `★★ ${getCrucibleName()} ready`;
        const readyHint = 'tap to fuse · spends your ♥ reserved items';
        return (
        <TouchableOpacity
          style={styles.fusionBanner}
          onPress={fireCrucible}
          activeOpacity={0.7}
        >
          <View style={styles.fusionBannerStripe} />
          <View style={styles.vendorBannerBody}>
            <Text style={styles.fusionBannerName}>
              {gate.ok ? readyName : `★★ ${getCrucibleName()} · needs prep`}
            </Text>
            <Text style={styles.vendorBannerHint}>
              {gate.ok
                ? readyHint
                : (gate.reason ?? 'tap for details')}
            </Text>
          </View>
          {/* arb152 — dismiss the Crucible chip for this visit if you don't need
              it. Nested touchable handles its own tap (doesn't fire the fuse);
              'fuse' can still be typed, and re-entering re-shows the chip. */}
          <TouchableOpacity
            style={styles.crucibleDismiss}
            onPress={() => setCrucibleChipDismissedKey(crucibleViewKey)}
            hitSlop={10}
            activeOpacity={0.7}
          >
            <Text style={styles.crucibleDismissText}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
        );
      })()}

      {/* OTA-777 — the torch is a small quick-use button in the bottom action
          row (see InputBox `torch` QuickBtn), NOT a top banner. */}

      {/* engine_Dev — during the combat arena, the tall char|enemy topRow takes the world-window,
          so the feed hides; otherwise the normal scrolling feed shows. Keyed on a live threat
          (arenaActive), so once the last foe is down the feed returns even if a KO'd body lingers. */}
      {!arenaActive && (
      <TutorialTarget area="feed" style={styles.feed}>
        <AdventureFeed entries={gameLog} enemyNames={currentScene?.enemies.map((e) => e.name)} />
        {isGenerating && (partialArbiterText || partialArbiterText === '') && (
          <View style={styles.streamingTail}>
            <Text style={styles.streamingPrefix}>The {getNarratorName()}:</Text>
            <Text style={styles.streamingText}>
              {partialArbiterText}
              <Text style={styles.streamingCursor}>▍</Text>
            </Text>
          </View>
        )}
      </TutorialTarget>
      )}

      {/* engine_Dev — transient combat-RESULT popup: above the controls, below the action buttons.
          Shows the FINAL output line once a roll sequence resolves (the feed is hidden in combat),
          holds ~2s, then clears. Not the dice math — the roller shows that. */}
      {ROLL_RESULT_POPUP && resultPop && (
        <View style={[styles.rollPopup, styles.rollPopupNeutral]} pointerEvents="none">
          <Text style={styles.rollPopupText} numberOfLines={3}>{resultPop}</Text>
        </View>
      )}

      <View style={styles.controls}>
        {pendingRolls ? (
          <DiceRoller
            state={pendingRolls}
            onRoll={resolveRollStep}
            onCancel={cancelPendingRolls}
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
                >
                  <Text style={styles.didYouMeanChipText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <InputBox
            onSubmit={(text) => {
              // 2026-05-25 [POLISH-4] — warn before leaving a vendor.
              // When a cardinal direction or 'continue travel' submit
              // comes through while a vendor banner is on the scene,
              // prompt the player "leave [vendor]?" before actually
              // moving. Yes → submit (stepDirection clears vendor on
              // next-tile move); No → cancel the move, vendor stays
              // visible. Typed direction commands ("n", "go north")
              // are caught by the regex too. Anti-nag toggle is a
              // follow-up (file as ANTINAG-1).
              const vendor = currentScene?.vendor;
              const isMove = /^(go\s+|head\s+|walk\s+|move\s+)?(north|south|east|west|northeast|northwest|southeast|southwest|n|s|e|w|ne|nw|se|sw|continue|continue travel|onward)$/i.test(text.trim());
              if (vendor && isMove) {
                // 2026-05-25 — branded modal (BrandedModal below)
                // replaces the OS Alert. Same yes/no/dismiss shape;
                // matches the rest of the game's popup palette.
                setVendorLeavePrompt({ vendorName: vendor.name, pendingText: text });
                return;
              }
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
              const enemies = currentScene?.enemies ?? [];
              if (enemies.length === 1 && enemies[0]) {
                submit(`approach ${enemies[0].name}`);
                return;
              }
              setApproachOpen(true);
            }}
            onOpenAskArbiter={() => setAskArbiterOpen(true)}
            onOpenMissions={() => { useGameStore.getState().maybeAdvanceTutorial('main_quest'); setScreen('contracts'); }}
            onOpenSalvage={() => { Keyboard.dismiss(); setSalvageOpen(true); }}
            onOpenTake={() => { Keyboard.dismiss(); setTakeOpen(true); }}
            onOpenClimb={() => setClimbOpen(true)}
            onFuse={activeBuildingId === 'market' ? () => useGameStore.getState().submitPlayerAction('fuse') : undefined}
            hasTorch={!!(player?.inventory ?? []).find((i) => /torch|lantern|lamp/i.test(i.name) && (i.tags ?? []).includes('light') && i.quantity > 0)}
            torchLabel={(player?.inventory ?? []).find((i) => /torch|lantern|lamp/i.test(i.name) && (i.tags ?? []).includes('light') && i.quantity > 0)?.name?.toLowerCase()}
            torchReady={(currentScene?.hooks ?? []).some((h) => !h.resolved && (h.stage ?? 0) === 0 && !h.torchCharged)}
            onOpenTorch={() => {
              const torch = (player?.inventory ?? []).find((i) => /torch|lantern|lamp/i.test(i.name) && (i.tags ?? []).includes('light') && i.quantity > 0);
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
            onOpenMap={() => setScreen('map')}
            inCombat={inCombat}
            equippedMain={equippedMain}
            equippedOff={equippedOff}
            equippedMainCoating={equippedMainCoating}
            equippedOffCoating={equippedOffCoating}
            inventory={player?.inventory ?? []}
            range={currentScene?.range ?? null}
            knockedOutPresent={(currentScene?.enemyKnockedOut ?? []).some(Boolean)}
            takeableCount={(() => {
              // 2026-05-25 [UI-2] — green tone fires only when the
              // count of nouns the TakeModal will ACTUALLY render is
              // > 0. Mirror TakeModal's filter chain exactly:
              //   1. Scene noun has a catalog item (findCatalogItem
              //      !== null) — otherwise the take verb refuses.
              //   2. Not oversized (small enough to carry).
              //   3. Not already consumed (consumed chips are
              //      filtered out inside TakeModal:150-152).
              // First version of this count was too lenient (just
              // "not climbable AND not salvageable") and lit the
              // button green when the modal would open empty.
              const sceneNouns = currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? [];
              return sceneNouns.filter(
                (n) => findCatalogItem(n) !== null
                  && !isOversized(n)
                  && !isAmbientConsumed(n),
              ).length + (tutBeat === 'cudgel' ? 1 : 0); // tutorial cudgel prop
            })()}
            salvageableCount={(() => {
              // 2026-05-25 — count predicate now uses SalvageModal's
              // exported isSalvageable (= SALVAGE_PATTERN regex OR
              // isCuratedSalvageable). Previously used
              // interactionTags.isSalvageable, which diverged in both
              // directions and lit SALVAGE green when modal was empty
              // (and vice versa).
              // OTA-753 — read displayedAmbientNouns directly (like TAKE),
              // NOT buildChipPool. buildChipPool re-slices to 5 for the
              // investigate row, which dropped reserved salvage nouns off
              // the end and left this count (and the SALVAGE modal) empty.
              const salvSource = currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? [];
              return salvSource.filter(
                (n) => !isAmbientConsumed(n) && isSalvageableForModal(n),
              ).length + (tutBeat === 'scrap' ? 1 : 0); // tutorial chest-plate prop
            })()}
            climbableCount={(() => {
              // 2026-05-25 — green tone for CLIMB when the scene has at
              // least one climbable noun the modal will render AND it's
              // not fully cleared (top-tier reached, marked with
              // 'climbed:noun:t{maxTier}' in searchedAmbientNouns).
              // Previously we counted every isClimbable noun without
              // subtracting cleared ones, leaving the button green
              // after the player had topped everything in the scene.
              const sceneNouns = currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? [];
              // OTA-164 — see consumedAmbientNouns above. Same hub-key bug.
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
                  if (isFuzzyConsumed(n, flavorExhaustedSet)) return false;
                  const req = searchRequirementFor(n);
                  if (req && player && !playerHasScannerEquipped(player, req.scannerBias)) {
                    return false;
                  }
                  // OTA — elevation gate, mirroring the SearchModal chip logic
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
                  if (surfaceUnlocked) groundCount = 1;
                }
              }
              return sceneCount + groundCount + (tutBeat === 'investigate' ? 1 : 0); // tutorial door prop
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
              )
                // engine_Dev — also count an item whose own tags mark it as rope/
                // climbing gear (the generic tutorial/synth "Climbing Rope" isn't a
                // catalog row), so the CLIMB button isn't falsely reddened.
                || player.inventory.some(
                  (i) => i.quantity > 0 && (i.tags ?? []).some((t) => /\b(rope|climb)\b/i.test(String(t))),
                );
              const hasReclaimersRope = player.inventory.some(
                (i) => i.name === "Reclaimer's Rope" && i.quantity > 0,
              );
              const wearsClimbStrap = (player.equipped?.cloak ?? '').toLowerCase() === 'hardened climbing strap';
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
            golem={player?.sidekick ? {
              name: player.sidekick.name,
              hp: player.sidekick.hp,
              hpMax: player.sidekick.hpMax,
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
              if (d.status === 'waiting_at_base') return 'elevated';
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
          walk-away); CLOSE shown when the terminal stage fires
          (completed: true). */}
      <HookContinueModal
        visible={pendingHookContinue !== null}
        noun={pendingHookContinue?.noun ?? ''}
        stageHistory={pendingHookContinue?.stageHistory ?? []}
        completed={pendingHookContinue?.completed ?? false}
        onContinue={continueHook}
        onAbandon={abandonHook}
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
            const unmetRequirement = req && !hasScannerForReq ? req.shortLabel : undefined;
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
                  isFuzzyConsumed(n, flavorExhaustedSet),
                unmetRequirement,
              };
            }),
        ]}
        onSubmit={(target) => {
          setSearchOpen(false);
          // OTA 208 — verb renamed from 'search' to 'investigate' to
          // match the new button label and the engine intent. Parser
          // VERB_SYNONYMS already routes both verbs to the same
          // 'investigate' intent, so this is cosmetic (log lines
          // read "investigate the trap" now) — no engine behavior
          // change.
          submit(`investigate ${target}`);
        }}
        onCancel={() => setSearchOpen(false)}
      />

      <TakeModal
        visible={takeOpen}
        // During the cudgel beat, show ONLY the demo prop. Playtest: the
        // cudgel was appended after the room's real takeable nouns, so the
        // picker offered actual items first and the player took the wrong
        // things ("neither of those are the cudgel"). The guided beat must
        // present the prop alone; the normal scene nouns return after.
        takeable={
          tutBeat === 'cudgel'
            ? [{ noun: getTutorialProps().weapon, consumed: false }]
            : (currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? [])
                .filter((n) => findCatalogItem(n) !== null && !isOversized(n))
                .map((n) => ({ noun: n, consumed: isAmbientConsumed(n) }))
        }
        onTake={(noun) => {
          // Dismiss the keyboard as the modal closes so RN can't restore
          // focus to the underlying command field and re-raise it.
          Keyboard.dismiss();
          setTakeOpen(false);
          if (tutBeat === 'cudgel') {
            // The cudgel beat only offers the resolved tutorial weapon; any tap
            // here is THAT take (the gameStore beat grants the resolved weapon).
            submit(`take ${noun}`);
            return;
          }
          takeAmbientNoun(noun);
        }}
        onStealthTake={(noun) => {
          Keyboard.dismiss();
          setTakeOpen(false);
          stealthTakeAmbientNoun(noun);
        }}
        onTakeAll={(nouns) => {
          // OTA 222 — fire each take in sequence then close. Each
          // takeAmbientNoun call runs through the same gating
          // (already-taken dedup, inventory cap, etc.) that an
          // individual chip tap would, so partial success is
          // handled per-item by the store.
          Keyboard.dismiss();
          setTakeOpen(false);
          for (const n of nouns) takeAmbientNoun(n);
        }}
        onCancel={() => { Keyboard.dismiss(); setTakeOpen(false); }}
      />

      <SalvageModal
        visible={salvageOpen}
        // engine_Dev — during the scrap beat the demo armor prop is resolved from
        // the author's own armor table; bypass the Tartaria-tuned isSalvageable
        // name filter so a custom armor name (e.g. "Flak Vest") still shows.
        // Otherwise the picker counted the prop but rendered empty.
        bypassFilter={tutBeat === 'scrap'}
        // During the scrap beat, show ONLY the demo prop (the broken chest
        // plate) so the picker can't surface the room's real salvageables —
        // same confusion fix as the TAKE picker above.
        chips={
          tutBeat === 'scrap'
            ? [{ noun: getTutorialProps().armor, consumed: false }]
            : (currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? []).map((n) => ({
                noun: n,
                // OTA-167 — salvage chip greys on the engine's per-room
                // consumed state directly (searched + flavor-exhausted),
                // NOT isAmbientConsumed's self-heal, which fuzzy-matched
                // catalog items the player didn't own and kept chips lit.
                consumed: isFuzzyConsumed(n, consumedAmbientNouns),
              }))
        }
        onSubmit={(target) => {
          setSalvageOpen(false);
          // Submit raw target — the modal's chip text already includes
          // a definite article when appropriate ("the construct"), and
          // typed text is passed through verbatim. The investigate
          // intent picks up 'salvage' as a verb synonym (OTA 140) and
          // routes through the hook system + scene-noun matcher.
          submit(`salvage ${target}`);
        }}
        onSalvageAll={(nouns) => {
          // 2026-05-25 — route through the bulk salvageAllAmbient
          // action so all narration lines fire FIRST (one per noun
          // in tap order) and the aggregated haul prints as the
          // last block. Per playtester: "hit salvage all, it shows
          // the text for every salvage task and then what was
          // recovered if anything, and then shows the next ... it
          // should print all the item.salvage text in a row, and
          // then everything you found together after all of the
          // texts print." Previously this loop submit()'d each
          // noun individually, which interleaved text + reward
          // pairs.
          setSalvageOpen(false);
          useGameStore.getState().salvageAllAmbient(nouns);
        }}
        onCancel={() => setSalvageOpen(false)}
      />

      {/* arb135 — Mission Board screen: open postings with tappable ACCEPT. */}
      <MissionBoardModal
        visible={missionBoardOpen}
        onClose={() => setMissionBoardOpen(false)}
      />

      <FusionPickerModal />

      {/* OTA-1093 — the two-button parley chooser (self-mounts off pendingParley). */}
      <ParleyModal />

      {/* OTA-180 — FeedbackModal render removed alongside the 📝
          button. Component file kept for any future re-add. */}

      <ApproachModal
        visible={approachOpen}
        enemyHints={currentScene?.enemies.map((e) => e.name) ?? []}
        sceneHints={buildChipPool(currentScene)}
        vendorName={currentScene?.vendor?.name}
        onSubmit={(target, useStealth) => {
          setApproachOpen(false);
          // Stealth-on routes through the stealth intent (sneak verb
          // → DEX skill check). Stealth-off routes through the
          // approach/advance verb chain — in combat that closes the
          // gap and switches focus to the named enemy; out of combat
          // it runs the intra-scene move-toward narration.
          if (useStealth) {
            submit(`sneak up on ${target}`);
          } else {
            submit(`approach ${target}`);
          }
        }}
        onCancel={() => setApproachOpen(false)}
      />

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
        // OTA-164 — see consumedAmbientNouns above. Same hub-key bug.
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
              submit(`climb ${target}`);
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
        title={`ASK THE ${getNarratorName().toUpperCase()}`}
        body={`What is the Aether? Who are the Reclaimers? Tell me about the Berlin Betrayal. The ${getNarratorName()} keeps what they remember of the buried world.`}
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
        body={`The door of ${hubNameForFaction(player?.factionId)} stands open. Pick through what's left of this place, or step out and begin your journey. You can always come back later — just tap EXIT to step outside.`}
        buttons={[
          {
            label: 'Stay & Explore',
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

      <BrandedModal
        visible={vendorLeavePrompt !== null}
        title="Vendor present"
        body={vendorLeavePrompt
          ? `${vendorLeavePrompt.vendorName} is still set up here. Leave them behind and move on?`
          : undefined}
        buttons={[
          {
            label: 'Stay',
            onPress: () => setVendorLeavePrompt(null),
            tone: 'neutral',
          },
          {
            label: 'Move on',
            onPress: () => {
              const text = vendorLeavePrompt?.pendingText ?? '';
              setVendorLeavePrompt(null);
              if (text) submit(text);
            },
            tone: 'primary',
          },
        ]}
        onRequestClose={() => setVendorLeavePrompt(null)}
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

      {/* engine_Dev — once a fusion passes every gate, ask the player what the
          Crucible should forge: a weapon or a piece of armor. Each button forges
          that kind; cancel leaves the inputs reserved so they can fire again. */}
      <BrandedModal
        visible={fusionKindPrompt}
        title="What should the Crucible forge?"
        body={'Your reserved pieces are ready. Choose what comes out of the Crucible — a weapon or a piece of armor.'}
        buttons={[
          {
            label: 'Weapon',
            onPress: () => useGameStore.getState().chooseFusionKind('weapon'),
            tone: 'primary',
          },
          {
            label: 'Armor',
            onPress: () => useGameStore.getState().chooseFusionKind('armor'),
            tone: 'primary',
          },
          {
            label: 'Not yet',
            onPress: () => useGameStore.getState().cancelFusionKindPrompt(),
            tone: 'neutral',
          },
        ]}
        onRequestClose={() => useGameStore.getState().cancelFusionKindPrompt()}
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

      {/* OTA-963 — stumbled-onto mission offer (Parley of Factions). Approaching
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
  didYouMeanLabel: { color: '#7a705c', fontSize: 11, letterSpacing: 1, fontStyle: 'italic' },
  didYouMeanChip: { backgroundColor: '#1a1714', borderColor: '#c9a86a', borderWidth: 1, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 6 },
  didYouMeanChipText: { color: '#e6d8b3', fontSize: 12, letterSpacing: 0.5 },
  // OTA-275 — tablet width cap. Phones unchanged; iPad centers at 600pt.
  container: { flex: 1, backgroundColor: 'transparent', padding: 8, gap: 6, width: '100%', maxWidth: 600, alignSelf: 'center' },
  // minHeight (not fixed height) — characters with multiple active
  // contracts / effects / a companion overflow 165px; the fixed height
  // clipped the bottom rows behind the scene bar. Letting the row grow
  // to fit content keeps every stat visible.
  topRow: { flexDirection: 'row', gap: 6, minHeight: 165 },
  // engine_Dev — combat arena: the top row fills the world-window AND stacks the boxes vertically
  // (character band on top, enemy band below) instead of side-by-side columns. Both children are
  // flex:1, so column direction splits the height into equal player/enemy bands.
  topRowCombat: { flex: 1, minHeight: 0, flexDirection: 'column' },
  combatColFill: { flex: 1 },
  combatColEqual: { flex: 1 }, // equal halves during combat (override statsCol's 1.2)
  statsCol: { flex: 1.2 },
  rightCol: { flex: 1, position: 'relative' },
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
    paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#0e1618',
    borderColor: '#2b3a3e', borderWidth: 1, borderRadius: 4,
    gap: 6,
  },
  sceneText: { color: '#6ab0c9', fontSize: 10, letterSpacing: 1 },
  timeText: { color: '#6c8088', fontSize: 9, letterSpacing: 1, marginTop: 1 },
  sceneBarBtns: { flexDirection: 'row', gap: 4, flexShrink: 0 },
  sceneBtn: { color: '#bcd2db', fontSize: 16, paddingHorizontal: 8 },
  // Compact bordered chips on the scene bar — 'ACTS' opens the action
  // reference, 'QUESTS' opens the active hunts / mysteries / storylines /
  // faction quests board. Short labels keep the row from crowding the
  // location + weather text on narrow Android screens. Settings stays
  // accessible via the gear in the bottom menu row.
  sceneBarBtn: {
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  sceneBarBtnBlocked: { opacity: 0.4, borderColor: '#1d262a' },
  sceneBarBtnText: { color: '#6ab0c9', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
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
    borderLeftColor: '#6ab0c9',
    borderLeftWidth: 2,
    marginTop: 4,
  },
  streamingPrefix: { color: '#6c8088', fontSize: 10, letterSpacing: 1, marginBottom: 2 },
  streamingText: { color: '#bcd2db', fontSize: 13, lineHeight: 18 },
  streamingCursor: { color: '#6ab0c9', fontSize: 13 },
  // v2.4.1 (OTA 048) — the bottom menu row (save & exit, copy/clear
  // log, gear) was removed; gear is the cornerGear above and the
  // session controls all live in the gear screen's SESSION tab. The
  // controls block now wraps just the InputBox / DiceRoller, so the
  // feed's flex:1 naturally absorbs the reclaimed vertical real
  // estate.
  controls: { gap: 6 },
  // engine_Dev — transient last-roll result popup (above the controls).
  rollPopup: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, marginBottom: 6, alignItems: 'center', backgroundColor: '#0a1012' },
  rollPopupHit: { borderColor: '#9ec96a' },
  rollPopupMiss: { borderColor: '#e07a5f' },
  rollPopupNeutral: { borderColor: '#2b3a3e' },
  rollPopupKind: { color: '#6c8088', fontSize: 9, fontWeight: '700', letterSpacing: 2 },
  rollPopupText: { color: '#bcd2db', fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 1 },
  // OTA-748 — gear sized to sit inline in the scene bar next to MAP.
  sceneBarGear: { color: '#6ab0c9', fontSize: 13, lineHeight: 13, fontWeight: '700' },
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
    backgroundColor: '#0e1618',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
  },
  objectiveChipTitle: {
    color: '#6ab0c9',
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  objectiveChipStar: {
    color: '#6ab0c9',
    fontStyle: 'normal',
    fontWeight: '700',
  },
  objectiveChipLabel: {
    color: '#6ab0c9',
    fontStyle: 'normal',
    fontWeight: '700',
    letterSpacing: 1,
  },
  // engine_Dev — dim parts-completed counter trailing the custom-quest objective.
  objectiveChipProgress: {
    color: '#6c8088',
    fontStyle: 'normal',
    fontWeight: '700',
  },
  objectiveChipSubtitle: {
    color: '#6c8088',
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
    backgroundColor: '#131c1f',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  objectiveChipSummonText: {
    color: '#6ab0c9',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  vendorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e1618',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    minHeight: 44,
  },
  vendorBannerStripe: { width: 4, backgroundColor: '#6ab0c9', alignSelf: 'stretch' },
  vendorBannerBody: { flex: 1, paddingHorizontal: 10, paddingVertical: 6 },
  vendorBannerName: { color: '#6ab0c9', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  vendorBannerHint: { color: '#6c8088', fontSize: 10, letterSpacing: 1, marginTop: 1 },
  vendorBannerArrow: { color: '#6ab0c9', fontSize: 22, paddingHorizontal: 12 },
  // OTA-451 — Mission Board chip. Parchment/brown accent to distinguish from the
  // vendor's amber and the Crucible's purple.
  missionBoardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0e1618',
    borderColor: '#8b7355',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    minHeight: 44,
  },
  missionBoardStripe: { width: 4, backgroundColor: '#8b7355', alignSelf: 'stretch' },
  missionBoardName: { color: '#b89a6a', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  missionBoardArrow: { color: '#8b7355', fontSize: 22, paddingHorizontal: 12 },
  // OTA-1092 — Wandering NPC banner. Soft green stripe (a friendly, social beat) to
  // set it apart from the vendor gold and mission-board brown.
  wandererBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12140f',
    borderColor: '#6e8f4e',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    minHeight: 44,
  },
  wandererStripe: { width: 4, backgroundColor: '#6e8f4e', alignSelf: 'stretch' },
  wandererName: { color: '#9ec96a', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  wandererArrow: { color: '#6e8f4e', fontSize: 22, paddingHorizontal: 12 },
  // OTA-217 — Crucible permit banner. Purple stripe to differentiate
  // from the vendor banner's amber, matching the OTA-199 Rare rarity
  // color so the visual signal reads "rare event, act now."
  // arb108 — positioned like the trader banner: full content width (no
  // horizontal inset) and flush under the main-quest box (no top margin), so
  // it reads as a sibling of the quest box / vendor banner rather than a
  // detached, narrower chip. Mirrors `vendorBanner`'s box model; only the
  // purple accent colour distinguishes it.
  fusionBanner: {
    backgroundColor: '#0e1618',
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#b88ce0',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    minHeight: 44,
  },
  fusionBannerStripe: { width: 4, backgroundColor: '#b88ce0', alignSelf: 'stretch' },
  fusionBannerName: { color: '#b88ce0', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  // arb152 — dismiss (✕) on the Fusing Crucible chip.
  crucibleDismiss: { paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'center' },
  crucibleDismissText: { color: '#8a6fa8', fontSize: 16, fontWeight: '800' },
  placeholder: { color: '#6c8088', textAlign: 'center', marginTop: 80 },
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
