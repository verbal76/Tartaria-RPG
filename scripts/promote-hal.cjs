#!/usr/bin/env node
/**
 * ⚠⚠⚠ EXACT-SHA HAL PROMOTION — THE CONTROL PLANE DECIDES INTENT, THE PUBLISHER
 * DECIDES WORTH.
 *
 * Promotion means: publish a game-source SHA that already sits on `golem-line`
 * and already carries a green Change-A receipt to the HAL distribution, WITHOUT
 * touching that SHA, without a marker commit, without moving `golem-line`.
 *
 * The request is a file on the persistent control-plane branch `promotions`:
 *
 *     promotions/promote-hal-<FULL-40-HEX-SHA>.json
 *     { "target": "hal", "sha": "<the same 40 hex>", ... }
 *
 * ONE SHA → ONE FILENAME. That is the whole replay story. EAS publication is not
 * idempotent — every `eas update` is a new update group even for an identical
 * bundle — so replay protection has to live here, deterministically, in the
 * ledger's own history: a record is "consumed" the moment it has ever been
 * added to the branch. The branch is fast-forward only and this credential
 * cannot delete refs, so history is durable, and "ever added" is decidable
 * from `git log` alone. Deleting the file and re-adding it is a replay and is
 * refused; editing a record is refused; the ledger is append-only.
 *
 * What this file DOES prove, per push to `promotions`:
 *   • not a force-push, and not the branch's creation (both inert or refused);
 *   • the ledger is append-only in this push (no record modified or deleted);
 *   • exactly ONE record was added (zero is an inert control-plane edit — a
 *     README, a note — and never dispatches; two is ambiguous and refuses);
 *   • the filename is canonical and the record inside agrees with it —
 *     target "hal", the same full lowercase SHA;
 *   • the record has never been added before (replay);
 *   • the SHA resolves to a commit that is an ANCESTOR of current
 *     origin/golem-line — the shared game-source trunk, the only source
 *     authority — so nothing off-trunk can ever be promoted;
 *   • the SHA carries the Change-A contract files. Anything older than
 *     3c1bcea9 cannot satisfy the publication contract and is refused HERE
 *     with a plain message rather than failing inside the publisher on a
 *     missing file. This is a precondition, not a re-implementation.
 *
 * What this file DOES NOT do, on purpose: it never asks whether the SHA passed
 * CI. That is Change A's receipt (scripts/verify-ci-receipt.cjs), which runs
 * INSIDE THE PUBLISHER against the manifest read from the SHA's own checkout,
 * on the manual path, exactly as for a human dispatch. One validation
 * authority. This script establishes intent and identity; the publisher
 * establishes worth.
 *
 * .cjs, like verify-ci-receipt.cjs: the suite ciPromotionIsNotAMutation drives
 * evaluatePromotion directly with fixtures, and jest's transform does not
 * cover .mjs. No dependencies; stock runner node.
 */
'use strict';
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

const RECORD_RE = /^promotions\/promote-hal-([0-9a-f]{40})\.json$/;
const ZERO_SHA = '0000000000000000000000000000000000000000';
const CONTRACT_FILES = ['scripts/verify-ci-receipt.cjs', '.github/required-jobs.json'];

/** Canonical record path for a SHA — the one and only spelling. */
function recordPathFor(sha) {
  return `promotions/promote-hal-${sha}.json`;
}

/**
 * Pure decision. Everything git-shaped is passed in so it can be driven by
 * fixtures.
 *
 * @param {object} p
 * @param {string}  p.before            github.event.before (ZERO_SHA on branch creation)
 * @param {string}  p.after             github.sha
 * @param {boolean} p.forced            github.event.forced
 * @param {Array<{status:string,path:string}>} p.changes   name-status of before..after (A/M/D/R…)
 * @param {(path:string)=>string} p.readRecord               contents of an added record at `after`
 * @param {(path:string)=>number} p.priorAdditions           how many times `path` was ADDED in history before `before` (inclusive)
 * @param {(sha:string)=>boolean} p.isTrunkAncestor          sha is a commit and an ancestor of origin/golem-line
 * @param {(sha:string,file:string)=>boolean} p.shaHasFile   file exists in the tree of sha
 * @returns {{ ok:boolean, action:'inert'|'dispatch'|'refuse', sha:string|null, record:string|null, reasons:string[] }}
 */
function evaluatePromotion(p) {
  const refuse = (...reasons) => ({ ok: false, action: 'refuse', sha: null, record: null, reasons });
  const inert = (why) => ({ ok: true, action: 'inert', sha: null, record: null, reasons: [why] });

  if (p.forced === true) return refuse('force-push to promotions — the control plane is fast-forward only');

  const changes = Array.isArray(p.changes) ? p.changes : [];
  const ledger = changes.filter((c) => c && typeof c.path === 'string' && c.path.startsWith('promotions/') && c.path.endsWith('.json'));

  // Branch creation (bootstrap). Inert by construction; carrying a record at
  // creation is refused so a bootstrap can never double as a promotion.
  if (p.before === ZERO_SHA || !p.before) {
    if (ledger.length) return refuse(`branch creation carries ${ledger.length} ledger record(s) — bootstrap must be inert; add records in a later commit`);
    return inert('branch creation — bootstrap, nothing to promote');
  }

  // Append-only.
  const notAdd = ledger.filter((c) => c.status !== 'A');
  if (notAdd.length) {
    return refuse(...notAdd.map((c) => `ledger record ${c.path} was ${c.status === 'M' ? 'modified' : c.status === 'D' ? 'deleted' : 'renamed/changed (' + c.status + ')'} — the ledger is append-only; a consumed record is never edited or removed`));
  }

  const added = ledger.filter((c) => c.status === 'A');
  if (added.length === 0) return inert('no ledger record added — control-plane edit, nothing to promote');
  if (added.length > 1) return refuse(`${added.length} ledger records added in one push (${added.map((c) => c.path).join(', ')}) — one promotion per push, or the intent is ambiguous`);

  const record = added[0].path;
  const m = RECORD_RE.exec(record);
  if (!m) return refuse(`${record} is not a canonical record name — expected promotions/promote-hal-<40 lowercase hex>.json`);
  const sha = m[1];

  let body;
  try { body = JSON.parse(p.readRecord(record)); } catch (e) { return refuse(`${record} is not valid JSON: ${e.message}`); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse(`${record} must be a JSON object`);
  if (body.target !== 'hal') return refuse(`${record} target is ${JSON.stringify(body.target)}, not "hal" — the control plane promotes to HAL only`);
  if (body.sha !== sha) return refuse(`${record} names sha ${JSON.stringify(body.sha)} but its filename names ${sha} — a record may not disagree with its own name`);

  const prior = p.priorAdditions(record);
  if (prior > 0) return refuse(`${record} was already added ${prior} time(s) in the ledger's history — REPLAY refused; one SHA is promoted once`);

  if (!p.isTrunkAncestor(sha)) return refuse(`${sha} is not a commit on origin/golem-line — only the shared game-source trunk can be promoted`);

  const missing = CONTRACT_FILES.filter((f) => !p.shaHasFile(sha, f));
  if (missing.length) return refuse(`${sha} predates the hardened publication contract (missing ${missing.join(', ')}) — it cannot satisfy Change A's receipt and is not promotable`);

  return { ok: true, action: 'dispatch', sha, record, reasons: [`promote ${sha} to HAL — record ${record}`] };
}

// ── CLI — run inside .github/workflows/promote.yml.
//   node trunk/scripts/promote-hal.cjs --before B --after A --forced true|false --ledger <dir of promotions checkout> --trunk <dir of golem-line checkout>
// Prints one of: INERT / DISPATCH <sha> / REFUSE. Exit 0 for inert or dispatch,
// 1 for refuse. The workflow reads DISPATCH's sha from a file it writes.
function git(cwd, args, quiet = false) {
  // `quiet` drops git's stderr for probes that are EXPECTED to fail (a SHA that
  // is not an ancestor, a file absent at a SHA) — the refusal message is the
  // script's, and a "fatal:" line beside it would read as a second error.
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] }).trim();
}

function cli(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) { opt[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  for (const k of ['before', 'after', 'ledger', 'trunk']) if (!opt[k]) { console.error(`[promote-hal] missing --${k}`); return 2; }
  const L = opt.ledger; const T = opt.trunk;
  const before = opt.before; const after = opt.after;
  const forced = String(opt.forced) === 'true';

  let changes = [];
  if (before && before !== ZERO_SHA) {
    const out = git(L, ['diff', '--name-status', '--no-renames', before, after]);
    changes = out ? out.split('\n').map((l) => { const [status, ...rest] = l.split('\t'); return { status: status[0], path: rest.join('\t') }; }) : [];
  }
  const result = evaluatePromotion({
    before, after, forced, changes,
    readRecord: (path) => git(L, ['show', `${after}:${path}`]),
    priorAdditions: (path) => { const out = git(L, ['log', '--diff-filter=A', '--format=%H', before, '--', path]); return out ? out.split('\n').filter(Boolean).length : 0; },
    isTrunkAncestor: (sha) => { try { git(T, ['cat-file', '-e', `${sha}^{commit}`], true); git(T, ['merge-base', '--is-ancestor', sha, 'origin/golem-line'], true); return true; } catch { return false; } },
    shaHasFile: (sha, file) => { try { git(T, ['cat-file', '-e', `${sha}:${file}`], true); return true; } catch { return false; } },
  });

  if (result.action === 'refuse') {
    console.error('::error::Refusing to promote:');
    for (const r of result.reasons) console.error('  · ' + r);
    return 1;
  }
  if (result.action === 'inert') { console.log(`INERT — ${result.reasons[0]}`); return 0; }
  console.log(`DISPATCH ${result.sha}`);
  if (opt.out) require('node:fs').writeFileSync(opt.out, `${result.sha}\n`);
  return 0;
}

module.exports = { evaluatePromotion, recordPathFor, RECORD_RE, ZERO_SHA, CONTRACT_FILES };

if (require.main === module) process.exit(cli(process.argv.slice(2)));
