// OTA-1160 — REGEN WAS INVISIBLE ON EVERY SURFACE.
//
// Owner, with a screenshot of his own inventory: "how am I supposed to know I had
// regen, I almost sold these. this is how we see them."
//
// He was wearing Echoing Steps Boots — `hpRegen: 2`, which is the ENTIRE
// HP_REGEN_CAP, i.e. the most HP regen the game will grant from any number of
// pieces — and the row read `AC +2 · DEX +2`. Nothing anywhere said the boots were
// healing him every single action. He nearly sold them, and then asked why his
// health kept refilling.
//
// ⚠ This is not one item. 93 of 293 armour pieces carry regen (31 hpRegen, 62
// staminaRegen) and `previewArmor` built AC / Resists / statBonus / Durability and
// stopped. A property the player cannot see is one they sell by accident — and on
// several Commons it is the best line on the item.

import { getItemPreview, getItemPreviewForInstance, regenLine } from '../app/components/itemPreview';
import { ARMOR } from '../app/engine/crafting';
import { HP_REGEN_CAP, STAMINA_REGEN_CAP } from '../app/engine/equipment';

const withHpRegen = ARMOR.filter((a) => (a.hpRegen ?? 0) > 0);
const withStamRegen = ARMOR.filter((a) => (a.staminaRegen ?? 0) > 0);

describe('OTA-1160 — the piece says what it does', () => {
  it("the owner's boots name their regen", () => {
    const p = getItemPreview('Echoing Steps Boots');
    expect(p.stats.join(' · ')).toContain('Regen: +2 HP per action');
  });

  it('every regen piece in the catalogue says so', () => {
    // ⚠ Asserted across the whole catalogue, not on a sample. The defect was not
    // that one item was missed — it was that the builder had no regen branch at
    // all, so a spot-check on the item that prompted this would prove nothing.
    const silent: string[] = [];
    for (const a of [...withHpRegen, ...withStamRegen]) {
      const p = getItemPreview(a.name);
      if (!p.stats.some((s) => s.startsWith('Regen:'))) silent.push(a.name);
    }
    expect(silent).toEqual([]);
  });

  it('a piece with no regen gains no line', () => {
    const plain = ARMOR.find((a) => !a.hpRegen && !a.staminaRegen)!;
    expect(getItemPreview(plain.name).stats.some((s) => s.startsWith('Regen:'))).toBe(false);
    expect(regenLine(plain)).toBeNull();
    expect(regenLine(null)).toBeNull();
    expect(regenLine({})).toBeNull();
  });

  it('the line states the CADENCE, because that is what was misjudged', () => {
    // "per action" — it ticks once per command in submitPlayerAction, not per hour
    // and not per rest. A player reading a bare "+2" assumes something slower and
    // under-rates it, which is exactly how this one went unnoticed.
    expect(regenLine({ hpRegen: 2 })).toBe('Regen: +2 HP per action');
    expect(regenLine({ staminaRegen: 1 })).toBe('Regen: +1 stamina per action');
    expect(regenLine({ hpRegen: 1, staminaRegen: 2 }))
      .toBe('Regen: +1 HP / +2 stamina per action');
  });
});

describe('OTA-1160 — it survives the paths that rebuild an item', () => {
  it('a fused piece still shows the regen it still earns', () => {
    // ⚠ THE TRAP. `aggregateEquippedRegen` resolves the worn piece by NAME via
    // findArmorByName and never consults uniqueStats, so a fused copy keeps paying
    // out — while the fused preview branch builds its lines from the ROLL and would
    // have dropped the only mention of it.
    const boots = ARMOR.find((a) => a.name === 'Echoing Steps Boots')!;
    const p = getItemPreviewForInstance({
      name: boots.name,
      uniqueStats: {
        kind: 'armor',
        armorSlot: 'feet',
        acBonus: 4,
        rarity: 'Legendary',
        durability: { current: 45, max: 45 },
        special: 'Field-forged',
      },
    } as never);
    expect(p.stats.join(' · ')).toContain('Regen: +2 HP per action');
  });

  it('a rolled (non-fused) instance keeps it too', () => {
    // The instance path rebuilds by KEEPING every line that is not AC / stat /
    // durability, so placing the regen line before Durability carries it for free.
    const boots = ARMOR.find((a) => a.name === 'Echoing Steps Boots')!;
    const p = getItemPreviewForInstance({
      name: boots.name,
      instanceStats: { acBonus: 2, statBonuses: [{ stat: 'dexterity', amount: 2 }] },
      durability: { current: 15, max: 15 },
    } as never);
    expect(p.stats.join(' · ')).toContain('Regen: +2 HP per action');
    // ...and the instance's own rolled numbers still win over the catalogue's
    expect(p.stats).toContain('AC +2');
    expect(p.stats).toContain('DEX +2');
  });
});

describe('OTA-1160 — the numbers the line quotes are the ones that pay', () => {
  it('no single piece can exceed the aggregate caps it is quoted against', () => {
    // If a piece ever advertised more than the cap can deliver, the fix would have
    // replaced an invisible truth with a visible lie.
    for (const a of withHpRegen) expect(a.hpRegen!).toBeLessThanOrEqual(HP_REGEN_CAP);
    for (const a of withStamRegen) expect(a.staminaRegen!).toBeLessThanOrEqual(STAMINA_REGEN_CAP);
  });

  it('the catalogue really is full of these, which is why it mattered', () => {
    expect(withHpRegen.length).toBeGreaterThanOrEqual(31);
    expect(withStamRegen.length).toBeGreaterThanOrEqual(62);
  });
});
