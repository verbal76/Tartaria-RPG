#!/usr/bin/env node
/**
 * ⚠⚠ SINGLE SOURCE OF TRUTH — A COORDINATED RELEASE IS ONE SHA.
 *
 * Reads the `build-provenance.json` of every platform build in a release and
 *   • verifies they all compiled the SAME commit (and, by default, the same
 *     display version + OTA stamp, and that none is an unintegrated candidate);
 *   • emits a release manifest listing each build.
 *
 * Offline and free: it reads files the build jobs already produced. It publishes
 * nothing. Wire it into a release job (or run it by hand) after downloading the
 * provenance artifacts.
 *
 * Usage: node scripts/release-manifest.cjs [--allow-unintegrated] [--emit release-manifest.json] <provenance.json>...
 */
'use strict';
const fs = require('node:fs');

function verifyParity(list, { allowUnintegrated = false } = {}) {
  const errors = [];
  if (list.length === 0) errors.push('no build provenance supplied');
  const ref = list[0];
  for (const p of list) {
    const tag = `${p.target && p.target.platform || '?'}/${p.target && p.target.line || '?'}`;
    if (!p.source || !/^[0-9a-f]{40}$/.test(p.source.sha || '')) { errors.push(`${tag}: no full source SHA`); continue; }
    if (ref.source && p.source.sha !== ref.source.sha) errors.push(`${tag}: built ${p.source.sha}, expected ${ref.source.sha} (SHA parity broken)`);
    if (ref.versions && p.versions.displayVersion !== ref.versions.displayVersion) errors.push(`${tag}: displayVersion ${p.versions.displayVersion} != ${ref.versions.displayVersion}`);
    if (ref.versions && p.versions.otaBuildId !== ref.versions.otaBuildId) errors.push(`${tag}: otaBuildId ${p.versions.otaBuildId} != ${ref.versions.otaBuildId}`);
    if (!allowUnintegrated && p.source.integration !== 'integrated') errors.push(`${tag}: integration is "${p.source.integration}", not "integrated"`);
  }
  return errors;
}

function buildManifest(list) {
  const first = list[0];
  return {
    schema: 1,
    product: 'Tartaria Realms',
    sha: first.source.sha,
    authoritativeBranch: first.source.authoritativeBranch,
    versions: first.versions,
    builds: list.map((p) => ({
      platform: p.target.platform, line: p.target.line, profile: p.target.profile, artifact: p.target.artifact,
      integration: p.source.integration, builtAt: p.builtAt, runId: p.ci && p.ci.runId, workflow: p.ci && p.ci.workflow,
    })),
  };
}

module.exports = { verifyParity, buildManifest };
if (require.main === module) {
  const argv = process.argv.slice(2);
  const files = []; let emit = null; let allowUnintegrated = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--emit') emit = argv[++i];
    else if (argv[i] === '--allow-unintegrated') allowUnintegrated = true;
    else files.push(argv[i]);
  }
  const list = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const errors = verifyParity(list, { allowUnintegrated });
  if (errors.length) { for (const e of errors) console.error(`release-manifest: ✗ ${e}`); process.exit(1); }
  const m = buildManifest(list);
  if (emit) fs.writeFileSync(emit, JSON.stringify(m, null, 2) + '\n');
  console.log(`release-manifest: ${list.length} build(s), one SHA ${m.sha}`);
}
