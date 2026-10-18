#!/usr/bin/env node
/**
 * ⚠⚠ SINGLE SOURCE OF TRUTH — A PLATFORM BUILD MAY ONLY COMPILE THE TRUNK.
 *
 * Standing policy (CLAUDE.md "Single source of truth", docs/SOURCE-OF-TRUTH.md):
 * `golem-line` is the one authoritative integrated codebase. Android, iOS, web,
 * Windows, macOS, Linux and Steam Deck are build TARGETS of it, not versions. A
 * build workflow that checks out whatever ref it was pointed at can quietly ship
 * an unrelated branch as "the" product (a stale pre-collapse line, a topic
 * branch, `main`'s workflow stubs). This guard runs right after checkout and
 * refuses unless the commit being built is
 *
 *   • the tip of `golem-line`, or an ANCESTOR of it (already integrated — a tag
 *     or an older release candidate), or
 *   • explicitly approved by full SHA (`APPROVED_SOURCE_SHA`, fed from a
 *     workflow_dispatch input) — a deliberate pre-integration candidate build,
 *     which is recorded as `approved-unintegrated` in the build provenance and
 *     is never mistaken for a trunk build.
 *
 * It FAILS CLOSED: if the relationship to the trunk cannot be established the
 * build is refused, except for a plain push to `golem-line` itself (the ref is
 * the trunk by construction, so there is nothing to look up).
 *
 * It costs no Actions minutes of its own: one HTTPS call inside a build job that
 * was already running. It never builds, publishes or deploys anything.
 *
 * Usage (CI):  node scripts/assert-authoritative-source.cjs
 *   env: GITHUB_SHA, GITHUB_REF, GITHUB_EVENT_NAME, GITHUB_REPOSITORY, GITHUB_TOKEN,
 *        APPROVED_SOURCE_SHA (optional), GITHUB_OUTPUT (optional)
 * Usage (local): node scripts/assert-authoritative-source.cjs --sha <sha> [--relation behind]
 */
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const AUTHORITATIVE_BRANCH = 'golem-line';
const SHA_RE = /^[0-9a-f]{40}$/;
const RELATIONS = ['identical', 'behind', 'ahead', 'diverged', 'unknown'];

/**
 * Pure decision. `relation` is the SOURCE commit's relation to the trunk tip, in
 * the vocabulary of GitHub's compare API read as `trunk...source`:
 *   identical = source IS the tip      behind = source is an ancestor of the tip
 *   ahead / diverged = source has commits the trunk does not    unknown = could not tell
 */
function decide({ sha, event, ref, relation, approvedSha }) {
  if (!SHA_RE.test(String(sha || ''))) {
    return { ok: false, integration: 'refused', reason: `source SHA is not a full 40-hex commit id: "${sha}"` };
  }
  if (!RELATIONS.includes(relation)) {
    return { ok: false, integration: 'refused', reason: `unknown relation "${relation}"` };
  }
  const pushedTrunk = event === 'push' && ref === `refs/heads/${AUTHORITATIVE_BRANCH}`;
  if (relation === 'identical' || relation === 'behind') {
    return { ok: true, integration: 'integrated', reason: `commit is ${relation === 'identical' ? 'the tip' : 'an ancestor'} of ${AUTHORITATIVE_BRANCH}` };
  }
  if (pushedTrunk) {
    return { ok: true, integration: 'integrated', reason: `push to ${AUTHORITATIVE_BRANCH} itself` };
  }
  if (approvedSha && SHA_RE.test(approvedSha) && approvedSha === sha) {
    return {
      ok: true,
      integration: 'approved-unintegrated',
      reason: `commit is NOT on ${AUTHORITATIVE_BRANCH} (relation: ${relation}) but was explicitly approved by full SHA`,
    };
  }
  const why = relation === 'unknown'
    ? `could not establish whether the commit is on ${AUTHORITATIVE_BRANCH} (failing closed)`
    : `commit has work that is not on ${AUTHORITATIVE_BRANCH} (relation: ${relation})`;
  return {
    ok: false,
    integration: 'refused',
    reason: `${why}. Platform builds compile the trunk only. Integrate the work into ${AUTHORITATIVE_BRANCH} first, `
      + `or dispatch with approved_source_sha set to exactly ${sha} for a deliberate pre-integration candidate.`,
  };
}

async function relationViaApi({ repo, token, sha, fetchImpl }) {
  if (!repo || !token) return 'unknown';
  const f = fetchImpl || globalThis.fetch;
  if (!f) return 'unknown';
  try {
    const res = await f(`https://api.github.com/repos/${repo}/compare/${AUTHORITATIVE_BRANCH}...${sha}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) return 'unknown';
    const body = await res.json();
    return RELATIONS.includes(body.status) ? body.status : 'unknown';
  } catch {
    return 'unknown';
  }
}

function relationViaGit(sha) {
  const run = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const tip = run('rev-parse', `origin/${AUTHORITATIVE_BRANCH}`);
    if (tip === sha) return 'identical';
    try { execFileSync('git', ['merge-base', '--is-ancestor', sha, tip], { stdio: 'ignore' }); return 'behind'; } catch { /* not an ancestor */ }
    try { execFileSync('git', ['merge-base', '--is-ancestor', tip, sha], { stdio: 'ignore' }); return 'ahead'; } catch { return 'diverged'; }
  } catch {
    return 'unknown';
  }
}

async function main(argv, env) {
  const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const sha = (arg('sha') || env.GITHUB_SHA || '').toLowerCase();
  const event = env.GITHUB_EVENT_NAME || '';
  const ref = env.GITHUB_REF || '';
  let relation = arg('relation');
  if (!relation) {
    relation = env.GITHUB_TOKEN && env.GITHUB_REPOSITORY
      ? await relationViaApi({ repo: env.GITHUB_REPOSITORY, token: env.GITHUB_TOKEN, sha })
      : relationViaGit(sha);
    if (relation === 'unknown') relation = relationViaGit(sha);
  }
  const approvedSha = (env.APPROVED_SOURCE_SHA || '').trim().toLowerCase();
  const d = decide({ sha, event, ref, relation, approvedSha });
  const line = `authoritative-source: ${d.ok ? 'OK' : 'REFUSED'} · ${d.integration} · sha=${sha} · ref=${ref || '(none)'} · relation=${relation}\n  ${d.reason}`;
  if (d.ok) console.log(line); else console.error(`::error::${line.replace(/\n/g, ' ')}`);
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `integration=${d.integration}\nrelation=${relation}\n`);
  return d.ok ? 0 : 1;
}

module.exports = { decide, relationViaApi, AUTHORITATIVE_BRANCH };
if (require.main === module) {
  main(process.argv.slice(2), process.env).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
}
