import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { PlayerCharacter } from '../engine/types';
import { getRaces } from '../engine/character';
import { resolveDisplayArmorByName } from '../engine/itemResolution';
import { coatedDisplayName } from '../engine/weaponCoating';
import { ARMOR_SLOTS, effectiveStats, displayStaminaMax } from '../engine/equipment';
import { formatEffectSummary } from '../engine/statusEffects';
import { getCorruptionName } from '../engine/contentPack';
import { findFactionQuestById } from '../engine/factionQuests';
import { livingEscortPools } from '../engine/escort';

// OTA-214 — Aetheric Vision Lens active indicator. Pure presence
// readout: when the player has any item granting the detect_aether
// gate (the Lens is the canonical source), shows a small badge so
// they KNOW the OTA-198 +15pp hookBonus is firing on their searches.
// Without this the lens worked silently and the player had no way
// to verify it was active beyond the rare OTA-200 hook narration.
function AethericVisionBadge({ player }: Props) {
  const active = React.useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { aethericVisionActive } = require('../engine/itemEffect');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { findExplorationItemByName, findGearByName, findMaterialByName } = require('../engine/crafting');
      return !!aethericVisionActive(
        player.inventory.map((i) => i.name),
        [findExplorationItemByName, findGearByName, findMaterialByName],
      );
    } catch { return false; }
  }, [player.inventory]);
  if (!active) return null;
  return (
    <Text style={lensBadgeStyle.badge}>◉ AETHERIC LENS · scanning</Text>
  );
}
const lensBadgeStyle = StyleSheet.create({
  badge: { color: '#6a9bbf', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 3 },
});

// OTA-211 — Aether Dust buff countdown. Reads player.aetherBuff;
// re-renders every second while active so the player sees the
// timer ticking down. Hidden when no buff is active. Format:
// "♦ +3 STR · 04:23"
function AetherBuffBadge({ player }: Props) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (!player.aetherBuff) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [player.aetherBuff]);
  if (!player.aetherBuff) return null;
  const remainingMs = player.aetherBuff.expiresAtMs - now;
  if (remainingMs <= 0) return null;
  const totalSec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return (
    <Text style={aetherBadgeStyle.badge}>
      ♦ +{player.aetherBuff.bonus} {player.aetherBuff.stat.toUpperCase().slice(0, 3)} · {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </Text>
  );
}
const aetherBadgeStyle = StyleSheet.create({
  badge: { color: '#b88ce0', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 3 },
});

// OTA-435 — Cores progress at a glance. The main-quest count (X/9 Cores) lived
// only in the Contracts screen and inside the exploration objective chip's prose
// hint; the play HUD had no discrete indicator next to HP/STA/TC. This badge
// surfaces it once the player knows the Cores matter (revelation → cores →
// descent) and hides before the hook and after they leave for the Nexus.
function CoresProgressBadge({ player }: Props) {
  const mq = player.mainQuest;
  if (!mq) return null;
  if (mq.phase !== 'revelation' && mq.phase !== 'cores' && mq.phase !== 'descent') return null;
  const n = mq.coresRecovered?.length ?? 0;
  return <Text style={coresBadgeStyle.badge}>◆ {n}/9 CORES</Text>;
}
const coresBadgeStyle = StyleSheet.create({
  badge: { color: '#d8b46a', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 3 },
});

interface Props { player: PlayerCharacter; fill?: boolean; }

// OTA-632 — health-tinted player card. The HP readout is a tiny number in the
// top-left card; a playtester died (broken-ladder fall) partly because it's so
// easy to miss how low you are. The card BACKGROUND now fades from a subtle dark
// green at full HP straight down to a strong dark red as you bleed out (no amber
// midpoint — the bright yellow read weird and washed the text), and the HP number
// itself takes the matching colour, so your health reads at a glance without parsing
// digits. Both stay dark enough to keep the cream text legible.
const HP_GREEN: readonly [number, number, number] = [88, 168, 96];
const HP_RED: readonly [number, number, number] = [196, 64, 52];
const CARD_BASE: readonly [number, number, number] = [0x13, 0x11, 0x0f];

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}
function mix(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
/** Health hue for `frac` (0..1): red → amber → green. */
export function healthHue(frac: number): [number, number, number] {
  const f = Math.max(0, Math.min(1, frac));
  // engine_Dev — direct green↔red fade, no amber waypoint. The bright yellow midpoint
  // read weird (it got vivid again at half HP and washed out the card text), so full
  // health just dims straight down toward red as you bleed.
  return mix(HP_RED, HP_GREEN, f);
}
/** Card background: the health hue blended over the dark base, intensifying as
 *  HP drops (subtle green when full, the card "fills" red near death). */
export function healthCardBg(frac: number): string {
  const f = Math.max(0, Math.min(1, frac));
  const [r, g, b] = mix(CARD_BASE, healthHue(f), 0.20 + (1 - f) * 0.55);
  return `rgb(${r}, ${g}, ${b})`;
}
/** Brighter health hue for the HP number itself, so it pops off the dark card. */
export function healthTextColor(frac: number): string {
  const [r, g, b] = mix(healthHue(frac), [255, 255, 255], 0.45);
  return `rgb(${r}, ${g}, ${b})`;
}

// OTA-633 — animation timings (tunable). The steady card colour FADES toward the
// new HP level; on damage a red overlay PULSES. The pulse is asymmetric on
// purpose: a fast RISE so a hit registers instantly even mid-combat, then a slower
// FALL so it lingers long enough to be unmissable (a flat 150ms can flicker by).
const HP_FADE_MS = 300;          // steady colour slide on heal / bleed
const HP_PULSE_RISE_MS = 90;     // flash up fast — reads as immediate impact
const HP_PULSE_FALL_MS = 320;    // settle slower — can't be missed
const HP_PULSE_MAX_OPACITY = 0.45;
const HP_PULSE_COLOR = 'rgb(220, 64, 52)';

export function StatsPanel({ player, fill }: Props) {
  const race = getRaces().find((r) => r.id === player.raceId);
  const factionStanding = player.factionStanding.find((f) => f.factionId === player.factionId)?.standing ?? 0;
  // OTA-632 — HP fraction drives the card tint + HP-number colour.
  const hpFrac = player.hpMax > 0 ? player.hp / player.hpMax : 1;

  // OTA-633 — animate it. `animFrac` slides toward the true HP fraction so the
  // card colour FADES instead of snapping; `pulse` flashes a red overlay when HP
  // DROPS so a hit registers instantly. Refs persist across the panel's frequent
  // re-renders; the effect only fires on an actual HP change.
  const animFrac = React.useRef(new Animated.Value(hpFrac)).current;
  const pulse = React.useRef(new Animated.Value(0)).current;
  const prevHp = React.useRef(player.hp);
  React.useEffect(() => {
    Animated.timing(animFrac, { toValue: hpFrac, duration: HP_FADE_MS, useNativeDriver: false }).start();
    if (player.hp < prevHp.current) {
      pulse.stopAnimation();
      pulse.setValue(0);
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: HP_PULSE_RISE_MS, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: HP_PULSE_FALL_MS, useNativeDriver: false }),
      ]).start();
    }
    prevHp.current = player.hp;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.hp, player.hpMax]);
  // Card background follows the animated fraction across the full gradient.
  const animBg = React.useMemo(
    () => animFrac.interpolate({
      inputRange: [0, 0.25, 0.5, 0.75, 1],
      outputRange: [healthCardBg(0), healthCardBg(0.25), healthCardBg(0.5), healthCardBg(0.75), healthCardBg(1)],
    }),
    [animFrac],
  );
  const pulseOpacity = React.useMemo(
    () => pulse.interpolate({ inputRange: [0, 1], outputRange: [0, HP_PULSE_MAX_OPACITY] }),
    [pulse],
  );

  // Effective AC = race base + summed armor bonus across head/chest/legs/feet.
  // OTA-227 — uses resolveDisplayArmorByName so fused armor (uniqueStats,
  // catalog-absent) contributes its acBonus to the displayed AC. Without
  // this the StatsPanel desyncs from aggregateArmor (gameStore.ts:17372)
  // which already handles uniqueStats — combat saw +2 AC, display showed 0.
  let armorAc = 0;
  for (const slot of ARMOR_SLOTS) {
    const name = player.equipped?.[slot];
    if (!name) continue;
    armorAc += resolveDisplayArmorByName(name, player.inventory)?.acBonus ?? 0;
  }
  // Match the combat-side AC ceiling (gameStore AC_CEILING = 20) so the number the
  // player sees is the number combat uses — no "displayed 24 but hit as 20" gap.
  const effectiveAc = Math.min(20, player.ac + armorAc);

  // Stats with accessory + armor bonuses folded in so the player sees the
  // numbers combat will actually use.
  const eff = effectiveStats(player);

  // Compose a single-line summary of every filled slot so the panel
  // stays compact even with eight slots tracked.
  // OTA-406 — show a weapon's COATED name in the equipped summary (resolved by
  // the slot id so two same-named weapons, one coated, are told apart). Armor
  // slots can't be coated, so they stay as the plain name.
  const coatedSlotName = (slotName: string, id: string | null | undefined): string => {
    if (!id) return slotName;
    const inst = player.inventory?.find((i) => i.id === id);
    return inst ? coatedDisplayName(inst) : slotName;
  };
  const slotParts: string[] = [];
  if (player.equipped?.main) slotParts.push(`R: ${coatedSlotName(player.equipped.main, player.equipped.mainId)}`);
  if (player.equipped?.off) slotParts.push(`L: ${coatedSlotName(player.equipped.off, player.equipped.offId)}`);
  if (player.equipped?.head) slotParts.push(`Hd: ${player.equipped.head}`);
  if (player.equipped?.chest) slotParts.push(`Ch: ${player.equipped.chest}`);
  if (player.equipped?.legs) slotParts.push(`Lg: ${player.equipped.legs}`);
  if (player.equipped?.feet) slotParts.push(`Ft: ${player.equipped.feet}`);
  if (player.equipped?.amulet) slotParts.push(`Aml: ${player.equipped.amulet}`);
  if (player.equipped?.ring) slotParts.push(`Rg: ${player.equipped.ring}`);
  const equippedLabel = slotParts.length > 0 ? slotParts.join(' · ') : 'nothing';

  // OTA-145 — dog name displays on the same row as the player name,
  // right-aligned to the panel edge, when a dog is active. Hidden for
  // abandoned/dead/waiting dogs so the panel doesn't lie. Playtester:
  // "The dogs name should go on the same level as yours and aligned
  // right to the edge of the box."
  const dogShows = player.dog
    && player.dog.status !== 'abandoned'
    && player.dog.status !== 'dead';

  // OTA-145 — golem name displays under the dog name, right-aligned.
  // Playtester: "the golem.name.shluld be under the dogs in the
  // character box."
  const golemShows = !!player.sidekick && player.sidekick.hp > 0;

  // Escort party the player is protecting — ONE row per active escort (shared pool),
  // rendered in both modes.
  const escortPools = livingEscortPools(player.activeFactionQuests);
  const escortRows = escortPools.length > 0 ? (
    <View style={styles.escortBlock}>
      {escortPools.map((p, i) => {
        const frac = p.hpMax > 0 ? p.hp / p.hpMax : 0;
        const color = frac <= 0.34 ? '#e07a5f' : frac <= 0.67 ? '#d9b15f' : '#7fae8a';
        return (
          <Text key={`esc_${i}`} style={[styles.escortName, { color }]} numberOfLines={1}>
            ↳ {p.label} ({p.hp}/{p.hpMax})
          </Text>
        );
      })}
    </View>
  ) : null;

  // COMBAT MODE (`fill`) — the panel becomes the top half of the tall combat
  // column. It deliberately does NOT show the full stat sheet (that's clutter
  // mid-fight and the tap-to-open-sheet is disabled in combat); instead it
  // shows the player's name + companions, the live vitals line, the escort
  // party (the thing the player has to actively keep alive), and any active
  // effects. Content is vertically centered so the tall box reads as
  // intentional rather than "writing jammed at the top, empty below."
  if (fill) {
    return (
      <Animated.View style={[styles.container, styles.fill, styles.combatOutline, styles.combatCenter, { backgroundColor: animBg }]}>
        <Animated.View pointerEvents="none" style={[styles.pulseOverlay, { opacity: pulseOpacity }]} />
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
          {dogShows && player.dog ? (
            <Text style={styles.dogName} numberOfLines={1}>
              {player.dog.name} ({player.dog.hp}/{player.dog.hpMax})
            </Text>
          ) : null}
        </View>
        {golemShows && player.sidekick ? (
          <View style={styles.golemRow}>
            <Text style={styles.golemName} numberOfLines={1}>
              {player.sidekick.name} ({player.sidekick.hp}/{player.sidekick.hpMax})
            </Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Stat label="HP" value={`${player.hp}/${player.hpMax}`} valueColor={healthTextColor(hpFrac)} />
          <Stat label="STA" value={`${player.stamina}/${displayStaminaMax(player)}`} />
          <Stat label="AC" value={`${effectiveAc}`} />
        </View>
        {escortRows ? (
          <View style={styles.escortCombatWrap}>
            <Text style={styles.escortHeader}>Escorting — keep them alive</Text>
            {escortRows}
          </View>
        ) : null}
        {player.statusEffects && player.statusEffects.length > 0 && (
          <Text style={styles.effects} numberOfLines={1}>
            Effects: {formatEffectSummary(player.statusEffects)}
          </Text>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { backgroundColor: animBg }]}>
      {/* OTA-633 — damage pulse: a red wash that flashes in fast and fades out,
          behind the card content so the text stays readable. */}
      <Animated.View pointerEvents="none" style={[styles.pulseOverlay, { opacity: pulseOpacity }]} />
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
        {dogShows && player.dog ? (
          <Text style={styles.dogName} numberOfLines={1}>
            {player.dog.name} ({player.dog.hp}/{player.dog.hpMax})
          </Text>
        ) : null}
      </View>
      {golemShows && player.sidekick ? (
        <View style={styles.golemRow}>
          <Text style={styles.golemName} numberOfLines={1}>
            {player.sidekick.name} ({player.sidekick.hp}/{player.sidekick.hpMax})
          </Text>
        </View>
      ) : null}
      {/* "A real escort mission" — live escortees under the player's name. */}
      {escortRows}
      <Text style={styles.subline}>{race?.name ?? player.raceId}</Text>
      {/* OTA-744 — vitals row. Currency moved OUT to its own wallet line below:
          with 5 cells a 3-digit HP ("109/109") overflowed its 1/5 slot and
          wrapped a digit onto a second line. Four vitals give each cell more
          room, and the values now shrink-to-fit instead of wrapping. */}
      <View style={styles.row}>
        <Stat label="HP" value={`${player.hp}/${player.hpMax}`} valueColor={healthTextColor(hpFrac)} />
        {/* OTA-745 — nudge STA + AC right (AC a bit, STA half as much) for alignment. */}
        <Stat label="STA" value={`${player.stamina}/${displayStaminaMax(player)}`} nudge={4} />
        <Stat label="AC" value={`${effectiveAc}`} nudge={8} />
        <Stat label={getCorruptionName().slice(0, 4)} value={`${player.corruption}`} />
      </View>
      <Text style={styles.wallet} numberOfLines={1}>◈ {player.tc} TC</Text>
      <AethericVisionBadge player={player} />
      <AetherBuffBadge player={player} />
      <CoresProgressBadge player={player} />
      <View style={styles.row}>
        <Stat label="STR" value={formatStat(player.stats.strength, eff.strength)} />
        <Stat label="DEX" value={formatStat(player.stats.dexterity, eff.dexterity)} />
        <Stat label="INT" value={formatStat(player.stats.intelligence, eff.intelligence)} />
        <Stat label="WIS" value={formatStat(player.stats.wisdom, eff.wisdom)} />
        <Stat label="CHA" value={formatStat(player.stats.charisma, eff.charisma)} />
      </View>
      <Text style={styles.equipped} numberOfLines={4} ellipsizeMode="tail">
        Equipped: {equippedLabel}
      </Text>
      {player.statusEffects && player.statusEffects.length > 0 && (
        <Text style={styles.effects} numberOfLines={1}>
          Effects: {formatEffectSummary(player.statusEffects)}
        </Text>
      )}
      {player.companion && (
        <Text style={styles.companion} numberOfLines={1}>
          Companion: {player.companion.name}
        </Text>
      )}
      {(() => {
        const titles = (player.activeFactionQuestIds ?? [])
          .map((id) => findFactionQuestById(id)?.title)
          .filter((t): t is string => !!t);
        if (titles.length === 0) return null;
        return (
          <Text style={styles.contracts} numberOfLines={2}>
            Contracts: {titles.join(' · ')}
          </Text>
        );
      })()}
      <Text style={styles.subline}>Faction standing: {factionStanding}</Text>
      {/* OTA 040 — affordance for the new Player Sheet screen. Tap
          handler lives on the parent TouchableOpacity in
          ExplorationScreen.tsx; this is the visual cue. */}
      <Text style={styles.tapHint}>tap for full sheet ›</Text>
    </Animated.View>
  );
}

// Render a stat as "base" or "base (+bonus)" when gear boosts it.
function formatStat(base: number, effective: number): string {
  return effective > base ? `${effective} (+${effective - base})` : `${base}`;
}

function Stat({ label, value, valueColor, nudge }: { label: string; value: string; valueColor?: string; nudge?: number }) {
  return (
    // OTA-745 — `nudge` insets a single stat's label+value to the right (px), for
    // fine visual alignment of the vitals row without moving the other cells.
    <View style={[styles.stat, nudge ? { paddingLeft: nudge } : null]}>
      <Text style={styles.label}>{label}</Text>
      {/* OTA-744 — one line always; a wide value (e.g. "109/109") scales down to
          fit its cell instead of wrapping a digit onto a second row. */}
      <Text
        style={[styles.value, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // engine_Dev — combat arena: let the card fill the tall column so the box runs long.
  fill: { flex: 1 },
  // engine_Dev — combat arena: a light outline around the player band for a clean divide from the
  // enemy band stacked below it (matches the enemy box's combat outline).
  combatOutline: { borderColor: '#8fa6ac', borderWidth: 1.5 },
  container: {
    backgroundColor: '#0e1618',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    padding: 8,
    borderRadius: 4,
    overflow: 'hidden', // clip the damage-pulse overlay to the rounded corners
  },
  // OTA-633 — full-bleed red wash for the damage pulse; sits behind the card
  // content (first child) so the stats text stays on top and readable.
  pulseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HP_PULSE_COLOR,
  },
  name: { color: '#d6e4e8', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  // OTA-145 — row holds player name (left, growing) + dog name
  // (right, fixed). flex layout pins the dog to the right edge.
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  dogName: { color: '#6ab0c9', fontSize: 13, fontWeight: '600', flexShrink: 0, maxWidth: 160 },
  // OTA-145 — golem row sits right-aligned beneath the dog name row.
  // Slightly muted color (slate-mauve) so it reads as a secondary
  // companion vs the dog's warm-gold.
  golemRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  golemName: { color: '#9888a8', fontSize: 12, fontWeight: '600', maxWidth: 200 },
  // Escort party — sits directly under the player's name. Color shifts
  // green→amber→red with each escortee's remaining HP so the player can see
  // at a glance who's in danger and needs the fight ended fast.
  escortBlock: { marginTop: 1, marginLeft: 4 },
  escortName: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  // Combat mode — center the lean vitals+escort block so the tall arena box
  // doesn't read as "content jammed at top, empty below."
  combatCenter: { justifyContent: 'center' },
  escortCombatWrap: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#2b3a3e', paddingTop: 6 },
  escortHeader: { color: '#8fa6ac', fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginBottom: 2, marginLeft: 4 },
  subline: { color: '#6c8088', fontSize: 10, marginBottom: 2 },
  equipped: { color: '#6ab0c9', fontSize: 9, marginTop: 3, letterSpacing: 0.5 },
  effects: { color: '#e07a5f', fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
  tapHint: { color: '#6c8088', fontSize: 8, marginTop: 4, letterSpacing: 0.5, fontStyle: 'italic', textAlign: 'right' },
  companion: { color: '#9ec96a', fontSize: 9, marginTop: 2, letterSpacing: 0.5, fontWeight: '700' },
  contracts: { color: '#9ec96a', fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 4, marginTop: 3 },
  stat: { flex: 1, minWidth: 0 },
  // OTA-744 — the wallet gets its own gold line, off the cramped vitals row.
  wallet: { color: '#e0b84a', fontSize: 12, fontWeight: '700', marginTop: 4, letterSpacing: 0.5 },
  label: { color: '#6c8088', fontSize: 9 },
  value: { color: '#d6e4e8', fontSize: 12, fontWeight: '600' },
});
