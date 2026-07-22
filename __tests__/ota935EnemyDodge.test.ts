// OTA-935 — an agile/quick enemy can slip a marginal blow, but a CRIT or a crushing
// margin always lands (no "rolled 29 and whiffed"), and the base rate is reduced.
import { enemyDodgesHit, DODGE_BEATEN_MARGIN } from '../app/engine/enemyTraits';

const agile = ['agile'];

describe('OTA-935 — enemy dodge rules', () => {
  it('a CRIT is never dodged (even with a dodge-guaranteeing rng)', () => {
    expect(enemyDodgesHit(agile, 12, 10, true, () => 0)).toBe(false);
  });
  it('a crushing margin (>= DODGE_BEATEN_MARGIN) always lands', () => {
    expect(enemyDodgesHit(agile, 10 + DODGE_BEATEN_MARGIN, 10, false, () => 0)).toBe(false);
    expect(enemyDodgesHit(agile, 29, 7, false, () => 0)).toBe(false); // the logged "rolled 29 vs AC 7" case
  });
  it('a marginal hit faces the reduced trait dodge chance', () => {
    expect(enemyDodgesHit(agile, 11, 10, false, () => 0.10)).toBe(true);  // under 0.18 -> dodged
    expect(enemyDodgesHit(agile, 11, 10, false, () => 0.50)).toBe(false); // over 0.18  -> lands
  });
  it('a non-agile/quick enemy never dodges', () => {
    expect(enemyDodgesHit(['armored'], 11, 10, false, () => 0)).toBe(false);
    expect(enemyDodgesHit(undefined, 11, 10, false, () => 0)).toBe(false);
  });
});
