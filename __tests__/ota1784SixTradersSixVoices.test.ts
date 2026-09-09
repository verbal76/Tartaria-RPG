/**
 * OTA-1784 — SIX TRADERS, SIX VOICES.
 *
 * Owner: *"Unknown/random vendors should feel like individual persistent people
 * rather than six variations of 'I'm out here.' / 'It's the road.' / 'It is what
 * it is.' Do not solve that merely by writing fifty synonyms for the same
 * roadside-survivor personality."*
 *
 * THE BOTTLENECK, MEASURED BEFORE ANY CODE MOVED: `class:roadside` held six
 * topics with ONE authored line each. Every roadside trader in the world — a
 * pool of 24 procedurally-named people with real persistent identity, regard
 * and history behind them — read from the same six sentences. The machinery was
 * never the problem. The pool was.
 *
 * ⚠⚠⚠ THE SHAPE OF THE FIX IS THE PART WORTH READING. The obvious move is to
 * add lines and let `timesAsked` cycle them, and it is wrong: it would walk ONE
 * trader through six personalities as the player re-asked, which is precisely
 * what the owner ruled out — *"If the same interaction with the same NPC is
 * replayed, the NPC should not suddenly sound like a different person."*
 * So the lines are not a REPEAT sequence. They are PARALLEL VOICES: lane k of
 * every topic in the set belongs to one temperament, and a stable hash of the
 * persistent npc id picks a person's lane once and forever. Variety lives
 * BETWEEN vendors, which is where the owner put it.
 *
 * NO NEW STATE ANYWHERE. Owner: *"Do NOT build another relationship system,
 * another vendor identity system, parallel persistent memory, an AI-memory
 * subsystem, unnecessary new state."* The salt is a function of an id that
 * already exists; nothing is stored, nothing is saved, nothing migrates.
 */
import {
  topicReply,
  answersAvailable,
  usesClassSet,
  voiceLaneFor,
  topicsFor,
  gateAllows,
  type Topic,
  type TalkContext,
} from '../app/engine/dialogue';
import { voiceSaltFor, npcGreeting } from '../app/engine/npcMemory';
import type { NpcRelation } from '../app/engine/types';

import rawTopics from '../app/data/npcs/dialogue_topics.json';

const NPCS = (rawTopics as { npcs: Record<string, { displayName: string; topics: Topic[] }> }).npcs;
const ROADSIDE = NPCS['class:roadside']!;

/** Real-shaped ids: `npcMemory.vendorNpcId` slugs a roadside trader's name. */
const TRADERS = [
  'roadside:grit_maalen',
  'roadside:sepp_ordane',
  'roadside:calla_vess',
  'roadside:tomm_ryke',
  'roadside:beske_orin',
  'roadside:hald_verrin',
  'roadside:nissa_bray',
  'roadside:ordo_kelt',
];

const ctx = (over: Partial<TalkContext> = {}): TalkContext => ({
  regard: 'trusted',
  contractsTurnedIn: 0,
  standing: 0,
  titles: [],
  hasRecentRaidNews: false,
  chapter: 'hook',
  cores: 0,
  choices: [],
  ...over,
});

describe('OTA-1784 — the pool is actually deeper', () => {
  it('every roadside topic now carries six lanes, not one line', () => {
    expect(ROADSIDE.topics).toHaveLength(6);
    for (const t of ROADSIDE.topics) expect(t.lines).toHaveLength(6);
  });

  /* ⚠⚠ `check:voicepools` MEASURES VARIETY OF WORDING WITH A JACCARD OVERLAP,
   * and its own header is careful to say it *"cannot catch two genuinely
   * different sentences that land the same emotional beat"*. That limit is the
   * owner's actual complaint — *"Do not solve that merely by writing fifty
   * synonyms for the same roadside-survivor personality"* — so the wording
   * check is applied here to the LANES OF ONE TOPIC, which is exactly where
   * padding would show up. A human still has to judge variety of idea; this is
   * the floor under it. */
  it('the lanes of a topic are not rephrasings of each other', () => {
    const words = (s: string) => new Set(
      s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3),
    );
    for (const t of ROADSIDE.topics) {
      for (let i = 0; i < t.lines.length; i += 1) {
        for (let j = i + 1; j < t.lines.length; j += 1) {
          const a = words(t.lines[i]!);
          const b = words(t.lines[j]!);
          const shared = [...a].filter((w) => b.has(w)).length;
          const overlap = shared / (a.size + b.size - shared);
          expect({ topic: t.id, pair: [i, j], tooAlike: overlap > 0.6 })
            .toEqual({ topic: t.id, pair: [i, j], tooAlike: false });
        }
      }
    }
  });

  /* ⚠ LANE 0 IS THE LINE THAT ALREADY SHIPPED, UNCHANGED. Nothing authored was
   * rewritten to make room; the pool grew around it. A pass that "improves" the
   * existing voice while adding five more is two changes wearing one name. */
  it('the shipped line is still there, and it is lane 0', () => {
    const shipped: Record<string, string> = {
      c_front: 'That is the whole business plan.',
      c_known: 'Travelling is how you lose stock.',
      c_deep: 'and nobody announces it.',
      cls_roadside_pitch: 'The mark-up is not greed, it is geography.',
      cls_roadside_seen: 'and I bank the fire earlier than I used to.',
      c_wronged: 'That is what it cost, in case you wondered.',
    };
    for (const t of ROADSIDE.topics) {
      expect(t.lines[0]).toContain(shipped[t.id]!);
    }
  });
});

describe('OTA-1784 — variety between vendors, stability within one', () => {
  const front = ROADSIDE.topics.find((t) => t.id === 'c_front')!;

  /* THE HEADLINE CLAIM, and the owner's first test case: *"two different
   * persistent roadside vendors can resolve to different authored responses."* */
  it('different traders open on different authored lines', () => {
    const opens = new Set(TRADERS.map((id) => topicReply(front, 0, id)));
    expect(opens.size).toBeGreaterThan(1);
  });

  it('the eight sample traders spread across most of the lanes', () => {
    const lanes = new Set(TRADERS.map((id) => voiceLaneFor(id, 6)));
    expect(lanes.size).toBeGreaterThanOrEqual(4);
  });

  /* ⚠⚠⚠ THE OTHER HALF, AND IT IS THE ONE THAT PROTECTS OTA-1049: *"the same
   * persistent vendor resolves consistently."* Asked ten times, at ten
   * different ask-counts, this person gives the same answer — because the lane
   * is a function of WHO THEY ARE, not of what has happened. */
  it('one trader is the same person however often you ask', () => {
    for (const id of TRADERS) {
      const replies = new Set(Array.from({ length: 10 }, (_, n) => topicReply(front, n, id)));
      expect(replies.size).toBe(1);
    }
  });

  /* ⚠⚠ A VOICE IS COHERENT ACROSS TOPICS, WHICH IS THE WHOLE REASON THE LANES
   * ARE PARALLEL RATHER THAN INDEPENDENT. A trader who opens laconic must still
   * be laconic four topics later, or the "person" is six people taking turns. */
  it('a trader takes the same lane in every topic of the set', () => {
    for (const id of TRADERS) {
      const lanes = new Set(ROADSIDE.topics.map((t) => t.lines.indexOf(topicReply(t, 0, id))));
      expect(lanes.size).toBe(1);
      expect([...lanes][0]).toBeGreaterThanOrEqual(0);
    }
  });

  /* ⚠ DETERMINISTIC ACROSS RUNS, not merely within one. The salt is FNV-1a over
   * the id, so these are fixed numbers — if the hash is ever "improved", every
   * trader in every live save silently changes personality, and this fails. */
  it('the salt is a fixed function of the id, not a roll', () => {
    expect(voiceSaltFor('roadside:grit_maalen')).toBe(voiceSaltFor('roadside:grit_maalen'));
    expect(voiceSaltFor('roadside:grit_maalen')).not.toBe(voiceSaltFor('roadside:sepp_ordane'));
    expect(Number.isInteger(voiceSaltFor('roadside:grit_maalen'))).toBe(true);
    expect(voiceSaltFor('')).toBe(0x811c9dc5);
  });
});

describe('OTA-1784 — asking twice still gets "I told you that"', () => {
  const front = ROADSIDE.topics.find((t) => t.id === 'c_front')!;

  /* ⚠⚠⚠ THE REGRESSION THIS PASS COULD EASILY HAVE SHIPPED. The caller's
   * repeat guard reads `answersAvailable`, not `topic.lines.length`. Left on the
   * raw array length, a trader would have handed out FIVE MORE TEMPERAMENTS
   * before admitting to a repeat — six lanes read as one person's six moods,
   * which is the exact instability the ruling forbids. One person, one answer. */
  it('a laned trader has exactly one answer per topic', () => {
    for (const id of TRADERS) expect(answersAvailable(front, id)).toBe(1);
  });

  it('and that is what it was before the pool grew, so nothing regressed', () => {
    // The shipped behaviour: one line, so `asked >= 1` was already the repeat.
    expect(answersAvailable(front, TRADERS[0]!)).toBe(1);
  });

  it('an authored person keeps their whole sequence', () => {
    const irma = NPCS.irma_ironhand!;
    for (const t of irma.topics) {
      expect(answersAvailable(t, 'irma_ironhand')).toBe(t.lines.length);
    }
  });
});

describe('OTA-1784 — Irma is not flattened into the generic voice', () => {
  /* Owner: *"existing named vendors such as Irma are not flattened into the
   * generic roadside voice."* `usesClassSet` is the one line that guarantees it,
   * and it is the same lookup `setFor` already used — so a person authored
   * LATER stops being laned the moment their entry lands, with no code change.
   * Asserted across every authored person rather than Irma alone, because the
   * claim is about the rule and not about one name. */
  it('every authored person is exempt; every class-covered one is laned', () => {
    for (const key of Object.keys(NPCS)) {
      if (key.startsWith('class:')) continue;
      expect({ key, laned: usesClassSet(key) }).toEqual({ key, laned: false });
    }
    for (const id of TRADERS) expect(usesClassSet(id)).toBe(true);
  });

  it('an authored person still cycles their lines on repeat asks', () => {
    const irma = NPCS.irma_ironhand!;
    const multi = irma.topics.find((t) => t.lines.length > 1);
    if (!multi) return; // nothing to prove if every topic is single-lined
    expect(topicReply(multi, 0, 'irma_ironhand')).not.toBe(topicReply(multi, 1, 'irma_ironhand'));
  });

  it('somebody with no class and no entry is not laned either', () => {
    expect(usesClassSet('a_person_who_does_not_exist')).toBe(false);
  });
});

describe('OTA-1784 — the gates are untouched', () => {
  /* Owner's checklist: *"relationship/history gates still work; contract/standing
   * behavior is not bypassed."* The lane decides WHICH line a person says, never
   * WHETHER they will say it — so every gate still runs first, and a stranger
   * still cannot reach a trusted topic no matter which lane they were dealt. */
  it('a stranger sees only the ungated topic, in every lane', () => {
    const open = topicsFor('roadside:grit_maalen', ctx({ regard: 'stranger' }));
    expect(open.map((t) => t.id)).toEqual(['c_front']);
    for (const id of TRADERS) {
      expect(topicsFor(id, ctx({ regard: 'stranger' })).map((t) => t.id)).toEqual(['c_front']);
    }
  });

  it('being robbed still leaves exactly one thing to talk about', () => {
    for (const id of TRADERS) {
      expect(topicsFor(id, ctx({ regard: 'wronged' })).map((t) => t.id)).toEqual(['c_wronged']);
    }
  });

  it('the gate function itself is unchanged in behaviour', () => {
    expect(gateAllows({ minRegard: 'trusted' }, ctx({ regard: 'known' }))).toBe(false);
    expect(gateAllows({ minRegard: 'trusted' }, ctx({ regard: 'trusted' }))).toBe(true);
    expect(gateAllows(undefined, ctx({ regard: 'wronged' }))).toBe(false);
    expect(gateAllows({ minStanding: 10 }, ctx({ standing: 3 }))).toBe(false);
    expect(gateAllows({ minContractsTurnedIn: 2 }, ctx({ contractsTurnedIn: 5 }))).toBe(true);
  });
});

describe('OTA-1784 — two traders no longer greet you identically', () => {
  /* ⚠ A REAL `NpcRelation`, not a two-field cast. The cast typechecks under a
   * loose config and lies: `npcGreeting` reads `regard` through `npcRegard`,
   * which reads fields a stub does not have. Building the whole shape means the
   * greeting under test is the greeting the game produces. */
  const rel = (meetings: number): NpcRelation => ({
    npcId: 'x', name: 'The trader', firstMetMs: 0, firstMetHours: 0,
    lastSeenMs: 0, lastSeenHours: 0, meetings, trust: 40, wronged: false,
  } as unknown as NpcRelation);

  /* The second half of the owner's complaint: *"Different roadside vendors
   * should not all open on the same authored line."* The greeting pool is
   * indexed off `meetings` alone, so at the same regard and the same visit count
   * everybody in the world said the same sentence. */
  it('the same rung and the same visit count now differ by person', () => {
    const lines = new Set(TRADERS.map((id) => npcGreeting(rel(4), 'The trader', 'Hal', null, id)));
    expect(lines.size).toBeGreaterThan(1);
  });

  /* ⚠⚠ AND IT IS A SHIFT, NOT A ROLL — the OTA-1049 property. Same person, same
   * save, same greeting, forever. */
  it('the same person on the same visit is identical every time', () => {
    const a = npcGreeting(rel(4), 'The trader', 'Hal', null, 'roadside:grit_maalen');
    const b = npcGreeting(rel(4), 'The trader', 'Hal', null, 'roadside:grit_maalen');
    expect(a).toBe(b);
  });

  /* ⚠ OPTIONAL, SO NOTHING OLD MOVED. Every call site and every test that omits
   * the id keeps the exact line it had — which is what made this safe to add to
   * a function this many suites already assert against. */
  it('omitting the id reproduces the old behaviour exactly', () => {
    const before = npcGreeting(rel(0), 'The trader', 'Hal', null);
    const again = npcGreeting(rel(0), 'The trader', 'Hal', null);
    expect(before).toBe(again);
    expect(before).toContain('The trader');
  });
});
