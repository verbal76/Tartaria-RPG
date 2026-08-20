#!/usr/bin/env node
// ⚠⚠ OTA-1384 — PROVE THE TRUNK PRODUCES ALL FOUR PRODUCTS.
//
// The owner's concern, in his words: *"in my head collapsing all the branches
// means we won't break one. we break all of them."* Exactly right, and it is the
// reason this file exists rather than a paragraph claiming the collapse works.
//
// One codebase producing four products is only safe if "which product am I" is
// verifiable from outside the code. This renders the resolved Expo config for
// every line through EXPO'S OWN RESOLVER — not by re-reading app.config.js and
// trusting it, which would only prove the file parses — and checks:
//
//   1. every line resolves to its OWN name, channel, package and bundle id;
//   2. no two lines share any of those four (a collision means one product's
//      binary can be published to another's channel — the worst outcome here);
//   3. the product flag lands in `extra` where the app can read it;
//   4. an UNKNOWN line name fails the build instead of quietly defaulting.
//
// ⚠ WHAT THIS DOES NOT PROVE, so nobody mistakes a green run for a shipped
// build: it does not run EAS, does not compile a binary, and does not verify
// that the native or web bundlers behave. It proves the CONFIG layer. The first
// real build of each line is still a thing a human has to look at.
//
//   usage: node scripts/verify-lines.mjs
import { execFileSync } from 'node:child_process';

const EXPECTED = {
  golem: { name: 'Golem', channel: 'golem-line', id: 'com.hotatticgames.tartarprim.golem', fallenSharing: 'open' },
  hal: { name: 'Tartaria Realms HAL', channel: 'hal2001', id: 'com.hotatticgames.tartarprim.hal2001', fallenSharing: 'gated' },
  steam: { name: 'Tartaria Realms PC (Steam Dev)', channel: 'steam-dev', id: 'com.hotatticgames.tartarprim.steamdev', fallenSharing: 'open' },
  html: { name: 'Tartaria Realms (Web)', channel: 'html-dev', id: 'com.hotatticgames.tartarprim.htmldev', fallenSharing: 'open' },
};

function resolve(line) {
  const out = execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
    env: { ...process.env, TARTARIA_LINE: line },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out);
}

let failures = 0;
const fail = (m) => { console.error(`  ✗ ${m}`); failures++; };
const seen = { name: new Map(), channel: new Map(), id: new Map() };

for (const [line, want] of Object.entries(EXPECTED)) {
  let cfg;
  try {
    cfg = resolve(line);
  } catch (e) {
    fail(`${line}: config failed to resolve — ${String(e).slice(0, 160)}`);
    continue;
  }
  const got = {
    name: cfg.name,
    channel: cfg?.updates?.requestHeaders?.['expo-channel-name'],
    id: cfg?.android?.package,
    ios: cfg?.ios?.bundleIdentifier,
    fallenSharing: cfg?.extra?.fallenSharing,
    tartariaLine: cfg?.extra?.tartariaLine,
  };
  for (const k of ['name', 'channel', 'id', 'fallenSharing']) {
    if (got[k] !== want[k]) fail(`${line}.${k}: expected ${JSON.stringify(want[k])}, got ${JSON.stringify(got[k])}`);
  }
  // ⚠ iOS and Android must agree. They are one identity, and a build that ships
  // them apart is two half-products wearing one name.
  if (got.ios !== want.id) fail(`${line}.ios: expected ${want.id}, got ${got.ios}`);
  if (got.tartariaLine !== line) fail(`${line}.extra.tartariaLine: expected ${line}, got ${got.tartariaLine}`);

  // ⚠⚠ COLLISION IS THE FAILURE THAT MATTERS MOST. Two lines sharing a channel
  // means an OTA meant for one product reaches another's players.
  for (const k of ['name', 'channel', 'id']) {
    if (seen[k].has(got[k])) fail(`${k} COLLISION: ${line} and ${seen[k].get(got[k])} both use ${JSON.stringify(got[k])}`);
    seen[k].set(got[k], line);
  }
  if (failures === 0 || true) console.log(`  ${line.padEnd(6)} ${got.name} · ${got.channel} · ${got.id} · ${got.fallenSharing}`);
}

// ⚠ A typo must stop the build. Guessing publishes the wrong binary.
try {
  resolve('hal2001');
  fail('an UNKNOWN line resolved successfully — it must throw, or a typo ships the wrong product');
} catch {
  console.log('  unknown line correctly refused');
}

if (failures > 0) {
  console.error(`\n[verify-lines] FAILED — ${failures} problem${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log(`\n[verify-lines] OK — 4 lines resolve, all identities distinct, unknown refused.`);
console.log('  ⚠ This proves the CONFIG layer only. It does not run EAS or build a bundle.');
