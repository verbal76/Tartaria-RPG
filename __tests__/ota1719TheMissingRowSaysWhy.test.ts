/**
 * OTA-1719 — THE MISSING ROW SAYS WHY.
 *
 * A tester on a Pixel 10 Pro XL, in a bug report: *"Why don't I have the just
 * send a log option. On Android, only on apple"*.
 *
 * ⚠⚠⚠ I COULD NOT ANSWER IT, AND THAT IS THE DEFECT THIS OTA FIXES — not the
 * missing row. The SEND FULL LOG row is gated on a save whose log can be pushed
 * (`fullLogSlot !== null`), and the gate was written with `&&`, so when it was
 * not satisfied the row rendered NOTHING. That leaves a player with only one
 * thing to say — "it isn't there" — and leaves me with nothing to test it
 * against: the report payload recorded the character, the device, the pack and
 * the log, and not one thing about what the report screen itself had been handed.
 *
 * ⚠⚠ AND THE SOURCE READ DOES NOT SETTLE IT, which is why an instrument is the
 * honest answer rather than a fix. `fullLogSlot` is null only when the slot list
 * is empty — but that same tester's report carries `Slot ID:
 * slot_mtdifdmg_g2si12`, and the payload only prints a slot id when the player
 * PICKED a character row. So their list was not empty, the row should have
 * rendered, and I have no way from here to tell whether it was absent, was
 * present and unnoticed, or was absent on an earlier bundle than the one they
 * eventually sent from. Guessing between those and shipping a "fix" for one of
 * them is how a real cause survives a confident patch.
 *
 * ⚠ SO: THE ROW EXPLAINS ITS OWN ABSENCE, and every report from now on carries
 * what the screen could see. The next report answers the question in one line
 * instead of costing another round trip through a playtester.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const MODAL = src('app', 'components', 'BugReportModal.tsx');
const COMPOSER = src('app', 'diagnostics', 'bugReport.ts');

describe('OTA-1719 — ⚠⚠⚠ a control that is not there says so', () => {
  it('THE `&&` IS GONE — the absent row renders a reason, not nothing', () => {
    // `{cond && <Row/>}` is the shape that produces a silent absence. A ternary
    // with a real else arm is the shape that cannot.
    expect(MODAL.includes('{fullLogSlot !== null && (')).toBe(false);
    expect(MODAL.includes('{fullLogSlot !== null ? (')).toBe(true);
    expect(MODAL.includes('Send full log — not available here')).toBe(true);
  });

  it('⚠⚠ and the reason carries the NUMBER that would have answered the report', () => {
    // "this screen was handed N saved characters" is the one line that separates
    // "the gate is wrong" from "the gate is right and the list was empty". A
    // note that only said "unavailable" would be a politer silence.
    expect(MODAL.includes('{screen.saveSlotsSeen} saved character')).toBe(true);
    expect(MODAL.includes('knows which one you are playing')).toBe(true);
  });

  it('the note and the payload read the SAME object, so they cannot disagree', () => {
    // Assembled once, above both uses. A note computed separately from the
    // number sent is two answers to one question, which is the class of defect
    // OTA-1717 spent a whole OTA collapsing in the dog system.
    const decl = MODAL.indexOf('const screen: ReportScreenState = {');
    expect(decl).toBeGreaterThan(0);
    expect(MODAL.indexOf('{screen.saveSlotsSeen} saved character')).toBeGreaterThan(decl);
    expect(MODAL.split(', screen });').length - 1).toBe(2); // both send paths
  });
});

describe('OTA-1719 — ⚠⚠ every report now says what the screen could see', () => {
  it('the payload carries a REPORT SCREEN block', () => {
    expect(COMPOSER.includes('`--- REPORT SCREEN ---`')).toBe(true);
    expect(COMPOSER.includes('Saved characters this screen could see:')).toBe(true);
    expect(COMPOSER.includes('"Send full log" row offered:')).toBe(true);
  });

  it('⚠ it sits ABOVE the device block', () => {
    // A triager reading "the control was missing" needs this before anything
    // about the phone; the phone is not the subject of that complaint.
    expect(COMPOSER.indexOf('`--- REPORT SCREEN ---`'))
      .toBeLessThan(COMPOSER.indexOf('`--- DEVICE / BUILD ---`'));
  });

  it('⚠⚠ a report with no screen state SAYS SO rather than printing zeroes', () => {
    // Defaulting to `{saveSlotsSeen: 0}` would read as a device with no saves —
    // an invented measurement, which is worse than an absent one and is exactly
    // the failure a missing instrument already caused once here.
    expect(COMPOSER.includes('(not recorded — sent by a caller from before OTA-1719)')).toBe(true);
    expect(COMPOSER.includes('args.screen\n      ?')).toBe(true);
  });

  it('and the row being absent is spelled out, not left as a bare "no"', () => {
    expect(COMPOSER.includes("'yes' : 'NO — the row was not on screen'")).toBe(true);
  });
});

describe('OTA-1719 — ⚠ what this OTA does NOT claim', () => {
  it('the gate itself is unchanged — nothing was "fixed" on a guess', () => {
    // The tester's own report carries a picked slot id, so their list was not
    // empty and the gate should have passed. Changing the gate on that evidence
    // would be a patch for a cause nobody has established. It stays as it was;
    // the next report will say which of the three explanations is true.
    expect(MODAL.includes('const fullLogSlot: SlotSummary | null =')).toBe(true);
    expect(MODAL.includes("(activeSlotId ? slots.find((s) => s.slotId === activeSlotId) : undefined)")).toBe(true);
    expect(MODAL.includes('?? [...slots].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0]')).toBe(true);
  });

  it('and the full-log push still needs a real log behind it', () => {
    // The original rule holds: a row that promises a push it cannot perform is
    // the claims-success-without-checking class. Explaining the absence is not
    // the same as offering a control that would fail.
    expect(MODAL.includes('const canSend = isFullLog ? fullLogSlot !== null : description.trim().length > 0;')).toBe(true);
  });
});
