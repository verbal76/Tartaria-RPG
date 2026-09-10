/**
 * OTA-1782 — THE CONTROL SITS PROUD OF THE PLANE.
 *
 * Owner: *"I want to explore a governed depth language that can work
 * consistently across filled sage controls, filled gold controls,
 * semantic/highlighted outline controls and ordinary neutral outline controls.
 * The governing rule is: COLOR / FILL / BORDER communicates semantic state or
 * meaning. DEPTH communicates that the object is a pressable control...
 * This should be ONE governed control-depth language. Do not independently
 * style individual buttons."*
 *
 * THE LANGUAGE IS THREE THINGS:
 *   1. the upper edge catches light   (`T.controlLit`)
 *   2. the lower edge falls to shadow (`T.controlDark`)
 *   3. on press the two swap and the face settles toward the plane
 * No gradient, texture, gloss, bevel, elevation, drop shadow or face shading —
 * every one of those is on the owner's explicit do-not list, and this suite
 * asserts their ABSENCE, because a do-not list nobody checks is a wish.
 *
 * ⚠⚠⚠ THE REPRESENTATIVE STATES ARE MEASURED, NOT ASSERTED AS AN OPINION.
 * The owner asked to see filled sage, filled gold, semantic outline, neutral
 * outline and pressed before treating the treatment as locked. A screenshot is
 * not available to a test and the device is the final authority either way —
 * so what is provable here is the ARITHMETIC: composite the two edge colours
 * over each of the four real faces and show that every one of them ends with a
 * genuine top-to-bottom value gradient. That is the claim the design rests on,
 * and it is the claim that would silently stop being true if a token moved.
 */
import fs from 'node:fs';
import path from 'node:path';

import { T, tControlDepth, tartariaKitStyles } from '../app/ui/tartariaKit';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const KIT = 'app/ui/tartariaKit.tsx';
const INPUT_BOX = 'app/components/InputBox.tsx';

/* ⚠⚠⚠ GRADE THE CODE, NOT THE PROSE — the twenty-third sighting. Both files
 * scanned below explain this pass by quoting the very tokens and the very
 * banned words ("gradient", "gloss", "bevel") the assertions look for. A raw
 * scan would fail on the sentence that says the thing is absent. */
function codeOf(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i]; i += 1; if (i < n) { out += src[i]; i += 1; } continue; }
        out += src[i]; i += 1;
      }
      if (i < n) { out += src[i]; i += 1; }
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

// ── the arithmetic ──────────────────────────────────────────────────────────

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbaOf(css: string): [number, number, number, number] {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`not an rgba(): ${css}`);
  const parts = m[1]!.split(',').map((x) => Number(x.trim()));
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
}

/** Source-over composite of a translucent edge onto an opaque face. */
function over(edge: string, face: string): [number, number, number] {
  const [r, g, b, a] = rgbaOf(edge);
  const [fr, fg, fb] = rgbOf(face);
  return [a * r + (1 - a) * fr, a * g + (1 - a) * fg, a * b + (1 - a) * fb];
}

/** Rec.709 relative luminance, 0–255. */
function lum([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The four faces the owner named, taken from the shipped styles.
 *
 * ⚠ OTA-1800 NOTE: `filled sage` was `quickStrike`'s body until the owner ruled
 * the equipped weapon dark on 2026-09-10; the weapon chip now wears the neutral
 * outline below. The row STAYS, and not as a fossil — the claim these four
 * measure is that ONE highlight/shadow pair serves faces at both ends of the
 * range without a per-face variant, and dropping the brightest face would leave
 * the claim asserted only over faces that agree with each other. `#9ec96a` is
 * still shipped (it is the weapon chip's border and its lettering), so this is
 * a real face and not a hypothetical one. */
const FACES = {
  'filled sage': '#9ec96a',      // the sage — now the weapon chip's rim and ink
  'filled gold': '#c9a86a',      // the modals' btnPrimary
  'semantic outline': '#1b2417', // quickReady — an available tool
  'neutral outline': '#1a1714',  // the quick chassis — the default chip
} as const;

describe('OTA-1782 — the comment-stripper this suite is built on', () => {
  it('drops both comment forms and keeps string bodies', () => {
    const src = "const a = 1; // gradient\n/* gloss */ const b = 'bevel';";
    const code = codeOf(src);
    expect(code).not.toContain('gradient');
    expect(code).not.toContain('gloss');
    expect(code).toContain('bevel');
  });

  it('is load-bearing here — both scanned files name the banned words in prose', () => {
    for (const rel of [KIT, INPUT_BOX]) expect(read(rel).length).toBeGreaterThan(codeOf(read(rel)).length);
  });
});

describe('OTA-1782 — the language is two colours and one settle', () => {
  it('the two tokens exist and are translucent, so they composite rather than paint', () => {
    expect(T.controlLit).toMatch(/^rgba\(/);
    expect(T.controlDark).toMatch(/^rgba\(/);
    expect(rgbaOf(T.controlLit)[3]).toBeLessThan(1);
    expect(rgbaOf(T.controlDark)[3]).toBeLessThan(1);
  });

  /* ⚠ THE KIT PALETTE RULE (ota1742): warm-neutral means r ≥ g ≥ b. The lit
   * edge is a warm white rather than a cool one for that reason — a cool
   * highlight in a parchment-and-soot game reads as plastic. */
  it('the lit edge is warm-neutral, like every other value in this file', () => {
    const [r, g, b] = rgbaOf(T.controlLit);
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(b);
  });

  it('resting puts the light on top and the shadow beneath', () => {
    const resting = tartariaKitStyles.controlResting as Record<string, unknown>;
    expect(resting.borderTopColor).toBe(T.controlLit);
    expect(resting.borderBottomColor).toBe(T.controlDark);
  });

  /* ⚠⚠ PRESSED IS THE LIGHT MOVING. Not a new colour, not an opacity, not a
   * shadow that grows — the same two values, swapped, plus a settle. */
  it('pressed swaps them and settles the face toward the plane', () => {
    const pressed = tartariaKitStyles.controlPressed as Record<string, unknown>;
    expect(pressed.borderTopColor).toBe(T.controlDark);
    expect(pressed.borderBottomColor).toBe(T.controlLit);
    const tf = pressed.transform as Array<{ translateY: number }>;
    expect(tf).toHaveLength(1);
    expect(tf[0]!.translateY).toBeGreaterThan(0);
    expect(tf[0]!.translateY).toBeLessThanOrEqual(2);
  });

  it('the helper returns the two halves and nothing else', () => {
    expect(tControlDepth(false)).toBe(tartariaKitStyles.controlResting);
    expect(tControlDepth(true)).toBe(tartariaKitStyles.controlPressed);
  });

  /* ⚠⚠⚠ DEPTH NEVER TOUCHES MEANING, AND THIS IS THE ASSERTION THAT SAYS SO.
   * The two styles may set the TOP and BOTTOM border colours and the transform.
   * A `borderColor`, a `backgroundColor` or a `borderWidth` here would be the
   * depth language deciding what a control MEANS or how heavy it is — which is
   * exactly the thing the owner separated it from. */
  it('neither half sets a fill, a ring or a weight', () => {
    for (const key of ['controlResting', 'controlPressed'] as const) {
      const style = tartariaKitStyles[key] as Record<string, unknown>;
      const allowed = new Set(['borderTopColor', 'borderBottomColor', 'transform']);
      for (const k of Object.keys(style)) expect(allowed.has(k)).toBe(true);
    }
  });
});

describe('OTA-1782 — none of the forbidden treatments arrived with it', () => {
  /* Owner's do-not list, in his words: gradients, textures, shimmer, gloss,
   * lighting painted across the face, face shading, cartoon bevels,
   * skeuomorphic plastic buttons, generic floating-card elevation, large soft
   * drop shadows, a different depth effect for every semantic color. */
  it('the depth styles carry no shadow, elevation or opacity of any kind', () => {
    for (const key of ['controlResting', 'controlPressed'] as const) {
      const style = JSON.stringify(tartariaKitStyles[key]);
      for (const banned of ['shadow', 'elevation', 'opacity', 'Gradient']) {
        expect(style).not.toContain(banned);
      }
    }
  });

  /* ⚠ ONE EFFECT FOR EVERY SEMANTIC COLOUR — the last item on the list, and the
   * easiest to violate by accident. There is exactly one resting style and one
   * pressed style; a per-tone variant would show up as a third and fourth. */
  it('there is one resting and one pressed style, not one per tone', () => {
    /* ⚠ THE WHOLE `control*` NAMESPACE, not a filtered slice of it. The first
     * cut of this test matched two-space-indented `control…:` keys and counted
     * FOUR — because `T.controlLit` and `T.controlDark` sit at the same
     * indent as the styles. Counting the names outright is both simpler and
     * stronger: the language is allowed exactly two tokens and exactly two
     * styles, and a `controlStrike` or a `controlGold` appearing anywhere in
     * this file fails it. */
    const names = new Set((codeOf(read(KIT)).match(/\bcontrol[A-Z]\w*/g) ?? []));
    expect([...names].sort()).toEqual(['controlDark', 'controlLit', 'controlPressed', 'controlResting']);
  });
});

describe('OTA-1782 — the four representative states, measured', () => {
  /* ⚠⚠⚠ THE RESULT THAT MAKES ONE PAIR ENOUGH FOR OPPOSITE FILLS, and it is
   * worth reading rather than skimming: on a LIGHT fill the shadow carries the
   * depth and the highlight barely registers; on a DARK fill it is the exact
   * reverse. The pair is self-balancing, so a single language covers a light
   * sage strike chip and a near-black neutral chip without a per-face variant —
   * which is the failure OTA-1569 documented when it hunted for one glyph
   * colour that read on both. */
  const rows = Object.entries(FACES).map(([name, face]) => {
    const top = lum(over(T.controlLit, face));
    const bottom = lum(over(T.controlDark, face));
    const base = lum(rgbOf(face));
    return { name, face, base, top, bottom, lift: top - base, drop: base - bottom, span: top - bottom };
  });

  it.each(rows)('$name ($face) ends with a real top-to-bottom gradient', ({ span }) => {
    expect(span).toBeGreaterThan(40);
  });

  it('every face gets its depth from at least one edge, strongly', () => {
    for (const r of rows) expect(Math.max(r.lift, r.drop)).toBeGreaterThan(30);
  });

  it('the light fills lean on the shadow and the dark fills lean on the light', () => {
    const sage = rows.find((r) => r.name === 'filled sage')!;
    const gold = rows.find((r) => r.name === 'filled gold')!;
    const neutral = rows.find((r) => r.name === 'neutral outline')!;
    const semantic = rows.find((r) => r.name === 'semantic outline')!;
    expect(sage.drop).toBeGreaterThan(sage.lift);
    expect(gold.drop).toBeGreaterThan(gold.lift);
    expect(neutral.lift).toBeGreaterThan(neutral.drop);
    expect(semantic.lift).toBeGreaterThan(semantic.drop);
  });

  /* ⚠ PRESSED, MEASURED: the gradient does not merely shrink, it INVERTS. That
   * is the difference between "settles toward the plane" and "dims a little". */
  it.each(rows)('$name inverts under press rather than fading', ({ face, span }) => {
    const pressedTop = lum(over(T.controlDark, face));
    const pressedBottom = lum(over(T.controlLit, face));
    expect(pressedTop - pressedBottom).toBeCloseTo(-span, 5);
  });
});

describe('OTA-1782 — the combat chips adopt it, and the inert ones do not', () => {
  const code = codeOf(read(INPUT_BOX));

  it('the chip family reads the kit helper rather than styling itself', () => {
    expect(code).toContain('tControlDepth');
    expect(code).toMatch(/import \{ tControlDepth \} from '\.\.\/ui\/tartariaKit'/);
  });

  /* ⚠⚠ DEPTH IS APPLIED LAST, AND THE ORDER IS THE DESIGN. The tone styles set
   * `borderColor`, colouring all four sides. Depth then overrides only top and
   * bottom. Applied first, the flat semantic ring would win and there would be
   * no depth at all — a failure that would look like "the token is too subtle"
   * rather than like a bug, which is why it is pinned. */
  it('depth comes after every tone in the style array', () => {
    const block = code.match(/const containerStyle = \(pressed: boolean\) => \[[\s\S]*?\];/)?.[0] ?? '';
    expect(block).not.toBe('');
    const iDepth = block.indexOf('tControlDepth');
    expect(iDepth).toBeGreaterThan(-1);
    for (const tone of ['quickStrike', 'quickDefensive', 'quickReady', 'quickNeedsApproach', 'quickUnavailable']) {
      expect(block.indexOf(tone)).toBeGreaterThan(-1);
      expect(block.indexOf(tone)).toBeLessThan(iDepth);
    }
  });

  /* ⚠⚠⚠ THE INERT CASE, AND IT IS AN ABSENCE RATHER THAN A THIRD VARIANT.
   * Owner: *"DISABLED / INERT must not falsely advertise the same physical
   * readiness if existing semantics support distinguishing it."* A blocked chip
   * buzzes and returns — it is not a control at that moment — so it gets no
   * depth and keeps a flat, even ring. Note this is `blocked` alone: an
   * `unavailable` or out-of-range chip IS still tappable (OTA-1591 made those
   * refusals speak), so it stays proud. */
  it('a blocked chip is given no depth at all', () => {
    const block = code.match(/const containerStyle = \(pressed: boolean\) => \[[\s\S]*?\];/)?.[0] ?? '';
    expect(block).toMatch(/blocked \? null : tControlDepth\(pressed\)/);
  });

  /* ⚠ THE PRESSED STATE HAD TO BECOME REACHABLE. `TouchableOpacity`'s only
   * feedback is a fade of the whole chip, fill included — the same technique
   * arb86 removed from the disabled state because a translucent chip lets a
   * player-tuned background flood through it. */
  it('the chip is a Pressable so the pressed half can be reached', () => {
    expect(code).toMatch(/<Pressable\s+style=\{\(\{ pressed \}\) => containerStyle\(pressed\)\}/);
  });
});

describe('OTA-1782 — one language, including for the control that invented it', () => {
  const code = codeOf(read(KIT));

  /* ⚠⚠ `TButton` HAS HAD THIS CONSTRUCTION SINCE VIS-1 and was the only control
   * in the game that did. Leaving it on the panel pair would have been two
   * languages that merely agreed about direction. */
  it('TButton s face reads the control tokens, not the panel pair', () => {
    const face = code.match(/btnFace:\s*\{[^}]*\}/)?.[0] ?? '';
    expect(face).not.toBe('');
    expect(face).toContain('T.controlLit');
    expect(face).toContain('T.controlDark');
  });

  it('its pressed face inverts the same way every adopter does', () => {
    const pressed = code.match(/btnFacePressed:\s*\{[^}]*\}/)?.[0] ?? '';
    expect(pressed).toContain('borderTopColor: T.controlDark');
    expect(pressed).toContain('borderBottomColor: T.controlLit');
  });

  /* ⚠⚠⚠ PANELS ARE NOT CONTROLS, AND THIS IS THE ASSERTION THAT KEEPS THE
   * CLAIM MEANINGFUL. The whole language says a control sits PROUD OF the
   * interface plane. If a plate wore the same edges there would be nothing for
   * a control to be proud of, and "depth means pressable" would quietly stop
   * being true. So `panelFace` keeps `edgeLit`/`edgeDark`. */
  it('the plates keep the panel pair, so the plane stays a plane', () => {
    const panel = code.match(/panelFace:\s*\{[^}]*\}/)?.[0] ?? '';
    expect(panel).not.toBe('');
    expect(panel).toContain('T.edgeLit');
    expect(panel).toContain('T.edgeDark');
    expect(panel).not.toContain('T.controlLit');
  });
});

describe('OTA-1782 — the combat colour vocabulary is untouched', () => {
  /* Owner: *"Do not allow this work to change the already-established combat
   * color vocabulary... Depth must be orthogonal to those meanings."* Six
   * values, asserted literally, because that is exactly the list that was
   * ruled on.
   *
   * ⚠⚠⚠ ONE ROW MOVED, AND ONLY BY A LATER RULING FROM THE SAME DESK. This
   * guard says DEPTH may not repaint the vocabulary, and depth never did — the
   * strike row below changed on 2026-09-10 because the owner ruled *"KEEP THE
   * EQUIPPED WEAPON CONTROL DARK"* in a separate pass (OTA-1800), which is the
   * one authority this guard was never meant to stand against. The value is
   * updated rather than the assertion loosened, so the row keeps doing its job:
   * the NEXT depth pass still cannot touch it. The hue itself did not move —
   * `#9ec96a` is still the strike colour, spent on rim and lettering instead of
   * on the body. */

  const code = codeOf(read(INPUT_BOX));

  it.each([
    ['strike — sage on the chassis ground', "quickStrike: { borderColor: '#9ec96a', backgroundColor: '#1a1714' }"],
    ['ready — sage outline', "quickReady: { borderColor: '#9ec96a', backgroundColor: '#1b2417' }"],
    ['defensive — blue', "quickDefensive: { borderColor: '#6a9bbf' }"],
    ['needs-approach — amber', "quickNeedsApproach: { borderColor: '#c9a86a' }"],
    ['unavailable — red', "quickUnavailable: { borderColor: '#e07a5f' }"],
    ['default — neutral', "borderColor: '#3a342c'"],
  ])('%s is byte-identical', (_name, literal) => {
    expect(code).toContain(literal);
  });
});
