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
  vendorLedgerId as ledgerId,
  dealingsSummary,
} from '../app/engine/npcMemory';
import { recordNpcMet, emptyMemory } from '../app/engine/worldMemory';
import { finalBuyPrice, strangerBuyPrice } from '../app/engine/vendorPricing';
import type { WorldMemory, NpcMet, NpcRelation } from '../app/engine/types';

// OTA-1055 — the REAL function, not a copy of it. This suite used to
// re-implement the rule and then test the re-implementation, so changing the
// production rule left every case green. The rule now lives in npcMemory (its
// proper home), which also keeps this suite free of the store's native deps.

/** A roadside trader as pickRoadsideTrader actually mints it: same archetype,
 *  a brand-new timestamped id every spawn. */
const roadsideSpawn = (ms: number) => ({ id: `roadside_sketchy_${ms}`, name: ROADSIDE_NAME, title: 'fence' });

// A name the real archetype table actually mints (app/data/npcs/roadside_traders.json),
// so the key under test is one production can generate — the original fixture
// used 'Grit', which no archetype produces.
// OTA-1055 — a member of the real CAST. 'Road Hawker' is an archetype label,
// not a person, and `roadside:road_hawker` is now a LEGACY key the save-healing
// pass deletes on sight — see the OTA-1055 block at the bottom of this file.
const ROADSIDE_NAME = 'Grit Maalen';
const ROADSIDE_KEY = 'roadside:grit_maalen';

describe('OTA-1053 — one archetype is one person', () => {
  it('THE LEAK: two spawns of the same trader share a ledger id', () => {
    expect(ledgerId(roadsideSpawn(1_700_000_000_000)))
      .toBe(ledgerId(roadsideSpawn(1_700_000_999_999)));
  });

  it('so meeting the fence three times actually makes them know you', () => {
    let m = emptyMemory();
    const stamps = [1_700_000_000_000, 1_700_000_500_000, 1_700_000_900_000];
    for (const [i, ms] of stamps.entries()) {
      const spawn = roadsideSpawn(ms);
      m = rememberNpcMeeting(m, { id: ledgerId(spawn), name: spawn.name, role: spawn.title },
        // OTA-1055 — one in-game hour apart. Three spawns at a frozen clock are
        // ONE visit now, and three roadside encounters cannot share an hour.
        { nowMs: ms, hoursElapsed: i });
    }
    const rel = getRelation(m, ROADSIDE_KEY)!;
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
    // Hidden Market keeps its stall id AND gains the rep — see the OTA-1055
    // block below for why the bare stall id was wrong.
    expect(ledgerId({ id: 'hidden_market_weapons', name: 'Broker' })).toBe('hidden_market_weapons:broker');
    // Only the name-slug fallback for a vendor with no id at all.
    expect(ledgerId({ name: 'Nameless Hawker' })).toBe('vendor:nameless_hawker');
  });

  it('two different roadside ARCHETYPES stay two different people', () => {
    expect(ledgerId({ id: 'roadside_sketchy_1', name: 'Skiv' }))
      .not.toBe(ledgerId({ id: 'roadside_honest_1', name: 'Grit Maalen' }));
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
      npcRelations: { [ROADSIDE_KEY]: { ...stale(1), id: ROADSIDE_KEY } },
    };
    expect(Object.keys(pruneSpawnKeyedRelations(m).npcRelations ?? {})).toEqual([ROADSIDE_KEY]);
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
    const m = recordNpcDealing(wronged(), IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG - 1, spent: AMENDS_TC_PER_WRONG - 1 });
    expect(rel(m).wrongs).toBe(1);
    expect(npcRegard(rel(m))).toBe('wronged');
  });

  it('real money, at their price, settles it', () => {
    const m = recordNpcDealing(wronged(), IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG, spent: AMENDS_TC_PER_WRONG });
    expect(rel(m).wrongs).toBe(0);
    expect(npcRegard(rel(m))).not.toBe('wronged');
    expect(rel(m).amendsCleared).toBe(1);   // the Chronicle can still say it happened
  });

  it('amends accumulate across visits rather than needing one big purchase', () => {
    let m = wronged();
    for (let i = 0; i < 6; i++) m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG / 6, spent: AMENDS_TC_PER_WRONG / 6 });
    expect(rel(m).wrongs).toBe(0);
  });

  it('a SECOND theft doubles the bill — a repeat thief digs faster than they fill', () => {
    let m = recordNpcDealing(wronged(), IRMA.id, { wrongs: 1 }); // two outstanding
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG, spent: AMENDS_TC_PER_WRONG });
    expect(rel(m).wrongs).toBe(2); // 600 does not touch a 1200 debt
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG, spent: AMENDS_TC_PER_WRONG });
    expect(rel(m).wrongs).toBe(1); // 1200 banked clears one, at the higher rate
  });

  it('THE RESIDUE EXPLOIT: change from a settled debt does NOT pre-pay the next one', () => {
    // Shipped in OTA-1053 and caught by a test-quality audit. Settling a 600
    // debt with 1100 TC banked 500; robbing them again and spending 100 then
    // cleared it — a second theft costing 100 TC, the exact inverse of "a
    // repeat thief digs the hole faster than they can fill it". Every original
    // amends test spent an exact multiple of 600, so the residue never existed.
    let m = recordNpcDealing(wronged(), IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG + 500, spent: AMENDS_TC_PER_WRONG + 500 });
    expect(rel(m).wrongs).toBe(0);
    expect(rel(m).amendsTc).toBe(0);              // the bank is spent with the debt

    m = recordNpcDealing(m, IRMA.id, { wrongs: 1 });
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 100, spent: 100 });
    expect(rel(m).wrongs).toBe(1);                // 100 TC buys nothing
    expect(npcRegard(rel(m))).toBe('wronged');
  });

  it('SELLING to someone you robbed does not settle it — restitution must COST', () => {
    // The sell path passes tcTraded (business done) but no `spent`, because the
    // TC moves toward the PLAYER. Inferring amends from tcTraded meant you could
    // clear a debt by offloading loot on the person you stole from — settled AND
    // paid for the privilege. Found by an engine review, not by these tests.
    const m = recordNpcDealing(wronged(), IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG * 5 });
    expect(rel(m).wrongs).toBe(1);
    expect(npcRegard(rel(m))).toBe('wronged');
    expect(rel(m).amendsTc ?? 0).toBe(0);
  });

  it('a settled debt is REMEMBERED, not erased', () => {
    // amendsCleared was write-only: types.ts documents it as existing so the
    // Chronicle can say a debt was settled, and nothing read it.
    let m = recordNpcDealing(wronged(), IRMA.id, { trades: 1, tcTraded: AMENDS_TC_PER_WRONG, spent: AMENDS_TC_PER_WRONG });
    expect(dealingsSummary(rel(m))).toContain('a debt settled');
  });

  it('custom from BEFORE the theft cannot be back-dated into amends', () => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 0 });
    m = recordNpcDealing(m, IRMA.id, { trades: 9, tcTraded: 50_000, spent: 50_000 }); // a long, honest history
    m = recordNpcDealing(m, IRMA.id, { wrongs: 1 });                   // then you rob them
    expect(rel(m).wrongs).toBe(1);
    expect(npcRegard(rel(m))).toBe('wronged');
  });

  it('honest customers never accrue an amends bank at all', () => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 0 });
    m = recordNpcDealing(m, IRMA.id, { trades: 4, tcTraded: 9_000, spent: 9_000 });
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

describe('OTA-1055 — a Hidden Market stall is SIX people, not one', () => {
  // resolveStallIdentity keeps a FIXED id per stall while rotating the name,
  // title AND faction daily across six authored reps — the stall's own blurb
  // says "the faces here change with the day". The fixed id pooled all six into
  // one ledger row: today's rep inherited six people's history, and because
  // recordNpcSighting refreshes factionId from whoever is on shift, OTA-1054
  // raid news was attributed to the wrong faction.
  it('two reps behind the same stall are two different ledger entries', () => {
    expect(ledgerId({ id: 'hidden_market_weapons', name: 'Zorin Nightblade' }))
      .not.toBe(ledgerId({ id: 'hidden_market_weapons', name: 'Drakos' }));
  });

  it('the same rep is still the same person', () => {
    expect(ledgerId({ id: 'hidden_market_weapons', name: 'Zorin Nightblade' }))
      .toBe(ledgerId({ id: 'hidden_market_weapons', name: 'Zorin Nightblade' }));
  });

  it('one rep working two different stalls stays two relationships', () => {
    // Different counters, different dealings — the stall is part of who they
    // are to you.
    expect(ledgerId({ id: 'hidden_market_weapons', name: 'Cassia' }))
      .not.toBe(ledgerId({ id: 'hidden_market_armor', name: 'Cassia' }));
  });

  it('meeting six reps does not make any one of them a regular', () => {
    let m = emptyMemory();
    for (const name of ['Zorin Nightblade', 'Drakos', 'Cassia', 'Korr', 'Odar', 'Nalren']) {
      const id = ledgerId({ id: 'hidden_market_weapons', name });
      m = rememberNpcMeeting(m, { id, name }, { nowMs: 1, hoursElapsed: 0 });
    }
    expect(Object.keys(m.npcRelations ?? {})).toHaveLength(6);
    for (const r of Object.values(m.npcRelations ?? {})) expect(r.meetings).toBe(1);
  });
});

describe('OTA-1055 — a fresh betrayal costs you your restitution', () => {
  const IRMA: NpcMet = { id: 'v_irma', name: 'Irma', role: 'armorer' };
  const wronged = (n: number) => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 0 });
    for (let i = 0; i < n; i++) m = recordNpcDealing(m, IRMA.id, { wrongs: 1 });
    return m;
  };
  const relOf = (m: WorldMemory) => getRelation(m, IRMA.id)!;

  it('THE PARTIAL-CLEAR RESIDUE: a part payment does not survive the next theft', () => {
    // ⚠ My first residue fix zeroed the bank only on FULL settlement, so a
    // partial clear kept up to 600*outstanding-1 alive. Measured: 3 wrongs,
    // spend 2999 -> one cleared, 1199 banked; rob again; spend 601 -> the 4th
    // wrong's 1800 TC bill paid with 601 TC of new money.
    let m = wronged(3);
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 2999, spent: 2999 });
    expect(relOf(m).wrongs).toBe(2);
    m = recordNpcDealing(m, IRMA.id, { wrongs: 1 });        // rob them again
    expect(relOf(m).wrongs).toBe(3);
    expect(relOf(m).amendsTc ?? 0).toBe(0);                  // progress is gone
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 601, spent: 601 });
    expect(relOf(m).wrongs).toBe(3);                         // 601 buys nothing
  });

  it('a theft and a payment in the SAME patch cannot pay for itself', () => {
    let m = wronged(1);
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 600, spent: 600, wrongs: 1 });
    expect(relOf(m).wrongs).toBe(1);        // the old one cleared, the new one stands
    expect(relOf(m).amendsTc ?? 0).toBe(0); // and no change carried forward
  });

  it('honest part-payment still accumulates when you do not reoffend', () => {
    let m = wronged(1);
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 300, spent: 300 });
    expect(relOf(m).wrongs).toBe(1);
    expect(relOf(m).amendsTc).toBe(300);
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 300, spent: 300 });
    expect(relOf(m).wrongs).toBe(0);
  });
});

describe('OTA-1055 — saves written by 4.28.87/88 heal themselves', () => {
  const relRow = (over: Partial<NpcRelation>): NpcRelation => ({
    id: 'x', name: 'X', meetings: 2, firstMetAt: 1, lastSeenAt: 1, lastSeenHours: 0,
    trades: 0, tcTraded: 0, contractsTaken: 0, contractsTurnedIn: 0, wrongs: 0, ...over,
  } as NpcRelation);

  it('THE LEGACY BANK: a sale-fed amends bank with no debt is dropped', () => {
    // 4.28.87 fed the bank from tcTraded, which counts SALES. A live save can
    // hold wrongs:0 / amendsTc:49400 — rob them twice, buy a 1 TC trinket, and
    // both wrongs evaporate.
    const m: WorldMemory = { ...emptyMemory(), npcRelations: {
      v: relRow({ id: 'v', wrongs: 0, amendsTc: 49_400 }) } };
    const healed = pruneSpawnKeyedRelations(m);
    expect(healed.npcRelations!.v!.amendsTc).toBe(0);
  });

  it('...and a bank bigger than the debt it faces is clamped', () => {
    const m: WorldMemory = { ...emptyMemory(), npcRelations: {
      v: relRow({ id: 'v', wrongs: 1, amendsTc: 5_000 }) } };
    expect(pruneSpawnKeyedRelations(m).npcRelations!.v!.amendsTc).toBe(0);
  });

  it('a legitimate part-payment is left alone', () => {
    const m: WorldMemory = { ...emptyMemory(), npcRelations: {
      v: relRow({ id: 'v', wrongs: 1, amendsTc: 300 }) } };
    expect(pruneSpawnKeyedRelations(m)).toBe(m); // untouched, same object
  });

  it('THE ARCHETYPE GHOSTS: the two unmintable roadside rows are swept out', () => {
    // 4.28.87/88 keyed every roadside trader by archetype. Nothing can mint
    // those ids again, so the rows sit in the Chronicle forever — and a `wrongs`
    // on one is a debt that can NEVER be paid, because amends need a dealing
    // against the same id.
    const m: WorldMemory = {
      ...emptyMemory(),
      npcRelations: {
        'roadside:road_hawker': relRow({ id: 'roadside:road_hawker', trades: 7, wrongs: 1 }),
        'roadside:sketchy_stall': relRow({ id: 'roadside:sketchy_stall' }),
        'roadside:grit_maalen': relRow({ id: 'roadside:grit_maalen' }),
      },
      npcsMet: [
        { id: 'roadside:road_hawker', name: 'Road Hawker' },
        { id: 'roadside:grit_maalen', name: 'Grit Maalen' },
      ],
    };
    const healed = pruneSpawnKeyedRelations(m);
    expect(Object.keys(healed.npcRelations ?? {})).toEqual(['roadside:grit_maalen']);
    expect((healed.npcsMet ?? []).map((n) => n.id)).toEqual(['roadside:grit_maalen']);
  });
});
