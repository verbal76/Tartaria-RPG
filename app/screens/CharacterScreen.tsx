// OTA 040 — Player Sheet screen. Reached by tapping the top-left
// stats panel in the exploration HUD. Read-only — equip / unequip /
// use actions live on the inventory screen. This sheet's job is to
// show *what you are right now*, with every number broken down into
// its sources so the player can audit any surprising value.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
// ⚠ OTA-1404 — combat resolution moved out of gameStore into its own leaf.
import { effectiveACBreakdown, playerArmorResistKinds, dogVestAcBonus } from '../state/combatResolution';
import { FirstTimeHint } from '../components/FirstTimeHint';
// OTA-1434 — who you are, at the top of the sheet.
import { CharacterPortrait } from '../components/CharacterPortrait';
// OTA-1444 — the one-time veteran ♂/♀ ask, raised here because this sheet is
// where the incomplete banner would show.
import { SexPickerModal } from '../components/SexPickerModal';
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';
import { JOIN_THRESHOLD, BUY_REP_TC_PER_STANDING } from '../engine/factions';
// OTA-1341 — the standing ladder: tier names + thresholds shown here are the SAME
// symbols the vendor counter prices by, so the sheet can never drift from the rule.
import { standingTierLabel, STANDING_KNOWN, STANDING_TRUSTED, STANDING_HONORED } from '../engine/factionRapport';
import type { Faction, Race, PlayerCharacter, Stats } from '../engine/types';
import { effectiveStatsBreakdown, resolveEquippedItem, type StatBreakdown } from '../engine/equipment';
// OTA-1650 — companion gear, read off the one module that knows where it lives.
import { dogVestInstance, durabilityLabel, gearCondition, conditionColor } from '../engine/companionGear';
import { RING_SLOTS } from '../engine/equipment';   // OTA-1652 — all four fingers on the sheet
// OTA-1066 — Phase 4 difficulty, and the only place it can be eased.
import {
  PRESET_TIERS, PRESSURE_PROFILES, pressureOf, canChangeTo,
  // ⚠ OTA-1158 — the REAL hunting line, not a copy of it. This screen has form
  // for hardcoding a threshold next to a comment citing the constant (see the
  // OTA-1156 note below); the whole point of the new warning is that it agrees
  // with the code that acts on it.
  HOSTILE_STANDING,
} from '../engine/pressure';
// OTA-1067 — Phase 5: where the Arbiter stands, and what he thinks of you.
// OTA-1448 — the sheet draws BOTH ladders in full, so it needs the orders, the
// labels and the thresholds. All read from the engine, never copied: the rung
// the player sees and the rule the engine applies are the same symbols.
import {
  arbiterSheetLines,
  STANCE_ORDER, STANCE_MIN_CORES, STANCE_LABEL,
  REGARD_ORDER, REGARD_BAND_FLOOR, REGARD_LABEL, REGARD_MIN,
} from '../engine/arbiterPersona';
import { hpBreakdown, hpBreakdownLine } from '../engine/hpBreakdown';
import { giftLedger, giftLedgerLine } from '../engine/giftLedger';
import { wrongsLedger, AMENDS_TC_PER_WRONG } from '../engine/npcMemory'; // OTA-1683 — the wrongs row opens
import type { EquipSlot } from '../engine/types';
import { fineProgressBar, rawProgressPercent, SKILL_ACTIVITIES } from '../engine/statTraining';
import { barehandDamageFor } from '../engine/raceMechanics';
import { corruptionTierOf, tierLabel, tierDescription } from '../engine/corruption';
import { buildChronicle } from '../engine/chronicle';
import { tideLabel } from '../engine/worldPulse';
import { decayedMenace, menaceTier } from '../engine/menace';
import arbiterTitlesData from '../data/lore/arbiter-titles.json';
import { TITLE_PASSIVE_PERK, describeTitleEarned, isHiddenTitle } from '../engine/titles';
import { greatClimbLoreDiscovered } from '../engine/greatClimbs';
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
  // ⚠⚠ OTA-1652 — ALL FOUR FINGERS. This map listed ONE ring, so a player
  // wearing four saw one on their own character sheet — OTA-1648 opened the
  // other three slots and this screen was never told. Built from RING_SLOTS
  // rather than typed out, which is the OTA-1648 rule: a fifth ring is one edit
  // and no reader can fall behind the type again.
  ...Object.fromEntries(RING_SLOTS.map((slot, i) => [slot, i === 0 ? 'Ring' : `Ring ${i + 1}`])),
};

export function CharacterScreen() {
  const player = useGameStore((s) => s.player);
  const scene = useGameStore((s) => s.currentScene);
  const worldMemory = useGameStore((s) => s.worldMemory);
  const setScreen = useGameStore((s) => s.setScreen);
  const replayStoryIntro = useGameStore((s) => s.replayStoryIntro); // OTA-1023
  // arb119 — per-section collapse (hook must precede the early return below).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // OTA-848 — tap-to-expand: the AC breakdown, and which title's provenance is open.
  const [openTitle, setOpenTitle] = useState<string | null>(null);
  // ⚠⚠ OTA-1716 — ONE OPEN SET FOR THE WHOLE "WHAT MOVED IT" LIST. This was two
  // hand-rolled booleans, one per row that happened to own a ledger (gifts,
  // OTA-1161; wrongs, OTA-1683), which is why every OTHER row was flat: making a
  // row tappable meant adding another piece of state and another branch, so it
  // only ever happened when the owner reported the row he had just tapped.
  // Keyed by row index, so a row is tappable because it EXISTS, not because
  // somebody remembered it. Several can be open at once, as before.
  const [openParts, setOpenParts] = useState<Record<number, boolean>>({});
  const togglePart = (i: number) => setOpenParts((m) => ({ ...m, [i]: !m[i] }));

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No character loaded.</Text>
      </View>
    );
  }

  const race = (racesData as Race[]).find((r) => r.id === player.raceId);
  const faction = (factionsData as Faction[]).find((f) => f.id === player.factionId);
  const factionStanding = player.factionStanding.find((f) => f.factionId === player.factionId)?.standing ?? 0;
  const hpPct = player.hpMax > 0 ? player.hp / player.hpMax : 0;
  const stamPct = player.staminaMax > 0 ? player.stamina / player.staminaMax : 0;
  const hpColor = hpPct > 0.5 ? '#9ec96a' : hpPct > 0.25 ? '#c9a86a' : '#e07a5f';
  const stamColor = stamPct > 0.4 ? '#9ec96a' : '#c9a86a';

  const breakdown = effectiveStatsBreakdown(player, weatherStatModifiers(scene?.weather ?? null, playerArmorResistKinds(player)));
  // OTA-836 — full AC breakdown (base + armor + title + stance), matching what
  // the combat resolver actually stands on (the old sheet showed only race base +
  // context, dropping equipped armor). The DEFENSE card renders acBd.total + chips.
  const acBd = effectiveACBreakdown(player, scene ?? null);
  const barehand = barehandDamageFor(player.raceId);
  const barehandStr = barehand.bonus === 0
    ? `${barehand.count}d${barehand.sides}`
    : `${barehand.count}d${barehand.sides}${barehand.bonus > 0 ? '+' : ''}${barehand.bonus}`;
  const tier = corruptionTierOf(player.corruption ?? 0);
  // ⚠ OTA-1448 — corruption's meter, beside HP and STA. The scale is the
  // HOLLOWED floor (61) rather than an invented 100: corruption is uncapped, so
  // "full" has to mean "the worst tier has been reached", and the fill clamps.
  // Colour climbs with the tier so the bar reads before the label does.
  const corrPct = (player.corruption ?? 0) / 61;
  const corrColor = tier === 'hollowed' ? '#e07a5f'
    : tier === 'corrupted' ? '#d08a4a'
    : tier === 'tainted' ? '#c9a86a'
    : '#7a8a5a';

  // OTA-1067 [Phase 5] — where the Arbiter stands in the arc, what he thinks
  // of this character, and the itemised reasons for it.
  const arbiter = arbiterSheetLines(player, worldMemory);
  // OTA-1161 — the two read models this sheet gained: where hpMax came from, and
  // what was given to whom. Both derive from state already saved; neither writes.
  const hpParts = hpBreakdown(player, worldMemory);
  const ledger = giftLedger(worldMemory);
  const wrongs = wrongsLedger(worldMemory); // OTA-1683

  // OTA-843 [Chronicle] — assemble the character's legend from accreted state
  // (memorable beats + milestones + titles + corruption + main-quest progress).
  const chronicle = buildChronicle(player, worldMemory?.memorableEvents, {
    raceName: race?.name,
    factionName: faction?.name,
    distinctFoes: new Set(worldMemory?.defeatedEnemies ?? []).size,
    coresRecovered: player.mainQuest?.coresRecovered?.length ?? 0,
    coresTotal: player.mainQuest ? 9 : 0,
  });

  // arb119 — section header helper, mirroring the inventory headers: each section
  // title is a tappable plate (semi-transparent backing so the gold label reads
  // over any background) with a ▸/▾ chevron that folds the section away.
  //
  // ⚠⚠ OTA-1456 — THE CHEVRON DESCRIBES STATE, NOT THE TAP. This read
  // `collapsed ? '▾' : '▴'` — chevron-as-affordance, "tap to open downward" —
  // while the stat rows nine hundred lines below read `expanded ? '▾' : '▸'`,
  // chevron-as-state. Both conventions are defensible; running BOTH is not,
  // because it makes `▾` mean COLLAPSED in one half of this screen and EXPANDED
  // in the other. State won because it was already the majority here and in
  // AboutScreen, and because it is the one a player can read without having
  // tapped anything first.
  const setPressure = useGameStore((st) => st.setPressure); // OTA-1066

  const sectionHeader = (key: string, label: string) => (
    <TouchableOpacity
      style={styles.sectionHeaderBar}
      activeOpacity={0.7}
      onPress={() => setCollapsed((s) => ({ ...s, [key]: !s[key] }))}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed[key] }}
    >
      <Text style={styles.sectionChevron}>{collapsed[key] ? '▸' : '▾'}</Text>
      <Text style={styles.sectionHeaderLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FirstTimeHint
        id="character_first_open"
        title="Your character"
        body="Tap any stat or number to see exactly what feeds it. Scroll down for your Chronicle — the legend of what you've done."
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">CHARACTER</Text>
        {/* OTA-1023 — REPLAY OPENING lives here now (owner's placement:
            "across the top is back, character, and then replay opening").
            The crawl overlay mounts globally, so it plays right over this
            screen — no navigation needed. */}
        <TouchableOpacity
          onPress={() => replayStoryIntro()}
          style={styles.replayBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Replay the opening crawl"
        >
          <Text style={styles.replayText}>REPLAY{'\n'}OPENING</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ⚠ OTA-1434 — THE PORTRAIT, FIRST THING. Owner: *"at the very top
            should be the portrait of your character with their faction icon
            shrunken down and put in the top left corner as an overlay."*
            Above the header card, inside the scroll rather than pinned, so it
            scrolls away and hands the screen back to the numbers — this sheet's
            job is auditing values, and a permanent banner would cost a fifth of
            every screenful of them. */}
        <CharacterPortrait
          raceId={player.raceId}
          factionId={player.factionId}
          raceName={race?.name}
          factionName={faction?.name}
          motiveId={player.storyMotive}
          characterName={player.name}
          sex={player.sex}
        />
        {/* ⚠ OTA-1444 — a save from before the ♂/♀ pick gets asked HERE, once,
            the first time it opens the sheet the sign would be missing from.
            The modal renders null for every character whose sex is recorded. */}
        <SexPickerModal />
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
          {/* ⚠ OTA-1161 — WHERE THE MAX CAME FROM. Owner: "for AC it shows your base
              and your buffs. HP just says HP not what my base number was so I can see
              the progression, I didn't roll a 29 at start." hpMax is a BAKED total —
              creation roll + distinct-kill milestones + gear — and nothing recorded
              which was which. The base is recovered by subtraction (see
              engine/hpBreakdown), so this needs no new save field and works on every
              existing character. */}
          {hpParts && (
            <Text style={styles.hpBreakdown}>
              {hpBreakdownLine(hpParts)}
              {hpParts.distinctKills > 0
                ? `  ·  ${hpParts.distinctKills} kinds beaten, ${hpParts.toNextMilestone} to the next +1`
                : ''}
            </Text>
          )}
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>STA</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.max(0, stamPct * 100)}%`, backgroundColor: stamColor }]} />
            </View>
            <Text style={styles.barValue}>{player.stamina}/{player.staminaMax}</Text>
          </View>
          {/* ⚠⚠ OTA-1448 — CORRUPTION BELONGS WITH THE BODY, NOT THE PURSE.
              Owner: *"corruption should be in the same section as hp and stamina
              under your image, not listed with your wallet."* He is right about
              the category error: TC is what you HAVE, corruption is what is
              happening TO you — it subtracts from every stat, raises every
              vendor's price, and pulls extra encounters. Filed under WALLET it
              read as an accounting line; here it reads as a condition, beside
              the other two meters that decide whether you live.
              ⚠ Drawn as a bar for the same reason: a number among bars reads as
              a footnote. The scale tops out at the HOLLOWED floor, so a full bar
              means the worst tier has been reached rather than some invented
              ceiling — corruption itself is uncapped. */}
          <View style={styles.barRow}>
            <Text style={styles.barLabel}>COR</Text>
            <View style={styles.barBg}>
              <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, corrPct * 100))}%`, backgroundColor: corrColor }]} />
            </View>
            <Text style={styles.barValue}>{player.corruption ?? 0} · {tierLabel(tier)}</Text>
          </View>
          <Text style={styles.kvSub}>↳ {tierDescription(tier)}</Text>
        </View>

        {/* ── HOW MUCH IT TAKES ─────────────────────────────────── */}
        {/* OTA-1066 — PHASE 4's toggle, after creation. It lives on the sheet
            rather than a settings menu because it is a fact about this
            character, like their race — and the plan's warning that overtuned
            pressure is the likeliest way to make the game worse is exactly why
            the escape hatch has to be somewhere a struggling player will find
            it. ⚠ LOWER ONLY: higher tiers render as plain text, not buttons,
            so the rule is visible rather than enforced by a refusal. */}
        {sectionHeader('pressure', 'HOW MUCH IT TAKES')}
        {!collapsed.pressure && (
        <View style={styles.card}>
          {PRESET_TIERS.map((id) => {
            const prof = PRESSURE_PROFILES[id];
            const current = pressureOf(player) === id;
            const lowerable = !current && canChangeTo(pressureOf(player), id);
            return (
              <TouchableOpacity
                key={id}
                style={[styles.kvRow, { flexDirection: 'column', alignItems: 'flex-start', opacity: current || lowerable ? 1 : 0.35 }]}
                onPress={lowerable ? () => setPressure(id) : undefined}
                disabled={!lowerable}
                activeOpacity={0.7}
                accessibilityRole={lowerable ? 'button' : 'text'}
                accessibilityState={{ selected: current, disabled: !lowerable }}
                accessibilityLabel={`${prof.label} ${prof.subtitle}${current ? '. Current.' : lowerable ? '. Tap to ease to this.' : '. Cannot be raised.'}`}
              >
                <Text style={styles.kvKey}>{current ? '▸ ' : ''}{prof.label}</Text>
                <Text style={styles.kvValue}>{prof.subtitle}</Text>
              </TouchableOpacity>
            );
          })}
          <Text style={styles.kvValue}>
            You can ease what the mud takes at any time. You can never raise it again.
          </Text>
        </View>
        )}

        {/* ── THE ARBITER ───────────────────────────────────────── */}
        {/* ⚠ OTA-1067 — PHASE 5. Where he stands in the arc, what he currently
            thinks of you, and the ITEMISED WHY.
            A hidden opinion score is the same legibility failure the Phase 4
            tide lines were written to close: the game quietly decides something
            about the player and never says what moved it, so the character just
            starts feeling differently-written for no reason they can name.
            Every contribution regardScore() sums is listed here, signed, in the
            same words the engine used. */}
        {arbiter && (
          <>
            {sectionHeader('arbiter', 'THE ARBITER')}
            {!collapsed.arbiter && (
            <View style={styles.card}>
              {/* ⚠⚠ OTA-1448 — TWO LADDERS, DRAWN IN FULL. Owner: *"I have no
                  idea what the text in there means... maybe post all the
                  outcomes that are possible and gray them all out except what
                  level you are at so we can see progression."*

                  The sheet used to print exactly two sentences — his stance and
                  his regard — with nothing to say they were RUNGS on anything.
                  A line that quietly changes between sessions then reads as the
                  writing wandering, not as something the player earned. Same
                  fix the difficulty section already uses: show every rung, mark
                  the one you are on, dim the rest. */}
              <Text style={styles.ladderTitle}>WHERE HE STANDS</Text>
              <Text style={styles.ladderNote}>
                Rises with Cores recovered — {arbiter.cores} of 9. It only ever goes up.
              </Text>
              {STANCE_ORDER.map((id) => {
                const here = id === arbiter.stanceId;
                const need = STANCE_MIN_CORES[id];
                return (
                  <View key={id} style={[styles.ladderRow, !here && styles.ladderRowDim]}>
                    <Text style={[styles.ladderMark, here && styles.ladderMarkOn]}>{here ? '▸' : ' '}</Text>
                    <Text style={[styles.ladderText, here && styles.ladderTextOn]}>
                      {STANCE_LABEL[id]}
                    </Text>
                    <Text style={[styles.ladderReq, here && styles.ladderReqOn]}>
                      {need === 0 ? 'start' : `${need} Core${need === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                );
              })}

              {/* ⚠ The second ladder moves BOTH ways, and saying so is the point:
                  stance is a road, regard is a verdict you can climb back from.
                  The floors come from REGARD_BAND_FLOOR — the same symbols
                  regardBandOf compares against, never a copy of them. */}
              <Text style={[styles.ladderTitle, { marginTop: 14 }]}>WHAT HE THINKS OF YOU</Text>
              <Text style={styles.ladderNote}>
                Earned by conduct, and it moves both ways — you are at {arbiter.score >= 0 ? '+' : ''}{arbiter.score}.
              </Text>
              {REGARD_ORDER.map((id) => {
                const here = id === arbiter.bandId;
                const floor = REGARD_BAND_FLOOR[id];
                return (
                  <View key={id} style={[styles.ladderRow, !here && styles.ladderRowDim]}>
                    <Text style={[styles.ladderMark, here && styles.ladderMarkOn]}>{here ? '▸' : ' '}</Text>
                    <Text style={[styles.ladderText, here && styles.ladderTextOn]}>
                      {REGARD_LABEL[id]}
                    </Text>
                    <Text style={[styles.ladderReq, here && styles.ladderReqOn]}>
                      {floor <= REGARD_MIN ? 'lowest' : `${floor >= 0 ? '+' : ''}${floor}`}
                    </Text>
                  </View>
                );
              })}
              {arbiter.parts.length > 0 && (
                <Text style={[styles.ladderTitle, { marginTop: 14 }]}>WHAT MOVED IT</Text>
              )}
              {arbiter.parts.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  {arbiter.parts.map((part, i) => {
                    // ⚠⚠⚠ OTA-1716 — EVERY ROW DRILLS. Owner: *"everything listed
                    // in it should be able to be tapped on to see what it is. as
                    // of now, only wrongs and gifts do."* Those two drilled
                    // because they owned a ledger; the rest were flat because
                    // nobody had written one. `regardParts` now ships a `detail`
                    // with every number it produces, built from the same values,
                    // so the drill-down cannot drift from the arithmetic.
                    const open = openParts[i] ?? false;
                    const row = (
                      <View style={styles.kvRow}>
                        <Text style={styles.kvValue}>
                          {part.label}
                          {/* ⚠ OTA-1161 — the affordance. A tappable row that looks
                              identical to a flat one is a feature nobody finds. */}
                          {/* ⚠ OTA-1456 — was `›`, a THIRD pair on this screen. Same
                              vocabulary as everything else now: ▸ closed, ▾ open. */}
                          <Text style={styles.tapHint}>{open ? '  ▾' : '  ▸'}</Text>
                        </Text>
                        <Text style={[styles.kvValue, { color: part.value >= 0 ? '#7a8a5a' : '#a85a3a' }]}>
                          {part.value >= 0 ? '+' : ''}{part.value}
                        </Text>
                      </View>
                    );
                    if (part.kind === 'wrongs') {
                      return (
                        <View key={i}>
                          <TouchableOpacity activeOpacity={0.7} onPress={() => togglePart(i)} accessibilityRole="button"
                            accessibilityLabel={`${part.label}, ${part.value >= 0 ? '+' : ''}${part.value}. Tap to see what it is.`}>
                            {row}
                          </TouchableOpacity>
                          {open && (
                            <View style={styles.giftLedger}>
                              {wrongs.length === 0
                                ? <Text style={styles.kvSub}>Nothing recorded yet.</Text>
                                : wrongs.map((e, j) => (
                                  <View key={j} style={styles.giftRow}>
                                    <Text style={styles.giftLine}>
                                      {e.name}{e.role ? ` (${e.role})` : ''} — {e.outstanding} wrong{e.outstanding === 1 ? '' : 's'}
                                    </Text>
                                    <Text style={styles.giftMeta}>
                                      spend {e.owed} TC at their counter to clear the next
                                      {e.banked > 0 ? ` · ${e.banked} TC already toward it` : ''}
                                    </Text>
                                  </View>
                                ))}
                              {/* The rule, in one line, so the number above is a
                                  debt the player can plan against rather than a
                                  verdict: recordNpcDealing's amends bank, read back. */}
                              <Text style={styles.kvSub}>
                                Buying from someone you wronged pays it down — {AMENDS_TC_PER_WRONG} TC per wrong, and the price climbs with each wrong still standing with them. Robbing them again forfeits what you had paid.
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    }
                    // ⚠ Every OTHER row: its own `detail`, in the same drawer
                    // the two ledgers use, so the whole list reads as one
                    // affordance rather than two special cases and a wall of
                    // flat text. A row with no detail at all still opens and
                    // says so — silence on tap is the defect being fixed.
                    if (part.kind !== 'gifts') {
                      return (
                        <View key={i}>
                          <TouchableOpacity activeOpacity={0.7} onPress={() => togglePart(i)} accessibilityRole="button"
                            accessibilityLabel={`${part.label}, ${part.value >= 0 ? '+' : ''}${part.value}. Tap to see what it is.`}>
                            {row}
                          </TouchableOpacity>
                          {open && (
                            <View style={styles.giftLedger}>
                              {(part.detail ?? []).length === 0
                                ? <Text style={styles.kvSub}>He has not said more than this.</Text>
                                : part.detail!.map((line, j) => (
                                  <Text key={j} style={j === part.detail!.length - 1 ? styles.giftMeta : styles.giftLine}>{line}</Text>
                                ))}
                            </View>
                          )}
                        </View>
                      );
                    }
                    return (
                      <View key={i}>
                        <TouchableOpacity activeOpacity={0.7} onPress={() => togglePart(i)} accessibilityRole="button"
                            accessibilityLabel={`${part.label}, ${part.value >= 0 ? '+' : ''}${part.value}. Tap to see what it is.`}>
                          {row}
                        </TouchableOpacity>
                        {open && (
                          <View style={styles.giftLedger}>
                            {ledger.length === 0
                              ? <Text style={styles.kvSub}>Nothing recorded yet.</Text>
                              : ledger.map((e, j) => (
                                <View key={j} style={styles.giftRow}>
                                  <Text style={styles.giftLine}>{giftLedgerLine(e)}</Text>
                                  <Text style={styles.giftMeta}>
                                    day {e.day}
                                    {/* ⚠ Only shown when it was actually recorded — a
                                        gift given before OTA-1161 has no reaction on
                                        file, and inventing one would be worse than a
                                        blank: OTA-1153 rewrote the taste table under
                                        those older entries. */}
                                    {e.standingDelta ? ` · standing ${e.standingDelta > 0 ? '+' : ''}${e.standingDelta}` : ''}
                                    {!e.reaction ? ' · reaction not recorded' : ''}
                                  </Text>
                                </View>
                              ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            )}
          </>
        )}

        {/* ── CHRONICLE ─────────────────────────────────────────── */}
        {/* OTA-843 — the character's legend: a headline, a short deed-list, and the
            memorable beats as a timeline. Collapsed by default so it doesn't push the
            stats down; tap to unfurl the story. */}
        {sectionHeader('chronicle', 'CHRONICLE')}
        {!collapsed.chronicle && (
        <View style={styles.card}>
          <Text style={styles.chronicleTitle}>{chronicle.title}</Text>
          <Text style={styles.chronicleHeadline}>{chronicle.headline}</Text>
          {chronicle.deeds.map((d, i) => (
            <Text key={i} style={styles.chronicleDeed}>· {d}</Text>
          ))}
          {chronicle.entries.length > 0 ? (
            <View style={styles.chronicleTimeline}>
              {chronicle.entries.map((e, i) => (
                <View key={i} style={styles.chronicleRow}>
                  <Text style={styles.chronicleGlyph}>{e.glyph}</Text>
                  <Text style={styles.chronicleEntryText}>{e.text}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.chronicleEmpty}>Your legend is unwritten. Go and make it.</Text>
          )}
        </View>
        )}

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
          {/* OTA-848 — a readable, line-per-source breakdown of exactly what
              builds the number (base + each armor piece / stance / title /
              racial). OTA-836 first surfaced these as chips.
              ⚠⚠ OTA-1448 — AND IT IS NO LONGER BEHIND A TAP. Owner: *"in the
              defense category it should always show what makes up your AC, you
              shouldn't have to tap to see it."* The tap was added to keep the
              card tidy, which traded the one number players most often want to
              audit for a row of whitespace. AC is the number that decides
              whether a hit lands; a breakdown nobody opens is a breakdown that
              may as well not exist. Always open, no state, no affordance to
              miss. */}
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>Armor Class</Text>
            <Text style={styles.kvValue}>
              {acBd.total}
              {acBd.sources.length > 0 && <Text style={styles.statBase}>  (base {acBd.base})</Text>}
            </Text>
          </View>
          {acBd.sources.length > 0 && (
            <View style={styles.breakdownList}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownDelta}>{acBd.base}</Text>
                <Text style={styles.breakdownLabel}>base (10 + racial floor)</Text>
              </View>
              {acBd.sources.map((s, i) => (
                <View key={i} style={styles.breakdownRow}>
                  <Text style={[styles.breakdownDelta, s.delta < 0 && styles.breakdownDeltaNeg]}>
                    {s.delta > 0 ? '+' : ''}{s.delta}
                  </Text>
                  <Text style={styles.breakdownLabel}>{s.label}</Text>
                </View>
              ))}
              <View style={[styles.breakdownRow, styles.breakdownTotalRow]}>
                <Text style={styles.breakdownTotalDelta}>{acBd.total}</Text>
                <Text style={styles.breakdownTotalLabel}>total Armor Class</Text>
              </View>
            </View>
          )}
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

        {/* ── WALLET & REPUTATION ───────────────────────────────── */}
        {/* ⚠ OTA-1448 — was "WALLET & CONDITION". The condition half (corruption)
            moved to the header card beside HP and STA, which leaves coin and the
            reputation for violence — so the header says what the card holds. */}
        {sectionHeader('wallet', 'WALLET & REPUTATION')}
        {!collapsed.wallet && (
        <View style={styles.card}>
          <View style={styles.kvRow}>
            <Text style={styles.kvKey}>TC</Text>
            <Text style={styles.kvValue}>{player.tc}</Text>
          </View>
          {/* ⚠ OTA-1448 — CORRUPTION MOVED OUT of this card, up to the header
              beside HP and STA. It is a condition, not an asset; filing it next
              to TC made it read as bookkeeping. Menace stays: it IS a fact about
              your standing in the world rather than your body. */}
          {/* OTA-808 — MENACE: your reputation for ruling by fear. Shown once you've
              built any (intimidation raises it), so it doesn't clutter a peaceful
              run. Higher menace stiffens your own intimidate checks and draws
              readier encounters; it fades if you stop. */}
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
            threshold is JOIN_THRESHOLD (engine/factions.ts) — read, not
            copied, since OTA-1156; shows a checkmark on factions the
            player qualifies to join.
            Each faction's standing gates quest / hunt / mystery /
            storyline visibility via minRep; high standing means more
            contracts surface from that faction's vendors.
            ⚠ OTA-1158 — and it runs the OTHER way too, which this panel
            never said. Below 0 a faction's patrols engage; at
            HOSTILE_STANDING they hunt you on their ground. That end now
            gets a ☠/⚠ tag per row and a warning line under the list,
            both off the real constants. */}
        {sectionHeader('factions', 'FACTION STANDINGS')}
        {!collapsed.factions && (
        <View style={styles.card}>
          {(() => {
            const factionsList = factionsData as Faction[];
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
              // OTA-1156 — the constant, not a copy of it. The comment above this
              // block already cited "per JOIN_THRESHOLD in engine/factions.ts" while
              // hardcoding 20 twice, so the ✓ and the colour could disagree with the
              // rule they claim to show if the threshold ever moved.
              const qualifies = standing >= JOIN_THRESHOLD;
              const isOwn = row.factionId === player.factionId;
              // ⚠ OTA-1158 — THE DANGEROUS END OF THIS NUMBER GETS A WORD, NOT JUST A
              // COLOUR. The sheet has always marked the good end (✓ at JOIN_THRESHOLD)
              // and left the bad end to a shade of orange nothing explains. Standing at
              // or below HOSTILE_STANDING is the single most consequential state in the
              // system — those patrols stop passing you by and start hunting you on
              // their ground — and NOTHING anywhere in the game said so. Two marks, both
              // read off the real constants: 'hunted' once you are past the line, and
              // 'close' inside the last 10 before it, which is the warning that is
              // actually worth having, since one contract for their rival moves you 4.
              const hunted = standing <= HOSTILE_STANDING;
              const nearHunted = !hunted && standing <= HOSTILE_STANDING + 10;
              const color = standing >= JOIN_THRESHOLD ? '#9ec96a'
                : standing >= 0 ? '#cdbf99'
                : standing >= -10 ? '#c9a86a'
                : '#e07a5f';
              // OTA-844 [world pulse] — the world moves on its own; show whether this
              // faction is rising or waning in the balance of power right now.
              const tide = tideLabel(worldMemory?.factionTides?.[row.factionId]);
              return (
                <View key={row.factionId} style={styles.kvRow}>
                  <Text style={[styles.kvKey, isOwn && styles.factionOwn]}>
                    {meta!.name}{isOwn ? ' (sworn)' : ''}
                    {tide ? <Text style={tide.word === 'rising' || tide.word === 'ascendant' ? styles.tideRising : styles.tideWaning}>{`  ${tide.glyph} ${tide.word}`}</Text> : null}
                  </Text>
                  <Text style={[styles.kvValue, { color }]}>
                    {/* OTA-1341 — the ladder tier, named. A number alone never told the
                        player it DOES something; the word is the same one the vendor
                        counter prices by (factionRapport.standingTierLabel). */}
                    {standingTierLabel(standing) !== 'Neutral' ? `${standingTierLabel(standing)} · ` : ''}
                    {standing >= 0 ? '+' : ''}{standing}{qualifies && !isOwn ? ' ✓' : ''}
                    {hunted ? <Text style={styles.huntedTag}>{'  ☠ hunted'}</Text> : null}
                    {nearHunted ? <Text style={styles.nearHuntedTag}>{'  ⚠ close'}</Text> : null}
                  </Text>
                </View>
              );
            });
          })()}
          <Text style={styles.kvSub}>
            ↳ Standing rises with trades ({BUY_REP_TC_PER_STANDING} TC spent is worth 1), gifts, and finished
            contracts; falls with theft, killing faction members, and work done for their rivals —
            every point you earn with one faction costs their enemies half as much the other way.
            +{JOIN_THRESHOLD} unlocks joining, and high standing surfaces more of their contracts
            (hunts, mysteries, storylines) when you meet their vendors.
            {' '}Their counters price by the ladder: Known (+{STANDING_KNOWN}) takes 5% off,
            Trusted (+{STANDING_TRUSTED}) takes 10% and vouches for you like the rapport quest,
            Honored (+{STANDING_HONORED}) takes 15% — while Hostile and Hated pay MORE at the
            same counters.
          </Text>
          {/* ⚠ OTA-1158 — SEPARATE LINE, AND IT IS THE ONE THAT MATTERS. The rule
              nothing in the game stated: standing is not only an unlock ladder, it is
              a threat gauge. Kept out of the paragraph above so it cannot be skimmed
              past, and it names both thresholds because they are DIFFERENT numbers
              doing different jobs — below 0 a patrol may engage, at HOSTILE_STANDING
              it goes looking for you. */}
          <Text style={styles.kvWarn}>
            ⚠ Below 0, a faction&apos;s patrols will engage you on sight. At {HOSTILE_STANDING} they
            hunt you on their own ground — marked ☠ above. One contract for their rival moves
            you about 4, so the drop is faster than it looks.
          </Text>
          {/* OTA-849 — jump to the WORLD view: the full balance of power + rumours. */}
          <TouchableOpacity style={styles.worldLink} activeOpacity={0.7} onPress={() => setScreen('world')} accessibilityRole="button">
            <Text style={styles.worldLinkText}>◆ THE WORLD — balance of power & rumours ›</Text>
          </TouchableOpacity>
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
              return (
                <View key={slot} style={styles.slotRow}>
                  <Text style={styles.slotLabel}>{SLOT_LABEL[slot]}</Text>
                  <View style={styles.slotBody}>
                    <Text style={styles.slotName}>
                      {name}{isMirrored ? '  (two-handed grip)' : ''}
                    </Text>
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
          const hpColorDog = hpPctDog > 0.5 ? '#9ec96a' : hpPctDog > 0.25 ? '#c9a86a' : '#e07a5f';
          const loyaltyColor = loyaltyPct > 0.5 ? '#9ec96a' : loyaltyPct > 0.3 ? '#c9a86a' : '#e07a5f';
          const vestName = dog.equipped?.vest;
          // OTA-1650 — the worn INSTANCE (bound by id), its AC, and its condition.
          const vestInst = dogVestInstance(player);
          const vestAc = dogVestAcBonus(player);
          const vestWear = durabilityLabel(vestInst?.durability);
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
                accessibilityRole="button"
              >
                <Text style={styles.name}>
                  {dog.name} <Text style={{ color: '#c9a86a' }}>{sexGlyph}</Text>
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
                {/* ⚠⚠ OTA-1650 — THE VEST SAYS WHAT IT IS AND HOW LONG IT HAS.
                    Owner: *"it needs to show weapons and armor equipped on your
                    companions… i dont know when thiewr weapon breaks."* This row
                    printed a bare name: no AC, no durability, and until this OTA
                    a vest HAD no durability — dogGear.json's baseDurability was
                    never read by `lookupBaseDurability`. Both halves are here
                    now, off the same helpers the compact panel and the repair
                    bench read. */}
                <View style={styles.slotRow}>
                  <Text style={styles.slotLabel}>Vest</Text>
                  <View style={styles.slotBody}>
                    <Text style={vestName ? styles.slotName : styles.slotEmpty}>
                      {vestName ?? '—'}
                      {vestAc > 0 ? `  AC +${vestAc}` : ''}
                    </Text>
                    {vestWear ? (
                      <Text style={[styles.slotWear, { color: conditionColor(gearCondition(vestInst?.durability)) }]}>
                        {vestWear}
                      </Text>
                    ) : null}
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
        {player.golem && player.golem.hp > 0 && (() => {
          const golem = player.golem;
          const hpPctG = golem.hpMax > 0 ? golem.hp / golem.hpMax : 0;
          const hpColorG = hpPctG > 0.5 ? '#9ec96a' : hpPctG > 0.25 ? '#c9a86a' : '#e07a5f';
          const gStats = golem.stats ?? { power: 0, resilience: 0 };
          const gProg = golem.statProgress ?? { power: 0, resilience: 0 };
          const typeLabel = golem.kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          // OTA-1650 — how much life the wielded weapon has left, in words.
          const armWear = durabilityLabel(golem.weapon?.durability);
          // arb121 — name the EXACT repair parts so "feed it the parts it's made
          // of" is discoverable. A golem heals only from its own fuel items, so a
          // pack full of other aether loot reads as unusable until you know which.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { golemRepairParts, GOLEM_ELEMENT_TAGS } = require('../engine/golems');
          const repairParts = (golemRepairParts(golem.kind) as string[]);
          const elementWord = (GOLEM_ELEMENT_TAGS[golem.kind]?.[0] as string | undefined) ?? null;
          const heldRepair = repairParts.filter((p) =>
            player.inventory.some((i) => i.name.toLowerCase() === p.toLowerCase() && i.quantity > 0),
          );
          const gBar = (key: 'power' | 'resilience') => {
            const pct = Math.max(0, Math.min(1, (gProg[key] ?? 0) / 100));
            const filled = Math.round(pct * 20);
            return '▰'.repeat(filled) + '▱'.repeat(20 - filled);
          };
          return (
            <>
              {sectionHeader('golem', 'GOLEM')}
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
                        ? `${golem.weapon.coating ? `${golem.weapon.coating.label ?? golem.weapon.coating.kind} ` : ''}${golem.weapon.name}`
                        : '—'}
                    </Text>
                    {/* ⚠ OTA-1650 — the bare `(12/28)` this row used to print is
                        a number you have to interpret; `12/28 · failing` is the
                        answer to the owner's actual question. Same ladder and
                        same colour as the vest below and the glyph on the
                        compact panel. */}
                    {armWear ? (
                      <Text style={[styles.slotWear, { color: conditionColor(gearCondition(golem.weapon?.durability)) }]}>
                        {armWear}
                      </Text>
                    ) : null}
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
            <TouchableOpacity style={styles.card} onPress={() => setScreen('contracts')} activeOpacity={0.8} accessibilityRole="button">
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
        {sectionHeader('titles', 'ARBITER ASSIGNED TITLES')}
        {!collapsed.titles && (
        <View style={styles.card}>
          {(() => {
            const allTitles = (arbiterTitlesData as { titles: Array<{ id: string; title: string; requirement: string; perk: string }> }).titles;
            const earned = new Set(player.earnedTitles ?? []);
            // OTA-915 — a HIDDEN title (Skyreacher) reads as an undiscovered "?" until
            // you've found its questline (your first Skyreacher Chart). Earned always shows.
            const climbLoreKnown = greatClimbLoreDiscovered(worldMemory);
            // OTA-848 — provenance lookup: id → when it was earned.
            const logMap = new Map((player.titleLog ?? []).map((e) => [e.id, e]));
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
                    ? 'No titles earned yet. The Arbiter watches your deeds.'
                    : `${earnedCount} of ${allTitles.length} titles earned. Tap a title for details.`}
                </Text>
                {sorted.map((t) => {
                  const isEarned = earned.has(t.id);
                  // OTA-915 — mask a hidden, not-yet-discovered title as "???" so a fresh
                  // character sees a slot to chase but not a spoiler name/requirement.
                  if (isHiddenTitle(t.id) && !isEarned && !climbLoreKnown) {
                    return (
                      <View
                        key={t.id}
                        style={styles.titleRow}
                        accessible
                        accessibilityRole="text"
                        accessibilityLabel="Undiscovered title. A title whose path you haven't crossed yet."
                      >
                        <Text style={[styles.titleName, styles.titleNameLocked]}>◇ ??? — undiscovered</Text>
                        <Text style={styles.titleRequirement}>A title whose path you haven&apos;t crossed yet.</Text>
                      </View>
                    );
                  }
                  const isOpen = openTitle === t.id;
                  // OTA-848 — each title is singly tappable: expands to show HOW it
                  // was earned (the requirement / deed) and, for earned titles, WHEN
                  // (its earn-date from titleLog, or an honest fallback for titles
                  // earned before provenance was recorded).
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={styles.titleRow}
                      activeOpacity={0.7}
                      onPress={() => setOpenTitle((cur) => (cur === t.id ? null : t.id))}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                    >
                      <Text style={[styles.titleName, isEarned ? styles.titleNameEarned : styles.titleNameLocked]}>
                        {isEarned ? '◆ ' : '◇ '}{t.title}
                        <Text style={styles.tapHint}>  {isOpen ? '▾' : '▸'}</Text>
                      </Text>
                      <Text style={isEarned ? styles.titlePerk : styles.titleRequirement}>
                        {isEarned ? (TITLE_PASSIVE_PERK[t.id] ?? t.perk) : t.requirement}
                      </Text>
                      {isOpen && (
                        <View style={styles.titleDetail}>
                          <Text style={styles.titleDetailLine}>
                            <Text style={styles.titleDetailKey}>How: </Text>{t.requirement}
                          </Text>
                          {isEarned ? (
                            <Text style={styles.titleDetailLine}>
                              <Text style={styles.titleDetailKey}>When: </Text>
                              {describeTitleEarned(logMap.get(t.id)).replace(/^Earned(: )?/, '')}
                            </Text>
                          ) : (
                            <Text style={styles.titleDetailLine}>
                              <Text style={styles.titleDetailKey}>Perk once earned: </Text>
                              {TITLE_PASSIVE_PERK[t.id] ?? t.perk}
                            </Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
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

// OTA-848 — each core-stat row is now tap-to-expand. Collapsed, it's a clean
// number + progress bar (readable at a glance); expanded, it opens the full
// source breakdown AND the "Grows from" activities as a bulleted list, one per
// line, so the cramped ellipsized run-on that used to squeeze six trainers into
// three clipped lines is gone.
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
  const [expanded, setExpanded] = useState(false);
  const hasSources = b.sources.length > 0;
  const hasDetail = hasSources || activities.length > 0;
  return (
    <TouchableOpacity
      style={styles.statRow}
      activeOpacity={hasDetail ? 0.7 : 1}
      onPress={() => hasDetail && setExpanded((v) => !v)}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <Text style={styles.statKey}>{label}</Text>
      <View style={styles.statBody}>
        <Text style={styles.statTotal}>
          {b.total}
          {hasSources && <Text style={styles.statBase}>  (base {b.base})</Text>}
          {hasDetail && <Text style={styles.tapHint}>  {expanded ? '▾' : '▸'}</Text>}
        </Text>
        {/* 2026-05-25 [VIZ-1] — 20-segment fine bar (5% per rune)
            replaces the legacy 4-segment quartile. Player sees
            fine-grained progress toward next stat level. */}
        <Text style={styles.progressBar}>
          {progressBar}  <Text style={styles.progressPct}>{progressPct}%</Text>
        </Text>
        {!expanded && hasDetail && (
          <Text style={styles.tapHintLine}>tap to see sources & how it grows ›</Text>
        )}
        {expanded && hasSources && (
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
        {expanded && activities.length > 0 && (
          <View style={styles.growsFrom}>
            <Text style={styles.growsFromHead}>Grows from:</Text>
            {activities.map((a, i) => (
              <Text key={i} style={styles.growsFromItem}>•  {a}</Text>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
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
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  // OTA-1023 — header REPLAY OPENING button; sized to balance the BACK pill.
  replayBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  replayText: { color: '#8aa0a4', fontSize: 10, letterSpacing: 2, fontWeight: '700', textAlign: 'center', lineHeight: 14 },
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  placeholder: { color: '#c9a86a', textAlign: 'center', marginTop: 80 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  sectionTitle: {
    color: '#c9a86a',
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
    borderLeftColor: '#c9a86a',
    borderRadius: 3,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 6,
  },
  sectionChevron: { color: '#c9a86a', fontSize: 11, fontWeight: '900', marginRight: 7, width: 11, textAlign: 'center' },
  sectionHeaderLabel: { color: '#c9a86a', fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  card: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
  },

  name: { color: '#e6d8b3', fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  subline: { color: '#c9a86a', fontSize: 12, letterSpacing: 1, marginTop: 2, marginBottom: 10 },

  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  barLabel: { color: '#c9a86a', fontSize: 10, letterSpacing: 1, width: 30 },
  barBg: { flex: 1, height: 8, backgroundColor: '#1a1714', borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  barFill: { height: '100%' },
  barValue: { color: '#cdbf99', fontSize: 11, width: 64, textAlign: 'right' },

  statRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomColor: '#1f1c18', borderBottomWidth: 1 },
  statKey: { color: '#c9a86a', fontSize: 12, fontWeight: '700', letterSpacing: 1, width: 44, paddingTop: 2 },
  statBody: { flex: 1 },
  statTotal: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  statBase: { color: '#c9a86a', fontSize: 11, fontWeight: '400' },
  progressBar: { color: '#9ec96a', fontSize: 10, letterSpacing: 1, marginTop: 3 },
  progressPct: { color: '#c9a86a', fontSize: 9, letterSpacing: 0.5 },
  activityList: { color: '#c9a86a', fontSize: 9, marginTop: 2, lineHeight: 13, letterSpacing: 0.3 },
  // OTA-848 — tap-to-expand affordances + readable breakdown lists.
  tapHint: { color: '#a2977b', fontSize: 11, fontWeight: '400' },
  tapHintLine: { color: '#a2977b', fontSize: 9, fontStyle: 'italic', marginTop: 3, letterSpacing: 0.3 },
  // ⚠ OTA-1448 — the Arbiter's two ladders. Dimming carries the whole meaning
  // here, so the lit/unlit gap is deliberately wide: an unreached rung has to
  // read as "not yet" at a glance, not as slightly quieter text.
  ladderTitle: { color: '#8aa0a4', fontSize: 10, letterSpacing: 3, fontWeight: '700', marginBottom: 2 },
  ladderNote: { color: '#a2977b', fontSize: 10, fontStyle: 'italic', marginBottom: 6 },
  ladderRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3 },
  ladderRowDim: { opacity: 0.38 },
  ladderMark: { color: '#5a6a6e', fontSize: 12, width: 14 },
  ladderMarkOn: { color: '#c9a86a', fontWeight: '700' },
  ladderText: { color: '#cdbf99', fontSize: 12, flex: 1, lineHeight: 17 },
  ladderTextOn: { color: '#e6d8b3', fontWeight: '700' },
  ladderReq: { color: '#8aa0a4', fontSize: 10, marginLeft: 8, minWidth: 52, textAlign: 'right' },
  ladderReqOn: { color: '#c9a86a', fontWeight: '700' },
  breakdownList: { marginTop: 6, borderTopColor: '#2a2620', borderTopWidth: 1, paddingTop: 6 },
  breakdownRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 2 },
  breakdownDelta: { color: '#9ec96a', fontSize: 12, fontWeight: '700', width: 40 },
  breakdownDeltaNeg: { color: '#e07a5f' },
  breakdownLabel: { color: '#cdbf99', fontSize: 12, flex: 1 },
  breakdownTotalRow: { marginTop: 3, borderTopColor: '#2a2620', borderTopWidth: 1, paddingTop: 5 },
  breakdownTotalDelta: { color: '#e6d8b3', fontSize: 13, fontWeight: '800', width: 40 },
  breakdownTotalLabel: { color: '#e6d8b3', fontSize: 12, fontWeight: '700', flex: 1 },
  growsFrom: { marginTop: 6 },
  growsFromHead: { color: '#c9a86a', fontSize: 10, letterSpacing: 0.5, marginBottom: 3, fontWeight: '700' },
  growsFromItem: { color: '#bcae88', fontSize: 11, lineHeight: 16, marginLeft: 2 },
  titleDetail: { marginTop: 6, marginLeft: 14, borderLeftColor: '#3a342c', borderLeftWidth: 2, paddingLeft: 8 },
  titleDetailLine: { color: '#bcae88', fontSize: 11, lineHeight: 16, marginBottom: 2 },
  titleDetailKey: { color: '#c9a86a', fontWeight: '700' },
  // OTA-849 — WORLD view link on the faction section.
  worldLink: { marginTop: 8, borderTopColor: '#2a2620', borderTopWidth: 1, paddingTop: 8, alignItems: 'center' },
  worldLinkText: { color: '#c9a86a', fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  // OTA-843 — Chronicle section.
  chronicleTitle: { color: '#e6d8b3', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  chronicleHeadline: { color: '#c9a86a', fontSize: 12, marginTop: 2, marginBottom: 8, letterSpacing: 0.5 },
  chronicleDeed: { color: '#cdbf99', fontSize: 12, lineHeight: 18 },
  chronicleTimeline: { marginTop: 10, borderTopColor: '#2a2620', borderTopWidth: 1, paddingTop: 8, gap: 6 },
  chronicleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  chronicleGlyph: { color: '#c9a86a', fontSize: 13, width: 16, textAlign: 'center' },
  chronicleEntryText: { color: '#bcae88', fontSize: 12, lineHeight: 18, flex: 1 },
  chronicleEmpty: { color: '#a2977b', fontSize: 12, fontStyle: 'italic', marginTop: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  chip: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 3 },
  chipNeg: { borderColor: '#7a4040', backgroundColor: '#221512' },
  chipText: { color: '#9ec96a', fontSize: 10, letterSpacing: 0.5 },
  chipTextNeg: { color: '#e07a5f' },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 4 },
  kvKey: { color: '#c9a86a', fontSize: 12, letterSpacing: 1 },
  factionOwn: { color: '#cdbf99', fontWeight: '700' },
  // OTA-844 — world-pulse tide tags on the faction standings.
  tideRising: { color: '#9ec96a', fontSize: 10, fontWeight: '400' },
  tideWaning: { color: '#c98a6a', fontSize: 10, fontWeight: '400' },
  kvValue: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  kvSub: { color: '#c9a86a', fontSize: 10, fontStyle: 'italic', marginTop: -2, marginBottom: 4 },
  // OTA-1161 — the HP provenance line and the gift ledger.
  hpBreakdown: { color: '#8a7a5a', fontSize: 10, marginTop: -2, marginBottom: 2, marginLeft: 46 },
  giftLedger: { marginTop: 6, marginBottom: 4, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: '#3a3226' },
  giftRow: { marginBottom: 6 },
  giftLine: { color: '#e6d8b3', fontSize: 12 },
  giftMeta: { color: '#8a7a5a', fontSize: 10, fontStyle: 'italic' },
  // OTA-1158 — the threat end of a standing row, and the rule under the list.
  // Deliberately NOT italic like kvSub: this one is a warning, not a footnote.
  huntedTag: { color: '#e07a5f', fontSize: 10, fontWeight: '700' },
  nearHuntedTag: { color: '#c98a6a', fontSize: 10, fontWeight: '400' },
  kvWarn: { color: '#e07a5f', fontSize: 10, marginTop: 2, marginBottom: 4 },
  warning: { color: '#c9a86a' },
  danger: { color: '#e07a5f' },

  slotRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomColor: '#1f1c18', borderBottomWidth: 1 },
  slotLabel: { color: '#c9a86a', fontSize: 10, letterSpacing: 1, width: 80, paddingTop: 2 },
  slotBody: { flex: 1 },
  slotEmpty: { color: '#3a342c', fontSize: 12 },
  slotName: { color: '#e6d8b3', fontSize: 13, fontWeight: '700' },
  // OTA-1650 — the durability readout under a companion's gear name. Coloured
  // by condition at the call site (sound / worn / failing).
  slotWear: { fontSize: 11, marginTop: 1 },
  slotMeta: { color: '#9ec96a', fontSize: 10, marginTop: 2 },

  effectRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  effectLabel: { color: '#e6d8b3', fontSize: 12 },
  effectMeta: { color: '#c9a86a', fontSize: 10, letterSpacing: 0.5 },

  traitRow: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 4 },

  contractRow: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 2 },
  contractTap: { color: '#c9a86a', fontSize: 10, letterSpacing: 1, marginTop: 6, fontStyle: 'italic', textAlign: 'right' },

  footerHint: { color: '#c9a86a', fontSize: 10, fontStyle: 'italic', textAlign: 'center', marginTop: 18 },
  // OTA-236 — Arbiter Titles section.
  titlesSummary: { color: '#c9a86a', fontSize: 11, fontStyle: 'italic', marginBottom: 8 },
  titleRow: { marginBottom: 8 },
  titleName: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, marginBottom: 2 },
  titleNameEarned: { color: '#c9a86a' },
  titleNameLocked: { color: '#c9a86a' },
  titlePerk: { color: '#cdbf99', fontSize: 11, lineHeight: 15, marginLeft: 14 },
  titleRequirement: { color: '#c9a86a', fontSize: 11, lineHeight: 15, marginLeft: 14, fontStyle: 'italic' },
});
