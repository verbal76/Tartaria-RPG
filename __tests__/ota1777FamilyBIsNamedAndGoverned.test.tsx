/**
 * OTA-1777 — FAMILY B IS NAMED AND GOVERNED. The modal sweep, finished.
 *
 * OTA-1774 could not execute the owner's "the other seven take the standard
 * shell" literally, because five of the seven are a second lineage and forcing
 * them onto Family A would have restyled five beats. The ruling:
 *
 *     *"Name and govern Family B as a legitimate second shell. Do not force
 *     those five experiential beats onto Family A and restyle them merely for
 *     uniformity. The kit governs interface, not world expression."*
 *
 * ⚠⚠⚠ SO THERE ARE TWO SHELLS ON PURPOSE, AND THEY MEAN DIFFERENT THINGS:
 *   `tModalCard`  — a DIALOG.  You are being asked something.
 *   `tMomentCard` — a BEAT.    Something happened to you.
 * The deeper scrim and the warmer, rounder, roomier card are the difference
 * between a quantity picker and a mission ending. That is the product, not debt.
 *
 * ⚠⚠ THE RIM IS A PARAMETER, AND THAT IS THE STRONGEST FORM OF THE SEMANTIC
 * RULE. Five of six cards are byte-identical; `MissionCompleteModal` rims in the
 * success green. A shell that hard-coded the brand gold could not have taken
 * that card AT ALL — so the semantic colour is not merely preserved here, it is
 * the reason the helper has an argument.
 *
 * ⚠⚠⚠ AND MEASURING THE BACKDROPS FOUND SOMETHING THE CARD MEASUREMENT HID.
 * Brace-balanced across all six files, the scrims split THREE AND THREE:
 *     CombatPrimer · MissionComplete · MissionStinger
 *         flex 1 · 0.78 · alignItems center · justifyContent center · padding 24
 *     DogOnboarding · GolemNaming · WandererEncounter
 *         flex 1 · 0.78 · justifyContent center      ← no centring, no gutter
 * That is not formatting. Without `alignItems: 'center'` a card declaring
 * `width: '100%'` under a 440 cap sits at the START of the cross axis; without
 * `padding: 24` it runs to the bezel on any screen narrower than 440, which is
 * every phone this game ships on. So three moment cards are full-bleed and three
 * have a 24pt gutter — and only the ones that already draw the padded scrim
 * adopt it here. Moving the other three would be changing three beats on my own
 * judgement, which is the thing the ruling forbids. HOLD 6.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { T, tMomentCard, tModalCard, tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const cmp = (n: string) => read('app', 'components', `${n}.tsx`);
const KIT = read('app', 'ui', 'tartariaKit.tsx');

/** All five adopt the CARD. */
const CARD_ADOPTERS = [
  'DogOnboardingModal', 'GolemNamingModal', 'CombatPrimerModal',
  'WandererEncounterModal', 'MissionCompleteModal',
] as const;
/** Only these already drew the padded, centred backdrop, so only these adopt it. */
const SCRIM_ADOPTERS = ['CombatPrimerModal', 'MissionCompleteModal'] as const;
/** Full-bleed today. Reported, not moved. */
const SCRIM_HELD = ['DogOnboardingModal', 'GolemNamingModal', 'WandererEncounterModal'] as const;

/* ⚠ GRADE THE CODE, NOT THE PROSE — eighteenth time in this rollout. The header
 * prints every hex, radius and padding the assertions below are about. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** Brace-balanced style body — a one-line entry must not leak into the next
 *  (ota1772), and a multi-line one must not stop at a nested brace. */
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

// ═══ 1. TWO SHELLS, AND THEY ARE NOT VARIANTS ════════════════════════════════
describe('⚠⚠⚠ the kit carries two modal shells, deliberately', () => {
  test('the moment card resolves to what all six files drew', () => {
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(tMomentCard())).toEqual({
      width: '100%',
      maxWidth: 440,
      backgroundColor: '#17150f',
      borderWidth: 1,
      borderColor: T.gold,
      borderRadius: 6,
      padding: 20,
    });
  });

  test('⚠⚠ and it differs from the DIALOG shell in every property that matters', () => {
    /* If these two ever converge, one of them has stopped meaning anything.
     * Asserted as a set of DIFFERENCES rather than as two value lists, so a
     * re-tune of either keeps the claim as long as they stay distinct. */
    const { StyleSheet } = require('react-native');
    const beat = StyleSheet.flatten(tMomentCard()) as Record<string, unknown>;
    const dialog = StyleSheet.flatten(tModalCard(380)) as Record<string, unknown>;
    for (const k of ['backgroundColor', 'borderRadius', 'padding', 'maxWidth']) {
      expect([k, beat[k] === dialog[k]]).toEqual([k, false]);
    }
    // and the scrims differ too — the beat's is deeper
    const alpha = (s: string) => Number(/rgba\([^)]*?,([\d.]+)\)/.exec(s)?.[1]);
    const beatScrim = StyleSheet.flatten(kit.momentScrim) as Record<string, string>;
    const dialogScrim = StyleSheet.flatten(kit.modalScrim) as Record<string, string>;
    expect(alpha(beatScrim.backgroundColor!)).toBeGreaterThan(alpha(dialogScrim.backgroundColor!));
  });

  test('⚠⚠⚠ the RIM IS A PARAMETER, which is what lets a card keep a meaning', () => {
    /* The kit owns MATERIAL, never MEANING. `MissionCompleteModal` rims in the
     * success green; a hard-coded gold would have made that card unshellable,
     * and normalising it would have deleted the meaning the owner's amendment
     * reserves. So the argument is not a convenience — it is the rule, expressed
     * in a signature. */
    const { StyleSheet } = require('react-native');
    expect((StyleSheet.flatten(tMomentCard('#9ec96a')) as Record<string, unknown>).borderColor)
      .toBe('#9ec96a');
    expect((StyleSheet.flatten(tMomentCard()) as Record<string, unknown>).borderColor)
      .toBe(T.gold);
    // the card style itself declares NO rim — or the parameter would be a lie
    expect(bodyOf(KIT, 'momentCard')).not.toContain('borderColor');
    // and the kit still does not own the green
    expect(codeOf(KIT)).not.toContain('#9ec96a');
  });
});

// ═══ 2. THE FIVE ADOPTED, AND NOTHING MOVED ══════════════════════════════════
describe('the five beats took the shell', () => {
  test('⚠⚠ every one reaches the kit and none kept a private card', () => {
    for (const n of CARD_ADOPTERS) {
      const code = codeOf(cmp(n));
      expect([n, code.includes('tMomentCard')]).toEqual([n, true]);
      expect([n, bodyOf(cmp(n), 'card')]).toEqual([n, null]);
      // and none of them ended up on the DIALOG shell, which is the outcome
      // OTA-1774 was written to prevent
      expect([n, code.includes('tModalCard')]).toEqual([n, false]);
    }
  });

  test('⚠⚠⚠ MissionComplete passes its rim; the other four take the default', () => {
    expect(codeOf(cmp('MissionCompleteModal'))).toContain("tMomentCard('#9ec96a')");
    for (const n of CARD_ADOPTERS.filter((x) => x !== 'MissionCompleteModal')) {
      expect([n, codeOf(cmp(n)).includes('tMomentCard()')]).toEqual([n, true]);
    }
  });

  test('⚠⚠ MissionComplete\'s victory escalation survived intact', () => {
    /* Its card is a PAIR: green for the ordinary completion, brand gold for the
     * victory, swapping rim, kicker, rule and button together. The composition
     * had to survive the shell taking the base — `[CARD, victory && ...]`. */
    const code = codeOf(cmp('MissionCompleteModal'));
    expect(code).toContain('style={[CARD, victory && styles.cardVictory]}');
    expect(bodyOf(cmp('MissionCompleteModal'), 'cardVictory')).toContain("borderColor: '#c9a86a'");
    for (const k of ['kickerVictory', 'ruleVictory', 'btnVictory']) {
      expect([k, code.includes(k)]).toEqual([k, true]);
    }
  });
});

// ═══ 3. THE SCRIM SPLIT — REPORTED, NOT SETTLED ══════════════════════════════
describe('⚠⚠⚠ three backdrops adopted and three are held, and the reason is visible', () => {
  test('the two of the five that already drew it now read the kit', () => {
    for (const n of SCRIM_ADOPTERS) {
      expect([n, codeOf(cmp(n)).includes('kit.momentScrim')]).toEqual([n, true]);
      expect([n, bodyOf(cmp(n), 'backdrop')]).toEqual([n, null]);
    }
  });

  test('⚠⚠⚠ the other three still declare a backdrop that neither centres nor pads', () => {
    /* THE FINDING. Not a formatting difference — a layout one. These three cards
     * run to the bezel on any phone narrower than 440 while their three siblings
     * get a 24pt gutter, and above 440 they sit left rather than centred.
     * Asserted as the ABSENCE of the two properties rather than as the string,
     * so a reformat cannot fake a pass. */
    for (const n of SCRIM_HELD) {
      const b = bodyOf(cmp(n), 'backdrop');
      expect([n, b === null]).toEqual([n, false]);
      expect([n, b!.includes('rgba(0,0,0,0.78)')]).toEqual([n, true]);
      expect([n, b!.includes('alignItems')]).toEqual([n, false]);
      expect([n, b!.includes('padding')]).toEqual([n, false]);
      expect([n, codeOf(cmp(n)).includes('kit.momentScrim')]).toEqual([n, false]);
    }
  });

  test('⚠⚠ the kit\'s scrim IS the padded, centred one — the held three would change', () => {
    /* Which is exactly why they did not adopt. Stated as an assertion so the
     * next reader does not have to re-derive why three files half-adopted. */
    const { StyleSheet } = require('react-native');
    expect(StyleSheet.flatten(kit.momentScrim)).toEqual({
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.78)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    });
    expect(KIT).toContain('HOLD 6');
  });
});

// ═══ 4. WHAT STAYED OUT, AND WHY ═════════════════════════════════════════════
describe('⚠⚠ the exceptions are governed rather than merely skipped', () => {
  test('⚠⚠⚠ MissionStinger is Family B by construction and STILL stays out', () => {
    /* The sharpest thing in this pass. `MissionStinger` is built exactly like
     * the five — same scrim, same card — and the owner's ruling keeps it
     * EXPERIENTIAL, so it keeps a private copy of values the kit now owns.
     * That looks like an oversight and is not: construction does not track
     * intent, and the ruling was about the beat, not the bytes. Pinned so
     * nobody "finishes the job" by sweeping it in. */
    const code = codeOf(cmp('MissionStingerModal'));
    expect(code).not.toContain('tMomentCard');
    expect(code).not.toContain('kit.momentScrim');
    expect(bodyOf(cmp('MissionStingerModal'), 'card')).toContain("backgroundColor: '#17150f'");
    expect(bodyOf(cmp('MissionStingerModal'), 'backdrop')).toContain('padding: 24');
  });

  test('⚠ DiscoveryReveal is untouched too, and has no shell at all', () => {
    const code = codeOf(cmp('DiscoveryRevealModal'));
    expect(code).not.toContain('tMomentCard');
    expect(code).not.toContain('tModalCard');
  });

  test('⚠⚠⚠ ApproachModal is a GOVERNED EXCEPTION now, not an open hold', () => {
    /* The owner: *"Leave it outside the shared shell. Do not introduce
     * scrolling/chip behavior changes merely to make it qualify for the
     * primitive. Document/govern the intentional exception."*
     * A hold is a question and a governed exception is an answer; a file that
     * still says "pending" invites the question to be re-opened. */
    const src = cmp('ApproachModal');
    expect(src).toContain('GOVERNED EXCEPTION');
    expect(src).not.toContain('PENDING AN OWNER');
    // and the rule it records is general, not a note about one file
    expect(src).toContain('yield to the shell');
    // pixels still its own, which is the whole point of the exception
    const code = codeOf(src);
    expect(code).toContain("scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)'");
    expect(code).not.toContain('tModalCard');
  });
});

// ═══ 5. THE LEDGER ═══════════════════════════════════════════════════════════
describe('the ratchet moved and says why', () => {
  test('⚠ four more rim golds left, and the ledger records the parameter', () => {
    const gate = read('scripts', 'check-gold.mjs');
    const baseline = Number(/const BASELINE = (\d+);/.exec(gate)?.[1]);
    expect(Number.isFinite(baseline)).toBe(true);
    expect(baseline).toBeLessThanOrEqual(321);   // ⚠ a ceiling, not the number
    expect(gate).toContain('OTA-1777');
    expect(gate).toContain('SEMANTIC green');
  });
});

// ═══ 6. THE STRIPPER ═════════════════════════════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ comments are stripped, and the body reader is brace-balanced', () => {
    expect(codeOf(KIT).length).toBeLessThan(KIT.length * 0.7);
    expect(codeOf('/* padding: 24 */ const a = 1;')).not.toContain('padding: 24');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
    // a one-line entry must not leak into the next (ota1772's lesson)
    expect(bodyOf(KIT, 'momentCard')).not.toContain('momentScrim');
    // and a missing key is null rather than an empty string that reads as "clean"
    expect(bodyOf(KIT, 'thisStyleDoesNotExist')).toBeNull();
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1777-family-b-is-named'");
  });
});
