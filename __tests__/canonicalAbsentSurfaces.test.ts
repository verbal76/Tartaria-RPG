// P5 proof — confirmed-absent design surfaces are never invented or written
// by the instrumentation.
//
// Grounds the claim in production reality first (not assumption): greps the
// production source (excluding this canonical package and __tests__) for
// 'encumbrance' — every hit is a comment DENYING the system exists
// (app/engine/inventory.ts:3 "no weight / slot / encumbrance system";
// app/buildInfo.ts "The pack has no encumbrance by design") — and for
// 'hunger', where a real mechanic once existed but is now retired
// (app/engine/types.ts:1390-1399: "Hunger was a real mechanic once... In the
// game as it stands, EATING IS FOR HP AND STAMINA — there is no hunger to
// lower", with only a legacy save-compat field, hungerStaminaPenalty,
// remaining — never written by current gameplay).
//
// Then proves NONE of the P1-P6 canonical/ instrumentation files invent an
// encumbrance reading, or write/surface a live hunger value — telemetry
// observes what production has, it does not add mechanics production
// dropped or never had.
//
// Run focused: npx jest __tests__/canonicalAbsentSurfaces.test.ts

import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const CANONICAL_DIR = resolve(__dirname, '../test-utils/canonical');

function canonicalFiles(): string[] {
  return readdirSync(CANONICAL_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => resolve(CANONICAL_DIR, f));
}

describe('P5 proof — confirmed-absent design surfaces (grounded in production text)', () => {
  it('production denies an encumbrance system exists (grounding, not assumption)', () => {
    const inv = readFileSync(resolve(__dirname, '../app/engine/inventory.ts'), 'utf8');
    expect(inv).toMatch(/no weight \/ slot \/ encumbrance system/);
  });

  it('production states hunger is retired — no live hunger mechanic remains', () => {
    const types = readFileSync(resolve(__dirname, '../app/engine/types.ts'), 'utf8');
    expect(types).toMatch(/there is no hunger to lower/i);
  });

  it('no file under test-utils/canonical/ invents an "encumbrance" reading anywhere', () => {
    for (const file of canonicalFiles()) {
      const source = readFileSync(file, 'utf8').toLowerCase();
      expect(source.includes('encumbrance')).toBe(false);
    }
  });

  it('no file under test-utils/canonical/ surfaces a live "hunger" field on PlayerView or any telemetry channel', () => {
    for (const file of canonicalFiles()) {
      const source = readFileSync(file, 'utf8').toLowerCase();
      // 'hunger' itself must not appear at all — this package never reads or
      // reports the dead hungerStaminaPenalty field, let alone invents a new
      // live hunger reading.
      expect(source.includes('hunger')).toBe(false);
    }
  });

  it('none of the canonical/ files call a store write (set/setState) at all — pure observers, so they structurally cannot invent a written field of any kind', () => {
    for (const file of canonicalFiles()) {
      const source = readFileSync(file, 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/\.setState\(/);
      expect(code).not.toMatch(/useGameStore\.setState/);
    }
  });
});
