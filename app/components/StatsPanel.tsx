import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { PlayerCharacter } from '../engine/types';
import { STAT_ROW_MAX_WIDTH } from '../ui/layoutConstants'; // OTA-1229 — pure constant: no storage in a render path
import racesData from '../data/races/races.json';
import { resolveDisplayArmorByName } from '../engine/itemResolution';
import { coatedDisplayName } from '../engine/weaponCoating';
import { ARMOR_SLOTS, effectiveStats, aethericVisionEquipped, standingAc } from '../engine/equipment';
import { playerPowerScore, powerMatchup } from '../engine/powerRating';
import { formatEffectSummary } from '../engine/statusEffects';
import { findFactionQuestById } from '../engine/factionQuests';
import { livingEscortPools } from '../engine/escort';
// ⚠ OTA-1650 — the two glyphs the owner asked for by name: "a small weapon
// symbol next to the golem if they are armed, and a small shiled next to the
// dogs name if it has on armor". Both read the same helpers the character
// panel and the repair bench read, so the compact row can never disagree with
// the expanded one about whether a companion is kitted.
import {
  GOLEM_ARMED_GLYPH, DOG_ARMORED_GLYPH, golemIsArmed, dogIsArmored,
  golemWeapon, dogVestInstance, gearCondition,
} from '../engine/companionGear';
import { useReduceMotion } from '../state/accessibility';

// OTA-214 — Aetheric Vision Lens active indicator. Pure presence
// readout: when the player has any item granting the detect_aether
// gate (the Lens is the canonical source), shows a small badge so
// they KNOW the OTA-198 +15pp hookBonus is firing on their searches.
// Without this the lens worked silently and the player had no way
// to verify it was active beyond the rare OTA-200 hook narration.
function AethericVisionBadge({ player }: Props) {
  // OTA-927 — the badge tracks the EQUIPPED Lens slot (equip-gated), not mere carry.
  // Depends on equipped (the slot) + inventory (resolveEquippedItem reads the instance).
  const active = React.useMemo(() => {
    try { return !!aethericVisionEquipped(player); } catch { return false; }
  }, [player.equipped, player.inventory]);
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

interface Props { player: PlayerCharacter; enemyPower?: number; }

// OTA-632 — health-tinted player card. The HP readout is a tiny number in the
// top-left card; a playtester died (broken-ladder fall) partly because it's so
// easy to miss how low you are. The card BACKGROUND now fades from a subtle dark
// green at full HP → amber at half → a strong dark red as you bleed out, and the
// HP number itself takes the matching colour, so your health reads at a glance
// without parsing digits. Both stay dark enough to keep the cream text legible.
const HP_GREEN: readonly [number, number, number] = [88, 168, 96];
const HP_AMBER: readonly [number, number, number] = [200, 158, 64];
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
  return f >= 0.5 ? mix(HP_AMBER, HP_GREEN, (f - 0.5) / 0.5) : mix(HP_RED, HP_AMBER, f / 0.5);
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

export function StatsPanel({ player, enemyPower }: Props) {
  const race = (racesData as { id: string; name: string }[]).find((r) => r.id === player.raceId);
  // OTA-632 — HP fraction drives the card tint + HP-number colour.
  const hpFrac = player.hpMax > 0 ? player.hp / player.hpMax : 1;

  // OTA-633 — animate it. `animFrac` slides toward the true HP fraction so the
  // card colour FADES instead of snapping; `pulse` flashes a red overlay when HP
  // DROPS so a hit registers instantly. Refs persist across the panel's frequent
  // re-renders; the effect only fires on an actual HP change.
  const animFrac = React.useRef(new Animated.Value(hpFrac)).current;
  const pulse = React.useRef(new Animated.Value(0)).current;
  const prevHp = React.useRef(player.hp);
  // OTA-898 (SA-6) — reduce-motion: snap the HP bar to its new level and skip
  // the red damage-flash entirely (the number still updates; no motion).
  const reduceMotion = useReduceMotion();
  React.useEffect(() => {
    if (reduceMotion) {
      animFrac.setValue(hpFrac);
      pulse.setValue(0);
      prevHp.current = player.hp;
      return;
    }
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
  }, [player.hp, player.hpMax, reduceMotion]);
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
  // OTA-924 — show the trimmed standing AC so the panel matches what combat resolves against.
  // ⚠ OTA-1133 — and it is the SHARED helper now, not a fourth inline copy of
  // the same sum. This panel was right all along; what was wrong is that the
  // Arbiter and the LLM prompt printed the raw `player.ac` (the RACIAL BASE)
  // instead, so the sheet said 16 while the Arbiter answered 10 to the same
  // question. One function, one answer, everywhere.
  const effectiveAc = standingAc(player);

  // Stats with accessory + armor bonuses folded in so the player sees the
  // numbers combat will actually use.
  const eff = effectiveStats(player);
  // OTA-928 — the player's Power rating (best combat stat + weapon avg + AC + HP/10),
  // shown top-right; faces each enemy's Power on its card as a quick matchup gauge.
  const pwrRating = playerPowerScore(player);
  // OTA-930 — colour the player's OWN Power badge by the current-target matchup so a
  // fight you dominate lights your number green (gold = even, red = outmatched). Neutral
  // gold out of combat (no enemyPower passed). Mirrors the colour on the enemy's badge.
  const playerMatch = typeof enemyPower === 'number' ? powerMatchup(pwrRating, enemyPower) : null;
  // OTA-929 — flash the UP/DOWN movement of Power when it changes (swapping your main
  // weapon, upgrading armour, a stat tick, a buff), so a gear choice gives instant
  // "did that help?" feedback. Shows the signed delta for ~2.5s, then fades.
  const [powerDelta, setPowerDelta] = React.useState<number | null>(null);
  const prevPowerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    const prev = prevPowerRef.current;
    prevPowerRef.current = pwrRating;
    if (prev !== null && prev !== pwrRating) {
      setPowerDelta(pwrRating - prev);
      const t = setTimeout(() => setPowerDelta(null), 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [pwrRating]);

  // ⚠ OTA-1651 — THE SLOT SUMMARY WENT WITH ITS ROW. It composed
  // "R: … · L: … · Hd: … · Ch: …" for the gold block this card no longer draws,
  // and it also only ever listed EIGHT of the eleven slots (no cloak, no hands,
  // no rings past the first — a fourth ring arrived in OTA-1648 and this line
  // could never have shown it). The full sheet lists every slot correctly, and
  // it is one tap away.

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
  const golemShows = !!player.golem && player.golem.hp > 0;

  // ⚠⚠ OTA-1650 — ARMED / ARMOURED, AND WHETHER IT IS ABOUT TO GO. The glyph
  // answers the owner's question ("so we know if they are armed or not"); the
  // COLOUR answers the one right behind it ("i dont know when thiewr weapon
  // breaks"). A failing piece turns the glyph red on the row he is already
  // looking at, so the warning is not something you have to go and find.
  const golemArmed = golemIsArmed(player);
  const dogArmored = dogIsArmored(player);
  const golemWeaponFailing = gearCondition(golemWeapon(player)?.durability) === 'failing';
  const dogVestFailing = gearCondition(dogVestInstance(player)?.durability) === 'failing';

  // OTA-915 — a downed dog (benched at 0 HP, bleed-out clock running) shows a live
  // "⏳ Nh — feed to save" countdown by its name instead of the plain HP, so the 24h
  // window is impossible to miss. Healthy/climb-benched dogs keep the normal HP readout.
  // 24 = gameStore's DOG_BLEED_OUT_HOURS (hardcoded to keep this component store-free).
  const DOG_BLEED_OUT_HOURS = 24;
  const dogDowned = !!player.dog
    && player.dog.status === 'waiting_at_base'
    && player.dog.hp <= 0
    && player.dog.downedAtHour != null;
  const dogHoursLeft = dogDowned
    ? Math.max(0, Math.ceil(DOG_BLEED_OUT_HOURS - ((player.hoursElapsed ?? 0) - (player.dog!.downedAtHour ?? 0))))
    : null;

  return (
    <Animated.View style={[styles.container, { backgroundColor: animBg }]}>
      {/* OTA-633 — damage pulse: a red wash that flashes in fast and fades out,
          behind the card content so the text stays readable. */}
      <Animated.View pointerEvents="none" style={[styles.pulseOverlay, { opacity: pulseOpacity }]} />
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
        <View style={styles.nameRowRight}>
          {/* OTA-928 — the player's Power rating, top-right corner; faces each enemy's
              Power (top-left of its card) across the HUD gap as a quick matchup gauge. */}
          <Text style={[styles.powerBadge, playerMatch === 'favored' ? styles.powerFavored : playerMatch === 'danger' ? styles.powerDanger : null]} accessibilityLabel={`Your power rating ${pwrRating}`}>
            ◆ {pwrRating} PWR
          </Text>
          {powerDelta !== null && powerDelta !== 0 && (
            <Text
              style={[styles.powerDelta, powerDelta > 0 ? styles.powerUp : styles.powerDown]}
              accessibilityLabel={`Power ${powerDelta > 0 ? 'up' : 'down'} ${Math.abs(powerDelta)}`}
            >
              {powerDelta > 0 ? `▲ +${powerDelta}` : `▼ ${powerDelta}`}
            </Text>
          )}
          {/* ⚠⚠⚠ OTA-1721 — THE DOWNED-DOG COUNTDOWN USED TO SIT HERE, and it is
              why the owner's own name rendered as "..." on his screen. This
              column is `flexShrink: 0` — it never gives up width — and the name
              beside it is `flexShrink: 1`, so it gives up ALL of it. A compact
              badge ("◆ 58 PWR", "Rust (16/16)") leaves the name room. A SENTENCE
              — "Rust ⏳ 24h — feed to save" — does not, and the name collapsed to
              a bare ellipsis for as long as the dog was bleeding out. It has its
              own full-width row below now, the same shape the golem line has
              used all along. */}
          {dogShows && player.dog && !dogDowned ? (
            (
              <Text
                style={styles.dogName}
                numberOfLines={1}
                accessibilityLabel={`${player.dog.name}, ${player.dog.hp} of ${player.dog.hpMax} HP${dogArmored ? `, wearing ${dogVestInstance(player)?.name ?? 'a vest'}` : ', no vest'}`}
              >
                {player.dog.name} ({player.dog.hp}/{player.dog.hpMax})
                {dogArmored ? <Text style={dogVestFailing ? styles.gearGlyphFailing : styles.gearGlyph}> {DOG_ARMORED_GLYPH}</Text> : null}
              </Text>
            )
          ) : null}
        </View>
      </View>
      {/* ⚠⚠ OTA-1721 — the bleed-out countdown, full width, where a sentence
          belongs. It is the loudest thing on the card for 24 game-hours and it
          no longer buys that at the cost of the player's own name. */}
      {dogShows && player.dog && dogDowned ? (
        <Text
          style={styles.dogDown}
          numberOfLines={1}
          accessibilityLabel={`${player.dog.name} is down — about ${dogHoursLeft} hours to feed before it dies`}
        >
          {player.dog.name} ⏳ {dogHoursLeft}h — feed to save
        </Text>
      ) : null}
      {golemShows && player.golem ? (
        <View style={styles.golemRow}>
          <Text
            style={styles.golemName}
            numberOfLines={1}
            accessibilityLabel={`${player.golem.name}, ${player.golem.hp} of ${player.golem.hpMax} HP${golemArmed ? `, wielding ${golemWeapon(player)?.name ?? 'a weapon'}` : ', unarmed'}`}
          >
            {player.golem.name} ({player.golem.hp}/{player.golem.hpMax})
            {golemArmed ? <Text style={golemWeaponFailing ? styles.gearGlyphFailing : styles.gearGlyph}> {GOLEM_ARMED_GLYPH}</Text> : null}
          </Text>
        </View>
      ) : null}
      {/* OTA-962 — escort party the player is protecting: ONE row per active escort
          (shared pool), color by remaining fraction. Parked parties are hidden. */}
      {livingEscortPools(player.activeFactionQuests).map((p, i) => {
        const frac = p.hpMax > 0 ? p.hp / p.hpMax : 0;
        const col = frac <= 0.34 ? '#e07a5f' : frac <= 0.67 ? '#d9b15f' : '#7fae8a';
        return (
          <Text key={`esc_${i}`} style={[styles.escortName, { color: col }]} numberOfLines={1}>
            ↳ {p.label} ({p.hp}/{p.hpMax})
          </Text>
        );
      })}
      <Text style={styles.subline}>{race?.name ?? player.raceId}</Text>
      {/* OTA-744 — vitals row. TC moved OUT to its own wallet line below: with 5
          cells a 3-digit HP ("109/109") overflowed its 1/5 slot and wrapped a
          digit onto a second line ("65/10" + a stray "9"). Four vitals give each
          cell more room, and the values now shrink-to-fit instead of wrapping. */}
      <View style={styles.row}>
        <Stat label="HP" value={`${player.hp}/${player.hpMax}`} valueColor={healthTextColor(hpFrac)} />
        <Stat label="STA" value={`${player.stamina}/${player.staminaMax}`} />
        <Stat label="AC" value={`${effectiveAc}`} />
        <Stat label="Corr" value={`${player.corruption}`} />
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
        {/* ⚠ OTA-1683 — STE was the one attribute this card left off. Owner:
            "in the small character portrait, ste is not shown." Same cell,
            same base/effective reading as the other five. */}
        <Stat label="STE" value={formatStat(player.stats.stealth ?? 0, eff.stealth)} />
      </View>
      {/* ⚠⚠ OTA-1651 — THE EQUIPPED BLOCK IS GONE FROM THIS CARD. Owner, with
          a screenshot: *"we can remove all of the gold writing telling me
          what's equipped… that should shorten both cards enough to give some
          room back to the main text block in the center of the exploration
          screen."* It ran to four wrapped lines of "R: … · L: … · Hd: … · Ch: …"
          on a card the player passes through, and every word of it is on the
          full sheet one tap away (`tap for full sheet ›`, right below) and on
          the weapon buttons at the bottom of the very same screen. */}
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
      {/* OTA-1651 — faction standing went with it, for the same reason and to
          the same place: it is a number you consult, not one you fight by. */}
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

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    // OTA-746 — all vitals share one flex:1 cell width, so the four columns are
    // equidistant. (OTA-745's per-stat nudge broke the even spacing; reverted.)
    <View style={styles.stat}>
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
  escortName: {
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  container: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
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
  // ⚠ OTA-1721 — `minWidth` is the guard, not the fix. Moving the countdown out
  // of the corner solved the reported case; this makes the CLASS unreachable, so
  // the next thing anyone stacks on the right cannot erase the player's name
  // however wide it gets. 64pt is roughly seven characters plus the ellipsis —
  // a truncated name is a compromise, a bare "..." is a broken card.
  name: { color: '#e6d8b3', fontSize: 14, fontWeight: '700', flexShrink: 1, minWidth: 64 },
  // OTA-145 — row holds player name (left, growing) + dog name
  // (right, fixed). flex layout pins the dog to the right edge.
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  // OTA-928 — right group: Power rating badge stacked above the dog name, right-aligned.
  nameRowRight: { alignItems: 'flex-end', flexShrink: 0 },
  powerBadge: { color: '#d9b45b', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  // OTA-930 — the player badge recolours by the current-target matchup (green favoured,
  // red outmatched); gold stays the even / no-target default.
  powerFavored: { color: '#9ec96a' },
  powerDanger: { color: '#e07a5f' },
  // OTA-929 — transient up/down Power-change flash, under the Power badge.
  powerDelta: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  powerUp: { color: '#9ec96a' },
  powerDown: { color: '#e07a5f' },
  dogName: { color: '#c9a86a', fontSize: 13, fontWeight: '600', flexShrink: 0, maxWidth: 160 },
  // OTA-915 — downed-dog bleed-out countdown: urgent red, wider to fit the "feed to save" call.
  // OTA-1721 — full-width row now; see the name-row comment above.
  // ⚠ The 200pt cap was a CORNER chip's cap. On its own row the sentence gets
  // the card, so a 16-character dog name cannot clip the words 'feed to save'
  // off the one warning that has a deadline attached.
  dogDown: { color: '#e5484d', fontSize: 12, fontWeight: '700', marginTop: 2 },
  // OTA-145 — golem row sits right-aligned beneath the dog name row.
  // Slightly muted color (slate-mauve) so it reads as a secondary
  // companion vs the dog's warm-gold.
  golemRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  golemName: { color: '#9888a8', fontSize: 12, fontWeight: '600', maxWidth: 200 },
  // OTA-1650 — the armed / armoured glyph beside a companion's name. Amber while
  // the piece is sound or merely worn; the failing tint is the SAME red the HP
  // bars use at their lowest band, so "about to break" reads the way "about to
  // die" already does on this panel.
  gearGlyph: { color: '#c9a86a', fontSize: 11 },
  gearGlyphFailing: { color: '#e07a5f', fontSize: 11 },
  subline: { color: '#a2977b', fontSize: 10, marginBottom: 2 },
  equipped: { color: '#c9a86a', fontSize: 9, marginTop: 3, letterSpacing: 0.5 },
  effects: { color: '#e07a5f', fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
  tapHint: { color: '#a2977b', fontSize: 8, marginTop: 4, letterSpacing: 0.5, fontStyle: 'italic', textAlign: 'right' },
  companion: { color: '#9ec96a', fontSize: 9, marginTop: 2, letterSpacing: 0.5, fontWeight: '700' },
  contracts: { color: '#9ec96a', fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
  // ⚠⚠ OTA-1229 — THE STAT ROW STOPS SPREADING ON A MONITOR. Owner, on the PC
  // build: *"the character portrait text and spacing didn't scale it
  // stretched."* Exactly what happened, and the cause is the line directly
  // below this one: `stat: { flex: 1 }` gives every column an EQUAL SHARE OF
  // WHATEVER WIDTH IT IS GIVEN. That is right on a phone, where the panel is
  // ~360px and five columns land at ~70px each — the measure these 9px labels
  // and 12px values were drawn against. OTA-1227 widened the desktop column to
  // 1024, the panel went to ~500, and the same five cells stretched to ~100
  // each. Nothing got bigger; the gaps did. Stretched, precisely.
  //
  // STAT_ROW_MAX_WIDTH caps the row at the phone measure it was designed for,
  // so the numbers stay grouped and the card's extra width becomes margin
  // instead of gaps between columns.
  //
  // ⚠ MOBILE IS UNTOUCHED, and not by luck: the constant is `undefined` on
  // native, so this key is absent from the style object entirely — not a large
  // number that merely happens never to bind.
  row: { flexDirection: 'row', gap: 4, marginTop: 3, maxWidth: STAT_ROW_MAX_WIDTH },
  // OTA-747 — each stat CENTERS its label+value in its equal-width cell, so the
  // columns read as evenly distributed regardless of how wide the value is
  // (a wide "35/109" no longer crowds the left while "20"/"34" leave big gaps).
  stat: { flex: 1, minWidth: 0, alignItems: 'center' },
  // OTA-744 — the wallet gets its own gold line, off the cramped vitals row.
  wallet: { color: '#e0b84a', fontSize: 12, fontWeight: '700', marginTop: 4, letterSpacing: 0.5 },
  label: { color: '#a2977b', fontSize: 9, textAlign: 'center' },
  value: { color: '#e6d8b3', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
