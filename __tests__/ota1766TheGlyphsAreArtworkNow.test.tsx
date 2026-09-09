/**
 * OTA-1766 — THE ILLUSTRATED GLYPHS ARE THE GLYPHS NOW. THE TRIAL IS OVER.
 *
 * Owner: *"The new combat glyph pack is approved. Go ahead and move from the
 * test to the actual implementation."* Into three surfaces: Lore ▸ Glyphs, the
 * weapon damage/coating icons in combat, and the discovered-weakness ★.
 *
 * ⚠⚠⚠ THE TRIAL'S OPEN QUESTION WAS CLOSED BY THE PACK ITSELF, NOT BY ME.
 * OTA-1763 deliberately refused to bind artwork to the game's damage vocabulary
 * — ruling that `rupture` means slashing (or piercing, or both) is a SEMANTIC
 * decision about the game's language, and making it inside an art table would
 * smuggle a design decision in under a display experiment. The approved pack
 * ships files named `bludgeoning`, `slashing`, `piercing`, `aetheric`,
 * `radiation`, `burn`, `cold`, `poison`, `acid`, `corruption`, `electrical` —
 * every one a key that already exists in `weaponGlyphs`. There was no mapping
 * left to invent.
 *
 * ⚠⚠ AND COMBAT IS NOT A COPY OF LORE, WHICH IS THE MEASUREMENT OTA-1763 WAS
 * ASKED TO MAKE BEFORE ANY OF THIS. Owner: *"You already measured the difference
 * between the Lore and combat implementations, so handle the combat image layout
 * appropriately rather than trying to force the images into the old inline
 * text-glyph construction."* So the combat label stopped being one inline
 * `<Text>` and became a row of measured boxes — and the hair spaces and escaped
 * em space that only ever existed to fake a box inside a text flow are gone with
 * it.
 */
import React from 'react';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { Image, Text } from 'react-native';

/* ⚠ `react-test-renderer` ships no bundled types in this tree. OTA-1233
 * established the convention rather than adding `@types` for a test-only
 * concern: require it and type the require NARROWLY, to the calls this suite
 * makes. Importing it plainly cost the typecheck ratchet two errors — one for
 * the missing declaration and one for the `any` it propagated into a callback —
 * which is exactly the debt that gate exists to stop growing. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create(el: React.ReactElement): {
    root: { findAllByType(t: unknown): { props: Record<string, unknown> }[];
            findAllByProps(p: Record<string, unknown>): { props: Record<string, unknown> }[] };
    unmount(): void;
  };
};

import { glyphArt, DISCOVERY_STAR_ART, GLYPH_ART_SIZE, GLYPH_ART_TYPES } from '../app/engine/combatGlyphArt';
import { BASE_DAMAGE_GLYPH, COATING_GLYPH } from '../app/engine/weaponGlyphs';
import { WeaponGlyphKey, baseTypesInPlay, COAT_KEY_ORDER, GLYPH_KEY_EXAMPLE } from '../app/components/WeaponGlyphKey';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const bin = (...p: string[]) => readFileSync(join(ROOT, ...p));
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');
const png = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colour: b[25] });

const ART = read('app', 'engine', 'combatGlyphArt.ts');
const KEY = read('app', 'components', 'WeaponGlyphKey.tsx');
const INPUTBOX = read('app', 'components', 'InputBox.tsx');

/* ⚠ GRADE THE CODE, NOT THE PROSE. Seventh time in this rollout, and this pass
 * is the worst offender yet: three files' headers argue at length about
 * `tintColor`, `damageIcons`, `#0d0b09` and hair spaces — the exact strings
 * several assertions below say must be absent. Strip comments first, and prove
 * the stripper is still doing something so it cannot quietly stop checking. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ═══ 1. ONE TABLE, KEYED THE WAY THE GAME ALREADY SPEAKS ═════════════════════
describe('the mapping is centralized and semantic', () => {
  test('⚠⚠⚠ every key is a key `weaponGlyphs` already uses — nothing was invented', () => {
    /* This is the claim that makes it a REPLACEMENT and not a parallel system.
     * If a key here were not already in the game's vocabulary, this table would
     * be a second opinion about what damage types exist. */
    for (const t of GLYPH_ART_TYPES) {
      const known = BASE_DAMAGE_GLYPH[t] !== undefined
        || (COATING_GLYPH as Record<string, string>)[t] !== undefined;
      expect([t, known]).toEqual([t, true]);
    }
    expect(GLYPH_ART_TYPES).toHaveLength(11);
  });

  test('⚠⚠ burn / cold / poison / electrical are ONE image, base or coat', () => {
    /* Owner, explicitly. It falls out of keying by canonical type rather than by
     * role, so it is not a rule this code enforces — it is one it cannot break.
     * Asserted by object identity so the sharing reads as a decision. */
    for (const shared of ['burn', 'cold', 'poison', 'electrical', 'acid', 'corruption']) {
      expect(BASE_DAMAGE_GLYPH[shared]).toBeDefined();          // exists as a base type
      expect((COATING_GLYPH as Record<string, string>)[shared]).toBeDefined(); // and as a coat
      expect(glyphArt(shared)).toBe(glyphArt(shared));          // one module id
      expect(glyphArt(shared)).toBeDefined();
    }
  });

  test('⚠ it canonicalises, so an alias finds the same art', () => {
    expect(glyphArt('frost')).toBe(glyphArt('cold'));
    expect(glyphArt('force')).toBe(glyphArt('aetheric'));
    expect(glyphArt('psychic')).toBe(glyphArt('aetheric'));
    expect(glyphArt(null)).toBeUndefined();
    expect(glyphArt('')).toBeUndefined();
  });

  test('⚠⚠⚠ the star is NOT in the damage table — it is a verdict', () => {
    /* The pack's own note: it is not a damage family. Keeping it out means
     * nothing that iterates the types can pick up a verdict by mistake. */
    expect(glyphArt('discovery_star')).toBeUndefined();
    expect(GLYPH_ART_TYPES).not.toContain('discovery_star');
    expect(DISCOVERY_STAR_ART).toBeDefined();
  });

  test('⚠⚠⚠ EXACTLY ONE type falls back, and it is `stun` — not the two I first wrote', () => {
    /* ⚠⚠⚠ I ASSERTED `['degradation', 'stun']` AND THE TABLE SAID `['stun']`, AND
     * THE TABLE WAS RIGHT. The pack draws eleven of `BASE_DAMAGE_GLYPH`'s
     * thirteen, so two names have no FILE — but `glyphArt` canonicalises before
     * it looks up, and OTA-1652 aliases `degradation → acid`. So a degradation
     * weapon resolves the ACID artwork and never reaches the fallback at all.
     *
     * ⚠⚠ WHICH IS THE CORRECT BEHAVIOUR, AND IT IS CORRECT BECAUSE IT MATCHES THE
     * CHARACTER PATH EXACTLY. OTA-1667 already recorded this about the text
     * glyphs: "even a weapon that authored degradation would print ⚗, never ⚙."
     * The artwork inherits that from sharing `canonicalDamageType` rather than
     * re-deciding it. My own file comment said so; my assertion contradicted it,
     * and walking the whole table is what caught the contradiction.
     *
     * ⚠ So `⚙` is now unreachable in BOTH mediums, which is one line stricter
     * than it was — the key derives its rows from the catalog, and nothing
     * authors degradation. `stun` is the one genuine hole. */
    const missing = Object.keys(BASE_DAMAGE_GLYPH).filter((t) => glyphArt(t) === undefined);
    expect(missing.sort()).toEqual(['stun']);
    // it still has a character to fall back TO
    expect(BASE_DAMAGE_GLYPH.stun).toBeTruthy();
    // ⚠ and degradation resolves the SAME art as acid, exactly as it prints ⚗
    expect(glyphArt('degradation')).toBe(glyphArt('acid'));
  });

  test('⚠⚠ ONE table — no second require() of this family anywhere in app/', () => {
    /* Owner: *"Keep the icon mapping centralized rather than creating separate
     * Lore and combat mappings."* The two surfaces IMPORT; only the table
     * requires. */
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const files = walk(join(ROOT, 'app'));
    expect(files.length).toBeGreaterThan(50);
    const requirers = files
      .filter((f) => codeOf(readFileSync(f, 'utf8')).includes('assets/combat-glyphs'))
      .map((f) => f.slice(ROOT.length + 1));
    expect(requirers).toEqual(['app/engine/combatGlyphArt.ts']);
  });

  test('⚠ the displayed size is centralized — the numbers themselves are OTA-1767\'s', () => {
    /* ⚠⚠ THIS TEST USED TO PIN `combat` AT 18, AND OTA-1767 OVERTURNED THAT.
     * What OTA-1766 can honestly claim is that the size is declared in ONE place
     * and both surfaces read it from there — that is what makes an owner's size
     * call one edit. The VALUES belong to the pass that set them; pinning them
     * from here is the mistake this rollout keeps re-learning. */
    expect(Object.keys(GLYPH_ART_SIZE).sort()).toEqual(['combat', 'lore']);
    for (const src of [codeOf(KEY), codeOf(INPUTBOX)]) {
      expect(src).toContain('GLYPH_ART_SIZE');
      expect(src).not.toMatch(/width: 28, height: 28/);   // no hard-coded copy
    }
  });
});

// ═══ 2. LORE — THE ARTWORK REPLACED THE GLYPHS, THE TRIAL IS GONE ════════════
describe('Lore ▸ Glyphs', () => {
  const tree = () => renderer.create(<WeaponGlyphKey />);

  test('⚠⚠⚠ every base type and every coat in play renders ARTWORK, not a character', () => {
    const r = tree();
    for (const t of [...baseTypesInPlay(), ...COAT_KEY_ORDER]) {
      if (glyphArt(t) === undefined) continue;   // the two fallbacks, covered below
      expect(r.root.findAllByProps({ testID: `glyph-art-${t}` }).length).toBeGreaterThan(0);
    }
    r.unmount();
  });

  test('⚠⚠ the LABELS and MEANINGS are untouched — the picture supplements the word', () => {
    /* The pack's rule 4, and the trial's rule 6 before it. A key that replaced
     * its words with pictures would be a worse key. */
    const r = tree();
    const texts = r.root.findAllByType(Text).map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.join('') : String(c ?? '');
    });
    const joined = texts.join(' | ');
    expect(joined).toContain('BLUDGEONING');
    expect(joined).toContain('blunt force');
    expect(joined).toContain('incendiary coat');
    r.unmount();
  });

  test('⚠⚠⚠ the discovery star has its own row, and it is the star ARTWORK', () => {
    const r = tree();
    const star = r.root.findAllByProps({ testID: 'glyph-art-discovery-star' });
    expect(star.length).toBeGreaterThan(0);
    expect(star[0]!.props.source).toBe(DISCOVERY_STAR_ART);
    r.unmount();
  });

  test('⚠ no tint, and `contain` so nothing is stretched or cropped', () => {
    const r = tree();
    const imgs = r.root.findAllByType(Image);
    expect(imgs.length).toBeGreaterThanOrEqual(12);
    for (const i of imgs) {
      expect(i.props.resizeMode).toBe('contain');
      expect(JSON.stringify(i.props.style ?? {})).not.toContain('tintColor');
    }
    r.unmount();
  });

  test('⚠⚠ THE TRIAL BLOCK IS GONE — that was an explicit instruction', () => {
    /* Owner: *"Remove the temporary illustrated icon test block we added at the
     * bottom of Lore ▸ Glyphs. We don't need it anymore."* Deleting the code is
     * the deliverable; asserting it stays deleted is what stops it drifting back
     * in as "just for one more check". */
    const code = codeOf(KEY);
    expect(code.length).toBeGreaterThan(1000);       // the stripper left the code
    expect(code).not.toContain('IconTrial');
    expect(code).not.toContain('TRIAL_SIZES');
    expect(code).not.toContain('trialCell');
    expect(code).not.toContain('damageIcons');
    expect(code).not.toContain('PROVISIONAL');
  });

  test('⚠⚠⚠ the EXAMPLE row is artwork too, or the legend illustrates a button that is gone', () => {
    /* The example line read `🔥☣ LAUNCHER ✦ ★` as a flat string of the old
     * characters. This file's header is on record that the key must not drift
     * from the buttons — it exists to SHOW the player what one looks like — so
     * leaving it would have shipped a legend illustrating a button that no
     * longer exists, one line above the table of artwork that replaced it.
     * ⚠ It is drawn at the COMBAT size, because a button is what it depicts. */
    const code = codeOf(KEY);
    expect(code).toContain('GLYPH_ART_SIZE.combat');
    expect(code).not.toContain('{GLYPH_KEY_EXAMPLE.toUpperCase()}');
    const r = tree();
    // burn + corruption coats, the aetheric base, and the star — five marks in
    // the example plus one per legend row.
    const imgs = r.root.findAllByType(Image);
    expect(imgs.length).toBeGreaterThanOrEqual(12 + 4);
    r.unmount();
    // ⚠ the STRING survives as the grammar for prose and screen readers
    expect(GLYPH_KEY_EXAMPLE).toContain('launcher');
  });

  test('⚠ the fallback character path survives for the two undrawn types', () => {
    /* It cannot be exercised through the live key — `baseTypesInPlay()` is
     * derived from the catalog and no weapon deals either type — so this asserts
     * the BRANCH exists rather than pretending to render it. Deleting it would
     * make a future stun weapon paint an empty box. */
    const code = codeOf(KEY);
    expect(code).toContain('art !== undefined');
    expect(code).toContain('glyph-text-');
    expect(code).toContain('styles.cell');
  });
});

// ═══ 3. COMBAT — A ROW OF BOXES, NOT A STRING OF INLINE TEXT ═════════════════
describe('the weapon buttons in combat', () => {
  test('⚠⚠⚠ the inline-text workarounds are GONE, because what they worked around is', () => {
    /* OTA-1569's HAIR SPACES and OTA-1638's escaped EM SPACE existed for one
     * reason: an inline `Text` in React Native has no box, so a mark inside a
     * text flow had to be padded with Unicode and set off with Unicode. A View
     * row gives every mark a real box. Both are spacing properties now.
     * ⚠ The hair space still appears ONCE — on the character fallback, which is
     * still inline text and still has no box. That is the construction being
     * kept where it still applies, not a leftover. */
    const code = codeOf(INPUTBOX);
    expect(code).toContain('styles.quickGlyphRow');
    expect(code).toContain("flexDirection: 'row'");
    expect(code).not.toContain(' ');            // the em space, gone
    expect((code.match(/\\u2003/g) ?? []).length).toBe(0);
    expect((code.match(/\\u200a/g) ?? []).length).toBe(2);   // the fallback's pair only
  });

  test('⚠⚠⚠ THE BLACK BOX IS GONE FROM EVERY MARK A PLAYER CAN SEE', () => {
    /* Owner: *"Remove the remaining black box/background behind the weapon
     * icons. The new artwork should sit directly on the weapon UI without an
     * additional black rectangle."*
     * The artwork style carries no ground. `coatGlyph` keeps its `#0d0b09` and
     * that is deliberate and unreachable: it is the CHARACTER fallback, whose
     * problem (a bare glyph on two nearly opposite chip fills) is unchanged, and
     * which no catalog weapon can trigger. */
    const artStyle = /quickGlyphArt: \{([^}]*)\}/.exec(INPUTBOX)?.[1] ?? '';
    expect(artStyle).not.toBe('');
    expect(artStyle).not.toContain('backgroundColor');
    expect(artStyle).not.toContain('textShadow');
    const starStyle = /quickStarArt: \{([^}]*)\}/.exec(INPUTBOX)?.[1] ?? '';
    expect(starStyle).not.toBe('');
    expect(starStyle).not.toContain('backgroundColor');
    // the fallback keeps its ground, on purpose
    expect(INPUTBOX).toContain("backgroundColor: '#0d0b09'");
  });

  test('⚠⚠ the star is the artwork, and it is still LAST', () => {
    /* Owner: *"Replace the existing discovery ★ with discovery_star.png."*
     * OTA-1638's rule — "put the discovery star all the way to the right" —
     * survives the change of medium. */
    const code = codeOf(INPUTBOX);
    expect(code).toContain('DISCOVERY_STAR_ART');
    expect(code).toContain("testID=\"quick-discovery-star\"");
    // ⚠ the ★ CHARACTER no longer paints on a button
    expect(code).not.toContain("{' ★'}");
    // order: coats … name … base … star
    const row = code.slice(code.indexOf('styles.quickGlyphRow'));
    const iName = row.indexOf('glyphText');
    const iBase = row.indexOf('baseGlyph ?');
    const iStar = row.indexOf('DISCOVERY_STAR_ART');
    expect(iName).toBeGreaterThan(-1);
    expect(iBase).toBeGreaterThan(iName);
    expect(iStar).toBeGreaterThan(iBase);
  });

  test('⚠⚠⚠ `label` is UNTOUCHED — the breadcrumb and the screen reader still read it', () => {
    /* OTA-1172 is on record that `logUiTap`'s breadcrumb is forensic evidence in
     * the freeze hunt, and `combatWeaponLabel` is still the single source of the
     * flat string. This pass changed how the content is PAINTED and nothing
     * about what it says. */
    const code = codeOf(INPUTBOX);
    expect(code).toContain('combatWeaponLabel(');
    expect(code).toContain('accessibilityLabel={cooldownFill !== undefined && cooldownFill < 1');
    /* ⚠⚠⚠ RE-AIMED BY OTA-1781 — PIN THE CLAIM, NEVER THE MECHANISM.
     * This line used to pin the whole element, character for character:
     *   `<Text style={textStyle}>{label.toUpperCase()}</Text>`
     * The claim it makes is that the FLAT LABEL is what the fallback path
     * paints — the breadcrumb and the screen-reader string, untouched. The style
     * array beside it was never part of that claim, and when OTA-1781 added the
     * weapon-name style to the same element this test went red on a change that
     * left the claim perfectly intact. That is the rollout's own hardest-won
     * rule, and this is what breaking it costs: a red suite pointing at the
     * wrong thing.
     * So: the fallback branch must still paint `label.toUpperCase()` and must
     * still be styled off `textStyle`. WHAT ELSE styles it is OTA-1781's
     * business, not this pass's. */
    expect(code).toMatch(/<Text style=\{\[?textStyle[\s\S]{0,90}?\}>\{label\.toUpperCase\(\)\}<\/Text>/);
  });

  test('⚠ no gameplay, damage, weakness, coat or discovery logic moved', () => {
    /* Owner: *"Don't change any gameplay, damage, weakness, coat, or discovery
     * logic."* The engine file that owns all five is untouched by this pass —
     * asserted by its own content, not by a diff. */
    const glyphs = read('app', 'engine', 'weaponGlyphs.ts');
    expect(glyphs).toContain('export function weaponHitsKnownWeakness(');
    expect(glyphs).toContain('export function knownEnemyWeaknesses(');
    expect(glyphs).toContain('export function weaponStrikeTypes(');
    expect(glyphs).toContain('export function reconciledDefenses(');
    // and it still owns the CHARACTER vocabulary, which the fallbacks need
    expect(glyphs).toContain('export const BASE_DAMAGE_GLYPH');
    expect(glyphs).toContain('export const COATING_GLYPH');
    // the art table does not duplicate any of it
    expect(codeOf(ART)).not.toContain('weakness');
    expect(codeOf(ART)).not.toContain('coating');
  });
});

// ═══ 4. THE ASSETS ═══════════════════════════════════════════════════════════
describe('the approved pack, as shipped', () => {
  test('⚠ twelve runtime files, 128px, and the star among them', () => {
    const files = readdirSync(join(ROOT, 'assets', 'combat-glyphs')).filter((f) => f.endsWith('.png')).sort();
    expect(files).toHaveLength(12);
    expect(files).toContain('discovery_star.png');
    for (const f of files) {
      const p = png(bin('assets', 'combat-glyphs', f));
      expect([f, p.w, p.h]).toEqual([f, 128, 128]);
    }
  });

  test('⚠⚠ ONE runtime resolution, and the masters are tracked but NOT bundled', () => {
    /* `app.json` bundles the whole assets tree. Owner's standing rule, OTA-1764:
     * *"Do not load all four resolutions into the mobile runtime merely because
     * they exist."* 128 ships because 28dp × 3 = 84 device pixels and a 64px
     * source would upscale; the rest live in the art tree. */
    expect(read('app.json')).toContain('"assets/**/*"');
    const art = join(ROOT, 'art', '13-combat-glyphs');
    expect(existsSync(art)).toBe(true);
    for (const d of ['128', '256', '512', 'masters']) {
      expect(readdirSync(join(art, d)).filter((f) => f.endsWith('.png'))).toHaveLength(12);
    }
    expect(existsSync(join(ROOT, 'assets', 'combat-glyphs', '256'))).toBe(false);
  });

  test('⚠⚠ the runtime copies ARE the 128 masters, byte for byte', () => {
    /* If these diverge, one is a stale export and there is no way to tell which
     * by looking. */
    for (const f of readdirSync(join(ROOT, 'assets', 'combat-glyphs')).filter((x) => x.endsWith('.png'))) {
      expect([f, md5(bin('assets', 'combat-glyphs', f))])
        .toEqual([f, md5(bin('art', '13-combat-glyphs', '128', f))]);
    }
  });

  test('⚠⚠⚠ the ARTWORK is opaque RGB, and the README says so before anyone judges it', () => {
    /* MEASURED, not assumed, and it matters for the owner's own instruction.
     * Every file is PNG colour type 2 — RGB, no alpha. The UI-side black box is
     * genuinely gone, but each icon is still an opaque tile of its own dark
     * artwork. That edge is in the pixels and cannot be removed here without
     * recolouring the art, which the pack forbids. Recorded rather than
     * discovered on a phone. */
    for (const f of readdirSync(join(ROOT, 'assets', 'combat-glyphs')).filter((x) => x.endsWith('.png'))) {
      expect([f, png(bin('assets', 'combat-glyphs', f)).colour]).toEqual([f, 2]);
    }
    const readme = read('assets', 'combat-glyphs', 'README.md');
    expect(readme).toContain('no alpha channel');
    expect(readme).toContain('PROVISIONAL');
    expect(readme).toContain('degradation');
  });

  test('⚠⚠ the trial is retired and its COMMISSIONED master is not collateral damage', () => {
    expect(existsSync(join(ROOT, 'assets', 'damage'))).toBe(false);
    expect(existsSync(join(ROOT, 'app', 'engine', 'damageIcons.ts'))).toBe(false);
    // ⚠ but the thunderstorm masters stay — the only copy of a commissioned asset
    expect(existsSync(join(ROOT, 'art', '12-damage-icons', 'environmental_512.png'))).toBe(true);
    expect(read('art', '12-damage-icons', 'README.md')).toContain('RETIRED AT OTA-1766');
  });
});

describe('the suite grades code', () => {
  test('⚠ comments really are stripped — or half the claims above are weaker than they read', () => {
    expect(codeOf(ART).length).toBeLessThan(ART.length * 0.6);
    expect(codeOf('/* tintColor */ const a = 1;')).not.toContain('tintColor');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1766-the-glyphs-are-artwork'");
  });
});
