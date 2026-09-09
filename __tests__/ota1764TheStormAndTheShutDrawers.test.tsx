/**
 * OTA-1764 — A NEW STORM, AND TWO DRAWERS THAT NOW START SHUT.
 *
 * ⚠⚠⚠ HALF OF THIS PASS WAS SUPERSEDED BY OTA-1766 AND THE SUITE SAYS SO RATHER
 * THAN BEING QUIETLY DELETED. The icon trial is retired: the owner approved a
 * pack keyed to the game's OWN damage vocabulary, and `assets/damage/` plus
 * `app/engine/damageIcons.ts` went with it. What survived is the part that
 * outlived the experiment — the thunderstorm was COMMISSIONED, its masters are
 * the only copy, and the second block below is the test that stops a future
 * cleanup pass mistaking a quiet folder for a dead one.
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

// ═══ 2. THE STORM, NOW RETIRED ══════════════════════════════════════════════
/* ⚠⚠⚠ OTA-1766 SUPERSEDED THIS HALF, AND THE ASSERTIONS FOLLOWED THE FACTS
 * RATHER THAN BEING DELETED WITH THEM.
 *
 * OTA-1764 swapped the Environmental icon and its proudest claim was that NO
 * CODE CHANGED — a correct art table means swapping a picture is swapping a
 * file. That claim was true and is now moot: the whole trial is retired. The
 * owner approved a different pack keyed to the game's OWN damage vocabulary,
 * `assets/damage/` and `app/engine/damageIcons.ts` are deleted, and there is no
 * "environmental" damage type for the thunderstorm to be.
 *
 * ⚠ SO WHAT IS STILL WORTH ASSERTING IS THE PART THAT OUTLIVED THE TRIAL: the
 * commissioned masters are KEPT, they are still unbundled, and nothing reads
 * them. Deleting an unused asset is tidy; deleting the only copy of a
 * commissioned one is destructive, and a quiet folder makes those look alike.
 * This is the test that stops a future cleanup pass getting it wrong. */
describe('the thunderstorm masters outlived the trial that commissioned them', () => {
  test('⚠⚠ the trial itself is GONE — table, runtime assets and trial block', () => {
    expect(existsSync(join(ROOT, 'app', 'engine', 'damageIcons.ts'))).toBe(false);
    expect(existsSync(join(ROOT, 'assets', 'damage'))).toBe(false);
    /* ⚠ GRADE THE CODE, NOT THE PROSE — the seventh time in this rollout, and
     * predictably: the file's header explains that `damageIcons` went with the
     * trial, which means it says the word. Strip comments first. */
    const codeOf = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const KEY = codeOf(read('app', 'components', 'WeaponGlyphKey.tsx'));
    expect(KEY.length).toBeGreaterThan(500);          // the stripper still leaves code
    expect(KEY).not.toContain('damageIcons');
    expect(KEY).not.toContain('IconTrial');
    expect(KEY).not.toContain('TRIAL_SIZES');
  });

  test('⚠⚠⚠ the COMMISSIONED masters are kept — they are the only copy', () => {
    /* OTA-1764 commissioned this after the owner rejected `L544` for reading as
     * a suitcase. The four files here are the whole of it. */
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
    // ⚠ and it is still NOT the rejected suitcase, which is why it was commissioned
    expect(md5(bin('art', '12-damage-icons', 'environmental_64.png')))
      .not.toBe('da0995136be5e25cb2d93abb9df35bf8');
  });

  test('⚠ the README says RETIRED, so nobody reads a dead folder as a live one', () => {
    const art = read('art', '12-damage-icons', 'README.md');
    expect(art).toContain('RETIRED AT OTA-1766');
    expect(art).toContain('Not bundled');
    expect(art).toContain('only copy');
  });

  test('⚠ still unbundled, and still required by nothing', () => {
    expect(read('app.json')).toContain('"assets/**/*"');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    /* ⚠ `buildInfo.ts` excluded: the stamp ledger NAMES what each pass did, so of
     * course it says "12-damage-icons". Grading it would be grading the write-up
     * instead of the fix — the trap this rollout has hit repeatedly. */
    const code = walk(join(ROOT, 'app')).filter((f) => !f.endsWith('buildInfo.ts'));
    expect(code.length).toBeGreaterThan(50);
    for (const f of code) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain('12-damage-icons');
      expect(src).not.toMatch(/environmental_\d+\.png/);
    }
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1764-storm-and-shut-drawers'");
  });
});
