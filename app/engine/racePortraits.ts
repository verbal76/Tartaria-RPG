// ⚠⚠ OTA-1433 — THE SEVEN RACE PORTRAITS, ONE TABLE.
//
// Owner, on the faction emblems: *"same thing, show the popup at selection."*
//
// Same shape as factionCrests.ts, buildingMaps.ts and OUTPOST_MAPS — keyed by
// the id the data already uses, so a consumer asks "is there art for this race"
// and never for a named one. The filenames ARE the ids from
// app/data/races/races.json, which is what makes wiring mechanical and a
// mismatch visible instead of silent.
//
// ⚠ EVERY ONE IS A PAIR, ONE MALE AND ONE FEMALE, AND THAT IS DELIBERATE. The
// art brief asked for a single figure and the brief was wrong: this screen picks
// a PEOPLE, not a pre-made character. A pair says "these are Mud Dwellers"; one
// person says "this is the Mud Dweller you will play", which is a promise
// character creation does not keep.
//
// ⚠ THE ASPECTS DO NOT AGREE — 0.667 x2, 0.800 x2, 0.847, 0.866, and aetherborn
// alone at 1.250 LANDSCAPE. Every consumer must therefore use
// `resizeMode="contain"` and let the shape fall out of the file. Anything that
// assumes a fixed aspect crops one of these or squashes it, and the landscape
// one is the case that breaks a naive layout rather than merely loosening it.

const PORTRAITS: Readonly<Record<string, number>> = {
  tartarian_giant: require('../../assets/races/tartarian_giant.png'),
  mud_dweller: require('../../assets/races/mud_dweller.png'),
  reclaimer: require('../../assets/races/reclaimer.png'),
  architectural_sentinel: require('../../assets/races/architectural_sentinel.png'),
  mud_golem: require('../../assets/races/mud_golem.png'),
  unknowing_mass: require('../../assets/races/unknowing_mass.png'),
  aetherborn: require('../../assets/races/aetherborn.png'),
};

/** The portrait for a race, or undefined when it has none. Callers branch on
 *  this rather than on an id, so a race without art degrades to no flash instead
 *  of to a broken image — or, worse, to a step that will not advance. */
export function racePortrait(raceId: string | null | undefined): number | undefined {
  return raceId ? PORTRAITS[raceId] : undefined;
}

/** Every race id that has a portrait. Exported for the parity test. */
export function portraitRaceIds(): string[] {
  return Object.keys(PORTRAITS);
}
