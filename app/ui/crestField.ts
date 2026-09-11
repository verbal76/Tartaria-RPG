/* ⚠⚠⚠ WHERE A FACTION EMBLEM LANDS ON A CARD — FROM MEASURED GEOMETRY ONLY.
 *
 * This module exists because the thing it replaces was calibrated against card
 * dimensions that were never measured. OTA-1753 placed the roster watermark with
 * percentage insets whose conversion constant was
 *     K = 100 x (cardWidth / cardHeight) x boxWidthFraction
 * evaluated on "a 340dp card, ~58dp collapsed, ~200dp expanded" — three numbers
 * typed from memory. The real card on a 411dp phone is 375dp wide and about
 * 136dp tall when expanded, so K was out by a quarter; and when OTA-1754 changed
 * the box width the constant derived from it was left behind, still carrying a
 * comment describing geometry that had been deleted. The mock-ups that were
 * supposed to catch this were drawn at 595x101.5 and 595x350 — the SAME assumed
 * ratios — so they could only ever agree with the code.
 *
 * ⚠⚠ SO THE RULE THIS FILE ENFORCES: nothing here knows a card's size. The
 * caller measures it (onLayout) and passes it in. There is no device constant,
 * no reference width, and nothing to recalibrate when a layout changes — a
 * different phone, a tablet, a font-scale change or an edited stylesheet all
 * just arrive as a different `CardBox`.
 *
 * ⚠⚠ AND IT KEEPS FOUR THINGS SEPARATE THAT ARE EASY TO CONFLATE:
 *   1. SOURCE CANVAS BOUNDS   — `art.srcW/srcH`, the PNG's own pixels.
 *   2. RENDERED IMAGE BOUNDS  — `width/height` out of `placeCrestField`, the
 *                               emblem's drawn size after scaling.
 *   3. ARTWORK FOCUS POINT    — `art.focusX/focusY`, a fraction of (1), measured
 *                               from the asset and true wherever it is drawn.
 *   4. DESIRED FOCUS POINT    — `comp.focusAtX/focusAtY`, a fraction of the
 *                               MEASURED CARD, which is composition intent.
 * The job is to put (3) on (4). Everything else follows. The old code moved the
 * image ELEMENT and hoped the artwork came with it; these are not the same thing
 * when the artwork is not centred in its own file — and none of these nine are.
 */

import type { CrestArt } from '../engine/factionCrests';
import { crestAspect } from '../engine/factionCrests';

/** A card's REAL box in dp, straight from onLayout. Never assumed, never a
 *  reference device, never a percentage of anything. */
export interface CardBox {
  width: number;
  height: number;
}

/** What a surface wants to look like, in fractions of its own measured card.
 *  This is the visual treatment — the part a person signs off — and it is
 *  deliberately free of pixels so it means the same thing on any screen. */
export interface FieldComposition {
  /** Rendered emblem width ÷ card width. Sets how much of the emblem you see:
   *  a WIDER box makes a TALLER emblem and therefore shows LESS of it. */
  coverage: number;
  /** Where the artwork's focus should sit, 0..1 across and down the card. */
  focusAtX: number;
  focusAtY: number;
}

/* ⚠ A DIVISION GUARD, NOT A TUNING KNOB. `focusY` is a measured centroid of
 * real ink, so it can never legitimately reach 0 or 1 — the nine ship between
 * 0.397 and 0.494. This only stops a corrupt or hand-edited table turning into
 * a divide-by-zero and an Infinity-sized image. Its value is unobservable for
 * any input the game can actually produce, which is what separates it from the
 * "340dp card" that caused all of this. */
const INTERIOR = 1e-3;
const clampInterior = (v: number) => Math.min(1 - INTERIOR, Math.max(INTERIOR, v));

/** Absolute pixel placement for the image, relative to the clip it sits in. */
export interface FieldPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Put this faction's artwork focus on this card's desired focus point.
 *
 * Returns `null` — never a fallback position — when the card has not been
 * measured yet or the faction has no measured art. A guess here is exactly the
 * class of mistake this module was written to end.
 */
export function placeCrestField(
  card: CardBox,
  art: CrestArt,
  comp: FieldComposition,
): FieldPlacement | null {
  if (!(card.width > 0) || !(card.height > 0)) return null;
  if (!(art.srcW > 0) || !(art.srcH > 0)) return null;

  const aspect = crestAspect(art);

  // (2) RENDERED IMAGE BOUNDS. Width is the composition's business; height
  // follows from the SOURCE CANVAS BOUNDS, so the emblem is never distorted and
  // the aspect can never drift from the file it describes.
  const asked = comp.coverage * card.width * aspect;

  /* ⚠⚠ COVERAGE IS A MINIMUM, BECAUSE THE TREATMENT IS "CROPPED BY THE CARD'S
   * OWN EDGES". A card TALLER than the emblem breaks that: the watermark stops
   * bleeding and starts floating, and its top edge becomes a visible seam
   * across the plate. This is not hypothetical — it was photographed. On the
   * tallest card the roster can build (a dead character with a dog, a golem and
   * a crash warning) at the narrowest supported width, the card measured
   * 290x200 and the requested 62% left a 15dp bare strip above the emblem.
   *
   * Bleeding both edges means `top <= 0` AND `top + height >= card.height`.
   * Substituting `top = focusAtY*cardH − focusY*height` and solving each gives
   * the two ratios below, and the height that satisfies both is their max.
   * ⚠ THERE IS NO TUNING PARAMETER HERE. This is the SMALLEST height for which
   * the property holds — derived, not chosen, and inert on any card short
   * enough for the requested coverage to bleed on its own (every live
   * character's card, at every width). */
  const fy = clampInterior(art.focusY);
  const toBleed = card.height * Math.max(comp.focusAtY / fy, (1 - comp.focusAtY) / (1 - fy));

  const height = Math.max(asked, toBleed);
  const width = height / aspect;

  // (3) -> (4). The artwork's focus, expressed in rendered pixels, is subtracted
  // from the point on the card where it is wanted. That IS the placement.
  return {
    width,
    height,
    left: comp.focusAtX * card.width - art.focusX * width,
    top: comp.focusAtY * card.height - art.focusY * height,
  };
}

/** Where the artwork's focus actually landed, as a fraction of the card.
 *  Exists so a test can assert the property the placement claims rather than
 *  re-deriving the arithmetic it is meant to be checking. */
export function landedFocus(
  card: CardBox,
  art: CrestArt,
  place: FieldPlacement,
): { x: number; y: number } {
  return {
    x: (place.left + art.focusX * place.width) / card.width,
    y: (place.top + art.focusY * place.height) / card.height,
  };
}

/** The fraction of the emblem's own height that falls inside the card — the
 *  "how much of it can you see" number the owner's one-third floor is about. */
export function visibleFraction(card: CardBox, place: FieldPlacement): number {
  const top = Math.max(0, place.top);
  const bottom = Math.min(card.height, place.top + place.height);
  return place.height > 0 ? Math.max(0, bottom - top) / place.height : 0;
}

/* ⚠⚠⚠ CONTAIN, WHICH IS NOT WHAT `placeCrestField` DOES — AND THE DIFFERENCE IS
 * THE WHOLE REASON THIS EXISTS RATHER THAN A THIRD `FieldComposition`.
 *
 * The roster treatment is "cropped by the card's own edges": `placeCrestField`
 * puts the artwork's measured focus on a composition point and lets the card
 * clip whatever falls outside, which is why it can reason about a `coverage`
 * MINIMUM and a bleed. The HUD watermark is the opposite instruction — *"CONTAIN
 * the full sigil within the text window. Do not crop it merely to make it
 * larger."* A focus-and-coverage placement cannot express that: the two rules
 * disagree about what to do when the emblem does not fit, and quietly reusing
 * the wrong one would crop the sigil on exactly the panels where it matters.
 *
 * ⚠ SO: SAME MEASURED DATA, DIFFERENT COMPOSITION. It reads `crestAspect` off
 * the same `CrestArt` table — there is no second faction→asset mapping here and
 * there must not be — and it ignores `focusX/focusY` on purpose. Focus is for
 * deciding what survives a crop; nothing is cropped here, so the emblem is
 * centred on the panel's geometric middle and the artwork's own off-centre
 * weight is simply where it is.
 *
 * ⚠⚠ THE FIT IS BY THE TIGHTER DIMENSION, which is the owner's rule written as
 * arithmetic: scale until ONE dimension approaches the interior boundary,
 * whichever is reached first, preserving aspect. `inset` is the breathing room
 * that keeps it off the frame.
 *
 * Returns `null` — never a guess — when the panel is unmeasured or the faction
 * has no art. A faction without a sigil renders no watermark and keeps its
 * panel, which is the required safe degradation. */
export function containCrestField(
  panel: CardBox,
  art: CrestArt,
  inset = 0.08,
): FieldPlacement | null {
  if (!(panel.width > 0) || !(panel.height > 0)) return null;
  if (!(art.srcW > 0) || !(art.srcH > 0)) return null;
  if (!(inset >= 0) || inset >= 0.5) return null;

  const aspect = crestAspect(art);            // height ÷ width, from the file
  const availW = panel.width * (1 - 2 * inset);
  const availH = panel.height * (1 - 2 * inset);

  // The tighter dimension wins. Width first, then clamp if that made it too
  // tall — which is the same thing as `min`, written so the aspect is applied
  // exactly once in each branch.
  const width = Math.min(availW, availH / aspect);
  const height = width * aspect;

  return {
    width,
    height,
    left: (panel.width - width) / 2,
    top: (panel.height - height) / 2,
  };
}
