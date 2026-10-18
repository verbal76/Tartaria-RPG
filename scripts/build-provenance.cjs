#!/usr/bin/env node
/**
 * ⚠⚠ SINGLE SOURCE OF TRUTH — EVERY BUILD CARRIES ITS OWN BIRTH CERTIFICATE.
 *
 * Writes `build-provenance.json`: exactly which commit a platform build
 * compiled, from what ref, under what product line and profile, with which
 * versions and toolchain. Uploaded next to the artifact by every build workflow
 * so "which source is this binary?" is answerable from the artifact alone, and
 * so a coordinated multiplatform release can be checked for SHA parity
 * (scripts/release-manifest.cjs).
 *
 * It only READS the checkout and the runner. It does not change app code, save
 * formats, the OTA stamp, the public release name or any published channel.
 *
 * Usage: node scripts/build-provenance.cjs --platform android --out build-provenance.json
 *          [--profile preview] [--line golem] [--integration integrated] [--artifact name]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

function tryRun(cmd, args) {
  // `java -version` writes to stderr, so take whichever stream spoke.
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000, shell: process.platform === 'win32' });
  if (r.error || r.status !== 0) return null;
  const lines = `${r.stdout || ''}\n${r.stderr || ''}`.split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('Picked up '));   // JAVA_TOOL_OPTIONS noise can carry proxy settings — never record it
  return lines[0] || null;
}
function readJson(rel) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return null; } }

// The live (non-commented) stamp declarations in app/buildInfo.ts.
function readBuildInfo(src) {
  const pick = (name) => { const m = src.match(new RegExp(`^export const ${name}\\s*=\\s*'([^']*)'`, 'm')); return m ? m[1] : null; };
  return { displayVersion: pick('DISPLAY_VERSION'), otaBuildId: pick('OTA_BUILD_ID') };
}

function buildProvenance({ env, args, now = new Date(), readers = {} }) {
  const rj = readers.json || readJson;
  const buildInfoSrc = readers.buildInfo ? readers.buildInfo() : (() => { try { return fs.readFileSync(path.join(ROOT, 'app/buildInfo.ts'), 'utf8'); } catch { return ''; } })();
  const info = readBuildInfo(buildInfoSrc);
  const appJson = (rj('app.json') || {}).expo || {};
  const pub = rj('release/public-version.json') || {};
  const run = readers.run || tryRun;
  const sha = (args.sha || env.GITHUB_SHA || run('git', ['rev-parse', 'HEAD']) || '').toLowerCase();
  return {
    schema: 1,
    product: 'Tartaria Realms',
    source: {
      repository: env.GITHUB_REPOSITORY || null,
      sha,
      ref: env.GITHUB_REF || null,
      refType: env.GITHUB_REF_TYPE || null,
      refName: env.GITHUB_REF_NAME || null,
      authoritativeBranch: 'golem-line',
      // integrated = on the trunk · approved-unintegrated = explicit pre-integration candidate · unverified = guard did not run
      integration: args.integration || env.SOURCE_INTEGRATION || 'unverified',
    },
    target: {
      platform: args.platform || null,
      line: args.line || env.TARTARIA_LINE || null,
      profile: args.profile || null,
      artifact: args.artifact || null,
    },
    versions: {
      appVersion: appJson.version || null,
      displayVersion: info.displayVersion,
      otaBuildId: info.otaBuildId,
      runtimeVersion: appJson.runtimeVersion || null,
      publicVersion: pub.version != null ? pub.version : null,
    },
    builtAt: now.toISOString(),
    ci: {
      workflow: env.GITHUB_WORKFLOW || null,
      event: env.GITHUB_EVENT_NAME || null,
      runId: env.GITHUB_RUN_ID || null,
      runAttempt: env.GITHUB_RUN_ATTEMPT || null,
      runnerOs: env.RUNNER_OS || null,
      runnerImage: env.ImageOS ? `${env.ImageOS}@${env.ImageVersion || '?'}` : null,
    },
    toolchain: {
      node: process.version,
      npm: run('npm', ['--version']),
      java: run('java', ['-version']),
      expoCli: run('npx', ['--no-install', 'expo', '--version']),
    },
  };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
  return out;
}

module.exports = { buildProvenance, readBuildInfo };
if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const p = buildProvenance({ env: process.env, args });
  const out = args.out || 'build-provenance.json';
  fs.writeFileSync(out, JSON.stringify(p, null, 2) + '\n');
  console.log(`build-provenance: ${p.target.platform || '?'} · ${p.source.sha} · ${p.source.integration} → ${out}`);
  if (!/^[0-9a-f]{40}$/.test(p.source.sha)) { console.error('::error::build-provenance: no full source SHA could be determined'); process.exit(1); }
}
