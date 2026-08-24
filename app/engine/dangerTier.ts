// OTA-1478 — THE ARBITER STOPS NAMING LETHAL GROUND AS SAFE GROUND.
//
// ⚠⚠ THE WORST LINE IN THE GAME, AND NOBODY WAS PINNING IT. The danger-vs-tier
// warning (OTA-244) exists to stop a player camping somewhere that will kill
// them. It read, verbatim and unconditionally:
//
//     "Asgardar is lethal country. The things that wake here pull above your
//      weight. 67 HP carries you through the Outskirts (danger 2) or the
//      Mud Seas (danger 2). Start the main quest before you camp here again…"
//
// Three separate false statements in one sentence, and the sentence is
// SPECIFICALLY the one the game speaks when it has decided the player is about
// to get killed:
//
//   1 ⚠⚠ THE MUD SEAS ARE DANGER 4. Not 2. `locations.json` has been carrying
//     `"danger": 4` and a description reading "storms catastrophic, the
//     creatures within mutated" for the whole life of the line. The warning
//     tells a player who is too weak for danger-4 country to go and camp in
//     danger-4 country, and stamps a made-up "(danger 2)" on it so they trust
//     it. This is the many-doors mistake in its purest form: a fact the data
//     owns, typed out again from memory in a string.
//
//   2 ⚠ THE SAFE TIER IS HARD-CODED TO 2 for every player. `playerCap` is
//     computed one line above and can be 1, 2 or 3 — and the sentence quotes 2
//     regardless. At <60 HP (cap 1) it points at ground a tier ABOVE the
//     player; at 100-139 HP (cap 3) it undersells by a full tier and sends a
//     capable character back to the starter zone. The one bracket the sentence
//     is correct for is the middle one.
//
//   3 ⚠ "START THE MAIN QUEST" IS SAID TO PLAYERS MID-QUEST. From the 4.32.11
//     log: spoken to a character carrying TWO Cores. `phaseHint()` has existed
//     since OTA-430 and says exactly what to do next at every phase; the
//     warning simply never asked.
//
// ⚠ AND THE TIER LADDER ITSELF WAS A COPY. gameStore held
// `hpMax < 60 ? 1 : hpMax < 100 ? 2 : hpMax < 140 ? 3 : 5` with a comment
// saying it was the "same brackets as the pickEnemyForLocationGuaranteed cap".
// It is the same brackets RESTATED IN A DIFFERENT UNIT — that function speaks
// Rarity, this one speaks danger — so the two could never be diffed and one
// could move without the other. The ladder now lives here once, and both
// projections are read off it.
//
// ⚠ WHY THE LADDER LIVES IN THIS FILE AND NOT IN encounter.ts: encounter.ts
// imports this, not the other way round. A leaf that nothing in the engine
// reaches back into is the only shape that cannot grow a cycle later.

import type { Location, Rarity } from './types';
import locationsData from '../data/locations/locations.json';

interface TierRung {
  /** Applies when `hpMax` is strictly below this. `Infinity` is the top rung. */
  hpBelow: number;
  /** What the encounter picker is allowed to roll at this rung.
   *  ⚠ Typed as the shared `Rarity`, not a local union — a new tier added to
   *  types.ts must be placed on this ladder or the compiler says so. */
  rarity: Rarity;
  /** The highest `location.danger` this rung can camp in without the warning. */
  dangerCap: number;
}

/** ⚠ ONE LADDER, TWO PROJECTIONS. The rarity column is what the encounter
 *  picker caps rolls with (OTA-243); the danger column is what the Arbiter
 *  warns on and what "safer ground" is selected against. They were separately
 *  maintained in two files and in two vocabularies, which is why nobody
 *  noticed they had to agree.
 *
 *  ⚠ THE TOP RUNG IS 5, NOT 4, DELIBERATELY. `location.danger` maxes at 5, so
 *  a cap of 5 means a 140+ HP character is never warned about anywhere — which
 *  is the intent: at that point the player has earned the right to make their
 *  own mistakes. Lowering it to 4 would start warning veterans about Asgardar. */
export const PLAYER_TIER_LADDER: readonly TierRung[] = [
  { hpBelow: 60, rarity: 'Common', dangerCap: 1 },
  { hpBelow: 100, rarity: 'Uncommon', dangerCap: 2 },
  { hpBelow: 140, rarity: 'Rare', dangerCap: 3 },
  { hpBelow: Infinity, rarity: 'Legendary', dangerCap: 5 },
];

function rungFor(hpMax: number): TierRung {
  const hp = Number.isFinite(hpMax) ? Math.max(0, hpMax) : 0;
  for (const rung of PLAYER_TIER_LADDER) {
    if (hp < rung.hpBelow) return rung;
  }
  // Unreachable while the last rung is Infinity, and a non-empty ladder is
  // asserted in the suite — but a fallback beats a crash in a narration path.
  return PLAYER_TIER_LADDER[PLAYER_TIER_LADDER.length - 1]!;
}

/** The heaviest thing the encounter picker may roll at this player's weight. */
export function playerRarityCap(hpMax: number): Rarity {
  return rungFor(hpMax).rarity;
}

/** The highest `location.danger` this player can camp in un-warned. */
export function playerDangerCap(hpMax: number): number {
  return rungFor(hpMax).dangerCap;
}

export interface SaferGround {
  id: string;
  name: string;
  danger: number;
}

const ALL_LOCATIONS = locationsData as Location[];

/** ⚠ READ FROM THE CATALOGUE, NEVER TYPED OUT. Every place at or below the
 *  player's tier, ordered by how USEFUL the advice is:
 *
 *    1 somewhere the player has already discovered, before somewhere they have
 *      not. ⚠ THIS RANK IS THE POINT. A first pass sorted on danger and name
 *      alone and produced "Builders' Survey Camp or Dynasty Border Post" —
 *      alphabetically first among eleven danger-2 places, and two the player
 *      has very likely never seen. Naming ground somebody cannot find is not
 *      better advice than the wrong ground; it is a different way of being
 *      useless. The old line's one virtue was naming the Outskirts, which every
 *      character knows, and that virtue is kept here on purpose.
 *    2 then hardest-first, because the best survivable ground is the most
 *      useful, not the starter tile.
 *    3 then by name, so two readings of one save give one sentence.
 *
 *  ⚠ `excludeId` is the location being warned ABOUT. Without it a player
 *  standing in a danger-2 tile at cap 2 would be told to go where they are.
 *
 *  ⚠ `discoveredIds` is OPTIONAL and its absence is a real state, not a bug: a
 *  caller that does not know what the player has seen gets catalogue order
 *  rather than a wrong claim about their map. */
export function saferGroundFor(
  dangerCap: number,
  options: { excludeId?: string; limit?: number; discoveredIds?: readonly string[] } = {},
): SaferGround[] {
  const limit = options.limit ?? 2;
  const known = new Set(options.discoveredIds ?? []);
  const out = ALL_LOCATIONS
    .filter((l) => typeof l.danger === 'number' && l.danger <= dangerCap)
    .filter((l) => l.id !== options.excludeId)
    .map((l) => ({ id: l.id, name: l.name, danger: l.danger as number }))
    .sort((a, b) => (Number(known.has(b.id)) - Number(known.has(a.id)))
      || (b.danger - a.danger)
      || a.name.localeCompare(b.name));
  return out.slice(0, Math.max(0, limit));
}

/** "the Parley Ground (danger 2) or Varakush (danger 1)" — with the danger
 *  read off each place rather than asserted about all of them. */
export function saferGroundPhrase(ground: readonly SaferGround[]): string {
  const parts = ground.map((g) => `${g.name} (danger ${g.danger})`);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

const TIER_LABEL: readonly string[] = ['', 'unsafe', 'edgy', 'dangerous', 'lethal', 'lethal'];

/** The label the Arbiter puts on a danger rating. Kept here beside the ladder
 *  it describes; it used to be an inline array literal in gameStore. */
export function dangerLabel(danger: number): string {
  return TIER_LABEL[danger] ?? 'lethal';
}

/** ⚠ THE WHOLE SENTENCE, BUILT FROM READ FACTS. Every number in the output is
 *  either passed in from live state or looked up in `locations.json`; nothing
 *  in here is remembered.
 *
 *  `questHint` is supplied by the caller rather than imported so this leaf
 *  stays free of the main-quest module — but it is NOT optional, because the
 *  advice being wrong for a mid-quest player is one of the three defects this
 *  function exists to close. */
export function dangerWarningLine(opts: {
  locationName: string;
  locationId?: string;
  danger: number;
  hpMax: number;
  questHint: string;
  discoveredIds?: readonly string[];
}): string {
  // ⚠ THE ADVICE IS CAPPED TWICE, AND THE SECOND CAP IS THE ONE THIS OTA IS
  // ABOUT. The player's tier is the obvious bound. But the sentence is a
  // warning about THIS place, so anything at or above THIS place's rating is
  // disqualified regardless of tier — recommending ground as dangerous as the
  // ground you are warning somebody off is the original defect in general form.
  //
  // ⚠ FOUND BY THE SUITE, NOT BY THE FIX. In the shipped game the warning only
  // fires when `playerDangerCap < danger`, so the tier bound already implied
  // this one and the hole was invisible. Called directly at 200 HP against a
  // danger-5 tile — which nothing does today and something will — it happily
  // offered two more danger-5 Capitals as somewhere safer to camp.
  const cap = Math.min(playerDangerCap(opts.hpMax), opts.danger - 1);
  const ground = saferGroundFor(cap, {
    excludeId: opts.locationId,
    discoveredIds: opts.discoveredIds,
  });
  const where = saferGroundPhrase(ground);
  // ⚠ A player whose cap somehow admits nothing gets the honest version rather
  // than a sentence with a hole in it. Not reachable with the shipped
  // catalogue (there is always ground at danger 1), and pinned as such.
  const carry = where
    ? `${opts.hpMax} HP carries you through ${where}.`
    : `${opts.hpMax} HP does not carry you anywhere near this.`;
  return `The Arbiter takes you in. "${opts.locationName} is ${dangerLabel(opts.danger)} country. `
    + `The things that wake here pull above your weight. ${carry} `
    + `${opts.questHint} Or move on until you've got your legs under you."`;
}
