/**
 * OTA-1053 — the last of the Phase 1 residuals.
 *
 * ── (1) LEDGER IDENTITY WAS RUNTIME IDENTITY, AND THAT LEAKED ─────────────
 * pickRoadsideTrader mints `roadside_<demeanor>_<Date.now()>` — a fresh id on
 * EVERY spawn — while the trader's name and description come from a fixed
 * archetype. One authored character, split into unbounded one-encounter
 * strangers. Two consequences, both introduced by OTA-1049/1073:
 *   - roadside recognition could never fire for the population it was written
 *     for; the relation was new every single time.
 *   - since OTA-1049 sights every vendor, each spawn appended a PERMANENT row
 *     to npcsMet AND npcRelations. Neither is capped, both persist. A long save
 *     accrued hundreds of dead rows and the Chronicle filled with strangers.
 *
 * ── (2) `wronged` WAS A LIFE SENTENCE ─────────────────────────────────────
 * OTA-1049 made it permanent and I flagged it as the owner's call. Permanent is
 * wrong: it turns one failed DEX roll into a stall that can never be used
 * properly again, in a game whose steal system exists to be attempted. Cheap
 * forgiveness is worse. Amends are paid in custom, at their price.
 *
 * ── (3) PRICES DID NOT MOVE ON THE RELATIONSHIP ───────────────────────────
 * Promised in the Phase 1 delta, never built. Small on purpose: standing, CHA,
 * tides and war heat already move prices, and a relationship that swung harder
 * than all of them would be the only lever worth pulling.
 */
import {
  rememberNpcMeeting,
  recordNpcSighting,
  recordNpcDealing,
  pruneSpawnKeyedRelations,
  getRelation,
  npcRegard,
  regardPriceMult,
  AMENDS_TC_PER_WRONG,
} from '../app/engine/npcMemory';
import { recordNpcMet, emptyMemory } from '../app/engine/worldMemory';
import { finalBuyPrice, strangerBuyPrice } from '../app/engine/vendorPricing';
import type { WorldMemory, NpcMet, NpcRelation } from '../app/engine/types';

/** The store's ledger-identity rule, mirrored (gameStore.vendorNpcId). */
const ledgerId = (v: { id?: string; name: string }): string => {
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const id = v.id ?? '';
  if (id.startsWith('roadside_')) return `roadside:${slug(v.name)}`;
  return id || `vendor:${slug(v.name)}`;
};

/** A roadside trader as pickRoadsideTrader actually mints it: same archetype,
 *  a brand-new timestamped id every spawn. */
const roadsideSpawn = (ms: number) => ({ id: `roadside_sketchy_${ms}`, name: 'Grit', title: 'fence' });

describe('OTA-1053 — one archetype is one person', () => {
  it('THE LEAK: two spawns of the same trader share a ledger id', () => {
    expect(ledgerId(roadsideSpawn(1_700_000_000_000)))
      .toBe(ledgerId(roadsideSpawn(1_700_000_999_999)));
  });

  it('so meeting the fence three times actually makes them know you', () => {
    let m = emptyMemory();
    for (const ms of [1_700_000_000_000, 1_700_000_500_000, 1_700_000_900_000]) {
      const spawn = roadsideSpawn(ms);
      m = rememberNpcMeeting(m, { id: ledgerId(spawn), name: spawn.name, role: spawn.title },
        { nowMs: ms, hoursElapsed: 0 });
    }
    const rel = getRelation(m, 'roadside:grit')!;
    expect(rel.meetings).toBe(3);
    expect(npcRegard(rel)).toBe('known');
  });

  it('and the ledger stops growing without bound', () => {
    let m = emptyMemory();
    for (let i = 0; i < 40; i++) {
      const spawn = roadsideSpawn(1_700_000_000_000 + i * 1000);
      m = rememberNpcMeeting(m, { id: ledgerId(spawn), name: spawn.name, role: spawn.title },
        { nowMs: i, hoursElapsed: i });
    }
    expect(Object.keys(m.npcRelations ?? {})).toHaveLength(1);
    expect(m.npcsMet ?? []).toHaveLength(1);
  });

  it('named and stall vendors keep their authored ids untouched', () => {
    expect(ledgerId({ id: 'vendor_irma', name: 'Irma' })).toBe('vendor_irma');
    expect(ledgerId({ id: 'hidden_market_weapons', name: 'Broker' })).toBe('hidden_market_weapons');
    // Only the name-slug fallback for a vendor with no id at all.
    expect(ledgerId({ name: 'Nameless Hawker' })).toBe('vendor:nameless_hawker');
  });

  it('two different roadside ARCHETYPES stay two different people', () => {
    expect(ledgerId({ id: 'roadside_sketchy_1', name: 'Grit' }))
      .not.toBe(ledgerId({ id: 'roadside_honest_1', name: 'Maro' }));
  });
});

describe('OTA-1053 — the rows already leaked into live saves are swept up', () => {
  const stale = (ms: number): NpcRelation => ({
    id: `roadside_sketchy_${ms}`, name: 'Grit', firstMetAt: ms, lastSeenAt: ms,
    lastSeenHours: 0, meetings: 1, trades: 0, tcTraded: 0,
    contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0,
  });

  it('drops spawn-keyed rows from BOTH stores', () => {
    const m: WorldMemory = {
      ...emptyMemory(),
      npcRelations: {
        'roadside_sketchy_1700000000000': stale(1_700_000_000_000),
        'roadside_sketchy_1700000111111': stale(1_700_000_111_111),
        vendor_irma: { ...stale(1), id: 'vendor_irma', name: 'Irma' },
      },
      npcsMet: [
        { id: 'roadside_sketchy_1700000000000', name: 'Grit' },
        { id: 'vendor_irma', name: 'Irma' },
      ],
    };
    const cleaned = pruneSpawnKeyedRelations(m);
    expect(Object.keys(cleaned.npcRelations ?? {})).toEqual(['vendor_irma']);
    expect((cleaned.npcsMet ?? []).map((n) => n.id)).toEqual(['vendor_irma']);
  });

  it('leaves the NEW roadside key alone — it is a real person', () => {
    const m: WorldMemory = {
      ...emptyMemory(),
      npcRelations: { 'roadside:grit': { ...stale(1), id: 'roadside:grit' } },
    };
    expect(Object.keys(pruneSpawnKeyedRelations(m).npcRelations ?? {})).toEqual(['roadside:grit']);
  });

  it('is a no-op — same object back — when there is nothing to clean', () => {
    const m = rememberNpcMeeting(emptyMemory(), { id: 'vendor_irma', name: 'Irma' }, { nowMs: 1, hoursElapsed: 0 });
    expect(pruneSpawnKeyedRelations(m)).toBe(m);
  });
});

describe('OTA-1053 — a caught theft can be paid off', () => {
  const IRMA: NpcMet = { id: 'v_irma', name: 'Irma' };
  const wronged = () => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 0 });
    return recordNpcDealing(m, IRMA.id, { wrongs: 1 });
  };
  const rel = (m: WorldMemory) => getRelation(m, IRMA.id)!;

  it('a little custom does not buy forgiveness', () => {
    const m = recordNpcDealing(wronged(), IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG - 1 });
    expect(rel(m).wrongs).toBe(1);
    expect(npcRegard(rel(m))).toBe('wronged');
  });

  it('real money, at their price, settles it', () => {
    const m = recordNpcDealing(wronged(), IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG });
    expect(rel(m).wrongs).toBe(0);
    expect(npcRegard(rel(m))).not.toBe('wronged');
    expect(rel(m).amendsCleared).toBe(1);   // the Chronicle can still say it happened
  });

  it('amends accumulate across visits rather than needing one big purchase', () => {
    let m = wronged();
    for (let i = 0; i < 6; i++) m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG / 6 });
    expect(rel(m).wrongs).toBe(0);
  });

  it('a SECOND theft doubles the bill — a repeat thief digs faster than they fill', () => {
    let m = recordNpcDealing(wronged(), IRMA.id, { wrongs: 1 }); // two outstanding
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG });
    expect(rel(m).wrongs).toBe(2); // 600 does not touch a 1200 debt
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG });
    expect(rel(m).wrongs).toBe(1); // 1200 banked clears one, at the higher rate
  });

  it('custom from BEFORE the theft cannot be back-dated into amends', () => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 0 });
    m = recordNpcDealing(m, IRMA.id, { trades: 9, tcTraded: 50_000 }); // a long, honest history
    m = recordNpcDealing(m, IRMA.id, { wrongs: 1 });                   // then you rob them
    expect(rel(m).wrongs).toBe(1);
    expect(npcRegard(rel(m))).toBe('wronged');
  });

  it('honest customers never accrue an amends bank at all', () => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 0 });
    m = recordNpcDealing(m, IRMA.id, { trades: 4, tcTraded: 9_000 });
    expect(rel(m).amendsTc).toBeUndefined();
  });
});

describe('OTA-1053 — the relationship reaches the counter', () => {
  const parts = (regardMult: number) => ({
    corruptionMult: 1, buyDiscount: 0, tideMult: 1, warBuyMult: 1, regardMult,
  });

  it('a regular pays less and a trusted friend pays least', () => {
    const stranger = finalBuyPrice(1000, parts(regardPriceMult('stranger')));
    const familiar = finalBuyPrice(1000, parts(regardPriceMult('familiar')));
    const trusted = finalBuyPrice(1000, parts(regardPriceMult('trusted')));
    expect(familiar).toBeLessThan(stranger);
    expect(trusted).toBeLessThan(familiar);
  });

  it('someone you robbed charges over the odds', () => {
    expect(finalBuyPrice(1000, parts(regardPriceMult('wronged'))))
      .toBeGreaterThan(finalBuyPrice(1000, parts(regardPriceMult('stranger'))));
  });

  it('the swing is small — it must not outrank standing, tides or war heat', () => {
    for (const r of ['stranger', 'met', 'known', 'familiar', 'trusted'] as const) {
      expect(regardPriceMult(r)).toBeGreaterThanOrEqual(0.9);
      expect(regardPriceMult(r)).toBeLessThanOrEqual(1);
    }
    expect(regardPriceMult('wronged')).toBeLessThanOrEqual(1.25);
  });

  it('being merely known changes nothing — the discount is for real custom', () => {
    expect(regardPriceMult('known')).toBe(1);
    expect(regardPriceMult('met')).toBe(1);
  });

  it('strangerBuyPrice ignores regard, so "you saved N" counts the relationship', () => {
    const p = parts(regardPriceMult('trusted'));
    expect(strangerBuyPrice(1000, p)).toBeGreaterThan(finalBuyPrice(1000, p));
  });

  it('an absent regardMult leaves every existing caller byte-identical', () => {
    const legacy = { corruptionMult: 1.2, buyDiscount: 0.1, tideMult: 1.05, warBuyMult: 1.08 };
    expect(finalBuyPrice(500, legacy)).toBe(finalBuyPrice(500, { ...legacy, regardMult: 1 }));
  });

  it('the price can never fall below 1 TC', () => {
    expect(finalBuyPrice(1, parts(regardPriceMult('trusted')))).toBeGreaterThanOrEqual(1);
  });
});
