/**
 * OTA-1469 — THE COURSE BANNER DESCRIBED A DEPARTURE THAT HAD ALREADY HAPPENED.
 *
 * ⚠⚠⚠ THE OWNER, TYPED INTO THE GAME 2026-08-23:
 *
 *   "when I set an autoroute it refreshes whatever tile I am on with new items"
 *
 * He was reading a real event correctly and being told the wrong story about it.
 * Setting a course TAKES THE FIRST STEP IMMEDIATELY — deliberately, since
 * OTA 053, "so the player sees motion now" — and the banner then told him to tap
 * the travel button "to press on", as though he had not moved. He had. He was on
 * a NEW tile, which rolled its own gear roster, which is why the ground appeared
 * to restock underneath him. One second of his log:
 *
 *   23:57:11.551  You set course for The Hidden Market. 11 tiles…
 *                 Tap the → THE HIDDEN MARKET button … to press on
 *   23:57:11.595  spawn: gear=[Earthshaker, Repeater Rifle, …] roster=new
 *   23:57:11.606  You walk north.
 *
 * ⚠⚠ THE AUTO-STEP IS NOT THE DEFECT AND IS NOT REMOVED. It is a deliberate feel
 * decision with its own OTA behind it, and ripping it out to satisfy a wording
 * complaint would be fixing the wrong half. The defect is that the sentence was
 * copied from the TUTORIAL path — which genuinely does not auto-depart and says
 * "When you're ready to leave, tap…" and means it. One path moves you, one does
 * not, and they were sharing a sentence.
 *
 * ⚠ And the depleted case (OTA-615: no legs, keep the route, do not step) is the
 * one where the ORIGINAL wording was true all along, so it still gets it. That is
 * what makes this a truth fix rather than a copy change.
 */
const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const STORE = codeOnly(read('app', 'state', 'gameStore.ts'));

/** The set-course body, bounded by its own landmarks rather than a byte window —
 *  a fixed-window slice here is the pin style this project has been converting
 *  away from all week, and it would drift the moment anything above it grew. */
const courseBody = (): string => {
  // ⚠ The OPENING anchor is the target-cell derivation, not the banner string.
  // The first draft started at the banner and so sliced AFTER the `willStep` and
  // `firstDir` declarations it exists to check — three tests failed reporting an
  // empty string, which is the "instrument looked in the wrong place" failure
  // rather than a defect. `canonicalCellOf(locationId)` occurs exactly once in
  // the file, so the window opens where the routing decision begins.
  const a = STORE.indexOf('const tgtCell = canonicalCellOf(locationId);');
  expect(a).toBeGreaterThan(-1);
  const b = STORE.indexOf('maybeSeedQuarry(get, set);', a);
  expect(b).toBeGreaterThan(a);
  return STORE.slice(a, b);
};

describe('OTA-1469 — the banner branches on what actually happened', () => {
  it('⚠⚠⚠ IT IS DECIDED BY `willStep`, NOT ASSUMED', () => {
    const body = courseBody();
    expect(body).toContain('willStep');
    // both arms exist — a branch with one arm is not a branch
    expect(body).toContain('You set off now');
    expect(body).toContain('to press on');
  });

  it('⚠⚠⚠ THE MOVING ARM DOES NOT TELL HIM TO START — he has started', () => {
    const body = courseBody();
    const i = body.indexOf('You set off now');
    expect(i).toBeGreaterThan(-1);
    // The arm the player sees when the game just moved them. It must not
    // contain the instruction that caused the complaint.
    // ⚠ Ends at the NEXT arm, not at a backtick: the moving arm closes with
    // "`)" and the first draft searched for "`," and captured nothing.
    const arm = body.slice(i, body.indexOf('Tap the →', i));
    expect(arm).not.toContain('to press on');
    expect(arm).toContain('Keep tapping');
  });

  it('⚠⚠⚠ AND IT WARNS HIM THE GROUND CHANGED — the thing he actually noticed', () => {
    // "it refreshes whatever tile I am on with new items". The gear is not
    // refreshing; he is standing somewhere else. Saying so is the whole fix.
    const body = courseBody();
    expect(body).toContain('the ground ahead is new ground');
  });

  it('⚠⚠ THE STATIONARY ARM KEEPS THE ORIGINAL WORDING, because it was true', () => {
    // OTA-615: a depleted player keeps the route and does not step. For them
    // "tap to press on" was always accurate, and rewording it would have traded
    // one wrong sentence for another.
    const body = courseBody();
    const i = body.indexOf('to press on');
    expect(i).toBeGreaterThan(-1);
    const arm = body.slice(Math.max(0, i - 120), i);
    expect(arm).toContain('button on the travel row');
  });
});

describe('OTA-1469 — the sentence and the movement cannot disagree', () => {
  it('⚠⚠⚠ ONE DERIVATION OF "WILL WE STEP", NOT TWO', () => {
    // The step used to be gated on `firstDir && stamina >= wander` computed
    // AFTER the banner. Two derivations of one fact is how they come to
    // disagree — and a banner that says "you set off now" while the step is
    // skipped is a worse lie than the one being fixed.
    const body = courseBody();
    const decls = body.match(/const willStep\s*=/g) ?? [];
    expect(decls.length).toBe(1);
    expect(body).toContain('if (willStep) {');
  });

  it('⚠⚠⚠ AND THE OLD INLINE CONDITION IS GONE FROM THE STEP GUARD', () => {
    const body = courseBody();
    expect(body).not.toMatch(/if \(firstDir && get\(\)\.player!\.stamina >= STAMINA_COSTS\.wander\)/);
  });

  it('⚠⚠ willStep is built from BOTH conditions — a direction and the legs', () => {
    const body = courseBody();
    const i = body.indexOf('const willStep');
    const decl = body.slice(i, body.indexOf(';', i));
    expect(decl).toContain('firstDir');
    expect(decl).toContain('STAMINA_COSTS.wander');
  });

  it('⚠⚠ the stamina spend still happens on the step, not on the banner', () => {
    // The auto-step costs stamina and time (OTA 053) precisely so multi-step
    // travel cannot bypass the fatigue economy. Moving the banner must not have
    // moved that.
    // ⚠ OTA-1484 wave — `if (willStep) {` OPENS a block, so its own brace-walked
    // body is the exact window the byte guess (i + 400) was approximating.
    // Anchored on the FULL store, not courseBody(): that helper's window is
    // itself truncated and cuts the if-block mid-body, which blockAt correctly
    // refused to close rather than silently truncate — the first conversion hit
    // exactly that refusal.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { blockAt } = require('../test-utils/srcBlock') as typeof import('../test-utils/srcBlock');
    const guarded = blockAt(STORE, 'if (willStep) {');
    expect(guarded).toContain('spendStamina');
    expect(guarded).toContain('advanceTime');
    expect(guarded).toContain('stepDirection(firstDir)');
  });
});

describe('OTA-1469 — the tutorial path is untouched', () => {
  it('⚠⚠⚠ pick_city STILL DOES NOT AUTO-DEPART', () => {
    // This is the path whose wording the broken sentence was copied from. It
    // returns before the step, and it should keep doing exactly that — the
    // tutorial teaches the travel row by making the player use it.
    const body = courseBody();
    const i = body.indexOf('inTutPickCity');
    expect(i).toBeGreaterThan(-1);
    // ⚠ Ends at the step guard, NOT at `const firstDir` — this OTA moved that
    // declaration ABOVE the banner and therefore above this branch, so the old
    // end-anchor now precedes the start and the slice came back empty. An
    // instrument reading a reordered file needs anchors that survive the
    // reorder.
    const branch = body.slice(body.indexOf('if (inTutPickCity)'), body.indexOf('if (willStep) {'));
    expect(branch).toContain("When you're ready to leave");
    expect(branch).toContain('maybeAdvanceTutorial');
    expect(branch).toContain('return;');
  });

  it('⚠⚠ …and its return comes BEFORE willStep is ever consulted', () => {
    const body = courseBody();
    expect(body.indexOf('maybeAdvanceTutorial')).toBeLessThan(body.indexOf('if (willStep) {'));
  });
});

describe('OTA-1469 — what the banner still has to get right', () => {
  it('⚠⚠ OTA-1167 is undisturbed — it still quotes hours, not "days"', () => {
    // The banner was the last surface quoting the pre-1185 fiction; a rewrite
    // that reintroduced "N days of travel" would undo a fix a player needs to
    // budget a contract window.
    const body = courseBody();
    expect(body).toContain('travelHoursFor(tiles)');
    expect(body).toContain('of travel, all in');
    expect(body).not.toMatch(/\$\{tiles\} day/);
  });

  it('⚠⚠ tile pluralisation survived the edit', () => {
    expect(courseBody()).toContain("tile${tiles === 1 ? '' : 's'}");
  });

  it('⚠ STOP TRAVEL is still offered on BOTH arms', () => {
    // The halt affordance is how a player undoes a course they did not mean to
    // set — which, given the complaint, is exactly what he might want next.
    const body = courseBody();
    const stops = body.match(/STOP TRAVEL to halt/g) ?? [];
    expect(stops.length).toBe(2);
  });
});

// ⚠ Makes this file a MODULE. Without an import or export, TypeScript treats a
// test file as a global script and its top-level `read` helper collides with the
// identically-named helper in every other script-scoped suite — "Cannot
// redeclare block-scoped variable". Nothing here needs an import, so the empty
// export is the declaration of intent.
export {};
