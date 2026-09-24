import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import type { RollStep, PendingRollState } from '../engine/types';
import { rollDie } from '../engine/rng';
import { AUTO_RESOLVE_HOLD_MS, type RollTapTiming } from '../diagnostics/rollTiming'; // OTA-1694
import { noteTouchDown } from '../diagnostics/tapClock'; // OTA-1695
import { logUiTap } from '../state/gameStore'; // OTA-1695 — ROLL joins the tap ledger

// OTA-255 — Auto-resolve dice rolls instead of gating on a RESOLVE /
// NEXT ROLL button tap. Once the dice land and the post-roll values
// are rendered, the result is committed after a short hold so the
// player has time to register the dice + total + verdict, then the
// flow advances on its own. Player can still bail via the cancel
// button during the hold. Closes the "why do I have to tap Resolve
// after the dice are already cast" friction.
//
// Hold duration: 800ms (tuned down from 1500ms in OTA-261 after
// playtest feedback — "feels like it's hanging just a bit, makes it
// feel like the math is slowing the game"). Long enough to clearly
// read the dice + adv/dis flag + total + verdict; short enough not
// to register as a wait. Multi-step rolls (attack + damage) now
// cumulate under 2s. Matches the OTA-257 hook-continue modal's hold
// for a consistent feel across the codebase.
// OTA-1694 — the constant moved to diagnostics/rollTiming so the store can
// name a late hold without importing this component.
//
// ⚠⚠⚠ #210 — THE RHYTHM WAS TWO NOTCHES TOO LOOSE, AND IT WAS APPLIED TWICE.
// The owner watched a fight on a large, tall phone and the roll surface still
// pressed the transcript off the screen. The forensics said why, and the answer
// was NOT that anything here grows: this component reads no window, no device
// and no scale (see the device-independence rule in the #210 suite), so its
// footprint is the SAME on a 4.7" phone and a 6.8" one. It was simply ~368pt
// tall, of which ~112pt was air — the container's padding nested inside the
// card's own padding, five 8pt gaps, and four small margins doubling the gaps
// they sat beside. The transcript is the only flexible region on that screen
// (OTA-179), so it paid for every one of those pixels.
//
// ⚠⚠ SO THIS IS A SPACING PASS AND NOTHING ELSE. Every font size, weight,
// letter-spacing, colour, border, radius, word, element and handler below is
// exactly what shipped. No row was merged, nothing was removed, nothing
// shrank typographically, and no second reduced variant of this card exists.
// ⚠ (The #210 suite forbids the words a variant would be named with, so this
// note describes the rule without spelling its trigger — the OTA-1721 class.)
// Peak post-roll ≈368 → ≈327pt (−11%), pre-roll ≈277 → ≈240pt, measured on
// the same line-box model the suite uses so the two numbers are comparable.
//
// ⚠ TWO SMALLER THINGS THE MEASUREMENT FOUND, both fixed here because both are
// pure geometry. (1) OTA-255's `advancingHint` claims in its own comment to
// take the ROLL button's footprint, and it did not — 40pt against 49pt — so the
// panel JUMPED every time dice landed. The button's padding now lands it within
// ~1pt of the hint instead, from the other direction. (2) `card.minHeight` was
// 80 against a sparsest-pre-roll content box of ~29pt, so a damage prompt
// reserved ~29pt of blank. Derived below.

/** #210 — the ROLL control's VISIBLE padding came down with the rest of the
 *  card's rhythm, which leaves its face ~41pt tall. The touch target is
 *  restored here rather than with vertical pixels, which is the whole point:
 *  ~53pt to the finger, ~41pt to the eye. The press contract is untouched. */
const ROLL_HIT_SLOP = { top: 6, bottom: 6, left: 0, right: 0 } as const;

interface Props {
  state: PendingRollState;
  onRoll: (values: number[], timing?: RollTapTiming) => void; // OTA-1694 — the dice clock's two stamps
  onCancel: () => void;
}

export function DiceRoller({ state, onRoll, onCancel }: Props) {
  const [rolledValues, setRolledValues] = useState<number[] | null>(null);
  const [scale] = useState(new Animated.Value(1));
  // OTA-1694 — the dice clock. shownAt: when this step's card COMMITTED (the
  // effect runs after the paint is scheduled); tappedAt: when ROLL was pressed.
  // Both ride onRoll so the store can print open → shown → tapped → settled.
  const shownAt = useRef(0);
  const tappedAt = useRef(0);
  useEffect(() => { shownAt.current = Date.now(); }, [state.currentStep, state.openedAt]);

  const step = state.steps[state.currentStep];
  if (!step) return null;

  // HANDOFF #14b — attack-side advantage/disadvantage. When rollMode is
  // set, we roll 2 dice and the KEPT die is the higher (advantage) or
  // lower (disadvantage). The shadow die is shown faded so the player
  // sees the swing. Only the kept value feeds into bonus/target math.
  const isAdv = step.rollMode === 'advantage';
  const isDis = step.rollMode === 'disadvantage';
  const keptValue = rolledValues
    ? isAdv
      ? Math.max(...rolledValues)
      : isDis
        ? Math.min(...rolledValues)
        : rolledValues.reduce((a, b) => a + b, 0)
    : null;
  const total = keptValue !== null ? keptValue + step.bonus : null;
  const success = total !== null && step.target !== undefined ? total >= step.target : null;

  const isCombat = state.steps.some((s) => s.id === 'attack');
  const stepLabel = isCombat ? 'COMBAT' : 'SKILL CHECK';

  // Capture the dice config now so the closure isn't re-narrowing on
  // every invocation — TS can't prove the step survives across renders.
  const { count: stepCount, sides: stepSides } = step;
  // For advantage/disadvantage we always roll 2 dice on this step.
  const rollCount = isAdv || isDis ? 2 : stepCount;

  function handleRoll() {
    tappedAt.current = Date.now(); // OTA-1694 — before any work, like logUiTap
    logUiTap('roll'); // OTA-1695 — the one combat control that was outside the ledger
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.15, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.95, duration: 60, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    const values: number[] = [];
    for (let i = 0; i < rollCount; i++) values.push(rollDie(stepSides));
    setRolledValues(values);
  }

  // OTA-255 — auto-resolve after the dice land. Replaces the prior
  // RESOLVE / NEXT ROLL button tap that gated every roll's outcome.
  // Player can still cancel during the hold window (cancel button
  // below); a fresh roll cycle clears the timer via the cleanup.
  useEffect(() => {
    if (rolledValues === null) return;
    const timer = setTimeout(() => {
      // Match the prior handleNext() shape: kept-die for adv/dis,
      // raw values otherwise. The caller's bonus math expects a
      // single-element array on adv/dis steps.
      const timing: RollTapTiming = { shownAt: shownAt.current, tappedAt: tappedAt.current }; // OTA-1694
      if (isAdv || isDis) {
        const kept = isAdv ? Math.max(...rolledValues) : Math.min(...rolledValues);
        onRoll([kept], timing);
      } else {
        onRoll(rolledValues, timing);
      }
      setRolledValues(null);
    }, AUTO_RESOLVE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [rolledValues, isAdv, isDis, onRoll]);

  const diceLabel = isAdv || isDis
    ? `2d${step.sides}`
    : `${step.count > 1 ? step.count : ''}d${step.sides}`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.stepKind}>{stepLabel}</Text>
        <Text style={styles.stepCount}>
          {state.currentStep + 1} of {state.steps.length}
        </Text>
      </View>

      {/* Roll label + context */}
      <Text style={styles.rollLabel}>{step.label}</Text>
      <Text style={styles.context}>{step.context}</Text>

      {/* Dice card */}
      <View style={styles.card}>
        {rolledValues === null ? (
          // Pre-roll: show what needs to be rolled
          <View style={styles.preRoll}>
            <Text style={styles.diceNotation}>
              {diceLabel}{step.bonusLabel ? `  +  ${step.bonusLabel}` : ''}
            </Text>
            {isAdv || isDis ? (
              <Text style={[styles.advLabel, isAdv ? styles.advTint : styles.disTint]}>
                {isAdv ? '↑ ADVANTAGE' : '↓ DISADVANTAGE'}
                {step.rollModeLabel ? ` — ${step.rollModeLabel}` : ''}
                {isAdv ? '  (keep higher)' : '  (keep lower)'}
              </Text>
            ) : null}
            {step.targetLabel ? (
              <Text style={styles.targetText}>vs  {step.targetLabel}</Text>
            ) : null}
          </View>
        ) : (
          // Post-roll: show result. Highlight the kept die when
          // advantage/disadvantage is in play.
          <View style={styles.postRoll}>
            <View style={styles.diceResults}>
              {rolledValues.map((v, i) => {
                const kept = isAdv || isDis
                  ? v === keptValue && rolledValues.indexOf(keptValue!) === i
                  : true;
                return (
                  <View key={i} style={[styles.dieResult, !kept && styles.dieResultFaded]}>
                    <Text style={[styles.dieFace, !kept && styles.dieFaceFaded]}>{dieFace(v, step.sides)}</Text>
                    <Text style={[styles.dieValue, !kept && styles.dieValueFaded]}>{v}</Text>
                  </View>
                );
              })}
            </View>
            {(isAdv || isDis) && (
              <Text style={[styles.advLabel, isAdv ? styles.advTint : styles.disTint]}>
                {isAdv ? `↑ ${step.rollModeLabel ?? 'advantage'} — keep ${keptValue}` : `↓ ${step.rollModeLabel ?? 'disadvantage'} — keep ${keptValue}`}
              </Text>
            )}
            {step.bonus !== 0 && (
              <Text style={styles.bonusLine}>+ {step.bonusLabel}</Text>
            )}
            <View style={styles.divider} />
            <Text style={styles.total}>Total  {total}</Text>
            {step.target !== undefined && (
              <Text style={[styles.verdict, success ? styles.success : styles.failure]}>
                vs {step.targetLabel}  {success ? '✓' : '✗'}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Action button (pre-roll only — post-roll auto-resolves) */}
      {rolledValues === null ? (
        <Animated.View style={{ transform: [{ scale }] }}>
          <TouchableOpacity accessibilityRole="button" style={styles.rollBtn} onPressIn={noteTouchDown} onPress={handleRoll} activeOpacity={0.7} hitSlop={ROLL_HIT_SLOP}>
            <Text style={styles.rollBtnText}>ROLL {diceLabel.toUpperCase()}</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        // OTA-255 — RESOLVE / NEXT ROLL button removed; the post-roll
        // hold above auto-advances the flow. Subtle "advancing…" tag
        // takes the button's footprint so the layout doesn't jump
        // between roll states.
        <View style={styles.advancingHint}>
          <Text style={styles.advancingHintText}>
            {state.currentStep + 1 < state.steps.length ? 'next roll…' : 'resolving…'}
          </Text>
        </View>
      )}

      <TouchableOpacity accessibilityRole="button" onPress={onCancel} style={styles.cancelBtn}>
        <Text style={styles.cancelText}>cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ASCII die face based on value and sides
function dieFace(value: number, sides: number): string {
  if (sides === 6) {
    return ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][value - 1] ?? '⚀';
  }
  return '◈'; // generic for d10, d20
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 6,
    // #210 — 14 → 10. This padding is the OUTER half of a double frame: the
    // card below carries its own 14, so the two together spent 56pt of one
    // axis on rim. Both come to 10, which is still a clear inset on each.
    padding: 10,
    // #210 — 8 → 6, and it is applied FIVE times (header · label · context ·
    // card · control · cancel), so it was the single largest spending line in
    // the component after the card itself. 6 matches the screen's own
    // container gap, so the panel now breathes at the same rate as the HUD
    // it sits in.
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepKind: {
    color: '#c9a86a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  stepCount: {
    color: '#a2977b',
    fontSize: 11,
  },
  rollLabel: {
    color: '#cdbf99',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  context: {
    color: '#a2977b',
    fontSize: 12,
    // #210 — 4 → 2. It sat directly beside the container's own gap, so the
    // space between the context line and the card was being paid for twice.
    marginBottom: 2,
  },
  card: {
    backgroundColor: '#0a0908',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    // #210 — 14 → 10, the INNER half of the double frame described on the
    // container.
    padding: 10,
    /* ⚠⚠ #210 — 80 → 64, AND THE NUMBER IS DERIVED FROM THE SPARSEST PROMPT
     * RATHER THAN CHOSEN. The floor exists so a thin pre-roll card does not
     * read as cramped; the state that needs it is the DAMAGE step, which
     * carries no target and therefore shows the dice notation ALONE:
     *
     *     content   fontSize 22 line box  ≈ 22 × 1.30      = 28.6
     *     chrome    2 × padding 10 + 2 × border 1          = 22.0
     *     natural card                                     = 50.6
     *     air the approved look wants around that one line  ≈ 13.4
     *     floor                                            ≈ 64
     *
     * So the notation keeps ~6-7pt of clearance beyond the padding on each
     * side and the box still reads as a plate rather than a caption. The old
     * 80 reserved ~29pt of blank in that state — that is the ~21pt the
     * forensics named. The ATTACK pre-roll (notation + `vs AC n`) measures
     * ~72pt and is content-driven either way, so this floor never touches it,
     * and NO post-roll state comes near it: they all exceed 150pt of content. */
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  preRoll: {
    alignItems: 'center',
    // #210 — 6 → 5. One notch, only ever paid once or twice in this state.
    gap: 5,
  },
  diceNotation: {
    color: '#c9a86a',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
  },
  targetText: {
    color: '#a2977b',
    fontSize: 13,
    letterSpacing: 1,
  },
  advLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    // #210 — 2 → 0. Both parents (preRoll, postRoll) already set a gap, so
    // this was additive to a space that already existed.
    marginTop: 0,
  },
  advTint: { color: '#9ec96a' },
  disTint: { color: '#e07a5f' },
  dieResultFaded: {
    opacity: 0.32,
  },
  dieFaceFaded: {
    color: '#5a5045',
  },
  dieValueFaded: {
    color: '#5a5045',
    fontWeight: '400',
  },
  postRoll: {
    alignItems: 'center',
    // #210 — 4 → 3. This is the post-roll state's OWN rhythm and it is paid
    // four times (adv · bonus · divider · total · verdict), which is why one
    // notch here is worth as much as a whole padding elsewhere.
    gap: 3,
  },
  diceResults: {
    flexDirection: 'row',
    gap: 12,
    // #210 — 4 → 2, beside the postRoll gap that already separates the dice
    // from the line under them.
    marginBottom: 2,
  },
  dieResult: {
    alignItems: 'center',
    gap: 2,
  },
  dieFace: {
    fontSize: 28,
    color: '#cdbf99',
  },
  dieValue: {
    color: '#c9a86a',
    fontSize: 16,
    fontWeight: '700',
  },
  bonusLine: {
    color: '#a2977b',
    fontSize: 13,
  },
  divider: {
    height: 1,
    width: 80,
    backgroundColor: '#3a342c',
    // #210 — 4 → 2 on each side, on top of the postRoll gap. The rule is
    // still clear of both the bonus line and the total; it was carrying 8pt of
    // its own margin plus 6pt of parent gap for a 1pt line.
    marginVertical: 2,
  },
  total: {
    color: '#cdbf99',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1,
  },
  verdict: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    // #210 — 2 → 0. The postRoll gap already sets it apart from the total.
    marginTop: 0,
  },
  success: { color: '#9ec96a' },
  failure: { color: '#e07a5f' },
  rollBtn: {
    backgroundColor: '#c9a86a',
    borderRadius: 4,
    /* ⚠ #210 — 14 → 10, AND THE NUMBER IS SET BY THE LANDING JUMP, not by
     * taste. OTA-255 put `advancingHint` here to hold the button's footprint
     * while the roll auto-resolves, but the two never matched:
     *
     *     rollBtn        2 × 14 + (16 × 1.30)  ≈ 48.8
     *     advancingHint  2 × 12 + (12 × 1.30)  ≈ 39.6     → a ~9pt jump
     *
     * Matching by RAISING the hint would add height to the post-roll state,
     * which is the peak this package exists to bring down, so the button comes
     * to the hint instead: 2 × 10 + 20.8 ≈ 40.8, within ~1.2pt. The face is
     * therefore ~41pt where the guidance wants ~44 for a finger — so the touch
     * target is restored with ROLL_HIT_SLOP above, not with pixels. */
    paddingVertical: 10,
    alignItems: 'center',
  },
  rollBtnText: {
    color: '#0a0908',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },
  nextBtn: {
    backgroundColor: '#3a342c',
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  nextBtnText: {
    color: '#c9a86a',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
  // OTA-255 — takes the prior RESOLVE / NEXT ROLL button's vertical
  // footprint so the layout doesn't shift between pre-roll and post-
  // roll states. Subtle italic-lowercase tag (color-matched to the
  // cancel link below) signals "no input needed, advancing on its own."
  advancingHint: {
    // #210 — DELIBERATELY UNCHANGED at 12. This is the post-roll state, which
    // is the peak footprint; raising it to meet the button would have made the
    // thing this package is reducing worse. The button came down to it instead
    // (see rollBtn), so the comment above this style is now true of the
    // geometry as well as the intent.
    paddingVertical: 12,
    alignItems: 'center',
  },
  advancingHintText: {
    color: '#a2977b',
    fontSize: 12,
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  cancelText: {
    color: '#a2977b',
    fontSize: 11,
    letterSpacing: 1,
  },
});

/** #210 — THE ONE STRUCTURAL ADDITION, AND IT RENDERS NOTHING. The suite has to
 *  assert geometry — that the spacing constants stay bounded and that the
 *  derived per-phase totals really did come down — and reading those numbers out
 *  of the live StyleSheet is honest in a way that parsing this file's text is
 *  not: a regex can be satisfied by a comment. Nothing in the component reads
 *  this export, so it cannot change a pixel. */
export const DICE_ROLLER_STYLES = styles;
