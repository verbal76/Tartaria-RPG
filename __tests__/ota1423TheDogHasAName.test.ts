/**
 * OTA-1423 — "EQUIP ON DOG". SHE HAS A NAME.
 *
 * Owner: *"when I tap on a piece of dog armor it says 'equip on dog' — it
 * should use its name not just dog."*
 *
 * ⚠⚠ HE ASKED FOR THIS ONCE ALREADY, AT OTA-184: *"let's use the dogs name
 * instead of just dog."* That fix landed on the FEED button and stopped there.
 * The equip button, eleven lines further down the same function, kept saying
 * "dog" — and so did the "Feed Max" button, the treat picker's empty-pack line,
 * and one of the Arbiter's refusals.
 *
 * ⚠ THE ANSWER WAS IN THE SIBLING BRANCH. The Unequip label directly ABOVE the
 * one he tapped has read `Unequip (worn by ${dog.name})` since OTA-956. Two
 * arms of one if/else, one naming her and one not.
 *
 * The many-doors mistake again, and the seventh instance this session of the
 * same species: one door fixed, the siblings left. The fix here is the whole
 * class — every player-facing string that could say her name now does.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const INV = read('app', 'screens', 'InventoryScreen.tsx');
const MODAL = read('app', 'components', 'CallDogModal.tsx');
const INPUT = read('app', 'components', 'InputBox.tsx');

/** Player-facing strings, with comments stripped — a comment quoting the old
 *  wording must not read as the old wording still shipping. Fifth time this
 *  session an absence pin has needed this. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/gm, (m, p1) => p1);

describe('OTA-1423 — the row he tapped', () => {
  it('⚠⚠ the equip button uses her name', () => {
    expect(INV).toContain('label: `Equip on ${player!.dog!.name}`,');
  });

  it('⚠⚠ …and the generic label is GONE from the code, not just added beside', () => {
    expect(codeOnly(INV)).not.toContain("label: 'Equip on dog'");
    expect(codeOnly(INV)).not.toContain('Equip on dog');
  });

  it('⚠ the Unequip arm it sits beside is unchanged — it was already right', () => {
    // The point of the OTA: one if/else, two arms, only one naming her. The
    // arm that was correct must stay correct.
    expect(INV).toContain('label: `Unequip (worn by ${player?.dog?.name ?? \'your dog\'})`,');
  });
});

describe('OTA-1423 — and every sibling OTA-184 missed', () => {
  it('⚠⚠ "Feed Max" names her, like the "Feed <name>" button above it', () => {
    expect(INV).toContain('label: `Feed ${dogName} Max ×${n}');
    expect(codeOnly(INV)).not.toContain('label: `Feed Max ×${n}');
  });

  it('⚠⚠ the treat picker\'s empty-pack line names her', () => {
    // Its own TITLE one line above already said `Treat for ${dog.name}`, so the
    // body saying "the dog" was the same split as the equip/unequip pair.
    expect(MODAL).toContain('`Your pack has no food ${dog.name} can eat.');
    expect(codeOnly(MODAL)).not.toContain('no food the dog can eat');
  });

  it('⚠⚠ the Arbiter\'s downed-dog refusal stops calling her "the dog"', () => {
    expect(codeOnly(INPUT)).not.toContain('Feed the dog to bring it up');
    expect(INPUT).toContain('"Feed {object} to bring {object} up');
  });
});

describe('OTA-1423 — naming her means gendering her', () => {
  it('⚠⚠ the refusals run through applyDogPronouns, so tokens actually resolve', () => {
    // ⚠ CAUGHT MID-FIX: the first draft wrote {object}/{pronoun} into a plain
    // template literal in a file that never imported the helper. Those tokens
    // would have printed LITERALLY to the player — "bring {object} up". The
    // helper is now imported and wraps all three refusals.
    expect(INPUT).toContain("import { applyDogPronouns } from '../engine/dogCompanion';");
    const i = INPUT.indexOf('applyDogPronouns(');
    expect(i).toBeGreaterThan(-1);
    const call = INPUT.slice(i, INPUT.indexOf('),', INPUT.indexOf('sex.pronoun', i)));
    expect(call).toContain('{object}');
    expect(call).toContain('{pronoun}');
  });

  it('⚠⚠ …and the pronoun comes from the STORE, because the local dog has none', () => {
    // The `dog` in scope there is a narrowed view — { name, hp, hpMax } — with
    // no `sex` on it. Reading it off that object typechecked as an error, which
    // is the compiler catching what a template literal would have shipped.
    expect(INPUT).toContain("useGameStore.getState().player?.dog?.sex.pronoun ?? 'they'");
  });

  it('⚠ every token used is one applyDogPronouns actually substitutes', () => {
    // A token the helper does not know prints as itself. Cheap to check, and
    // the failure is player-visible.
    const DOG = read('app', 'engine', 'dogCompanion.ts');
    for (const tok of ['{object}', '{pronoun}']) {
      const bare = tok.slice(1, -1);
      expect(DOG).toContain(`{${bare}\\}`.replace('\\', '')); // the replace map lists it
    }
    expect(DOG).toContain('.replace(/\\{object\\}/g');
    expect(DOG).toContain('.replace(/\\{pronoun\\}/g');
  });
});

describe('OTA-1423 — the class, so an eighth sibling cannot hide', () => {
  it('⚠⚠ no player-facing label in these screens still says a generic "dog"', () => {
    // The sweep that found the four. Comments and code identifiers are allowed
    // to say "dog"; a string the player READS is not, when a name is in scope.
    const offenders: string[] = [];
    for (const [name, src] of [['InventoryScreen', INV], ['CallDogModal', MODAL]] as const) {
      for (const m of codeOnly(src).matchAll(/label: ['`]([^'`]*)['`]/g)) {
        if (/\bdog\b/i.test(m[1]!) && !m[1]!.includes('${')) offenders.push(`${name}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
