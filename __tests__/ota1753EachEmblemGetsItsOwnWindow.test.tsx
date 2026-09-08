/**
 * OTA-1753 — EACH EMBLEM GETS ITS OWN WINDOW.
 *
 * The owner, three passes ago: *"we might need a custom position for each emblem
 * since they are all not symetrical."* Every pass since has moved ONE window and
 * hoped; this measures the artwork instead.
 *
 * ⚠⚠⚠ AND THE MEASUREMENT SAYS SOMETHING SYSTEMATIC, WHICH IS THE FINDING.
 * Every one of the nine crests carries its subject ABOVE the middle of its own
 * file — focusY 0.339 to 0.466, mean 0.40, not one at 0.5. A window on the
 * vertical CENTRE of these files therefore shows the LOWER part of every emblem:
 * the ground and the plinth, never the device. That is not per-faction noise to
 * be tuned away, it is how the set was drawn, and it is the reason the roster
 * fragments read as rubble through four passes of moving the box.
 *
 * So the suite grades three things: that the art data is real and complete, that
 * the conversion into a nudge is sound at both boxes, and that the two card
 * states now wear one treatment instead of two.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { crestArt, crestFactionIds, factionCrest } from '../app/engine/factionCrests';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const TITLE = read('app', 'screens', 'TitleScreen.tsx');
const CRESTS = read('app', 'engine', 'factionCrests.ts');

const styleBlock = (name: string) => {
  const one = new RegExp(`\\n  ${name}:\\s*\\{[^{}]*\\},`).exec(TITLE);
  if (one) return one[0];
  return new RegExp(`\\n  ${name}:\\s*\\{[\\s\\S]*?\\n  \\},`).exec(TITLE)?.[0] ?? '';
};
const num = (block: string, prop: string) => {
  const m = new RegExp(`${prop}:\\s*'?(-?\\d+(?:\\.\\d+)?)%?'?`).exec(block);
  return m ? Number(m[1]) : NaN;
};
const constant = (name: string) =>
  Number(new RegExp(`const ${name} = (-?\\d+(?:\\.\\d+)?)`).exec(TITLE)?.[1] ?? NaN);

/** The file's own dimensions, straight from the PNG header. */
function pngSize(f: string) {
  const b = readFileSync(join(ROOT, 'assets', 'crests', f));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// ═══ 1. THE ART DATA IS REAL, COMPLETE, AND SAYS WHAT IT CLAIMS ══════════════
describe('the measurement', () => {
  test('every faction with art has a focus, and nothing else does', () => {
    const ids = crestFactionIds();
    expect(ids).toHaveLength(9);
    for (const id of ids) expect(crestArt(id)).toBeDefined();
    // no orphan entries, and no guessing for a faction the game does not ship
    expect(crestArt('no_such_faction')).toBeUndefined();
    expect(crestArt(undefined)).toBeUndefined();
    expect(crestArt(null)).toBeUndefined();
  });

  test('⚠⚠ each recorded aspect matches the actual PNG', () => {
    /* The one number in the table that can be checked against ground truth
     * without re-running the harness — so if art is replaced and the table is
     * not updated, this says so rather than the layout silently drifting. */
    const files = readdirSync(join(ROOT, 'assets', 'crests')).filter((f) => f.endsWith('.png'));
    expect(files).toHaveLength(9);
    for (const f of files) {
      const id = f.replace('.png', '');
      const { w, h } = pngSize(f);
      expect(crestArt(id)!.aspect).toBeCloseTo(h / w, 2);
    }
  });

  test('⚠⚠⚠ ALL NINE sit above centre — the finding, pinned as a fact', () => {
    const ys = crestFactionIds().map((id) => crestArt(id)!.focusY);
    for (const y of ys) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(0.5);          // above the middle, every one
    }
    // and the spread is real, which is why one shared offset would not do
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1);
  });

  test('⚠ the harness that produced these numbers is COMMITTED, not just named', () => {
    /* A measurement whose harness lives in an untracked scratchpad cannot be
     * redone, which makes the table unmaintainable the moment art changes. So
     * the harness ships, the source points at it, and this checks both. */
    expect(CRESTS).toContain('scripts/measure-crest-focus.html');
    expect(CRESTS.toLowerCase()).toContain('luminance');
    const harness = read('scripts', 'measure-crest-focus.html');
    expect(harness).toContain('focusY');
    expect(harness).toContain('aspect');
    for (const id of crestFactionIds()) expect(harness).toContain(`${id}.png`);
  });
});

// ═══ 2. THE CONVERSION FROM ART FACT TO LAYOUT NUDGE ═════════════════════════
describe('the nudge', () => {
  /** Mirrors the shipped formula, reading its constants from the source. */
  const nudge = (k: number, id: string) => {
    const a = crestArt(id)!;
    return Math.round(k * (0.5 - a.focusY) * a.aspect);
  };

  test('⚠⚠ a focus above centre produces a DOWNWARD nudge — the whole point', () => {
    // A positive nudge means less inset above and more below, which moves the
    // image down and brings the subject into the window. Every crest qualifies.
    const k = constant('TILE_NUDGE_K');
    expect(k).toBeGreaterThan(0);
    for (const id of crestFactionIds()) expect(nudge(k, id)).toBeGreaterThan(0);
  });

  test('the nudges differ per faction, or the table would be pointless', () => {
    const k = constant('TILE_NUDGE_K');
    const all = crestFactionIds().map((id) => nudge(k, id));
    expect(new Set(all).size).toBeGreaterThanOrEqual(7);
    // the extremes are far apart: the flattest crest barely moves, the highest
    // one moves nearly half the tile's height
    expect(Math.max(...all) - Math.min(...all)).toBeGreaterThan(25);
  });

  test('⚠⚠⚠ the nudge never uncovers the window', () => {
    /* The failure this would cause is visible and ugly: shift too far and the
     * emblem's edge walks into the tile, leaving a hard horizontal line. The
     * image is ~3x the tile's height and the box is 6x, so there is slack — but
     * it has to be checked against the LARGEST nudge, not assumed. */
    const k = constant('TILE_NUDGE_K');
    const spread = constant('TILE_SPREAD');
    const tileW = 340; const tileH = 58;
    const boxW = (1 - num(styleBlock('dossierFieldCompact'), 'left') / 100
      - num(styleBlock('dossierFieldCompact'), 'right') / 100) * tileW;
    for (const id of crestFactionIds()) {
      const a = crestArt(id)!;
      const imgH = boxW * a.aspect;
      const d = nudge(k, id);
      const boxTop = -((spread - d) / 100) * tileH;
      const boxH = (1 + (2 * spread) / 100) * tileH;
      const imgTop = boxTop + (boxH - imgH) / 2;      // centred in its box
      expect(imgTop).toBeLessThanOrEqual(0);          // covers the tile's top
      expect(imgTop + imgH).toBeGreaterThanOrEqual(tileH); // ...and its bottom
    }
  });

  test('the device calibration is declared rather than hidden', () => {
    // Percentages of width and of height cannot be linked in RN, so the
    // conversion constant is the card's own shape. That is a real limitation and
    // the source says so instead of presenting the number as universal.
    expect(TITLE).toMatch(/K IS DEVICE-CALIBRATED/);
    expect(constant('OPEN_NUDGE_K')).toBeGreaterThan(0);
    expect(constant('OPEN_NUDGE_K')).toBeLessThan(constant('TILE_NUDGE_K'));
  });
});

// ═══ 3. ONE TREATMENT, BOTH STATES ═══════════════════════════════════════════
describe('the two card states stopped being two treatments', () => {
  test('⚠⚠ both boxes now fit by WIDTH, for every crest', () => {
    /* This is what makes the nudge meaningful. At the expanded card's old -18%
     * spread, `contain` fit the tall crests by HEIGHT and the square ones by
     * WIDTH — so the emblem's drawn size changed with the faction and there was
     * no stable height to shift. Both boxes are now deep enough that width
     * always runs out first. */
    const cases: Array<[string, number]> = [['dossierFieldCompact', 58], ['dossierField', 200]];
    for (const [name, cardH] of cases) {
      const b = styleBlock(name);
      const boxW = (1 - num(b, 'left') / 100 - num(b, 'right') / 100) * 340;
      const boxH = (1 + Math.abs(num(b, 'top')) / 100 + Math.abs(num(b, 'bottom')) / 100) * cardH;
      for (const id of crestFactionIds()) {
        expect(boxH / boxW).toBeGreaterThanOrEqual(crestArt(id)!.aspect);
      }
    }
  });

  test('they share an alpha family instead of reading as different effects', () => {
    const tile = num(styleBlock('dossierFieldCompact'), 'opacity');
    const open = num(styleBlock('dossierField'), 'opacity');
    // ⚠ Not identical — a record is four times a tile's height, so the same
    // alpha covers far more area. Close enough to read as one treatment.
    expect(Math.abs(tile - open)).toBeLessThanOrEqual(0.06);
    expect(open).toBeGreaterThan(0.13);   // was 0.13, and read as absent
  });

  test('both call sites pass the faction, so both get their own window', () => {
    expect((TITLE.match(/<DossierField crest=\{crest\} factionId=/g) ?? []).length).toBe(2);
  });

  test('the styles are built ONCE at module load, not per row', () => {
    /* A roster is a FlatList and OTA-1739 fought to keep it quiet. Nine factions
     * x two states is eighteen objects, computed at import and looked up after.
     * The component must do a lookup, never a computation. */
    const at = TITLE.indexOf('function DossierField(');
    const fn = TITLE.slice(at, TITLE.indexOf('\nexport function TitleScreen', at));
    expect(fn).toContain('FIELD_STYLES[factionId]');
    expect(fn).not.toMatch(/fieldNudge\(|crestArt\(|Math\./);
    expect(TITLE).toMatch(/for \(const id of crestFactionIds\(\)\) \{/);
  });

  test('a faction with no art borrows nobody else\'s offsets', () => {
    expect(crestArt('no_such_faction')).toBeUndefined();
    expect(factionCrest('no_such_faction')).toBeUndefined();
    // the lookup is keyed, so an unknown id simply finds nothing
    expect(TITLE).toContain('const tuned = factionId ? FIELD_STYLES[factionId] : undefined;');
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1753-each-emblem-gets-its-own-window'");
  });
});
