/**
 * OTA-1566 — THE FIRST ONE IS THE ONE THAT COUNTS.
 *
 * ⚠⚠⚠ THE OWNER OVERRULED TWO OF MY CUTS, AND WAS RIGHT ON BOTH. Verbatim:
 * *"1a, keep the on first roll buff and change the on 3rd and 5th roll to on
 * first roll on the weapons they were on. 1b, add the explode option back to it,
 * and add a counter number in the text after you use it."*
 *
 * ⚠⚠⚠ THE FIRST RULING DISSOLVES THE PROBLEM RATHER THAN ACCEPTING IT. I had
 * removed the ordinal payloads because "on the 5th max roll" needs a TALLY that
 * survives a round, a fight and a save/load. Rewriting them as "on your FIRST
 * max roll" keeps every payload and reduces the state to a FLAG — already
 * happened, or not. Same words, completely different amount of machinery, and
 * only one of the two can go wrong quietly. Three weapons get their effect back
 * and the deeper ordinals stay refused by the parser, so a future author has to
 * write a first rather than getting silent per-swing firing.
 *
 * ⚠⚠⚠ THE SECOND RULING IS A BETTER MECHANIC THAN THE ONE I CUT. I removed the
 * Plasma Repeater Rifle's *"After 4 overheats it explodes"* as another hidden
 * counter. The owner put it back AND asked for the number to be shown — which is
 * the difference between a bomb and an ambush. A visible fuse asks the player a
 * question every round (keep firing, or holster it?); a hidden one just takes
 * their HP at a moment they could not have seen coming. It is still a tally, but
 * a tally the player can read is a different object from one they cannot.
 *
 * ⚠⚠ AND THE UNLOCK RIDES THE ORDINARY AC STEP AFTERWARDS. Once the Bone Spear
 * Launcher has landed its first max roll, "bypasses shields PERMANENTLY" means
 * exactly that: the bypass folds in beside the weapons that were born with one,
 * rather than living in a second place that could disagree. The unlock is the
 * event; the pierce is just what the weapon is from then on.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseWeaponEffect } from '../app/engine/weaponEffects';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

interface CatalogRow { name: string; rarity?: string; effect?: string }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CATALOG = require('../app/data/items/weapons.json') as { weapons?: CatalogRow[] } | CatalogRow[];
const WEAPONS: CatalogRow[] = Array.isArray(CATALOG) ? CATALOG : (CATALOG.weapons ?? []);
const row = (name: string): CatalogRow => {
  const found = WEAPONS.find((w) => w.name === name);
  if (!found) throw new Error(`catalog row missing: ${name}`);
  return found;
};

describe('OTA-1566 — the ordinals come back as firsts', () => {
  it('⚠⚠⚠ ALL THREE WEAPONS HAVE THEIR PAYLOAD BACK, on the first max roll', () => {
    expect(parseWeaponEffect(row('Bone Spear Launcher').effect)?.onMaxRoll)
      .toEqual({ onceEver: true, permanentPierce: 'shields' });
    expect(parseWeaponEffect(row('Giant Bone Spear').effect)?.onMaxRoll)
      .toEqual({ onceEver: true, permanentStat: { stat: 'strength', amount: 2 } });
    expect(parseWeaponEffect(row('Plasma Hand Cannon').effect)?.onMaxRoll)
      .toEqual({ onceEver: true, permanentStat: { stat: 'strength', amount: 1 } });
  });

  it('⚠⚠⚠ A FIRST IS A FLAG; A FIFTH IS A TALLY — and only the flag is allowed', () => {
    // This is the whole reason the owner's rewrite works where the original
    // wording could not. "Already happened / not yet" survives a save trivially;
    // "you are 3 of 5 through this" is state that can drift, double-count, or be
    // lost, on a payload that is permanent and unrepeatable.
    expect(parseWeaponEffect('+2 STR permanently on your first max damage roll.')?.onMaxRoll?.onceEver).toBe(true);
    expect(parseWeaponEffect('+2 STR permanently on your fifth max damage roll.')?.onMaxRoll).toBeUndefined();
    expect(parseWeaponEffect('Bypasses shields on your 3rd max roll.')?.onMaxRoll).toBeUndefined();
  });

  it('⚠⚠⚠ NOT ONE DEEPER ORDINAL SURVIVES IN THE CATALOG', () => {
    const offenders = WEAPONS.filter((w) =>
      /\b(?:second|third|fourth|fifth|\d+(?:nd|rd|th))\s+max\b/i.test(w.effect ?? ''));
    expect(offenders.map((w) => w.name)).toEqual([]);
  });

  it('⚠⚠ A PERMANENT PIERCE IS NOT A PER-SWING PIERCE', () => {
    // Routing "bypasses shields PERMANENTLY" through the ordinary `pierce` field
    // would re-earn it on every perfect roll and never actually make it
    // permanent — the weapon would read as working while doing the wrong thing.
    const launcher = parseWeaponEffect(row('Bone Spear Launcher').effect)?.onMaxRoll;
    expect(launcher?.pierce).toBeUndefined();
    expect(launcher?.permanentPierce).toBe('shields');
    // …and an ordinary per-swing pierce is still exactly that.
    expect(parseWeaponEffect(row('Plasma Scythe').effect)?.onMaxRoll?.pierce).toBe('armor');
    expect(parseWeaponEffect(row('Plasma Scythe').effect)?.onMaxRoll?.permanentPierce).toBeUndefined();
  });

  it('⚠ the permanent stat is still not read as damage', () => {
    // The bug from 1b's first draft, re-pinned across the reworded lines.
    const spear = parseWeaponEffect(row('Giant Bone Spear').effect)?.onMaxRoll;
    expect(spear?.bonusFlat).toBeUndefined();
    expect(spear?.bonusDice).toBeUndefined();
  });
});

describe('OTA-1566 — the fuse, and the number on it', () => {
  it('⚠⚠⚠ THE EXPLOSION IS BACK, WITH ITS COUNT AND ITS DICE', () => {
    expect(parseWeaponEffect(row('Plasma Repeater Rifle').effect)?.overheat)
      .toEqual({ explodeAfter: 4, explodeDice: '1d10', rounds: 1, confirmed: true, word: 'overheat' });
  });

  it('⚠⚠⚠ THE OTHER THREE OVERHEAT WEAPONS DID NOT QUIETLY GAIN A FUSE', () => {
    // A weapon that detonates in your hands is a big property to acquire by
    // accident from a shared parser.
    for (const name of ['Plasma Handgun', 'Aetheric Hand Cannon', 'Rust Rifle']) {
      expect({ name, fuse: parseWeaponEffect(row(name).effect)?.overheat?.explodeAfter })
        .toEqual({ name, fuse: undefined });
    }
  });

  it('⚠⚠ a fuse with no stated dice still detonates, at the default', () => {
    const p = parseWeaponEffect('Natural 1 → overheat, useless 1 round. After 3 overheats it explodes.');
    expect(p?.overheat?.explodeAfter).toBe(3);
    expect(p?.overheat?.explodeDice).toBeUndefined();
  });
});

describe('OTA-1566 — the wiring', () => {
  const STORE = src('app/state/gameStore.ts');
  const RULES = src('app/engine/combatRules.ts');
  const TYPES = src('app/engine/types.ts');
  const PREVIEW = src('app/components/itemPreview.ts');

  it('⚠⚠⚠ the unlock is claimed ONCE, keyed by weapon name', () => {
    expect(TYPES).toContain('permanentPierceWeapons?: string[];');
    expect(STORE).toContain("if (pNow && wkey && !(pNow.permanentPierceWeapons ?? []).includes(wkey)) {");
  });

  it('⚠⚠⚠ …and AFTERWARDS it rides the ordinary AC step, not a second path', () => {
    // One authority on how much armour a swing ignores. A parallel subtraction
    // for unlocked weapons is how the two end up disagreeing about the floor.
    expect(RULES).toContain('const unlockedPierce = equipped');
    expect(RULES).toContain('(player.permanentPierceWeapons ?? []).includes(equipped.name)');
    expect(RULES).toContain('armorIgnoreReduction(swungEffect?.armorIgnore ?? unlockedPierce, enemy)');
  });

  it('⚠⚠⚠ THE COUNTER IS SHOWN IN THE LINE, which is what the owner asked for', () => {
    // "add a counter number in the text after you use it". Without this the fuse
    // is an ambush; with it, it is a decision the player makes each round.
    expect(STORE).toContain('fuseNote = ` (${banked}/${oh.explodeAfter} before it goes)`;');
  });

  it('⚠⚠⚠ the count RESETS on detonation', () => {
    // Left banked, the weapon would detonate on every shot from then on — that
    // is a broken weapon, not a dangerous one.
    expect(STORE).toContain('overheatCounts: { ...(s.player.overheatCounts ?? {}), [key]: 0 }');
    expect(TYPES).toContain('overheatCounts?: Record<string, number>;');
  });

  it('⚠⚠ the blast is centred on YOU, so it is your band that burns', () => {
    // "1d10 to everyone in your range" — the gun is in your hands, so the
    // reference point is the player, not the thing being shot at.
    expect(STORE).toContain("if (enemyBandOf(boomScene, i) !== 'close') return;");
    expect(STORE).toContain("hp: Math.max(0, s.player.hp - detonated)");
    expect(STORE).toContain("to everything at arm's reach — you included");
  });

  it('⚠ the card states the fuse and the permanence before the coin is spent', () => {
    expect(PREVIEW).toContain('After ${o.explodeAfter} ${o.word}s it EXPLODES');
    expect(PREVIEW).toContain('bypassed permanently from then on');
    expect(PREVIEW).toContain("m.onceEver ? ' (once ever)' : ''");
  });
});
