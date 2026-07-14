// OTA 040 — Player Sheet screen. Reached by tapping the top-left
// stats panel in the exploration HUD. Read-only — equip / unequip /
// use actions live on the inventory screen. This sheet's job is to
// show *what you are right now*, with every number broken down into
// its sources so the player can audit any surprising value.

import React, { useState } from 'react';
import { getNarratorName, getCorruptionName } from '../engine/contentPack';
import { resolveTitleRoster } from '../engine/customTitles';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { getRaces, getFactions } from '../engine/character';
import type { Faction, Race, PlayerCharacter, Stats } from '../engine/types';
import { effectiveStatsBreakdown, resolveEquippedItem, displayStaminaMax, type StatBreakdown } from '../engine/equipment';
import type { EquipSlot } from '../engine/types';
import { fineProgressBar, rawProgressPercent, SKILL_ACTIVITIES } from '../engine/statTraining';
import { effectiveAC, barehandDamageFor } from '../engine/raceMechanics';
import { corruptionTierOf, tierLabel, tierDescription } from '../engine/corruption';
import { decayedMenace, menaceTier } from '../engine/menace';
import { getItemPreview, getItemPreviewForInstance } from '../components/itemPreview';
import { weatherStatModifiers } from '../engine/weatherEffects';
import { findFactionQuestById } from '../engine/factionQuests';
import { findHuntById } from '../engine/hunts';
import { findMysteryById } from '../engine/mysteries';

const STAT_LABEL: Record<keyof Stats, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
  stealth: 'STE', // OTA-348 — Stealth attribute (race-rolled at creation)
};

const SLOT_LABEL: Record<string, string> = {
  main: 'Main hand',
  off: 'Off hand',
  head: 'Head',
  chest: 'Chest',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
  cloak: 'Cloak',
  amulet: 'Amulet',
  ring: 'Ring',
};

export function CharacterScreen() {
  const player = useGameStore((s) => s.player);
  const scene = useGameStore((s) => s.currentScene);
  const worldMemory = useGameStore((s) => s.worldMemory);
  const setScreen = useGameStore((s) => s.setScreen);
  // arb119 — per-section collapse (hook must precede the early return below).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No character loaded.</Text>
      </View>
    );
  }

  const race = getRaces().find((r) => r.id === player.raceId);
  const faction = getFactions().find((f) => f.id === player.factionId);
  const factionStanding = player.factionStanding.find((f) => f.factionId === player.factionId)?.standing ?? 0;
  const hpPct = player.hpMax > 0 ? player.hp / player.hpMax : 0;
  const stamMaxShown = displayStaminaMax(player);
  const stamPct = stamMaxShown > 0 ? player.stamina / stamMaxShown : 0;
  const hpColor = hpPct > 0.5 ? '#9ec96a' : hpPct > 0.25 ? '#6ab0c9' : '#e07a5f';
  const stamColor = stamPct > 0.4 ? '#9ec96a' : '#6ab0c9';

  const breakdown = effectiveStatsBreakdown(player, weatherStatModifiers(scene?.weather ?? null));
  const acValue = effectiveAC(player, scene ?? null);
  const barehand = barehandDamageFor(player.raceId);
  const barehandStr = barehand.bonus === 0
    ? `${barehand.count}d${barehand.sides}`
    : `${barehand.count}d${barehand.sides}${barehand.bonus > 0 ? '+' : ''}${barehand.bonus}`;
  const tier = corruptionTierOf(player.corruption ?? 0);

  // arb119 — section header helper, mirroring the inventory headers: each section
  // title is a tappable plate (semi-transparent backing so the gold label reads
  // over any background) with a ▾/▴ chevron that folds the section away.
  const sectionHeader = (key: string, label: string) => (
    <TouchableOpacity
      style={styles.sectionHeaderBar}
      activeOpacity={0.7}
      onPress={() => setCollapsed((s) => ({ ...s, [key]: !s[key] }))}
    >
      <Text style={styles.sectionChevron}>{collapsed[key] ? '▾' : '▴'}</Text>
      <Text style={styles.sectionHeaderLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>CHARACTER</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ── HEADER CARD ───────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.name}>{player.name}</Text>
          <Text style={styles.subline}>
            {race?.name ?? player.raceId}
            {faction ? ` · ${faction.name} (${factionStanding >= 0 ? '+' : ''}${factionStanding})` : ''}
          </Text>

          <View style={styles.barRow}>
            <Text style={styles.barLabel}>HP</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.max(0, hpPct * 100)}%`, backgroundColor: hpColor }]} />
            </View>
            <Text style={styles.barValue}>{player.hp}/{player.hpMax}</Text>
          </View>
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>STA</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.max(0, stamPct * 100)}%`, backgroundColor: stamColor }]} />
            </View>
            <Text style={styles.barValue}>{player.stamina}/{stamMaxShown}</Text>
          </View>
        </View>

        {/* ── CORE STATS ────────────────────────────────────────── */}
        {sectionHeader('core', 'CORE STATS')}
        {!collapsed.core && (
        <View style={styles.card}>
          {(Object.keys(STAT_LABEL) as Array<keyof Stats>).map((s) => (
            <StatRow
              key={s}
              label={STAT_LABEL[s]}
              b={breakdown[s]}
              progressBar={fineProgressBar(player, s)}
              progressPct={rawProgressPercent(player, s)}
              activities={SKILL_ACTIVITIES[s] ?? []}
            />
          ))}
        </View>
        )}

        {/* ── DEFENSE & BAREHAND ────────────────────────────────── */}
        {sectionHeader('defense', 'DEFENSE')}
        {!collapsed.defense && (
        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Armor Class</Text>
            <Text style={styles.kvValue}>{acValue}</Text>
          </View>
          {race?.racialACBonus && race.racialACBonus !== 'No inherent AC bonus' && (
            <Text style={styles.kvSub}>↳ {race.racialACBonus}</Text>
          )}
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Barehand</Text>
            <Text style={styles.kvValue}>{barehandStr}</Text>
          </View>
          {barehand.hitGate && (
            <Text style={styles.kvSub}>↳ hit only on a {barehand.hitGate} d{barehand.sides}</Text>
          )}
        </View>
        )}

        {/* ── WALLET & CONDITION ────────────────────────────────── */}
        {sectionHeader('wallet', 'WALLET & CONDITION')}
        {!collapsed.wallet && (
        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>TC</Text>
            <Text style={styles.kvValue}>{player.tc}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>{getCorruptionName()}</Text>
            <Text style={[styles.kvValue, tier === 'hollowed' && styles.danger, tier === 'corrupted' && styles.warning]}>
              {player.corruption} · {tierLabel(tier)}
            </Text>
          </View>
          <Text style={styles.kvSub}>↳ {tierDescription(tier)}</Text>
          {/* OTA-1093 — MENACE: your reputation for ruling by fear. Shown once you've
              built any (intimidation raises it). Higher menace stiffens your own
              intimidate checks and draws readier encounters; it fades if you stop. */}
          {(() => {
            const m = decayedMenace(player.menace ?? 0, player.menaceUpdatedHour ?? 0, player.hoursElapsed ?? 0);
            if (m < 1) return null;
            const mt = menaceTier(m);
            return (
              <>
                <View style={styles.kvRow}>
                  <Text style={styles.kvKey}>Menace</Text>
                  <Text style={[styles.kvValue, mt === 'Dreaded' && styles.danger, mt === 'Feared' && styles.warning]}>
                    {Math.round(m)} · {mt}
                  </Text>
                </View>
                <Text style={styles.kvSub}>↳ The waste has heard of you. Fear opens doors — and stiffens every spine you'd threaten next.</Text>
              </>
            );
          })()}
        </View>
        )}

        {/* ── FACTION STANDINGS ─────────────────────────────────── */}
        {/* 2026-05-25 OTA-041 — full faction standing panel. Playtester
            saw rep changes log in the world feed and asked "shouldn't
            I see that on my character page?" Lists every faction the
            player has any standing in, sorted highest first. The join
            threshold is +20 (per JOIN_THRESHOLD in engine/factions.ts);
            shows a checkmark on factions the player qualifies to join.
            Each faction's standing gates quest / hunt / mystery /
            storyline visibility via minRep; high standing means more
            contracts surface from that faction's vendors. */}
        {sectionHeader('factions', 'FACTION STANDINGS')}
        {!collapsed.factions && (
        <View style={styles.card}>
          {(() => {
            const factionsList = getFactions();
            const rows = (player.factionStanding ?? [])
              .map((row) => ({
                row,
                meta: factionsList.find((f) => f.id === row.factionId),
              }))
              .filter((r) => r.meta)
              .sort((a, b) => b.row.standing - a.row.standing);
            if (rows.length === 0) {
              return <Text style={styles.kvSub}>No standings recorded yet.</Text>;
            }
            return rows.map(({ row, meta }) => {
              const standing = row.standing;
              const qualifies = standing >= 20;
              const isOwn = row.factionId === player.factionId;
              const color = standing >= 20 ? '#9ec96a'
                : standing >= 0 ? '#bcd2db'
                : standing >= -10 ? '#6ab0c9'
                : '#e07a5f';
              return (
                <View key={row.factionId} style={styles.kvRow}>
                  <Text style={[styles.kvKey, isOwn && styles.factionOwn]}>
                    {meta!.name}{isOwn ? ' (sworn)' : ''}
                  </Text>
                  <Text style={[styles.kvValue, { color }]}>
                    {standing >= 0 ? '+' : ''}{standing}{qualifies && !isOwn ? ' ✓' : ''}
                  </Text>
                </View>
              );
            });
          })()}
          <Text style={styles.kvSub}>
            ↳ Standing rises with trades, gifts, and finished contracts; falls with theft, killing
            faction members, and rival favors. +20 unlocks joining the faction; high standing
            with a faction surfaces more of their contracts (hunts, mysteries, storylines) when
            you meet their vendors.
          </Text>
        </View>
        )}

        {/* ── EQUIPPED ──────────────────────────────────────────── */}
        {sectionHeader('equipped', 'EQUIPPED')}
        {!collapsed.equipped && (
        <View style={styles.card}>
          {(() => {
            // 2026-05-26 OTA-056 — two-handed weapon in main hand
            // also renders in the off-hand slot with a "(two-handed
            // grip)" badge. Player asked for the visual mirror so
            // both slots reflect that hands aren't free for a
            // shield / scanner / second weapon.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { findWeaponByName } = require('../engine/crafting');
            const mainName = player.equipped?.main;
            const mainWeaponCat = mainName ? findWeaponByName(mainName) : null;
            const mainIsTwoHanded = mainWeaponCat?.style === 'two_handed';
            return (Object.keys(SLOT_LABEL) as Array<keyof typeof SLOT_LABEL>).map((slot) => {
              const directName = (player.equipped as Record<string, string | undefined> | undefined)?.[slot];
              // Visual mirror: off-hand shows the main 2H weapon when
              // the player is holding one. Real equipped.off stays
              // undefined (so capability checks like isScanner read
              // correctly), only the rendering reflects the grip.
              const isMirrored = slot === 'off' && !directName && mainIsTwoHanded && mainName;
              const name = directName ?? (isMirrored ? mainName : undefined);
              if (!name) {
                return (
                  <View key={slot} style={styles.slotRow}>
                    <Text style={styles.slotLabel}>{SLOT_LABEL[slot]}</Text>
                    <Text style={styles.slotEmpty}>—</Text>
                  </View>
                );
              }
              // Prefer the equipped INSTANCE so per-instance rolled durability
              // and perks show (mirrored off-hand resolves the main 2H weapon).
              const inst = resolveEquippedItem(player, (isMirrored ? 'main' : slot) as EquipSlot);
              const preview = inst ? getItemPreviewForInstance(inst) : getItemPreview(name);
              // Weapon damage line — for a weapon in hand, show what it actually
              // deals: dice + damage type + the stat it scales off. Resolves the
              // real catalog weapon (mirrored off-hand uses the main 2H weapon).
              const wpn = findWeaponByName(isMirrored ? mainName! : name);
              const damageLine = wpn
                ? `⚔ ${wpn.damageDice} ${wpn.damageType} · scales ${STAT_LABEL[wpn.stat as keyof Stats]}`
                : null;
              return (
                <View key={slot} style={styles.slotRow}>
                  <Text style={styles.slotLabel}>{SLOT_LABEL[slot]}</Text>
                  <View style={styles.slotBody}>
                    <Text style={styles.slotName}>
                      {name}{isMirrored ? '  (two-handed grip)' : ''}
                    </Text>
                    {damageLine && (
                      <Text style={styles.slotDmg}>{damageLine}</Text>
                    )}
                    {preview.stats.length > 0 && (
                      <Text style={styles.slotMeta}>{preview.stats.join(' · ')}</Text>
                    )}
                  </View>
                </View>
              );
            });
          })()}
        </View>
        )}

        {/* ── COMPANION (dog) ───────────────────────────────────── */}
        {/* OTA-120 Phase 5 — Companion panel. Renders only when an
            active dog exists (not abandoned, not dead). Tap the row to
            open the CallDogModal. */}
        {player.dog && player.dog.status !== 'abandoned' && player.dog.status !== 'dead' && (() => {
          const dog = player.dog;
          const sexGlyph = dog.sex.pronoun === 'he' ? '♂' : dog.sex.pronoun === 'she' ? '♀' : '⚥';
          const hpPctDog = dog.hpMax > 0 ? dog.hp / dog.hpMax : 0;
          const loyaltyPct = Math.max(0, Math.min(1, dog.loyalty / 100));
          const hpColorDog = hpPctDog > 0.5 ? '#9ec96a' : hpPctDog > 0.25 ? '#6ab0c9' : '#e07a5f';
          const loyaltyColor = loyaltyPct > 0.5 ? '#9ec96a' : loyaltyPct > 0.3 ? '#6ab0c9' : '#e07a5f';
          const vestName = dog.equipped?.vest;
          // Render stat progress as a fractional 20-segment bar (mirrors player).
          const statProgressBar = (stat: 'strength' | 'dexterity' | 'intelligence') => {
            const pct = Math.max(0, Math.min(1, (dog.statProgress?.[stat] ?? 0) / 100));
            const filled = Math.round(pct * 20);
            return '▰'.repeat(filled) + '▱'.repeat(20 - filled);
          };
          return (
            <>
              {sectionHeader('companion', 'COMPANION')}
              {!collapsed.companion && (
              <TouchableOpacity
                style={styles.card}
                onPress={() => useGameStore.getState().openCallDogModal()}
                activeOpacity={0.8}
              >
                <Text style={styles.name}>
                  {dog.name} <Text style={{ color: '#6ab0c9' }}>{sexGlyph}</Text>
                </Text>
                <Text style={styles.subline}>
                  {dog.breed} · {dog.status === 'waiting_at_base' ? 'waiting at base' : 'with you'}
                </Text>
                <View style={styles.barRow}>
                  <Text style={styles.barLabel}>HP</Text>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${Math.max(0, hpPctDog * 100)}%`, backgroundColor: hpColorDog }]} />
                  </View>
                  <Text style={styles.barValue}>{dog.hp}/{dog.hpMax}</Text>
                </View>
                <View style={styles.barRow}>
                  <Text style={styles.barLabel}>LOY</Text>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${Math.max(0, loyaltyPct * 100)}%`, backgroundColor: loyaltyColor }]} />
                  </View>
                  <Text style={styles.barValue}>{dog.loyalty}/100</Text>
                </View>
                {(['strength', 'dexterity', 'intelligence'] as const).map((stat) => (
                  <View key={stat} style={styles.statRow}>
                    <Text style={styles.statKey}>{stat.slice(0, 3).toUpperCase()}</Text>
                    <View style={styles.statBody}>
                      <Text style={styles.statTotal}>{dog.stats[stat]}</Text>
                      <Text style={styles.progressBar}>
                        {statProgressBar(stat)}  <Text style={styles.progressPct}>{Math.round((dog.statProgress?.[stat] ?? 0))}%</Text>
                      </Text>
                    </View>
                  </View>
                ))}
                <View style={styles.slotRow}>
                  <Text style={styles.slotLabel}>Vest</Text>
                  <View style={styles.slotBody}>
                    <Text style={vestName ? styles.slotName : styles.slotEmpty}>
                      {vestName ?? '—'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.contractTap}>tap to call ›</Text>
              </TouchableOpacity>
              )}
            </>
          );
        })()}

        {/* ── GOLEM ─────────────────────────────────────────────── */}
        {/* OTA-467 — golem panel. Mirrors the dog: HP + trained stats (POWER /
            RESILIENCE), which a kept-alive golem grows through combat. */}
        {player.sidekick && player.sidekick.hp > 0 && (() => {
          const golem = player.sidekick;
          const hpPctG = golem.hpMax > 0 ? golem.hp / golem.hpMax : 0;
          const hpColorG = hpPctG > 0.5 ? '#9ec96a' : hpPctG > 0.25 ? '#6ab0c9' : '#e07a5f';
          const gStats = golem.stats ?? { power: 0, resilience: 0 };
          const gProg = golem.statProgress ?? { power: 0, resilience: 0 };
          const typeLabel = golem.kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          // arb121 — name the EXACT repair parts so "feed it the parts it's made
          // of" is discoverable. A golem heals only from its own fuel items, so a
          // pack full of other aether loot reads as unusable until you know which.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { sidekickRepairParts, SIDEKICK_ELEMENT_TAGS } = require('../engine/sidekicks');
          const repairParts = (sidekickRepairParts(golem.kind) as string[]);
          const elementWord = (SIDEKICK_ELEMENT_TAGS[golem.kind]?.[0] as string | undefined) ?? null;
          const heldRepair = repairParts.filter((p) =>
            player.inventory.some((i) => i.name.toLowerCase() === p.toLowerCase() && i.quantity > 0),
          );
          const gBar = (key: 'power' | 'resilience') => {
            const pct = Math.max(0, Math.min(1, (gProg[key] ?? 0) / 100));
            const filled = Math.round(pct * 20);
            return '▰'.repeat(filled) + '▱'.repeat(20 - filled);
          };
          // engine_Dev — the section label follows the author's summon NOUN
          // (sidekick / automaton / familiar / …), not the hardcoded "GOLEM".
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const summonLabel = (require('../engine/sidekicks') as typeof import('../engine/sidekicks')).getSummonNoun().toUpperCase();
          return (
            <>
              {sectionHeader('golem', summonLabel)}
              {!collapsed.golem && (
              <View style={styles.card}>
                <Text style={styles.name}>{golem.name}</Text>
                <Text style={styles.subline}>{typeLabel} · {golem.attackDie} {golem.damageType}</Text>
                <View style={styles.barRow}>
                  <Text style={styles.barLabel}>HP</Text>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${Math.max(0, hpPctG * 100)}%`, backgroundColor: hpColorG }]} />
                  </View>
                  <Text style={styles.barValue}>{golem.hp}/{golem.hpMax}</Text>
                </View>
                {(['power', 'resilience'] as const).map((key) => (
                  <View key={key} style={styles.statRow}>
                    <Text style={styles.statKey}>{key.slice(0, 3).toUpperCase()}</Text>
                    <View style={styles.statBody}>
                      <Text style={styles.statTotal}>{gStats[key]}</Text>
                      <Text style={styles.progressBar}>
                        {gBar(key)}  <Text style={styles.progressPct}>{Math.round(gProg[key] ?? 0)}%</Text>
                      </Text>
                    </View>
                  </View>
                ))}
                {/* OTA-478 — wielded golem weapon (+ coating, when present). */}
                <View style={styles.slotRow}>
                  <Text style={styles.slotLabel}>Arm</Text>
                  <View style={styles.slotBody}>
                    <Text style={golem.weapon ? styles.slotName : styles.slotEmpty}>
                      {golem.weapon
                        ? `${golem.weapon.coating ? `${golem.weapon.coating.label ?? golem.weapon.coating.kind} ` : ''}${golem.weapon.name}${golem.weapon.durability ? ` (${golem.weapon.durability.current}/${golem.weapon.durability.max})` : ''}`
                        : '—'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.subline}>
                  Heal: feed it {repairParts.join(' or ')}
                  {heldRepair.length > 0
                    ? ` — you're carrying ${heldRepair.join(' & ')}.`
                    : ' — none in your pack right now.'}
                  {elementWord ? ` Any raw ${elementWord} material also mends it — at reduced value, more from higher-grade material.` : ''}
                </Text>
              </View>
              )}
            </>
          );
        })()}

        {/* ── STATUS EFFECTS ────────────────────────────────────── */}
        {(player.statusEffects ?? []).length > 0 && (
          <>
            {sectionHeader('status', 'STATUS EFFECTS')}
            {!collapsed.status && (
            <View style={styles.card}>
              {(player.statusEffects ?? []).map((e, i) => {
                // OTA-357 — (A) "rounds" → "turns": a status duration is just
                // your next N actions, not a tabletop combat round. (B) Tired /
                // Exhausted are stamina-gated (cleared the moment you recover) —
                // their counter is meaningless bookkeeping, so show "until you
                // rest" instead of a fake countdown.
                const stamGated = e.kind === 'tired' || e.kind === 'exhausted';
                return (
                  <View key={i} style={styles.effectRow}>
                    <Text style={styles.effectLabel}>{e.label ?? e.kind}</Text>
                    <Text style={styles.effectMeta}>
                      {stamGated
                        ? 'until you rest'
                        : `${e.remainingRounds} turn${e.remainingRounds === 1 ? '' : 's'} left`}
                    </Text>
                  </View>
                );
              })}
            </View>
            )}
          </>
        )}

        {/* ── RACIAL TRAITS ─────────────────────────────────────── */}
        {race?.traits && race.traits.length > 0 && (
          <>
            {sectionHeader('racial', 'RACIAL TRAITS')}
            {!collapsed.racial && (
            <View style={styles.card}>
              {race.traits.map((t, i) => (
                <Text key={i} style={styles.traitRow}>• {t}</Text>
              ))}
            </View>
            )}
          </>
        )}

        {/* ── ACTIVE CONTRACTS ─────────────────────────────────── */}
        {((player.activeFactionQuestIds?.length ?? 0)
          + (player.activeHunts?.length ?? 0)
          + (player.activeMysteries?.length ?? 0)) > 0 && (
          <>
            {sectionHeader('contracts', 'ACTIVE CONTRACTS')}
            {!collapsed.contracts && (
            <TouchableOpacity style={styles.card} onPress={() => setScreen('contracts')} activeOpacity={0.8}>
              {(player.activeFactionQuestIds ?? []).map((id) => {
                const q = findFactionQuestById(id);
                if (!q) return null;
                const rec = (player.activeFactionQuests ?? []).find((r) => r.id === id);
                return (
                  <Text key={id} style={styles.contractRow}>
                    · {q.title} (stage {(rec?.stage ?? 0) + 1}/{q.stages?.length ?? 1})
                  </Text>
                );
              })}
              {(player.activeHunts ?? []).map((rec) => {
                const h = findHuntById(rec.id);
                if (!h) return null;
                return (
                  <Text key={rec.id} style={styles.contractRow}>
                    · {h.title} (hunt, stage {rec.stage + 1}/{h.stages?.length ?? 1})
                  </Text>
                );
              })}
              {(player.activeMysteries ?? []).map((rec) => {
                const m = findMysteryById(rec.id);
                if (!m) return null;
                return (
                  <Text key={rec.id} style={styles.contractRow}>
                    · {m.title} (mystery, stage {rec.stage + 1}/{m.stages?.length ?? 1})
                  </Text>
                );
              })}
              <Text style={styles.contractTap}>tap to open full contract board ›</Text>
            </TouchableOpacity>
            )}
          </>
        )}

        {/* ── MILESTONES & MEMORY ──────────────────────────────── */}
        {sectionHeader('milestones', 'MILESTONES & MEMORY')}
        {!collapsed.milestones && (
        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Enemies defeated</Text>
            <Text style={styles.kvValue}>{player.milestones?.enemiesDefeated ?? 0}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Travels completed</Text>
            <Text style={styles.kvValue}>{player.milestones?.travelsCompleted ?? 0}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Checks succeeded</Text>
            <Text style={styles.kvValue}>{player.milestones?.checksSucceeded ?? 0}</Text>
          </View>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Locations discovered</Text>
            <Text style={styles.kvValue}>{worldMemory?.discoveredLocationIds?.length ?? 0}</Text>
          </View>
        </View>
        )}

        {/* ── ARBITER TITLES ───────────────────────────────────── */}
        {/* OTA-236 — surfaces the 20 Arbiter-assigned titles. Earned
            titles render with their perk in gold; unearned titles
            render dimmed with the requirement so the player can see
            what's possible. Phase 1: display-only — no auto-unlock
            triggers yet. Future OTAs wire the requirement strings to
            runtime trackers (relic counts, sentinel kills, etc.) and
            populate player.earnedTitles. */}
        {sectionHeader('titles', `${getNarratorName().toUpperCase()} ASSIGNED TITLES`)}
        {!collapsed.titles && (
        <View style={styles.card}>
          {(() => {
            // engine_Dev — IMPORTABLE + CUSTOMIZABLE TITLES. The roster MERGES the 20 built-in
            // earnable titles (exploring/killing/etc., with any author display overrides applied)
            // with the author's added data-driven achievements — so an upload customizes the
            // built-ins instead of hiding them. Earned rows already carry the resolved perk text.
            const allTitles = resolveTitleRoster();
            const earned = new Set(player.earnedTitles ?? []);
            const sorted = [...allTitles].sort((a, b) => {
              const ea = earned.has(a.id) ? 0 : 1;
              const eb = earned.has(b.id) ? 0 : 1;
              if (ea !== eb) return ea - eb;
              return a.title.localeCompare(b.title);
            });
            const earnedCount = earned.size;
            return (
              <>
                <Text style={styles.titlesSummary}>
                  {earnedCount === 0
                    ? `No titles earned yet. The ${getNarratorName()} watches your deeds.`
                    : `${earnedCount} of ${allTitles.length} titles earned.`}
                </Text>
                {sorted.map((t) => {
                  const isEarned = earned.has(t.id);
                  return (
                    <View key={t.id} style={styles.titleRow}>
                      <Text style={[styles.titleName, isEarned ? styles.titleNameEarned : styles.titleNameLocked]}>
                        {isEarned ? '◆ ' : '◇ '}{t.title}
                      </Text>
                      <Text style={isEarned ? styles.titlePerk : styles.titleRequirement}>
                        {isEarned ? t.perk : t.requirement}
                      </Text>
                    </View>
                  );
                })}
              </>
            );
          })()}
        </View>
        )}

        <Text style={styles.footerHint}>Tap the top-left stats panel any time to return here.</Text>
      </ScrollView>
    </View>
  );
}

function StatRow({
  label,
  b,
  progressBar,
  progressPct,
  activities,
}: {
  label: string;
  b: StatBreakdown;
  progressBar: string;
  progressPct: number;
  activities: string[];
}) {
  const hasSources = b.sources.length > 0;
  return (
    <View style={styles.statRow}>
      <Text style={styles.statKey}>{label}</Text>
      <View style={styles.statBody}>
        <Text style={styles.statTotal}>
          {b.total}
          {hasSources && <Text style={styles.statBase}>  (base {b.base})</Text>}
        </Text>
        {/* 2026-05-25 [VIZ-1] — 20-segment fine bar (5% per rune)
            replaces the legacy 4-segment quartile. Player sees
            fine-grained progress toward next stat level. */}
        <Text style={styles.progressBar}>
          {progressBar}  <Text style={styles.progressPct}>{progressPct}%</Text>
        </Text>
        {/* 2026-05-25 [VIZ-1] — activity list per skill. Shows the
            player which game actions train this stat so they don't
            have to guess. */}
        {activities.length > 0 && (
          <Text style={styles.activityList} numberOfLines={3} ellipsizeMode="tail">
            Grows from: {activities.join(' · ')}
          </Text>
        )}
        {hasSources && (
          <View style={styles.chipRow}>
            {b.sources.map((s, i) => (
              <View key={i} style={[styles.chip, s.delta < 0 && styles.chipNeg]}>
                <Text style={[styles.chipText, s.delta < 0 && styles.chipTextNeg]}>
                  {s.delta > 0 ? '+' : ''}{s.delta} {s.label}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 4,
  },
  backBtn: {
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  backText: { color: '#6ab0c9', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#6ab0c9', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  placeholder: { color: '#6ab0c9', textAlign: 'center', marginTop: 80 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  sectionTitle: {
    color: '#6ab0c9',
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  // arb119 — collapsible section header plate (matches the inventory headers):
  // a semi-transparent backing + gold left bar so the label never blends into
  // the page, tappable anywhere to fold the section.
  sectionHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,6,4,0.55)',
    borderLeftWidth: 4,
    borderLeftColor: '#6ab0c9',
    borderRadius: 3,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 6,
  },
  sectionChevron: { color: '#6ab0c9', fontSize: 11, fontWeight: '900', marginRight: 7, width: 11, textAlign: 'center' },
  sectionHeaderLabel: { color: '#6ab0c9', fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  card: {
    backgroundColor: '#0e1618',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
  },

  name: { color: '#d6e4e8', fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  subline: { color: '#6ab0c9', fontSize: 12, letterSpacing: 1, marginTop: 2, marginBottom: 10 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  barLabel: { color: '#6ab0c9', fontSize: 10, letterSpacing: 1, width: 30 },
  barBg: { flex: 1, height: 8, backgroundColor: '#131c1f', borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  barFill: { height: '100%' },
  barValue: { color: '#bcd2db', fontSize: 11, width: 64, textAlign: 'right' },

  statRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomColor: '#1f1c18', borderBottomWidth: 1 },
  statKey: { color: '#6ab0c9', fontSize: 12, fontWeight: '700', letterSpacing: 1, width: 44, paddingTop: 2 },
  statBody: { flex: 1 },
  statTotal: { color: '#d6e4e8', fontSize: 14, fontWeight: '700' },
  statBase: { color: '#6ab0c9', fontSize: 11, fontWeight: '400' },
  progressBar: { color: '#9ec96a', fontSize: 10, letterSpacing: 1, marginTop: 3 },
  progressPct: { color: '#6ab0c9', fontSize: 9, letterSpacing: 0.5 },
  activityList: { color: '#6ab0c9', fontSize: 9, marginTop: 2, lineHeight: 13, letterSpacing: 0.3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chip: { backgroundColor: '#131c1f', borderColor: '#2b3a3e', borderWidth: 1, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  chipNeg: { borderColor: '#7a4040', backgroundColor: '#221512' },
  chipText: { color: '#9ec96a', fontSize: 10, letterSpacing: 0.5 },
  chipTextNeg: { color: '#e07a5f' },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 4 },
  kvKey: { color: '#6ab0c9', fontSize: 12, letterSpacing: 1 },
  factionOwn: { color: '#bcd2db', fontWeight: '700' },
  kvValue: { color: '#d6e4e8', fontSize: 14, fontWeight: '700' },
  kvSub: { color: '#6ab0c9', fontSize: 10, fontStyle: 'italic', marginTop: -2, marginBottom: 4 },
  warning: { color: '#6ab0c9' },
  danger: { color: '#e07a5f' },

  slotRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomColor: '#1f1c18', borderBottomWidth: 1 },
  slotLabel: { color: '#6ab0c9', fontSize: 10, letterSpacing: 1, width: 80, paddingTop: 2 },
  slotBody: { flex: 1 },
  slotEmpty: { color: '#2b3a3e', fontSize: 12 },
  slotName: { color: '#d6e4e8', fontSize: 13, fontWeight: '700' },
  slotDmg: { color: '#e0a35f', fontSize: 10, marginTop: 2 },
  slotMeta: { color: '#9ec96a', fontSize: 10, marginTop: 2 },

  effectRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  effectLabel: { color: '#d6e4e8', fontSize: 12 },
  effectMeta: { color: '#6ab0c9', fontSize: 10, letterSpacing: 0.5 },

  traitRow: { color: '#bcd2db', fontSize: 12, lineHeight: 17, marginBottom: 4 },

  contractRow: { color: '#bcd2db', fontSize: 12, lineHeight: 17, marginBottom: 2 },
  contractTap: { color: '#6ab0c9', fontSize: 10, letterSpacing: 1, marginTop: 6, fontStyle: 'italic', textAlign: 'right' },

  footerHint: { color: '#6ab0c9', fontSize: 10, fontStyle: 'italic', textAlign: 'center', marginTop: 18 },
  // OTA-236 — Arbiter Titles section.
  titlesSummary: { color: '#6ab0c9', fontSize: 11, fontStyle: 'italic', marginBottom: 8 },
  titleRow: { marginBottom: 8 },
  titleName: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 2 },
  titleNameEarned: { color: '#6ab0c9' },
  titleNameLocked: { color: '#6ab0c9' },
  titlePerk: { color: '#bcd2db', fontSize: 11, lineHeight: 15, marginLeft: 14 },
  titleRequirement: { color: '#6ab0c9', fontSize: 11, lineHeight: 15, marginLeft: 14, fontStyle: 'italic' },
});
