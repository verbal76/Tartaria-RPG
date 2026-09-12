/**
 * VISUAL LANGUAGE PHASE 3 — ONE CONTROL LANGUAGE, AND A RATCHET THAT PROVES IT.
 *
 * ⚠⚠⚠ WHY THIS SUITE EXISTS, AND WHY ITS FIRST INSTRUMENT WAS WRONG. Phase 3
 * began by hunting a legacy control dialect through a COLOUR FINGERPRINT — five
 * hexes taken off the ♂/♀ dialog. That census returned 79 controls in 41 files
 * and was NOT AUTHORITATIVE: the owner, reviewing the device, pointed at the
 * room-travel row, and `TravelBtn`'s rim is `'#5a4a2e'` — a sixth colour nobody
 * had thought to grep for. A legacy control can be ANY colour.
 *
 * ⚠⚠ SO THE QUESTION IS STRUCTURAL, NOT CHROMATIC: does a style handed to
 * something that owns an `onPress` draw its OWN physical construction — a
 * border plus a fill or a radius — while never reaching a kit authority? It
 * cannot be fooled by a palette, and it is the same question for a control
 * nobody has looked at yet.
 *
 * ⚠⚠⚠ AND IT IS ASKED PER CALL SITE, NOT PER STYLE KEY — the second instrument
 * correction of this pass. The key-level form of this scan reported 163 and was
 * ALSO wrong, in a quieter way: it folded a key's call sites together, so a
 * `btn` used by a constructed primary AND a flat CANCEL scored as migrated.
 * Ten modal action rows were hiding in exactly that fold. See `scan()`.
 *
 * ⚠ THE GOVERNING RULE THE WHOLE PASS COLLAPSES ONTO, in the owner's words:
 * PHYSICAL CONSTRUCTION IS WHAT THE OBJECT IS; SEMANTIC TREATMENT IS WHAT STATE
 * IT IS IN. Disabled, blocked, selected, active, dangerous, unavailable may
 * change colour, opacity or emphasis — none of them may erase the face, the
 * sidewall and the contact. Read-only surfaces stay flat and take none of it.
 *
 * WHAT THIS SUITE IS: a SHRINK-ONLY RATCHET. Every control still drawing its
 * own construction is listed below by name. The list may only get shorter. A
 * NEW one fails immediately — which is the property the colour census never
 * had, and the reason a sixth hex could hide in plain sight.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..');

/** Strip comments — prose that names a token must never satisfy a claim.
 *
 *  ⚠⚠ THE LINE-EATING BUG. This was `/^\s*\/\/.*$/gm`, and in JavaScript `\s`
 *  MATCHES A NEWLINE: `/m` anchors `^` at a line start, but `\s*` then runs on
 *  over the newline ENDING that line, so the match swallowed the break and
 *  glued what followed onto the line before it. Nearly every style key here is
 *  preceded by a comment, so that happened constantly.
 *
 *  ⚠ AND IT DID NOT CHANGE THIS LEDGER — MEASURED, NOT ASSUMED. The obvious
 *  fear is that `materialKeys`' `^(\s+)([A-Za-z0-9_]+):` then stops seeing a
 *  glued key and the count silently falls. It does not: that `\s+` ALSO spans
 *  newlines, so the match re-anchors at an earlier line start and still finds
 *  the key. The escape count is identical (135) before and after this fix.
 *
 *  It is fixed anyway, because an instrument that deletes lines cannot be
 *  trusted to report WHERE anything is — the sibling tool that dumps sites by
 *  line number drifted 4 lines in one file and 14 in another, which sends a
 *  reader to the wrong renderer. Block comments are blanked, not deleted, for
 *  the same reason. `[ \t]*` cannot cross a line, which is the whole point. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
     .replace(/^[ \t]*\/\/.*$/gm, '');

/** Every opening pressable tag's attribute text, brace-balanced.
 *  ⚠ A `[^>]*` scan is WRONG here and this pass learned it the hard way: an
 *  arrow handler (`onPress={() => x}`) contains `>`, so that scan stops early
 *  and silently reports interactive controls as structural. */
function pressableAttrs(src: string): string[] {
  const out: string[] = [];
  const re = /<(?:Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index, depth = 0, quote = '';
    const start = i;
    for (; i < src.length; i += 1) {
      const c = src[i]!;
      if (quote) { if (c === quote && src[i - 1] !== '\\') quote = ''; continue; }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
      if (c === '{') { depth += 1; continue; }
      if (c === '}') { depth -= 1; continue; }
      if (c === '>' && depth === 0) break;
    }
    out.push(src.slice(start, i));
  }
  return out;
}

/** Each pressable's opening-tag attributes AND the text of its own element, up
 *  to ITS matching close tag — depth-counted, because a control that wraps
 *  another control must not be credited with the inner one's construction. */
function elementBodies(src: string): Array<{ attrs: string; body: string }> {
  const out: Array<{ attrs: string; body: string }> = [];
  const re = /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const tag = m[1]!;
    let i = m.index, depth = 0, quote = '';
    for (; i < src.length; i += 1) {
      const c = src[i]!;
      if (quote) { if (c === quote && src[i - 1] !== '\\') quote = ''; continue; }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
      if (c === '{') { depth += 1; continue; }
      if (c === '}') { depth -= 1; continue; }
      if (c === '>' && depth === 0) break;
    }
    const attrs = src.slice(m.index, i);
    if (src[i - 1] === '/') { out.push({ attrs, body: '' }); continue; }
    const open = `<${tag}`, close = `</${tag}>`;
    let p = i, d = 0, at = -1;
    while (p < src.length) {
      const o = src.indexOf(open, p), c = src.indexOf(close, p);
      if (c < 0) break;
      if (o >= 0 && o < c) { d += 1; p = o + open.length; continue; }
      if (d === 0) { at = c; break; }
      d -= 1; p = c + close.length;
    }
    /* ⚠⚠ AND THE BODY IS THIS ELEMENT'S OWN, WITH NESTED CONTROLS REMOVED.
     * Crediting a control for planes found anywhere inside it would let an
     * unbuilt wrapper borrow the construction of a button it contains — and
     * ExplorationScreen's vendor chip really does wrap STORE, TALK and GIFT.
     * The planes must belong to THIS control, not to its children. */
    let body = at < 0 ? '' : src.slice(i, at);
    for (const t of ['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback']) {
      body = body.replace(new RegExp(`<${t}\\b[\\s\\S]*?</${t}>`, 'g'), ' ');
    }
    out.push({ attrs, body });
  }
  return out;
}

const KIT_AUTHORITY =
  /tControlDepth|tFilledGold|kit\.ctl\b|kit\.ctlOn|kit\.recess|tartariaKitStyles\.(?:ctl\b|recess)|tRowStyle|controlPlane|chassisPlane/;

/** Style keys whose body draws a border AND a fill-or-radius: own construction. */
function materialKeys(code: string): Set<string> {
  const keys = new Set<string>();
  const multi = /^(\s+)([A-Za-z0-9_]+):\s*\{\s*?\n([\s\S]*?)^\1\},?\s*$/gm;
  const single = /^\s+([A-Za-z0-9_]+):\s*\{([^\n}]*)\},?\s*$/gm;
  for (const re of [multi, single]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) {
      const [key, body] = re === multi ? [m[2]!, m[3]!] : [m[1]!, m[2]!];
      if (/border(?:Width|Color)/.test(body) && /(?:backgroundColor|borderRadius)/.test(body)) keys.add(key);
    }
  }
  return keys;
}

/* ⚠⚠⚠ THE LEDGER COUNTS CALL SITES, NOT STYLE KEYS, AND THAT IS A CORRECTION.
 * The first version of this scan asked the question PER KEY, folding every call
 * site of `styles.btn` into one verdict with `reaches ||= …`. That is a fourth
 * escape route, and it was live: ten modals gave their PRIMARY button
 * `tFilledGold` and left the CANCEL beside it flat, and because ONE of `btn`'s
 * two sites had adopted the kit, the key scored as migrated and the whole
 * family stayed invisible. On the device that is a constructed key sitting
 * next to an outline IN THE SAME ROW.
 *
 * A key is a name; a SITE is a thing the player can touch. Counting sites
 * cannot be fooled by a sibling that already adopted. */
function scan(): Array<[string, string]> {
  const files = execSync('git ls-files "app/**/*.tsx"', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const hits: Array<[string, string]> = [];
  for (const rel of files) {
    const code = codeOf(readFileSync(join(ROOT, rel), 'utf8'));
    const material = materialKeys(code);
    /* ⚠⚠⚠ THE PLANES ARE THE CONSTRUCTION, WHEREVER THEY ARE DECLARED — and
     * asking only about the opening tag was an incomplete question. A control
     * can be fully built by carrying `{ROW_PLANES}` as a CHILD while taking no
     * kit style token in its own `style=` array, and two screens must be built
     * exactly that way:
     *
     *   OTA-1759 deliberately withheld the ROW CHASSIS from Contracts and
     *   Inventory, and it was right. `rowChassis` sets `flexDirection: 'row'`;
     *   `ContractsScreen.card` is a padded block with no flexDirection at all,
     *   so handing it the chassis silently turns every one of those cards
     *   sideways. (This pass did exactly that, and OTA-1759's guard caught it.)
     *   Inventory's row is byte-identical to the chassis apart from a 2px
     *   margin it overrides anyway — inert, but still a standing ruling.
     *
     * So those rows take the chassis PLANES — absolutely positioned children
     * that move nothing — and not the chassis MATERIAL, whose colour and
     * spacing are a decision OTA-1759 reserved. Physical construction is
     * satisfied; the colour ruling stays open. Counting only the tag would call
     * a fully constructed control an escape. */
    const bodies = elementBodies(code);
    for (let i = 0; i < bodies.length; i += 1) {
      const { attrs, body } = bodies[i]!;
      if (!/onPress\s*=/.test(attrs)) continue;
      if (KIT_AUTHORITY.test(attrs)) continue;
      if (/\b(?:CTL_PLANES|TAB_PLANES|ROW_PLANES)\b/.test(body)) continue;
      const own: string[] = [];
      const ref = /\bstyles\.([A-Za-z0-9_]+)/g;
      let s: RegExpExecArray | null;
      while ((s = ref.exec(attrs))) if (material.has(s[1]!)) own.push(s[1]!);
      if (own.length) hits.push([rel.replace(/^app\//, ''), own.sort().join(',')]);
    }
  }
  return hits;
}

/* ⚠⚠⚠ THE RATCHET IS NOW ZERO, AND THAT CHANGES WHAT THIS FILE IS. It began as
 * a DEBT LEDGER — 163 controls drawing their own construction, allowed to shrink
 * and never grow. The debt is paid: every player-interactive control in `app/`
 * now resolves through a Tartaria physical authority, so the ledger becomes an
 * INVARIANT. A new control that draws its own rim and fill fails immediately,
 * by name, with nowhere to hide. Do not raise this to admit one. */
const REMAINING = 0;

/* ⚠⚠⚠ THE FIFTH ESCAPE ROUTE, AND THE SUBTLEST: A STATE TERNARY THAT IS NOT
 * SYMMETRIC. `scan()` above cannot see this one — the tag DOES contain a kit
 * token, so it reads as compliant:
 *
 *     style={({pressed}) => [styles.btn, canSend ? tFilledGold(pressed)
 *                                               : styles.btnDisabled]}
 *
 * On the device that button is a constructed key while it is usable and a flat
 * legacy outline the moment it is not — the object changes identity to express
 * readiness, which is exactly what the owner's ruling forbids. The rule is
 * SYMMETRY, not the word `null`: if one arm of a style ternary reaches a
 * physical authority, the other must too. This found three live cases nothing
 * else had: two disabled SEND buttons and, last of all, `BrandedModal` — the
 * shared action row behind every branded modal in the game. */
function stateEscapes(): string[] {
  const files = execSync('git ls-files "app/**/*.tsx"', { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const bad: string[] = [];
  for (const rel of files) {
    const code = codeOf(readFileSync(join(ROOT, rel), 'utf8'));
    for (const attrs of pressableAttrs(code)) {
      if (!/onPress\s*=/.test(attrs)) continue;
      const sty = styleAttr(attrs);
      if (!sty) continue;
      for (const [a, b] of ternaryArms(sty)) {
        if (KIT_AUTHORITY.test(a) !== KIT_AUTHORITY.test(b)) {
          bad.push(`${rel.replace(/^app\//, '')}: ${a.trim().slice(0, 40)} ?: ${b.trim().slice(0, 40)}`);
        }
      }
    }
  }
  return bad;
}

/** The text of the `style=` attribute only — a HANDLER ternary is not a style
 *  ternary, and scanning the whole tag reported a correctly built row as an
 *  escape because of `onPress={() => setCatalystId(on ? null : c.id)}`. */
function styleAttr(attrs: string): string {
  const m = /\bstyle\s*=\s*/.exec(attrs);
  if (!m) return '';
  let i = m.index + m[0].length, depth = 0, quote = '';
  const start = i;
  for (; i < attrs.length; i += 1) {
    const c = attrs[i]!;
    if (quote) { if (c === quote && attrs[i - 1] !== '\\') quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') { depth += 1; continue; }
    if (c === '}') { depth -= 1; if (depth === 0) break; continue; }
  }
  return attrs.slice(start, i);
}

/** Every `a ? b : c` in a style, as its two arms, at matching nesting depth. */
function ternaryArms(sty: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0, quote = '', q = -1, qDepth = 0;
  for (let i = 0; i < sty.length; i += 1) {
    const c = sty[i]!;
    if (quote) { if (c === quote && sty[i - 1] !== '\\') quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '[' || c === '{' || c === '(') { depth += 1; continue; }
    if (c === ']' || c === '}' || c === ')') { depth -= 1; continue; }
    if (c === '?' && sty[i + 1] !== '.') { q = i; qDepth = depth; continue; }
    if (c === ':' && q >= 0 && depth === qDepth) {
      const a = sty.slice(q + 1, i);
      let j = i + 1, d2 = 0, q2 = '';
      for (; j < sty.length; j += 1) {
        const d = sty[j]!;
        if (q2) { if (d === q2 && sty[j - 1] !== '\\') q2 = ''; continue; }
        if (d === "'" || d === '"' || d === '`') { q2 = d; continue; }
        if (d === '[' || d === '{' || d === '(') { d2 += 1; continue; }
        if (d === ']' || d === '}' || d === ')') { if (d2 === 0) break; d2 -= 1; continue; }
        if (d === ',' && d2 === 0) break;
      }
      out.push([a, sty.slice(i + 1, j)]);
      q = -1;
    }
  }
  return out;
}

describe('Phase 3 — the structural detector is the authority', () => {
  /* ⚠ THE DETECTOR MUST BE ABLE TO SEE A CONTROL WITH AN ARROW HANDLER. This is
   * the bug that made the FIRST census wrong; if it ever returns, the ledger
   * would silently "shrink" to zero and the ratchet would pass while the game
   * filled up with outliers. So the parser is tested on the exact shape. */
  it('reads a tag whose handler contains a > , which the first census could not', () => {
    const src = `<Pressable onPress={() => setX(1)} style={[styles.a, on && styles.b]}>x</Pressable>`;
    const attrs = pressableAttrs(src);
    expect(attrs).toHaveLength(1);
    expect(attrs[0]).toContain('styles.a');
    expect(attrs[0]).toContain('styles.b');
    expect(attrs[0]).not.toContain('x</Pressable>');
  });

  it('counts a style as construction only when it draws a border AND a fill or radius', () => {
    const code = [
      '  real: { borderWidth: 1, borderColor: "#fff", borderRadius: 4 },',
      '  textOnly: { color: "#fff", fontSize: 12 },',
      '  ruleOnly: { borderTopWidth: 1 },',
    ].join('\n');
    const keys = materialKeys(code);
    expect(keys.has('real')).toBe(true);
    expect(keys.has('textOnly')).toBe(false);
    expect(keys.has('ruleOnly')).toBe(false);
  });

  /* ⚠⚠ THE LEDGER ITSELF. Shrink-only. A control that adopts `kit.ctl`, the
   * planes, `tControlDepth` or `tFilledGold` leaves this list by construction —
   * there is nothing to remember to update. */
  it('NO player-interactive control draws its own construction — the ledger is zero', () => {
    const hits = scan();
    // named, not just counted: a failure has to say which control and where.
    expect(hits.map(([f, k]) => `${f}: ${k}`)).toEqual([]);
    expect(hits.length).toBeLessThanOrEqual(REMAINING);
  });

  /* ⚠⚠⚠ THE FOURTH ESCAPE ROUTE, MADE PERMANENT: PARTIAL / SIBLING ADOPTION.
   * `scan()` counts CALL SITES precisely so this cannot come back, and the
   * property deserves its own test rather than living as a comment — ten modal
   * action rows hid in exactly this fold, each with a constructed primary and a
   * flat CANCEL beside it. Two sites of one key, one adopted and one not, must
   * be TWO findings, never one verdict folded together. */
  it('counts two sites of one style key separately, so a sibling cannot cover for one', () => {
    const src = [
      '  btn: { borderWidth: 1, borderColor: "#fff", borderRadius: 3 },',
      '<Pressable onPress={a} style={[styles.btn, tFilledGold(pressed)]}>A</Pressable>',
      '<Pressable onPress={b} style={[styles.btn]}>B</Pressable>',
    ].join('\n');
    const material = materialKeys(src);
    expect(material.has('btn')).toBe(true);
    const tags = pressableAttrs(src).filter((t) => /onPress\s*=/.test(t));
    const escaping = tags.filter((t) => !KIT_AUTHORITY.test(t));
    expect(tags).toHaveLength(2);
    expect(escaping).toHaveLength(1);          // the adopted sibling covers nothing
  });

  /* ⚠⚠ AND A WRAPPER CANNOT BORROW ITS CHILD'S CONSTRUCTION. Crediting planes
   * found in a control's body is right — that IS where the depth lives — but
   * only when they are ITS planes. ExplorationScreen's vendor chip wraps STORE,
   * TALK and GIFT, so an unbuilt wrapper around a built button must still be a
   * finding, or the loosening would quietly cover real escapes. */
  it('a control that merely wraps a constructed control is still an escape', () => {
    const src = [
      '  outer: { borderWidth: 1, borderColor: "#fff", borderRadius: 4 },',
      '<Pressable onPress={a} style={[styles.outer]}>',
      '  <Pressable onPress={b} style={[kit.ctl]}>x{CTL_PLANES}</Pressable>',
      '</Pressable>',
    ].join('\n');
    const bodies = elementBodies(src);
    const outer = bodies.find((e) => /styles\.outer/.test(e.attrs))!;
    expect(outer).toBeDefined();
    expect(/\bCTL_PLANES\b/.test(outer.body)).toBe(false);   // the child's, not its own
  });

  /* ⚠⚠ THE FIFTH: A STATE MAY NOT CHANGE WHAT THE OBJECT IS. */
  it('no style ternary builds the control one way when ready and another when not', () => {
    expect(stateEscapes()).toEqual([]);
  });

  it('the state check reads a style ternary and ignores a handler ternary', () => {
    const bad = `<Pressable onPress={x} style={({pressed}) => [styles.b, ok ? tFilledGold(pressed) : styles.dim]}>x</Pressable>`;
    const good = `<Pressable onPress={() => setId(on ? null : c.id)} style={[kit.ctl, styles.row]}>x</Pressable>`;
    const armsOf = (s: string) => ternaryArms(styleAttr(pressableAttrs(s)[0]!));
    const asym = (s: string) =>
      armsOf(s).filter(([a, b]) => KIT_AUTHORITY.test(a) !== KIT_AUTHORITY.test(b));
    expect(asym(bad)).toHaveLength(1);         // caught
    expect(asym(good)).toHaveLength(0);        // the handler ternary is not a style
  });

  /* ⚠ AND THE FILES PHASE 3 ALREADY COLLAPSED STAY COLLAPSED. These are the
   * owner's named specimens plus the shared factory behind every interior's
   * room row; a regression here is the pass coming undone. */
  it.each([
    'components/SexPickerModal.tsx',
    'components/GolemNamingModal.tsx',
    'components/DogOnboardingModal.tsx',
    'components/MotivePickerModal.tsx',
    'components/ParleySheet.tsx',
    'components/PayoffSheet.tsx',
    'components/PickpocketSheet.tsx',
    'components/NumberStepper.tsx',
    'components/ApproachModal.tsx',
    'components/ClimbModal.tsx',
    'components/TorchProbeModal.tsx',
    'components/CraftRefusalModal.tsx',
    'components/CraftResultModal.tsx',
  ])('%s draws no control construction of its own', (rel) => {
    expect(scan().filter(([f]) => f === rel)).toEqual([]);
  });
});

/* ⚠⚠⚠ THE DOCUMENTED EXCEPTIONS. The completion rule is not "every pressable
 * gets depth" — it is that every interactive control resolves through an
 * approved authority UNLESS a documented exception says why it should not. A
 * flat control is only acceptable once it has been CLASSIFIED, so the classes
 * are written down here rather than left as an absence in a scan.
 *
 * Counted and accounted for on this tree (485 interactive sites in `app/`):
 *
 *  • 104 FLAT HIT-AREAS. A pressable that draws nothing — a text link, an icon
 *    tap target (`placeChipX`, the ✕ on the trader), a row wrapper, a dismiss
 *    scrim. Giving these a face and a sidewall would invent objects the screen
 *    does not have. They stay flat BY CLASSIFICATION, and the detector cannot
 *    flag them because they draw no construction to begin with.
 *
 *  • 14 WRAPPERS WITH NO `onPress`. Not controls at all.
 *
 *  • 65 NON-BUTTON PRIMITIVES — Switch, TextInput, Slider, Modal. A field is
 *    not a key; the recess is its language, not the raised face. `NumberStepper`
 *    keeps the recess for exactly this reason: tapping its display swaps in a
 *    TextInput, so what it IS is a field.
 *
 *  • TWO READ-ONLY SURFACES SHARING A CONTROL'S STYLE KEY, kept deliberately
 *    flat because the interaction contract, not the key, decides the family:
 *    `FusionPickerModal`'s blocked row (a <View>, never pressable) and
 *    `ExplorationScreen`'s `objectiveChip`, which is a control at one site and
 *    a frame at another. A key-level rewrite would have put a sidewall on a
 *    panel. */
describe('Phase 3 — the documented exceptions are classified, not merely absent', () => {
  it('a read-only surface that shares a control style key stays flat', () => {
    const fusion = codeOf(readFileSync(join(ROOT, 'app/components/FusionPickerModal.tsx'), 'utf8'));
    // the blocked row is a View — it must not have acquired a pressable's depth
    expect(fusion).toMatch(/<View key=\{c\.item\.id\} style=\{\[styles\.row, styles\.rowBlocked\]\}/);
    expect(fusion).not.toMatch(/<View key=\{c\.item\.id\} style=\{\[tRowStyle\(\)/);
  });

  it('a bare icon hit-area is not given a face it never had', () => {
    const expl = codeOf(readFileSync(join(ROOT, 'app/screens/ExplorationScreen.tsx'), 'utf8'));
    // the ✕ on the trader chip: padding and nothing else, deliberately
    expect(expl).toMatch(/placeChipX: \{[^}]*paddingHorizontal[^}]*\}/);
    expect(expl).not.toMatch(/placeChipX: \{[^}]*border(?:Width|Color)/);
  });
});

describe('Phase 3 — semantic state never erases the construction', () => {
  const INPUT_BOX = codeOf(readFileSync(join(ROOT, 'app/components/InputBox.tsx'), 'utf8'));

  /* ⚠⚠⚠ THE PICKPOCKET RULING, REVERSING OTA-1782. A blocked chip used to be
   * handed neither the ring nor the planes, which on the device made it a grey
   * rectangle belonging to nothing. Owner: a disabled control *"remains
   * physically constructed as a button. Its semantic state may dim/mute it, but
   * it must not lose the physical button construction."* */
  it('a blocked quick chip keeps its depth and is carried by the mute', () => {
    expect(INPUT_BOX).not.toMatch(/blocked\s*\?\s*null\s*:\s*tControlDepth/);
    expect(INPUT_BOX).toMatch(/blocked && styles\.quickDisabled/);
  });

  /* ⚠ THE ROOM DOORS. One factory draws the travel row for EVERY interior, so
   * this single assertion covers the shed, the shack, the outposts and the
   * houses at once — which is the point of migrating a shared authority rather
   * than the controls it renders. */
  it('the interior room-travel factory reaches the kit', () => {
    const at = INPUT_BOX.indexOf('function TravelBtn');
    expect(at).toBeGreaterThan(-1);
    const next = INPUT_BOX.indexOf('\nfunction ', at + 1);
    const travel = INPUT_BOX.slice(at, next === -1 ? undefined : next);
    expect(travel).toMatch(/tartariaKitStyles\.ctl\b/);
    expect(travel).toMatch(/controlPlaneTop/);
    expect(travel).toMatch(/controlPlaneBottom/);
    expect(travel).toMatch(/controlPlaneContact/);
  });
});
