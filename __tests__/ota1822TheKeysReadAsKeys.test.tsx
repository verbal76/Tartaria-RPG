/**
 * OTA-1822 — THE KEYS READ AS KEYS.
 *
 * ⚠⚠⚠ AN OWNER PHYSICAL PUNCH LIST, FIVE TARGETS, NOT AN AUDIT. Each one was
 * identified by hand on the device against a reference he named himself: the
 * gameplay movement/action controls (ENTER, STOP TRAVEL). Those are REFERENCE
 * AUTHORITY and are not touched here.
 *
 * WHAT THE REFERENCE ACTUALLY IS, read from source rather than guessed:
 * `TravelBtn` composes `kit.ctl` (face + rim + LIT TOP EDGE + DARK BOTTOM EDGE)
 * with `tControlDepth(pressed)` and the three control planes. Four of this job's
 * five targets already had a press response and were missing the same one thing —
 * `kit.ctl`, the RESTING dimensional body. That is why they read as labels,
 * outlines and cells rather than as keys.
 *
 * ⚠⚠ SO THE REPAIR IS ADDITIVE AND IT IS THE SAME REPAIR FOUR TIMES. No new
 * visual system, no invented shadow or glow, no global primitive touched, and no
 * call-site geometry changed: `kit.ctl` goes FIRST in each style array so every
 * local declaration after it — face, rim, blue identity, selected mark, expanded
 * ring — still wins its own fields exactly as before.
 *
 * ⚠ THE FIFTH IS A DIFFERENT ANIMAL AND IS NOT A MATERIAL REPAIR. See §5: the
 * black bar on the Character Selection press was never a backing layer.
 */

import fs from 'fs';
import path from 'path';
import { StyleSheet } from 'react-native';
import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';

/**
 * ⚠⚠ COMMENTS ARE STRIPPED BEFORE EVERY STRUCTURAL READ, and that is not
 * fastidiousness — it is a defect this codebase has produced more than once. A
 * scan for `styles.replayBtn` otherwise matches the PROSE of the very comment
 * that explains the repair, and `styleArrayAt` then returns whatever array
 * happens to follow that sentence. It did exactly that on the first run of this
 * suite: §1 read an HP bar's width style and reported REPLAY OPENING unrepaired.
 */
const strip = (src: string) => src
  /* ⚠ BLOCK COMMENTS ARE REMOVED AS BLOCKS, not by guessing at line prefixes. A
   * line-prefix filter only catches continuation lines that happen to begin with
   * `*`, and this OTA's own explanatory comments do not — so a sentence
   * describing `kit.controlPressed` survived the filter and was then read as if
   * it were code. Removing the whole `/*…*\/` span cannot miss that. */
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const read = (p: string) => strip(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
const CHARACTER = read('app/screens/CharacterScreen.tsx');
const CONTRACTS = read('app/screens/ContractsScreen.tsx');
const TITLE = read('app/screens/TitleScreen.tsx');
const INPUTBOX = read('app/components/InputBox.tsx');

/**
 * The style array an element declares, as written.
 *
 * ⚠ THE OPENING BRACKET IS BEHIND THE ANCHOR, NOT AHEAD OF IT. The first draft
 * searched FORWARD from the anchor for `[`, which was correct only while the
 * anchor happened to be the array's first entry. This OTA puts `kit.ctl` first,
 * so every anchor moved to second place and the forward search sailed past the
 * real array into the next one it could find — §1 read an HP bar's width style
 * and reported REPLAY OPENING unrepaired while the repair was sitting there.
 * A helper that can silently read the WRONG array is worse than no helper.
 */
function styleArrayAt(src: string, anchor: string): string {
  const at = src.indexOf(anchor);
  if (at === -1) throw new Error(`anchor not found: ${anchor}`);
  const open = src.lastIndexOf('[', at);
  const close = src.indexOf(']', at);
  if (open === -1 || close === -1) throw new Error(`no array around: ${anchor}`);
  const arr = src.slice(open, close + 1);
  // and it must actually contain the thing we asked about
  if (!arr.includes(anchor)) throw new Error(`array does not contain: ${anchor}`);
  return arr;
}

// ══════════════════════════════════════════════════════════════════════════════
// §0 — THE AUTHORITY ITSELF: what "reads as a Tartaria key" actually means
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1822 §0 — the reference authority, stated before it is applied', () => {
  test('0.1 kit.ctl IS the resting dimensional body: face, rim, lit top, dark bottom', () => {
    const f = StyleSheet.flatten(kit.ctl) as Record<string, unknown>;
    expect(f.backgroundColor).toBeTruthy();   // a physical face, not a hole
    expect(f.borderWidth).toBe(1);
    expect(f.borderColor).toBeTruthy();
    expect(f.borderTopColor).toBeTruthy();    // catches the light
    expect(f.borderBottomColor).toBeTruthy(); // sits in shadow
    expect(f.borderTopColor).not.toBe(f.borderBottomColor); // the whole point
  });

  test('0.2 the gameplay reference control composes exactly that, and is UNTOUCHED', () => {
    expect(INPUTBOX).toMatch(/tartariaKitStyles\.ctl, styles\.travelBtn/);
    expect(INPUTBOX).toMatch(/tControlDepth\(pressed\)/);
    // no OTA-1822 edit reached the reference
    expect(INPUTBOX).not.toMatch(/OTA-1822/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §1 — TARGET 1: REPLAY OPENING
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1822 §1 — REPLAY OPENING reads and reacts as a button', () => {
  const ARR = () => styleArrayAt(CHARACTER, 'styles.replayBtn');

  test('1.1 it now carries the resting dimensional body', () => {
    expect(ARR()).toContain('kit.ctl');
  });

  test('1.2 kit.ctl is FIRST, so its own accepted colour still wins', () => {
    const a = ARR();
    expect(a.indexOf('kit.ctl')).toBeLessThan(a.indexOf('styles.replayBtn'));
    // the colours OTA-1810 pinned are untouched in the style block itself
    const blk = /replayBtn:\s*\{([^}]*)\}/.exec(CHARACTER)?.[1] ?? '';
    expect(blk).toMatch(/backgroundColor:\s*'#1a1714'/);
    expect(blk).toMatch(/borderColor:\s*'#3a342c'/);
  });

  test('1.3 the press response is present and unchanged', () => {
    expect(ARR()).toContain('tControlDepth(pressed)');
  });

  test('1.4 wording, two-line composition and action are unchanged', () => {
    expect(CHARACTER).toContain("REPLAY{'\\n'}OPENING");
    expect(CHARACTER).toMatch(/onPress=\{\(\) => replayStoryIntro\(\)\}/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §2 — TARGET 2: THE TWO TABS
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1822 §2 — CONTRACTS and COLLECTIBLES read as tab buttons', () => {
  /* ⚠ anchored INSIDE the array. `setTab('contracts')` is the onPress, which is
   * written ABOVE the style prop, so anchoring there made the helper walk
   * backwards out of the element entirely. */
  const CONTRACTS_TAB = () => styleArrayAt(CONTRACTS, "tab === 'contracts' && styles.tabBtnActive");
  const COLLECT_TAB = () => styleArrayAt(CONTRACTS, "tab === 'collectables' && styles.tabBtnActive");

  test('2.1 BOTH tabs carry the resting dimensional body', () => {
    expect(CONTRACTS_TAB()).toContain('kit.ctl');
    expect(COLLECT_TAB()).toContain('kit.ctl');
  });

  test('2.2 both still react to the finger', () => {
    for (const a of [CONTRACTS_TAB(), COLLECT_TAB()]) {
      expect(a).toContain('pressed && kit.controlPressed');
      expect(a).toContain('pressed && styles.tabBtnPressed');
    }
  });

  test('2.3 ⚠ THEY ARE STILL TABS — selection semantics untouched', () => {
    expect(CONTRACTS_TAB()).toContain("tab === 'contracts' && styles.tabBtnActive");
    expect(COLLECT_TAB()).toContain("tab === 'collectables' && styles.tabBtnActive");
    // the selected mark still resolves AFTER the press, so a held tab cannot
    // forge selection — OTA-1811's rule, preserved by ordering
    for (const a of [CONTRACTS_TAB(), COLLECT_TAB()]) {
      expect(a.indexOf('kit.controlPressed')).toBeLessThan(a.indexOf('tabBtnActive'));
      expect(a.indexOf('kit.ctl')).toBeLessThan(a.indexOf('styles.tabBtn'));
    }
  });

  test('2.4 tab behaviour, counts and content switching are unchanged', () => {
    expect(CONTRACTS).toMatch(/onPress=\{\(\) => setTab\('contracts'\)\}/);
    expect(CONTRACTS).toMatch(/onPress=\{\(\) => setTab\('collectables'\)\}/);
    expect(CONTRACTS).toContain('totalFragmentsFound');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §3 — TARGET 3: THE ROUTE / SET COURSE COMMAND
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1822 §3 — the routing command is a body, not an outline', () => {
  test('3.1 EVERY site in the family carries the dimensional body', () => {
    const withCtl = [...CONTRACTS.matchAll(/\[kit\.ctl, styles\.routeBtn, tControlDepth\(pressed\)\]/g)].length;
    const without = [...CONTRACTS.matchAll(/\[styles\.routeBtn, tControlDepth\(pressed\)\]/g)].length;
    /* ⚠ ONE FAMILY, NOT ONE BUTTON. The owner named the Hunt route control "for
     * example"; the same `styles.routeBtn` draws ROUTE TO, SET COURSE TO and
     * RETURN THE SIGIL. Repairing the class is the narrow answer — repairing one
     * instance would have left seven siblings flat. */
    expect(withCtl).toBe(8);
    expect(without).toBe(0);
  });

  test('3.2 the blue identity is preserved, not replaced', () => {
    const blk = /routeBtn:\s*\{([^}]*)\}/.exec(CONTRACTS)?.[1] ?? '';
    expect(blk.length).toBeGreaterThan(0);
    expect(CONTRACTS).toMatch(/routeBtnText:.*color:\s*'#9ec0ef'/);
  });

  test('3.3 press response present; route logic untouched', () => {
    expect(CONTRACTS).toContain('tControlDepth(pressed)');
    expect(CONTRACTS).toMatch(/ROUTE TO \$\{info\.anchorName\.toUpperCase\(\)\}/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §4 — TARGET 4: THE FOUR MILESTONE CELLS
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1822 §4 — ENEMIES, TRAVELS, CHECKS and NPCS MET are keys', () => {
  test('4.1 all four are reached, because all four come through ONE renderer', () => {
    for (const label of ['Enemies', 'Travels', 'Checks', 'NPCs Met']) {
      expect(CONTRACTS).toContain(`label="${label}"`);
    }
    // one body() renderer, so one repair reaches all four
    expect(CONTRACTS).toMatch(/const body = \(interactive: boolean, pressed: boolean\)/);
  });

  test('4.2 ⚠ THE ROOT CAUSE: the cell had a colourless hairline and no face', () => {
    const cell = /\n  cell:\s*\{([^}]*)\}/.exec(CONTRACTS)?.[1] ?? '';
    expect(cell).toContain('borderWidth: 1');
    // it still declares no colour and no face of its own — kit.ctl supplies both
    expect(cell).not.toMatch(/borderColor:/);
    expect(cell).not.toMatch(/backgroundColor:/);
  });

  test('4.3 the cell now carries the same material as the reference control', () => {
    const arr = styleArrayAt(CONTRACTS, 'milestoneStyles.cell');
    expect(arr).toContain('kit.ctl');
    expect(arr.indexOf('kit.ctl')).toBeLessThan(arr.indexOf('milestoneStyles.cell'));
  });

  test('4.4 press still reacts, and SELECTED still beats PRESSED', () => {
    const arr = styleArrayAt(CONTRACTS, 'milestoneStyles.cell');
    const press = arr.indexOf('kit.controlPressed');
    const on = arr.indexOf('milestoneStyles.cellActive');
    expect({ press: press >= 0, on: on >= 0 }).toEqual({ press: true, on: true });
    expect(on).toBeGreaterThan(press);
  });

  test('4.5 the information cell is still an information cell', () => {
    expect(CONTRACTS).toContain('▸ tap to list');
    expect(CONTRACTS).toContain('▾ tap to close');
    expect(CONTRACTS).toMatch(/milestoneStyles\.value/);
    // the row-chassis planes are NOT re-classified by this material repair
    expect(CONTRACTS).toMatch(/pressed \? null : ROW_PLANES/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §5 — TARGET 5: THE BLACK BAR WAS THE SHADOW
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1822 §5 — the Character Selection press stops dragging its shadow', () => {
  /**
   * ⚠⚠⚠ ROOT CAUSE, AND IT IS NOT WHAT IT LOOKED LIKE. There is no black backing
   * layer behind the record. `dossierOuter` paints NO background and NO border —
   * it exists to cast the drop shadow (#000 at 0.5 opacity, radius 6, already
   * offset y+3). `kit.controlPressed` was applied to THAT view, and since the
   * view has no border its two border colours were inert: the only thing it
   * contributed was `translateY(3)`. Translating the shadow-CASTING view slid the
   * shadow out from under the card, so ~3dp of near-opaque black appeared below
   * the record for exactly as long as the finger was down.
   *
   * ⚠ THE FIX IS COMPOSITIONAL, NOT COSMETIC, AND THE ANIMATION SURVIVES. The
   * travel moves onto `dossierRim` — the thing a player perceives AS the card —
   * so the card still depresses while the shadow stays where the resting record
   * put it. Nothing was flattened to hide the artifact.
   */
  const OUTER_COLLAPSED = () => styleArrayAt(TITLE, 'styles.dossierOuter, !bootGateOpen');
  const OUTER_OPEN = () => styleArrayAt(TITLE, 'styles.dossierOuter, styles.dossierOuterOpen');

  /* ⚠⚠ AMENDED BY OTA-1826, AND THE AMENDMENT IS A WIDENING, NOT A CLIMBDOWN.
   *
   * This test asserted `dossierOuter` had NO backgroundColor. That was a true
   * description of the repair as built, and it pinned the wrong half of it. The
   * load-bearing claims here were always "the shadow-caster does not travel"
   * (5.2) and "the rim, not the outer, owns the edge" — never "the outer paints
   * nothing".
   *
   * Leaving it transparent is precisely what OTA-1826 had to fix. The rim is the
   * only layer in this subtree that paints, so its 3dp of travel uncovered 3dp
   * of THIS view, and a transparent strip showed the app backdrop (Android,
   * where `elevation` is deliberately absent) or that plus the anchored #000
   * shadow (iOS). The owner saw a black rectangle on the top edge of a pressed
   * record on both.
   *
   * The pin now asserts the PROPERTY the repair rests on — the travel gap is
   * painted, in the card's own material — plus everything the old pin was
   * genuinely protecting. More assertions than before, not fewer. */
  test("5.1 the shadow-caster is identified: shadow present, edge still the rim's", () => {
    const blk = /dossierOuter:\s*\{([^}]*)\}/.exec(TITLE)?.[1] ?? '';
    expect(blk).toMatch(/shadowColor:\s*'#000'/);
    expect(blk).toMatch(/shadowOffset/);
    // the rim, not the outer, is the thing with an edge — unchanged claim
    expect(blk).not.toMatch(/borderWidth:/);
  });

  test('5.1b ⚠ OTA-1826 — the outer paints the strip the rim vacates', () => {
    const blkOf = (name: string) =>
      new RegExp(`${name}:\\s*\\{([^}]*)\\}`).exec(TITLE)?.[1] ?? '';
    const fill = (s: string) => /backgroundColor:\s*'([^']+)'/.exec(s)?.[1];
    // it must paint at all — a transparent outer IS the defect
    expect(fill(blkOf('dossierOuter'))).toBeTruthy();
    // and it must paint the card's own resting material, not an invented tone
    expect(fill(blkOf('dossierOuter'))).toBe(fill(blkOf('dossierRim')));
    // the selected record travels over its own warmer fill
    expect(fill(blkOf('dossierOuterOpen'))).toBe(fill(blkOf('dossierRimOpen')));
    // …and a dead record over rust, not over the live card's grey
    expect(fill(blkOf('dossierOuterDead'))).toBe(fill(blkOf('dossierRimDead')));
  });

  test('5.2 ⚠ THE REPAIR: the shadow-caster no longer travels', () => {
    expect(OUTER_COLLAPSED()).not.toContain('kit.controlPressed');
    expect(OUTER_OPEN()).not.toContain('kit.controlPressed');
  });

  test('5.3 ⚠ AND THE BUTTON STILL DEPRESSES — the travel moved to the card body', () => {
    expect(TITLE).toContain('pressed && kit.controlPressed, pressed && styles.dossierRimPressed');
    expect(TITLE).toContain('pressed && kit.controlPressed, pressed && styles.dossierRimOpenPressed');
  });

  test('5.4 the alloy edge inversion still wins, because it is declared after', () => {
    for (const rim of ['dossierRimPressed', 'dossierRimOpenPressed']) {
      const arr = styleArrayAt(TITLE, `styles.${rim}`.replace(`styles.${rim}`, 'styles.dossierRim'));
      void arr;
      const line = TITLE.slice(TITLE.indexOf(`pressed && kit.controlPressed, pressed && styles.${rim}`));
      expect(line.indexOf('kit.controlPressed')).toBeLessThan(line.indexOf(rim));
    }
  });

  test('5.5 the travel itself is unchanged — still the kit primitive, still guarded', () => {
    const down = StyleSheet.flatten(kit.controlPressed) as { transform?: { translateY?: number }[] };
    expect(down.transform?.[0]?.translateY).toBe(3);
    /* every press mark in the dossier is still behind `pressed` — asserted as
     * "each occurrence is preceded by `pressed &&`" rather than by a lookahead
     * on what FOLLOWS it, which only described the punctuation of one call site. */
    const marks = [...TITLE.matchAll(/kit\.controlPressed/g)];
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) {
      expect(TITLE.slice(Math.max(0, (m.index as number) - 11), m.index as number)).toContain('pressed && ');
    }
  });

  test('5.6 resting composition and entry behaviour are unchanged', () => {
    expect(TITLE).toMatch(/styles\.dossierOuter/);
    expect(TITLE).toMatch(/styles\.dossierRim/);
    expect(TITLE).toMatch(/dossierRimDead/);       // dead-record identity kept
    expect(TITLE).toMatch(/styles\.dossierOuterOpen/);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// §6 — SCOPE: FIVE TARGETS, AND NOTHING ELSE
// ══════════════════════════════════════════════════════════════════════════════
describe('OTA-1822 §6 — the blast radius is the punch list', () => {
  test('6.1 OTA-1821 Target 7 is untouched', () => {
    expect(CONTRACTS).toMatch(/trackBtnOn: \{\},/);
    expect(CONTRACTS).toMatch(/trackBtnOff: \{\},/);
    expect(CONTRACTS).toContain("'▮▮ DEACTIVATE' : '▶ SET ACTIVE'");
    // the activate/deactivate control did NOT acquire this pass's change
    const toggle = styleArrayAt(CONTRACTS, 'styles.trackBtn, tracked');
    expect(toggle).toContain('kit.ctl'); // it already had it, from OTA-1821
    expect(toggle).toContain('styles.trackBtnPressed');
  });

  test('6.2 the Character accordion headers are untouched', () => {
    expect(CHARACTER).toMatch(/kit\.controlPlaneTopPressed/);
    expect(CHARACTER).toMatch(/kit\.controlPlaneContact/);
    expect(CHARACTER).toMatch(/SECTIONS_ALL_COLLAPSED/);
  });

  test('6.3 no new visual system was invented — only kit.ctl was added', () => {
    /* Every OTA-1822 production edit is the SAME addition. If a future edit
     * sneaks a bespoke shadow, gradient or glow into these screens under this
     * OTA's name, this is where it shows up. */
    for (const [name, src] of [['character', CHARACTER], ['contracts', CONTRACTS], ['title', TITLE]] as const) {
      const code = src.split('\n').filter((l) => {
        const t = l.trim();
        return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/') || t.startsWith('{/*'));
      }).join('\n');
      expect({ [name]: /linear-gradient|textShadowRadius:\s*2[0-9]/.test(code) }).toEqual({ [name]: false });
    }
  });

  test('6.4 the reference gameplay controls were not restyled', () => {
    expect(INPUTBOX).not.toMatch(/OTA-1822/);
  });
});
