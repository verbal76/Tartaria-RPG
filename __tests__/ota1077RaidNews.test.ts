/**
 * OTA-1077 — the offscreen war reaches the people who live in it.
 *
 * ⚠ CORRECTION TO MY OWN OTA-1076 NOTE. I recorded that "there is no offscreen
 * location-raid event in the game at all". That was wrong, and I should have
 * checked before writing it down. gameStore's world step has emitted
 * `outpost_assault` events since OTA-844/864/867 — a whole offscreen war sim
 * that raids outposts, culls patrols and shifts faction power and relations.
 *
 * What was actually missing is narrower: those events name only FACTIONS ("The
 * Reclaimers stormed the Forgotten Order outpost") and go only to the World
 * board. They are never joined to a LOCATION the player has walked, or to a
 * PERSON the player knows, and nobody ever says one out loud. The join was
 * already available — the assault knows its defender, FACTION_STARTING_LOCATION
 * maps faction to home ground, and every NpcRelation carries a factionId.
 *
 * So this OTA simulates nothing new. It keeps the same event as data, and lets
 * the people whose outpost burned mention it the next time you walk in.
 */
import {
  recordNpcSighting,
  recordNpcDealing,
  getRelation,
  raidNewsFor,
  raidNewsLine,
  npcRegard,
  RAID_MEMORY_CAP,
} from '../app/engine/npcMemory';
import { emptyMemory } from '../app/engine/worldMemory';
import type { WorldMemory, NpcMet, OutpostRaid } from '../app/engine/types';

const ORDER = 'forgotten_order';
const IRMA: NpcMet = { id: 'v_irma', name: 'Irma', role: 'armorer', factionId: ORDER };

const raid = (atHours: number, defenderId = ORDER, locationId = 'order_hold'): OutpostRaid => ({
  defenderId, defenderName: 'Forgotten Order',
  attackerId: 'reclaimers_guild', attackerName: 'Reclaimers Guild',
  locationId, atHours,
});

/** A relation at a chosen rung, seen at `lastHours` and then again `nowHours`
 *  later — i.e. prevSeenHours === lastHours, exactly as the store leaves it. */
const seenTwice = (lastHours: number, nowHours: number, dealings: Record<string, number> = { trades: 1 }) => {
  let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: lastHours });
  m = recordNpcDealing(m, IRMA.id, dealings);
  m = recordNpcSighting(m, IRMA, { nowMs: 2, hoursElapsed: nowHours });
  return m;
};
const withRaids = (m: WorldMemory, raids: OutpostRaid[]): WorldMemory => ({ ...m, recentRaids: raids });

describe('OTA-1077 — they tell you what happened while you were gone', () => {
  it('a raid on THEIR outpost since your last visit is news', () => {
    const m = withRaids(seenTwice(10, 100), [raid(50)]);
    const news = raidNewsFor(m, getRelation(m, IRMA.id), 100);
    expect(news).not.toBeNull();
    expect(news!.locationId).toBe('order_hold');
  });

  it('a raid that predates your last visit is NOT news — you were already told', () => {
    const m = withRaids(seenTwice(10, 100), [raid(5)]);
    expect(raidNewsFor(m, getRelation(m, IRMA.id), 100)).toBeNull();
  });

  it('a raid on somebody ELSE is not their news to bring', () => {
    const m = withRaids(seenTwice(10, 100), [raid(50, 'true_tartarians', 'giant_hold')]);
    expect(raidNewsFor(m, getRelation(m, IRMA.id), 100)).toBeNull();
  });

  it('the most recent qualifying raid wins, deterministically', () => {
    const m = withRaids(seenTwice(10, 100), [raid(20), raid(80, ORDER, 'order_watch'), raid(50)]);
    for (let i = 0; i < 50; i++) {
      expect(raidNewsFor(m, getRelation(m, IRMA.id), 100)!.locationId).toBe('order_watch');
    }
  });

  it('same-hour raids tie-break on location id rather than array order', () => {
    const a = withRaids(seenTwice(10, 100), [raid(60, ORDER, 'zzz_hold'), raid(60, ORDER, 'aaa_hold')]);
    const b = withRaids(seenTwice(10, 100), [raid(60, ORDER, 'aaa_hold'), raid(60, ORDER, 'zzz_hold')]);
    expect(raidNewsFor(a, getRelation(a, IRMA.id), 100)!.locationId)
      .toBe(raidNewsFor(b, getRelation(b, IRMA.id), 100)!.locationId);
  });
});

describe('OTA-1077 — who gets told, and who does not', () => {
  it('a stranger does not open with the state of the war', () => {
    // First meeting: prevSeenHours is undefined, so there is no "since" to
    // measure against and no relationship to confide across.
    const m = withRaids(recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 100 }), [raid(50)]);
    expect(raidNewsFor(m, getRelation(m, IRMA.id), 100)).toBeNull();
  });

  it('somebody who has merely seen you twice keeps it to themselves', () => {
    const m = withRaids(seenTwice(10, 100, {}), [raid(50)]);
    expect(npcRegard(getRelation(m, IRMA.id))).toBe('met');
    expect(raidNewsFor(m, getRelation(m, IRMA.id), 100)).toBeNull();
  });

  it('somebody who caught you stealing tells you nothing', () => {
    const m = withRaids(seenTwice(10, 100, { trades: 3, wrongs: 1 }), [raid(50)]);
    expect(npcRegard(getRelation(m, IRMA.id))).toBe('wronged');
    expect(raidNewsFor(m, getRelation(m, IRMA.id), 100)).toBeNull();
  });

  it('a factionless roadside trader has no outpost to lose', () => {
    const loner: NpcMet = { id: 'roadside:grit', name: 'Grit' };
    let m = recordNpcSighting(emptyMemory(), loner, { nowMs: 1, hoursElapsed: 10 });
    m = recordNpcDealing(m, loner.id, { trades: 3 });
    m = recordNpcSighting(m, loner, { nowMs: 2, hoursElapsed: 100 });
    expect(raidNewsFor(withRaids(m, [raid(50)]), getRelation(m, loner.id), 100)).toBeNull();
  });

  it('an empty world — no raids at all — is silent', () => {
    const m = seenTwice(10, 100);
    expect(raidNewsFor(m, getRelation(m, IRMA.id), 100)).toBeNull();
    expect(raidNewsFor(withRaids(m, []), getRelation(m, IRMA.id), 100)).toBeNull();
  });
});

describe('OTA-1077 — what they say', () => {
  const lineFor = (dealings: Record<string, number>) => {
    const m = withRaids(seenTwice(10, 100, dealings), [raid(50)]);
    const rel = getRelation(m, IRMA.id)!;
    return raidNewsLine(rel, raidNewsFor(m, rel, 100)!, 'Irma', 'Verbal of the Tartarian Giants');
  };

  it('every tier names the attacker and leaves no placeholder', () => {
    const tiers: Record<string, number>[] = [{ trades: 1 }, { trades: 3 }, { contractsTurnedIn: 2 }];
    for (const dealings of tiers) {
      const line = lineFor(dealings);
      expect(line).toContain('Reclaimers Guild');
      expect(line).toContain('Irma');
      expect(line).not.toContain('{');
    }
  });

  it('the closer tiers name the ground; the acquaintance tier just says "our outpost"', () => {
    // Deliberate: someone who merely places you does not walk you through which
    // holding was lost. It reads as a passing remark, which is what it is.
    expect(lineFor({ trades: 3 })).toContain('order hold');       // underscores humanised
    expect(lineFor({ contractsTurnedIn: 2 })).toContain('order hold');
    expect(lineFor({ trades: 1 })).toContain('our outpost');
    const all: Record<string, number>[] = [{ trades: 1 }, { trades: 3 }, { contractsTurnedIn: 2 }];
    for (const d of all) {
      expect(lineFor(d)).not.toContain('_');
    }
  });

  it('warms with the relationship — a regular hears more than an acquaintance', () => {
    const known = lineFor({ trades: 1 });
    const familiar = lineFor({ trades: 3 });
    const trusted = lineFor({ contractsTurnedIn: 2 });
    expect(new Set([known, familiar, trusted]).size).toBe(3);
  });

  it('only the closest tier uses the player by name', () => {
    // "You missed it, Verbal." — first token only, same rule as everywhere else.
    expect(lineFor({ contractsTurnedIn: 2 })).toContain('Verbal');
    expect(lineFor({ contractsTurnedIn: 2 })).not.toContain('Tartarian Giants');
  });

  it('is deterministic — same state, same sentence', () => {
    const first = lineFor({ trades: 3 });
    for (let i = 0; i < 100; i++) expect(lineFor({ trades: 3 })).toBe(first);
  });
});

describe('OTA-1077 — the record does not become a war diary', () => {
  it('the cap is small enough to keep the save honest', () => {
    expect(RAID_MEMORY_CAP).toBeLessThanOrEqual(20);
  });

  it('the store trims to the cap, keeping the NEWEST', () => {
    // Mirrors the world-step's `.slice(-RAID_MEMORY_CAP)`.
    const all = Array.from({ length: RAID_MEMORY_CAP + 8 }, (_, i) => raid(i));
    const kept = all.slice(-RAID_MEMORY_CAP);
    expect(kept).toHaveLength(RAID_MEMORY_CAP);
    expect(kept[kept.length - 1]!.atHours).toBe(all[all.length - 1]!.atHours);
  });

  it('a player away longer than the cap still hears the most recent one', () => {
    const old = Array.from({ length: RAID_MEMORY_CAP }, (_, i) => raid(200 + i));
    const m = withRaids(seenTwice(10, 500), old);
    expect(raidNewsFor(m, getRelation(m, IRMA.id), 500)!.atHours)
      .toBe(200 + RAID_MEMORY_CAP - 1);
  });
});
