/**
 * OTA-1763 — THE ILLUSTRATED DAMAGE ICONS, ON TRIAL IN ONE SURFACE.
 *
 * Owner: *"We are going to test the new illustrated icon library in ONE isolated
 * surface first. DO NOT change live combat, weapon controls, weapon tabs/cards,
 * inventory, or any other production icon surface yet."* and *"Do not let this
 * turn into another architecture migration."*
 *
 * So the load-bearing half of this suite is what it proves DID NOT happen. Nine
 * 64x64 RGBA PNGs land in `assets/damage/`, one table keys them, and exactly one
 * block in the Lore cheat sheet renders them. Everything else is asserted still.
 *
 * ⚠⚠ THE TRACE THE OWNER ASKED FOR, AND IT SAID THE TWO SURFACES DISAGREE:
 *     Lore cheat sheet   `WeaponGlyphKey.cell`     15pt, fixed width 28
 *     Live combat        `InputBox.coatGlyph`      12pt INHERITED, inline, no box
 * Combat paints its glyphs 20% smaller, inside a text flow with no box to put an
 * image in. Owner: *"Therefore Lore is NOT a 1:1 proxy for the current
 * live-combat implementation. That is fine."* Both halves are pinned below so
 * the finding cannot rot before the combat container is designed.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { DAMAGE_ICON_IDS, DAMAGE_ICON_LABEL, damageIcon } from '../app/engine/damageIcons';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const KEY = read('app', 'components', 'WeaponGlyphKey.tsx');
const ICONS = read('app', 'engine', 'damageIcons.ts');
const INPUTBOX = read('app', 'components', 'InputBox.tsx');
const ART = join(ROOT, 'assets', 'damage');

/* ⚠⚠⚠ GRADE THE CODE, NOT THE PROSE — AND THIS SUITE HAD TO LEARN IT TOO.
 * Two assertions below failed on their first run against the COMMENTS that
 * explain them: `damageIcons.ts` says the source IDs are provenance-only by
 * NAMING one, and the trial block says "no `tintColor`" by writing the word.
 * That is the fifth time in this rollout that a check has graded the write-up
 * of a fix instead of the fix — `check:gold` grew a tokeniser for it, OTA-1762's
 * chroma rule grew one, and here it is again. A check trippable by its own
 * explanation teaches people to delete the explanation. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/* ⚠⚠⚠ SLICE ON THE DECLARATION, NOT THE NAME — A FALSE GREEN CAUGHT IN THE ACT.
 * The first draft of this suite sliced InputBox with
 * `indexOf('coatGlyph: {') … indexOf('quickStrikeText')`, and `quickStrikeText`
 * appears in the STYLE ARRAY at ~1392 long before its declaration at ~1789. The
 * slice came out EMPTY, so every `not.toContain` on it passed vacuously — the
 * test was green and checking nothing. Two leading spaces pin the declaration. */
const styleBlock = (src: string, name: string, until: string) => {
  const a = src.indexOf(`\n  ${name}: {`);
  const b = src.indexOf(`\n  ${until}:`, a + 1);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
};

/** Read a PNG header without a decoder: dimensions, bit depth, colour type. */
const png = (file: string) => {
  const d = readFileSync(join(ART, file));
  expect(d.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { w: d.readUInt32BE(16), h: d.readUInt32BE(20), depth: d[24], colour: d[25], bytes: d.length };
};

// ═══ 1. THE ASSETS ARRIVED UNMODIFIED ════════════════════════════════════════
describe('nine files, 64x64 RGBA, exactly as supplied', () => {
  const FILES = ['impact', 'rupture', 'heat', 'galvanic', 'noxious',
    'resonance', 'cold', 'radiation', 'environmental'];

  test('⚠⚠ every one is 64x64, 8-bit RGBA — the source resolution is unchanged', () => {
    /* Owner: *"The source resolution stays 64x64. We are testing DISPLAY size,
     * not changing source resolution."* and *"Do not substitute, redraw,
     * recolor, regenerate, or use placeholders."* */
    for (const f of FILES) {
      const p = png(`${f}.png`);
      expect([p.w, p.h]).toEqual([64, 64]);
      expect(p.depth).toBe(8);
      expect(p.colour).toBe(6);   // 6 = RGBA
      expect(p.bytes).toBeGreaterThan(1000);
    }
  });

  test('⚠ NINE binaries, not ten — gas shares noxious rather than duplicating bytes', () => {
    const pngs = readdirSync(ART).filter((f) => f.endsWith('.png')).sort();
    expect(pngs).toHaveLength(9);
    expect(pngs).toEqual([...FILES].sort().map((f) => `${f}.png`));
    expect(pngs).not.toContain('gas.png');
  });

  test('⚠⚠ the source pack IDs are NOWHERE in runtime code — provenance only', () => {
    /* Owner: *"Do not name runtime assets W50.png, 101.png, etc. Those are
     * source-library identifiers."* They belong in the README beside what each
     * picture shows, and the running app must never need them. */
    for (const id of ['W50', 'W193', 'L544']) {
      expect(codeOf(ICONS)).not.toContain(id);
      expect(codeOf(KEY)).not.toContain(id);
    }
    expect(readdirSync(ART).join(' ')).not.toMatch(/W\d|L\d/);
    // …and they ARE recorded, so the provenance is not lost either
    const readme = read('assets', 'damage', 'README.md');
    for (const id of ['W50', 'W193', '101', '298', '98', '304', '109', '99', 'L544']) {
      expect(readme).toContain(id);
    }
  });

  test('the folder follows the repo’s asset convention, with a README like crests', () => {
    expect(statSync(join(ART, 'README.md')).size).toBeGreaterThan(500);
    const readme = read('assets', 'damage', 'README.md');
    expect(readme).toContain('PROVISIONAL');
    expect(readme).toContain('64×64');
  });
});

// ═══ 2. ONE TABLE, TEN CONCEPTS ══════════════════════════════════════════════
describe('one centralized mapping, not scattered requires', () => {
  test('ten concepts resolve to art', () => {
    expect(DAMAGE_ICON_IDS).toHaveLength(10);
    for (const id of DAMAGE_ICON_IDS) expect(damageIcon(id)).toBeDefined();
  });

  test('⚠⚠ gas and noxious resolve to the SAME binary, by instruction', () => {
    expect(damageIcon('gas')).toBe(damageIcon('noxious'));
  });

  test('an unknown concept is absent rather than throwing', () => {
    expect(damageIcon('bludgeoning')).toBeUndefined();
    expect(damageIcon('')).toBeUndefined();
  });

  test('⚠ every concept keeps a human label — the art SUPPLEMENTS the word', () => {
    /* Owner rule 6: *"Preserve the existing text labels. The image supplements
     * the word; it does not replace the label."* */
    for (const id of DAMAGE_ICON_IDS) {
      expect(DAMAGE_ICON_LABEL[id].length).toBeGreaterThan(2);
    }
    expect(DAMAGE_ICON_LABEL.cold).toBe('Cold / Freezing');
    expect(DAMAGE_ICON_LABEL.gas).toBe('Gas / Fumes');
  });

  test('⚠⚠⚠ the table does NOT bind concepts to the game’s damage types', () => {
    /* The owner supplied concept → file. The game's vocabulary is a different
     * list, and deciding that `rupture` means slashing or piercing is a ruling
     * about the game rather than about the art. Making it inside an art table
     * would smuggle a design decision in under a display experiment. */
    for (const t of ['bludgeoning', 'slashing', 'piercing', 'aetheric', 'poison']) {
      expect(ICONS).not.toMatch(new RegExp(`^\\s*${t}:`, 'm'));
    }
    expect(ICONS).toContain('OPEN OWNER DECISION');
  });
});

// ═══ 3. ⚠⚠⚠ WHAT DID NOT CHANGE — THE HALF THAT MATTERS ══════════════════════
describe('nothing outside the Lore trial block was touched', () => {
  test('⚠⚠⚠ live combat still paints TEXT glyphs, and knows nothing about the art', () => {
    expect(INPUTBOX).not.toContain('damageIcons');
    expect(INPUTBOX).not.toContain('assets/damage');
    // the shipped construction the trace measured, still exactly as it was
    expect(INPUTBOX).toMatch(/coatGlyph: \{\s*backgroundColor: '#0d0b09',/);
    expect(INPUTBOX).toContain("quickText: { color: '#cdbf99', fontSize: 12 }");
  });

  test('⚠⚠ no other surface imports the trial art', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const consumers = walk(join(ROOT, 'app'))
      .filter((p) => !p.endsWith('damageIcons.ts') && !p.endsWith('buildInfo.ts'))
      .filter((p) => readFileSync(p, 'utf8').includes('damageIcons'))
      .map((p) => p.slice(ROOT.length + 1));
    expect(consumers).toEqual(['app/components/WeaponGlyphKey.tsx']);
  });

  test('⚠⚠ the existing text-glyph key is intact above the trial', () => {
    /* The key still derives from the live `weaponGlyphs` tables the combat
     * buttons paint from — the trial is additive and deleting it removes the
     * whole experiment without disturbing anything. */
    expect(KEY).toContain("from '../engine/weaponGlyphs'");
    expect(KEY).toContain('baseTypesInPlay()');
    expect(KEY).toMatch(/cell: \{\s*width: 28,\s*textAlign: 'center',\s*fontSize: 15,/);
    expect(KEY.indexOf('OWN DAMAGE')).toBeLessThan(KEY.indexOf('ILLUSTRATED ICON TRIAL'));
  });
});

// ═══ 4. HOW THE TRIAL DISPLAYS THEM ══════════════════════════════════════════
describe('the trial block is a controlled comparison, not three redesigns', () => {
  test('⚠⚠ three sizes in ONE layout: A current, B +4, C +8', () => {
    /* Owner: *"give me the current / +4dp / +8dp comparison without requiring
     * three unrelated redesigns of the screen."* One row per concept, three
     * boxes per row, one shared label — the artwork is the only variable. */
    expect(KEY).toContain("{ key: 'A', px: 28, note: 'current' }");
    expect(KEY).toContain("{ key: 'B', px: 32, note: '+4' }");
    expect(KEY).toContain("{ key: 'C', px: 36, note: '+8' }");
  });

  test('⚠⚠⚠ A is the cell’s measured WIDTH, not the 15pt font size', () => {
    /* Owner: *"Do not blindly assume that the old 15pt Text glyph dimension
     * translates directly into the correct Image dimension."* A 15pt glyph sits
     * in a 28pt-wide cell whose height is the line box. 28 is the footprint. */
    expect(KEY).toContain('THE BASE SIZE IS NOT ASSUMED FROM THE 15pt TEXT GLYPH');
    expect(KEY).toMatch(/cell: \{\s*width: 28,/);
  });

  test('⚠⚠ no tint, contain, square box — artwork not glyphs', () => {
    /* Owner rule 7-9: no recolour, preserve aspect, no stretching, no
     * destructive cropping. A 1:1 source in a square box under `contain` is an
     * exact fit: nothing is scaled non-uniformly and nothing is clipped. */
    const trial = codeOf(KEY.slice(KEY.indexOf('function IconTrial')));
    expect(trial).toContain('resizeMode="contain"');
    expect(trial).not.toContain('tintColor');
    expect(trial).toMatch(/width: s\.px, height: s\.px/);
    // ⚠ and the stripper must actually be doing something, or this test quietly
    // stops checking anything the day the comment is reworded
    expect(KEY.slice(KEY.indexOf('function IconTrial'))).toContain('tintColor');
  });

  test('every concept renders, and each carries its label', () => {
    const trial = KEY.slice(KEY.indexOf('function IconTrial'));
    expect(trial).toContain('DAMAGE_ICON_IDS.map');
    expect(trial).toContain('DAMAGE_ICON_LABEL[id]');
    expect(trial).toContain('testID={`damage-icon-${id}-${s.key}`}');
  });

  test('⚠ the block says PROVISIONAL on the screen, not only in a document', () => {
    expect(KEY).toContain('ILLUSTRATED ICON TRIAL — PROVISIONAL');
    expect(KEY).toContain('Not wired into combat');
  });
});

// ═══ 5. THE TRACE, PINNED ════════════════════════════════════════════════════
describe('the two glyph surfaces measured, and they disagree', () => {
  test('⚠⚠⚠ Lore is 15pt in a fixed 28 box; combat is 12pt inline with no box', () => {
    /* This is why the trial is not a proxy for combat, and it is pinned so the
     * finding survives until the combat container is designed. Either number
     * changing should fail this and force a re-read. */
    expect(KEY).toMatch(/cell: \{\s*width: 28,\s*textAlign: 'center',\s*fontSize: 15,/);
    // combat's glyph sets NO fontSize of its own — that is the finding
    const coat = styleBlock(INPUTBOX, 'coatGlyph', 'quickStrikeText');
    expect(coat.length).toBeGreaterThan(40);   // ⚠ or the next two prove nothing
    expect(coat).not.toContain('fontSize');
    /* ⚠ A LAYOUT width, at the style's own indent — `textShadowOffset: { width:
     * 0, height: 0 }` is a shadow vector, not a box, and a bare `toContain`
     * caught it and called it a box. The point stands either way: this glyph
     * has no width of its own, which is why it cannot hold an image. */
    expect(coat).not.toMatch(/^ {4}width:/m);
    expect(INPUTBOX).toContain("quickText: { color: '#cdbf99', fontSize: 12 }");
    // and it pads with hair spaces because an inline Text takes no padding in RN
    expect(INPUTBOX).toContain('\\u200a');
  });

  test('⚠⚠⚠ the halo came off the KEY and stayed on the BUTTONS, deliberately', () => {
    /* Owner: *"if we have these I don't think we need the black outline
     * anymore"*, then, asked which of the two surviving places: *"not the ones
     * on the weapons during combat yet."*
     * ⚠ The cost is real and is recorded rather than discovered: OTA-1568/1569
     * gave this key the buttons' own inlay and halo so it would SHOW what a
     * button looks like, and while combat keeps its halo the key no longer
     * mirrors it. That is a temporary state of a provisional experiment, it
     * resolves whichever way the owner's call goes, and it is one line either
     * way — but it is asserted here so nobody rediscovers it as a bug. */
    const cell = codeOf(styleBlock(KEY, 'cell', 'name'));
    expect(cell).not.toContain('textShadowRadius');
    expect(cell).not.toContain('#0d0b09');
    // …and the measurements the A/B/C sizes are calibrated against are UNMOVED
    expect(cell).toContain('width: 28');
    expect(cell).toContain('fontSize: 15');
    // ⚠ combat still has both, which is the half that was explicitly excluded
    const coat = styleBlock(INPUTBOX, 'coatGlyph', 'quickStrikeText');
    expect(coat).toContain('textShadowRadius: 3');
    expect(coat).toContain("backgroundColor: '#0d0b09'");
  });

  test('the README records the disagreement for whoever designs the container', () => {
    const readme = read('assets', 'damage', 'README.md');
    expect(readme).toContain('not a 1:1 proxy');
    expect(readme).toContain('12pt');
    expect(readme).toContain('15pt');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1763-icons-on-trial'");
  });
});
