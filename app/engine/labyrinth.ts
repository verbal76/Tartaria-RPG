// labyrinth — the Wayfarer of the Lost Paths challenge engine (Iskan-Veil).
//
// Pure, store-free maze navigation built from the plotted layout
// (app/data/maze/labyrinth-of-shadows.json, supplied by the user in arb47).
// The store (gameStore) holds a LabyrinthRun on the player and drives it one
// step per typed direction; everything here is deterministic + side-effect free
// so it can be unit-tested in isolation.
//
// Geometry: 25x25 grid, [col,row], (1,1) = NW, y increases North->South. The
// 63-cell main path is the solution (start (1,23) -> finish (25,7)); the 8
// dead-end branches A-H are travelable wrong turns. Walls are every cell that
// isn't on the path or a branch. The 2 diagonal corner-links live inside the
// branch chains, so the adjacency graph below picks them up automatically.

import maze from '../data/maze/labyrinth-of-shadows.json';

export type Dir = 'N' | 'E' | 'S' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

export interface LabyrinthRun {
  /** Current cell [col,row]. */
  pos: [number, number];
  /** Distinct dead-end branches entered this run (the "wrong turns"). */
  wrongTurns: number;
  /** Cells visited (for narration / backtrack awareness), keyed "c,r". */
  visited: string[];
  /** True once the player stands on the finish cell. */
  finished: boolean;
}

export interface StepResult {
  run: LabyrinthRun;
  /** A wall — no passage that way; the run did not advance. */
  blocked: boolean;
  /** This step crossed a junction into a dead-end branch (a wrong turn). */
  enteredBranch: boolean;
  /** This step landed on a branch's terminal dead-end cell. */
  deadEnd: boolean;
  /** This step reached the finish. */
  reachedFinish: boolean;
  /** Open directions from the new position. */
  open: Dir[];
}

const key = (c: number, r: number) => `${c},${r}`;
const START = maze.start as [number, number];
const FINISH = maze.finish as [number, number];
const BUDGET = maze.wrongTurnBudget as number;

// ── Build the cell + adjacency graph once at module load ────────────────────
type Cell = { onMain: boolean; branch: string | null };
const CELLS = new Map<string, Cell>();
const ADJ = new Map<string, { to: [number, number]; dir: Dir }[]>();

function dirOf(from: [number, number], to: [number, number]): Dir {
  const dc = to[0] - from[0];
  const dr = to[1] - from[1];
  const ns = dr < 0 ? 'N' : dr > 0 ? 'S' : '';
  const ew = dc < 0 ? 'W' : dc > 0 ? 'E' : '';
  return (ns + ew) as Dir;
}

function link(a: [number, number], b: [number, number]) {
  const ka = key(a[0], a[1]);
  const kb = key(b[0], b[1]);
  if (!ADJ.has(ka)) ADJ.set(ka, []);
  if (!ADJ.has(kb)) ADJ.set(kb, []);
  ADJ.get(ka)!.push({ to: b, dir: dirOf(a, b) });
  ADJ.get(kb)!.push({ to: a, dir: dirOf(b, a) });
}

(() => {
  const main = maze.mainPath as [number, number][];
  main.forEach((c) => CELLS.set(key(c[0], c[1]), { onMain: true, branch: null }));
  for (let i = 0; i < main.length - 1; i++) link(main[i]!, main[i + 1]!);

  const branches = maze.branches as unknown as Record<
    string,
    { junction: [number, number]; cells: [number, number][] }
  >;
  for (const [name, b] of Object.entries(branches)) {
    const chain = [b.junction, ...b.cells];
    b.cells.forEach((c) => {
      // a branch cell may coincide with nothing else (validated no-overlap)
      if (!CELLS.has(key(c[0], c[1]))) CELLS.set(key(c[0], c[1]), { onMain: false, branch: name });
    });
    for (let i = 0; i < chain.length - 1; i++) link(chain[i]!, chain[i + 1]!);
  }
})();

const isBranchCell = (c: [number, number]) => CELLS.get(key(c[0], c[1]))?.branch != null;
const DEAD_ENDS = new Set(
  Object.values(maze.branches as unknown as Record<string, { deadEnd: [number, number] }>).map(
    (b) => key(b.deadEnd[0], b.deadEnd[1]),
  ),
);

/** Open directions from a cell, in a stable N,E,S,W,diagonals order. */
export function openDirections(pos: [number, number]): Dir[] {
  const order: Dir[] = ['N', 'E', 'S', 'W', 'NE', 'NW', 'SE', 'SW'];
  const dirs = (ADJ.get(key(pos[0], pos[1])) ?? []).map((e) => e.dir);
  return order.filter((d) => dirs.includes(d));
}

export function startRun(): LabyrinthRun {
  return { pos: [...START] as [number, number], wrongTurns: 0, visited: [key(START[0], START[1])], finished: false };
}

/** Advance the run one step in `dir`. Returns a fresh run (no mutation). */
export function step(run: LabyrinthRun, dir: Dir): StepResult {
  const here = ADJ.get(key(run.pos[0], run.pos[1])) ?? [];
  const edge = here.find((e) => e.dir === dir);
  if (!edge) {
    return { run, blocked: true, enteredBranch: false, deadEnd: false, reachedFinish: false, open: openDirections(run.pos) };
  }
  const prev = run.pos;
  const next = edge.to;
  const enteredBranch = isBranchCell(next) && !isBranchCell(prev);
  const k = key(next[0], next[1]);
  const newRun: LabyrinthRun = {
    pos: [next[0], next[1]],
    wrongTurns: run.wrongTurns + (enteredBranch ? 1 : 0),
    visited: run.visited.includes(k) ? run.visited : [...run.visited, k],
    finished: next[0] === FINISH[0] && next[1] === FINISH[1],
  };
  return {
    run: newRun,
    blocked: false,
    enteredBranch,
    deadEnd: DEAD_ENDS.has(k),
    reachedFinish: newRun.finished,
    open: openDirections(newRun.pos),
  };
}

/** A clean run = reached the finish within the wrong-turn budget. */
export function isCleanRun(run: LabyrinthRun): boolean {
  return run.finished && run.wrongTurns <= BUDGET;
}

export const LABYRINTH = {
  start: START,
  finish: FINISH,
  budget: BUDGET,
  challengeId: maze.id as string,
  title: maze.title as string,
} as const;

/** Parse a free-text direction word into a Dir, or null. */
export function parseDir(text: string): Dir | null {
  const t = text.trim().toLowerCase().replace(/^(go|walk|head|move|travel)\s+/, '');
  const table: Record<string, Dir> = {
    n: 'N', north: 'N', up: 'N',
    e: 'E', east: 'E', right: 'E',
    s: 'S', south: 'S', down: 'S',
    w: 'W', west: 'W', left: 'W',
    ne: 'NE', northeast: 'NE', nw: 'NW', northwest: 'NW',
    se: 'SE', southeast: 'SE', sw: 'SW', southwest: 'SW',
  };
  return table[t] ?? null;
}

const DIR_WORD: Record<Dir, string> = {
  N: 'North', E: 'East', S: 'South', W: 'West',
  NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest',
};
export const dirWord = (d: Dir) => DIR_WORD[d];
