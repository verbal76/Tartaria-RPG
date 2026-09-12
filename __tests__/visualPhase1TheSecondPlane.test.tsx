/**
 * VISUAL LANGUAGE PHASE 1 — THE SECOND PLANE, THE WELL, AND THE FOUR FAMILIES.
 *
 * Owner, on the physical build: the compact controls are "technically raised"
 * and still read as "another framed rectangle." The depth language was not
 * missing — `tControlDepth` has been on the chips since OTA-1782 and at RAISED
 * strength since OTA-1802 — so the answer was ruled explicitly NOT to be more
 * alpha: "Do NOT merely increase the existing controlRaisedLit/controlRaisedDark
 * alpha… Implement the proposed additional physical plane/sidewall
 * construction."
 *
 * ⚠⚠ WHAT THIS SUITE CAN AND CANNOT PROVE, SAID FIRST SO NOTHING HERE IS READ AS
 * MORE THAN IT IS. It cannot prove a button LOOKS pressable, a frame LOOKS
 * structural, metal LOOKS maintained, or that 0.10 is the right watermark. Those
 * are the owner's eye on a device and nothing else. What it proves is STRUCTURE:
 * that the four semantic families are distinct and stay distinct, that the
 * decoration is inert, that no handler, touch target, gesture chain or layout
 * box moved, and that 320×568 still holds.
 *
 * THE FOUR FAMILIES, AND THE BOUNDARY BETWEEN THEM IS THE WHOLE CLAIM:
 *   RAISED COMMAND       a key you strike        second plane, 2dp sidewall
 *   INTERACTIVE CHASSIS  a card you open         same language, half weight
 *   RECESSED INPUT       a well you type into    glass ground, inverted lip
 *   STRUCTURAL FRAME     a region you read       an edge, and nothing else
 */
/* ⚠ The house preamble from OTA-1246's render guard — the native modules the
   store pulls in transitively, mocked so the REAL screen can mount. Copied
   deliberately, including the absence of `{ virtual: true }`, which that suite
   records as what made it survive a whole-surface run and not only a solo one. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('onnxruntime-react-native', () => ({
  InferenceSession: { create: jest.fn(async () => ({ run: jest.fn(async () => ({})) })) },
  Tensor: class { constructor(_t: string, _d: unknown, _s: unknown[]) {} },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(async () => ({ completion: jest.fn(async () => ({ text: '' })), release: jest.fn() })),
  releaseAllLlama: jest.fn(),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import { T, tartariaKitStyles } from '../app/ui/tartariaKit';
import { WATERMARK_OPACITY, WATERMARK_INSET } from '../app/components/FactionWatermark';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Strip comments, so a mention in prose can never satisfy a structural claim. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const KIT = read('app/ui/tartariaKit.tsx');
const EXPLORATION = codeOf(read('app/screens/ExplorationScreen.tsx'));
const INPUT_BOX = codeOf(read('app/components/InputBox.tsx'));
const KB_BAR = codeOf(read('app/components/KeyboardInputBar.tsx'));
const ENEMY_PANEL = codeOf(read('app/components/EnemyPanel.tsx'));
const STATS_PANEL = codeOf(read('app/components/StatsPanel.tsx'));
const WATERMARK = codeOf(read('app/components/FactionWatermark.tsx'));

type Style = Record<string, unknown>;
const flat = (s: unknown): Style => Object.assign({}, ...[s].flat(9).filter(Boolean) as Style[]);

/** Every plane the phase introduces, by the name a consumer spells. */
const PLANES = [
  'controlPlaneTop', 'controlPlaneBottom',
  'controlPlaneTopPressed', 'controlPlaneBottomPressed',
  'chassisPlaneTop', 'chassisPlaneBottom',
] as const;

/* ════════════════════════════════════════════════════════════════════════════
   1. THE PLANES CONSUME NO LAYOUT — the licence for the whole construction
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — the second plane is apparent depth, and it costs no geometry', () => {
  /** ⚠ THE WHITELIST IS THE CLAIM. A plane may place itself and paint itself and
   *  do nothing else. The brief's own "Dangerous" list is exactly what is absent
   *  here: padding, margin, minHeight, width, height, flex, elevation, shadow. */
  const ALLOWED = new Set([
    'position', 'top', 'left', 'right', 'bottom', 'height',
    'backgroundColor',
    'borderTopLeftRadius', 'borderTopRightRadius',
    'borderBottomLeftRadius', 'borderBottomRightRadius',
  ]);

  it.each(PLANES)('%s places and paints itself, and owns nothing else', (name) => {
    const s = flat((tartariaKitStyles as Record<string, unknown>)[name]);
    expect(Object.keys(s).length).toBeGreaterThan(0);
    for (const k of Object.keys(s)) expect(ALLOWED.has(k)).toBe(true);
    expect(s.position).toBe('absolute');
    // Full-width: it is an EDGE of the control, not a floating mark inside it.
    expect(s.left).toBe(0);
    expect(s.right).toBe(0);
  });

  it.each(PLANES)('%s carries no padding, size, flex, shadow or elevation', (name) => {
    const s = flat((tartariaKitStyles as Record<string, unknown>)[name]);
    for (const banned of [
      'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
      'paddingVertical', 'paddingHorizontal',
      'margin', 'marginTop', 'marginBottom', 'marginVertical', 'marginHorizontal',
      'minHeight', 'maxHeight', 'minWidth', 'maxWidth', 'width',
      'flex', 'flexGrow', 'flexBasis', 'alignSelf',
      'elevation', 'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset',
      'borderWidth', 'borderTopWidth', 'borderBottomWidth',
    ]) {
      expect(s).not.toHaveProperty(banned);
    }
  });

  /* ⚠⚠ A COMMAND OUTRANKS A CHASSIS, PHYSICALLY, AND IT IS MEASURED RATHER THAN
   * ASSERTED BY NAME. Owner: a tappable card "is NOT the same thing as a command
   * button… less key-like protrusion than a discrete command." If the two ever
   * converged, "interactive chassis" would quietly become a second command
   * family and the hierarchy on a screen holding both would be gone. */
  it('the chassis sidewall is strictly shallower and thinner than a command sidewall', () => {
    const alpha = (rgba: string) => Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(rgba)![1]);
    expect(alpha(T.chassisSidewall)).toBeLessThan(alpha(T.controlSidewall));
    expect(alpha(T.chassisFaceLit)).toBeLessThan(alpha(T.controlFaceLit));
    const cmd = flat(tartariaKitStyles.controlPlaneBottom);
    const chassis = flat(tartariaKitStyles.chassisPlaneBottom);
    expect(chassis.height as number).toBeLessThan(cmd.height as number);
  });

  /* ⚠ PRESSED IS THE OBJECT GOING IN: the shaded side moves ABOVE the face and
   * the light catches BELOW it. That is the same inversion `controlPressed`
   * already performs on the ring, so the two layers agree rather than fight. */
  it('pressed inverts the planes, matching the ring inversion the kit already had', () => {
    const top = flat(tartariaKitStyles.controlPlaneTop);
    const bottom = flat(tartariaKitStyles.controlPlaneBottom);
    const topP = flat(tartariaKitStyles.controlPlaneTopPressed);
    const bottomP = flat(tartariaKitStyles.controlPlaneBottomPressed);
    expect(top.backgroundColor).toBe(T.controlFaceLit);
    expect(bottom.backgroundColor).toBe(T.controlSidewall);
    expect(topP.backgroundColor).toBe(T.controlSidewall);
    expect(bottomP.backgroundColor).toBe(T.controlFaceLit);
    // …and the resting ring's own inversion is untouched by any of it.
    const resting = flat(tartariaKitStyles.controlResting);
    const pressed = flat(tartariaKitStyles.controlPressed);
    expect(resting.borderTopColor).toBe(T.controlRaisedLit);
    expect(pressed.borderTopColor).toBe(T.controlRaisedDark);
    /* ⚠ PHASE 2 raised the travel 1.5 → 2 on owner authority ("too subtle").
     * The floor is the claim now: the displacement may grow, never shrink. */
    expect((flat(tartariaKitStyles.controlPressed).transform as [{ translateY: number }])[0].translateY)
      .toBeGreaterThanOrEqual(2);

  });

  /* ⚠⚠ THE CHASSIS DOES NOT INVERT, AND THAT ABSENCE IS DELIBERATE. A card does
   * not travel when you open it; giving it a pressed pair would hand it the
   * command family's second half through the back door. */
  it('there is no pressed chassis plane — a card is opened, not struck', () => {
    for (const k of Object.keys(tartariaKitStyles)) {
      expect(k).not.toMatch(/^chassisPlane.*Pressed$/);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   2. DEPTH STILL NEVER TOUCHES MEANING
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — semantic colour and physical depth remain orthogonal', () => {
  /** ⚠ The rule OTA-1782 set and this phase must not erode: the SEMANTIC ring,
   *  fill and label say what a control MEANS; the planes say only that it is a
   *  control. A plane that carried a fill or a text colour would collapse them. */
  it('no plane paints a semantic border or a text colour', () => {
    for (const name of PLANES) {
      const s = flat((tartariaKitStyles as Record<string, unknown>)[name]);
      expect(s).not.toHaveProperty('borderColor');
      expect(s).not.toHaveProperty('borderTopColor');
      expect(s).not.toHaveProperty('borderBottomColor');
      expect(s).not.toHaveProperty('color');
    }
  });

  it('no depth token is named for a tone', () => {
    const names = new Set((codeOf(KIT).match(/\b(control|chassis)[A-Z]\w*/g) ?? []));
    expect(names.size).toBeGreaterThan(0);
    for (const n of names) {
      expect(n).not.toMatch(/strike|defensive|ready|gold|sage|amber|red|green|blue|danger|unavailable/i);
    }
  });

  /** ⚠ The sidewall is translucent BLACK on purpose: the command family holds a
   *  near-black chip beside a light sage fill and the filled gold, and an opaque
   *  band tuned for one is invisible on another. A black composites DOWN from
   *  whatever is behind it, so one value is a shaded side on every member. */
  it('the plane values are translucent, so one set serves opposite fills', () => {
    for (const v of [T.controlFaceLit, T.controlSidewall, T.chassisFaceLit, T.chassisSidewall]) {
      expect(v).toMatch(/^rgba\(/);
      expect(Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(v)![1])).toBeLessThan(1);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   3. THE STRUCTURAL FRAME IS STILL AN EDGE AND NOTHING ELSE
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — the read-only frame gained visibility and no geometry', () => {
  it('the frame is still the brand gold at an alpha — a new opacity, never a new gold', () => {
    const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(T.panelRim)!;
    expect([m[1], m[2], m[3]]).toEqual(['201', '168', '106']); // #C9A86A
    expect(Number(m[4])).toBeCloseTo(0.30, 5);
  });

  /** ⚠ THE NO-LAYOUT CONTRACT, WHICH IS WHAT LETS THE FRAME RIDE ON FOUR PANELS
   *  THAT ALREADY OWN THEIR GEOMETRY. A rim colour, a rim width, a radius. */
  it('panelFrame is exactly a colour, a width and a radius', () => {
    expect(flat(tartariaKitStyles.panelFrame)).toEqual({
      borderWidth: 1, borderColor: T.panelRim, borderRadius: 3,
    });
  });

  /** ⚠⚠ AND THE FRAME MUST NOT BECOME A CHASSIS. The owner's ruling reclassified
   *  the PLAYER surface as "outer HUD boundary = structural, inner content
   *  chassis = interactive". If the interactive treatment migrated onto the
   *  outer frame, that distinction would be gone in one line. */
  it('the interactive-chassis treatment never lands on the outer HUD frame', () => {
    for (const line of EXPLORATION.split('\n')) {
      if (!line.includes('panelFrame')) continue;
      expect(line).not.toMatch(/chassisPlane|controlPlane|tControlDepth|CHASSIS_PLANES/);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   4. THE RECESS — a field and a button stop being the same object
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — an input is a well, not a plate', () => {
  it('the recess is the glass vocabulary with the lip inverted', () => {
    const s = flat(tartariaKitStyles.recess);
    expect(s.backgroundColor).toBe(T.glass);
    expect(s.borderColor).toBe(T.glassRim);
    expect(s.borderTopColor).toBe(T.recessTop);
    expect(s.borderBottomColor).toBe(T.recessLip);
  });

  /** ⚠⚠ THE ONE THAT MAKES IT A HOLE. A raised control catches light on TOP and
   *  throws shadow at the BOTTOM; a recess does the opposite. If these ever
   *  matched the control's direction, the well would read as a plate again. */
  it('the recess lights the opposite way to a raised control', () => {
    const a = (rgba: string) => Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(rgba)![1]);
    expect(T.recessTop).toMatch(/^rgba\(0,\s*0,\s*0/);           // shadow on top
    expect(T.recessLip).toMatch(/^rgba\(214,\s*190,\s*140/);      // light below
    expect(a(T.recessTop)).toBeGreaterThan(a(T.recessLip));
    expect(flat(tartariaKitStyles.controlPlaneTop).backgroundColor).toBe(T.controlFaceLit); // light on top
  });

  it('the recess owns no geometry, so it can ride on two fields that own their own', () => {
    const s = flat(tartariaKitStyles.recess);
    for (const banned of [
      'padding', 'paddingVertical', 'paddingHorizontal', 'margin',
      'minHeight', 'maxHeight', 'height', 'width', 'flex', 'borderWidth', 'borderRadius',
      'overflow', 'elevation', 'shadowColor',
    ]) {
      expect(s).not.toHaveProperty(banned);
    }
  });

  it('both Exploration fields take the same recess — they share one draft', () => {
    expect(INPUT_BOX).toMatch(/styles\.inputWrap,\s*tartariaKitStyles\.recess/);
    expect(KB_BAR).toMatch(/styles\.input,\s*tartariaKitStyles\.recess/);
  });

  /* ⚠⚠⚠ THE TUTORIAL PULSE IS AN ABSOLUTE OVERLAY AT -1 THAT REACHES BACK OVER
   * THE BORDER. Clipping the wrap would delete the name and rope beats' only
   * input cue — silently, and only on a device. This is the guard that says so. */
  it('inputWrap never gains overflow hidden, so the pulse can still reach over its border', () => {
    const wrap = /inputWrap:\s*\{[^}]*\}/.exec(INPUT_BOX)?.[0] ?? '';
    expect(wrap).not.toBe('');
    expect(wrap).not.toContain('overflow');
    expect(INPUT_BOX).toMatch(/inputPulseOverlay:\s*\{[^}]*top:\s*-1/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   5. NOTHING BEHAVIOURAL MOVED — handlers, drafts, gestures, targets
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — the inputs keep every behavioural contract', () => {
  it('both fields still read the ONE shared draft authority', () => {
    for (const src of [INPUT_BOX, KB_BAR]) {
      expect(src).toMatch(/useGameStore\(\(s\)\s*=>\s*s\.explorationDraft\)/);
    }
  });

  it('the wrapping, submit and Android focus contracts are untouched', () => {
    for (const src of [INPUT_BOX, KB_BAR]) {
      for (const prop of ['multiline', 'blurOnSubmit', 'scrollEnabled', 'onSubmitEditing']) {
        expect(src).toContain(prop);
      }
    }
    // OTA-1075 — the explicit press-in focus retry Android intermittently needs.
    expect(INPUT_BOX).toMatch(/onPressIn=\{\(\)\s*=>\s*inputRef\.current\?\.focus\(\)\}/);
    // OTA-1555 — the floating bar's own three-line cap.
    expect(KB_BAR).toMatch(/minHeight:\s*38/);
    expect(KB_BAR).toMatch(/maxHeight:\s*96/);
  });

  /** ⚠ THE RING WAS PAID FOR OUT OF THE PADDING so the Act control's outer box
   *  did not move: 14+0 → 13+1 and 9+0 → 8+1 in both files. A button that grew
   *  2dp would reflow the row it sits in at the narrowest width. */
  it('Act gains a ring without gaining a box', () => {
    for (const src of [INPUT_BOX, KB_BAR]) {
      const send = /\bsend:\s*\{[^}]*\}/.exec(src)?.[0] ?? '';
      expect(send).not.toBe('');
      expect(send).toMatch(/paddingHorizontal:\s*13/);
      expect(send).toMatch(/paddingVertical:\s*8/);
      expect(send).toMatch(/borderWidth:\s*1/);
    }
  });

  it('both Act controls carry the governed plane and no hand-written copy of it', () => {
    for (const src of [INPUT_BOX, KB_BAR]) {
      expect(src).toMatch(/tartariaKitStyles\.controlPlaneTop/);
      expect(src).toMatch(/tartariaKitStyles\.controlPlaneBottom/);
      for (const lit of [T.controlFaceLit, T.controlSidewall, T.chassisFaceLit, T.chassisSidewall]) {
        expect(src).not.toContain(lit);
      }
    }
  });

  /* ⚠⚠⚠ THE COMBAT CHIP ITSELF CARRIES BOTH PLANES, IN BOTH STATES — AND THIS
   * ASSERTION EXISTS BECAUSE THE FIRST DRAFT OF THIS SUITE DID NOT HAVE IT.
   * Negative control NC-1 deleted the sidewall from `QuickBtn` outright and the
   * suite stayed GREEN: every claim about the planes was scoped to the FILE, and
   * the file still contained the Act control's copies. A file-level `toContain`
   * cannot tell "the chip family renders this" from "something in this file
   * mentions it." So the claim is scoped to the QuickBtn render itself, and all
   * four names must be there — resting and pressed, top and bottom — because a
   * chip that lost only its pressed half would read as raised until you touched
   * it and then stop being a control at the moment it mattered. */
  it('the combat chip renders both planes, resting and pressed', () => {
    const i = INPUT_BOX.indexOf('function QuickBtn(');
    expect(i).toBeGreaterThan(-1);
    const chip = INPUT_BOX.slice(i, INPUT_BOX.indexOf('\n}', INPUT_BOX.indexOf('</Pressable>', i)));
    for (const name of [
      'controlPlaneTop', 'controlPlaneBottom',
      'controlPlaneTopPressed', 'controlPlaneBottomPressed',
    ]) {
      expect(chip).toContain(`tartariaKitStyles.${name}`);
    }
    // …and it is the kit's, not a hand-written copy, and it takes no touch.
    expect((chip.match(/pointerEvents="none"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  /* ⚠⚠⚠ REVERSED BY OWNER RULING IN PHASE 3 — see the twin in OTA-1782. Phase 1
   * asserted that an inert chip made no physical claim on EITHER layer. The
   * device showed what that costs: a disabled PICKPOCKET stopped looking like a
   * control at all. A dead key is still a key; the mute says it cannot be
   * struck. Both layers are now unconditional, and the guard says so. */
  it('a blocked chip keeps both layers and is muted, not stripped', () => {
    expect(INPUT_BOX).not.toMatch(/blocked\s*\?\s*null\s*:\s*tControlDepth\(pressed\)/);
    expect(INPUT_BOX).not.toMatch(/\{blocked\s*\?\s*null\s*:\s*\(/);
    expect(INPUT_BOX).toMatch(/blocked && styles\.quickDisabled/);
    expect(INPUT_BOX).toMatch(/blocked && styles\.quickDisabledText/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   6. THE PLAYER PANEL — the C-1 ruling, asserted
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — the player touch contract is exactly what it was', () => {
  /* ⚠⚠⚠ THE AUDIT SAID THE PORTRAIT WAS SEPARATELY TAPPABLE. SOURCE SAID
   * OTHERWISE, AND SOURCE WON. The owner's ruling: "DO NOT shrink this
   * interaction to the portrait. DO NOT change the existing touch target. DO NOT
   * change the existing accessibility ownership." So the whole StatsPanel stays
   * the press target, and this suite proves it rather than trusting it. */
  it('the whole StatsPanel parent Touchable is still the interaction owner', () => {
    expect(EXPLORATION).toMatch(
      /<TouchableOpacity[\s\S]{0,400}?accessibilityLabel="Open player sheet"[\s\S]{0,400}?<StatsPanel/,
    );
  });

  it('StatsPanel introduces no second, competing touch owner of its own', () => {
    // The card renders content and two inert planes. It owns no press at all.
    expect(STATS_PANEL).not.toMatch(/\bonPress\b/);
    expect(STATS_PANEL).not.toMatch(/\bTouchableOpacity\b/);
    expect(STATS_PANEL).not.toMatch(/\bPressable\b/);
    expect(STATS_PANEL).not.toMatch(/accessibilityRole=/);
  });

  it('the inner player chassis takes the chassis weight, never the command weight', () => {
    expect(STATS_PANEL).toMatch(/tartariaKitStyles\.chassisPlaneTop/);
    expect(STATS_PANEL).toMatch(/tartariaKitStyles\.chassisPlaneBottom/);
    expect(STATS_PANEL).not.toMatch(/controlPlane|tControlDepth/);
  });

  it('the player planes are inert and accessibility-silent', () => {
    const block = STATS_PANEL.slice(STATS_PANEL.indexOf('chassisPlaneTop'));
    expect(block).toMatch(/chassisPlaneTop\}\s*pointerEvents="none"/);
    expect(block).toMatch(/chassisPlaneBottom\}\s*pointerEvents="none"/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   7. THE ENEMY PANEL — the gesture chain is the firewall
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — the enemy ownership chain is byte-for-byte the shape OTA-1514 left', () => {
  /* ⚠⚠⚠ THE arb146 REGRESSION GUARD, WHICH DID NOT EXIST UNTIL NOW. arb146 added
   * tap-to-open by wrapping the ScrollView in a Touchable; in React Native a
   * parent Touchable WINS THE RESPONDER on a vertical drag, so the card was
   * capped with no way to scroll. OTA-1514 inverted it — ScrollView owns the
   * pan, Touchable sits INSIDE. This phase adds children to that Touchable, so
   * the shape it must not break is now asserted instead of remembered. */
  it('the ScrollView is the PARENT and the Touchable is INSIDE it', () => {
    const wrap = /const scrollWrap = \([\s\S]*?\n  \);/.exec(ENEMY_PANEL)?.[0] ?? '';
    expect(wrap).not.toBe('');
    const iScroll = wrap.indexOf('<ScrollView');
    const iTouch = wrap.indexOf('<TouchableOpacity');
    const iScrollEnd = wrap.indexOf('</ScrollView>');
    expect(iScroll).toBeGreaterThanOrEqual(0);
    expect(iTouch).toBeGreaterThan(iScroll);
    expect(iTouch).toBeLessThan(iScrollEnd);
    expect(wrap.indexOf('</TouchableOpacity>')).toBeLessThan(iScrollEnd);
  });

  it('the horizontal pager and the per-page vertical scroll both survive', () => {
    expect(ENEMY_PANEL).toMatch(/<FlatList[\s\S]{0,900}?horizontal/);
    expect(ENEMY_PANEL).toMatch(/snapToInterval=\{cardWidth\}/);
    expect(ENEMY_PANEL).toMatch(/getItemLayout=/);
    expect(ENEMY_PANEL).toMatch(/<ScrollView[\s\S]{0,200}?maxHeight: capH/);
  });

  it('the card planes are inert children of the existing handler owner', () => {
    const wrap = /const scrollWrap = \([\s\S]*?\n  \);/.exec(ENEMY_PANEL)?.[0] ?? '';
    expect(wrap).toMatch(/chassisPlaneTop\}\s*pointerEvents="none"/);
    expect(wrap).toMatch(/chassisPlaneBottom\}\s*pointerEvents="none"/);
    // …and no new ancestor was introduced anywhere in the chain.
    expect(wrap).not.toMatch(/<View[^>]*>\s*<ScrollView/);
  });

  /** ⚠ `cardWidth` is MEASURED and drives `snapToInterval`. A plane that carried
   *  width, padding or margin would desynchronise the pager from the card. */
  it('nothing added to the chain can change the measured card width', () => {
    for (const name of ['chassisPlaneTop', 'chassisPlaneBottom'] as const) {
      const s = flat(tartariaKitStyles[name]);
      for (const k of ['width', 'padding', 'paddingHorizontal', 'margin', 'marginHorizontal']) {
        expect(s).not.toHaveProperty(k);
      }
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   8. NESTED ACTIONS KEEP THEIR OWN HANDLERS
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — an interactive chassis does not swallow its children', () => {
  /** ⚠ The place cards nest STORE / TALK / GIFT / ✕ inside the outer card. A
   *  decorative layer that took a touch would eat those silently — the worst
   *  kind of visual change. Every plane in this screen is `pointerEvents="none"`. */
  it('every plane rendered in Exploration is non-interactive', () => {
    const planes = EXPLORATION.match(/<View style=\{tartariaKitStyles\.(?:chassis|control)Plane\w*\}[^/]*\/>/g) ?? [];
    expect(planes.length).toBeGreaterThan(0);
    for (const p of planes) expect(p).toContain('pointerEvents="none"');
  });

  it('the nested vendor actions still own their exact handlers and hit slop', () => {
    /* ⚠ EACH NESTED ACTION IS ITS OWN TOUCHABLE WITH ITS OWN HANDLER — asserted
     * as three separate claims rather than one span match, because the span
     * between an `onPress` and its label is prose that will keep moving while the
     * ownership must not. What matters is that the handler exists, the label
     * exists, and each nested control carries its own `hitSlop`. */
    for (const handler of [/setScreen\('vendor'\)/, /talkToNpc\(/, /openGift\(\)/]) {
      expect(EXPLORATION).toMatch(handler);
    }
    for (const label of ['STORE', 'TALK', 'GIFT']) {
      expect(EXPLORATION).toMatch(new RegExp(`placeChipTalkText[^>]*>${label}<`));
    }
    const talk = /placeChipTalk,[\s\S]{0,200}?onPress=\{\(\) => talkToNpc\([\s\S]{0,80}?hitSlop=\{8\}/;
    expect(EXPLORATION).toMatch(talk);
    // The gift action still stops propagation so the card's own tap cannot also fire.
    expect(EXPLORATION).toMatch(/e\.stopPropagation\(\);\s*useGameStore\.getState\(\)\.openGift\(\)/);
  });

  it('the compact nested controls keep their hit slop', () => {
    expect((EXPLORATION.match(/hitSlop=\{8\}/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(EXPLORATION).toMatch(/hitSlop=\{6\}/);   // the objective chip
    expect(EXPLORATION).toMatch(/hitSlop=\{10\}/);  // the crucible dismiss
  });

  /** ⚠ The planes are declared ONCE for five cards, so the five cannot drift, and
   *  the values still come from the kit rather than being written here. */
  it('the screen adopts the kit values and writes none of its own', () => {
    expect(EXPLORATION).toMatch(/const CHASSIS_PLANES = \(/);
    for (const lit of [T.chassisFaceLit, T.chassisSidewall, T.controlFaceLit, T.controlSidewall]) {
      expect(EXPLORATION).not.toContain(lit);
    }
    expect((EXPLORATION.match(/\{CHASSIS_PLANES\}/g) ?? []).length).toBe(5);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   9. THE WATERMARK — louder, and still decoration
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — the sigil can be seen and still cannot be touched', () => {
  it('it is more visible than it was, and still well under a tenth of the panel', () => {
    expect(WATERMARK_OPACITY).toBeGreaterThan(0.055); // the value that was invisible
    expect(WATERMARK_OPACITY).toBeLessThan(0.12);     // the ceiling OTA-1803 set
    expect(WATERMARK_INSET).toBe(0.08);               // unchanged, by ruling
  });

  it('it still joins no layout, takes no touch and says nothing to a screen reader', () => {
    expect(WATERMARK).toMatch(/position:\s*'absolute'/);
    expect(WATERMARK).toMatch(/pointerEvents="none"/);
    expect(WATERMARK).toMatch(/accessibilityElementsHidden/);
    expect(WATERMARK).toMatch(/importantForAccessibility="no-hide-descendants"/);
    for (const banned of ['flex:', 'padding', 'margin', 'minHeight']) {
      expect(WATERMARK).not.toContain(banned);
    }
  });

  it('it is still the feed panel\'s own sibling, rendered BEFORE the transcript', () => {
    const i = EXPLORATION.indexOf('<FactionWatermark');
    const j = EXPLORATION.indexOf('<AdventureFeed');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it('there is still no fallback art for a faction that has none', () => {
    expect(WATERMARK).toMatch(/if \(!source \|\| !art\) return null;/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   10. 320×568, AND THE FAMILIES THAT WERE DELIBERATELY LEFT ALONE
   ════════════════════════════════════════════════════════════════════════════ */
describe('Phase 1 — the smallest phone, and the scope firewall', () => {
  /** ⚠ Every load-bearing number the viewport work left behind is still here.
   *  None of them could move, because nothing this phase added owns geometry. */
  it('the Exploration layout contracts are untouched', () => {
    expect(EXPLORATION).toMatch(/feed:\s*\{\s*flex:\s*1,\s*flexShrink:\s*1,\s*minHeight:\s*0\s*\}/);
    expect(EXPLORATION).toMatch(/statsCol:\s*\{\s*flex:\s*1\s*\}/);
    expect(EXPLORATION).toMatch(/rightCol:\s*\{\s*flex:\s*1,\s*position:\s*'relative'\s*\}/);
    expect(EXPLORATION).toMatch(/minHeight:\s*34/);      // placeChip
    expect(EXPLORATION).toMatch(/flexBasis:\s*'47%'/);   // the wrap at 320
    expect(EXPLORATION).toMatch(/minWidth:\s*150/);
  });

  it('the chip chassis keeps its exact geometry and its clip', () => {
    const quick = /\bquick:\s*\{[^}]*\}/.exec(INPUT_BOX)?.[0] ?? '';
    expect(quick).toMatch(/paddingHorizontal:\s*10/);
    expect(quick).toMatch(/paddingVertical:\s*6/);
    expect(quick).toMatch(/borderWidth:\s*1/);
    expect(quick).toMatch(/overflow:\s*'hidden'/); // clips the planes to the radius
  });

  /* ⚠⚠⚠ C-2 — TABS ARE DEFERRED, AND THIS IS THE GUARD THAT PROVES NOTHING LEAKED.
   * The owner authorised a future selector grammar and ruled the implementation
   * deferred: "DO NOT edit TTabBar. DO NOT edit the OTA-1802 flat-tab guard yet…
   * For Phase 1, tabs remain byte-identical." A phase that quietly handed tabs a
   * plane would be exactly the game-wide migration the firewall forbids. */
  it('TTabBar took none of it — tabs are deferred, not migrated', () => {
    const iBar = KIT.indexOf('export function TTabBar(');
    const bar = iBar < 0 ? '' : KIT.slice(iBar, KIT.indexOf('\nexport ', iBar + 10));
    expect(bar).not.toBe('');
    expect(bar).not.toMatch(/controlPlane|chassisPlane|tControlDepth|recess/);
    expect(bar).toMatch(/accessibilityState=\{\{ selected: on \}\}/); // and it keeps this
    const chip = /\btabChip:\s*\{[^}]*\}/.exec(KIT)?.[0] ?? '';
    expect(chip).not.toMatch(/controlPlane|chassisPlane/);
  });

  /* ⚠⚠⚠ SUPERSEDED BY VISUAL LANGUAGE PHASE 3, AND REPLACED RATHER THAN
   * DELETED. This was Phase 1's SCOPE FIREWALL: the planes were proven on ONE
   * acceptance specimen, so any other file drawing them was a leak, and the
   * guard named the six files allowed to have them. The owner has since ruled
   * the opposite — the deprecated dialect is to be destroyed everywhere and the
   * construction propagated across the game's controls — so an allow-list of
   * six files is now the wrong SHAPE of claim: every migration would have to
   * edit it, which makes it paperwork rather than a guard.
   *
   * ⚠⚠ WHAT REPLACES IT IS STRICTLY STRONGER. The boundary that actually
   * matters was never "which files" — it is that the raised language marks
   * things you can TOUCH. So a plane may only appear in a file that owns at
   * least one `onPress`. A structural, read-only surface acquiring button depth
   * now fails here no matter which file it lives in, which the old allow-list
   * could not express at all. */
  it('the planes only ever land on control-bearing files', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const onStructural: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        const rel = path.relative(ROOT, p).split(path.sep).join('/');
        const code = codeOf(fs.readFileSync(p, 'utf8'));
        if (!/(controlPlane|chassisPlane|tartariaKitStyles\.recess)/.test(code)) continue;
        // The kit DEFINES them; every other file must be handing them to a control.
        if (rel === 'app/ui/tartariaKit.tsx') continue;
        /* ⚠⚠⚠ THE ONE FILE WHOSE TOUCH OWNER IS ITS PARENT, AND IT IS A RULING,
         * not an exemption of convenience. OTA-1443 / Phase 1 C-1: the WHOLE
         * StatsPanel is wrapped by a single `TouchableOpacity` in
         * ExplorationScreen carrying `accessibilityLabel="Open player sheet"`,
         * so the panel itself is deliberately touch-silent and must stay that
         * way — shrinking the target to a portrait was refused by name. It is
         * still an INTERACTIVE CHASSIS, so it still wears the chassis planes.
         * The exception is named, and the reason it is safe is asserted just
         * below rather than taken on trust. */
        if (rel === 'app/components/StatsPanel.tsx') continue;
        if (!/onPress/.test(code)) onStructural.push(rel);
      }
    };
    walk(path.join(ROOT, 'app'));
    expect(onStructural).toEqual([]);

    // The chassis above is only legitimate while its parent really does own the tap.
    const expl = codeOf(fs.readFileSync(path.join(ROOT, 'app/screens/ExplorationScreen.tsx'), 'utf8'));
    expect(expl).toContain('Open player sheet');
    const stats = codeOf(fs.readFileSync(path.join(ROOT, 'app/components/StatsPanel.tsx'), 'utf8'));
    expect(stats).not.toMatch(/onPress|accessibilityRole/);
  });
});
