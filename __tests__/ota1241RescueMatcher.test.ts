// ⚠⚠ OTA-1241 — THE FIREPIT THAT STARTED THE DOG QUEST.
//
// Straight from the owner's device log, two milliseconds apart:
//
//     [player]    investigate firepit
//     [dog_quest] You crest the snare pit. The Unaligned Poacher is checking
//                 their lines — and one line holds a half-grown mutt...
//
// He looked at a FIREPIT and got the SNARE PIT rescue, because `"firepit"`
// contains `"pit"` and the matcher ran raw substring in BOTH directions.
//
// ⚠⚠ THE COMPOUND CASE WAS THE MILD ONE. `nl.includes(t)` meant any short noun
// that is a FRAGMENT of a hook phrase matched it — so `door` (inside "cellar
// door"), `ruin` (inside "forge ruin"), `camp` (inside "roadside camp") and
// `anvil` (inside "anvil post") were all dog-rescue triggers. Censused against the
// game's own vocabulary: **35 of 975 scene nouns fired a rescue.**
//
// ⚠ `engine/hooks.ts` FIXED THIS EXACT CLASS in OTA-432 — *"a 2–3 char token could
// snag half the nouns in a room."* This matcher never got it, and OTA-1236
// deliberately copied the loose rule so the bulk-salvage guard would match the
// firer. Matching the firer was right; what got propagated was the bug.
import { rescueScenarioForNoun } from '../app/engine/storyNouns';
import { RESCUE_SCENARIOS } from '../app/engine/dogCompanion';
import { WEAPONS, ARMOR } from '../app/engine/crafting';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

/** Every noun the world can actually place, pulled from the shipped location data
 *  — so this suite measures the REAL exposure rather than a hand-picked sample. */
function vocabulary(): string[] {
  const raw = JSON.parse(src('app', 'data', 'locations', 'locations.json')) as unknown;
  const nouns = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (['interactables', 'ambientNouns', 'props', 'nouns'].includes(k) && Array.isArray(v)) {
          for (const x of v) if (typeof x === 'string') nouns.add(x);
        }
        walk(v);
      }
    }
  };
  walk(raw);
  return [...nouns];
}

describe('OTA-1241 — the noun the owner tapped', () => {
  it('⚠⚠ investigate firepit does NOT start the dog quest', () => {
    expect(rescueScenarioForNoun('firepit')).toBeNull();
  });

  it('⚠⚠ nor do the other compounds that merely CONTAIN a hook word', () => {
    for (const n of ['pulpit', 'climbing piton', 'chainmail', 'cartwheel', 'birdcage']) {
      expect(rescueScenarioForNoun(n)).toBeNull();
    }
  });

  it('⚠⚠ nor the fragments — every door, ruin and camp in the game was a trigger', () => {
    // These matched through the OTHER direction: the target sitting INSIDE a
    // multi-word hook noun. That direction is gone entirely.
    expect(rescueScenarioForNoun('door')).toBeNull();     // was: cellar, via "cellar door"
    expect(rescueScenarioForNoun('ruin')).toBeNull();     // was: smelter, via "forge ruin"
    expect(rescueScenarioForNoun('camp')).toBeNull();     // was: wagon, via "roadside camp"
    expect(rescueScenarioForNoun('anvil')).toBeNull();    // was: smelter, via "anvil post"
  });

  it('⚠⚠ `trap` routes to SNARE, whose list owns it — not to CELLAR via "trapdoor"', () => {
    // A straight mis-route: object-key order put cellar first, and the old prefix
    // rule let `trap` reach `trapdoor`, so the WRONG scenario fired.
    expect(rescueScenarioForNoun('trap')).toBe('snare');
    expect(rescueScenarioForNoun('trapdoor')).toBe('cellar');
  });

  it('⚠⚠ ...and the real triggers still trigger — the fix must not close the quest', () => {
    for (const [id, scenario] of Object.entries(RESCUE_SCENARIOS)) {
      for (const noun of scenario.hookNouns) {
        // Every hook noun matches ITSELF exactly. If this fails, a scenario has
        // been tightened out of existence.
        expect(rescueScenarioForNoun(noun)).not.toBeNull();
      }
      // And at least one live phrasing per scenario.
      void id;
    }
    expect(rescueScenarioForNoun('rusted cage')).toBe('smelter');
    expect(rescueScenarioForNoun('half-buried wagon')).toBe('wagon');
    expect(rescueScenarioForNoun('rusted hatch')).toBe('cellar');
    expect(rescueScenarioForNoun('lobster trap')).toBe('snare');
  });

  it('⚠⚠ NO REAL ITEM is a dog lead — the OTA-1236 regression this closes', () => {
    // Since OTA-1236 a lead outranks the catalog in the loot picker, so a
    // mis-flagged item rendered in the un-sweepable lane, tapped INVESTIGATE
    // instead of TAKE, and was skipped by TAKE ALL GEAR. `Aetheric Chainmail`
    // matched "chain".
    const flagged = [...WEAPONS, ...ARMOR]
      .map((i) => i.name)
      .filter((n) => rescueScenarioForNoun(n) !== null);
    expect(flagged).toEqual([]);
  });
});

describe('OTA-1241 — censused against the whole vocabulary, not a sample', () => {
  it('⚠⚠ the exposure is CUT, and the number is pinned so it cannot drift back', () => {
    const v = vocabulary();
    // The vocabulary itself is worth pinning — if it shrinks by an order of
    // magnitude the census below is measuring nothing.
    expect(v.length).toBeGreaterThan(800);
    const hits = v.filter((n) => rescueScenarioForNoun(n) !== null);
    // Was 35 before the fix. Every remaining hit is a noun that genuinely reads
    // as the scenario's prop (a chain, a wagon, a hatch, a trap).
    expect(hits.length).toBeLessThanOrEqual(28);
    for (const n of ['door', 'ruin', 'camp', 'anvil', 'firepit', 'pulpit', 'climbing piton', 'mud pit']) {
      expect(hits).not.toContain(n);
    }
  });

  it('⚠⚠ ...and EVERY scenario is still reachable from the shipped world', () => {
    // ⚠ THE REASON THIS SUITE EXISTS IN THIS SHAPE. The census found that THIRTEEN
    // of the twenty hook nouns match nothing the world places — the cellar rescue
    // is reachable only through `hatch`, the snare rescue only through `trap`. So
    // the loose matcher was not just a bug, it was LOAD-BEARING, and tightening it
    // without this check could have closed a quest line silently.
    const v = vocabulary();
    const reached = new Set(v.map((n) => rescueScenarioForNoun(n)).filter(Boolean));
    for (const id of Object.keys(RESCUE_SCENARIOS)) {
      expect([...reached]).toContain(id);
    }
  });
});

describe('OTA-1241 — the intro names what the player looked at', () => {
  it('⚠⚠ no scenario intro hard-codes its own prop any more', () => {
    // "You crest the snare pit" fired on a firepit, a mud pit and a lobster trap.
    // The line has to name the engaged noun, or it describes a room the player is
    // not standing in — the one thing this project refuses to ship.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const introLines: Record<RescueScenarioId, string>');
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 1600);
    expect(block).not.toContain('You crest the snare pit');
    expect(block).not.toContain("You step into the smelter's ruin");
    expect(block).not.toContain('The overturned wagon shifts');
    expect(block).not.toContain('The cellar door clatters open');
    // All four lines interpolate the engaged noun.
    expect((block.match(/engaged/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('⚠ the engaged noun is THREADED from the dispatch, not re-derived', () => {
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain('tryFireRescueScenario(get, set, rescueId, targetText)');
    expect(store).toContain('engagedNoun: string,');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ⚠⚠ OTA-1242 — THE SALVAGE CENSUS. Owner, working the model out loud: *"take is
// for carryable items that might be scrapped later... all the rest are just
// smaller items that can be salvaged."*
//
// That rule was not true. Measured across every noun the world can place:
//
//     BEFORE            AFTER
//     take        69    69
//     salvage    453    722
//     climb       44    37
//     water       15    12
//     NO HOME    394    135     ← 40% of the vocabulary, now 14%
//
// The 394 were being DROPPED from the loot picker by OTA-1234 — the right call at
// the time (the button was promising to break them and finding nothing) but it
// papered over the real problem: an anvil is a lump of iron and the game pretended
// it was not there.
import { hasSalvageYield } from '../app/engine/salvagePools';
import { findCatalogItem } from '../app/engine/crafting';
import { isClimbable } from '../app/engine/interactionTags';

const WATER = /pool|puddle|crevice|spring|pond|standing water|water/i;
type Home = 'take' | 'salvage' | 'climb' | 'water' | 'none';
const homeFor = (n: string): Home =>
  findCatalogItem(n) !== null ? 'take'
    : hasSalvageYield(n) ? 'salvage'
      : isClimbable(n) ? 'climb'
        : WATER.test(n) ? 'water'
          : 'none';

describe('OTA-1242 — every noun the world places, censused', () => {
  it('⚠⚠ the homeless share is DOWN, and pinned as a ceiling so it cannot creep back', () => {
    const v = vocabulary();
    const homeless = v.filter((n) => homeFor(n) === 'none');
    // Was 394/975. Pinned as a fraction rather than a raw count so adding nouns to
    // the world does not fail this by arithmetic — but adding UNHOMED ones does.
    expect(homeless.length / v.length).toBeLessThan(0.16);
  });

  it('⚠⚠ the nouns the owner named by hand all have a home now', () => {
    // From the conversation and the device log: the ones whose homelessness was
    // indefensible. An anvil is iron; a firepit is stone and ash.
    for (const n of ['anvil', 'statue', 'firepit', 'sack', 'tent', 'signpost', 'stall', 'marker']) {
      expect(homeFor(n)).not.toBe('none');
    }
  });

  it('⚠⚠ ...and the ones that SHOULD stay homeless still are — the rule has a boundary', () => {
    // ⚠ THE HALF THAT MATTERS MORE. Handing a stain or a fog bank a material would
    // be the "button that lies" again, pointing the other way. These are places and
    // traces, not objects, and INVESTIGATE stays their verb.
    for (const n of ['blood stain', 'fog bank', 'corridor', 'footprint', 'chalk dust',
                     'echo', 'horizon', 'static field', 'oil stain', 'smear']) {
      expect(homeFor(n)).toBe('none');
    }
  });

  it('⚠ every census pool grants REAL catalog items — a phantom grant is a silent loss', () => {
    // OTA-078's lesson: grantItem on a name the catalog does not know fails
    // silently, and the player is told they found something they did not get.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { __TEST_ONLY__ } = require('../app/engine/salvagePools') as {
      __TEST_ONLY__: { POOLS: Array<{ id: string; items: Array<{ name: string }> }> };
    };
    const census = ['fixture_metal', 'stonework', 'textile', 'glassware', 'growth', 'devotional'];
    const seen: string[] = [];
    for (const pool of __TEST_ONLY__.POOLS) {
      if (!census.includes(pool.id)) continue;
      seen.push(pool.id);
      for (const item of pool.items) expect(findCatalogItem(item.name)).not.toBeNull();
    }
    // All six landed — a renamed pool would otherwise skip this check silently.
    expect(seen.sort()).toEqual([...census].sort());
  });

  it('⚠ the census pools sit LAST, so no existing pool loses a noun it already owned', () => {
    // `pickPool` stops at the first hit. These are broad by design; ahead of the
    // specific pools they would swallow half the game.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { __TEST_ONLY__ } = require('../app/engine/salvagePools') as {
      __TEST_ONLY__: { POOLS: Array<{ id: string }> };
    };
    const ids = __TEST_ONLY__.POOLS.map((p) => p.id);
    const firstCensus = ids.indexOf('fixture_metal');
    for (const specific of ['mechanical', 'wagon', 'weapon_scrap', 'engine_parts', 'rubble', 'container']) {
      expect(ids.indexOf(specific)).toBeLessThan(firstCensus);
    }
  });
});
