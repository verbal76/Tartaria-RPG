// OTA-1182 — THE CONTRACT REFUSAL STOPS BLAMING TRAVEL.
//
// The LAST of the four design calls OTA-1179 held. The vendor's empty-list line was:
//
//   "Nothing for you right now — check back after I've travelled."
//
// ⚠ There is no restock. `availableFactionQuests` filters a STATIC authored pool by
// rep and by what the player has already taken; travelling changes nothing, ever. So
// the line promised a mechanic that does not exist AND sent the player away to do the
// one thing that provably cannot help. Same defect class as OTA-1181's help text,
// except this one costs the player time rather than merely misinforming them.
//
// An empty list is always one of two situations, and they demand OPPOSITE actions:
//   LOCKED  — more work is here, standing is too low → go earn rep with these people
//   CLEARED — everything this faction offers is taken → go somewhere else
// Both facts were already computable at the call site. Now they are computed.
//
// ⚠ Numbers behind this, measured 2026-08-07: 38 of 65 faction quests carry a rep
// requirement, spread 5 → 25, and EIGHT of them sit at rep 25 — above the join
// threshold of 20. But every faction offers exactly 2 at rep 0, so no fresh player
// ever meets an empty board; the refusal only fires once the reachable ones are gone.
// An earlier session claimed "24 contracts behind rep 8-25" and that new players hit
// a wall. Both were wrong, and the correction is why this suite pins real counts.

import {
  availableFactionQuests, repLockedFactionQuests, FACTION_QUESTS,
} from '../app/engine/factionQuests';

import * as fs from 'fs';
import * as path from 'path';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const STORE = read('app', 'state', 'gameStore.ts');
const FACTIONS = [...new Set(FACTION_QUESTS.map((q) => q.factionId))];

describe('OTA-1182 — the refusal names the real reason', () => {
  it('the travel line is gone from the store', () => {
    expect(STORE).not.toContain("check back after I've travelled");
  });

  it('a locked refusal says standing, and an exhausted one says exhausted', () => {
    expect(STORE).toContain('repLockedFactionQuests(');
    // the two branches must be genuinely different text, or this fixed nothing
    expect(STORE).toMatch(/standing/i);
    expect(STORE).toContain('lockedHere.count > 0');
  });
});

describe('OTA-1182 — repLockedFactionQuests answers the question honestly', () => {
  it('counts only work the player could actually reach later', () => {
    for (const f of FACTIONS) {
      const locked = repLockedFactionQuests(f, 0, [], []);
      const open = availableFactionQuests(f, 0, [], []);
      const all = FACTION_QUESTS.filter(
        (q) => q.factionId === f && !/_stranded_/.test(q.id),
      );
      // ⚠ The two sets partition the board exactly: anything not offered now is
      // either rep-locked or already taken. If they ever stop summing, the refusal
      // has started lying again in the other direction.
      expect(open.length + locked.count).toBe(all.length);
    }
  });

  it('excludes hook-only contracts, which a board never posts', () => {
    // Naming one would send the player hunting something no vendor can give them.
    const stranded = FACTION_QUESTS.filter((q) => /_stranded_/.test(q.id));
    expect(stranded.length).toBeGreaterThan(0);
    for (const f of FACTIONS) {
      const locked = repLockedFactionQuests(f, -999, [], []);
      const all = FACTION_QUESTS.filter(
        (q) => q.factionId === f && !/_stranded_/.test(q.id),
      );
      expect(locked.count).toBe(all.length);
    }
  });

  it('nextRep is the CHEAPEST rung still out of reach, not the highest', () => {
    // The player needs the next step, not the summit — quoting 25 to somebody two
    // points off a rep-8 contract is the same unhelpfulness in a new costume.
    for (const f of FACTIONS) {
      const locked = repLockedFactionQuests(f, 0, [], []);
      if (locked.count === 0) { expect(locked.nextRep).toBeNull(); continue; }
      const reps = FACTION_QUESTS
        .filter((q) => q.factionId === f && !/_stranded_/.test(q.id) && q.requirement.rep > 0)
        .map((q) => q.requirement.rep);
      expect(locked.nextRep).toBe(Math.min(...reps));
      expect(locked.nextRep).toBeGreaterThan(0);
    }
  });

  it('goes to zero and nextRep null once a faction is truly cleared', () => {
    const f = FACTIONS[0]!;
    const all = FACTION_QUESTS
      .filter((q) => q.factionId === f && !/_stranded_/.test(q.id))
      .map((q) => q.id);
    const locked = repLockedFactionQuests(f, 0, [], all);
    expect(locked.count).toBe(0);
    expect(locked.nextRep).toBeNull();
    expect(availableFactionQuests(f, 0, [], all)).toEqual([]);
  });

  it('rising standing converts locked work into offered work', () => {
    // The claim the new refusal makes to the player, asserted as true.
    for (const f of FACTIONS) {
      const low = availableFactionQuests(f, 0, [], []).length;
      const high = availableFactionQuests(f, 25, [], []).length;
      expect(high).toBeGreaterThan(low);
      expect(repLockedFactionQuests(f, 25, [], []).count)
        .toBeLessThan(repLockedFactionQuests(f, 0, [], []).count);
    }
  });
});

describe('OTA-1182 — the shape of the gating, pinned', () => {
  it('no faction shows an empty board to a fresh arrival', () => {
    // ⚠ This is the fact an earlier session got wrong. If it ever stops being true,
    // the refusal becomes a NEW-PLAYER experience and the wording needs rethinking,
    // not just correcting.
    for (const f of FACTIONS) {
      expect(`${f}: ${availableFactionQuests(f, 0, [], []).length > 0}`).toBe(`${f}: true`);
    }
  });

  it('some work sits above the join threshold, which is deliberate', () => {
    const top = Math.max(...FACTION_QUESTS.map((q) => q.requirement.rep));
    expect(top).toBe(25);
    // JOIN_THRESHOLD is 20 — so a member still has somewhere to climb.
    const aboveJoin = FACTION_QUESTS.filter((q) => q.requirement.rep > 20).length;
    expect(aboveJoin).toBeGreaterThan(0);
  });
});
