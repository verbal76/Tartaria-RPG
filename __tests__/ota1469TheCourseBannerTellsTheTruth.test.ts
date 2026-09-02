/**
 * OTA-1469 — THE COURSE BANNER TELLS THE TRUTH.
 *
 * ⚠⚠⚠ THE OWNER, TYPED INTO THE GAME 2026-08-23:
 *
 *   "when I set an autoroute it refreshes whatever tile I am on with new items"
 *
 * OTA-1469's answer was a WORDING fix. Setting a course took the first step
 * itself (OTA 053, "so the player sees motion now"), so the banner was rebuilt
 * to say "You set off now — the ground ahead is new ground" on the arm that
 * moved him, and the step was kept as a feel decision with its own OTA behind it.
 *
 * ⚠⚠⚠ OTA-1632 REVERSED THAT CALL. He reported the same thing a third time —
 * "whatever tile I'm standing in when I auto route automatically repopulates all
 * of the loot under the take salvage button and under investigate" — and a true
 * sentence about an unwanted move is still an unwanted move. The step is gone:
 * SET COURSE plans, → DESTINATION walks. So the banner has ONE arm again, and it
 * is the arm that was always true for the depleted player (OTA-615): "Tap the →
 * button on the travel row to press on." These pins hold that shape.
 */
const read = (...p: string[]) =>
  require('fs').readFileSync(require('path').join(__dirname, '..', ...p), 'utf8') as string;
const codeOnly = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const STORE = codeOnly(read('app', 'state', 'gameStore.ts'));

/** The set-course body, bounded by its own landmarks rather than a byte window. */
const courseBody = (): string => {
  const a = STORE.indexOf('const tiles = canonicalDistanceFromGrid(grid.x, grid.y, locationId);');
  expect(a).toBeGreaterThan(-1);
  const b = STORE.indexOf('continueTravel() {', a);
  expect(b).toBeGreaterThan(a);
  return STORE.slice(a, b);
};

describe('OTA-1469 → OTA-1632 — the banner has one arm, and it is the true one', () => {
  it('⚠⚠⚠ NO willStep, NO STEP — the course is planned and the player stays', () => {
    const body = courseBody();
    expect(body).not.toContain('willStep');
    expect(body).not.toContain('stepDirection(');
    expect(body).not.toContain('spendStamina');
    expect(body).not.toContain('You set off now');
    expect(STORE).not.toContain('the ground ahead is new ground');
  });

  it('⚠⚠⚠ THE ONE ARM tells him to press on from the travel row', () => {
    const body = courseBody();
    expect(body).toContain('button on the travel row to press on');
    expect((body.match(/STOP TRAVEL to halt/g) ?? []).length).toBe(1);
  });

  it('⚠⚠ the depleted player (OTA-615) keeps the route and is told to rest', () => {
    const body = courseBody();
    expect(body).toContain('STAMINA_COSTS.wander');
    expect(body).toContain("you're spent");
    expect(body).toContain('buzzBlocked()');
  });
});

describe('OTA-1469 — the tutorial path is untouched', () => {
  it('⚠⚠⚠ pick_city hands control back and returns before the stamina read', () => {
    const body = courseBody();
    const i = body.indexOf('if (inTutPickCity)');
    expect(i).toBeGreaterThan(-1);
    const branch = body.slice(i, body.indexOf('STAMINA_COSTS.wander', i));
    expect(branch).toContain("When you're ready to leave");
    expect(branch).toContain('maybeAdvanceTutorial');
    expect(branch).toContain('return;');
  });
});

describe('OTA-1469 — what the banner still has to get right', () => {
  it('⚠⚠ OTA-1167 is undisturbed — it still quotes hours, not "days"', () => {
    const body = courseBody();
    expect(body).toContain('travelHoursFor(tiles)');
    expect(body).toContain('of travel, all in');
    expect(body).not.toMatch(/\$\{tiles\} day/);
  });

  it('⚠⚠ tile pluralisation survived the edit', () => {
    expect(courseBody()).toContain("tile${tiles === 1 ? '' : 's'}");
  });
});

// ⚠ Makes this file a MODULE (the top-level `read` helper would otherwise collide
// with the identically-named helper in every other script-scoped suite).
export {};
