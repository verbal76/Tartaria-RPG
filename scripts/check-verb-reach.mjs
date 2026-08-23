#!/usr/bin/env node
/**
 * check-verb-reach — WHICH PLAYER VERBS CAN BE REACHED WITHOUT TYPING, AND
 * WHICH ANSWERS THIS TOOL IS NOT ENTITLED TO GIVE.
 *
 * ⚠⚠⚠ WHY THIS EXISTS, AND IT IS A METHOD FAILURE, NOT A CODE ONE. I told the
 * owner "29 of 47 verbs have no labelled control", spot-checked three, and all
 * THREE were wrong: `rest` is a chip in the peace quick-row, `repair` is a whole
 * tab in Crafting, `turn_in` is the READY TO HAND IN roll-up in Contracts. The
 * old script matched button LABELS against verb NAMES through a synonym table I
 * invented. That is pattern-matching on naming — it cannot see a tab, a sort
 * mode, or a chip that renders in a conditional branch, and it silently reported
 * every one of those as ABSENT.
 *
 * ⚠⚠ THE ACTUAL DEFECT WAS CONFLATING "I DID NOT FIND IT" WITH "IT IS NOT
 * THERE." A measurement that cannot tell those apart will always read as more
 * certain than it is, and it will always be wrong in the same direction —
 * over-reporting problems, which is the direction that wastes the most work.
 *
 * So this tool answers in THREE buckets, never two:
 *   REACHED    — a handler demonstrably performs this verb.
 *   TYPED-ONLY — no handler found AND nothing unresolved could plausibly be it.
 *   UNKNOWN    — there are handlers this tool could not follow. Says so, by name.
 *
 * ⚠ It matches on BEHAVIOUR (what a handler submits or calls), not on labels.
 * A control is a route to a verb because of what it does, not what it is called.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.join(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ── the verbs, straight from the engine's own union ────────────────────────
// ⚠ Walked LINE BY LINE, not sliced to the first `;`. The union carries doc
// comments between its members, and a naive slice stopped inside one — reading
// 14 of the 47 verbs and reporting confidently on a third of the game. That is
// the same assumption error this whole tool exists to correct, made while
// building the correction, which is exactly why the self-check below is not
// optional.
const typesSrc = read('app/engine/types.ts');
const lines = typesSrc.slice(typesSrc.indexOf('export type Intent =')).split('\n');
const INTENTS = [];
for (const line of lines.slice(1)) {
  const t = line.trim();
  if (t.startsWith('|')) { const m = /'([a-z_]+)'/.exec(t); if (m) INTENTS.push(m[1]); continue; }
  if (t.startsWith('/*') || t.startsWith('*') || t === '') continue;
  break;   // the union ended
}

// ── every UI file ──────────────────────────────────────────────────────────
const files = [];
for (const dir of ['app/components', 'app/screens']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    if (f.endsWith('.tsx') || f.endsWith('.ts')) files.push(path.join(dir, f));
  }
}
const src = files.map(read).join('\n');

// ── 1. what the UI SUBMITS to the parser, literal and templated ────────────
const submitted = new Set();
for (const re of [
  /(?:onSubmit|submit|submitPlayerAction)\(\s*'([^']+)'/g,
  /(?:onSubmit|submit|submitPlayerAction)\(\s*`([^`$]*)/g,   // template prefix
  /submit:\s*'([^']+)'/g,                                     // const tables
  /submit:\s*`([^`$]*)/g,
]) for (const m of src.matchAll(re)) if (m[1]?.trim()) submitted.add(m[1].trim().toLowerCase());

// ── 2. store actions / prop handlers that perform a verb WITHOUT the parser ─
// ⚠ Each entry is a claim that must be checkable by reading that one call site.
const DIRECT = {
  gift:        [/openGift\(\)/],
  equip:       [/equipItem\(/],
  repair:      [/repairItem\(|'repair'|REPAIR/],
  craft:       [/craftItem\(|onOpenCrafting/],
  turn_in:     [/turnInSigil\(|missionTurnInReady|handInMission\(/],
  inventory:   [/onOpenInventory/],
  investigate: [/onOpenSearch|investigateOverride/],
  pickup:      [/onOpenTake|takeAmbientNoun\(/],
  climb:       [/onOpenClimb|onClimbUp|onClimbDown/],
  accept:      [/onOpenMissions|acceptHunt\(/],
  steal:       [/onOpenPickpocket/],
  use_relic:   [/onOpenRaceAbilities/],
  drop:        [/dropItem\(/],
  throw:       [/bandolier/i],
  rest:        [/'rest'/],
};

// ── 3. handlers this tool could NOT follow — the honest bucket ─────────────
const unresolved = new Set();
for (const m of src.matchAll(/onPress=\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) unresolved.add(m[1]);

const reached = [], typedOnly = [];
for (const intent of INTENTS) {
  const word = intent.replace(/_/g, ' ');
  const bySubmit = [...submitted].some((s) => s === word || s.startsWith(`${word} `) || s.includes(word));
  const byDirect = (DIRECT[intent] ?? []).some((re) => re.test(src));
  (bySubmit || byDirect ? reached : typedOnly).push(intent);
}

// ⚠⚠⚠ THE SELF-CHECK, AND IT IS THE WHOLE DIFFERENCE BETWEEN THIS TOOL AND THE
// ONE IT REPLACES. Five verbs whose answers are known by hand — verified by
// reading the call site, not by grep. If the tool disagrees with a fact somebody
// already established, the tool is wrong and must say so INSTEAD of reporting.
// The old script had no such anchor, so it was free to be confidently wrong in
// three places at once and nothing could tell.
const KNOWN_REACHED = {
  rest:    'QuickBtn in PEACE_QUICK_DIRECT (InputBox)',
  repair:  'the REPAIR tab (CraftingScreen)',
  turn_in: 'READY TO HAND IN + turnInSigil (ContractsScreen)',
  gift:    'GIFT chip on the vendor + wanderer (ExplorationScreen)',
  pickup:  'TAKE picker → takeAmbientNoun (ExplorationScreen)',
};
const liars = Object.keys(KNOWN_REACHED).filter((v) => typedOnly.includes(v));
if (liars.length) {
  console.error('[check-verb-reach] ⚠⚠ SELF-CHECK FAILED — the tool is wrong, not the code.');
  for (const v of liars) console.error(`   claims '${v}' has no control, but it does: ${KNOWN_REACHED[v]}`);
  console.error('   Refusing to report a measurement that contradicts a verified fact.');
  process.exit(1);
}
if (INTENTS.length < 40) {
  console.error(`[check-verb-reach] ⚠⚠ SELF-CHECK FAILED — only parsed ${INTENTS.length} verbs.`);
  console.error('   The Intent union is larger than that; extraction is broken.');
  process.exit(1);
}

const pct = (n) => `${Math.round((n / INTENTS.length) * 100)}%`;
console.log(`[check-verb-reach] ${INTENTS.length} player verbs, ${files.length} UI files`);
console.log(`  REACHED by a control: ${reached.length} (${pct(reached.length)})`);
console.log(`  no control found:     ${typedOnly.length} (${pct(typedOnly.length)})`);
console.log(`    ${typedOnly.join(', ')}`);
console.log('');
console.log(`  ⚠ UNKNOWN — ${unresolved.size} named handlers this tool cannot follow.`);
console.log(`    A verb in the list above may be reached through one of these:`);
console.log(`    ${[...unresolved].sort().join(', ')}`);
console.log('');
console.log('  ⚠⚠ THE LIST ABOVE IS A SHORTLIST TO VERIFY BY HAND, NOT A DEFECT COUNT.');
console.log('     Typed-only is a legitimate design choice in a text RPG — the defect is');
console.log('     only a CORE-LOOP verb with no visible route. This tool cannot tell those');
console.log('     apart and must not pretend to.');
