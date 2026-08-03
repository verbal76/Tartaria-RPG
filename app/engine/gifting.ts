// OTA-1083 — GIVING SOMEBODY SOMETHING.
//
// Owner's design: type `gift`, pick an item, pick a person; you get a discount,
// a standing bump or some other boon, and THEY REMEMBER THAT YOU GAVE THEM THAT
// PARTICULAR ITEM. That last clause is the whole feature. A gift system that
// only moves a warmth number is a second currency; a gift system that remembers
// the object is a relationship.
//
// ── WHY THIS IS NOT JUST "SPEND TC FOR REGARD" ────────────────────────────
// Buying already moves the ledger (OTA-1072 tcTraded, OTA-1076 amends). If a
// gift were only worth its price, the optimal play would be to hand over the
// most expensive thing you own and nothing else would matter. So value is a
// FLOOR, not the score: below the floor it is an insult, above it the reaction
// is driven by WHO THEY ARE — what they work with, what they care about, what
// they cannot get. Odar the fire-smith does not want your spare boots.
//
// ── THE THREE WAYS THIS COULD HAVE BEEN AN EXPLOIT, AND WHAT STOPS THEM ───
// 1. GIFT-FARM. Handing over twenty of the same thing must not buy twenty
//    steps of warmth. Repeat gifts of the SAME item decay to nothing
//    (REPEAT_DECAY), because the second identical present is not a surprise.
// 2. TRASH-FLOOD. Twenty worthless things must not equal one good one. A gift
//    under GIFT_FLOOR_TC is refused outright and costs a little standing —
//    offering somebody a bent nail is a comment, and they take it as one.
// 3. BUY-BACK LOOP. Gift it, they like you, buy it back cheap, gift it again.
//    Gifts are CONSUMED and never re-enter their stock, and the boon is capped
//    per person (GIFT_BOONS_PER_PERSON), so the loop terminates.
//
// Deterministic throughout: the same gift to the same person in the same state
// produces the same reaction, for the reason every other line in this system is
// deterministic (OTA-1072) — an NPC whose gratitude is a dice roll reads as
// broken rather than as varied.
import rawPrefs from '../data/npcs/gift_prefs.json';
import type { NpcRelation } from './types';

/** Below this, offering it is an insult rather than a gift. Deliberately low —
 *  the point is to exclude bent nails and mud, not to gate the feature behind
 *  wealth. */
export const GIFT_FLOOR_TC = 12;
/** Each repeat of the SAME item name is worth this much of the last one. */
export const REPEAT_DECAY = 0.35;
/** How many times one person's regard can be moved by gifts, ever. Past this
 *  they are pleased and say so, but the ledger does not move: warmth has to be
 *  mostly earned by doing things, not by shopping. */
export const GIFT_BOONS_PER_PERSON = 4;
/** Standing granted by a gift they love / like. */
export const STANDING_LOVED = 4;
export const STANDING_LIKED = 2;
/** Standing lost by offering something insulting. */
export const STANDING_INSULT = 2;
/** ⚠ LIFETIME standing a FACTION can ever gain from gifts, across every one of
 *  its members. This is the load-bearing number in the whole feature.
 *
 *  OTA-803 DELETED GIFTING FOR EXACTLY THIS REASON. Its note, still in
 *  parser.ts: "Faction standing is earned through mission completions +
 *  sigil/pendant turn-ins, not by handing vendors loot; the gift-for-rep side
 *  door undercut that, so the whole verb + action is gone."
 *
 *  Re-adding the verb without closing that door would re-add the bug. A
 *  per-person cap is not enough: several vendors share a faction, so four boons
 *  each across five members is eighty standing through a side door. So the
 *  faction total is capped ONCE, globally, at roughly one mission's worth —
 *  enough for a gift to register as a "status bump" the way the owner asked,
 *  nowhere near enough to be a route.
 *
 *  The uncapped part of a gift is the PERSONAL relationship, which is contained
 *  by construction: it moves one ledger row, it buys that person's discount
 *  (OTA-1076 regardPriceMult), and it cannot cascade to anybody else. */
export const GIFT_STANDING_FACTION_CAP = 10;

export type GiftReaction = 'loved' | 'liked' | 'polite' | 'insulted';

interface GiftPref {
  /** Item tags this person is delighted by. */
  lovesTags?: string[];
  /** Exact item names they are delighted by — sharper than a tag. */
  lovesItems?: string[];
  /** Tags they have no use for. Not an insult; just a shrug. */
  coldTags?: string[];
  /** Said when they love it. `{item}` is replaced. */
  lovedLine?: string;
  likedLine?: string;
  politeLine?: string;
  insultLine?: string;
}

const PREFS = (rawPrefs as { npcs: Record<string, GiftPref>; fallback: GiftPref }).npcs;
const FALLBACK = (rawPrefs as { fallback: GiftPref }).fallback;

export function giftPrefFor(npcId: string): GiftPref {
  return PREFS[npcId] ?? FALLBACK;
}

export interface GiftItem {
  name: string;
  tags: string[];
  /** Best available worth in TC. Callers pass the catalog value. */
  worth: number;
}

/** How many times this exact item has already been given to this person. */
export function timesGiven(rel: NpcRelation | null | undefined, itemName: string): number {
  return rel?.gifts?.filter((g) => g.name === itemName).length ?? 0;
}

export function giftBoonsUsed(rel: NpcRelation | null | undefined): number {
  return rel?.giftBoons ?? 0;
}

/** The reaction, before any decay. Pure function of who they are and what it is. */
export function reactionFor(npcId: string, item: GiftItem): GiftReaction {
  if (item.worth < GIFT_FLOOR_TC) return 'insulted';
  const p = giftPrefFor(npcId);
  const tags = item.tags.map((t) => t.toLowerCase());
  if ((p.lovesItems ?? []).some((n) => n.toLowerCase() === item.name.toLowerCase())) return 'loved';
  if ((p.lovesTags ?? []).some((t) => tags.includes(t.toLowerCase()))) return 'loved';
  if ((p.coldTags ?? []).some((t) => tags.includes(t.toLowerCase()))) return 'polite';
  // Something genuinely valuable is welcome from anybody, whatever their trade.
  return item.worth >= GIFT_FLOOR_TC * 6 ? 'liked' : 'polite';
}

export interface GiftOutcome {
  reaction: GiftReaction;
  /** Whether this moves the ledger at all (false = decayed away, capped out,
   *  or refused). The item is still consumed unless `refused`. */
  countsAsBoon: boolean;
  /** True when they will not take it — the item stays in the pack. */
  refused: boolean;
  standingDelta: number;
  /** Recorded on the relation so the Chronicle and later greetings can use it. */
  remember: boolean;
  line: string;
}

export function resolveGift(
  npcId: string,
  npcName: string,
  item: GiftItem,
  rel: NpcRelation | null | undefined,
): GiftOutcome {
  const p = giftPrefFor(npcId);
  const say = (tpl: string | undefined, fallback: string) =>
    (tpl ?? fallback).replace(/\{item\}/g, item.name).replace(/\{npc\}/g, npcName);
  const reaction = reactionFor(npcId, item);

  if (reaction === 'insulted') {
    // ⚠ REFUSED, not accepted-and-ignored. If a worthless gift were taken, a
    // player could empty a pack of junk into somebody and the only cost would be
    // taps. Refusing keeps the item AND makes the insult legible.
    return {
      reaction, countsAsBoon: false, refused: true, remember: false,
      standingDelta: -STANDING_INSULT,
      line: say(p.insultLine, `${npcName} looks at the {item}, then at you. "No. Keep it."`),
    };
  }

  const already = timesGiven(rel, item.name);
  const capped = giftBoonsUsed(rel) >= GIFT_BOONS_PER_PERSON;
  // The second identical present is not a surprise, and the fifth is a habit.
  const decayed = already > 0 && Math.pow(REPEAT_DECAY, already) < 0.3;
  const counts = !capped && !decayed && reaction !== 'polite';

  const standingDelta = !counts ? 0 : reaction === 'loved' ? STANDING_LOVED : STANDING_LIKED;
  const base =
    reaction === 'loved' ? say(p.lovedLine, `${npcName} takes the {item} carefully. "This — yes. Thank you."`)
    : reaction === 'liked' ? say(p.likedLine, `${npcName} weighs the {item} and nods. "That is a good thing to be given."`)
    : say(p.politeLine, `${npcName} accepts the {item} politely. It goes under the counter and you suspect it stays there.`);

  const suffix = capped
    ? ` They are already about as warm towards you as gifts can make anybody.`
    : decayed
      ? ` You have given them ${item.name} before. The gesture lands softer each time.`
      : '';

  return {
    reaction, countsAsBoon: counts, refused: false, remember: true,
    standingDelta, line: base + suffix,
  };
}

/** The Chronicle line — what they remember you giving them. This is the clause
 *  the owner asked for by name, so it names the OBJECT, not a score. */
export function giftMemoryLine(rel: NpcRelation | null | undefined): string {
  const gifts = rel?.gifts ?? [];
  if (gifts.length === 0) return '';
  const names = Array.from(new Set(gifts.map((g) => g.name)));
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `gifts: ${shown}, and ${names.length - 3} more` : `gifts: ${shown}`;
}

export const GIFT_PREF_NPC_IDS = Object.keys(PREFS);
