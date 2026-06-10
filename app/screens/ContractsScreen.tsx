import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Modal } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { findHuntById, HUNTS, checkKindLabel, biomeLabel, stageTypeLabel, weaponRarityMeets } from '../engine/hunts';
import { getItemPreview } from '../components/itemPreview';
import { findMysteryById, MYSTERIES } from '../engine/mysteries';
import { findStorylineById, STORYLINES } from '../engine/factionStorylines';
import { findFactionQuestById, FACTION_QUESTS } from '../engine/factionQuests';
import { FACTIONS } from '../engine/factions';
import { startingLocationForFaction } from '../engine/character';
import { getLocationById } from '../engine/encounter';
import { computeAllProgress, CHARACTER_STORIES, ALL_FRAGMENTS } from '../engine/collectables';
import { describeWhisperStage, describeWhisperTitle, findChain, whisperRouteTarget } from '../engine/whispers';
import {
  ensureMainQuest,
  phaseLabel,
  phaseHint,
  LOST_CAPITAL_LOCATIONS,
  coreGateNextAction,
} from '../engine/mainQuest';
import { GUARDIANS_BY_CAPITAL } from '../engine/coreGuardians';

function MilestoneStat({
  label,
  value,
  next,
  suffix,
  onPress,
  active,
}: {
  label: string;
  value: number;
  next: number;
  suffix: string;
  onPress?: () => void;
  active?: boolean;
}) {
  const toNext = next - (value % next);
  const body = (
    <View style={[milestoneStyles.cell, active && milestoneStyles.cellActive]}>
      <Text style={milestoneStyles.value}>{value}</Text>
      <Text style={milestoneStyles.label}>{label}</Text>
      <Text style={milestoneStyles.next}>{toNext === next ? `next ${suffix} after ${next}` : `${toNext} → ${suffix}`}</Text>
      {onPress ? <Text style={milestoneStyles.tapHint}>{active ? '▴ tap to close' : '▾ tap to list'}</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ flex: 1 }}>
      {body}
    </TouchableOpacity>
  );
}

const milestoneStyles = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  cellActive: { borderColor: '#c9a86a', backgroundColor: '#1a1714' },
  value: { color: '#c9a86a', fontSize: 18, fontWeight: '700' },
  label: { color: '#cdbf99', fontSize: 11, letterSpacing: 1 },
  next: { color: '#7a705c', fontSize: 9, marginTop: 2, textAlign: 'center' },
  tapHint: { color: '#5a5448', fontSize: 8, marginTop: 1, letterSpacing: 1 },
});

function factionLabel(factionId: string | null | undefined): string {
  if (!factionId) return 'Unaffiliated';
  const f = FACTIONS.find((x) => x.id === factionId);
  return f?.name ?? factionId.replace(/_/g, ' ');
}

type Tab = 'contracts' | 'collectables';

export function ContractsScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  const completeContractFromUI = useGameStore((s) => s.completeContractFromUI);
  const abandonContract = useGameStore((s) => s.abandonContract);
  const discardLead = useGameStore((s) => s.discardLead);
  // 2026-05-24 — tap-to-travel from the Primary Objective expansion.
  // Mirrors the Lore→Places confirm modal pattern in LoreCodexBody.
  const setTravelCourse = useGameStore((s) => s.setTravelCourse);
  const requestTravelConfirm = useGameStore((s) => s.requestTravelConfirm);
  const setWhisperCourse = useGameStore((s) => s.setWhisperCourse);
  const appendLog = useGameStore((s) => s.appendLog);
  const [pendingRoute, setPendingRoute] = useState<{ id: string; name: string } | null>(null);
  // 2026-05-25 — branded refusal modal for hub-room gate. Same
  // palette as the rest of the game; replaces native Alert.alert.
  const [tab, setTab] = useState<Tab>('contracts');
  // OTA 020 — tap-to-expand. Each card key (kind:id) maps to true
  // when expanded. Tap the card head to toggle; expanded view shows
  // the full step list and the COMPLETE / DISCARD button when
  // applicable. Playtester: "if you tap on it, it should give you
  // instructions on what to do with it for the step you are trying
  // to complete. and you should be able to tap to complete if you
  // have met all the tasks."
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setExpanded((s) => ({ ...s, [key]: !s[key] }));
  // v2.4.1 (OTA 052) — per-section tap-expand. The PRIMARY OBJECTIVE
  // card opens a 9-Capital tracker; each MilestoneStat opens a
  // detail list (kills by enemy name, locations discovered, etc.).
  const [mqExpanded, setMqExpanded] = useState(false);
  const [milestoneExpanded, setMilestoneExpanded] = useState<
    null | 'enemies' | 'travels' | 'checks' | 'npcs'
  >(null);
  const worldMemory = useGameStore((s) => s.worldMemory);

  if (!player) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No active character.</Text>
      </View>
    );
  }

  // Resolve every active contract via its catalog lookup so we always
  // have a current title + stage count even after lore edits.
  const hunts = (player.activeHunts ?? []).map((h) => ({
    run: h,
    def: findHuntById(h.id),
  }));
  const mysteries = (player.activeMysteries ?? []).map((m) => ({
    run: m,
    def: findMysteryById(m.id),
  }));
  const storylines = (player.activeStorylines ?? []).map((s) => ({
    run: s,
    def: findStorylineById(s.id),
  }));
  // Faction quests — prefer the new staged shape (activeFactionQuests)
  // and fall back to the legacy id list. The legacy list will be empty
  // after backfillPlayer runs on load, but the dual read keeps the
  // screen safe across mid-session migrations.
  const factionQuestRecords =
    player.activeFactionQuests ??
    (player.activeFactionQuestIds ?? []).map((id) => ({
      id,
      stage: 0,
      postedByFaction: findFactionQuestById(id)?.factionId ?? 'unknown',
      acceptedAt: Date.now(),
    }));
  const factionQuests = factionQuestRecords.map((rec) => ({
    rec,
    def: findFactionQuestById(rec.id),
  }));

  // Whispers (OTA 187) — the emergent Pittsburgh-loop chains. Tipped
  // off by non-vendor NPCs in hubs, tracked here so they're not lost
  // in the log scroll. No expiry — they stay open until the player
  // resolves them one way or another.
  const whispers = (player.activeWhispers ?? []).map((w) => ({
    rec: w,
    chain: findChain(w.id),
    title: describeWhisperTitle(w),
    stageDesc: describeWhisperStage(w),
  }));

  // OTA 220 — leads from the investigate-spawn path
  // (generateNewQuest). The store pushes them into player.activeQuests
  // but until this OTA there was no UI to display them, so the
  // "New lead: Retrieve a confused Aetherkin..." reward line in the
  // adventure log went nowhere. Surface them as a LEADS section
  // beneath the formal contracts so the player can actually track
  // what they're chasing.
  const leads = (player.activeQuests ?? []).filter(
    (q) => q.state === 'open' || q.state === 'in_progress',
  );

  const totalActive =
    hunts.length + mysteries.length + storylines.length + factionQuests.length + whispers.length + leads.length;

  // Lifetime milestone counters — surfaced here so players have a single
  // place to see progress toward stat bumps (every 10 checks succeeded
  // → +1 stat, every 5 enemies defeated → +1 HP max, every 5 travels
  // → +1 stamina max).
  const ms = player.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 };

  const progress = computeAllProgress(player.collectables ?? []);
  const totalFragmentsFound = progress.reduce((acc, p) => acc + p.found.length, 0);
  const totalFragments = ALL_FRAGMENTS.length;

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
        <Text style={styles.title}>CONTRACTS</Text>
        <View style={{ width: 80 }} />
      </View>

      {(() => {
        // v2.4.1 (OTA 033) — Primary Objective card. Renders above
        // the existing tabs whenever the player has a mainQuest.
        // Shows current phase, Cores recovered, next-step hint, and
        // — when the player is at the Mud Flood Nexus with all 9
        // Cores — the three Ending Choice buttons.
        //
        // OTA 052 — tap-to-expand opens a 9-Capital tracker so the
        // player can see which Cores are recovered, which Guardians
        // they've attempted, and which Capitals are still untouched.
        if (!player) return null;
        const mq = ensureMainQuest(player.mainQuest);
        const recoveredCount = mq.coresRecovered.length;
        const fledByCapital = (worldMemory.memorableEvents ?? []).reduce<Record<string, number>>(
          (acc, e) => {
            if (e.kind === 'mq_guardian_fled' && e.locationId) {
              acc[e.locationId] = (acc[e.locationId] ?? 0) + 1;
            }
            return acc;
          },
          {},
        );
        // OTA-148 — SUMMON chip eligibility. Shows when the player
        // is standing in an unrecovered Lost Capital with the main
        // quest active. Pre-OTA-148, summoning the Guardian required
        // taking the faction-gate verb (attack/diplomacy/salvage/…)
        // at the Capital, which the player had no way to discover
        // post-revive when the Guardian had been wiped from the
        // scene. Tap the chip → store fires the same spawn pipeline
        // and bounces back to exploration.
        // OTA-412 — only while STANDING ON the capital's anchor tile.
        // currentLocationId lingers as the capital after a cardinal step into the
        // wilderness; gating on it alone left the SUMMON chip live miles outside
        // the city. Mirror isStationedAtNamedLocation (the summon action enforces
        // the same — summonCoreGuardian → not_at_capital).
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { WORLD_MAP_CENTER_X: cx, WORLD_MAP_CENTER_Y: cy } = require('../engine/worldMap');
        const stationedAtCapital = !player.travelTarget
          && (player.hubRoomId != null || (player.mapX === cx && player.mapY === cy));
        const atCapitalForSummon =
          stationedAtCapital
          && (mq.phase === 'revelation' || mq.phase === 'cores')
          && LOST_CAPITAL_LOCATIONS.includes(player.currentLocationId)
          && !mq.coresRecovered.includes(player.currentLocationId);
        return (
          <TouchableOpacity
            style={styles.mainQuestCard}
            onPress={() => setMqExpanded((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={styles.mainQuestTag}>PRIMARY OBJECTIVE  {mqExpanded ? '▴' : '▾'}</Text>
            <Text style={styles.mainQuestPhase}>{phaseLabel(mq.phase)}</Text>
            <Text style={styles.mainQuestHint}>{phaseHint(mq.phase, recoveredCount)}</Text>
            {(() => {
              // v2.4.1 (OTA 035) — when the player is standing at an
              // unrecovered Lost Capital, surface the faction's
              // next-action prompt as a second hint line.
              if (mq.phase !== 'revelation' && mq.phase !== 'cores') return null;
              const here = player.currentLocationId;
              if (!LOST_CAPITAL_LOCATIONS.includes(here)) return null;
              if (mq.coresRecovered.includes(here)) return null;
              const next = coreGateNextAction(player.factionId);
              return <Text style={styles.mainQuestNextAction}>→ At this Capital: {next}.</Text>;
            })()}
            {atCapitalForSummon && (
              <TouchableOpacity
                style={styles.summonChip}
                onPress={() => useGameStore.getState().summonCoreGuardian()}
                activeOpacity={0.7}
                hitSlop={6}
              >
                <Text style={styles.summonChipText}>★ SUMMON</Text>
              </TouchableOpacity>
            )}
            {mqExpanded && (
              <View style={styles.mqTracker}>
                <Text style={styles.mqTrackerHead}>9 CAPITALS · {recoveredCount}/9 CORES</Text>
                {LOST_CAPITAL_LOCATIONS.map((capId) => {
                  const def = GUARDIANS_BY_CAPITAL[capId];
                  const recovered = mq.coresRecovered.includes(capId);
                  const guardianDown = (mq.guardiansDefeated ?? []).includes(capId);
                  const here = player.currentLocationId === capId;
                  const fleeCount = fledByCapital[capId] ?? 0;
                  let status: string;
                  let color: string;
                  if (recovered) {
                    status = '✓ Core recovered';
                    color = '#7a8a5a';
                  } else if (guardianDown) {
                    status = '✓ Guardian down — return to claim Core';
                    color = '#c9a86a';
                  } else if (fleeCount > 0) {
                    status = `△ Guardian fought, fled ${fleeCount}× — return to finish`;
                    color = '#a85a3a';
                  } else if (here) {
                    status = '○ At this Capital now';
                    color = '#c9a86a';
                  } else {
                    status = '· not yet visited';
                    color = '#7a705c';
                  }
                  const capName = def?.capitalName ?? capId;
                  // 2026-05-24 — rows are now tappable to start a
                  // travel-to course (mirrors Lore→Places). The row
                  // for the player's current Capital stays a plain
                  // View since you can't travel to where you are.
                  const rowContent = (
                    <>
                      <Text style={styles.mqTrackerCap}>{capName}</Text>
                      <Text style={[styles.mqTrackerStatus, { color }]}>{status}</Text>
                      <Text style={styles.mqTrackerGuardian}>
                        Guardian: {def?.base.name ?? '—'}
                      </Text>
                      {!here && (
                        <Text style={styles.mqTrackerTap}>▸ tap to travel</Text>
                      )}
                    </>
                  );
                  if (here) {
                    return (
                      <View key={capId} style={styles.mqTrackerRow}>{rowContent}</View>
                    );
                  }
                  return (
                    <TouchableOpacity
                      key={capId}
                      style={styles.mqTrackerRow}
                      activeOpacity={0.7}
                      onPress={() => setPendingRoute({ id: capId, name: capName })}
                    >
                      {rowContent}
                    </TouchableOpacity>
                  );
                })}
                <Text style={styles.mqTrackerFoot}>
                  Tap any Capital row above to start travel.
                </Text>
              </View>
            )}
            {mq.phase === 'choice' && (
              <View style={styles.mainQuestChoiceRow}>
                <TouchableOpacity
                  style={[styles.mainQuestChoiceBtn, { borderColor: '#5a6b8a' }]}
                  onPress={() => useGameStore.getState().chooseEndingMainQuest('seal')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.mainQuestChoiceText}>SEAL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mainQuestChoiceBtn, { borderColor: '#a85a3a' }]}
                  onPress={() => useGameStore.getState().chooseEndingMainQuest('unleash')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.mainQuestChoiceText}>UNLEASH</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mainQuestChoiceBtn, { borderColor: '#7a8a5a' }]}
                  onPress={() => useGameStore.getState().chooseEndingMainQuest('preserve')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.mainQuestChoiceText}>PRESERVE</Text>
                </TouchableOpacity>
              </View>
            )}
            {mq.phase === 'ended' && mq.ending && (
              <Text style={styles.mainQuestEnded}>
                Ending recorded: {mq.ending.toUpperCase()}.
              </Text>
            )}
          </TouchableOpacity>
        );
      })()}

      <View style={styles.tabRow}>
        <TouchableOpacity
          onPress={() => setTab('contracts')}
          style={[styles.tabBtn, tab === 'contracts' && styles.tabBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'contracts' && styles.tabBtnTextActive]}>
            CONTRACTS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('collectables')}
          style={[styles.tabBtn, tab === 'collectables' && styles.tabBtnActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabBtnText, tab === 'collectables' && styles.tabBtnTextActive]}>
            COLLECTIBLES {totalFragments > 0 ? `(${totalFragmentsFound}/${totalFragments})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'collectables' ? (
        <CollectablesTab progress={progress} />
      ) : (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MILESTONES  ·  tap a cell to expand</Text>
          <View style={styles.milestoneRow}>
            <MilestoneStat
              label="Enemies"
              value={ms.enemiesDefeated}
              next={5}
              suffix="+1 HP max"
              active={milestoneExpanded === 'enemies'}
              onPress={() => setMilestoneExpanded(milestoneExpanded === 'enemies' ? null : 'enemies')}
            />
            <MilestoneStat
              label="Travels"
              value={ms.travelsCompleted}
              next={5}
              suffix="+1 STA max"
              active={milestoneExpanded === 'travels'}
              onPress={() => setMilestoneExpanded(milestoneExpanded === 'travels' ? null : 'travels')}
            />
            <MilestoneStat
              label="Checks"
              value={ms.checksSucceeded}
              next={10}
              suffix="+1 stat"
              active={milestoneExpanded === 'checks'}
              onPress={() => setMilestoneExpanded(milestoneExpanded === 'checks' ? null : 'checks')}
            />
            <MilestoneStat
              label="NPCs Met"
              value={(worldMemory.npcsMet ?? []).length}
              next={1}
              suffix="story thread"
              active={milestoneExpanded === 'npcs'}
              onPress={() => setMilestoneExpanded(milestoneExpanded === 'npcs' ? null : 'npcs')}
            />
          </View>
          {milestoneExpanded === 'enemies' && (
            <View style={styles.milestoneDetail}>
              <Text style={styles.milestoneDetailHead}>
                FIRST KILLS  ·  {(worldMemory.defeatedEnemies ?? []).length} unique
              </Text>
              {(worldMemory.defeatedEnemies ?? []).length === 0 ? (
                <Text style={styles.milestoneDetailEmpty}>No kills yet. The buried world waits.</Text>
              ) : (
                (worldMemory.defeatedEnemies ?? []).map((name) => (
                  <Text key={name} style={styles.milestoneDetailRow}>· {name}</Text>
                ))
              )}
            </View>
          )}
          {milestoneExpanded === 'travels' && (
            <View style={styles.milestoneDetail}>
              <Text style={styles.milestoneDetailHead}>
                LOCATIONS DISCOVERED  ·  {(worldMemory.discoveredLocationIds ?? []).length}
              </Text>
              {(worldMemory.discoveredLocationIds ?? []).length === 0 ? (
                <Text style={styles.milestoneDetailEmpty}>No travels yet. The road waits.</Text>
              ) : (
                (worldMemory.discoveredLocationIds ?? []).map((id) => (
                  <Text key={id} style={styles.milestoneDetailRow}>· {id.replace(/_/g, ' ')}</Text>
                ))
              )}
            </View>
          )}
          {milestoneExpanded === 'checks' && (
            <View style={styles.milestoneDetail}>
              <Text style={styles.milestoneDetailHead}>SKILL CHECKS</Text>
              <Text style={styles.milestoneDetailRow}>
                Successful d20-vs-DC rolls across stealth, investigate, persuade,
                cast, climb, and similar disciplines. Every 10 successes → +1 to
                a random stat.
              </Text>
              <Text style={styles.milestoneDetailRow}>
                Per-roll log is not retained (the rolls happen mid-action and
                fold back into the narration). The counter above is your
                lifetime success total.
              </Text>
            </View>
          )}
          {milestoneExpanded === 'npcs' && (
            <View style={styles.milestoneDetail}>
              <Text style={styles.milestoneDetailHead}>
                NPCs MET  ·  {(worldMemory.npcsMet ?? []).length}
              </Text>
              {(worldMemory.npcsMet ?? []).length === 0 ? (
                <Text style={styles.milestoneDetailEmpty}>
                  Nobody yet. Vendors, Guardians, and named contacts you meet
                  along the way show up here.
                </Text>
              ) : (
                (worldMemory.npcsMet ?? []).map((n) => (
                  <Text key={n.id} style={styles.milestoneDetailRow}>
                    · {n.name}
                    {n.role ? ` — ${n.role}` : ''}
                    {n.locationId ? `  (${n.locationId.replace(/_/g, ' ')})` : ''}
                  </Text>
                ))
              )}
            </View>
          )}
        </View>

        {totalActive === 0 ? (
          <View style={styles.emptyInline}>
            <Text style={styles.emptyTitle}>No active contracts.</Text>
            <Text style={styles.emptyBody}>
              Find a faction vendor — `accept`, `take`, or `undertake` a hunt /
              mystery / storyline / quest to pick one up.
            </Text>
            <Text style={styles.emptySub}>
              {HUNTS.length} hunts · {MYSTERIES.length} mysteries ·
              {' '}{STORYLINES.length} storylines · {FACTION_QUESTS.length} faction quests
              available in the world.
            </Text>
          </View>
        ) : null}

        {hunts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>HUNTS</Text>
              {hunts.map(({ run, def }) => {
                if (!def) return null;
                const key = `h_${run.id}`;
                const open = !!expanded[key];
                const ready = run.stage >= def.stages.length;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{def.title}</Text>
                      <Text style={styles.stagePill}>
                        {ready ? 'READY' : `Stage ${run.stage + 1}/${def.stages.length}`}
                      </Text>
                    </View>
                    <Text style={styles.cardFaction}>{factionLabel(def.factionId)}</Text>
                    {/* 2026-05-26 OTA-053 — playtester ask: hunt card
                        didn't tell them where to go or what to do.
                        Three additions:
                          - Location chip under the title (always
                            visible, collapsed or expanded)
                          - Per-stage skill hint ("→ Advance by use
                            stealth") on every stage in the expanded
                            list
                          - Current-stage skill hint on the COLLAPSED
                            card too, so the player can see the next
                            step without expanding */}
                    <Text style={styles.cardLocation}>
                      📍 {def.targetLocationName ?? biomeLabel(def.biomeTag)}
                    </Text>
                    {/* 2026-05-26 OTA-055 — difficulty chip with traffic-
                        light coloring vs the player's current state.
                        Green when comfortably above both thresholds,
                        amber when marginal on one, red when below
                        both. Aim is "don't die accidentally on a
                        hunt that wasn't right for your level." */}
                    {def.difficultyTier && def.recommendedHp && def.recommendedWeaponRarity && (() => {
                      const hpOk = player ? player.hp >= def.recommendedHp : false;
                      const mainName = player?.equipped?.main;
                      const mainRarity = mainName ? (getItemPreview(mainName).rarity ?? undefined) : undefined;
                      const weaponOk = weaponRarityMeets(mainRarity, def.recommendedWeaponRarity);
                      const tone = hpOk && weaponOk
                        ? styles.difficultyChipReady
                        : hpOk || weaponOk
                          ? styles.difficultyChipMarginal
                          : styles.difficultyChipDangerous;
                      return (
                        <Text style={[styles.difficultyChip, tone]}>
                          ⚔️ Tier {def.difficultyTier} — {def.difficultyLabel}  ·  rec. {def.recommendedHp} HP · {def.recommendedWeaponRarity} weapon
                        </Text>
                      );
                    })()}
                    {!open && def.stages[run.stage] && !ready && (
                      <>
                        <Text style={styles.cardBody}>{def.stages[run.stage]!.narration}</Text>
                        {(() => {
                          const label = checkKindLabel(def.stages[run.stage]!.checkKind);
                          if (!label) return null;
                          return <Text style={styles.cardHint}>→ Advance by {label}</Text>;
                        })()}
                      </>
                    )}
                    {open && (
                      <View style={styles.expanded}>
                        <Text style={styles.expandedLabel}>Target</Text>
                        <Text style={styles.expandedBody}>{def.targetEnemyName}</Text>
                        <Text style={styles.expandedLabel}>Location</Text>
                        <Text style={styles.expandedBody}>
                          {def.targetLocationName ?? biomeLabel(def.biomeTag)}
                        </Text>
                        {def.templateKind && (
                          <>
                            <Text style={styles.expandedLabel}>Hunt template</Text>
                            <Text style={styles.expandedBody}>
                              {def.templateKind === 'standard_7'
                                ? '7-stage Standard (informant-driven, methodical)'
                                : '5-stage Bait & Switch (urgent, the target moved)'}
                            </Text>
                          </>
                        )}
                        <Text style={styles.expandedLabel}>Stages</Text>
                        {def.stages.map((s, i) => {
                          const skillLabel = checkKindLabel(s.checkKind);
                          const slot = stageTypeLabel(s.stageType);
                          return (
                            <View key={i}>
                              <Text
                                style={[
                                  styles.expandedStage,
                                  i < run.stage && styles.expandedStageDone,
                                  i === run.stage && !ready && styles.expandedStageCurrent,
                                ]}
                              >
                                {i < run.stage ? '✓ ' : i === run.stage && !ready ? '→ ' : '  '}
                                {slot ? `Stage ${i + 1}/${def.stages.length} — ${slot}: ` : ''}{s.narration}
                              </Text>
                              {skillLabel && (
                                <Text style={styles.expandedStageHint}>
                                  {'      '}→ {skillLabel}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                        <Text style={styles.expandedLabel}>Reward</Text>
                        <Text style={styles.expandedBody}>
                          {def.rewardTc} TC{def.rewardRep ? ` · +${def.rewardRep} rep` : ''}{def.rewardItem ? ` · ${def.rewardItem}` : ''} · Trophy: {def.trophyName}
                        </Text>
                        <Text style={styles.expandedLabel}>How to finish</Text>
                        <Text style={styles.expandedBody}>
                          {ready
                            ? 'Boss slain. Tap COMPLETE to claim the bounty.'
                            : `Travel to ${def.targetLocationName ?? biomeLabel(def.biomeTag)} and defeat the ${def.targetEnemyName}. Each stage above auto-advances when you perform the matching action there.`}
                        </Text>
                      </View>
                    )}
                    {open && ready && (
                      <Pressable
                        style={({ pressed }) => [styles.completeBtn, pressed && styles.completeBtnPressed]}
                        onPress={() => completeContractFromUI('hunt', def.id)}
                      >
                        <Text style={styles.completeBtnText}>COMPLETE — CLAIM REWARD</Text>
                      </Pressable>
                    )}
                    {/* 2026-05-26 OTA-054 — ABANDON affordance so a
                        contract that was silently auto-granted (or
                        the player just no longer wants) can be
                        dropped from the slate. Always visible when
                        the card is expanded. */}
                    {open && (
                      <Pressable
                        style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                        onPress={() => abandonContract('hunt', def.id)}
                      >
                        <Text style={styles.abandonBtnText}>ABANDON</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {mysteries.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>MYSTERIES</Text>
              {mysteries.map(({ run, def }) => {
                if (!def) return null;
                const key = `m_${run.id}`;
                const open = !!expanded[key];
                const ready = run.stage >= def.stages.length;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{def.title}</Text>
                      <Text style={styles.stagePill}>
                        {ready ? 'READY' : `Stage ${run.stage + 1}/${def.stages.length}`}
                      </Text>
                    </View>
                    <Text style={styles.cardFaction}>{factionLabel(def.factionId)}</Text>
                    {!open && def.stages[run.stage] && !ready && (
                      <Text style={styles.cardBody}>{def.stages[run.stage]!.narration}</Text>
                    )}
                    {open && (
                      <View style={styles.expanded}>
                        <Text style={styles.expandedLabel}>Stages</Text>
                        {def.stages.map((s, i) => (
                          <Text
                            key={i}
                            style={[
                              styles.expandedStage,
                              i < run.stage && styles.expandedStageDone,
                              i === run.stage && !ready && styles.expandedStageCurrent,
                            ]}
                          >
                            {i < run.stage ? '✓ ' : i === run.stage && !ready ? '→ ' : '  '}
                            {s.narration}
                          </Text>
                        ))}
                        <Text style={styles.expandedLabel}>Reward</Text>
                        <Text style={styles.expandedBody}>
                          {def.rewardTc} TC{def.rewardRep ? ` · +${def.rewardRep} rep` : ''}
                        </Text>
                      </View>
                    )}
                    {open && ready && (
                      <Pressable
                        style={({ pressed }) => [styles.completeBtn, pressed && styles.completeBtnPressed]}
                        onPress={() => completeContractFromUI('mystery', def.id)}
                      >
                        <Text style={styles.completeBtnText}>COMPLETE — CLAIM REWARD</Text>
                      </Pressable>
                    )}
                    {open && (
                      <Pressable
                        style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                        onPress={() => abandonContract('mystery', def.id)}
                      >
                        <Text style={styles.abandonBtnText}>ABANDON</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {storylines.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>STORYLINES</Text>
              {storylines.map(({ run, def }) => {
                if (!def) return null;
                const key = `s_${run.id}`;
                const open = !!expanded[key];
                const ready = run.stage >= def.stages.length;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{def.title}</Text>
                      <Text style={styles.stagePill}>
                        {ready ? 'READY' : `Stage ${run.stage + 1}/${def.stages.length}`}
                      </Text>
                    </View>
                    <Text style={styles.cardFaction}>{factionLabel(def.factionId)}</Text>
                    {!open && def.stages[run.stage] && !ready && (
                      <Text style={styles.cardBody}>{def.stages[run.stage]!.narration}</Text>
                    )}
                    {open && (
                      <View style={styles.expanded}>
                        <Text style={styles.expandedLabel}>Chapters</Text>
                        {def.stages.map((s, i) => (
                          <Text
                            key={i}
                            style={[
                              styles.expandedStage,
                              i < run.stage && styles.expandedStageDone,
                              i === run.stage && !ready && styles.expandedStageCurrent,
                            ]}
                          >
                            {i < run.stage ? '✓ ' : i === run.stage && !ready ? '→ ' : '  '}
                            {s.narration}
                          </Text>
                        ))}
                        <Text style={styles.expandedLabel}>Reward</Text>
                        <Text style={styles.expandedBody}>
                          {def.rewardTc} TC · +{def.rewardRep} rep with {factionLabel(def.factionId)}
                        </Text>
                      </View>
                    )}
                    {open && ready && (
                      <Pressable
                        style={({ pressed }) => [styles.completeBtn, pressed && styles.completeBtnPressed]}
                        onPress={() => completeContractFromUI('storyline', def.id)}
                      >
                        <Text style={styles.completeBtnText}>COMPLETE — CLAIM REWARD</Text>
                      </Pressable>
                    )}
                    {open && (
                      <Pressable
                        style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                        onPress={() => abandonContract('storyline', def.id)}
                      >
                        <Text style={styles.abandonBtnText}>ABANDON</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {factionQuests.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FACTION QUESTS</Text>
              {factionQuests.map(({ rec, def }, i) => {
                if (!def) return null;
                const key = `q_${def.id}_${i}`;
                const open = !!expanded[key];
                const stageDef = def.stages?.[rec.stage];
                const readyToTurnIn =
                  (def.stages && def.stages.length > 0 && rec.stage >= def.stages.length) ||
                  !def.stages || def.stages.length === 0;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{def.title}</Text>
                      <Text style={styles.stagePill}>
                        {def.stages && def.stages.length > 0
                          ? readyToTurnIn
                            ? 'READY'
                            : `stage ${rec.stage + 1} / ${def.stages.length}`
                          : 'OPEN'}
                      </Text>
                    </View>
                    <Text style={styles.cardFaction}>{factionLabel(def.factionId)}</Text>
                    <Text style={styles.cardBody}>{def.objective}</Text>
                    {!readyToTurnIn && stageDef && !open && (
                      <>
                        <Text style={styles.cardStageLabel}>Next step</Text>
                        <Text style={styles.cardStageBody}>{stageDef.narration}</Text>
                        {stageDef.advanceOn && stageDef.advanceOn !== 'any' && (
                          <Text style={styles.cardStageHint}>
                            {stageDef.advanceOn === 'kill'
                              ? '→ Advance by defeating an enemy.'
                              : '→ Advance by traveling to a new location.'}
                          </Text>
                        )}
                      </>
                    )}
                    {open && (
                      <View style={styles.expanded}>
                        {def.stages && def.stages.length > 0 && (
                          <>
                            <Text style={styles.expandedLabel}>Stages</Text>
                            {def.stages.map((s, ix) => (
                              <Text
                                key={ix}
                                style={[
                                  styles.expandedStage,
                                  ix < rec.stage && styles.expandedStageDone,
                                  ix === rec.stage && !readyToTurnIn && styles.expandedStageCurrent,
                                ]}
                              >
                                {ix < rec.stage ? '✓ ' : ix === rec.stage && !readyToTurnIn ? '→ ' : '  '}
                                {s.narration}
                              </Text>
                            ))}
                          </>
                        )}
                        <Text style={styles.expandedLabel}>Reward</Text>
                        <Text style={styles.expandedBody}>
                          {def.reward.tc} TC · +{def.reward.rep} rep with {factionLabel(def.factionId)}
                        </Text>
                        <Text style={styles.expandedLabel}>How to finish</Text>
                        <Text style={styles.expandedBody}>
                          {readyToTurnIn
                            ? 'All steps cleared. Tap COMPLETE to claim the reward.'
                            : stageDef?.advanceOn === 'kill'
                              ? 'Defeat an enemy to advance the next stage.'
                              : stageDef?.advanceOn === 'travel'
                                ? 'Travel to a new location to advance the next stage.'
                                : 'Continue play — the next stage triggers on the matching event.'}
                        </Text>
                      </View>
                    )}
                    {open && def.factionId && (() => {
                      // OTA-458 — route-to-turn-in. Players kept losing the agent
                      // they need to hand a faction quest to. The home outpost holds
                      // the mission board + same-faction vendors, so it's always a
                      // valid turn-in point. Reuses the existing pendingRoute confirm
                      // modal (hub-aware travel).
                      const dest = startingLocationForFaction(def.factionId);
                      const destName = getLocationById(dest).name;
                      const here = player?.currentLocationId === dest;
                      if (here) {
                        return (
                          <Text style={styles.routeHereNote}>
                            ▸ You're at {destName} — turn in at the mission board or a same-faction agent.
                          </Text>
                        );
                      }
                      return (
                        <Pressable
                          style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                          onPress={() => setPendingRoute({ id: dest, name: destName })}
                        >
                          <Text style={styles.routeBtnText}>▸ ROUTE TO TURN-IN ({destName})</Text>
                        </Pressable>
                      );
                    })()}
                    {open && readyToTurnIn && (
                      <Pressable
                        style={({ pressed }) => [styles.completeBtn, pressed && styles.completeBtnPressed]}
                        onPress={() => completeContractFromUI('faction_quest', def.id)}
                      >
                        <Text style={styles.completeBtnText}>COMPLETE — CLAIM REWARD</Text>
                      </Pressable>
                    )}
                    {open && (
                      <Pressable
                        style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                        onPress={() => abandonContract('faction_quest', def.id)}
                      >
                        <Text style={styles.abandonBtnText}>ABANDON</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {whispers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>WHISPERS</Text>
              <Text style={styles.whispersBlurb}>
                Tips overheard from non-vendor NPCs. No formal contract,
                no faction rep — just rumour. Follow them or don't.
              </Text>
              {whispers.map(({ rec, title, stageDesc }) => {
                // OTA-465 — whisper objectives live on map tiles, so offer a
                // "set course" that walks the player there (the player kept
                // losing where to go for Yulka's discs).
                const route = whisperRouteTarget(rec);
                const here = !!route
                  && player?.mapX === route.mapX
                  && player?.mapY === route.mapY;
                return (
                  <View key={`w_${rec.id}`} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{title}</Text>
                      <Text style={styles.stagePill}>{rec.stage}</Text>
                    </View>
                    <Text style={styles.cardFaction}>Whisper · informal</Text>
                    <Text style={styles.cardStageLabel}>Next step</Text>
                    <Text style={styles.cardStageBody}>{stageDesc}</Text>
                    {route && !here && (
                      <Pressable
                        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                        onPress={() => {
                          setWhisperCourse(route.mapX, route.mapY, route.label);
                          setScreen('exploration');
                        }}
                      >
                        <Text style={styles.routeBtnText}>▸ SET COURSE TO {route.label.toUpperCase()}</Text>
                      </Pressable>
                    )}
                    {route && here && (
                      <Text style={styles.routeHereNote}>▸ You're here — {route.label} should be at this tile.</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {leads.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>LEADS</Text>
              <Text style={styles.whispersBlurb}>
                Tips picked up by investigating the world. No tracker,
                no objective marker — just the place and the deed. Go
                find it.
              </Text>
              {leads.map((q) => {
                const title = `${cap(q.objective.verb)} ${q.objective.target}`;
                const reward = (q.reward.amount != null && q.reward.amount > 0)
                  ? `${q.reward.amount} ${q.reward.type === 'currency' ? 'TC' : q.reward.type}`
                  : q.reward.label;
                const key = `lead_${q.id}`;
                const open = !!expanded[key];
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{title}</Text>
                      <Text style={styles.stagePill}>{q.state}</Text>
                    </View>
                    <Text style={styles.cardFaction}>Lead · {q.location.name}</Text>
                    {!open && (
                      <>
                        <Text style={styles.cardStageLabel}>Complication</Text>
                        <Text style={styles.cardStageBody}>{q.complication.text}</Text>
                      </>
                    )}
                    {open && (
                      <View style={styles.expanded}>
                        <Text style={styles.expandedLabel}>Objective</Text>
                        <Text style={styles.expandedBody}>{cap(q.objective.verb)} {q.objective.target} at {q.location.name}.</Text>
                        <Text style={styles.expandedLabel}>Complication</Text>
                        <Text style={styles.expandedBody}>{q.complication.text}</Text>
                        <Text style={styles.expandedLabel}>Reward</Text>
                        <Text style={styles.expandedBody}>{reward}</Text>
                        <Text style={styles.expandedLabel}>How to finish</Text>
                        <Text style={styles.expandedBody}>
                          Leads complete automatically when their target is killed (kill / slay / defeat / hunt / retrieve verbs). No turn-in needed — the reward lands the moment the deed is done. Use DISCARD to drop a lead you don't want to chase.
                        </Text>
                      </View>
                    )}
                    {open && (
                      <Pressable
                        style={({ pressed }) => [styles.discardBtn, pressed && styles.completeBtnPressed]}
                        onPress={() => discardLead(q.id)}
                      >
                        <Text style={styles.discardBtnText}>DISCARD LEAD</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
      </ScrollView>
      )}

      {/* 2026-05-24 — confirm modal for the new Capital tap-to-travel.
          Same shape as LoreCodexBody so the two paths feel identical. */}
      <Modal
        visible={pendingRoute !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingRoute(null)}
      >
        <View style={styles.routeScrim}>
          <View style={styles.routeCard}>
            <Text style={styles.routeTitle}>Set Course</Text>
            <View style={styles.routeRule} />
            <Text style={styles.routeBody}>
              Set course for {pendingRoute?.name}? The Arbiter will start
              charting tile-by-tile travel from your current position.
            </Text>
            <View style={styles.routeBtnRow}>
              <Pressable
                style={styles.routeBtnNeutral}
                onPress={() => setPendingRoute(null)}
              >
                <Text style={styles.routeBtnTextNeutral}>CANCEL</Text>
              </Pressable>
              <Pressable
                style={styles.routeBtnPrimary}
                onPress={() => {
                  if (!pendingRoute || !player) return;
                  const id = pendingRoute.id;
                  const name = pendingRoute.name;
                  setPendingRoute(null);
                  // 2026-05-25 OTA-035 — outpost-aware confirmation.
                  // Was a hard refusal ("leave the outpost first, then
                  // come back"); now a Yes/No prompt: confirm to leave
                  // the outpost + start the course, cancel to stay
                  // inside. Routes through the global
                  // pendingTravelConfirm flow so the typed
                  // `travel to <X>` parser path and the SET COURSE
                  // button surface the same modal.
                  if (player.hubRoomId) {
                    requestTravelConfirm(id, name);
                    setScreen('exploration');
                    return;
                  }
                  setTravelCourse(id);
                  setScreen('exploration');
                }}
              >
                <Text style={styles.routeBtnTextPrimary}>SET COURSE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// Capitalize a single word — used for the LEADS section titles
// ("retrieve a confused Aetherkin" → "Retrieve a confused Aetherkin").
function cap(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

// Collectibles tab — per-character story progress with expandable
// fragments. Tap a character card to expand; tap again to collapse.
// Found fragments show their full body; undiscovered fragments show
// the discovery hint as a teaser.
function CollectablesTab({ progress }: { progress: ReturnType<typeof computeAllProgress> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (CHARACTER_STORIES.length === 0) {
    return (
      <View style={styles.emptyInline}>
        <Text style={styles.emptyTitle}>No collectibles authored yet.</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CHARACTER STORIES</Text>
        <Text style={styles.collectIntro}>
          Notes, letters, and journal pages from ten people who walked Tartaria
          before you. Find every fragment to read each story end to end.
        </Text>
      </View>
      {progress.map(({ story, found, missing, fraction, complete }) => {
        const isOpen = openId === story.id;
        const pct = Math.round(fraction * 100);
        return (
          <View key={story.id} style={[styles.card, styles.collectCard]}>
            <TouchableOpacity
              onPress={() => setOpenId(isOpen ? null : story.id)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{story.characterName}</Text>
                <Text style={complete ? styles.completePill : styles.stagePill}>
                  {found.length}/{story.fragments.length}
                </Text>
              </View>
              <Text style={styles.cardFaction}>{story.characterBlurb}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
            </TouchableOpacity>
            {isOpen && (
              <View style={styles.fragmentList}>
                {story.fragments.map((frag) => {
                  const isFound = found.some((f) => f.id === frag.id);
                  return (
                    <View key={frag.id} style={styles.fragmentRow}>
                      <Text style={isFound ? styles.fragTitleFound : styles.fragTitleMissing}>
                        {isFound ? `${frag.title} (${frag.kind})` : `?? — ${frag.kind}`}
                      </Text>
                      {isFound ? (
                        <Text style={styles.fragBody}>{frag.body}</Text>
                      ) : (
                        <Text style={styles.fragHint}>{frag.discoveryHint}</Text>
                      )}
                    </View>
                  );
                })}
                {missing.length === 0 && (
                  <Text style={styles.completeBanner}>
                    ✦ Story complete — every fragment recovered.
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  // v2.4.1 (OTA 033) — Primary Objective card. Sits at the top of
  // the Contracts screen above the tab row. Warm-gold border to
  // signal the main quest visually distinct from the per-faction
  // contracts below.
  mainQuestCard: {
    backgroundColor: '#13110f',
    borderColor: '#c9a86a',
    borderWidth: 1.5,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
    position: 'relative',
  },
  // OTA-148 — SUMMON chip pinned to the top-right edge of the
  // PRIMARY OBJECTIVE card. Only renders when the player is in an
  // unrecovered Lost Capital with the main quest active. Tap calls
  // summonCoreGuardian() and bounces back to exploration.
  summonChip: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  summonChipText: {
    color: '#c9a86a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  mainQuestTag: {
    color: '#c9a86a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  mainQuestPhase: {
    color: '#e6d8b3',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  mainQuestHint: {
    color: '#cdbf99',
    fontSize: 12,
    lineHeight: 18,
  },
  mainQuestNextAction: {
    color: '#c9a86a',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    fontWeight: '600',
  },
  mainQuestChoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 6,
  },
  mainQuestChoiceBtn: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mainQuestChoiceText: {
    color: '#e6d8b3',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },
  mainQuestEnded: {
    color: '#7a705c',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 6,
  },
  // v2.4.1 (OTA 052) — 9-Capital tracker rendered when the PRIMARY
  // OBJECTIVE card is tapped open. One row per Capital with the
  // Core / Guardian status colored for fast read.
  mqTracker: {
    marginTop: 10,
    paddingTop: 8,
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
  },
  mqTrackerHead: {
    color: '#cdbf99',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  mqTrackerRow: {
    paddingVertical: 5,
    borderBottomColor: '#1a1714',
    borderBottomWidth: 1,
  },
  mqTrackerCap: { color: '#e6d8b3', fontSize: 12, fontWeight: '700' },
  mqTrackerStatus: { fontSize: 11, marginTop: 1 },
  mqTrackerGuardian: { color: '#7a705c', fontSize: 10, fontStyle: 'italic', marginTop: 1 },
  mqTrackerFoot: { color: '#7a705c', fontSize: 10, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },
  // 2026-05-24 — tap hint + confirm-modal styles for Capital
  // tap-to-travel. Visual language mirrors LoreCodexBody's modal.
  mqTrackerTap: { color: '#9ec96a', fontSize: 10, fontStyle: 'italic', letterSpacing: 1, marginTop: 2 },
  routeScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  routeCard: { width: '100%', maxWidth: 380, backgroundColor: '#13110f', borderColor: '#c9a86a', borderWidth: 1, borderRadius: 4, padding: 16 },
  routeTitle: { color: '#c9a86a', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  routeRule: { height: 1, backgroundColor: '#3a342c', marginTop: 6, marginBottom: 12 },
  routeBody: { color: '#e6d8b3', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  routeBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  routeBtnNeutral: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 3, borderWidth: 1, borderColor: '#3a342c', backgroundColor: 'transparent' },
  routeBtnPrimary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 3, borderWidth: 1, borderColor: '#c9a86a', backgroundColor: '#1a1714' },
  routeBtnTextNeutral: { color: '#cdbf99', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  routeBtnTextPrimary: { color: '#c9a86a', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  // v2.4.1 (OTA 052) — milestone cell tap-expand detail.
  milestoneDetail: {
    marginTop: 8,
    paddingTop: 6,
    paddingBottom: 4,
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
  },
  milestoneDetailHead: {
    color: '#cdbf99',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  milestoneDetailRow: {
    color: '#cdbf99',
    fontSize: 11,
    marginVertical: 1,
  },
  milestoneDetailEmpty: {
    color: '#7a705c',
    fontSize: 11,
    fontStyle: 'italic',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backBtn: {
    backgroundColor: '#1a1714',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    width: 80,
    alignItems: 'center',
  },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#e6d8b3', letterSpacing: 4, fontSize: 14 },
  placeholder: { color: '#7a705c', textAlign: 'center', marginTop: 80 },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyInline: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyTitle: { color: '#c9a86a', fontSize: 16, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  emptyBody: { color: '#cdbf99', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  emptySub: { color: '#7a705c', fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  section: { marginBottom: 14 },
  sectionTitle: {
    color: '#c9a86a',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomColor: '#3a342c',
    borderBottomWidth: 1,
  },
  card: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  cardTitle: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', flex: 1, marginRight: 8 },
  stagePill: {
    color: '#9ec96a',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '700',
    borderColor: '#3d5a2c',
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cardFaction: { color: '#7a705c', fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  cardLocation: { color: '#9ec96a', fontSize: 11, marginBottom: 4, letterSpacing: 0.5 },
  // 2026-05-26 OTA-055 — difficulty chip below location, color-coded
  // vs player state. Same green / amber / red traffic light the rest
  // of the game uses.
  difficultyChip: { fontSize: 11, marginBottom: 6, letterSpacing: 0.5, fontWeight: '700' },
  difficultyChipReady: { color: '#9ec96a' },
  difficultyChipMarginal: { color: '#c9a86a' },
  difficultyChipDangerous: { color: '#e07a5f' },
  cardBody: { color: '#cdbf99', fontSize: 12, lineHeight: 17 },
  cardHint: { color: '#c9a86a', fontSize: 11, fontStyle: 'italic', marginTop: 4, letterSpacing: 0.5 },
  cardStageLabel: { color: '#c9a86a', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginTop: 8, marginBottom: 2 },
  cardStageBody: { color: '#e6d8b3', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  whispersBlurb: { color: '#7a705c', fontSize: 11, fontStyle: 'italic', lineHeight: 15, marginBottom: 8 },
  cardStageHint: { color: '#9ec96a', fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  // OTA 020 — expanded contract card styles.
  expanded: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#3a342c' },
  expandedLabel: { color: '#7a705c', fontSize: 10, letterSpacing: 2, marginTop: 8, marginBottom: 2 },
  expandedBody: { color: '#cdbf99', fontSize: 12, lineHeight: 17 },
  expandedStage: { color: '#7a705c', fontSize: 11, lineHeight: 16, paddingLeft: 4, marginBottom: 2 },
  expandedStageHint: { color: '#c9a86a', fontSize: 10, fontStyle: 'italic', lineHeight: 14, paddingLeft: 4, marginBottom: 6, letterSpacing: 0.5 },
  expandedStageDone: { color: '#9ec96a', textDecorationLine: 'line-through' },
  expandedStageCurrent: { color: '#c9a86a', fontWeight: '700' },
  completeBtn: {
    marginTop: 10,
    backgroundColor: '#9ec96a',
    borderRadius: 3,
    paddingVertical: 10,
    alignItems: 'center',
  },
  completeBtnPressed: { opacity: 0.7 },
  completeBtnText: { color: '#13110f', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  // OTA-458 — ROUTE TO TURN-IN button. Outlined parchment-blue, distinct from
  // the filled-green COMPLETE and the warning-red ABANDON; sits above both.
  routeBtn: {
    marginTop: 10,
    backgroundColor: 'transparent',
    borderColor: '#6f93c4',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 9,
    alignItems: 'center',
  },
  routeBtnPressed: { opacity: 0.7 },
  routeBtnText: { color: '#9ec0ef', fontWeight: '700', letterSpacing: 1, fontSize: 11 },
  routeHereNote: { marginTop: 10, color: '#9ec96a', fontSize: 11, fontStyle: 'italic' },
  // 2026-05-26 OTA-054 — ABANDON button. Ghost/outlined style with
  // a warning border, distinct from the filled-amber COMPLETE.
  abandonBtn: {
    marginTop: 6,
    backgroundColor: 'transparent',
    borderColor: '#e07a5f',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 8,
    alignItems: 'center',
  },
  abandonBtnPressed: { opacity: 0.7 },
  abandonBtnText: { color: '#e07a5f', fontWeight: '700', letterSpacing: 2, fontSize: 11 },
  discardBtn: {
    marginTop: 10,
    backgroundColor: 'transparent',
    borderColor: '#7a705c',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 10,
    alignItems: 'center',
  },
  discardBtnText: { color: '#7a705c', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  milestoneRow: { flexDirection: 'row', backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, padding: 10 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
  },
  tabBtnActive: { borderBottomColor: '#c9a86a' },
  tabBtnText: { color: '#7a705c', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  tabBtnTextActive: { color: '#c9a86a' },
  collectIntro: { color: '#cdbf99', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  collectCard: { marginBottom: 8 },
  completePill: {
    color: '#13110f',
    backgroundColor: '#9ec96a',
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: '800',
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#1a1714',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#c9a86a' },
  fragmentList: { marginTop: 10, gap: 8 },
  fragmentRow: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    padding: 8,
  },
  fragTitleFound: { color: '#c9a86a', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  fragTitleMissing: { color: '#c9a86a', fontSize: 11, fontWeight: '700', letterSpacing: 1, fontStyle: 'italic', marginBottom: 4 },
  fragBody: { color: '#e6d8b3', fontSize: 12, lineHeight: 17 },
  fragHint: { color: '#7a705c', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  completeBanner: { color: '#9ec96a', fontSize: 11, letterSpacing: 1, fontWeight: '700', marginTop: 4 },
});
