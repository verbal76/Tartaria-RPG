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

export function ExplorationScreen() {
  const player = useGameStore((s) => s.player);
  const gameLog = useGameStore((s) => s.gameLog);
  const submit = useGameStore((s) => s.submitPlayerAction);
  const setScreen = useGameStore((s) => s.setScreen);
  const beginScene = useGameStore((s) => s.beginScene);
  const currentScene = useGameStore((s) => s.currentScene);
  const pendingRolls = useGameStore((s) => s.pendingRolls);
  const resolveRollStep = useGameStore((s) => s.resolveRollStep);
  const cancelPendingRolls = useGameStore((s) => s.cancelPendingRolls);
  const saveAndExitToTitle = useGameStore((s) => s.saveAndExitToTitle);
  const setActiveEnemyIdx = useGameStore((s) => s.setActiveEnemyIdx);

  const [searchOpen, setSearchOpen] = useState(false);

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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topRow}>
        <View style={styles.statsCol}>
          <StatsPanel player={player} />
        </View>
        <View style={styles.rightCol}>
          {inCombat ? (
            <EnemyPanel
              enemies={enemyViews}
              activeIndex={activeIdx}
              onSelectActive={setActiveEnemyIdx}
            />
          ) : (
            <CrestPlaceholder />
          )}
        </View>
      </View>

      <View style={styles.sceneBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sceneText} numberOfLines={1}>
            {currentScene
              ? `${currentScene.location.name}  /  ${currentScene.weather.name}${currentScene.hazard ? `  /  ${currentScene.hazard.name}` : ''}`
              : 'No scene'}
          </Text>
          <Text style={styles.timeText} numberOfLines={1}>
            {describeTime(player.hoursElapsed ?? 0)}
          </Text>
        </View>
        <View style={styles.sceneBarBtns}>
          <TouchableOpacity onPress={() => beginScene()} hitSlop={8}>
            <Text style={styles.sceneBtn}>↻</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('about')} hitSlop={8}>
            <Text style={styles.sceneBtn}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

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

      <View style={styles.feed}>
        <AdventureFeed entries={gameLog} />
      </View>

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
            inCombat={inCombat}
            equippedMain={equippedMain}
            equippedOff={equippedOff}
            range={currentScene?.range ?? null}
          />
        )}
        <View style={styles.menuRow}>
          <TouchableOpacity onPress={() => { void saveAndExitToTitle(); }}>
            <Text style={styles.menu}>save & exit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('log')}>
            <Text style={styles.menu}>full log</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('about')} hitSlop={8}>
            <Text style={styles.gear}>⚙</Text>
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#13110f',
    borderColor: '#3a342c', borderWidth: 1, borderRadius: 4,
  },
  sceneText: { color: '#c9a86a', fontSize: 11, letterSpacing: 1 },
  timeText: { color: '#7a705c', fontSize: 10, letterSpacing: 1, marginTop: 1 },
  sceneBarBtns: { flexDirection: 'row', gap: 4 },
  sceneBtn: { color: '#cdbf99', fontSize: 16, paddingHorizontal: 8 },
  feed: { flex: 1 },
  controls: { gap: 6 },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  menu: { color: '#7a705c', fontSize: 11, letterSpacing: 1 },
  gear: { color: '#c9a86a', fontSize: 18, lineHeight: 18 },
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
