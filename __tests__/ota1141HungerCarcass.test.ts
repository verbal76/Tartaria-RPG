// OTA-1141 — THE HUNGER CARCASS.
//
// Owner: "we removed hunger, we don't still have that somewhere do we? we eat
// for HP not to lower hunger, that's a different mechanic."
//
// Right on both counts, and the audit found the second half was only half true.
// The MECHANIC was gone — effectiveStaminaMax stopped reading the penalty, and
// both accrual sites were hardcoded to 0, so nothing got hungry and nothing
// bit. But the CARCASS was still in place:
//
//   · three player-facing lines gated on `penalty > 0`, permanently false —
//     a rest refusal ("your wind is choked by hunger, not weariness"), a rest
//     result ("Hunger has capped your wind"), and a drink result ("water won't
//     lift it. Eat a ration");
//   · a heartbeat ledger entry `hunger +N (now -M max)` and an "eat something
//     soon" Arbiter warning, both behind hardcoded zeros;
//   · a write of the field onto every player object passing through
//     advanceTime — which is every action in the game;
//   · comments in five places still describing the tick as live, including one
//     telling the reader that eating "heals the cap shrink immediately".
//
// That is the same failure as the `hunger` difficulty dial OTA-1140 deleted:
// code that LOOKS live and is not. This suite is what stops it growing back.

import fs from 'fs';
import path from 'path';

const store: string = fs.readFileSync(
  path.join(__dirname, '../app/state/gameStore.ts'), 'utf8');
const types: string = fs.readFileSync(
  path.join(__dirname, '../app/engine/types.ts'), 'utf8');

/** Comment lines are allowed to SAY "hunger" — the removal has to be
 *  explainable. Only executable references are the problem. */
function codeLines(src: string): string[] {
  return src.split('\n').filter((l) => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  });
}

describe('OTA-1141 — nothing in the running game touches hunger', () => {
  const code = codeLines(store);

  it('⚠ the only executable mention left is the save-load migration', () => {
    // backfillPlayer forces the field to 0 so a save written mid-hunger comes
    // back uncapped. That is the ONE place allowed to name it.
    const hits = code.filter((l) => /hunger/i.test(l));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.trim()).toBe('hungerStaminaPenalty: 0,');
  });

  it('advanceTime no longer computes a tick or writes the field', () => {
    // It runs on every action in the game; a dead write there is the most
    // expensive kind of nothing.
    expect(store).toContain('return { ...player, hoursElapsed: newHours, dog };');
    expect(store).not.toContain('const newHunger = 0;');
    expect(store).not.toContain('hungerStaminaPenalty: newHunger');
  });

  it('⚠ eating writes HP and stamina, and nothing else — the owner\'s point exactly', () => {
    const eat = store.slice(store.indexOf('const prevHpEat = player.hp;'),
      store.indexOf('const prevHpEat = player.hp;') + 700);
    expect(eat).toContain('hp: player.hp + heal');
    expect(eat).toContain('stamina: player.stamina + stamGain');
    expect(eat).not.toContain('hungerStaminaPenalty');
  });

  it('the heartbeat has no hunger ledger line and no "eat something soon" warning', () => {
    expect(store).not.toContain('const hungerTicks = 0;');
    expect(store).not.toContain('hunger +${hungerTicks}');
    expect(store).not.toContain("You're running on empty. Eat something soon.");
  });
});

describe('OTA-1141 — the three unreachable lines are gone', () => {
  it('⚠ the rest REFUSAL no longer offers a hunger reason', () => {
    expect(store).not.toContain("your wind is choked by hunger, not weariness");
    // ...and the one honest refusal survives.
    expect(store).toContain('Your wind is full, your wounds are closed');
  });

  it('⚠ the rest RESULT no longer claims hunger capped anything', () => {
    expect(store).not.toContain('Hunger has capped your wind');
    expect(store).toContain('Whole already — the Aetherstone hums steady.');
  });

  it('⚠ the DRINK result no longer points at a ration', () => {
    expect(store).not.toContain("water won't lift it");
    // A zero-gain drink now has exactly one cause, and it is the true one.
    expect(store).toContain("You weren't tired; mostly you were thirsty.");
  });
});

describe('OTA-1141 — the cap has one owner and it cannot shrink', () => {
  it('effectiveStaminaMax returns the raw max, full stop', () => {
    const fn = store.slice(store.indexOf('function effectiveStaminaMax('),
      store.indexOf('function effectiveStaminaMax(') + 1400);
    expect(fn).toContain('return Math.max(1, player.staminaMax);');
    expect(fn).not.toMatch(/return[^;]*staminaMax\s*-/);
  });

  it('⚠ and the file says why nothing may reduce it again', () => {
    expect(store).toContain('NOTHING may reduce it');
    expect(store).toContain('it gets its own name');
  });

  it('the rest clamp survives the removal on its own merits', () => {
    // Math.max(0, ...) existed because a hunger-shrunk cap drove stamRoom
    // negative. The cause is gone; the invariant ("rest must never reduce
    // stamina") is not, so the clamp stays and the comment now says so.
    expect(store).toContain('const stamGain = Math.max(0, Math.min(stamRoom, hours));');
    expect(store).toContain('THE CLAMP STAYS');
  });
});

describe('OTA-1141 — the field is labelled a fossil so nobody wires it again', () => {
  it('the type carries a do-not-use warning, not a spec', () => {
    expect(types).toContain('SAVE FOSSIL. DO NOT WIRE ANYTHING TO THIS.');
    expect(types).toContain('EATING IS FOR HP AND STAMINA');
  });

  it('⚠ the old spec — the one that made it look live — is gone from the type', () => {
    expect(types).not.toContain('effectiveStaminaMax = staminaMax - this');
    expect(types).not.toContain('Increments by 1 every 8 in-game hours');
  });

  it('the removal reason is recorded where the next reader will look', () => {
    expect(types).toContain('a hidden, unexplained mechanic whose ONLY effect');
  });
});

describe('OTA-1141 — ⚠ the DOG\'s feeding clock is a different system and still lives', () => {
  it('loyalty still decays off lastFedAtHour', () => {
    // The owner drew the distinction that matters: eating for HP is not a
    // hunger mechanic. The dog IS on a real feeding clock, and this sweep must
    // not have taken it out on the way past.
    expect(store).toContain('const lastFed = dog.lastFedAtHour ?? 0;');
    expect(store).toContain('const newLoyalty = Math.max(0, dog.loyalty - decayTicks);');
  });

  it('and feeding it still resets that clock', () => {
    expect(store).toContain('lastFedAtHour: isConsumable ? fedHour');
  });
});
