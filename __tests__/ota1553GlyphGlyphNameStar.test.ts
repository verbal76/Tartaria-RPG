/**
 * OTA-1553 — GLYPH GLYPH NAME STAR.
 *
 * ⚠⚠⚠ THE OWNER SPECIFIED THIS TWICE, AND THE SECOND TIME HE SPELLED IT OUT
 * BECAUSE I HAD ASKED HIM QUESTIONS HE HAD ALREADY ANSWERED:
 *
 *   *"We have a cudgel that does bludgeoning but it's coded in Frost, encoded
 *   and incendiary. There should be a fire glyph then a snowflake glyph then the
 *   word cudgel and then at the end if the enemy is weak to either the frost or
 *   the fire or the bludgeoning from the cudgel there should be a star at the
 *   very end. So the format is glyph glyph name and then either a star or no
 *   star depending on the weaknesses of the enemy."*
 *
 * And, ruling out the thing I had wrongly offered: *"I don't want the weapon
 * button during combat to show 1d4. I don't want it to show dice rolls. I wanted
 * to show a glyph of the types of damage."*
 *
 * ⚠⚠⚠ THREE TYPES FEED ONE STAR. Not the coating, not the raw damage — BOTH
 * COATS AND THE RAW DAMAGE. His cudgel is bludgeoning underneath two coats, and
 * he said so explicitly ("or maybe piercing if the raw damage from the weapon is
 * piercing"). A coated cudgel is still a cudgel.
 *
 * ⚠⚠⚠ AND THE STAR MAY ONLY SAY WHAT HE ALREADY KNOWS: *"If it's known then base
 * the decision off of that, if it isn't, then we don't use the star ... only base
 * it off of what the player has discovered or is shown."* So the star reads the
 * SAME verdict the enemy card prints — boss, or the Wisdom 12 read, or what has
 * been learned by hitting the thing. A star that knew more than the card would be
 * a free intel channel quietly cancelling the WIS gate (OTA-818/819) and the
 * `witholdIntel` difficulty dial (OTA-1117).
 *
 * ⚠⚠ WHY THE OLD LABEL COULD NOT DO THIS. The prop was a single string — one
 * coating ADJECTIVE — so a weapon carrying two coats could only ever advertise
 * one of them, which is exactly what the owner was looking at. And the adjective
 * spent a whole word before reaching the weapon's own name, which is what pushed
 * the damage off his button in the first place. A glyph is one character.
 *
 * ⚠ `off:` IS GONE FROM COMBAT, on his word: *"I don't need off: because in
 * combat the hand doesn't matter, only in the inventories equip choice card."*
 * In a fight the two buttons ARE the two hands, side by side; the word restated
 * their own arrangement while crowding out what mattered.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  COATING_GLYPH,
  WEAKNESS_READ_WIS,
  coatingGlyphs,
  coatingKinds,
  combatWeaponLabel,
  knownEnemyWeaknesses,
  reconciledDefenses,
  shortWeaponName,
  weaponHitsKnownWeakness,
  weaponStrikeTypes,
} from '../app/engine/weaponGlyphs';
import type { Enemy, InventoryItem } from '../app/engine/types';

const src = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8');

/** THE OWNER'S CUDGEL: bludgeoning underneath incendiary + frost. */
const CUDGEL = {
  name: 'Cudgel',
  coating: { kind: 'burn', dice: '1d4', label: 'Incendiary' },
  coating2: { kind: 'cold', dice: '1d4', label: 'Frost-Bound' },
} as unknown as InventoryItem;

const BARE = { name: 'Cudgel' } as unknown as InventoryItem;

describe("OTA-1553 — the owner's cudgel", () => {
  it('⚠⚠⚠ THE FORMAT: glyph glyph name, in the order the coats were applied', () => {
    // Slot 1 then slot 2 — the same order coatedDisplayName reads them in, so
    // the glyph row and the item's own name can never disagree about which coat
    // came first.
    expect(coatingKinds(CUDGEL)).toEqual(['burn', 'cold']);
    expect(coatingGlyphs(CUDGEL)).toBe('🔥❄');
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', [])).toBe('🔥❄ cudgel ⚒');
  });

  it('⚠⚠⚠ THE STAR: weak to the FIRE earns it', () => {
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', ['burn'])).toBe('🔥❄ cudgel ⚒ ★');
  });

  it('⚠⚠⚠ …weak to the FROST earns it', () => {
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', ['cold'])).toBe('🔥❄ cudgel ⚒ ★');
  });

  it('⚠⚠⚠ …and weak to the BLUDGEONING earns it too — the raw damage counts', () => {
    // The half that is easy to forget, and the half he named explicitly. A
    // coated cudgel is still a cudgel.
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', ['bludgeoning'])).toBe('🔥❄ cudgel ⚒ ★');
  });

  it('⚠⚠ weak to something ELSE gets no star', () => {
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', ['acid', 'aetheric'])).toBe('🔥❄ cudgel ⚒');
  });

  it('⚠⚠ NOTHING KNOWN → NO STAR, which is the important half', () => {
    // An absent star means "not known to bite", never "known not to bite" — the
    // same silence the card gives, so the two cannot tell the player different
    // things. This is the case early in every fight.
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', [])).not.toContain('★');
  });

  it('⚠ a bare weapon is its name and its base type — no coat glyphs, no leading space', () => {
    // ⚠ OTA-1636 — the base type now rides the far right of every label.
    expect(combatWeaponLabel('Cudgel', BARE, 'bludgeoning', [])).toBe('cudgel ⚒');
    expect(combatWeaponLabel('Cudgel', BARE, 'bludgeoning', ['bludgeoning'])).toBe('cudgel ⚒ ★');
    // no raw type known → no base glyph, no false symbol
    expect(combatWeaponLabel('Cudgel', null, null, ['bludgeoning'])).toBe('cudgel');
  });

  it('⚠ a long name still trims to two words, so the glyphs and star have room', () => {
    expect(shortWeaponName('Rusty Iron Battle Shortbow')).toBe('Battle Shortbow');
    expect(shortWeaponName('Pocket Knife')).toBe('Pocket Knife');
    expect(combatWeaponLabel('Rusty Iron Battle Shortbow', CUDGEL, 'piercing', ['cold']))
      .toBe('🔥❄ battle shortbow ▲ ★');
  });

  it('⚠⚠ NO DICE ANYWHERE IN THE LABEL — he ruled that out in as many words', () => {
    for (const known of [[], ['burn'], ['bludgeoning']]) {
      expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', known)).not.toMatch(/\dd\d/);
    }
  });

  it('⚠ every coating family has a glyph — a coat with no symbol would read as no coat', () => {
    for (const kind of ['burn', 'cold', 'poison', 'acid', 'corruption', 'electrical'] as const) {
      expect(COATING_GLYPH[kind]).toBeTruthy();
      expect(COATING_GLYPH[kind].length).toBeLessThanOrEqual(2); // one character (some are surrogate pairs)
    }
    // …and no two families share one, or the row would be ambiguous.
    const glyphs = Object.values(COATING_GLYPH);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe('OTA-1553 — aliases resolve before the comparison, not after', () => {
  it('⚠⚠ a `frost` weapon matches a `cold` weakness', () => {
    // DAMAGE_TYPE_ALIASES is the shared table every weakness consumer uses
    // (OTA-827). Comparing raw words would silently fail on exactly the pairs
    // the alias table exists for, and the star would go dark against the one
    // enemy it was built to flag.
    expect(weaponStrikeTypes(BARE, 'frost')).toEqual(['cold']);
    expect(weaponHitsKnownWeakness(['cold'], ['frost'])).toBe(true);
    expect(weaponHitsKnownWeakness(['frost'], ['cold'])).toBe(true);
  });

  it('⚠ a `force` weapon matches an `aetheric` weakness', () => {
    expect(weaponHitsKnownWeakness(weaponStrikeTypes(BARE, 'force'), ['aetheric'])).toBe(true);
  });

  it('⚠ the strike list is de-duplicated — a frost coat on a cold weapon is one type', () => {
    const frostBlade = {
      name: 'Blade',
      coating: { kind: 'cold', dice: '1d4', label: 'Frost-Bound' },
    } as unknown as InventoryItem;
    expect(weaponStrikeTypes(frostBlade, 'frost')).toEqual(['cold']);
  });
});

describe('OTA-1553 — the star obeys discovery, exactly as the card does', () => {
  const foe = (over: Partial<Enemy> = {}): Enemy => ({
    name: 'Dust Fiend',
    type: 'construct',
    rarity: 'Common',
    hp: 10,
    ac: 12,
    attack: '+2',
    damage: '1d6',
    traits: ['vulnerable:burn'],
    ...over,
  } as unknown as Enemy);

  it('⚠⚠⚠ a low-Wisdom player who has learned nothing knows nothing — no star', () => {
    expect(knownEnemyWeaknesses(foe(), { playerWisdom: 8 })).toEqual([]);
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', knownEnemyWeaknesses(foe(), { playerWisdom: 8 })))
      .toBe('🔥❄ cudgel ⚒');
  });

  it('⚠⚠⚠ Wisdom 12 reads it on sight — the star lights', () => {
    const known = knownEnemyWeaknesses(foe(), { playerWisdom: WEAKNESS_READ_WIS });
    expect(known).toContain('burn');
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', known)).toBe('🔥❄ cudgel ⚒ ★');
  });

  it('⚠⚠⚠ a BOSS is always readable, whatever the Wisdom', () => {
    const known = knownEnemyWeaknesses(foe({ boss: true } as Partial<Enemy>), { playerWisdom: 3 });
    expect(known).toContain('burn');
  });

  it('⚠⚠⚠ STRIKE TO LEARN: what the player has already seen lights the star at any Wisdom', () => {
    const e = foe();
    const key = require('../app/engine/enemyTraits').enemyIntelKey(e.name, e.traits) as string;
    const known = knownEnemyWeaknesses(e, { playerWisdom: 6, intel: { [key]: { weak: ['burn'], resist: [] } } });
    expect(known).toContain('burn');
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', known)).toBe('🔥❄ cudgel ⚒ ★');
  });

  it('⚠⚠⚠ the `witholdIntel` dial switches the free read OFF, and the star goes with it', () => {
    // OTA-1117's difficulty dial. If the star ignored it, the hardest mode would
    // hand back on the button precisely what it took away from the card.
    const known = knownEnemyWeaknesses(foe(), { playerWisdom: 18, witholdIntel: true });
    expect(known).toEqual([]);
    expect(combatWeaponLabel('Cudgel', CUDGEL, 'bludgeoning', known)).not.toContain('★');
  });

  it('⚠⚠ a per-spawn `resist:` trait CANCELS the type-map weakness — no star on a flipped foe', () => {
    // OTA-798's reconcile, which is the whole reason this function had to be
    // shared rather than re-derived: a star computed off the raw type map would
    // keep pointing at a weakness randomization had already turned into a
    // resistance.
    const flipped = foe({ traits: ['resist:burn'] } as Partial<Enemy>);
    const known = knownEnemyWeaknesses(flipped, { playerWisdom: 18 });
    expect(known).not.toContain('burn');
    expect(reconciledDefenses(flipped).resists).toContain('burn');
  });
});

describe('OTA-1553 — the wiring', () => {
  const BOX = src('app/components/InputBox.tsx');
  const EXPLORE = src('app/screens/ExplorationScreen.tsx');
  const PANEL = src('app/components/EnemyPanel.tsx');

  it('⚠⚠⚠ `off:` is gone from the combat button', () => {
    expect(BOX).not.toContain('off: ');
    // …and the ACTION is untouched: the parser still needs the hand keyword to
    // resolve the right instance, which is a different question from what the
    // label says.
    expect(BOX).toContain('attack with the off-hand ${equippedOff.toLowerCase()}');
  });

  it('⚠⚠⚠ the button is fed the INSTANCE, not a single coating adjective', () => {
    // The old prop had room for one string, which is why a two-coat weapon could
    // only ever show one coat.
    expect(BOX).not.toContain('equippedMainCoating');
    expect(BOX).not.toContain('equippedOffCoating');
    expect(BOX).toContain('equippedMainItem');
    expect(BOX).toContain('equippedOffItem');
    // ⚠ OTA-1556 — RETARGETED. `instanceForSlot` gained a NAME fallback for slots
    // that carry no id (older saves store `equipped.main` as a name and have no
    // `mainId`), so a coated weapon on such a save showed no glyphs at all. The
    // property this line guards — the button is handed the INSTANCE, not a
    // coating adjective — is unchanged, and the id still wins wherever it exists;
    // ota1556 pins that precedence.
    expect(EXPLORE).toContain('const equippedMainItem = instanceForSlot(player?.equipped?.mainId, player?.equipped?.main);');
    expect(EXPLORE).toContain('const equippedOffItem = instanceForSlot(player?.equipped?.offId, player?.equipped?.off);');
  });

  it('⚠⚠⚠ both hands build their label through the SAME function', () => {
    // Two hands with two label builders is how one hand ends up showing a star
    // the other would not.
    const calls = BOX.match(/combatWeaponLabel\(/g) ?? [];
    expect(calls.length).toBe(2);
    expect(BOX).toContain('combatWeaponLabel(equippedMain, equippedMainItem, raw, activeEnemyKnownWeak ?? [])');
    expect(BOX).toContain('combatWeaponLabel(equippedOff, equippedOffItem, raw, activeEnemyKnownWeak ?? [])');
  });

  it('⚠⚠⚠ the raw damage type is resolved per hand — the star needs it', () => {
    const raws = BOX.match(/resolveDisplayWeaponByName\((equippedMain|equippedOff), inventory\)\?\.damageType \?\? null/g) ?? [];
    expect(raws.length).toBe(2);
  });

  it('⚠⚠⚠ the ★ and the enemy card read ONE reconcile and ONE Wisdom gate', () => {
    // The defect this forecloses: two copies of the same arithmetic drifting, so
    // the button and the card describe the same enemy differently.
    expect(PANEL).toContain("import { reconciledDefenses, WEAKNESS_READ_WIS as SHARED_WEAKNESS_READ_WIS } from '../engine/weaponGlyphs';");
    expect(PANEL).toContain('const defensesFor = reconciledDefenses;');
    expect(PANEL).toContain('const WEAKNESS_READ_WIS = SHARED_WEAKNESS_READ_WIS;');
    // The old private copy is gone — not shadowed, gone.
    expect(PANEL).not.toContain('function defensesFor(enemy: Enemy)');
  });

  it('⚠⚠ the screen asks about the ACTIVE enemy, with the player\'s real Wisdom, dial and intel', () => {
    expect(EXPLORE).toContain('const active = enemyViews[activeIdx]?.enemy;');
    expect(EXPLORE).toContain('playerWisdom: player.stats?.wisdom,');
    expect(EXPLORE).toContain('witholdIntel: profileOf(player).witholdIntel,');
    expect(EXPLORE).toContain('intel: worldMemory?.enemyIntel,');
  });

  it('⚠ the two-word trim has ONE home now', () => {
    expect(BOX).not.toContain('function shortWeaponLabel');
    expect(src('app/engine/weaponGlyphs.ts')).toContain('export function shortWeaponName(');
  });
});
