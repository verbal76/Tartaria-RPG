// QOL #220 — FINAL OWNER CONTRACT: DEVELOPED TARTARIA GLYPHS + COMPACT EFFECT
// STATUS + EXPANDED ENEMY PRESENTATION.
//
// History, briefly (each earlier pass is superseded by this one where they
// conflict — see the file headers of the commits that introduced them):
//   1. The original #220 regression (qol220EnemyEffectStaysOnTheCard.test.ts)
//      string-matched source and never rendered the card.
//   2. The first follow-up added a small Unicode/emoji glyph beside AC
//      (qualifyingCoatingBadges → COATING_GLYPH), but left the old
//      `ACID 3t left · 4/turn` text chip rendering underneath it too.
//   3. The correction retired that redundant chip for qualifying statuses —
//      but the glyph itself was STILL the wrong thing: a generic Unicode
//      character, not the developed Tartaria artwork already live elsewhere
//      in the game (Lore ▸ Glyphs, the combat weapon buttons), and nothing
//      showed the effect's CURRENT magnitude/duration under the glyph.
//   4. THIS FILE — the final contract. The compact card's AC-adjacent area
//      now renders the real `glyphArt()` PNG for each of the six governed
//      coating families, with its LIVE magnitude+duration centered directly
//      beneath, and the expanded popup renders the same identity with full
//      detail. Every case below renders the REAL production door
//      (`EnemyPanel`, `EnemyCard`, `EnemyDetailContent`) via
//      react-test-renderer — nothing here string-matches source for a
//      behavioral claim.
import React from 'react';
import { EnemyPanel, type EnemyView, type EnemyStatusView } from '../app/components/EnemyPanel';
import { glyphArt } from '../app/engine/combatGlyphArt';
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
  findAllByProps(props: Record<string, unknown>): TestInstanceLike[];
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

// The six damage/coating families the owner's final contract governs. No
// generic fallback is permitted for any of these — see the permanent
// invariant test below.
const GOVERNED_KINDS = ['acid', 'burn', 'cold', 'poison', 'corruption', 'electrical'] as const;
type GovernedKind = typeof GOVERNED_KINDS[number];
const STATUS_KIND_FOR: Record<GovernedKind, EnemyStatusView['kind']> = {
  acid: 'acid_coat', burn: 'burn_coat', cold: 'cold_coat',
  poison: 'poison_coat', corruption: 'corruption_coat', electrical: 'electrical_coat',
};
const LABEL_FOR: Record<GovernedKind, string> = {
  acid: 'ACID', burn: 'BURN', cold: 'FROST', poison: 'POISON',
  corruption: 'CORRUPTION', electrical: 'SHOCK',
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
function status(kind: GovernedKind, dmgPerTurn: number, turnsRemaining: number): EnemyStatusView {
  return { kind: STATUS_KIND_FOR[kind], dmgPerTurn, turnsRemaining, sourceName: `${kind} source` };
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

/** Taps the real card (the same TouchableOpacity a player's finger hits) to
 *  open the expanded popup — never a synthetic "open the modal" shortcut. */
async function open(tree: { root: TestInstanceLike }) {
  // `TouchableOpacity` is a composite component, not a host element, so the
  // host-only `hosts()` scan never sees it — `findAllByProps` searches every
  // instance, composite or host, the way react-test-renderer's own docs use
  // it for exactly this purpose.
  const card = tree.root.findAllByProps({ accessibilityRole: 'button' })
    .filter((n) => typeof n.props.onPress === 'function');
  expect(card.length).toBeGreaterThan(0);
  await renderer.act(() => { (card[0]!.props.onPress as () => void)(); });
}

/** The compact card's developed-glyph unit for a given governed kind, or
 *  undefined if it isn't rendered. Located by the real testID the production
 *  component stamps on the Image — the same discovery mechanism the Lore ▸
 *  Glyphs suite (ota1766) already uses for this same asset family. */
function compactGlyph(root: TestInstanceLike, kind: GovernedKind): TestInstanceLike | undefined {
  return root.findAllByProps({ testID: `enemy-effect-glyph-${kind}` })[0];
}
function detailGlyph(root: TestInstanceLike, kind: GovernedKind): TestInstanceLike | undefined {
  return root.findAllByProps({ testID: `enemy-effect-glyph-detail-${kind}` })[0];
}

describe('QOL #220 FINAL — the permanent no-generic-fallback invariant', () => {
  it('every governed family resolves to real, distinct developed artwork — none silently fall back', () => {
    const arts = GOVERNED_KINDS.map((k) => glyphArt(k));
    for (const art of arts) {
      expect(art).toBeTruthy();
    }
    // No two governed families silently share one asset — a real, distinct
    // developed glyph per family, not one recolored generic mark.
    expect(new Set(arts).size).toBe(GOVERNED_KINDS.length);
  });
});

describe('QOL #220 FINAL — compact card, no active effect', () => {
  it('no phantom glyph, no phantom status, for any governed family', async () => {
    const enemy = foe();
    const tree = await mount([view([], { enemy })]);
    for (const k of GOVERNED_KINDS) {
      expect(compactGlyph(tree.root, k)).toBeUndefined();
    }
    // AC renders plainly.
    expect(textOf(tree.root)).toContain(String(enemyAC(enemy)));
    tree.unmount();
  });
});

describe.each(GOVERNED_KINDS)('QOL #220 FINAL — compact card, active %s', (kind) => {
  it('renders the CORRECT developed glyph, no other governed glyph, and its live status underneath', async () => {
    const enemy = foe();
    const st = status(kind, 4, 3);
    const tree = await mount([view([st], { enemy })]);

    const img = compactGlyph(tree.root, kind);
    expect(img).toBeDefined();
    expect(img!.props.source).toBe(glyphArt(kind));
    // No other governed family's glyph rides along.
    for (const other of GOVERNED_KINDS) {
      if (other === kind) continue;
      expect(compactGlyph(tree.root, other)).toBeUndefined();
    }
    // The live magnitude + duration sit directly under the glyph, in the
    // same unit (the glyph's own View parent).
    const unit = img!.parent!;
    expect(textOf(unit)).toContain('4/turn');
    expect(textOf(unit)).toContain('3T');

    // The old redundant lower chip is gone for a qualifying coating, and no
    // generic Unicode/emoji stand-in rides beside the developed artwork.
    const full = textOf(tree.root);
    expect(full).not.toContain(LABEL_FOR[kind]);
    expect(full).not.toContain(COATING_GLYPH[kind]);
    tree.unmount();
  });
});

describe('QOL #220 FINAL — non-coating statuses are untouched', () => {
  it('infected / typed_dot get no developed glyph, and remain visible through the existing lower chip', async () => {
    for (const st of [
      { kind: 'infected', turnsRemaining: 10, dmgPerTurn: 1, sourceName: 'bite' },
      { kind: 'typed_dot', turnsRemaining: 4, dmgPerTurn: 2, sourceName: 'radiation' },
    ] as EnemyStatusView[]) {
      const enemy = foe();
      // eslint-disable-next-line no-await-in-loop
      const tree = await mount([view([st], { enemy })]);
      for (const k of GOVERNED_KINDS) {
        // eslint-disable-next-line no-await-in-loop
        expect(compactGlyph(tree.root, k)).toBeUndefined();
      }
      expect(textOf(tree.root)).toContain(st.kind === 'infected' ? 'INFECTED' : 'DOT');
      tree.unmount();
    }
  });
});

describe('QOL #220 FINAL — multiple qualifying effects at once', () => {
  it('each renders its own correct glyph with its OWN status underneath — values do not cross-associate', async () => {
    const enemy = foe();
    // Deliberately distinct values per effect so a cross-association would
    // be caught: acid's numbers must never appear under poison's glyph.
    const statuses = [status('acid', 4, 3), status('poison', 7, 5)];
    const tree = await mount([view(statuses, { enemy })]);

    const acidImg = compactGlyph(tree.root, 'acid');
    const poisonImg = compactGlyph(tree.root, 'poison');
    expect(acidImg).toBeDefined();
    expect(poisonImg).toBeDefined();
    expect(acidImg!.props.source).toBe(glyphArt('acid'));
    expect(poisonImg!.props.source).toBe(glyphArt('poison'));

    const acidUnit = textOf(acidImg!.parent!);
    const poisonUnit = textOf(poisonImg!.parent!);
    expect(acidUnit).toContain('4/turn');
    expect(acidUnit).toContain('3T');
    expect(acidUnit).not.toContain('7/turn');
    expect(acidUnit).not.toContain('5T');
    expect(poisonUnit).toContain('7/turn');
    expect(poisonUnit).toContain('5T');
    expect(poisonUnit).not.toContain('4/turn');
    expect(poisonUnit).not.toContain('3T');

    // Redundant lower chips stay gone for BOTH, even together.
    const full = textOf(tree.root);
    expect(full).not.toContain('ACID');
    expect(full).not.toContain('POISON');

    // Deterministic order: acid (declared first) precedes poison in the tree.
    const row = hosts(tree.root, (n) => (flat(n.props.style) as { flexWrap?: string }).flexWrap === 'wrap'
      && Array.isArray(n.children) && n.children.length === 2 && textOf(n).includes('4/turn') && textOf(n).includes('7/turn'));
    expect(row.length).toBeGreaterThan(0);
    tree.unmount();
  });

  it('a qualifying coating and a non-qualifying status partition correctly on the same card', async () => {
    const enemy = foe();
    const statuses: EnemyStatusView[] = [
      status('acid', 4, 3),
      { kind: 'infected', turnsRemaining: 10, dmgPerTurn: 1, sourceName: 'bite' },
    ];
    const tree = await mount([view(statuses, { enemy })]);
    expect(compactGlyph(tree.root, 'acid')).toBeDefined();
    const full = textOf(tree.root);
    expect(full).not.toContain('ACID');
    expect(full).toContain('INFECTED');
    tree.unmount();
  });
});

describe('QOL #220 FINAL — effect progression and expiration', () => {
  it('the live status updates as the turns count down, then the glyph AND status vanish together on expiration — other effects remain', async () => {
    const enemy = foe();
    let tree!: { unmount(): void; root: TestInstanceLike };
    await renderer.act(() => {
      tree = renderer.create(
        <EnemyPanel
          enemies={[view([status('acid', 4, 3), status('burn', 2, 6)], { enemy })]}
          activeIndex={0}
          onSelectActive={() => {}}
        />,
      ) as unknown as { unmount(): void; root: TestInstanceLike };
    });
    expect(textOf(compactGlyph(tree.root, 'acid')!.parent!)).toContain('3T');

    // One tick: 3T → 2T, magnitude unchanged.
    await renderer.act(() => {
      tree.unmount();
      tree = renderer.create(
        <EnemyPanel
          enemies={[view([status('acid', 4, 2), status('burn', 2, 6)], { enemy })]}
          activeIndex={0}
          onSelectActive={() => {}}
        />,
      ) as unknown as { unmount(): void; root: TestInstanceLike };
    });
    expect(textOf(compactGlyph(tree.root, 'acid')!.parent!)).toContain('2T');
    expect(textOf(compactGlyph(tree.root, 'acid')!.parent!)).not.toContain('3T');

    // Expiration: acid drops off the array entirely (the real mechanical
    // removal, same one the lower chip has always relied on).
    await renderer.act(() => {
      tree.unmount();
      tree = renderer.create(
        <EnemyPanel
          enemies={[view([status('burn', 2, 6)], { enemy })]}
          activeIndex={0}
          onSelectActive={() => {}}
        />,
      ) as unknown as { unmount(): void; root: TestInstanceLike };
    });
    expect(compactGlyph(tree.root, 'acid')).toBeUndefined();
    expect(textOf(tree.root)).not.toContain('3T');
    expect(textOf(tree.root)).not.toContain('2T');
    // Burn, never expired, is still there — expiring one effect does not
    // disturb another.
    const burnImg = compactGlyph(tree.root, 'burn');
    expect(burnImg).toBeDefined();
    expect(textOf(burnImg!.parent!)).toContain('6T');
    tree.unmount();
  });
});

describe.each(GOVERNED_KINDS)('QOL #220 FINAL — expanded popup, active %s', (kind) => {
  it('shows the same developed glyph identity, the spelled-out name, and the FULL magnitude/duration — no generic substitute', async () => {
    const enemy = foe();
    const st = status(kind, 5, 4);
    const tree = await mount([view([st], { enemy })]);
    await open(tree);

    const img = detailGlyph(tree.root, kind);
    expect(img).toBeDefined();
    expect(img!.props.source).toBe(glyphArt(kind));

    const unit = img!.parent!;
    expect(textOf(unit)).toContain(LABEL_FOR[kind]);
    expect(textOf(unit)).toContain('5 dmg/turn');
    expect(textOf(unit)).toContain('4 turns remaining');
    // No Unicode/emoji stand-in anywhere inside this effect's own unit.
    expect(textOf(unit)).not.toContain(COATING_GLYPH[kind]);
    tree.unmount();
  });
});

describe('QOL #220 FINAL — expanded popup, non-coating and no-effect cases', () => {
  it('a non-qualifying status keeps its plain accent presentation — no glyph identity to lead with', async () => {
    const enemy = foe();
    const tree = await mount([view(
      [{ kind: 'infected', turnsRemaining: 10, dmgPerTurn: 1, sourceName: 'bite' }],
      { enemy },
    )]);
    await open(tree);
    expect(textOf(tree.root)).toContain('INFECTED');
    expect(textOf(tree.root)).toContain('1 dmg/turn');
    expect(textOf(tree.root)).toContain('10 turns remaining');
    for (const k of GOVERNED_KINDS) expect(detailGlyph(tree.root, k)).toBeUndefined();
    tree.unmount();
  });

  it('no active statuses: no "ACTIVE EFFECTS" section at all', async () => {
    const enemy = foe();
    const tree = await mount([view([], { enemy })]);
    await open(tree);
    expect(textOf(tree.root)).not.toContain('ACTIVE EFFECTS');
    tree.unmount();
  });
});

describe('QOL #220 FINAL — the enemy\'s own weapon coating stays a separate presentation', () => {
  it('a player-applied active effect and the enemy\'s OWN coated weapon never get confused, on either card', async () => {
    const enemy = foe({ coating: { kind: 'poison', dice: '1d4' } } as Partial<Enemy>);
    // Deliberately a DIFFERENT family (acid) as the active effect, so any
    // accidental conflation between "enemy's own coating" and "active
    // effect" would be caught immediately.
    const tree = await mount([view([status('acid', 4, 3)], { enemy })]);

    // The active-effect unit is the developed acid artwork.
    expect(compactGlyph(tree.root, 'acid')).toBeDefined();
    // The enemy's own weapon coating still uses its existing, separate,
    // already-accepted OTA-1656 presentation (the Unicode glyph on the
    // subhead type line) — untouched by this contract.
    const subheadColor = hosts(tree.root, (n) => flat(n.props.style).color === COATING_GLYPH_COLOR.poison);
    expect(subheadColor.length).toBeGreaterThan(0);
    expect(textOf(tree.root)).toContain(COATING_GLYPH.poison);

    await open(tree);
    expect(textOf(tree.root)).toContain('Coated blade');
    expect(detailGlyph(tree.root, 'acid')).toBeDefined();
    tree.unmount();
  });
});

describe('QOL #220 FINAL — unknown information stays undisclosed in the expanded card', () => {
  it('a non-boss, unread enemy does not reveal RESIST/WEAK just because the card expanded', async () => {
    // arb220 raider — a type/trait combination that carries a real
    // resistance/weakness per `defensesFor`, per the existing WIS-gate suite
    // (ota1655) convention, so the gate has something to actually withhold.
    const enemy = foe({ type: 'Undead', traits: ['resist:slashing'] } as Partial<Enemy>);
    const tree = await mount([view([], { enemy, currentHp: 10 })]);
    await open(tree);
    const full = textOf(tree.root);
    // The expanded card's defence block deliberately mirrors the COMPACT
    // card's own gated phrasing ("DEF ? — strike to learn"), not
    // `enemyDetailBody`'s longer diegetic sentence — that string function is
    // no longer what renders (see EnemyPanel.tsx's own header note on it),
    // so the real, gated, on-screen refusal is this one.
    expect(full).toContain('DEF ?');
    expect(full).toContain('strike to learn');
    expect(full).not.toMatch(/RESIST[A-Z ]*Slashing/i);
    tree.unmount();
  });
});

describe('QOL #220 FINAL — expand/close is presentation only', () => {
  it('closing the popup and reopening it never mutates the statuses it reads', async () => {
    const enemy = foe();
    const statuses = [status('acid', 4, 3)];
    const tree = await mount([view(statuses, { enemy })]);
    await open(tree);
    expect(detailGlyph(tree.root, 'acid')).toBeDefined();

    const closeBtn = tree.root.findAllByProps({ accessibilityRole: 'button' })
      .filter((n) => typeof n.props.onPress === 'function' && textOf(n).toUpperCase().includes('CLOSE'));
    expect(closeBtn.length).toBeGreaterThan(0);
    await renderer.act(() => { (closeBtn[0]!.props.onPress as () => void)(); });
    expect(detailGlyph(tree.root, 'acid')).toBeUndefined();
    // The underlying status array (the only thing this component reads) is
    // the exact same object — untouched by opening/closing the popup.
    expect(statuses).toEqual([status('acid', 4, 3)]);

    await open(tree);
    expect(detailGlyph(tree.root, 'acid')).toBeDefined();
    const unitText = textOf(detailGlyph(tree.root, 'acid')!.parent!);
    expect(unitText).toContain('4 dmg/turn');
    expect(unitText).toContain('3 turns remaining');
    tree.unmount();
  });
});

// ⚠⚠⚠ QOL #220 FINAL PHYSICAL LAYOUT CORRECTION. Owner, from the live Golem
// physical screenshot: content/behavior above were already correct, but the
// developed-glyph unit was landing as its OWN row underneath the whole
// HP/AC/ATK/DMG grid, pushing WEAK/DEALS/STRIKES downward whenever an effect
// was active. react-test-renderer has no real layout engine — there is no
// pixel height or on-screen position to read — so what these cases prove
// instead is the one structural fact that actually DETERMINES that height:
// whether the stat grid and the effect column are two SIBLINGS inside one
// shared row (`enemy-stat-row`), with `defs` (WEAK/DEF/RESIST/DEALS/STRIKES,
// `enemy-defs`) landing as that ONE row's very next sibling — or whether the
// effect column is instead a standalone row wedged between them, which is
// exactly the defect the owner's screenshot showed.
describe('QOL #220 FINAL PHYSICAL LAYOUT CORRECTION — the effect unit sits beside AC, not below the whole stat block', () => {
  function defsOf(root: TestInstanceLike): TestInstanceLike {
    const found = root.findAllByProps({ testID: 'enemy-defs' })[0];
    expect(found).toBeDefined();
    return found!;
  }
  /** Walks `.parent` all the way to the root asking whether ANY ancestor
   *  carries the given testID — deliberately hop-count-agnostic. React
   *  Native's host components add composite/host wrapper instances per JSX
   *  element that a fixed number of `.parent` hops silently miscounts (a
   *  `<View>` is not always exactly one hop); membership in a region is
   *  what the owner's contract actually asks about, not a specific fiber
   *  depth. Booleans in, boolean out — never a bare `expect(TestInstance
   *  A).toBe(TestInstance B)`, whose failure diff would otherwise force
   *  Jest to pretty-print two large fiber-backed object graphs. */
  function isDescendantOf(node: TestInstanceLike | null | undefined, testID: string): boolean {
    let n: TestInstanceLike | null = node ?? null;
    while (n) {
      if ((n.props as { testID?: unknown } | undefined)?.testID === testID) return true;
      n = n.parent;
    }
    return false;
  }

  it('A — NO EFFECT: no phantom effect region, no governed glyph anywhere', async () => {
    const tree = await mount([view([], { enemy: foe() })]);
    expect(tree.root.findAllByProps({ testID: 'enemy-stat-row' }).length).toBeGreaterThan(0);
    for (const k of GOVERNED_KINDS) expect(compactGlyph(tree.root, k)).toBeUndefined();
    tree.unmount();
  });

  it('B — ONE ACID EFFECT: the developed glyph unit lives INSIDE the AC-side stat row — not in a standalone row of its own between the stat block and defs', async () => {
    const tree = await mount([view([status('acid', 4, 3)], { enemy: foe() })]);
    const img = compactGlyph(tree.root, 'acid')!;
    expect(img).toBeDefined();
    // This is the exact fact the owner's screenshot showed as broken: the
    // glyph was a SIBLING after the stat row, not a part of it.
    expect(isDescendantOf(img, 'enemy-stat-row')).toBe(true);
    // `defs` (WEAK/DEF/RESIST/DEALS/STRIKES) is never itself swallowed into
    // that same stat region — it stays the next block, not part of it.
    expect(isDescendantOf(defsOf(tree.root), 'enemy-stat-row')).toBe(false);
    tree.unmount();
  });

  it('C — ONE OTHER EFFECT: the same geometry, its own developed glyph', async () => {
    const tree = await mount([view([status('cold', 3, 2)], { enemy: foe() })]);
    const img = compactGlyph(tree.root, 'cold')!;
    expect(img).toBeDefined();
    expect(isDescendantOf(img, 'enemy-stat-row')).toBe(true);
    tree.unmount();
  });

  it('D — MULTIPLE EFFECTS: both units live in the AC-side region together, correctly associated, no redundant lower chip', async () => {
    const tree = await mount([view([status('acid', 4, 3), status('poison', 7, 5)], { enemy: foe() })]);
    const acidImg = compactGlyph(tree.root, 'acid')!;
    const poisonImg = compactGlyph(tree.root, 'poison')!;
    expect(isDescendantOf(acidImg, 'enemy-stat-row')).toBe(true);
    expect(isDescendantOf(poisonImg, 'enemy-stat-row')).toBe(true);
    const full = textOf(tree.root);
    expect(full).not.toContain('ACID');
    expect(full).not.toContain('POISON');
    tree.unmount();
  });

  it('E — EXPIRATION: the unit disappears; no leftover effect region remains', async () => {
    const enemy = foe();
    const before = await mount([view([status('acid', 4, 1)], { enemy })]);
    expect(isDescendantOf(compactGlyph(before.root, 'acid'), 'enemy-stat-row')).toBe(true);
    before.unmount();

    const after = await mount([view([], { enemy })]);
    for (const k of GOVERNED_KINDS) expect(compactGlyph(after.root, k)).toBeUndefined();
    expect(isDescendantOf(defsOf(after.root), 'enemy-stat-row')).toBe(false);
    after.unmount();
  });

  it('F — HEIGHT/POSITION CONTRACT: one qualifying effect places its unit inside the AC-side stat region, and never pulls defs into that region — with or without the effect present, the shape is the same', async () => {
    const enemy = foe();
    const noEffect = await mount([view([], { enemy })]);
    const withEffect = await mount([view([status('burn', 2, 4)], { enemy })]);

    // `defs` never becomes part of the stat region, whether or not an
    // effect is active — the primary acceptance invariant, stated
    // structurally: adding one qualifying effect changes what the stat
    // region CONTAINS, never how many regions sit between the stats and
    // the defenses.
    expect(isDescendantOf(defsOf(noEffect.root), 'enemy-stat-row')).toBe(false);
    expect(isDescendantOf(defsOf(withEffect.root), 'enemy-stat-row')).toBe(false);
    // And the one effect that IS present lands inside that region, not
    // wedged between it and `defs` as its own row.
    expect(isDescendantOf(compactGlyph(withEffect.root, 'burn'), 'enemy-stat-row')).toBe(true);

    noEffect.unmount();
    withEffect.unmount();
  });
});
