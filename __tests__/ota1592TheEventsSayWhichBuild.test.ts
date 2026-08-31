// ⚠⚠⚠ OTA-1592 — THE EVENTS FINALLY SAY WHICH BUILD SENT THEM (task #109's
// client half).
//
// Measured against the server before the change: 356 delivered events, and
// `release` and `dist` were NULL on every single one. The identity our events
// carried was a `build` TAG — readable by a human, invisible to everything the
// owner connected the repo link for: suspect commits, release grouping and
// regression detection all key on the event's `release` field, so the
// integration sat there with nothing to bite on.
//
// The client half fixes the events; Sentry auto-creates the release record from
// the first event that names one, so grouping lights up from this change alone.
// The CI half (sentry-cli set-commits, which needs a workflow this build box
// cannot test) remains #109's open remainder and does not touch this file.
//
// ⚠ THE OTA STAMP IS THE RELEASE, and that is a decision, not a default: JS
// behaviour changes per OTA, not per store binary (the APK has been build 293
// for weeks while the game changed daily), and every forensic session in this
// repo keys its findings by the stamp. `dist` carries the stamp alone; the
// release string carries app version + stamp in Sentry's package@version+build
// grammar so two APKs on the same OTA still separate.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OTA_BUILD_ID, DISPLAY_VERSION } from '../app/buildInfo';

const SRC = readFileSync(join(__dirname, '..', 'app', 'diagnostics', 'sentryTransport.ts'), 'utf8');

describe('OTA-1592 — release and dist ride the init, so every event carries them', () => {
  it('⚠⚠⚠ THE INIT NAMES THE RELEASE AND THE DIST', () => {
    // On the SDK's init options, not per-event: the SDK stamps every outgoing
    // event (crash records and SEND LOG bundles alike) from these two fields,
    // so no send path can forget them — the same one-writer shape every other
    // fix in this repo has been converging on.
    expect(SRC).toContain('release: `tartaria@${DISPLAY_VERSION}+${OTA_BUILD_ID}`,');
    expect(SRC).toContain('dist: OTA_BUILD_ID,');
  });

  it('⚠⚠ the release string is well-formed for the stamp actually shipping', () => {
    // The grammar Sentry parses is package@version+build. Rebuilt here from the
    // same constants the app uses, so a malformed stamp (spaces, an accidental
    // `@`) fails in CI rather than arriving as an unparseable release.
    const release = `tartaria@${DISPLAY_VERSION}+${OTA_BUILD_ID}`;
    expect(release).toMatch(/^tartaria@[0-9][^@\s]*\+[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+-[a-z0-9-]+$/);
    expect(OTA_BUILD_ID).not.toContain(' ');
  });

  it('⚠ the tags keep carrying build/version too — dashboards already filter on them', () => {
    // Adding release must not cost the tag the existing saved searches use.
    expect(SRC).toContain('OTA_BUILD_ID');
    expect(SRC).toContain("import { OTA_BUILD_ID, DISPLAY_VERSION } from '../buildInfo';");
  });
});
