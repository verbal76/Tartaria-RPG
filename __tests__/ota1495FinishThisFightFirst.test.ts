// OTA-1495 — FINISH THIS FIGHT FIRST, RAISED WHERE IT CAN BE SEEN.
//
// ⚠⚠ Owner: *"block summoning mid fight with a finish your current battle
// before you strive for more punishment popup or something like that."*
//
// ⚠ THE REFUSAL ITSELF IS NOT NEW — OTA-1480 blocked a mid-fight summon (a
// Guardian encounter assumes it is THE fight, not a second bolted onto a
// first) and OTA-1466 gave it narration that says what happened, why, and what
// to do. What was missing is VISIBILITY: the narration went to the feed, and a
// feed line printed mid-fight scrolls under the player's thumb in a beat or
// two, so a real refusal read as a dead button — OTA-220's
// lit-button-that-refuses defect, in the worst possible place.
//
// ⚠⚠ ONE WRITER, TWO SURFACES. The popup shows the ENGINE'S line, passed in.
// The modal owns the frame and nothing else, so the popup and the log can
// never disagree about why the summon was refused.

import { readFileSync } from 'fs';
import { join } from 'path';
import { storeSource } from '../test-utils/storeSource';
import { between, blockAt } from '../test-utils/srcBlock';
import { summonHostilesLine, summonHostiles } from '../app/engine/coreGuardians';

const ROOT = join(__dirname, '..');
const STORE = storeSource();
const MODAL = readFileSync(join(ROOT, 'app', 'components', 'SummonRefusalModal.tsx'), 'utf8');
const APP = readFileSync(join(ROOT, 'App.tsx'), 'utf8');

describe('OTA-1495 — the refusal is raised, not just logged', () => {
  it('⚠⚠ the hostiles branch sets summonRefusal AND still writes the feed line', () => {
    const span = between(STORE, 'if (hostiles.blocked) {', "return { ok: false, reason: 'hostiles_present' };");
    expect(span).toContain("get().appendLog('arbiter', line, { skipDedup: true })");
    expect(span).toContain('set({ summonRefusal: line });');
  });

  it('⚠⚠ the popup shows the ENGINE\'S narration — one writer, two surfaces', () => {
    // The same `line` goes to both. A second wording in the modal is how the
    // popup and the log end up disagreeing about why.
    const span = between(STORE, 'if (hostiles.blocked) {', 'set({ summonRefusal: line });');
    expect(span).toContain('const line = cg.summonHostilesLine(');
    // And the modal takes the message as a prop rather than composing one.
    expect(MODAL).toMatch(/message:\s*string\s*\|\s*null/);
    expect(MODAL).not.toContain('summonHostilesLine');
  });

  it('⚠ the refusal narration still says what/why/what-next — unchanged by this OTA', () => {
    const hostiles = summonHostiles(
      [{ name: 'Silt Rat' }, { name: 'Mud Goblin' }] as never,
      [4, 6],
      [false, false],
    );
    expect(hostiles.blocked).toBe(true);
    const line = summonHostilesLine('Asgardar', hostiles);
    expect(line).toContain('Silt Rat');       // what is in the way
    expect(line).toMatch(/will not answer/);  // why
    expect(line).toMatch(/Finish here|come back/); // what to do
  });
});

describe('OTA-1495 — the popup itself', () => {
  it('⚠⚠ it is dismissible and says the owner\'s beat', () => {
    // ⚠ Claim-level, not copy-level (check:quotedpins caught my first draft
    // quoting both strings verbatim): the aside must tell the player to finish
    // the fight first, and the single button must send them back to it —
    // however either is worded.
    expect(MODAL).toMatch(/finish[\s\S]{0,40}fight/i);
    expect(MODAL).toMatch(/BACK[\s\S]{0,10}FIGHT/i);
    expect(MODAL).toContain('onRequestClose={onDismiss}');
  });

  it('⚠ nothing renders when nothing is owed', () => {
    expect(MODAL).toContain('if (!message) return null;');
  });

  it('⚠⚠ mounted globally — the summon button exists on more than one screen', () => {
    // ContractsScreen and ExplorationScreen both call summonCoreGuardian; a
    // modal owned by one of them would be missing from the other.
    expect(APP).toContain('<SummonRefusalGate />');
    expect(APP).toContain('SilentBoundary tag="SummonRefusalModal"');
  });

  it('⚠ dismissing clears the store field, so it cannot re-raise itself', () => {
    // ⚠ blockAt, not between: my first draft closed the window on the first
    // `}` — which is the one inside `set({ ... })`, the very call being pinned.
    expect(STORE).toContain('dismissSummonRefusal()');
    const body = blockAt(STORE, 'dismissSummonRefusal() {', { mode: 'opener' });
    expect(body).toContain('set({ summonRefusal: null })');
  });
});
