/* ⚠⚠⚠ VIS-2 — THE COMBAT RESULT, AS A FACT, BESIDE THE SENTENCE THAT SAYS IT.
 *
 * Combat authority has always known who swung, what they rolled, whether it
 * landed, for how much, and what was left standing. The FEED only ever received
 * a sentence — so the player read a paragraph to answer questions the engine had
 * already answered, and the presentation had no way to lay those answers out
 * without re-deriving them from prose.
 *
 * ⚠⚠ THIS IS METADATA, NOT A SECOND SOURCE OF TRUTH. Every field here is copied
 * from the value the resolver just used to build its own line, at the same call
 * site, in the same statement. There is no parsing anywhere — of the log, of
 * Qwen's narration, of anything. Qwen is presentation; this is a projection of
 * the authority, and if the two ever disagreed the authority would be the one
 * that was right, which is why the text is still written from the same values.
 *
 * ⚠ IT RIDES `GameLogEntry.meta`, which already exists and already carries
 * `combatOutcome` (OTA-221's colour tag) and `storyBeat` (OTA-1051). Nothing
 * about channels, TTS routing, HIDDEN_LOG_CHANNELS or the disk log changes: an
 * entry with no `cmb` renders exactly as it did before.
 *
 * ⚠ AND IT IS DELIBERATELY SMALL. No event bus, no reducer, no new lifecycle —
 * the brief's own guard ("do not create unnecessary architecture"). One optional
 * bag on a log line that already had one.
 */

/** What the die said, in the words the resolver already used. */
export type CombatOutcome =
  | 'hit' | 'crit' | 'miss' | 'fumble' | 'dodged' | 'slipped' | 'evaded';

/** Who acted. The feed's direction cue is structural, not colour, so this is
 *  the field the layout keys on — not the actor's name. */
export type CombatSide = 'player' | 'enemy';

export interface CombatRoll {
  /** the natural d20 */
  d20: number;
  bonus: number;
  /** e.g. "STR 6" / "ATK 6" — the resolver's own label, verbatim */
  bonusLabel: string;
  total: number;
  /** the number the total was compared against */
  vs: number;
  /** e.g. "Raider AC" / "your AC" — again the resolver's own words */
  vsLabel: string;
}

export interface CombatLoot { name: string; qty?: number }

export interface CombatEvent {
  /** `swing` = a to-hit verdict. `damage` = something lost HP. `defeat` = a
   *  combatant is down. `reward` = loot or TC. `status` = a standing count or
   *  a condition. One of five; a sixth would want a reason. */
  kind: 'swing' | 'damage' | 'defeat' | 'reward' | 'status';
  side: CombatSide;
  /** Display name of the actor. Absent means the player ("YOU"). */
  actor?: string;
  /** Display name of the target. Absent means the player. */
  target?: string;
  outcome?: CombatOutcome;
  roll?: CombatRoll;
  dmg?: number;
  /** The weapon or source, when the resolver knew one. */
  weapon?: string;
  /** The target's HP AFTER this event. */
  hp?: { now: number; max: number };
  /** Name of whoever went down, on a `defeat`. */
  defeated?: string;
  /** How many hostiles are still standing, when the resolver counted. */
  remaining?: number;
  loot?: CombatLoot[];
  tc?: number;
}

/** Build the meta bag for an `appendLog` call. Existing meta (the OTA-221
 *  colour tag) rides alongside untouched — this never replaces it. */
export function cmb(
  event: CombatEvent,
  also?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(also ?? {}), cmb: event };
}

/** Read the event off an entry, if it has one. The single reader — nothing in
 *  the app is allowed to reconstruct this from text. */
export function combatEventOf(meta: unknown): CombatEvent | null {
  const bag = meta as { cmb?: CombatEvent } | undefined | null;
  const ev = bag?.cmb;
  if (!ev || typeof ev !== 'object' || typeof ev.kind !== 'string') return null;
  return ev;
}

/* ─── PURE PRESENTATION HELPERS ──────────────────────────────────────────────
 * Kept here, beside the shape, so the feed component holds layout and nothing
 * else — and so every one of them is testable without a renderer. */

/** The outcome's short stamp. Upper case because these are readings off an
 *  instrument, not sentences. */
export function outcomeLabel(o: CombatOutcome | undefined): string {
  switch (o) {
    case 'crit': return 'CRIT';
    case 'hit': return 'HIT';
    case 'miss': return 'MISS';
    case 'fumble': return 'FUMBLE';
    case 'dodged': return 'DODGED';
    case 'evaded': return 'EVADED';
    case 'slipped': return 'SLIPPED';
    default: return '';
  }
}

/** Did anything arrive? Drives emphasis, never mechanics. */
export function outcomeLanded(o: CombatOutcome | undefined): boolean {
  return o === 'hit' || o === 'crit';
}

/** ⚠ EXCEPTIONAL OUTCOMES EARN EMPHASIS; ORDINARY ONES DO NOT. A crit, a
 *  fumble and a dodge are rare enough to be worth a stronger stamp. An ordinary
 *  HIT is most of combat, and making it a celebration is how a feed becomes an
 *  arcade cabinet. */
export function outcomeIsExceptional(o: CombatOutcome | undefined): boolean {
  return o === 'crit' || o === 'fumble' || o === 'dodged' || o === 'evaded' || o === 'slipped';
}

/** The roll, in one short expression, for the disclosure line. Never wraps at
 *  phone width: it is the shortest honest form of the same arithmetic the log
 *  line already carries in words. */
export function rollExpression(r: CombatRoll): string {
  const sign = r.bonus < 0 ? '−' : '+';
  return `d20 ${r.d20} ${sign} ${r.bonusLabel} = ${r.total}  vs  ${r.vsLabel} ${r.vs}`;
}

/** `YOU` or the actor's name, trimmed to something a phone column can hold.
 *  ⚠ A long enemy name must not be allowed to destroy the layout, and clipping
 *  it in the DATA rather than relying on `numberOfLines` keeps the two columns
 *  aligned across every row in the feed. */
export function combatantLabel(name: string | undefined, max = 18): string {
  if (!name) return 'YOU';
  const n = name.trim();
  return n.length <= max ? n : `${n.slice(0, max - 1)}…`;
}

/** How the loot of one defeat reads when several drops are grouped: quantities
 *  attached to the name, never a row each. */
export function lootLabel(l: CombatLoot): string {
  return l.qty && l.qty > 1 ? `${l.name} ×${l.qty}` : l.name;
}
