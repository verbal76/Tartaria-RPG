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
    // ⚠ OTA-1738 — each is a candidate of the screen's single teaching slot,
    // read from the registry. torch and golem are v2: the old torch card said a
    // light "burns down while lit" (each USE spends one torch), the old golem card
    // said it "cannot be healed" (its own parts mend it).
    for (const id of [
      'pickpocket_first', 'parley_first', 'gift_first', 'torch_first_v2',
      'fusion_first', 'golem_first_v2', 'climb_first',
    ]) {
      expect(EXPLORE2).toContain(`{ id: TEACH.${id}.id, when: !modalOwnsBeat && `);
    }
  });

  it('⚠⚠⚠ AND EACH FIRES AFTER ITS SHEET, NOT UNDER IT', () => {
    // FirstTimeHint is an absolute overlay and renders BELOW an RN Modal
    // (OTA-234) — a card raised while the sheet is open is invisible. Each of
    // these latches on open and renders once the sheet is gone, which is the
    // trap `pickerLanesTaught` was built to dodge.
    for (const latch of ['pickpocketTaught', 'climbTaught', 'fusionTaught', 'parleyTaught', 'giftTaught']) {
      expect(EXPLORE2).toContain(`const [${latch}, set`);
      expect(EXPLORE2).toMatch(new RegExp(`set${latch[0]!.toUpperCase()}${latch.slice(1)}\\(true\\)`));
    }
    // ⚠ OTA-1738 — the torch card keys on the CHARGED LEAD itself (the durable
    // fact the chooser produces), not on the chooser having opened: a single-lead
    // room never opens the chooser, and it is the common case.
    expect(EXPLORE2).not.toContain('const [torchTaught, set');
    expect(EXPLORE2).toContain('(currentScene?.hooks ?? []).some((h) => !!h.torchCharged)');
  });

  it('⚠⚠ each teaches the COST, which is what the modal never says', () => {
    // A modal explains what to pick. None of them explains what the system
    // costs or when it refuses — the part players learn by losing something.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TEACHINGS } = require('../app/components/teachingRegistry') as typeof import('../app/components/teachingRegistry');
    const body = (id: keyof typeof TEACHINGS) => TEACHINGS[id].body;
    expect(body('pickpocket_first')).toMatch(/caught/i);      // standing lost on a fail
    expect(body('gift_first')).toMatch(/gone|spare/i);         // the item does not come back
    expect(body('fusion_first')).toMatch(/consumes both|no undoing/i);
    // ⚠ OTA-1738 — applyTorchToHook decrements the torch by one per charge; the
    // cost is a spent torch, not a lamp burning while lit.
    expect(body('torch_first_v2')).toMatch(/spends one torch/i);
    expect(body('torch_first_v2')).not.toMatch(/burns down/i);
    expect(body('climb_first')).toMatch(/stamina/i);
    expect(body('golem_first_v2')).toMatch(/cannot climb/i);
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
    // ⚠ OTA-1738 — the primer is a `useFirstTimeHint` card now, and that hook is
    // where the flag is honoured for every card (shouldShow folds `disabled` in),
    // so the screen no longer carries its own copy of the switch.
    expect(EXPLORE2).toContain('useFirstTimeHint(TEACH.combat_primer_v1.id)');
    expect(EXPLORE2).toMatch(/combatPrimerOpen =[^;]*primerHint\.shouldShow === true;/);
    const HOOK = readFileSync(join(ROOT, 'app', 'components', 'useFirstTimeHint.ts'), 'utf8');
    expect(HOOK).toContain('(!dismissed && !disabled)');
  });

  it('⚠⚠ every FirstTimeHint already carried it, which is why they were fine', () => {
    expect(HINT).toContain('void setHintsDisabled(true); dismiss();');
    expect(HINT).toContain('<Text style={styles.linkText}>Turn off tips</Text>');
  });

  it('⚠⚠⚠ THE DOG CARD EXEMPTION WAS OVERTURNED BY OTA-1525 — AND THE REASON SURVIVES', () => {
    // ⚠ THIS PIN ORIGINALLY REQUIRED `DOG` NOT TO CONTAIN setHintsDisabled AT
    // ALL. That was the right call for OTA-1524 and the wrong one for the owner,
    // who asked for the button here too: "push the dog card tips button too."
    // The pin is amended rather than deleted, because the CONSTRAINT it was
    // protecting is still real and is now the thing worth pinning.
    //
    // What changed: the card offers the switch.
    // What did NOT change, and must not: the switch does not DISMISS it. OTA-1027's
    // contract is "No dismiss-without-answering: the dog is already rescued; it
    // needs a name", so silencing tips must never skip the naming beat and wedge
    // the save. See ota1525 for the full claim; this end holds the boundary.
    expect(DOG).toContain('setHintsDisabled');       // OTA-1525 — the button is here
    expect(DOG).toContain('disabled={!sex}');        // and the commit still needs an answer
    // The card is still raised regardless of the flag: tips off silences TIPS,
    // never a question the engine needs answered.
    expect(DOG).not.toMatch(/useHintsDisabled\(\)/);
  });
});
