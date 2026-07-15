import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ListRenderItem,
} from 'react-native';
import type { Enemy } from '../engine/types';
import { describeTrait, traitACBonus, traitDefenses } from '../engine/enemyTraits';
import { enemyTypeDefenses } from '../engine/crafting';
import { enemyDamageType } from '../engine/damageTypes';
import { BrandedModal } from './BrandedModal';
// engine_Dev — combat arena: tint the enemy band by ITS health, using the SAME health→color ramp
// the player's StatsPanel uses (green when full → amber → red near death), so both bands read at a
// glance and stay visually consistent.
import { healthCardBg } from './StatsPanel';

/** OTA-401 — a single active status (coating DOT / infection) on an
 *  enemy, mirrored from `currentScene.enemyStatuses[i]`. Surfaced on the
 *  panel so the player can see what's ticking and how many combat turns
 *  it has left. */
export interface EnemyStatusView {
  kind: 'infected' | 'poison_coat' | 'acid_coat' | 'corruption_coat' | 'electrical_coat' | 'burn_coat' | 'dt_dot' | 'exposed';
  turnsRemaining: number;
  dmgPerTurn: number;
  sourceName: string;
  acPenalty?: number;
}

export interface EnemyView {
  enemy: Enemy;
  currentHp: number;
  /** Optional range indicator. Defaults to true (engine is single-enemy / in-melee). */
  inRange?: boolean;
  /** Human-readable range label — "arm's reach", "close", "far". */
  rangeLabel?: string;
  /** OTA-401 — active coating/DOT statuses on this enemy + turns left. */
  statuses?: EnemyStatusView[];
}

// OTA-401 — short label + accent color per status kind. The coating
// families mirror the on-hit log adjectives (Poisoned / Acid-Etched /
// …); infection is the OTA-210 contagion DOT.
const STATUS_META: Record<EnemyStatusView['kind'], { label: string; color: string }> = {
  poison_coat: { label: 'POISON', color: '#9ec96a' },
  acid_coat: { label: 'ACID', color: '#c9e06a' },
  corruption_coat: { label: 'CORRUPTION', color: '#b88ce0' },
  electrical_coat: { label: 'SHOCK', color: '#6ac9e0' },
  burn_coat: { label: 'BURN', color: '#e0915f' },
  infected: { label: 'INFECTED', color: '#c97a5f' },
  dt_dot: { label: 'DOT', color: '#d9b35f' },
  exposed: { label: 'EXPOSED', color: '#e0c46a' },
};

interface Props {
  enemies: EnemyView[];
  activeIndex: number;
  onSelectActive: (i: number) => void;
  /** Height of the top-right corner the panel sits in (≈ the left stats panel,
   *  measured by ExplorationScreen). The card scrolls vertically past this so a
   *  tall enemy never grows the row — it stays in the corner like the feed. */
  maxHeight?: number;
  /** engine_Dev — combat arena: fill the (tall) column instead of capping at maxHeight, so the
   *  enemy box runs long like the character box. */
  fill?: boolean;
  /** OTA-1103 — player Wisdom, gates reading a (non-boss) enemy's weaknesses. */
  playerWisdom?: number;
}

// OTA-382 — fallback width only. The panel lives in the top-right column
// (ExplorationScreen `rightCol`, ~flex 1 of the top row), NOT the full screen.
// The real width is measured via onLayout below; this estimate (~42% of the
// screen) just sizes the first frame before the measurement lands so cards
// don't flash at zero width.
const FALLBACK_W = Math.round(Dimensions.get('window').width * 0.42);
// Fallback height cap before ExplorationScreen reports the real corner height
// (matches the top row's minHeight). Keeps the panel from growing the row on the
// first frame; the measured stats-panel height takes over once it lands.
const FALLBACK_H = 165;
// Card chrome eaten by padding (8×2) + border (1×2) = 18px.
const CARD_CHROME = 18;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Combine the macro type-resistance map with the enemy's per-instance
 *  resist:/vulnerable: traits into the damage types it resists / is weak to.
 *  OTA-1103 — RECONCILE per type the same way combat does (combineDamageTypeMatch):
 *  a trait that DISAGREES with the type-map wins, so a `resist:X` trait cancels a
 *  type-map weakness (and a `vulnerable:X` overrides a type resist). Without this the
 *  panel would still list an enemy's ORIGINAL type weakness even after per-spawn
 *  randomization flipped it — showing a weakness that's actually now a resistance. */
function defensesFor(enemy: Enemy): { resists: string[]; weaknesses: string[] } {
  const type = enemyTypeDefenses(enemy.type);
  const trait = traitDefenses(enemy.traits);
  const all = Array.from(new Set([...type.resist, ...type.weak, ...trait.resists, ...trait.weaknesses]));
  const resists: string[] = [];
  const weaknesses: string[] = [];
  for (const dt of all) {
    const typeDir = type.weak.includes(dt) ? 1 : type.resist.includes(dt) ? -1 : 0;
    const traitDir = trait.weaknesses.includes(dt) ? 1 : trait.resists.includes(dt) ? -1 : 0;
    // Discord → the per-enemy trait wins (matches combineDamageTypeMatch); else sum.
    const dir = typeDir !== 0 && traitDir !== 0 && typeDir !== traitDir ? traitDir : typeDir + traitDir;
    if (dir > 0) weaknesses.push(dt);
    else if (dir < 0) resists.push(dt);
  }
  return { resists, weaknesses };
}

// OTA-1103 — a WISDOM ≥ this reads an enemy's (randomized) weaknesses off the portrait
// up front; below it you must discover them by landing hits (the combat log's
// "Weakness exposed" line is the feedback). Matches the parley WIS_REVEAL_THRESHOLD, so
// Wisdom is the consistent "scout the enemy" stat. Bosses always show.
const WEAKNESS_READ_WIS = 12;

export function EnemyPanel({ enemies, activeIndex, onSelectActive, maxHeight, fill, playerWisdom }: Props) {
  const canReadDefenses = (playerWisdom ?? 0) >= WEAKNESS_READ_WIS;
  // Measure the column we actually live in so cards fit the top-right corner
  // (portrait), instead of being sized to the full screen width and spilling
  // out into a left/right-scrolling "landscape" strip.
  const [panelW, setPanelW] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - panelW) > 0.5) setPanelW(w);
  }, [panelW]);

  const cardWidth = panelW > 0 ? panelW : FALLBACK_W;
  const hpBarWidth = Math.max(0, cardWidth - CARD_CHROME);
  // engine_Dev — combat arena: tint the whole enemy band by the ACTIVE enemy's health (the one
  // staged/targeted), so the band reads green→red as you wear it down — no HP bar needed. The inner
  // card goes transparent in `fill` so this band tint shows through full-height.
  const activeEnemy = enemies[activeIndex] ?? enemies[0];
  const bandHpFrac = activeEnemy
    ? Math.max(0, Math.min(1, activeEnemy.currentHp / Math.max(1, activeEnemy.enemy.hp)))
    : 1;
  // Cap the card to the corner height; taller content scrolls vertically (like
  // the exploration feed) rather than growing the top row. Leave a little room
  // below for the paging dots when more than one enemy is staged.
  const capH = Math.max(80, (maxHeight && maxHeight > 0 ? maxHeight : FALLBACK_H) - (enemies.length > 1 ? 16 : 0));

  // Wrap a card so it scrolls vertically inside the corner instead of overflowing.
  // engine_Dev — combat arena: when `fill`, take the whole tall column (flex:1) instead of capping
  // at maxHeight, so the enemy box runs long like the character box.
  const scrollWrap = (card: React.ReactNode) => (
    <ScrollView
      style={fill ? { flex: 1 } : { maxHeight: capH }}
      showsVerticalScrollIndicator
      nestedScrollEnabled
    >
      {card}
    </ScrollView>
  );

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / cardWidth);
      if (idx !== activeIndex && idx >= 0 && idx < enemies.length) {
        onSelectActive(idx);
      }
    },
    [activeIndex, enemies.length, onSelectActive, cardWidth],
  );

  // arb146 — tapping a card opens a full-detail popup (everything the cramped
  // corner portrait can't fit: full trait descriptions, resist/weak/deals, all
  // active effects with turns left). Multi-enemy TARGETING stays on the
  // horizontal swipe-pager, so tap is free to mean "show me this one." Player
  // ask: "tap the enemy's portrait → full pop-up → dismiss back to a portrait."
  const [detailView, setDetailView] = useState<EnemyView | null>(null);

  const renderItem: ListRenderItem<EnemyView> = ({ item }) => (
    <TouchableOpacity activeOpacity={0.7} onPress={() => setDetailView(item)} style={fill ? styles.fillTouch : undefined}>
      {scrollWrap(<EnemyCard view={item} cardWidth={cardWidth} hpBarWidth={hpBarWidth} fill={fill} canRead={canReadDefenses} />)}
    </TouchableOpacity>
  );

  // onLayout must stay mounted even when empty so the measurement is ready the
  // instant combat starts; render the (empty) wrap and bail on the list.
  return (
    <>
    <View
      style={[styles.wrap, fill ? styles.wrapFill : null, fill ? { backgroundColor: healthCardBg(bandHpFrac) } : null]}
      onLayout={onLayout}
    >
      {enemies.length === 0 ? null : enemies.length === 1 ? (
        // Single enemy: no pager (nothing to scroll horizontally), just the card —
        // capped to the corner height and vertically scrollable when it's tall.
        // arb146 — tappable to open the full-detail popup.
        <TouchableOpacity activeOpacity={0.7} onPress={() => setDetailView(enemies[0]!)} style={fill ? styles.fillTouch : undefined}>
          {scrollWrap(<EnemyCard view={enemies[0]!} cardWidth={cardWidth} hpBarWidth={hpBarWidth} fill={fill} canRead={canReadDefenses} />)}
        </TouchableOpacity>
      ) : (
        <FlatList
          data={enemies}
          // OTA 197 — extraData forces FlatList to re-render the visible cells
          // when a value not present in `data` changes (HP ticking down).
          extraData={`${cardWidth}|${enemies.map((v) => `${v.currentHp}/${v.enemy.hp}/${(v.statuses ?? []).map((s) => `${s.kind}:${s.turnsRemaining}`).join(',')}`).join('|')}`}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={renderItem}
          snapToInterval={cardWidth}
          decelerationRate="fast"
        />
      )}
      {enemies.length > 1 && (
        <View style={styles.dots}>
          {enemies.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
          <Text style={styles.hint}>swipe to target · tap for details</Text>
        </View>
      )}
    </View>
    {/* arb146 — full enemy detail popup. */}
    <BrandedModal
      visible={!!detailView}
      title={detailView?.enemy.name ?? ''}
      body={detailView ? enemyDetailBody(detailView, canReadDefenses) : undefined}
      buttons={[{ label: 'Close', tone: 'primary', onPress: () => setDetailView(null) }]}
      onRequestClose={() => setDetailView(null)}
    />
    </>
  );
}

// arb146 — format an enemy into the full-detail popup body. Mirrors EnemyCard's
// AC/attack math so the popup agrees with the portrait, and adds everything the
// cramped corner can't fit: full trait descriptions + all active effects.
function enemyDetailBody(view: EnemyView, canRead: boolean): string {
  const e = view.enemy;
  const apMatch = String(e.abilityPoint ?? '').match(/\d+/);
  const apNum = apMatch ? parseInt(apMatch[0], 10) : NaN;
  const baseAc = isNaN(apNum) ? 8 : Math.max(5, Math.min(18, 5 + apNum));
  const ac = Math.max(1, baseAc + traitACBonus(e.traits) + (e.boss ? 6 : 0));
  const attackNum = parseInt(String(e.attack), 10);
  const atkLabel = Number.isFinite(attackNum) ? `+${attackNum}` : String(e.attack);
  const defenses = defensesFor(e);
  const dealsType = enemyDamageType(e);
  const lines: string[] = [];
  lines.push(`${e.type}${e.boss ? ' · BOSS' : ''} · ${e.rarity}`);
  if (view.rangeLabel) {
    lines.push(`Range: ${view.rangeLabel}${(view.inRange ?? true) ? '' : ' (out of range)'}`);
  }
  lines.push('');
  lines.push(`HP ${view.currentHp}/${e.hp}     AC ${ac}`);
  lines.push(`Attack ${atkLabel}     Damage ${e.damage}${dealsType ? ` (${cap(dealsType)})` : ''}`);
  // OTA-1103 — a non-boss enemy's (randomized) defenses are WIS-gated: read them up
  // front only with enough Wisdom, else discover by hitting.
  if (e.boss || canRead) {
    if (defenses.resists.length) lines.push(`Resists: ${defenses.resists.map(cap).join(', ')}`);
    if (defenses.weaknesses.length) lines.push(`Weak to: ${defenses.weaknesses.map(cap).join(', ')}`);
  } else if (defenses.resists.length || defenses.weaknesses.length) {
    lines.push('Defenses: unknown — strike to learn (Wisdom 12 reads them on sight)');
  }
  const traits = e.traits ?? [];
  if (traits.length) {
    lines.push('');
    lines.push('Traits:');
    for (const t of traits) lines.push(`· ${describeTrait(t)}`);
  }
  const statuses = view.statuses ?? [];
  if (statuses.length) {
    lines.push('');
    lines.push('Active effects:');
    for (const s of statuses) {
      const meta = STATUS_META[s.kind];
      lines.push(`· ${meta?.label ?? s.kind} — ${s.dmgPerTurn}/turn, ${s.turnsRemaining} turn(s) left`);
    }
  }
  return lines.join('\n');
}

function EnemyCard({ view, cardWidth, hpBarWidth, fill, canRead }: { view: EnemyView; cardWidth: number; hpBarWidth: number; fill?: boolean; canRead: boolean }) {
  // OTA-419 — mirror combatRules.enemyAC EXACTLY so the panel's AC matches what
  // combat uses to hit: pull the number out of "Strength 4" (parseInt got NaN →
  // the panel showed a flat AC 5 and never added the boss +6). NaN falls back to
  // 8 like combat, and bosses get the same +6 wall.
  const apMatch = String(view.enemy.abilityPoint ?? '').match(/\d+/);
  const apNum = apMatch ? parseInt(apMatch[0], 10) : NaN;
  const baseAc = isNaN(apNum) ? 8 : Math.max(5, Math.min(18, 5 + apNum));
  const ac = Math.max(1, baseAc + traitACBonus(view.enemy.traits) + (view.enemy.boss ? 6 : 0));
  const attackNum = parseInt(String(view.enemy.attack), 10);
  const atkLabel = Number.isFinite(attackNum) ? `+${attackNum}` : String(view.enemy.attack);
  const hpPct = Math.max(0, Math.min(1, view.currentHp / Math.max(1, view.enemy.hp)));
  const hpColor = hpPct > 0.5 ? '#9ec96a' : hpPct > 0.2 ? '#6ab0c9' : '#e07a5f';
  // Range indicator. Engine doesn't track per-enemy positioning yet —
  // anyone staged in the scene is in arm's reach. Once positioning is
  // added this becomes view.inRange.
  const inRange = view.inRange ?? true;
  const defenses = defensesFor(view.enemy);
  // arb119 — the damage type THIS enemy deals (what to armor up against),
  // shown under RESIST/WEAK so the portrait answers "what hits me?" for the
  // resistance-minded player without reading the combat log.
  const dealsType = enemyDamageType(view.enemy);

  return (
    <View style={[styles.card, { width: cardWidth }, fill ? styles.cardFill : null]}>
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={1}>
          {view.enemy.name}
        </Text>
        <Text style={styles.rarity}>{view.enemy.rarity}</Text>
      </View>
      <View style={styles.subhead}>
        <Text style={styles.subline} numberOfLines={1}>
          {view.enemy.type}
        </Text>
        <Text style={[styles.range, inRange ? styles.rangeIn : styles.rangeOut]}>
          {view.rangeLabel
            ? `${view.rangeLabel.toUpperCase()}${inRange ? '' : ' · OUT'}`
            : inRange ? 'IN RANGE' : 'OUT OF RANGE'}
        </Text>
      </View>
      {/* engine_Dev — combat arena: no HP bar during combat; the band BACKGROUND tints by health
          instead (see EnemyPanel bandHpFrac). Outside the arena (corner portrait) the bar stays. */}
      {!fill && (
        <View style={[styles.hpBarBg, { width: hpBarWidth }]}>
          {/* OTA-081 — numeric pixel width (was percent string): RN sometimes
              skipped the layout pass when only the percent changed, leaving the
              bar stuck full while the HP number ticked down. */}
          <View
            style={[
              styles.hpBarFill,
              { width: Math.max(0, Math.round(hpBarWidth * hpPct)), backgroundColor: hpColor },
            ]}
          />
        </View>
      )}
      {/* Portrait stat grid: two rows of two so it fits the narrow column. */}
      <View style={styles.statGrid}>
        <Stat label="HP" value={`${view.currentHp}/${view.enemy.hp}`} />
        <Stat label="AC" value={String(ac)} />
        <Stat label="ATK" value={atkLabel} />
        <Stat label="DMG" value={String(view.enemy.damage)} />
      </View>
      <View style={styles.defs}>
        {/* OTA-1103 — a non-boss enemy's randomized RESIST/WEAK are WIS-gated (read
            required); a boss always shows. Below the threshold you learn by hitting.
            engine_Dev keeps both lists visible (with a "—" when empty) once readable. */}
        {(view.enemy.boss || canRead) ? (
          <>
            <Text style={styles.defLine} numberOfLines={2}>
              <Text style={styles.defResist}>RESIST </Text>
              <Text style={styles.defVal}>{defenses.resists.length ? defenses.resists.map(cap).join(', ') : '—'}</Text>
            </Text>
            <Text style={styles.defLine} numberOfLines={2}>
              <Text style={styles.defWeak}>WEAK </Text>
              <Text style={styles.defVal}>{defenses.weaknesses.length ? defenses.weaknesses.map(cap).join(', ') : '—'}</Text>
            </Text>
          </>
        ) : (
          <Text style={styles.defLine} numberOfLines={2}>
            <Text style={styles.defResist}>DEF </Text>
            <Text style={styles.defVal}>? — strike to learn</Text>
          </Text>
        )}
        {/* arb119 — what the enemy DEALS, so armor choices have a target. */}
        <Text style={styles.defLine} numberOfLines={1}>
          <Text style={styles.defDeals}>DEALS </Text>
          <Text style={styles.defVal}>{cap(dealsType)}</Text>
        </Text>
      </View>
      {/* OTA-401 — active coating/DOT statuses on this enemy + turns left.
          One badge per status: "POISON · 3t · 4/turn". Lets the player
          confirm a coating actually landed and track how long it ticks. */}
      {view.statuses && view.statuses.length > 0 && (
        <View style={styles.statusCol}>
          {view.statuses.map((st, i) => {
            const meta = STATUS_META[st.kind] ?? { label: st.kind.toUpperCase(), color: '#6ab0c9' };
            const turns = `${st.turnsRemaining}t left`;
            const dmg = st.dmgPerTurn > 0 ? ` · ${st.dmgPerTurn}/turn` : '';
            return (
              <Text key={`${st.kind}-${i}`} style={[styles.statusBadge, { borderColor: meta.color }]} numberOfLines={1}>
                <Text style={[styles.statusLabel, { color: meta.color }]}>{meta.label} </Text>
                <Text style={styles.statusVal}>{turns}{dmg}</Text>
              </Text>
            );
          })}
        </View>
      )}
      {view.enemy.traits && view.enemy.traits.length > 0 && (
        <View style={styles.traitRow}>
          {view.enemy.traits.map((t) => (
            <Text key={t} style={styles.traitBadge}>
              {describeTrait(t)}
            </Text>
          ))}
        </View>
      )}
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
  wrap: { width: '100%' },
  // engine_Dev — combat arena: the enemy column becomes a tall filled box (matches the char box),
  // and every link in the flex chain (wrap → TouchableOpacity → ScrollView) fills so it doesn't
  // collapse to zero height.
  // engine_Dev — combat arena: light outline (matches the player band) for a clean divide; the
  // backgroundColor is overridden inline with the health-tinted band color (healthCardBg).
  wrapFill: { flex: 1, backgroundColor: '#0e1618', borderColor: '#8fa6ac', borderWidth: 1.5, borderRadius: 6, overflow: 'hidden' },
  fillTouch: { flex: 1 },
  card: {
    backgroundColor: '#0e1618',
    borderColor: '#5a2a26',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
  // engine_Dev — combat arena: the inner card goes transparent + borderless so the health-tinted
  // band (wrapFill) shows through the full height instead of a small dark card floating on it.
  cardFill: { backgroundColor: 'transparent', borderColor: 'transparent' },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  name: { color: '#e07a5f', fontSize: 14, fontWeight: '700', letterSpacing: 1, flexShrink: 1 },
  rarity: { color: '#6c8088', fontSize: 10, letterSpacing: 1, marginLeft: 6 },
  subhead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  range: { fontSize: 9, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, borderWidth: 1, marginLeft: 6 },
  rangeIn: { color: '#9ec96a', borderColor: '#3d5a2c' },
  rangeOut: { color: '#6c8088', borderColor: '#2b3a3e' },
  subline: { color: '#6c8088', fontSize: 11, flexShrink: 1 },
  hpBarBg: {
    height: 6,
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
  },
  hpBarFill: { height: '100%' },
  // Two-up grid (HP / AC then ATK / DMG) so the stats stack portrait-style in
  // the narrow column rather than spreading into a wide single row.
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  stat: { width: '50%', paddingVertical: 1 },
  statLabel: { color: '#6c8088', fontSize: 9, letterSpacing: 1 },
  statValue: { color: '#d6e4e8', fontSize: 12, fontWeight: '600' },
  defs: { marginTop: 4, gap: 1 },
  defLine: { fontSize: 10, letterSpacing: 0.5 },
  defResist: { color: '#9ec96a', fontWeight: '700', fontSize: 9, letterSpacing: 1 },
  defWeak: { color: '#e07a5f', fontWeight: '700', fontSize: 9, letterSpacing: 1 },
  // arb119 — DEALS uses a neutral amber (distinct from RESIST green / WEAK red):
  // it's neither good nor bad for the player, just "what's coming at you."
  defDeals: { color: '#d9a566', fontWeight: '700', fontSize: 9, letterSpacing: 1 },
  defVal: { color: '#c9b89a', fontSize: 10 },
  statusCol: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  statusBadge: {
    fontSize: 9,
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderRadius: 2,
  },
  statusLabel: { fontWeight: '700', fontSize: 9, letterSpacing: 1 },
  statusVal: { color: '#c9b89a', fontSize: 9 },
  traitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  traitBadge: {
    color: '#6ab0c9',
    fontSize: 9,
    letterSpacing: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderColor: '#5a4a2e',
    borderWidth: 1,
    borderRadius: 2,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2b3a3e' },
  dotActive: { backgroundColor: '#6ab0c9' },
  hint: { color: '#6c8088', fontSize: 9, letterSpacing: 1, marginLeft: 8 },
});
