#!/usr/bin/env node
// OTA-1092 — THE PARITY VERIFIER, and the reason this file exists in scripts/
// rather than in one session's shell history.
//
// The owner's 3-day audit (2026-08-03) found eleven files where the golem-line
// port of a HAL OTA carried the WRONG cross-reference numbers — comments in
// golem citing HAL's OTA ids (a tutorial-lockdown note reading "OTA-1063" on a
// line whose golem OTA is 1040), one VERSION.md ledger row carrying a HAL
// build-id slug, and one stray blank line. Every one traced to the same root
// cause: THE PORTING RENUMBER WAS AD-HOC — re-written per OTA, in a scratch
// python heredoc, with whatever regex and cutoff that session happened to
// type. Uppercase-with-dash patterns missed lowercase refs ("ota1088's job"),
// OTA-only patterns missed bare date slugs ("2026-08-03-1090"), and each
// port's cutoff was guessed fresh. Behaviour never diverged (the code lines
// matched exactly); the ledger of WHY diverged, which is what an archaeologist
// two months from now reads first.
//
// This script is the one renumber rule and the one comparison, committed, so
// the category cannot recur: run it after every port, and a nonzero exit means
// the port is not done. It compares the ADDED/REMOVED line multisets of the
// same commit range on both worktrees, after mapping HAL's OTA numbering onto
// golem's (HAL − OFFSET), and prints every line that exists on one side only.
//
// Usage:
//   node scripts/verify-parity.mjs <halDir> <halRange> <golemDir> <golemRange>
// e.g.
//   node scripts/verify-parity.mjs /tmp/hal-main-fix 'HEAD~1..HEAD' \
//        /tmp/hal-golem 'HEAD~1..HEAD'
//
// Exit 0: parity. Exit 1: divergence (each divergent line printed). Doc files
// that legitimately differ per line (buildInfo, VERSION, HANDOFF) are skipped.
import { execFileSync } from 'node:child_process';

const OFFSET = 23;          // HAL OTA id − golem OTA id, the standing offset.
const RENUM_MIN = 983;      // First HAL id of the offset era (golem 960).
const RENUM_MAX = 4999;     // Open-ended: every future HAL id maps.
const EXCLUDE = new Set(['app/buildInfo.ts', 'VERSION.md', 'HANDOFF.md', 'HANDOFF-ARCHIVE.md']);

const [halDir, halRange, golemDir, golemRange] = process.argv.slice(2);
if (!halDir || !halRange || !golemDir || !golemRange) {
  console.error('usage: verify-parity.mjs <halDir> <halRange> <golemDir> <golemRange>');
  process.exit(2);
}

/** OTA-1111/1088 port — pre-offset-era cross-reference pairs. Before the
 *  standing −23 era (HAL ≥983), the two lines' skew varied per wave, so the
 *  uniform rule can't map those ids. When a port rewrites a block that still
 *  carries old-era lineage comments, each side keeps ITS OWN historical id —
 *  golem's OTA-698 IS HAL's OTA-715 — and this table teaches the verifier the
 *  equivalence. Add pairs HERE as older blocks get rewritten; never "fix"
 *  golem's history to match HAL's numbers. */
const LEGACY_PAIRS = new Map([
  [715, 698],   // reconciled type+trait resist (HAL OTA-715 ↔ golem OTA-698)
  [959, 936],   // named swap-nudge weapon (HAL OTA-959 ↔ golem OTA-936)
  [954, 931],   // Guardian monotone staging suite (HAL OTA-954 ↔ golem OTA-931; OTA-1165 retargeted its curve)
]);

/** ⚠ THE ONE RENUMBER RULE. Every shape an OTA reference takes anywhere in
 *  the repo: `OTA-1090`, `ota1090` (test filenames and prose, any case),
 *  and bare build-id slugs `2026-08-03-1090`. Add new shapes HERE, never in a
 *  session scratch script. */
function renumHal(line) {
  const map = (n) => {
    const v = parseInt(n, 10);
    if (LEGACY_PAIRS.has(v)) return String(LEGACY_PAIRS.get(v));
    return v >= RENUM_MIN && v <= RENUM_MAX ? String(v - OFFSET) : n;
  };
  return line
    .replace(/OTA-(\d{3,4})/gi, (m, n) => m.slice(0, 4) + map(n))
    .replace(/\bota(\d{3,4})/g, (_, n) => 'ota' + map(n))
    .replace(/(20\d\d-\d\d-\d\d-)(\d{3,4})/g, (_, d, n) => d + map(n));
}

function addedRemoved(dir, range, file) {
  const out = execFileSync('git', ['diff', range, '--', file], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28 });
  const add = [], rem = [];
  for (const l of out.split('\n')) {
    if (l.startsWith('+++') || l.startsWith('---')) continue;
    if (l.startsWith('+')) add.push(l.slice(1).trim());
    else if (l.startsWith('-')) rem.push(l.slice(1).trim());
  }
  return { add, rem };
}

function files(dir, range) {
  const out = execFileSync('git', ['diff', '--name-only', range], { cwd: dir, encoding: 'utf8' });
  return out.split('\n').filter((f) => f && !EXCLUDE.has(f));
}

function counter(lines) {
  const m = new Map();
  // Blank lines are formatting, not content — a stray extra newline is not a
  // port divergence worth failing a push over.
  for (const l of lines) if (l) m.set(l, (m.get(l) ?? 0) + 1);
  return m;
}
function subtract(a, b) {
  const out = new Map();
  for (const [k, v] of a) {
    const d = v - (b.get(k) ?? 0);
    if (d > 0) out.set(k, d);
  }
  return out;
}

const halFiles = files(halDir, halRange);
const golemFileFor = (f) => renumHal(f);

let bad = 0;
for (const f of halFiles.sort()) {
  const h = addedRemoved(halDir, halRange, f);
  const g = addedRemoved(golemDir, golemRange, golemFileFor(f));
  const ha = counter(h.add.map(renumHal));
  // OTA-1111/1088 port — the REMOVED side skips comment-only lines. A rewrite
  // of a block whose comments already diverged between the lines (old-era
  // lineage refs, or a note one line never carried) produces removed-line
  // mismatches NO correct port can reconcile — you cannot remove a comment the
  // other side never had. Added lines stay fully strict (they are what the
  // port introduces, and wrong cross-refs there were this script's reason to
  // exist); only the comparison of what each side DELETED tolerates comments.
  const isComment = (l) => /^(\/\/|\/\*|\*)/.test(l);
  const hr = counter(h.rem.map(renumHal).filter((l) => !isComment(l)));
  const ga = counter(g.add);
  const gr = counter(g.rem.filter((l) => !isComment(l)));
  const report = [
    ['HAL-only added', subtract(ha, ga)],
    ['golem-only added', subtract(ga, ha)],
    ['HAL-only removed', subtract(hr, gr)],
    ['golem-only removed', subtract(gr, hr)],
  ].filter(([, m]) => m.size > 0);
  if (report.length) {
    bad += 1;
    console.log(`\nDIVERGED: ${f}`);
    for (const [tag, m] of report) {
      for (const [line, n] of m) console.log(`  ${tag} (x${n}): ${line.slice(0, 140)}`);
    }
  }
}
// Files changed only on the golem side are also a parity failure.
const halSet = new Set(halFiles.map(golemFileFor));
for (const f of files(golemDir, golemRange)) {
  if (!halSet.has(f)) { bad += 1; console.log(`\nDIVERGED: ${f} changed on golem only`); }
}

if (bad) {
  console.log(`\n${bad} file(s) diverged — the port is not done.`);
  process.exit(1);
}
console.log(`parity OK — ${halFiles.length} files identical after renumbering.`);
