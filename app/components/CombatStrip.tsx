import React, { useState, useCallback } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { type CombatEvent, rollExpression, combatantLabel, lootLabel } from '../engine/combatEvent';
/* ⚠⚠⚠ OTA-1790 — THE WORDS COME FROM THE ENGINE, THE COLOURS COME FROM HERE.
 * `eventLine` decides subject/verb/object/tail/note and this file decides how
 * each part looks. That split is the pack's *"do not scatter item-name
 * conditionals across transcript JSX"* rule applied to the sentence itself: a
 * renderer that reassembled these parts in its own order would be a second place
 * that could scramble HIT / target / damage. */
import { eventLine } from '../engine/combatSentence';
import { weaponFamilyArt, WEAPON_ART_SIZE, type WeaponFamily } from '../engine/weaponFamilyArt';
import { glyphArt } from '../engine/combatGlyphArt';

/* ⚠⚠⚠ VIS-2 — ONE COMBAT RESULT, ONE ROW.
 *
 * The problem this replaces: a single exchange was four prose entries, each
 * wrapping to two or three rows at phone width, each carrying a 24px paragraph
 * margin. One attack and its counter cost most of the visible feed, so the
 * player could see ONE exchange and had to read a paragraph to learn whether
 * they had hit anything.
 *
 * ⚠⚠ THE RULE THIS FILE OBEYS: A NORMAL EXCHANGE MUST NOT GROW. No card, no
 * border per event, no per-row shadow, no banner. Height is spent only where
 * something exceptional happened, which is the whole design: NORMAL ATTACKS
 * STAY DENSE, IMPORTANT EVENTS EARN SPACE.
 *
 * ⚠⚠⚠ OTA-1790 SUPERSEDED THIS FILE'S PRESENTATION AND KEPT ITS ARGUMENT.
 * VIS-2 drew an exchange as two fixed columns — `YOU ▸ Raider` on the left, a
 * `HIT` stamp and a bare `25` on the right — and the reference pack named every
 * part of that as a defect: *"equation-like fragments, duplicated actor/outcome
 * labels, arrows, or disconnected damage values"*. It is now ONE SENTENCE, built
 * by `engine/combatSentence`, allowed to wrap, with the number inside the words.
 * The density claim survives intact: a one-line exchange is still one 18px row
 * and still costs a fraction of a prose paragraph.
 *
 * ⚠⚠⚠ DIRECTION IS STILL STRUCTURAL, NOT CHROMATIC — the cues changed, the count
 * did not. It used to be the spine's edge, the row's reading direction and the
 * name order. It is now the sentence's own word order (`YOU HIT Raider` versus
 * `Raider HIT YOU`), the spine's colour and the indent. `row-reverse` had to go
 * because a reserved glyph column cannot survive a reversed row; three
 * independent cues remain, and none of them is colour alone.
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

/** ⚠ OTA-1790 — the row's own gap, named once so the PROSE's indent is computed
 *  from the same number the row lays out with. Hard-coding "about 40" here is
 *  exactly the magic layout constant the pack's *"a surface reports its own
 *  size"* rule is aimed at; the sentence's x is spine + gap + column + gap, and
 *  the prose hangs under it. */
const ROW_GAP = 6;

/* ⚠⚠⚠ THE VERTICAL BUDGET, AS NUMBERS THE STYLES AND THE SUITE BOTH READ.
 * The density claim in this pass is a measurement, not an impression, so the
 * heights are named once here and used by the StyleSheet below — a suite that
 * computed them separately would be grading its own copy. A strip row is a
 * FIXED height and cannot wrap; that is the whole reason an exchange stops
 * costing a screen. */
export const STRIP_METRICS = {
  /** the event line: one sentence, one 18px line box at minimum */
  row: 18,
  /** ⚠ OTA-1790 — the second row it named (weapon + resulting HP) is gone: the
   *  weapon moved into layer B's prose and what the target has left moved into
   *  the sentence. Kept because `AdventureFeed` and the density suites read this
   *  table as one budget, and a hole in a budget is worse than a retired line. */
  sub: 16,
  /** the disclosed roll expression, only while open */
  math: 15,
  /** gap between the rows of one event */
  gap: 2,
  /** gap between one combat event and the next (vs 24 for a prose paragraph) */
  entry: 3,
} as const;

/* ⚠⚠ OTA-1790 — `Stamp` IS GONE, AND ITS JOB IS NOT.
 * It drew the outcome as a right-hand column reading `HIT` / `MISS` / `CRIT`
 * beside a `YOU ▸ Raider` pair that already implied one — the *"duplicated
 * actor/outcome labels"* the pack names. The verdict is now the VERB of the
 * sentence, and the two outcomes that earned emphasis (`crit`, `fumble`) survive
 * as the sentence's trailing note. `outcomeLanded` and `outcomeIsExceptional`
 * still make those calls; they moved into `combatSentence`, where the words are
 * decided, rather than staying in a component. */

/** ⚠⚠ THE RESERVED COLUMN. It is rendered whether or not there is a picture, so
 *  successive exchanges start their sentence on the same x — the pack's *"Reserve
 *  a stable glyph column so successive exchanges align."* An unarmed punch, a
 *  shield bash whose artwork is still owed and an incoming blow the engine cannot
 *  name all line up with a sword hit above them. */
function WeaponMark({ family }: { family: string | undefined }) {
  const art = weaponFamilyArt(family as WeaponFamily | undefined);
  return (
    <View style={styles.markCol}>
      {art ? (
        <Image
          source={art}
          style={styles.mark}
          resizeMode="contain"
          testID={`weapon-mark-${family}`}
          accessible={false}
        />
      ) : null}
    </View>
  );
}

/**
 * ⚠⚠⚠ ONE EXCHANGE, ONE SENTENCE — the pack's layer A.
 *
 * What this replaces, verbatim off the device: `YOU ▸ Raider  HIT` on one row and
 * `YOU ▸ Raider  HIT  25` on the next, with the 25 marooned in its own right-hand
 * column. Duplicated actor labels, a duplicated stamp, an arrow, and a damage
 * value with nothing joining it to the words — every fragment the pack names.
 *
 * ⚠⚠ THE SENTENCE IS ONE `<Text>` AND IT IS ALLOWED TO WRAP. That is the governed
 * rule for a long enemy name: *"Allow long enemy names to wrap/truncate according
 * to a governed rule without scrambling HIT/target/damage order."* Nesting the
 * parts inside a single Text means the reflow is the platform's, so `Conspiracy
 * Architect 1` can take a second line and `for 25 HP` still follows it in order.
 * Splitting them into sibling views is what would let the order come apart.
 *
 * ⚠ AND `row-reverse` IS GONE. VIS-2 laid incoming rows out right-to-left as a
 * direction cue; a reserved glyph column cannot survive that (the mark would jump
 * to the far edge on every enemy row and the column would stop being a column).
 * Both edges are reserved instead and exactly one is lit, which buys back the
 * same non-chromatic cue for 4px — and the sentence's own word order (`YOU HIT
 * Raider` versus `Raider HIT YOU`) is a stronger one than either, because it is
 * English rather than a convention the player has to learn.
 */
function ExchangeRow({ ev, onToggle, open }: { ev: CombatEvent; onToggle: () => void; open: boolean }) {
  const fromPlayer = ev.side === 'player';
  const line = eventLine(ev);
  const hasMath = !!ev.roll;
  if (!line) return null;
  return (
    <TouchableOpacity
      testID={COMBAT_STRIP_TEST_ID}
      activeOpacity={hasMath ? 0.6 : 1}
      onPress={hasMath ? onToggle : undefined}
      disabled={!hasMath}
      accessibilityRole={hasMath ? 'button' : undefined}
      /* ⚠ THE SCREEN READER GETS THE SAME SENTENCE THE EYE DOES. It used to get
       * "YOU attacks Raider: HIT, 25 damage" — a third phrasing of the same
       * event, invented in this file. */
      accessibilityLabel={`${line.subject} ${line.verb}${line.object ? ` ${line.object}` : ''}${line.tail}${line.note ? `, ${line.note}` : ''}${line.standing}`}
      accessibilityHint={hasMath ? 'Shows the roll' : undefined}
    >
      <View style={styles.row}>
        {/* ⚠⚠⚠ TWO SPINE SLOTS, ONE LIT. VIS-2 flipped the whole row with
            `row-reverse` to put the spine on the far side; a reserved glyph
            column cannot survive that. Reserving BOTH edges instead costs 4px
            and keeps the mark at exactly the same x in both directions, so the
            column really is a column while the LIT EDGE still tells you which
            way the blow went without reference to any hue. */}
        <View style={[styles.spine, fromPlayer ? styles.spineOut : styles.spineOff]} />
        <WeaponMark family={ev.family} />
        <Text style={styles.line}>
          <Text style={[styles.subject, line.bySelf ? styles.subjectSelf : styles.subjectFoe]}>{line.subject}</Text>
          <Text style={[styles.verb, line.landed ? styles.verbLanded : styles.verbMissed]}>{` ${line.verb}`}</Text>
          {line.object ? <Text style={styles.object}>{` ${line.object}`}</Text> : null}
          {/* ⚠ THE NUMBER IS INSIDE THE SENTENCE. The pack allows a numeric
              accent only *"if it reinforces the sentence, not duplicate/conflict
              with it"* — so it is the same run of text, one step larger and in
              the outcome's colour, and there is no second column for it to
              disagree with. */}
          {line.tail ? (
            <Text style={[styles.tail, fromPlayer ? styles.tailOut : styles.tailIn]}>{line.tail}</Text>
          ) : null}
          {line.note ? <Text style={styles.note}>{`  — ${line.note}`}</Text> : null}
          {/* ⚠ WHAT IS LEFT STANDING. VIS-2 kept this on a second row; it survives
              here because in a group fight `EnemyPanel` only shows the ACTIVE
              enemy, so this is the one place the player learns what they left on
              the body they just hit. Inside the run, so it cannot float off. */}
          {line.standing ? <Text style={styles.standing}>{line.standing}</Text> : null}
        </Text>
        <View style={[styles.spine, fromPlayer ? styles.spineOff : styles.spineIn]} />
      </View>
      {/* ⚠⚠ LAYER B. The consequence in words, from the event's own `prose` —
          never parsed out of the log line, and never printed when the resolver
          did not write one. */}
      {ev.prose ? <Text style={styles.prose}>{ev.prose}</Text> : null}
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
        {/* ⚠ OTA-1790 — the killing blow's weapon, in the same reserved column
            the exchanges above it use, so the last row of a fight lines up with
            the rest of it instead of starting its own margin. */}
        <WeaponMark family={ev.family} />
        <Text style={styles.defeatName} numberOfLines={1}>{combatantLabel(ev.defeated ?? ev.target, 24)}</Text>
        <Text style={styles.defeatWord}>DEFEATED</Text>
      </View>
      {ev.prose ? <Text style={styles.prose}>{ev.prose}</Text> : null}
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

/** A standing count or condition that is not itself an attack. One row.
 *
 *  ⚠⚠⚠ OTA-1790 — A COATING THAT ACTUALLY FIRED GETS ITS OWN GLYPH, FROM THE
 *  OTHER TABLE. The pack draws the line and this row is where it is enforced:
 *  *"Weapon glyph = what delivered the attack. Damage/coating glyph = what kind
 *  of damage/effect occurred. Do not collapse those concepts into one icon."*
 *  So the mark here comes from `combatGlyphArt` — the shipped damage/coating
 *  family — and never from `weaponFamilyArt`, and it appears only on an event the
 *  resolver stamped at the proc site. */
function StatusRow({ ev, text }: { ev: CombatEvent; text: string }) {
  const coat = glyphArt(ev.coating);
  return (
    <View style={styles.statusRow} testID={COMBAT_STRIP_TEST_ID}>
      {coat ? (
        <Image
          source={coat}
          style={styles.coatMark}
          resizeMode="contain"
          testID={`coating-mark-${ev.coating}`}
          accessible={false}
        />
      ) : (
        <Text style={styles.statusMark}>·</Text>
      )}
      <Text style={coat ? styles.statusProse : styles.statusText} numberOfLines={coat ? undefined : 2}>
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
  return <ExchangeRow ev={event} onToggle={toggle} open={open} />;
}

const styles = StyleSheet.create({
  /* ⚠⚠ THE WHOLE DENSITY ARGUMENT IS IN THESE NUMBERS. A prose entry is
   * fontSize 14 / lineHeight 22 with a 24px paragraph margin, and it wraps. A
   * strip row is a fixed-height 18px line with a 2px margin and cannot wrap. An
   * exchange that cost ~290px of feed costs under 100px here, which is what
   * "several recent exchanges visible at once" actually requires. */
  /* ⚠⚠⚠ OTA-1772 — THE GUTTER BELONGS TO THE ROW, AND OTA-1790 REMOVED THE
   * COLUMNS IT SEPARATED. Reported off the device as `MISSConspiracy Archit…`:
   * the outcome stamp welded to a truncated enemy name with no space at all.
   *
   * The cause was structural. `result` was pushed to the far end by
   * `marginLeft: 'auto'` — whatever space is LEFT OVER — so the gutter went to
   * zero exactly when the row filled up, which is exactly when a long name gets
   * truncated. `columnGap` fixed it with an unconditional minimum.
   *
   * ⚠⚠ THE DEFECT CLASS IS NOW CLOSED BY CONSTRUCTION. There is no stamp column
   * and no truncated name: the outcome is the sentence's VERB, the name is the
   * sentence's OBJECT, and both are runs inside one wrapping `<Text>` that the
   * builder separates with a space. `columnGap` stays and still does real work —
   * spine → mark → sentence — but the collision it was added for can no longer
   * be expressed. See `ota1772`, re-aimed at the sentence rather than deleted.
   */
  /* ⚠⚠⚠ OTA-1790 — `alignItems: 'flex-start'` AND NO FIXED HEIGHT. The pack:
   * *"Do not hard-code a transcript row height around one screenshot or one
   * enemy name."* A sentence with a long name in it is two lines; the spine
   * stretches to whatever that turns out to be, and the mark aligns to the FIRST
   * line rather than floating to the middle of a two-line block. `minHeight`
   * keeps a one-line exchange exactly as dense as it was. */
  row: {
    flexDirection: 'row', alignItems: 'flex-start', columnGap: ROW_GAP,
    minHeight: STRIP_METRICS.row, marginBottom: STRIP_METRICS.gap, paddingRight: 2,
  },
  spine: { width: 2, alignSelf: 'stretch' },
  spineOut: { backgroundColor: GOLD },
  spineIn: { backgroundColor: INCOMING },
  /** the unlit edge: it still occupies its 2px so the column does not move */
  spineOff: { backgroundColor: 'transparent' },
  /* ⚠⚠ THE RESERVED COLUMN, AND `height` IS WHAT MAKES IT STABLE. Giving the
   * container the mark's own height means an exchange with no picture reserves
   * exactly as much room as one with a picture — the column does not breathe
   * between rows, which is the whole point of reserving it. */
  markCol: {
    width: WEAPON_ART_SIZE.column, height: WEAPON_ART_SIZE.transcript,
    alignItems: 'center', justifyContent: 'center',
  },
  mark: { width: WEAPON_ART_SIZE.transcript, height: WEAPON_ART_SIZE.transcript },
  /* ⚠⚠⚠ ONE TEXT NODE FOR THE WHOLE SENTENCE. `flex: 1` lets it take the rest of
   * the row and wrap inside it; the parts below are nested `<Text>` runs, which
   * is what keeps the order the platform's problem rather than a flexbox's.
   * lineHeight 20 is the number `WEAPON_ART_SIZE.transcript` is derived from —
   * if this moves, that moves with it. */
  line: { flex: 1, fontSize: 14, lineHeight: 20 },
  subject: { fontWeight: '800', letterSpacing: 0.6 },
  subjectSelf: { color: INK },
  subjectFoe: { color: INCOMING },
  verb: { fontWeight: '800', letterSpacing: 1.2 },
  verbLanded: { color: LANDED },
  verbMissed: { color: ALLOY },
  object: { color: INK_DIM, fontWeight: '600' },
  // The accent, INSIDE the sentence: one step up and in the outcome's colour.
  tail: { fontSize: 15, fontWeight: '800' },
  tailOut: { color: LANDED },
  tailIn: { color: INCOMING },
  // Exceptional outcomes keep their emphasis as the sentence's closing note —
  // gold, spaced, and small enough that it never outweighs the sentence.
  note: { color: GOLD, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  standing: { color: INK_DIM, fontSize: 11, fontWeight: '700' },
  /* ⚠⚠ LAYER B. Indented past the spine and the reserved column so the prose
   * hangs under its own event; dimmer and smaller than the sentence, because the
   * pack gives *"the factual event line first typographic priority"*. */
  prose: {
    color: INK_DIM, fontSize: 12, lineHeight: 17,
    paddingLeft: 2 + ROW_GAP + WEAPON_ART_SIZE.column + ROW_GAP,
    paddingRight: 2 + ROW_GAP, marginBottom: STRIP_METRICS.gap,
  },
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
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 4, paddingLeft: 2 },
  statusMark: { color: ALLOY, fontSize: 12 },
  statusText: { color: INK_DIM, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, flexShrink: 1 },
  /* ⚠ A COATING CONSEQUENCE IS A SENTENCE, NOT A READOUT. `statusText` is set
   * for `3 STILL STANDING` — bold, spaced, upper case — and a coating line is
   * prose ("… bites in and festers"). Same row, two registers, chosen by whether
   * the event actually named a coating. */
  statusProse: { color: INK_DIM, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  coatMark: { width: WEAPON_ART_SIZE.transcript, height: WEAPON_ART_SIZE.transcript },
});
