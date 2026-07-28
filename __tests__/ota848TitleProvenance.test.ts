// OTA-848 — title provenance formatter. The Character screen shows each earned
// title's earn-date on tap. describeTitleEarned turns a titleLog entry (in-game
// hour + real ms) into a readable "Day N (period) · YYYY-MM-DD", and gives an
// HONEST fallback (never a fabricated date) for titles earned before provenance
// was recorded.

import { describeTitleEarned } from '../app/engine/titles';

describe('OTA-848 — describeTitleEarned', () => {
  it('honest fallback when there is no log entry (pre-tracking title)', () => {
    const s = describeTitleEarned(undefined);
    expect(s).toContain('before this was recorded');
    expect(s).not.toMatch(/Day \d/);
  });

  it('formats the in-game day from hoursElapsed (Day = floor(h/24)+1)', () => {
    // 0h → Day 1, 24h → Day 2, 300h → Day 13
    expect(describeTitleEarned({ atHours: 0, atMs: 0 })).toContain('Day 1');
    expect(describeTitleEarned({ atHours: 24, atMs: 0 })).toContain('Day 2');
    expect(describeTitleEarned({ atHours: 300, atMs: 0 })).toContain('Day 13');
  });

  it('names the day-period bucket and appends the real calendar date', () => {
    // 24h + 20h = 20:00 → evening; atMs is a fixed known instant.
    const atMs = Date.UTC(2026, 6, 16, 12, 0, 0); // 2026-07-16 (local date derived from this)
    const s = describeTitleEarned({ atHours: 24 + 20, atMs });
    expect(s).toContain('evening');
    expect(s).toMatch(/\d{4}-\d{2}-\d{2}$/); // ends with a YYYY-MM-DD stamp
  });
});
