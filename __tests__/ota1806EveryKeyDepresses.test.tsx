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

  it('the room door is ONE component — declared once, used nowhere else', () => {
    /* ⚠⚠⚠ CLASS P — PRE-EXISTING LATENT VALIDATION DEFECT, exposed while
     * validating OTA-1807 and repaired there. It is NOT part of that Baker
     * repair and must not be read as one.
     *
     * WHAT WAS WRONG. This asserted `git diff --name-only HEAD~1 HEAD -- app/`
     * equalled exactly ['app/buildInfo.ts', 'app/components/InputBox.tsx'] —
     * OTA-1805's file set, carried into this renamed suite without being
     * updated. Two independent faults, both measured rather than argued:
     *
     *   • FALSE after its own commit. At e7eea2e3 — this suite's own published
     *     SHA — that command returns 48 files, because 1806 swept the whole key
     *     class. A clean worktree at e7eea2e3 runs 1 failed / 29 passed, with
     *     THIS test the only failure, carrying none of 1807's changes.
     *   • VACUOUS in CI. `actions/checkout@v4` defaults to fetch-depth 1, and in
     *     a one-commit clone `git diff HEAD~1 HEAD` is `fatal: bad revision
     *     'HEAD~1'`: execSync throws, the catch returns, and the test passes
     *     having checked nothing. Required 1806 CI and publication were green
     *     over it for that reason, not because the claim held.
     *
     * ⚠ THE SHAPE WAS UNFIXABLE, NOT MIS-PARAMETERISED. Any range measured from
     * HEAD stops describing an OTA the moment that OTA's own commit lands, so
     * re-pointing it at another moving range would reproduce the defect on the
     * next OTA. It is therefore replaced rather than re-aimed — and NOT by
     * expecting today's 48-file diff, which would be the same trap re-armed.
     *
     * WHAT IT RESTORES. The section's durable claim is CONFINEMENT: the room
     * door is one component, not copies. The test above already proves that of
     * the room DATA (`buildingRooms` appears in one file); this proves it of the
     * CONTROL, which is the half the deleted assertion was reaching for and the
     * half no other test covers. Tree-provable, and true in a shallow clone. */
    const declares = execSync('grep -rl "function TravelBtn" app --include=*.tsx || true', { cwd: ROOT })
      .toString().trim().split('\n').filter(Boolean);
    expect(declares).toEqual(['app/components/InputBox.tsx']);
    // ⚠ A grep that matches nothing returns [] and would make the equality above
    // pass for the wrong reason. Assert the subject was actually found.
    expect(declares.length).toBe(1);
    const uses = execSync('grep -rl "<TravelBtn" app --include=*.tsx || true', { cwd: ROOT })
      .toString().trim().split('\n').filter(Boolean);
    expect(uses).toEqual(['app/components/InputBox.tsx']);
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

describe('6. ⚠⚠⚠ THE CLASS, CENSUSED — and what is deliberately left out', () => {
  /** Classify every control that is ITSELF constructed as a Tartaria key.
   *
   *  ⚠⚠ NESTED CONTROLS ARE SUBTRACTED, and that correction matters: an earlier
   *  cut tested the whole element span, so a plain `View`-ish container wrapping
   *  a key scored as a key — which is exactly how the Inventory category header
   *  first appeared in this census when it is not built as a key at all.
   *
   *  ⚠ AND THE CANON INCLUDES `tFilledGold(pressed)`. OTA-1791 consolidated ten
   *  hand-copied gold pills onto it; a classifier that only knows
   *  `tControlDepth` reports twelve finished controls as defects. */
  type Row = { f: string; line: number; cls: string };
  const rows: Row[] = (() => {
    const tagEnd = (str: string, i: number) => {
      let d = 0; let q = '';
      while (i < str.length) {
        const c = str[i]!;
        if (q) { if (c === q && str[i - 1] !== '\\') q = ''; i += 1; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; i += 1; continue; }
        if (c === '{') { d += 1; i += 1; continue; }
        if (c === '}') { d -= 1; i += 1; continue; }
        if (c === '>' && d === 0) return i;
        i += 1;
      }
      return i;
    };
    const spanEnd = (str: string, i: number, tag: string) => {
      const e = tagEnd(str, i);
      if (str[e - 1] === '/') return e + 1;
      let d = 1; let j = e + 1;
      const open = new RegExp(`<${tag}\\b`, 'g'); const close = new RegExp(`</${tag}>`, 'g');
      while (d > 0 && j < str.length) {
        open.lastIndex = j; close.lastIndex = j;
        const o = open.exec(str); const c = close.exec(str);
        if (!c) break;
        if (o && o.index < c.index) { d += 1; j = o.index + 1; } else { d -= 1; j = c.index + 1; }
      }
      return str.indexOf('>', j) + 1;
    };
    const MATERIAL = /kit\.ctl\b|tartariaKitStyles\.ctl\b|tControlDepth|tFilledGold|containerStyle\(|ctlStyle\(/;
    const PLANES = /controlPlane|CTL_PLANES|ctlPlanes\(/;
    const files = execSync('find app -name "*.tsx"', { cwd: ROOT }).toString().trim().split('\n').sort();
    const out: Row[] = [];
    for (const f of files) {
      const code = codeOf(readFileSync(join(ROOT, f), 'utf8'));
      const hits: Array<{ i: number; tag: string; end: number }> = [];
      for (const tag of ['Pressable', 'TouchableOpacity']) {
        const re = new RegExp(`<${tag}\\b`, 'g'); let m: RegExpExecArray | null;
        while ((m = re.exec(code))) hits.push({ i: m.index, tag, end: spanEnd(code, m.index, tag) });
      }
      hits.sort((a, b) => a.i - b.i);
      for (const h of hits) {
        const attrsEnd = tagEnd(code, h.i);
        const attrs = code.slice(h.i, attrsEnd);
        if (!/onPress\s*=/.test(attrs)) continue;
        let body = code.slice(attrsEnd, h.end);
        for (const n of hits) if (n.i > h.i && n.i < h.end) body = body.replace(code.slice(n.i, n.end), '');
        if (!MATERIAL.test(attrs) && !PLANES.test(attrs + body)) continue;
        const pressedHalf = /style=\{\(\s*\{\s*pressed/.test(attrs) || /\bpressed\s*&&/.test(attrs);
        const canon = /tControlDepth\(pressed\)|tFilledGold\(pressed\)|pressed && \w+\.controlPressed|containerStyle\(pressed\)|ctlStyle\(pressed\)/.test(attrs);
        const draws = PLANES.test(body);
        /* ⚠ EVERY FORM IN WHICH THE PLANES FOLLOW THE FINGER, not just the
         * inline ternary. A first cut knew only that one and reported all 151
         * repaired sites as defects, because the ternary now lives INSIDE the
         * file's `ctlPlanes` helper and the call site just passes `pressed`. */
        const live = /pressed \? \w+\.controlPlaneTopPressed/.test(body)
          || /ctlPlanes\(pressed\)/.test(body)
          || /\{pressed \? \(<>/.test(body);
        const cls = h.tag === 'TouchableOpacity' ? 'C-FADE-ONLY'
          : !pressedHalf ? 'D-INERT'
          : !canon ? 'E-LOCAL-CUE'
          : (draws && !live) ? 'B-PARTIAL' : 'A-COMPLETE';
        out.push({ f, line: code.slice(0, h.i).split('\n').length, cls });
      }
    }
    return out;
  })();
  const of = (c: string) => rows.filter((r) => r.cls === c);

  it('⚠⚠⚠ NOT ONE physical key is built on a primitive that cannot report a press', () => {
    /* The defect the owner kept feeling and no census could see: a control
     * wearing the full key construction on a `TouchableOpacity`, whose only
     * possible answer to a finger is a fade of the whole chip. 99 of these
     * before this pass. The claim is ZERO, and it closes the class. */
    expect(of('C-FADE-ONLY').map((r) => `${r.f}:${r.line}`)).toEqual([]);
  });

  it('no constructed key is inert, and the corpus is big enough for that to mean something', () => {
    expect(of('D-INERT').map((r) => `${r.f}:${r.line}`)).toEqual([]);
    expect(of('A-COMPLETE').length).toBeGreaterThanOrEqual(232);
    expect(rows.length).toBeGreaterThan(250);
  });

  it('and no key travels while its planes stay frozen at resting height', () => {
    /* The second half of the defect, and the half OTA-1804's census could not
     * see: a ring that inverts over a 4dp sidewall that never shrinks. The key
     * moves and never loses height, which is most of what a press looks like. */
    expect(of('B-PARTIAL').map((r) => `${r.f}:${r.line}`)).toEqual([]);
  });

  it('⚠⚠ the 26 local-cue controls are EXEMPT BY DECISION, and the list may only shrink', () => {
    /* These already answer a finger — they simply answer with a local style
     * instead of the kit canon. Several are list rows and cards, where the
     * standing chassis ruling forbids command-key travel outright; one is
     * DEACTIVATE, the control the owner named as the most responsive on the
     * device. Converting them is a LOOK change, not a dead-button fix, so this
     * pass reports them instead of sweeping them in. A ceiling, not a target. */
    expect(of('E-LOCAL-CUE').length).toBeLessThanOrEqual(26);
    // and the boundary is real: the kit still has no row-pressed style, so
    // "make the rows travel too" cannot happen by accident.
    expect(Object.keys(kit)).not.toContain('rowPressed');
  });
});

describe('6b. the Inventory collapsible headers — the owner\'s named controls', () => {
  const INV = codeOf(read('app/screens/InventoryScreen.tsx'));

  it('the category header is a Pressable that travels and takes pressed-only planes', () => {
    const head = INV.slice(INV.indexOf('styles.sectionHeader, { borderLeftColor'));
    expect(head).toMatch(/pressed && kit\.controlPressed/);
    /* ⚠ Bounded by what FOLLOWS the header, not by the first `</Pressable>`:
     * the header WRAPS a nested control (the FUSABLE view's SELECT ALL), so the
     * first closing tag is the child's and cuts the body in half. */
    const body = head.slice(0, head.indexOf('{!collapsed && categoryRuns'));
    expect(body).toMatch(/\{pressed \? \(<>/);
    expect(body).toMatch(/kit\.controlPlaneTopPressed/);
    expect(body).toMatch(/kit\.controlPlaneBottomPressed/);
    // and NOT the resting planes — nothing new appears in the list at rest.
    expect(body).not.toMatch(/kit\.controlPlaneTop\}/);
    expect(INV).not.toMatch(/<TouchableOpacity[\s\S]{0,200}styles\.sectionHeader/);
  });

  it('⚠ AT REST the header is exactly what it was — no construction was added', () => {
    // The plate itself is untouched: same translucent fill, same 4dp category
    // bar, same radius. Only a pressed branch was added.
    expect(INV).toMatch(/backgroundColor: 'rgba\(8,6,4,0\.55\)'/);
    expect(INV).toMatch(/borderLeftWidth: 4/);
    expect(INV).toMatch(/borderRadius: 3/);
    // and it did not quietly acquire the kit's key material
    const decl = INV.slice(INV.indexOf('  sectionHeader: {'));
    expect(decl.slice(0, decl.indexOf('},') + 2)).not.toMatch(/kit\.ctl|borderWidth/);
  });

  it('the rack headers travel, and take NO planes — a bare row has no height to lose', () => {
    const rack = INV.slice(INV.indexOf('function RackFrame('));
    expect(rack).toMatch(/style=\{\(\{ pressed \}\) => \[rackFrameStyles\.header, pressed && kit\.controlPressed\]\}/);
    expect(rack.slice(0, rack.indexOf('const rackFrameStyles'))).not.toMatch(/controlPlane/);
    // the row is still a bare row: no fill, no ring, no radius
    expect(INV).toMatch(/header: \{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 \}/);
  });

  it('both headers still toggle exactly what they toggled', () => {
    expect(INV).toMatch(/setCollapsedSections\(\(s\) => \(\{ \.\.\.s, \[cat\]: !\(s\[cat\] \?\? true\) \}\)\)/);
    expect(INV).toMatch(/accessibilityState=\{\{ expanded: !collapsed \}\}/);
    expect(INV).toMatch(/accessibilityState=\{\{ expanded: open \}\}/);
  });
});

describe('6c. the Act buttons stopped drawing six plane layers', () => {
  it('⚠ a real defect this pass uncovered: three inline planes PLUS {CTL_PLANES}', () => {
    /* Both Act buttons had carried the inline triple AND the shared fragment
     * since Phase 1 — six absolutely-positioned layers on one 
     * control, painting the same three bands twice. Now one call. */
    for (const f of ['app/components/InputBox.tsx', 'app/components/KeyboardInputBar.tsx']) {
      const src = codeOf(read(f));
      const act = src.slice(src.indexOf('styles.sendText'));
      const region = act.slice(0, 400);
      expect(region).toMatch(/\{ctlPlanes\(pressed\)\}/);
      expect(region).not.toMatch(/<View style=\{tartariaKitStyles\.controlPlaneTop\}/);
    }
  });

  it('every file that draws planes has ONE authority for them', () => {
    const files = execSync('grep -rl "const ctlPlanes = (pressed: boolean)" app --include=*.tsx', { cwd: ROOT })
      .toString().trim().split('\n').filter(Boolean);
    expect(files.length).toBeGreaterThanOrEqual(30);
    for (const f of files) {
      const src = codeOf(read(f));
      // the frozen const, where it survives, is DERIVED from the function
      if (/const CTL_PLANES/.test(src)) expect(src).toMatch(/const CTL_PLANES = ctlPlanes\(false\);/);
    }
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

  /* ⚠⚠⚠ OTA-1810 — THIS CLAIM WAS A `HEAD~1` DIFF AND IS NOW A PROPERTY.
   * ⚠⚠ AN EXISTING GUARD WAS REWRITTEN. THAT IS DISCLOSED, NOT BURIED.
   *
   * It read `git diff --name-only HEAD~1 -- app/` and refused if either
   * protected file appeared. Two things were wrong with it, and the owner has
   * since named both as standing validation debt:
   *
   *   1. IT DEPENDED ON MOVING GIT HISTORY. `HEAD~1` is whatever happened to
   *      land before this commit, so the claim meant something different on
   *      every push and nothing at all after a rebase. Worse, its
   *      `try { … } catch { return; }` FAILED OPEN: on a shallow clone — which
   *      is what CI checks out — `HEAD~1` does not resolve, the catch returns,
   *      and the test passes by not running. A guard that cannot fail where it
   *      matters most is not a guard.
   *   2. IT PROTECTED A COMMIT, NOT A PROPERTY. "CharacterScreen.tsx is absent
   *      from today's diff" is a fact about one diff, not about the artwork.
   *
   * ⚠ AND THE PREMISE WAS SUPERSEDED BY THE OWNER, IN WRITING. OTA-1810 was
   * explicitly commissioned to repair the Character expandable headers, which
   * live in `CharacterScreen.tsx`; the same instruction re-scoped the firewall
   * to `CharacterPortrait` — the file that actually owns artwork, background,
   * banner, faction crest, sex mark, motive and caption. This assertion could
   * not have passed and could not have been satisfied by any correct version of
   * the authorised work.
   *
   * ⚠⚠ SO THE PROTECTION IS STRONGER HERE, NOT WEAKER. The three claims above
   * are UNTOUCHED and still assert the portrait's geometry, its crest position
   * and the screen's composition of it. This one now asserts the invariant the
   * diff check was only ever a proxy for, and does it in every commit rather
   * than one: the portrait is never converted into, or wrapped in, a control. */
  it('the portrait is never a control, and is never wrapped in one — in any commit', () => {
    const portrait = read(PORTRAIT);
    expect(portrait).not.toMatch(/<Pressable\b/);
    expect(portrait).not.toMatch(/<Touchable\w*\b/);
    expect(portrait).not.toMatch(/\bonPress\b/);
    expect(portrait).not.toMatch(/controlPressed|tControlDepth/);

    // …and the screen renders it as a bare element: every touchable opened
    // before it is also closed before it, so no control encloses the artwork.
    const code = codeOf(read(SCREEN));
    const at = code.indexOf('<CharacterPortrait');
    expect(at).toBeGreaterThan(-1);
    const opened = [...code.slice(0, at).matchAll(/<(?:Pressable|TouchableOpacity)\b/g)].length;
    const closed = [...code.slice(0, at).matchAll(/<\/(?:Pressable|TouchableOpacity)>/g)].length;
    expect(opened).toBe(closed);
  });
});

describe('8. the stamp is what the game DISPLAYS, so it has to change', () => {
  it('this bundle is not wearing 1804\'s badge', () => {
    // A different bundle under the same stamp looks exactly like no update
    // arriving: the just-updated modal keys on a CHANGE in OTA_BUILD_ID.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTA_BUILD_ID } = require('../app/buildInfo') as { OTA_BUILD_ID: string };
    // ⚠⚠ OTA-1807 — THIS ASSERTED `^2026-09-12-1806-`, WHICH EVERY LATER OTA MUST
    // BREAK. A stamp pinned to one number is a claim with a one-bundle shelf
    // life: it was true of 1806 and false the moment 1807 stamped, so it would
    // have had to be hand-edited forever. The DURABLE claim — the one the
    // comment above is actually about — is that the badge never goes BACKWARDS
    // onto a bundle that has already moved past it. Stated that way it holds for
    // 1806 and for everything after, and `check:otastamp` separately ties the
    // stamp to the highest otaNNNN suite on disk, so the exact number still has
    // a hard gate; it simply is not this test's job.
    const n = Number(/^\d{4}-\d{2}-\d{2}-(\d+)-/.exec(OTA_BUILD_ID)?.[1]);
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(1806);
    expect(OTA_BUILD_ID).not.toMatch(/-1805-|-1804-/);
  });
});
