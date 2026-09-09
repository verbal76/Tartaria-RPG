/**
 * OTA-1790 — THE EXCHANGE IS A SENTENCE, AND THE SENTENCE IS BUILT ONCE.
 *
 * The reference pack, on the transcript that shipped: *"The current transcript
 * contains the right facts but makes the player reconstruct the event from
 * fragments. Replace the math/problem-reading presentation with plain-language
 * event reporting."* And the target, verbatim: *"YOU HIT Conspiracy Architect 1
 * for 25 HP"* / *"Conspiracy Architect 1 HIT YOU for 8 HP"*. And the prohibition:
 * *"Do not show the old equation-like fragments, duplicated actor/outcome
 * labels, arrows, or disconnected damage values when the same information can be
 * read as one sentence."*
 *
 * ⚠⚠⚠ WHAT WAS ON GLASS WAS ALL THREE OF THOSE AT ONCE, AND IT TOOK TWO ROWS.
 * A single player attack writes TWO log lines — the to-hit verdict
 * (`You — d20 → 14 + STR 6 = 20 vs Raider AC 13 — ✓ HIT`) and then the damage —
 * and VIS-2's strip drew each of them as its own instrument row:
 *
 *     YOU ▸ Raider                 HIT
 *     YOU ▸ Raider                 HIT   25
 *
 * Duplicated actor labels, a duplicated outcome stamp, an arrow, and a damage
 * value floating in its own column away from the words. Every fragment the pack
 * names, in six inches of screen, for one swing.
 *
 * ⚠⚠ THE FIX IS TWO PURE FUNCTIONS, AND NEITHER OF THEM RENDERS ANYTHING.
 * `eventLine` turns one authoritative `CombatEvent` into the pack's sentence as
 * ORDERED PARTS, so a renderer can colour a part without ever being the thing
 * that decides the word order. `foldExchanges` pairs the verdict row with the
 * damage row it belongs to, so one swing is one row again.
 *
 * ⚠ AND THE FOLD IS PRESENTATION, NOT AUTHORITY — the same ruling VIS-2 made
 * for loot: *"solved in presentation rather than by rewriting what the authority
 * logs."* Both lines still reach the disk log, the export and the playtest
 * report exactly as they always did, with every number in them. What changed is
 * that the FEED stops showing the player the same exchange twice.
 */
import { type CombatEvent, combatEventOf, outcomeLanded } from './combatEvent';

/* ─── A. THE EVENT LINE ──────────────────────────────────────────────────── */

/** The pack's sentence, in parts. ⚠ THE ORDER IS DECIDED HERE AND NOWHERE ELSE:
 *  a renderer that reassembled these in its own order would be a second place
 *  that could scramble "HIT / target / damage", which the pack forbids by name. */
export interface EventLine {
  /** who acted — `YOU`, or the combatant's name */
  subject: string;
  /** what happened, in one word: HIT · MISSED · DODGED · EVADED · SLIPPED */
  verb: string;
  /** who it happened to. Empty when the verb takes no object. */
  object: string;
  /** ` for 25 HP` — the consequence, inside the sentence rather than beside it */
  tail: string;
  /** the note after an em dash: `CRITICAL`, `FUMBLE`, `ARMOUR ABSORBED` */
  note: string;
  /** ⚠⚠ WHAT THE TARGET HAS LEFT — ` · 6/24`, or empty.
   *  VIS-2 put this on a second row beside the weapon name, and it is the one
   *  fact from that row worth keeping: in a five-raider fight `EnemyPanel` shows
   *  the ACTIVE enemy only, so the transcript is the only place the player learns
   *  what they left on the one they just hit. It rides INSIDE the sentence's text
   *  run rather than in a column of its own — the pack allows *"consequence/damage
   *  support at right only if it helps"* but forbids letting it *"recreate the old
   *  jumbled equation"*, and a number that cannot float away from the words cannot
   *  become the equation. */
  standing: string;
  /** true when the PLAYER is the subject. Drives emphasis; never word order. */
  bySelf: boolean;
  /** did anything arrive. Drives colour; never word order. */
  landed: boolean;
}

/** `YOU`, or the combatant's own name. ⚠ NO TRUNCATION HERE, and that is the
 *  change OTA-1772 was waiting for: a sentence WRAPS, so a long enemy name costs
 *  a second line instead of an ellipsis. The pack allows either — *"Allow long
 *  enemy names to wrap/truncate according to a governed rule without scrambling
 *  HIT/target/damage order"* — and wrapping is the one that never hides a name
 *  the player needs in order to know which of five raiders just hit them. */
function nameOf(n: string | undefined): string {
  const t = (n ?? '').trim();
  return t.length > 0 ? t : 'YOU';
}

/**
 * ⚠⚠⚠ A DEFENSIVE OUTCOME IS REPORTED FROM THE DEFENDER'S SIDE, and that is the
 * one place this builder departs from `ev.side`.
 *
 * `side` says who SWUNG. On a dodge nobody cares who swung — the fact is that
 * somebody got out of the way, and the pack's own example is written that way:
 * *"YOU BLOCKED Conspiracy Architect 1"*. So a player swing the enemy twisted
 * clear of reads `Raider DODGED YOU`, and an enemy swing the player evaded reads
 * `YOU EVADED Raider`. Three words, correct grammar, and the subject is the one
 * who did the thing the verb names.
 */
const DEFENSIVE = new Set(['dodged', 'evaded', 'slipped']);

/**
 * The sentence for one event, or `null` when this kind of event is not an
 * exchange (a defeat has its own plate, rewards have their own cluster).
 *
 * ⚠ `crit` AND `fumble` BECOME A NOTE RATHER THAN A VERB. "YOU CRIT Raider" is
 * jargon and "YOU FUMBLED Raider" is not English; both are still exceptional and
 * both still earn the emphasis VIS-2 reserved for them, as `— CRITICAL` and
 * `— FUMBLE` after the sentence. The sentence stays a sentence.
 */
export function eventLine(ev: CombatEvent | null | undefined): EventLine | null {
  if (!ev) return null;
  if (ev.kind !== 'swing' && ev.kind !== 'damage') return null;
  const o = ev.outcome;
  if (!o) return null;

  const attacker = ev.side === 'player' ? 'YOU' : nameOf(ev.actor);
  const defender = ev.side === 'player' ? nameOf(ev.target) : 'YOU';
  const defensive = DEFENSIVE.has(o);

  const subject = defensive ? defender : attacker;
  const object = defensive ? attacker : defender;
  const verb = defensive
    ? o.toUpperCase()
    : outcomeLanded(o) ? 'HIT' : 'MISSED';

  /* ⚠⚠ THE DAMAGE LIVES INSIDE THE SENTENCE. The pack: *"If a large numeric
   * accent remains, it must reinforce the sentence, not duplicate/conflict with
   * it."* The old strip had the number in a separate right-hand column, which is
   * exactly a duplicate-and-conflict: the words said HIT and a lone `25` sat
   * eight columns away with nothing joining them. */
  const landed = outcomeLanded(o);
  const dmg = typeof ev.dmg === 'number' ? ev.dmg : null;
  const tail = landed && dmg !== null ? ` for ${dmg} HP` : '';

  /* ⚠ ZERO IS A RESULT, NOT A MISSING NUMBER — the pack spells this case out:
   * *"Conspiracy Architect 1 HIT YOU for 0 HP — ARMOUR ABSORBED"*. A blow that
   * connects and does no damage is the single most confusing thing a transcript
   * can print without saying why, and the engine already knows why. */
  const note = landed && dmg === 0
    ? 'ARMOUR ABSORBED'
    : o === 'crit' ? 'CRITICAL'
    : o === 'fumble' ? 'FUMBLE'
    : '';

  /* ⚠ ONLY ON A BLOW THAT LANDED. A miss leaves the target exactly as it was, so
   * reprinting its HP would be noise dressed as a consequence. */
  const standing = landed && ev.hp ? ` · ${ev.hp.now}/${ev.hp.max}` : '';

  return { subject, verb, object, tail, note, standing, bySelf: subject === 'YOU', landed };
}

/** The same sentence as one string. ⚠ Used by tests and by anything that needs
 *  the line without a renderer — never by the strip, which styles the parts. */
export function eventSentence(ev: CombatEvent | null | undefined): string {
  const l = eventLine(ev);
  if (!l) return '';
  const head = `${l.subject} ${l.verb}${l.object ? ` ${l.object}` : ''}${l.tail}`;
  return `${l.note ? `${head} — ${l.note}` : head}${l.standing}`;
}

/* ─── B. THE FOLD ────────────────────────────────────────────────────────── */

/** The minimum a row needs to be folded. Deliberately structural: this function
 *  must be callable from a bare test with no `GameLogEntry` and no renderer. */
export interface FoldableEntry {
  id: string;
  meta?: unknown;
}

export type FoldedRow =
  /** one log entry, with the event it carries (already merged, if it absorbed a
   *  verdict) — `event` absent means an ordinary prose line */
  | { key: string; kind: 'entry'; index: number; event: CombatEvent | null }
  /** a run of adjacent reward events, drawn as one cluster */
  | { key: string; kind: 'rewards'; events: CombatEvent[] };

/** Who the exchange is against: the enemy, from whichever end the event names. */
function counterpart(ev: CombatEvent): string {
  return (ev.side === 'player' ? ev.target : ev.actor) ?? '';
}

/**
 * ⚠⚠⚠ ONE EXCHANGE, ONE ROW.
 *
 * A `swing` is a TO-HIT VERDICT — it is not an event on its own, it is the first
 * half of one. The resolver logs it separately because the disk log wants the
 * roll written down at the moment it happened, and that must not change. So the
 * fold pairs each verdict with the damage line that reports the same exchange
 * and drops the verdict's row, keeping its roll.
 *
 * ⚠⚠ TWO PASSES, BECAUSE ORDER IS NOT NEGOTIABLE. A one-pass version has to
 * HOLD a verdict it might later emit, and an unconsumed verdict would then
 * surface at the wrong place in the feed — a lie about sequence, which is the
 * exact thing VIS-2's reward clustering refused to do. Pass 1 decides what pairs
 * with what; pass 2 emits strictly in log order.
 *
 * ⚠ THE MATCH IS NARROW ON PURPOSE. Same side, same counterpart name, the
 * damage row has no roll of its own, and no other verdict of that side
 * intervenes. A five-raider round writes five interleaved exchanges and a loose
 * match would staple one raider's roll onto another raider's blow.
 *
 * ⚠ A VERDICT NOTHING CONSUMES STILL GETS ITS ROW. That is a dodge, an evade or
 * a held slip: the swing is the whole story, there is no damage line coming, and
 * `eventLine` already reads it from the defender's side.
 */
export function foldExchanges(entries: readonly FoldableEntry[]): FoldedRow[] {
  const events = entries.map((e) => combatEventOf(e.meta));

  // Pass 1 — pair verdicts with their consequences.
  const consumed = new Set<number>();
  const rollFor = new Map<number, CombatEvent>();
  for (let i = 0; i < events.length; i++) {
    const swing = events[i];
    if (!swing || swing.kind !== 'swing' || !swing.roll) continue;
    const side = swing.side;
    const against = counterpart(swing);
    for (let j = i + 1; j < events.length; j++) {
      const later = events[j];
      if (!later) continue;
      // another verdict for the same combatant closes the window
      if (later.kind === 'swing' && later.side === side && counterpart(later) === against) break;
      if (later.side !== side) continue;
      if (later.kind !== 'damage' && later.kind !== 'defeat') continue;
      if (later.roll) continue;
      const target = later.kind === 'defeat' ? (later.defeated ?? later.target ?? '') : counterpart(later);
      if (target !== against) continue;
      if (rollFor.has(j)) continue;
      consumed.add(i);
      rollFor.set(j, swing);
      break;
    }
  }

  // Pass 2 — emit in log order, collapsing adjacent rewards as VIS-2 did.
  const out: FoldedRow[] = [];
  let run: CombatEvent[] | null = null;
  let runKey = '';
  const flush = () => {
    if (run && run.length > 0) out.push({ key: `cmbr_${runKey}`, kind: 'rewards', events: run });
    run = null;
  };
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const ev = events[i];
    if (ev && ev.kind === 'reward') {
      if (!run) { run = []; runKey = e.id; }
      run.push(ev);
      continue;
    }
    flush();
    if (consumed.has(i)) continue;
    const swing = rollFor.get(i);
    /* ⚠ THE MERGE TAKES THE CONSEQUENCE'S FACTS AND THE VERDICT'S ROLL — except
     * for an EXCEPTIONAL outcome, where the verdict is the more specific claim.
     * The resolver writes `crit` on the swing and plain `hit` on the damage that
     * follows it, so without this a critical hit would silently read as an
     * ordinary one the moment the two rows became one. */
    const merged = ev && swing
      ? { ...ev, roll: swing.roll, outcome: (swing.outcome === 'crit' || swing.outcome === 'fumble') ? swing.outcome : ev.outcome }
      : ev;
    out.push({ key: e.id, kind: 'entry', index: i, event: merged ?? null });
  }
  flush();
  return out;
}
