/**
 * OTA-1781 — THE NAME GREW WITH THE MARK.
 *
 * Owner: *"The artwork grew but the weapon-name typography did not, so the name
 * now looks undersized and visually disconnected from the glyph. Do not simply
 * increase the globally shared quickText size if that unnecessarily changes
 * Punch, Dodge, Flee, Approach, companion controls, etc. Trace ownership first
 * and solve this at the narrowest appropriate level."*
 *
 * ⚠⚠⚠ THE NUMBER WAS NOT INVENTED — IT WAS ALREADY DRAWN, IN THE ONE PLACE
 * THAT DRAWS A PICTURE OF THIS BUTTON. Lore ▸ Glyphs ends with a mock weapon
 * chip (`WeaponGlyphKey`'s example row) and it has been setting its name at
 * 15 / 700 / 1 beside a 28dp mark since the artwork landed, while the LIVE
 * button set the same name at 12 / 400 / 0 beside the same mark. The teaching
 * surface and the control it teaches disagreed. This pass makes them one
 * authority rather than two agreeing literals, because a pairing kept in two
 * files is a pairing that drifts — which is how the disagreement arose.
 *
 * WHAT THIS SUITE PINS, AND IT IS THE CLAIM RATHER THAN THE MECHANISM:
 *   1. one authority exists and both surfaces read it;
 *   2. it carries SIZE AND WEIGHT ONLY — never a colour, or the chip
 *      vocabulary would start being decided by a typography table;
 *   3. the weapon name is bigger than the chassis type;
 *   4. THE CHASSIS TYPE DID NOT MOVE — `quickText` is still 12, which is the
 *      half of the instruction that is about what must NOT change;
 *   5. only the two weapon call sites opt in, so punch / dodge / flee /
 *      approach / travel / companion chips are untouched;
 *   6. the flag is explicit rather than derived from the glyph list.
 */
import fs from 'node:fs';
import path from 'node:path';

import { GLYPH_ART_SIZE, GLYPH_NAME_TYPE } from '../app/engine/combatGlyphArt';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const INPUT_BOX = 'app/components/InputBox.tsx';
const GLYPH_KEY = 'app/components/WeaponGlyphKey.tsx';
const ART = 'app/engine/combatGlyphArt.ts';

/* ⚠⚠⚠ GRADE THE CODE, NOT THE PROSE — the twenty-second sighting in this
 * rollout. Every file this suite scans opens with a comment block that QUOTES
 * the very literals it is about (`fontSize: 15`, `quickText`, `#9ec96a`), so a
 * raw-text scan would pass on the explanation of a fix rather than the fix.
 * The stripper drops `//` and block comments and keeps string bodies, and the
 * test below it proves the stripper still works — a comment-stripper nobody
 * checks is how this class of mistake comes back. */
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

/* ⚠⚠⚠ A JSX TAG DOES NOT END AT THE FIRST `>`, AND THIS SUITE LEARNED THAT THE
 * HARD WAY TWICE. `<QuickBtn[^>]*>` looks right and is wrong here: every one of
 * these tags carries `onPress={() => ...}`, so the scan stops on the ARROW and
 * hands back a truncated tag. The first cut asserted against that truncation and
 * could only ever fail. The honest terminator is the self-closing `/>`, which an
 * arrow cannot contain — the same family of mistake as OTA-1772's lazy
 * style-body scan running into the NEXT style. The self-check below is what
 * makes the span provable rather than believed. */
function quickBtnTags(code: string): string[] {
  return code.match(/<QuickBtn[\s\S]*?\/>/g) ?? [];
}

describe('OTA-1781 — the tag scanner this suite is built on', () => {
  it('captures whole tags, arrow functions and all', () => {
    const tags = quickBtnTags(codeOf(read(INPUT_BOX)));
    expect(tags.length).toBeGreaterThan(2);
    for (const t of tags) {
      expect(t).toContain('onPress');
      expect(t.endsWith('/>')).toBe(true);
    }
  });
});

describe('OTA-1781 — the comment-stripper this suite is built on', () => {
  it('drops both comment forms and keeps string bodies', () => {
    const src = "const a = 1; // fontSize: 99\n/* fontSize: 98 */ const b = 'fontSize: 97';";
    const code = codeOf(src);
    expect(code).not.toContain('99');
    expect(code).not.toContain('98');
    expect(code).toContain('97');
  });

  it('is actually load-bearing here — every scanned file names its own literals in prose', () => {
    for (const rel of [INPUT_BOX, GLYPH_KEY, ART]) {
      const raw = read(rel);
      expect(raw.length).toBeGreaterThan(codeOf(raw).length);
    }
  });
});

describe('OTA-1781 — one authority for the pairing', () => {
  it('the authority carries size and weight, and it is bigger than the chassis type', () => {
    expect(GLYPH_NAME_TYPE.fontSize).toBe(15);
    expect(GLYPH_NAME_TYPE.fontWeight).toBe('700');
    expect(GLYPH_NAME_TYPE.letterSpacing).toBe(1);
    expect(GLYPH_NAME_TYPE.fontSize).toBeGreaterThan(12);
  });

  /* ⚠ THE RULE THAT KEEPS DEPTH-OF-NAME ORTHOGONAL TO MEANING. The tone styles
   * (strike / ready / needs-approach / defensive / unavailable) each set their
   * own `color` and are applied BEFORE this style. A `color` here would win and
   * silently flatten the whole combat colour vocabulary. */
  it('carries NO colour — meaning stays at the call site', () => {
    expect(Object.keys(GLYPH_NAME_TYPE).sort()).toEqual(['fontSize', 'fontWeight', 'letterSpacing']);
  });

  it('sits beside the mark size it is paired with, in the same file', () => {
    const code = codeOf(read(ART));
    expect(code).toContain('GLYPH_ART_SIZE');
    expect(code).toContain('GLYPH_NAME_TYPE');
    expect(GLYPH_ART_SIZE.combat).toBe(28);
  });

  it('both the live control and the picture of it read the authority', () => {
    for (const rel of [INPUT_BOX, GLYPH_KEY]) {
      const code = codeOf(read(rel));
      expect(code).toContain('GLYPH_NAME_TYPE');
    }
  });

  /* ⚠ WRITTEN TO DIE THE DAY SOMEONE RE-TYPES THE PAIR. The mock's own row must
   * not carry a hand-typed size again: that literal is exactly what drifted. */
  it('the Lore mock no longer hand-types the pairing', () => {
    const code = codeOf(read(GLYPH_KEY));
    const example = code.match(/exampleText:\s*\{[^}]*\}/)?.[0] ?? '';
    expect(example).not.toBe('');
    expect(example).toContain('GLYPH_NAME_TYPE');
    expect(example).not.toMatch(/fontSize/);
    expect(example).not.toMatch(/fontWeight/);
  });
});

describe('OTA-1781 — the chassis did not move', () => {
  const code = codeOf(read(INPUT_BOX));

  /* ⚠⚠ THE HALF OF THE INSTRUCTION THAT IS ABOUT WHAT MUST NOT CHANGE. Owner:
   * *"Do not simply increase the globally shared quickText size."* `quickText`
   * is the type for every chip in the game. If a later pass "fixes" a
   * proportion by growing it, this fails. */
  it('quickText is still 12 — punch, dodge, flee, approach and the companions are untouched', () => {
    const chassis = code.match(/quickText:\s*\{[^}]*\}/)?.[0] ?? '';
    expect(chassis).not.toBe('');
    expect(chassis).toContain('fontSize: 12');
  });

  it('the weapon name is its own style, not the chassis grown', () => {
    expect(code).toMatch(/quickWeaponName:\s*GLYPH_NAME_TYPE/);
  });
});

describe('OTA-1781 — only the two weapon buttons opt in', () => {
  const code = codeOf(read(INPUT_BOX));

  /* ⚠⚠ EXPLICIT, NOT DERIVED. `glyphs.length > 0 || baseGlyph` is true of every
   * weapon chip today only by accident: `combatWeaponLabelParts` returns
   * `base: null` for a weapon whose damage type is unknown and an empty coat
   * list for an uncoated one, so a plain weapon falls through to the flat label
   * and would have kept the 12pt name the owner is objecting to. */
  it('the flag is a prop, and the flat-label path honours it too', () => {
    expect(code).toMatch(/weapon\?:\s*boolean/);
    expect(code).toMatch(/<Text style=\{\[textStyle, weapon \? styles\.quickWeaponName : null\]\}>\{label\.toUpperCase\(\)\}<\/Text>/);
  });

  it('exactly two call sites pass it, and both are attacks', () => {
    const sites = quickBtnTags(code).filter((s) => /\sweapon[\s>]/.test(s));
    expect(sites).toHaveLength(2);
    for (const s of sites) expect(s).toContain('attack with the');
  });

  /* ⚠ THE NEGATIVE, and it is the one a reader actually wants: no chip that is
   * not a weapon carries the flag. Counting the weapon sites alone would pass
   * even if DODGE had quietly been given it too. */
  it('no other chip in the file carries the flag', () => {
    const all = quickBtnTags(code);
    expect(all.length).toBeGreaterThan(2);
    const flagged = all.filter((s) => /\sweapon[\s>]/.test(s));
    expect(flagged).toHaveLength(2);
  });
});

describe('OTA-1781 — the chip does not get taller', () => {
  /* ⚠ MEASURED, NOT ASSERTED AS AN OPINION. The weapon chip is already sized by
   * the 28dp mark: 28 + 4 (row paddingVertical 2, both sides) + 12 (chip
   * paddingVertical 6, both sides) + 2 (border) = 46dp. A 15pt line box is
   * about 1.25 × 15 ≈ 19dp, which still sits inside the mark's own 28dp box, so
   * the name grows and the button does not. This is the arithmetic the claim
   * rests on; if the authority is ever raised past the mark it stops holding
   * and this test says so. */
  it('a line of the authority type still fits inside the mark', () => {
    const lineBox = Math.ceil(GLYPH_NAME_TYPE.fontSize * 1.25);
    expect(lineBox).toBeLessThanOrEqual(GLYPH_ART_SIZE.combat);
  });
});

describe('OTA-1781 — the colour ruling, recorded as code', () => {
  /* ⚠⚠⚠ THE OWNER KEPT THE SHIPPED SAGE, AND THE HEX IN THE RULING IS NOT THE
   * SHIPPED ONE. The message reads *"KEEP the current weapon-button sage:
   * #87966A. Do NOT change it to the proposed darker olive."* The instruction
   * is unambiguous — keep what is shipped — but `#87966A` has never existed in
   * this repository, in any commit, on any branch. The shipped fill is
   * `#9ec96a`. So NOTHING MOVED: the safe reading of "keep the current" is the
   * current pixels, and the hex is on the owner's desk as a question.
   * This test exists so that a later pass cannot quietly "apply" the ruling by
   * typing the other hex in. */
  it('the strike fill is untouched', () => {
    const code = codeOf(read(INPUT_BOX));
    expect(code).toContain("quickStrike: { borderColor: '#9ec96a', backgroundColor: '#9ec96a' }");
    expect(code.toLowerCase()).not.toContain('87966a');
  });
});
