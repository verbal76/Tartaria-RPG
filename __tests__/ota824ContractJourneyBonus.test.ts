// B2 (OTA-1109) — remote "send word" hand-ins are gone; every contract is a face-to-face
// turn-in you must travel to. To keep a long trek worth it ("I don't want a 32-time trip
// worth 20 TC"), turn-in pays a LONG-HAUL bonus scaled to how remote the hand-in tile is
// from the starter region. This locks the bonus math: 0 at the hub, scaling with
// distance, capped at 1.5x the base.

import {
  contractJourneyBonusTc,
  contractTurnInRemoteness,
} from '../app/engine/contractMarkers';
import { canonicalCellOf } from '../app/engine/worldMap';

// Pick a location that is genuinely far from the starter hub on the canon atlas.
const HUB = 'tartarian_outskirts';
const remoteCandidates = ['asgardar', 'voronov', 'iskan_veil', 'karok_sa', 'yuldra_tul', 'drakova'];
const hubCell = canonicalCellOf(HUB);
const REMOTE = remoteCandidates
  .map((id) => ({ id, d: (() => { const c = canonicalCellOf(id); return Math.abs(c.x - hubCell.x) + Math.abs(c.y - hubCell.y); })() }))
  .sort((a, b) => b.d - a.d)[0]!;

describe('OTA-1109 — contract long-haul journey bonus', () => {
  it('pays nothing extra for a hand-in AT the starter hub', () => {
    expect(contractTurnInRemoteness(HUB)).toBe(0);
    expect(contractJourneyBonusTc(HUB, 100)).toBe(0);
  });

  it('a remote hand-in earns a real bonus (a far 20 TC contract is no longer 20 TC)', () => {
    expect(REMOTE.d).toBeGreaterThan(0);                     // the atlas really does place it far
    const bonus = contractJourneyBonusTc(REMOTE.id, 20);
    expect(bonus).toBeGreaterThan(0);
  });

  it('the bonus is capped at 1.5x the base reward (can never dwarf it)', () => {
    // A tiny base with a very remote turn-in: the cap binds.
    const bonus = contractJourneyBonusTc(REMOTE.id, 20);
    expect(bonus).toBeLessThanOrEqual(Math.round(20 * 1.5));
  });

  it('scales with remoteness — a farther hand-in pays at least as much', () => {
    const sorted = remoteCandidates
      .map((id) => ({ id, d: contractTurnInRemoteness(id) }))
      .sort((a, b) => a.d - b.d);
    const near = sorted[0]!, far = sorted[sorted.length - 1]!;
    if (far.d > near.d) {
      expect(contractJourneyBonusTc(far.id, 500)).toBeGreaterThanOrEqual(contractJourneyBonusTc(near.id, 500));
    }
  });

  it('never returns a negative bonus, even for a zero/negative base', () => {
    expect(contractJourneyBonusTc(REMOTE.id, 0)).toBe(0);
    expect(contractJourneyBonusTc(HUB, -50)).toBe(0);
  });
});
