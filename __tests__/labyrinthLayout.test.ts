// Guards the plotted Labyrinth of Shadows layout (arb47). The maze graph is
// hand-supplied coordinate data; a single non-adjacent step or an off-grid cell
// silently breaks the start→finish solve, so we assert the geometry here. Also
// re-asserts the challenge is still INERT (the layout being supplied must NOT
// have flipped it on).

import maze from '../app/data/maze/labyrinth-of-shadows.json';
import {
  LOCATION_CHALLENGES,
  TIER_C_ENABLED,
  challengeActive,
} from '../app/engine/locationChallenges';

type Cell = [number, number];
const key = (c: Cell) => `${c[0]},${c[1]}`;
const ortho = (a: Cell, b: Cell) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
const inBounds = (c: Cell) =>
  c[0] >= 1 && c[0] <= maze.grid.width && c[1] >= 1 && c[1] <= maze.grid.height;

const main = maze.mainPath as unknown as Cell[];
const branches = maze.branches as unknown as Record<
  string,
  { junction: Cell; cells: Cell[]; deadEnd: Cell }
>;
const diagSet = new Set(
  (maze.diagonalLinks as unknown as { from: Cell; to: Cell }[]).map(
    (d) => `${key(d.from)}->${key(d.to)}`,
  ),
);

describe('Labyrinth of Shadows — plotted layout', () => {
  it('is a 25x25 grid with the spec start/finish', () => {
    expect(maze.grid).toEqual({ width: 25, height: 25 });
    expect(maze.start).toEqual([1, 23]);
    expect(maze.finish).toEqual([25, 7]);
    expect(main[0]).toEqual(maze.start);
    expect(main[main.length - 1]).toEqual(maze.finish);
  });

  it('main path is continuous and on-grid', () => {
    main.forEach((c) => expect(inBounds(c)).toBe(true));
    for (let i = 0; i < main.length - 1; i++) {
      expect(ortho(main[i]!, main[i + 1]!)).toBe(true);
    }
  });

  it('every branch junctions onto a main-path cell and is continuous', () => {
    const mset = new Set(main.map(key));
    Object.values(branches).forEach(({ junction, cells, deadEnd }) => {
      expect(mset.has(key(junction))).toBe(true);
      expect(deadEnd).toEqual(cells[cells.length - 1]);
      const chain = [junction, ...cells];
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i]!;
        const b = chain[i + 1]!;
        // either orthogonally adjacent, or a declared diagonal corner-link
        expect(ortho(a, b) || diagSet.has(`${key(a)}->${key(b)}`)).toBe(true);
        expect(inBounds(b)).toBe(true);
      }
    });
  });

  it('no cell is used twice across path + branches', () => {
    const all = [
      ...main.map(key),
      ...Object.values(branches).flatMap((b) => b.cells.map(key)),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it('records exactly the two known diagonal corner-links', () => {
    expect(maze.diagonalLinks.length).toBe(2);
  });

  it('is LIVE (arb48) — master ON + this challenge enabled, layout wired', () => {
    expect(maze.enabled).toBe(true);
    expect(TIER_C_ENABLED).toBe(true);
    const c = LOCATION_CHALLENGES.find((x) => x.id === 'labyrinth_of_shadows')!;
    expect(c.enabled).toBe(true);
    expect(c.needsLayout).toBe(false);
    expect(c.layout).toBe('app/data/maze/labyrinth-of-shadows.json');
    expect(challengeActive('labyrinth_of_shadows')).toBe(true);
  });
});
