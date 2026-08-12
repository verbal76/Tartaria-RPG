jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1229 — THE THREE THINGS THE OWNER FOUND WITH A MOUSE IN HIS HAND, plus
// the ratchet that had been quietly slipping while nobody read it.
//
// All three came out of one PC session, two of them typed straight into the
// game's own command box (which is why they are in the device log rather than
// in chat):
//
//   · *"why do we still have use stealth in the take popup? thats not how
//      stealth works anymore"*
//   · *"right click on the mouse should be the back button"*
//   · *"the character portrait text and spacing didn't scale it stretched"*
//
// ⚠ MOBILE MUST NOT MOVE. jest-expo runs the NATIVE platform, so every desktop
// guard below is inert here — which is exactly the regression this suite exists
// to hold. The desktop work may not cost the phone one pixel or one tap.
import { readFileSync } from 'fs';
import { join } from 'path';
import { STAT_ROW_MAX_WIDTH } from '../app/ui/layoutConstants';
import {
  pushBackHandler, fireBack, backHandlerCount, initDesktopBack,
} from '../app/ui/desktopBack';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

describe('OTA-1229 — the back stack', () => {
  it('⚠⚠ LIFO: the newest handler answers first — a popup closes before the screen', () => {
    const calls: string[] = [];
    const offScreen = pushBackHandler(() => { calls.push('screen'); return true; });
    const offModal = pushBackHandler(() => { calls.push('modal'); return true; });
    expect(fireBack()).toBe(true);
    // The modal was registered last, so it takes the click. The screen beneath
    // must NOT also fire — that would close both in one right-click.
    expect(calls).toEqual(['modal']);
    offModal();
    expect(fireBack()).toBe(true);
    expect(calls).toEqual(['modal', 'screen']);
    offScreen();
  });

  it('⚠ a handler that declines falls through to the one beneath it', () => {
    const seen: string[] = [];
    const offA = pushBackHandler(() => { seen.push('a'); return true; });
    const offB = pushBackHandler(() => { seen.push('b'); return false; });
    expect(fireBack()).toBe(true);
    expect(seen).toEqual(['b', 'a']);
    offA(); offB();
  });

  it('⚠⚠ nothing to go back to reports FALSE — the caller needs that answer', () => {
    // This is what stops a right-click on the game screen from doing something.
    // It is also how the Escape route decides whether to swallow the key.
    const off = pushBackHandler(() => false);
    expect(fireBack()).toBe(false);
    off();
    expect(fireBack()).toBe(false);
  });

  it('⚠ a throwing handler cannot strand the player on a screen with no way out', () => {
    const rescued: string[] = [];
    const offUnder = pushBackHandler(() => { rescued.push('under'); return true; });
    const offBad = pushBackHandler(() => { throw new Error('boom'); });
    expect(() => fireBack()).not.toThrow();
    expect(rescued).toEqual(['under']); // the one below still got its turn
    offBad(); offUnder();
  });

  it('⚠ unregistering is exact — the stack does not leak across screens', () => {
    const before = backHandlerCount();
    const off1 = pushBackHandler(() => false);
    const off2 = pushBackHandler(() => false);
    expect(backHandlerCount()).toBe(before + 2);
    off2(); off1();
    expect(backHandlerCount()).toBe(before);
    off1(); // double-release must not remove somebody else's handler
    expect(backHandlerCount()).toBe(before);
  });

  it('⚠⚠ MOBILE: initDesktopBack is a no-op on native — no listeners, no behaviour', () => {
    // jest-expo runs the native platform. If this ever throws or attaches, the
    // desktop routes have leaked onto phones, where Android's hardware back is
    // already wired per-Modal and would now fire twice.
    expect(() => initDesktopBack()).not.toThrow();
    expect(() => initDesktopBack()).not.toThrow(); // idempotent
  });

  it('⚠⚠ the live handler is read through a ref, not frozen at mount', () => {
    // The registration effect depends only on `active`, so the closure captured
    // at first render would otherwise be the one called forever — a right-click
    // acting on a popup the player closed ten minutes ago.
    const back = src('app', 'ui', 'desktopBack.ts');
    expect(back).toContain('const latest = useRef(fn)');
    expect(back).toContain('pushBackHandler(() => latest.current())');
  });

  it('⚠⚠ back never quits the game, and never dismisses the tutorial gate', () => {
    const app = src('App.tsx');
    // The screen-level handler declines on the four screens where "back" would
    // mean losing something: mid-run, mid-creation, or off an earned ending.
    for (const s of ['exploration', 'title', 'character_creation', 'ending']) {
      expect(app).toContain(`screen === '${s}'`);
    }
    expect(app).toContain('initDesktopBack()');
    const expl = src('app', 'screens', 'ExplorationScreen.tsx');
    const handler = expl.slice(expl.indexOf('useBackAction(true, () => {'));
    const body = handler.slice(0, handler.indexOf('return false;'));
    // Every picker the player opened is dismissible...
    for (const flag of ['takeOpen', 'salvageOpen', 'climbOpen', 'searchOpen', 'approachOpen']) {
      expect(body).toContain(flag);
    }
    // ...and the tutorial door beat, which the run cannot continue past, is not.
    expect(body).not.toContain('doorBeatOpen');
    expect(body).not.toContain('doorModalVisible');
  });
});

describe('OTA-1229 — the take popup stops offering a roll against nobody', () => {
  it('⚠⚠ the stealth toggle renders only when a vendor is standing there', () => {
    const modal = src('app', 'components', 'TakeModal.tsx');
    expect(modal).toContain('{stealthMeaningful && (');
    const expl = src('app', 'screens', 'ExplorationScreen.tsx');
    // ...and "meaningful" is exactly the condition the STORE uses to route the
    // tap to stealFromVendor. The button and the behaviour must agree.
    expect(expl).toContain('stealthMeaningful={!!currentScene?.vendor}');
    const store = src('app', 'state', 'gameStore.ts');
    const fn = store.slice(store.indexOf('stealthTakeAmbientNoun(noun) {'));
    expect(fn.slice(0, 900)).toContain('if (scene.vendor) {');
  });

  it('⚠⚠ the label names STEALTH, the stat the handler has rolled since OTA-348', () => {
    // This is the literal "that's not how stealth works anymore": the button
    // advertised a DEX roll long after the roll moved to STE, so a player
    // reading it would build the wrong character for it.
    const modal = src('app', 'components', 'TakeModal.tsx');
    // Only the RENDERED label is pinned — the surrounding comments still say
    // "DEX roll" on purpose, because they are the record of what was wrong.
    const labels = modal.split('\n').filter((l) => /\{useStealth \?/.test(l)).join('\n');
    expect(labels).not.toBe('');
    expect(labels).not.toContain('DEX');
    expect(labels).toContain('STE roll');
    const store = src('app', 'state', 'gameStore.ts');
    const fn = store.slice(store.indexOf('stealthTakeAmbientNoun(noun) {'));
    // The handler's actual roll — Stealth, not DEX.
    expect(fn.slice(0, 3000)).toContain('roll + stats.stealth');
  });
});

describe('OTA-1229 — the stat header stops stretching on a monitor', () => {
  it('⚠⚠ MOBILE IS UNTOUCHED IN FACT, not merely in effect: the cap is undefined on native', () => {
    // An undefined style key is absent from the object. A large sentinel number
    // would also never bind today — and would silently start binding the day
    // somebody put the game on a tablet in landscape.
    expect(STAT_ROW_MAX_WIDTH).toBeUndefined();
  });

  it('⚠ on desktop the cap is the phone measure the 9px labels were drawn against', () => {
    const ds = src('app', 'ui', 'layoutConstants.ts');
    const m = /STAT_ROW_MAX_WIDTH: number \| undefined = Platform\.OS === 'web' \? (\d+) : undefined/.exec(ds);
    expect(m).not.toBeNull();
    const web = Number(m![1]);
    // Five columns wide enough for "35/109", and never as wide as the column
    // itself — past that it would not be capping anything.
    expect(web).toBeGreaterThanOrEqual(360);
    expect(web).toBeLessThan(1024);
  });

  it('⚠⚠ the stat row consumes the cap, and no bare number was left behind', () => {
    const panel = src('app', 'components', 'StatsPanel.tsx');
    expect(panel).toContain('maxWidth: STAT_ROW_MAX_WIDTH');
    expect(panel).toContain("from '../ui/layoutConstants'");
    // The flex:1 cells stay — they are correct INSIDE a bounded row, and they
    // are what makes the columns read as evenly distributed (OTA-747).
    expect(panel).toContain('stat: { flex: 1');
  });
});
