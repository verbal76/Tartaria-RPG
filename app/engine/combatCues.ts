// OTA-936 — combat LEGIBILITY cues ("show me my build is working"). The math already
// runs — armor resists, coatings, title/race halves — but it surfaces only as terse
// bracket clauses ("[armor -40%, title 1/2]"). These once-per-encounter plain-language
// lines make the defensive half of the build FELT: praise when a matched resist soaks
// most of a hit, a warning when a hit leaks through a hole in the loadout. Owner brief:
// players should "see that their builds, their gear and their resists are actually
// doing something" — keep it at the forefront of their mind, never micromanaged spam
// (hence once per encounter, latched in the store).
//
// Pure decision logic, extracted so the rules are unit-testable.

export interface IncomingCueArgs {
  /** the raw damage roll before any mitigation */
  rawDmg: number;
  /** the final damage after the whole resist stack (and ward) */
  dmg: number;
  /** did an armor/coating resist match this damage type? */
  armorBlocked: boolean;
  /** the armor resist's soak fraction (0..0.8) when it matched */
  armorFraction: number;
  /** did any OTHER defensive layer fire (title half, race resist, shield, ward)? */
  otherLayerFired: boolean;
  /** the incoming hit's damage type */
  damageType: string;
}

export type IncomingCue = 'soak' | 'leak' | null;

/** Coatable/elemental types a player could actually fix with gear. A physical hit with
 *  no resist is the NORMAL state of combat — nagging "get a physical coating" would be
 *  wrong, so the leak cue is gated to the elements coatings cover. */
const COATABLE_ELEMENT = /aetheric|burn|cold|electrical|poison|acid|corruption|radiation/i;

export function incomingHitCue(a: IncomingCueArgs): IncomingCue {
  // A matched armor resist doing REAL work (>=40% soak) deserves the callout.
  if (a.armorBlocked && a.armorFraction >= 0.4) return 'soak';
  // Nothing in the loadout touched an elemental hit that actually hurt: that is a
  // HOLE, and the player should hear about it exactly once this fight.
  if (!a.armorBlocked && !a.otherLayerFired && a.dmg >= 4 && COATABLE_ELEMENT.test(a.damageType)) {
    return 'leak';
  }
  return null;
}

export function soakCueLine(damageType: string, rawDmg: number, dmg: number): string {
  return `That's your ${damageType} resist working — the armor drank most of that hit (${dmg} of ${rawDmg} got through).`;
}

export function leakCueLine(damageType: string): string {
  return `The ${damageType} went through clean — nothing you're wearing resists ${damageType}. A matching coating worked into your armor would blunt the next one.`;
}
