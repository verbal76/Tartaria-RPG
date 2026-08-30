/**
 * OTA-1572 — THE CARD SAYS STUNNED. Slice 2 of the weapon-effects program:
 * on-hit status effects.
 *
 * ⚠⚠⚠ THE FINDING IS BIGGER THAN THE SLICE BRIEF SAID. The brief estimated 25
 * weapons. The catalog sweep says 253 weapons carry effect text, 149 of those
 * parsed to NOTHING before this OTA, and 33 of them promise a control effect —
 * stun, prone, restrained, paralyze, slow, blind, knockback. That is the third
 * time in this program the estimate came in low (1a: 7 unknown pierce verbs;
 * 1b: I said 4, it was 26), and the cause is the same every time — the verb
 * list, not the catalog, was the ceiling.
 *
 * ⚠⚠⚠ AND NONE OF THE 33 COULD EVER HAVE WORKED. `currentScene.enemyStatuses`
 * has existed for a long time and every one of its kinds is damage-over-time:
 * `poison_coat`, `acid_coat`, `corruption_coat`, `typed_dot`. There has never
 * been a field on an enemy that could hold "stunned". The only code that ever
 * looked at a status promise, `rollIncomingStatusEffect`, keys off the DAMAGE
 * TYPE and never reads the weapon's text — so Energy Baton's "stuns target on
 * max roll" and a Rusted Blade's silence produced identical behaviour.
 *
 * ⚠⚠⚠ THE GUARD IS HALF THE FEATURE, NOT A FOLLOW-UP. OTA-1089 added `braced`
 * to the PLAYER for this exact hazard and its note carries the measurement:
 * *"a pack of concussive hitters re-rolling 20% per landed blow can't chain the
 * player's turns away (sim: 844 stuns/run before this)."* Thirty-three control
 * weapons with no mirror guard is that bug pointed the other way — and the worst
 * offender is not a Legendary, it is SPARKSTRIKE, a COMMON rune-caster whose
 * stun is unconditional and costs nothing.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseWeaponEffect, CONTROL_SKIPS } from '../app/engine/weaponEffects';
import {
  landControl, tickControl, isSkipControl, controlAttackPenalty,
  controlLabel, bracesAgainst, ENEMY_BRACE_ROUNDS,
} from '../app/engine/enemyControl';
import type { OnHitControl } from '../app/engine/weaponEffects';
import WEAPONS from '../app/data/items/weapons.json';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');
const catalog = (WEAPONS as unknown as { weapons: Array<Record<string, string>> }).weapons;
const byName = (n: string) => catalog.find((w) => w.name === n);
const ctlOf = (n: string) => parseWeaponEffect(byName(n)?.effect)?.onHitControl ?? null;

describe('OTA-1572 — the parser reads what the cards actually say', () => {
  it('⚠⚠⚠ SPARKSTRIKE, THE COMMON THAT WOULD HAVE ENDED EVERY DUEL', () => {
    // "1d6 lightning; 1-round stun on a hit." Unconditional, on a Common. This
    // is the weapon the brace exists for.
    expect(ctlOf('Sparkstrike')).toEqual({
      kind: 'stunned', rounds: 1, trigger: 'always', chance: undefined, threshold: undefined,
    });
  });

  it('⚠⚠⚠ EVERY GATED SPELLING IN THE CATALOG IS READ AS A GATE, not as "always"', () => {
    // Reading any of these as unconditional is how a weapon becomes a lock, so
    // each distinct spelling the catalog uses gets its own pin.
    expect(ctlOf('Energy Baton')?.trigger).toBe('max-roll');       // "on max roll"
    expect(ctlOf('Mud Long Axe')?.trigger).toBe('max-roll');       // "on a max damage roll"
    expect(ctlOf('Mud Shortsword')?.trigger).toBe('chance');       // "50% chance"
    expect(ctlOf('Mud Shortsword')?.chance).toBe(0.5);
    expect(ctlOf('Bone Cleaver')?.trigger).toBe('chance');         // "even/odd reroll"
    expect(ctlOf('Gravity Hammer')?.trigger).toBe('chance');       // "to confirm"
    expect(ctlOf('Slick Mud')?.trigger).toBe('chance');            // "DEX save or fall"
    // ⚠ "even = stun for 3 turns" — my first draft read this as unconditional
    // and handed a Legendary a permanent 3-round stun. It is a coin flip.
    expect(ctlOf('Energy Pike')?.trigger).toBe('chance');
    expect(ctlOf('Energy Pike')?.rounds).toBe(3);
  });

  it('⚠⚠⚠ THE COLD WEAPONS SEIZE MACHINES, NOT PEOPLE', () => {
    // Killing Frost is "deep enough to seize a Construct's joints outright";
    // Frost Maul "seizes machinery and staggers the living". Read without the
    // restriction, a Rare melee weapon paralyses everything it touches — both a
    // lie about the card and the strongest weapon in the game by a distance.
    expect(ctlOf('Killing Frost')?.kind).toBe('paralyzed');
    expect(ctlOf('Killing Frost')?.restrictedTo).toBe('construct');
    expect(ctlOf('Killing Frost')?.fallback).toBeUndefined();
    // Frost Maul names what everyone else gets, so everyone else gets it.
    expect(ctlOf('Frost Maul')?.restrictedTo).toBe('construct');
    expect(ctlOf('Frost Maul')?.fallback).toBe('slowed');
  });

  it('⚠⚠ the verbs the catalog actually uses, not the ones a rulebook would', () => {
    // Every one of these is a real string from weapons.json, and not one of them
    // uses the word its condition is named after. This is the ceiling that has
    // been the real limit in all three previous slices.
    expect(ctlOf('Mud Grip')?.kind).toBe('restrained');       // "Immobilizes"
    expect(ctlOf('Vine Grasp')?.kind).toBe('restrained');     // "vines to entangle"
    expect(ctlOf('Rime Spike')?.kind).toBe('slowed');         // "strikes late"
    expect(ctlOf('Sickening Light')?.kind).toBe('slowed');    // "the target sickens"
    expect(ctlOf('Force Wave')?.kind).toBe('knockback');      // "10 ft knockback"
    expect(ctlOf('Shockwave Buckler')?.kind).toBe('knockback'); // "push enemies to far"
    expect(ctlOf('Earthshaker')?.kind).toBe('prone');         // "knocks the target prone"
  });

  it('⚠⚠ durations come off the card, and "Instantaneous" is still one round', () => {
    expect(ctlOf('Tangle Roots')?.rounds).toBe(5);
    expect(ctlOf('Aetheric Shackle')?.rounds).toBe(3);
    expect(ctlOf('Mud Spray')?.rounds).toBe(2);
    // A zero-round control would read on the card as a promise and do nothing —
    // the exact defect this whole program exists to close.
    expect(ctlOf('Mud Wave')?.rounds).toBe(1);
    for (const w of catalog) {
      const c = parseWeaponEffect(w.effect)?.onHitControl;
      if (c) expect(c.rounds).toBeGreaterThanOrEqual(1);
    }
  });

  it('⚠⚠ a weapon that promises two controls gets the more severe, never both', () => {
    // Wrath of Titans: "massive AoE stun + knockback". Two controls off one
    // swing is a lock however it is spelled.
    const c = ctlOf('Wrath of Titans');
    expect(c?.kind).toBe('stunned');
    expect(Object.keys(c ?? {})).not.toContain('second');
  });

  it('⚠ an ordinary weapon still parses to no control at all', () => {
    expect(ctlOf('Rusted Blade')).toBeNull();
    expect(parseWeaponEffect('+1d6 against constructs.')?.onHitControl).toBeUndefined();
  });

  it('⚠ the sweep is real: a material number of cards, and every kind is known', () => {
    const kinds = new Set<string>();
    let n = 0;
    for (const w of catalog) {
      const c = parseWeaponEffect(w.effect)?.onHitControl;
      if (!c) continue;
      n++;
      kinds.add(c.kind);
    }
    expect(n).toBeGreaterThanOrEqual(30);
    for (const k of kinds) {
      expect(controlLabel(k as never)).toEqual(expect.any(String));
    }
  });
});

describe('OTA-1572 — the anti-lock guard, which is half the feature', () => {
  const stun: OnHitControl = { kind: 'stunned', rounds: 1, trigger: 'always' };
  const land = (brace: number) =>
    landControl({ control: stun, sourceName: 'Sparkstrike', braceRounds: brace, restrictionMet: true, triggered: true });

  it('⚠⚠⚠ SPARKSTRIKE CANNOT CHAIN — the 844-stuns/run shape, pointed the other way', () => {
    // Round 1: the stun lands and grants the brace.
    const first = land(0);
    expect(first?.control.kind).toBe('stunned');
    expect(first?.braceRounds).toBe(ENEMY_BRACE_ROUNDS);
    // Round 2: the enemy is braced, so the next unconditional stun is REFUSED.
    expect(land(first!.braceRounds)).toBeNull();
  });

  it('⚠⚠⚠ THE BRACE OUTLIVES THE STUN IT WAS GRANTED FOR, which is the whole mechanism', () => {
    // If they shared a clock, a 1-round stun and a 1-round immunity would expire
    // together and the very next swing would re-stun forever. Walk the rounds.
    let c = land(0)!;
    let state: ReturnType<typeof tickControl> = { control: c.control, braceRounds: c.braceRounds };
    // After one tick the 1-round stun is gone…
    state = tickControl(state.control, state.braceRounds);
    expect(state.control).toBeNull();
    // …but the immunity is NOT, so the enemy is guaranteed its swing.
    expect(state.braceRounds).toBeGreaterThan(0);
    expect(landControl({ control: stun, sourceName: 'x', braceRounds: state.braceRounds, restrictionMet: true, triggered: true })).toBeNull();
  });

  it('⚠⚠⚠ AND THE LOCK IS BOUNDED: an enemy always gets a swing between stuns', () => {
    // The property that matters, walked over ten rounds of a player swinging an
    // unconditional stunner every single round. Anything above zero free rounds
    // is a broken fight; the guarantee is that free rounds keep arriving.
    let control: ReturnType<typeof tickControl>['control'] = null;
    let brace = 0;
    let freeRounds = 0;
    for (let round = 0; round < 10; round++) {
      const r = landControl({ control: stun, sourceName: 'Sparkstrike', braceRounds: brace, restrictionMet: true, triggered: true });
      if (r) { control = r.control; brace = r.braceRounds; }
      if (!isSkipControl(control)) freeRounds++;
      const t = tickControl(control, brace);
      control = t.control; brace = t.braceRounds;
    }
    expect(freeRounds).toBeGreaterThanOrEqual(4);
  });

  it('⚠⚠ HINDER KINDS NEVER BRACE — a slow is not a lock, and bracing on it would spend the immunity the stun needs', () => {
    for (const k of ['stunned', 'paralyzed', 'restrained'] as const) expect(bracesAgainst(k)).toBe(true);
    for (const k of ['prone', 'slowed', 'blinded', 'knockback'] as const) expect(bracesAgainst(k)).toBe(false);
    const slow: OnHitControl = { kind: 'slowed', rounds: 2, trigger: 'always' };
    const r = landControl({ control: slow, sourceName: 'Rime Spike', braceRounds: 0, restrictionMet: true, triggered: true });
    expect(r?.braceRounds).toBe(0);
    // …and a braced enemy still takes a slow, because the brace is about
    // incapacitation, not about being inconvenienced.
    expect(landControl({ control: slow, sourceName: 'Rime Spike', braceRounds: 2, restrictionMet: true, triggered: true })).not.toBeNull();
  });

  it('⚠⚠ a swing that did not earn the control lands nothing at all', () => {
    expect(landControl({ control: stun, sourceName: 'x', braceRounds: 0, restrictionMet: true, triggered: false })).toBeNull();
  });

  it('⚠⚠ the machine restriction is honoured, and the fallback is what the card promises', () => {
    const frost: OnHitControl = { kind: 'paralyzed', rounds: 1, trigger: 'always', restrictedTo: 'construct' };
    // A person is not a machine: Killing Frost names no fallback, so nothing lands.
    expect(landControl({ control: frost, sourceName: 'Killing Frost', braceRounds: 0, restrictionMet: false, triggered: true })).toBeNull();
    // Frost Maul names one, so the living get staggered instead of paralysed.
    const maul: OnHitControl = { ...frost, fallback: 'slowed' };
    const r = landControl({ control: maul, sourceName: 'Frost Maul', braceRounds: 0, restrictionMet: false, triggered: true });
    expect(r?.control.kind).toBe('slowed');
    // …and because the fallback is a hinder kind, it costs no brace.
    expect(r?.braceRounds).toBe(0);
  });
});

describe('OTA-1572 — what a control actually costs the enemy', () => {
  it('⚠⚠⚠ SKIP KINDS TAKE THE SWING; HINDER KINDS ONLY MAKE IT WORSE', () => {
    const mk = (kind: string) => ({ kind, roundsRemaining: 1, sourceName: 'w' } as never);
    for (const k of ['stunned', 'paralyzed', 'restrained']) {
      expect(isSkipControl(mk(k))).toBe(true);
      expect(controlAttackPenalty(mk(k))).toBe(0); // it never swings, so no penalty applies
    }
    for (const k of ['prone', 'slowed', 'blinded', 'knockback']) {
      expect(isSkipControl(mk(k))).toBe(false);
      expect(controlAttackPenalty(mk(k))).toBeLessThan(0);
    }
    // Blinded is the worst of the hinders, because it cannot see you at all.
    expect(controlAttackPenalty(mk('blinded'))).toBeLessThan(controlAttackPenalty(mk('prone')));
  });

  it('⚠⚠ an expired control costs nothing — the clock is real', () => {
    const spent = { kind: 'stunned', roundsRemaining: 0, sourceName: 'w' } as never;
    expect(isSkipControl(spent)).toBe(false);
    expect(controlAttackPenalty(spent)).toBe(0);
  });

  it('⚠⚠ CONTROL_SKIPS and the engine agree — one definition, not two', () => {
    // The parser and the combat loop both branch on severity. Two copies of that
    // list is how they come to disagree, which is OTA-1564's lesson exactly.
    for (const k of ['stunned', 'paralyzed', 'restrained'] as const) expect(CONTROL_SKIPS.has(k)).toBe(true);
    for (const k of ['prone', 'slowed', 'blinded', 'knockback'] as const) expect(CONTROL_SKIPS.has(k)).toBe(false);
  });
});

describe('OTA-1572 — it is wired, not merely built', () => {
  const CR = src('app/state/combatResolution.ts');
  const GS = src('app/state/gameStore.ts');

  it('⚠⚠⚠ THE COUNTER-ATTACK LOOP ACTUALLY SKIPS A HELD ENEMY', () => {
    // Placed beside the knocked-out skip because it is the same claim at a
    // smaller scale: this body is not acting this round.
    expect(CR).toContain('if (liveScene.enemyKnockedOut?.[liveIdx]) continue;');
    expect(CR).toContain('const ctrlNow = liveScene.enemyControl?.[liveIdx];');
    expect(CR).toContain('if (isSkipControl(ctrlNow)) {');
    expect(CR.indexOf('const ctrlNow')).toBeGreaterThan(CR.indexOf('enemyKnockedOut?.[liveIdx]) continue;'));
  });

  it('⚠⚠⚠ THE CONTROL IS GRANTED ONLY THROUGH landControl, so no call site can skip the brace', () => {
    expect(GS).toContain('const landed = landControl({');
    expect(GS).toContain('braceRounds: currentScene.enemyBraced?.[idxCtl] ?? 0,');
    // The store must never construct an EnemyControlState by hand.
    expect(GS).not.toMatch(/enemyControl\[[^\]]*\]\s*=\s*\{\s*kind:/);
  });

  it('⚠⚠ the clock ticks AFTER the skips are taken, or a 1-round stun costs nobody a swing', () => {
    const skipAt = CR.indexOf('if (isSkipControl(ctrlNow))');
    const tickAt = CR.indexOf('tickEnemyControls(get, set);');
    expect(skipAt).toBeGreaterThan(0);
    expect(tickAt).toBeGreaterThan(skipAt);
  });

  it('⚠⚠ the player is TOLD, both when it lands and while it holds', () => {
    // A skipped swing with no line is indistinguishable from an enemy that
    // missed — which is the same defect as a card the engine ignores: the
    // effect exists and the player cannot tell.
    expect(GS).toContain('is ${lbl} — ${rds} round');
    expect(CR).toContain('held by your last blow');
  });

  it('⚠⚠ the threshold trigger reuses OTA-1564’s reader rather than inventing a second one', () => {
    expect(GS).toContain("ctl.trigger === 'threshold' ? damageRollIsMax(damage, ctl.threshold)");
  });

  it('⚠ the scene carries both halves, and the brace is not optional', () => {
    expect(GS).toContain('enemyControl?: Array<');
    expect(GS).toContain('enemyBraced?: number[];');
  });
});
