import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, Modal, Dimensions } from 'react-native';
// ⚠⚠ OTA-1458 — "am I standing at X?" is a grid-cell question, asked once.
import { standingAtLocation, stationedAtNamedLocation } from '../engine/standingAt';
import { useGameStore } from '../state/gameStore';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { bountyKey, bountyHoursLeft, BOUNTY_DEADLINE_HOURS } from '../engine/factionBounty';
import { findHuntById, HUNTS, checkKindLabel, biomeLabel, stageTypeLabel, weaponRarityMeets } from '../engine/hunts';
import { getItemPreview } from '../components/itemPreview';
import { findMysteryById, MYSTERIES } from '../engine/mysteries';
import { findStorylineById, STORYLINES } from '../engine/factionStorylines';
import { findFactionQuestById, FACTION_QUESTS, type FactionQuestDef } from '../engine/factionQuests';
import { missionTurnInReady } from '../engine/missionReady';
import { escortToggleLabel } from '../engine/escort';
import { FACTIONS } from '../engine/factions';
// OTA-1050 — Phase 1 slice 2: the Chronicle's people column.
import { knownPeople, npcRegard, REGARD_LABEL, dealingsSummary } from '../engine/npcMemory';
import { startingLocationForFaction } from '../engine/character';
import { missionObjectiveLocationId } from '../engine/missionRouting';
import { getLocationById } from '../engine/encounter';
import { GREAT_CLIMBS } from '../engine/greatClimbs';
import { theLower } from '../engine/grammar';
import { computeAllProgress, CHARACTER_STORIES, ALL_FRAGMENTS, storyPerkLabel } from '../engine/collectables';
import { describeWhisperStage, describeWhisperTitle, findChain, whisperRouteTarget } from '../engine/whispers';
import { playerGridCell } from '../state/playerGrid';
import { questionMarkerNumbers, mentionIdForLabel } from '../engine/questionMarkers';
import { openContractMarkers } from '../engine/contractMarkers';
import { missionLegs } from '../engine/broker';
import { carriedSigils } from '../engine/sigils';
import { canonicalDistanceFromGrid, canonicalDistanceFromPlayer, canonicalDistance, canonicalCellOf } from '../engine/worldMap';
import { bountyCourseState, bountyCourseLabel, bountyCourseIsButton } from '../engine/bountyCourse';
import {
  ensureMainQuest,
  phaseLabel,
  phaseHint,
  LOST_CAPITAL_LOCATIONS,
  coreGateNextAction,
  canStayAtTheNexus, // OTA-1225 — the earned fourth door
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
      {/* ⚠ OTA-1456 — chevron-as-state (▸ closed, ▾ open), matching every other
          accordion in the app. The words carry the affordance; the glyph carries
          the state, so the two are not competing to say the same thing. */}
      {onPress ? <Text style={milestoneStyles.tapHint}>{active ? '▾ tap to close' : '▸ tap to list'}</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: active }}>
      {body}
    </TouchableOpacity>
  );
}

const milestoneStyles = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  cellActive: { borderColor: '#c9a86a', backgroundColor: '#1a1714' },
  value: { color: '#c9a86a', fontSize: 18, fontWeight: '700' },
  label: { color: '#cdbf99', fontSize: 11, letterSpacing: 1 },
  next: { color: '#a2977b', fontSize: 9, marginTop: 2, textAlign: 'center' },
  tapHint: { color: '#5a5448', fontSize: 8, marginTop: 1, letterSpacing: 1 },
});

function factionLabel(factionId: string | null | undefined): string {
  if (!factionId) return 'Unaffiliated';
  const f = FACTIONS.find((x) => x.id === factionId);
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
  const contractsNotice = useGameStore((s) => s.contractsNotice);
  const clearContractsNotice = useGameStore((s) => s.clearContractsNotice);
  const sendContractByRunner = useGameStore((s) => s.sendContractByRunner);
  const abandonContract = useGameStore((s) => s.abandonContract);
  const setFactionQuestActive = useGameStore((s) => s.setFactionQuestActive);
  const setContractActive = useGameStore((s) => s.setContractActive);
  const routeMission = useGameStore((s) => s.routeMission);
  const routeGreatClimb = useGameStore((s) => s.routeGreatClimb);
  const setGreatClimbActive = useGameStore((s) => s.setGreatClimbActive);
  const discardLead = useGameStore((s) => s.discardLead);
  // OTA-1014 — the refusal strip answers THIS visit's taps; don't let a stale line
  // greet the next visit to the screen.
  useEffect(() => () => { useGameStore.getState().clearContractsNotice(); }, []);
  const turnInSigil = useGameStore((s) => s.turnInSigil);
  // 2026-05-24 — tap-to-travel from the Primary Objective expansion.
  // Mirrors the Lore→Places confirm modal pattern in LoreCodexBody.
  const setTravelCourse = useGameStore((s) => s.setTravelCourse);
  const requestTravelConfirm = useGameStore((s) => s.requestTravelConfirm);
  const setWhisperCourse = useGameStore((s) => s.setWhisperCourse);
  const appendLog = useGameStore((s) => s.appendLog);
  const [pendingRoute, setPendingRoute] = useState<{ id: string; name: string; missionId?: string; climbId?: string } | null>(null);
  // 2026-05-25 — branded refusal modal for hub-room gate. Same
  // palette as the rest of the game; replaces native Alert.alert.
  const [tab, setTab] = useState<Tab>('contracts');
  // ⚠⚠⚠ OTA-1459 — ACTIVE / PARKED, BECAUSE THE WALL IS THE PROBLEM, NOT THE CAP.
  //
  // Owner's device log: in about ninety seconds at one market he accepted ELEVEN
  // faction contracts, five mysteries and four storylines — twenty commitments. The
  // Arbiter itself pushed back mid-flood ("You're stacking promises", "You can only
  // walk one road at a time") and the UI let him keep going.
  //
  // ⚠⚠ AN OUTSIDE REVIEW READ THAT AS A MISSING CAP AND PROPOSED LIMITING ACTIVE
  // CONTRACTS TO THREE. THAT CAP ALREADY EXISTS AND IS TIGHTER: exactly ONE stage-run
  // may be tracked at a time (OTA-972 — "ONE definition of already running a
  // contract"), and bounties have had MAX_ACTIVE_BOUNTIES = 3 since OTA-859. Nothing
  // in the flood was mechanically wrong. All nineteen extras were PARKED, doing
  // nothing, waiting.
  //
  // So the defect is presentation: one active row buried in nineteen parked ones,
  // with no way to see either set on its own. This filters; it changes no rule.
  //
  // ⚠ DEFAULTS TO 'all' ON PURPOSE. A filter that hides rows the player did not ask
  // to hide is how a contract goes missing and the screen starts lying — the same
  // family as the atlas insisting you had not moved. Opt-in, never opt-out.
  const [slate, setSlate] = useState<'all' | 'active' | 'parked'>('all');
  /** Does a row with this tracked-flag survive the current filter?
   *  ⚠ Applied ONLY to the four stage-run sections, which are the ones that carry a
   *  tracked flag and the ones that flooded. Bounties, whispers, leads and sigils have
   *  no parked state to filter on and are left whole rather than half-filtered. */
  const passesSlate = (tracked: boolean): boolean =>
    slate === 'all' || (slate === 'active' ? tracked : !tracked);

  // arb-fix — SORT BY DISTANCE. When on, each mission section (and the Primary
  // Objective's 9-Capital list) is ordered by how many MOVES it is to its target,
  // nearest first — but sections stay grouped by TYPE (we only sort WITHIN each
  // list, never merge them). One flag drives both the main screen toggle and the
  // toggle inside the expanded Primary Objective box. Local state (view option),
  // matching the screen's other toggles; not persisted.
  //
  // OTA-1152 — the boolean became a THREE-WAY MODE when READY TO HAND IN joined
  // it. Two independent toggles would have allowed four states, two of them
  // nonsense ("ready first, but don't sort by distance" — ready contracts sort by
  // distance BY DEFINITION here). One mode, two buttons, each tap clearing the
  // other, keeps the impossible states unrepresentable.
  type SortMode = 'default' | 'distance' | 'ready';
  const [sortMode, setSortMode] = useState<SortMode>('default');
  // Tapping an active mode returns to the default order — same as the old toggle.
  const pickSort = (m: Exclude<SortMode, 'default'>) =>
    setSortMode((cur) => (cur === m ? 'default' : m));
  // Both non-default modes order by distance, so everything that only cares
  // "is a distance sort running" reads this and is unchanged by the new mode.
  const sortByDistance = sortMode !== 'default';
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
  // ⚠ OTA-1167 — `tracked` GATES THE ROUTE. This offered ROUTE on a PAUSED contract, so
  // a player could walk the whole way to an objective for a run that is not advancing,
  // arrive, meet nothing to do with the contract, and reasonably conclude the hunt was
  // broken. (Reported: routed to a hunt anchor, fought a Core Guardian, no hunt beat —
  // because the run had never been activated.) The card already SAID "⏸ PAUSED" two rows
  // up; the button beneath it disagreed. Same defect family as OTA-1164: a control that
  // acts without the state that gives it meaning.
  const contractRoute = (toggleKey: string, tracked = true) => {
    const ck = toContractKey(toggleKey);
    const info = ck ? contractMarkerByKey[ck] : undefined;
    if (!info) return null;
    if (!tracked) {
      return (
        <Text style={styles.routeHereNote}>
          ▸ Paused — activate it below before setting a course, or you'll walk to {info.anchorName} for a contract that isn't running.
        </Text>
      );
    }
    if (standingAtLocation(player, info.anchorId)) {
      return <Text style={styles.routeHereNote}>▸ {info.number}◆ You're at {info.anchorName}.</Text>;
    }
    return (
      <Pressable
        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
        onPress={() => setPendingRoute({ id: info.anchorId, name: info.anchorName })}
        accessibilityRole="button"
      >
        <Text style={styles.routeBtnText}>▸ {info.number}◆ ROUTE TO {info.anchorName.toUpperCase()}</Text>
      </Pressable>
    );
  };
  // arb-fix — DISTANCE (in MOVES = tiles) from the player to a mission's target
  // location. player.gridX/gridY is the warp-proof absolute canon cell; fall back
  // to the current-location + in-transit offset for legacy saves with no grid cell.
  // Returns null when there's no target (placeless missions → no distance shown).
  const movesTo = (locId: string | null | undefined): number | null => {
    if (!locId || !player) return null;
    let n: number;
    if (typeof player.gridX === 'number' && typeof player.gridY === 'number') {
      n = canonicalDistanceFromGrid(player.gridX, player.gridY, locId);
    } else if (typeof player.mapX === 'number' && typeof player.mapY === 'number') {
      n = canonicalDistanceFromPlayer(player.currentLocationId, player.mapX, player.mapY, locId);
    } else {
      n = canonicalDistance(player.currentLocationId, locId);
    }
    return Number.isFinite(n) ? n : null;
  };
  const movesLabel = (n: number): string =>
    n <= 0 ? 'you are here' : n === 1 ? '1 move away' : `${n} moves away`;
  // The marker anchor location id for a card whose place comes from the contract
  // marker table (hunt / mystery / storyline / faction / lead). Direct-field types
  // (bounty / whisper / broker leg / sigil) pass their own id to movesLine/movesTo.
  const markerLocId = (toggleKey: string): string | null => {
    const ck = toContractKey(toggleKey);
    return (ck && contractMarkerByKey[ck]?.anchorId) || null;
  };
  // The "◈ N moves away" line shown under a card's location (or null when unknown).
  const movesLine = (locId: string | null | undefined) => {
    const m = movesTo(locId);
    if (m === null) return null;
    return <Text style={styles.cardMoves}>◈ {movesLabel(m)}</Text>;
  };
  // Sort a section's list by distance (nearest first) WHEN sortByDistance is on,
  // else leave the order untouched. Placeless entries (null) sort last. Sections
  // are never merged — this only reorders within one type, keeping the grouping.
  //
  // OTA-1152 — in READY mode the ready-to-hand-in entries rise to the top of
  // their section first, THEN distance breaks the tie inside each half. Sections
  // that pass no `readyOf` (nothing in them can be handed in) simply sort by
  // distance in both modes, which is what they did before.
  const byMoves = <T,>(
    arr: readonly T[],
    locOf: (t: T) => string | null | undefined,
    readyOf?: (t: T) => boolean,
  ): T[] => {
    if (!sortByDistance) return arr as T[];
    const dist = (t: T) => {
      const m = movesTo(locOf(t));
      return m === null ? Number.POSITIVE_INFINITY : m;
    };
    const rank = (t: T) => (sortMode === 'ready' && readyOf?.(t) ? 0 : 1);
    return [...arr].sort((a, b) => rank(a) - rank(b) || dist(a) - dist(b));
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
      style={({ pressed }) => [styles.trackBtn, tracked ? styles.trackBtnOn : styles.trackBtnOff, pressed && styles.trackBtnPressed]}
      onPress={() => setContractActive(kind, id, !tracked)}
      accessibilityRole="button"
      accessibilityState={{ selected: tracked }}
    >
      <Text style={[styles.trackBtnText, tracked ? styles.trackBtnTextOn : styles.trackBtnTextOff]}>
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

  // OTA-862 — bounties the player currently carries (migrating the legacy single slot).
  const activeBounties = (player.activeBounties && player.activeBounties.length > 0)
    ? player.activeBounties
    : player.activeBounty ? [player.activeBounty] : [];
  const bountyNowHour = player.hoursElapsed ?? 0;

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

  /** Live counts for the slate chips.
   *  ⚠ Derived from the SAME four lists the filter acts on, and derived HERE rather
   *  than memoised higher up — the lists are rebuilt from the store on every render,
   *  so a memo keyed on them would recompute anyway while adding a dependency array
   *  that can go stale. A count computed from a different source than the rows it
   *  describes is a second source of truth, and that is the bug this screen has been
   *  bitten by twice today. */
  const slateFlags: boolean[] = [
    ...hunts.map((h) => h.run.tracked !== false),
    ...mysteries.map((m) => m.run.tracked !== false),
    ...storylines.map((sl) => sl.run.tracked !== false),
    ...factionQuests.map((fq) => fq.rec.tracked !== false),
  ];
  const slateCounts = {
    active: slateFlags.filter(Boolean).length,
    parked: slateFlags.filter((f) => !f).length,
    all: slateFlags.length,
  };

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

  // OTA-1152 — READINESS, ONCE, FOR EVERY KIND. These three wrappers are the only
  // places this screen asks "can it be handed in?", and all three go through
  // engine/missionReady. The card pills, the COMPLETE gates and the READY TO HAND
  // IN sort therefore cannot disagree — which they could before, when each section
  // computed its own answer inline.
  //
  // ⚠ A record whose DEF no longer resolves is never ready: the cards already
  // filter orphans out (`if (!def) return null`), and a sort that floated a card
  // that does not render would leave a gap the player cannot act on.
  const countItem = (name: string) =>
    (player?.inventory ?? [])
      .filter((it) => it.name.toLowerCase() === name.toLowerCase())
      .reduce((n, it) => n + (it.quantity ?? 1), 0);
  const stageRunReady = (
    kind: 'hunt' | 'mystery' | 'storyline',
    run: { stage: number },
    def: { stages: readonly unknown[] } | null | undefined,
  ): boolean => !!def && missionTurnInReady({ kind, stage: run.stage, stageCount: def.stages.length });
  const factionRecReady = (
    rec: { stage: number },
    def: FactionQuestDef | null | undefined,
  ): boolean =>
    !!def && missionTurnInReady({ kind: 'faction_quest', def, stage: rec.stage, countItem });
  const brokerReady = missionTurnInReady({
    kind: 'broker',
    legs: brokerLegs,
    hasItem: hasRelic,
  });

  // OTA-1152 — a faction contract's card swaps the distance it shows once the work
  // is done: en route it points at the OBJECTIVE, ready it points at the faction
  // HOME you hand it in at. The distance SORT was still keying off the objective,
  // so a ready contract sorted by a number its own card was not displaying. One
  // helper now feeds both, and they agree in every mode.
  const factionSortLocId = (fq: { rec: { stage: number }; def: FactionQuestDef | null }) => {
    if (!fq.def) return null;
    const home = startingLocationForFaction(fq.def.factionId);
    return factionRecReady(fq.rec, fq.def) ? home : (missionObjectiveLocationId(fq.def) ?? home);
  };

  // OTA-1152 — THE READY TO HAND IN ROLL-UP. The owner asked for the ready ones
  // "right to the top", pulled FROM the groups — floating them inside their own
  // section would not have done that: a ready faction contract sits below Hunts,
  // Mysteries and Storylines, so "top of its group" can still be most of a screen
  // down. This gathers them across every kind into one list above everything else,
  // nearest first, while the full cards stay where they were.
  //
  // ⚠ Each row's COMPLETE calls the SAME completeContractFromUI the card's button
  // calls — it is not a second turn-in path. Anything that store refuses (the
  // face-to-face gate on hunts, for one) is refused identically here and surfaces
  // on the same refusal strip.
  type ReadyRow = {
    key: string;
    tag: string;
    title: string;
    locId: string | null;
    onComplete: (() => void) | null;
    note: string;
  };
  const readyRows: ReadyRow[] = [];
  for (const h of hunts) {
    const d = h.def;
    if (d && stageRunReady('hunt', h.run, d))
      readyRows.push({
        key: `rh_${h.run.id}`, tag: 'HUNT', title: d.title,
        locId: markerLocId(`h_${h.run.id}`),
        note: 'paid face to face — the posting faction’s agent, or the trading post for 80%',
        onComplete: () => completeContractFromUI('hunt', d.id),
      });
  }
  for (const m of mysteries) {
    const d = m.def;
    if (d && stageRunReady('mystery', m.run, d))
      readyRows.push({
        key: `rm_${m.run.id}`, tag: 'MYSTERY', title: d.title,
        locId: markerLocId(`m_${m.run.id}`),
        note: 'hand to the posting faction’s agent, or the trading post for 80%',
        onComplete: () => completeContractFromUI('mystery', d.id),
      });
  }
  for (const sl of storylines) {
    const d = sl.def;
    if (d && stageRunReady('storyline', sl.run, d))
      readyRows.push({
        key: `rs_${sl.run.id}`, tag: 'STORYLINE', title: d.title,
        locId: markerLocId(`s_${sl.run.id}`),
        note: 'hand to the posting faction’s agent, or the trading post for 80%',
        onComplete: () => completeContractFromUI('storyline', d.id),
      });
  }
  for (const fq of factionQuests) {
    const d = fq.def;
    if (d && factionRecReady(fq.rec, d))
      readyRows.push({
        key: `rf_${d.id}`, tag: 'FACTION', title: d.title,
        locId: factionSortLocId(fq),
        note: 'same-faction agent pays FULL; the trading post brokers it for 80%',
        onComplete: () => completeContractFromUI('faction_quest', d.id),
      });
  }
  // The alliance seals at the Parley Ground rather than through a COMPLETE tap,
  // so it lists (it IS ready to hand in) with a route note and no button.
  if (brokerReady) {
    readyRows.push({
      key: 'rb_broker', tag: 'ALLIANCE', title: 'Parley of Factions',
      locId: 'parley_ground', note: 'seal the alliance at the Parley Ground',
      onComplete: null,
    });
  }
  readyRows.sort(
    (a, b) =>
      (movesTo(a.locId) ?? Number.POSITIVE_INFINITY) -
      (movesTo(b.locId) ?? Number.POSITIVE_INFINITY),
  );

  // OTA-1002 — count only records whose DEF still resolves: the cards filter
  // orphans out, and the header must agree (never "6 ACTIVE" over 5 cards).
  const totalActive =
    hunts.filter((h) => h.def).length
    + mysteries.filter((m) => m.def).length
    + storylines.filter((st) => st.def).length
    + factionQuests.filter((q) => q.def).length
    + whispers.length + leads.length
    + (brokerMission ? 1 : 0) + activeBounties.length;

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
      {/* OTA-1205 — v2 id: the body gained the host hand-in rule (OTA-1201) and dismissals
          are per-install, so the old id would hide the new line from existing testers. */}
      <FirstTimeHint
        id="contracts_first_open_v2"
        title="Your missions"
        body="Everything you've taken on lives here — hunts, faction work, and bounties. Tap one to set a course or check your progress. Hand-ins answer to whoever owns the ground you stand on — if they won't take your work, a broker, courier, or the Hidden Market will, for a cut."
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setScreen('exploration')}
          style={styles.backBtn}
          hitSlop={8}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">CONTRACTS</Text>
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
        // OTA-1225 — asked once per render, at the same place the phase is read.
        const canStay = canStayAtTheNexus(player, worldMemory);
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
        // the city. (The summon action enforces the same — summonCoreGuardian →
        // not_at_capital.)
        //
        // ⚠⚠ OTA-1480 — SECOND HAND-ROLLED COPY, now retired. This and the MAIN
        // QUEST chip on ExplorationScreen both mirrored the store's private
        // `isStationedAtNamedLocation` by hand, each under a comment saying so.
        // The predicate is exported from app/engine/standingAt.ts and reads the
        // authoritative grid cell; see the header there for why the visual frame
        // was the wrong coordinate to have been asking.
        const stationedAtCapital = stationedAtNamedLocation(player);
        const atCapitalForSummon =
          stationedAtCapital
          && (mq.phase === 'revelation' || mq.phase === 'cores')
          && LOST_CAPITAL_LOCATIONS.includes(player.currentLocationId)
          && !mq.coresRecovered.includes(player.currentLocationId);
        // ⚠⚠ OTA-1471 — SECOND DOOR. Two SUMMON chips reach one action (this one
        // and the MAIN QUEST chip on the exploration screen), and a gate wired
        // into only one of them is the many-doors mistake — the defect class
        // this project has hit six times. Same helper, same field, both chips.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { coreSettleState, settleWaitPhrase, summonHostiles, hostileNamePhrase } = require('../engine/coreGuardians') as typeof import('../engine/coreGuardians');
        const summonSettle = atCapitalForSummon
          ? coreSettleState(player.hoursElapsed ?? 0, mq.lastCoreAtHours)
          : { ready: true, hoursLeft: 0 };
        // ⚠⚠ OTA-1480 — SAME SECOND DOOR, SAME RULE. The hostiles guard is wired
        // into the ACTION, so a chip that did not know about it would be a lit
        // button that refuses — and wiring it into only one of the two chips would
        // be the many-doors mistake the note above was written about.
        const scene = useGameStore.getState().currentScene;
        const summonBlocked = atCapitalForSummon
          ? summonHostiles(scene?.enemies, scene?.enemyHps, scene?.enemyKnockedOut)
          : { blocked: false, count: 0, names: [] as string[] };
        return (
          <TouchableOpacity
            style={styles.mainQuestCard}
            onPress={() => setMqExpanded((v) => !v)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ expanded: mqExpanded }}
          >
            {/* ⚠ OTA-1456 — chevron-as-state, ▸ closed / ▾ open. */}
            <Text style={styles.mainQuestTag}>PRIMARY OBJECTIVE  {mqExpanded ? '▾' : '▸'}</Text>
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
              // ⚠ Flavour, not an instruction — the verb no longer raises the
              // Guardian. ★ SUMMON, directly below, is the only door.
              return <Text style={styles.mainQuestNextAction}>→ At this Capital: {next}. Then tap ★ SUMMON.</Text>;
            })()}
            {atCapitalForSummon && summonBlocked.blocked && (
              // OTA-1480 — the nearer of the two reasons, and the one the player
              // can act on right now.
              <Text style={styles.mainQuestNextAction}>
                → {hostileNamePhrase(summonBlocked.names)} still {summonBlocked.count === 1 ? 'stands' : 'stand'} here. The Core-hum will not answer over a fight.
              </Text>
            )}
            {atCapitalForSummon && !summonBlocked.blocked && !summonSettle.ready && (
              // OTA-1471 — say the wait BEFORE the tap, where the player is
              // deciding. The chip below still takes the tap and prints the
              // whole reason; this line is what stops them tapping four times.
              <Text style={styles.mainQuestNextAction}>
                → The grid is still closing over the last seat — {settleWaitPhrase(summonSettle.hoursLeft)} before a Guardian will rise here.
              </Text>
            )}
            {atCapitalForSummon && (
              <TouchableOpacity
                style={[styles.summonChip, (!summonSettle.ready || summonBlocked.blocked) && styles.summonChipWait]}
                onPress={() => useGameStore.getState().summonCoreGuardian()}
                activeOpacity={0.7}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={summonBlocked.blocked
                  ? `Cannot summon, ${hostileNamePhrase(summonBlocked.names)} still standing`
                  : summonSettle.ready
                    ? 'Summon Guardian'
                    : `Guardian settling, ${settleWaitPhrase(summonSettle.hoursLeft)} to wait`}
              >
                <Text style={[styles.summonChipText, (!summonSettle.ready || summonBlocked.blocked) && styles.summonChipWaitText]}>
                  {summonBlocked.blocked
                    ? '★ FIGHT FIRST'
                    : summonSettle.ready ? '★ SUMMON' : `★ SETTLING · ${Math.max(1, Math.round(summonSettle.hoursLeft))}h`}
                </Text>
              </TouchableOpacity>
            )}
            {mqExpanded && (
              <View style={styles.mqTracker}>
                <View style={styles.mqTrackerHeadRow}>
                  <Text style={styles.mqTrackerHead}>9 CAPITALS · {recoveredCount}/9 CORES</Text>
                  {/* arb-fix — same SORT BY DISTANCE toggle, here for the Capital list.
                      Reorders the 9 Capitals nearest-first (finished ones sink).
                      OTA-1152 — deliberately NOT given the READY mode: a Capital is a
                      boss objective, not a contract, so it has nothing to hand in. It
                      still lights while READY mode runs, because that mode orders the
                      Capitals by distance too — the button is telling the truth. */}
                  <Pressable
                    onPress={() => pickSort('distance')}
                    hitSlop={6}
                    style={({ pressed }) => [styles.mqSortBtn, sortByDistance && styles.mqSortBtnOn, pressed && styles.sortBarPressed]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sortByDistance }}
                  >
                    <Text style={[styles.mqSortText, sortByDistance && styles.sortBarTextOn]}>
                      ◈ {sortByDistance ? 'BY DISTANCE' : 'SORT'}
                    </Text>
                  </Pressable>
                </View>
                {/* arb148 — the Primary Objective card sits in the FIXED region
                    above the tabs/scroll, so the expanded 9-Capital list pushed
                    the bottom Capital half off-screen. Cap it and let the rows
                    scroll internally (nestedScroll) so all nine are reachable. */}
                <ScrollView style={styles.mqTrackerScroll} nestedScrollEnabled>
                {(sortByDistance
                  ? [...LOST_CAPITAL_LOCATIONS].sort((a, b) => {
                      // Finished Capitals sink to the bottom; the rest go nearest-first.
                      const done = (id: string) => (mq.coresRecovered.includes(id) ? 1 : 0);
                      if (done(a) !== done(b)) return done(a) - done(b);
                      return (movesTo(a) ?? Number.POSITIVE_INFINITY) - (movesTo(b) ?? Number.POSITIVE_INFINITY);
                    })
                  : LOST_CAPITAL_LOCATIONS
                ).map((capId) => {
                  const def = GUARDIANS_BY_CAPITAL[capId];
                  const recovered = mq.coresRecovered.includes(capId);
                  const guardianDown = (mq.guardiansDefeated ?? []).includes(capId);
                  const here = standingAtLocation(player, capId);
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
                    color = '#a2977b';
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
                      {!here && movesLine(capId)}
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
                      accessibilityRole="button"
                    >
                      {rowContent}
                    </TouchableOpacity>
                  );
                })}
                </ScrollView>
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
                  accessibilityRole="button"
                >
                  <Text style={styles.mainQuestChoiceText}>SEAL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mainQuestChoiceBtn, { borderColor: '#a85a3a' }]}
                  onPress={() => useGameStore.getState().chooseEndingMainQuest('unleash')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text style={styles.mainQuestChoiceText}>UNLEASH</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.mainQuestChoiceBtn, { borderColor: '#7a8a5a' }]}
                  onPress={() => useGameStore.getState().chooseEndingMainQuest('preserve')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text style={styles.mainQuestChoiceText}>PRESERVE</Text>
                </TouchableOpacity>
                {/* ⚠⚠ OTA-1225 — THE EARNED FOURTH. Rendered only when the run
                    earned it, and NEVER as a disabled or greyed row: a player
                    who has not earned STAY must not be shown a door they cannot
                    open. The three above are unconditional and always will be. */}
                {canStay && (
                  <TouchableOpacity
                    style={[styles.mainQuestChoiceBtn, { borderColor: '#8a7a5a' }]}
                    onPress={() => useGameStore.getState().chooseEndingMainQuest('stay')}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <Text style={styles.mainQuestChoiceText}>STAY</Text>
                  </TouchableOpacity>
                )}
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

      {/* ⚠ OTA-1459 — the slate filter. Only rendered when there is actually a wall
          to cut through: below a handful of commitments it would be one more control
          for no gain, and an empty filter row on a fresh save teaches nothing. */}
      {tab === 'contracts' && slateCounts.all > 3 && (
        <View style={styles.slateRow} accessibilityRole="tablist">
          {([
            ['all', `ALL (${slateCounts.all})`],
            ['active', `ACTIVE (${slateCounts.active})`],
            ['parked', `PARKED (${slateCounts.parked})`],
          ] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setSlate(key)}
              style={[styles.slateBtn, slate === key && styles.slateBtnOn]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: slate === key }}
              accessibilityLabel={`Show ${label}`}
            >
              <Text style={[styles.slateBtnText, slate === key && styles.slateBtnTextOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.tabRow}>
        <TouchableOpacity
          onPress={() => setTab('contracts')}
          style={[styles.tabBtn, tab === 'contracts' && styles.tabBtnActive]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'contracts' }}
        >
          <Text style={[styles.tabBtnText, tab === 'contracts' && styles.tabBtnTextActive]}>
            CONTRACTS
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab('collectables')}
          style={[styles.tabBtn, tab === 'collectables' && styles.tabBtnActive]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: tab === 'collectables' }}
        >
          <Text style={[styles.tabBtnText, tab === 'collectables' && styles.tabBtnTextActive]}>
            COLLECTIBLES {totalFragments > 0 ? `(${totalFragmentsFound}/${totalFragments})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* OTA-1014 — refusal strip: when a COMPLETE tap is refused (wrong faction, no
          agent in scene, work not done), the Arbiter's line lands HERE, where
          the player is looking — not only in the world feed behind this screen.

          ⚠⚠ OTA-1402 — AND "HERE" WAS NOT WHERE HE WAS LOOKING. This strip sits
          ABOVE the ScrollView below it. On a short list that is the top of the
          screen; on a long one the player has scrolled the rows into view and
          the strip out of it, so a refused COMPLETE writes its explanation to a
          part of the screen that is no longer on the screen. The owner tapped
          ten contracts against a wrong-faction hall and reported "all did
          nothing" — then concluded the cause was faction STANDING, which it
          never was. A message nobody sees does not merely fail to inform; it
          lets a wrong theory form and stand.

          So a notice carrying a `body` renders as a CARD OVER the list, which
          cannot be scrolled away from. A notice with only `text` (older callers)
          keeps the strip. */}
      {contractsNotice && !contractsNotice.body ? (
        <Pressable
          style={({ pressed }) => [styles.contractsNotice, pressed && styles.contractsNoticePressed]}
          onPress={clearContractsNotice}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notice"
        >
          <Text style={styles.contractsNoticeText}>{contractsNotice.text}</Text>
          <Text style={styles.contractsNoticeDismiss}>TAP TO DISMISS</Text>
        </Pressable>
      ) : null}

      {tab === 'collectables' ? (
        <CollectablesTab progress={progress} />
      ) : (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* arb-fix — SORT BY DISTANCE toggle. Reorders every mission section by
            moves-to-target (nearest first) while keeping each type grouped.
            OTA-1152 — READY TO HAND IN joins it on the right, same style. The two
            share one mode, so lighting either one clears the other. */}
        <View style={styles.sortRow}>
          <Pressable
            onPress={() => pickSort('distance')}
            style={({ pressed }) => [styles.sortBar, styles.sortBarHalf, sortMode === 'distance' && styles.sortBarOn, pressed && styles.sortBarPressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: sortMode === 'distance' }}
          >
            <Text style={[styles.sortBarText, sortMode === 'distance' && styles.sortBarTextOn]}>
              {sortMode === 'distance' ? '◈ SORTED BY DISTANCE' : '◈ SORT BY DISTANCE'}
            </Text>
            <Text style={[styles.sortBarHint, sortMode === 'distance' && styles.sortBarTextOn]}>
              {sortMode === 'distance' ? 'tap for default order' : 'nearest first, within each type'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => pickSort('ready')}
            style={({ pressed }) => [styles.sortBar, styles.sortBarHalf, sortMode === 'ready' && styles.sortBarReadyOn, pressed && styles.sortBarPressed]}
            accessibilityRole="button"
            accessibilityState={{ selected: sortMode === 'ready' }}
          >
            <Text style={[styles.sortBarText, sortMode === 'ready' && styles.sortBarReadyText]}>
              {sortMode === 'ready' ? `✦ READY TO HAND IN · ${readyRows.length}` : '✦ SORT BY READY TO HAND IN'}
            </Text>
            <Text style={[styles.sortBarHint, sortMode === 'ready' && styles.sortBarReadyText]}>
              {sortMode === 'ready' ? 'tap for default order' : 'finished work first, nearest first'}
            </Text>
          </Pressable>
        </View>
        {/* OTA-1152 — the roll-up itself: every ready contract, pulled from its
            group to the top, nearest first. Only in READY mode; the full cards
            stay in their sections below either way. */}
        {sortMode === 'ready' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              ✦ READY TO HAND IN {readyRows.length > 0 ? `· ${readyRows.length}` : ''}
            </Text>
            {readyRows.length === 0 ? (
              <Text style={styles.readyEmpty}>
                Nothing is ready to hand in yet — finish a contract’s work and it appears here.
              </Text>
            ) : (
              readyRows.map((r) => (
                <View key={r.key} style={[styles.card, styles.readyCard]}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>{r.title}</Text>
                    <Text style={styles.readyTag}>{r.tag}</Text>
                  </View>
                  {movesLine(r.locId)}
                  <Text style={styles.cardHint}>{r.note}</Text>
                  {r.onComplete && (
                    <Pressable
                      style={({ pressed }) => [styles.completeBtn, pressed && styles.completeBtnPressed]}
                      onPress={r.onComplete}
                      accessibilityRole="button"
                      accessibilityLabel={`Complete ${r.title}`}
                    >
                      <Text style={styles.completeBtnText}>COMPLETE — CLAIM REWARD</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </View>
        )}
        {(() => {
          // OTA-912 — great-climb missions. A climb becomes a listed mission once
          // its Skyreacher Chart is used (id in unlockedGreatClimbs); it clears
          // when its summit boss falls (id in summitBossesDefeated).
          const unlocked = worldMemory.unlockedGreatClimbs ?? [];
          const bossesDown = worldMemory.summitBossesDefeated ?? [];
          const climbMissions = GREAT_CLIMBS.filter((c) => unlocked.includes(c.id));
          if (climbMissions.length === 0) return null;
          const doneCount = climbMissions.filter((c) => bossesDown.includes(c.id)).length;
          // ⚠ OTA-1361 — the towers join the distance sort. Owner: "they should get
          // sorted by distance as well." Every other section has obeyed the sort bar
          // since OTA-1152; the climbs alone rendered in fixed catalog order, so a
          // sort the player had switched on quietly skipped five cards. Crowned
          // towers pass a null location, which the shared comparator already sorts
          // last — finished work sinks under the climbs still standing.
          const climbsInOrder = byMoves(climbMissions, (c) => (bossesDown.includes(c.id) ? null : c.locationId));
          return (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                THE GREAT CLIMBS  ·  {doneCount}/5 towers taken
              </Text>
              {climbsInOrder.map((c) => {
                const done = bossesDown.includes(c.id);
                const climbActive = player?.routedClimbId === c.id;
                return (
                  <View key={c.id} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>
                        {done ? '✓ ' : '⚑ '}{c.noun} — {c.tiers} tiers
                      </Text>
                      {!done && climbActive && <Text style={styles.stagePill}>ACTIVE</Text>}
                    </View>
                    <Text style={styles.routeBody}>
                      {done
                        ? 'Crown taken — its Skyreacher piece is claimed.'
                        : 'Climb it (Hardened Climbing Strap + a whole Reclaimer\'s Rope) and beat the summit guardian for its Skyreacher piece and an Aether Collection Beacon.'}
                    </Text>
                    {/* ⚠⚠ OTA-1304 — THE FIVE TOWERS WERE THE ONLY MISSIONS YOU
                        COULD NOT ROUTE TO. Owner, after reading the chart: "all
                        five beacon towers are known grid locations so I should
                        be able to autoroute to it… it should ask me if I want to
                        set an auto route like the rest of the missions."
                        He was right, and the destination was never in doubt —
                        every GreatClimb carries its own `locationId`. This
                        section (OTA-912) simply rendered read-only cards, and no
                        walker ever caught it because every climb test TELEPORTS
                        (`currentLocationId: climb.locationId`) instead of
                        travelling, so the route was never once exercised. */}
                    {!done && movesLine(c.locationId)}
                    {!done && !standingAtLocation(player, c.locationId) && (
                      <Pressable
                        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                        onPress={() => setPendingRoute({ id: c.locationId, name: safeLocName(c.locationId), climbId: c.id })}
                        accessibilityRole="button"
                      >
                        <Text style={styles.routeBtnText}>▸ SET COURSE TO {safeLocName(c.locationId).toUpperCase()}</Text>
                      </Pressable>
                    )}
                    {!done && standingAtLocation(player, c.locationId) && (
                      <Text style={styles.routeHereNote}>▸ You're here — start the climb.</Text>
                    )}
                    {/* ⚠ OTA-1361 — THE TOWERS TOGGLE LIKE EVERY OTHER MISSION.
                        Owner: "the great climbs should be able to be activated and
                        deactivated." `routedClimbId` was always the "tower you're
                        running" flag, but SET COURSE was the only thing that could
                        raise it and NOTHING could lower it by hand — so a tower you'd
                        walked away from stayed the mission you were on until you
                        activated some other contract. Activating here pauses every
                        other contract (single-active, across kinds); deactivating
                        leaves the tower on the slate and any laid course intact. */}
                    {!done && (
                      <Pressable
                        style={({ pressed }) => [styles.trackBtn, climbActive ? styles.trackBtnOn : styles.trackBtnOff, pressed && styles.trackBtnPressed]}
                        onPress={() => setGreatClimbActive(c.id, !climbActive)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: climbActive }}
                      >
                        <Text style={[styles.trackBtnText, climbActive ? styles.trackBtnTextOn : styles.trackBtnTextOff]}>
                          {climbActive ? '▮▮ DEACTIVATE' : '▶ SET ACTIVE'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              <Text style={styles.mainQuestHint}>
                Carry all five Aether Collection Beacons down, then USE one to break the arrays down and build the Beacon Rifle.
              </Text>
            </View>
          );
        })()}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">MILESTONES  ·  tap a cell to expand</Text>
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
                // OTA-1050 — this was a roll-call: a name, a role, a place.
                // It now reports the RELATIONSHIP, ordered by how each person
                // regards you, with the dealings that got them there. The
                // ledger is the same one the greeting layer reads, so the
                // Chronicle and the world can never disagree about who knows
                // you. Anyone on the old npcsMet list without a relation (a
                // Guardian, a pre-OTA-1049 save mid-migration) still shows,
                // with no claim made about a relationship there is no record
                // of — the honest blank.
                (worldMemory.npcsMet ?? []).map((n) => {
                  const rel = (worldMemory.npcRelations ?? {})[n.id];
                  const regard = rel ? npcRegard(rel) : null;
                  const dealings = dealingsSummary(rel);
                  return (
                    <View key={n.id} style={styles.npcRow}>
                      <Text style={styles.milestoneDetailRow}>
                        · {n.name}
                        {n.role ? ` — ${n.role}` : ''}
                        {regard ? `  ·  ${REGARD_LABEL[regard]}` : ''}
                      </Text>
                      {dealings ? (
                        <Text style={styles.npcDealings}>   {dealings}</Text>
                      ) : null}
                    </View>
                  );
                })
              )}
              {knownPeople(worldMemory).length > 0 ? (
                <Text style={styles.npcFootnote}>
                  Regard is earned in dealings with that person, not in standing
                  with their faction. Trades, contracts finished, and thefts they
                  CAUGHT all count.
                </Text>
              ) : null}
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

        {/* OTA-862 — bounties are timed contracts, so they lead the board. Each shows
            progress + how much in-game time is left, and re-routes on tap. */}
        {activeBounties.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">BOUNTIES</Text>
              {byMoves(activeBounties, (b) => b.targetLocationId).map((b) => {
                // OTA-866 — a prominent LIVE countdown on every accepted bounty. The window
                // is in-game hours (only drains as you act), so it can't tick in real time —
                // but the bar + colour make "how long have I got" unmistakable, and it
                // updates the moment the clock moves.
                const left = bountyHoursLeft(b, bountyNowHour);
                const deadline = b.deadlineHours ?? BOUNTY_DEADLINE_HOURS;
                const hasClock = Number.isFinite(left);
                const lapsed = hasClock && left <= 0;
                const frac = hasClock ? Math.max(0, Math.min(1, left / deadline)) : 1;
                // Green with lots of room → amber → red as it runs down.
                const tier = !hasClock ? 'none' : lapsed ? 'lapsed' : left <= 6 ? 'crit' : left <= 12 ? 'warn' : 'ok';
                const timerColor = tier === 'ok' ? '#9ec96a'
                  : tier === 'warn' ? '#d9b45f'
                  : tier === 'crit' || tier === 'lapsed' ? '#e07a5f'
                  : '#a2977b';
                const timerLabel = !hasClock ? 'no deadline'
                  : lapsed ? '⏳ LAPSED'
                  : `⏳ ${Math.ceil(left)}h left`;
                // ⚠ OTA-1164 — THE WHOLE CARD WAS A SET-COURSE BUTTON, and it stayed one
                // even when there was no course to set. Standing on the quarry's outpost,
                // a tap did nothing and said nothing while the card still read "tap to set
                // course". Same four-state machine the World screen uses, from the same
                // engine module, so the two screens cannot drift apart.
                const cs = bountyCourseState(
                  player, b.targetLocationId, b.targetLocationName, safeLocName,
                  (() => {
                    if (!player) return false;
                    const here = canonicalCellOf(player.currentLocationId);
                    const there = canonicalCellOf(b.targetLocationId);
                    return here.x === there.x && here.y === there.y;
                  })(),
                );
                const canRoute = bountyCourseIsButton(cs);
                return (
                  <Pressable
                    key={`b_${bountyKey(b)}`}
                    onPress={canRoute
                      ? () => { useGameStore.getState().setTravelCourse(b.targetLocationId); setScreen('exploration'); }
                      : undefined}
                    disabled={!canRoute}
                    style={styles.card}
                    accessibilityRole={canRoute ? 'button' : 'text'}
                  >
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{b.giverName} bounty</Text>
                      <Text style={[styles.bountyTimerPill, { color: timerColor, borderColor: timerColor }]}>{timerLabel}</Text>
                    </View>
                    {/* Draining time bar — the fraction of the window left. */}
                    {hasClock && (
                      <View style={styles.bountyTimerTrack}>
                        <View style={[styles.bountyTimerFill, { width: `${Math.round(frac * 100)}%`, backgroundColor: timerColor }]} />
                      </View>
                    )}
                    <Text style={styles.cardFaction}>Hunt the {b.targetName}</Text>
                    <Text style={styles.cardLocation}>📍 {b.targetLocationName}</Text>
                    {movesLine(b.targetLocationId)}
                    <Text style={styles.cardHint}>
                      {b.progress}/{b.count} put down · pays {b.rewardTc} TC + {b.giverName} standing
                    </Text>
                    {/* ⚠ OTA-1164 — this line used to be a flat "· tap to set course" that
                        was a lie in three of the four states. It now says what tapping will
                        actually do, or why there is nothing to tap. */}
                    <Text style={canRoute ? styles.cardHint : styles.bountyCourseNote}>
                      {canRoute ? 'Tap to set course' : bountyCourseLabel(cs)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
        )}

        {hunts.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">HUNTS</Text>
              {byMoves(hunts.filter((h) => passesSlate(h.run.tracked !== false)), (h) => markerLocId(`h_${h.run.id}`), (h) => stageRunReady('hunt', h.run, h.def)).map(({ run, def }) => {
                if (!def) return null;
                const key = `h_${run.id}`;
                const open = !!expanded[key];
                const ready = stageRunReady('hunt', run, def);
                const tracked = run.tracked !== false;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{contractBadge(key)}{def.title}</Text>
                      <Text style={[styles.stagePill, !tracked && styles.stagePillPaused]}>
                        {!tracked ? '⏸ PAUSED' : ready ? 'READY' : `Stage ${run.stage + 1}/${def.stages.length}`}
                      </Text>
                    </View>
                    {contractRoute(key, tracked)}
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
                    {movesLine(markerLocId(key))}
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
                            ? 'Boss slain. A bounty is paid FACE TO FACE — stand in front of a vendor or the posting faction\'s agent, then tap COMPLETE to hand over the trophy and claim it. No courier.'
                            : `Travel to ${def.targetLocationName ?? biomeLabel(def.biomeTag)} and defeat the ${def.targetEnemyName}. Each stage above auto-advances when you perform the matching action there.`}
                        </Text>
                      </View>
                    )}
                    {open && ready && (
                      <Pressable
                        style={({ pressed }) => [styles.completeBtn, pressed && styles.completeBtnPressed]}
                        onPress={() => completeContractFromUI('hunt', def.id)}
                        accessibilityRole="button"
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
                        accessibilityRole="button"
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
              <Text style={styles.sectionTitle} accessibilityRole="header">MYSTERIES</Text>
              {byMoves(mysteries.filter((m) => passesSlate(m.run.tracked !== false)), (m) => markerLocId(`m_${m.run.id}`), (m) => stageRunReady('mystery', m.run, m.def)).map(({ run, def }) => {
                if (!def) return null;
                const key = `m_${run.id}`;
                const open = !!expanded[key];
                const ready = stageRunReady('mystery', run, def);
                const tracked = run.tracked !== false;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{contractBadge(key)}{def.title}</Text>
                      <Text style={[styles.stagePill, !tracked && styles.stagePillPaused]}>
                        {!tracked ? '⏸ PAUSED' : ready ? 'READY' : `Stage ${run.stage + 1}/${def.stages.length}`}
                      </Text>
                    </View>
                    {contractRoute(key, tracked)}
                    {movesLine(markerLocId(key))}
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
                        accessibilityRole="button"
                      >
                        <Text style={styles.completeBtnText}>COMPLETE — CLAIM REWARD</Text>
                      </Pressable>
                    )}
                    {open && (
                      <Pressable
                        style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                        onPress={() => abandonContract('mystery', def.id)}
                        accessibilityRole="button"
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
              <Text style={styles.sectionTitle} accessibilityRole="header">STORYLINES</Text>
              {byMoves(storylines.filter((sl) => passesSlate(sl.run.tracked !== false)), (sl) => markerLocId(`s_${sl.run.id}`), (sl) => stageRunReady('storyline', sl.run, sl.def)).map(({ run, def }) => {
                if (!def) return null;
                const key = `s_${run.id}`;
                const open = !!expanded[key];
                const ready = stageRunReady('storyline', run, def);
                const tracked = run.tracked !== false;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{contractBadge(key)}{def.title}</Text>
                      <Text style={[styles.stagePill, !tracked && styles.stagePillPaused]}>
                        {!tracked ? '⏸ PAUSED' : ready ? 'READY' : `Stage ${run.stage + 1}/${def.stages.length}`}
                      </Text>
                    </View>
                    {contractRoute(key, tracked)}
                    {movesLine(markerLocId(key))}
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
                          {def.rewardTc} TC{def.rewardRep > 0 ? ` · +${def.rewardRep} rep with ${factionLabel(def.factionId)}` : ''}
                        </Text>
                      </View>
                    )}
                    {open && ready && (
                      <Pressable
                        style={({ pressed }) => [styles.completeBtn, pressed && styles.completeBtnPressed]}
                        onPress={() => completeContractFromUI('storyline', def.id)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.completeBtnText}>COMPLETE — CLAIM REWARD</Text>
                      </Pressable>
                    )}
                    {open && (
                      <Pressable
                        style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                        onPress={() => abandonContract('storyline', def.id)}
                        accessibilityRole="button"
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
              <Text style={styles.sectionTitle} accessibilityRole="header">FACTION QUESTS</Text>
              {byMoves(factionQuests.filter((fq) => passesSlate(fq.rec.tracked !== false)), (fq) => factionSortLocId(fq), (fq) => factionRecReady(fq.rec, fq.def)).map(({ rec, def }, i) => {
                if (!def) return null;
                const key = `q_${def.id}_${i}`;
                const open = !!expanded[key];
                const stageDef = def.stages?.[rec.stage];
                // arb171 — real readiness across ALL quest types: staged → all
                // stages played; FETCH → the items are in hand; legacy → always.
                // (The old code hard-coded fetch/legacy as ready and the pill as
                // "OPEN" forever, so a gather quest read "open" even when done.)
                const readyToTurnIn = factionRecReady(rec, def);
                const staged = !!(def.stages && def.stages.length > 0);
                const fetchHeld = def.fetch ? countItem(def.fetch.itemName) : 0;
                // SINGLE-ACTIVE — tracked absent/true = active (the one you're on);
                // false = paused (parked, doesn't auto-advance, never dropped).
                const tracked = rec.tracked !== false;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
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
                    {/* Mission-aware ROUTE TO: courses to the objective (derived from
                        the mission text, or the turn-in home if the work is done),
                        then auto-chains to turn-in. Routing makes this the single
                        active mission. */}
                    {movesLine(readyToTurnIn ? startingLocationForFaction(def.factionId) : (missionObjectiveLocationId(def) ?? startingLocationForFaction(def.factionId)))}
                    {(() => {
                      const home = startingLocationForFaction(def.factionId);
                      const objId = readyToTurnIn ? home : (missionObjectiveLocationId(def) ?? home);
                      let objName = objId;
                      try { objName = getLocationById(objId).name ?? objId; } catch { /* keep id */ }
                      // OTA-1014 — routed requires a LIVE course. Quit-navigating used
                      // to leave routedMission set, so this note (which replaces
                      // the ROUTE button) wedged the card until deactivate →
                      // reactivate. Gating on the course also HEALS saves already
                      // carrying the stale flag.
                      const courseLive = !!player?.travelTarget || !!player?.whisperCourse;
                      const routed = courseLive && player?.routedMission?.id === def.id;
                      const atObj = standingAtLocation(player, objId);
                      if (routed) {
                        const phase = player?.routedMission?.phase;
                        return (
                          <Text style={styles.routeHereNote}>
                            ▸ Auto-routing — {phase === 'to_turnin' ? `turn in at ${objName}` : `objective: ${objName}`}. Keep traveling; it chains to turn-in.
                          </Text>
                        );
                      }
                      if (atObj) {
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
                          accessibilityRole="button"
                        >
                          <Text style={styles.routeBtnText}>
                            ▸ {readyToTurnIn ? `ROUTE TO TURN-IN (${objName.toUpperCase()})` : `ROUTE TO ${objName.toUpperCase()}`}
                          </Text>
                        </Pressable>
                      );
                    })()}
                    {/* Activate / deactivate (single-active). Deactivating parks the
                        contract: stays on the slate but stops auto-advancing until
                        re-activated. Activating it pauses every other contract. */}
                    <Pressable
                      style={({ pressed }) => [styles.trackBtn, tracked ? styles.trackBtnOn : styles.trackBtnOff, pressed && styles.trackBtnPressed]}
                      onPress={() => setFactionQuestActive(def.id, !tracked)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: tracked }}
                    >
                      <Text style={[styles.trackBtnText, tracked ? styles.trackBtnTextOn : styles.trackBtnTextOff]}>
                        {/* OTA-963 — name the party the toggle stands down / recalls. */}
                        {escortToggleLabel(tracked, rec.escort && rec.escort.hp > 0 ? rec.escort : null)}
                      </Text>
                    </Pressable>
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
                          {def.reward.tc} TC{def.reward.rep > 0 ? ` · +${def.reward.rep} rep with ${factionLabel(def.factionId)}` : ''}
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
                    {open && readyToTurnIn && (
                      <Pressable
                        style={({ pressed }) => [styles.completeBtn, pressed && styles.completeBtnPressed]}
                        onPress={() => completeContractFromUI('faction_quest', def.id)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.completeBtnText}>COMPLETE — CLAIM REWARD</Text>
                      </Pressable>
                    )}
                    {open && (
                      <Pressable
                        style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                        onPress={() => abandonContract('faction_quest', def.id)}
                        accessibilityRole="button"
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
              <Text style={styles.sectionTitle} accessibilityRole="header">ALLIANCE</Text>
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
                    standingAtLocation(player, l.tileId);
                  return (
                    <View key={`broker_${l.factionId}`} style={{ marginTop: 8 }}>
                      <Text style={styles.cardStageLabel}>{l.factionName}</Text>
                      <Text style={styles.cardStageBody}>
                        {inHand
                          ? `✓ ${l.itemName} — in hand.`
                          : `○ ${l.itemName} — recover it at ${safeLocName(l.tileId)}.`}
                      </Text>
                      {!inHand && movesLine(l.tileId)}
                      {!inHand && !here && (
                        <Pressable
                          style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                          onPress={() => setPendingRoute({ id: l.tileId, name: safeLocName(l.tileId) })}
                          accessibilityRole="button"
                        >
                          <Text style={styles.routeBtnText}>▸ SET COURSE TO {safeLocName(l.tileId).toUpperCase()}</Text>
                        </Pressable>
                      )}
                      {!inHand && here && (
                        <Text style={styles.routeHereNote}>▸ You're here — recover {theLower(l.itemName)}.</Text>
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
                {movesLine('parley_ground')}
                {!standingAtLocation(player, 'parley_ground') && (
                  <Pressable
                    style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                    onPress={() => setPendingRoute({ id: 'parley_ground', name: safeLocName('parley_ground') })}
                    accessibilityRole="button"
                  >
                    <Text style={styles.routeBtnText}>▸ SET COURSE TO {safeLocName('parley_ground').toUpperCase()}</Text>
                  </Pressable>
                )}
                {trackToggle('broker', 'broker', !brokerMission.paused)}
                <Pressable
                  style={({ pressed }) => [styles.abandonBtn, pressed && styles.abandonBtnPressed]}
                  onPress={() => abandonContract('broker', 'broker')}
                  accessibilityRole="button"
                >
                  <Text style={styles.abandonBtnText}>ABANDON</Text>
                </Pressable>
              </View>
            </View>
          )}

          {whispers.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">WHISPERS</Text>
              <Text style={styles.whispersBlurb}>
                Tips overheard from non-vendor NPCs. No formal contract,
                no faction rep — just rumour. Follow them or don't.
              </Text>
              {byMoves(whispers, (w) => w.rec.targetLocationId).map(({ rec, title, stageDesc }) => {
                // OTA-465 — whisper objectives live on map tiles, so offer a
                // "set course" that walks the player there (the player kept
                // losing where to go for Yulka's discs).
                const route = whisperRouteTarget(rec);
                // OTA-1542 — the route target is an ABSOLUTE cell now; compare
                // against the player's absolute cell, not the frame coords.
                const pg = player ? playerGridCell(player) : null;
                const here = !!route && !!pg
                  && pg.x === route.gridX
                  && pg.y === route.gridY;
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
                    {movesLine(rec.targetLocationId)}
                    {route && !here && tracked && (
                      <Pressable
                        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                        onPress={() => {
                          setWhisperCourse(route.gridX, route.gridY, route.label);
                          setScreen('exploration');
                        }}
                        accessibilityRole="button"
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
                      accessibilityRole="button"
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
              <Text style={styles.sectionTitle} accessibilityRole="header">LEADS</Text>
              <Text style={styles.whispersBlurb}>
                Tips picked up by investigating the world. No tracker,
                no objective marker — just the place and the deed. Go
                find it.
              </Text>
              {byMoves(leads, (q) => q.location?.id).map((q) => {
                const title = `${cap(q.objective.verb)} ${q.objective.target}`;
                const reward = (q.reward.amount != null && q.reward.amount > 0)
                  ? `${q.reward.amount} ${q.reward.type === 'currency' ? 'TC' : q.reward.type}`
                  : q.reward.label;
                const key = `lead_${q.id}`;
                const open = !!expanded[key];
                const tracked = q.tracked !== false;
                return (
                  <Pressable key={key} onPress={() => toggle(key)} style={[styles.card, !tracked && styles.cardPaused]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{contractBadge(key)}{title}</Text>
                      <Text style={[styles.stagePill, !tracked && styles.stagePillPaused]}>{!tracked ? '⏸ PAUSED' : q.state}</Text>
                    </View>
                    <Text style={styles.cardFaction}>Lead · {q.location.name}</Text>
                    {movesLine(q.location?.id)}
                    {contractRoute(key, tracked)}
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
                        accessibilityRole="button"
                      >
                        <Text style={styles.discardBtnText}>DISCARD LEAD</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* OTA-691 — CARRIED SIGILS. A slain faction member's crest, returnable to
              that faction's stake to honor their dead (+1 standing). One row per
              carried sigil: faction, reward, turn-in tile, and an auto-routable
              SET COURSE — or a RETURN button when you're standing on the tile. */}
          {player && carriedSigils(player.inventory).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">SIGILS</Text>
              <Text style={styles.whispersBlurb}>
                Crests taken off the fallen. Carry each back to its faction's stake
                and lay it down among their own — they honor the dead you bring home.
              </Text>
              {byMoves(carriedSigils(player.inventory), (sg) => sg.tileId).map((sg) => {
                // OTA-783 — the Hidden Market brokers any faction's sigil, so the
                // RETURN button lights up there too, not only at the home stake.
                const atMarket = standingAtLocation(player, 'hidden_market');
                const here = standingAtLocation(player, sg.tileId) || atMarket;
                const qty = sg.item.quantity > 1 ? ` ×${sg.item.quantity}` : '';
                return (
                  <View key={`sigil_${sg.item.id}`} style={styles.card}>
                    <View style={styles.cardHead}>
                      <Text style={styles.cardTitle}>{sg.item.name}{qty}</Text>
                      <Text style={styles.stagePill}>+1</Text>
                    </View>
                    <Text style={styles.cardFaction}>{sg.factionName} · honor their dead</Text>
                    <Text style={styles.cardStageBody}>
                      {atMarket
                        ? `The Hidden Market brokers it — turn it in here for +1 ${sg.factionName} standing.`
                        : here
                          ? `You're at ${safeLocName(sg.tileId)}. Lay the sigil down among their own.`
                          : `○ Return it at ${safeLocName(sg.tileId)} — or the Hidden Market — for +1 ${sg.factionName} standing.`}
                    </Text>
                    {!here && movesLine(sg.tileId)}
                    {here ? (
                      <Pressable
                        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                        onPress={() => turnInSigil(sg.item.id)}
                        accessibilityRole="button"
                      >
                        <Text style={styles.routeBtnText}>▸ RETURN THE SIGIL (+1 {sg.factionName.toUpperCase()})</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={({ pressed }) => [styles.routeBtn, pressed && styles.routeBtnPressed]}
                        onPress={() => setPendingRoute({ id: sg.tileId, name: safeLocName(sg.tileId) })}
                        accessibilityRole="button"
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
        <View style={styles.routeScrim} accessibilityViewIsModal={true}>
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
                accessibilityRole="button"
              >
                <Text style={styles.routeBtnTextNeutral}>CANCEL</Text>
              </Pressable>
              <Pressable
                style={styles.routeBtnPrimary}
                accessibilityRole="button"
                onPress={() => {
                  if (!pendingRoute || !player) return;
                  const id = pendingRoute.id;
                  const name = pendingRoute.name;
                  const missionId = pendingRoute.missionId;
                  setPendingRoute(null);
                  // A mission route starts the auto-chain (objective → turn-in)
                  // and makes that contract the single active mission.
                  if (missionId) {
                    // ⚠ OTA-1350 — B6: inside an outpost, a mission route asks the
                    // same leave-the-outpost Yes/No the plain course always has;
                    // the confirm carries the missionId so accepting still routes
                    // the contract, not a bare course.
                    if (player.hubRoomId) {
                      requestTravelConfirm(id, name, { missionId });
                      setScreen('exploration');
                      return;
                    }
                    routeMission(missionId);
                    setScreen('exploration');
                    return;
                  }
                  // ⚠ OTA-1304 — a tower routes like a contract: the course is
                  // set AND it becomes the mission you're on, everything else
                  // paused. That is what "like the rest of them" means here.
                  if (pendingRoute.climbId) {
                    // ⚠ OTA-1350 — B6: same rule for a tower's SET COURSE.
                    if (player.hubRoomId) {
                      requestTravelConfirm(id, name, { climbId: pendingRoute.climbId });
                      setScreen('exploration');
                      return;
                    }
                    routeGreatClimb(pendingRoute.climbId);
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

      {/* ⚠⚠ OTA-1402 — THE REFUSAL CARD. Absolute overlay, deliberately NOT a
          native <Modal>: this screen is itself presented inside one, and arb73
          recorded that iPad/iOS can present a nested native Modal INVISIBLY —
          rendering nothing while its backdrop still eats touches. That failure
          would turn "the button does nothing" into "the whole screen does
          nothing", which is strictly worse than the bug being fixed. */}
      {contractsNotice?.body ? (
        <View style={styles.refusalOverlay} pointerEvents="box-none">
          <Pressable
            style={styles.refusalBackdrop}
            onPress={clearContractsNotice}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View style={styles.refusalCard} accessibilityViewIsModal>
            <Text style={styles.refusalTitle}>{contractsNotice.title ?? 'CANNOT HAND THIS IN HERE'}</Text>
            <Text style={styles.refusalBody}>{contractsNotice.body}</Text>
            {/* ⚠⚠ OTA-1403 — THE WAY OUT, WHEN THERE IS ONE. The COMPLETE button is
                face-to-face by design (B2), and the courier has only ever been
                reachable by TYPING "send word <contract>" — so a player tapping
                buttons could not get at a feature the game has had since OTA-456.
                That is most of why ten taps read as ten dead ends. Rendered only
                when the store said a runner can genuinely carry this one. */}
            {contractsNotice.action ? (
              <TouchableOpacity
                style={[styles.refusalButton, styles.refusalButtonPrimary]}
                onPress={() => sendContractByRunner(
                  contractsNotice.action!.kind, contractsNotice.action!.id,
                )}
                accessibilityRole="button"
                accessibilityLabel={contractsNotice.action.label}
              >
                <Text style={styles.refusalButtonText}>{contractsNotice.action.label}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.refusalButton}
              onPress={clearContractsNotice}
              accessibilityRole="button"
              accessibilityLabel={contractsNotice.action ? 'Not now' : 'Got it'}
            >
              <Text style={styles.refusalButtonText}>
                {contractsNotice.action ? 'NOT NOW' : 'GOT IT'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
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
  // OTA-1183 — opens the full-story overlay. The store action re-checks completeness, so
  // this button cannot show a story the player has not actually finished.
  const openStoryReveal = useGameStore((s) => s.openStoryReveal);
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
        <Text style={styles.sectionTitle} accessibilityRole="header">CHARACTER STORIES</Text>
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
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
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
                  <>
                    <Text style={styles.completeBanner}>
                      ✦ {story.characterName}&apos;s story is complete — every fragment recovered.
                    </Text>
                    {/* OTA-1184 — the standing buff this story pays, if it pays one.
                        ⚠ Not every story does, by the owner's design, so the absence of a
                        line here is correct rather than a missing feature. */}
                    {storyPerkLabel(story.id) && (
                      <Text style={styles.perkLine}>✦ {storyPerkLabel(story.id)}</Text>
                    )}
                    {/* ⚠ OTA-1183 — READ IT WHOLE, ON DEMAND. The completion screen raises
                        itself once, at the moment the set closes. Without this button that
                        is the ONLY time the assembled story is ever readable end to end,
                        which is the same "ends in nothing" defect one step further along
                        (PUNCHLIST P1). */}
                    <TouchableOpacity
                      style={styles.readStoryBtn}
                      onPress={() => openStoryReveal(story.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Read ${story.characterName}'s story`}
                    >
                      <Text style={styles.readStoryText}>READ THE WHOLE STORY</Text>
                    </TouchableOpacity>
                  </>
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
  // OTA-1183 — READ THE WHOLE STORY, on a completed set.
  readStoryBtn: {
    alignSelf: 'flex-start', marginTop: 10, paddingVertical: 8, paddingHorizontal: 16,
    borderWidth: 1, borderColor: '#3a4348', backgroundColor: '#141a1d',
  },
  readStoryText: { color: '#cdbf99', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  // OTA-1184 — the permanent buff a completed story grants.
  perkLine: { color: '#8fbf9f', fontSize: 12, marginTop: 6, fontStyle: 'italic', lineHeight: 18 },
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
  // OTA-1471 — a settling seat reads muted, matching the exploration chip, so
  // neither surface looks like a live call to action while it names a wait.
  summonChipWait: { borderColor: '#5c5343' },
  summonChipWaitText: { color: '#8b8069' },
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
    color: '#a2977b',
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
  // arb148 — cap the expanded Capital list to ~42% of the screen and scroll it
  // internally so the 9th row never falls off the bottom of the fixed card.
  mqTrackerScroll: {
    maxHeight: Math.round(Dimensions.get('window').height * 0.42),
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
  mqTrackerGuardian: { color: '#a2977b', fontSize: 10, fontStyle: 'italic', marginTop: 1 },
  mqTrackerFoot: { color: '#a2977b', fontSize: 10, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },
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
  npcRow: { marginBottom: 2 },
  npcDealings: { color: '#8a7f6a', fontSize: 11, lineHeight: 15 },
  npcFootnote: { color: '#6f6656', fontSize: 10, lineHeight: 14, marginTop: 8, fontStyle: 'italic' },
  milestoneDetailEmpty: {
    color: '#a2977b',
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
  placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80 },
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
  emptySub: { color: '#a2977b', fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  section: { marginBottom: 14 },
  // ⚠ OTA-1459 — the slate filter chips. Outlined, never filled: OTA-1454 reserved a
  // solid fill for the turn-ending strike, and a view toggle is the mildest control on
  // the screen. The SELECTED chip is marked by a brighter border and text rather than a
  // fill, so it reads as "this one" without shouting.
  slateRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingBottom: 6 },
  slateBtn: {
    borderColor: '#3a342c', borderWidth: 1, backgroundColor: '#12100e',
    borderRadius: 4, paddingVertical: 5, paddingHorizontal: 10,
  },
  slateBtnOn: { borderColor: '#c9a86a' },
  slateBtnText: { color: '#8a8070', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  slateBtnTextOn: { color: '#c9a86a' },
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
  cardFaction: { color: '#a2977b', fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  cardLocation: { color: '#9ec96a', fontSize: 11, marginBottom: 4, letterSpacing: 0.5 },
  // arb-fix — "◈ N moves away" line under a card's location (teal, distinct from
  // the green 📍 place line so distance reads as its own datum).
  cardMoves: { color: '#7fb0a8', fontSize: 11, marginBottom: 4, letterSpacing: 0.5 },
  // arb-fix — SORT BY DISTANCE toggle bar (top of the missions scroll).
  sortBar: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  sortBarOn: { borderColor: '#7fb0a8', backgroundColor: '#141d1c' },
  sortBarPressed: { opacity: 0.7 },
  // OTA-1152 — the two sort buttons share the row; READY sits to the right of
  // BY DISTANCE, same shape, and lights the completion-green the COMPLETE button
  // uses so "ready" reads as the same idea in both places.
  sortRow: { flexDirection: 'row', gap: 6 },
  sortBarHalf: { flex: 1 },
  sortBarReadyOn: { borderColor: '#9ec96a', backgroundColor: '#161c12' },
  sortBarReadyText: { color: '#9ec96a' },
  readyCard: { borderColor: '#9ec96a' },
  readyTag: { color: '#9ec96a', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  readyEmpty: { color: '#a2977b', fontSize: 11, fontStyle: 'italic', letterSpacing: 0.5 },
  sortBarText: { color: '#cdbf99', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  sortBarTextOn: { color: '#7fb0a8' },
  sortBarHint: { color: '#a2977b', fontSize: 9, letterSpacing: 0.5, marginTop: 2 },
  // arb-fix — the Primary Objective box's header row (title + compact sort button).
  mqTrackerHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mqSortBtn: {
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  mqSortBtnOn: { borderColor: '#7fb0a8', backgroundColor: '#141d1c' },
  mqSortText: { color: '#cdbf99', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  // 2026-05-26 OTA-055 — difficulty chip below location, color-coded
  // vs player state. Same green / amber / red traffic light the rest
  // of the game uses.
  difficultyChip: { fontSize: 11, marginBottom: 6, letterSpacing: 0.5, fontWeight: '700' },
  difficultyChipReady: { color: '#9ec96a' },
  difficultyChipMarginal: { color: '#c9a86a' },
  difficultyChipDangerous: { color: '#e07a5f' },
  cardBody: { color: '#cdbf99', fontSize: 12, lineHeight: 17 },
  cardHint: { color: '#c9a86a', fontSize: 11, fontStyle: 'italic', marginTop: 4, letterSpacing: 0.5 },
  // OTA-1164 — the non-tappable course states. Muted, not the gold call-to-action
  // colour, so a status line never reads as something to press.
  bountyCourseNote: { color: '#a2977b', fontSize: 11, fontStyle: 'italic', marginTop: 4, letterSpacing: 0.5 },
  // OTA-866 — bounty countdown: a bordered time pill + a draining bar.
  bountyTimerPill: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  bountyTimerTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(122,112,92,0.25)', marginTop: 6, marginBottom: 2, overflow: 'hidden' },
  bountyTimerFill: { height: 4, borderRadius: 2 },
  cardStageLabel: { color: '#c9a86a', fontSize: 10, letterSpacing: 2, fontWeight: '700', marginTop: 8, marginBottom: 2 },
  cardStageBody: { color: '#e6d8b3', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  whispersBlurb: { color: '#a2977b', fontSize: 11, fontStyle: 'italic', lineHeight: 15, marginBottom: 8 },
  cardStageHint: { color: '#9ec96a', fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  // OTA 020 — expanded contract card styles.
  expanded: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#3a342c' },
  expandedLabel: { color: '#a2977b', fontSize: 10, letterSpacing: 2, marginTop: 8, marginBottom: 2 },
  expandedBody: { color: '#cdbf99', fontSize: 12, lineHeight: 17 },
  expandedStage: { color: '#a2977b', fontSize: 11, lineHeight: 16, paddingLeft: 4, marginBottom: 2 },
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
  // OTA-1014 — refusal strip: amber warning treatment, distinct from the green route
  // notes and the teal activate toggle.
  contractsNotice: {
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#2a2118',
    borderColor: '#e0a75f',
    borderWidth: 1,
    borderRadius: 3,
  },
  contractsNoticePressed: { opacity: 0.7 },
  contractsNoticeText: { color: '#e8c894', fontSize: 12, lineHeight: 17 },
  contractsNoticeDismiss: { marginTop: 5, color: '#a98a5e', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  // ⚠ OTA-1402 — the refusal card. Centred over the list, with a backdrop that
  // also dismisses, so the explanation cannot be scrolled away from.
  refusalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', padding: 22,
  },
  refusalBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  refusalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: '#191410',
    borderColor: '#e0a75f', borderWidth: 1, borderRadius: 4,
    paddingVertical: 18, paddingHorizontal: 18,
  },
  refusalTitle: {
    color: '#e0a75f', fontSize: 12, fontWeight: '700', letterSpacing: 1.4,
    marginBottom: 12, textAlign: 'center',
  },
  refusalBody: { color: '#e8dcc8', fontSize: 13, lineHeight: 20 },
  refusalButton: {
    marginTop: 18, alignSelf: 'center',
    paddingVertical: 10, paddingHorizontal: 30,
    borderColor: '#e0a75f', borderWidth: 1, borderRadius: 3,
    backgroundColor: '#2a2118',
  },
  refusalButtonText: { color: '#e8c894', fontSize: 12, fontWeight: '700', letterSpacing: 1.4 },
  refusalButtonPrimary: { backgroundColor: '#3a2c1c', borderColor: '#f0bd77' },
  // Activate / deactivate toggle (single-active). Active = teal; paused = grey.
  trackBtn: {
    marginTop: 8, backgroundColor: 'transparent', borderColor: '#54d6c4',
    borderWidth: 1, borderRadius: 3, paddingVertical: 8, alignItems: 'center',
  },
  // ⚠ OTA-1361 — THE ACTIVE ONE GLOWS. Owner: "the set active buttons should glow
  // on missions." Teal-on-dark vs grey-on-dark is a hue difference you have to
  // hunt for down a long slate; a lit button you find at a glance. Four layers so
  // it survives both platforms: a tinted FILL (Android draws no elevation shadow
  // behind a transparent view), a brighter border, the box glow, and a text halo
  // (textShadow is the one glow that renders identically on iOS and Android).
  trackBtnOn: {
    backgroundColor: '#123a3a',
    borderColor: '#7ef0dd',
    borderWidth: 2,
    shadowColor: '#54d6c4',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  trackBtnOff: { borderColor: '#5a6a6e' },
  trackBtnPressed: { opacity: 0.7 },
  trackBtnText: { color: '#54d6c4', fontWeight: '700', letterSpacing: 1, fontSize: 11 },
  trackBtnTextOn: {
    color: '#c7fff4', fontWeight: '800',
    textShadowColor: '#54d6c4', textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 },
  },
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
    borderColor: '#a2977b',
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 10,
    alignItems: 'center',
  },
  discardBtnText: { color: '#a2977b', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
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
  tabBtnText: { color: '#a2977b', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
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
  fragHint: { color: '#a2977b', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  completeBanner: { color: '#9ec96a', fontSize: 11, letterSpacing: 1, fontWeight: '700', marginTop: 4 },
});
