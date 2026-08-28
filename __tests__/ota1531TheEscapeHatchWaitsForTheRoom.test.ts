/**
 * OTA-1531 — AN ESCAPE HATCH FROM A ROOM YOU ARE NOT IN YET.
 *
 * The owner, starting a new character: *"first thing I notice is the skip
 * tutorial button is immediately visible. it shouldn't show until the player
 * story cards are done and you are in the tutorial screen."*
 *
 * ⚠⚠⚠ THE PILL'S VISIBILITY WAS DERIVED FROM THE TUTORIAL ALONE. arb108 gave it a
 * precise contract — show for exactly as long as the outpost LOCKDOWN holds, from
 * the `name` beat through the stay/leave choice — and that contract is right. What
 * it never accounted for is that `tutorialStep` reaches `name` while the opening
 * crawl (OTA-1018), the chapter card (OTA-1020), the motive picker (OTA-1022) and
 * the dedication card are all still ahead of the player. By its own rule the pill
 * was due on screen from the first frame of a new game.
 *
 * ⚠⚠ THE ONLY THING HOLDING IT BACK WAS Z-ORDER, WHICH IS NOT A GUARANTEE. Those
 * cards are RN Modals; the pill is a plain absolutely-positioned View mounted
 * OUTSIDE SafeAreaView carrying `elevation: 6`. OTA-234 already established on
 * this codebase that the stacking relationship between a Modal and a raised
 * sibling is not something to reason about from the source — a FirstTimeHint
 * raised over an open sheet rendered UNDERNEATH it. Here it went the other way and
 * the owner watched it win.
 *
 * So the fix is state, not layering. An escape hatch from a lockdown the player
 * has not been put in yet has nothing to escape, and is not rendered at all.
 *
 * ⚠ arb108's contract is otherwise untouched: same lock beats, same disappearance
 * on SKIP or on the stay/leave choice.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');
const OVERLAY = src('app', 'components', 'TutorialOverlay.tsx');
const STORE = src('app', 'state', 'gameStore.ts');
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('OTA-1531 — the pill waits for the opening to finish', () => {
  it('⚠⚠⚠ EVERY opening card suppresses it', () => {
    // Missing one is the bug surviving through whichever card was forgotten.
    expect(codeOnly(OVERLAY)).toContain(
      'if (storyIntro || chapterCard || dedicationCard || motivePickerPending || pendingFork) return null;',
    );
  });

  it('⚠⚠⚠ …and each of them is actually subscribed, not just named in a condition', () => {
    // A condition reading undefined variables would typecheck as `false` and
    // suppress nothing. Every card needs its own selector.
    const code = codeOnly(OVERLAY);
    for (const f of ['storyIntro', 'chapterCard', 'dedicationCard', 'motivePickerPending', 'pendingFork']) {
      expect(code).toContain(`useGameStore((s) => s.${f})`);
    }
  });

  it('⚠⚠ the suppression runs BEFORE the lock-beat check, so no beat can leak past it', () => {
    const code = codeOnly(OVERLAY);
    const cards = code.indexOf('if (storyIntro || chapterCard');
    const beat = code.indexOf('const beatId = TUTORIAL_STEPS[tutorialStep]');
    expect(cards).toBeGreaterThan(-1);
    expect(cards).toBeLessThan(beat);
  });

  it('⚠⚠ arb108\'s contract is intact — same lock beats, same exits', () => {
    // The fix adds a precondition; it must not quietly re-scope the pill.
    expect(OVERLAY).toContain(
      "const TUT_LOCK_BEATS = ['name', 'cudgel', 'rope', 'scrap', 'climb', 'investigate', 'explore_or_leave'];",
    );
    const code = codeOnly(OVERLAY);
    expect(code).toContain('TUT_LOCK_BEATS.includes(beatId) && !tutorialExploreChosen');
    expect(code).toContain('if (tutorialStep === null) return null;');
  });

  it('⚠⚠ it is the same card set the store already calls a busy screen', () => {
    // One idea of "the opening is still talking", not two that can drift apart.
    // announceTide and its neighbours gate on this set; so does the pill now.
    expect(codeOnly(STORE)).toContain(
      "if (get().tutorialStep !== null || get().storyIntro || get().chapterCard || get().pendingFork) return false;",
    );
  });

  it('⚠ the pill still renders once the opening is done and the lock holds', () => {
    // The negative half is easy to over-apply. Nothing here may gate on
    // `tutorialExploreChosen` being TRUE, or the hatch would only appear after
    // the choice that ends the lockdown — useless by construction.
    const code = codeOnly(OVERLAY);
    expect(code).toContain('<Text style={styles.pillText}>SKIP TUTORIAL ▸</Text>');
    expect(code).not.toContain('tutorialExploreChosen)  return null;');
    expect(code).not.toContain('if (!tutorialExploreChosen) return null;');
  });
});
