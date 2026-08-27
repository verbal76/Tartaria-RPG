// OTA-1522 — THE STUN DOES NOT OUTLIVE ITSELF.
//
// ⚠⚠⚠ THE GAME ANNOUNCED THE STUN HAD ENDED AND THEN ATE THE ACTION FOR IT.
// From the owner's recovered log, twice, one millisecond apart each time:
//
//   [22:45:00.539] ui: tap "golem (63/68)"
//   [22:45:00.541] stunned fades.
//   [22:45:00.542] You cannot move. Your action is lost.
//
//   [02:11:03.870] ui: tap "dodge"
//   [02:11:03.873] stunned fades.
//   [02:11:03.874] You cannot move. Your action is lost.
//
// He had already committed — a golem command and a dodge, both mid-fight, both
// against five raiders — and both were swallowed by an effect the same tick had
// just cleared. Worse than losing the turn is being TOLD the stun ended in the
// line immediately above the refusal.
//
// ⚠⚠ THE CAUSE, and it is one identifier. `tickEffects()` returns the post-tick
// list as `tick.effects`; `set()` commits exactly that as the player's new
// truth, and the fade lines are printed from `tick.expired`. The incapacitation
// gate alone read `player.statusEffects` — the list from BEFORE the tick — so it
// enforced a stun that had already expired in the same breath that announced it.
//
// ⚠⚠⚠ THE ERROR CLASS: a gate that reads state the tick has already superseded.
// Every other consumer in that block had already moved to the post-tick list;
// this one was left behind, and the disagreement was invisible except on the
// single action where the two lists differ — which is precisely the action the
// player loses.

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const STORE = readFileSync(join(ROOT, 'app', 'state', 'gameStore.ts'), 'utf8');

/** The status-tick block: from the tickEffects call to the incapacitation return. */
function tickBlock(): string {
  const at = STORE.indexOf('const tick = _opts?.skipPreChecks');
  expect(at).toBeGreaterThan(-1);
  // ⚠ End on the CALL, not on the message text — the fix's own comment quotes
  // that message, so anchoring on the string lands inside the comment and cuts
  // the block short of the very line under test. (It did, on the first run.)
  const end = STORE.indexOf("appendLog('world', `You cannot move", at);
  expect(end).toBeGreaterThan(at);
  return STORE.slice(at, end + 120);
}

describe('OTA-1522 — the incapacitation gate reads the post-tick list', () => {
  it('⚠⚠⚠ isIncapacitated CONSULTS tick.effects — the list set() just committed', () => {
    expect(tickBlock()).toContain('const incapacitated = isIncapacitated(tick.effects);');
  });

  it('⚠⚠⚠ AND NEVER THE PRE-TICK LIST AGAIN — that is the whole defect', () => {
    // One character's difference between "your stun ended" and "your turn is
    // gone". If this ever reverts, it reverts silently on every other action.
    expect(tickBlock()).not.toContain('isIncapacitated(player.statusEffects)');
  });

  it('⚠⚠ the same block still commits tick.effects and prints from tick.expired', () => {
    // The gate was the odd one out; the rest of the block was already correct.
    // Pinning that keeps the three readings from drifting apart again.
    const b = tickBlock();
    expect(b).toContain('statusEffects: tick.effects');
    expect(b).toContain('for (const ex of tick.expired)');
  });

  it('⚠ a stun with time left still blocks — this loosens nothing', () => {
    // tick.effects RETAINS every effect that has not expired, so an ongoing
    // stun is still in the list the gate reads. The change only removes
    // effects the tick itself just cleared.
    const b = tickBlock();
    expect(b).toContain('tickEffects(player.statusEffects ?? [], { inCombat })');
    expect(b).toContain("get().appendLog('world', `You cannot move. Your action is lost.`)");
  });
});
