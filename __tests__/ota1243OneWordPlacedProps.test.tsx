jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ⚠⚠ OTA-1243 — ONE WORD FOR THE BREAKDOWN VERB, AND THE DOG QUEST GETS ITS PROPS.
//
// Owner: *"do 1 and 2, use salvage as the word on golem only."*
//
// (1) SALVAGE wins. He had already made the diagnosis himself: *"in my mind
// salvage and scrap are kind of the right same thing."* The game used SCRAP for
// the inventory breakdown and SALVAGE for the room verb — and the loot picker was
// the worst offender, a lane HEADED "SCRAP" over a button reading "SALVAGE ALL".
// Two words for one concept inside a single card.
//
// (2) The rescue props are PLACED, not hoped for. `RESCUE_SCENARIOS.archetypes`
// existed since OTA-120 and NOTHING consumed it; the OTA-1241 census showed the
// quest riding on vocabulary accidents (cellar reachable only via `hatch`, snare
// only via `trap`). And the archetype words themselves were written against an
// imagined world: measured, `wagon` and `snare` matched ZERO locations, because
// 'road', 'camp' and 'wilderness' are not tags any location carries.
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create(el: React.ReactElement): { toJSON(): unknown };
};

// ⚠⚠ OTA-1449 — CLOSE WHAT YOU OPEN. This suite mounted a screen and never
// unmounted it. The screens carry LOOPING animations (the tutorial highlight,
// the map's "you are here" ring), and a loop whose component is still mounted
// keeps ticking after the test file finishes — straight into jest tearing the
// module registry down under it. The tick then reaches freed internals and
// kills the worker, which ends the run with NO SUMMARY LINE AT ALL: no pass
// count, no fail count, nothing to notice. A test system that can die silently
// is the same defect this project spent OTA-1447 removing from its source pins.
//
// ⚠ The app itself was never at risk: every looping animation in app/ cancels
// itself in its unmount cleanup, and screens unmount normally in play. This is
// test hygiene, and it is why a dozen sibling suites already call unmount().
const _mounted: Array<{ unmount(): void }> = [];
// ⚠ Typed as the renderer's OWN create, so callers keep `.toJSON()` / `.root`
// exactly as before — the tracking is invisible to every existing assertion.
const trackedCreate = ((el: Parameters<typeof renderer.create>[0]) => {
  const tree = renderer.create(el);
  _mounted.push(tree as unknown as { unmount(): void });
  return tree;
}) as typeof renderer.create;
afterEach(() => {
  const roots = _mounted.splice(0);
  (renderer as unknown as { act(cb: () => void): void }).act(() => {
    for (const r of roots) { try { r.unmount(); } catch { /* already gone */ } }
  });
});
import { GatherModal } from '../app/components/GatherModal';
import { RESCUE_SCENARIOS } from '../app/engine/dogCompanion';
import { hasSalvageYield } from '../app/engine/salvagePools';
import { readFileSync } from 'fs';
import { join } from 'path';
import { blockAt } from '../test-utils/srcBlock';

const src = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8');

function renderRoom(chips: { noun: string }[]) {
  const tree = trackedCreate(
    <GatherModal
      visible player={null} chips={chips} leadNouns={[]}
      onTake={() => {}} onSalvage={() => {}} onTakeAll={() => {}} onSalvageAll={() => {}}
      onInvestigate={() => {}} onCancel={() => {}}
    />,
  );
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (typeof n === 'string') { out.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const node = n as { children?: unknown[] } | null;
    if (node && node.children) node.children.forEach(walk);
  };
  walk(tree.toJSON());
  return out.join('|');
}

describe('OTA-1243 — one word: SALVAGE', () => {
  it('⚠⚠ RENDERED: the lane heading and its button finally agree', () => {
    const text = renderRoom([{ noun: 'bench' }, { noun: 'banner' }]);
    expect(text).toContain('SALVAGE');
    expect(text).toContain('⚒ SALVAGE ALL (2)');
    // The word SCRAP appears NOWHERE a player can read it in this card — not the
    // heading, not the row tails.
    expect(text).not.toMatch(/SCRAP/i);
  });

  it('⚠⚠ the inventory breakdown verb says Salvage on every face it wears', () => {
    // Single button, stack button, batch button, stepper, group action, a11y.
    const inv = src('app', 'screens', 'InventoryScreen.tsx');
    expect(inv).toContain(": 'Salvage',");
    expect(inv).toContain('`Salvage All (${stack})`');
    expect(inv).toContain('SALVAGE {scrappable.length}');
    expect(inv).toContain("'Salvage how many?'");
    // No RENDERED label says Scrap. Code identifiers (canScrap, doScrap,
    // scrapQty) are not player-facing and stay — banning the letters outright
    // would force the internals to churn for zero player benefit.
    expect(inv).not.toContain("label: stack > 1 ? `Scrap");
    expect(inv).not.toContain('>SCRAP {');
  });

  it('⚠ the copy that points at the lane points at the word that is on it', () => {
    const steps = src('app', 'components', 'tutorialSteps.ts');
    // ⚠ OTA-1245 trimmed "group" from this line: the beat narrows the picker to
    // ONE prop, so there is no group on screen to point at. The RULE this test
    // guards is unchanged and is what is asserted — the copy names the word that
    // is actually on the lane heading, and that word is SALVAGE.
    expect(steps).toContain('yellow SALVAGE');
    expect(steps).not.toContain('SCRAP group');
    expect(steps).not.toContain('yellow SCRAP');
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain('under SALVAGE.');
    const port = src('app', 'engine', 'portability.ts');
    expect(port).toContain('under SALVAGE if you want pieces of it');
    expect(port).not.toContain('under SCRAP');
  });

  it('⚠ a player who still TYPES scrap is not refused — display one word, accept both', () => {
    const parser = src('app', 'engine', 'parser.ts');
    const i = parser.indexOf('investigate: [');
    const block = parser.slice(i, parser.indexOf('],', i));
    expect(block).toContain("'salvage', 'scrap', 'strip', 'pry'");
  });

  it('⚠ item NAMES keep their identity — Scrap Metal is a noun, not the verb', () => {
    // The sweep must never touch catalog names; renaming an item a save already
    // holds is a migration, not a copy edit.
    const pools = src('app', 'engine', 'salvagePools.ts');
    expect(pools).toContain("'Scrap Metal'");
  });
});

describe('OTA-1243 — the rescue props are placed, not hoped for', () => {
  /** The locations the world actually ships, with their tags. */
  function locations(): Array<{ tags?: string[] }> {
    const raw = JSON.parse(src('app', 'data', 'locations', 'locations.json')) as unknown;
    return (Array.isArray(raw) ? raw : (raw as { locations?: unknown[] }).locations ?? []) as Array<{ tags?: string[] }>;
  }

  it('⚠⚠ EVERY scenario has eligible ground — measured against the shipped tags', () => {
    // ⚠ THE BUG THIS PINS: the original archetype lists were written against an
    // imagined world. 'road', 'camp' and 'wilderness' are not tags any location
    // carries, so `wagon` and `snare` had ZERO eligible locations — the field
    // could have been wired up perfectly and still spawned nothing.
    const locs = locations();
    for (const [id, sc] of Object.entries(RESCUE_SCENARIOS)) {
      const ars = sc.archetypes.map((a) => a.toLowerCase());
      const eligible = locs.filter((l) =>
        (l.tags ?? []).some((t) => ars.includes(String(t).toLowerCase())));
      // At least a handful each — one location would make a quest a pixel hunt.
      expect({ id, n: eligible.length }.n).toBeGreaterThanOrEqual(5);
    }
  });

  it('⚠⚠ the injection exists, and it is gated on the same conditions the rescue checks', () => {
    // `archetypes` sat unread since OTA-120. The injection consumes it at scene
    // build: no dog, no onboarding pending, not a hub interior — the exact
    // conditions under which engaging the prop can actually fire the rescue.
    const store = src('app', 'state', 'gameStore.ts');
    const i = store.indexOf('const rescuePropNouns: string[] =');
    expect(i).toBeGreaterThan(-1);
    const block = blockAt(store, 'const rescuePropNouns: string[] =');
    expect(block).toContain('hubRoomId');
    expect(block).toContain('player?.dog');
    expect(block).toContain('pendingDogOnboarding');
    expect(block).toContain('archetypes.some');
    // Seeded per tile, like the water sources — stable, not farmable.
    expect(block).toContain('dog-prop:${candidateKey}');
    // The scenario's OWN primary prop — the noun its intro was written around.
    expect(block).toContain('sc.hookNouns[0]');
  });

  it('⚠⚠ ...and the prop is GUARANTEED a display slot — a hook the cap drops does not exist', () => {
    const store = src('app', 'state', 'gameStore.ts');
    expect(store).toContain('if (rescuePropNouns.length > 0) {');
    const i = store.indexOf('if (rescuePropNouns.length > 0) {');
    expect(blockAt(store, 'if (rescuePropNouns.length > 0) {')).toContain('displayedAmbientNouns = Array.from(new Set([...rescuePropNouns,');
  });

  it('⚠ every primary prop is salvageable AFTER the quest — no post-quest dead noun', () => {
    // Once the dog is rescued, a prop cached into a visited tile becomes an
    // ordinary noun. The owner's census rule applies to it like anything else:
    // if you cannot take it, you can salvage it.
    for (const sc of Object.values(RESCUE_SCENARIOS)) {
      expect(hasSalvageYield(sc.hookNouns[0]!)).toBe(true);
    }
  });
});
