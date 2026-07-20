// OTA-915 — codex/lore gating for the Great Climbs:
//   - the five summit bosses are projected into the bestiary (single source of
//     truth = greatClimbs.ts), each with a flavor line, names matching the built
//     boss so a defeat catalogues them
//   - the tower locations mask as "?" until their chart is used
//   - the Skyreacher title stays hidden until the questline is discovered

import {
  GREAT_CLIMBS, SUMMIT_BOSSES, SUMMIT_BOSS_BASES, buildSummitBoss,
  greatClimbLoreDiscovered, isGreatClimbLocationLocked,
} from '../app/engine/greatClimbs';
import { isHiddenTitle } from '../app/engine/titles';

describe('OTA-915 — summit bosses in the bestiary', () => {
  it('projects exactly the five summit bosses, each with a codex flavor line', () => {
    expect(SUMMIT_BOSS_BASES).toHaveLength(5);
    for (const b of SUMMIT_BOSS_BASES) {
      expect(typeof b.name).toBe('string');
      expect(b.flavor && b.flavor.length).toBeGreaterThan(0);
      expect(b.rarity).toBe('Legendary');
    }
  });

  it('the projected name matches the built boss name, so defeat catalogues it', () => {
    for (const def of SUMMIT_BOSSES) {
      const built = buildSummitBoss(def.climbId);
      expect(built).not.toBeNull();
      expect(built!.name).toBe(def.base.name);
      // codex projection carries the CLEAN traits (no summit_climb marker)
      const base = SUMMIT_BOSS_BASES.find((b) => b.name === def.base.name);
      expect(base).toBeDefined();
      expect((base!.traits ?? []).some((t) => t.startsWith('summit_climb:'))).toBe(false);
      expect((built!.traits ?? []).some((t) => t.startsWith('summit_climb:'))).toBe(true);
    }
  });
});

describe('OTA-915 — tower locations mask until charted', () => {
  it('a tower location is locked until its climb id is in unlockedGreatClimbs', () => {
    const climb = GREAT_CLIMBS[0]!;
    expect(isGreatClimbLocationLocked(climb.locationId, { unlockedGreatClimbs: [] })).toBe(true);
    expect(isGreatClimbLocationLocked(climb.locationId, undefined)).toBe(true);
    expect(isGreatClimbLocationLocked(climb.locationId, { unlockedGreatClimbs: [climb.id] })).toBe(false);
  });

  it('an ordinary (non-climb) location is never map-gated', () => {
    expect(isGreatClimbLocationLocked('some_random_town', { unlockedGreatClimbs: [] })).toBe(false);
    expect(isGreatClimbLocationLocked(null, undefined)).toBe(false);
  });
});

describe('OTA-915 — Skyreacher title stays hidden until discovered', () => {
  it('isHiddenTitle flags only skyreacher', () => {
    expect(isHiddenTitle('skyreacher')).toBe(true);
    expect(isHiddenTitle('stormcaller')).toBe(false);
    expect(isHiddenTitle('guild_broker')).toBe(false);
  });

  it('lore is discovered once a chart is bought, a climb unlocked, or one crested', () => {
    expect(greatClimbLoreDiscovered(undefined)).toBe(false);
    expect(greatClimbLoreDiscovered({})).toBe(false);
    expect(greatClimbLoreDiscovered({ soldMapIds: ['Skyreacher Chart (1 of 5)'] })).toBe(true);
    expect(greatClimbLoreDiscovered({ unlockedGreatClimbs: ['grand_spire'] })).toBe(true);
    expect(greatClimbLoreDiscovered({ greatClimbsCrested: ['zharak_fang'] })).toBe(true);
  });
});
