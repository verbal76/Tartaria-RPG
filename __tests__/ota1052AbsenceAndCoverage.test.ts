/**
 * OTA-1052 — two Phase 1 defects.
 *
 * ── (1) THE ABSENCE LINE WAS UNREACHABLE ──────────────────────────────────
 * `recordNpcSighting` overwrites `lastSeenHours` with the current clock the
 * moment the player walks in. The greeting is composed AFTER that write, so
 * `longAbsence` compared now against now and returned false every single time.
 * "It's been a long stretch — I'd started asking after you" could never appear
 * on device.
 *
 * ⚠ THE TESTS SHIPPED GREEN ANYWAY. ota1049NpcMemory.test.ts hand-built
 * relations in which `lastSeenHours` still held the PREVIOUS visit, so it was
 * asserting the rule while never once exercising the wiring. That is the third
 * distinct flavour of the "tests written from the implementation" problem in
 * this codebase — the first two guarded defects; this one guarded a contract
 * the store does not actually satisfy. Hence the store-level cases below: they
 * drive sighting-then-greet in the real order.
 *
 * The fix puts the answer in the DATA rather than in the call order:
 * `prevSeenHours` carries the previous visit's clock forward, so the greeting
 * can be composed before, after, or nowhere near the sighting and still be
 * right.
 *
 * ── (2) ONLY VENDORS WERE ON THE LEDGER ───────────────────────────────────
 * Of the three recordNpcMet sites, OTA-1049 paired only the vendor arrival with
 * a relation. Both Core Guardian sites recorded the milestone row and nothing
 * else, so a Guardian showed in the Chronicle's people column with a blank
 * where its regard should be. Fixed by making the pairing structural:
 * rememberNpcMeeting() is now the only way to record meeting somebody.
 */
import {
  rememberNpcMeeting,
  recordNpcSighting,
  recordNpcDealing,
  seedRelationsFromMet,
  getRelation,
  longAbsence,
  npcAbsenceLine,
  npcRegard,
  LONG_ABSENCE_HOURS,
} from '../app/engine/npcMemory';
import { recordNpcMet, emptyMemory } from '../app/engine/worldMemory';
import type { WorldMemory, NpcMet } from '../app/engine/types';

const IRMA: NpcMet = { id: 'v_irma', name: 'Irma', role: 'armorer', factionId: 'reclaimers_guild' };
const rel = (m: WorldMemory) => getRelation(m, IRMA.id);

/** What the store actually does: record the arrival, THEN compose the greeting
 *  from the relation as it stands after that write. */
const arriveThenGreet = (m: WorldMemory, hours: number) => {
  const after = recordNpcSighting(m, IRMA, { nowMs: hours * 3600_000, hoursElapsed: hours });
  return { memory: after, absent: longAbsence(getRelation(after, IRMA.id), hours) };
};

describe('OTA-1052 — the absence line in the order the store actually calls it', () => {
  it('THE BUG: a three-day gap is now seen — it never was before', () => {
    let m = arriveThenGreet(emptyMemory(), 0).memory;          // first meeting
    const back = arriveThenGreet(m, LONG_ABSENCE_HOURS + 1);   // three days later
    expect(back.absent).toBe(true);
  });

  it('...and the line the player could never see now lands', () => {
    // The gap alone is not enough: someone who has merely seen you twice has
    // no standing to say they missed you, so ABSENCE_LINES.met is null by
    // design. One piece of business is what buys the remark.
    let m = arriveThenGreet(emptyMemory(), 0).memory;
    m = recordNpcDealing(m, IRMA.id, { trades: 1, tcTraded: 30 });
    const back = arriveThenGreet(m, LONG_ABSENCE_HOURS + 1);
    const line = npcAbsenceLine(getRelation(back.memory, IRMA.id), 'Irma', 'Verbal', LONG_ABSENCE_HOURS + 1);
    expect(line).toBeTruthy();
    expect(line).not.toContain('{');
  });

  it('the fix lives in the DATA, not the call order', () => {
    // prevSeenHours holds the visit BEFORE this one, so lastSeenHours is free
    // to mean what it says. A future caller that reorders the greeting and the
    // sighting cannot reintroduce the bug.
    let m = recordNpcSighting(emptyMemory(), IRMA, { nowMs: 1, hoursElapsed: 4 });
    expect(rel(m)!.prevSeenHours).toBeUndefined();
    m = recordNpcSighting(m, IRMA, { nowMs: 2, hoursElapsed: 99 });
    expect(rel(m)!.prevSeenHours).toBe(4);
    expect(rel(m)!.lastSeenHours).toBe(99);
  });

  it('a walk round the block is still not an absence', () => {
    let m = arriveThenGreet(emptyMemory(), 0).memory;
    const back = arriveThenGreet(m, LONG_ABSENCE_HOURS - 1);
    expect(back.absent).toBe(false);
  });

  it('a FIRST meeting is never an absence', () => {
    // Nobody can have missed you before they met you. Getting this wrong would
    // greet a brand-new face with "I'd started asking after you".
    const first = arriveThenGreet(emptyMemory(), 5000);
    expect(first.absent).toBe(false);
    expect(npcAbsenceLine(getRelation(first.memory, IRMA.id), 'Irma', 'Verbal', 5000)).toBeNull();
  });

  it('back-to-back arrivals in the same room never trigger it', () => {
    // Re-entering a room re-runs the arrival. Two sightings at the same clock
    // must read as no gap at all.
    let m = arriveThenGreet(emptyMemory(), 40).memory;
    for (let i = 0; i < 5; i++) {
      const r = arriveThenGreet(m, 40);
      m = r.memory;
      expect(r.absent).toBe(false);
    }
  });

  it('a migrated pre-OTA-1049 save anchors on the hours it DID record', () => {
    // The old npcsMet row carries hoursElapsed at first meeting. That is real
    // information, so the first post-migration arrival can legitimately read as
    // an absence — but only against that recorded anchor, never against zero
    // for a character who has barely started.
    const met = { ...IRMA, hoursElapsed: 120 };
    const m = seedRelationsFromMet(recordNpcMet(emptyMemory(), met));
    expect(rel(m)!.prevSeenHours).toBeUndefined(); // nothing claimed yet
    expect(longAbsence(rel(m), 9999)).toBe(false);

    const soon = arriveThenGreet(m, 120 + 2);
    expect(soon.absent).toBe(false);              // two hours later — no gap

    const late = arriveThenGreet(m, 120 + LONG_ABSENCE_HOURS);
    expect(late.absent).toBe(true);               // three days later — a gap
  });

  it('a fresh character does not get an absence line from a zeroed migration', () => {
    // The degenerate case: a migrated row with no recorded hours, on a
    // character whose clock has barely moved. 0 vs 1 is not three days.
    const m = seedRelationsFromMet(recordNpcMet(emptyMemory(), IRMA));
    expect(arriveThenGreet(m, 1).absent).toBe(false);
  });
});

describe('OTA-1052 — everyone you meet is on the ledger', () => {
  const GUARDIAN: NpcMet = {
    id: 'guardian:zharaks_teeth', name: 'Iron Sentinel', role: 'Core Guardian',
    factionId: 'aether_born_order',
  };

  it('rememberNpcMeeting records BOTH stores, with their opposite rules intact', () => {
    let m = rememberNpcMeeting(emptyMemory(), GUARDIAN, { nowMs: 1, hoursElapsed: 0 });
    m = rememberNpcMeeting(m, GUARDIAN, { nowMs: 2, hoursElapsed: 1 });
    // npcsMet is a list of PEOPLE — meeting one twice does not make two.
    expect((m.npcsMet ?? []).filter((n) => n.id === GUARDIAN.id)).toHaveLength(1);
    // The relation is the opposite: repetition is the signal.
    expect(getRelation(m, GUARDIAN.id)!.meetings).toBe(2);
  });

  it('a Guardian now has a regard instead of a blank in the Chronicle', () => {
    const m = rememberNpcMeeting(emptyMemory(), GUARDIAN, { nowMs: 1, hoursElapsed: 0 });
    expect(getRelation(m, GUARDIAN.id)).not.toBeNull();
    expect(npcRegard(getRelation(m, GUARDIAN.id))).toBe('met');
  });

  it('the store has no unpaired recordNpcMet left — the gap cannot reopen', () => {
    // This is the point of the helper. Two calls at one site is a pattern the
    // next person to add an NPC will half-copy; one call cannot be half-copied.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src: string = require('fs').readFileSync(
      require('path').join(__dirname, '../app/state/gameStore.ts'),
      'utf8',
    );
    expect(src).not.toContain('recordNpcMet');
    expect(src).toContain('rememberNpcMeeting');
  });

  it('every NpcMet the store records goes through the paired helper', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src: string = require('fs').readFileSync(
      require('path').join(__dirname, '../app/state/gameStore.ts'),
      'utf8',
    );
    // OTA-1057 — FOUR now: sightVendor (all five vendor-install paths funnel
    // through it), the two Core Guardian spawns, and sightPerson, which carries
    // wanderers and escort leaders. The count is the point of the test — it is
    // what stops a sixth site being added without going through a helper.
    const calls = src.match(/rememberNpcMeeting\(/g) ?? [];
        // ⚠ ONE FEWER SITE since the Core Guardian's duplicate spawn path was removed:
    // the verb-gated summon inside submitPlayerAction is gone, so `summonCoreGuardian`
    // is the only place a Guardian is raised. The count dropping is the fix landing,
    // not coverage lost — a second copy is what this guard exists to prevent.
expect(calls.length).toBe(3);
  });
});
