// ⚠⚠⚠ OTA-1611 — WEAK AND NOT WEAK ON THE SAME CARD.
//
// Owner, with a screenshot of an enemy portrait:
//   "how can the enemy be weak and not weak to the same things"
//
// The card read `WEAK Piercing, Slashing, Poison, Corruption` and three chips
// under it read `Not Weak: Slashing`, `Not Weak: Poison`, `Not Weak:
// Corruption`. Both halves described the same spawn, and only the chips were
// telling the truth: `randomizeEnemyDefense` stamps `inured:` on every one of a
// kind's weaknesses except the one it rolled, and `traitDefenses` — the input to
// the shared reconcile behind the WEAK line, the popup and the ★ — reads
// `resist:` and `vulnerable:` and nothing else. The cancellations fell on the
// floor, so the card kept advertising three weaknesses this individual did not
// have.
//
// The ROLL never had the bug: every swing goes through combineDamageTypeMatch,
// where `inured` lands ×1.0 — ordinary. So the card was sending him after a
// soft spot the dice would not honor. That is the OTA-1608 class of lie, in the
// one cell 1608 did not sweep.
//
// And the second report, same session: "why two enters?" — ENTER and ENTER
// OUTPOST side by side on one row. OTA-1606's chip predicate asked whether the
// LOCATION is an outpost; a location is a whole local grid, so the gate chip
// rode onto every tile of it, including the tile where a found structure offers
// its own ENTER. The gate stands on the anchor, where sceneBuilding is
// suppressed — so exactly one door can ever be offered per tile.

import { reconciledDefenses, knownEnemyWeaknesses } from '../app/engine/weaponGlyphs';
import { inuredTypes, traitDamageMultiplier, combineDamageTypeMatch } from '../app/engine/enemyTraits';
import { randomizeEnemyDefense } from '../app/engine/encounter';
import { enemyTypeDefenses } from '../app/engine/crafting';
import { canonicalDamageType } from '../app/engine/damageTypes';
import type { Enemy } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

function mk(over: Partial<Enemy> = {}): Enemy {
  return {
    name: 'Test Body', type: 'Human', rarity: 'Common', hp: 12,
    damage: '1d6 bludgeoning', abilityPoint: '+5', traits: [], ...over,
  } as never;
}

/** A deterministic stream so a spawn's profile is reproducible per seed. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

describe('OTA-1611 — the card cannot be weak and not weak at once', () => {
  it('⚠⚠⚠ HIS CARD, REBUILT: an inured type never reaches the WEAK line', () => {
    // The exact trait set his screenshot's chips reconstruct: a Human whose
    // profiler kept piercing and cancelled the other three.
    const e = mk({
      traits: ['vulnerable:piercing', 'inured:slashing', 'inured:poison', 'inured:corruption', 'profiled'],
    });
    const { weaknesses } = reconciledDefenses(e);
    expect(weaknesses).toContain('piercing');
    expect(weaknesses).not.toContain('slashing');
    expect(weaknesses).not.toContain('poison');
    expect(weaknesses).not.toContain('corruption');
    // The chips said all three. The card now says the same thing they do.
    expect(inuredTypes(e.traits)).toEqual(['slashing', 'poison', 'corruption']);
  });

  it('⚠⚠⚠ THE CARD AND THE DICE AGREE, on every profiled spawn of every kind', () => {
    // The whole point: what the WEAK line promises is what a swing of that type
    // actually gets. Sweep the real profiler across the bestiary's kinds and
    // several seeds, and cross-check each printed weakness against the multiplier
    // the combat roll would compute for it.
    const bestiary = JSON.parse(
      readFileSync(join(__dirname, '..', 'app', 'data', 'enemies', 'enemies.json'), 'utf8'),
    ) as Array<{ name: string; type?: string; damage?: string; traits?: string[] }>;
    const kinds = Array.from(new Set(bestiary.map((r) => r.type).filter(Boolean))) as string[];
    let checked = 0;
    for (const type of kinds) {
      for (let seed = 1; seed <= 12; seed++) {
        const spawn = randomizeEnemyDefense(mk({ type, traits: [] }), seeded(seed));
        const { weaknesses, resists } = reconciledDefenses(spawn);
        for (const w of weaknesses) {
          const typeMatch = (() => {
            const m = enemyTypeDefenses(type);
            return m.weak.includes(w) ? 'weak' as const : m.resist.includes(w) ? 'resist' as const : 'normal' as const;
          })();
          const { match } = combineDamageTypeMatch(typeMatch, traitDamageMultiplier(spawn.traits, w).match);
          // A card that says WEAK must describe a swing that lands harder.
          expect(match).toBe('weak');
          checked++;
        }
        for (const r of resists) {
          const m = enemyTypeDefenses(type);
          const typeMatch = m.weak.includes(r) ? 'weak' as const : m.resist.includes(r) ? 'resist' as const : 'normal' as const;
          const { multiplier } = combineDamageTypeMatch(typeMatch, traitDamageMultiplier(spawn.traits, r).match);
          expect(multiplier).toBeLessThan(1);
          checked++;
        }
        // And nothing the profiler cancelled may be advertised as soft.
        for (const i of inuredTypes(spawn.traits)) {
          expect(weaknesses.map((w) => canonicalDamageType(w))).not.toContain(canonicalDamageType(i));
        }
        // ⚠⚠ Nor may a body be cancelled AND armoured on the same type. That
        // contradiction (Aetheric Mutation drew resist:poison beside
        // inured:poison, because its thematic pool and its type map disagree
        // about poison) is what made the sweep above possible to fail on the
        // RESIST side: the roll met `inured:` first and landed ordinary while
        // the card printed RESIST. The mint no longer writes both.
        for (const i of inuredTypes(spawn.traits)) {
          expect(spawn.traits ?? []).not.toContain(`resist:${i}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(100); // the sweep actually swept
  });

  it('⚠⚠ inured cancels a WEAKNESS and leaves ARMOUR alone — a Construct keeps its plating', () => {
    // You cannot be "used to" something that was never soft. If the kind RESISTS
    // a type, an inured trait on it must not talk the resistance away.
    const m = enemyTypeDefenses('Construct');
    const armoured = m.resist[0];
    expect(armoured).toBeTruthy();
    const e = mk({ type: 'Construct', traits: [`inured:${armoured}`, 'profiled'] });
    expect(reconciledDefenses(e).resists).toContain(armoured);
    expect(reconciledDefenses(e).weaknesses).not.toContain(armoured);
  });

  it('⚠⚠ the ★ on the weapon button reads the same corrected verdict as the card', () => {
    // OTA-1553's rule: the star and the card answer from one function. If the
    // card stopped claiming slashing, a slashing blade must stop wearing a star.
    const e = mk({
      traits: ['vulnerable:piercing', 'inured:slashing', 'inured:poison', 'inured:corruption', 'profiled'],
    });
    const known = knownEnemyWeaknesses(e, { playerWisdom: 20 });
    expect(known).toContain('piercing');
    expect(known).not.toContain('slashing');
  });

  it('⚠ the reconcile has ONE implementation — the backfill copy is gone', () => {
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    // The hand-transcribed sum inside backfillEnemyIntelFromDefeats (which had
    // the identical inured hole) now calls the shared function.
    expect(GS).toContain('const { weaknesses: weak, resists: resist } = reconciledDefenses(e as never);');
    expect(GS).not.toContain('const dir = traitDir !== 0 ? traitDir : typeDir;');
    const WG = readFileSync(join(__dirname, '..', 'app', 'engine', 'weaponGlyphs.ts'), 'utf8');
    expect(WG).toContain('const inured = new Set(inuredTypes(enemy.traits).map((t) => canonicalDamageType(t)));');
  });

  it('⚠⚠⚠ ONE DOOR PER TILE: the gate chip and the gate verb stand on the anchor', () => {
    const IB = readFileSync(join(__dirname, '..', 'app', 'components', 'InputBox.tsx'), 'utf8');
    // The chip's predicate now carries the anchor test.
    expect(IB).toContain('const onAnchorTile = mapX === WORLD_MAP_CENTER_X && mapY === WORLD_MAP_CENTER_Y;');
    expect(IB).toContain('&& onAnchorTile && isHubLocation(hubLocationId)');
    const GS = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    // The typed verb carries it too, and refuses off-anchor instead of teleporting.
    expect(GS).toContain('if (enterShaped && wantsOutpost && hubHere && !atGate) {');
    expect(GS).toContain('if (enterShaped && hubHere && atGate && (wantsOutpost || !here)) {');
    // ⚠ And the two doors are structurally exclusive: sceneBuilding — the thing
    // the other ENTER enters — is suppressed on the anchor tile, so the tile that
    // offers ENTER OUTPOST can never also offer ENTER.
    expect(GS).toContain('const onAnchorTile = bX === WORLD_MAP_CENTER_X && bY === WORLD_MAP_CENTER_Y;');
    // Stated as the structural relationship rather than a quoted line: the
    // anchor test is what gates the buildingForTile lookup, so a tile offering
    // ENTER OUTPOST has no sceneBuilding to offer ENTER for.
    expect(/!onAnchorTile\s*\?\s*buildingForTile\(/.test(GS)).toBe(true);
  });
});
