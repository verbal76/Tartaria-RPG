import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PlayerCharacter } from '../engine/types';
import racesData from '../data/races/races.json';
import { resolveDisplayArmorByName } from '../engine/itemResolution';
import { coatedDisplayName } from '../engine/weaponCoating';
import { ARMOR_SLOTS, effectiveStats } from '../engine/equipment';
import { formatEffectSummary } from '../engine/statusEffects';
import { findFactionQuestById } from '../engine/factionQuests';

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

interface Props { player: PlayerCharacter; }

export function StatsPanel({ player }: Props) {
  const race = (racesData as { id: string; name: string }[]).find((r) => r.id === player.raceId);
  const factionStanding = player.factionStanding.find((f) => f.factionId === player.factionId)?.standing ?? 0;

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
  const effectiveAc = player.ac + armorAc;

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
  const golemShows = !!player.golem && player.golem.hp > 0;

  return (
    <View style={styles.container}>
      <View style={styles.nameRow}>
        <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
        {dogShows && player.dog ? (
          <Text style={styles.dogName} numberOfLines={1}>
            {player.dog.name} ({player.dog.hp}/{player.dog.hpMax})
          </Text>
        ) : null}
      </View>
      {golemShows && player.golem ? (
        <View style={styles.golemRow}>
          <Text style={styles.golemName} numberOfLines={1}>
            {player.golem.name} ({player.golem.hp}/{player.golem.hpMax})
          </Text>
        </View>
      ) : null}
      <Text style={styles.subline}>{race?.name ?? player.raceId}</Text>
      <View style={styles.row}>
        <Stat label="HP" value={`${player.hp}/${player.hpMax}`} />
        <Stat label="STA" value={`${player.stamina}/${player.staminaMax}`} />
        <Stat label="AC" value={`${effectiveAc}`} />
        <Stat label="TC" value={`${player.tc}`} />
        <Stat label="Corr" value={`${player.corruption}`} />
      </View>
      <AethericVisionBadge player={player} />
      <AetherBuffBadge player={player} />
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
    </View>
  );
}

// Render a stat as "base" or "base (+bonus)" when gear boosts it.
function formatStat(base: number, effective: number): string {
  return effective > base ? `${effective} (+${effective - base})` : `${base}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    padding: 8,
    borderRadius: 4,
  },
  name: { color: '#e6d8b3', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  // OTA-145 — row holds player name (left, growing) + dog name
  // (right, fixed). flex layout pins the dog to the right edge.
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  dogName: { color: '#c9a86a', fontSize: 13, fontWeight: '600', flexShrink: 0, maxWidth: 160 },
  // OTA-145 — golem row sits right-aligned beneath the dog name row.
  // Slightly muted color (slate-mauve) so it reads as a secondary
  // companion vs the dog's warm-gold.
  golemRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  golemName: { color: '#9888a8', fontSize: 12, fontWeight: '600', maxWidth: 200 },
  subline: { color: '#7a705c', fontSize: 10, marginBottom: 2 },
  equipped: { color: '#c9a86a', fontSize: 9, marginTop: 3, letterSpacing: 0.5 },
  effects: { color: '#e07a5f', fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
  tapHint: { color: '#7a705c', fontSize: 8, marginTop: 4, letterSpacing: 0.5, fontStyle: 'italic', textAlign: 'right' },
  companion: { color: '#9ec96a', fontSize: 9, marginTop: 2, letterSpacing: 0.5, fontWeight: '700' },
  contracts: { color: '#9ec96a', fontSize: 9, marginTop: 2, letterSpacing: 0.5 },
  row: { flexDirection: 'row', gap: 4, marginTop: 3 },
  stat: { flex: 1, minWidth: 0 },
  label: { color: '#7a705c', fontSize: 9 },
  value: { color: '#e6d8b3', fontSize: 12, fontWeight: '600' },
});
