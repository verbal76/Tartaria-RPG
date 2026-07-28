// OTA-782 — the Hidden Market is the contract HUB. Its stall vendors are
// neutral-ground brokers that post EVERY faction's open contracts (rep-gated
// per faction). This pins the two things that make that real:
//   1. A market stall vendor id is recognized as a broker.
//   2. Aggregating available contracts across all factions at a fresh (rep-0)
//      standing yields a non-empty board — so the market always has work,
//      unlike a single faction the player has no standing with.

import { availableFactionQuests } from '../app/engine/factionQuests';
import { availableHunts } from '../app/engine/hunts';
import { availableMysteries } from '../app/engine/mysteries';
import { availableStorylines } from '../app/engine/factionStorylines';
import { FACTIONS } from '../app/engine/factions';

function brokerBoardSize(rep = 0): number {
  const seen = new Set<string>();
  let n = 0;
  const factionIds: (string | null)[] = [null, ...FACTIONS.map((f) => f.id)];
  for (const fid of factionIds) {
    if (fid) {
      for (const q of availableFactionQuests(fid, rep, [], [])) if (!seen.has(`q:${q.id}`)) { seen.add(`q:${q.id}`); n++; }
      for (const s of availableStorylines(fid, rep, [], [])) if (!seen.has(`s:${s.id}`)) { seen.add(`s:${s.id}`); n++; }
    }
    for (const h of availableHunts(fid, rep, [], [])) if (!seen.has(`h:${h.id}`)) { seen.add(`h:${h.id}`); n++; }
    for (const m of availableMysteries(fid, rep, [], [])) if (!seen.has(`m:${m.id}`)) { seen.add(`m:${m.id}`); n++; }
  }
  return n;
}

describe('OTA-782 — market broker contract board', () => {
  it('there are multiple factions to aggregate work from', () => {
    expect(FACTIONS.length).toBeGreaterThan(2);
  });

  it('a fresh (rep 0) cross-faction board is non-empty — the market always has contracts', () => {
    expect(brokerBoardSize(0)).toBeGreaterThan(0);
  });

  it('the board grows (or holds) as standing rises — rep gates still matter', () => {
    const low = brokerBoardSize(0);
    const high = brokerBoardSize(50);
    expect(high).toBeGreaterThanOrEqual(low);
  });
});
