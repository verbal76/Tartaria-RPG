import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import type { RollStep, PendingRollState } from '../engine/types';
import { rollDie } from '../engine/rng';

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
const AUTO_RESOLVE_HOLD_MS = 800;

interface Props {
  state: PendingRollState;
  onRoll: (values: number[]) => void;
  onCancel: () => void;
}

export function DiceRoller({ state, onRoll, onCancel }: Props) {
  const [rolledValues, setRolledValues] = useState<number[] | null>(null);
  const [scale] = useState(new Animated.Value(1));

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
      if (isAdv || isDis) {
        const kept = isAdv ? Math.max(...rolledValues) : Math.min(...rolledValues);
        onRoll([kept]);
      } else {
        onRoll(rolledValues);
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
          <TouchableOpacity style={styles.rollBtn} onPress={handleRoll} activeOpacity={0.7}>
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

      <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
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
    padding: 14,
    gap: 8,
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
    color: '#7a705c',
    fontSize: 11,
  },
  rollLabel: {
    color: '#cdbf99',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  context: {
    color: '#7a705c',
    fontSize: 12,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#0a0908',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  preRoll: {
    alignItems: 'center',
    gap: 6,
  },
  diceNotation: {
    color: '#c9a86a',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
  },
  targetText: {
    color: '#7a705c',
    fontSize: 13,
    letterSpacing: 1,
  },
  advLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 2,
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
    gap: 4,
  },
  diceResults: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
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
    color: '#7a705c',
    fontSize: 13,
  },
  divider: {
    height: 1,
    width: 80,
    backgroundColor: '#3a342c',
    marginVertical: 4,
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
    marginTop: 2,
  },
  success: { color: '#9ec96a' },
  failure: { color: '#e07a5f' },
  rollBtn: {
    backgroundColor: '#c9a86a',
    borderRadius: 4,
    paddingVertical: 14,
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
    paddingVertical: 12,
    alignItems: 'center',
  },
  advancingHintText: {
    color: '#7a705c',
    fontSize: 12,
    fontStyle: 'italic',
    letterSpacing: 1,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  cancelText: {
    color: '#7a705c',
    fontSize: 11,
    letterSpacing: 1,
  },
});
