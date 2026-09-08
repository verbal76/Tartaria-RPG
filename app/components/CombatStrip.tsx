import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  type CombatEvent, outcomeLabel, outcomeLanded, outcomeIsExceptional,
  rollExpression, combatantLabel, lootLabel,
} from '../engine/combatEvent';

/* ⚠⚠⚠ VIS-2 — ONE COMBAT RESULT, ONE ROW.
 *
 * The problem this replaces: a single exchange was four prose entries, each
 * wrapping to two or three rows at phone width, each carrying a 24px paragraph
 * margin. One attack and its counter cost most of the visible feed, so the
 * player could see ONE exchange and had to read a paragraph to learn whether
 * they had hit anything.
 *
 * ⚠⚠ THE RULE THIS FILE OBEYS: A NORMAL EXCHANGE MUST NOT GROW. Every ordinary
 * event here is ONE row that cannot wrap — a fixed left column (who acted on
 * whom) and a fixed right column (what happened, and how much). No card, no
 * border per event, no per-row shadow, no banner. Height is spent only where
 * something exceptional happened, which is the whole design: NORMAL ATTACKS
 * STAY DENSE, IMPORTANT EVENTS EARN SPACE.
 *
 * ⚠⚠⚠ DIRECTION IS STRUCTURAL, NOT CHROMATIC. A player swing carries a lit
 * spine on the LEFT and reads `YOU ▸ Raider`; an incoming swing carries its
 * spine on the RIGHT, is indented, and reads `Raider ▸ YOU`. Three independent
 * cues — which edge the spine is on, which side the row starts from, and which
 * name comes first — so the direction survives a colour-blind reader, a washed
 * out screen and any background hue the player has chosen.
 *
 * ⚠ ROLL MATH IS KEPT AND DEMOTED. The owner's rule is that mechanics stay
 * inspectable; the brief's rule is that arithmetic must not make an ordinary
 * attack tall. So the expression is one tap away and, when shown, is ONE short
 * line — not four. The tap state is local to this row: it touches no store, so
 * disclosing one exchange's math cannot re-render the feed.
 *
 * ⚠ AND IT READS THE AUTHORITY, NEVER THE PROSE. Everything drawn here comes
 * off `entry.meta.cmb`, which the resolver wrote from the same values it used
 * to write its own sentence. Nothing in this file parses text.
 */

// The Tartarian instrument palette: alloy structure, and the brand gold spent
// only where something landed. Same discipline as the VIS-1 kit — cool greys
// for the machine, warm only for a live reading.
const ALLOY = '#5C6062';
const ALLOY_DIM = '#3C3E3F';
const INK = '#cdbf99';
const INK_DIM = '#8b8578';
const GOLD = '#c9a86a';
const LANDED = '#9ec96a';
const INCOMING = '#c98a6a';

export const COMBAT_STRIP_TEST_ID = 'combat-strip';

/* ⚠⚠⚠ THE VERTICAL BUDGET, AS NUMBERS THE STYLES AND THE SUITE BOTH READ.
 * The density claim in this pass is a measurement, not an impression, so the
 * heights are named once here and used by the StyleSheet below — a suite that
 * computed them separately would be grading its own copy. A strip row is a
 * FIXED height and cannot wrap; that is the whole reason an exchange stops
 * costing a screen. */
export const STRIP_METRICS = {
  /** the result row: who → whom, the stamp and the damage */
  row: 18,
  /** the optional second row: weapon and resulting HP */
  sub: 16,
  /** the disclosed roll expression, only while open */
  math: 15,
  /** gap between the rows of one event */
  gap: 2,
  /** gap between one combat event and the next (vs 24 for a prose paragraph) */
  entry: 3,
} as const;

function Stamp({ ev }: { ev: CombatEvent }) {
  const label = outcomeLabel(ev.outcome);
  if (!label) return null;
  const landed = outcomeLanded(ev.outcome);
  const loud = outcomeIsExceptional(ev.outcome);
  return (
    <Text
      style={[
        styles.stamp,
        landed ? styles.stampLanded : styles.stampMissed,
        // ⚠ Exceptional only. An ordinary HIT gets the same weight as an
        // ordinary MISS — it is most of combat, and it is not an event.
        loud && styles.stampLoud,
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
}

/** A to-hit verdict, or a landed blow. One row. */
function SwingRow({ ev, onToggle, open }: { ev: CombatEvent; onToggle: () => void; open: boolean }) {
  const fromPlayer = ev.side === 'player';
  const actor = combatantLabel(fromPlayer ? undefined : ev.actor);
  const target = combatantLabel(fromPlayer ? ev.target : undefined);
  const hasMath = !!ev.roll;
  return (
    <TouchableOpacity
      testID={COMBAT_STRIP_TEST_ID}
      activeOpacity={hasMath ? 0.6 : 1}
      onPress={hasMath ? onToggle : undefined}
      disabled={!hasMath}
      accessibilityRole={hasMath ? 'button' : undefined}
      accessibilityLabel={`${actor} attacks ${target}: ${outcomeLabel(ev.outcome) || 'result'}${ev.dmg ? `, ${ev.dmg} damage` : ''}`}
      accessibilityHint={hasMath ? 'Shows the roll' : undefined}
    >
      <View style={[styles.row, !fromPlayer && styles.rowIncoming]}>
        <View style={[styles.spine, fromPlayer ? styles.spineOut : styles.spineIn]} />
        <View style={styles.who}>
          <Text style={styles.actor} numberOfLines={1}>{actor}</Text>
          <Text style={styles.arrow}>▸</Text>
          <Text style={styles.target} numberOfLines={1}>{target}</Text>
        </View>
        <View style={styles.result}>
          <Stamp ev={ev} />
          {typeof ev.dmg === 'number' && ev.dmg > 0 ? (
            <Text style={[styles.dmg, fromPlayer ? styles.dmgOut : styles.dmgIn]}>{ev.dmg}</Text>
          ) : null}
        </View>
      </View>
      {/* ⚠ The second row is spent ONLY when it carries something the first
          could not: the weapon that did it and the HP it left. It is one line,
          it never wraps, and a verdict with neither prints nothing at all. */}
      {(ev.weapon || ev.hp) ? (
        <View style={[styles.subRow, !fromPlayer && styles.rowIncoming]}>
          <Text style={styles.sub} numberOfLines={1}>
            {ev.weapon ? ev.weapon : ''}
          </Text>
          {ev.hp ? (
            <Text style={styles.hp} numberOfLines={1}>
              {combatantLabel(fromPlayer ? ev.target : undefined)} {ev.hp.now}/{ev.hp.max}
            </Text>
          ) : null}
        </View>
      ) : null}
      {open && ev.roll ? (
        <Text style={styles.math} numberOfLines={1}>{rollExpression(ev.roll)}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

/** A combatant is down. The one event allowed to be loud — and still two rows. */
function DefeatRow({ ev }: { ev: CombatEvent }) {
  return (
    <View style={styles.defeat} testID={COMBAT_STRIP_TEST_ID}>
      <View style={styles.defeatHead}>
        <Text style={styles.defeatMark}>◈</Text>
        <Text style={styles.defeatName} numberOfLines={1}>{combatantLabel(ev.defeated ?? ev.target, 24)}</Text>
        <Text style={styles.defeatWord}>DEFEATED</Text>
      </View>
      {typeof ev.remaining === 'number' ? (
        <Text style={styles.remaining} numberOfLines={1}>
          {ev.remaining === 0
            ? 'NOTHING LEFT STANDING'
            : `${ev.remaining} STILL STANDING`}
        </Text>
      ) : null}
    </View>
  );
}

/** Loot and TC from one defeat, grouped. Never a row per item. */
export function RewardCluster({ events }: { events: readonly CombatEvent[] }) {
  const loot = events.flatMap((e) => e.loot ?? []);
  const tc = events.reduce((n, e) => n + (e.tc ?? 0), 0);
  if (loot.length === 0 && tc === 0) return null;
  return (
    <View style={styles.rewards} testID={COMBAT_STRIP_TEST_ID}>
      <View style={styles.rewardHead}>
        <Text style={styles.rewardLabel}>RECOVERED</Text>
        {tc > 0 ? <Text style={styles.tc}>+{tc} TC</Text> : null}
      </View>
      {loot.length > 0 ? (
        // ⚠ ONE WRAPPING PARAGRAPH OF NAMES, not one full-width row each. Four
        // drops cost one or two rows here; as separate entries they cost four
        // rows and four paragraph margins.
        <Text style={styles.lootLine}>
          {loot.map(lootLabel).join('  ·  ')}
        </Text>
      ) : null}
    </View>
  );
}

/** A standing count or condition that is not itself an attack. One row. */
function StatusRow({ ev, text }: { ev: CombatEvent; text: string }) {
  return (
    <View style={styles.statusRow} testID={COMBAT_STRIP_TEST_ID}>
      <Text style={styles.statusMark}>·</Text>
      <Text style={styles.statusText} numberOfLines={2}>
        {typeof ev.remaining === 'number' && ev.remaining > 0
          ? `${ev.remaining} STILL STANDING`
          : text}
      </Text>
    </View>
  );
}

export function CombatStrip({ event, text }: { event: CombatEvent; text: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  if (event.kind === 'defeat') return <DefeatRow ev={event} />;
  if (event.kind === 'reward') return <RewardCluster events={[event]} />;
  if (event.kind === 'status') return <StatusRow ev={event} text={text} />;
  return <SwingRow ev={event} onToggle={toggle} open={open} />;
}

const styles = StyleSheet.create({
  /* ⚠⚠ THE WHOLE DENSITY ARGUMENT IS IN THESE NUMBERS. A prose entry is
   * fontSize 14 / lineHeight 22 with a 24px paragraph margin, and it wraps. A
   * strip row is a fixed-height 18px line with a 2px margin and cannot wrap. An
   * exchange that cost ~290px of feed costs under 100px here, which is what
   * "several recent exchanges visible at once" actually requires. */
  row: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: STRIP_METRICS.row, marginBottom: STRIP_METRICS.gap, paddingRight: 2,
  },
  // Incoming rows are indented AND spined on the far side — direction without
  // depending on a colour anyone can fail to see.
  rowIncoming: { paddingLeft: 14, flexDirection: 'row-reverse' },
  spine: { width: 2, alignSelf: 'stretch', marginRight: 7 },
  spineOut: { backgroundColor: GOLD },
  spineIn: { backgroundColor: INCOMING, marginRight: 0, marginLeft: 7 },
  who: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  actor: { color: INK, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, flexShrink: 1 },
  arrow: { color: ALLOY, fontSize: 11, marginHorizontal: 5 },
  target: { color: INK_DIM, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  result: { flexDirection: 'row', alignItems: 'baseline', marginLeft: 'auto', gap: 8 },
  stamp: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  stampLanded: { color: LANDED },
  stampMissed: { color: ALLOY },
  // Exceptional outcomes get an engraved plate rather than a bigger font: the
  // row height must not change, or a crit would cost the layout.
  stampLoud: {
    color: GOLD, borderColor: ALLOY_DIM, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 2, paddingHorizontal: 4,
  },
  // Damage is the number the eye is hunting for, so it is the largest thing on
  // the row — and the row still does not get taller, because it shares the line.
  dmg: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  dmgOut: { color: LANDED },
  dmgIn: { color: INCOMING },
  subRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: STRIP_METRICS.sub, marginBottom: STRIP_METRICS.gap, paddingLeft: 9, paddingRight: 2,
  },
  sub: { color: INK_DIM, fontSize: 11, letterSpacing: 0.4, flexShrink: 1 },
  hp: { color: INK_DIM, fontSize: 11, fontWeight: '700', marginLeft: 'auto' },
  math: {
    color: ALLOY, fontSize: 10, letterSpacing: 0.6,
    paddingLeft: 9, marginBottom: 3,
  },
  // The one exceptional event, and it is still only two rows.
  defeat: { marginTop: 4, marginBottom: 6, paddingLeft: 2 },
  defeatHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  defeatMark: { color: GOLD, fontSize: 11 },
  defeatName: { color: INK, fontSize: 13, fontWeight: '800', letterSpacing: 0.6, flexShrink: 1 },
  defeatWord: {
    color: GOLD, fontSize: 10, fontWeight: '800', letterSpacing: 2.4,
    marginLeft: 'auto',
    borderColor: GOLD, borderWidth: StyleSheet.hairlineWidth, borderRadius: 2,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  remaining: { color: INK_DIM, fontSize: 10, fontWeight: '700', letterSpacing: 1.8, marginTop: 3, paddingLeft: 18 },
  rewards: { marginTop: 2, marginBottom: 8, paddingLeft: 9 },
  rewardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  rewardLabel: { color: ALLOY, fontSize: 10, fontWeight: '800', letterSpacing: 2.4 },
  tc: { color: GOLD, fontSize: 12, fontWeight: '800', marginLeft: 'auto' },
  lootLine: { color: INK, fontSize: 12, lineHeight: 17, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4, paddingLeft: 2 },
  statusMark: { color: ALLOY, fontSize: 12 },
  statusText: { color: INK_DIM, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, flexShrink: 1 },
});
