#!/usr/bin/env node
/**
 * ⚠⚠⚠ FOUR SHARDS, ONE SURFACE. The required Jest surface is not reduced here —
 * it is DEALT OUT. Every suite jest discovers runs exactly once, on exactly one
 * of four runners, and publication waits for all four.
 *
 * ⚠⚠ LIVE DISCOVERY IS THE CORRECTNESS AUTHORITY. The suite set comes from
 * `jest --listTests` with the SAME arguments as the canonical `test:ci:fast`
 * (plus, locally, the untracked scratchpad exclusion — CI has no scratchpad).
 * scripts/suite-weights.json is a SCHEDULING HINT and nothing else:
 *
 *   • a live suite with no weight still runs — it gets FALLBACK_WEIGHT;
 *   • a weight for a file that no longer exists is ignored — a stale entry can
 *     never resurrect a deleted suite, because nothing is ever read from the
 *     weight file's key set;
 *   • a renamed suite is simply a new path: discovery finds it, the old weight
 *     is ignored, the new one falls back;
 *   • malformed or missing weight data degrades to "every suite weighs the
 *     fallback" — worse balance, identical coverage.
 *
 * The rule, in one line: WEIGHTS DECIDE ORDER, DISCOVERY DECIDES MEMBERSHIP.
 *
 * ⚠ FALLBACK_WEIGHT IS THE MEAN, NOT THE MEDIAN, and that is deliberate. The
 * median required suite is ~160ms and the mean ~1290ms, because a handful of
 * long simulations carry a third of the time. An unknown suite is most likely
 * small — but if it is large, under-weighting it would deal it LAST, onto the
 * lightest shard, right when it matters most. The mean is the defensive guess:
 * it costs a little balance when wrong in the cheap direction and protects the
 * schedule when wrong in the expensive one.
 *
 * ⚠⚠ DETERMINISTIC LPT (Longest Processing Time). Sort descending by weight,
 * ties broken by path, then repeatedly hand the next suite to the lightest
 * shard, ties broken by lowest shard index. No randomness, no seed, no clock,
 * no filesystem order: the same discovery plus the same weights always produce
 * the same four manifests, on any machine. LPT is also why k=4 was chosen —
 * `ota1686TheContraryWalker` alone is ~140s, so no shard can finish faster
 * than that and a fifth runner buys nothing.
 *
 * ⚠⚠⚠ THE CANONICAL UNSHARDED SURFACE IS UNTOUCHED. `npm run test:ci:fast`
 * still runs all 1,295 suites in one process. It is the authority this file is
 * measured against, the rollback if sharding ever misbehaves, and the way a
 * developer or an auditor runs the real gate. Sharding changes the execution
 * topology, never the membership.
 *
 * .cjs like its siblings: the suite ciShardsCoverTheWholeSurface drives these
 * functions directly, and jest's transform covers `\.[jt]sx?$`, not `.mjs`.
 */
'use strict';
const { readFileSync, existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join, dirname } = require('node:path');

const ROOT = join(dirname(__filename), '..');
const WEIGHTS_PATH = join(ROOT, 'scripts', 'suite-weights.json');
const SHARD_COUNT = 4;

/** Read the scheduling hints. Any failure degrades to "no hints", never to an error. */
function loadWeights(path = WEIGHTS_PATH) {
  try {
    if (!existsSync(path)) return {};
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    const w = doc && typeof doc === 'object' && doc.weights && typeof doc.weights === 'object' && !Array.isArray(doc.weights)
      ? doc.weights
      : null;
    if (!w) return {};
    const clean = {};
    for (const [k, v] of Object.entries(w)) {
      if (typeof k === 'string' && k && typeof v === 'number' && Number.isFinite(v) && v >= 0) clean[k] = v;
    }
    return clean;
  } catch {
    return {}; // malformed data is a missing hint, not a broken gate
  }
}

/** A weight is usable only if it is a finite, non-negative number. */
function usable(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0; }

/**
 * The fallback every unweighted suite gets: the mean of the USABLE weights.
 * ⚠ Only usable values feed the mean. `loadWeights` already filters, but this
 * is called directly too, and a single NaN in the average would make every
 * comparison below false — which silently piles the whole surface onto shard 1
 * and leaves three shards empty. Coverage would survive (the reconciler catches
 * an empty shard) but it must not depend on that catch.
 */
function fallbackWeight(weights) {
  const vals = Object.values(weights || {}).filter(usable);
  if (!vals.length) return 1;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Deterministic four-way LPT.
 * @param {string[]} suites  live-discovered paths — the membership authority
 * @param {Record<string,number>} weights  scheduling hints
 * @param {number} k
 * @returns {{ shards: string[][], weight: number[], fallback: number, unweighted: string[] }}
 */
function assignShards(suites, weights = {}, k = SHARD_COUNT) {
  const fb = fallbackWeight(weights);
  const unweighted = [];
  const rows = suites.map((p) => {
    // ⚠ "Known" means a USABLE weight, not merely a present key. A string, a
    // NaN or a negative would poison every `<` comparison below and deal the
    // whole surface onto one shard; an unusable hint is simply no hint.
    const known = Object.prototype.hasOwnProperty.call(weights, p) && usable(weights[p]);
    if (!known) unweighted.push(p);
    return { path: p, ms: known ? weights[p] : fb };
  });

  // Deterministic order: heaviest first; identical weights fall back to path.
  rows.sort((a, b) => (b.ms - a.ms) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const shards = Array.from({ length: k }, () => []);
  const weight = new Array(k).fill(0);
  for (const r of rows) {
    // Lightest shard wins. Ties break on SUITE COUNT, then on index — never on
    // randomness or arrival order.
    //
    // ⚠ The count tie-break is not cosmetic. Weight alone degenerates when every
    // weight is equal AND zero: adding 0 never changes a total, so shard 1 stays
    // "lightest" forever and takes the entire surface. That is a real deal the
    // reconciler would then reject for three empty shards — correct, but a gate
    // that fails is not the same as a gate that works. With the count tie-break
    // an all-equal surface deals round-robin, which is also the right answer
    // when the hints say nothing useful.
    let pick = 0;
    for (let i = 1; i < k; i += 1) {
      if (weight[i] < weight[pick] || (weight[i] === weight[pick] && shards[i].length < shards[pick].length)) pick = i;
    }
    shards[pick].push(r.path);
    weight[pick] += r.ms;
  }
  // Each manifest is emitted in path order so a diff of two runs is readable.
  for (const s of shards) s.sort();
  return { shards, weight, fallback: fb, unweighted };
}

/**
 * THE RECONCILIATION. Union must equal live discovery exactly; no suite may
 * appear twice; no shard may be empty. Returns [] when the deal is sound.
 */
function reconcile(suites, shards) {
  const fail = [];
  const live = new Set(suites);
  if (live.size !== suites.length) fail.push(`live discovery returned ${suites.length - live.size} duplicate path(s)`);

  const seen = new Set();
  const dupes = [];
  for (const s of shards) for (const p of s) { if (seen.has(p)) dupes.push(p); seen.add(p); }
  if (dupes.length) fail.push(`${dupes.length} suite(s) assigned to more than one shard: ${[...new Set(dupes)].slice(0, 3).join(', ')}`);

  const missing = suites.filter((p) => !seen.has(p));
  if (missing.length) fail.push(`${missing.length} live suite(s) in NO shard: ${missing.slice(0, 3).join(', ')}`);

  const phantom = [...seen].filter((p) => !live.has(p));
  if (phantom.length) fail.push(`${phantom.length} assigned suite(s) not live: ${phantom.slice(0, 3).join(', ')}`);

  shards.forEach((s, i) => { if (s.length === 0) fail.push(`shard ${i + 1}/${shards.length} resolved ZERO suites — configuration drift, not success`); });

  return fail;
}

/** The heavy exclusion pattern, from the one list that owns it. */
function heavyPattern() {
  return execFileSync('node', [join(ROOT, 'scripts', 'heavy-suites.mjs'), '--pattern'], { encoding: 'utf8' }).trim();
}

/**
 * LIVE DISCOVERY — the same jest arguments as canonical `test:ci:fast`.
 * `/scratchpad/` is excluded because a developer's untracked probe files are
 * discoverable locally and do not exist in CI; excluding them makes the local
 * answer equal the CI answer.
 */
function discover() {
  const out = execFileSync(
    join(ROOT, 'node_modules', '.bin', 'jest'),
    ['--ci', '--testPathIgnorePatterns', '/node_modules/', heavyPattern(), '/scratchpad/', '--listTests'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split('\n').map((l) => l.trim()).filter(Boolean).map((p) => p.replace(`${ROOT}/`, '')).sort();
}

// ── CLI ──────────────────────────────────────────────────────────────────
//   node scripts/shard-suites.cjs --shard 3        → shard 3's paths, one per line
//   node scripts/shard-suites.cjs --verify         → reconciliation + balance report
function cli(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) { opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true; i += argv[i + 1] && !argv[i + 1].startsWith('--') ? 1 : 0; }

  const suites = discover();
  const weights = loadWeights();
  const { shards, weight, fallback, unweighted } = assignShards(suites, weights);
  const fail = reconcile(suites, shards);

  if (opt.verify) {
    console.log(`[shard-suites] live discovery: ${suites.length} required suite(s) · ${SHARD_COUNT} shards`);
    shards.forEach((s, i) => console.log(`  shard ${i + 1}/${SHARD_COUNT}: ${String(s.length).padStart(4)} suites · ~${(weight[i] / 1000).toFixed(0)}s estimated`));
    const spread = Math.max(...weight) - Math.min(...weight);
    console.log(`[shard-suites] estimated slowest ${(Math.max(...weight) / 1000).toFixed(0)}s · imbalance ${(100 * spread / Math.max(...weight)).toFixed(1)}%`);
    console.log(`[shard-suites] weights: ${Object.keys(weights).length} known · ${unweighted.length} live suite(s) used the ${fallback}ms fallback${unweighted.length ? ` (${unweighted.slice(0, 3).join(', ')}${unweighted.length > 3 ? ', …' : ''})` : ''}`);
    const stale = Object.keys(weights).filter((p) => !suites.includes(p)).length;
    if (stale) console.log(`[shard-suites] ${stale} stale weight entr(ies) ignored — a weight cannot resurrect a suite`);
    if (fail.length) {
      console.error('[shard-suites] RECONCILIATION FAILED');
      for (const f of fail) console.error('  · ' + f);
      return 1;
    }
    console.log('[shard-suites] OK — union == live discovery, no suite twice, no empty shard.');
    return 0;
  }

  const n = Number(opt.run ?? opt.shard);
  if (!Number.isInteger(n) || n < 1 || n > SHARD_COUNT) {
    console.error(`[shard-suites] shard must be 1..${SHARD_COUNT} (got ${JSON.stringify(opt.run ?? opt.shard)}); use --shard N, --run N, or --verify`);
    return 2;
  }
  // ⚠⚠ A SHARD NEVER RUNS AGAINST AN UNRECONCILED DEAL. If discovery and the
  // manifests disagree — a suite in none of them, a suite in two, an empty
  // shard — refuse loudly rather than quietly execute a subset and report
  // green. This is the same fail-closed instinct as Change A's receipt.
  if (fail.length) {
    console.error('::error::[shard-suites] refusing to run — reconciliation failed:');
    for (const f of fail) console.error('  · ' + f);
    return 1;
  }

  const mine = shards[n - 1];
  if (!opt.run) { process.stdout.write(mine.join('\n') + '\n'); return 0; }

  console.log(`[shard-suites] shard ${n}/${SHARD_COUNT}: ${mine.length} of ${suites.length} required suites · ~${(weight[n - 1] / 1000).toFixed(0)}s estimated`);
  const extra = argv.filter((a) => a.startsWith('--') && !/^--(run|shard|verify)$/.test(a));
  const r = require('node:child_process').spawnSync(
    join(ROOT, 'node_modules', '.bin', 'jest'),
    ['--ci', '--runTestsByPath', ...mine, '--reporters=default', ...extra],
    { cwd: ROOT, stdio: 'inherit' },
  );
  return r.status === null ? 1 : r.status;
}

module.exports = { assignShards, reconcile, loadWeights, fallbackWeight, discover, heavyPattern, SHARD_COUNT, WEIGHTS_PATH };

if (require.main === module) process.exit(cli(process.argv.slice(2)));
