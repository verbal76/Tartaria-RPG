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

/* ⚠⚠⚠ WHERE EACH EMBLEM ACTUALLY IS INSIDE ITS OWN FRAME.
 *
 * The owner, watching the roster watermark land differently on every character:
 * *"we might need a custom position for each emblem since they are all not
 * symmetrical."* He was right, and this is the measurement that proves it.
 *
 * ⚠⚠ THE NUMBERS ARE MEASURED, NOT CHOSEN. Each crest was drawn to a 128x128
 * canvas and reduced to the LUMINANCE-WEIGHTED CENTROID of its artwork, with the
 * near-black ground discounted so the figure follows the device rather than the
 * frame around it. `scripts/measure-crest-focus.html` is the harness — committed
 * precisely so this table can be redone; re-run it after replacing any art, and
 * note that `aspect` is checked against the real PNG headers by ota1753, so a
 * stale table fails CI rather than drifting silently.
 *
 * ⚠⚠⚠ AND THE RESULT IS SYSTEMATIC, WHICH IS THE PART WORTH KNOWING: every one
 * of the nine sits ABOVE the middle of its frame — focusY runs 0.339 to 0.466,
 * mean 0.40, and not one is at 0.5. So a window on the vertical CENTRE of these
 * files shows the LOWER part of every emblem: the ground and the plinth, never
 * the device. That is not a per-faction quirk to be tuned away, it is how this
 * set was drawn, and it explains why the roster fragments read as rubble.
 *
 * ⚠ THIS FILE OWNS ART FACTS, NOT LAYOUT. `focusY` and `aspect` are properties
 * of the PNG and are true wherever it is drawn; how far a given surface must
 * nudge its window to put that focus on screen depends on that surface's own box
 * and belongs to the screen (see TitleScreen's FIELD_NUDGE). Keeping the two
 * apart is what stops a second consumer having to re-measure the artwork. */
export interface CrestArt {
  /** Vertical centroid of the artwork, 0 (top) to 1 (bottom). */
  focusY: number;
  /** The file's own height / width. None of the nine are square. */
  aspect: number;
}

const CREST_ART: Readonly<Record<string, CrestArt>> = {
  conspiracy_architects: { focusY: 0.398, aspect: 1.05 },
  eternal_dynasty: { focusY: 0.425, aspect: 1.175 },
  forgotten_order: { focusY: 0.444, aspect: 1.034 },
  mud_monarchs: { focusY: 0.399, aspect: 1.0 },
  reclaimers_guild: { focusY: 0.369, aspect: 1.033 },
  servants_of_giants: { focusY: 0.409, aspect: 1.011 },
  stone_builders: { focusY: 0.466, aspect: 1.2 },
  tartarian_revivalists: { focusY: 0.339, aspect: 1.2 },
  true_tartarians: { focusY: 0.355, aspect: 1.092 },
};

/** The measured art facts for a faction, or undefined when it has none.
 *  ⚠ A caller that gets `undefined` must fall back to treating the emblem as
 *  centred — never to a guess, and never to another faction's numbers. */
export function crestArt(factionId: string | null | undefined): CrestArt | undefined {
  return factionId ? CREST_ART[factionId] : undefined;
}
