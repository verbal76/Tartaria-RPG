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
 * ⚠⚠ THE NUMBERS ARE MEASURED FROM THE SOURCE PNGs, AT FULL RESOLUTION.
 * `scripts/measure-crest-art.py` decodes each file (a small exact PNG reader —
 * no browser, no image library, no downsample) and reduces it to the centroid of
 * ALPHA x LUMINANCE. That weighting is not a taste call: the watermark is
 * composited at low opacity over a dark plate, so a pixel's contribution to what
 * the eye actually sees IS its alpha times its brightness. Re-run the harness
 * after replacing any art; `srcW`/`srcH` are checked against the real PNG
 * headers by ota1756, so a stale table fails CI instead of drifting silently.
 *
 * ⚠⚠⚠ THIS TABLE REPLACES A MEASUREMENT THAT WAS SUBTLY WRONG, AND THE REASON
 * MATTERS. The previous one (OTA-1753) weighted by alpha x max(0, luminance −
 * 0.18) on a 128x128 downsample. Discounting dim ink drags the centroid toward
 * the brightest region, so every focusY came out too high — by 0.013 on
 * `forgotten_order`, by 0.061 on `true_tartarians`. That 0.18 was a magic number
 * that silently changed the answer; alpha x luminance has none to tune.
 *
 * ⚠⚠ TWO FINDINGS WORTH MORE THAN THE TABLE ITSELF:
 *   1. focusX is 0.500 on all nine (spread 0.497–0.505). These emblems are
 *      horizontally SYMMETRIC — the asymmetry the owner spotted is purely
 *      vertical. focusX is carried anyway, measured, so a future crest that is
 *      NOT centred falls out of the same arithmetic instead of needing a case.
 *   2. The ink bounding box is dead centre and full-frame on all nine (0.500
 *      across, 0.498–0.500 down): THE ARTWORK TOUCHES EVERY EDGE. So "where the
 *      emblem is" is a question about brightness, never about extent — there is
 *      no empty margin to trim, which is why cropping alone never found the
 *      device.
 * Every focusY still sits above the middle (0.398–0.494, mean 0.435), so a
 * window on the vertical centre of these files still shows ground and plinth
 * rather than device. That finding survived re-measurement; its size changed.
 *
 * ⚠ THIS FILE OWNS ART FACTS, NOT LAYOUT. These are properties of the PNG and
 * are true wherever it is drawn. Turning them into a position needs the target
 * surface's own MEASURED box — that is `ui/crestField` and the screen that calls
 * it. Keeping the two apart is what stops a second consumer re-measuring the
 * artwork, and it is why this table did not have to change when the broken
 * layout arithmetic was replaced. */
export interface CrestArt {
  /** SOURCE CANVAS BOUNDS — the PNG's own pixel dimensions, exact. */
  srcW: number;
  srcH: number;
  /** Where the artwork's visible weight sits INSIDE that canvas, 0..1. */
  focusX: number;
  focusY: number;
}

const CREST_ART: Readonly<Record<string, CrestArt>> = {
  conspiracy_architects: { srcW: 1224, srcH: 1285, focusX: 0.503, focusY: 0.422 },
  eternal_dynasty: { srcW: 1157, srcH: 1360, focusX: 0.498, focusY: 0.450 },
  forgotten_order: { srcW: 1233, srcH: 1275, focusX: 0.502, focusY: 0.458 },
  mud_monarchs: { srcW: 1254, srcH: 1254, focusX: 0.501, focusY: 0.446 },
  reclaimers_guild: { srcW: 1234, srcH: 1275, focusX: 0.497, focusY: 0.400 },
  servants_of_giants: { srcW: 1247, srcH: 1261, focusX: 0.502, focusY: 0.433 },
  stone_builders: { srcW: 1145, srcH: 1374, focusX: 0.505, focusY: 0.494 },
  tartarian_revivalists: { srcW: 1145, srcH: 1374, focusX: 0.499, focusY: 0.398 },
  true_tartarians: { srcW: 1200, srcH: 1310, focusX: 0.500, focusY: 0.416 },
};

/** The measured art facts for a faction, or undefined when it has none.
 *  ⚠ A caller that gets `undefined` must render NOTHING — never a guess, never
 *  a centred fallback, and never another faction's numbers. */
export function crestArt(factionId: string | null | undefined): CrestArt | undefined {
  return factionId ? CREST_ART[factionId] : undefined;
}

/** The file's own height ÷ width. Derived, so it can never disagree with the
 *  recorded canvas bounds the way a separately-stored `aspect` could — that
 *  particular drift is what OTA-1754 shipped. */
export function crestAspect(art: CrestArt): number {
  return art.srcH / art.srcW;
}
