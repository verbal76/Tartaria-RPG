/**
 * OTA-1725 — THE CARD PAYS WHAT THE FIGHT PAYS.
 *
 * F3 from the pre-Fable audit, accepted for repair because the canonical answer
 * was already proven: the engine applies every authored bonus, and one
 * player-facing preview path displayed only the first.
 *
 * ⚠⚠⚠ THE MEASUREMENT. 195 armour rows carry more than one bonus. **185 of them
 * hid at least one** from the item card. `Aetheric Crown of the Giants` grants
 * CHA+3, STR+2 and HP+40 — verified through `effectiveStatsBreakdown`, which
 * returns CHA 13 / STR 12 on a base-10 character — and the card said "CHA +3".
 *
 * ⚠⚠ AND A SECOND LIE UNDERNEATH IT. `statBonus` and `statBonuses` are EITHER/OR
 * (OTA-1708's rule: `statBonuses ?? [statBonus]`), and the two fields disagree
 * across most of the catalog. Measured over all 288 stat-bearing rows: 204 repeat
 * the primary inside the list, and **54 REPLACE it**. On those 54 the card was
 * not merely incomplete, it named the wrong stat — `Reclaimer's Salvage Cap`
 * authors `statBonus: wisdom+1` and `statBonuses: [investigation+1]`, the engine
 * grants INT, and the card read "WIS +1".
 *
 * ⚠ SO THE FIX IS ONE AUTHORITY, NOT A THIRD FORMATTER. `armorBonusList` and
 * `armorPaidBonuses` live in equipment.ts beside the summation; the engine's two
 * open-coded copies of the `??` expression now call them, and the preview calls
 * them too. The card cannot drift from the fight because it is reading the
 * fight's own function.
 *
 * ⚠ TWO THINGS THE FIX HAD TO GET RIGHT, both found by measuring rather than by
 * assuming:
 *   · NOT a union. `statBonus + statBonuses` would double 204 rows and resurrect
 *     54 retired values. The accessory formatter does union them, which is a
 *     DIFFERENT rule for a different catalog — so it was left alone rather than
 *     copied.
 *   · CANONICALISED labels. `investigation` IS intelligence and `constitution`
 *     IS hp (STAT_ALIAS). My first cut printed the raw authored word and put
 *     "INV +1" on a card, inventing an attribute the player has never seen.
 */
import { ARMOR } from '../app/engine/crafting';
import { getItemPreview } from '../app/components/itemPreview';
import { armorBonusList, armorPaidBonuses, effectiveStatsBreakdown } from '../app/engine/equipment';
import type { PlayerCharacter, InventoryItem } from '../app/engine/types';

type Row = Record<string, unknown>;
const rows = ARMOR as unknown as Row[];
const statsOf = (name: string): string[] =>
  ((getItemPreview(name) as unknown as { stats?: string[] }).stats ?? []);
const ABBR: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', intelligence: 'INT',
  wisdom: 'WIS', charisma: 'CHA', stealth: 'STE',
};

const wearing = (name: string, slot: string): PlayerCharacter => ({
  name: 'T', raceId: 'unknowing_mass', factionId: 'reclaimers_guild',
  stats: { strength: 10, dexterity: 10, intelligence: 10, wisdom: 10, charisma: 10, stealth: 2 },
  hp: 30, hpMax: 30, stamina: 10, staminaMax: 10, ac: 10, tc: 0, corruption: 0,
  inventory: [{ id: 'x1', name, kind: 'armor', rarity: 'Common', quantity: 1, tags: [] } as unknown as InventoryItem],
  equipped: { [slot]: name, [`${slot}Id`]: 'x1' }, factionStanding: [], activeQuests: [],
} as unknown as PlayerCharacter);

describe('OTA-1725 — ⚠⚠⚠ THE SWEEP: no armour card hides a bonus it pays', () => {
  it('every stat-bearing row displays every bonus the engine grants', () => {
    const hiding: string[] = [];
    let checked = 0;
    for (const a of rows) {
      const paid = armorPaidBonuses(a as never);
      if (paid.attributes.length === 0 && paid.hp === 0) continue;
      checked++;
      const shown = statsOf(a.name as string).join(' ');
      for (const b of paid.attributes) {
        const tag = `${ABBR[b.stat] ?? b.stat.toUpperCase().slice(0, 3)} +${b.amount}`;
        if (!shown.includes(tag)) hiding.push(`${String(a.name)}: ${tag} not on the card`);
      }
      if (paid.hp > 0 && !shown.includes(`HP +${paid.hp}`)) {
        hiding.push(`${String(a.name)}: HP +${paid.hp} not on the card`);
      }
    }
    // Before this OTA: 185 of 195 multi-entry rows hid at least one.
    expect(hiding).toEqual([]);
    // ⚠ And the sweep is looking at the whole catalog, not a sample.
    expect(checked).toBeGreaterThanOrEqual(280);
  });

  it('⚠⚠ and no card shows a bonus the engine does NOT pay', () => {
    // The opposite failure, and the one a naive union would have caused: an
    // attribute tag on the card that the fight never adds.
    const overPromising: string[] = [];
    for (const a of rows) {
      const paid = armorPaidBonuses(a as never);
      const paidTags = new Set(paid.attributes.map((b) => `${ABBR[b.stat]} +${b.amount}`));
      for (const line of statsOf(a.name as string)) {
        if (/^(STR|DEX|INT|WIS|CHA|STE) \+\d+$/.test(line) && !paidTags.has(line)) {
          overPromising.push(`${String(a.name)}: card says ${line}, engine pays none such`);
        }
      }
    }
    expect(overPromising).toEqual([]);
  });
});

describe('OTA-1725 — ⚠⚠ the two rows that name the whole problem', () => {
  it('the Crown shows all three of the bonuses it grants', () => {
    const s = statsOf('Aetheric Crown of the Giants');
    expect(s).toContain('CHA +3');
    expect(s).toContain('STR +2');   // was hidden
    expect(s).toContain('HP +40');   // was hidden
    const b = effectiveStatsBreakdown(wearing('Aetheric Crown of the Giants', 'head'));
    expect({ cha: b.charisma.total, str: b.strength.total }).toEqual({ cha: 13, str: 12 });
  });

  it("⚠ the Salvage Cap names the stat the fight adds, not the retired one", () => {
    // statBonus wisdom+1 (legacy) vs statBonuses [investigation+1] (live).
    // investigation canonicalises to intelligence.
    const s = statsOf("Reclaimer's Salvage Cap");
    expect(s).toContain('INT +1');
    expect(s).not.toContain('WIS +1');
    const b = effectiveStatsBreakdown(wearing("Reclaimer's Salvage Cap", 'head'));
    expect({ int: b.intelligence.total, wis: b.wisdom.total }).toEqual({ int: 11, wis: 10 });
  });
});

describe('OTA-1725 — ⚠ ONE authority, and it is the engine\'s', () => {
  it('the list is either/or, never a union', () => {
    // A union would double the 204 rows that repeat their primary.
    const dup = rows.find((r) => {
      const one = r.statBonus as { stat: string } | undefined;
      const many = r.statBonuses as { stat: string }[] | undefined;
      return !!one && !!many?.some((b) => b.stat === one.stat);
    })!;
    expect(dup).toBeTruthy();
    const list = armorBonusList(dup as never);
    expect(list).toEqual(dup.statBonuses);
    const primary = (dup.statBonus as { stat: string }).stat;
    expect(list.filter((b) => b.stat === primary).length).toBe(1);
  });

  it('a row with only the legacy field still works', () => {
    expect(armorBonusList({ statBonus: { stat: 'strength', amount: 2 } })).toEqual([{ stat: 'strength', amount: 2 }]);
    expect(armorBonusList({})).toEqual([]);
    expect(armorBonusList(null)).toEqual([]);
  });

  it('⚠⚠ non-attribute flavour stats are canonicalised, not invented', () => {
    // constitution -> hp, investigation -> intelligence. Printing the raw word
    // would put an attribute on the card that does not exist in the game.
    const p = armorPaidBonuses({ statBonuses: [
      { stat: 'investigation', amount: 1 }, { stat: 'constitution', amount: 3 }, { stat: 'aetheria', amount: 2 },
    ] });
    expect(p.attributes).toEqual([{ stat: 'intelligence', amount: 1 }, { stat: 'intelligence', amount: 2 }]);
    expect(p.hp).toBe(3);
  });

  it('the engine reads through the same function it exports', () => {
    const eq = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', 'engine', 'equipment.ts'), 'utf8') as string;
    // The open-coded `??` expression is gone from the summation and from armorHpBonus.
    expect(eq.split('piece.statBonuses ?? (piece.statBonus').length - 1).toBe(1); // only inside armorBonusList
    expect(eq.includes('for (const b of armorBonusList(piece)) add(b.stat, b.amount);')).toBe(true);
    expect(eq.includes('return armorPaidBonuses(findArmorByName(name)).hp;')).toBe(true);
  });
});
