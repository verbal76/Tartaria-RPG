// Pin the rebalanced dig + area-search weights so rocks / sticks
// remain the single largest contributor to the cheap-stock pool.
// Playtester report 2026-05-21: "I haven't seen rocks or sticks
// for a while". Old weights had rocks+sticks at ~23%; new weights
// hold them at >20% of material outcomes even after OTA 012
// folded ~15 wild foods + firewood + water bottles + 4 colored
// mushrooms into both pools. Above 20% they still feel like the
// "dominant" tier without crowding out the food variety the
// playtester also wanted to see.

import { rollDig } from '../app/engine/digging';
import { rollAreaSearch } from '../app/engine/areaSearch';

const ROCK_STICK = new Set(['Small Rock', 'Big Rock', 'Stick']);

describe('dig + area-search rock/stick weights', () => {
  it('rollDig at default score lands rocks or sticks >20% of the time across 5000 rolls', () => {
    let hits = 0;
    let total = 0;
    for (let i = 0; i < 5000; i++) {
      const out = rollDig(3); // Pocket Knife / starter dig score
      if (out.found) {
        total++;
        if (ROCK_STICK.has(out.found.name)) hits++;
      }
    }
    // Math-target after OTA 012 wild-food additions: ~26%. Floor at
    // 0.20 leaves headroom for binomial variance across 5000 rolls.
    expect(total).toBeGreaterThan(2000); // sanity
    expect(hits / total).toBeGreaterThan(0.20);
  });

  it('rollAreaSearch material outcomes are rocks/sticks >20% of the time', () => {
    let hits = 0;
    let materials = 0;
    for (let i = 0; i < 8000; i++) {
      const out = rollAreaSearch('the silt');
      if (out.kind === 'material') {
        materials++;
        if (ROCK_STICK.has(out.itemName)) hits++;
      }
    }
    expect(materials).toBeGreaterThan(1000); // ~25% of attempts
    expect(hits / materials).toBeGreaterThan(0.20);
  });
});
