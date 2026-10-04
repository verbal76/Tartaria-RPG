#!/usr/bin/env node
// The public release name — ONE place, so a release title, an artifact filename and
// the release notes can never disagree about which build is which.
//
//   Tartaria Realms v283            (release title)
//   Tartaria-Realms-v283.apk        (Android)   .aab (Play bundle)
//   Tartaria-Realms-v283-Windows.exe
//
// The number lives in release/public-version.json and is the ONLY public version.
// Git SHA, Android versionCode, OTA id, DISPLAY_VERSION, runtimeVersion, channel and
// the git tag are engineering metadata: they go in the release NOTES and in
// diagnostics, never in the title or filename. See docs/RELEASE-NAMING.md.
//
// CLI (used by .github/workflows):
//   node scripts/release-naming.cjs resolve --kind apk|aab|windows      → key=value lines
//   node scripts/release-naming.cjs guard   --kind K --sha SHA --releases releases.json
//        exit 0 + "existing_tag=<tag>" (same version, same commit: attach to it)
//        exit 0 + "existing_tag="      (version unused: create the release)
//        exit 1                        (version already delivered from a DIFFERENT commit:
//                                       bump release/public-version.json)
'use strict';

const fs = require('fs');
const path = require('path');

const VERSION_FILE = path.join(__dirname, '..', 'release', 'public-version.json');
const EXT = { apk: 'apk', aab: 'aab', windows: 'exe' };

function readPublicVersion(file = VERSION_FILE) {
  const pv = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof pv.product !== 'string' || !pv.product.trim()) throw new Error('release/public-version.json: "product" must be a non-empty string');
  if (typeof pv.fileStem !== 'string' || !/^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(pv.fileStem)) throw new Error('release/public-version.json: "fileStem" must be Hyphen-Separated-Words (letters/digits)');
  if (!Number.isInteger(pv.version) || pv.version < 1) throw new Error('release/public-version.json: "version" must be a positive integer (v1, v2, v3 ...) — never semver, never a codename');
  return pv;
}

const title = (pv) => `${pv.product} v${pv.version}`;

function assetName(pv, kind) {
  if (!EXT[kind]) throw new Error(`unknown artifact kind "${kind}" (expected apk | aab | windows)`);
  const suffix = kind === 'windows' ? '-Windows' : '';
  return `${pv.fileStem}-v${pv.version}${suffix}.${EXT[kind]}`;
}

/** The top of the release notes: the title, then the file to install, before any
 *  technical detail. */
function notesHead(pv, kind, fileName) {
  const platform = { apk: 'Android', aab: 'Android (Play Store bundle — upload to Google Play Console)', windows: 'Windows' }[kind];
  return `# ${title(pv)}\n\n${platform}:\n${fileName}\n`;
}

/** Decide what to do with this version number given the existing releases.
 *  A version number identifies ONE delivered build state: it may gain more
 *  artifacts of the same commit (APK + AAB, Android + Windows) but may never be
 *  reused for a different commit. */
function guard(releases, pv, sha) {
  const t = title(pv);
  const same = (releases || []).filter((r) => r && r.name === t && !r.draft);
  const sameCommit = (r) => {
    const c = String(r.target_commitish || '');
    return c.length >= 7 && (sha.startsWith(c) || c.startsWith(sha));
  };
  const foreign = same.filter((r) => !sameCommit(r));
  if (foreign.length) {
    return {
      ok: false,
      existingTag: '',
      reason: `"${t}" was already delivered from a different commit (${foreign.map((r) => `${r.tag_name}@${String(r.target_commitish).slice(0, 8)}`).join(', ')}). ` +
        `A public version identifies exactly one build — bump "version" in release/public-version.json to ${pv.version + 1}.`,
    };
  }
  // Only a normal release can be extended with another artifact; the PC builds are
  // prereleases on their own rolling tags and are never an attach target.
  const mine = same.find((r) => sameCommit(r) && !r.prerelease);
  return { ok: true, existingTag: mine ? mine.tag_name : '', reason: '' };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const arg = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  const pv = readPublicVersion();
  if (cmd === 'resolve') {
    const kind = arg('kind');
    const file = assetName(pv, kind);
    process.stdout.write([`product=${pv.product}`, `version=${pv.version}`, `title=${title(pv)}`, `asset_name=${file}`].join('\n') + '\n');
    return 0;
  }
  if (cmd === 'guard') {
    const sha = arg('sha');
    const rf = arg('releases');
    if (!sha || !rf) throw new Error('guard needs --sha and --releases');
    const raw = fs.readFileSync(rf, 'utf8');
    // `gh api --paginate` concatenates JSON arrays; read them all.
    const dec = []; let i = 0;
    while (i < raw.length) {
      while (i < raw.length && /\s/.test(raw[i])) i++;
      if (i >= raw.length) break;
      let depth = 0, j = i, inStr = false, esc = false;
      for (; j < raw.length; j++) {
        const c = raw[j];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true; else if (c === '[' || c === '{') depth++; else if (c === ']' || c === '}') { depth--; if (depth === 0) { j++; break; } }
      }
      const v = JSON.parse(raw.slice(i, j));
      dec.push(...(Array.isArray(v) ? v : [v]));
      i = j;
    }
    const g = guard(dec, pv, sha);
    if (!g.ok) { process.stderr.write(`::error::${g.reason}\n`); return 1; }
    process.stdout.write(`existing_tag=${g.existingTag}\n`);
    return 0;
  }
  throw new Error('usage: release-naming.cjs resolve --kind K | guard --kind K --sha SHA --releases FILE');
}

module.exports = { readPublicVersion, title, assetName, notesHead, guard, VERSION_FILE };
if (require.main === module) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { process.stderr.write(`::error::${e.message}\n`); process.exit(2); }
}
