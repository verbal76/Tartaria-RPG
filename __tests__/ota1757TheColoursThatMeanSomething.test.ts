/**
 * OTA-1757 — THE COLOURS THAT MEAN SOMETHING HAVE NAMES.
 *
 * Owner's amendment to the interface rollout:
 *   *"Rarity and other semantic colors are not accent colors. Gold remains
 *   reserved for the interface meaning already defined. HP, danger, rarity,
 *   positive/negative results, faction identity, etc. may retain meaningful
 *   semantic color."*
 *
 * ⚠⚠⚠ THAT RULING COULD NOT BE ENFORCED, AND THIS IS WHY. `#c9a86a` is doing
 * four jobs at once — the interface accent, the `Common` rarity, the `material`
 * category, and the middle band of the HP/stamina ramp. Three of the four are
 * semantic and are to be KEPT. So a ratchet on the bare hex is a number that
 * cannot legitimately fall, and a rule nobody can measure is a rule that lasts
 * until the next person forgets it.
 *
 * ⚠⚠ THIS PASS CHANGES NO PIXELS, AND THAT IS THE CLAIM MOST WORTH TESTING.
 * Every value is the hex the game already drew, moved from an inline literal to
 * a name. The owner has said the scale of this rollout is alarming; the first
 * step of it should be one nobody can see. So the suite below asserts identity
 * with the shipped values rather than approval of new ones.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  VITALITY, HP_CUTS, STAMINA_CUT, STANDING_JOIN, STANDING_WARY,
  vitalityColor, gaugeColor, standingColor,
  RARITY_COLORS, CATEGORY_COLORS, rarityHexColor, PALETTE_EXCEPTIONS,
} from '../app/ui/semanticColor';
import { RARITY_COLORS as RARITY_SOURCE } from '../app/components/InventoryCategorize';
import { T } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const CHAR = read('app', 'screens', 'CharacterScreen.tsx');
const GATE = read('scripts', 'check-gold.mjs');

// ═══ 1. NOTHING MOVED ════════════════════════════════════════════════════════
describe('the values are the ones the game already drew', () => {
  test('⚠⚠⚠ the vitality ramp is the exact three hexes CharacterScreen shipped', () => {
    // The line this replaced, verbatim from git history:
    //   hpPct > 0.5 ? '#9ec96a' : hpPct > 0.25 ? '#c9a86a' : '#e07a5f'
    expect(VITALITY.good).toBe('#9ec96a');
    expect(VITALITY.warn).toBe('#c9a86a');
    expect(VITALITY.bad).toBe('#e07a5f');
    expect(VITALITY.neutral).toBe('#cdbf99');
    expect(HP_CUTS).toEqual([0.5, 0.25]);
    expect(STAMINA_CUT).toBe(0.4);
  });

  test('vitalityColor reproduces the ternary it replaced, at and around every cut', () => {
    const old = (f: number) => (f > 0.5 ? '#9ec96a' : f > 0.25 ? '#c9a86a' : '#e07a5f');
    for (const f of [0, 0.01, 0.24, 0.25, 0.2500001, 0.26, 0.49, 0.5, 0.5000001, 0.51, 0.99, 1]) {
      expect(vitalityColor(f)).toBe(old(f));
    }
  });

  test('gaugeColor reproduces the stamina ternary it replaced', () => {
    const old = (f: number) => (f > 0.4 ? '#9ec96a' : '#c9a86a');
    for (const f of [0, 0.39, 0.4, 0.4000001, 0.41, 1]) expect(gaugeColor(f)).toBe(old(f));
  });

  test('standingColor reproduces the four-band ladder, including its neutral middle', () => {
    // standing >= JOIN ? green : >= 0 ? neutral : >= -10 ? gold : rust
    const JOIN = 25;
    const old = (s: number) => (s >= JOIN ? '#9ec96a' : s >= 0 ? '#cdbf99' : s >= -10 ? '#c9a86a' : '#e07a5f');
    for (const s of [-100, -11, -10, -1, 0, 1, 24, 25, 26, 100]) {
      expect(standingColor(s, JOIN)).toBe(old(s));
    }
    expect(STANDING_JOIN).toBe(25);
    expect(STANDING_WARY).toBe(-10);
  });

  test('⚠ a non-finite fraction cannot paint a gauge green', () => {
    // A NaN reaching a health bar must read as caution, never as healthy — the
    // failure direction matters more than the value.
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(vitalityColor(bad)).toBe(VITALITY.warn);
      expect(gaugeColor(bad)).toBe(VITALITY.warn);
    }
  });
});

// ═══ 2. ONE AUTHORITY PER VOCABULARY ═════════════════════════════════════════
describe('the module names colour; it never becomes a second source of it', () => {
  test('⚠⚠ rarity is RE-EXPORTED from the existing authority, not copied', () => {
    // OTA-1312 consolidated this palette after finding it in FOUR files. A copy
    // here would be the fifth, and identical values would hide it.
    expect(RARITY_COLORS).toBe(RARITY_SOURCE);
    expect(read('app', 'ui', 'semanticColor.ts')).not.toMatch(/Legendary:\s*'#/);
    expect(rarityHexColor('Rare')).toBe(RARITY_SOURCE.Rare);
    expect(rarityHexColor(undefined)).toBe(RARITY_SOURCE.Common);
  });

  test('the category vocabulary is complete and shared', () => {
    expect(Object.keys(CATEGORY_COLORS)).toHaveLength(12);
    expect(CATEGORY_COLORS.material.toLowerCase()).toBe(T.gold.toLowerCase());
  });

  test('⚠⚠ THE HEX HAS TWO SPELLINGS, and the gate has to know it', () => {
    /* The kit declares `#C9A86A`; every screen writes `#c9a86a`. Same colour,
     * 2 uppercase against 374 lowercase. Harmless to a renderer and invisible
     * to a case-SENSITIVE count — which would have missed the kit's own
     * declaration and quietly reported a smaller, wronger number. The gate's
     * case-insensitivity is therefore load-bearing, not incidental.
     * ⚠ Normalising the spelling is a legacy-hunt item, not this pass: it is a
     * whole-tree edit for zero visible gain, and this OTA changes no pixels. */
    expect(/'#c9a86a'\/gi/.test(GATE) || /GOLD = \/'#c9a86a'\/gi/.test(GATE)).toBe(true);
    expect(GATE).toMatch(/gi;/);
  });

  test('⚠⚠⚠ there is no THIRD colour authority — a dead rival was found and removed', () => {
    /* `app/theme/colors.ts` was still in the tree: an 18-line "aged artifact"
     * palette from arb76, declaring its own gold, ink, border and surface, with
     * a header promising "full rollout to the other screens is Phase 2". That
     * rollout never happened — VIS-1's kit superseded it — and NOTHING imported
     * it. A dead palette is worse than no palette: it reads as a live design
     * system to the next person who opens the folder.
     * Classified under the owner's legacy-hunt rule as DEAD, and deleted. */
    expect(() => read('app', 'theme', 'colors.ts')).toThrow();
  });

  test('⚠⚠⚠ the collision is REAL and stated, not tidied away', () => {
    /* This is the finding the whole OTA rests on: the brand accent and three
     * semantic values are the same hex. If a later pass "fixes" that by quietly
     * changing one of them, this fails — which is the point. Any change here is
     * an owner decision about what a colour MEANS. */
    const gold = T.gold.toLowerCase();
    expect(VITALITY.warn.toLowerCase()).toBe(gold);
    expect(String(RARITY_COLORS.Common).toLowerCase()).toBe(gold);
    expect(CATEGORY_COLORS.material.toLowerCase()).toBe(gold);
  });
});

// ═══ 3. THE SCREEN ACTUALLY USES THEM ════════════════════════════════════════
describe('CharacterScreen is routed, and its literals are gone', () => {
  test('the three ramps call the named helpers', () => {
    expect(CHAR).toMatch(/const hpColor = vitalityColor\(hpPct\)/);
    expect(CHAR).toMatch(/const stamColor = gaugeColor\(stamPct\)/);
    expect(CHAR).toMatch(/standingColor\(standing, JOIN_THRESHOLD\)/);
  });

  test('⚠ the engine keeps the threshold — the module did not steal it', () => {
    // JOIN_THRESHOLD lives in engine/factions and is PASSED IN. A colour module
    // that owned a gameplay threshold would be the wrong kind of authority.
    expect(CHAR).toMatch(/import \{ JOIN_THRESHOLD/);
    expect(read('app', 'ui', 'semanticColor.ts')).not.toContain('engine/factions');
  });

  test('the inline ramps are deleted, not merely bypassed', () => {
    expect(CHAR).not.toMatch(/hpPct > 0\.5 \?/);
    expect(CHAR).not.toMatch(/stamPct > 0\.4 \?/);
    expect(CHAR).not.toMatch(/standing >= JOIN_THRESHOLD \? '#/);
  });
});

// ═══ 4. THE GATE ═════════════════════════════════════════════════════════════
describe('the gold ratchet can measure the rule', () => {
  test('⚠⚠⚠ it grades CODE, not prose', () => {
    /* Its first run FAILED on `ui/semanticColor`, whose header explains the
     * problem by quoting the literal it is about. That is the third time in one
     * day a check graded the comment describing a fix rather than the fix. A
     * gate trippable by a sentence teaches people not to write the sentence. */
    expect(GATE).toContain('function stripComments');
    expect(GATE).toMatch(/stripComments\(fs\.readFileSync/);
  });

  test('⚠⚠ the trap that caused it is STILL THERE, and still harmless', () => {
    /* `ui/semanticColor`'s header quotes the literal it is about — that is the
     * sentence that failed the gate's first run. Keeping the sentence and
     * fixing the gate is the whole point, so this asserts the trap survives:
     * if someone later "fixes" this by rewording the comment, the stripper
     * stops being exercised by the tree and the next prose-shaped failure goes
     * unnoticed until it blocks somebody. */
    const mod = read('app', 'ui', 'semanticColor.ts');
    const commentGold = mod.split('\n').filter((l) => l.trim().startsWith('*') && /'#c9a86a'/i.test(l));
    expect(commentGold.length).toBeGreaterThan(0);
    // and the gate still passes over the tree — proven by check:gold in CI,
    // which cannot be true if the stripper ate real declarations.
    expect(GATE).toMatch(/BASELINE = \d+/);
  });

  test('the baseline is stated with its split, and has no headroom', () => {
    const m = /const BASELINE = (\d+);/.exec(GATE);
    expect(m).not.toBeNull();
    const baseline = Number(m![1]);
    expect(baseline).toBeGreaterThan(0);
    // the recorded split must add up to the baseline
    const split = /(\d+) interface · (\d+) semantic authorities · (\d+) kit/.exec(GATE);
    expect(split).not.toBeNull();
    expect(Number(split![1]) + Number(split![2]) + Number(split![3])).toBe(baseline);
  });

  test('⚠⚠ the semantic exemption list is deliberately tiny', () => {
    // Widening it is how a gate stops meaning anything: any file could be
    // declared "semantic" and its gold would stop counting.
    const block = /SEMANTIC_AUTHORITIES = new Set\(\[([^\]]*)\]\)/.exec(GATE);
    expect(block).not.toBeNull();
    const entries = (String(block![1] ?? '').match(/'[^']+'/g) ?? []);
    expect(entries).toHaveLength(2);
    expect(entries.join()).toContain('semanticColor');
    expect(entries.join()).toContain('InventoryCategorize');
  });

  test('⚠ it says what it cannot see', () => {
    // The OTA-1455 lesson: a silent partial scan reads as a full one.
    expect(GATE).toMatch(/CANNOT SEE/);
    expect(GATE).toMatch(/rgb\(\)/);
    expect(GATE).toMatch(/blind to/);
  });

  test('it is wired into the gate list', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:gold']).toBe('node scripts/check-gold.mjs');
  });
});

// ═══ 5. THE QUESTIONS THIS PASS REFUSES TO ANSWER ALONE ══════════════════════
describe('what is deliberately left for the owner', () => {
  test('⚠⚠ palette exceptions are RECORDED rather than silently imported', () => {
    /* Two colours the game uses in quantity fail the kit's warm-neutral rule.
     * Importing them would quietly widen the palette rule; deleting them would
     * be a visual change this pass has no mandate for. So they are named, with
     * their counts, to be classified in the final legacy hunt. */
    expect(Object.keys(PALETTE_EXCEPTIONS)).toContain('#8aa0a4');
    expect(Object.keys(PALETTE_EXCEPTIONS)).toContain('#6a9bbf');
    for (const why of Object.values(PALETTE_EXCEPTIONS)) {
      expect(why.length).toBeGreaterThan(20);   // a reason, not a label
    }
    // and they are NOT in the kit, which enforces r >= g >= b or low chroma
    const kit = read('app', 'ui', 'tartariaKit.tsx');
    for (const hex of Object.keys(PALETTE_EXCEPTIONS)) expect(kit).not.toContain(hex);
  });

  test('the build stamp names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-08-1757-colours-that-mean-something'");
  });
});
