#!/usr/bin/env node
// HANDOFF PROHIBITION RATCHET — receipts for claims that stop future work.
//
// WHY THIS EXISTS. HANDOFF.md is a one-way write channel between sessions with no
// review step. Every sentence in it reaches every future session carrying the same
// authority, whether it was measured or merely assumed — which is how the port
// recipe and the ratchet ceilings survived, and also how two false rules travelled:
//
//   • "No spin-off worktree has node_modules and none ever has — you cannot gate
//     them locally."  Disproved 2026-08-07 by running `npm install` in a spin-off
//     worktree: 1147 packages in ~25s, then the full gate set green.
//   • "There are no PRs on line branches."  Contradicted by §3 step 6 and by PRs
//     #2 and #7, open against HaL2001 and golem-line right now.
//
// ⚠ BOTH WERE **PROHIBITIONS**, AND THAT IS THE WHOLE POINT OF THIS SCRIPT. A wrong
// instruction fails loudly the first time someone follows it. A wrong prohibition
// fails SILENTLY AND FOREVER, because the next session simply does not attempt the
// thing, finds nothing broken, and passes the claim on intact. The first cost ten
// seconds to disprove and had gone unchallenged for weeks.
//
// So: a claim that tells a future session something is IMPOSSIBLE has to carry its
// receipt — how it was established, and when. A dated receipt turns "you cannot do
// this" into "nobody could on 2026-08-06", which is a thing the reader knows how to
// re-test. Undated, it reads as physics.
//
// WHAT COUNTS AS A PROHIBITION: a falsifiable claim about what is POSSIBLE
// ("cannot be", "none of these can", "no X has ever"). NOT a directive — "do NOT
// push to main" is policy, it cannot be true or false, and it is left alone.
//
// WHAT COUNTS AS A RECEIPT: within ±RECEIPT_WINDOW lines, a verification verb
// (verified / measured / tested / proved / disproved / confirmed / checked /
// reproduced) sitting near an ISO date. Quoting a refuted claim in order to correct
// it also passes, because the correction supplies the receipt.
//
//   • count  >  baseline → FAIL. A new unreceipted prohibition was added.
//   • count === baseline → pass.
//   • count  <  baseline → pass, with a nudge to lower the baseline.
//
// The legacy prohibitions are grandfathered rather than mass-edited; the debt is
// frozen and can only ratchet DOWN. Fix one by adding its receipt or deleting it.
//
// Usage:  node scripts/check-handoff-claims.mjs
//         node scripts/check-handoff-claims.mjs --update-baseline
//         node scripts/check-handoff-claims.mjs --list   (show every offender)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = join(root, '.ci-handoff-claims-baseline');
// OTA-1177 — second ratchet, own baseline. Separate files so one debt shrinking cannot
// mask the other growing.
const causeBaselineFile = join(root, '.ci-handoff-causes-baseline');
// HANDOFF-ARCHIVE.md is deliberately NOT scanned: it is frozen history, kept
// verbatim on purpose, and rewriting it would destroy the record it exists to hold.
const targets = ['HANDOFF.md'];
const RECEIPT_WINDOW = 4;

// ⚠ SCOPE — PROCESS CLAIMS ONLY, NOT CODE INVARIANTS. An early cut of this pattern
// flagged 73 lines, and nearly all were descriptions of what the SHIPPED CODE cannot
// do ("the pickers can never disagree with the badge", "a held payout can never be
// silently dropped"). Those are invariants, they are backed by lock tests, and they
// are exactly the kind of precise writing this handoff should keep. Flagging them
// would have trained the next session to bump the baseline to silence the noise,
// which kills the ratchet.
//
// What actually burned us was a different subject: claims about what a PERSON or the
// TOOLING cannot do. "You cannot gate spin-offs locally." "There are no PRs on line
// branches." Those stop a future session from ever attempting the thing, so nobody
// discovers they are false. This pattern is keyed to that subject deliberately.
const PROHIBITION = new RegExp(
  [
    // Second/first person capability — "you cannot", "we can't", "you simply cannot"
    String.raw`\b(?:you|we|one)\s+(?:simply\s+|literally\s+)?(?:cannot|can't|can not)\b`,
    // Tooling/process verbs in the passive — "cannot be gated/run/tested/verified/built/installed"
    String.raw`\bcan(?:not|'t)\s+be\s+(?:gated|run|ran|tested|verified|built|installed|checked|reproduced|measured|linted)\b`,
    // Blanket set claims — "NONE of the five", "none of them can"
    String.raw`\bnone of (?:the|them|these|those)\b`,
    // Never-has-happened claims about repo objects
    String.raw`\bno\b[^.]{0,60}\b(?:worktree|branch|line|spin-off|spinoff|session|iteration|PR|pull request)\b[^.]{0,40}\b(?:has|have) ever\b`,
    // Absence claims about process objects — "there are no PRs on line branches"
    String.raw`\bthere (?:is|are) no\b[^.]{0,60}\b(?:PR|PRs|pull request|pull requests|gate|gates|test|tests|way to|tooling|node_modules|worktree|worktrees)\b`,
    // "impossible to <do something>"
    String.raw`\bimpossible to\s+\w+`,
  ].join('|'),
  'i',
);

const RECEIPT = /\b(verified|measured|tested|proved|disproved|confirmed|checked|reproduced|demonstrated)\b/i;
const ISO_DATE = /\b20\d\d-\d\d-\d\d\b/;

// ---------------------------------------------------------------------------
// SECOND RATCHET — MEASURE THE CAUSE, OR SAY YOU DIDN'T.
// ---------------------------------------------------------------------------
//
// ⚠⚠ WHY THIS EXISTS, and it cost a full day to learn. 2026-08-08: a crash arrived with
// no JS error recorded. I reasoned my way to "memory pressure from an unserialized
// ~400MB model load", wrote a persuasive paragraph, and shipped a BEHAVIOUR change on
// it (OTA-1173). It built a reload loop — seven ~400MB allocations in forty seconds —
// which OTA-1175 then had to interlock. The measurement finally arrived as three
// JetsamEvent reports (2026-08-08): `per-process-limit`, 118454–121207 rpages, i.e.
// ~1.9GB. Memory WAS the domain; the mechanism I asserted was not the one, and the fix
// aimed at it made things worse.
//
// ⚠ AND THE SECOND HALF OF THE SAME LESSON: an estimate that gets repeated becomes a
// premise. "~425MB for the model" was stated once as a guess and then cited as fact in
// five later messages, and used to argue the phone should cope comfortably. The
// measurement came back 4.5x higher. Nobody lied; nobody re-checked either.
//
// THE RULE THE OWNER AND I AGREED: **measure the cause, or ship an instrument.** This
// gate is the enforcement, because the previous enforcement was me remembering — and
// OTA-1172 had already WRITTEN that rule into its own source before OTA-1173 overrode
// it the same afternoon. A rule that lives only in prose loses to a good argument.
//
// WHAT TRIPS IT: a sentence ASSERTING a cause ("the cause was X", "caused by Y", "the
// culprit was Z"). Not a mention of the concept — "do the root cause dig" is a
// directive and is left alone, same as the prohibition pass leaves policy alone.
//
// HOW TO SATISFY IT — any ONE of three, and note that all three are cheap:
//   1. `MEASURED:` in the neighbourhood, followed by the actual observation. The
//      preferred form. Quote the number and where it came from.
//   2. A verification verb near an ISO date, the same receipt the prohibition pass
//      takes.
//   3. HEDGE IT HONESTLY — "candidate", "hypothesis", "suspected", "unmeasured". This
//      is not a loophole, it is the OTHER half of the rule working: OTA-1177 shipped a
//      counter for an orphaned-context THEORY and said so in those words, which is
//      exactly the behaviour this gate wants. Naming a guess as a guess costs one word
//      and stops it hardening into a premise three messages later.
const CAUSE_CLAIM = new RegExp(
  [
    String.raw`\bthe root cause (?:is|was|turned out)\b`,
    String.raw`\bthe cause (?:is|was)\b`,
    String.raw`\b(?:is|was|were|are) caused by\b`,
    String.raw`\bthe culprit (?:is|was)\b`,
    String.raw`\bwhat (?:caused|killed|crashed) (?:it|us|the app|the game)\b`,
    String.raw`\bis what (?:caused|killed|crashed|froze)\b`,
  ].join('|'),
  'i',
);
const MEASURED = /\bMEASURED:/;
// ⚠ Deliberately generous. The goal is not to make hedging hard — it is to make the
// UNHEDGED, UNMEASURED assertion the one thing you cannot do quietly.
const HEDGE = /\b(candidate|hypothesis|unmeasured|not measured|suspect|suspected|theory|guess|inferred|unproven|likely|probably|presumed)\b/i;

/** Both passes share this shape: find lines matching `pattern`, keep the ones whose
 *  ±RECEIPT_WINDOW neighbourhood fails `satisfied`. Kept generic so the two ratchets
 *  cannot drift apart in how they read a window. */
function offendersIn(file, pattern, satisfied) {
  const path = join(root, file);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!pattern.test(lines[i])) continue;
    const from = Math.max(0, i - RECEIPT_WINDOW);
    const to = Math.min(lines.length, i + RECEIPT_WINDOW + 1);
    const window = lines.slice(from, to).join('\n');
    if (satisfied(window)) continue;
    out.push({ file, line: i + 1, text: lines[i].trim() });
  }
  return out;
}

// A receipt is a verification verb AND a date in the neighbourhood. Requiring both is
// what stops "this was never tested" from counting as its own receipt.
const hasReceipt = (w) => RECEIPT.test(w) && ISO_DATE.test(w);

const offenders = targets.flatMap((f) => offendersIn(f, PROHIBITION, hasReceipt));
const count = offenders.length;

const causeOffenders = targets.flatMap((f) => offendersIn(
  f,
  CAUSE_CLAIM,
  (w) => MEASURED.test(w) || hasReceipt(w) || HEDGE.test(w),
));
const causeCount = causeOffenders.length;

if (process.argv.includes('--list')) {
  for (const o of offenders) console.log(`${o.file}:${o.line}  ${o.text.slice(0, 140)}`);
  console.log(`\n${count} unreceipted prohibition(s).`);
  console.log('');
  for (const o of causeOffenders) console.log(`${o.file}:${o.line}  ${o.text.slice(0, 140)}`);
  console.log(`\n${causeCount} unmeasured cause claim(s).`);
  process.exit(0);
}

if (process.argv.includes('--update-baseline')) {
  writeFileSync(baselineFile, `${count}\n`);
  writeFileSync(causeBaselineFile, `${causeCount}\n`);
  console.log(`[check-handoff-claims] baselines updated — prohibitions ${count}, cause claims ${causeCount}.`);
  process.exit(0);
}

function readBaseline(file) {
  return existsSync(file)
    ? Number.parseInt(readFileSync(file, 'utf8').trim(), 10)
    : Number.POSITIVE_INFINITY;
}

const baseline = readBaseline(baselineFile);
const causeBaseline = readBaseline(causeBaselineFile);

// ⚠ BOTH RATCHETS ARE EVALUATED BEFORE ANYTHING EXITS. The single-pass version returned
// early on a shrinking count, which would have let a new unmeasured cause claim through
// on any run where the prohibition debt happened to drop. Collect, then decide.
let failed = false;

if (count > baseline) {
  failed = true;
  console.error(
    `[check-handoff-claims] FAIL — ${count} unreceipted prohibitions, baseline ${baseline}.\n\n` +
      'A new sentence tells a future session something is IMPOSSIBLE without saying how\n' +
      'that was established. A wrong prohibition never gets caught, because nobody tries\n' +
      'the thing. Either add the receipt (how it was checked, and an ISO date beside it),\n' +
      'reword it as a directive if it is policy rather than fact, or delete it.\n',
  );
  for (const o of offenders.slice(-12)) console.error(`  ${o.file}:${o.line}  ${o.text.slice(0, 120)}`);
  console.error('');
} else if (count < baseline) {
  console.log(
    `[check-handoff-claims] OK — ${count} unreceipted prohibitions, below the baseline of ${baseline}.\n` +
      '  Debt shrank. Lower it: node scripts/check-handoff-claims.mjs --update-baseline',
  );
} else {
  console.log(`[check-handoff-claims] OK — unreceipted prohibitions at baseline (${count}). No growth.`);
}

if (causeCount > causeBaseline) {
  failed = true;
  console.error(
    `[check-handoff-claims] FAIL — ${causeCount} unmeasured cause claims, baseline ${causeBaseline}.\n\n` +
      'A new sentence names the CAUSE of something without saying how that was established.\n' +
      'That is the exact move that produced OTA-1173: a well-argued mechanism, shipped as a\n' +
      'behaviour change, that built a reload loop — while the real measurement (three\n' +
      'JetsamEvent reports, ~1.9GB, per-process-limit) did not arrive until a day later.\n\n' +
      'Fix it in one of three ways, and the third is fully legitimate:\n' +
      '  1. Put `MEASURED:` beside it with the actual observation and where it came from.\n' +
      '  2. Add a verification verb and an ISO date, same receipt the prohibition pass takes.\n' +
      '  3. HEDGE IT — "candidate", "suspected", "hypothesis". If it is a guess, say so, and\n' +
      '     ship an instrument instead of a fix. Measure the cause, or ship an instrument.\n',
  );
  for (const o of causeOffenders.slice(-12)) console.error(`  ${o.file}:${o.line}  ${o.text.slice(0, 120)}`);
  console.error('');
} else if (causeCount < causeBaseline) {
  console.log(
    `[check-handoff-claims] OK — ${causeCount} unmeasured cause claims, below the baseline of ${causeBaseline}.\n` +
      '  Debt shrank. Lower it: node scripts/check-handoff-claims.mjs --update-baseline',
  );
} else {
  console.log(`[check-handoff-claims] OK — unmeasured cause claims at baseline (${causeCount}). No growth.`);
}

if (failed) {
  console.error('  (node scripts/check-handoff-claims.mjs --list  shows all of them)');
  process.exit(1);
}
