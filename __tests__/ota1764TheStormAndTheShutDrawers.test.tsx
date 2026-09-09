/**
 * OTA-1764 — A NEW STORM, AND TWO DRAWERS THAT NOW START SHUT.
 *
 * Two unrelated owner instructions, both small, both arriving together.
 *
 * 1. *"workings to learn and reinforce your gear should start collapsed like the
 *    rest of the categories when it shops and vendors."*
 * 2. The Environmental icon is replaced. *"it visually reads as a suitcase/case
 *    rather than an environmental hazard."* — which is the observation this
 *    trial reported about `L544` on its first render, now acted on by the owner.
 *
 * ⚠⚠ THE SECOND ONE IS THE ARCHITECTURE BEING TESTED, NOT JUST AN ASSET SWAP.
 * The owner's instruction ended: *"So if the architecture is correct, this should
 * require no UI behavior change."* It required none — `damageIcons.ts` is not
 * touched, the semantic key is unchanged, and the only edit under `app/` for the
 * icon half of this pass is zero lines. A test asserts exactly that.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const bin = (...p: string[]) => readFileSync(join(ROOT, ...p));
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');
const VENDOR = read('app', 'screens', 'VendorScreen.tsx');
const ICONS = read('app', 'engine', 'damageIcons.ts');

const png = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colour: b[25] });

// ═══ 1. THE TWO DRAWERS ══════════════════════════════════════════════════════
describe('the counter opens with every drawer shut', () => {
  test('⚠⚠⚠ every section default agrees — no section is the odd one out', () => {
    /* This is the claim, and it is stronger than "the two changed ones are now
     * true": the POINT is that the counter has one rule. If a seventh section is
     * ever added open-by-default, this fails. */
    const defaults = [...VENDOR.matchAll(/collapsedSections\[secKey\] \?\? (true|false)/g)].map((m) => m[1]);
    /* FOUR: the BUY tab's wares, WORKINGS TO LEARN, REINFORCE YOUR GEAR, and
     * the SELL tab's categories. I first wrote three and forgot SELL — which is
     * the argument for counting them rather than listing the ones I changed. */
    expect(defaults.length).toBe(4);
    expect(new Set(defaults)).toEqual(new Set(['true']));
  });

  test('⚠⚠ the TOGGLES default the same way, or the first tap goes backwards', () => {
    /* A header whose render says "collapsed unless told otherwise" and whose
     * onPress says `!(s[key] ?? false)` writes `true` on the first tap — the
     * section is already shut, and tapping it shuts it again. It looks like a
     * dead control. Both halves have to read the same default. */
    const toggles = [...VENDOR.matchAll(/\[secKey\]: !\(s2?\[secKey\] \?\? (true|false)\)/g)].map((m) => m[1]);
    expect(toggles.length).toBeGreaterThanOrEqual(2);
    expect(new Set(toggles)).toEqual(new Set(['true']));
  });

  test('⚠ the overridden reasoning is recorded, not deleted', () => {
    /* `?? false` carried the note "open by default — this is the discoverable
     * bit". That was a real intention and it is being overruled, so the override
     * says why rather than leaving a later reader to assume it was a typo. */
    expect(VENDOR).toContain('COLLAPSED BY DEFAULT, LIKE EVERY OTHER SECTION');
    expect(VENDOR).toContain('the discoverable bit');
    expect(VENDOR).not.toMatch(/\?\? false; \/\/ open by default/);
  });

  test('both sections still have a header that can open them, and a count', () => {
    expect(VENDOR).toContain('WORKINGS TO LEARN');
    expect(VENDOR).toContain('REINFORCE YOUR GEAR');
    expect(VENDOR).toContain('{recipeOffers.length}');
    expect(VENDOR).toContain('{reinforceRows.length}');
    // the chevron has to reflect the state, or a shut drawer looks open
    expect((VENDOR.match(/collapsed \? '\\u25b8' : '\\u25be'|collapsed \? '▸' : '▾'/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
  });
});

// ═══ 2. THE STORM ════════════════════════════════════════════════════════════
describe('Environmental is a thunderstorm now, and L544 is retired', () => {
  test('⚠⚠ the runtime binary is the new 64x64 RGBA', () => {
    const b = bin('assets', 'damage', 'environmental.png');
    const p = png(b);
    expect([p.w, p.h]).toEqual([64, 64]);
    expect(p.depth).toBe(8);
    expect(p.colour).toBe(6);
    // ⚠ and it is NOT the rejected one. That hash is the suitcase.
    expect(md5(b)).not.toBe('da0995136be5e25cb2d93abb9df35bf8');
  });

  test('⚠⚠⚠ NO CODE CHANGED FOR THE SWAP — that was the point of the test', () => {
    /* Owner: *"So if the architecture is correct, this should require no UI
     * behavior change."* The semantic filename did not change, so the art table
     * did not either. A correct art table means swapping a picture is swapping
     * a file. */
    expect(ICONS).toContain("environmental: require('../../assets/damage/environmental.png')");
    expect(ICONS).not.toContain('L544');
    expect(ICONS).not.toContain('thunderstorm');
    // no special-casing crept into the trial block for one icon
    const KEY = read('app', 'components', 'WeaponGlyphKey.tsx');
    expect(KEY).not.toContain('environmental');
  });

  test('⚠ the ten concepts and nine binaries are unchanged', () => {
    const pngs = readdirSync(join(ROOT, 'assets', 'damage')).filter((f) => f.endsWith('.png'));
    expect(pngs).toHaveLength(9);
    expect(pngs).toContain('environmental.png');
    expect(pngs).not.toContain('environmental_64.png');   // ⚠ masters do not ship
  });

  test('⚠⚠⚠ the masters are tracked but NOT bundled', () => {
    /* `app.json` bundles `assets/**` into the app. Four resolutions of one icon
     * sitting there would ship 750KB to a phone that only ever draws the 64.
     * They live in the art tree, which git keeps and the bundler never sees. */
    expect(read('app.json')).toContain('"assets/**/*"');
    const masters = join(ROOT, 'art', '12-damage-icons');
    expect(existsSync(masters)).toBe(true);
    const files = readdirSync(masters).filter((f) => f.endsWith('.png')).sort();
    expect(files).toEqual(['environmental_128.png', 'environmental_256.png',
      'environmental_512.png', 'environmental_64.png']);
    for (const [f, side] of [['environmental_64.png', 64], ['environmental_128.png', 128],
      ['environmental_256.png', 256], ['environmental_512.png', 512]] as const) {
      const p = png(bin('art', '12-damage-icons', f));
      expect([p.w, p.h]).toEqual([side, side]);
    }
  });

  test('⚠⚠ the runtime copy IS the 64 master, byte for byte', () => {
    /* If these ever diverge, one of them is a stale export and there is no way
     * to tell which by looking. */
    expect(md5(bin('assets', 'damage', 'environmental.png')))
      .toBe(md5(bin('art', '12-damage-icons', 'environmental_64.png')));
  });

  test('⚠ nothing requires a master, which is the whole reason they are separate', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    /* ⚠ `buildInfo.ts` is excluded: it is the stamp ledger, a wall of prose that
     * NAMES what each pass did, so of course it says "12-damage-icons". Grading
     * it here would be grading the write-up of the fix instead of the fix — the
     * same trap five checks in this rollout have already fallen into. */
    const code = walk(join(ROOT, 'app')).filter((f) => !f.endsWith('buildInfo.ts'));
    expect(code.length).toBeGreaterThan(50);
    for (const f of code) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain('12-damage-icons');
      expect(src).not.toMatch(/environmental_\d+\.png/);
    }
  });

  test('the provenance is recorded in both places, and L544 is named as retired', () => {
    const damage = read('assets', 'damage', 'README.md');
    expect(damage).toContain('Custom Tartaria Environmental Thunderstorm');
    expect(damage).toContain('RETIRED');
    expect(damage).toContain('PROVISIONAL');
    expect(damage).toContain('64 / 128 / 256 / 512');
    const art = read('art', '12-damage-icons', 'README.md');
    expect(art).toContain('Not bundled');
    expect(art).toContain('PROVISIONAL');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1764-storm-and-shut-drawers'");
  });
});
