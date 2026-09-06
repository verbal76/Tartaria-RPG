/**
 * OTA-1714 — THE DOG IS CALLED "THEY".
 *
 * The dog onboarding asks the player for its sex and accepts three answers, so
 * `they` is a first-class option, not an edge case — and anything the parser
 * cannot read as he or she lands there too. The pronoun machinery for it is
 * complete: `applyDogPronouns` carries {object} for object slots and {verbS} /
 * {verbES} for the plural verb, and most of the dog's 24 templates use them
 * correctly ("Feed {object}, soon." has been right all along).
 *
 * ⚠⚠ FOUR LINES DID NOT, and they are the four a player reads when their dog is
 * starving or bleeding out — the moments the system exists for:
 *
 *     "{Pronoun} {isOrAre} hungry — feed {pronoun} …"     → "feed they"
 *     "{Pronoun} needs food or a poultice, soon."          → "They needs food"
 *     "feed {object} now or {pronoun} does not see …"      → "or they does not"
 *     "One more empty day and {pronoun} walks."            → "and they walks"
 *
 * The first is a case error (a subject pronoun in an object slot) and reads
 * badly for ALL THREE pronouns — "feed he", "feed she", "feed they". The other
 * three are agreement errors that read correctly for he and she and break only
 * for they, which is the quietest way for a defect like this to survive: it is
 * invisible unless you play the option the game offered you.
 *
 * ⚠ Found by review rather than by report, and confirmed in rendered output —
 * the game printed "Cinder keeps eyeing your pack. They are hungry — feed they
 * before the bond frays." into a probe's feed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { applyDogPronouns, type Pronoun } from '../app/engine/dogCompanion';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** Every backtick template in the dog-bearing files that carries a pronoun
 *  token — the population both instruments below walk. */
function pronounTemplates(): { file: string; text: string }[] {
  const files = [
    ['app', 'state', 'gameStore.ts'],
    ['app', 'engine', 'dogCompanion.ts'],
    ['app', 'state', 'stageArrival.ts'],
    ['app', 'state', 'combatResolution.ts'],
  ];
  const out: { file: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    for (const m of src(...f).matchAll(/`([^`]*\{[Pp]ronoun\}[^`]*)`/g)) {
      const text = m[1]!;
      if (seen.has(text)) continue;
      seen.add(text);
      out.push({ file: f[f.length - 1]!, text });
    }
  }
  return out;
}

const PRONOUNS: Pronoun[] = ['he', 'she', 'they'];

describe('OTA-1714 — the four lines, rendered for every pronoun the game offers', () => {
  const render = (t: string, p: Pronoun): string => applyDogPronouns(t, p);

  it('⚠⚠⚠ the hunger warning feeds the dog, not "feeds they"', () => {
    const t = 'Cinder keeps eyeing your pack. {Pronoun} {isOrAre} hungry — feed {object} before the bond frays.';
    expect(render(t, 'he')).toContain('feed him before');
    expect(render(t, 'she')).toContain('feed her before');
    expect(render(t, 'they')).toContain('feed them before');
    // The case error read badly for ALL THREE, which is what makes it the worst
    // of the four despite being the least exotic.
    for (const p of PRONOUNS) expect(render(t, p)).not.toMatch(/feed (he|she|they) /);
  });

  it('⚠⚠ the bleed-out beats agree with a plural subject', () => {
    const fading = '{Pronoun} need{verbS} food or a poultice, soon.';
    expect(render(fading, 'he')).toBe('He needs food or a poultice, soon.');
    expect(render(fading, 'they')).toBe('They need food or a poultice, soon.');

    const last = 'feed {object} now or {pronoun} do{verbES} not see morning.';
    expect(render(last, 'she')).toBe('feed her now or she does not see morning.');
    expect(render(last, 'they')).toBe('feed them now or they do not see morning.');

    const walks = 'One more empty day and {pronoun} walk{verbS}.';
    expect(render(walks, 'he')).toBe('One more empty day and he walks.');
    expect(render(walks, 'they')).toBe('One more empty day and they walk.');
  });

  it('the four templates are in the source in their corrected form', () => {
    const g = src('app', 'state', 'gameStore.ts');
    expect(g.includes('{Pronoun} {isOrAre} hungry — feed {object} before the bond frays.')).toBe(true);
    expect(g.includes('{Pronoun} need{verbS} food or a poultice, soon.')).toBe(true);
    expect(g.includes('feed {object} now or {pronoun} do{verbES} not')).toBe(true);
    expect(g.includes('One more empty day and {pronoun} walk{verbS}.')).toBe(true);
  });
});

describe('OTA-1714 — ⚠⚠ THE INSTRUMENTS, so a fifth line cannot slip in', () => {
  it('no subject pronoun sits in an object slot', () => {
    // `feed {pronoun}` is the shape. A verb or preposition that takes an object,
    // followed by the SUBJECT token, is wrong for every pronoun — this is the
    // one class that is not a "they" problem.
    const takesObject = /\b(feed|pet|call|heal|leave|lose|give|tell|watch|follow|send|bring|take|help|find|save|carry|reward|praise|scold|for|to|with|at|beside|behind|near|after|about)\s+\{pronoun\}/i;
    const bad = pronounTemplates()
      .filter((t) => takesObject.test(t.text))
      .map((t) => `${t.file}: ${t.text.slice(0, 90)}`);
    expect(bad).toEqual([]);
  });

  it('no subject pronoun is followed by a hard-coded singular verb', () => {
    // `{pronoun} walks` reads fine for he and she and breaks only for they,
    // which is exactly why three of these survived. {verbS} / {verbES} exist for
    // it and are used correctly elsewhere in the same file.
    const bad: string[] = [];
    for (const { file, text } of pronounTemplates()) {
      for (const m of text.matchAll(/\{[Pp]ronoun\}\s+([a-z]+s)\b(?!\{)/g)) {
        const verb = m[1]!;
        // `is` / `has` / `was` are covered by their own tokens ({isOrAre},
        // {hasOrHave}); a bare one of those is a different (also wrong) shape,
        // but it is not what this instrument is measuring.
        if (['is', 'was', 'has', 'as', 'its', 'this', 'less', 'yes'].includes(verb)) continue;
        bad.push(`${file}: "${verb}" in — ${text.slice(0, 90)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('⚠ and the instruments are actually looking at something', () => {
    // A scanner pointed at an empty population passes forever. This is the same
    // self-check the faction probes needed after one of them read the wrong
    // store field and reported every refusal as silent.
    const all = pronounTemplates();
    expect(all.length).toBeGreaterThanOrEqual(20);
    expect(all.some((t) => t.text.includes('{object}'))).toBe(true);
    expect(all.some((t) => t.text.includes('{verbS}'))).toBe(true);
  });
});
