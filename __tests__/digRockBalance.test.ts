// Pin the rebalanced dig + area-search weights so rocks / sticks
// dominate the cheap-stock pool the way the rulebook promises.
// Playtester report 2026-05-21: "I haven't seen rocks or sticks
// for a while". Old weights had rocks+sticks at ~23% of material
// outcomes; new weights push that above 50%.

import { rollDig } from '../app/engine/digging';
import { rollAreaSearch } from '../app/engine/areaSearch';

const ROCK_STICK = new Set(['Small Rock', 'Big Rock', 'Stick']);

describe('dig + area-search rock/stick weights', () => {
  it('rollDig at default score lands rocks or sticks ~40% of the time across 5000 rolls', () => {
    let hits = 0;
    let total = 0;
    for (let i = 0; i < 5000; i++) {
      const out = rollDig(3); // Pocket Knife / starter dig score
      if (out.found) {
        total++;
        if (ROCK_STICK.has(out.found.name)) hits++;
      }
    }
    // Dig pool at score 3 has uncommon × 1.8 and rare × 2.6 weight
    // multipliers that dilute the common share. Math-target is
    // ~40%; lower floor at 35% to leave headroom for binomial
    // variance across 5000 rolls (σ ≈ 0.7%, so 35% is ~7σ safe).
    expect(total).toBeGreaterThan(2000); // sanity
    expect(hits / total).toBeGreaterThan(0.35);
  });

  it('rollAreaSearch material outcomes are rocks/sticks >40% of the time', () => {
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
    expect(hits / materials).toBeGreaterThan(0.4);
  });
});
