// QOL #220 PHYSICAL ACCEPTANCE FAILURE / FOLLOW-UP REPAIR + CORRECTION.
//
// Owner, on the actual Golem device (Pixel 10 Pro XL, com.hotatticgames.
// tartarprim.golem, runtime 2.5.0, native build 474, OTA 2026-09-27-1889):
// live combat, an enemy with an active player-applied ACID effect showed
// `ACID 3t left · 4/turn` in the existing lower status row, and `AC 13` in
// the upper stat row with NO emblem beside it. The original #220 regression
// (qol220EnemyEffectStaysOnTheCard.test.ts) never asserted that — it proved
// EnemyStatusView's kind union is complete and that `statusCol` renders a
// generic badge per status, both true and both irrelevant to the AC-adjacent
// indicator the owner actually asked for, entirely by string-matching the
// source file. It never rendered the card at all.
//
// ⚠⚠ CORRECTION — the first follow-up pass drew the AC glyph correctly but
// left the old lower `ACID 3t left · 4/turn` chip rendering for the SAME
// status at the same time, which the owner caught in a second physical
// screenshot: both representations on screen together. Cases B/C/F below now
// assert the redundant chip's ABSENCE for a qualifying coating, not merely
// the glyph's presence; case D still requires the chip for a status the
// glyph doesn't cover (infected/typed_dot); case H covers the expanded
// popup's own correction — it now leads each qualifying line with the same
// glyph and keeps the AC line's own badges, instead of a bare bullet.
//
// This suite renders the real production door — the exported `EnemyPanel`
// component (and its exported `enemyDetailBody` builder for the expanded
// popup), the same ones ExplorationScreen mounts in combat — with a
// controlled `EnemyView[]`, and inspects the actual host-node tree
// react-test-renderer produces, the way ota1756TheCardIsMeasured.test.tsx
// already does for a different card. No component here is mocked.
import React from 'react';
import { EnemyPanel, enemyDetailBody, type EnemyView, type EnemyStatusView } from '../app/components/EnemyPanel';
import { COATING_GLYPH, COATING_GLYPH_COLOR } from '../app/engine/weaponGlyphs';
import { enemyAC } from '../app/engine/combatRules';
import type { Enemy } from '../app/engine/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act(cb: () => void | Promise<void>): Promise<void> & void;
  create(el: React.ReactElement): { unmount(): void; root: TestInstanceLike };
};
interface TestInstanceLike {
  props: Record<string, unknown>;
  children: unknown[];
  parent: TestInstanceLike | null;
  findAll(p: (n: TestInstanceLike) => boolean): TestInstanceLike[];
}

const hosts = (root: TestInstanceLike, p: (n: TestInstanceLike) => boolean) =>
  root.findAll((n) => typeof (n as { type?: unknown }).type === 'string' && p(n));
const flat = (s: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const walk = (x: unknown) => {
    if (!x) return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === 'object') Object.assign(out, x as Record<string, unknown>);
  };
  walk(s);
  return out;
};
const textOf = (n: TestInstanceLike): string => {
  const walk = (x: unknown): string => typeof x === 'string' ? x
    : typeof x === 'number' ? String(x)
      : Array.isArray(x) ? x.map(walk).join('')
        : ((x as TestInstanceLike | null)?.children ? walk((x as TestInstanceLike).children) : '');
  return walk(n.children);
};

function foe(over: Partial<Enemy> = {}): Enemy {
  return {
    name: 'Quiver Rat', type: 'Vermin', rarity: 'Common', hp: 14,
    attack: 'Nip', damage: '1D4', traits: [], loot: [],
    ...over,
  } as unknown as Enemy;
}
function view(statuses: EnemyStatusView[], over: Partial<EnemyView> = {}): EnemyView {
  return { enemy: foe(), currentHp: 10, statuses, ...over } as EnemyView;
}

/** The row that pairs the AC value's own Text with whatever accessory rides
 *  beside it — `styles.statValueRow` on every Stat, but only AC's copy is
 *  ever asked to carry a coating glyph. Located by CONTENT (the AC value
 *  react actually computed), never by assuming a position in the grid. */
function acValueRow(root: TestInstanceLike, enemy: Enemy): TestInstanceLike {
  const ac = String(enemyAC(enemy));
  const rows = hosts(root, (n) => {
    const s = flat(n.props.style);
    return s.flexDirection === 'row' && s.alignItems === 'center' && s.gap === 3;
  });
  const row = rows.find((r) => textOf(r) === ac || textOf(r).startsWith(ac));
  expect(row).toBeDefined();
  return row!;
}

async function mount(views: EnemyView[]) {
  let tree!: { unmount(): void; root: TestInstanceLike };
  await renderer.act(() => {
    tree = renderer.create(
      <EnemyPanel enemies={views} activeIndex={0} onSelectActive={() => {}} />,
    ) as unknown as { unmount(): void; root: TestInstanceLike };
  });
  return tree;
}

describe('QOL #220 FOLLOW-UP — the AC-adjacent effect indicator, on the real card', () => {
  it('A. no qualifying active effect: AC renders plainly, no glyph anywhere on the card', async () => {
    const enemy = foe();
    const tree = await mount([view([], { enemy })]);
    const row = acValueRow(tree.root, enemy);
    expect(textOf(row)).toBe(String(enemyAC(enemy)));
    // Not merely "not beside AC" — the glyph vocabulary doesn't appear on the
    // whole card at all, since enemy.coating (a different field) is also unset.
    for (const ch of Object.values(COATING_GLYPH)) {
      expect(textOf(tree.root)).not.toContain(ch);
    }
    tree.unmount();
  });

  it('B. active acid: AC keeps its number, the acid glyph rides beside it, and the redundant old lower chip is GONE (the physical-acceptance correction)', async () => {
    const enemy = foe();
    const st: EnemyStatusView = { kind: 'acid_coat', turnsRemaining: 3, dmgPerTurn: 4, sourceName: 'Acid-Etched Bolt-Caster' };
    const tree = await mount([view([st], { enemy })]);
    const ac = String(enemyAC(enemy));
    const row = acValueRow(tree.root, enemy);
    // ⚠ the exact live-report shape: "AC 13" with the acid emblem beside it,
    // not a rewritten AC number and not a second copy of "ACID" as text here —
    // this door draws a GLYPH.
    expect(textOf(row)).toContain(ac);
    expect(textOf(row)).toContain(COATING_GLYPH.acid);
    expect(textOf(row)).not.toContain('ACID');
    // The row is still a two-child affair (value + accessory) — proves the
    // indicator didn't fork the AC number into something else.
    const acidColorNode = hosts(tree.root, (n) => flat(n.props.style).color === COATING_GLYPH_COLOR.acid);
    expect(acidColorNode.length).toBeGreaterThan(0);
    // ⚠⚠ THE CORRECTION ITSELF — the owner's physical screenshot caught the old
    // lower chip STILL printing `ACID 3t left · 4/turn` beside the new glyph.
    // A qualifying coating's presence is now spoken for ONCE, by the AC glyph
    // alone; the compact card carries none of "ACID", "3t left", or "4/turn"
    // anywhere once acid_coat has a glyph.
    const full = textOf(tree.root);
    expect(full).not.toContain('ACID');
    expect(full).not.toContain('3t left');
    expect(full).not.toContain('4/turn');
    tree.unmount();
  });

  it('C. a different qualifying coating (electrical, not acid) also earns the indicator, and also loses its redundant lower chip — generalized, not acid-only', async () => {
    const enemy = foe();
    const st: EnemyStatusView = { kind: 'electrical_coat', turnsRemaining: 2, dmgPerTurn: 3, sourceName: 'Storm Lance' };
    const tree = await mount([view([st], { enemy })]);
    const row = acValueRow(tree.root, enemy);
    expect(textOf(row)).toContain(COATING_GLYPH.electrical);
    expect(textOf(row)).not.toContain(COATING_GLYPH.acid);
    // SHOCK is electrical_coat's STATUS_META label — the redundant lower chip
    // for THIS qualifying coating is gone too, same as acid in case B.
    const full = textOf(tree.root);
    expect(full).not.toContain('SHOCK');
    expect(full).not.toContain('2t left');
    expect(full).not.toContain('3/turn');
    tree.unmount();
  });

  it('D. infected / typed_dot are not player-applied coatings — no AC glyph for either, AND the lower row STILL shows them (not an information-loss regression)', async () => {
    for (const st of [
      { kind: 'infected', turnsRemaining: 10, dmgPerTurn: 1, sourceName: 'bite' },
      { kind: 'typed_dot', turnsRemaining: 4, dmgPerTurn: 2, sourceName: 'radiation' },
    ] as EnemyStatusView[]) {
      const enemy = foe();
      // eslint-disable-next-line no-await-in-loop
      const tree = await mount([view([st], { enemy })]);
      // eslint-disable-next-line no-await-in-loop
      const row = acValueRow(tree.root, enemy);
      for (const ch of Object.values(COATING_GLYPH)) expect(textOf(row)).not.toContain(ch);
      expect(textOf(tree.root)).toContain(st.kind === 'infected' ? 'INFECTED' : 'DOT');
      tree.unmount();
    }
  });

  it('E. expiration/removal: the same enemy, re-rendered with the status gone, drops the glyph AND leaves no stale lower chip', async () => {
    const enemy = foe();
    const st: EnemyStatusView = { kind: 'poison_coat', turnsRemaining: 1, dmgPerTurn: 2, sourceName: 'blade' };
    let tree!: { unmount(): void; root: TestInstanceLike };
    await renderer.act(() => {
      tree = renderer.create(
        <EnemyPanel enemies={[view([st], { enemy })]} activeIndex={0} onSelectActive={() => {}} />,
      ) as unknown as { unmount(): void; root: TestInstanceLike };
    });
    expect(textOf(acValueRow(tree.root, enemy))).toContain(COATING_GLYPH.poison);
    // No redundant lower chip while the coating is active either.
    expect(textOf(tree.root)).not.toContain('POISON');
    // The status ticked to zero and dropped off the array — the same
    // mechanical removal the existing lower row already relied on.
    await renderer.act(() => {
      tree.unmount();
      tree = renderer.create(
        <EnemyPanel enemies={[view([], { enemy })]} activeIndex={0} onSelectActive={() => {}} />,
      ) as unknown as { unmount(): void; root: TestInstanceLike };
    });
    for (const ch of Object.values(COATING_GLYPH)) {
      expect(textOf(acValueRow(tree.root, enemy))).not.toContain(ch);
    }
    // No stale "POISON" chip left behind by the expiration either.
    expect(textOf(tree.root)).not.toContain('POISON');
    tree.unmount();
  });

  it('F. multiple qualifying effects at once: both glyphs render, compactly, in the SAME AC row, and NEITHER reappears as a redundant lower chip', async () => {
    const enemy = foe();
    const statuses: EnemyStatusView[] = [
      { kind: 'acid_coat', turnsRemaining: 3, dmgPerTurn: 4, sourceName: 'a' },
      { kind: 'poison_coat', turnsRemaining: 2, dmgPerTurn: 2, sourceName: 'b' },
    ];
    const tree = await mount([view(statuses, { enemy })]);
    const row = acValueRow(tree.root, enemy);
    expect(textOf(row)).toContain(COATING_GLYPH.acid);
    expect(textOf(row)).toContain(COATING_GLYPH.poison);
    // Still exactly one AC value row — two enemies' worth of coatings did not
    // produce two AC stats or a second grid.
    const acRows = hosts(tree.root, (n) => {
      const s = flat(n.props.style);
      return s.flexDirection === 'row' && s.alignItems === 'center' && s.gap === 3
        && textOf(n).includes(String(enemyAC(enemy)));
    });
    expect(acRows).toHaveLength(1);
    // ⚠⚠ Neither qualifying effect prints its old lower text chip alongside
    // the two glyphs — the duplication the owner caught does not partially
    // survive when more than one coating is active at once.
    const full = textOf(tree.root);
    expect(full).not.toContain('ACID');
    expect(full).not.toContain('POISON');
    tree.unmount();
  });

  it('G. a qualifying coating AND a non-qualifying status together: the glyph covers the coating, the lower chip covers ONLY what the glyph does not', async () => {
    const enemy = foe();
    const statuses: EnemyStatusView[] = [
      { kind: 'acid_coat', turnsRemaining: 3, dmgPerTurn: 4, sourceName: 'a' },
      { kind: 'infected', turnsRemaining: 10, dmgPerTurn: 1, sourceName: 'bite' },
    ];
    const tree = await mount([view(statuses, { enemy })]);
    const row = acValueRow(tree.root, enemy);
    expect(textOf(row)).toContain(COATING_GLYPH.acid);
    const full = textOf(tree.root);
    // The coating's own words are gone from the compact card...
    expect(full).not.toContain('ACID');
    // ...but the status the glyph vocabulary doesn't cover is untouched.
    expect(full).toContain('INFECTED');
    tree.unmount();
  });

  describe('H. the expanded popup (enemyDetailBody) uses the same glyph vocabulary, not generic bullet prose', () => {
    it('a qualifying coating leads its "Active effects" line with the real coating glyph, and the AC line carries the same badge', () => {
      const enemy = foe();
      const v = view(
        [{ kind: 'acid_coat', turnsRemaining: 3, dmgPerTurn: 4, sourceName: 'x' }],
        { enemy },
      );
      const body = enemyDetailBody(v, true);
      // AC line carries the same glyph identity as the compact card.
      const acLine = body.split('\n').find((l) => l.includes('AC '));
      expect(acLine).toBeDefined();
      expect(acLine).toContain(COATING_GLYPH.acid);
      // The "Active effects" line uses the coating glyph as its marker, not a
      // generic bullet — this is the "not beige bullet prose" requirement.
      const effectLine = body.split('\n').find((l) => l.includes('ACID'));
      expect(effectLine).toBeDefined();
      expect(effectLine).toMatch(new RegExp(`^${COATING_GLYPH.acid} ACID`));
      expect(effectLine).not.toMatch(/^· ACID/);
      // The detail the compact card no longer carries is still available HERE.
      expect(effectLine).toContain('4/turn');
      expect(effectLine).toContain('3 turn(s) left');
    });

    it('a non-qualifying status (infected) keeps the plain bullet — it has no glyph identity to lead with', () => {
      const enemy = foe();
      const v = view(
        [{ kind: 'infected', turnsRemaining: 10, dmgPerTurn: 1, sourceName: 'bite' }],
        { enemy },
      );
      const body = enemyDetailBody(v, true);
      const acLine = body.split('\n').find((l) => l.includes('AC '));
      expect(acLine).toBeDefined();
      for (const ch of Object.values(COATING_GLYPH)) expect(acLine).not.toContain(ch);
      const effectLine = body.split('\n').find((l) => l.includes('INFECTED'));
      expect(effectLine).toMatch(/^· INFECTED/);
    });

    it('no active statuses: AC line carries no glyph, no "Active effects" section at all', () => {
      const enemy = foe();
      const v = view([], { enemy });
      const body = enemyDetailBody(v, true);
      const acLine = body.split('\n').find((l) => l.includes('AC '));
      expect(acLine).toBeDefined();
      for (const ch of Object.values(COATING_GLYPH)) expect(acLine).not.toContain(ch);
      expect(body).not.toContain('Active effects:');
    });
  });
});
