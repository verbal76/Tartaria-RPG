/**
 * OTA-1416 — "PET DOG" DID NOT WORK, AND THE GAME COULD ALREADY DO IT.
 *
 * Owner: *"when I type pet dog a little pop-up jumps in and there's some
 * options. none of them are actually pet the dog. I would like to add pet the
 * dog."*
 *
 * ⚠⚠ THE POP-UP HE MEANS IS PETTING. `call dog` opens CallDogModal, and its
 * first button has read **"Scratch their ear (+2 loyalty)"** since OTA-120. He
 * looked at a menu containing exactly the thing he wanted and correctly
 * concluded it did not, because it never used his word.
 *
 * The fifth instance this session of one species: **the game had the thing and
 * did not say it in the words the player used.** OTA-1402 (a refused hand-in
 * that would not say why), OTA-1405 (a tutorial that would not say what it
 * wanted), OTA-1407 (a coating refusal that never spoke), OTA-1411 (a rope
 * binned because "tool" was not in a word list), and now a menu item that was
 * the right answer and read as the wrong one.
 *
 * Two doors, because there were two ways to mean it: typing it works, AND the
 * word is in the menu.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { blockAt } from '../test-utils/srcBlock';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const MODAL = read('app', 'components', 'CallDogModal.tsx');
const PARSER = read('app', 'engine', 'parser.ts');
const LLM = read('app', 'engine', 'llmParser.ts');

/** The shipped matcher, mirrored: does this input pet the dog, and who? */
const PET_VERBS = ['pet', 'pat', 'stroke', 'scratch', 'fuss', 'cuddle', 'snuggle'];
function petTarget(input: string): string | null {
  const lower = input.trim().toLowerCase().replace(/\s+/g, ' ');
  const m = new RegExp(`^(?:${PET_VERBS.join('|')})\\s+(?:the\\s+)?(.+)$`, 'i').exec(lower);
  if (!m) return null;
  return m[1]!.trim().replace(/^(my|your)\s+/, '');
}
const petsDog = (input: string, dogName = 'ember') => {
  const t = petTarget(input);
  return t !== null && (t === 'dog' || t === dogName);
};

describe('OTA-1416 — the owner\'s exact input', () => {
  it('⚠⚠ "pet dog" pets the dog', () => {
    expect(petsDog('pet dog')).toBe(true);
  });

  it('⚠⚠ …and so does petting it by name, which is how people talk to dogs', () => {
    expect(petsDog('pet Ember')).toBe(true);
    expect(petsDog('pet the dog')).toBe(true);
    expect(petsDog('pet my dog')).toBe(true);
    expect(petsDog('PET EMBER')).toBe(true);
    expect(petsDog('  pet   the   dog  ')).toBe(true);
  });

  it('⚠ every synonym a player might reach for', () => {
    for (const v of PET_VERBS) {
      expect(petsDog(`${v} dog`)).toBe(true);
      expect(petsDog(`${v} the dog`)).toBe(true);
    }
  });
});

describe('OTA-1416 — and it steals nothing', () => {
  it('⚠⚠ a pet verb aimed at anything else is NOT intercepted', () => {
    // The target guard is the whole safety property. `scratch the mud` must
    // reach the normal parser, not the dog.
    expect(petsDog('scratch the mud')).toBe(false);
    expect(petsDog('pet the cat')).toBe(false);
    expect(petsDog('stroke the carving')).toBe(false);
    expect(petsDog('scratch at the door')).toBe(false);
  });

  it('⚠⚠ a bare pet verb with no target is NOT intercepted', () => {
    expect(petTarget('pet')).toBeNull();
    expect(petTarget('scratch')).toBeNull();
  });

  it('⚠⚠ a verb that merely STARTS with a pet verb is not one', () => {
    // "petition the guild", "patrol the ridge" — prefix matching here would
    // eat real verbs, so the regex requires whitespace after the verb.
    expect(petTarget('petition the guild')).toBeNull();
    expect(petTarget('patrol the ridge')).toBeNull();
    expect(petTarget('strokes')).toBeNull();
  });

  it('⚠⚠ CHECKED, NOT ASSUMED — and the check corrected the first draft', () => {
    // The source comment originally claimed no pet verb was already a parser
    // verb. This test said otherwise: `stroke` is a `gesture` verb (stroke a
    // carving, touch a bell). A grep for 'scratch' had come back empty and the
    // claim was written from it — the wrong verb checked, and a comment shipped
    // that a reader would have trusted. Both the comment and this list are now
    // read off the files.
    const OVERLAP = ['stroke'];
    for (const v of PET_VERBS) {
      const inParser = PARSER.includes(`'${v}'`) || LLM.includes(`'${v}'`);
      expect(inParser).toBe(OVERLAP.includes(v));
    }
    // …and the one overlap belongs to `gesture`, which had no dog handler — so
    // what the intercept takes is a generic flavour line, on exactly one
    // phrasing. If `stroke` ever moves to an intent that DOES something with a
    // dog, this pin fails and the trade has to be re-argued.
    const i = PARSER.indexOf('gesture: [');
    expect(PARSER.slice(i, PARSER.indexOf(']', i))).toContain("'stroke'");
  });
});

describe('OTA-1416 — a dog you cannot reach says so', () => {
  it('⚠⚠ every DogStatus has an answer — a silent no is the bug being fixed', () => {
    // 'with_player' pets; the other three each get a line naming WHY. A status
    // added later with no branch would fall through to the pet, which is why
    // the guard tests status explicitly rather than negating one value.
    expect(STORE).toContain("if (dog.status === 'dead' || dog.status === 'abandoned') {");
    expect(STORE).toContain("is not with you any more.");
    expect(STORE).toContain("if (dog.status !== 'with_player') {");
    expect(STORE).toContain('waiting back at base');
    expect(STORE).toContain('down and waiting to be tended');
  });

  it('⚠ a downed dog is distinguished from one merely left behind', () => {
    // Both are `waiting_at_base`; only one is on a 24h bleed-out clock, and
    // that is the one where the answer changes what the player should do next.
    const i = STORE.indexOf("if (dog.status !== 'with_player') {");
    expect(blockAt(STORE, "if (dog.status !== 'with_player') {")).toContain('dog.hp <= 0');
  });
});

describe('OTA-1416 — no new mechanic was invented', () => {
  it('⚠⚠ it routes to the EXISTING scratch option, so nothing needs balancing', () => {
    expect(STORE).toContain("handleCallDogOption(get, set, 'scratch');");
    // …which is +2 loyalty, capped, and one minute of game time. Unchanged.
    expect(STORE).toContain('const newLoyalty = Math.min(100, dog.loyalty + 2);');
    expect(STORE).toContain('? { player: advanceTime(s.player, 1 / 60) }');
  });

  it('⚠ the intercept sits beside its sibling and persists like it', () => {
    expect(STORE).toContain('if (tryDogPetVerb(get, set, trimmed)) return;');
    const i = STORE.indexOf('function tryDogPetVerb(');
    expect(blockAt(STORE, 'function tryDogPetVerb(')).toContain('void get().persist();');
  });
});

describe('OTA-1416 — and the word is in the menu too', () => {
  it('⚠⚠ the button leads with "Pet", the word he was looking for', () => {
    expect(MODAL).toContain("label: 'Pet them — scratch behind the ear (+2 loyalty)',");
    // The old label is gone, not left beside it.
    expect(MODAL).not.toContain("label: 'Scratch their ear (+2 loyalty)',");
  });

  it('⚠ the other two options are untouched', () => {
    expect(MODAL).toContain("label: 'Give them a treat',");
    expect(MODAL).toContain("label: 'Speak softly (+1 loyalty)',");
  });

  it('⚠ the reason is on the record, where the label is', () => {
    expect(MODAL).toContain('LEADS WITH THE WORD A PLAYER ACTUALLY USES');
  });
});
