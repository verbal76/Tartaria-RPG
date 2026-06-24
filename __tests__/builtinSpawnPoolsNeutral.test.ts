// engine_Dev — GUARD: the built-in procedural SCENE-PROP pools (climbable + salvageable
// nouns) are injected into EVERY scene regardless of the author's setting, so they must
// read SETTING-NEUTRAL. They used to ship Tartaria/fantasy nouns ("forgotten order
// reliquary", "zharak's teeth spire", "shattered tartarian relay") that leaked into
// authored games (e.g. a 1943 WWII game). These are the engine FALLBACK pools, used
// until an author supplies their own via the scene-props override. If this fails,
// neutralize the offending entry — don't weaken the term list.

import { OUTSIDE_CLIMBABLES, INSIDE_CLIMBABLES, pickClimbablesForScene, curatedClimbHeight } from '../app/engine/climbableSpawns';
import { OUTSIDE_SALVAGEABLES, INSIDE_SALVAGEABLES, pickSalvageablesForScene } from '../app/engine/salvageableSpawns';
import { setScenePropsOverride } from '../app/engine/contentPack';

const TARTARIA_NOUN = /tartar|aether|zharak|forgotten order|reclaimer\b|\brune|\brelic|royal\b|monarch|obsidian|sentinel|arcane|sigil|reliquary|giant\b/i;

describe('engine_Dev — built-in scene-prop pools are setting-neutral', () => {
  const pools: Array<[string, { name: string }[]]> = [
    ['OUTSIDE_CLIMBABLES', OUTSIDE_CLIMBABLES],
    ['INSIDE_CLIMBABLES', INSIDE_CLIMBABLES],
    ['OUTSIDE_SALVAGEABLES', OUTSIDE_SALVAGEABLES],
    ['INSIDE_SALVAGEABLES', INSIDE_SALVAGEABLES],
  ];
  it.each(pools)('%s carries no setting-specific nouns', (_name, pool) => {
    const leaks = pool.map((p) => p.name).filter((n) => TARTARIA_NOUN.test(n));
    expect(leaks).toEqual([]);
  });

  it('pools are non-empty (still produce ambient props)', () => {
    for (const [, pool] of pools) expect(pool.length).toBeGreaterThan(0);
  });
});

describe('engine_Dev — scene-props override replaces the built-in pools', () => {
  afterEach(() => setScenePropsOverride(null));

  const outdoorLoc = { type: 'region', tags: ['open'] };

  it('an author override supplies the climb/salvage nouns + heights; clearing restores built-ins', () => {
    setScenePropsOverride({
      climbables: [{ name: 'collapsed radio mast', context: 'outside', height: 5 }],
      salvageables: [{ name: 'wrecked staff car', context: 'outside' }],
    });
    const seq = () => { let i = 0; return () => ((i++ % 7) + 0.5) / 7; };
    expect(pickClimbablesForScene(outdoorLoc, seq()).join(' ')).toContain('collapsed radio mast');
    expect(pickSalvageablesForScene(outdoorLoc, seq()).join(' ')).toContain('wrecked staff car');
    // height comes from the override entry, not the built-in lookup
    expect(curatedClimbHeight('leaning collapsed radio mast')).toBe(5);

    setScenePropsOverride(null);
    // back to a built-in (neutral) noun
    expect(pickClimbablesForScene(outdoorLoc, seq()).join(' ').length).toBeGreaterThan(0);
    expect(curatedClimbHeight('collapsed radio mast')).toBeNull();
  });
});
