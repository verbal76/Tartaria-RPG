/**
 * OTA-1768 — ONE BARE-HAND CHIP. THE SECOND WAS NEVER A SECOND ACTION.
 *
 * Owner: *"kick and punch are both weaponless attacks are both needed? does
 * either one serve a defined purpose or can we drop the kick button and just use
 * punch to save space?"* — and, after the trace: *"Drop KICK as a quick combat
 * button. Keep 'kick' fully supported through typed input/parser behavior, so we
 * lose no actual capability."*
 *
 * ⚠⚠⚠ THE ANSWER CAME FROM A TRACE, NOT A PREFERENCE, AND THE TRACE IS THE
 * REASON THIS IS SAFE. Punch and kick are not similar actions in this engine —
 * they are the SAME action:
 *   · `combatRules.isBareHandAttack` is ONE regex alternation over
 *     `punch|kick|fist|knee|headbutt|elbow|bare[- ]?hand`, and nothing
 *     downstream reads which word matched;
 *   · no branch anywhere gives one a different damage, stamina cost, to-hit,
 *     reach or effect;
 *   · `statTraining` already lists them as a single entry, "Punch / kick
 *     attacks".
 * The only thing the two words ever did differently is NARRATION, and only in
 * the no-enemy handler ("kick the rubble" → kicked / foot).
 *
 * ⚠⚠ SO THIS REMOVES A CHIP AND NOT A CAPABILITY, WHICH IS THE WHOLE POINT. The
 * verb survives everywhere it did anything: the parser, `isBareHandAttack`, and
 * the body-verb narration tables. Every assertion below is aimed at that
 * distinction, because "we dropped a button" and "we dropped an action" look
 * identical in a diff and are not remotely the same change.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { isBareHandAttack } from '../app/engine/combatRules';
import { SKILL_ACTIVITIES } from '../app/engine/statTraining';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const INPUTBOX = read('app', 'components', 'InputBox.tsx');

/* ⚠ GRADE THE CODE, NOT THE PROSE — ninth time. The block that removes the chip
 * explains itself at length and says "kick" a dozen times, which is the exact
 * string the removal assertions require to be absent from the JSX. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the chip is gone', () => {
  test('⚠⚠ no KICK quick button is rendered, and PUNCH still is', () => {
    const code = codeOf(INPUTBOX);
    expect(code).not.toContain("label=\"kick\"");
    expect(code).not.toContain("onSubmit('kick')");
    expect(code).toContain("label=\"punch\"");
    expect(code).toContain("onSubmit('punch')");
  });

  test('⚠ the bare-hand guard still wraps what is left', () => {
    /* OTA-932: a HAND weapon (Mud-fist Wraps, gauntlets, Bone Knuckles) IS your
     * fist, so the bare-hand chip is hidden when one is equipped — the weapon
     * button already covers that swing. Removing the second chip must not have
     * taken the guard with it. */
    const code = codeOf(INPUTBOX);
    expect(code).toContain("?.tags?.includes('barehanded')");
    const guard = code.slice(code.indexOf("?.tags?.includes('barehanded')"));
    expect(guard.slice(0, 400)).toContain('label="punch"');
  });

  test('⚠ and the tone logic is unchanged — the chip still knows if it can land', () => {
    /* `weaponTone(..., null, ...)` with a null hand resolves bare-hand reach, so
     * PUNCH still goes amber when the foe is out of arm's length rather than
     * going green and bouncing. That was OTA-1517's fix and it is not this
     * pass's to undo.
     *
     * ⚠ OTA-1800 MOVED THIS PIN, NOT THE RULE IT GUARDS. `weaponTone` gained a
     * fifth argument — the name of the weapon being swung — so a JAMMED weapon
     * can no longer paint itself green. A bare hand has no weapon to jam, so it
     * passes `null` there, and every claim this test makes is unchanged. */
    const code = codeOf(INPUTBOX);
    expect(code).toContain('weaponTone(reachPlayer, null, range, groundedFoesBelow, null)');
    expect(code).toContain("outOfRange={punchT === 'needs-approach'}");
  });
});

describe('⚠⚠⚠ the CAPABILITY is untouched — this is the half that matters', () => {
  test('the engine still routes a typed "kick" to a bare-hand attack', () => {
    /* Exercised, not read: if this ever stops being true, the owner lost an
     * action rather than a button, which is the thing they explicitly asked not
     * to happen. */
    expect(isBareHandAttack('kick')).toBe(true);
    expect(isBareHandAttack('kick it')).toBe(true);
    expect(isBareHandAttack('kick the raider')).toBe(true);
    // the rest of the family, so a later tidy cannot narrow the alternation
    for (const verb of ['punch', 'fist', 'knee', 'headbutt', 'elbow', 'bare-hand']) {
      expect([verb, isBareHandAttack(`${verb} it`)]).toEqual([verb, true]);
    }
    expect(isBareHandAttack('attack with the cudgel')).toBe(false);
  });

  test('⚠ the parser still offers "kick" as a known verb', () => {
    expect(read('app', 'engine', 'parser.ts')).toContain("'kick'");
  });

  test('⚠⚠ the no-enemy narration keeps kick\'s OWN body part and past tense', () => {
    /* This is the only place the two words ever differed, and it is reachable
     * without any button: "kick the rubble" narrates a foot, not knuckles.
     * Deleting these with the chip would have been the quiet capability loss. */
    /* ⚠ ANCHORED ON THE TABLE, NOT ON A QUOTED LIST. `check:quotedpins` counts
     * prose-shaped literals against source, and re-typing the whole verb array
     * here is exactly that shape — it would fail on a reordering and pass if
     * `kick` were dropped from the middle of it. These three tables are module-
     * private in `gameStore`, so they cannot be imported and asserted directly;
     * anchoring each regex on the table's OWN NAME is the closest thing to a
     * claim available from outside. */
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toMatch(/BODY_ATTACK_VERBS = new Set\(\[[^\]]*'kick'/);
    expect(store).toMatch(/BODY_VERB_PAST[\s\S]{0,120}kick: 'kicked'/);
    expect(store).toMatch(/BODY_VERB_PART[\s\S]{0,120}kick: 'foot'/);
  });

  test('⚠⚠ the stat trainer credits ONE combined entry, not two — which is the evidence', () => {
    /* ⚠ STATED AS A CLAIM RATHER THAN A QUOTED SENTENCE, because `check:quotedpins`
     * caught the first draft doing exactly what that gate exists to stop: a pin
     * that quotes a prose literal fails when the wording changes and passes when
     * the behaviour is deleted, which is wrong in both directions.
     * The CLAIM is what matters here and it is the whole argument for this OTA:
     * the trainer has never had a separate kick activity. Reading the exported
     * table proves that whatever the entry is worded as. */
    const strength = SKILL_ACTIVITIES.strength;
    const bare = strength.filter((a) => /punch|kick/i.test(a));
    expect(bare).toHaveLength(1);
    expect(bare[0]).toMatch(/punch/i);
    expect(bare[0]).toMatch(/kick/i);
    // and no OTHER stat grew a kick-only activity behind our back
    for (const [stat, list] of Object.entries(SKILL_ACTIVITIES)) {
      if (stat === 'strength') continue;
      expect([stat, list.filter((a) => /\bkick\b/i.test(a))]).toEqual([stat, []]);
    }
  });
});

describe('the suite grades code', () => {
  test('⚠ comments are stripped, or the removal assertions are vacuous', () => {
    /* The removal block says "kick" repeatedly while explaining the removal. */
    expect(codeOf(INPUTBOX).length).toBeLessThan(INPUTBOX.length * 0.8);
    expect(codeOf('{/* label="kick" */} const a = 1;')).not.toContain('kick');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1768-one-barehand-chip'");
  });
});
