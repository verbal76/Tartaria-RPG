// OTA-213 — verifies the investigate verb now biases the
// rollAreaSearch distribution toward hooks (60% target vs 15% for
// search/harvest). Player ask:
//   "let's have investigate be more inclined to have you find story
//   hooks than anything else. ... I don't want this shit to be a
//   clicking simulator."

import { rollAreaSearch } from '../app/engine/areaSearch';

describe('OTA-213 — investigate intent biases rollAreaSearch toward hooks', () => {
  function countHooks(trials: number, opts?: Parameters<typeof rollAreaSearch>[1]): number {
    let h = 0;
    for (let i = 0; i < trials; i++) {
      if (rollAreaSearch('rubble', opts).kind === 'hook') h++;
    }
    return h;
  }

  it('default search/harvest stays ~15% hook rate', () => {
    const rate = countHooks(2000) / 2000;
    expect(rate).toBeGreaterThanOrEqual(0.10);
    expect(rate).toBeLessThanOrEqual(0.22);
  });

  it('investigate intent makes the story bucket the norm (~75%): hook + directional + cool_story', () => {
    // OTA-213/216 made the "story" bucket the bulk of investigates. arb61
    // raised it further (verb economy: investigate = clues + mission hooks as
    // the NORM; routine common-material foraging removed, leaving only a ~7%
    // RARE find + ~8% tc + ~10% nothing → ~75% story). Asserting on the TOTAL
    // of the three story sub-kinds; sub-rates are covered in
    // directionalFindAndCoolStory.
    let storyCount = 0;
    for (let i = 0; i < 2000; i++) {
      const o = rollAreaSearch('rubble', { intent: 'investigate' });
      if (o.kind === 'hook' || o.kind === 'directional_find' || o.kind === 'cool_story') storyCount++;
    }
    const rate = storyCount / 2000;
    expect(rate).toBeGreaterThanOrEqual(0.65);
    expect(rate).toBeLessThanOrEqual(0.85);
  });

  it('investigate + Vision Lens hookBonus stays under the 0.4 clamp', () => {
    // baseline 60% + bonus capped at 40pp → ~max 100% but bonus only
    // converts nothing-share. Asserting on the story bucket total.
    let storyCount = 0;
    for (let i = 0; i < 2000; i++) {
      const o = rollAreaSearch('rubble', { intent: 'investigate', hookBonus: 99 });
      if (o.kind === 'hook' || o.kind === 'directional_find' || o.kind === 'cool_story') storyCount++;
    }
    const rate = storyCount / 2000;
    expect(rate).toBeLessThanOrEqual(0.95); // hard upper sanity bound
  });

  it('investigate distribution shrinks the nothing bucket to ~10%', () => {
    let nothing = 0;
    for (let i = 0; i < 2000; i++) {
      if (rollAreaSearch('rubble', { intent: 'investigate' }).kind === 'nothing') nothing++;
    }
    const rate = nothing / 2000;
    expect(rate).toBeGreaterThanOrEqual(0.05);
    expect(rate).toBeLessThanOrEqual(0.16);
  });

  it('search/harvest distribution keeps nothing ~40%', () => {
    let nothing = 0;
    for (let i = 0; i < 2000; i++) {
      if (rollAreaSearch('rubble').kind === 'nothing') nothing++;
    }
    const rate = nothing / 2000;
    expect(rate).toBeGreaterThanOrEqual(0.32);
    expect(rate).toBeLessThanOrEqual(0.48);
  });
});
