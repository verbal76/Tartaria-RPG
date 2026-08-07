// OTA-1184 — WHAT YOU GAVE, TO WHOM, AND HOW THEY TOOK IT.
//
// Owner: "instead of things given away under arbitor, it should say gifts given,
// and if you tap it, it should show you what you gave to whom and how they
// received it."
//
// The data was always there — `npcRelations[id].gifts` has recorded the object by
// name since OTA-1083 — but nothing read it back. The sheet showed a bare count and
// the reaction was computed at give-time and dropped on the floor, so the record
// could not distinguish a gift somebody loved from one that insulted them.
//
// ⚠ This is a READ MODEL and nothing else. It derives entirely from worldMemory and
// writes nothing, so the count on the Arbiter row and the list it opens are the same
// arrays counted two ways and cannot drift apart.

import type { WorldMemory } from './types';

export interface GiftLedgerEntry {
  /** Display name of the recipient — falls back to the raw id if we never
   *  recorded one, which is better than hiding a gift the player remembers making. */
  who: string;
  /** The object. The owner's original requirement, and still the point. */
  item: string;
  /** In-game hours when it was handed over; used for ordering and for the day label. */
  atHours: number;
  /** In-game day, 1-based, matching how the feed talks about time. */
  day: number;
  /** How it landed. Undefined for gifts given before OTA-1184 started recording it. */
  reaction?: 'loved' | 'liked' | 'polite' | 'disliked' | 'insulted';
  /** Faction standing that actually moved, when it was recorded. */
  standingDelta?: number;
}

/** Player-facing phrasing for a reaction. ⚠ Kept here rather than in the screen so
 *  the ledger and any future surface (a Chronicle line, a vendor recap) describe the
 *  same reaction with the same word. `disliked` is deliberately NOT an insult —
 *  OTA-1176 introduced that tier precisely because a shrug and a refusal had been
 *  reading identically. */
export const REACTION_WORD: Record<string, string> = {
  loved: 'loved it',
  liked: 'liked it',
  polite: 'took it politely',
  disliked: 'had no use for it',
  insulted: 'took it as an insult',
};

/** Every gift on the record, newest first.
 *  ⚠ Sorted by `atHours` DESCENDING and NOT grouped by person: the player asked what
 *  he gave and how it went, and the most recent exchange is the one he is asking
 *  about. Grouping by NPC would bury a gift he gave an hour ago under someone he
 *  stopped dealing with on day three. */
export function giftLedger(
  wm: Pick<WorldMemory, 'npcRelations'> | null | undefined,
): GiftLedgerEntry[] {
  const out: GiftLedgerEntry[] = [];
  for (const [id, rel] of Object.entries(wm?.npcRelations ?? {})) {
    if (!rel?.gifts?.length) continue;
    for (const g of rel.gifts) {
      out.push({
        who: rel.name || id,
        item: g.name,
        atHours: g.atHours ?? 0,
        day: Math.floor((g.atHours ?? 0) / 24) + 1,
        reaction: g.reaction,
        standingDelta: g.standingDelta,
      });
    }
  }
  return out.sort((a, b) => b.atHours - a.atHours);
}

/** The one-line summary a ledger row renders as. Reaction is omitted rather than
 *  guessed when it was never recorded — an invented reaction on a historical gift
 *  would be worse than a blank, because OTA-1176 rewrote the entire taste table
 *  underneath those older entries. */
export function giftLedgerLine(e: GiftLedgerEntry): string {
  const word = e.reaction ? REACTION_WORD[e.reaction] : null;
  const tail = word ? ` — ${e.who} ${word}` : ` — ${e.who}`;
  return `${e.item}${tail}`;
}
