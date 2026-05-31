import { applyRepChange, getStanding, meetsJoinThreshold, JOIN_THRESHOLD } from '../app/engine/factions';
import type { FactionStanding } from '../app/engine/types';

function freshStanding(): FactionStanding[] {
  return [
    { factionId: 'mud_monarchs', standing: 0 },
    { factionId: 'forgotten_order', standing: 0 },
    { factionId: 'reclaimers_guild', standing: 0 },
    { factionId: 'true_tartarians', standing: 0 },
    { factionId: 'eternal_dynasty', standing: 0 },
  ];
}

describe('applyRepChange — faction propagation', () => {
  it('changes the target faction by full delta', () => {
    const r = applyRepChange(freshStanding(), 'forgotten_order', 10);
    expect(getStanding(r.standing, 'forgotten_order')).toBe(10);
  });

  it('propagates inverse delta to rivals at half magnitude', () => {
    const r = applyRepChange(freshStanding(), 'forgotten_order', 10);
    // forgotten_order rivals include mud_monarchs
    expect(getStanding(r.standing, 'mud_monarchs')).toBe(-5);
  });

  it('propagates half delta to allies (after suffix normalization)', () => {
    // forgotten_order's allies list contains "reclaimers_guild_situational"
    // — the normalizer should strip the suffix and match reclaimers_guild.
    const r = applyRepChange(freshStanding(), 'forgotten_order', 10);
    expect(getStanding(r.standing, 'reclaimers_guild')).toBe(5);
  });

  it('returns the changed-summary entries for each affected faction', () => {
    const r = applyRepChange(freshStanding(), 'forgotten_order', 10);
    const ids = r.changed.map((c) => c.factionId).sort();
    expect(ids).toContain('forgotten_order');
    expect(ids).toContain('mud_monarchs');
  });

  it('returns empty changes for unknown faction id', () => {
    const r = applyRepChange(freshStanding(), 'nonexistent_faction', 10);
    expect(r.changed.length).toBe(0);
  });
});

describe('meetsJoinThreshold', () => {
  it('returns false below the threshold', () => {
    const s = freshStanding();
    s[0]!.standing = JOIN_THRESHOLD - 1;
    expect(meetsJoinThreshold(s, s[0]!.factionId)).toBe(false);
  });
  it('returns true at or above the threshold', () => {
    const s = freshStanding();
    s[0]!.standing = JOIN_THRESHOLD;
    expect(meetsJoinThreshold(s, s[0]!.factionId)).toBe(true);
  });
});
