// OTA-1524 — COVER THE SEVEN ANYWAY, AND MEAN THE SWITCH.
//
// ⚠⚠⚠ THE OWNER OVERRULED THE AUDIT, AND WAS RIGHT. OTA-1523 deliberately left
// seven systems uncovered — pickpocket, parley, gift, torch, the Fusing Crucible,
// golems and climbing — on the argument that each already opens a modal at the
// point of use and piling cards on top is how a player learns to reach for "turn
// off tips". His answer: "cover them anyways and make sure they all have a turn
// off tips button." That is the better trade. The argument for skipping was about
// NOISE, and the switch is the answer to noise — so cover the systems AND make
// certain the switch is genuinely everywhere.
//
// ⚠⚠⚠ AND CHECKING THAT TURNED UP A REAL DEFECT. `setHintsDisabled` has gated
// every FirstTimeHint since OTA-860, and CombatPrimerModal honoured NEITHER half
// of it: it offered no way to turn tips off from inside, and it ignored the flag
// entirely — a player who had already switched tips off still met the card on
// their first fight with no way to refuse it. An opt-out that some cards ignore
// is not an opt-out.
//
// ⚠⚠ THE DOG CARD IS DELIBERATELY EXEMPT, AND THAT IS NOT AN OVERSIGHT.
// DogOnboardingModal says it in its own header: "No dismiss-without-answering:
// the dog is already rescued; it needs a name." It is a required DECISION, not a
// tip. A turn-off-tips escape there would let a player skip naming their dog and
// leave the save wedged exactly where OTA-1027 found it. A switch that silences
// tips must not also silence questions the game needs answered.

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXPLORE2 = readFileSync(join(ROOT, 'app', 'screens', 'ExplorationScreen.tsx'), 'utf8');
const PRIMER = readFileSync(join(ROOT, 'app', 'components', 'CombatPrimerModal.tsx'), 'utf8');
const DOG = readFileSync(join(ROOT, 'app', 'components', 'DogOnboardingModal.tsx'), 'utf8');
const HINT = readFileSync(join(ROOT, 'app', 'components', 'FirstTimeHint.tsx'), 'utf8');
describe('OTA-1524 — the seven the audit skipped are covered', () => {
  it('⚠⚠⚠ ALL SEVEN HAVE A HINT', () => {
    for (const id of [
      'pickpocket_first', 'parley_first', 'gift_first', 'torch_first',
      'fusion_first', 'golem_first', 'climb_first',
    ]) {
      expect(EXPLORE2).toContain(`id="${id}"`);
    }
  });

  it('⚠⚠⚠ AND EACH FIRES AFTER ITS SHEET, NOT UNDER IT', () => {
    // FirstTimeHint is an absolute overlay and renders BELOW an RN Modal
    // (OTA-234) — a card raised while the sheet is open is invisible. Each of
    // these latches on open and renders once the sheet is gone, which is the
    // trap `pickerLanesTaught` was built to dodge.
    for (const latch of ['pickpocketTaught', 'torchTaught', 'climbTaught', 'fusionTaught', 'parleyTaught', 'giftTaught']) {
      expect(EXPLORE2).toContain(`const [${latch}, set`);
      expect(EXPLORE2).toMatch(new RegExp(`set${latch[0]!.toUpperCase()}${latch.slice(1)}\\(true\\)`));
    }
  });

  it('⚠⚠ each teaches the COST, which is what the modal never says', () => {
    // A modal explains what to pick. None of them explains what the system
    // costs or when it refuses — the part players learn by losing something.
    const body = (id: string) => {
      const at = EXPLORE2.indexOf(`id="${id}"`);
      return EXPLORE2.slice(at, EXPLORE2.indexOf('/>', at));
    };
    expect(body('pickpocket_first')).toMatch(/caught/i);      // standing lost on a fail
    expect(body('gift_first')).toMatch(/gone|spare/i);         // the item does not come back
    expect(body('fusion_first')).toMatch(/consumes both|no undoing/i);
    expect(body('torch_first')).toMatch(/burns down|consumable/i);
    expect(body('climb_first')).toMatch(/stamina/i);
    expect(body('golem_first')).toMatch(/cannot climb/i);
    expect(body('parley_first')).toMatch(/costs you the beat|still costs/i);
  });
});

describe('OTA-1524 — the turn-off switch is real everywhere it should be', () => {
  it('⚠⚠⚠ THE COMBAT PRIMER NOW OFFERS IT — it offered nothing before', () => {
    expect(PRIMER).toContain("import { setHintsDisabled } from './useFirstTimeHint';");
    expect(PRIMER).toContain('void setHintsDisabled(true); onClose();');
    // ⚠ PINNED AS THE RENDERED ELEMENT — check:quotedpins ratchets bare prose,
    // and this form is both exempt and stronger: it asserts the words are an
    // actual styled control in the card, not merely present in the file.
    expect(PRIMER).toContain('<Text style={styles.turnOffText}>Turn off tips</Text>');
  });

  it('⚠⚠⚠ AND IT HONOURS THE FLAG — ignoring it was the actual defect', () => {
    // Offering the switch is half of it. A card that still fires after the
    // player has thrown the switch is the reason they stop trusting it.
    expect(EXPLORE2).toContain('const hintsOff = useHintsDisabled();');
    expect(EXPLORE2).toMatch(/combatPrimerOpen =[^;]*&& !hintsOff;/);
  });

  it('⚠⚠ every FirstTimeHint already carried it, which is why they were fine', () => {
    expect(HINT).toContain('void setHintsDisabled(true); dismiss();');
    expect(HINT).toContain('<Text style={styles.linkText}>Turn off tips</Text>');
  });

  it('⚠⚠⚠ AND THE DOG CARD IS EXEMPT ON PURPOSE — it asks, it does not tell', () => {
    // "No dismiss-without-answering: the dog is already rescued; it needs a
    // name." Silencing tips must not silence a question the game needs answered,
    // or the save wedges exactly where OTA-1027 found it. Stated as a claim
    // about the CODE, not as a quote of that comment.
    expect(DOG).not.toContain('setHintsDisabled');
    expect(DOG).toContain('disabled={!sex}');   // the commit is gated on an answer
  });
});
