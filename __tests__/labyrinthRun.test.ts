// Exercises the Labyrinth of Shadows navigation engine (arb48): walking the
// plotted solution clean, branch (wrong-turn) accounting, walls, and the
// clean-run budget. Directions are derived from the layout itself so the test
// tracks the data if it's ever re-plotted.

import maze from '../app/data/maze/labyrinth-of-shadows.json';
import { startRun, step, isCleanRun, openDirections, parseDir, LABYRINTH } from '../app/engine/labyrinth';
import type { Dir } from '../app/engine/labyrinth';

const main = maze.mainPath as [number, number][];
const dirBetween = (a: number[], b: number[]): Dir => {
  const ns = b[1]! < a[1]! ? 'N' : b[1]! > a[1]! ? 'S' : '';
  const ew = b[0]! < a[0]! ? 'W' : b[0]! > a[0]! ? 'E' : '';
  return (ns + ew) as Dir;
};

describe('Labyrinth navigation engine', () => {
  it('starts at the spec start with the finish/budget exposed', () => {
    const run = startRun();
    expect(run.pos).toEqual(maze.start);
    expect(LABYRINTH.finish).toEqual(maze.finish);
    expect(LABYRINTH.budget).toBe(maze.wrongTurnBudget);
  });

  it('walking the full main path reaches the finish as a CLEAN run (0 wrong turns)', () => {
    let run = startRun();
    let res = { reachedFinish: false } as ReturnType<typeof step>;
    for (let i = 0; i < main.length - 1; i++) {
      res = step(run, dirBetween(main[i]!, main[i + 1]!));
      expect(res.blocked).toBe(false);
      run = res.run;
    }
    expect(res.reachedFinish).toBe(true);
    expect(run.wrongTurns).toBe(0);
    expect(isCleanRun(run)).toBe(true);
  });

  it('stepping into a wall is blocked and does not move', () => {
    const run = startRun();
    // start (1,23) has no passage west (off-grid) — must be blocked
    const res = step(run, 'W');
    expect(res.blocked).toBe(true);
    expect(res.run.pos).toEqual(run.pos);
  });

  it('entering a dead-end branch counts a wrong turn and can reach the terminal', () => {
    // Branch F hangs off (2,21): (2,20)(2,19)(1,19-deadEnd). Walk start→(2,21)
    // then up the branch.
    let run = startRun();
    // (1,23)->(2,23)->(2,22)->(2,21)
    for (const d of ['E', 'N', 'N'] as Dir[]) run = step(run, d).run;
    expect(run.pos).toEqual([2, 21]);
    expect(run.wrongTurns).toBe(0);
    const intoBranch = step(run, 'N'); // (2,21)->(2,20) enters branch F
    expect(intoBranch.enteredBranch).toBe(true);
    expect(intoBranch.run.wrongTurns).toBe(1);
    run = intoBranch.run;
    run = step(run, 'N').run; // (2,19)
    const term = step(run, 'W'); // (1,19) dead end
    expect(term.deadEnd).toBe(true);
    expect(term.run.wrongTurns).toBe(1); // still one branch entry, not double-counted
  });

  it('a finish reached over-budget is NOT clean', () => {
    const over = { pos: maze.finish as [number, number], wrongTurns: maze.wrongTurnBudget + 1, visited: [], finished: true };
    expect(isCleanRun(over)).toBe(false);
  });

  it('parseDir understands words, letters and "go X"; start exposes open dirs', () => {
    expect(parseDir('north')).toBe('N');
    expect(parseDir('go east')).toBe('E');
    expect(parseDir('NE')).toBe('NE');
    expect(parseDir('banana')).toBeNull();
    expect(openDirections(maze.start as [number, number]).length).toBeGreaterThan(0);
  });
});
