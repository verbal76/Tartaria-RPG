// OTA-849 [living world] — the WORLD view. One place to read the state of the
// waste that moves without you: every faction's current momentum on the World
// Pulse (rising / waning), your standing with each, and the running feed of
// rumours (the pulses that have fired, in-game and while you were away). This is
// where the previously-invisible tides finally surface — the Character sheet only
// tagged factions you already stood with; here you see the whole board.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import factionsData from '../data/factions/factions.json';
import type { Faction } from '../engine/types';
import { tideLabel } from '../engine/worldPulse';
import { listBounties, bountyKey, bountyHoursLeft, giverDifficulty, bountyDeadlineFor, BOUNTY_DEADLINE_HOURS } from '../engine/factionBounty';
import { canonicalCellOf, canonicalDistanceFromGrid } from '../engine/worldMap';
import { FACTION_STARTING_LOCATION } from '../engine/character';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { getLocationById } from '../engine/encounter';
import { topGrudges, topAlliances, relationLabel } from '../engine/factionRelations';

export function WorldScreen() {
  const player = useGameStore((s) => s.player);
  const worldMemory = useGameStore((s) => s.worldMemory);
  const setScreen = useGameStore((s) => s.setScreen);
  // OTA-855 — collapsible standings so the WAR FEED gets the room. Power + grudges start
  // collapsed (the feed is the point); tap a header to fold/unfold, like the inventory.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ power: true, grudges: true });
  const sectionHeader = (key: string, label: string) => (
    <TouchableOpacity style={styles.secHeader} activeOpacity={0.6} onPress={() => setCollapsed((s) => ({ ...s, [key]: !s[key] }))}>
      <Text style={styles.secChevron}>{collapsed[key] ? '▸' : '▾'}</Text>
      <Text style={styles.secHeaderLabel}>{label}</Text>
      <Text style={styles.secHeaderHint}>{collapsed[key] ? 'tap to show' : 'tap to hide'}</Text>
    </TouchableOpacity>
  );

  const factions = factionsData as Faction[];
  const tides = worldMemory?.factionTides ?? {};
  // OTA-851 — the board: the world-event feed (newest first), richer than the raw rumours.
  const events = [...(worldMemory?.worldEvents ?? [])].reverse();
  const rumors = [...(worldMemory?.worldRumors ?? [])].reverse(); // fallback if no events yet
  const patrolCount = (worldMemory?.patrols ?? []).length;
  const standingOf = (id: string) => player?.factionStanding.find((r) => r.factionId === id)?.standing ?? 0;
  // OTA-853 — the live grudge board: who's at whose throat right now.
  const grudges = topGrudges(worldMemory?.factionRelations, factions, 6);
  // OTA-867 — the alliances board: lore-seeded + emergent (enemy-of-my-enemy) friendships.
  const alliances = topAlliances(worldMemory?.factionRelations, factions, 6);
  const nameOfFac = (id: string) => factions.find((f) => f.id === id)?.name ?? id;
  // A small glyph per event kind so the board reads at a glance.
  const glyphFor = (kind: string): string => (
    { surge: '▲', setback: '▼', skirmish: '⚔', muster: '⚑', warband: '⚔', bounty: '◆',
      schism: '✂', truce: '☮', defector: '↩', pilgrimage: '⛨', caravan: '⛟', relic: '✦',
      market: '⚖', omen: '☄', purge: '✖', windfall: '✧', patrol_clash: '⚔', outpost_assault: '⌂', patrol_mauled: '☠', bloc_battle: '🛡' }[kind] ?? '🗞'
  );

  // OTA-850/859 — the bounty BOARD: every contract the player holds, plus a slate of
  // fresh offers to stack (routing them into patrol country). Kills grind EVERY held
  // bounty whose quarry they match, so several at once = faster standing.
  const activeBounties = player
    ? (player.activeBounties && player.activeBounties.length > 0
        ? player.activeBounties
        : player.activeBounty ? [player.activeBounty] : [])
    : [];
  const heldKeys = new Set(activeBounties.map((b) => bountyKey(b)));
  const MAX_BOUNTIES = 3;
  const slateFull = activeBounties.length >= MAX_BOUNTIES;
  const nowHour = player?.hoursElapsed ?? 0;
  // OTA-862 — how urgent a held bounty's countdown reads.
  const timeLabel = (b: (typeof activeBounties)[number]): string => {
    const left = bountyHoursLeft(b, nowHour);
    if (!Number.isFinite(left)) return 'no deadline';
    return left <= 0 ? 'lapsed' : `${Math.ceil(left)}h left`;
  };
  // OTA-863 — the deadline is DISTANCE-AWARE. Estimate an offer's window from the player's
  // current cell so the board can say how long you'll really have before you accept.
  const estDeadline = (targetLocationId: string): number => {
    if (!player) return BOUNTY_DEADLINE_HOURS;
    const cell = canonicalCellOf(player.currentLocationId);
    return bountyDeadlineFor(canonicalDistanceFromGrid(cell.x, cell.y, targetLocationId));
  };
  // OTA-862 — a faction that dislikes you still offers work, just a harder job. Frame it.
  const difficultyNote = (giverId: string): string | null => {
    const s = player?.factionStanding.find((r) => r.factionId === giverId)?.standing ?? 0;
    const d = giverDifficulty(s);
    if (d === 0) return null; // favored — no note, it's the easy job
    if (d === 1) return 'They barely know you — a fair test.';
    if (d === 2) return "They don't trust you — a harder job to prove yourself.";
    return 'They despise you — a punishing job, but it pays real standing.';
  };
  const offers = player
    ? listBounties(
        factions,
        player.factionStanding,
        (fid) => FACTION_STARTING_LOCATION[fid],
        (loc) => getLocationById(loc).name ?? loc,
        tides,
        4,
      ).filter((b) => !heldKeys.has(bountyKey(b)))
    : [];

  // Sort factions by momentum (most ascendant first), then name.
  const rows = [...factions].sort((a, b) => {
    const d = (tides[b.id] ?? 0) - (tides[a.id] ?? 0);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  return (
    <View style={styles.container}>
      <FirstTimeHint
        id="world_first_open"
        title="The living world"
        body="This board is alive — factions fight, gain, and lose ground on their own. Take bounties here; tap a header to unfold the standings."
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setScreen('exploration')} style={styles.backBtn} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>THE WORLD</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.intro}>
          The waste does not wait for you. Factions gain and lose ground on their own — while you
          play and while you are away. Here is where the power stands.
        </Text>

        {/* ── FACTION BOUNTY BOARD ──────────────────────────────── */}
        <Text style={styles.sectionLabel}>FACTION BOUNTY BOARD</Text>

        {/* Contracts the player currently carries — kills grind ALL of these at once. */}
        {activeBounties.map((b) => (
          <View key={`held-${bountyKey(b)}`} style={styles.card}>
            <Text style={styles.bountyHead}>{b.giverName} — contract in progress</Text>
            <Text style={styles.bountyBody}>Hunt {b.targetName} near {b.targetLocationName}.</Text>
            <Text style={styles.bountyProgress}>
              {b.progress}/{b.count} put down · reward {b.rewardTc} TC · {timeLabel(b)}
            </Text>
            <TouchableOpacity
              style={styles.bountySecondaryBtn}
              activeOpacity={0.8}
              onPress={() => { useGameStore.getState().setTravelCourse(b.targetLocationId); setScreen('exploration'); }}
            >
              <Text style={styles.bountySecondaryText}>SET COURSE TO {b.targetLocationName.toUpperCase()} ›</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Fresh offers to stack (up to the slate cap). */}
        {offers.length > 0 && !slateFull ? (
          offers.map((offer) => (
            <View key={`offer-${bountyKey(offer)}`} style={styles.card}>
              <Text style={styles.bountyHead}>{offer.giverName} have work for you</Text>
              <Text style={styles.bountyBody}>
                Put down {offer.count} of the {offer.targetName} at {offer.targetLocationName}. Pays {offer.rewardTc} TC
                and {offer.giverName} standing. Expires in {estDeadline(offer.targetLocationId)} in-game hours.
              </Text>
              {difficultyNote(offer.giverFactionId) ? (
                <Text style={styles.bountyWarn}>⚠ {difficultyNote(offer.giverFactionId)}</Text>
              ) : null}
              <Text style={styles.bountyFoot}>
                {activeBounties.length > 0
                  ? `↳ Adds to your slate — your current course holds.`
                  : `↳ Accepting sets your course to ${offer.targetLocationName} — patrolled ground.`}
              </Text>
              <TouchableOpacity
                style={styles.bountyBtn}
                activeOpacity={0.8}
                onPress={() => { useGameStore.getState().acceptBounty(offer); setScreen('exploration'); }}
              >
                <Text style={styles.bountyBtnText}>
                  {activeBounties.length > 0 ? 'ACCEPT (STACK) ›' : 'ACCEPT & SET COURSE ›'}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.card}>
            <Text style={styles.empty}>
              {slateFull
                ? `Your slate is full (${MAX_BOUNTIES} contracts). Complete one and the board refreshes.`
                : activeBounties.length > 0
                  ? 'No further contracts on offer right now — the war will throw up more soon.'
                  : 'No bounties on offer right now. As factions clash, they post work against their rivals — check back.'}
            </Text>
          </View>
        )}

        {/* ── BALANCE OF POWER ──────────────────────────────────── */}
        {sectionHeader('power', 'BALANCE OF POWER')}
        {!collapsed.power && (
        <View style={styles.card}>
          {rows.map((f) => {
            const m = tides[f.id] ?? 0;
            const tag = tideLabel(m);
            const standing = standingOf(f.id);
            const tagColor = m > 0 ? '#9ec96a' : m < 0 ? '#c98a6a' : '#a2977b';
            const standColor = standing >= 20 ? '#9ec96a' : standing >= 0 ? '#cdbf99' : standing >= -10 ? '#c9a86a' : '#e07a5f';
            // A little momentum meter: −5…+5 mapped to a 11-cell bar with the center marked.
            const cells = Array.from({ length: 11 }, (_, i) => i - 5);
            return (
              <View key={f.id} style={styles.facRow}>
                <View style={styles.facHead}>
                  <Text style={styles.facName}>{f.name}</Text>
                  <Text style={[styles.facTag, { color: tagColor }]}>
                    {tag ? `${tag.glyph} ${tag.word}` : 'steady'}
                  </Text>
                </View>
                <View style={styles.meterRow}>
                  {cells.map((c) => {
                    const on = (m >= 0 && c > 0 && c <= m) || (m < 0 && c < 0 && c >= m);
                    const isCenter = c === 0;
                    return (
                      <Text
                        key={c}
                        style={[
                          styles.meterCell,
                          isCenter && styles.meterCenter,
                          on && (m > 0 ? styles.meterOnPos : styles.meterOnNeg),
                        ]}
                      >
                        {isCenter ? '│' : on ? '▮' : '·'}
                      </Text>
                    );
                  })}
                  <Text style={[styles.facStanding, { color: standColor }]}>
                    you {standing >= 0 ? '+' : ''}{standing}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={styles.footNote}>
            ↳ Momentum shifts a faction's reach: ascendant traders charge more, and a faction on
            the rise fields bigger raiding parties against those who side with its rivals.
          </Text>
        </View>
        )}

        {/* ── GRUDGES & ALLIANCES ───────────────────────────────── */}
        {(grudges.length > 0 || alliances.length > 0) && (
          <>
            {sectionHeader('grudges', 'GRUDGES & ALLIANCES')}
            {!collapsed.grudges && (
            <View style={styles.card}>
              {grudges.length > 0 && <Text style={styles.relHead}>⚔ GRUDGES</Text>}
              {grudges.map((g, i) => {
                const lab = relationLabel(g.relation);
                return (
                  <View key={`g${i}`} style={styles.grudgeRow}>
                    <Text style={styles.grudgeText}>{nameOfFac(g.a)}  vs  {nameOfFac(g.b)}</Text>
                    <Text style={[styles.grudgeTag, { color: lab.hostile ? '#e07a5f' : '#9ec96a' }]}>{lab.word}</Text>
                  </View>
                );
              })}
              {alliances.length > 0 && <Text style={[styles.relHead, { marginTop: grudges.length > 0 ? 10 : 0 }]}>🤝 ALLIANCES</Text>}
              {alliances.map((g, i) => {
                const lab = relationLabel(g.relation);
                return (
                  <View key={`a${i}`} style={styles.grudgeRow}>
                    <Text style={styles.grudgeText}>{nameOfFac(g.a)}  &amp;  {nameOfFac(g.b)}</Text>
                    <Text style={[styles.grudgeTag, { color: '#9ec96a' }]}>{lab.word}</Text>
                  </View>
                );
              })}
              <Text style={styles.footNote}>↳ Both are earned: patrols that gut each other deepen feuds, while factions that
                bloody a common enemy warm toward each other — alliances of shared foes. The world takes its own sides.</Text>
            </View>
            )}
          </>
        )}

        {/* ── THE BOARD (world events) ──────────────────────────── */}
        <Text style={styles.sectionLabel}>THE BOARD — THE WAR, AS IT HAPPENS</Text>
        {patrolCount > 0 && (
          <Text style={styles.patrolNote}>⚑ {patrolCount} faction patrol{patrolCount === 1 ? '' : 's'} abroad in the waste.</Text>
        )}
        <View style={styles.card}>
          {events.length > 0 ? (
            events.map((e, i) => (
              <View key={i} style={styles.rumorRow}>
                <Text style={styles.rumorGlyph}>{glyphFor(e.kind)}</Text>
                <Text style={styles.rumorText}>{e.text}</Text>
              </View>
            ))
          ) : rumors.length > 0 ? (
            rumors.map((r, i) => (
              <View key={i} style={styles.rumorRow}>
                <Text style={styles.rumorGlyph}>🗞</Text>
                <Text style={styles.rumorText}>{r.text}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>The waste is quiet — for now. Give it time; the factions never rest long.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 4 },
  backBtn: { backgroundColor: '#1a1714', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 10, minWidth: 80, alignItems: 'center' },
  backText: { color: '#c9a86a', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  title: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  intro: { color: '#bcae88', fontSize: 12, lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  sectionLabel: { color: '#c9a86a', fontSize: 11, letterSpacing: 3, fontWeight: '700', marginTop: 12, marginBottom: 6, paddingHorizontal: 4 },
  card: { backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, borderRadius: 4, padding: 12 },
  facRow: { paddingVertical: 7, borderBottomColor: '#1f1c18', borderBottomWidth: 1 },
  facHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  facName: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  facTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  meterRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  meterCell: { color: '#3a342c', fontSize: 12, width: 11, textAlign: 'center' },
  meterCenter: { color: '#a2977b' },
  meterOnPos: { color: '#9ec96a' },
  meterOnNeg: { color: '#c98a6a' },
  facStanding: { fontSize: 10, marginLeft: 8, letterSpacing: 0.3 },
  footNote: { color: '#a2977b', fontSize: 10, fontStyle: 'italic', marginTop: 8, lineHeight: 14 },
  patrolNote: { color: '#c98a6a', fontSize: 11, fontStyle: 'italic', marginBottom: 4, paddingHorizontal: 4 },
  // OTA-855b — make the collapsible headers read clearly as tappable controls: a plate
  // with a border + gold left accent bar + a chevron and a "tap to show/hide" hint.
  secHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20,17,15,0.9)',
    borderWidth: 1,
    borderColor: '#c9a86a',
    borderLeftWidth: 4,
    borderRadius: 4,
    paddingLeft: 8,
    paddingRight: 10,
    paddingVertical: 9,
    marginTop: 12,
    marginBottom: 6,
  },
  secChevron: { color: '#c9a86a', fontSize: 12, fontWeight: '900', width: 16, textAlign: 'center', marginRight: 4 },
  secHeaderLabel: { color: '#e6d8b3', fontSize: 11, letterSpacing: 3, fontWeight: '700', flex: 1 },
  secHeaderHint: { color: '#a2977b', fontSize: 9, fontStyle: 'italic', letterSpacing: 0.5 },
  grudgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 4, borderBottomColor: '#1f1c18', borderBottomWidth: 1 },
  grudgeText: { color: '#cdbf99', fontSize: 12 },
  grudgeTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  // OTA-867 — sub-headers splitting the grudges list from the alliances list.
  relHead: { color: '#a2977b', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  rumorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  rumorGlyph: { fontSize: 12, width: 18, textAlign: 'center' },
  rumorText: { color: '#cdbf99', fontSize: 12, lineHeight: 17, flex: 1 },
  empty: { color: '#a2977b', fontSize: 12, fontStyle: 'italic' },
  // OTA-850 — bounty card.
  bountyHead: { color: '#e6d8b3', fontSize: 13, fontWeight: '700', letterSpacing: 0.3, marginBottom: 3 },
  bountyBody: { color: '#cdbf99', fontSize: 12, lineHeight: 17 },
  bountyProgress: { color: '#9ec96a', fontSize: 12, fontWeight: '700', marginTop: 4 },
  bountyFoot: { color: '#c98a6a', fontSize: 10, fontStyle: 'italic', marginTop: 6, lineHeight: 14 },
  // OTA-862 — "they don't like you, so it's a harder job" note on a low-standing offer.
  bountyWarn: { color: '#c98a6a', fontSize: 11, fontWeight: '700', marginTop: 5 },
  bountyBtn: { marginTop: 10, backgroundColor: '#c9a86a', borderRadius: 3, paddingVertical: 9, alignItems: 'center' },
  bountyBtnText: { color: '#13110f', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  // OTA-859 — re-route to a held bounty (outline button, secondary to the gold ACCEPT).
  bountySecondaryBtn: { marginTop: 9, borderColor: '#c9a86a', borderWidth: 1, borderRadius: 3, paddingVertical: 8, alignItems: 'center' },
  bountySecondaryText: { color: '#c9a86a', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
});
