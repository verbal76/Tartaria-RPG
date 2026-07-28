// OTA-850 [faction patrols & bounties] — pins the pure bounty helpers: the
// count/reward curve, the offer selection (a favored faction's most-ascendant rival
// that has an outpost to route to), and the kill-counts predicate.

import { bountyTerms, pickBounty, killCountsForBounty } from '../app/engine/factionBounty';
import type { FactionMeta } from '../app/engine/worldPulse';

const FACTIONS: FactionMeta[] = [
  { id: 'order', name: 'Forgotten Order', rivals: ['monarchs', 'ghost'], allies: [] },
  { id: 'monarchs', name: 'Mud Monarchs', rivals: ['order', 'tartarians'], allies: [] },
  { id: 'tartarians', name: 'True Tartarians', rivals: ['monarchs'], allies: [] },
];
const OUTPOST: Record<string, string> = {
  order: 'order_camp',
  monarchs: 'monarch_waystation',
  tartarians: 'pilgrim_waycamp',
};
const outpostOf = (fid: string) => OUTPOST[fid];
const locName = (loc: string) => ({ monarch_waystation: 'Monarch Waystation', pilgrim_waycamp: 'Pilgrim Waycamp', order_camp: 'Order Camp' }[loc] ?? loc);

describe('OTA-850 — bountyTerms scales with the target tide', () => {
  it('3 kills at neutral, up to 6 for an ascendant target; pay rises', () => {
    expect(bountyTerms(0).count).toBe(3);
    expect(bountyTerms(5).count).toBe(6);
    expect(bountyTerms(99).count).toBe(6); // capped
    expect(bountyTerms(5).rewardTc).toBeGreaterThan(bountyTerms(0).rewardTc);
  });
});

describe('OTA-850 — pickBounty', () => {
  it('offers a favored faction a bounty on its rival, routed to the rival outpost', () => {
    const standings = [{ factionId: 'order', standing: 30 }];
    const b = pickBounty(FACTIONS, standings, outpostOf, locName, {});
    expect(b?.giverFactionId).toBe('order');
    expect(b?.targetFactionId).toBe('monarchs');           // order's real rival
    expect(b?.targetLocationId).toBe('monarch_waystation'); // routes to the rival outpost
    expect(b?.targetLocationName).toBe('Monarch Waystation');
    expect(b?.count).toBeGreaterThanOrEqual(3);
  });

  it('picks the most-ascendant eligible rival', () => {
    // Favor tartarians (rival monarchs) and order (rival monarchs) — same quarry;
    // its tide sets the terms.
    const standings = [{ factionId: 'order', standing: 25 }, { factionId: 'tartarians', standing: 25 }];
    const b = pickBounty(FACTIONS, standings, outpostOf, locName, { monarchs: 5 });
    expect(b?.targetFactionId).toBe('monarchs');
    expect(b?.count).toBe(bountyTerms(5).count);
  });

  it('OTA-862 — offers work even at NEUTRAL/negative standing (no gate), just harder', () => {
    // Empty standings = everyone neutral. A faction still posts a bounty on its rival.
    const b = pickBounty(FACTIONS, [], outpostOf, locName, {});
    expect(b).not.toBeNull();
    // At NEUTRAL (0) the giver difficulty is +1 → one more kill than a favored job.
    expect(b!.count).toBe(bountyTerms(0, 0).count);
    expect(bountyTerms(0, 0).count).toBe(4);        // 3 base + 1 dislike step
    expect(bountyTerms(0, -30).count).toBe(6);       // hostile → +3
    expect(bountyTerms(0, -30).rewardRep).toBeGreaterThan(bountyTerms(0, 100).rewardRep); // pays more standing
  });

  it('returns null only when NO faction has an outpost-holding rival', () => {
    const noOutpost = () => undefined;
    expect(pickBounty(FACTIONS, [{ factionId: 'order', standing: 30 }], noOutpost, locName, {})).toBeNull();
    expect(pickBounty([], [], outpostOf, locName, {})).toBeNull();
  });
});

describe('OTA-850 — killCountsForBounty', () => {
  const bounty = { targetFactionId: 'monarchs', count: 3, progress: 1 } as any;
  it('counts a target-faction kill while incomplete', () => {
    expect(killCountsForBounty(bounty, 'monarchs')).toBe(true);
  });
  it('ignores other factions and completed bounties', () => {
    expect(killCountsForBounty(bounty, 'order')).toBe(false);
    expect(killCountsForBounty(undefined, 'monarchs')).toBe(false);
    expect(killCountsForBounty({ ...bounty, progress: 3 }, 'monarchs')).toBe(false);
  });
});
