import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, TouchableOpacity, View, type ViewStyle, type StyleProp } from 'react-native';
import { useReduceMotion } from '../state/accessibility';

/* ⚠⚠⚠ VIS-1 — THE TARTARIA INTERFACE KIT.
 *
 * The first visual-overhaul pass. Its job is not to restyle one screen but to
 * establish the vocabulary every later screen will be told to reuse, so a future
 * pass can say "use the Tartaria surface/button/dossier language" instead of
 * re-inventing an aesthetic.
 *
 * ⚠⚠ WHAT TARTARIA LOOKS LIKE, STATED ONCE SO IT CAN BE HELD TO.
 * Forged, buried, recovered, archival, industrial. Stamped plates and salvaged
 * instrument faces, not parchment and filigree — this is a post-collapse buried
 * world, and the single most likely way to get it wrong is to let it drift into
 * generic medieval fantasy. So: engraved lines, aged metal, recessed wells,
 * survey marks. No gloss, no bevelled gemstones, no scrollwork, no neon.
 *
 * ⚠⚠⚠ THE PALETTE IS NEUTRAL ON PURPOSE — THE PLAYER OWNS THE HUE.
 * `app/ui/displaySettings.ts` lets the player tune the background's hue,
 * saturation and lightness, and AppShell paints it under every screen. A kit
 * that hard-coded a green or a blue would fight that, so every colour here is
 * either a WARM NEUTRAL METAL (greys the eye reads as steel/bronze regardless of
 * what is behind them) or a TRANSLUCENT BLACK/WHITE that simply darkens or lifts
 * whatever the player chose. The one chromatic note is the existing brand gold
 * (#C9A86A), which the game has always used and which sits on any hue. Test on
 * green, blue and purple before adding a colour to this file.
 *
 * ⚠⚠ AND IT COSTS NOTHING TO RENDER. Tartaria has just come off three
 * performance tranches. Everything here is static StyleSheet objects and plain
 * Views: no images beyond the faction art the game already ships, no blur, no
 * gradients, no per-frame JS, no timers. The only animation is a press
 * depression and a selection settle, both `useNativeDriver: true`, both
 * skipped entirely under reduce-motion.
 */

// ─── MATERIAL ────────────────────────────────────────────────────────────────
// A ramp, read as one aged metal lit from above. `rim` is the structural edge,
// `edgeLit` the top catch of light, `edgeDark` the lower shadow, `face` the
// recessed plate the content sits on.
export const T = {
  /** The deepest well — a recess cut into the surface behind it. */
  well: 'rgba(8,6,5,0.72)',
  /** An ordinary plate face: darkens the player's background without hiding it.
   *  ⚠ THE ALPHAS ARE A LEGIBILITY FLOOR, NOT A TASTE CALL. Measured across
   *  seven themes including two LIGHT ones: at 0.78 a plate over a light
   *  parchment background composites to a mid grey, and the quieter inks fall
   *  under 3:1 on it. At 0.86 every text tone the kit uses clears 4.5:1 on
   *  every theme tested, and on a dark theme the difference is one or two
   *  levels — the player's hue still shows through the plate either way. */
  face: 'rgba(14,11,9,0.86)',
  /** A raised/selected plate face — warmer and slightly lighter than `face`. */
  faceLit: 'rgba(30,24,19,0.94)',
  /** A subordinate (utility) face: flatter, cooler, quieter. */
  faceUtility: 'rgba(10,9,8,0.84)',
  /* ⚠⚠⚠ PHONE-FIX — THE STRUCTURE IS ALLOY; THE GOLD IS THE SIGNAL.
   * Owner, on the device: keep steering away from medieval/bronze. Tartaria is
   * RECOVERED ADVANCED TECHNOLOGY that has survived thousands of years —
   * precise ancient alloys, fine technical engraving, damaged coatings,
   * excavation wear. A warm bronze rim on every plate reads as a castle door.
   * So the STRUCTURAL greys went cool and slightly desaturated (machined alloy
   * under a dead coating), and the brand gold is now spent only where something
   * is ALIVE or ASKED FOR: the selected record's spine and rim, the primary
   * action, the resource mark. Restraint is what makes it read as technology. */
  /** Structural rim — the plate's outline. Cool alloy, not bronze. */
  rim: '#3C3E3F',
  /** A lit rim: the plate is selected or primary. Still the brand gold. */
  rimLit: '#7A6640',
  /** A rim that is merely present, not chosen — the alloy caught by the light. */
  rimAlloy: '#5C6062',
  /** The top edge catching light. */
  edgeLit: 'rgba(214,190,140,0.20)',
  /** The lower edge in shadow. */
  edgeDark: 'rgba(0,0,0,0.55)',
  /* ⚠⚠⚠ OTA-1782 — THE CONTROL PAIR, AND IT IS A SECOND PAIR ON PURPOSE.
   *
   * Owner: *"COLOR / FILL / BORDER communicates semantic state or meaning.
   * DEPTH communicates that the object is a pressable control. A button should
   * feel as though it sits slightly proud of the interface plane, regardless of
   * whether its semantic treatment is filled or outlined."*
   *
   * ⚠ WHY `edgeLit` COULD NOT SERVE. That pair is tuned for a PLATE — a dark,
   * warm face that the light falls onto. The control family is not one face: it
   * contains `quickStrike`'s LIGHT SAGE fill and the modals' LIGHT GOLD fill
   * beside near-black outlined chips. A warm tan at 0.20 laid on light sage
   * moves its luminance by about ONE level (185.0 → 186.4): on the loudest
   * control in the game the top edge would simply not exist. It is the same
   * structural problem OTA-1569 hit with the coat glyphs — *"a chip has TWO
   * fills that are nearly opposite… There is no such set"* — and the same
   * answer: stop hunting for one value that reads on both, and use a pair that
   * COMPOSITES against whatever is behind it.
   *
   * ⚠⚠ THE PAIR IS SELF-BALANCING, WHICH IS WHY ONE PAIR COVERS FOUR
   * TREATMENTS. Measured in Rec.709 luminance, resting:
   *     filled sage   #9ec96a   top +13.1   bottom −83.2
   *     filled gold   #c9a86a   top +15.9   bottom −76.8
   *     semantic rim  #1b2417   top +43.5   bottom −14.8
   *     neutral rim   #1a1714   top +45.4   bottom −10.5
   * On a light fill the SHADOW carries the depth; on a dark fill the LIGHT
   * does. Every control ends with a real top-to-bottom value gradient (96, 93,
   * 58, 56) without a gradient, a texture, a gloss or a drop shadow anywhere.
   *
   * ⚠ AND IT NEVER TOUCHES MEANING. These are the TOP and BOTTOM border colours
   * only; left and right keep the semantic `borderColor` the tone set. The ring
   * still says what the control means. */
  /** Depth: the upper edge of a PRESSABLE control, catching light. Warm white
   *  rather than warm tan, so it lifts a light fill as well as a dark one.
   *  ⚠ THIS IS THE *INNER* HIGHLIGHT STRENGTH — `TButton`'s `btnFace`, which
   *  already sits inside a lit rim. A single-ring control must NOT use it; see
   *  the raised pair below. */
  controlLit: 'rgba(255,250,240,0.20)',
  /** Depth: the lower edge of a PRESSABLE control, in its own shadow. The inner
   *  half of the pair above. */
  controlDark: 'rgba(0,0,0,0.45)',
  /* ⚠⚠⚠ THE RAISED PAIR — THE STRUCTURAL STRENGTH, AND THE FIX FOR A REAL
   * DEVICE OBSERVATION. Owner, on a physical Pixel 10 Pro XL: the combat
   * controls *"still look flat."* The Codex census proved the construction was
   * present and correctly wired — `QuickBtn` has applied `tControlDepth` since
   * OTA-1782 — so this was never a missing-wiring bug. It was the wrong WEIGHT.
   *
   * ⚠ WHAT WENT WRONG, PRECISELY. `TButton` — the one control in the game that
   * has always read as physical — carries the language on TWO layers:
   *     btnRim   rgba(140,146,150,0.55) / rgba(0,0,0,0.75)   ← structural
   *     btnFace  controlLit 0.20        / controlDark 0.45   ← inner highlight
   * The rim does the work; the face is a secondary sheen INSIDE it. When
   * OTA-1782 handed the language to flat single-ring controls, it handed them
   * the FACE strength — the subordinate one — as their ONLY cue. A compact chip
   * has no rim to sit inside, so 0.20/0.45 was all the physical separation it
   * ever got, and on a dense dark chip that is a gradient of 56 out of 255.
   *
   * ⚠⚠ WHY EDGES AND NOT A SHADOW. A drop shadow would separate the chip from
   * the ground behind it — which is exactly how `btnOuter` lifts `TButton` —
   * but React Native renders `shadow*` on iOS only; on Android the same effect
   * needs `elevation`, which draws a halo on ALL FOUR SIDES. That is the defect
   * the dossier construction deliberately refused, and Android is the platform
   * the owner is actually looking at. So the edges must carry it alone, which
   * is why this pair is stronger than the rim it is modelled on.
   *
   * ⚠ MEASURED, Rec.709, resting — the same four surfaces the pair above was
   * measured against, and the same arithmetic (top delta / bottom delta):
   *     filled sage   #9ec96a   +32.7 / −138.7   gradient 171  (was  96)
   *     filled gold   #c9a86a   +39.9 / −127.9   gradient 168  (was  93)
   *     semantic rim  #1b2417  +108.6 /  −24.9   gradient 134  (was  58)
   *     neutral rim   #1a1714  +113.5 /  −17.6   gradient 131  (was  56)
   * The self-balancing property OTA-1782 relied on is untouched: on a LIGHT
   * fill the shadow carries the depth, on a DARK fill the light does. Only the
   * amplitude moved, and it moved on both halves so neither starts to dominate.
   *
   * ⚠ AND IT STILL NEVER TOUCHES MEANING. Top and bottom border colours only;
   * left and right keep the semantic hue. Doubling the amplitude of a cue that
   * is orthogonal to meaning leaves it orthogonal to meaning. */
  controlRaisedLit: 'rgba(255,250,240,0.50)',
  /** The lower edge of a raised single-ring control. `0.75` is `btnRim`'s own
   *  shadow alpha — the strength the game already proved reads as structure. */
  controlRaisedDark: 'rgba(0,0,0,0.75)',
  /* ⚠⚠⚠ VISUAL LANGUAGE PHASE 1 — THE SECOND PLANE, AND IT IS A DIFFERENT FIX
   * FROM A LOUDER EDGE. Owner, on the physical build: the compact controls are
   * *"technically raised"* but still read as *"another framed rectangle."* The
   * amplitude was already raised — `controlRaisedLit`/`Dark` above doubled it in
   * OTA-1802 and the press travel has been 1.5dp since VIS-1 — so turning those
   * numbers up again is the one move guaranteed not to work. Past a point more
   * contrast on a 1dp ring is glow, which the brief forbids by name.
   *
   * ⚠⚠ WHAT `TButton` HAS THAT A CHIP DOES NOT, STATED AS GEOMETRY. The one
   * control in this game that reads physical draws THREE planes:
   *     btnOuter   a shadow                     → it sits off the ground
   *     btnRim     a 1dp ring, `T.well` behind  → the SIDEWALL
   *     btnFace    an inset face with its own
   *                top/bottom edges             → the FACE
   * A single-ring chip draws ONE plane and recolours two edges OF THAT SAME
   * RING. There is no face-versus-sidewall relationship available to read, so
   * the eye reports a frame — correctly. The defect was never the weight of the
   * cue; it was that the cue had nothing to be a cue ABOUT.
   *
   * ⚠⚠ SO THE FACE GETS ITS OWN EDGES, DRAWN INSIDE THE RING. Two absolutely
   * positioned hairlines, `pointerEvents="none"`, inside the control's existing
   * box: a light catch just under the lit rim, and a SIDEWALL band just above
   * the dark one. Top to bottom a chip now reads
   *     lit rim · face light · FACE · sidewall · dark rim
   * which is five values where there were three, and the extra two are the ones
   * that say "this object has a side". It costs no layout — absolute children
   * take part in none — no wrapper, no padding, no `elevation` (a four-sided
   * halo, refused by the dossier construction and by the brief), and no shadow
   * (`shadow*` is iOS-only and the owner is looking at Android).
   *
   * ⚠ THE SIDEWALL IS TRANSLUCENT BLACK, WHICH IS WHY ONE VALUE COVERS THE
   * FAMILY. The family holds `quickStrike`'s near-black beside the filled gold
   * and the light sage; an opaque band tuned for one is invisible on another.
   * A black at 0.38 composites DOWN from whatever fill is behind it, so it is a
   * shaded side on every member — the same self-balancing property the edge pair
   * above relies on, applied to a band instead of a line.
   *
   * ⚠ AND IT STILL NEVER TOUCHES MEANING. These draw inside the ring; the ring's
   * left and right keep the semantic `borderColor`, the fill is untouched and the
   * label colour is untouched. Depth remains orthogonal to what a control MEANS. */
  /** The catch of light on a pressable control's own FACE, just inside its lit
   *  rim. Quieter than `controlRaisedLit` on purpose: the rim is the structure,
   *  this is the face turning up to the light beneath it. */
  /* ⚠⚠⚠ VISUAL LANGUAGE PHASE 2 — THE SAME CONSTRUCTION, LOUD ENOUGH TO SEE.
   * Game Director, after physically inspecting Phase 1: *"the visual difference
   * is too subtle."* That is authoritative, and it is NOT a verdict on the
   * grammar — the four families are right. The SIGNAL was too quiet.
   *
   * ⚠⚠ AND THE ANSWER IS STILL NOT ALPHA ALONE. Phase 1 already learned that a
   * louder 1dp line becomes glow, not depth. Phase 2 raises these values AND
   * adds a THIRD BAND — see `controlContact` below — so the bottom of a key
   * stops being one dark edge and becomes a side with a shadow under it. Two
   * planes became three; that is geometry, and it is what the eye reads at
   * arm's length on a phone. */
  controlFaceLit: 'rgba(255,250,240,0.38)',
  /** The SIDEWALL — the side of the key, in its own shadow, above the dark rim.
   *  2dp rather than a hairline, because a side has thickness and an edge does
   *  not; that thickness is the whole difference between a raised object and a
   *  drawn frame. */
  controlSidewall: 'rgba(0,0,0,0.66)',
  /** ⚠ THE CONTACT SHADOW — the dark line where the key meets the surface it
   *  stands on, drawn INSIDE the control's own box because Android `elevation`
   *  would halo all four sides and iOS `shadow*` does not exist on Android at
   *  all. One near-black hairline under the sidewall is what separates "a side"
   *  from "a side resting on something". It is the cheapest real plane in the
   *  language and the one Phase 1 did not have. */
  controlContact: 'rgba(0,0,0,0.88)',
  /* ⚠⚠⚠ THE SAME CONSTRUCTION AT CHASSIS WEIGHT — AND THE GAP BETWEEN THE TWO IS
   * THE POINT, NOT A SHADE. Owner: a large tappable card *"is NOT the same thing
   * as a command button… less key-like protrusion than a discrete command."* A
   * key is a thing you strike; a card is a thing you open. If both wore the same
   * plane there would be no hierarchy left to read on a screen that contains
   * both — which Exploration does, side by side, in every frame.
   *
   * ⚠ SO IT IS THE SAME LANGUAGE, HALVED AND THINNED: the same two translucent
   * values at roughly half strength, and the sidewall drops from 2dp to 1dp.
   * Same grammar, lower voice. A card still says "you can touch me"; it no
   * longer says "strike me". */
  chassisFaceLit: 'rgba(255,250,240,0.16)',
  chassisSidewall: 'rgba(0,0,0,0.38)',
  /** The chassis contact. Present, so a card reads as RESTING on the panel —
   *  and weaker than a command's, so a card never reads as a key. */
  chassisContact: 'rgba(0,0,0,0.46)',
  /* ⚠⚠⚠ PHASE 2 — THE BOARD LIFT. A dialog, a mission board, an inspection
   * card: these sit ABOVE the interface, not in it, and Phase 1 gave them
   * nothing at all — `modalCard` and `momentCard` were a fill, a 1dp rim and a
   * radius, which is the same construction as a panel the player cannot touch.
   *
   * ⚠⚠ THIS IS THE ONE PLACE ELEVATION IS CORRECT. The dossier construction
   * refused Android `elevation` because a four-sided halo is wrong on a compact
   * chip standing on a plate. A BOARD LAID OVER THE WHOLE SCREEN is exactly the
   * object a four-sided shadow describes — it is lifted on every side, and
   * `TButton`'s own `btnOuter` has used the same pair since VIS-1. Shadow for
   * iOS, elevation for Android, and neither consumes a pixel of layout. */
  boardShadow: 'rgba(0,0,0,0.75)',
  /* ⚠⚠⚠ THE RECESS — AND THE DEFECT IT ANSWERS IS THAT A FIELD AND A BUTTON ARE
   * CURRENTLY THE SAME OBJECT. Measured on this tree before touching anything:
   *     styles.quick            (a COMMAND)  #1a1714 · #3a342c 1dp · radius 4
   *     InputBox.inputWrap      (a FIELD)    #1a1714 · 1dp        · radius 4
   *     KeyboardInputBar.input  (a FIELD)    #1a1714 · #3a342c 1dp · radius 4
   * Three objects, one material, two opposite meanings. No amount of depth on
   * the button fixes that, because the field is wearing the button's ground.
   *
   * ⚠⚠ THE ANSWER ALREADY EXISTED AND WAS SIMPLY NOT SPENT HERE. `T.glass` is
   * this file's declared *"inset technical surface… a readout is a HOLE in the
   * chassis, not a plate on it"*, and its alpha is the highest in the material
   * family precisely so a recess stays the darkest plane on any player-tuned
   * background — the ordering `composite ≤ coating ≤ glass` that the OTA-1746
   * suite already asserts. An input is a readout you write into.
   *
   * ⚠ THE EDGES INVERT, WHICH IS WHAT MAKES IT A HOLE. On a raised control the
   * light catches the TOP and the shadow falls at the bottom. Cut a well into
   * the same surface and it is the other way round: the near lip throws shadow
   * DOWN into the recess, and the far lip catches a little light. These are the
   * two values `panelRimRecessed` has shipped with since VIS-3, reused rather
   * than re-invented so the game has ONE recess vocabulary and not two. */
  recessTop: 'rgba(0,0,0,0.55)',
  recessLip: 'rgba(214,190,140,0.10)',
  /** The brand gold. The one chromatic note; unchanged since the game began. */
  gold: '#C9A86A',
  goldDim: '#8E7548',
  /* ⚠⚠⚠ THE PANEL FRAME — STRUCTURE, NOT PRESSABILITY, AND THE TWO MUST NOT
   * MERGE. `tControlDepth` says "you can press this". These say "this is one
   * region of the HUD". A control is a thing you touch; a panel is a thing you
   * read. Giving a panel the button language would promise a press that never
   * comes, and giving a button this ornament would bury the one cue a thumb
   * needs. Separate names, separate jobs, and the suite asserts neither leaks
   * into the other.
   *
   * ⚠⚠ DERIVED FROM `gold` BY OPACITY, WHICH IS THE OWNER'S INSTRUCTION: *"If an
   * existing Tartaria gold token is too strong at full opacity, derive the frame
   * through governed opacity rather than introducing arbitrary unrelated gold
   * values."* Both are `#C9A86A` — 201,168,106 — at an alpha, so there is no
   * fourth off-brand gold here and the hue can never drift from the brand.
   *
   * ⚠ AND THE MOCK-UP THAT WAS REJECTED IS WHY THE NUMBERS ARE LOW. Owner, on
   * the strong-gold version: the frames *"popped too hard and competed with the
   * information."* The rim is the quieter of the two so a long edge never
   * out-shouts the text it surrounds; the corner brackets are the louder, and
   * they are short, so the eye reads "constructed" from the corners and lets the
   * edges recede. Aged brass catching a little light, not a neon outline. */
  /* ⚠ VISUAL LANGUAGE PHASE 1 — 0.26 → 0.30. Owner, on the physical build: the
   * structural frame is *"approximately 15% too restrained."* This is that 15%
   * and nothing else — the SAME `#C9A86A` at a higher alpha, so no fourth gold
   * enters the file, the hue cannot drift from the brand, and the frame is still
   * far below the rejected strong-gold mock-up that *"popped too hard and
   * competed with the information."* The token reaches exactly one style
   * (`kit.panelFrame`) and therefore exactly four consumers, all in Exploration.
   * `kit.panelRim` below is a DIFFERENT thing — TPanel's own ring, which reads
   * `T.rim` — and is untouched. */
  panelRim: 'rgba(201,168,106,0.30)',
  /** ⚠⚠⚠ THE CONVERSATION FRAME. Brighter than the brand gold, ON PURPOSE, and
   *  named here under an owner ruling rather than smuggled in as a literal.
   *
   *  OTA-1769 measured it and REFUSED to adopt it: warm-ordered, but chroma 134
   *  against this file's own ceiling of 60, where the brand gold's 95 passes
   *  only by being exempt BY NAME. Admitting a second bright gold is a decision
   *  about semantic authorities, not a refactor, so the frame stayed local in
   *  two files and the question went to the owner. OTA-1773 is the answer:
   *  APPROVED, with the reason to preserve stated in as many words —
   *      *"the outer frame is deliberately visually louder/brighter than the
   *      gold hierarchy inside the conversation sheet"*
   *  which is the same thing the colour was asked for in the first place
   *  (OTA-1096: *"put the outside edge detail a brighter gold color so it pops
   *  and you understand a border is there"*).
   *
   *  ⚠ SO IT IS A HIERARCHY, NOT A SHADE, and that is what must survive. It is
   *  the OUTER edge of a conversation overlay and nothing else. Normalising it
   *  to `gold` would not be a small colour change — it would flatten the frame
   *  into the golds it is supposed to sit above. `T.gold` remains the interface
   *  accent; this is louder than the accent by design, which is exactly why it
   *  needed naming instead of an ungoverned exception. */
  goldFrame: '#F0C96A',
  /** Ink. */
  ink: '#E6D8B3',
  inkDim: '#A2977B',
  /** ⚠ ORNAMENT ONLY — a mark, a tick, a divider's own label at rest. Measured
   *  across seven themes it reaches only ~3.1:1 on a plate over a LIGHT player
   *  background, so it must not carry words the player has to read. Text that
   *  sits directly on the tuned background belongs to `useReadableMuted()`,
   *  which flips ink/parchment with the player's lightness. */
  inkQuiet: '#7E7461',
  /** Destructive / fallen. */
  rust: '#E07A5F',
  rustRim: '#5A2A26',
  /* ⚠⚠⚠ VIS-3 — FOUR MATERIALS, SO THAT "STRUCTURE" AND "INFORMATION" STOP
   * BEING THE SAME SUBSTANCE. Everything above this line is ONE aged alloy, and
   * a screen built entirely out of it has no way to say "this is the chassis"
   * versus "this is the readout cut into the chassis" except by drawing another
   * border. Four is the whole list and it is meant to stay four — a fifth
   * material is a new claim about what Tartaria is made of.
   *
   *   COMPOSITE  the structural housing. Non-metallic, matte, recedes.
   *   GLASS      the inset technical surface. Darker than anything around it,
   *              because a readout is a HOLE in the chassis, not a plate on it.
   *   CERAMIC    an inert pale insert — a key, a legend mark. Never a face.
   *   COATING    damaged dark paint over alloy: utility that must recede. */
  /** COMPOSITE — the recovered chassis. */
  composite: 'rgba(18,17,16,0.90)',
  compositeRim: '#2A2C2D',
  /** GLASS — an inset technical surface. The one thing allowed to be darker
   *  than the world behind it, which is what makes it read as cut IN.
   *  ⚠⚠⚠ ITS ALPHA IS THE HIGHEST IN THE FAMILY, AND THAT IS A RULE, NOT A
   *  PREFERENCE. A recess is defined by being the darkest plane on the screen;
   *  a MORE transparent material admits MORE of the player's background, so on
   *  a light theme the recess simply rises. At 0.90 the feed's own well was
   *  brighter than the utility coating beside it for any player who tuned their
   *  background bright — the recess stopped being a recess. So the family's
   *  alphas must be monotone in its plane order:
   *    composite (housing) ≤ coating (utility) ≤ glass (recess)
   *  which is exactly what the OTA-1746 suite now asserts. */
  glass: 'rgba(6,7,8,0.94)',
  glassRim: '#242829',
  /** CERAMIC — an inert pale insert. */
  ceramic: '#8C8E8B',
  /** COATING — damaged paint. Utility surfaces wear this and go quiet.
   *  ⚠⚠ THE ALPHA IS NOT A TASTE CALL, AND THIS ONE WAS CAUGHT BY ITS OWN TEST.
   *  It was 0.82, which is darker than `composite` on a DARK player theme and
   *  LIGHTER than it on a light one — so the material ordering the whole plane
   *  stack rests on silently inverted for any player who tuned their background
   *  bright, and a utility control became the most prominent thing in its
   *  housing. Every material in this family must hold its rank on both
   *  extremes, which means none of them may be more transparent than the
   *  housing they sit in. */
  coating: 'rgba(11,10,10,0.92)',
} as const;

// ─── TYPOGRAPHY ──────────────────────────────────────────────────────────────
// FIVE FUNCTIONAL ROLES, NO MORE, and no font is loaded for any of them: the
// roles are size, weight and tracking on the system face, which is what stops a
// buried-industrial screen from drifting into a pile of decorative fantasy
// fonts. The numbers are lifted from the title screen's own type, which is why
// the reference implementation looks unchanged in the places it should.
export const TType = StyleSheet.create({
  /** DISPLAY — the game's own name, and nothing else. */
  display: { fontSize: 36, letterSpacing: 8, fontWeight: '800', color: T.ink },
  /** DOSSIER — a Tartarian's name, a panel's title. */
  dossier: { fontSize: 16, fontWeight: '700', color: T.ink },
  /** ACTION — anything you can press. Stamped: upper case, wide, heavy. */
  action: { fontSize: 12, fontWeight: '800', letterSpacing: 2, color: T.ink },
  /** BODY — information the player reads. */
  body: { fontSize: 12, color: T.inkDim },
  /** META — labels, stamps, provenance. Quiet and wide, but still READ, so it
   *  takes inkDim rather than the ornament tone. */
  meta: { fontSize: 10, letterSpacing: 2, color: T.inkDim },
  /* ⚠⚠ VIS-3 — THE TWO ROLES EVERY SCREEN WAS ALREADY FAKING.
   * Exploration's day counter, weather and danger band were being drawn with
   * `body` or `meta` and then re-coloured inline at each call site, which is how
   * a type system quietly stops being one. They are not body and not metadata:
   * one is an INSTRUMENT READOUT and one is a STATE. Naming them is what stops
   * the next screen inventing a ninth size. */
  /** TECHNICAL — an instrument readout. Tight, tabular, unemphatic. */
  technical: { fontSize: 10, letterSpacing: 0.8, color: T.inkDim, fontVariant: ['tabular-nums'] as const },
  /** STATUS — a condition the player is currently under. Wide and stamped, and
   *  it takes its colour from the CALLER, because a status without its own
   *  severity is just a label. */
  status: { fontSize: 9, letterSpacing: 1.6, fontWeight: '700', color: T.inkDim },
});

// ─── ORNAMENT ────────────────────────────────────────────────────────────────
/* ⚠ TWO MOTIFS, REPEATED. The SURVEY DIAMOND (◈) and the ENGRAVED RULE — a
 * hairline in shadow with a hairline of light beneath it, the way a line cut
 * into metal actually reads. Everything ornamental in Tartaria is one of these
 * two, at different weights. Resist adding a third. */

/** An engraved rule. `inset` pulls it in from the plate edge; `lit` brightens it
 *  for a selected surface. */
/** Selection/expansion settle, in the brief's 150-220ms window. */
export const SETTLE_MS = 180;

export function TRule({ inset = 0, lit = false, style }: { inset?: number; lit?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginHorizontal: inset }, style]} pointerEvents="none">
      <View style={[kit.ruleCut, lit && kit.ruleCutLit]} />
      <View style={[kit.ruleLight, lit && kit.ruleLightLit]} />
    </View>
  );
}

/** A rule broken by the survey diamond — the screen's section divider. */
/** ⚠ `color` exists because a divider's label is the one piece of kit text that
 *  sits DIRECTLY on the player's tuned background rather than on a plate. Pass
 *  the screen's auto-contrast tone (useReadableMuted) so it stays legible when
 *  the player has chosen a light background; the default suits a dark one. */
export function TDivider({ label, lit = false, color }: { label?: string; lit?: boolean; color?: string }) {
  return (
    <View style={kit.dividerRow} pointerEvents="none">
      <View style={kit.dividerLine}>
        <TRule lit={lit} />
      </View>
      <Text style={[kit.dividerMark, lit && { color: T.gold }]}>◈</Text>
      {label ? <Text style={[kit.dividerLabel, color ? { color } : null]}>{label}</Text> : null}
      <Text style={[kit.dividerMark, lit && { color: T.gold }]}>◈</Text>
      <View style={kit.dividerLine}>
        <TRule lit={lit} />
      </View>
    </View>
  );
}

/** The registration marks that sit in a plate's corners — a stamped sheet's
 *  alignment crosses, drawn as two hairlines rather than a glyph so they stay
 *  crisp at any density. */
export function TCorners({ lit = false }: { lit?: boolean }) {
  const c = lit ? kit.cornerLit : kit.corner;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[c, kit.cornerTL]} />
      <View style={[c, kit.cornerTR]} />
      <View style={[c, kit.cornerBL]} />
      <View style={[c, kit.cornerBR]} />
    </View>
  );
}

// ─── SURFACE ─────────────────────────────────────────────────────────────────
/* ⚠⚠ THE LAYER STACK, WHICH IS THE WHOLE POINT OF THIS FILE.
 *
 *   outer drop shadow      the plate sits ON the world, not in it
 *   → structural rim       its outline
 *   → lit top edge         where the light catches
 *   → recessed face        the well the content sits in
 *   → dark lower edge      where it falls away
 *
 * A Tartaria control is never `backgroundColor + borderColor`. Not every element
 * needs every layer — a utility plate skips the lit edge because it is not meant
 * to catch the eye — but the ones that carry weight get all of it. */
export function TPanel({
  children, tone = 'plate', style, contentStyle,
}: {
  children?: React.ReactNode;
  /** `plate` ordinary · `raised` selected/primary · `recessed` utility/subordinate */
  tone?: 'plate' | 'raised' | 'recessed';
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[kit.panelOuter, tone === 'raised' && kit.panelOuterRaised, style]}>
      <View style={[kit.panelRim, tone === 'raised' && kit.panelRimRaised, tone === 'recessed' && kit.panelRimRecessed]}>
        <View style={[
          kit.panelFace,
          tone === 'raised' && kit.panelFaceRaised,
          tone === 'recessed' && kit.panelFaceRecessed,
          contentStyle,
        ]}>
          {children}
        </View>
      </View>
    </View>
  );
}

// ─── HOUSING ─────────────────────────────────────────────────────────────────
/* ⚠⚠⚠ VIS-3 — THE SHAPE THAT IS NOT A RECTANGLE WITH A BORDER.
 *
 * `TPanel` is a plate: a thing that sits ON the world. `TSurface` is the other
 * half of the vocabulary — a HOUSING, a piece of recovered chassis with things
 * cut INTO it. The difference is the whole reason Exploration read as developer
 * UI: eight elements that were all plates, all on one plane, distinguishable
 * only by which of two greys their 1px border used.
 *
 * ⚠⚠ THE PLANE STACK, WHICH IS THE ACTUAL DELIVERABLE.
 *   1 WORLD SUBSTRATE   the player's tuned background + AppShell's texture
 *   2 HOUSING           `TSurface tone="housing"` — composite, keyed corner
 *   3 INSET SURFACE     `TSurface tone="inset"`  — glass, darker than the world
 *   4 ACTIVE ELEMENT    `TPanel tone="raised"` / a primary `TButton`
 *   5 RESULT            the combat strip, a modal, a settle
 * A screen that uses 2 and 3 has depth without a single extra shadow. This
 * costs one static View tree and no shadow at all on the inset — the recess is
 * made by the face being DARKER than its surroundings, which is how a recess
 * actually looks and is free.
 *
 * ⚠⚠ THE KEYED CORNER IS ONE CORNER, ONCE. A machined chamfer on the top-right
 * says "this object was manufactured, and it has an orientation". Fifteen exotic
 * shapes on one screen is not more polished — it is noise — so the cut is on the
 * housing only, always the same corner, and `keyed={false}` exists for the cases
 * where a surface must stay square (anything that tiles, anything in a row).
 *
 * ⚠ AND IT IS THEME-SAFE. The cut is drawn between two things this file already
 * owns — the housing's own face and a near-black — never against the player's
 * background, so it cannot produce a bright wedge on a light theme. */
export function TSurface({
  children, tone = 'housing', keyed = true, rail, style, contentStyle, testID,
}: {
  children?: React.ReactNode;
  /** `housing` recovered chassis · `inset` a technical surface cut into it */
  tone?: 'housing' | 'inset';
  keyed?: boolean;
  /** The integral top rail. ⚠ It is PART OF THE HOUSING, not a second panel
   *  stacked on one: it shares the rim, and is separated from the face by an
   *  engraved line rather than by another border. */
  rail?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const inset = tone === 'inset';
  return (
    <View style={[kit.surfRim, inset ? kit.surfRimInset : kit.surfRimHousing, style]} testID={testID}>
      {rail ? (
        <>
          <View style={kit.surfRail}>{rail}</View>
          <TRule />
        </>
      ) : null}
      <View style={[kit.surfFace, inset ? kit.surfFaceInset : kit.surfFaceHousing, contentStyle]}>
        {children}
      </View>
      {keyed ? <View style={kit.surfKey} pointerEvents="none" /> : null}
    </View>
  );
}

// ─── CONTROLS ────────────────────────────────────────────────────────────────
export type TButtonVariant = 'primary' | 'utility' | 'destructive';

/* ⚠⚠ A PRESSED CONTROL PHYSICALLY DEPRESSES. The face drops one point and the
 * drop shadow collapses under it, which is what pressing a plate into its
 * housing looks like. ~90ms, native driver, and NOT RUN AT ALL under
 * reduce-motion — where the pressed state still reads, through the darker face
 * `Pressable` applies, so the feedback is never lost, only the movement. */
const PRESS_MS = 90;
const RELEASE_MS = 120;

export function TButton({
  label, onPress, variant = 'primary', compact = false, disabled = false, sub, accessibilityLabel, accessibilityHint, style, testID,
}: {
  label: string;
  onPress: () => void;
  variant?: TButtonVariant;
  /** ⚠ VIS-3 — A DENSITY, NOT AN EIGHTH BUTTON STYLE. Exploration's WORLD/LORE
   *  keys bracket a live mini-map inside a 165px column; at the full utility
   *  height they eat the map. Every other property — rim, face, press
   *  depression, type role, reduce-motion behaviour — is the same control, so
   *  the family stays a family and the screen does not sprout a new one. */
  compact?: boolean;
  disabled?: boolean;
  /** A quiet second line — status, a hint, a count. */
  sub?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduceMotion = useReduceMotion();
  const depth = useRef(new Animated.Value(0)).current;
  const run = useCallback((to: number, duration: number) => {
    if (reduceMotion) { depth.setValue(to); return; }
    Animated.timing(depth, { toValue: to, duration, useNativeDriver: true }).start();
  }, [depth, reduceMotion]);
  /* ⚠⚠⚠ VIS-3 — THE INTERPOLATION IS MEMOISED, AND THAT IS A PERFORMANCE FIX,
   * NOT A TIDY-UP. As written by VIS-1 this built a NEW `interpolate` node —
   * and a new `{ transform: [...] }` object — on every render. RN's
   * `AnimatedProps` treats a new animated node as new props, detaches, attaches
   * and SCHEDULES ANOTHER UPDATE, so every re-render of a screen containing a
   * TButton cost TWO commits instead of one. It went unnoticed on the title
   * screen (which re-renders rarely); Exploration re-renders on the arbiter's
   * every state change, and OTA-1739's commit-count suite caught it the moment
   * this control reached that screen. `TSettle` already did this correctly —
   * the button simply never had the same treatment. */
  const translateY = useMemo(
    () => depth.interpolate({ inputRange: [0, 1], outputRange: [0, 1.5] }),
    [depth],
  );
  const lift = useMemo(() => ({ transform: [{ translateY }] }), [translateY]);

  const primary = variant === 'primary';
  const destructive = variant === 'destructive';
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => run(1, PRESS_MS)}
      onPressOut={() => run(0, RELEASE_MS)}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={[kit.btnOuter, primary && kit.btnOuterPrimary, disabled && kit.disabled, style]}
    >
      {({ pressed }) => (
        <Animated.View style={[kit.btnRim,
          primary && kit.btnRimPrimary,
          destructive && kit.btnRimDestructive,
          lift]}
        >
          <View style={[
            kit.btnFace,
            primary && kit.btnFacePrimary,
            variant === 'utility' && kit.btnFaceUtility,
            destructive && kit.btnFaceDestructive,
            compact && kit.btnFaceCompact,
            pressed && kit.btnFacePressed,
          ]}>
            {primary && <View style={kit.btnTopLight} pointerEvents="none" />}
            <View style={kit.btnLabelRow} pointerEvents="none">
              {primary && <Text style={kit.btnFlank}>◈</Text>}
              <Text
                style={[
                  TType.action,
                  primary && kit.btnTextPrimary,
                  variant === 'utility' && kit.btnTextUtility,
                  destructive && kit.btnTextDestructive,
                  compact && kit.btnTextCompact,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {primary && <Text style={kit.btnFlank}>◈</Text>}
            </View>
            {sub ? <Text style={kit.btnSub} numberOfLines={1}>{sub}</Text> : null}
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
}

// ─── RESOURCE ────────────────────────────────────────────────────────────────
/** ⚠ A GAME RESOURCE, NOT A STATUS STRING. Stamped chit: recessed well, rim,
 *  the survey diamond as the resource's own mark, the count large and the name
 *  quiet beside it. Deliberately small — it is a held resource, not a headline. */
export function TResourceChit({ count, label, glyph = '◈' }: { count: number; label: string; glyph?: string }) {
  return (
    <View style={kit.chitOuter}>
      <View style={kit.chitRim}>
        <View style={kit.chitFace}>
          <Text style={kit.chitGlyph}>{glyph}</Text>
          <Text style={kit.chitCount}>{count}</Text>
          <View style={kit.chitSep} />
          <Text style={kit.chitLabel} numberOfLines={1}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── FACTION PLATE ───────────────────────────────────────────────────────────
/* ⚠⚠⚠ THE EXPANSION REWARD. A Tartarian's faction emblem is not an inline icon
 * — it is a stamped plate riveted to the corner of the record, overlapping its
 * edge the way a physical seal would. It appears ONLY on the selected dossier;
 * that is what makes selecting one feel like opening a file rather than
 * highlighting a row.
 *
 * ⚠⚠ IT CANNOT TOUCH A GESTURE. `pointerEvents="none"` on the whole plate, so
 * the tap, the second-tap entry, the swipe-to-delete and the scroll all pass
 * straight through it to the dossier underneath.
 *
 * ⚠ AND IT IS NEVER INVENTED. The art is the canonical `assets/crests/<id>.png`
 * the game already ships (engine/factionCrests). A faction with no art renders
 * NOTHING — no placeholder glyph, no substitute emblem — because a stand-in
 * would be lore this file is not entitled to write. */
export const FACTION_PLATE_TEST_ID = 'tartaria-faction-plate';

export function TFactionPlate({
  source, size = 96, style,
}: { source: number; size?: number; style?: StyleProp<ViewStyle> }) {
  const box = useMemo(() => ({ width: size, height: size }), [size]);
  // ⚠ PHONE-FIX — the well's inset scales with the plate instead of being a
  // fixed 14px. At 96 a fixed inset left the art swimming in its own frame;
  // proportional keeps the emblem the subject at every size.
  const inset = useMemo(() => Math.max(8, Math.round(size * 0.14)), [size]);
  const inner = useMemo(() => ({ width: size - inset, height: size - inset }), [size, inset]);
  return (
    <View style={[kit.plateOuter, box, style]} pointerEvents="none" testID={FACTION_PLATE_TEST_ID}>
      <View style={[kit.plateRim, box]}>
        <View style={[kit.plateWell, inner]}>
          <Image source={source} style={kit.plateArt} resizeMode="contain" />
        </View>
      </View>
      {/* the four rivets that hold it to the record */}
      <View style={[kit.rivet, kit.rivetTL]} />
      <View style={[kit.rivet, kit.rivetTR]} />
      <View style={[kit.rivet, kit.rivetBL]} />
      <View style={[kit.rivet, kit.rivetBR]} />
    </View>
  );
}

// ─── GEAR ────────────────────────────────────────────────────────────────────
/* ⚠⚠⚠ THE SETTINGS MARK IS DRAWN, NOT TYPED — AND THE REASON IS NOT TASTE.
 *
 * Both settings buttons rendered `⚙` (U+2699) as TEXT, which means the icon was
 * never actually ours: it was whatever the device's symbol font happened to
 * contain, at whatever weight that font drew it, and U+2699 has an EMOJI
 * PRESENTATION VARIANT — so on an Android build whose fallback chain reaches the
 * colour emoji font first, the glyph renders as a colour emoji and ignores the
 * `color` we set entirely. A settings key that can spontaneously turn into a
 * blue-and-white sticker is not a designed icon.
 *
 * ⚠⚠ AND THE ALTERNATIVES ARE NOT AVAILABLE. Native builds are PARKED, so
 * `react-native-svg` and any icon-font package cannot ship — an OTA carries JS
 * and assets, not new native modules. Swapping to `⛭` (gear without hub) dodges
 * the emoji variant but trades it for a tofu box on any device whose symbol font
 * lacks the codepoint. Drawing it is the only option that is font-independent.
 *
 * ⚠ SO: A RING AND EIGHT TEETH, NINE STATIC VIEWS.
 * Each tooth is placed by `[{ rotate }, { translateY }]` — the rotation happens
 * first, so the translate runs along the ALREADY-ROTATED axis and pushes the
 * tooth straight out along its own radius. That is one View per tooth instead of
 * a wrapper-plus-child pair, and it is the same trick the housing's chamfer uses.
 * The body is an ANNULUS (borderWidth on a circle, transparent centre), so the
 * hub is a real hole that shows whatever is behind it rather than a disc painted
 * in a colour this file would have to guess. The teeth render first and the ring
 * paints over their inner ends, which is what welds them into one object.
 *
 * ⚠ IT COSTS NOTHING AND IT SCALES. Every dimension is derived from `size`, so
 * one primitive serves a 14px key in a header rail and a 20px one in a corner
 * button without a second asset or a second set of numbers. No image, no font,
 * no animation, no state, no measurement. `pointerEvents="none"` — the pressable
 * that owns it keeps the whole target. */
const GEAR_TEETH = [0, 45, 90, 135, 180, 225, 270, 315] as const;

export function TGear({ size = 16, color = T.inkDim }: { size?: number; color?: string }) {
  const g = useMemo(() => {
    // ⚠ Proportions, once. The tooth's INNER end must land between the ring's
    // inner and outer radius, or the teeth either float free of the body or
    // poke into the hub hole. ring outer 0.31·s, ring inner 0.18·s, tooth inner
    // end 0.37·s − 0.105·s = 0.265·s — inside the stroke, hidden by it.
    const ring = Math.round(size * 0.62);
    const border = Math.max(1, Math.round(size * 0.13));
    const toothW = Math.max(1, Math.round(size * 0.17));
    const toothH = Math.max(1, Math.round(size * 0.21));
    return {
      ring,
      border,
      toothW,
      toothH,
      radius: size * 0.37,
      ringOffset: (size - ring) / 2,
      toothTop: (size - toothH) / 2,
      toothLeft: (size - toothW) / 2,
    };
  }, [size]);

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {GEAR_TEETH.map((deg) => (
        <View
          key={deg}
          style={{
            position: 'absolute',
            top: g.toothTop,
            left: g.toothLeft,
            width: g.toothW,
            height: g.toothH,
            backgroundColor: color,
            borderRadius: 1,
            transform: [{ rotate: `${deg}deg` }, { translateY: -g.radius }],
          }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          top: g.ringOffset,
          left: g.ringOffset,
          width: g.ring,
          height: g.ring,
          borderRadius: g.ring / 2,
          borderWidth: g.border,
          borderColor: color,
        }}
      />
    </View>
  );
}

// ─── STRATA ──────────────────────────────────────────────────────────────────
/** ⚠ THE BURIED-WORLD LAYER, AND IT IS DELIBERATELY ALMOST INVISIBLE. Three
 *  survey rules and four registration marks at very low alpha — excavation
 *  strata under an instrument face. It is warm white, so it TINTS with whatever
 *  hue the player set rather than fighting it, and no text depends on it for
 *  legibility. It draws nothing that moves and costs one static View tree. */
export function TStrata() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* ⚠ Each band is the SAME engraved rule the plates use, at a third of
          its weight — a hairline of shadow over a hairline of light. A single
          pale line would vanish on a light background and a single dark one
          would vanish on a black one; the pair reads, faintly, on both, which
          is the only way a texture can be honest about a hue the player owns. */}
      <View style={[kit.strataBand, { top: '22%' }]}><TRule /></View>
      <View style={[kit.strataBand, { top: '46%' }]}><TRule /></View>
      <View style={[kit.strataBand, { top: '73%' }]}><TRule /></View>
      <View style={[kit.strataTick, { top: '22%', left: 10 }]}><TRule /></View>
      <View style={[kit.strataTick, { top: '46%', right: 10 }]}><TRule /></View>
      <View style={[kit.strataTick, { top: '73%', left: 10 }]}><TRule /></View>
    </View>
  );
}

// ─── SELECTION SETTLE ────────────────────────────────────────────────────────
/** ⚠⚠ THE SELECTED THING SETTLES INTO PLACE — 180ms, ONCE, AND NEVER AGAIN.
 *  Expanding a record used to be a hard cut. This lifts it the last few pixels
 *  and eases the last half-percent of scale, which is enough to read as a plate
 *  seating itself and short enough (180ms, inside the 150-220ms window) that it
 *  is never in the player's way.
 *
 *  ⚠ WHAT IT IS NOT: not a loop, not a glow, not a pulse. `useNativeDriver`
 *  means the JS thread does no per-frame work at all, the timing runs exactly
 *  once per change of `active`, and under reduce-motion the value is SET rather
 *  than animated so the result is identical with no animation whatsoever.
 *
 *  ⚠ AND IT NEVER GATES ANYTHING. It is a wrapper around content that is
 *  already interactive; taps, the second tap that loads, the swipe-to-delete and
 *  the scroll all work throughout, and nothing waits for it to finish. */
export function TSettle({
  active, children, style,
}: { active: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  /* ⚠⚠⚠ PHONE-FIX — REST IS 1, NOT 0, AND THAT WAS THE BLACK LINE.
   *
   * This settled to 0 when `active` was false — so an INACTIVE card did not sit
   * still, it sat PARKED AT THE START OF ITS OWN ENTRANCE: `translateY: 4` and
   * `scale: 0.994`, permanently, on every collapsed record in the roster. The
   * shadow-casting parent stayed where the layout put it while its content sat
   * four pixels lower, and the strip of parent left uncovered above each card is
   * the thin dark seam the owner photographed immediately above the gold rim.
   *
   * ⚠ 1 IS THE ONLY CORRECT REST for both states: an entrance animation has no
   * business having a resting pose of its own. Becoming active replays it from
   * 0; becoming inactive simply stops being displaced. */
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || reduce) { v.setValue(1); return; }
    v.setValue(0);
    const anim = Animated.timing(v, {
      toValue: 1,
      duration: SETTLE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [active, reduce, v]);
  const transform = useMemo(() => [
    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) },
    { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.994, 1] }) },
  ], [v]);
  return <Animated.View style={[style, { transform }]}>{children}</Animated.View>;
}

/* ⚠⚠⚠ TSCREENHEADER — THIRTEEN HAND-ROLLED BACK BARS, ONE PRIMITIVE.
 *
 * Tier 0 of the interface rollout. Every screen but Exploration, Title and
 * Ending built its own `← BACK` / title / spacer row, and they agreed almost
 * completely — which is what makes this worth extracting rather than a matter
 * of taste. Measured across the twelve that have one:
 *
 *   backText   IDENTICAL in all twelve, byte for byte.
 *   backBtn    identical but for padding: 14/10 on eight, 12/6 on three,
 *              16/12 on CharacterCreation.
 *   header row `row · space-between · center`, differing only in whether it
 *              carries `paddingVertical: 8` and by how much it margins below.
 *   title      ⚠ SPLIT SIX / FIVE — gold on About, Character, Crafting, Map,
 *              Vendor and World; ink on ActionReference, Contracts, Guidance,
 *              Log and Lore.
 *
 * ⚠⚠ AND THE SPLIT IS NOT A DRAW — VIS-3 ALREADY SETTLED IT. Gold marks a LIVE
 * OBLIGATION or a LIVE PROCESS. A screen's own name is neither; it is the least
 * urgent text on the screen, and making it the brightest thing competes with
 * whatever the screen is actually for. That is the same reasoning that took gold
 * off Exploration's place name in OTA-1746. So `ink` is the default here, and a
 * gold title has to be asked for by name.
 *
 * ⚠ THE RIGHT SLOT IS A SLOT, NOT A SPACER. Eight screens balance the row with
 * `<View style={{ width: 80 }} />`; Map and Vendor put real controls there. Both
 * are the same shape — something on the right that is `minWidth` matched to the
 * back button so the title sits centred — so `right` takes a node and falls back
 * to reserving the width.
 *
 * ⚠ WHAT IT DOES NOT DO: it is a row, not a chrome bar. No background, no
 * border, no plane of its own. Screens sit it on their own substrate exactly as
 * the hand-rolled versions did, so adopting it moves nothing.
 *
 * ⚠⚠ AND THE BACK CONTROL IS STILL A `TouchableOpacity`, NOT A `TButton`, WHICH
 * IS A DEFERRAL RATHER THAN AN OVERSIGHT. The kit's control family presses with
 * a depth translate; these twelve press with `activeOpacity={0.7}`. Routing them
 * through `TButton` is the right end state and it is a VISIBLE change to how the
 * control feels — so it is a decision for the screen passes, not something to
 * smuggle in under a primitive whose whole claim is that nothing moves. */
export function TScreenHeader({
  title, onBack, right, tone = 'ink', backLabel = '← BACK',
  density = 'regular', accessibilityLabel = 'Go back', hitSlop = 8, style,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** ⚠ `gold` is a deliberate exception, not a style choice — see above. */
  tone?: 'ink' | 'gold';
  backLabel?: string;
  density?: 'regular' | 'tight';
  accessibilityLabel?: string;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[kit.schRow, density === 'tight' && kit.schRowTight, style]}>
      {onBack ? (
        /* ⚠⚠ THE SHARED BACK IS A DISCRETE COMMAND, AND IT IS THE HIGHEST-LEVERAGE
           ONE IN THE GAME — every screen that takes this header gets whatever this
           control says about pressability. The Codex census named it a proven
           missed family: it had the chassis of a button (fill, ring, radius,
           padding, 80dp floor) and none of the physical language.

           ⚠ `Pressable`, NOT `TouchableOpacity`, for OTA-1782's reason rather
           than as a tidy-up: `activeOpacity` fades the WHOLE control, fill
           included, which is the technique the depth language exists to replace.
           A settle moves the light; it does not make the control translucent.
           `hitSlop`, the role, the label and the 80dp `minWidth` are carried
           across untouched, so the logical target is the one it has always had. */
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [
            kit.schBack,
            density === 'tight' && kit.schBackTight,
            tControlDepth(pressed),
          ]}
          hitSlop={hitSlop}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {({ pressed }) => (<>
            <Text style={kit.schBackText}>{backLabel}</Text>
            {/* ⚠⚠⚠ PHASE 2 — THE HIGHEST-LEVERAGE CONTROL IN THE GAME JOINS THE
                SECOND PLANE. Seven screens take this header, so whatever BACK
                says about pressability is what most of Tartaria says. Phase 1
                gave it the ring and stopped there; it now carries the same
                face/sidewall/contact construction as every other command, and
                collapses the same way under a thumb.
                ⚠ THE TITLE DELIBERATELY GETS NOTHING. Owner: *"BACK =
                interactive physical control. TITLE = structural/read-only
                information."* The header is not one raised slab — it is a
                pressable object, a label, and a slot. */}
            <View style={pressed ? kit.controlPlaneTopPressed : kit.controlPlaneTop} pointerEvents="none" />
            <View style={pressed ? kit.controlPlaneBottomPressed : kit.controlPlaneBottom} pointerEvents="none" />
            {pressed ? null : <View style={kit.controlPlaneContact} pointerEvents="none" />}
          </>)}
        </Pressable>
      ) : (
        <View style={kit.schSlot} />
      )}
      <Text
        style={[kit.schTitle, tone === 'gold' && kit.schTitleGold]}
        accessibilityRole="header"
        numberOfLines={1}
      >
        {title}
      </Text>
      {/* ⚠ The right slot always occupies the back button's width even when it
          is empty, or the title stops being centred and drifts as the back
          label changes length. That is what the eight `width: 80` spacers were
          doing by hand. */}
      <View style={kit.schSlot}>{right}</View>
    </View>
  );
}

/* ⚠⚠⚠ TTABBAR — AND THIS ONE MOVES A PIXEL, WHICH THE OTHERS DID NOT.
 *
 * Tier 0. Five screens carry a tab row; fifteen tabs between them. Measured
 * before writing anything, and the shape agrees far more than the state does:
 *
 *              tabRow                    the chip                  SELECTED
 *   About    gap 4 · ph 12 · mb 8   #1a1612 · ph 2 · justify   FILLED GOLD, ink #13110f
 *   Contracts bar + bottom rule     underline · pv 10          bottom rule
 *   Crafting gap 6 · mb 10          #1a1714 #3a342c r4 pv8     rim only
 *   Guidance gap 6 · mb 10          IDENTICAL to Crafting      rim + #221d15
 *   Vendor   gap 6 · mb 8           IDENTICAL to Crafting      rim + #2a2520
 *
 * ⚠⚠ SO WHY A COMPONENT, WHEN `TRow` DELIBERATELY WAS NOT? Because here the
 * INTERACTION converges and there it did not. Every one of the fifteen is the
 * same shape to the character: a `TouchableOpacity` with one `onPress`,
 * `activeOpacity={0.7}`, `accessibilityRole="button"` and
 * `accessibilityState={{ selected }}`, wrapping one `Text`. There is no second
 * gesture, no long-press, no checkbox mode — nothing a component would have to
 * plumb through props and nothing it would lose. TRow's four call sites
 * disagreed about what a row DOES; these fifteen agree completely.
 * The one thing a component has to make room for is Vendor's `CONTRACTS ▸`,
 * which sits in the row but is NOT a tab — it opens a modal and never holds the
 * selected state. That is the `right` slot, and it is one prop, not a rewrite.
 *
 * ⚠⚠⚠ THE SELECTED STATE DOES NOT CONVERGE, AND THAT IS THE HONEST PROBLEM.
 * Five screens, five treatments. There is no value that reproduces all of them,
 * so unlike OTA-1758 and OTA-1759 this primitive CANNOT claim nothing moves. It
 * takes the majority reading — a gold rim AND a lifted ground — because two of
 * the three chip-shaped screens already lift, and a rim alone on a dark chip is
 * the weakest of the five at saying "you are here", which is the entire job of
 * a tab bar.
 * ⚠ The ground is `#2a2520`, VENDOR'S OWN SHIPPED VALUE, chosen so the change
 * costs exactly one screen instead of two: Vendor moves zero pixels, and
 * CRAFTING'S SELECTED TAB GAINS A GROUND IT DID NOT HAVE. That is the whole of
 * the visible change in this pass, it is one property on one screen, and it is
 * photographed before and after rather than asserted.
 *
 * ⚠ WHAT IS NOT ADOPTED, AND WHY — the same three reasons as OTA-1759:
 *   · CONTRACTS is a different SHAPE. An underlined bar is not a row of chips,
 *     exactly as its padded `card` was not a list row. Left alone, not forced.
 *   · ABOUT fills the chip with solid gold and drops the label to `#13110f`.
 *     That is a real divergence and a real question — gold is reserved for a
 *     live obligation or a live process, and "which settings tab am I on" is
 *     neither — but About has its own pass in the rollout and this belongs to
 *     it, not to a primitive commit.
 *   · GUIDANCE is one of the four thin-cover screens (3 referencing suites) the
 *     owner asked to decide about before touching. It carries TWO one-off
 *     defects that this measurement found, both recorded and neither fixed:
 *     its `tabText` is MISSING `fontWeight: '700'`, so its tabs render lighter
 *     than every other screen's, and its selected label is `#e0c179` rather
 *     than the brand gold — a third off-brand gold, after the two OTA-1759
 *     found in Inventory, and `check:gold` is blind to all three. */
export interface TTab {
  /** Stable identity — what `onChange` hands back. */
  key: string;
  label: string;
  /** Appended in parentheses when > 0. Crafting's tabs carry ready-counts. */
  badge?: number;
  /** ⚠⚠⚠ OTA-1780 — THE SPOKEN NAME, WHEN THE PRINTED ONE IS AN ABBREVIATION.
   *  Added because migrating `GuidanceScreen` onto this bar would otherwise have
   *  SILENTLY DROPPED its accessible labels: its tabs print `CORE`, `FIRST-USE`
   *  and `REFERENCE` and announced "Core tutorial", "First-use teaching" and
   *  "Action reference". The bar had no way to say that, so the migration would
   *  have traded three defects for an accessibility regression — caught by
   *  OTA-1738's existing suite, which is the argument for running the whole
   *  surface rather than the pass's own tests.
   *  ⚠ Defaults to the visible label, so Crafting and Vendor are untouched: a
   *  tab whose printed name is already a word does not need a second one. */
  a11yLabel?: string;
}

export function TTabBar({
  tabs, value, onChange, right, density = 'regular', style,
}: {
  tabs: readonly TTab[];
  value: string;
  onChange: (key: string) => void;
  /** A control that shares the row but is NOT a tab — Vendor's `CONTRACTS ▸`. */
  right?: React.ReactNode;
  /** `tight` is Vendor's 8pt bottom margin; `regular` is Crafting's 10. */
  density?: 'regular' | 'tight';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[kit.tabRow, density === 'tight' && kit.tabRowTight, style]}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => onChange(t.key)}
            style={[kit.tabChip, on && kit.tabChipOn]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.a11yLabel ?? t.label}
          >
            <Text style={[kit.tabLabel, on && kit.tabLabelOn]}>
              {t.badge !== undefined && t.badge > 0 ? `${t.label} (${t.badge})` : t.label}
            </Text>
            {/* ⚠⚠⚠ PHASE 2 — TWO OBJECTS, NOT TWO COLOURS. An INACTIVE tab wears the
                raised family's three planes and stands proud of the row; the
                ACTIVE one has no side and no contact at all and instead pushes
                `tabMouth` past the baseline, so its body is continuous with the
                region it controls. The difference a player sees is a key versus
                a key that has been pressed home — which is what a selected tab
                physically IS.
                ⚠ All of it is absolute and `pointerEvents="none"`, so the tab's
                own handler, role, selected state and label are untouched and no
                plane can ever take a tap. */}
            {on ? (
              <View style={kit.tabMouth} pointerEvents="none" />
            ) : (
              <>
                <View style={kit.tabPlaneTop} pointerEvents="none" />
                <View style={kit.tabPlaneBottom} pointerEvents="none" />
                <View style={kit.tabPlaneContact} pointerEvents="none" />
              </>
            )}
          </TouchableOpacity>
        );
      })}
      {right}
    </View>
  );
}

/* ⚠⚠⚠ TROW — THE LIST-ROW CHASSIS, AND WHY IT IS NOT A COMPONENT.
 *
 * Tier 0. Four screens are lists and all four invented a row. Measured before
 * writing anything, the MATERIAL turned out to be the same thing four times:
 *
 *   Inventory `row`      #13110f · #3a342c 1px · radius 4 · overflow hidden
 *   Vendor    `offerRow` IDENTICAL, but marginBottom 6 against Inventory's 4
 *   Crafting  `recipeRow` BYTE-IDENTICAL to Vendor's
 *   Contracts `card`     the same ground and rim, but PADDED and not a row —
 *                        a block, not a line. A different shape; left alone.
 *
 * And the states converged even harder. `rowGrouped`, `offerRowPicked` and
 * `recipeRowPicked` are the SAME TWO DECLARATIONS in three files, and the dim
 * states land on exactly two levels — 0.6 for "de-emphasised but usable" and
 * 0.45 for "you cannot have this".
 *
 * ⚠ ONE NUMBER DID NOT AGREE, AND IT IS NOT SETTLED HERE. Inventory's row sits
 * on `marginBottom: 4`, Vendor's and Crafting's on 6. The chassis takes 6 —
 * the value of the two screens adopting it today — so Inventory's adoption will
 * have to either move 2px or argue for a denser variant. That is a decision for
 * the screen that owns it, made in the open, not a number averaged away now.
 *
 * ⚠⚠ SO WHY STYLES AND NOT A `<TRow>` WRAPPER? Because the INTERACTION does not
 * converge at all. Vendor's row is a checkbox in group-select mode and a button
 * outside it, with a long-press that begins the group. Crafting's is a plain
 * button. Inventory's varies by section. Some rows are not pressable at all and
 * render as a bare `View`. A component owning the container would have to plumb
 * every one of those contracts through props, and would either lose behaviour or
 * become a worse version of `TouchableOpacity`.
 * The shared thing is the MATERIAL. That is what this exports.
 *
 * ⚠ THE GOLD IN `rowSelected` STAYS. VIS-3 reserves gold for a live obligation
 * or a live process — and the row the player is acting on right now is exactly
 * that. It is also what three screens already shipped; this changes no pixels. */
/* ⚠⚠⚠ TMODAL — THE SHELL ELEVEN DIALOGS HAND-COPIED, AND WHY IT IS STYLES.
 *
 * Tier 0. Thirty-three modal files. Measured before writing anything, and they
 * fall into two lineages that even NAME their scrim differently:
 *
 *   FAMILY A  `scrim`     ground #13110f · rim #c9a86a          9 files
 *   FAMILY B  `backdrop`  ground #17150f · rim varies           9 files
 *   neither   no bordered card at all (pickers, forms)          5 files
 *   + `BrandedModal` and the five dialogs that already use it
 *
 * ⚠⚠ AND FAMILY A IS `BrandedModal`'S OWN CARD, COPIED BY HAND. Byte for byte:
 *     width '100%' · maxWidth 380 · #13110f · #c9a86a 1 · radius 4 · padding 14
 * Files re-typed a shell that already existed, which is exactly what this
 * rollout is for.
 *
 * ⚠ THE CENSUS IS A PREDICATE, NOT A NUMBER I REMEMBER — a file that declares
 * its own scrim/backdrop AND a card in #13110f rimmed #c9a86a. It counted 11
 * before this pass and counts 9 after, because the two adopters below are the
 * two it no longer matches. The suite runs the same predicate and NAMES the
 * remaining nine, so the sweep that finishes them cannot quietly grow instead.
 *
 * ⚠ `HookContinueModal` differs in TWO things, not the one I first reported: its
 * `maxWidth` is 420, AND its card carries no `maxHeight` at all. See the note in
 * that file — the second difference is why adoption there is not free.
 *
 * ⚠⚠⚠ STYLES, NOT A COMPONENT — AND THE REASON IS `BrandedModal` ITSELF.
 * A `<TModal>` owning the container would have to own the PRESENTATION mechanic
 * too, and that is not cosmetic here: arb73 records that iPad/iOS can present a
 * native `<Modal>` INVISIBLY — rendering nothing while its backdrop still eats
 * touches — which both hid a popup and blocked the buttons under it. So
 * `BrandedModal` chooses between a native `<Modal>` and an in-tree absolute
 * overlay, per call site. A primitive that swallowed that choice would be
 * re-fighting a shipped device bug for the sake of tidiness.
 * What every one of them agrees on is the MATERIAL. That is what this exports.
 *
 * ⚠ WIDTH IS A PARAMETER, NOT A VARIANT SET. The measured values are 380, 400,
 * 420 and 440 — four numbers with no shared vocabulary behind them, and
 * inventing `compact/regular/wide` would be naming a decision nobody has made.
 * The default is 380 because that is `BrandedModal`'s, which is the widest-used.
 *
 * ⚠⚠ THE CARD CAPS ITS OWN HEIGHT, SO A SCROLLING CHILD MUST BE ALLOWED TO
 * SHRINK. `maxHeight: '85%'` is not decoration — it is what keeps the scrim, and
 * with it the tap-outside escape, reachable (OTA-1614). But RN views do not
 * shrink by default, so a card that stops growing while its ScrollView does not
 * give way pushes the button row out of the bottom instead. Any adopter with a
 * scrolling middle needs `flexShrink: 1, flexGrow: 0` on it. `BrandedModal`
 * already shipped that; `HookContinueModal` gained it on adoption.
 *
 * ⚠ FAMILY B AND THE SEMANTIC RIMS ARE NOT SWEPT IN. `MissionComplete` rims in
 * a green and `FusionPicker` in a slate — those are a SUCCESS and a CATEGORY,
 * not accents, and the owner's amendment is explicit that semantic colour stays.
 * Family B's darker ground is a real second lineage and merging it is a decision
 * for the modal sweep, not a side effect of extracting Family A.
 * ⚠⚠ AND THOSE THREE HEXES ARE DELIBERATELY NOT WRITTEN HERE. OTA-1757's gate
 * asserts the semantic authorities' colours appear NOWHERE in this file, and it
 * is right to: a kit that names a foreign palette in a comment is one careless
 * copy-paste from owning it. Naming them by role says the same thing and cannot
 * be pasted into a style. This comment failed that gate on its first draft. */
export function tModalCard(maxWidth = 380): StyleProp<ViewStyle> {
  /* ⚠⚠⚠ PHASE 2 — A BOARD IS ABOVE THE GAME, AND UNTIL NOW IT DID NOT SAY SO.
   * `modalCard` was a fill, a 1dp rim and a radius — the same construction as a
   * panel the player cannot touch. Nine dialogs inherited that, and the owner's
   * hierarchy puts them at the TOP of the stack, not level with a frame.
   * `boardLift` is shadow + elevation, both of which are paint rather than
   * layout, so every one of those nine keeps its exact geometry. */
  return [kit.modalCard, kit.boardLift, { maxWidth }];
}

/**
 * ⚠⚠⚠ THE MOMENT CARD — FAMILY B, NAMED AND GOVERNED RATHER THAN MERGED.
 *
 * OTA-1765 measured a SECOND modal lineage and refused to sweep it: a deeper
 * backdrop and a warmer ground, on the beats rather than the dialogs. OTA-1774
 * then found the owner's "the other seven take the standard shell" ruling could
 * not be executed literally, because five of the seven are this lineage and
 * forcing them onto Family A would restyle five beats in four visible properties
 * at once. The owner ruled, and the sentence is the one this helper exists for:
 *
 *     *"Name and govern Family B as a legitimate second shell. Do not force
 *     those five experiential beats onto Family A and restyle them merely for
 *     uniformity. The kit governs interface, not world expression."*
 *
 * So there are two shells, deliberately, and they are not variants of one thing:
 *   FAMILY A `tModalCard` — a DIALOG. You are being asked something.
 *     scrim 0.70 · ground #13110f · radius 4 · padding 14 · width 380–420
 *   FAMILY B `tMomentCard` — a BEAT. Something happened to you.
 *     scrim 0.78 · ground #17150f · radius 6 · padding 20 · width 440
 * The deeper scrim and the warmer, rounder, roomier card are the difference
 * between a quantity picker and a mission ending, and that difference is the
 * product rather than debt.
 *
 * ⚠⚠ THE RIM IS A PARAMETER, AND THAT IS NOT COSMETIC. Five of the six measured
 * cards are byte-identical; `MissionCompleteModal` differs in exactly one
 * property — it rims in the success green and swaps to the brand gold for its
 * victory escalation. That is SEMANTIC colour, which the owner's amendment
 * reserves, so a card that hard-coded the gold could not have taken it and a
 * sweep that normalised it would have deleted a meaning. Defaulting to `T.gold`
 * keeps every other adopter's call site free of an argument.
 *
 * ⚠ AND THE SCRIM IS DELIBERATELY NOT BUNDLED IN — see `momentScrim` below.
 * Three of the six pad and centre their backdrop and three do not, which is a
 * real visible difference and not this helper's business to settle.
 */
export function tMomentCard(rim: string = T.gold): StyleProp<ViewStyle> {
  /* ⚠ PHASE 2 — the moment shells lift too, for the same reason and by the same
   * paint-only means. The rim stays the caller's: elevation is not meaning. */
  return [kit.momentCard, kit.boardLift, { borderColor: rim }];
}

export interface TRowState {
  /** De-emphasised but still usable — a recipe you have not unlocked. */
  muted?: boolean;
  /** You cannot have this: too poor, or its materials already spent. */
  blocked?: boolean;
  /** The row the player is acting on right now. Gold rim, warm ground. */
  selected?: boolean;
}

/**
 * The row chassis, plus whichever states apply.
 *
 * ⚠ The two opacity states come first and compose so the harsher one wins. They
 * touch no property `selected` touches, so a blocked row still shows it is
 * selected — which is what Crafting already draws, and why the shipped order
 * there (blocked AFTER selected) and this one paint the same thing.
 *
 * ⚠⚠⚠ THE VOCABULARY STOPS AT THREE, AND THAT IS A FINDING RATHER THAN A GAP.
 * Inventory carries two MORE row states and both were going to be imported here
 * until this file's own palette rule refused them:
 *
 *     rowHighlighted  #d8b46a   chroma 110   OTA-684, the deep-link flash
 *     rowSelected     #9c8348   chroma  84   OTA-1097, the reserved tick
 *
 * The kit permits a warm neutral up to chroma 58; the brand gold (95) is past
 * that and is exempt BY NAME. These two are not the brand gold — they are a
 * brighter gold and a darker one — so Inventory has quietly invented two
 * off-brand golds for row states, and `check:gold` cannot see either because it
 * counts `#c9a86a` alone. Under the owner's ruling that gold is reserved for a
 * meaning already defined, that is a question, not a colour to copy across.
 * It belongs to Inventory's own adoption pass, argued in the open.
 *
 * ⚠⚠ AND THE ORDER THOSE TWO WOULD NEED IS ALREADY KNOWN, because the first
 * draft of this helper got it wrong. I ordered by guessed loudness. Inventory
 * ships `[row, highlighted, reserved, grouped]` and says why — OTA-1100: "group
 * membership outranks it visually: while a group is open, that is the question
 * the screen is asking." Last wins, so the real precedence is the reverse of my
 * guess: selected > reserved > flash. Written down here so the next pass
 * inherits the ruling instead of re-deriving it wrong.
 */
/* ⚠⚠⚠ OTA-1782 — ONE GOVERNED CONTROL-DEPTH LANGUAGE.
 *
 * Owner: *"This should be ONE governed control-depth language. Do not
 * independently style individual buttons. Trace the existing control
 * primitives/families first and identify the smallest shared implementation
 * point capable of giving filled, semantic-outline and neutral-outline controls
 * the same physical construction WITHOUT changing their semantic colors."*
 *
 * ⚠ THE LANGUAGE IS THREE THINGS AND NOTHING ELSE:
 *     1. the upper edge catches light            (`T.controlLit`)
 *     2. the lower edge falls into shadow        (`T.controlDark`)
 *     3. on press the two swap and the face settles `SETTLE_DP` toward the
 *        interface plane
 * No gradient, no texture, no gloss, no bevel, no elevation, no drop shadow, no
 * face shading, and — the part that matters most — no second effect for a
 * second colour. Every one of those is on the owner's do-not list, and the
 * whole construction is two border colours and one translate.
 *
 * ⚠⚠ IT IS ADDITIVE, WHICH IS WHAT KEEPS DEPTH ORTHOGONAL TO MEANING. A control
 * already carries `borderWidth: 1` and a semantic `borderColor`. This overrides
 * the TOP and BOTTOM colours of that same ring and leaves left and right alone,
 * so the semantic hue still rings the control and the depth rides on it. Apply
 * it AFTER the tone style; never before, or the tone's `borderColor` would win.
 *
 * ⚠⚠ AN INERT CONTROL SIMPLY DOES NOT GET IT. Owner: *"DISABLED / INERT must
 * not falsely advertise the same physical readiness."* There is no third
 * variant here and there must not be: a control that is not pressable is one
 * that never calls this, so its ring stays flat and even on all four sides.
 * That is the absence of a claim rather than a new claim, which is the only
 * honest way to say "this one does not move".
 *
 * ⚠ THE ANCESTOR. `TButton` has had exactly this construction since VIS-1 — a
 * lit top edge, a dark bottom edge and a 1.5dp press depression — and it was
 * the only control in the game that did. This names it, widens it to work on a
 * light fill, and hands it to everything else. The combat chips are the first
 * adopters because they are what the owner is looking at.
 */
export function tControlDepth(pressed = false): StyleProp<ViewStyle> {
  return pressed ? kit.controlPressed : kit.controlResting;
}

/* ⚠⚠ OTA-1791 — THE FILLED-GOLD PRIMARY, AND THERE IS NOW ONE OF IT.
 *
 * Owner, approving control-depth batch 2: *"do not paint ten hand-copied
 * implementations independently … Treat that duplication as the architectural
 * problem it is. Trace ownership and consolidate the repeated filled-gold
 * primary control into the smallest appropriate existing kit/control
 * primitive. Then let those consumers receive the same governed depth
 * construction through that authority."*
 *
 * The control was one four-line rule — the brand gold as fill AND ring, with
 * ink lettering — written by hand into ten modal files (Approach, Branded,
 * BugReport, CraftRefusal, CraftResult, Feedback, HookContinue,
 * InvitePlaytester, Search, WhisperComplete). Ten copies is ten places to
 * drift, and OTA-1782 could prove the pill's depth by arithmetic but not paint
 * it, because there was no one place to paint. This is that place.
 *
 * ⚠ SMALLEST PRIMITIVE, NOT A NEW COMPONENT. `TButton` is a different control —
 * flanks, a lit top strip, its own geometry — and the ruling preserves each
 * modal's layout exactly. So this is a STYLE HELPER in the TRow/TModal sense:
 * the fill and ring from `T.gold`, plus `tControlDepth` riding on top, and each
 * consumer keeps its own `btn` chassis (padding, radius, width) untouched.
 *
 * ⚠ `pressed` IS THE PARAMETER, and `null` is the inert control: a disabled
 * pill keeps the fill and is handed NO depth, which is OTA-1782's rule — an
 * inert control does not advertise readiness. Consumers say `tFilledGold(null)`
 * for that state rather than composing the fill themselves.
 *
 * ⚠ WHAT THIS DOES NOT TAKE, SAID PLAINLY: four more files declare a style of
 * the same NAME and are not this control — Ending's dark plate, CraftQuantity's
 * sage outline, DifficultyCustom's dark fill on a gold ring, and
 * MissionEncounterCard's bright frame gold. They keep their own; the suite
 * names them so the boundary is a claim, not an omission. The pills' ink
 * lettering stays local too: it is the one colour all ten agree on and the one
 * this helper does not own, because a ViewStyle cannot carry a Text colour. */
export function tFilledGold(pressed: boolean | null = false): StyleProp<ViewStyle> {
  return pressed === null ? kit.filledGold : [kit.filledGold, tControlDepth(pressed)];
}

/* ⚠⚠⚠ THE PANEL FRAME — A SECOND LANGUAGE, AND IT MUST NEVER MERGE WITH THE
 * FIRST. `tControlDepth` says THIS CAN BE PRESSED. The panel frame says THIS IS
 * ONE REGION OF THE HUD. A panel is read, a control is touched, and the two
 * cues answer different questions — a panel wearing the button language
 * promises a press that never comes, and a button wearing this ornament buries
 * the one cue a thumb needs. The suite asserts neither leaks into the other.
 *
 * ⚠⚠ IT IS A STYLESHEET ENTRY, NOT A HELPER, AND THAT IS THIS FILE'S OWN RULE:
 * *"A HELPER exists only where something VARIES — a constant that never varies
 * is a stylesheet entry, not an export."* The frame takes no argument and has
 * no states, so it reaches its consumers through `tartariaKitStyles.panelFrame`
 * and the export budget does not move. The first draft of this pass shipped it
 * as `tPanelFrame()` and `check:kitexports` was right to refuse it.
 *
 * ⚠⚠⚠ AND THE CORNERS ARE `TCorners`, WHICH ALREADY EXISTED. That draft also
 * added a `TPanelCorners` — an absolute-fill, `pointerEvents="none"` layer with
 * four corner marks and a gold `rgba(201,168,106,…)`. That is `TCorners lit`,
 * line for line, including the gold: `cornerLit` has shipped at
 * `rgba(201,168,106,0.55)` since VIS-1. Two components for one shape is the
 * exact drift the budget exists to catch, and it caught it.
 *
 * ⚠ IT IS AN EDGE TREATMENT, NOT A CONTAINER: a rim colour, a rim width and a
 * radius. No padding, no margin, no background, no width, no height, no shadow
 * and no Android elevation (which draws a halo on all four sides — the defect
 * the dossier construction refused). Owning nothing is what lets it ride on
 * panels that already have their own geometry without moving anything. */
export function tRowStyle(state: TRowState = {}): StyleProp<ViewStyle> {
  return [
    kit.rowChassis,
    state.muted && kit.rowMuted,
    state.blocked && kit.rowBlocked,
    state.selected && kit.rowSelected,
  ];
}

const kit = StyleSheet.create({
  // ── TRow ──────────────────────────────────────────────────────────────────
  // ⚠ The shipped values. `#13110f` is the game's list ground in seven screens
  // and was never named; `marginBottom: 6` is Vendor's and Crafting's, against
  // Inventory's 4 — the one number the three did not agree on.
  /* ⚠ OTA-1782 — the resting and pressed halves of the control-depth language.
   * `borderTopColor`/`borderBottomColor` override two sides of a ring the tone
   * already coloured; there is no `borderWidth` here because every control in
   * the family already has one, and setting it would be this style deciding a
   * control's weight rather than its depth. */
  /* ⚠ THE PANEL FRAME'S OWN STYLES. A rim colour, a rim width, a radius — and
   * nothing else, so the treatment can ride on a panel that already owns its
   * geometry. See `tPanelFrame`. */
  panelFrame: { borderWidth: 1, borderColor: T.panelRim, borderRadius: 3 },
  /* ⚠⚠⚠ VISUAL LANGUAGE PHASE 1 — THE SECOND PLANE'S STYLES, AND THEY ARE
   * STYLESHEET ENTRIES BY OWNER RULING, NOT EXPORTS. The kit sits at 13/13
   * components, 10/10 helpers and 23/23 total; the owner's ruling on the Phase-1
   * map is explicit — *"Use central StyleSheet entries for the sidewall/recess
   * material without introducing a new exported helper/component… Do not spend
   * that API budget during the physical-specimen phase."* So they reach their
   * consumers through `tartariaKitStyles`, exactly as `panelFrame` does, and
   * `check:kitexports` does not move. If game-wide propagation later proves these
   * need to be first-class primitives, that is a separate owner decision.
   *
   * ⚠⚠ EVERY ONE OF THESE IS DRAWN BY AN ABSOLUTELY POSITIONED CHILD WITH
   * `pointerEvents="none"`. That is the whole reason the construction is legal
   * under the 320×568 contract: an absolute child takes part in no layout, so a
   * control wearing a sidewall is the same height, the same width and the same
   * touch target as one without. No padding, no margin, no minHeight, no
   * wrapper, no `elevation`, no shadow.
   *
   * ⚠ THE RADII ARE NOT DECORATION. Most hosts (`quick`, `placeChip`,
   * StatsPanel's card) already clip with `overflow: 'hidden'`, where these are a
   * no-op. `objectiveChip` does not, and a square band would poke past its
   * rounded corner. 3 against the hosts' 4 keeps the band just inside the curve
   * either way, and it costs nothing on the hosts that clip. */
  /** The face's own catch of light, just inside a pressable control's lit rim. */
  /* ⚠⚠ PHASE 3 — 1dp → 2dp. A hairline is an EDGE; a 2dp band is the top
   * PLANE of a key seen slightly from above, which is what lets the face read as
   * sitting above its mounting surface. Still absolute, still zero layout. */
  controlPlaneTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    backgroundColor: T.controlFaceLit, borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  /* ⚠⚠ PHASE 2 — THE SIDEWALL GOES TO 3dp AND STOPS TOUCHING THE GROUND.
   * At 2dp, flush against the rim, the side and the shadow under it were the
   * same line, and one line is an edge no matter how dark it is. Lifting it 1dp
   * off the bottom leaves room for `controlPlaneContact` underneath, so the key
   * now has a SIDE and, below that, the dark where it MEETS the surface — which
   * is the difference between a drawn rectangle and an object standing on
   * something. Still absolute, still zero layout. */
  /* ⚠⚠⚠ PHASE 3 — 3dp → 4dp. With the 1dp contact beneath it the visible
   * stack goes 5dp → 6dp, about a fifth more apparent height, which is the
   * owner's *"15–20% more PERCEIVED ELEVATION"* and no more. A LOW-PROFILE
   * industrial key mounted on a panel — not an arcade button. */
  controlPlaneBottom: {
    position: 'absolute', bottom: 1, left: 0, right: 0, height: 4,
    backgroundColor: T.controlSidewall,
  },
  /** The contact shadow: the near-black hairline where the key meets its
   *  housing. The third plane, and the one that makes the other two read. */
  controlPlaneContact: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
    backgroundColor: T.controlContact, borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
  },
  /* ⚠⚠ PRESSED IS THE OBJECT GOING IN, SO THE SIDE CHANGES SIDES. Push a key into
   * its housing and the face you were looking down at tips away: the shaded side
   * is now ABOVE the face and the light catches BELOW it. That is the same
   * inversion `controlPressed` already performs on the ring, applied to the
   * planes, so the two layers agree instead of contradicting each other. The
   * 1.5dp travel is unchanged and still lives on the ring, where it always has. */
  /* ⚠⚠⚠ PHASE 2 — PRESSED IS THE KEY GOING DOWN INTO ITS HOUSING, AND IT IS
   * NOW A GEOMETRY CHANGE RATHER THAN A COLOUR SWAP. Owner: *"reduce apparent
   * height; compress/remove some lower sidewall; move the face toward the
   * substrate; reduce contact shadow… Opacity-only press feedback is
   * insufficient."* So on press the sidewall COLLAPSES from 3dp to 1dp, the
   * contact band is not drawn at all, the shaded side moves ABOVE the face, and
   * the whole control travels 2dp (up from 1.5). The key visibly loses height. */
  controlPlaneTopPressed: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    backgroundColor: T.controlSidewall, borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  controlPlaneBottomPressed: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
    backgroundColor: T.controlFaceLit, borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
  },
  /* ⚠⚠ CHASSIS WEIGHT — HALF THE VALUE, HALF THE SIDEWALL, AND NO PRESSED PAIR.
   * A card is a thing you open, not a thing you strike. It gets the affordance
   * (you can touch this) without the protrusion (strike this), and it does not
   * invert on press because a card does not travel — its own `activeOpacity`
   * already answers the touch. Keeping the pressed pair off the chassis is what
   * stops "interactive chassis" quietly becoming a second command family. */
  chassisPlaneTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: T.chassisFaceLit, borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  /* ⚠ PHASE 2 — the chassis gets the same three-plane construction at its own
   * weight: a 2dp side (against a command's 3dp) lifted off a 1dp contact. A
   * card now visibly RESTS on the panel; it still does not read as a key, which
   * is the boundary the whole family split exists to hold. */
  chassisPlaneBottom: {
    position: 'absolute', bottom: 1, left: 0, right: 0, height: 3,
    backgroundColor: T.chassisSidewall,
  },
  chassisPlaneContact: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
    backgroundColor: T.chassisContact, borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
  },
  /* ⚠⚠⚠ PHASE 2 — THE BOARD LIFT, and it owns NO layout: `shadow*` and
   * `elevation` are both paint, so a dialog wearing this is the same size it
   * was. iOS reads the shadow, Android reads the elevation, and on a full-width
   * board a four-sided halo is the CORRECT description of the object. */
  boardLift: {
    shadowColor: T.boardShadow,
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
  },
  /* ⚠⚠⚠ THE RECESS MATERIAL. Ground and ring only — NO geometry, for the same
   * reason `panelFrame` owns none: it has to ride on two fields that already own
   * their own padding, radius, height and flex, and it must not move either of
   * them. `glass` is the darkest plane in the material family on any player-tuned
   * background; the inverted edges make it a hole rather than a dark plate.
   *
   * ⚠ IT MUST NOT CARRY `overflow: 'hidden'`. InputBox's tutorial pulse is an
   * absolute overlay at top/left/right/bottom: -1 — it reaches back OVER the
   * border on purpose — and clipping the wrap would silently delete the one cue
   * the name and rope beats depend on. */
  recess: {
    backgroundColor: T.glass,
    borderColor: T.glassRim,
    borderTopColor: T.recessTop,
    borderBottomColor: T.recessLip,
  },
  controlResting: { borderTopColor: T.controlRaisedLit, borderBottomColor: T.controlRaisedDark },
  /* ⚠ OTA-1791 — the filled-gold primary's material: the brand gold as fill AND
   * ring. No `borderWidth` here for the same reason as the depth pair above —
   * every pill already has one in its own chassis. See `tFilledGold`. */
  filledGold: { backgroundColor: T.gold, borderColor: T.gold },
  /* ⚠⚠⚠ PHASE 3 — THE ONE CONTROL MATERIAL, AND WHY IT OWNS NO GEOMETRY.
   * The census found a DEPRECATED DIALECT on 79 interactive styles across 41
   * files: a 1dp literal-gold outline, radius 4, a cold blue-grey label, and
   * selection expressed by swapping the rim to gold and flooding the body with
   * a brown fill. That is a second control language, and the owner has ruled it
   * dead: *"Kill the FAMILY, not the three specimens."*
   *
   * ⚠⚠ IT IS MATERIAL ONLY — no padding, no flex, no width, no alignment. Every
   * one of those controls already owns its own geometry, and the migration must
   * not move a single box: the local style keeps its padding and layout, `ctl`
   * supplies the face, the rim and the directional pair. That division is what
   * lets 79 call sites adopt one language without a layout audit each.
   *
   * ⚠ AND IT IS NOT A NEW EXPORT. Same route `panelFrame` and the planes take —
   * a `tartariaKitStyles` entry — so the budget stays 13/13 · 10/10 · 23/23. */
  ctl: {
    backgroundColor: T.face,
    borderWidth: 1,
    borderColor: T.rim,
    borderRadius: 4,
    borderTopColor: T.controlRaisedLit,
    borderBottomColor: T.controlRaisedDark,
  },
  /* ⚠⚠⚠ SELECTED IS THE SAME OBJECT, MARKED — NOT A DIFFERENT OBJECT. The
   * deprecated dialect REPLACED the control when it was chosen: a cold outlined
   * tile became a filled slab, so MALE and FEMALE read as two different species
   * of thing. Owner: *"A selected choice must remain recognizably the same
   * physical object it was before selection."*
   *
   * ⚠⚠ SO ONLY THE RIM AND THE FACE MOVE. Gold takes the left and right edges;
   * the face lifts one step. Top and bottom stay on the SAME directional pair
   * as an unselected control — RN resolves `borderTopColor` over the blanket
   * `borderColor` — so the lit-above/dark-below construction, the three planes
   * and the press travel all survive being chosen. Semantic state is a layer ON
   * the physical control, never a replacement for it. */
  ctlOn: {
    borderColor: T.gold,
    borderTopColor: T.controlRaisedLit,
    borderBottomColor: T.controlRaisedDark,
    backgroundColor: T.faceLit,
  },
  /** Unavailable: the whole object dims. It keeps its construction, because a
   *  dead control is still the same key — it just cannot be struck. */
  ctlDead: { opacity: 0.38 },
  /* ⚠⚠ PRESSED IS THE LIGHT MOVING, NOT A NEW COLOUR. The catch of light goes
   * to the bottom edge and the shadow to the top — which is what an object
   * pushed INTO a surface actually looks like — and the face travels 1.5dp
   * down, the same distance `TButton` has settled since VIS-1. */
  controlPressed: {
    borderTopColor: T.controlRaisedDark,
    borderBottomColor: T.controlRaisedLit,
    /* ⚠ PHASE 2 — 1.5 → 2. The travel is the one cue that survives being looked
     * at from a distance, and 1.5dp was inside the noise on a dense row. Still a
     * transform, so no sibling reflows and the touch target does not move. */
    transform: [{ translateY: 3 }],
  },
  rowChassis: {
    flexDirection: 'row',
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 6,
    overflow: 'hidden',
  },
  rowMuted: { opacity: 0.6 },
  rowBlocked: { opacity: 0.45 },
  // Byte-identical in rowGrouped / offerRowPicked / recipeRowPicked.
  rowSelected: { borderColor: T.gold, backgroundColor: '#1e1a12' },
  // ── TModal ────────────────────────────────────────────────────────────────
  // ⚠ The shipped values — `BrandedModal`'s scrim and card, which nine other
  // dialogs re-typed by hand.
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    // ⚠ OTA-1614 — never taller than the screen, so the scrim (and with it the
    // tap-outside escape) always stays reachable.
    maxHeight: '85%',
    backgroundColor: '#13110f',
    borderColor: T.gold,
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  // ── TMoment (Family B) ────────────────────────────────────────────────────
  /* ⚠⚠⚠ THE SECOND SHELL, NAMED ON AN OWNER RULING — see `tMomentCard` above.
   * These are the shipped values, measured brace-balanced across all six files
   * before a line was written.
   *
   * ⚠⚠ THE CARD AGREED AND THE SCRIM DID NOT, WHICH IS WHY THEY ARE SEPARATE.
   * Five of six cards are byte-identical (the sixth differs only in its semantic
   * rim, which is the parameter). The BACKDROPS split three and three:
   *     CombatPrimer · MissionComplete · MissionStinger
   *         flex 1 · 0.78 · alignItems center · justifyContent center · padding 24
   *     DogOnboarding · GolemNaming · WandererEncounter
   *         flex 1 · 0.78 · justifyContent center          ← no centring, no gutter
   * That is not a formatting difference. Without `alignItems: 'center'` a card
   * declaring `width: '100%'` with a 440 cap sits at the START of the cross axis
   * rather than centred, and without `padding: 24` it runs to the bezel on any
   * screen narrower than 440 — which is every phone this game ships on. So three
   * moment cards are full-bleed and three have a 24pt gutter.
   *
   * ⚠ `momentScrim` IS THEREFORE THE PADDED, CENTRED ONE, and only the three
   * that already draw it adopt here. Moving the other three would be a visible
   * change to three beats on my own judgement, which is the thing the ruling
   * above explicitly forbids. Reported, not fixed: HOLD 6. */
  momentScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  /** ⚠ The rim is NOT here — it is `tMomentCard`'s parameter, so a card can keep
   *  a semantic rim (MissionComplete's success green) without a second style. */
  momentCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#17150f',
    borderWidth: 1,
    borderRadius: 6,
    padding: 20,
  },
  // ── TSheet ────────────────────────────────────────────────────────────────
  /* ⚠⚠⚠ TSHEET — AND THE MEASUREMENT FOUND TWO PATTERNS, NOT THE ONE THE PLAN
   * NAMED. Tier 0's last primitive. The rollout described it as "the
   * bottom-anchored conversational pattern"; five files carry a sheet and they
   * split cleanly down the middle into two things that are not variants of each
   * other:
   *
   *   THE INLINE CARD        ParleySheet · PayoffSheet · PickpocketSheet
   *     A plain `<View>` the parent renders in place. No Modal, no backdrop, no
   *     visibility prop. `#13110f` on `#3a342c` 1, radius 6, padding 14, gap 8 —
   *     BYTE-IDENTICAL in all three files.
   *
   *   THE CONVERSATION OVERLAY   TalkSheet · WhisperTalkSheet (twice)
   *     `<Modal transparent>` → a 78%-black backdrop → a 92%-height panel framed
   *     in `#f0c96a` at 2px. Also byte-identical, across three call sites.
   *
   * ⚠ AND THE PLAN'S DESCRIPTION IS OUT OF DATE, WHICH IS WORTH RECORDING RATHER
   * THAN QUIETLY MATCHING. `TalkSheet`'s own comment: "Was 88% welded to the
   * bottom. Slightly shorter now that it floats." It is CENTRED, not
   * bottom-anchored. A primitive built to the plan's words would have re-welded
   * it to an edge it deliberately left.
   *
   * ⚠⚠ NOT `TPanel`, AND THAT WAS CHECKED BEFORE ANY OF THIS WAS WRITTEN. The
   * obvious move is "the inline card is just a panel" — it is not. `TPanel` is a
   * three-layer depth construction (outer shadow, a rim with a lit top and a
   * dark bottom, a face). The sheet card is FLAT: one border, one fill. Adopting
   * TPanel there would change how those three sheets look, which is a redesign
   * wearing an extraction's clothes.
   *
   * ⚠⚠⚠ STYLES AGAIN, AND THIS TIME IT COSTS NOTHING AT ALL. The presentation is
   * per-call-site — the overlay's three sites pass different `animationType` and
   * different `onRequestClose`, and the inline card has no presentation to own —
   * so what converges is the MATERIAL, exactly as with `TRow` and `TModal`.
   * Neither shape takes a parameter or a state, so unlike `tRowStyle` and
   * `tModalCard` there is no helper to export: these are stylesheet entries
   * reachable through `tartariaKitStyles`, and Tier 0's last primitive adds ZERO
   * exports and moves no ceiling.
   *
   * ⚠⚠⚠ AND THE OVERLAY'S PANEL WAS HELD FOR AN OWNER RULING RATHER THAN
   * SMUGGLED IN — OTA-1769. The history is kept because the process is the point:
   * the conversation frame is a brighter gold than the brand gold, and this
   * file's OWN palette rule refused it (warm-ordered or near-neutral AND under a
   * hard chroma ceiling of 60; the frame is warm-ordered but its chroma is 134,
   * where the brand gold's 95 passes only by being exempt BY NAME). Admitting it
   * meant adding a second name to that list, which is a ruling about what counts
   * as a semantic authority rather than a refactor — and OTA-1759 had already set
   * the precedent by REFUSING two off-brand golds instead of exempting them
   * quietly. So the scrim and the header were extracted and the framed panel
   * stayed local, pixels untouched, until the owner ruled.
   *
   * ⚠⚠ THE RULING LANDED — OTA-1773, APPROVED, and it names what has to survive:
   *     *"the outer frame is deliberately visually louder/brighter than the gold
   *     hierarchy inside the conversation sheet"* … *"do not normalize it to
   *     standard T.gold and destroy that hierarchy"* … *"implement this through
   *     the named semantic/palette mechanism rather than creating an ungoverned
   *     exception."*
   * So the colour is `T.goldFrame` — named in the palette, exempt BY NAME in the
   * gate exactly like the brand gold, and the panel comes in here. Not one pixel
   * moves: the value below is byte-for-byte what both files already drew. What
   * changed is that a second bright gold now has an address and a reason instead
   * of being two literals nobody could account for.
   *
   * ⚠⚠ AND THE RULING IS NARROWER THAN THE HEX, WHICH THIS PASS FOUND THE HARD
   * WAY — its own test asserted the two files no longer contain the value at all
   * and went red, correctly. `WhisperTalkSheet` paints the SAME value a second
   * time as the FILLED background of its deciding bar, beside a third gold
   * brighter still. That is INSIDE the sheet and it is a fill rather than a rim,
   * so the ruling — which is about the OUTER FRAME — does not reach it.
   * Repointing it at `goldFrame` would be inventing an authority nobody granted,
   * so it stays a local literal and stays on the queue. Pinned in ota1773's
   * suite, so the next pass reads it rather than rediscovering it. */
  /** The conversation overlay's framed panel. Byte-identical in `TalkSheet` and
   *  in both of `WhisperTalkSheet`'s call sites. The frame is `T.goldFrame` and
   *  must stay LOUDER than every gold inside the sheet — that hierarchy is the
   *  reason the colour exists (OTA-1096, ruled again in OTA-1773). */
  sheetPanel: {
    height: '92%',
    backgroundColor: '#13110f',
    borderColor: T.goldFrame,
    borderWidth: 2,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  sheetCard: {
    backgroundColor: '#13110f',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    gap: 8,
  },
  sheetScrim: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 22,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  /** The header row all five sheets share, byte for byte. */
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // ── TTabBar ───────────────────────────────────────────────────────────────
  // ⚠ The shipped values. Crafting, Guidance and Vendor agree on the chip byte
  // for byte; the row differs only in bottom margin (10 against Vendor's 8).
  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  tabRowTight: { marginBottom: 8 },
  tabChip: {
    flex: 1,
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  // ⚠⚠ THE ONE THING THAT MOVES IN THIS PASS. Vendor's shipped selected ground,
  // taken as-is so Vendor does not shift; Crafting's selected tab gains it.
  /* ⚠⚠⚠ PHASE 2 — THE ACTIVE TAB DOCKS INTO WHAT IT CONTROLS. Selected used to
   * be a colour: a gold ring and a lighter ground. Colour alone is exactly what
   * the owner ruled out — *"NO arbitrary color-only selected state. Selected
   * state must be physically legible."*
   *
   * ⚠⚠ SO THE GEOMETRY CARRIES IT. An engaged tab has no side and no shadow —
   * it is not standing proud of anything, it has been pushed home — and its
   * BOTTOM BORDER IS OPENED so the face is continuous downward into the region
   * below. `tabMouth` then continues the tab's own material 2dp PAST the row's
   * baseline, which is the docking tongue: the active tab's body crosses the
   * line the inactive ones stop at.
   *
   * ⚠ THE COLOUR STAYS TOO, because it was never wrong — it is just no longer
   * doing the work alone. Gold rim, lighter ground, AND a physically different
   * object. No glow, no underline as the primary cue. */
  tabChipOn: {
    borderColor: T.gold,
    backgroundColor: '#2a2520',
    borderBottomWidth: 0,
    // The 1dp the opened border gives back, so the row's height cannot move.
    paddingBottom: 9,
  },
  /** The docking tongue: the engaged tab's own material, carried below the row
   *  baseline. Absolute, so it costs nothing and cannot move a sibling. */
  tabMouth: {
    position: 'absolute', left: 1, right: 1, bottom: -2, height: 2,
    backgroundColor: '#2a2520',
  },
  /* ⚠⚠ AN INACTIVE TAB IS A RAISED MECHANICAL SELECTOR — the same three-plane
   * construction as a command key, at the command's own weight, because the
   * owner's new contract puts an inactive tab in the raised family: *"small
   * raised mechanical selector; clearly pressable; belongs to raised-control
   * family."* What keeps a tab from BEING a command is not a weaker plane — it
   * is that its engaged state docks instead of travelling. */
  tabPlaneTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
    backgroundColor: T.controlFaceLit, borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  tabPlaneBottom: {
    position: 'absolute', bottom: 1, left: 0, right: 0, height: 4,
    backgroundColor: T.controlSidewall,
  },
  tabPlaneContact: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
    backgroundColor: T.controlContact, borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
  },
  tabLabel: { color: '#a2977b', fontSize: 12, letterSpacing: 2, fontWeight: '700' },
  tabLabelOn: { color: T.gold },
  // ── TScreenHeader ─────────────────────────────────────────────────────────
  // ⚠ These are the shipped values, not new ones: the row, the back button and
  // its text are what twelve screens already agreed on.
  schRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 4 },
  schRowTight: { paddingVertical: 0, marginBottom: 8 },
  schBack: {
    backgroundColor: '#1a1714',
    borderColor: '#3a342c',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  schBackTight: { paddingHorizontal: 12, paddingVertical: 6 },
  schBackText: { color: T.gold, fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  // ⚠ A screen's own name is not a live obligation. Ink by default; see TScreenHeader.
  schTitle: { color: T.ink, fontSize: 14, letterSpacing: 4, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  schTitleGold: { color: T.gold },
  /** Reserves the back button's width so the title stays centred. */
  schSlot: { minWidth: 80, alignItems: 'flex-end' },
  // ornament
  ruleCut: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.55)' },
  ruleCutLit: { backgroundColor: 'rgba(0,0,0,0.65)' },
  ruleLight: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(214,190,140,0.13)' },
  ruleLightLit: { backgroundColor: 'rgba(201,168,106,0.34)' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 10 },
  dividerLine: { flex: 1 },
  dividerMark: { color: T.goldDim, fontSize: 8, opacity: 0.9 },
  dividerLabel: { color: T.inkQuiet, fontSize: 10, letterSpacing: 3, fontWeight: '700' },
  // ⚠ PHONE-FIX — registration marks are engraved into alloy, so they are a
  // cool near-white at low alpha rather than a warm bronze tick.
  corner: { position: 'absolute', width: 7, height: 7, borderColor: 'rgba(206,212,214,0.22)' },
  cornerLit: { position: 'absolute', width: 8, height: 8, borderColor: 'rgba(201,168,106,0.55)' },
  cornerTL: { top: 3, left: 3, borderTopWidth: 1, borderLeftWidth: 1 },
  cornerTR: { top: 3, right: 3, borderTopWidth: 1, borderRightWidth: 1 },
  cornerBL: { bottom: 3, left: 3, borderBottomWidth: 1, borderLeftWidth: 1 },
  cornerBR: { bottom: 3, right: 3, borderBottomWidth: 1, borderRightWidth: 1 },

  // panel
  panelOuter: {
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  panelOuterRaised: { shadowOpacity: 0.7, shadowRadius: 11, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  panelRim: {
    borderWidth: 1, borderColor: T.rim, borderRadius: 3,
    borderTopColor: 'rgba(122,102,64,0.75)', borderBottomColor: 'rgba(0,0,0,0.7)',
    backgroundColor: T.well, overflow: 'hidden',
  },
  panelRimRaised: { borderColor: T.rimLit, borderTopColor: 'rgba(201,168,106,0.85)', borderBottomColor: 'rgba(0,0,0,0.8)' },
  panelRimRecessed: { borderColor: 'rgba(58,52,44,0.75)', borderTopColor: 'rgba(0,0,0,0.5)', borderBottomColor: 'rgba(214,190,140,0.10)' },
  panelFace: { backgroundColor: T.face, borderTopWidth: 1, borderTopColor: T.edgeLit, borderBottomWidth: 1, borderBottomColor: T.edgeDark },
  panelFaceRaised: { backgroundColor: T.faceLit, borderTopColor: 'rgba(214,190,140,0.30)' },
  panelFaceRecessed: { backgroundColor: T.faceUtility, borderTopWidth: 0, borderBottomWidth: 0 },

  // ⚠⚠ VIS-3 — housing / inset surface. Note what is ABSENT: no shadow, no
  // elevation on either tone. The housing reads as raised because its face is
  // LIGHTER than the substrate and its top edge catches light; the inset reads
  // as cut in because its face is DARKER than everything touching it and the
  // light is on its BOTTOM edge, which is what a recess does. Two plane changes
  // for zero rendering cost — and no elevation means no Android all-round
  // shadow seam of the kind the owner photographed on the dossiers.
  surfRim: { borderWidth: 1, borderRadius: 2, overflow: 'hidden' },
  surfRimHousing: {
    borderColor: T.compositeRim,
    borderTopColor: 'rgba(150,156,160,0.34)',
    borderBottomColor: 'rgba(0,0,0,0.70)',
  },
  surfRimInset: {
    borderColor: T.glassRim,
    borderTopColor: 'rgba(0,0,0,0.80)',
    borderBottomColor: 'rgba(180,186,190,0.16)',
  },
  /* ⚠⚠ THE PADDINGS ARE A VERTICAL BUDGET, NOT A LOOK. A housing costs more
   * height than the single bordered strip it replaces — a rail, an engraved
   * split and a face where there used to be two lines of text in one box — and
   * on this screen the FEED is `flex: 1`, so every pixel the header takes comes
   * straight out of what the player can read. These numbers are the tightest
   * that still let the rail and the readout read as two separate registers;
   * the OTA-1746 suite computes the resulting delta from them and holds it. */
  surfRail: { paddingHorizontal: 9, paddingTop: 4, paddingBottom: 3, backgroundColor: 'rgba(26,25,24,0.90)' },
  surfFace: {},
  surfFaceHousing: { backgroundColor: T.composite, paddingHorizontal: 9, paddingVertical: 4 },
  surfFaceInset: { backgroundColor: T.glass, flex: 1 },
  /* ⚠ THE CHAMFER. A 20px square centred exactly on the top-right corner and
   * rotated 45°, so its BR→BL edge lands as a diagonal across the corner and
   * the rest is clipped by the rim's overflow. Filled near-black (the shadow
   * inside a cut) with a single lit hairline on that edge (the machined face
   * catching light). `pointerEvents="none"` — it must never eat a tap. */
  surfKey: {
    position: 'absolute', top: -10, right: -10, width: 20, height: 20,
    backgroundColor: 'rgba(4,4,5,0.94)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(150,156,160,0.45)',
    transform: [{ rotate: '45deg' }],
  },

  // button
  btnOuter: {
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 3, borderRadius: 3,
  },
  btnOuterPrimary: { shadowOpacity: 0.7, shadowRadius: 9, shadowOffset: { width: 0, height: 5 }, elevation: 7 },
  btnRim: {
    borderWidth: 1, borderColor: T.rim, borderRadius: 3,
    // ⚠ PHONE-FIX — alloy, not bronze. A subordinate control is machined metal
    // catching light; only the primary spends the gold.
    borderTopColor: 'rgba(140,146,150,0.55)', borderBottomColor: 'rgba(0,0,0,0.75)',
    backgroundColor: T.well, overflow: 'hidden',
  },
  btnRimPrimary: { borderWidth: 1, borderColor: T.rimLit, borderTopColor: T.gold, borderBottomColor: 'rgba(0,0,0,0.85)' },
  btnRimDestructive: { borderColor: T.rustRim, borderTopColor: 'rgba(224,122,95,0.55)' },
  /* ⚠⚠⚠ OTA-1782 — THE ANCESTOR JOINS THE LANGUAGE IT STARTED.
   * `btnFace` has carried a lit top edge and a dark bottom edge since VIS-1,
   * and until now it was the only control in the game that did. Owner: *"This
   * should be ONE governed control-depth language. Do not independently style
   * individual buttons."* Leaving TButton on `edgeLit`/`edgeDark` while the
   * chips took `controlLit`/`controlDark` would have been two languages that
   * merely agreed about direction — the same drift OTA-1781 had just finished
   * cleaning out of the weapon-name pairing.
   * ⚠ THE DELTA IS MEASURED AND IT IS ONE HAIRLINE. Over the primary face
   * (~#1c1814) the top edge composites #41392c under the old token and #433e37
   * under the new — about three levels of luminance, very slightly less warm,
   * on a 1dp line. Named here so it is a stated change rather than a silent
   * one; the device is the final authority, as always.
   * ⚠ PANELS ARE NOT CONTROLS AND KEEP THE OLD PAIR. `panelFace`/`panelRim`
   * still read `edgeLit`/`edgeDark`: a plate is the interface PLANE, and the
   * whole claim of this language is that a control sits proud OF that plane. If
   * both wore the same edges there would be nothing for a control to be proud
   * of. */
  /* ⚠⚠ PHASE 2 — THE ANCESTOR GETS THE STRONGER PAIR TOO. `btnFace` carried
   * `controlLit`/`controlDark` (0.20 / 0.45) — the INNER sheen, tuned when it was
   * the only face treatment in the game. Beside chips that now draw a 3dp side
   * and a contact band, the one control that was always the most physical had
   * become the least. It takes the raised pair its own rim proved, so the family
   * reads as one family. Geometry unchanged: two border colours, same widths. */
  btnFace: {
    backgroundColor: T.face, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: T.controlFaceLit, borderBottomWidth: 1, borderBottomColor: T.controlSidewall,
  },
  btnFacePrimary: { backgroundColor: 'rgba(46,37,27,0.94)', paddingVertical: 16 },
  btnFaceUtility: { backgroundColor: T.faceUtility, paddingVertical: 10, borderTopWidth: 0 },
  btnFaceDestructive: { backgroundColor: 'rgba(28,17,15,0.85)' },
  // ⚠ VIS-3 — a navigation key. Damaged coating, so it recedes behind whatever
  // it is bracketing instead of outshouting it.
  btnFaceCompact: { paddingVertical: 5, paddingHorizontal: 8, backgroundColor: T.coating, borderTopWidth: 0 },
  /** the light that catches the top of a primary plate */
  btnTopLight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(214,190,140,0.34)' },
  /* ⚠ OTA-1782 — pressed is the light MOVING, which is what `controlPressed`
   * says for every other control. This already darkened its top edge; it now
   * lifts the bottom one too, so the ancestor and the adopters invert the same
   * way. The face darkening is TButton's own and stays — it is a large primary
   * control and can afford the extra beat. */
  btnFacePressed: { backgroundColor: 'rgba(6,5,4,0.85)', borderTopColor: T.controlDark, borderBottomColor: T.controlLit },
  btnLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnFlank: { color: T.goldDim, fontSize: 8 },
  btnTextPrimary: { color: T.gold, fontSize: 13, letterSpacing: 3 },
  btnTextUtility: { color: T.inkDim, fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  // ⚠ inkDim, not inkQuiet: the sub-line sits on a plate that may be composited
  // over a LIGHT player background, where the quietest ink falls under 3:1.
  btnTextDestructive: { color: T.rust, letterSpacing: 2 },
  btnTextCompact: { fontSize: 10, letterSpacing: 1.8, fontWeight: '800', color: T.inkDim },
  btnSub: { color: T.inkDim, fontSize: 9, letterSpacing: 1, marginTop: 3 },
  disabled: { opacity: 0.5 },

  // resource chit
  chitOuter: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2, alignSelf: 'center' },
  chitRim: {
    borderWidth: 1, borderColor: 'rgba(122,102,64,0.6)', borderRadius: 2,
    borderTopColor: 'rgba(201,168,106,0.6)', borderBottomColor: 'rgba(0,0,0,0.7)', backgroundColor: T.well, overflow: 'hidden',
  },
  chitFace: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(24,19,15,0.86)',
    borderTopWidth: 1, borderTopColor: 'rgba(214,190,140,0.18)',
  },
  chitGlyph: { color: T.gold, fontSize: 11 },
  chitCount: { color: T.ink, fontSize: 13, fontWeight: '800' },
  chitSep: { width: 1, height: 10, backgroundColor: 'rgba(122,102,64,0.5)' },
  chitLabel: { color: T.inkDim, fontSize: 9, letterSpacing: 2, fontWeight: '700' },

  // faction plate
  plateOuter: { shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 9 },
  plateRim: {
    borderRadius: 6, borderWidth: 1.5, borderColor: T.rimLit,
    borderTopColor: T.gold, borderBottomColor: 'rgba(0,0,0,0.85)',
    backgroundColor: '#14100C', alignItems: 'center', justifyContent: 'center',
  },
  plateWell: {
    borderRadius: 3, backgroundColor: 'rgba(6,5,4,0.9)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  // ⚠ PHONE-FIX — the art fills the well. `contain` still guarantees the
  // aspect ratio (the source PNGs are 1145x1374 to 1254x1254, none of them
  // square), so a larger box makes the emblem larger, never stretched.
  plateArt: { width: '96%', height: '96%' },
  rivet: { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(201,168,106,0.55)' },
  rivetTL: { top: 4, left: 4 },
  rivetTR: { top: 4, right: 4 },
  rivetBL: { bottom: 4, left: 4 },
  rivetBR: { bottom: 4, right: 4 },

  // strata
  // ⚠ opacity, not a paler colour: the band is the kit's own engraved rule
  // (shadow hairline + light hairline) turned down, so it survives being
  // composited over a light background as well as a black one.
  strataBand: { position: 'absolute', left: 0, right: 0, opacity: 0.28 },
  strataTick: { position: 'absolute', width: 26, opacity: 0.5, marginTop: 5 },
});

export const tartariaKitStyles = kit;
