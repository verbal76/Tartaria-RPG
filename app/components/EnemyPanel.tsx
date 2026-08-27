import React, { useCallback, useState } from 'react';
import { enemyDamageCompact } from '../engine/combatRules';
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
import { enemyPowerScore, powerMatchup } from '../engine/powerRating';
import { enemyTypeDefenses } from '../engine/crafting';
import { enemyDamageType } from '../engine/damageTypes';
import { BrandedModal } from './BrandedModal';

/** OTA-401 — a single active status (coating DOT / infection) on an
 *  enemy, mirrored from `currentScene.enemyStatuses[i]`. Surfaced on the
 *  panel so the player can see what's ticking and how many combat turns
 *  it has left. */
export interface EnemyStatusView {
  kind: 'infected' | 'poison_coat' | 'acid_coat' | 'corruption_coat' | 'electrical_coat' | 'burn_coat' | 'cold_coat' | 'typed_dot';
  turnsRemaining: number;
  dmgPerTurn: number;
  sourceName: string;
}

export interface EnemyView {
  enemy: Enemy;
  currentHp: number;
  /** Optional range indicator. Defaults to true (engine is single-enemy / in-melee). */
  inRange?: boolean;
  /** Human-readable range label — "arm's reach", "close", "far". */
  rangeLabel?: string;
  /** ⚠⚠ OTA-1502 — WHAT EACH HAND CAN DO ABOUT *THIS* ENEMY. The owner:
   *  *"if I keep swiping and all of a sudden I'm weapons green across the
   *  board, then I know that I'm standing in front of that person."* The card
   *  spoke for the MAIN hand alone, so a dual-wielder carrying the melee /
   *  ranged pair — the loadout the whole range system exists to serve — could
   *  not read his off hand at all. One entry per filled hand; a single
   *  bare-hands entry when both are empty. */
  hands?: Array<{ slot: 'main' | 'off'; label: string; inRange: boolean }>;
  /** ⚠⚠ OTA-1508 — THE OWNER'S THREAT DOT, his words: *"a small circle in
   *  one of the bottom corners … red means they can hit me, yellow is they
   *  can reach me but it'd be weak damage, green means they can't touch
   *  me."* Judged at THIS enemy's own ring by the same resolver the counter
   *  volley uses (enemyThreatAt). */
  threat?: 'red' | 'yellow' | 'green';
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
  cold_coat: { label: 'FROST', color: '#8fd4e8' },
  infected: { label: 'INFECTED', color: '#c97a5f' },
  // Combat-Parity II — built-in damage-type DOT (burn/poison/radiation procs). Distinct accent
  // from the coating families so a typed-DOT stack reads clearly on the enemy panel.
  typed_dot: { label: 'DOT', color: '#e0c05f' },
};

interface Props {
  enemies: EnemyView[];
  activeIndex: number;
  onSelectActive: (i: number) => void;
  /** Height of the top-right corner the panel sits in (≈ the left stats panel,
   *  measured by ExplorationScreen). The card scrolls vertically past this so a
   *  tall enemy never grows the row — it stays in the corner like the feed. */
  maxHeight?: number;
  /** OTA-798 — player Wisdom, gates reading a (non-boss) enemy's weaknesses. */
  playerWisdom?: number;
  /** OTA-838 — enemy intel learned by fighting (worldMemory.enemyIntel), keyed by
   *  lowercased enemy name. Even below the Wisdom read-threshold, a type you've SEEN
   *  bite (weak) or wash off (resist) is revealed on the portrait. */
  enemyIntel?: Record<string, { weak: string[]; resist: string[] }>;
  /** OTA-928 — the player's Power rating, to colour each enemy's Power badge by matchup. */
  playerPower?: number;
  /** OTA-1117 — the `witholdIntel` difficulty dial. When set, the WIS-granted
   *  free read is switched off: a hard run tells you nothing about a foe that
   *  the bestiary has not EARNED by hitting it. Never touches the `observed`
   *  path below — "strike to learn" is the whole point, and a dial that also
   *  took that away would just be blindness, not difficulty. */
  witholdIntel?: boolean;
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
 *  OTA-798 — RECONCILE per type the same way combat does (combineDamageTypeMatch):
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

// OTA-798 — a WISDOM ≥ this reads an enemy's (randomized) weaknesses off the portrait
// up front; below it you must discover them by landing hits (the combat log's
// "Weakness exposed" line is the feedback). Matches the parley WIS_REVEAL_THRESHOLD, so
// Wisdom is the consistent "scout the enemy" stat. Bosses always show (OTA-798).
const WEAKNESS_READ_WIS = 12;

// OTA-799 — the WIS read is DIEGETIC: instead of a bare "WEAK: burn" label, the detail
// popup narrates what you notice about the creature that gives the weakness/resistance
// away. Keeps the concrete damage type in parentheses so it's still actionable.
const WEAK_FLAVOR: Record<string, string> = {
  burn: 'its hide is dry and cracked — fire would take fast',
  electrical: "it's waterlogged and conductive — a shock would run right through it",
  radiation: 'its flesh is unstable — radiation would rot it fast',
  bludgeoning: 'its form is brittle — a heavy blow would shatter it',
  cold: 'it runs hot and quick — cold would seize it up',
  slashing: 'its skin is thin — a keen edge would open it',
  piercing: 'it wears no plate — a point would sink deep',
  poison: 'it still draws breath — venom would take hold',
  aetheric: 'its binding is loose — aether would unmake it',
};
const RESIST_FLAVOR: Record<string, string> = {
  slashing: 'blades skate off it',
  piercing: 'points fail to find anything vital',
  bludgeoning: 'blunt blows deform it and it just resets',
  burn: 'flame barely marks it',
  electrical: 'current earths away harmlessly',
  cold: 'the chill does not touch it',
  poison: 'it has no biology for venom to work on',
  radiation: 'radiation washes over it',
  aetheric: 'aether slides off it unheeded',
};

export function EnemyPanel({ enemies, activeIndex, onSelectActive, maxHeight, playerWisdom, enemyIntel, playerPower, witholdIntel }: Props) {
  // OTA-1117 — the RULE dial, and the survey's reason for rating rule changes
  // above multipliers: this costs nothing to compute and changes how the fight
  // is PLAYED rather than how long it takes. A high-WIS character normally
  // reads a foe's resists and weaknesses on sight; under `witholdIntel` that
  // read is gone and the only tags on the card are ones this character has
  // personally felt land or wash off.
  // ⚠ TWO THINGS IT DELIBERATELY DOES NOT TOUCH. The `observed` path below
  // stays live — strike-to-learn IS the replacement for the free read, and
  // removing both would be blindness rather than difficulty. And a BOSS still
  // shows its defenses: that reveal exists because the owner asked for it
  // twice ("Core Guardians show no weakness/resistance in combat"), and a
  // difficulty dial has no business re-breaking a bug someone reported twice.
  const canReadDefenses = !witholdIntel && (playerWisdom ?? 0) >= WEAKNESS_READ_WIS;
  // OTA-838 — per-enemy observed intel lookup (lowercased name). Passed to each card
  // so an already-learned weakness shows even for a low-Wisdom character.
  const intelFor = useCallback(
    (name: string) => enemyIntel?.[name.toLowerCase()],
    [enemyIntel],
  );
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
  // Cap the card to the corner height; taller content scrolls vertically (like
  // the exploration feed) rather than growing the top row. Leave a little room
  // below for the paging dots when more than one enemy is staged.
  const capH = Math.max(80, (maxHeight && maxHeight > 0 ? maxHeight : FALLBACK_H) - (enemies.length > 1 ? 16 : 0));

  // Wrap a card so it scrolls vertically inside the corner instead of overflowing.
  //
  // ⚠⚠⚠ OTA-1514 — THE SCROLLVIEW MUST BE THE PARENT, AND THAT IS THE WHOLE
  // BUG. Owner: *"we can no longer scroll up to see the bottom of the enemy
  // portrait."* The word that matters is NO LONGER — this used to work.
  // arb146 added tap-to-open-the-detail-popup by wrapping this ScrollView in a
  // TouchableOpacity, and in React Native a parent Touchable WINS THE RESPONDER
  // on a vertical drag: the gesture is claimed as a press before the inner
  // ScrollView ever sees it, so the card was capped at `capH` with no way to
  // reach what the cap cut off. A scroll container inside a press target does
  // not scroll.
  //
  // Inverted: the ScrollView owns the pan, and the Touchable sits INSIDE around
  // the card, where a tap still reaches it (a ScrollView passes taps through to
  // its children — it only intercepts drags). Both gestures now do what they
  // look like they do.
  //
  // ⚠ OTA-1512 moved the threat dot to the head row so the mark was legible
  // WITHOUT scrolling — that was the right fix for the dot, and it left this
  // one standing: everything else below the fold (traits, effects, the full
  // stat grid) was still unreachable. Two defects in one sentence of his.
  const scrollWrap = (card: React.ReactNode, onPress: () => void) => (
    <ScrollView
      style={{ maxHeight: capH }}
      showsVerticalScrollIndicator
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity accessibilityRole="button" activeOpacity={0.7} onPress={onPress}>
        {card}
      </TouchableOpacity>
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

  const renderItem: ListRenderItem<EnemyView> = ({ item }) => scrollWrap(
    <EnemyCard view={item} cardWidth={cardWidth} hpBarWidth={hpBarWidth} canRead={canReadDefenses} observed={intelFor(item.enemy.name)} playerPower={playerPower} />,
    () => setDetailView(item),
  );

  // onLayout must stay mounted even when empty so the measurement is ready the
  // instant combat starts; render the (empty) wrap and bail on the list.
  return (
    <>
    <View style={styles.wrap} onLayout={onLayout}>
      {enemies.length === 0 ? null : enemies.length === 1 ? (
        // Single enemy: no pager (nothing to scroll horizontally), just the card —
        // capped to the corner height and vertically scrollable when it's tall.
        // arb146 — tappable to open the full-detail popup.
        scrollWrap(
          <EnemyCard view={enemies[0]!} cardWidth={cardWidth} hpBarWidth={hpBarWidth} canRead={canReadDefenses} observed={intelFor(enemies[0]!.enemy.name)} playerPower={playerPower} />,
          () => setDetailView(enemies[0]!),
        )
      ) : (
        <FlatList
          data={enemies}
          // OTA-929 — BLANK-PORTRAIT-AFTER-A-KILL fix. A kill removes the fallen enemy from
          // currentScene.enemies and REINDEXES it, but this pager keyed cells on the array INDEX
          // and kept its stale scroll offset — so after "you beat one of them" the visible card
          // recycled to a blank/wrong page. Key the pager on the enemy ROSTER (names) so a kill
          // remounts a FRESH list (HP ticks don't change the roster, so they still update in place
          // via extraData), and reopen it on the ACTIVE enemy (the next target) rather than page 0.
          key={enemies.map((v) => v.enemy.name).join('|')}
          getItemLayout={(_, index) => ({ length: cardWidth, offset: cardWidth * index, index })}
          initialScrollIndex={Math.min(activeIndex, Math.max(0, enemies.length - 1))}
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
          <Text style={styles.hint}>swipe to aim · tap for info</Text>
        </View>
      )}
    </View>
    {/* arb146 — full enemy detail popup. */}
    <BrandedModal
      visible={!!detailView}
      title={detailView?.enemy.name ?? ''}
      body={detailView ? enemyDetailBody(detailView, canReadDefenses, intelFor(detailView.enemy.name)) : undefined}
      buttons={[{ label: 'Close', tone: 'primary', onPress: () => setDetailView(null) }]}
      onRequestClose={() => setDetailView(null)}
    />
    </>
  );
}

// arb146 — format an enemy into the full-detail popup body. Mirrors EnemyCard's
// AC/attack math so the popup agrees with the portrait, and adds everything the
// cramped corner can't fit: full trait descriptions + all active effects.
function enemyDetailBody(view: EnemyView, canRead: boolean, observed?: { weak: string[]; resist: string[] }): string {
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
  // ⚠⚠ OTA-1512 — THE POPUP ANSWERS IT TOO. The owner tapped the portrait
  // precisely because the dot was clipped, and found the popup had never
  // carried the threat at all — so both routes to the same question were
  // dead. This body is plain text, so the dot becomes its glyph and its
  // sentence: the colour is the same verdict (enemyThreatAt), spelled out.
  if (view.threat) {
    const says = view.threat === 'red' ? '● RED — it can hit you where you stand'
      : view.threat === 'yellow' ? '● YELLOW — it can reach you, but only weakly'
        : '● GREEN — it cannot touch you from there';
    lines.push(`Threat: ${says}`);
  }
  lines.push('');
  lines.push(`HP ${view.currentHp}/${e.hp}     AC ${ac}`);
  // OTA-1139 (audit) — a boss's real per-round output, not the notation third of it.
  lines.push(`Attack ${atkLabel}     Damage ${enemyDamageCompact(e)}${dealsType ? ` (${cap(dealsType)})` : ''}`);
  // OTA-818/819 — a non-boss enemy's (randomized) defenses are WIS-gated: read them up
  // front only with enough Wisdom, else discover by hitting. OTA-799 — the read is
  // DIEGETIC: narrate what you notice, with the damage type in parens.
  if (e.boss || canRead) {
    for (const w of defenses.weaknesses) lines.push(`You size it up — ${WEAK_FLAVOR[w] ?? `it looks vulnerable to ${w}`}. (Weak: ${cap(w)})`);
    for (const r of defenses.resists) lines.push(`— ${RESIST_FLAVOR[r] ?? `it shrugs off ${r}`}. (Resists: ${cap(r)})`);
  } else if (defenses.resists.length || defenses.weaknesses.length) {
    // OTA-838 — you can't read it on sight, but anything you've already SEEN in combat
    // (recorded in worldMemory.enemyIntel) is revealed here — "strike to learn" made real.
    const ow = observed?.weak ?? [];
    const orr = observed?.resist ?? [];
    if (ow.length || orr.length) {
      for (const w of ow) lines.push(`You've seen it flinch from ${WEAK_FLAVOR[w] ?? w}. (Weak: ${cap(w)})`);
      for (const r of orr) lines.push(`You've seen it shrug off ${r} — ${RESIST_FLAVOR[r] ?? 'it barely marks'}. (Resists: ${cap(r)})`);
      lines.push('Keep striking with new types to learn the rest (Wisdom 12 reads them on sight).');
    } else {
      lines.push("You can't read its weaknesses at a glance — strike it and watch what bites (Wisdom 12 reads them on sight).");
    }
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

function EnemyCard({ view, cardWidth, hpBarWidth, canRead, observed, playerPower }: { view: EnemyView; cardWidth: number; hpBarWidth: number; canRead: boolean; observed?: { weak: string[]; resist: string[] }; playerPower?: number }) {
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
  const hpColor = hpPct > 0.5 ? '#9ec96a' : hpPct > 0.2 ? '#c9a86a' : '#e07a5f';
  // Range indicator. Engine doesn't track per-enemy positioning yet —
  // anyone staged in the scene is in arm's reach. Once positioning is
  // added this becomes view.inRange.
  const inRange = view.inRange ?? true;
  const defenses = defensesFor(view.enemy);
  // arb119 — the damage type THIS enemy deals (what to armor up against),
  // shown under RESIST/WEAK so the portrait answers "what hits me?" for the
  // resistance-minded player without reading the combat log.
  const dealsType = enemyDamageType(view.enemy);
  // OTA-928 — this enemy's Power rating, faced against the player's for the colour.
  const enemyPower = enemyPowerScore(view.enemy);
  const matchup = typeof playerPower === 'number' ? powerMatchup(playerPower, enemyPower) : 'even';

  return (
    <View
      style={[styles.card, { width: cardWidth }]}
      accessibilityLabel={`${view.enemy.name}, ${view.enemy.type}, ${view.enemy.rarity}. HP ${view.currentHp} of ${view.enemy.hp}, AC ${ac}, ${inRange ? 'in range' : 'out of range'}${
        view.threat ? `. Threat: ${view.threat === 'red' ? 'can hit you' : view.threat === 'yellow' ? 'can reach you weakly' : 'cannot reach you'}` : ''
      }`}
    >
      <View style={styles.head}>
        <View style={styles.headLeft}>
          {/* ⚠⚠⚠ OTA-1512 — THE DOT MOVED TO THE TOP, because at the bottom it
              could not be seen at all. Owner: *"we can no longer scroll up to
              see the bottom of the enemy portrait, and the colored range dot
              isn't in the popup when we tap the enemy portrait, so i cannot
              see it either way."* OTA-1508 pinned it to the card's
              bottom-right with `position:'absolute'`, which put the one thing
              that answers "can it hit me?" on the single edge the corner
              panel clips. A signal you have to scroll to is not a signal.
              Riding in the head row beside the Power rating it is on the
              first line of the card, cannot be clipped, and sits next to the
              other at-a-glance matchup colour. Same resolver, same meaning —
              only the position changed. (The popup carries it too now; see
              enemyDetailBody.) */}
          {!!view.threat && (
            <View
              style={[styles.threatDot, styles[`threat_${view.threat}`]]}
              accessibilityLabel={`threat ${view.threat}`}
            />
          )}
          {/* OTA-928 — enemy Power rating, top-left; faces the player's Power (top-right
              of the stats panel). Colour by matchup: red = it outclasses you. */}
          <Text
            style={[styles.enemyPower, matchup === 'danger' ? styles.enemyPowerDanger : matchup === 'favored' ? styles.enemyPowerFavored : styles.enemyPowerEven]}
            accessibilityLabel={`Enemy power rating ${enemyPower}`}
          >
            ◆ {enemyPower}
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {view.enemy.name}
          </Text>
        </View>
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
      {/* ⚠⚠ OTA-1502 — THE HANDS, PER ENEMY. Green = that hand reaches THIS
          foe from where you stand; red = it cannot. Swiping the pager until
          both read green is how the owner asked to find the man he can hit
          without walking into anyone else's reach. */}
      {!!view.hands?.length && (
        <View style={styles.handsRow}>
          {view.hands.map((h) => (
            <Text
              key={h.slot}
              style={[styles.hand, h.inRange ? styles.handIn : styles.handOut]}
              numberOfLines={1}
              accessibilityLabel={`${h.slot === 'main' ? 'Main hand' : 'Off hand'} ${h.label}, ${h.inRange ? 'in range' : 'out of range'}`}
            >
              {/* ⚠ NOT ▲/▼ — OTA-1499/1500 spent a tutorial beat teaching those
                  as BETTER/WORSE than your equipped gear. A lit/unlit dot says
                  "this hand can reach" without borrowing a taught meaning. */}
              {h.inRange ? '●' : '○'} {h.label}
            </Text>
          ))}
        </View>
      )}
      {/* OTA-897 (SA-5) — the bestiary voice line also greets you on the combat
          card, so a foe reads as a described creature, not a bare stat block. */}
      {!!view.enemy.flavor && (
        <Text style={styles.flavorLine} numberOfLines={3}>{view.enemy.flavor}</Text>
      )}
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
      {/* Portrait stat grid: two rows of two so it fits the narrow column. */}
      <View style={styles.statGrid}>
        <Stat label="HP" value={`${view.currentHp}/${view.enemy.hp}`} />
        <Stat label="AC" value={String(ac)} />
        <Stat label="ATK" value={atkLabel} />
        <Stat label="DMG" value={enemyDamageCompact(view.enemy)} />
      </View>
      <View style={styles.defs}>
        {/* OTA-798 — a non-boss enemy's randomized RESIST/WEAK are WIS-gated (read
            required); a boss always shows. Below the threshold you learn by hitting. */}
        {(view.enemy.boss || canRead) ? (
          <>
            {defenses.resists.length > 0 && (
              <Text style={styles.defLine} numberOfLines={2}>
                <Text style={styles.defResist}>RESIST </Text>
                <Text style={styles.defVal}>{defenses.resists.map(cap).join(', ')}</Text>
              </Text>
            )}
            {defenses.weaknesses.length > 0 && (
              <Text style={styles.defLine} numberOfLines={2}>
                <Text style={styles.defWeak}>WEAK </Text>
                <Text style={styles.defVal}>{defenses.weaknesses.map(cap).join(', ')}</Text>
              </Text>
            )}
          </>
        ) : (defenses.resists.length > 0 || defenses.weaknesses.length > 0) && (
          // OTA-838 — below the Wisdom read-threshold, reveal only what you've LEARNED
          // by hitting it (worldMemory.enemyIntel). Nothing learned yet → the prompt.
          (observed && (observed.weak.length > 0 || observed.resist.length > 0)) ? (
            <>
              {observed.resist.length > 0 && (
                <Text style={styles.defLine} numberOfLines={2}>
                  <Text style={styles.defResist}>RESIST </Text>
                  <Text style={styles.defVal}>{observed.resist.map(cap).join(', ')}</Text>
                </Text>
              )}
              {observed.weak.length > 0 && (
                <Text style={styles.defLine} numberOfLines={2}>
                  <Text style={styles.defWeak}>WEAK </Text>
                  <Text style={styles.defVal}>{observed.weak.map(cap).join(', ')}</Text>
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.defLine} numberOfLines={2}>
              <Text style={styles.defResist}>DEF </Text>
              <Text style={styles.defVal}>? — strike to learn</Text>
            </Text>
          )
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
            const meta = STATUS_META[st.kind] ?? { label: st.kind.toUpperCase(), color: '#c9a86a' };
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
  card: {
    backgroundColor: '#13110f',
    borderColor: '#5a2a26',
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
  },
  // OTA-1508 — the threat dot. A thin dark ring keeps it readable against
  // whatever sits behind it.
  // ⚠ OTA-1512 — no longer absolute/bottom-right (it was clipped there and the
  // owner could not see it at all): a flex child of the head row, aligned to
  // the Power text's centre rather than the baseline a circle has none of.
  threatDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#0d0b0a',
    alignSelf: 'center',
  },
  threat_red: { backgroundColor: '#e05f5f' },
  threat_yellow: { backgroundColor: '#e0c05f' },
  threat_green: { backgroundColor: '#9ec96a' },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  name: { color: '#e07a5f', fontSize: 14, fontWeight: '700', letterSpacing: 1, flexShrink: 1 },
  rarity: { color: '#a2977b', fontSize: 10, letterSpacing: 1, marginLeft: 6 },
  // OTA-928 — enemy Power badge (top-left of the card head), coloured by matchup.
  headLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 5, flexShrink: 1 },
  enemyPower: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  enemyPowerDanger: { color: '#e07a5f' },
  enemyPowerFavored: { color: '#9ec96a' },
  enemyPowerEven: { color: '#d9b45b' },
  subhead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  range: { fontSize: 9, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, borderWidth: 1, marginLeft: 6 },
  rangeIn: { color: '#9ec96a', borderColor: '#3d5a2c' },
  rangeOut: { color: '#a2977b', borderColor: '#3a342c' },
  // OTA-1502 — per-hand reach row. Green shares the picker's "this is good for
  // you" green (#9ec96a); the unreachable hand goes muted rather than alarm-red,
  // because an out-of-reach weapon is information, not a warning.
  handsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  hand: { fontSize: 9, letterSpacing: 0.5 },
  handIn: { color: '#9ec96a' },
  handOut: { color: '#7a7263' },
  subline: { color: '#a2977b', fontSize: 11, flexShrink: 1 },
  // OTA-897 (SA-5) — the enemy card's voice line: readable italic prose, set
  // above the stat grid.
  flavorLine: { color: '#b8a982', fontSize: 11, lineHeight: 15, fontStyle: 'italic', marginBottom: 6 },
  hpBarBg: {
    height: 6,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
  },
  hpBarFill: { height: '100%' },
  // Two-up grid (HP / AC then ATK / DMG) so the stats stack portrait-style in
  // the narrow column rather than spreading into a wide single row.
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  stat: { width: '50%', paddingVertical: 1 },
  statLabel: { color: '#a2977b', fontSize: 9, letterSpacing: 1 },
  statValue: { color: '#e6d8b3', fontSize: 12, fontWeight: '600' },
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
    color: '#c9a86a',
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
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3a342c' },
  dotActive: { backgroundColor: '#c9a86a' },
  // OTA — playtest: the multi-enemy gesture hint read too long and too small.
  // Shorter copy ("swipe to aim · tap for info") + a larger, tighter-tracked font.
  hint: { color: '#8a7f68', fontSize: 12, letterSpacing: 0.3, marginLeft: 8 },
});
