// sacredGround.ts — OTA-1212. THE MARKET TRUCE, AS LAW.
//
// Owner, after a Conspiracy Architects war party killed Verbal ON Hidden
// Market ground: "the hidden market is sacred tartarian ground. it's like
// holy ground on the Highlander and the Continental in John Wick."
//
// The location's own text always said it ("agents of every faction trade
// here under an unspoken truce") and three spawn doors already honored it,
// each with its OWN inline spelling of "is this the market" — while the
// fourth (the standing raid, the deadliest) had none, and the fifth (the
// rest ambush) rolled a full wilderness 22%. This is the ONE spelling all
// of them now share; a door that spells the check itself is how the next
// door ships open.
//
// Sacred ground means: the WORLD brings no violence here — no raids, no
// arrival encounters, no investigate ambush, no rest ambush. What the
// player starts is their own sin, and the roads outside stay as dangerous
// as ever — the truce ends at the stalls' edge.

export function isSacredGround(
  loc: { id?: string | null; tags?: readonly unknown[] } | null | undefined,
): boolean {
  if (!loc) return false;
  if (loc.id === 'hidden_market') return true;
  return (loc.tags ?? []).some((t) => String(t).toLowerCase() === 'market');
}
