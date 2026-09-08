import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, type ViewStyle, type StyleProp } from 'react-native';
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
  /** The brand gold. The one chromatic note; unchanged since the game began. */
  gold: '#C9A86A',
  goldDim: '#8E7548',
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

const kit = StyleSheet.create({
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
  btnFace: {
    backgroundColor: T.face, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: T.edgeLit, borderBottomWidth: 1, borderBottomColor: T.edgeDark,
  },
  btnFacePrimary: { backgroundColor: 'rgba(46,37,27,0.94)', paddingVertical: 16 },
  btnFaceUtility: { backgroundColor: T.faceUtility, paddingVertical: 10, borderTopWidth: 0 },
  btnFaceDestructive: { backgroundColor: 'rgba(28,17,15,0.85)' },
  // ⚠ VIS-3 — a navigation key. Damaged coating, so it recedes behind whatever
  // it is bracketing instead of outshouting it.
  btnFaceCompact: { paddingVertical: 5, paddingHorizontal: 8, backgroundColor: T.coating, borderTopWidth: 0 },
  /** the light that catches the top of a primary plate */
  btnTopLight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(214,190,140,0.34)' },
  btnFacePressed: { backgroundColor: 'rgba(6,5,4,0.85)', borderTopColor: 'rgba(0,0,0,0.5)' },
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
