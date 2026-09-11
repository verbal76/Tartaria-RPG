#!/usr/bin/env node
/**
 * ⚠⚠⚠ THE FOUR SHARDS COVER THE WHOLE REQUIRED SURFACE, EXACTLY ONCE.
 *
 * Sharding is an execution change, never a membership change. The danger it
 * introduces is not a slow gate — it is a QUIET one: a suite that lands on no
 * shard still reports green, and nobody learns it stopped running. The two live
 * OTA regression suites that sat red and unwatched for two hundred OTAs
 * (scripts/heavy-suites.mjs) are the same failure in an older costume.
 *
 * So, every run, before any shard is trusted:
 *
 *     union(shard 1..4)  ==  live `jest --listTests` discovery
 *     shard i ∩ shard j  ==  ∅          for every pair
 *     no shard resolves zero suites
 *
 * LIVE DISCOVERY IS THE AUTHORITY. scripts/suite-weights.json is consulted only
 * to balance the deal; it can never add a suite (a stale entry for a deleted
 * file is ignored) and can never remove one (an unweighted live suite takes the
 * fallback weight and is dealt like any other). This gate proves both directions
 * rather than trusting the claim.
 *
 * It also reports the balance and the stale/unweighted counts, because a gate
 * that only speaks when it is angry teaches nobody what it is guarding — the
 * same rule check:testsplit follows.
 *
 * ⚠ Runs inside the required `gates` job, so it is itself gated by Change A's
 * receipt: if this cannot pass, nothing publishes.
 */
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { discover, loadWeights, assignShards, reconcile, SHARD_COUNT } = require(join(root, 'scripts', 'shard-suites.cjs'));

const suites = discover();
const weights = loadWeights();
const { shards, weight, fallback, unweighted } = assignShards(suites, weights);
const fail = reconcile(suites, shards);

const total = weight.reduce((a, b) => a + b, 0);
const slowest = Math.max(...weight);
const imbalance = slowest ? (100 * (slowest - Math.min(...weight))) / slowest : 0;

console.log(`[check:shardcoverage] live discovery ${suites.length} required suite(s) · ${SHARD_COUNT} shards · ~${(total / 1000).toFixed(0)}s total`);
shards.forEach((s, i) =>
  console.log(`  shard ${i + 1}/${SHARD_COUNT}: ${String(s.length).padStart(4)} suites · ~${(weight[i] / 1000).toFixed(0)}s`));
console.log(`[check:shardcoverage] estimated slowest ${(slowest / 1000).toFixed(0)}s · imbalance ${imbalance.toFixed(1)}%`);

const stale = Object.keys(weights).filter((p) => !suites.includes(p));
console.log(`[check:shardcoverage] weights: ${Object.keys(weights).length} known · ${unweighted.length} live suite(s) on the ${fallback}ms fallback · ${stale.length} stale entr(ies) ignored`);
if (!Object.keys(weights).length) {
  console.log('[check:shardcoverage] NOTE — no usable weight data; every suite took the fallback. Coverage is unaffected; balance is not.');
}

if (fail.length) {
  console.error('[check:shardcoverage] FAIL');
  for (const f of fail) console.error('  · ' + f);
  process.exit(1);
}
console.log('[check:shardcoverage] OK — every required suite is on exactly one shard, and no shard is empty.');
