/**
 * ⚠⚠⚠ OTA-1805 — THE ROOM DOOR PRESSES, AND THE INVARIANT THAT MISSED IT.
 *
 * Owner, on the device, after OTA-1804 shipped: *"Also look at the room
 * navigation buttons inside all the structures — those need to act like the
 * 'look around you' button."*
 *
 * ⚠⚠ THIS FILE REPLACES `buttonsPressLikeOneSystem.test.tsx`, WHICH WAS GREEN
 * AND WRONG. That suite asked ONE question — *does this `Pressable` append
 * `kit.controlPressed`?* — and every claim in it passed while the control the
 * owner was pointing at did not move at all. Three separate things were wrong
 * with the question:
 *
 *   1. IT ONLY ASKED ABOUT `Pressable`. `TravelBtn` — the room doors in every
 *      interior — is a `TouchableOpacity`, so it was never in the corpus. A
 *      `TouchableOpacity` has NO `({ pressed }) => …` style callback and no
 *      render-prop children, so the depth language is STRUCTURALLY UNREACHABLE
 *      inside one. It cannot fail the old invariant because it cannot be asked.
 *   2. IT TREATED `controlPressed` AS THE WHOLE DEPRESSION. It is one of two
 *      layers. A key that draws the three planes ALSO has to redraw them
 *      pressed, or the face travels 3dp down while its 4dp sidewall stays 4dp
 *      tall — the key moves but never loses height, which is most of what
 *      "depressing" looks like. `TravelBtn` drew the planes FROZEN.
 *   3. IT COUNTED PRESENCE, NOT PARTICIPATION. `style={[a, b]}` naming an
 *      authority satisfied a construction census (OTA-1804) and a frozen
 *      `{CTL_PLANES}` satisfies a plane census; neither is a function of the
 *      finger.
 *
 * ⚠⚠⚠ SO THE QUESTION IS NOW THE OWNER'S QUESTION: IF TARTARIA VISUALLY
 * CONSTRUCTS SOMETHING AS A PHYSICAL KEY, DOES THAT SURFACE ACTUALLY DEPRESS?
 * Three properties, all three required, none sufficient:
 *   (a) the primitive can REPORT the press (`Pressable`, not `TouchableOpacity`);
 *   (b) the ring inverts and the face travels (`tControlDepth(pressed)`);
 *   (c) the PLANES are a function of `pressed`, so the key loses height.
 *
 * ⚠ THE A/B PAIR IS IN ONE FILE, AND THAT IS THE PROOF. `QuickBtn` (LOOK
 * AROUND, the owner's device-proven reference) and `TravelBtn` (the room doors)
 * live ~280 lines apart in `app/components/InputBox.tsx`, went through the same
 * Phase 3 pass, and wore the same construction — and only one of them pressed.
 * Section 2 asserts they are now identical on all three axes.
 *
 * ⚠⚠ AND SECTION 6 IS A CEILING, NOT A CLEAN BILL OF HEALTH. Fifty-two plane
 * sites elsewhere in the app are still frozen. This repair is scoped to the
 * controls the owner named; the ratchet makes the remainder VISIBLE and
 * BOUNDED — the count may only fall — rather than letting a passing suite imply
 * the class is closed. It is not closed.
 *
 * WHAT THIS FILE CANNOT PROVE: that the settle is perceptible on a Pixel. That
 * is the owner's eye and it is not claimed here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { StyleSheet } from 'react-native';
import { tartariaKitStyles as kit, tControlDepth, T } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
/** Grade the code, not the prose — a comment naming a token proves nothing. */
const codeOf = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

const INPUTBOX = codeOf(read('app/components/InputBox.tsx'));

/** The source span of one named component, from its `function X(` to the next
 *  top-level `function ` / `const styles =`. Line-independent on purpose: this
 *  file must not become the fifth source-position pin to drift. */
function componentBody(code: string, name: string): string {
  const start = code.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const after = code.slice(start + 1);
  const rel = after.search(/\n(?:function |const styles = )/);
  return rel === -1 ? after : after.slice(0, rel);
}

const QUICK = componentBody(INPUTBOX, 'QuickBtn');
const TRAVEL = componentBody(INPUTBOX, 'TravelBtn');

/** The three properties, asked of one component's source. */
const reportsPress = (body: string) => /<Pressable\b/.test(body) && !/<TouchableOpacity\b/.test(body);
const ringTravels = (body: string) => /tControlDepth\(pressed\)/.test(body)
  || /pressed && (?:kit|tartariaKitStyles)\.controlPressed/.test(body);
const planesCollapse = (body: string) =>
  /pressed \? (?:kit|tartariaKitStyles)\.controlPlaneTopPressed : (?:kit|tartariaKitStyles)\.controlPlaneTop\b/.test(body)
  && /pressed \? (?:kit|tartariaKitStyles)\.controlPlaneBottomPressed : (?:kit|tartariaKitStyles)\.controlPlaneBottom\b/.test(body)
  && /pressed \? null : <View style=\{(?:kit|tartariaKitStyles)\.controlPlaneContact\}/.test(body);

describe('1. the canon: what a Tartaria key does under a finger', () => {
  it('the ring inverts and the face travels — and there is no fade in it', () => {
    const rest = flat(tControlDepth(false));
    const down = flat(tControlDepth(true));
    expect(rest.borderTopColor).toBe(T.controlRaisedLit);
    expect(rest.borderBottomColor).toBe(T.controlRaisedDark);
    expect(rest.transform).toBeUndefined();
    expect(down.borderTopColor).toBe(T.controlRaisedDark);
    expect(down.borderBottomColor).toBe(T.controlRaisedLit);
    expect((down.transform as [{ translateY: number }])[0].translateY).toBeGreaterThanOrEqual(2);
    // ⚠ OTA-1791 replaced the gold pill's fade with depth. Nothing here may
    // smuggle opacity back in through the shared style.
    expect(rest).not.toHaveProperty('opacity');
    expect(down).not.toHaveProperty('opacity');
  });

  it('⚠⚠ AND THE RING IS ONLY HALF OF IT — the sidewall collapses and crosses sides', () => {
    // This is the half the previous suite never asked about, and the reason a
    // control could hold `controlPressed` and still look inert: at rest the key
    // stands on a 4dp sidewall above a 1dp contact band; pressed, the sidewall
    // is 1dp and has moved ABOVE the face, and the contact band is not drawn.
    // The apparent height goes 5dp → 1dp. THAT is the depression.
    const restTop = flat(kit.controlPlaneTop);
    const restBottom = flat(kit.controlPlaneBottom);
    const downTop = flat(kit.controlPlaneTopPressed);
    const downBottom = flat(kit.controlPlaneBottomPressed);
    // At rest: a thin catch of light on top, a tall shaded SIDE beneath, lifted
    // 1dp off the rim so the contact band fits under it.
    expect(restTop.backgroundColor).toBe(T.controlFaceLit);
    expect(restBottom.backgroundColor).toBe(T.controlSidewall);
    expect(restBottom.height as number).toBeGreaterThan(restTop.height as number);
    expect(restBottom.bottom).toBe(1);
    expect(flat(kit.controlPlaneContact).backgroundColor).toBe(T.controlContact);
    // Pressed: the side is now the TOP band, the light is underneath, and the
    // side is a fraction of its resting height.
    expect(downTop.backgroundColor).toBe(T.controlSidewall);
    expect(downBottom.backgroundColor).toBe(T.controlFaceLit);
    expect(downTop.height as number).toBeLessThan(restBottom.height as number);
    expect(downBottom.height as number).toBeLessThanOrEqual(restTop.height as number);
    // ⚠ The whole construction is colour and geometry. No shadow, no gloss, no
    // elevation, no animation — the owner's do-not list, asserted.
    for (const s of [restTop, restBottom, downTop, downBottom]) {
      for (const k of ['shadowOpacity', 'elevation', 'shadowRadius', 'opacity']) {
        expect(s).not.toHaveProperty(k);
      }
    }
  });
});

describe('2. ⚠⚠⚠ THE A/B PAIR — LOOK AROUND and the room doors, one file apart', () => {
  it('LOOK AROUND (QuickBtn) has all three properties — it is the reference because it works', () => {
    expect([reportsPress(QUICK), ringTravels(QUICK), planesCollapse(QUICK)]).toEqual([true, true, true]);
  });

  it('⚠ the room doors (TravelBtn) NOW have the same three, and that is the repair', () => {
    expect([reportsPress(TRAVEL), ringTravels(TRAVEL), planesCollapse(TRAVEL)]).toEqual([true, true, true]);
  });

  it('the fade is GONE rather than kept alongside the settle', () => {
    // OTA-1782: "the depth language replaces a fade with a settle: nothing goes
    // translucent." A translucent chip also lets a player-tuned background
    // flood through it, which arb86 had to remove from the disabled state.
    expect(TRAVEL).not.toMatch(/activeOpacity/);
    expect(QUICK).not.toMatch(/activeOpacity/);
  });

  it('the room door invented no private cue — it reaches the same shared authority', () => {
    expect(TRAVEL).not.toMatch(/Animated|withSpring|withTiming|setTimeout|requestAnimationFrame/);
    // No local pressed-* style of its own; the kit owns the vocabulary.
    expect(codeOf(read('app/components/InputBox.tsx'))).not.toMatch(/travelBtnPressed\s*:/);
  });
});

describe('3. the repair reaches EVERY interior, and nothing else had to move', () => {
  it('one component draws every room tab, the cardinals and EXIT — 19 call sites, no copies', () => {
    const sites = INPUTBOX.match(/<TravelBtn\b/g) ?? [];
    expect(sites.length).toBeGreaterThanOrEqual(19);
    // The room tabs inside a structure: the owner's named control.
    expect(INPUTBOX).toMatch(/buildingRooms\.slice\(0, 6\)\.map\(\(r\) => \(\s*<TravelBtn/);
    // And the way out of one, which shares the same key.
    expect(INPUTBOX).toMatch(/<TravelBtn label="🚪 EXIT" wayOut testID="exit-chip"/);
    // Nobody hand-rolled a second room door elsewhere in the app.
    const others = execSync('grep -rl "buildingRooms" app --include=*.tsx || true', { cwd: ROOT })
      .toString().trim().split('\n').filter(Boolean);
    expect(others).toEqual(['app/components/InputBox.tsx']);
  });

  it('the whole repair is one component plus the stamp', () => {
    /* ⚠ Reads the COMMIT (HEAD~1..HEAD), not the working tree, so it states
     * what actually shipped rather than what is open on a desk. Skipped — not
     * failed — outside a git checkout: an unprovable claim must never be
     * reported as a proven one. */
    let changed: string[] = [];
    try {
      changed = execSync('git diff --name-only HEAD~1 HEAD -- app/', { cwd: ROOT })
        .toString().trim().split('\n').filter(Boolean);
    } catch { return; } // packaged run — unprovable here, not falsely claimed
    if (changed.length === 0) return;
    expect(changed.sort()).toEqual(['app/buildInfo.ts', 'app/components/InputBox.tsx']);
  });
});

describe('4. the BEHAVIOUR of a room door is untouched — only its surface moved', () => {
  it('the tap breadcrumb is still first, before any handler', () => {
    // OTA-1172 — moving this below a handler destroys the only signal that
    // separates "the tap never arrived" from "the tap arrived and the work hung".
    expect(TRAVEL).toMatch(/const handlePress = \(\) => \{\s*logUiTap\(label\);/);
  });

  it('a blocked door still buzzes and returns; a spent door still speaks and costs nothing', () => {
    expect(TRAVEL).toMatch(/if \(blocked\) \{ buzzWrong\(\); useGameStore\.getState\(\)\.nudgeTutorialBlocked\(\); return; \}/);
    // OTA-1458 — a spent tap must not reach the store's travel path, or it
    // spends the 15-minute anti-stuck tick for a move that never happened.
    const spent = TRAVEL.slice(TRAVEL.indexOf('if (spent)'));
    expect(spent).toMatch(/buzzSpent\(\)/);
    expect(spent).toMatch(/appendLog\(/);
    expect(spent.slice(0, spent.indexOf('onPress()'))).toMatch(/return;/);
  });

  it('⚠ a dead door KEEPS its physical construction and is carried by the dim', () => {
    // The owner's ruling, recorded over QuickBtn's planes and applied here: "a
    // disabled control remains physically constructed as a button. Its semantic
    // state may dim/mute it, but it must not lose the physical button
    // construction." So `travelBtnBlocked` carries the state...
    expect(INPUTBOX).toMatch(/travelBtnBlocked: \{ borderColor: '#2a2620', backgroundColor: '#141210', opacity: 0\.5 \}/);
    // ...and the depth term is NOT conditioned on it. One construction, one dim.
    expect(TRAVEL).toMatch(/tControlDepth\(pressed\)\]/);
    expect(TRAVEL).not.toMatch(/!\(blocked \|\| spent\) && tControlDepth/);
  });

  it('the handle, the screen-reader identity and the selected/disabled states all survive', () => {
    expect(TRAVEL).toMatch(/testID=\{testID\}/);
    expect(TRAVEL).toMatch(/onPressIn=\{noteTouchDown\}/);
    expect(TRAVEL).toMatch(/onPress=\{handlePress\}/);
    expect(TRAVEL).toMatch(/accessibilityRole="button"/);
    expect(TRAVEL).toMatch(/accessibilityState=\{\{ disabled: !!blocked, selected: !!active \}\}/);
    expect(TRAVEL).toMatch(/accessibilityLabel=\{a11yLabel \?\?/);
    // ⚠ OTA-1025's shrink floor and OTA-1428's arrow/✓ label are untouched.
    expect(TRAVEL).toMatch(/minimumFontScale=\{0\.8\}/);
    expect(TRAVEL).toMatch(/\{active \? `▸ \$\{label\}` : label\}/);
  });
});

describe('5. AT REST the room doors are byte-for-byte what shipped in 1804', () => {
  it('the appended depth term contributes nothing with the finger up', () => {
    // The whole no-visual-regression argument, as a property rather than a
    // promise: at rest `tControlDepth(false)` is `controlResting`, whose two
    // colours are the two `ctl` already sets.
    const before = flat([kit.ctl, kit.ctlOn]);
    const atRest = flat([kit.ctl, kit.ctlOn, tControlDepth(false)]);
    expect(atRest).toEqual(before);
    expect(atRest.transform).toBeUndefined();
  });

  it('the geometry of the box is unchanged — same size, same target, same row', () => {
    /* ⚠ Property by property rather than one shape regex: the block carries
     * TRAILING `// OTA-1025` comments, which `codeOf` leaves in place (it only
     * blanks a comment that OWNS its line), so a whole-block pattern would be
     * asserting the comments too. */
    const box = INPUTBOX.slice(INPUTBOX.indexOf('  travelBtn: {'));
    const decl = box.slice(0, box.indexOf('},') + 2);
    for (const prop of ['flexGrow: 1', "flexBasis: '22%'", 'minWidth: 92',
      'paddingVertical: 10', "alignItems: 'center'"]) {
      expect(decl).toContain(prop);
    }
    // And nothing was added to it — five properties, the five that shipped.
    expect((decl.match(/^\s{4}[a-zA-Z]+:/gm) ?? []).length).toBe(5);
    expect(INPUTBOX).toMatch(/travelRow: \{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' \}/);
    // And the press cue is a transform, so no sibling reflows and the hit area
    // does not walk out from under the finger onto a neighbouring door.
    const down = flat(tControlDepth(true));
    expect(down.transform).toBeDefined();
    for (const k of ['marginTop', 'top', 'paddingTop', 'height', 'marginBottom']) {
      expect(down).not.toHaveProperty(k);
    }
  });

  it('the planes still cost zero layout and carry no identity of their own', () => {
    for (const s of [kit.controlPlaneTop, kit.controlPlaneBottom, kit.controlPlaneContact,
      kit.controlPlaneTopPressed, kit.controlPlaneBottomPressed]) {
      expect(flat(s).position).toBe('absolute');
    }
    const planes = TRAVEL.slice(TRAVEL.indexOf('controlPlaneTopPressed'));
    expect((planes.match(/pointerEvents="none"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('6. ⚠⚠⚠ THE CLASS IS NOT CLOSED — a shrink-only ceiling on frozen planes', () => {
  /** Every site that DRAWS a control plane, graded on whether the drawing is a
   *  function of `pressed`. A frozen site is a key that cannot lose height. */
  const sites = (() => {
    const files = execSync('find app -name "*.tsx"', { cwd: ROOT }).toString().trim().split('\n').sort();
    const frozen: string[] = []; const live: string[] = [];
    for (const f of files) {
      const code = codeOf(readFileSync(join(ROOT, f), 'utf8'));
      const re = /style=\{([^}]*controlPlaneTop\b[^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        (/pressed/.test(m[1]!) ? live : frozen).push(f);
      }
    }
    return { frozen, live };
  })();

  it('the room doors and LOOK AROUND are both on the LIVE side', () => {
    expect(sites.live.filter((f) => f === 'app/components/InputBox.tsx').length).toBe(2);
    expect(sites.live.length).toBeGreaterThanOrEqual(8);
  });

  it('⚠ 52 plane sites elsewhere are STILL FROZEN, and this number may only fall', () => {
    /* ⚠⚠ THIS ASSERTION IS THE HONEST PART OF THE SUITE. OTA-1805 repairs the
     * controls the owner named and NOTHING ELSE — the wider class (frozen
     * planes, and separately the physical keys built on `TouchableOpacity`,
     * which cannot express `pressed` at all) is awaiting his scope ruling. A
     * ceiling rather than a target: adopting the live idiom at any site is
     * never a failure, and a NEW frozen site fails immediately. */
    expect(sites.frozen.length).toBeLessThanOrEqual(52);
    // Not vacuous — the corpus really is full of plane-drawing controls.
    expect(sites.frozen.length + sites.live.length).toBeGreaterThan(50);
  });

  it('and the remaining gap is named, not merely counted', () => {
    // The structural reason the wider class exists: a physical key built on a
    // primitive that has no `pressed` to report. Still true of many controls.
    const stuck = execSync(
      'grep -rln "TouchableOpacity" app --include=*.tsx | xargs grep -l "controlPlaneTop" || true',
      { cwd: ROOT },
    ).toString().trim().split('\n').filter(Boolean);
    expect(stuck.length).toBeGreaterThan(0);
    // InputBox is no longer stuck for its ROOM DOORS; it still holds other
    // TouchableOpacity keys (SEND, the keyboard dismiss), which is why it is
    // still on this list. The claim is about the class, not this file.
    expect(TRAVEL).not.toMatch(/TouchableOpacity/);
  });
});

describe('7. ⚠⚠⚠ THE CHARACTER SCREEN IS PROTECTED — artwork, crest, composition', () => {
  const PORTRAIT = 'app/components/CharacterPortrait.tsx';
  const SCREEN = 'app/screens/CharacterScreen.tsx';

  it('the faded portrait band lives in a file with NO controls at all', () => {
    // The strongest non-regression argument available: the protected artwork is
    // structurally outside the blast radius of any button repair, because there
    // is no button in it to repair.
    const src = read(PORTRAIT);
    expect(src).not.toMatch(/<Pressable\b/);
    expect(src).not.toMatch(/<Touchable\w*\b/);
    expect(src).not.toMatch(/\bonPress\b/);
  });

  it('the band, the portrait fill and the corner crest keep their exact geometry', () => {
    const src = read(PORTRAIT);
    expect(src).toMatch(/width: '100%'/);
    expect(src).toMatch(/overflow: 'hidden'/);
    expect(src).toMatch(/portrait: \{ width: '100%', height: '100%' \}/);
    expect(src).toMatch(/resizeMode="contain"/);
    // ⚠ top 10 / left 10 at CREST_SIZE — the owner: DO NOT MOVE IT.
    expect(src).toMatch(/position: 'absolute',\s*top: 10,\s*left: 10,\s*width: CREST_SIZE,\s*height: CREST_SIZE/);
    expect(src).toMatch(/MAX_SCREEN_FRACTION/);
    expect(src).toMatch(/Image\.resolveAssetSource/);
  });

  it('the screen still composes the portrait above the header card, unreplaced', () => {
    const code = codeOf(read(SCREEN));
    expect(code).toMatch(/<CharacterPortrait[\s\S]{0,260}factionId=\{player\.factionId\}/);
    expect(code).toMatch(/factionName=\{faction\?\.name\}/);
    // The race · faction subline the owner named (Tartarian Giants · Mud Monarchs).
    expect(code).toMatch(/\{faction \? ` · \$\{faction\.name\}/);
    expect(code).not.toMatch(/CharacterCreationScreen/);
  });

  it('neither protected file is in this repair\'s diff', () => {
    let changed: string[] = [];
    try {
      changed = execSync('git diff --name-only HEAD~1 -- app/', { cwd: ROOT })
        .toString().trim().split('\n').filter(Boolean);
    } catch { return; }
    expect(changed).not.toContain(PORTRAIT);
    expect(changed).not.toContain(SCREEN);
  });
});

describe('8. the stamp is what the game DISPLAYS, so it has to change', () => {
  it('this bundle is not wearing 1804\'s badge', () => {
    // A different bundle under the same stamp looks exactly like no update
    // arriving: the just-updated modal keys on a CHANGE in OTA_BUILD_ID.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTA_BUILD_ID } = require('../app/buildInfo') as { OTA_BUILD_ID: string };
    expect(OTA_BUILD_ID).toMatch(/^2026-09-12-1805-/);
    expect(OTA_BUILD_ID).not.toMatch(/-1804-/);
  });
});
