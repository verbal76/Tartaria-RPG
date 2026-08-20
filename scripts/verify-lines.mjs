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

// ⚠ OTA-1386 — the bare id the Play / App Store listings are registered under.
const STORE_ID = 'com.hotatticgames.tartarprim';

function resolve(line, extraEnv = {}) {
  const out = execFileSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
    env: { ...process.env, TARTARIA_LINE: line, ...extraEnv },
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

// ⚠⚠ OTA-1386 — THE STORE BUILD. Play and App Store Connect know the app by the
// BARE id; every line wears a suffix so sideloads stay a separate install. A
// production build has to resolve back to the bare id or Play refuses the upload.
//
// This check exists because that strip used to be a workflow step that rewrote
// app.json, and app.config.js — which loads after it — put the suffix straight
// back. Nothing went red; the step simply stopped working. A resolved-config
// check is the only kind that would have caught that.
for (const line of Object.keys(EXPECTED)) {
  let cfg;
  try {
    cfg = resolve(line, { TARTARIA_STORE_BUILD: '1' });
  } catch (e) {
    fail(`${line} (store build): config failed to resolve — ${String(e).slice(0, 160)}`);
    continue;
  }
  if (cfg?.android?.package !== STORE_ID) {
    fail(`${line} (store build).android.package: expected ${STORE_ID}, got ${JSON.stringify(cfg?.android?.package)}`);
  }
  if (cfg?.ios?.bundleIdentifier !== STORE_ID) {
    fail(`${line} (store build).ios.bundleIdentifier: expected ${STORE_ID}, got ${JSON.stringify(cfg?.ios?.bundleIdentifier)}`);
  }
  // ⚠ …and it must change NOTHING ELSE. A store build is still one of the four
  // products; it only wears the listing's id. If the channel moved too, a store
  // release would start pulling another product's OTAs.
  const chan = cfg?.updates?.requestHeaders?.['expo-channel-name'];
  if (chan !== EXPECTED[line].channel) {
    fail(`${line} (store build).channel: a store build must not move the channel — expected ${EXPECTED[line].channel}, got ${JSON.stringify(chan)}`);
  }
  if (cfg?.extra?.fallenSharing !== EXPECTED[line].fallenSharing) {
    fail(`${line} (store build).fallenSharing: a store build must not change the product flag`);
  }
}
if (failures === 0) console.log(`  store build resolves all 4 lines to ${STORE_ID}, channels unmoved`);

if (failures > 0) {
  console.error(`\n[verify-lines] FAILED — ${failures} problem${failures === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log(`\n[verify-lines] OK — 4 lines resolve, all identities distinct, unknown refused.`);
console.log('  ⚠ This proves the CONFIG layer only. It does not run EAS or build a bundle.');
