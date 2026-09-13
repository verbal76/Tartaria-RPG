/**
 * ⚠⚠⚠ OTA-1811 — THE CONTRACTS SLATE TAKES THE WEIGHT.
 *
 * Owner, on the device, after the Character pass (OTA-1810) landed on HAL: the
 * Contracts screen is the remaining interaction family in the second UI pass —
 * the PRIMARY OBJECTIVE card, the CONTRACTS / COLLECTIBLES tabs, the sort and
 * filter controls, and the milestone cells.
 *
 * FOUR FAMILIES WERE NAMED. FOUR WERE DEFICIENT, AND ONE OF THEM WAS DEFICIENT
 * IN A WAY THAT LOOKED LIKE COMPLIANCE:
 *
 *   1. PRIMARY OBJECTIVE — `TouchableOpacity`, `activeOpacity={0.85}`.
 *   2. THE TWO TABS      — `TouchableOpacity`, `activeOpacity={0.7}`.
 *   3. MILESTONE CELLS   — `TouchableOpacity`, `activeOpacity={0.7}`, and the
 *      fade landed on a bare `flex: 1` wrapper rather than the cell the player
 *      can see.
 *   4. THE SORT / FILTER BARS — `Pressable`, with a LIVE `pressed` in the style
 *      array. Every census we own reads that as repaired. What it drew was
 *      `{ opacity: 0.7 }`: the whole-control fade, which the owner's own ruling
 *      calls insufficient and which OTA-1806 removed from COMPLETE / ABANDON /
 *      DISCARD in this very file. Three sites survived that sweep BECAUSE they
 *      consumed `pressed` — presence is not participation, and this is the
 *      second distinct shape of that error the project has shipped.
 *
 * ⚠⚠⚠ AND THE TABS ARE WHY THIS SUITE IS NOT A `controlPressed` CENSUS. The
 * Contracts tab family is an UNDERLINE family: no fill, no ring, and the ONE
 * mark that says SELECTED is `borderBottomColor`. `kit.controlPressed` writes
 * that exact field — so the mechanical repair would have drawn a lit underline
 * on an UNSELECTED tab, making PRESSED look like SELECTED. Section 4 is the
 * load-bearing proof that it cannot: in every repaired control the selection
 * style is ordered AFTER the press style, so selection wins structurally rather
 * than by luck, and the tab additionally hands its bottom edge back.
 *
 * ⚠⚠ WHAT IS DELIBERATELY NOT HERE. The slate filter (ALL / ACTIVE / PARKED)
 * already consumed a live press and already travelled; it is a PROVEN EXCLUSION
 * and section 6 makes that claim falsifiable rather than decorative. `TTabBar`
 * — the kit's shared tab component used by Guidance, Vendor and Crafting — has
 * the same defect and was NOT touched under a Contracts authorization; section 7
 * asserts only that this screen owns its tabs locally, which is why the repair
 * could be bounded at all.
 *
 * WHAT THIS FILE CANNOT PROVE: that any of it is perceptible under a thumb.
 * That is the owner's eye and it is not claimed here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StyleSheet } from 'react-native';
import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
/** Grade the code, not the prose — a comment naming a token proves nothing. */
const codeOf = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const CONTRACTS = codeOf(read('app', 'screens', 'ContractsScreen.tsx'));

/* ⚠⚠ THE PARSER IS POSITION-INDEPENDENT ON PURPOSE — OTA-1810's LESSON.
 * A suite that keys on line numbers becomes the next fixed-window pin the
 * moment anything above it moves. Each control is found by a marker that IS its
 * identity (its own style key, or the state setter it owns), and the slice
 * runs to the next touchable opening, so one control's proof can never be
 * satisfied by its neighbour's construction. */
function controlBearing(code: string, marker: string): string {
  const opens = [...code.matchAll(/<(?:Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback)\b/g)]
    .map((m) => m.index as number);
  expect(opens.length).toBeGreaterThan(0);
  const found: string[] = [];
  for (let i = 0; i < opens.length; i += 1) {
    const body = code.slice(opens[i], opens[i + 1] ?? code.length);
    if (body.includes(marker)) found.push(body);
  }
  if (found.length !== 1) {
    throw new Error(`${found.length} touchables carry ${marker} — expected exactly one`);
  }
  return found[0] as string;
}

/** The opening tag only, brace-balanced — an arrow handler contains `>`. */
function openingTag(control: string): string {
  let depth = 0, quote = '';
  for (let i = 0; i < control.length; i += 1) {
    const c = control[i] as string;
    if (quote) { if (c === quote && control[i - 1] !== '\\') quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') { depth += 1; continue; }
    if (c === '}') { depth -= 1; continue; }
    if (c === '>' && depth === 0) return control.slice(0, i);
  }
  return control;
}

const PRIMARY = controlBearing(CONTRACTS, 'styles.mainQuestCard');
const TAB_CONTRACTS = controlBearing(CONTRACTS, "setTab('contracts')");
const TAB_COLLECTABLES = controlBearing(CONTRACTS, "setTab('collectables')");
const SORT_DISTANCE = controlBearing(CONTRACTS, 'styles.sortBarOn');
const SORT_READY = controlBearing(CONTRACTS, 'styles.sortBarReadyOn');
const MQ_SORT = controlBearing(CONTRACTS, 'styles.mqSortBtn');
/* ⚠ THE MILESTONE LOCATOR IS ITS LAYOUT WRAPPER, NOT ITS REPAIR. Keying it on
 * `body(true, pressed)` — the very text the repair introduces — made the first
 * negative control CRASH this file at module load instead of failing a named
 * assertion, which is a strictly worse signal: a suite that cannot load proves
 * only that it cannot load. A locator must survive the mutation it is there to
 * catch, so this one is the bare `flex: 1` wrapper the cell has always worn. */
const MILESTONE = controlBearing(CONTRACTS, 'style={{ flex: 1 }}');
const SLATE = controlBearing(CONTRACTS, 'styles.slateBtnOn');

/** Every repaired family, by the name this report uses for it. */
const REPAIRED: ReadonlyArray<readonly [string, string]> = [
  ['PRIMARY OBJECTIVE', PRIMARY],
  ['CONTRACTS tab', TAB_CONTRACTS],
  ['COLLECTIBLES tab', TAB_COLLECTABLES],
  ['SORT BY DISTANCE', SORT_DISTANCE],
  ['SORT BY READY', SORT_READY],
  ['PRIMARY OBJECTIVE capital sort', MQ_SORT],
  ['milestone cell', MILESTONE],
];

/** The style-array text of a control's `style=` attribute. */
function styleArray(control: string): string {
  const tag = openingTag(control);
  const m = /\bstyle\s*=\s*/.exec(tag);
  if (!m) throw new Error('control declares no style');
  let i = m.index + m[0].length, depth = 0, quote = '';
  const start = i;
  for (; i < tag.length; i += 1) {
    const c = tag[i] as string;
    if (quote) { if (c === quote && tag[i - 1] !== '\\') quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') { depth += 1; continue; }
    if (c === '}') { depth -= 1; if (depth === 0) break; continue; }
  }
  return tag.slice(start, i);
}

const flat = (s: unknown): Record<string, unknown> =>
  (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

// ── 1 · the vocabulary this repair spends ───────────────────────────────────
describe('OTA-1811 §1 — the kit press language is real, not a name', () => {
  it('controlPressed moves the face and swaps which edge catches the light', () => {
    const rest = flat(kit.controlResting);
    const down = flat(kit.controlPressed);
    expect(down.transform).toBeDefined();
    expect(down.borderTopColor).toBe(rest.borderBottomColor);
    expect(down.borderBottomColor).toBe(rest.borderTopColor);
  });

  it('the pressed planes lose height against the resting planes', () => {
    const restSide = flat(kit.controlPlaneBottom).height as number;
    const downSide = flat(kit.controlPlaneTopPressed).height as number;
    expect(typeof restSide).toBe('number');
    expect(downSide).toBeLessThan(restSide);
  });

  /* ⚠⚠ THE PROOF THAT THREE PLANE SWAPS MOVED NOTHING AT REST. The sort bars
   * carried `TAB_PLANES` and now carry `ctlPlanes(pressed)`. That is only a
   * no-op at rest if the two families are the same object, and the kit says
   * they are — an inactive tab is built at "the command's own weight". This
   * asserts it by value, so the swap is safe by measurement rather than by
   * reading a comment. If the kit ever separates them, this goes red and the
   * call sites have to be re-decided rather than silently re-styled. */
  it('the tab planes and the command planes are the same three objects at rest', () => {
    expect(flat(kit.tabPlaneTop)).toEqual(flat(kit.controlPlaneTop));
    expect(flat(kit.tabPlaneBottom)).toEqual(flat(kit.controlPlaneBottom));
    expect(flat(kit.tabPlaneContact)).toEqual(flat(kit.controlPlaneContact));
  });
});

// ── 2 · the press event reaches a rendered style, at every repaired family ──
describe('OTA-1811 §2 — press event → pressed state → visual change', () => {
  it.each(REPAIRED)('%s can report the press at all', (_name, control) => {
    expect(openingTag(control).startsWith('<Pressable')).toBe(true);
  });

  /* ⚠ A `Pressable` whose `pressed` never reaches a style is not a repair, and
   * that is the exact shape OTA-1806's predecessor suite scored as green. So
   * the question is where the BOUND name is spent, never whether the word
   * `Pressable` appears. */
  it.each(REPAIRED)('%s binds pressed and spends it on construction', (_name, control) => {
    const tag = openingTag(control);
    const bindsInStyle = /style\s*=\s*\{\s*\(\s*\{\s*pressed/.test(tag);
    const bindsInBody = /\{\s*\(\s*\{\s*pressed/.test(control.slice(tag.length));
    expect({ bindsInStyle: bindsInStyle || bindsInBody }).toEqual({ bindsInStyle: true });
    // and the bound value is actually consumed by a style or a plane set
    const spends = /pressed\s*&&\s*(?:kit\.|styles\.)/.test(control)
      || /ctlPlanes\(\s*pressed\s*\)/.test(control)
      || /body\(\s*true\s*,\s*pressed\s*\)/.test(control);
    expect({ spends }).toEqual({ spends: true });
  });

  it('the two sort bars and the capital sort draw planes as a function of the finger', () => {
    for (const c of [SORT_DISTANCE, SORT_READY, MQ_SORT]) {
      expect(/ctlPlanes\(\s*pressed\s*\)/.test(c)).toBe(true);
      expect(/\bTAB_PLANES\b/.test(c)).toBe(false);
    }
  });

  /* The milestone cell's construction lives one level below its pressable —
   * the wrapper is a bare `flex: 1` box — so the repair is only real if the
   * renderer that draws the CELL takes the finger as a parameter. */
  it('the milestone renderer takes pressed as a parameter and spends it on the cell', () => {
    expect(/const body = \(interactive: boolean, pressed: boolean\)/.test(CONTRACTS)).toBe(true);
    expect(/milestoneStyles\.cell,\s*pressed && kit\.controlPressed/.test(CONTRACTS)).toBe(true);
    // the read-only contract still exists and is still flat
    expect(/return body\(false, false\)/.test(CONTRACTS)).toBe(true);
  });
});

// ── 3 · at rest, nothing was added ──────────────────────────────────────────
describe('OTA-1811 §3 — the screen at rest is what it was', () => {
  /* Every construction this OTA introduces must be unreachable without a
   * finger. A pressed-only style that leaks into the resting array would be a
   * redesign wearing an interaction repair's name. */
  it('tabBtnPressed exists and is reachable only behind pressed', () => {
    expect(/\btabBtnPressed:\s*\{/.test(CONTRACTS)).toBe(true);
    const uses = [...CONTRACTS.matchAll(/styles\.tabBtnPressed/g)].map((m) => m.index as number);
    expect(uses.length).toBeGreaterThan(0);
    for (const at of uses) {
      expect(CONTRACTS.slice(Math.max(0, at - 20), at)).toMatch(/pressed\s*&&\s*$/);
    }
  });

  it.each(REPAIRED)('%s guards every kit press style behind pressed', (_name, control) => {
    const uses = [...control.matchAll(/kit\.controlPressed/g)].map((m) => m.index as number);
    for (const at of uses) {
      expect(control.slice(Math.max(0, at - 20), at)).toMatch(/pressed\s*&&\s*$/);
    }
  });

  /* ⚠ THE RESTING PLANES ARE STILL DRAWN, AND THE PRESS ONLY TAKES THEM AWAY.
   * A card that stopped standing on anything at rest would be a silent
   * flattening of the whole screen, so the claim has two halves: the chassis
   * construction still exists, and the only thing that removes it is a finger.
   * Asked of the file rather than of one control's slice, because the primary
   * objective card WRAPS other controls — the slice parser above deliberately
   * stops at the first nested touchable so a control can never be credited with
   * its neighbour's construction. */
  it('the two repaired plane sites collapse on a press and on nothing else', () => {
    expect(/const ROW_PLANES = \(/.test(CONTRACTS)).toBe(true);
    const guards = [...CONTRACTS.matchAll(/(\w+)\s*\?\s*null\s*:\s*ROW_PLANES/g)].map((m) => m[1]);
    expect(guards.sort()).toEqual(['cardPressed', 'pressed']);
  });

  it('every other resting plane site is untouched', () => {
    const all = [...CONTRACTS.matchAll(/\bROW_PLANES\b/g)].length;
    const conditional = [...CONTRACTS.matchAll(/\?\s*null\s*:\s*ROW_PLANES/g)].length;
    // one declaration + two repaired sites + the rows this OTA did not touch
    expect(all - conditional - 1).toBeGreaterThan(0);
  });
});

// ── 4 · SELECTED is not PRESSED, and the ordering is what proves it ─────────
describe('OTA-1811 §4 — a held control never stops looking selected', () => {
  const SELECTION: ReadonlyArray<readonly [string, string, string]> = [
    ['CONTRACTS tab', TAB_CONTRACTS, 'styles.tabBtnActive'],
    ['COLLECTIBLES tab', TAB_COLLECTABLES, 'styles.tabBtnActive'],
    ['SORT BY DISTANCE', SORT_DISTANCE, 'styles.sortBarOn'],
    ['SORT BY READY', SORT_READY, 'styles.sortBarReadyOn'],
    ['PRIMARY OBJECTIVE capital sort', MQ_SORT, 'styles.mqSortBtnOn'],
  ];

  /* ⚠⚠ THE WHOLE POINT, AND IT IS AN ORDERING FACT, NOT A COLOUR OPINION.
   * React Native resolves a style array left to right. `controlPressed` writes
   * `borderTopColor` and `borderBottomColor`; every selection style here writes
   * a border too. If the press came last, holding a selected control would
   * un-light it. Putting selection last makes that impossible by construction
   * — there is nothing to remember and nothing to get right twice. */
  it.each(SELECTION)('%s resolves selection after the press', (_name, control, onKey) => {
    const arr = styleArray(control);
    const press = arr.indexOf('kit.controlPressed');
    const on = arr.indexOf(onKey);
    expect(press).toBeGreaterThanOrEqual(0);
    expect(on).toBeGreaterThanOrEqual(0);
    expect({ selectionAfterPress: on > press }).toEqual({ selectionAfterPress: true });
  });

  /* ⚠ BOTH INDICES ARE ASSERTED PRESENT BEFORE THEY ARE COMPARED, and that is
   * a correction this suite's own negative control forced. The first draft
   * compared them directly, so deleting the press entirely left `-1` on the
   * left of a `>` and the claim passed while the repair was gone — an ordering
   * test that cannot see a missing operand is a vacuous test. */
  it('the expanded milestone ring also resolves after the press', () => {
    const arr = styleArray(MILESTONE);
    // the cell is rendered by `body`, so the ordering lives in the renderer
    const line = /\[milestoneStyles\.cell[^\]]*\]/.exec(CONTRACTS)?.[0] ?? '';
    const press = line.indexOf('kit.controlPressed');
    const on = line.indexOf('milestoneStyles.cellActive');
    expect(arr).toContain('flex: 1');
    expect({ press: press >= 0, on: on >= 0 }).toEqual({ press: true, on: true });
    expect({ selectionAfterPress: on > press }).toEqual({ selectionAfterPress: true });
  });

  /* ⚠⚠⚠ THE TAB'S SECOND GUARD. Ordering alone keeps a SELECTED tab gold, but
   * an UNSELECTED tab has `borderBottomColor: 'transparent'` and nothing later
   * in its array to restore it — `controlPressed` would light that edge and
   * forge the selection mark under any finger. `tabBtnPressed` hands the edge
   * back. Without this, pressed and selected become the same picture. */
  it('a pressed tab returns its bottom edge, so a press cannot forge selection', () => {
    const pressedFace = /tabBtnPressed:\s*\{([^}]*)\}/.exec(CONTRACTS)?.[1] ?? '';
    expect(pressedFace).toMatch(/borderBottomColor:\s*'transparent'/);
    for (const c of [TAB_CONTRACTS, TAB_COLLECTABLES]) {
      const arr = styleArray(c);
      expect(arr.indexOf('styles.tabBtnPressed')).toBeGreaterThan(arr.indexOf('kit.controlPressed'));
      expect(arr.indexOf('styles.tabBtnActive')).toBeGreaterThan(arr.indexOf('styles.tabBtnPressed'));
    }
  });
});

// ── 5 · the whole-control fade is gone from the repaired family ─────────────
describe('OTA-1811 §5 — presence is not participation', () => {
  /* The defect that made three controls look repaired: a live `pressed`
   * spending itself on `{ opacity: 0.7 }`. The style is deleted, not renamed,
   * and nothing references it. */
  it('sortBarPressed is neither defined nor referenced', () => {
    expect(/\bsortBarPressed\b/.test(CONTRACTS)).toBe(false);
  });

  it('no repaired control spends its press on an opacity fade', () => {
    for (const [name, control] of REPAIRED) {
      const tag = openingTag(control);
      expect({ name, fades: /activeOpacity/.test(tag) }).toEqual({ name, fades: false });
    }
  });
});

// ── 6 · the exclusion is proven, not asserted ──────────────────────────────
describe('OTA-1811 §6 — the slate filter was already correct and was left alone', () => {
  /* ⚠ THIS IS THE CLAIM THAT WOULD OTHERWISE BE FREE. "We inspected it and it
   * was fine" costs nothing to say. Defeating the behaviour it names turns this
   * red, which is the same discipline OTA-1810 applied to REPLAY OPENING. */
  it('the slate filter reports its press and spends it on the shared authority', () => {
    expect(openingTag(SLATE).startsWith('<Pressable')).toBe(true);
    expect(/pressed\s*&&\s*kit\.controlPressed/.test(SLATE)).toBe(true);
  });

  it('and its selection mark survives the press', () => {
    const arr = styleArray(SLATE);
    expect(arr).toContain('styles.slateBtnOn');
    // selection is carried by the label as well as the ring, so a press cannot erase it
    expect(/slateBtnTextOn/.test(SLATE)).toBe(true);
  });
});

// ── 7 · the blast radius that was NOT taken ────────────────────────────────
describe('OTA-1811 §7 — a Contracts authorization stayed inside Contracts', () => {
  /* `TTabBar` is the kit's shared tab component and Guidance, Vendor and
   * Crafting all render it. Converting it under this job would have restyled
   * three unrelated screens. This screen was reachable without it because it
   * owns its tabs locally — which is the fact that made the repair boundable,
   * and the fact that would silently stop being true if someone "consolidated"
   * these tabs later without re-reading the selection contract. */
  it('ContractsScreen owns its tabs locally and does not import the shared tab bar', () => {
    expect(/\bTTabBar\b/.test(CONTRACTS)).toBe(false);
    expect(/\btabBtn:\s*\{/.test(CONTRACTS)).toBe(true);
  });

  it('the repair did not reach for a second press system', () => {
    // the only travel in this screen comes from the shared authority
    const local = [...CONTRACTS.matchAll(/transform:\s*\[\{\s*translateY/g)];
    expect(local).toHaveLength(0);
  });
});

// ── 8 · the OTA claim, durable ─────────────────────────────────────────────
describe('OTA-1811 §8 — this repair is stamped, and the stamp can move on', () => {
  /* ⚠ "1811 OR LATER", NEVER "1811 FOREVER". An exact pin here would turn the
   * next legitimate OTA into a test failure, which is precisely the fixed-window
   * shape this project has had to unpick four times. */
  it('the build stamp is at or past this repair', () => {
    /* ⚠ ANCHORED TO `^export`, the same reader the publisher's Sentry step and
     * `check:otastamp` use. `buildInfo.ts` carries a long history of
     * `// SUPERSEDED:` lines and narrative, so an unanchored read finds prose
     * and reports the wrong number — which it did, on this suite's first run. */
    const stamp = /^export const OTA_BUILD_ID = '([^']+)'/m.exec(read('app', 'buildInfo.ts'))?.[1] ?? '';
    const n = Number(/-(\d{4})-/.exec(stamp)?.[1] ?? 0);
    expect(n).toBeGreaterThanOrEqual(1811);
  });
});
