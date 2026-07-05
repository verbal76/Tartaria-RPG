import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Modal, Dimensions } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { findHuntById, getHunts, checkKindLabel, biomeLabel, stageTypeLabel, weaponRarityMeets } from '../engine/hunts';
import { getItemPreview } from '../components/itemPreview';
import { findMysteryById, getMysteries } from '../engine/mysteries';
import { findStorylineById, getStorylines } from '../engine/factionStorylines';
import { findFactionQuestById, getFactionQuests, factionQuestReady } from '../engine/factionQuests';
import { findFaction } from '../engine/factions';
import { startingLocationForFaction } from '../engine/character';
import { getLocationById } from '../engine/encounter';
import { missionObjectiveLocationId } from '../engine/missionRouting';
import { computeAllProgress, getCharacterStories, allFragments } from '../engine/collectables';
import { describeWhisperStage, describeWhisperTitle, findChain, whisperRouteTarget } from '../engine/whispers';
import { questionMarkerNumbers, mentionIdForLabel } from '../engine/questionMarkers';
import { openContractMarkers } from '../engine/contractMarkers';
import { missionLegs } from '../engine/broker';
import { carriedSigils } from '../engine/sigils';

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
  cellActive: { borderColor: '#6ab0c9', backgroundColor: '#131c1f' },
  value: { color: '#6ab0c9', fontSize: 18, fontWeight: '700' },
  label: { color: '#bcd2db', fontSize: 11, letterSpacing: 1 },
  next: { color: '#6c8088', fontSize: 9, marginTop: 2, textAlign: 'center' },
  tapHint: { color: '#5a5448', fontSize: 8, marginTop: 1, letterSpacing: 1 },
});

function factionLabel(factionId: string | null | undefined): string {
  if (!factionId) return 'Unaffiliated';
  const f = findFaction(factionId);
  return f?.name ?? factionId.replace(/_/g, ' ');
}

function safeLocName(id: string): string {
  try { return getLocationById(id).name ?? id; } catch { return id; }
}

type Tab = 'contracts' | 'collectables';

export function ContractsScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  const completeContractFromUI = useGameStore((s) => s.completeContractFromUI);
  const abandonContract = useGameStore((s) => s.abandonContract);
  const setFactionQuestActive = useGameStore((s) => s.setFactionQuestActive);
  const setContractActive = useGameStore((s) => s.setContractActive);
  const setMainQuestActive = useGameStore((s) => s.setMainQuestActive);
  const routeMission = useGameStore((s) => s.routeMission);
  const discardLead = useGameStore((s) => s.discardLead);
  const turnInSigil = useGameStore((s) => s.turnInSigil);
  // 2026-05-24 — tap-to-travel from the Primary Objective expansion.
  // Mirrors the Lore→Places confirm modal pattern in LoreCodexBody.
  const setTravelCourse = useGameStore((s) => s.setTravelCourse);
  const requestTravelConfirm = useGameStore((s) => s.requestTravelConfirm);
  const setWhisperCourse = useGameStore((s) => s.setWhisperCourse);
  const appendLog = useGameStore((s) => s.appendLog);
  const [pendingRoute, setPendingRoute] = useState<{ id: string; name: string; missionId?: string } | null>(null);
  // 2026-05-25 — branded refusal modal for hub-room gate. Same
  // palette as the rest of the game; replaces native Alert.alert.
  const [tab, setTab] = useState<Tab>('contracts');
  // OTA-606 — honor a deep-link tab request (e.g. the first-collectible popup
  // wants the Collectibles tab, not the default Contracts tab). Apply it once
  // on entry, then clear it so a later normal open lands on the default.
  const pendingContractsTab = useGameStore((s) => s.pendingContractsTab);
  const clearPendingContractsTab = useGameStore((s) => s.clearPendingContractsTab);
  useEffect(() => {
    if (pendingContractsTab) {
      setTab(pendingContractsTab);
      clearPendingContractsTab();
    }
  }, [pendingContractsTab, clearPendingContractsTab]);
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
  const currentScene = useGameStore((s) => s.currentScene);
  // arb99 — same "?" numbering the atlas + map rows use, so a whisper's SET COURSE
  // block here shows the same number as its mark on the map.
  const questionNumbers = questionMarkerNumbers(worldMemory);

  // arb100 — open-contract pins: key (`${family}:${id}`) → its atlas number +
  // routable anchor, so each card can carry the same "N◆" its map pin shows and
  // offer a route to its anchor place.
  const contractMarkerByKey: Record<string, { number: number; anchorId: string; anchorName: string }> = {};
  for (const cm of openContractMarkers(player)) {
    let anchorName = cm.anchorId;
    try { anchorName = getLocationById(cm.anchorId).name ?? cm.anchorId; } catch { /* keep id */ }
    contractMarkerByKey[cm.key] = { number: cm.number, anchorId: cm.anchorId, anchorName };
  }
  // Translate a card's local toggle key (`h_`/`m_`/`s_`/`q_…_i`/`lead_`) to the
  // contract-marker key (`hunt:`/`mystery:`/`storyline:`/`faction:`/`lead:`) so the
  // same badge/route call works inline at every card.
  const toContractKey = (toggleKey: string): string | null => {
    if (toggleKey.startsWith('h_')) return `hunt:${toggleKey.slice(2)}`;
    if (toggleKey.startsWith('m_')) return `mystery:${toggleKey.slice(2)}`;
    if (toggleKey.startsWith('s_')) return `storyline:${toggleKey.slice(2)}`;
    if (toggleKey.startsWith('lead_')) return `lead:${toggleKey.slice(5)}`;
    if (toggleKey.startsWith('q_')) {
      const rest = toggleKey.slice(2); // q_<defId>_<stageIndex> → strip the index
      const cut = rest.lastIndexOf('_');
      return `faction:${cut >= 0 ? rest.slice(0, cut) : rest}`;
    }
    return null;
  };
  const contractBadge = (toggleKey: string) => {
    const ck = toContractKey(toggleKey);
    const info = ck ? contractMarkerByKey[ck] : undefined;
    return info ? <Text style={styles.contractBadge}>{info.number}◆ </Text> : null;
  };
  const contractRoute = (toggleKey: string) => {
    const ck = toContractKey(toggleKey);
    const info = ck ? contractMarkerByKey[ck] : undefined;
    if (!info) return null;
    if (player?.currentLocationId === info.anchorId) {
      return <Text style={styles.routeHereNote}>▸ {info.number}◆ You're at {info.anchorName}.</Text>;
    }
    return (
      <Pressable
        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
        onPress={() => setPendingRoute({ id: info.anchorId, name: info.anchorName })}
      >
        <Text style={styles.routeBtnText}>▸ {info.number}◆ ROUTE TO {info.anchorName.toUpperCase()}</Text>
      </Pressable>
    );
  };
  // Uniform ACTIVATE / DEACTIVATE (pause) toggle for any contract kind, mirroring
  // the faction-quest button. `tracked` = currently active. Deactivating parks the
  // contract (⏸ PAUSED) without dropping it; ABANDON is the separate destructive drop.
  const trackToggle = (
    kind: 'hunt' | 'mystery' | 'storyline' | 'whisper' | 'lead' | 'broker',
    id: string,
    tracked: boolean,
  ) => (
    <Pressable
      style={({ pressed }) => [styles.trackBtn, !tracked && styles.trackBtnOff, pressed && styles.trackBtnPressed]}
      onPress={() => setContractActive(kind, id, !tracked)}
    >
      <Text style={[styles.trackBtnText, !tracked && styles.trackBtnTextOff]}>
        {tracked ? '▮▮ DEACTIVATE' : '▶ SET ACTIVE'}
      </Text>
    </Pressable>
  );

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
  const factionQuestRecords: NonNullable<typeof player.activeFactionQuests> =
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

  // Parley of Factions (broker) — the two-relic alliance mission. Previously it
  // lived only in the log + as grid "?" markers, so a player who wandered into it
  // (or parleyed once) had a live mission with NO card here — "I don't even think
  // that mission is on my list." Now it's a first-class, trackable contract like
  // the rest: both demanded relics, their source tiles, in-hand progress, a SET
  // COURSE to each unmet relic, and the SEAL step at the Parley Ground.
  const brokerMission =
    player.brokerMission && !player.brokerMission.done ? player.brokerMission : null;
  const brokerLegs = brokerMission ? (missionLegs(brokerMission) ?? []) : [];
  const hasRelic = (name: string) =>
    (player.inventory ?? []).some((i) => i.name === name && (i.quantity ?? 1) > 0);
  const brokerReady = brokerLegs.length > 0 && brokerLegs.every((l) => hasRelic(l.itemName));

  const totalActive =
    hunts.length + mysteries.length + storylines.length + factionQuests.length + whispers.length + leads.length
    + (brokerMission ? 1 : 0);

  // Lifetime milestone counters — surfaced here so players have a single
  // place to see progress toward stat bumps (every 10 checks succeeded
  // → +1 stat, every 5 enemies defeated → +1 HP max, every 5 travels
  // → +1 stamina max).
  const ms = player.milestones ?? { enemiesDefeated: 0, travelsCompleted: 0, checksSucceeded: 0 };

  const progress = computeAllProgress(player.collectables ?? []);
  const totalFragmentsFound = progress.reduce((acc, p) => acc + p.found.length, 0);
  const totalFragments = allFragments().length;

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
        // engine_Dev — the Primary Objective card mirrors the exploration chip: a
        // DATA-DRIVEN main quest (uploaded) drives it; a re-skin with no custom quest
        // shows a neutral line; only the genuine built-in game shows the Tartaria
        // cores/capitals card below. (Without this the card leaked Tartaria into every
        // re-skin — "the primary objective is all still tartaria".)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const cmq = require('../engine/customMainQuest') as typeof import('../engine/customMainQuest');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const cmqe = require('../engine/customMainQuestEngine') as typeof import('../engine/customMainQuestEngine');
        const customQ = cmq.liveMainQuest();
        if (customQ) {
          const complete = cmqe.questIsComplete(player);
          const total = customQ.steps.length;
          const activeIdx = cmqe.effectiveStepIndex(player);
          const done = Math.max(0, Math.min(activeIdx, total));
          const title = (customQ.title ?? 'Main quest').trim() || 'Main quest';
          const objLine = complete ? 'Complete.' : (cmqe.currentObjectiveLine(player) ?? 'No active objective.');
          // engine_Dev — restore the tap-to-expand ROUTE TO drop-down for the
          // DATA-DRIVEN main quest. The custom-quest card had regressed to a static
          // View (no expansion, no route buttons); mirror the built-in Capitals
          // tracker so each objective with a location offers a travel course.
          // id → name honors an uploaded Locations table.
          const locNameById = new Map(cmq.mainQuestLocations().map((l) => [l.id, l.name] as const));
          // engine_Dev — SUMMON chip for the active KILL step. The kill-step boss
          // auto-spawns on arrival, but a death-revive / scene rebuild clears it; the
          // chip lets the player re-engage from here (the same affordance the old
          // built-in Core-Guardian SUMMON gave, now pointed at the data-driven boss).
          // Show only while STANDING at the boss's location with no copy already in
          // the scene; the summon action re-checks the same preconditions.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { WORLD_MAP_CENTER_X: scx, WORLD_MAP_CENTER_Y: scy } = require('../engine/worldMap');
          const stationedHere = !player.travelTarget
            && (player.hubRoomId != null || (player.mapX === scx && player.mapY === scy));
          const bossHere = !complete && stationedHere ? cmqe.questBossAt(player, player.currentLocationId) : null;
          const bossInScene = !!bossHere && (currentScene?.enemies ?? []).some(
            (e) => e.name.trim().toLowerCase() === bossHere.name.trim().toLowerCase(),
          );
          const canSummonBoss = !!bossHere && !bossInScene;
          const storyActive = player.mainQuestActive !== false;
          return (
            <TouchableOpacity
              style={styles.mainQuestCard}
              onPress={() => setMqExpanded((v) => !v)}
              activeOpacity={0.85}
            >
              <Text style={styles.mainQuestTag}>STORYLINE MISSION — {title.toUpperCase()}  {mqExpanded ? '▴' : '▾'}</Text>
              <Text style={styles.mainQuestHint}>{objLine}  ·  {done}/{total} parts</Text>
              {/* engine_Dev — single-active toggle for the storyline (peer of the
                  contract toggles). Activating it stands every contract down; off just
                  unfocuses it — the story keeps advancing either way. Nested Pressable
                  handles its own tap so it doesn't expand/collapse the card. */}
              <Pressable
                style={[styles.trackBtn, { marginTop: 8 }, !storyActive && styles.trackBtnOff]}
                onPress={() => setMainQuestActive(!storyActive)}
              >
                <Text style={[styles.trackBtnText, !storyActive && styles.trackBtnTextOff]}>
                  {storyActive ? '▮▮ DEACTIVATE — unfocus the storyline' : '▶ SET ACTIVE — make the storyline the mission you’re on'}
                </Text>
              </Pressable>
              {canSummonBoss && (
                <TouchableOpacity
                  style={styles.summonChip}
                  onPress={() => useGameStore.getState().summonMainQuestBoss()}
                  activeOpacity={0.7}
                  hitSlop={6}
                >
                  <Text style={styles.summonChipText}>★ SUMMON {bossHere.name.toUpperCase()}</Text>
                </TouchableOpacity>
              )}
              {mqExpanded && (
                <View style={styles.mqTracker}>
                  <Text style={styles.mqTrackerHead}>
                    {total} OBJECTIVES · STEP {Math.min(activeIdx + 1, total)}/{total}
                  </Text>
                  <ScrollView style={styles.mqTrackerScroll} nestedScrollEnabled>
                    {customQ.steps.map((step, i) => {
                      // Skip steps gated out for this player's faction — the engine
                      // skips them too, so they aren't objectives this character has.
                      if (!cmqe.stepApplies(step, player)) return null;
                      const locId = step.locationId;
                      const lName = locId ? (locNameById.get(locId) ?? locId) : null;
                      const isActive = i === activeIdx && !complete;
                      const isDone = complete || i < activeIdx;
                      const here = !!locId && player.currentLocationId === locId;
                      const color = isDone ? '#7a8a5a' : isActive ? '#6ab0c9' : '#6c8088';
                      const status = isDone ? '✓ done' : isActive ? '○ current objective' : '· upcoming';
                      const rowContent = (
                        <>
                          <Text style={styles.mqTrackerCap}>{i + 1}. {cmq.describeStep(step)}</Text>
                          <Text style={[styles.mqTrackerStatus, { color }]}>{status}</Text>
                          {locId && (here
                            ? <Text style={styles.routeHereNote}>▸ You're at {lName}.</Text>
                            : <Text style={styles.mqTrackerTap}>▸ tap to travel to {lName}</Text>
                          )}
                        </>
                      );
                      if (!locId || here) {
                        return <View key={step.id ?? `step${i}`} style={styles.mqTrackerRow}>{rowContent}</View>;
                      }
                      return (
                        <TouchableOpacity
                          key={step.id ?? `step${i}`}
                          style={styles.mqTrackerRow}
                          activeOpacity={0.7}
                          onPress={() => setPendingRoute({ id: locId, name: lName ?? locId })}
                        >
                          {rowContent}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.mqTrackerFoot}>
                    Tap any objective with a location to start travel.
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }
        // engine_Dev — no data-driven quest loaded (built-in Tartaria main quest
        // was removed): show a neutral card pointing the author at the dev console.
        return (
          <View style={styles.mainQuestCard}>
            <Text style={styles.mainQuestTag}>PRIMARY OBJECTIVE</Text>
            <Text style={styles.mainQuestHint}>No main quest set — build one in the dev console.</Text>
          </View>
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
                <Text style={styles.milestoneDetailEmpty}>No kills yet.</Text>
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
              {getHunts().length} hunts · {getMysteries().length} mysteries ·
              {' '}{getStorylines().length} storylines · {getFactionQuests().length} faction quests
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
                const tracked = run.tracked !== false;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{contractBadge(key)}{def.title}</Text>
                      <Text style={[styles.stagePill, !tracked && styles.stagePillPaused]}>
                        {!tracked ? '⏸ PAUSED' : ready ? 'READY' : `Stage ${run.stage + 1}/${def.stages.length}`}
                      </Text>
                    </View>
                    {contractRoute(key)}
                    {trackToggle('hunt', def.id, tracked)}
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
                const tracked = run.tracked !== false;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{contractBadge(key)}{def.title}</Text>
                      <Text style={[styles.stagePill, !tracked && styles.stagePillPaused]}>
                        {!tracked ? '⏸ PAUSED' : ready ? 'READY' : `Stage ${run.stage + 1}/${def.stages.length}`}
                      </Text>
                    </View>
                    {contractRoute(key)}
                    {trackToggle('mystery', def.id, tracked)}
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
                const tracked = run.tracked !== false;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{contractBadge(key)}{def.title}</Text>
                      <Text style={[styles.stagePill, !tracked && styles.stagePillPaused]}>
                        {!tracked ? '⏸ PAUSED' : ready ? 'READY' : `Stage ${run.stage + 1}/${def.stages.length}`}
                      </Text>
                    </View>
                    {contractRoute(key)}
                    {trackToggle('storyline', def.id, tracked)}
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
                // arb171 — real readiness across ALL quest types: staged → all
                // stages played; FETCH → the items are in hand; legacy → always.
                // (The old code hard-coded fetch/legacy as ready and the pill as
                // "OPEN" forever, so a gather quest read "open" even when done.)
                const countItem = (name: string) =>
                  (player?.inventory ?? [])
                    .filter((it) => it.name.toLowerCase() === name.toLowerCase())
                    .reduce((n, it) => n + (it.quantity ?? 1), 0);
                const readyToTurnIn = factionQuestReady(def, rec.stage, countItem);
                const staged = !!(def.stages && def.stages.length > 0);
                const fetchHeld = def.fetch ? countItem(def.fetch.itemName) : 0;
                // ACTIVE vs PAUSED. A deactivated contract is parked — its stages
                // don't advance and its escort party (if any) stands down. tracked
                // absent/true = active (back-compat with pre-toggle saves).
                const tracked = rec.tracked !== false;
                const escortParty = rec.escort && rec.escort.hp > 0 ? rec.escort : null;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{contractBadge(key)}{def.title}</Text>
                      <Text style={[styles.stagePill, readyToTurnIn && styles.stagePillReady, !tracked && styles.stagePillPaused]}>
                        {!tracked
                          ? '⏸ PAUSED'
                          : readyToTurnIn
                            ? 'READY TO SUBMIT'
                            : staged
                              ? `stage ${rec.stage + 1} / ${def.stages!.length}`
                              : def.fetch
                                ? `${fetchHeld} / ${def.fetch.quantity}`
                                : 'ACTIVE'}
                      </Text>
                    </View>
                    {/* Activate / deactivate. Deactivating parks the contract: its
                        stages stop advancing and an escort party stands down (off the
                        HUD, no combat damage) so escortees don't trail you onto
                        unrelated missions. Re-activate to resume. */}
                    <Pressable
                      style={({ pressed }) => [styles.trackBtn, !tracked && styles.trackBtnOff, pressed && styles.trackBtnPressed]}
                      onPress={() => setFactionQuestActive(def.id, !tracked)}
                    >
                      <Text style={[styles.trackBtnText, !tracked && styles.trackBtnTextOff]}>
                        {tracked
                          ? (escortParty ? `▮▮ DEACTIVATE (stand down your ${escortParty.label})` : '▮▮ DEACTIVATE')
                          : (escortParty ? `▶ SET ACTIVE (recall your ${escortParty.label})` : '▶ SET ACTIVE — the mission you’re on')}
                      </Text>
                    </Pressable>
                    {/* OTA-907 — mission-aware ROUTE TO. Routes to the OBJECTIVE
                        (derived from the mission text, or the turn-in home if the
                        work is already done), then auto-chains to the turn-in once
                        the objective is complete. Shows live route status while the
                        chain is active, and a "you're here" note when already on the
                        target tile. Tapping opens the same "Set course?" prompt. */}
                    {(() => {
                      const home = startingLocationForFaction(def.factionId);
                      const objId = readyToTurnIn ? home : (missionObjectiveLocationId(def) ?? home);
                      let objName = objId;
                      try { objName = getLocationById(objId).name ?? objId; } catch { /* keep id */ }
                      const routed = player?.routedMission?.id === def.id;
                      const here = player?.currentLocationId === objId;
                      if (routed) {
                        const phase = player?.routedMission?.phase;
                        return (
                          <Text style={styles.routeHereNote}>
                            ▸ Auto-routing — {phase === 'to_turnin' ? `turn in at ${objName}` : `objective: ${objName}`}. Keep traveling; it chains to turn-in.
                          </Text>
                        );
                      }
                      if (here) {
                        return (
                          <Text style={styles.routeHereNote}>
                            ▸ You're at {objName}{readyToTurnIn ? ' — hand it in here.' : ' — the objective. Do the work; it then routes you to turn-in.'}
                          </Text>
                        );
                      }
                      return (
                        <Pressable
                          style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                          onPress={() => setPendingRoute({ id: objId, name: objName, missionId: def.id })}
                        >
                          <Text style={styles.routeBtnText}>
                            ▸ {readyToTurnIn ? `ROUTE TO TURN-IN (${objName.toUpperCase()})` : `ROUTE TO ${objName.toUpperCase()}`}
                          </Text>
                        </Pressable>
                      );
                    })()}
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
                            ? 'Work done. Travel to a same-faction agent or the mission board to hand it in for FULL reward (it submits on arrival), or COMPLETE here to courier it for HALF.'
                            : def.fetch
                              ? `Gather ${def.fetch.quantity}× ${def.fetch.itemName} — you have ${fetchHeld}. Then turn it in.`
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
                      // arb100 — the faction quest's pin sits on this same home
                      // outpost, so prefix the turn-in route with its number.
                      const fNum = contractMarkerByKey[`faction:${def.id}`]?.number;
                      if (here) {
                        return (
                          <Text style={styles.routeHereNote}>
                            ▸ {fNum ? `${fNum}◆ ` : ''}You're at {destName} — turn in at the mission board or a same-faction agent.
                          </Text>
                        );
                      }
                      return (
                        <Pressable
                          style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                          onPress={() => setPendingRoute({ id: dest, name: destName })}
                        >
                          <Text style={styles.routeBtnText}>▸ {fNum ? `${fNum}◆ ` : ''}ROUTE TO TURN-IN ({destName})</Text>
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

          {brokerMission && brokerLegs.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ALLIANCE</Text>
              <Text style={styles.whispersBlurb}>
                A parley you opened on neutral ground. Recover each faction's
                demanded relic, then return to the Parley Ground and SEAL THE
                ALLIANCE.
              </Text>
              <View style={[styles.card, brokerMission.paused && styles.cardPaused]}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Broker an Alliance</Text>
                  <Text style={[styles.stagePill, brokerMission.paused && styles.stagePillPaused]}>
                    {brokerMission.paused
                      ? '⏸ PAUSED'
                      : `${brokerLegs.filter((l) => hasRelic(l.itemName)).length}/${brokerLegs.length}`}
                  </Text>
                </View>
                <Text style={styles.cardFaction}>Parley of Factions · neutral ground</Text>
                {brokerLegs.map((l) => {
                  const inHand = hasRelic(l.itemName);
                  const here =
                    player?.currentLocationId === l.tileId;
                  return (
                    <View key={`broker_${l.factionId}`} style={{ marginTop: 8 }}>
                      <Text style={styles.cardStageLabel}>{l.factionName}</Text>
                      <Text style={styles.cardStageBody}>
                        {inHand
                          ? `✓ ${l.itemName} — in hand.`
                          : `○ ${l.itemName} — recover it at ${safeLocName(l.tileId)}.`}
                      </Text>
                      {!inHand && !here && (
                        <Pressable
                          style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                          onPress={() => setPendingRoute({ id: l.tileId, name: safeLocName(l.tileId) })}
                        >
                          <Text style={styles.routeBtnText}>▸ SET COURSE TO {safeLocName(l.tileId).toUpperCase()}</Text>
                        </Pressable>
                      )}
                      {!inHand && here && (
                        <Text style={styles.routeHereNote}>▸ You're here — recover the {l.itemName}.</Text>
                      )}
                    </View>
                  );
                })}
                <Text style={[styles.cardStageLabel, { marginTop: 10 }]}>How to finish</Text>
                <Text style={styles.cardStageBody}>
                  {brokerReady
                    ? 'Both relics in hand. Return to the Parley Ground and SEAL THE ALLIANCE.'
                    : 'Bring both relics to the Parley Ground, then SEAL THE ALLIANCE.'}
                </Text>
                {player?.currentLocationId !== 'parley_ground' && (
                  <Pressable
                    style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                    onPress={() => setPendingRoute({ id: 'parley_ground', name: safeLocName('parley_ground') })}
                  >
                    <Text style={styles.routeBtnText}>▸ SET COURSE TO {safeLocName('parley_ground').toUpperCase()}</Text>
                  </Pressable>
                )}
                {trackToggle('broker', 'broker', !brokerMission.paused)}
                <Pressable
                  style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                  onPress={() => abandonContract('broker', 'broker')}
                >
                  <Text style={styles.abandonBtnText}>ABANDON</Text>
                </Pressable>
              </View>
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
                // arb99 — if this objective is plotted as a numbered "?" on the
                // atlas, lead the SET COURSE block with the same number.
                const qNum = route ? questionNumbers[mentionIdForLabel(route.label)] : undefined;
                const tracked = rec.tracked !== false;
                return (
                  <View key={`w_${rec.id}`} style={[styles.card, !tracked && styles.cardPaused]}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{title}</Text>
                      <Text style={[styles.stagePill, !tracked && styles.stagePillPaused]}>{!tracked ? '⏸ PAUSED' : rec.stage}</Text>
                    </View>
                    <Text style={styles.cardFaction}>Whisper · informal</Text>
                    <Text style={styles.cardStageLabel}>Next step</Text>
                    <Text style={styles.cardStageBody}>{stageDesc}</Text>
                    {route && !here && tracked && (
                      <Pressable
                        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                        onPress={() => {
                          setWhisperCourse(route.mapX, route.mapY, route.label);
                          setScreen('exploration');
                        }}
                      >
                        <Text style={styles.routeBtnText}>▸ {qNum ? `${qNum}? ` : ''}SET COURSE TO {route.label.toUpperCase()}</Text>
                      </Pressable>
                    )}
                    {route && here && (
                      <Text style={styles.routeHereNote}>▸ You're here — {route.label} should be at this tile.</Text>
                    )}
                    {trackToggle('whisper', rec.id, tracked)}
                    <Pressable
                      style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                      onPress={() => abandonContract('whisper', rec.id)}
                    >
                      <Text style={styles.abandonBtnText}>ABANDON</Text>
                    </Pressable>
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
                const tracked = q.tracked !== false;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{contractBadge(key)}{title}</Text>
                      <Text style={[styles.stagePill, !tracked && styles.stagePillPaused]}>{!tracked ? '⏸ PAUSED' : q.state}</Text>
                    </View>
                    <Text style={styles.cardFaction}>Lead · {q.location.name}</Text>
                    {contractRoute(key)}
                    {trackToggle('lead', q.id, tracked)}
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

          {/* OTA-983 — CARRIED SIGILS. A slain faction member's crest, returnable to
              that faction's stake to honor their dead (+1 standing). Auto-routable. */}
          {player && carriedSigils(player.inventory).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>SIGILS</Text>
              <Text style={styles.whispersBlurb}>
                Crests taken off the fallen. Carry each back to its faction's stake
                and lay it down among their own — they honor the dead you bring home.
              </Text>
              {carriedSigils(player.inventory).map((sg) => {
                const here = player.currentLocationId === sg.tileId;
                const qty = sg.item.quantity > 1 ? ` ×${sg.item.quantity}` : '';
                return (
                  <View key={`sigil_${sg.item.id}`} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{sg.item.name}{qty}</Text>
                      <Text style={styles.stagePill}>+1</Text>
                    </View>
                    <Text style={styles.cardFaction}>{sg.factionName} · honor their dead</Text>
                    <Text style={styles.cardStageBody}>
                      {here
                        ? `You're at ${safeLocName(sg.tileId)}. Lay the sigil down among their own.`
                        : `○ Return it at ${safeLocName(sg.tileId)} for +1 ${sg.factionName} standing.`}
                    </Text>
                    {here ? (
                      <Pressable
                        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                        onPress={() => turnInSigil(sg.item.id)}
                      >
                        <Text style={styles.routeBtnText}>▸ RETURN THE SIGIL (+1 {sg.factionName.toUpperCase()})</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                        onPress={() => setPendingRoute({ id: sg.tileId, name: safeLocName(sg.tileId) })}
                      >
                        <Text style={styles.routeBtnText}>▸ SET COURSE TO {safeLocName(sg.tileId).toUpperCase()}</Text>
                      </Pressable>
                    )}
                  </View>
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
                  const missionId = pendingRoute.missionId;
                  setPendingRoute(null);
                  // OTA-907 — a mission route starts the auto-chain (objective →
                  // turn-in) rather than a one-shot course.
                  if (missionId) {
                    routeMission(missionId);
                    setScreen('exploration');
                    return;
                  }
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
  if (getCharacterStories().length === 0) {
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
    backgroundColor: '#0e1618',
    borderColor: '#6ab0c9',
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
    backgroundColor: '#131c1f',
    borderColor: '#6ab0c9',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  summonChipText: {
    color: '#6ab0c9',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  mainQuestTag: {
    color: '#6ab0c9',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  mainQuestPhase: {
    color: '#d6e4e8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  mainQuestHint: {
    color: '#bcd2db',
    fontSize: 12,
    lineHeight: 18,
  },
  mainQuestNextAction: {
    color: '#6ab0c9',
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
    backgroundColor: '#131c1f',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mainQuestChoiceText: {
    color: '#d6e4e8',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },
  mainQuestEnded: {
    color: '#6c8088',
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
    borderTopColor: '#2b3a3e',
    borderTopWidth: 1,
  },
  // arb148 — cap the expanded Capital list to ~42% of the screen and scroll it
  // internally so the 9th row never falls off the bottom of the fixed card.
  mqTrackerScroll: {
    maxHeight: Math.round(Dimensions.get('window').height * 0.42),
  },
  mqTrackerHead: {
    color: '#bcd2db',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  mqTrackerRow: {
    paddingVertical: 5,
    borderBottomColor: '#131c1f',
    borderBottomWidth: 1,
  },
  mqTrackerCap: { color: '#d6e4e8', fontSize: 12, fontWeight: '700' },
  mqTrackerStatus: { fontSize: 11, marginTop: 1 },
  mqTrackerGuardian: { color: '#6c8088', fontSize: 10, fontStyle: 'italic', marginTop: 1 },
  mqTrackerFoot: { color: '#6c8088', fontSize: 10, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },
  // 2026-05-24 — tap hint + confirm-modal styles for Capital
  // tap-to-travel. Visual language mirrors LoreCodexBody's modal.
  mqTrackerTap: { color: '#9ec96a', fontSize: 10, fontStyle: 'italic', letterSpacing: 1, marginTop: 2 },
  routeScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  routeCard: { width: '100%', maxWidth: 380, backgroundColor: '#0e1618', borderColor: '#6ab0c9', borderWidth: 1, borderRadius: 4, padding: 16 },
  routeTitle: { color: '#6ab0c9', fontSize: 14, fontWeight: '800', letterSpacing: 4 },
  routeRule: { height: 1, backgroundColor: '#2b3a3e', marginTop: 6, marginBottom: 12 },
  routeBody: { color: '#d6e4e8', fontSize: 13, lineHeight: 18, marginBottom: 16 },
  routeBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  routeBtnNeutral: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 3, borderWidth: 1, borderColor: '#2b3a3e', backgroundColor: 'transparent' },
  routeBtnPrimary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 3, borderWidth: 1, borderColor: '#6ab0c9', backgroundColor: '#131c1f' },
  routeBtnTextNeutral: { color: '#bcd2db', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  routeBtnTextPrimary: { color: '#6ab0c9', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  // v2.4.1 (OTA 052) — milestone cell tap-expand detail.
  milestoneDetail: {
    marginTop: 8,
    paddingTop: 6,
    paddingBottom: 4,
    borderTopColor: '#2b3a3e',
    borderTopWidth: 1,
  },
  milestoneDetailHead: {
    color: '#bcd2db',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  milestoneDetailRow: {
    color: '#bcd2db',
    fontSize: 11,
    marginVertical: 1,
  },
  milestoneDetailEmpty: {
    color: '#6c8088',
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
    backgroundColor: '#131c1f',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 4,
    width: 80,
    alignItems: 'center',
  },
  backText: { color: '#6ab0c9', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#d6e4e8', letterSpacing: 4, fontSize: 14 },
  placeholder: { color: '#6c8088', textAlign: 'center', marginTop: 80 },
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
  emptyTitle: { color: '#6ab0c9', fontSize: 16, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  emptyBody: { color: '#bcd2db', fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  emptySub: { color: '#6c8088', fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  section: { marginBottom: 14 },
  sectionTitle: {
    color: '#6ab0c9',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomColor: '#2b3a3e',
    borderBottomWidth: 1,
  },
  card: {
    backgroundColor: '#0e1618',
    borderColor: '#2b3a3e',
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
  cardTitle: { color: '#d6e4e8', fontSize: 13, fontWeight: '700', flex: 1, marginRight: 8 },
  // arb100 — the contract's atlas-pin number, inline before the title. Teal "◆"
  // matches the map pin so a card and its mark read the same.
  contractBadge: { color: '#54d6c4', fontWeight: '900' },
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
  // arb171 — "READY TO SUBMIT" pill: brighter + amber so a finished quest pops.
  stagePillReady: {
    color: '#1a1207',
    backgroundColor: '#d8a43a',
    borderColor: '#d8a43a',
  },
  cardFaction: { color: '#6c8088', fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  cardLocation: { color: '#9ec96a', fontSize: 11, marginBottom: 4, letterSpacing: 0.5 },
  // 2026-05-26 OTA-055 — difficulty chip below location, color-coded
  // vs player state. Same green / amber / red traffic light the rest
  // of the game uses.
  difficultyChip: { fontSize: 11, marginBottom: 6, letterSpacing: 0.5, fontWeight: '700' },
  difficultyChipReady: { color: '#9ec96a' },
  difficultyChipMarginal: { color: '#6ab0c9' },
  difficultyChipDangerous: { color: '#e07a5f' },
  cardBody: { color: '#bcd2db', fontSize: 12, lineHeight: 17 },
  cardHint: { color: '#6ab0c9', fontSize: 11, fontStyle: 'italic', marginTop: 4, letterSpacing: 0.5 },
  cardStageLabel: { color: '#6ab0c9', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginTop: 8, marginBottom: 2 },
  cardStageBody: { color: '#d6e4e8', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  whispersBlurb: { color: '#6c8088', fontSize: 11, fontStyle: 'italic', lineHeight: 15, marginBottom: 8 },
  cardStageHint: { color: '#9ec96a', fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  // OTA 020 — expanded contract card styles.
  expanded: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2b3a3e' },
  expandedLabel: { color: '#6c8088', fontSize: 10, letterSpacing: 2, marginTop: 8, marginBottom: 2 },
  expandedBody: { color: '#bcd2db', fontSize: 12, lineHeight: 17 },
  expandedStage: { color: '#6c8088', fontSize: 11, lineHeight: 16, paddingLeft: 4, marginBottom: 2 },
  expandedStageHint: { color: '#6ab0c9', fontSize: 10, fontStyle: 'italic', lineHeight: 14, paddingLeft: 4, marginBottom: 6, letterSpacing: 0.5 },
  expandedStageDone: { color: '#9ec96a', textDecorationLine: 'line-through' },
  expandedStageCurrent: { color: '#6ab0c9', fontWeight: '700' },
  completeBtn: {
    marginTop: 10,
    backgroundColor: '#9ec96a',
    borderRadius: 3,
    paddingVertical: 10,
    alignItems: 'center',
  },
  completeBtnPressed: { opacity: 0.7 },
  completeBtnText: { color: '#0e1618', fontWeight: '800', letterSpacing: 2, fontSize: 12 },
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
  // Activate / deactivate toggle. Active = teal outline; paused = muted grey.
  trackBtn: {
    marginTop: 8,
    backgroundColor: 'transparent',
    borderColor: '#54d6c4',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 8,
    alignItems: 'center',
  },
  trackBtnOff: { borderColor: '#5a6a6e' },
  trackBtnPressed: { opacity: 0.7 },
  trackBtnText: { color: '#54d6c4', fontWeight: '700', letterSpacing: 1, fontSize: 11 },
  trackBtnTextOff: { color: '#8aa0a4' },
  // A paused contract's card is dimmed so it reads as stood-down at a glance.
  cardPaused: { opacity: 0.6, borderColor: '#3a4a4e' },
  stagePillPaused: { color: '#8aa0a4', borderColor: '#5a6a6e' },
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
    borderColor: '#6c8088',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 10,
    alignItems: 'center',
  },
  discardBtnText: { color: '#6c8088', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  milestoneRow: { flexDirection: 'row', backgroundColor: '#0e1618', borderColor: '#2b3a3e', borderWidth: 1, borderRadius: 4, padding: 10 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#0e1618',
    borderColor: '#2b3a3e',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
  },
  tabBtnActive: { borderBottomColor: '#6ab0c9' },
  tabBtnText: { color: '#6c8088', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  tabBtnTextActive: { color: '#6ab0c9' },
  collectIntro: { color: '#bcd2db', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  collectCard: { marginBottom: 8 },
  completePill: {
    color: '#0e1618',
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
    backgroundColor: '#131c1f',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#6ab0c9' },
  fragmentList: { marginTop: 10, gap: 8 },
  fragmentRow: {
    backgroundColor: '#131c1f',
    borderColor: '#2b3a3e',
    borderWidth: 1,
    borderRadius: 3,
    padding: 8,
  },
  fragTitleFound: { color: '#6ab0c9', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  fragTitleMissing: { color: '#6ab0c9', fontSize: 11, fontWeight: '700', letterSpacing: 1, fontStyle: 'italic', marginBottom: 4 },
  fragBody: { color: '#d6e4e8', fontSize: 12, lineHeight: 17 },
  fragHint: { color: '#6c8088', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  completeBanner: { color: '#9ec96a', fontSize: 11, letterSpacing: 1, fontWeight: '700', marginTop: 4 },
});
