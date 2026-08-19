// v2.4.1 (OTA 046) — Lore Codex body component.
//
// Extracted from the original LoreScreen so the same content can
// render in TWO places:
//   1. The standalone LoreScreen (existing 'lore' route, unchanged
//      navigation contract)
//   2. As a tab inside the gear-icon AboutScreen, accessible from
//      both the title screen AND in-game (player request: "want it
//      always accessible from the gear icon").
//
// This component owns the section tabs (races / factions / places /
// timeline) and the scrollable entry list. No header — each host
// screen is responsible for its own back button + page chrome so the
// component can drop into either context cleanly.
//
// OTA 456 — Places entries become tap-to-route. Tapping a Place
// pops a confirmation: "Plan a route to <name>?" — yes calls
// gameStore.setTravelCourse(id) and switches to the exploration
// screen, matching the in-game `travel to <name>` flow. Tap-to-route
// only activates when there's an active player (so the title-screen
// host still renders the entries as info-only).

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { BrandedModal } from './BrandedModal';
import factionsData from '../data/factions/factions.json';
import racesData from '../data/races/races.json';
import locationsData from '../data/locations/locations.json';
import timelineData from '../data/events/timeline.json';
import enemiesData from '../data/enemies/enemies.json';
import conceptsData from '../data/lore/concepts.json';
import type { Faction, Race, Location, TimelineEvent } from '../engine/types';
import { useGameStore } from '../state/gameStore';
import { revealedLocationName, isLocationRevealed, isHiddenLocation } from '../engine/hiddenLocations';
import { isGreatClimbLocationLocked, SUMMIT_BOSS_BASES } from '../engine/greatClimbs';
import { loadFallen, type FallenHero } from '../engine/saveSystem';
import * as Clipboard from 'expo-clipboard';
import { fallenTitle, restRollLine, type ForeignFallen, type RestRecord } from '../engine/fallenLedger';
import {
  loadLedger, loadHouseName, setHouseName, buildExportPayload, importPayloadText,
} from '../engine/fallenLedgerStore';

// OTA-837 — Tier-1 QoL #2: the codex now includes a discovery-gated BESTIARY (fills
// in as you defeat enemy types) and a LORE tab that finally surfaces the 172-entry
// concepts bank (the "massive lore document" that lived in the files but was never
// shown to the player — only fed to the Arbiter's context). Both extend the existing
// races/factions/places/timeline codex rather than a new screen.
// OTA-845 — the FALLEN tab: an install-wide, cross-character memorial. Every character
// who dies is remembered here (saveSystem.loadFallen), so a run ending is never a clean
// wipe — later characters (and the title screen, between runs) can read who came before.
type Section = 'races' | 'factions' | 'places' | 'timeline' | 'bestiary' | 'lore' | 'fallen';

interface CodexEnemy {
  name: string;
  type?: string;
  hp?: number;
  damage?: string;
  rarity?: string;
  traits?: string[];
  loot?: string[];
  /** OTA-897 (SA-5) — one-line codex voice; shown once the foe is discovered. */
  flavor?: string;
}
interface LoreConcept { id: string; title: string; answer: string }

export function LoreCodexBody() {
  const [section, setSection] = useState<Section>('races');
  const [pendingRoute, setPendingRoute] = useState<Location | null>(null);
  // 2026-05-25 — branded refusal modal for the hub-room gate.
  // Replaces the native Alert.alert that was breaking the dark
  // theme on the title-screen path.
  const [hubRefusalDest, setHubRefusalDest] = useState<string | null>(null);
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  const setTravelCourse = useGameStore((s) => s.setTravelCourse);
  const appendLog = useGameStore((s) => s.appendLog);
  // OTA-498 — hidden locations (the Hidden Market) read as "?" here too until visited.
  const discoveredIds = useGameStore((s) => s.worldMemory?.discoveredLocationIds);
  // OTA-915 — the five Great-Climb towers stay masked as "?" until you use their
  // Skyreacher Chart (unlockedGreatClimbs), so the tower locations are a mystery
  // the roadside maps sell you.
  const unlockedClimbs = useGameStore((s) => s.worldMemory?.unlockedGreatClimbs);
  // OTA-837 — the bestiary reveals an enemy once you've DEFEATED its type (its name is
  // recorded in worldMemory.defeatedEnemies). Undiscovered foes read as "??? — undiscovered".
  const defeatedEnemies = useGameStore((s) => s.worldMemory?.defeatedEnemies);
  const defeatedSet = React.useMemo(
    () => new Set((defeatedEnemies ?? []).map((n) => n.toLowerCase())),
    [defeatedEnemies],
  );
  // OTA-838 — damage-type intel you've LEARNED by fighting each enemy (name-keyed).
  const enemyIntel = useGameStore((s) => s.worldMemory?.enemyIntel);
  // OTA-915 — the five Great-Climb SUMMIT BOSSES aren't in enemies.json (that pool
  // is rolled for random wild spawns), so project them in from greatClimbs.ts as
  // codex-only entries. They still gate on defeat like every other foe.
  const enemyCatalog = React.useMemo(
    () => [...(enemiesData as CodexEnemy[]), ...(SUMMIT_BOSS_BASES as unknown as CodexEnemy[])],
    [],
  );
  const beatenCount = enemyCatalog.filter((e) => defeatedSet.has(e.name.toLowerCase())).length;
  const concepts = (conceptsData as { concepts: LoreConcept[] }).concepts;
  // OTA-845 [The Fallen] — install-wide roll of the dead, loaded async from the global
  // stash. Newest first (most recent death at the top of the memorial).
  const [fallen, setFallen] = useState<FallenHero[]>([]);
  // ⚠⚠ OTA-1362 — the SHARED roll. `hollowed` are corpses imported from other
  // houses that this world has not yet put down; `rests` are the trophies, which
  // outlive the corpse and carry the death description home.
  const [hollowed, setHollowed] = useState<ForeignFallen[]>([]);
  const [rests, setRests] = useState<RestRecord[]>([]);
  const [house, setHouse] = useState('');
  const [exchangeNote, setExchangeNote] = useState('');
  const [busy, setBusy] = useState(false);
  const refreshLedger = React.useCallback(async () => {
    const l = await loadLedger();
    setHollowed([...l.foreign].reverse());
    setRests([...l.rests].reverse());
  }, []);
  useEffect(() => {
    let live = true;
    void loadFallen().then((f) => { if (live) setFallen([...f].reverse()); });
    void loadHouseName().then((h) => { if (live) setHouse(h); });
    void refreshLedger();
    return () => { live = false; };
  }, [refreshLedger]);

  /** Hand this house's dead out. The player carries the string wherever they
   *  like — the transport is theirs until the mailbox lands. */
  const shareMyDead = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const payload = await buildExportPayload();
      await Clipboard.setStringAsync(payload);
      setExchangeNote(`Copied. ${Math.round(payload.length / 1024)}KB of your dead — paste it to whoever you ride with.`);
    } catch {
      setExchangeNote('Could not copy. Try again.');
    } finally { setBusy(false); }
  };

  /** Take a house's dead in. Everything crosses the validator; a torn or
   *  hostile paste costs the paste and nothing else. */
  const importTheirDead = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || text.trim().length === 0) { setExchangeNote('Nothing on the clipboard to read.'); return; }
      const out = await importPayloadText(text);
      await refreshLedger();
      const bits = [`${out.added} joined your wastes`];
      if (out.rests > 0) bits.push(`${out.rests} put to rest elsewhere`);
      if (out.skippedDuplicate > 0) bits.push(`${out.skippedDuplicate} already known`);
      if (out.skippedRested > 0) bits.push(`${out.skippedRested} you already put down`);
      if (out.rejected > 0) bits.push(`${out.rejected} refused`);
      setExchangeNote(out.added === 0 && out.rests === 0
        ? `Nothing new. ${bits.join(' · ')}`
        : `${bits.join(' · ')}.${out.arrivals.length > 0 ? ` ${out.arrivals.slice(0, 3).join(', ')}${out.arrivals.length > 3 ? '…' : ''} walk now.` : ''}`);
    } catch {
      setExchangeNote('That paste was not a ledger.');
    } finally { setBusy(false); }
  };

  const canPlanRoute = !!player;
  const here = player?.currentLocationId ?? null;

  const confirmRoute = () => {
    if (!pendingRoute || !player) return;
    const id = pendingRoute.id;
    setPendingRoute(null);
    // OTA 458 — refuse the route when the player is still inside a hub
    // room. setTravelCourse reads currentLocationId (the macro tile
    // under the hub) and would step the player onto a procedural tile
    // while hubRoomId is still set, leaving the scene in a half-state.
    // The player has to leave the outpost first — same gate the
    // cardinal-travel handler applies for outdoor moves from hubs.
    if (player.hubRoomId) {
      // 2026-05-25 — branded modal replaces the OS Alert. Same copy
      // / same behavior on dismiss (back to exploration), just in
      // the dark+amber palette the rest of the game uses.
      setHubRefusalDest(pendingRoute.name);
      return;
    }
    setTravelCourse(id);
    setScreen('exploration');
  };

  return (
    <View style={styles.bodyWrap}>
      {/* OTA-852 — the 7 codex tabs no longer cram into the width and word-wrap;
          each tab sizes to its one-line label. UPDATED: the row now
          WRAPS instead of scrolling — the hidden horizontal scroll (indicator off,
          no cue) cut FALLEN and LORE off past the right edge on the owner's device;
          a tab that exists must be visible. */}
      <View style={styles.tabs}>
        {(['races', 'factions', 'places', 'timeline', 'bestiary', 'lore', 'fallen'] as Section[]).map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => setSection(s)}
            style={[styles.tab, section === s && styles.tabActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: section === s }}
          >
            <Text style={[styles.tabText, section === s && styles.tabTextActive]} numberOfLines={1}>
              {s === 'bestiary' ? 'beasts' : s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
        {section === 'races' && (racesData as Race[]).map((r) => {
          const statBumps = r.racialStatBonuses ?? {};
          const statBumpStrs = Object.entries(statBumps)
            .filter(([, v]) => (v ?? 0) !== 0)
            .map(([k, v]) => `${v! > 0 ? '+' : ''}${v} ${k.slice(0, 3).toUpperCase()}`);
          return (
            <View key={r.id} style={styles.entry}>
              <Text style={styles.name}>{r.name}</Text>
              <Text style={styles.desc}>{r.description}</Text>
              <Text style={styles.meta}>COMBAT • AC {r.baseAC} • Barehand {r.barehandDamage}</Text>
              {r.racialACBonus && r.racialACBonus !== 'No inherent AC bonus' && (
                <Text style={styles.meta}>↳ {r.racialACBonus}</Text>
              )}
              {statBumpStrs.length > 0 && (
                <Text style={styles.meta}>STATS • {statBumpStrs.join(', ')} (always on)</Text>
              )}
              {r.traits.map((t, i) => <Text key={i} style={styles.trait}>• {t}</Text>)}
              <Text style={styles.meta}>KIT • {r.startingTCFormula} TC • HP bonus +{r.startingHPBonus}</Text>
            </View>
          );
        })}
        {section === 'factions' && (factionsData as Faction[]).map((f) => (
          <View key={f.id} style={styles.entry}>
            <Text style={styles.name}>{f.name}</Text>
            <Text style={styles.subtitle}>{f.subtitle}</Text>
            <Text style={styles.desc}>Goal: {f.goal}</Text>
            <Text style={styles.desc}>{f.philosophy}</Text>
            <Text style={styles.meta}>Structure: {f.structure}</Text>
            <Text style={styles.meta}>Join: {f.joinRequirements}</Text>
          </View>
        ))}
        {section === 'places' && (locationsData as Location[]).map((l) => {
          const atHere = canPlanRoute && l.id === here;
          const hidden = isHiddenLocation(l.id) && !isLocationRevealed(l.id, discoveredIds);
          // OTA-915 — a Great-Climb tower stays masked until you've charted it.
          const climbLocked = isGreatClimbLocationLocked(l.id, { unlockedGreatClimbs: unlockedClimbs });
          const masked = hidden || climbLocked;
          const displayName = climbLocked ? '?' : revealedLocationName(l.id, l.name, discoveredIds);
          const subtitle = climbLocked ? 'unknown — a chart will lead you here'
            : hidden ? 'unknown — travel to reveal' : l.type;
          const desc = climbLocked ? 'A great climb the roadside cartographers keep off the common maps. Buy and read its Skyreacher Map to put it on yours.'
            : hidden ? 'A place that keeps no name on any map until you find it yourself.' : l.description;
          const content = (
            <>
              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
              <Text style={styles.desc}>{desc}</Text>
              <Text style={styles.meta}>Danger {l.danger}/5</Text>
              {canPlanRoute && !climbLocked ? (
                <Text style={styles.tapHint}>
                  {atHere ? '· you are here ·' : '▸ tap to plan a route'}
                </Text>
              ) : null}
            </>
          );
          // A masked climb can't be routed to until charted.
          if (!canPlanRoute || atHere || climbLocked) {
            return <View key={l.id} style={[styles.entry, climbLocked ? styles.entryLocked : null]}>{content}</View>;
          }
          return (
            <TouchableOpacity
              key={l.id}
              style={styles.entry}
              activeOpacity={0.7}
              onPress={() => setPendingRoute(l)}
              accessibilityRole="button"
            >
              {content}
            </TouchableOpacity>
          );
        })}
        {section === 'timeline' && (timelineData as TimelineEvent[]).map((e) => (
          <View key={`${e.year}_${e.name}`} style={styles.entry}>
            <Text style={styles.name}>{e.year} — {e.name}</Text>
            <Text style={styles.subtitle}>{e.location} • {e.outcome}</Text>
            <Text style={styles.desc}>{e.summary}</Text>
          </View>
        ))}
        {/* OTA-837 — BESTIARY. Fills in as you defeat enemy types; an unbeaten foe
            reads as an "??? — undiscovered" silhouette so the tab shows the shape of
            what's left to meet, not a spoiler dump. */}
        {section === 'bestiary' && (
          <>
            <Text style={styles.counter}>{beatenCount} of {enemyCatalog.length} catalogued</Text>
            {enemyCatalog.map((e, idx) => {
              const known = defeatedSet.has(e.name.toLowerCase());
              if (!known) {
                return (
                  <View key={`${e.name}_${idx}`} style={[styles.entry, styles.entryLocked]}>
                    <Text style={styles.lockedName}>??? — undiscovered</Text>
                    <Text style={styles.lockedSub}>Defeat one to record it here.</Text>
                  </View>
                );
              }
              const intel = enemyIntel?.[e.name.toLowerCase()];
              return (
                <View key={`${e.name}_${idx}`} style={styles.entry}>
                  <Text style={styles.name}>{e.name}</Text>
                  <Text style={styles.subtitle}>{e.type ?? 'Unknown'} • {e.rarity ?? 'Common'}</Text>
                  {/* OTA-897 (SA-5) — the bestiary now has a VOICE: a one-line
                      field description per foe, shown once you've recorded it. */}
                  {!!e.flavor && <Text style={styles.flavorLine}>{e.flavor}</Text>}
                  <Text style={styles.meta}>COMBAT • HP {e.hp ?? '?'} • Dmg {e.damage ?? '?'}</Text>
                  {(e.traits ?? []).length > 0 && (
                    <Text style={styles.meta}>TRAITS • {(e.traits ?? []).join(', ')}</Text>
                  )}
                  {/* OTA-838 — damage-type intel you've learned by fighting it. */}
                  {(intel?.weak.length ?? 0) > 0 && (
                    <Text style={styles.meta}>WEAK TO • {intel!.weak.join(', ')}</Text>
                  )}
                  {(intel?.resist.length ?? 0) > 0 && (
                    <Text style={styles.meta}>RESISTS • {intel!.resist.join(', ')}</Text>
                  )}
                  {(e.loot ?? []).length > 0 && (
                    <Text style={styles.meta}>DROPS • {(e.loot ?? []).join(', ')}</Text>
                  )}
                </View>
              );
            })}
          </>
        )}
        {/* OTA-837 — LORE. Surfaces the concepts bank (172 entries) that was already
            in the files feeding the Arbiter's context but never shown to the player.
            Reference material — always readable, not discovery-gated. */}
        {section === 'lore' && (
          <>
            <Text style={styles.counter}>{concepts.length} entries</Text>
            {concepts.map((c) => (
              <View key={c.id} style={styles.entry}>
                <Text style={styles.name}>{c.title}</Text>
                <Text style={styles.desc}>{c.answer}</Text>
              </View>
            ))}
          </>
        )}
        {/* OTA-845 — THE FALLEN. The install-wide memorial of dead characters. A run
            ending is never a clean wipe: every fallen predecessor is remembered here,
            readable between runs from the title screen too. */}
        {section === 'fallen' && (
          <>
          {fallen.length === 0 ? (
            <Text style={styles.fallenEmpty}>No one has fallen yet. Tartaria is patient.</Text>
          ) : (
            <>
              {/* OTA-995 — the header counts the ones still out there. */}
              <Text style={styles.counter}>
                {fallen.length} remembered
                {fallen.some((h) => !h.avengedBy)
                  ? ` • ${fallen.filter((h) => !h.avengedBy).length} still walking`
                  : ''}
              </Text>
              {fallen.map((h, i) => (
                <View key={`${h.name}_${h.ts}_${i}`} style={[styles.entry, styles.fallenEntry]}>
                  <Text style={styles.name}>† {h.name}</Text>
                  <Text style={styles.subtitle}>{h.raceName} • fell at {h.locationName}</Text>
                  <Text style={styles.desc}>{h.epitaph}</Text>
                  <Text style={styles.meta}>{h.kills} foes bested • {h.hours}h in Tartaria • {h.corruption}</Text>
                  {h.avengedBy ? (
                    <Text style={styles.meta}>— put to rest by {h.avengedBy}</Text>
                  ) : (
                    <Text style={styles.fallenWalking}>— STILL WALKING. Something in warrior's plate wears their name out in the mud.</Text>
                  )}
                </View>
              ))}
            </>
          )}

          {/* ⚠⚠ OTA-1362 — THE HOLLOWED: dead imported from other houses that
              this world has not yet put down. Named with their lineage, because
              a corpse that travelled carries its house — "Francis child of
              Sasmooch". They rise on quiet ground like your own dead do, and
              the more of them stand un-rested, the likelier the wastes are to
              give one back. */}
          {hollowed.length > 0 && (
            <>
              <Text style={styles.sectionHeading}>THE HOLLOWED</Text>
              <Text style={styles.counter}>
                {hollowed.length} walking your wastes, sent by other houses
              </Text>
              {hollowed.map((h, i) => (
                <View key={`hol_${h.origin.installId}_${h.ts}_${i}`} style={[styles.entry, styles.hollowedEntry]}>
                  <Text style={styles.name}>† {fallenTitle(h)}</Text>
                  <Text style={styles.subtitle}>{h.raceName} • fell at {h.locationName}</Text>
                  {!!h.epitaph && <Text style={styles.desc}>{h.epitaph}</Text>}
                  <Text style={styles.meta}>{h.kills} foes bested • {h.hours}h in Tartaria • {h.corruption}</Text>
                  <Text style={styles.fallenWalking}>— NEVER RECEIVED. The task is still on their lips, and they are looking for it here.</Text>
                </View>
              ))}
            </>
          )}

          {/* The separate roll the owner asked for: who it was, whose it was,
              and how it ended in YOUR world. */}
          {rests.length > 0 && (
            <>
              <Text style={styles.sectionHeading}>PUT TO REST</Text>
              <Text style={styles.counter}>{rests.length} errands finally set down</Text>
              {rests.map((r, i) => (
                <View key={`rest_${r.fallenKey}_${r.byInstallId}_${i}`} style={[styles.entry, styles.restEntry]}>
                  <Text style={styles.name}>✓ {restRollLine(r)}</Text>
                  {!!r.description && <Text style={styles.desc}>{r.description}</Text>}
                </View>
              ))}
            </>
          )}

          {/* THE EXCHANGE. Deliberately manual for now: a string out, a string
              in. The automatic mailbox calls these same two functions. */}
          <Text style={styles.sectionHeading}>THE EXCHANGE</Text>
          <Text style={styles.desc}>
            Your dead can walk in another player&apos;s wastes, and theirs in yours. Name your house,
            send your dead, and take in what they send back.
          </Text>
          <Text style={styles.meta}>YOUR HOUSE — your dead are named &quot;&lt;name&gt; child of {house || 'your house'}&quot; abroad.</Text>
          <TextInput
            style={styles.houseInput}
            value={house}
            onChangeText={setHouse}
            onEndEditing={() => { void setHouseName(house); }}
            onBlur={() => { void setHouseName(house); }}
            placeholder="your house name"
            placeholderTextColor="#7a705c"
            maxLength={32}
            accessibilityLabel="Your house name"
          />
          <View style={styles.exchangeRow}>
            <TouchableOpacity
              style={styles.exchangeBtn}
              onPress={() => { void shareMyDead(); }}
              accessibilityRole="button"
              disabled={busy}
            >
              <Text style={styles.exchangeBtnText}>SEND MY DEAD</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.exchangeBtn}
              onPress={() => { void importTheirDead(); }}
              accessibilityRole="button"
              disabled={busy}
            >
              <Text style={styles.exchangeBtnText}>TAKE IN THEIRS</Text>
            </TouchableOpacity>
          </View>
          {!!exchangeNote && <Text style={styles.exchangeNote}>{exchangeNote}</Text>}
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!pendingRoute}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingRoute(null)}
      >
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} accessibilityRole="header">PLAN A ROUTE</Text>
            <Text style={styles.modalBody}>
              Set course for {pendingRoute?.name}? The Arbiter will start
              the walk and the travel row will replace your cardinal
              controls until you arrive or STOP.
            </Text>
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setPendingRoute(null)}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.modalBtnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGo]}
                onPress={confirmRoute}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.modalBtnGoText}>SET COURSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2026-05-25 — branded refusal modal for hub-room gate.
          Same dark+amber palette as the rest of the game's popups. */}
      <BrandedModal
        visible={hubRefusalDest !== null}
        title="Leave the outpost first"
        body={hubRefusalDest
          ? `The Arbiter can't chart you to ${hubRefusalDest} from inside the outpost. Walk through the gate (or type "leave outpost"), then tap Set Course again.`
          : undefined}
        buttons={[
          {
            label: 'OK',
            onPress: () => {
              setHubRefusalDest(null);
              setScreen('exploration');
            },
            tone: 'primary',
          },
        ]}
        onRequestClose={() => {
          setHubRefusalDest(null);
          setScreen('exploration');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bodyWrap: { flex: 1 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: '#3a342c', borderRadius: 4, alignItems: 'center' },
  tabActive: { borderColor: '#c9a86a' },
  tabText: { color: '#a2977b', fontSize: 11, letterSpacing: 1 },
  tabTextActive: { color: '#e6d8b3' },
  scroll: { flex: 1 },
  entry: { backgroundColor: '#13110f', borderColor: '#3a342c', borderWidth: 1, padding: 10, borderRadius: 4, marginBottom: 8 },
  // OTA-837 — bestiary/lore chrome.
  counter: { color: '#a2977b', fontSize: 10, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' },
  // OTA-920 — a dashed border marks a locked row; do NOT dim the whole container
  // with opacity (group-opacity halved every child's contrast below WCAG AA — the
  // muted lockedName/lockedSub colors already read as "locked" vs the bright unlocked names).
  entryLocked: { borderStyle: 'dashed' },
  // OTA-845 — The Fallen memorial.
  fallenEntry: { borderLeftWidth: 3, borderLeftColor: '#6a5a4a' },
  // OTA-1362 — a foreign corpse reads colder than your own dead; a trophy reads settled.
  hollowedEntry: { borderLeftWidth: 3, borderLeftColor: '#5a6a7a' },
  restEntry: { borderLeftWidth: 3, borderLeftColor: '#4a6a4a' },
  sectionHeading: { color: '#c9a86a', fontSize: 13, fontWeight: '800', letterSpacing: 2, marginTop: 18, marginBottom: 4 },
  houseInput: {
    marginTop: 6, borderWidth: 1, borderColor: '#6a5a4a', borderRadius: 3,
    paddingHorizontal: 10, paddingVertical: 8, color: '#e8dcc0', fontSize: 13,
  },
  exchangeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  exchangeBtn: {
    flex: 1, borderWidth: 1, borderColor: '#6f93c4', borderRadius: 3,
    paddingVertical: 9, alignItems: 'center',
  },
  exchangeBtnText: { color: '#9ec0ef', fontWeight: '700', letterSpacing: 1, fontSize: 11 },
  exchangeNote: { marginTop: 8, color: '#9ec96a', fontSize: 12, fontStyle: 'italic' },
  fallenEmpty: { color: '#a2977b', fontSize: 12, fontStyle: 'italic', marginTop: 8 },
  // OTA-995 — un-avenged entries carry a live warning, amber against the memorial browns.
  fallenWalking: { color: '#d9a441', fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  lockedName: { color: '#a2977b', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  lockedSub: { color: '#9a8f79', fontSize: 10, marginTop: 2, fontStyle: 'italic' }, // OTA-920 — was #5a5245 (2.45:1, failed WCAG AA)
  name: { color: '#e6d8b3', fontSize: 14, fontWeight: '700' },
  subtitle: { color: '#c9a86a', fontSize: 11, marginBottom: 4 },
  // OTA-897 (SA-5) — the bestiary voice line: readable prose, italic to set it
  // apart from the stat rows below it.
  flavorLine: { color: '#cdbf99', fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginBottom: 4 },
  desc: { color: '#cdbf99', fontSize: 12, lineHeight: 18, marginTop: 2 },
  meta: { color: '#a2977b', fontSize: 11, marginTop: 4 },
  trait: { color: '#a89a78', fontSize: 11, marginTop: 2 },
  tapHint: { color: '#c9a86a', fontSize: 10, marginTop: 6, letterSpacing: 1 },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 6,
    padding: 16,
  },
  modalTitle: {
    color: '#c9a86a',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 10,
  },
  modalBody: {
    color: '#cdbf99',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalBtnGhost: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
  },
  modalBtnGhostText: {
    color: '#cdbf99',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },
  modalBtnGo: {
    backgroundColor: '#c9a86a',
    borderColor: '#c9a86a',
  },
  modalBtnGoText: {
    color: '#1a1714',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '700',
  },
});
