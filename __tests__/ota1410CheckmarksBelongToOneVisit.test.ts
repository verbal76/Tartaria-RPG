/**
 * OTA-1410 — A NEW OUTPOST ARRIVED PRE-EXPLORED.
 *
 * Owner: *"whenever you leave an outpost all room visited ✓ should be erased.
 * and if you have never been to there it shouldn't have any. I went to a new
 * outpost it already had all rooms checkmarked."*
 *
 * ⚠⚠ THE CAUSE IS A COMMENT THAT STOPPED BEING TRUE AND NOBODY REREAD IT.
 * `worldMemory.hubVisited` stored BARE room ids, and its own type comment
 * explained why that was safe: *"hub rooms have stable string ids, not the
 * composite map key."* That held while every outpost had bespoke rooms. OTA-1279
 * made the outpost navigation graph UNIVERSAL — every outpost now has an
 * `outpost_gate`, a `buried_landing_one`, a `buried_storage`, a `buried_pumps` —
 * and "stable" quietly became "shared". Walking Asgardar ticked those rooms in
 * every outpost in the world.
 *
 * ⚠ The procedural map right beside it, `visitedRooms`, has carried `locationId`
 * in its key since OTA-140 for exactly this reason. One of the two was updated
 * when the ids changed meaning.
 *
 * ⚠ And the justification in that comment — fast-travel gating — does not exist.
 * Every reader of the field is a ✓: the outpost map's marks and the room chips'.
 * A global lifetime was being defended on behalf of a consumer that was never
 * built.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const STORE = read('app', 'state', 'gameStore.ts');
const TYPES = read('app', 'engine', 'types.ts');

/**
 * The shipped rule, mirrored: which rooms wear a ✓ after this step.
 * `fresh` is `freshOutpostVisit || hubVisitedFor !== location.id`.
 */
function step(
  wm: { hubVisited?: string[]; hubVisitedFor?: string },
  locationId: string,
  roomId: string,
  freshOutpostVisit: boolean,
): { hubVisited: string[]; hubVisitedFor: string } {
  const fresh = freshOutpostVisit || wm.hubVisitedFor !== locationId;
  const seen = new Set(fresh ? [] : (wm.hubVisited ?? []));
  seen.add(roomId);
  return { hubVisited: Array.from(seen), hubVisitedFor: locationId };
}

describe('OTA-1410 — the owner\'s exact sequence', () => {
  it('⚠⚠ walk Asgardar, then arrive somewhere new: the new place is BLANK', () => {
    // His 4.31.5 session, room for room.
    let wm = step({}, 'asgardar', 'outpost_gate', true);
    wm = step(wm, 'asgardar', 'buried_landing_one', false);
    wm = step(wm, 'asgardar', 'buried_landing_two', false);
    wm = step(wm, 'asgardar', 'buried_storage', false);
    wm = step(wm, 'asgardar', 'buried_pumps', false);
    expect(wm.hubVisited).toHaveLength(5);

    // …and then a different outpost, which shares every one of those room ids.
    const next = step(wm, 'samarran', 'outpost_gate', true);
    expect(next.hubVisited).toEqual(['outpost_gate']);
    expect(next.hubVisited).not.toContain('buried_landing_one');
    expect(next.hubVisitedFor).toBe('samarran');
  });

  it('⚠⚠ leave and come back to the SAME outpost — the marks are erased', () => {
    // The other half of what he asked for. The ✓ are per-VISIT.
    let wm = step({}, 'asgardar', 'outpost_gate', true);
    wm = step(wm, 'asgardar', 'buried_landing_one', false);
    wm = step(wm, 'asgardar', 'buried_storage', false);
    expect(wm.hubVisited).toHaveLength(3);

    const returned = step(wm, 'asgardar', 'outpost_gate', true);
    expect(returned.hubVisited).toEqual(['outpost_gate']);
  });

  it('⚠ …but walking room to room WITHIN one visit still accumulates', () => {
    // Erasing on every room would delete the feature rather than fix it: the
    // point of the ✓ is seeing where you have already been in here.
    let wm = step({}, 'asgardar', 'outpost_gate', true);
    wm = step(wm, 'asgardar', 'buried_landing_one', false);
    wm = step(wm, 'asgardar', 'buried_landing_two', false);
    expect(wm.hubVisited).toEqual(['outpost_gate', 'buried_landing_one', 'buried_landing_two']);
  });

  it('⚠ re-entering a room you already walked this visit does not duplicate it', () => {
    let wm = step({}, 'asgardar', 'buried_landing_two', true);
    wm = step(wm, 'asgardar', 'buried_storage', false);
    wm = step(wm, 'asgardar', 'buried_landing_two', false); // back west
    expect(wm.hubVisited).toEqual(['buried_landing_two', 'buried_storage']);
  });
});

describe('OTA-1410 — the second condition is the one that survives a crash', () => {
  it('⚠⚠ a set owned by another outpost is discarded even with no fresh-visit flag', () => {
    // If the game dies inside an outpost, the next boot resumes with the old set
    // and no arrival. The owner check alone still empties it, so the belt does
    // not depend on the braces.
    const stale = { hubVisited: ['outpost_gate', 'buried_pumps'], hubVisitedFor: 'asgardar' };
    const elsewhere = step(stale, 'iskan_veil', 'buried_pumps', false);
    expect(elsewhere.hubVisited).toEqual(['buried_pumps']);
  });

  it('⚠⚠ every save written before this OTA heals on the next outpost entry', () => {
    // Old saves carry a global set and no owner at all. `undefined !== locationId`
    // is true, so the first hub room the player walks into empties it — no
    // migration needed, and no player is left staring at a pre-ticked map.
    const old = { hubVisited: ['outpost_gate', 'buried_landing_one', 'buried_storage'] };
    const healed = step(old, 'asgardar', 'buried_landing_one', false);
    expect(healed.hubVisited).toEqual(['buried_landing_one']);
    expect(healed.hubVisitedFor).toBe('asgardar');
  });
});

describe('OTA-1410 — hung off the ONE door in, not the six doors out', () => {
  it('⚠⚠ the reset rides `freshOutpostVisit`, which is where a visit begins', () => {
    // Six places null `hubRoomId` on the way out of an outpost. Exactly one fills
    // it on the way in. Threading a wipe through the six is the many-doors
    // mistake this session has already paid for three times (the sprint gate, the
    // timing guard, the equip inference).
    expect(STORE).toContain(
      'const freshOutpostVisit = inHub && !hubRoomId && !opts?.skipHubEntry && !passingThrough;',
    );
    expect(STORE).toContain('const fresh = freshOutpostVisit || wm.hubVisitedFor !== location.id;');
    // The set is written with its owner, always — a set with no owner is the bug.
    expect(STORE).toContain('hubVisited: Array.from(seen), hubVisitedFor: location.id');
  });

  it('⚠ the old bare-id write is gone, not left beside the new one', () => {
    expect(STORE).not.toContain('const seen = new Set(s.worldMemory.hubVisited ?? []);');
  });

  it('⚠⚠ the comment that justified the global lifetime is corrected, not deleted', () => {
    // It cited a fast-travel consumer that does not exist and a uniqueness
    // property that OTA-1279 removed. Deleting it would hide why a correct-looking
    // field went wrong; the record is the point.
    expect(TYPES).toContain('OTA-1410 — RE-SCOPED');
    expect(TYPES).toContain('The fast-travel consumer does not exist');
    expect(TYPES).toContain('stopped meaning "unique" at OTA-1279');
    expect(TYPES).toContain('hubVisitedFor?: string;');
  });
});
