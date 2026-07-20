import { pickRoadsideTrader, buildTraderEnemy } from '../app/engine/vendors';

describe('roadside trader procedural generation', () => {
  it('produces 3-7 offers with prices inside each entry range', () => {
    // Base 3-6 offers, plus an OPTIONAL premium ware (OTA-729) → up to 7.
    for (let i = 0; i < 50; i++) {
      const t = pickRoadsideTrader();
      expect(t.offers.length).toBeGreaterThanOrEqual(3);
      expect(t.offers.length).toBeLessThanOrEqual(7);
      for (const o of t.offers) {
        expect(o.price).toBeGreaterThan(0);
      }
    }
  });

  it('stamps a demeanor (honest or sketchy)', () => {
    for (let i = 0; i < 20; i++) {
      const t = pickRoadsideTrader();
      expect(['honest', 'sketchy']).toContain(t.demeanor);
    }
  });

  it('has no faction (faction-less trade so rep does not move)', () => {
    const t = pickRoadsideTrader();
    expect(t.faction).toBeNull();
  });

  it('builds tiered enemies — sketchy hardest, hub default tanky', () => {
    const sketchy = buildTraderEnemy({
      id: 'x', name: 'Stall', title: '', faction: null, description: '',
      offers: [{ itemName: 'Pocket Knife', price: 5 }], demeanor: 'sketchy',
    });
    const honest = buildTraderEnemy({
      id: 'x', name: 'Hawker', title: '', faction: null, description: '',
      offers: [{ itemName: 'Trail Rations', price: 5 }], demeanor: 'honest',
    });
    const hub = buildTraderEnemy({
      id: 'x', name: 'Halem', title: '', faction: 'mud_monarchs', description: '',
      offers: [{ itemName: 'Iron Spear', price: 30 }],
    });
    expect(sketchy.traits ?? []).toEqual(expect.arrayContaining(['quick', 'ambush_strike']));
    expect(honest.hp).toBeLessThan(sketchy.hp);
    expect(hub.hp).toBeGreaterThan(sketchy.hp);
    expect(hub.traits ?? []).toEqual(expect.arrayContaining(['armored']));
    expect(hub.loot).toContain('Iron Spear');
  });
});
