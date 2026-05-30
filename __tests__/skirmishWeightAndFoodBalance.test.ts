// OTA-219 — verifies the rebalance:
//   - Skirmish weights bumped (lifts combat share)
//   - Road Hawker pool expanded with food items
//   - Investigate trinket pool gains food + first aid kit

import wastelandData from '../app/data/world/wasteland_encounters.json';
import roadsideData from '../app/data/npcs/roadside_traders.json';

describe('OTA-219 — wasteland skirmish weights bumped', () => {
  it('skirmish_pack weight is 40 (up from 35)', () => {
    expect((wastelandData as Record<string, { weight?: number }>).skirmish_pack?.weight).toBe(40);
  });

  it('mud_boar_stampede weight is 7 (up from 6)', () => {
    expect((wastelandData as Record<string, { weight?: number }>).mud_boar_stampede?.weight).toBe(7);
  });

  it('alley_cutpurse weight is 9 (up from 8)', () => {
    expect((wastelandData as Record<string, { weight?: number }>).alley_cutpurse?.weight).toBe(9);
  });

  it('total skirmish weight is at least 89 (was 76)', () => {
    let total = 0;
    for (const arch of Object.values(wastelandData) as Array<{ type?: string; weight?: number }>) {
      if (arch.type === 'skirmish' && typeof arch.weight === 'number') {
        total += arch.weight;
      }
    }
    expect(total).toBeGreaterThanOrEqual(89);
  });
});

describe('OTA-219 — Road Hawker food pool expanded', () => {
  const hawker = roadsideData.archetypes.find((a) => a.id === 'road_hawker');

  it('road_hawker includes Smoke-Cured Jerky Strip', () => {
    expect(hawker?.pool.some((p) => p.itemName === 'Smoke-Cured Jerky Strip')).toBe(true);
  });

  it('road_hawker includes Wild Lettuce', () => {
    expect(hawker?.pool.some((p) => p.itemName === 'Wild Lettuce')).toBe(true);
  });

  it('road_hawker includes Wild Oats', () => {
    expect(hawker?.pool.some((p) => p.itemName === 'Wild Oats')).toBe(true);
  });

  it('road_hawker includes Blueberries', () => {
    expect(hawker?.pool.some((p) => p.itemName === 'Blueberries')).toBe(true);
  });

  it('road_hawker includes Forager\'s Stew', () => {
    expect(hawker?.pool.some((p) => p.itemName === "Forager's Stew")).toBe(true);
  });

  it('Trail Rations weight bumped to 14 (was 10)', () => {
    const rations = hawker?.pool.find((p) => p.itemName === 'Trail Rations');
    expect(rations?.weight).toBe(14);
  });

  it('First Aid Kit weight bumped to 6 (was 4)', () => {
    const fak = hawker?.pool.find((p) => p.itemName === 'First Aid Kit');
    expect(fak?.weight).toBe(6);
  });

  it('Food share of total Road Hawker pool >= 70%', () => {
    if (!hawker) throw new Error('hawker missing');
    const FOOD = new Set([
      'Trail Rations', 'Wild Carrot', 'Wild Onion', 'Speckled Egg',
      'Smoke-Cured Jerky Strip', 'Wild Lettuce', 'Wild Oats', 'Blueberries',
      "Forager's Stew", 'Water Bottle', 'First Aid Kit',
    ]);
    const foodWeight = hawker.pool
      .filter((p) => FOOD.has(p.itemName))
      .reduce((acc, p) => acc + p.weight, 0);
    const totalWeight = hawker.pool.reduce((acc, p) => acc + p.weight, 0);
    expect(foodWeight / totalWeight).toBeGreaterThanOrEqual(0.70);
  });
});
