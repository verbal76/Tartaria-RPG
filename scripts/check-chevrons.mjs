#!/usr/bin/env node
/**
 * OTA-1456 — ONE CHEVRON VOCABULARY, ENFORCED.
 *
 * The app had TWO conventions for disclosure chevrons running at once:
 *
 *   chevron-as-STATE      ▸ = closed, ▾ = open   (stat rows, WorldScreen, AboutScreen…)
 *   chevron-as-AFFORDANCE ▾ = "tap to open",  ▴ = "tap to close"
 *
 * Both are defensible in isolation. Running both is not, because it makes `▾`
 * mean COLLAPSED on one screen and EXPANDED on another — and on CharacterScreen
 * it meant both, nine hundred lines apart. A third pair (`›` for closed) had
 * also appeared on the gifts row.
 *
 * ⚠⚠ WHY THIS IS A SCRIPT AND NOT A JEST PIN. A hand audit of this found THREE
 * of the SEVEN offending sites. The three it missed (InventoryScreen,
 * VendorScreen ×2) were in files nobody was looking at, and no test would ever
 * have caught them, because a per-screen pin only guards the screen somebody
 * already suspected. A vocabulary is an app-wide property or it is nothing.
 *
 * ⚠⚠ AND THE HARD PART IS NOT THE COMPARISON, IT IS KNOWING WHAT TO COMPARE.
 * `▸` is heavily overloaded in this codebase as a decorative bullet —
 * `▸ SET COURSE TO …`, `▸ You're here — start the climb.` — and as a
 * you-are-here marker (`here ? '▸' : ' '`). Those are not toggles and must not
 * be dragged into the vocabulary. The discriminator used here:
 *
 *     a TOGGLE chevron is a ternary whose BOTH branches carry a chevron glyph.
 *
 * That admits `collapsed ? '▸' : '▾'` and rejects both `▸ SET COURSE` (no
 * ternary) and `here ? '▸' : ' '` (one branch is blank) — a position marker,
 * not a disclosure state.
 *
 * ⚠ AND IT NEEDED A SECOND CLAUSE, WHICH THE GATE FOUND ON ITS FIRST RUN. That
 * rule alone flagged `activeBounties.length > 0 ? 'ACCEPT (STACK) ›' :
 * 'ACCEPT & SET COURSE ›'` — both branches carry `›`, but it is the same `›`
 * both ways: a decorative trailing arrow on a button, encoding nothing. So a
 * toggle must additionally carry DIFFERENT chevrons on its two branches, which
 * is what "the glyph shows the state" means in the first place.
 *
 * ⚠ THE HOLE THAT LEAVES, STATED PLAINLY RATHER THAN PAPERED OVER: a genuine
 * toggle written with the SAME glyph in both states is skipped by this gate.
 * That is a defect, but a louder and more obvious one — a chevron that never
 * changes is visible the first time anybody taps it, whereas vocabulary drift
 * across two screens is invisible forever. This gate is aimed at the invisible
 * one.
 *
 * ⚠⚠⚠ AND IT REFUSES TO GUESS POLARITY. Deciding whether a condition means
 * "open" or "closed" from its NAME is exactly the mistake that produced
 * OTA-1455's bogus 29/47 verb count: an instrument that cannot tell ABSENT
 * from UNRESOLVED reports confident nonsense. So polarity is not inferred.
 * Every toggle site must be declared in the REGISTRY below with its polarity
 * stated by a human, and a site that is NOT in the registry is a hard failure
 * telling you to come add it — never a silent pass.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** The vocabulary. Closed points along the line of reading; open points down
 *  into the content it revealed. */
const CLOSED = '▸'; // ▸
const OPEN = '▾';   // ▾

/** Every glyph that has ever been used as a disclosure chevron here, including
 *  the ones this OTA retired. Listing the retired ones is the point: they are
 *  how a regression announces itself. */
const CHEVRONS = ['▸', '▾', '▴', '▹', '▿', '►', '▶', '›'];
const CHEV_CLASS = `[${CHEVRONS.join('')}]`;

const SCAN_DIRS = ['app'];
const EXTS = new Set(['.ts', '.tsx']);

/**
 * ⚠ THE REGISTRY. One entry per disclosure toggle in the app.
 *
 *   file       — where it lives
 *   cond       — a distinctive fragment of the ternary's condition
 *   trueMeans  — 'open' | 'closed': what it means when the condition is TRUE
 *
 * `trueMeans` is the human judgement the script will not make for itself.
 * Adding a new accordion means adding a line here; that is deliberate friction,
 * and it is cheaper than the alternative, which is a fifth vocabulary nobody
 * notices for three months.
 */
const REGISTRY = [
  { file: 'app/screens/CharacterScreen.tsx', cond: 'collapsed[key]', trueMeans: 'closed' },
  // OTA-1683 — the gifts row and the wrongs row share one toggle site; `open`
  // is whichever ledger the row owns (giftsOpen / wrongsOpen).
  { file: 'app/screens/CharacterScreen.tsx', cond: 'open', trueMeans: 'open' },
  { file: 'app/screens/CharacterScreen.tsx', cond: 'isOpen', trueMeans: 'open' },
  { file: 'app/screens/CharacterScreen.tsx', cond: 'expanded', trueMeans: 'open' },
  { file: 'app/screens/ContractsScreen.tsx', cond: 'active', trueMeans: 'open' },
  { file: 'app/screens/ContractsScreen.tsx', cond: 'mqExpanded', trueMeans: 'open' },
  { file: 'app/screens/InventoryScreen.tsx', cond: 'collapsed', trueMeans: 'closed' },
  // OTA-1657 — RackFrame, the ONE collapse shared by the scanner pouch, the
  // bandolier and the healing pouch. Its prop is `open`, so true means OPEN —
  // the opposite polarity to the category headers three lines above it in the
  // same file, which is exactly the collision this gate exists to keep honest.
  { file: 'app/screens/InventoryScreen.tsx', cond: 'open', trueMeans: 'open' },
  { file: 'app/screens/VendorScreen.tsx', cond: 'collapsed', trueMeans: 'closed' },
  { file: 'app/screens/WorldScreen.tsx', cond: 'collapsed[key]', trueMeans: 'closed' },
  { file: 'app/screens/AboutScreen.tsx', cond: 'advancedOpen', trueMeans: 'open' },
  { file: 'app/screens/AboutScreen.tsx', cond: 'expanded', trueMeans: 'open' },
  { file: 'app/components/RecipesView.tsx', cond: 'isCollapsed', trueMeans: 'closed' },
  { file: 'app/components/InputBox.tsx', cond: 'moreOpen', trueMeans: 'open' },
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

/** Find ternaries with a chevron on BOTH branches. Deliberately line-scoped:
 *  every real site in this codebase is written on one line, and a multi-line
 *  regex over 40k-line files invites the catastrophic-backtracking class of
 *  bug this project has been bitten by before. A site split across lines is
 *  reported as UNKNOWN by the registry cross-check below rather than missed. */
const TERNARY = new RegExp(
  `\\?\\s*(?:<[^>]*>)?\\s*'([^']*${CHEV_CLASS}[^']*)'\\s*:\\s*'([^']*${CHEV_CLASS}[^']*)'`,
);

/** Pull every disclosure toggle out of one line of source. Returns null when the
 *  line carries no toggle. Shared by the real scan and by the self-test below,
 *  deliberately: a self-test that exercises a COPY of the matcher proves nothing
 *  about the matcher that actually runs. */
function toggleOnLine(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return null;
  const m = TERNARY.exec(line);
  if (!m) return null;
  // Second clause: the branches must carry DIFFERENT chevrons. Same glyph both
  // ways = decoration (a trailing `›` on a button), not state.
  const glyphs = (s) => new Set([...s].filter((c) => CHEVRONS.includes(c)));
  const a = glyphs(m[1]);
  const b = glyphs(m[2]);
  if (a.size === b.size && [...a].every((c) => b.has(c))) return null;
  return { cond: line.slice(0, m.index).split(/[{(]/).pop().trim(), whenTrue: m[1], whenFalse: m[2], src: t };
}

// ⚠⚠⚠ SELF-TEST, RUN EVERY TIME, BEFORE THE REAL SCAN.
//
// A gate whose matcher quietly stops matching prints "OK" forever, and "OK" from
// a broken instrument is worse than no instrument — it is the failure mode that
// produced OTA-1455's bogus 29/47 verb count. So the matcher is fired at a fixed
// sample with known answers first. If it cannot tell these five apart, the run
// aborts rather than reporting on the real code.
const SELF_TEST = [
  // [ line, should it be seen as a toggle? , why ]
  [`<Text>{collapsed ? '▸' : '▾'}</Text>`, true, 'plain state toggle'],
  [`<Text>{open ? '▾ CLOSE' : '▸ OPEN'}</Text>`, true, 'toggle with words attached'],
  [`<Text>{here ? '▸' : ' '}</Text>`, false, 'position marker — one branch blank'],
  [`<Text style={s}>▸ SET COURSE TO {name}</Text>`, false, 'decorative bullet — no ternary'],
  [`<Text>{n > 0 ? 'ACCEPT ›' : 'SET COURSE ›'}</Text>`, false, 'same glyph both ways — decoration'],
];
for (const [line, expected, why] of SELF_TEST) {
  const got = toggleOnLine(line) !== null;
  if (got !== expected) {
    console.error('✗ check:chevrons — SELF-TEST FAILED. The matcher is broken; the real scan was not run.');
    console.error(`    expected ${expected ? 'TOGGLE' : 'not a toggle'} (${why}) but got the opposite:`);
    console.error(`    ${line}`);
    process.exit(1);
  }
}

const found = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const hit = toggleOnLine(line);
      if (hit) found.push({ file: rel, line: i + 1, ...hit });
    });
  }
}

const errors = [];
const unregistered = [];
const matched = new Set();

for (const site of found) {
  const entry = REGISTRY.find(
    (r) => r.file === site.file && site.cond.includes(r.cond),
  );
  if (!entry) { unregistered.push(site); continue; }
  matched.add(`${entry.file}::${entry.cond}`);

  const openBranch = entry.trueMeans === 'open' ? site.whenTrue : site.whenFalse;
  const closedBranch = entry.trueMeans === 'open' ? site.whenFalse : site.whenTrue;

  if (!openBranch.includes(OPEN)) {
    errors.push(`${site.file}:${site.line} — the OPEN branch should carry '${OPEN}', got '${openBranch}'\n      ${site.src}`);
  }
  if (!closedBranch.includes(CLOSED)) {
    errors.push(`${site.file}:${site.line} — the CLOSED branch should carry '${CLOSED}', got '${closedBranch}'\n      ${site.src}`);
  }
}

// ⚠⚠ THE SELF-CHECK. Same discipline as check:verbreach. If the scanner stops
// finding sites the registry says exist, the scanner is broken — a regex that
// silently matches nothing reports a clean board, which is the most dangerous
// output a gate can produce. An empty result is ALWAYS a failure here.
const missing = REGISTRY.filter((r) => !matched.has(`${r.file}::${r.cond}`));
if (missing.length) {
  console.error('✗ check:chevrons — SCANNER FAULT, not a code fault.');
  console.error('  The registry declares these toggle sites, but the scan did not find them.');
  console.error('  Either they were deleted (remove the registry line) or the matcher broke:');
  for (const m of missing) console.error(`    ${m.file}  cond≈${m.cond}`);
  process.exit(1);
}
if (!found.length) {
  console.error('✗ check:chevrons — the scan found ZERO toggle chevrons. The matcher is broken.');
  process.exit(1);
}

if (unregistered.length) {
  console.error('✗ check:chevrons — UNREGISTERED disclosure toggle(s).');
  console.error('  A new accordion must declare its polarity in scripts/check-chevrons.mjs');
  console.error(`  so the vocabulary stays enforceable (${CLOSED} = closed, ${OPEN} = open):`);
  for (const s of unregistered) console.error(`    ${s.file}:${s.line}  cond=${s.cond}\n      ${s.src}`);
  process.exit(1);
}

if (errors.length) {
  console.error(`✗ check:chevrons — ${errors.length} site(s) off-vocabulary (${CLOSED} = closed, ${OPEN} = open):`);
  for (const e of errors) console.error(`    ${e}`);
  process.exit(1);
}

console.log(`[check:chevrons] OK — ${found.length} disclosure toggles, one vocabulary (${CLOSED} closed / ${OPEN} open).`);
