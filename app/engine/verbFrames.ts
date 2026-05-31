// verbFrames.ts — subcategorization frames for the rule-based parser
//
// Born from OTA 204's "beef up the parser" pass. References:
//   - Jurafsky & Martin, Speech and Language Processing Ch.12 §12.3.5
//     ("The Verb Phrase and Subcategorization"), Fig. 12.6
//     defines the canonical frame taxonomy (∅, NP, NP NP, PPfrom PPto,
//     NP PPwith, VPto, VPbrst, S, etc.)
//   - Sleator & Temperley, Parsing English with a Link Grammar (1991),
//     §7 ("Post-processing"). The frame validation in parseValidator.ts
//     is structurally analogous to their domain rules.
//   - Koopman / Sportiche / Stabler, An Introduction to Syntactic
//     Analysis and Theory (θ-roles chapter) — informs the ArgRole
//     vocabulary in types.ts.
//
// Design (rule-based, no model):
//   1. Each verb intent that takes structured arguments has a frame
//      entry below.
//   2. Frame declares which roles it ACCEPTS (parser may extract
//      them) and which it REQUIRES (parse rejected on missing).
//   3. `withRole` resolves the "with" preposition: most verbs treat
//      "with" as instrument ("attack with the blade"), a few as
//      companion ("travel with the team", collapsed into the direct
//      slot in V1 since we don't have a separate companion role).
//   4. Verbs not in the table fall through to the DEFAULT_FRAME,
//      which accepts {direct, manner} only — keeps unframed verbs
//      working without per-verb authoring.
//
// Adding a new frame: add an entry below. No engine changes needed.

import type { Intent, ArgRole } from './types';

/** Canonical frame types from J&M Fig. 12.6 (extended for our verb
 *  set). Each verb's `type` field documents which frame pattern it
 *  follows; the actual extraction is driven by `acceptRoles` /
 *  `requireRoles` so multiple frame types can share the same
 *  validation logic. Kept as a labeled enum for grep-ability. */
export type FrameType =
  | 'INTRANS'        // ∅ — sleep, rest, look
  | 'TRANS'          // NP — attack, take, search
  | 'DITRANS'        // NP NP — give X Y (rare in commands)
  | 'TRANS_PP_WITH'  // NP PPwith — attack X with Y, repair X with Y
  | 'TRANS_PP_TO'    // NP PPto — give X to Y, throw X to Y
  | 'TRANS_PP_AT'    // NP PPat — look at, point at
  | 'PP_LOC'         // PPto/into — go, travel, head
  | 'PP_FROM'        // PPfrom — escape from, flee from
  | 'CONSUME'        // NP — eat / drink / use (consumable)
  | 'INSPECT';       // NP — look, examine, inspect (similar to TRANS but no instrument)

export interface VerbFrame {
  type: FrameType;
  /** Roles the parser may legitimately extract for this verb.
   *  Segments tagged with any other role get folded back into the
   *  direct-object slot for back-compat. */
  acceptRoles: ArgRole[];
  /** Roles the verb requires. Missing or junk-filled required roles
   *  trigger a parseValidator rejection. */
  requireRoles?: ArgRole[];
  /** Per-verb override for the "with" preposition. Defaults to
   *  'instrument' when absent. 'companion' collapses into the
   *  direct slot in V1. */
  withRole?: 'instrument' | 'companion';
}

/** Fallback when a verb has no explicit frame. Permissive — accepts
 *  direct + manner only; preposition-introduced segments collapse
 *  into direct.text rather than getting their own role tag. */
export const DEFAULT_FRAME: VerbFrame = {
  type: 'TRANS',
  acceptRoles: ['direct', 'manner'],
};

export const VERB_FRAMES: Partial<Record<Intent, VerbFrame>> = {
  // J&M frame: NP PPwith (attack the X with the Y).
  // Direct is NOT required because the combat handler defaults to
  // the active enemy when omitted ("attack with the rusted blade"
  // is a legitimate everyday combat command — the engine knows who
  // you're attacking from scene state). The garbage-parse guard
  // catches the playtest bug case via the meta-talk regex, not via
  // this requireRoles check.
  attack: {
    type: 'TRANS_PP_WITH',
    acceptRoles: ['direct', 'instrument', 'manner'],
    withRole: 'instrument',
  },
  // J&M frame: NP PPto (throw X at Y / into Y).
  throw: {
    type: 'TRANS_PP_TO',
    acceptRoles: ['direct', 'destination', 'instrument', 'manner'],
    requireRoles: ['direct'],
    withRole: 'instrument',
  },
  // J&M ditransitive but command-form uses PPto: "give locket to
  // Yulka". DITRANS without prep ("give Yulka the locket") falls
  // through; the segmenter folds the second NP into direct.
  gift: {
    type: 'TRANS_PP_TO',
    acceptRoles: ['direct', 'recipient', 'manner'],
    requireRoles: ['direct'],
  },
  // J&M frame: NP — search the X. No "with" semantics — we use a
  // separate scanner-equipped check for that, not an instrument arg.
  investigate: {
    type: 'INSPECT',
    acceptRoles: ['direct', 'manner', 'source'],
  },
  // J&M TRANS — take the X (from the Y).
  pickup: {
    type: 'TRANS',
    acceptRoles: ['direct', 'source', 'manner'],
    requireRoles: ['direct'],
  },
  // J&M TRANS — equip the X. Required-direct guard catches the
  // playtest bug ("it is supposed to remove a noun item from the
  // popup") that resolved to Aetheric Torch on junk input.
  equip: {
    type: 'TRANS',
    acceptRoles: ['direct'],
    requireRoles: ['direct'],
  },
  // J&M frame: NP — use the X (consumable / relic).
  use_relic: {
    type: 'CONSUME',
    acceptRoles: ['direct', 'instrument', 'destination'],
    requireRoles: ['direct'],
    withRole: 'instrument',
  },
  cast: {
    type: 'CONSUME',
    acceptRoles: ['direct', 'instrument', 'manner'],
    withRole: 'instrument',
  },
  // J&M PP_LOC — go / travel into / to. Destination is the primary
  // arg. "Travel with the team" → withRole: 'companion' which
  // collapses into direct in V1 (we don't have a separate companion).
  travel: {
    type: 'PP_LOC',
    acceptRoles: ['direct', 'destination', 'manner'],
    withRole: 'companion',
  },
  advance: {
    type: 'PP_LOC',
    acceptRoles: ['direct', 'destination'],
  },
  retreat: {
    type: 'PP_LOC',
    acceptRoles: ['direct', 'destination'],
  },
  // J&M PP_FROM — escape from.
  escape: {
    type: 'PP_FROM',
    acceptRoles: ['source', 'manner'],
  },
  // INTRANS — rest, sleep, wait. Manner allowed ("rest carefully"
  // is nonsense in-fiction but the parser doesn't gate on that).
  rest: {
    type: 'INTRANS',
    acceptRoles: ['manner'],
  },
  // TRANS — dig. Same as investigate but with optional instrument
  // ("dig the silt with the trowel") and source ("dig under the
  // crate").
  dig: {
    type: 'TRANS_PP_WITH',
    acceptRoles: ['direct', 'instrument', 'source', 'manner'],
    withRole: 'instrument',
  },
  // TRANS — repair X (with Y). Instrument optional.
  repair: {
    type: 'TRANS_PP_WITH',
    acceptRoles: ['direct', 'instrument', 'manner'],
    requireRoles: ['direct'],
    withRole: 'instrument',
  },
  // TRANS — craft X (out of Y). source ≈ "out of" / "from".
  craft: {
    type: 'TRANS',
    acceptRoles: ['direct', 'source', 'instrument', 'manner'],
    requireRoles: ['direct'],
    withRole: 'instrument',
  },
};

export function frameFor(intent: Intent): VerbFrame {
  return VERB_FRAMES[intent] ?? DEFAULT_FRAME;
}
