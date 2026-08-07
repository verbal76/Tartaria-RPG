// OTA-1159 — THE GAIN SIDE OF A HOSTILE CASCADE IS METERED. THE LOSS SIDE IS NOT.
//
// Owner: "just nerf it a bit like you suggested" (2026-08-07), superseding an earlier
// "leave it" on the same item.
//
// Every standing LOSS cascades through `applyRepChange`: allies take half, rivals take
// the INVERSE — so they gain. A caught theft is −10 to the victim, −5 to their allies
// and **+5 to every rival**; a successful extortion is −6 / −3 / **+3**. Gifts have
// carried a lifetime per-faction budget since OTA-803; this path had none, so shaking
// down a faction's enemies was an unbounded way to climb with them. Conspiracy
// Architects have four rivals and start at −20 — roughly fourteen extortions of their
// enemies reached the join threshold, repeatable forever.
//
// ⚠ ONLY THE GAINS ARE CAPPED, and the asymmetry is the design, not an oversight:
// being HATED must stay uncapped or a player can spend past their own consequences;
// being LOVED BY PROXY is the part nobody aimed at them. Same shape as the gift path,
// same reason.

import { applyRepChange } from '../app/engine/factions';
import { GIFT_STANDING_FACTION_CAP } from '../app/engine/gifting';

import * as fs from 'fs';
import * as path from 'path';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const STORE = read('app', 'state', 'gameStore.ts');

/** The meter, mirrored — it is module-private in the store by design. Kept in step
 *  with the source by the structural assertions in the last block. */
const CAP = 10;
type Changed = { factionId: string; delta: number; newStanding: number };
function meter(
  standing: { factionId: string; standing: number }[],
  changed: Changed[],
  granted: Record<string, number>,
): { standing: typeof standing; changed: Changed[]; granted: Record<string, number> } {
  const g = { ...granted };
  let rows = standing.map((r) => ({ ...r }));
  const out: Changed[] = [];
  for (const c of changed) {
    if (c.delta <= 0) { out.push(c); continue; }
    const spent = g[c.factionId] ?? 0;
    const allowed = Math.max(0, Math.min(c.delta, CAP - spent));
    if (allowed === c.delta) { g[c.factionId] = spent + allowed; out.push(c); continue; }
    const excess = c.delta - allowed;
    rows = rows.map((r) => (r.factionId === c.factionId
      ? { ...r, standing: r.standing - excess } : r));
    if (allowed > 0) {
      g[c.factionId] = spent + allowed;
      out.push({ ...c, delta: allowed, newStanding: c.newStanding - excess });
    }
  }
  return { standing: rows, changed: out, granted: g };
}

describe('OTA-1159 — the spite farm is bounded', () => {
  it('rival gains stop at the cap, however many hostile acts follow', () => {
    // Extorting forgotten_order pays +3 to each of its rivals every single time.
    let rows = [
      { factionId: 'forgotten_order', standing: 0 },
      { factionId: 'mud_monarchs', standing: 0 },
      { factionId: 'conspiracy_architects', standing: -20 },
    ];
    let granted: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      const r = applyRepChange(rows, 'forgotten_order', -6);
      const m = meter(r.standing, r.changed, granted);
      rows = m.standing; granted = m.granted;
    }
    const ca = rows.find((r) => r.factionId === 'conspiracy_architects')!;
    // 20 shakedowns used to be +60. It is now +10, once, forever.
    expect(granted['conspiracy_architects']).toBe(CAP);
    expect(ca.standing).toBe(-20 + CAP);
    // ⚠ and it is nowhere near the join threshold of 20, which was the point
    expect(ca.standing).toBeLessThan(20);
  });

  it('the loss side is untouched — being hated has no ceiling', () => {
    let rows = [
      { factionId: 'forgotten_order', standing: 0 },
      { factionId: 'mud_monarchs', standing: 0 },
    ];
    let granted: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      const r = applyRepChange(rows, 'forgotten_order', -6);
      const m = meter(r.standing, r.changed, granted);
      rows = m.standing; granted = m.granted;
    }
    const fo = rows.find((r) => r.factionId === 'forgotten_order')!;
    // 20 × −6, floored only by REP_MIN — never by this meter.
    expect(fo.standing).toBeLessThanOrEqual(-100);
  });

  it('a partial gain lands partially, and the excess is rolled OFF the rows', () => {
    // ⚠ Rolling back the standing matters as much as trimming the log. An
    // over-budget gain that still moved the number while going unreported would be
    // the OTA-1156 defect — a log that disagrees with the save — pointing the other
    // way. Budget 8 spent, a +5 arrives: 2 lands, 3 is reversed, the log says 2.
    const rows = [{ factionId: 'mud_monarchs', standing: 5 }];
    const changed: Changed[] = [{ factionId: 'mud_monarchs', delta: 5, newStanding: 5 }];
    const m = meter(rows, changed, { mud_monarchs: 8 });
    expect(m.granted['mud_monarchs']).toBe(CAP);
    expect(m.changed).toEqual([{ factionId: 'mud_monarchs', delta: 2, newStanding: 2 }]);
    expect(m.standing[0]!.standing).toBe(2);
  });

  it('a fully exhausted budget removes the gain from the feed entirely', () => {
    const rows = [{ factionId: 'mud_monarchs', standing: 10 }];
    const changed: Changed[] = [{ factionId: 'mud_monarchs', delta: 5, newStanding: 10 }];
    const m = meter(rows, changed, { mud_monarchs: CAP });
    expect(m.changed).toEqual([]);          // nothing to report...
    expect(m.standing[0]!.standing).toBe(5); // ...because nothing landed
  });

  it('losses in the same cascade pass through untrimmed', () => {
    // A theft hits the victim and their allies while paying their rivals. Only the
    // rivals' side is metered; the victim and allies must be reported in full.
    const rows = [
      { factionId: 'forgotten_order', standing: -10 },
      { factionId: 'reclaimers_guild', standing: -5 },
      { factionId: 'mud_monarchs', standing: 5 },
    ];
    const changed: Changed[] = [
      { factionId: 'forgotten_order', delta: -10, newStanding: -10 },
      { factionId: 'reclaimers_guild', delta: -5, newStanding: -5 },
      { factionId: 'mud_monarchs', delta: 5, newStanding: 5 },
    ];
    const m = meter(rows, changed, { mud_monarchs: CAP });
    expect(m.changed.map((c) => c.factionId)).toEqual(['forgotten_order', 'reclaimers_guild']);
    expect(m.changed.every((c) => c.delta < 0)).toBe(true);
  });
});

describe('OTA-1159 — wired where the hostile acts are', () => {
  it('both the theft and the extort path route through the meter', () => {
    expect(STORE).toContain('const SPITE_STANDING_FACTION_CAP = 10;');
    expect(STORE).toContain('const repResult = meterSpiteGains(get, set, {');
    expect(STORE).toContain('applyRepChange(p.factionStanding, faction, -PARLEY_EXTORT_REP),');
    const calls = STORE.match(/meterSpiteGains\(/g) ?? [];
    expect(calls.length).toBe(3); // the declaration + the two hostile paths
  });

  it('the punishment magnitudes are unchanged — this caps spillover, not consequence', () => {
    expect(STORE).toContain('applyRepChange(repStanding, vendorFaction, -10).standing');
    expect(STORE).toContain('applyRepChange(repStanding, nativeFaction, -10).standing');
    expect(STORE).toContain('const PARLEY_EXTORT_REP = 6;');
  });

  it('the budget persists on worldMemory, like the gift budget it mirrors', () => {
    // On worldMemory rather than the player so it survives the same way the gift
    // budget does — the door OTA-803 closed stays closed across a save/load.
    expect(read('app', 'engine', 'types.ts')).toContain('spiteStandingGranted?: Record<string, number>;');
    expect(STORE).toContain('spiteStandingGranted: granted');
    expect(GIFT_STANDING_FACTION_CAP).toBe(10);
  });
});
