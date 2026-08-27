// OTA-1513 — THE OTHER SIDE OF THE VIAL (enemy weapon coatings).
//
// ⚠⚠⚠ Owner, verbatim: *"my stacked AC makes me a little overpowered mid game.
// I had discussed with a previous you that enemies should have weapon coatings
// as well. we need a roll when the enemy is born to see if it will have a
// coating, and what it will be if it does. and we need to take damage from it
// like they do, it will have to factor in resists from my armor, so it will
// have to roll on each attack what piece of armor their attack lands on. that
// way we can see if my coatings have any effect."*
//
// ⚠⚠ WHY A COATING IS THE RIGHT ANSWER TO STACKED AC, stated once so the next
// reader does not retune the wrong dial: AC is a MISS-CHANCE stat, so every
// point removes enemy attacks from the game entirely and nothing downstream of
// the to-hit roll ever runs. Coating damage rides on the blows that DID land —
// it cannot be stacked out of existence, so it restores a floor of pressure
// without touching the number he spent the mid-game earning. And because
// coating damage is always TYPED, it finally gives armour resistances (on
// nearly all 279 pieces since arb116) something that asks about them.

import {
  rollEnemyCoating, coatingChanceFor, coatingKindsFor, rollHitLocation,
  ailmentForCoating, corruptionFromCoating, HIT_LOCATION_WEIGHTS,
} from '../app/engine/enemyCoating';
import { scaledEnemyForContext } from '../app/engine/encounter';
import type { Enemy } from '../app/engine/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const COMBAT = readFileSync(join(ROOT, 'app', 'state', 'combatResolution.ts'), 'utf8');

const foe = (over: Partial<Enemy> = {}): Enemy => ({
  name: 'Mud Raider', type: 'Human', abilityPoint: 'Strength 6', attack: 'Cudgel',
  damage: '10', hp: 60, rarity: 'Common', loot: [], ...over,
});

/** A deterministic 0..1 source: feeds the given values in order, then repeats
 *  the last one, so a test says exactly what the two rolls saw. */
const rolls = (...vals: number[]) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)]!;
};

describe('OTA-1513 — the roll at birth', () => {
  it('⚠⚠⚠ THE CURVE BITES MID-GAME, NOT AT THE START — his complaint was about mid game', () => {
    // A new character's commons stay almost entirely clean; the rarities that
    // only appear once an AC stack exists are where it lands.
    expect(coatingChanceFor(foe({ rarity: 'Common' }))).toBeLessThan(0.1);
    expect(coatingChanceFor(foe({ rarity: 'Rare' }))).toBeGreaterThan(coatingChanceFor(foe({ rarity: 'Common' })));
    expect(coatingChanceFor(foe({ rarity: 'Legendary' }))).toBeGreaterThan(coatingChanceFor(foe({ rarity: 'Rare' })));
    expect(coatingChanceFor(foe({ boss: true }))).toBeGreaterThan(coatingChanceFor(foe({ rarity: 'Legendary' })));
    // Danger nudges, never drives, and is capped — no tile turns every swing toxic.
    expect(coatingChanceFor(foe({ rarity: 'Common' }), 5))
      .toBeGreaterThan(coatingChanceFor(foe({ rarity: 'Common' }), 0));
    expect(coatingChanceFor(foe({ boss: true }), 99)).toBeLessThanOrEqual(0.6);
  });

  it('⚠⚠ what it carries follows from what it IS — a mud raider does not swing plasma', () => {
    expect(coatingKindsFor(foe({ type: 'mud_revenant' }))).toEqual(['poison', 'acid']);
    expect(coatingKindsFor(foe({ type: 'aether_construct' }))).toEqual(['electrical', 'corruption']);
    expect(coatingKindsFor(foe({ name: 'Plasma Cultist', type: 'Human' }))).toEqual(['burn', 'electrical']);
    // Anything unclassified still gets the two mundane battlefield poisons.
    expect(coatingKindsFor(foe({ name: 'Nobody', type: 'Human' }))).toEqual(['poison', 'acid']);
  });

  it('⚠⚠ a low roll arms it, a high roll leaves it clean — and the kind comes from its own table', () => {
    expect(rollEnemyCoating(foe({ rarity: 'Rare', type: 'mud_revenant' }), rolls(0.01, 0.0)))
      .toEqual({ kind: 'poison', dice: '1d4' });
    expect(rollEnemyCoating(foe({ rarity: 'Rare', type: 'mud_revenant' }), rolls(0.01, 0.99)))
      .toEqual({ kind: 'acid', dice: '1d4' });
    expect(rollEnemyCoating(foe({ rarity: 'Common' }), rolls(0.99))).toBeNull();
  });

  it('⚠ dice scale with the ENEMY, so a coating never becomes why a common kills him', () => {
    expect(rollEnemyCoating(foe({ rarity: 'Common' }), rolls(0))!.dice).toBe('1d3');
    expect(rollEnemyCoating(foe({ rarity: 'Rare' }), rolls(0))!.dice).toBe('1d4');
    expect(rollEnemyCoating(foe({ boss: true }), rolls(0))!.dice).toBe('1d6');
  });

  it('⚠⚠⚠ EVERY enemy is born through the scaler, so one hook covers the whole population', () => {
    // scaledEnemyForContext is where a spawn DEFINITION becomes this fight's
    // enemy. An always-hit rng proves the wiring on the ordinary path…
    const armed = scaledEnemyForContext(foe({ rarity: 'Legendary', type: 'mud_revenant' }), 3, 5, () => 0);
    expect(armed.coating).toEqual({ kind: 'poison', dice: '1d6' });
    // …and an always-miss rng proves a clean weapon is still the common case.
    expect(scaledEnemyForContext(foe(), 0, 1, () => 0.99).coating).toBeUndefined();
  });

  it('⚠⚠ the roll is IDEMPOTENT — a re-scale never re-decides what the blade is', () => {
    const born = scaledEnemyForContext(foe({ rarity: 'Rare', type: 'aether_construct' }), 2, 4, () => 0);
    expect(born.coating).toBeTruthy();
    const rescaled = scaledEnemyForContext(born, 2, 9, () => 0.99); // would have rolled clean
    expect(rescaled.coating).toEqual(born.coating);
  });
});

describe('OTA-1513 — where the blow lands', () => {
  it('⚠⚠ the table is a real distribution over all six worn slots', () => {
    const slots = HIT_LOCATION_WEIGHTS.map((r) => r.slot);
    expect([...slots].sort()).toEqual(['chest', 'cloak', 'feet', 'hands', 'head', 'legs']);
    expect(HIT_LOCATION_WEIGHTS.reduce((n, r) => n + r.weight, 0)).toBe(100);
  });

  it('⚠⚠ weighted like a body: the chest is most of the target, the head the hardest to hit', () => {
    const w = (s: string) => HIT_LOCATION_WEIGHTS.find((r) => r.slot === s)!.weight;
    expect(w('chest')).toBeGreaterThan(w('legs'));
    expect(w('legs')).toBeGreaterThan(w('hands'));
    expect(w('head')).toBeLessThan(w('cloak'));
  });

  it('⚠ the roll walks the table — the first slice and the last are both reachable', () => {
    expect(rollHitLocation(() => 0)).toBe('chest');
    expect(rollHitLocation(() => 0.999)).toBe('head');
  });
});

describe('OTA-1513 — the mark it leaves, and the vial that answers it', () => {
  it('⚠⚠ each kind maps to an ailment the player ALREADY knows from the other side', () => {
    expect(ailmentForCoating('poison')).toBe('poisoned');
    expect(ailmentForCoating('cold')).toBe('chilled');     // OTA-831's precedent
    expect(ailmentForCoating('acid')).toBe('armor_severed');
    expect(ailmentForCoating('burn')).toBe('burn_scar');
    // Electrical arcs and is gone — its damage was the whole effect.
    expect(ailmentForCoating('electrical')).toBeNull();
  });

  it('⚠⚠⚠ EVERY MARK HAS THE RIGHT ANSWER — inflicted by one kind, cured by the SAME kind', () => {
    // ⚠⚠ The asymmetry bug this exists to prevent: an ailment inflicted by
    // kind A and cured only by kind B means drinking the RIGHT vial does
    // nothing, which is exactly the loop the owner asked to close ("if I have
    // a lot of corruption I can use a coating to be drunk to use that").
    // `coatingDrinkRemedy` is the authority — this asserts the two tables agree.
    const REMEDY = readFileSync(join(ROOT, 'app', 'engine', 'coatingRemedy.ts'), 'utf8');
    for (const [kind, status] of [
      ['poison', 'poisoned'], ['burn', 'burn_scar'], ['cold', 'chilled'],
    ] as const) {
      expect(ailmentForCoating(kind)).toBe(status);
      // …and the remedy's own switch drops exactly that status for that kind.
      expect(REMEDY).toContain(`case '${kind}': dropStatus(['${status}']`);
    }
  });

  it('⚠⚠⚠ CORRUPTION MOVES THE METER, not a status — because that is what the vial subtracts from', () => {
    // The remedy's corruption branch works on player.corruption, so the blade
    // must ADD to the same number or the right vial answers nothing.
    expect(ailmentForCoating('corruption')).toBeNull();
    expect(corruptionFromCoating('corruption', 4)).toBe(2);
    expect(corruptionFromCoating('corruption', 1)).toBe(1); // never a no-op hit
    // No other kind touches the meter.
    for (const k of ['poison', 'acid', 'burn', 'cold', 'electrical'] as const) {
      expect(corruptionFromCoating(k, 6)).toBe(0);
    }
    expect(COMBAT).toContain('corruption: (nextPlayer.corruption ?? 0) + coatingCorruption');
  });

  it('⚠⚠ ACID is deliberately the one with no drink — a chewed plate is a bench problem', () => {
    const { isCoatingDrinkable } = require('../app/engine/coatingRemedy');
    expect(isCoatingDrinkable('acid')).toBe(false);
    expect(ailmentForCoating('acid')).toBe('armor_severed');
    // Every OTHER kind this feature can inflict does have a drinkable answer.
    for (const k of ['poison', 'burn', 'cold', 'corruption'] as const) {
      expect(isCoatingDrinkable(k)).toBe(true);
    }
  });
});

describe('OTA-1514 — the enemy portrait scrolls again', () => {
  // ⚠⚠⚠ Owner, after OTA-1512 moved the threat dot up: *"the enemy portrait
  // still doesn't scroll up."* 1512 fixed the DOT's visibility and left this
  // standing — everything else below the fold (traits, active effects, the
  // stat grid) was still unreachable. The word that matters in his original
  // report is NO LONGER: arb146 added tap-to-open by wrapping the ScrollView
  // in a TouchableOpacity, and a parent Touchable WINS THE RESPONDER on a
  // vertical drag, so the scroll container inside it was inert.
  const PANEL = readFileSync(join(ROOT, 'app', 'components', 'EnemyPanel.tsx'), 'utf8');

  it('⚠⚠⚠ THE SCROLLVIEW IS THE PARENT — a scroll container inside a press target cannot scroll', () => {
    const wrap = PANEL.slice(PANEL.indexOf('const scrollWrap ='), PANEL.indexOf('const onMomentumEnd'));
    const scrollAt = wrap.indexOf('<ScrollView');
    const touchAt = wrap.indexOf('<TouchableOpacity');
    expect(scrollAt).toBeGreaterThan(-1);
    expect(touchAt).toBeGreaterThan(-1);
    expect(scrollAt).toBeLessThan(touchAt);   // ScrollView OUTSIDE, Touchable in
  });

  it('⚠⚠ neither call site re-wraps it in a Touchable — that is how the bug got in', () => {
    // Both the pager cell and the single-enemy branch must hand the press to
    // scrollWrap rather than wrapping its result.
    expect(PANEL).not.toMatch(/<TouchableOpacity[^>]*>\s*\{?\s*scrollWrap\(/);
    expect(PANEL).toContain('const renderItem: ListRenderItem<EnemyView> = ({ item }) => scrollWrap(');
    expect((PANEL.match(/scrollWrap\(\n/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('⚠ the tap still opens the detail popup — the scroll fix did not cost the gesture', () => {
    expect(PANEL).toContain('() => setDetailView(item),');
    expect(PANEL).toContain('() => setDetailView(enemies[0]!),');
    // And the cap that made scrolling necessary is still there.
    expect(PANEL).toContain('style={{ maxHeight: capH }}');
  });
});

describe('OTA-1513 — the wiring (source claims)', () => {
  it('⚠⚠⚠ the coating resolves AFTER the to-hit roll — the entire reason it answers stacked AC', () => {
    // It must sit inside the landed-hit block, after the damage has survived
    // armour/title/race mitigation, not anywhere near the accuracy check.
    const at = COMBAT.indexOf('let coatingClause');
    const mitigation = COMBAT.indexOf('const resisted = applyArmorResistance');
    const written = COMBAT.indexOf('const newHp = Math.max(0, nextPlayer.hp - dmg);');
    expect(at).toBeGreaterThan(mitigation);
    expect(at).toBeLessThan(written);
  });

  it('⚠⚠⚠ ONE piece answers it — the struck slot only, not the aggregate stack', () => {
    expect(COMBAT).toContain('const struck = ec.rollHitLocation(Math.random);');
    expect(COMBAT).toContain(".filter((r) => r.slot === struck)");
    expect(COMBAT).toContain('const resistedHere = pieceResists.includes(String(enemy.coating.kind).toLowerCase());');
    expect(COMBAT).toContain('const coatDmg = resistedHere ? Math.max(1, Math.ceil(raw / 2)) : raw;');
  });

  it('⚠⚠ the log NAMES the piece — he has to be able to see his coatings working', () => {
    expect(COMBAT).toContain('took it${resistedHere ?');
    // (A regex, not a quoted sentence: the prose-pin ratchet exists precisely so
    // a test does not break on a reworded log line while the behaviour stands.)
    expect(COMBAT).toMatch(/caught you where you wear nothing/);
  });

  it('⚠ the OTA-959 wear roll is left alone — folding them would re-weight durability', () => {
    // Wear stays uniform over WORN slots (so it always lands somewhere); the
    // coating uses its own weighted table over ALL slots (so bare skin is a
    // real outcome). Two questions, two distributions, deliberately.
    expect(COMBAT).toContain('const wornSlots = ARMOR_SLOTS.filter((s) => !!player.equipped?.[s]);');
  });
});
