/**
 * OTA-1765 — TMODAL. THE SHELL ELEVEN DIALOGS HAND-COPIED.
 *
 * Tier 0, step 5. Thirty-three modal files, and the ones that look like the
 * game's dialogs all draw the same material: a scrim at `rgba(0,0,0,0.7)` and a
 * card in `#13110f` rimmed `#c9a86a`. That material was WRITTEN in
 * `BrandedModal` and then re-typed by hand, file after file.
 *
 * ⚠⚠⚠ STYLES, NOT A COMPONENT, AND THAT IS THE FINDING RATHER THAN A SHORTCUT.
 * arb73 records iPad/iOS presenting a native `<Modal>` INVISIBLY while its
 * backdrop still ate touches — which hid one popup and blocked the buttons under
 * it. `BrandedModal`'s answer is a per-call-site choice between a native
 * `<Modal>` and an in-tree absolute overlay. A `<TModal>` owning the container
 * would have to own that choice too, and would be re-fighting a shipped device
 * bug for tidiness. What every dialog agrees on is the MATERIAL.
 *
 * ⚠⚠ AND THE SECOND ADOPTION IS NOT FREE, WHICH IS THE HALF WORTH READING.
 * I first reported `HookContinueModal`'s card as differing from `BrandedModal`'s
 * in ONE number. It differs in two: `maxWidth` 420, and it has NO `maxHeight` at
 * all. So taking the shell there ADDS OTA-1614's 85% cap — and a capped card
 * whose ScrollView will not shrink pushes CONTINUE / ABANDON out of the bottom.
 * The `flexShrink` line that prevents that is asserted here, because without it
 * this pass would have shipped a modal you cannot leave.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const KIT = read('app', 'ui', 'tartariaKit.tsx');
const BRANDED = read('app', 'components', 'BrandedModal.tsx');
const HOOK = read('app', 'components', 'HookContinueModal.tsx');

/* ⚠ GRADE THE CODE, NOT THE PROSE. Sixth time in this rollout: these files
 * explain themselves in comments that name the very strings under test — this
 * suite's own subject is a hex and a style name, and both appear in every
 * paragraph above them. Strip comments before asserting anything about code. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** A style declaration's own block, anchored on its two-space indent so a
 *  mention inside a style ARRAY cannot end the slice early — the false green
 *  OTA-1763's suite caught the hard way. */
function styleBlock(src: string, name: string): string {
  const code = codeOf(src);
  const start = code.indexOf(`\n  ${name}: {`);
  if (start < 0) return '';
  const end = code.indexOf('\n  },', start);
  return end < 0 ? '' : code.slice(start, end);
}

// ═══ 1. THE MATERIAL IS IN ONE PLACE ═════════════════════════════════════════
describe('the modal shell is a kit export now', () => {
  test('⚠ the kit ships the scrim and the card, with the shipped values', () => {
    const scrim = styleBlock(KIT, 'modalScrim');
    expect(scrim).not.toBe('');
    expect(scrim).toContain("backgroundColor: 'rgba(0,0,0,0.7)'");
    expect(scrim).toContain('flex: 1');
    expect(scrim).toContain('padding: 20');
    const card = styleBlock(KIT, 'modalCard');
    expect(card).not.toBe('');
    expect(card).toContain("width: '100%'");
    expect(card).toContain("backgroundColor: '#13110f'");
    expect(card).toContain('borderColor: T.gold');
    expect(card).toContain('borderWidth: 1');
    expect(card).toContain('borderRadius: 4');
    expect(card).toContain('padding: 14');
  });

  test('⚠⚠ the card carries OTA-1614\'s cap, because that IS what it is for', () => {
    /* A card with no ceiling grows past the screen and takes the scrim — and
     * with it the tap-outside escape — off the bottom with it. */
    expect(styleBlock(KIT, 'modalCard')).toContain("maxHeight: '85%'");
  });

  test('⚠ width is a PARAMETER, and the card itself does not fix one', () => {
    /* The measured values are 380 / 400 / 420 / 440 — four numbers with no
     * shared vocabulary behind them. Inventing compact/regular/wide would be
     * naming a decision nobody has made. */
    expect(styleBlock(KIT, 'modalCard')).not.toContain('maxWidth');
    expect(codeOf(KIT)).toContain('export function tModalCard(maxWidth = 380)');
    expect(codeOf(KIT)).toContain('return [kit.modalCard, { maxWidth }]');
  });

  test('⚠⚠⚠ it is a helper, not a <TModal> component — the arb73 reason is kept', () => {
    /* If this ever becomes a component, the presentation mechanic comes with it
     * and the device bug comes back. The reasoning lives with the code. */
    expect(KIT).toContain('arb73');
    expect(KIT).toContain('STYLES, NOT A COMPONENT');
    expect(codeOf(KIT)).not.toMatch(/export function TModal\b/);
  });
});

// ═══ 1b. THE VALUES RESOLVE, NOT JUST THE SOURCE TEXT ════════════════════════
describe('the composed style is the shipped card, byte for byte', () => {
  /* ⚠⚠⚠ EVERY OTHER TEST HERE READS SOURCE. This one RESOLVES the style, which
   * is the only way to claim "zero pixels moved" honestly: a helper returning an
   * array could be assembled correctly and still flatten to something else. */
  test('⚠⚠⚠ tModalCard(380) flattens to exactly what BrandedModal used to declare', () => {
    const { StyleSheet } = require('react-native');
    const { tModalCard, T } = require('../app/ui/tartariaKit');
    const flat = StyleSheet.flatten(tModalCard(380)) as Record<string, unknown>;
    /* ⚠⚠ ONE LITERAL IS NOT IDENTICAL AND IT IS A CASE, NOT A COLOUR. The kit's
     * `T.gold` is `#C9A86A`; `BrandedModal` declared `#c9a86a`. RN's colour
     * parser is case-insensitive, so the rendered pixel is the same one — but
     * "byte for byte" was the claim I made about this card, and it is true of
     * the value and not of the string. Said here rather than left for someone
     * grepping for a lowercase hex and finding the modal no longer has one. */
    expect(flat.borderColor).toBe(T.gold);
    expect(String(flat.borderColor).toLowerCase()).toBe('#c9a86a');
    expect({ ...flat, borderColor: String(flat.borderColor).toLowerCase() }).toEqual({
      width: '100%',
      maxWidth: 380,
      maxHeight: '85%',
      backgroundColor: '#13110f',
      borderColor: '#c9a86a',
      borderWidth: 1,
      borderRadius: 4,
      padding: 14,
    });
  });

  test('⚠⚠ and 420 differs in that one number and nothing else', () => {
    const { StyleSheet } = require('react-native');
    const { tModalCard } = require('../app/ui/tartariaKit');
    const a = StyleSheet.flatten(tModalCard(380)) as Record<string, unknown>;
    const b = StyleSheet.flatten(tModalCard(420)) as Record<string, unknown>;
    const differing = Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
    expect(differing).toEqual(['maxWidth']);
    expect(b.maxWidth).toBe(420);
  });

  test('⚠ the scrim resolves to the shipped scrim', () => {
    const { StyleSheet } = require('react-native');
    const { tartariaKitStyles } = require('../app/ui/tartariaKit');
    expect(StyleSheet.flatten(tartariaKitStyles.modalScrim)).toEqual({
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    });
  });
});

// ═══ 2. THE FIRST ADOPTER MOVES NOTHING ══════════════════════════════════════
describe('BrandedModal — the file the values came FROM', () => {
  test('⚠ it uses the kit shell on BOTH presentation paths', () => {
    const code = codeOf(BRANDED);
    expect(code).toContain('const CARD = tModalCard(380);');
    // native <Modal> path and the arb73 in-tree overlay path
    expect((code.match(/style=\{kit\.modalScrim\}/g) ?? []).length).toBe(2);
    expect((code.match(/style=\{CARD\}/g) ?? []).length).toBe(2);
  });

  test('⚠⚠ the old declarations are GONE, not shadowed by a live copy', () => {
    /* A component that imports the shell and keeps its own `card` next to it is
     * the drift this rollout exists to stop — two sources, one of them stale. */
    expect(styleBlock(BRANDED, 'scrim')).toBe('');
    expect(styleBlock(BRANDED, 'card')).toBe('');
    expect(codeOf(BRANDED)).not.toContain('maxWidth: 380');
  });

  test('⚠⚠⚠ `inlineScrim` STAYS — it is the arb73 workaround, not modal material', () => {
    /* It is a positioning layer for THIS component's native-vs-in-tree choice.
     * Sweeping it into the kit would be sweeping the device bug in with it. */
    const inline = styleBlock(BRANDED, 'inlineScrim');
    expect(inline).toContain("position: 'absolute'");
    expect(inline).toContain('zIndex: 9999');
    expect(codeOf(KIT)).not.toContain('inlineScrim');
  });

  test('the scrolling middle can still give the buttons back', () => {
    expect(styleBlock(BRANDED, 'scrollArea')).toContain('flexShrink: 1');
  });
});

// ═══ 3. THE SECOND ADOPTER, AND WHAT IT COST ═════════════════════════════════
describe('HookContinueModal — the adoption that was not a substitution', () => {
  test('it takes the shell at its own width', () => {
    const code = codeOf(HOOK);
    expect(code).toContain('const CARD = tModalCard(420);');
    expect(code).toContain('style={kit.modalScrim}');
    expect(code).toContain('style={CARD}');
    expect(styleBlock(HOOK, 'scrim')).toBe('');
    expect(styleBlock(HOOK, 'card')).toBe('');
  });

  test('⚠⚠⚠ the capped card CAN give its buttons back — without this it cannot', () => {
    /* RN views do not shrink by default. The card now stops at 85% of the
     * screen; if the stage list refuses to yield, CONTINUE / TRADE NOW / ABANDON
     * are pushed out of the bottom of a modal whose only other exit is the
     * scrim behind them. This one line is the difference. */
    const scroll = styleBlock(HOOK, 'stageScroll');
    expect(scroll).not.toBe('');
    expect(scroll).toContain('flexShrink: 1');
    expect(scroll).toContain('flexGrow: 0');
    // and the buttons are still after the scroll, inside the card
    const code = codeOf(HOOK);
    expect(code.indexOf('styles.btnRow')).toBeGreaterThan(code.indexOf('styles.stageScroll'));
  });

  test('⚠ its own height guard is kept, not replaced by the percentage', () => {
    /* `Dimensions.get('window')` read once at module load does not survive a
     * rotation or a split-screen resize; the percentage does. They cap different
     * things — the stage list and the card — so both stay. */
    expect(HOOK).toContain('const STAGE_SCROLL_MAX_HEIGHT');
    expect(codeOf(HOOK)).toContain('maxHeight: STAGE_SCROLL_MAX_HEIGHT');
  });

  test('⚠ the difference is recorded where the next reader will be', () => {
    /* I reported this card as differing in ONE number. It differed in two, and
     * the second one is the one with a cost. */
    expect(HOOK).toContain('OTA-1765');
    expect(HOOK).toContain('flexShrink');
  });
});

// ═══ 4. THE CENSUS, RUN RATHER THAN REMEMBERED ═══════════════════════════════
describe('what is left, counted by predicate', () => {
  /** A file that declares its OWN scrim/backdrop and its own Family A card. */
  const handCopies = () => {
    const out: string[] = [];
    for (const dir of ['components', 'screens']) {
      for (const f of readdirSync(join(ROOT, 'app', dir))) {
        if (!f.endsWith('.tsx')) continue;
        const code = codeOf(read('app', dir, f));
        if (!/\n {2}(scrim|backdrop): \{/.test(code)) continue;
        if (!code.includes("backgroundColor: '#13110f'")) continue;
        if (!code.includes("borderColor: '#c9a86a'")) continue;
        out.push(f);
      }
    }
    return out.sort();
  };

  test('⚠⚠ the two adopters no longer match the predicate — that is the proof', () => {
    const left = handCopies();
    expect(left).not.toContain('BrandedModal.tsx');
    expect(left).not.toContain('HookContinueModal.tsx');
  });

  test('⚠⚠⚠ the remaining nine are NAMED, so the sweep cannot quietly grow', () => {
    /* This is the guardrail the consumer list is for `TPanel`: a tenth file
     * appearing here means a new dialog hand-copied the shell instead of
     * importing it, and that shows up as a failing test rather than as another
     * copy nobody notices for a year. Finishing these nine is the modal sweep,
     * a separate pass — this OTA extracts, it does not sweep. */
    expect(handCopies()).toEqual([
      'ApproachModal.tsx',
      'ClimbModal.tsx',
      'CraftRefusalModal.tsx',
      'CraftResultModal.tsx',
      'KeyboardSafeCard.tsx',
      'SearchModal.tsx',
      'TorchProbeModal.tsx',
      'WhisperCompleteModal.tsx',
      'WhisperTalkSheet.tsx',
    ]);
  });

  test('⚠ Family B and the semantic rims are untouched, by instruction', () => {
    /* `#9ec96a` on MissionComplete is a SUCCESS and `#8aa0a4` on FusionPicker is
     * a CATEGORY — the owner's amendment reserves semantic colour, so neither is
     * an accent to sweep. Family B's `#17150f` ground is a real second lineage;
     * merging it is a decision for the sweep, not a side effect of this. */
    expect(read('app', 'components', 'MissionCompleteModal.tsx')).toContain('#9ec96a');
    expect(codeOf(KIT)).not.toContain('#9ec96a');
    expect(codeOf(KIT)).not.toContain('#17150f');
  });
});

// ═══ 5. THE STRIPPER IS STILL DOING SOMETHING ════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ comments really are removed — or every claim above is weaker than it reads', () => {
    expect(codeOf(BRANDED).length).toBeLessThan(BRANDED.length * 0.95);
    expect(codeOf('/* maxWidth: 380 */ const a = 1;')).not.toContain('380');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1765-the-shell-eleven-copied'");
  });
});
