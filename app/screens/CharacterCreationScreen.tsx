import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useGameStore } from '../state/gameStore';
import { getRaces, getFactions } from '../engine/character';
import { getStoryMotives } from '../engine/story'; // OTA-1018
// OTA-1066 — Phase 4: the last thing you say before you walk.
import { PRESET_TIERS, PRESSURE_PROFILES, DEFAULT_PRESSURE, DIFFICULTY_SYSTEMS, type PressureTier, type PressureCustom } from '../engine/pressure';
// OTA-1113 — the CUSTOM row's popup.
import { DifficultyCustomModal } from '../components/DifficultyCustomModal';
// OTA-1431/1433 — the art that plays when a choice is committed. ONE component
// for both, so the skip behaviour and timer handling cannot drift apart.
import { ArtFlash } from '../components/ArtFlash';
import { factionCrest } from '../engine/factionCrests';
import { racePortrait } from '../engine/racePortraits';

// Tungsten Spire — the 'name' step is gone. New flow: race → faction →
// BEGIN. The player gives their name in-game when the Arbiter prompts
// inside the outpost (handled by the tutorial state machine). This
// removes the in-screen TextInput that was driving the Android soft-
// keyboard race the Nickel Tine + Zinc Anvil OTAs were chasing.

// OTA-1018 — a third step: THE REASON YOU CAME DOWN. The motive shapes the
// opening crawl and (phases 2-3) the story beats woven through the main quest.
// OTA-1066 — a fourth and final step: HOW MUCH DOES THE MUD TAKE? It sits
// AFTER the motive on purpose. You say why you came down, and then you say what
// you are prepared to have it cost — which is the same order the Arbiter would
// ask in, and the last thing decided before the crawl starts.
type Step = 'race' | 'faction' | 'motive' | 'pressure';

const STEP_ORDER: Step[] = ['race', 'faction', 'motive', 'pressure'];
const STEP_TITLE: Record<Step, string> = {
  race: 'CHOOSE YOUR RACE',
  faction: 'CHOOSE YOUR FACTION',
  motive: 'WHY DID YOU COME DOWN?',
  // OTA-1074 — was 'HOW MUCH DOES IT TAKE?'. Owner: "replace it with a more
  // recognizable difficulty level title." The evocative header worked as
  // flavor but failed as signage — a new player picking a permanent,
  // never-raisable setting deserves to know instantly that THIS is the
  // difficulty screen. The flavor lives on where it belongs: in the four
  // first-person tier names and their plain subtitles below.
  pressure: 'CHOOSE YOUR DIFFICULTY',
};

export function CharacterCreationScreen() {
  const startNewGame = useGameStore((s) => s.startNewGame);
  const setScreen = useGameStore((s) => s.setScreen);

  const races = getRaces();
  const factions = getFactions();

  const motives = getStoryMotives();

  const [step, setStep] = useState<Step>('race');
  const [raceId, setRaceId] = useState(races[0]!.id);
  // ⚠ OTA-1439 — ♂/♀, picked on the race step beside the people it describes
  // (every race portrait is a male/female pair). Defaulting to the first option
  // is this screen's idiom — race and faction both do it — and the pick is
  // FLAVOR ONLY: it decides whether a stranger calls you "sir" or "miss"
  // before they learn your name, and nothing mechanical.
  const [sex, setSex] = useState<'male' | 'female'>('male');
  const [factionId, setFactionId] = useState(factions[0]!.id);
  const [motiveId, setMotiveId] = useState(motives[0]!.id);
  const [pressure, setPressure] = useState<PressureTier>(DEFAULT_PRESSURE); // OTA-1066
  // OTA-1113 — CUSTOM. `pressureCustom` is only sent when the tier is 'custom';
  // picking a preset afterwards leaves it behind rather than clearing it, so a
  // player who tries custom, backs out to a preset, then returns finds their
  // switches where they left them.
  const [pressureCustom, setPressureCustom] = useState<PressureCustom | undefined>(undefined);
  const [customOpen, setCustomOpen] = useState(false);

  // ⚠⚠ OTA-1432 — THE EMBLEM PLAYS ON COMMIT, NOT ON TAP.
  //
  // OTA-1431 read the owner's *"as you choose your faction"* as the moment a row
  // is tapped. It is not. Owner: *"when we pick the faction isn't when we click
  // on it, but when we hit next."* Tapping a row is BROWSING — you tap through
  // several to read their goals and flavor lines. Hitting NEXT is the decision.
  //
  // ⚠ AND THAT IS ALSO WHY THE OTA-1431 GUARDS ARE GONE. The old version fired
  // on every change and needed an only-on-change rule to stop the popup landing
  // in the middle of a comparison. Moving it to the commit removes the problem
  // at the source rather than defending against it: there is exactly one NEXT
  // per run of this screen, so the flash can never interrupt anything.
  const [crestFor, setCrestFor] = useState<string | null>(null);
  // OTA-1433 — the race portrait, by the same rule and on the same component.
  const [racePortraitFor, setRacePortraitFor] = useState<string | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);
  const selectedRace = races.find((r) => r.id === raceId) ?? races[0]!;
  const selectedFaction = factions.find((f) => f.id === factionId) ?? factions[0]!;

  const goBack = () => {
    if (step === 'race') {
      setScreen('title');
    } else if (step === 'faction') {
      setStep('race');
    } else if (step === 'motive') {
      setStep('faction');
    } else {
      setStep('motive');
    }
  };

  const goNext = () => {
    if (step === 'race') {
      // ⚠⚠ OTA-1433 — the portrait plays HERE, on the commit, exactly as the
      // faction emblem does. Owner: *"same thing, show the popup at selection."*
      // The `racePortrait` guard is the same soft-lock guard as the faction's:
      // ArtFlash renders null with no source and so never calls onDone, which
      // would strand the player on the race step with a dead NEXT button.
      if (racePortrait(raceId)) {
        setRacePortraitFor(raceId);
        return;
      }
      setStep('faction');
      return;
    }
    if (step === 'faction') {
      // ⚠⚠ OTA-1432 — the emblem plays HERE, on the commit, and the step waits
      // for it. The flash's own onDone advances to 'motive', so tapping to skip
      // moves on instantly and letting it run moves on when it finishes.
      //
      // ⚠ THE `factionCrest` GUARD IS A SOFT-LOCK GUARD, not a tidiness check.
      // ArtFlash renders null when a faction has no art — so if this
      // set `crestFor` unconditionally, an art-less faction would show nothing,
      // never call onDone, and strand the player on the faction step with a NEXT
      // button that does nothing. A test asserts all nine have art; this makes
      // the tenth degrade to "no flash" instead of "cannot start the game".
      if (factionCrest(factionId)) {
        setCrestFor(factionId);
        return;
      }
      setStep('motive');
      return;
    }
    if (step === 'motive') {
      setStep('pressure');
      return;
    }
    // Motive step → straight into the game with an empty name; the
    // Arbiter prompts for it in the outpost. tutorialStep starts at 0
    // (the name beat) and the InputBox routes the next submission as
    // the player's name. The motive drives the opening crawl.
    void startNewGame({
      name: '', raceId, factionId, motiveId, pressure, sex,
      ...(pressure === 'custom' && pressureCustom ? { pressureCustom } : {}),
    });
  };

  const nextLabel = step === 'pressure' ? 'BEGIN' : 'NEXT →';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">NEW EXPEDITION</Text>
        <Text style={styles.headerStep}>Step {stepIndex + 1} of {STEP_ORDER.length}</Text>
      </View>
      <Text style={styles.stepTitle} accessibilityRole="header">{STEP_TITLE[step]}</Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* ⚠ OTA-1439 — the ♂/♀ signs, over the people they describe. Owner:
            *"we could do the male and female signs over the player image in the
            beginning"* — the images are the race portraits below, each a
            male/female pair, so the signs sit at the head of that list. */}
        {step === 'race' && (
          <View style={styles.sexRow}>
            {(['male', 'female'] as const).map((sx) => (
              <TouchableOpacity
                key={sx}
                style={[styles.sexChip, sex === sx && styles.optionSelected]}
                onPress={() => setSex(sx)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: sex === sx }}
                accessibilityLabel={sx === 'male' ? 'Male' : 'Female'}
              >
                <Text style={[styles.sexGlyph, sex === sx && styles.sexGlyphSelected]}>
                  {sx === 'male' ? '\u2642' : '\u2640'}
                </Text>
                <Text style={styles.sexLabel}>{sx === 'male' ? 'MALE' : 'FEMALE'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {step === 'race' && races.map((r) => {
          const statBumps = r.racialStatBonuses ?? {};
          const statBumpStrs = Object.entries(statBumps)
            .filter(([, v]) => (v ?? 0) !== 0)
            .map(([k, v]) => `${v! > 0 ? '+' : ''}${v} ${k.slice(0, 3).toUpperCase()}`);
          return (
            <TouchableOpacity
              key={r.id}
              style={[styles.option, raceId === r.id && styles.optionSelected]}
              onPress={() => setRaceId(r.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: raceId === r.id }}
            >
              <Text style={styles.optionName}>{r.name}</Text>
              <Text style={styles.optionDesc}>{r.description}</Text>
              <Text style={styles.optionMeta}>
                COMBAT · AC {r.baseAC} · barehand {r.barehandDamage}
              </Text>
              {r.racialACBonus && r.racialACBonus !== 'No inherent AC bonus' && (
                <Text style={styles.optionMetaSub}>↳ {r.racialACBonus}</Text>
              )}
              {statBumpStrs.length > 0 && (
                <Text style={styles.optionMeta}>
                  STATS · {statBumpStrs.join(', ')} (always on)
                </Text>
              )}
              {raceId === r.id && r.traits && r.traits.length > 0 && (
                <View style={styles.optionTraits}>
                  {r.traits.map((t, i) => (
                    <Text key={i} style={styles.optionTrait}>· {t}</Text>
                  ))}
                </View>
              )}
              <Text style={styles.optionMeta}>
                KIT · {r.startingTCFormula} TC · HP bonus +{r.startingHPBonus}
              </Text>
              {raceId === r.id && r.flavor && (
                <Text style={styles.optionFlavor}>{r.flavor}</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* ⚠ OTA-1433 — inside the race step, so leaving it unmounts the flash
            and its pending timer together. At the screen root it would survive a
            BACK tap and fire its dismiss against a screen already left.
            Its onDone IS the transition: skip or wait, the step advances once,
            from one place. */}
        {step === 'race' && (
          <ArtFlash
            artKey={racePortraitFor}
            source={racePortrait(racePortraitFor)}
            title={races.find((r) => r.id === racePortraitFor)?.name}
            subtitle={races.find((r) => r.id === racePortraitFor)?.description}
            onDone={() => { setRacePortraitFor(null); setStep('faction'); }}
          />
        )}

        {step === 'faction' && (
          <>
            <Text style={styles.contextLine}>Race: {selectedRace.name}</Text>
            {factions.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={[styles.option, factionId === f.id && styles.optionSelected]}
                onPress={() => setFactionId(f.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: factionId === f.id }}
              >
                <Text style={styles.optionName}>{f.name}</Text>
                <Text style={styles.optionDesc}>{f.subtitle}</Text>
                <Text style={styles.optionMeta}>{f.goal}</Text>
                {factionId === f.id && f.flavor && (
                  <Text style={styles.optionFlavor}>{f.flavor}</Text>
                )}
              </TouchableOpacity>
            ))}
            {/* ⚠ OTA-1431 — rendered INSIDE the faction step, so leaving the
                step unmounts it and its pending timer with it. Mounted at the
                screen root it would survive a BACK tap and fire its dismiss
                against a screen the player has already left.
                ⚠⚠ OTA-1432 — onDone is the TRANSITION. The flash is what sits
                between hitting NEXT and arriving at the motive step, so
                whichever way it ends — tapped away or run out — the step
                advances exactly once, from one place. */}
            <ArtFlash
              artKey={crestFor}
              source={factionCrest(crestFor)}
              title={factions.find((f) => f.id === crestFor)?.name}
              subtitle={factions.find((f) => f.id === crestFor)?.subtitle}
              onDone={() => { setCrestFor(null); setStep('motive'); }}
            />
            <View style={styles.beginBlock}>
              <Text style={styles.contextLine}>
                {selectedRace.name} · {selectedFaction.name}
              </Text>
              <Text style={styles.beginHint}>
                One more step: the reason you came down.
              </Text>
            </View>
          </>
        )}

        {step === 'motive' && (
          <>
            {/* OTA-1018 — THE REASON YOU CAME DOWN. The pick shapes the opening
                crawl now and the story beats woven through the main quest in
                later phases. There is no wrong answer and no stat attached —
                this is who you are, not what you roll. */}
            <Text style={styles.contextLine}>
              {selectedRace.name} · {selectedFaction.name}
            </Text>
            {motives.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.option, motiveId === m.id && styles.optionSelected]}
                onPress={() => setMotiveId(m.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: motiveId === m.id }}
              >
                <Text style={styles.optionName}>{m.title}</Text>
                <Text style={styles.optionDesc}>{m.blurb}</Text>
                {motiveId === m.id && (
                  <Text style={styles.optionFlavor}>{m.pages[0]?.split('\n')[0] ?? ''}</Text>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        {step === 'pressure' && (
          <>
            {/* OTA-1066 — PHASE 4 BEHIND ITS TOGGLE. Every option carries a
                plain subtitle: a difficulty name that sounds good and explains
                nothing is a trap on a screen you cannot revisit. */}
            <Text style={styles.contextLine}>
              {selectedRace.name} · {selectedFaction.name} · {motives.find((m) => m.id === motiveId)?.title ?? ''}
            </Text>
            {PRESET_TIERS.map((id) => {
              const prof = PRESSURE_PROFILES[id];
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.option, pressure === id && styles.optionSelected]}
                  onPress={() => setPressure(id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pressure === id }}
                  accessibilityLabel={`${prof.label} ${prof.subtitle}`}
                >
                  <Text style={styles.optionName}>{prof.label}</Text>
                  <Text style={styles.optionDesc}>{prof.subtitle}</Text>
                </TouchableOpacity>
              );
            })}
            {/* OTA-1113 — CUSTOM sits BELOW the four presets on purpose. The
                survey is explicit that sliders give the best experience and the
                worst discoverability, so the presets stay the front door and
                this is the advanced option behind it. */}
            <TouchableOpacity
              style={[styles.option, pressure === 'custom' && styles.optionSelected]}
              onPress={() => setCustomOpen(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: pressure === 'custom' }}
              accessibilityLabel="Custom difficulty. Choose which systems the difficulty affects."
            >
              <Text style={styles.optionName}>&quot;Let me choose what it takes.&quot;</Text>
              <Text style={styles.optionDesc}>
                {pressure === 'custom' && pressureCustom
                  ? `${pressureCustom.systems.length} of ${DIFFICULTY_SYSTEMS.length} systems · tap to change`
                  : 'Pick how hard, then pick exactly which systems it is allowed to touch.'}
              </Text>
            </TouchableOpacity>
            <DifficultyCustomModal
              visible={customOpen}
              initial={pressureCustom}
              onCancel={() => setCustomOpen(false)}
              onConfirm={(c) => {
                setPressureCustom(c);
                setPressure('custom');
                setCustomOpen(false);
              }}
            />
            <View style={styles.beginBlock}>
              <Text style={styles.beginHint}>
                You can ease this later from your character sheet if it turns out to be too much. You can never raise it.
              </Text>
              <Text style={styles.beginHint}>
                Tap BEGIN below. The Arbiter will greet you in the outpost and ask your name.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={goBack}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.backBtnText}>← BACK</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.nextBtn}
          onPress={goNext}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.nextBtnText}>{nextLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: 6,
  },
  headerTitle: { color: '#c9a86a', fontSize: 14, letterSpacing: 4, fontWeight: '700' },
  headerStep: { color: '#a2977b', fontSize: 11, letterSpacing: 1 },
  stepTitle: {
    color: '#e6d8b3',
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 12 },
  contextLine: { color: '#9ec96a', fontSize: 11, letterSpacing: 1, marginBottom: 8, fontStyle: 'italic' },
  option: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    padding: 10,
    borderRadius: 4,
    marginBottom: 8,
  },
  optionSelected: { borderColor: '#c9a86a' },
  // OTA-1439 — the ♂/♀ row. Same plate/border language as the option cards so
  // the pick reads as part of the same form, not a foreign control.
  sexRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  sexChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 4,
  },
  sexGlyph: { color: '#a2977b', fontSize: 20 },
  sexGlyphSelected: { color: '#c9a86a' },
  sexLabel: { color: '#cdbf99', fontSize: 12, letterSpacing: 2 },
  optionName: { color: '#e6d8b3', fontWeight: '700', fontSize: 14 },
  optionDesc: { color: '#cdbf99', fontSize: 12, marginTop: 2 },
  optionMeta: { color: '#a2977b', fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  optionMetaSub: { color: '#c9a86a', fontSize: 10, marginTop: 2, fontStyle: 'italic' },
  optionTraits: { marginTop: 8, paddingLeft: 6, borderLeftColor: '#3a342c', borderLeftWidth: 2 },
  optionTrait: { color: '#9ec96a', fontSize: 11, lineHeight: 16, marginBottom: 2 },
  optionFlavor: {
    color: '#a89776',
    fontSize: 12,
    marginTop: 8,
    paddingTop: 8,
    borderTopColor: '#3a342c',
    borderTopWidth: 1,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  beginBlock: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
  },
  beginHint: { color: '#cdbf99', fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 8 },
  backBtn: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  backBtnText: { color: '#c9a86a', fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  nextBtn: {
    flex: 1,
    backgroundColor: '#c9a86a',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nextBtnText: { color: '#13110f', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});
