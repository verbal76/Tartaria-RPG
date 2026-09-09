/**
 * OTA-1780 — THE THIN FOUR MIGRATE. Rollout step 8, second half.
 *
 * OTA-1776 wrote the cover first, on the owner's ruling. This is the migration
 * it was written for, and the cover's whole value was knowing IN ADVANCE which
 * of each screen's four header values would move:
 *
 *                 back pill   header row   title        result
 *   LogScreen     = kit       differs      ink          free but for the row
 *   LoreScreen    = kit       differs      ink          free but for the row
 *   WorldScreen   = kit       = kit        GOLD → INK   one ruled change
 *   GuidanceScreen  DIFFERS   differs      ink          three defects die
 *
 * ⚠⚠⚠ THREE DEFECTS DIED ON ADOPTION, ALL THREE PINNED IN ADVANCE TO FAIL THE
 * DAY THEY WERE FIXED. Guidance shipped a FIXED `width: 80` back pill where every
 * other screen used `minWidth`, so `← BACK` had nowhere to go — the wrapping the
 * owner reported. Its tab label was missing `fontWeight: '700'`, so its tabs
 * rendered lighter than every other screen's. And its selected tab label was
 * `#e0c179`, a FOURTH off-brand gold `check:gold` cannot see. A cover that named
 * two while three moved would have been worse than no cover, so the third — the
 * selected chip's fill — was found and pinned by that pass too.
 *
 * ⚠⚠ ONE VISIBLE CHANGE, AND IT IS A RULING: World's title goes gold → ink.
 * *"Use ink. WORLD is a screen title, not a live obligation/process."* Which is
 * the kit's own rule applied — gold must be asked for BY NAME. CharacterScreen
 * answered the same question the same way.
 *
 * ⚠⚠⚠ AND THE MIGRATION NEARLY COST SOMETHING NOBODY WAS WATCHING FOR. Guidance's
 * tabs print `CORE` / `FIRST-USE` / `REFERENCE` and ANNOUNCED "Core tutorial",
 * "First-use teaching", "Action reference". `TTabBar` had no way to carry a
 * spoken name distinct from a printed one, so the first cut silently dropped all
 * three — trading an accessibility regression for three cosmetic fixes. OTA-1738's
 * EXISTING suite caught it, not this pass's own tests, which is the argument for
 * running the whole surface. The fix was to give the primitive the capability it
 * lacked (`TTab.a11yLabel`), not to revert.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const scr = (n: string) => read('app', 'screens', `${n}.tsx`);
const KIT = read('app', 'ui', 'tartariaKit.tsx');

const THIN = ['LogScreen', 'LoreScreen', 'GuidanceScreen', 'WorldScreen'] as const;

/* ⚠ GRADE THE CODE, NOT THE PROSE — twentieth time in this rollout. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** Brace-balanced style body, or null when the style is gone. */
function bodyOf(src: string, key: string): string | null {
  const code = codeOf(src);
  const i = code.indexOf(`\n  ${key}: {`);
  if (i < 0) return null;
  const j = code.indexOf('{', i);
  let d = 0;
  for (let n = j; n < code.length; n += 1) {
    if (code[n] === '{') d += 1;
    else if (code[n] === '}') {
      d -= 1;
      if (d === 0) return code.slice(j + 1, n).split(/\s+/).join(' ').trim();
    }
  }
  return null;
}

// ═══ 1. THE MIGRATION ════════════════════════════════════════════════════════
describe('all four thin screens took the kit header', () => {
  test('⚠⚠ each renders TScreenHeader and declares none of the four orphans', () => {
    for (const n of THIN) {
      expect([n, codeOf(scr(n)).includes('<TScreenHeader')]).toEqual([n, true]);
      for (const k of ['header', 'backBtn', 'backText', 'title']) {
        expect([n, k, bodyOf(scr(n), k)]).toEqual([n, k, null]);
      }
    }
  });

  test('⚠⚠ each keeps the title it printed', () => {
    for (const [n, t] of [['LogScreen', 'FULL GAME LOG'], ['LoreScreen', 'LORE CODEX'],
      ['GuidanceScreen', 'GUIDANCE'], ['WorldScreen', 'THE WORLD']] as const) {
      expect([n, codeOf(scr(n)).includes(`title="${t}"`)]).toEqual([n, true]);
    }
  });

  test('⚠ and the hand-rolled 80pt spacers are gone — the kit owns that slot', () => {
    for (const n of THIN) {
      expect([n, /width: 80/.test(codeOf(scr(n)))]).toEqual([n, false]);
    }
    expect(codeOf(KIT)).toContain('<View style={kit.schSlot}>{right}</View>');
  });
});

// ═══ 2. THE BEHAVIOUR THAT HAD TO SURVIVE ════════════════════════════════════
describe('⚠⚠⚠ BACK still goes where each screen sent it', () => {
  test('LoreScreen\'s CONDITIONAL back survived — the easiest thing to flatten', () => {
    /* OTA-1292 fixed a real report: reading the bestiary mid-game dumped the
     * player on the character select. With a live character BACK returns to the
     * game; only the true title path leaves. `TScreenHeader` takes a CALLBACK
     * precisely so this survives — a migration that "tidied" it to a constant
     * would have re-opened a shipped bug, and OTA-1776 pinned it for that reason. */
    const code = codeOf(scr('LoreScreen'));
    expect(code).toContain("onBack={() => setScreen(inSession ? 'exploration' : 'title')}");
    expect(code).toContain('s.player !== null');
  });

  test('⚠ and the other three go where they went', () => {
    expect(codeOf(scr('LogScreen'))).toContain("onBack={() => setScreen('exploration')}");
    expect(codeOf(scr('WorldScreen'))).toContain("onBack={() => setScreen('exploration')}");
    // ⚠ Guidance is reached FROM settings, so it returns there, not to the game
    expect(codeOf(scr('GuidanceScreen'))).toContain("onBack={() => setScreen('about')}");
    expect(codeOf(scr('GuidanceScreen'))).not.toContain("setScreen('exploration')");
  });

  test('⚠⚠ the two screens that named their back control still name it', () => {
    /* Lore and Guidance passed an `accessibilityLabel`; Log and World did not.
     * The kit defaults to "Go back", so the two that were specific stay specific
     * and the two that were not are unchanged. */
    expect(codeOf(scr('LoreScreen'))).toContain('accessibilityLabel="Back"');
    expect(codeOf(scr('GuidanceScreen'))).toContain('accessibilityLabel="Back to settings"');
    expect(codeOf(KIT)).toContain("accessibilityLabel = 'Go back'");
  });

  test('⚠ the touch target survives by INHERITANCE rather than repetition', () => {
    /* All four passed `hitSlop={8}` and the kit's default is 8, so none of them
     * passes one now. The check that matters is that adoption did not shrink a
     * tap target. */
    for (const n of THIN) expect([n, /hitSlop/.test(codeOf(scr(n)))]).toEqual([n, false]);
    expect(codeOf(KIT)).toContain('hitSlop = 8');
  });
});

// ═══ 3. THE THREE DEFECTS ════════════════════════════════════════════════════
describe('⚠⚠⚠ Guidance\'s three defects, dead on adoption', () => {
  test('DEFECT 1 — the fixed-width back pill that could not fit its own label', () => {
    /* The owner's reported wrapping, and it was one property. Every other screen
     * used `minWidth`; this one used `width`. */
    expect(bodyOf(scr('GuidanceScreen'), 'backBtn')).toBeNull();
    expect(KIT).toContain('minWidth: 80');
    expect(bodyOf(KIT, 'schBack')).not.toMatch(/(^|[^n])width: 80/);
  });

  test('DEFECT 2 + 3 — the light tab label and the fourth off-brand gold', () => {
    const code = codeOf(scr('GuidanceScreen'));
    expect(code).toContain('<TTabBar');
    for (const k of ['tabRow', 'tab', 'tabActive', 'tabText', 'tabTextActive']) {
      expect([k, bodyOf(scr('GuidanceScreen'), k)]).toEqual([k, null]);
    }
    expect(code).not.toContain('#e0c179');
    expect(code).not.toContain('#221d15');
    expect(KIT).toContain("tabLabel: { color: '#a2977b', fontSize: 12, letterSpacing: 2, fontWeight: '700' }");
    expect(KIT).toContain('tabLabelOn: { color: T.gold }');
  });

  test('⚠⚠ the gate STILL cannot see an off-brand gold — a migration caught this one', () => {
    /* `check:gold` counts `#c9a86a` alone, so it was blind to `#e0c179` and is
     * still blind to Inventory's two. Worth stating plainly: this fix came from
     * somebody looking, not from a check firing. */
    const gate = read('scripts', 'check-gold.mjs');
    expect(gate).toContain("/'#c9a86a'/gi");
    /* ⚠ STRIP THE GATE'S COMMENTS BEFORE ASSERTING — GRADE THE CODE, NOT THE
     * PROSE, twenty-first time in this rollout and the sharpest instance yet:
     * the gate's own LEDGER now records that `#e0c179` was a gold it could not
     * see, so a naive `not.toContain` on the raw file trips on the sentence
     * documenting the blindness. A check that fails on its own write-up teaches
     * people to delete the write-up. */
    const gateCode = gate.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const h of ['e0c179', 'd8b46a', '9c8348']) expect(gateCode).not.toContain(h);
  });

  test('⚠⚠ and the three tabs kept their keys, order, labels and state wiring', () => {
    const code = codeOf(scr('GuidanceScreen'));
    for (const [key, label] of [['core', 'CORE'], ['firstuse', 'FIRST-USE'],
      ['reference', 'REFERENCE']] as const) {
      expect([key, code.includes(`key: '${key}', label: '${label}'`)]).toEqual([key, true]);
    }
    expect(code).toContain("useState<GuidanceTab>('core')");
    expect(code).toContain('onChange={(k) => setTab(k as GuidanceTab)}');
  });
});

// ═══ 4. THE ACCESSIBILITY REGRESSION THAT ALMOST SHIPPED ═════════════════════
describe('⚠⚠⚠ the spoken tab names survived, and the primitive grew to carry them', () => {
  test('all three announce what they announced before', () => {
    const code = codeOf(scr('GuidanceScreen'));
    for (const l of ['Core tutorial', 'First-use teaching', 'Action reference']) {
      expect([l, code.includes(`a11yLabel: '${l}'`)]).toEqual([l, true]);
    }
  });

  test('⚠⚠ the kit carries it, and DEFAULTS to the printed label', () => {
    /* So Crafting and Vendor are untouched: a tab whose printed name is already
     * a word does not need a second one. A required field would have forced
     * every existing call site to repeat itself. */
    expect(codeOf(KIT)).toContain('a11yLabel?: string;');
    expect(codeOf(KIT)).toContain('accessibilityLabel={t.a11yLabel ?? t.label}');
    for (const n of ['CraftingScreen', 'VendorScreen']) {
      expect([n, codeOf(scr(n)).includes('a11yLabel')]).toEqual([n, false]);
    }
  });
});

// ═══ 5. THE ONE RULED CHANGE ═════════════════════════════════════════════════
describe('⚠⚠ World\'s title went gold → ink, by ruling', () => {
  test('it asks for no tone, so it takes the kit\'s ink default', () => {
    expect(codeOf(scr('WorldScreen'))).not.toContain('tone=');
    expect(KIT).toContain('schTitle: { color: T.ink');
  });

  test('⚠ and the gold escape still exists for a screen that earns it', () => {
    /* The rule is "gold must be asked for BY NAME", not "gold is gone". */
    expect(codeOf(KIT)).toContain("tone = 'ink'");
    expect(codeOf(KIT)).toContain("tone === 'gold' && kit.schTitleGold");
  });
});

// ═══ 6. THE LEDGER AND THE GUARDRAIL ═════════════════════════════════════════
describe('the ratchet and the consumer list both moved as ACTS', () => {
  test('⚠ six more golds left, and the ledger says which', () => {
    const gate = read('scripts', 'check-gold.mjs');
    const baseline = Number(/const BASELINE = (\d+);/.exec(gate)?.[1]);
    expect(Number.isFinite(baseline)).toBe(true);
    expect(baseline).toBeLessThanOrEqual(315);   // ⚠ a ceiling, not the number
    expect(gate).toContain('OTA-1780');
  });

  test('⚠⚠⚠ the anti-drift consumer list names all four, deliberately', () => {
    /* OTA-1742's guardrail exists to stop a second design system forming by
     * drift, and it said in as many words that these four *"must not be added
     * until the owner's open decision about writing cover first is settled."*
     * It is settled, the cover shipped, and the migration followed — so this
     * widening is the decided sequence arriving, which is the only kind of
     * widening that test permits. */
    const guard = read('__tests__', 'ota1742TheScreenIsMadeOfSomething.test.tsx');
    for (const n of THIN) expect([n, guard.includes(`'${n}.tsx',`)]).toEqual([n, true]);
    expect(guard).toContain('OTA-1780');
    // and Guidance is off the deny-list it used to sit on
    expect(guard).toContain("const off = ['CombatScreen', 'InventoryScreen'];");
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1780-the-thin-four-migrate'");
  });
});
