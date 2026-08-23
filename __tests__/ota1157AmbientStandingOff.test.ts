// OTA-1157 — THE WORLD DOES NOT MOVE YOUR STANDING.
//
// Owner, 2026-08-07, deciding the first of the four design calls OTA-1156 held:
//   "why are we doing ambient standing raises when we have multiple ways to gain
//    standing. you should work to get standing, not earn it by breathing."
//
// The world pulse had exactly two `repDelta` events, `defector` (+2) and
// `windfall` (+1). Both were POSITIVE and both were gated on `favored` (≥ 10) —
// which is simultaneously the eligibility test AND the target pool, so it fed
// whoever was already ahead, starting from a home faction that character creation
// seeds AT 10. Nothing in the pool ever moved standing down, so the needle only
// went one way, on a clock the player never touches, identically on every save.
//
// These assertions are the inverse of the hold that OTA-1156 wrote. That one
// asserted the two grants were UNCHANGED while the owner decided; this one
// asserts they are GONE now that he has. Deciding a held item inverts its lock,
// it does not remove it.

import * as fs from 'fs';
import * as path from 'path';
import { blockAt } from '../test-utils/srcBlock';

const read = (...p: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

const WORLD_EVENTS = read('app', 'engine', 'worldEvents.ts');

describe('OTA-1157 — no ambient event grants standing', () => {
  it('the catalogue contains ZERO repDelta effects', () => {
    // The whole point, in one line. Any `repDelta:` inside an event's `effect`
    // re-arms the ratchet, whatever it is spelled on.
    const grants = WORLD_EVENTS.match(/effect:\s*\{[^}]*repDelta/g) ?? [];
    expect(grants).toEqual([]);
    // And no build() may construct one under any other shape either.
    const anyDelta = WORLD_EVENTS.match(/repDelta:\s*\{/g) ?? [];
    expect(anyDelta).toEqual([]);
  });

  it('the two events that used to pay standing now pay a tide instead', () => {
    // Deleting the effect alone would have left the rumor making a standing claim
    // with nothing behind it — OTA-1156 finding 9, re-introduced on purpose. Both
    // events keep their slot and their weight; the effect became a real one.
    for (const kind of ['defector', 'windfall']) {
      const i = WORLD_EVENTS.indexOf(`kind: '${kind}', weight:`);
      expect(i).toBeGreaterThan(-1);
      const body = blockAt(WORLD_EVENTS, `kind: '${kind}', weight:`);
      expect(body).toContain('tideDelta');
      expect(body).not.toContain('repDelta');
    }
  });

  it('neither rumor claims the player gained standing any more', () => {
    // ⚠ Asserted on the `rumor:` LINES, not on the file — the comments above the
    // two events quote the old sentences on purpose, to record what was wrong with
    // them, and a whole-file match would trip on that explanation.
    const rumors = (WORLD_EVENTS.match(/rumor: `[^`]*`/g) ?? []).join('\n');
    expect(rumors.length).toBeGreaterThan(500);
    expect(rumors).not.toContain('count you a friend now');
    expect(rumors).not.toContain('remembered your name');
    // Nor may any rumor start making the claim in different words: no rumor in the
    // catalogue addresses the player's standing at all.
    expect(rumors).not.toMatch(/\bstanding\b/i);
  });

  it('the event pool is still the same size and the weights are untouched', () => {
    // ⚠ This is a REMOVAL of an effect, not of content. If the pool shrank, an
    // ambient slot was deleted rather than repurposed, and the draw distribution
    // for every other event silently changed with it.
    const kinds = WORLD_EVENTS.match(/kind: '[a-z]+', weight: (\d+)/g) ?? [];
    expect(kinds.length).toBe(16);
    const total = kinds.reduce((n, k) => n + Number(/weight: (\d+)/.exec(k)![1]), 0);
    expect(total).toBe(97);
  });

  it('the favored gate survives, because two other events still use it', () => {
    // `setback` and `bounty` are gated on `favored` too, and they post CONTRACTS —
    // an earned path. Removing the gate with the grants would have taken those
    // with it. The home faction starts at ≥ 10, so they stay eligible from minute
    // one, exactly as before.
    expect(WORLD_EVENTS).toContain('standingOf(ctx, f.id) >= 10');
    for (const kind of ['setback', 'bounty']) {
      const i = WORLD_EVENTS.indexOf(`kind: '${kind}', weight:`);
      expect(WORLD_EVENTS.slice(i, i + 400)).toContain('favored(ctx)');
    }
  });

  it('the store still HANDLES repDelta, for an authored beat that earns it', () => {
    // ⚠ The plumbing is deliberately kept. The rule is "the ambient tick may not
    // grant standing", not "nothing may" — quests, contracts, gifts, sigils and
    // forks all still do, and an authored world beat the player walks into could
    // legitimately want this path. Deleting the handler would make that a rewrite.
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toContain('if (ev.effect.repDelta) {');
    expect(store).toContain('logRepChanges(get, rep.changed)');
  });
});

describe('OTA-1157 — the attack gate is untouched', () => {
  // The owner's one worry: "they attack gate at rep standing, that's a big part of
  // the game." It is, and it is fed by the −half that EVERY earned grant sends to
  // the target's rivals — 4 points per median contract, against the 1 point per 39
  // in-game hours the ambient tick was contributing. None of that machinery is in
  // this change, and these assertions say so.
  it('the rival cascade still fires on every earned grant', () => {
    const factions = read('app', 'engine', 'factions.ts');
    expect(factions).toContain('const halfDelta = Math.trunc(delta / 2);');
    expect(factions).toContain('if (rivalIds.has(row.factionId) && halfDelta !== 0) return apply(row, -halfDelta);');
  });

  it('the hostile threshold and the hunt roll are unchanged', () => {
    const pressure = read('app', 'engine', 'pressure.ts');
    expect(pressure).toContain('export const HOSTILE_STANDING = -25;');
    expect(pressure).toContain('if (worst > HOSTILE_STANDING) return 0;');
    // and OTA-1156's per-faction fix is still in place
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toContain('hostileStanding ? [hostileStanding] : []');
  });

  it('the negative writers are all still wired', () => {
    const store = read('app', 'state', 'gameStore.ts');
    expect(store).toContain('PARLEY_EXTORT_REP');
    expect(store).toContain('dockHostileStanding');
    // theft: -10 to the vendor's faction and to the tile's native faction
    expect(store).toContain('applyRepChange(repStanding, vendorFaction, -10).standing');
  });
});
