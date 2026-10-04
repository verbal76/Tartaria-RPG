#!/usr/bin/env node
// One-shot: bring an EXISTING release under the public naming convention
// (docs/RELEASE-NAMING.md) without rebuilding anything.
//
//   node scripts/release-retitle.cjs --tag golem-apk-478 --kind apk            # dry run (default)
//   node scripts/release-retitle.cjs --tag golem-apk-478 --kind apk --apply    # do it
//
// What it changes, and what it deliberately does not:
//   • renames the attached file IN PLACE (same binary, same SHA-256) to
//     Tartaria-Realms-v<N>.<ext>  — GitHub's web UI cannot rename an attachment
//   • retitles the release "Tartaria Realms v<N>" and marks it Latest
//   • puts the install file at the TOP of the notes and keeps every old line
//     VERBATIM underneath, plus the provenance the title no longer carries
//   • never touches the git tag, the target commit or the binary
//   • refuses if "Tartaria Realms v<N>" already belongs to a different commit
// Needs the `gh` CLI, authenticated with permission to edit releases.
'use strict';
const { execFileSync } = require('child_process');
const naming = require('./release-naming.cjs');

const REPO = 'verbal76/Tartaria-RPG';
const PKG = { golem: 'com.hotatticgames.tartarprim.golem', hal: 'com.hotatticgames.tartarprim.hal2001', store: 'com.hotatticgames.tartarprim' };

/** Pure: everything this tool would write, from the release as GitHub returns it. */
function plan(release, kind, pv, fullSha) {
  const asset = release.assets[0];
  if (!asset) throw new Error(`release ${release.tag_name} has no attached file`);
  const newAsset = naming.assetName(pv, kind);
  const title = naming.title(pv);
  const body = release.body || '';
  const line = (body.match(/line:\s*([a-z]+)/i) || [])[1] || 'unknown';
  const build = (release.tag_name.match(/(\d+)$/) || [])[1] || '?';
  const pkg = kind === 'aab' ? PKG.store : PKG[line] || 'unknown';
  const already = body.startsWith(`# ${title}`);
  const sha256 = String(asset.digest || '').replace(/^sha256:/, '');
  const head = naming.notesHead(pv, kind, newAsset);
  const prov = [
    '', '---', '### Technical provenance (engineering metadata — not the version)',
    `Public version: ${title}`,
    `Source commit: ${fullSha}`,
    `Android versionCode / Build #: ${build}`,
    `Git tag: ${release.tag_name}`,
    `Product line: ${line}`,
    `Package id: ${pkg}`,
    `Previous title: ${release.name}`,
    `Previous filename: ${asset.name}`,
    `SHA-256 of ${newAsset} (unchanged by the rename): ${sha256}`,
    `Workflow: build-apk.yml, run #${build}`,
    '', '### Original release notes (verbatim)', '', body, '',
  ].join('\n');
  return { assetId: asset.id, oldAsset: asset.name, newAsset, title, body: already ? body : `${head}${prov}`, alreadyDone: already && asset.name === newAsset && release.name === title };
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024 });
}

function main(argv) {
  const arg = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  const tag = arg('tag'); const kind = arg('kind') || 'apk'; const apply = argv.includes('--apply');
  if (!tag) throw new Error('usage: release-retitle.cjs --tag <git tag> [--kind apk|aab|windows] [--apply]');
  const pv = naming.readPublicVersion();
  const release = JSON.parse(gh(['api', `repos/${REPO}/releases/tags/${tag}`]));
  const fullSha = JSON.parse(gh(['api', `repos/${REPO}/git/ref/tags/${tag}`])).object.sha;
  const all = JSON.parse('[' + gh(['api', `repos/${REPO}/releases?per_page=100`, '--paginate']).replace(/\]\s*\[/g, ',').replace(/^\[|\]$/g, '') + ']');
  const g = naming.guard(all.filter((r) => r.tag_name !== tag), pv, fullSha);
  if (!g.ok) throw new Error(g.reason);
  const p = plan(release, kind, pv, fullSha);
  console.log(`release : ${release.name}  ->  ${p.title}`);
  console.log(`file    : ${p.oldAsset}  ->  ${p.newAsset}   (same binary; sha256 ${String(release.assets[0].digest)})`);
  console.log(`tag/sha : ${tag} @ ${fullSha}  (untouched)`);
  if (p.alreadyDone) { console.log('already converted — nothing to do'); return 0; }
  if (!apply) { console.log('\nDRY RUN — nothing changed. Add --apply to do it.\n\n--- new notes ---\n' + p.body); return 0; }
  gh(['api', '-X', 'PATCH', `repos/${REPO}/releases/assets/${p.assetId}`, '-f', `name=${p.newAsset}`]);
  gh(['api', '-X', 'PATCH', `repos/${REPO}/releases/${release.id}`, '-f', `name=${p.title}`, '-f', `body=${p.body}`, '-f', 'make_latest=true']);
  console.log('done. Latest release is now:', p.title);
  return 0;
}

module.exports = { plan };
if (require.main === module) { try { process.exit(main(process.argv.slice(2))); } catch (e) { console.error(`error: ${e.message}`); process.exit(1); } }
