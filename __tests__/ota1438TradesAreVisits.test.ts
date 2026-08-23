/**
 * OTA-1438 — A TRADE IS A VISIT, NOT A LINE ITEM.
 *
 * Owner: *"I think the advanced conversations unlock a little too quick. I use
 * the fuse crucible 3 times with Halem and it unlocks most of his conversation
 * tree."*
 *
 * ⚠⚠ HE IS RIGHT, AND THE ARITHMETIC IS BRUTAL. `trades >= 3` is the `familiar`
 * rung, and familiar is where two thirds of an NPC's topics live — Halem has 15,
 * of which 2 are ungated, 4 open at `known` and 4 more at `familiar`. Ten of
 * fifteen for three transactions.
 *
 * And `trades` was counting LINE ITEMS. The sell screen passes `social: i === 0`
 * so a stack of twenty is one trade — but three DIFFERENT items are three
 * separate calls, each one a fresh first unit. The owner's own device log has
 * fifteen sales to Bran the Beastmaster inside four hundred milliseconds: one
 * inventory dump, fifteen credited trades, a stranger promoted past `familiar`
 * without a second visit.
 *
 * ⚠ The buy path already knew this shape. Its comment says counting units "would
 * let a stack purchase vault a stranger to trusted in a single tap" — but the
 * guard it grew was per-stack, so it never covered the second item. This is that
 * same rule one level up, where it belonged.
 */
import { recordNpcDealing, npcRegard, rememberNpcMeeting } from '../app/engine/npcMemory';
import type { WorldMemory } from '../app/engine/types';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const VENDOR = read('app', 'state', 'slices', 'vendorSlice.ts');

const NPC = 'vendor:halem_trader';

function met(hours = 10): WorldMemory {
  const wm = { npcRelations: {} } as unknown as WorldMemory;
  return rememberNpcMeeting(wm, {
    id: NPC, name: 'Halem the Trader', role: 'vendor', hoursElapsed: hours, firstMetAt: 1,
  }, { nowMs: 1, hoursElapsed: hours });
}
const rel = (wm: WorldMemory) => wm.npcRelations?.[NPC];

describe('OTA-1438 — one visit, one trade', () => {
  it('⚠⚠ THE REPORTED BUG: three sales in one visit is ONE piece of business', () => {
    let wm = met(10);
    for (let i = 0; i < 3; i++) {
      wm = recordNpcDealing(wm, NPC, { trades: 1, tcTraded: 12, atHours: 10 });
    }
    expect(rel(wm)!.trades).toBe(1);
    // …and one trade is not a regular.
    expect(npcRegard(rel(wm))).not.toBe('familiar');
  });

  it('⚠⚠ the owner\'s actual log — FIFTEEN sales in 400ms — still counts once', () => {
    let wm = met(10);
    for (let i = 0; i < 15; i++) {
      wm = recordNpcDealing(wm, NPC, { trades: 1, tcTraded: 9, atHours: 10 });
    }
    expect(rel(wm)!.trades).toBe(1);
  });

  it('⚠⚠ but FOUR separate visits do earn the rung', () => {
    // The gate was never wrong about wanting repeat business — it was wrong
    // about what it counted. With honest counting the owner set the regular's
    // bar at four visits (OTA-1439): three knocks on the door is interest,
    // the fourth is a habit.
    let wm = met(10);
    wm = recordNpcDealing(wm, NPC, { trades: 1, tcTraded: 20, atHours: 10 });
    wm = recordNpcDealing(wm, NPC, { trades: 1, tcTraded: 20, atHours: 34 });
    wm = recordNpcDealing(wm, NPC, { trades: 1, tcTraded: 20, atHours: 51 });
    expect(npcRegard(rel(wm))).not.toBe('familiar');
    wm = recordNpcDealing(wm, NPC, { trades: 1, tcTraded: 20, atHours: 70 });
    expect(rel(wm)!.trades).toBe(4);
    expect(npcRegard(rel(wm))).toBe('familiar');
  });

  it('⚠ TC still accrues on every transaction — only the COUNT is deduped', () => {
    // tcTraded measures money, and the money really did move. Deduping it would
    // break the amends ledger and the TC-based rungs.
    let wm = met(10);
    for (let i = 0; i < 5; i++) {
      wm = recordNpcDealing(wm, NPC, { trades: 1, tcTraded: 100, atHours: 10 });
    }
    expect(rel(wm)!.trades).toBe(1);
    expect(rel(wm)!.tcTraded).toBe(500);
  });

  it('⚠⚠ an ABSENT stamp credits — old saves are not retro-demoted', () => {
    // Relations from before this OTA have no lastTradeHours. Crediting when the
    // stamp is missing is the safe direction: those players keep the standing
    // they earned and simply start counting visits from here.
    let wm = met(10);
    wm = recordNpcDealing(wm, NPC, { trades: 1, tcTraded: 5 });
    wm = recordNpcDealing(wm, NPC, { trades: 1, tcTraded: 5 });
    expect(rel(wm)!.trades).toBe(2);
  });

  it('⚠ contracts and wrongs are untouched — they are already once-per-thing', () => {
    let wm = met(10);
    wm = recordNpcDealing(wm, NPC, { contractsTurnedIn: 1, atHours: 10 });
    wm = recordNpcDealing(wm, NPC, { contractsTurnedIn: 1, atHours: 10 });
    expect(rel(wm)!.contractsTurnedIn).toBe(2);
  });

  it('⚠ a sale with social:false still adds nothing, as before', () => {
    let wm = met(10);
    wm = recordNpcDealing(wm, NPC, { trades: 0, tcTraded: 7, atHours: 10 });
    expect(rel(wm)!.trades).toBe(0);
    expect(rel(wm)!.tcTraded).toBe(7);
  });
});

describe('OTA-1438 — both money paths stamp the visit', () => {
  it('⚠⚠ BUYING passes the hour', () => {
    // Missing it on either side leaves half the leak open, which is exactly the
    // many-doors mistake: one door fixed, its sibling left standing.
    const i = VENDOR.indexOf('spent: totalCost,');
    expect(i).toBeGreaterThan(-1);
    expect(VENDOR.indexOf('atHours: s.player?.hoursElapsed ?? 0,', i)).toBeGreaterThan(i);
  });

  it('⚠⚠ SELLING passes the hour — the path that was actually leaking', () => {
    const i = VENDOR.indexOf("trades: opts?.social !== false ? 1 : 0,");
    expect(i).toBeGreaterThan(-1);
    expect(VENDOR.indexOf('atHours: s.player?.hoursElapsed ?? 0,', i)).toBeGreaterThan(i);
  });

  it('⚠ exactly two call sites credit a trade, and both are stamped', () => {
    expect((VENDOR.match(/atHours: s\.player\?\.hoursElapsed \?\? 0,/g) ?? []).length).toBe(2);
  });
});

describe('OTA-1438 — what familiar actually opens, measured', () => {
  it('⚠⚠ familiar is two thirds of Halem — which is why the rung matters', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const topics = require('../app/data/npcs/dialogue_topics.json').npcs.halem_trader.topics as
      { gate?: { minRegard?: string } }[];
    const atOrBelow = (r: string) => ['known', 'familiar'].indexOf(r) >= 0;
    const open = topics.filter((t) => {
      const g = t.gate?.minRegard;
      return !g || atOrBelow(g);
    }).length;
    expect(topics.length).toBe(15);
    // Ten of fifteen visible at familiar. The owner called it "most of his
    // conversation tree"; this is the number behind that sentence.
    expect(open).toBeGreaterThanOrEqual(9);
  });
});
