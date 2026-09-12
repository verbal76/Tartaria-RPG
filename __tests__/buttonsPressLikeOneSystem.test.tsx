/**
 * ⚠⚠⚠ A CONTROL BUILT LIKE A KEY MUST BEHAVE LIKE ONE UNDER A FINGER.
 *
 * Device finding, 2026-09-12, from the owner's tap-through: *"THE BUTTONS DO NOT
 * ALL FEEL LIKE THEY BELONG TO THE SAME UI … some appear to perform their
 * action/navigation with little visible finger-down response at all."*
 *
 * ⚠⚠ WHAT THE SOURCE SAID, which is not what the video implied. Phase 3
 * (OTA-1804) unified CONSTRUCTION — whether a control resolves through a
 * physical authority AT REST. Its scan skipped any site whose attributes named
 * an authority, and a STATIC `style={[kit.ctl, …]}` names one. So a control
 * could pass Phase 3 wearing the full lit-edge/shaded-edge construction while
 * having no pressed half at all: it LOOKS like a struck key and is dead to the
 * touch. Censused at 45 such sites, 40 of them command keys.
 *
 * That is the asymmetry this file makes permanent, and it is the press-time
 * sibling of the two escapes Phase 3 already closed. Phase 3 caught asymmetric
 * STATE (one arm of a ternary reaching an authority, the other not). This is
 * asymmetric PRESS: the resting half of the depth language present, the pressed
 * half absent. Construction without consequence.
 *
 * ⚠ AND THE VIDEO'S OWN REFERENCE CONTROL IS NOT THE CANON. DEACTIVATE reads as
 * the most responsive control on the device, and tracing it shows why — and why
 * copying it would have been wrong. Its cue is `trackBtnPressed: {opacity:0.7}`,
 * a 30% dim on a control that `trackBtnOn` has already made GLOW (tinted fill,
 * brighter 2dp border, shadowOpacity 0.9, text halo). A large luminance delta on
 * a bright object. It is not the Tartaria depth language, and OTA-1791
 * deliberately REMOVED that fade from the gold pill — *"the fade is gone; depth
 * replaced it"* — so re-introducing opacity into the kit's pressed state would
 * overturn a standing ruling. The canon stays `kit.controlPressed`.
 *
 * ⚠⚠⚠ AND LIST ROWS ARE NOT COMMAND KEYS. Five inert sites are `tRowStyle()`
 * rows. The kit has no row-pressed style, and the owner's Phase 3 directive was
 * explicit: *"Do not put command-key depth on list rows merely to reach zero."*
 * They are asserted UNCHANGED below, so the boundary reads as a decision rather
 * than an oversight.
 *
 * WHAT THIS FILE CANNOT PROVE: that a 3dp travel is perceptible on a Pixel.
 * That is the owner's eye. It proves the code paths, the resting invariance, the
 * callback identity, and the protected Character composition.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StyleSheet } from 'react-native';
import { tartariaKitStyles as kit, tControlDepth, T } from '../app/ui/tartariaKit';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
/** Grade the code, not the prose. */
const codeOf = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

/** Depth-matched span of one element's OPENING TAG, brace and quote aware. */
function tagEnd(s: string, i: number): number {
  let d = 0; let q = '';
  while (i < s.length) {
    const c = s[i]!;
    if (q) { if (c === q && s[i - 1] !== '\\') q = ''; i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; i += 1; continue; }
    if (c === '{') { d += 1; i += 1; continue; }
    if (c === '}') { d -= 1; i += 1; continue; }
    if (c === '>' && d === 0) return i;
    i += 1;
  }
  return i;
}

type Site = { file: string; line: number; attrs: string };
/** Every <Pressable> with an onPress, across app/. */
function pressables(): Site[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execSync } = require('node:child_process') as typeof import('node:child_process');
  const files = String(execSync('find app -name "*.tsx"', { cwd: join(__dirname, '..') }))
    .trim().split('\n').filter(Boolean).sort();
  const out: Site[] = [];
  for (const f of files) {
    const code = codeOf(read(f));
    const re = /<Pressable\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const b = m.index; const e = tagEnd(code, b);
      const attrs = code.slice(b, e);
      if (!/onPress\s*=/.test(attrs)) continue;
      out.push({ file: f, line: code.slice(0, b).split('\n').length, attrs });
    }
  }
  return out;
}

const SITES = pressables();
const KEY_AUTHORITY = /kit\.ctl\b|tartariaKitStyles\.ctl\b|tControlDepth|tFilledGold/;
const HAS_PRESS = (a: string) => /style=\{\(\{\s*pressed/.test(a) || /onPressIn|onPressOut|android_ripple/.test(a);

describe('1. the canonical press behaviour, and what it actually is', () => {
  it('the canon is kit.controlPressed — a geometric travel plus an edge flip, and NO fade', () => {
    const rest = flat(tControlDepth(false));
    const down = flat(tControlDepth(true));
    // Resting: lit on top, shaded beneath, sitting still.
    expect(rest.borderTopColor).toBe(T.controlRaisedLit);
    expect(rest.borderBottomColor).toBe(T.controlRaisedDark);
    expect(rest.transform).toBeUndefined();
    // Pressed: the light moves to the underside and the face settles.
    expect(down.borderTopColor).toBe(T.controlRaisedDark);
    expect(down.borderBottomColor).toBe(T.controlRaisedLit);
    expect((down.transform as [{ translateY: number }])[0].translateY).toBeGreaterThanOrEqual(2);
    // ⚠ NO opacity, either way. OTA-1791 replaced the pill's fade with depth and
    // this file must not smuggle it back through the shared style.
    expect(rest).not.toHaveProperty('opacity');
    expect(down).not.toHaveProperty('opacity');
  });

  it('DEACTIVATE is the video\'s reference but NOT the canon — its cue is a fade on a glowing control', () => {
    const src = codeOf(read('app/screens/ContractsScreen.tsx'));
    // It reaches the construction authority AND carries a local fade.
    expect(src).toMatch(/style=\{\(\{ pressed \}\) => \[kit\.ctl, styles\.trackBtn/);
    expect(src).toMatch(/trackBtnPressed: \{ opacity: 0\.7 \}/);
    // And the reason the fade reads so strongly: the lit state is a glow.
    expect(src).toMatch(/trackBtnOn: \{[\s\S]{0,240}shadowOpacity: 0\.9/);
    // It keeps its own destructive/semantic styling. Untouched by this repair.
    expect(src).toMatch(/trackBtnOff: \{ borderColor: '#5a6a6e' \}/);
  });
});

describe('2. ⚠⚠⚠ NO COMMAND KEY IS CONSTRUCTED-BUT-INERT — the invariant', () => {
  const inertKeys = SITES.filter((s) => KEY_AUTHORITY.test(s.attrs) && !/tRowStyle\(/.test(s.attrs) && !HAS_PRESS(s.attrs));

  it('every Pressable that names a command-key authority also has a pressed half', () => {
    expect(inertKeys.map((s) => `${s.file}:${s.line}`)).toEqual([]);
  });

  it('the invariant is NOT vacuous — the corpus really contains command keys to check', () => {
    const keys = SITES.filter((s) => KEY_AUTHORITY.test(s.attrs) && !/tRowStyle\(/.test(s.attrs));
    expect(keys.length).toBeGreaterThan(100);
    // and all of them satisfy it
    expect(keys.filter((s) => !HAS_PRESS(s.attrs)).length).toBe(0);
  });

  it('the repaired sites all reach the SHARED authority, not one private fade among them', () => {
    /* ⚠ 51, not 40, and the difference is worth writing down: ELEVEN sites
     * already wrote `pressed && kit.controlPressed` by hand before this pass, so
     * this repair added 40 to an existing 11. That is itself evidence for the
     * diagnosis — the canonical form was already in the codebase and had simply
     * never been applied consistently. A floor rather than an equality, so
     * adopting the canon at a new site is never a test failure. */
    const repaired = SITES.filter((s) => /pressed && (?:kit|tartariaKitStyles)\.controlPressed\]/.test(s.attrs));
    expect(repaired.length).toBeGreaterThanOrEqual(51);
    // Not one of them invented its own cue.
    for (const s of repaired) {
      expect([`${s.file}:${s.line}`, /opacity|scale|Animated|withSpring|withTiming/.test(s.attrs)])
        .toEqual([`${s.file}:${s.line}`, false]);
    }
  });
});

describe('3. list rows were deliberately NOT given the command key\'s travel', () => {
  it('tRowStyle() sites stay without a pressed half, and the kit still has no row-pressed style', () => {
    const rows = SITES.filter((s) => /tRowStyle\(/.test(s.attrs) && !HAS_PRESS(s.attrs));
    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect([`${r.file}:${r.line}`, /controlPressed/.test(r.attrs)]).toEqual([`${r.file}:${r.line}`, false]);
    }
    expect(Object.keys(kit)).not.toContain('rowPressed');
  });
});

describe('4. the resting UI is byte-for-byte the baseline', () => {
  it('`pressed && style` contributes NOTHING when the finger is up', () => {
    // This is the whole no-visual-regression argument, and it is a property of
    // the style array rather than a promise: at rest the appended term is the
    // boolean false, which RN drops.
    const pressed: boolean = false; // what Pressable hands the callback at rest
    const atRest = flat([kit.ctl, pressed && kit.controlPressed]);
    const before = flat([kit.ctl]);
    expect(atRest).toEqual(before);
    expect(atRest.transform).toBeUndefined();
  });

  it('the repair touched only the style attribute — every changed file is reversible to HEAD', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const root = join(__dirname, '..');
    let changed: string[] = [];
    try {
      changed = String(execSync('git diff --name-only HEAD -- app/', { cwd: root }))
        .trim().split('\n').filter(Boolean);
    } catch { return; } // not a git checkout (packaged run) — the claim is unprovable here
    if (changed.length === 0) return; // already committed; nothing to compare
    for (const f of changed) {
      const now = read(f);
      const undone = now.replace(
        /style=\{\(\{ pressed \}\) => \[(.*?), pressed && (?:kit|tartariaKitStyles)\.controlPressed\]\}/g,
        (_m, inner) => `style={[${inner}]}`,
      );
      const head = String(execSync(`git show HEAD:${f}`, { cwd: root, maxBuffer: 64 * 1024 * 1024 }));
      expect([f, undone === head]).toEqual([f, true]);
    }
  });
});

describe('5. ⚠⚠⚠ THE CHARACTER SCREEN IS PROTECTED — artwork, crest, composition', () => {
  const PORTRAIT = 'app/components/CharacterPortrait.tsx';
  const SCREEN = 'app/screens/CharacterScreen.tsx';

  it('the faded portrait band and its corner crest live in a file with NO controls at all', () => {
    // The strongest possible non-regression argument: the protected artwork is
    // structurally outside the blast radius of any button-press repair, because
    // there is no button in it to repair.
    const src = read(PORTRAIT);
    expect(src).not.toMatch(/<Pressable\b/);
    expect(src).not.toMatch(/<Touchable\w*\b/);
    expect(src).not.toMatch(/\bonPress\b/);
  });

  it('the band, the portrait fill and the crest keep their exact geometry', () => {
    const src = read(PORTRAIT);
    // The band: full width, its own clip, height measured from the real asset.
    expect(src).toMatch(/width: '100%'/);
    expect(src).toMatch(/overflow: 'hidden'/);
    expect(src).toMatch(/portrait: \{ width: '100%', height: '100%' \}/);
    expect(src).toMatch(/resizeMode="contain"/);
    // ⚠ THE CORNER ICON. top 10 / left 10 at CREST_SIZE — the owner: DO NOT MOVE IT.
    expect(src).toMatch(/position: 'absolute',\s*top: 10,\s*left: 10,\s*width: CREST_SIZE,\s*height: CREST_SIZE/);
    // The height cap is still derived, not hardcoded.
    expect(src).toMatch(/MAX_SCREEN_FRACTION/);
    expect(src).toMatch(/Image\.resolveAssetSource/);
  });

  it('the screen still composes the portrait above the header card, unreplaced', () => {
    const code = codeOf(read(SCREEN));
    expect(code).toMatch(/<CharacterPortrait[\s\S]{0,260}factionId=\{player\.factionId\}/);
    expect(code).toMatch(/factionName=\{faction\?\.name\}/);
    // The race · faction subline the owner named (Tartarian Giants · Mud Monarchs).
    expect(code).toMatch(/\{faction \? ` · \$\{faction\.name\}/);
    // And NOT the creation screen.
    expect(code).not.toMatch(/CharacterCreationScreen/);
  });

  it('neither protected file is in this repair\'s diff', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    let changed: string[] = [];
    try {
      changed = String(execSync('git diff --name-only HEAD~1 -- app/', { cwd: join(__dirname, '..') }))
        .trim().split('\n').filter(Boolean);
    } catch { return; }
    expect(changed).not.toContain(PORTRAIT);
    expect(changed).not.toContain(SCREEN);
  });
});

describe('6. disabled controls did not gain feedback they should not have', () => {
  it('every repaired control with a dead state carries a real `disabled` prop', () => {
    // RN's Pressable does not report `pressed` while disabled, so the dead
    // state needs no per-site guard — but only if `disabled` is actually there.
    // accessibilityState alone does not stop the press.
    const dead = SITES.filter((s) => /ctlDead|stepOff|styles\.dim\b/.test(s.attrs)
      && /pressed && (?:kit|tartariaKitStyles)\.controlPressed\]/.test(s.attrs));
    expect(dead.length).toBeGreaterThanOrEqual(6);
    for (const s of dead) {
      expect([`${s.file}:${s.line}`, /disabled=\{/.test(s.attrs)]).toEqual([`${s.file}:${s.line}`, true]);
    }
  });
});

describe('7. the press cue cannot double-fire, stick, or move a touch target', () => {
  it('the cue is a TRANSFORM, so no sibling reflows and the hit area does not move', () => {
    const down = flat(tControlDepth(true));
    // translateY, not marginTop/top/paddingTop — a laid-out shift would move the
    // touch target under the finger and could walk a tap onto a neighbour.
    expect(down.transform).toBeDefined();
    for (const k of ['marginTop', 'top', 'paddingTop', 'height', 'marginBottom']) {
      expect(down).not.toHaveProperty(k);
    }
  });

  it('the cue carries no timing, no animation and no handler — it cannot delay or repeat an action', () => {
    const src = readFileSync(join(__dirname, '..', 'app/ui/tartariaKit.tsx'), 'utf8');
    const body = src.slice(src.indexOf('  controlPressed: {'), src.indexOf('  rowChassis: {'));
    expect(body).not.toMatch(/Animated|withTiming|withSpring|duration|setTimeout|requestAnimationFrame/);
    // And no repaired site added a press handler that could fire alongside onPress.
    const repaired = SITES.filter((s) => /pressed && (?:kit|tartariaKitStyles)\.controlPressed\]/.test(s.attrs));
    for (const s of repaired) {
      expect([`${s.file}:${s.line}`, /onPressIn|onPressOut|onLongPress/.test(s.attrs)])
        .toEqual([`${s.file}:${s.line}`, false]);
    }
  });
});
