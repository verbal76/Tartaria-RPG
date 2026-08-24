/**
 * OTA-1474 — AN EMPTY BOARD SAYS WHY IT IS EMPTY, AND SAYS IT EVERY TIME.
 *
 * ⚠⚠⚠ THE OWNER, 4.32.11, at the Hidden Market armor stall. Twelve taps in nine
 * seconds, and this is the whole of what the game gave him:
 *
 *   00:14:05.959  Korash of the Deep shakes their head. "No bounties for you
 *                 right now."
 *   00:14:07.690  dedup: suppressed arbiter repeat — "Korash of the Deep …"
 *   00:14:09.673  dedup: suppressed arbiter repeat …
 *   …             ten more, through 00:14:14.943
 *
 * Then at 00:14:52 he typed:
 *
 *   "I couldn't accept the core ass mission from this vendor, but there was no
 *    pop-up telling me why. I'm imagining it's because either I've hit my cap of
 *    missions that I can have or I don't have enough standing but it doesn't say
 *    which. so either we need to have a pop-up or maybe like an angular set of
 *    writing like how they do, you know kind of faded, that says need standing
 *    or something like that"
 *
 * ⚠⚠ TWO DEFECTS, EACH WITH ITS OWN PRECEDENT ALREADY IN THIS CODEBASE.
 *
 *   1. OTA-1466 answered two of the three branches. It names a specific posting
 *      when he asks for one and lists what IS posted when he asks for something
 *      else — both of which need the board to have something on it. The EMPTY
 *      case fell through to a bare shrug, which is exactly the moment he has the
 *      least information and the most reason to keep tapping.
 *
 *   2. OTA-947 settled that "a refusal must ALWAYS answer" after eight identical
 *      salvage attempts drew one reply and seven suppressions. It fixed the site
 *      in front of it. This site never got the flag, and his log is the same
 *      shape: twelve taps, ONE line, eleven suppressions. From tap two onward
 *      the game answered him with nothing at all.
 *
 * ⚠ AND BOTH HIS GUESSES WERE WRONG, which is what a shrug actually costs.
 * There is no mission cap — an extra contract PARKS, it is never refused — and
 * standing is one of four reasons. He spent that guess because we made him.
 */
import {
  HUNTS, emptyBoardTally, emptyBoardLine, huntBlockReason, availableHunts,
  type EmptyBoardTally,
} from '../app/engine/hunts';
import { getFactions } from '../app/engine/character';
import { readFileSync } from 'fs';
import { between } from '../test-utils/srcBlock';
import { join } from 'path';

const read = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const QUEST = codeOnly(read('app', 'state', 'slices', 'questSlice.ts'));

const ALL_FACTIONS = getFactions().map((f) => f.id);
const NONE: string[] = [];
const zeroRep = () => 0;

describe('OTA-1474 — the tally is real, not decorative', () => {
  it('⚠⚠⚠ THE CATALOGUE IS LOADED — or every count below is a vacuous zero', () => {
    expect(HUNTS.length).toBeGreaterThan(10);
    expect(ALL_FACTIONS.length).toBe(9);
  });

  it('⚠⚠⚠ A BROKER AT ZERO STANDING — the board is empty AND the reason is countable', () => {
    // His case: a Hidden Market stall searches every faction's pool, he has
    // earned nothing anywhere, and nothing comes back. Before this OTA that
    // produced a shrug; the reasons existed the whole time.
    const offered = ALL_FACTIONS.flatMap((f) => availableHunts(f, 0, NONE, NONE, 20));
    const t = emptyBoardTally(ALL_FACTIONS, zeroRep, NONE, NONE, 20);
    const counted = t.standing + t.reach + t.active + t.completed;
    // whatever the pools do, the two must agree about how much is withheld
    expect(counted + new Set(offered.map((h) => h.id)).size).toBe(HUNTS.length);
  });

  it('⚠⚠⚠ EVERY HUNT IS COUNTED EXACTLY ONCE, and never twice', () => {
    for (const rep of [0, 10, 40, 100]) {
      const t = emptyBoardTally(ALL_FACTIONS, () => rep, NONE, NONE, 20);
      const offered = new Set(ALL_FACTIONS.flatMap((f) => availableHunts(f, rep, NONE, NONE, 20)).map((h) => h.id));
      const total = t.standing + t.reach + t.active + t.completed + offered.size;
      expect({ rep, total }).toEqual({ rep, total: HUNTS.length });
    }
  });

  it('⚠⚠⚠ A HUNT OPEN SOMEWHERE IS NOT WITHHELD — one definition of "offered"', () => {
    // A broker searches every pool. Counting a hunt as blocked because ONE
    // faction would not post it, while another would, is a second definition of
    // availability disagreeing with `availableHunts` — the exact drift OTA-1466
    // built `huntBoardIsConsistent` to prevent.
    const offered = new Set(ALL_FACTIONS.flatMap((f) => availableHunts(f, 100, NONE, NONE, 999)).map((h) => h.id));
    const t = emptyBoardTally(ALL_FACTIONS, () => 100, NONE, NONE, 999);
    expect(t.standing + t.reach + t.active + t.completed).toBe(HUNTS.length - offered.size);
  });

  it('⚠⚠ "somebody else\'s business" is never counted as withheld', () => {
    // A single-faction vendor searches only its own pool, so most of the
    // catalogue is `faction`-blocked. Reporting eighteen rows as "locked" would
    // bury the ones he could act on — the same reasoning that filters them out
    // of `huntBoardWithReasons`.
    const one = [ALL_FACTIONS[0]!];
    const t = emptyBoardTally(one, zeroRep, NONE, NONE, 20);
    const factionBlocked = HUNTS.filter((h) =>
      huntBlockReason(h, one[0]!, 0, NONE, NONE, 20)?.kind === 'faction').length;
    expect(factionBlocked).toBeGreaterThan(0);          // the case exists
    expect(t.standing + t.reach + t.active + t.completed).toBeLessThan(HUNTS.length - factionBlocked + 1);
  });

  it('⚠⚠ an ACTIVE contract is counted as active, not as standing', () => {
    const live = HUNTS.slice(0, 2).map((h) => h.id);
    const t = emptyBoardTally(ALL_FACTIONS, () => 100, live, NONE, 999);
    expect(t.active).toBe(2);
  });

  it('⚠⚠ a COMPLETED one is counted as completed — finality order, as huntBlockReason has it', () => {
    const done = HUNTS.slice(0, 3).map((h) => h.id);
    // also live, to prove `completed` wins the tie exactly as the reason does
    const t = emptyBoardTally(ALL_FACTIONS, () => 100, done, done, 999);
    expect(t.completed).toBe(3);
    expect(t.active).toBe(0);
  });
});

describe('OTA-1474 — what he is actually told', () => {
  const line = (t: Partial<EmptyBoardTally>) =>
    emptyBoardLine('Korash of the Deep', { standing: 0, reach: 0, active: 0, completed: 0, ...t });

  it('⚠⚠⚠ IT NAMES THE VENDOR, THE COUNT, AND THE REASON', () => {
    const s = line({ standing: 4 });
    expect(s).toContain('Korash of the Deep');
    expect(s).toContain('4 want standing you have not earned yet');
  });

  it('⚠⚠⚠ AND IT KILLS THE GUESS HE HAD TO MAKE — there is no mission cap', () => {
    // "I'm imagining it's because either I've hit my cap of missions…". There is
    // no cap; a second contract parks. Saying so is half the fix, because the
    // wrong belief is worse than the silence that produced it.
    const s = line({ standing: 2, active: 1 });
    expect(s).toMatch(/no limit on how many you carry/i);
    expect(s).toMatch(/waits its turn/i);
  });

  it('⚠⚠⚠ EVERY COMBINATION READS AS ENGLISH — all sixteen', () => {
    for (const st of [0, 1]) for (const re of [0, 1]) for (const ac of [0, 1]) for (const co of [0, 1]) {
      const s = line({ standing: st * 3, reach: re * 2, active: ac, completed: co * 5 });
      expect(s.startsWith('Korash of the Deep')).toBe(true);
      expect(s).not.toContain('undefined');
      expect(s).not.toContain('NaN');
      expect(s).not.toMatch(/,\s*\./);          // no dangling comma before a stop
      expect(s).not.toMatch(/\band\s*\./);      // no dangling "and"
      expect(s).not.toMatch(/\s{2,}/);          // no double space from an empty clause
    }
  });

  it('⚠⚠ singular is singular and plural is plural, on every clause', () => {
    expect(line({ standing: 1 })).toContain('1 wants standing');
    expect(line({ standing: 2 })).toContain('2 want standing');
    expect(line({ reach: 1 })).toContain('1 is further out');
    expect(line({ reach: 2 })).toContain('2 are further out');
    expect(line({ active: 1 })).toContain('1 is already on your slate');
    expect(line({ active: 2 })).toContain('2 are already on your slate');
    expect(line({ completed: 1 })).toContain('1 is finished');
    expect(line({ completed: 2 })).toContain('2 are finished');
  });

  it('⚠⚠ two reasons join with "and", three with commas then "and"', () => {
    expect(line({ standing: 2, active: 1 })).toMatch(/standing you have not earned yet and 1 is already/);
    const three = line({ standing: 2, reach: 1, active: 1 });
    expect(three).toMatch(/,/);
    expect(three).toMatch(/ and 1 is already on your slate/);
  });

  it('⚠⚠⚠ NOTHING WITHHELD AND NOTHING OFFERED SAYS SO — it does not imply a gate', () => {
    // The honest empty. Implying a lock the player could work toward, when there
    // is none, would be the-game-knows-and-does-not-say pointed the other way.
    const s = line({});
    expect(s).toMatch(/not withheld, just nothing/i);
    expect(s).not.toMatch(/standing/i);
    expect(s).not.toMatch(/no limit/i);
  });

  it('⚠ the old shrug is gone from the source entirely', () => {
    expect(QUEST).not.toContain('No bounties for you right now');
  });
});

describe('OTA-1474 — and the refusal is never deduped into silence', () => {
  it('⚠⚠⚠ THE SITE CARRIES skipDedup — OTA-947\'s rule, at the door that missed it', () => {
    // Twelve taps, one line, eleven `dedup: suppressed arbiter repeat`. From tap
    // two onward he was answered with nothing at all, which is precisely why he
    // kept tapping.
    // ⚠ OTA-1484 wave — byte window (i + 200) converted to the appendLog CALL
    // itself, bounded by its own closing paren-and-semicolon: the claim is
    // "the call that speaks emptyWhy carries the flag", so the window IS that
    // call, however long its arguments grow.
    const callStart = QUEST.lastIndexOf('appendLog(', QUEST.indexOf('emptyWhy!'));
    expect(callStart).toBeGreaterThan(-1);
    const call = between(QUEST.slice(callStart), 'appendLog(', ');');
    expect(call).toContain('emptyWhy!');
    expect(call).toContain('skipDedup: true');
  });

  it('⚠⚠⚠ AND THE DEDUP REALLY WOULD HAVE EATEN IT — the flag is load-bearing', () => {
    // Asserted rather than assumed: `appendLog` suppresses an identical arbiter
    // line within the last twelve, and the ONLY way out is this flag.
    const store = codeOnly(read('app', 'state', 'gameStore.ts'));
    expect(store).toContain("if (channel === 'arbiter' && !meta?.skipDedup)");
    expect(store).toContain('dedup: suppressed arbiter repeat');
  });

  it('⚠⚠ all three branches of this refusal get it, not just the new one', () => {
    // The named-posting and the what-IS-posted branches are refusals too, and a
    // player who taps one twice deserves an answer twice. One `appendLog`, one
    // flag — which is also why this cannot drift apart later.
    const i = QUEST.indexOf('taps the posting');
    const j = QUEST.indexOf('skipDedup: true', i);
    expect(j).toBeGreaterThan(i);
    const between = QUEST.slice(i, j);
    expect(between).toContain('Currently posted');
    expect(between).toContain('emptyWhy');
    expect((between.match(/appendLog\(/g) ?? []).length).toBe(0);   // still one call
  });
});

describe('OTA-1474 — what it must not have disturbed', () => {
  it('⚠⚠⚠ OTA-1466\'s TWO BRANCHES STILL ANSWER FIRST', () => {
    // A named blocked posting beats a summary of the board; a list of what IS
    // posted beats a summary of what is not. The empty line is the LAST resort,
    // and its ordering is the whole reason it never fired before.
    const i = QUEST.indexOf('asked && why');
    expect(i).toBeGreaterThan(-1);
    const chain = QUEST.slice(i, QUEST.indexOf('skipDedup', i));
    expect(chain.indexOf('taps the posting')).toBeLessThan(chain.indexOf('Currently posted'));
    expect(chain.indexOf('Currently posted')).toBeLessThan(chain.indexOf('emptyWhy!'));
  });

  it('⚠⚠ the tally reads standing from the same place the offer does', () => {
    // Two readings of a player's standing is how a board comes to explain a
    // block that is not there.
    const i = QUEST.indexOf('emptyBoardTally(');
    expect(i).toBeGreaterThan(-1);
    const call = QUEST.slice(i, QUEST.indexOf('),', QUEST.indexOf('player.hpMax', i)));
    expect(call).toContain('getStanding(player.factionStanding, fid)');
    expect(call).toContain('player.activeHunts');
    expect(call).toContain('player.completedHuntIds');
    expect(call).toContain('player.hpMax');
  });

  it('⚠⚠ it searches the SAME factions the offer searched, broker or not', () => {
    // ⚠ OTA-1484 wave — the claim is about the CALL's arguments; bound the
    // window by the call's own close instead of guessing 120 bytes.
    const tallyCall = between(QUEST, 'emptyBoardTally(', ')');
    expect(tallyCall).toContain('searchFactions');
  });
});
