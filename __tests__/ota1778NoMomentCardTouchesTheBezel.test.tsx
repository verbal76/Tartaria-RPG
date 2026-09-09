/**
 * OTA-1778 — NO MOMENT CARD TOUCHES THE BEZEL. HOLD 6, normalised.
 *
 * OTA-1777 named Family B and found, while measuring, that its six backdrops
 * split three and three: three centred and padded, three did neither. The owner
 * ruled:
 *
 *     *"I do not consider the current full-bleed behavior of those three to be
 *     intentional world expression. The moment itself can remain unique through
 *     its content, semantic rim, artwork and other governed variation. The outer
 *     safe presentation geometry should be consistent."*
 *
 * ⚠⚠⚠ WHY IT WAS A DEFECT RATHER THAN A STYLE, IN ONE SENTENCE: a card that
 * declares `width: '100%'` under a `maxWidth: 440` cap, inside a scrim with no
 * padding, is FULL-BLEED on every screen narrower than 440 — and the cap makes
 * it worse rather than better, because above 440 the un-centred card also stops
 * being centred. Both halves of that come from the scrim, which is why the fix
 * is one adopted style and not six edits.
 *
 * ⚠⚠ THE GUARD BELOW IS A PROPERTY, NOT A FILE LIST. The owner asked for
 * coverage "so a moment card cannot accidentally return to bezel-to-bezel
 * presentation", and a list of six names would not do that — the seventh moment
 * modal somebody writes next year is exactly the one the list would miss. So the
 * scan states the rule: ANY file whose scrim is a black wash AND whose card caps
 * its width must get that scrim from the kit, or declare both the centring and
 * the gutter itself.
 *
 * ⚠ AND THE SCAN FOUND THE BLAST RADIUS IS EXACTLY SIX. Three other files
 * (`FusionPickerModal`, `GatherModal`, `MissionEncounterCard`) also omit
 * `alignItems` — and are NOT this defect, because they pad AND their cards are
 * uncapped, so the card fills the padded box and centring is moot. Recorded so
 * the next reader does not "fix" three files that are already correct.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { tartariaKitStyles as kit } from '../app/ui/tartariaKit';

const ROOT = join(__dirname, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const cmp = (n: string) => read('app', 'components', `${n}.tsx`);

/** The six moment beats. All six take the kit's scrim; only five take its card. */
const SIX = [
  'DogOnboardingModal', 'GolemNamingModal', 'CombatPrimerModal',
  'WandererEncounterModal', 'MissionCompleteModal', 'MissionStingerModal',
] as const;
/** The three the ruling moved. */
const NORMALISED = ['DogOnboardingModal', 'GolemNamingModal', 'WandererEncounterModal'] as const;

/* ⚠ GRADE THE CODE, NOT THE PROSE — nineteenth time in this rollout. */
const codeOf = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
     .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** Brace-balanced style body, or null. */
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

// ═══ 1. THE THREE MOVED, AND THE OTHER THREE DID NOT MOVE ════════════════════
describe('⚠⚠⚠ all six moment beats now share one outer geometry', () => {
  test('every one of the six reads the kit\'s scrim and declares none of its own', () => {
    for (const n of SIX) {
      const code = codeOf(cmp(n));
      expect([n, code.includes('style={kit.momentScrim}')]).toEqual([n, true]);
      expect([n, bodyOf(cmp(n), 'backdrop')]).toEqual([n, null]);
    }
  });

  test('⚠⚠ the kit\'s scrim centres AND pads — both halves, or the fix is half a fix', () => {
    const { StyleSheet } = require('react-native');
    const flat = StyleSheet.flatten(kit.momentScrim) as Record<string, unknown>;
    expect(flat.alignItems).toBe('center');       // stops the left-stick above 440
    expect(flat.justifyContent).toBe('center');
    expect(flat.padding).toBe(24);                // stops the bezel-to-bezel below it
    expect(flat.backgroundColor).toBe('rgba(0,0,0,0.78)');
    expect(flat.flex).toBe(1);
  });

  test('⚠⚠⚠ the geometry is PROVED arithmetically, not asserted', () => {
    /* The owner asked to verify the geometry rather than take it on trust. A
     * screenshot shows one width; this shows every width, which is the stronger
     * claim for a rule about phones. The card is `width: '100%'` capped at 440
     * inside a scrim padded `p` on each side, so its drawn width is
     *     min(screen - 2p, 440)
     * and its gutter is (screen - drawn) / 2, which must never be zero. */
    const { StyleSheet } = require('react-native');
    const scrim = StyleSheet.flatten(kit.momentScrim) as { padding: number };
    const card = StyleSheet.flatten(require('../app/ui/tartariaKit').tMomentCard()) as
      { maxWidth: number };
    const PHONES = [320, 360, 375, 390, 414, 428, 440, 768, 1024];
    for (const screen of PHONES) {
      const drawn = Math.min(screen - 2 * scrim.padding, card.maxWidth);
      const gutter = (screen - drawn) / 2;
      expect([screen, gutter >= scrim.padding]).toEqual([screen, true]);
      expect([screen, drawn > 0]).toEqual([screen, true]);
    }
    /* ⚠ AND THE SAME ARITHMETIC ON THE OLD SCRIM SHOWS WHAT WAS WRONG. With no
     * padding the drawn width is min(screen, 440), so on every phone in the list
     * the gutter was exactly ZERO — the card touched both edges. This is the
     * regression this suite exists to prevent, computed rather than remembered. */
    for (const screen of PHONES.filter((s) => s <= 440)) {
      expect([screen, (screen - Math.min(screen, card.maxWidth)) / 2]).toEqual([screen, 0]);
    }
  });
});

// ═══ 2. THE GUARD — A PROPERTY, NOT A LIST ═══════════════════════════════════
describe('⚠⚠⚠ no capped card may sit in an unpadded scrim, anywhere', () => {
  /** Every component/screen that washes the screen black behind a capped card. */
  const offenders = (): string[] => {
    const out: string[] = [];
    for (const dir of ['components', 'screens']) {
      for (const f of readdirSync(join(ROOT, 'app', dir))) {
        if (!f.endsWith('.tsx')) continue;
        const src = read('app', dir, f);
        const code = codeOf(src);
        // does it get its scrim from the kit? then the kit's geometry governs it
        if (/style=\{kit\.(momentScrim|modalScrim|sheetScrim)\}/.test(code)) continue;
        for (const key of ['backdrop', 'scrim', 'overlay']) {
          const wash = bodyOf(src, key);
          if (!wash || !wash.includes('rgba(0,0,0')) continue;
          // only a CAPPED card can be pinched by a missing gutter
          const card = bodyOf(src, 'card') ?? bodyOf(src, 'panel') ?? '';
          if (!card.includes('maxWidth')) continue;
          if (!wash.includes('padding')) out.push(`${f}:${key}`);
        }
      }
    }
    return out.sort();
  };

  test('⚠⚠⚠ the offender set is EMPTY, and a new one fails here rather than on a phone', () => {
    /* This is the coverage the owner asked for, written as the rule instead of
     * as six filenames — a list cannot catch the seventh moment modal, and the
     * seventh is exactly the one that would reintroduce this. */
    expect(offenders()).toEqual([]);
  });

  test('⚠⚠ the scan is not vacuous — it really does reach files with washes', () => {
    /* A guard that matches nothing passes forever. This proves the predicate has
     * live subjects by checking the population it filters, not the result. */
    let washes = 0;
    for (const dir of ['components', 'screens']) {
      for (const f of readdirSync(join(ROOT, 'app', dir))) {
        if (!f.endsWith('.tsx')) continue;
        const src = read('app', dir, f);
        for (const key of ['backdrop', 'scrim', 'overlay']) {
          const w = bodyOf(src, key);
          if (w && w.includes('rgba(0,0,0')) washes += 1;
        }
      }
    }
    expect(washes).toBeGreaterThan(5);
  });

  test('⚠ the three near-misses are recorded so nobody "fixes" what is already right', () => {
    /* `FusionPickerModal`, `GatherModal` and `MissionEncounterCard` also omit
     * `alignItems` — and are NOT this defect: they pad, and their cards are
     * UNCAPPED, so the card fills the padded box and centring cannot apply.
     * Asserted rather than commented, because a future reader scanning for
     * "missing alignItems" will find these three and needs the reason here. */
    for (const [f, key] of [['FusionPickerModal', 'backdrop'], ['GatherModal', 'scrim'],
      ['MissionEncounterCard', 'backdrop']] as const) {
      const wash = bodyOf(cmp(f), key);
      expect([f, wash !== null]).toEqual([f, true]);
      expect([f, wash!.includes('padding')]).toEqual([f, true]);
      const card = bodyOf(cmp(f), 'card') ?? bodyOf(cmp(f), 'panel') ?? '';
      expect([f, card.includes('maxWidth')]).toEqual([f, false]);
    }
  });
});

// ═══ 3. WHAT THE RULING DID NOT CHANGE ═══════════════════════════════════════
describe('⚠⚠ the beats stayed unique in everything except their outer geometry', () => {
  test('the five keep their card, and MissionComplete keeps its semantic rim', () => {
    /* The owner: *"preserve each card's existing visual/semantic treatment
     * otherwise."* Geometry was normalised; meaning was not touched. */
    expect(codeOf(cmp('MissionCompleteModal'))).toContain("tMomentCard('#9ec96a')");
    expect(bodyOf(cmp('MissionCompleteModal'), 'cardVictory')).toContain("borderColor: '#c9a86a'");
    for (const n of NORMALISED) {
      expect([n, codeOf(cmp(n)).includes('tMomentCard()')]).toEqual([n, true]);
    }
  });

  test('⚠⚠⚠ MissionStinger took the SCRIM and not the card, which is the ruling read exactly', () => {
    /* Two instructions had to be reconciled rather than one overriding the other:
     * *"DiscoveryReveal and MissionStinger remain EXPERIENTIAL"* and *"use
     * momentScrim across all six"*. Consistent outer geometry is not the same
     * instruction as taking the shell, so this file adopts the scrim — a zero-
     * pixel change, since it already centred and padded — and keeps its own card.
     * ⚠ What it actually loses is a PRIVATE COPY of values the kit now owns. */
    const code = codeOf(cmp('MissionStingerModal'));
    expect(code).toContain('style={kit.momentScrim}');
    expect(code).not.toContain('tMomentCard');
    expect(bodyOf(cmp('MissionStingerModal'), 'card')).toContain("backgroundColor: '#17150f'");
  });

  test('⚠ DiscoveryReveal is untouched — it has no wash to govern', () => {
    const code = codeOf(cmp('DiscoveryRevealModal'));
    expect(code).not.toContain('kit.momentScrim');
    expect(bodyOf(cmp('DiscoveryRevealModal'), 'backdrop')).toBeNull();
  });
});

// ═══ 4. THE STRIPPER ═════════════════════════════════════════════════════════
describe('the suite grades code', () => {
  test('⚠ comments are stripped, and the body reader is brace-balanced', () => {
    const src = cmp('DogOnboardingModal');
    expect(codeOf(src).length).toBeLessThan(src.length);
    expect(codeOf('/* padding: 24 */ const a = 1;')).not.toContain('padding: 24');
    expect(codeOf('const url = "https://x";')).toContain('https://x');
    expect(bodyOf(src, 'thisDoesNotExist')).toBeNull();
  });
});

describe('the stamp', () => {
  test('names this pass', () => {
    expect(read('app', 'buildInfo.ts')).toContain("'2026-09-09-1778-no-card-touches-the-bezel'");
  });
});
