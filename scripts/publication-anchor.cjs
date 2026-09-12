#!/usr/bin/env node
/**
 * ⚠⚠⚠ WHERE DOES THE "DID THE BUNDLE CHANGE?" DIFF START?
 *
 * ci.yml's publish job asks one question before it dispatches an OTA: does this
 * commit carry a JS-bundle change worth publishing? The PATH FILTER that answers
 * it is fine and lives in ci.yml, unchanged. This file answers the other half —
 * the half that was wrong: WHICH COMMIT THE DIFF IS MEASURED FROM.
 *
 * ⚠⚠ THE BUG, MEASURED 2026-09-12. The range was `github.event.before..github.sha`
 * — the PREVIOUS PUSH. That asks "did THIS PUSH touch the bundle", which is a
 * question about a push, not about the device. The two come apart the moment a
 * bundle-changing commit fails CI:
 *
 *   3f840c10  Phase 3 / OTA-1804, app/ changed     CI 2127 RED (check:standingat
 *                                                  went red on a line Phase 3
 *                                                  moved but did not change)
 *   94bc0c83  the one-integer gate repair          CI 2128 GREEN
 *
 * The repair's own push range is `3f840c10..94bc0c83` = one script file, so the
 * filter said "no bundle path changed — nothing to publish" and skipped the
 * dispatch. TRUE ABOUT THAT PUSH, FALSE ABOUT THE DEVICE: Phase 3's bundle sat
 * validated on the trunk and unpublished, and nothing would ever pick it up,
 * because every future push's range starts after it. A red CI run followed by a
 * green gate fix STRANDED A VALIDATED BUNDLE. Publication need was treated as a
 * property of a push when it is a property of the gap between the trunk and the
 * channel.
 *
 * ⚠ THE FIX IS THE ANCHOR, NOT THE FILTER. Measure from THE LAST COMMIT THIS
 * PIPELINE ACTUALLY PUBLISHED TO GOLEM. Then a gate-only follow-up still sees
 * the unshipped bundle change behind it, and a genuinely non-bundle push after a
 * successful publish still sees nothing and still publishes nothing.
 *
 * ⚠⚠ HOW "LAST PUBLISHED TO GOLEM" IS ESTABLISHED, and why not the obvious way.
 * Not from the publisher's own run history: a workflow_dispatch run's `head_sha`
 * is the ref's head when it was dispatched, NOT the `sha` input it published,
 * and its `display_title` is a stale workflow name that says "golem-line" even
 * on the run that published HAL (measured: publisher run 1357 shipped OTA-1803
 * to hal2001 under that title). Neither field can be trusted.
 *
 * Instead, ask CI — where a push event makes `head_sha` exact:
 *   walk this workflow's own trunk push runs, newest first, and take the first
 *   one that
 *     • is not the run asking the question,
 *     • has a head_sha that is an ancestor of the commit being judged,
 *     • whose publish job's dispatch STEP concluded `success` (not `skipped`),
 *       so that run really did hand a SHA to the publisher, and
 *     • whose commit TITLE carries no `[ota-hal]` — because the publisher routes
 *       a marked title to HAL, so a marked dispatch published HAL and left the
 *       golem channel exactly where it was.
 * Measured against live history, that resolves to 5037113b (CI 2126), which is
 * independently the SHA publisher run 1359 shipped to golem. Two signals, one
 * answer.
 *
 * ⚠⚠⚠ IT CAN ONLY EVER WIDEN THE RANGE. The chosen start is the OLDER of the
 * anchor and `github.event.before`, and when no anchor can be established at all
 * the caller is told to publish. So this file's answer is never narrower than
 * the range the old code used: it can turn a missed publish into a publish, and
 * it can never turn a publish into a miss. That asymmetry is deliberate — the
 * automatic path reaches GOLEM ONLY, the developer's own test phone, so an
 * unnecessary golem OTA costs a download and a missed one costs a day.
 *
 * ⚠ IT DECIDES NOTHING ABOUT VALIDATION. Worth is still Change A's receipt
 * (scripts/verify-ci-receipt.cjs) inside the publisher, and the line is still
 * resolved there from the commit title. This file only moves a diff's starting
 * point. .cjs and pure-core-plus-CLI like verify-ci-receipt.cjs and
 * promote-hal.cjs, so the suite drives it with fixtures and no network.
 */
'use strict';
const { execFileSync } = require('node:child_process');

const ZERO_SHA = '0000000000000000000000000000000000000000';
/** The step in ci.yml's publish job whose success means "a SHA was handed over". */
const DISPATCH_STEP = 'Dispatch the publisher for this validated commit';
/** The publisher routes a marked TITLE to HAL. Title only — OTA-1419. */
const HAL_MARKER = /\[ota-hal\]/;

const isSha = (s) => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s);

/**
 * The last commit this pipeline published to GOLEM, from CI's own run history.
 * Everything network- and git-shaped is injected so the suite can drive it.
 *
 * @param {object} p
 * @param {Array<{id:number|string, run_number:number, head_sha:string}>} p.runs
 *        trunk push runs of ci.yml, NEWEST FIRST.
 * @param {number|string} p.headRunId          the run asking — never its own anchor.
 * @param {(sha:string)=>boolean} p.isAncestorOfHead
 * @param {(runId:number|string)=>string|null} p.dispatchStatus  conclusion of DISPATCH_STEP
 * @param {(sha:string)=>string} p.titleOf     first line of that commit's message
 * @returns {{anchor:string|null, why:string, skipped:string[]}}
 */
function lastGolemPublication(p) {
  const skipped = [];
  for (const r of Array.isArray(p.runs) ? p.runs : []) {
    const tag = `run ${r.run_number ?? r.id}`;
    if (String(r.id) === String(p.headRunId)) { skipped.push(`${tag}: this run`); continue; }
    if (!isSha(r.head_sha)) { skipped.push(`${tag}: no usable head_sha`); continue; }
    if (!p.isAncestorOfHead(r.head_sha)) { skipped.push(`${tag}: ${r.head_sha.slice(0, 8)} is not an ancestor`); continue; }
    const status = p.dispatchStatus(r.id);
    if (status !== 'success') { skipped.push(`${tag}: dispatch ${status ?? 'absent'}`); continue; }
    const title = String(p.titleOf(r.head_sha) ?? '').split('\n')[0] ?? '';
    if (HAL_MARKER.test(title)) { skipped.push(`${tag}: [ota-hal] — that dispatch published HAL, not golem`); continue; }
    return {
      anchor: r.head_sha,
      why: `${tag} dispatched a markerless publish for ${r.head_sha.slice(0, 8)} — the last commit golem received`,
      skipped,
    };
  }
  return { anchor: null, why: 'no earlier CI run published golem', skipped };
}

/**
 * The older of two commits, by ancestry. `null` means "unknown", and an unknown
 * never wins — a missing candidate must not narrow the range.
 */
function olderOf(a, b, isAncestorOf) {
  if (!isSha(a)) return isSha(b) ? b : null;
  if (!isSha(b)) return a;
  if (a === b) return a;
  if (isAncestorOf(a, b)) return a;
  if (isAncestorOf(b, a)) return b;
  return null; // incomparable — no defensible start, so fall through to publish
}

/**
 * Where the bundle diff starts.
 *
 * @returns {{from:string|null, publishAnyway:boolean, why:string}}
 *          `from` null + publishAnyway true means: no defensible anchor exists,
 *          so treat the commit as publication-worthy rather than silently
 *          skipping it. That is the direction this whole file leans.
 */
function chooseRangeStart(p) {
  const before = isSha(p.before) && p.before !== ZERO_SHA && p.hasCommit(p.before) ? p.before : null;
  const anchor = isSha(p.anchor) && p.hasCommit(p.anchor) ? p.anchor : null;

  if (!anchor && !before) {
    return { from: null, publishAnyway: true, why: 'neither a golem anchor nor a usable push base is available locally — publishing rather than guessing' };
  }
  const from = olderOf(anchor, before, p.isAncestorOf);
  if (!from) {
    return { from: null, publishAnyway: true, why: `anchor ${String(anchor).slice(0, 8)} and push base ${String(before).slice(0, 8)} are unrelated — publishing rather than guessing` };
  }
  const which = !anchor ? 'this push base — no golem anchor was available, so the old push-range semantics apply'
    : anchor === before ? 'the golem anchor, which is also this push base'
      : from === anchor ? 'the golem anchor, which is older than this push base — the stranded-bundle case'
        : 'this push base, which is older than the golem anchor';
  return { from, publishAnyway: false, why: `diff starts at ${from.slice(0, 8)} — ${which}` };
}

// ── CLI — one step inside ci.yml's publish job. Prints `from=<sha>` for the
// caller to diff from, or `from=` with `publish=1` when no anchor is defensible.
function git(repo, args, quiet = false) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] }).trim();
}

function cli(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) { opt[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  const repo = opt.repo || process.cwd();
  const ghJson = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
  const hasCommit = (sha) => { try { git(repo, ['cat-file', '-e', `${sha}^{commit}`], true); return true; } catch { return false; } };
  const isAncestor = (a, b) => { try { git(repo, ['merge-base', '--is-ancestor', a, b], true); return true; } catch { return false; } };

  let anchor = null; let anchorWhy = 'anchor lookup skipped';
  try {
    const nwo = opt.repository || process.env.GITHUB_REPOSITORY;
    const runs = ghJson(`repos/${nwo}/actions/workflows/ci.yml/runs?branch=golem-line&event=push&per_page=${opt.scan || 30}`).workflow_runs || [];
    const found = lastGolemPublication({
      runs: runs.map((r) => ({ id: r.id, run_number: r.run_number, head_sha: r.head_sha })),
      headRunId: opt['head-run-id'] ?? process.env.GITHUB_RUN_ID,
      isAncestorOfHead: (sha) => hasCommit(sha) && isAncestor(sha, opt.after),
      dispatchStatus: (runId) => {
        const jobs = ghJson(`repos/${nwo}/actions/runs/${runId}/jobs?filter=latest&per_page=50`).jobs || [];
        const pub = jobs.find((j) => String(j.name).startsWith('publish'));
        if (!pub) return null;
        const step = (pub.steps || []).find((s) => s.name === DISPATCH_STEP);
        return step ? step.conclusion : null;
      },
      titleOf: (sha) => { try { return git(repo, ['log', '-1', '--format=%s', sha], true); } catch { return ''; } },
    });
    anchor = found.anchor; anchorWhy = found.why;
    for (const s of found.skipped) console.log(`  · ${s}`);
  } catch (e) {
    anchorWhy = `anchor lookup failed (${e.message}) — falling back to the push base`;
  }
  console.log(`anchor: ${anchorWhy}`);

  const r = chooseRangeStart({ before: opt.before, anchor, hasCommit, isAncestor });
  console.log(r.why);
  const out = process.env.GITHUB_OUTPUT;
  const lines = `from=${r.from ?? ''}\npublish=${r.publishAnyway ? '1' : '0'}\n`;
  if (out) require('node:fs').appendFileSync(out, lines);
  else process.stdout.write(lines);
  return 0;
}

module.exports = { lastGolemPublication, olderOf, chooseRangeStart, ZERO_SHA, DISPATCH_STEP, HAL_MARKER };

if (require.main === module) process.exit(cli(process.argv.slice(2)));
