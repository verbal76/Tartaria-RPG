/**
 * OTA-1564 — WHEN THE DICE COME UP PERFECT (slice 1b).
 *
 * ⚠⚠⚠ I UNDERCOUNTED THIS SLICE BY SIX TIMES. When I split slice 1 by risk I
 * called the threshold family "(4)". The catalog says "on a max roll" on
 * TWENTY-SIX weapons, and nothing anywhere has ever read one of them — it is the
 * single largest unread promise in the game, larger than the armour-ignore
 * family that took two whole OTAs. Worth writing down plainly, because the
 * estimate is what set the slice order.
 *
 * ⚠⚠⚠ WHY THIS SLICE IS RISKIER THAN 1a, IN ONE SENTENCE: 1a adjusted a number
 * BEFORE the roll. Everything here is decided AFTER one, and some of it has to
 * be remembered into the next round — which is where a bug survives a save/load
 * instead of showing up on the next swing.
 *
 * ⚠⚠⚠ THE OWNER'S CUT, VERBATIM: *"1b, do all except the once per encounter one.
 * remove that from the game."* Every per-encounter/per-day charge is a bank the
 * game must open at the start of a fight, spend, remember, and close — and the
 * Plasma Scythe's was *declinable*, which is a modal plus saved state plus a
 * cleanup. Three weapons carried one and all three now say the plain effect
 * underneath instead.
 *
 * ⚠⚠ I EXTENDED THAT CUT TO ORDINALS, and flag it as my call rather than his.
 * "on 5th max roll", "on first max roll", "on third max roll" are the same
 * bookkeeping wearing different words: each needs a tally that survives a round,
 * a fight and a save/load. Four weapons carried one. A PERMANENT stat gain was
 * kept, because write-once-forever needs only a flag saying it already happened.
 *
 * ⚠⚠ WHAT STILL WAITS. Stun, trip, knockback, AoE, reflect and the execute are
 * all max-roll payloads too, and the trigger below now fires for them — but
 * their payloads belong to systems this slice does not own (1c owns AoE, slice 2
 * owns on-hit statuses). They are not parsed, so no weapon quietly gains a
 * half-built version of its own signature move.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseWeaponEffect,
  damageRollIsMax,
  rollMaxRollBonus,
  maxRollShredAmount,
} from '../app/engine/weaponEffects';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

interface CatalogRow { name: string; rarity?: string; tags?: string[]; effect?: string }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CATALOG = require('../app/data/items/weapons.json') as { weapons?: CatalogRow[] } | CatalogRow[];
const WEAPONS: CatalogRow[] = Array.isArray(CATALOG) ? CATALOG : (CATALOG.weapons ?? []);
const row = (name: string): CatalogRow => {
  const found = WEAPONS.find((w) => w.name === name);
  if (!found) throw new Error(`catalog row missing: ${name}`);
  return found;
};
const PLATED = { traits: ['armored', 'field:aether_shield'], name: 'Iron Warden', type: 'Construct' };

describe('OTA-1564 — the trigger: did this swing come up perfect?', () => {
  it('⚠⚠⚠ IT READS THE FACES, NEVER THE TOTAL', () => {
    // The single most important assertion in the slice. `total` carries STR, the
    // race bonus, rune passives and the aether surge, so ANY total-based bar
    // would be cleared on ordinary dice by a well-built character — and every
    // Legendary's signature effect would fire on every single swing.
    expect(damageRollIsMax({ values: [6, 6], sides: 6 })).toBe(true);
    expect(damageRollIsMax({ values: [6, 5], sides: 6 })).toBe(false);
    expect(damageRollIsMax({ values: [1, 1], sides: 6 })).toBe(false);
  });

  it('⚠⚠⚠ IT SURVIVES DOUBLED DICE — a crit is when it matters most', () => {
    // A crit, a backstab and a perfect opening all double the dice count, and a
    // repeater multiplies it further. Any check against the weapon's PRINTED
    // dice count would go quiet on exactly the biggest swings in the game.
    expect(damageRollIsMax({ values: [10, 10, 10, 10], sides: 10 })).toBe(true);
    expect(damageRollIsMax({ values: [10, 10, 10, 9], sides: 10 })).toBe(false);
  });

  it('⚠⚠ THE FLOOR IS THE PLASMA CUTTER\'S WHOLE IDENTITY, and only its own', () => {
    // "Rolls of 19+ count as max roll" — the bar drops for that weapon and
    // nothing else changes about it.
    expect(parseWeaponEffect(row('Plasma Cutter').effect)?.maxRollFloor).toBe(19);
    expect(damageRollIsMax({ values: [19], sides: 20 }, 19)).toBe(true);
    expect(damageRollIsMax({ values: [19], sides: 20 })).toBe(false);
    expect(damageRollIsMax({ values: [18], sides: 20 }, 19)).toBe(false);
  });

  it('⚠⚠ a floor above the die\'s own top face is strict, not broken', () => {
    // A mis-authored "rolls of 19+" on a d6 weapon must still be reachable —
    // clamping to the die means it degrades to "max", not to "never".
    expect(damageRollIsMax({ values: [6], sides: 6 }, 19)).toBe(true);
  });

  it('⚠ an unrolled, empty or sideless step is never a max roll', () => {
    expect(damageRollIsMax(null)).toBe(false);
    expect(damageRollIsMax({ values: [], sides: 6 })).toBe(false);
    expect(damageRollIsMax({ values: [6] })).toBe(false);
  });
});

describe('OTA-1564 — the bookkeeping the owner had removed, and what I removed with it', () => {
  it('⚠⚠⚠ NOT ONE WEAPON IN THE CATALOG STILL CARRIES A PER-ENCOUNTER CHARGE', () => {
    // The owner's instruction, checked over the data rather than three names.
    const offenders = WEAPONS.filter((w) => /once per|per encounter|per day|per fight/i.test(w.effect ?? ''));
    expect(offenders.map((w) => w.name)).toEqual([]);
  });

  it('⚠⚠⚠ …NOR AN ORDINAL TALLY, which is the same thing in different words', () => {
    // "on the 5th max roll" needs a count that survives a round, a fight and a
    // save/load — exactly the state the per-encounter charge needed.
    const offenders = WEAPONS.filter((w) =>
      /\b(?:first|second|third|fourth|fifth|\d+(?:st|nd|rd|th))\s+max\b/i.test(w.effect ?? ''));
    expect(offenders.map((w) => w.name)).toEqual([]);
  });

  it('⚠⚠⚠ AND THE GUARD HOLDS EVEN IF ONE IS AUTHORED TOMORROW', () => {
    // The data is clean today; the parser is what keeps it honest. Without this
    // guard all three ordinal weapons fired on EVERY max roll — a Legendary's
    // signature payoff turning up several times a fight instead of once.
    expect(parseWeaponEffect('+2 STR (permanent) on 5th max roll.')?.onMaxRoll).toBeUndefined();
    expect(parseWeaponEffect('Bypasses shields permanently on third max roll.')?.onMaxRoll).toBeUndefined();
    expect(parseWeaponEffect('Permanent +1 STR on first max roll.')?.onMaxRoll).toBeUndefined();
  });

  it('⚠⚠ the three rewritten weapons kept their payload, only lost the counting', () => {
    // The point of removing the bookkeeping was never to remove the weapon.
    expect(parseWeaponEffect(row('Plasma Scythe').effect)?.onMaxRoll?.pierce).toBe('armor');
    expect(parseWeaponEffect(row('Tartarian Hand Axe').effect)?.onMaxRoll?.bonusDice).toBe('1d6');
    expect(parseWeaponEffect(row('Bone Spear Launcher').effect)?.onMaxRoll?.pierce).toBe('shields');
    expect(parseWeaponEffect(row('Giant Bone Spear').effect)?.onMaxRoll?.permanentStat)
      .toEqual({ stat: 'strength', amount: 2 });
  });

  it('⚠⚠ A PERMANENT STAT IS NOT DAMAGE — the mistake the first draft made', () => {
    // "+2 STR (permanent)" parsed as +2 bonus DAMAGE on the first pass. Two
    // Legendaries would have granted a small damage bump instead of the
    // character-defining payoff their card promises.
    const spear = parseWeaponEffect(row('Giant Bone Spear').effect)?.onMaxRoll;
    expect(spear?.bonusFlat).toBeUndefined();
    expect(spear?.bonusDice).toBeUndefined();
    expect(rollMaxRollBonus(spear)).toBe(0);
  });
});

describe('OTA-1564 — the payloads that landed, and the ones that deliberately did not', () => {
  it('⚠⚠⚠ BONUS DAMAGE IS READ OFF THE CLAUSE THAT CARRIES THE TRIGGER', () => {
    // "+1d6 energy; bypasses shield on max rolls" has TWO effects and only the
    // second waits on a max roll. Reading the LINE would make the flat +1d6
    // conditional and hand the player a weapon worse than its card most of the
    // time — the same clause-vs-line trap OTA-1562 had to solve for armour.
    const axe = parseWeaponEffect(row("Plasma Executioner's Axe").effect)?.onMaxRoll;
    expect(axe?.pierce).toBe('shields');
    expect(axe?.bonusDice).toBeUndefined();
  });

  it('⚠⚠⚠ THE SIX BONUS-DAMAGE WEAPONS ROLL SOMETHING, and nothing else does', () => {
    for (const name of ['Fusion Greatsword', 'Bone Scimitar', 'Tartarian Crown Blade',
                        'Energy Blade', "Mud Executioner's Blade", 'Tartarian Hand Axe']) {
      const spec = parseWeaponEffect(row(name).effect)?.onMaxRoll;
      expect(spec?.bonusDice).toBe('1d6');
      const rolled = rollMaxRollBonus(spec);
      expect(rolled).toBeGreaterThanOrEqual(1);
      expect(rolled).toBeLessThanOrEqual(6);
    }
    expect(rollMaxRollBonus(parseWeaponEffect(row('Plasma Dagger').effect)?.onMaxRoll)).toBe(5);
    expect(rollMaxRollBonus(null)).toBe(0);
  });

  it('⚠⚠⚠ A PIERCE OWED AFTER THE ROLL OPENS THE GUARD instead of lowering a beaten AC', () => {
    // The attack roll is long resolved by the time a damage die lands, so
    // "ignores armor on a max damage roll" CANNOT lower an AC that has already
    // been beaten — applying it there would be a no-op dressed as a mechanic.
    // Leaving the guard open through OTA-362's shred is both implementable and
    // closer to what "splits shields" means anyway.
    const scythe = parseWeaponEffect(row('Plasma Scythe').effect)?.onMaxRoll;
    expect(maxRollShredAmount(scythe, PLATED)).toBe(5);            // plate 2 + field 3
    const splitter = parseWeaponEffect(row('Bone Splitter Axe').effect)?.onMaxRoll;
    expect(maxRollShredAmount(splitter, PLATED)).toBe(3);          // the field only
    // …and an unarmoured foe gives back nothing, same rule as OTA-1562.
    expect(maxRollShredAmount(scythe, { traits: ['quick'], name: 'Rat' })).toBe(0);
  });

  it('⚠⚠ the authored shred amount wins over the derived one', () => {
    // The Mud Kukri names its own number ("reduces enemy armor by 1d6"), so the
    // armour actually present is not the cap — this is a lasting shred, not a
    // one-swing bypass, which is why it reads off the weapon rather than the foe.
    const kukri = parseWeaponEffect(row('Mud Kukri').effect)?.onMaxRoll;
    expect(kukri?.shredDice).toBe('1d6');
    const n = maxRollShredAmount(kukri, PLATED);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(6);
  });

  it('⚠⚠ THE PAYLOADS THIS SLICE DOES NOT OWN ARE NOT PARSED', () => {
    // Stun, trip, knockback, AoE, reflect and the execute all hang off a max
    // roll and the trigger now fires for them — but their payloads belong to
    // systems 1c and slice 2 own. Half-building one here is how a weapon ends up
    // with a signature move that fires and does nothing.
    for (const name of ['Energy Baton', 'Shock Gauntlet', 'Mud Long Axe', 'Shockwave Club',
                        'Giant Warblade', 'Aetheric Sword of Storms', 'Aetheric Deathblade',
                        'Plasma Buckler', 'Mud Army War Hammer']) {
      expect({ name, spec: parseWeaponEffect(row(name).effect)?.onMaxRoll }).toEqual({ name, spec: undefined });
    }
  });
});

describe('OTA-1564 — the repeater and the weapon that punishes you later', () => {
  it('⚠⚠⚠ THREE WEAPONS SAY THEY FIRE MORE THAN ONCE AND NOW DO', () => {
    expect(parseWeaponEffect(row('Plasma Pistol (Single)').effect)?.shotsPerRound).toBe(2);
    expect(parseWeaponEffect(row('Repeater Crossbow').effect)?.shotsPerRound).toBe(2);
    expect(parseWeaponEffect(row('Mud Repeater Crossbow').effect)?.shotsPerRound).toBe(3);
    // The word form and the digit form are the same claim.
    expect(parseWeaponEffect('Fires twice per round.')?.shotsPerRound).toBe(2);
    expect(parseWeaponEffect('Fires 3 bolts per round.')?.shotsPerRound).toBe(3);
    // "Fires once per round" is not a multi-shot claim, it is the default.
    expect(parseWeaponEffect('Fires 1 bolt per round.')?.shotsPerRound).toBeUndefined();
  });

  it('⚠⚠⚠ THE OVERHEAT RULE WAS PRINTED IN THE RULEBOOK AND NEVER IMPLEMENTED', () => {
    // ActionReferenceScreen has told players "Roll a natural 1 on a firearm:
    // jam. Spend an action to clear." for the entire life of the game, with no
    // code anywhere applying it. A rule stated in the rulebook screen and not
    // implemented is the worst version of this defect — the player has been told
    // to plan around it.
    expect(src('app/screens/ActionReferenceScreen.tsx')).toContain('natural 1 on a firearm: jam');
    expect(parseWeaponEffect(row('Plasma Handgun').effect)?.overheat)
      .toEqual({ rounds: 2, word: 'overheat' });
    expect(parseWeaponEffect(row('Aetheric Hand Cannon').effect)?.overheat)
      .toEqual({ rounds: 2, selfDice: '1d6', word: 'overload' });
    expect(parseWeaponEffect(row('Rust Rifle').effect)?.overheat)
      .toEqual({ rounds: 1, confirmed: true, word: 'jam' });
  });

  it('⚠⚠ the weapon\'s OWN WORD survives into the rule', () => {
    // An overload is not a jam is not an overheat. Reusing one noun for all
    // three would flatten three different weapons into one failure message.
    expect(parseWeaponEffect('Natural 1 → overload: 1d6 self damage.')?.overheat?.word).toBe('overload');
    expect(parseWeaponEffect('May jam on a natural 1.')?.overheat?.word).toBe('jam');
    expect(parseWeaponEffect('Natural 1 → overheat, useless 2 rounds.')?.overheat?.word).toBe('overheat');
  });

  it('⚠⚠ a natural 1 with no overheat clause is just a miss', () => {
    expect(parseWeaponEffect('Natural 1 → nothing in particular.')?.overheat).toBeUndefined();
    expect(parseWeaponEffect('+1d6 on max roll.')?.overheat).toBeUndefined();
  });
});

describe('OTA-1564 — the wiring', () => {
  const STORE = src('app/state/gameStore.ts');
  const RULES = src('app/engine/combatRules.ts');
  const TYPES = src('app/engine/types.ts');
  const PREVIEW = src('app/components/itemPreview.ts');

  it('⚠⚠⚠ the trigger is asked ONCE, off the damage step', () => {
    // Twenty-six weapons ask the same question. Twenty-six local copies of it is
    // how two of them end up disagreeing about what "max" means on a crit.
    expect(STORE).toContain('const swungMaxRoll = damageRollIsMax(damage, parsedEffect?.maxRollFloor);');
    expect(STORE).toContain('const maxRollBonus = swungMaxRoll ? rollMaxRollBonus(parsedEffect?.onMaxRoll) : 0;');
  });

  it('⚠⚠⚠ the bonus lands OUTSIDE the resistance multiplier, beside effectBonus', () => {
    // A weapon's signature effect is the weapon's, not the swing's damage type.
    // Folding it inside would let a resistant enemy halve the payoff the card
    // promised in full.
    expect(STORE).toContain('+ effectBonus + maxRollBonus + titleDmgBonus + surgeBonus)');
  });

  it('⚠⚠⚠ the OVERHEAT hangs off the ATTACK roll, because a natural 1 is a MISS', () => {
    // The damage step never runs on a miss, so anything reading it would never
    // fire. This is the mirror of the max-roll payloads and the reason both live
    // on the step that actually produced the number.
    expect(STORE).toContain('if (naturalRoll === 1) {');
    expect(STORE).toContain("const oh = parseWeaponEffect(hotWeapon?.effect)?.overheat;");
    expect(STORE).toContain("kind: 'weapon_overheated',");
  });

  it('⚠⚠⚠ the lock is by WEAPON NAME, so a jammed sidearm frees the other hand', () => {
    expect(STORE).toContain('label: hotWeapon.name,');
    expect(STORE).toContain("(e.label ?? '').toLowerCase() === String(swungName ?? '').toLowerCase()");
  });

  it('⚠⚠ the refusal sits ABOVE the stamina spend, like every other free refusal', () => {
    // A player who taps attack on a dead weapon must lose nothing — the same
    // courtesy the reach and elevation gates on this path already give.
    const gate = STORE.indexOf("The ${swungName} is still cooling");
    const spend = STORE.indexOf('advanceTime(spendStamina(sLive.player, STAMINA_COSTS.attack), 0.1)');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(spend);
  });

  it('⚠⚠ the extra shots ride the SAME line the crit and backstab use', () => {
    // One place decides how many dice a swing throws, so the four multipliers
    // can never disagree.
    expect(RULES).toContain('count: ((perfectOpening || backstab) ? dmg.count * 2 : dmg.count) * shotsPerRound,');
    expect(RULES).toContain('Math.max(1, Math.min(4, swungEffect?.shotsPerRound ?? 1))');
  });

  it('⚠⚠ the permanent stat is claimed ONCE EVER, keyed by weapon name', () => {
    // Not by instance id: two copies of the same Legendary must not pay twice.
    expect(TYPES).toContain('permanentStatWeapons?: string[];');
    expect(STORE).toContain('const claimed = pnow?.permanentStatWeapons ?? [];');
    expect(STORE).toContain('if (pnow && key && !claimed.includes(key)) {');
  });

  it('⚠ the card states the volley, the payoff and the cost before the coin is spent', () => {
    expect(PREVIEW).toContain('Fires ${parsedRules.shotsPerRound}× per round');
    expect(PREVIEW).toContain('On a max damage roll: ${parts.join(\'; \')}');
    expect(PREVIEW).toContain('Natural 1: ${o.word}s');
  });
});
