// QOL #219 — DICE ORIENTATION CONSISTENCY.
//
// Owner report: combat dice/diamond roll glyphs show inconsistent/sideways
// orientation between roll panels. Traced before touching anything: there is
// exactly one roll-glyph function (`dieFace`) and one call site
// (`{dieFace(v, step.sides)}`), rendered under one shared `styles.dieFace`
// text style with no `transform` anywhere in this file or its stylesheet —
// so "sideways between panels" could not be a rotation bug. It was a glyph
// bug: the d6 branch used the upright pip glyphs U+2680-2685, the d10/d20
// branch returned '◈' (U+25C8), which is a SQUARE turned 45° at the glyph
// level, under the exact same un-rotated style. Repaired by swapping the
// d10/d20 glyph to '▣' (U+25A3), an upright square that reads consistently
// beside the pip faces. RNG, roll values, combat math, timing and action
// sequencing are untouched — this is a single character swap.
import { readFileSync } from 'fs';
import { join } from 'path';

const DICE = readFileSync(join(__dirname, '..', 'app', 'components', 'DiceRoller.tsx'), 'utf8');

describe('QOL #219 — the roll glyph is consistent because there is one function and no rotation', () => {
  it('dieFace is the sole glyph source for every die size, rendered under one shared, unrotated style', () => {
    // One call site — if a second panel ever rendered dice independently,
    // this would catch the fork before it could drift again.
    const calls = DICE.match(/dieFace\(/g) ?? [];
    expect(calls.length).toBe(2); // the definition + its one call site
    expect(DICE).toContain('{dieFace(v, step.sides)}');
    // A pop-in scale animation exists (`transform: [{ scale }]`) — fine, it's
    // uniform and momentary. What must NOT exist is a rotate TRANSFORM (as
    // opposed to this file's own explanatory prose, which is free to use the
    // word), which would make orientation depend on animation state rather
    // than the glyph alone.
    expect(DICE).not.toMatch(/rotate\s*:/);
  });

  it('the d10/d20 glyph is an upright square (▣), matching the d6 pips\' orientation — not the rotated diamond (◈)', () => {
    const i = DICE.indexOf('function dieFace(value: number, sides: number): string {');
    expect(i).toBeGreaterThan(-1);
    const body = DICE.slice(i, DICE.indexOf('\n}', i));
    expect(body).toContain("['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][value - 1]");
    expect(body).toContain("return '▣';");
    expect(body).not.toContain('◈');
  });

  it('the d6 pip faces are untouched — six distinct glyphs, one per face value', () => {
    const i = DICE.indexOf('function dieFace(value: number, sides: number): string {');
    const body = DICE.slice(i, DICE.indexOf('\n}', i));
    const pips = body.match(/'⚀'|'⚁'|'⚂'|'⚃'|'⚄'|'⚅'/g) ?? [];
    expect(new Set(pips).size).toBe(6);
  });
});
