#!/usr/bin/env node
/**
 * OTA-1757 — THE GOLD RATCHET.
 *
 * Owner, on the interface rollout: *"Gold remains reserved for the interface
 * meaning already defined. HP, danger, rarity, positive/negative results,
 * faction identity, etc. may retain meaningful semantic color."*
 *
 * VIS-3 established the rule this gate defends: gold marks a LIVE OBLIGATION or
 * a LIVE PROCESS, and nothing else. That rule held for exactly as long as
 * somebody remembered it. This turns it into a number that cannot grow.
 *
 * ⚠⚠ WHY THIS GATE COULD NOT HAVE BEEN WRITTEN BEFORE `ui/semanticColor`.
 * `#c9a86a` is doing four jobs at once — the interface accent, the `Common`
 * rarity, the `material` category, and the middle band of the HP/stamina ramp.
 * Three of the four are semantic and the owner has said to keep them. So a bare
 * count of the hex is a number that cannot legitimately fall, and a gate built
 * on it would either block correct work or be ignored. The split below is the
 * whole point: SEMANTIC uses are declared in a named authority and are exempt;
 * everything else is INTERFACE gold and ratchets down as the rollout proceeds.
 *
 * ⚠ THE BASELINE IS THE MEASURED COUNT AT GATE BIRTH, with no headroom — the
 * same discipline as `check:quotedpins`. New interface gold must displace old
 * interface gold. Lower it as screens are converted; never raise it without an
 * owner decision, and never "fix" a failure by moving a literal into the
 * semantic authority unless it genuinely means something.
 *
 * ⚠⚠ WHAT THIS GATE CANNOT SEE, SAID PLAINLY (the OTA-1455 lesson — a silent
 * partial scan reads as a full one):
 *   · gold written as `rgb()`, `rgba()`, or with a different case-normalised
 *     spelling than the six hex digits;
 *   · gold reached through a variable, a theme lookup or a template string;
 *   · gold inside an asset (the crests and the masthead are images);
 *   · whether a given declaration is actually VISIBLE — a styled rule on a
 *     component nobody renders still counts.
 * It counts declarations, which is a proxy for bespoke styling and not a
 * measure of what a player sees. The scan prints its file coverage so a
 * collapse in reach is visible rather than silent.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** ⚠ The ratchet baseline. Born at 377 (2026-09-08, OTA-1757), counted over CODE
 *  ONLY, after CharacterScreen's vitality and standing ramps moved into
 *  `ui/semanticColor`. Deliberately no headroom: every step down is a real
 *  conversion, and the number never goes back up without an owner decision.
 *
 *    377  OTA-1757  birth (372/4/1)
 *    375  OTA-1758  TScreenHeader — two `backText` golds became `T.gold`
 *    373  OTA-1759  TRow — Vendor's and Crafting's picked-row golds became
 *                   `rowSelected`, which reads the same `T.gold`
 *    369  OTA-1762  TTabBar — Crafting's and Vendor's selected-tab rim and
 *                   label golds, four declarations, became `T.gold` in the kit
 *
 *  ⚠ THE CURRENT SPLIT, and the only line in this file written in the form
 *  OTA-1757's suite parses — the ledger above is deliberately terse so a
 *  HISTORICAL total cannot be mistaken for today's:
 *      364 interface · 4 semantic authorities · 1 kit
 *  The INTERFACE number is the one the rollout drives down; the other two are
 *  the rule working. */
const BASELINE = 369;

/** The brand gold, the only hex this gate is about. */
const GOLD = /'#c9a86a'/gi;

/** ⚠⚠ THE SEMANTIC AUTHORITIES — files allowed to spend gold on MEANING.
 *  A hex here is a rarity, a category or a vitality band, not an accent. This
 *  list is deliberately tiny and adding to it is an owner decision: a second
 *  colour authority is the exact failure OTA-1312 fixed by consolidating the
 *  rarity palette out of four files. */
const SEMANTIC_AUTHORITIES = new Set([
  'app/components/InventoryCategorize.ts',
  'app/ui/semanticColor.ts',
]);

/** The one file allowed to define the accent itself. */
const KIT = 'app/ui/tartariaKit.tsx';

/* ⚠⚠⚠ STRIP COMMENTS BEFORE COUNTING — GRADE THE CODE, NOT THE PROSE.
 * The first run of this gate FAILED on its own companion module, because
 * `ui/semanticColor`'s header comment explains the problem by quoting the very
 * literal it is about. That is the third time in one day that a check has
 * graded the prose describing a fix instead of the fix: two test suites did it
 * while OTA-1756 was being written, and both were caught the same way.
 * A gate that can be tripped by a sentence teaches people not to write the
 * sentence. So the scan tokenises: string and template contents are kept,
 * `//` and comment blocks are dropped, and escapes are honoured so a
 * backslash cannot smuggle a quote past the state machine. */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += src[i]; i += 1; if (i < n) { out += src[i]; i += 1; } continue; }
        out += src[i]; i += 1;
      }
      if (i < n) { out += src[i]; i += 1; }
      continue;
    }
    out += c; i += 1;
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && e.name !== 'buildInfo.ts') out.push(p);
  }
  return out;
}

const files = [path.join(ROOT, 'App.tsx'), ...walk(path.join(ROOT, 'app'))]
  .filter((p) => fs.existsSync(p));

let iface = 0;
let semantic = 0;
let kit = 0;
const perFile = [];
for (const p of files) {
  const rel = path.relative(ROOT, p);
  const n = (stripComments(fs.readFileSync(p, 'utf8')).match(GOLD) ?? []).length;
  if (!n) continue;
  if (SEMANTIC_AUTHORITIES.has(rel)) semantic += n;
  else if (rel === KIT) kit += n;
  else { iface += n; perFile.push([rel, n]); }
}
const total = iface + semantic + kit;

perFile.sort((a, b) => b[1] - a[1]);

if (total > BASELINE) {
  console.error(`[check:gold] FAIL — gold declarations grew: ${total} > baseline ${BASELINE}.`);
  console.error('');
  console.error('Gold means a LIVE OBLIGATION or a LIVE PROCESS. A new declaration must');
  console.error('either displace an old one, or be a semantic value declared in a named');
  console.error('authority (ui/semanticColor) rather than an inline literal.');
  console.error('');
  console.error('Heaviest interface files:');
  for (const [rel, n] of perFile.slice(0, 10)) console.error(`  ${String(n).padStart(4)}  ${rel}`);
  process.exit(1);
}

const scanned = files.length;
console.log(`[check:gold] OK — ${total} gold declarations, baseline ${BASELINE}`
  + (total < BASELINE ? ` (${BASELINE - total} below — lower the baseline)` : ' (at baseline)'));
console.log(`  interface ${iface} · semantic authorities ${semantic} · kit ${kit}`
  + `   ·   ${scanned} files scanned, ${perFile.length + (semantic > 0 ? 1 : 0)} carry gold`);
console.log('  ⚠ counts DECLARATIONS, not what a player sees; blind to rgb()/variables/assets.');
