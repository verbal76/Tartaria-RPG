/**
 * OTA-1774 — TWO OF THE SEVEN ARE FAMILY A. The modal sweep, batch 2.
 *
 * The owner's ruling released HOLD 3: *"DiscoveryReveal and MissionStinger remain
 * EXPERIENTIAL. The other seven moment/modal candidates take the standard modal
 * shell."* The nine, from the plan: DogOnboarding · GolemNaming · CombatPrimer ·
 * WandererEncounter · CraftResult · WhisperComplete · MissionComplete ·
 * MissionStinger · DiscoveryReveal.
 *
 * ⚠⚠⚠ AND MEASURING THEM SPLIT THE SEVEN, WHICH THE RULING COULD NOT HAVE KNOWN.
 * Only TWO are the shell the ruling names. Measured, comments stripped:
 *
 *   FAMILY A — scrim 0.70 + padding 20 · card #13110f · radius 4 · padding 14
 *     CraftResult (400) · WhisperComplete (420)               ← adopt, 0 pixels
 *   FAMILY B — backdrop 0.78 · card #17150f · radius 6 · padding 20 · width 440
 *     DogOnboarding · GolemNaming · CombatPrimer ·
 *     WandererEncounter · MissionComplete                     ← HELD
 *
 * Forcing the five onto Family A is not re-addressing them, it is RESTYLING five
 * beats: a different ground, a different radius, a different padding and a
 * different scrim opacity, all visible. The plan's own governing principle is
 * *"Do not homogenize Tartaria ... A death, a chapter card, a story fork and a
 * tutorial moment are supposed to feel unlike a quantity picker"*, and it says in
 * as many words that "adopt the language" is NOT the same instruction as "use the
 * shell".
 *
 * ⚠⚠ AND THE TELL THAT FAMILY B IS NOT "THE MOMENT FAMILY": `MissionStinger` is
 * Family B too, and the same ruling keeps it EXPERIENTIAL. So the construction
 * does not track the intent, and the two questions are genuinely separate.
 *
 * So: the two that adopt with no pixel change adopt. The five are held with the
 * measurement written down, their pixels untouched. HOLD 5.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { tModalCard, tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const cmp = (n: string) => read('app', 'components', `${n}.tsx`);

/** The two that adopted, with the width each shipped and keeps. */
const ADOPTERS: ReadonlyArray<readonly [string, number]> = [
  ['CraftResultModal', 400],
  ['WhisperCompleteModal', 420],
];

/** The five held, all Family B. */
const HELD_B = [
  'DogOnboardingModal', 'GolemNamingModal', 'CombatPrimerModal',
  'WandererEncounterModal', 'MissionCompleteModal',
] as const;

/* ⚠ GRADE THE CODE, NOT THE PROSE — fifteenth time in this rollout. The header
 * above prints every hex and radius the assertions below are about. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** One StyleSheet entry's body. ⚠ `[^}]*` — the ota1772 lesson: a lazy scan to
 *  the next `\n  },` runs past every one-line entry and asserts against the NEXT
 *  style's properties. No entry in these files nests a brace. */
const bodyOf = (src: string, key: string): string =>
  new RegExp(`\\n {2}${key}: \\{([^}]*)\\}`).exec(codeOf(src))?.[1] ?? '';

// ═══ 1. THE TWO THAT ADOPTED ═════════════════════════════════════════════════
describe('the two Family A moment modals took the shell', () => {
  test('⚠⚠ each reaches the kit for BOTH pieces, and declared neither locally', () => {
    for (const [n] of ADOPTERS) {
      const code = codeOf(cmp(n));
      expect([n, code.includes('style={kit.modalScrim}')]).toEqual([n, true]);
      expect([n, code.includes('style={CARD}')]).toEqual([n, true]);
      expect([n, /\n {2}scrim: \{/.test(code)]).toEqual([n, false]);
      expect([n, /\n {2}card: \{/.test(code)]).toEqual([n, false]);
    }
  });

  test('⚠⚠⚠ each keeps the width IT shipped — 400 and 420, not one number', () => {
    /* Two adopters, two different widths, neither normalised. If a sweep ever
     * collapses these to a single number it will be a restyle wearing an
     * extraction's clothes, and this is the test that says so. */
    for (const [n, w] of ADOPTERS) {
      expect([n, codeOf(cmp(n)).includes(`tModalCard(${w})`)]).toEqual([n, true]);
    }
    const { StyleSheet } = require('react-native');
    const a = StyleSheet.flatten(tModalCard(400)) as Record<string, unknown>;
    const b = StyleSheet.flatten(tModalCard(420)) as Record<string, unknown>;
    expect(Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k])).toEqual(['maxWidth']);
  });

  test('⚠⚠ and each scrolling middle can give way under the kit\'s ceiling', () => {
    /* ⚠ PIN THE CLAIM, NEVER THE MECHANISM. The claim is "the middle yields",
     * never "the cap is N" — both of these caps are computed from the window at
     * module load, so a literal here would pin a number that does not exist. */
    for (const [n] of ADOPTERS) {
      const code = codeOf(cmp(n));
      const keys = [...code.matchAll(/<ScrollView[\s\S]{0,200}?style=\{\[?\s*styles\.(\w+)/g)]
        .map((m) => m[1]!);
      expect([n, keys.length]).toEqual([n, 1]);
      const decl = bodyOf(cmp(n), keys[0]!);
      expect([n, /flexShrink: 1/.test(decl)]).toEqual([n, true]);
      expect([n, /flexGrow: 0/.test(decl)]).toEqual([n, true]);
    }
    const { StyleSheet } = require('react-native');
    expect((StyleSheet.flatten(tModalCard(400)) as Record<string, unknown>).maxHeight)
      .toBe('85%');
  });

  test('⚠ the scrim is the kit\'s one object', () => {
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(kit.modalScrim)).toEqual({
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    });
  });
});

// ═══ 2. THE FIVE THAT ARE A DIFFERENT SHELL ══════════════════════════════════
describe('⚠⚠⚠ the other five are Family B, and that is measured, not asserted', () => {
  test('all five carry the deeper backdrop and the warmer card', () => {
    /* The measurement the ruling was made without. Each of these differs from
     * Family A in FOUR properties at once, and every one of them is visible.
     * ⚠ RE-AIMED ON OTA-1777: the card values now live in the kit, so the test
     * reads them from there and asserts each file REACHES it. The deeper scrim
     * is still read per file, because three of them still declare their own. */
    const { StyleSheet } = require('react-native');
    const { tMomentCard, tartariaKitStyles } = require('../app/ui/tartariaKit');
    const card = StyleSheet.flatten(tMomentCard()) as Record<string, unknown>;
    expect(card.backgroundColor).toBe('#17150f');
    expect(card.borderRadius).toBe(6);
    expect(card.padding).toBe(20);
    expect(card.maxWidth).toBe(440);
    expect((StyleSheet.flatten(tartariaKitStyles.momentScrim) as Record<string, unknown>)
      .backgroundColor).toBe('rgba(0,0,0,0.78)');
    for (const n of HELD_B) {
      const code = codeOf(cmp(n));
      const scrim = code.includes('kit.momentScrim') ? 'rgba(0,0,0,0.78)' : bodyOf(cmp(n), 'backdrop');
      expect([n, /rgba\(0,0,0,0\.78\)/.test(scrim)]).toEqual([n, true]);
      expect([n, code.includes('tMomentCard')]).toEqual([n, true]);
    }
  });

  test('⚠⚠ their pixels are UNTOUCHED — and they still are, one shell later', () => {
    /* ⚠⚠⚠ RE-AIMED ON OTA-1777. This test used to assert the five kept PRIVATE
     * copies, which was the correct claim while they were held. The owner then
     * ruled Family B a legitimate second shell, so they now read `tMomentCard`
     * — and the claim worth defending was never "they are unmigrated", it was
     * "NOT ONE PIXEL MOVED WHILE THE QUESTION WAS OPEN, AND NONE MOVED WHEN IT
     * CLOSED EITHER". That survives the ruling, so it is what this asserts now.
     *
     * ⚠ The Family A half is the part that must stay false: whatever happened to
     * these five, they did NOT end up on the dialog shell, which is the outcome
     * this suite was written to prevent. */
    const { StyleSheet } = require('react-native');
    const { tMomentCard } = require('../app/ui/tartariaKit');
    for (const n of HELD_B) {
      const code = codeOf(cmp(n));
      expect([n, code.includes('tModalCard')]).toEqual([n, false]);
      expect([n, code.includes('kit.modalScrim')]).toEqual([n, false]);
      expect([n, code.includes('tMomentCard')]).toEqual([n, true]);
    }
    // and the shell they took resolves to the values they all drew
    const flat = StyleSheet.flatten(tMomentCard()) as Record<string, unknown>;
    expect(flat.maxWidth).toBe(440);
    expect(flat.backgroundColor).toBe('#17150f');
    expect(flat.borderRadius).toBe(6);
    expect(flat.padding).toBe(20);
  });

  test('⚠⚠⚠ MissionComplete rims in a SEMANTIC PAIR, and neither half is swept', () => {
    /* ⚠ AND IT IS THE OPPOSITE WAY ROUND FROM WHAT I FIRST WROTE, which is worth
     * the correction rather than a quiet edit. I described the green as "the
     * modal saying you won". It is not: GREEN is the ORDINARY completion and the
     * brand GOLD is the escalation, applied by a `victory` variant that swaps the
     * rim, the kicker, the rule and the button together. So this file carries a
     * two-state card, not one rim — the least shell-like of the five, and another
     * reason forcing it onto Family A would cost more than an address change.
     * The kit's standing rule (and the owner's amendment behind it) is that
     * semantic colour is kept, so BOTH halves survive whatever is decided about
     * Family B's ground. Pinned so a later decision cannot take them along. */
    /* ⚠ RE-AIMED ON OTA-1777: the rim is a PARAMETER now, which is the strongest
     * possible form of this claim — a shell that hard-coded the brand gold could
     * not have taken this card at all, so the semantic colour is not merely
     * preserved, it is the reason the helper has an argument. */
    expect(codeOf(cmp('MissionCompleteModal'))).toContain("tMomentCard('#9ec96a')");
    expect(bodyOf(cmp('MissionCompleteModal'), 'cardVictory')).toContain("borderColor: '#c9a86a'");
    const code = codeOf(cmp('MissionCompleteModal'));
    expect(code).toContain('victory && styles.cardVictory');
    // the escalation is a SET, not one rim — it moves four things at once
    for (const k of ['kickerVictory', 'ruleVictory', 'btnVictory']) {
      expect([k, code.includes(k)]).toEqual([k, true]);
    }
    // and the four siblings have no such pair — this is one file's construction
    for (const n of HELD_B.filter((x) => x !== 'MissionCompleteModal')) {
      // they take the DEFAULT rim, which is the brand gold they each declared
      expect([n, codeOf(cmp(n)).includes('tMomentCard()')]).toEqual([n, true]);
      expect([n, codeOf(cmp(n)).includes('cardVictory')]).toEqual([n, false]);
    }
  });

  test('⚠⚠⚠ FAMILY B IS NOT "THE MOMENT FAMILY" — MissionStinger proves it', () => {
    /* The load-bearing observation. If Family B and "experiential" were the same
     * set, "the seven take the shell" would be a clean instruction. They are not:
     * `MissionStinger` is built exactly like the five held here and the SAME
     * ruling keeps it experiential. Construction does not track intent, so the
     * ground question and the beat question have to be answered separately. */
    /* ⚠ RE-AIMED ON OTA-1778: its backdrop is the kit's now (the owner asked for
     * `momentScrim` across all six), so the Family-B evidence moved to the CARD,
     * which is the half that still proves the point — it is built exactly like
     * the five and still refuses the shell. The scrim adoption sharpened the
     * observation rather than softening it: outer GEOMETRY is governed for
     * everything, and the SHELL is a separate question the ruling answered
     * differently for this file. */
    const stinger = cmp('MissionStingerModal');
    expect(codeOf(stinger)).toContain('style={kit.momentScrim}');
    expect(bodyOf(stinger, 'card')).toContain("backgroundColor: '#17150f'");
    expect(bodyOf(stinger, 'card')).toContain('borderRadius: 6');
    // experiential: takes neither shell's CARD
    expect(codeOf(stinger)).not.toContain('tModalCard');
    expect(codeOf(stinger)).not.toContain('tMomentCard');
  });

  test('⚠ the two experiential modals take no card, as ruled', () => {
    /* ⚠ "Untouched" was true until OTA-1778 governed the outer geometry. What
     * the ruling actually reserves is the CARD — the beat's own treatment — so
     * that is what this asserts. */
    for (const n of ['DiscoveryRevealModal', 'MissionStingerModal']) {
      expect([n, codeOf(cmp(n)).includes('tModalCard')]).toEqual([n, false]);
      expect([n, codeOf(cmp(n)).includes('kit.modalScrim')]).toEqual([n, false]);
    }
  });
});

// ═══ 3. THE CENSUS CLOSES TO TWO ═════════════════════════════════════════════
describe('what is left, and why each one is left', () => {
  test('⚠⚠ OTA-1765\'s predicate now names exactly two files', () => {
    const census = read('__tests__', 'ota1765TheShellElevenCopied.test.tsx');
    for (const [n] of ADOPTERS) {
      expect([n, census.includes(`'${n}.tsx',`)]).toEqual([n, false]);
    }
    for (const n of ['ApproachModal', 'KeyboardSafeCard']) {
      expect([n, census.includes(`'${n}.tsx',`)]).toEqual([n, true]);
    }
  });

  test('⚠⚠⚠ and NEITHER remainder is a backlog item — both have a stated reason', () => {
    /* The difference between "two left" and "two unfinished". ApproachModal has
     * no vertical scroll to absorb the ceiling (HOLD 4); KeyboardSafeCard is a
     * second shell whose height is measured from the real keyboard edge. Both
     * reasons are in the files, asserted rather than trusted. */
    /* ⚠ OTA-1777: `HOLD 4` became `GOVERNED EXCEPTION` when the owner ruled
     * *"leave it outside the shared shell ... document/govern the intentional
     * exception."* A hold is a question; a governed exception is an answer, and
     * the file has to say which it is or the next reader re-opens it. */
    expect(cmp('ApproachModal')).toContain('HELD OUT OF THE MODAL SWEEP');
    expect(cmp('ApproachModal')).toContain('GOVERNED EXCEPTION');
    expect(cmp('ApproachModal')).not.toContain('PENDING AN OWNER');
    expect(codeOf(cmp('KeyboardSafeCard'))).toContain('cardMaxHeight(vp)');
    expect(codeOf(cmp('KeyboardSafeCard'))).not.toContain("maxHeight: '85%'");
  });

  test('⚠⚠ the ratchet fell, and its ledger records the split rather than the total', () => {
    const gate = read('scripts', 'check-gold.mjs');
    const baseline = Number(/const BASELINE = (\d+);/.exec(gate)?.[1]);
    expect(Number.isFinite(baseline)).toBe(true);
    // ⚠ a CEILING, not 325 — a ratchet only moves down.
    expect(baseline).toBeLessThanOrEqual(325);
    expect(gate).toContain('OTA-1774');
    expect(gate).toContain('Family B');
  });
});

// ═══ 4. THE STRIPPER ═════════════════════════════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ comments are stripped, and the style reader isolates ONE style', () => {
    const src = cmp('DogOnboardingModal');
    expect(codeOf(src).length).toBeLessThan(src.length);
    expect(codeOf('/* maxWidth: 440 */ const a = 1;')).not.toContain('440');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
    // the ota1772 lesson: a one-line entry must not leak into the next
    expect(bodyOf(cmp('MissionCompleteModal'), 'card')).not.toContain('backdrop');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1774-two-of-the-seven'");
  });
});
