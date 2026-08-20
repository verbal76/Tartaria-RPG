/**
 * app/engine/contractRefusal.ts — WHY A HAND-IN WAS REFUSED, said once, properly.
 *
 * OTA-1402. From the owner's 2026-08-20 device log:
 *
 *     "I tried to remote hand in about 10 missions all did nothing."
 *
 * ⚠⚠ THE GAME WAS ANSWERING HIM EVERY TIME. Twenty lines of it, in the feed
 * behind the Contracts screen, and one refusal strip that renders ABOVE the
 * scrolling list — so a player scrolled down to the seventh row taps COMPLETE
 * and the explanation appears off-screen. OTA-1014 put that strip "where the
 * player is looking", which was true for a short list and stopped being true the
 * moment the list got long enough to scroll. Nothing was broken; the answer was
 * just somewhere he was not.
 *
 * ⚠⚠ AND HIS READ OF IT WAS THE WRONG ONE, WHICH IS THE REAL COST OF A MESSAGE
 * NOBODY SEES. He concluded the refusals were about faction STANDING. They never
 * were — standing (Known / Trusted / Honored / hostile) has nothing to do with
 * it. It is a COUNTERPARTY rule: a hall takes its own faction's work, and every
 * one of those ten contracts belonged to someone else. His Architects contract
 * in the same burst completed normally. A player who misdiagnoses the rule will
 * grind standing that was never the obstacle.
 *
 * So the wording here does three things the four hand-written versions did not:
 *
 *   1. It names the rule, not just the verdict — "halls only take their own
 *      faction's work" — so the player learns it once instead of hitting it ten
 *      times.
 *   2. It says plainly that standing is not the problem, because that is the
 *      wrong conclusion a reasonable person draws from "won't take it".
 *   3. It uses the faction's REAL NAME. Every previous site printed
 *      `factionId.replace(/_/g, ' ')`, which produced "eternal dynasty" and
 *      "servants of giants" — ids wearing a costume. The game has proper names
 *      for all nine and used none of them here.
 *
 * ⚠ ONE FUNCTION FOR FOUR CALL SITES. The faction-quest, mystery, storyline and
 * hunt paths each had their own phrasing of the same refusal, and they had
 * already drifted: two said "Wrong agent", one said "wrong faction", one said
 * "waves you off". A rule enforced in four places with four explanations is four
 * chances to explain it differently, which is what happened.
 */
import { FACTIONS } from './factions';

/** The faction's own name, never its id. Falls back to a de-underscored id only
 *  if the roster genuinely does not know it — which would itself be a defect,
 *  and reads as one rather than looking deliberate. */
export function factionDisplayName(factionId: string | null | undefined): string {
  if (!factionId) return 'another faction';
  const f = FACTIONS.find((x) => x.id === factionId);
  return f?.name ?? factionId.replace(/_/g, ' ');
}

export interface ContractRefusalInput {
  /** Who is refusing — the vendor, the hall, the board. */
  sourceLabel: string;
  /** The faction that posted the contract. */
  contractFactionId: string | null | undefined;
  /** The contract's title, when the caller knows it. */
  title?: string | null;
}

/**
 * The one-line version, for the feed.
 *
 * ⚠ Kept SHORT on purpose. The feed is a running record, not a tutorial; the
 * full explanation belongs in the popup the player is actually looking at. A
 * five-line refusal repeated per tap is the Chatty-Kathy failure again.
 */
export function wrongCounterpartyLine(input: ContractRefusalInput): string {
  const who = factionDisplayName(input.contractFactionId);
  return `${input.sourceLabel} won't take it — that contract is ${who}'s. Their people, or any outpost's trading post.`;
}

/**
 * The version the player reads in a popup: the rule, then the correction, then
 * the way out.
 *
 * ⚠ THE SECOND SENTENCE IS THE ONE THAT MATTERS and it is the reason this
 * function exists. Without it the player concludes their standing is too low and
 * goes off to fix a thing that was never wrong.
 */
export function wrongCounterpartyBody(input: ContractRefusalInput): string {
  const who = factionDisplayName(input.contractFactionId);
  const named = input.title ? `"${input.title}" ` : 'That contract ';
  // ⚠ OTA-1402 — "whoever answers for where you are standing", not "a hall".
  // The owner hit this on the OPEN TILE outside an outpost and was told a hall
  // had refused him. The rule is about the counterparty, and the counterparty is
  // whoever is in front of you — a vendor, a board, a hall, or the faction whose
  // ground you are on. Naming a building he was not in made a true message read
  // as a broken one.
  return (
    `${named}was posted by ${who}.\n\n`
    + `${input.sourceLabel} can only settle work for their own faction — that is who answers `
    + `for where you are standing right now.\n\n`
    + `This is not about your standing with them. How much they like you does not enter `
    + `into it; it is about whose contract it is.\n\n`
    + `Take it to ${who}'s people, or hand it in at the trading post at any outpost gate — `
    + `a trading post brokers for anyone, for a cut.`
  );
}

/** Title for the popup. States the rule rather than the rejection — and does NOT
 *  say "hall", because the player may be on open ground outside one. */
export const WRONG_COUNTERPARTY_TITLE = 'WRONG FACTION TO HAND THIS TO';
