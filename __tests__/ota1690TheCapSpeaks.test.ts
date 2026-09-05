/**
 * OTA-1690 — THE CAP SPEAKS. Step-4 mundane reader; the narrative-agency
 * audit's hole 9: the two lifetime standing budgets — gifts to a faction's
 * people (GIFT_STANDING_FACTION_CAP) and the rivals' gratitude for spiting
 * someone else (SPITE_STANDING_FACTION_CAP) — stopped the number in silence,
 * so a spent budget read as a broken counter. One line at the CROSSING, never
 * again after it, from one helper both writers call.
 */
import fs from 'node:fs';
import path from 'node:path';
import { standingCapLine } from '../app/engine/factions';
import { GIFT_STANDING_FACTION_CAP } from '../app/engine/gifting';

const src = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

describe('OTA-1690 — the crossing line', () => {
  it('fires exactly at the gain that reaches the ceiling, whether it lands whole or is trimmed', () => {
    const cap = 10;
    // Under the ceiling: silent.
    expect(standingCapLine('gift', 'The Order', 0, 3, cap)).toBeNull();
    expect(standingCapLine('gift', 'The Order', 3, 6, cap)).toBeNull();
    // The gain that lands the last of the budget — exactly, or trimmed to fit.
    expect(standingCapLine('gift', 'The Order', 7, 3, cap)).toBe('The Order has taken your measure through gifts already — from here on a present wins the person, not the banner.');
    expect(standingCapLine('gift', 'The Order', 8, 2, cap)).not.toBeNull();
    // Already at the ceiling on an earlier gain: said once, at the crossing — not again.
    expect(standingCapLine('gift', 'The Order', 10, 0, cap)).toBeNull();
    expect(standingCapLine('gift', 'The Order', 12, 0, cap)).toBeNull();
  });

  it('the spite ceiling has its own words', () => {
    expect(standingCapLine('spite', 'The Reclaimers', 6, 4, 10)).toBe("Their rivals' gratitude has a ceiling — The Reclaimers will not think better of you for spiting someone else again.");
    expect(standingCapLine('spite', 'The Reclaimers', 10, 0, 10)).toBeNull();
    expect(standingCapLine('spite', 'The Reclaimers', 0, 5, 10)).toBeNull();
  });

  it('the real caps are what the sites pass', () => {
    expect(GIFT_STANDING_FACTION_CAP).toBe(10);
    const store = src('app', 'state', 'gameStore.ts');
    expect(store.includes('const SPITE_STANDING_FACTION_CAP = 10;')).toBe(true);
  });
});

describe('OTA-1690 — both writers call it', () => {
  const store = src('app', 'state', 'gameStore.ts');

  it('the gift standing path speaks at the crossing and still lands the gift on the person', () => {
    expect(store.includes("standingCapLine('gift', factionLabel, spent, applied, GIFT_STANDING_FACTION_CAP)")).toBe(true);
    // The order matters: the line prints BEFORE the exhausted-budget return, so
    // the gain that reaches the ceiling is the one that says so.
    const at = store.indexOf("standingCapLine('gift'");
    const ret = store.indexOf('if (applied === 0) return; // budget exhausted');
    expect(at).toBeGreaterThan(-1);
    expect(ret).toBeGreaterThan(at);
  });

  it('the spite meter speaks at the crossing, on the same `spent`/`allowed` the rollback uses', () => {
    expect(store.includes("standingCapLine('spite', FACTIONS.find((f) => f.id === c.factionId)?.name ?? c.factionId, spent, allowed, SPITE_STANDING_FACTION_CAP)")).toBe(true);
    const at = store.indexOf("standingCapLine('spite'");
    const branch = store.indexOf('if (allowed === c.delta) {');
    expect(at).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(at); // before the branch, so both the whole and the trimmed gain pass it
  });

  it('the store stays under the line ratchet', () => {
    expect(store.split('\n').length).toBeLessThan(37000);
  });
});
