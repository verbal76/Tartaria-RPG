/**
 * OTA-1775 — THE COMBAT CHIP VOCABULARY, WRITTEN DOWN AND ENFORCED.
 *
 * The owner, on the combat action colours: *"Trace/reconcile why APPROACH, STEP
 * BACK, THROW SPEAR use the tan/gold treatment while DODGE, STEALTH, FLEE use
 * blue, and GOLEM, BANDOLIER, HEALS use green. Determine whether these
 * differences encode intentional semantic/action categories or are legacy/ad-hoc
 * styling. Do not preserve different colors merely because the old UI happened to
 * use them. If semantic, document exactly what each family means."*
 *
 * ⚠⚠⚠ THE ANSWER IS SEMANTIC, AND THE GROUPING IS NOT THE ONE IN THE QUESTION.
 * There are FIVE tones and a neutral default, not three colour families:
 *
 *   (no tone)        the default chip — the ABSENCE of a claim
 *   strike           FILLED sage · this weapon lands from where you stand
 *   ready            sage BORDER  · available modifier or setup tool
 *   defensive        blue         · defensive or escape
 *   needs-approach   amber        · cannot land from HERE (reach, not availability)
 *   unavailable      red          · cannot be used at all
 *
 * So the "tan family" the question names is the DEFAULT CHIP: STEP BACK and
 * THROW SPEAR pass no tone at all, and APPROACH passes one only while it is out
 * of range. Nothing there is legacy styling — the owner's *"do not preserve
 * different colors merely because the old UI happened to use them"* does not
 * bite, because no third colour was ever chosen for those three.
 *
 * ⚠⚠ THIS PASS IS DOCUMENTATION AND ENFORCEMENT, NOT A RESTYLE. Not one pixel
 * moves. What changes is that the vocabulary now lives beside the type it
 * describes, and this suite fails if a later pass paints a chip a colour the
 * vocabulary does not name.
 *
 * ⚠ AND ONE THING IS RECORDED RATHER THAN FIXED: an unclassified chip is
 * indistinguishable from a chip nobody has thought about. Giving STEP BACK and
 * THROW SPEAR a tone would change what the player sees, so it belongs with the
 * weapon-button composition decision, not with a documentation pass.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const BOX = read('app', 'components', 'InputBox.tsx');

/* ⚠ GRADE THE CODE, NOT THE PROSE — sixteenth time in this rollout, and this
 * file is the sharpest case yet: the vocabulary comment NAMES every tone and
 * every colour role the assertions below are about. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const CODE = codeOf(BOX);
const bodyOf = (key: string): string =>
  new RegExp(`\\n {2}${key}: \\{([^}]*)\\}`).exec(CODE)?.[1] ?? '';

/** The vocabulary, as the type declares it. */
const TONES = ['strike', 'ready', 'needs-approach', 'defensive', 'unavailable'] as const;

// ═══ 1. THE VOCABULARY IS CLOSED ═════════════════════════════════════════════
describe('⚠⚠⚠ five tones and a default — no sixth colour has crept in', () => {
  test('the type names exactly these five', () => {
    const decl = /type QuickBtnTone = ([^;]+);/.exec(CODE)?.[1] ?? '';
    expect(decl).not.toBe('');
    const named = [...decl.matchAll(/'([\w-]+)'/g)].map((m) => m[1]!).sort();
    expect(named).toEqual([...TONES].sort());
  });

  test('⚠⚠ every tone has BOTH a container style and a text style, and no orphans', () => {
    /* A tone with a container and no text style paints a rim nobody can read
     * against; a text style with no container is dead code that will be
     * "restored" by the next person who greps for it. */
    const styleName = (t: string) =>
      'quick' + t.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
    for (const t of TONES) {
      const n = styleName(t);
      expect([t, bodyOf(n) !== '']).toEqual([t, true]);
      expect([t, bodyOf(`${n}Text`) !== '']).toEqual([t, true]);
      // and the resolver actually maps the tone to both
      expect([t, CODE.includes(`resolvedTone === '${t}' && styles.${n},`)]).toEqual([t, true]);
      expect([t, CODE.includes(`resolvedTone === '${t}' && styles.${n}Text,`)]).toEqual([t, true]);
    }
  });
});

// ═══ 2. WHAT EACH FAMILY MEANS, ASSERTED AS A RELATIONSHIP ═══════════════════
describe('⚠⚠⚠ the families mean what the vocabulary says they mean', () => {
  /* ⚠⚠⚠ SUPERSEDED IN PART BY THE OWNER, 2026-09-10, AND THE SUPERSESSION IS
   * WRITTEN DOWN RATHER THAN QUIETLY EDITED IN. This suite shipped saying
   * *"strike is the only FILLED chip"*, and that sentence was true of the
   * pixels it was written against. The owner then ruled: *"KEEP THE EQUIPPED
   * WEAPON CONTROL DARK... DARK BODY = THIS IS MY EQUIPPED WEAPON."* The
   * equipped weapon is a thing you are carrying, not an offer; a bright block
   * was announcing it as an offer.
   *
   * ⚠⚠ WHAT SURVIVES IS THE AXIS, WHICH IS THE PART THAT WAS EVER LOAD-BEARING.
   * OTA-1454's ruling was *"in a restricted palette you do not spend a colour on
   * rank, you spend WEIGHT"* — one hue, told apart by fill rather than by
   * inventing a sixth colour. That is still exactly how these two are told
   * apart; only the weapon's POSITION on the axis moved. Strike now wears
   * `styles.quick`'s own plain chassis ground, ready keeps its green-tinted
   * dark, and the decisive weight moved into the type. The two tests below are
   * the same two claims re-asserted against where the axis actually runs, so a
   * later pass still cannot collapse the groups into one another. */
  test('strike and ready are ONE hue told apart by fill — the axis, not the position', () => {
    const strike = bodyOf('quickStrike');
    const ready = bodyOf('quickReady');
    const bg = (body: string) => /backgroundColor: '(#[0-9a-fA-F]{6})'/.exec(body)?.[1];
    const border = /borderColor: '(#[0-9a-fA-F]{6})'/.exec(strike)?.[1];
    expect(border).toBeDefined();
    expect(ready).toContain(`borderColor: '${border}'`);           // same hue
    // ...and still two distinguishable groups, which is the thing that matters.
    expect(bg(strike)).toBeDefined();
    expect(bg(ready)).toBeDefined();
    expect(bg(strike)).not.toBe(bg(ready));
    // ⚠ strike takes the CHASSIS ground — the plain background every ordinary
    // chip already wears — so it reads as the object you are carrying rather
    // than as an offer. That is the owner's ruling, pinned to its source rather
    // than to a hex, so re-tuning the chassis carries the weapon with it.
    expect(bg(strike)).toBe(bg(bodyOf('quick')));
  });

  test('⚠⚠ and the lettering READS against the body it sits on, whichever way round', () => {
    /* The original claim was "the fill carries INVERTED lettering", which was
     * the dark-on-light half of a mechanism that no longer runs that way. The
     * requirement underneath it never depended on the direction: a chip whose
     * label does not separate from its own ground is unreadable, and that is
     * true of light-on-dark exactly as it was of dark-on-light. Asserted as a
     * contrast floor so it survives the next repaint in either direction. */
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      return 0.299 * r! + 0.587 * g! + 0.114 * b!;
    };
    const fill = /backgroundColor: '(#[0-9a-fA-F]{6})'/.exec(bodyOf('quickStrike'))?.[1];
    const ink = /color: '(#[0-9a-fA-F]{6})'/.exec(bodyOf('quickStrikeText'))?.[1];
    expect(fill).toBeDefined();
    expect(ink).toBeDefined();
    expect(Math.abs(lum(ink!) - lum(fill!))).toBeGreaterThan(80);
  });

  test('⚠⚠ the decisive weight the fill used to carry now lives in the TYPE', () => {
    /* OTA-1454 spends WEIGHT, not colour, and taking the fill away would have
     * spent nothing at all if the weight went with it. It did not: the strike
     * label is the only chip label in the vocabulary set in bold. */
    expect(bodyOf('quickStrikeText')).toContain("fontWeight: '700'");
    for (const other of ['quickReadyText', 'quickDefensiveText', 'quickNeedsApproachText', 'quickUnavailableText']) {
      expect([other, bodyOf(other).includes('fontWeight')]).toEqual([other, false]);
    }
  });

  test('⚠ defensive, needs-approach and unavailable are each their own hue', () => {
    /* Three distinct meanings — escape, out of reach, refused — so three
     * distinct colours, and none of them may collide with another's. */
    const hue = (k: string) => /borderColor: '(#[0-9a-fA-F]{6})'/.exec(bodyOf(k))?.[1];
    const d = hue('quickDefensive');
    const n = hue('quickNeedsApproach');
    const u = hue('quickUnavailable');
    for (const h of [d, n, u]) expect(h).toBeDefined();
    expect(new Set([d, n, u]).size).toBe(3);
    // and none of them is the sage that means "available"
    const sage = hue('quickReady');
    expect([d, n, u]).not.toContain(sage);
  });

  test('⚠⚠ DODGE, STEALTH and FLEE really are the defensive family', () => {
    /* Read off the call sites rather than trusted. `defensive` is passed as a
     * boolean prop that the resolver maps to the tone, which is why grepping for
     * `tone="defensive"` finds nothing and the claim has to be made this way. */
    for (const label of ['"dodge"', '"stealth"', '"flee"']) {
      const at = CODE.indexOf(`label=${label}`);
      const dyn = CODE.indexOf('label={fleeOddsPct === null');
      expect([label, at >= 0 || dyn >= 0]).toEqual([label, true]);
    }
    expect(CODE).toMatch(/label="dodge"[\s\S]{0,120}?defensive/);
    expect(CODE).toMatch(/label="stealth"[\s\S]{0,80}?defensive/);
    expect(CODE).toMatch(/label=\{fleeOddsPct[\s\S]{0,120}?defensive/);
    expect(CODE).toContain("tone ?? (defensive ? 'defensive' : undefined)");
  });

  test('⚠⚠ the golem, bandolier and heals really are the READY family', () => {
    for (const frag of ['use golem', 'bandolier (', 'heals (']) {
      const i = CODE.indexOf(frag);
      expect([frag, i]).not.toEqual([frag, -1]);
      // the chip that carries it passes tone="ready" within the same element
      const around = CODE.slice(Math.max(0, i - 400), i + 400);
      expect([frag, around.includes('tone="ready"')]).toEqual([frag, true]);
    }
  });

  test('⚠⚠⚠ APPROACH wears the reach tone ONLY while out of reach', () => {
    /* The single most load-bearing observation in the whole trace, and the reason
     * the answer is "semantic" rather than "three families": APPROACH is not
     * painted amber because it belongs to an amber group. It is painted by the
     * PROBLEM it exists to solve, and it is the default chip when you are
     * already close. */
    expect(CODE).toMatch(
      /label="approach"[\s\S]{0,200}?tone=\{range && range !== 'close' \? 'needs-approach' : undefined\}/,
    );
  });
});

// ═══ 3. THE THING THAT IS RECORDED RATHER THAN FIXED ═════════════════════════
describe('⚠⚠ the unclassified chips are named, so they are not mistaken for a family', () => {
  test('STEP BACK and THROW SPEAR pass no tone at all', () => {
    /* ⚠ THIS TEST IS EXPECTED TO DIE. It pins today's truth so that the day
     * someone classifies these two, the change is deliberate and visible rather
     * than incidental — the same shape as OTA-1760's placeholder-gold pin, which
     * failed the day the defect was fixed and that was the point. */
    const stepBack = /<QuickBtn label="step back"[^/]*\/>/.exec(CODE)?.[0] ?? '';
    expect(stepBack).not.toBe('');
    expect(stepBack).not.toContain('tone=');
    expect(stepBack).not.toContain('defensive');
    const throwSpear = /<QuickBtn label="throw spear"[\s\S]{0,200}?\/>/.exec(CODE)?.[0] ?? '';
    expect(throwSpear).not.toBe('');
    expect(throwSpear).not.toContain('tone=');
    expect(throwSpear).not.toContain('defensive');
  });

  test('⚠ and the default chip is a real, deliberate style — not a missing one', () => {
    const quick = bodyOf('quick');
    expect(quick).toContain("backgroundColor: '#1a1714'");
    expect(quick).toContain("borderColor: '#3a342c'");
    expect(bodyOf('quickText')).toContain('color:');
  });
});

// ═══ 4. IT IS WRITTEN WHERE THE NEXT READER WILL BE ══════════════════════════
describe('⚠ the documentation is beside the type, not in a commit message', () => {
  test('the vocabulary block names every tone and its meaning', () => {
    /* ⚠ Matched on the tone NAMES and short fragments that cannot wrap. OTA-1769
     * learned that asserting a whole sentence grades the formatter's line
     * breaks, which is the smaller cousin of grading the prose. */
    expect(BOX).toContain('THE COMBAT CHIP VOCABULARY');
    for (const t of TONES) expect([t, BOX.includes(`'${t}'`)]).toEqual([t, true]);
    expect(BOX).toContain('ABSENCE of a claim');
    expect(BOX).toContain('OTA-1454');
  });
});

// ═══ 5. THE STRIPPER ═════════════════════════════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ comments are stripped, or the vocabulary block satisfies its own tests', () => {
    expect(CODE.length).toBeLessThan(BOX.length * 0.8);
    expect(codeOf("/* tone=\"ready\" */ const a = 1;")).not.toContain('ready');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1775-the-chip-vocabulary'");
  });
});
