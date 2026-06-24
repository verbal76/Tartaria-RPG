// CombatArena — engine_Dev EXPERIMENT. A presentational-only combat layout: during a fight the
// world-window area becomes two columns, YOU on the left and the active ENEMY on the right, each as
// a stat card with a live HP bar. It reads existing state (player + the scene's enemy views) and
// writes NOTHING — combat logic, rolls, and the action bar are untouched. Gated by COMBAT_ARENA_VIEW
// in ExplorationScreen: flip that to false (or delete the one render branch) to revert instantly. It
// only ever renders while inCombat is true, so it appears on a fight and vanishes the moment combat
// resolves — no new state, nothing to corrupt when it turns on/off.

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { PlayerCharacter, Stats } from '../engine/types';
import type { EnemyView } from './EnemyPanel';

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const STAT_ABBR: [keyof Stats, string][] = [
  ['strength', 'STR'], ['dexterity', 'DEX'], ['intelligence', 'INT'],
  ['wisdom', 'WIS'], ['charisma', 'CHA'], ['stealth', 'STE'],
];

function hpColor(ratio: number): string {
  if (ratio > 0.5) return '#56d364';
  if (ratio > 0.25) return '#e3b341';
  return '#f85149';
}

function Bar({ current, max, color }: { current: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function CombatArena({ player, enemyViews, activeIdx }: { player: PlayerCharacter; enemyViews: readonly EnemyView[]; activeIdx: number }) {
  const ev = enemyViews[Math.max(0, Math.min(activeIdx, enemyViews.length - 1))];
  const e = ev?.enemy;
  const eHpMax = num(e?.hp, 1);
  const eHp = num(ev?.currentHp, eHpMax);
  const pHp = num(player?.hp);
  const pHpMax = num(player?.hpMax, Math.max(1, pHp));
  const pStam = num(player?.stamina);
  const pStamMax = num(player?.staminaMax, Math.max(1, pStam));
  const stats = (player?.stats ?? {}) as Partial<Stats>;
  const traits = Array.isArray(e?.traits) ? e!.traits!.slice(0, 4) : [];
  const statuses = Array.isArray(ev?.statuses) ? ev!.statuses!.slice(0, 4) : [];

  return (
    <View style={styles.arena} pointerEvents="none">
      {/* YOU */}
      <View style={[styles.side, styles.sideLeft]}>
        <Text style={[styles.name, styles.youName]} numberOfLines={1}>{player?.name ?? 'You'}</Text>
        <Text style={styles.hpLabel}>HP {pHp}/{pHpMax}</Text>
        <Bar current={pHp} max={pHpMax} color={hpColor(pHp / Math.max(1, pHpMax))} />
        <Text style={styles.subLabel}>Stamina {pStam}/{pStamMax}</Text>
        <Bar current={pStam} max={pStamMax} color="#58a6ff" />
        <View style={styles.statGrid}>
          {STAT_ABBR.map(([k, label]) => (
            <Text key={label} style={styles.stat}>{label} {num(stats[k])}</Text>
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      {/* ENEMY */}
      <ScrollView style={[styles.side, styles.sideRight]} contentContainerStyle={styles.sideInner}>
        <Text style={[styles.name, styles.enemyName]} numberOfLines={2}>{e?.name ?? 'Enemy'}</Text>
        <Text style={styles.hpLabel}>HP {eHp}/{eHpMax}</Text>
        <Bar current={eHp} max={eHpMax} color={hpColor(eHp / Math.max(1, eHpMax))} />
        <View style={styles.statGrid}>
          {e?.attack ? <Text style={styles.stat}>ATK {String(e.attack)}</Text> : null}
          {e?.damage ? <Text style={styles.stat}>DMG {String(e.damage)}</Text> : null}
          {e?.abilityPoint ? <Text style={styles.stat}>{String(e.abilityPoint)}</Text> : null}
          {ev?.rangeLabel ? <Text style={styles.stat}>{ev.rangeLabel}</Text> : null}
        </View>
        {traits.length > 0 && <Text style={styles.traits} numberOfLines={2}>{traits.join(' · ')}</Text>}
        {statuses.length > 0 && (
          <Text style={styles.statuses} numberOfLines={2}>
            {statuses.map((s) => `${s.kind.replace(/_/g, ' ')}${s.turnsRemaining ? ` (${s.turnsRemaining})` : ''}`).join(' · ')}
          </Text>
        )}
        {enemyViews.length > 1 && <Text style={styles.more}>+{enemyViews.length - 1} more enemy{enemyViews.length - 1 === 1 ? '' : 'ies'} in the fight</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  arena: { flex: 1, flexDirection: 'row', backgroundColor: '#0d1117', borderRadius: 8, overflow: 'hidden' },
  side: { flex: 1, padding: 12 },
  sideInner: { paddingBottom: 8 },
  sideLeft: { backgroundColor: '#0f1620' },
  sideRight: { backgroundColor: '#1a1012' },
  divider: { width: 1, backgroundColor: '#30363d' },
  name: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  youName: { color: '#58a6ff' },
  enemyName: { color: '#f85149' },
  hpLabel: { color: '#c9d1d9', fontSize: 12, marginBottom: 3 },
  subLabel: { color: '#8b949e', fontSize: 11, marginTop: 8, marginBottom: 3 },
  barTrack: { height: 8, backgroundColor: '#21262d', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  stat: { color: '#c9d1d9', fontSize: 11, width: '50%', marginBottom: 3 },
  traits: { color: '#d29922', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  statuses: { color: '#a371f7', fontSize: 11, marginTop: 6 },
  more: { color: '#8b949e', fontSize: 10, marginTop: 8 },
});
