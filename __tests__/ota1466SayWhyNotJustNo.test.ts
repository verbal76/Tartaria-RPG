/**
 * OTA-1466 — SAY WHY, NOT JUST NO.
 *
 * ⚠⚠⚠ THE OWNER, 2026-08-24, after tapping a posting twelve times in nine
 * seconds and getting the identical shrug every time:
 *
 *   00:14:05  Korash of the Deep shakes their head. "No bounties for you right now."
 *   00:14:07  …dedup: suppressed arbiter repeat
 *   00:14:09  …            (×12 in nine seconds)
 *
 *   "I couldn't accept the core ass mission from this vendor, but there was no
 *    pop-up telling me why. I'm imagining it's because either I've hit my cap of
 *    missions that I can have or I don't have enough standing but it doesn't say
 *    which. so either we need to have a pop-up or maybe like an angular set of
 *    writing like how they do, you know kind of faded, that says need standing
 *    or something like that?"
 *
 * ⚠⚠ HE HAD TO GUESS, AND BOTH GUESSES WERE WRONG. There is no mission cap —
 * `anyTrackedContract` PARKS a second contract, it never refuses one — and
 * standing is one of FOUR reasons `availableHunts` withholds a posting. The
 * fourth, the reach gate, is almost certainly the one he hit, and it is the one
 * nothing anywhere names.
 *
 * This is the-game-knows-and-does-not-say (OTA-1402) on the contracts board.
 * The filter holds the answer at the instant it drops the row, then discards it
 * and renders nothing at all — so there is not even a row for an explanation to
 * hang off, and "you can't have this yet" is indistinguishable from "there is no
 * work here".
 */
import {
  HUNTS, availableHunts, huntBlockReason, huntBoardWithReasons, huntBoardIsConsistent,
} from '../app/engine/hunts';

const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MODAL = codeOnly(read('app', 'components', 'VendorContractsModal.tsx'));
const QUEST = codeOnly(read('app', 'state', 'slices', 'questSlice.ts'));

/** A hunt with a rep gate, and one with a reach gate — picked from the real
 *  catalogue rather than invented, so these tests break if the content changes
 *  shape rather than passing on a fixture nobody ships. */
const withRep = HUNTS.find((h) => h.minRep > 0);
const withReach = HUNTS.find((h) => (h.recommendedHp ?? 0) > 0);

describe('OTA-1466 — every withholding reason has words', () => {
  it('⚠⚠⚠ AND THE CATALOGUE ACTUALLY CONTAINS THE GATES WE CLAIM TO EXPLAIN', () => {
    // ⚠ An empty result is a failure, never a clean board. If no hunt in the
    // game had a rep gate, every rep test below would pass by never running —
    // the shape of "tests that pass checking nothing".
    expect(withRep).toBeDefined();
    expect(withReach).toBeDefined();
    expect(HUNTS.length).toBeGreaterThan(10);
  });

  it('⚠⚠⚠ STANDING — names the number needed AND the number held', () => {
    const h = withRep!;
    const b = huntBlockReason(h, h.factionId, h.minRep - 1, [], []);
    expect(b).not.toBeNull();
    expect(b!.kind).toBe('standing');
    expect(b!.text).toContain(`need standing ${h.minRep}`);
    expect(b!.text).toContain(`you have ${h.minRep - 1}`);
  });

  it('⚠⚠⚠ REACH — the gate nothing named, phrased as an instruction', () => {
    // ⚠ "come back at 80 HP", not "recommended HP 80". The first tells the
    // player what to do; the second is a stat sheet. That difference is the
    // whole point of the OTA — he already knew he was being refused.
    const h = withReach!;
    const need = h.recommendedHp ?? 0;
    const b = huntBlockReason(h, h.factionId, 99, [], [], need - 1);
    expect(b).not.toBeNull();
    expect(b!.kind).toBe('reach');
    expect(b!.text).toContain(`come back at ${need} HP`);
    expect(b!.text).toMatch(/you have \d+/);
  });

  it('⚠⚠ ALREADY ON IT / ALREADY DONE are distinguished from each other', () => {
    const h = HUNTS[0]!;
    expect(huntBlockReason(h, h.factionId, 99, [h.id], [], 999)!.kind).toBe('active');
    expect(huntBlockReason(h, h.factionId, 99, [], [h.id], 999)!.kind).toBe('completed');
  });

  it('⚠⚠⚠ FINALITY ORDER — a finished hunt is never reported as a rep problem', () => {
    // A player who completed something last week being told "need standing 3"
    // is a true sentence and a useless answer. Most-permanent reason wins.
    const h = withRep!;
    const b = huntBlockReason(h, h.factionId, 0, [h.id], [h.id], 0);
    expect(b!.kind).toBe('completed');
  });

  it('⚠⚠ …and active outranks standing and reach too', () => {
    const h = withRep!;
    expect(huntBlockReason(h, h.factionId, 0, [h.id], [], 0)!.kind).toBe('active');
  });

  it('⚠⚠ an ELIGIBLE hunt has no reason at all', () => {
    const h = HUNTS.find((x) => x.minRep === 0)!;
    expect(huntBlockReason(h, h.factionId, 50, [], [], 9999)).toBeNull();
  });

  it('⚠ every reason reads as a fragment the caller can wrap in a sentence', () => {
    // Rendered as `"<Title> — <text>."` and as `locked: <text>`. A reason that
    // capitalised itself or carried a full stop would surface broken in both.
    for (const h of HUNTS.slice(0, 12)) {
      for (const b of [
        huntBlockReason(h, h.factionId, -99, [], [], 0),
        huntBlockReason(h, h.factionId, 999, [h.id], [], 9999),
        huntBlockReason(h, h.factionId, 999, [], [h.id], 9999),
      ]) {
        if (!b) continue;
        expect(b.text).not.toMatch(/^[A-Z]/);
        expect(b.text.endsWith('.')).toBe(false);
        expect(b.text.length).toBeGreaterThan(4);
      }
    }
  });
});

describe('OTA-1466 — the explainer and the filter cannot disagree', () => {
  // ⚠⚠⚠ TWO DEFINITIONS OF ONE FACT IS HOW THEY COME TO DISAGREE. `availableHunts`
  // decides what is offered; `huntBlockReason` explains what is not. They are
  // separate code over the same five predicates. If they ever drift, the board
  // shows a row the accept path will refuse, or hides one it would accept —
  // both strictly worse than the silence this replaced.
  const REPS = [-5, 0, 1, 3, 5, 10, 99];
  const HPS: (number | undefined)[] = [undefined, 0, 10, 30, 50, 67, 200, 9999];
  const FACTIONS_TO_TRY = [null, ...new Set(HUNTS.map((h) => h.factionId))];

  it('⚠⚠⚠ ACROSS EVERY FACTION × REP × HP COMBINATION IN THE CATALOGUE', () => {
    let checked = 0;
    for (const fid of FACTIONS_TO_TRY) {
      for (const rep of REPS) {
        for (const hp of HPS) {
          expect({ fid, rep, hp, consistent: huntBoardIsConsistent(fid, rep, [], [], hp) })
            .toEqual({ fid, rep, hp, consistent: true });
          checked++;
        }
      }
    }
    // and the sweep really ran — a loop that never entered would pass silently.
    expect(checked).toBeGreaterThan(50);
  });

  it('⚠⚠⚠ …AND WITH ACTIVE / COMPLETED LISTS IN PLAY', () => {
    const someActive = HUNTS.slice(0, 3).map((h) => h.id);
    const someDone = HUNTS.slice(3, 6).map((h) => h.id);
    for (const fid of FACTIONS_TO_TRY) {
      for (const hp of [undefined, 20, 67, 500]) {
        expect(huntBoardIsConsistent(fid, 5, someActive, someDone, hp)).toBe(true);
      }
    }
  });

  it('⚠⚠ the board lists open rows and locked rows and nothing twice', () => {
    const board = huntBoardWithReasons(null, 0, [], [], 40);
    const open = board.filter((r) => r.blocked === null).map((r) => r.hunt.id);
    const locked = board.filter((r) => r.blocked !== null).map((r) => r.hunt.id);
    expect(new Set([...open, ...locked]).size).toBe(open.length + locked.length);
    // the open set is exactly what the filter would have offered
    expect(new Set(open))
      .toEqual(new Set(availableHunts(null, 0, [], [], 40).map((h) => h.id)));
  });

  it('⚠⚠ another faction\'s work is dropped, not shown greyed', () => {
    // Eighteen rows of somebody else's business would bury the handful that
    // matter. `faction` is a reason to omit, not a reason to dim.
    const board = huntBoardWithReasons(null, 0, [], [], 40);
    expect(board.every((r) => r.blocked?.kind !== 'faction')).toBe(true);
  });
});

describe('OTA-1466 — it reaches the screen', () => {
  it('⚠⚠⚠ THE BOARD RENDERS LOCKED ROWS INSTEAD OF OMITTING THEM', () => {
    expect(MODAL).toContain('huntBoardWithReasons(');
    expect(MODAL).toContain('lockedHunts.push(');
    expect(MODAL).toContain('locked: why');
  });

  it('⚠⚠⚠ …FADED, WITH THE REASON WHERE THE ACCEPT BUTTON WOULD BE', () => {
    // The owner asked for this shape by name: not a popup — "kind of faded that
    // says need standing".
    expect(MODAL).toContain('styles.postingLocked');
    expect(MODAL).toContain('styles.lockedWhy');
    expect(MODAL).toMatch(/p\.locked \? \(/);
  });

  it('⚠⚠ a locked row has NO accept button — it cannot be tapped into a refusal', () => {
    // Rendering the button and having it fail would be the same twelve-taps-no-
    // answer loop with extra steps.
    const i = MODAL.indexOf('p.locked ? (');
    expect(i).toBeGreaterThan(-1);
    const branch = MODAL.slice(i, MODAL.indexOf(') : (', i));
    expect(branch).not.toContain('acceptBtn');
    expect(branch).toContain('lockedWhy');
  });

  it('⚠⚠⚠ AND THE REASON REACHES A SCREEN READER', () => {
    // A dimmed row with small grey italics is invisible to TalkBack, and "why
    // can't I take this" is precisely the question that cannot be answered by
    // squinting harder.
    expect(MODAL).toMatch(/accessibilityLabel=\{p\.locked/);
    expect(MODAL).toContain('locked: ${p.locked}');
  });

  it('⚠⚠ the board now passes hpMax, so it cannot offer what accept would refuse', () => {
    // huntWithinReach's own header: "Every player-facing OFFER passes it." This
    // board is an offer and was not passing it — so before this OTA it could
    // post a hunt the accept path then rejected, which is the same silence from
    // the other direction.
    expect(MODAL).toContain('s.player?.hpMax');
    expect(MODAL).toMatch(/huntBoardWithReasons\([^)]*hpMax\)/);
  });

  it('⚠⚠⚠ THE ARBITER NAMES THE REASON TOO, for the typed path', () => {
    // The board is the fix for tapping; this is the fix for typing "accept X".
    expect(QUEST).toContain('huntBlockReason(');
    expect(QUEST).toMatch(/taps the posting\./);
  });

  it('⚠⚠⚠ AND THE LAST RESORT IS NO LONGER A SHRUG — OTA-1474', () => {
    // ⚠⚠ THIS PIN USED TO READ `toContain('No bounties for you right now.')`,
    // with a comment calling that sentence a survivor: "the old shrug survives
    // as the last resort, for when there is genuinely nothing and no named hunt
    // to explain." That was OTA-1466 writing down its own blind spot and
    // describing it as a decision — and the owner's very next log has twelve
    // taps against exactly that branch in nine seconds, eleven of them swallowed
    // by the arbiter dedup, followed by "there was no pop-up telling me why".
    //
    // ⚠ The THIRD pin this week to fail because it quoted the sentence instead
    // of stating the claim (ota1301 and ota1104 were the others). OTA-1466's
    // claim is "a refusal says why". So it is now asserted where the refusal was
    // WEAKEST rather than where it happened to be implemented first — and a pin
    // written this way could not have blessed the gap in the first place.
    expect(QUEST).not.toContain('No bounties for you right now');
    expect(QUEST).toContain('emptyBoardLine(');
    expect(QUEST).toContain('emptyBoardTally(');
    // and the whole refusal now survives being tapped twice
    expect(QUEST).toContain('skipDedup: true');
  });
});
