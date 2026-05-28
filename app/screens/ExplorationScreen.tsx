import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useGameStore } from '../state/gameStore';
import { readFullLog, flushLogWrites, clearActiveSlotLog, getLastLogWriteError, clearLastLogWriteError } from '../engine/saveSystem';
import { StatsPanel } from '../components/StatsPanel';
import { AdventureFeed } from '../components/AdventureFeed';
import { InputBox } from '../components/InputBox';
import { DiceRoller } from '../components/DiceRoller';
import { EnemyPanel, type EnemyView } from '../components/EnemyPanel';
import { CrestPlaceholder } from '../components/CrestPlaceholder';
import { SearchModal } from '../components/SearchModal';
import { SalvageModal, isSalvageable as isSalvageableForModal } from '../components/SalvageModal';
import { BrandedModal } from '../components/BrandedModal';
import { TakeModal } from '../components/TakeModal';
import { ClimbModal } from '../components/ClimbModal';
import { FeedbackModal } from '../components/FeedbackModal';
import { isClimbable, isSalvageable } from '../engine/interactionTags';
import { climbHeightFor, isClimbCleared } from '../engine/climbHeight';
import { findCatalogItem } from '../engine/crafting';
import { isOversized } from '../engine/portability';
import { playerHasScannerEquipped } from '../engine/equipment';
import { searchRequirementFor } from '../engine/itemEffect';
import { ApproachModal } from '../components/ApproachModal';
import { TutorialTarget } from '../components/TutorialTarget';
import { findWeaponByName } from '../engine/crafting';

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

export function ExplorationScreen() {
  const player = useGameStore((s) => s.player);
  const gameLog = useGameStore((s) => s.gameLog);
  const partialArbiterText = useGameStore((s) => s.partialArbiterText);
  const isGenerating = useGameStore((s) => s.isGenerating);
  const submit = useGameStore((s) => s.submitPlayerAction);
  const setScreen = useGameStore((s) => s.setScreen);
  const currentScene = useGameStore((s) => s.currentScene);
  const pendingRolls = useGameStore((s) => s.pendingRolls);
  const pendingTravelConfirm = useGameStore((s) => s.pendingTravelConfirm);
  const confirmLeaveAndTravel = useGameStore((s) => s.confirmLeaveAndTravel);
  const cancelTravelConfirm = useGameStore((s) => s.cancelTravelConfirm);
  const resolveRollStep = useGameStore((s) => s.resolveRollStep);
  const cancelPendingRolls = useGameStore((s) => s.cancelPendingRolls);
  const saveAndExitToTitle = useGameStore((s) => s.saveAndExitToTitle);
  const setActiveEnemyIdx = useGameStore((s) => s.setActiveEnemyIdx);

  const [searchOpen, setSearchOpen] = useState(false);
  const [approachOpen, setApproachOpen] = useState(false);
  const [salvageOpen, setSalvageOpen] = useState(false);
  const [takeOpen, setTakeOpen] = useState(false);
  // OTA 031 — climb-target picker. Opens to a chip list of every
  // climbable noun in the current scene; tapping one fires `climb
  // <noun>` which resolves one tier in the climb handler.
  const [climbOpen, setClimbOpen] = useState(false);
  // 2026-05-25 — branded vendor-leave prompt (POLISH-4). Replaces
  // the native Alert that was breaking the dark+amber palette. Holds
  // {vendorName, pendingText} so confirmation dispatches the
  // originally-typed move command.
  const [vendorLeavePrompt, setVendorLeavePrompt] = useState<
    { vendorName: string; pendingText: string } | null
  >(null);
  // OTA 202 — designer-note modal. Wired to the 📝 button in the
  // input row (InputBox.onOpenFeedback prop).
  const [feedbackOpen, setFeedbackOpen] = useState(false);
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
  const appendFeedback = useGameStore((s) => s.appendFeedback);
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
    const microMicroId = currentScene.microMicroId ?? '_';
    const x = typeof player.mapX === 'number' ? player.mapX : '_';
    const y = typeof player.mapY === 'number' ? player.mapY : '_';
    const roomKey = `${player.currentLocationId}@${microMicroId}@${x},${y}`;
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
    const microMicroId = currentScene.microMicroId ?? '_';
    const x = typeof player.mapX === 'number' ? player.mapX : '_';
    const y = typeof player.mapY === 'number' ? player.mapY : '_';
    const roomKey = `${player.currentLocationId}@${microMicroId}@${x},${y}`;
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
    const microMicroId = currentScene.microMicroId ?? '_';
    const x = typeof player.mapX === 'number' ? player.mapX : '_';
    const y = typeof player.mapY === 'number' ? player.mapY : '_';
    const roomKey = `${player.currentLocationId}@${microMicroId}@${x},${y}`;
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
  const isFuzzyConsumed = (chipNoun: string, pool: Set<string>): boolean => {
    const chipLower = chipNoun.toLowerCase();
    for (const entry of pool) {
      if (entry.length === 0) continue;
      if (entry === chipLower) return true;
      if (chipLower.includes(entry)) return true;
      if (entry.includes(chipLower)) return true;
    }
    return false;
  };

  // Build one view per enemy in the scene. Tap-to-cycle is wired through
  // the store's setActiveEnemyIdx so combat handlers always target the
  // enemy the player is currently looking at.
  const enemyViews: EnemyView[] = useMemo(() => {
    if (!currentScene || currentScene.enemies.length === 0) return [];
    const range = currentScene.range ?? 'close';
    const rangeLabel = range === 'arm' ? "arm's reach" : range === 'far' ? 'far' : 'close';
    const mainName = player?.equipped?.main ?? player?.equipped?.weaponName;
    const w = mainName ? findWeaponByName(mainName) : null;
    let canHit = false;
    if (!w) canHit = range === 'arm';
    else if (w.weaponKind === 'melee') canHit = range === 'arm';
    else if (w.weaponKind === 'ranged') canHit = true;
    else canHit = range !== 'far' || (player?.stats?.intelligence ?? 0) >= 9;
    return currentScene.enemies.map((e, i) => ({
      enemy: e,
      currentHp: currentScene.enemyHps[i] ?? e.hp,
      rangeLabel,
      inRange: canHit,
    }));
  }, [
    currentScene?.enemies, currentScene?.enemyHps, currentScene?.range,
    player?.equipped?.main, player?.equipped?.weaponName, player?.stats?.intelligence,
  ]);
  const activeIdx = Math.min(currentScene?.activeEnemyIdx ?? 0, Math.max(0, enemyViews.length - 1));

  const inCombat = enemyViews.length > 0;
  const equippedMain = player?.equipped?.main ?? null;
  const equippedOff = player?.equipped?.off ?? null;

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No expedition is underway.</Text>
      </View>
    );
  }

  const bgTint = timeOfDayTint(player.hoursElapsed ?? 0);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: bgTint }]}
      // OTA 022 — was behavior='height' on Android (OTA 209 fix for
      // keyboard covering the input). 'height' on Android double-
      // shrinks the view: Android's native adjustResize already
      // pulls the window up by keyboard height, then KAV's height
      // mode shrinks the container again on top of that. Periodic
      // "main screen smaller than available" was the visible result.
      // 'padding' adds bottom padding (visual) without touching the
      // container height — it doesn't compound with adjustResize.
      behavior="padding"
    >
      <View style={styles.topRow}>
        <TutorialTarget area="top-left-stats" style={styles.statsCol}>
          {/* OTA 040 — tap the stats panel to open the full Player
              Sheet. Wrapped INSIDE the TutorialTarget so the overlay
              still measures the same layout box. */}
          <TouchableOpacity
            onPress={() => setScreen('character')}
            activeOpacity={0.75}
          >
            <StatsPanel player={player} />
          </TouchableOpacity>
        </TutorialTarget>
        <TutorialTarget area="top-right-enemy" style={styles.rightCol}>
          {inCombat ? (
            <EnemyPanel
              enemies={enemyViews}
              activeIndex={activeIdx}
              onSelectActive={setActiveEnemyIdx}
            />
          ) : (
            <CrestPlaceholder />
          )}
          {/* v2.4.1 (OTA 048) — gear icon overlaid in the top-right
              corner of the right column. Replaces the bottom-row
              gear, which was the only thing left there after the
              session controls moved into the gear screen. The gear
              floats over whichever right-col content is showing
              (EnemyPanel or CrestPlaceholder). EnemyCard's `head`
              style reserves right-padding so the range tag types
              AROUND the gear instead of being clipped. */}
          <TouchableOpacity
            onPress={() => setScreen('about')}
            hitSlop={8}
            style={styles.cornerGear}
            accessibilityLabel="Settings"
          >
            <Text style={styles.gear}>⚙</Text>
          </TouchableOpacity>
        </TutorialTarget>
      </View>

      <TutorialTarget area="scene-bar" style={styles.sceneBar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sceneText} numberOfLines={1} ellipsizeMode="tail">
            {currentScene
              ? `${currentScene.transitArea ?? currentScene.location.name}  /  ${currentScene.weather.name}${currentScene.hazard ? `  /  ${currentScene.hazard.name}` : ''}`
              : 'No scene'}
          </Text>
          <Text style={styles.timeText} numberOfLines={1}>
            {describeTime(player.hoursElapsed ?? 0)}
          </Text>
        </View>
        <View style={styles.sceneBarBtns}>
          <TouchableOpacity
            onPress={() => setScreen('actions')}
            hitSlop={8}
            style={styles.sceneBarBtn}
          >
            <Text style={styles.sceneBarBtnText}>ACTIONS</Text>
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
        if (!mq || mq.phase === 'ended') {
          // No active main quest — chip still serves as the menu
          // entry but doesn't pretend to point anywhere.
          mainLine = 'No active objective.';
        } else {
          const cores = mq.coresRecovered?.length ?? 0;
          atUnrecovered = capitals.includes(player.currentLocationId)
            && !mq.coresRecovered.includes(player.currentLocationId)
            && (mq.phase === 'revelation' || mq.phase === 'cores');
          mainLine = atUnrecovered
            ? `${coreGateNextAction(player.factionId)}.`
            : phaseHint(mq.phase, cores);
        }
        return (
          <TouchableOpacity
            style={styles.objectiveChip}
            onPress={() => setScreen('contracts')}
            activeOpacity={0.7}
            hitSlop={6}
          >
            <View style={styles.objectiveChipRow}>
              <View style={styles.objectiveChipBody}>
                <Text style={styles.objectiveChipTitle} numberOfLines={2}>
                  <Text style={styles.objectiveChipStar}>★ </Text>
                  <Text style={styles.objectiveChipLabel}>MAIN QUEST · </Text>
                  {mainLine}
                </Text>
                <Text style={styles.objectiveChipSubtitle}>
                  tap for all contracts + collectibles ↗
                </Text>
              </View>
              {atUnrecovered && (
                <TouchableOpacity
                  style={styles.objectiveChipSummon}
                  onPress={() => useGameStore.getState().summonCoreGuardian()}
                  activeOpacity={0.7}
                  hitSlop={8}
                >
                  <Text style={styles.objectiveChipSummonText}>★ SUMMON</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        );
      })()}

      {currentScene?.vendor && (
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
        </TouchableOpacity>
      )}

      <TutorialTarget area="feed" style={styles.feed}>
        <AdventureFeed entries={gameLog} enemyNames={currentScene?.enemies.map((e) => e.name)} />
        {isGenerating && (partialArbiterText || partialArbiterText === '') && (
          <View style={styles.streamingTail}>
            <Text style={styles.streamingPrefix}>The Arbiter:</Text>
            <Text style={styles.streamingText}>
              {partialArbiterText}
              <Text style={styles.streamingCursor}>▍</Text>
            </Text>
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
        ) : (
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
            onOpenSearch={() => setSearchOpen(true)}
            onOpenCrafting={() => setScreen('crafting')}
            onOpenApproach={() => setApproachOpen(true)}
            onOpenSalvage={() => setSalvageOpen(true)}
            onOpenTake={() => setTakeOpen(true)}
            onOpenClimb={() => setClimbOpen(true)}
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
            onOpenFeedback={() => setFeedbackOpen(true)}
            onOpenMap={() => setScreen('map')}
            inCombat={inCombat}
            equippedMain={equippedMain}
            equippedOff={equippedOff}
            range={currentScene?.range ?? null}
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
              ).length;
            })()}
            salvageableCount={(() => {
              // 2026-05-25 — count predicate now uses SalvageModal's
              // exported isSalvageable (= SALVAGE_PATTERN regex OR
              // isCuratedSalvageable). Previously used
              // interactionTags.isSalvageable, which diverged in both
              // directions and lit SALVAGE green when modal was empty
              // (and vice versa).
              return buildChipPool(currentScene).filter(
                (n) => !isAmbientConsumed(n) && isSalvageableForModal(n),
              ).length;
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
              const microMicroId = currentScene?.microMicroId ?? '_';
              const x = typeof player?.mapX === 'number' ? player.mapX : '_';
              const y = typeof player?.mapY === 'number' ? player.mapY : '_';
              const roomKey = `${player?.currentLocationId}@${microMicroId}@${x},${y}`;
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
              // unmetRequirement (Aether-scanner-gated nouns when the
              // scanner is not equipped). Playtester: "the only thing
              // left to investigate is a locked item and I do not have
              // the piece... why that investigate button shouldn't
              // turn back to the regular amber". The lock isn't
              // actionable from this state — the player can't tap the
              // chip with any productive outcome until they equip the
              // scanner — so it must not light the tab green.
              const hasScanner = player ? playerHasScannerEquipped(player, 'aetheric') : false;
              const sceneCount = buildChipPool(currentScene).filter(
                (n) => {
                  // 2026-05-26 OTA-070 — fuzzy match against both
                  // pools, mirroring the engine's accept/refuse
                  // decision. Was exact set.has(n.toLowerCase()).
                  if (isFuzzyConsumed(n, productivelyConsumedSet)) return false;
                  if (isFuzzyConsumed(n, flavorExhaustedSet)) return false;
                  const req = searchRequirementFor(n);
                  if (req && !hasScanner) return false;
                  return true;
                },
              ).length;
              const groundCount = (!player?.hubRoomId && !isAmbientConsumed('ground')) ? 1 : 0;
              return sceneCount + groundCount;
            })()}
            golem={player?.golem ? {
              name: player.golem.name,
              hp: player.golem.hp,
              hpMax: player.golem.hpMax,
            } : null}
            dog={player?.dog && player.dog.status === 'with_player' ? {
              name: player.dog.name,
              hp: player.dog.hp,
              hpMax: player.dog.hpMax,
            } : null}
            travelTargetName={(() => {
              if (!player?.travelTarget) return null;
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const locs = (require('../data/locations/locations.json') as Array<{ id: string; name: string }>);
              const id = player.travelTarget.locationId;
              return locs.find((l) => l.id === id)?.name ?? id;
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
              if (!player?.travelTarget) return null;
              if (typeof player.travelTarget.distanceRemaining === 'number') {
                return player.travelTarget.distanceRemaining;
              }
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const { generateWorldMap, WORLD_MAP_CENTER_X, WORLD_MAP_CENTER_Y } = require('../engine/worldMap');
              const seed = player.mapSeed ?? `${player.name}|${player.raceId}|${player.factionId}|legacy`;
              const map = generateWorldMap(seed, player.currentLocationId);
              const tgtPos = map.positions[player.travelTarget.locationId];
              if (!tgtPos) return null;
              const fromX = typeof player.mapX === 'number' ? player.mapX : WORLD_MAP_CENTER_X;
              const fromY = typeof player.mapY === 'number' ? player.mapY : WORLD_MAP_CENTER_Y;
              return Math.abs(tgtPos.x - fromX) + Math.abs(tgtPos.y - fromY);
            })()}
            onContinueTravel={() => useGameStore.getState().continueTravel()}
            onStopTravel={() => useGameStore.getState().stopTravel()}
          />
        )}
        {/* v2.4.1 (OTA 048) — bottom menu row removed. Gear icon
            moved to the top-right corner of the right column
            (above). All run-control (save & exit, copy/clear log)
            lives in the gear screen's SESSION tab now. */}
      </View>

      <SearchModal
        visible={searchOpen}
        chips={[
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
            return [{ noun, consumed: isAmbientConsumed(key), alwaysShow: true }];
          })(),
          // 2026-05-25 — productively-consumed nouns (taken, salvaged
          // with loot, investigated with substantive result) are
          // filtered out of Investigate entirely so the modal doesn't
          // clutter with already-acted-on items. Flavor-only
          // investigated nouns stay visible greyed + sorted right
          // per POLISH-3.
          ...buildChipPool(currentScene)
            // 2026-05-26 OTA-070 — fuzzy match for the
            // productively-consumed filter (was exact .has).
            // Mirrors the engine's substring dedup so a chip
            // whose productive consumption was recorded under a
            // variant phrasing ("wooden bench" vs chip "bench")
            // gets filtered out instead of lingering green-and-
            // dead in the modal.
            .filter((n) => !isFuzzyConsumed(n, productivelyConsumedSet))
            .map((n) => {
              // OTA 195 — compute per-chip requirement. An Aether-coded
              // noun (vent fissure, ley line, glyph, etc.) requires a
              // scanner equipped. If the player doesn't have one,
              // mark unmetRequirement so SearchModal renders the chip
              // grayed with a "requires Aether scanner" tag.
              const req = searchRequirementFor(n);
              const hasScanner = player ? playerHasScannerEquipped(player, 'aetheric') : false;
              const unmetRequirement = req && !hasScanner ? req.shortLabel : undefined;
              return {
                noun: n,
                // 2026-05-26 OTA-070 — fuzzy match for the
                // greyed-but-visible flavor-exhausted state. Was
                // exact .has(n.toLowerCase()).
                consumed: isFuzzyConsumed(n, flavorExhaustedSet),
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
        takeable={(currentScene?.displayedAmbientNouns ?? currentScene?.ambientNouns ?? [])
          .filter((n) => findCatalogItem(n) !== null && !isOversized(n))
          .map((n) => ({ noun: n, consumed: isAmbientConsumed(n) }))}
        onTake={(noun) => {
          setTakeOpen(false);
          takeAmbientNoun(noun);
        }}
        onStealthTake={(noun) => {
          setTakeOpen(false);
          stealthTakeAmbientNoun(noun);
        }}
        onTakeAll={(nouns) => {
          // OTA 222 — fire each take in sequence then close. Each
          // takeAmbientNoun call runs through the same gating
          // (already-taken dedup, inventory cap, etc.) that an
          // individual chip tap would, so partial success is
          // handled per-item by the store.
          setTakeOpen(false);
          for (const n of nouns) takeAmbientNoun(n);
        }}
        onCancel={() => setTakeOpen(false)}
      />

      <SalvageModal
        visible={salvageOpen}
        chips={buildChipPool(currentScene).map((n) => ({
          noun: n,
          consumed: isAmbientConsumed(n),
        }))}
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

      <FeedbackModal
        visible={feedbackOpen}
        onSubmit={(text) => {
          setFeedbackOpen(false);
          appendFeedback(text);
        }}
        onCancel={() => setFeedbackOpen(false)}
      />

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
        const microMicroId = currentScene?.microMicroId ?? '_';
        const x = typeof player?.mapX === 'number' ? player.mapX : '_';
        const y = typeof player?.mapY === 'number' ? player.mapY : '_';
        const roomKey = `${player?.currentLocationId}@${microMicroId}@${x},${y}`;
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

      {/* 2026-05-25 — branded vendor-leave prompt. Replaces the
          native Alert.alert that broke the dark+amber palette. */}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 8, gap: 6 },
  // minHeight (not fixed height) — characters with multiple active
  // contracts / effects / a companion overflow 165px; the fixed height
  // clipped the bottom rows behind the scene bar. Letting the row grow
  // to fit content keeps every stat visible.
  topRow: { flexDirection: 'row', gap: 6, minHeight: 165 },
  statsCol: { flex: 1.2 },
  rightCol: { flex: 1, position: 'relative' },
  // v2.4.1 (OTA 048) — gear icon floats over the top-right corner
  // of the right column (EnemyPanel or CrestPlaceholder). 32×32
  // hit area, semi-transparent backdrop so it stays legible on top
  // of either content. EnemyCard's `head` style reserves
  // paddingRight so the range tag types around the gear instead of
  // being clipped.
  cornerGear: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(26, 23, 20, 0.85)',
    borderColor: '#3a342c',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  sceneBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#13110f',
    borderColor: '#3a342c', borderWidth: 1, borderRadius: 4,
    gap: 6,
  },
  sceneText: { color: '#c9a86a', fontSize: 10, letterSpacing: 1 },
  timeText: { color: '#7a705c', fontSize: 9, letterSpacing: 1, marginTop: 1 },
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
  sceneBarBtnText: { color: '#c9a86a', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  feed: { flex: 1 },
  streamingTail: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0e0c0a',
    borderLeftColor: '#c9a86a',
    borderLeftWidth: 2,
    marginTop: 4,
  },
  streamingPrefix: { color: '#7a705c', fontSize: 10, letterSpacing: 1, marginBottom: 2 },
  streamingText: { color: '#cdbf99', fontSize: 13, lineHeight: 18 },
  streamingCursor: { color: '#c9a86a', fontSize: 13 },
  // v2.4.1 (OTA 048) — the bottom menu row (save & exit, copy/clear
  // log, gear) was removed; gear is the cornerGear above and the
  // session controls all live in the gear screen's SESSION tab. The
  // controls block now wraps just the InputBox / DiceRoller, so the
  // feed's flex:1 naturally absorbs the reclaimed vertical real
  // estate.
  controls: { gap: 6 },
  gear: { color: '#c9a86a', fontSize: 16, lineHeight: 18 },
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
    color: '#7a705c',
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
  objectiveChipSummonText: {
    color: '#c9a86a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  vendorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    minHeight: 44,
  },
  vendorBannerStripe: { width: 4, backgroundColor: '#c9a86a', alignSelf: 'stretch' },
  vendorBannerBody: { flex: 1, paddingHorizontal: 10, paddingVertical: 6 },
  vendorBannerName: { color: '#c9a86a', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  vendorBannerHint: { color: '#7a705c', fontSize: 10, letterSpacing: 1, marginTop: 1 },
  vendorBannerArrow: { color: '#c9a86a', fontSize: 22, paddingHorizontal: 12 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
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
  return out.slice(0, 10);
}
