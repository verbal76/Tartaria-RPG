/**
 * OTA-1050 — Phase 1, slice 2. The four things OTA-1049 deliberately left out:
 *
 *   1. TURN-IN CREDIT. Slice 1 counted contracts TAKEN but not FINISHED, so
 *      the one act that most deserves to be remembered — you came back and
 *      delivered — moved nobody's regard.
 *   2. ROADSIDE RECOGNITION. Slice 1 only re-greeted "anchor" NPCs, a proxy
 *      for "someone you come back to" that existed because the ledger didn't.
 *      Now the ledger says it directly.
 *   3. THE PEOPLE COLUMN. The Chronicle's NPC panel was a roll-call.
 *   4. GOSSIP. Word travelling inside a faction.
 */
import {
  recordNpcSighting,
  recordNpcDealing,
  npcRegard,
  knownPeople,
  dealingsSummary,
  REGARD_LABEL,
  gossipSubject,
  gossipLine,
  GOSSIP_EVERY,
} from '../app/engine/npcMemory';
import { emptyMemory } from '../app/engine/worldMemory';
import type { WorldMemory, NpcMet } from '../app/engine/types';

const ORDER = 'forgotten_order';
const IRMA: NpcMet = { id: 'v_irma', name: 'Irma', role: 'armorer', factionId: ORDER };
const YULKA: NpcMet = { id: 'v_yulka', name: 'Yulka', role: 'fixer', factionId: ORDER };
const OUTSIDER: NpcMet = { id: 'v_out', name: 'Kesh', role: 'hawker', factionId: 'reclaimers_guild' };

const see = (m: WorldMemory, npc: NpcMet, times = 1, hours = 0) => {
  let out = m;
  // OTA-1055 — one in-game hour per visit: a same-clock sighting is a re-render,
  // not a return, and no longer counts as a separate meeting.
  for (let i = 0; i < times; i++) out = recordNpcSighting(out, npc, { nowMs: 1 + i, hoursElapsed: hours + i });
  return out;
};
const rel = (m: WorldMemory, id: string) => (m.npcRelations ?? {})[id]!;

describe('OTA-1050 — finishing the work is what counts', () => {
  it('a contract TAKEN places you — ONCE YOU COME BACK; a contract FINISHED makes you a regular', () => {
    // ⚠⚠ AMENDED BY OTA-1451 ON THE OWNER'S REPORT, AND THE AMENDMENT IS THE
    // POINT. This rung used to open the instant a contract was signed, so a
    // shopkeeper met eighteen seconds earlier would start discussing their
    // people: *"it seems too easy to get to the later tiers of topics."*
    // Accepting is a promise, not a payment — the only rung on this ladder that
    // could be climbed by tapping.
    //
    // ⚠ WHAT OTA-1050 ASSERTED IS UNCHANGED. Taking work still PLACES you and
    // still outranks merely being seen around; it now waits for the return trip.
    let m = see(emptyMemory(), IRMA);
    m = recordNpcDealing(m, IRMA.id, { contractsTaken: 1 });
    expect(npcRegard(rel(m, IRMA.id))).toBe('met');       // same visit — not yet

    m = see(m, IRMA, 1, 1);                                // …and now you're back
    expect(npcRegard(rel(m, IRMA.id))).toBe('known');

    m = recordNpcDealing(m, IRMA.id, { contractsTurnedIn: 1 });
    expect(npcRegard(rel(m, IRMA.id))).toBe('familiar');
  });

  it('two finished contracts earn trust with no coin involved at all', () => {
    // Regard must be reachable by doing the work, not only by spending. A
    // player who never shops should still be able to become trusted.
    let m = see(emptyMemory(), IRMA);
    m = recordNpcDealing(m, IRMA.id, { contractsTurnedIn: 2 });
    expect(rel(m, IRMA.id).tcTraded).toBe(0);
    expect(npcRegard(rel(m, IRMA.id))).toBe('trusted');
  });
});

describe('OTA-1050 — the people column reports the relationship', () => {
  it('summarises what actually passed between you', () => {
    let m = see(emptyMemory(), IRMA);
    m = recordNpcDealing(m, IRMA.id, { trades: 2, tcTraded: 340, contractsTurnedIn: 1 });
    const line = dealingsSummary(rel(m, IRMA.id));
    expect(line).toContain('2 trades');
    expect(line).toContain('340 TC');
    expect(line).toContain('1 contract finished');
  });

  it('says nothing rather than inventing a history', () => {
    const m = see(emptyMemory(), IRMA);
    expect(dealingsSummary(rel(m, IRMA.id))).toBe('');
    expect(dealingsSummary(null)).toBe('');
  });

  it('singular and plural both read correctly', () => {
    let m = see(emptyMemory(), IRMA);
    m = recordNpcDealing(m, IRMA.id, { trades: 1, contractsTurnedIn: 1 });
    const one = dealingsSummary(rel(m, IRMA.id));
    expect(one).toContain('1 trade ');
    expect(one).not.toContain('1 trades');
    expect(one).toContain('1 contract finished');
    expect(one).not.toContain('1 contracts');
  });

  it('reports contracts TAKEN only while none are finished', () => {
    let m = see(emptyMemory(), IRMA);
    m = recordNpcDealing(m, IRMA.id, { contractsTaken: 3 });
    expect(dealingsSummary(rel(m, IRMA.id))).toContain('3 taken');
    m = recordNpcDealing(m, IRMA.id, { contractsTurnedIn: 1 });
    // Once you have finished one, "taken" is the less interesting fact.
    expect(dealingsSummary(rel(m, IRMA.id))).toContain('1 contract finished');
    expect(dealingsSummary(rel(m, IRMA.id))).not.toContain('3 taken');
  });

  it('a caught theft is stated plainly and not buried', () => {
    let m = see(emptyMemory(), IRMA);
    m = recordNpcDealing(m, IRMA.id, { trades: 9, tcTraded: 9999, wrongs: 1 });
    expect(dealingsSummary(rel(m, IRMA.id))).toContain('caught stealing');
  });

  it('orders people by how they regard you, worst first', () => {
    // The person who watches your hands is the one you most need to see.
    let m = see(emptyMemory(), IRMA, 1);
    m = see(m, YULKA, 1);
    m = see(m, OUTSIDER, 1);
    m = recordNpcDealing(m, IRMA.id, { wrongs: 1 });
    m = recordNpcDealing(m, YULKA.id, { contractsTurnedIn: 2 });
    const order = knownPeople(m).map((r) => r.name);
    expect(order[0]).toBe('Irma');   // wronged
    expect(order[1]).toBe('Yulka');  // trusted
    expect(order[2]).toBe('Kesh');   // met
  });

  it('leaves out people never actually met', () => {
    const m = emptyMemory();
    expect(knownPeople(m)).toEqual([]);
  });

  it('every rung has a player-facing label', () => {
    for (const k of ['stranger', 'met', 'known', 'familiar', 'trusted', 'wronged'] as const) {
      expect(REGARD_LABEL[k].length).toBeGreaterThan(0);
      // Labels are plain words on purpose — a number invites grinding.
      expect(REGARD_LABEL[k]).not.toMatch(/\d/);
    }
  });
});

describe('OTA-1050 — word travels, but rarely', () => {
  /** Two Order contacts, both regulars, and the speaker on their Nth visit. */
  const built = (speakerVisits: number): WorldMemory => {
    let m = see(emptyMemory(), IRMA, speakerVisits);
    m = recordNpcDealing(m, IRMA.id, { contractsTurnedIn: 1 });
    m = see(m, YULKA, 1);
    m = recordNpcDealing(m, YULKA.id, { contractsTurnedIn: 2 });
    return m;
  };

  it('fires on the cadence and stays silent between', () => {
    expect(gossipSubject(built(GOSSIP_EVERY), rel(built(GOSSIP_EVERY), IRMA.id))!.name).toBe('Yulka');
    for (const n of [1, 2, 3, 5, 6, 7]) {
      if (n % GOSSIP_EVERY === 0) continue;
      expect(gossipSubject(built(n), rel(built(n), IRMA.id))).toBeNull();
    }
  });

  it('is deterministic — same state, same answer, every read', () => {
    const m = built(GOSSIP_EVERY);
    const first = gossipSubject(m, rel(m, IRMA.id));
    for (let i = 0; i < 100; i++) {
      expect(gossipSubject(m, rel(m, IRMA.id))?.id).toBe(first?.id);
    }
  });

  it('strangers and casual acquaintances do not gossip', () => {
    // The speaker has to be someone who would actually talk to you.
    let m = see(emptyMemory(), IRMA, GOSSIP_EVERY);
    m = see(m, YULKA, 1);
    m = recordNpcDealing(m, YULKA.id, { contractsTurnedIn: 2 });
    expect(npcRegard(rel(m, IRMA.id))).toBe('known'); // not familiar
    expect(gossipSubject(m, rel(m, IRMA.id))).toBeNull();
  });

  it('nobody gossips about someone the player barely knows', () => {
    let m = see(emptyMemory(), IRMA, GOSSIP_EVERY);
    m = recordNpcDealing(m, IRMA.id, { contractsTurnedIn: 1 });
    m = see(m, YULKA, 1); // met, no dealings
    expect(gossipSubject(m, rel(m, IRMA.id))).toBeNull();
  });

  it('word does NOT cross faction lines', () => {
    let m = see(emptyMemory(), IRMA, GOSSIP_EVERY);
    m = recordNpcDealing(m, IRMA.id, { contractsTurnedIn: 1 });
    m = see(m, OUTSIDER, 1);
    m = recordNpcDealing(m, OUTSIDER.id, { contractsTurnedIn: 2 });
    expect(gossipSubject(m, rel(m, IRMA.id))).toBeNull();
  });

  it('nobody gossips about themselves', () => {
    let m = see(emptyMemory(), IRMA, GOSSIP_EVERY);
    m = recordNpcDealing(m, IRMA.id, { contractsTurnedIn: 2 });
    expect(gossipSubject(m, rel(m, IRMA.id))).toBeNull();
  });

  it('a factionless trader has no grapevine to carry it', () => {
    const loner: NpcMet = { id: 'v_loner', name: 'Grit', role: 'hawker' };
    let m = see(emptyMemory(), loner, GOSSIP_EVERY);
    m = recordNpcDealing(m, loner.id, { contractsTurnedIn: 2 });
    expect(gossipSubject(m, rel(m, loner.id))).toBeNull();
  });

  it('the line names both people and the player', () => {
    const m = built(GOSSIP_EVERY);
    const subject = gossipSubject(m, rel(m, IRMA.id))!;
    const line = gossipLine('Irma', subject, 'Verbal of the Tartarian Giants');
    expect(line).toContain('Irma');
    expect(line).toContain('Yulka');
    expect(line).toContain('Verbal');
    expect(line).not.toContain('Tartarian Giants'); // first token only
    expect(line).not.toContain('{');
  });
});
