// OTA-1162 — WHAT ONE TILE COSTS, IN ONE PLACE.
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

// ---------------------------------------------------------------------------
// OTA-1477 — AND THE ONE PLACE TIME BECOMES WORDS.
// ---------------------------------------------------------------------------
//
// ⚠ OTA-1167 fixed the autoroute BANNER to quote `travelHoursFor` and stopped
// there. The COMPASS kept its own conversion — `TILES_PER_DAY = 1` in
// worldDirections, plus a hand-inlined second copy of the same arithmetic in
// gameStore — and so the two instruments priced one distance an order of
// magnitude apart. From the 4.32.11 log, 70 seconds apart, about the same two
// tiles:
//     23:49:04  You set course for Voronov. 2 tiles — about 5 hours of travel, all in.
//     23:50:14  [Voronov] north: Drakova (2 days' travel) · east: Ostragar (9 days' travel)
// 48 hours against 5. A player budgeting a contract window off the compass is
// off by 9.6×, and nothing in the game tells them which number to believe.
//
// The named class is copied-constant drift, and the fix is the same one every
// time: delete the copy rather than correct it. `formatWindow` moved here from
// bountyPrimer (it is a time formatter, not a bounty concern; bountyPrimer
// re-exports it so its callers are untouched), and the three surfaces that
// price a distance for the player — banner, compass radar, ASK answer — now
// come out of `travelPhraseFor` and cannot disagree again.
//
// ⚠ THE UNIT IS THE ALL-IN ALLOWANCE, NOT THE WORLD CLOCK. Walking 2 tiles
// advances `hoursElapsed` by 0.5 h (TILE_HOURS). We quote 5 h because that is
// what the journey COSTS once the stamina is rested back, and because it is
// the number `bountyDeadlineFor` builds a deadline out of. A compass that
// quoted the clock would be precisely accurate and useless for the only
// decision a player makes with it.

/** Render an in-game hour count the way the owner asked time to read — "days, hours",
 *  never steps or rests. ("I still want time to be seen as time in the game days,
 *  hours, things like that.") */
export function formatWindow(hours: number): string {
  const h = Math.max(0, Math.round(hours));
  const d = Math.floor(h / 24);
  const r = h % 24;
  const dPart = d > 0 ? `${d} day${d === 1 ? '' : 's'}` : '';
  const hPart = r > 0 ? `${r} hour${r === 1 ? '' : 's'}` : '';
  if (dPart && hPart) return `${dPart}, ${hPart}`;
  return dPart || hPart || '0 hours';
}

/** ⚠ What a compass says when it does not know. A non-finite distance is a data
 *  bug upstream (a missing map position, a subtraction against undefined), and
 *  the two things it must NOT become are "NaN tiles" and a confident zero. The
 *  old `distanceInDays` produced "NaN days' travel" for exactly this input;
 *  `Math.max(0, NaN)` is NaN, so the clamp everybody assumes is there is not. */
export const UNKNOWN_DISTANCE = 'distance unknown';

/** "2 tiles" / "1 tile". The distance the player can count on the map, in the
 *  same word the travel banner already uses for it. */
export function tilesPhrase(distanceTiles: number): string {
  if (!Number.isFinite(distanceTiles)) return UNKNOWN_DISTANCE;
  const t = Math.max(0, Math.round(distanceTiles));
  return `${t} tile${t === 1 ? '' : 's'}`;
}

/** ⚠ THE ONE NUMBER. Both renderings below quote this and nothing else, so a
 *  short line and a long sentence can never come to differ about a distance the
 *  way the compass and the banner did. */
export function travelWindowFor(distanceTiles: number): string {
  return formatWindow(travelHoursFor(Math.max(0, Math.round(distanceTiles))));
}

/** ⚠ THE PHRASE, long form — for a surface that says it ONCE, in a sentence:
 *  "Drakova lies north — 2 tiles, about 5 hours of travel." Standing on the
 *  thing answers "you stand on it"; the compass and the name lookup both need
 *  that case and both used to spell it out themselves.
 *
 *  Reads as a noun phrase deliberately, so callers hang it off a dash instead
 *  of splicing it mid-clause. The old phrase was short enough to splice
 *  ("Drakova lies 2 days' travel north") and this one is not — a call site that
 *  keeps the old grammar now reads as obvious garbage instead of quiet nonsense. */
export function travelPhraseFor(distanceTiles: number): string {
  if (!Number.isFinite(distanceTiles)) return UNKNOWN_DISTANCE;
  const t = Math.max(0, Math.round(distanceTiles));
  if (t <= 0) return 'you stand on it';
  return `${tilesPhrase(t)}, about ${travelWindowFor(t)} of travel`;
}

/** ⚠ THE SAME PHRASE, short form — for the four-cardinal radar and the compass
 *  bearings line, where it repeats FOUR TIMES in one entry and "about … of
 *  travel" ×4 is noise rather than information. "2 tiles, 5 hours".
 *
 *  ⚠ This is ONE DERIVATION WITH TWO RENDERINGS, not a second scale: both go
 *  through `travelWindowFor`. That distinction is the whole subject of this OTA,
 *  so if a third surface wants a third shape, add it HERE — do not spell a
 *  format out at the call site, which is exactly how the day scale survived. */
export function travelPhraseShort(distanceTiles: number): string {
  if (!Number.isFinite(distanceTiles)) return UNKNOWN_DISTANCE;
  const t = Math.max(0, Math.round(distanceTiles));
  if (t <= 0) return 'you stand on it';
  return `${tilesPhrase(t)}, ${travelWindowFor(t)}`;
}
