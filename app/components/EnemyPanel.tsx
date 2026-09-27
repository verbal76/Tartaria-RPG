import React, { useCallback, useEffect, useRef, useState } from 'react';
import { enemyDamageCompact, enemyAC, enemyAttackBonus } from '../engine/combatRules';
import {
  View,
  Text,
  Image,
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
import { describeTrait, enemyIntelKey, portraitTraitChips, traitACBonus, traitDefenses } from '../engine/enemyTraits';
import { enemyPowerScore, powerMatchup } from '../engine/powerRating';
import { enemyTypeDefenses } from '../engine/crafting';
// OTA-1553 — the weakness reconcile and the WIS gate now live in the engine so
// the combat buttons' ★ and this card answer from one function. See the note at
// `defensesFor` below.
import { reconciledDefenses, WEAKNESS_READ_WIS as SHARED_WEAKNESS_READ_WIS, COATING_GLYPH, COATING_GLYPH_COLOR } from '../engine/weaponGlyphs';
import { enemyDamageType } from '../engine/damageTypes';
// ⚠⚠⚠ QOL #220 FINAL — THE DEVELOPED TARTARIA GLYPHS, NOT UNICODE. Owner:
// *"the game is using the WRONG visual... the owner wants the actual
// DEVELOPED TARTARIA GLYPH."* `combatGlyphArt.glyphArt()` is the OTA-1766
// illustrated-artwork table — already the production source for these same
// six damage/coating families on the Lore ▸ Glyphs legend (WeaponGlyphKey.tsx)
// and the live combat weapon buttons (InputBox.tsx). This card had simply
// never been moved onto it; `COATING_GLYPH` (the emoji table) stays imported
// above ONLY because the enemy's OWN weapon coating (the type-line glyph,
// OTA-1656) is a deliberately separate, already-accepted presentation this
// task does not touch — see the "CRITICAL DISTINCTION" note on
// `coatingKindForStatus` below.
import { glyphArt } from '../engine/combatGlyphArt';
/* ⚠ VISUAL LANGUAGE PHASE 1 — chassis planes as kit STYLESHEET entries; no new
   kit export is spent during the physical-specimen phase (owner ruling). */
import { tartariaKitStyles } from '../ui/tartariaKit';
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

// ⚠⚠⚠ QOL #220 FINAL — WHICH STATUSES ARE A DEVELOPED-GLYPH COATING, AND
// WHICH COATING. Pure suffix-strip, same partition #220 has always used
// (`infected`/`typed_dot` don't end in `_coat`, so they're excluded by
// construction, never by a name list) — but this no longer resolves a
// Unicode character. It resolves the coating's canonical key, which the
// caller hands to `glyphArt()` (the real artwork) for the AC-area unit and
// the expanded popup, and to `COATING_GLYPH_COLOR` only for the small
// accent color under that artwork (a color value, not a symbol — the
// no-generic-fallback rule is about the MARK, not the palette).
//
// ⚠⚠ CRITICAL DISTINCTION, preserved: this is the partition for a
// PLAYER-APPLIED active effect on the enemy. The enemy's OWN weapon coating
// (`view.enemy.coating`, drawn on the subhead type line and in
// `enemyDetailBody`'s "Coated blade:" line) is a separate, already-accepted
// presentation (OTA-1656) that still reads `COATING_GLYPH` directly and is
// not touched by this function or by anything downstream of it.
function coatingKindForStatus(kind: EnemyStatusView['kind']): keyof typeof COATING_GLYPH_COLOR | null {
  const suffix = '_coat';
  if (!kind.endsWith(suffix)) return null;
  return kind.slice(0, -suffix.length) as keyof typeof COATING_GLYPH_COLOR;
}

/** One qualifying player-applied coating effect, resolved to its real
 *  developed-artwork asset plus the CURRENT mechanical state #220 has always
 *  had available (`dmgPerTurn`/`turnsRemaining` — the same fields the lower
 *  status row and `enemyDetailBody` already read; nothing new is invented
 *  here, this is presentation over the existing structured effect state). */
export interface QualifyingEffectBadge {
  kind: EnemyStatusView['kind'];
  coatingKind: keyof typeof COATING_GLYPH_COLOR;
  /** The developed Tartaria PNG (a `require()`'d module id), never undefined
   *  for the six governed families — see the governed regression that walks
   *  every one of them and fails if `glyphArt` ever returns nothing for one. */
  art: number;
  color: string;
  dmgPerTurn: number;
  turnsRemaining: number;
}

// ⚠⚠ ONE FUNCTION DECIDES WHICH STATUSES QUALIFY, so the compact card (glyph
// + status unit), the lower non-coating row, and the expanded popup all ask
// IT rather than filtering `view.statuses` three times and risking three
// answers drifting apart (the exact failure mode the owner's first two
// screenshots both caught, from two different causes).
function qualifyingEffectBadges(statuses: EnemyStatusView[] | undefined): QualifyingEffectBadge[] {
  return (statuses ?? [])
    .map((st): QualifyingEffectBadge | null => {
      const coatingKind = coatingKindForStatus(st.kind);
      if (!coatingKind) return null;
      const art = glyphArt(coatingKind);
      // ⚠ HARD STOP, NOT A SILENT SUBSTITUTE. All six governed families ship
      // real art (assets/combat-glyphs/*.png, wired via combatGlyphArt.ts) —
      // this can only be null for a family the pack does not cover, and the
      // governed regression fails loudly on that gap rather than this
      // function quietly drawing something else in its place.
      if (!art) return null;
      return {
        kind: st.kind,
        coatingKind,
        art,
        color: COATING_GLYPH_COLOR[coatingKind],
        dmgPerTurn: st.dmgPerTurn,
        turnsRemaining: st.turnsRemaining,
      };
    })
    .filter((b): b is QualifyingEffectBadge => b !== null);
}

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

/**
 * ⚠⚠ OTA-1557 — WHICH PAGE IS A GIVEN SCROLL OFFSET ON, clamped to the roster.
 *
 * Pulled out of the scroll handler so the ARITHMETIC is pinnable rather than
 * only the wiring, and because it now has two callers (a flick and a dead-stop
 * drag) that must agree — the second of which did not exist before this OTA and
 * is the reason the portrait could park between two enemies with nobody
 * noticing.
 *
 * The clamp is not decoration: a kill splices the roster mid-gesture, so an
 * offset measured against the OLD list can resolve past the end of the new one.
 */
export function pageIndexForOffset(offsetX: number, cardWidth: number, count: number): number {
  if (!Number.isFinite(offsetX) || !Number.isFinite(cardWidth) || cardWidth <= 0) return 0;
  if (count <= 0) return 0;
  const raw = Math.round(offsetX / cardWidth);
  return Math.max(0, Math.min(raw, count - 1));
}

// ⚠⚠ OTA-1693 — THE PORTRAIT SETTLES. Owner, 22:15Z on the 09-04 log, two
// harpies up, no roster change, no swipe: "The enemy portrait is stuck between
// a left and right swipe and I did not swipe." OTA-1557 closed three doors and
// named a fourth in its own notes — on Android the cell's vertical ScrollView
// can claim a drag and hand it back, and a drag released that way produces
// NEITHER a momentum end NOR a drag end. A finger that only meant to scroll the
// card can leave the pager parked between two pages with no event to resolve
// it. So: a watchdog that does not need an event. Every scroll tick records the
// offset; a quarter second after the last tick, with no finger down, an offset
// that is not on a page is snapped to the nearest one and the target follows.
/** How far the pager sits from a page, and which page is nearest. Pure. */
export function settleOffset(offsetX: number, cardWidth: number, count: number): { idx: number; snap: number; offBy: number } {
  const idx = pageIndexForOffset(offsetX, cardWidth, count);
  const snap = Number.isFinite(cardWidth) && cardWidth > 0 ? idx * cardWidth : 0;
  const offBy = Number.isFinite(offsetX) ? Math.abs(offsetX - snap) : 0;
  return { idx, snap, offBy };
}
/** Quiet time after the last scroll tick before the watchdog settles, and the
 *  slack (px) inside which an offset counts as already on its page. */
export const PAGER_SETTLE_MS = 250;
export const PAGER_SETTLE_SLACK_PX = 2;

/** Combine the macro type-resistance map with the enemy's per-instance
 *  resist:/vulnerable: traits into the damage types it resists / is weak to.
 *  OTA-798 — RECONCILE per type the same way combat does (combineDamageTypeMatch):
 *  a trait that DISAGREES with the type-map wins, so a `resist:X` trait cancels a
 *  type-map weakness (and a `vulnerable:X` overrides a type resist). Without this the
 *  panel would still list an enemy's ORIGINAL type weakness even after per-spawn
 *  randomization flipped it — showing a weakness that's actually now a resistance. */
// ⚠⚠ OTA-1553 — THE ARITHMETIC MOVED OUT, THE MEANING DID NOT. This reconcile
// used to live here as a private function, and it was the only copy — right up
// until the combat buttons needed the same verdict to decide whether to draw the
// ★ (engine/weaponGlyphs.ts). Two readers of one truth with a copy in each is
// exactly how a star and a card come to disagree about the same enemy, so the
// function moved to the engine leaf and BOTH import it. Nothing about the sum
// changed; `defensesFor` is now the local name for the shared one.
const defensesFor = reconciledDefenses;

/** ⚠ OTA-1609 — the ATTACK NAME survives, out of the arithmetic's way. Owner,
 *  after 1608 moved the ATK cell to the real bonus: "I like the attack name,
 *  let's add that somewhere in the enemy portrait so it's known but not in
 *  the way." The bestiary's `attack` is a move name ("Spirit Touch"); it now
 *  rides the defs block as a quiet flavor line instead of masquerading as a
 *  number. Null when the field is empty or numeric (some mints stamp digits). */
function enemyAttackName(e: { attack?: unknown }): string | null {
  const name = String(e.attack ?? '').trim();
  if (!name || /^\+?\d+$/.test(name)) return null;
  return name;
}

// OTA-798 — a WISDOM ≥ this reads an enemy's (randomized) weaknesses off the portrait
// up front; below it you must discover them by landing hits (the combat log's
// "Weakness exposed" line is the feedback). Matches the parley WIS_REVEAL_THRESHOLD, so
// Wisdom is the consistent "scout the enemy" stat. Bosses always show (OTA-798).
// OTA-1553 — re-exported from the same leaf, for the same reason as above.
const WEAKNESS_READ_WIS = SHARED_WEAKNESS_READ_WIS;

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
  // ⚠⚠ OTA-1528 — LOOKED UP BY DEFENCE PROFILE, NOT BY DISPLAY NAME. This read
  // `enemyIntel?.[name.toLowerCase()]`, which is how a raider whose own chips said
  // `Vuln Piercing` came to be described as `WEAK Burn`: the spawn ordinal in
  // "Eternal Dynasty Raider 1" is reused every encounter, so the row held whatever
  // the LAST identically-named raider taught. Same key as the writer — see
  // enemyTraits.enemyIntelKey.
  const intelFor = useCallback(
    (e: Enemy) => enemyIntel?.[enemyIntelKey(e.name, e.traits)],
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
      {/* ⚠⚠⚠ VISUAL LANGUAGE PHASE 1 — THE CARD IS AN INTERACTIVE CHASSIS, AND THE
          FRAME AROUND IT IS NOT. Exploration's `panelFrame` says "this is one
          region of the HUD"; the card inside says "this object opens." Until now
          both were drawn with a border and nothing else, so the boundary between
          reading and touching had to be learned rather than seen. The two
          hairlines below are the CHASSIS weight of the sidewall language — half
          the value of a command chip and a 1dp side instead of 2dp, because a
          card is a thing you open and a key is a thing you strike.
          ⚠⚠ AND THEY GO *INSIDE* THE EXISTING TOUCHABLE, WHICH IS THE ONE RULE
          THIS FILE CANNOT BREAK. OTA-1514 records what happens otherwise: arb146
          wrapped this ScrollView in a Touchable, the parent won the responder on
          every vertical drag, and the card was capped with no way to scroll. So
          nothing here gains an ancestor — the ScrollView still owns the pan, this
          Touchable still owns the tap, and the planes are inert children of it.
          `pointerEvents="none"` so they cannot enter the responder chain at all,
          and no width, padding or margin so the measured `cardWidth` that drives
          `snapToInterval` is untouched. */}
      <TouchableOpacity accessibilityRole="button" activeOpacity={0.7} onPress={onPress}>
        {card}
        <View style={tartariaKitStyles.chassisPlaneTop} pointerEvents="none" />
        <View style={tartariaKitStyles.chassisPlaneBottom} pointerEvents="none" />
        <View style={tartariaKitStyles.chassisPlaneContact} pointerEvents="none" />
      </TouchableOpacity>
    </ScrollView>
  );

  // ⚠⚠⚠ OTA-1557 — THE PORTRAIT THAT HANGS BETWEEN TWO ENEMIES. Owner, on a
  // stacked fight: *"I killed one and the enemy portrait hung between enemies.
  // this has been ongoing."* His screenshot shows it exactly — the tail of one
  // card at the left edge, the next card pushed right and clipped off-screen.
  // The list is parked at an offset that is not a multiple of cardWidth.
  //
  // ⚠⚠ THREE THINGS COMBINED, AND WHY EARLIER PASSES MISSED IT. OTA-929 fixed
  // the BLANK card after a kill by remounting the pager on a roster change; that
  // was a different symptom (wrong content) and it is still correct and still
  // here. This is about the OFFSET, and nothing owned it:
  //   1. TWO SNAP AUTHORITIES. `pagingEnabled` snaps to the SCROLL VIEW's width;
  //      `snapToInterval` snaps to cardWidth. They agree only while those two
  //      numbers are identical, and they are not identical during the frames
  //      after a kill, when the roster remount and the panel measurement land on
  //      different ticks. Two mechanisms that must agree, with nothing making
  //      them agree, is the whole defect.
  //   2. NO RESOLUTION WITHOUT MOMENTUM. Every cell is a vertical ScrollView
  //      (OTA-1514, and it must stay one). On Android an inner scroller can
  //      claim a horizontal drag and hand it back, and a drag released that way
  //      produces NO momentum event — so `onMomentumScrollEnd`, the only reader,
  //      never fired and the half-scrolled offset was never even noticed.
  //   3. NOTHING PUT IT BACK. There was no path at all from "activeEnemyIdx
  //      changed" to "scroll there" — the pager only ever learned position from
  //      the finger. A kill re-points the target in the store (sweepDeadEnemies)
  //      and the pager simply did not follow.
  //
  // ⚠ SO: ONE snap authority (below), BOTH drag endings resolve to a page, and
  // an effect that drives the pager from the target whenever the target or the
  // roster moves. Any one of the three alone leaves a door open.
  const listRef = useRef<FlatList<EnemyView>>(null);
  const rosterKey = enemies.map((v) => v.enemy.name).join('|');

  /** Offset → page, clamped to the roster. Exported logic lives in
   *  `pageIndexForOffset` so the arithmetic is pinned, not just the wiring. */
  const resolvePage = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = pageIndexForOffset(e.nativeEvent.contentOffset.x, cardWidth, enemies.length);
      if (idx !== activeIndex) onSelectActive(idx);
    },
    [activeIndex, enemies.length, onSelectActive, cardWidth],
  );
  const onMomentumEnd = resolvePage;
  // ⚠ A drag that stops dead — finger down, move, lift without a flick — ends
  // here and NOWHERE else. This is the event that was missing.
  const onDragEnd = resolvePage;

  // ⚠⚠ OTA-1693 — THE WATCHDOG (see settleOffset). A drag the nested card
  // scroller claimed and handed back ends with no event at all; this settles
  // it from the ticks alone. `dragging` keeps it off a finger that is still
  // down; the timer re-arms on every tick, so it only ever fires in the quiet.
  const dragging = useRef(false);
  const lastOffset = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDragBegin = useCallback(() => { dragging.current = true; }, []);
  const onScrollTick = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      lastOffset.current = e.nativeEvent.contentOffset.x;
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        settleTimer.current = null;
        if (dragging.current || cardWidth <= 0 || enemies.length < 2) return;
        const s = settleOffset(lastOffset.current, cardWidth, enemies.length);
        if (s.offBy <= PAGER_SETTLE_SLACK_PX) return;
        try { listRef.current?.scrollToOffset({ offset: s.snap, animated: true }); } catch { /* pre-layout */ }
        if (s.idx !== activeIndex) onSelectActive(s.idx);
      }, PAGER_SETTLE_MS);
    },
    [activeIndex, cardWidth, enemies.length, onSelectActive],
  );
  const onDragEndSettled = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => { dragging.current = false; onDragEnd(e); },
    [onDragEnd],
  );
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  // ⚠⚠ THE PAGER FOLLOWS THE TARGET. A kill splices the roster and re-points
  // activeEnemyIdx in the store; without this the card the player is looking at
  // and the enemy his buttons are aimed at are two different creatures. Not
  // animated: after a death the correct card should already BE there, not slide
  // in — an animation here reads as the panel drifting on its own.
  useEffect(() => {
    if (enemies.length < 2 || cardWidth <= 0) return;
    const idx = Math.max(0, Math.min(activeIndex, enemies.length - 1));
    // scrollToIndex throws when the cell is not laid out yet (a fresh remount is
    // exactly that moment), and a thrown error here would take the whole combat
    // panel down with it. getItemLayout makes the offset exact, so falling back
    // to it is not an approximation.
    try {
      listRef.current?.scrollToIndex({ index: idx, animated: false });
    } catch {
      try { listRef.current?.scrollToOffset({ offset: idx * cardWidth, animated: false }); } catch { /* pre-layout */ }
    }
  }, [activeIndex, rosterKey, cardWidth, enemies.length]);

  // arb146 — tapping a card opens a full-detail popup (everything the cramped
  // corner portrait can't fit: full trait descriptions, resist/weak/deals, all
  // active effects with turns left). Multi-enemy TARGETING stays on the
  // horizontal swipe-pager, so tap is free to mean "show me this one." Player
  // ask: "tap the enemy's portrait → full pop-up → dismiss back to a portrait."
  const [detailView, setDetailView] = useState<EnemyView | null>(null);

  const renderItem: ListRenderItem<EnemyView> = ({ item }) => scrollWrap(
    <EnemyCard view={item} cardWidth={cardWidth} cardHeight={capH} hpBarWidth={hpBarWidth} canRead={canReadDefenses} observed={intelFor(item.enemy)} playerPower={playerPower} />,
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
          <EnemyCard view={enemies[0]!} cardWidth={cardWidth} cardHeight={capH} hpBarWidth={hpBarWidth} canRead={canReadDefenses} observed={intelFor(enemies[0]!.enemy)} playerPower={playerPower} />,
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
          ref={listRef}
          keyExtractor={(_, i) => String(i)}
          horizontal
          // ⚠⚠⚠ OTA-1557 — ONE SNAP AUTHORITY. `pagingEnabled` used to sit here
          // alongside snapToInterval, and the two do NOT measure the same thing:
          // paging snaps to the scroll view's own width, snapToInterval snaps to
          // cardWidth. They agree only while those numbers are identical, and in
          // the frames after a kill — roster remount on one tick, panel
          // measurement on another — they are not. Two mechanisms that must
          // agree, with nothing making them agree, is how a card comes to rest
          // between two enemies. snapToInterval is the one that survives because
          // it is expressed in the same unit as getItemLayout and the page math.
          snapToInterval={cardWidth}
          snapToAlignment="start"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          // ⚠⚠ BOTH ENDINGS RESOLVE TO A PAGE. A flick ends in momentum; a drag
          // released without a flick — which is also what an inner vertical
          // ScrollView hands back when it returns a horizontal gesture — ends
          // only in onScrollEndDrag. That second door had no reader at all, so a
          // half-scrolled pager was never noticed, let alone corrected.
          onMomentumScrollEnd={onMomentumEnd}
          onScrollEndDrag={onDragEndSettled}
          onScrollBeginDrag={onDragBegin}
          onScroll={onScrollTick}
          scrollEventThrottle={64}
          renderItem={renderItem}
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
      // ⚠⚠⚠ QOL #220 FINAL — the popup's visible content is this JSX now, not
      // the plain-text `body`. `enemyDetailBody` stays exported/tested as a
      // pure text contract (see its own header), but a plain string cannot
      // carry the developed-glyph artwork or the compact card's colour
      // language, which is exactly what the owner's screenshot flagged.
      scrollContent={detailView ? (
        <EnemyDetailContent view={detailView} canRead={canReadDefenses} observed={intelFor(detailView.enemy)} />
      ) : undefined}
      buttons={[{ label: 'Close', tone: 'primary', onPress: () => setDetailView(null) }]}
      onRequestClose={() => setDetailView(null)}
    />
    </>
  );
}

// arb146 — format an enemy into the full-detail popup body: everything the
// cramped corner can't fit — full trait descriptions + all active effects.
// ⚠ OTA-1608 — no more mirrored math: this was the THIRD hand copy of the AC
// formula and read parseInt(enemy.attack) — a move NAME on every bestiary row
// — where the rolls compute abilityPoint + trait bonus. The card, this popup,
// and the d20 lines now all ask the roll's own resolvers.
// ⚠⚠ OTA-1655 — EXPORTED SO THE PROMISE CAN BE ASKED INSTEAD OF READ.
// OTA-1651 moved the enemy's flavour line and the player's own hands OFF the
// combat card and INTO this popup. An audit of the last twenty OTAs measured how
// each is proven and found this one the single outlier: 22 of its 23 assertions
// were `expect(SOURCE).toContain(…)` string pins on this file. Those pin the
// CODE, not the OUTCOME — rename a local or route the same text through another
// helper and the suite goes red on a working card, or green on a broken one.
// The builder was already pure (an EnemyView in, a block of text out — no hooks,
// no state, no rendering); it was module-local only because nothing had needed
// it yet, so exporting it costs nothing and buys a real assertion.
export function enemyDetailBody(view: EnemyView, canRead: boolean, observed?: { weak: string[]; resist: string[] }): string {
  const e = view.enemy;
  const ac = enemyAC(e);
  const atkLabel = `+${enemyAttackBonus(e)}`;
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
  // ⚠⚠ OTA-1651 — THE FLAVOUR LINE LIVES HERE NOW. Owner: *"we don't need the
  // flavor text, this is a fight, move the flavor text to the expanded enemy
  // card."* He is right about the combat card — three italic lines of bestiary
  // voice between the range chip and the HP bar is reading material in the
  // middle of a swing. It is not right to DELETE it (OTA-897 put it there so a
  // foe reads as a described creature), so it comes here, above the numbers,
  // where the player has opened the card precisely to look at the thing.
  if (e.flavor) {
    lines.push(e.flavor);
    lines.push('');
  }
  // ⚠⚠⚠ QOL #220 FINAL — THIS STRING NO LONGER CARRIES THE AC-AREA GLYPH OR
  // THE ACTIVE-EFFECTS LIST. `enemyDetailBody` stays a plain-text CONTRACT
  // (still exported, still pure, still covers everything a screen reader or
  // a text-only test needs — flavour, range, threat, HP/AC/ATK/DMG, coated
  // blade, hands, defences, traits), but a plain string cannot carry the
  // developed Tartaria artwork the owner asked for, and re-adding a Unicode
  // stand-in here would recreate the exact defect this correction exists to
  // remove. The real glyph + live magnitude/duration presentation is JSX —
  // `EnemyDetailContent` below — rendered in the popup's `scrollContent`,
  // built from the SAME pure state (`qualifyingEffectBadges`) rather than a
  // second, independent read of `view.statuses`.
  lines.push(`HP ${view.currentHp}/${e.hp}     AC ${ac}`);
  // OTA-1139 (audit) — a boss's real per-round output, not the notation third of it.
  lines.push(`Attack ${atkLabel}     Damage ${enemyDamageCompact(e)}${dealsType ? ` (${cap(dealsType)})` : ''}`);
  // OTA-1609 — the move name rides along in the roomy popup too.
  if (enemyAttackName(e)) lines.push(`Strikes with: ${enemyAttackName(e)}`);
  // ⚠⚠ OTA-1656 — AND THE COATING IN WORDS, so the card's glyph is never a
  // mystery the player has to go look up. The combat card carries one symbol
  // because it has no room for a sentence; the popup has the room, so it says
  // the kind, what the blade adds, and — the part that makes it actionable —
  // that armour resisting that type halves it where it lands.
  if (e.coating) {
    lines.push(
      `Coated blade: ${COATING_GLYPH[e.coating.kind]} ${cap(e.coating.kind)} `
      + `(+${e.coating.dice} on a landed hit; armour that resists ${e.coating.kind} halves it)`,
    );
  }
  // ⚠⚠ OTA-1651 — AND YOUR OWN HANDS, spelled out. On the combat card this was
  // two bare weapon names with a lit or unlit dot, and the owner read them as a
  // stray reference to his own axe on an ENEMY's card — which is exactly what
  // they looked like. The information is real (OTA-1502: the off hand was the
  // half of his loadout that was mute), so it moves here and says what it means
  // in words instead of relying on a dot to carry it.
  if (view.hands?.length) {
    lines.push('');
    for (const h of view.hands) {
      lines.push(`${h.inRange ? '●' : '○'} ${h.slot === 'main' ? 'Main hand' : 'Off hand'}: ${h.label} — ${h.inRange ? 'reaches this one' : 'cannot reach from here'}`);
    }
  }
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
  // ⚠⚠ OTA-1527 — THE SECOND DOOR. The block above narrates the gate's refusal
  // ("You can't read its weaknesses at a glance — strike it and watch what
  // bites"), and this list then printed every raw trait underneath it — `Vuln
  // Piercing`, `Resist Aetheric` — answering the question the line above had just
  // declined to answer. Same filter as the card's chip row; see
  // portraitTraitChips for what is dropped and why.
  const traits = portraitTraitChips(e.traits, e.boss || canRead);
  if (traits.length) {
    lines.push('');
    lines.push('Traits:');
    for (const t of traits) lines.push(`· ${describeTrait(t)}`);
  }
  // ⚠⚠⚠ QOL #220 FINAL — active effects are no longer listed in this string
  // at all (see the note above the AC line): the popup's `scrollContent`
  // (`EnemyDetailContent`) is their one presentation now, in real developed
  // artwork with live magnitude/duration, so this text never becomes a
  // second, drifting copy of the same information.
  return lines.join('\n');
}

// ⚠⚠⚠ QOL #220 FINAL — THE EXPANDED CARD, OPENED UP FROM THE COMPACT ONE.
// Live owner correction, on a screenshot of the popup: *"this is still just
// monochromatic and dull... he needs to keep the same style format coloring
// and arrangement as the miniature enemy portrait, but it needs to have all
// of the information that's not able to be seen in the enemy portrait."*
//
// `enemyDetailBody` above is a plain string — the one presentation a plain
// string can never carry is COLOR, so the popup's stat-like sections (HP/AC/
// ATK/DMG, RESIST/WEAK/DEALS/STRIKES, range, threat, traits, active effects)
// render here instead, as JSX built from the exact same pure computations
// `EnemyCard` already calls (`enemyAC`, `defensesFor`, `portraitTraitChips`,
// `qualifyingEffectBadges`, …) — not a re-implementation of the compact
// card's arithmetic, the SAME calls, so the two views can never disagree
// about what the numbers are, only how roomy the layout gets to be.
// `enemyDetailBody` stays exported and unchanged for its own information
// (flavour, hands, coated-blade wording, the WIS-gated defence PROSE) —
// prose the compact card never shows at all, so it stays prose here too;
// nothing about it needed color to answer the owner's ask.
function EnemyDetailContent({ view, canRead, observed }: { view: EnemyView; canRead: boolean; observed?: { weak: string[]; resist: string[] } }) {
  const e = view.enemy;
  const ac = enemyAC(e);
  const atkLabel = `+${enemyAttackBonus(e)}`;
  const defenses = defensesFor(e);
  const dealsType = enemyDamageType(e);
  const hpPct = Math.max(0, Math.min(1, view.currentHp / Math.max(1, e.hp)));
  const hpColor = hpPct > 0.5 ? '#9ec96a' : hpPct > 0.2 ? '#c9a86a' : '#e07a5f';
  const inRange = view.inRange ?? true;
  const chips = portraitTraitChips(e.traits, e.boss || canRead);
  const effectBadges = qualifyingEffectBadges(view.statuses);
  const nonCoatingStatuses = (view.statuses ?? []).filter((st) => coatingKindForStatus(st.kind) === null);

  return (
    <View style={detailStyles.wrap}>
      <View style={detailStyles.identityRow}>
        <Text style={detailStyles.identityText}>
          {e.type}{e.boss ? ' · BOSS' : ''} · {e.rarity}
        </Text>
        {!!view.threat && (
          <View style={detailStyles.threatRow}>
            <View style={[styles.threatDot, styles[`threat_${view.threat}`]]} accessibilityLabel={`threat ${view.threat}`} />
            <Text style={detailStyles.threatText}>
              {view.threat === 'red' ? 'RED' : view.threat === 'yellow' ? 'YELLOW' : 'GREEN'}
            </Text>
          </View>
        )}
      </View>
      {!!view.rangeLabel && (
        <Text style={[styles.range, inRange ? styles.rangeIn : styles.rangeOut, detailStyles.rangeChip]}>
          {view.rangeLabel.toUpperCase()}{inRange ? '' : ' · OUT'}
        </Text>
      )}
      {!!e.flavor && <Text style={detailStyles.flavor}>{e.flavor}</Text>}

      <View style={[styles.hpBarBg, detailStyles.hpBar]}>
        <View style={[styles.hpBarFill, { width: `${Math.round(hpPct * 100)}%`, backgroundColor: hpColor }]} />
      </View>

      <View style={detailStyles.statGrid}>
        <DetailStat label="HP" value={`${view.currentHp}/${e.hp}`} />
        <DetailStat label="AC" value={String(ac)} />
        <DetailStat label="ATK" value={atkLabel} />
        <DetailStat
          label="DMG"
          value={`${enemyDamageCompact(e)}${dealsType ? ` (${cap(dealsType)})` : ''}`}
        />
      </View>

      {!!enemyAttackName(e) && (
        <Text style={detailStyles.strikesLine} numberOfLines={1}>
          <Text style={styles.defStrikes}>STRIKES </Text>
          <Text style={styles.defVal}>{enemyAttackName(e)}</Text>
        </Text>
      )}

      {/* ⚠⚠ CRITICAL DISTINCTION, preserved — the enemy's OWN weapon coating
          (a separate, already-accepted OTA-1656 presentation) still reads
          COATING_GLYPH directly and is never confused with a player-applied
          active effect below. */}
      {!!e.coating && (
        <Text style={detailStyles.coatingLine} numberOfLines={2}>
          <Text style={{ color: COATING_GLYPH_COLOR[e.coating.kind] }}>{COATING_GLYPH[e.coating.kind]} </Text>
          <Text style={detailStyles.coatingText}>
            Coated blade: {cap(e.coating.kind)} (+{e.coating.dice} on a landed hit; armour that resists {e.coating.kind} halves it)
          </Text>
        </Text>
      )}

      {!!view.hands?.length && (
        <View style={detailStyles.handsBlock}>
          {view.hands.map((h) => (
            <Text key={h.slot} style={detailStyles.handLine} numberOfLines={2}>
              <Text style={h.inRange ? detailStyles.handIn : detailStyles.handOut}>{h.inRange ? '● ' : '○ '}</Text>
              {h.slot === 'main' ? 'Main hand' : 'Off hand'}: {h.label} — {h.inRange ? 'reaches this one' : 'cannot reach from here'}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.defs}>
        {(e.boss || canRead) ? (
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
        ) : (defenses.resists.length > 0 || defenses.weaknesses.length > 0) ? (
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
        ) : null}
        <Text style={styles.defLine} numberOfLines={1}>
          <Text style={styles.defDeals}>DEALS </Text>
          <Text style={styles.defVal}>{cap(dealsType)}</Text>
        </Text>
      </View>

      {chips.length > 0 && (
        <View style={styles.traitRow}>
          {chips.map((t) => (
            <Text key={t} style={styles.traitBadge}>{describeTrait(t)}</Text>
          ))}
        </View>
      )}

      {/* ⚠⚠⚠ QOL #220 FINAL — THE EXPANDED "ACTIVE EFFECTS" SECTION. Owner:
          *"the expanded view has more room, so clarity takes priority over
          abbreviation... developed corresponding glyph, effect name, full
          current magnitude/detail, full remaining duration/time."* Same real
          artwork as the compact unit, at a size clarity actually calls for,
          with the label spelled out instead of abbreviated. A non-qualifying
          status (infected, typed_dot) has no glyph identity, so it keeps its
          existing accent-dot presentation — an information-loss regression
          would be showing LESS here than the compact card already does. */}
      {(view.statuses ?? []).length > 0 && (
        <View style={detailStyles.effectsSection}>
          <Text style={detailStyles.effectsHeading}>ACTIVE EFFECTS</Text>
          <View style={detailStyles.effectsRow}>
            {effectBadges.map((b) => (
              <View key={b.kind} style={detailStyles.effectUnit}>
                <Image
                  source={b.art}
                  style={detailStyles.effectArt}
                  resizeMode="contain"
                  testID={`enemy-effect-glyph-detail-${b.coatingKind}`}
                />
                <Text style={[detailStyles.effectName, { color: b.color }]} numberOfLines={1}>
                  {STATUS_META[b.kind]?.label ?? b.coatingKind.toUpperCase()}
                </Text>
                <Text style={detailStyles.effectDetail} numberOfLines={1}>{b.dmgPerTurn} dmg/turn</Text>
                <Text style={detailStyles.effectDetail}>
                  {b.turnsRemaining} turn{b.turnsRemaining === 1 ? '' : 's'} remaining
                </Text>
              </View>
            ))}
            {nonCoatingStatuses.map((st, i) => {
              const meta = STATUS_META[st.kind] ?? { label: st.kind.toUpperCase(), color: '#c9a86a' };
              return (
                <View key={`${st.kind}-${i}`} style={detailStyles.effectUnit}>
                  <Text style={[detailStyles.effectDot, { color: meta.color }]}>●</Text>
                  <Text style={[detailStyles.effectName, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
                  <Text style={detailStyles.effectDetail} numberOfLines={1}>{st.dmgPerTurn} dmg/turn</Text>
                  <Text style={detailStyles.effectDetail}>
                    {st.turnsRemaining} turn{st.turnsRemaining === 1 ? '' : 's'} remaining
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

/** A larger, roomier restatement of the compact card's `Stat` cell — same
 *  label/value color tokens, sized for the popup rather than the corner. */
function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={detailStyles.statValue}>{value}</Text>
    </View>
  );
}

function EnemyCard({ view, cardWidth, cardHeight, hpBarWidth, canRead, observed, playerPower }: { view: EnemyView; cardWidth: number; cardHeight?: number; hpBarWidth: number; canRead: boolean; observed?: { weak: string[]; resist: string[] }; playerPower?: number }) {
  // OTA-419 — mirror combatRules.enemyAC EXACTLY so the panel's AC matches what
  // combat uses to hit: pull the number out of "Strength 4" (parseInt got NaN →
  // the panel showed a flat AC 5 and never added the boss +6). NaN falls back to
  // 8 like combat, and bosses get the same +6 wall.
  // ⚠ OTA-1608 — the roll's own resolver, not a hand copy (see enemyDetailBody).
  const ac = enemyAC(view.enemy);
  // ⚠⚠⚠ QOL #220 FINAL — generalized from view.statuses, not hard-coded to
  // acid: any active status whose kind maps through coatingKindForStatus (the
  // six weapon-coating DOT families) earns its developed glyph + live status
  // unit. A future coating family picks this up automatically the day it gets
  // both a COATING_GLYPH_COLOR entry and a combat-glyphs asset — nothing here
  // names a specific element.
  const effectBadges = qualifyingEffectBadges(view.statuses);
  // ⚠⚠ a status the effect unit already speaks for does not ALSO get the old
  // text chip below; that was the duplication the owner's first correction
  // screenshot caught. Only statuses coatingKindForStatus returns null for
  // (infected, typed_dot — not player-applied coatings) still need the chip's
  // words, because nothing else on the compact card says them.
  const nonCoatingStatuses = (view.statuses ?? []).filter((st) => coatingKindForStatus(st.kind) === null);
  const atkLabel = `+${enemyAttackBonus(view.enemy)}`; // OTA-1608 — what the d20 line will say
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
      // Owner ruling (physical Golem screenshot): the dark card fills its
      // reserved frame (matched to the player-stats column's own measured
      // height) whether or not there's enough content to reach it — a short
      // card (fewer active effects, no trait row) must not leave a gap of
      // the surrounding panel frame showing through underneath it. `minHeight`
      // rather than `height` so a genuinely tall card (many effects) still
      // grows past the frame and scrolls, exactly as `capH`'s own ScrollView
      // cap already allows.
      style={[styles.card, { width: cardWidth, minHeight: cardHeight }]}
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
          {/* ⚠⚠⚠ OTA-1656 — THE COATED BLADE, AT LAST VISIBLE. Owner: *"I have
              yet to see an enemy use a coating, check the logs, did I miss it?"*
              He had not missed it. A measured 24.3% of spawns came coated and
              `enemy.coating` was rendered in NO component and NO screen — the
              only place it ever surfaced was a clause appended to the damage
              line AFTER the blow landed. A quarter of every fight was carrying a
              poisoned edge and the game never once said so before it hit him.
              ⚠ It rides INSIDE the existing type line, not on a row of its own:
              OTA-1651 shortened these cards on purpose and this must not spend
              that back. One glyph, in the same vocabulary as his own weapon
              buttons (OTA-1636/1638), coloured by the same family map so fire is
              the same orange wherever it appears. */}
          {!!view.enemy.coating && (
            <Text style={{ color: COATING_GLYPH_COLOR[view.enemy.coating.kind] }}>
              {`  ${COATING_GLYPH[view.enemy.coating.kind]}`}
            </Text>
          )}
        </Text>
        <Text style={[styles.range, inRange ? styles.rangeIn : styles.rangeOut]}>
          {view.rangeLabel
            ? `${view.rangeLabel.toUpperCase()}${inRange ? '' : ' · OUT'}`
            : inRange ? 'IN RANGE' : 'OUT OF RANGE'}
        </Text>
      </View>
      {/* ⚠⚠⚠ OTA-1651 — THE HANDS ROW AND THE FLAVOUR LINE MOVED TO THE POPUP.
          Owner, with a screenshot: *"remove the weapon reference on top, I guess
          that is referencing my axe? if so it doesn't need to be there… and we
          don't need the flavor text, this is a fight, move the flavor text to
          the expanded enemy card. that should shorten both cards enough to give
          some room back to the main text block."*

          ⚠ THE HANDS ROW WAS NOT DECORATION and it is not deleted — it is
          OTA-1502, the answer to *"the off hand is the half of my loadout that
          was mute"*: ● = that hand reaches THIS foe, ○ = it cannot. He read it
          as a stray reference to his own axe, which is fair — a bare weapon
          name on an ENEMY card reads as the enemy's. It moves to
          `enemyDetailBody` whole, where it has room to say what it means. The
          `MID-RANGE · OUT` chip above still answers range at the card level,
          which is what a swing actually gates on.

          ⚠ AND `view.hands` STAYS ON THE VIEW MODEL, computed exactly as it was.
          Nothing about the reach resolver changes; only where its answer is
          drawn. */}
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
      {/* ⚠⚠⚠ QOL #220 FINAL PHYSICAL LAYOUT CORRECTION. Owner, from the live
          Golem screenshot: the developed-glyph unit was landing as its OWN
          row beneath the whole HP/AC/ATK/DMG grid, so it pushed WEAK/DEALS/
          STRIKES downward every time an effect was active — exactly the
          growth the compact-card contract (OTA-1651) forbids. The owner's
          own diagram put it beside AC, in the horizontal whitespace the
          grid's short values never use, not underneath it.

          `statRow` now holds the stat grid and the effect column as TWO
          SIBLINGS in one row (`alignItems:'flex-start'`), not two stacked
          blocks — `defs` (WEAK/DEALS/STRIKES) sits immediately after this
          ONE row exactly as it did when no effect was active. `statGrid`
          keeps `flex:1` so it fills the row alone when there is nothing
          beside it (the "no effect" case is byte-for-byte the old layout).
          The effect column's own height (glyph + two status lines) is kept
          at or under the grid's own two-row height by construction, so the
          row's total height — and therefore where `defs` lands — does not
          change when one qualifying effect appears. Multiple effects wrap
          horizontally inside that same column before they ever add a line. */}
      <View style={styles.statRow} testID="enemy-stat-row">
        <View style={styles.statGrid} testID="enemy-stat-grid">
          <Stat label="HP" value={`${view.currentHp}/${view.enemy.hp}`} />
          <Stat label="AC" value={String(ac)} />
          <Stat label="ATK" value={atkLabel} />
          <Stat label="DMG" value={enemyDamageCompact(view.enemy)} />
        </View>
        {/* ⚠⚠⚠ QOL #220 FINAL — THE DEVELOPED-GLYPH ACTIVE-EFFECT UNIT. Owner:
            *"the owner developed specific glyphs for the individual damage/
            effect families... [and] the glyph by itself is NOT enough — the
            owner also needs to see WHAT THAT EFFECT IS CURRENTLY DOING
            directly underneath its glyph."* One vertical unit per qualifying
            effect — real artwork on top (`glyphArt`, the same asset Lore ▸
            Glyphs and the combat weapon buttons already paint; see the
            `effectGlyphArt`/`effectGlyphMagnitude`/`effectGlyphDuration`
            style comment for the current sizing history), its LIVE
            magnitude and remaining duration centered directly beneath, in
            the coating's own accent color.
            ⚠ CORRECTION, preserved — the old `ACID 3t left · 4/turn` text chip
            below (`nonCoatingStatuses`) still does not repeat a qualifying
            effect this unit already covers; a qualifying coating's presence
            is spoken for exactly once, here.
            ⚠ Bounded by construction, same as before: a `_coat` status exists
            at most once per kind, six kinds total, so this column can never
            grow past the coating vocabulary itself — it wraps, it does not
            balloon. */}
        {effectBadges.length > 0 && (
          <View style={styles.effectGlyphRow}>
            {effectBadges.map((b) => (
              <View key={b.kind} style={styles.effectGlyphUnit}>
                <Image
                  source={b.art}
                  style={styles.effectGlyphArt}
                  resizeMode="contain"
                  testID={`enemy-effect-glyph-${b.coatingKind}`}
                />
                <Text style={[styles.effectGlyphMagnitude, { color: b.color }]} numberOfLines={1}>
                  {b.dmgPerTurn}/turn
                </Text>
                <Text style={[styles.effectGlyphDuration, { color: b.color }]} numberOfLines={1}>
                  {b.turnsRemaining}T
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={styles.defs} testID="enemy-defs">
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
        {/* ⚠ OTA-1609 — the move's NAME, quiet, under the numbers it flavors. */}
        {!!enemyAttackName(view.enemy) && (
          <Text style={styles.defLine} numberOfLines={1}>
            <Text style={styles.defStrikes}>STRIKES </Text>
            <Text style={styles.defVal}>{enemyAttackName(view.enemy)}</Text>
          </Text>
        )}
      </View>
      {/* OTA-401 — active coating/DOT statuses on this enemy + turns left.
          One badge per status: "POISON · 3t · 4/turn". Lets the player
          confirm a coating actually landed and track how long it ticks.
          ⚠⚠ QOL #220 — a qualifying coating (see `effectBadges` above) no
          longer prints here too; this row is now the presentation for
          statuses the developed-glyph unit doesn't cover, not every status. */}
      {nonCoatingStatuses.length > 0 && (
        <View style={styles.statusCol}>
          {nonCoatingStatuses.map((st, i) => {
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
      {/* Owner ruling (physical Golem screenshot, Mud Monarch): the trait/tag
          chip row (Savage, Fast Regen, Concussive, Bleeder, …) clutters the
          collapsed compact portrait and belongs only on the expanded detail
          popup, which has the room for it. Its gate/filter is unchanged —
          it now applies to a single reader instead of two. */}
    </View>
  );
}

function Stat({ label, value, accessory }: { label: string; value: string; accessory?: React.ReactNode }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {accessory}
      </View>
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
  // ⚠ OTA-1651 — handsRow / hand / handIn / handOut went with the row they
  // styled. The popup is plain text, so the reach lines carry their meaning in
  // words now rather than in a green. Left as a comment rather than silently
  // deleted: a style block that outlives its component is how a "still styled,
  // therefore still shown" assumption survives a refactor.
  subline: { color: '#a2977b', fontSize: 11, flexShrink: 1 },
  // OTA-897 (SA-5) — the enemy card's voice line: readable italic prose, set
  // above the stat grid.
  // OTA-1651 — flavorLine likewise: the bestiary voice is popup text now.
  hpBarBg: {
    height: 6,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
  },
  hpBarFill: { height: '100%' },
  // ⚠⚠⚠ QOL #220 FINAL PHYSICAL LAYOUT CORRECTION — `statGrid` and the
  // developed-glyph effect column are two SIBLINGS inside this one row, not
  // two stacked blocks. `marginTop` moved here (off `statGrid`) so the row's
  // top edge — not just the grid's — sits the same distance under the HP
  // bar whether or not an effect column is present.
  statRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  // Two-up grid (HP / AC then ATK / DMG) so the stats stack portrait-style in
  // the narrow column rather than spreading into a wide single row.
  // `flex:1` lets it share `statRow` with the effect column when one is
  // present, and fill the row alone — byte-identical to before this
  // correction — when it is not.
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
  stat: { width: '50%', paddingVertical: 1 },
  statLabel: { color: '#a2977b', fontSize: 9, letterSpacing: 1 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statValue: { color: '#e6d8b3', fontSize: 12, fontWeight: '600' },
  // ⚠⚠⚠ QOL #220 — the developed-glyph active-effect column, a SIBLING of
  // `statGrid` inside `statRow` rather than a row underneath it (see the
  // comment at its call site for why; that structure is unchanged here).
  // QUICK VISUAL TUNING, owner ruling from a further physical Golem
  // screenshot: the container/position was correct, but the artwork and its
  // status text still read too small at normal viewing distance.
  // `effectGlyphArt` doubles 22dp -> 44dp (same developed asset, aspect
  // ratio preserved, no Unicode/generic fallback). The two status lines
  // grow ~75% (fontSize 8 -> 14, lineHeight 9 -> 16). `effectGlyphUnit`
  // widens 32 -> 56 so `3/turn` doesn't clip at the larger font, and the
  // column is nudged left (`marginLeft` 6 -> 2, `gap` 6 -> 4) so the bigger
  // unit stays inside the existing whitespace to AC's right rather than
  // drifting toward the card's edge. Multiple qualifying effects still wrap
  // horizontally inside this same column before they ever add a line —
  // bounded by the coating vocabulary itself (six kinds, one status per
  // kind), so it wraps, it does not balloon.
  effectGlyphRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginLeft: 2, alignItems: 'flex-start' },
  effectGlyphUnit: { alignItems: 'center', width: 56 },
  effectGlyphArt: { width: 44, height: 44 },
  effectGlyphMagnitude: { fontSize: 14, fontWeight: '700', lineHeight: 16, textAlign: 'center' },
  effectGlyphDuration: { fontSize: 14, fontWeight: '600', lineHeight: 16, textAlign: 'center' },
  defs: { marginTop: 4, gap: 1 },
  defLine: { fontSize: 10, letterSpacing: 0.5 },
  defResist: { color: '#9ec96a', fontWeight: '700', fontSize: 9, letterSpacing: 1 },
  defWeak: { color: '#e07a5f', fontWeight: '700', fontSize: 9, letterSpacing: 1 },
  // arb119 — DEALS uses a neutral amber (distinct from RESIST green / WEAK red):
  // it's neither good nor bad for the player, just "what's coming at you."
  defDeals: { color: '#d9a566', fontWeight: '700', fontSize: 9, letterSpacing: 1 },
  defVal: { color: '#c9b89a', fontSize: 10 },
  // OTA-1609 — the STRIKES label sits a shade dimmer than DEALS: flavor, not a
  // decision input, so it must never outshout the numbers above it.
  defStrikes: { color: '#8f8570', fontWeight: '700', fontSize: 9, letterSpacing: 1 },
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

// ⚠⚠⚠ QOL #220 FINAL — THE EXPANDED CARD'S OWN TOKENS. Layout and spacing
// only; every COLOR here is either a literal already used on the compact
// card above (kept in sync by eye, not by import, since `styles` is a
// module-local StyleSheet object) or one of the compact card's own shared
// style keys (`styles.defResist`, `styles.range`, `styles.traitBadge`, …),
// reused directly rather than re-declared — the "same style format" the
// owner asked for is the SAME style objects, not a repainted copy of them.
const detailStyles = StyleSheet.create({
  wrap: { gap: 2 },
  identityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  identityText: { color: '#a2977b', fontSize: 12, letterSpacing: 0.5 },
  threatRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  threatText: { color: '#c9b89a', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  rangeChip: { alignSelf: 'flex-start', marginTop: 4 },
  flavor: { color: '#c9b89a', fontSize: 13, fontStyle: 'italic', lineHeight: 18, marginTop: 6 },
  hpBar: { width: '100%', marginTop: 10 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  stat: { width: '50%', paddingVertical: 2 },
  statValue: { color: '#e6d8b3', fontSize: 15, fontWeight: '700' },
  strikesLine: { fontSize: 11, letterSpacing: 0.5, marginTop: 4 },
  coatingLine: { fontSize: 12, marginTop: 6 },
  coatingText: { color: '#c9b89a', fontSize: 12 },
  handsBlock: { marginTop: 8, gap: 2 },
  handLine: { color: '#c9b89a', fontSize: 12, lineHeight: 17 },
  handIn: { color: '#9ec96a' },
  handOut: { color: '#8a7f68' },
  effectsSection: { marginTop: 10, gap: 6 },
  effectsHeading: { color: '#a2977b', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  effectsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  // ⚠ Bigger than the compact card's 16dp — the owner: "the expanded view has
  // more room, so clarity takes priority over abbreviation." `GLYPH_ART_SIZE`
  // itself (28) is a fine ceiling here too, since Lore ▸ Glyphs already proves
  // it reads well at that size; 24 keeps three effects on a row on a normal
  // phone width without crowding.
  // ⚠ Owner correction (physical Golem screenshot): "2 turns remaining" was
  // truncating to "2 turns remai..." at 78dp with the line held to one row.
  // Widened to 92dp and the duration line's `numberOfLines={1}` cap is gone
  // (see the two `effectDetail` Texts below) — it wraps onto a second line
  // instead of clipping, in keeping with "clarity over abbreviation" here.
  effectUnit: { alignItems: 'center', width: 92 },
  effectArt: { width: 24, height: 24 },
  effectDot: { fontSize: 20, lineHeight: 24 },
  effectName: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 3, textAlign: 'center' },
  effectDetail: { color: '#c9b89a', fontSize: 10, textAlign: 'center', lineHeight: 13 },
});
