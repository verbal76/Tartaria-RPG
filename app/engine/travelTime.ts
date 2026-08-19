// OTA-1185 — WHAT ONE TILE COSTS, IN ONE PLACE.
//
// Owner: "let's make .25 the standard. let's make a mathematical variable 2.5 and
// let's make the time 2.5 times the steps."
//
// Before this file, three separate places disagreed about what crossing one tile
// was worth, and a fourth described it in a unit nobody was charging:
//   • the → TARGET button (continueTravel)  charged 0.25 h
//   • typing "go north"                     charged 1 h      — 4× more, same move
//   • `stepDirection` itself                charged nothing  — all cost lived in callers
//   • the autoroute banner                  called a tile "1 day"
// A number four things believe differently is a number nobody owns.

/** ⚠ THE CHARGE. In-game hours the clock advances per tile crossed, however the
 *  move was asked for — tapped, typed, or continued. 0.25 was chosen because it is
 *  what the → TARGET button already charged, and that is the path players actually
 *  use, so standardising here changed nobody's world speed.
 *
 *  ⚠ This is the WORLD CLOCK, not a travel stat. `hoursElapsed` feeds the day/night
 *  cycle, the pressure tide (vendor prices AND difficulty), world events, faction
 *  tides, NPC memory decay, story drip and race cooldowns. Raising it does not make
 *  walking slower — it makes the entire world run faster. Do not retune it casually. */
export const TILE_HOURS = 0.25;

/** ⚠ THE TRUE COST, which is a different question and a much larger number.
 *
 *  A tile costs 0.25 h of walking AND 2 stamina (`STAMINA_COSTS.travel`). That
 *  stamina has to be paid back, and the only thing that pays it back is REST — the
 *  parser-routed rest returns `min(room, 8)` over a fixed 8 hours, i.e. exactly
 *  ONE HOUR PER STAMINA POINT. So the honest all-in cost of crossing one tile is
 *  0.25 + 2 = ~2.25 h, nine times what the clock visibly charges for it.
 *
 *  Rounded UP to 2.5, and the rounding is deliberate slack: it absorbs the fights the
 *  route walks you into, the tiles you cross in the wrong direction, and the fact
 *  that a bounty's quarry comes hunting YOU on a schedule you do not control.
 *
 *  ⚠ THE RATE DOES NOT IMPROVE WITH A BIGGER TANK. Owner asked directly. Rest pays a
 *  flat 8 points per 8 hours regardless of `staminaMax`, so 1 h/point holds at every
 *  cap the game can roll (the floor is 12 + STR/2, always well above 8). A larger tank
 *  buys a LONGER UNBROKEN RUN between stops — fewer rests, fewer ambush rolls — not a
 *  cheaper tile. The only genuine discounts are identity, not capacity: the Pathfinder
 *  title pays 1.5 stamina/tile (~1.75 h) and Architectural Sentinels pay half (~1.25 h).
 *  Those characters get a deadline that is generous rather than tight, deliberately.
 *
 *  ⚠ THE DEAD `rest()` STORE METHOD IS NOT THE SOURCE. It rolls d4 stamina over d4+3
 *  hours (~2.2 h/point) while PRINTING "d6+2", and it has zero callers — every typed or
 *  tapped rest hits the parser path. Do not re-derive this constant from that code.
 *
 *  ⚠ It is a CONVERSION FACTOR, not a simulation. Nothing charges 2.5 h for anything.
 *  It exists so a distance in tiles can be turned into an honest allowance in hours —
 *  which is what a deadline is. If the stamina economy or the rest curve moves, this
 *  number is wrong and the derivation above is how to re-figure it. */
export const HOURS_PER_TILE_TRUE = 2.5;

/** Turn a distance in tiles into the in-game hours it really takes to cover.
 *  The one place tiles become time. */
export function travelHoursFor(distanceTiles: number): number {
  return Math.max(0, distanceTiles) * HOURS_PER_TILE_TRUE;
}
