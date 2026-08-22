// ⚠⚠ OTA-1431 — THE NINE FACTION EMBLEMS, ONE TABLE.
//
// Owner: *"as you choose your faction, the emblem should show for a few seconds
// as a popup."*
//
// Same shape as buildingMaps.ts and MapScreen's OUTPOST_MAPS: a table keyed by
// the id the data already uses, so a consumer branches on "is there art for this
// faction" and never on a hard-coded name. Adding a tenth faction is one entry.
//
// ⚠ THE FILENAMES ARE THE FACTION IDS, and that is load-bearing rather than
// tidy. `assets/crests/mud_monarchs.png` answers `"id": "mud_monarchs"` in
// app/data/factions/factions.json, so a mismatch is visible as a mismatch here
// instead of failing silently at runtime. A test walks getFactions() and asserts
// every id has art and every piece of art has an id.
//
// ⚠ WHAT THESE PICTURES ACTUALLY ARE is recorded in assets/crests/README.md,
// including which six were renamed and why. They did not arrive matching the
// devices the art brief described; each was read for what it shows and matched
// to the faction whose lore fits it. Read that file before regenerating any of
// them, or the replacement will rejoin the set as the odd one out.
//
// ⚠ THEY ARE NOT SQUARE AND HAVE NO MARGIN — sizes run 1145x1374 to 1254x1254
// and the artwork touches the frame edge on all nine. That is deliberate and
// signed off: these are shown large (a faction-pick flash, a corner overlay),
// never shrunk to a chip, so cropping them to a square with a safe margin would
// shrink real artwork for a use the game does not have. Every consumer must use
// `resizeMode="contain"` and let the aspect fall out of the file, NOT assume 1:1.

const CRESTS: Readonly<Record<string, number>> = {
  mud_monarchs: require('../../assets/crests/mud_monarchs.png'),
  forgotten_order: require('../../assets/crests/forgotten_order.png'),
  reclaimers_guild: require('../../assets/crests/reclaimers_guild.png'),
  true_tartarians: require('../../assets/crests/true_tartarians.png'),
  eternal_dynasty: require('../../assets/crests/eternal_dynasty.png'),
  conspiracy_architects: require('../../assets/crests/conspiracy_architects.png'),
  servants_of_giants: require('../../assets/crests/servants_of_giants.png'),
  stone_builders: require('../../assets/crests/stone_builders.png'),
  tartarian_revivalists: require('../../assets/crests/tartarian_revivalists.png'),
};

/** The emblem for a faction, or undefined when it has none. Callers branch on
 *  this rather than on an id, so a faction without art degrades to no emblem
 *  instead of to a broken image. */
export function factionCrest(factionId: string | null | undefined): number | undefined {
  return factionId ? CRESTS[factionId] : undefined;
}

/** Every faction id that has an emblem. Exported for the parity test. */
export function crestFactionIds(): string[] {
  return Object.keys(CRESTS);
}
