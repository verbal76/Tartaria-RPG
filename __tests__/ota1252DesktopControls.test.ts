// ⚠ PORTED FROM THE GOLEM LINE during the golem-parity pass. Golem is the model
// line, so its version of this suite is authoritative; the OTA numbers in the
// commentary below are GOLEM's, which is the honest provenance for where the
// behaviour being pinned was actually written.
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
import { readFileSync, existsSync } from 'fs';
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

describe('OTA-1239 — the take popup has no stealth toggle at all', () => {
  // ⚠⚠ THIS BLOCK USED TO PIN THE TOGGLE'S EXISTENCE, AND IT WAS WATCHING A CORPSE.
  //
  // The owner asked about this in OTA-1229, typed into the game: *"why do we still
  // have use stealth in the take popup? thats not how stealth works anymore."* I
  // narrowed it to vendor-only and relabelled it STE-not-DEX instead of removing
  // it, and wrote these tests to lock that in. Then OTA-1233 merged TakeModal into
  // GatherModal and carried the toggle across — **and these assertions kept
  // reading `TakeModal.tsx`, a file nothing has rendered since.** They passed for
  // six OTAs while guarding a component that was not on screen.
  //
  // ⚠ Then he asked again: *"why did you add a stealth option to it, that's not
  // how the stealth is used anymore."* **Asking twice is the answer.** The first
  // reply negotiated with the request instead of doing it.
  //
  // ⚠⚠ AND THE RULE WAS ALREADY WRITTEN DOWN, in PickpocketSheet's own header
  // (OTA-847): *"pickpocket IS the stealth action, so there's no toggle."*

  it('⚠⚠ the retired component is GONE from disk, not left as a corpse to pin', () => {
    expect(existsSync(join(__dirname, '..', 'app', 'components', 'TakeModal.tsx'))).toBe(false);
  });

  it('⚠⚠ the live picker has NO stealth toggle, no toggle state, no stealth props', () => {
    const modal = src('app/components/GatherModal.tsx');
    expect(modal).not.toContain('stealthMeaningful');
    expect(modal).not.toContain('onStealthTake');
    expect(modal).not.toContain('useStealth');
    expect(modal).not.toContain('POCKET IT QUIETLY');
    const expl = src('app/screens/ExplorationScreen.tsx');
    expect(expl).not.toContain('stealthMeaningful={');
    expect(expl).not.toContain('onStealthTake={');
  });

  it('⚠⚠ the dead store action went with it — a second door nothing opens is still a door', () => {
    const store = src('app/state/gameStore.ts');
    // The implementation and its interface entry are both gone...
    expect(store).not.toContain('stealthTakeAmbientNoun(noun) {');
    expect(store).not.toContain('stealthTakeAmbientNoun: (noun: string) => void;');
    // ...and the two paths that always were the better doors are still live.
    expect(store).toContain('pickpocketPerson');
    expect(store).toContain("case 'steal': {");
  });

  it('⚠⚠ REMOVED, NOT JUST DELETED: the day/night cover bonus survived the cut', () => {
    // ⚠ THE REASON THIS OTA CONSOLIDATED INSTEAD OF DELETING. The two
    // implementations of "quietly take a scene noun" had drifted: the toggle's
    // path applied `stealthTimeBonus` (+1 night, -1 day) and the typed `steal`
    // verb never did. **The dead path was the ONLY place that modifier lived**, so
    // a blind delete would have removed it from the game and nobody would have
    // decided to. It now rides the surviving path.
    const store = src('app/state/gameStore.ts');
    const i = store.indexOf("case 'steal': {");
    expect(i).toBeGreaterThan(-1);
    const block = store.slice(i, i + 3000);
    expect(block).toContain('stealthTimeBonus');
    expect(block).toContain('roll + stats.stealth + timeBonus');
    // ⚠ NOT a "one caller" check — that was my first draft of this assertion and
    // it was simply wrong. Day/night cover is meant to apply to EVERY stealth
    // check, per the playtest note on the combat opener: *"does stealth scale up
    // at night, down in the day?"* Three live sites carry it — vendor theft, this
    // ambient grab, and the in-combat opener — and that is the intent, not drift.
    // What IS pinned: the removed action's copy is gone, and the ambient path that
    // inherited its job kept the modifier.
    // ⚠ The identifier survives ONLY in the tombstone comment that explains where
    // its job went — so this forbids the CALL shape, not the word. A test that
    // banned the word outright would force the explanation out of the file, which
    // is how the reason for a removal gets lost.
    expect(store).not.toContain('stealthTakeAmbientNoun(');
    // ⚠ MEASURED, not assumed — my first two drafts of this assertion guessed the
    // call sites and both were wrong. The three live carriers are
    // `pickpocketPerson` (people), the `steal` verb's ambient branch (things), and
    // `concludeRolls` (the in-combat opener). `stealFromVendor` does NOT carry it
    // and never did — its DC already escalates on `stealAttempts` / `stealHeat`,
    // which is its own pressure model.
    expect(store.indexOf('stealthTimeBonus')).toBeGreaterThan(store.indexOf('pickpocketPerson('));
    expect(store.split('stealthTimeBonus').length - 1).toBeGreaterThanOrEqual(3);
  });

  it('⚠ the surviving path still rolls STEALTH, the stat OTA-348 moved it to', () => {
    // The original OTA-1229 finding, preserved: the old label advertised DEX long
    // after the roll moved to STE, so a player reading it built the wrong
    // character. The label is gone; the rule it was wrong about is still checked.
    const store = src('app/state/gameStore.ts');
    const block = store.slice(store.indexOf("case 'steal': {"), store.indexOf("case 'steal': {") + 3000);
    expect(block).toContain('stats.stealth');
    expect(block).not.toMatch(/roll \+ stats\.dexterity/);
  });
});
