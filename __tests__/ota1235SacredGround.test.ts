// OTA-1235 — THE MARKET TRUCE, AS LAW. Owner, after a Conspiracy Architects
// war party killed Verbal ON Hidden Market ground: "the hidden market is
// sacred tartarian ground. it's like holy ground on the Highlander and the
// Continental in John Wick." The location's text always claimed the truce;
// four spawn doors now enforce it through ONE shared predicate — the raid
// (the door that killed him, previously unguarded), the rest ambush
// (previously a full wilderness 22%), the arrival encounter, and the
// investigate ambush (both previously guarded by their own inline spellings).
import { readFileSync } from 'fs';
import { join } from 'path';
import { isSacredGround } from '../app/engine/sacredGround';

describe('OTA-1235 — the one spelling of the truce', () => {
  it('the Hidden Market is sacred, by id and by tag alike', () => {
    expect(isSacredGround({ id: 'hidden_market', tags: [] })).toBe(true);
    expect(isSacredGround({ id: 'somewhere_else', tags: ['market'] })).toBe(true);
    expect(isSacredGround({ id: 'somewhere_else', tags: ['Market'] })).toBe(true);
  });
  it('ordinary ground is not', () => {
    expect(isSacredGround({ id: 'tartarian_outskirts', tags: ['mud', 'open'] })).toBe(false);
    expect(isSacredGround(null)).toBe(false);
    expect(isSacredGround(undefined)).toBe(false);
  });
});

describe('OTA-1235 — all four doors consult it', () => {
  // ⚠ Source pins, silent-no-op class: a door that drops the check re-opens
  // sacred ground to the world's violence with green tests behind it. The
  // count is the pin — four requires, one per door.
  it('the raid, the rest ambush, the arrival roll, and the investigate ambush', () => {
    const store = readFileSync(join(__dirname, '..', 'app', 'state', 'gameStore.ts'), 'utf8');
    const uses = store.split("require('../engine/sacredGround')").length - 1;
    expect(uses).toBeGreaterThanOrEqual(4);
    // The raid's hold NARRATES (the truce must be seen working, not silent),
    // spends no lastRaidHour, and returns before any party is built.
    expect(store).toContain("truce is older than any grudge");
    // The rest ambush rolls ZERO on sacred ground — not the hub's 8%.
    expect(store).toContain('restSacred(restLoc) ? 0 : restInSafeZone ? 0.08 : 0.22');
  });
});
