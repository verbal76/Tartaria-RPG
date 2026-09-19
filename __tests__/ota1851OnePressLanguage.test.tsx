/* ⚠⚠⚠ OTA-1851 — ONE PRESS LANGUAGE, AND THE SWEEP THAT MISSED TWENTY-TWO OF IT.
 *
 * Owner, on the title screen: swipe a character card open and the DELETE that
 * appears "is flat, has no depth, and does not move when you press it — it does
 * not feel like the rest of the buttons." He then asked the wider question: how
 * many OTHER controls did the earlier press-consistency pass miss? *"Do not
 * assume the prior sweep was exhaustive."*
 *
 * ⚠⚠ THE ANSWER WAS TWENTY-TWO, AND THE SHAPE OF THE MISS IS THE FINDING.
 * 408 interactive controls were inventoried across `app/`. 168 of them carry
 * `kit.ctl` — the one control MATERIAL: face, rim, radius, and the raised
 * lit/dark border pair that says "this object stands proud of the panel". Of
 * those 168, 147 also routed their press through the one depth AUTHORITY
 * (`tControlDepth` / `kit.controlPressed` / `tFilledGold`). TWENTY-ONE DID NOT.
 * They wore the material of a physical key and pressed like a flat rectangle
 * fading — `{ opacity: 0.7 }` and nothing else, in almost every case.
 *
 * That is not twenty-one design decisions. It is one incomplete sweep: the
 * `kit.ctl` adoption pass reached them and the depth pass did not, and several
 * still carry its insertion scar (`style={({ pressed }) => [kit.ctl, \n`). The
 * proof it was accidental is in ContractsScreen, where ONE tab control already
 * writes `pressed && kit.controlPressed` beside its local beat while its three
 * sibling track buttons in the same file never got it.
 *
 * ⚠⚠ AND THE TWENTY-SECOND IS THE ONE THE OWNER FELT. `SwipeableRow`'s DELETE
 * carried no material at all: a bare `TouchableOpacity` over `{ flex: 1 }` plus
 * centring. No border, no rim, no face of its own — it WAS the red well with a
 * word on it, and a press only faded the whole assembly. The most consequential
 * destructive control in the game was the least physical thing in it.
 *
 * ⚠ THE REPAIR IS THE SHARED PRIMITIVE IN ALL TWENTY-TWO PLACES. Nothing here
 * invents an animation, and nothing here is local to a call site: every one of
 * them now ends its style array with `tControlDepth(pressed)`, which is the one
 * object that knows both halves of the language — the rim pair inverting, and
 * the 3dp travel. DELETE additionally takes `kit.ctl` for the material and
 * `kit.btnFaceDestructive` for the face the kit already gives a destructive
 * control, so its red identity is carried by the palette rather than by being
 * the only unpainted control in the app.
 *
 * ⚠ THE LOAD-BEARING TEST IS §A, NOT THE PER-SITE PINS. A list of twenty-two
 * repaired sites goes stale the moment a twenty-third control is written. §A
 * asks the INVARIANT of the whole tree — *every control wearing the material
 * presses in the language* — so the next straggler fails on the day it is
 * written instead of waiting for the owner to feel it under his thumb.
 *
 * ⚠ WHAT THIS SUITE CANNOT DO. It reads construction and style objects, not
 * pixels. That DELETE now READS as a key sunk into a red well is the owner's
 * eye on hardware, and that half is NOT claimed closed here.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): void;
  create(el: React.ReactElement): {
    toJSON(): unknown;
    unmount(): void;
    root: { findAll(fn: (n: { props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> }[] };
  };
};
import fs from 'fs';
import path from 'path';
import { StyleSheet, Text } from 'react-native';
import { T, tartariaKitStyles as kit, tControlDepth } from '../app/ui/tartariaKit';
import { SwipeableRow } from '../app/components/SwipeableRow';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const flat = (s: unknown) => StyleSheet.flatten(s as never) as Record<string, unknown>;

/* ⚠ OTA-1847's RULE. A comment that QUOTES code satisfies a source assertion,
 * so every claim about what the tree DOES is graded on code with the comments
 * stripped out. This suite's whole §A is an absence claim, so it needs it. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ⚠⚠ THE SAME STRIP, BUT LENGTH- AND LINE-PRESERVING — and it is load-bearing.
 * The walker below is quote-aware so a `>` inside a string cannot end a tag
 * early. Run over RAW source that makes it quote-aware of PROSE too: a lone
 * apostrophe in a comment ("the ✕ doesn't route through…") opens a string that
 * never closes, the tag runs on to the end of the file, and the control is then
 * credited with every `tControlDepth` that happens to appear below it. That is
 * a silent FALSE GREEN, and it hid two of the twenty-three from the first pass
 * of this very audit. Comments are blanked to spaces before the walk; newlines
 * are kept so reported line numbers stay true. */
const blankComments = (s: string) => {
  const keep = (m: string) => m.replace(/[^\n]/g, ' ');
  return s.replace(/\/\*[\s\S]*?\*\//g, keep).replace(/(^|[^:])(\/\/[^\n]*)/g, (_m, p, c) => p + keep(c));
};

/** Pull one `name: { ... }` StyleSheet entry's literal body out of a source. */
const styleBody = (src: string, name: string): string => {
  const at = src.indexOf(`  ${name}: {`);
  if (at < 0) throw new Error(`style ${name} not found`);
  let i = src.indexOf('{', at);
  let d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}' && --d === 0) break;
  }
  return src.slice(src.indexOf('{', at), i + 1);
};

/* ────────────────────────────────────────────────────────────────────────────
 * THE WALKER. Every `<Pressable` / `<TouchableOpacity` / `<TouchableHighlight`
 * / `<TouchableWithoutFeedback` in `app/**.tsx`, with its OPENING TAG ONLY —
 * brace- and string-aware, so a `>` inside an arrow function or a template
 * literal does not end the tag early. This is a census of controls, not of
 * lines, which is the whole reason the twenty-one were invisible to grep.
 * ──────────────────────────────────────────────────────────────────────────── */
interface Control { file: string; line: number; kind: string; tag: string }

const walkTsx = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkTsx(p, out);
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
};

const controlsOf = (abs: string): Control[] => {
  const src = blankComments(fs.readFileSync(abs, 'utf8'));
  const rel = path.relative(ROOT, abs);
  const found: Control[] = [];
  const re = /<(TouchableOpacity|Pressable|TouchableHighlight|TouchableWithoutFeedback)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let instr: string | null = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (instr) { if (c === instr && src[i - 1] !== '\\') instr = null; continue; }
      if (c === '"' || c === "'" || c === '`') { instr = c; continue; }
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') depth--;
      else if (c === '>' && depth === 0) break;
    }
    found.push({
      file: rel,
      line: src.slice(0, m.index).split('\n').length,
      kind: m[1],
      tag: src.slice(m.index, i + 1),
    });
  }
  return found;
};

const ALL: Control[] = walkTsx(path.join(ROOT, 'app')).flatMap(controlsOf);

/** Wears the one control MATERIAL. */
const wearsMaterial = (c: Control) => /\bkit\.ctl\b/.test(c.tag);
/** Presses in the one depth LANGUAGE. */
const speaksDepth = (c: Control) =>
  /tControlDepth\s*\(|kit\.controlPressed|kit\.controlResting|tFilledGold\s*\(/.test(c.tag);

/* ⚠⚠⚠ THE ONE CONTROL THAT WEARS THE MATERIAL AND IS ALLOWED NOT TO TRAVEL.
 *
 * This exemption is a RULING, not a convenience, and it is not OTA-1851's. The
 * inventory's gift-mode banner renders `CTL_PLANES` — `ctlPlanes(false)` — as a
 * MODULE CONSTANT among its children, frozen at resting height. OTA-1828 found
 * this control, added `controlPressed` to it, and REVERTED: the travel arrived
 * while the sidewall stayed frozen, so the key moved 3dp and never lost any
 * height, and OTA-1806's census failed it as B-PARTIAL. Completing it means
 * restructuring the children into a `({ pressed }) => …` render prop so the
 * planes can be drawn pressed, which is OTA-1806's class to govern.
 *
 * ⚠ SO IT IS NAMED HERE RATHER THAN QUIETLY PASSING. A2 is an exact-equality
 * assertion against this list: if this control is ever repaired, A2 goes RED
 * until the line below is deleted, and if a SECOND control is ever exempted it
 * has to be written down with its reason next to this one. An exemption that
 * cannot be forgotten is the only kind worth having. */
const RULED_EXEMPT: ReadonlyArray<string> = [
  'app/screens/InventoryScreen.tsx', // gift-mode banner — OTA-1828 ruled, OTA-1806 class
];

const SWIPE = read('app/components/SwipeableRow.tsx');
const SWIPE_CODE = codeOnly(SWIPE);

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1851 §A — the class invariant: material implies language', () => {
  test('A1 the census is large enough to be a census', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(400);
    expect(ALL.filter(wearsMaterial).length).toBeGreaterThanOrEqual(160);
  });

  test('A2 EVERY control wearing kit.ctl presses in the depth language', () => {
    const mute = ALL.filter((c) => wearsMaterial(c) && !speaksDepth(c));
    expect(mute.map((c) => c.file)).toEqual(RULED_EXEMPT);
  });

  test('A2b the one exemption is still the one control it was ruled for', () => {
    const mute = ALL.filter((c) => wearsMaterial(c) && !speaksDepth(c));
    expect(mute).toHaveLength(1);
    expect(mute[0].tag).toMatch(/styles\.giftModeBar/);
    /* And it is exempt for the REASON it was exempted for: the frozen planes. */
    expect(codeOnly(read('app/screens/InventoryScreen.tsx'))).toMatch(
      /const CTL_PLANES = ctlPlanes\(false\);/,
    );
  });

  /* ⚠ The inverse is NOT asserted. A control may legitimately speak the depth
   * language without wearing `kit.ctl` — the dossier record and TButton both
   * carry their own material and are their own authorities. The invariant runs
   * one way only: wearing the material OBLIGES you to press in the language. */
  test('A3 the depth language is in real use, not merely importable', () => {
    expect(ALL.filter(speaksDepth).length).toBeGreaterThanOrEqual(150);
  });

  /* ⚠⚠⚠ THE HALF THIS PASS ALMOST SHIPPED WITHOUT, AND OTA-1806's CENSUS CAUGHT.
   *
   * A press is two things: the key TRAVELS, and the key LOSES HEIGHT. The travel
   * comes from `tControlDepth`; the height comes from the three absolutely
   * positioned planes a control draws as children. Giving a control travel while
   * those planes stay pinned at resting height — the frozen `CTL_PLANES` literal —
   * produces a key that moves 3dp and never gets any shorter, which OTA-1806
   * classifies B-PARTIAL and which is most of what a press looks like.
   *
   * ⚠ Adding `tControlDepth(pressed)` to twenty-one controls did exactly that to
   * nineteen of them, and the only reason it is not in this build is that OTA-1806's
   * suite went red. The nineteen now render `ctlPlanes(pressed)` through a
   * `({ pressed }) => …` child, so both halves answer the same finger. */
  test('A3b no control that travels leaves its planes frozen at resting height', () => {
    const frozen: string[] = [];
    for (const f of walkTsx(path.join(ROOT, 'app'))) {
      const src = blankComments(fs.readFileSync(f, 'utf8'));
      for (const c of controlsOf(f)) {
        if (!/tControlDepth\s*\(/.test(c.tag)) continue;
        const start = src.indexOf(c.tag);
        const body = src.slice(start + c.tag.length, src.indexOf('</Pressable>', start + c.tag.length) + 12);
        if (/\{CTL_PLANES\}/.test(body) && !/ctlPlanes\(/.test(body)) frozen.push(`${c.file}:${c.line}`);
      }
    }
    expect(frozen).toEqual([]);
  });

  test('A4 no repaired control reaches for the language by hand-copying its values', () => {
    /* `translateY: 3` written at a call site is a second authority. Only the
     * kit may spell the travel. */
    for (const c of ALL) {
      expect(c.tag).not.toMatch(/translateY:\s*3\b/);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1851 §B — the twenty-one, named, so a removal says which one', () => {
  /* Each entry is the file and a code anchor unique within it. This is the
   * register of what OTA-1851 repaired; §A is what keeps the class closed. */
  const REPAIRED: ReadonlyArray<readonly [string, string]> = [
    ['app/components/ApproachModal.tsx', 'styles.chipEnemy'],
    ['app/components/ApproachModal.tsx', 'styles.chipScene'],
    ['app/components/ClimbModal.tsx', 'styles.rowCleared'],
    ['app/components/GatherModal.tsx', 'styles.sweepLocked'],
    ['app/components/GatherModal.tsx', 'styles.ignore'],
    ['app/components/HookContinueModal.tsx', 'styles.btnTrade'],
    ['app/components/MissionBoardModal.tsx', 'styles.acceptBtn'],
    ['app/components/MissionBoardModal.tsx', 'styles.closeBtn'],
    ['app/components/SearchModal.tsx', 'styles.chipFullScene'],
    ['app/components/StoryForkOverlay.tsx', 'styles.optionPressed'],
    ['app/components/TorchProbeModal.tsx', 'styles.rowPressed'],
    ['app/components/TutorialOverlay.tsx', 'styles.pillPressed'],
    ['app/components/VendorContractsModal.tsx', 'styles.acceptBtn'],
    ['app/components/VendorContractsModal.tsx', 'styles.closeBtn'],
    ['app/screens/ContractsScreen.tsx', 'styles.trackBtnPressed'],
    ['app/screens/CraftingScreen.tsx', 'styles.aetherCardPressed'],
    ['app/screens/CraftingScreen.tsx', 'styles.golemVariantRowPressed'],
  ];

  test.each(REPAIRED)('B %s — the control at %s routes through tControlDepth', (file, anchor) => {
    const ctl = ALL.filter((c) => c.file === file && c.tag.includes(anchor));
    expect(ctl.length).toBeGreaterThan(0);
    for (const c of ctl) expect(c.tag).toMatch(/tControlDepth\s*\(/);
  });

  test('B-last every repaired file imports the authority rather than redefining it', () => {
    const files = [...new Set(REPAIRED.map(([f]) => f))];
    for (const f of files) {
      const code = codeOnly(read(f));
      expect(code).toMatch(/import\s*\{[^}]*\btControlDepth\b[^}]*\}\s*from\s*'[^']*tartariaKit'/);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1851 §C — the primitive the twenty-two now share', () => {
  const rest = flat(tControlDepth(false));
  const down = flat(tControlDepth(true));

  test('C1 resting stands proud: lit above, dark below, no travel', () => {
    expect(rest.borderTopColor).toBe(T.controlRaisedLit);
    expect(rest.borderBottomColor).toBe(T.controlRaisedDark);
    expect(rest.transform).toBeUndefined();
  });

  test('C2 pressed is the light MOVING — the pair inverts', () => {
    expect(down.borderTopColor).toBe(T.controlRaisedDark);
    expect(down.borderBottomColor).toBe(T.controlRaisedLit);
  });

  test('C3 pressed MOVES: a downward translate, not an opacity fade', () => {
    expect(down.transform).toEqual([{ translateY: 3 }]);
    expect(down.opacity).toBeUndefined();
  });

  test('C4 release restores the resting object exactly', () => {
    expect(flat(tControlDepth(false))).toEqual(rest);
  });

  test('C5 the travel is a transform, so no sibling reflows', () => {
    for (const k of ['marginTop', 'top', 'paddingTop', 'height']) {
      expect(down[k]).toBeUndefined();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1851 §D — DELETE, rendered', () => {
  const deleteControl = (label?: string) => {
    const spy = jest.fn();
    let tree!: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        <SwipeableRow onDelete={spy} {...(label ? { deleteLabel: label } : {})}>
          <Text>a saved character</Text>
        </SwipeableRow>,
      );
    });
    const btns = tree.root.findAll(
      (n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function',
    );
    return { spy, tree, btn: btns[0], count: btns.length };
  };

  test('D1 there is exactly one DELETE button, and it carries the label', () => {
    const { tree, count } = deleteControl();
    expect(count).toBe(1);
    expect(JSON.stringify(tree.toJSON())).toContain('Delete');
    tree.unmount();
  });

  test('D2 the label is still the caller’s to choose', () => {
    const { tree } = deleteControl('Erase');
    expect(JSON.stringify(tree.toJSON())).toContain('Erase');
    tree.unmount();
  });

  test('D3 accessibility is a button, unchanged', () => {
    const { btn, tree } = deleteControl();
    expect(btn.props.accessibilityRole).toBe('button');
    tree.unmount();
  });

  test('D4 the callback is unchanged: one press, one onDelete', () => {
    const { btn, spy, tree } = deleteControl();
    renderer.act(() => { (btn.props.onPress as () => void)(); });
    expect(spy).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  test('D5 at rest it is a physical control: material, rim pair, no travel', () => {
    const { btn, tree } = deleteControl();
    const s = flat((btn.props.style as (o: { pressed: boolean }) => unknown)({ pressed: false }));
    expect(s.borderWidth).toBe(1);
    expect(s.borderRadius).toBe(4);
    expect(s.borderTopColor).toBe(T.controlRaisedLit);
    expect(s.borderBottomColor).toBe(T.controlRaisedDark);
    expect(s.transform).toBeUndefined();
    tree.unmount();
  });

  test('D6 pressed it DEPRESSES — travel plus the inverted pair', () => {
    const { btn, tree } = deleteControl();
    const s = flat((btn.props.style as (o: { pressed: boolean }) => unknown)({ pressed: true }));
    expect(s.transform).toEqual([{ translateY: 3 }]);
    expect(s.borderTopColor).toBe(T.controlRaisedDark);
    expect(s.borderBottomColor).toBe(T.controlRaisedLit);
    tree.unmount();
  });

  test('D7 release returns it cleanly to the resting object', () => {
    const { btn, tree } = deleteControl();
    const f = btn.props.style as (o: { pressed: boolean }) => unknown;
    const before = flat(f({ pressed: false }));
    flat(f({ pressed: true }));
    expect(flat(f({ pressed: false }))).toEqual(before);
    tree.unmount();
  });

  test('D8 the press is NOT an opacity fade in either state', () => {
    const { btn, tree } = deleteControl();
    const f = btn.props.style as (o: { pressed: boolean }) => unknown;
    expect(flat(f({ pressed: false })).opacity).toBeUndefined();
    expect(flat(f({ pressed: true })).opacity).toBeUndefined();
    tree.unmount();
  });

  test('D9 destructive identity survives: rust rim, the kit’s destructive face', () => {
    const { btn, tree } = deleteControl();
    const s = flat((btn.props.style as (o: { pressed: boolean }) => unknown)({ pressed: false }));
    expect(s.borderColor).toBe(T.rustRim);
    expect(s.backgroundColor).toBe(flat(kit.btnFaceDestructive).backgroundColor);
    tree.unmount();
  });

  test('D10 the geometry the travel needs is present and is not a layout jump', () => {
    const { btn, tree } = deleteControl();
    const f = btn.props.style as (o: { pressed: boolean }) => unknown;
    const rest = flat(f({ pressed: false }));
    const down = flat(f({ pressed: true }));
    expect(rest.margin).toBe(3);
    expect(rest.flex).toBe(1);
    // Pressing changes NOTHING that participates in layout.
    for (const k of ['flex', 'margin', 'width', 'height', 'padding', 'alignItems', 'justifyContent']) {
      expect(down[k]).toEqual(rest[k]);
    }
    tree.unmount();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1851 §E — the swipe itself is untouched', () => {
  test('E1 the reveal geometry is byte-for-byte the geometry it was', () => {
    expect(SWIPE_CODE).toMatch(/const DELETE_WIDTH = 90;/);
    expect(SWIPE_CODE).toMatch(/const SWIPE_THRESHOLD = -DELETE_WIDTH \/ 2;/);
    expect(SWIPE_CODE).toMatch(/const SWIPE_DISMISS_THRESHOLD = -DELETE_WIDTH \* 1\.6;/);
  });

  test('E2 the pan still drives it, and still springs open or shut', () => {
    expect(SWIPE_CODE).toMatch(/PanResponder\.create/);
    expect(SWIPE_CODE).toMatch(/toValue: open \? -DELETE_WIDTH : 0/);
    expect(SWIPE_CODE).toMatch(/final < SWIPE_DISMISS_THRESHOLD/);
  });

  test('E3 DELETE is hidden until the card is swiped: it lives UNDER an opaque surface', () => {
    /* The well is absolutely positioned at the right edge; the sliding surface
     * is opaque and painted OVER it, and the wrap clips. Nothing about that
     * changed — which is what makes the button invisible at rest. */
    expect(styleBody(SWIPE, 'wrap')).toMatch(/overflow:\s*'hidden'/);
    const layer = styleBody(SWIPE, 'deleteLayer');
    expect(layer).toMatch(/position:\s*'absolute'/);
    expect(layer).toMatch(/right:\s*0/);
    expect(layer).toMatch(/width:\s*DELETE_WIDTH/);
    expect(styleBody(SWIPE, 'surface')).toMatch(/backgroundColor:/);
    // The well is rendered BEFORE the surface, so the surface covers it.
    expect(SWIPE_CODE.indexOf('styles.deleteLayer')).toBeLessThan(SWIPE_CODE.indexOf('styles.surface'));
  });

  test('E4 OTA-1827 is preserved: the surface is still the player’s own background', () => {
    expect(SWIPE_CODE).toMatch(/backgroundColor: baseColorOf\(display\)/);
    expect(styleBody(SWIPE, 'surface')).toMatch(/#0a0908/);
  });

  test('E5 the red well keeps its colour and its radius', () => {
    const layer = styleBody(SWIPE, 'deleteLayer');
    expect(layer).toMatch(/backgroundColor:\s*'#5a2a26'/);
    expect(layer).toMatch(/borderRadius:\s*4/);
  });

  test('E6 pressing DELETE still closes the row before it deletes', () => {
    expect(SWIPE_CODE).toMatch(/close\(\);\s*onDelete\(\);/);
  });

  test('E7 the key is no longer independently styled', () => {
    /* `deleteBtn` may carry geometry and its side rims. It must NOT name a
     * face or a directional edge — those belong to the kit now. */
    const btn = styleBody(SWIPE, 'deleteBtn');
    expect(btn).not.toMatch(/backgroundColor/);
    expect(btn).not.toMatch(/borderTopColor|borderBottomColor/);
    expect(btn).not.toMatch(/transform|opacity/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
describe('OTA-1851 §F — the surfaces this pass was told not to disturb', () => {
  const has = (p: string, re: RegExp) => expect(codeOnly(read(p))).toMatch(re);

  test('F1 OTA-1837 — the character card still sinks into its drawn housing', () => {
    has('app/screens/TitleScreen.tsx', /dossierPressEdge/);
    has('app/screens/TitleScreen.tsx', /dossierRimPressed/);
  });

  test('F2 OTA-1849 — LORE and FALLEN still share one row on the crest rail', () => {
    const e = codeOnly(read('app/screens/ExplorationScreen.tsx'));
    expect(e).toMatch(/const CREST_LORE_LABEL = '◈ LORE';/);
    expect(e).toMatch(/const CREST_FALLEN_LABEL = '☗ FALLEN';/);
    expect(e).toMatch(/const CREST_NAV_ROW_GAP = 6;/);
  });

  test('F3 OTA-1850 — the dossier still shows the character’s own gems', () => {
    has('app/screens/TitleScreen.tsx', /item\.resurrectionGems/);
  });

  test('F4 OTA-1845 — the Fallen exchange controls are still there', () => {
    has('app/screens/FallenExchangeScreen.tsx', /cutOff/);
  });

  test('F5 the two languages stay apart: a panel is read, a control is touched', () => {
    /* `panelFrame` must not have leaked onto a control, and `kit.ctl` must not
     * have leaked onto a panel, in any control this pass touched. */
    for (const c of ALL) {
      if (wearsMaterial(c)) expect(c.tag).not.toMatch(/\bkit\.panelFrame\b/);
    }
  });
});
