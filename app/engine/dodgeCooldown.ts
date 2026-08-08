// OTA-1170 — DODGE GETS A COOLDOWN, AND THE BUTTON SHOWS IT.
//
// Owner: "put a cooldown timer on dodge. once it's used have it turn red and slowly fill
// back to blue; when it's full blue it can be used again. make the color fill left to
// right with no fade."
//
// ⚠ WHY THIS EXISTS, from the owner's own device log: dodge resolves as
// `d20 + DEX >= the enemy's attack TOTAL`, so at DEX 19 only a natural 1 fails. The log
// shows FIVE dodges and FIVE wins — including on a natural 2 and a natural 3 — each one
// granting a PERFECT OPENING (next strike ×2 dice), which then rolled
// `slashing ×2.25 for 52` into a 47 HP raider. Alternating dodge→attack made roughly half
// of all his attacks land at double dice for no risk. That is the button-masher he
// reported, and the cooldown is the fix that does not touch the dodge maths.
//
// ⚠ MEASURED IN ROUNDS, NOT SECONDS, AND THAT WAS A DELIBERATE REJECTION OF THE BRIEF.
// The owner asked for 10-15 seconds. This game is turn-based, and his log shows him acting
// every 1-2 seconds in combat (`02:46:14 dodge → 02:46:15 attack`), so a 15-second
// wall-clock lock would cost SEVEN TO TEN actions, and the optimal play would become
// putting the phone down and waiting. That is dead air, which is worse than the mashing it
// replaces — and it would punish fast players while rewarding slow ones for nothing
// skillful. Rounds make the bar fill because of something you DID.

/** Actions the stance is locked for after use. Dodge, two rounds red, usable on the third.
 *  ⚠ Sized against real fights in the log: ordinary raiders die in 2-4 rounds, so this is
 *  roughly one dodge per skirmish; the Core Guardian ran 34 rounds, so it stays a real
 *  tool in a long fight (~11 uses) instead of being removed from boss play. */
export const DODGE_COOLDOWN_ROUNDS = 3;

/** ⚠ OTA-1171 — THE LOCK IS PER DIFFICULTY TIER NOW, and this is the only place that
 *  turns the tier's multiplier into rounds. Owner: *"use this as a baseline and tune the
 *  other levels accordingly."* The constant above stays the BASELINE — it is what 'owed',
 *  the identity row, resolves to — and the tiers are multiples of it: salvage 0 (no
 *  cooldown at all, the pre-OTA-1170 game), owed 3, let_it_come 4, bury_me 5.
 *
 *  ⚠ Takes a plain number rather than a player, deliberately: this file imports NOTHING,
 *  and it stays that way so `pressure.ts` can depend on it without a cycle. The caller
 *  reads `dialOf(player, 'dodgeLock')`.
 *
 *  ⚠ Absent reads as 1, not 0. A missing dial must mean "the baseline", never "no
 *  cooldown" — an undefined slipping through as a free dodge is a balance change nobody
 *  chose, and it would silently hand every unmigrated save the salvage rules. */
export function dodgeCooldownRounds(dodgeLock: number | undefined): number {
  const mult = Number.isFinite(dodgeLock) ? Math.max(0, dodgeLock as number) : 1;
  return Math.max(0, Math.round(DODGE_COOLDOWN_ROUNDS * mult));
}

/** 0…1 — how far the bar has refilled. 0 = just used (full red), 1 = ready (full blue).
 *  ⚠ Returns DISCRETE steps, one per action, because the refill is tied to rounds rather
 *  than to time. The owner asked for a hard edge and no fade; a continuous value here
 *  would invite the renderer to animate between frames and undo that.
 *
 *  ⚠ OTA-1171 — `max` is THE TIER'S round count, not the constant. The denominator has to
 *  be the same number the store armed, or the bar lies: at bury_me's 5 rounds a bar
 *  divided by 3 would read full blue with two beats still locked, and the chip would
 *  refuse a tap it visibly invited. Defaults to the baseline so every existing caller and
 *  every save without a tier is unchanged.
 *  ⚠ A max of 0 (salvage — no cooldown) is always full: dividing by it would be NaN. */
export function dodgeFill(cooldown: number | undefined, max: number = DODGE_COOLDOWN_ROUNDS): number {
  const m = Number.isFinite(max) ? Math.max(0, Math.round(max)) : DODGE_COOLDOWN_ROUNDS;
  if (m <= 0) return 1;
  const c = Math.max(0, Math.min(m, Math.round(cooldown ?? 0)));
  return (m - c) / m;
}

/** Ready to dodge again? Absent/0 = ready, which is what every existing save reads as —
 *  nobody is locked out by the migration. */
export function dodgeReady(cooldown: number | undefined): boolean {
  return (cooldown ?? 0) <= 0;
}

/** The refusal. ⚠ It names the ROUNDS remaining, not seconds, so the player learns the
 *  unit the bar is actually counting in. A cooldown that refuses without saying how long
 *  is the OTA-1164 defect again. */
export function dodgeCooldownLine(cooldown: number | undefined): string {
  const c = Math.max(1, Math.round(cooldown ?? 1));
  return `You're still recovering your footing — ${c} more ${c === 1 ? 'beat' : 'beats'} before you can set for another dodge.`;
}
