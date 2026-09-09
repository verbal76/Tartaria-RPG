/**
 * OTA-1776 — COVER BEFORE THE FOUR THIN SCREENS. Rollout step 8, first half.
 *
 * The owner's ruling: *"Use cover-first on the four thin screens before
 * modifying them. Establish the appropriate regression/visual coverage first,
 * then migrate them. Do not modify first and write tests afterward."* The reason
 * is on the record — doing it during the pass is how the watermark work went
 * wrong.
 *
 * ⚠⚠⚠ SO THIS SUITE MODIFIES NOTHING. It is the BEFORE picture, and it is worth
 * more than a snapshot because it is a MEASUREMENT: the migration is only free
 * where the shipped values already equal the kit's, and the four screens do NOT
 * agree about that. Measured, comments stripped:
 *
 *                 back pill        header row       title
 *   LogScreen     = kit            differs          ink   = kit default
 *   LoreScreen    = kit            differs          ink   = kit default
 *   WorldScreen   = kit            = kit            GOLD  ← a decision
 *   GuidanceScreen  DIFFERS ←      differs          ink   = kit default
 *
 * ⚠⚠ THREE FINDINGS THE MIGRATION HAS TO BE TOLD ABOUT, not discovered halfway:
 *
 *   1. GUIDANCE'S BACK PILL IS THE REPORTED DEFECT, AND ADOPTING THE KIT FIXES
 *      IT. It ships `width: 80` — a FIXED box — with `paddingHorizontal: 12`,
 *      against the kit's `minWidth: 80` and 14. A fixed 80 cannot grow, so
 *      `← BACK` at fontSize 14 / letterSpacing 2 has nowhere to go. Every other
 *      screen in the game uses minWidth. This is one of the two GuidanceScreen
 *      issues the owner attached to this step, and it dies on adoption rather
 *      than needing a separate fix.
 *   2. WORLD'S TITLE IS BRAND GOLD AND THE KIT'S DEFAULT IS INK. Migrating it
 *      silently would repaint it; the kit has a `tone="gold"` escape, so this is
 *      a choice somebody has to make out loud — the same choice CharacterScreen
 *      made (it went ink, under the kit's rule that a screen's own name is not a
 *      live obligation).
 *   3. THE HEADER ROW DIFFERS ON THREE OF FOUR, BY A FEW PIXELS. Log, Lore and
 *      Guidance use `marginBottom: 8` with no vertical padding; the kit's row is
 *      `paddingVertical: 8, marginBottom: 4`. World already matches the kit
 *      exactly. So three headers move slightly and one does not, and the suite
 *      says which rather than letting it read as a regression later.
 *
 * ⚠ AND ONE BEHAVIOUR IS THE EASIEST THING IN THIS PASS TO BREAK: `LoreScreen`'s
 * BACK is CONDITIONAL. OTA-1292 fixed a real report — reading the bestiary
 * mid-game dumped the player on the character select — so back goes to
 * `exploration` with a live character and `title` only from the true title path.
 * `TScreenHeader` takes a callback, so it survives; a migration that "tidies"
 * it to a constant re-opens a shipped bug.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const scr = (n: string) => read('app', 'screens', `${n}.tsx`);
const KIT = read('app', 'ui', 'tartariaKit.tsx');

const THIN = ['LogScreen', 'LoreScreen', 'GuidanceScreen', 'WorldScreen'] as const;

/* ⚠ GRADE THE CODE, NOT THE PROSE — seventeenth time in this rollout. The header
 * above prints every value and hex the assertions below are about. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** One StyleSheet entry's body, normalised to single spaces so a reformat of
 *  the file does not read as a value change. ⚠ `[^}]*` — the ota1772 lesson. */
const bodyOf = (src: string, key: string): string => {
  const m = new RegExp(`\\n {2}${key}: \\{([^}]*)\\}`).exec(codeOf(src));
  return m ? m[1]!.split(/\s+/).join(' ').trim() : '';
};
/** Does a style declare this property with this value? */
const has = (src: string, key: string, prop: string): boolean =>
  new RegExp(`(^|[,\\s])${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(,|$|\\s)`)
    .test(bodyOf(src, key));

// ═══ 1. ALL FOUR STILL HAND-ROLL THE HEADER — THE THING BEING MIGRATED ═══════
describe('the before picture: four screens, four private headers', () => {
  test('⚠ none of them uses the kit header yet, and all four declare their own', () => {
    /* If this ever goes red without the rest of this suite being rewritten, a
     * migration happened without its cover being updated — which is the exact
     * order the owner ruled against. */
    for (const n of THIN) {
      const code = codeOf(scr(n));
      expect([n, code.includes('TScreenHeader')]).toEqual([n, false]);
      for (const k of ['header', 'backBtn', 'backText', 'title']) {
        expect([n, k, bodyOf(scr(n), k) !== '']).toEqual([n, k, true]);
      }
    }
  });

  test('⚠⚠ and all four hand-roll the 80pt spacer the kit already owns', () => {
    /* The kit's own note: the right slot always occupies the back button's width
     * even when empty, or the title stops being centred — "that is what the
     * eight `width: 80` spacers were doing by hand." These are four of them. */
    for (const n of THIN) {
      expect([n, /<View style=\{\{ width: 80 \}\} \/>/.test(codeOf(scr(n)))]).toEqual([n, true]);
    }
    expect(codeOf(KIT)).toContain('<View style={kit.schSlot}>{right}</View>');
  });
});

// ═══ 2. WHERE THE MIGRATION IS FREE, AND WHERE IT IS NOT ═════════════════════
describe('⚠⚠⚠ the back pill: three match the kit byte for byte, one does not', () => {
  test('Log, Lore and World already declare exactly the kit\'s pill', () => {
    /* Measured BEFORE touching anything, which is the whole point of cover
     * first. These three move no pixel on adoption — the same finding that made
     * CharacterScreen's header migration free. */
    for (const n of ['LogScreen', 'LoreScreen', 'WorldScreen']) {
      const pill = bodyOf(scr(n), 'backBtn');
      for (const v of ["backgroundColor: '#1a1714'", "borderColor: '#3a342c'", 'borderWidth: 1',
        'borderRadius: 4', 'paddingHorizontal: 14', 'paddingVertical: 10', 'minWidth: 80']) {
        expect([n, v, pill.includes(v)]).toEqual([n, v, true]);
      }
      expect([n, pill.includes('width: 80,') || /(^|[^n])width: 80/.test(pill.replace('minWidth: 80', ''))])
        .toEqual([n, false]);
    }
  });

  test('⚠⚠⚠ GuidanceScreen\'s pill is a FIXED width — the reported wrapping defect', () => {
    /* The owner attached GuidanceScreen's "back-button geometry/wrapping" to
     * this step. This is it, and it is one property: a fixed box cannot grow to
     * fit its label, and this label is `← BACK` at fontSize 14 with letterSpacing
     * 2 — six glyphs plus five gaps, inside 80pt with 12 of padding a side.
     * ⚠ THIS TEST IS EXPECTED TO DIE ON THE MIGRATION, and that is the design:
     * adopting `schBack` replaces `width` with `minWidth` and the defect goes
     * with it. Pinned now so the fix is visible in the diff rather than being an
     * unremarked side effect. */
    const pill = bodyOf(scr('GuidanceScreen'), 'backBtn');
    expect(pill).toContain('width: 80');
    expect(pill).not.toContain('minWidth');
    expect(pill).toContain('paddingHorizontal: 12');
    expect(pill).toContain('paddingVertical: 6');
    // and the kit's is the grow-to-fit version
    expect(KIT).toContain('minWidth: 80');
  });

  test('⚠ all four label the pill the same, so the kit default fits every one', () => {
    for (const n of THIN) expect([n, codeOf(scr(n)).includes('← BACK')]).toEqual([n, true]);
    expect(codeOf(KIT)).toContain("backLabel = '← BACK'");
  });
});

describe('⚠⚠ the header row: one of the four already matches the kit', () => {
  test('World\'s row is the kit\'s row; the other three carry a different spacing', () => {
    /* Not a defect — a difference, and one that will move three headers by a few
     * points on adoption. Said out loud here so it is an accepted cost rather
     * than a surprise in a screenshot. */
    const world = bodyOf(scr('WorldScreen'), 'header');
    expect(world).toContain('paddingVertical: 8');
    expect(world).toContain('marginBottom: 4');
    for (const n of ['LogScreen', 'LoreScreen', 'GuidanceScreen']) {
      const row = bodyOf(scr(n), 'header');
      expect([n, row.includes('marginBottom: 8')]).toEqual([n, true]);
      expect([n, row.includes('paddingVertical')]).toEqual([n, false]);
    }
    expect(KIT).toContain("schRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 4 }");
  });
});

describe('⚠⚠⚠ the title: three are ink and one is gold, which is a decision', () => {
  test('Log, Lore and Guidance title in ink — the kit\'s default, so free', () => {
    for (const n of ['LogScreen', 'LoreScreen', 'GuidanceScreen']) {
      expect([n, bodyOf(scr(n), 'title').includes("color: '#e6d8b3'")]).toEqual([n, true]);
    }
    expect(KIT).toContain('schTitle: { color: T.ink');
  });

  test('⚠⚠ WorldScreen titles in BRAND GOLD, and the kit has an escape for it', () => {
    /* The kit's rule is that a screen's own name is not a live obligation, so
     * `gold` has to be asked for BY NAME. CharacterScreen went ink and the
     * rollout recorded that as one of only two visible changes in its pass.
     * World is the next screen to face the same question, and this pins that the
     * question EXISTS rather than pre-answering it. */
    const title = bodyOf(scr('WorldScreen'), 'title');
    expect(title).toContain("color: '#c9a86a'");
    expect(title).toContain("fontWeight: '700'");
    expect(codeOf(KIT)).toContain("tone = 'ink'");
    expect(codeOf(KIT)).toContain("tone === 'gold' && kit.schTitleGold");
  });
});

// ═══ 3. THE BEHAVIOUR THAT MUST SURVIVE ══════════════════════════════════════
describe('⚠⚠⚠ what BACK does, screen by screen — the easiest thing to flatten', () => {
  test('LoreScreen\'s back is CONDITIONAL, and that is a shipped bug fix', () => {
    /* OTA-1292, from a real report: *"I hit the back button and it dropped me to
     * the character selection screen."* With a live character BACK returns to
     * the game; only the true title-menu path leaves. A migration that replaces
     * this with a constant re-opens that bug, and `TScreenHeader` takes a
     * callback precisely so it does not have to. */
    const code = codeOf(scr('LoreScreen'));
    expect(code).toContain("setScreen(inSession ? 'exploration' : 'title')");
    expect(code).toContain('s.player !== null');
  });

  test('⚠ the other three go where they go, and it is not the same place', () => {
    expect(codeOf(scr('LogScreen'))).toContain("setScreen('exploration')");
    expect(codeOf(scr('WorldScreen'))).toContain("setScreen('exploration')");
    // ⚠ Guidance is reached FROM settings, so it goes back to settings, not the game
    expect(codeOf(scr('GuidanceScreen'))).toContain("setScreen('about')");
    expect(codeOf(scr('GuidanceScreen'))).not.toContain("setScreen('exploration')");
  });

  test('⚠ every back control keeps a hit slop and an accessible label', () => {
    for (const n of THIN) {
      const code = codeOf(scr(n));
      expect([n, /hitSlop=\{8\}/.test(code)]).toEqual([n, true]);
      expect([n, /accessibilityRole="button"/.test(code)]).toEqual([n, true]);
    }
    // the kit defaults to the same hit slop, so adoption keeps the touch target
    expect(codeOf(KIT)).toContain('hitSlop = 8');
  });
});

// ═══ 4. GUIDANCE'S TABS — THE OTHER TWO DEFECTS ══════════════════════════════
describe('⚠⚠⚠ GuidanceScreen\'s tabs, and the two defects already on the record', () => {
  test('the kit wrote these down when it extracted TTabBar, and they are still here', () => {
    /* The `TTabBar` pass measured Guidance's tabs and RECORDED what it found
     * rather than fixing it in passing — it also named this screen as one of the
     * four thin-cover screens, which is why the defects waited for this step
     * instead of being swept into a primitive commit. Both are still true.
     * ⚠ Matched on the kit's own words rather than on an OTA number I assumed
     * was there: my first draft asserted `OTA-1762` and went red, because the
     * note credits the finding without citing the pass. Asserting a citation
     * that was never written is grading my own memory, not the code. */
    expect(KIT).toContain('TWO one-off');
    expect(KIT).toContain('thin-cover screens');
    expect(KIT).toContain('check:gold` is blind');
    expect(bodyOf(scr('GuidanceScreen'), 'tabRow')).toContain('gap: 6');
  });

  test('⚠⚠ DEFECT 1 — the tab label is missing its weight, so Guidance reads lighter', () => {
    /* Every other screen's tab label is `fontWeight: '700'`. Guidance's is not,
     * so its tabs are visibly lighter than Crafting's and Vendor's for no reason
     * anybody chose. ⚠ EXPECTED TO DIE on adoption. */
    expect(bodyOf(scr('GuidanceScreen'), 'tabText')).not.toContain('fontWeight');
    expect(KIT).toContain("tabLabel: { color: '#a2977b', fontSize: 12, letterSpacing: 2, fontWeight: '700' }");
  });

  test('⚠⚠⚠ DEFECT 2 — the selected label is a FOURTH off-brand gold', () => {
    /* `check:gold` counts `#c9a86a` and is blind to this one, exactly as it was
     * blind to the two OTA-1759 found in Inventory. So a screen has quietly
     * invented its own selected-tab gold and no gate can see it.
     * ⚠ EXPECTED TO DIE: `tabLabelOn` is `T.gold`, so adoption normalises it —
     * and unlike the conversation frame, nothing argues this one is deliberate.
     * There is no functional claim behind it and no comment defending it. */
    expect(bodyOf(scr('GuidanceScreen'), 'tabTextActive')).toContain("color: '#e0c179'");
    expect(KIT).toContain('tabLabelOn: { color: T.gold }');
    // ⚠ and the gate really cannot see it, which is why it needed a test
    const gate = read('scripts', 'check-gold.mjs');
    expect(gate).not.toContain('e0c179');
  });

  test('⚠ AND A THIRD DIFFERENCE, found by this pass rather than reported', () => {
    /* The selected tab's FILL differs too. Not named in the owner's report and
     * not obviously wrong — but it is a third value that will change on
     * adoption, and a cover that reported two while three moved would be worse
     * than no cover. */
    expect(bodyOf(scr('GuidanceScreen'), 'tabActive')).toContain("backgroundColor: '#221d15'");
    expect(KIT).toContain("tabChipOn: { borderColor: T.gold, backgroundColor: '#2a2520' }");
  });

  test('⚠⚠ the three tabs, their order and their labels must survive intact', () => {
    const code = codeOf(scr('GuidanceScreen'));
    expect(code).toContain("(['core', 'firstuse', 'reference'] as const)");
    for (const label of ['CORE', 'FIRST-USE', 'REFERENCE']) {
      expect([label, code.includes(`'${label}'`)]).toEqual([label, true]);
    }
    expect(code).toContain("useState<GuidanceTab>('core')");
  });
});

// ═══ 5. THE CONTRACT EACH SCREEN IS FOR ══════════════════════════════════════
describe('⚠⚠ what these screens DO, so a layout pass cannot quietly change it', () => {
  test('Guidance is READ-ONLY by construction, and that is load-bearing', () => {
    /* Its own header: listing a card here must never write its flag, or a player
     * who opens the replay stops being taught in play. A migration touches
     * layout, but this is the property most easily lost to a "helpful" tidy. */
    const code = codeOf(scr('GuidanceScreen'));
    expect(code).toContain('readSeenHintIds()');
    expect(code).not.toContain('markHintSeen');
    expect(code).not.toContain('setSeenHintIds');
  });

  test('⚠⚠ every group the registry uses is one Guidance renders — no card is orphaned', () => {
    /* ⚠ READ, NOT EXERCISED, AND THAT IS A CONCESSION WORTH STATING. The honest
     * version of this test calls `groupTeachings(ALL_TEACHINGS)` — but requiring
     * `GuidanceScreen` pulls in `gameStore`, which pulls in AsyncStorage, which
     * has no native module under this runner. My first draft did exactly that
     * and died on `NativeModule: AsyncStorage is null`.
     *
     * Mocking the store to reach a pure grouping helper would be building a
     * harness to test a `filter`, so this reads the two lists instead and
     * asserts the property that actually matters: `groupTeachings` filters
     * `GROUP_ORDER` against each teaching's `group`, so a card whose group is
     * missing from that array is DROPPED FROM THE REPLAY SILENTLY. Comparing the
     * two sets catches exactly that, which is the failure worth catching. */
    const guide = codeOf(scr('GuidanceScreen'));
    const order = /GROUP_ORDER: readonly TeachingGroup\[\] = \[([^\]]*)\]/.exec(guide)?.[1] ?? '';
    expect(order).not.toBe('');
    const rendered = new Set([...order.matchAll(/'(\w+)'/g)].map((m) => m[1]!));
    expect(rendered.size).toBeGreaterThan(0);

    const registry = codeOf(read('app', 'components', 'teachingRegistry.ts'));
    const used = new Set([...registry.matchAll(/\bgroup: '(\w+)'/g)].map((m) => m[1]!));
    expect(used.size).toBeGreaterThan(0);

    // every group a teaching claims is a group the screen will render
    for (const g of used) expect([g, rendered.has(g)]).toEqual([g, true]);
    // and the titles table covers the same set, or a rendered group has no heading
    const titles = /GROUP_TITLES: Record<TeachingGroup, string> = \{([\s\S]*?)\n\};/.exec(guide)?.[1] ?? '';
    for (const g of rendered) expect([g, new RegExp(`\\b${g}:`).test(titles)]).toEqual([g, true]);
    // empty groups are dropped rather than rendered as bare headings
    expect(guide).toContain('.filter((g) => g.items.length > 0)');
  });

  test('⚠ Lore is a thin wrapper over the shared codex body, not a second copy', () => {
    /* OTA 046 moved the body out so the gear-icon tab and this screen render the
     * same content. A migration that inlined anything here would fork them. */
    const code = codeOf(scr('LoreScreen'));
    expect(code).toContain('LoreCodexBody');
    expect(scr('LoreScreen').split('\n').length).toBeLessThan(80);
  });
});

// ═══ 6. THE STRIPPER ═════════════════════════════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ comments are stripped, and one style body does not leak into the next', () => {
    const src = scr('GuidanceScreen');
    expect(codeOf(src).length).toBeLessThan(src.length);
    expect(codeOf("/* width: 80 */ const a = 1;")).not.toContain('width: 80');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
    expect(bodyOf(src, 'backText')).not.toContain('title');
    expect(has(src, 'tabActive', "borderColor: '#c9a86a'")).toBe(true);
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1776-cover-before-the-thin-four'");
  });
});
