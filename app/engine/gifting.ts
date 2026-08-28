// OTA-1060 — GIVING SOMEBODY SOMETHING.
//
// Owner's design: type `gift`, pick an item, pick a person; you get a discount,
// a standing bump or some other boon, and THEY REMEMBER THAT YOU GAVE THEM THAT
// PARTICULAR ITEM. That last clause is the whole feature. A gift system that
// only moves a warmth number is a second currency; a gift system that remembers
// the object is a relationship.
//
// ── WHY THIS IS NOT JUST "SPEND TC FOR REGARD" ────────────────────────────
// Buying already moves the ledger (OTA-1049 tcTraded, OTA-1053 amends). If a
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
// deterministic (OTA-1049) — an NPC whose gratitude is a dice roll reads as
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
 *  (OTA-1053 regardPriceMult), and it cannot cascade to anybody else. */
export const GIFT_STANDING_FACTION_CAP = 10;

/** OTA-1153 — 'disliked' is a NEW tier between polite and insulted. The owner
 *  asked for like / love / DISLIKE lists, and the schema had no dislike: the old
 *  `coldTags` resolved to 'polite', which is what an item they have no opinion
 *  about gets. So a smith shrugging at a pastry and a smith who actively does not
 *  want your poison read identically.
 *  ⚠ DISLIKED IS NOT AN INSULT, deliberately. 'insulted' is reserved for anything
 *  under GIFT_FLOOR_TC — the bent-nail case — and it REFUSES the gift and costs
 *  standing. A disliked gift is still accepted and still costs you nothing: they
 *  simply take no pleasure in it and it buys no warmth. Making dislike cost
 *  standing would punish a player for guessing wrong about somebody's taste,
 *  which is the opposite of a system meant to reward learning who people are. */
export type GiftReaction = 'loved' | 'liked' | 'disliked' | 'polite' | 'insulted';

interface GiftPref {
  /** Item tags this person is delighted by. */
  lovesTags?: string[];
  /** Exact item names they are delighted by — sharper than a tag. */
  lovesItems?: string[];
  /** OTA-1153 — the MIDDLE tier: things that suit them without delighting them.
   *  Before this, 'liked' could only be reached by raw price (>= 6x the floor),
   *  so a cheap thing perfectly matched to somebody's trade was a shrug while any
   *  expensive thing was a win. That made the whole system a price check wearing
   *  a personality. */
  likesTags?: string[];
  likesItems?: string[];
  /** OTA-1153 — things they actively do not want. */
  dislikesTags?: string[];
  dislikesItems?: string[];
  /** Legacy name for dislikesTags, still read so old data keeps working. */
  coldTags?: string[];
  /** OTA-1083 — the one-time return gift at trusted: the item they push
   *  across the counter, and the words they do it with. Only the authored
   *  cast carries one — a return gift requires having tastes to honor. */
  returnGift?: string;
  returnGiftLine?: string;
  /** Said when they love it. `{item}` is replaced. */
  lovedLine?: string;
  likedLine?: string;
  /** OTA-1153 — said when it is something they actively did not want. */
  dislikeLine?: string;
  politeLine?: string;
  insultLine?: string;
}

const PREFS = (rawPrefs as { npcs: Record<string, GiftPref>; fallback: GiftPref }).npcs;
const FALLBACK = (rawPrefs as { fallback: GiftPref }).fallback;
/** OTA-1153 — ONE PERSON, TWO NAMES. Five shopkeepers also work a Hidden Market
 *  stall, and the Market spells some of them differently: the shop knows
 *  `halem_trader`, the Market calls him "Halem the Trader", which slugs to
 *  `halem_the_trader`. Without this map those are two strangers who happen to
 *  look alike, and the two taste lists drift apart the first time one is edited.
 *  Aliases point the spelling at the canonical entry — never a second copy. */
const ALIASES = ((rawPrefs as { aliases?: Record<string, string> }).aliases ?? {});

/** OTA-1153 — THE LOOKUP CHAIN, and why a flat map could never have covered the cast.
 *
 *  Ledger ids are not all authored constants (see npcLedgerId). Fixed shopkeepers
 *  key as `irma_ironhand`, but roadside traders key as `roadside:<name>`, Hidden
 *  Market staff as `hidden_market_<category>:<name>`, lookout traders as
 *  `overlay:<name>`, and wanderers as `wanderer:<archetype>:<name>`. A flat map
 *  keyed on the whole id reached the 30 fixed shopkeepers and NOBODY ELSE — every
 *  roadside stall, every Market stall and all 112 possible wanderers fell to the
 *  generic fallback and reacted on price alone.
 *
 *  ⚠ AND THE SAME PERSON HAD TWO IDENTITIES. Halem, Bran, Tarek, Silvan and Mara
 *  work both their own shop and a Hidden Market stall, under different ids. Two
 *  entries for one person is two things to keep in sync, and they WILL drift — so
 *  the chain falls back to the person's NAME, and one entry covers them wherever
 *  they are standing.
 *
 *  Order, most specific first:
 *    1. the exact ledger id            — `irma_ironhand`, `roadside:grit_maalen`
 *    2. the person, by name slug       — `halem the trader` -> `halem_the_trader`
 *    3. the group / archetype          — `wanderer:tinker`, `hidden_market_food`
 *    4. the generic fallback           — price only, no tastes
 *
 *  112 wanderer ids collapse to 7 archetype entries this way, which is the right
 *  granularity: the archetype is the person, the first name is a coin flip. */
export function giftPrefFor(npcId: string, npcName?: string): GiftPref {
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const deref = (k: string): GiftPref | null => {
    const target = ALIASES[k] ?? k;
    return PREFS[target] ?? null;
  };
  const direct = deref(npcId);
  if (direct) return direct;
  // 2 — the person themselves, however you met them.
  const tail = npcId.includes(':') ? npcId.slice(npcId.lastIndexOf(':') + 1) : '';
  if (tail) { const p = deref(tail); if (p) return p; }
  if (npcName) { const p = deref(slug(npcName)); if (p) return p; }
  // 3 — the group they belong to. `wanderer:tinker:corin` -> `wanderer:tinker`,
  // then `hidden_market_food:halem` -> `hidden_market_food`, then `roadside:x` ->
  // `roadside`. Longest prefix first so an archetype beats a bare group.
  const parts = npcId.split(':');
  for (let take = parts.length - 1; take >= 1; take--) {
    const p = deref(parts.slice(0, take).join(':'));
    if (p) return p;
  }
  return FALLBACK;
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

/** OTA-1153 — every tag/name test in this file goes through these two, so a
 *  casing or whitespace difference cannot make one tier match where another
 *  would not. */
const hasTag = (list: string[] | undefined, tags: string[]) =>
  (list ?? []).some((t) => tags.includes(t.trim().toLowerCase()));
const isNamed = (list: string[] | undefined, name: string) =>
  (list ?? []).some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());

/** The reaction, before any decay. Pure function of who they are and what it is.
 *
 *  ⚠ ORDER IS THE DESIGN. Exact NAMES beat tags at every tier, because a named
 *  favourite is the sharper statement about a person. Then loves, then dislikes,
 *  then likes: dislikes sit ABOVE likes so a broad `likesTags` cannot rescue
 *  something the same person was written to not want. Price is the LAST word and
 *  only for items nobody has an opinion about — before OTA-1153 it was effectively
 *  the only word, which made the whole system a price check in a costume. */
export function reactionFor(npcId: string, item: GiftItem, npcName?: string): GiftReaction {
  if (item.worth < GIFT_FLOOR_TC) return 'insulted';
  const p = giftPrefFor(npcId, npcName);
  const tags = item.tags.map((t) => t.trim().toLowerCase());
  if (isNamed(p.lovesItems, item.name)) return 'loved';
  if (isNamed(p.dislikesItems, item.name)) return 'disliked';
  if (isNamed(p.likesItems, item.name)) return 'liked';
  if (hasTag(p.lovesTags, tags)) return 'loved';
  if (hasTag(p.dislikesTags ?? p.coldTags, tags)) return 'disliked';
  if (hasTag(p.likesTags, tags)) return 'liked';
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
  const p = giftPrefFor(npcId, npcName);
  const say = (tpl: string | undefined, fallback: string) =>
    (tpl ?? fallback).replace(/\{item\}/g, item.name).replace(/\{npc\}/g, npcName);
  const reaction = reactionFor(npcId, item, npcName);

  if (reaction === 'insulted') {
    // ⚠ REFUSED, not accepted-and-ignored. If a worthless gift were taken, a
    // player could empty a pack of junk into somebody and the only cost would be
    // taps. Refusing keeps the item AND makes the insult legible.
    //
    // ⚠⚠⚠ OTA-1534 — AND A FIRST OFFER COSTS NO STANDING. The owner, after Irma
    // took −2 for a Salvage Cap: *"I don't think that should give negative
    // standing since you need to guess at first what they are in to and like."*
    // He is right, and the comment above already contains the reason: the
    // REFUSAL is the anti-junk-dump mechanism — the item is not taken, so
    // nothing is gained by trying. The standing hit was a second punishment
    // stacked on top of it, charged to a player who had no way to know. Tastes
    // are authored per person and discoverable only by offering.
    //
    // ⚠ A REPEAT still costs. Being told "no" and handing over the same thing
    // again is not a guess, it is a point being made — and that is exactly the
    // junk-dumping the refusal exists to discourage, so it keeps its price.
    const offeredBefore = timesGiven(rel, item.name) > 0;
    return {
      reaction, countsAsBoon: false, refused: true, remember: false,
      standingDelta: offeredBefore ? -STANDING_INSULT : 0,
      line: say(p.insultLine, `${npcName} looks at the {item}, then at you. "No. Keep it."`),
    };
  }

  const already = timesGiven(rel, item.name);
  const capped = giftBoonsUsed(rel) >= GIFT_BOONS_PER_PERSON;
  // The second identical present is not a surprise, and the fifth is a habit.
  const decayed = already > 0 && Math.pow(REPEAT_DECAY, already) < 0.3;
  // ⚠ 'disliked' joins 'polite' here: accepted, remembered, but it buys nothing.
  // A gift they did not want is not a boon, and it is not a punishment either.
  const counts = !capped && !decayed && reaction !== 'polite' && reaction !== 'disliked';

  const standingDelta = !counts ? 0 : reaction === 'loved' ? STANDING_LOVED : STANDING_LIKED;
  const base =
    reaction === 'loved' ? say(p.lovedLine, `${npcName} takes the {item} carefully. "This — yes. Thank you."`)
    : reaction === 'liked' ? say(p.likedLine, `${npcName} weighs the {item} and nods. "That is a good thing to be given."`)
    : reaction === 'disliked' ? say(p.dislikeLine, `${npcName} takes the {item} without much enthusiasm. "It is not really my sort of thing. But thank you."`)
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

/** OTA-1083 — WHAT A REACTION TEACHES. When a gift lands, the reaction is the
 *  tell: a LOVED reaction reveals which taste it hit (tag or exact item), a
 *  POLITE reaction on a matched cold tag reveals the shrug. Returns ledger
 *  entries like 'loves:metal', 'loves:Aether Mud', 'cold:food' — the gift
 *  picker shows what has been WITNESSED, never the authored list itself. */
export function tasteDiscoveries(npcId: string, item: GiftItem, reaction: GiftReaction, npcName?: string): string[] {
  const p = giftPrefFor(npcId, npcName);
  const tags = item.tags.map((t) => t.trim().toLowerCase());
  const found: string[] = [];
  if (reaction === 'loved') {
    if (isNamed(p.lovesItems, item.name)) found.push(`loves:${item.name}`);
    for (const t of p.lovesTags ?? []) if (tags.includes(t.trim().toLowerCase())) found.push(`loves:${t}`);
  }
  // OTA-1153 — the middle and negative tiers are learnable too. Without this the
  // picker could only ever show what somebody LOVES, so a player had no way to
  // record "asked, and they did not want it" except by remembering it themselves.
  if (reaction === 'liked') {
    if (isNamed(p.likesItems, item.name)) found.push(`likes:${item.name}`);
    for (const t of p.likesTags ?? []) if (tags.includes(t.trim().toLowerCase())) found.push(`likes:${t}`);
  }
  if (reaction === 'disliked') {
    if (isNamed(p.dislikesItems, item.name)) found.push(`dislikes:${item.name}`);
    for (const t of p.dislikesTags ?? p.coldTags ?? []) if (tags.includes(t.trim().toLowerCase())) found.push(`dislikes:${t}`);
  }
  return found;
}

/** OTA-1083 — the authored return gift, if this person has one. */
export function returnGiftFor(npcId: string, npcName?: string): { item: string; line: string } | null {
  const p = giftPrefFor(npcId, npcName);
  if (!p.returnGift) return null;
  return { item: p.returnGift, line: p.returnGiftLine ?? 'They push something across the counter. "No charge. You have been good to me."' };
}
