// OTA-1163 — THE FIRST CONTRACT COMES WITH SOMEONE TO EXPLAIN IT.
//
// Owner: "we have first time touch pop-ups all through the game. so how about the
// first time someone accepts a bounty gets a pop-up and it does it in character…
// this is so-and-so the bounty Slayer, since this is your first bounty I'll show you
// the ropes. I'm going to send you to an area that's thick with enemy but they know
// you're coming so they're going to be looking for you."
//
// ⚠ THIS EXISTS BECAUSE THE MECHANICS WERE ALREADY RIGHT AND THE GAME NEVER SAID SO.
// The owner played a full 23-tile contract believing he had to travel to the named
// outpost, stand in it, and hand something in at the end. None of that is true:
//   • `killCountsForBounty` checks FACTION ONLY — there is no location test at all.
//     The named outpost is where the quarry is DENSE, not where the kill must happen.
//   • There is NO turn-in. The last kill fires announceMissionComplete and pays TC +
//     standing on the spot, wherever the player is standing.
//   • Accepting flips the quarry's patrols to hunting the player — bounty targets skip
//     the usual hunt-chance roll and qualify even at positive standing.
// Every one of those is a thing the player can only learn by accident. This card is
// the fix, and it is DESCRIPTIVE — if any of the three ever stops being true, the
// text here is a lie and must move with it.

import type { FactionBounty } from './factionBounty';
import { giverDifficulty } from './factionBounty';
import { formatWindow } from './travelTime';

/** The broker. Named for the nine halls whose paper he has carried — which is every
 *  faction in the game, and the reason he can speak for a trade none of them owns.
 *  ⚠ He is DELIBERATELY not a faction, not a guild and not joinable. A bounty guild
 *  would be a tenth power in a nine-power world and would need standing, an outpost,
 *  rivals and a tide. He is one man with a sheaf of paper: all of the voice, none of
 *  the systems. */
export const BOUNTY_BROKER = 'Jakar Nine-Halls';

/** ⚠ OTA-1477 — `formatWindow` MOVED to `travelTime.ts`, beside the tile→hour
 *  conversion whose output it formats, because the compass needed the same
 *  vocabulary and a bounty module is the wrong owner for the game's clock words.
 *  Re-exported here so every existing caller and pin keeps working. This is the
 *  SAME function re-exported, not a second copy — do not re-inline it. */
export { formatWindow };

/** Why THIS contract asks for THIS many. The count is not flavor — it is
 *  `3 + ceil(tide/2) + giverDifficulty(standing)`, so a hall that trusts you asks for
 *  the fewest and a hall that does not asks you to prove it. Quoting the reason back
 *  is the whole OTA-1158/1183/1184 theme: the game knows, so say it. */
function whyThisMany(giverStanding: number | undefined, giverName: string): string {
  switch (giverDifficulty(giverStanding)) {
    case 0:  return `The ${giverName} count you one of theirs, so they asked for the fewest they could.`;
    case 1:  return `The ${giverName} barely know your face. That costs you a body or two on top.`;
    case 2:  return `The ${giverName} don't much like you. The number is the price of the doubt.`;
    default: return `The ${giverName} would rather not deal with you at all. That number is you proving it.`;
  }
}

export interface PrimerCard {
  heading: string;
  title: string;
  flavor: string[];
  rewards: string[];
  takeLabel: string;
}

/** The one-time card raised on a player's FIRST accepted contract.
 *  Pure — takes the contract that was just stamped and describes it truthfully. */
export function bountyPrimerCard(
  bounty: FactionBounty,
  deadlineHours: number,
  giverStanding: number | undefined,
): PrimerCard {
  const window = formatWindow(deadlineHours);
  return {
    heading: 'THE ROPES',
    title: BOUNTY_BROKER,
    takeLabel: 'WHAT THE PAPER DOESN’T SAY',
    flavor: [
      `A man peels himself off a wall you would have sworn was empty — sun-scoured, thin as a strap, a sheaf of paper on a thong at his hip thick as a brick and every sheet stamped with a different hall's seal. "Jakar," he says. "Nine-Halls, if you're being polite. I've carried paper for every one of them and outlived most of the hands that signed it." He nods at the contract you're still holding. "First one. Sit down. I'll tell you the parts nobody writes on the page."`,

      `"That paper names a place. It is not an order — it is a tip. That's where they're THICK, is all. Nobody counts where you did it. Put your ${bounty.count} down in a ditch four days the other side of ${bounty.targetLocationName} and the tally reads exactly the same. Go there because the hunting's good, not because the paper told you to."`,

      `"Second thing, and it's the one that buries people. They know. The hall you signed WITH talks, and the hall you signed AGAINST listens. From this minute the ${bounty.targetName} aren't wandering — they're looking for you, and they don't care how friendly you were with them last week. You don't have to go find them." He almost smiles. "Stand still long enough and they'll save you the walk."`,

      `"Last thing. There's no counter to carry it back to. No clerk, no receipt, no hall to report to. The ${bounty.count === 1 ? 'one' : 'last one'} drops and you're paid where you stand — coin and standing both, before the body's done cooling." He taps the page. "${whyThisMany(giverStanding, bounty.giverName)} And the paper goes cold in ${window}. It does not care what you were doing."`,
    ],
    rewards: [
      `${bounty.count} × ${bounty.targetName} — and the kills count ANYWHERE, not just at ${bounty.targetLocationName}.`,
      `No turn-in. The last kill pays ${bounty.rewardTc} TC and ${bounty.rewardRep} standing with the ${bounty.giverName}, on the spot.`,
      `${window} before it lapses — in-game time, which only moves when you do.`,
      `The ${bounty.targetName} are hunting you now. That starts the moment you accept.`,
    ],
  };
}
