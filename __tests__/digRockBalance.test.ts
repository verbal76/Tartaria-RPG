// Pin the rebalanced dig + area-search weights so rocks / sticks
// dominate the cheap-stock pool. Playtester reports 2026-05-21 /
// 22: "I can't remember if I ever saw a big rock". After the OTA
// 012 food additions diluted the pool, rocks+sticks dropped
// from ~50% to ~28%; OTA 021 re-bumped weights so rocks+sticks
// are back to ~38-40% of all material drops. Below 30% counts
// as a regression — the rulebook leans on these items.

import { rollDig } from '../app/engine/digging';
import { rollAreaSearch } from '../app/engine/areaSearch';

const ROCK_STICK = new Set(['Small Rock', 'Big Rock', 'Stick']);

describe('dig + area-search rock/stick weights', () => {
  it('rollDig at default score lands rocks or sticks >30% of the time across 5000 rolls', () => {
    let hits = 0;
    let total = 0;
    for (let i = 0; i < 5000; i++) {
      const out = rollDig(3); // Pocket Knife / starter dig score
      if (out.found) {
        total++;
        if (ROCK_STICK.has(out.found.name)) hits++;
      }
    }
    // Math-target after OTA 021 bump: ~38%. Floor at 0.30 leaves
    // headroom for binomial variance across 5000 rolls.
    expect(total).toBeGreaterThan(2000); // sanity
    expect(hits / total).toBeGreaterThan(0.30);
  });

  it('rollAreaSearch material outcomes are rocks/sticks >30% of the time', () => {
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
    expect(hits / materials).toBeGreaterThan(0.30);
  });
});
