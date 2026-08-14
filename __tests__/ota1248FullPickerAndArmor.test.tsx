jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1248 — THE TUTORIAL PICKER SHOWS THE WHOLE ROOM, AND THE PLAYER LEARNS TO
// GET DRESSED.
//
// Owner: *"even though we are doing just the cudgel for take, the take/salvage
// popup should be fully populated so they understand it shows all. And we should
// also have them equip a piece of updated armor at the same time."*
//
// ⚠⚠ (1) THIS REVERSES OTA-1233's NARROWING RULE, AND THE REASON IT EXISTED HAS
// EXPIRED. It came from a playtest — *"neither of those are the cudgel"* — back
// when a wrong tap CLOSED the picker and cost a reopen. Since OTA-1238 the picker
// STAYS OPEN, so a wrong tap just takes something else and leaves the beat's
// target sitting right there. The cost that justified narrowing is gone; the cost
// of narrowing is not — OTA-1245 measured it as "the layout is unteachable".
//
// ⚠ AND THE PROPS MUST BE MERGED, NOT DROPPED. Tutorial props are NOT scene nouns
// — the owner's own log shows LOOK listing the room WITHOUT the cudgel in it — so
// removing the override would have deleted the demo prop and stalled the beat.
//
// ⚠⚠ (2) THE EQUIP STEP HAD NEVER BEEN TAUGHT. The cudgel AUTO-equips on grant, so
// a player could finish the entire tutorial having never opened their pack, and
// then walk into the wastes wearing nothing.
import { readFileSync } from 'fs';
import { join } from 'path';
import { TUTORIAL_STEPS } from '../app/components/tutorialSteps';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1248 — the tutorial picker is fully populated', () => {
  it('⚠⚠ each beat MERGES its prop into the real room instead of replacing it', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const chips = screen.slice(screen.indexOf('const tutorialProp: string | null ='), screen.indexOf('const gatherLaneCount'));
    // The real room is still computed, with its elevation + oversized filters.
    expect(chips).toContain('reachableWhileElevated');
    expect(chips).toContain('const room =');
    // ...and the prop is PREPENDED to it, never substituted for it.
    // ⚠ OTA-1250 — `consumed: propConsumed` now; see that suite for the five-vest bug.
    expect(chips).toContain('[{ noun: tutorialProp, consumed: propConsumed }, ...room');
    // No beat returns a bare one-item array any more.
    expect(chips).not.toContain("? [{ noun: 'cudgel', consumed: false }]");
    expect(chips).not.toContain("? [{ noun: 'broken chest plate', consumed: false }]");
  });

  it('⚠ the prop is de-duplicated — a room that already holds it must not list it twice', () => {
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    const chips = screen.slice(screen.indexOf('const tutorialProp: string | null ='), screen.indexOf('const gatherLaneCount'));
    expect(chips).toContain('room.filter((c) => c.noun !== tutorialProp)');
  });

  it('⚠⚠ the hint can now fire during a beat, because no beat lies about the layout', () => {
    // OTA-1245 suppressed it during beats (the picker was narrowed) and OTA-1247
    // narrowed that to the two narrowing beats. With nothing narrowed, the lane
    // count alone is the honest gate.
    // ⚠ OTA-1249 moved WHEN it fires (arrival → picker close); the gate is still
    // the lane count and nothing else. ota1249 owns the timing assertions.
    const screen = src('app', 'screens', 'ExplorationScreen.tsx');
    expect(screen).toContain('lanesWhileOpen.current >= 2');
    expect(screen).not.toContain('pickerIsNarrowed');
  });
});

describe('OTA-1248 — the armor beat', () => {
  const beat = TUTORIAL_STEPS.find((s) => s.id === 'armor');

  it('⚠⚠ it exists, and it sits between the cudgel and the rope', () => {
    expect(beat).toBeDefined();
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(ids.indexOf('armor')).toBeGreaterThan(ids.indexOf('cudgel'));
    expect(ids.indexOf('armor')).toBeLessThan(ids.indexOf('rope'));
  });

  it('⚠⚠ it teaches the ★ mark AND the equip — the two things nothing else taught', () => {
    // ⚠ OTA-1251 CHANGED WHERE THE EQUIP HAPPENS, not whether it is taught. Owner:
    // *"it was supposed to highlight the fact you can select and equip the vest
    // from the popup, not from inventory."* The word "equip" left the copy with it;
    // the beat now names the ★ and the single tap. ota1251 owns the pack-free
    // assertions.
    const body = (beat as { body?: string }).body ?? '';
    const arbiter = (beat as { arbiter?: string }).arbiter ?? '';
    expect(body).toContain('★');           // the upgrade mark, named where it shows
    expect(body.toLowerCase()).toMatch(/put it on|wear|equip/);
    expect(arbiter.toLowerCase()).toMatch(/put it on|straight onto|equip/);
  });

  it('⚠⚠ the vest does NOT auto-equip — that is the entire lesson', () => {
    // grantTutorialItem auto-equips the cudgel. If it did the same here the beat
    // would complete itself and teach nothing.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('function grantTutorialItem(');
    const fn = store.slice(i, i + 1400);
    expect(fn).toContain("if (id === 'cudgel'");
    expect(fn).not.toContain("id === 'vest'");
  });

  it('⚠⚠ the beat completes on the EQUIP, not the take', () => {
    const store = src('app', 'state', 'gameStore.ts');
    // The take branch grants and explicitly does NOT advance...
    const takeAt = store.indexOf("tStep?.id === 'armor'");
    expect(takeAt).toBeGreaterThan(-1);
    // ⚠ OTA-1250 widened this branch with the already-consumed guard, so the
    // window has to reach past that comment block to still see the grant.
    const takeBranch = store.slice(takeAt, takeAt + 2000);
    expect(takeBranch).toContain("grantTutorialItem(get, set, 'vest')");
    expect(takeBranch).not.toContain("maybeAdvanceTutorial('armor')");
    // ...and equipItem does, from the top, so EVERY equip route counts.
    const equipAt = store.indexOf('  equipItem(itemName, slot, itemId) {');
    expect(store.slice(equipAt, equipAt + 600)).toContain("maybeAdvanceTutorial('armor')");
  });

  it('⚠ the vest is a REAL catalog piece, so the ★ computes honestly', () => {
    // A bespoke prop would not resolve in the catalog, and isUpgradeOverEquipped
    // refuses to mark anything it cannot resolve — the beat would point at a star
    // that never appears.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { findCatalogItem } = require('../app/engine/crafting');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isUpgradeOverEquipped } = require('../app/engine/gatherSort');
    expect(findCatalogItem("Mud-Warden's Vest")).not.toBeNull();
    // Empty chest slot → anything real is an upgrade, so the ★ really shows.
    const bare = { equipped: {}, inventory: [] };
    expect(isUpgradeOverEquipped(bare, "Mud-Warden's Vest")).toBe(true);
  });

  it('⚠⚠ every beat-aware list learned the new id — a missed one breaks the lockdown', () => {
    // ⚠⚠ OTA-1249 REWROTE THIS, AND THE REASON IS THE FINDING. The three lists this
    // test policed were three HAND-WRITTEN COPIES of the lock-beat array, and
    // pinning all three is not a fix — it is a standing tax that gets paid wrong
    // eventually. It already had been: the store's copy never got 'armor', so typed
    // input ran unlocked for the whole beat while this test passed on the two UI
    // copies. There is now ONE exported list, and ota1249 derives its contents from
    // TUTORIAL_STEPS rather than restating them.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TUT_LOCK_BEATS } = require('../app/components/tutorialSteps');
    expect(TUT_LOCK_BEATS).toContain('armor');
    const input = src('app', 'components', 'InputBox.tsx');
    const store = src('app', 'state', 'gameStore.ts');
    // The beat still permits the TAKE button — that part is genuinely per-beat.
    expect(input).toContain("currentBeatId === 'cudgel' || currentBeatId === 'armor' ? 'take'");
    expect(input).toContain("'cudgel' || tutActionBeat === 'armor'");
    // ...and the stuck-player nudge names the new step.
    expect(store).toContain('armor: ');
  });
});
