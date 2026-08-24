/**
 * OTA-1468 — A GUARDIAN MUST NOT INVENT THE PLAYER'S HISTORY.
 *
 * ⚠⚠⚠ TWO LINES ON THE VORONOV CANTOR, both fixed strings, both asserting how
 * far along the player was — to every player, at every point in the run:
 *
 *   approachLine  "The Order has watched five Capitals fall to you"
 *   defeatLine    "...so. The last seat. The Order... is done."
 *
 * From the owner's 2026-08-23 log, where he took Voronov SECOND:
 *
 *   23:50:18  "The Order has watched five Capitals fall to you"     ← he had ONE
 *   23:52:16  "...so. The last seat. The Order... is done."
 *   23:52:16  The Voronov Core acknowledges your blood. 7 Cores still to recover.
 *
 * A dying high priest declaring the Order finished, immediately followed by the
 * game counting seven Cores still out there.
 *
 * ⚠⚠ THE OPPOSITE CONCLUSION FROM OTA-1467, ON PURPOSE. There, a number in the
 * prose was a debug readout the character would never think, and the fix was to
 * stop counting. Here the count is exactly what a Guardian WOULD know and say —
 * it is good writing — so the fix is to make it true. The question is never "is
 * there a number in this sentence", it is "does the game know this is true when
 * it says it".
 *
 * ⚠ EIGHT OF THE NINE GUARDIANS WERE WRITTEN CORRECTLY, which is why the gate
 * matters more than the fix: a rule understood, followed nearly everywhere, and
 * broken once is the profile of something that recurs.
 */
import {
  GUARDIANS_BY_CAPITAL, fallenCapitalsPhrase, seatPhrase,
  guardianApproachLine, guardianDefeatLine, guardianRebukeLine, isFinalGuardian,
  type CoreGuardianDef,
} from '../app/engine/coreGuardians';
import { LOST_CAPITAL_LOCATIONS } from '../app/engine/mainQuest';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const STORE = codeOnly(read('app', 'state', 'gameStore.ts'));

const ALL: CoreGuardianDef[] = LOST_CAPITAL_LOCATIONS
  .map((id) => GUARDIANS_BY_CAPITAL[id])
  .filter(Boolean) as CoreGuardianDef[];

describe('OTA-1468 — the phrases are true for every count', () => {
  it('⚠⚠⚠ THE CATALOGUE IS ACTUALLY LOADED — nine Guardians, or these tests are theatre', () => {
    expect(ALL.length).toBe(9);
  });

  it('⚠⚠⚠ NO CORES YET — the Cantor does not claim five Capitals fell', () => {
    // The owner's exact state at 23:50:18 was ONE. Zero is the harder case: a
    // naive `${n} Capitals` would read "0 Capitals fall to you".
    expect(fallenCapitalsPhrase(0)).toBe('not one Capital fall to you — yet');
    expect(fallenCapitalsPhrase(0)).not.toMatch(/\b(zero|0)\b/);
  });

  it('⚠⚠⚠ ONE CORE — singular, which is what he should have heard', () => {
    expect(fallenCapitalsPhrase(1)).toBe('one Capital fall to you');
    expect(fallenCapitalsPhrase(1)).not.toContain('Capitals');
  });

  it('⚠⚠ every count from 0 to 9 reads as English and never as UI', () => {
    for (let n = 0; n <= 9; n++) {
      const p = fallenCapitalsPhrase(n);
      // spelled out, because the surrounding prose counts in words
      // ("three voices, then six, then one") and "5 Capitals" reads as a HUD.
      expect({ n, p, hasDigit: /\d/.test(p) }).toEqual({ n, p, hasDigit: false });
      expect(p.length).toBeGreaterThan(8);
      // plural agreement
      if (n >= 2) expect(p).toContain('Capitals');
    }
  });

  it('⚠⚠ a count past the end still reads — the ninth is the last', () => {
    expect(fallenCapitalsPhrase(9)).toContain('nine');
    expect(fallenCapitalsPhrase(50)).toContain('nine');
  });

  it('⚠⚠ nonsense counts do not throw or leak NaN into the chamber', () => {
    for (const n of [NaN, Infinity, -Infinity, -3, 2.7]) {
      const p = fallenCapitalsPhrase(n as number);
      expect(typeof p).toBe('string');
      expect(p).not.toContain('NaN');
      expect(p).not.toContain('undefined');
    }
  });
});

describe('OTA-1468 — the seat phrase agrees with the game about being last', () => {
  it('⚠⚠⚠ EIGHT PRIOR CORES MAKES THIS THE LAST ONE, and only then', () => {
    // The arithmetic is `isFinalGuardian`'s, called rather than re-derived so
    // the two cannot drift. Two definitions of one fact is how they disagree.
    expect(isFinalGuardian(8)).toBe(true);
    expect(seatPhrase(8)).toContain('The last seat');
    expect(seatPhrase(8)).toContain('is done');
  });

  it('⚠⚠⚠ AND HIS CASE — SECOND KILL — DOES NOT DECLARE THE ORDER FINISHED', () => {
    // coresRecovered is read BEFORE the kill is banked, so 1 is his second
    // Guardian. The log had the Cantor announcing the end with seven left.
    const said = seatPhrase(1);
    expect(said).not.toContain('last seat');
    expect(said).not.toMatch(/is done/i);
    expect(said).toMatch(/seats still stand/i);
  });

  it('⚠⚠ …and it counts down correctly as the run goes on', () => {
    for (let n = 0; n <= 7; n++) {
      const said = seatPhrase(n);
      expect({ n, final: /last seat/.test(said) }).toEqual({ n, final: false });
      expect(/\d/.test(said)).toBe(false);
    }
    expect(seatPhrase(7)).toMatch(/One seat left/);
  });

  it('⚠⚠ the singular case is singular', () => {
    expect(seatPhrase(7)).toContain('One seat left');
    expect(seatPhrase(7)).not.toContain('seats');
  });
});

describe('OTA-1468 — substitution actually happens', () => {
  it('⚠⚠⚠ NO TOKEN SURVIVES TO THE PLAYER, for any Guardian at any count', () => {
    // A leaked `{fallen}` in the chamber is the OTA-146 defect — a raw template
    // reaching the screen — returning through a new door.
    for (const def of ALL) {
      for (let n = 0; n <= 9; n++) {
        for (const said of [
          guardianApproachLine(def, n),
          guardianDefeatLine(def, n),
          guardianRebukeLine(def),
        ]) {
          expect({ cap: def.capitalName, n, said: said.slice(0, 60), leak: /\{[A-Za-z]+\}/.test(said) })
            .toEqual({ cap: def.capitalName, n, said: said.slice(0, 60), leak: false });
          expect(said).not.toContain('undefined');
        }
      }
    }
  });

  it('⚠⚠⚠ THE CANTOR NOW SAYS THE TRUE NUMBER', () => {
    const cantor = GUARDIANS_BY_CAPITAL['voronov']!;
    expect(guardianApproachLine(cantor, 1)).toContain('one Capital fall to you');
    expect(guardianApproachLine(cantor, 1)).not.toContain('five Capitals');
    expect(guardianApproachLine(cantor, 5)).toContain('five Capitals fall to you');
    expect(guardianApproachLine(cantor, 0)).toContain('not one Capital');
  });

  it('⚠⚠ …and the rest of his speech is untouched', () => {
    // The fix is a substitution, not a rewrite. Losing the voice while making
    // the fact true would be a bad trade.
    const said = guardianApproachLine(GUARDIANS_BY_CAPITAL['voronov']!, 3);
    expect(said).toContain('A pure tone fills the chamber');
    expect(said).toContain('This one does not fall');
    expect(said).toContain('turn and live another hour');
  });

  it('⚠⚠ the OTHER eight Guardians are byte-identical after substitution', () => {
    // They carry no tokens, so passing them through must be a no-op. If a
    // substituter ever mangled a line with no token in it, this catches it.
    for (const def of ALL) {
      if (def.capitalId === 'voronov') continue;
      expect(guardianApproachLine(def, 4)).toBe(def.approachLine);
      expect(guardianDefeatLine(def, 4)).toBe(def.defeatLine);
    }
  });
});

describe('OTA-1468 — every call site goes through the substituter', () => {
  it('⚠⚠⚠ THE APPROACH SITE — the many-doors mistake is the whole risk here', () => {
    expect(STORE).toContain('cg.guardianApproachLine(');
    expect(STORE).not.toMatch(/GUARDIANS_BY_CAPITAL\[capitalId\]\.approachLine/);
  });

  it('⚠⚠⚠ THE DEFEAT SITE', () => {
    expect(STORE).toContain('cg.guardianDefeatLine(def,');
    expect(STORE).not.toContain("appendLog('arbiter', def.defeatLine)");
  });

  it('⚠⚠ THE REBUKE SITE — routed even with no token today', () => {
    // So a future token cannot be added at a call site that never learned to
    // substitute. Cheaper to prevent than to find.
    expect(STORE).toContain('cg.guardianRebukeLine(def)');
    expect(STORE).not.toContain('def?.rebukeLine ??');
  });

  it('⚠⚠ both sites read coresRecovered from the same place', () => {
    const uses = STORE.match(/mainQuest\?\.coresRecovered\?\.length \?\? 0/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
});

describe('OTA-1468 — the gate that stops this recurring', () => {
  it('⚠⚠⚠ IT IS REGISTERED, or it never runs', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:guardianclaims']).toBe('node scripts/check-guardian-claims.mjs');
  });

  it('⚠⚠⚠ IT CARRIES A SELF-TEST FIRED AT THE TWO REAL SENTENCES', () => {
    // A gate whose matcher quietly stops matching prints OK forever, and OK from
    // a broken instrument is worse than no instrument.
    const gate = read('scripts', 'check-guardian-claims.mjs');
    expect(gate).toContain('SELF_TEST');
    expect(gate).toContain('The Order has watched five Capitals fall to you');
    expect(gate).toContain('The last seat. The Order... is done.');
    expect(gate).toContain('SELF-TEST FAILED');
  });

  it('⚠⚠⚠ AND AN EMPTY EXTRACTION IS A FAILURE, never a clean board', () => {
    const gate = read('scripts', 'check-guardian-claims.mjs');
    expect(gate).toContain('extracted ZERO');
  });

  it('⚠⚠ it strips comments before deciding anything', () => {
    // The module's new header quotes both offending sentences. A scanner that
    // reads source as text and does not decide about comments FIRST reports its
    // own documentation as the defect — which has bitten this project twice.
    const gate = read('scripts', 'check-guardian-claims.mjs');
    expect(gate).toContain('codeOnly');
  });
});
