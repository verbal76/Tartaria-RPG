// v2.4.1 (OTA 040 — Phase 6c) — Ending splash screen.
//
// Full-screen final-act presentation. Renders when player.mainQuest.phase
// === 'ended'. Shows the faction-flavored ending line in large prose,
// the run summary (character name, race, faction, ending, day count,
// Cores recovered in order), and two actions: BACK TO TITLE or
// RESURRECT (the latter only if a Resurrection Gem is available
// and the player wants to keep playing under the ending — a deferred
// option that lets the player continue exploring post-Choice without
// closing the run yet).
//
// OTA-151 — Added the HOMEWARD beat. A new HEAD HOME ▸ button drops
// the player into a 3-paragraph "heading home" narrative referencing
// the dog (if alive) + golem (if alive) + the player's faction
// people — fades in from black, holds ~7s, fades out to title. This
// is the placeholder bridge into the Buried Skyscraper expansion;
// once that ships, the fade will land the player at the Outskirts
// entrance instead of bouncing to title.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { endingLine, LOST_CAPITAL_LOCATIONS, LOST_CAPITAL_NAMES } from '../engine/mainQuest';
import { epilogueMotiveLine } from '../engine/chapters'; // OTA-1043
import { epilogueChoiceLines } from '../engine/storyForks'; // OTA-1088
import { motiveById } from '../engine/story'; // OTA-1043
import { missingResolvedEpilogue } from '../engine/storyDrip'; // OTA-1044
import { arbiterVerdict, arbiterNameBeat } from '../engine/arbiterPersona'; // OTA-1090
import racesData from '../data/races/races.json';
import factionsData from '../data/factions/factions.json';

const races = racesData as { id: string; name: string }[];
const factions = factionsData as { id: string; name: string }[];

function raceName(id: string): string {
  return races.find((r) => r.id === id)?.name ?? id;
}
function factionName(id: string): string {
  return factions.find((f) => f.id === id)?.name ?? id;
}
function capitalLabel(id: string): string {
  // OTA-871 — use the canonical export from mainQuest so the ending recap
  // shows real names for all nine Lost Capitals (the local map only listed
  // the original five, so the four OTA-052 Capitals fell back to raw ids).
  return LOST_CAPITAL_NAMES[id] ?? id;
}

// OTA-151 — homeward narrative. Faction-neutral wording so it lands
// the same regardless of which ending the player chose, but it
// references the dog + golem if they're alive so the beat feels
// like THIS character's homeward walk, not a generic credits roll.
function buildHomewardBeats(player: {
  name: string;
  factionId: string;
  dog?: { name: string; status: string } | null;
  golem?: { name: string; hp: number } | null;
}): string[] {
  const peopleByFaction: Record<string, string> = {
    reclaimers_guild: 'the guild',
    forgotten_order: 'the Cloister',
    mud_monarchs: 'the family',
    true_tartarians: 'the Hall',
    eternal_dynasty: 'the dynasty',
    conspiracy_architects: 'the cell',
    servants_of_giants: 'the vigil',
    stone_builders: 'the workshop',
    tartarian_revivalists: 'the cell',
  };
  const peopleLabel = peopleByFaction[player.factionId] ?? 'your people';
  const dogActive = player.dog && player.dog.status !== 'abandoned' && player.dog.status !== 'dead';
  const golemActive = player.golem && player.golem.hp > 0;

  const companionPhrase: string =
    dogActive && golemActive ? `${player.dog!.name} at your heel, ${player.golem!.name} a half-step behind`
    : dogActive ? `${player.dog!.name} at your heel`
    : golemActive ? `${player.golem!.name} a half-step behind`
    : 'the road empty beside you';

  return [
    `You turn your back on the Nexus, and the chamber holds its breath behind you. The Stair lifts you the way it took you down — slower, this time, because you are carrying something heavier than the Cores were.`,
    `${player.name} walks east toward ${peopleLabel}, ${companionPhrase}. The fog over the Outskirts thins as the light comes up — Tartaria, the buried country, fading at your back the way an old argument fades when you finally stop having it.`,
    `Somewhere ahead, in the Buried Cities, a doorway you have never noticed waits for you. Not today, but soon. Today you are going home.`,
  ];
}

export function EndingScreen() {
  const player = useGameStore((s) => s.player);
  const setScreen = useGameStore((s) => s.setScreen);
  // OTA-1090 — the Arbiter's regard reads the per-person ledger, which lives
  // on worldMemory rather than the character.
  const worldMemory = useGameStore((s) => s.worldMemory);
  const [stage, setStage] = useState<'splash' | 'homeward'>('splash');

  if (!player || !player.mainQuest || player.mainQuest.phase !== 'ended' || !player.mainQuest.ending) {
    // Defensive — somehow on the ending screen without an ending.
    // Bounce back to title.
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>No ending recorded. Returning to title.</Text>
        <TouchableOpacity style={styles.btn} onPress={() => setScreen('title')} activeOpacity={0.7} accessibilityRole="button">
          <Text style={styles.btnText}>BACK TO TITLE</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (stage === 'homeward') {
    return <HomewardSplash player={player} onDone={() => setScreen('title')} />;
  }

  const ending = player.mainQuest.ending;
  const line = endingLine(ending, player.factionId);
  const daysPlayed = Math.floor((player.hoursElapsed ?? 0) / 24);
  const coresInOrder = player.mainQuest.coresRecovered ?? [];
  const allCoresInOrder = LOST_CAPITAL_LOCATIONS.filter((c) => coresInOrder.includes(c));

  const endingLabel = ending.toUpperCase();
  const endingColor = ending === 'seal' ? '#5a6b8a' : ending === 'unleash' ? '#a85a3a' : '#7a8a5a';
  // OTA-1043 — the per-motive epilogue: how THIS ending answers the reason
  // this character came down (the OTA-1041 story motive). Rendered under the
  // faction ending prose so the run closes on the personal thread, not just
  // the political one. OTA-1044 — if The Missing side-thread RESOLVED in-run
  // (grave / lie / walker), its own closing replaces the standard 'missing'
  // epilogue, which assumes the question is still open.
  const motiveLine = missingResolvedEpilogue(player) ?? epilogueMotiveLine(ending, player.storyMotive);
  const motiveTitle = motiveById(player.storyMotive).title;
  // ⚠ OTA-1088 — THE SECOND PLACE A PHASE 3 DECISION LANDS, and the permanent
  // one. The motive epilogue above still closes the arc — that is what the
  // motive was FOR. These are what you DID inside it, one sentence per
  // question answered, in authored fork order so a second run through the same
  // choices reads the same way. Empty for a character who was never asked.
  const choiceLines = epilogueChoiceLines(player);
  // ⚠ OTA-1090 — PHASE 5, AND THE ONLY PLACE HE SPEAKS *ABOUT* YOU RATHER THAN
  // TO YOU. The ending prose is the world's verdict and the motive epilogue is
  // the character's; this is the verdict of the one person who was standing
  // there for all of it. Derived from the save like everything else in the
  // persona system, so it is the honest summary of the run and not a reward
  // for reaching the screen — a player who spent the run robbing people gets
  // told so, at the door, by name.
  const verdict = arbiterVerdict(player, worldMemory);
  const nameBeat = arbiterNameBeat(player, worldMemory);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.tag, { color: endingColor }]}>YOU CHOSE</Text>
        <Text style={[styles.endingLabel, { color: endingColor }]} accessibilityRole="header">{endingLabel}</Text>
        <View style={styles.rule} />

        <Text style={styles.body}>{line}</Text>

        {motiveLine != null && (
          <View style={styles.motiveBlock}>
            <Text style={styles.motiveTag}>{motiveTitle.toUpperCase()}</Text>
            <Text style={styles.motiveLine}>{motiveLine}</Text>
          </View>
        )}

        {choiceLines.length > 0 && (
          <View style={styles.motiveBlock}>
            <Text style={styles.motiveTag}>WHAT YOU CHOSE</Text>
            {choiceLines.map((l, i) => (
              <Text key={i} style={[styles.motiveLine, i > 0 && { marginTop: 10 }]}>{l}</Text>
            ))}
          </View>
        )}

        {verdict != null && (
          <View style={styles.motiveBlock}>
            <Text style={styles.motiveTag}>THE ARBITER</Text>
            <Text style={styles.motiveLine}>{verdict}</Text>
            {nameBeat != null && (
              <Text style={[styles.motiveLine, { marginTop: 10 }]}>{nameBeat}</Text>
            )}
          </View>
        )}

        <View style={[styles.rule, { marginTop: 28 }]} />

        <Text style={styles.tag} accessibilityRole="header">RUN SUMMARY</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Character</Text>
          <Text style={styles.summaryVal}>{player.name}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Race</Text>
          <Text style={styles.summaryVal}>{raceName(player.raceId)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Faction</Text>
          <Text style={styles.summaryVal}>{factionName(player.factionId)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Days played</Text>
          <Text style={styles.summaryVal}>{daysPlayed}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Cores recovered</Text>
          <Text style={styles.summaryVal}>{allCoresInOrder.length}/9</Text>
        </View>
        {coresInOrder.length > 0 && (
          <Text style={styles.coresList}>
            Order: {coresInOrder.map(capitalLabel).join(' → ')}
          </Text>
        )}
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Enemies defeated</Text>
          <Text style={styles.summaryVal}>{player.milestones?.enemiesDefeated ?? 0}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryKey}>Travels completed</Text>
          <Text style={styles.summaryVal}>{player.milestones?.travelsCompleted ?? 0}</Text>
        </View>

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btn} onPress={() => setScreen('title')} activeOpacity={0.7} accessibilityRole="button">
            <Text style={styles.btnText}>BACK TO TITLE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => setStage('homeward')}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>HEAD HOME ▸</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// OTA-151 — HomewardSplash. Plays the 3-paragraph homeward beat
// with a slow fade-in from black, holds ~7 seconds, then fades out
// to the title screen. Placeholder for the Buried Skyscraper
// expansion entry — once that ships, onDone routes the player to
// the Outskirts entrance instead of bouncing to title.
function HomewardSplash({
  player,
  onDone,
}: {
  player: NonNullable<ReturnType<typeof useGameStore.getState>['player']>;
  onDone: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const beats = buildHomewardBeats({
    name: player.name,
    factionId: player.factionId,
    dog: player.dog,
    golem: player.golem,
  });

  useEffect(() => {
    // Fade in (2.0s) → hold (7.0s) → fade out (2.0s) → onDone.
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 2000, useNativeDriver: true }),
      Animated.delay(7000),
      Animated.timing(opacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [opacity, onDone]);

  return (
    <View style={styles.homewardContainer}>
      <Animated.View style={[styles.homewardBody, { opacity }]}>
        {beats.map((line, i) => (
          <Text key={i} style={styles.homewardLine}>{line}</Text>
        ))}
        <Text style={styles.homewardTag}>· · ·</Text>
      </Animated.View>
      {/* Tap-anywhere skip — bounces straight to title. */}
      <TouchableOpacity
        style={styles.skipOverlay}
        onPress={onDone}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityLabel="Skip to title screen"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 16 },
  scroll: { paddingBottom: 32 },
  tag: { color: '#a2977b', fontSize: 11, letterSpacing: 4, fontWeight: '700', marginTop: 16 },
  endingLabel: { fontSize: 36, letterSpacing: 6, fontWeight: '800', marginTop: 8 },
  rule: { height: 1, backgroundColor: '#3a342c', marginTop: 12, marginBottom: 12 },
  body: { color: '#e6d8b3', fontSize: 14, lineHeight: 22 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 4,
    borderBottomColor: '#1a1714',
    borderBottomWidth: 1,
  },
  summaryKey: { color: '#a2977b', fontSize: 12, letterSpacing: 1 },
  summaryVal: { color: '#e6d8b3', fontSize: 12, fontWeight: '600' },
  coresList: { color: '#cdbf99', fontSize: 11, fontStyle: 'italic', marginTop: 6 },
  // OTA-1043 — motive epilogue block.
  motiveBlock: { marginTop: 20 },
  motiveTag: { color: '#7a8a5a', fontSize: 10, letterSpacing: 4, fontWeight: '700', marginBottom: 6 },
  motiveLine: { color: '#cdbf99', fontSize: 13, lineHeight: 21, fontStyle: 'italic' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, gap: 8 },
  btn: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#c9a86a',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: '#2a1f12' },
  btnText: { color: '#c9a86a', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  placeholder: { color: '#a2977b', textAlign: 'center', marginTop: 80, fontSize: 14 },
  // OTA-151 — Homeward splash. Full-black backdrop, large prose
  // centered vertically, slow fade.
  homewardContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  homewardBody: { alignItems: 'stretch' },
  homewardLine: {
    color: '#e6d8b3',
    fontSize: 15,
    lineHeight: 26,
    marginBottom: 18,
    fontStyle: 'italic',
  },
  homewardTag: {
    color: '#a2977b',
    fontSize: 18,
    letterSpacing: 8,
    textAlign: 'center',
    marginTop: 12,
  },
  skipOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
});
