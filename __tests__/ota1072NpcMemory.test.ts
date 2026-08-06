/**
 * OTA-1072 — Phase 1, slice 1: NPCs remember you.
 *
 * THE GAP. `recordNpcMet` is idempotent on id — the second meeting with an NPC
 * returns the memory object unchanged. So the only question the game could
 * answer about a person was "have you ever been in a room with them", and the
 * only thing that varied a vendor's greeting was the player's standing with
 * their FACTION: a number shared with hundreds of strangers, which cannot tell
 * a shopkeeper whether you have ever bought anything from THEM. One of the
 * greeting lines read "the kind of nod that knows your name" and then did not
 * say the name.
 *
 * DETERMINISM IS THE FEATURE, not an implementation detail. The Arbiter names
 * the player on a ~60% per-line coin flip (arbiterAddress, OTA-635) and that
 * works because the Arbiter is one continuous voice. Applied per NPC it would
 * read as a fault: a shopkeeper who uses your name, then doesn't, then does,
 * has a head injury. Owner: "make it deterministic per NPC." So both axes are
 * pure functions of stored state — WHETHER they know your name, and WHICH
 * variant they greet you with.
 */
import {
  recordNpcSighting,
  recordNpcDealing,
  seedRelationsFromMet,
  getRelation,
  knowsPlayerName,
  npcRegard,
  npcAddress,
  npcGreeting,
  npcAbsenceLine,
  longAbsence,
  MEETINGS_FOR_NAME,
  TC_FOR_FAMILIAR,
  TC_FOR_TRUSTED,
  LONG_ABSENCE_HOURS,
} from '../app/engine/npcMemory';
import { recordNpcMet, emptyMemory } from '../app/engine/worldMemory';
import type { WorldMemory, NpcMet } from '../app/engine/types';

const IRMA: NpcMet = { id: 'vendor_irma', name: 'Irma', role: 'armorer', factionId: 'reclaimers_guild' };

/** OTA-1078 — the clock ADVANCES between visits. This helper used to stack
 *  every sighting on one `hoursElapsed`, which is not a thing the world can do:
 *  you cannot walk away and come back without time passing. recordNpcSighting
 *  now treats same-clock sightings as one visit (a re-render, a stall tab, a
 *  room re-entry), so a fixture that freezes the clock is asserting against a
 *  world that does not exist. One in-game hour per visit is the minimum honest
 *  spacing. */
const see = (m: WorldMemory, times = 1, hours = 0): WorldMemory => {
  let out = m;
  for (let i = 0; i < times; i++) {
    out = recordNpcSighting(out, IRMA, { nowMs: 1000 + i, hoursElapsed: hours + i });
  }
  return out;
};
const rel = (m: WorldMemory) => getRelation(m, IRMA.id);

describe('OTA-1072 — meeting someone twice is now different from meeting them once', () => {
  it('THE GAP: recordNpcMet still swallows the second meeting', () => {
    // Not a defect — the milestone list is a list of PEOPLE, and meeting
    // someone twice does not make two of them. But it is why the greeting
    // layer needed a second store.
    let m = emptyMemory();
    m = recordNpcMet(m, IRMA);
    m = recordNpcMet(m, { ...IRMA, name: 'Irma the Second' });
    expect(m.npcsMet).toHaveLength(1);
    expect(m.npcsMet![0]!.name).toBe('Irma');
  });

  it('the relation counts every arrival', () => {
    const m = see(emptyMemory(), 4);
    expect(rel(m)!.meetings).toBe(4);
  });

  it('carries first-met and last-seen separately', () => {
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 500, hoursElapsed: 3 });
    m = recordNpcSighting(m, IRMA, { nowMs: 9000, hoursElapsed: 91 });
    expect(rel(m)!.firstMetAt).toBe(500);
    expect(rel(m)!.lastSeenAt).toBe(9000);
    expect(rel(m)!.lastSeenHours).toBe(91);
  });
});

describe('OTA-1072 — the name is earned', () => {
  it('a stranger is not addressed by name', () => {
    expect(knowsPlayerName(null)).toBe(false);
    expect(npcAddress(null, 'Verbal')).toBe('traveler');
  });

  it('one sighting is not enough', () => {
    const m = see(emptyMemory());
    expect(knowsPlayerName(rel(m))).toBe(false);
    expect(npcAddress(rel(m), 'Verbal')).toBe('traveler');
  });

  it('enough repeat visits and your face is furniture', () => {
    const m = see(emptyMemory(), MEETINGS_FOR_NAME);
    expect(knowsPlayerName(rel(m))).toBe(true);
    expect(npcAddress(rel(m), 'Verbal')).toBe('Verbal');
  });

  it('ONE piece of business beats any number of silent visits', () => {
    let m = see(emptyMemory());
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 12 });
    expect(rel(m)!.meetings).toBe(1); // still only seen once
    expect(knowsPlayerName(rel(m))).toBe(true);
  });

  it('the person you stole from learns your name fastest', () => {
    let m = see(emptyMemory());
    m = recordNpcDealing(m, IRMA.id, { wrongs: 1 });
    expect(knowsPlayerName(rel(m))).toBe(true);
    // ...but they do not use it warmly.
    expect(npcRegard(rel(m))).toBe('wronged');
  });

  it('uses the first token so a long name does not wreck the line', () => {
    const m = see(emptyMemory(), MEETINGS_FOR_NAME);
    expect(npcAddress(rel(m), 'Verbal of the Tartarian Giants')).toBe('Verbal');
    // Same rule arbiterAddress follows, so the Arbiter and the world agree
    // about what the player is called.
  });

  it('falls back cleanly when the character has no name yet', () => {
    const m = see(emptyMemory(), MEETINGS_FOR_NAME);
    expect(npcAddress(rel(m), '')).toBe('traveler');
    expect(npcAddress(rel(m), '   ')).toBe('traveler');
  });
});

describe('OTA-1072 — DETERMINISTIC, which is the whole owner ask', () => {
  it('the same relation gives the same greeting every single time', () => {
    const m = see(emptyMemory(), 5);
    const first = npcGreeting(rel(m), 'Irma', 'Verbal');
    for (let i = 0; i < 200; i++) {
      expect(npcGreeting(rel(m), 'Irma', 'Verbal')).toBe(first);
    }
  });

  it('name use never flickers — 500 reads, one answer', () => {
    const m = see(emptyMemory(), 2); // below the threshold, no dealings
    const answers = new Set<boolean>();
    for (let i = 0; i < 500; i++) answers.add(knowsPlayerName(rel(m)));
    expect(answers.size).toBe(1);
    expect([...answers][0]).toBe(false);
  });

  it('but successive visits still READ differently — varied, not random', () => {
    // Determinism must not collapse into one sentence forever. The variant is
    // indexed off the meeting count, so visit 4 and visit 5 differ while each
    // is fixed.
    const lines = new Set<string>();
    for (let n = MEETINGS_FOR_NAME; n <= MEETINGS_FOR_NAME + 2; n++) {
      lines.add(npcGreeting(rel(see(emptyMemory(), n)), 'Irma', 'Verbal'));
    }
    expect(lines.size).toBeGreaterThan(1);
  });

  it('no greeting leaves a placeholder unsubstituted', () => {
    for (let n = 0; n <= 8; n++) {
      for (const extra of [{}, { trades: 5 }, { wrongs: 1 }, { contractsTurnedIn: 2 }]) {
        const m = recordNpcDealing(see(emptyMemory(), Math.max(1, n)), IRMA.id, extra);
        const line = npcGreeting(rel(m), 'Irma', 'Verbal');
        expect(line).not.toContain('{name}');
        expect(line).not.toContain('{npc}');
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('OTA-1072 — the regard ladder', () => {
  const withDealing = (patch: Record<string, number>, meets = 1) =>
    rel(recordNpcDealing(see(emptyMemory(), meets), IRMA.id, patch));

  it('never met is a stranger', () => {
    expect(npcRegard(null)).toBe('stranger');
    expect(npcRegard(rel(seedRelationsFromMet(emptyMemory())))).toBe('stranger');
  });

  it('seen once, no dealings — met, and that is all', () => {
    expect(npcRegard(rel(see(emptyMemory())))).toBe('met');
  });

  it('one trade places you', () => {
    expect(npcRegard(withDealing({ trades: 1 }))).toBe('known');
  });

  it('real custom makes you a regular', () => {
    expect(npcRegard(withDealing({ trades: 3 }))).toBe('familiar');
    expect(npcRegard(withDealing({ tcTraded: TC_FOR_FAMILIAR }))).toBe('familiar');
    expect(npcRegard(withDealing({ contractsTurnedIn: 1 }))).toBe('familiar');
  });

  it('finished work twice, or serious money, earns trust', () => {
    expect(npcRegard(withDealing({ contractsTurnedIn: 2 }))).toBe('trusted');
    expect(npcRegard(withDealing({ tcTraded: TC_FOR_TRUSTED }))).toBe('trusted');
  });

  it('a knife at the stall outranks any pile of receipts', () => {
    // The ordering that matters: you cannot buy your way back to friendly.
    const heavy = withDealing({ trades: 50, tcTraded: 99_999, contractsTurnedIn: 9, wrongs: 1 });
    expect(npcRegard(heavy)).toBe('wronged');
  });

  it('the ladder is monotone — more custom never lowers regard', () => {
    const rank = ['stranger', 'met', 'known', 'familiar', 'trusted'];
    let prev = -1;
    for (const tc of [0, 100, TC_FOR_FAMILIAR, TC_FOR_TRUSTED, 99_999]) {
      const idx = rank.indexOf(npcRegard(withDealing({ tcTraded: tc })));
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });
});

describe('OTA-1072 — absence', () => {
  it('a stranger cannot miss you', () => {
    expect(longAbsence(null, 9999)).toBe(false);
    expect(npcAbsenceLine(null, 'Irma', 'Verbal', 9999)).toBeNull();
  });

  it('a short trip away says nothing', () => {
    const m = see(emptyMemory(), 4, 10);
    expect(longAbsence(rel(m), 10 + LONG_ABSENCE_HOURS - 1)).toBe(false);
    expect(npcAbsenceLine(rel(m), 'Irma', 'Verbal', 10 + LONG_ABSENCE_HOURS - 1)).toBeNull();
  });

  it('three in-game days out and they say so', () => {
    // OTA-1078 — four visits (hours 10-13), then the return, recorded as a
    // sighting BEFORE the line is composed, which is the order the store uses.
    const back = 13 + LONG_ABSENCE_HOURS + 1;
    const m = recordNpcSighting(see(emptyMemory(), 4, 10), IRMA, { nowMs: 9_999, hoursElapsed: back });
    const line = npcAbsenceLine(rel(m), 'Irma', 'Verbal', back);
    expect(line).toBeTruthy();
    expect(line).not.toContain('{');
  });

  it('someone you robbed does not remark on missing you', () => {
    let m = see(emptyMemory(), 4, 10);
    m = recordNpcDealing(m, IRMA.id, { wrongs: 1 });
    expect(npcAbsenceLine(rel(m), 'Irma', 'Verbal', 10 + LONG_ABSENCE_HOURS * 5)).toBeNull();
  });
});

describe('OTA-1072 — dealings and legacy saves', () => {
  it('a dealing with someone never sighted is dropped, not invented', () => {
    // Inventing a relation here would paper over an upstream bug (a trade with
    // a vendor whose arrival was never recorded).
    const m = recordNpcDealing(emptyMemory(), 'vendor_nobody', { trades: 5 });
    expect(getRelation(m, 'vendor_nobody')).toBeNull();
  });

  it('dealings accumulate rather than overwrite', () => {
    let m = see(emptyMemory());
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 40 });
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 60 });
    expect(rel(m)!.trades).toBe(2);
    expect(rel(m)!.tcTraded).toBe(100);
  });

  it('a save written before this OTA is migrated, not reset', () => {
    // A player forty hours in must not be demoted to a stranger by an update.
    let old = emptyMemory();
    old = recordNpcMet(old, IRMA);
    expect(old.npcRelations).toBeUndefined();
    const migrated = seedRelationsFromMet(old);
    expect(getRelation(migrated, IRMA.id)!.meetings).toBe(1);
    expect(npcRegard(getRelation(migrated, IRMA.id))).toBe('met');
  });

  it('migration is idempotent and never clobbers live relations', () => {
    let m = see(emptyMemory(), 6);
    m = recordNpcDealing(m, IRMA.id, { trades: 4 });
    const again = seedRelationsFromMet(seedRelationsFromMet(m));
    expect(getRelation(again, IRMA.id)!.meetings).toBe(6);
    expect(getRelation(again, IRMA.id)!.trades).toBe(4);
  });

  it('recording is pure — the input memory is never mutated', () => {
    const before = see(emptyMemory(), 2);
    const snapshot = JSON.stringify(before);
    recordNpcSighting(before, IRMA, { nowMs: 5, hoursElapsed: 5 });
    recordNpcDealing(before, IRMA.id, { trades: 9 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
