import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { StatsPanel } from '../components/StatsPanel';
import { AdventureFeed } from '../components/AdventureFeed';
import { InputBox } from '../components/InputBox';
import { DiceRoller } from '../components/DiceRoller';
import { EnemyPanel, type EnemyView } from '../components/EnemyPanel';
import { CrestPlaceholder } from '../components/CrestPlaceholder';
import { SearchModal } from '../components/SearchModal';
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
  const resolveRollStep = useGameStore((s) => s.resolveRollStep);
  const cancelPendingRolls = useGameStore((s) => s.cancelPendingRolls);
  const saveAndExitToTitle = useGameStore((s) => s.saveAndExitToTitle);
  const setActiveEnemyIdx = useGameStore((s) => s.setActiveEnemyIdx);

  const [searchOpen, setSearchOpen] = useState(false);
  const [approachOpen, setApproachOpen] = useState(false);

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
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topRow}>
        <TutorialTarget area="top-left-stats" style={styles.statsCol}>
          <StatsPanel player={player} />
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
        </TutorialTarget>
      </View>

      <TutorialTarget area="scene-bar" style={styles.sceneBar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sceneText} numberOfLines={1} ellipsizeMode="tail">
            {currentScene
              ? `${currentScene.location.name}  /  ${currentScene.weather.name}${currentScene.hazard ? `  /  ${currentScene.hazard.name}` : ''}`
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
          <TouchableOpacity
            onPress={() => setScreen('contracts')}
            hitSlop={8}
            style={styles.sceneBarBtn}
          >
            <Text style={styles.sceneBarBtnText}>QUESTS</Text>
          </TouchableOpacity>
        </View>
      </TutorialTarget>

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
            onSubmit={submit}
            onOpenInventory={() => setScreen('inventory')}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenCrafting={() => setScreen('crafting')}
            onOpenApproach={() => setApproachOpen(true)}
            inCombat={inCombat}
            equippedMain={equippedMain}
            equippedOff={equippedOff}
            range={currentScene?.range ?? null}
          />
        )}
        <TutorialTarget area="bottom-menu" style={styles.menuRow}>
          <TouchableOpacity onPress={() => { void saveAndExitToTitle(); }} style={styles.menuBtn}>
            <Text style={styles.menuBtnText}>save & exit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('log')} style={styles.menuBtn}>
            <Text style={styles.menuBtnText}>full log</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('about')} hitSlop={8} style={styles.menuBtnGear}>
            <Text style={styles.gear}>⚙</Text>
          </TouchableOpacity>
        </TutorialTarget>
      </View>

      <SearchModal
        visible={searchOpen}
        hints={currentScene?.ambientNouns}
        onSubmit={(target) => {
          setSearchOpen(false);
          submit(`search the ${target}`);
        }}
        onCancel={() => setSearchOpen(false)}
      />

      <ApproachModal
        visible={approachOpen}
        enemyHints={currentScene?.enemies.map((e) => e.name) ?? []}
        sceneHints={currentScene?.ambientNouns ?? []}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0908', padding: 8, gap: 6 },
  topRow: { flexDirection: 'row', gap: 6, height: 165 },
  statsCol: { flex: 1.2 },
  rightCol: { flex: 1 },
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
  controls: { gap: 6 },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, gap: 6 },
  menu: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  // Bordered chips for the bottom menu row so 'save & exit' and 'full
  // log' read as proper buttons, matching the scene-bar action chips.
  menuBtn: {
    backgroundColor: '#1a1612',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flex: 1,
    alignItems: 'center',
  },
  menuBtnText: { color: '#cdbf99', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  menuBtnGear: {
    backgroundColor: '#1a1612',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gear: { color: '#c9a86a', fontSize: 16, lineHeight: 18 },
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
