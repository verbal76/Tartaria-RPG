#!/usr/bin/env node
/**
 * OTA-1785 — THE KIT EXPORT BUDGET, AND THERE IS NOW EXACTLY ONE OF IT.
 *
 * Tier 0's rule, from the rollout: a kit is a small set of primitives, not a
 * junk drawer. Raising the COMPONENT budget "needs a brief that asks for a SHAPE
 * the existing ones cannot make"; a HELPER exists only where something VARIES —
 * which is why `TSheet` added zero exports (neither of its shapes varied) and
 * `tMomentCard` earned one (its rim is a parameter, because MissionComplete rims
 * in the success green).
 *
 * ⚠⚠⚠ IT WAS WRITTEN DOWN TWICE AND THAT ALREADY COST A RUN. `ota1742` and
 * `ota1769` both carried the ceiling. OTA-1777 raised one and left the other; a
 * full surface caught it, a single-suite run never would have. The suite that
 * found it recorded the lesson and deliberately did NOT deduplicate, because the
 * pass was already moving the number — the right call then, and this is the
 * follow-through.
 *
 * ⚠ TWO OF THE THREE NUMBERS ARE THE SAME CLAIM, AND ONE IS NOT. Both suites
 * bound components and helpers. Only `ota1742` bounds the TOTAL, which is a
 * third thing: it is what stops the two budgets being traded against each other.
 * All three live here now.
 *
 * ⚠ AND IT IS A GATE, so a kit that has quietly grown a fourteenth component
 * fails in milliseconds instead of fourteen minutes.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KIT = 'app/ui/tartariaKit.tsx';

/** ⚠ A COMPONENT is an exported FUNCTION with a `T`-prefixed name. The kind
 *  matters: `TType` is a StyleSheet and would be miscounted as a component by
 *  its name alone. */
export const COMPONENTS = 13;
/** Tokens, the type scale, the constants, the stylesheet, and the `t*` style
 *  helpers. Tighter than the single number was: the drawer can no longer fill
 *  with helpers while the component count sits still.
 *    6 → 7  OTA-1765  tModalCard
 *    7 → 8  OTA-1777  tMomentCard   (the rim is a parameter)
 *    8 → 9  OTA-1782  tControlDepth (the pressed state is a parameter) */
export const HELPERS = 9;
/** The total, which is the thing that stops the two budgets being traded. */
export const TOTAL = 22;

export function countExports(src) {
  const decls = [...src.matchAll(/^export (function|const) (\w+)/gm)];
  const components = decls.filter((m) => m[1] === 'function' && /^T[A-Z]/.test(m[2]));
  const helpers = decls.filter((m) => !(m[1] === 'function' && /^T[A-Z]/.test(m[2])));
  return { components: components.map((m) => m[2]), helpers: helpers.map((m) => m[2]), total: decls.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const src = fs.readFileSync(path.join(ROOT, KIT), 'utf8');
  const c = countExports(src);
  const over = [];
  if (c.components.length > COMPONENTS) over.push(`components ${c.components.length} > ${COMPONENTS}`);
  if (c.helpers.length > HELPERS) over.push(`helpers ${c.helpers.length} > ${HELPERS}`);
  if (c.total > TOTAL) over.push(`total ${c.total} > ${TOTAL}`);
  if (over.length) {
    console.error(`[check:kitexports] FAIL — ${KIT} is over budget: ${over.join(', ')}.`);
    console.error('');
    console.error('A COMPONENT needs a brief asking for a SHAPE the existing ones cannot make.');
    console.error('A HELPER exists only where something VARIES — a constant that never varies');
    console.error('is a stylesheet entry, not an export. Raising a budget is an owner decision.');
    console.error('');
    console.error(`  components: ${c.components.join(', ')}`);
    console.error(`  helpers:    ${c.helpers.join(', ')}`);
    process.exit(1);
  }
  console.log(`[check:kitexports] OK — ${c.components.length}/${COMPONENTS} components,`
    + ` ${c.helpers.length}/${HELPERS} helpers, ${c.total}/${TOTAL} exports`);
}
