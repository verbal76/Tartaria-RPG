/**
 * OTA-1575 — THE STONE MARKS YOU, AND IT MEANS SOMETHING NOW.
 *
 * ⚠⚠⚠ THE OWNER, HAVING JUST DONE IT: *"I just got 'the stone has marked you'
 * from the glyph storyline, let's have the mark give the character a buff for 3
 * rounds or something, so the climb was worth it."* His log, 18:29:31:
 *
 *     [combat] You take 2 damage from the rune's recognition.
 *     [world]  ★★ STORY THREAD COMPLETE — … The stone has marked you.
 *     [arbiter] "That is older than the Mud Monarchs. It will know you again."
 *
 * The whole payout was: LOSE 2 HP, +2 reputation, a memo. A two-step story beat
 * that ends by damaging you is not a reward, and "it will know you again" was a
 * promise the save file had nowhere to keep.
 *
 * ⚠⚠⚠ AND IT NEEDED A STATUS SEMANTIC THAT DID NOT EXIST — which is the real
 * finding here, not the content. There were exactly two kinds of timed status:
 *
 *   · an ordinary buff (`food_buff`) ticks EVERY ACTION regardless of combat, so
 *     three rounds granted at a standing stone in open country burn off over
 *     three steps of walking and are gone before an enemy ever appears;
 *   · a COMBAT_ONLY status EXPIRES the moment you are not in a fight, so the same
 *     grant is wiped on the spot.
 *
 * Both make the card lie. A reward earned by EXPLORING and spent in COMBAT is a
 * third thing, and `WAITS_FOR_COMBAT_STATUSES` is it: held intact, clock
 * untouched, until a fight starts.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { readFileSync } from 'fs';
import { join } from 'path';
import { tickEffects, applyEffect } from '../app/engine/statusEffects';
import type { StatusEffect } from '../app/engine/types';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const mark = (rounds = 3): StatusEffect => ({
  kind: 'stone_marked',
  remainingRounds: rounds,
  buffStat: 'wisdom',
  buffBonus: 2,
  label: "the stone's mark (+2 WIS)",
} as StatusEffect);

describe('OTA-1575 — the mark waits for the fight', () => {
  it('⚠⚠⚠ IT DOES NOT BURN OFF ON THE WALK HOME — the whole point', () => {
    // Ten actions of travelling, investigating, resting. An ordinary buff would
    // have been gone after three of them, before any enemy appeared, and the
    // owner would have climbed the obelisk for a line of text.
    let effects: StatusEffect[] = [mark()];
    for (let i = 0; i < 10; i++) effects = tickEffects(effects, { inCombat: false }).effects;
    expect(effects).toHaveLength(1);
    expect(effects[0]!.remainingRounds).toBe(3);
  });

  it('⚠⚠⚠ NOR IS IT WIPED THE MOMENT THE FIGHT ENDS — the other failure', () => {
    // COMBAT_ONLY_STATUSES expire out of combat. Had the mark been one of those,
    // it would have been destroyed on the very tick after it was granted.
    const out = tickEffects([mark()], { inCombat: false });
    expect(out.expired).toHaveLength(0);
    expect(out.effects).toHaveLength(1);
  });

  it('⚠⚠⚠ AND IT SPENDS ITSELF IN COMBAT, three rounds, then it is gone', () => {
    let effects: StatusEffect[] = [mark()];
    for (let i = 0; i < 3; i++) effects = tickEffects(effects, { inCombat: true }).effects;
    expect(effects).toHaveLength(0);
  });

  it('⚠⚠ the two clocks compose: walk a while, then fight', () => {
    // The realistic path — mark the stone, cross two tiles, meet something.
    let effects: StatusEffect[] = [mark()];
    for (let i = 0; i < 6; i++) effects = tickEffects(effects, { inCombat: false }).effects;
    expect(effects[0]!.remainingRounds).toBe(3);
    effects = tickEffects(effects, { inCombat: true }).effects;
    expect(effects[0]!.remainingRounds).toBe(2);
  });

  it('⚠⚠ it keeps its OWN kind, so it never collides with a food buff', () => {
    // `applyEffect` dedupes food_buff by buffStat. Had the mark been shipped as a
    // food_buff on wisdom, eating a Wild Carrot would have silently replaced it
    // (or been replaced by it) — two rewards, one slot.
    const carrot: StatusEffect = {
      kind: 'food_buff', remainingRounds: 20, buffStat: 'wisdom', buffBonus: 1,
      label: 'Wild Carrot (+1 WIS)',
    } as StatusEffect;
    const both = applyEffect([mark()], carrot);
    expect(both).toHaveLength(2);
    expect(both.map((e) => e.kind).sort()).toEqual(['food_buff', 'stone_marked']);
  });

  it('⚠⚠ effectiveStats counts it — a buff nothing reads is the defect, not the fix', () => {
    const EQ = src('app/engine/equipment.ts');
    expect(EQ).toContain("eff.kind !== 'food_buff' && eff.kind !== 'stone_marked'");
  });
});

describe('OTA-1575 — the obelisk beat actually grants it', () => {
  const HOOKS = src('app/engine/hooks.ts');
  const GS = src('app/state/gameStore.ts');

  it('⚠⚠⚠ THE BEAT HE PLAYED NOW PAYS SOMETHING', () => {
    // Same chain, same line, one more effect on it.
    expect(HOOKS).toContain('The stone has marked you.');
    expect(HOOKS).toContain("{ type: 'grant_buff', stat: 'wisdom', amount: 2, rounds: 3, label: \"the stone's mark\" }");
  });

  it('⚠⚠ WISDOM, because of what the Arbiter says next', () => {
    // "It will know you again." The stone recognises you, so what it sharpens is
    // recognition — the buff is chosen from the prose rather than bolted on.
    const at = HOOKS.indexOf("{ type: 'grant_buff', stat: 'wisdom'");
    const arb = HOOKS.indexOf('It will know you again');
    expect(at).toBeGreaterThan(0);
    expect(Math.abs(at - arb)).toBeLessThan(1200);
  });

  it('⚠⚠ the damage is still there — this added a reward, it did not remove a cost', () => {
    // The rune's recognition costing 2 HP is part of the beat's character. The
    // complaint was that it was the ONLY thing that happened.
    expect(HOOKS).toContain("{ type: 'damage', amount: 2, cause: 'the rune\\'s recognition' }");
  });

  it('⚠⚠⚠ AND THE HANDLER EXISTS — there was no grant_buff effect type at all before', () => {
    expect(HOOKS).toContain("| { type: 'grant_buff';");
    expect(GS).toContain("case 'grant_buff': {");
    expect(GS).toContain("kind: 'stone_marked',");
  });

  it('⚠ the player is told what they earned, in rounds, not in jargon', () => {
    expect(GS).toContain('for the first ${effect.rounds} rounds of your next fight.');
  });
});
