// OTA-1188 — PUNCHLIST P3. The courier is back, for REPORTS only.
//
// OTA-456 shipped a remote "send word" hand-in; OTA-824 killed it on the owner's call:
// *"kill all remote hand-ins, make all routable, but make the journey worth the loot."*
// The P3 audit established two things that reopen it:
//   1. The anti-farming rationale it was later remembered for is not in ANY of the four
//      commits (OTA-456 / 810 / 824 / 900). The stated reason was make-travel-pay.
//   2. Farming cannot occur on this content regardless: all 115 contracts are one-shot,
//      and the only repeatable one — the faction bounty — already pays out on the killing
//      blow with no vendor and no trip back, and always did.
//
// ⚠ WHAT IT MAY NOT CARRY IS NOT ARBITRARY. Hunts stay face to face (OTA-810: "a bounty is
// paid face to face"), and fetch deliveries stay in person (OTA-456: "you can't mail the
// goods"). A runner carries a REPORT — exactly the line OTA-456 itself drew.

// ⚠ OTA-1400 — SLICE 9 sent contracts and the mission board into
// `app/state/slices/`. Re-pointed via `storeSource()`, which reads gameStore AND
// every slice — what a pin on THE STORE has meant since slice 4.
import { storeSource } from '../test-utils/storeSource';
import {
  courierPayoutTc,
  courierSentLine,
  contractPayoutTc,
  COURIER_PLAYER_SHARE,
  COURIER_DELAY_HOURS,
  BROKER_PLAYER_SHARE,
} from '../app/engine/contractBroker';
import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const STORE = storeSource();

describe('OTA-1188 — what the courier costs', () => {
  test('it pays 75% of base', () => {
    expect(courierPayoutTc(100)).toBe(75);
    expect(COURIER_PLAYER_SHARE).toBe(0.75);
  });

  test('⚠ it is worse than the broker, which is worse than going yourself', () => {
    // The ladder has to hold at every rung or the fallback becomes the default.
    const base = 200, bonus = 90;
    const inPerson = contractPayoutTc(base, bonus, null);
    const broker = contractPayoutTc(base, bonus, BROKER_PLAYER_SHARE);
    const courier = courierPayoutTc(base);
    expect(inPerson).toBeGreaterThan(broker);
    expect(broker).toBeGreaterThan(courier);
    expect(COURIER_PLAYER_SHARE).toBeLessThan(BROKER_PLAYER_SHARE);
  });

  test('⚠ no long-haul bonus can reach it — the signature does not even take one', () => {
    // The bonus pays for making the trip. A courier hand-in is the trip not being made.
    expect(courierPayoutTc.length).toBe(1);
  });

  test('a contract that paid something never couriers down to nothing', () => {
    expect(courierPayoutTc(1)).toBe(1);
  });

  test('a contract that paid nothing still pays nothing', () => {
    expect(courierPayoutTc(0)).toBe(0);
  });

  test('negatives cannot produce a negative payout', () => {
    expect(courierPayoutTc(-40)).toBe(0);
  });

  test('the line names the same cut and the same hours the code applies', () => {
    const line = courierSentLine('The Singing Stone', 75);
    expect(line).toContain('25%');
    expect(line).toContain(String(COURIER_DELAY_HOURS));
    expect(line).toContain('75');
  });
});

describe('⚠⚠ OTA-1188 — the hours are charged UP FRONT, not deferred', () => {
  test('both report handlers advance the clock at the moment of sending', () => {
    const calls = STORE.match(/advanceTime\(st\.player, CB\.COURIER_DELAY_HOURS\)/g) ?? [];
    expect(calls).toHaveLength(2);
  });

  test('⚠ and there is NO pending-payout queue anywhere', () => {
    // The audit proposed "12 hours before it credits". A deferred payout needs a persisted
    // queue, a maturing tick, a credit path and a migration — a new system whose failure
    // mode is a reward that never arrives. P1 and P2 were both filed for loops that end in
    // nothing; closing P3 by building a fourth one would be an own goal.
    expect(STORE).not.toMatch(/pendingCourier|courierQueue|pendingPayout/i);
  });
});

describe('⚠⚠ OTA-1188 — what it may and may not carry', () => {
  test('the dispatch routes courier phrasing instead of refusing it', () => {
    expect(STORE).toContain('const viaCourier = /\\b(send word|courier|send a runner)\\b/i.test(trimmed);');
    expect(STORE).not.toContain('"No couriers for this.');
  });

  test('all four handlers receive the flag, so none silently ignores it', () => {
    for (const call of [
      'get().turnInStoryline(target, viaCourier);',
      'get().turnInMystery(target, viaCourier);',
      'get().turnInHunt(target, viaCourier);',
      'get().turnInFactionQuest(target, viaCourier);',
    ]) expect(STORE).toContain(call);
  });

  test('⚠⚠ HUNTS still refuse a runner — OTA-810 is the owner’s explicit call', () => {
    const i = STORE.indexOf('turnInHunt(titleOrId');
    const body = STORE.slice(i, STORE.indexOf('const sourceLabel', i));
    expect(body).toContain('if (remote) {');
    expect(body).toMatch(/A trophy's no good sent by runner/);
  });

  test('⚠⚠ FETCH deliveries still refuse a runner — OTA-456/900', () => {
    expect(STORE).toContain('if (remote && candidate.fetch) {');
    expect(STORE).toMatch(/has to change hands in person/);
  });

  test('⚠ neither report handler still swallows its remote flag', () => {
    // Both were `_remote = false` — declared and never read, which is what made the whole
    // mechanism dead code and is how OTA-900's fetch hole survived undetected.
    expect(STORE).not.toContain('turnInMystery(titleOrId, _remote');
    expect(STORE).not.toContain('turnInStoryline(titleOrId, _remote');
    expect(STORE).toContain('const mystViaCourier = remote;');
    expect(STORE).toContain('const storyViaCourier = remote;');
  });
});

describe('⚠ OTA-1188 — a courier turn-in credits nobody', () => {
  test('the flag reaches creditTurnIn in both report handlers', () => {
    // OTA-1050's own comment names this hazard: a courier hand-in can happen while the
    // player stands at an unrelated stall, and crediting that stall is a lie the greeting
    // layer repeats for the rest of the save.
    expect(STORE).toContain('creditTurnIn(get, set, mystViaCourier);');
    expect(STORE).toContain('creditTurnIn(get, set, storyViaCourier);');
  });

  test('and creditTurnIn still short-circuits on a remote turn-in', () => {
    const i = STORE.indexOf('function creditTurnIn(');
    expect(STORE.slice(i, STORE.indexOf('\n}', i))).toContain('if (remote) return;');
  });
});

describe('⚠ OTA-1188 — no reward line claims a bonus the courier did not pay', () => {
  test('both announce lines are gated on the courier flag too', () => {
    expect(STORE).toContain('!mysteryViaBroker && !mystViaCourier && journeyTc > 0');
    expect(STORE).toContain('!storyViaBroker && !storyViaCourier && journeyTc > 0');
  });

  test('⚠ and the broker cut is never charged on top of the courier cut', () => {
    // Both are "somebody else carried it"; charging both would double-dip one hand-in.
    expect(STORE).toContain('const mysteryViaBroker = !mystViaCourier && CB.isContractBroker');
    expect(STORE).toContain('const storyViaBroker = !storyViaCourier && CB.isContractBroker');
  });
});
