import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ListRenderItem,
} from 'react-native';
import type { Enemy } from '../engine/types';

export interface EnemyView {
  enemy: Enemy;
  currentHp: number;
  /** Optional range indicator. Defaults to true (engine is single-enemy / in-melee). */
  inRange?: boolean;
}

interface Props {
  enemies: EnemyView[];
  activeIndex: number;
  onSelectActive: (i: number) => void;
}

const SCREEN_W = Dimensions.get('window').width;
const HORIZONTAL_PADDING = 8 + 2; // ExplorationScreen padding + 1 card edge
const CARD_WIDTH = SCREEN_W - HORIZONTAL_PADDING * 2;

export function EnemyPanel({ enemies, activeIndex, onSelectActive }: Props) {
  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / CARD_WIDTH);
      if (idx !== activeIndex && idx >= 0 && idx < enemies.length) {
        onSelectActive(idx);
      }
    },
    [activeIndex, enemies.length, onSelectActive],
  );

  if (enemies.length === 0) return null;

  // Tap on the panel cycles to the next enemy when more than one is staged.
  // This is in addition to horizontal swipe paging.
  const cycleNext = () => {
    if (enemies.length <= 1) return;
    onSelectActive((activeIndex + 1) % enemies.length);
  };

  const renderItem: ListRenderItem<EnemyView> = ({ item }) => (
    <TouchableOpacity activeOpacity={enemies.length > 1 ? 0.7 : 1} onPress={cycleNext}>
      <EnemyCard view={item} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      <FlatList
        data={enemies}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={renderItem}
        snapToInterval={CARD_WIDTH}
        decelerationRate="fast"
      />
      {enemies.length > 1 && (
        <View style={styles.dots}>
          {enemies.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
          <Text style={styles.hint}>swipe to target</Text>
        </View>
      )}
    </View>
  );
}

function EnemyCard({ view }: { view: EnemyView }) {
  const apNum = parseInt(view.enemy.abilityPoint, 10);
  const ac = Math.max(5, Math.min(18, 5 + (Number.isFinite(apNum) ? apNum : 0)));
  const attackNum = parseInt(String(view.enemy.attack), 10);
  const atkLabel = Number.isFinite(attackNum) ? `+${attackNum}` : String(view.enemy.attack);
  const hpPct = Math.max(0, Math.min(1, view.currentHp / Math.max(1, view.enemy.hp)));
  const hpColor = hpPct > 0.5 ? '#9ec96a' : hpPct > 0.2 ? '#c9a86a' : '#e07a5f';
  // Range indicator. Engine doesn't track per-enemy positioning yet —
  // anyone staged in the scene is in arm's reach. Once positioning is
  // added this becomes view.inRange.
  const inRange = view.inRange ?? true;

  return (
    <View style={[styles.card, { width: CARD_WIDTH }]}>
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={1}>
          {view.enemy.name}
        </Text>
        <View style={styles.headRight}>
          <Text style={[styles.range, inRange ? styles.rangeIn : styles.rangeOut]}>
            {inRange ? 'IN RANGE' : 'OUT OF RANGE'}
          </Text>
          <Text style={styles.rarity}>{view.enemy.rarity}</Text>
        </View>
      </View>
      <Text style={styles.subline} numberOfLines={1}>
        {view.enemy.type}
      </Text>
      <View style={styles.hpBarBg}>
        <View style={[styles.hpBarFill, { width: `${hpPct * 100}%`, backgroundColor: hpColor }]} />
      </View>
      <View style={styles.statRow}>
        <Stat label="HP" value={`${view.currentHp}/${view.enemy.hp}`} />
        <Stat label="AC" value={String(ac)} />
        <Stat label="ATK" value={atkLabel} />
        <Stat label="DMG" value={String(view.enemy.damage)} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  card: {
    backgroundColor: '#13110f',
    borderColor: '#5a2a26',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  headRight: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  name: { color: '#e07a5f', fontSize: 14, fontWeight: '700', letterSpacing: 1, flexShrink: 1 },
  rarity: { color: '#7a705c', fontSize: 10, letterSpacing: 1 },
  range: { fontSize: 9, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, borderWidth: 1 },
  rangeIn: { color: '#9ec96a', borderColor: '#3d5a2c' },
  rangeOut: { color: '#7a705c', borderColor: '#3a342c' },
  subline: { color: '#7a705c', fontSize: 11, marginBottom: 4 },
  hpBarBg: {
    height: 6,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
  },
  hpBarFill: { height: '100%' },
  statRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  stat: { flex: 1 },
  statLabel: { color: '#7a705c', fontSize: 9, letterSpacing: 1 },
  statValue: { color: '#e6d8b3', fontSize: 12, fontWeight: '600' },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3a342c' },
  dotActive: { backgroundColor: '#c9a86a' },
  hint: { color: '#7a705c', fontSize: 9, letterSpacing: 1, marginLeft: 8 },
});
