/**
 * OTA-1365 — the MORE tray stays expanded until the player hits LESS.
 *
 * Owner: *"when I hit the more button it should stay expanded until hit less."*
 *
 * ⚠ THE THING WORTH REMEMBERING: nothing was closing it. `setMoreOpen` had (and
 * still has) exactly ONE caller — the toggle. The tray collapsed because the
 * COMPONENT was destroyed and `useState(false)` ran again on the way back in.
 * A reader hunting "what closes the tray" would find no such code and conclude
 * the report was wrong; the answer is that the state's lifetime was shorter
 * than the state's meaning.
 *
 * So this suite pins the two facts that make that true — InputBox is the last
 * branch of a ternary that swaps it out, and ExplorationScreen is a screen that
 * gets swapped out — alongside the latch itself. If someone later restructures
 * the action slot so InputBox stops unmounting, these tests are how they learn
 * the latch was load-bearing rather than belt-and-braces.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const input = src('app', 'components', 'InputBox.tsx');
const exploration = src('app', 'screens', 'ExplorationScreen.tsx');

describe('OTA-1365 — why it was closing', () => {
  it('⚠⚠ nothing ever closed it — the toggle is still the ONLY writer', () => {
    // Exactly one CALL site in the whole file — the toggle. If this ever
    // climbs, something new is closing the tray on the player's behalf, and the
    // cause of that future report is the new caller, not this latch.
    expect(input.match(/setMoreOpen\(/g)?.length).toBe(1);
  });

  it('⚠⚠ InputBox is the LAST branch of the action-slot ternary, so it unmounts', () => {
    // Dice roll, payoff, talk, parley, pickpocket — each replaces InputBox
    // outright rather than covering it, so the component is destroyed.
    for (const sib of ['<DiceRoller', '<PayoffSheet />', '<TalkSheet />',
                       '<ParleySheet />', '<PickpocketSheet']) {
      expect(exploration).toContain(sib);
    }
    const roller = exploration.indexOf('<DiceRoller');
    const box = exploration.indexOf('<InputBox');
    expect(roller).toBeGreaterThan(0);
    expect(box).toBeGreaterThan(roller); // the else-branch, after every sibling
  });

  it('⚠ …and the whole screen unmounts on any trip off the exploration view', () => {
    // inventory / missions / map / codex / character are the most common things
    // a player does BETWEEN needing the tray, which is why it never held.
    expect(exploration).toContain("setScreen('inventory')");
  });
});

describe('OTA-1365 — the latch', () => {
  it('⚠⚠ lives OUTSIDE the component, because it must outlive it', () => {
    expect(input).toContain('let MORE_TRAY_OPEN = false;');
    // module scope, not inside the function
    expect(input.indexOf('let MORE_TRAY_OPEN = false;'))
      .toBeLessThan(input.indexOf('export function InputBox({'));
  });

  it('⚠⚠ seeds the state on every mount', () => {
    expect(input).toContain('const [moreOpen, setMoreOpen] = useState(MORE_TRAY_OPEN);');
    expect(input).not.toContain('const [moreOpen, setMoreOpen] = useState(false);');
  });

  it('⚠⚠ and the toggle writes it, so the choice survives the next unmount', () => {
    expect(input).toContain(
      "onPress={() => setMoreOpen((v) => { MORE_TRAY_OPEN = !v; return !v; })}");
  });

  it('⚠ the tutorial force-open does NOT write the latch', () => {
    // `moreOpen || tutLock` shows the tray during a scripted beat. A beat
    // pointing at a control must not silently set the player's own preference
    // for the rest of the session, so the latch is written by the toggle only.
    expect(input).toContain('{(moreOpen || tutLock) && (');
    const forced = input.indexOf('{(moreOpen || tutLock) && (');
    const after = input.slice(forced, forced + 2000);
    expect(after).not.toContain('MORE_TRAY_OPEN =');
  });

  it('⚠ it is a bar preference, not world state — nothing reaches the save', () => {
    // Deliberately not in the game store: this has no business in a save file
    // or a save migration, and the label is still derived from React state so
    // the button re-renders normally.
    expect(input).not.toContain('moreTrayOpen: ');
    expect(src('app', 'engine', 'types.ts')).not.toContain('MORE_TRAY_OPEN');
    expect(input).toContain("label={moreOpen ? 'less ▴' : 'more ▾'}");
  });
});
